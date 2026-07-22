# Changelog

All notable changes to TyloPlanner are documented here.

## 1.47.0 — 2026-07-22

- **The Settings tab is reorganized into clearer, better-grouped cards.** The
  old **Appearance** card had grown into a catch-all mixing looks, behavior,
  regional options, and music toggles. It's now split by purpose:
  - **🎨 Appearance** keeps only visual settings — theme style, navigation
    layout, density, and accent color.
  - **⚙️ General** (new) collects landing tab, persist-active-tab,
    start-with-sidebar-collapsed, week-start, and time zone (the standalone
    **Time zone** card is folded in here).
  - **🎵 Music player** (new) holds the two music player toggles that used to
    live under Appearance.
  - Cards now flow top-to-bottom from personalization → notifications →
    account/integrations/data/system.
- No settings were removed or renamed — everything is in a more logical place.

## 1.46.0 — 2026-07-21

- **The music player now pops out into a full browser tab** instead of a small
  window — more room to browse while your music plays. Playback still hands off
  cleanly between the main app and the pop-out.
- **New Appearance settings for music** (Settings → Appearance → Music player):
  - **Always open the music player in a new tab** — on desktop, the Music button
    in the sidebar/top bar opens (or focuses) the pop-out player tab instead of
    switching tabs.
  - **Only show the player bar on the Music tab** — hides the bottom progress bar
    everywhere except the Music tab. Your music keeps playing; the bar just
    stays out of the way.
- **Upload music straight from the Music tab.** The **+** button is now
  multi-purpose: **Upload music…** drops audio files into a dedicated **Music**
  folder in Files (created automatically), or **New playlist…** as before.

## 1.45.0 — 2026-07-21

- **The Music tab is redesigned around a Spotify-style three-pane layout.** The
  old Library / Playlists / Queue tabs — which all looked the same — are gone.
  In their place: a **Your Library** sidebar on the left (Songs, Recently
  added, and your playlists, each with cover art and track counts), a **content
  pane** in the middle with a big colored header (cover, title, song count +
  total time, and a large Play button), and a **Queue** panel on the right.
- **See what's up next, always.** The Queue panel shows **Now playing** (with an
  animated equalizer on the current track) and **Next up**, labeled with where
  it's playing from. **Drag to reorder** what's coming up, or **Clear** the rest
  of the queue. Right-click any song for **Play next** / **Add to queue**.
- **A real library, not a flat list.** Each playlist gets its own colored header
  so they no longer blur together, the track list has proper Title / Album /
  duration columns with hover-to-play row numbers, and **Sort** and **Search**
  live above the list. Playlists keep your own drag order.
- **Works everywhere it did before.** On phones the sidebar and queue slide in as
  drawers (tap ☰ or the queue icon); the **Pop out** player window, offline
  downloads, lock-screen controls, and the bottom player bar all carry over
  unchanged.

## 1.44.0 — 2026-07-21

- **Pop out the music player into its own window.** A new **Pop out** button in
  the Music tab opens a dedicated, distraction-free music window — just the
  library, playlists, queue, and player, with the rest of the app stripped
  away. Whatever's playing hands over to the pop-out automatically, and the
  main app pauses and hides its bottom player bar so Notes and everything else
  stay clean. A hint in the Music tab shows when playback lives in the pop-out;
  **Bring it back here** returns it to the main window and closes the pop-out.

## 1.43.0 — 2026-07-21

- **The Files tab is redesigned from scratch, Drive-style.** A left rail now
  holds a **＋ New** menu (new folder, upload files, upload a whole folder,
  camera), your full **folder tree** (collapsible, drag-onto-able), and the
  views **My Files, Starred, Recent, Trash, and Storage** — plus a live
  storage meter. The main pane shows breadcrumbs, folder cards, and files in
  list or grid view with sortable Name/Date/Size/Type (click again to flip
  direction).
- **Selection like a real file manager.** Hover checkboxes, Ctrl/Cmd-click,
  Shift-click ranges, Select all, and a context-aware action bar (Download /
  Move / Star / Trash). Every row and card also has a ⋯ menu, so all actions
  work on touch devices too.
- **A proper Move dialog.** "Move to…" opens a folder tree picker (with
  expand/collapse and an inline "New folder" button) instead of the old flat
  dropdown. Folders themselves can now be moved too — via the dialog or by
  dragging them onto another folder, a breadcrumb, or the tree.
- **Trash instead of instant deletion.** Deleting files or folders moves them
  to Trash; restore puts them back (resurrecting their original folder path).
  Trash auto-empties after a configurable number of days (default 30) and its
  contents still count toward your storage until emptied.
- **Storage limit.** Set a max file-storage size in GB under Storage; uploads
  are rejected with a clear message once the limit is reached. The rail meter
  turns orange at 80% and red at 95%.
- **Storage manager.** The new Storage view shows total usage as a segmented
  bar (images / video / audio / documents / archives / other / trash), what
  every part of the app uses (files, trash, notes text, database, backups),
  your biggest files, folders by size, and maintenance actions (empty trash,
  clean up orphaned files).
- **Much better previews.** Besides images, video, audio, and PDF, the
  preview modal now renders **Word documents (.docx)** — headings, bold/
  italic, lists, tables, hyperlinks, and embedded images — plus **Excel
  (.xlsx)**, **CSV/TSV** as tables, **Markdown**, and plain-text/code files.
  It gained a header with download / open-in-tab buttons and **‹ › arrows**
  (also arrow keys) to flip through the files in the current folder. Office
  previews are converted server-side with the Python standard library — no
  new dependencies — and rendered in a sandboxed frame.
- **Upload folders, keep their structure.** The New menu's "Upload folder"
  and OS drag-and-drop of directories recreate the folder hierarchy
  automatically. Multiple selected items download as a single zip (folder
  downloads preserve structure).
- **Video/audio seeking fixed.** File streaming now supports HTTP Range
  requests, so scrubbing in the video/audio preview works properly.

## 1.42.2 — 2026-07-21

- **Clearer Workouts trend charts.** The **Distance (km)** and **Training
  Load** charts are now clean multi-line graphs: each series is a solid,
  distinctly coloured line with a visible dot on every data point, straight
  segments, and horizontal gridlines only — no more overlapping shaded areas
  muddying the disciplines together. Hover any point to read its exact value.

## 1.42.1 — 2026-07-21

- **Easier Google/GitHub OAuth setup.** When you click **Link** for Google or
  GitHub in Settings → Security, the credential form now shows a direct link
  to that provider's OAuth-app creation page and the exact callback URL to
  paste. The GitHub link pre-fills the app name and callback URL, so it's
  effectively one click before you generate the secret.

## 1.42.0 — 2026-07-21

- **Four new Appearance preferences.** In Settings → Appearance you can now
  set the interface **Density** (Compact / Comfortable / Spacious — scales
  the whole UI, saved per device), whether the **week starts on Monday or
  Sunday** (applies to the planner and habits grids), your **Landing tab**
  (which tab opens on load, used when "persist active tab" is off), and
  whether the desktop **sidebar starts collapsed** by default on new devices.

## 1.41.0 — 2026-07-20

- **Three new themes: OLED Black, Nord, and Paper.** OLED Black is pure
  black for OLED screens (great as a phone theme), Nord is the calm
  blue-gray palette from nordtheme.com, and Paper is a warm parchment look
  with serif headings and flat, shadowless cards. All three support dark
  and light mode.
- **Themes are now per device.** The App Theme Style is saved on each
  device, so your phone and desktop can run different themes (e.g. OLED
  Black on your phone, Claude on your desktop). The synced setting only
  acts as the starting default for new devices.
- **Theme switching is instant.** Picking a style from the dropdown applies
  it immediately — no more separate "Save style" button.
- **No more theme flash on page load.** The chosen theme style and
  dark/light mode are applied before first paint; previously every page
  load briefly showed the stock blue theme before snapping to yours.
- **"Use theme accent" reset.** Resetting the accent color now hands
  control back to the active theme's own accent (Claude's orange, Glow's
  cyan, …) instead of forcing the stock blue. Custom accents now also
  recolor themed glows and tints correctly on every theme.

## 1.40.1 — 2026-07-20

- **Theme audit: all six app themes fixed and made consistent.**
  - *Glow (Neon):* dashboard widgets align again — the theme was overriding
    the positioning of every grid widget, scattering the layout. Modals,
    dropdowns, toasts, the sidebar, and the dashboard customizer drawer now
    get the same frosted-glass blur as cards (they were see-through before),
    and scrollbars match the neon accent.
  - *Glass:* cards no longer grow a phantom scroll area, modal bottom-sheets
    scroll again on mobile, and the sidebar/top nav/dropdowns/toasts are now
    glass too. The page background gets a soft ambient color wash so the
    blur is actually visible.
  - *Cyberpunk:* the sidebar, dropdown menus, toasts, and customizer drawer
    now follow the black/square terminal aesthetic instead of staying on the
    default blue-gray palette; sidebar items use the monospace font.
  - *Material:* inputs, buttons, and list items are consistently rounded and
    the active nav tab gets the accent-tinted pill treatment.
  - *Claude / Default:* unchanged.

## 1.40.0 — 2026-07-20

- **Habits: check off past weeks.** The habits table now has ‹ › week
  navigation, so forgetting to tick a habit before the week rolled over no
  longer leaves a permanent gap — go back to any previous week and check the
  day you actually did it. Past weeks show day-of-month in the column headers;
  streaks and the consistency heatmap update as soon as a gap is filled.

## 1.39.3 — 2026-07-20

- **Security: block unauthenticated OAuth provider linking.** The
  `/api/oauth/init` "link" action — which stores an OAuth client id/secret and
  registers a sign-in method — could be called without being logged in on an
  already-set-up instance, letting a network attacker add their own account as
  a valid login. Linking now requires an authenticated session (first-run setup,
  where there is no account yet, is unchanged). Only reachable if your instance
  is exposed beyond localhost.
- **Hardening: `/api/files/move` now validates its input** (non-empty list of
  string ids, max 500, string-or-null folder), matching `/api/notes/move`.

## 1.39.2 — 2026-07-19

- **Fixed: the first-run account setup screen now actually exists.** Fresh
  installs without `AUTH_PASSWORD` have been redirected to `/setup` since
  account creation moved into the app, but the page itself
  (`static/setup.html` + `static/js/setup.js`) was missing, so new installs
  hit a 500 error. The first visit now shows a *Welcome to TyloPlanner*
  screen to pick a username and password (min. 4 characters, stored hashed
  in the database) and signs you in directly. Setting `AUTH_PASSWORD` in
  `.env` still works as before and skips the screen.
- **Docs: install guide and README rewritten around in-browser account
  setup.** No more generating or editing passwords in `.env`;
  `.env.example` no longer pre-fills a placeholder password (which would
  have silently skipped the setup screen).

## 1.39.1 — 2026-07-18

- **Fixed: the dashboard's *Today's Plan* now shows recurring and multi-day
  events.** It previously listed only events literally dated today, so weekly
  ward rounds, daily recurring events and in-progress multi-day events never
  appeared. It now expands today's occurrences using the same recurrence logic
  as the planner.

## 1.39.0 — 2026-07-18

- **Changed: the Analytics tab is now a Study Tracker.** The tab moved from
  *Overview* into *Academic & life* (next to the Planner) and focuses on
  studying: log sessions manually with a
  subject, minutes and a free-text *"what was studied?"* note (new `note`
  column on `study_sessions`), see range-scoped stat cards (hours studied /
  planned, sessions, study days), a *Planned vs Actual* monthly chart, a new
  **Hours by Subject** chart, and the full study log with notes.
- **Moved: workout charts live on the Workouts tab.** *Workout Sessions*,
  *Distance (km)* and *Training Load* charts plus the all-time totals row and
  the time-range selector moved into a new *All-time & trends* card on the
  Workouts tab.
- **Moved: habit check-ins chart lives on the Habits tab** (last 12 months,
  below the heatmap).
- **Moved: "Everything at a Glance" counts became an optional dashboard
  widget.** Enable **Your Library** from the dashboard customizer to see
  open/done tasks, notes, events, exams, habits, files and active-day counts.
- **Removed: the grades table on the old Analytics tab** — it duplicated the
  Exams & grades tab.
- **Added: subject autocomplete.** The study log form and the dashboard study
  timer suggest previously used subjects while you type (native datalist), and
  the *Hours by Subject* chart groups subjects case-insensitively — "Anatomy"
  and "anatomy" count as one.
- Internal: chart helpers extracted to a shared `static/js/charts.js` module.

## 1.38.0 — 2026-07-18

