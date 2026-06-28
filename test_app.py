"""
Test suite for TyloPlanner.

Uses Flask's built-in test client and the stdlib ``unittest`` runner only —
no new dependencies (see CLAUDE.md). Covers the generic CRUD API
(create / update / delete + the table whitelist) and the ``before_request``
routing guard in both auth-disabled and auth-enabled modes.

A throwaway SQLite database in a temp directory is used, so running the tests
never touches your real ``data/tyloplanner.db``. The env vars below are set
*before* importing ``app`` because the module reads its config and creates the
schema at import time.

Run with:   python -m unittest test_app -v
"""
import io
import os
import tempfile
import unittest
import unittest.mock
import time
import warnings
from datetime import datetime, timezone

# app.py opens SQLite connections via "with db() as con:", which commits but
# does not close the connection — harmless here, but it spams ResourceWarning
# across the test output. Silence it so failures stay readable.
warnings.filterwarnings("ignore", category=ResourceWarning)

# --- isolate config BEFORE importing the app (it reads env at import time) ---
_TMP = tempfile.mkdtemp(prefix="tyloplanner-test-")
os.environ["DB_PATH"] = os.path.join(_TMP, "test.db")
os.environ["BACKUP_DIR"] = os.path.join(_TMP, "backups")
os.environ["UPLOAD_DIR"] = os.path.join(_TMP, "uploads")
os.environ["SECRET_KEY"] = "test-secret-key"
os.environ["TESTING"] = "True"
# Import with auth OFF so the module-level AUTH_ENABLED starts False; individual
# test cases flip the module globals to exercise the guard in both modes.
os.environ.pop("AUTH_PASSWORD", None)

import app as appmod  # noqa: E402
import helpers  # noqa: E402

appmod.app.testing = True


def reset_db():
    """Empty every data table so each test starts from a clean slate."""
    with helpers.db() as con:
        for t in list(helpers.TABLES) + ["habit_log", "push_subscriptions"]:
            con.execute("DELETE FROM %s" % t)


class CrudTests(unittest.TestCase):
    """Generic CRUD endpoints: POST/PUT/DELETE /api/<table> and friends."""

    def setUp(self):
        reset_db()
        # CRUD tests run with auth disabled so requests need no session.
        helpers.AUTH_ENABLED = False
        self.c = appmod.app.test_client()

    def _rows(self, table):
        """Fetch a table's rows out of the /api/state snapshot."""
        return self.c.get("/api/state").get_json()[table]

    # ---- create ----
    def test_create_returns_id_and_persists(self):
        r = self.c.post("/api/tasks", json={"name": "buy milk", "done": 0})
        self.assertEqual(r.status_code, 200)
        rid = r.get_json()["id"]
        self.assertTrue(rid)
        rows = self._rows("tasks")
        self.assertEqual(len(rows), 1)
        self.assertEqual(rows[0]["id"], rid)
        self.assertEqual(rows[0]["name"], "buy milk")

    def test_create_ignores_non_whitelisted_columns(self):
        # "id" and arbitrary fields must be dropped, not written or injected.
        r = self.c.post("/api/tasks", json={
            "name": "task", "id": "ATTACKER", "evil": "x", "done": 1,
        })
        self.assertEqual(r.status_code, 200)
        rid = r.get_json()["id"]
        self.assertNotEqual(rid, "ATTACKER")  # server-generated id wins
        row = self._rows("tasks")[0]
        self.assertEqual(row["id"], rid)
        self.assertNotIn("evil", row)
        self.assertEqual(row["name"], "task")

    def test_create_unknown_table_404(self):
        r = self.c.post("/api/not_a_table", json={"x": 1})
        self.assertEqual(r.status_code, 404)
        self.assertEqual(r.get_json()["error"], "unknown table")

    def test_create_empty_body_ok(self):
        # force=True + "or {}" must tolerate an empty payload.
        r = self.c.post("/api/notes", json={})
        self.assertEqual(r.status_code, 200)
        self.assertEqual(len(self._rows("notes")), 1)

    # ---- update ----
    def test_update_changes_fields(self):
        rid = self.c.post("/api/tasks", json={"name": "old"}).get_json()["id"]
        r = self.c.put("/api/tasks/%s" % rid, json={"name": "new", "done": 1})
        self.assertEqual(r.status_code, 200)
        self.assertTrue(r.get_json()["ok"])
        row = self._rows("tasks")[0]
        self.assertEqual(row["name"], "new")
        self.assertEqual(row["done"], 1)

    def test_update_unknown_table_404(self):
        r = self.c.put("/api/not_a_table/abc", json={"name": "x"})
        self.assertEqual(r.status_code, 404)

    def test_update_no_valid_fields_400(self):
        rid = self.c.post("/api/tasks", json={"name": "x"}).get_json()["id"]
        r = self.c.put("/api/tasks/%s" % rid, json={"bogus": 1})
        self.assertEqual(r.status_code, 400)
        self.assertEqual(r.get_json()["error"], "no valid fields")

    # ---- delete ----
    def test_delete_removes_row(self):
        rid = self.c.post("/api/tasks", json={"name": "x"}).get_json()["id"]
        r = self.c.delete("/api/tasks/%s" % rid)
        self.assertEqual(r.status_code, 200)
        self.assertEqual(self._rows("tasks"), [])

    def test_delete_unknown_table_404(self):
        r = self.c.delete("/api/not_a_table/abc")
        self.assertEqual(r.status_code, 404)

    # ---- habits: toggle + cascade delete ----
    def test_habit_toggle_on_then_off(self):
        hid = self.c.post("/api/habits", json={"name": "run"}).get_json()["id"]
        on = self.c.post("/api/habits/%s/toggle" % hid, json={"date": "2026-06-10"})
        self.assertTrue(on.get_json()["on"])
        off = self.c.post("/api/habits/%s/toggle" % hid, json={"date": "2026-06-10"})
        self.assertFalse(off.get_json()["on"])

    def test_habit_toggle_requires_date(self):
        hid = self.c.post("/api/habits", json={"name": "run"}).get_json()["id"]
        r = self.c.post("/api/habits/%s/toggle" % hid, json={})
        self.assertEqual(r.status_code, 400)

    def test_delete_habit_cascades_log(self):
        hid = self.c.post("/api/habits", json={"name": "run"}).get_json()["id"]
        self.c.post("/api/habits/%s/toggle" % hid, json={"date": "2026-06-10"})
        self.c.delete("/api/habits/%s" % hid)
        state = self.c.get("/api/state").get_json()
        self.assertEqual(state["habits"], [])
        self.assertEqual(state["habit_log"], [])  # log entry removed too

    # ---- notes: is_pinned ----
    def test_note_pin_field(self):
        r = self.c.post("/api/notes", json={"title": "test", "is_pinned": 1})
        self.assertEqual(r.status_code, 200)
        nid = r.get_json()["id"]
        row = self._rows("notes")[0]
        self.assertEqual(row["is_pinned"], 1)
        # Update to unpin
        self.c.put("/api/notes/%s" % nid, json={"is_pinned": 0})
        row = self._rows("notes")[0]
        self.assertEqual(row["is_pinned"], 0)

    def test_delete_note_folder_relocates_contents(self):
        # Create parent note folder A, child note folder B, and grandchild note folder C
        fid_a = self.c.post("/api/note_folders", json={"name": "A", "parent_id": None}).get_json()["id"]
        fid_b = self.c.post("/api/note_folders", json={"name": "B", "parent_id": fid_a}).get_json()["id"]
        fid_c = self.c.post("/api/note_folders", json={"name": "C", "parent_id": fid_b}).get_json()["id"]

        # Create note in B
        nid = self.c.post("/api/notes", json={"title": "Note in B", "body": "content", "folder_id": fid_b}).get_json()["id"]

        # Delete note folder B
        r = self.c.delete("/api/note_folders/%s" % fid_b)
        self.assertEqual(r.status_code, 200)

        # Check state: note folder B should be deleted, and C's parent should now be A
        state = self.c.get("/api/state").get_json()
        note_folders = state["note_folders"]
        self.assertEqual(len(note_folders), 2)
        
        folder_a = next(f for f in note_folders if f["id"] == fid_a)
        folder_c = next(f for f in note_folders if f["id"] == fid_c)
        self.assertEqual(folder_c["parent_id"], fid_a)

        # Note should now be in note folder A (relocated to B's parent)
        notes = state["notes"]
        note = next(n for n in notes if n["id"] == nid)
        self.assertEqual(note["folder_id"], fid_a)

    # ---- deadlines & events sync ----
    def test_sync_exam_to_event(self):
        # 1. Create an exam
        r = self.c.post("/api/exams", json={"name": "Math Exam", "date": "2026-06-20", "ects": 5.0})
        self.assertEqual(r.status_code, 200)
        exam_id = r.get_json()["id"]

        # Check corresponding event exists
        events = self._rows("events")
        self.assertEqual(len(events), 1)
        self.assertEqual(events[0]["id"], exam_id)
        self.assertEqual(events[0]["title"], "Math Exam")
        self.assertEqual(events[0]["date"], "2026-06-20")
        self.assertEqual(events[0]["start"], "")
        self.assertEqual(events[0]["end"], "")
        self.assertEqual(events[0]["type"], "deadline")

        # 2. Update the exam
        self.c.put("/api/exams/%s" % exam_id, json={"name": "Advanced Math Exam", "date": "2026-06-22"})
        events = self._rows("events")
        self.assertEqual(len(events), 1)
        self.assertEqual(events[0]["title"], "Advanced Math Exam")
        self.assertEqual(events[0]["date"], "2026-06-22")

        # 3. Delete the exam
        self.c.delete("/api/exams/%s" % exam_id)
        events = self._rows("events")
        self.assertEqual(len(events), 0)

    def test_sync_event_to_exam(self):
        # 1. Create an event of type 'deadline'
        r = self.c.post("/api/events", json={"title": "Chemistry Project", "date": "2026-06-25", "type": "deadline"})
        self.assertEqual(r.status_code, 200)
        event_id = r.get_json()["id"]

        # Check corresponding exam exists
        exams = self._rows("exams")
        self.assertEqual(len(exams), 1)
        self.assertEqual(exams[0]["id"], event_id)
        self.assertEqual(exams[0]["name"], "Chemistry Project")
        self.assertEqual(exams[0]["date"], "2026-06-25")

        # 2. Update the event
        self.c.put("/api/events/%s" % event_id, json={"title": "Advanced Chemistry Project", "date": "2026-06-26"})
        exams = self._rows("exams")
        self.assertEqual(len(exams), 1)
        self.assertEqual(exams[0]["name"], "Advanced Chemistry Project")
        self.assertEqual(exams[0]["date"], "2026-06-26")

        # 3. Update event type to something else (e.g. 'study') -> exam should be deleted
        self.c.put("/api/events/%s" % event_id, json={"type": "study"})
        exams = self._rows("exams")
        self.assertEqual(len(exams), 0)

        # Re-create a deadline event
        r = self.c.post("/api/events", json={"title": "Physics Lab", "date": "2026-06-28", "type": "deadline"})
        self.assertEqual(r.status_code, 200)
        event_id = r.get_json()["id"]
        exams = self._rows("exams")
        self.assertEqual(len(exams), 1)

        # 4. Delete the event -> exam should be deleted
        self.c.delete("/api/events/%s" % event_id)
        exams = self._rows("exams")
        self.assertEqual(len(exams), 0)

    def test_study_sessions_crud(self):
        # 1. Create a study session
        r = self.c.post("/api/study_sessions", json={
            "subject": "Chemistry",
            "date": "2026-06-17",
            "duration": 50.0,
            "completed": 1
        })
        self.assertEqual(r.status_code, 200)
        session_id = r.get_json()["id"]
        self.assertTrue(session_id)

        # Verify it exists in state
        sessions = self._rows("study_sessions")
        self.assertEqual(len(sessions), 1)
        self.assertEqual(sessions[0]["id"], session_id)
        self.assertEqual(sessions[0]["subject"], "Chemistry")
        self.assertEqual(sessions[0]["duration"], 50.0)
        self.assertEqual(sessions[0]["completed"], 1)

        # 2. Update study session subject and duration
        r = self.c.put("/api/study_sessions/%s" % session_id, json={
            "subject": "Advanced Chemistry",
            "duration": 60.0
        })
        self.assertEqual(r.status_code, 200)

        # Verify update
        sessions = self._rows("study_sessions")
        self.assertEqual(sessions[0]["subject"], "Advanced Chemistry")
        self.assertEqual(sessions[0]["duration"], 60.0)

        # 3. Delete study session
        r = self.c.delete("/api/study_sessions/%s" % session_id)
        self.assertEqual(r.status_code, 200)

        # Verify it was deleted
        sessions = self._rows("study_sessions")
        self.assertEqual(len(sessions), 0)


