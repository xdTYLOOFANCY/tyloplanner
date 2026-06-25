-- Migration 006: Add incremental sync columns, tombstones, and triggers

ALTER TABLE events ADD COLUMN version INTEGER DEFAULT 0;
ALTER TABLE exams ADD COLUMN version INTEGER DEFAULT 0;
ALTER TABLE habits ADD COLUMN version INTEGER DEFAULT 0;
ALTER TABLE habit_log ADD COLUMN version INTEGER DEFAULT 0;
ALTER TABLE workouts ADD COLUMN version INTEGER DEFAULT 0;
ALTER TABLE tasks ADD COLUMN version INTEGER DEFAULT 0;
ALTER TABLE notes ADD COLUMN version INTEGER DEFAULT 0;
ALTER TABLE note_folders ADD COLUMN version INTEGER DEFAULT 0;
ALTER TABLE files ADD COLUMN version INTEGER DEFAULT 0;
ALTER TABLE folders ADD COLUMN version INTEGER DEFAULT 0;
ALTER TABLE shortcuts ADD COLUMN version INTEGER DEFAULT 0;
ALTER TABLE study_sessions ADD COLUMN version INTEGER DEFAULT 0;

CREATE TABLE IF NOT EXISTS deleted_records (
    id TEXT,
    "table" TEXT,
    version INTEGER NOT NULL,
    PRIMARY KEY (id, "table")
);

CREATE INDEX IF NOT EXISTS idx_deleted_records_version ON deleted_records(version);

-- Triggers for events
CREATE TRIGGER IF NOT EXISTS trg_events_insert AFTER INSERT ON events
BEGIN
    INSERT INTO kv(key, value) VALUES('state_version', '1')
    ON CONFLICT(key) DO UPDATE SET value = CAST(value AS INTEGER) + 1;
    UPDATE events SET version = (SELECT CAST(value AS INTEGER) FROM kv WHERE key = 'state_version') WHERE id = NEW.id;
    DELETE FROM deleted_records WHERE id = NEW.id AND "table" = 'events';
END;

CREATE TRIGGER IF NOT EXISTS trg_events_update AFTER UPDATE ON events
WHEN OLD.version = NEW.version OR (OLD.version IS NULL AND NEW.version IS NULL)
BEGIN
    INSERT INTO kv(key, value) VALUES('state_version', '1')
    ON CONFLICT(key) DO UPDATE SET value = CAST(value AS INTEGER) + 1;
    UPDATE events SET version = (SELECT CAST(value AS INTEGER) FROM kv WHERE key = 'state_version') WHERE id = NEW.id;
END;

CREATE TRIGGER IF NOT EXISTS trg_events_delete AFTER DELETE ON events
BEGIN
    INSERT INTO kv(key, value) VALUES('state_version', '1')
    ON CONFLICT(key) DO UPDATE SET value = CAST(value AS INTEGER) + 1;
    INSERT INTO deleted_records (id, "table", version)
    VALUES (OLD.id, 'events', (SELECT CAST(value AS INTEGER) FROM kv WHERE key = 'state_version'))
    ON CONFLICT(id, "table") DO UPDATE SET version = excluded.version;
END;

-- Triggers for exams
CREATE TRIGGER IF NOT EXISTS trg_exams_insert AFTER INSERT ON exams
BEGIN
    INSERT INTO kv(key, value) VALUES('state_version', '1')
    ON CONFLICT(key) DO UPDATE SET value = CAST(value AS INTEGER) + 1;
    UPDATE exams SET version = (SELECT CAST(value AS INTEGER) FROM kv WHERE key = 'state_version') WHERE id = NEW.id;
    DELETE FROM deleted_records WHERE id = NEW.id AND "table" = 'exams';
END;

CREATE TRIGGER IF NOT EXISTS trg_exams_update AFTER UPDATE ON exams
WHEN OLD.version = NEW.version OR (OLD.version IS NULL AND NEW.version IS NULL)
BEGIN
    INSERT INTO kv(key, value) VALUES('state_version', '1')
    ON CONFLICT(key) DO UPDATE SET value = CAST(value AS INTEGER) + 1;
    UPDATE exams SET version = (SELECT CAST(value AS INTEGER) FROM kv WHERE key = 'state_version') WHERE id = NEW.id;
END;

