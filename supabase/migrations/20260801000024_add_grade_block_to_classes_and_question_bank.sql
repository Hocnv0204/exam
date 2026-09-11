-- Migration: 20260801000024_add_grade_block_to_classes_and_question_bank.sql
-- DESCRIPTION: Add flexible grade_block (Khối học) to classes and question_bank.
-- Users can freely type/select any grade block (e.g. '11-Hóa', '11-Toán', '12-Hóa', '12-Toán', or custom blocks).

-- 1. Add grade_block to classes
ALTER TABLE public.classes
ADD COLUMN IF NOT EXISTS grade_block TEXT NOT NULL DEFAULT '12-Toán';

-- 2. Add grade_block to question_bank
ALTER TABLE public.question_bank
ADD COLUMN IF NOT EXISTS grade_block TEXT;

-- 3. Backfill question_bank.grade_block from classes if class_id is set
UPDATE public.question_bank qb
SET grade_block = c.grade_block
FROM public.classes c
WHERE qb.class_id = c.id
AND qb.grade_block IS NULL;

-- 4. Fallback backfill for existing questions without class_id
UPDATE public.question_bank
SET grade_block = CASE
    WHEN grade_level = 11 AND subject = 'HOA_HOC' THEN '11-Hóa'
    WHEN grade_level = 11 THEN '11-Toán'
    WHEN subject = 'HOA_HOC' THEN '12-Hóa'
    ELSE '12-Toán'
END
WHERE grade_block IS NULL;

-- 5. Indexes for fast filtering and pagination
CREATE INDEX IF NOT EXISTS idx_classes_grade_block ON public.classes(grade_block);
CREATE INDEX IF NOT EXISTS idx_qb_grade_block ON public.question_bank(grade_block);
