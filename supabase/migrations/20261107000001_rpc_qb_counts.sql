-- Migration: RPC for fast question bank aggregation and counts
-- Replaces sequential fetchAllQueryRows in check-availability, stats=true, and includeStats
-- GROUP BY counts are computed in-database with support for constant/dynamic taxonomy and filters

CREATE OR REPLACE FUNCTION public.fn_qb_counts(p_filters jsonb DEFAULT '{}'::jsonb)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
AS $$
DECLARE
  v_mode text;
  v_constant_only boolean;
  v_scope_type text;
  v_grade_block text;
  v_subject text;
  v_grade_level int;
  v_qb_type_id uuid;
  v_unassigned text;
  v_search text;
  v_restrict_type_pool boolean;
  v_extra_qtype text;
  v_extra_diff text;
  v_extra_chapter_id uuid;

  v_type_ids uuid[];
  v_untyped_lesson_ids uuid[];
  v_class_ids uuid[];
  v_chapter_ids uuid[];
  v_lesson_ids uuid[];
  v_filter_lesson_ids uuid[];
  v_tags text[];

  v_const_class_ids uuid[];
  v_const_chapter_ids uuid[];
  v_dyn_class_ids uuid[];
  v_dyn_chapter_ids uuid[];

  v_all_lesson_ids uuid[];
  v_all_chapter_ids uuid[];
  v_ch_ids_for_null_lesson uuid[];

  v_branch int := 0;
  v_empty_pool boolean := false;
  v_result jsonb;