CREATE TRIGGER IF NOT EXISTS trg_exams_delete AFTER DELETE ON exams
BEGIN
    INSERT INTO kv(key, value) VALUES('state_version', '1')
    ON CONFLICT(key) DO UPDATE SET value = CAST(value AS INTEGER) + 1;
    INSERT INTO deleted_records (id, "table", version)
    VALUES (OLD.id, 'exams', (SELECT CAST(value AS INTEGER) FROM kv WHERE key = 'state_version'))
    ON CONFLICT(id, "table") DO UPDATE SET version = excluded.version;
END;

-- Triggers for habits
CREATE TRIGGER IF NOT EXISTS trg_habits_insert AFTER INSERT ON habits
BEGIN
    INSERT INTO kv(key, value) VALUES('state_version', '1')
    ON CONFLICT(key) DO UPDATE SET value = CAST(value AS INTEGER) + 1;
    UPDATE habits SET version = (SELECT CAST(value AS INTEGER) FROM kv WHERE key = 'state_version') WHERE id = NEW.id;
    DELETE FROM deleted_records WHERE id = NEW.id AND "table" = 'habits';
END;

CREATE TRIGGER IF NOT EXISTS trg_habits_update AFTER UPDATE ON habits
WHEN OLD.version = NEW.version OR (OLD.version IS NULL AND NEW.version IS NULL)
BEGIN
    INSERT INTO kv(key, value) VALUES('state_version', '1')
    ON CONFLICT(key) DO UPDATE SET value = CAST(value AS INTEGER) + 1;
    UPDATE habits SET version = (SELECT CAST(value AS INTEGER) FROM kv WHERE key = 'state_version') WHERE id = NEW.id;
END;

CREATE TRIGGER IF NOT EXISTS trg_habits_delete AFTER DELETE ON habits
BEGIN
    INSERT INTO kv(key, value) VALUES('state_version', '1')
    ON CONFLICT(key) DO UPDATE SET value = CAST(value AS INTEGER) + 1;
    INSERT INTO deleted_records (id, "table", version)
    VALUES (OLD.id, 'habits', (SELECT CAST(value AS INTEGER) FROM kv WHERE key = 'state_version'))
    ON CONFLICT(id, "table") DO UPDATE SET version = excluded.version;
END;

-- Triggers for habit_log
CREATE TRIGGER IF NOT EXISTS trg_habit_log_insert AFTER INSERT ON habit_log
BEGIN
    INSERT INTO kv(key, value) VALUES('state_version', '1')
    ON CONFLICT(key) DO UPDATE SET value = CAST(value AS INTEGER) + 1;
    UPDATE habit_log SET version = (SELECT CAST(value AS INTEGER) FROM kv WHERE key = 'state_version')
    WHERE habit_id = NEW.habit_id AND "date" = NEW.date;
    DELETE FROM deleted_records WHERE id = (NEW.habit_id || ':' || NEW.date) AND "table" = 'habit_log';
END;

CREATE TRIGGER IF NOT EXISTS trg_habit_log_update AFTER UPDATE ON habit_log
WHEN OLD.version = NEW.version OR (OLD.version IS NULL AND NEW.version IS NULL)
BEGIN
    INSERT INTO kv(key, value) VALUES('state_version', '1')
    ON CONFLICT(key) DO UPDATE SET value = CAST(value AS INTEGER) + 1;
    UPDATE habit_log SET version = (SELECT CAST(value AS INTEGER) FROM kv WHERE key = 'state_version')
    WHERE habit_id = NEW.habit_id AND "date" = NEW.date;
END;

CREATE TRIGGER IF NOT EXISTS trg_habit_log_delete AFTER DELETE ON habit_log
BEGIN
    INSERT INTO kv(key, value) VALUES('state_version', '1')
    ON CONFLICT(key) DO UPDATE SET value = CAST(value AS INTEGER) + 1;
    INSERT INTO deleted_records (id, "table", version)
    VALUES (OLD.habit_id || ':' || OLD.date, 'habit_log', (SELECT CAST(value AS INTEGER) FROM kv WHERE key = 'state_version'))
    ON CONFLICT(id, "table") DO UPDATE SET version = excluded.version;
END;

-- Triggers for workouts
CREATE TRIGGER IF NOT EXISTS trg_workouts_insert AFTER INSERT ON workouts
BEGIN
    INSERT INTO kv(key, value) VALUES('state_version', '1')
    ON CONFLICT(key) DO UPDATE SET value = CAST(value AS INTEGER) + 1;
    UPDATE workouts SET version = (SELECT CAST(value AS INTEGER) FROM kv WHERE key = 'state_version') WHERE id = NEW.id;
    DELETE FROM deleted_records WHERE id = NEW.id AND "table" = 'workouts';
