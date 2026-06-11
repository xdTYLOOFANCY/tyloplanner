"""
TyloPlanner - self-hosted personal dashboard.
Flask + SQLite backend with session authentication, optional TOTP 2FA,
ntfy notifications, calendar auto-sync, and automatic backups.
See README.md for setup.
"""
import io
import os
import re
import hmac
import json
import time
import uuid
import secrets
import sqlite3
import threading
from datetime import datetime

import pyotp
import qrcode
import requests
from flask import Flask, request, jsonify, redirect, Response, session, send_file

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

app = Flask(__name__, static_folder="static", static_url_path="")

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
  id TEXT PRIMARY KEY, title TEXT, body TEXT, updated INTEGER);
CREATE TABLE IF NOT EXISTS files(
  id TEXT PRIMARY KEY, filename TEXT, size INTEGER, mimetype TEXT, uploaded INTEGER);
CREATE TABLE IF NOT EXISTS kv(key TEXT PRIMARY KEY, value TEXT);
"""

# whitelisted writable columns per table (id is managed by the server)
TABLES = {
    "events":   ["date", "start", "end", "title", "type", "source"],
    "exams":    ["name", "date", "grade", "ects"],
    "habits":   ["name", "created"],
    "workouts": ["type", "date", "dur", "dist", "note", "source", "ext_id"],
    "tasks":    ["name", "done", "created", "completed_at"],
    "notes":    ["title", "body", "updated"],
}


def db():
    con = sqlite3.connect(DB_PATH)
    con.row_factory = sqlite3.Row
    return con


with db() as con:
    con.executescript(SCHEMA)

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

*This note can be edited or deleted at any time — it will not come back.*\
"""

with db() as con:
    seeded = con.execute("SELECT value FROM kv WHERE key='seed_welcome_note'").fetchone()
    if not seeded:
        con.execute(
            "INSERT INTO notes(id,title,body,updated) VALUES(?,?,?,?)",
            (uuid.uuid4().hex[:12], _WELCOME_NOTE_TITLE, _WELCOME_NOTE_BODY, int(time.time() * 1000))
        )
        con.execute("INSERT INTO kv(key,value) VALUES('seed_welcome_note','1')")


def uid():
    return uuid.uuid4().hex[:12]


def q(col):
    return '"%s"' % col


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
}


def setting(key):
    return kv_get("set_" + key, SETTING_DEFAULTS.get(key, "")) or SETTING_DEFAULTS.get(key, "")


# ---------------- auth ----------------
# Session secret: from env, else generated once and stored in the database
# so logins survive restarts.
app.secret_key = os.environ.get("SECRET_KEY") or kv_get("secret_key")
if not app.secret_key:
    app.secret_key = secrets.token_hex(32)
    kv_set("secret_key", app.secret_key)


def feed_key():
    """Secret key that protects the calendar feed URL (no cookies there)."""
    k = kv_get("feed_key")
    if not k:
        k = secrets.token_urlsafe(16)
        kv_set("feed_key", k)
    return k


def totp_enabled():
    return kv_get("totp_secret") is not None


# Files the login page / PWA need before sign-in:
LOGIN_ASSETS = {"/login", "/login/2fa", "/style.css", "/logo.svg", "/favicon.ico",
                "/manifest.json", "/sw.js", "/icon-192.png", "/icon-512.png"}


@app.before_request
def guard():
    if not AUTH_ENABLED:
        return None
    p = request.path
    if p in LOGIN_ASSETS:
        return None
    if p == "/calendar.ics":
        if hmac.compare_digest(request.args.get("key", ""), feed_key()):
            return None
        return Response("Invalid or missing key. Get your feed URL from Settings.", 403)
    if session.get("auth"):
        return None
    if p.startswith("/api/"):
        return jsonify({"error": "unauthorized"}), 401
    return redirect("/login")


@app.get("/login")
def login_page():
    if not AUTH_ENABLED or session.get("auth"):
        return redirect("/")
    return app.send_static_file("login.html")


