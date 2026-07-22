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
- **One database.** The schema is built from ordered SQL files in
  `migrations/` (`NNN_*.sql`), applied on startup by `run_migrations()` in
  `helpers.py` (tracked via `db_version` in `kv`). The `kv` table holds
  settings, tokens and scheduler bookkeeping.

## Running in development

```bash
pip install -r requirements.txt
python app.py                      # no login
AUTH_PASSWORD=dev python app.py    # with login
```

The server is plain Flask behind waitress; there is no hot reload — restart
after backend changes. Frontend changes are picked up automatically: on
startup `get_asset_version()` (`helpers.py`) hashes `static/` and stamps the
version into `sw.js` and the `index.html` asset query strings, so the service
worker serves fresh assets after a restart — you never bump `CACHE` by hand.

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
`events, exams, habits, workouts, tasks, notes, note_folders, study_sessions,
playlists, playlist_tracks, files, folders, shortcuts`:

| Method & path | Purpose |
|---|---|
| `GET /api/state` | Full application state (all tables + integration status). |
| `POST /api/<table>` | Create a row; body = whitelisted columns. Returns `{id}`. |
| `PUT /api/<table>/<id>` | Update whitelisted columns. |
| `DELETE /api/<table>/<id>` | Delete a row. |
| `POST /api/habits/<id>/toggle` | Toggle a habit for `{date}`. |
| `GET/POST /api/settings` | Read / write user settings (ntfy, sync, …). |

Exams carry three optional organisation columns (migration 019):
`tracker_id` (which study/tracker the exam belongs to), `tags`
(comma-separated custom tag names), and `academic_year` (start year of the
academic year as a string, e.g. `"2025"` = 2025–2026; when null the frontend
guesses it from the date with a September cutoff). The tracker list
(`[{id, name, goal}]`, goal = target ECTS) lives in the `exam_trackers`
setting and the global tag list in `exam_tags`, both JSON strings — there
are no dedicated endpoints; the generic CRUD + settings API cover it.

