# Changelog

All notable changes to TyloPlanner are documented here.

## Unreleased

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
  SECURITY, MIT LICENSE, changelog.
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