@app.post("/login")
def login_submit():
    u = request.form.get("username", "")
    pw = request.form.get("password", "")
    ok = (hmac.compare_digest(u, AUTH_USERNAME)
          and hmac.compare_digest(pw, AUTH_PASSWORD))
    if not ok:
        time.sleep(1)  # slow down brute force
        return redirect("/login?error=1")
    if totp_enabled():
        session["pre2fa"] = True
        return redirect("/login?step=2fa")
    session["auth"] = True
    session.permanent = True
    return redirect("/")


@app.post("/login/2fa")
def login_2fa():
    if not session.get("pre2fa"):
        return redirect("/login")
    code = request.form.get("code", "")
    secret = kv_get("totp_secret")
    if not secret or not pyotp.TOTP(secret).verify(code, valid_window=1):
        time.sleep(1)
        return redirect("/login?step=2fa&error=1")
    session.pop("pre2fa", None)
    session["auth"] = True
    session.permanent = True
    return redirect("/")


@app.get("/logout")
def logout():
    session.clear()
    return redirect("/login" if AUTH_ENABLED else "/")


# ---------------- 2FA management ----------------
@app.post("/api/2fa/setup")
def tfa_setup():
    secret = pyotp.random_base32()
    kv_set("totp_pending", secret)
    uri = pyotp.totp.TOTP(secret).provisioning_uri(name=AUTH_USERNAME, issuer_name="TyloPlanner")
    return jsonify({"secret": secret, "uri": uri})


@app.get("/api/2fa/qr")
def tfa_qr():
    secret = kv_get("totp_pending")
    if not secret:
        return jsonify({"error": "no 2FA setup in progress"}), 404
    uri = pyotp.totp.TOTP(secret).provisioning_uri(name=AUTH_USERNAME, issuer_name="TyloPlanner")
    img = qrcode.make(uri)
    buf = io.BytesIO()
    img.save(buf, format="PNG")
    return Response(buf.getvalue(), mimetype="image/png")


@app.post("/api/2fa/enable")
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


@app.post("/api/2fa/disable")
def tfa_disable():
    code = (request.get_json(force=True) or {}).get("code", "")
    secret = kv_get("totp_secret")
    if not secret:
        return jsonify({"error": "2FA is not enabled"}), 400
    if not pyotp.TOTP(secret).verify(code, valid_window=1):
        return jsonify({"error": "wrong code"}), 400
    kv_del("totp_secret")
    return jsonify({"ok": True})


# ---------------- static ----------------
@app.get("/")
def index():
    return app.send_static_file("index.html")


# ---------------- generic CRUD ----------------
@app.get("/api/state")
def get_state():
    out = {}
    with db() as con:
        for t in TABLES:
            out[t] = [dict(r) for r in con.execute("SELECT * FROM %s" % t)]
        out["habit_log"] = [dict(r) for r in con.execute("SELECT * FROM habit_log")]
        out["files"] = [dict(r) for r in con.execute("SELECT * FROM files ORDER BY uploaded DESC")]
    out["strava"] = {
        "configured": bool(strava_client_id() and strava_client_secret()),
        "from_env": bool(STRAVA_CLIENT_ID),
        "connected": kv_get("strava_refresh") is not None,
        "last_sync": kv_get("strava_last_sync"),
    }
    out["auth"] = {"enabled": AUTH_ENABLED, "totp": totp_enabled()}
    out["app_url"] = APP_URL
    out["feed_url"] = APP_URL + "/calendar.ics" + ("?key=" + feed_key() if AUTH_ENABLED else "")
    return jsonify(out)


@app.get("/api/settings")
def get_settings():
    out = {k: setting(k) for k in SETTING_DEFAULTS}
    out["totp_enabled"] = totp_enabled()
    out["last_backup"] = kv_get("last_backup")
    out["cal_last_sync"] = kv_get("cal_last_sync_human")
    return jsonify(out)


@app.post("/api/settings")
def set_settings():
    data = request.get_json(force=True) or {}
    for k in SETTING_DEFAULTS:
        if k in data:
            kv_set("set_" + k, str(data[k]).strip())
    return jsonify({"ok": True})


