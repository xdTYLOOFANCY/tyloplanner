"""
TyloPlanner - self-hosted personal dashboard.
Flask + SQLite backend with session authentication, optional TOTP 2FA,
ntfy notifications, calendar auto-sync, and automatic backups.
See README.md for setup.
"""
import os
import time
import uuid
import secrets
import threading

from flask import Flask

import helpers
from helpers import (
    DB_PATH, PORT, APP_URL,
    TABLES, db, kv_get, kv_set, close_db, run_migrations,
)
from scheduler import scheduler_loop, recover_interrupted_tasks

# ---------------- database init ----------------
run_migrations()
recover_interrupted_tasks()

_WELCOME_NOTE_TITLE = "How to use Notes"
_WELCOME_NOTE_BODY = """\
# How to use Notes

Welcome! Here is everything the Notes section can do.

---

## Writing & saving

Type in the editor — your note **saves automatically** in the background. A live save status indicator (e.g. *Typing...*, *Saving...*, or *Saved at HH:MM:SS*) is displayed in the header alongside word and character counters.

## Read Mode & Split View

You can customize the layout of the editor using the control toggles:
- **Read Mode** (pill slider in the header) — When turned **ON**, it hides the editing area and toolbar, displaying the clean, formatted note along with the search bar.
- **Split View** (checkmark toggle in the toolbar) — When Read Mode is **OFF**, toggle Split View to switch between a side-by-side editing layout (Split) or a distraction-free editor-only layout.

Layout toggle states are saved automatically **per note** and persist across page reloads.

## Searching within notes

Use the search bar at the bottom of the header to search for text inside the current note.
- All matching text will be highlighted in yellow.
- Use the **↑** and **↓** arrows, or simply press **Enter** in the search box, to step through each result.
- The search bar takes up the full width of the editor and is styled slightly larger in **Read Mode** for readability.
- It is fully active in both editing layouts and in **Read Mode**.

---

## Formatting toolbar

The toolbar above the text area inserts Markdown at your cursor position. Select text first, then click a formatting button to wrap the selection:

- **B** — bold: `**text**`
- **I** — italic: `*text*`
- **H1** — heading: `# text`
- **• List** — bullet item: `- text`
- **1. List** — numbered item: `1. text`
- **—** — horizontal divider: `---`

---

## Markdown reference

# Heading 1
## Heading 2
### Heading 3

**bold text** and *italic text* and ~~strikethrough~~

> This is a blockquote. Great for callouts or quotes.

- Bullet one
- Bullet two

1. Step one
2. Step two

---

## Linking to other notes

Type `[[Note Title]]` anywhere to create a clickable cross-reference.

- If the note **exists**: the link turns blue and opens that note when clicked.
- If the note **does not exist yet**: the link appears grey with a dashed underline.
- Titles are matched **case-insensitively**, so `[[my note]]` and `[[My Note]]` both work.

*This note can be edited or deleted at any time — it will not come back.*
"""

with db() as con:
    seeded = con.execute("SELECT value FROM kv WHERE key='seed_welcome_note'").fetchone()
    if not seeded:
        con.execute(
            "INSERT INTO notes(id,title,body,updated) VALUES(?,?,?,?)",
            (uuid.uuid4().hex[:12], _WELCOME_NOTE_TITLE, _WELCOME_NOTE_BODY, int(time.time() * 1000))
        )
        con.execute("INSERT INTO kv(key,value) VALUES('seed_welcome_note','4')")
    elif seeded[0] in ('1', '2', '3'):
        # Update the welcome note body to the new version if it hasn't been deleted
        note = con.execute("SELECT id FROM notes WHERE title=?", (_WELCOME_NOTE_TITLE,)).fetchone()
        if note:
            con.execute("UPDATE notes SET body=?, updated=? WHERE id=?", (_WELCOME_NOTE_BODY, int(time.time() * 1000), note[0]))
        con.execute("UPDATE kv SET value='4' WHERE key='seed_welcome_note'")

    seeded_shortcuts = con.execute("SELECT value FROM kv WHERE key='seed_default_shortcut'").fetchone()
    if not seeded_shortcuts:
        con.execute(
            "INSERT INTO shortcuts(id,name,url,icon) VALUES(?,?,?,?)",
            (uuid.uuid4().hex[:12], "TyloPlanner", "https://github.com/xdTYLOOFANCY/tyloplanner", "")
        )
        con.execute("INSERT INTO kv(key,value) VALUES('seed_default_shortcut','1')")

