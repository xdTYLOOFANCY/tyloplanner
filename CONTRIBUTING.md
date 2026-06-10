# Contributing

Thanks for considering a contribution! TyloPlanner aims to stay **small,
readable and dependency-light** — that's the main thing to keep in mind.

## Getting started

```bash
git clone https://github.com/xdTYLOOFANCY/tyloplanner.git
cd tyloplanner
pip install -r requirements.txt
python app.py          # http://localhost:8000, no login in dev
```

There's no build step: backend changes need a restart, frontend changes just
a browser refresh. See [docs/development.md](docs/development.md) for the
architecture, API reference and a step-by-step "adding a feature" recipe.

## Pull requests

- Keep PRs focused — one feature or fix per PR.
- New dependencies need a good reason; prefer the standard library.
- Frontend stays vanilla JS (no frameworks, no bundlers). Escape any
  user-provided content with the `esc()` helper.
- All SQL must be parameterized; never interpolate user input into queries.
- Test your change manually: fresh database, with and without
  `AUTH_PASSWORD` set, and in Docker if you touched the build.

## Bug reports

Open an issue with: what you did, what you expected, what happened instead,
plus your setup (Docker or native, browser, relevant `docker compose logs`
output). For anything security-sensitive, see [SECURITY.md](SECURITY.md)
first.
