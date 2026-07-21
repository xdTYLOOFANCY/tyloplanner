"""
Files blueprint — Drive-style file storage.

Upload (with storage quota), download, view, trash/restore, folder moves,
zip export, storage stats, and server-side docx/xlsx/csv → HTML previews
(stdlib zipfile + ElementTree, no extra dependencies).
"""
import base64
import csv
import html
import os
import tempfile
import time
import zipfile
import xml.etree.ElementTree as ET

from flask import Blueprint, request, jsonify, send_file

from helpers import db, uid, setting, UPLOAD_DIR, DB_PATH, BACKUP_DIR

bp = Blueprint("files", __name__)

MAX_ZIP_ENTRIES = 2000
PREVIEW_IMG_BUDGET = 8 * 1024 * 1024   # total embedded image bytes per docx preview
PREVIEW_MEMBER_CAP = 60 * 1024 * 1024  # refuse zip members larger than this (zip-bomb guard)


# ---------------- shared helpers ----------------

def _disk_path(fid):
    base_dir = os.path.abspath(UPLOAD_DIR)
    path = os.path.abspath(os.path.join(base_dir, fid))
    return path if path.startswith(base_dir + os.sep) else None


def _get_file_row(fid):
    with db() as con:
        return con.execute("SELECT * FROM files WHERE id=?", (fid,)).fetchone()


def _subtree_folder_ids(con, folder_id):
    """The folder plus all its descendants (recursive CTE)."""
    rows = con.execute(
        "WITH RECURSIVE sub(id) AS ("
        "  SELECT id FROM folders WHERE id=?"
        "  UNION ALL"
        "  SELECT f.id FROM folders f JOIN sub s ON f.parent_id = s.id"
        ") SELECT id FROM sub", (folder_id,)).fetchall()
    return [r["id"] for r in rows]


def _ids_param(data, key):
    ids = data.get(key) or []
    if not isinstance(ids, list) or len(ids) > 2000 or not all(isinstance(i, str) for i in ids):
        return None
    return ids


def _quota_bytes():
    try:
        gb = float(setting("storage_quota_gb") or 0)
    except ValueError:
        gb = 0
    return int(gb * 1024 ** 3) if gb > 0 else 0


def _files_bytes(con, include_trash=True):
    where = "" if include_trash else " WHERE deleted IS NULL"
    return con.execute("SELECT COALESCE(SUM(size),0) s FROM files" + where).fetchone()["s"]


def _dir_bytes(path):
    total = 0
    if os.path.isdir(path):
        for entry in os.scandir(path):
            if entry.is_file() and not entry.name.startswith("."):
                total += entry.stat().st_size
    return total


def _remove_disk(fid):
    path = _disk_path(fid)
    if path and os.path.exists(path):
        try:
            os.remove(path)
        except OSError as e:
            print(f"Files: could not remove {path}: {e}")


# ---------------- upload / download / view ----------------

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

    quota = _quota_bytes()
    if quota:
        with db() as con:
            used = _files_bytes(con)
        # ponytail: checked after save so the size is exact; parallel uploads
        # can overshoot by one in-flight file — acceptable for a personal app.
        if used + size > quota:
            os.remove(disk_path)
            return jsonify({"error": "Storage limit reached (%s of %s used). "
                            "Empty the trash or raise the limit in Storage."
                            % (_fmt_size(used), _fmt_size(quota))}), 413

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


def _fmt_size(n):
    for unit in ("B", "KB", "MB", "GB", "TB"):
        if n < 1024 or unit == "TB":
            return f"{n:.1f} {unit}" if unit != "B" else f"{n} B"
        n /= 1024


@bp.get("/api/files/<fid>/download")
def download_file(fid):
    row = _get_file_row(fid)
    if not row:
        return jsonify({"error": "not found"}), 404
    disk_path = _disk_path(fid)
    if not disk_path:
        return jsonify({"error": "forbidden"}), 403
    if not os.path.exists(disk_path):
        return jsonify({"error": "file missing from disk"}), 404
    return send_file(disk_path, as_attachment=True, download_name=row["filename"],
                     mimetype="application/octet-stream")


