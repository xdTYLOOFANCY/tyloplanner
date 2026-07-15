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
| `STRAVA_CLIENT_ID` / `STRAVA_CLIENT_SECRET` | *(empty)* | Optional — Strava keys are normally entered in the web UI (Settings → Strava). Env values override the UI. See [Integrations](integrations.md#strava). |

Apply changes with `docker compose up -d --build`.

## Authentication

- **Password Hashing:** Passwords are hashed using the strong `scrypt` algorithm and stored in the database.
- **Initial Setup:** The environment variable `AUTH_PASSWORD` serves as the initial password setup (bootstrapped into the database on first run).
- **Password Management:** You can change your password directly in the application under **Settings → Security** using the "Change Password" form. Once changed, the password stored in the database is used instead of the environment variable.
  - **Emergency Password Reset:** If you are locked out, you can reset your password directly from the host terminal:
    ```bash
    python app.py --reset-password "new_password"
    ```
- Credentials are checked with username comparison and scrypt verification, combined with a non-blocking in-memory IP rate limiter (blocks after 5 failed attempts in 60 seconds) on failure to slow brute-forcing.
- Sessions are signed cookies; **Log out** in the header clears them.
- **Two-factor authentication (TOTP):** enable under **Settings → Security**.
  Scan the QR code with any authenticator app (Google Authenticator, Aegis,
  1Password…) and confirm with a code. Login then requires a 6-digit code
  after the password.
  - **Emergency Disable:** If you lost your authenticator device, you can disable 2FA from the host terminal:
    ```bash
    python app.py --disable-2fa
    ```
    (Alternatively, you can delete the `totp_secret` row from the database manually: `sqlite3 data/tyloplanner.db "DELETE FROM kv WHERE key='totp_secret'"`)
- The calendar feed (`/calendar.ics`) can't use cookies, so it is protected
  by a secret key embedded in the feed URL (shown in Settings). Treat that
  URL like a password. Rotate it by deleting the `feed_key` row from the
  `kv` table.

## Data, backups & restore

- **Everything** is stored in one SQLite file (`data/tyloplanner.db`).
  Copying that file *is* a full backup.
- A JSON snapshot is also written to `data/backups/` every night at ~03:30
  (newest 14 kept). Trigger one manually with **Settings → Data → Backup now**.
- The **Backup** button in the header downloads a JSON snapshot to your device; **Restore** in the header loads one back (replaces all current data).
- Alternatively, you can view a list of all automatic nightly backups directly in **Settings → Data** and restore from any of them with a single click after confirmation.

## Server Logging

Every HTTP request is logged to `stdout` in the standard Apache Combined Log format:
```text
127.0.0.1 - - [25/Jun/2026:15:05:12 +0200] "GET /api/state HTTP/1.1" 200 4567 "http://localhost:8000/" "Mozilla/5.0..."
```
This is useful for debugging routing issues and tracking security incidents (like brute-force login attempts). If you run the application in a Docker container, these logs are captured by Docker and can be viewed using:
```bash
sudo docker compose logs -f
```

## Theming

Toggle dark/light with the ☀/☾ button (stored per browser). All colors are
CSS variables at the top of `static/style.css` — edit them to re-skin the
entire app.
