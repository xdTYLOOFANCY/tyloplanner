-- Migration 016: flexible grading types for exams.
--
-- grading_type: 'dutch' (1-10), 'percentage' (0-100), 'letter' (A-F), 'pass_fail'
-- grade_text: stores letter grades (A+, B-, etc.) and pass/fail results ('pass', 'fail')
-- Numeric grade column is reused for dutch and percentage types.
-- Additive columns; safe on upgraded DBs.

ALTER TABLE exams ADD COLUMN grading_type TEXT DEFAULT 'dutch';
ALTER TABLE exams ADD COLUMN grade_text TEXT;
