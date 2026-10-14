-- Migration: Exam reopen as new attempt (keep old history)
-- Adds attempt_no to exam_sessions and submissions so that:
-- - reopen for EXAM creates a NEW active session (new attempt) instead of
--   archiving old submissions, keeping old exam history visible;
-- - submit-homework grants +1 allowance per admin-granted attempt.

ALTER TABLE public.exam_sessions ADD COLUMN IF NOT EXISTS attempt_no INT NOT NULL DEFAULT 1;
ALTER TABLE public.submissions ADD COLUMN IF NOT EXISTS attempt_no INT NOT NULL DEFAULT 1;

CREATE INDEX IF NOT EXISTS idx_exam_sessions_attempt_no ON public.exam_sessions(homework_id, student_id, attempt_no);
CREATE INDEX IF NOT EXISTS idx_submissions_attempt_no ON public.submissions(homework_id, student_id, attempt_no);