class GuardAuthDisabledTests(unittest.TestCase):
    """With AUTH_PASSWORD unset, everything is reachable without a session."""

    def setUp(self):
        reset_db()
        helpers.AUTH_ENABLED = False
        self.c = appmod.app.test_client()

    def test_index_ok(self):
        self.assertEqual(self.c.get("/").status_code, 200)

    def test_api_open(self):
        self.assertEqual(self.c.get("/api/state").status_code, 200)


class GuardAuthEnabledTests(unittest.TestCase):
    """With auth enabled, the before_request guard gates protected routes."""

    def setUp(self):
        reset_db()
        helpers.kv_del("password_hash")
        helpers.kv_del("totp_secret")
        helpers.kv_del("totp_pending")
        self._orig_enabled = helpers.AUTH_ENABLED
        self._orig_pw = helpers.AUTH_PASSWORD
        self._orig_user = helpers.AUTH_USERNAME
        helpers.AUTH_ENABLED = True
        helpers.AUTH_PASSWORD = "testpw"
        helpers.AUTH_USERNAME = "admin"
        # Don't waste real seconds on the brute-force delay during tests.
        import time as _time
        self._orig_sleep = _time.sleep
        _time.sleep = lambda *a, **k: None
        self.c = appmod.app.test_client()

    def tearDown(self):
        helpers.AUTH_ENABLED = self._orig_enabled
        helpers.AUTH_PASSWORD = self._orig_pw
        helpers.AUTH_USERNAME = self._orig_user
        import time as _time
        _time.sleep = self._orig_sleep

    # ---- unauthenticated ----
    def test_api_unauthorized_401(self):
        r = self.c.get("/api/state")
        self.assertEqual(r.status_code, 401)
        self.assertEqual(r.get_json()["error"], "unauthorized")

    def test_page_redirects_to_login(self):
        r = self.c.get("/")
        self.assertEqual(r.status_code, 302)
        self.assertIn("/login", r.headers["Location"])

    def test_login_asset_reachable_before_login(self):
        # style.css is in LOGIN_ASSETS, so it must NOT redirect to login.
        r = self.c.get("/style.css")
        self.assertEqual(r.status_code, 200)

    def test_login_page_reachable(self):
        self.assertEqual(self.c.get("/login").status_code, 200)

    # ---- calendar feed (key-protected, no cookies) ----
    def test_calendar_feed_requires_key(self):
        self.assertEqual(self.c.get("/calendar.ics").status_code, 403)

    def test_calendar_feed_with_key_ok(self):
        r = self.c.get("/calendar.ics?key=%s" % helpers.feed_key())
        self.assertEqual(r.status_code, 200)
        self.assertIn("BEGIN:VCALENDAR", r.get_data(as_text=True))

    def test_calendar_feed_rich_export(self):
        import re
        from helpers import db, uid, kv_set
        # 1. Insert mock events and exam
        with db(write=True) as con:
            con.execute(
                'INSERT INTO events (id, title, date, start, "end", type, source, location, description, recurrence, recurrence_until) '
                'VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
                (uid(), "Weekly Meeting", "2026-06-24", "10:00", "11:30", "other", "local", "Meeting Room 1", "Weekly sync on project.", "weekly", "2026-07-24")
            )
            con.execute(
                'INSERT INTO events (id, title, date, start, "end", type, source, location, description, recurrence, recurrence_until) '
                'VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
                (uid(), "All Day Holiday", "2026-06-25", "", "", "other", "local", "Home", "Relaxing day.", "daily", "2026-06-30")
            )
            con.execute(
                'INSERT INTO exams (id, name, date) VALUES (?, ?, ?)',
                (uid(), "Math Exam", "2026-06-26")
            )

        # 2. Test with Europe/Amsterdam timezone (UTC+2 in June)
        kv_set("set_app_timezone", "Europe/Amsterdam")
        r = self.c.get("/calendar.ics?key=%s" % helpers.feed_key())
        self.assertEqual(r.status_code, 200)
        data = r.get_data(as_text=True)

        vevents = re.findall(r"BEGIN:VEVENT(.*?)END:VEVENT", data, re.S)
        self.assertEqual(len(vevents), 3)

        # Check Weekly Meeting
        self.assertIn("SUMMARY:Weekly Meeting", vevents[0])
        self.assertIn("DTSTART:20260624T080000Z", vevents[0])
        self.assertIn("DTEND:20260624T093000Z", vevents[0])
        self.assertIn("LOCATION:Meeting Room 1", vevents[0])
        self.assertIn("DESCRIPTION:Weekly sync on project.", vevents[0])
        self.assertIn("RRULE:FREQ=WEEKLY;UNTIL=20260724T235959Z", vevents[0])

        # Check All Day Holiday
        self.assertIn("SUMMARY:All Day Holiday", vevents[1])
        self.assertIn("DTSTART;VALUE=DATE:20260625", vevents[1])
        self.assertNotIn("DTEND", vevents[1])
        self.assertIn("LOCATION:Home", vevents[1])
        self.assertIn("DESCRIPTION:Relaxing day.", vevents[1])
        self.assertIn("RRULE:FREQ=DAILY;UNTIL=20260630", vevents[1])

        # Check Math Exam
        self.assertIn("SUMMARY:EXAM: Math Exam", vevents[2])
        self.assertIn("DTSTART;VALUE=DATE:20260626", vevents[2])

        # 3. Test with America/New_York timezone (UTC-4 in June)
        kv_set("set_app_timezone", "America/New_York")
        r = self.c.get("/calendar.ics?key=%s" % helpers.feed_key())
        self.assertEqual(r.status_code, 200)
        data_ny = r.get_data(as_text=True)
        vevents_ny = re.findall(r"BEGIN:VEVENT(.*?)END:VEVENT", data_ny, re.S)

        self.assertIn("SUMMARY:Weekly Meeting", vevents_ny[0])
        self.assertIn("DTSTART:20260624T140000Z", vevents_ny[0])
        self.assertIn("DTEND:20260624T153000Z", vevents_ny[0])

    # ---- login flow ----
    def test_wrong_password_redirects_with_error(self):
        r = self.c.post("/login", data={"username": "admin", "password": "nope"})
        self.assertEqual(r.status_code, 302)
        self.assertIn("error=1", r.headers["Location"])
        # Still locked out of the API.
        self.assertEqual(self.c.get("/api/state").status_code, 401)

    def test_correct_login_grants_api_access(self):
        r = self.c.post("/login", data={"username": "admin", "password": "testpw"})
        self.assertEqual(r.status_code, 302)
        self.assertTrue(r.headers["Location"].endswith("/"))
        # Same client keeps the session cookie -> API now reachable.
        self.assertEqual(self.c.get("/api/state").status_code, 200)

    def test_logout_clears_session(self):
        self.c.post("/login", data={"username": "admin", "password": "testpw"})
        self.assertEqual(self.c.get("/api/state").status_code, 200)
        self.c.get("/logout")
        self.assertEqual(self.c.get("/api/state").status_code, 401)

    def test_verify_password_fallback(self):
        helpers.kv_del("password_hash")
        helpers.AUTH_PASSWORD = "fallbackpw"
        self.assertTrue(helpers.verify_password("fallbackpw"))
        self.assertFalse(helpers.verify_password("wrong"))

    def test_set_password_and_verify(self):
        helpers.set_password("newsecurepw")
        self.assertTrue(helpers.verify_password("newsecurepw"))
        self.assertFalse(helpers.verify_password("oldpw"))

    def test_change_password_api_endpoint(self):
        self.c.post("/login", data={"username": "admin", "password": "testpw"})
        
        headers = {"X-Requested-With": "XMLHttpRequest"}
        r = self.c.post("/api/settings/password", headers=headers, json={
            "current_password": "wrongcurrent",
            "new_password": "newpassword123"
        })
        self.assertEqual(r.status_code, 400)
        self.assertEqual(r.get_json()["error"], "Incorrect current password")
        
        r2 = self.c.post("/api/settings/password", headers=headers, json={
            "current_password": "testpw",
            "new_password": "newpassword123"
        })
        self.assertEqual(r2.status_code, 200)
        self.assertTrue(r2.get_json()["ok"])
        
        self.c.get("/logout")
        r3 = self.c.post("/login", data={"username": "admin", "password": "newpassword123"})
        self.assertEqual(r3.status_code, 302)
        
        self.c.get("/logout")
        r4 = self.c.post("/login", data={"username": "admin", "password": "testpw"})
        self.assertEqual(r4.status_code, 302)
        self.assertIn("error=1", r4.headers["Location"])

    def test_change_password_requires_2fa_if_enabled(self):
        import pyotp
        secret = pyotp.random_base32()
        helpers.kv_set("totp_secret", secret)
        
        # Directly authenticate session to bypass 2FA login redirection
        with self.c.session_transaction() as sess:
            sess["auth"] = True
            sess["session_id"] = "test_sess_id"
        with helpers.db(write=True) as con:
            con.execute("INSERT INTO user_sessions (id, user_agent, ip_address, active_at) VALUES ('test_sess_id', 'test', '127.0.0.1', ?)", (int(time.time()),))
            
        headers = {"X-Requested-With": "XMLHttpRequest"}
        
        r = self.c.post("/api/settings/password", headers=headers, json={
            "current_password": "testpw",
            "new_password": "newpassword123"
        })
        self.assertEqual(r.status_code, 400)
        self.assertEqual(r.get_json()["error"], "2FA verification code required")
        
        r2 = self.c.post("/api/settings/password", headers=headers, json={
            "current_password": "testpw",
            "new_password": "newpassword123",
            "tfa_code": "000000"
        })
        self.assertEqual(r2.status_code, 400)
        self.assertEqual(r2.get_json()["error"], "Wrong 2FA code")
        
        totp = pyotp.TOTP(secret)
        code = totp.now()
        r3 = self.c.post("/api/settings/password", headers=headers, json={
            "current_password": "testpw",
            "new_password": "newpassword123",
            "tfa_code": code
        })
        self.assertEqual(r3.status_code, 200)
        self.assertTrue(r3.get_json()["ok"])

    def test_active_sessions_flow(self):
        # 1. Login should create a session record
        r = self.c.post("/login", data={"username": "admin", "password": "testpw"})
        self.assertEqual(r.status_code, 302)
        
        # Check that there is 1 active session in the database
        with helpers.db() as con:
            rows = con.execute("SELECT * FROM user_sessions").fetchall()
        self.assertEqual(len(rows), 1)
        self.assertEqual(rows[0]["ip_address"], "127.0.0.1")
        
        # 2. GET /api/auth/sessions should return the list of active sessions
        headers = {"X-Requested-With": "XMLHttpRequest"}
        r_sessions = self.c.get("/api/auth/sessions", headers=headers)
        self.assertEqual(r_sessions.status_code, 200)
        data = r_sessions.get_json()
        self.assertEqual(len(data), 1)
        self.assertTrue(data[0]["is_current"])
        self.assertEqual(data[0]["ip_address"], "127.0.0.1")
        
        # 3. Revoking another session should delete it
        # Let's insert a second session
        with helpers.db(write=True) as con:
            con.execute("INSERT INTO user_sessions (id, user_agent, ip_address, active_at) VALUES ('other_id', 'other_ua', '192.168.1.1', ?)", (int(time.time()),))
            
        r_sessions = self.c.get("/api/auth/sessions", headers=headers)
        self.assertEqual(len(r_sessions.get_json()), 2)
        
        # Revoke the other session
        r_revoke = self.c.post("/api/auth/sessions/revoke", headers=headers, json={"session_id": "other_id"})
        self.assertEqual(r_revoke.status_code, 200)
        self.assertFalse(r_revoke.get_json()["logged_out"])
        
        # Verify it was deleted
        with helpers.db() as con:
            rows = con.execute("SELECT * FROM user_sessions WHERE id = 'other_id'").fetchall()
        self.assertEqual(len(rows), 0)
        
        # 4. Revoking the current session should clear the session cookie and log us out
        current_id = data[0]["id"]
        r_revoke_curr = self.c.post("/api/auth/sessions/revoke", headers=headers, json={"session_id": current_id})
        self.assertEqual(r_revoke_curr.status_code, 200)
        self.assertTrue(r_revoke_curr.get_json()["logged_out"])
        
        # Verify we are now logged out and cannot access endpoints
        self.assertEqual(self.c.get("/api/state").status_code, 401)

    def test_logout_deletes_session_record(self):
        self.c.post("/login", data={"username": "admin", "password": "testpw"})
        with helpers.db() as con:
            rows = con.execute("SELECT * FROM user_sessions").fetchall()
        self.assertEqual(len(rows), 1)
        
        # Logout
        self.c.get("/logout")
        with helpers.db() as con:
            rows = con.execute("SELECT * FROM user_sessions").fetchall()
        self.assertEqual(len(rows), 0)

    def test_guard_rejects_revoked_session_id(self):
        # Setup login
        self.c.post("/login", data={"username": "admin", "password": "testpw"})
        self.assertEqual(self.c.get("/api/state").status_code, 200)
        
        # Delete session record from DB manually (simulating revocation by another device)
        with helpers.db(write=True) as con:
            con.execute("DELETE FROM user_sessions")
            
        # Try to access endpoint
        r = self.c.get("/api/state")
        self.assertEqual(r.status_code, 401)



