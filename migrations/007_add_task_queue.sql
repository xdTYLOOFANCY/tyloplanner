CREATE TABLE queued_tasks (
    id TEXT PRIMARY KEY,
    task_type TEXT NOT NULL,
    payload TEXT, -- JSON payload
    status TEXT NOT NULL DEFAULT 'pending', -- pending, running, completed, failed
    attempts INTEGER NOT NULL DEFAULT 0,
    max_attempts INTEGER NOT NULL DEFAULT 3,
    created_at INTEGER NOT NULL,
    scheduled_at INTEGER NOT NULL,
    started_at INTEGER,
    finished_at INTEGER,
    error_message TEXT,
    result TEXT -- JSON result
);

CREATE INDEX idx_queued_tasks_status_scheduled ON queued_tasks(status, scheduled_at);