| `POST /api/notify/test` | Send a test notification (via ntfy and Web Push). |
| `GET /api/push/public-key` | Get the VAPID public key for Web Push. |
| `POST /api/push/subscribe` | Register browser subscription for Web Push. |
| `POST /api/push/unsubscribe` | Unsubscribe browser subscription from Web Push. |
| `GET /api/timers` | List running timers (`fire_at` in the future) so any device can pick up a timer started elsewhere. |
| `POST /api/timer` · `DELETE /api/timer/<id>` | Create / cancel a timer. The `timers` table is the source of truth (a timer survives the tab closing and syncs across devices on load); the browser mirrors it in localStorage for the live countdown + offline use. `push=1` rows also get a phone push from the scheduler when they fire. Not in `TABLES`. |
| `POST /api/backup/now` · `POST /api/restore` | Manual backup / restore (JSON payload). |
| `GET /api/backups` | List all available automatic nightly backups. |
| `POST /api/backups/<filename>/restore` | Restore database data from an automatic nightly backup. |
| `GET /api/export/archive?categories=a,b` | Download a `.zip` export of the selected categories (`events,tasks,notes,exams,habits,workouts,study_sessions,shortcuts,files,settings`; omit for all). Contains `data.json` plus `uploads/<id>` blobs when `files` is included. |
| `POST /api/import/archive?mode=merge\|replace&categories=a,b` | Import an export archive (multipart `file`). `merge` adds missing rows/settings/blobs (existing ids kept); `replace` deletes the selected categories first and restores them from the archive. |
| `POST /api/files/upload` | Upload a file (multipart `file` field). Supports optional `folder_id` form field. Returns `{id, filename, size}`. Rejected with **413** once the `storage_quota_gb` limit is reached. |
| `GET /api/files/<id>/download` | Download a file as an attachment. |
| `GET /api/files/<id>/view` | View/stream a file inline with correct mimetype (supports HTTP Range for media seeking). |
| `GET /api/files/<id>/preview` | Server-rendered HTML preview for `.docx`, `.xlsx`, and `.csv`/`.tsv` (stdlib converters; shown in a sandboxed iframe). **415** for other types. |
| `POST /api/files/trash` | Soft-delete items. Payload: `{file_ids: [...], folder_ids: [...]}` — folders are trashed recursively. Sets `deleted` (ms epoch) on the rows. |
| `POST /api/files/restore` | Un-trash items (same payload). Restoring a file resurrects its (trashed) ancestor folders so it lands somewhere visible. |
| `POST /api/files/trash/empty` | Permanently delete everything in the trash (rows + disk). The scheduler auto-purges entries older than `trash_retention_days` daily. |
| `DELETE /api/files/<id>` | Permanently delete a file (removes DB row and disk file). Used from Trash ("delete forever"). |
| `DELETE /api/folders/<id>` | Permanently delete a folder **and all of its contents** recursively. Used from Trash; the soft path is `POST /api/files/trash`. |
| `POST /api/files/move` | Batch move files and/or folders. Payload: `{file_ids: [...], folder_ids: [...], folder_id: <target or null>}`. Rejects moving a folder into its own subtree. |
| `POST /api/files/zip` | Download selected items as a zip (folder structure preserved). JSON body or form field `payload` (form POST → native browser download; this endpoint is CSRF-exempt since it mutates nothing). |
| `GET /api/storage` | Storage stats: quota, live/trash file bytes, notes text size, DB size, backups size, uploads-dir size, and the quota/retention settings. |
| `POST /api/files/cleanup` | Run manual storage reconciliation and cleanup of orphaned files. |
| `GET /api/files/<id>/art` | Embedded album art of an audio file (ID3 APIC / FLAC picture / MP4 covr / Vorbis picture); an SVG placeholder when none. |
| `POST /api/music/scan` | Extract audio metadata (duration, title, artist, album — via mutagen) into the `files` table for audio files that lack it; `{"force": true}` rescans all. Runs automatically on audio upload and lazily from the Music tab. |
| `POST /api/playlists/<id>/add-tracks` | Append tracks to a playlist. Payload: `{file_ids: [...]}`; unknown file ids are skipped. |
| `POST /api/playlists/<id>/reorder` | Rewrite track order. Payload: `{tracks: [playlist_track_id, ...]}` in the new order. |
| `POST /api/ics/import` · `POST /api/ics/sync-now` · `DELETE /api/ics` | Calendar import, forced auto-sync, remove imported events. |
| `GET /calendar.ics?key=…` | iCal feed (secret key instead of cookies). |
| `POST /api/2fa/setup` · `GET /api/2fa/qr` · `POST /api/2fa/enable` · `POST /api/2fa/disable` | TOTP lifecycle. |
| `POST /api/strava/sync` · `POST /api/strava/disconnect` · `GET /strava/connect` · `GET /strava/callback` | Strava OAuth + sync. |
| `POST /login` · `POST /login/2fa` · `GET /logout` | Auth flow (form posts). |

Column whitelists live in the `TABLES` dict in `helpers.py` — the generic CRUD
ignores anything not listed there.

## Adding a feature (the typical recipe)

Example: a water-intake tracker.

1. **Schema:** add a new `migrations/NNN_*.sql` file that creates the table
   (never edit an already-applied migration), and add its writable columns to
   the `TABLES` whitelist in `helpers.py`. Restart — the migration runs
   automatically.
2. **UI:** add a nav button + `<section id="tab-water">` in
   `static/index.html`. Create `static/js/water.js` with a `renderWater()` function
   and export it. Import it in `static/app.js`, then call it from `renderAll()`. Use the existing `api()` helper for requests.
3. Generic CRUD endpoints already work for your new table — no backend
   routes needed unless you want custom logic.
4. Want charts? Use the shared helpers in `static/js/charts.js`
   (`createChart()`, `getPastMonths()`, `noGridOptions()`) and register your
   render with `registerChartRerender()` so theme switches redraw it.

## The background scheduler

`scheduler_loop()` (a daemon thread in `scheduler.py`) calls `scheduler_tick()`
every minute. Daily jobs use `done_<job>` markers in the `kv` table so they
fire once per day even across restarts, and run via `submit_job()` on a small
thread pool so a slow job (calendar sync, backup) never delays the reminder
checks. Add your own job by appending a block to `scheduler_tick()` following
the same pattern.

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

