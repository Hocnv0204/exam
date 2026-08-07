-- Migration: Add tuition_fee to classes and create class_sessions table
ALTER TABLE public.classes ADD COLUMN IF NOT EXISTS tuition_fee NUMERIC(12,2) DEFAULT 0;


CREATE TABLE IF NOT EXISTS public.class_sessions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    class_id UUID NOT NULL REFERENCES public.classes(id) ON DELETE CASCADE,
    session_date DATE NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE(class_id, session_date)
);


-- Grant privileges to authenticated and service_role
GRANT ALL ON TABLE public.class_sessions TO service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.class_sessions TO authenticated;