@app.post("/api/<table>")
def create_row(table):
    if table not in TABLES:
        return jsonify({"error": "unknown table"}), 404
    data = request.get_json(force=True) or {}
    cols = [c for c in TABLES[table] if c in data]
    rid = uid()
    sql = "INSERT INTO %s (id%s) VALUES (?%s)" % (
        table,
        "".join("," + q(c) for c in cols),
        ",?" * len(cols),
    )
    with db() as con:
        con.execute(sql, [rid] + [data[c] for c in cols])
    return jsonify({"id": rid})


@app.put("/api/<table>/<rid>")
def update_row(table, rid):
    if table not in TABLES:
        return jsonify({"error": "unknown table"}), 404
    data = request.get_json(force=True) or {}
    cols = [c for c in TABLES[table] if c in data]
    if not cols:
        return jsonify({"error": "no valid fields"}), 400
    sql = "UPDATE %s SET %s WHERE id=?" % (table, ",".join(q(c) + "=?" for c in cols))
    with db() as con:
        con.execute(sql, [data[c] for c in cols] + [rid])
    return jsonify({"ok": True})


@app.delete("/api/<table>/<rid>")
def delete_row(table, rid):
    if table not in TABLES:
        return jsonify({"error": "unknown table"}), 404
    with db() as con:
        con.execute("DELETE FROM %s WHERE id=?" % table, (rid,))
        if table == "habits":
            con.execute("DELETE FROM habit_log WHERE habit_id=?", (rid,))
    return jsonify({"ok": True})


@app.post("/api/habits/<hid>/toggle")
def toggle_habit(hid):
    d = (request.get_json(force=True) or {}).get("date")
    if not d:
        return jsonify({"error": "date required"}), 400
    with db() as con:
        row = con.execute('SELECT 1 FROM habit_log WHERE habit_id=? AND "date"=?', (hid, d)).fetchone()
        if row:
            con.execute('DELETE FROM habit_log WHERE habit_id=? AND "date"=?', (hid, d))
            return jsonify({"on": False})
        con.execute('INSERT INTO habit_log(habit_id,"date") VALUES(?,?)', (hid, d))
        return jsonify({"on": True})


# ---------------- file storage ----------------
@app.post("/api/files/upload")
def upload_file():
    f = request.files.get("file")
    if not f:
        return jsonify({"error": "no file provided"}), 400
    fid = uid()
    original_name = os.path.basename(f.filename or "upload")
    disk_path = os.path.join(UPLOAD_DIR, fid)
    f.save(disk_path)
    size = os.path.getsize(disk_path)
    ts = int(time.time() * 1000)
    with db() as con:
        con.execute(
            "INSERT INTO files(id, filename, size, mimetype, uploaded) VALUES(?,?,?,?,?)",
            (fid, original_name, size, f.mimetype or "application/octet-stream", ts))
    return jsonify({"id": fid, "filename": original_name, "size": size})


@app.get("/api/files/<fid>/download")
def download_file(fid):
    with db() as con:
        row = con.execute("SELECT * FROM files WHERE id=?", (fid,)).fetchone()
    if not row:
        return jsonify({"error": "not found"}), 404
    disk_path = os.path.join(UPLOAD_DIR, fid)
    if not os.path.exists(disk_path):
        return jsonify({"error": "file missing from disk"}), 404
    return send_file(disk_path, as_attachment=True, download_name=row["filename"],
                     mimetype="application/octet-stream")


@app.delete("/api/files/<fid>")
def delete_file(fid):
    with db() as con:
        row = con.execute("SELECT id FROM files WHERE id=?", (fid,)).fetchone()
        if not row:
            return jsonify({"error": "not found"}), 404
        con.execute("DELETE FROM files WHERE id=?", (fid,))
    disk_path = os.path.join(UPLOAD_DIR, fid)
    if os.path.exists(disk_path):
        os.remove(disk_path)
    return jsonify({"ok": True})


# ---------------- backup / restore ----------------
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


