"""
Files blueprint — upload, download, and delete user files.
"""
import os
import time

from flask import Blueprint, request, jsonify, send_file

from helpers import db, uid, UPLOAD_DIR

bp = Blueprint("files", __name__)


@bp.post("/api/files/upload")
def upload_file():
    f = request.files.get("file")
    if not f:
        return jsonify({"error": "no file provided"}), 400
    folder_id = request.form.get("folder_id") or request.args.get("folder_id")
    if folder_id == "":
        folder_id = None
    fid = uid()
    original_name = os.path.basename(f.filename or "upload")
    disk_path = os.path.join(UPLOAD_DIR, fid)
    f.save(disk_path)
    size = os.path.getsize(disk_path)
    ts = int(time.time() * 1000)
    mimetype = f.mimetype or "application/octet-stream"
    with db(write=True) as con:
        con.execute(
            "INSERT INTO files(id, filename, size, mimetype, uploaded, folder_id) VALUES(?,?,?,?,?,?)",
            (fid, original_name, size, mimetype, ts, folder_id))
    if mimetype.startswith("audio/"):
        from blueprints.music import update_file_audio_meta
        update_file_audio_meta(fid)
    return jsonify({"id": fid, "filename": original_name, "size": size})


@bp.get("/api/files/<fid>/download")
def download_file(fid):
    with db() as con:
        row = con.execute("SELECT * FROM files WHERE id=?", (fid,)).fetchone()
    if not row:
        return jsonify({"error": "not found"}), 404
        
    base_dir = os.path.abspath(UPLOAD_DIR)
    disk_path = os.path.abspath(os.path.join(base_dir, fid))
    
    if not disk_path.startswith(base_dir):
        return jsonify({"error": "forbidden"}), 403
        
    if not os.path.exists(disk_path):
        return jsonify({"error": "file missing from disk"}), 404
    return send_file(disk_path, as_attachment=True, download_name=row["filename"],
                     mimetype="application/octet-stream")


@bp.get("/api/files/<fid>/view")
def view_file(fid):
    with db() as con:
        row = con.execute("SELECT * FROM files WHERE id=?", (fid,)).fetchone()
    if not row:
        return jsonify({"error": "not found"}), 404
        
    base_dir = os.path.abspath(UPLOAD_DIR)
    disk_path = os.path.abspath(os.path.join(base_dir, fid))
    
    if not disk_path.startswith(base_dir):
        return jsonify({"error": "forbidden"}), 403
        
    if not os.path.exists(disk_path):
        return jsonify({"error": "file missing from disk"}), 404
    return send_file(disk_path, mimetype=row["mimetype"] or "application/octet-stream")


@bp.delete("/api/files/<fid>")
def delete_file(fid):
    with db(write=True) as con:
        row = con.execute("SELECT id FROM files WHERE id=?", (fid,)).fetchone()
        if not row:
            return jsonify({"error": "not found"}), 404
        con.execute("DELETE FROM files WHERE id=?", (fid,))
    disk_path = os.path.join(UPLOAD_DIR, fid)
    if os.path.exists(disk_path):
        os.remove(disk_path)
    return jsonify({"ok": True})


@bp.delete("/api/folders/<fid>")
def delete_folder(fid):
    with db(write=True) as con:
        row = con.execute("SELECT parent_id FROM folders WHERE id=?", (fid,)).fetchone()
        if not row:
            return jsonify({"error": "folder not found"}), 404
        parent_id = row["parent_id"]
        
        con.execute("UPDATE files SET folder_id=? WHERE folder_id=?", (parent_id, fid))
        con.execute("UPDATE folders SET parent_id=? WHERE parent_id=?", (parent_id, fid))
        con.execute("DELETE FROM folders WHERE id=?", (fid,))
    return jsonify({"ok": True})


@bp.post("/api/files/move")
def move_files():
    data = request.get_json(force=True) or {}
    file_ids = data.get("file_ids", [])
    folder_id = data.get("folder_id")
    if folder_id == "":
        folder_id = None
    if not file_ids:
        return jsonify({"error": "no file ids provided"}), 400
    
    with db(write=True) as con:
        placeholders = ",".join("?" for _ in file_ids)
        con.execute(
            f"UPDATE files SET folder_id=? WHERE id IN ({placeholders})",
            [folder_id] + file_ids
        )
    return jsonify({"ok": True})


def run_storage_cleanup():
    deleted_files = []
    missing_files = []

    # 1. Fetch all file records from DB
    with db() as con:
        db_files = con.execute("SELECT id, filename FROM files").fetchall()
    db_file_ids = {row["id"] for row in db_files}

    # 2. Delete orphaned files on disk (files on disk not in DB)
    if os.path.exists(UPLOAD_DIR):
        for entry in os.scandir(UPLOAD_DIR):
            if entry.is_file():
                filename = entry.name
                # Ignore hidden files (e.g. .DS_Store, .gitkeep)
                if filename.startswith('.'):
                    continue
                if filename not in db_file_ids:
                    try:
                        os.remove(entry.path)
                        deleted_files.append(filename)
                    except Exception as e:
                        print(f"Cleanup error: Failed to delete orphaned file {entry.path}: {e}")

    # 3. Identify files in DB but missing on disk
    for row in db_files:
        fid = row["id"]
        disk_path = os.path.join(UPLOAD_DIR, fid)
        if not os.path.exists(disk_path):
            missing_files.append({"id": fid, "filename": row["filename"]})

    # Print reports to console
    if deleted_files:
        print(f"Storage cleanup: Deleted {len(deleted_files)} orphaned files from disk: {deleted_files}")
    if missing_files:
        print(f"Warning: {len(missing_files)} files in database are missing on disk: {missing_files}")

    return {
        "deleted_count": len(deleted_files),
        "deleted_files": deleted_files,
        "missing_count": len(missing_files),
        "missing_files": missing_files
    }


@bp.post("/api/files/cleanup")
def manual_cleanup():
    res = run_storage_cleanup()
    return jsonify(res)