@bp.get("/api/files/<fid>/view")
def view_file(fid):
    row = _get_file_row(fid)
    if not row:
        return jsonify({"error": "not found"}), 404
    disk_path = _disk_path(fid)
    if not disk_path:
        return jsonify({"error": "forbidden"}), 403
    if not os.path.exists(disk_path):
        return jsonify({"error": "file missing from disk"}), 404
    # conditional=True enables Range requests, which video/audio seeking needs.
    return send_file(disk_path, mimetype=row["mimetype"] or "application/octet-stream",
                     conditional=True)


# ---------------- trash / restore ----------------

@bp.post("/api/files/trash")
def trash_items():
    data = request.get_json(force=True) or {}
    file_ids = _ids_param(data, "file_ids")
    folder_ids = _ids_param(data, "folder_ids")
    if file_ids is None or folder_ids is None or not (file_ids or folder_ids):
        return jsonify({"error": "file_ids/folder_ids must be lists of ids"}), 400
    ts = int(time.time() * 1000)
    with db(write=True) as con:
        if file_ids:
            ph = ",".join("?" for _ in file_ids)
            con.execute(f"UPDATE files SET deleted=? WHERE id IN ({ph})", [ts] + file_ids)
        for fol in folder_ids:
            sub = _subtree_folder_ids(con, fol)
            if not sub:
                continue
            ph = ",".join("?" for _ in sub)
            con.execute(f"UPDATE folders SET deleted=? WHERE id IN ({ph}) AND deleted IS NULL",
                        [ts] + sub)
            con.execute(f"UPDATE files SET deleted=? WHERE folder_id IN ({ph}) AND deleted IS NULL",
                        [ts] + sub)
    return jsonify({"ok": True})


@bp.post("/api/files/restore")
def restore_items():
    data = request.get_json(force=True) or {}
    file_ids = _ids_param(data, "file_ids")
    folder_ids = _ids_param(data, "folder_ids")
    if file_ids is None or folder_ids is None or not (file_ids or folder_ids):
        return jsonify({"error": "file_ids/folder_ids must be lists of ids"}), 400

    def undelete_ancestors(con, folder_id):
        # A restored item must land in a visible folder, so resurrect its path.
        seen = 0
        while folder_id and seen < 50:
            seen += 1
            row = con.execute("SELECT parent_id, deleted FROM folders WHERE id=?",
                              (folder_id,)).fetchone()
            if not row:
                break
            if row["deleted"] is not None:
                con.execute("UPDATE folders SET deleted=NULL WHERE id=?", (folder_id,))
            folder_id = row["parent_id"]

    with db(write=True) as con:
        if file_ids:
            ph = ",".join("?" for _ in file_ids)
            rows = con.execute(f"SELECT id, folder_id FROM files WHERE id IN ({ph})",
                               file_ids).fetchall()
            con.execute(f"UPDATE files SET deleted=NULL WHERE id IN ({ph})", file_ids)
            for r in rows:
                undelete_ancestors(con, r["folder_id"])
        for fol in folder_ids:
            # ponytail: restores the whole subtree, not just what was trashed
            # in the same action — track a trash-group id if that ever matters.
            sub = _subtree_folder_ids(con, fol)
            if not sub:
                continue
            ph = ",".join("?" for _ in sub)
            con.execute(f"UPDATE folders SET deleted=NULL WHERE id IN ({ph})", sub)
            con.execute(f"UPDATE files SET deleted=NULL WHERE folder_id IN ({ph})", sub)
            parent = con.execute("SELECT parent_id FROM folders WHERE id=?", (fol,)).fetchone()
            if parent:
                undelete_ancestors(con, parent["parent_id"])
    return jsonify({"ok": True})


def _purge_trashed(older_than_ms=None):
    """Permanently delete trashed files (disk + rows) and trashed folders."""
    cond = "deleted IS NOT NULL"
    args = []
    if older_than_ms is not None:
        cond += " AND deleted < ?"
        args.append(older_than_ms)
    with db(write=True) as con:
        gone = [r["id"] for r in con.execute(f"SELECT id FROM files WHERE {cond}", args)]
        con.execute(f"DELETE FROM files WHERE {cond}", args)
        con.execute(f"DELETE FROM folders WHERE {cond}", args)
    for fid in gone:
        _remove_disk(fid)
    return len(gone)


