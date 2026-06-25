"""
API blueprint — generic CRUD, full state, index page, and habit toggle.
"""
import re
from flask import Blueprint, request, jsonify, current_app

import helpers
from helpers import (
    db, uid, q, TABLES, APP_URL,
    kv_get, feed_key, totp_enabled, full_state_dict, db_retry,
)

# ---------------------------------------------------------------------------
# Input validation
# ---------------------------------------------------------------------------

# ISO-8601 date (YYYY-MM-DD)
_RE_DATE = re.compile(r"^\d{4}-(?:0[1-9]|1[0-2])-(?:0[1-9]|[12]\d|3[01])$")
# HH:MM  (or empty string — used for event start/end when they are time-of-day)
_RE_TIME = re.compile(r"^([01]\d|2[0-3]):[0-5]\d$")
# YYYY-MM-DDTHH:MM (datetime used by due_date / completed_at columns)
_RE_DATETIME = re.compile(
    r"^\d{4}-(?:0[1-9]|1[0-2])-(?:0[1-9]|[12]\d|3[01])"
    r"T([01]\d|2[0-3]):[0-5]\d(:[0-5]\d)?$"
)

# Maximum character length for free-text / URL fields
_MAX_STR = 8000
_MAX_SHORT = 255

# Allowed event types (matches what the frontend sends — planner.js EVENT_TYPES list)
_EVENT_TYPES = {
    "deadline", "local", "external", "birthday", "holiday", "task",
    "study", "work", "personal", "workout", "other",
}

def _is_valid_event_type(val):
    """Return True for known event types and dynamic ics_<N> types."""
    if val in _EVENT_TYPES:
        return True
    # ICS-imported calendar events use a "ics" or "ics_<index>" source-derived type
    if isinstance(val, str) and re.match(r"^ics(_\d+)?$", val):
        return True
    return False

# Per-column validation rules.
# Each entry is either:
#   ("date")          — must match YYYY-MM-DD or be None/empty
#   ("time")          — must match HH:MM or be empty string / None
#   ("bool")          — 0 / 1 / True / False
#   ("int", min, max) — integer in [min, max]
#   ("float", min, max) — float in [min, max]
#   ("str", max_len)  — string with max length
#   ("enum", frozenset) — string from allowed set
_FIELD_RULES = {
    # ---- common date / time fields ----
    "date":             ("date",),
    "created":          ("date",),
    "updated":          ("date",),
    "completed_at":     ("datetime",),
    "due":              ("date",),
    "due_date":         ("datetime",),
    "recurrence_until": ("date",),
    "uploaded":         ("date",),
    "start":            ("time",),
    "end":              ("time",),
    # ---- exams ----
    "ects":             ("float", 0, 999),
    "grade":            ("float", 0, 10),
    # ---- tasks ----
    "done":             ("bool",),
    "order_index":      ("int", 0, 10_000_000),
    # ---- workouts ----
    "dur":              ("float", 0, 1_000_000),
    "dist":             ("float", 0, 1_000_000),
    # ---- study sessions ----
    "duration":         ("float", 0, 1_000_000),
    "completed":        ("bool",),
    # ---- notes / files ----
    "is_pinned":        ("bool",),
    "size":             ("int", 0, 10_000_000_000),
    # ---- reminders ----
    "reminder_offset":  ("int", 0, 100_000),
    # ---- event type ----
    "type":             ("enum", frozenset(_EVENT_TYPES)),
    # ---- free-text / URL fields ----
    "name":             ("str", _MAX_STR),
    "title":            ("str", _MAX_STR),
    "body":             ("str", _MAX_STR),
    "description":      ("str", _MAX_STR),
    "note":             ("str", _MAX_STR),
    "subject":          ("str", _MAX_SHORT),
    "location":         ("str", _MAX_SHORT),
    "recurrence":       ("str", _MAX_SHORT),
    "source":           ("str", _MAX_SHORT),
    "ext_id":           ("str", _MAX_SHORT),
    "mimetype":         ("str", _MAX_SHORT),
    "filename":         ("str", _MAX_SHORT),
    "url":              ("str", _MAX_STR),
    "icon":             ("str", _MAX_SHORT),
    "category":         ("str", _MAX_SHORT),
    # ---- FK / ID references (validated only for length) ----
    "folder_id":        ("str", _MAX_SHORT),
    "parent_id":        ("str", _MAX_SHORT),
}


def _coerce_bool(val):
    """Accept Python bool, int 0/1, or string '0'/'1'/'true'/'false'."""
    if isinstance(val, bool):
        return int(val), None
    if isinstance(val, int) and val in (0, 1):
        return val, None
    if isinstance(val, str) and val.lower() in ("0", "1", "true", "false"):
        return 1 if val.lower() in ("1", "true") else 0, None
    return None, "must be 0 or 1"


