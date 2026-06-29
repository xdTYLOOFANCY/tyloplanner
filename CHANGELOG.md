# Changelog

All notable changes to TyloPlanner are documented here.

## 1.5.32 — 2026-06-29

Calendar readability pass — a second round on the planner to make it read and
behave like Google Calendar, based on a side-by-side comparison. Scoped to
`static/js/planner.js` and `static/style.css`; no backend or dependency changes.

- **Whole day visible at a glance.** The desktop time grid was a fixed `730px`
  tall, so only ~8:00–18:00 fit on screen. It now fills the viewport
  (`height: calc(100vh - 130px)`, `min-height: 520px`), and the planner opens
  scrolled to ~7am (top-aligned on the morning, or the earliest event) instead
  of centering on the current time — so on a normal desktop you see roughly
  7:00–midnight without scrolling, like Google Calendar.
- **Event cards read like Google.** The bold **title now comes first and
  wraps** onto multiple lines so the full event name is readable, instead of
  being truncated to "BA3B13 - BA3 - VO.2 Neuro Onc…". The time sits below the
  title and the location below that (the 📍 pin was dropped for a cleaner look),
  both in a lighter weight. Card overflow still clips cleanly, and hovering a
  short event expands it to show everything. (This reverses the time-first
  ordering from 1.5.31 — real Google Calendar is title-first.)

Drag-and-drop, resize, touch-drag, the overlap layout, today indicator, and the
mobile responsive rules are unchanged.

## 1.5.31 — 2026-06-29

Desktop calendar visual overhaul — the planner week/day grid now matches Google
Calendar's density and layout while staying fully theme-driven (CSS variables
only, so every theme works automatically). Scoped to `static/js/planner.js` and
`static/style.css`; no backend, template, or dependency changes.

- **Events expand into free space (two-pass overlap layout).** `calculateOverlaps()` previously split every event in an overlap cluster into equal `100% / columns` widths, so a lone event stuck in a 3-wide cluster stayed at 33% even when the columns beside it were empty at its time. A new second pass lets each event grow rightward across adjacent columns until it reaches one holding a genuinely time-overlapping event — so non-conflicting events fill the available width, exactly like Google Calendar. Truly conflicting events are unaffected.
- **Event cards: time-first hierarchy, tighter density.** Timed event cards now show the time on a small (`10px`, 75 %-opacity) line *above* the bold title (`11px`), with the location below only when the card is tall enough (`≥50px`) — matching Google's convention. Padding dropped to `3px 6px` and the base font to `11px` so cards read cleanly at narrow column widths. The drag-preview and resize live-update labels were updated to match (they now target `.event-time`).
- **Today indicator + column tint.** Today's date number in the day header sits inside an accent-filled circle (`.today-circle`), the day-name font ticked up to 13px, and today's time-grid column gets a ~4 % accent wash (`rgba(var(--accent-rgb), 0.04)`) — a subtle highlight that reads in every theme.
- **Half-hour grid lines.** Each hour cell renders a faint dashed `::after` line at its midpoint, giving the grid the same 30-minute rhythm as Google Calendar without extra DOM.
- **Month view: solid pill chips.** Month-view events switched from a `var(--panel2)` background with a 3px colored left border to full-color pills (type-color background, white text, 3px radius), matching Google's month layout. Type colors map to the same theme variables as the week view (`--accent2` study, `--red` work, `--orange` personal, `--green` workout, etc.).

Drag-and-drop, resize, touch-drag, all-day events, recurrence, ICS
import/export, and the mobile responsive rules are unchanged.

## 1.5.30 — 2026-06-28

Follow-up fixes from on-device mobile testing of 1.5.29.

