-- Nhật ký cộng điểm theo câu (audit) cho admin review bài nộp.
--
-- Khác user_activity_logs (check action enum LOGIN/SUBMIT... không phù hợp):
-- mỗi dòng = MỘT lần admin cộng điểm THẬT SỰ áp dụng (applied_delta > 0) cho
-- MỘT câu trong một bài nộp. Click idempotent (câu đã đủ điểm / tổng đã chạm
-- max_score) KHÔNG ghi log. Nếu ghi log thất bại, Edge Function rollback cả
-- answer + submission và trả lỗi -> log và điểm luôn đi cùng nhau.
--
-- Snapshot question_number / part_title / question_points tại thời điểm cộng
-- để log không đổi nghĩa khi đề bài bị sửa sau này. actor_id xóa thì giữ
-- actor_name snapshot để vẫn render được ai đã cộng.
--
-- Bảo mật: RLS bật, KHÔNG tạo policy cho anon/authenticated (cùng pattern
-- student_report_shares): chỉ service role (Edge Function backend) đọc/ghi,
-- không có đường truy cập public qua PostgREST.

create table if not exists public.question_award_logs (
  id                 uuid primary key default gen_random_uuid(),
  submission_id      uuid not null references public.submissions(id) on delete cascade,
  answer_id          uuid references public.submission_answers(id) on delete set null,
  question_id        uuid references public.questions(id) on delete set null,
  actor_id           uuid references public.profiles(id) on delete set null,
  actor_name         text not null default '',
  question_number    integer,
  part_title         text,
  question_points    numeric(5,2),
  score_before       numeric(5,2) not null,
  score_after        numeric(5,2) not null,
  applied_delta      numeric(5,2) not null,
  total_score_after  numeric(5,2),
  created_at         timestamptz not null default now(),
  constraint question_award_logs_positive_delta
    check (applied_delta > 0),
  constraint question_award_logs_score_advanced
    check (score_after > score_before)
);

-- Truy vấn chính: lịch sử cộng điểm của một bài (assignment review) và
-- aggregate theo submission của trang danh sách bài nộp (danh sách current page).
create index if not exists question_award_logs_submission_created_idx
  on public.question_award_logs (submission_id, created_at);

-- Tra cứu nhanh mọi lần cộng của một câu trả lời cụ thể.
create index if not exists question_award_logs_answer_idx
  on public.question_award_logs (answer_id);

alter table public.question_award_logs enable row level security;

-- Không policy nào cho anon/authenticated: chỉ service role (Edge Function) truy cập.
revoke all on table public.question_award_logs from anon, authenticated;
grant all on table public.question_award_logs to service_role;

comment on table public.question_award_logs is
  'Audit cộng điểm theo câu: mỗi dòng là một lần admin cộng điểm thật áp dụng (applied_delta > 0). Chỉ service role đọc/ghi.';
comment on column public.question_award_logs.applied_delta is
  'Điểm thực sự cộng vào bài (đã cap ở max_score); luôn > 0. Click idempotent không ghi dòng mới.';
