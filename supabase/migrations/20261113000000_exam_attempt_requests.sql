-- Yêu cầu thêm lượt thi EXAM (specs/002-exam-attempt-request).
-- Học sinh hết lượt gửi yêu cầu; admin duyệt qua bot Telegram. Duyệt = cấp 1 lượt CHỜ DÙNG:
-- hạn mức hiệu lực = homeworks.max_attempts + số yêu cầu APPROVED. Phiên thi (và đồng hồ) chỉ
-- được tạo khi học sinh bấm "Bắt đầu làm bài" (init_exam_attempt), không tạo lúc duyệt.
-- Apply after 20261031000000_allow_late_exam_attempts.sql.

CREATE TABLE IF NOT EXISTS public.exam_attempt_requests (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  homework_id UUID NOT NULL REFERENCES public.homeworks(id) ON DELETE CASCADE,
  student_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  status TEXT NOT NULL DEFAULT 'PENDING' CHECK (status IN ('PENDING', 'APPROVED', 'REJECTED')),
  requested_at TIMESTAMPTZ NOT NULL DEFAULT clock_timestamp(),
  decided_at TIMESTAMPTZ,
  decided_by_telegram_id BIGINT,
  decided_by_name TEXT CHECK (decided_by_name IS NULL OR length(decided_by_name) <= 200),
  telegram_chat_id TEXT CHECK (telegram_chat_id IS NULL OR length(telegram_chat_id) <= 64),
  telegram_message_id BIGINT,
  CONSTRAINT exam_attempt_requests_decision_consistent CHECK (
    (status = 'PENDING' AND decided_at IS NULL)
    OR (status <> 'PENDING' AND decided_at IS NOT NULL)
  )
);

-- Tối đa 1 yêu cầu đang chờ cho mỗi (bài, học sinh).
CREATE UNIQUE INDEX IF NOT EXISTS idx_exam_attempt_requests_one_pending
  ON public.exam_attempt_requests (homework_id, student_id) WHERE status = 'PENDING';
CREATE INDEX IF NOT EXISTS idx_exam_attempt_requests_lookup
  ON public.exam_attempt_requests (homework_id, student_id, requested_at DESC);

ALTER TABLE public.exam_attempt_requests ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.exam_attempt_requests FROM PUBLIC, anon, authenticated;
GRANT ALL ON public.exam_attempt_requests TO service_role;

-- Hạn mức hiệu lực: 0 = không giới hạn (giữ ngữ nghĩa max_attempts <= 0 / NULL của init_exam_attempt).
CREATE OR REPLACE FUNCTION public.exam_attempt_allowance(p_homework_id UUID, p_student_id UUID)
RETURNS INT LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT coalesce((
    SELECT CASE WHEN coalesce(h.max_attempts, 0) <= 0 THEN 0
      ELSE h.max_attempts + (
        SELECT count(*)::int FROM public.exam_attempt_requests r
        WHERE r.homework_id = p_homework_id AND r.student_id = p_student_id AND r.status = 'APPROVED')
    END
    FROM public.homeworks h WHERE h.id = p_homework_id), 0)
$$;

-- Học sinh gửi yêu cầu. Mọi điều kiện kiểm ở máy chủ, dưới cùng advisory lock với init_exam_attempt.
CREATE OR REPLACE FUNCTION public.request_exam_attempt(p_homework_id UUID, p_student_id UUID)
RETURNS JSONB LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE h public.homeworks%ROWTYPE; exam_class_id UUID; attempts INT; allowance INT; today_count INT;
  vn_day_start TIMESTAMPTZ; r public.exam_attempt_requests%ROWTYPE;
