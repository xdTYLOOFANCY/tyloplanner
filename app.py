"""
TyloPlanner - self-hosted personal dashboard.
Flask + SQLite backend with session authentication. See README.md for setup.
"""
import os
import re
import hmac
import time
import uuid
import secrets
import sqlite3
from datetime import datetime

import requests
from flask import Flask, request, jsonify, redirect, Response, session

# ---------------- config ----------------
BASE_DIR = os.path.dirname(os.path.abspath(__file__))
DB_PATH = os.environ.get("DB_PATH", os.path.join(BASE_DIR, "data", "tyloplanner.db"))
APP_URL = os.environ.get("APP_URL", "http://localhost:8000").rstrip("/")
STRAVA_CLIENT_ID = os.environ.get("STRAVA_CLIENT_ID", "")
STRAVA_CLIENT_SECRET = os.environ.get("STRAVA_CLIENT_SECRET", "")
AUTH_USERNAME = os.environ.get("AUTH_USERNAME", "admin")
AUTH_PASSWORD = os.environ.get("AUTH_PASSWORD", "")
AUTH_ENABLED = bool(AUTH_PASSWORD)
PORT = int(os.environ.get("PORT", "8000"))

os.makedirs(os.path.dirname(DB_PATH), exist_ok=True)

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


# Files the login page itself needs:
LOGIN_ASSETS = {"/login", "/style.css", "/logo.svg", "/favicon.ico"}


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
    session["auth"] = True
    session.permanent = True
    return redirect("/")


@app.get("/logout")
def logout():
    session.clear()
    return redirect("/login" if AUTH_ENABLED else "/")


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
    out["strava"] = {
        "configured": bool(STRAVA_CLIENT_ID and STRAVA_CLIENT_SECRET),
        "connected": kv_get("strava_refresh") is not None,
        "last_sync": kv_get("strava_last_sync"),
    }
    out["auth"] = {"enabled": AUTH_ENABLED}
    out["app_url"] = APP_URL
    out["feed_url"] = APP_URL + "/calendar.ics" + ("?key=" + feed_key() if AUTH_ENABLED else "")
    return jsonify(out)


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


# ---------------- backup / restore ----------------
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
    return jsonify({"found": len(evs), "added": added})


@app.delete("/api/ics")
def ics_clear():
    with db() as con:
        cur = con.execute("DELETE FROM events WHERE source='ics'")
    return jsonify({"deleted": cur.rowcount})


# ---------------- Strava ----------------
STRAVA_AUTH = "https://www.strava.com/oauth/authorize"
STRAVA_TOKEN = "https://www.strava.com/oauth/token"
STRAVA_API = "https://www.strava.com/api/v3"

TYPE_MAP = {
    "Run": "run", "TrailRun": "run", "VirtualRun": "run",
    "Ride": "bike", "VirtualRide": "bike", "GravelRide": "bike",
    "MountainBikeRide": "bike", "EBikeRide": "bike",
    "WeightTraining": "gym", "Workout": "gym", "Crossfit": "gym",
}


@app.get("/strava/connect")
def strava_connect():
    if not STRAVA_CLIENT_ID:
        return "Set STRAVA_CLIENT_ID and STRAVA_CLIENT_SECRET in your .env first (see README).", 400
    from urllib.parse import urlencode
    params = urlencode({
        "client_id": STRAVA_CLIENT_ID,
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
        "client_id": STRAVA_CLIENT_ID,
        "client_secret": STRAVA_CLIENT_SECRET,
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
        "client_id": STRAVA_CLIENT_ID,
        "client_secret": STRAVA_CLIENT_SECRET,
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
    with db() as con:
        con.execute("DELETE FROM kv WHERE key LIKE 'strava_%'")
    return jsonify({"ok": True})


if __name__ == "__main__":
    from waitress import serve
    if not AUTH_ENABLED:
        print("WARNING: AUTH_PASSWORD is not set - TyloPlanner is running WITHOUT a login.")
    print("TyloPlanner running on %s (port %d)" % (APP_URL, PORT))
    serve(app, host="0.0.0.0", port=PORT)
