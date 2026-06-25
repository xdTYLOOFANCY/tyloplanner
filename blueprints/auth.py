"""
Auth blueprint — login, logout, TOTP 2FA, and the before_request guard.
"""
import io
import hmac
import time
from collections import defaultdict

import pyotp
import qrcode
from flask import Blueprint, request, jsonify, redirect, Response, session, current_app

import helpers
from helpers import feed_key, totp_enabled, kv_get, kv_set, kv_del

bp = Blueprint("auth", __name__)

# In-memory rate limiting for failed logins (prevents thread-blocking DoS)
failed_attempts = defaultdict(list)

def check_rate_limit(ip):
    now = time.time()
    failed_attempts[ip] = [t for t in failed_attempts[ip] if now - t < 60]
    return len(failed_attempts[ip]) >= 5

def record_failed(ip):
    failed_attempts[ip].append(time.time())

# Files the login page / PWA need before sign-in:
LOGIN_ASSETS = {"/login", "/login/2fa", "/style.css", "/logo.svg", "/favicon.ico",
                "/manifest.json", "/sw.js", "/icon-192.png", "/icon-512.png", "/js/login.js"}


def parse_user_agent(ua_string):
    if not ua_string:
        return "Unknown Device"
    
    # OS
    os_name = "Unknown OS"
    if "Windows" in ua_string:
        os_name = "Windows"
    elif "Macintosh" in ua_string or "Mac OS X" in ua_string:
        if "iPhone" in ua_string or "iPad" in ua_string or "iPod" in ua_string:
            os_name = "iOS"
        else:
            os_name = "macOS"
    elif "Android" in ua_string:
        os_name = "Android"
    elif "Linux" in ua_string:
        os_name = "Linux"
        
    # Browser
    browser_name = "Unknown Browser"
    if "Chrome" in ua_string or "CriOS" in ua_string:
        if "Edg" in ua_string:
            browser_name = "Edge"
        elif "OPR" in ua_string or "Opera" in ua_string:
            browser_name = "Opera"
        else:
            browser_name = "Chrome"
    elif "Firefox" in ua_string or "FxiOS" in ua_string:
        browser_name = "Firefox"
    elif "Safari" in ua_string and "AppleWebKit" in ua_string:
        browser_name = "Safari"
    elif "MSIE" in ua_string or "Trident" in ua_string:
        browser_name = "Internet Explorer"
        
    return f"{browser_name} on {os_name}"


def create_user_session():
    sid = helpers.uid()
    session["session_id"] = sid
    session["auth"] = True
    session.permanent = True
    session["session_last_active"] = int(time.time())
    
    user_agent = request.headers.get("User-Agent", "")
    ip_address = request.remote_addr
    active_at = int(time.time())
    
    with helpers.db(write=True) as con:
        con.execute(
            "INSERT INTO user_sessions (id, user_agent, ip_address, active_at) VALUES (?, ?, ?, ?)",
            (sid, user_agent, ip_address, active_at)
        )


@bp.before_app_request
def guard():
    if not helpers.AUTH_ENABLED:
        return None
    p = request.path
    if p in LOGIN_ASSETS:
        return None
    if p == "/calendar.ics":
        if hmac.compare_digest(request.args.get("key", ""), feed_key()):
            return None
        return Response("Invalid or missing key. Get your feed URL from Settings.", 403)
        
    # Simple anti-CSRF check for mutating API calls
    if p.startswith("/api/") and request.method in ["POST", "PUT", "DELETE", "PATCH"]:
        if request.headers.get("X-Requested-With") != "XMLHttpRequest":
            return jsonify({"error": "csrf validation failed"}), 403
            
    if session.get("auth"):
        sid = session.get("session_id")
        if not sid:
            session.clear()
            if p.startswith("/api/"):
                return jsonify({"error": "unauthorized"}), 401
            return redirect("/login")
            
        with helpers.db() as con:
            row = con.execute("SELECT id FROM user_sessions WHERE id = ?", (sid,)).fetchone()
        if not row:
            session.clear()
            if p.startswith("/api/"):
                return jsonify({"error": "unauthorized"}), 401
            return redirect("/login")
            
        # Update last active timestamp (throttle to once per 60 seconds)
        now = int(time.time())
        last_active = session.get("session_last_active", 0)
        if now - last_active > 60:
            with helpers.db(write=True) as con:
                con.execute(
                    "UPDATE user_sessions SET active_at = ?, ip_address = ?, user_agent = ? WHERE id = ?",
                    (now, request.remote_addr, request.headers.get("User-Agent", ""), sid)
                )
            session["session_last_active"] = now
            
        return None
        
    if p.startswith("/api/"):
        return jsonify({"error": "unauthorized"}), 401
    return redirect("/login")


@bp.get("/login")
def login_page():
    if not helpers.AUTH_ENABLED or session.get("auth"):
        return redirect("/")
    return helpers.get_rendered_file("login.html")



@bp.post("/login")
def login_submit():
    ip = request.remote_addr
    if check_rate_limit(ip):
        return redirect("/login?error=1")
    
    u = request.form.get("username", "")
    pw = request.form.get("password", "")
    ok = (hmac.compare_digest(u, helpers.AUTH_USERNAME)
          and helpers.verify_password(pw))
    if not ok:
        record_failed(ip)
        return redirect("/login?error=1")
    if totp_enabled():
        session["pre2fa"] = True
        return redirect("/login?step=2fa")
    create_user_session()
    return redirect("/")


