-- Migration: Create student_sessions table for individual student schedules
CREATE TABLE IF NOT EXISTS public.student_sessions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    student_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
    class_id UUID NOT NULL REFERENCES public.classes(id) ON DELETE CASCADE,
    session_date DATE NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE(student_id, class_id, session_date)
);


-- Grant privileges to authenticated and service_role
GRANT ALL ON TABLE public.student_sessions TO service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.student_sessions TO authenticated;
