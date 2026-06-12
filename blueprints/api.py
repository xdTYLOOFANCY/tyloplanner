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
            out[t] = [dict(r) for r in con.execute("SELECT * FROM %s" % t)]
        out["habit_log"] = [dict(r) for r in con.execute("SELECT * FROM habit_log")]
        out["files"] = [dict(r) for r in con.execute("SELECT * FROM files ORDER BY uploaded DESC")]
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
    return jsonify({"ok": True})


@bp.delete("/api/<table>/<rid>")
def delete_row(table, rid):
    if table not in TABLES:
        return jsonify({"error": "unknown table"}), 404
    with db() as con:
        con.execute("DELETE FROM %s WHERE id=?" % table, (rid,))
        if table == "habits":
            con.execute("DELETE FROM habit_log WHERE habit_id=?", (rid,))
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
