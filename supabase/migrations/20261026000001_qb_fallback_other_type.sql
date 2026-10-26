-- Migration: 20261026000001_qb_fallback_other_type.sql
-- DESCRIPTION: Bổ sung Dạng bài "Khác" cho mọi Bài học Constant (qb_lessons) chưa có.
--              Dùng làm fallback an toàn khi câu hỏi thiếu hoặc không match Dạng bài cụ thể.

INSERT INTO public.qb_question_types (lesson_id, name, description, order_index)
SELECT 
  l.id,
  'Khác',
  'Dạng bài khác hoặc câu hỏi tổng hợp thuộc bài học',
  COALESCE((
    SELECT MAX(order_index) + 1 
    FROM public.qb_question_types t 
    WHERE t.lesson_id = l.id
  ), 0)
FROM public.qb_lessons l
WHERE NOT EXISTS (
  SELECT 1 
  FROM public.qb_question_types t
  WHERE t.lesson_id = l.id 
    AND lower(trim(t.name)) IN ('khác', 'khac')
);
