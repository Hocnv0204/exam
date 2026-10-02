-- ========================================================
-- Migration: 20260801000036_add_source_homework_id.sql
-- Description: Add source_homework_id column and index to public.homeworks
--              to support multi-class assignment (assign/clone homework to other classes)
-- ========================================================

ALTER TABLE public.homeworks
  ADD COLUMN IF NOT EXISTS source_homework_id UUID REFERENCES public.homeworks(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_homeworks_source_hw_id 
  ON public.homeworks(source_homework_id) 
  WHERE source_homework_id IS NOT NULL;
