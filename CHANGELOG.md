# Changelog

All notable changes to TyloPlanner are documented here.

## Unreleased

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
