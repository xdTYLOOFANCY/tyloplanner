-- Migration 024: tags on notes (same pattern as exam tags, migration 019).
-- tags: comma-separated tag names; the global tag list lives in kv set_note_tags.
ALTER TABLE notes ADD COLUMN tags TEXT;
