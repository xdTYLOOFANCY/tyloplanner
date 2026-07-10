# Grade goal calculator — design

2026-07-07 · Exams & Grades tab · frontend-only

## Overview

Per-tracker target average with a "what do I need on my remaining exams"
readout and a what-if sandbox dialog. Answers: *what average must I score on
my ungraded exams to end at my target?*

## Data

- New optional field `target` (float, 1–10) on each tracker object in the
  existing `exam_trackers` settings JSON (managed by `static/js/exams.js`).
  Absent or 0 = no target set.
- No new tables, columns, endpoints, or `SETTING_DEFAULTS` entries —
  `exam_trackers` already persists.

## Computation

One exported pure function in `static/js/exams.js`, e.g.
`neededAvg(target, exams)` → `{ avg, needed, remainingEcts, gradedEcts, state }`.

Row classification reuses the exact rules `examStats` applies
(`exams.js:334–372`), scoped to the active tracker:

- **Graded (counts toward the average):** Dutch-numeric grades only (1–10).
  Letters, percentages, and pass/fail words are excluded — identical to the
  existing displayed average.
- **Remaining:** rows where `gradeVal(e)` is empty (no grade, no grade_text)
  and `ects > 0`. Date is irrelevant, so past-dated resit rows count.
- Ungraded rows without ECTS are ignored entirely.

With `Wd` = Σ ects of graded rows, `Σgw` = Σ grade×ects (the existing
`dutchSum`), `Wr` = Σ ects of remaining rows:

```
needed = (target × (Wd + Wr) − Σgw) / Wr
```

- Computation keeps full precision; **display rounds up** to one decimal
  (a "need ≥ x" claim must actually reach the target).
- States: `needed > 10` → red "Not reachable" · `needed ≤ 5.5` → green
  "Any pass secures it" · otherwise amber, plain number.
- Edge cases: no target set → strip shows the average plus "Set a target";
  `Wr = 0` → "Add upcoming exams with ECTS to plan"; `Wd = 0` → average
  shows "–" and `needed = target`.

## UI

Compact strip beside the existing ECTS donut, scoped to the active tracker:

```
Average 7.42 · Target [7.5] · Need ≥ 7.8 on remaining 12 EC   [What if…]
```

- Target is `<input type="number" min="1" max="10" step="0.1">`, saved on
  change into the tracker JSON (same path as `saveEctsGoal`). Clearing it
  unsets the target.
- **What if… dialog** (the 1.14.0 in-app dialog pattern): lists remaining
  rows (name, date, ECTS), each with a hypothetical grade input (1–10).
  Projected average and needed-on-still-empty recompute live as you type:
  filled hypotheticals count as graded, `needed` re-solves over the rows
  still empty. Nothing persists; single Close button.

## Live-sync safety

- The target input joins the existing focus-guard (`exams.js:501`) so the
  poll can't wipe an in-progress edit.
- The what-if dialog must survive `renderAll()` re-renders: render it
  outside the re-rendered exams container, or skip the exams re-render while
  it's open — match what the 1.14.0 dialogs already do.

## Out of scope

Per-tag filtering, course composition weights (60/40 components), non-Dutch
scales in the calculation, backend changes.

## Verification

- Math lives in one exported pure function.
- `/verify-ui` with a seeded tracker containing graded + ungraded rows:
  strip renders at desktop (1280×800) and mobile (375×812); a target edit
  survives a live-sync poll; the what-if dialog recomputes live and closes
  clean; all three states (red/amber/green) reachable.
- `CHANGELOG.md` entry + docs update land with the implementation.
