-- =========================================================
-- MIGRATION: 20260801000005_add_duration_seconds_taken.sql
-- DESCRIPTION: Add duration_seconds_taken to submissions table.
-- =========================================================

ALTER TABLE public.submissions ADD COLUMN duration_seconds_taken INT DEFAULT 0;
