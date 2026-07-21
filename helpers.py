"""
TyloPlanner — shared helpers.

Config variables, database helpers, key-value store, schema definition,
and utility functions used across blueprints and the scheduler.
"""
import os
import json
import time
import uuid
import secrets
import sqlite3
import threading
from datetime import datetime
from contextlib import contextmanager

import requests
from urllib3.util.retry import Retry

# ---------------- config ----------------
BASE_DIR = os.path.dirname(os.path.abspath(__file__))
DB_PATH = os.environ.get("DB_PATH", os.path.join(BASE_DIR, "data", "tyloplanner.db"))
BACKUP_DIR = os.environ.get("BACKUP_DIR", os.path.join(os.path.dirname(DB_PATH), "backups"))
UPLOAD_DIR = os.environ.get("UPLOAD_DIR", os.path.join(os.path.dirname(DB_PATH), "uploads"))
APP_URL = os.environ.get("APP_URL", "http://localhost:8000").rstrip("/")
STRAVA_CLIENT_ID = os.environ.get("STRAVA_CLIENT_ID", "")
STRAVA_CLIENT_SECRET = os.environ.get("STRAVA_CLIENT_SECRET", "")
AUTH_USERNAME = os.environ.get("AUTH_USERNAME", "admin")
AUTH_PASSWORD = os.environ.get("AUTH_PASSWORD", "")
AUTH_ENABLED = bool(AUTH_PASSWORD)
PORT = int(os.environ.get("PORT", "8000"))
VERSION = "1.41.0"

os.makedirs(os.path.dirname(DB_PATH), exist_ok=True)
os.makedirs(UPLOAD_DIR, exist_ok=True)

# ---------------- whitelisted writable columns ----------------
# whitelisted writable columns per table (id is managed by the server)
TABLES = {
    "events":   ["date", "start", "end", "title", "type", "source", "description", "location", "recurrence", "recurrence_until", "reminder_offset", "end_date", "recurrence_interval", "recurrence_days", "recurrence_count", "excluded_dates", "color", "task_id"],
    "exams":    ["name", "date", "grade", "grade_text", "grading_type", "ects", "academic_year", "tags", "tracker_id"],
    "habits":   ["name", "created", "frequency", "archived", "order_index"],
    "workouts": ["type", "date", "dur", "dist", "note", "source", "ext_id"],
    "tasks":    ["name", "done", "created", "completed_at", "due", "category", "order_index", "due_date", "parent_id", "recurrence", "priority", "reminder_offset"],
    "notes":    ["title", "body", "updated", "is_pinned", "folder_id", "body_format", "tags"],
    "note_folders": ["name", "parent_id", "icon", "order_index"],
    "files":    ["filename", "size", "mimetype", "uploaded", "is_pinned", "folder_id"],
    "folders":  ["name", "parent_id", "icon"],
    "shortcuts":["name", "url", "icon"],
    "study_sessions": ["subject", "date", "duration", "completed", "note"],
    "playlists": ["name", "created", "updated"],
    "playlist_tracks": ["playlist_id", "file_id", "position", "added"],
}


# Thread-safe lock for write transactions to prevent SQLite write lock contention/deadlocks.
# We use RLock (Reentrant Lock) to allow safe nested/recursive acquisitions in the same thread.
db_write_lock = threading.RLock()


# Shared HTTP session for external calls (Strava, ICS feeds). urllib3 retries
# transient failures (connection errors, 429, 5xx) with backoff; the final
# response is returned (raise_on_status=False) so callers keep their own
# status-code handling. allowed_methods=None retries POSTs too, matching the
# previous hand-rolled behavior.
_http = requests.Session()
_http.mount("https://", requests.adapters.HTTPAdapter(max_retries=Retry(
    total=3, backoff_factor=1, status_forcelist=[429, 500, 502, 503, 504],
    allowed_methods=None, raise_on_status=False)))
_http.mount("http://", _http.get_adapter("https://"))
http_get = _http.get
http_post = _http.post


def is_write_request():
    from flask import has_request_context, request
    if has_request_context():
        return request.method not in ("GET", "HEAD", "OPTIONS")
    return False


# ---------------- database ----------------
def _connect():
    con = sqlite3.connect(DB_PATH, timeout=10.0)
    con.execute("PRAGMA journal_mode=WAL;")
    # busy_timeout makes SQLite itself block-and-retry on lock contention
    # (including BEGIN IMMEDIATE below) — no Python-level retry needed.
    con.execute("PRAGMA busy_timeout = 5000;")
    con.execute("PRAGMA foreign_keys = ON;")
    con.row_factory = sqlite3.Row
    return con