- **Changed: calendar export, import & sync moved into the Planner.** The
  *Calendar — export* and *Calendar — import & sync* cards are gone from
  Settings; their feed URL / .ics download, file import, auto-sync URLs, and
  "remove imported events" now live in the redesigned **⚙️ Calendars** popup in
  the Planner header, alongside the existing per-calendar show/color controls.
  The one popup is now the single place to manage everything calendar-related.
  The application time-zone setting stays in Settings (its own *Time zone* card).

## 1.37.1 — 2026-07-18

- **Added: search button in the mobile header.** The always-visible mobile top
  bar now has a search (⌕) button next to the *+* quick-add, opening the command
  palette. Previously the palette was only reachable on mobile via the keyboard
  shortcut.

## 1.37.0 — 2026-07-18

- **Added: 1 day / 1 week event reminders, plus a default 30-min reminder.**
  The event reminder picker now offers *1 day before* and *1 week before*
  alongside the existing minute/hour options, and new events start with a
  *30 minutes before* reminder already set (removable like any other).
  Reminder pills and notification text now read in days/weeks (`1d`, `1w`)
  where appropriate.

## 1.36.0 — 2026-07-18

- **Added: log study sessions by hand.** The Analytics tab's *Recent Study
  Sessions* card now has a quick-add row — type a subject, pick a date (defaults
  to today) and the minutes studied, hit Log. You no longer need the Pomodoro /
  stopwatch widget to record study time, the same way workouts can be logged
  manually. Sessions still count toward the study-hours totals and charts.

## 1.35.0 — 2026-07-18

- **Added: Markdown (.md) and Word (.doc) note exports.** The note Export menu
  now offers four formats. **Markdown** produces clean `.md` with headings,
  bold/italic/strike, links, bullet/numbered/checklist lists (nesting preserved),
  callouts (as blockquotes), code blocks and GFM tables. **Word (.doc)** opens
  directly in Microsoft Word / Google Docs, with alignment, fonts, sizes, colors,
  real bullet/numbered lists and tables carried over.
- **Improved: Print / PDF now prints the exact note, not the app.** Print/PDF
  (and the Styled HTML export) now render the note with the editor's own
  stylesheet, so bullets, checkboxes, text alignment, fonts, sizes, callouts and
  tables come out **exactly as you see them while writing**. Printing renders the
  note in an isolated document (forced to a light "paper" theme) instead of the
  live page, so the sidebar and app chrome no longer leak into the printout.

## 1.34.0 — 2026-07-18

- **Improved: full-featured tables in Notes.** Tables now support the two things
  the old built-in editor couldn't: **drag-resize columns and rows** (grab a
  border and pull — no longer sized only by their text), and **multi-line cells**
  (press Enter for a new line inside a cell instead of jumping to the next one).
  Right-click any cell for the full menu — insert/delete rows & columns, merge
  and split cells, set background and border colors, and align the whole table.
  Existing tables upgrade automatically the first time you open the note; nothing
  to migrate. Powered by the vendored `quill-table-up` module (loaded lazily with
  the notes editor, so it adds nothing to initial page load). The old floating
  add/remove toolbar is replaced by the richer right-click menu.

## 1.32.7 — 2026-07-18

- **Added: "Everything at a Glance" content counts on the Analytics tab.** A new
  grid of stat cards at the bottom of the tab shows how much you've built up
  across the app — open/done tasks, notes, calendar events, exams, habits
  tracked, files, playlists, and active days (distinct days with any logged
  activity). All computed live from existing data; no tracking added.

## 1.32.5 — 2026-07-18

- **Fixed: date selectors now default to today.** The planner's "Jump to date"
  box showed the first cell of the current view — Monday in week view, the
  month grid's leading day in month view — instead of the actual date. It now
  always shows today. The Log-session date on the Workouts tab likewise stays
  pinned to today (it previously only set today at page boot and could go stale
  across midnight), so same-day sessions need no date picking.

## 1.32.4 — 2026-07-17

- **Added: quick event colors from the right-click menu.** Right-clicking a
  planner event now shows a row of color swatches between Duplicate and Delete,
  so you can recolor an event (or reset it to its type color with the ✕ swatch)
  in one click without opening the full edit dialog.

## 1.32.3 — 2026-07-17

- **Fixed: the music player was fiddly and half-hidden on phones.** The bar's
  buttons and progress slider were laptop-sized and sat right at the screen
  edge, so on an iPhone the seek bar disappeared behind the home-indicator
  swipe area. The mobile player now uses large, Spotify/Apple-Music-style
  controls (a prominent play button, comfortably spaced skip/shuffle/repeat
  buttons, and a thicker progress bar) and lifts itself above the phone's
  gesture bar with safe-area padding so nothing is blocked.

## 1.32.2 — 2026-07-17

- **Fixed: the command palette hid behind the mobile keyboard.** On phones the
  palette opened as a bottom sheet, so once you typed and the result list
  shrank to a row or two, it slid down behind the on-screen keyboard and looked
  like it had vanished. The palette now anchors to the top of the screen, so
  the input and results stay visible above the keyboard.

## 1.32.1 — 2026-07-16

- **Fixed: checking off a habit or to-do jerked the dashboard.** Ticking a
  checkbox forced a full page re-render — immediately for to-dos, and a few
  seconds later for habits when live sync mistook the app's own save for a
  remote change. The checkbox now updates in place and the save is absorbed
  silently, so the dashboard no longer rebuilds and jumps.

## 1.32.0 — 2026-07-16

- **Cleaner planner toolbar.** The date range now sits on its own title line,
  with every control — view switcher, ‹ Today ›, jump-to-date, Shortcuts,
  Tasks, Calendars, quick-add and search — together on one row below it.
- **Week numbers.** In week view the title shows the ISO week of the year,
  e.g. "Mon 13 Jul – Sun 19 Jul 2026 · Week 29".
- **Planner scrolling stays in the planner.** Scrolling the time grid no
  longer spills over into scrolling the page once the grid reaches its top or
  bottom.

## 1.31.2 — 2026-07-16

- **Fixed: month view columns blew out with long event titles.** Days with
  long event names (e.g. lecture codes) stretched their weekday column far
  past its share, pushing Fri/Sat/Sun off the right edge and putting dates
  under the wrong weekday header. Columns are now always exactly one-seventh
  wide and long titles ellipsize, like Google Calendar.

## 1.31.1 — 2026-07-16

- **Fixed: ntfy pushes with emoji or special characters in the title never
  arrived.** Timer-done pushes ("⏰ …"), the daily agenda ("Your day — …"),
  and reminders for events/tasks with non-ASCII names were silently dropped —
  HTTP headers only allow latin-1, so the send failed before it left the
  server. Titles are now RFC 2047-encoded, which ntfy decodes natively.
  Native Web Push was never affected.

## 1.31.0 — 2026-07-15

- **Undo a delete.** Deleting a task, exam, workout, study session, or shortcut
  now shows a **"… deleted · Undo"** toast for a few seconds — one click brings
  it back. (Deleting a calendar event was already undoable; the same behaviour
  now covers the rest.)