END;

CREATE TRIGGER IF NOT EXISTS trg_workouts_update AFTER UPDATE ON workouts
WHEN OLD.version = NEW.version OR (OLD.version IS NULL AND NEW.version IS NULL)
BEGIN
    INSERT INTO kv(key, value) VALUES('state_version', '1')
    ON CONFLICT(key) DO UPDATE SET value = CAST(value AS INTEGER) + 1;
    UPDATE workouts SET version = (SELECT CAST(value AS INTEGER) FROM kv WHERE key = 'state_version') WHERE id = NEW.id;
END;

CREATE TRIGGER IF NOT EXISTS trg_workouts_delete AFTER DELETE ON workouts
BEGIN
    INSERT INTO kv(key, value) VALUES('state_version', '1')
    ON CONFLICT(key) DO UPDATE SET value = CAST(value AS INTEGER) + 1;
    INSERT INTO deleted_records (id, "table", version)
    VALUES (OLD.id, 'workouts', (SELECT CAST(value AS INTEGER) FROM kv WHERE key = 'state_version'))
    ON CONFLICT(id, "table") DO UPDATE SET version = excluded.version;
END;

-- Triggers for tasks
CREATE TRIGGER IF NOT EXISTS trg_tasks_insert AFTER INSERT ON tasks
BEGIN
    INSERT INTO kv(key, value) VALUES('state_version', '1')
    ON CONFLICT(key) DO UPDATE SET value = CAST(value AS INTEGER) + 1;
    UPDATE tasks SET version = (SELECT CAST(value AS INTEGER) FROM kv WHERE key = 'state_version') WHERE id = NEW.id;
    DELETE FROM deleted_records WHERE id = NEW.id AND "table" = 'tasks';
END;

CREATE TRIGGER IF NOT EXISTS trg_tasks_update AFTER UPDATE ON tasks
WHEN OLD.version = NEW.version OR (OLD.version IS NULL AND NEW.version IS NULL)
BEGIN
    INSERT INTO kv(key, value) VALUES('state_version', '1')
    ON CONFLICT(key) DO UPDATE SET value = CAST(value AS INTEGER) + 1;
    UPDATE tasks SET version = (SELECT CAST(value AS INTEGER) FROM kv WHERE key = 'state_version') WHERE id = NEW.id;
END;

CREATE TRIGGER IF NOT EXISTS trg_tasks_delete AFTER DELETE ON tasks
BEGIN
    INSERT INTO kv(key, value) VALUES('state_version', '1')
    ON CONFLICT(key) DO UPDATE SET value = CAST(value AS INTEGER) + 1;
    INSERT INTO deleted_records (id, "table", version)
    VALUES (OLD.id, 'tasks', (SELECT CAST(value AS INTEGER) FROM kv WHERE key = 'state_version'))
    ON CONFLICT(id, "table") DO UPDATE SET version = excluded.version;
END;

-- Triggers for notes
CREATE TRIGGER IF NOT EXISTS trg_notes_insert AFTER INSERT ON notes
BEGIN
    INSERT INTO kv(key, value) VALUES('state_version', '1')
    ON CONFLICT(key) DO UPDATE SET value = CAST(value AS INTEGER) + 1;
    UPDATE notes SET version = (SELECT CAST(value AS INTEGER) FROM kv WHERE key = 'state_version') WHERE id = NEW.id;
    DELETE FROM deleted_records WHERE id = NEW.id AND "table" = 'notes';
END;

CREATE TRIGGER IF NOT EXISTS trg_notes_update AFTER UPDATE ON notes
WHEN OLD.version = NEW.version OR (OLD.version IS NULL AND NEW.version IS NULL)
BEGIN
    INSERT INTO kv(key, value) VALUES('state_version', '1')
    ON CONFLICT(key) DO UPDATE SET value = CAST(value AS INTEGER) + 1;
    UPDATE notes SET version = (SELECT CAST(value AS INTEGER) FROM kv WHERE key = 'state_version') WHERE id = NEW.id;
END;

CREATE TRIGGER IF NOT EXISTS trg_notes_delete AFTER DELETE ON notes
BEGIN
    INSERT INTO kv(key, value) VALUES('state_version', '1')
    ON CONFLICT(key) DO UPDATE SET value = CAST(value AS INTEGER) + 1;
    INSERT INTO deleted_records (id, "table", version)
    VALUES (OLD.id, 'notes', (SELECT CAST(value AS INTEGER) FROM kv WHERE key = 'state_version'))
    ON CONFLICT(id, "table") DO UPDATE SET version = excluded.version;