@contextmanager
def db(write=None):
    from flask import g, has_app_context

    if write is None:
        write = is_write_request()

    lock_acquired = False
    if write:
        db_write_lock.acquire()
        lock_acquired = True

    try:
        if has_app_context():
            if not hasattr(g, "db_conn"):
                g.db_conn = _connect()
            con = g.db_conn
            if write and not con.in_transaction:
                con.execute("BEGIN IMMEDIATE")
            with con:
                yield con
        else:
            con = _connect()
            if write and not con.in_transaction:
                con.execute("BEGIN IMMEDIATE")
            try:
                with con:
                    yield con
            finally:
                con.close()
    finally:
        if lock_acquired:
            db_write_lock.release()


def close_db(e=None):
    from flask import g
    con = getattr(g, "db_conn", None)
    if con is not None:
        try:
            con.execute("PRAGMA optimize;")
        except Exception:
            pass
        con.close()


def get_current_schema_version(con):
    if not con.execute("SELECT 1 FROM sqlite_master WHERE type='table' AND name='kv'").fetchone():
        return 0

    db_ver = con.execute("SELECT value FROM kv WHERE key='db_version'").fetchone()
    if db_ver:
        return int(db_ver["value"])

    # Legacy path: DB predates the stored db_version key — infer the schema
    # version from marker tables/columns (PRAGMA table_info and sqlite_master
    # queries never raise for missing tables, they just return no rows).
    def table_exists(name):
        return con.execute("SELECT 1 FROM sqlite_master WHERE type='table' AND name=?", (name,)).fetchone()

    def has_col(table, col):
        return any(r["name"] == col for r in con.execute(f"PRAGMA table_info({table})"))

    if table_exists("deleted_records"):
        version = 6
    elif table_exists("notes_fts"):
        version = 5
    elif has_col("tasks", "parent_id"):
        version = 4
    elif has_col("events", "recurrence"):
        version = 3
    elif has_col("notes", "is_pinned"):
        version = 2
    else:
        version = 1 if con.execute("SELECT 1 FROM sqlite_master WHERE type='table'").fetchone() else 0

    con.execute(
        "INSERT INTO kv(key, value) VALUES('db_version', ?) "
        "ON CONFLICT(key) DO UPDATE SET value=excluded.value",
        (str(version),)
    )
    return version


def enable_auto_vacuum(db_path):
    try:
        con = sqlite3.connect(db_path, timeout=10.0)
        try:
            con.execute("PRAGMA busy_timeout = 5000;")
            res = con.execute("PRAGMA auto_vacuum;").fetchone()
            if res and res[0] != 2:
                con.execute("PRAGMA auto_vacuum = INCREMENTAL;")
                con.execute("VACUUM;")
        finally:
            con.close()
    except Exception as e:
        print("Failed to enable auto_vacuum:", e)


