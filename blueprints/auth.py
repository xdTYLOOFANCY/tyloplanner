"""
Auth blueprint — login, logout, TOTP 2FA, and the before_request guard.
"""
import io
import hmac
import time
from collections import defaultdict

import pyotp
import qrcode
import qrcode.image.svg
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
LOGIN_ASSETS = {"/login", "/login/2fa", "/setup", "/style.css", "/logo.svg", "/favicon.ico",
                "/manifest.json", "/sw.js", "/icon-192.png", "/icon-512.png", "/js/login.js", "/js/setup.js"}


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
    if not helpers.AUTH_ENABLED and helpers.is_auth_setup_complete():
        return None
    p = request.path
    if p in LOGIN_ASSETS or p.startswith("/api/setup") or p.startswith("/api/oauth") or p == "/api/auth/providers":
        return None
        
    if not helpers.is_auth_setup_complete():
        if p.startswith("/api/"):
            return jsonify({"error": "setup required"}), 403
        return redirect("/setup")

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
    ok = (hmac.compare_digest(u, helpers.get_auth_username())
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
    uri = pyotp.totp.TOTP(secret).provisioning_uri(name=helpers.get_auth_username(), issuer_name="TyloPlanner")
    return jsonify({"secret": secret, "uri": uri})


@bp.get("/api/2fa/qr")
def tfa_qr():
    secret = kv_get("totp_pending")
    if not secret:
        return jsonify({"error": "no 2FA setup in progress"}), 404
    uri = pyotp.totp.TOTP(secret).provisioning_uri(name=helpers.get_auth_username(), issuer_name="TyloPlanner")
    # SVG factory keeps qrcode pillow-free (see requirements.txt)
    img = qrcode.make(uri, image_factory=qrcode.image.svg.SvgPathImage)
    buf = io.BytesIO()
    img.save(buf)
    return Response(buf.getvalue(), mimetype="image/svg+xml")


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
    # Allow setting a password even if AUTH_ENABLED is false
    data = request.get_json(force=True) or {}
    cur_pw = data.get("current_password", "")
    new_pw = data.get("new_password", "")
    tfa_code = data.get("tfa_code", "")
    
    from helpers import verify_password, set_password, totp_enabled, kv_get
    
    has_password = bool(kv_get("password_hash"))
    if has_password:
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


# ---------------- Setup ----------------
@bp.get("/setup")
def setup_page():
    if helpers.is_auth_setup_complete():
        return redirect("/")
    return helpers.get_rendered_file("setup.html")


@bp.post("/api/setup")
def setup_submit():
    if helpers.is_auth_setup_complete():
        return jsonify({"error": "Already setup"}), 400
    
    data = request.get_json(force=True) or {}
    username = data.get("username", "").strip()
    password = data.get("password", "")
    
    if not username or len(password) < 4:
        return jsonify({"error": "Invalid username or password too short"}), 400
        
    helpers.kv_set("admin_username", username)
    helpers.set_password(password)
    helpers.kv_set("auth_setup_complete", "true")
    
    create_user_session()
    return jsonify({"ok": True})


# ---------------- OAuth ----------------
import requests
import secrets
from urllib.parse import urlencode

# The two providers differ only in endpoints, scope, and token-request extras.
_OAUTH_PROVIDERS = {
    "github": {
        "label": "GitHub",
        "auth_url": "https://github.com/login/oauth/authorize",
        "auth_params": {"scope": "read:user"},
        "token_url": "https://github.com/login/oauth/access_token",
        "token_extra": {},
        "token_headers": {"Accept": "application/json"},
        "user_url": "https://api.github.com/user",
    },
    "google": {
        "label": "Google",
        "auth_url": "https://accounts.google.com/o/oauth2/v2/auth",
        "auth_params": {"response_type": "code", "scope": "email profile"},
        "token_url": "https://oauth2.googleapis.com/token",
        "token_extra": {"grant_type": "authorization_code"},
        "token_headers": {},
        "user_url": "https://www.googleapis.com/oauth2/v2/userinfo",
    },
}


@bp.get("/api/auth/providers")
def get_providers():
    return jsonify({"providers": helpers.get_oauth_providers()})

@bp.get("/api/oauth/status")
def oauth_status():
    if not session.get("auth"):
        return jsonify({"error": "unauthorized"}), 401

    return jsonify({
        "github": bool(helpers.kv_get("oauth_github_client_id")),
        "google": bool(helpers.kv_get("oauth_google_client_id"))
    })


@bp.post("/api/oauth/init")
def oauth_init():
    data = request.get_json(force=True) or {}
    provider = data.get("provider")
    action = data.get("action", "login")  # 'login' or 'link'

    cfg = _OAUTH_PROVIDERS.get(provider)
    if not cfg:
        return jsonify({"error": "Unknown provider"}), 400

    client_id = helpers.kv_get(f"oauth_{provider}_client_id")
    if action == "link":
        client_id = data.get("client_id")
        client_secret = data.get("client_secret")
        if not client_id or not client_secret:
            return jsonify({"error": "Missing credentials"}), 400
        session[f"oauth_link_{provider}_id"] = client_id
        session[f"oauth_link_{provider}_secret"] = client_secret

    if not client_id:
        return jsonify({"error": f"{cfg['label']} not configured"}), 400

    state = secrets.token_urlsafe(16)
    session["oauth_state"] = state
    session["oauth_action"] = action
    session["oauth_provider"] = provider

    params = dict(cfg["auth_params"], client_id=client_id,
                  redirect_uri=f"{helpers.APP_URL}/api/oauth/callback", state=state)
    return jsonify({"url": cfg["auth_url"] + "?" + urlencode(params)})


@bp.get("/api/oauth/callback")
def oauth_callback():
    code = request.args.get("code")
    state = request.args.get("state")

    if not code or not state or state != session.get("oauth_state"):
        return redirect("/login?error=oauth_failed")

    provider = session.get("oauth_provider")
    action = session.get("oauth_action")
    cfg = _OAUTH_PROVIDERS.get(provider)
    if not cfg:
        return redirect("/login?error=oauth_failed")
    redirect_uri = f"{helpers.APP_URL}/api/oauth/callback"

    try:
        if action == "link":
            client_id = session.get(f"oauth_link_{provider}_id")
            client_secret = session.get(f"oauth_link_{provider}_secret")
        else:
            client_id = helpers.kv_get(f"oauth_{provider}_client_id")
            client_secret = helpers.kv_get(f"oauth_{provider}_client_secret")

        res = requests.post(cfg["token_url"], data=dict(
            cfg["token_extra"], client_id=client_id, client_secret=client_secret,
            code=code, redirect_uri=redirect_uri,
        ), headers=cfg["token_headers"]).json()

        access_token = res.get("access_token")
        if not access_token:
            raise Exception("No access token")

        user_res = requests.get(cfg["user_url"], headers={
            "Authorization": f"Bearer {access_token}"
        }).json()
        user_id = user_res.get("id")
        if user_id is None:
            raise Exception("No user ID from provider")
        user_id = str(user_id)

        if action == "link":
            # Either first time setup or linking from settings
            helpers.kv_set(f"oauth_{provider}_client_id", session.pop(f"oauth_link_{provider}_id"))
            helpers.kv_set(f"oauth_{provider}_client_secret", session.pop(f"oauth_link_{provider}_secret"))
            helpers.kv_set(f"oauth_{provider}_linked_user_id", user_id)

            helpers.update_auth_enabled()
            if not helpers.is_auth_setup_complete():
                helpers.kv_set("auth_setup_complete", "true")
                create_user_session()
                return redirect("/")
            return redirect("/#settings")

        elif action == "login":
            expected_id = helpers.kv_get(f"oauth_{provider}_linked_user_id")
            if str(expected_id) == user_id:
                create_user_session()
                return redirect("/")
            else:
                return redirect("/login?error=oauth_unauthorized")

    except Exception as e:
        print("OAuth Error:", e)
        return redirect("/login?error=oauth_failed")

    return redirect("/login")


@bp.post("/api/oauth/unlink")
def oauth_unlink():
    if not session.get("auth"):
        return jsonify({"error": "unauthorized"}), 401
        
    data = request.get_json(force=True) or {}
    provider = data.get("provider")
    
    if provider not in ["github", "google"]:
        return jsonify({"error": "invalid provider"}), 400
        
    # Check failsafe: cannot unlink if password not set and no other oauth configured
    has_pw = bool(helpers.kv_get("password_hash")) or bool(helpers.AUTH_PASSWORD)
    other_provider = "google" if provider == "github" else "github"
    has_other_oauth = bool(helpers.kv_get(f"oauth_{other_provider}_client_id") and helpers.kv_get(f"oauth_{other_provider}_linked_user_id"))
    
    if not has_pw and not has_other_oauth:
        return jsonify({"error": "Cannot unlink last authentication method. Set a password first."}), 400
        
    helpers.kv_del(f"oauth_{provider}_client_id")
    helpers.kv_del(f"oauth_{provider}_client_secret")
    helpers.kv_del(f"oauth_{provider}_linked_user_id")
    helpers.update_auth_enabled()
    
    return jsonify({"ok": True})