BEGIN
  PERFORM pg_advisory_xact_lock(hashtextextended(p_homework_id::text || ':' || p_student_id::text, 0));
  IF NOT EXISTS (SELECT 1 FROM public.profiles WHERE id = p_student_id AND role = 'STUDENT') THEN RAISE EXCEPTION 'FORBIDDEN'; END IF;
  SELECT * INTO h FROM public.homeworks WHERE id = p_homework_id;
  IF NOT FOUND OR h.type <> 'EXAM' OR NOT h.is_published THEN RAISE EXCEPTION 'INVALID_EXAM'; END IF;
  SELECT c.class_id INTO exam_class_id FROM public.lessons l JOIN public.chapters c ON c.id = l.chapter_id WHERE l.id = h.lesson_id;
  IF exam_class_id IS NULL OR NOT EXISTS (SELECT 1 FROM public.student_classes WHERE student_id = p_student_id AND student_classes.class_id = exam_class_id AND status = 'ACTIVE')
    OR (EXISTS (SELECT 1 FROM public.homework_targets WHERE homework_id = p_homework_id)
      AND NOT EXISTS (SELECT 1 FROM public.homework_targets WHERE homework_id = p_homework_id AND student_id = p_student_id)) THEN RAISE EXCEPTION 'FORBIDDEN'; END IF;
  -- Đang có phiên thi ACTIVE (vd admin vừa "Khôi phục bài thi") → vào thi được, không cần yêu cầu.
  IF EXISTS (SELECT 1 FROM public.exam_sessions WHERE homework_id = p_homework_id AND student_id = p_student_id AND status = 'ACTIVE') THEN
    RAISE EXCEPTION 'NOT_AT_LIMIT';
  END IF;
  allowance := public.exam_attempt_allowance(p_homework_id, p_student_id);
  SELECT count(*) INTO attempts FROM public.submissions WHERE homework_id = p_homework_id AND student_id = p_student_id AND status = 'SUBMITTED';
  IF allowance <= 0 OR attempts < allowance THEN RAISE EXCEPTION 'NOT_AT_LIMIT'; END IF;
  IF EXISTS (SELECT 1 FROM public.exam_attempt_requests WHERE homework_id = p_homework_id AND student_id = p_student_id AND status = 'PENDING') THEN
    RAISE EXCEPTION 'REQUEST_PENDING';
  END IF;
  -- Giới hạn 3 yêu cầu/ngày theo giờ Việt Nam.
  vn_day_start := date_trunc('day', clock_timestamp() AT TIME ZONE 'Asia/Ho_Chi_Minh') AT TIME ZONE 'Asia/Ho_Chi_Minh';
  SELECT count(*) INTO today_count FROM public.exam_attempt_requests
    WHERE homework_id = p_homework_id AND student_id = p_student_id AND requested_at >= vn_day_start;
  IF today_count >= 3 THEN RAISE EXCEPTION 'REQUEST_DAILY_LIMIT'; END IF;
  INSERT INTO public.exam_attempt_requests (homework_id, student_id) VALUES (p_homework_id, p_student_id) RETURNING * INTO r;
  RETURN jsonb_build_object('success', true, 'requestId', r.id, 'status', r.status, 'requestedAt', r.requested_at,
    'attemptsUsed', attempts, 'allowance', allowance, 'remainingToday', 3 - today_count - 1);
END $$;

