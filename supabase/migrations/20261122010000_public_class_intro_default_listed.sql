-- Migration: 20261122010000_public_class_intro_default_listed.sql
-- Trang giới thiệu (spec 005), điều chỉnh theo yêu cầu người dùng 2026-11-22:
--   1. Mọi lớp chưa lưu trữ mặc định HIỆN trên trang giới thiệu (admin vẫn tắt được từng lớp).
--   2. Tổng số học sinh đang theo học = số học sinh KHÁC NHAU có ghi danh ACTIVE ở bất kỳ lớp
--      chưa lưu trữ nào (không cộng dồn theo lớp, không phụ thuộc lớp có hiện hay không).

ALTER TABLE public.classes ALTER COLUMN public_listed SET DEFAULT TRUE;

-- Bật cho các lớp hiện có (cột mới thêm cùng ngày, chưa admin nào chủ động tắt).
UPDATE public.classes SET public_listed = TRUE WHERE public_listed = FALSE;

CREATE OR REPLACE FUNCTION public.fn_public_active_student_total()
RETURNS int
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT COUNT(DISTINCT sc.student_id)::int
  FROM public.student_classes sc
  JOIN public.classes c ON c.id = sc.class_id
  WHERE sc.status = 'ACTIVE'
    AND NOT COALESCE(c.is_archived, FALSE);
$$;

REVOKE ALL ON FUNCTION public.fn_public_active_student_total() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.fn_public_active_student_total() TO service_role;
