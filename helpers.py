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

os.makedirs(os.path.dirname(DB_PATH), exist_ok=True)
os.makedirs(UPLOAD_DIR, exist_ok=True)

# ---------------- schema ----------------
SCHEMA = """
CREATE TABLE IF NOT EXISTS events(
  id TEXT PRIMARY KEY, "date" TEXT, "start" TEXT, "end" TEXT,
  title TEXT, type TEXT DEFAULT 'other', source TEXT DEFAULT 'local');
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
  created TEXT, completed_at TEXT);
CREATE TABLE IF NOT EXISTS notes(
  id TEXT PRIMARY KEY, title TEXT, body TEXT, updated INTEGER, is_pinned INTEGER DEFAULT 0);
CREATE TABLE IF NOT EXISTS files(
  id TEXT PRIMARY KEY, filename TEXT, size INTEGER, mimetype TEXT, uploaded INTEGER, is_pinned INTEGER DEFAULT 0);
CREATE TABLE IF NOT EXISTS shortcuts(
  id TEXT PRIMARY KEY, name TEXT, url TEXT, icon TEXT);
CREATE TABLE IF NOT EXISTS kv(key TEXT PRIMARY KEY, value TEXT);
"""

# whitelisted writable columns per table (id is managed by the server)
TABLES = {
    "events":   ["date", "start", "end", "title", "type", "source"],
    "exams":    ["name", "date", "grade", "ects"],
    "habits":   ["name", "created"],
    "workouts": ["type", "date", "dur", "dist", "note", "source", "ext_id"],
    "tasks":    ["name", "done", "created", "completed_at"],
    "notes":    ["title", "body", "updated", "is_pinned"],
    "files":    ["filename", "size", "mimetype", "uploaded", "is_pinned"],
    "shortcuts":["name", "url", "icon"],
}


# ---------------- database ----------------
def db():
    con = sqlite3.connect(DB_PATH)
    con.row_factory = sqlite3.Row
    return con


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
}


def setting(key):
    return kv_get("set_" + key, SETTING_DEFAULTS.get(key, "")) or SETTING_DEFAULTS.get(key, "")


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
