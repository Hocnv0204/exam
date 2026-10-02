-- ========================================================
-- Migration: 20260801000035_question_bank_phase4_lifecycle.sql
-- Description: Phase 4 & Phase 5 Lifecycle Management & Usage Logging
-- 1. Truy vết câu hỏi: Bổ sung question_bank_id vào bảng questions
-- 2. Bảng lịch sử sử dụng: question_usage_log (hỗ trợ tính điểm phạt theo lớp và thời gian)
-- 3. Atomic RPC fn_bump_qb_usage_with_log & fn_unbump_qb_usage_with_log
-- 4. GIN Index cho tags và cờ no_shuffle_options
-- ========================================================

-- 1. Truy vết nguồn gốc câu hỏi từ ngân hàng
ALTER TABLE public.questions 
  ADD COLUMN IF NOT EXISTS question_bank_id UUID REFERENCES public.question_bank(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_questions_qb_id 
  ON public.questions (question_bank_id) 
  WHERE question_bank_id IS NOT NULL;

-- 2. Bảng lịch sử sử dụng câu hỏi theo lớp và bài tập
CREATE TABLE IF NOT EXISTS public.question_usage_log (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  question_id UUID NOT NULL REFERENCES public.question_bank(id) ON DELETE CASCADE,
  class_id UUID REFERENCES public.classes(id) ON DELETE SET NULL,
  homework_id UUID REFERENCES public.homeworks(id) ON DELETE SET NULL,
  used_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_qul_question 
  ON public.question_usage_log (question_id, used_at DESC);

CREATE INDEX IF NOT EXISTS idx_qul_class 
  ON public.question_usage_log (class_id, used_at DESC);

CREATE INDEX IF NOT EXISTS idx_qul_hw 
  ON public.question_usage_log (homework_id);

-- RLS cho question_usage_log
ALTER TABLE public.question_usage_log ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies 
    WHERE tablename = 'question_usage_log' AND policyname = 'allow_authenticated_all_usage_log'
  ) THEN
    CREATE POLICY allow_authenticated_all_usage_log ON public.question_usage_log
      FOR ALL
      TO authenticated
      USING (true)
      WITH CHECK (true);
  END IF;
END $$;

-- 3. RPC: Tăng usage_count kèm ghi log lịch sử
CREATE OR REPLACE FUNCTION public.fn_bump_qb_usage_with_log(
  p_question_ids UUID[],
  p_class_id UUID DEFAULT NULL,
  p_homework_id UUID DEFAULT NULL
)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  IF p_question_ids IS NULL OR array_length(p_question_ids, 1) = 0 THEN
    RETURN;
  END IF;

  -- Tăng usage_count nguyên tử
  UPDATE public.question_bank
  SET usage_count = COALESCE(usage_count, 0) + 1,
      updated_at = NOW()
  WHERE id = ANY(p_question_ids);

  -- Ghi log lịch sử sử dụng theo lớp và đề thi
  INSERT INTO public.question_usage_log (question_id, class_id, homework_id, used_at)
  SELECT q_id, p_class_id, p_homework_id, NOW()
  FROM unnest(p_question_ids) AS q_id;
END;
$$;

-- 4. RPC: Giảm usage_count kèm dọn dẹp log khi đổi câu hoặc xóa đề
CREATE OR REPLACE FUNCTION public.fn_unbump_qb_usage_with_log(
  p_question_ids UUID[],
  p_homework_id UUID DEFAULT NULL
)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  IF p_question_ids IS NULL OR array_length(p_question_ids, 1) = 0 THEN
    RETURN;
  END IF;

  -- Giảm usage_count (đảm bảo không âm)
  UPDATE public.question_bank
  SET usage_count = GREATEST(0, COALESCE(usage_count, 0) - 1),
      updated_at = NOW()
  WHERE id = ANY(p_question_ids);

  -- Xóa log đã ghi tương ứng
  IF p_homework_id IS NOT NULL THEN
    DELETE FROM public.question_usage_log
    WHERE homework_id = p_homework_id
      AND question_id = ANY(p_question_ids);
  END IF;
END;
$$;

-- 5. GIN Index cho tags (Phase 6.2) và cờ no_shuffle_options (Phase 6.1)
CREATE INDEX IF NOT EXISTS idx_qb_tags 
  ON public.question_bank USING GIN (tags);

ALTER TABLE public.question_bank 
  ADD COLUMN IF NOT EXISTS no_shuffle_options BOOLEAN DEFAULT FALSE;
