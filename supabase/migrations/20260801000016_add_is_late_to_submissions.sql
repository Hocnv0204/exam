-- Migration: Add is_late column to submissions table
ALTER TABLE public.submissions ADD COLUMN IF NOT EXISTS is_late BOOLEAN NOT NULL DEFAULT FALSE;
