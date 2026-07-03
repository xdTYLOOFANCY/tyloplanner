# Session handoff — Notes editor overhaul

Branch: `claude/claude-md-docs-qovdyz` · PR: **#3**
(`https://github.com/xdTYLOOFANCY/tyloplanner/pull/3`)
App version: `1.11.0` (`VERSION` in `helpers.py`).

Everything below is committed and pushed. The working tree is clean.

## What this branch does (one line)

Replaces the Markdown-textarea Notes editor with a Google-Docs-style **Quill
WYSIWYG** editor and layers on rich features, version history, and polish — all
without a bundler and with only one new (vendored) frontend dependency.

## Commits (newest first)

| Commit | Summary |
|---|---|
| `6eb1751` | Fix toolbar dropdown clipping; export image overflow + inline images; **image resize/align**; **auto-linkify** URLs |
| `3fbe805` | **Basic tables** (Quill table module + contextual row/col toolbar) |
| `ccd30aa` | **`/` slash menu** + **`[[wiki-links]]`** |
| `33ae62f` | **Version history** (time-bucketed snapshots, restore) + Ctrl+Z cross-note fix |
| `d6c9144` | Perf/a11y: self-host Inter font, lazy-load Quill, offline image cache, aria-labels, `dvh` |
| `5b270c8` | Google-Docs redesign (centered page + sticky toolbar) + alignment/sub-sup/font/size/find-replace |
| `215bee1` | WYSIWYG rewrite (vendored Quill 2.0.3, `body_format`, server HTML sanitizer) |
| `89f7447` | Refresh `CLAUDE.md` / `docs/development.md` |

## Architecture of the Notes changes

- **Editor:** Quill 2.0.3, vendored prebuilt at `static/js/quill.js` +
  `static/js/quill.snow.css` (pulled from the npm registry, since CDNs are
  blocked by the sandbox proxy). Loaded **lazily** on first note-open via
  `ensureQuill()` in `static/js/notes.js` (it's not on the default Dashboard).
- **Storage:** notes store sanitized rich **HTML** in `notes.body`.
  `notes.body_format` (`'md'` legacy | `'html'`) — migration `017`. Legacy
  Markdown notes convert to HTML on first open (`mdToHtml`) and persist as HTML
  on first edit. `_MAX_BODY = 500_000` cap in `blueprints/api.py`.
- **Sanitizer:** `sanitize_note_html()` in `helpers.py` — a stdlib
  `html.parser` allowlist. Runs on create/update when `body_format == 'html'`.
  Allows Quill's tags/classes (incl. tables, `ql-align-*`, `ql-size-*`,
  `<sub>/<sup>`, `img` with `width`, `a[href="#note-…"]`); strips scripts,
  handlers, `javascript:`/unknown `data:` URLs, unsafe styles.
- **Version history:** `note_revisions` table (migration `018`, `ON DELETE
  CASCADE`, **not** in `TABLES`/state). Snapshot on save at most once per
  ~10 min (`record_note_revision` in `helpers.py`); endpoints
  `GET/POST /api/notes/<id>/revisions[/<rid>][/restore]` in `blueprints/api.py`.
- **All editor UX lives in `static/js/notes.js`** (~2400 lines). Key pieces:
  - Slash menu + wiki-link autocomplete share one caret-anchored popup
    (`maybeTriggerEditorPopup`, `openSlashMenu`, `openWikiMenu`).
  - Wiki-links are ordinary `#note-<id>` anchors (no schema change);
    a delegated click handler opens the target note.
  - Tables via Quill's built-in module + `.note-table-tools` floating bar.
  - Image resize/align overlay (`buildImgOverlay`, drag handle sets `width`).
  - `autoLinkify()` on `text-change` handles typed + pasted URLs.
  - Trigger checks are `setTimeout(…,0)`-deferred because `getSelection()` is
    stale inside `text-change` (see "Gotchas").
- **CSS:** all Quill/editor styling in `static/style.css`, themed to the app's
  CSS variables so it works in every theme + light/dark.

## Run & test

```bash
pip3 install -r requirements.txt        # note: pywebpush/http-ece fail to build in this sandbox
python3 app.py                          # dev server :8000 (no login)
python3 -m unittest test_app            # backend suite
node --check static/js/notes.js         # frontend syntax
```

Backend suite: **119 tests**. Two errors are **pre-existing and
environment-only** — `NotificationTests` fail because this container's
`cryptography` Rust binding panics on import (`pyo3_runtime.PanicException`).
Unrelated to this branch.

Frontend was verified with headless Chromium (Playwright is global at
`/opt/node22/lib/node_modules`; browser at `/opt/pw-browsers`). Scratch test
scripts (`livetest*.js`) live in the session scratchpad, not the repo.

## Gotchas (learned the hard way — save the next session time)

- **Quill `getSelection()` is stale inside `text-change`.** Defer trigger logic
  with `setTimeout(fn, 0)` (used for slash menu, wiki-links, auto-linkify). The
  very first `/` in an empty note otherwise never opens the menu.
- **Playwright HTTP cache is pinned per-origin.** When re-testing edited JS,
  launch with `args:["--disk-cache-size=1"]`, `serviceWorkers:'block'`, **and a
  fresh port** — otherwise you test stale code. This caused several phantom
  "failures" that were not real bugs.
- **Autosave debounces 500 ms.** Reads of `/api/state` in tests must wait
  ≥600 ms after the last edit or they see the pre-save body.
- **`notes[0]` in `/api/state` is the seeded welcome note**, not your newest
  note. Track ids via `localStorage.active_note_id`.
- **Checklists:** `quill.format('list','unchecked')` (not `'check'`, which the
  toolbar button special-cases).
- Killing servers with `pkill -f app.py` sometimes kills the tool shell; kill
  by explicit PID instead.
- **`/ponytail` plugin is not installed** in this remote container — run it
  locally if the project's review flow needs it.

## Deferred / possible next steps

- **Image crop/"snip"** — resize + align shipped; crop needs a small canvas
  editor (heavier). User expressed mild interest.
- **`/api/state` payload trimming** — bodies (now bulkier HTML) ship in the full
  state snapshot. Moving bodies out (fetch-on-open) would slim first paint but
  touches list-search snippets, export, and the offline cache. Deferred as a
  focused change.
- **CSP hardening** — `script-src` still allows `'unsafe-inline'` +
  `'unsafe-eval'` (inline `onclick=` handlers everywhere + Quill needs eval).
  Removing them is a large event-delegation refactor.
- **A11y sweep** — `aria-label`s added to the Notes UI + modal closes; the rest
  of the app's icon buttons still mostly rely on `title`.
- Quill tables are intentionally **basic** (no cell merge / column resize).