- **Two breakpoints.** `≤900px` is "drawer land": the top `.nav-tabs` and
  `.nav-actions` are hidden and navigation is the off-canvas drawer (see
  below). `≤640px` additionally gets the phone-density tweaks (FAB,
  single-column, larger touch targets); tablets get a couple of nudges in
  the `641–768px` range. Put phone-only CSS inside `@media (max-width: 640px)`
  and phone-only JS behind `window.matchMedia('(max-width: 640px)').matches`.
- **Mobile navigation is the drawer.** ≤900px the same `#sidebar` markup
  renders as an off-canvas panel (Claude-app style): `transform:
  translateX(-105%)` at rest, slid in by `body.drawer-open`, with a
  `#drawerScrim` behind it. It opens via the header hamburger (`#drawerBtn`)
  or an edge swipe from the left (finger-tracked in `sidebar.js`), and closes
  on scrim tap, swipe-left, Escape, or navigation. The old `#bottomNav` +
  `bottom_nav.js` are gone. The header's top-right `#quickAddBtn` opens
  `#quickAddMenu` (new event / to-do / note / calendar) which calls existing
  globals via `window.quickAddGo()`. A `#globalFab` still provides per-tab
  add actions ≤640px. Elements that should only appear on one side use the
  `.header-desktop-only` / `.mobile-only` helper classes.
- **Touch devices can't drag-resize planner events** — `.resize-handle` is
  hidden under `@media (pointer: coarse)` (capability-gated, not width-gated,
  so desktop-sized tablets are covered); events are resized via the edit
  modal instead.
- **Tab-switch animation** is a crossfade scoped to `<main>` via
  `view-transition-name: main-content` — nav chrome (header, sidebar, drawer)
  never moves. The old directional root slide is gone;
  `navigateWithTransition()` ignores its direction argument.
- **Desktop sidebar layout (optional).** On desktop only, users can switch from
  the top tab bar to a left `#sidebar` via **Settings → Appearance → Navigation
  layout** (`nav_layout` setting: `topbar` | `sidebar`). `applyNavLayout()` in
  `theme.js` sets `data-nav-layout` on `<html>`/`<body>`; the CSS is gated behind
  `@media (min-width: 901px)`, so it can never affect the ≤640px mobile bottom
  nav. In sidebar mode the whole `.top-nav-container` header is hidden and
  `body` gets `padding-left: var(--sidebar-w)` so the fixed rail sits in the
  gutter and `main`'s `max-width` + `margin:auto` still centres the content in
  the space that's left (balanced on ultrawide/4K). **Gotcha:** `--sidebar-w`
  and the offset padding must live on the *same* element (`body`) — custom
  properties don't inherit upward, so defining the var on `body` and consuming
  it on `html` silently resolves the padding to 0 and the rail overlaps the
  content. Panes sized with `calc(100vh - 130px)` (notes editor) assume the
  top-bar chrome; sidebar mode overrides them with `- 76px` equivalents in the
  same media block. The planner grid instead measures its real offset after
  each render (`sizeTimeGrid()` in `planner.js` sets `--planner-grid-h`), so it
  fits both layouts and any control wrapping. The chosen layout is cached in
  `localStorage` (`tylo-nav-layout`) and applied by a tiny pre-paint script at
  the top of `<body>` so there's no layout flash before `/api/settings` loads;
  the server setting stays the source of truth and re-corrects the cache on
  boot. The sidebar reuses the existing `data-tab` buttons —
  `sidebar.js` forwards clicks to the `#tabs` buttons and mirrors their `.active`
  state (same pattern as `bottom_nav.js`), so the single tab-switch handler in
  `app.js` is never forked. Its collapse (icon-only) state is a client-only
  `localStorage` preference (`tylo-sidebar-collapsed`), not a DB setting;
  **⌘/Ctrl+\\** toggles it (sidebar mode only), collapsed items get native
  `title` tooltips, and labels fade via `opacity` instead of `display:none` so
  buttons keep their accessible names. All sidebar motion is disabled under
  `prefers-reduced-motion`. The
  Settings update badge is targeted by the `.settings-update-badge` class, and
  log-out visibility by the `body.auth-enabled` class (set in `settings.js`), so
  both the top-bar and sidebar copies toggle together.
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
  Each card renders the bold `.event-title` first (it **wraps** so the full name
  stays readable), then `.event-time`, then an optional `.event-loc`; the
  drag-preview and resize handlers live-update the time by targeting
  `.event-time`. Today gets a `.today-circle` in the header and a
  `rgba(var(--accent-rgb), 0.04)` wash on its column; month-view chips are solid
  type-colored pills. The desktop grid fills the viewport (`height: calc(100vh -
  130px)`) and the planner opens scrolled to ~7am (`renderPlanner()` and
  `scrollToCurrentTimeLineIfVisible()`) so most of the day shows at a glance.
  All calendar colors come from theme CSS variables — never hard-code one.
