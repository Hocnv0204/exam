// PostgreSQL/WASM test for Phase 3C: class debt summary, attendance history,
// KPI stats, and dashboard financial aggregates RPCs (no network, no real data).
//
// Run:
//   PGLITE_MODULE=/path/to/@electric-sql/pglite/dist/index.js \
//   node supabase/scripts/test-debt-dashboard-rpc-db.mjs

import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { pathToFileURL } from 'node:url'

import {
  calcClassDebtSummary,
  calcAttendanceHistory,
  calcClassKpiStats,
} from '../functions/create-class/debt-calc.ts'

import {
  calcDashboardFinancial,
  calcDashboardSubmissions,
  mergeDashboard,
} from '../functions/dashboard/dashboard-calc.ts'

if (!process.env.PGLITE_MODULE) {
  throw new Error('Set PGLITE_MODULE to an external @electric-sql/pglite dist/index.js path.')
}

const { PGlite } = await import(pathToFileURL(process.env.PGLITE_MODULE).href)
const db = new PGlite()

// Seeded PRNG for deterministic, reproducible random testing
function mulberry32(a) {
  return function () {
    let t = (a += 0x6d2b79f5)
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}
const rng = mulberry32(20261107)
function randInt(min, max) {
  return Math.floor(rng() * (max - min + 1)) + min
}
function randChoice(arr) {
  return arr[randInt(0, arr.length - 1)]
}

const makeId = (prefix, n) => {
  const p = String(prefix).padStart(4, '0')
  const s = String(n).padStart(12, '0')
  return `00000000-0000-${p}-8000-${s}`
}

// 1. Setup base schema
await db.exec(`
  create role anon;
  create role authenticated;
  create role service_role bypassrls;

  create table public.classes(
    id uuid primary key,
    name text,
    tuition_fee numeric(12,2) not null default 0,
    grade_block text default '12-Toan'
  );

  create table public.profiles(
    id uuid primary key,
    username text not null,
    full_name text,
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

  create table public.class_sessions(
    id uuid primary key default gen_random_uuid(),
    class_id uuid not null references public.classes(id) on delete cascade,
    session_date date not null,
    unique(class_id, session_date)
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
    note text,
    created_at timestamptz not null default now(),
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
    end_date date,
    locked_at timestamptz not null default now()
  );

  create table public.chapters(
    id uuid primary key default gen_random_uuid(),
    class_id uuid not null references public.classes(id) on delete cascade,
    title text not null default 'Chuong 1'
  );

  create table public.lessons(
    id uuid primary key default gen_random_uuid(),
    chapter_id uuid not null references public.chapters(id) on delete cascade,
    title text not null default 'Bai 1'
  );

  create table public.homeworks(
    id uuid primary key default gen_random_uuid(),
    lesson_id uuid not null references public.lessons(id) on delete cascade,
    title text not null default 'BTVN',
    deadline timestamptz,
    is_published boolean not null default true
  );

  create table public.submissions(
    id uuid primary key default gen_random_uuid(),
    homework_id uuid not null references public.homeworks(id) on delete cascade,
    student_id uuid not null references public.profiles(id) on delete cascade,
    status text not null default 'SUBMITTED',
    total_score numeric,
    max_score numeric default 10,
    is_late boolean default false,
    submitted_at timestamptz default now()
  );

  grant usage on schema public to anon, authenticated, service_role;
`)

// 2. Load Phase 3C Migration SQL
const migrationPath = new URL('../migrations/20261107002000_debt_and_dashboard_rpc.sql', import.meta.url)
const migrationSql = readFileSync(migrationPath, 'utf8')
await db.exec(migrationSql)

// Assert comparator helpers
function assertMoney(actual, expected, message) {
  const a = Number(actual || 0)
  const e = Number(expected || 0)
  assert.ok(
    Math.abs(a - e) <= 0.01001,
    `${message}: expected money ${e}, got ${a} (diff ${Math.abs(a - e)})`
  )
}

function normalizeForDeepEqual(value) {
  if (Array.isArray(value)) return value.map(normalizeForDeepEqual)
  if (value && typeof value === 'object') {
    return Object.fromEntries(
      Object.entries(value).map(([key, item]) => [key, normalizeForDeepEqual(item)])
    )
  }
  if (typeof value === 'number') return Math.round(value * 100) / 100
  if (typeof value === 'string' && /^\d{4}-\d{2}-\d{2}T/.test(value)) {
    const timestamp = new Date(value)
    if (Number.isFinite(timestamp.getTime())) return timestamp.toISOString()
  }
  return value
}

function assertDeepBusinessEqual(actual, expected, message) {
  assert.deepStrictEqual(normalizeForDeepEqual(actual), normalizeForDeepEqual(expected), message)
}

function assertDebtSummaryEqual(actualList, expectedList) {
  assert.equal(actualList.length, expectedList.length, `Debt summary count mismatch`)
  for (let i = 0; i < actualList.length; i++) {
    const a = actualList[i]
    const e = expectedList[i]
    assert.equal(a.studentId, e.studentId, `[${i}] studentId`)
    assert.equal(a.username, e.username, `[${i}] username`)
    assert.equal(a.fullName, e.fullName, `[${i}] fullName`)
    assert.equal(a.studentCode, e.studentCode, `[${i}] studentCode`)
    assert.equal(a.status, e.status, `[${i}] status`)
    assertMoney(a.balance, e.balance, `[${i}] balance`)
    assert.equal(a.attendedSessions, e.attendedSessions, `[${i}] attendedSessions`)
    assert.equal(a.totalSessions, e.totalSessions, `[${i}] totalSessions`)
    assert.equal(a.paidSessions, e.paidSessions, `[${i}] paidSessions`)
    assert.equal(a.unpaidSessions, e.unpaidSessions, `[${i}] unpaidSessions`)
    assert.equal(a.waivedSessions, e.waivedSessions, `[${i}] waivedSessions`)
    assertMoney(a.paidAmount, e.paidAmount, `[${i}] paidAmount`)
    assertMoney(a.unpaidDebt, e.unpaidDebt, `[${i}] unpaidDebt`)
    assert.equal(a.attendanceRate, e.attendanceRate, `[${i}] attendanceRate`)
    assert.equal(a.isFullyPaid, e.isFullyPaid, `[${i}] isFullyPaid`)

    assert.equal(a.sessions.length, e.sessions.length, `[${i}] sessions length`)
    for (let j = 0; j < a.sessions.length; j++) {
      const as = a.sessions[j]
      const es = e.sessions[j]
      assert.equal(as.sessionDate, es.sessionDate, `[${i}][${j}] sessionDate`)
      assert.equal(as.recordId, es.recordId, `[${i}][${j}] recordId`)
      assert.equal(as.sessionId, es.sessionId, `[${i}][${j}] sessionId`)
      assert.equal(as.sessionNote, es.sessionNote, `[${i}][${j}] sessionNote`)
      assert.equal(as.isPresent, es.isPresent, `[${i}][${j}] isPresent`)
      assert.equal(as.isPaid, es.isPaid, `[${i}][${j}] isPaid`)
      assertMoney(as.feeAmount, es.feeAmount, `[${i}][${j}] feeAmount`)
      assert.equal(as.paymentStatus, es.paymentStatus, `[${i}][${j}] paymentStatus`)
      if (as.paidAt || es.paidAt) {
        assert.equal(new Date(as.paidAt).toISOString(), new Date(es.paidAt).toISOString(), `[${i}][${j}] paidAt`)
      }
      assert.equal(as.source, es.source, `[${i}][${j}] source`)
    }
  }
}

function assertKpiStatsEqual(actual, expected) {
  assert.deepStrictEqual(actual.totalStudents, expected.totalStudents, 'totalStudents mismatch')
  assert.equal(
    Math.round(actual.attendanceRate30Days * 10) / 10,
    Math.round(expected.attendanceRate30Days * 10) / 10,
    'attendanceRate30Days mismatch'
  )
  assertMoney(actual.uncollectedTuition.totalAmount, expected.uncollectedTuition.totalAmount, 'uncollectedTuition.totalAmount')
  assert.equal(actual.uncollectedTuition.owingStudentsCount, expected.uncollectedTuition.owingStudentsCount, 'owingStudentsCount')
  assert.deepStrictEqual(actual.homeworks, expected.homeworks, 'homeworks mismatch')
  assert.deepStrictEqual(actual.sessions, expected.sessions, 'sessions mismatch')
  if (expected.latestSession === null) {
    assert.equal(actual.latestSession, null, 'latestSession should be null')
  } else {
    assert.ok(actual.latestSession, 'latestSession should exist')
    assert.equal(actual.latestSession.sessionDate, expected.latestSession.sessionDate)
    assert.equal(actual.latestSession.presentCount, expected.latestSession.presentCount)
    assert.equal(actual.latestSession.totalCount, expected.latestSession.totalCount)
    assert.equal(actual.latestSession.note, expected.latestSession.note)
  }
}

function assertAttendanceHistoryEqual(actual, expected) {
  if (Array.isArray(expected)) {
    assert.ok(Array.isArray(actual), 'actual must be array')
    assert.equal(actual.length, expected.length, 'history array length')
    for (let i = 0; i < actual.length; i++) {
      const a = actual[i]
      const e = expected[i]
      assert.equal(a.sessionDate, e.sessionDate, `history[${i}].sessionDate`)
      assert.equal(a.id, e.id, `history[${i}].id`)
      assert.equal(a.classId, e.classId, `history[${i}].classId`)
      assert.equal(a.note, e.note, `history[${i}].note`)
      assertMoney(a.feePerSession, e.feePerSession, `history[${i}].feePerSession`)
      assert.equal(a.presentCount, e.presentCount, `history[${i}].presentCount`)
      assert.equal(a.absentCount, e.absentCount, `history[${i}].absentCount`)
      assert.equal(a.totalCount, e.totalCount, `history[${i}].totalCount`)
      assert.equal(a.paidCount, e.paidCount, `history[${i}].paidCount`)
      assert.equal(a.unpaidCount, e.unpaidCount, `history[${i}].unpaidCount`)
      assertMoney(a.totalFee, e.totalFee, `history[${i}].totalFee`)
      assert.equal(a.attendanceRate, e.attendanceRate, `history[${i}].attendanceRate`)
    }
  } else {
    assert.equal(actual.total, expected.total, 'history paged total')
    assert.equal(actual.page, expected.page, 'history paged page')
    assert.equal(actual.pageSize, expected.pageSize, 'history paged pageSize')
    assert.equal(actual.totalPages, expected.totalPages, 'history paged totalPages')
    assert.deepStrictEqual(actual.months, expected.months, 'history paged months')
    assert.equal(actual.items.length, expected.items.length, 'history paged items length')
    for (let i = 0; i < actual.items.length; i++) {
      const a = actual.items[i]
      const e = expected.items[i]
      assert.equal(a.sessionDate, e.sessionDate, `paged history[${i}].sessionDate`)
      assert.equal(a.presentCount, e.presentCount, `paged history[${i}].presentCount`)
      assert.equal(a.absentCount, e.absentCount, `paged history[${i}].absentCount`)
      assert.equal(a.totalCount, e.totalCount, `paged history[${i}].totalCount`)
      assertMoney(a.totalFee, e.totalFee, `paged history[${i}].totalFee`)
    }
  }
}

// Global data collections for Dashboard test
const globalStudents = []
const globalClasses = []
const globalStudentClasses = []
const globalClassSessions = []
const globalStudentSessions = []
const globalLockIntervals = []

// Fixed Edge Cases & Random Datasets Generator
const TOTAL_DATASETS = 210
console.log(`Starting Phase 3C verification with ${TOTAL_DATASETS} datasets (edge cases + seeded random)...`)

let classCounter = 0
let studentCounter = 0

for (let dsIndex = 0; dsIndex < TOTAL_DATASETS; dsIndex++) {
  classCounter++
  const classId = makeId(1, classCounter)
  const tuitionFee = randChoice([0, 100000, 150000, 200000, 250000])
  const className = `Lop ${classCounter}`

  await db.query(
    `insert into public.classes(id, name, tuition_fee, grade_block) values ($1, $2, $3, '12-Toan')`,
    [classId, className, tuitionFee]
  )
  globalClasses.push({ id: classId, name: className, tuition_fee: tuitionFee, grade_block: '12-Toan' })

  // Setup chapter and lesson for class homeworks
  const chapterId = makeId(2, classCounter)
  const lessonId = makeId(3, classCounter)
  await db.query(`insert into public.chapters(id, class_id, title) values ($1, $2, 'Chuong test')`, [chapterId, classId])
  await db.query(`insert into public.lessons(id, chapter_id, title) values ($1, $2, 'Bai test')`, [lessonId, chapterId])

  // Determine student count & structure based on test case
  let studentCount = 0
  let isEdgeCase = false

  if (dsIndex === 0) {
    // Edge case 1: Empty class (0 students, 0 sessions)
    studentCount = 0
    isEdgeCase = true
  } else if (dsIndex === 1) {
    // Edge case 2: Students present, 0 sessions
    studentCount = 3
    isEdgeCase = true
  } else if (dsIndex === 2) {
    // Edge case 3: 1 student fully locked (open interval end_date null)
    studentCount = 1
    isEdgeCase = true
  } else if (dsIndex === 3) {
    // Edge case 4: Student with closed interval [start_date, end_date)
    studentCount = 2
    isEdgeCase = true
  } else if (dsIndex === 4) {
    // Edge case 5: Two sources same-day collision (student_sessions is_paid=true, ar unpaid)
    studentCount = 2
    isEdgeCase = true
  } else if (dsIndex === 5) {
    // Edge case 6: Two sources same-day collision (student_sessions is_paid=false, ar waived)
    studentCount = 2
    isEdgeCase = true
  } else if (dsIndex === 6) {
    // Edge case 7: Two sources same-day collision (ar absent vs ss present)
    studentCount = 2
    isEdgeCase = true
  } else if (dsIndex === 7) {
    // Edge case 8: Pure legacy student (profiles.class_id, not in student_classes)
    studentCount = 2
    isEdgeCase = true
  } else if (dsIndex === 8) {
    // Edge case 9: PAUSED student status
    studentCount = 2
    isEdgeCase = true
  } else if (dsIndex === 9) {
    // Edge case 10: Homeworks open/closed/submitted/unsubmitted
    studentCount = 3
    isEdgeCase = true
  } else {
    // Random dataset
    studentCount = randChoice([0, 1, 2, 3, 5, 8])
  }

  const dsStudents = []
  const dsLockIntervals = []
  const dsStudentSessions = []
  const dsAttendanceSessions = []
  const dsAttendanceRecords = []
  const dsHomeworks = []
  const dsSubmissions = []

  for (let sIdx = 0; sIdx < studentCount; sIdx++) {
    studentCounter++
    const studentId = makeId(10, studentCounter)
    const username = `student_${studentCounter}`
    const fullName = `Hoc Sinh ${studentCounter}`
    const balance = randChoice([0, 0, 50000, 100000, 200000])

    let status = 'ACTIVE'
    let isLegacyOnly = false
    let isBoth = false

    if (dsIndex === 7 && sIdx === 0) {
      isLegacyOnly = true
    } else if (dsIndex === 8 && sIdx === 0) {
      status = 'PAUSED'
    } else {
      const mode = randChoice(['normal', 'normal', 'legacy', 'both', 'paused'])
      if (mode === 'legacy') isLegacyOnly = true
      else if (mode === 'both') isBoth = true
      else if (mode === 'paused') status = 'PAUSED'
    }

    const classIdForProfile = isLegacyOnly || isBoth ? classId : null

    await db.query(
      `insert into public.profiles(id, username, full_name, role, class_id, balance) values ($1, $2, $3, 'STUDENT', $4, $5)`,
      [studentId, username, fullName, classIdForProfile, balance]
    )
    globalStudents.push({ id: studentId, username, full_name: fullName, class_id: classIdForProfile })

    if (!isLegacyOnly) {
      await db.query(
        `insert into public.student_classes(student_id, class_id, status) values ($1, $2, $3)`,
        [studentId, classId, status]
      )
      globalStudentClasses.push({ student_id: studentId, class_id: classId })
    }

    dsStudents.push({
      id: studentId,
      username,
      fullName,
      status: isLegacyOnly ? 'ACTIVE' : status,
      balance,
      isLegacyOnly
    })

    // Lock intervals
    if (dsIndex === 2 && sIdx === 0) {
      // Open interval locking everything
      await db.query(
        `insert into public.student_lock_intervals(student_id, start_date, end_date) values ($1, '2026-10-01', null)`,
        [studentId]
      )
      const lockObj = { student_id: studentId, start_date: '2026-10-01', end_date: null }
      dsLockIntervals.push(lockObj)
      globalLockIntervals.push(lockObj)
    } else if (dsIndex === 3 && sIdx === 0) {
      // Closed interval
      await db.query(
        `insert into public.student_lock_intervals(student_id, start_date, end_date) values ($1, '2026-10-10', '2026-10-20')`,
        [studentId]
      )
      const lockObj = { student_id: studentId, start_date: '2026-10-10', end_date: '2026-10-20' }
      dsLockIntervals.push(lockObj)
      globalLockIntervals.push(lockObj)
    } else if (!isEdgeCase && randInt(1, 5) === 1) {
      const startDay = randInt(5, 15)
      const isEndNull = randInt(1, 3) === 1
      const startDate = `2026-10-${String(startDay).padStart(2, '0')}`
      const endDate = isEndNull ? null : `2026-10-${String(startDay + randInt(3, 8)).padStart(2, '0')}`
      await db.query(
        `insert into public.student_lock_intervals(student_id, start_date, end_date) values ($1, $2, $3)`,
        [studentId, startDate, endDate]
      )
      const lockObj = { student_id: studentId, start_date: startDate, end_date: endDate }
      dsLockIntervals.push(lockObj)
      globalLockIntervals.push(lockObj)
    }
  }

  // Generate sessions and attendance records
  const sessionDates = [
    '2026-10-05',
    '2026-10-12',
    '2026-10-15',
    '2026-10-22',
    '2026-11-01',
    '2026-11-05'
  ]

  let chosenDates = []
  if (dsIndex === 0 || dsIndex === 1) {
    chosenDates = []
  } else if (dsIndex === 4 || dsIndex === 5 || dsIndex === 6) {
    chosenDates = ['2026-10-12', '2026-10-22']
  } else {
    const numDates = randInt(0, sessionDates.length)
    chosenDates = sessionDates.slice(0, numDates)
  }

  let sessionCounter = 0
  for (const dateStr of chosenDates) {
    sessionCounter++
    const attSessionId = makeId(50, `${classCounter}${sessionCounter}`)
    const customFee = randChoice([0, tuitionFee, tuitionFee + 20000])
    const note = `Buoi hoc ${dateStr}`
    const createdAt = `${dateStr}T08:00:00+00:00`

    // Insert class_sessions for dashboard sync
    await db.query(
      `insert into public.class_sessions(class_id, session_date) values ($1, $2) on conflict do nothing`,
      [classId, dateStr]
    )
    globalClassSessions.push({ class_id: classId, session_date: dateStr })

    // Insert attendance_sessions
    await db.query(
      `insert into public.attendance_sessions(id, class_id, session_date, fee_per_session, note, created_at) values ($1, $2, $3, $4, $5, $6)`,
      [attSessionId, classId, dateStr, customFee, note, createdAt]
    )

    const attSessionObj = {
      id: attSessionId,
      class_id: classId,
      session_date: dateStr,
      fee_per_session: customFee,
      note,
      created_at: createdAt,
      records: []
    }
    dsAttendanceSessions.push(attSessionObj)

    for (const st of dsStudents) {
      let createSs = false
      let createAr = false
      let ssPaid = false
      let arPresent = true
      let arStatus = 'unpaid'
      let arFee = null

      if (dsIndex === 4) {
        // Collision: ss is_paid=true, ar unpaid -> merge is_paid=true
        createSs = true
        createAr = true
        ssPaid = true
        arPresent = true
        arStatus = 'unpaid'
      } else if (dsIndex === 5) {
        // Collision: ss is_paid=false, ar waived -> merge is_paid=false, waived
        createSs = true
        createAr = true
        ssPaid = false
        arPresent = true
        arStatus = 'waived'
      } else if (dsIndex === 6) {
        // Collision: ar absent (isPresent=false), ss present -> merge stays present!
        createSs = true
        createAr = true
        ssPaid = false
        arPresent = false
        arStatus = 'none'
      } else {
        createSs = randChoice([true, false, true])
        createAr = randChoice([true, false, true])
        ssPaid = randChoice([true, false])
        arPresent = randChoice([true, true, false])
        arStatus = arPresent ? randChoice(['unpaid', 'paid', 'waived']) : 'none'
        arFee = randChoice([null, customFee, customFee + 10000])
      }

      if (createSs) {
        const ssId = makeId(60, `${st.id.slice(-6)}${sessionCounter}`)
        await db.query(
          `insert into public.student_sessions(id, student_id, class_id, session_date, is_paid) values ($1, $2, $3, $4, $5)`,
          [ssId, st.id, classId, dateStr, ssPaid]
        )
        const ssObj = {
          id: ssId,
          student_id: st.id,
          class_id: classId,
          session_date: dateStr,
          is_paid: ssPaid
        }
        dsStudentSessions.push(ssObj)
        globalStudentSessions.push(ssObj)
      }

      if (createAr) {
        const arId = makeId(70, `${st.id.slice(-6)}${sessionCounter}`)
        const paidAt = arStatus === 'paid' ? '2026-10-25T10:00:00+00:00' : null
        await db.query(
          `insert into public.attendance_records(id, session_id, student_id, is_present, fee_amount, payment_status, paid_at)
           values ($1, $2, $3, $4, $5, $6, $7)`,
          [arId, attSessionId, st.id, arPresent, arFee || 0, arStatus, paidAt]
        )

        const arObj = {
          id: arId,
          session_id: attSessionId,
          student_id: st.id,
          session_date: dateStr,
          is_present: arPresent,
          fee_amount: arFee,
          payment_status: arStatus,
          paid_at: paidAt,
          attendance_sessions: {
            id: attSessionId,
            session_date: dateStr,
            note
          }
        }
        dsAttendanceRecords.push(arObj)
        attSessionObj.records.push(arObj)
      }
    }
  }

  // Generate Homeworks & Submissions
  const hwId1 = makeId(80, `${classCounter}1`)
  const hwId2 = makeId(80, `${classCounter}2`)
  // Homework 1: open in future
  await db.query(
    `insert into public.homeworks(id, lesson_id, title, is_published, deadline) values ($1, $2, 'BTVN Tuong lai', true, '2026-11-20T00:00:00Z')`,
    [hwId1, lessonId]
  )
  // Homework 2: past deadline
  await db.query(
    `insert into public.homeworks(id, lesson_id, title, is_published, deadline) values ($1, $2, 'BTVN Qua han', true, '2026-10-01T00:00:00Z')`,
    [hwId2, lessonId]
  )
  dsHomeworks.push(
    { id: hwId1, title: 'BTVN Tuong lai', is_published: true, deadline: '2026-11-20T00:00:00Z' },
    { id: hwId2, title: 'BTVN Qua han', is_published: true, deadline: '2026-10-01T00:00:00Z' }
  )

  // Homeworks and submissions generated above...
  // Sort dsStudents in the exact order create-class/index.ts populates studentMap:
  // 1. student_classes ordered by student_id
  // 2. legacy profiles ordered by id (if not already in map)
  const scStudents = dsStudents
    .filter((s) => !s.isLegacyOnly)
    .sort((a, b) => a.id.localeCompare(b.id))
  const scStudentIdSet = new Set(scStudents.map((s) => s.id))
  const legacyOnlyStudents = dsStudents
    .filter((s) => s.isLegacyOnly && !scStudentIdSet.has(s.id))
    .sort((a, b) => a.id.localeCompare(b.id))
  const orderedStudents = [...scStudents, ...legacyOnlyStudents]

  const nowParam = '2026-11-07T14:00:00.000Z'

  // ==========================================
  // RUN RPC AND ORACLE COMPARISONS FOR DATASET
  // ==========================================

  // 1. Debt Summary
  const rpcDebtRes = await db.query(
    `select public.fn_get_class_debt_summary($1) as data`,
    [classId]
  )
  const rpcDebt = rpcDebtRes.rows[0].data

  const oracleDebt = calcClassDebtSummary({
    classId,
    tuitionFee,
    students: orderedStudents,
    lockIntervals: dsLockIntervals,
    studentSessions: dsStudentSessions,
    attendanceRecords: dsAttendanceRecords
  })

  try {
    assertDebtSummaryEqual(rpcDebt, oracleDebt)
    assertDeepBusinessEqual(rpcDebt, oracleDebt, `Debt summary deep equality dsIndex=${dsIndex}`)
  } catch (err) {
    console.error(`Failed at DebtSummary dsIndex=${dsIndex}, classId=${classId}`)
    console.error('RPC:', JSON.stringify(rpcDebt, null, 2))
    console.error('Oracle:', JSON.stringify(oracleDebt, null, 2))
    throw err
  }

  // 2. Attendance History (non-paging and paging)
  const rpcHistNonPagingRes = await db.query(
    `select public.fn_get_class_attendance_history($1, null, 1, 10, false) as data`,
    [classId]
  )
  const rpcHistNonPaging = rpcHistNonPagingRes.rows[0].data

  const oracleHistNonPaging = calcAttendanceHistory({
    classId,
    tuitionFee,
    students: orderedStudents,
    lockIntervals: dsLockIntervals,
    attendanceSessions: dsAttendanceSessions,
    studentSessions: dsStudentSessions,
    hasPaging: false
  })
  try {
    assertAttendanceHistoryEqual(rpcHistNonPaging, oracleHistNonPaging)
    assertDeepBusinessEqual(rpcHistNonPaging, oracleHistNonPaging, `Attendance history deep equality dsIndex=${dsIndex}`)
  } catch (err) {
    console.error(`Failed at AttendanceHistory dsIndex=${dsIndex}, classId=${classId}`)
    console.error('RPC:', JSON.stringify(rpcHistNonPaging, null, 2))
    console.error('Oracle:', JSON.stringify(oracleHistNonPaging, null, 2))
    throw err
  }

  const rpcHistPagingRes = await db.query(
    `select public.fn_get_class_attendance_history($1, '2026-10', 1, 3, true) as data`,
    [classId]
  )
  const rpcHistPaging = rpcHistPagingRes.rows[0].data

  const oracleHistPaging = calcAttendanceHistory({
    classId,
    tuitionFee,
    students: orderedStudents,
    lockIntervals: dsLockIntervals,
    attendanceSessions: dsAttendanceSessions,
    studentSessions: dsStudentSessions,
    monthParam: '2026-10',
    page: 1,
    pageSize: 3,
    hasPaging: true
  })
  assertAttendanceHistoryEqual(rpcHistPaging, oracleHistPaging)
  assertDeepBusinessEqual(rpcHistPaging, oracleHistPaging, `Paged attendance history deep equality dsIndex=${dsIndex}`)

  // 3. KPI Stats
  const rpcKpiRes = await db.query(
    `select public.fn_get_class_kpi_stats($1, $2::timestamptz) as data`,
    [classId, nowParam]
  )
  const rpcKpi = rpcKpiRes.rows[0].data

  const oracleKpi = calcClassKpiStats({
    classId,
    tuitionFee,
    students: orderedStudents,
    lockIntervals: dsLockIntervals,
    attendanceSessions: dsAttendanceSessions,
    studentSessions: dsStudentSessions,
    homeworks: dsHomeworks,
    submissions: dsSubmissions,
    now: nowParam
  })
  try {
    assertKpiStatsEqual(rpcKpi, oracleKpi)
    assertDeepBusinessEqual(rpcKpi, oracleKpi, `KPI deep equality dsIndex=${dsIndex}`)
  } catch (err) {
    console.error(`Failed at KPI dsIndex=${dsIndex}, classId=${classId}`)
    console.error('RPC:', JSON.stringify(rpcKpi, null, 2))
    console.error('Oracle:', JSON.stringify(oracleKpi, null, 2))
    throw err
  }
}

console.log(`✓ All ${TOTAL_DATASETS} datasets passed Class Debt Summary, Attendance History, and KPI Stats deep assertions.`)

// ==========================================
// TEST 4: DASHBOARD FINANCIAL AGGREGATES
// ==========================================
console.log('Verifying Dashboard Financial RPC vs Oracle on entire database...')

// Một học sinh nhiều lớp để bắt lỗi thứ tự classIds/classNames và mapping many-to-many.
if (globalStudents.length > 0) {
  const multiStudent = globalStudents[0]
  const extraClass = globalClasses[globalClasses.length - 1]
  const alreadyMapped = globalStudentClasses.some(
    (sc) => sc.student_id === multiStudent.id && sc.class_id === extraClass.id
  )
  if (!alreadyMapped && multiStudent.class_id !== extraClass.id) {
    await db.query(
      `insert into public.student_classes(student_id, class_id, status) values ($1, $2, 'ACTIVE')`,
      [multiStudent.id, extraClass.id]
    )
    globalStudentClasses.push({ student_id: multiStudent.id, class_id: extraClass.id })
  }
}

const rpcDashRes = await db.query(`select public.fn_get_dashboard_financial_stats() as data`)
const rpcDash = rpcDashRes.rows[0].data

const oracleDash = calcDashboardFinancial({
  students: globalStudents,
  classes: globalClasses,
  studentClasses: globalStudentClasses,
  classSessions: globalClassSessions,
  studentSessions: globalStudentSessions,
  lockIntervals: globalLockIntervals
})

// Same locale-aware tie-break applied by dashboard/index.ts after the RPC.
rpcDash.studentAttendanceStats.sort((a, b) => {
  if (b.total.unpaidTuitionFee !== a.total.unpaidTuitionFee) {
    return b.total.unpaidTuitionFee - a.total.unpaidTuitionFee
  }
  if (b.total.attendedSessions !== a.total.attendedSessions) {
    return b.total.attendedSessions - a.total.attendedSessions
  }
  return String(a.fullName || '').localeCompare(String(b.fullName || ''), 'vi')
})

assert.equal(rpcDash.totalStudents, oracleDash.totalStudents, 'Dashboard totalStudents')
assert.equal(rpcDash.totalClasses, oracleDash.totalClasses, 'Dashboard totalClasses')
assert.equal(rpcDash.totalTaughtSessions, oracleDash.totalTaughtSessions, 'Dashboard totalTaughtSessions')
assertMoney(rpcDash.totalTuitionFee, oracleDash.totalTuitionFee, 'Dashboard totalTuitionFee')
assertMoney(rpcDash.totalPaidTuitionFee, oracleDash.totalPaidTuitionFee, 'Dashboard totalPaidTuitionFee')
assertMoney(rpcDash.totalUnpaidTuitionFee, oracleDash.totalUnpaidTuitionFee, 'Dashboard totalUnpaidTuitionFee')
assert.equal(rpcDash.collectionRate, oracleDash.collectionRate, 'Dashboard collectionRate')

// Verify monthlyStats
assert.equal(rpcDash.monthlyStats.length, oracleDash.monthlyStats.length, 'monthlyStats length')
for (let i = 0; i < rpcDash.monthlyStats.length; i++) {
  const rm = rpcDash.monthlyStats[i]
  const om = oracleDash.monthlyStats[i]
  assert.equal(rm.month, om.month, `monthly[${i}].month`)
  assert.equal(rm.label, om.label, `monthly[${i}].label`)
  assert.equal(rm.sessionCount, om.sessionCount, `monthly[${i}].sessionCount`)
  assertMoney(rm.tuitionFee, om.tuitionFee, `monthly[${i}].tuitionFee`)
  assertMoney(rm.paidTuitionFee, om.paidTuitionFee, `monthly[${i}].paidTuitionFee`)
  assertMoney(rm.unpaidTuitionFee, om.unpaidTuitionFee, `monthly[${i}].unpaidTuitionFee`)
  assert.equal(rm.studentSessionCount, om.studentSessionCount, `monthly[${i}].studentSessionCount`)
}

// Verify studentAttendanceStats
assert.equal(rpcDash.studentAttendanceStats.length, oracleDash.studentAttendanceStats.length, 'studentAttendanceStats length')
for (let i = 0; i < rpcDash.studentAttendanceStats.length; i++) {
  const rs = rpcDash.studentAttendanceStats[i]
  const os = oracleDash.studentAttendanceStats[i]
  assert.equal(rs.studentId, os.studentId, `student[${i}].studentId`)
  assert.equal(rs.username, os.username, `student[${i}].username`)
  assert.equal(rs.fullName, os.fullName, `student[${i}].fullName`)
  assert.deepStrictEqual(rs.classIds, os.classIds, `student[${i}].classIds`)
  assert.deepStrictEqual(rs.classNames, os.classNames, `student[${i}].classNames`)
  assert.equal(rs.className, os.className, `student[${i}].className`)
  assert.equal(rs.total.attendedSessions, os.total.attendedSessions, `student[${i}].total.attendedSessions`)
  assert.equal(rs.total.paidSessions, os.total.paidSessions, `student[${i}].total.paidSessions`)
  assert.equal(rs.total.unpaidSessions, os.total.unpaidSessions, `student[${i}].total.unpaidSessions`)
  assertMoney(rs.total.tuitionFee, os.total.tuitionFee, `student[${i}].total.tuitionFee`)
  assertMoney(rs.total.paidTuitionFee, os.total.paidTuitionFee, `student[${i}].total.paidTuitionFee`)
  assertMoney(rs.total.unpaidTuitionFee, os.total.unpaidTuitionFee, `student[${i}].total.unpaidTuitionFee`)
  assert.equal(rs.total.isFullyPaid, os.total.isFullyPaid, `student[${i}].total.isFullyPaid`)
  assert.deepStrictEqual(Object.keys(rs.monthly).sort(), Object.keys(os.monthly).sort(), `student[${i}].monthly keys`)
  for (const month of Object.keys(os.monthly)) {
    const rm = rs.monthly[month]
    const om = os.monthly[month]
    assert.equal(rm.attendedSessions, om.attendedSessions, `student[${i}].monthly.${month}.attendedSessions`)
    assert.equal(rm.paidSessions, om.paidSessions, `student[${i}].monthly.${month}.paidSessions`)
    assert.equal(rm.unpaidSessions, om.unpaidSessions, `student[${i}].monthly.${month}.unpaidSessions`)
    assertMoney(rm.tuitionFee, om.tuitionFee, `student[${i}].monthly.${month}.tuitionFee`)
    assertMoney(rm.paidTuitionFee, om.paidTuitionFee, `student[${i}].monthly.${month}.paidTuitionFee`)
    assertMoney(rm.unpaidTuitionFee, om.unpaidTuitionFee, `student[${i}].monthly.${month}.unpaidTuitionFee`)
    assert.equal(rm.isFullyPaid, om.isFullyPaid, `student[${i}].monthly.${month}.isFullyPaid`)
  }
}
assertDeepBusinessEqual(rpcDash, oracleDash, 'Dashboard financial full deep equality')
console.log('✓ Dashboard Financial RPC matches pure Oracle deep assertion.')

// Fail closed: aggregate RPCs are service-role only.
for (const role of ['anon', 'authenticated']) {
  await db.exec(`set role ${role}`)
  for (const sql of [
    `select public.fn_get_class_debt_summary('${makeId(1, 1)}')`,
    `select public.fn_get_class_attendance_history('${makeId(1, 1)}', null, 1, 10, false)`,
    `select public.fn_get_class_kpi_stats('${makeId(1, 1)}', now())`,
    `select public.fn_get_dashboard_financial_stats()`,
  ]) {
    await assert.rejects(() => db.query(sql), (error) => error.code === '42501')
  }
  await db.exec('reset role')
}
await db.exec('set role service_role')
await db.query(`select public.fn_get_dashboard_financial_stats()`)
await db.exec('reset role')

// Preserve the old `.single()` failure semantics for an unknown class.
const missingClassId = makeId(1, 999999)
for (const [sql, params] of [
  [`select public.fn_get_class_debt_summary($1)`, [missingClassId]],
  [`select public.fn_get_class_attendance_history($1, null, 1, 10, false)`, [missingClassId]],
  [`select public.fn_get_class_kpi_stats($1, now())`, [missingClassId]],
]) {
  await assert.rejects(
    () => db.query(sql, params),
    (error) => /Class not found/.test(String(error.message || '')),
  )
}

// Regression: logic gốc tạo một monthlyStats row cho tháng chỉ có submission.
{
  const submissionOnlyMonth = '2027-01'
  const submissionStats = calcDashboardSubmissions({
    submissions: [{
      id: 'submission-only-month',
      student_id: globalStudents[0]?.id,
      homework_id: makeId(80, 11),
      total_score: 8,
      max_score: 10,
      is_late: false,
      submitted_at: `${submissionOnlyMonth}-05T10:00:00+00:00`
    }],
    totalSubmissionsCount: 1,
    recentSubmissionsRaw: []
  })
  const merged = mergeDashboard(rpcDash, submissionStats, 0)
  const month = merged.monthlyStats.find((item) => item.month === submissionOnlyMonth)
  assert.ok(month, 'Submission-only month must remain in monthlyStats')
  assert.equal(month.submissionCount, 1, 'Submission-only month count')
  assert.equal(month.sessionCount, 0, 'Submission-only month session count')
  assertMoney(month.tuitionFee, 0, 'Submission-only month tuition')
}

// ==========================================
// TEST 5: MUTATION SELF-CHECK
// ==========================================
console.log('Running Mutation Self-Checks (intentionally mutating copies to verify comparator catches errors)...')

// Mutation 1: Corrupt unpaidDebt in debt summary copy
{
  const cloned = JSON.parse(JSON.stringify(rpcDashRes))
  const sampleDebt = (await db.query(`select public.fn_get_class_debt_summary($1) as data`, [makeId(1, 5)])).rows[0].data
  if (sampleDebt.length > 0) {
    const mutated = JSON.parse(JSON.stringify(sampleDebt))
    mutated[0].unpaidDebt += 1000 // deliberate corruption
    assert.throws(
      () => assertDebtSummaryEqual(mutated, sampleDebt),
      /unpaidDebt/,
      'Comparator must catch corrupted unpaidDebt mutation'
    )
  }
}

// Mutation rule: deliberately treat a waived attendance as unpaid; comparator must fail.
{
  const waivedDebt = (await db.query(`select public.fn_get_class_debt_summary($1) as data`, [makeId(1, 6)])).rows[0].data
  const mutated = JSON.parse(JSON.stringify(waivedDebt))
  const student = mutated.find((item) => item.sessions.some((session) => session.paymentStatus === 'waived'))
  assert.ok(student, 'Fixed waived edge case must contain a waived session')
  const waivedSession = student.sessions.find((session) => session.paymentStatus === 'waived')
  waivedSession.paymentStatus = 'unpaid'
  student.waivedSessions -= 1
  student.unpaidSessions += 1
  student.unpaidDebt += waivedSession.feeAmount
  assert.throws(
    () => assertDebtSummaryEqual(mutated, waivedDebt),
    /unpaidSessions|waivedSessions|paymentStatus|unpaidDebt/,
    'Comparator must reject the intentionally wrong waived-as-unpaid rule'
  )
}

// Mutation 2: Corrupt isPresent in attendance history copy
{
  const sampleHist = (await db.query(`select public.fn_get_class_attendance_history($1, null, 1, 10, false) as data`, [makeId(1, 5)])).rows[0].data
  if (sampleHist.length > 0) {
    const mutated = JSON.parse(JSON.stringify(sampleHist))
    mutated[0].presentCount += 1 // deliberate corruption
    assert.throws(
      () => assertAttendanceHistoryEqual(mutated, sampleHist),
      /presentCount/,
      'Comparator must catch corrupted presentCount mutation'
    )
  }
}

// Mutation 3: Corrupt attendanceRate30Days in KPI copy
{
  const sampleKpi = (await db.query(`select public.fn_get_class_kpi_stats($1, now()) as data`, [makeId(1, 5)])).rows[0].data
  const mutated = JSON.parse(JSON.stringify(sampleKpi))
  mutated.attendanceRate30Days = 12.3 // deliberate corruption
  assert.throws(
    () => assertKpiStatsEqual(mutated, sampleKpi),
    /attendanceRate30Days/,
    'Comparator must catch corrupted attendanceRate30Days mutation'
  )
}

// Mutation 4: Corrupt Dashboard totalTaughtSessions in copy
{
  const mutated = JSON.parse(JSON.stringify(rpcDash))
  mutated.totalTaughtSessions += 5 // deliberate corruption
  assert.throws(
    () => assert.equal(mutated.totalTaughtSessions, oracleDash.totalTaughtSessions),
    /AssertionError/,
    'Comparator must catch corrupted totalTaughtSessions mutation'
  )
}

console.log('✓ All 5 mutation self-checks successfully caught corrupted data/rule changes.')
console.log('Phase 3C RPC & Oracle Test: ALL CHECKS PASSED SUCCESSFULLY.')
