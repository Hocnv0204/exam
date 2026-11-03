// Independent invariants for the locked-student lifecycle (no DB/network).
// Run: node supabase/scripts/test-student-lock-lifecycle.mjs
//
// The test uses a small business oracle for date intervals and also checks the
// authoritative SQL/edge guards are present. It intentionally does not spin up
// Supabase or write production data.
import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

import {
  filterAttendanceRecordsForLock,
  filterStudentSessionDates,
  fetchLockIntervalsForStudents,
  isDateLockedOn,
  isStudentLockedOn,
  lockedStudentIdsOn,
  vnDateString,
} from '../shared/student-lock.ts'

const migration = readFileSync(
  new URL('../migrations/20261103000000_student_lock_intervals.sql', import.meta.url),
  'utf8',
)
const userActivity = readFileSync(
  new URL('../functions/user-activity/index.ts', import.meta.url),
  'utf8',
)
const createClass = readFileSync(
  new URL('../functions/create-class/index.ts', import.meta.url),
  'utf8',
)
const dashboard = readFileSync(
  new URL('../functions/dashboard/index.ts', import.meta.url),
  'utf8',
)

// Independent oracle: half-open interval [start_date, end_date).
function oracleLocked(date, intervals) {
  return intervals.some((i) =>
    i.start_date <= date && (i.end_date === null || date < i.end_date),
  )
}

const A = 'student-a'
const B = 'student-b'

test('VN date cutoff is independent from UTC near midnight', () => {
  // 23:59:59 VN on 2026-11-03 / 16:59:59 UTC
  assert.equal(vnDateString(new Date('2026-11-03T16:59:59Z')), '2026-11-03')
  // 00:00:00 VN on 2026-11-04 / 17:00:00 UTC
  assert.equal(vnDateString(new Date('2026-11-03T17:00:00Z')), '2026-11-04')
})

test('class reporting loads intervals and excludes only the locked student/date', async () => {
  const calls = []
  const rows = [
    { student_id: A, start_date: '2026-11-03', end_date: '2026-11-10' },
    { student_id: B, start_date: '2026-11-12', end_date: null },
  ]
  const client = { from(table) {
    assert.equal(table, 'student_lock_intervals')
    return { select() { return this }, in(_field, ids) {
      calls.push(ids)
      return Promise.resolve({ data: rows.filter(r => ids.includes(r.student_id)), error: null })
    } }
  } }
  const intervals = await fetchLockIntervalsForStudents(client, [A, B])
  assert.equal(calls.length, 1)
  assert.equal(isStudentLockedOn(A, '2026-11-02', intervals), false)
  assert.equal(isStudentLockedOn(A, '2026-11-05', intervals), true)
  assert.equal(isStudentLockedOn(A, '2026-11-10', intervals), false)
  assert.equal(isStudentLockedOn(B, '2026-11-05', intervals), false)
  assert.equal(isStudentLockedOn(B, '2026-11-12', intervals), true)
  assert.match(createClass, /get-attendance-history[\s\S]*?const eligible = .*isStudentLockedOn/)
  assert.match(createClass, /get-class-kpi-stats[\s\S]*?const eligible = .*isStudentLockedOn/)
  assert.match(createClass, /get-class-debt-summary[\s\S]*?const eligible = .*isStudentLockedOn/)
  assert.match(migration, /trg_student_classes_locked_guard/)
  assert.match(migration, /trg_profiles_locked_state_guard/)
  assert.match(migration, /'lock_settlement', -COALESCE\(v_old_balance, 0\), 0/)
  assert.match(migration, /SET is_locked = TRUE,\s*balance = 0/)
  assert.match(migration, /WHERE id = p_student_id\s*AND is_locked = FALSE\s*RETURNING balance/)
})

test('lock starts on start_date and an open interval excludes every later session', () => {
  const intervals = [{ student_id: A, start_date: '2026-11-03', end_date: null }]
  assert.equal(isDateLockedOn('2026-11-02', intervals), false) // pre-lock stays editable
  assert.equal(isDateLockedOn('2026-11-03', intervals), true) // lock date included
  assert.equal(isDateLockedOn('2026-11-30', intervals), true)
  assert.equal(oracleLocked('2026-11-03', intervals), true)
})

test('unlock date is active, locked-period sessions remain excluded afterwards', () => {
  // Unlocked on 2026-11-10 => interval [Nov 3, Nov 10).
  const intervals = [{ student_id: A, start_date: '2026-11-03', end_date: '2026-11-10' }]
  assert.equal(isDateLockedOn('2026-11-02', intervals), false)
  assert.equal(isDateLockedOn('2026-11-03', intervals), true)
  assert.equal(isDateLockedOn('2026-11-09', intervals), true)
  assert.equal(isDateLockedOn('2026-11-10', intervals), false)

  // Historical edits still see the lock after unlock: it is not retroactively
  // re-included just because end_date is now set.
  assert.equal(isDateLockedOn('2026-11-05', intervals), true)
  assert.equal(isStudentLockedOn(A, '2026-11-05', intervals), true)
})

