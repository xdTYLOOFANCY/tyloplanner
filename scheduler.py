"""
TyloPlanner — background scheduler.

Runs as a daemon thread: daily agenda push, evening habit nudge,
nightly backup, and periodic calendar auto-sync.
"""
import time
from datetime import datetime, timedelta

from helpers import setting, kv_get, kv_set, send_notification, db, do_backup, local_now
from blueprints.calendar import cal_auto_sync


def send_agenda(today):
    """Morning push: today's events + upcoming exam alerts + tasks due soon/overdue."""
    now = local_now()
    now_str = now.strftime("%Y-%m-%dT%H:%M")
    plus_24h_str = (now + timedelta(hours=24)).strftime("%Y-%m-%dT%H:%M")

    with db() as con:
        all_events = [dict(r) for r in con.execute('SELECT * FROM events')]
        exams = [dict(r) for r in con.execute("SELECT * FROM exams")]
        all_open_tasks = [dict(r) for r in con.execute("SELECT * FROM tasks WHERE done = 0")]

    evs = []
    for e in all_events:
        if get_instances(e, today):
            evs.append(e)
    evs.sort(key=lambda x: x.get("start") or "")

    overdue_tasks = []
    upcoming_tasks = []

    for t in all_open_tasks:
        if t.get("due_date"):
            if t["due_date"] < now_str:
                overdue_tasks.append(t)
            elif now_str <= t["due_date"] <= plus_24h_str:
                upcoming_tasks.append(t)
        elif t.get("due"):
            if t["due"] < today:
                overdue_tasks.append(t)
            elif t["due"] == today:
                upcoming_tasks.append(t)

    overdue_tasks.sort(key=lambda x: x.get("due_date") or x.get("due") or "")
    upcoming_tasks.sort(key=lambda x: x.get("due_date") or x.get("due") or "")

    try:
        warn_days = {int(x) for x in setting("notify_exam_days").split(",") if x.strip().isdigit()}
    except ValueError:
        warn_days = {7, 3, 1}
    t0 = datetime.strptime(today, "%Y-%m-%d").date()
    lines = [((e["start"] + " ") if e["start"] else "") + (e["title"] or "") for e in evs]
    exl = []
    for x in exams:
        try:
            dd = (datetime.strptime(x["date"], "%Y-%m-%d").date() - t0).days
        except (ValueError, TypeError):
            continue
        if dd == 0:
            exl.append("%s is TODAY" % x["name"])
        elif dd in warn_days:
            exl.append("%s in %d day%s" % (x["name"], dd, "" if dd == 1 else "s"))

    task_lines = []
    if overdue_tasks:
        task_lines.append("Overdue:")
        for t in overdue_tasks:
            dt_display = (t.get("due_date") or t.get("due") or "").replace("T", " ")
            task_lines.append(f"- [OVERDUE] {t['name']} (due {dt_display})")
    if upcoming_tasks:
        if task_lines:
            task_lines.append("")
        task_lines.append("Due soon:")
        for t in upcoming_tasks:
            dt_display = (t.get("due_date") or t.get("due") or "").replace("T", " ")
            task_lines.append(f"- {t['name']} (due {dt_display})")

    if not lines and not exl and not task_lines:
        return False
    msg = ""
    if lines:
        msg += "Today:\n- " + "\n- ".join(lines)
    if exl:
        msg += ("\n\n" if msg else "") + "Exams:\n- " + "\n- ".join(exl)
    if task_lines:
        msg += ("\n\n" if msg else "") + "Tasks:\n" + "\n".join(task_lines)
    send_notification("Your day — TyloPlanner", msg, "calendar")
    return True


def send_habit_nudge(today):
    """Evening push: habits not yet checked off today."""
    with db() as con:
        habits = [dict(r) for r in con.execute("SELECT * FROM habits")]
        done = {r["habit_id"] for r in con.execute(
            'SELECT habit_id FROM habit_log WHERE "date"=?', (today,))}
    open_ = [h["name"] for h in habits if h["id"] not in done]
    if open_:
        send_notification("Habit check-in", "Still open today:\n- " + "\n- ".join(open_), "white_check_mark")
        return True
    return False