def _validate_fields(table, data):
    """
    Validate and lightly coerce the values in *data* according to _FIELD_RULES.

    Returns (cleaned_data, error_message).  error_message is None on success.
    The *table* name is passed so workouts can skip the enum check for 'type'
    (workout types are free-form strings).
    """
    cleaned = {}
    for col, val in data.items():
        rule = _FIELD_RULES.get(col)
        if rule is None:
            # No rule defined — accept as-is (column is already whitelisted by TABLES)
            cleaned[col] = val
            continue

        kind = rule[0]

        # Allow explicit null/None for optional fields without further checks
        if val is None:
            cleaned[col] = None
            continue

        if kind == "date":
            if not isinstance(val, str):
                return None, f"'{col}' must be a string in YYYY-MM-DD format"
            # Allow empty string (clears the field)
            if val == "":
                cleaned[col] = val
            elif not _RE_DATE.match(val):
                return None, f"'{col}' must be in YYYY-MM-DD format"
            else:
                cleaned[col] = val

        elif kind == "datetime":
            if not isinstance(val, str):
                return None, f"'{col}' must be a string in YYYY-MM-DD or YYYY-MM-DDTHH:MM format"
            if val == "":
                cleaned[col] = val
            elif _RE_DATE.match(val) or _RE_DATETIME.match(val):
                cleaned[col] = val
            else:
                return None, f"'{col}' must be in YYYY-MM-DD or YYYY-MM-DDTHH:MM format"

        elif kind == "time":
            if not isinstance(val, str):
                return None, f"'{col}' must be a string (HH:MM or empty)"
            if val != "" and not _RE_TIME.match(val):
                return None, f"'{col}' must be in HH:MM format or empty"
            cleaned[col] = val

        elif kind == "bool":
            coerced, err = _coerce_bool(val)
            if err:
                return None, f"'{col}' {err}"
            cleaned[col] = coerced

        elif kind == "int":
            _, lo, hi = rule
            try:
                coerced = int(val)
            except (TypeError, ValueError):
                return None, f"'{col}' must be an integer"
            if not (lo <= coerced <= hi):
                return None, f"'{col}' must be between {lo} and {hi}"
            cleaned[col] = coerced

        elif kind == "float":
            _, lo, hi = rule
            try:
                coerced = float(val)
            except (TypeError, ValueError):
                return None, f"'{col}' must be a number"
            if not (lo <= coerced <= hi):
                return None, f"'{col}' must be between {lo} and {hi}"
            cleaned[col] = coerced

        elif kind == "str":
            _, max_len = rule
            if not isinstance(val, str):
                return None, f"'{col}' must be a string"
            if len(val) > max_len:
                return None, f"'{col}' exceeds maximum length of {max_len} characters"
            cleaned[col] = val

        elif kind == "enum":
            _, allowed = rule
            # For the 'type' column on workouts, treat it as a free-form string
            # because workout types (run, bike, swim, …) are not a closed set.
            if col == "type" and table == "workouts":
                if not isinstance(val, str):
                    return None, f"'{col}' must be a string"
                if len(val) > _MAX_SHORT:
                    return None, f"'{col}' exceeds maximum length of {_MAX_SHORT} characters"
                cleaned[col] = val
            elif col == "type" and table == "events":
                if not isinstance(val, str) or not _is_valid_event_type(val):
                    return None, f"'{col}' must be one of: {', '.join(sorted(_EVENT_TYPES))} (or ics/ics_N)"
                cleaned[col] = val
            else:
                if not isinstance(val, str) or val not in allowed:
                    return None, f"'{col}' must be one of: {', '.join(sorted(allowed))}"
                cleaned[col] = val

        else:
            cleaned[col] = val

    return cleaned, None

bp = Blueprint("api", __name__)


def _strava_client_id():
    return helpers.STRAVA_CLIENT_ID or kv_get("strava_client_id", "")


def _strava_client_secret():
    return helpers.STRAVA_CLIENT_SECRET or kv_get("strava_client_secret", "")


@bp.get("/")
@bp.get("/index.html")
def index():
    return helpers.get_rendered_file("index.html")


@bp.get("/sw.js")
def service_worker():
    from flask import Response
    content = helpers.get_rendered_file("sw.js")
    return Response(content, mimetype="application/javascript")