class FilesTests(unittest.TestCase):
    """File upload / download / delete endpoints."""

    def setUp(self):
        reset_db()
        with helpers.db() as con:
            con.execute("DELETE FROM files")
        helpers.AUTH_ENABLED = False
        self.c = appmod.app.test_client()

    def test_upload_appears_in_state(self):
        data = {"file": (io.BytesIO(b"hello world"), "test.txt")}
        r = self.c.post("/api/files/upload", content_type="multipart/form-data", data=data)
        self.assertEqual(r.status_code, 200)
        j = r.get_json()
        self.assertIn("id", j)
        self.assertEqual(j["filename"], "test.txt")
        files = self.c.get("/api/state").get_json()["files"]
        self.assertEqual(len(files), 1)
        self.assertEqual(files[0]["filename"], "test.txt")
        self.assertEqual(files[0]["size"], 11)

    def test_download_returns_bytes_as_attachment(self):
        data = {"file": (io.BytesIO(b"file content"), "myfile.txt")}
        fid = self.c.post("/api/files/upload", content_type="multipart/form-data", data=data).get_json()["id"]
        r = self.c.get("/api/files/%s/download" % fid)
        self.assertEqual(r.status_code, 200)
        self.assertIn("attachment", r.headers.get("Content-Disposition", ""))
        self.assertEqual(r.data, b"file content")

    def test_delete_removes_row_and_disk_file(self):
        data = {"file": (io.BytesIO(b"data"), "todel.txt")}
        fid = self.c.post("/api/files/upload", content_type="multipart/form-data", data=data).get_json()["id"]
        disk_path = os.path.join(helpers.UPLOAD_DIR, fid)
        self.assertTrue(os.path.exists(disk_path))
        r = self.c.delete("/api/files/%s" % fid)
        self.assertEqual(r.status_code, 200)
        self.assertFalse(os.path.exists(disk_path))
        self.assertEqual(self.c.get("/api/state").get_json()["files"], [])

    def test_upload_no_file_400(self):
        r = self.c.post("/api/files/upload", content_type="multipart/form-data", data={})
        self.assertEqual(r.status_code, 400)

    def test_download_unknown_id_404(self):
        r = self.c.get("/api/files/doesnotexist/download")
        self.assertEqual(r.status_code, 404)

    def test_file_pin_field(self):
        data = {"file": (io.BytesIO(b"test content"), "test.txt")}
        fid = self.c.post("/api/files/upload", content_type="multipart/form-data", data=data).get_json()["id"]
        # Pin the file
        r = self.c.put("/api/files/%s" % fid, json={"is_pinned": 1})
        self.assertEqual(r.status_code, 200)
        files = self.c.get("/api/state").get_json()["files"]
        pinned = [f for f in files if f["id"] == fid][0]
        self.assertEqual(pinned["is_pinned"], 1)
        # Unpin the file
        self.c.put("/api/files/%s" % fid, json={"is_pinned": 0})
        files = self.c.get("/api/state").get_json()["files"]
        unpinned = [f for f in files if f["id"] == fid][0]
        self.assertEqual(unpinned["is_pinned"], 0)


class SettingsTests(unittest.TestCase):
    """User settings endpoints: GET/POST /api/settings."""

    def setUp(self):
        reset_db()
        helpers.AUTH_ENABLED = False
        self.c = appmod.app.test_client()

    def test_settings_defaults(self):
        r = self.c.get("/api/settings")
        self.assertEqual(r.status_code, 200)
        j = r.get_json()
        self.assertEqual(j["accent_color"], "#4f8cff")
        self.assertEqual(j["persist_active_tab"], "1")

    def test_settings_update(self):
        r = self.c.post("/api/settings", json={"accent_color": "#ff0000", "persist_active_tab": "0"})
        self.assertEqual(r.status_code, 200)
        j = self.c.get("/api/settings").get_json()
        self.assertEqual(j["accent_color"], "#ff0000")
        self.assertEqual(j["persist_active_tab"], "0")


class BackupTests(unittest.TestCase):
    """Automatic backups list and restore endpoints."""

    def setUp(self):
        reset_db()
        helpers.AUTH_ENABLED = False
        self.c = appmod.app.test_client()
        # Ensure backup dir is empty before we run
        import shutil
        if os.path.exists(helpers.BACKUP_DIR):
            shutil.rmtree(helpers.BACKUP_DIR)
        os.makedirs(helpers.BACKUP_DIR, exist_ok=True)

    def test_list_backups_empty(self):
        r = self.c.get("/api/backups")
        self.assertEqual(r.status_code, 200)
        self.assertEqual(r.get_json(), [])

    def test_backup_now_and_list(self):
        import re
        r = self.c.post("/api/backup/now")
        self.assertEqual(r.status_code, 200)
        filename = r.get_json()["file"]
        
        # Now list it
        r_list = self.c.get("/api/backups")
        self.assertEqual(r_list.status_code, 200)
        backups = r_list.get_json()
        self.assertEqual(len(backups), 1)
        self.assertEqual(backups[0]["filename"], filename)
        self.assertTrue(backups[0]["size_kb"] > 0)
        self.assertTrue(re.match(r'^\d{4}-\d{2}-\d{2}$', backups[0]["date"]))

    def test_restore_backup_success(self):
        # Create some data
        self.c.post("/api/tasks", json={"name": "test task"})
        self.assertEqual(len(self.c.get("/api/state").get_json()["tasks"]), 1)

        # Trigger backup
        r = self.c.post("/api/backup/now")
        filename = r.get_json()["file"]

        # Clear data by deleting the task
        tasks = self.c.get("/api/state").get_json()["tasks"]
        self.assertEqual(len(tasks), 1)
        self.c.delete("/api/tasks/%s" % tasks[0]["id"])
        self.assertEqual(len(self.c.get("/api/state").get_json()["tasks"]), 0)

        # Restore from backup
        r_restore = self.c.post("/api/backups/%s/restore" % filename)
        self.assertEqual(r_restore.status_code, 200)
        self.assertTrue(r_restore.get_json()["ok"])
        self.assertEqual(r_restore.get_json()["restored"], 1)

        # Verify data is back
        self.assertEqual(len(self.c.get("/api/state").get_json()["tasks"]), 1)

    def test_restore_backup_validation_security(self):
        # Validation should reject anything not matching backup-YYYY-MM-DD.json
        r1 = self.c.post("/api/backups/backup-..-evil.json/restore")
        self.assertEqual(r1.status_code, 400)
        
        r2 = self.c.post("/api/backups/backup-123.json/restore")
        self.assertEqual(r2.status_code, 400)

        r3 = self.c.post("/api/backups/backup-2026-06-12.json.txt/restore")
        self.assertEqual(r3.status_code, 400)

        r4 = self.c.post("/api/backups/backup-2026-06-12-json/restore")
        self.assertEqual(r4.status_code, 400)


