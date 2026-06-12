"""
Backup blueprint — manual backup trigger and full data restore.
"""
import os
from datetime import datetime

from flask import Blueprint, request, jsonify

from helpers import db, uid, q, TABLES, do_backup

bp = Blueprint("backup", __name__)


@bp.post("/api/backup/now")
def backup_now():
    path = do_backup(datetime.now().strftime("%Y-%m-%d"))
    return jsonify({"ok": True, "file": os.path.basename(path)})


@bp.post("/api/restore")
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