def recreate_sync_triggers(con):
    tables = list(TABLES)
    for t in tables + ["habit_log"]:
        con.execute(f"DROP TRIGGER IF EXISTS trg_{t}_insert")
        con.execute(f"DROP TRIGGER IF EXISTS trg_{t}_update")
        con.execute(f"DROP TRIGGER IF EXISTS trg_{t}_delete")
        
    for t in tables:
        con.execute(f"""
            CREATE TRIGGER trg_{t}_insert AFTER INSERT ON {t}
            BEGIN
                INSERT INTO kv(key, value) VALUES('state_version', '1')
                ON CONFLICT(key) DO UPDATE SET value = CAST(value AS INTEGER) + 1;
                UPDATE {t} SET version = (SELECT CAST(value AS INTEGER) FROM kv WHERE key = 'state_version') WHERE id = NEW.id;
                DELETE FROM deleted_records WHERE id = NEW.id AND "table" = '{t}';
            END;
        """)
        con.execute(f"""
            CREATE TRIGGER trg_{t}_update AFTER UPDATE ON {t}
            WHEN OLD.version = NEW.version OR (OLD.version IS NULL AND NEW.version IS NULL)
            BEGIN
                INSERT INTO kv(key, value) VALUES('state_version', '1')
                ON CONFLICT(key) DO UPDATE SET value = CAST(value AS INTEGER) + 1;
                UPDATE {t} SET version = (SELECT CAST(value AS INTEGER) FROM kv WHERE key = 'state_version') WHERE id = NEW.id;
            END;
        """)
        con.execute(f"""
            CREATE TRIGGER trg_{t}_delete AFTER DELETE ON {t}
            BEGIN
                INSERT INTO kv(key, value) VALUES('state_version', '1')
                ON CONFLICT(key) DO UPDATE SET value = CAST(value AS INTEGER) + 1;
                INSERT INTO deleted_records (id, "table", version)
                VALUES (OLD.id, '{t}', (SELECT CAST(value AS INTEGER) FROM kv WHERE key = 'state_version'))
                ON CONFLICT(id, "table") DO UPDATE SET version = excluded.version;
            END;
        """)
        
    con.execute("""
        CREATE TRIGGER trg_habit_log_insert AFTER INSERT ON habit_log
        BEGIN
            INSERT INTO kv(key, value) VALUES('state_version', '1')
            ON CONFLICT(key) DO UPDATE SET value = CAST(value AS INTEGER) + 1;
            UPDATE habit_log SET version = (SELECT CAST(value AS INTEGER) FROM kv WHERE key = 'state_version')
            WHERE habit_id = NEW.habit_id AND "date" = NEW.date;
            DELETE FROM deleted_records WHERE id = (NEW.habit_id || ':' || NEW.date) AND "table" = 'habit_log';
        END;
    """)
    con.execute("""
        CREATE TRIGGER trg_habit_log_update AFTER UPDATE ON habit_log
        WHEN OLD.version = NEW.version OR (OLD.version IS NULL AND NEW.version IS NULL)
        BEGIN
            INSERT INTO kv(key, value) VALUES('state_version', '1')
            ON CONFLICT(key) DO UPDATE SET value = CAST(value AS INTEGER) + 1;
            UPDATE habit_log SET version = (SELECT CAST(value AS INTEGER) FROM kv WHERE key = 'state_version')
            WHERE habit_id = NEW.habit_id AND "date" = NEW.date;
        END;
    """)
    con.execute("""
        CREATE TRIGGER trg_habit_log_delete AFTER DELETE ON habit_log
        BEGIN
            INSERT INTO kv(key, value) VALUES('state_version', '1')
            ON CONFLICT(key) DO UPDATE SET value = CAST(value AS INTEGER) + 1;
            INSERT INTO deleted_records (id, "table", version)
            VALUES (OLD.habit_id || ':' || OLD.date, 'habit_log', (SELECT CAST(value AS INTEGER) FROM kv WHERE key = 'state_version'))
            ON CONFLICT(id, "table") DO UPDATE SET version = excluded.version;
        END;
    """)


def run_migrations():
    import re
    enable_auto_vacuum(DB_PATH)
    migrations_dir = os.path.join(BASE_DIR, "migrations")
    os.makedirs(migrations_dir, exist_ok=True)
    
    files = sorted(f for f in os.listdir(migrations_dir) if f.endswith(".sql"))
    
    migration_steps = []
    for f in files:
        m = re.match(r"^(\d{3})_.*\.sql$", f)
        if m:
            version = int(m.group(1))
            migration_steps.append((version, f))
            
    migration_steps.sort(key=lambda x: x[0])
    
    with db(write=True) as con:
        try:
            con.execute("BEGIN IMMEDIATE")
        except sqlite3.OperationalError:
            pass
            
        current_version = get_current_schema_version(con)

        # Check if we need to recreate the triggers to fix the incremental sync race condition
        trigger_row = con.execute("SELECT sql FROM sqlite_master WHERE type='trigger' AND name='trg_events_insert'").fetchone()
        if trigger_row and "COALESCE" in trigger_row["sql"]:
            print("Upgrading database triggers to support atomic state_version increments...")
            recreate_sync_triggers(con)
        
        for version, filename in migration_steps:
            if version > current_version:
                filepath = os.path.join(migrations_dir, filename)
                print(f"Running database migration {filename} (version {version})...")
                with open(filepath, "r", encoding="utf-8") as file_obj:
                    sql_content = file_obj.read()
                
                con.executescript(sql_content)
                
                con.execute(
                    "INSERT INTO kv(key, value) VALUES('db_version', ?) "
                    "ON CONFLICT(key) DO UPDATE SET value=excluded.value",
                    (str(version),)
                )
                current_version = version
                print(f"Migration {filename} completed.")

        # Bootstrap password hash from environment variable if not already set
        try:
            row = con.execute("SELECT value FROM kv WHERE key='password_hash'").fetchone()
            if not row and AUTH_PASSWORD:
                from werkzeug.security import generate_password_hash
                hashed = generate_password_hash(AUTH_PASSWORD)
                con.execute(
                    "INSERT INTO kv(key, value) VALUES('password_hash', ?) "
                    "ON CONFLICT(key) DO UPDATE SET value=excluded.value",
                    (hashed,)
                )
        except Exception as e:
            print("Warning: failed to bootstrap password hash:", e)

    update_auth_enabled()


