-- Apply after 20261030020000_standardize_exam_logs.sql and the essay migrations.
ALTER TABLE public.exam_sessions ADD COLUMN IF NOT EXISTS submission_fingerprint TEXT;
ALTER TABLE public.submissions ADD COLUMN IF NOT EXISTS exam_session_id UUID REFERENCES public.exam_sessions(id);
CREATE UNIQUE INDEX IF NOT EXISTS submissions_exam_session_unique ON public.submissions(exam_session_id) WHERE exam_session_id IS NOT NULL;

-- Serialize starts, reopens and repeated starts for this student/homework pair.
CREATE OR REPLACE FUNCTION public.init_exam_attempt(p_homework_id UUID, p_student_id UUID, p_token TEXT)
RETURNS JSONB LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE h public.homeworks%ROWTYPE; s public.exam_sessions%ROWTYPE; exam_class_id UUID; attempts INT; next_no INT; violations BIGINT;
BEGIN
  IF p_token IS NULL OR length(p_token) NOT BETWEEN 1 AND 255 THEN RAISE EXCEPTION 'INVALID_TOKEN'; END IF;
  PERFORM pg_advisory_xact_lock(hashtextextended(p_homework_id::text || ':' || p_student_id::text, 0));
  IF NOT EXISTS (SELECT 1 FROM public.profiles WHERE id = p_student_id AND role = 'STUDENT') THEN RAISE EXCEPTION 'FORBIDDEN'; END IF;
  SELECT * INTO h FROM public.homeworks WHERE id = p_homework_id;
  IF NOT FOUND OR h.type <> 'EXAM' OR NOT h.is_published THEN RAISE EXCEPTION 'INVALID_EXAM'; END IF;
  SELECT c.class_id INTO exam_class_id FROM public.lessons l JOIN public.chapters c ON c.id = l.chapter_id WHERE l.id = h.lesson_id;
  IF exam_class_id IS NULL OR NOT EXISTS (SELECT 1 FROM public.student_classes WHERE student_id = p_student_id AND student_classes.class_id = exam_class_id AND status = 'ACTIVE')
    OR (EXISTS (SELECT 1 FROM public.homework_targets WHERE homework_id = p_homework_id)
      AND NOT EXISTS (SELECT 1 FROM public.homework_targets WHERE homework_id = p_homework_id AND student_id = p_student_id)) THEN RAISE EXCEPTION 'FORBIDDEN'; END IF;
  SELECT * INTO s FROM public.exam_sessions WHERE homework_id = p_homework_id AND student_id = p_student_id AND status = 'ACTIVE' FOR UPDATE;
  IF FOUND THEN
    SELECT count(*) INTO violations FROM public.exam_logs WHERE session_id = s.id AND counted;
    IF s.session_token <> p_token THEN
      UPDATE public.exam_sessions SET session_token = p_token, last_heartbeat_at = clock_timestamp() WHERE id = s.id;
    ELSE
      UPDATE public.exam_sessions SET last_heartbeat_at = clock_timestamp() WHERE id = s.id;
    END IF;
    RETURN jsonb_build_object('success',true,'sessionId',s.id,'createdAt',s.created_at,'serverNow',clock_timestamp(),'deadlineAt',
      least(coalesce(h.deadline,'infinity'::timestamptz),s.created_at + h.duration_minutes * interval '1 minute'),
      'draftAnswers',s.draft_answers,'currentViolations',violations,
      'resumed',s.session_token = p_token,'takeover',s.session_token <> p_token);
  END IF;
  IF h.deadline IS NOT NULL AND clock_timestamp() >= h.deadline THEN RAISE EXCEPTION 'EXAM_EXPIRED'; END IF;
  SELECT count(*) INTO attempts FROM public.submissions WHERE homework_id = p_homework_id AND student_id = p_student_id AND status = 'SUBMITTED';
  SELECT coalesce(max(attempt_no),0) + 1 INTO next_no FROM public.exam_sessions WHERE homework_id = p_homework_id AND student_id = p_student_id;
  IF h.max_attempts > 0 AND attempts >= h.max_attempts THEN RAISE EXCEPTION 'ATTEMPT_LIMIT'; END IF;
  INSERT INTO public.exam_sessions(homework_id,student_id,session_token,status,attempt_no)
    VALUES(p_homework_id,p_student_id,p_token,'ACTIVE',next_no) RETURNING * INTO s;
  RETURN jsonb_build_object('success',true,'sessionId',s.id,'createdAt',s.created_at,'serverNow',clock_timestamp(),'deadlineAt',
    least(coalesce(h.deadline,'infinity'::timestamptz),s.created_at + h.duration_minutes * interval '1 minute'));