class FolderAndPreviewTests(unittest.TestCase):
    """Folders and media view endpoints."""

    def setUp(self):
        reset_db()
        with helpers.db() as con:
            con.execute("DELETE FROM files")
            con.execute("DELETE FROM folders")
        helpers.AUTH_ENABLED = False
        self.c = appmod.app.test_client()

    def test_create_and_list_folders(self):
        # Create folder
        r = self.c.post("/api/folders", json={"name": "My Folder", "parent_id": None})
        self.assertEqual(r.status_code, 200)
        fid = r.get_json()["id"]

        # Check in state
        state = self.c.get("/api/state").get_json()
        self.assertIn("folders", state)
        self.assertEqual(len(state["folders"]), 1)
        self.assertEqual(state["folders"][0]["id"], fid)
        self.assertEqual(state["folders"][0]["name"], "My Folder")
        self.assertIsNone(state["folders"][0]["parent_id"])

    def test_folder_custom_icon(self):
        # Create folder with custom icon
        r = self.c.post("/api/folders", json={"name": "My Folder", "parent_id": None, "icon": "📓"})
        self.assertEqual(r.status_code, 200)
        fid = r.get_json()["id"]

        # Verify icon in state
        state = self.c.get("/api/state").get_json()
        self.assertEqual(state["folders"][0]["icon"], "📓")

        # Update folder icon
        r_update = self.c.put("/api/folders/%s" % fid, json={"icon": "💻"})
        self.assertEqual(r_update.status_code, 200)

        # Verify updated icon in state
        state = self.c.get("/api/state").get_json()
        self.assertEqual(state["folders"][0]["icon"], "💻")

    def test_upload_file_with_folder_id(self):
        # Create folder first
        r_f = self.c.post("/api/folders", json={"name": "Docs", "parent_id": None})
        fid = r_f.get_json()["id"]

        # Upload file with folder_id
        data = {
            "file": (io.BytesIO(b"my pdf content"), "doc.pdf"),
            "folder_id": fid
        }
        r = self.c.post("/api/files/upload", content_type="multipart/form-data", data=data)
        self.assertEqual(r.status_code, 200)
        file_id = r.get_json()["id"]

        # Verify folder_id is set in DB via state
        files = self.c.get("/api/state").get_json()["files"]
        self.assertEqual(len(files), 1)
        self.assertEqual(files[0]["id"], file_id)
        self.assertEqual(files[0]["folder_id"], fid)

    def test_view_file_returns_correct_mime_and_bytes(self):
        # Upload an image file
        data = {"file": (io.BytesIO(b"PNG-DATA"), "image.png")}
        fid = self.c.post("/api/files/upload", content_type="multipart/form-data", data=data).get_json()["id"]

        # Request it via the view endpoint
        r = self.c.get("/api/files/%s/view" % fid)
        self.assertEqual(r.status_code, 200)
        self.assertEqual(r.data, b"PNG-DATA")
        self.assertEqual(r.mimetype, "image/png")
        self.assertNotIn("attachment", r.headers.get("Content-Disposition", ""))

    def test_delete_folder_relocates_contents(self):
        # Create parent folder A and child folder B
        fid_a = self.c.post("/api/folders", json={"name": "A", "parent_id": None}).get_json()["id"]
        fid_b = self.c.post("/api/folders", json={"name": "B", "parent_id": fid_a}).get_json()["id"]

        # Upload file to B
        data = {"file": (io.BytesIO(b"file in B"), "fileB.txt"), "folder_id": fid_b}
        file_id = self.c.post("/api/files/upload", content_type="multipart/form-data", data=data).get_json()["id"]

        # Delete folder B
        r_del = self.c.delete("/api/folders/%s" % fid_b)
        self.assertEqual(r_del.status_code, 200)

        # Check state:
        state = self.c.get("/api/state").get_json()
        
        # Folder B should be deleted
        folders = state["folders"]
        self.assertEqual(len(folders), 1)
        self.assertEqual(folders[0]["id"], fid_a)

        # File should now be in Folder A (relocated to B's parent)
        files = state["files"]
        self.assertEqual(len(files), 1)
        self.assertEqual(files[0]["id"], file_id)
        self.assertEqual(files[0]["folder_id"], fid_a)

    def test_batch_move_files(self):
        # Create folder
        fid = self.c.post("/api/folders", json={"name": "Target Folder", "parent_id": None}).get_json()["id"]

        # Upload two files at root
        fid1 = self.c.post("/api/files/upload", content_type="multipart/form-data", data={"file": (io.BytesIO(b"file 1"), "f1.txt")}).get_json()["id"]
        fid2 = self.c.post("/api/files/upload", content_type="multipart/form-data", data={"file": (io.BytesIO(b"file 2"), "f2.txt")}).get_json()["id"]

        # Verify they are at root
        files = self.c.get("/api/state").get_json()["files"]
        self.assertEqual(len(files), 2)
        self.assertIsNone(files[0]["folder_id"])
        self.assertIsNone(files[1]["folder_id"])

        # Batch move them to Target Folder
        r_move = self.c.post("/api/files/move", json={"file_ids": [fid1, fid2], "folder_id": fid})
        self.assertEqual(r_move.status_code, 200)

        # Verify they are now in the folder
        files = self.c.get("/api/state").get_json()["files"]
        self.assertEqual(files[0]["folder_id"], fid)
        self.assertEqual(files[1]["folder_id"], fid)

        # Batch move them back to root (None/NULL)
        r_move_back = self.c.post("/api/files/move", json={"file_ids": [fid1, fid2], "folder_id": None})
        self.assertEqual(r_move_back.status_code, 200)

        # Verify they are back at root
        files = self.c.get("/api/state").get_json()["files"]
        self.assertIsNone(files[0]["folder_id"])
        self.assertIsNone(files[1]["folder_id"])


class CalendarSyncTests(unittest.TestCase):
    """Calendar ICS importing and syncing tests (timezone, location, description)."""

    def setUp(self):
        reset_db()
        with helpers.db() as con:
            con.execute("DELETE FROM events")
        helpers.AUTH_ENABLED = False
        self.c = appmod.app.test_client()

    def test_import_floating_time(self):
        ics_data = (
            "BEGIN:VCALENDAR\n"
            "BEGIN:VEVENT\n"
            "DTSTART:20260613T120000\n"
            "DTEND:20260613T133000\n"
            "SUMMARY:Floating Event\\, Test\\; Escape\\nNewline\n"
            "LOCATION:Office 404\\, Floor 4\n"
            "DESCRIPTION:Meeting with team\\; discuss things\\nand coding\n"
            "END:VEVENT\n"
            "END:VCALENDAR"
        )
        r = self.c.post("/api/ics/import", data={"file": (io.BytesIO(ics_data.encode("utf-8")), "test.ics")})
        self.assertEqual(r.status_code, 200)
        self.assertEqual(r.get_json()["added"], 1)

        events = self.c.get("/api/state").get_json()["events"]
        self.assertEqual(len(events), 1)
        e = events[0]
        self.assertEqual(e["date"], "2026-06-13")
        self.assertEqual(e["start"], "12:00")
        self.assertEqual(e["end"], "13:30")
        self.assertEqual(e["title"], "Floating Event, Test; Escape Newline")
        self.assertEqual(e["location"], "Office 404, Floor 4")
        self.assertEqual(e["description"], "Meeting with team; discuss things\nand coding")

    def test_import_utc_time(self):
        # 12:00:00 UTC
        ics_data = (
            "BEGIN:VCALENDAR\n"
            "BEGIN:VEVENT\n"
            "DTSTART:20260613T120000Z\n"
            "DTEND:20260613T133000Z\n"
            "SUMMARY:UTC Event\n"
            "LOCATION:Online\n"
            "DESCRIPTION:Remote call\n"
            "END:VEVENT\n"
            "END:VCALENDAR"
        )
        r = self.c.post("/api/ics/import", data={"file": (io.BytesIO(ics_data.encode("utf-8")), "test.ics")})
        self.assertEqual(r.status_code, 200)

        dt_start = datetime(2026, 6, 13, 12, 0, 0, tzinfo=timezone.utc).astimezone()
        dt_end = datetime(2026, 6, 13, 13, 30, 0, tzinfo=timezone.utc).astimezone()

        events = self.c.get("/api/state").get_json()["events"]
        self.assertEqual(len(events), 1)
        e = events[0]
        self.assertEqual(e["date"], dt_start.strftime("%Y-%m-%d"))
        self.assertEqual(e["start"], dt_start.strftime("%H:%M"))
        if dt_end.strftime("%Y-%m-%d") == dt_start.strftime("%Y-%m-%d"):
            self.assertEqual(e["end"], dt_end.strftime("%H:%M"))

    def test_import_tzid_time(self):
        # 12:00:00 New York Time
        ics_data = (
            "BEGIN:VCALENDAR\n"
            "BEGIN:VEVENT\n"
            "DTSTART;TZID=America/New_York:20260613T120000\n"
            "DTEND;TZID=America/New_York:20260613T133000\n"
            "SUMMARY:New York Event\n"
            "LOCATION:New York Office\n"
            "DESCRIPTION:In person\n"
            "END:VEVENT\n"
            "END:VCALENDAR"
        )
        r = self.c.post("/api/ics/import", data={"file": (io.BytesIO(ics_data.encode("utf-8")), "test.ics")})
        self.assertEqual(r.status_code, 200)

        import zoneinfo
        tz = zoneinfo.ZoneInfo("America/New_York")
        dt_start = datetime(2026, 6, 13, 12, 0, 0, tzinfo=tz).astimezone()
        dt_end = datetime(2026, 6, 13, 13, 30, 0, tzinfo=tz).astimezone()

        events = self.c.get("/api/state").get_json()["events"]
        self.assertEqual(len(events), 1)
        e = events[0]
        self.assertEqual(e["date"], dt_start.strftime("%Y-%m-%d"))
        self.assertEqual(e["start"], dt_start.strftime("%H:%M"))
        if dt_end.strftime("%Y-%m-%d") == dt_start.strftime("%Y-%m-%d"):
            self.assertEqual(e["end"], dt_end.strftime("%H:%M"))

    def test_clear_ics_events(self):
        from helpers import db, uid
        with db(write=True) as con:
            con.execute("INSERT INTO events (id, title, date, start, type, source) VALUES (?, ?, ?, ?, ?, ?)",
                        (uid(), "Manual Event", "2026-06-13", "10:00", "other", "manual"))
            con.execute("INSERT INTO events (id, title, date, start, type, source) VALUES (?, ?, ?, ?, ?, ?)",
                        (uid(), "ICS File Event", "2026-06-13", "11:00", "other", "ics"))
            con.execute("INSERT INTO events (id, title, date, start, type, source) VALUES (?, ?, ?, ?, ?, ?)",
                        (uid(), "ICS Sync Event 0", "2026-06-13", "12:00", "other", "ics_0"))
            con.execute("INSERT INTO events (id, title, date, start, type, source) VALUES (?, ?, ?, ?, ?, ?)",
                        (uid(), "ICS Sync Event 1", "2026-06-13", "13:00", "other", "ics_1"))

        # Verify initial database state
        with db() as con:
            count = con.execute("SELECT count(*) FROM events").fetchone()[0]
            self.assertEqual(count, 4)

        # Clear ICS events
        r = self.c.delete("/api/ics")
        self.assertEqual(r.status_code, 200)
        self.assertEqual(r.get_json()["deleted"], 3)  # should delete ics, ics_0, ics_1

        # Verify only the manual event remains
        events = self.c.get("/api/state").get_json()["events"]
        self.assertEqual(len(events), 1)
        self.assertEqual(events[0]["title"], "Manual Event")
        self.assertEqual(events[0]["source"], "manual")


class AdvancedTaskManagementTests(unittest.TestCase):
    """Tests for tags, sorting, due dates/times, and subtasks in tasks."""

    def setUp(self):
        reset_db()
        helpers.AUTH_ENABLED = False
        self.c = appmod.app.test_client()

    def test_task_crud_with_advanced_columns(self):
        # Create a task with category, order_index, due_date
        r = self.c.post("/api/tasks", json={
            "name": "Math Homework",
            "category": "School",
            "order_index": 5,
            "due_date": "2026-06-15T10:00",
            "due": "2026-06-15"
        })
        self.assertEqual(r.status_code, 200)
        tid = r.get_json()["id"]

        # Verify columns are set in state
        tasks = self.c.get("/api/state").get_json()["tasks"]
        self.assertEqual(len(tasks), 1)
        t = tasks[0]
        self.assertEqual(t["name"], "Math Homework")
        self.assertEqual(t["category"], "School")
        self.assertEqual(t["order_index"], 5)
        self.assertEqual(t["due_date"], "2026-06-15T10:00")
        self.assertIsNone(t["parent_id"])

        # Update order_index and category
        r_update = self.c.put("/api/tasks/%s" % tid, json={
            "order_index": 2,
            "category": "Work"
        })
        self.assertEqual(r_update.status_code, 200)

        # Create a subtask
        r_sub = self.c.post("/api/tasks", json={
            "name": "Part 1",
            "parent_id": tid
        })
        self.assertEqual(r_sub.status_code, 200)
        sub_id = r_sub.get_json()["id"]

        # Verify state includes subtask
        tasks = self.c.get("/api/state").get_json()["tasks"]
        self.assertEqual(len(tasks), 2)
        
        parent = next(x for x in tasks if x["id"] == tid)
        sub = next(x for x in tasks if x["id"] == sub_id)
        
        self.assertEqual(parent["category"], "Work")
        self.assertEqual(parent["order_index"], 2)
        self.assertEqual(sub["name"], "Part 1")
        self.assertEqual(sub["parent_id"], tid)


class VersionCheckTests(unittest.TestCase):
    def setUp(self):
        self.app = appmod.create_app()
        self.c = self.app.test_client()
        reset_db()

    def test_version_check_endpoint(self):
        # Verify endpoint returns the correct fields and status code
        r = self.c.get("/api/version/check")
        self.assertEqual(r.status_code, 200)
        data = r.get_json()
        self.assertIn("current", data)
        self.assertIn("latest", data)
        self.assertIn("update_available", data)
        self.assertEqual(data["current"], helpers.VERSION)

    def test_version_check_newer_logic(self):
        # Test helper logic by using a lower version and mock cached release
        original_version = helpers.VERSION
        try:
            helpers.VERSION = "1.1.0"
            helpers.kv_set("latest_version_cached", "1.2.0")
            import time
            helpers.kv_set("last_version_check", str(int(time.time())))
            
            res = helpers.check_version(force=False)
            self.assertTrue(res["update_available"])
            self.assertEqual(res["latest"], "1.2.0")
            self.assertEqual(res["current"], "1.1.0")
        finally:
            helpers.VERSION = original_version


