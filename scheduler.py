"""
TyloPlanner — background scheduler.

Runs as a daemon thread: daily agenda push, evening habit nudge,
nightly backup, and periodic calendar auto-sync.
"""
import time
import json
import traceback
import concurrent.futures
from datetime import datetime, timedelta

from helpers import setting, kv_get, kv_set, send_notification, db, do_backup, local_now, db_retry
from blueprints.calendar import cal_auto_sync

# Global ThreadPoolExecutor for background tasks
task_executor = concurrent.futures.ThreadPoolExecutor(max_workers=2)


@db_retry()
def enqueue_task(task_type, payload=None, delay=0):
    from helpers import db, uid, db_retry
    now_ts = int(time.time())
    scheduled_at = now_ts + delay
    payload_str = json.dumps(payload) if payload else None
    task_id = uid()
    
    with db(write=True) as con:
        con.execute(
            "INSERT INTO queued_tasks(id, task_type, payload, status, attempts, max_attempts, created_at, scheduled_at) "
            "VALUES(?, ?, ?, 'pending', 0, 3, ?, ?)",
            (task_id, task_type, payload_str, now_ts, scheduled_at)
        )
    return task_id


@db_retry()
def execute_queued_task(task_id):
    # Fetch task details
    with db() as con:
        task = con.execute("SELECT * FROM queued_tasks WHERE id=?", (task_id,)).fetchone()
    if not task:
        return
        
    task_type = task["task_type"]
    payload_str = task["payload"]
    payload = {}
    if payload_str:
        try:
            payload = json.loads(payload_str)
        except Exception:
            pass
            
    success = False
    error_msg = None
    res_obj = None
    
    try:
        if task_type == "backup":
            from helpers import do_backup, BACKUP_DIR
            import os
            date_str = payload.get("date") or local_now().strftime("%Y-%m-%d")
            path = do_backup(date_str)
            res_obj = {"file": os.path.basename(path)}
            success = True
        elif task_type == "calendar_sync":
            from blueprints.calendar import cal_auto_sync
            added = cal_auto_sync()
            res_obj = {"added": added}
            success = True
        elif task_type == "strava_sync":
            from blueprints.strava import do_strava_sync
            res_obj = do_strava_sync()
            success = True
        elif task_type == "agenda_push":
            date_str = payload.get("date") or local_now().strftime("%Y-%m-%d")
            sent = send_agenda(date_str)
            res_obj = {"sent": sent}
            success = True
        elif task_type == "habit_nudge":
            date_str = payload.get("date") or local_now().strftime("%Y-%m-%d")
            sent = send_habit_nudge(date_str)
            res_obj = {"sent": sent}
            success = True
        elif task_type == "db_optimize":
            optimize_database()
            res_obj = {"success": True}
            success = True
        elif task_type == "storage_cleanup":
            from blueprints.files import run_storage_cleanup
            res_obj = run_storage_cleanup()
            success = True
        elif task_type == "session_cleanup":
            deleted = purge_expired_sessions()
            res_obj = {"deleted_count": deleted}
            success = True
        else:
            raise ValueError(f"Unknown task type: {task_type}")
    except Exception as e:
        error_msg = traceback.format_exc()
        print(f"Task {task_id} ({task_type}) failed: {error_msg}")
        
    now_ts = int(time.time())
    with db(write=True) as con:
        t_current = con.execute("SELECT attempts, max_attempts FROM queued_tasks WHERE id=?", (task_id,)).fetchone()
        if t_current:
            attempts = t_current["attempts"] + 1
            max_attempts = t_current["max_attempts"]
            
            if success:
                con.execute(
                    "UPDATE queued_tasks SET status='completed', finished_at=?, attempts=?, result=? WHERE id=?",
                    (now_ts, attempts, json.dumps(res_obj), task_id)
                )
            else:
                if attempts < max_attempts:
                    retry_delay = 60 * (2 ** (attempts - 1))
                    next_run = now_ts + retry_delay
                    con.execute(
                        "UPDATE queued_tasks SET status='pending', scheduled_at=?, attempts=?, error_message=? WHERE id=?",
                        (next_run, attempts, error_msg, task_id)
                    )
                else:
                    con.execute(
                        "UPDATE queued_tasks SET status='failed', finished_at=?, attempts=?, error_message=? WHERE id=?",
                        (now_ts, attempts, error_msg, task_id)
                    )


@db_retry()
def recover_interrupted_tasks():
    """
    On application startup, reset any tasks in the running state back to pending
    (or mark them failed if they have exceeded max_attempts) to ensure they get re-executed.
    """
    now_ts = int(time.time())
    with db(write=True) as con:
        try:
            # Check if queued_tasks table exists first
            table_check = con.execute(
                "SELECT name FROM sqlite_master WHERE type='table' AND name='queued_tasks'"
            ).fetchone()
            if not table_check:
                return

            running_tasks = con.execute(
                "SELECT id, task_type, attempts, max_attempts FROM queued_tasks WHERE status='running'"
            ).fetchall()
            
            for t in running_tasks:
                task_id = t["id"]
                task_type = t["task_type"]
                attempts = t["attempts"] + 1
                max_attempts = t["max_attempts"]
                
                if attempts < max_attempts:
                    print(f"Startup: Resetting running task {task_id} ({task_type}) back to pending (attempt {attempts}/{max_attempts}).")
                    con.execute(
                        "UPDATE queued_tasks SET status='pending', attempts=?, started_at=NULL, error_message='Server restarted' WHERE id=?",
                        (attempts, task_id)
                    )
                else:
                    print(f"Startup: Marking running task {task_id} ({task_type}) as failed due to server restart (attempts exhausted).")
                    con.execute(
                        "UPDATE queued_tasks SET status='failed', finished_at=?, attempts=?, error_message='Server restarted' WHERE id=?",
                        (now_ts, attempts, task_id)
                    )
        except Exception as e:
            print("Failed to recover interrupted tasks:", e)


