<p align="center">
  <img src="static/logo.svg" width="90" alt="TyloPlanner logo">
</p>

<h1 align="center">TyloPlanner</h1>

<p align="center">
  A self-hosted personal dashboard for students.<br>
  Week planner · exams & grades · habits · workouts · analytics — on your own server, with your own data.
</p>

<p align="center">
  <img alt="License: MIT" src="https://img.shields.io/badge/license-MIT-green">
  <img alt="Python 3.10+" src="https://img.shields.io/badge/python-3.10%2B-blue">
  <img alt="Docker ready" src="https://img.shields.io/badge/docker-ready-2496ED">
  <img alt="PWA" src="https://img.shields.io/badge/mobile-PWA-7c5cff">
</p>

---

## Why TyloPlanner?

Most planner apps want a subscription, your data, or both. TyloPlanner is a
single lightweight container you run yourself: no accounts, no tracking, no
cloud. Everything lives in one SQLite file on your machine, and the whole
codebase is small enough to read in an afternoon and make your own.

## Features

- **Dashboard** — today's plan, habits, upcoming deadlines, weekly training and your to-do list at a glance.
- **Week planner** — plan study blocks and appointments; subscribe to the built-in calendar feed from Google/Apple/Outlook.
- **Calendar auto-sync** — point it at your university timetable's iCal URL and it stays up to date.
- **Exams & grades** — countdowns to every exam, enter grades as they come in, ECTS-weighted average.
- **Habits** — daily check-offs with streaks and an evening reminder for whatever's still open.
- **Workouts** — log runs, rides and gym sessions by hand or sync them automatically from **Strava** (requires subscription).
- **Analytics** — 12-month history of workouts, distance, study hours and habit consistency, plus all-time totals.
- **Notes** — write and organize markdown notes with full-text search, rich formatting, and linked cross-references.
- **File storage** — upload and store documents, images and other files on your own server with no size limits.
- **Notifications** — morning agenda and exam alerts pushed to your phone via [ntfy](https://ntfy.sh) (free, no account).
- **Mobile app (PWA)** — *Add to Home Screen* on your phone and it runs fullscreen with its own icon.
- **Secure** — login screen, optional TOTP two-factor authentication, secret-key-protected calendar feed, automatic nightly backups.

## Quick start

Requires [Docker](https://docs.docker.com/engine/install/) with the compose plugin.

```bash
git clone https://github.com/xdTYLOOFANCY/tyloplanner.git
cd tyloplanner
cp .env.example .env
nano .env                   # set AUTH_PASSWORD to your own password here
docker compose up -d --build
```

Open **http://localhost:8000** and sign in:

- **Username:** `admin` (that's the `AUTH_USERNAME` default in `.env`)
- **Password:** whatever you set as `AUTH_PASSWORD` in `.env`

Forgot what you set? Your credentials are always visible with
`grep AUTH_ .env`. To change them, edit `.env` and run
`docker compose up -d --build` again.

Installing on a real server? The **[install guide](docs/install.md)** has a
one-command setup for Ubuntu, plus HTTPS and VPN options.

## Documentation

| Guide | What's inside |
|---|---|
| **[Install guide](docs/install.md)** | One-command Ubuntu install, updating, running without Docker, exposing to the internet safely |
| **[Configuration](docs/configuration.md)** | Every `.env` option, authentication & 2FA, backups and restore |
| **[Integrations](docs/integrations.md)** | Calendar import/export/auto-sync, ntfy notifications, Strava sync |
| **[Development](docs/development.md)** | Architecture, project layout, API reference, adding your own features |

## Project structure

```
tyloplanner/
├── app.py              # entire backend: Flask + SQLite, ~700 lines
├── static/             # entire frontend: vanilla HTML/CSS/JS, no build step
│   ├── index.html      #   app shell
│   ├── app.js          #   all UI logic
│   ├── style.css       #   theming (dark/light)
│   ├── login.html      #   sign-in + 2FA page
│   └── sw.js           #   PWA service worker
├── docs/               # user & developer guides
├── docker-compose.yml
├── Dockerfile
└── .env.example        # copy to .env and edit
```

Tech stack: **Flask · SQLite · vanilla JavaScript · Docker**. No frontend
framework, no build step, no external database — clone, edit, refresh.

## Contributing & security

Bug reports and pull requests are welcome — see
[CONTRIBUTING.md](CONTRIBUTING.md). For security issues, please read
[SECURITY.md](SECURITY.md) before opening a public issue.

## License

[MIT](LICENSE)
