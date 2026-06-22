"""
Backup blueprint — manual backup trigger and full data restore.
"""
import os
import json
import re
from datetime import datetime

from flask import Blueprint, request, jsonify

from helpers import db, uid, q, TABLES, do_backup, BACKUP_DIR, local_now

bp = Blueprint("backup", __name__)


def do_restore_data(data):
    if not data or not isinstance(data, dict):
        return 0
    restored_count = 0
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
                    restored_count += 1
    return restored_count


@bp.post("/api/backup/now")
def backup_now():
    path = do_backup(local_now().strftime("%Y-%m-%d"))
    return jsonify({"ok": True, "file": os.path.basename(path)})


@bp.post("/api/restore")
def restore():
    data = request.get_json(force=True) or {}
    do_restore_data(data)
    return jsonify({"ok": True})


@bp.get("/api/backups")
def list_backups():
    if not os.path.exists(BACKUP_DIR):
        return jsonify([])
    backups = []
    for entry in os.scandir(BACKUP_DIR):
        if entry.is_file() and entry.name.startswith("backup-") and entry.name.endswith(".json"):
            match = re.match(r'^backup-(\d{4}-\d{2}-\d{2})\.json$', entry.name)
            if match:
                date_str = match.group(1)
                size_kb = entry.stat().st_size / 1024.0
                backups.append({
                    "filename": entry.name,
                    "date": date_str,
                    "size_kb": size_kb
                })
    backups.sort(key=lambda x: x["filename"], reverse=True)
    return jsonify(backups)


@bp.post("/api/backups/<filename>/restore")
def restore_backup(filename):
    if not re.match(r'^backup-\d{4}-\d{2}-\d{2}\.json$', filename):
        return jsonify({"error": "Invalid filename"}), 400
    
    path = os.path.join(BACKUP_DIR, filename)
    if not os.path.isfile(path):
        return jsonify({"error": "Backup file not found"}), 404
        
    try:
        with open(path, "r") as f:
            data = json.load(f)
    except Exception as e:
        return jsonify({"error": "Failed to read backup file: " + str(e)}), 500
        
    restored = do_restore_data(data)
    return jsonify({"ok": True, "restored": restored})