@db_retry()
def check_and_dispatch_tasks():
    now_ts = int(time.time())
    with db(write=True) as con:
        try:
            rows = con.execute(
                "SELECT * FROM queued_tasks WHERE status='pending' AND scheduled_at <= ? ORDER BY scheduled_at ASC",
                (now_ts,)
            ).fetchall()
            
            for r in rows:
                task_id = r["id"]
                con.execute(
                    "UPDATE queued_tasks SET status='running', started_at=? WHERE id=?",
                    (now_ts, task_id)
                )
                task_executor.submit(execute_queued_task, task_id)
        except Exception:
            pass


@db_retry()
def check_running_timeouts():
    now_ts = int(time.time())
    timeout_threshold = 600  # 10 minutes
    cutoff = now_ts - timeout_threshold
    with db(write=True) as con:
        try:
            stuck_tasks = con.execute(
                "SELECT id, task_type FROM queued_tasks WHERE status='running' AND started_at < ?",
                (cutoff,)
            ).fetchall()
            for t in stuck_tasks:
                print(f"Warning: Task {t['id']} ({t['task_type']}) has timed out and is marked failed.")
                con.execute(
                    "UPDATE queued_tasks SET status='failed', finished_at=?, error_message='Task execution timed out.' WHERE id=?",
                    (now_ts, t["id"])
                )
        except Exception:
            pass


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


def optimize_database():
    print("Running database incremental vacuum and optimize...")
    try:
        with db(write=True) as con:
            con.execute("PRAGMA incremental_vacuum;")
            con.execute("PRAGMA optimize;")
        print("Database optimization completed.")
    except Exception as e:
        print("Database optimization failed:", e)


@db_retry()
def purge_expired_sessions():
    """Purge database sessions that have been inactive (active_at) for more than 30 days."""
    cutoff = int(time.time()) - 30 * 86400
    with db(write=True) as con:
        cur = con.execute("DELETE FROM user_sessions WHERE active_at < ?", (cutoff,))
        rowcount = cur.rowcount
    print(f"Session cleanup: Purged {rowcount} expired sessions (older than 30 days).")
    
    # Run explicit checkpoint query to truncate the WAL file
    try:
        with db(write=False) as con:
            con.execute("PRAGMA wal_checkpoint(TRUNCATE);")
        print("SQLite WAL checkpoint (TRUNCATE) completed successfully.")
    except Exception as e:
        print("SQLite WAL checkpoint failed:", e)
        
    return rowcount


def scheduler_tick():
    now = local_now()
    today = now.strftime("%Y-%m-%d")
    hhmm = now.strftime("%H:%M")
    
    check_event_reminders(now)
    if hhmm >= "03:00" and kv_get("done_db_optimize") != today:
        kv_set("done_db_optimize", today)
        enqueue_task("db_optimize")
    if hhmm >= setting("notify_agenda_time") and kv_get("done_agenda") != today:
        kv_set("done_agenda", today)
        enqueue_task("agenda_push", {"date": today})
    if hhmm >= setting("notify_habit_time") and kv_get("done_habits") != today:
        kv_set("done_habits", today)
        enqueue_task("habit_nudge", {"date": today})
    if hhmm >= "03:30" and kv_get("done_backup") != today:
        kv_set("done_backup", today)
        enqueue_task("backup", {"date": today})
    if hhmm >= "04:00" and kv_get("done_cleanup") != today:
        if now.weekday() == 6:  # Sunday
            kv_set("done_cleanup", today)
            enqueue_task("storage_cleanup")
            enqueue_task("session_cleanup")
    try:
        hours = float(setting("cal_sync_hours") or 6)
    except ValueError:
        hours = 6
    last = float(kv_get("cal_sync_ts", "0") or 0)
    if setting("cal_sync_urls").strip() and time.time() - last > hours * 3600:
        kv_set("cal_sync_ts", time.time())
        enqueue_task("calendar_sync")


def scheduler_loop():
    time.sleep(10)  # let the server come up first
    last_tick_minute = -1
    while True:
        try:
            check_and_dispatch_tasks()
            check_running_timeouts()
            
            current_minute = int(time.time()) // 60
            if current_minute != last_tick_minute:
                scheduler_tick()
                last_tick_minute = current_minute
            time.sleep(10)
        except Exception as e:
            print("scheduler loop error:", e)
            traceback.print_exc()
            time.sleep(60)
