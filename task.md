# Task List - Prepare and Verify Release

- `[x]` Read CLAUDE.md and analyze git diff
- `[x]` Run and pass test suite in virtual environment (`.venv/bin/python -m unittest test_app`)
- `[x]` Implement `db_retry` decorator and update `db` context manager in `helpers.py`
- `[x]` Decorate write operations in `blueprints/calendar.py`
- `[x]` Decorate write operations in `blueprints/files.py`
- `[x]` Update `CLAUDE.md` package dependencies count (6 -> 8)
- `[x]` Update `SECURITY.md` login brute-force description (1-second delay -> non-blocking IP rate limiter)
- `[x]` Update `docs/configuration.md` to reflect new authentication rate limiting
- `[x]` Update `docs/development.md` CRUD tables list, notification endpoints, and package count
- `[x]` Update `docs/integrations.md` notification section to document Web Push
- `[x]` Update `README.md` to list Pomodoro Study Timer and Web Push notifications features
- `[x]` Update `walkthrough.md` to serve as a comprehensive release walkthrough
- `[x]` Confirm with user for git commit, push, and release
