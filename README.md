# TyloPlanner — self-hosted personal dashboard

A small, hackable web app for students: week planner, exam countdowns & grades,
habit tracker, workout tracker (with Strava sync), to-dos, notes, and an
analytics dashboard with your historical data. With a built-in login screen.
All data stays on your machine in a single SQLite file.

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

## Authentication

- Username/password come from `.env` (`AUTH_USERNAME`, default `admin`, and
  `AUTH_PASSWORD`). Change the password by editing `.env` and restarting.
- If `AUTH_PASSWORD` is empty, the app runs **without** a login (handy for a
  laptop, dangerous on a public server).
- The calendar feed can't use cookies, so it's protected by a secret key in
  the feed URL instead (shown in Settings). Treat that URL like a password;
  delete the `feed_key` row from the `kv` table to rotate it.
- Sessions are signed with a key generated on first run (or set `SECRET_KEY`).

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
