# Changelog

All notable changes to TyloPlanner are documented here.

## Unreleased

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
