// PostgreSQL/WASM test for fn_add_students_to_class (no network, no real data).
// Run:
//   PGLITE_MODULE=/path/to/@electric-sql/pglite/dist/index.js \
//   node supabase/scripts/test-add-students-batch-db.mjs
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { pathToFileURL } from 'node:url'

if (!process.env.PGLITE_MODULE) {
  throw new Error('Set PGLITE_MODULE to an external @electric-sql/pglite dist/index.js path.')
}
const { PGlite } = await import(pathToFileURL(process.env.PGLITE_MODULE).href)
const db = new PGlite()

const id = (n) => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`
const classA = id(1)
const classB = id(2)
const good1 = id(11)
const good2 = id(12)
const lockedProfile = id(13)
const lockedInterval = id(14)
const already = id(15)
const admin = id(16)
const legacy = id(17)
const raceStudent = id(18)
const missing = id(99)

try {
  await db.exec(`
    create role anon;
    create role authenticated;
    create role service_role bypassrls;

    create table public.classes(
      id uuid primary key,
      name text,
      tuition_fee numeric(12,2) not null default 0
    );
    create table public.profiles(
      id uuid primary key,
      username text,
      role text not null default 'STUDENT',
      is_locked boolean not null default false,
      class_id uuid references public.classes(id),
      balance numeric(12,2) not null default 0,
      updated_at timestamptz not null default now()
    );
    create table public.student_classes(
      student_id uuid references public.profiles(id) on delete cascade,
      class_id uuid references public.classes(id) on delete cascade,
      status text not null default 'ACTIVE',
      lock_interval_id uuid,
      primary key (student_id, class_id)
    );
    create table public.student_lock_intervals(
      id uuid primary key default gen_random_uuid(),
      student_id uuid not null references public.profiles(id) on delete cascade,
      start_date date not null,
      end_date date
    );

    grant usage on schema public to anon, authenticated, service_role;
    grant all on all tables in schema public to service_role;

    insert into public.classes(id, name) values
      ('${classA}', 'Lớp A'),
      ('${classB}', 'Lớp B');

    insert into public.profiles(id, username, role, is_locked, class_id, updated_at) values
      ('${good1}', 'good1', 'STUDENT', false, null, '2026-01-01T00:00:00Z'),
      ('${good2}', 'good2', 'STUDENT', false, '${classB}', '2026-01-01T00:00:00Z'),
      ('${lockedProfile}', 'locked_profile', 'STUDENT', true, null, '2026-01-01T00:00:00Z'),
      ('${lockedInterval}', 'locked_interval', 'STUDENT', false, null, '2026-01-01T00:00:00Z'),
      ('${already}', 'already', 'STUDENT', false, null, '2026-01-01T00:00:00Z'),
      ('${admin}', 'admin', 'ADMIN', false, null, '2026-01-01T00:00:00Z'),
      ('${legacy}', 'legacy', 'STUDENT', false, '${classA}', '2026-01-01T00:00:00Z'),
      ('${raceStudent}', 'race_student', 'STUDENT', false, null, '2026-01-01T00:00:00Z');

    insert into public.student_classes(student_id, class_id, status) values
      ('${already}', '${classA}', 'ACTIVE');

    insert into public.student_lock_intervals(student_id, start_date, end_date) values
      ('${lockedInterval}', '2026-01-01', null);

    -- Giả lập race: một request khác chèn dòng student_classes ngay trước
    -- INSERT của RPC. Trigger chèn row rồi trả NULL để INSERT ngoài không
    -- RETURNING dòng nào, đúng nhánh ON CONFLICT DO NOTHING.
    create function public.test_race_insert() returns trigger
    language plpgsql as $$
    begin
      if new.student_id = '${raceStudent}' and pg_trigger_depth() = 1 then
        insert into public.student_classes(student_id, class_id, status)
        values (new.student_id, new.class_id, new.status)
        on conflict do nothing;
        return null;
      end if;
      return new;
    end;
    $$;
    create trigger trg_test_race_insert
      before insert on public.student_classes
      for each row execute function public.test_race_insert();
  `)

  await db.exec(readFileSync(
    new URL('../migrations/20261107001001_add_students_to_class_batch.sql', import.meta.url),
    'utf8',
  ))

  const add = async (classId, studentIds) => (await db.query(
    'select public.fn_add_students_to_class($1, $2::uuid[]) as result',
    [classId, studentIds],
  )).rows[0].result

  const findReason = (result, studentId) =>
    (result.skipped || []).find((row) => row.studentId === studentId)?.reason

  // Execute permission is fail-closed for anon/authenticated.
  for (const role of ['anon', 'authenticated']) {
    await db.exec(`set role ${role}`)
    await assert.rejects(
      () => add(classA, [good1]),
      (error) => error.code === '42501',
      `${role} must not execute the batch enrollment RPC`,
    )
    await db.exec('reset role')
  }

  await db.exec('set role service_role')

  const request = [good1, good2, lockedProfile, lockedInterval, already, admin, legacy, raceStudent, missing, good1]
  const first = await add(classA, request)

  assert.deepEqual(first.added, [good1, good2], 'only eligible students are added, in input order')
  assert.equal(first.added.length, new Set(first.added).size, 'added contains no duplicate')

  assert.equal(findReason(first, lockedProfile), 'Học sinh đang bị khóa tài khoản, không thể thêm vào lớp')
  assert.equal(findReason(first, lockedInterval), 'Học sinh đang bị khóa tài khoản, không thể thêm vào lớp')
  assert.equal(findReason(first, already), 'Học sinh đã có trong lớp')
  // Legacy: profiles.class_id đã trỏ lớp này dù thiếu student_classes.
  assert.equal(findReason(first, legacy), 'Học sinh đã có trong lớp')
  // Race: eligible lúc classify nhưng INSERT bị "người khác" chèn trước.
  assert.equal(findReason(first, raceStudent), 'Học sinh đã có trong lớp')
  assert.equal(findReason(first, admin), 'Tài khoản không phải học sinh')
  assert.equal(findReason(first, missing), 'Không tìm thấy học sinh')
  assert.equal(findReason(first, good1), undefined)

  // Không được im lặng bỏ sót: mọi input phải nằm trong added hoặc skipped.
  for (const studentId of new Set(request)) {
    const inAdded = first.added.includes(studentId)
    const inSkipped = (first.skipped || []).some((row) => row.studentId === studentId)
    assert.ok(inAdded || inSkipped, `student ${studentId} must appear in added or skipped`)
  }

  const enrollmentCount = async (studentId, classId) => Number((await db.query(
    'select count(*)::int as c from public.student_classes where student_id=$1 and class_id=$2',
    [studentId, classId],
  )).rows[0].c)

  assert.equal(await enrollmentCount(good1, classA), 1)
  assert.equal(await enrollmentCount(good2, classA), 1)
  assert.equal(await enrollmentCount(legacy, classA), 0, 'legacy profile class_id must not be inserted')
  assert.equal(await enrollmentCount(lockedProfile, classA), 0)
  assert.equal(await enrollmentCount(lockedInterval, classA), 0)
  assert.equal(await enrollmentCount(raceStudent, classA), 1, 'race row inserted by other request only')

  const profileClass = async (studentId) => (await db.query(
    'select class_id from public.profiles where id=$1',
    [studentId],
  )).rows[0].class_id
  assert.equal(await profileClass(good1), classA, 'profiles.class_id set when NULL')
  assert.equal(await profileClass(good2), classB, 'existing profiles.class_id is not overwritten')
  assert.equal(await profileClass(legacy), classA, 'legacy profiles.class_id left untouched')
  assert.equal(await profileClass(raceStudent), null, 'race-skipped student is not updated as added')

  // Second call: already enrolled -> all skipped, no duplicate insert.
  const second = await add(classA, request)
  assert.deepEqual(second.added, [])
  assert.equal(findReason(second, good1), 'Học sinh đã có trong lớp')
  assert.equal(findReason(second, good2), 'Học sinh đã có trong lớp')
  assert.equal(findReason(second, legacy), 'Học sinh đã có trong lớp')
  assert.equal(findReason(second, raceStudent), 'Học sinh đã có trong lớp')
  assert.equal(await enrollmentCount(good1, classA), 1, 'no duplicate after retry')
  assert.equal(await enrollmentCount(good2, classA), 1)
  assert.equal(await enrollmentCount(legacy, classA), 0)
  assert.equal(await enrollmentCount(raceStudent, classA), 1)

  // Empty input is a no-op, not an error.
  const empty = await add(classA, [])
  assert.deepEqual(empty.added, [])
  assert.deepEqual(empty.skipped, [])

  // Unknown class is rejected.
  await assert.rejects(
    () => add(id(12345), [good1]),
    (error) => error.code === 'P0002',
  )

  // Hard cap of 200 distinct students is enforced in the database too.
  const big = (await db.query(
    'select array_agg(gen_random_uuid()) as ids from generate_series(1, 201)',
  )).rows[0].ids
  await assert.rejects(
    () => add(classA, big),
    (error) => error.code === '22023',
  )

  await db.exec('reset role')

  console.log('Batch add students RPC: locked/role/already/missing/duplicate/cap/RBAC invariants PASS.')
} finally {
  await db.close()
}
