-- Hỏi về câu đã nộp: không thay đổi điểm, một yêu cầu / submission_answer.
create table public.question_appeals (
  id uuid primary key default gen_random_uuid(),
  submission_id uuid not null references public.submissions(id) on delete cascade,
  submission_answer_id uuid not null unique references public.submission_answers(id) on delete cascade,
  student_id uuid not null references public.profiles(id) on delete cascade,
  class_id uuid references public.classes(id) on delete set null,
  homework_title text not null default '',
  question_number integer,
  part_title text,
  message text not null check (char_length(btrim(message)) between 1 and 1000),
  status text not null default 'OPEN' check (status in ('OPEN', 'ANSWERED', 'CLOSED')),
  response text check (response is null or char_length(btrim(response)) between 1 and 2000),
  -- UUID audit giữ lại kể cả khi tài khoản admin bị xoá; không trả cho học sinh.
  replied_by uuid,
  closed_by uuid,
  version integer not null default 1 check (version > 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  answered_at timestamptz,
  closed_at timestamptz,
  constraint question_appeals_response_state check (
    (status = 'OPEN' and response is null and answered_at is null and replied_by is null and closed_at is null and closed_by is null)
    or (status = 'ANSWERED' and response is not null and answered_at is not null and replied_by is not null and closed_at is null and closed_by is null)
    or (status = 'CLOSED' and response is not null and answered_at is not null and replied_by is not null and closed_at is not null and closed_by is not null)
  )
);

-- Khoá bài nộp trong transaction insert: không lọt TOCTOU khi admin mở lại bài.
-- Đồng thời ràng buộc answer/submission/student ở DB, không chỉ tin service client.
create function public.guard_question_appeal_insert() returns trigger
language plpgsql set search_path = public as $$
declare s public.submissions%rowtype;
begin
  select * into s from public.submissions where id = new.submission_id for update;
  if not found or s.student_id is distinct from new.student_id or s.status is distinct from 'SUBMITTED' or coalesce(s.is_trial, false) then
    raise exception 'Appeal requires own submitted non-trial submission' using errcode = '23514';
  end if;
  if not exists (select 1 from public.profiles where id = new.student_id and role = 'STUDENT') then
    raise exception 'Appeal requires student' using errcode = '23514';
  end if;
  perform 1 from public.submission_answers where id = new.submission_answer_id and submission_id = s.id for share;
  if not found then
    raise exception 'Answer does not belong to submission' using errcode = '23514';
  end if;
  select q.question_number, q.part_title into new.question_number, new.part_title
    from public.submission_answers a join public.questions q on q.id = a.question_id
    where a.id = new.submission_answer_id;
  select h.title, c.class_id into new.homework_title, new.class_id
    from public.homeworks h join public.lessons l on l.id = h.lesson_id
    join public.chapters c on c.id = l.chapter_id where h.id = s.homework_id;
  new.status := 'OPEN'; new.version := 1;
  new.response := null; new.replied_by := null; new.closed_by := null;
  new.answered_at := null; new.closed_at := null;
  new.message := btrim(new.message);
  new.created_at := now(); new.updated_at := now();
  return new;
end $$;
create trigger question_appeals_insert_guard before insert on public.question_appeals
  for each row execute function public.guard_question_appeal_insert();

create function public.guard_question_appeal_update() returns trigger
language plpgsql set search_path = public as $$
begin
  if row(new.id, new.submission_id, new.submission_answer_id, new.student_id, new.message, new.created_at,
         new.homework_title, new.question_number, new.part_title)
    is distinct from row(old.id, old.submission_id, old.submission_answer_id, old.student_id, old.message, old.created_at,
                         old.homework_title, old.question_number, old.part_title) then
    raise exception 'Appeal is immutable' using errcode = '23514';
  end if;
  -- ON DELETE SET NULL của lớp không phải chuyển trạng thái.
  if new.class_id is null and old.class_id is not null and new.status = old.status
    and row(new.response, new.replied_by, new.closed_by, new.version, new.updated_at, new.answered_at, new.closed_at)
      is not distinct from row(old.response, old.replied_by, old.closed_by, old.version, old.updated_at, old.answered_at, old.closed_at) then
    return new;
  end if;
  if new.class_id is distinct from old.class_id then
    raise exception 'Appeal class is immutable' using errcode = '23514';
  end if;
  if old.status = 'OPEN' and new.status = 'ANSWERED' then
    if not exists (select 1 from public.profiles where id = new.replied_by and role = 'ADMIN') then
      raise exception 'Admin required' using errcode = '23514';
    end if;
    new.response := btrim(new.response); new.answered_at := now();
  elsif old.status = 'ANSWERED' and new.status = 'CLOSED' then
    if row(new.response, new.replied_by, new.answered_at) is distinct from row(old.response, old.replied_by, old.answered_at)
      or not exists (select 1 from public.profiles where id = new.closed_by and role = 'ADMIN') then
      raise exception 'Invalid appeal close' using errcode = '23514';
    end if;
    new.closed_at := now();
  else
    raise exception 'Invalid appeal transition' using errcode = '23514';
  end if;
  new.version := old.version + 1; new.updated_at := now();
  return new;
end $$;
create trigger question_appeals_update_guard before update on public.question_appeals
  for each row execute function public.guard_question_appeal_update();

create index question_appeals_inbox_idx on public.question_appeals (status, created_at desc, id desc);
create index question_appeals_submission_idx on public.question_appeals (submission_id, student_id);
create index question_appeals_class_inbox_idx on public.question_appeals (class_id, status, created_at desc);
alter table public.question_appeals enable row level security;
revoke all on table public.question_appeals from public, anon, authenticated;
grant all on table public.question_appeals to service_role;
revoke all on function public.guard_question_appeal_insert() from public, anon, authenticated;
revoke all on function public.guard_question_appeal_update() from public, anon, authenticated;
comment on table public.question_appeals is 'Hỏi đáp câu đã nộp; chỉ Edge service role. Không sửa điểm. OPEN -> ANSWERED -> CLOSED.';