- **Fixed: dashboard/tasks quick-create "Add Task" did nothing.** The FAB called `openTaskModal()` with no id; that function was edit-only (`S.tasks.find(id)` → `if (!t) return`), so it bailed silently. `openTaskModal()` now opens the modal in **create mode** (blank fields, "Add Task" title) when called without an id, and `saveTaskModal()` POSTs a new task instead of PUTting when there's no id. Editing existing tasks is unchanged.
- **Fixed: Files section overflowed off the right edge on mobile.** Long filenames pushed the `Download`/`✕` buttons off-screen (a long filename's longest word set a `min-width` that stopped the row from shrinking), and the folder action toolbar (`Rename / Icon / Delete / + Folder / Upload / Camera`) ran past the screen edge. On mobile the folder toolbar now wraps, and each file row puts the name + meta on the first line with the action buttons on their own right-aligned line below — so the filename wraps by word (not per character) and every button stays on-screen and tappable.

## 1.5.29 — 2026-06-28

Second-pass mobile PWA overhaul focused on the sections that were still
unusable. **All changes are scoped to `≤640px` media queries or `matchMedia`
mobile branches, so the desktop UI is unchanged** (verified side-by-side).
No new dependencies — vanilla CSS/JS only.

- **Planner week/multi-day views are usable again.** The old behavior crushed 7 day-columns into a phone screen, truncating every event to "B…". On mobile, multi-day views now render each day at `80vw` inside a horizontally **scroll-snapping** grid (`.day-columns.multiday`), so you swipe one readable day at a time — Google-Calendar style — while the hour axis stays pinned via `position: sticky` (`.time-axis`). Single-day view fills the width. The initial view also defaults to **Day** on phones (`planner.js` reads `matchMedia('(max-width: 640px)')`). Desktop keeps the full 7-column week grid (the `.multiday` class is inert above 640px).
- **Notes editor: working Read Mode + reclaimed space.** Read Mode was **broken on mobile** — `#noteView` was hidden with `display:none !important`, which overrode the read-mode toggle and showed a blank pane. `applyNoteLayout()` now forces single-pane on phones (edit = textarea only, read = preview only) and the `!important` hide is gone. The editor chrome was streamlined into one compact row (save status + Read/Export/Delete), the in-note search bar is **collapsed behind a 🔍 toolbar button** (`toggleNoteSearchBar()`) instead of permanently eating a row, and the textarea uses a roomy `52dvh` at a 16px font (which also stops iOS focus auto-zoom).
- **Quick-create "New Note" now works from anywhere.** Tapping **New Note** in the dashboard quick-create FAB created a note but never navigated to it, so nothing visibly happened. `window.newNote` now switches to the Notes tab first, so it always lands you in the new note's editor with the title focused.
- **FAB no longer overlaps the note text.** The floating `+` button covered the bottom-right of the editor (and "new note while editing" was a confusing action). It is now hidden while a note is open (`body.note-open #globalFab`).
- **Dashboard notepad reclaimed ~150px of dead space.** `flex-grow` doesn't resolve in the auto-height mobile cards, so the notepad textarea collapsed to 44px inside a 220px card — a tiny field floating in empty space. The textarea now gets a real 150px writing area and the card hugs it.
- **To-do cards no longer clip their buttons.** When a task had category/date badges, the edit/delete buttons were pushed off the right edge. The task header now wraps on mobile (`.task-header { flex-wrap: wrap }`) so everything stays reachable.
- **Polish:** footer is now reliably hidden on mobile (its inline `display:flex` needed an `!important` override); gentle opacity-only fade when switching tabs (`tabFadeIn` — opacity only, since a transform would break the planner's `position:sticky`).

## 1.5.28 — 2026-06-28

- **Fixed: Note preview ignored single line breaks.** Pressing Enter once in the editor moved the cursor to a new line in the textarea, but the read/preview pane rendered the lines run together on one line. The markdown renderer (`configureMarked()` in `static/js/utils.js`) used marked's defaults, where a single newline is collapsed to a space (standard Markdown) and only a blank line starts a new paragraph. Enabled `breaks: true` (plus explicit `gfm: true`) so every single newline becomes a `<br>`, matching what's typed — the behavior people expect from a notes app. Affects the live preview, read mode, exported HTML, and compiled notebooks (all route through `mdToHtml`).
- **Fixed: Raw HTML / angle-bracket text rendered as `[object Object]`.** Typing literal HTML (e.g. `<div>`, `<TODO>`) into a note produced the text `[object Object]` in the preview. The custom `html` renderer was written for an older marked API and treated marked v15's token *object* as a string. It now reads `token.text` and escapes it, so embedded tags display as safe literal text (preserving the existing XSS protection). Inline `<` in prose (e.g. `a < b`) is unaffected.
- **Mobile PWA UI Overhaul:** Major improvements to the mobile experience across all major sections. Planner now auto-switches to Day view on mobile (instead of the unusable 7-column week grid) and the weeknav bar scrolls horizontally without wrapping. The time grid height is now dynamic (`100dvh - 205px`) so it fills the viewport cleanly without a scroll-within-scroll trap. Analytics section switches to a single-column bento grid on mobile so charts are full-width and readable. Habit checkboxes are enlarged to 28×28 px for comfortable touch interaction. Notes: the textarea `min-height` is reduced to `42dvh` so it no longer swallows the whole screen, the formatting toolbar scrolls horizontally instead of overflowing, and the header bar stacks vertically on narrow screens. Fixed a bug where creating a new note via the FAB didn't apply the `.note-editing` class to the notes layout, causing the note list and editor to be shown simultaneously on mobile in single-column view.

## 1.5.27 — 2026-06-28

- **Fixed: Notes could not be created or edited (regression).** The input validation added in 1.5.26 classified the `updated` (notes) and `uploaded` (files) columns as `YYYY-MM-DD` date strings. Both are actually epoch-millisecond `INTEGER` columns (the frontend sends `Date.now()`), so every `POST`/`PUT /api/notes` was rejected with `400 'updated' must be a string in YYYY-MM-DD format`, breaking note creation, auto-save, and editing. `blueprints/api.py` now validates `updated` and `uploaded` as bounded integers (epoch milliseconds), restoring all notes functionality. The cross-device edit-conflict detection (`409`) continues to work correctly.
- **Fixed: Missing database indexes after the foreign-key migration.** Migration `012_add_foreign_keys.sql` rebuilt the `tasks`, `notes`, and `files` tables (to add `ON DELETE CASCADE`). SQLite drops every index attached to a table when that table is dropped, so the version indexes (migration 009) and foreign-key indexes (migration 010) on those three tables were silently lost — degrading incremental-sync and cascade-delete query performance. New migration `013_restore_indexes_after_table_rebuild.sql` recreates the six affected indexes idempotently (`CREATE INDEX IF NOT EXISTS`), applying automatically to both fresh and already-upgraded databases.

## 1.5.26 — 2026-06-25

- **Backend Input Validation for Generic CRUD Endpoints:** The `POST /api/<table>` and `PUT /api/<table>/<rid>` endpoints now validate every accepted field before touching the database. A new `_validate_fields()` helper in `blueprints/api.py` enforces: date format (`YYYY-MM-DD`) for date columns, datetime format (`YYYY-MM-DDTHH:MM`) for `due_date` / `completed_at`, time format (`HH:MM`) for `start` / `end`, numeric ranges for `ects` (0–999), `grade` (0–10), `dur`, `dist`, `duration` (0–1 000 000), boolean coercion for `done`, `is_pinned`, `completed`, integer bounds for `order_index`, `size`, `reminder_offset`, an allowed-set enum for the `events.type` column (including dynamic `ics_N` types), and max-length checks for all string / URL fields. Malformed payloads now return a descriptive `400 Bad Request` JSON error instead of a database exception or silent data corruption. No new dependencies were added — validation uses stdlib only.

## 1.5.25 — 2026-06-25

- **Unified Custom Scrollbar Theme:** Introduced a cohesive, theme-aware scrollbar system across all scrollable containers. Three new CSS custom properties (`--scrollbar-thumb`, `--scrollbar-track`, `--scrollbar-thumb-hover`) are declared in `:root` (dark) and `[data-theme="light"]`, so scrollbar colours follow the active colour scheme automatically. The modern `scrollbar-color` / `scrollbar-width` API is used globally via a `*` selector. A `@supports not (scrollbar-color: auto)` block provides `::-webkit-scrollbar` legacy fallbacks for older browsers without duplication. The cyberpunk theme receives neon-accent thumb colours; a `prefers-contrast: more` media query forces high-contrast black/white styling for accessibility.

## 1.5.24 — 2026-06-25

- **Animated Checkbox Interaction:** Redesigned `.hcheck` custom checkboxes. Added smooth scale hover (`scale(1.08)`) and active click (`scale(0.95)`) transitions. Swapped the static text checkmark ("✓") for a CSS pseudo-element-drawn checkmark that animate-scales from 0 to 1 with a spring-loaded `cubic-bezier(0.34, 1.56, 0.64, 1)` easing, enhancing user interaction across all tasks, habits, files selection, and customization toggles.

## 1.5.23 — 2026-06-25

- **Screenshot Generator Mock Mismatch Fix:** Fixed a property name discrepancy in the Puppeteer-based screenshot generation script (`take_screenshots.js`) where mock tasks used the property `text` (e.g., `{text: 'Submit ML Assignment'}`) instead of `name`. This mismatch caused the generated Dashboard screenshots to display empty task checkbox widgets without names. Corrected the mock tasks in `take_screenshots.js` to match the application schema's `name` property.

## 1.5.22 — 2026-06-25

- **Swipe-to-Delete Action Label Fix:** Fixed a misleading swipe action label on Notes list where swipe-to-delete notes displayed a green-looking "Archive" button and "Note archived" toast, but actually deleted the database records permanently. Updated the label to "Delete" (✕ Delete) and the toast notifications to "Note deleted".

## 1.5.21 — 2026-06-25

- **Notes Folder Deletion Re-parenting Fix:** Fixed a functional bug where deleting a notes folder orphaned its child notes and subfolders (making them permanently invisible in the UI).
  - Explicitly prioritized the specific `/api/note_folders/<fid>` DELETE route over the generic `/api/<table>/<rid>` route.
  - Hardened the backend's generic `delete_row` route to intercept and safely delegate deletions of custom tables (`note_folders`, `folders`, `files`) to their custom functions.
  - Implemented client-side optimistic update re-parenting in `static/js/utils.js` for both note folders and file folders so that offline changes immediately reflect the correct layout.
  - Added automated unit test covering note folder and subfolder re-parenting on deletion.

## 1.5.20 — 2026-06-25

- **Waitress Access Logging:** Implemented `LoggingMiddleware` to wrap Flask's `wsgi_app` inside `app.py`. The middleware intercepts incoming HTTP requests and outputs standard Apache Combined Log entries to `stdout` for debugging and security auditing. It automatically bypasses logging during unit tests to keep test output clean.
- **Automated Asset Cache-Busting:** Implemented dynamic cache-busting versioning on application startup. Python calculates a SHA-256 hash of the static assets and injects this hash version into all local CSS and JS imports within `index.html` and `login.html`. Additionally, it updates the service worker (`sw.js`) cache name and replaces `caches.match` with `{ignoreSearch: true}` to enable seamless offline asset matching with version query parameters.
- **Python3 Command Standard:** Configured codebase documentation to standardise on `python3`/`pip3` for all operations.

## 1.5.19 — 2026-06-25

- **CLI Administration Tools for Recovery:** Added command-line options (`--reset-password "<new_password>"` and `--disable-2fa`) to `app.py`. This allows self-hosted administrators who are locked out to safely clear TOTP keys and reset their admin password directly from the host terminal.

## 1.5.18 — 2026-06-25

- **Optimized FTS5 Search Storage:** Transitioned SQLite FTS5 search index virtual tables (`notes_fts` and `files_fts`) to External Content Tables. This stores indices in FTS5 but refers to original text/filename columns in the main tables by mapping `rowid` to the underlying table's `rowid`, eliminating data duplication and reducing database file size. Added migration `011_optimize_fts5_storage.sql` to upgrade existing databases.

## 1.5.17 — 2026-06-25

- **SQLite Foreign Key Missing Indices:** Created a database migration to add indexes on foreign keys (`parent_id`, `folder_id`, `habit_id`) for `tasks`, `notes`, `note_folders`, `files`, `folders`, and `habit_log`. This avoids full table scans when parent records are deleted and cascading operations are triggered, improving performance.

## 1.5.16 — 2026-06-25

- **Asynchronous Task Queue Recovery:** Added startup task queue recovery logic. When the application server starts up, it scans the `queued_tasks` table for any tasks stuck in the `running` state (e.g. from an abrupt crash or server restart). It resets tasks with remaining retries back to `pending` (updating error log to "Server restarted" and clearing execution flags) to ensure they get re-executed, and marks tasks that have exhausted their max attempts as `failed` to prevent infinite restart-crash loops.

## 1.5.15 — 2026-06-25

- **HTTP Retry Decorator for External Sync:** Introduced a robust `@http_retry` decorator using exponential backoff to handle transient network drops and rate-limiting (HTTP 429) for external sync tasks. Replaced direct requests with `http_get` and `http_post` in the Strava integration (`blueprints/strava.py`) and Calendar integration (`blueprints/calendar.py`), preventing sudden sync failures on temporary external API drops.

## 1.5.14 — 2026-06-25

- **SQLite WAL Checkpointing:** Implemented weekly SQLite WAL checkpointing (`PRAGMA wal_checkpoint(TRUNCATE)`) during the Sunday session cleanup task in `scheduler.py` to prevent the WAL log file from growing indefinitely and maintain optimal read/write performance.

## 1.5.13 — 2026-06-25

- **Visual Drop-Target Feedback:** Replaced the `.folder-drag-over` CSS class with a unified `.drag-over` class in `static/js/files.js` and `static/js/notes.js`. Updated `.drag-over` styling in `static/style.css` to provide immediate, dashed accent border visual feedback when dragging files or notes over folders, breadcrumb links, and list items.
- **Service Worker Cache Update:** Bumped service worker cache version to `tylo-v103`.

## 1.5.12 — 2026-06-25

- **Live Theme Synced Chart.js Styling:** Implemented a new custom event `theme-changed` dispatched from `theme.js` when the theme, theme style, or accent color is updated. Subscribed to this event in `analytics.js` to dynamically redraw active charts with updated CSS variables (such as grid, text, and panel colors) without requiring a page reload.
- **Service Worker Cache Update:** Bumped service worker cache version to `tylo-v102` and cache-buster asset version queries in `index.html` to `v=85`.

## 1.5.11 — 2026-06-24

- **Component-Level Reactivity & Targeted Rendering:** Optimized the frontend rendering loop to only re-render the currently active tab on state changes. Inactive tabs are marked stale and rendered on-demand when activated, preventing background layout thrashing and CPU load.
- **Localized DOM Event-Based Patching:** Introduced custom DOM events (`tylo:task-updated`, `tylo:habit-toggled`) to update checkboxes, streak badges, and widget elements locally without triggering full tab re-renders. Bumped service worker cache to `tylo-v101` and asset version query parameters in `index.html` to `v=84`.

## 1.5.10 — 2026-06-24

- **Graceful Web Push Notification Fallback:** Wrapped external dependencies (`pywebpush`, `py-vapid`, and `cryptography`) in try-except blocks. If these optional packages are missing in the runtime environment, the system now logs a warning instead of raising `ModuleNotFoundError`. This prevents scheduler tasks (like daily morning agendas) from failing when run in minimal test or production environments.

## 1.5.9 — 2026-06-24

- **Refactored Custom Modals to Native `<dialog>`:** Refactored all 8 custom modal overlays to native HTML5 `<dialog>` elements. This adds native Escape key handling, keyboard focus trapping, and backdrop dismissal. Removed redundant manual Escape key and backdrop click handlers from `tasks.js`, and updated `planner.js` to correctly detect open dialogs for keyboard shortcut blocking. Bumped service worker cache to `tylo-v100`.

## 1.5.8 — 2026-06-24

- **Richer iCal/ICS Feed Export:** Enriched `/calendar.ics` to export event `location`, `description`, and recurrence rules (`RRULE`) using standard ICS attributes.
- **UTC Timezone Synchronization:** Timed events are converted to UTC based on the application timezone setting and exported with the `Z` suffix, preventing timezone shifts on external clients. All-day events remain date-only to keep their all-day status.

## 1.5.7 — 2026-06-24

- **Delta Sync Database Indexing:** Created a database migration to add indexes on the `version` column for all 12 synchronized tables (`tasks`, `events`, `exams`, `habits`, `habit_log`, `workouts`, `notes`, `note_folders`, `files`, `folders`, `shortcuts`, `study_sessions`). This prevents full-table scans during delta sync polling, improving backend response times and overall application performance.

## 1.5.6 — 2026-06-24

- **Session Lifetime Management & Cleanup:** Implemented a weekly background cleanup task in `scheduler.py` to purge database sessions that have been inactive for more than 30 days. The task runs automatically at 04:00 AM on Sundays (alongside storage cleanup) and deletes inactive entries from the `user_sessions` table, keeping database size optimized.

## 1.5.5 — 2026-06-24

- **Silent Sync-Queue Data Loss Fix:** Fixed an issue where 401/403 HTTP responses (due to expired session) inside the offline syncQueue loop would cause data loss by silently deleting offline changes from IndexedDB. Added checks to alert the user, redirect them to the login page, and abort sync execution, successfully preserving all queued changes. Bumped service worker cache to `tylo-v99` and asset version query parameters in `index.html` to `v=83`.

## 1.5.4 — 2026-06-24

- **Redundant Double Script Load Fix:** Removed the redundant `/static/app.js` module script tag from the footer of `index.html`. This fixes a console 404 error when `static_url_path=""` is configured on the backend. Bumped service worker cache to `tylo-v98` and asset version query parameters in `index.html` to `v=82`.

## 1.5.3 — 2026-06-24

- **Keyboard Shortcuts Input Collision Fix:** Added the `isInputFocused()` utility function to check if any text input, textarea, select element, or contenteditable block is focused. Integrated this helper to guard the global planner keydown shortcut handler, preventing typing input (like `t`, `w`, `n`) from triggering layout transitions or modal openings. Bumped service worker cache to `tylo-v97`.

## 1.5.2 — 2026-06-24

- **Modern Navigation View Transitions:** Integrated the browser View Transitions API (`document.startViewTransition`) during tab navigation to animate cross-tab transitions smoothly. Added directionality detection to slide new content in from the right when moving forward in the tab index, and from the left when moving backward. Provided full backwards-compatibility for older browsers supporting View Transitions but not active types by setting class names (`transition-forward`/`transition-backward`) on the document element. Automatically respects user preferences for reduced motion (`prefers-reduced-motion: reduce`). Bumped service worker cache to `tylo-v96`.

## 1.5.1 — 2026-06-24

- **PWA Loading Resilience:** Wrapped the fallback state and settings retrieval calls in try-catch blocks to gracefully load the IndexedDB cached state on network/server failure. This prevents unhandled exceptions from rejecting the initialization promise, resolving the issue where offline users encounter a permanent blank screen or spinner when the server is unreachable. Bumped service worker cache to `tylo-v95`.

## 1.5.0 — 2026-06-24

- **Cryptographic Password Hashing & Management:** Upgraded the application authentication to hash passwords using the strong `scrypt` algorithm (via Werkzeug) instead of relying on plain-text comparisons. Added automatic database bootstrapping that hashes and saves the environment variable `AUTH_PASSWORD` to the SQLite `kv` table on startup. Implemented a "Change Password" form under Settings → Security that allows users to securely update their login password directly from the user interface, bypassing the need to edit environment variables. Requires 2FA verification code confirmation if two-factor authentication is active. Bumped service worker cache to `tylo-v93`.

## 1.4.9 — 2026-06-24

- **Storage Reconciliation & Weekly Cleanup:** Implemented a weekly background storage cleanup and reconciliation task running at 04:00 AM on Sundays. The task scans `data/uploads/` to delete orphaned files that are no longer referenced in the `files` database table. It also identifies and logs any files that are referenced in the database but missing from disk, storing the results in the `queued_tasks` execution log. Added a protected `POST /api/files/cleanup` route to allow manual cleanup execution.
- **SQLite Foreign Key Enforcements:** Enabled foreign key constraint enforcement (`PRAGMA foreign_keys = ON;`) on all database connections to prevent data orphaning and ensure relational integrity at the database engine level.

## 1.4.8 — 2026-06-23

- **Uniform API Error Handling & Structured JSON Responses:** Registered a global Flask error handler for HTTP exceptions and generic Python server exceptions. All unhandled exceptions are caught and formatted into structured JSON responses containing detailed error descriptions, HTTP status codes, and exception types. This guarantees that all client-side fetch calls receive valid JSON payloads even on 404, 405, or 500 server errors, enhancing PWA/offline recovery and preventing parser crashes.

## 1.4.7 — 2026-06-23

- **Response Compression (Gzip):** Implemented an after-request middleware in `app.py` utilizing the standard library's `gzip` module. Automatically compresses responses for supported MIME types (JSON, HTML, CSS, JS, XML, SVG) that exceed 500 bytes when clients specify support through the `Accept-Encoding: gzip` request header. Properly manages cache-proxy safety by appending the `Vary: Accept-Encoding` header. Excludes streams, non-compressible binary media, and failed status responses.

## 1.4.6 — 2026-06-23

- **Incremental API State Sync (Delta Sync):** Refactored the state synchronization protocol to support delta sync (`GET /api/state?since_version=X`), returning only records inserted, updated, or deleted since version `X` across all user data tables. Implemented an automatic trigger-based SQLite state-version tracker where inserts, updates, and deletes increment the global `state_version` and tag rows with the corresponding version. Added a `deleted_records` tombstone table to track deleted IDs. Refactored the frontend synchronization pipeline to perform incremental syncs and reconcile client-generated temporary IDs with server-assigned UUIDs, minimizing payload size and database overhead on poor connections. Bumped service worker cache to `tylo-v90`.

## 1.4.5 — 2026-06-23

- **SQLite Auto-Vacuuming & Fragment Optimization:** Enabled incremental auto-vacuum mode (`PRAGMA auto_vacuum = INCREMENTAL`) on database initialization, running a full database `VACUUM` to restructure database pages on disk. Integrated connection-level optimizations by executing `PRAGMA optimize;` before closing active connections, keeping the SQLite query planner statistics up to date. Set up a daily cron job inside the scheduler loop running at `03:00` to execute `PRAGMA incremental_vacuum;` and reclaim unused database pages from deleted files, notes, and activity logs.

## 1.4.4 — 2026-06-23

- **Structured Schema Versioning & Migrations:** Decoupled SQLite database schema management from startup code by implementing a lightweight, file-based migrations manager. Migrations are organized as standalone SQL files under the `migrations/` folder (`001` through `005`) and run sequentially inside transactions on startup. Added an auto-detection engine to determine version profiles of legacy pre-migration databases, preventing re-execution of older column alterations. Tracks the current database version in the `kv` table to ensure safe, thread-safe, and race-free schema management.

## 1.4.3 — 2026-06-23

- **SQLite Full-Text Search (FTS5):** Set up `fts5` virtual tables (`notes_fts` and `files_fts`) to index note titles/bodies and filenames. Synchronized index updates using automated SQLite database triggers (`INSERT`, `UPDATE`, `DELETE`). Added custom search API endpoints (`/api/notes/search` and `/api/files/search`) featuring prefix query formatting (incremental typing wildcard support) and query tokenization. Integrated endpoints into the frontend with a 150ms debounce window and built-in offline fallbacks to local JavaScript substring matching. Bumped service worker cache to `tylo-v89`.

## 1.4.2 — 2026-06-23

- **SQLite Connection Pooling (g context):** Implemented connection pooling using Flask's `g` application context to store a single database connection per request. The connection is opened on demand on the first database call and automatically closed during request teardown context, reducing overhead, improving response times, and ensuring thread-safe transaction isolation. Stands on fallback behavior for non-request contexts (CLI, tests, scheduler daemon threads).

## 1.4.1 — 2026-06-23

- **Real-Time Live Updates:** Added automatic background synchronization across multiple open application instances. The backend tracks data modifications using SQLite transaction hooks and increments a `state_version` key. A smart, background-aware polling loop on the frontend checks this version and triggers a silent state refresh on mismatch, updating all tabs, widgets, notes, files, habits, and stats in real-time. Also added a continuous timer in the Planner view that updates the current time indicator red bar every 15 seconds, automatically executing a full re-render on day transitions. Bumped service worker cache to `tylo-v88`.
- **Styled HTML Notes Compilation & Download:** Added options to download notes or entire folders as styled, standalone HTML files/folders that preserve the dark/light/cyberpunk styling, responsive layouts, code syntax highlighting, and formatting of the application's read mode for offline reading. Supported downloading the entire notebook as a single compiled HTML file.

## 1.4.0 — 2026-06-22

- **Application Time Zone Support:** Added a new setting to configure the application's timezone with auto-detection capability in the Settings panel. Refactored the backend scheduler, calendar auto-sync/import/export, Strava synchronization, backups, and reminders to compute local time relative to the configured timezone (using a new `local_now()` helper), fixing offset discrepancies and syncing errors.
- **Calendar Customization Panel:** Added a new "Customize Calendars" modal to the planner view. Users can toggle the visibility of individual event types (like workouts, study, exams) and specific subscribed calendar feeds, as well as customize their individual rendering colors. Updated calendar feed parsing to track source-specific IDs (`ics_0`, `ics_1`, etc.) to support granular feed-level styling.
- **Media Preview Scaling & PWA Caching:** Overhauled media preview modal dimensions to dynamically adapt based on the file's mimetype (e.g., maximizing viewport space for PDFs, fitting image/video aspect ratios, and compacting audio players). Registered and cached local Chart.js assets in the Service Worker (`static/sw.js`) to support fully offline-capable dashboard analytics.
- **Space-Efficient UI Polish:** Removed all internal page title headers across all tabs (e.g., "Exams, deadlines & grades", "Habits", etc.) to maximize vertical screen space and reduce redundancy with the top navigation bar. Moved the "⚙️ Customize" button from the dashboard header into the global footer. Scaled the custom dashboard website shortcuts up by 1.5x (both desktop and mobile) for improved tap targets and visual proportions relative to dashboard widget cards.
- **UI Overhaul & Dashboard Analytics Redesign:** Completely overhauled the main user interface to introduce a sleeker, space-efficient, premium design. The layout now utilizes wide screens effectively by expanding the main container's maximum width. The header and navigation tabs have been visually refined for a more compact and modern appearance, featuring an elegant animated bottom border for active tabs and no heavy backgrounds. The Analytics tab was refactored from vertically stacked blocks into a beautiful masonry-style `.cards` grid layout, bringing it aesthetically in line with a modern dashboard. Additionally, statistic blocks and global cards received subtle border, shadow, and hover improvements while keeping the base background solid and non-distracting. Bumped service worker cache to `tylo-v81`.
- **Native Web Push Notifications:** Implemented native Web Push notifications via the browser's Service Worker and VAPID key pairs generated programmatically on server startup. Stores subscription metadata in a new `push_subscriptions` database table. Added client-side capability checking (requires secure context HTTPS or localhost) in the Settings panel: displays a toggle to register/unregister the current browser for push notifications if supported, and shows a helpful fallback warning recommending `ntfy` for local HTTP-only network access. Integrates seamlessly with backend scheduler jobs (agendas, habit nudges, event reminders). Bumped service worker cache to `tylo-v75`.
- **Notes Folder Organization System:** Implemented a new hierarchical folder organization system for Notes. Added a file-explorer style drag-and-drop interface allowing you to seamlessly move notes into folders, create nested directories infinitely deep, navigate via a breadcrumb trail header, and drag-and-drop folders among siblings to intuitively re-order them. Added custom emoji icon support for folders. Note searches seamlessly support finding items within sub-directories of the active folder context.
- **Mobile-Friendly File & Notes Upgrades:** Added a highly responsive Floating Action Button (FAB) for mobile viewports, supporting quick entry shortcuts that dynamically adapt to the active tab (including a custom multi-action speed dial menu on Dashboard and Files tabs). Implemented fluid, touch-friendly swipe-left gestures to archive/delete notes (red track with archive indicator) and mark tasks as completed (green track with checkmark indicator) via event delegation. Added a direct phone camera capture upload option to the File Manager (complete with a hidden `capture="camera"` file input, a "📸 Camera" toolbar button, and a dedicated speed dial action). Bumped service worker cache to `tylo-v74`.
- **Touch-Optimized Calendar & Planner:** Improved mobile calendar interactions using native Pointer Events. Implemented fluid touch drag-and-drop on mobile screens with a 250ms long-press hold delay and scroll-locking, and converted event resizing handlers to use Pointer Events for seamless touch and mouse resizing. Added swipe gestures (left/right) on the Calendar viewport to navigate between days and weeks. Added double-tap and long-press gestures on empty calendar cells (month cells and time-grid content) to quickly open the event creation modal at the target day/time. Bumped service worker cache to `tylo-v73`.
- **Study Timer & Pomodoro Tracker:** Implemented an integrated circular countdown timer and stopwatch widget for the dashboard using Alpine.js. Features customizable study (15/25/45/50/60m) and break (3/5/10/15m) cycles in Pomodoro mode, an active subject text tracker, state persistence in `localStorage` to survive page reloads and tab closures, and a client-side Web Audio API synthesizer that plays a chime when a session finishes. Supports logging completed sessions to a new `study_sessions` SQLite table. Integrated logged sessions into the **Analytics** tab with a dedicated "Study hours per month (actual logged sessions)" bar chart, an updated totals summary metric, and an interactive study history log table with deletion support. Bumped service worker cache to `tylo-v72`.
- **Security & Reverse Proxy Improvements:** Added `ProxyFix` middleware to correctly resolve client IP addresses and protocol schemes behind reverse proxies (like Cloudflare Tunnel) to fix URL generation. Upgraded session cookie security by enforcing `HttpOnly` and `SameSite='Lax'`, and implemented an anti-CSRF check (`X-Requested-With` header) for all mutating API requests. Replaced thread-blocking sleep functions in authentication routes with a non-blocking in-memory IP rate limiter to prevent Denial of Service (DoS) attacks via Waitress thread exhaustion. Added a strict Content Security Policy (CSP) header, extracting inline scripts to `js/bottom_nav.js` and `js/login.js`. Enabled SQLite Write-Ahead Logging (WAL) mode for improved database concurrency. Bumped service worker cache to `tylo-v68`.
- **Cyberpunk Theme Polish & Light Mode Overhaul:** Fully overhauled the Cyberpunk theme style. Resolved issues where Cyberpunk in Light Mode was identical to Dark Mode by introducing a custom retro-futuristic light aesthetic featuring a light gray-grid background (`#f5f6f9`), white card surfaces, dark monospace text, and crisp neon outlines. Polished Cyberpunk styles globally across the project to cover all inputs, selects, textareas, buttons, navigation tabs, calendar cells, checklist items, badges, stats blocks, and toggles for a completely unified retro-cyber look. Bumped service worker cache to `tylo-v67`.
- **Deadline & Calendar Sync:** Implemented bidirectional synchronization between deadlines (exams) and calendar events. Creating, updating, or deleting an exam automatically creates, updates, or deletes a corresponding all-day event of type 'deadline' on the calendar (sharing the same ID). Conversely, creating, updating, or deleting/moving a 'deadline' type calendar event automatically keeps the corresponding exam in sync. Modified ICS export to prevent duplicate event listings. Added red border/background styles for 'deadline' events in Month, Week, and Day views, and highlighted them in the Today's Plan agenda list with a red background, red left border, and a prominent 'DEADLINE' badge. Bumped service worker cache to `tylo-v64`.
- **Improved Today's Plan & Customizer:** Rebuilt the dashboard customization system with a pointer/touch event-based layout engine, a real-time vertical compaction and collision-resolution algorithm, and uniform 150px grid rows. Today's Plan widget shows start/end times and categorizes events into past and upcoming/happening. Clicking on a dashboard event shows a details popup modal with a direct "Edit in Calendar" button that shifts focus to the Calendar tab and opens the event editor form. Fixed card overflow behavior by making grid cards layout as flex columns so that content scrolls gracefully rather than spilling out when resized below default heights. Bumped service worker cache to `tylo-v62`.
- **Dashboard Shortcuts Integration:** Merged Dashboard Shortcuts management (adding, reordering, enabling/disabling, removing, and toggling the standalone row visibility) directly into the **Dashboard Customizer** panel. Removed the dedicated shortcuts card from the **Settings & integrations** tab to centralize all dashboard customization.
- **Customizer Checkboxes:** Replaced all standard inputs and toggles inside the **Dashboard Customizer** panel with habits-style custom checkboxes (`.hcheck`), providing a unified check-in styling and interactive feel. Bumped service worker cache to `tylo-v58`.

- **Dashboard Widgets & Multiple Instances:** Added support for multiple-instance widgets stored in `dashboard_widgets_data` settings. Added four new widget types: **Notepad** (`quick_notes`) with local font picker (sans, serif, mono) and debounced auto-saving; **Mini-Chart** (`analytics`) displaying last 6 months for a configured metric (study hours, workouts, habits, running, cycling) with inline metric switcher; **Custom Text** (`custom_text`) rendering markdown parsed via marked.js; and **Clock** (`greeting`) with a personalized time-based greeting, date, and local time updating every 10 seconds.
- **Widget Customization & Options:** Implemented widget settings popup modal in Edit Mode (via gear ⚙️ icon on cards) to change custom widget titles, apply border color overrides, adjust widget-specific settings, and delete widget instances. Added "Add Widget Instance" dropdown selection in Customizer panel to create and append new widget instances. Bumped service worker cache to `tylo-v56`.
- **Dashboard Grid & Customization:** Added a customizable dashboard grid system supporting a 12-column desktop grid and a 6-column mobile grid. Added visual theme options (Glassmorphism, Minimalist Cyberpunk, Flat Material) and preconfigured layout templates (Balanced, Academic Focus, Active/Healthy, Minimalist). Implemented full drag-and-drop widget swapping, drag-to-grid placement, and intuitive mouse/touch resizing handles to customize grid column/row spans. Persisted layouts and styling preferences to the backend database settings.
- **Dashboard Content Integration:** Integrated all core content widgets (Deadlines, Today's Plan, Habits, Workouts, Tasks, Shortcuts) into the grid layout as customizable drag-and-drop cards. Added a unified **Quick Add** widget to quickly create events, tasks, habits, workouts, or exams directly from the dashboard. Added a **Recent Files** widget displaying the 5 most recently uploaded files with inline download and preview actions. Renamed 'today' layout widgets to 'today_plan' with automatic backward compatibility mapping. Bumed service worker cache to `tylo-v55`.


## 1.3.0 — 2026-06-15

- **Software Update Notifications:** Added a non-obtrusive version check system that polls GitHub's API to subtly notify the user via a settings badge and bottom-right banner when an update is available, showing the command-line updates to run.
- **PWA & Offline Mode Support:** Implemented a robust IndexedDB synchronization queue to allow viewing, creating, editing, and deleting notes, tasks, and events offline. Intercepted all client-side API requests to resolve state/settings from the database cache when offline and queue mutations (`POST`, `PUT`, `DELETE`). Added optimistic UI updates for instant feedback, a sticky "Working Offline — X changes pending" banner at the top of the viewport, automatic sequence replay on reconnect, and aggressive Service Worker asset caching.
- **Advanced Task Management:** Added custom categories/tags with custom color pickers and dynamic badge styling, HTML5 drag-and-drop prioritization, nested checklists for subtasks, a datetime-local picker for due dates/times, filtering out subtasks from the dashboard open to-dos list, and automated ntfy reminders for overdue tasks and tasks due in the next 24 hours in the morning agenda.
- **Notes Editor Enhancements:** Upgraded markdown rendering to use `marked.js` with custom wiki-style cross-link support and safe HTML escaping. Replaced manual Edit/View modes with a responsive dual-pane split layout (side-by-side on desktop, stacked on mobile). Added real-time word/character counters and a debounced autosave status indicator (Typing, Saving, Saved at timestamp). Added per-note persistence of Read Mode and Split View toggle preferences, as well as automatic active tab and active note restoration across page reloads. Added a toggle setting in the Appearance card to enable or disable active tab persistence. Styled the note search bar larger and full-width in Read Mode. Added Enter key navigation to step through search results in all search bars.

- **2FA Recovery Help:** Added a small, secure hint on the login page's 2FA screen explaining how to recover access (deleting `totp_secret` from the database `kv` table).
- **Calendar Sync Fixes:** Fixed ICS calendar import to parse and convert UTC and timezone-aware datetimes to the server's local timezone. Added extraction, unescaping, and synchronization support for event locations and descriptions.
- **File Manager Upgrades:** Implement nested directory folders with tree-navigation breadcrumbs, full-tab visual drag-and-drop upload zone overlay, centered media preview modal for image, video, audio, and PDF formats, and inline renamers for files and folders. Added multiselect checkbox controls for bulk file management (batch deletion and dropdown moves) and interactive drag-and-drop support to move selected files into subfolder list items or relocate them out of directories using droppable breadcrumb path links. Added a recursive files search scoped to the current folder and its subfolders, displaying the location path in the metadata.
- **Files Search Bugfix:** Fixed a ReferenceError when typing in the files search bar by binding `renderFiles` to the global `window` object in `app.js` and bumping the service worker cache version to `tylo-v38`.
- **Event Modal Enhancements:** Support for saving the event modal by pressing the "Enter" key on any input/select element (excluding the description textarea and custom reminder inputs), and display the event location pin `📍` and text directly below the time range on timed event cards.
- **Dashboard Shortcuts:** Custom user-defined website shortcuts directly visible on the dashboard.
- **Customization:** Persistent custom accent color picker for UI theming.
- **Mobile Navigation:** Bottom navigation bar for improved mobile experience.
- **Week Planner Visuals & Overlaps:** Google Calendar style greedy interval-clustering overlapping layout, dotted half-hour lines in the time grid background, a red indicator dot at the left edge of the current time line, and drag-to-select support to easily schedule events across custom time ranges.
- **High-Performance Rendering:** Event drag/drop, resizing, and modal saves/deletes update the UI instantly using optimistic rendering and background API calls, preventing full-screen blank flashing and UI freezing. Added layout scroll-locking guards to prevent the calendar viewport from shifting or scrolling down during view updates or drag-and-resize interactions.
- **Keyboard Shortcuts:** Global hotkeys (`t`, `w`, `d`, `m`, `n`, `p`, `c`) for navigation, with a dedicated customization modal and "⌨️ Shortcuts" header button to review, modify, and persist custom shortcut keys.
- **Notes & Files:** Gold/yellow visual highlight for favorited items.
- **File storage:** upload files, search by filename, sort by date/name/size,
  and download them from a dedicated Files tab. Files are stored in
  `data/uploads/` on disk; metadata is in the `files` table. Uploaded files
  are not included in JSON backups — back up `data/uploads/` separately.
- **Notes search:** global search bar in the note list filters by title and
  body (with highlighted snippets); a per-note search bar lets you search
  within the open note, with match count and ↑/↓ navigation in both edit
  and view modes.
- **Test suite:** added `test_app.py` (stdlib `unittest` + Flask test client,
  no new dependencies) covering the generic CRUD API and the auth/routing
  guard. Run with `python -m unittest test_app`. See `docs/development.md`.

## 1.2.0 — 2026-06-10

- Restructured documentation for public release: new README, `docs/` folder
  (install, configuration, integrations, development), CONTRIBUTING,
  SECURITY, GPLv3 LICENSE, changelog.
- Install guide with a one-command Docker setup for Ubuntu servers.

## 1.1.0 — 2026-06-10

- **Mobile PWA:** installable on phone home screens (manifest, service
  worker, app icons).
- **Push notifications via ntfy:** morning agenda, exam alerts at
  configurable day-thresholds, evening habit nudge.
- **Calendar auto-sync:** background re-import of subscribed iCal URLs.
- **Two-factor authentication (TOTP)** with QR setup.
- **Automatic nightly JSON backups** (newest 14 kept) + manual backup button.

## 1.0.0 — 2026-06-10

- Initial release: dashboard, week planner, exams & grades (ECTS-weighted
  average), habit tracker with streaks, workout tracker with Strava sync,
  to-dos, notes, 12-month analytics.
- Login with session auth; secret-key-protected iCal feed; ICS
  import/export; JSON backup/restore; dark/light theme.
- Docker + docker-compose deployment, SQLite storage.
