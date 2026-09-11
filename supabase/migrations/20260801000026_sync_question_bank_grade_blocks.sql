-- Migration: 20260801000026_sync_question_bank_grade_blocks.sql
-- Sync question_bank.grade_block from associated classes and chapters

-- 1. Sync question_bank.grade_block from chapter -> class -> grade_block
UPDATE public.question_bank qb
SET grade_block = c.grade_block
FROM public.chapters ch
JOIN public.classes c ON ch.class_id = c.id
WHERE qb.chapter_id = ch.id
  AND c.grade_block IS NOT NULL
  AND c.grade_block != '';

-- 2. Sync question_bank.grade_block with class_id if chapter was not set
UPDATE public.question_bank qb
SET grade_block = c.grade_block
FROM public.classes c
WHERE qb.class_id = c.id
  AND c.grade_block IS NOT NULL
  AND c.grade_block != '';

-- 3. Trigger to keep grade_block in sync when questions are inserted or updated
CREATE OR REPLACE FUNCTION public.trg_sync_qb_grade_block()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.grade_block IS NULL OR NEW.grade_block = '' OR NEW.grade_block = '12-Toán' THEN
    IF NEW.chapter_id IS NOT NULL THEN
      SELECT c.grade_block INTO NEW.grade_block
      FROM public.chapters ch
      JOIN public.classes c ON ch.class_id = c.id
      WHERE ch.id = NEW.chapter_id;
    ELSIF NEW.class_id IS NOT NULL THEN
      SELECT c.grade_block INTO NEW.grade_block
      FROM public.classes c
      WHERE c.id = NEW.class_id;
    END IF;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_auto_sync_qb_grade_block ON public.question_bank;
CREATE TRIGGER trg_auto_sync_qb_grade_block
  BEFORE INSERT OR UPDATE OF chapter_id, class_id
  ON public.question_bank
  FOR EACH ROW
  EXECUTE FUNCTION public.trg_sync_qb_grade_block();