END;

-- Triggers for note_folders
CREATE TRIGGER IF NOT EXISTS trg_note_folders_insert AFTER INSERT ON note_folders
BEGIN
    INSERT INTO kv(key, value) VALUES('state_version', '1')
    ON CONFLICT(key) DO UPDATE SET value = CAST(value AS INTEGER) + 1;
    UPDATE note_folders SET version = (SELECT CAST(value AS INTEGER) FROM kv WHERE key = 'state_version') WHERE id = NEW.id;
    DELETE FROM deleted_records WHERE id = NEW.id AND "table" = 'note_folders';
END;

CREATE TRIGGER IF NOT EXISTS trg_note_folders_update AFTER UPDATE ON note_folders
WHEN OLD.version = NEW.version OR (OLD.version IS NULL AND NEW.version IS NULL)
BEGIN
    INSERT INTO kv(key, value) VALUES('state_version', '1')
    ON CONFLICT(key) DO UPDATE SET value = CAST(value AS INTEGER) + 1;
    UPDATE note_folders SET version = (SELECT CAST(value AS INTEGER) FROM kv WHERE key = 'state_version') WHERE id = NEW.id;
END;

CREATE TRIGGER IF NOT EXISTS trg_note_folders_delete AFTER DELETE ON note_folders
BEGIN
    INSERT INTO kv(key, value) VALUES('state_version', '1')
    ON CONFLICT(key) DO UPDATE SET value = CAST(value AS INTEGER) + 1;
    INSERT INTO deleted_records (id, "table", version)
    VALUES (OLD.id, 'note_folders', (SELECT CAST(value AS INTEGER) FROM kv WHERE key = 'state_version'))
    ON CONFLICT(id, "table") DO UPDATE SET version = excluded.version;
END;

-- Triggers for files
CREATE TRIGGER IF NOT EXISTS trg_files_insert AFTER INSERT ON files
BEGIN
    INSERT INTO kv(key, value) VALUES('state_version', '1')
    ON CONFLICT(key) DO UPDATE SET value = CAST(value AS INTEGER) + 1;
    UPDATE files SET version = (SELECT CAST(value AS INTEGER) FROM kv WHERE key = 'state_version') WHERE id = NEW.id;
    DELETE FROM deleted_records WHERE id = NEW.id AND "table" = 'files';
END;

CREATE TRIGGER IF NOT EXISTS trg_files_update AFTER UPDATE ON files
WHEN OLD.version = NEW.version OR (OLD.version IS NULL AND NEW.version IS NULL)
BEGIN
    INSERT INTO kv(key, value) VALUES('state_version', '1')
    ON CONFLICT(key) DO UPDATE SET value = CAST(value AS INTEGER) + 1;
    UPDATE files SET version = (SELECT CAST(value AS INTEGER) FROM kv WHERE key = 'state_version') WHERE id = NEW.id;
END;

CREATE TRIGGER IF NOT EXISTS trg_files_delete AFTER DELETE ON files
BEGIN
    INSERT INTO kv(key, value) VALUES('state_version', '1')
    ON CONFLICT(key) DO UPDATE SET value = CAST(value AS INTEGER) + 1;
    INSERT INTO deleted_records (id, "table", version)
    VALUES (OLD.id, 'files', (SELECT CAST(value AS INTEGER) FROM kv WHERE key = 'state_version'))
    ON CONFLICT(id, "table") DO UPDATE SET version = excluded.version;
END;

-- Triggers for folders
CREATE TRIGGER IF NOT EXISTS trg_folders_insert AFTER INSERT ON folders
BEGIN
    INSERT INTO kv(key, value) VALUES('state_version', '1')
    ON CONFLICT(key) DO UPDATE SET value = CAST(value AS INTEGER) + 1;
    UPDATE folders SET version = (SELECT CAST(value AS INTEGER) FROM kv WHERE key = 'state_version') WHERE id = NEW.id;
    DELETE FROM deleted_records WHERE id = NEW.id AND "table" = 'folders';
END;

