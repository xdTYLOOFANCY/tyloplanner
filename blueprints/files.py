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
