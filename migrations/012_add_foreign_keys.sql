-- Migration 012: Add ON DELETE CASCADE to foreign keys

-- Add ON DELETE CASCADE to tasks.parent_id (acting as subtasks.task_id)
CREATE TABLE tasks_new (
    id TEXT PRIMARY KEY, 
    name TEXT, 
    done INTEGER DEFAULT 0,
    created TEXT, 
    completed_at TEXT,
    due TEXT,
    category TEXT,
    order_index INTEGER DEFAULT 0,
    due_date TEXT,
    parent_id TEXT,
    version INTEGER DEFAULT 0,
    FOREIGN KEY(parent_id) REFERENCES tasks(id) ON DELETE CASCADE
);
INSERT INTO tasks_new SELECT id, name, done, created, completed_at, due, category, order_index, due_date, parent_id, version FROM tasks;
DROP TABLE tasks;
ALTER TABLE tasks_new RENAME TO tasks;

-- Add ON DELETE CASCADE to notes.folder_id
CREATE TABLE notes_new (
    id TEXT PRIMARY KEY, 
    title TEXT, 
    body TEXT, 
    updated INTEGER,
    is_pinned INTEGER DEFAULT 0,
    folder_id TEXT,
    version INTEGER DEFAULT 0,
    FOREIGN KEY(folder_id) REFERENCES note_folders(id) ON DELETE CASCADE
);
INSERT INTO notes_new SELECT id, title, body, updated, is_pinned, folder_id, version FROM notes;
DROP TABLE notes;
ALTER TABLE notes_new RENAME TO notes;

-- Add ON DELETE CASCADE to files.folder_id (addressing tasks.folder_id as it seems to be a typo for files.folder_id)
CREATE TABLE files_new (
    id TEXT PRIMARY KEY, 
    filename TEXT, 
    size INTEGER, 
    mimetype TEXT, 
    uploaded INTEGER,
    is_pinned INTEGER DEFAULT 0,
    folder_id TEXT,
    version INTEGER DEFAULT 0,
    FOREIGN KEY(folder_id) REFERENCES folders(id) ON DELETE CASCADE
);
INSERT INTO files_new SELECT id, filename, size, mimetype, uploaded, is_pinned, folder_id, version FROM files;
DROP TABLE files;
ALTER TABLE files_new RENAME TO files;

-- Recreate sync triggers for tasks
CREATE TRIGGER trg_tasks_insert AFTER INSERT ON tasks
BEGIN
    INSERT INTO kv(key, value) VALUES('state_version', '1')
    ON CONFLICT(key) DO UPDATE SET value = CAST(value AS INTEGER) + 1;
    UPDATE tasks SET version = (SELECT CAST(value AS INTEGER) FROM kv WHERE key = 'state_version') WHERE id = NEW.id;
    DELETE FROM deleted_records WHERE id = NEW.id AND "table" = 'tasks';
END;
CREATE TRIGGER trg_tasks_update AFTER UPDATE ON tasks
WHEN OLD.version = NEW.version OR (OLD.version IS NULL AND NEW.version IS NULL)
BEGIN
    INSERT INTO kv(key, value) VALUES('state_version', '1')
    ON CONFLICT(key) DO UPDATE SET value = CAST(value AS INTEGER) + 1;
    UPDATE tasks SET version = (SELECT CAST(value AS INTEGER) FROM kv WHERE key = 'state_version') WHERE id = NEW.id;
END;
CREATE TRIGGER trg_tasks_delete AFTER DELETE ON tasks
BEGIN
    INSERT INTO kv(key, value) VALUES('state_version', '1')
    ON CONFLICT(key) DO UPDATE SET value = CAST(value AS INTEGER) + 1;
    INSERT INTO deleted_records (id, "table", version)
    VALUES (OLD.id, 'tasks', (SELECT CAST(value AS INTEGER) FROM kv WHERE key = 'state_version'))
    ON CONFLICT(id, "table") DO UPDATE SET version = excluded.version;
END;

-- Recreate sync triggers for notes
CREATE TRIGGER trg_notes_insert AFTER INSERT ON notes
BEGIN
    INSERT INTO kv(key, value) VALUES('state_version', '1')
    ON CONFLICT(key) DO UPDATE SET value = CAST(value AS INTEGER) + 1;
    UPDATE notes SET version = (SELECT CAST(value AS INTEGER) FROM kv WHERE key = 'state_version') WHERE id = NEW.id;
    DELETE FROM deleted_records WHERE id = NEW.id AND "table" = 'notes';