# ---------------- logging middleware ----------------
class LoggingMiddleware:
    """
    WSGI middleware to log all incoming HTTP requests to stdout in the standard
    Apache Combined Log format:
    %h %l %u %t "%r" %>s %b "%{Referer}i" "%{User-Agent}i"
    """
    def __init__(self, app, flask_app=None):
        self.app = app
        self.flask_app = flask_app

    def __call__(self, environ, start_response):
        # Bypass logging if running in a test suite
        import os
        if (self.flask_app and self.flask_app.testing) or os.environ.get("TESTING") == "True":
            return self.app(environ, start_response)

        status_code = '-'
        response_length = 0

        def custom_start_response(status, response_headers, exc_info=None):
            nonlocal status_code, response_length
            status_code = status.split()[0]
            for name, val in response_headers:
                if name.lower() == 'content-length':
                    try:
                        response_length = int(val)
                    except ValueError:
                        pass
            return start_response(status, response_headers, exc_info)

        try:
            response_iterable = self.app(environ, custom_start_response)
        except Exception:
            # If an unhandled exception bubbles up, log it as a 500 error
            status_code = '500'
            self._log(environ, status_code, response_length)
            raise

        def response_wrapper(iterable):
            bytes_sent = 0
            try:
                for chunk in iterable:
                    bytes_sent += len(chunk)
                    yield chunk
            finally:
                if hasattr(iterable, 'close'):
                    iterable.close()
                final_length = response_length if response_length > 0 else bytes_sent
                self._log(environ, status_code, final_length)

        return response_wrapper(response_iterable)

    def _log(self, environ, status_code, response_length):
        from datetime import datetime, timezone
        
        ip = environ.get('REMOTE_ADDR', '-')
        user = environ.get('REMOTE_USER', '-')
        
        # Apache time format: [day/month/year:hour:minute:second zone]
        now = datetime.now(timezone.utc).astimezone()
        time_str = now.strftime('%d/%b/%Y:%H:%M:%S %z')
        
        method = environ.get('REQUEST_METHOD', '-')
        path = environ.get('PATH_INFO', '')
        query = environ.get('QUERY_STRING', '')
        protocol = environ.get('SERVER_PROTOCOL', 'HTTP/1.1')
        
        if query:
            request_line = f"{method} {path}?{query} {protocol}"
        else:
            request_line = f"{method} {path} {protocol}"
            
        bytes_sent_str = str(response_length) if response_length > 0 else '-'
        referer = environ.get('HTTP_REFERER', '-')
        user_agent = environ.get('HTTP_USER_AGENT', '-')
        
        log_entry = f'{ip} - {user} [{time_str}] "{request_line}" {status_code} {bytes_sent_str} "{referer}" "{user_agent}"'
        print(log_entry, flush=True)


