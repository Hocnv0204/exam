-- Legacy rows have no reliable session/attempt attribution. Keep them uncounted and
-- distinguish them by NULL session_id; never infer violations from action alone.
ALTER TABLE public.exam_logs
  ADD COLUMN IF NOT EXISTS session_id UUID REFERENCES public.exam_sessions(id) ON DELETE CASCADE,
  ADD COLUMN IF NOT EXISTS attempt_no INT,
  ADD COLUMN IF NOT EXISTS event_id TEXT,
  ADD COLUMN IF NOT EXISTS counted BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS reason TEXT,
  ADD COLUMN IF NOT EXISTS severity TEXT NOT NULL DEFAULT 'INFO',
  ADD COLUMN IF NOT EXISTS server_timestamp TIMESTAMPTZ NOT NULL DEFAULT NOW();

-- ADD COLUMN DEFAULT now() assigns migration time to existing rows; restore their
-- original chronology without assigning them to an attempt.
UPDATE public.exam_logs SET server_timestamp = created_at WHERE session_id IS NULL;

-- All exam events must pass the Edge Function and its session checks. The
-- original student INSERT policy would otherwise allow a direct PostgREST
-- write of counted=true, bypassing the serialized RPC and audit rules.
DROP POLICY IF EXISTS "Student insert own exam logs" ON public.exam_logs;
REVOKE INSERT, UPDATE, DELETE ON public.exam_logs FROM authenticated;

ALTER TABLE public.exam_sessions
  ADD COLUMN IF NOT EXISTS auto_submit_state TEXT NOT NULL DEFAULT 'READY',
  ADD COLUMN IF NOT EXISTS auto_submission_id UUID;
ALTER TABLE public.exam_sessions
  ADD CONSTRAINT exam_sessions_auto_submit_state_check
  CHECK (auto_submit_state IN ('READY', 'PENDING', 'CONFIRMED'));

CREATE INDEX IF NOT EXISTS idx_exam_logs_session_id ON public.exam_logs(session_id);
CREATE INDEX IF NOT EXISTS idx_exam_logs_session_counted ON public.exam_logs(session_id, counted);
CREATE INDEX IF NOT EXISTS idx_exam_logs_session_server_ts ON public.exam_logs(session_id, server_timestamp DESC);
CREATE INDEX IF NOT EXISTS idx_exam_logs_hw_session_attempt ON public.exam_logs(homework_id, session_id, attempt_no);
CREATE UNIQUE INDEX IF NOT EXISTS idx_exam_logs_session_event_id
  ON public.exam_logs(session_id, event_id) WHERE event_id IS NOT NULL;

-- Locking the session serializes concurrent events, token takeovers and threshold claims.
-- Only service_role may execute these RPCs (Edge Function performs user authorization).
CREATE OR REPLACE FUNCTION public.record_exam_event(
  p_homework_id UUID, p_student_id UUID, p_session_token TEXT,
  p_event_id TEXT, p_action TEXT, p_max_violations INT, p_session_id UUID DEFAULT NULL
) RETURNS TABLE(log_row JSONB, violation_count BIGINT, already_recorded BOOLEAN, session_id UUID)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE s public.exam_sessions%ROWTYPE;
        previous_time TIMESTAMPTZ;
        existing public.exam_logs%ROWTYPE;
        is_counted BOOLEAN;
        event_time TIMESTAMPTZ := clock_timestamp();
        debounce INTERVAL;
