-- Migration: Add deadline and max_attempts to homeworks table
ALTER TABLE public.homeworks ADD COLUMN IF NOT EXISTS deadline TIMESTAMPTZ;
ALTER TABLE public.homeworks ADD COLUMN IF NOT EXISTS max_attempts INT;
