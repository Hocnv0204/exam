-- Migration: Add exam_sessions table and alter homeworks/submissions

-- 1. Create exam_sessions table
CREATE TABLE IF NOT EXISTS public.exam_sessions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    homework_id UUID NOT NULL REFERENCES public.homeworks(id) ON DELETE CASCADE,
    student_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    session_token VARCHAR(255) NOT NULL,
    status VARCHAR(50) NOT NULL DEFAULT 'ACTIVE', -- 'ACTIVE', 'SUBMITTED', 'ARCHIVED', 'ORPHANED'
    last_heartbeat_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    draft_answers JSONB DEFAULT '{}'::jsonb,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Unique index to prevent multi-sessions per homework per student (only for ACTIVE status)
CREATE UNIQUE INDEX IF NOT EXISTS idx_exam_sessions_active_unique
ON public.exam_sessions(homework_id, student_id)
WHERE status = 'ACTIVE';

CREATE INDEX IF NOT EXISTS idx_exam_sessions_homework_id ON public.exam_sessions(homework_id);
CREATE INDEX IF NOT EXISTS idx_exam_sessions_student_id ON public.exam_sessions(student_id);

ALTER TABLE public.exam_sessions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admin full access exam_sessions" ON public.exam_sessions
    FOR ALL USING (
        EXISTS (
            SELECT 1 FROM public.profiles
            WHERE profiles.id = auth.uid() AND profiles.role = 'ADMIN'
        )
    );

CREATE POLICY "Student read own exam_sessions" ON public.exam_sessions
    FOR SELECT USING (student_id = auth.uid());

CREATE POLICY "Service role bypass exam_sessions" ON public.exam_sessions
    FOR ALL USING (true);

-- 2. Add max_violations to homeworks
ALTER TABLE public.homeworks ADD COLUMN IF NOT EXISTS max_violations INT NOT NULL DEFAULT 3;

-- 3. Add status to submissions for soft delete
ALTER TABLE public.submissions ADD COLUMN IF NOT EXISTS status VARCHAR(50) NOT NULL DEFAULT 'SUBMITTED';
