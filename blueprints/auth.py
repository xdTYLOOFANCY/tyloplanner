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
        return None
    if p.startswith("/api/"):
        return jsonify({"error": "unauthorized"}), 401
    return redirect("/login")


@bp.get("/login")
def login_page():
    if not helpers.AUTH_ENABLED or session.get("auth"):
        return redirect("/")
    return current_app.send_static_file("login.html")


@bp.post("/login")
def login_submit():
    ip = request.remote_addr
    if check_rate_limit(ip):
        return redirect("/login?error=1")
    
    u = request.form.get("username", "")
    pw = request.form.get("password", "")
    ok = (hmac.compare_digest(u, helpers.AUTH_USERNAME)
          and hmac.compare_digest(pw, helpers.AUTH_PASSWORD))
    if not ok:
        record_failed(ip)
        return redirect("/login?error=1")
    if totp_enabled():
        session["pre2fa"] = True
        return redirect("/login?step=2fa")
    session["auth"] = True
    session.permanent = True
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
    session["auth"] = True
    session.permanent = True
    return redirect("/")


@bp.get("/logout")
def logout():
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