def uid():
    return uuid.uuid4().hex[:12]


def q(col):
    return '"%s"' % col


# ---------------- rich-text (notes) HTML sanitizer ----------------
# The notes editor (Quill) stores rich HTML in notes.body. The generic CRUD API
# accepts a body from any authenticated client and that HTML is later re-rendered
# raw in exports / compiled notebooks, so we run it through a strict allowlist
# sanitizer server-side (defense in depth). Stdlib only — no new dependency.
import html as _html
from html.parser import HTMLParser as _HTMLParser

# tag -> set of attributes kept on that tag. class/style are needed for Quill
# formatting (alignment, indent, checklist markers, text/background color).
_SANITIZE_ALLOWED = {
    "p": {"class", "style"}, "br": set(), "span": {"class", "style"},
    "strong": set(), "em": set(), "u": set(), "s": set(), "b": set(), "i": set(),
    "h1": {"class", "style"}, "h2": {"class", "style"}, "h3": {"class", "style"},
    "h4": {"class", "style"}, "h5": {"class", "style"}, "h6": {"class", "style"},
    "ul": {"class"}, "ol": {"class"}, "li": {"class", "data-list"},
    "blockquote": {"class"}, "pre": {"class", "spellcheck"}, "code": {"class"},
    "div": {"class", "style"},
    # tables (quill-table-up + reasonable pasted-table support). style carries
    # table/cell geometry (width, height, border, background); inert data-*
    # attributes (cell ids, colspan/rowspan) are allowed generically below.
    "table": {"class", "style", "cellpadding", "cellspacing"},
    "thead": {"class"}, "tbody": {"class"}, "tfoot": {"class"}, "caption": {"class", "style"},
    "tr": {"class", "style", "data-row"}, "colgroup": {"class"},
    "col": {"span", "width", "class", "style"},
    "td": {"class", "style", "data-row", "rowspan", "colspan"},
    "th": {"class", "style", "data-row", "rowspan", "colspan", "scope"},
    "a": {"href", "title", "target", "rel", "class"},
    "img": {"src", "alt", "width", "height", "class", "style"},
    "sub": set(), "sup": set(), "hr": set(),
}
_SANITIZE_VOID = {"br", "hr", "img", "col"}
# these tags may carry inert data-* attributes; quill-table-up stores cell ids
# and span/geometry metadata there. Allowed only for table-structure tags.
_SANITIZE_DATA_TAGS = {"table", "thead", "tbody", "tfoot", "tr", "td", "th",
                       "col", "colgroup", "caption", "div"}
# tags whose *content* is dropped entirely, not just the tag
_SANITIZE_DROP_CONTENT = {
    "script", "style", "iframe", "object", "embed", "noscript",
    "template", "svg", "math", "link", "meta", "base", "form",
}
_SANITIZE_SAFE_STYLE = {"color", "background-color", "background", "text-align",
                        "width", "height", "margin", "margin-left", "margin-right",
                        "border", "border-color"}