class NotificationTests(unittest.TestCase):
    def setUp(self):
        self.app = appmod.create_app()
        self.c = self.app.test_client()
        reset_db()

    def test_public_key(self):
        # Clean VAPID keys if any existed
        helpers.kv_del("vapid_private_pem")
        helpers.kv_del("vapid_public_b64")

        r = self.c.get("/api/push/public-key")
        self.assertEqual(r.status_code, 200)
        data = r.get_json()
        self.assertIn("public_key", data)
        self.assertTrue(len(data["public_key"]) > 0)
        
        # Verify it was saved in kv
        self.assertIsNotNone(helpers.kv_get("vapid_private_pem"))
        self.assertEqual(helpers.kv_get("vapid_public_b64"), data["public_key"])

    def test_subscribe_unsubscribe(self):
        # Subscribe endpoint testing
        sub_payload = {
            "endpoint": "https://fcm.googleapis.com/fcm/send/some-token",
            "keys": {
                "p256dh": "some-dh-key",
                "auth": "some-auth-key"
            }
        }
        # Post to subscribe
        r = self.c.post("/api/push/subscribe", json=sub_payload)
        self.assertEqual(r.status_code, 200)
        
        # Verify in DB
        with helpers.db() as con:
            rows = [dict(row) for row in con.execute("SELECT * FROM push_subscriptions")]
        self.assertEqual(len(rows), 1)
        self.assertIn("some-token", rows[0]["subscription_json"])
        
        # Unsubscribe testing
        r2 = self.c.post("/api/push/unsubscribe", json={"endpoint": "https://fcm.googleapis.com/fcm/send/some-token"})
        self.assertEqual(r2.status_code, 200)
        
        # Verify removed from DB
        with helpers.db() as con:
            rows = [dict(row) for row in con.execute("SELECT * FROM push_subscriptions")]
        self.assertEqual(len(rows), 0)

    @unittest.mock.patch("pywebpush.webpush")
    def test_notify_test_endpoint(self, mock_webpush):
        # 1. No configuration -> 400
        helpers.kv_del("set_ntfy_topic")
        r = self.c.post("/api/notify/test")
        self.assertEqual(r.status_code, 400)

        # 2. Subscribe a mock device
        sub_payload = {
            "endpoint": "https://updates.push.services.mozilla.com/wpush/v2/token",
            "keys": {"p256dh": "dh", "auth": "auth"}
        }
        self.c.post("/api/push/subscribe", json=sub_payload)

        # 3. Test send -> 200 (since mock_webpush won't raise errors)
        r2 = self.c.post("/api/notify/test")
        self.assertEqual(r2.status_code, 200)
        self.assertTrue(mock_webpush.called)

    def test_webpush_send_missing_dependency(self):
        import sys
        # Temporarily hide pywebpush and py_vapid from sys.modules
        real_modules = {}
        for name in ["pywebpush", "py_vapid"]:
            if name in sys.modules:
                real_modules[name] = sys.modules[name]
            sys.modules[name] = None
        
        try:
            # webpush_send should return False instead of raising ModuleNotFoundError
            from helpers import webpush_send
            res = webpush_send("title", "msg")
            self.assertFalse(res)
        finally:
            # Restore modules
            for name, mod in real_modules.items():
                if mod is None:
                    sys.modules.pop(name, None)
                else:
                    sys.modules[name] = mod

    def test_vapid_keys_missing_dependency(self):
        import sys
        from helpers import kv_del, vapid_keys
        
        # Delete existing keys to force generation attempt
        kv_del("vapid_private_pem")
        kv_del("vapid_public_b64")
        
        # Temporarily hide cryptography from sys.modules
        real_modules = {}
        # Hide all cryptography-related modules that might be imported
        for name in ["cryptography", "cryptography.hazmat", "cryptography.hazmat.primitives", 
                     "cryptography.hazmat.primitives.asymmetric", "cryptography.hazmat.primitives.asymmetric.ec", 
                     "cryptography.hazmat.primitives.serialization"]:
            if name in sys.modules:
                real_modules[name] = sys.modules[name]
            sys.modules[name] = None
        
        try:
            # vapid_keys should return ("", "") instead of raising ModuleNotFoundError
            priv, pub = vapid_keys()
            self.assertEqual(priv, "")
            self.assertEqual(pub, "")
        finally:
            # Restore modules
            for name, mod in real_modules.items():
                if mod is None:
                    sys.modules.pop(name, None)
                else:
                    sys.modules[name] = mod


class DatabaseConnectionPoolingTests(unittest.TestCase):
    def setUp(self):
        self.app = appmod.create_app()
        self.c = self.app.test_client()

    def test_connection_reused_within_request(self):
        with self.app.test_request_context():
            from flask import g
            import helpers
            
            with helpers.db() as con1:
                pass
            
            with helpers.db() as con2:
                pass
                
            self.assertTrue(hasattr(g, "db_conn"))
            self.assertEqual(con1, con2)
            self.assertEqual(g.db_conn, con1)
            # Verify the connection is open
            con1.execute("SELECT 1")

    def test_connection_closed_on_teardown(self):
        import sqlite3
        with self.app.test_request_context():
            from flask import g
            import helpers
            with helpers.db() as con:
                pass
            conn_ref = g.db_conn
            # Ensure it is open here
            conn_ref.execute("SELECT 1")
        
        # Now context is popped. Let's verify connection is closed.
        with self.assertRaises(sqlite3.ProgrammingError):
            conn_ref.execute("SELECT 1")


class Fts5SearchTests(unittest.TestCase):
    def setUp(self):
        self.app = appmod.create_app()
        self.c = self.app.test_client()
        reset_db()

    def test_fts5_notes_triggers_and_search(self):
        # 1. Insert notes and verify they are indexed
        r1 = self.c.post("/api/notes", json={"title": "Important Meeting", "body": "Discussing the new SQLite features"})
        self.assertEqual(r1.status_code, 200)
        nid_a = r1.get_json()["id"]

        r2 = self.c.post("/api/notes", json={"title": "Shopping list", "body": "Buy milk, eggs, and bread"})
        self.assertEqual(r2.status_code, 200)
        nid_b = r2.get_json()["id"]

        # 2. Check FTS5 index directly
        with helpers.db() as con:
            row_a = con.execute("SELECT * FROM notes_fts WHERE id=?", (nid_a,)).fetchone()
            self.assertIsNotNone(row_a)
            self.assertEqual(row_a["title"], "Important Meeting")
            self.assertEqual(row_a["body"], "Discussing the new SQLite features")

            row_b = con.execute("SELECT * FROM notes_fts WHERE id=?", (nid_b,)).fetchone()
            self.assertIsNotNone(row_b)
            self.assertEqual(row_b["title"], "Shopping list")

        # 3. Test FTS5 notes search endpoint
        r_search1 = self.c.get("/api/notes/search?q=sqlite")
        self.assertEqual(r_search1.status_code, 200)
        ids1 = r_search1.get_json()
        self.assertIn(nid_a, ids1)
        self.assertNotIn(nid_b, ids1)

        r_search2 = self.c.get("/api/notes/search?q=milk")
        self.assertEqual(r_search2.status_code, 200)
        ids2 = r_search2.get_json()
        self.assertIn(nid_b, ids2)
        self.assertNotIn(nid_a, ids2)

        # 4. Test note update triggers FTS5 update
        r_up = self.c.put(f"/api/notes/{nid_a}", json={"body": "Discussing PostgreSQL features"})
        self.assertEqual(r_up.status_code, 200)

        # Search for 'sqlite' -> should not match Note A anymore
        r_search3 = self.c.get("/api/notes/search?q=sqlite")
        self.assertEqual(r_search3.get_json(), [])

        # Search for 'postgresql' -> should match Note A
        r_search4 = self.c.get("/api/notes/search?q=postgresql")
        self.assertIn(nid_a, r_search4.get_json())

        # 5. Test note delete triggers FTS5 delete
        r_del = self.c.delete(f"/api/notes/{nid_a}")
        self.assertEqual(r_del.status_code, 200)

        with helpers.db() as con:
            row_del = con.execute("SELECT 1 FROM notes_fts WHERE id=?", (nid_a,)).fetchone()
            self.assertIsNone(row_del)

    def test_fts5_files_triggers_and_search(self):
        # 1. Insert files and check FTS5 search
        r1 = self.c.post("/api/files/upload", data={"file": (io.BytesIO(b"content"), "lecture_notes_physics.pdf")})
        self.assertEqual(r1.status_code, 200)
        fid_a = r1.get_json()["id"]

        r2 = self.c.post("/api/files/upload", data={"file": (io.BytesIO(b"content"), "vacation_photo.jpg")})
        self.assertEqual(r2.status_code, 200)
        fid_b = r2.get_json()["id"]

        # 2. Check FTS5 index directly
        with helpers.db() as con:
            row_a = con.execute("SELECT * FROM files_fts WHERE id=?", (fid_a,)).fetchone()
            self.assertIsNotNone(row_a)
            self.assertEqual(row_a["filename"], "lecture_notes_physics.pdf")

        # 3. Test search endpoint
        r_search1 = self.c.get("/api/files/search?q=physics")
        self.assertEqual(r_search1.status_code, 200)
        ids1 = r_search1.get_json()
        self.assertIn(fid_a, ids1)
        self.assertNotIn(fid_b, ids1)

        # 4. Test delete
        r_del = self.c.delete(f"/api/files/{fid_a}")
        self.assertEqual(r_del.status_code, 200)

        with helpers.db() as con:
            row_del = con.execute("SELECT 1 FROM files_fts WHERE id=?", (fid_a,)).fetchone()
            self.assertIsNone(row_del)


