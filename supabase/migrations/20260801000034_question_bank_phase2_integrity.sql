-- Migration: 20260801000034_question_bank_phase2_integrity.sql
-- DESCRIPTION: Phase 2 Database Integrity, Content Hashing, Deduplication, JSONB conversion and Constraints

-- ========================================================
-- Bước 1: Unwrap sạch toàn bộ các chuỗi JSON lồng nhau trong cột prompt
-- ========================================================
UPDATE public.question_bank
SET prompt = prompt::json->>'text'
WHERE prompt LIKE '%"text":"{%'
  AND (prompt::json->>'text') LIKE '{"isInteractive":%';

-- ========================================================
-- Bước 2: Đồng bộ grade_block từ bảng classes sang question_bank
-- ========================================================
UPDATE public.question_bank qb
SET grade_block = c.grade_block
FROM public.classes c
WHERE qb.class_id = c.id
  AND (qb.grade_block IS NULL OR qb.grade_block = '');

UPDATE public.question_bank
SET grade_block = CASE
    WHEN grade_level = 11 AND subject = 'HOA_HOC' THEN '11-Hóa'
    WHEN grade_level = 11 THEN '11-Toán'
    WHEN subject = 'HOA_HOC' THEN '12-Hóa'
    ELSE '12-Toán'
END
WHERE grade_block IS NULL OR grade_block = '';

-- ========================================================
-- Bước 3: Tìm & Dọn sạch dữ liệu vi phạm tính toàn vẹn câu hỏi
-- ========================================================
-- 3.1 Dọn các cột đáp án lệch dạng
UPDATE public.question_bank
SET tf_answers = NULL, sa_answer = NULL
WHERE question_type = 'MULTIPLE_CHOICE';

UPDATE public.question_bank
SET mc_answer = NULL, sa_answer = NULL
WHERE question_type = 'TRUE_FALSE';

UPDATE public.question_bank
SET mc_answer = NULL, tf_answers = NULL
WHERE question_type = 'SHORT_ANSWER';

-- 3.2 Chuẩn hóa các giá trị difficulty ngoài 4 mức chuẩn
UPDATE public.question_bank
SET difficulty = 'THONG_HIEU'
WHERE difficulty NOT IN ('NHAN_BIET', 'THONG_HIEU', 'VAN_DUNG', 'VAN_DUNG_CAO');

-- ========================================================
-- Bước 4: Tạo Hàm băm & Cột content_hash
-- ========================================================
ALTER TABLE public.question_bank
ADD COLUMN IF NOT EXISTS content_hash TEXT;

CREATE OR REPLACE FUNCTION public.fn_compute_qb_content_hash(
  p_question_type question_type,
  p_prompt jsonb
) RETURNS text LANGUAGE plpgsql IMMUTABLE AS $$
DECLARE
  v_norm_text text;
  v_options_str text := '';
  v_item jsonb;
  v_combined text;
BEGIN
  -- 1. Chuẩn hóa text đề bài (loại bỏ khoảng trắng thừa, lowercase, không băm [Lời giải] hoặc imageUrl)
  v_norm_text := regexp_replace(lower(trim(coalesce(p_prompt->>'text', ''))), '\s+', ' ', 'g');
  
  -- 2. Chuẩn hóa options/statements nếu có
  IF jsonb_typeof(p_prompt->'options') = 'array' THEN
    FOR v_item IN SELECT * FROM jsonb_array_elements(p_prompt->'options') LOOP
      v_options_str := v_options_str || '|' || coalesce(v_item->>'id', '') || ':' || regexp_replace(lower(trim(coalesce(v_item->>'text', ''))), '\s+', ' ', 'g');
    END LOOP;
  ELSIF jsonb_typeof(p_prompt->'statements') = 'array' THEN
    FOR v_item IN SELECT * FROM jsonb_array_elements(p_prompt->'statements') LOOP
      v_options_str := v_options_str || '|' || coalesce(v_item->>'id', '') || ':' || regexp_replace(lower(trim(coalesce(v_item->>'text', ''))), '\s+', ' ', 'g');
    END LOOP;
  END IF;

  -- 3. Chuỗi tổng hợp
  v_combined := p_question_type::text || ':::' || v_norm_text || ':::' || v_options_str;

  -- 4. SHA-256 Hash dưới dạng hex
  RETURN encode(sha256(convert_to(v_combined, 'UTF8')), 'hex');
END;
$$;

-- Tính toán content_hash cho toàn bộ câu hỏi hiện tại
UPDATE public.question_bank
SET content_hash = public.fn_compute_qb_content_hash(question_type, prompt::jsonb);

-- ========================================================
-- Bước 5: Xử lý trùng lặp (Deduplication trước khi đánh Unique Index)
-- ========================================================
-- Giữ lại 1 bản ghi ưu tiên nhất (usage_count cao nhất, có lesson_id, tạo sớm nhất)
DELETE FROM public.question_bank
WHERE id IN (
  SELECT id FROM (
    SELECT id,
           ROW_NUMBER() OVER (
             PARTITION BY grade_block, content_hash
             ORDER BY
               usage_count DESC,
               (CASE WHEN lesson_id IS NOT NULL THEN 1 ELSE 0 END) DESC,
               (CASE WHEN chapter_id IS NOT NULL THEN 1 ELSE 0 END) DESC,
               created_at ASC
           ) as rnk
    FROM public.question_bank
    WHERE content_hash IS NOT NULL
  ) ranked
  WHERE rnk > 1
);

-- ========================================================
-- Bước 6: Tạo Constraint, ENUM & Unique Index
-- ========================================================
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'qb_difficulty') THEN
    CREATE TYPE qb_difficulty AS ENUM ('NHAN_BIET', 'THONG_HIEU', 'VAN_DUNG', 'VAN_DUNG_CAO');
  END IF;
