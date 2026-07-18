"""
TyloPlanner — background scheduler.

Runs as a daemon thread: daily agenda push, evening habit nudge,
nightly backup, and periodic calendar auto-sync.
"""
import time
import traceback
import concurrent.futures
from datetime import datetime, timedelta

from helpers import setting, kv_get, kv_set, send_notification, db, do_backup, local_now
from blueprints.calendar import cal_auto_sync

# Shared executor so slow jobs (calendar sync, backup) never block the
# per-minute reminder tick.
task_executor = concurrent.futures.ThreadPoolExecutor(max_workers=2)


def submit_job(fn, *args):
    """Run a background job on the executor, logging failures.
    # ponytail: no queue/persistence/retries — the done_<job> kv markers dedupe,
    # and a failed daily job simply runs again the next day."""
    def run():
        try:
            fn(*args)
        except Exception:
            print(f"background job {fn.__name__} failed:")
            traceback.print_exc()
    task_executor.submit(run)


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


def _js_day(d):
    """JS Date.getDay() numbering: 0=Sun … 6=Sat (recurrence_days uses this)."""
    return (d.weekday() + 1) % 7


def get_instances(e, target_date_str):
    """True if the event has an occurrence starting on target_date_str.
    Mirrors the frontend expansion in planner.js getInstances(): honors
    recurrence type (daily/weekly/monthly/yearly), interval, weekly day sets
    (recurrence_days), end-by-date (recurrence_until), end-after-N
    (recurrence_count), and excluded_dates."""
    if not e.get("date"):
        return False
    if target_date_str < e["date"]:
        return False

    rec = e.get("recurrence") or "none"
    if rec == "none":
        return e["date"] == target_date_str

    if e.get("recurrence_until") and target_date_str > e["recurrence_until"]:
        return False
    excluded = {x.strip() for x in str(e.get("excluded_dates") or "").split(",") if x.strip()}
    if target_date_str in excluded:
        return False

    try:
        start = datetime.strptime(e["date"], "%Y-%m-%d").date()
        target = datetime.strptime(target_date_str, "%Y-%m-%d").date()
    except (TypeError, ValueError):
        return False
    try:
        interval = max(1, int(e.get("recurrence_interval") or 1))
    except (TypeError, ValueError):
        interval = 1

    dset = {int(x) for x in str(e.get("recurrence_days") or "").split(",")
            if x.strip().isdigit() and 0 <= int(x) <= 6}
    if rec == "weekly" and not dset:
        dset = {_js_day(start)}

    def matches(cur):
        if cur < start:
            return False
        if rec == "daily":
            return (cur - start).days % interval == 0
        if rec == "weekly":
            if _js_day(cur) not in dset:
                return False
            weeks = ((cur - timedelta(days=_js_day(cur)))
                     - (start - timedelta(days=_js_day(start)))).days // 7
            return weeks >= 0 and weeks % interval == 0
        if rec == "monthly":
            if cur.day != start.day:
                return False
            months = (cur.year - start.year) * 12 + (cur.month - start.month)
            return months >= 0 and months % interval == 0
        if rec == "yearly":
            if cur.day != start.day or cur.month != start.month:
                return False
            return (cur.year - start.year) % interval == 0
        return False

    if not matches(target):
        return False

    # Count-limited series: the target must be within the first N occurrences.
    # Excluded dates still consume a slot (RRULE COUNT semantics, same as the
    # frontend's count walk).
    raw_count = e.get("recurrence_count")
    if raw_count not in (None, ""):
        try:
            count = int(raw_count)
        except (TypeError, ValueError):
            count = None
        if count is not None and count >= 1:
            ordinal = 0
            cur = start
            while cur <= target:
                if matches(cur):
                    ordinal += 1
                    if ordinal > count:
                        return False
                cur += timedelta(days=1)
    return True


def _fmt_offset(offset):
    """Human-readable lead time for a reminder offset in minutes."""
    if offset % 10080 == 0:
        return f"{offset // 10080}w"
    if offset % 1440 == 0:
        return f"{offset // 1440}d"
    if offset % 60 == 0:
        return f"{offset // 60}h"
    return f"{offset}m"


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
                                msg += f" (in {_fmt_offset(offset)})"
                            send_notification(title, msg, "alarm_clock")


