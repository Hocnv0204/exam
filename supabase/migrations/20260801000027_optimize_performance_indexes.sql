-- =========================================================
-- MIGRATION: 20260801000027_optimize_performance_indexes.sql
-- DESCRIPTION: Add composite and performance indexes to eliminate N+1 latency,
-- speed up class/student filtering, and optimize submission lookups.
-- =========================================================

-- 1. Index on student_classes for fast enrollment & class membership lookups
CREATE INDEX IF NOT EXISTS idx_student_classes_composite ON public.student_classes(student_id, class_id);
CREATE INDEX IF NOT EXISTS idx_student_classes_class_id ON public.student_classes(class_id);

-- 2. Index on class_sessions and student_sessions for fast monthly tuition & session lookups
CREATE INDEX IF NOT EXISTS idx_class_sessions_class_date ON public.class_sessions(class_id, session_date);
CREATE INDEX IF NOT EXISTS idx_student_sessions_composite ON public.student_sessions(student_id, class_id, session_date);

-- 3. Index on submission_answers for fast wrong question analysis & regrading
CREATE INDEX IF NOT EXISTS idx_submission_answers_sub_correct ON public.submission_answers(submission_id, is_correct);
CREATE INDEX IF NOT EXISTS idx_submission_answers_question_id ON public.submission_answers(question_id);

-- 4. Composite index on submissions for status, homework and student filtering
CREATE INDEX IF NOT EXISTS idx_submissions_hw_status ON public.submissions(homework_id, status);
CREATE INDEX IF NOT EXISTS idx_submissions_student_status ON public.submissions(student_id, status);
CREATE INDEX IF NOT EXISTS idx_submissions_submitted_at ON public.submissions(submitted_at DESC);
CREATE INDEX IF NOT EXISTS idx_submissions_guest_phone ON public.submissions(guest_phone);
