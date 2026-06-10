# Configuration

All deployment configuration lives in `.env` (copy `.env.example` to get
started). Day-to-day preferences (notifications, calendar sync) are set in
the app under **Settings** and stored in the database.

## .env reference

| Variable | Default | Description |
|---|---|---|
| `AUTH_USERNAME` | `admin` | Login username. |
| `AUTH_PASSWORD` | *(empty)* | Login password. **If empty, the app runs without a login screen** — fine on a private laptop, dangerous anywhere else. |
| `SECRET_KEY` | auto-generated | Key used to sign session cookies. Generated and stored in the database on first run; set it explicitly only if you want sessions to survive a database reset. |
| `APP_URL` | `http://localhost:8000` | Public URL of your instance. Used to build the calendar feed URL and the Strava OAuth redirect — set it to your real address when hosting on a server or domain. |
| `PORT` | `8000` | Port the server listens on. |
| `DB_PATH` | `data/tyloplanner.db` (`/data/tyloplanner.db` in Docker) | SQLite database location. |
| `BACKUP_DIR` | `<db dir>/backups` | Where nightly JSON backups are written. |
| `STRAVA_CLIENT_ID` / `STRAVA_CLIENT_SECRET` | *(empty)* | Strava API credentials — see [Integrations](integrations.md#strava). |

Apply changes with `docker compose up -d --build`.

## Authentication

- Credentials are checked with constant-time comparison and a 1-second delay
  on failure to slow brute-forcing.
- Sessions are signed cookies; **Log out** in the header clears them.
- **Two-factor authentication (TOTP):** enable under **Settings → Security**.
  Scan the QR code with any authenticator app (Google Authenticator, Aegis,
  1Password…) and confirm with a code. Login then requires a 6-digit code
  after the password.
  - Lost your authenticator? Delete the `totp_secret` row from the `kv`
    table: `sqlite3 data/tyloplanner.db "DELETE FROM kv WHERE key='totp_secret'"`
- The calendar feed (`/calendar.ics`) can't use cookies, so it is protected
  by a secret key embedded in the feed URL (shown in Settings). Treat that
  URL like a password. Rotate it by deleting the `feed_key` row from the
  `kv` table.

## Data, backups & restore

- **Everything** is stored in one SQLite file (`data/tyloplanner.db`).
  Copying that file *is* a full backup.
- A JSON snapshot is also written to `data/backups/` every night at ~03:30
  (newest 14 kept). Trigger one manually with **Settings → Security →
  Backup now**.
- The **Backup** button in the header downloads a JSON snapshot to your
  device; **Restore** loads one back (replaces all current data). Restore
  accepts the nightly snapshots too.

## Theming

Toggle dark/light with the ☀/☾ button (stored per browser). All colors are
CSS variables at the top of `static/style.css` — edit them to re-skin the
entire app.