class _HTMLSanitizer(_HTMLParser):
    def __init__(self):
        super().__init__(convert_charrefs=True)
        self.out = []
        self._skip_depth = 0   # inside a drop-content element
        self._open = []        # stack of emitted (balanced) tags

    def _clean_url(self, v, tag):
        u = (v or "").strip()
        low = u.lower().replace("\t", "").replace("\n", "").replace("\r", "")
        if low.startswith(("http://", "https://", "mailto:")) or u.startswith(("/", "#")):
            return u
        if tag == "img" and low.startswith("data:image/"):
            return u
        return None

    def _clean_style(self, v):
        props = []
        for decl in (v or "").split(";"):
            name, sep, val = decl.partition(":")
            if not sep:
                continue
            name = name.strip().lower()
            val = val.strip()
            low = val.lower()
            if name not in _SANITIZE_SAFE_STYLE:
                continue
            if not val or "url(" in low or "expression" in low or "javascript:" in low or "<" in low:
                continue
            props.append("%s: %s" % (name, val))
        return "; ".join(props)

    def handle_starttag(self, tag, attrs):
        tag = tag.lower()
        if tag in _SANITIZE_DROP_CONTENT:
            self._skip_depth += 1
            return
        if self._skip_depth or tag not in _SANITIZE_ALLOWED:
            return
        allowed = _SANITIZE_ALLOWED[tag]
        parts = []
        for k, val in attrs:
            k = (k or "").lower()
            is_data = k.startswith("data-") and tag in _SANITIZE_DATA_TAGS
            if k.startswith("on") or (k not in allowed and not is_data):
                continue
            if val is None:
                parts.append(" " + k)
                continue
            if k in ("href", "src"):
                val = self._clean_url(val, tag)
                if val is None:
                    continue
            elif k == "style":
                val = self._clean_style(val)
                if not val:
                    continue
            parts.append(' %s="%s"' % (k, _html.escape(val, quote=True)))
        self.out.append("<%s%s>" % (tag, "".join(parts)))
        if tag not in _SANITIZE_VOID:
            self._open.append(tag)

    def handle_startendtag(self, tag, attrs):
        self.handle_starttag(tag, attrs)
        t = tag.lower()
        # self-closed non-void element: balance it immediately
        if not self._skip_depth and t in _SANITIZE_ALLOWED and t not in _SANITIZE_VOID:
            if self._open and self._open[-1] == t:
                self._open.pop()
                self.out.append("</%s>" % t)

    def handle_endtag(self, tag):
        tag = tag.lower()
        if tag in _SANITIZE_DROP_CONTENT:
            if self._skip_depth:
                self._skip_depth -= 1
            return
        if self._skip_depth or tag in _SANITIZE_VOID or tag not in _SANITIZE_ALLOWED:
            return
        if tag in self._open:
            while self._open:
                t = self._open.pop()
                self.out.append("</%s>" % t)
                if t == tag:
                    break

    def handle_data(self, data):
        if self._skip_depth:
            return
        self.out.append(_html.escape(data, quote=False))


def sanitize_note_html(html_str):
    """Return an XSS-safe subset of *html_str* for storing/rendering note bodies."""
    if not html_str or not isinstance(html_str, str):
        return html_str
    p = _HTMLSanitizer()
    p.feed(html_str)
    p.close()
    while p._open:
        p.out.append("</%s>" % p._open.pop())
    return "".join(p.out)


# ---------------- note version history ----------------
# One snapshot at most per bucket of editing; keep the newest N per note.
NOTE_REVISION_BUCKET_MS = 10 * 60 * 1000   # ~10 minutes
NOTE_REVISION_CAP = 50


def record_note_revision(con, note_id, title, body, body_format, created_ts, force=False):
    """Snapshot a note's prior content into note_revisions (time-bucketed).

    Called inside an existing write transaction with the *pre-update* content.
    Skips empty bodies and, unless *force*, skips if the newest revision is
    younger than the bucket window. Prunes to the newest NOTE_REVISION_CAP.
    """
    if not body:
        return
    try:
        created_ts = int(created_ts)
    except (TypeError, ValueError):
        created_ts = 0
    if not created_ts:
        created_ts = int(time.time() * 1000)
    if not force:
        row = con.execute(
            "SELECT created FROM note_revisions WHERE note_id=? ORDER BY created DESC LIMIT 1",
            (note_id,),
        ).fetchone()
        if row and (created_ts - int(row["created"])) < NOTE_REVISION_BUCKET_MS:
            return
    con.execute(
        "INSERT INTO note_revisions(id, note_id, title, body, body_format, created) "
        "VALUES(?,?,?,?,?,?)",
        (uid(), note_id, title, body, body_format or "html", created_ts),
    )
    con.execute(
        "DELETE FROM note_revisions WHERE note_id=? AND id NOT IN "
        "(SELECT id FROM note_revisions WHERE note_id=? ORDER BY created DESC LIMIT ?)",
        (note_id, note_id, NOTE_REVISION_CAP),
    )


# ---------------- key-value store ----------------
def kv_get(key, default=None):
    with db() as con:
        row = con.execute("SELECT value FROM kv WHERE key=?", (key,)).fetchone()
        return row["value"] if row else default


def kv_set(key, value):
    with db(write=True) as con:
        con.execute("INSERT INTO kv(key,value) VALUES(?,?) "
                    "ON CONFLICT(key) DO UPDATE SET value=excluded.value", (key, str(value)))


def kv_del(key):
    with db(write=True) as con:
        con.execute("DELETE FROM kv WHERE key=?", (key,))