BEGIN
  -- Determine mode: 'pool' vs 'stats'
  v_mode := lower(coalesce(p_filters->>'mode', ''));
  IF v_mode = '' THEN
    IF (p_filters ? 'scopeType') OR (p_filters ? 'typeIds') OR (p_filters ? 'constantOnly') THEN
      v_mode := 'pool';
    ELSE
      v_mode := 'stats';
    END IF;
  END IF;

  v_constant_only := coalesce((p_filters->>'constantOnly')::boolean, (p_filters->>'constant_only')::boolean, false);
  v_scope_type := upper(coalesce(p_filters->>'scopeType', p_filters->>'scope_type', ''));
  v_grade_block := coalesce(p_filters->>'gradeBlock', p_filters->>'grade_block');
  v_subject := coalesce(p_filters->>'subject', null);
  v_unassigned := coalesce(p_filters->>'unassigned', null);
  v_search := coalesce(p_filters->>'search', null);
  v_restrict_type_pool := coalesce((p_filters->>'restrictTypePoolToScope')::boolean, false);
  v_extra_qtype := p_filters->>'extraQuestionType';
  v_extra_diff := p_filters->>'extraDifficulty';

  IF p_filters ? 'gradeLevel' OR p_filters ? 'grade_level' THEN
    v_grade_level := coalesce((p_filters->>'gradeLevel')::int, (p_filters->>'grade_level')::int);
  END IF;

  IF (p_filters->>'qbQuestionTypeId') ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' THEN
    v_qb_type_id := (p_filters->>'qbQuestionTypeId')::uuid;
  END IF;

  IF (p_filters->>'extraChapterId') ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' THEN
    v_extra_chapter_id := (p_filters->>'extraChapterId')::uuid;
  END IF;

  -- Parse UUID arrays safely
  SELECT coalesce(array_agg(x::uuid), ARRAY[]::uuid[]) INTO v_type_ids
  FROM jsonb_array_elements_text(coalesce(p_filters->'typeIds', p_filters->'type_ids', '[]'::jsonb)) AS t(x)
  WHERE x ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$';

  SELECT coalesce(array_agg(x::uuid), ARRAY[]::uuid[]) INTO v_untyped_lesson_ids
  FROM jsonb_array_elements_text(coalesce(p_filters->'untypedLessonIds', p_filters->'untyped_lesson_ids', '[]'::jsonb)) AS t(x)
  WHERE x ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$';

  SELECT coalesce(array_agg(x::uuid), ARRAY[]::uuid[]) INTO v_class_ids
  FROM jsonb_array_elements_text(coalesce(p_filters->'classIds', p_filters->'class_ids', '[]'::jsonb)) AS t(x)
  WHERE x ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$';

  SELECT coalesce(array_agg(x::uuid), ARRAY[]::uuid[]) INTO v_chapter_ids
  FROM jsonb_array_elements_text(coalesce(p_filters->'chapterIds', p_filters->'chapter_ids', '[]'::jsonb)) AS t(x)
  WHERE x ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$';

  SELECT coalesce(array_agg(x::uuid), ARRAY[]::uuid[]) INTO v_lesson_ids
  FROM jsonb_array_elements_text(coalesce(p_filters->'lessonIds', p_filters->'lesson_ids', '[]'::jsonb)) AS t(x)
  WHERE x ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$';

  SELECT coalesce(array_agg(x::uuid), ARRAY[]::uuid[]) INTO v_filter_lesson_ids
  FROM jsonb_array_elements_text(coalesce(p_filters->'filterLessonIds', p_filters->'filter_lesson_ids', '[]'::jsonb)) AS t(x)
  WHERE x ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$';

  SELECT coalesce(array_agg(x), ARRAY[]::text[]) INTO v_tags
  FROM jsonb_array_elements_text(coalesce(p_filters->'tags', '[]'::jsonb)) AS t(x)
  WHERE btrim(x) <> '';

  -- Single IDs passed from stats query (e.g. lessonId, chapterId, classId)
  IF (p_filters->>'lessonId') ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' THEN
    v_lesson_ids := array_append(v_lesson_ids, (p_filters->>'lessonId')::uuid);
  END IF;
  IF (p_filters->>'chapterId') ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' THEN
    v_chapter_ids := array_append(v_chapter_ids, (p_filters->>'chapterId')::uuid);
  END IF;
  IF (p_filters->>'classId') ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' THEN
    v_class_ids := array_append(v_class_ids, (p_filters->>'classId')::uuid);
  END IF;

  IF v_mode = 'pool' THEN
    -- Branch 1: typeIds selected
    IF coalesce(cardinality(v_type_ids), 0) > 0 THEN
      v_branch := 1;

    -- Branch 2: Single level clause
    ELSIF (v_scope_type = 'LESSON' AND coalesce(cardinality(v_lesson_ids), 0) > 0)
       OR (v_scope_type = 'CHAPTER' AND coalesce(cardinality(v_chapter_ids), 0) > 0)
       OR (v_scope_type = 'CLASS' AND coalesce(cardinality(v_class_ids), 0) > 0) THEN
      v_branch := 2;

    -- Branch 3: Empty IDs
    ELSIF coalesce(cardinality(v_lesson_ids), 0) = 0 AND coalesce(cardinality(v_chapter_ids), 0) = 0 AND coalesce(cardinality(v_class_ids), 0) = 0 THEN
      IF v_scope_type = 'MULTI' THEN
        v_empty_pool := true;
      ELSIF v_grade_block IS NOT NULL AND v_grade_block <> '' THEN
        IF v_constant_only THEN
          SELECT coalesce(array_agg(id), ARRAY[]::uuid[]) INTO v_const_class_ids
          FROM public.qb_classes WHERE grade_block = v_grade_block;

          SELECT coalesce(array_agg(id), ARRAY[]::uuid[]) INTO v_const_chapter_ids
          FROM public.qb_chapters WHERE class_id = ANY(v_const_class_ids);

          IF coalesce(cardinality(v_const_class_ids), 0) = 0 AND coalesce(cardinality(v_const_chapter_ids), 0) = 0 THEN
            v_empty_pool := true;
          ELSE
            v_branch := 3;
          END IF;
        ELSE
          SELECT coalesce(array_agg(id), ARRAY[]::uuid[]) INTO v_dyn_class_ids
          FROM public.classes WHERE grade_block = v_grade_block;

          SELECT coalesce(array_agg(id), ARRAY[]::uuid[]) INTO v_dyn_chapter_ids
          FROM public.chapters WHERE class_id = ANY(v_dyn_class_ids);

          SELECT coalesce(array_agg(id), ARRAY[]::uuid[]) INTO v_const_class_ids
          FROM public.qb_classes WHERE grade_block = v_grade_block;

          SELECT coalesce(array_agg(id), ARRAY[]::uuid[]) INTO v_const_chapter_ids
          FROM public.qb_chapters WHERE class_id = ANY(v_const_class_ids);

          v_branch := 3;
        END IF;
      ELSE
        IF v_constant_only THEN
          v_empty_pool := true;
        ELSE
          v_branch := 3; -- all questions in bank
        END IF;
      END IF;

    -- Branch 4: MULTI / hierarchy expansion
    ELSE
      v_branch := 4;
      IF coalesce(cardinality(v_class_ids), 0) > 0 THEN
        IF v_constant_only THEN
          SELECT coalesce(array_agg(id), ARRAY[]::uuid[]) INTO v_const_chapter_ids
          FROM public.qb_chapters WHERE class_id = ANY(v_class_ids);
          v_all_chapter_ids := ARRAY(SELECT DISTINCT unnest(v_chapter_ids || v_const_chapter_ids));
        ELSE
          SELECT coalesce(array_agg(id), ARRAY[]::uuid[]) INTO v_dyn_chapter_ids FROM (
            SELECT id FROM public.chapters WHERE class_id = ANY(v_class_ids)
            UNION
            SELECT id FROM public.qb_chapters WHERE class_id = ANY(v_class_ids)
          ) u;
          v_all_chapter_ids := ARRAY(SELECT DISTINCT unnest(v_chapter_ids || v_dyn_chapter_ids));
        END IF;
      ELSE
        v_all_chapter_ids := v_chapter_ids;
      END IF;

      IF coalesce(cardinality(v_all_chapter_ids), 0) > 0 THEN
        IF v_constant_only THEN
          SELECT coalesce(array_agg(id), ARRAY[]::uuid[]) INTO v_const_class_ids
          FROM public.qb_lessons WHERE chapter_id = ANY(v_all_chapter_ids);
          v_all_lesson_ids := ARRAY(SELECT DISTINCT unnest(v_lesson_ids || v_const_class_ids));
        ELSE
          SELECT coalesce(array_agg(id), ARRAY[]::uuid[]) INTO v_dyn_class_ids FROM (
            SELECT id FROM public.lessons WHERE chapter_id = ANY(v_all_chapter_ids)
            UNION
            SELECT id FROM public.qb_lessons WHERE chapter_id = ANY(v_all_chapter_ids)
          ) u;
          v_all_lesson_ids := ARRAY(SELECT DISTINCT unnest(v_lesson_ids || v_dyn_class_ids));
        END IF;
      ELSE
        v_all_lesson_ids := v_lesson_ids;
      END IF;

      IF coalesce(cardinality(v_chapter_ids), 0) > 0 THEN
        v_ch_ids_for_null_lesson := v_chapter_ids;
      ELSE
        v_ch_ids_for_null_lesson := v_all_chapter_ids;
      END IF;
    END IF;

  ELSE
    -- Mode = 'stats'
    v_branch := 5;
    IF v_grade_block IS NOT NULL AND v_grade_block <> '' AND coalesce(cardinality(v_filter_lesson_ids), 0) = 0 AND coalesce(cardinality(v_lesson_ids), 0) = 0 AND coalesce(cardinality(v_chapter_ids), 0) = 0 AND coalesce(cardinality(v_class_ids), 0) = 0 THEN
      SELECT coalesce(array_agg(id), ARRAY[]::uuid[]) INTO v_dyn_class_ids FROM (
        SELECT id FROM public.classes WHERE grade_block = v_grade_block
        UNION
        SELECT id FROM public.qb_classes WHERE grade_block = v_grade_block
      ) u;

      SELECT coalesce(array_agg(id), ARRAY[]::uuid[]) INTO v_dyn_chapter_ids FROM (
        SELECT id FROM public.chapters WHERE class_id = ANY(v_dyn_class_ids)
        UNION
        SELECT id FROM public.qb_chapters WHERE class_id = ANY(v_dyn_class_ids)
      ) u;
    END IF;
  END IF;

  -- Empty pool fallback
  IF v_empty_pool THEN
    RETURN jsonb_build_object(
      'total', 0,
      'mc', 0,
      'tf', 0,
      'sa', 0,
      'byDifficulty', jsonb_build_object('NHAN_BIET', 0, 'THONG_HIEU', 0, 'VAN_DUNG', 0, 'VAN_DUNG_CAO', 0),
      'diffCounts', jsonb_build_object('NHAN_BIET', 0, 'THONG_HIEU', 0, 'VAN_DUNG', 0, 'VAN_DUNG_CAO', 0),
      'byTypeAndDifficulty', jsonb_build_object(
        'MULTIPLE_CHOICE', jsonb_build_object('NHAN_BIET', 0, 'THONG_HIEU', 0, 'VAN_DUNG', 0, 'VAN_DUNG_CAO', 0),
        'TRUE_FALSE', jsonb_build_object('NHAN_BIET', 0, 'THONG_HIEU', 0, 'VAN_DUNG', 0, 'VAN_DUNG_CAO', 0),
        'SHORT_ANSWER', jsonb_build_object('NHAN_BIET', 0, 'THONG_HIEU', 0, 'VAN_DUNG', 0, 'VAN_DUNG_CAO', 0)
      ),
      'byChapter', '{}'::jsonb,
      'byLesson', '{}'::jsonb
    );
  END IF;

  WITH matched AS (
    SELECT
      id,
      question_type,
      difficulty,
      coalesce(qb_chapter_id, chapter_id) AS effective_chapter_id,
      coalesce(qb_lesson_id, lesson_id) AS effective_lesson_id
    FROM public.question_bank
    WHERE
      (coalesce(cardinality(v_tags), 0) = 0 OR tags @> v_tags)
      AND (v_extra_qtype IS NULL OR question_type::text = v_extra_qtype)
      AND (v_extra_diff IS NULL OR difficulty = v_extra_diff)
      AND (v_extra_chapter_id IS NULL OR (
        CASE WHEN v_constant_only THEN qb_chapter_id = v_extra_chapter_id
             ELSE (qb_chapter_id = v_extra_chapter_id OR chapter_id = v_extra_chapter_id)
        END
      ))
      AND (
        -- Branch 1: typeIds
        (v_branch = 1 AND (
          CASE
            WHEN v_restrict_type_pool THEN
              (
                (coalesce(cardinality(v_lesson_ids), 0) > 0 AND qb_question_type_id = ANY(v_type_ids) AND qb_lesson_id = ANY(v_lesson_ids))
                OR (coalesce(cardinality(v_chapter_ids), 0) > 0 AND qb_question_type_id = ANY(v_type_ids) AND qb_chapter_id = ANY(v_chapter_ids))
                OR (coalesce(cardinality(v_class_ids), 0) > 0 AND qb_question_type_id = ANY(v_type_ids) AND qb_class_id = ANY(v_class_ids))
                OR (coalesce(cardinality(v_lesson_ids), 0) = 0 AND coalesce(cardinality(v_chapter_ids), 0) = 0 AND coalesce(cardinality(v_class_ids), 0) = 0 AND qb_question_type_id = ANY(v_type_ids))
                OR (coalesce(cardinality(v_untyped_lesson_ids), 0) > 0 AND qb_lesson_id = ANY(v_untyped_lesson_ids))
              )
            ELSE
              (qb_question_type_id = ANY(v_type_ids) OR (coalesce(cardinality(v_untyped_lesson_ids), 0) > 0 AND qb_lesson_id = ANY(v_untyped_lesson_ids)))
          END
        ))
        -- Branch 2: Single level
        OR (v_branch = 2 AND (
          CASE v_scope_type
            WHEN 'LESSON' THEN (CASE WHEN v_constant_only THEN qb_lesson_id = ANY(v_lesson_ids) ELSE (qb_lesson_id = ANY(v_lesson_ids) OR lesson_id = ANY(v_lesson_ids)) END)
            WHEN 'CHAPTER' THEN (CASE WHEN v_constant_only THEN qb_chapter_id = ANY(v_chapter_ids) ELSE (qb_chapter_id = ANY(v_chapter_ids) OR chapter_id = ANY(v_chapter_ids)) END)
            WHEN 'CLASS' THEN (CASE WHEN v_constant_only THEN qb_class_id = ANY(v_class_ids) ELSE (qb_class_id = ANY(v_class_ids) OR class_id = ANY(v_class_ids)) END)
          END
        ))
        -- Branch 3: Empty IDs (Grade block)
        OR (v_branch = 3 AND (
          CASE
            WHEN v_grade_block IS NOT NULL AND v_grade_block <> '' THEN
              (CASE WHEN v_constant_only
                 THEN (qb_class_id = ANY(v_const_class_ids) OR qb_chapter_id = ANY(v_const_chapter_ids))
                 ELSE (grade_block = v_grade_block OR class_id = ANY(v_dyn_class_ids) OR qb_class_id = ANY(v_const_class_ids) OR chapter_id = ANY(v_dyn_chapter_ids) OR qb_chapter_id = ANY(v_const_chapter_ids))
               END)
            ELSE
              (NOT v_constant_only)
          END
        ))
        -- Branch 4: Multi / hierarchy expansion
        OR (v_branch = 4 AND (
          (coalesce(cardinality(v_all_lesson_ids), 0) > 0 AND (CASE WHEN v_constant_only THEN qb_lesson_id = ANY(v_all_lesson_ids) ELSE (qb_lesson_id = ANY(v_all_lesson_ids) OR lesson_id = ANY(v_all_lesson_ids)) END))
          OR (coalesce(cardinality(v_ch_ids_for_null_lesson), 0) > 0 AND (CASE WHEN v_constant_only THEN (qb_chapter_id = ANY(v_ch_ids_for_null_lesson) AND qb_lesson_id IS NULL) ELSE ((qb_chapter_id = ANY(v_ch_ids_for_null_lesson) AND qb_lesson_id IS NULL) OR (chapter_id = ANY(v_ch_ids_for_null_lesson) AND lesson_id IS NULL)) END))
          OR (coalesce(cardinality(v_class_ids), 0) > 0 AND (CASE WHEN v_constant_only THEN (qb_class_id = ANY(v_class_ids) AND qb_chapter_id IS NULL AND qb_lesson_id IS NULL) ELSE ((qb_class_id = ANY(v_class_ids) AND qb_chapter_id IS NULL AND qb_lesson_id IS NULL) OR (class_id = ANY(v_class_ids) AND chapter_id IS NULL AND lesson_id IS NULL)) END))
        ))
        -- Branch 5: Stats mode
        OR (v_branch = 5 AND (
          (v_subject IS NULL OR v_subject = '' OR subject = v_subject)
          AND (v_grade_level IS NULL OR grade_level = v_grade_level)
          AND (v_qb_type_id IS NULL OR qb_question_type_id = v_qb_type_id)
          AND (
            CASE v_unassigned
              WHEN 'no_class' THEN (class_id IS NULL AND qb_class_id IS NULL)
              WHEN 'no_chapter' THEN (chapter_id IS NULL AND qb_chapter_id IS NULL)
              WHEN 'no_lesson' THEN (lesson_id IS NULL AND qb_lesson_id IS NULL)
              ELSE true
            END
          )
          AND (
            CASE
              WHEN coalesce(cardinality(v_filter_lesson_ids), 0) > 0 THEN (qb_lesson_id = ANY(v_filter_lesson_ids) OR lesson_id = ANY(v_filter_lesson_ids))
              WHEN coalesce(cardinality(v_lesson_ids), 0) > 0 THEN (qb_lesson_id = ANY(v_lesson_ids) OR lesson_id = ANY(v_lesson_ids))
              WHEN coalesce(cardinality(v_chapter_ids), 0) > 0 THEN (qb_chapter_id = ANY(v_chapter_ids) OR chapter_id = ANY(v_chapter_ids))
              WHEN coalesce(cardinality(v_class_ids), 0) > 0 THEN (qb_class_id = ANY(v_class_ids) OR class_id = ANY(v_class_ids))
              WHEN v_grade_block IS NOT NULL AND v_grade_block <> '' THEN
                (grade_block = v_grade_block OR class_id = ANY(v_dyn_class_ids) OR qb_class_id = ANY(v_dyn_class_ids) OR chapter_id = ANY(v_dyn_chapter_ids) OR qb_chapter_id = ANY(v_dyn_chapter_ids))
              ELSE true
            END
          )
          AND (v_search IS NULL OR btrim(v_search) = '' OR (prompt->>'text') ILIKE ('%' || btrim(v_search) || '%'))
        ))
      )
  ),
  ch_agg AS (
    SELECT
      effective_chapter_id::text AS ch_id,
      count(*) AS ch_total,
      count(*) FILTER (WHERE question_type::text = 'MULTIPLE_CHOICE') AS ch_mc,
      count(*) FILTER (WHERE question_type::text = 'TRUE_FALSE') AS ch_tf,
      count(*) FILTER (WHERE question_type::text = 'SHORT_ANSWER') AS ch_sa
    FROM matched
    WHERE effective_chapter_id IS NOT NULL
    GROUP BY effective_chapter_id
  ),
  ls_agg AS (
    SELECT
      effective_lesson_id::text AS ls_id,
      count(*) AS ls_total,
      count(*) FILTER (WHERE question_type::text = 'MULTIPLE_CHOICE') AS ls_mc,
      count(*) FILTER (WHERE question_type::text = 'TRUE_FALSE') AS ls_tf,
      count(*) FILTER (WHERE question_type::text = 'SHORT_ANSWER') AS ls_sa
    FROM matched
    WHERE effective_lesson_id IS NOT NULL
    GROUP BY effective_lesson_id
  )
  SELECT jsonb_build_object(
    'total', coalesce((SELECT count(*) FROM matched), 0),
    'mc', coalesce((SELECT count(*) FILTER (WHERE question_type::text = 'MULTIPLE_CHOICE') FROM matched), 0),
    'tf', coalesce((SELECT count(*) FILTER (WHERE question_type::text = 'TRUE_FALSE') FROM matched), 0),
    'sa', coalesce((SELECT count(*) FILTER (WHERE question_type::text = 'SHORT_ANSWER') FROM matched), 0),
    'byDifficulty', jsonb_build_object(
      'NHAN_BIET', coalesce((SELECT count(*) FILTER (WHERE difficulty = 'NHAN_BIET') FROM matched), 0),
      'THONG_HIEU', coalesce((SELECT count(*) FILTER (WHERE difficulty = 'THONG_HIEU') FROM matched), 0),
      'VAN_DUNG', coalesce((SELECT count(*) FILTER (WHERE difficulty = 'VAN_DUNG') FROM matched), 0),
      'VAN_DUNG_CAO', coalesce((SELECT count(*) FILTER (WHERE difficulty = 'VAN_DUNG_CAO') FROM matched), 0)
    ),
    'diffCounts', jsonb_build_object(
      'NHAN_BIET', coalesce((SELECT count(*) FILTER (WHERE difficulty = 'NHAN_BIET') FROM matched), 0),
      'THONG_HIEU', coalesce((SELECT count(*) FILTER (WHERE difficulty = 'THONG_HIEU') FROM matched), 0),
      'VAN_DUNG', coalesce((SELECT count(*) FILTER (WHERE difficulty = 'VAN_DUNG') FROM matched), 0),
      'VAN_DUNG_CAO', coalesce((SELECT count(*) FILTER (WHERE difficulty = 'VAN_DUNG_CAO') FROM matched), 0)
    ),
    'byTypeAndDifficulty', jsonb_build_object(
      'MULTIPLE_CHOICE', jsonb_build_object(
        'NHAN_BIET', coalesce((SELECT count(*) FILTER (WHERE question_type::text = 'MULTIPLE_CHOICE' AND difficulty = 'NHAN_BIET') FROM matched), 0),
        'THONG_HIEU', coalesce((SELECT count(*) FILTER (WHERE question_type::text = 'MULTIPLE_CHOICE' AND difficulty = 'THONG_HIEU') FROM matched), 0),
        'VAN_DUNG', coalesce((SELECT count(*) FILTER (WHERE question_type::text = 'MULTIPLE_CHOICE' AND difficulty = 'VAN_DUNG') FROM matched), 0),
        'VAN_DUNG_CAO', coalesce((SELECT count(*) FILTER (WHERE question_type::text = 'MULTIPLE_CHOICE' AND difficulty = 'VAN_DUNG_CAO') FROM matched), 0)
      ),
      'TRUE_FALSE', jsonb_build_object(
        'NHAN_BIET', coalesce((SELECT count(*) FILTER (WHERE question_type::text = 'TRUE_FALSE' AND difficulty = 'NHAN_BIET') FROM matched), 0),
        'THONG_HIEU', coalesce((SELECT count(*) FILTER (WHERE question_type::text = 'TRUE_FALSE' AND difficulty = 'THONG_HIEU') FROM matched), 0),
        'VAN_DUNG', coalesce((SELECT count(*) FILTER (WHERE question_type::text = 'TRUE_FALSE' AND difficulty = 'VAN_DUNG') FROM matched), 0),
        'VAN_DUNG_CAO', coalesce((SELECT count(*) FILTER (WHERE question_type::text = 'TRUE_FALSE' AND difficulty = 'VAN_DUNG_CAO') FROM matched), 0)
      ),
      'SHORT_ANSWER', jsonb_build_object(
        'NHAN_BIET', coalesce((SELECT count(*) FILTER (WHERE question_type::text = 'SHORT_ANSWER' AND difficulty = 'NHAN_BIET') FROM matched), 0),
        'THONG_HIEU', coalesce((SELECT count(*) FILTER (WHERE question_type::text = 'SHORT_ANSWER' AND difficulty = 'THONG_HIEU') FROM matched), 0),
        'VAN_DUNG', coalesce((SELECT count(*) FILTER (WHERE question_type::text = 'SHORT_ANSWER' AND difficulty = 'VAN_DUNG') FROM matched), 0),
        'VAN_DUNG_CAO', coalesce((SELECT count(*) FILTER (WHERE question_type::text = 'SHORT_ANSWER' AND difficulty = 'VAN_DUNG_CAO') FROM matched), 0)
      )
    ),
    'byChapter', coalesce((
      SELECT jsonb_object_agg(ch_id, jsonb_build_object(
        'total', ch_total,
        'mc', ch_mc,
        'tf', ch_tf,
        'sa', ch_sa
      )) FROM ch_agg
    ), '{}'::jsonb),
    'byLesson', coalesce((
      SELECT jsonb_object_agg(ls_id, jsonb_build_object(
        'total', ls_total,
        'mc', ls_mc,
        'tf', ls_tf,
        'sa', ls_sa
      )) FROM ls_agg
    ), '{}'::jsonb)
  ) INTO v_result;

  RETURN v_result;
END;
$$;

-- Idempotent permissions
REVOKE ALL ON FUNCTION public.fn_qb_counts(jsonb) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.fn_qb_counts(jsonb) TO service_role;
