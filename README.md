<p align="center">
  <img src="static/logo.svg" width="90" alt="TyloPlanner logo">
</p>

<h1 align="center">TyloPlanner</h1>

<p align="center">
  A self-hosted personal dashboard for students.<br>
  Week planner · exams & grades · habits · workouts · study tracker — on your own server, with your own data.
</p>

<p align="center">
  <img alt="License: GPL v3" src="https://img.shields.io/badge/license-GPLv3-blue.svg">
  <img alt="Python 3.10+" src="https://img.shields.io/badge/python-3.10%2B-blue">
  <img alt="Docker ready" src="https://img.shields.io/badge/docker-ready-2496ED">
  <img alt="PWA" src="https://img.shields.io/badge/mobile-PWA-7c5cff">
</p>

---

**[tyloplanner.brambiemans.com](https://tyloplanner.brambiemans.com/)** — screenshots, feature overview, and live demo.

---

## Why TyloPlanner?

Most planner apps want a subscription, your data, or both. TyloPlanner is a
single lightweight container you run yourself: no accounts, no tracking, no
cloud. Everything lives in one SQLite file on your machine, and the whole
codebase is under 20,000 lines of clean, modular code, making it easy to understand in a weekend and make your own.

## Features

- **Dashboard** — today's plan, habits, upcoming deadlines, weekly training, to-do list, and customizable website shortcuts (with custom ordering, toggling, and visibility) at a glance.
- **Week planner** — drag-and-drop event scheduling, drag-to-select for scheduling custom time ranges, interactive event resizing, automatic scrolling to the current time, location pins, and a smart overlapping layout (greedy interval-clustering). Supports subscribing to/exporting a built-in calendar feed.
- **Calendar auto-sync** — keep your schedule up to date by syncing university timetables or other shared calendar feeds (iCal URLs) at configurable intervals. Automatically parses event locations and descriptions, and offsets UTC/timezone-aware dates to match the server's local timezone.
- **Exams & grades** — countdowns to every exam, ECTS-weighted grade point average tracking, and task/exam reminders.
- **Habits** — check off daily habits, track completion streaks, and receive automated evening nudges for incomplete items.
- **Workouts** — log runs, rides, and gym sessions manually or sync them automatically with **Strava** integration.
- **Study Timer & Pomodoro Tracker** — Alpine.js circular countdown timer and stopwatch, customizable study/break intervals, active subject tracking, audio chime alerts, state persistence, and logs.
- **Advanced Task Management** — organize tasks using custom categories with styled color tags, drag-and-drop prioritization, subtask checklists, and datetime-local due date/time fields.
- **Notes Editor** — a Quill WYSIWYG editor with tables, callouts, images, a `/` slash menu, wiki-style cross-links (`[[Note Title]]`), tags & templates, an outline sidebar, per-note version history, and export to Markdown, Word, HTML or print. Bodies are sanitized server-side and saved with debounced background autosaving.
- **File Manager** — upload documents/images via a full-screen drag-and-drop upload zone, preview media inline, organize with nested directories and breadcrumb navigation, and manage files in bulk.
- **Study Tracker** — log study sessions with subject, minutes and a "what was studied?" note; see range-scoped stat cards (hours studied vs planned, sessions, study days), a planned-vs-actual chart and an hours-by-subject breakdown. Workout, distance, training-load and habit-consistency charts live on their own tabs, each with all-time totals.
- **Keyboard shortcuts** — navigate swiftly across tabs and weeks with customizable global hotkeys (`t`, `w`, `d`, `m`, `n`, `p`, `c`) and a visual key customization modal.
- **Theming & Customization** — toggle dark/light modes, choose from Glassmorphism, Flat, or a polished Cyberpunk retro-neon aesthetic (with a retro-grid Light Mode overhaul), and personalize the UI with a persistent custom accent color picker.
- **Notifications** — morning agendas (including overdue/upcoming tasks), evening habit nudges, and exam alerts pushed directly to your phone via [ntfy](https://ntfy.sh) or natively through browser **Web Push notifications** (using programmatic VAPID keys).
- **Mobile app (PWA) & Offline Sync** — install as a PWA for a fullscreen mobile experience. Touch-friendly swipe gestures let you delete notes or complete tasks, floating action buttons (FABs) provide quick entry shortcuts, and a phone camera capture option lets you upload photos directly to the File Manager. IndexedDB offline sync queues your actions while offline and replays them automatically when your connection is restored.

- **Secure & Resilient** — session-based authentication, optional TOTP two-factor authentication (2FA), nightly automated database backups, and one-click restore directly from the settings panel.

## Quick start

Requires [Docker](https://docs.docker.com/engine/install/) with the compose plugin.

```bash
git clone https://github.com/xdTYLOOFANCY/tyloplanner.git
cd tyloplanner
cp .env.example .env
docker compose up -d --build
```

Open **http://localhost:8000** — the first visit shows a **setup screen**
where you create your account (username + password, stored hashed in your
own database). Change either later under **Settings → Security**.

Forgot your password? Reset it from the terminal:
`docker compose exec tyloplanner python app.py --reset-password "new-password"`.

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
├── app.py              # application entry point & app factory
├── helpers.py          # config, database init, generic helpers
├── scheduler.py        # background jobs (auto-sync, backups, notifications)
├── blueprints/         # Flask routes per feature (auth, api, calendar, etc.)
├── static/             # frontend files
│   ├── index.html      # app shell
│   ├── app.js          # main UI entry point (wires modules to window)
│   ├── js/             # UI modules per feature (ES modules)
│   ├── style.css       # theming (dark/light, custom accent)
│   ├── login.html      # sign-in + 2FA page
│   └── sw.js           # PWA service worker
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

[GPLv3](LICENSE)
