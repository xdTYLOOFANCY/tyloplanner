-- Drop old triggers
DROP TRIGGER IF EXISTS notes_insert;
DROP TRIGGER IF EXISTS notes_update;
DROP TRIGGER IF EXISTS notes_delete;
DROP TRIGGER IF EXISTS files_insert;
DROP TRIGGER IF EXISTS files_update;
DROP TRIGGER IF EXISTS files_delete;

-- Drop old FTS tables (whether they were external content or not)
DROP TABLE IF EXISTS notes_fts;
DROP TABLE IF EXISTS files_fts;

-- Recreate FTS tables as External Content tables
CREATE VIRTUAL TABLE notes_fts USING fts5(
  id UNINDEXED,
  title,
  body,
  content='notes',
  content_rowid='rowid'
);

CREATE VIRTUAL TABLE files_fts USING fts5(
  id UNINDEXED,
  filename,
  content='files',
  content_rowid='rowid'
);

-- Recreate triggers to sync FTS tables
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

-- Seed FTS5 virtual tables with existing data
INSERT INTO notes_fts(rowid, id, title, body)
SELECT rowid, id, title, body FROM notes;

INSERT INTO files_fts(rowid, id, filename)
SELECT rowid, id, filename FROM files;