-- Admin (qua bot) quyết định. Idempotent: chỉ chuyển từ PENDING; bấm lại / Telegram gửi lại update
-- trả trạng thái hiện tại với alreadyDecided = true, không cấp thêm lượt lần 2.
-- Duyệt kiểm lại điều kiện tại thời điểm quyết định: bài không còn là EXAM đã xuất bản, hoặc học sinh
-- không còn được giao bài → tự chuyển REJECTED (notEligible = true) để yêu cầu không kẹt PENDING.
CREATE OR REPLACE FUNCTION public.decide_exam_attempt_request(
  p_request_id UUID, p_approve BOOLEAN, p_decider_telegram_id BIGINT, p_decider_name TEXT
) RETURNS JSONB LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE r public.exam_attempt_requests%ROWTYPE; h public.homeworks%ROWTYPE; exam_class_id UUID; eligible BOOLEAN := true; approve BOOLEAN;
BEGIN
  IF p_approve IS NULL THEN RAISE EXCEPTION 'INVALID_DECISION'; END IF;
  SELECT * INTO r FROM public.exam_attempt_requests WHERE id = p_request_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'REQUEST_NOT_FOUND'; END IF;
  -- Cùng khoá với init/request: không xen giữa lúc học sinh đang bắt đầu thi.
  PERFORM pg_advisory_xact_lock(hashtextextended(r.homework_id::text || ':' || r.student_id::text, 0));
  approve := p_approve;
  IF approve THEN
    SELECT * INTO h FROM public.homeworks WHERE id = r.homework_id;
    IF NOT FOUND OR h.type <> 'EXAM' OR NOT h.is_published THEN eligible := false; END IF;
    IF eligible THEN
      SELECT c.class_id INTO exam_class_id FROM public.lessons l JOIN public.chapters c ON c.id = l.chapter_id WHERE l.id = h.lesson_id;
      IF NOT EXISTS (SELECT 1 FROM public.profiles WHERE id = r.student_id AND role = 'STUDENT')
        OR exam_class_id IS NULL
        OR NOT EXISTS (SELECT 1 FROM public.student_classes WHERE student_id = r.student_id AND student_classes.class_id = exam_class_id AND status = 'ACTIVE')
        OR (EXISTS (SELECT 1 FROM public.homework_targets WHERE homework_id = r.homework_id)
          AND NOT EXISTS (SELECT 1 FROM public.homework_targets WHERE homework_id = r.homework_id AND student_id = r.student_id)) THEN
        eligible := false;
      END IF;
    END IF;
    IF NOT eligible THEN approve := false; END IF;
  END IF;
  UPDATE public.exam_attempt_requests
    SET status = CASE WHEN approve THEN 'APPROVED' ELSE 'REJECTED' END,
        decided_at = clock_timestamp(),
        decided_by_telegram_id = p_decider_telegram_id,
        decided_by_name = left(coalesce(p_decider_name, ''), 200)
    WHERE id = p_request_id AND status = 'PENDING'
    RETURNING * INTO r;
  IF FOUND THEN
    RETURN jsonb_build_object('success', true, 'alreadyDecided', false, 'notEligible', NOT eligible, 'requestId', r.id, 'status', r.status,
      'homeworkId', r.homework_id, 'studentId', r.student_id, 'decidedAt', r.decided_at, 'decidedByName', r.decided_by_name);
  END IF;
  SELECT * INTO r FROM public.exam_attempt_requests WHERE id = p_request_id;
  RETURN jsonb_build_object('success', true, 'alreadyDecided', true, 'requestId', r.id, 'status', r.status,
    'homeworkId', r.homework_id, 'studentId', r.student_id, 'decidedAt', r.decided_at,
    'decidedByName', r.decided_by_name, 'notEligible', false);
END $$;

-- Trạng thái yêu cầu của CHÍNH học sinh cho 1 bài; kiểm quyền như init/request (chống dò bài lớp khác).
CREATE OR REPLACE FUNCTION public.get_exam_attempt_request_status(p_homework_id UUID, p_student_id UUID)
RETURNS JSONB LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE h public.homeworks%ROWTYPE; exam_class_id UUID; r public.exam_attempt_requests%ROWTYPE; today_count INT; attempts INT;
  vn_day_start TIMESTAMPTZ;
BEGIN
  IF NOT EXISTS (SELECT 1 FROM public.profiles WHERE id = p_student_id AND role = 'STUDENT') THEN RAISE EXCEPTION 'FORBIDDEN'; END IF;
  SELECT * INTO h FROM public.homeworks WHERE id = p_homework_id;
  IF NOT FOUND OR h.type <> 'EXAM' OR NOT h.is_published THEN RAISE EXCEPTION 'INVALID_EXAM'; END IF;
  SELECT c.class_id INTO exam_class_id FROM public.lessons l JOIN public.chapters c ON c.id = l.chapter_id WHERE l.id = h.lesson_id;
  IF exam_class_id IS NULL OR NOT EXISTS (SELECT 1 FROM public.student_classes WHERE student_id = p_student_id AND student_classes.class_id = exam_class_id AND status = 'ACTIVE')
    OR (EXISTS (SELECT 1 FROM public.homework_targets WHERE homework_id = p_homework_id)
      AND NOT EXISTS (SELECT 1 FROM public.homework_targets WHERE homework_id = p_homework_id AND student_id = p_student_id)) THEN RAISE EXCEPTION 'FORBIDDEN'; END IF;
  SELECT * INTO r FROM public.exam_attempt_requests WHERE homework_id = p_homework_id AND student_id = p_student_id ORDER BY requested_at DESC LIMIT 1;
  vn_day_start := date_trunc('day', clock_timestamp() AT TIME ZONE 'Asia/Ho_Chi_Minh') AT TIME ZONE 'Asia/Ho_Chi_Minh';
  SELECT count(*) INTO today_count FROM public.exam_attempt_requests WHERE homework_id = p_homework_id AND student_id = p_student_id AND requested_at >= vn_day_start;
  SELECT count(*) INTO attempts FROM public.submissions WHERE homework_id = p_homework_id AND student_id = p_student_id AND status = 'SUBMITTED';
  RETURN jsonb_build_object(
    'latest', CASE WHEN r.id IS NULL THEN NULL ELSE jsonb_build_object('requestId', r.id, 'status', r.status, 'requestedAt', r.requested_at, 'decidedAt', r.decided_at) END,
    'remainingToday', greatest(0, 3 - today_count),
    'allowance', public.exam_attempt_allowance(p_homework_id, p_student_id),
    'attemptsUsed', attempts);
