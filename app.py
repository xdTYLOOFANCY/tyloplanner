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
<h1>How to use Notes</h1>
<p>Welcome! Here is everything the Notes section can do.</p>
<hr>
<h2>Writing &amp; saving</h2>
<p>Type in the editor — your note <strong>saves automatically</strong> in the background. A live save status indicator (e.g. <em>Typing...</em>, <em>Saving...</em>, or <em>Saved at HH:MM:SS</em>) is displayed in the header alongside word and character counters.</p>
<h2>The formatting toolbar</h2>
<p>This is a full what-you-see-is-what-you-get editor — no Markdown syntax to remember. Select text and click a toolbar button, or use the pickers, to apply:</p>
<ul>
<li>Paragraph/heading style, font family and font size</li>
<li><strong>Bold</strong>, <em>italic</em>, <u>underline</u>, <s>strikethrough</s></li>
<li>Text color, highlight color, and alignment (left/center/right/justify)</li>
<li>Subscript/superscript</li>
<li>Ordered, bulleted and checklist lists, with indent/outdent</li>
<li>Blockquotes and code blocks</li>
<li>Links and inline images</li>
</ul>
<h2>The / slash menu</h2>
<p>Type <code>/</code> at the start of a line to open a quick command menu — headings, lists, a checklist, a quote, a code block, a table, or an image. Filter by typing, navigate with the arrow keys, choose with Enter, dismiss with Esc.</p>
<h2>Tables</h2>
<p>Insert a table from the <code>/</code> menu (starts as 3×3). While the caret is inside a table, a small floating toolbar lets you add/remove rows and columns or delete the whole table. Cells are fully editable and round-trip through save and export.</p>
<h2>Linking to other notes</h2>
<p>Type <code>[[</code> to open an autocomplete for another note's title — pick one to insert a clickable link.</p>
<ul>
<li>If the note <strong>exists</strong>: the link turns blue and opens that note when clicked.</li>
<li>If the note <strong>does not exist yet</strong>: the link appears grey with a dashed underline.</li>
<li>Titles are matched <strong>case-insensitively</strong>.</li>
</ul>
<h2>Images</h2>
<p>Insert an image from the toolbar or the slash menu. Click an inserted image to select it: drag the corner handle to resize (keeps aspect ratio), or use the small toolbar above it to align left/center/right or reset the size. Typing or pasting a URL (<code>https://…</code> or <code>www.…</code>) also turns it into a clickable link automatically.</p>
<h2>Version history</h2>
<p>The <strong>🕘 Version history</strong> button in the header opens a panel of past snapshots of this note (taken automatically as you edit, at most one every ~10 minutes). Preview any of them, or <strong>restore</strong> one — restoring first snapshots your current content, so it's itself undoable.</p>
<h2>Searching within notes</h2>
<p>Use the <strong>🔍 Find &amp; replace</strong> button to search (and optionally replace) text inside the current note.</p>
<ul>
<li>All matching text is highlighted; step through results with the <strong>↑</strong>/<strong>↓</strong> arrows or Enter.</li>
<li>Use <strong>Replace</strong> or <strong>Replace all</strong> to swap in new text.</li>
</ul>
<h2>Exporting</h2>
<p>The <strong>📥 Export</strong> button offers <strong>Styled HTML (.html)</strong> — a self-contained file with images inlined — and <strong>Print / PDF</strong>, which opens your browser's print dialog so you can save the note as a PDF.</p>
<p><em>This note can be edited or deleted at any time — it will not come back.</em></p>
"""

with db() as con:
    seeded = con.execute("SELECT value FROM kv WHERE key='seed_welcome_note'").fetchone()
    if not seeded:
        con.execute(
            "INSERT INTO notes(id,title,body,body_format,updated) VALUES(?,?,?,?,?)",
            (uuid.uuid4().hex[:12], _WELCOME_NOTE_TITLE, _WELCOME_NOTE_BODY, "html", int(time.time() * 1000))
        )
        con.execute("INSERT INTO kv(key,value) VALUES('seed_welcome_note','5')")
    elif seeded[0] in ('1', '2', '3', '4'):
        # Update the welcome note body to the new version if it hasn't been deleted
        note = con.execute("SELECT id FROM notes WHERE title=?", (_WELCOME_NOTE_TITLE,)).fetchone()
        if note:
            con.execute(
                "UPDATE notes SET body=?, body_format='html', updated=? WHERE id=?",
                (_WELCOME_NOTE_BODY, int(time.time() * 1000), note[0])
            )
        con.execute("UPDATE kv SET value='5' WHERE key='seed_welcome_note'")

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
        response.headers['Content-Security-Policy'] = "default-src 'self'; img-src 'self' data: blob: https://www.google.com https://*.gstatic.com; style-src 'self' 'unsafe-inline'; script-src 'self' 'unsafe-inline' 'unsafe-eval';"
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