END $$;

-- An expired session cannot receive new answers, even through direct Edge calls.
CREATE OR REPLACE FUNCTION public.update_exam_attempt(p_homework_id UUID,p_student_id UUID,p_token TEXT,p_draft JSONB DEFAULT NULL)
RETURNS BOOLEAN LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE s public.exam_sessions%ROWTYPE; h public.homeworks%ROWTYPE;
BEGIN
  SELECT * INTO s FROM public.exam_sessions WHERE homework_id=p_homework_id AND student_id=p_student_id AND status='ACTIVE' FOR UPDATE;
  IF NOT FOUND OR s.session_token <> p_token THEN RETURN false; END IF;
  SELECT * INTO h FROM public.homeworks WHERE id=p_homework_id;
  IF h.type <> 'EXAM' OR NOT h.is_published OR clock_timestamp() >= least(coalesce(h.deadline,'infinity'::timestamptz),s.created_at + h.duration_minutes * interval '1 minute') THEN RETURN false; END IF;
  IF (SELECT count(*) FROM public.exam_logs WHERE session_id=s.id AND counted) >= greatest(1,coalesce(h.max_violations,3)) THEN RETURN false; END IF;
  IF p_draft IS NOT NULL AND jsonb_typeof(p_draft) <> 'array' THEN RAISE EXCEPTION 'INVALID_DRAFT'; END IF;
  UPDATE public.exam_sessions SET last_heartbeat_at=clock_timestamp(),draft_answers=coalesce(p_draft,s.draft_answers) WHERE id=s.id;
  RETURN true;
END $$;

CREATE OR REPLACE FUNCTION public.commit_exam_submission(
  p_homework_id UUID,p_student_id UUID,p_token TEXT,p_answers JSONB,p_rows JSONB,
  p_total NUMERIC,p_correct INT,p_wrong INT,p_duration INT,p_disqualified BOOLEAN DEFAULT false
) RETURNS JSONB LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE s public.exam_sessions%ROWTYPE; h public.homeworks%ROWTYPE; existing public.submissions%ROWTYPE;
  cutoff TIMESTAMPTZ; now_at TIMESTAMPTZ; fingerprint TEXT; saved_answers JSONB; row_count INT; violations BIGINT; disq BOOLEAN;