# ---------------- user settings (stored in kv with "set_" prefix) ----------------
SETTING_DEFAULTS = {
    "ntfy_server": "https://ntfy.sh",
    "ntfy_topic": "",
    "notify_agenda_time": "07:30",
    "notify_habit_time": "20:00",
    "notify_exam_days": "7,3,1",
    "cal_sync_urls": "",
    "cal_sync_hours": "6",
    # Empty = no custom accent: the frontend then uses the active theme's own
    # accent. (A hex default here would force stock blue over every theme.)
    "accent_color": "",
    "show_shortcuts": "1",
    "show_shortcuts_mobile": "0",
    "shortcut_order": "",
    "disabled_shortcuts": "",
    "persist_active_tab": "1",
    "task_categories": "School,Work,Personal",
    "app_theme_style": "default",
    "nav_layout": "topbar",
    "ui_density": "comfortable",   # compact | comfortable | spacious (CSS zoom)
    "week_start": "monday",        # monday | sunday
    "default_tab": "",             # tab to open when not persisting the last tab
    "sidebar_default_collapsed": "0",  # default rail state for new devices
    "dashboard_style": "glass",
    "dashboard_desktop_layout": "",
    "dashboard_mobile_layout": "",
    "dashboard_widgets_data": "{}",
    "app_timezone": "",
    "calendar_hidden_types": "[]",
    "calendar_colors": "{}",
    "ects_goal": "",
    "exam_trackers": "[]",
    "exam_tags": "[]",
    "note_tags": "[]",
    "music_volume": "1.0",
    "music_repeat": "off",
    "music_shuffle": "0",
    "goal_run_km": "",
    "goal_bike_km": "",
    "goal_swim_km": "",
    "goal_gym_sessions": "",
    "timer_hide": "0",     # no-distraction: hide the running-timer chips from nav
    "timer_push": "0",     # also push timer completion to phone (ntfy/web push)
}


def setting(key):
    return kv_get("set_" + key, SETTING_DEFAULTS.get(key, "")) or SETTING_DEFAULTS.get(key, "")


def app_tz():
    tz_str = setting("app_timezone")
    if tz_str:
        import zoneinfo
        try:
            return zoneinfo.ZoneInfo(tz_str)
        except Exception:
            pass
    return None


def local_now():
    tz = app_tz()
    if tz:
        return datetime.now(tz).replace(tzinfo=None)
    return datetime.now()


# ---------------- auth helpers ----------------
def feed_key():
    """Secret key that protects the calendar feed URL (no cookies there)."""
    k = kv_get("feed_key")
    if not k:
        k = secrets.token_urlsafe(16)
        kv_set("feed_key", k)
    return k


def totp_enabled():
    return kv_get("totp_secret") is not None


# ---------------- notifications (ntfy) ----------------
def ntfy_header(v):
    """HTTP headers are latin-1 only, so titles like "⏰ Timer" or
    "Your day — TyloPlanner" made requests raise and the push silently die.
    ntfy decodes RFC 2047, so non-latin-1 values get base64-encoded."""
    try:
        v.encode("latin-1")
        return v
    except UnicodeEncodeError:
        import base64
        return "=?UTF-8?B?" + base64.b64encode(v.encode("utf-8")).decode() + "?="


def ntfy_send(title, msg, tags=""):
    topic = setting("ntfy_topic")
    if not topic:
        return False
    server = setting("ntfy_server").rstrip("/")
    try:
        r = requests.post(server + "/" + topic, data=msg.encode("utf-8"),
                          headers={"Title": ntfy_header(title), "Tags": ntfy_header(tags)}, timeout=10)
        return r.status_code < 300
    except Exception as e:
        print("ntfy error:", e)
        return False


# ---------------- backup ----------------
def full_state_dict():
    out = {}
    with db() as con:
        for t in TABLES:
            out[t] = [dict(r) for r in con.execute("SELECT * FROM %s" % t)]
        out["habit_log"] = [dict(r) for r in con.execute("SELECT * FROM habit_log")]
    return out


def do_backup(today):
    """Write a JSON snapshot to BACKUP_DIR, keep the newest 14."""
    os.makedirs(BACKUP_DIR, exist_ok=True)
    path = os.path.join(BACKUP_DIR, "backup-%s.json" % today)
    with open(path, "w") as f:
        json.dump(full_state_dict(), f)
    kv_set("last_backup", today)
    files = sorted(f for f in os.listdir(BACKUP_DIR)
                   if f.startswith("backup-") and f.endswith(".json"))
    for old in files[:-14]:
        os.remove(os.path.join(BACKUP_DIR, old))
    return path


