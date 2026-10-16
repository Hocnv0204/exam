-- Điểm cộng của giáo viên vào bài làm.
-- bonus_score: tổng điểm đã cộng (audit); total_score đã bao gồm bonus (capped ở max_score).

alter table public.submissions
  add column if not exists bonus_score numeric(5,2) not null default 0.00;
