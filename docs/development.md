# Development guide

TyloPlanner is deliberately small and dependency-light so you can read all
of it and bend it to your needs.

## Architecture

```
Browser (static/app.js, vanilla JS)
   │  fetch JSON
   ▼
Flask (app.py) ── background thread (notifications, auto-sync, backups)
   │
   ▼
SQLite (data/tyloplanner.db)
```

- **One backend file.** `app.py` contains config, schema, auth, the REST
  API, ICS import/export, Strava OAuth and the scheduler. ~700 lines.
- **One frontend, no build step.** `static/app.js` fetches the full app
  state (`GET /api/state`), keeps it in a global `S`, and re-renders
  per-section. Edit a file, refresh the browser, done.
- **One database.** Tables are created automatically from `SCHEMA` on first
  run. The `kv` table holds settings, tokens and scheduler bookkeeping.

## Running in development

```bash
pip install -r requirements.txt
python app.py                      # no login
AUTH_PASSWORD=dev python app.py    # with login
```

The server is plain Flask behind waitress; there is no hot reload — restart
after backend changes. Frontend changes only need a browser refresh (force
refresh if the service worker cached an old asset, or bump `CACHE` in
`static/sw.js`).

## API reference

All endpoints return JSON and require a session cookie when auth is enabled
(401 otherwise). CRUD is generic over the tables
`events, exams, habits, workouts, tasks, notes`:

| Method & path | Purpose |
|---|---|
| `GET /api/state` | Full application state (all tables + integration status). |
| `POST /api/<table>` | Create a row; body = whitelisted columns. Returns `{id}`. |
| `PUT /api/<table>/<id>` | Update whitelisted columns. |
| `DELETE /api/<table>/<id>` | Delete a row. |
| `POST /api/habits/<id>/toggle` | Toggle a habit for `{date}`. |
| `GET/POST /api/settings` | Read / write user settings (ntfy, sync, …). |
| `POST /api/notify/test` | Send a test ntfy push. |
| `POST /api/backup/now` · `POST /api/restore` | Manual backup / restore. |
| `POST /api/ics/import` · `POST /api/ics/sync-now` · `DELETE /api/ics` | Calendar import, forced auto-sync, remove imported events. |
| `GET /calendar.ics?key=…` | iCal feed (secret key instead of cookies). |
| `POST /api/2fa/setup` · `GET /api/2fa/qr` · `POST /api/2fa/enable` · `POST /api/2fa/disable` | TOTP lifecycle. |
| `POST /api/strava/sync` · `POST /api/strava/disconnect` · `GET /strava/connect` · `GET /strava/callback` | Strava OAuth + sync. |
| `POST /login` · `POST /login/2fa` · `GET /logout` | Auth flow (form posts). |

Column whitelists live in the `TABLES` dict in `app.py` — the generic CRUD
ignores anything not listed there.

## Adding a feature (the typical recipe)

Example: a water-intake tracker.

1. **Schema:** add a table to `SCHEMA` and its writable columns to `TABLES`
   in `app.py`. Restart — the table is created automatically.
2. **UI:** add a nav button + `<section id="tab-water">` in
   `static/index.html`, then a `renderWater()` in `static/app.js` and call
   it from `renderAll()`. Use the existing `api()` helper for requests.
3. Generic CRUD endpoints already work for your new table — no backend
   routes needed unless you want custom logic.
4. Want it in the analytics tab? Aggregate in `renderAnalytics()` and use
   the `barChart()` helper.

## The background scheduler

`scheduler_loop()` (a daemon thread) calls `scheduler_tick()` every minute.
Daily jobs use `done_<job>` markers in the `kv` table so they fire once per
day even across restarts. Add your own job by appending a block to
`scheduler_tick()` following the same pattern.

## Conventions

- Keep dependencies minimal — the stdlib and the six packages in
  `requirements.txt` go a long way.
- Frontend stays framework-free ES5-ish JavaScript; escape user content
  with the `esc()` helper when injecting HTML.
- SQL: always parameterized; table/column names only ever come from the
  hard-coded whitelists.