@bp.post("/api/files/trash/empty")
def empty_trash():
    n = _purge_trashed()
    return jsonify({"ok": True, "purged": n})


def purge_old_trash():
    """Scheduler job: auto-empty trash entries older than the retention window."""
    try:
        days = float(setting("trash_retention_days") or 0)
    except ValueError:
        days = 0
    if days <= 0:
        return
    cutoff = int((time.time() - days * 86400) * 1000)
    n = _purge_trashed(older_than_ms=cutoff)
    if n:
        print(f"Trash purge: permanently deleted {n} files older than {days:g} days")


@bp.delete("/api/files/<fid>")
def delete_file(fid):
    with db(write=True) as con:
        row = con.execute("SELECT id FROM files WHERE id=?", (fid,)).fetchone()
        if not row:
            return jsonify({"error": "not found"}), 404
        con.execute("DELETE FROM files WHERE id=?", (fid,))
    _remove_disk(fid)
    return jsonify({"ok": True})


@bp.delete("/api/folders/<fid>")
def delete_folder(fid):
    """Permanently delete a folder and everything inside it (used from Trash)."""
    with db(write=True) as con:
        sub = _subtree_folder_ids(con, fid)
        if not sub:
            return jsonify({"error": "folder not found"}), 404
        ph = ",".join("?" for _ in sub)
        gone = [r["id"] for r in
                con.execute(f"SELECT id FROM files WHERE folder_id IN ({ph})", sub)]
        con.execute(f"DELETE FROM files WHERE folder_id IN ({ph})", sub)
        con.execute(f"DELETE FROM folders WHERE id IN ({ph})", sub)
    for gid in gone:
        _remove_disk(gid)
    return jsonify({"ok": True})


# ---------------- move ----------------

@bp.post("/api/files/move")
def move_items():
    data = request.get_json(force=True) or {}
    file_ids = _ids_param(data, "file_ids")
    folder_ids = _ids_param(data, "folder_ids")
    if file_ids is None or folder_ids is None or not (file_ids or folder_ids):
        return jsonify({"error": "file_ids/folder_ids must be lists of ids"}), 400
    target = data.get("folder_id")
    if target == "":
        target = None
    if target is not None and not isinstance(target, str):
        return jsonify({"error": "folder_id must be a string or null"}), 400

    with db(write=True) as con:
        if target is not None:
            row = con.execute("SELECT id FROM folders WHERE id=? AND deleted IS NULL",
                              (target,)).fetchone()
            if not row:
                return jsonify({"error": "target folder not found"}), 404
        for fol in folder_ids:
            if target is not None and target in _subtree_folder_ids(con, fol):
                return jsonify({"error": "cannot move a folder into itself"}), 400
        if file_ids:
            ph = ",".join("?" for _ in file_ids)
            con.execute(f"UPDATE files SET folder_id=? WHERE id IN ({ph})",
                        [target] + file_ids)
        if folder_ids:
            ph = ",".join("?" for _ in folder_ids)
            con.execute(f"UPDATE folders SET parent_id=? WHERE id IN ({ph})",
                        [target] + folder_ids)
    return jsonify({"ok": True})


# ---------------- zip download ----------------

