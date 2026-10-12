-- Giao bài tập bổ sung cho từng học sinh.
-- Quy ước: bài KHÔNG có dòng target = bài chung cả lớp (tương thích ngược).

create table if not exists public.homework_targets (
  homework_id uuid not null references public.homeworks(id) on delete cascade,
  student_id  uuid not null references public.profiles(id) on delete cascade,
  created_at  timestamptz not null default now(),
  primary key (homework_id, student_id)
);

create index if not exists homework_targets_student_idx
  on public.homework_targets (student_id);
create index if not exists homework_targets_homework_idx
  on public.homework_targets (homework_id);

alter table public.homework_targets enable row level security;

drop policy if exists "admin all homework targets" on public.homework_targets;
create policy "admin all homework targets" on public.homework_targets
  for all using (public.is_admin()) with check (public.is_admin());

drop policy if exists "student read own homework targets" on public.homework_targets;
create policy "student read own homework targets" on public.homework_targets
  for select using (auth.uid() = student_id);