END $$;

ALTER TABLE public.question_bank
  ALTER COLUMN difficulty DROP DEFAULT,
  ALTER COLUMN difficulty TYPE qb_difficulty USING difficulty::qb_difficulty,
  ALTER COLUMN difficulty SET DEFAULT 'THONG_HIEU'::qb_difficulty;

ALTER TABLE public.question_bank DROP CONSTRAINT IF EXISTS chk_qb_answer_by_type;
ALTER TABLE public.question_bank ADD CONSTRAINT chk_qb_answer_by_type CHECK (
  (question_type = 'MULTIPLE_CHOICE' AND mc_answer IN ('A','B','C','D') AND tf_answers IS NULL AND sa_answer IS NULL)
  OR (question_type = 'TRUE_FALSE' AND tf_answers IS NOT NULL AND mc_answer IS NULL AND sa_answer IS NULL)
  OR (question_type = 'SHORT_ANSWER' AND sa_answer IS NOT NULL AND mc_answer IS NULL AND tf_answers IS NULL)
);

CREATE UNIQUE INDEX IF NOT EXISTS uq_qb_block_hash
  ON public.question_bank (grade_block, content_hash)
  WHERE content_hash IS NOT NULL;

-- ========================================================
-- Bước 7: Chuyển đổi cột prompt sang native JSONB
-- ========================================================
ALTER TABLE public.question_bank
  ALTER COLUMN prompt TYPE JSONB USING prompt::jsonb;

-- ========================================================
-- Phase 2.3: Triggers tự động bảo toàn toàn vẹn dữ liệu
-- ========================================================

-- Trigger 1: Tự động đồng bộ grade_block & tính content_hash khi thêm/sửa câu hỏi
CREATE OR REPLACE FUNCTION public.fn_qb_before_insert_or_update()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  -- Tự động đồng bộ grade_block từ classes nếu class_id được gán
  IF NEW.class_id IS NOT NULL THEN
    SELECT grade_block INTO NEW.grade_block
    FROM public.classes
    WHERE id = NEW.class_id;
  END IF;

  -- Tự động tính toán content_hash từ question_type và prompt
  IF NEW.prompt IS NOT NULL THEN
    NEW.content_hash := public.fn_compute_qb_content_hash(NEW.question_type, NEW.prompt);
  END IF;

  -- Chuẩn hóa các cột đáp án lệch dạng
  IF NEW.question_type = 'MULTIPLE_CHOICE' THEN
    NEW.tf_answers := NULL;
    NEW.sa_answer := NULL;
  ELSIF NEW.question_type = 'TRUE_FALSE' THEN
    NEW.mc_answer := NULL;
    NEW.sa_answer := NULL;
  ELSIF NEW.question_type = 'SHORT_ANSWER' THEN
    NEW.mc_answer := NULL;
    NEW.tf_answers := NULL;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_qb_before_insert_or_update ON public.question_bank;
CREATE TRIGGER trg_qb_before_insert_or_update
  BEFORE INSERT OR UPDATE ON public.question_bank
  FOR EACH ROW
  EXECUTE FUNCTION public.fn_qb_before_insert_or_update();

-- Trigger 2: Chặn xóa Lớp/Chương/Bài khi vẫn còn câu hỏi ngân hàng đang trỏ tới (Bảo vệ danh mục)
CREATE OR REPLACE FUNCTION public.fn_prevent_delete_referenced_category()
RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE
  v_ref_count INT;
BEGIN
  IF TG_TABLE_NAME = 'classes' THEN
    SELECT COUNT(*) INTO v_ref_count FROM public.question_bank WHERE class_id = OLD.id;
    IF v_ref_count > 0 THEN
      RAISE EXCEPTION 'Không thể xóa Lớp học này vì đang có % câu hỏi trong Ngân hàng đề liên kết. Hãy lưu trữ hoặc ẩn lớp thay vì xóa!', v_ref_count;
    END IF;
  ELSIF TG_TABLE_NAME = 'chapters' THEN
    SELECT COUNT(*) INTO v_ref_count FROM public.question_bank WHERE chapter_id = OLD.id;
    IF v_ref_count > 0 THEN
      RAISE EXCEPTION 'Không thể xóa Chương học này vì đang có % câu hỏi trong Ngân hàng đề liên kết!', v_ref_count;
    END IF;
  ELSIF TG_TABLE_NAME = 'lessons' THEN
    SELECT COUNT(*) INTO v_ref_count FROM public.question_bank WHERE lesson_id = OLD.id;
    IF v_ref_count > 0 THEN
      RAISE EXCEPTION 'Không thể xóa Bài học này vì đang có % câu hỏi trong Ngân hàng đề liên kết!', v_ref_count;
    END IF;
  END IF;

  RETURN OLD;
END;
$$;

DROP TRIGGER IF EXISTS trg_check_delete_classes_qb ON public.classes;
CREATE TRIGGER trg_check_delete_classes_qb
  BEFORE DELETE ON public.classes
  FOR EACH ROW
  EXECUTE FUNCTION public.fn_prevent_delete_referenced_category();

DROP TRIGGER IF EXISTS trg_check_delete_chapters_qb ON public.chapters;
CREATE TRIGGER trg_check_delete_chapters_qb
  BEFORE DELETE ON public.chapters
  FOR EACH ROW
  EXECUTE FUNCTION public.fn_prevent_delete_referenced_category();

DROP TRIGGER IF EXISTS trg_check_delete_lessons_qb ON public.lessons;
CREATE TRIGGER trg_check_delete_lessons_qb
  BEFORE DELETE ON public.lessons
  FOR EACH ROW
  EXECUTE FUNCTION public.fn_prevent_delete_referenced_category();
