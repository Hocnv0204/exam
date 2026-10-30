// Optional local PostgreSQL/WASM test; no network, cloud project, or real data.
// Install @electric-sql/pglite outside the repo, then set PGLITE_MODULE to its dist/index.js.
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { pathToFileURL } from 'node:url'

if (!process.env.PGLITE_MODULE) throw new Error('Set PGLITE_MODULE to an external @electric-sql/pglite dist/index.js path.')
const { PGlite } = await import(pathToFileURL(process.env.PGLITE_MODULE).href)
const db = new PGlite()
const id = n => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`
const [student, other, admin, classId, chapter, lesson, hw, q1, q2, sub, otherSub, trialSub, activeSub, a1, a2] = Array.from({ length: 15 }, (_, n) => id(n + 1))
const appeal = id(100)
try {
  await db.exec(`
    create role anon; create role authenticated; create role service_role bypassrls;
    create table public.classes(id uuid primary key, name text);
    create table public.profiles(id uuid primary key, role text);
    create table public.chapters(id uuid primary key, class_id uuid references public.classes);
    create table public.lessons(id uuid primary key, chapter_id uuid references public.chapters);
    create table public.homeworks(id uuid primary key, lesson_id uuid references public.lessons, title text);
    create table public.questions(id uuid primary key, question_number integer, part_title text);
    create table public.submissions(id uuid primary key, student_id uuid, homework_id uuid, status text, is_trial boolean, total_score numeric);
    create table public.submission_answers(id uuid primary key, submission_id uuid references public.submissions, question_id uuid references public.questions, score_earned numeric);
    grant usage on schema public to anon, authenticated, service_role;
    grant all on all tables in schema public to service_role;
    insert into public.classes values ('${classId}', 'Lớp fixture');
    insert into public.profiles values ('${student}', 'STUDENT'), ('${other}', 'STUDENT'), ('${admin}', 'ADMIN');
    insert into public.chapters values ('${chapter}', '${classId}');
    insert into public.lessons values ('${lesson}', '${chapter}');
    insert into public.homeworks values ('${hw}', '${lesson}', 'Bài fixture');
    insert into public.questions values ('${q1}', 4, 'Phần II'), ('${q2}', 5, 'Phần II');
    insert into public.submissions values
      ('${sub}', '${student}', '${hw}', 'SUBMITTED', false, 6.25),
      ('${otherSub}', '${other}', '${hw}', 'SUBMITTED', false, 8),
      ('${trialSub}', '${student}', '${hw}', 'SUBMITTED', true, 0),
      ('${activeSub}', '${student}', '${hw}', 'IN_PROGRESS', false, 0);
    insert into public.submission_answers values ('${a1}', '${sub}', '${q1}', 0.25), ('${a2}', '${otherSub}', '${q2}', 1);
  `)
  await db.exec(readFileSync(new URL('../migrations/20261030000000_question_appeals.sql', import.meta.url), 'utf8'))
  const baseline = JSON.stringify([(await db.query('select * from submissions order by id')).rows, (await db.query('select * from submission_answers order by id')).rows])
  const insert = (submission = sub, answer = a1, owner = student, message = 'Hỏi câu đã nộp') => db.query(`
    insert into question_appeals(id,submission_id,submission_answer_id,student_id,message)
    values ($1,$2,$3,$4,$5) returning *`, [appeal, submission, answer, owner, message])
  async function fails(run, code) {
    await assert.rejects(run, error => error.code === code, `expected PostgreSQL ${code}`)
  }
  await fails(() => insert(otherSub, a2, student), '23514')
  await fails(() => insert(sub, a2), '23514')
  await fails(() => insert(trialSub), '23514')
  await fails(() => insert(activeSub), '23514')
  await fails(() => insert(sub, a1, student, ' '), '23514')
  await fails(() => insert(sub, a1, student, 'x'.repeat(1001)), '23514')
  // Actual service-role permissions and trigger invocation after function EXECUTE revoke.
  await db.exec('set role service_role')
  const created = (await insert()).rows[0]
  assert.equal(created.class_id, classId)
  assert.equal(created.homework_title, 'Bài fixture')
  assert.equal(created.question_number, 4)
  assert.equal(created.part_title, 'Phần II')
  assert.equal(created.version, 1)
  await fails(() => insert(), '23505')
  await fails(() => db.query(`update question_appeals set status='CLOSED', closed_by=$1 where id=$2`, [admin, appeal]), '23514')
  await fails(() => db.query(`update question_appeals set status='ANSWERED', response='Giả mạo', replied_by=$1 where id=$2`, [student, appeal]), '23514')
  await fails(() => db.query(`update question_appeals set message='ghi đè', status='ANSWERED', response='test', replied_by=$1 where id=$2`, [admin, appeal]), '23514')
  await fails(() => db.query(`update question_appeals set status='ANSWERED', response=$1, replied_by=$2 where id=$3`, ['x'.repeat(2001), admin, appeal]), '23514')
  const answered = (await db.query(`update question_appeals set status='ANSWERED', response='Đã xem.', replied_by=$1 where id=$2 and version=1 and status='OPEN' returning *`, [admin, appeal])).rows[0]
  assert.equal(answered.version, 2)
  assert.equal(answered.replied_by, admin)
  assert.ok(answered.answered_at)
  assert.equal((await db.query(`update question_appeals set status='ANSWERED', response='Cũ', replied_by=$1 where id=$2 and version=1 and status='OPEN' returning id`, [admin, appeal])).rows.length, 0)
  await fails(() => db.query(`update question_appeals set status='OPEN' where id=$1`, [appeal]), '23514')
  const closed = (await db.query(`update question_appeals set status='CLOSED', closed_by=$1 where id=$2 and version=2 returning *`, [admin, appeal])).rows[0]
  assert.equal(closed.version, 3)
  assert.equal(closed.response, 'Đã xem.')
  assert.ok(closed.closed_at)
  assert.equal(closed.closed_by, admin)
  await fails(() => db.query(`update question_appeals set status='ANSWERED' where id=$1`, [appeal]), '23514')
  await db.exec('reset role')
  // Both privileges and RLS are fail-closed: even if table grants are added accidentally,
  // anon/authenticated have no policy and cannot read a single appeal.
  for (const role of ['anon', 'authenticated']) {
    await db.exec(`set role ${role}`)
    await fails(() => db.query('select * from question_appeals'), '42501')
    await fails(() => insert(), '42501')
    await db.exec('reset role')
    await db.exec(`grant select on question_appeals to ${role}; set role ${role}`)
    assert.equal((await db.query('select * from question_appeals')).rows.length, 0)
    await db.exec(`reset role; revoke select on question_appeals from ${role}`)
  }
  // Snapshot class can outlive its original chapter placement (e.g. curriculum moved).
  await db.query('insert into classes values ($1, $2)', [id(200), 'Lớp đích fixture'])
  await db.query('update chapters set class_id=$1 where id=$2', [id(200), chapter])
  await db.query('delete from classes where id=$1', [classId])
  const orphanClass = (await db.query('select * from question_appeals')).rows[0]
  assert.equal(orphanClass.class_id, null)
  assert.equal(orphanClass.version, 3)
  assert.equal(JSON.stringify([(await db.query('select * from submissions order by id')).rows, (await db.query('select * from submission_answers order by id')).rows]), baseline)
  await db.query('delete from submission_answers where id=$1', [a1])
  assert.equal((await db.query('select * from question_appeals')).rows.length, 0, 'answer FK cascades safely')
  console.log('Question appeals migration: PostgreSQL/WASM DDL, trigger guards, snapshots, uniqueness, state/CAS, RLS, service-role grants, FK and grade invariants PASS.')
} finally {
  await db.close()
}