@app.post("/api/backup/now")
def backup_now():
    path = do_backup(datetime.now().strftime("%Y-%m-%d"))
    return jsonify({"ok": True, "file": os.path.basename(path)})


@app.post("/api/restore")
def restore():
    data = request.get_json(force=True) or {}
    with db() as con:
        for t in list(TABLES) + ["habit_log"]:
            if t in data and isinstance(data[t], list):
                con.execute("DELETE FROM %s" % t)
                for row in data[t]:
                    if t == "habit_log":
                        con.execute('INSERT OR IGNORE INTO habit_log(habit_id,"date") VALUES(?,?)',
                                    (row.get("habit_id"), row.get("date")))
                    else:
                        cols = [c for c in TABLES[t] if c in row]
                        sql = "INSERT INTO %s (id%s) VALUES (?%s)" % (
                            t, "".join("," + q(c) for c in cols), ",?" * len(cols))
                        con.execute(sql, [row.get("id") or uid()] + [row[c] for c in cols])
    return jsonify({"ok": True})


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


@app.post("/api/notify/test")
def notify_test():
    if not setting("ntfy_topic"):
        return jsonify({"error": "set an ntfy topic first (and save)"}), 400
    ok = ntfy_send("TyloPlanner", "Test notification - it works! 🎉", "tada")
    if not ok:
        return jsonify({"error": "could not reach the ntfy server"}), 502
    return jsonify({"ok": True})


def send_agenda(today):
    """Morning push: today's events + upcoming exam alerts."""
    with db() as con:
        evs = [dict(r) for r in con.execute(
            'SELECT * FROM events WHERE "date"=? ORDER BY "start"', (today,))]
        exams = [dict(r) for r in con.execute("SELECT * FROM exams")]
    try:
        warn_days = {int(x) for x in setting("notify_exam_days").split(",") if x.strip().isdigit()}
    except ValueError:
        warn_days = {7, 3, 1}
    t0 = datetime.strptime(today, "%Y-%m-%d").date()
    lines = [((e["start"] + " ") if e["start"] else "") + (e["title"] or "") for e in evs]
    exl = []
    for x in exams:
        try:
            dd = (datetime.strptime(x["date"], "%Y-%m-%d").date() - t0).days
        except (ValueError, TypeError):
            continue
        if dd == 0:
            exl.append("%s is TODAY" % x["name"])
        elif dd in warn_days:
            exl.append("%s in %d day%s" % (x["name"], dd, "" if dd == 1 else "s"))
    if not lines and not exl:
        return
    msg = ""
    if lines:
        msg += "Today:\n- " + "\n- ".join(lines)
    if exl:
        msg += ("\n\n" if msg else "") + "Exams:\n- " + "\n- ".join(exl)
    ntfy_send("Your day — TyloPlanner", msg, "calendar")


def send_habit_nudge(today):
    """Evening push: habits not yet checked off today."""
    with db() as con:
        habits = [dict(r) for r in con.execute("SELECT * FROM habits")]
        done = {r["habit_id"] for r in con.execute(
            'SELECT habit_id FROM habit_log WHERE "date"=?', (today,))}
    open_ = [h["name"] for h in habits if h["id"] not in done]
    if open_:
        ntfy_send("Habit check-in", "Still open today:\n- " + "\n- ".join(open_), "white_check_mark")


# ---------------- background scheduler ----------------
def cal_auto_sync():
    urls = [u.strip() for u in setting("cal_sync_urls").splitlines() if u.strip()]
    total = 0
    for url in urls:
        if not url.lower().startswith(("http://", "https://")):
            continue
        try:
            r = requests.get(url, timeout=20)
            r.raise_for_status()
            total += import_ics_text(r.text)["added"]
        except Exception as e:
            print("calendar sync error for %s: %s" % (url, e))
    if urls:
        kv_set("cal_last_sync_human", datetime.now().isoformat(timespec="seconds"))
    return total