def check_task_reminders(now):
    """Per-task reminders. Reuses the events reminder model: reminder_offset is
    minutes before the task's due datetime. Only tasks that are open, carry a
    dated (time-bearing) due_date, and have an offset set are considered."""
    with db() as con:
        tasks = [dict(r) for r in con.execute(
            "SELECT * FROM tasks WHERE done = 0 AND due_date IS NOT NULL AND due_date != '' "
            "AND reminder_offset IS NOT NULL AND reminder_offset != '' AND reminder_offset != '-1'")]

    for t in tasks:
        due_raw = (t.get("due_date") or "").strip()
        if "T" not in due_raw:  # date-only due, no time to anchor a reminder
            continue
        try:
            due_dt = datetime.strptime(due_raw[:16], "%Y-%m-%dT%H:%M")
        except ValueError:
            continue

        offsets = []
        for part in str(t["reminder_offset"]).split(","):
            try:
                val = int(part.strip())
                if val >= 0:
                    offsets.append(val)
            except ValueError:
                continue

        for offset in offsets:
            reminder_time = due_dt - timedelta(minutes=offset)
            if now.strftime("%Y-%m-%d %H:%M") == reminder_time.strftime("%Y-%m-%d %H:%M"):
                # Same key shape as event reminders so purge_expired_sessions'
                # "reminder_sent:%" cleanup catches these too.
                kv_key = f"reminder_sent:{t['id']}:{offset}:{due_dt.strftime('%Y%m%d%H%M')}"
                if not kv_get(kv_key):
                    kv_set(kv_key, "1")
                    msg = f"Due at {due_dt.strftime('%H:%M')}"
                    if offset > 0:
                        msg += f" (in {_fmt_offset(offset)})"
                    send_notification(f"Task due: {t['name']}", msg, "alarm_clock")


def optimize_database():
    print("Running database incremental vacuum and optimize...")
    try:
        with db(write=True) as con:
            con.execute("PRAGMA incremental_vacuum;")
            con.execute("PRAGMA optimize;")
        print("Database optimization completed.")
    except Exception as e:
        print("Database optimization failed:", e)


def purge_expired_sessions():
    """Purge database sessions that have been inactive (active_at) for more than 30 days."""
    cutoff = int(time.time()) - 30 * 86400
    with db(write=True) as con:
        cur = con.execute("DELETE FROM user_sessions WHERE active_at < ?", (cutoff,))
        rowcount = cur.rowcount
        # reminder_sent:<event>:<offset>:<YYYYMMDDHHMM> markers accumulate one
        # per fired reminder — drop those older than 7 days (the key's last 12
        # chars are its timestamp).
        stamp_cutoff = (local_now() - timedelta(days=7)).strftime("%Y%m%d%H%M")
        con.execute(
            "DELETE FROM kv WHERE key LIKE 'reminder_sent:%' AND substr(key, -12) < ?",
            (stamp_cutoff,),
        )
    print(f"Session cleanup: Purged {rowcount} expired sessions (older than 30 days).")
    
    # Run explicit checkpoint query to truncate the WAL file
    try:
        with db(write=False) as con:
            con.execute("PRAGMA wal_checkpoint(TRUNCATE);")
        print("SQLite WAL checkpoint (TRUNCATE) completed successfully.")
    except Exception as e:
        print("SQLite WAL checkpoint failed:", e)
        
    return rowcount


def check_timers():
    """Fire phone push for any timer whose fire_at has passed, then delete it.
    ponytail: per-minute tick, so the phone push can land up to ~59s late — the
    exact-second alert is the browser's sound/notification when the tab is open;
    the push is the away-from-desk backup. Add a sub-minute loop if that slips."""
    nowts = int(time.time())
    with db(write=True) as con:
        due = [dict(r) for r in con.execute(
            "SELECT id, label, push FROM timers WHERE fire_at <= ?", (nowts,)).fetchall()]
        if due:
            con.execute("DELETE FROM timers WHERE fire_at <= ?", (nowts,))
    for t in due:
        if t.get("push"):
            submit_job(send_notification, "⏰ " + (t["label"] or "Timer"), "Timer done!", "alarm_clock")


def scheduler_tick():
    now = local_now()
    today = now.strftime("%Y-%m-%d")
    hhmm = now.strftime("%H:%M")

    check_event_reminders(now)
    check_task_reminders(now)
    check_timers()
    if hhmm >= "03:00" and kv_get("done_db_optimize") != today:
        kv_set("done_db_optimize", today)
        submit_job(optimize_database)
    if hhmm >= setting("notify_agenda_time") and kv_get("done_agenda") != today:
        kv_set("done_agenda", today)
        submit_job(send_agenda, today)
    if hhmm >= setting("notify_habit_time") and kv_get("done_habits") != today:
        kv_set("done_habits", today)
        submit_job(send_habit_nudge, today)
    if hhmm >= "03:30" and kv_get("done_backup") != today:
        kv_set("done_backup", today)
        submit_job(do_backup, today)
    if hhmm >= "04:00" and kv_get("done_cleanup") != today:
        if now.weekday() == 6:  # Sunday
            kv_set("done_cleanup", today)
            from blueprints.files import run_storage_cleanup
            submit_job(run_storage_cleanup)
            submit_job(purge_expired_sessions)
    try:
        hours = float(setting("cal_sync_hours") or 6)
    except ValueError:
        hours = 6
    last = float(kv_get("cal_sync_ts", "0") or 0)
    if setting("cal_sync_urls").strip() and time.time() - last > hours * 3600:
        kv_set("cal_sync_ts", time.time())
        submit_job(cal_auto_sync)


def scheduler_loop():
    time.sleep(10)  # let the server come up first
    last_tick_minute = -1
    while True:
        try:
            current_minute = int(time.time()) // 60
            if current_minute != last_tick_minute:
                scheduler_tick()
                last_tick_minute = current_minute
            time.sleep(10)
        except Exception as e:
            print("scheduler loop error:", e)
            traceback.print_exc()
            time.sleep(60)