# ---------------- version & updates check ----------------
def check_version(force=False):
    """
    Checks if a newer version of TyloPlanner is available on GitHub.
    Caches the result for 24 hours in the kv table to avoid rate limits.
    """
    now = int(time.time())
    last_check_str = kv_get("last_version_check")
    last_check = int(last_check_str) if last_check_str and last_check_str.isdigit() else 0
    cached_latest = kv_get("latest_version_cached", VERSION)

    # 24 hours = 86400 seconds
    if not force and (now - last_check < 86400):
        latest = cached_latest
    else:
        try:
            r = requests.get(
                "https://api.github.com/repos/xdTYLOOFANCY/tyloplanner/releases/latest",
                headers={"User-Agent": "TyloPlanner-App"},
                timeout=2.0
            )
            if r.status_code == 200:
                data = r.json()
                latest = data.get("tag_name", VERSION).lstrip("v")
                kv_set("last_version_check", str(now))
                kv_set("latest_version_cached", latest)
            else:
                latest = cached_latest
        except Exception:
            latest = cached_latest

    # Simple semver-like comparison
    def parse_version(v_str):
        return [int(x) for x in v_str.lstrip("v").split(".") if x.isdigit()]

    try:
        current_parsed = parse_version(VERSION)
        latest_parsed = parse_version(latest)
        update_available = latest_parsed > current_parsed
    except Exception:
        update_available = latest != VERSION

    # If the running VERSION has caught up with (or exceeded) the cached latest,
    # invalidate the cache so a fresh check runs on the next request.
    # This prevents a stale "update available" banner after a server upgrade.
    if not update_available:
        cached = kv_get("latest_version_cached")
        if cached and cached != VERSION:
            kv_del("last_version_check")
            kv_del("latest_version_cached")

    return {
        "current": VERSION,
        "latest": latest,
        "update_available": update_available
    }


# ---------------- native web push & general notifications ----------------
def vapid_keys():
    """Get or generate VAPID private and public keys."""
    priv_key_pem = kv_get("vapid_private_pem")
    pub_key_b64 = kv_get("vapid_public_b64")
    if not priv_key_pem or not pub_key_b64:
        try:
            from cryptography.hazmat.primitives.asymmetric import ec
            from cryptography.hazmat.primitives import serialization
            import base64
            
            # Generate SECP256R1 keys
            private_key = ec.generate_private_key(ec.SECP256R1())
            public_key = private_key.public_key()
            
            # PEM formatted private key
            priv_key_pem = private_key.private_bytes(
                encoding=serialization.Encoding.PEM,
                format=serialization.PrivateFormat.PKCS8,
                encryption_algorithm=serialization.NoEncryption()
            ).decode('utf-8')
            
            # Uncompressed SEC1 public key point (65 bytes)
            public_bytes = public_key.public_bytes(
                encoding=serialization.Encoding.X962,
                format=serialization.PublicFormat.UncompressedPoint
            )
            pub_key_b64 = base64.urlsafe_b64encode(public_bytes).decode('utf-8').rstrip('=')
            
            kv_set("vapid_private_pem", priv_key_pem)
            kv_set("vapid_public_b64", pub_key_b64)
        except (ImportError, ModuleNotFoundError) as e:
            print(f"Warning: cryptography module is not installed. VAPID keys cannot be generated. Details: {e}")
            return "", ""
    return priv_key_pem, pub_key_b64


def webpush_send(title, msg, tags=""):
    """Encrypt and send a Web Push notification to all active browser subscriptions."""
    try:
        from pywebpush import webpush, WebPushException
        from py_vapid import Vapid
    except (ImportError, ModuleNotFoundError) as e:
        print(f"Warning: pywebpush or py-vapid module is not installed. Web Push notifications are disabled. Details: {e}")
        return False
    
    priv_key_pem, _ = vapid_keys()
    if not priv_key_pem:
        print("Warning: Web Push notifications skipped because VAPID private key is not generated/available.")
        return False
        
    vapid_key = Vapid.from_pem(priv_key_pem.encode('utf-8'))
    
    with db() as con:
        subs = [dict(r) for r in con.execute("SELECT * FROM push_subscriptions")]
        
    if not subs:
        return True
        
    payload = json.dumps({
        "title": title,
        "body": msg,
        "tags": tags
    })
    
    expired_ids = []
    success = True
    for s in subs:
        try:
            sub_info = json.loads(s["subscription_json"])
            webpush(
                subscription_info=sub_info,
                data=payload,
                vapid_private_key=vapid_key,
                vapid_claims={"sub": "mailto:admin@tyloplanner.com"}
            )
        except WebPushException as ex:
            if ex.response is not None and ex.response.status_code in (410, 404):
                expired_ids.append(s["id"])
            else:
                print(f"Web Push delivery failed for subscription {s['id']}: {ex}")
                success = False
        except Exception as ex:
            print(f"Web Push error for subscription {s['id']}: {ex}")
            success = False
            
    if expired_ids:
        with db(write=True) as con:
            for eid in expired_ids:
                con.execute("DELETE FROM push_subscriptions WHERE id=?", (eid,))
                
    return success


