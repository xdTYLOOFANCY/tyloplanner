"""
Calendar blueprint — ICS export, import, sync, and clear.
"""
import re
from datetime import datetime

import requests
from flask import Blueprint, request, jsonify, Response

from helpers import db, uid, setting, kv_set

bp = Blueprint("calendar", __name__)


# ---------------- ICS helpers ----------------
def ics_escape(s):
    return (str(s or "").replace("\\", "\\\\").replace(";", "\\;")
            .replace(",", "\\,").replace("\n", "\\n"))


def parse_ics(text):
    """Minimal tolerant ICS parser: returns list of {date,start,end,title}.
    Recurring events are imported as their first occurrence only."""
    text = text.replace("\r\n", "\n").replace("\r", "\n")
    text = re.sub(r"\n[ \t]", "", text)  # unfold continuation lines
    events = []
    for block in re.findall(r"BEGIN:VEVENT(.*?)END:VEVENT", text, re.S):
        props = {}
        for line in block.strip().split("\n"):
            if ":" not in line:
                continue
            head, val = line.split(":", 1)
            key = head.split(";")[0].upper()
            props[key] = (head, val.strip())
        if "DTSTART" not in props:
            continue
        _, dt = props["DTSTART"]
        m = re.match(r"(\d{4})(\d{2})(\d{2})(?:T(\d{2})(\d{2}))?", dt)
        if not m:
            continue
        d = "%s-%s-%s" % (m.group(1), m.group(2), m.group(3))
        start = "%s:%s" % (m.group(4), m.group(5)) if m.group(4) else ""
        end = ""
        if "DTEND" in props:
            m2 = re.match(r"(\d{4})(\d{2})(\d{2})(?:T(\d{2})(\d{2}))?", props["DTEND"][1])
            if m2 and m2.group(4) and "%s-%s-%s" % (m2.group(1), m2.group(2), m2.group(3)) == d:
                end = "%s:%s" % (m2.group(4), m2.group(5))
        title = props.get("SUMMARY", ("", "(no title)"))[1]
        title = title.replace("\\n", " ").replace("\\,", ",").replace("\\;", ";").replace("\\\\", "\\")
        events.append({"date": d, "start": start, "end": end, "title": title})
    return events


def import_ics_text(text):
    evs = parse_ics(text)
    added = 0
    with db() as con:
        for e in evs:
            dup = con.execute(
                'SELECT 1 FROM events WHERE "date"=? AND title=? AND "start"=?',
                (e["date"], e["title"], e["start"])).fetchone()
            if dup:
                continue
            con.execute(
                'INSERT INTO events(id,"date","start","end",title,type,source) '
                "VALUES(?,?,?,?,?,?,?)",
                (uid(), e["date"], e["start"], e["end"], e["title"], "other", "ics"))
            added += 1
    return {"found": len(evs), "added": added}


def cal_auto_sync():
    """Fetch and import all configured calendar URLs."""
    urls = [u.strip() for u in setting("cal_sync_urls").splitlines() if u.strip()]
    total = 0
    for url in urls:
        if not url.lower().startswith(("http://", "https://")):
            continue
        try:
            r = requests.get(url, timeout=20)
            r.raise_for_status()
            total += import_ics_text(r.text)["added"]
        except Exception as e:
            print("calendar sync error for %s: %s" % (url, e))
    if urls:
        kv_set("cal_last_sync_human", datetime.now().isoformat(timespec="seconds"))
    return total


# ---------------- routes ----------------
@bp.get("/calendar.ics")
def ics_export():
    now = datetime.now(datetime.UTC).strftime("%Y%m%dT%H%M%SZ")
    lines = ["BEGIN:VCALENDAR", "VERSION:2.0", "PRODID:-//TyloPlanner//EN",
             "CALSCALE:GREGORIAN", "X-WR-CALNAME:TyloPlanner"]
    with db() as con:
        for e in con.execute("SELECT * FROM events"):
            d = (e["date"] or "").replace("-", "")
            if not d:
                continue
            lines += ["BEGIN:VEVENT", "UID:%s@tyloplanner" % e["id"], "DTSTAMP:" + now]
            if e["start"]:
                st = e["start"].replace(":", "") + "00"
                lines.append("DTSTART:%sT%s" % (d, st))
                if e["end"]:
                    lines.append("DTEND:%sT%s00" % (d, e["end"].replace(":", "")))
            else:
                lines.append("DTSTART;VALUE=DATE:" + d)
            lines += ["SUMMARY:" + ics_escape(e["title"]), "END:VEVENT"]
        for x in con.execute("SELECT * FROM exams"):
            d = (x["date"] or "").replace("-", "")
            if not d:
                continue
            lines += ["BEGIN:VEVENT", "UID:%s@tyloplanner" % x["id"], "DTSTAMP:" + now,
                      "DTSTART;VALUE=DATE:" + d,
                      "SUMMARY:" + ics_escape("EXAM: " + (x["name"] or "")), "END:VEVENT"]
    lines.append("END:VCALENDAR")
    return Response("\r\n".join(lines) + "\r\n", mimetype="text/calendar",
                    headers={"Content-Disposition": "inline; filename=tyloplanner.ics"})


@bp.post("/api/ics/import")
def ics_import():
    text = None
    if "file" in request.files:
        text = request.files["file"].read().decode("utf-8", errors="replace")
    else:
        data = request.get_json(silent=True) or {}
        url = data.get("url")
        if url:
            if not url.lower().startswith(("http://", "https://")):
                return jsonify({"error": "invalid url"}), 400
            try:
                r = requests.get(url, timeout=20)
                r.raise_for_status()
                text = r.text
            except Exception as e:
                return jsonify({"error": "fetch failed: %s" % e}), 400
    if not text:
        return jsonify({"error": "provide an .ics file or a url"}), 400
    return jsonify(import_ics_text(text))


@bp.post("/api/ics/sync-now")
def ics_sync_now():
    if not setting("cal_sync_urls").strip():
        return jsonify({"error": "no calendar URLs configured (and saved)"}), 400
    added = cal_auto_sync()
    return jsonify({"added": added})


@bp.delete("/api/ics")
def ics_clear():
    with db() as con:
        cur = con.execute("DELETE FROM events WHERE source='ics'")
    return jsonify({"deleted": cur.rowcount})
