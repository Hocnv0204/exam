-- Migration: Add Interactive Question Fields & Support Native Question Rendering
-- 1. Add interactive question fields to public.questions
ALTER TABLE public.questions
ADD COLUMN IF NOT EXISTS content TEXT,
ADD COLUMN IF NOT EXISTS options JSONB,
ADD COLUMN IF NOT EXISTS statements JSONB,
ADD COLUMN IF NOT EXISTS part_title TEXT;

-- 2. Add explanation field to public.question_answers (secured by RLS)
ALTER TABLE public.question_answers
ADD COLUMN IF NOT EXISTS explanation TEXT;

-- 3. Make pdf_path optional on homeworks so homeworks can be 100% native LaTeX/interactive questions
ALTER TABLE public.homeworks
ALTER COLUMN pdf_path DROP NOT NULL;
