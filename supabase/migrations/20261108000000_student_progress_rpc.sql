-- =====================================================================
-- Migration: 20261108000000_student_progress_rpc.sql
-- Description: RPCs for Student Progress (Attendance, Achievements, Leaderboard)
-- =====================================================================

-- 1. Helper Function: Single source of truth for XP events
CREATE OR REPLACE FUNCTION public._fn_student_progress_xp_events(
  p_student_id uuid DEFAULT NULL,
  p_class_id uuid DEFAULT NULL
)
RETURNS TABLE (
  student_id uuid,
  event_date date,
  xp int,
  class_id uuid,
  source_type text,
  source_id uuid
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
STABLE
AS $$
BEGIN
  RETURN QUERY
  -- A. Homework XP Events
  WITH candidate_subs AS (
    SELECT
      s.id AS submission_id,
      s.student_id,
      s.homework_id,
      c.class_id,
      (s.submitted_at AT TIME ZONE 'Asia/Ho_Chi_Minh')::date AS sub_date_vn,
      s.submitted_at,
      COALESCE(s.is_late, false) AS is_late,
      COALESCE(s.total_score, 0)::numeric AS total_score,
      COALESCE(s.max_score, 10)::numeric AS max_score
    FROM public.submissions s
    JOIN public.homeworks h ON h.id = s.homework_id
    JOIN public.lessons l ON l.id = h.lesson_id
    JOIN public.chapters c ON c.id = l.chapter_id
    WHERE s.status = 'SUBMITTED'
      AND COALESCE(s.is_trial, false) = false
      AND h.is_published = true
      AND (p_student_id IS NULL OR s.student_id = p_student_id)
      AND (p_class_id IS NULL OR c.class_id = p_class_id)
      AND EXISTS (
        SELECT 1 FROM public.student_classes sc
        WHERE sc.student_id = s.student_id AND sc.class_id = c.class_id
        UNION
        SELECT 1 FROM public.profiles p
        WHERE p.id = s.student_id AND p.class_id = c.class_id
      )
  ),
  first_subs AS (
    SELECT DISTINCT ON (cs.student_id, cs.homework_id)
      cs.student_id,
      cs.homework_id,
      cs.class_id,
      cs.sub_date_vn,
      cs.is_late,
      cs.submission_id
    FROM candidate_subs cs
    ORDER BY cs.student_id, cs.homework_id, cs.submitted_at ASC, cs.submission_id ASC
  ),
  best_subs AS (
    SELECT DISTINCT ON (cs.student_id, cs.homework_id)
      cs.student_id,
      cs.homework_id,
      cs.total_score,
      cs.max_score
    FROM candidate_subs cs
    ORDER BY cs.student_id, cs.homework_id, cs.total_score DESC,
             (CASE WHEN cs.max_score > 0 THEN cs.total_score / cs.max_score ELSE 0 END) DESC,
             cs.submitted_at ASC, cs.submission_id ASC
  )
  SELECT
    fs.student_id,
    fs.sub_date_vn AS event_date,
    (
      10 +
      CASE
        WHEN bs.max_score > 0 AND bs.total_score > 0
          THEN GREATEST(0, LEAST(10, ROUND((10.0 * bs.total_score) / bs.max_score)::int))
        ELSE 0
      END +
      CASE
        WHEN NOT fs.is_late THEN 5
        ELSE 0
      END
    )::int AS xp,
    fs.class_id,
    'homework'::text AS source_type,
    fs.homework_id AS source_id
  FROM first_subs fs
  JOIN best_subs bs ON bs.student_id = fs.student_id AND bs.homework_id = fs.homework_id

  UNION ALL

  -- B. Attendance XP Events
  SELECT
    ar.student_id,
    ase.session_date AS event_date,
    10::int AS xp,
    ase.class_id,
    'attendance'::text AS source_type,
    ase.id AS source_id
  FROM public.attendance_records ar
  JOIN public.attendance_sessions ase ON ase.id = ar.session_id
  WHERE ar.is_present = true
    AND (p_student_id IS NULL OR ar.student_id = p_student_id)
    AND (p_class_id IS NULL OR ase.class_id = p_class_id)
    AND NOT EXISTS (
      SELECT 1 FROM public.student_lock_intervals sli
      WHERE sli.student_id = ar.student_id
        AND sli.start_date <= ase.session_date
        AND (sli.end_date IS NULL OR ase.session_date < sli.end_date)
    )
    AND EXISTS (
      SELECT 1 FROM public.student_classes sc
      WHERE sc.student_id = ar.student_id AND sc.class_id = ase.class_id
      UNION
      SELECT 1 FROM public.profiles p
      WHERE p.id = ar.student_id AND p.class_id = ase.class_id
    );
END;
$$;


-- 2. RPC: fn_student_attendance
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
      ase.session_date,
      ase.note
    FROM public.attendance_sessions ase
    WHERE ase.class_id = p_class_id
      AND ase.session_date >= p_from
      AND ase.session_date <= p_to
  ),
  session_stats AS (
    SELECT
      cas.session_id,
      cas.session_date,
      cas.note,
      COUNT(ar.id)::int AS class_total,
      COUNT(ar.id) FILTER (WHERE ar.is_present = true)::int AS class_present
    FROM class_att_sessions cas
    LEFT JOIN public.attendance_records ar ON ar.session_id = cas.session_id
    GROUP BY cas.session_id, cas.session_date, cas.note
  ),
  student_status AS (
    SELECT
      ss.session_id,
      ss.session_date,
      ss.note,
      ss.class_total,
      ss.class_present,
      CASE
        WHEN ss.class_total > 0
          THEN ROUND((ss.class_present::numeric * 100.0) / ss.class_total::numeric, 1)
        ELSE NULL
      END AS class_rate,
      CASE
        WHEN EXISTS (
          SELECT 1 FROM public.student_lock_intervals sli
          WHERE sli.student_id = p_student_id
            AND sli.start_date <= ss.session_date
            AND (sli.end_date IS NULL OR ss.session_date < sli.end_date)
        ) THEN 'NOT_COUNTED'
        WHEN my_ar.id IS NULL THEN 'NOT_COUNTED'
        WHEN my_ar.is_present = true THEN 'PRESENT'
        ELSE 'ABSENT'
      END AS my_status
    FROM session_stats ss
    LEFT JOIN public.attendance_records my_ar
      ON my_ar.session_id = ss.session_id
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
      END AS attendance_rate,
      CASE
        WHEN COUNT(*) FILTER (WHERE class_total > 0) > 0
          THEN ROUND(AVG((class_present::numeric * 100.0) / class_total::numeric) FILTER (WHERE class_total > 0), 1)
        ELSE NULL
      END AS class_average_rate
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
      'attendanceRate', (SELECT attendance_rate FROM summary_calc),
      'classAverageRate', (SELECT class_average_rate FROM summary_calc)
    ),
    'sessions', COALESCE((
      SELECT jsonb_agg(
        jsonb_build_object(
          'sessionId', st.session_id,
          'date', to_char(st.session_date, 'YYYY-MM-DD'),
          'note', st.note,
          'status', st.my_status,
          'classPresent', st.class_present,
          'classTotal', st.class_total,
          'classRate', st.class_rate
        )
        ORDER BY st.session_date DESC, st.session_id ASC
      )
      FROM student_status st
    ), '[]'::jsonb)
  ) INTO v_result;

  RETURN v_result;
