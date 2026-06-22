"""
API blueprint — generic CRUD, full state, index page, and habit toggle.
"""
from flask import Blueprint, request, jsonify, current_app

import helpers
from helpers import (
    db, uid, q, TABLES, APP_URL,
    kv_get, feed_key, totp_enabled, full_state_dict,
)

bp = Blueprint("api", __name__)


def _strava_client_id():
    return helpers.STRAVA_CLIENT_ID or kv_get("strava_client_id", "")


def _strava_client_secret():
    return helpers.STRAVA_CLIENT_SECRET or kv_get("strava_client_secret", "")


@bp.get("/")
def index():
    return current_app.send_static_file("index.html")


@bp.get("/api/state")
def get_state():
    out = {}
    with db() as con:
        for t in TABLES:
            if t == "files":
                out[t] = [dict(r) for r in con.execute("SELECT * FROM files ORDER BY uploaded DESC")]
            else:
                out[t] = [dict(r) for r in con.execute("SELECT * FROM %s" % t)]
        out["habit_log"] = [dict(r) for r in con.execute("SELECT * FROM habit_log")]
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



def sync_exam_to_event(rid):
    with db() as con:
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


def sync_event_to_exam(rid):
    with db() as con:
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
    
    if table == "exams":
        sync_exam_to_event(rid)
    elif table == "events":
        sync_event_to_exam(rid)
        
    return jsonify({"id": rid})


@bp.put("/api/<table>/<rid>")
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
        
    if table == "exams":
        sync_exam_to_event(rid)
    elif table == "events":
        sync_event_to_exam(rid)
        
    return jsonify({"ok": True})


@bp.delete("/api/<table>/<rid>")
def delete_row(table, rid):
    if table not in TABLES:
        return jsonify({"error": "unknown table"}), 404
    with db() as con:
        con.execute("DELETE FROM %s WHERE id=?" % table, (rid,))
        if table == "habits":
            con.execute("DELETE FROM habit_log WHERE habit_id=?", (rid,))
            
    if table == "exams":
        sync_exam_to_event(rid)
    elif table == "events":
        sync_event_to_exam(rid)
        
    return jsonify({"ok": True})



@bp.post("/api/habits/<hid>/toggle")
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


@bp.delete("/api/note_folders/<fid>")
def delete_note_folder(fid):
    with db() as con:
        row = con.execute("SELECT parent_id FROM note_folders WHERE id=?", (fid,)).fetchone()
        if not row:
            return jsonify({"error": "folder not found"}), 404
        parent_id = row["parent_id"]
        
        con.execute("UPDATE notes SET folder_id=? WHERE folder_id=?", (parent_id, fid))
        con.execute("UPDATE note_folders SET parent_id=? WHERE parent_id=?", (parent_id, fid))
        con.execute("DELETE FROM note_folders WHERE id=?", (fid,))
    return jsonify({"ok": True})


@bp.post("/api/notes/move")
def move_notes():
    data = request.get_json(force=True) or {}
    note_ids = data.get("note_ids", [])
    folder_id = data.get("folder_id")
    if folder_id == "":
        folder_id = None
    if not note_ids:
        return jsonify({"error": "no note ids provided"}), 400
    
    with db() as con:
        placeholders = ",".join("?" for _ in note_ids)
        con.execute(
            f"UPDATE notes SET folder_id=? WHERE id IN ({placeholders})",
            [folder_id] + note_ids
        )
    return jsonify({"ok": True})
