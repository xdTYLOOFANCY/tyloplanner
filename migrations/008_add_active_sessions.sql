CREATE TABLE IF NOT EXISTS user_sessions(
  id TEXT PRIMARY KEY,
  user_agent TEXT,
  ip_address TEXT,
  active_at INTEGER NOT NULL
);
