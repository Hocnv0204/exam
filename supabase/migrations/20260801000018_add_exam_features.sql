-- Migration: Add Exam Room Features
-- Adds assignment_type and type column to homeworks
-- Adds exam_logs table to track cheating attempts

DO $$ BEGIN
    CREATE TYPE assignment_type AS ENUM ('PRACTICE', 'EXAM');
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;

ALTER TABLE public.homeworks ADD COLUMN IF NOT EXISTS type assignment_type NOT NULL DEFAULT 'PRACTICE';

-- Create exam_logs table
CREATE TABLE IF NOT EXISTS public.exam_logs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    homework_id UUID NOT NULL REFERENCES public.homeworks(id) ON DELETE CASCADE,
    student_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
    action TEXT NOT NULL, -- e.g., 'LEAVE_TAB', 'RETURN_TAB', 'COPY', 'PASTE'
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Index for performance
CREATE INDEX IF NOT EXISTS idx_exam_logs_homework_id ON public.exam_logs(homework_id);
CREATE INDEX IF NOT EXISTS idx_exam_logs_student_id ON public.exam_logs(student_id);

-- Enable RLS
ALTER TABLE public.exam_logs ENABLE ROW LEVEL SECURITY;

-- Service role bypass
CREATE POLICY "Service role bypass exam_logs" ON public.exam_logs
    FOR ALL TO service_role USING (true) WITH CHECK (true);

-- Admin read all exam logs
CREATE POLICY "Admin full access exam_logs" ON public.exam_logs
    FOR ALL TO authenticated USING (public.is_admin()) WITH CHECK (public.is_admin());

-- Student insert own exam logs
CREATE POLICY "Student insert own exam logs" ON public.exam_logs
    FOR INSERT TO authenticated WITH CHECK (student_id = auth.uid());

-- Student read own exam logs
CREATE POLICY "Student select own exam logs" ON public.exam_logs
    FOR SELECT TO authenticated USING (student_id = auth.uid());
