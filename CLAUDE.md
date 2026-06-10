# CLAUDE.md

Project context for Claude Code (and other AI coding agents).

## What this is

TyloPlanner: a self-hosted personal dashboard for students. Single Flask
backend (`app.py`), vanilla-JS frontend (`static/`), SQLite storage, Docker
deployment. See `docs/development.md` for architecture and the full API
reference — read it before making changes.

## Commands

```bash
pip install -r requirements.txt        # deps
python app.py                          # run dev server on :8000 (no login)
AUTH_PASSWORD=dev python app.py        # run with login enabled
python -m py_compile app.py            # syntax-check backend
node --check static/app.js             # syntax-check frontend
docker compose up -d --build           # production build/run
```

There is no test suite yet; verify changes by running the server and
exercising the affected endpoints with curl (examples in docs/development.md).
Test both with and without AUTH_PASSWORD set when touching auth or routing.

## Architecture in one paragraph

`app.py` holds everything: config from env vars, SQLite schema (auto-created),
session auth + optional TOTP 2FA, a generic CRUD API whitelisted via the
`TABLES` dict, ICS calendar import/export, Strava OAuth, ntfy notifications,
and a background scheduler thread (daily agenda push, habit nudge, calendar
auto-sync, nightly backups). `static/app.js` fetches the full state from
`GET /api/state` into a global `S` and re-renders per section; no framework,
no build step. User settings live in the `kv` table with a `set_` prefix.

## Hard rules

- **No new dependencies** without strong justification; keep the stack
  Flask + stdlib + the six packages in requirements.txt.
- **Frontend stays vanilla JS** (ES5-ish style used throughout), no bundler,
  no framework, single `app.js`.
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
