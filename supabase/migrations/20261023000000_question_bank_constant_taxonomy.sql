-- Migration: 20261023000000_question_bank_constant_taxonomy.sql
-- DESCRIPTION: Constant taxonomy for Question Bank module (Khối, Lớp, Chương, Bài)
--              independent from dynamic curriculum, supporting question duplication,
--              atomic synchronization, and deduplication scoping.

-- ========================================================
-- Bước 1: Tạo các bảng danh mục Constant cho Question Bank
-- ========================================================

-- 1.1 Khối học Constant
CREATE TABLE IF NOT EXISTS public.qb_grade_blocks (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT UNIQUE NOT NULL,
  description TEXT,
  order_index INT NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_qb_grade_blocks_name ON public.qb_grade_blocks(name);
CREATE INDEX IF NOT EXISTS idx_qb_grade_blocks_order ON public.qb_grade_blocks(order_index);

-- 1.2 Lớp học Constant
CREATE TABLE IF NOT EXISTS public.qb_classes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  grade_block_id UUID REFERENCES public.qb_grade_blocks(id) ON DELETE SET NULL,
  grade_block TEXT NOT NULL,
  name TEXT NOT NULL,
  description TEXT,
  order_index INT NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_qb_classes_grade_block ON public.qb_classes(grade_block);
CREATE INDEX IF NOT EXISTS idx_qb_classes_order ON public.qb_classes(order_index);

-- 1.3 Chương học Constant
CREATE TABLE IF NOT EXISTS public.qb_chapters (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  class_id UUID NOT NULL REFERENCES public.qb_classes(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  description TEXT,
  order_index INT NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_qb_chapters_class_id ON public.qb_chapters(class_id);
CREATE INDEX IF NOT EXISTS idx_qb_chapters_order ON public.qb_chapters(order_index);

-- 1.4 Bài học Constant
CREATE TABLE IF NOT EXISTS public.qb_lessons (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  chapter_id UUID NOT NULL REFERENCES public.qb_chapters(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  description TEXT,
  order_index INT NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_qb_lessons_chapter_id ON public.qb_lessons(chapter_id);
CREATE INDEX IF NOT EXISTS idx_qb_lessons_order ON public.qb_lessons(order_index);

-- ========================================================
-- Bước 2: Thiết lập RLS cho các bảng danh mục Constant
-- ========================================================
ALTER TABLE public.qb_grade_blocks ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.qb_classes ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.qb_chapters ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.qb_lessons ENABLE ROW LEVEL SECURITY;

-- 2.1 Service role full access
DROP POLICY IF EXISTS "Service role full access qb_grade_blocks" ON public.qb_grade_blocks;
CREATE POLICY "Service role full access qb_grade_blocks" ON public.qb_grade_blocks FOR ALL TO service_role USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "Service role full access qb_classes" ON public.qb_classes;
CREATE POLICY "Service role full access qb_classes" ON public.qb_classes FOR ALL TO service_role USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "Service role full access qb_chapters" ON public.qb_chapters;
CREATE POLICY "Service role full access qb_chapters" ON public.qb_chapters FOR ALL TO service_role USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "Service role full access qb_lessons" ON public.qb_lessons;
CREATE POLICY "Service role full access qb_lessons" ON public.qb_lessons FOR ALL TO service_role USING (true) WITH CHECK (true);

-- 2.2 Authenticated read access
DROP POLICY IF EXISTS "Authenticated users view qb_grade_blocks" ON public.qb_grade_blocks;
CREATE POLICY "Authenticated users view qb_grade_blocks" ON public.qb_grade_blocks FOR SELECT TO authenticated USING (true);

DROP POLICY IF EXISTS "Authenticated users view qb_classes" ON public.qb_classes;
CREATE POLICY "Authenticated users view qb_classes" ON public.qb_classes FOR SELECT TO authenticated USING (true);

DROP POLICY IF EXISTS "Authenticated users view qb_chapters" ON public.qb_chapters;
CREATE POLICY "Authenticated users view qb_chapters" ON public.qb_chapters FOR SELECT TO authenticated USING (true);

DROP POLICY IF EXISTS "Authenticated users view qb_lessons" ON public.qb_lessons;
CREATE POLICY "Authenticated users view qb_lessons" ON public.qb_lessons FOR SELECT TO authenticated USING (true);

-- 2.3 Admin write access
DROP POLICY IF EXISTS "Admin insert qb_grade_blocks" ON public.qb_grade_blocks;
CREATE POLICY "Admin insert qb_grade_blocks" ON public.qb_grade_blocks FOR INSERT TO authenticated
  WITH CHECK (EXISTS (SELECT 1 FROM public.profiles WHERE profiles.id = auth.uid() AND profiles.role = 'ADMIN'));

DROP POLICY IF EXISTS "Admin update qb_grade_blocks" ON public.qb_grade_blocks;
CREATE POLICY "Admin update qb_grade_blocks" ON public.qb_grade_blocks FOR UPDATE TO authenticated
  USING (EXISTS (SELECT 1 FROM public.profiles WHERE profiles.id = auth.uid() AND profiles.role = 'ADMIN'));

DROP POLICY IF EXISTS "Admin delete qb_grade_blocks" ON public.qb_grade_blocks;
CREATE POLICY "Admin delete qb_grade_blocks" ON public.qb_grade_blocks FOR DELETE TO authenticated
  USING (EXISTS (SELECT 1 FROM public.profiles WHERE profiles.id = auth.uid() AND profiles.role = 'ADMIN'));

DROP POLICY IF EXISTS "Admin insert qb_classes" ON public.qb_classes;
CREATE POLICY "Admin insert qb_classes" ON public.qb_classes FOR INSERT TO authenticated
  WITH CHECK (EXISTS (SELECT 1 FROM public.profiles WHERE profiles.id = auth.uid() AND profiles.role = 'ADMIN'));

DROP POLICY IF EXISTS "Admin update qb_classes" ON public.qb_classes;
CREATE POLICY "Admin update qb_classes" ON public.qb_classes FOR UPDATE TO authenticated
  USING (EXISTS (SELECT 1 FROM public.profiles WHERE profiles.id = auth.uid() AND profiles.role = 'ADMIN'));

DROP POLICY IF EXISTS "Admin delete qb_classes" ON public.qb_classes;
CREATE POLICY "Admin delete qb_classes" ON public.qb_classes FOR DELETE TO authenticated
  USING (EXISTS (SELECT 1 FROM public.profiles WHERE profiles.id = auth.uid() AND profiles.role = 'ADMIN'));

DROP POLICY IF EXISTS "Admin insert qb_chapters" ON public.qb_chapters;
CREATE POLICY "Admin insert qb_chapters" ON public.qb_chapters FOR INSERT TO authenticated
  WITH CHECK (EXISTS (SELECT 1 FROM public.profiles WHERE profiles.id = auth.uid() AND profiles.role = 'ADMIN'));

DROP POLICY IF EXISTS "Admin update qb_chapters" ON public.qb_chapters;
CREATE POLICY "Admin update qb_chapters" ON public.qb_chapters FOR UPDATE TO authenticated
  USING (EXISTS (SELECT 1 FROM public.profiles WHERE profiles.id = auth.uid() AND profiles.role = 'ADMIN'));

DROP POLICY IF EXISTS "Admin delete qb_chapters" ON public.qb_chapters;
CREATE POLICY "Admin delete qb_chapters" ON public.qb_chapters FOR DELETE TO authenticated
  USING (EXISTS (SELECT 1 FROM public.profiles WHERE profiles.id = auth.uid() AND profiles.role = 'ADMIN'));

DROP POLICY IF EXISTS "Admin insert qb_lessons" ON public.qb_lessons;
CREATE POLICY "Admin insert qb_lessons" ON public.qb_lessons FOR INSERT TO authenticated
  WITH CHECK (EXISTS (SELECT 1 FROM public.profiles WHERE profiles.id = auth.uid() AND profiles.role = 'ADMIN'));

DROP POLICY IF EXISTS "Admin update qb_lessons" ON public.qb_lessons;
CREATE POLICY "Admin update qb_lessons" ON public.qb_lessons FOR UPDATE TO authenticated
  USING (EXISTS (SELECT 1 FROM public.profiles WHERE profiles.id = auth.uid() AND profiles.role = 'ADMIN'));

DROP POLICY IF EXISTS "Admin delete qb_lessons" ON public.qb_lessons;
CREATE POLICY "Admin delete qb_lessons" ON public.qb_lessons FOR DELETE TO authenticated
  USING (EXISTS (SELECT 1 FROM public.profiles WHERE profiles.id = auth.uid() AND profiles.role = 'ADMIN'));

-- ========================================================
-- Bước 3: Thêm các cột taxonomy constant & truy vết nguồn gốc vào question_bank
-- ========================================================
ALTER TABLE public.question_bank
  ADD COLUMN IF NOT EXISTS qb_class_id UUID REFERENCES public.qb_classes(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS qb_chapter_id UUID REFERENCES public.qb_chapters(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS qb_lesson_id UUID REFERENCES public.qb_lessons(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS source_dynamic_lesson_id UUID REFERENCES public.lessons(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS sync_source_id UUID REFERENCES public.question_bank(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_qb_constant_class ON public.question_bank(qb_class_id);
CREATE INDEX IF NOT EXISTS idx_qb_constant_chapter ON public.question_bank(qb_chapter_id);
CREATE INDEX IF NOT EXISTS idx_qb_constant_lesson ON public.question_bank(qb_lesson_id);
CREATE INDEX IF NOT EXISTS idx_qb_source_dyn_lesson ON public.question_bank(source_dynamic_lesson_id);
CREATE INDEX IF NOT EXISTS idx_qb_sync_source_id ON public.question_bank(sync_source_id);
CREATE INDEX IF NOT EXISTS idx_qb_constant_scope ON public.question_bank(qb_class_id, qb_chapter_id, qb_lesson_id);

-- ========================================================
-- Bước 4: Tinh chỉnh Unique Index Deduplication
-- Cho phép câu hỏi động và câu hỏi constant nhân bản cùng tồn tại độc lập
-- ========================================================
DROP INDEX IF EXISTS public.uq_qb_block_hash;

-- Uniqueness cho câu hỏi động (chưa gán vào bài học constant):
CREATE UNIQUE INDEX IF NOT EXISTS uq_qb_dynamic_block_hash
  ON public.question_bank (grade_block, content_hash)
  WHERE qb_lesson_id IS NULL AND content_hash IS NOT NULL;

-- Uniqueness cho câu hỏi constant: trong cùng 1 bài học constant, không bị nhân bản trùng lặp:
CREATE UNIQUE INDEX IF NOT EXISTS uq_qb_constant_lesson_hash
  ON public.question_bank (qb_lesson_id, content_hash)
  WHERE qb_lesson_id IS NOT NULL AND content_hash IS NOT NULL;

-- ========================================================
-- Bước 5: Trigger bảo vệ danh mục Constant khi có câu hỏi đang trỏ tới
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
  END IF;

  RETURN OLD;
END;
$$;

DROP TRIGGER IF EXISTS trg_check_delete_qb_classes ON public.qb_classes;
CREATE TRIGGER trg_check_delete_qb_classes
  BEFORE DELETE ON public.qb_classes
  FOR EACH ROW
  EXECUTE FUNCTION public.fn_prevent_delete_referenced_qb_constant_category();

DROP TRIGGER IF EXISTS trg_check_delete_qb_chapters ON public.qb_chapters;
CREATE TRIGGER trg_check_delete_qb_chapters
  BEFORE DELETE ON public.qb_chapters
  FOR EACH ROW
  EXECUTE FUNCTION public.fn_prevent_delete_referenced_qb_constant_category();

DROP TRIGGER IF EXISTS trg_check_delete_qb_lessons ON public.qb_lessons;
CREATE TRIGGER trg_check_delete_qb_lessons
  BEFORE DELETE ON public.qb_lessons
  FOR EACH ROW
  EXECUTE FUNCTION public.fn_prevent_delete_referenced_qb_constant_category();

-- ========================================================
-- Bước 6: Cập nhật Trigger Before Insert or Update cho question_bank
-- Hỗ trợ suy diễn tự động grade_block và phân cấp constant
-- ========================================================
CREATE OR REPLACE FUNCTION public.fn_qb_before_insert_or_update()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
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

DROP TRIGGER IF EXISTS trg_qb_before_insert_or_update ON public.question_bank;
CREATE TRIGGER trg_qb_before_insert_or_update
  BEFORE INSERT OR UPDATE ON public.question_bank
  FOR EACH ROW
  EXECUTE FUNCTION public.fn_qb_before_insert_or_update();

-- ========================================================
-- Bước 7: Atomic RPC Function Đồng bộ câu hỏi động sang bài học constant
-- ========================================================
CREATE OR REPLACE FUNCTION public.fn_sync_dynamic_questions_to_constant(
  p_source_lesson_ids UUID[],
  p_target_constant_lesson_id UUID
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_target_lesson RECORD;
  v_target_chapter RECORD;
  v_target_class RECORD;
  v_q RECORD;
  v_created_count INT := 0;
  v_skipped_count INT := 0;
  v_hash TEXT;
  v_existing_hashes TEXT[];
  v_batch_hashes TEXT[] := ARRAY[]::TEXT[];
BEGIN
  -- Kiểm tra dữ liệu đầu vào
  IF p_source_lesson_ids IS NULL OR array_length(p_source_lesson_ids, 1) = 0 THEN
    RETURN jsonb_build_object('success', false, 'error', 'Danh sách bài học nguồn không được để trống');
  END IF;

  IF p_target_constant_lesson_id IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'Bài học đích constant không được để trống');
  END IF;

  -- Lấy thông tin bài học đích constant
  SELECT * INTO v_target_lesson FROM public.qb_lessons WHERE id = p_target_constant_lesson_id;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'error', 'Bài học đích constant không tồn tại');
  END IF;

  SELECT * INTO v_target_chapter FROM public.qb_chapters WHERE id = v_target_lesson.chapter_id;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'error', 'Chương học constant của bài đích không tồn tại');
  END IF;

  SELECT * INTO v_target_class FROM public.qb_classes WHERE id = v_target_chapter.class_id;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'error', 'Lớp học constant của bài đích không tồn tại');
  END IF;

  -- Lấy danh sách hash đã có sẵn trong bài học constant đích
  SELECT COALESCE(array_agg(content_hash), ARRAY[]::TEXT[])
  INTO v_existing_hashes
  FROM public.question_bank
  WHERE qb_lesson_id = p_target_constant_lesson_id
    AND content_hash IS NOT NULL;

  -- Quét các câu hỏi thuộc bài học nguồn động
  FOR v_q IN
    SELECT *
    FROM public.question_bank
    WHERE lesson_id = ANY(p_source_lesson_ids)
    ORDER BY created_at ASC
  LOOP
    v_hash := v_q.content_hash;
    IF v_hash IS NULL AND v_q.prompt IS NOT NULL THEN
      v_hash := public.fn_compute_qb_content_hash(v_q.question_type, v_q.prompt);
    END IF;

    -- Kiểm tra chống trùng lặp theo bài học đích (Idempotency)
    IF v_hash IS NOT NULL AND (v_hash = ANY(v_existing_hashes) OR v_hash = ANY(v_batch_hashes)) THEN
      v_skipped_count := v_skipped_count + 1;
    ELSE
      -- Duplicate bản ghi câu hỏi sang bài học constant độc lập
      INSERT INTO public.question_bank (
        subject,
        grade_level,
        grade_block,
        qb_class_id,
        qb_chapter_id,
        qb_lesson_id,
        source_dynamic_lesson_id,
        sync_source_id,
        question_type,
        difficulty,
        prompt,
        mc_answer,
        tf_answers,
        sa_answer,
        sa_tolerance,
        points,
        tags,
        usage_count,
        content_hash
      ) VALUES (
        v_q.subject,
        v_q.grade_level,
        COALESCE(v_target_class.grade_block, v_q.grade_block),
        v_target_class.id,
        v_target_chapter.id,
        v_target_lesson.id,
        v_q.lesson_id,
        v_q.id,
        v_q.question_type,
        v_q.difficulty,
        v_q.prompt,
        v_q.mc_answer,
        v_q.tf_answers,
        v_q.sa_answer,
        v_q.sa_tolerance,
        v_q.points,
        v_q.tags,
        0,
        v_hash
      );

      v_created_count := v_created_count + 1;
      IF v_hash IS NOT NULL THEN
        v_batch_hashes := array_append(v_batch_hashes, v_hash);
      END IF;
    END IF;
  END LOOP;

  RETURN jsonb_build_object(
    'success', true,
    'createdCount', v_created_count,
    'skippedCount', v_skipped_count,
    'totalProcessed', v_created_count + v_skipped_count,
    'targetLessonId', p_target_constant_lesson_id,
    'targetLessonTitle', v_target_lesson.title
  );
END;
$$;

-- ========================================================
-- Bước 8: Khởi tạo Taxonomy Constant Tiêu chuẩn
-- ========================================================
INSERT INTO public.qb_grade_blocks (name, description, order_index)
VALUES
  ('12-Toán', 'Khối 12 chuyên đề Toán học (Constant)', 1),
  ('12-Hóa', 'Khối 12 chuyên đề Hóa học (Constant)', 2),
  ('11-Toán', 'Khối 11 chuyên đề Toán học (Constant)', 3),
  ('11-Hóa', 'Khối 11 chuyên đề Hóa học (Constant)', 4),
  ('10-Toán', 'Khối 10 chuyên đề Toán học (Constant)', 5),
  ('10-Hóa', 'Khối 10 chuyên đề Hóa học (Constant)', 6)
ON CONFLICT (name) DO NOTHING;

-- Không copy từ taxonomy curriculum động ở đây: repository không có bảng
-- public.grade_blocks và taxonomy Question Bank phải độc lập. Các khối bổ sung
-- được tạo qua API quản lý constant sau khi migration được áp dụng.

DO $$
DECLARE
  v_gb_12t UUID;
  v_gb_12h UUID;
  v_gb_11t UUID;
  v_gb_11h UUID;
  v_cl_12t UUID;
  v_cl_12h UUID;
  v_cl_11t UUID;
  v_ch_12t_1 UUID;
  v_ch_12t_2 UUID;
  v_ch_12h_1 UUID;
  v_ch_11t_1 UUID;
BEGIN
  SELECT id INTO v_gb_12t FROM public.qb_grade_blocks WHERE name = '12-Toán';
  SELECT id INTO v_gb_12h FROM public.qb_grade_blocks WHERE name = '12-Hóa';
  SELECT id INTO v_gb_11t FROM public.qb_grade_blocks WHERE name = '11-Toán';
  SELECT id INTO v_gb_11h FROM public.qb_grade_blocks WHERE name = '11-Hóa';

  -- 12-Toán Class
  IF v_gb_12t IS NOT NULL AND NOT EXISTS (SELECT 1 FROM public.qb_classes WHERE grade_block = '12-Toán') THEN
    INSERT INTO public.qb_classes (grade_block_id, grade_block, name, description, order_index)
    VALUES (v_gb_12t, '12-Toán', 'Toán 12 - Chuẩn hóa', 'Ngân hàng chuẩn Toán 12', 1)
    RETURNING id INTO v_cl_12t;

    IF v_cl_12t IS NOT NULL THEN
      INSERT INTO public.qb_chapters (class_id, title, description, order_index)
      VALUES (v_cl_12t, 'Chương 1: Ứng dụng đạo hàm khảo sát hàm số', 'Đơn điệu, cực trị, GTLN-GTNN, tiệm cận', 1)
      RETURNING id INTO v_ch_12t_1;

      IF v_ch_12t_1 IS NOT NULL THEN
        INSERT INTO public.qb_lessons (chapter_id, title, order_index) VALUES
          (v_ch_12t_1, 'Bài 1: Tính đơn điệu của hàm số', 1),
          (v_ch_12t_1, 'Bài 2: Cực trị của hàm số', 2),
          (v_ch_12t_1, 'Bài 3: Giá trị lớn nhất và nhỏ nhất của hàm số', 3),
          (v_ch_12t_1, 'Bài 4: Đường tiệm cận của đồ thị hàm số', 4);
      END IF;

      INSERT INTO public.qb_chapters (class_id, title, description, order_index)
      VALUES (v_cl_12t, 'Chương 2: Tọa độ trong không gian Oxyz', 'Vectơ, mặt phẳng, đường thẳng, mặt cầu', 2)
      RETURNING id INTO v_ch_12t_2;

      IF v_ch_12t_2 IS NOT NULL THEN
        INSERT INTO public.qb_lessons (chapter_id, title, order_index) VALUES
          (v_ch_12t_2, 'Bài 1: Hệ trục tọa độ và vectơ trong không gian', 1),
          (v_ch_12t_2, 'Bài 2: Phương trình mặt phẳng', 2);
      END IF;
    END IF;
  END IF;

  -- 12-Hóa Class
  IF v_gb_12h IS NOT NULL AND NOT EXISTS (SELECT 1 FROM public.qb_classes WHERE grade_block = '12-Hóa') THEN
    INSERT INTO public.qb_classes (grade_block_id, grade_block, name, description, order_index)
    VALUES (v_gb_12h, '12-Hóa', 'Hóa học 12 - Chuẩn hóa', 'Ngân hàng chuẩn Hóa học 12', 1)
    RETURNING id INTO v_cl_12h;

    IF v_cl_12h IS NOT NULL THEN
      INSERT INTO public.qb_chapters (class_id, title, description, order_index)
      VALUES (v_cl_12h, 'Chương 1: Este - Lipit', 'Cấu tạo este, phản ứng xà phòng hóa', 1)
      RETURNING id INTO v_ch_12h_1;

      IF v_ch_12h_1 IS NOT NULL THEN
        INSERT INTO public.qb_lessons (chapter_id, title, order_index) VALUES
          (v_ch_12h_1, 'Bài 1: Este', 1),
          (v_ch_12h_1, 'Bài 2: Lipit và chất béo', 2);
      END IF;
    END IF;
  END IF;

  -- 11-Toán Class
  IF v_gb_11t IS NOT NULL AND NOT EXISTS (SELECT 1 FROM public.qb_classes WHERE grade_block = '11-Toán') THEN
    INSERT INTO public.qb_classes (grade_block_id, grade_block, name, description, order_index)
    VALUES (v_gb_11t, '11-Toán', 'Toán 11 - Chuẩn hóa', 'Ngân hàng chuẩn Toán 11', 1)
    RETURNING id INTO v_cl_11t;

    IF v_cl_11t IS NOT NULL THEN
      INSERT INTO public.qb_chapters (class_id, title, description, order_index)
      VALUES (v_cl_11t, 'Chương 1: Hàm số lượng giác & Phương trình lượng giác', 'Lượng giác 11', 1)
      RETURNING id INTO v_ch_11t_1;

      IF v_ch_11t_1 IS NOT NULL THEN
        INSERT INTO public.qb_lessons (chapter_id, title, order_index) VALUES
          (v_ch_11t_1, 'Bài 1: Góc lượng giác và giá trị lượng giác', 1),
          (v_ch_11t_1, 'Bài 2: Các công thức lượng giác', 2);
      END IF;
    END IF;
  END IF;

END $$;
