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

from helpers import (
    DB_PATH, PORT, APP_URL, AUTH_ENABLED,
    SCHEMA, TABLES, db, _ensure_column, kv_get, kv_set,
)
from scheduler import scheduler_loop

# ---------------- database init ----------------
with db() as con:
    con.executescript(SCHEMA)
    _ensure_column(con, "notes", "is_pinned", "is_pinned INTEGER DEFAULT 0")
    _ensure_column(con, "notes", "folder_id", "folder_id TEXT")
    _ensure_column(con, "note_folders", "order_index", "order_index INTEGER DEFAULT 0")
    _ensure_column(con, "files", "is_pinned", "is_pinned INTEGER DEFAULT 0")
    _ensure_column(con, "files", "folder_id", "folder_id TEXT")
    _ensure_column(con, "folders", "icon", "icon TEXT")
    _ensure_column(con, "events", "description", "description TEXT")
    _ensure_column(con, "events", "location", "location TEXT")
    _ensure_column(con, "events", "recurrence", "recurrence TEXT DEFAULT 'none'")
    _ensure_column(con, "events", "recurrence_until", "recurrence_until TEXT")
    _ensure_column(con, "tasks", "due", "due TEXT")
    _ensure_column(con, "tasks", "category", "category TEXT")
    _ensure_column(con, "tasks", "order_index", "order_index INTEGER DEFAULT 0")
    _ensure_column(con, "tasks", "due_date", "due_date TEXT")
    _ensure_column(con, "tasks", "parent_id", "parent_id TEXT")

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

# ---------------- app factory ----------------
def create_app():
    application = Flask(__name__, static_folder="static", static_url_path="")
    application.config['SEND_FILE_MAX_AGE_DEFAULT'] = 0

    from flask import request

    @application.after_request
    def add_header(r):
        if request.path in ('/sw.js', '/index.html', '/'):
            r.headers["Cache-Control"] = "no-cache, no-store, must-revalidate"
            r.headers["Pragma"] = "no-cache"
            r.headers["Expires"] = "0"
        return r

    from werkzeug.middleware.proxy_fix import ProxyFix
    application.wsgi_app = ProxyFix(application.wsgi_app, x_for=1, x_proto=1, x_host=1, x_prefix=1)

    # Secure session cookies
    application.config.update(
        SESSION_COOKIE_HTTPONLY=True,
        SESSION_COOKIE_SAMESITE='Lax'
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

    return application


app = create_app()


if __name__ == "__main__":
    from waitress import serve
    if not AUTH_ENABLED:
        print("WARNING: AUTH_PASSWORD is not set - TyloPlanner is running WITHOUT a login.")
    threading.Thread(target=scheduler_loop, daemon=True).start()
    print("TyloPlanner running on %s (port %d)" % (APP_URL, PORT))
    serve(app, host="0.0.0.0", port=PORT)
