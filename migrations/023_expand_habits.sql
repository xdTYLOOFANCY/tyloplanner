-- Migration 022: Expand habits with frequency targets, archive, and ordering

ALTER TABLE habits ADD COLUMN frequency INTEGER DEFAULT 7;
ALTER TABLE habits ADD COLUMN archived INTEGER DEFAULT 0;
ALTER TABLE habits ADD COLUMN order_index INTEGER DEFAULT 0;
