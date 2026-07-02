-- Migration 017: rich-text (WYSIWYG) notes.
--
-- The notes editor moved from a Markdown textarea to a WYSIWYG editor (Quill),
-- which stores rich HTML in notes.body. body_format records how a row's body is
-- encoded so legacy Markdown notes keep rendering correctly and are converted to
-- HTML lazily the first time they are opened and saved.
--   'md'   -> body is Markdown (all pre-existing notes)
--   'html' -> body is sanitized rich HTML (all new / re-saved notes)
-- Additive column; safe on upgraded DBs.

ALTER TABLE notes ADD COLUMN body_format TEXT NOT NULL DEFAULT 'md';
