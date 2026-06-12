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
import warnings

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
        for t in list(helpers.TABLES) + ["habit_log"]:
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

    def test_settings_update(self):
        r = self.c.post("/api/settings", json={"accent_color": "#ff0000"})
        self.assertEqual(r.status_code, 200)
        j = self.c.get("/api/settings").get_json()
        self.assertEqual(j["accent_color"], "#ff0000")


if __name__ == "__main__":
    unittest.main(verbosity=2)