- **Create things straight from the command palette.** Open search
  (`Ctrl`/`Cmd`+`K`) and type `task buy milk` to add a to-do, `note Ideas` to
  start a note, or `event dentist tue 3pm` to open a pre-filled calendar event
  (dates/times parsed like the planner's quick-add). Press `Enter` to create.
- **Help is a keystroke away.** Type `?` in the palette to see everything it can
  do — calculator, timers, quick-add, QR — with one click to try each. Pressing
  `?` anywhere else opens a keyboard-shortcuts cheat-sheet.

## 1.30.0 — 2026-07-15

- **Calculator in the command palette.** Open search (`Ctrl`/`Cmd`+`K`) and
  start with `=` to do quick maths, unit conversions, and time-zone lookups
  without leaving the app — the answer shows at the top and `Enter` copies it.
  Handles arithmetic (`= 20% of $250`, `= (8 + 4) * 3`, `= 2^10`), units across
  length/mass/area/volume/data/temperature and CSS (`= 5 km in miles`,
  `= 12pt in px`, `= 100 c in f`), and time zones via your browser's own clock
  data — no online lookup (`= 2:30pm HKT in Berlin`, `= time in Tokyo`). Typing
  a valid expression without the `=` also surfaces the answer above your search
  results. Everything runs offline; nothing is sent anywhere.

## 1.29.2 — 2026-07-15

- **Timers now follow you across devices.** A running timer is kept on the
  server, so if you start one on your laptop and then close the tab or shut the
  laptop down, it keeps counting — open TyloPlanner on your phone or another tab
  and the timer is still there. When it finishes it still sounds and notifies on
  whatever screen is open, and (with **Push notification** on) alarms your phone
  even if nothing is open. Timers created offline sync up once you reconnect.

## 1.29.1 — 2026-07-15

- **Timer dashboard widget.** Add a **Timer** card to your dashboard (Customize
  → add widget) to set a timer by picking hours / minutes / seconds and an
  optional name — like the timer on your phone, no typing a command needed. It
  lists your running timers and has a ⚙ button to open timer settings.
- **Timer settings polish.** Renamed the options to **Hide running timers** and
  **Push notification**, switched them to the app's checkmark style, and made
  the dot next to a running timer a steady colour instead of pulsing. Running
  timers no longer peek out of a collapsed sidebar.

## 1.29.0 — 2026-07-15

- **Natural-language timers.** Open the command palette (Ctrl/Cmd+K) and type
  something like `timer 25m focus`, `timer 2h laundry`, or `timer 1h30m brew`
  to start a countdown. Running timers show as chips below the date in the
  sidebar (or the top bar), each cancellable with a click, and finish with a
  sound + a desktop notification. Pick **Timer settings** from the palette to
  turn on **No-distraction mode** (hides the chips from the nav — you can still
  cancel timers from the settings dialog) or **Push to phone when done**, which
  also fires the alarm to your phone via ntfy / web push so it reaches you even
  with the tab closed.

## 1.28.1 — 2026-07-15

- **Fixed find-in-note (Ctrl/Cmd+F).** Typing in the "Find in note" box no
  longer jumps the cursor into your note after the first letter — focus now
  stays in the search box while you type, like Word or Google Docs, so you can
  no longer accidentally type into the note. Matches are highlighted in yellow
  with the current one in orange, and Enter / the arrows step through them
  without leaving the box.

## 1.28.0 — 2026-07-15

- **QR code generator.** Open the command palette (Ctrl/Cmd+K) and pick
  **Generate QR code** to turn any link or text into a scannable QR — download
  it as a PNG or copy it to the clipboard. The code contains the data itself,
  so it never expires and needs no internet to scan. The encoder loads only the
  first time you use it, so it doesn't slow down startup.

## 1.27.0 — 2026-07-15

- **Simpler internals, same features** — a repo-wide de-bloat pass (~750 lines
  removed, one dependency dropped):
  - Manual syncs (Strava, calendar, backup) now run directly and report their
    result immediately, instead of going through a background task queue the
    UI had to poll. The **Background Tasks Log** card in Settings is gone with
    it — sync/backup results show as toasts, and errors appear right away.
  - Nightly jobs (backup, reminders, cleanups) run on a small thread pool;
    failures are logged to the server console. A failed daily job simply runs
    again the next day.
  - The 2FA setup QR code is now an SVG, dropping the `pillow` image
    dependency.
  - External HTTP calls (Strava, calendar feeds) retry transient failures via
    the HTTP library's built-in retry support; SQLite lock handling now relies
    on its native `busy_timeout` instead of three extra retry layers.
  - Access logging moved from a custom WSGI middleware to a small
    `after_request` hook (same Apache-combined log format).

## 1.26.0 — 2026-07-15

- **Markdown shortcuts in the notes editor.** Type `# ` through `###### ` at
  the start of a line for a heading, or `> ` for a quote — the marker converts
  in place, Notion-style. (Lists already worked: `- `, `1. `, and `[ ] `.)
- **Callout blocks.** The `/` slash menu gains 💡 Callout, ⚠️ Warning, and
  ✅ Success — colored boxes for tips and pitfalls. Pick the same one again on
  a line to turn it back into normal text. Callouts keep their styling in
  exported notes and compiled notebooks.
- **Outline sidebar.** The new 📑 button in the editor top bar toggles a
  Google-Docs-style table of contents built from your headings; click an entry
  to jump there. It updates as you type and remembers whether you left it open.
- **Cmd/Ctrl+F and Cmd/Ctrl+S in notes.** With a note open, Cmd/Ctrl+F opens
  Find & replace (Escape closes it) and Cmd/Ctrl+S saves immediately instead of
  waiting for the autosave. Everywhere else the browser defaults still apply.
- **Fix: switching notes no longer re-saves already-saved content**, which
  previously could burn a version-history snapshot on an unchanged note.

## 1.25.0 — 2026-07-15

- **Tags on notes.** Tag any note from its right-click menu or the 🏷️ button in
  the editor top bar. Tag chips show on notes in the sidebar, and a chip bar
  under the search box filters the list by tag (right-click a chip to rename or
  delete it everywhere) — the same tagging you know from Exams.
- **Note templates.** Tag a note `template` and "+ Note" turns into a picker:
  start from a blank note or any template (title, content, and its other tags
  are copied). There's also a new **Duplicate** option in the note right-click
  menu for one-off copies.
- **Fix: "Compiled HTML" folder exports include nested content.** Exporting a
  folder as a digital notebook silently dropped every subfolder and the notes
  inside them; the whole subtree is now included.
- **Fix: word counts in compiled notebooks.** The exported notebook showed
  "1 word" for nearly every note due to a broken counting regex.

## 1.24.1 — 2026-07-13

- **Fix: task updates carrying `last_updated` no longer error.** The
  edit-conflict check assumed an `updated` column that tasks don't have, so a
  task save that included `last_updated` failed with a server error.
- **Hardening: every writable API column is now validated.** Exam fields
  (`grade_text`, `grading_type`, `academic_year`, `tags`, `tracker_id`) and
  event `task_id` gained validation rules, and the server now refuses to start
  if a whitelisted column is missing one. Test suite extended to cover the
  validation table, edit-conflict (409) handling, server-side recurrence
  expansion, and session cleanup (176 tests).

## 1.24.0 — 2026-07-13

- **Task priorities.** Tasks now take a High / Medium / Low priority, shown as a
  colored badge and used to sort the list — high-priority tasks float to the
  top, with your manual drag order preserved within each priority group. Set it
  from the quick-add row or the task editor.
- **Per-task reminders.** Give a task a due date & time and pick a reminder
  (at due time, or 10 min / 30 min / 1 h / 2 h / 1 day before) in the task
  editor; the background scheduler sends a push just like event reminders. A 🔔
  badge marks tasks that have one set.
- **Time-block a task from the planner.** Open the new **📋 Tasks** tray on the
  Planner, then drag an unscheduled task onto a day (or a time slot in the
  day/week views) to create a linked calendar block. Deleting the task removes
  its block, and scheduled tasks drop out of the tray automatically.

## 1.22.1 — 2026-07-13

- **Fix: reminders and the morning agenda now understand advanced repeats.**
  Events repeating "every N days/weeks/months", on specific weekdays, yearly,
  ending after N occurrences, or with deleted single occurrences were expanded
  with the simple weekly/monthly rules — so an "every 2 weeks" event pushed
  reminders every week, and deleted occurrences still notified. The
  background scheduler now uses the same recurrence model as the planner.
- **Fix: the iCal feed (`/calendar.ics`) exports full recurrence rules.**
  Subscribed calendars (Google, Apple, …) now see the repeat interval,
  weekly day sets, yearly repeats, occurrence counts, and skipped dates
  (`INTERVAL`/`BYDAY`/`COUNT`/`EXDATE`) instead of a plain weekly/monthly rule.
- Fixed: toggling a habit that no longer exists returned success and left
  orphaned log rows; it now returns 404.
- Fixed: the bulk note-move endpoint accepted malformed payloads; it now
  validates them (and caps a single move at 500 notes).
- Background-task errors in the scheduler are now logged instead of silently
  swallowed, and the one-per-reminder "already sent" markers are purged after
  a week instead of accumulating forever.

## 1.22.0 — 2026-07-13

- **Pace & speed everywhere.** Workout history now shows the derived pace per
  entry: min/km for runs, km/h for rides, min/100m for swims.
- **Weekly training goals.** Set a weekly km target for run/bike/swim and a
  gym-sessions target on the Workouts tab; the "This week" stats show
  progress bars toward each goal.
- **Personal records.** A new card on the Workouts tab tracks your longest
  run/ride/swim and best pace or speed per sport (with a minimum distance of
  3 / 10 / 0.5 km so short efforts don't count).
- **Training load chart.** Analytics has a new multi-line trend chart of
  training hours per discipline per week over the last 12 weeks, with one
  line per sport (run/bike/swim/gym).

## 1.21.1 — 2026-07-13

- **Fix: pasting or dragging screenshots into a note no longer breaks saving.**
  Pasted/dropped images were embedded inline as base64, so a handful of
  screenshots pushed the note past the server's size limit — the save was
  rejected and the note silently reverted to its last good state on refresh.
  Screenshots are now uploaded to Files (like the toolbar image button) and
  the note stores only a small URL, so you can add as many as you like. Also
  fixes the toolbar image button, which was missing its CSRF header.

## 1.21.0 — 2026-07-13

- **New: Swimming workout type — full triathlon support.** Log swims from the
  Workouts tab and the dashboard quick-add. Swim km show up in the weekly
  stats, the dashboard training widget, the Analytics distance chart and
  totals, and as a "swim km" metric for custom analytics widgets. Strava
  sync now imports Swim and OpenWaterSwim activities too.

## 1.20.0 — 2026-07-10

- **New: Music tab — a built-in media player for your uploaded audio.** Upload
  MP3 / FLAC / WAV / OGG / M4A files in Files and they appear in the new
  Music tab (Workspace group). Click a track to play it in a persistent
  player bar that stays put while you work in other tabs, with
  shuffle, repeat (off/all/one), seek, and volume — volume and modes are
  remembered across sessions. Track titles, artists, albums, durations, and
  embedded album art are read automatically from the files' tags (new
  `mutagen` dependency).
- **Playlists & queue.** Create playlists, add tracks via a track's
  right-click menu, drag to reorder, and play everything with one click. The
  Queue sub-tab shows what's coming up — jump, remove, reorder, or clear it.
- **Lock-screen controls.** Play/pause, previous/next, and seeking work from
  the lock screen and notification center on phones (Media Session API),
  with the track's album art shown.
- **Offline listening.** Right-click a track → "Download for offline" keeps a
  copy on the device so it plays without a connection; the Library shows how
  much storage downloads use, and downloads can be removed the same way.
- Clicking the track name or album art in the player bar jumps back to where
  playback started (the playlist or the library) with the current track
  highlighted and scrolled into view.
- Fixed: upload progress panel and toasts no longer hide behind the player
  bar, and the volume/seek slider thumbs now visually reach 0% and 100% (a
  global input padding rule was insetting their travel).
- Fixed: the date in the mobile drawer was crushed to a sliver once the nav
  grew taller than the screen — it now sits on the brand row next to the
  TyloPlanner logo (and on its own line in the desktop rail), the drawer
  scrolls instead of squashing its items, and the date shows on first load
  even when the app doesn't open on the dashboard tab.

- **New: command palette.** Press **Ctrl/Cmd+K** anywhere (or the new Search
  button in the sidebar / top bar) to search notes, open to-dos, events,
  exams, files, and web shortcuts in one place, plus "Go to …" actions for
  every tab. Arrow keys + Enter to open; selecting a note opens it, a task
  opens its edit dialog, an event jumps the planner to its date, a file opens
  its preview.
- **New: recurring to-dos.** The task edit dialog gained a Repeat option
  (daily, weekly, every 2 weeks, monthly). Completing a recurring to-do
  doesn't finish it — it reschedules to the next occurrence after today and
  unchecks its subtask checklist. Recurring tasks show a ↻ badge; this works
  from the To-do tab and the dashboard widget alike.

## 1.18.0 — 2026-07-07

- **New: grade goal calculator.** Each tracker in Exams & Grades can now hold
  a target average. The analytics card shows the ECTS-weighted average you'd
  need on your remaining (ungraded) exams to end at that target — green when
  any pass already secures it, red when it's mathematically out of reach. A
  new **What if…** dialog lets you type hypothetical grades for upcoming
  exams and watch the projected average and required remainder update live —
  nothing in it is saved. Only numeric 1–10 grades count toward the math,
  matching the existing weighted average.

## 1.17.0 — 2026-07-06

- **New: multiple grade trackers.** Exams & Grades can now track separate
  studies (e.g. bachelor + minor, or two programmes) side by side. Pills at
  the top of the tab switch between trackers; each tracker has its own exam
  list, analytics, and ECTS goal. Right-click a pill to rename or delete a
  tracker (its exams move to the first tracker). Existing exams and your
  current ECTS goal live in the default "Main" tracker.
- **New: custom tags on exams.** Create your own tags (e.g. exam, practical,
  essay — none included by default) and assign any number of them per row via
  the new Tags column. Tags are shared across trackers; click a tag in the
  bar above the table to filter, right-click it to rename or delete, or
  delete it via the ✕ next to it in the tag dialog.
- **New: explicit academic year per exam.** Each exam has a Year column,
  auto-guessed from its date (September cutoff) but overridable per exam —
  so August resits no longer land in the wrong academic year in the
  "By academic year" analytics.

## 1.16.0 — 2026-07-06

- **New: Obsidian-style folder tree in Notes.** The sidebar now shows your
  whole folder structure at once as a collapsible tree — folders expand in
  place (chevron or second click) with their subfolders and notes nested
  under them, instead of the old click-in/click-out drill-down. Expansion
  state is remembered. Dragging a folder onto another folder now nests it
  inside (dropping on the Root breadcrumb moves it back to the top level);
  this replaces the old drag-to-reorder of sibling folders. Folder actions
  (rename, icon, compile, delete, new note inside) live in the right-click
  menu.

## 1.15.0 — 2026-07-06

- **New: Universal export/import archive.** Settings → Data can now export any
  selection of categories (calendar, tasks, notes, exams, habits, workouts,
  study timer, shortcuts, files — including the uploaded file contents — and
  settings) as a portable `.zip`. Importing an archive offers two modes:
  **merge** (adds items and settings missing locally, keeps everything you
  already have) or **replace** (restores the selected categories exactly to
  the archive). Ideal for full/partial backups and moving to a new server.

## 1.14.1 — 2026-07-06

- **Fixed: UI re-rendered every 5 seconds.** `/api/state-version` returned the
  version as a string while `/api/state` returned an int, so the live-sync
  poll's strict comparison saw a "change" on every check and re-rendered the
  active tab — visible as Analytics charts rebuilding and the Files selection
  bar jittering/resetting every few seconds. The endpoint now returns an int
  and the frontend compares version values type-safely. The UI now only
  re-renders when data actually changed.
- **Fixed: "Select All" during a file search could select invisible files.**
  It used a different filter than the visible list (ignoring subfolder scoping
  and full-text search results), so bulk delete/move could hit files you
  couldn't see. Both now share the same filter.
- **Fixed: file selection bar overflowed on mobile.** Long folder names made
  the "Move to…" dropdown stretch the bar past the screen edge; it now wraps
  and caps the dropdown width.
- **Test suite repaired.** All 120 tests pass again (64 were failing with
  "setup required" since the first-run setup wizard was added), plus a new
  regression test pinning the state-version type contract.

## 1.14.0 — 2026-07-05

- **Right-click context menus.** Files and folders in the Files tab now have a
  right-click menu (rename, move to folder, download, pin, delete for files;
  open, rename, change icon, delete for folders). Planner events get a Google
  Calendar-style right-click menu with Edit, Duplicate, and Delete — in week,
  multi-day, and month views. Notes and note folders get the same treatment
  (open, pin, move to folder, rename, change icon, delete), and on the
  Dashboard you can right-click a web shortcut (open, remove) or any widget
  (settings, remove).
- **Proper dialogs instead of browser popups.** All `prompt()`/`confirm()`
  boxes in Files, Planner, Notes, and Dashboard are now in-app modals: folder
  create/rename/icon, file rename, every delete confirmation, note-conflict
  resolution (Overwrite / Reload), version restore, widget removal, and the
  add-shortcut flow. "Move to…" opens a folder picker.
- **Cleaner file lists.** The always-visible per-file rename/download/delete
  buttons, the pin stars, the per-folder hover buttons, and the header's
  rename/icon/delete buttons for the open folder are gone — those actions all
  live in the right-click menu now (right-click a breadcrumb to act on that
  folder). The selection checkboxes stay for bulk actions, and the selection
  bar gained a **Download** button for mass-downloading selected files
  alongside the existing move and delete.
- **Bulk right-click.** With multiple files selected, right-clicking any of
  them shows a bulk menu — download, move, or delete all selected files, or
  clear the selection.

## 1.13.3 — 2026-07-05

- **Grid view with thumbnails in Files.** A new ☰/▦ toggle next to the sort
  buttons switches between the classic list and a Drive-style card grid.
  Image files show a real thumbnail; other types show their type icon.
  Selection, pinning, rename/download/delete, drag-to-folder, and search all
  work in both views, and your choice is remembered.
- **Upload queue.** Batches now upload at most 5 files at a time; the rest
  wait in the progress panel marked "queued" until a slot frees up.

## 1.13.2 — 2026-07-05

- **Upload progress panel in Files.** Uploads (button, camera, and drag-drop)
  now show a Google Drive-style progress card in the bottom-right corner with
  a per-file progress bar, and files upload in parallel instead of one at a
  time. Failed files are marked in the panel (hover for the error) without
  blocking the rest of the batch. The panel survives live-sync re-renders and
  auto-hides a moment after everything finishes.

## 1.13.1 — 2026-07-04

- **Fixed OAuth linking form collapsing mid-entry.** The Settings → Security
  → OAuth Configuration box re-rendered from scratch on every live-sync poll
  (every few seconds), so opening "Link" and typing a Client ID/Secret got
  wiped out before you could finish. The OAuth box now survives re-renders
  the same way the Active Sessions list already did.

## 1.13.0 — 2026-07-04

Dashboard rebuilt: a real grid engine, free placement, and a new customize drawer.

- **Gridstack-powered widget grid (desktop/tablet).** The hand-rolled
  drag/resize math is gone; widgets now move and resize through the vendored
  Gridstack.js engine — smooth snapping, proper collision handling, and a
  resize handle that's always visible while customizing. Interactions no
  longer die mid-edit (background syncs used to tear the grid down under
  your cursor, requiring a page refresh).
- **Free placement.** Widgets stay exactly where you put them — nothing is
  compacted or crammed to the top anymore, on load or while editing. Gaps
  are yours to keep.
- **New customize drawer.** Editing now opens a slide-in panel from the
  right (a bottom sheet on phones) with a logical layout: widget toggles and
  "+ Add" for multi-instance widgets, layout presets, and shortcut
  management. Every change applies and saves automatically — the Save
  Changes/Cancel buttons are gone; just press Done (or the header button)
  when finished.
- **A dedicated mobile dashboard.** Below 640px the free-form grid is
  replaced by full-width stacked cards, reordered by drag handle (no fiddly
  touch resizing). The mobile order is stored separately from the desktop
  layout. Website shortcuts are hidden on mobile by default, with a
  "Show shortcuts on mobile" toggle in the drawer.
- **Widget registry under the hood.** All widget types now live in one
  registry object, so future widgets are a single entry plus a render
  function.

## 1.12.1 — 2026-07-03

Offline sync can no longer wedge the app at startup.

- **Fixed a boot deadlock in the offline queue.** If changes were queued while
  the server was unreachable and no cached copy of your data existed yet, the
  app could load as an empty shell forever — pending writes blocked data
  fetching, and the pending writes were only sent after a successful data
  fetch. The queue is now drained (when online) before the app fetches state,
  so it boots and syncs; genuine offline behavior (queueing writes, serving
  the cached copy) is unchanged. Queue replay is also single-flight now, so
  overlapping sync triggers can't send the same queued change twice.

## 1.12.0 — 2026-07-03

Mobile overhaul: slide-out drawer navigation, quick add, calmer tab switches.

- **Mobile drawer replaces the bottom bar.** Navigation on phones/tablets
  (≤900px) is now the same grouped sidebar as desktop, as a slide-out drawer:
  open it with the top-left menu button or by swiping in from the left edge
  (it follows your finger, like a native app); close it by tapping the dimmed
  page, swiping it away, pressing Escape, or navigating. All ten sections are
  now one tap away — the old five-slot bottom bar and its "More" popup are
  gone.
- **Quick add (top-right +).** A new header button on mobile opens a small
  menu: new event, new to-do, new note, or jump to the calendar.
- **Tab switching animation redone.** The old full-page sideways slide (which
  dragged the nav chrome along) is replaced by a fast crossfade of just the
  content area — navigation stays perfectly still, and the new view fades in
  with a subtle rise. Instant under reduced-motion.
- **No drag-resizing planner events on touch screens.** The resize handles
  were 8px targets that mostly triggered by accident; on touch devices
  (capability-detected, so tablets too) events are now resized through the
  edit dialog only.
- **Mobile fixes along the way.** The note editor no longer overflows the
  screen width (its toolbar row wraps and the pane respects the grid track);
  the floating + button sits at the bottom edge now that the bar is gone; the
  in-between 641–900px window sizes get the drawer too instead of a wrapping
  tab strip.

## 1.11.2 — 2026-07-03

Planner grid fits the window exactly.

- **No more phantom page scroll on the planner.** The desktop time grid sized
  itself with a hardcoded viewport offset that was ~35px short whenever the
  controls above it were taller than assumed, so the page always scrolled
  slightly. The grid now measures its real position after each render (and on
  window resize) and fills exactly the remaining viewport height, in both the
  top-bar and sidebar layouts. Mobile keeps its existing sizing.

## 1.11.1 — 2026-07-03

Switchable desktop navigation layout.

- **Sidebar navigation (desktop).** A new left sidebar is available as an
  alternative to the top tab bar, toggled under **Settings → Appearance →
  Navigation layout** and persisted per-user (`nav_layout` setting). Tabs are
  grouped (Overview / Academic & life / Workspace) with stroke SVG icons that
  animate on hover, and Settings is pinned to the bottom. In sidebar mode the
  top header is replaced entirely — the theme toggle and (when auth is on) the
  log-out link move into the sidebar footer. The sidebar collapses to an
  icon-only rail (state saved in `localStorage`). It reuses the existing
  tab-switch mechanism, so it stays in sync with the top bar and mirrors the
  Settings update badge. On wide/4K screens content stays balanced beside the
  sidebar instead of hugging an edge.
- **Sidebar polish.** The chosen layout is cached locally and applied before
  first paint, so there's no top-bar flash when the app opens in sidebar mode.
  **⌘/Ctrl+\\** toggles collapse (like Notion); collapsed icons show native
  tooltips and keep their screen-reader names (labels fade instead of being
  removed); the active tab gets an accent tint + indicator rail that follows a
  custom accent color; the current date shows under the brand; full-height
  panes (planner grid, notes editor) reclaim the space the header used to
  occupy; keyboard focus rings are visible throughout; and all sidebar motion
  respects `prefers-reduced-motion`.
- **Header cleanup.** The header's **Backup**/**Restore** buttons were removed —
  those actions already live under **Settings → Data** — and the "source code is
  yours" strip at the bottom of the page is gone.
- **Desktop-only.** The whole feature is gated behind `min-width: 901px`; below
  that the mobile bottom navigation is completely unchanged.

## 1.11.0 — 2026-07-03

Editor polish: image resize, auto-links, cleaner exports, dropdown fix.

- **Image resize & align.** Click an image in a note to select it — drag the
  corner handle to resize (keeps aspect ratio) and use the little toolbar to
  align left/center/right or reset the size.
- **Auto-linkify URLs.** Typing or pasting a URL (`https://…` or `www.…`) now
  turns it into a clickable link automatically.
- **Cleaner exports.** Styled-HTML and Compiled-Notebook exports now cap image
  width to the page (no more images spilling outside), scroll wide tables, and
  **inline images as data URIs** so an exported file is self-contained and its
  images render for anyone it's shared with.
- **Fixed:** the font / size / heading toolbar dropdowns were being clipped and
  hidden below the document; they now open above the page and stay fully
  visible and clickable.

## 1.10.0 — 2026-07-03

Tables in the notes editor.

- **Insert tables** from the `/` slash menu (a 3×3 grid to start). While the
  caret is inside a table, a small floating toolbar offers **+ Col / + Row /
  − Col / − Row / ✕ Table**. Cells are fully editable and tables round-trip
  through save/reload and export.
- The HTML sanitizer now allows table markup (`table`, `thead`, `tbody`, `tr`,
  `td`, `th`, …) while still stripping scripts / handlers inside cells.
- Uses Quill's built-in table module — no new dependency.

## 1.9.0 — 2026-07-03

Slash commands and wiki-links in the notes editor.

- **`/` slash menu.** Type `/` at the start of a line to open a command menu —
  headings (H1–H3), bulleted / numbered / checklist lists, quote, code block,
  and image. Filter by typing, navigate with ↑/↓, choose with Enter, dismiss
  with Esc. No mouse required.
- **`[[wiki-links]]`.** Type `[[` to autocomplete and link to another note by
  title; clicking the link opens that note. Links are stored as ordinary
  `#note-<id>` anchors (no schema change, and they pass the existing HTML
  sanitizer), so they round-trip and export cleanly.
- Both share one caret-anchored popup, styled to the app theme, and work on
  desktop and mobile.

## 1.8.0 — 2026-07-03

Note version history + an undo fix.

- **Version history.** Notes now keep a time-bucketed snapshot of their content
  as you edit (at most one snapshot per ~10 minutes, newest 50 kept per note).
  A **🕘 Version history** button in the editor opens a panel to browse past
  versions, preview any of them, and **restore** one — the restore snapshots
  your current content first, so it's itself undoable. Revisions live in a new
  `note_revisions` table (migration `018`), cascade-delete with their note, and
  are fetched on demand so they never bloat the app state payload.
- **Undo fix.** The editor's undo history (Ctrl+Z / Ctrl+Y) is now cleared when
  a note loads, so undo can no longer reach into the previously-open note and
  corrupt content after switching notes. In-note undo/redo is unaffected.

## 1.7.1 — 2026-07-02

Performance, offline, and accessibility pass.

- **Self-hosted Inter font.** The UI font was loaded from Google Fonts but
  silently blocked by the Content-Security-Policy, so the app fell back to
  system fonts and logged an error on every page load. Inter (latin) now ships
  locally in `static/fonts/`, so it actually renders and the console error is
  gone — with no external request.
- **Lighter initial load.** `marked` and `chart.umd.js` are now `defer`red so
  they no longer block HTML parsing, and **Quill (≈209 KB) is loaded lazily**
  the first time you open a note instead of on every page load. The default
  Dashboard no longer pays for the editor.
- **Inline note images work offline.** The service worker now keeps a dedicated
  runtime cache for uploaded images (`/api/files/<id>/view`), so images embedded
  in notes still render without a connection.
- **Accessibility.** Added `aria-label`s to icon-only buttons (notes toolbar,
  export, find/replace, dialog close) so screen readers announce them.
- **Fixes/cleanup.** Notes layout heights use `100dvh` (correct on mobile
  browsers with a dynamic toolbar); removed dead code from the notes module;
  added adversarial tests for the HTML sanitizer.

## 1.7.0 — 2026-07-02

A Google-Docs-style Notes experience, plus more formatting.

- **Redesigned editor UI.** The Notes editor is now laid out like Google Docs:
  a slim top bar (save status, word/char count, find, export, delete), a
  sticky grouped formatting toolbar, and a centered "page" that floats on a
  canvas with the document title sitting on the page. On phones the page goes
  full-bleed and the toolbar scrolls horizontally. All themed to the app's
  existing CSS variables (works in every theme, light and dark).
- **More formatting** (all built into Quill — still no bundler/deps): text
  **alignment** (left/center/right/justify), **subscript/superscript**,
  **font size** and **font family** pickers, and headings extended to H1–H6.
- **Find & replace.** The in-note find bar (toggled with the 🔍 button) gained
  a replace field with **Replace** and **Replace all**.
- The server-side HTML sanitizer already allows the classes/tags these
  features emit (`ql-align-*`, `ql-size-*`, `ql-font-*`, `<sub>`/`<sup>`), so
  everything round-trips safely.

## 1.6.0 — 2026-07-02

Notes get a real WYSIWYG editor.

- **Rich-text Notes editor (Quill).** The Notes tab moved from a Markdown
  textarea with a live preview to a true what-you-see-is-what-you-get editor,
  Apple-Notes style. The toolbar covers headings, bold/italic/underline/strike,
  text & highlight color, ordered / bulleted / **checklist** lists, indent,
  blockquote, code blocks, links and inline images. Formatting is applied and
  shown inline — no more split panes, Read Mode, or Markdown syntax to remember.
- **Inline images.** Insert images straight into a note; they're uploaded
  through the existing files storage (`/api/files`) and embedded by URL, so note
  rows stay small.
- **Storage & migration.** Notes now store sanitized rich HTML in `notes.body`,
  tracked by a new `body_format` column (migration `017`). Existing Markdown
  notes are converted to HTML automatically the first time they're opened and
  saved — nothing to do, no data lost. Note bodies are run through a strict
  server-side HTML allowlist sanitizer (stdlib only) on save.
- **Kept:** folders, note search (list + in-note find), drag-and-drop,
  pinning, mobile panel navigation, and Styled-HTML / Compiled-Notebook export
  all continue to work.
- **New vendored dependency.** Quill (`static/js/quill.js` +
  `quill.snow.css`) ships prebuilt alongside the existing `chart.umd.js` /
  `marked.min.js` — no bundler or build step added.

## 1.5.38 — 2026-06-30

Three calendar quality-of-life additions.

- **Explicit "All day" toggle.** The event modal has an **All day** checkbox
  instead of relying on leaving the time fields blank. Checking it hides the
  start/end/duration fields and saves the event with no times; editing an
  existing all-day event ticks it automatically.
- **Per-event color.** Events can be recolored independently of their type
  (Google-style). The modal has a **Color** row — a "default" option (use the
  type color), eight presets, and a custom picker. The chosen color overrides
  the type color in the week, all-day, month and popover views. New `color`
  column (migration `015`); validated as a strict hex string in
  `blueprints/api.py` since it's rendered into an inline style.
- **Natural-language quick-add.** A toolbar **✨ Quick add** box parses a plain
  line and opens the Add-Event modal pre-filled for confirmation. It understands
  dates (`today`, `tomorrow`, `Friday`, `next Mon`, `Jun 5`, `12/06`, `in 3
  days`), times and ranges (`9am`, `14:30`, `9-11am`, `noon`), durations (`for
  90 min`), and locations (`@Zoom`, trailing room codes like `Eg-350`); the rest
  becomes the title. It's a hand-rolled parser (no new dependencies), so it's
  best-effort — the pre-filled modal lets you fix any mis-parse before saving.

## 1.5.37 — 2026-06-29

Google-Calendar parity, phase 2c (final): multi-day & midnight-spanning events.
Completes the Tier-1 calendar feature set. Frontend only; uses the `end_date`
column from migration 014.

- **Events can span multiple days / cross midnight.** The event modal gained an
  optional **End date** field. `getInstances()` now expands any event whose
  `end_date` is after its start into one segment per day:
  - **Multi-day all-day** events (trips, holidays) render as a continuous bar
    across the week's all-day row and across month cells (squared joining edges
    via `.multi-start/middle/end`).
  - **Multi-day / midnight timed** events split into per-day segments — e.g.
    23:00→01:00 shows 23:00→end-of-day on the first day and start-of-day→01:00
    on the next — each segment labeled with the real span time. Recurring
    multi-day events expand correctly (the scan window widens by the span so a
    span starting just before the view still shows its in-view days).
  - Continuation segments aren't draggable (dragging one would collapse the
    span); edit them via the popover.

