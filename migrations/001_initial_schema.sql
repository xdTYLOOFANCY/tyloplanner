CREATE TABLE IF NOT EXISTS events(
  id TEXT PRIMARY KEY, "date" TEXT, "start" TEXT, "end" TEXT,
  title TEXT, type TEXT DEFAULT 'other', source TEXT DEFAULT 'local',
  reminder_offset INTEGER DEFAULT -1);
CREATE TABLE IF NOT EXISTS exams(
  id TEXT PRIMARY KEY, name TEXT, "date" TEXT, grade REAL, ects REAL);
CREATE TABLE IF NOT EXISTS habits(
  id TEXT PRIMARY KEY, name TEXT, created TEXT);
CREATE TABLE IF NOT EXISTS habit_log(
  habit_id TEXT, "date" TEXT, PRIMARY KEY(habit_id, "date"));
CREATE TABLE IF NOT EXISTS workouts(
  id TEXT PRIMARY KEY, type TEXT, "date" TEXT, dur REAL, dist REAL,
  note TEXT, source TEXT DEFAULT 'manual', ext_id TEXT);
CREATE TABLE IF NOT EXISTS tasks(
  id TEXT PRIMARY KEY, name TEXT, done INTEGER DEFAULT 0,
  created TEXT, completed_at TEXT);
CREATE TABLE IF NOT EXISTS notes(
  id TEXT PRIMARY KEY, title TEXT, body TEXT, updated INTEGER);
CREATE TABLE IF NOT EXISTS note_folders(
  id TEXT PRIMARY KEY, name TEXT, parent_id TEXT, icon TEXT);
CREATE TABLE IF NOT EXISTS files(
  id TEXT PRIMARY KEY, filename TEXT, size INTEGER, mimetype TEXT, uploaded INTEGER);
CREATE TABLE IF NOT EXISTS folders(
  id TEXT PRIMARY KEY, name TEXT, parent_id TEXT);
CREATE TABLE IF NOT EXISTS shortcuts(
  id TEXT PRIMARY KEY, name TEXT, url TEXT, icon TEXT);
CREATE TABLE IF NOT EXISTS study_sessions(
  id TEXT PRIMARY KEY, subject TEXT, "date" TEXT, duration REAL, completed INTEGER);
CREATE TABLE IF NOT EXISTS kv(key TEXT PRIMARY KEY, value TEXT);
CREATE TABLE IF NOT EXISTS push_subscriptions(id TEXT PRIMARY KEY, subscription_json TEXT, created_at INTEGER);
