-- Migration: Add show_solutions column to homeworks
-- If true (default), students can view correct answers & detailed explanations after submitting.
-- If false, students only see correct/incorrect status without the answer key or explanation.

ALTER TABLE public.homeworks ADD COLUMN IF NOT EXISTS show_solutions BOOLEAN NOT NULL DEFAULT true;
