-- Migration: RPC for fast weak topics aggregation (adaptive)
-- Joins submissions -> submission_answers -> questions -> homeworks -> lessons -> chapters
-- Giữ đúng phạm vi của logic JS cũ (adaptive/index.ts, logic.ts): KHÔNG lọc status/is_trial.
-- Role/security: revoked from public/anon/authenticated, only executable by service_role

CREATE OR REPLACE FUNCTION public.fn_weak_topics(
  p_class_id uuid DEFAULT NULL,
  p_student_id uuid DEFAULT NULL,
  p_min_answered int DEFAULT 3,
  p_limit int DEFAULT 10
)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
AS $$
DECLARE
  v_min int := coalesce(p_min_answered, 3);
  v_limit int := coalesce(p_limit, 10);
  v_result jsonb;
BEGIN
  IF p_student_id IS NULL AND p_class_id IS NULL THEN
    RAISE EXCEPTION 'Missing studentId or classId';
  END IF;

  -- 1. Single student mode
  IF p_student_id IS NOT NULL THEN
    WITH raw_answers AS (
      SELECT
        sa.id AS answer_id,
        sa.is_correct,
        c.id AS chapter_id,
        c.title AS chapter_title,
        c.class_id AS class_id
      FROM public.submissions s
      JOIN public.submission_answers sa ON sa.submission_id = s.id
      JOIN public.questions q ON q.id = sa.question_id
      JOIN public.homeworks h ON h.id = q.homework_id
      JOIN public.lessons l ON l.id = h.lesson_id
      JOIN public.chapters c ON c.id = l.chapter_id
      WHERE s.student_id = p_student_id
        AND (p_class_id IS NULL OR c.class_id = p_class_id)
    ),
    ch_agg AS (
      SELECT
        chapter_id,
        coalesce(chapter_title, 'Chương') AS chapter_title,
        class_id,
        count(*) AS answered,
        count(*) FILTER (WHERE NOT is_correct) AS wrong,
        CASE WHEN count(*) > 0
          THEN round((count(*) FILTER (WHERE NOT is_correct)::numeric * 1000.0) / count(*)::numeric) / 10.0
          ELSE 0.0
        END AS wrong_rate
      FROM raw_answers
      GROUP BY chapter_id, chapter_title, class_id
    ),
    total_summary AS (
      SELECT
        coalesce(sum(answered), 0)::int AS total_answered,
        coalesce(sum(wrong), 0)::int AS total_wrong
      FROM ch_agg
    ),
    filtered_topics AS (
      SELECT
        jsonb_build_object(
          'chapterId', chapter_id,
          'chapterTitle', chapter_title,
          'classId', class_id,
          'answered', answered,
          'wrong', wrong,
          'wrongRate', wrong_rate
        ) AS topic_obj
      FROM ch_agg
      WHERE answered >= v_min
      ORDER BY wrong_rate DESC, wrong DESC
      LIMIT v_limit
    )
    SELECT jsonb_build_object(
      'studentId', p_student_id,
      'topics', coalesce((SELECT jsonb_agg(topic_obj) FROM filtered_topics), '[]'::jsonb),
      'totalAnswered', (SELECT total_answered FROM total_summary),
      'totalWrong', (SELECT total_wrong FROM total_summary)
    ) INTO v_result;

    RETURN v_result;
  END IF;

  -- 2. Class overview mode (p_student_id IS NULL AND p_class_id IS NOT NULL)
  WITH raw_answers AS (
    SELECT
      sa.id AS answer_id,
      sa.is_correct,
      s.student_id,
      coalesce(p.full_name, p.username, s.student_id::text) AS student_name,
      c.id AS chapter_id,
      c.title AS chapter_title
    FROM public.submissions s
    JOIN public.profiles p ON p.id = s.student_id
    JOIN public.submission_answers sa ON sa.submission_id = s.id
    JOIN public.questions q ON q.id = sa.question_id
    JOIN public.homeworks h ON h.id = q.homework_id
    JOIN public.lessons l ON l.id = h.lesson_id
    JOIN public.chapters c ON c.id = l.chapter_id
    WHERE c.class_id = p_class_id
      AND s.student_id IS NOT NULL
  ),
  ch_class_agg AS (
    SELECT
      chapter_id,
      coalesce(chapter_title, 'Chương') AS chapter_title,
      count(*) AS answered,
      count(*) FILTER (WHERE NOT is_correct) AS wrong,
      CASE WHEN count(*) > 0
        THEN round((count(*) FILTER (WHERE NOT is_correct)::numeric * 1000.0) / count(*)::numeric) / 10.0
        ELSE 0.0
      END AS wrong_rate
    FROM raw_answers
    GROUP BY chapter_id, chapter_title
    HAVING count(*) >= v_min
    ORDER BY (CASE WHEN count(*) > 0 THEN round((count(*) FILTER (WHERE NOT is_correct)::numeric * 1000.0) / count(*)::numeric) / 10.0 ELSE 0.0 END) DESC,
             count(*) FILTER (WHERE NOT is_correct) DESC
    LIMIT v_limit
  ),
  stu_ch_agg AS (
    SELECT
      student_id,
      student_name,
      chapter_id,
      coalesce(chapter_title, 'Chương') AS chapter_title,
      count(*) AS answered,
      count(*) FILTER (WHERE NOT is_correct) AS wrong,
      CASE WHEN count(*) > 0
        THEN round((count(*) FILTER (WHERE NOT is_correct)::numeric * 1000.0) / count(*)::numeric) / 10.0
        ELSE 0.0
      END AS wrong_rate,
      ROW_NUMBER() OVER (
        PARTITION BY student_id
        ORDER BY (CASE WHEN count(*) > 0 THEN round((count(*) FILTER (WHERE NOT is_correct)::numeric * 1000.0) / count(*)::numeric) / 10.0 ELSE 0.0 END) DESC,
                 count(*) FILTER (WHERE NOT is_correct) DESC
      ) AS rn
    FROM raw_answers
    GROUP BY student_id, student_name, chapter_id, chapter_title
    HAVING count(*) >= v_min
  ),
  stu_summary AS (
    SELECT
      student_id,
      student_name,
      sum(answered)::int AS answered,
      sum(wrong)::int AS wrong,
      CASE WHEN sum(answered) > 0
        THEN round((sum(wrong)::numeric * 1000.0) / sum(answered)::numeric) / 10.0
        ELSE 0.0
      END AS wrong_rate,
      coalesce(
        jsonb_agg(
          jsonb_build_object(
            'chapterId', chapter_id,
            'chapterTitle', chapter_title,
            'answered', answered,
            'wrong', wrong,
            'wrongRate', wrong_rate
          ) ORDER BY wrong_rate DESC, wrong DESC
        ) FILTER (WHERE rn <= 3),
        '[]'::jsonb
      ) AS top_topics
    FROM stu_ch_agg
    GROUP BY student_id, student_name
  )
  SELECT jsonb_build_object(
    'classId', p_class_id,
    'chapters', coalesce((
      SELECT jsonb_agg(
        jsonb_build_object(
          'chapterId', chapter_id,
          'chapterTitle', chapter_title,
          'answered', answered,
          'wrong', wrong,
          'wrongRate', wrong_rate
        ) ORDER BY wrong_rate DESC, wrong DESC
      ) FROM ch_class_agg
    ), '[]'::jsonb),
    'students', coalesce((
      SELECT jsonb_agg(
        jsonb_build_object(
          'studentId', student_id,
          'name', student_name,
          'answered', answered,
          'wrong', wrong,
          'wrongRate', wrong_rate,
          'top', top_topics
        ) ORDER BY wrong_rate DESC, wrong DESC
      ) FROM stu_summary
    ), '[]'::jsonb)
  ) INTO v_result;

  RETURN v_result;
END;
$$;

-- Idempotent permissions
REVOKE ALL ON FUNCTION public.fn_weak_topics(uuid, uuid, int, int) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.fn_weak_topics(uuid, uuid, int, int) TO service_role;
