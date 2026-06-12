"""
TyloPlanner — background scheduler.

Runs as a daemon thread: daily agenda push, evening habit nudge,
nightly backup, and periodic calendar auto-sync.
"""
import time
from datetime import datetime

from helpers import setting, kv_get, kv_set, ntfy_send, db, do_backup
from blueprints.calendar import cal_auto_sync


def send_agenda(today):
    """Morning push: today's events + upcoming exam alerts."""
    with db() as con:
        evs = [dict(r) for r in con.execute(
            'SELECT * FROM events WHERE "date"=? ORDER BY "start"', (today,))]
        exams = [dict(r) for r in con.execute("SELECT * FROM exams")]
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
    if not lines and not exl:
        return
    msg = ""
    if lines:
        msg += "Today:\n- " + "\n- ".join(lines)
    if exl:
        msg += ("\n\n" if msg else "") + "Exams:\n- " + "\n- ".join(exl)
    ntfy_send("Your day — TyloPlanner", msg, "calendar")


def send_habit_nudge(today):
    """Evening push: habits not yet checked off today."""
    with db() as con:
        habits = [dict(r) for r in con.execute("SELECT * FROM habits")]
        done = {r["habit_id"] for r in con.execute(
            'SELECT habit_id FROM habit_log WHERE "date"=?', (today,))}
    open_ = [h["name"] for h in habits if h["id"] not in done]
    if open_:
        ntfy_send("Habit check-in", "Still open today:\n- " + "\n- ".join(open_), "white_check_mark")


def scheduler_tick():
    now = datetime.now()
    today = now.strftime("%Y-%m-%d")
    hhmm = now.strftime("%H:%M")
    if hhmm >= setting("notify_agenda_time") and kv_get("done_agenda") != today:
        kv_set("done_agenda", today)
        send_agenda(today)
    if hhmm >= setting("notify_habit_time") and kv_get("done_habits") != today:
        kv_set("done_habits", today)
        send_habit_nudge(today)
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