BEGIN
  SELECT * INTO s FROM public.exam_sessions WHERE homework_id=p_homework_id AND student_id=p_student_id
    AND session_token=p_token ORDER BY created_at DESC LIMIT 1 FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'INVALID_SESSION'; END IF;
  SELECT * INTO h FROM public.homeworks WHERE id=p_homework_id;
  IF NOT FOUND OR h.type <> 'EXAM' OR NOT h.is_published THEN RAISE EXCEPTION 'INVALID_EXAM'; END IF;
  IF s.status NOT IN ('ACTIVE','SUBMITTED') THEN RAISE EXCEPTION 'INVALID_SESSION'; END IF;
  now_at := clock_timestamp();
  cutoff := least(coalesce(h.deadline,'infinity'::timestamptz),s.created_at + h.duration_minutes * interval '1 minute');
  IF jsonb_typeof(p_answers) <> 'array' OR jsonb_typeof(p_rows) <> 'array' OR p_total < 0 OR p_total > h.max_score
    OR p_correct < 0 OR p_wrong < 0 OR p_duration < 0 THEN RAISE EXCEPTION 'INVALID_SUBMISSION'; END IF;
  fingerprint := md5(p_answers::text);
  SELECT * INTO existing FROM public.submissions WHERE exam_session_id=s.id;
  IF FOUND THEN
    IF s.submission_fingerprint IS DISTINCT FROM fingerprint THEN RAISE EXCEPTION 'SUBMISSION_CONFLICT'; END IF;
    RETURN jsonb_build_object('id',existing.id,'submitted_at',existing.submitted_at,'total_score',existing.total_score,'already_submitted',true,'disqualified',s.auto_submit_state='CONFIRMED','is_late',existing.is_late);
  END IF;
  -- Grace permits finishing the saved draft only, not answering more questions.
  IF now_at >= cutoff THEN
    IF now_at > cutoff + interval '90 seconds' THEN RAISE EXCEPTION 'EXAM_EXPIRED'; END IF;
    saved_answers := CASE WHEN jsonb_typeof(s.draft_answers)='array' THEN s.draft_answers ELSE '[]'::jsonb END;
    IF p_answers <> saved_answers THEN RAISE EXCEPTION 'EXAM_EXPIRED'; END IF;
  END IF;
  IF s.status <> 'ACTIVE' THEN RAISE EXCEPTION 'INVALID_SESSION'; END IF;
  IF NOT EXISTS (SELECT 1 FROM public.student_classes sc JOIN public.lessons l ON l.id=h.lesson_id
    JOIN public.chapters c ON c.id=l.chapter_id WHERE sc.student_id=p_student_id AND sc.class_id=c.class_id AND sc.status='ACTIVE')
    OR (EXISTS (SELECT 1 FROM public.homework_targets WHERE homework_id=p_homework_id)
      AND NOT EXISTS (SELECT 1 FROM public.homework_targets WHERE homework_id=p_homework_id AND student_id=p_student_id)) THEN RAISE EXCEPTION 'FORBIDDEN'; END IF;
  SELECT count(*) INTO violations FROM public.exam_logs WHERE session_id=s.id AND counted;
  disq := violations >= greatest(1,coalesce(h.max_violations,3));
  IF p_disqualified AND NOT disq THEN RAISE EXCEPTION 'INVALID_DISQUALIFICATION'; END IF;
  IF disq AND p_answers <> coalesce(CASE WHEN jsonb_typeof(s.draft_answers)='array' THEN s.draft_answers ELSE '[]'::jsonb END,'[]'::jsonb)
    THEN RAISE EXCEPTION 'SUBMISSION_CONFLICT'; END IF;
  SELECT count(*) INTO row_count FROM jsonb_array_elements(p_rows);
  IF row_count <> (SELECT count(*) FROM public.questions WHERE homework_id=p_homework_id)
    OR EXISTS (SELECT 1 FROM jsonb_array_elements(p_rows) r WHERE NOT EXISTS
      (SELECT 1 FROM public.questions q WHERE q.homework_id=p_homework_id AND q.id=(r->>'question_id')::uuid))
    OR (SELECT count(DISTINCT r->>'question_id') FROM jsonb_array_elements(p_rows) r) <> row_count
    THEN RAISE EXCEPTION 'INVALID_ANSWERS'; END IF;
  INSERT INTO public.submissions(homework_id,student_id,total_score,max_score,correct_count,wrong_count,
    duration_seconds_taken,is_late,is_trial,status,attempt_no,exam_session_id)
    VALUES(p_homework_id,p_student_id,p_total,h.max_score,p_correct,p_wrong,
      least(p_duration,greatest(0,extract(epoch FROM (now_at-s.created_at))::int)),now_at>cutoff,false,'SUBMITTED',s.attempt_no,s.id)
    RETURNING * INTO existing;
  INSERT INTO public.submission_answers(submission_id,question_id,given_answer,is_correct,score_earned,grading_status,teacher_feedback)
    SELECT existing.id,(r->>'question_id')::uuid,r->'given_answer',(r->>'is_correct')::boolean,
      (r->>'score_earned')::numeric,r->>'grading_status',r->>'teacher_feedback'
    FROM jsonb_array_elements(p_rows) r;
  UPDATE public.exam_sessions SET status='SUBMITTED', submission_fingerprint=fingerprint,
    auto_submit_state=CASE WHEN disq THEN 'CONFIRMED' ELSE auto_submit_state END,
    auto_submission_id=CASE WHEN disq THEN existing.id ELSE auto_submission_id END WHERE id=s.id;
  RETURN jsonb_build_object('id',existing.id,'submitted_at',existing.submitted_at,'total_score',existing.total_score,'already_submitted',false,'disqualified',disq,'is_late',existing.is_late);
END $$;

REVOKE ALL ON FUNCTION public.init_exam_attempt(UUID,UUID,TEXT) FROM PUBLIC,anon,authenticated;
REVOKE ALL ON FUNCTION public.update_exam_attempt(UUID,UUID,TEXT,JSONB) FROM PUBLIC,anon,authenticated;
REVOKE ALL ON FUNCTION public.commit_exam_submission(UUID,UUID,TEXT,JSONB,JSONB,NUMERIC,INT,INT,INT,BOOLEAN) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.init_exam_attempt(UUID,UUID,TEXT) TO service_role;
GRANT EXECUTE ON FUNCTION public.update_exam_attempt(UUID,UUID,TEXT,JSONB) TO service_role;
GRANT EXECUTE ON FUNCTION public.commit_exam_submission(UUID,UUID,TEXT,JSONB,JSONB,NUMERIC,INT,INT,INT,BOOLEAN) TO service_role;