@bp.get("/api/state")
def get_state():
    since_version_str = request.args.get("since_version")
    since_version = None
    if since_version_str is not None:
        try:
            since_version = int(since_version_str)
        except ValueError:
            pass

    out = {}
    with db() as con:
        current_version_str = kv_get("state_version", "0")
        try:
            current_version = int(current_version_str)
        except ValueError:
            current_version = 0

        if since_version is not None:
            for t in TABLES:
                try:
                    out[t] = [dict(r) for r in con.execute("SELECT * FROM %s WHERE version > ?" % t, (since_version,))]
                except Exception:
                    out[t] = []
            try:
                out["habit_log"] = [dict(r) for r in con.execute("SELECT * FROM habit_log WHERE version > ?", (since_version,))]
            except Exception:
                out["habit_log"] = []
            try:
                out["deleted_records"] = [dict(r) for r in con.execute("SELECT * FROM deleted_records WHERE version > ?", (since_version,))]
            except Exception:
                out["deleted_records"] = []
            out["is_delta"] = True
        else:
            for t in TABLES:
                if t == "files":
                    out[t] = [dict(r) for r in con.execute("SELECT * FROM files ORDER BY uploaded DESC")]
                else:
                    out[t] = [dict(r) for r in con.execute("SELECT * FROM %s" % t)]
            out["habit_log"] = [dict(r) for r in con.execute("SELECT * FROM habit_log")]
            out["deleted_records"] = []
            out["is_delta"] = False

        out["version"] = current_version

    out["strava"] = {
        "configured": bool(_strava_client_id() and _strava_client_secret()),
        "from_env": bool(helpers.STRAVA_CLIENT_ID),
        "connected": kv_get("strava_refresh") is not None,
        "last_sync": kv_get("strava_last_sync"),
    }
    out["auth"] = {"enabled": helpers.AUTH_ENABLED, "totp": totp_enabled()}
    out["app_url"] = APP_URL
    out["feed_url"] = APP_URL + "/calendar.ics" + ("?key=" + feed_key() if helpers.AUTH_ENABLED else "")
    return jsonify(out)


@bp.get("/api/state-version")
def get_state_version():
    return jsonify({"version": kv_get("state_version", "0")})



@db_retry()
def sync_exam_to_event(rid):
    with db(write=True) as con:
        exam = con.execute("SELECT name, date FROM exams WHERE id=?", (rid,)).fetchone()
        if exam:
            event = con.execute("SELECT 1 FROM events WHERE id=?", (rid,)).fetchone()
            if event:
                con.execute(
                    'UPDATE events SET title=?, "date"=?, "start"=\'\', "end"=\'\', type=\'deadline\' WHERE id=?',
                    (exam["name"], exam["date"], rid)
                )
            else:
                con.execute(
                    'INSERT INTO events (id, title, "date", "start", "end", type, source) VALUES (?, ?, ?, \'\', \'\', \'deadline\', \'local\')',
                    (rid, exam["name"], exam["date"])
                )
        else:
            con.execute("DELETE FROM events WHERE id=? AND type='deadline'", (rid,))


@db_retry()
def sync_event_to_exam(rid):
    with db(write=True) as con:
        event = con.execute("SELECT title, \"date\", type FROM events WHERE id=?", (rid,)).fetchone()
        if event and event["type"] == "deadline":
            exam = con.execute("SELECT 1 FROM exams WHERE id=?", (rid,)).fetchone()
            if exam:
                con.execute(
                    'UPDATE exams SET name=?, "date"=? WHERE id=?',
                    (event["title"], event["date"], rid)
                )
            else:
                con.execute(
                    'INSERT INTO exams (id, name, "date") VALUES (?, ?, ?)',
                    (rid, event["title"], event["date"])
                )
        else:
            con.execute("DELETE FROM exams WHERE id=?", (rid,))


@bp.post("/api/<table>")
@db_retry()
def create_row(table):
    if table not in TABLES:
        return jsonify({"error": "unknown table"}), 404
    raw = request.get_json(force=True) or {}
    # Keep only whitelisted columns, then validate
    raw = {c: raw[c] for c in TABLES[table] if c in raw}
    data, err = _validate_fields(table, raw)
    if err:
        return jsonify({"error": err}), 400
    cols = list(data.keys())
    rid = uid()
    sql = "INSERT INTO %s (id%s) VALUES (?%s)" % (
        table,
        "".join("," + q(c) for c in cols),
        ",?" * len(cols),
    )
    with db(write=True) as con:
        con.execute(sql, [rid] + [data[c] for c in cols])

    if table == "exams":
        sync_exam_to_event(rid)
    elif table == "events":
        sync_event_to_exam(rid)

    return jsonify({"id": rid})


@bp.put("/api/<table>/<rid>")
@db_retry()
def update_row(table, rid):
    if table not in TABLES:
        return jsonify({"error": "unknown table"}), 404
    raw = request.get_json(force=True) or {}
    # Keep only whitelisted columns, then validate
    raw = {c: raw[c] for c in TABLES[table] if c in raw}
    if not raw:
        return jsonify({"error": "no valid fields"}), 400
    data, err = _validate_fields(table, raw)
    if err:
        return jsonify({"error": err}), 400
    cols = list(data.keys())
    sql = "UPDATE %s SET %s WHERE id=?" % (table, ",".join(q(c) + "=?" for c in cols))
    with db(write=True) as con:
        con.execute(sql, [data[c] for c in cols] + [rid])

    if table == "exams":
        sync_exam_to_event(rid)
    elif table == "events":
        sync_event_to_exam(rid)

    return jsonify({"ok": True})


