"""
Calendar blueprint — ICS export, import, sync, and clear.
"""
import re
from datetime import datetime, timezone
import zoneinfo

import requests
from flask import Blueprint, request, jsonify, Response

from helpers import db, uid, setting, kv_set, app_tz, local_now

bp = Blueprint("calendar", __name__)


# ---------------- ICS helpers ----------------
def ics_escape(s):
    return (str(s or "").replace("\\", "\\\\").replace(";", "\\;")
            .replace(",", "\\,").replace("\n", "\\n"))


def parse_ics_datetime(head, val):
    """Parses an ICS date or date-time value.
    Converts aware datetimes (UTC or with TZID) to the local system timezone.
    Returns (date_str, time_str, dt_obj).
    """
    if "T" not in val:
        m = re.match(r"(\d{4})(\d{2})(\d{2})", val)
        if m:
            return "%s-%s-%s" % (m.group(1), m.group(2), m.group(3)), "", None
        return None, None, None

    m = re.match(r"(\d{4})(\d{2})(\d{2})T(\d{2})(\d{2})(\d{2})?(Z)?", val)
    if not m:
        m = re.match(r"(\d{4})(\d{2})(\d{2})T(\d{2})(\d{2})", val)
        if not m:
            return None, None, None
        year, month, day, hour, minute = m.groups()[:5]
        second = "00"
        is_utc = val.endswith("Z")
    else:
        year, month, day, hour, minute, second, is_utc = m.groups()
        if not second:
            second = "00"

    y, mo, d, h, mi, s = map(int, [year, month, day, hour, minute, second])

    tz = None
    if is_utc:
        tz = timezone.utc
    else:
        tzid_match = re.search(r"TZID=([^;:\s]+)", head)
        if tzid_match:
            tzid = tzid_match.group(1).strip('"')
            try:
                tz = zoneinfo.ZoneInfo(tzid)
            except Exception:
                parts = tzid.split('/')
                if len(parts) >= 2:
                    for i in range(len(parts) - 1):
                        sub_tzid = "/".join(parts[i:])
                        try:
                            tz = zoneinfo.ZoneInfo(sub_tzid)
                            break
                        except Exception:
                            pass

    dt = datetime(y, mo, d, h, mi, s)
    if tz:
        dt = dt.replace(tzinfo=tz)
        dt_local = dt.astimezone(app_tz())
    else:
        dt_local = dt

    return dt_local.strftime("%Y-%m-%d"), dt_local.strftime("%H:%M"), dt_local


def parse_ics(text):
    """Minimal tolerant ICS parser: returns list of {date,start,end,title,location,description}.
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
        
        start_head, start_val = props["DTSTART"]
        d, start, _ = parse_ics_datetime(start_head, start_val)
        if not d:
            continue

        end = ""
        if "DTEND" in props:
            end_head, end_val = props["DTEND"]
            d_end, end_time, _ = parse_ics_datetime(end_head, end_val)
            if d_end and end_time and d_end == d:
                end = end_time

        title = props.get("SUMMARY", ("", "(no title)"))[1]
        title = title.replace("\\n", " ").replace("\\,", ",").replace("\\;", ";").replace("\\\\", "\\")

        location = props.get("LOCATION", ("", ""))[1]
        location = location.replace("\\n", " ").replace("\\,", ",").replace("\\;", ";").replace("\\\\", "\\")

        description = props.get("DESCRIPTION", ("", ""))[1]
        description = description.replace("\\n", "\n").replace("\\N", "\n").replace("\\,", ",").replace("\\;", ";").replace("\\\\", "\\")

        events.append({
            "date": d,
            "start": start,
            "end": end,
            "title": title,
            "location": location,
            "description": description
        })
    return events


def import_ics_text(text, source_id="ics"):
    evs = parse_ics(text)
    added = 0
    with db() as con:
        for e in evs:
            dup = con.execute(
                'SELECT id, source FROM events WHERE "date"=? AND title=? AND "start"=?',
                (e["date"], e["title"], e["start"])).fetchone()
            if dup:
                if dup["source"] != source_id:
                    con.execute('UPDATE events SET source=? WHERE id=?', (source_id, dup["id"]))
                continue
            con.execute(
                'INSERT INTO events(id,"date","start","end",title,type,source,location,description) '
                "VALUES(?,?,?,?,?,?,?,?,?)",
                (uid(), e["date"], e["start"], e["end"], e["title"], "other", source_id, e["location"], e["description"]))
            added += 1
    return {"found": len(evs), "added": added}


def cal_auto_sync():
    """Fetch and import all configured calendar URLs."""
    urls = [u.strip() for u in setting("cal_sync_urls").splitlines() if u.strip()]
    total = 0
    for idx, url in enumerate(urls):
        if not url.lower().startswith(("http://", "https://")):
            continue
        try:
            r = requests.get(url, timeout=20)
            r.raise_for_status()
            total += import_ics_text(r.text, source_id=f"ics_{idx}")["added"]
        except Exception as e:
            print("calendar sync error for %s: %s" % (url, e))
    if urls:
        kv_set("cal_last_sync_human", local_now().isoformat(timespec="seconds"))
    return total


# ---------------- routes ----------------
@bp.get("/calendar.ics")
def ics_export():
    now = datetime.now(timezone.utc).strftime("%Y%m%dT%H%M%SZ")
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
            # Skip if this exam is already synced as a calendar event to avoid duplicates
            dup = con.execute("SELECT 1 FROM events WHERE id=?", (x["id"],)).fetchone()
            if dup:
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
    source_id = "ics"
    if "file" in request.files:
        text = request.files["file"].read().decode("utf-8", errors="replace")
    else:
        data = request.get_json(silent=True) or {}
        url = data.get("url")
        if url:
            if not url.lower().startswith(("http://", "https://")):
                return jsonify({"error": "invalid url"}), 400
            try:
                urls = [u.strip() for u in setting("cal_sync_urls").splitlines() if u.strip()]
                if url in urls:
                    source_id = f"ics_{urls.index(url)}"
                r = requests.get(url, timeout=20)
                r.raise_for_status()
                text = r.text
            except Exception as e:
                return jsonify({"error": "fetch failed: %s" % e}), 400
    if not text:
        return jsonify({"error": "provide an .ics file or a url"}), 400
    return jsonify(import_ics_text(text, source_id=source_id))


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