test('same-day lock/unlock keeps that day locked but not the next day', () => {
  const intervals = [{ student_id: A, start_date: '2026-11-03', end_date: '2026-11-04' }]
  assert.equal(isDateLockedOn('2026-11-02', intervals), false)
  assert.equal(isDateLockedOn('2026-11-03', intervals), true)
  assert.equal(isDateLockedOn('2026-11-04', intervals), false)
})

test('multiple lock cycles keep each interval independent', () => {
  const intervals = [
    { student_id: A, start_date: '2026-11-03', end_date: '2026-11-10' },
    { student_id: A, start_date: '2026-11-20', end_date: '2026-11-25' },
  ]
  assert.equal(isDateLockedOn('2026-11-05', intervals), true)
  assert.equal(isDateLockedOn('2026-11-15', intervals), false)
  assert.equal(isDateLockedOn('2026-11-22', intervals), true)
  assert.equal(isDateLockedOn('2026-11-25', intervals), false)

  for (const date of ['2026-11-05', '2026-11-10', '2026-11-15', '2026-11-22', '2026-11-25']) {
    assert.equal(isDateLockedOn(date, intervals), oracleLocked(date, intervals), date)
  }
})

test('attendance pre-filter keeps pre-lock and excludes only the locked date', () => {
  const intervals = [{ student_id: A, start_date: '2026-11-03', end_date: '2026-11-10' }]
  const records = [
    { studentId: A, isPresent: true },
    { studentId: B, isPresent: true },
  ]

  const preLock = filterAttendanceRecordsForLock(records, '2026-11-02', intervals)
  assert.deepEqual(preLock.records.map((r) => r.studentId), [A, B])
  assert.deepEqual(preLock.skipped, [])

  const duringLock = filterAttendanceRecordsForLock(records, '2026-11-05', intervals)
  assert.deepEqual(duringLock.records.map((r) => r.studentId), [B])
  assert.deepEqual(duringLock.skipped.map((r) => r.studentId), [A])

  const afterUnlock = filterAttendanceRecordsForLock(records, '2026-11-10', intervals)
  assert.deepEqual(afterUnlock.records.map((r) => r.studentId), [A, B])

  // Repeating a historical edit after unlock must remain excluded.
  const historicalEdit = filterAttendanceRecordsForLock(records, '2026-11-05', intervals)
  assert.equal(historicalEdit.records.some((r) => r.studentId === A), false)
})

test('set-student-sessions cannot create pre-existing locked dates', () => {
  const intervals = [{ student_id: A, start_date: '2026-11-03', end_date: '2026-11-10' }]
  const result = filterStudentSessionDates(
    ['2026-11-02', '2026-11-03', '2026-11-05', '2026-11-10', '2026-11-12'],
    intervals,
  )
  assert.deepEqual(result.allowed, ['2026-11-02', '2026-11-10', '2026-11-12'])
  assert.deepEqual(result.skipped, ['2026-11-03', '2026-11-05'])
})

test('locked roster only includes students locked on that exact date', () => {
  const intervals = [
    { student_id: A, start_date: '2026-11-03', end_date: '2026-11-10' },
    { student_id: B, start_date: '2026-11-20', end_date: null },
  ]
  assert.deepEqual([...lockedStudentIdsOn('2026-11-05', intervals)], [A])
  assert.deepEqual([...lockedStudentIdsOn('2026-11-15', intervals)], [])
  assert.deepEqual([...lockedStudentIdsOn('2026-11-22', intervals)], [B])
})

test('manual PAUSED is preserved on unlock (snapshot by interval id)', () => {
  // Mirrors the SQL condition: only PAUSED rows marked by this interval are restored.
  const restore = (rows, intervalId) => rows.map((row) =>
    row.status === 'PAUSED' && row.lock_interval_id === intervalId
      ? { ...row, status: 'ACTIVE', lock_interval_id: null }
      : row,
  )
  const rows = [
    { class_id: 'auto', status: 'PAUSED', lock_interval_id: 'lock-1' },
    { class_id: 'manual-before', status: 'PAUSED', lock_interval_id: null },
    { class_id: 'manual-other', status: 'PAUSED', lock_interval_id: 'lock-old' },
    { class_id: 'already-active', status: 'ACTIVE', lock_interval_id: null },
  ]
  const restored = restore(rows, 'lock-1')
  assert.equal(restored.find((r) => r.class_id === 'auto').status, 'ACTIVE')
  assert.equal(restored.find((r) => r.class_id === 'manual-before').status, 'PAUSED')
  assert.equal(restored.find((r) => r.class_id === 'manual-other').status, 'PAUSED')
  assert.equal(restored.find((r) => r.class_id === 'already-active').status, 'ACTIVE')
})

