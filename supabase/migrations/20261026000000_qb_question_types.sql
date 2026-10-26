-- Migration: 20261026000000_qb_question_types.sql
-- DESCRIPTION: Cấp 5 của taxonomy constant cho Question Bank: Dạng bài (qb_question_types)
--              thuộc Bài học constant. Kèm theo: cột question_bank.qb_question_type_id để
--              phân loại câu hỏi theo dạng bài, unique tự nhiên cho các cấp 2-4, và mở rộng
--              delete-guard + trigger suy diễn phân cấp.
--
-- LƯU Ý CHO PRIMARY (review trước khi `npx supabase db push`):
--   * Các CREATE UNIQUE INDEX cho qb_classes/qb_chapters/qb_lessons sẽ FAIL nếu production
--     đã có bản ghi trùng khóa tự nhiên (cùng khối+tên lớp, cùng lớp+tiêu đề chương,
--     cùng chương+tiêu đề bài). Nếu push báo lỗi unique, hãy dedupe các bản ghi đó trước
--     rồi push lại. Bảng qb_question_types mới và cột qb_question_type_id thì an toàn.
--   * Không đổi dữ liệu sẵn có, không xóa/đổi tên constant nào của người dùng.

-- ========================================================
-- Bước 1: Bảng Dạng bài constant (cấp 5, thuộc Bài học)
-- ========================================================
CREATE TABLE IF NOT EXISTS public.qb_question_types (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  lesson_id UUID NOT NULL REFERENCES public.qb_lessons(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  description TEXT,
  order_index INT NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_qb_question_types_lesson_id ON public.qb_question_types(lesson_id);
CREATE INDEX IF NOT EXISTS idx_qb_question_types_order ON public.qb_question_types(order_index);
-- Unique tự nhiên trong phạm vi bài học: không có 2 dạng bài cùng tên trong 1 bài.
CREATE UNIQUE INDEX IF NOT EXISTS uq_qb_question_types_lesson_name
  ON public.qb_question_types(lesson_id, name);

-- ========================================================
-- Bước 2: Unique tự nhiên cho các cấp đã có (phục vụ seed idempotent)
-- ========================================================
CREATE UNIQUE INDEX IF NOT EXISTS uq_qb_classes_grade_block_name
  ON public.qb_classes(grade_block, name);
CREATE UNIQUE INDEX IF NOT EXISTS uq_qb_chapters_class_title
  ON public.qb_chapters(class_id, title);
CREATE UNIQUE INDEX IF NOT EXISTS uq_qb_lessons_chapter_title
  ON public.qb_lessons(chapter_id, title);

-- ========================================================
-- Bước 3: Cột phân loại câu hỏi theo dạng bài
-- ========================================================
ALTER TABLE public.question_bank
  ADD COLUMN IF NOT EXISTS qb_question_type_id UUID
    REFERENCES public.qb_question_types(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_question_bank_qb_question_type_id
  ON public.question_bank(qb_question_type_id);

-- ========================================================
-- Bước 4: RLS cho qb_question_types (mirror các bảng qb_* khác)
-- ========================================================
ALTER TABLE public.qb_question_types ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Service role full access qb_question_types" ON public.qb_question_types;
CREATE POLICY "Service role full access qb_question_types" ON public.qb_question_types FOR ALL TO service_role USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "Authenticated users view qb_question_types" ON public.qb_question_types;
CREATE POLICY "Authenticated users view qb_question_types" ON public.qb_question_types FOR SELECT TO authenticated USING (true);

DROP POLICY IF EXISTS "Admin insert qb_question_types" ON public.qb_question_types;
CREATE POLICY "Admin insert qb_question_types" ON public.qb_question_types FOR INSERT TO authenticated
  WITH CHECK (EXISTS (SELECT 1 FROM public.profiles WHERE profiles.id = auth.uid() AND profiles.role = 'ADMIN'));

DROP POLICY IF EXISTS "Admin update qb_question_types" ON public.qb_question_types;
CREATE POLICY "Admin update qb_question_types" ON public.qb_question_types FOR UPDATE TO authenticated
  USING (EXISTS (SELECT 1 FROM public.profiles WHERE profiles.id = auth.uid() AND profiles.role = 'ADMIN'));

DROP POLICY IF EXISTS "Admin delete qb_question_types" ON public.qb_question_types;
CREATE POLICY "Admin delete qb_question_types" ON public.qb_question_types FOR DELETE TO authenticated
  USING (EXISTS (SELECT 1 FROM public.profiles WHERE profiles.id = auth.uid() AND profiles.role = 'ADMIN'));

-- ========================================================
-- Bước 5: Mở rộng delete-guard cho cấp Dạng bài
-- ========================================================
CREATE OR REPLACE FUNCTION public.fn_prevent_delete_referenced_qb_constant_category()
RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE
  v_ref_count INT;
BEGIN
  IF TG_TABLE_NAME = 'qb_classes' THEN
    SELECT COUNT(*) INTO v_ref_count FROM public.question_bank WHERE qb_class_id = OLD.id;
    IF v_ref_count > 0 THEN
      RAISE EXCEPTION 'Không thể xóa Lớp học constant này vì đang có % câu hỏi trong Ngân hàng đề liên kết!', v_ref_count;
    END IF;
  ELSIF TG_TABLE_NAME = 'qb_chapters' THEN
    SELECT COUNT(*) INTO v_ref_count FROM public.question_bank WHERE qb_chapter_id = OLD.id;
    IF v_ref_count > 0 THEN
      RAISE EXCEPTION 'Không thể xóa Chương học constant này vì đang có % câu hỏi trong Ngân hàng đề liên kết!', v_ref_count;
    END IF;
  ELSIF TG_TABLE_NAME = 'qb_lessons' THEN
    SELECT COUNT(*) INTO v_ref_count FROM public.question_bank WHERE qb_lesson_id = OLD.id;
    IF v_ref_count > 0 THEN
      RAISE EXCEPTION 'Không thể xóa Bài học constant này vì đang có % câu hỏi trong Ngân hàng đề liên kết!', v_ref_count;
    END IF;
  ELSIF TG_TABLE_NAME = 'qb_question_types' THEN
    SELECT COUNT(*) INTO v_ref_count FROM public.question_bank WHERE qb_question_type_id = OLD.id;
    IF v_ref_count > 0 THEN
      RAISE EXCEPTION 'Không thể xóa Dạng bài constant này vì đang có % câu hỏi trong Ngân hàng đề liên kết!', v_ref_count;
    END IF;
  END IF;

  RETURN OLD;
END;
$$;

DROP TRIGGER IF EXISTS trg_check_delete_qb_question_types ON public.qb_question_types;
CREATE TRIGGER trg_check_delete_qb_question_types
  BEFORE DELETE ON public.qb_question_types
  FOR EACH ROW
  EXECUTE FUNCTION public.fn_prevent_delete_referenced_qb_constant_category();

-- ========================================================
-- Bước 6: Suy diễn phân cấp từ dạng bài khi câu hỏi chỉ gắn dạng bài
-- (giữ nguyên toàn bộ logic cũ, thêm nhánh đầu tiên)
-- ========================================================
CREATE OR REPLACE FUNCTION public.fn_qb_before_insert_or_update()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  -- 0. Suy diễn từ dạng bài: dạng bài -> bài -> chương -> lớp -> khối
  IF NEW.qb_question_type_id IS NOT NULL AND NEW.qb_lesson_id IS NULL THEN
    SELECT l.id, ch.id, ch.class_id, c.grade_block
    INTO NEW.qb_lesson_id, NEW.qb_chapter_id, NEW.qb_class_id, NEW.grade_block
    FROM public.qb_question_types t
    JOIN public.qb_lessons l ON t.lesson_id = l.id
    JOIN public.qb_chapters ch ON l.chapter_id = ch.id
    JOIN public.qb_classes c ON ch.class_id = c.id
    WHERE t.id = NEW.qb_question_type_id;
  ELSIF NEW.qb_question_type_id IS NOT NULL THEN
    -- Nếu caller gửi đồng thời cả dạng bài và bài học, bắt buộc chúng cùng
    -- thuộc một bài học. Không để câu hỏi mang taxonomy cha-con mâu thuẫn.
    IF NOT EXISTS (
      SELECT 1
      FROM public.qb_question_types t
      WHERE t.id = NEW.qb_question_type_id
        AND t.lesson_id = NEW.qb_lesson_id
    ) THEN
      RAISE EXCEPTION 'Dạng bài constant không thuộc Bài học constant đã chọn';
    END IF;
  END IF;

  -- 1. Đồng bộ grade_block & phân cấp nếu gắn bài học constant
  IF NEW.qb_lesson_id IS NOT NULL THEN
    SELECT ch.class_id, ch.id, c.grade_block
    INTO NEW.qb_class_id, NEW.qb_chapter_id, NEW.grade_block
    FROM public.qb_lessons l
    JOIN public.qb_chapters ch ON l.chapter_id = ch.id
    JOIN public.qb_classes c ON ch.class_id = c.id
    WHERE l.id = NEW.qb_lesson_id;
  ELSIF NEW.qb_chapter_id IS NOT NULL AND NEW.qb_class_id IS NULL THEN
    SELECT ch.class_id, c.grade_block
    INTO NEW.qb_class_id, NEW.grade_block
    FROM public.qb_chapters ch
    JOIN public.qb_classes c ON ch.class_id = c.id
    WHERE ch.id = NEW.qb_chapter_id;
  ELSIF NEW.qb_class_id IS NOT NULL AND (NEW.grade_block IS NULL OR NEW.grade_block = '') THEN
    SELECT grade_block INTO NEW.grade_block
    FROM public.qb_classes
    WHERE id = NEW.qb_class_id;
  -- 2. Đồng bộ grade_block từ classes động nếu class_id được gán và chưa có constant class
  ELSIF NEW.class_id IS NOT NULL AND (NEW.grade_block IS NULL OR NEW.grade_block = '') THEN
    SELECT grade_block INTO NEW.grade_block
    FROM public.classes
    WHERE id = NEW.class_id;
  END IF;

  -- 3. Tự động tính toán content_hash từ question_type và prompt
  IF NEW.prompt IS NOT NULL THEN
    NEW.content_hash := public.fn_compute_qb_content_hash(NEW.question_type, NEW.prompt);
  END IF;

  -- 4. Chuẩn hóa các cột đáp án lệch dạng
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
