-- Migration 029: Trash for the Files tab.
-- Soft-delete timestamp (ms epoch) on files and folders; NULL = live.
-- The version-bump triggers from migration 006 fire on these UPDATEs, so
-- trashing/restoring propagates through incremental sync automatically.
ALTER TABLE files ADD COLUMN deleted INTEGER;
ALTER TABLE folders ADD COLUMN deleted INTEGER;