class DatabaseMigrationTests(unittest.TestCase):
    def test_migrations_applied_successfully(self):
        with helpers.db() as con:
            row = con.execute("SELECT value FROM kv WHERE key='db_version'").fetchone()
            self.assertIsNotNone(row)
            self.assertEqual(row["value"], "13")

            notes_fts = con.execute("SELECT name FROM sqlite_master WHERE type='table' AND name='notes_fts'").fetchone()
            self.assertIsNotNone(notes_fts)

            deleted_records = con.execute("SELECT name FROM sqlite_master WHERE type='table' AND name='deleted_records'").fetchone()
            self.assertIsNotNone(deleted_records)

            for table in ["tasks", "events", "exams", "habits", "habit_log", "workouts", "notes", "note_folders", "files", "folders", "shortcuts", "study_sessions"]:
                idx_name = f"idx_{table}_version"
                idx = con.execute("SELECT name FROM sqlite_master WHERE type='index' AND name=?", (idx_name,)).fetchone()
                self.assertIsNotNone(idx, f"Index {idx_name} is missing")

            # Verify foreign key indexes exist
            fk_indexes = [
                "idx_tasks_parent_id",
                "idx_notes_folder_id",
                "idx_note_folders_parent_id",
                "idx_files_folder_id",
                "idx_folders_parent_id",
                "idx_habit_log_habit_id"
            ]
            for idx_name in fk_indexes:
                idx = con.execute("SELECT name FROM sqlite_master WHERE type='index' AND name=?", (idx_name,)).fetchone()
                self.assertIsNotNone(idx, f"Index {idx_name} is missing")

    def test_version_detection_logic(self):
        import sqlite3
        con = sqlite3.connect(":memory:")
        con.row_factory = sqlite3.Row
        
        # Version 0: Empty database
        self.assertEqual(helpers.get_current_schema_version(con), 0)
        
        # Version 1: Let's create 'kv' and a table to simulate version 1
        con.execute("CREATE TABLE kv(key TEXT PRIMARY KEY, value TEXT)")
        con.execute("CREATE TABLE notes(id TEXT PRIMARY KEY, title TEXT)")
        con.execute("DELETE FROM kv WHERE key='db_version'")
        self.assertEqual(helpers.get_current_schema_version(con), 1)

        # Version 2: Add notes.is_pinned
        con.execute("ALTER TABLE notes ADD COLUMN is_pinned INTEGER DEFAULT 0")
        con.execute("DELETE FROM kv WHERE key='db_version'")
        self.assertEqual(helpers.get_current_schema_version(con), 2)

        # Version 3: Add events recurrence
        con.execute("CREATE TABLE events(id TEXT PRIMARY KEY, recurrence TEXT)")
        con.execute("DELETE FROM kv WHERE key='db_version'")
        self.assertEqual(helpers.get_current_schema_version(con), 3)

        # Version 4: Add tasks parent_id
        con.execute("CREATE TABLE tasks(id TEXT PRIMARY KEY, parent_id TEXT)")
        con.execute("DELETE FROM kv WHERE key='db_version'")
        self.assertEqual(helpers.get_current_schema_version(con), 4)

        # Version 5: Add notes_fts table
        con.execute("CREATE TABLE notes_fts(id TEXT)")
        con.execute("DELETE FROM kv WHERE key='db_version'")
        self.assertEqual(helpers.get_current_schema_version(con), 5)

        # Version 6: Add deleted_records table
        con.execute("CREATE TABLE deleted_records(id TEXT, \"table\" TEXT, version INTEGER, PRIMARY KEY (id, \"table\"))")
        con.execute("DELETE FROM kv WHERE key='db_version'")
        self.assertEqual(helpers.get_current_schema_version(con), 6)

    def test_auto_vacuum_enabled(self):
        with helpers.db() as con:
            res = con.execute("PRAGMA auto_vacuum;").fetchone()
            self.assertEqual(res[0], 2)

    def test_database_optimize_runs(self):
        from scheduler import optimize_database
        try:
            optimize_database()
        except Exception as e:
            self.fail(f"optimize_database raised exception: {e}")


class DeltaSyncTests(unittest.TestCase):
    def setUp(self):
        self.app = appmod.create_app()
        self.c = self.app.test_client()
        reset_db()

    def test_full_state_returns_version_and_is_delta(self):
        r = self.c.get("/api/state")
        self.assertEqual(r.status_code, 200)
        data = r.get_json()
        self.assertIn("version", data)
        self.assertEqual(data["is_delta"], False)
        self.assertEqual(data["deleted_records"], [])

    def test_delta_sync_flow(self):
        # 1. Get initial state & version
        r1 = self.c.get("/api/state")
        v0 = r1.get_json()["version"]

        # 2. Add an event (mutating state, triggers increment state_version)
        res_post = self.c.post("/api/events", json={
            "title": "Delta Event",
            "date": "2026-06-23",
            "type": "other"
        })
        self.assertEqual(res_post.status_code, 200)
        event_id = res_post.get_json()["id"]

        # 3. Query state since v0
        r2 = self.c.get(f"/api/state?since_version={v0}")
        self.assertEqual(r2.status_code, 200)
        data2 = r2.get_json()
        self.assertEqual(data2["is_delta"], True)
        self.assertTrue(data2["version"] > v0)
        
        # Check that the new event is returned in delta
        events = data2["events"]
        self.assertEqual(len(events), 1)
        self.assertEqual(events[0]["id"], event_id)
        self.assertEqual(events[0]["title"], "Delta Event")

        # Check other tables are empty in delta
        self.assertEqual(data2["tasks"], [])
        self.assertEqual(data2["notes"], [])

        # 4. Update the event
        res_put = self.c.put(f"/api/events/{event_id}", json={
            "title": "Updated Delta Event"
        })
        self.assertEqual(res_put.status_code, 200)

        # Query state since the version after posting
        v1 = data2["version"]
        r3 = self.c.get(f"/api/state?since_version={v1}")
        data3 = r3.get_json()
        self.assertEqual(data3["is_delta"], True)
        self.assertTrue(data3["version"] > v1)
        self.assertEqual(len(data3["events"]), 1)
        self.assertEqual(data3["events"][0]["title"], "Updated Delta Event")

        # 5. Delete the event
        res_del = self.c.delete(f"/api/events/{event_id}")
        self.assertEqual(res_del.status_code, 200)

        # Query state since the version after updating
        v2 = data3["version"]
        r4 = self.c.get(f"/api/state?since_version={v2}")
        data4 = r4.get_json()
        self.assertEqual(data4["is_delta"], True)
        self.assertTrue(data4["version"] > v2)
        # Event should not be in the events table since it is deleted
        self.assertEqual(data4["events"], [])
        # Event should be in deleted_records
        del_records = data4["deleted_records"]
        self.assertEqual(len(del_records), 1)
        self.assertEqual(del_records[0]["id"], event_id)
        self.assertEqual(del_records[0]["table"], "events")

    def test_habit_log_delta_sync(self):
        # Create habit
        res_post = self.c.post("/api/habits", json={"name": "Delta Habit", "created": "2026-06-23"})
        self.assertEqual(res_post.status_code, 200)
        habit_id = res_post.get_json()["id"]

        r1 = self.c.get("/api/state")
        v0 = r1.get_json()["version"]

        # Toggle habit on
        res_toggle = self.c.post(f"/api/habits/{habit_id}/toggle", json={"date": "2026-06-23"})
        self.assertEqual(res_toggle.status_code, 200)

        # Verify toggle is in delta
        r2 = self.c.get(f"/api/state?since_version={v0}")
        data2 = r2.get_json()
        self.assertEqual(len(data2["habit_log"]), 1)
        self.assertEqual(data2["habit_log"][0]["habit_id"], habit_id)
        self.assertEqual(data2["habit_log"][0]["date"], "2026-06-23")

        v1 = data2["version"]

        # Toggle habit off (deletes row)
        res_toggle2 = self.c.post(f"/api/habits/{habit_id}/toggle", json={"date": "2026-06-23"})
        self.assertEqual(res_toggle2.status_code, 200)

        # Verify delete tombstone is in delta
        r3 = self.c.get(f"/api/state?since_version={v1}")
        data3 = r3.get_json()
        self.assertEqual(data3["habit_log"], [])
        del_records = data3["deleted_records"]
        self.assertEqual(len(del_records), 1)
        self.assertEqual(del_records[0]["id"], f"{habit_id}:2026-06-23")
        self.assertEqual(del_records[0]["table"], "habit_log")

    def test_atomic_triggers_increment_state_version(self):
        # Verify that inserting multiple events/tasks in a single transaction
        # results in distinct sequential versions, proving the database trigger
        # updates the kv table dynamically per row.
        with helpers.db(write=True) as con:
            con.execute("INSERT INTO tasks(id, name, done) VALUES('t1', 'task 1', 0)")
            con.execute("INSERT INTO tasks(id, name, done) VALUES('t2', 'task 2', 0)")
            con.execute("INSERT INTO tasks(id, name, done) VALUES('t3', 'task 3', 0)")
            
            t1_ver = con.execute("SELECT version FROM tasks WHERE id='t1'").fetchone()["version"]
            t2_ver = con.execute("SELECT version FROM tasks WHERE id='t2'").fetchone()["version"]
            t3_ver = con.execute("SELECT version FROM tasks WHERE id='t3'").fetchone()["version"]
            
            self.assertEqual(t2_ver, t1_ver + 1)
            self.assertEqual(t3_ver, t2_ver + 1)
            
            global_ver = int(con.execute("SELECT value FROM kv WHERE key='state_version'").fetchone()["value"])
            self.assertEqual(global_ver, t3_ver)


class CompressionTests(unittest.TestCase):
    def setUp(self):
        self.app = appmod.create_app()
        self.c = self.app.test_client()
        reset_db()

    def test_gzip_compression_enabled(self):
        # Add a note to ensure payload is > 500 bytes
        self.c.post("/api/notes", json={
            "title": "Large Note Title",
            "body": "A" * 600
        })

        r = self.c.get("/api/state", headers={"Accept-Encoding": "gzip"})
        self.assertEqual(r.status_code, 200)
        self.assertEqual(r.headers.get("Content-Encoding"), "gzip")
        self.assertIn("Accept-Encoding", r.headers.get("Vary", ""))

        import gzip
        import json
        decompressed_data = gzip.decompress(r.data)
        data = json.loads(decompressed_data)
        self.assertIn("version", data)

    def test_gzip_compression_not_supported_by_client(self):
        self.c.post("/api/notes", json={
            "title": "Large Note Title",
            "body": "A" * 600
        })

        r = self.c.get("/api/state", headers={"Accept-Encoding": "identity"})
        self.assertEqual(r.status_code, 200)
        self.assertIsNone(r.headers.get("Content-Encoding"))

    def test_tiny_response_not_compressed(self):
        r = self.c.get("/api/state-version", headers={"Accept-Encoding": "gzip"})
        self.assertEqual(r.status_code, 200)
        self.assertIsNone(r.headers.get("Content-Encoding"))


class ErrorHandlingTests(unittest.TestCase):
    def setUp(self):
        self.app = appmod.create_app()
        self.c = self.app.test_client()
        reset_db()

    def test_404_error_returns_json(self):
        from werkzeug.exceptions import NotFound
        @self.app.get("/test-404-trigger")
        def trigger_404():
            raise NotFound("Resource not found")

        r = self.c.get("/test-404-trigger")
        self.assertEqual(r.status_code, 404)
        self.assertEqual(r.content_type, "application/json")
        data = r.get_json()
        self.assertIn("error", data)
        self.assertEqual(data["code"], 404)
        self.assertEqual(data["type"], "NotFound")

    def test_405_error_returns_json(self):
        from werkzeug.exceptions import MethodNotAllowed
        @self.app.get("/test-405-trigger")
        def trigger_405():
            raise MethodNotAllowed("Method not allowed on this resource")

        r = self.c.get("/test-405-trigger")
        self.assertEqual(r.status_code, 405)
        self.assertEqual(r.content_type, "application/json")
        data = r.get_json()
        self.assertIn("error", data)
        self.assertEqual(data["code"], 405)
        self.assertEqual(data["type"], "MethodNotAllowed")

    def test_500_error_returns_json(self):
        # Dynamically register a route that throws an exception to test unhandled 500 error
        @self.app.get("/test-unhandled-error")
        def error_route():
            raise ValueError("Simulated unhandled exception")

        r = self.c.get("/test-unhandled-error")
        self.assertEqual(r.status_code, 500)
        self.assertEqual(r.content_type, "application/json")
        data = r.get_json()
        self.assertEqual(data["error"], "An unexpected error occurred")
        self.assertEqual(data["code"], 500)
        self.assertEqual(data["type"], "InternalServerError")


class DatabaseConcurrencyTests(unittest.TestCase):
    def setUp(self):
        reset_db()

    def test_concurrent_writes_are_serialized(self):
        import threading
        import time
        from helpers import db, kv_set, kv_get

        errors = []
        threads = []

        def worker(worker_id):
            try:
                # Perform a write operation via kv_set (which uses db(write=True))
                kv_set(f"thread_key_{worker_id}", f"value_{worker_id}")
                # Yield context with write=True to simulate a longer write transaction
                with db(write=True) as con:
                    time.sleep(0.05)
                    con.execute("INSERT INTO habits(id, name) VALUES(?, ?)", (f"h_{worker_id}", f"Habit {worker_id}"))
            except Exception as e:
                errors.append(e)

        # Launch 10 threads doing concurrent writes
        for i in range(10):
            t = threading.Thread(target=worker, args=(i,))
            threads.append(t)
            t.start()

        for t in threads:
            t.join()

        # Check for any errors
        self.assertEqual(len(errors), 0, f"Concurrent database writes failed with errors: {errors}")

        # Verify data was written correctly
        with db() as con:
            for i in range(10):
                self.assertEqual(kv_get(f"thread_key_{i}"), f"value_{i}")
                row = con.execute("SELECT name FROM habits WHERE id=?", (f"h_{i}",)).fetchone()
                self.assertIsNotNone(row)
                self.assertEqual(row["name"], f"Habit {i}")


