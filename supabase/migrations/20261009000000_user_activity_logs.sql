-- Quản trị người dùng: khóa tài khoản + nhật ký hoạt động.
-- 1. profiles.is_locked: true = tạm khóa (login chặn, trạng thái học chuyển Tạm nghỉ).
-- 2. user_activity_logs: LOGIN / LESSON_VIEW / VIDEO_WATCH / HOMEWORK_START /
--    HOMEWORK_SUBMIT / EXAM_START / EXAM_SUBMIT (+ duration_seconds khi có).

alter table public.profiles
  add column if not exists is_locked boolean not null default false;

create table if not exists public.user_activity_logs (
  id               uuid primary key default gen_random_uuid(),
  user_id          uuid not null references public.profiles(id) on delete cascade,
  action           text not null check (action in (
                     'LOGIN', 'LOGOUT',
                     'LESSON_VIEW', 'VIDEO_WATCH',
                     'HOMEWORK_START', 'HOMEWORK_SUBMIT',
                     'EXAM_START', 'EXAM_SUBMIT'
                   )),
  metadata         jsonb not null default '{}',
  duration_seconds integer,
  created_at       timestamptz not null default now()
);

create index if not exists user_activity_logs_user_created_idx
  on public.user_activity_logs (user_id, created_at desc);
create index if not exists user_activity_logs_action_created_idx
  on public.user_activity_logs (action, created_at desc);

alter table public.user_activity_logs enable row level security;

drop policy if exists "admin all activity logs" on public.user_activity_logs;
create policy "admin all activity logs" on public.user_activity_logs
  for all using (public.is_admin()) with check (public.is_admin());

drop policy if exists "user read own activity logs" on public.user_activity_logs;
create policy "user read own activity logs" on public.user_activity_logs
  for select using (auth.uid() = user_id);
