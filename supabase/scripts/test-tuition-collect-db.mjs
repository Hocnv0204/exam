// PostgreSQL/WASM test for fn_collect_student_tuition (no network, no real data).
// Run:
//   PGLITE_MODULE=/path/to/@electric-sql/pglite/dist/index.js \
//   node supabase/scripts/test-tuition-collect-db.mjs
//
// The test builds a minimal but behaviour-equivalent schema (tables + lock
// trigger) then applies the real migration file. Business oracles below are
// written independently from the migration body.
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
const admin = id(3)
const s1 = id(11)
const s2 = id(12)
const s3 = id(13)
const s4 = id(14)
const s5 = id(15)

const a1 = id(101)
const a2 = id(102)
const a3 = id(103)
const a4 = id(104)
const a5 = id(105)
const a6 = id(109)
const a7 = id(115)
const b1 = id(201)

const r1 = id(301)
const r2 = id(302)
const r3 = id(303)
const r4 = id(304)
const r5 = id(305)
const r6 = id(306)
const r7 = id(307)
const r8 = id(308)
const r9 = id(309)
const r10 = id(310)

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
    create table public.student_sessions(
      id uuid primary key default gen_random_uuid(),
      student_id uuid not null references public.profiles(id) on delete cascade,
      class_id uuid not null references public.classes(id) on delete cascade,
      session_date date not null,
      is_paid boolean not null default false,
      unique(student_id, class_id, session_date)
    );
    create table public.attendance_sessions(
      id uuid primary key default gen_random_uuid(),
      class_id uuid not null references public.classes(id) on delete cascade,
      session_date date not null,
      fee_per_session numeric(12,2) not null default 0,
      unique(class_id, session_date)
    );
    create table public.attendance_records(
      id uuid primary key default gen_random_uuid(),
      session_id uuid not null references public.attendance_sessions(id) on delete cascade,
      student_id uuid not null references public.profiles(id) on delete cascade,
      is_present boolean not null default false,
      fee_amount numeric(12,2) not null default 0,
      payment_status text not null default 'unpaid',
      paid_at timestamptz,
      updated_at timestamptz not null default now(),
      unique(session_id, student_id)
    );
    create table public.student_lock_intervals(
      id uuid primary key default gen_random_uuid(),
      student_id uuid not null references public.profiles(id) on delete cascade,
      start_date date not null,
      end_date date
    );
    create table public.tuition_transactions(
      id uuid primary key default gen_random_uuid(),
      student_id uuid not null references public.profiles(id) on delete cascade,
      class_id uuid references public.classes(id) on delete set null,
      type text not null check (type in ('topup','auto_deduct','refund','manual_collect','waive','lock_settlement')),
      amount numeric(12,2) not null,
      attendance_record_id uuid references public.attendance_records(id) on delete set null,
      receipt_no text unique,
      note text,
      created_by uuid references public.profiles(id) on delete set null,
      created_at timestamptz not null default now()
    );

    grant usage on schema public to anon, authenticated, service_role;
    grant all on all tables in schema public to service_role;

    -- Minimal clone of production lock semantics used by the real triggers.
    create function public.fn_student_locked_on(p_student uuid, p_date date)
    returns boolean language sql stable as $$
      select
        p_date is not null
        and (
          exists (
            select 1 from public.student_lock_intervals i
            where i.student_id = p_student
              and p_date >= i.start_date
              and (i.end_date is null or p_date < i.end_date)
          )
          or exists (
            select 1 from public.profiles p
            where p.id = p_student
              and p.is_locked = true
              and not exists (
                select 1 from public.student_lock_intervals oi
                where oi.student_id = p.id and oi.end_date is null
              )
              and p_date >= (p.updated_at at time zone 'Asia/Ho_Chi_Minh')::date
          )
        );
    $$;

    create function public.fn_test_guard_attendance_record()
    returns trigger language plpgsql as $$
    declare v_date date;
    begin
      select session_date into v_date from public.attendance_sessions where id = new.session_id;
      if public.fn_student_locked_on(new.student_id, v_date) then
        raise exception 'ATTENDANCE_LOCKED_STUDENT: student % is locked on %', new.student_id, v_date
          using errcode = 'P0001';
      end if;
      return new;
    end;
    $$;
    create trigger trg_test_attendance_record_guard
      before insert or update on public.attendance_records
      for each row execute function public.fn_test_guard_attendance_record();

    create function public.fn_test_guard_student_session()
    returns trigger language plpgsql as $$
    begin
      if public.fn_student_locked_on(new.student_id, new.session_date) then
        raise exception 'ATTENDANCE_LOCKED_STUDENT: student % is locked on %', new.student_id, new.session_date
          using errcode = 'P0001';
      end if;
      return new;
    end;
    $$;
    create trigger trg_test_student_session_guard
      before insert or update on public.student_sessions
      for each row execute function public.fn_test_guard_student_session();

    insert into public.classes(id, name, tuition_fee) values
      ('${classA}', 'Lớp A', 100),
      ('${classB}', 'Lớp B', 100);

    insert into public.profiles(id, username, role) values
      ('${admin}', 'admin', 'ADMIN'),
      ('${s1}', 's1', 'STUDENT'),
      ('${s2}', 's2', 'STUDENT'),
      ('${s3}', 's3', 'STUDENT'),
      ('${s4}', 's4', 'STUDENT'),
      ('${s5}', 's5', 'STUDENT');

    insert into public.student_classes(student_id, class_id) values
      ('${s1}', '${classA}'), ('${s2}', '${classA}'), ('${s3}', '${classA}'),
      ('${s4}', '${classA}'), ('${s5}', '${classA}'), ('${s1}', '${classB}');

    insert into public.attendance_sessions(id, class_id, session_date, fee_per_session) values
      ('${a1}', '${classA}', '2026-10-01', 100),
      ('${a2}', '${classA}', '2026-10-02', 100),
      ('${a3}', '${classA}', '2026-10-03', 100),
      ('${a4}', '${classA}', '2026-10-04', 100),
      ('${a5}', '${classA}', '2026-10-05', 100),
      ('${a6}', '${classA}', '2026-10-09', 100),
      ('${a7}', '${classA}', '2026-10-15', 555),
      ('${b1}', '${classB}', '2026-10-01', 100);

    insert into public.student_sessions(student_id, class_id, session_date, is_paid) values
      ('${s1}', '${classA}', '2026-10-01', false),
      ('${s1}', '${classA}', '2026-10-02', false),
      ('${s1}', '${classA}', '2026-10-03', true),
      ('${s1}', '${classB}', '2026-10-01', false),
      ('${s2}', '${classA}', '2026-10-01', false),
      ('${s3}', '${classA}', '2026-10-01', false),
      ('${s4}', '${classA}', '2026-10-09', false),
      ('${s5}', '${classA}', '2026-10-15', false);

    insert into public.attendance_records(id, session_id, student_id, is_present, fee_amount, payment_status, paid_at) values
      ('${r1}', '${a1}', '${s1}', true, 100, 'unpaid', null),
      ('${r2}', '${a2}', '${s1}', true, 120, 'unpaid', null),
      ('${r3}', '${a3}', '${s1}', true, 100, 'paid', '2026-10-03T10:00:00Z'),
      ('${r4}', '${a4}', '${s1}', false, 0, 'unpaid', null),
      ('${r5}', '${a5}', '${s1}', true, 100, 'waived', null),
      ('${r6}', '${a1}', '${s2}', true, 100, 'unpaid', null),
      ('${r7}', '${a1}', '${s3}', true, 99, 'unpaid', null),
      ('${r8}', '${b1}', '${s1}', true, 100, 'unpaid', null),
      ('${r9}', '${a6}', '${s4}', true, 100, 'unpaid', null),
      ('${r10}', '${a7}', '${s5}', true, 555, 'unpaid', null);

    insert into public.student_lock_intervals(student_id, start_date, end_date) values
      ('${s4}', '2026-10-08', null);
  `)

  // Apply the real migration under test.
  await db.exec(readFileSync(
    new URL('../migrations/20261107001000_collect_student_tuition.sql', import.meta.url),
    'utf8',
  ))

  const collect = async (studentId, receipt) => (await db.query(
    'select public.fn_collect_student_tuition($1, $2, $3, $4) as result',
    [classA, studentId, admin, receipt],
  )).rows[0].result

  const record = async (recordId) => (await db.query(
    'select * from public.attendance_records where id = $1',
    [recordId],
  )).rows[0]
  const session = async (studentId, classId, date) => (await db.query(
    'select * from public.student_sessions where student_id=$1 and class_id=$2 and session_date=$3',
    [studentId, classId, date],
  )).rows[0]
  const ledger = async (studentId = null) => {
    if (studentId) {
      return (await db.query(
        'select * from public.tuition_transactions where student_id=$1 order by created_at',
        [studentId],
      )).rows
    }
    return (await db.query('select * from public.tuition_transactions order by created_at')).rows
  }

  // Execute permission is fail-closed for anon/authenticated.
  for (const role of ['anon', 'authenticated']) {
    await db.exec(`set role ${role}`)
    await assert.rejects(
      () => collect(s1, `BL-DENIED-${role}`),
      (error) => error.code === '42501',
      `${role} must not execute the ledger RPC`,
    )
    await db.exec('reset role')
  }

  // Run as service_role to prove the grant actually works.
  await db.exec('set role service_role')

  // ---- 1. Correct scope is paid; unrelated data is untouched -------------
  const first = await collect(s1, 'BL-TEST-S1')
  assert.equal(Number(first.updated_sessions), 2)
  assert.equal(Number(first.updated_records), 2)
  assert.equal(Number(first.amount), 220)
  assert.ok(first.transaction_id, 'one ledger transaction id is returned')

  for (const recordId of [r1, r2]) {
    const r = await record(recordId)
    assert.equal(r.payment_status, 'paid')
    assert.ok(r.paid_at, 'paid_at is set on collected records')
  }
  // present + paid before the call must not change
  assert.equal((await record(r3)).payment_status, 'paid')
  // absent record must stay unpaid
  assert.equal((await record(r4)).payment_status, 'unpaid')
  assert.equal((await record(r4)).paid_at, null)
  // waived record must stay waived
  assert.equal((await record(r5)).payment_status, 'waived')
  // other student in the same class is untouched
  assert.equal((await record(r6)).payment_status, 'unpaid')
  assert.equal((await record(r7)).payment_status, 'unpaid')
  // same student in another class is untouched
  assert.equal((await record(r8)).payment_status, 'unpaid')

  assert.equal((await session(s1, classA, '2026-10-01')).is_paid, true)
  assert.equal((await session(s1, classA, '2026-10-02')).is_paid, true)
  assert.equal((await session(s1, classA, '2026-10-03')).is_paid, true)
  assert.equal((await session(s1, classB, '2026-10-01')).is_paid, false)
  assert.equal((await session(s2, classA, '2026-10-01')).is_paid, false)
  assert.equal((await session(s3, classA, '2026-10-01')).is_paid, false)

  const s1Ledger = await ledger(s1)
  assert.equal(s1Ledger.length, 1)
  assert.equal(s1Ledger[0].class_id, classA)
  assert.equal(s1Ledger[0].type, 'manual_collect')
  assert.equal(Number(s1Ledger[0].amount), 220)
  assert.equal(s1Ledger[0].receipt_no, 'BL-TEST-S1')
  assert.equal(s1Ledger[0].note, 'Thu toàn bộ nợ (2 buổi)')
  assert.equal(s1Ledger[0].created_by, admin)

  // ---- 2. Second call: no records -> amount 0 and no extra ledger -------
  const second = await collect(s1, 'BL-TEST-S1-SECOND')
  assert.equal(Number(second.updated_sessions), 0)
  assert.equal(Number(second.updated_records), 0)
  assert.equal(Number(second.amount), 0)
  assert.equal(second.transaction_id, null)
  assert.equal((await ledger(s1)).length, 1, 'idempotent second call must not add ledger')

  // ---- 3. Locked student: error is distinguishable ----------------------
  await assert.rejects(
    () => collect(s4, 'BL-TEST-S4'),
    (error) => /ATTENDANCE_LOCKED_STUDENT/.test(String(error.message || '')),
    'lock trigger error must be distinguishable for Edge 409 mapping',
  )
  assert.equal((await record(r9)).payment_status, 'unpaid')
  assert.equal((await session(s4, classA, '2026-10-09')).is_paid, false)
  assert.equal((await ledger(s4)).length, 0)

  // Simulate collect-class-tuition: per-student atomic RPC, skip errors,
  // continue with other students.
  const debtOracle = new Map([[s2, 100], [s4, 100]])
  const collected = []
  const skipped = []
  for (const [studentId, debt] of debtOracle) {
    try {
      const result = await collect(studentId, `BL-CLASS-${studentId.slice(-3)}`)
      collected.push({ studentId, amount: Number(result.amount), updatedCount: Number(result.updated_records), debt })
    } catch (error) {
      skipped.push({ studentId, reason: error.message })
    }
  }
  assert.deepEqual(skipped.map((s) => s.studentId), [s4])
  assert.deepEqual(collected.map((c) => c.studentId), [s2])
  assert.equal(collected[0].amount, 100)
  const nonSkippedDebt = collected.reduce((sum, row) => sum + row.debt, 0)
  const classLedger = (await ledger()).filter((tx) => tx.class_id === classA)
  assert.equal(
    classLedger.reduce((sum, tx) => sum + Number(tx.amount), 0),
    220 + nonSkippedDebt,
    'ledger sum equals debt of non-skipped collected students',
  )

  // ---- 4. Forced ledger failure rolls back every earlier change ---------
  await db.exec('reset role')
  await db.exec(`
    create function public.fn_test_fail_ledger() returns trigger language plpgsql as $$
    begin
      if new.amount = 555 then
        raise exception 'FORCED_LEDGER_FAILURE' using errcode = 'P0001';
      end if;
      return new;
    end;
    $$;
    create trigger trg_test_fail_ledger
      before insert on public.tuition_transactions
      for each row execute function public.fn_test_fail_ledger();
  `)
  await db.exec('set role service_role')

  await assert.rejects(
    () => collect(s5, 'BL-TEST-S5-FAIL'),
    (error) => /FORCED_LEDGER_FAILURE/.test(String(error.message || '')),
  )
  assert.equal((await record(r10)).payment_status, 'unpaid', 'record rollback after ledger failure')
  assert.equal((await record(r10)).paid_at, null)
  assert.equal((await session(s5, classA, '2026-10-15')).is_paid, false, 'session rollback after ledger failure')
  assert.equal((await ledger(s5)).length, 0)

  await db.exec('reset role')
  await db.exec('drop trigger trg_test_fail_ledger on public.tuition_transactions; drop function public.fn_test_fail_ledger();')
  await db.exec('set role service_role')
  const retry = await collect(s5, 'BL-TEST-S5')
  assert.equal(Number(retry.amount), 555)
  assert.equal((await record(r10)).payment_status, 'paid')
  assert.equal((await session(s5, classA, '2026-10-15')).is_paid, true)
  assert.equal((await ledger(s5)).length, 1)

  await db.exec('reset role')

  // Final invariant: only the debt collected by successful calls is in ledger.
  const totalLedger = (await ledger()).reduce((sum, tx) => sum + Number(tx.amount), 0)
  assert.equal(totalLedger, 220 + 100 + 555)

  console.log('Tuition collect RPC: scope/idempotency/rollback/lock/RBAC/ledger invariants PASS.')
} finally {
  await db.close()
}