CREATE TRIGGER IF NOT EXISTS trg_folders_update AFTER UPDATE ON folders
WHEN OLD.version = NEW.version OR (OLD.version IS NULL AND NEW.version IS NULL)
BEGIN
    INSERT INTO kv(key, value) VALUES('state_version', '1')
    ON CONFLICT(key) DO UPDATE SET value = CAST(value AS INTEGER) + 1;
    UPDATE folders SET version = (SELECT CAST(value AS INTEGER) FROM kv WHERE key = 'state_version') WHERE id = NEW.id;
END;

CREATE TRIGGER IF NOT EXISTS trg_folders_delete AFTER DELETE ON folders
BEGIN
    INSERT INTO kv(key, value) VALUES('state_version', '1')
    ON CONFLICT(key) DO UPDATE SET value = CAST(value AS INTEGER) + 1;
    INSERT INTO deleted_records (id, "table", version)
    VALUES (OLD.id, 'folders', (SELECT CAST(value AS INTEGER) FROM kv WHERE key = 'state_version'))
    ON CONFLICT(id, "table") DO UPDATE SET version = excluded.version;
END;

-- Triggers for shortcuts
CREATE TRIGGER IF NOT EXISTS trg_shortcuts_insert AFTER INSERT ON shortcuts
BEGIN
    INSERT INTO kv(key, value) VALUES('state_version', '1')
    ON CONFLICT(key) DO UPDATE SET value = CAST(value AS INTEGER) + 1;
    UPDATE shortcuts SET version = (SELECT CAST(value AS INTEGER) FROM kv WHERE key = 'state_version') WHERE id = NEW.id;
    DELETE FROM deleted_records WHERE id = NEW.id AND "table" = 'shortcuts';
END;

CREATE TRIGGER IF NOT EXISTS trg_shortcuts_update AFTER UPDATE ON shortcuts
WHEN OLD.version = NEW.version OR (OLD.version IS NULL AND NEW.version IS NULL)
BEGIN
    INSERT INTO kv(key, value) VALUES('state_version', '1')
    ON CONFLICT(key) DO UPDATE SET value = CAST(value AS INTEGER) + 1;
    UPDATE shortcuts SET version = (SELECT CAST(value AS INTEGER) FROM kv WHERE key = 'state_version') WHERE id = NEW.id;
END;

CREATE TRIGGER IF NOT EXISTS trg_shortcuts_delete AFTER DELETE ON shortcuts
BEGIN
    INSERT INTO kv(key, value) VALUES('state_version', '1')
    ON CONFLICT(key) DO UPDATE SET value = CAST(value AS INTEGER) + 1;
    INSERT INTO deleted_records (id, "table", version)
    VALUES (OLD.id, 'shortcuts', (SELECT CAST(value AS INTEGER) FROM kv WHERE key = 'state_version'))
    ON CONFLICT(id, "table") DO UPDATE SET version = excluded.version;
END;

-- Triggers for study_sessions
CREATE TRIGGER IF NOT EXISTS trg_study_sessions_insert AFTER INSERT ON study_sessions
BEGIN
    INSERT INTO kv(key, value) VALUES('state_version', '1')
    ON CONFLICT(key) DO UPDATE SET value = CAST(value AS INTEGER) + 1;
    UPDATE study_sessions SET version = (SELECT CAST(value AS INTEGER) FROM kv WHERE key = 'state_version') WHERE id = NEW.id;
    DELETE FROM deleted_records WHERE id = NEW.id AND "table" = 'study_sessions';
END;

CREATE TRIGGER IF NOT EXISTS trg_study_sessions_update AFTER UPDATE ON study_sessions
WHEN OLD.version = NEW.version OR (OLD.version IS NULL AND NEW.version IS NULL)
BEGIN
    INSERT INTO kv(key, value) VALUES('state_version', '1')
    ON CONFLICT(key) DO UPDATE SET value = CAST(value AS INTEGER) + 1;
    UPDATE study_sessions SET version = (SELECT CAST(value AS INTEGER) FROM kv WHERE key = 'state_version') WHERE id = NEW.id;
END;

CREATE TRIGGER IF NOT EXISTS trg_study_sessions_delete AFTER DELETE ON study_sessions
BEGIN
    INSERT INTO kv(key, value) VALUES('state_version', '1')
    ON CONFLICT(key) DO UPDATE SET value = CAST(value AS INTEGER) + 1;
    INSERT INTO deleted_records (id, "table", version)
    VALUES (OLD.id, 'study_sessions', (SELECT CAST(value AS INTEGER) FROM kv WHERE key = 'state_version'))
    ON CONFLICT(id, "table") DO UPDATE SET version = excluded.version;
END;