- **Planner toolbar & modal focus.** The `.weeknav` toolbar wraps (`flex-wrap`)
  on mobile instead of side-scrolling, and `.planner-search` goes full-width
  there. Search results call `navigateToAndEditEvent(id, date, false)` — the
  third arg is `false`, so it jumps to the event and pulses it (`.event-flash`)
  **without** opening the editor; the dashboard omits the arg to keep opening it.
  The event modal's `<h3>` has `autofocus` so the native `<dialog>.showModal()`
  lands focus on the heading, not the title input — `openAdd()`/`editEvent()`
  only focus the title on desktop (`isMobileViewport()` guard) so phones don't
  pop the keyboard before the user picks a field.
- **Calendar popovers & go-to-date.** Clicking an event opens a read popover
  (`showEventPopover`) rather than the editor; the month "+N more" chip opens a
  day list (`showDayPopover`). Both use one floating `.cal-popover` positioned by
  `openPopover()` (flips/clamps to the viewport, closes on outside-click/Esc).
  The toolbar's `#plannerGoToDate` input calls `goToDate()`, which reuses
  `setDateOffsetForDate()` (shared with search-navigation) and is re-synced to
  the first visible date on every `renderPlanner()`.
- **Recurrence model.** Recurrences are expanded client-side by `getInstances()`
  (`planner.js`) from the master event row — there are no per-occurrence rows.
  Fields: `recurrence` (none/daily/weekly/monthly/yearly), `recurrence_interval`
  ("every N"), `recurrence_days` (CSV of JS `getDay()` indices for weekly
  multi-day), and either `recurrence_until` (end date) or `recurrence_count`
  (end after N — counted from the start incl. excluded, like RRULE COUNT).
  `excluded_dates` (CSV of ISO dates) skips single occurrences. `reminder_offset`
  is **not** a plain int — it's `-1` (none) or a CSV of minute offsets; validated
  by the `reminder` rule in `blueprints/api.py`.
- **Tasks: priority, reminders, time-blocking** (`tasks.js`, migration 022).
  `priority` is a closed enum (`high`/`med`/`low`, validated) used as the primary
  sort key in `renderTasks()` (manual `order_index` breaks ties within a
  priority); it renders as a colored badge. Tasks reuse the events
  `reminder_offset` column and the same `reminder` validation; a dated,
  time-bearing `due_date` plus an offset fires a push via
  `check_task_reminders()` in `scheduler.py` (deduped with the shared
  `reminder_sent:*` kv markers). **Time-blocking:** the Planner's 📋 Tasks tray
  (`renderPlannerTaskTray()`) lists open, un-blocked tasks as draggable chips;
  dropping one on a day/slot POSTs an event with `type='task'` and
  `task_id` linking back to the task (a one-way link — editing the block does
  not rewrite the task). Deleting a task cascades to `DELETE FROM events WHERE
  task_id=?` in `blueprints/api.py`, and blocked tasks drop out of the tray.
