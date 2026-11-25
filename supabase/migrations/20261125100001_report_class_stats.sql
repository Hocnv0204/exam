-- Migration: Add fn_report_class_stats for class average & weekly trend calculation
-- Used in student-history (scope=report | shared-report)

CREATE OR REPLACE FUNCTION public.fn_report_class_stats(
  p_class_id UUID,
  p_from_date DATE,
  p_to_date DATE
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_from_ts TIMESTAMPTZ;
  v_to_ts TIMESTAMPTZ;
  v_class_avg NUMERIC;
  v_student_count INTEGER;
  v_weeks JSONB;
  v_result JSONB;
BEGIN
  IF p_class_id IS NULL OR p_from_date IS NULL OR p_to_date IS NULL THEN
    RETURN NULL;
  END IF;

  v_from_ts := (p_from_date::text || ' 00:00:00+00')::timestamptz;
  v_to_ts := (p_to_date::text || ' 23:59:59.999+00')::timestamptz;

  -- 1. Tính điểm trung bình kỳ của từng học sinh ACTIVE có ít nhất 1 bài nộp trong kỳ
  WITH active_students AS (
    SELECT DISTINCT student_id
    FROM public.student_classes
    WHERE class_id = p_class_id
      AND status = 'ACTIVE'
  ),
  class_homeworks AS (
    SELECT h.id AS homework_id, COALESCE(h.max_score, 10.0) AS max_score
    FROM public.homeworks h
    JOIN public.lessons l ON l.id = h.lesson_id
    JOIN public.chapters c ON c.id = l.chapter_id
    WHERE c.class_id = p_class_id
      AND h.is_published = true
      AND (l.is_trial IS NOT TRUE)
  ),
  student_best_per_hw AS (
    SELECT
      s.student_id,
      s.homework_id,
      MAX(
        CASE
          WHEN COALESCE(s.max_score, ch.max_score, 10.0) > 0
          THEN LEAST(10.0, GREATEST(0.0, (s.total_score / COALESCE(s.max_score, ch.max_score, 10.0)) * 10.0))
          ELSE 0.0
        END
      ) AS best_scaled_score
    FROM public.submissions s
    JOIN active_students act ON act.student_id = s.student_id
    JOIN class_homeworks ch ON ch.homework_id = s.homework_id
    WHERE s.status = 'SUBMITTED'
      AND s.submitted_at >= v_from_ts
      AND s.submitted_at <= v_to_ts
    GROUP BY s.student_id, s.homework_id
  ),
  student_period_avg AS (
    SELECT
      student_id,
      AVG(best_scaled_score) AS student_avg
    FROM student_best_per_hw
    GROUP BY student_id
  )
  SELECT
    ROUND(AVG(student_avg)::numeric, 2),
    COUNT(*)::integer
  INTO v_class_avg, v_student_count
  FROM student_period_avg;

  -- 2. Tính điểm TB lớp theo từng tuần giao với kỳ
  -- Tuần bắt đầu từ thứ Hai (theo ngày nộp giờ VN UTC+7)
  WITH active_students AS (
    SELECT DISTINCT student_id
    FROM public.student_classes
    WHERE class_id = p_class_id
      AND status = 'ACTIVE'
  ),
  class_homeworks AS (
    SELECT h.id AS homework_id, COALESCE(h.max_score, 10.0) AS max_score
    FROM public.homeworks h
    JOIN public.lessons l ON l.id = h.lesson_id
    JOIN public.chapters c ON c.id = l.chapter_id
    WHERE c.class_id = p_class_id
      AND h.is_published = true
      AND (l.is_trial IS NOT TRUE)
  ),
  student_weekly_best AS (
    SELECT
      s.student_id,
      date_trunc('week', ((s.submitted_at AT TIME ZONE 'UTC') + INTERVAL '7 hours')::date)::date AS week_start,
      s.homework_id,
      MAX(
        CASE
          WHEN COALESCE(s.max_score, ch.max_score, 10.0) > 0
          THEN LEAST(10.0, GREATEST(0.0, (s.total_score / COALESCE(s.max_score, ch.max_score, 10.0)) * 10.0))
          ELSE 0.0
        END
      ) AS best_scaled_score
    FROM public.submissions s
    JOIN active_students act ON act.student_id = s.student_id
    JOIN class_homeworks ch ON ch.homework_id = s.homework_id
    WHERE s.status = 'SUBMITTED'
      AND s.submitted_at >= v_from_ts
      AND s.submitted_at <= v_to_ts
    GROUP BY s.student_id, date_trunc('week', ((s.submitted_at AT TIME ZONE 'UTC') + INTERVAL '7 hours')::date)::date, s.homework_id
  ),
  student_weekly_avg AS (
    SELECT
      student_id,
      week_start,
      AVG(best_scaled_score) AS student_week_avg
    FROM student_weekly_best
    GROUP BY student_id, week_start
  ),
  class_weekly_summary AS (
    SELECT
      to_char(week_start, 'YYYY-MM-DD') AS week_start,
      ROUND(AVG(student_week_avg)::numeric, 2) AS class_average_score
    FROM student_weekly_avg
    GROUP BY week_start
    ORDER BY week_start ASC
  )
  SELECT COALESCE(jsonb_agg(
    jsonb_build_object(
      'weekStart', week_start,
      'classAverageScore', class_average_score
    )
  ), '[]'::jsonb)
  INTO v_weeks
  FROM class_weekly_summary;

  v_result := jsonb_build_object(
    'classAverage', CASE
      WHEN v_student_count > 0 THEN jsonb_build_object(
        'averageScore', v_class_avg,
        'studentCount', v_student_count
      )
      ELSE jsonb_build_object(
        'averageScore', NULL,
        'studentCount', 0
      )
    END,
    'weeklyClassAverages', COALESCE(v_weeks, '[]'::jsonb)
  );

  RETURN v_result;
END;
$$;

REVOKE ALL ON FUNCTION public.fn_report_class_stats(UUID, DATE, DATE) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.fn_report_class_stats(UUID, DATE, DATE) TO service_role;
