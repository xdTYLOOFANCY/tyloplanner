-- The DB-backed background task queue was replaced by direct execution on the
-- scheduler's thread pool (scheduler.py submit_job). Drop its table.
DROP TABLE IF EXISTS queued_tasks;
