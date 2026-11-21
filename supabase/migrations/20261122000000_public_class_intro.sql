-- Migration: 20261122000000_public_class_intro.sql
-- Description: Bổ sung cấu hình hiển thị công khai cho lớp học và RPC lấy danh sách lớp cho trang giới thiệu

-- 1. Bổ sung các cột vào bảng public.classes
ALTER TABLE public.classes
  ADD COLUMN IF NOT EXISTS public_listed BOOLEAN NOT NULL DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS public_schedule JSONB NOT NULL DEFAULT '[]'::jsonb,
  ADD COLUMN IF NOT EXISTS max_students INT NULL;

-- 2. Thêm CHECK constraint an toàn bằng DO-block
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'classes_public_schedule_check'
  ) THEN
    ALTER TABLE public.classes
      ADD CONSTRAINT classes_public_schedule_check
      CHECK (jsonb_typeof(public_schedule) = 'array');
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'classes_max_students_check'
  ) THEN
    ALTER TABLE public.classes
      ADD CONSTRAINT classes_max_students_check
      CHECK (max_students IS NULL OR (max_students BETWEEN 1 AND 500));
  END IF;
END $$;

-- 3. Tạo RPC public.fn_public_class_intro()
CREATE OR REPLACE FUNCTION public.fn_public_class_intro()
RETURNS TABLE(
  class_id uuid,
  name text,
  grade_block text,
  description text,
  schedule jsonb,
  max_students int,
  active_students int,
  sessions_held int
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT
    c.id AS class_id,
    c.name,
    c.grade_block,
    c.description,
    c.public_schedule AS schedule,
    c.max_students,
    COALESCE(sc_agg.active_count, 0)::int AS active_students,
    COALESCE(att_agg.session_count, 0)::int AS sessions_held
  FROM public.classes c
  LEFT JOIN (
    SELECT sc.class_id, COUNT(DISTINCT sc.student_id)::int AS active_count
    FROM public.student_classes sc
    WHERE sc.status = 'ACTIVE'
    GROUP BY sc.class_id
  ) sc_agg ON sc_agg.class_id = c.id
  LEFT JOIN (
    SELECT att.class_id, COUNT(*)::int AS session_count
    FROM public.attendance_sessions att
    GROUP BY att.class_id
  ) att_agg ON att_agg.class_id = c.id
  WHERE c.public_listed = TRUE
    AND NOT COALESCE(c.is_archived, FALSE)
  ORDER BY c.grade_block ASC, c.name ASC;
$$;

-- 4. Phân quyền: Chỉ service_role được gọi, cấm anon và authenticated
REVOKE ALL ON FUNCTION public.fn_public_class_intro() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.fn_public_class_intro() TO service_role;