class TaskQueueTests(unittest.TestCase):
    def setUp(self):
        self.app = appmod.create_app()
        self.c = self.app.test_client()
        reset_db()

    def test_enqueue_task_and_dispatch(self):
        import time
        import json
        from scheduler import enqueue_task, check_and_dispatch_tasks, execute_queued_task
        from helpers import db

        # Enqueue a database optimization task
        task_id = enqueue_task("db_optimize")
        
        # Verify it is in 'pending' state
        with db() as con:
            task = con.execute("SELECT * FROM queued_tasks WHERE id=?", (task_id,)).fetchone()
            self.assertIsNotNone(task)
            self.assertEqual(task["task_type"], "db_optimize")
            self.assertEqual(task["status"], "pending")
            self.assertEqual(task["attempts"], 0)

        # Run execute_queued_task directly to simulate worker thread execution
        execute_queued_task(task_id)

        # Verify it transitions to 'completed'
        with db() as con:
            task = con.execute("SELECT * FROM queued_tasks WHERE id=?", (task_id,)).fetchone()
            self.assertEqual(task["status"], "completed")
            self.assertEqual(task["attempts"], 1)
            self.assertIsNotNone(task["result"])
            res = json.loads(task["result"])
            self.assertTrue(res["success"])

    def test_task_queue_endpoints(self):
        # Trigger calendar sync (which enqueues a calendar_sync task)
        # We need to make sure cal_sync_urls is set to avoid 400
        from helpers import kv_set
        kv_set("set_cal_sync_urls", "https://example.com/calendar.ics")

        # Let's hit the endpoint to trigger sync asynchronously
        r = self.c.post("/api/ics/sync-now?async=true")
        self.assertEqual(r.status_code, 200)
        task_id = r.get_json()["task_id"]
        self.assertIsNotNone(task_id)

        # List tasks
        r_list = self.c.get("/api/tasks")
        self.assertEqual(r_list.status_code, 200)
        tasks = r_list.get_json()
        # Verify our task is in the list and has correct attributes
        matching_tasks = [t for t in tasks if t["id"] == task_id]
        self.assertEqual(len(matching_tasks), 1)
        self.assertEqual(matching_tasks[0]["task_type"], "calendar_sync")
        self.assertEqual(matching_tasks[0]["status"], "pending")

        # Fetch single task details
        r_detail = self.c.get(f"/api/tasks/{task_id}")
        self.assertEqual(r_detail.status_code, 200)
        self.assertEqual(r_detail.get_json()["id"], task_id)

    def test_task_timeout_detection(self):
        import time
        from scheduler import enqueue_task, check_running_timeouts
        from helpers import db

        # Enqueue a task
        task_id = enqueue_task("backup")
        
        # Manually force its status to 'running' and started_at to 15 minutes ago
        now_ts = int(time.time())
        with db(write=True) as con:
            con.execute(
                "UPDATE queued_tasks SET status='running', started_at=? WHERE id=?",
                (now_ts - 900, task_id)
            )

        # Run timeout checker
        check_running_timeouts()

        # Verify it transitions to 'failed' due to timeout
        with db() as con:
            task = con.execute("SELECT * FROM queued_tasks WHERE id=?", (task_id,)).fetchone()
            self.assertEqual(task["status"], "failed")
            self.assertEqual(task["error_message"], "Task execution timed out.")

    def test_task_retry_and_exponential_backoff(self):
        import time
        from scheduler import enqueue_task, execute_queued_task
        from helpers import db

        # Enqueue a task with invalid type to force execution failure
        task_id = enqueue_task("invalid_task_type")

        # Execute it (first attempt)
        execute_queued_task(task_id)

        with db() as con:
            task = con.execute("SELECT * FROM queued_tasks WHERE id=?", (task_id,)).fetchone()
            self.assertEqual(task["status"], "pending")  # Should be set back to pending for retry
            self.assertEqual(task["attempts"], 1)
            self.assertTrue(task["scheduled_at"] > int(time.time())) # Scheduled in the future
            self.assertIn("ValueError: Unknown task type", task["error_message"])

        # Execute it again (second attempt)
        # First manually set scheduled_at in the past so it can run
        with db(write=True) as con:
            con.execute("UPDATE queued_tasks SET scheduled_at=? WHERE id=?", (int(time.time()) - 10, task_id))
            
        execute_queued_task(task_id)

        with db() as con:
            task = con.execute("SELECT * FROM queued_tasks WHERE id=?", (task_id,)).fetchone()
            self.assertEqual(task["status"], "pending")
            self.assertEqual(task["attempts"], 2)

        # Execute it again (third attempt, final failure)
        with db(write=True) as con:
            con.execute("UPDATE queued_tasks SET scheduled_at=? WHERE id=?", (int(time.time()) - 10, task_id))
            
        execute_queued_task(task_id)

        with db() as con:
            task = con.execute("SELECT * FROM queued_tasks WHERE id=?", (task_id,)).fetchone()
            self.assertEqual(task["status"], "failed") # Exceeded max_attempts
            self.assertEqual(task["attempts"], 3)

    def test_task_recovery_on_startup(self):
        import time
        from scheduler import enqueue_task, recover_interrupted_tasks
        from helpers import db

        # Enqueue tasks
        task_id_1 = enqueue_task("backup")
        task_id_2 = enqueue_task("calendar_sync")
        
        # Manually force status to 'running'
        with db(write=True) as con:
            con.execute(
                "UPDATE queued_tasks SET status='running', started_at=? WHERE id=?",
                (int(time.time()), task_id_1)
            )
            # For task 2, let's set it to running but with attempts = 2 (max_attempts = 3)
            # So its next attempt will be 3, which is the maximum, so it should be marked failed.
            con.execute(
                "UPDATE queued_tasks SET status='running', started_at=?, attempts=2 WHERE id=?",
                (int(time.time()), task_id_2)
            )

        # Run startup recovery
        recover_interrupted_tasks()

        # Verify task 1 is reset to pending with attempts=1 and started_at=None
        with db() as con:
            task1 = con.execute("SELECT * FROM queued_tasks WHERE id=?", (task_id_1,)).fetchone()
            self.assertIsNotNone(task1)
            self.assertEqual(task1["status"], "pending")
            self.assertEqual(task1["attempts"], 1)
            self.assertIsNone(task1["started_at"])
            self.assertEqual(task1["error_message"], "Server restarted")

            # Verify task 2 is marked failed because it reached max_attempts
            task2 = con.execute("SELECT * FROM queued_tasks WHERE id=?", (task_id_2,)).fetchone()
            self.assertIsNotNone(task2)
            self.assertEqual(task2["status"], "failed")
            self.assertEqual(task2["attempts"], 3)
            self.assertEqual(task2["error_message"], "Server restarted")


class DatabaseResiliencyTests(unittest.TestCase):
    def test_db_retry_decorator_success_after_retries(self):
        from helpers import db_retry
        import sqlite3

        call_count = 0

        @db_retry(max_retries=3, initial_delay=0.01, backoff_factor=1.5)
        def dummy_write():
            nonlocal call_count
            call_count += 1
            if call_count < 3:
                raise sqlite3.OperationalError("database is locked")
            return "success"

        result = dummy_write()
        self.assertEqual(result, "success")
        self.assertEqual(call_count, 3)

    def test_db_retry_decorator_raises_other_errors(self):
        from helpers import db_retry
        import sqlite3

        call_count = 0

        @db_retry(max_retries=3, initial_delay=0.01, backoff_factor=1.5)
        def dummy_write():
            nonlocal call_count
            call_count += 1
            raise sqlite3.OperationalError("near 'syntax': syntax error")

        with self.assertRaises(sqlite3.OperationalError) as ctx:
            dummy_write()
        self.assertIn("syntax error", str(ctx.exception))
        self.assertEqual(call_count, 1)

    def test_db_retry_decorator_raises_after_exhaustion(self):
        from helpers import db_retry
        import sqlite3

        call_count = 0

        @db_retry(max_retries=3, initial_delay=0.01, backoff_factor=1.5)
        def dummy_write():
            nonlocal call_count
            call_count += 1
            raise sqlite3.OperationalError("database is locked")

        with self.assertRaises(sqlite3.OperationalError) as ctx:
            dummy_write()
        self.assertIn("locked", str(ctx.exception))
        self.assertEqual(call_count, 4)  # 1 initial + 3 retries = 4 attempts

    def test_db_context_manager_begin_immediate_and_write(self):
        from helpers import db
        # Ensure we can run db(write=True) context manager successfully
        with db(write=True) as con:
            self.assertTrue(con.in_transaction)
            con.execute("INSERT INTO kv(key, value) VALUES('resilience_test', '1') ON CONFLICT(key) DO UPDATE SET value=excluded.value")


class HTTPResiliencyTests(unittest.TestCase):
    def test_http_retry_success_after_connection_error(self):
        from helpers import http_retry
        import requests

        call_count = 0

        @http_retry(max_retries=3, initial_delay=0.01, backoff_factor=1.5)
        def dummy_request():
            nonlocal call_count
            call_count += 1
            if call_count < 3:
                raise requests.exceptions.ConnectionError("Connection timed out")
            resp = requests.Response()
            resp.status_code = 200
            return resp

        result = dummy_request()
        self.assertEqual(result.status_code, 200)
        self.assertEqual(call_count, 3)

    def test_http_retry_success_after_transient_status_code(self):
        from helpers import http_retry
        import requests

        call_count = 0

        @http_retry(max_retries=3, initial_delay=0.01, backoff_factor=1.5)
        def dummy_request():
            nonlocal call_count
            call_count += 1
            resp = requests.Response()
            if call_count < 3:
                resp.status_code = 429
            else:
                resp.status_code = 200
            return resp

        result = dummy_request()
        self.assertEqual(result.status_code, 200)
        self.assertEqual(call_count, 3)

    def test_http_retry_no_retry_on_non_transient_status_code(self):
        from helpers import http_retry
        import requests

        call_count = 0

        @http_retry(max_retries=3, initial_delay=0.01, backoff_factor=1.5)
        def dummy_request():
            nonlocal call_count
            call_count += 1
            resp = requests.Response()
            resp.status_code = 401
            raise requests.exceptions.HTTPError("Unauthorized", response=resp)

        with self.assertRaises(requests.exceptions.HTTPError):
            dummy_request()
        self.assertEqual(call_count, 1)

    def test_http_retry_raises_after_exhaustion(self):
        from helpers import http_retry
        import requests

        call_count = 0

        @http_retry(max_retries=3, initial_delay=0.01, backoff_factor=1.5)
        def dummy_request():
            nonlocal call_count
            call_count += 1
            raise requests.exceptions.Timeout("Read timeout")

        with self.assertRaises(requests.exceptions.Timeout):
            dummy_request()
        self.assertEqual(call_count, 4)  # 1 initial + 3 retries = 4 attempts


