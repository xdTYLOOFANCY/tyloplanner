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

- **Modular backend.** `app.py` builds the Flask app. `helpers.py` provides DB access, schemas, and config. `blueprints/` holds feature-specific route groups. `scheduler.py` runs background jobs.
- **Modular frontend, no build step.** `static/app.js` fetches the full app
  state (`GET /api/state`), keeps it in a global `S`, and coordinates rendering
  using ES modules in `static/js/`. Edit a file, refresh the browser, done.
- **Offline Mode & Sync Queue.** Uses a service worker to cache frontend assets, and an IndexedDB database `tyloplanner_offline` to cache the application state (`state_cache`) and queue modifications (`api_queue`) offline. When the network connection is restored, the client automatically replays queued mutations sequentially to the backend.
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

## Tests

`test_app.py` drives Flask's built-in test client through the stdlib
`unittest` runner (no extra dependencies). It covers the generic CRUD API
(create/update/delete, the `TABLES` column whitelist, habit toggle + cascade)
and the `before_request` routing guard in both auth-disabled and auth-enabled
modes (401 on the API, redirect to `/login` for pages, the key-protected
`/calendar.ics` feed, and the full login/logout session flow).

```bash
python -m unittest test_app          # run all tests
python -m unittest test_app -v       # verbose, one line per test
python -m unittest test_app.GuardAuthEnabledTests   # one class
```

The tests point `DB_PATH`/`BACKUP_DIR` at a temp directory before importing
`app`, so running them never touches your real `data/tyloplanner.db`. When you
add an endpoint or table, add a case here.

## API reference

All endpoints return JSON and require a session cookie when auth is enabled
(401 otherwise). CRUD is generic over the tables
`events, exams, habits, workouts, tasks, notes, study_sessions`:

| Method & path | Purpose |
|---|---|
| `GET /api/state` | Full application state (all tables + integration status). |
| `POST /api/<table>` | Create a row; body = whitelisted columns. Returns `{id}`. |
| `PUT /api/<table>/<id>` | Update whitelisted columns. |
| `DELETE /api/<table>/<id>` | Delete a row. |
| `POST /api/habits/<id>/toggle` | Toggle a habit for `{date}`. |
| `GET/POST /api/settings` | Read / write user settings (ntfy, sync, …). |
| `POST /api/notify/test` | Send a test notification (via ntfy and Web Push). |
| `GET /api/push/public-key` | Get the VAPID public key for Web Push. |
| `POST /api/push/subscribe` | Register browser subscription for Web Push. |
| `POST /api/push/unsubscribe` | Unsubscribe browser subscription from Web Push. |
| `POST /api/backup/now` · `POST /api/restore` | Manual backup / restore (JSON payload). |
| `GET /api/backups` | List all available automatic nightly backups. |
| `POST /api/backups/<filename>/restore` | Restore database data from an automatic nightly backup. |
| `POST /api/files/upload` | Upload a file (multipart `file` field). Supports optional `folder_id` form field. Returns `{id, filename, size}`. |
| `GET /api/files/<id>/download` | Download a file as an attachment. |
| `GET /api/files/<id>/view` | View/stream a file inline with correct mimetype (for media previews). |
| `DELETE /api/files/<id>` | Delete a file (removes DB row and disk file). |
| `DELETE /api/folders/<id>` | Delete a folder recursively (relocating child files and folders to the parent directory). |
| `POST /api/files/move` | Batch move multiple files to a folder. Payload: `{file_ids: [...], folder_id: ...}`. |
| `POST /api/files/cleanup` | Run manual storage reconciliation and cleanup of orphaned files. |
| `POST /api/ics/import` · `POST /api/ics/sync-now` · `DELETE /api/ics` | Calendar import, forced auto-sync, remove imported events. |
| `GET /calendar.ics?key=…` | iCal feed (secret key instead of cookies). |
| `POST /api/2fa/setup` · `GET /api/2fa/qr` · `POST /api/2fa/enable` · `POST /api/2fa/disable` | TOTP lifecycle. |
| `POST /api/strava/sync` · `POST /api/strava/disconnect` · `GET /strava/connect` · `GET /strava/callback` | Strava OAuth + sync. |
| `POST /login` · `POST /login/2fa` · `GET /logout` | Auth flow (form posts). |

