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
    _ensure_column(con, "files", "is_pinned", "is_pinned INTEGER DEFAULT 0")
    _ensure_column(con, "events", "description", "description TEXT")
    _ensure_column(con, "events", "location", "location TEXT")
    _ensure_column(con, "events", "recurrence", "recurrence TEXT DEFAULT 'none'")
    _ensure_column(con, "events", "recurrence_until", "recurrence_until TEXT")
    _ensure_column(con, "events", "reminder_offset", "reminder_offset INTEGER DEFAULT -1")
    _ensure_column(con, "tasks", "due", "due TEXT")

_WELCOME_NOTE_TITLE = "How to use Notes"
_WELCOME_NOTE_BODY = """\
# How to use Notes

Welcome! Here is everything the Notes section can do.

---

## Writing & saving

Type in the text area — your note **saves automatically** after a short pause. Fill in the **Title** field at the top to name it.

## Edit and View modes

Click **View** (bottom-right of the editor) to render your Markdown as formatted text. Click **Edit** to return to the text area at any time.

---

## Formatting toolbar

The toolbar above the text area inserts Markdown at your cursor position. Select text first, then click **B** or **I** to wrap the selection.

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

**bold text** and *italic text* and __underlined text__ and ~~strikethrough~~

> This is a blockquote. Great for callouts or quotes.

- Bullet one
- Bullet two
- Bullet three

1. Step one
2. Step two
3. Step three

---

## Linking to other notes

Type `[[Note Title]]` anywhere to create a clickable cross-reference.

- If the note **exists**: the link turns blue and opens that note when clicked.
- If the note **does not exist yet**: the link appears grey with a dashed underline.
- Titles are matched **case-insensitively**, so `[[my note]]` and `[[My Note]]` both work.

*This note can be edited or deleted at any time — it will not come back.*\\
"""

with db() as con:
    seeded = con.execute("SELECT value FROM kv WHERE key='seed_welcome_note'").fetchone()
    if not seeded:
        con.execute(
            "INSERT INTO notes(id,title,body,updated) VALUES(?,?,?,?)",
            (uuid.uuid4().hex[:12], _WELCOME_NOTE_TITLE, _WELCOME_NOTE_BODY, int(time.time() * 1000))
        )
        con.execute("INSERT INTO kv(key,value) VALUES('seed_welcome_note','1')")

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

    return application


app = create_app()


if __name__ == "__main__":
    from waitress import serve
    if not AUTH_ENABLED:
        print("WARNING: AUTH_PASSWORD is not set - TyloPlanner is running WITHOUT a login.")
    threading.Thread(target=scheduler_loop, daemon=True).start()
    print("TyloPlanner running on %s (port %d)" % (APP_URL, PORT))
    serve(app, host="0.0.0.0", port=PORT)
