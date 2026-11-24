-- ============================================================================
-- Migration: 20261125000000_minimize_student_attendance_payload.sql
-- Purpose: Minimize attendance data returned to students and student progress
--          reports so only class sessions and the student's own attendance
--          status are exposed (omit note, classPresent, classTotal, classRate,
--          and classAverageRate).
-- ============================================================================

CREATE OR REPLACE FUNCTION public.fn_student_attendance(
  p_student_id uuid,
  p_class_id uuid,
  p_from date,
  p_to date
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
STABLE
AS $$
DECLARE
  v_class_name text;
  v_result jsonb;
BEGIN
  IF p_class_id IS NULL THEN
    RAISE EXCEPTION 'Missing classId';
  END IF;

  SELECT name INTO v_class_name
  FROM public.classes
  WHERE id = p_class_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Class not found';
  END IF;

  WITH class_att_sessions AS (
    SELECT
      ase.id AS session_id,
      ase.session_date
    FROM public.attendance_sessions ase
    WHERE ase.class_id = p_class_id
      AND ase.session_date >= p_from
      AND ase.session_date <= p_to
  ),
  student_status AS (
    SELECT
      cas.session_id,
      cas.session_date,
      CASE
        WHEN EXISTS (
          SELECT 1 FROM public.student_lock_intervals sli
          WHERE sli.student_id = p_student_id
            AND sli.start_date <= cas.session_date
            AND (sli.end_date IS NULL OR cas.session_date < sli.end_date)
        ) THEN 'NOT_COUNTED'
        WHEN my_ar.id IS NULL THEN 'NOT_COUNTED'
        WHEN my_ar.is_present = true THEN 'PRESENT'
        ELSE 'ABSENT'
      END AS my_status
    FROM class_att_sessions cas
    LEFT JOIN public.attendance_records my_ar
      ON my_ar.session_id = cas.session_id
     AND my_ar.student_id = p_student_id
  ),
  summary_calc AS (
    SELECT
      COUNT(*)::int AS class_sessions,
      COUNT(*) FILTER (WHERE my_status IN ('PRESENT', 'ABSENT'))::int AS counted_sessions,
      COUNT(*) FILTER (WHERE my_status = 'PRESENT')::int AS present_count,
      COUNT(*) FILTER (WHERE my_status = 'ABSENT')::int AS absent_count,
      COUNT(*) FILTER (WHERE my_status = 'NOT_COUNTED')::int AS not_counted_count,
      CASE
        WHEN COUNT(*) FILTER (WHERE my_status IN ('PRESENT', 'ABSENT')) > 0
          THEN ROUND((COUNT(*) FILTER (WHERE my_status = 'PRESENT')::numeric * 100.0) /
                     (COUNT(*) FILTER (WHERE my_status IN ('PRESENT', 'ABSENT')))::numeric, 1)
        ELSE NULL
      END AS attendance_rate
    FROM student_status
  )
  SELECT jsonb_build_object(
    'classId', p_class_id,
    'className', v_class_name,
    'fromDate', to_char(p_from, 'YYYY-MM-DD'),
    'toDate', to_char(p_to, 'YYYY-MM-DD'),
    'summary', jsonb_build_object(
      'classSessions', COALESCE((SELECT class_sessions FROM summary_calc), 0),
      'countedSessions', COALESCE((SELECT counted_sessions FROM summary_calc), 0),
      'present', COALESCE((SELECT present_count FROM summary_calc), 0),
      'absent', COALESCE((SELECT absent_count FROM summary_calc), 0),
      'notCounted', COALESCE((SELECT not_counted_count FROM summary_calc), 0),
      'attendanceRate', (SELECT attendance_rate FROM summary_calc)
    ),
    'sessions', COALESCE((
      SELECT jsonb_agg(
        jsonb_build_object(
          'sessionId', st.session_id,
          'date', to_char(st.session_date, 'YYYY-MM-DD'),
          'status', st.my_status
        )
        ORDER BY st.session_date DESC, st.session_id ASC
      )
      FROM student_status st
    ), '[]'::jsonb)
  ) INTO v_result;

  RETURN v_result;
END;
$$;

REVOKE ALL ON FUNCTION public.fn_student_attendance(uuid, uuid, date, date) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.fn_student_attendance(uuid, uuid, date, date) TO service_role;