@bp.post("/api/files/zip")
def zip_download():
    # Accepts JSON or a form field "payload" (form POST → native browser download).
    if request.form.get("payload"):
        import json
        try:
            data = json.loads(request.form["payload"])
        except ValueError:
            return jsonify({"error": "bad payload"}), 400
    else:
        data = request.get_json(force=True, silent=True) or {}
    file_ids = _ids_param(data, "file_ids")
    folder_ids = _ids_param(data, "folder_ids")
    if file_ids is None or folder_ids is None or not (file_ids or folder_ids):
        return jsonify({"error": "file_ids/folder_ids must be lists of ids"}), 400

    with db() as con:
        folders = {r["id"]: dict(r) for r in
                   con.execute("SELECT id, name, parent_id FROM folders")}
        entries = []  # (archive_path, fid)

        def add_file_row(row, prefix):
            entries.append((prefix + (row["filename"] or row["id"]), row["id"]))

        if file_ids:
            ph = ",".join("?" for _ in file_ids)
            for r in con.execute(f"SELECT id, filename FROM files WHERE id IN ({ph})", file_ids):
                add_file_row(r, "")
        for fol in folder_ids:
            sub = _subtree_folder_ids(con, fol)
            if not sub:
                continue
            base_parent = folders.get(fol, {}).get("parent_id")

            def rel_prefix(folder_id):
                parts, cur, hops = [], folder_id, 0
                while cur and cur != base_parent and hops < 50:
                    hops += 1
                    f = folders.get(cur)
                    if not f:
                        break
                    parts.append(f["name"] or cur)
                    cur = f["parent_id"]
                return "/".join(reversed(parts)) + "/" if parts else ""

            ph = ",".join("?" for _ in sub)
            for r in con.execute(
                    f"SELECT id, filename, folder_id FROM files WHERE folder_id IN ({ph})"
                    " AND deleted IS NULL", sub):
                add_file_row(r, rel_prefix(r["folder_id"]))

    if not entries:
        return jsonify({"error": "nothing to zip"}), 404
    if len(entries) > MAX_ZIP_ENTRIES:
        return jsonify({"error": f"too many files (max {MAX_ZIP_ENTRIES})"}), 400

    tmp_fd, tmp_path = tempfile.mkstemp(suffix=".zip")
    os.close(tmp_fd)
    seen = {}
    with zipfile.ZipFile(tmp_path, "w", zipfile.ZIP_DEFLATED) as z:
        for arc, fid in entries:
            disk = _disk_path(fid)
            if not disk or not os.path.exists(disk):
                continue
            arc = arc.replace("\\", "/").lstrip("/")
            if arc in seen:  # dedupe name collisions: "a.pdf" → "a (2).pdf"
                seen[arc] += 1
                root, ext = os.path.splitext(arc)
                arc = f"{root} ({seen[arc]}){ext}"
            else:
                seen[arc] = 1
            z.write(disk, arc)

    name = "tyloplanner-files.zip"
    if folder_ids and not file_ids and len(folder_ids) == 1:
        fol = folders.get(folder_ids[0])
        if fol and fol.get("name"):
            name = fol["name"] + ".zip"
    resp = send_file(tmp_path, as_attachment=True, download_name=name,
                     mimetype="application/zip")
    resp.call_on_close(lambda: os.path.exists(tmp_path) and os.remove(tmp_path))
    return resp


# ---------------- storage stats ----------------

@bp.get("/api/storage")
def storage_stats():
    with db() as con:
        files_bytes = _files_bytes(con, include_trash=False)
        trash_bytes = con.execute(
            "SELECT COALESCE(SUM(size),0) s FROM files WHERE deleted IS NOT NULL").fetchone()["s"]
        notes_bytes = con.execute(
            "SELECT COALESCE(SUM(LENGTH(COALESCE(body,'')) + LENGTH(COALESCE(title,''))),0) s"
            " FROM notes").fetchone()["s"]
    db_bytes = 0
    for suffix in ("", "-wal", "-shm"):
        p = DB_PATH + suffix
        if os.path.exists(p):
            db_bytes += os.path.getsize(p)
    return jsonify({
        "quota_bytes": _quota_bytes(),
        "quota_gb_setting": setting("storage_quota_gb"),
        "trash_retention_days": setting("trash_retention_days"),
        "files_bytes": files_bytes,
        "trash_bytes": trash_bytes,
        "notes_bytes": notes_bytes,
        "db_bytes": db_bytes,
        "backups_bytes": _dir_bytes(BACKUP_DIR),
        "uploads_disk_bytes": _dir_bytes(UPLOAD_DIR),
    })


# ---------------- previews (docx / xlsx / csv → HTML) ----------------

_W = "{http://schemas.openxmlformats.org/wordprocessingml/2006/main}"
_RNS = "{http://schemas.openxmlformats.org/officeDocument/2006/relationships}"
_A = "{http://schemas.openxmlformats.org/drawingml/2006/main}"