Column whitelists live in the `TABLES` dict in `helpers.py` — the generic CRUD
ignores anything not listed there.

## Adding a feature (the typical recipe)

Example: a water-intake tracker.

1. **Schema:** add a table to `SCHEMA` and its writable columns to `TABLES`
   in `helpers.py`. Restart — the table is created automatically.
2. **UI:** add a nav button + `<section id="tab-water">` in
   `static/index.html`. Create `static/js/water.js` with a `renderWater()` function
   and export it. Import it in `static/app.js`, then call it from `renderAll()`. Use the existing `api()` helper for requests.
3. Generic CRUD endpoints already work for your new table — no backend
   routes needed unless you want custom logic.
4. Want it in the analytics tab? Aggregate in `renderAnalytics()` and use
   the `barChart()` helper.

## The background scheduler

`scheduler_loop()` (a daemon thread in `scheduler.py`) calls `scheduler_tick()`
every minute. Daily jobs use `done_<job>` markers in the `kv` table so they
fire once per day even across restarts. Add your own job by appending a block to
`scheduler_tick()` following the same pattern.

## Conventions

- Keep dependencies minimal — the stdlib and the eight packages in
  `requirements.txt` go a long way.
- Frontend stays framework-free ES5-ish JavaScript; escape user content
  with the `esc()` helper when injecting HTML.
- SQL: always parameterized; table/column names only ever come from the
  hard-coded whitelists.

## Mobile / responsive design

The app is a single responsive layout, not a separate mobile build. The
hard rule: **desktop must stay unchanged.** Scope every mobile tweak so it
can't leak upward.

- **The breakpoint is `640px`.** `≤640px` is "mobile" (bottom nav, FAB,
  single-column). `≥641px` is "desktop". Tablet gets a couple of nudges in
  the `641–768px` range. Put mobile-only CSS inside `@media (max-width: 640px)`
  and mobile-only JS behind `window.matchMedia('(max-width: 640px)').matches`.
- **Desktop nav vs. mobile nav.** The top `.nav-tabs` is hidden ≤640px and the
  fixed `#bottomNav` + a global `#globalFab` take over. Elements that should
  only appear on one side use the `.header-desktop-only` / `.mobile-only`
  helper classes.
- **Planner.** Multi-day time-grid views are unreadable when 7 columns share a
  phone screen, so on mobile each `.day-col` inside `.day-columns.multiday`
  gets `80vw` width with `scroll-snap`, the grid scrolls horizontally, and the
  `.time-axis` is `position: sticky; left: 0`. `renderPlanner()` tags the
  container with `multiday` only when more than one day is shown; the planner
  also defaults to **Day** view on phones. None of this affects desktop (the
  `.multiday` rules live in the mobile media query).
- **Calendar layout (desktop).** Timed events are positioned by
  `calculateOverlaps()` in `planner.js`: pass 1 assigns each event to the
  leftmost free column (greedy fit); pass 2 lets every event span rightward
  across adjacent columns until it reaches a time-overlapping event, so
  non-conflicting events widen to fill free space (Google-Calendar style).
  Each card renders `.event-time` (small) above `.event-title` (bold) with an
  optional `.event-loc`; the drag-preview and resize handlers live-update the
  time by targeting `.event-time`. Today gets a `.today-circle` in the header
  and a `rgba(var(--accent-rgb), 0.04)` wash on its column; month-view chips are
  solid type-colored pills. All calendar colors come from theme CSS variables —
  never hard-code one.
- **Notes editor.** On phones the editor is single-pane: `applyNoteLayout()`
  forces `isSplit = false` so edit mode is the textarea and read mode is the
  rendered preview (never side-by-side). Do **not** re-introduce a
  `#noteView { display: none !important }` rule — it silently breaks Read Mode.
- **Sticky + transforms don't mix.** `position: sticky` breaks inside an
  ancestor with a `transform`/`filter`. The tab-switch animation is therefore
  opacity-only (`tabFadeIn`); keep it that way or the planner axis unsticks.
- **Touch & iOS.** Aim for ≥44px tap targets (there's a blanket rule in the
  mobile block). Inputs that can receive focus should be ≥16px font to avoid
  iOS auto-zoom. Respect the safe area with `env(safe-area-inset-bottom)`.
- **Verify both widths.** After any UI change, check it at ~375px *and* at
  desktop width before calling it done.