# ---------------- app factory ----------------
def create_app():
    application = Flask(__name__, static_folder="static", static_url_path="")
    application.config['SEND_FILE_MAX_AGE_DEFAULT'] = 0

    from flask import request, jsonify
    import traceback
    from werkzeug.exceptions import HTTPException

    @application.after_request
    def add_header(r):
        if request.path in ('/sw.js', '/index.html', '/'):
            r.headers["Cache-Control"] = "no-cache, no-store, must-revalidate"
            r.headers["Pragma"] = "no-cache"
            r.headers["Expires"] = "0"
        return r

    from werkzeug.middleware.proxy_fix import ProxyFix
    application.wsgi_app = LoggingMiddleware(application.wsgi_app, flask_app=application)
    application.wsgi_app = ProxyFix(application.wsgi_app, x_for=1, x_proto=1, x_host=1, x_prefix=1)

    # Secure session cookies
    # SESSION_COOKIE_SECURE is only set when APP_URL uses HTTPS so that
    # localhost, LAN, and Tailscale HTTP setups continue to work normally.
    application.config.update(
        SESSION_COOKIE_HTTPONLY=True,
        SESSION_COOKIE_SAMESITE='Lax',
        SESSION_COOKIE_SECURE=APP_URL.startswith("https://"),
    )

    # Session secret: from env, else generated once and stored in the database
    # so logins survive restarts.
    application.secret_key = os.environ.get("SECRET_KEY") or kv_get("secret_key")
    if not application.secret_key:
        application.secret_key = secrets.token_hex(32)
        kv_set("secret_key", application.secret_key)

    # Register all blueprints
    from blueprints.auth import bp as auth_bp
    from blueprints.api import bp as api_bp
    from blueprints.settings import bp as settings_bp
    from blueprints.files import bp as files_bp
    from blueprints.backup import bp as backup_bp
    from blueprints.calendar import bp as calendar_bp
    from blueprints.strava import bp as strava_bp
    from blueprints.notifications import bp as notifications_bp

    application.register_blueprint(auth_bp)
    application.register_blueprint(api_bp)
    application.register_blueprint(settings_bp)
    application.register_blueprint(files_bp)
    application.register_blueprint(backup_bp)
    application.register_blueprint(calendar_bp)
    application.register_blueprint(strava_bp)
    application.register_blueprint(notifications_bp)

    @application.after_request
    def add_security_headers(response):
        response.headers['Content-Security-Policy'] = "default-src 'self'; img-src 'self' data: blob: https://www.google.com https://*.gstatic.com; style-src 'self' 'unsafe-inline'; script-src 'self';"
        response.headers['X-Content-Type-Options'] = "nosniff"
        response.headers['X-Frame-Options'] = "SAMEORIGIN"
        return response

    @application.after_request
    def compress_response(response):
        accept_encoding = request.headers.get("Accept-Encoding", "")
        if "gzip" not in accept_encoding.lower():
            return response

        if not (200 <= response.status_code < 300):
            return response

        if "Content-Encoding" in response.headers:
            return response

        if response.is_streamed or response.direct_passthrough:
            return response

        mimetype = response.mimetype
        if not mimetype:
            return response

        mimetype = mimetype.lower()
        compressible_types = [
            "text/html",
            "text/css",
            "text/plain",
            "text/xml",
            "application/json",
            "application/javascript",
            "text/javascript",
            "image/svg+xml",
            "application/xml",
            "application/x-javascript"
        ]

        is_compressible = any(t in mimetype for t in compressible_types)
        if not is_compressible:
            return response

        data = response.get_data()
        if len(data) < 500:
            return response

        import gzip
        import io

        gzip_buffer = io.BytesIO()
        with gzip.GzipFile(mode='wb', fileobj=gzip_buffer, compresslevel=6) as gzip_file:
            gzip_file.write(data)

        compressed_data = gzip_buffer.getvalue()

        response.set_data(compressed_data)
        response.headers['Content-Encoding'] = 'gzip'

        vary = response.headers.get("Vary")
        if vary:
            if "Accept-Encoding" not in vary:
                response.headers["Vary"] = vary + ", Accept-Encoding"
        else:
            response.headers["Vary"] = "Accept-Encoding"

        return response

    @application.errorhandler(Exception)
    def handle_exception(e):
        application.logger.error(f"Unhandled exception: {e}\n{traceback.format_exc()}")

        if isinstance(e, HTTPException):
            return jsonify({
                "error": e.description,
                "code": e.code,
                "type": e.__class__.__name__
            }), e.code

        return jsonify({
            "error": "An unexpected error occurred",
            "code": 500,
            "type": "InternalServerError"
        }), 500

    application.teardown_appcontext(close_db)

    return application


app = create_app()


if __name__ == "__main__":
    import argparse
    import sys

    parser = argparse.ArgumentParser(description="TyloPlanner - self-hosted personal dashboard.")
    parser.add_argument("--reset-password", type=str, help="Reset the admin/login password directly from the host terminal.")
    parser.add_argument("--disable-2fa", action="store_true", help="Disable TOTP 2FA directly from the host terminal.")
    
    args = parser.parse_args()

    if args.reset_password or args.disable_2fa:
        if args.reset_password:
            password = args.reset_password.strip()
            if len(password) < 4:
                print("Error: Password must be at least 4 characters long.")
                sys.exit(1)
            helpers.set_password(password)
            print("Password successfully reset.")

        if args.disable_2fa:
            helpers.kv_del("totp_secret")
            helpers.kv_del("totp_pending")
            print("TOTP 2FA successfully disabled.")

        sys.exit(0)

    from waitress import serve
    if not helpers.AUTH_ENABLED:
        print("WARNING: AUTH_PASSWORD is not set - TyloPlanner is running WITHOUT a login.")
    threading.Thread(target=scheduler_loop, daemon=True).start()
    print("TyloPlanner running on %s (port %d)" % (APP_URL, PORT))
    serve(app, host="0.0.0.0", port=PORT)
