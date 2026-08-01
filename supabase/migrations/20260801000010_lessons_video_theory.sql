-- Migration: Add video_url and theory_files columns to public.lessons table
ALTER TABLE public.lessons ADD COLUMN IF NOT EXISTS video_url TEXT;
ALTER TABLE public.lessons ADD COLUMN IF NOT EXISTS theory_files TEXT[] DEFAULT '{}';
