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
VERSION = "1.4.0"

os.makedirs(os.path.dirname(DB_PATH), exist_ok=True)
os.makedirs(UPLOAD_DIR, exist_ok=True)

# ---------------- schema ----------------
SCHEMA = """
CREATE TABLE IF NOT EXISTS events(
  id TEXT PRIMARY KEY, "date" TEXT, "start" TEXT, "end" TEXT,
  title TEXT, type TEXT DEFAULT 'other', source TEXT DEFAULT 'local',
  description TEXT, location TEXT, recurrence TEXT DEFAULT 'none',
  recurrence_until TEXT, reminder_offset INTEGER DEFAULT -1);
CREATE TABLE IF NOT EXISTS exams(
  id TEXT PRIMARY KEY, name TEXT, "date" TEXT, grade REAL, ects REAL);
CREATE TABLE IF NOT EXISTS habits(
  id TEXT PRIMARY KEY, name TEXT, created TEXT);
CREATE TABLE IF NOT EXISTS habit_log(
  habit_id TEXT, "date" TEXT, PRIMARY KEY(habit_id, "date"));
CREATE TABLE IF NOT EXISTS workouts(
  id TEXT PRIMARY KEY, type TEXT, "date" TEXT, dur REAL, dist REAL,
  note TEXT, source TEXT DEFAULT 'manual', ext_id TEXT);
CREATE TABLE IF NOT EXISTS tasks(
  id TEXT PRIMARY KEY, name TEXT, done INTEGER DEFAULT 0,
  created TEXT, completed_at TEXT, due TEXT,
  category TEXT, order_index INTEGER DEFAULT 0, due_date TEXT, parent_id TEXT);
CREATE TABLE IF NOT EXISTS notes(
  id TEXT PRIMARY KEY, title TEXT, body TEXT, updated INTEGER, is_pinned INTEGER DEFAULT 0, folder_id TEXT);
CREATE TABLE IF NOT EXISTS note_folders(
  id TEXT PRIMARY KEY, name TEXT, parent_id TEXT, icon TEXT, order_index INTEGER DEFAULT 0);
CREATE TABLE IF NOT EXISTS files(
  id TEXT PRIMARY KEY, filename TEXT, size INTEGER, mimetype TEXT, uploaded INTEGER, is_pinned INTEGER DEFAULT 0, folder_id TEXT);
CREATE TABLE IF NOT EXISTS folders(
  id TEXT PRIMARY KEY, name TEXT, parent_id TEXT, icon TEXT);
CREATE TABLE IF NOT EXISTS shortcuts(
  id TEXT PRIMARY KEY, name TEXT, url TEXT, icon TEXT);
CREATE TABLE IF NOT EXISTS study_sessions(
  id TEXT PRIMARY KEY, subject TEXT, "date" TEXT, duration REAL, completed INTEGER);
CREATE TABLE IF NOT EXISTS kv(key TEXT PRIMARY KEY, value TEXT);
CREATE TABLE IF NOT EXISTS push_subscriptions(id TEXT PRIMARY KEY, subscription_json TEXT, created_at INTEGER);
"""

# whitelisted writable columns per table (id is managed by the server)
TABLES = {
    "events":   ["date", "start", "end", "title", "type", "source", "description", "location", "recurrence", "recurrence_until", "reminder_offset"],
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


# ---------------- database ----------------
@contextmanager
def db():
    con = sqlite3.connect(DB_PATH)
    con.execute("PRAGMA journal_mode=WAL;")
    con.row_factory = sqlite3.Row
    try:
        with con:
            yield con
    finally:
        con.close()


def _ensure_column(con, table, col, decl):
    cols = [r["name"] for r in con.execute("PRAGMA table_info(%s)" % table)]
    if col not in cols:
        con.execute("ALTER TABLE %s ADD COLUMN %s" % (table, decl))


def uid():
    return uuid.uuid4().hex[:12]


def q(col):
    return '"%s"' % col


# ---------------- key-value store ----------------
def kv_get(key, default=None):
    with db() as con:
        row = con.execute("SELECT value FROM kv WHERE key=?", (key,)).fetchone()
        return row["value"] if row else default


def kv_set(key, value):
    with db() as con:
        con.execute("INSERT INTO kv(key,value) VALUES(?,?) "
                    "ON CONFLICT(key) DO UPDATE SET value=excluded.value", (key, str(value)))


def kv_del(key):
    with db() as con:
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
    return priv_key_pem, pub_key_b64


def webpush_send(title, msg, tags=""):
    """Encrypt and send a Web Push notification to all active browser subscriptions."""
    from pywebpush import webpush, WebPushException
    from py_vapid import Vapid
    
    priv_key_pem, _ = vapid_keys()
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
        with db() as con:
            for eid in expired_ids:
                con.execute("DELETE FROM push_subscriptions WHERE id=?", (eid,))
                
    return success


def send_notification(title, msg, tags=""):
    """Unified helper to send a notification to both ntfy and registered Native Web Push clients."""
    ntfy_ok = ntfy_send(title, msg, tags)
    webpush_ok = webpush_send(title, msg, tags)
    return ntfy_ok or webpush_ok