test('SQL is the authoritative guard for attendance, tuition and enrollment', () => {
  assert.match(migration, /CREATE TABLE IF NOT EXISTS public\.student_lock_intervals/)
  assert.match(migration, /CREATE UNIQUE INDEX IF NOT EXISTS uq_student_lock_intervals_open/)
  assert.match(migration, /WHERE end_date IS NULL/)
  assert.match(migration, /Asia\/Ho_Chi_Minh/)
  assert.match(migration, /CREATE OR REPLACE FUNCTION public\.fn_student_locked_on/)
  assert.match(migration, /CREATE OR REPLACE FUNCTION public\.fn_set_student_lock/)
  assert.match(migration, /CREATE OR REPLACE FUNCTION public\.fn_purge_student_locked_attendance/)

  // Lock/unlock serializes with attendance writes and is idempotent.
  assert.match(migration, /FROM public\.profiles[\s\S]{0,80}FOR UPDATE/)
  assert.match(migration, /END_DATE IS NULL[\s\S]{0,120}FOR UPDATE|end_date IS NULL[\s\S]{0,120}FOR UPDATE/i)

  // Same-day lock+unlock remains a lock day ([start, start+1)).
  assert.match(migration, /v_end_date := v_start_date \+ 1/)

  // Lock only auto-pauses ACTIVE; unlock restores only rows tagged by interval.
  assert.match(migration, /UPDATE public\.student_classes\s+SET status = 'PAUSED',\s+lock_interval_id = v_interval_id\s+WHERE student_id = p_student_id\s+AND status = 'ACTIVE'/)
  assert.match(migration, /UPDATE public\.student_classes\s+SET status = 'ACTIVE',\s+lock_interval_id = NULL\s+WHERE student_id = p_student_id\s+AND lock_interval_id = v_interval_id\s+AND status = 'PAUSED'/)

  // Trigger blocks every writer, including old direct/fallback writes.
  assert.match(migration, /CREATE TRIGGER trg_attendance_records_locked_guard\s+BEFORE INSERT OR UPDATE ON public\.attendance_records/)
  assert.match(migration, /CREATE TRIGGER trg_student_sessions_locked_guard\s+BEFORE INSERT OR UPDATE ON public\.student_sessions/)
  assert.match(migration, /ATTENDANCE_LOCKED_STUDENT/)
  // Both guard triggers serialize INSERT with the lock RPC (no phantom row after purge).
  assert.equal(
    (migration.match(/FROM public\.profiles WHERE id = NEW\.student_id FOR UPDATE/g) || []).length,
    2,
  )
  assert.equal((migration.match(/IF TG_OP = 'INSERT' THEN/g) || []).length, 2)

  // Attendance RPC skips/refunds locked students before deducting wallet.
  assert.match(migration, /IF public\.fn_student_locked_on\(v_student_id, p_session_date\) THEN/)
  assert.match(migration, /skipped_locked_count/)
  assert.match(migration, /skippedLockedCount/)
  assert.match(migration, /PERFORM public\.fn_purge_student_locked_attendance\([\s\S]{0,160}v_student_id,\s*p_session_date,\s*p_session_date \+ 1/)
  assert.match(migration, /AND NOT public\.fn_student_locked_on\(ar\.student_id, ass\.session_date\)/)
  assert.match(migration, /AND NOT public\.fn_student_locked_on\(ar\.student_id, s\.session_date\)/)

  // Backfill currently locked accounts with a persistent interval.
  assert.match(migration, /WHERE p\.role = 'STUDENT'\s+AND p\.is_locked = TRUE/)
  assert.match(migration, /p\.updated_at AT TIME ZONE 'Asia\/Ho_Chi_Minh'/)
})

test('edge functions use DB interval guards, not optimistic UI-only checks', () => {
  assert.match(userActivity, /rpc\(\s*'fn_set_student_lock'/)
  assert.doesNotMatch(userActivity, /\.update\(\{\s*status:\s*locked \? 'PAUSED' : 'ACTIVE'\s*\}\)/)
  assert.doesNotMatch(userActivity, /from\('student_classes'\)\s*\n\s*\.update/)

  assert.match(createClass, /fetchLockedStudentIdsForDate/)
  assert.match(createClass, /fetchStudentLockIntervals/)
  assert.match(createClass, /filterStudentSessionDates/)
  assert.match(createClass, /const effectiveRecords = records\.filter/)
  assert.match(createClass, /isMissingRpcError/)
  assert.match(createClass, /Học sinh đang bị khóa tài khoản, không thể thêm vào lớp/)
  assert.match(createClass, /lock_interval_id: null/)

  assert.match(dashboard, /from\('student_lock_intervals'\)/)
  assert.match(dashboard, /isStudentLockedOn/)
})
