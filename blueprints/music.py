"""
Music blueprint — audio metadata extraction (mutagen), embedded album art,
and playlist track ordering. Playback itself streams through the existing
/api/files/<fid>/view endpoint.
"""
import os
import base64

from flask import Blueprint, request, jsonify, Response

from helpers import db, uid, UPLOAD_DIR, db_retry

bp = Blueprint("music", __name__)

# 1x1-viewbox-independent placeholder shown when a track has no embedded art.
_PLACEHOLDER_SVG = (
    '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 48 48">'
    '<rect width="48" height="48" rx="8" fill="#1f232c"/>'
    '<path d="M32 12v14.55A5.5 5.5 0 1 0 34 31V17h6v-5z" fill="#4f8cff" opacity="0.85"/>'
    '<circle cx="18" cy="33" r="5" fill="#4f8cff" opacity="0.55"/>'
    '<path d="M23 33V15l9-3" stroke="#4f8cff" stroke-width="2" fill="none" opacity="0.55"/>'
    '</svg>'
)


def extract_audio_meta(disk_path):
    """Read duration/title/artist/album from an audio file via mutagen.

    Returns a dict with any fields that could be read (possibly empty).
    Never raises — a corrupt or unsupported file just yields {}.
    """
    out = {}
    try:
        import mutagen
        f = mutagen.File(disk_path, easy=True)
        if f is None:
            return out
        if getattr(f, "info", None) is not None and getattr(f.info, "length", 0):
            out["duration"] = round(float(f.info.length), 2)
        tags = f.tags or {}
        for col, key in (("audio_title", "title"), ("audio_artist", "artist"),
                         ("audio_album", "album")):
            try:
                val = tags.get(key)
                if val:
                    out[col] = str(val[0])[:255]
            except Exception:
                pass
    except Exception as e:
        print("mutagen metadata read failed for %s: %s" % (disk_path, e))
    return out


def update_file_audio_meta(fid):
    """Extract and store audio metadata for one uploaded file (best effort)."""
    disk_path = os.path.join(UPLOAD_DIR, fid)
    meta = extract_audio_meta(disk_path)
    if not meta:
        return
    cols = list(meta)
    with db(write=True) as con:
        con.execute(
            "UPDATE files SET %s WHERE id=?" % ",".join('"%s"=?' % c for c in cols),
            [meta[c] for c in cols] + [fid])


@bp.post("/api/music/scan")
@db_retry()
def scan_library():
    """Extract metadata for audio files that don't have it yet.

    Pass {"force": true} to rescan every audio file.
    """
    force = bool((request.get_json(silent=True) or {}).get("force"))
    with db() as con:
        where = "" if force else " AND duration IS NULL"
        rows = con.execute(
            "SELECT id FROM files WHERE mimetype LIKE 'audio/%'" + where).fetchall()
    scanned = 0
    for row in rows:
        update_file_audio_meta(row["id"])
        scanned += 1
    return jsonify({"ok": True, "scanned": scanned})


def _embedded_art(disk_path):
    """Return (bytes, mimetype) of embedded album art, or (None, None)."""
    try:
        import mutagen
        from mutagen.flac import Picture
        f = mutagen.File(disk_path)
        if f is None:
            return None, None
        tags = f.tags
        # ID3 (mp3): APIC frames
        if tags is not None and hasattr(tags, "getall"):
            for frame in tags.getall("APIC"):
                return frame.data, frame.mime or "image/jpeg"
        # FLAC: pictures list
        for pic in getattr(f, "pictures", []) or []:
            return pic.data, pic.mime or "image/jpeg"
        # MP4/M4A: covr atom
        if tags is not None and "covr" in tags:
            covr = tags["covr"][0]
            mime = "image/png" if getattr(covr, "imageformat", 14) == 14 else "image/jpeg"
            return bytes(covr), mime
        # OGG Vorbis/Opus: base64 METADATA_BLOCK_PICTURE
        if tags is not None:
            try:
                for b64 in tags.get("metadata_block_picture", []):
                    pic = Picture(base64.b64decode(b64))
                    return pic.data, pic.mime or "image/jpeg"
            except Exception:
                pass
    except Exception as e:
        print("album art extraction failed for %s: %s" % (disk_path, e))
    return None, None


@bp.get("/api/files/<fid>/art")
def album_art(fid):
    with db() as con:
        row = con.execute("SELECT id FROM files WHERE id=?", (fid,)).fetchone()
    if not row:
        return jsonify({"error": "not found"}), 404

    base_dir = os.path.abspath(UPLOAD_DIR)
    disk_path = os.path.abspath(os.path.join(base_dir, fid))
    if not disk_path.startswith(base_dir) or not os.path.exists(disk_path):
        return jsonify({"error": "not found"}), 404

    data, mime = _embedded_art(disk_path)
    if data:
        resp = Response(data, mimetype=mime)
    else:
        resp = Response(_PLACEHOLDER_SVG, mimetype="image/svg+xml")
    resp.headers["Cache-Control"] = "private, max-age=86400"
    return resp


@bp.post("/api/playlists/<pid>/reorder")
@db_retry()
def reorder_playlist(pid):
    """Accept {"tracks": [playlist_track_id, ...]} and rewrite positions."""
    ids = (request.get_json(force=True) or {}).get("tracks") or []
    if not isinstance(ids, list) or not all(isinstance(i, str) for i in ids):
        return jsonify({"error": "tracks must be a list of ids"}), 400
    with db(write=True) as con:
        for pos, tid in enumerate(ids):
            con.execute(
                "UPDATE playlist_tracks SET position=? WHERE id=? AND playlist_id=?",
                (pos, tid, pid))
    return jsonify({"ok": True})


@bp.post("/api/playlists/<pid>/add-tracks")
@db_retry()
def add_tracks(pid):
    """Accept {"file_ids": [...]} and append them to the end of the playlist."""
    file_ids = (request.get_json(force=True) or {}).get("file_ids") or []
    if not isinstance(file_ids, list) or not all(isinstance(i, str) for i in file_ids):
        return jsonify({"error": "file_ids must be a list of ids"}), 400
    import time
    now = int(time.time() * 1000)
    added = []
    with db(write=True) as con:
        pl = con.execute("SELECT id FROM playlists WHERE id=?", (pid,)).fetchone()
        if not pl:
            return jsonify({"error": "playlist not found"}), 404
        row = con.execute(
            "SELECT COALESCE(MAX(position), -1) AS m FROM playlist_tracks WHERE playlist_id=?",
            (pid,)).fetchone()
        pos = int(row["m"]) + 1
        for fid in file_ids:
            exists = con.execute("SELECT 1 FROM files WHERE id=?", (fid,)).fetchone()
            if not exists:
                continue
            tid = uid()
            con.execute(
                "INSERT INTO playlist_tracks(id, playlist_id, file_id, position, added) "
                "VALUES(?,?,?,?,?)", (tid, pid, fid, pos, now))
            added.append(tid)
            pos += 1
    return jsonify({"ok": True, "added": added})
