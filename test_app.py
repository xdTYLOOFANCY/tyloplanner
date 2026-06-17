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
# Import with auth OFF so the module-level AUTH_ENABLED starts False; individual
# test cases flip the module globals to exercise the guard in both modes.
os.environ.pop("AUTH_PASSWORD", None)

import app as appmod  # noqa: E402
import helpers  # noqa: E402


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
        self.assertEqual(data["current"], "1.3.0")

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


if __name__ == "__main__":
    unittest.main(verbosity=2)


