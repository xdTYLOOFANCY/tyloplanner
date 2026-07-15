"""
Backup blueprint — manual backup trigger, full data restore,
and the universal export/import archive (.zip).
"""
import os
import io
import json
import re
import zipfile

from flask import Blueprint, request, jsonify, send_file

from helpers import (db, uid, q, TABLES, do_backup, BACKUP_DIR, local_now,
                     UPLOAD_DIR, VERSION, kv_set)

bp = Blueprint("backup", __name__)

# Archive categories → tables. "settings" (kv set_* keys) and the habit_log /
# upload blobs are handled specially below.
ARCHIVE_CATEGORIES = {
    "events": ["events"],
    "tasks": ["tasks"],
    "notes": ["notes", "note_folders"],
    "exams": ["exams"],
    "habits": ["habits"],
    "workouts": ["workouts"],
    "study_sessions": ["study_sessions"],
    "shortcuts": ["shortcuts"],
    "files": ["files", "folders"],
    "settings": [],
}


def do_restore_data(data):
    if not data or not isinstance(data, dict):
        return 0
    restored_count = 0
    with db(write=True) as con:
        try:
            con.execute("DELETE FROM deleted_records")
        except Exception:
            pass
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
    try:
        path = do_backup(local_now().strftime("%Y-%m-%d"))
    except Exception as e:
        return jsonify({"error": str(e) or "Backup failed"}), 500
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


# ---------------- universal export/import archive ----------------

def _parse_categories(raw):
    cats = [c for c in (raw or "").split(",") if c in ARCHIVE_CATEGORIES]
    return cats or list(ARCHIVE_CATEGORIES)


@bp.get("/api/export/archive")
def export_archive():
    cats = _parse_categories(request.args.get("categories"))
    data = {"app": "tyloplanner", "version": VERSION, "categories": cats,
            "tables": {}, "settings": {}}
    file_ids = []
    with db() as con:
        for cat in cats:
            for t in ARCHIVE_CATEGORIES[cat]:
                data["tables"][t] = [dict(r) for r in con.execute("SELECT * FROM %s" % t)]
        if "habits" in cats:
            data["tables"]["habit_log"] = [dict(r) for r in con.execute("SELECT * FROM habit_log")]
        if "settings" in cats:
            data["settings"] = {r["key"]: r["value"] for r in
                                con.execute("SELECT key,value FROM kv WHERE key LIKE 'set_%'")}
        if "files" in cats:
            file_ids = [r["id"] for r in con.execute("SELECT id FROM files")]

    # ponytail: in-memory zip; stream from a temp file if archives outgrow RAM
    buf = io.BytesIO()
    with zipfile.ZipFile(buf, "w", zipfile.ZIP_DEFLATED) as zf:
        zf.writestr("data.json", json.dumps(data))
        for fid in file_ids:
            disk_path = os.path.join(UPLOAD_DIR, fid)
            if os.path.isfile(disk_path):
                zf.write(disk_path, "uploads/" + fid)
    buf.seek(0)
    name = "tyloplanner-export-%s.zip" % local_now().strftime("%Y-%m-%d")
    return send_file(buf, mimetype="application/zip", as_attachment=True, download_name=name)


@bp.post("/api/import/archive")
def import_archive():
    mode = request.args.get("mode", "merge")
    if mode not in ("merge", "replace"):
        return jsonify({"error": "mode must be merge or replace"}), 400
    up = request.files.get("file")
    if not up:
        return jsonify({"error": "No file uploaded"}), 400
    try:
        zf = zipfile.ZipFile(io.BytesIO(up.read()))
        data = json.loads(zf.read("data.json"))
        assert data.get("app") == "tyloplanner"
    except Exception:
        return jsonify({"error": "Not a valid TyloPlanner export archive"}), 400

    cats = _parse_categories(request.args.get("categories"))
    cats = [c for c in cats if c in data.get("categories", [])]
    tables = data.get("tables", {})
    imported = 0

    with db(write=True) as con:
        for cat in cats:
            wanted = list(ARCHIVE_CATEGORIES[cat]) + (["habit_log"] if cat == "habits" else [])
            for t in wanted:
                rows = tables.get(t)
                if not isinstance(rows, list):
                    continue
                if mode == "replace":
                    con.execute("DELETE FROM %s" % t)
                for row in rows:
                    if not isinstance(row, dict):
                        continue
                    if t == "habit_log":
                        con.execute('INSERT OR IGNORE INTO habit_log(habit_id,"date") VALUES(?,?)',
                                    (row.get("habit_id"), row.get("date")))
                    else:
                        cols = [c for c in TABLES[t] if c in row]
                        sql = "INSERT OR IGNORE INTO %s (id%s) VALUES (?%s)" % (
                            t, "".join("," + q(c) for c in cols), ",?" * len(cols))
                        con.execute(sql, [row.get("id") or uid()] + [row[c] for c in cols])
                    imported += 1

    if "settings" in cats and isinstance(data.get("settings"), dict):
        with db() as con:
            existing = {r["key"] for r in con.execute("SELECT key FROM kv WHERE key LIKE 'set_%'")}
        for k, v in data["settings"].items():
            if not (isinstance(k, str) and k.startswith("set_")):
                continue
            if mode == "merge" and k in existing:
                continue
            kv_set(k, v)
            imported += 1

    if "files" in cats:
        # only extract blobs for ids present in the archive's files table
        members = set(zf.namelist())
        for row in tables.get("files", []):
            fid = isinstance(row, dict) and row.get("id")
            if not fid or "/" in fid or "\\" in fid or ".." in fid:
                continue
            member = "uploads/" + fid
            if member not in members:
                continue
            disk_path = os.path.join(UPLOAD_DIR, fid)
            if mode == "merge" and os.path.exists(disk_path):
                continue
            with open(disk_path, "wb") as f:
                f.write(zf.read(member))
        if mode == "replace":
            from blueprints.files import run_storage_cleanup
            run_storage_cleanup()

    return jsonify({"ok": True, "mode": mode, "imported": imported})

