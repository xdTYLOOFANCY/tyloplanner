-- Migration 019: exam trackers, custom tags, explicit academic year.
-- academic_year: start year of the academic year ("2025" = 2025-2026),
--   overrides the date-derived guess in analytics.
-- tags: comma-separated custom tag names (tag list itself lives in kv set_exam_tags).
-- tracker_id: which study/tracker the exam belongs to (trackers live in kv set_exam_trackers).
ALTER TABLE exams ADD COLUMN academic_year TEXT;
ALTER TABLE exams ADD COLUMN tags TEXT;
ALTER TABLE exams ADD COLUMN tracker_id TEXT;
