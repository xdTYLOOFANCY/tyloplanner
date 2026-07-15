-- Task priority (high/med/low, for sorting + a badge), a per-task reminder
-- offset (minutes before the due datetime, reusing the events reminder model),
-- and a link from a calendar event back to the task it time-blocks.
ALTER TABLE tasks ADD COLUMN priority TEXT;
ALTER TABLE tasks ADD COLUMN reminder_offset TEXT;
ALTER TABLE events ADD COLUMN task_id TEXT;
