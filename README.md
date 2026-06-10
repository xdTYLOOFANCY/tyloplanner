# TyloPlanner — self-hosted personal dashboard

A small, hackable web app for students: week planner, exam countdowns & grades,
habit tracker, workout tracker (with Strava sync), to-dos, notes, and an
analytics dashboard with your historical data. With a built-in login screen,
optional 2FA, push notifications, and PWA mobile support.
All data stays on your machine in a single SQLite file.

> **Installing on a server?** See [INSTALL.md](INSTALL.md) for a one-command
> Ubuntu/Docker install, HTTPS setup, and update commands.

## Quick start (Docker)

```bash
cp .env.example .env        # set AUTH_PASSWORD! (and Strava keys if wanted)
docker compose up -d --build
```

Open http://localhost:8000 and sign in. Data is stored in `./data/tyloplanner.db`.

Update after editing code: `docker compose up -d --build`
Logs: `docker compose logs -f` · Stop: `docker compose down` (data is kept).

## Run without Docker

```bash
pip install -r requirements.txt
AUTH_PASSWORD=yourpassword python app.py    # http://localhost:8000
```

## Phone app (PWA)

TyloPlanner is installable: open it in Chrome/Safari on your phone and choose
**Add to Home Screen**. It launches fullscreen with its own icon like a native
app. Static assets are cached by a service worker; your data always comes
fresh from the server.

## Notifications & reminders (ntfy)

Get free push notifications on your phone without any accounts:

1. Install the **ntfy** app (Android/iOS) or use https://ntfy.sh in a browser.
2. In the app, subscribe to a topic with a long random name
   (e.g. `tylo-jkx29vqp-reminders` — anyone who knows the name can read it).
3. In TyloPlanner **Settings → Notifications**, enter that topic, save,
   and hit *Send test notification*.

You'll then get a **morning agenda** (today's events + exam alerts at your
chosen days-before thresholds) and an **evening habit nudge** for unchecked
habits. Times are configurable; notifications are skipped when there's
nothing to say.

## Calendar auto-sync

Besides manual `.ics` import, **Settings → Calendar auto-sync** accepts iCal
URLs (university timetable, Google Calendar secret address). A background
worker re-imports them on your chosen interval, deduplicated.

## Automatic backups

A JSON snapshot of all data is written to `data/backups/` every night
(newest 14 kept). Trigger one manually with *Backup now* in
Settings → Security. Restoring works via the header Restore button.

## Authentication

- Username/password come from `.env` (`AUTH_USERNAME`, default `admin`, and
  `AUTH_PASSWORD`). Change the password by editing `.env` and restarting.
- If `AUTH_PASSWORD` is empty, the app runs **without** a login (handy for a
  laptop, dangerous on a public server).
- The calendar feed can't use cookies, so it's protected by a secret key in
  the feed URL instead (shown in Settings). Treat that URL like a password;
  delete the `feed_key` row from the `kv` table to rotate it.
- Sessions are signed with a key generated on first run (or set `SECRET_KEY`).
- **Two-factor authentication (TOTP):** enable in Settings → Security — scan
  the QR with Google Authenticator/Aegis/1Password and confirm with a code.
  Login then asks for a 6-digit code after the password. Lost your device?
  Delete the `totp_secret` row from the `kv` table in the database.

## Features

- **Dashboard** — today's plan, habits, deadlines, weekly training, open to-dos.
- **Analytics** — all-time totals and 12-month history: workout sessions,
  km run/cycled, study hours (from planner "Study" blocks with start/end times),
  habit check-ins, and a grade list with ECTS-weighted average.
- **Planner** — weekly agenda; blocks typed as Study / Workout / Other.
- **Exams & grades** — countdowns, ECTS, enter grades when you get them.
- **Habits** — daily checkboxes + streaks.
- **Workouts** — log run/bike/gym manually or sync from Strava.
- **Backup/Restore** — JSON snapshot buttons in the header. The SQLite file
  `data/tyloplanner.db` can also be copied/backed up directly.

## Calendar integration

**Export (subscribe):** your planner + exams are published as an iCal feed —
copy the secret feed URL from **Settings**.
- Google Calendar: *Other calendars → + → From URL* (server must be reachable
  from the internet for Google to fetch it).
- Apple Calendar: *File → New Calendar Subscription*.
- Or just download the `.ics` from Settings and import it anywhere.

**Import:** Settings → Calendar import. Upload an `.ics` file, or paste a
calendar URL (e.g. Google Calendar's "secret address in iCal format" from its
settings page). Recurring events are imported as their first occurrence only;
times are taken as-is (timezones are not converted).

## Strava integration

1. Create a free API application at <https://www.strava.com/settings/api>.
   Set **Authorization Callback Domain** to `localhost` (or your domain).
2. Put `STRAVA_CLIENT_ID` and `STRAVA_CLIENT_SECRET` in `.env`,
   then `docker compose up -d --build`.
3. Open **Settings → Strava → Connect Strava**, approve, done.
   Runs/rides/weight training sync into Workouts (deduplicated, up to your
   last 1000 activities). Re-sync any time with the ⟳ button.

## Hacking on it

- `app.py` — Flask backend: auth, REST API (`/api/...`), ICS import/export,
  Strava OAuth.
- `static/` — the whole frontend, plain HTML/CSS/JS, no build step.
  `index.html` + `app.js` + `style.css`, plus `login.html` and `logo.svg`.
- Database schema is created automatically on first run (see `SCHEMA` in app.py).

Ideas: add a Pomodoro timer, flashcards, weight/sleep tracking (new table +
two render functions), multi-user support, or HTTPS via a reverse proxy.

## Security notes

- Single-user login with credentials from `.env`; sessions via signed cookies.
- For internet exposure, still put it behind HTTPS (Caddy/Traefik/nginx) —
  the built-in server speaks plain HTTP, so the password would otherwise
  travel unencrypted. A VPN like Tailscale is the easy safe option.