@bp.delete("/api/note_folders/<fid>")
@db_retry()
def delete_note_folder(fid):
    with db(write=True) as con:
        row = con.execute("SELECT parent_id FROM note_folders WHERE id=?", (fid,)).fetchone()
        if not row:
            return jsonify({"error": "folder not found"}), 404
        parent_id = row["parent_id"]
        
        con.execute("UPDATE notes SET folder_id=? WHERE folder_id=?", (parent_id, fid))
        con.execute("UPDATE note_folders SET parent_id=? WHERE parent_id=?", (parent_id, fid))
        con.execute("DELETE FROM note_folders WHERE id=?", (fid,))
    return jsonify({"ok": True})


@bp.delete("/api/<table>/<rid>")
@db_retry()
def delete_row(table, rid):
    if table not in TABLES:
        return jsonify({"error": "unknown table"}), 404
        
    if table == "note_folders":
        return delete_note_folder(rid)
    if table == "folders":
        from blueprints.files import delete_folder
        return delete_folder(rid)
    if table == "files":
        from blueprints.files import delete_file
        return delete_file(rid)

    with db(write=True) as con:
        con.execute("DELETE FROM %s WHERE id=?" % table, (rid,))
        if table == "habits":
            con.execute("DELETE FROM habit_log WHERE habit_id=?", (rid,))
            
    if table == "exams":
        sync_exam_to_event(rid)
    elif table == "events":
        sync_event_to_exam(rid)
        
    return jsonify({"ok": True})



@bp.post("/api/habits/<hid>/toggle")
@db_retry()
def toggle_habit(hid):
    d = (request.get_json(force=True) or {}).get("date")
    if not d:
        return jsonify({"error": "date required"}), 400
    with db(write=True) as con:
        row = con.execute('SELECT 1 FROM habit_log WHERE habit_id=? AND "date"=?', (hid, d)).fetchone()
        if row:
            con.execute('DELETE FROM habit_log WHERE habit_id=? AND "date"=?', (hid, d))
            return jsonify({"on": False})
        con.execute('INSERT INTO habit_log(habit_id,"date") VALUES(?,?)', (hid, d))
        return jsonify({"on": True})


@bp.post("/api/notes/move")
@db_retry()
def move_notes():
    data = request.get_json(force=True) or {}
    note_ids = data.get("note_ids", [])
    folder_id = data.get("folder_id")
    if folder_id == "":
        folder_id = None
    if not note_ids:
        return jsonify({"error": "no note ids provided"}), 400
    
    with db(write=True) as con:
        placeholders = ",".join("?" for _ in note_ids)
        con.execute(
            f"UPDATE notes SET folder_id=? WHERE id IN ({placeholders})",
            [folder_id] + note_ids
        )
    return jsonify({"ok": True})


@bp.get("/api/notes/search")
def search_notes():
    q = request.args.get("q", "").strip()
    if not q:
        return jsonify([])
    
    clean = re.sub(r'[^\w\s]', '', q)
    words = [w + "*" for w in clean.split() if w]
    if not words:
        return jsonify([])
    fts_query = " ".join(words)
    
    try:
        with db() as con:
            rows = con.execute("SELECT id FROM notes_fts WHERE notes_fts MATCH ? ORDER BY rank", (fts_query,)).fetchall()
            return jsonify([r["id"] for r in rows])
    except Exception as e:
        print("FTS5 notes search error:", e)
        with db() as con:
            rows = con.execute(
                "SELECT id FROM notes WHERE title LIKE ? OR body LIKE ?",
                (f"%{q}%", f"%{q}%")
            ).fetchall()
            return jsonify([r["id"] for r in rows])


@bp.get("/api/files/search")
def search_files():
    q = request.args.get("q", "").strip()
    if not q:
        return jsonify([])
    
    clean = re.sub(r'[^\w\s]', '', q)
    words = [w + "*" for w in clean.split() if w]
    if not words:
        return jsonify([])
    fts_query = " ".join(words)
    
    try:
        with db() as con:
            rows = con.execute("SELECT id FROM files_fts WHERE files_fts MATCH ? ORDER BY rank", (fts_query,)).fetchall()
            return jsonify([r["id"] for r in rows])
    except Exception as e:
        print("FTS5 files search error:", e)
        with db() as con:
            rows = con.execute("SELECT id FROM files WHERE filename LIKE ?", (f"%{q}%",)).fetchall()
            return jsonify([r["id"] for r in rows])
