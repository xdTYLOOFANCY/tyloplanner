-- Timers are now the server-side source of truth (so a timer started on one
-- device continues on another / survives a restart), not just a push-delivery
-- row. Track per-timer whether the phone push was opted in, so the scheduler
-- only pushes the ones that asked for it.
ALTER TABLE timers ADD COLUMN push INTEGER DEFAULT 0;
