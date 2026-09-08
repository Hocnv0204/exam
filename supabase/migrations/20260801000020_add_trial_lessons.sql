-- Migration: Add Trial Lessons & Guest Submissions Support
ALTER TABLE public.lessons
ADD COLUMN IF NOT EXISTS is_trial BOOLEAN NOT NULL DEFAULT FALSE;

-- Allow student_id to be NULL for guest/trial submissions
ALTER TABLE public.submissions
ALTER COLUMN student_id DROP NOT NULL;

-- Add trial and guest metadata to submissions
ALTER TABLE public.submissions
ADD COLUMN IF NOT EXISTS is_trial BOOLEAN NOT NULL DEFAULT FALSE,
ADD COLUMN IF NOT EXISTS guest_name TEXT,
ADD COLUMN IF NOT EXISTS guest_phone TEXT;

-- Create index for quick trial lessons query
CREATE INDEX IF NOT EXISTS idx_lessons_is_trial ON public.lessons(is_trial);
