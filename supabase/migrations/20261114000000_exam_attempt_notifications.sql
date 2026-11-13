-- Báo kết quả yêu cầu thêm lượt thi cho học sinh (specs/002-exam-attempt-request, bổ sung 2026-11-14).
-- decide_exam_attempt_request ghi 1 dòng vào public.notifications (cùng transaction) khi quyết định lần đầu.
-- Apply after 20261113000000_exam_attempt_requests.sql.

-- Production không còn bảng notifications (đã bị xoá ngoài migration) → tạo lại nếu thiếu, cùng cột với
-- 20260801000011_create_notifications_table.sql. Client chỉ đọc qua function student-notifications
-- (service role), nên khoá quyền như các bảng mới: RLS bật, không cho anon/authenticated.
CREATE TABLE IF NOT EXISTS public.notifications (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  content TEXT NOT NULL,
  type TEXT NOT NULL,
  related_id UUID,
  is_read BOOLEAN NOT NULL DEFAULT FALSE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
ALTER TABLE public.notifications ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.notifications FROM PUBLIC, anon, authenticated;
GRANT ALL ON public.notifications TO service_role;

CREATE INDEX IF NOT EXISTS idx_notifications_user_unread
  ON public.notifications (user_id, is_read, created_at DESC);

CREATE OR REPLACE FUNCTION public.decide_exam_attempt_request(
  p_request_id UUID, p_approve BOOLEAN, p_decider_telegram_id BIGINT, p_decider_name TEXT
) RETURNS JSONB LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE r public.exam_attempt_requests%ROWTYPE; h public.homeworks%ROWTYPE; exam_class_id UUID; eligible BOOLEAN := true; approve BOOLEAN;
  hw_title TEXT;
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
    -- Báo cho học sinh (cùng transaction, chỉ khi quyết định lần đầu).
    SELECT left(coalesce(title, 'Bài thi'), 200) INTO hw_title FROM public.homeworks WHERE id = r.homework_id;
    hw_title := coalesce(hw_title, 'Bài thi');
    INSERT INTO public.notifications (user_id, title, content, type, related_id)
    VALUES (
      r.student_id,
      CASE WHEN r.status = 'APPROVED' THEN 'Đã được cấp thêm lượt thi' ELSE 'Yêu cầu thêm lượt thi bị từ chối' END,
      CASE
        WHEN r.status = 'APPROVED' THEN format('Giáo viên đã cấp thêm 1 lượt cho bài thi "%s". Bạn có thể vào thi khi sẵn sàng.', hw_title)
        WHEN NOT eligible THEN format('Không thể cấp thêm lượt cho bài thi "%s" vì bài đã đóng hoặc bạn không còn được giao bài.', hw_title)
        ELSE format('Giáo viên đã từ chối yêu cầu thêm lượt cho bài thi "%s".', hw_title)
      END,
      CASE WHEN r.status = 'APPROVED' THEN 'EXAM_ATTEMPT_APPROVED' ELSE 'EXAM_ATTEMPT_REJECTED' END,
      r.homework_id
    );
    RETURN jsonb_build_object('success', true, 'alreadyDecided', false, 'notEligible', NOT eligible, 'requestId', r.id, 'status', r.status,
      'homeworkId', r.homework_id, 'studentId', r.student_id, 'decidedAt', r.decided_at, 'decidedByName', r.decided_by_name);
  END IF;
  SELECT * INTO r FROM public.exam_attempt_requests WHERE id = p_request_id;
  RETURN jsonb_build_object('success', true, 'alreadyDecided', true, 'requestId', r.id, 'status', r.status,
    'homeworkId', r.homework_id, 'studentId', r.student_id, 'decidedAt', r.decided_at,
    'decidedByName', r.decided_by_name, 'notEligible', false);
END $$;

REVOKE ALL ON FUNCTION public.decide_exam_attempt_request(UUID, BOOLEAN, BIGINT, TEXT) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.decide_exam_attempt_request(UUID, BOOLEAN, BIGINT, TEXT) TO service_role;
