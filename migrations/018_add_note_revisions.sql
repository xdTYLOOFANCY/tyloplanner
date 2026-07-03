-- Migration 018: per-note version history.
--
-- A time-bucketed snapshot of a note's content is captured on save (at most one
-- per ~10 min of editing) so earlier versions can be previewed and restored.
-- Not part of /api/state — revisions are fetched on demand via dedicated
-- endpoints. Rows cascade-delete with their note (foreign_keys is ON).

CREATE TABLE IF NOT EXISTS note_revisions (
    id          TEXT PRIMARY KEY,
    note_id     TEXT NOT NULL,
    title       TEXT,
    body        TEXT,
    body_format TEXT NOT NULL DEFAULT 'html',
    created     INTEGER NOT NULL,
    FOREIGN KEY(note_id) REFERENCES notes(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_note_revisions_note ON note_revisions(note_id, created DESC);