## 1.5.36 — 2026-06-29

Google-Calendar parity, phase 2b: single-occurrence editing of recurring events
("This event / This and following / All events"). Frontend only — recurrences
stay virtual (no per-occurrence rows); single edits are modeled with the
`excluded_dates` and series-split fields from migration 014.

- **Editing, deleting, or dragging one occurrence now asks for scope.** A
  Google-style prompt offers **This event**, **This and following events**, or
  **All events** (drag offers This/All):
  - **This event** — detaches the occurrence: the date is added to the master's
    `excluded_dates` and (for edit/move) a standalone event is created with the
    new details, so the rest of the series is untouched.
  - **This and following** — ends the master at the day before (`recurrence_until`)
    and, for edits, starts a fresh series from that date.
  - **All events** — applies to the whole series (keeping its start date).
  Each event element now carries its occurrence date (`data-occ`) so the right
  instance is targeted; changes apply optimistically (no stale-view lag).
- Clicking an event's popover shows that occurrence's date, and the popover's
  Edit/Delete route through the scope prompt for recurring events.

## 1.5.35 — 2026-06-29

Google-Calendar parity, phase 2a: richer recurrence (plus a reminder-saving bug
fix found along the way). New DB migration `014_add_calendar_advanced_fields`
adds `end_date`, `recurrence_interval`, `recurrence_days`, `recurrence_count`,
`excluded_dates` to `events` (additive/nullable; whitelisted + validated).

