-- =========================================================
-- MIGRATION: 20260801000004_alter_sa_answer_text.sql
-- DESCRIPTION: Change type of sa_answer in question_answers to TEXT.
-- =========================================================

ALTER TABLE public.question_answers ALTER COLUMN sa_answer TYPE TEXT;
