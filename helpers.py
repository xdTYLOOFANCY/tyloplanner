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
import functools
from datetime import datetime
from contextlib import contextmanager

import requests

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
VERSION = "1.5.38"

os.makedirs(os.path.dirname(DB_PATH), exist_ok=True)
os.makedirs(UPLOAD_DIR, exist_ok=True)

# ---------------- whitelisted writable columns ----------------
# whitelisted writable columns per table (id is managed by the server)
TABLES = {
    "events":   ["date", "start", "end", "title", "type", "source", "description", "location", "recurrence", "recurrence_until", "reminder_offset", "end_date", "recurrence_interval", "recurrence_days", "recurrence_count", "excluded_dates", "color"],
    "exams":    ["name", "date", "grade", "ects"],
    "habits":   ["name", "created"],
    "workouts": ["type", "date", "dur", "dist", "note", "source", "ext_id"],
    "tasks":    ["name", "done", "created", "completed_at", "due", "category", "order_index", "due_date", "parent_id"],
    "notes":    ["title", "body", "updated", "is_pinned", "folder_id"],
    "note_folders": ["name", "parent_id", "icon", "order_index"],
    "files":    ["filename", "size", "mimetype", "uploaded", "is_pinned", "folder_id"],
    "folders":  ["name", "parent_id", "icon"],
    "shortcuts":["name", "url", "icon"],
    "study_sessions": ["subject", "date", "duration", "completed"],
}


# Thread-safe lock for write transactions to prevent SQLite write lock contention/deadlocks.
# We use RLock (Reentrant Lock) to allow safe nested/recursive acquisitions in the same thread.
db_write_lock = threading.RLock()


def db_retry(max_retries=5, initial_delay=0.05, backoff_factor=2.0):
    """
    Decorator to retry database write functions if they fail with sqlite3.OperationalError (e.g. database is locked).
    """
    def decorator(func):
        @functools.wraps(func)
        def wrapper(*args, **kwargs):
            delay = initial_delay
            for attempt in range(max_retries + 1):
                try:
                    return func(*args, **kwargs)
                except sqlite3.OperationalError as e:
                    if "locked" in str(e).lower() and attempt < max_retries:
                        time.sleep(delay)
                        delay *= backoff_factor
                    else:
                        raise
            # Fallback (should not be reached due to raise in else)
            return func(*args, **kwargs)
        return wrapper
    return decorator


def http_retry(max_retries=3, initial_delay=1.0, backoff_factor=2.0, status_codes=None):
    """
    Decorator to retry external HTTP calls if they fail due to transient network issues,
    rate-limiting (HTTP 429), or temporary server errors (5xx).
    """
    if status_codes is None:
        status_codes = {429, 500, 502, 503, 504}

    def decorator(func):
        @functools.wraps(func)
        def wrapper(*args, **kwargs):
            delay = initial_delay
            for attempt in range(max_retries + 1):
                try:
                    res = func(*args, **kwargs)
                    if isinstance(res, requests.Response):
                        if res.status_code in status_codes:
                            res.raise_for_status()
                    return res
                except requests.RequestException as e:
                    # If it's an HTTPError, check if we should retry based on status code.
                    # Non-transient status codes (like 400, 401, 403, 404) should not be retried.
                    if isinstance(e, requests.exceptions.HTTPError) and e.response is not None:
                        if e.response.status_code not in status_codes:
                            raise
                    
                    if attempt < max_retries:
                        print(f"HTTP request failed: {e}. Retrying in {delay:.2f}s... (Attempt {attempt + 1}/{max_retries})")
                        time.sleep(delay)
                        delay *= backoff_factor
                    else:
                        raise
            # Fallback (should not be reached due to raise in else/except)
            return func(*args, **kwargs)
        return wrapper
    return decorator


@http_retry()
def http_get(url, **kwargs):
    """Wrapper around requests.get with HTTP retry logic."""
    return requests.get(url, **kwargs)


@http_retry()
def http_post(url, **kwargs):
    """Wrapper around requests.post with HTTP retry logic."""
    return requests.post(url, **kwargs)




def is_write_request():
    try:
        from flask import has_request_context, request
        if has_request_context():
            return request.method not in ("GET", "HEAD", "OPTIONS")
    except ImportError:
        pass
    return False


def _begin_immediate_with_retry(con):
    """Starts a BEGIN IMMEDIATE write transaction with retry/exponential backoff."""
    if not con.in_transaction:
        max_retries = 5
        delay = 0.05
        backoff_factor = 2.0
        for attempt in range(max_retries + 1):
            try:
                con.execute("BEGIN IMMEDIATE")
                break
            except sqlite3.OperationalError as e:
                if "locked" in str(e).lower() and attempt < max_retries:
                    time.sleep(delay)
                    delay *= backoff_factor
                else:
                    raise