@bp.post("/login/2fa")
def login_2fa():
    if not session.get("pre2fa"):
        return redirect("/login")
        
    ip = request.remote_addr
    if check_rate_limit(ip):
        return redirect("/login?step=2fa&error=1")
        
    code = request.form.get("code", "")
    secret = kv_get("totp_secret")
    if not secret or not pyotp.TOTP(secret).verify(code, valid_window=1):
        record_failed(ip)
        return redirect("/login?step=2fa&error=1")
    session.pop("pre2fa", None)
    create_user_session()
    return redirect("/")


@bp.get("/logout")
def logout():
    sid = session.get("session_id")
    if sid:
        with helpers.db(write=True) as con:
            con.execute("DELETE FROM user_sessions WHERE id = ?", (sid,))
    session.clear()
    return redirect("/login" if helpers.AUTH_ENABLED else "/")


# ---------------- 2FA management ----------------
@bp.post("/api/2fa/setup")
def tfa_setup():
    secret = pyotp.random_base32()
    kv_set("totp_pending", secret)
    uri = pyotp.totp.TOTP(secret).provisioning_uri(name=helpers.AUTH_USERNAME, issuer_name="TyloPlanner")
    return jsonify({"secret": secret, "uri": uri})


@bp.get("/api/2fa/qr")
def tfa_qr():
    secret = kv_get("totp_pending")
    if not secret:
        return jsonify({"error": "no 2FA setup in progress"}), 404
    uri = pyotp.totp.TOTP(secret).provisioning_uri(name=helpers.AUTH_USERNAME, issuer_name="TyloPlanner")
    img = qrcode.make(uri)
    buf = io.BytesIO()
    img.save(buf, format="PNG")
    return Response(buf.getvalue(), mimetype="image/png")


@bp.post("/api/2fa/enable")
def tfa_enable():
    code = (request.get_json(force=True) or {}).get("code", "")
    secret = kv_get("totp_pending")
    if not secret:
        return jsonify({"error": "no 2FA setup in progress"}), 400
    if not pyotp.TOTP(secret).verify(code, valid_window=1):
        return jsonify({"error": "wrong code, try again"}), 400
    kv_set("totp_secret", secret)
    kv_del("totp_pending")
    return jsonify({"ok": True})


@bp.post("/api/2fa/disable")
def tfa_disable():
    code = (request.get_json(force=True) or {}).get("code", "")
    secret = kv_get("totp_secret")
    if not secret:
        return jsonify({"error": "2FA is not enabled"}), 400
    if not pyotp.TOTP(secret).verify(code, valid_window=1):
        return jsonify({"error": "wrong code"}), 400
    kv_del("totp_secret")
    return jsonify({"ok": True})


@bp.post("/api/settings/password")
def change_password():
    if not helpers.AUTH_ENABLED:
        return jsonify({"error": "Authentication is not enabled"}), 400
        
    data = request.get_json(force=True) or {}
    cur_pw = data.get("current_password", "")
    new_pw = data.get("new_password", "")
    tfa_code = data.get("tfa_code", "")
    
    from helpers import verify_password, set_password, totp_enabled, kv_get
    if not verify_password(cur_pw):
        return jsonify({"error": "Incorrect current password"}), 400
        
    if totp_enabled():
        if not tfa_code:
            return jsonify({"error": "2FA verification code required"}), 400
        secret = kv_get("totp_secret")
        if not secret:
            return jsonify({"error": "2FA setup is invalid"}), 400
        import pyotp
        if not pyotp.TOTP(secret).verify(tfa_code, valid_window=1):
            return jsonify({"error": "Wrong 2FA code"}), 400
        
    if not new_pw or len(new_pw) < 4:
        return jsonify({"error": "New password must be at least 4 characters long"}), 400
        
    set_password(new_pw)
    return jsonify({"ok": True})


# ---------------- Session tracking ----------------
@bp.get("/api/auth/sessions")
def get_sessions():
    if not session.get("auth"):
        return jsonify({"error": "unauthorized"}), 401
        
    current_sid = session.get("session_id")
    with helpers.db() as con:
        rows = con.execute("SELECT * FROM user_sessions ORDER BY active_at DESC").fetchall()
        
    sessions = []
    for r in rows:
        ua = r["user_agent"]
        sessions.append({
            "id": r["id"],
            "user_agent": ua,
            "device": parse_user_agent(ua),
            "ip_address": r["ip_address"],
            "active_at": r["active_at"],
            "is_current": r["id"] == current_sid
        })
    return jsonify(sessions)


@bp.post("/api/auth/sessions/revoke")
def revoke_session():
    if not session.get("auth"):
        return jsonify({"error": "unauthorized"}), 401
        
    data = request.get_json(force=True) or {}
    target_sid = data.get("session_id")
    if not target_sid:
        return jsonify({"error": "session_id is required"}), 400
        
    with helpers.db(write=True) as con:
        con.execute("DELETE FROM user_sessions WHERE id = ?", (target_sid,))
        
    if target_sid == session.get("session_id"):
        session.clear()
        return jsonify({"ok": True, "logged_out": True})
        
    return jsonify({"ok": True, "logged_out": False})

