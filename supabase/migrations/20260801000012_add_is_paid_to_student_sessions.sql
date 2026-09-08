-- Migration: Add is_paid column to student_sessions table
ALTER TABLE public.student_sessions 
ADD COLUMN IF NOT EXISTS is_paid BOOLEAN NOT NULL DEFAULT FALSE;