- **Recurring single-occurrence edits.** Each rendered event carries `data-occ`
  (the occurrence date). Editing/deleting/dragging a recurring instance calls
  `promptRecurrenceScope()` and then `applyRecurringEdit` / `applyRecurringDelete`
  / `applyRecurringMove`: **this** = add `occ` to `excluded_dates` (+ a standalone
  override for edit/move); **following** = set the master's `recurrence_until` to
  the day before `occ` (+ a new series for edit); **all** = mutate the master,
  keeping its start date. They mutate `S` optimistically first (like the move/save
  handlers) so the incremental sync's `?since_version=` lag never shows stale UI.
- **Multi-day events.** `end_date` (after `date`) makes an event span days.
  `getInstances()` expands each occurrence into one segment per day, tagging each
  with `_multiRole` (start/middle/end) and `_occDate` (the occurrence start, used
  for `data-occ`). Timed segments get clipped times (`00:00`/`24:00`) for
  positioning but show the real span via `_origTime`; all-day segments render in
  each day's all-day bar. The recurrence scan widens its start by the span so a
  span beginning just before the view still shows. Continuation segments are
  `draggable="false"`.
- **All-day toggle / per-event color / quick-add.** The modal's `#evModalAllDay`
  checkbox hides `#evModalTimeFields` and saves empty `start`/`end`. `#evModalColor`
  (set via `setEventColor`) holds an optional hex `color` (column from migration
  015, validated by the `color` rule in `api.py`); the renderer applies it as an
  inline `background-color … !important` via `eventColorStyle()` (re-validated
  client-side). The same `color` field can be changed without opening the modal
  via the right-click context menu (`initPlannerContextMenu`), whose swatch row
  (`EVENT_COLOR_PRESETS` → `quickSetEventColor()`, a partial `PUT /api/events/<id>`)
  mirrors the modal presets. The toolbar `#plannerQuickAdd` runs `parseQuickAdd()` — a
  dependency-free heuristic parser for dates/times/durations/locations — and
  `quickAddOpen()` pre-fills the Add-Event modal for confirmation.
- **Notes editor.** Notes use a vendored Quill WYSIWYG editor (one instance,
  created lazily by `initQuill()` in `static/js/notes.js`). Bodies are stored as
  rich HTML (`notes.body_format === 'html'`); legacy Markdown notes are converted
  via `mdToHtml()` on first open and persisted as HTML on first edit. The editor
  reloads a note's contents **only** when `loadedNoteId` changes (switching
  notes), never on a live-sync re-render, so incremental sync can't clobber the
  caret or in-flight edits. Bodies are sanitized server-side by
  `sanitize_note_html()` (allowlist, stdlib) on every save. Images added by
  toolbar button, paste, or drag-drop are uploaded through `/api/files/upload`
  and embedded as `/api/files/<id>/view` URLs — never inlined as base64, which
  would bloat the body past the `_MAX_BODY` limit and make saves fail. The
  paste/drop interception lives on the editor container in the capture phase
  (`initQuill()`) so it beats Quill's own base64 clipboard handler.
- **Notes editor extras.** Markdown block shortcuts (`# `…`###### `, `> `) are
  custom Quill keyboard bindings in `initQuill()`; lists come from Quill 2's
  built-in "list autofill" binding — don't re-add them. Callouts are a block
  `ClassAttributor` (`ql-callout-info|warn|success`, styled in CSS only; the
  server sanitizer allows `class` on `<p>`, covered by a test). Tables use the
  vendored **`quill-table-up`** module (`static/js/quill-table-up.umd.js` +
  `.css`, lazy-loaded alongside Quill in `ensureQuill()`), registered and
  configured in `initQuill()` with `TableResizeLine`/`TableResizeScale` (drag
  border/corner resize), `TableSelection` + `TableMenuContextmenu` (right-click
  cell menu: insert/delete rows & columns, merge/split, colors), and
  `TableAlign`. It replaces Quill 2's minimal built-in table module (which had
  single-line cells and no resize); `insertTable()` seeds a 3×3, everything else
  is the module's own UI. The module serializes tables as `<div.ql-table-wrapper>`
  → `<table>` (width in `style`) → `<colgroup><col width>` (column widths) →
  `<td>` → `<div.ql-table-cell-inner>` (multi-line cell body), with structure in
  `data-*` attributes. `sanitize_note_html()` allowlists those inert `data-*`
  attrs (only on table-structure tags) plus geometry styles (width/height/margin/
  border) so resize + merges + multi-line survive save→reload; `contenteditable`
  is dropped (re-added at render). The module's popups are re-themed for dark
  mode via `.table-up-*` overrides in `style.css`. Old built-in-format tables
  (`<td data-row>`) auto-upgrade on load via `clipboard.convert`. The outline
  sidebar (`#noteOutline`, static HTML + `renderNoteOutline()`) rebuilds from
  `quill.root` headings on load and user edits — never from live sync.
  Cmd/Ctrl+F / Cmd/Ctrl+S are hijacked only while the Notes tab shows an open
  note. Debounced saves flow through `doSaveNote()`; `forceSaveNote()` is the
  flush path.
