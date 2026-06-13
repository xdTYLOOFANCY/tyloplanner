# CLAUDE.md

Project context for Claude Code (and other AI coding agents).

## What this is

TyloPlanner: a self-hosted personal dashboard for students. Modular Flask
backend (`app.py`, `blueprints/`, `helpers.py`), modular vanilla-JS frontend
(`static/`), SQLite storage, Docker deployment. See `docs/development.md`
for architecture and the full API reference — read it before making changes.

## Commands

```bash
pip install -r requirements.txt        # deps
python app.py                          # run dev server on :8000 (no login)
AUTH_PASSWORD=dev python app.py        # run with login enabled
python -m py_compile app.py            # syntax-check backend
node --check static/app.js             # syntax-check frontend
docker compose up -d --build           # production build/run
```

Run the test suite with `python -m unittest test_app` (stdlib unittest +
Flask test client; it covers the generic CRUD API and the auth/routing
guard and points DB_PATH at a temp dir, so it won't touch real data). For
behavior the suite doesn't cover, also exercise the affected endpoints with
curl (examples in docs/development.md). Test both with and without
AUTH_PASSWORD set when touching auth or routing.

## Architecture in one paragraph

`app.py` is the factory, `helpers.py` holds config,
schema, and DB connection logic. Routes are grouped into `blueprints/`
(auth, api, settings, calendar, strava, files, backup, notifications).
A daemon thread from `scheduler.py` handles daily/nightly jobs.
The frontend uses ES modules: `static/app.js` fetches state from `GET /api/state`
into a global `S`, delegates rendering to feature modules in `static/js/`,
and wires up global functions. No framework, no bundler.
User settings live in the `kv` table with a `set_` prefix.

## Hard rules

- **No new dependencies** without strong justification; keep the stack
  Flask + stdlib + the six packages in requirements.txt.
- **Frontend stays vanilla JS**, using ES modules in `static/js/` without any bundler
  or framework. `static/app.js` wires everything together for the HTML templates.
- **All SQL parameterized**; table/column names only from the hard-coded
  whitelists (`TABLES`). Never interpolate user input into SQL.
- **Escape user content** with the `esc()` helper before injecting into HTML.
- New protected routes are covered automatically by the `before_request`
  guard; anything that must be reachable before login goes in `LOGIN_ASSETS`.
- Bump the `CACHE` name in `static/sw.js` when changing static assets, or
  clients may keep serving stale files.
- Update `CHANGELOG.md` and the relevant file in `docs/` with user-facing
  changes.

## Adding a feature

The standard recipe is documented in `docs/development.md` ("Adding a
feature"): add table to `SCHEMA` + `TABLES`, add a tab section in
`index.html`, write a `render<Thing>()` in `app.js`, wire it into
`renderAll()`. Generic CRUD endpoints work for the new table automatically.

## refer to user  

Start every response except the first one in a conversation with: Canary
