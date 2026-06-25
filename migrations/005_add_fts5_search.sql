CREATE VIRTUAL TABLE IF NOT EXISTS notes_fts USING fts5(
  id UNINDEXED,
  title,
  body,
  content='notes',
  content_rowid='rowid'
);

CREATE VIRTUAL TABLE IF NOT EXISTS files_fts USING fts5(
  id UNINDEXED,
  filename,
  content='files',
  content_rowid='rowid'
);

CREATE TRIGGER IF NOT EXISTS notes_insert AFTER INSERT ON notes BEGIN
  INSERT INTO notes_fts(rowid, id, title, body) VALUES(new.rowid, new.id, new.title, new.body);
END;
CREATE TRIGGER IF NOT EXISTS notes_update AFTER UPDATE OF title, body ON notes BEGIN
  INSERT INTO notes_fts(notes_fts, rowid, id, title, body) VALUES('delete', old.rowid, old.id, old.title, old.body);
  INSERT INTO notes_fts(rowid, id, title, body) VALUES(new.rowid, new.id, new.title, new.body);
END;
CREATE TRIGGER IF NOT EXISTS notes_delete AFTER DELETE ON notes BEGIN
  INSERT INTO notes_fts(notes_fts, rowid, id, title, body) VALUES('delete', old.rowid, old.id, old.title, old.body);
END;

CREATE TRIGGER IF NOT EXISTS files_insert AFTER INSERT ON files BEGIN
  INSERT INTO files_fts(rowid, id, filename) VALUES(new.rowid, new.id, new.filename);
END;
CREATE TRIGGER IF NOT EXISTS files_update AFTER UPDATE OF filename ON files BEGIN
  INSERT INTO files_fts(files_fts, rowid, id, filename) VALUES('delete', old.rowid, old.id, old.filename);
  INSERT INTO files_fts(rowid, id, filename) VALUES(new.rowid, new.id, new.filename);
END;
CREATE TRIGGER IF NOT EXISTS files_delete AFTER DELETE ON files BEGIN
  INSERT INTO files_fts(files_fts, rowid, id, filename) VALUES('delete', old.rowid, old.id, old.filename);
END;

-- Seed FTS5 virtual tables with existing data
INSERT INTO notes_fts(rowid, id, title, body)
SELECT rowid, id, title, body FROM notes
WHERE NOT EXISTS (SELECT 1 FROM notes_fts WHERE notes_fts.rowid = notes.rowid);

INSERT INTO files_fts(rowid, id, filename)
SELECT rowid, id, filename FROM files
WHERE NOT EXISTS (SELECT 1 FROM files_fts WHERE files_fts.rowid = files.rowid);