def scheduler_tick():
    now = datetime.now()
    today = now.strftime("%Y-%m-%d")
    hhmm = now.strftime("%H:%M")
    if hhmm >= setting("notify_agenda_time") and kv_get("done_agenda") != today:
        kv_set("done_agenda", today)
        send_agenda(today)
    if hhmm >= setting("notify_habit_time") and kv_get("done_habits") != today:
        kv_set("done_habits", today)
        send_habit_nudge(today)
    if hhmm >= "03:30" and kv_get("done_backup") != today:
        kv_set("done_backup", today)
        do_backup(today)
    try:
        hours = float(setting("cal_sync_hours") or 6)
    except ValueError:
        hours = 6
    last = float(kv_get("cal_sync_ts", "0") or 0)
    if setting("cal_sync_urls").strip() and time.time() - last > hours * 3600:
        kv_set("cal_sync_ts", time.time())
        cal_auto_sync()


def scheduler_loop():
    time.sleep(10)  # let the server come up first
    while True:
        try:
            scheduler_tick()
        except Exception as e:
            print("scheduler error:", e)
        time.sleep(60)


# ---------------- ICS export ----------------
def ics_escape(s):
    return (str(s or "").replace("\\", "\\\\").replace(";", "\\;")
            .replace(",", "\\,").replace("\n", "\\n"))


@app.get("/calendar.ics")
def ics_export():
    now = datetime.utcnow().strftime("%Y%m%dT%H%M%SZ")
    lines = ["BEGIN:VCALENDAR", "VERSION:2.0", "PRODID:-//TyloPlanner//EN",
             "CALSCALE:GREGORIAN", "X-WR-CALNAME:TyloPlanner"]
    with db() as con:
        for e in con.execute("SELECT * FROM events"):
            d = (e["date"] or "").replace("-", "")
            if not d:
                continue
            lines += ["BEGIN:VEVENT", "UID:%s@tyloplanner" % e["id"], "DTSTAMP:" + now]
            if e["start"]:
                st = e["start"].replace(":", "") + "00"
                lines.append("DTSTART:%sT%s" % (d, st))
                if e["end"]:
                    lines.append("DTEND:%sT%s00" % (d, e["end"].replace(":", "")))
            else:
                lines.append("DTSTART;VALUE=DATE:" + d)
            lines += ["SUMMARY:" + ics_escape(e["title"]), "END:VEVENT"]
        for x in con.execute("SELECT * FROM exams"):
            d = (x["date"] or "").replace("-", "")
            if not d:
                continue
            lines += ["BEGIN:VEVENT", "UID:%s@tyloplanner" % x["id"], "DTSTAMP:" + now,
                      "DTSTART;VALUE=DATE:" + d,
                      "SUMMARY:" + ics_escape("EXAM: " + (x["name"] or "")), "END:VEVENT"]
    lines.append("END:VCALENDAR")
    return Response("\r\n".join(lines) + "\r\n", mimetype="text/calendar",
                    headers={"Content-Disposition": "inline; filename=tyloplanner.ics"})


# ---------------- ICS import ----------------
def parse_ics(text):
    """Minimal tolerant ICS parser: returns list of {date,start,end,title}.
    Recurring events are imported as their first occurrence only."""
    text = text.replace("\r\n", "\n").replace("\r", "\n")
    text = re.sub(r"\n[ \t]", "", text)  # unfold continuation lines
    events = []
    for block in re.findall(r"BEGIN:VEVENT(.*?)END:VEVENT", text, re.S):
        props = {}
        for line in block.strip().split("\n"):
            if ":" not in line:
                continue
            head, val = line.split(":", 1)
            key = head.split(";")[0].upper()
            props[key] = (head, val.strip())
        if "DTSTART" not in props:
            continue
        _, dt = props["DTSTART"]
        m = re.match(r"(\d{4})(\d{2})(\d{2})(?:T(\d{2})(\d{2}))?", dt)
        if not m:
            continue
        d = "%s-%s-%s" % (m.group(1), m.group(2), m.group(3))
        start = "%s:%s" % (m.group(4), m.group(5)) if m.group(4) else ""
        end = ""
        if "DTEND" in props:
            m2 = re.match(r"(\d{4})(\d{2})(\d{2})(?:T(\d{2})(\d{2}))?", props["DTEND"][1])
            if m2 and m2.group(4) and "%s-%s-%s" % (m2.group(1), m2.group(2), m2.group(3)) == d:
                end = "%s:%s" % (m2.group(4), m2.group(5))
        title = props.get("SUMMARY", ("", "(no title)"))[1]
        title = title.replace("\\n", " ").replace("\\,", ",").replace("\\;", ";").replace("\\\\", "\\")
        events.append({"date": d, "start": start, "end": end, "title": title})
    return events


