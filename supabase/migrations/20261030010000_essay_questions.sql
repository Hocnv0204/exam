-- Add text-based essay questions and manual grading metadata.
ALTER TYPE public.question_type ADD VALUE IF NOT EXISTS 'ESSAY';
