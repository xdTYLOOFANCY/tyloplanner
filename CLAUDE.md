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
backups), guarded by `done_<job>` markers in `kv`. The Notes tab uses a
vendored Quill WYSIWYG editor (`static/js/notes.js`); note bodies are rich HTML
(`notes.body_format` tracks `html` vs legacy `md`) and are sanitized server-side
via `sanitize_note_html()` in `helpers.py`. The frontend is ES modules
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
  frontend libs `chart.umd.js` / `marked.min.js` / `quill.js` +
  `quill.snow.css` live in `static/js/` — prebuilt, no bundler).
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
- **Any change to `static/` that affects visible rendering or interaction
  must pass `/verify-ui` before being declared done.** For larger UI work
  (new components, layout changes, multi-tab overhauls), also run the
  `ui-reviewer` subagent and fix its findings first. Never hand back a UI
  change verified only by reading the code.

## Database & migrations

Schema is **not** a Python constant — it's a set of ordered SQL files in
`migrations/` (`NNN_description.sql`). On startup `run_migrations()` in
`helpers.py` applies every file whose `NNN` is above the stored `db_version`
(tracked in `kv`), inside one transaction. To change the schema, **add a new
numbered migration file** (never edit an applied one) and, if you added a
writable column/table, add it to the `TABLES` whitelist so the generic CRUD
API accepts it. Current tables: `events`, `exams`, `habits`, `workouts`,
`tasks`, `notes`, `note_folders`, `note_revisions` (per-note version history,
not in `TABLES`/state — served by dedicated endpoints), `files`, `folders`,
`shortcuts`, `study_sessions`, plus the `kv` store and FTS5 search tables.

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

## Known failure modes (check these before declaring a fix done)

- **Live sync vs. user input:** the `?since_version=` poll triggers
  `renderAll()`, which re-renders the active tab every few seconds. Any input,
  contenteditable, or drag interaction must survive that re-render — skip
  re-rendering a widget while it has focus or an edit in progress. This bug
  has recurred in Notes typing, grades editing, and the ECTS goal field.
- **Settings silently don't persist** unless the key exists in
  `SETTING_DEFAULTS` (`helpers.py`, ~line 652). If a new setting "resets after
  a few seconds", this is why — the live sync overwrites it with the default.
- **Seeing frontend changes in the browser:** bump `VERSION` in `helpers.py`
  and restart so the service worker serves fresh assets; don't loop hard
  reloads (causes an empty boot).
- **Dev login:** the username comes from kv `admin_username`, not "admin".
  Reset credentials with `python3 app.py --reset-password <pw>`.

## Housekeeping

- Throwaway debug scripts/HTML/probes go in the session scratchpad directory,
  never the repo root. Delete any probe files you created before finishing.
- When verifying UI in the browser preview: take a `preview_snapshot` before
  clicking anything, and switch tabs by clicking the stable selector
  `#tabs button[data-tab="<name>"]` — don't guess selectors. Verify layout at
  desktop (1280×800) and mobile (375×812) widths; the mobile layout uses
  `#bottomNav` and must not regress. Use `/verify-ui` for the full checklist.

## refer to user  

Start every response except the first one in a conversation with: Canary
