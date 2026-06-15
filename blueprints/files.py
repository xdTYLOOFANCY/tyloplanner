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
    with db() as con:
        con.execute(
            "INSERT INTO files(id, filename, size, mimetype, uploaded, folder_id) VALUES(?,?,?,?,?,?)",
            (fid, original_name, size, f.mimetype or "application/octet-stream", ts, folder_id))
    return jsonify({"id": fid, "filename": original_name, "size": size})


@bp.get("/api/files/<fid>/download")
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


@bp.get("/api/files/<fid>/view")
def view_file(fid):
    with db() as con:
        row = con.execute("SELECT * FROM files WHERE id=?", (fid,)).fetchone()
    if not row:
        return jsonify({"error": "not found"}), 404
    disk_path = os.path.join(UPLOAD_DIR, fid)
    if not os.path.exists(disk_path):
        return jsonify({"error": "file missing from disk"}), 404
    return send_file(disk_path, mimetype=row["mimetype"] or "application/octet-stream")


@bp.delete("/api/files/<fid>")
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


@bp.delete("/api/folders/<fid>")
def delete_folder(fid):
    with db() as con:
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
    
    with db() as con:
        placeholders = ",".join("?" for _ in file_ids)
        con.execute(
            f"UPDATE files SET folder_id=? WHERE id IN ({placeholders})",
            [folder_id] + file_ids
        )
    return jsonify({"ok": True})
