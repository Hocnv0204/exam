-- Nháp bài làm (luyện tập): học sinh thoát giữa chừng vẫn tiếp tục được,
-- kể cả đổi thiết bị. Xóa khi nộp bài thành công.

create table if not exists public.homework_drafts (
  student_id      uuid not null references public.profiles(id) on delete cascade,
  homework_id     uuid not null references public.homeworks(id) on delete cascade,
  answers         jsonb not null default '{"mc":{},"tf":{},"sa":{}}',
  time_left_seconds integer,
  answered_count  integer not null default 0,
  updated_at      timestamptz not null default now(),
  primary key (student_id, homework_id)
);

create index if not exists homework_drafts_student_updated_idx
  on public.homework_drafts (student_id, updated_at desc);

alter table public.homework_drafts enable row level security;

drop policy if exists "admin all homework drafts" on public.homework_drafts;
create policy "admin all homework drafts" on public.homework_drafts
  for all using (public.is_admin()) with check (public.is_admin());

drop policy if exists "student own homework drafts" on public.homework_drafts;
create policy "student own homework drafts" on public.homework_drafts
  for all using (auth.uid() = student_id) with check (auth.uid() = student_id);