def send_notification(title, msg, tags=""):
    """Unified helper to send a notification to both ntfy and registered Native Web Push clients."""
    ntfy_ok = ntfy_send(title, msg, tags)
    webpush_ok = webpush_send(title, msg, tags)
    return ntfy_ok or webpush_ok


# ---------------- authentication helpers ----------------
def is_auth_setup_complete():
    try:
        complete = kv_get("auth_setup_complete") == "true"
        if not complete and AUTH_PASSWORD:
            # Seamless migration for existing users with .env
            from werkzeug.security import generate_password_hash
            kv_set("password_hash", generate_password_hash(AUTH_PASSWORD))
            kv_set("admin_username", AUTH_USERNAME)
            kv_set("auth_setup_complete", "true")
            return True
        return complete
    except Exception:
        return False


def verify_password(pw):
    import hmac
    from werkzeug.security import check_password_hash
    hash_val = kv_get("password_hash")
    if hash_val:
        return check_password_hash(hash_val, pw)
    if AUTH_PASSWORD:
        return hmac.compare_digest(pw, AUTH_PASSWORD)
    return False


def set_password(pw):
    from werkzeug.security import generate_password_hash
    kv_set("password_hash", generate_password_hash(pw))
    global AUTH_ENABLED
    AUTH_ENABLED = True


def get_auth_username():
    return kv_get("admin_username") or AUTH_USERNAME


def get_oauth_providers():
    providers = []
    # Check Github
    if kv_get("oauth_github_client_id") and kv_get("oauth_github_linked_user_id"):
        providers.append("github")
    # Check Google
    if kv_get("oauth_google_client_id") and kv_get("oauth_google_linked_user_id"):
        providers.append("google")
    return providers


def update_auth_enabled():
    global AUTH_ENABLED
    try:
        # Check if kv table exists and has password_hash or oauth
        has_hash = bool(kv_get("password_hash"))
        has_oauth = bool(get_oauth_providers())
    except Exception:
        has_hash = False
        has_oauth = False
    AUTH_ENABLED = has_hash or has_oauth or bool(AUTH_PASSWORD)


# Run initial check at import time
update_auth_enabled()


# ---------------- asset versioning / cache-busting ----------------
_ASSET_VERSION = None

def get_asset_version():
    global _ASSET_VERSION
    if _ASSET_VERSION is None:
        import hashlib
        h = hashlib.sha256()
        static_dir = os.path.join(BASE_DIR, "static")
        files_to_hash = []
        if os.path.exists(static_dir):
            for root, dirs, files in os.walk(static_dir):
                for file in files:
                    if file in ("sw.js", "index.html", "login.html", "manifest.json") or file.startswith("."):
                        continue
                    files_to_hash.append(os.path.join(root, file))
            files_to_hash.sort()
            for filepath in files_to_hash:
                try:
                    with open(filepath, "rb") as f:
                        h.update(os.path.relpath(filepath, static_dir).encode("utf-8"))
                        while chunk := f.read(8192):
                            h.update(chunk)
                except Exception:
                    pass
        _ASSET_VERSION = f"{VERSION}-{h.hexdigest()[:8]}"
    return _ASSET_VERSION


def get_rendered_file(filename):
    import re
    static_dir = os.path.join(BASE_DIR, "static")
    filepath = os.path.join(static_dir, filename)
    with open(filepath, "r", encoding="utf-8") as f:
        content = f.read()
    
    version = get_asset_version()
    
    if filename in ("index.html", "login.html", "setup.html"):
        pattern = r'(href|src)="((?!https?://|//)[^"]+\.(?:css|js))(?:\?v=[^"]*)?"'
        content = re.sub(pattern, rf'\1="\2?v={version}"', content)
    elif filename == "sw.js":
        content = re.sub(r'const\s+CACHE\s*=\s*["\']([^"\']+)["\']', rf'const CACHE = "tylo-{version}"', content)
        content = content.replace('caches.match(e.request)', 'caches.match(e.request, {ignoreSearch: true})')
        
    return content


