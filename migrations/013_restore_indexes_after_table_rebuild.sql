-- Migration 013: Restore indexes dropped by the table rebuilds in migration 012.
--
-- Migration 012 rebuilt the tasks, notes and files tables (CREATE _new /
-- INSERT / DROP / RENAME) to add ON DELETE CASCADE foreign keys. SQLite drops
-- every index attached to a table when that table is dropped, so the version
-- indexes (migration 009) and foreign-key indexes (migration 010) on these three
-- tables were silently lost. That degrades incremental-sync and cascade-delete
-- query performance. Recreate exactly those six indexes here.

-- version indexes (from migration 009)
CREATE INDEX IF NOT EXISTS idx_tasks_version ON tasks(version);
CREATE INDEX IF NOT EXISTS idx_notes_version ON notes(version);
CREATE INDEX IF NOT EXISTS idx_files_version ON files(version);

-- foreign-key indexes (from migration 010)
CREATE INDEX IF NOT EXISTS idx_tasks_parent_id ON tasks(parent_id);
CREATE INDEX IF NOT EXISTS idx_notes_folder_id ON notes(folder_id);
CREATE INDEX IF NOT EXISTS idx_files_folder_id ON files(folder_id);
