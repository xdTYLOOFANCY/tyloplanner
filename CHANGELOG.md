# Changelog

All notable changes to TyloPlanner are documented here.

## Unreleased

- **Dashboard Shortcuts:** Custom user-defined website shortcuts directly visible on the dashboard.
- **Customization:** Persistent custom accent color picker for UI theming.
- **Mobile Navigation:** Bottom navigation bar for improved mobile experience.
- **Week Planner:** Drag-and-drop functionality for easier event scheduling.
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
