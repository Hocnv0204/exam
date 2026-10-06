create table public.meeting_sessions (
  id            uuid primary key default gen_random_uuid(),
  lesson_id     uuid references public.lessons(id) on delete set null,
  space_name    text not null unique,          -- "spaces/xxxx" (khoá map)
  meeting_uri   text not null,
  meeting_code  text,                          -- chỉ để hiển thị, KHÔNG dùng làm khoá
  title         text,
  created_by    uuid references auth.users(id),
  created_at    timestamptz not null default now(),
  status        text not null default 'PENDING'
                check (status in ('PENDING','READY','NO_RECORDING','EXPIRED','ERROR')),
  last_synced_at timestamptz,
  last_error    text
);

create table public.meeting_recordings (
  id                uuid primary key default gen_random_uuid(),
  session_id        uuid not null references public.meeting_sessions(id) on delete cascade,
  recording_name    text not null unique,      -- "conferenceRecords/../recordings/.." (khoá upsert)
  conference_record text not null,
  state             text not null,             -- ENDED | FILE_GENERATED | ...
  start_time        timestamptz,
  end_time          timestamptz,
  drive_file_id     text,
  drive_url         text,                      -- exportUri
  fetched_at        timestamptz not null default now()
);

create index meeting_sessions_status_last_synced_at_idx on public.meeting_sessions (status, last_synced_at);
create index meeting_recordings_session_id_idx on public.meeting_recordings (session_id);

alter table public.meeting_sessions   enable row level security;
alter table public.meeting_recordings enable row level security;

create policy "admin read sessions"   on public.meeting_sessions   for select using (public.is_admin());
create policy "admin read recordings" on public.meeting_recordings for select using (public.is_admin());
