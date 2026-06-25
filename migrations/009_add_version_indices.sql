-- Migration 009: Add indexes on the version column for all synchronized tables
CREATE INDEX IF NOT EXISTS idx_tasks_version ON tasks(version);
CREATE INDEX IF NOT EXISTS idx_events_version ON events(version);
CREATE INDEX IF NOT EXISTS idx_exams_version ON exams(version);
CREATE INDEX IF NOT EXISTS idx_habits_version ON habits(version);
CREATE INDEX IF NOT EXISTS idx_habit_log_version ON habit_log(version);
CREATE INDEX IF NOT EXISTS idx_workouts_version ON workouts(version);
CREATE INDEX IF NOT EXISTS idx_notes_version ON notes(version);
CREATE INDEX IF NOT EXISTS idx_note_folders_version ON note_folders(version);
CREATE INDEX IF NOT EXISTS idx_files_version ON files(version);
CREATE INDEX IF NOT EXISTS idx_folders_version ON folders(version);
CREATE INDEX IF NOT EXISTS idx_shortcuts_version ON shortcuts(version);
CREATE INDEX IF NOT EXISTS idx_study_sessions_version ON study_sessions(version);