- **Note exports** (`downloadNoteAs(format)` in `notes.js`, Export menu). Four
  formats. `html` and `print` share `buildNoteExportHtml()`, which wraps the note
  body in `.ql-editor` and appends the vendored Quill stylesheets (fetched once,
  cached, via `exportQuillCss()`) — so the export renders with Quill's own CSS
  and matches the editor pixel-for-pixel (bullets, checkboxes, alignment, fonts,
  sizes, tables). `print` builds a light-themed, button-less doc and prints it in
  a hidden iframe (`printHtmlDoc()`), so only the note prints, never app chrome.
  `md` (`noteToMarkdown()`) walks the rendered DOM to Markdown (Quill's flat
  `data-list` + `ql-indent` lists → nested markdown lists; callouts → blockquotes;
  GFM tables). `doc` (`quillToSemanticHtml()`) normalizes the rich HTML for Word:
  strips `.ql-ui` bullet spans, folds `ql-align/font/size/indent` classes into
  inline styles, and rebuilds Quill's flat lists into real nested `<ul>/<ol>`
  (`rebuildQuillList()`), then serves it as `application/msword` (`.doc`). Images
  are inlined as `data:` URIs first (`inlineExportImages()`) so exports are
  self-contained. True OOXML `.docx` is intentionally not built (would need a zip
  library — out of scope of the no-new-deps rule); the `.doc` HTML opens and edits
  fine in Word and Google Docs.
- **Note tags & templates.** Notes carry a comma-separated `notes.tags` column
  (migration 024); the global tag list lives in the `note_tags` setting — the
  exact pattern exam tags use (migration 019), including the chip bar, the
  checkbox picker dialog, and global rename/delete. A note tagged `template`
  (any case) is a template: `newNote()` then offers a "New note" picker (blank
  or any template) and copies title/body/tags — no separate template table.
- **Sticky + transforms don't mix.** `position: sticky` breaks inside an
  ancestor with a `transform`/`filter`. The tab-switch animation is therefore
  opacity-only (`tabFadeIn`); keep it that way or the planner axis unsticks.
- **Touch & iOS.** Aim for ≥44px tap targets (there's a blanket rule in the
  mobile block). Inputs that can receive focus should be ≥16px font to avoid
  iOS auto-zoom. Respect the safe area with `env(safe-area-inset-bottom)`.
  The persistent music player bar is fixed to `bottom: 0`, so its mobile block
  (`@media (max-width: 640px)`) sizes its own enlarged controls (46px buttons,
  58px play, 6px seek) and adds `padding-bottom: env(safe-area-inset-bottom)` so
  the seek row clears the iPhone home indicator — keep both when editing it.
