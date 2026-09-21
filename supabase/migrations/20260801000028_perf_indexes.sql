-- =========================================================
-- MIGRATION: 20260801000028_perf_indexes.sql
-- DESCRIPTION: Add performance indexes for hot-path queries (P0/P1)
-- =========================================================

-- 1. question-bank: Fast scope lookup by lesson and chapter
CREATE INDEX IF NOT EXISTS idx_qb_lesson_id ON public.question_bank(lesson_id);
CREATE INDEX IF NOT EXISTS idx_qb_chapter_id ON public.question_bank(chapter_id);

-- 2. Questions: Fast mapping from question_number to id per homework
CREATE INDEX IF NOT EXISTS idx_questions_hw_num ON public.questions(homework_id, question_number);

-- 3. exam_logs: Fast count of student violations per homework session
CREATE INDEX IF NOT EXISTS idx_exam_logs_hw_stu_created ON public.exam_logs(homework_id, student_id, created_at DESC);

-- 4. profiles: Fast student count and partial index
CREATE INDEX IF NOT EXISTS idx_profiles_role_stu ON public.profiles(role) WHERE role = 'STUDENT';

-- 5. profiles: Case-insensitive unique username lookup for login
CREATE UNIQUE INDEX IF NOT EXISTS idx_profiles_username_lower ON public.profiles(LOWER(username));

-- 6. homeworks: Fast chronological listing
CREATE INDEX IF NOT EXISTS idx_homeworks_created ON public.homeworks(created_at DESC);

-- 7. submissions: Fast lookup by homework + student + submission time
CREATE INDEX IF NOT EXISTS idx_submissions_hw_stu_submitted ON public.submissions(homework_id, student_id, submitted_at DESC);