- **Richer recurrence rules.** Repeats can now be **every N** days/weeks/
  months/years (interval), **weekly on multiple weekdays** (Mon/Wed/Fri…), and
  **yearly**; and a series can **end after N occurrences** as well as on a date.
  The event modal gained a recurrence sub-form (interval, weekday picker, and an
  Ends = Never / On date / After N selector). `getInstances()` was rewritten to
  expand all of this (and is now timezone-safe via local-date parsing).
- **Fixed: events with multiple reminders — or no reminders — couldn't be
  saved.** `reminder_offset` holds a CSV of minute offsets (e.g. `5,15,30`) or
  the `-1` "none" sentinel, but the backend validated it as a plain integer, so
  every `POST`/`PUT` with more than one reminder (or with none) was rejected
  with a `400` and silently reverted. Validation now accepts the real format
  (`-1`, empty, or a comma-separated list of 0–100000 offsets) and normalizes
  it; single-reminder saves are unaffected. Pre-existing bug, surfaced while
  testing recurrence editing.

## 1.5.34 — 2026-06-29

Google-Calendar feature parity, phase 1 (the no-schema-change wins). Frontend
only — `static/js/planner.js`, `static/index.html`, `static/style.css`, plus
function wiring in `static/app.js`.

- **Go-to-date picker.** The toolbar gained a date input next to `Today ‹ ›`,
  and the date label is now clickable, so you can jump to any date instead of
  paging week-by-week (`goToDate()` reuses the same offset math as
  search-navigation; the picker stays in sync with the visible range).
- **Quick event popover.** Clicking an event no longer jumps straight into the
  full edit modal — it opens a lightweight read popover (title, date/time,
  location, recurrence, description) with **Edit / Duplicate / Delete** actions,
  matching Google. The full editor is one click away via Edit. "Duplicate"
  clones the event (` (copy)`); delete confirms first.
- **Month "+N more" overflow.** Busy month cells used to render every event and
  blow out the row height. Cells now cap at 4 chips and collapse the rest into a
  **"+N more"** that opens a day popover listing all that day's events (each
  opens its own quick popover), plus a "+ Add event" shortcut.

All of this is theme-driven (CSS variables) and works on mobile (the popover
clamps to the viewport).

## 1.5.33 — 2026-06-29

Planner toolbar + interaction fixes from real-use feedback.

- **Planner toolbar redesigned.** The controls row was cramped (tiny buttons, a
  150px search box) and on phones it was forced into a single horizontally
  **side-scrolling** line — ugly and easy to miss. The toolbar now uses
  full-size buttons, a prominent date label, and a larger search box with a 🔍
  affordance. On mobile it **wraps onto multiple rows** instead of side-scrolling
  (view + day-nav, then the date label, then actions and a **full-width search**),
  and search — previously desktop-only — is now available on phones.
- **Search jumps to an event without editing it.** Picking a search result (or
  pressing Enter) navigated to the correct week but then **immediately opened the
  event in edit mode**, which was unwanted. It now just scrolls to the event and
  briefly **pulses it** (`.event-flash`) so you can find it; you open the editor
  yourself by tapping it. (The dashboard's "upcoming" list still opens the editor
  on click — `navigateToAndEditEvent(id, date, openEditor)` gained an optional
  flag; search passes `false`.)
- **No keyboard ambush on mobile.** Opening the create/edit event modal on a
  phone instantly popped the on-screen keyboard because the native
  `<dialog>.showModal()` auto-focused the title field. Initial focus now goes to
  the dialog heading (`autofocus` on the `<h3>`), so the keyboard stays down and
  you choose which field to fill first. Desktop still auto-focuses the title for
  quick typing.

## 1.5.32 — 2026-06-29

Calendar readability pass — a second round on the planner to make it read and
behave like Google Calendar, based on a side-by-side comparison. Scoped to
`static/js/planner.js` and `static/style.css`; no backend or dependency changes.

- **Whole day visible at a glance.** The desktop time grid was a fixed `730px`
  tall, so only ~8:00–18:00 fit on screen. It now fills the viewport
  (`height: calc(100vh - 130px)`, `min-height: 520px`), and the planner opens
  scrolled to ~7am (top-aligned on the morning, or the earliest event) instead
  of centering on the current time — so on a normal desktop you see roughly
  7:00–midnight without scrolling, like Google Calendar.
- **Event cards read like Google.** The bold **title now comes first and
  wraps** onto multiple lines so the full event name is readable, instead of
  being truncated to "BA3B13 - BA3 - VO.2 Neuro Onc…". The time sits below the
  title and the location below that (the 📍 pin was dropped for a cleaner look),
  both in a lighter weight. Card overflow still clips cleanly, and hovering a
  short event expands it to show everything. (This reverses the time-first
  ordering from 1.5.31 — real Google Calendar is title-first.)

Drag-and-drop, resize, touch-drag, the overlap layout, today indicator, and the
mobile responsive rules are unchanged.

## 1.5.31 — 2026-06-29

Desktop calendar visual overhaul — the planner week/day grid now matches Google
Calendar's density and layout while staying fully theme-driven (CSS variables
only, so every theme works automatically). Scoped to `static/js/planner.js` and
`static/style.css`; no backend, template, or dependency changes.

- **Events expand into free space (two-pass overlap layout).** `calculateOverlaps()` previously split every event in an overlap cluster into equal `100% / columns` widths, so a lone event stuck in a 3-wide cluster stayed at 33% even when the columns beside it were empty at its time. A new second pass lets each event grow rightward across adjacent columns until it reaches one holding a genuinely time-overlapping event — so non-conflicting events fill the available width, exactly like Google Calendar. Truly conflicting events are unaffected.
- **Event cards: time-first hierarchy, tighter density.** Timed event cards now show the time on a small (`10px`, 75 %-opacity) line *above* the bold title (`11px`), with the location below only when the card is tall enough (`≥50px`) — matching Google's convention. Padding dropped to `3px 6px` and the base font to `11px` so cards read cleanly at narrow column widths. The drag-preview and resize live-update labels were updated to match (they now target `.event-time`).
- **Today indicator + column tint.** Today's date number in the day header sits inside an accent-filled circle (`.today-circle`), the day-name font ticked up to 13px, and today's time-grid column gets a ~4 % accent wash (`rgba(var(--accent-rgb), 0.04)`) — a subtle highlight that reads in every theme.
- **Half-hour grid lines.** Each hour cell renders a faint dashed `::after` line at its midpoint, giving the grid the same 30-minute rhythm as Google Calendar without extra DOM.
- **Month view: solid pill chips.** Month-view events switched from a `var(--panel2)` background with a 3px colored left border to full-color pills (type-color background, white text, 3px radius), matching Google's month layout. Type colors map to the same theme variables as the week view (`--accent2` study, `--red` work, `--orange` personal, `--green` workout, etc.).

Drag-and-drop, resize, touch-drag, all-day events, recurrence, ICS
import/export, and the mobile responsive rules are unchanged.

## 1.5.30 — 2026-06-28

Follow-up fixes from on-device mobile testing of 1.5.29.