_PREVIEW_CSS = """
body{font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;
  background:#fff;color:#1a1a1a;max-width:800px;margin:0 auto;padding:32px 24px;
  line-height:1.55;font-size:15px}
h1,h2,h3,h4{line-height:1.25}
img{max-width:100%;height:auto}
table{border-collapse:collapse;margin:12px 0;max-width:100%}
td,th{border:1px solid #ccc;padding:4px 8px;font-size:13px;vertical-align:top}
th{background:#f3f3f3}
a{color:#1a56db}
.sheet-name{margin:20px 0 6px;font-size:13px;font-weight:700;color:#555;
  text-transform:uppercase;letter-spacing:.04em}
.trunc{color:#888;font-style:italic;font-size:13px}
"""


def _preview_page(title, body):
    return ("<!doctype html><html><head><meta charset='utf-8'>"
            "<title>%s</title><style>%s</style></head><body>%s</body></html>"
            % (html.escape(title or "Preview"), _PREVIEW_CSS, body))


def _zread(z, name, cap=PREVIEW_MEMBER_CAP):
    info = z.getinfo(name)
    if info.file_size > cap:
        raise ValueError("member too large")
    return z.read(name)


def _flag_on(rpr, tag):
    el = rpr.find(_W + tag) if rpr is not None else None
    if el is None:
        return False
    return el.get(_W + "val", "1").lower() not in ("0", "false", "none")


def _docx_run_html(run, z, rels, budget):
    parts = []
    rpr = run.find(_W + "rPr")
    pre, post = "", ""
    if _flag_on(rpr, "b"):
        pre, post = pre + "<b>", "</b>" + post
    if _flag_on(rpr, "i"):
        pre, post = pre + "<i>", "</i>" + post
    if _flag_on(rpr, "u"):
        pre, post = pre + "<u>", "</u>" + post
    if _flag_on(rpr, "strike"):
        pre, post = pre + "<s>", "</s>" + post
    if rpr is not None:
        va = rpr.find(_W + "vertAlign")
        if va is not None and va.get(_W + "val") == "superscript":
            pre, post = pre + "<sup>", "</sup>" + post
        elif va is not None and va.get(_W + "val") == "subscript":
            pre, post = pre + "<sub>", "</sub>" + post
    for child in run:
        tag = child.tag
        if tag == _W + "t":
            parts.append(html.escape(child.text or ""))
        elif tag == _W + "br":
            parts.append("<br>")
        elif tag == _W + "tab":
            parts.append("&emsp;")
        elif tag in (_W + "drawing", _W + "pict", _W + "object"):
            for blip in child.iter(_A + "blip"):
                rid = blip.get(_RNS + "embed")
                target = (rels.get(rid) or ["", ""])[0]
                if not target:
                    continue
                member = "word/" + target.lstrip("/")
                try:
                    data = _zread(z, member, cap=10 * 1024 * 1024)
                except (KeyError, ValueError):
                    continue
                if budget[0] < len(data):
                    parts.append("<span class='trunc'>[image omitted]</span>")
                    continue
                budget[0] -= len(data)
                ext = os.path.splitext(member)[1].lstrip(".").lower() or "png"
                mime = {"jpg": "jpeg", "svg": "svg+xml"}.get(ext, ext)
                parts.append("<img src='data:image/%s;base64,%s'>"
                             % (mime, base64.b64encode(data).decode()))
    return pre + "".join(parts) + post