class StorageCleanupTests(unittest.TestCase):

    def setUp(self):
        reset_db()
        helpers.AUTH_ENABLED = False
        self.c = appmod.app.test_client()

    def test_storage_cleanup_deletes_orphaned_and_reports_missing(self):
        import io
        import os
        from helpers import UPLOAD_DIR, db
        from blueprints.files import run_storage_cleanup

        # Create UPLOAD_DIR if it doesn't exist
        os.makedirs(UPLOAD_DIR, exist_ok=True)

        # 1. Upload a valid file (will exist in DB and disk)
        data = {"file": (io.BytesIO(b"valid file content"), "valid.txt")}
        r = self.c.post("/api/files/upload", content_type="multipart/form-data", data=data)
        self.assertEqual(r.status_code, 200)
        valid_id = r.get_json()["id"]
        valid_disk_path = os.path.join(UPLOAD_DIR, valid_id)
        self.assertTrue(os.path.exists(valid_disk_path))

        # 2. Create an orphaned file on disk (exists on disk but not in DB)
        orphaned_id = "orphanedfile123"
        orphaned_disk_path = os.path.join(UPLOAD_DIR, orphaned_id)
        with open(orphaned_disk_path, "wb") as f:
            f.write(b"orphaned content")
        self.assertTrue(os.path.exists(orphaned_disk_path))

        # 3. Create a missing file reference (exists in DB but not on disk)
        missing_id = "missingfile456"
        with db(write=True) as con:
            con.execute(
                "INSERT INTO files(id, filename, size, mimetype, uploaded) VALUES(?,?,?,?,?)",
                (missing_id, "missing.txt", 100, "text/plain", 123456789)
            )
        missing_disk_path = os.path.join(UPLOAD_DIR, missing_id)
        if os.path.exists(missing_disk_path):
            os.remove(missing_disk_path)

        # 4. Run cleanup
        result = run_storage_cleanup()

        # Check results
        self.assertEqual(result["deleted_count"], 1)
        self.assertIn(orphaned_id, result["deleted_files"])
        self.assertEqual(result["missing_count"], 1)
        self.assertEqual(result["missing_files"][0]["id"], missing_id)
        self.assertEqual(result["missing_files"][0]["filename"], "missing.txt")

        # Verify disk status
        self.assertTrue(os.path.exists(valid_disk_path))
        self.assertFalse(os.path.exists(orphaned_disk_path))

    def test_manual_cleanup_endpoint(self):
        import os
        from helpers import UPLOAD_DIR
        
        os.makedirs(UPLOAD_DIR, exist_ok=True)

        # Create an orphaned file
        orphaned_id = "orphanedfile999"
        orphaned_disk_path = os.path.join(UPLOAD_DIR, orphaned_id)
        with open(orphaned_disk_path, "wb") as f:
            f.write(b"orphaned content")
        
        # Trigger cleanup route
        r = self.c.post("/api/files/cleanup")
        self.assertEqual(r.status_code, 200)
        res = r.get_json()
        
        self.assertTrue(res["deleted_count"] >= 1)
        self.assertIn(orphaned_id, res["deleted_files"])
        self.assertFalse(os.path.exists(orphaned_disk_path))

    def test_scheduler_storage_cleanup_task(self):
        import os
        from scheduler import enqueue_task, execute_queued_task
        from helpers import UPLOAD_DIR, db
        import json

        os.makedirs(UPLOAD_DIR, exist_ok=True)

        # Create an orphaned file
        orphaned_id = "orphanedtask111"
        orphaned_disk_path = os.path.join(UPLOAD_DIR, orphaned_id)
        with open(orphaned_disk_path, "wb") as f:
            f.write(b"orphaned")

        # Enqueue storage_cleanup task
        task_id = enqueue_task("storage_cleanup")

        # Execute the task
        execute_queued_task(task_id)

        # Verify status and result in DB
        with db() as con:
            task = con.execute("SELECT * FROM queued_tasks WHERE id=?", (task_id,)).fetchone()
            self.assertEqual(task["status"], "completed")
            result = json.loads(task["result"])
            self.assertTrue(result["deleted_count"] >= 1)
            self.assertIn(orphaned_id, result["deleted_files"])

    def test_session_cleanup_task(self):
        import time
        import json
        from scheduler import enqueue_task, execute_queued_task
        from helpers import db

        now = int(time.time())
        old_session_id = "old_session_123"
        new_session_id = "new_session_456"

        with db(write=True) as con:
            # Delete any existing sessions to have a clean state for this test
            con.execute("DELETE FROM user_sessions")
            # Session inactive for 31 days (31 * 86400 seconds)
            con.execute(
                "INSERT INTO user_sessions (id, user_agent, ip_address, active_at) VALUES (?, 'agent', '127.0.0.1', ?)",
                (old_session_id, now - 31 * 86400)
            )
            # Session active recently
            con.execute(
                "INSERT INTO user_sessions (id, user_agent, ip_address, active_at) VALUES (?, 'agent', '127.0.0.1', ?)",
                (new_session_id, now)
            )

        # Enqueue session_cleanup task
        task_id = enqueue_task("session_cleanup")

        # Execute the task
        execute_queued_task(task_id)

        # Verify task status and result in DB
        with db() as con:
            task = con.execute("SELECT * FROM queued_tasks WHERE id=?", (task_id,)).fetchone()
            self.assertEqual(task["status"], "completed")
            result = json.loads(task["result"])
            self.assertEqual(result["deleted_count"], 1)

            # Verify that only the old session was purged
            sessions = [row["id"] for row in con.execute("SELECT id FROM user_sessions").fetchall()]
            self.assertNotIn(old_session_id, sessions)
            self.assertIn(new_session_id, sessions)

    def test_foreign_keys_enabled(self):
        from helpers import db
        with db() as con:
            enabled = con.execute("PRAGMA foreign_keys;").fetchone()[0]
            self.assertEqual(enabled, 1)


class CliAdminTests(unittest.TestCase):
    """CLI Administration Tools tests."""

    def test_cli_reset_password_and_disable_2fa(self):
        import subprocess
        import sys
        import sqlite3

        # We need a clean DB path for this subprocess
        test_db = os.path.join(_TMP, "cli_test.db")
        env = os.environ.copy()
        env["DB_PATH"] = test_db
        env["AUTH_PASSWORD"] = "initial_pass"

        # 1. Run CLI to reset password and disable 2FA
        res = subprocess.run(
            [sys.executable, "app.py", "--reset-password", "new_secure_password", "--disable-2fa"],
            env=env,
            capture_output=True,
            text=True
        )
        self.assertEqual(res.returncode, 0)
        self.assertIn("Password successfully reset.", res.stdout)
        self.assertIn("TOTP 2FA successfully disabled.", res.stdout)

        # 2. Check the database directly to verify password_hash and totp_secret
        con = sqlite3.connect(test_db)
        con.row_factory = sqlite3.Row

        # Verify the schema version was tracked in the kv table (the app's
        # source of truth is kv['db_version'], not PRAGMA user_version).
        row = con.execute("SELECT value FROM kv WHERE key='db_version'").fetchone()
        self.assertEqual(row["value"], "13")

        # Check password hash exists and matches
        row = con.execute("SELECT value FROM kv WHERE key='password_hash'").fetchone()
        self.assertTrue(row)
        from werkzeug.security import check_password_hash
        self.assertTrue(check_password_hash(row["value"], "new_secure_password"))

        # Check 2FA is cleared
        row_totp = con.execute("SELECT value FROM kv WHERE key='totp_secret'").fetchone()
        self.assertIsNone(row_totp)
        row_pending = con.execute("SELECT value FROM kv WHERE key='totp_pending'").fetchone()
        self.assertIsNone(row_pending)

        con.close()

    def test_cli_reset_password_too_short(self):
        import subprocess
        import sys

        test_db = os.path.join(_TMP, "cli_test_short.db")
        env = os.environ.copy()
        env["DB_PATH"] = test_db

        res = subprocess.run(
            [sys.executable, "app.py", "--reset-password", "123"],
            env=env,
            capture_output=True,
            text=True
        )
        self.assertEqual(res.returncode, 1)
        self.assertIn("Error: Password must be at least 4 characters long.", res.stdout)


class AccessLoggingTests(unittest.TestCase):
    """Tests for the custom WSGI LoggingMiddleware."""

    def test_logging_middleware_output(self):
        from app import LoggingMiddleware
        import io
        import contextlib
        from unittest.mock import MagicMock
        
        # Create a simple WSGI application mock
        def mock_app(environ, start_response):
            start_response("200 OK", [("Content-Type", "text/plain"), ("Content-Length", "12")])
            return [b"Hello, World"]
            
        mock_flask = MagicMock()
        mock_flask.testing = False
        
        import os
        orig_testing = os.environ.get("TESTING")
        os.environ["TESTING"] = "False"
        
        try:
            middleware = LoggingMiddleware(mock_app, flask_app=mock_flask)
            
            environ = {
                "REQUEST_METHOD": "GET",
                "PATH_INFO": "/some-test-path",
                "QUERY_STRING": "param=123",
                "SERVER_PROTOCOL": "HTTP/1.1",
                "REMOTE_ADDR": "192.168.1.100",
                "REMOTE_USER": "test_user",
                "HTTP_REFERER": "http://referrer.com",
                "HTTP_USER_AGENT": "TestAgent/1.0"
            }
            
            f = io.StringIO()
            with contextlib.redirect_stdout(f):
                response_iterable = middleware(environ, lambda status, headers, exc_info=None: None)
                list(response_iterable)
                
            output = f.getvalue()
            # Assert combined log elements
            self.assertIn("192.168.1.100", output)
            self.assertIn("test_user", output)
            self.assertIn("GET /some-test-path?param=123 HTTP/1.1", output)
            self.assertIn("200", output)
            self.assertIn("12", output)
            self.assertIn("http://referrer.com", output)
            self.assertIn("TestAgent/1.0", output)
        finally:
            if orig_testing is not None:
                os.environ["TESTING"] = orig_testing
            else:
                os.environ.pop("TESTING", None)

    def test_logging_middleware_bypasses_during_testing(self):
        from app import LoggingMiddleware
        import io
        import contextlib
        from unittest.mock import MagicMock
        
        def mock_app(environ, start_response):
            start_response("200 OK", [("Content-Type", "text/plain")])
            return [b"OK"]
            
        mock_flask = MagicMock()
        mock_flask.testing = True
        
        middleware = LoggingMiddleware(mock_app, flask_app=mock_flask)
        environ = {
            "REQUEST_METHOD": "GET",
            "PATH_INFO": "/test",
            "REMOTE_ADDR": "127.0.0.1"
        }
        
        f = io.StringIO()
        with contextlib.redirect_stdout(f):
            response_iterable = middleware(environ, lambda status, headers, exc_info=None: None)
            list(response_iterable)
            
        output = f.getvalue()
        self.assertEqual(output, "")

    def test_logging_middleware_exception_handling(self):
        from app import LoggingMiddleware
        import io
        import contextlib
        from unittest.mock import MagicMock
        
        def mock_app_raises(environ, start_response):
            raise ValueError("Something went wrong")
            
        mock_flask = MagicMock()
        mock_flask.testing = False
        
        import os
        orig_testing = os.environ.get("TESTING")
        os.environ["TESTING"] = "False"
        
        try:
            middleware = LoggingMiddleware(mock_app_raises, flask_app=mock_flask)
            environ = {
                "REQUEST_METHOD": "POST",
                "PATH_INFO": "/error-endpoint",
                "REMOTE_ADDR": "10.0.0.1"
            }
            
            f = io.StringIO()
            with contextlib.redirect_stdout(f):
                with self.assertRaises(ValueError):
                    middleware(environ, lambda status, headers, exc_info=None: None)
                    
            output = f.getvalue()
            self.assertIn("10.0.0.1", output)
            self.assertIn("POST /error-endpoint HTTP/1.1", output)
            self.assertIn("500", output)
        finally:
            if orig_testing is not None:
                os.environ["TESTING"] = orig_testing
            else:
                os.environ.pop("TESTING", None)


if __name__ == "__main__":
    unittest.main(verbosity=2)