BEGIN
  SELECT * INTO s FROM public.exam_sessions
    WHERE homework_id = p_homework_id AND student_id = p_student_id
      AND status IN ('ACTIVE', 'SUBMITTED')
    ORDER BY (status = 'ACTIVE') DESC, created_at DESC LIMIT 1
    FOR UPDATE;
  IF NOT FOUND OR s.session_token <> p_session_token OR (p_session_id IS NOT NULL AND s.id <> p_session_id) THEN
    RAISE EXCEPTION 'INVALID_SESSION' USING ERRCODE = 'P0001';
  END IF;
  SELECT * INTO existing FROM public.exam_logs
    WHERE exam_logs.session_id = s.id AND event_id = p_event_id;
  already_recorded := FOUND;
  IF already_recorded THEN
    IF existing.action <> p_action THEN
      RAISE EXCEPTION 'EVENT_ID_CONFLICT' USING ERRCODE = 'P0001';
    END IF;
  ELSE
    IF s.status <> 'ACTIVE' THEN
      RAISE EXCEPTION 'INVALID_SESSION' USING ERRCODE = 'P0001';
    END IF;
    debounce := CASE WHEN p_action IN ('LEAVE_TAB', 'BLUR_TAB') THEN interval '3 seconds' ELSE interval '1 second' END;
    IF p_action IN ('LEAVE_TAB', 'BLUR_TAB') THEN
      SELECT max(server_timestamp) INTO previous_time FROM public.exam_logs
        WHERE exam_logs.session_id = s.id AND action IN ('LEAVE_TAB', 'BLUR_TAB');
    ELSE
      SELECT max(server_timestamp) INTO previous_time FROM public.exam_logs
        WHERE exam_logs.session_id = s.id AND action = p_action;
    END IF;
    is_counted := p_action IN ('LEAVE_TAB', 'BLUR_TAB', 'LEAVE_EXAM', 'DEVTOOLS', 'FULLSCREEN_EXIT')
      AND (previous_time IS NULL OR event_time - previous_time >= debounce);
    INSERT INTO public.exam_logs(homework_id, student_id, session_id, attempt_no, event_id,
      action, counted, reason, severity, server_timestamp)
    VALUES (p_homework_id, p_student_id, s.id, s.attempt_no, p_event_id, p_action, is_counted,
      CASE WHEN is_counted THEN 'Violation: ' || p_action
           WHEN p_action IN ('LEAVE_TAB', 'BLUR_TAB', 'LEAVE_EXAM', 'DEVTOOLS', 'FULLSCREEN_EXIT')
             THEN 'Deduplicated event: ' || p_action ELSE 'Non-penalized action' END,
      CASE WHEN is_counted THEN 'VIOLATION'
           WHEN p_action IN ('LEAVE_TAB', 'BLUR_TAB', 'LEAVE_EXAM', 'DEVTOOLS', 'FULLSCREEN_EXIT') THEN 'WARN'
           ELSE 'INFO' END, event_time)
    RETURNING * INTO existing;
  END IF;
  SELECT count(*) INTO violation_count FROM public.exam_logs
    WHERE exam_logs.session_id = s.id AND counted = true;
  log_row := to_jsonb(existing);
  session_id := s.id;
  RETURN NEXT;
END $$;

CREATE OR REPLACE FUNCTION public.claim_exam_auto_submit(
  p_session_id UUID, p_session_token TEXT, p_max_violations INT
) RETURNS BOOLEAN LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE updated_rows INT;
BEGIN
  UPDATE public.exam_sessions s SET auto_submit_state = 'PENDING'
    WHERE s.id = p_session_id AND s.session_token = p_session_token
      AND s.status = 'ACTIVE' AND s.auto_submit_state = 'READY'
      AND (SELECT count(*) FROM public.exam_logs l WHERE l.session_id = s.id AND l.counted) >= p_max_violations;
  GET DIAGNOSTICS updated_rows = ROW_COUNT;
  RETURN updated_rows = 1;
END $$;

REVOKE ALL ON FUNCTION public.record_exam_event(UUID, UUID, TEXT, TEXT, TEXT, INT, UUID) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.claim_exam_auto_submit(UUID, TEXT, INT) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.record_exam_event(UUID, UUID, TEXT, TEXT, TEXT, INT, UUID) TO service_role;
GRANT EXECUTE ON FUNCTION public.claim_exam_auto_submit(UUID, TEXT, INT) TO service_role;
