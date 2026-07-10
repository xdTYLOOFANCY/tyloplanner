-- Per-task recurrence (daily/weekly/biweekly/monthly). Completing a recurring
-- task advances its due date to the next occurrence instead of finishing it.
ALTER TABLE tasks ADD COLUMN recurrence TEXT;
