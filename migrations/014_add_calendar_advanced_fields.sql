-- Migration 014: advanced calendar fields for Google-Calendar parity.
--
-- Adds columns to `events` for three feature groups:
--   * Multi-day / midnight-spanning events   -> end_date
--   * Richer recurrence (every-N, weekly-on-multiple-days, ends-after-N)
--                                             -> recurrence_interval,
--                                                recurrence_days, recurrence_count
--   * Single-occurrence exceptions/overrides  -> excluded_dates
--
-- All additive and nullable (recurrence_interval defaults to 1), so existing
-- rows keep their current behavior and the change is safe on upgraded DBs.

ALTER TABLE events ADD COLUMN end_date TEXT;
ALTER TABLE events ADD COLUMN recurrence_interval INTEGER DEFAULT 1;
ALTER TABLE events ADD COLUMN recurrence_days TEXT;
ALTER TABLE events ADD COLUMN recurrence_count INTEGER;
ALTER TABLE events ADD COLUMN excluded_dates TEXT;
