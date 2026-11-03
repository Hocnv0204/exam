-- Serialize changes per submission, including the audit record, in one transaction.
alter table public.question_award_logs
  drop constraint question_award_logs_positive_delta,
  drop constraint question_award_logs_score_advanced;
alter table public.question_award_logs
  add column action text not null default 'award' check (action in ('award', 'mark_correct')),
  add constraint question_award_logs_nonnegative_delta check (applied_delta >= 0),
  add constraint question_award_logs_score_not_reduced check (score_after >= score_before);

alter table public.submission_answers
  add column if not exists admin_marked_correct boolean not null default false;

create or replace function public.admin_award_question(
  p_submission_id uuid, p_answer_id uuid, p_actor_id uuid, p_actor_name text,
  p_mode text default 'award'
) returns jsonb language plpgsql security definer set search_path = public as $$
declare
  s public.submissions%rowtype;
  a public.submission_answers%rowtype;
  q public.questions%rowtype;
  v_before numeric; v_target numeric; v_total numeric; v_delta numeric; v_raw_max numeric;
begin
  if p_mode not in ('award', 'mark_correct') or p_mode is null then
    raise exception 'Chế độ không hợp lệ' using errcode = '22023';
  end if;
  select * into s from public.submissions where id = p_submission_id for update;
  if not found or s.status <> 'SUBMITTED' or coalesce(s.is_trial, false) then
    raise exception 'Không tìm thấy bài đã nộp chính thức' using errcode = 'P0002';
  end if;
  select * into a from public.submission_answers where id = p_answer_id and submission_id = s.id for update;
  if not found then raise exception 'Không tìm thấy câu trả lời' using errcode = 'P0002'; end if;
  select * into q from public.questions where id = a.question_id;
  if not found or q.points is null or q.points < 0 then
    raise exception 'Điểm câu hỏi không hợp lệ' using errcode = '22023';
  end if;
  if p_mode = 'mark_correct' and a.is_correct is distinct from false then
    raise exception 'Chỉ có thể chuyển câu đang sai thành đúng' using errcode = '22023';
  end if;
  v_before := round(coalesce(a.score_earned, 0)::numeric, 2);
  v_target := greatest(v_before, round(q.points::numeric, 2));
  -- score_earned là điểm thô của câu; total_score là thang điểm bài.
  -- Ví dụ 40 câu x 1 điểm, bài thang 10: sửa một câu +1 thô => +0.25 điểm bài.
  select coalesce(sum(coalesce(questions.points, 0)), 0) into v_raw_max
    from public.submission_answers sa
    join public.questions on questions.id = sa.question_id
    where sa.submission_id = s.id;
  if v_raw_max <= 0 then
    raise exception 'Không xác định được tổng điểm câu hỏi' using errcode = '22023';
  end if;
  v_total := greatest(0, least(coalesce(s.max_score, 10),
    round((coalesce(s.total_score, 0) + (v_target - v_before) * coalesce(s.max_score, 10) / v_raw_max)::numeric, 2)));
  v_delta := v_total - coalesce(s.total_score, 0);
  if p_mode = 'award' and v_target = v_before then
    return jsonb_build_object('success', true, 'delta', 0, 'scoreEarned', v_before, 'totalScore', s.total_score);
  end if;
  update public.submission_answers set score_earned = v_target,
    is_correct = case when p_mode = 'mark_correct' then true else is_correct end,
    admin_marked_correct = case when p_mode = 'mark_correct' then true else admin_marked_correct end
    where id = a.id;
  update public.submissions set total_score = v_total,
    correct_count = case when p_mode = 'mark_correct' then coalesce(correct_count, 0) + 1 else correct_count end,
    wrong_count = case when p_mode = 'mark_correct' then greatest(0, coalesce(wrong_count, 0) - 1) else wrong_count end
    where id = s.id;
  -- Also record a zero-delta correction, so regrading preserves manual decisions.
  insert into public.question_award_logs (submission_id, answer_id, question_id, actor_id, actor_name,
    question_number, part_title, question_points, score_before, score_after, applied_delta, total_score_after, action)
  values (s.id, a.id, q.id, p_actor_id, coalesce(nullif(trim(p_actor_name), ''), 'Admin'),
    q.question_number, q.part_title, q.points, v_before, v_target, v_delta, v_total, p_mode);
  return jsonb_build_object('success', true, 'delta', v_delta, 'scoreEarned', v_target, 'totalScore', v_total);
end $$;
revoke all on function public.admin_award_question(uuid, uuid, uuid, text, text) from public, anon, authenticated;
grant execute on function public.admin_award_question(uuid, uuid, uuid, text, text) to service_role;