def import_ics_text(text):
    evs = parse_ics(text)
    added = 0
    with db() as con:
        for e in evs:
            dup = con.execute(
                'SELECT 1 FROM events WHERE "date"=? AND title=? AND "start"=?',
                (e["date"], e["title"], e["start"])).fetchone()
            if dup:
                continue
            con.execute(
                'INSERT INTO events(id,"date","start","end",title,type,source) '
                "VALUES(?,?,?,?,?,?,?)",
                (uid(), e["date"], e["start"], e["end"], e["title"], "other", "ics"))
            added += 1
    return {"found": len(evs), "added": added}


@app.post("/api/ics/import")
def ics_import():
    text = None
    if "file" in request.files:
        text = request.files["file"].read().decode("utf-8", errors="replace")
    else:
        data = request.get_json(silent=True) or {}
        url = data.get("url")
        if url:
            if not url.lower().startswith(("http://", "https://")):
                return jsonify({"error": "invalid url"}), 400
            try:
                r = requests.get(url, timeout=20)
                r.raise_for_status()
                text = r.text
            except Exception as e:
                return jsonify({"error": "fetch failed: %s" % e}), 400
    if not text:
        return jsonify({"error": "provide an .ics file or a url"}), 400
    return jsonify(import_ics_text(text))


@app.post("/api/ics/sync-now")
def ics_sync_now():
    if not setting("cal_sync_urls").strip():
        return jsonify({"error": "no calendar URLs configured (and saved)"}), 400
    added = cal_auto_sync()
    return jsonify({"added": added})


@app.delete("/api/ics")
def ics_clear():
    with db() as con:
        cur = con.execute("DELETE FROM events WHERE source='ics'")
    return jsonify({"deleted": cur.rowcount})


# ---------------- Strava ----------------
STRAVA_AUTH = "https://www.strava.com/oauth/authorize"
STRAVA_TOKEN = "https://www.strava.com/oauth/token"
STRAVA_API = "https://www.strava.com/api/v3"


def strava_client_id():
    """Env var wins; otherwise keys saved via the Settings UI (kv table)."""
    return STRAVA_CLIENT_ID or kv_get("strava_client_id", "")


def strava_client_secret():
    return STRAVA_CLIENT_SECRET or kv_get("strava_client_secret", "")


@app.post("/api/strava/config")
def strava_config():
    d = request.get_json(force=True) or {}
    cid = str(d.get("client_id", "")).strip()
    cs = str(d.get("client_secret", "")).strip()
    if not cid or not cs:
        return jsonify({"error": "both Client ID and Client Secret are required"}), 400
    kv_set("strava_client_id", cid)
    kv_set("strava_client_secret", cs)
    return jsonify({"ok": True})


@app.delete("/api/strava/config")
def strava_config_delete():
    for k in ("strava_client_id", "strava_client_secret",
              "strava_access", "strava_refresh", "strava_expires", "strava_last_sync"):
        kv_del(k)
    return jsonify({"ok": True})

TYPE_MAP = {
    "Run": "run", "TrailRun": "run", "VirtualRun": "run",
    "Ride": "bike", "VirtualRide": "bike", "GravelRide": "bike",
    "MountainBikeRide": "bike", "EBikeRide": "bike",
    "WeightTraining": "gym", "Workout": "gym", "Crossfit": "gym",
}