def get_instances(e, target_date_str):
    if not e.get("date"):
        return False
    if target_date_str < e["date"]:
        return False
    if e.get("recurrence_until") and target_date_str > e["recurrence_until"]:
        return False
        
    rec = e.get("recurrence", "none")
    if rec == "none":
        return e["date"] == target_date_str
    elif rec == "daily":
        return True
    elif rec == "weekly":
        dt_start = datetime.strptime(e["date"], "%Y-%m-%d")
        dt_target = datetime.strptime(target_date_str, "%Y-%m-%d")
        return dt_start.weekday() == dt_target.weekday()
    elif rec == "monthly":
        dt_start = datetime.strptime(e["date"], "%Y-%m-%d")
        dt_target = datetime.strptime(target_date_str, "%Y-%m-%d")
        return dt_start.day == dt_target.day
    return False


def check_event_reminders(now):
    today_str = now.strftime("%Y-%m-%d")
    tomorrow_str = (now + timedelta(days=1)).strftime("%Y-%m-%d")
    
    with db() as con:
        evs = [dict(r) for r in con.execute("SELECT * FROM events WHERE reminder_offset IS NOT NULL AND reminder_offset != -1 AND reminder_offset != '-1'")]
        
    for e in evs:
        if not e.get("start"):
            continue
            
        raw_offset = e.get("reminder_offset")
        if raw_offset is None:
            continue
            
        offset_str = str(raw_offset).strip()
        if not offset_str or offset_str == "-1":
            continue
            
        offsets = []
        for part in offset_str.split(","):
            try:
                val = int(part.strip())
                if val >= 0:
                    offsets.append(val)
            except ValueError:
                continue
                
        if not offsets:
            continue
            
        for d in (today_str, tomorrow_str):
            if get_instances(e, d):
                try:
                    start_dt = datetime.strptime(f"{d} {e['start']}", "%Y-%m-%d %H:%M")
                except ValueError:
                    continue
                
                for offset in offsets:
                    reminder_time = start_dt - timedelta(minutes=offset)
                    if now.strftime("%Y-%m-%d %H:%M") == reminder_time.strftime("%Y-%m-%d %H:%M"):
                        kv_key = f"reminder_sent:{e['id']}:{offset}:{start_dt.strftime('%Y%m%d%H%M')}"
                        if not kv_get(kv_key):
                            kv_set(kv_key, "1")
                            title = f"Reminder: {e['title']}"
                            loc_str = f" at {e['location']}" if e.get("location") else ""
                            msg = f"Starts at {e['start']}{loc_str}"
                            if offset > 0:
                                if offset % 60 == 0:
                                    hours = offset // 60
                                    msg += f" (in {hours}h)"
                                else:
                                    msg += f" (in {offset}m)"
                            send_notification(title, msg, "alarm_clock")


def scheduler_tick():
    now = local_now()
    today = now.strftime("%Y-%m-%d")
    hhmm = now.strftime("%H:%M")
    
    check_event_reminders(now)
    if hhmm >= setting("notify_agenda_time") and kv_get("done_agenda") != today:
        if send_agenda(today):
            kv_set("done_agenda", today)
    if hhmm >= setting("notify_habit_time") and kv_get("done_habits") != today:
        if send_habit_nudge(today):
            kv_set("done_habits", today)
    if hhmm >= "03:30" and kv_get("done_backup") != today:
        kv_set("done_backup", today)
        do_backup(today)
    try:
        hours = float(setting("cal_sync_hours") or 6)
    except ValueError:
        hours = 6
    last = float(kv_get("cal_sync_ts", "0") or 0)
    if setting("cal_sync_urls").strip() and time.time() - last > hours * 3600:
        kv_set("cal_sync_ts", time.time())
        cal_auto_sync()


def scheduler_loop():
    time.sleep(10)  # let the server come up first
    while True:
        try:
            scheduler_tick()
        except Exception as e:
            print("scheduler error:", e)
        time.sleep(60)
