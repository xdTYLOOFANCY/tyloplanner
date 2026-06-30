-- Migration 015: per-event color override.
--
-- Optional hex color (e.g. "#a371f7") that overrides the type/calendar color
-- for a single event, matching Google Calendar's per-event recolor. Empty/NULL
-- = use the type color. Additive and nullable; safe on upgraded DBs.

ALTER TABLE events ADD COLUMN color TEXT;