- **Fixed: dashboard/tasks quick-create "Add Task" did nothing.** The FAB called `openTaskModal()` with no id; that function was edit-only (`S.tasks.find(id)` → `if (!t) return`), so it bailed silently. `openTaskModal()` now opens the modal in **create mode** (blank fields, "Add Task" title) when called without an id, and `saveTaskModal()` POSTs a new task instead of PUTting when there's no id. Editing existing tasks is unchanged.
- **Fixed: Files section overflowed off the right edge on mobile.** Long filenames pushed the `Download`/`✕` buttons off-screen (a long filename's longest word set a `min-width` that stopped the row from shrinking), and the folder action toolbar (`Rename / Icon / Delete / + Folder / Upload / Camera`) ran past the screen edge. On mobile the folder toolbar now wraps, and each file row puts the name + meta on the first line with the action buttons on their own right-aligned line below — so the filename wraps by word (not per character) and every button stays on-screen and tappable.

## 1.5.29 — 2026-06-28

Second-pass mobile PWA overhaul focused on the sections that were still
unusable. **All changes are scoped to `≤640px` media queries or `matchMedia`
mobile branches, so the desktop UI is unchanged** (verified side-by-side).
No new dependencies — vanilla CSS/JS only.

- **Planner week/multi-day views are usable again.** The old behavior crushed 7 day-columns into a phone screen, truncating every event to "B…". On mobile, multi-day views now render each day at `80vw` inside a horizontally **scroll-snapping** grid (`.day-columns.multiday`), so you swipe one readable day at a time — Google-Calendar style — while the hour axis stays pinned via `position: sticky` (`.time-axis`). Single-day view fills the width. The initial view also defaults to **Day** on phones (`planner.js` reads `matchMedia('(max-width: 640px)')`). Desktop keeps the full 7-column week grid (the `.multiday` class is inert above 640px).
- **Notes editor: working Read Mode + reclaimed space.** Read Mode was **broken on mobile** — `#noteView` was hidden with `display:none !important`, which overrode the read-mode toggle and showed a blank pane. `applyNoteLayout()` now forces single-pane on phones (edit = textarea only, read = preview only) and the `!important` hide is gone. The editor chrome was streamlined into one compact row (save status + Read/Export/Delete), the in-note search bar is **collapsed behind a 🔍 toolbar button** (`toggleNoteSearchBar()`) instead of permanently eating a row, and the textarea uses a roomy `52dvh` at a 16px font (which also stops iOS focus auto-zoom).
- **Quick-create "New Note" now works from anywhere.** Tapping **New Note** in the dashboard quick-create FAB created a note but never navigated to it, so nothing visibly happened. `window.newNote` now switches to the Notes tab first, so it always lands you in the new note's editor with the title focused.
- **FAB no longer overlaps the note text.** The floating `+` button covered the bottom-right of the editor (and "new note while editing" was a confusing action). It is now hidden while a note is open (`body.note-open #globalFab`).
- **Dashboard notepad reclaimed ~150px of dead space.** `flex-grow` doesn't resolve in the auto-height mobile cards, so the notepad textarea collapsed to 44px inside a 220px card — a tiny field floating in empty space. The textarea now gets a real 150px writing area and the card hugs it.
- **To-do cards no longer clip their buttons.** When a task had category/date badges, the edit/delete buttons were pushed off the right edge. The task header now wraps on mobile (`.task-header { flex-wrap: wrap }`) so everything stays reachable.
- **Polish:** footer is now reliably hidden on mobile (its inline `display:flex` needed an `!important` override); gentle opacity-only fade when switching tabs (`tabFadeIn` — opacity only, since a transform would break the planner's `position:sticky`).

## 1.5.28 — 2026-06-28

- **Fixed: Note preview ignored single line breaks.** Pressing Enter once in the editor moved the cursor to a new line in the textarea, but the read/preview pane rendered the lines run together on one line. The markdown renderer (`configureMarked()` in `static/js/utils.js`) used marked's defaults, where a single newline is collapsed to a space (standard Markdown) and only a blank line starts a new paragraph. Enabled `breaks: true` (plus explicit `gfm: true`) so every single newline becomes a `<br>`, matching what's typed — the behavior people expect from a notes app. Affects the live preview, read mode, exported HTML, and compiled notebooks (all route through `mdToHtml`).
- **Fixed: Raw HTML / angle-bracket text rendered as `[object Object]`.** Typing literal HTML (e.g. `<div>`, `<TODO>`) into a note produced the text `[object Object]` in the preview. The custom `html` renderer was written for an older marked API and treated marked v15's token *object* as a string. It now reads `token.text` and escapes it, so embedded tags display as safe literal text (preserving the existing XSS protection). Inline `<` in prose (e.g. `a < b`) is unaffected.
- **Mobile PWA UI Overhaul:** Major improvements to the mobile experience across all major sections. Planner now auto-switches to Day view on mobile (instead of the unusable 7-column week grid) and the weeknav bar scrolls horizontally without wrapping. The time grid height is now dynamic (`100dvh - 205px`) so it fills the viewport cleanly without a scroll-within-scroll trap. Analytics section switches to a single-column bento grid on mobile so charts are full-width and readable. Habit checkboxes are enlarged to 28×28 px for comfortable touch interaction. Notes: the textarea `min-height` is reduced to `42dvh` so it no longer swallows the whole screen, the formatting toolbar scrolls horizontally instead of overflowing, and the header bar stacks vertically on narrow screens. Fixed a bug where creating a new note via the FAB didn't apply the `.note-editing` class to the notes layout, causing the note list and editor to be shown simultaneously on mobile in single-column view.

## 1.5.27 — 2026-06-28

- **Fixed: Notes could not be created or edited (regression).** The input validation added in 1.5.26 classified the `updated` (notes) and `uploaded` (files) columns as `YYYY-MM-DD` date strings. Both are actually epoch-millisecond `INTEGER` columns (the frontend sends `Date.now()`), so every `POST`/`PUT /api/notes` was rejected with `400 'updated' must be a string in YYYY-MM-DD format`, breaking note creation, auto-save, and editing. `blueprints/api.py` now validates `updated` and `uploaded` as bounded integers (epoch milliseconds), restoring all notes functionality. The cross-device edit-conflict detection (`409`) continues to work correctly.
- **Fixed: Missing database indexes after the foreign-key migration.** Migration `012_add_foreign_keys.sql` rebuilt the `tasks`, `notes`, and `files` tables (to add `ON DELETE CASCADE`). SQLite drops every index attached to a table when that table is dropped, so the version indexes (migration 009) and foreign-key indexes (migration 010) on those three tables were silently lost — degrading incremental-sync and cascade-delete query performance. New migration `013_restore_indexes_after_table_rebuild.sql` recreates the six affected indexes idempotently (`CREATE INDEX IF NOT EXISTS`), applying automatically to both fresh and already-upgraded databases.

## 1.5.26 — 2026-06-25

- **Backend Input Validation for Generic CRUD Endpoints:** The `POST /api/<table>` and `PUT /api/<table>/<rid>` endpoints now validate every accepted field before touching the database. A new `_validate_fields()` helper in `blueprints/api.py` enforces: date format (`YYYY-MM-DD`) for date columns, datetime format (`YYYY-MM-DDTHH:MM`) for `due_date` / `completed_at`, time format (`HH:MM`) for `start` / `end`, numeric ranges for `ects` (0–999), `grade` (0–10), `dur`, `dist`, `duration` (0–1 000 000), boolean coercion for `done`, `is_pinned`, `completed`, integer bounds for `order_index`, `size`, `reminder_offset`, an allowed-set enum for the `events.type` column (including dynamic `ics_N` types), and max-length checks for all string / URL fields. Malformed payloads now return a descriptive `400 Bad Request` JSON error instead of a database exception or silent data corruption. No new dependencies were added — validation uses stdlib only.

## 1.5.25 — 2026-06-25

- **Unified Custom Scrollbar Theme:** Introduced a cohesive, theme-aware scrollbar system across all scrollable containers. Three new CSS custom properties (`--scrollbar-thumb`, `--scrollbar-track`, `--scrollbar-thumb-hover`) are declared in `:root` (dark) and `[data-theme="light"]`, so scrollbar colours follow the active colour scheme automatically. The modern `scrollbar-color` / `scrollbar-width` API is used globally via a `*` selector. A `@supports not (scrollbar-color: auto)` block provides `::-webkit-scrollbar` legacy fallbacks for older browsers without duplication. The cyberpunk theme receives neon-accent thumb colours; a `prefers-contrast: more` media query forces high-contrast black/white styling for accessibility.

## 1.5.24 — 2026-06-25

- **Animated Checkbox Interaction:** Redesigned `.hcheck` custom checkboxes. Added smooth scale hover (`scale(1.08)`) and active click (`scale(0.95)`) transitions. Swapped the static text checkmark ("✓") for a CSS pseudo-element-drawn checkmark that animate-scales from 0 to 1 with a spring-loaded `cubic-bezier(0.34, 1.56, 0.64, 1)` easing, enhancing user interaction across all tasks, habits, files selection, and customization toggles.

## 1.5.23 — 2026-06-25

- **Screenshot Generator Mock Mismatch Fix:** Fixed a property name discrepancy in the Puppeteer-based screenshot generation script (`take_screenshots.js`) where mock tasks used the property `text` (e.g., `{text: 'Submit ML Assignment'}`) instead of `name`. This mismatch caused the generated Dashboard screenshots to display empty task checkbox widgets without names. Corrected the mock tasks in `take_screenshots.js` to match the application schema's `name` property.

## 1.5.22 — 2026-06-25

- **Swipe-to-Delete Action Label Fix:** Fixed a misleading swipe action label on Notes list where swipe-to-delete notes displayed a green-looking "Archive" button and "Note archived" toast, but actually deleted the database records permanently. Updated the label to "Delete" (✕ Delete) and the toast notifications to "Note deleted".

## 1.5.21 — 2026-06-25

- **Notes Folder Deletion Re-parenting Fix:** Fixed a functional bug where deleting a notes folder orphaned its child notes and subfolders (making them permanently invisible in the UI).
  - Explicitly prioritized the specific `/api/note_folders/<fid>` DELETE route over the generic `/api/<table>/<rid>` route.
  - Hardened the backend's generic `delete_row` route to intercept and safely delegate deletions of custom tables (`note_folders`, `folders`, `files`) to their custom functions.
  - Implemented client-side optimistic update re-parenting in `static/js/utils.js` for both note folders and file folders so that offline changes immediately reflect the correct layout.
  - Added automated unit test covering note folder and subfolder re-parenting on deletion.

## 1.5.20 — 2026-06-25

- **Waitress Access Logging:** Implemented `LoggingMiddleware` to wrap Flask's `wsgi_app` inside `app.py`. The middleware intercepts incoming HTTP requests and outputs standard Apache Combined Log entries to `stdout` for debugging and security auditing. It automatically bypasses logging during unit tests to keep test output clean.
- **Automated Asset Cache-Busting:** Implemented dynamic cache-busting versioning on application startup. Python calculates a SHA-256 hash of the static assets and injects this hash version into all local CSS and JS imports within `index.html` and `login.html`. Additionally, it updates the service worker (`sw.js`) cache name and replaces `caches.match` with `{ignoreSearch: true}` to enable seamless offline asset matching with version query parameters.
- **Python3 Command Standard:** Configured codebase documentation to standardise on `python3`/`pip3` for all operations.

## 1.5.19 — 2026-06-25

- **CLI Administration Tools for Recovery:** Added command-line options (`--reset-password "<new_password>"` and `--disable-2fa`) to `app.py`. This allows self-hosted administrators who are locked out to safely clear TOTP keys and reset their admin password directly from the host terminal.

## 1.5.18 — 2026-06-25

- **Optimized FTS5 Search Storage:** Transitioned SQLite FTS5 search index virtual tables (`notes_fts` and `files_fts`) to External Content Tables. This stores indices in FTS5 but refers to original text/filename columns in the main tables by mapping `rowid` to the underlying table's `rowid`, eliminating data duplication and reducing database file size. Added migration `011_optimize_fts5_storage.sql` to upgrade existing databases.

## 1.5.17 — 2026-06-25

- **SQLite Foreign Key Missing Indices:** Created a database migration to add indexes on foreign keys (`parent_id`, `folder_id`, `habit_id`) for `tasks`, `notes`, `note_folders`, `files`, `folders`, and `habit_log`. This avoids full table scans when parent records are deleted and cascading operations are triggered, improving performance.

## 1.5.16 — 2026-06-25

- **Asynchronous Task Queue Recovery:** Added startup task queue recovery logic. When the application server starts up, it scans the `queued_tasks` table for any tasks stuck in the `running` state (e.g. from an abrupt crash or server restart). It resets tasks with remaining retries back to `pending` (updating error log to "Server restarted" and clearing execution flags) to ensure they get re-executed, and marks tasks that have exhausted their max attempts as `failed` to prevent infinite restart-crash loops.

## 1.5.15 — 2026-06-25

- **HTTP Retry Decorator for External Sync:** Introduced a robust `@http_retry` decorator using exponential backoff to handle transient network drops and rate-limiting (HTTP 429) for external sync tasks. Replaced direct requests with `http_get` and `http_post` in the Strava integration (`blueprints/strava.py`) and Calendar integration (`blueprints/calendar.py`), preventing sudden sync failures on temporary external API drops.

## 1.5.14 — 2026-06-25

- **SQLite WAL Checkpointing:** Implemented weekly SQLite WAL checkpointing (`PRAGMA wal_checkpoint(TRUNCATE)`) during the Sunday session cleanup task in `scheduler.py` to prevent the WAL log file from growing indefinitely and maintain optimal read/write performance.

## 1.5.13 — 2026-06-25

- **Visual Drop-Target Feedback:** Replaced the `.folder-drag-over` CSS class with a unified `.drag-over` class in `static/js/files.js` and `static/js/notes.js`. Updated `.drag-over` styling in `static/style.css` to provide immediate, dashed accent border visual feedback when dragging files or notes over folders, breadcrumb links, and list items.
- **Service Worker Cache Update:** Bumped service worker cache version to `tylo-v103`.

## 1.5.12 — 2026-06-25

- **Live Theme Synced Chart.js Styling:** Implemented a new custom event `theme-changed` dispatched from `theme.js` when the theme, theme style, or accent color is updated. Subscribed to this event in `analytics.js` to dynamically redraw active charts with updated CSS variables (such as grid, text, and panel colors) without requiring a page reload.
- **Service Worker Cache Update:** Bumped service worker cache version to `tylo-v102` and cache-buster asset version queries in `index.html` to `v=85`.

## 1.5.11 — 2026-06-24

- **Component-Level Reactivity & Targeted Rendering:** Optimized the frontend rendering loop to only re-render the currently active tab on state changes. Inactive tabs are marked stale and rendered on-demand when activated, preventing background layout thrashing and CPU load.
- **Localized DOM Event-Based Patching:** Introduced custom DOM events (`tylo:task-updated`, `tylo:habit-toggled`) to update checkboxes, streak badges, and widget elements locally without triggering full tab re-renders. Bumped service worker cache to `tylo-v101` and asset version query parameters in `index.html` to `v=84`.

## 1.5.10 — 2026-06-24

- **Graceful Web Push Notification Fallback:** Wrapped external dependencies (`pywebpush`, `py-vapid`, and `cryptography`) in try-except blocks. If these optional packages are missing in the runtime environment, the system now logs a warning instead of raising `ModuleNotFoundError`. This prevents scheduler tasks (like daily morning agendas) from failing when run in minimal test or production environments.

## 1.5.9 — 2026-06-24

- **Refactored Custom Modals to Native `<dialog>`:** Refactored all 8 custom modal overlays to native HTML5 `<dialog>` elements. This adds native Escape key handling, keyboard focus trapping, and backdrop dismissal. Removed redundant manual Escape key and backdrop click handlers from `tasks.js`, and updated `planner.js` to correctly detect open dialogs for keyboard shortcut blocking. Bumped service worker cache to `tylo-v100`.

## 1.5.8 — 2026-06-24

- **Richer iCal/ICS Feed Export:** Enriched `/calendar.ics` to export event `location`, `description`, and recurrence rules (`RRULE`) using standard ICS attributes.
- **UTC Timezone Synchronization:** Timed events are converted to UTC based on the application timezone setting and exported with the `Z` suffix, preventing timezone shifts on external clients. All-day events remain date-only to keep their all-day status.

## 1.5.7 — 2026-06-24

- **Delta Sync Database Indexing:** Created a database migration to add indexes on the `version` column for all 12 synchronized tables (`tasks`, `events`, `exams`, `habits`, `habit_log`, `workouts`, `notes`, `note_folders`, `files`, `folders`, `shortcuts`, `study_sessions`). This prevents full-table scans during delta sync polling, improving backend response times and overall application performance.

## 1.5.6 — 2026-06-24

- **Session Lifetime Management & Cleanup:** Implemented a weekly background cleanup task in `scheduler.py` to purge database sessions that have been inactive for more than 30 days. The task runs automatically at 04:00 AM on Sundays (alongside storage cleanup) and deletes inactive entries from the `user_sessions` table, keeping database size optimized.

## 1.5.5 — 2026-06-24

- **Silent Sync-Queue Data Loss Fix:** Fixed an issue where 401/403 HTTP responses (due to expired session) inside the offline syncQueue loop would cause data loss by silently deleting offline changes from IndexedDB. Added checks to alert the user, redirect them to the login page, and abort sync execution, successfully preserving all queued changes. Bumped service worker cache to `tylo-v99` and asset version query parameters in `index.html` to `v=83`.

## 1.5.4 — 2026-06-24

- **Redundant Double Script Load Fix:** Removed the redundant `/static/app.js` module script tag from the footer of `index.html`. This fixes a console 404 error when `static_url_path=""` is configured on the backend. Bumped service worker cache to `tylo-v98` and asset version query parameters in `index.html` to `v=82`.

## 1.5.3 — 2026-06-24

- **Keyboard Shortcuts Input Collision Fix:** Added the `isInputFocused()` utility function to check if any text input, textarea, select element, or contenteditable block is focused. Integrated this helper to guard the global planner keydown shortcut handler, preventing typing input (like `t`, `w`, `n`) from triggering layout transitions or modal openings. Bumped service worker cache to `tylo-v97`.

## 1.5.2 — 2026-06-24

- **Modern Navigation View Transitions:** Integrated the browser View Transitions API (`document.startViewTransition`) during tab navigation to animate cross-tab transitions smoothly. Added directionality detection to slide new content in from the right when moving forward in the tab index, and from the left when moving backward. Provided full backwards-compatibility for older browsers supporting View Transitions but not active types by setting class names (`transition-forward`/`transition-backward`) on the document element. Automatically respects user preferences for reduced motion (`prefers-reduced-motion: reduce`). Bumped service worker cache to `tylo-v96`.

## 1.5.1 — 2026-06-24

- **PWA Loading Resilience:** Wrapped the fallback state and settings retrieval calls in try-catch blocks to gracefully load the IndexedDB cached state on network/server failure. This prevents unhandled exceptions from rejecting the initialization promise, resolving the issue where offline users encounter a permanent blank screen or spinner when the server is unreachable. Bumped service worker cache to `tylo-v95`.

## 1.5.0 — 2026-06-24

- **Cryptographic Password Hashing & Management:** Upgraded the application authentication to hash passwords using the strong `scrypt` algorithm (via Werkzeug) instead of relying on plain-text comparisons. Added automatic database bootstrapping that hashes and saves the environment variable `AUTH_PASSWORD` to the SQLite `kv` table on startup. Implemented a "Change Password" form under Settings → Security that allows users to securely update their login password directly from the user interface, bypassing the need to edit environment variables. Requires 2FA verification code confirmation if two-factor authentication is active. Bumped service worker cache to `tylo-v93`.

## 1.4.9 — 2026-06-24

- **Storage Reconciliation & Weekly Cleanup:** Implemented a weekly background storage cleanup and reconciliation task running at 04:00 AM on Sundays. The task scans `data/uploads/` to delete orphaned files that are no longer referenced in the `files` database table. It also identifies and logs any files that are referenced in the database but missing from disk, storing the results in the `queued_tasks` execution log. Added a protected `POST /api/files/cleanup` route to allow manual cleanup execution.
- **SQLite Foreign Key Enforcements:** Enabled foreign key constraint enforcement (`PRAGMA foreign_keys = ON;`) on all database connections to prevent data orphaning and ensure relational integrity at the database engine level.

## 1.4.8 — 2026-06-23

- **Uniform API Error Handling & Structured JSON Responses:** Registered a global Flask error handler for HTTP exceptions and generic Python server exceptions. All unhandled exceptions are caught and formatted into structured JSON responses containing detailed error descriptions, HTTP status codes, and exception types. This guarantees that all client-side fetch calls receive valid JSON payloads even on 404, 405, or 500 server errors, enhancing PWA/offline recovery and preventing parser crashes.

## 1.4.7 — 2026-06-23

- **Response Compression (Gzip):** Implemented an after-request middleware in `app.py` utilizing the standard library's `gzip` module. Automatically compresses responses for supported MIME types (JSON, HTML, CSS, JS, XML, SVG) that exceed 500 bytes when clients specify support through the `Accept-Encoding: gzip` request header. Properly manages cache-proxy safety by appending the `Vary: Accept-Encoding` header. Excludes streams, non-compressible binary media, and failed status responses.

## 1.4.6 — 2026-06-23

- **Incremental API State Sync (Delta Sync):** Refactored the state synchronization protocol to support delta sync (`GET /api/state?since_version=X`), returning only records inserted, updated, or deleted since version `X` across all user data tables. Implemented an automatic trigger-based SQLite state-version tracker where inserts, updates, and deletes increment the global `state_version` and tag rows with the corresponding version. Added a `deleted_records` tombstone table to track deleted IDs. Refactored the frontend synchronization pipeline to perform incremental syncs and reconcile client-generated temporary IDs with server-assigned UUIDs, minimizing payload size and database overhead on poor connections. Bumped service worker cache to `tylo-v90`.

## 1.4.5 — 2026-06-23

- **SQLite Auto-Vacuuming & Fragment Optimization:** Enabled incremental auto-vacuum mode (`PRAGMA auto_vacuum = INCREMENTAL`) on database initialization, running a full database `VACUUM` to restructure database pages on disk. Integrated connection-level optimizations by executing `PRAGMA optimize;` before closing active connections, keeping the SQLite query planner statistics up to date. Set up a daily cron job inside the scheduler loop running at `03:00` to execute `PRAGMA incremental_vacuum;` and reclaim unused database pages from deleted files, notes, and activity logs.

## 1.4.4 — 2026-06-23

- **Structured Schema Versioning & Migrations:** Decoupled SQLite database schema management from startup code by implementing a lightweight, file-based migrations manager. Migrations are organized as standalone SQL files under the `migrations/` folder (`001` through `005`) and run sequentially inside transactions on startup. Added an auto-detection engine to determine version profiles of legacy pre-migration databases, preventing re-execution of older column alterations. Tracks the current database version in the `kv` table to ensure safe, thread-safe, and race-free schema management.

## 1.4.3 — 2026-06-23

- **SQLite Full-Text Search (FTS5):** Set up `fts5` virtual tables (`notes_fts` and `files_fts`) to index note titles/bodies and filenames. Synchronized index updates using automated SQLite database triggers (`INSERT`, `UPDATE`, `DELETE`). Added custom search API endpoints (`/api/notes/search` and `/api/files/search`) featuring prefix query formatting (incremental typing wildcard support) and query tokenization. Integrated endpoints into the frontend with a 150ms debounce window and built-in offline fallbacks to local JavaScript substring matching. Bumped service worker cache to `tylo-v89`.

## 1.4.2 — 2026-06-23

- **SQLite Connection Pooling (g context):** Implemented connection pooling using Flask's `g` application context to store a single database connection per request. The connection is opened on demand on the first database call and automatically closed during request teardown context, reducing overhead, improving response times, and ensuring thread-safe transaction isolation. Stands on fallback behavior for non-request contexts (CLI, tests, scheduler daemon threads).

## 1.4.1 — 2026-06-23

- **Real-Time Live Updates:** Added automatic background synchronization across multiple open application instances. The backend tracks data modifications using SQLite transaction hooks and increments a `state_version` key. A smart, background-aware polling loop on the frontend checks this version and triggers a silent state refresh on mismatch, updating all tabs, widgets, notes, files, habits, and stats in real-time. Also added a continuous timer in the Planner view that updates the current time indicator red bar every 15 seconds, automatically executing a full re-render on day transitions. Bumped service worker cache to `tylo-v88`.
- **Styled HTML Notes Compilation & Download:** Added options to download notes or entire folders as styled, standalone HTML files/folders that preserve the dark/light/cyberpunk styling, responsive layouts, code syntax highlighting, and formatting of the application's read mode for offline reading. Supported downloading the entire notebook as a single compiled HTML file.

## 1.4.0 — 2026-06-22

- **Application Time Zone Support:** Added a new setting to configure the application's timezone with auto-detection capability in the Settings panel. Refactored the backend scheduler, calendar auto-sync/import/export, Strava synchronization, backups, and reminders to compute local time relative to the configured timezone (using a new `local_now()` helper), fixing offset discrepancies and syncing errors.
- **Calendar Customization Panel:** Added a new "Customize Calendars" modal to the planner view. Users can toggle the visibility of individual event types (like workouts, study, exams) and specific subscribed calendar feeds, as well as customize their individual rendering colors. Updated calendar feed parsing to track source-specific IDs (`ics_0`, `ics_1`, etc.) to support granular feed-level styling.
- **Media Preview Scaling & PWA Caching:** Overhauled media preview modal dimensions to dynamically adapt based on the file's mimetype (e.g., maximizing viewport space for PDFs, fitting image/video aspect ratios, and compacting audio players). Registered and cached local Chart.js assets in the Service Worker (`static/sw.js`) to support fully offline-capable dashboard analytics.
- **Space-Efficient UI Polish:** Removed all internal page title headers across all tabs (e.g., "Exams, deadlines & grades", "Habits", etc.) to maximize vertical screen space and reduce redundancy with the top navigation bar. Moved the "⚙️ Customize" button from the dashboard header into the global footer. Scaled the custom dashboard website shortcuts up by 1.5x (both desktop and mobile) for improved tap targets and visual proportions relative to dashboard widget cards.
- **UI Overhaul & Dashboard Analytics Redesign:** Completely overhauled the main user interface to introduce a sleeker, space-efficient, premium design. The layout now utilizes wide screens effectively by expanding the main container's maximum width. The header and navigation tabs have been visually refined for a more compact and modern appearance, featuring an elegant animated bottom border for active tabs and no heavy backgrounds. The Analytics tab was refactored from vertically stacked blocks into a beautiful masonry-style `.cards` grid layout, bringing it aesthetically in line with a modern dashboard. Additionally, statistic blocks and global cards received subtle border, shadow, and hover improvements while keeping the base background solid and non-distracting. Bumped service worker cache to `tylo-v81`.
- **Native Web Push Notifications:** Implemented native Web Push notifications via the browser's Service Worker and VAPID key pairs generated programmatically on server startup. Stores subscription metadata in a new `push_subscriptions` database table. Added client-side capability checking (requires secure context HTTPS or localhost) in the Settings panel: displays a toggle to register/unregister the current browser for push notifications if supported, and shows a helpful fallback warning recommending `ntfy` for local HTTP-only network access. Integrates seamlessly with backend scheduler jobs (agendas, habit nudges, event reminders). Bumped service worker cache to `tylo-v75`.
- **Notes Folder Organization System:** Implemented a new hierarchical folder organization system for Notes. Added a file-explorer style drag-and-drop interface allowing you to seamlessly move notes into folders, create nested directories infinitely deep, navigate via a breadcrumb trail header, and drag-and-drop folders among siblings to intuitively re-order them. Added custom emoji icon support for folders. Note searches seamlessly support finding items within sub-directories of the active folder context.
- **Mobile-Friendly File & Notes Upgrades:** Added a highly responsive Floating Action Button (FAB) for mobile viewports, supporting quick entry shortcuts that dynamically adapt to the active tab (including a custom multi-action speed dial menu on Dashboard and Files tabs). Implemented fluid, touch-friendly swipe-left gestures to archive/delete notes (red track with archive indicator) and mark tasks as completed (green track with checkmark indicator) via event delegation. Added a direct phone camera capture upload option to the File Manager (complete with a hidden `capture="camera"` file input, a "📸 Camera" toolbar button, and a dedicated speed dial action). Bumped service worker cache to `tylo-v74`.
- **Touch-Optimized Calendar & Planner:** Improved mobile calendar interactions using native Pointer Events. Implemented fluid touch drag-and-drop on mobile screens with a 250ms long-press hold delay and scroll-locking, and converted event resizing handlers to use Pointer Events for seamless touch and mouse resizing. Added swipe gestures (left/right) on the Calendar viewport to navigate between days and weeks. Added double-tap and long-press gestures on empty calendar cells (month cells and time-grid content) to quickly open the event creation modal at the target day/time. Bumped service worker cache to `tylo-v73`.
- **Study Timer & Pomodoro Tracker:** Implemented an integrated circular countdown timer and stopwatch widget for the dashboard using Alpine.js. Features customizable study (15/25/45/50/60m) and break (3/5/10/15m) cycles in Pomodoro mode, an active subject text tracker, state persistence in `localStorage` to survive page reloads and tab closures, and a client-side Web Audio API synthesizer that plays a chime when a session finishes. Supports logging completed sessions to a new `study_sessions` SQLite table. Integrated logged sessions into the **Analytics** tab with a dedicated "Study hours per month (actual logged sessions)" bar chart, an updated totals summary metric, and an interactive study history log table with deletion support. Bumped service worker cache to `tylo-v72`.
- **Security & Reverse Proxy Improvements:** Added `ProxyFix` middleware to correctly resolve client IP addresses and protocol schemes behind reverse proxies (like Cloudflare Tunnel) to fix URL generation. Upgraded session cookie security by enforcing `HttpOnly` and `SameSite='Lax'`, and implemented an anti-CSRF check (`X-Requested-With` header) for all mutating API requests. Replaced thread-blocking sleep functions in authentication routes with a non-blocking in-memory IP rate limiter to prevent Denial of Service (DoS) attacks via Waitress thread exhaustion. Added a strict Content Security Policy (CSP) header, extracting inline scripts to `js/bottom_nav.js` and `js/login.js`. Enabled SQLite Write-Ahead Logging (WAL) mode for improved database concurrency. Bumped service worker cache to `tylo-v68`.
- **Cyberpunk Theme Polish & Light Mode Overhaul:** Fully overhauled the Cyberpunk theme style. Resolved issues where Cyberpunk in Light Mode was identical to Dark Mode by introducing a custom retro-futuristic light aesthetic featuring a light gray-grid background (`#f5f6f9`), white card surfaces, dark monospace text, and crisp neon outlines. Polished Cyberpunk styles globally across the project to cover all inputs, selects, textareas, buttons, navigation tabs, calendar cells, checklist items, badges, stats blocks, and toggles for a completely unified retro-cyber look. Bumped service worker cache to `tylo-v67`.
- **Deadline & Calendar Sync:** Implemented bidirectional synchronization between deadlines (exams) and calendar events. Creating, updating, or deleting an exam automatically creates, updates, or deletes a corresponding all-day event of type 'deadline' on the calendar (sharing the same ID). Conversely, creating, updating, or deleting/moving a 'deadline' type calendar event automatically keeps the corresponding exam in sync. Modified ICS export to prevent duplicate event listings. Added red border/background styles for 'deadline' events in Month, Week, and Day views, and highlighted them in the Today's Plan agenda list with a red background, red left border, and a prominent 'DEADLINE' badge. Bumped service worker cache to `tylo-v64`.
- **Improved Today's Plan & Customizer:** Rebuilt the dashboard customization system with a pointer/touch event-based layout engine, a real-time vertical compaction and collision-resolution algorithm, and uniform 150px grid rows. Today's Plan widget shows start/end times and categorizes events into past and upcoming/happening. Clicking on a dashboard event shows a details popup modal with a direct "Edit in Calendar" button that shifts focus to the Calendar tab and opens the event editor form. Fixed card overflow behavior by making grid cards layout as flex columns so that content scrolls gracefully rather than spilling out when resized below default heights. Bumped service worker cache to `tylo-v62`.
- **Dashboard Shortcuts Integration:** Merged Dashboard Shortcuts management (adding, reordering, enabling/disabling, removing, and toggling the standalone row visibility) directly into the **Dashboard Customizer** panel. Removed the dedicated shortcuts card from the **Settings & integrations** tab to centralize all dashboard customization.
- **Customizer Checkboxes:** Replaced all standard inputs and toggles inside the **Dashboard Customizer** panel with habits-style custom checkboxes (`.hcheck`), providing a unified check-in styling and interactive feel. Bumped service worker cache to `tylo-v58`.

- **Dashboard Widgets & Multiple Instances:** Added support for multiple-instance widgets stored in `dashboard_widgets_data` settings. Added four new widget types: **Notepad** (`quick_notes`) with local font picker (sans, serif, mono) and debounced auto-saving; **Mini-Chart** (`analytics`) displaying last 6 months for a configured metric (study hours, workouts, habits, running, cycling) with inline metric switcher; **Custom Text** (`custom_text`) rendering markdown parsed via marked.js; and **Clock** (`greeting`) with a personalized time-based greeting, date, and local time updating every 10 seconds.
- **Widget Customization & Options:** Implemented widget settings popup modal in Edit Mode (via gear ⚙️ icon on cards) to change custom widget titles, apply border color overrides, adjust widget-specific settings, and delete widget instances. Added "Add Widget Instance" dropdown selection in Customizer panel to create and append new widget instances. Bumped service worker cache to `tylo-v56`.
- **Dashboard Grid & Customization:** Added a customizable dashboard grid system supporting a 12-column desktop grid and a 6-column mobile grid. Added visual theme options (Glassmorphism, Minimalist Cyberpunk, Flat Material) and preconfigured layout templates (Balanced, Academic Focus, Active/Healthy, Minimalist). Implemented full drag-and-drop widget swapping, drag-to-grid placement, and intuitive mouse/touch resizing handles to customize grid column/row spans. Persisted layouts and styling preferences to the backend database settings.
- **Dashboard Content Integration:** Integrated all core content widgets (Deadlines, Today's Plan, Habits, Workouts, Tasks, Shortcuts) into the grid layout as customizable drag-and-drop cards. Added a unified **Quick Add** widget to quickly create events, tasks, habits, workouts, or exams directly from the dashboard. Added a **Recent Files** widget displaying the 5 most recently uploaded files with inline download and preview actions. Renamed 'today' layout widgets to 'today_plan' with automatic backward compatibility mapping. Bumed service worker cache to `tylo-v55`.


## 1.3.0 — 2026-06-15

- **Software Update Notifications:** Added a non-obtrusive version check system that polls GitHub's API to subtly notify the user via a settings badge and bottom-right banner when an update is available, showing the command-line updates to run.
- **PWA & Offline Mode Support:** Implemented a robust IndexedDB synchronization queue to allow viewing, creating, editing, and deleting notes, tasks, and events offline. Intercepted all client-side API requests to resolve state/settings from the database cache when offline and queue mutations (`POST`, `PUT`, `DELETE`). Added optimistic UI updates for instant feedback, a sticky "Working Offline — X changes pending" banner at the top of the viewport, automatic sequence replay on reconnect, and aggressive Service Worker asset caching.
- **Advanced Task Management:** Added custom categories/tags with custom color pickers and dynamic badge styling, HTML5 drag-and-drop prioritization, nested checklists for subtasks, a datetime-local picker for due dates/times, filtering out subtasks from the dashboard open to-dos list, and automated ntfy reminders for overdue tasks and tasks due in the next 24 hours in the morning agenda.
- **Notes Editor Enhancements:** Upgraded markdown rendering to use `marked.js` with custom wiki-style cross-link support and safe HTML escaping. Replaced manual Edit/View modes with a responsive dual-pane split layout (side-by-side on desktop, stacked on mobile). Added real-time word/character counters and a debounced autosave status indicator (Typing, Saving, Saved at timestamp). Added per-note persistence of Read Mode and Split View toggle preferences, as well as automatic active tab and active note restoration across page reloads. Added a toggle setting in the Appearance card to enable or disable active tab persistence. Styled the note search bar larger and full-width in Read Mode. Added Enter key navigation to step through search results in all search bars.

- **2FA Recovery Help:** Added a small, secure hint on the login page's 2FA screen explaining how to recover access (deleting `totp_secret` from the database `kv` table).
- **Calendar Sync Fixes:** Fixed ICS calendar import to parse and convert UTC and timezone-aware datetimes to the server's local timezone. Added extraction, unescaping, and synchronization support for event locations and descriptions.
- **File Manager Upgrades:** Implement nested directory folders with tree-navigation breadcrumbs, full-tab visual drag-and-drop upload zone overlay, centered media preview modal for image, video, audio, and PDF formats, and inline renamers for files and folders. Added multiselect checkbox controls for bulk file management (batch deletion and dropdown moves) and interactive drag-and-drop support to move selected files into subfolder list items or relocate them out of directories using droppable breadcrumb path links. Added a recursive files search scoped to the current folder and its subfolders, displaying the location path in the metadata.
- **Files Search Bugfix:** Fixed a ReferenceError when typing in the files search bar by binding `renderFiles` to the global `window` object in `app.js` and bumping the service worker cache version to `tylo-v38`.
- **Event Modal Enhancements:** Support for saving the event modal by pressing the "Enter" key on any input/select element (excluding the description textarea and custom reminder inputs), and display the event location pin `📍` and text directly below the time range on timed event cards.
- **Dashboard Shortcuts:** Custom user-defined website shortcuts directly visible on the dashboard.
- **Customization:** Persistent custom accent color picker for UI theming.
- **Mobile Navigation:** Bottom navigation bar for improved mobile experience.
- **Week Planner Visuals & Overlaps:** Google Calendar style greedy interval-clustering overlapping layout, dotted half-hour lines in the time grid background, a red indicator dot at the left edge of the current time line, and drag-to-select support to easily schedule events across custom time ranges.
- **High-Performance Rendering:** Event drag/drop, resizing, and modal saves/deletes update the UI instantly using optimistic rendering and background API calls, preventing full-screen blank flashing and UI freezing. Added layout scroll-locking guards to prevent the calendar viewport from shifting or scrolling down during view updates or drag-and-resize interactions.
- **Keyboard Shortcuts:** Global hotkeys (`t`, `w`, `d`, `m`, `n`, `p`, `c`) for navigation, with a dedicated customization modal and "⌨️ Shortcuts" header button to review, modify, and persist custom shortcut keys.
- **Notes & Files:** Gold/yellow visual highlight for favorited items.
- **File storage:** upload files, search by filename, sort by date/name/size,
  and download them from a dedicated Files tab. Files are stored in
  `data/uploads/` on disk; metadata is in the `files` table. Uploaded files
  are not included in JSON backups — back up `data/uploads/` separately.
- **Notes search:** global search bar in the note list filters by title and
  body (with highlighted snippets); a per-note search bar lets you search
  within the open note, with match count and ↑/↓ navigation in both edit
  and view modes.
- **Test suite:** added `test_app.py` (stdlib `unittest` + Flask test client,
  no new dependencies) covering the generic CRUD API and the auth/routing
  guard. Run with `python -m unittest test_app`. See `docs/development.md`.

## 1.2.0 — 2026-06-10

- Restructured documentation for public release: new README, `docs/` folder
  (install, configuration, integrations, development), CONTRIBUTING,
  SECURITY, GPLv3 LICENSE, changelog.
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