END;
$$;


-- 3. RPC: fn_student_achievements
CREATE OR REPLACE FUNCTION public.fn_student_achievements(
  p_student_id uuid,
  p_today date
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
STABLE
AS $$
DECLARE
  v_today_str text := to_char(p_today, 'YYYY-MM-DD');
  v_week_start date := date_trunc('week', p_today)::date;
  v_week_end date := v_week_start + 6;
  v_total_xp int := 0;
  v_this_week_xp int := 0;
  v_level int := 1;
  v_level_xp int := 0;
  v_next_level_xp int := 200;
  v_current_streak int := 0;
  v_best_streak int := 0;
  v_active_today boolean := false;
  v_last_active_date date := NULL;
  v_completed_hw_count int := 0;
  v_perfect_hw_count int := 0;
  v_ontime_hw_count int := 0;
  v_attended_sessions_count int := 0;
  v_result jsonb;
BEGIN
  IF p_student_id IS NULL THEN
    RAISE EXCEPTION 'Missing studentId';
  END IF;

  -- 1. Total and weekly XP
  SELECT
    COALESCE(SUM(xp), 0)::int,
    COALESCE(SUM(xp) FILTER (WHERE event_date >= v_week_start AND event_date <= v_week_end), 0)::int
  INTO v_total_xp, v_this_week_xp
  FROM public._fn_student_progress_xp_events(p_student_id, NULL);

  v_level := floor(v_total_xp / 200) + 1;
  v_level_xp := v_total_xp % 200;

  -- 2. Active Dates for Streak
  WITH student_active_dates AS (
    SELECT DISTINCT (s.submitted_at AT TIME ZONE 'Asia/Ho_Chi_Minh')::date AS act_date
    FROM public.submissions s
    JOIN public.homeworks h ON h.id = s.homework_id
    JOIN public.lessons l ON l.id = h.lesson_id
    JOIN public.chapters c ON c.id = l.chapter_id
    WHERE s.student_id = p_student_id
      AND s.status = 'SUBMITTED'
      AND COALESCE(s.is_trial, false) = false
      AND h.is_published = true
      AND EXISTS (
        SELECT 1 FROM public.student_classes sc WHERE sc.student_id = p_student_id AND sc.class_id = c.class_id
        UNION
        SELECT 1 FROM public.profiles p WHERE p.id = p_student_id AND p.class_id = c.class_id
      )
    UNION
    SELECT DISTINCT ase.session_date AS act_date
    FROM public.attendance_records ar
    JOIN public.attendance_sessions ase ON ase.id = ar.session_id
    WHERE ar.student_id = p_student_id
      AND ar.is_present = true
      AND NOT EXISTS (
        SELECT 1 FROM public.student_lock_intervals sli
        WHERE sli.student_id = p_student_id
          AND sli.start_date <= ase.session_date
          AND (sli.end_date IS NULL OR ase.session_date < sli.end_date)
      )
      AND EXISTS (
        SELECT 1 FROM public.student_classes sc WHERE sc.student_id = p_student_id AND sc.class_id = ase.class_id
        UNION
        SELECT 1 FROM public.profiles p WHERE p.id = p_student_id AND p.class_id = ase.class_id
      )
  ),
  ordered_dates AS (
    SELECT
      act_date,
      act_date - (ROW_NUMBER() OVER (ORDER BY act_date))::int AS grp
    FROM student_active_dates
    WHERE act_date <= p_today
  )
  SELECT
    EXISTS (SELECT 1 FROM ordered_dates WHERE act_date = p_today),
    (SELECT MAX(act_date) FROM ordered_dates),
    COALESCE((SELECT MAX(cnt) FROM (SELECT COUNT(*)::int AS cnt FROM ordered_dates GROUP BY grp) sub), 0)
  INTO v_active_today, v_last_active_date, v_best_streak;

  -- Current streak
  WITH student_active_dates AS (
    SELECT DISTINCT (s.submitted_at AT TIME ZONE 'Asia/Ho_Chi_Minh')::date AS act_date
    FROM public.submissions s
    JOIN public.homeworks h ON h.id = s.homework_id
    JOIN public.lessons l ON l.id = h.lesson_id
    JOIN public.chapters c ON c.id = l.chapter_id
    WHERE s.student_id = p_student_id
      AND s.status = 'SUBMITTED'
      AND COALESCE(s.is_trial, false) = false
      AND h.is_published = true
      AND EXISTS (
        SELECT 1 FROM public.student_classes sc WHERE sc.student_id = p_student_id AND sc.class_id = c.class_id
        UNION
        SELECT 1 FROM public.profiles p WHERE p.id = p_student_id AND p.class_id = c.class_id
      )
    UNION
    SELECT DISTINCT ase.session_date AS act_date
    FROM public.attendance_records ar
    JOIN public.attendance_sessions ase ON ase.id = ar.session_id
    WHERE ar.student_id = p_student_id
      AND ar.is_present = true
      AND NOT EXISTS (
        SELECT 1 FROM public.student_lock_intervals sli
        WHERE sli.student_id = p_student_id
          AND sli.start_date <= ase.session_date
          AND (sli.end_date IS NULL OR ase.session_date < sli.end_date)
      )
      AND EXISTS (
        SELECT 1 FROM public.student_classes sc WHERE sc.student_id = p_student_id AND sc.class_id = ase.class_id
        UNION
        SELECT 1 FROM public.profiles p WHERE p.id = p_student_id AND p.class_id = ase.class_id
      )
  ),
  ordered_dates AS (
    SELECT
      act_date,
      act_date - (ROW_NUMBER() OVER (ORDER BY act_date))::int AS grp
    FROM student_active_dates
    WHERE act_date <= p_today
  )
  SELECT
    CASE
      WHEN v_active_today THEN
        COALESCE((SELECT COUNT(*)::int FROM ordered_dates WHERE grp = (SELECT grp FROM ordered_dates WHERE act_date = p_today)), 0)
      WHEN EXISTS (SELECT 1 FROM ordered_dates WHERE act_date = (p_today - 1)) THEN
        COALESCE((SELECT COUNT(*)::int FROM ordered_dates WHERE grp = (SELECT grp FROM ordered_dates WHERE act_date = (p_today - 1))), 0)
      ELSE 0
    END
  INTO v_current_streak;

  -- 3. Badges Metrics
  WITH candidate_subs AS (
    SELECT
      s.id,
      s.homework_id,
      s.submitted_at,
      COALESCE(s.is_late, false) AS is_late,
      COALESCE(s.total_score, 0)::numeric AS total_score,
      COALESCE(s.max_score, 10)::numeric AS max_score
    FROM public.submissions s
    JOIN public.homeworks h ON h.id = s.homework_id
    JOIN public.lessons l ON l.id = h.lesson_id
    JOIN public.chapters c ON c.id = l.chapter_id
    WHERE s.student_id = p_student_id
      AND s.status = 'SUBMITTED'
      AND COALESCE(s.is_trial, false) = false
      AND h.is_published = true
      AND EXISTS (
        SELECT 1 FROM public.student_classes sc WHERE sc.student_id = p_student_id AND sc.class_id = c.class_id
        UNION
        SELECT 1 FROM public.profiles p WHERE p.id = p_student_id AND p.class_id = c.class_id
      )
  ),
  first_subs AS (
    SELECT DISTINCT ON (homework_id)
      homework_id,
      is_late
    FROM candidate_subs
    ORDER BY homework_id, submitted_at ASC, id ASC
  ),
  best_subs AS (
    SELECT DISTINCT ON (homework_id)
      homework_id,
      total_score,
      max_score
    FROM candidate_subs
    ORDER BY homework_id, total_score DESC,
             (CASE WHEN max_score > 0 THEN total_score / max_score ELSE 0 END) DESC,
             submitted_at ASC, id ASC
  )
  SELECT
    (SELECT COUNT(*)::int FROM first_subs),
    (SELECT COUNT(*)::int FROM best_subs WHERE max_score > 0 AND total_score >= max_score),
    (SELECT COUNT(*)::int FROM first_subs WHERE NOT is_late)
  INTO v_completed_hw_count, v_perfect_hw_count, v_ontime_hw_count;

  -- Attended sessions count
  SELECT COUNT(*)::int INTO v_attended_sessions_count
  FROM public.attendance_records ar
  JOIN public.attendance_sessions ase ON ase.id = ar.session_id
  WHERE ar.student_id = p_student_id
    AND ar.is_present = true
    AND NOT EXISTS (
      SELECT 1 FROM public.student_lock_intervals sli
      WHERE sli.student_id = p_student_id
        AND sli.start_date <= ase.session_date
        AND (sli.end_date IS NULL OR ase.session_date < sli.end_date)
    )
    AND EXISTS (
      SELECT 1 FROM public.student_classes sc WHERE sc.student_id = p_student_id AND sc.class_id = ase.class_id
      UNION
      SELECT 1 FROM public.profiles p WHERE p.id = p_student_id AND p.class_id = ase.class_id
    );

  SELECT jsonb_build_object(
    'today', v_today_str,
    'xp', jsonb_build_object(
      'total', v_total_xp,
      'level', v_level,
      'levelXp', v_level_xp,
      'nextLevelXp', v_next_level_xp,
      'thisWeek', v_this_week_xp
    ),
    'streak', jsonb_build_object(
      'current', v_current_streak,
      'best', v_best_streak,
      'activeToday', v_active_today,
      'lastActiveDate', CASE WHEN v_last_active_date IS NOT NULL THEN to_char(v_last_active_date, 'YYYY-MM-DD') ELSE NULL END
    ),
    'badges', jsonb_build_array(
      jsonb_build_object('id', 'first-step', 'title', 'Khởi đầu', 'description', 'Hoàn thành bài tập đầu tiên', 'icon', 'fa-seedling', 'earned', (v_completed_hw_count >= 1), 'progress', LEAST(v_completed_hw_count, 1), 'target', 1),
      jsonb_build_object('id', 'hard-worker', 'title', 'Chăm chỉ', 'description', 'Hoàn thành 10 bài tập', 'icon', 'fa-book-open', 'earned', (v_completed_hw_count >= 10), 'progress', LEAST(v_completed_hw_count, 10), 'target', 10),
      jsonb_build_object('id', 'marathon', 'title', 'Bền bỉ', 'description', 'Hoàn thành 30 bài tập', 'icon', 'fa-person-running', 'earned', (v_completed_hw_count >= 30), 'progress', LEAST(v_completed_hw_count, 30), 'target', 30),
      jsonb_build_object('id', 'perfect', 'title', 'Điểm tuyệt đối', 'description', 'Đạt điểm tối đa ở một bài', 'icon', 'fa-star', 'earned', (v_perfect_hw_count >= 1), 'progress', LEAST(v_perfect_hw_count, 1), 'target', 1),
      jsonb_build_object('id', 'on-time', 'title', 'Đúng hẹn', 'description', 'Nộp đúng hạn lần đầu 10 bài', 'icon', 'fa-clock', 'earned', (v_ontime_hw_count >= 10), 'progress', LEAST(v_ontime_hw_count, 10), 'target', 10),
      jsonb_build_object('id', 'streak-3', 'title', 'Lửa nhỏ', 'description', 'Học 3 ngày liên tiếp', 'icon', 'fa-fire', 'earned', (v_best_streak >= 3), 'progress', LEAST(v_best_streak, 3), 'target', 3),
      jsonb_build_object('id', 'streak-7', 'title', 'Ngọn lửa tuần', 'description', 'Học 7 ngày liên tiếp', 'icon', 'fa-fire-flame-curved', 'earned', (v_best_streak >= 7), 'progress', LEAST(v_best_streak, 7), 'target', 7),
      jsonb_build_object('id', 'attendance-10', 'title', 'Chuyên cần', 'description', 'Có mặt 10 buổi học', 'icon', 'fa-clipboard-check', 'earned', (v_attended_sessions_count >= 10), 'progress', LEAST(v_attended_sessions_count, 10), 'target', 10)
    ),
    'rules', jsonb_build_array(
      jsonb_build_object('label', 'Hoàn thành một bài tập', 'xp', '+10'),
      jsonb_build_object('label', 'Điểm tốt nhất (quy đổi thang 10)', 'xp', '+0 đến +10'),
      jsonb_build_object('label', 'Nộp lần đầu đúng hạn', 'xp', '+5'),
      jsonb_build_object('label', 'Có mặt một buổi học', 'xp', '+10')
    )
  ) INTO v_result;

  RETURN v_result;
END;
$$;


-- 4. RPC: fn_class_leaderboard
CREATE OR REPLACE FUNCTION public.fn_class_leaderboard(
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

  WITH active_students AS (
    SELECT
      p.id AS student_id,
      -- Không dùng username làm tên hiển thị (lộ tên đăng nhập cho bạn cùng lớp).
      COALESCE(NULLIF(btrim(p.full_name), ''), 'Học sinh') AS full_name
    FROM public.student_classes sc
    JOIN public.profiles p ON p.id = sc.student_id
    WHERE sc.class_id = p_class_id
      AND sc.status = 'ACTIVE'
      AND p.role = 'STUDENT'
      AND COALESCE(p.is_locked, false) = false
  ),
  student_xp AS (
    SELECT
      ast.student_id,
      ast.full_name,
      COALESCE(SUM(e.xp), 0)::int AS xp
    FROM active_students ast
    LEFT JOIN public._fn_student_progress_xp_events(NULL, p_class_id) e
      ON e.student_id = ast.student_id
     AND e.event_date >= p_from
     AND e.event_date <= p_to
    GROUP BY ast.student_id, ast.full_name
  ),
  ranked_students AS (
    SELECT
      sx.student_id,
      sx.full_name,
      sx.xp,
      RANK() OVER (ORDER BY sx.xp DESC)::int AS rank
    FROM student_xp sx
  )
  SELECT jsonb_build_object(
    'classId', p_class_id,
    'className', v_class_name,
    'totalStudents', (SELECT COUNT(*)::int FROM active_students),
    'students', COALESCE((
      SELECT jsonb_agg(
        jsonb_build_object(
          'studentId', rs.student_id,
          'fullName', rs.full_name,
          'xp', rs.xp,
          'rank', rs.rank
        )
        ORDER BY rs.rank ASC, rs.full_name ASC, rs.student_id ASC
      )
      FROM ranked_students rs
    ), '[]'::jsonb)
  ) INTO v_result;

  RETURN v_result;
END;
$$;


-- 5. Permissions: REVOKE ALL from public/anon/authenticated and GRANT only to service_role
REVOKE ALL ON FUNCTION public._fn_student_progress_xp_events(uuid, uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public._fn_student_progress_xp_events(uuid, uuid) TO service_role;

REVOKE ALL ON FUNCTION public.fn_student_attendance(uuid, uuid, date, date) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.fn_student_attendance(uuid, uuid, date, date) TO service_role;

REVOKE ALL ON FUNCTION public.fn_student_achievements(uuid, date) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.fn_student_achievements(uuid, date) TO service_role;

REVOKE ALL ON FUNCTION public.fn_class_leaderboard(uuid, date, date) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.fn_class_leaderboard(uuid, date, date) TO service_role;