@app.get("/strava/connect")
def strava_connect():
    if not (strava_client_id() and strava_client_secret()):
        return "Add your Strava API keys in Settings first.", 400
    from urllib.parse import urlencode
    params = urlencode({
        "client_id": strava_client_id(),
        "redirect_uri": APP_URL + "/strava/callback",
        "response_type": "code",
        "scope": "activity:read_all",
        "approval_prompt": "auto",
    })
    return redirect(STRAVA_AUTH + "?" + params)


@app.get("/strava/callback")
def strava_callback():
    code = request.args.get("code")
    if not code:
        return redirect("/?strava=denied")
    r = requests.post(STRAVA_TOKEN, data={
        "client_id": strava_client_id(),
        "client_secret": strava_client_secret(),
        "code": code,
        "grant_type": "authorization_code",
    }, timeout=20)
    if r.status_code != 200:
        return "Strava token exchange failed: " + r.text, 400
    tok = r.json()
    kv_set("strava_access", tok["access_token"])
    kv_set("strava_refresh", tok["refresh_token"])
    kv_set("strava_expires", tok["expires_at"])
    return redirect("/?strava=connected")


def strava_access_token():
    if int(kv_get("strava_expires", "0") or 0) > time.time() + 60:
        return kv_get("strava_access")
    refresh = kv_get("strava_refresh")
    if not refresh:
        return None
    r = requests.post(STRAVA_TOKEN, data={
        "client_id": strava_client_id(),
        "client_secret": strava_client_secret(),
        "grant_type": "refresh_token",
        "refresh_token": refresh,
    }, timeout=20)
    if r.status_code != 200:
        return None
    tok = r.json()
    kv_set("strava_access", tok["access_token"])
    kv_set("strava_refresh", tok["refresh_token"])
    kv_set("strava_expires", tok["expires_at"])
    return tok["access_token"]


@app.post("/api/strava/sync")
def strava_sync():
    token = strava_access_token()
    if not token:
        return jsonify({"error": "not connected to Strava"}), 400
    added, page = 0, 1
    headers = {"Authorization": "Bearer " + token}
    with db() as con:
        while page <= 10:  # up to 1000 activities
            r = requests.get(STRAVA_API + "/athlete/activities",
                             params={"per_page": 100, "page": page},
                             headers=headers, timeout=30)
            if r.status_code != 200:
                return jsonify({"error": "Strava API error: " + r.text[:200]}), 502
            acts = r.json()
            if not acts:
                break
            for a in acts:
                wtype = TYPE_MAP.get(a.get("sport_type") or a.get("type"))
                if not wtype:
                    continue
                ext = "strava-%s" % a["id"]
                if con.execute("SELECT 1 FROM workouts WHERE ext_id=?", (ext,)).fetchone():
                    continue
                con.execute(
                    'INSERT INTO workouts(id,type,"date",dur,dist,note,source,ext_id) '
                    "VALUES(?,?,?,?,?,?,?,?)",
                    (uid(), wtype, (a.get("start_date_local") or "")[:10],
                     round((a.get("moving_time") or 0) / 60.0, 1),
                     round((a.get("distance") or 0) / 1000.0, 2),
                     a.get("name") or "", "strava", ext))
                added += 1
            if len(acts) < 100:
                break
            page += 1
    kv_set("strava_last_sync", datetime.now().isoformat(timespec="seconds"))
    return jsonify({"added": added})


@app.post("/api/strava/disconnect")
def strava_disconnect():
    # removes the account connection but keeps the API keys
    for k in ("strava_access", "strava_refresh", "strava_expires", "strava_last_sync"):
        kv_del(k)
    return jsonify({"ok": True})


if __name__ == "__main__":
    from waitress import serve
    if not AUTH_ENABLED:
        print("WARNING: AUTH_PASSWORD is not set - TyloPlanner is running WITHOUT a login.")
    threading.Thread(target=scheduler_loop, daemon=True).start()
    print("TyloPlanner running on %s (port %d)" % (APP_URL, PORT))
    serve(app, host="0.0.0.0", port=PORT)
