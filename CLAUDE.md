# CLAUDE.md

Project context for Claude Code (and other AI coding agents).

## What this is

TyloPlanner: a self-hosted personal dashboard for students (planner/calendar,
tasks, notes, exams & grades, habits, workouts, study timer, files). Modular
Flask backend (`app.py`, `blueprints/`, `helpers.py`, `scheduler.py`), modular
vanilla-JS frontend (`static/`), SQLite storage, Docker deployment. It's a PWA
with offline support. Landing page and feature overview at
**https://tyloplanner.brambiemans.com/**. See `docs/development.md` for the
full architecture and API reference — read it before making changes.

## Commands

```bash
pip3 install -r requirements.txt       # deps
python3 app.py                         # run dev server on :8000 (no login)
AUTH_PASSWORD=dev python3 app.py       # run with login enabled
python3 -m py_compile app.py           # syntax-check backend (also runs automatically after every edit)
node --check static/app.js             # syntax-check frontend (also runs automatically after every edit)
docker compose up -d --build           # production build/run
python3 app.py --reset-password <pw>   # reset login password from the host
python3 app.py --disable-2fa           # disable TOTP 2FA from the host
```

Run the test suite with `python3 -m unittest test_app` (stdlib unittest +
Flask test client; it covers the generic CRUD API and the auth/routing
guard and points `DB_PATH`/`BACKUP_DIR` at a temp dir, so it won't touch real
data). For behavior the suite doesn't cover, also exercise the affected
endpoints with curl (examples in `docs/development.md`). Test both with and
without `AUTH_PASSWORD` set when touching auth or routing.

## Architecture in one paragraph

`app.py` is the factory (WSGI middleware, security headers, gzip, error
handler, welcome-note/shortcut seeding). `helpers.py` holds config, DB
connection logic, the migration runner, the `kv` store, and the `TABLES`
column whitelist. Routes are grouped into `blueprints/` (auth, api, settings,
calendar, strava, files, backup, notifications). A daemon thread from
`scheduler.py` runs per-minute jobs (reminders, ICS auto-sync, nightly
backups), guarded by `done_<job>` markers in `kv`. The frontend is ES modules
with no bundler: `static/app.js` is the orchestrator — it pulls global state
`S` from `GET /api/state` via `static/js/state.js` (which also drives
incremental live sync with `?since_version=`), delegates rendering to feature
modules in `static/js/` (`planner`, `notes`, `tasks`, `exams`, `habits`,
`workouts`, `study_timer`, `files`, `dashboard`, `analytics`, `settings`, …),
and wires up the global functions the HTML calls. Offline support lives in
`static/sw.js` (asset cache) + `static/js/offline.js` (IndexedDB
`tyloplanner_offline`: `state_cache` + an `api_queue` replayed on reconnect).
User settings live in the `kv` table with a `set_` prefix.

## Hard rules

- **No new dependencies** without strong justification; keep the stack
  Flask + stdlib + the eight packages in `requirements.txt` (vendored
  frontend libs `chart.umd.js` / `marked.min.js` live in `static/js/`).
- **Frontend stays vanilla JS**, using ES modules in `static/js/` without any
  bundler or framework. `static/app.js` wires everything together for the HTML
  templates.
- **All SQL parameterized**; table/column names only from the hard-coded
  whitelist (`TABLES` in `helpers.py`). Never interpolate user input into SQL.
- **Escape user content** with the `esc()` helper (`static/js/utils.js`) before
  injecting into HTML.
- New protected routes are covered automatically by the `before_request`
  guard in `blueprints/auth.py`; anything that must be reachable before login
  goes in `LOGIN_ASSETS`.
- Asset versioning is automated on startup. No need to manually bump cache
  versions in `static/sw.js` or query params in `index.html`.
- Update `CHANGELOG.md` and the relevant file in `docs/` with user-facing
  changes. Use `/changelog-entry` to draft and prepend a versioned entry
  automatically. The app version string is `VERSION` in `helpers.py`.

## Database & migrations

Schema is **not** a Python constant — it's a set of ordered SQL files in
`migrations/` (`NNN_description.sql`). On startup `run_migrations()` in
`helpers.py` applies every file whose `NNN` is above the stored `db_version`
(tracked in `kv`), inside one transaction. To change the schema, **add a new
numbered migration file** (never edit an applied one) and, if you added a
writable column/table, add it to the `TABLES` whitelist so the generic CRUD
API accepts it. Current tables: `events`, `exams`, `habits`, `workouts`,
`tasks`, `notes`, `note_folders`, `files`, `folders`, `shortcuts`,
`study_sessions`, plus the `kv` store and FTS5 search tables.

## Adding a feature

The standard recipe (full version in `docs/development.md` → "Adding a
feature"):

1. **Schema:** add a `migrations/NNN_*.sql` creating the table, and list its
   writable columns in `TABLES` (`helpers.py`). Restart to apply. Generic CRUD
   endpoints (`POST/PUT/DELETE /api/<table>`) then work automatically.
2. **UI:** add a nav button + `<section id="tab-thing">` in
   `static/index.html`, create `static/js/thing.js` exporting a
   `renderThing()`, import it in `static/app.js`, and call it from
   `renderAll()`. Use the existing `api()` helper for requests.
3. Add coverage in `test_app.py` for any new endpoint or table.

## refer to user  

Start every response except the first one in a conversation with: Canary