def _docx_para_html(p, z, rels, budget):
    """Returns (html, is_list_item, heading_level)."""
    ppr = p.find(_W + "pPr")
    heading, is_list, align = 0, False, ""
    if ppr is not None:
        st = ppr.find(_W + "pStyle")
        if st is not None:
            val = (st.get(_W + "val") or "").lower()
            if val.startswith("heading"):
                digits = "".join(c for c in val if c.isdigit())
                heading = min(max(int(digits or 1), 1), 6)
            elif val == "title":
                heading = 1
        if ppr.find(_W + "numPr") is not None:
            is_list = True
        jc = ppr.find(_W + "jc")
        if jc is not None and jc.get(_W + "val") in ("center", "right"):
            align = " style='text-align:%s'" % jc.get(_W + "val")
    inner = []
    for child in p:
        if child.tag == _W + "r":
            inner.append(_docx_run_html(child, z, rels, budget))
        elif child.tag == _W + "hyperlink":
            rid = child.get(_RNS + "id")
            href, mode = rels.get(rid) or ("", "")
            runs = "".join(_docx_run_html(r, z, rels, budget)
                           for r in child.findall(_W + "r"))
            if href and href.split(":", 1)[0].lower() in ("http", "https", "mailto"):
                inner.append("<a href='%s' target='_blank'>%s</a>"
                             % (html.escape(href, quote=True), runs))
            else:
                inner.append(runs)
    text = "".join(inner)
    if is_list:
        return "<li%s>%s</li>" % (align, text), True, 0
    if heading:
        return "<h%d%s>%s</h%d>" % (heading, align, text, heading), False, heading
    return "<p%s>%s</p>" % (align, text or "&nbsp;"), False, 0


def _docx_block_html(el, z, rels, budget, out):
    if el.tag == _W + "p":
        h, is_list, _ = _docx_para_html(el, z, rels, budget)
        if is_list:
            if not out or out[-1] != "__IN_LIST__":
                out.append("<ul>")
                out.append("__IN_LIST__")
            out.insert(len(out) - 1, h)
        else:
            _close_list(out)
            out.append(h)
    elif el.tag == _W + "tbl":
        _close_list(out)
        rows_html = []
        for tr in el.findall(_W + "tr"):
            cells = []
            for tc in tr.findall(_W + "tc"):
                span = ""
                tcpr = tc.find(_W + "tcPr")
                if tcpr is not None:
                    gs = tcpr.find(_W + "gridSpan")
                    if gs is not None and (gs.get(_W + "val") or "").isdigit():
                        span = " colspan='%s'" % gs.get(_W + "val")
                sub = []
                for p in tc.findall(_W + "p"):
                    h, _, _ = _docx_para_html(p, z, rels, budget)
                    sub.append(h)
                cells.append("<td%s>%s</td>" % (span, "".join(sub)))
            rows_html.append("<tr>%s</tr>" % "".join(cells))
        out.append("<table>%s</table>" % "".join(rows_html))


def _close_list(out):
    if out and out[-1] == "__IN_LIST__":
        out.pop()
        out.append("</ul>")


def _docx_to_html(path, title):
    with zipfile.ZipFile(path) as z:
        rels = {}
        try:
            root = ET.fromstring(_zread(z, "word/_rels/document.xml.rels"))
            for rel in root:
                rels[rel.get("Id")] = (rel.get("Target") or "", rel.get("TargetMode") or "")
        except (KeyError, ET.ParseError):
            pass
        doc = ET.fromstring(_zread(z, "word/document.xml"))
        body = doc.find(_W + "body")
        out, budget = [], [PREVIEW_IMG_BUDGET]
        for el in (body if body is not None else []):
            _docx_block_html(el, z, rels, budget, out)
        _close_list(out)
    return _preview_page(title, "".join(out))


def _xlsx_col_index(ref):
    col = 0
    for ch in ref:
        if ch.isalpha():
            col = col * 26 + (ord(ch.upper()) - 64)
        else:
            break
    return col - 1