- **Music tab layout (`static/js/music.js`).** A Spotify-style three-pane
  `.music-shell`: `#musicSidebar` (Your Library — Songs / Recently added /
  playlists), `#musicMain` (a colored `#musicHero` + `#musicTracklist`), and
  `#musicQueue` (Now playing + Next up). A single `view` object
  (`{kind:'songs'|'recent'|'playlist', id?}`) drives what the main pane shows;
  there are no more Library/Playlists/Queue sub-tabs. Below 1000px the queue
  folds into a right drawer and below 720px the sidebar folds into a left
  drawer, both toggled by buttons in the sub-bar (`.queue-toggle` /
  `.lib-toggle`) with a shared `.music-scrim`; the same DOM just reflows via CSS.
  The search box and sort `<select>` are **static** in the sub-bar (index.html),
  never re-rendered — `musicSearchInput`/`musicSetSort` repaint only the hero +
  track list, so live-sync's `renderMusic()` can never eat a keystroke or a
  mid-drag reorder (guarded by the `dragging` flag). The queue "Next up" rows
  carry a **local** `data-idx` for the drag handler but bake the **absolute**
  queue index into their `onclick`; keep that split or reorder/jump desync.
  Per-playlist hero colors come from a hash of the playlist id (`hashHue`).
- **Pop-out music tab.** The "Pop out" button in the Music tab (in the
  library sidebar head) opens the same app at `/?player=1` in a **normal full
  browser tab** (`window.open` with no size features); the inline boot script
  adds `body.player-mode`, which strips the chrome down to just the Music tab +
  player bar (see `.player-mode` in `style.css`), and `app.js` forces the Music
  tab active.
  Because each browser tab owns a separate `<audio>` element, the pop-out
  *takes over* playback rather than mirroring it — a `BroadcastChannel`
  (`tylo-music`, in `music.js`) carries the hand-off: the main window pauses,
  hides its bar, and shows a "playing in the pop-out" hint; "Bring it back
  here" ships the state back and closes the pop-out. Presence is rediscovered
  via a `ping`/`player-open` exchange, so a reloaded main window still yields.
  Two settings under **Settings → Music player** tune this: `music_open_new_tab` makes the Music nav
  button open the pop-out tab directly (desktop only — gated on
  `innerWidth > 640` in the `#tabs` click handler), and
  `music_bar_music_tab_only` scopes the bottom player bar to the Music tab.
  Both are just settings keys; bar visibility is centralised in `syncPlayerBar()`
  (music.js), called on playback changes, tab switches (app.js), and the toggle.
- **Music upload + the Music folder.** The Music tab's "+" button
  (`musicAddMenu`) offers **Upload music…** or **New playlist…**. Upload feeds a
  hidden `#musicUploadInput` into `uploadToMusicFolder()` (files.js), which
  lazily creates/reuses a top-level **Music** folder (via `ensureFolderPath`)
  and drops the files there — reusing the same upload-progress machinery as the
  Files tab.
- **Verify both widths.** After any UI change, check it at ~375px *and* at
  desktop width before calling it done.
- **Command palette (`static/js/palette.js`).** `Ctrl`/`Cmd`+`K` search over
  everything, plus two inline mini-parsers special-cased at the top of
  `search()`: `timer 25m focus` (`parseTimer` in `timers.js`) and the
  calculator (`calc()` in `static/js/calc.js`). `calc()` is pure and
  DOM-free — arithmetic (recursive descent, no `eval`), unit conversion
  (cross-table ratio lookup + a temperature special-case), and time-zone
  conversion via native `Intl`/`toLocaleString` against a curated
  abbreviation/city→IANA map (no tz library). A leading `=` forces it and shows
  only the result; a bare valid expression is prepended above search hits;
  anything `calc()` can't compute returns `null` and falls through to search.
  `Enter` copies the result. Covered by `node test_calc.mjs`. Deliberately out
  of scope: live currency rates and free-form word-operator NLP.
  Also special-cased in `search()`: quick-create verbs `task …` / `note …` /
  `event …` (event reuses the planner's `quickAddOpen`/`parseQuickAdd` NL date
  parser and opens a pre-filled modal), and `?` which lists the palette's
  capabilities as `fill` rows that seed the input. Pressing `?` outside any
  input/dialog opens the keyboard cheat-sheet (`showShortcutsHelp`).
- **Undo toast (`showUndoToast`/`triggerUndo` in `utils.js`).** Shared 6-second
  Undo toast used by planner drag/resize/delete and by the generic `delRow()`,
  which snapshots the row before deleting and re-`POST`s it on undo (a fresh id
  is assigned, so id-linked children aren't restored).