# ---------------- database ----------------
@contextmanager
def db(write=None):
    if write is None:
        write = is_write_request()

    lock_acquired = False
    if write:
        db_write_lock.acquire()
        lock_acquired = True

    try:
        has_app = False
        try:
            from flask import g, has_app_context
            has_app = has_app_context()
        except ImportError:
            pass

        if has_app:
            if not hasattr(g, "db_conn"):
                con = sqlite3.connect(DB_PATH, timeout=10.0)
                con.execute("PRAGMA journal_mode=WAL;")
                con.execute("PRAGMA busy_timeout = 5000;")
                con.execute("PRAGMA foreign_keys = ON;")
                con.row_factory = sqlite3.Row
                g.db_conn = con
            else:
                con = g.db_conn

            if write:
                _begin_immediate_with_retry(con)

            try:
                with con:
                    yield con
            except Exception:
                raise
        else:
            con = sqlite3.connect(DB_PATH, timeout=10.0)
            con.execute("PRAGMA journal_mode=WAL;")
            con.execute("PRAGMA busy_timeout = 5000;")
            con.execute("PRAGMA foreign_keys = ON;")
            con.row_factory = sqlite3.Row
            if write:
                _begin_immediate_with_retry(con)
            try:
                with con:
                    yield con
            finally:
                con.close()
    finally:
        if lock_acquired:
            db_write_lock.release()


def close_db(e=None):
    try:
        from flask import g
        con = getattr(g, "db_conn", None)
        if con is not None:
            try:
                con.execute("PRAGMA optimize;")
            except Exception:
                pass
            con.close()
    except Exception:
        pass


def get_current_schema_version(con):
    res = con.execute("SELECT name FROM sqlite_master WHERE type='table' AND name='kv'").fetchone()
    if not res:
        return 0
    
    try:
        db_ver = con.execute("SELECT value FROM kv WHERE key='db_version'").fetchone()
        if db_ver:
            return int(db_ver["value"])
    except Exception:
        pass
        
    try:
        note_cols = [r["name"] for r in con.execute("PRAGMA table_info(notes)").fetchall()]
    except Exception:
        note_cols = []
        
    try:
        task_cols = [r["name"] for r in con.execute("PRAGMA table_info(tasks)").fetchall()]
    except Exception:
        task_cols = []
        
    try:
        event_cols = [r["name"] for r in con.execute("PRAGMA table_info(events)").fetchall()]
    except Exception:
        event_cols = []
        
    try:
        has_fts = con.execute("SELECT name FROM sqlite_master WHERE type='table' AND name='notes_fts'").fetchone()
    except Exception:
        has_fts = None

    try:
        has_deleted_records = con.execute("SELECT name FROM sqlite_master WHERE type='table' AND name='deleted_records'").fetchone()
    except Exception:
        has_deleted_records = None

    if has_deleted_records:
        version = 6
    elif has_fts:
        version = 5
    elif "parent_id" in task_cols:
        version = 4
    elif "recurrence" in event_cols:
        version = 3
    elif "is_pinned" in note_cols:
        version = 2
    else:
        tables = con.execute("SELECT name FROM sqlite_master WHERE type='table'").fetchall()
        if len(tables) > 0:
            version = 1
        else:
            version = 0
            
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


@db_retry()
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


# ---------------- key-value store ----------------
def kv_get(key, default=None):
    with db() as con:
        row = con.execute("SELECT value FROM kv WHERE key=?", (key,)).fetchone()
        return row["value"] if row else default


@db_retry()
def kv_set(key, value):
    with db(write=True) as con:
        con.execute("INSERT INTO kv(key,value) VALUES(?,?) "
                    "ON CONFLICT(key) DO UPDATE SET value=excluded.value", (key, str(value)))


@db_retry()
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
    "accent_color": "#4f8cff",
    "show_shortcuts": "1",
    "shortcut_order": "",
    "disabled_shortcuts": "",
    "persist_active_tab": "1",
    "task_categories": "School,Work,Personal",
    "app_theme_style": "default",
    "dashboard_style": "glass",
    "dashboard_desktop_layout": "",
    "dashboard_mobile_layout": "",
    "dashboard_widgets_data": "{}",
    "app_timezone": "",
    "calendar_hidden_types": "[]",
    "calendar_colors": "{}",
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
def ntfy_send(title, msg, tags=""):
    topic = setting("ntfy_topic")
    if not topic:
        return False
    server = setting("ntfy_server").rstrip("/")
    try:
        r = requests.post(server + "/" + topic, data=msg.encode("utf-8"),
                          headers={"Title": title, "Tags": tags}, timeout=10)
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
def verify_password(pw):
    import hmac
    from werkzeug.security import check_password_hash
    hash_val = kv_get("password_hash")
    if hash_val:
        return check_password_hash(hash_val, pw)
    return hmac.compare_digest(pw, AUTH_PASSWORD)


def set_password(pw):
    from werkzeug.security import generate_password_hash
    kv_set("password_hash", generate_password_hash(pw))
    global AUTH_ENABLED
    AUTH_ENABLED = True


def update_auth_enabled():
    global AUTH_ENABLED
    try:
        # Check if kv table exists and has password_hash
        has_hash = bool(kv_get("password_hash"))
    except Exception:
        has_hash = False
    AUTH_ENABLED = has_hash or bool(AUTH_PASSWORD)


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
    
    if filename in ("index.html", "login.html"):
        pattern = r'(href|src)="((?!https?://|//)[^"]+\.(?:css|js))(?:\?v=[^"]*)?"'
        content = re.sub(pattern, rf'\1="\2?v={version}"', content)
    elif filename == "sw.js":
        content = re.sub(r'const\s+CACHE\s*=\s*["\']([^"\']+)["\']', rf'const CACHE = "tylo-{version}"', content)
        content = content.replace('caches.match(e.request)', 'caches.match(e.request, {ignoreSearch: true})')
        
    return content