END $$;

-- Lưu tin nhắn bot đã gửi (để sửa tin / bỏ nút sau khi duyệt). Chỉ ghi lần đầu.
CREATE OR REPLACE FUNCTION public.set_exam_attempt_request_message(p_request_id UUID, p_chat_id TEXT, p_message_id BIGINT)
RETURNS BOOLEAN LANGUAGE sql SECURITY DEFINER SET search_path = public AS $$
  WITH u AS (
    UPDATE public.exam_attempt_requests SET telegram_chat_id = p_chat_id, telegram_message_id = p_message_id
    WHERE id = p_request_id AND telegram_message_id IS NULL RETURNING 1)
  SELECT EXISTS (SELECT 1 FROM u)
$$;

-- init_exam_attempt: giữ nguyên toàn bộ, chỉ đổi điều kiện ATTEMPT_LIMIT sang hạn mức hiệu lực.
CREATE OR REPLACE FUNCTION public.init_exam_attempt(p_homework_id UUID, p_student_id UUID, p_token TEXT)
RETURNS JSONB LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE h public.homeworks%ROWTYPE; s public.exam_sessions%ROWTYPE; exam_class_id UUID; attempts INT; next_no INT; violations BIGINT; allowance INT;
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
      s.created_at + h.duration_minutes * interval '1 minute',
      'draftAnswers',s.draft_answers,'currentViolations',violations,
      'resumed',s.session_token = p_token,'takeover',s.session_token <> p_token);
  END IF;
  SELECT count(*) INTO attempts FROM public.submissions WHERE homework_id = p_homework_id AND student_id = p_student_id AND status = 'SUBMITTED';
  SELECT coalesce(max(attempt_no),0) + 1 INTO next_no FROM public.exam_sessions WHERE homework_id = p_homework_id AND student_id = p_student_id;
  allowance := public.exam_attempt_allowance(p_homework_id, p_student_id);
  IF allowance > 0 AND attempts >= allowance THEN RAISE EXCEPTION 'ATTEMPT_LIMIT'; END IF;
  INSERT INTO public.exam_sessions(homework_id,student_id,session_token,status,attempt_no)
    VALUES(p_homework_id,p_student_id,p_token,'ACTIVE',next_no) RETURNING * INTO s;
  RETURN jsonb_build_object('success',true,'sessionId',s.id,'createdAt',s.created_at,'serverNow',clock_timestamp(),'deadlineAt',
    s.created_at + h.duration_minutes * interval '1 minute');
END $$;

REVOKE ALL ON FUNCTION public.exam_attempt_allowance(UUID, UUID) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.request_exam_attempt(UUID, UUID) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.decide_exam_attempt_request(UUID, BOOLEAN, BIGINT, TEXT) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.set_exam_attempt_request_message(UUID, TEXT, BIGINT) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.get_exam_attempt_request_status(UUID, UUID) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.init_exam_attempt(UUID, UUID, TEXT) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.exam_attempt_allowance(UUID, UUID) TO service_role;
GRANT EXECUTE ON FUNCTION public.request_exam_attempt(UUID, UUID) TO service_role;
GRANT EXECUTE ON FUNCTION public.decide_exam_attempt_request(UUID, BOOLEAN, BIGINT, TEXT) TO service_role;
GRANT EXECUTE ON FUNCTION public.set_exam_attempt_request_message(UUID, TEXT, BIGINT) TO service_role;
GRANT EXECUTE ON FUNCTION public.get_exam_attempt_request_status(UUID, UUID) TO service_role;
GRANT EXECUTE ON FUNCTION public.init_exam_attempt(UUID, UUID, TEXT) TO service_role;
