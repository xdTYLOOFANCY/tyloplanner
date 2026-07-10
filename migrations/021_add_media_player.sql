-- Migration 021: media player — playlists, playlist tracks, and cached audio
-- metadata on files. New tables follow the incremental-sync pattern from
-- migration 006: a `version` column plus insert/update/delete triggers that
-- bump kv.state_version and record tombstones in deleted_records.

CREATE TABLE IF NOT EXISTS playlists (
    id      TEXT PRIMARY KEY,
    name    TEXT NOT NULL DEFAULT 'Untitled Playlist',
    created INTEGER NOT NULL DEFAULT 0,
    updated INTEGER NOT NULL DEFAULT 0,
    version INTEGER DEFAULT 0
);

CREATE TABLE IF NOT EXISTS playlist_tracks (
    id          TEXT PRIMARY KEY,
    playlist_id TEXT NOT NULL,
    file_id     TEXT NOT NULL,
    position    INTEGER NOT NULL DEFAULT 0,
    added       INTEGER NOT NULL DEFAULT 0,
    version     INTEGER DEFAULT 0,
    FOREIGN KEY(playlist_id) REFERENCES playlists(id) ON DELETE CASCADE,
    FOREIGN KEY(file_id) REFERENCES files(id) ON DELETE CASCADE
);
CREATE INDEX IF NOT EXISTS idx_pt_playlist ON playlist_tracks(playlist_id, position);

-- Cached audio metadata (filled by mutagen on upload / /api/music/scan)
ALTER TABLE files ADD COLUMN duration REAL;
ALTER TABLE files ADD COLUMN audio_title TEXT;
ALTER TABLE files ADD COLUMN audio_artist TEXT;
ALTER TABLE files ADD COLUMN audio_album TEXT;

-- Sync triggers for playlists
CREATE TRIGGER IF NOT EXISTS trg_playlists_insert AFTER INSERT ON playlists
BEGIN
    INSERT INTO kv(key, value) VALUES('state_version', '1')
    ON CONFLICT(key) DO UPDATE SET value = CAST(value AS INTEGER) + 1;
    UPDATE playlists SET version = (SELECT CAST(value AS INTEGER) FROM kv WHERE key = 'state_version') WHERE id = NEW.id;
    DELETE FROM deleted_records WHERE id = NEW.id AND "table" = 'playlists';
END;

CREATE TRIGGER IF NOT EXISTS trg_playlists_update AFTER UPDATE ON playlists
WHEN OLD.version = NEW.version OR (OLD.version IS NULL AND NEW.version IS NULL)
BEGIN
    INSERT INTO kv(key, value) VALUES('state_version', '1')
    ON CONFLICT(key) DO UPDATE SET value = CAST(value AS INTEGER) + 1;
    UPDATE playlists SET version = (SELECT CAST(value AS INTEGER) FROM kv WHERE key = 'state_version') WHERE id = NEW.id;
END;

CREATE TRIGGER IF NOT EXISTS trg_playlists_delete AFTER DELETE ON playlists
BEGIN
    INSERT INTO kv(key, value) VALUES('state_version', '1')
    ON CONFLICT(key) DO UPDATE SET value = CAST(value AS INTEGER) + 1;
    INSERT INTO deleted_records (id, "table", version)
    VALUES (OLD.id, 'playlists', (SELECT CAST(value AS INTEGER) FROM kv WHERE key = 'state_version'))
    ON CONFLICT(id, "table") DO UPDATE SET version = excluded.version;
END;

-- Sync triggers for playlist_tracks
CREATE TRIGGER IF NOT EXISTS trg_playlist_tracks_insert AFTER INSERT ON playlist_tracks
BEGIN
    INSERT INTO kv(key, value) VALUES('state_version', '1')
    ON CONFLICT(key) DO UPDATE SET value = CAST(value AS INTEGER) + 1;
    UPDATE playlist_tracks SET version = (SELECT CAST(value AS INTEGER) FROM kv WHERE key = 'state_version') WHERE id = NEW.id;
    DELETE FROM deleted_records WHERE id = NEW.id AND "table" = 'playlist_tracks';
END;

CREATE TRIGGER IF NOT EXISTS trg_playlist_tracks_update AFTER UPDATE ON playlist_tracks
WHEN OLD.version = NEW.version OR (OLD.version IS NULL AND NEW.version IS NULL)
BEGIN
    INSERT INTO kv(key, value) VALUES('state_version', '1')
    ON CONFLICT(key) DO UPDATE SET value = CAST(value AS INTEGER) + 1;
    UPDATE playlist_tracks SET version = (SELECT CAST(value AS INTEGER) FROM kv WHERE key = 'state_version') WHERE id = NEW.id;
END;

CREATE TRIGGER IF NOT EXISTS trg_playlist_tracks_delete AFTER DELETE ON playlist_tracks
BEGIN
    INSERT INTO kv(key, value) VALUES('state_version', '1')
    ON CONFLICT(key) DO UPDATE SET value = CAST(value AS INTEGER) + 1;
    INSERT INTO deleted_records (id, "table", version)
    VALUES (OLD.id, 'playlist_tracks', (SELECT CAST(value AS INTEGER) FROM kv WHERE key = 'state_version'))
    ON CONFLICT(id, "table") DO UPDATE SET version = excluded.version;
END;