def _xlsx_to_html(path, title, max_sheets=5, max_rows=300, max_cols=40):
    with zipfile.ZipFile(path) as z:
        shared = []
        if "xl/sharedStrings.xml" in z.namelist():
            root = ET.fromstring(_zread(z, "xl/sharedStrings.xml"))
            ns = "{http://schemas.openxmlformats.org/spreadsheetml/2006/main}"
            for si in root.findall(ns + "si"):
                shared.append("".join(t.text or "" for t in si.iter(ns + "t")))
        ns = "{http://schemas.openxmlformats.org/spreadsheetml/2006/main}"
        wb = ET.fromstring(_zread(z, "xl/workbook.xml"))
        rels = {}
        try:
            rroot = ET.fromstring(_zread(z, "xl/_rels/workbook.xml.rels"))
            for rel in rroot:
                rels[rel.get("Id")] = rel.get("Target") or ""
        except (KeyError, ET.ParseError):
            pass
        sections = []
        sheets = wb.find(ns + "sheets")
        for sheet in (sheets if sheets is not None else [])[:max_sheets]:
            name = sheet.get("name") or "Sheet"
            target = rels.get(sheet.get(_RNS + "id"), "")
            member = "xl/" + target.lstrip("/") if not target.startswith("xl/") else target
            if member not in z.namelist():
                continue
            sroot = ET.fromstring(_zread(z, member))
            rows_html, truncated = [], False
            data = sroot.find(ns + "sheetData")
            for i, row in enumerate(data if data is not None else []):
                if i >= max_rows:
                    truncated = True
                    break
                cells = {}
                for c in row.findall(ns + "c"):
                    idx = _xlsx_col_index(c.get("r") or "")
                    if idx < 0 or idx >= max_cols:
                        continue
                    t = c.get("t")
                    v = c.find(ns + "v")
                    if t == "s" and v is not None and (v.text or "").isdigit():
                        val = shared[int(v.text)] if int(v.text) < len(shared) else ""
                    elif t == "inlineStr":
                        is_el = c.find(ns + "is")
                        val = "".join(x.text or "" for x in is_el.iter(ns + "t")) if is_el is not None else ""
                    elif t == "b" and v is not None:
                        val = "TRUE" if v.text == "1" else "FALSE"
                    else:
                        val = v.text if v is not None else ""
                    cells[idx] = val or ""
                if not cells:
                    continue
                width = max(cells) + 1
                tds = "".join("<td>%s</td>" % html.escape(cells.get(j, ""))
                              for j in range(width))
                rows_html.append("<tr>%s</tr>" % tds)
            sec = "<div class='sheet-name'>%s</div><table>%s</table>" % (
                html.escape(name), "".join(rows_html))
            if truncated:
                sec += "<p class='trunc'>Showing first %d rows.</p>" % max_rows
            sections.append(sec)
    return _preview_page(title, "".join(sections) or "<p class='trunc'>Empty spreadsheet.</p>")


def _csv_to_html(path, title, max_rows=1000, max_cols=60):
    with open(path, "r", encoding="utf-8", errors="replace", newline="") as fh:
        sample = fh.read(8192)
        fh.seek(0)
        try:
            dialect = csv.Sniffer().sniff(sample, delimiters=",;\t")
        except csv.Error:
            dialect = csv.excel
        rows_html, truncated = [], False
        for i, row in enumerate(csv.reader(fh, dialect)):
            if i >= max_rows:
                truncated = True
                break
            tag = "th" if i == 0 else "td"
            tds = "".join("<%s>%s</%s>" % (tag, html.escape(c), tag)
                          for c in row[:max_cols])
            rows_html.append("<tr>%s</tr>" % tds)
    body = "<table>%s</table>" % "".join(rows_html)
    if truncated:
        body += "<p class='trunc'>Showing first %d rows.</p>" % max_rows
    return _preview_page(title, body)


@bp.get("/api/files/<fid>/preview")
def preview_file(fid):
    row = _get_file_row(fid)
    if not row:
        return jsonify({"error": "not found"}), 404
    disk_path = _disk_path(fid)
    if not disk_path or not os.path.exists(disk_path):
        return jsonify({"error": "file missing from disk"}), 404
    ext = os.path.splitext(row["filename"] or "")[1].lower()
    title = row["filename"] or "Preview"
    try:
        if ext == ".docx":
            page = _docx_to_html(disk_path, title)
        elif ext == ".xlsx":
            page = _xlsx_to_html(disk_path, title)
        elif ext in (".csv", ".tsv"):
            page = _csv_to_html(disk_path, title)
        else:
            return jsonify({"error": "no server preview for this type"}), 415
    except Exception as e:
        page = _preview_page(title, "<p class='trunc'>Could not render a preview "
                             "of this file (%s). Try downloading it instead.</p>"
                             % html.escape(type(e).__name__))
    return page, 200, {"Content-Type": "text/html; charset=utf-8"}


# ---------------- cleanup ----------------

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