END;
CREATE TRIGGER trg_notes_update AFTER UPDATE ON notes
WHEN OLD.version = NEW.version OR (OLD.version IS NULL AND NEW.version IS NULL)
BEGIN
    INSERT INTO kv(key, value) VALUES('state_version', '1')
    ON CONFLICT(key) DO UPDATE SET value = CAST(value AS INTEGER) + 1;
    UPDATE notes SET version = (SELECT CAST(value AS INTEGER) FROM kv WHERE key = 'state_version') WHERE id = NEW.id;
END;
CREATE TRIGGER trg_notes_delete AFTER DELETE ON notes
BEGIN
    INSERT INTO kv(key, value) VALUES('state_version', '1')
    ON CONFLICT(key) DO UPDATE SET value = CAST(value AS INTEGER) + 1;
    INSERT INTO deleted_records (id, "table", version)
    VALUES (OLD.id, 'notes', (SELECT CAST(value AS INTEGER) FROM kv WHERE key = 'state_version'))
    ON CONFLICT(id, "table") DO UPDATE SET version = excluded.version;
END;

-- Recreate FTS triggers for notes
CREATE TRIGGER notes_insert AFTER INSERT ON notes BEGIN
  INSERT INTO notes_fts(rowid, id, title, body) VALUES(new.rowid, new.id, new.title, new.body);
END;
CREATE TRIGGER notes_update AFTER UPDATE OF title, body ON notes BEGIN
  INSERT INTO notes_fts(notes_fts, rowid, id, title, body) VALUES('delete', old.rowid, old.id, old.title, old.body);
  INSERT INTO notes_fts(rowid, id, title, body) VALUES(new.rowid, new.id, new.title, new.body);
END;
CREATE TRIGGER notes_delete AFTER DELETE ON notes BEGIN
  INSERT INTO notes_fts(notes_fts, rowid, id, title, body) VALUES('delete', old.rowid, old.id, old.title, old.body);
END;

-- Recreate sync triggers for files
CREATE TRIGGER trg_files_insert AFTER INSERT ON files
BEGIN
    INSERT INTO kv(key, value) VALUES('state_version', '1')
    ON CONFLICT(key) DO UPDATE SET value = CAST(value AS INTEGER) + 1;
    UPDATE files SET version = (SELECT CAST(value AS INTEGER) FROM kv WHERE key = 'state_version') WHERE id = NEW.id;
    DELETE FROM deleted_records WHERE id = NEW.id AND "table" = 'files';
END;
CREATE TRIGGER trg_files_update AFTER UPDATE ON files
WHEN OLD.version = NEW.version OR (OLD.version IS NULL AND NEW.version IS NULL)
BEGIN
    INSERT INTO kv(key, value) VALUES('state_version', '1')
    ON CONFLICT(key) DO UPDATE SET value = CAST(value AS INTEGER) + 1;
    UPDATE files SET version = (SELECT CAST(value AS INTEGER) FROM kv WHERE key = 'state_version') WHERE id = NEW.id;
END;
CREATE TRIGGER trg_files_delete AFTER DELETE ON files
BEGIN
    INSERT INTO kv(key, value) VALUES('state_version', '1')
    ON CONFLICT(key) DO UPDATE SET value = CAST(value AS INTEGER) + 1;
    INSERT INTO deleted_records (id, "table", version)
    VALUES (OLD.id, 'files', (SELECT CAST(value AS INTEGER) FROM kv WHERE key = 'state_version'))
    ON CONFLICT(id, "table") DO UPDATE SET version = excluded.version;
END;

-- Recreate FTS triggers for files
CREATE TRIGGER files_insert AFTER INSERT ON files BEGIN
  INSERT INTO files_fts(rowid, id, filename) VALUES(new.rowid, new.id, new.filename);
END;
CREATE TRIGGER files_update AFTER UPDATE OF filename ON files BEGIN
  INSERT INTO files_fts(files_fts, rowid, id, filename) VALUES('delete', old.rowid, old.id, old.filename);
  INSERT INTO files_fts(rowid, id, filename) VALUES(new.rowid, new.id, new.filename);
END;
CREATE TRIGGER files_delete AFTER DELETE ON files BEGIN
  INSERT INTO files_fts(files_fts, rowid, id, filename) VALUES('delete', old.rowid, old.id, old.filename);
END;
