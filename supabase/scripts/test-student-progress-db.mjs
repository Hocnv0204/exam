// PostgreSQL/WASM test for student-progress RPCs with Independent JS Oracle
// Run:
//   PGLITE_MODULE=/tmp/claude-1000/-home-hocnguyen-Documents-Projects-Personal-Projects-exam/64012297-bb89-45c7-95c8-34a7a7f008e7/scratchpad/pglite/node_modules/@electric-sql/pglite/dist/index.js \
//   node supabase/scripts/test-student-progress-db.mjs

import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { pathToFileURL } from 'node:url'

if (!process.env.PGLITE_MODULE) {
  throw new Error('Set PGLITE_MODULE to an external @electric-sql/pglite dist/index.js path.')
}

const { PGlite } = await import(pathToFileURL(process.env.PGLITE_MODULE).href)
const db = new PGlite()

console.log('1. Setting up database schema in PGlite...')
await db.exec(`
  create role anon;
  create role authenticated;
  create role service_role bypassrls;

  create table public.classes(
    id uuid primary key,
    name text not null,
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
    student_id uuid references public.profiles(id) on delete cascade,
    status text not null default 'SUBMITTED',
    total_score numeric,
    max_score numeric default 10,
    is_late boolean default false,
    is_trial boolean default false,
    submitted_at timestamptz default now()
  );

  grant usage on schema public to anon, authenticated, service_role;
`)

console.log('2. Loading Migration 20261108000000_student_progress_rpc.sql...')
const migrationPath = new URL('../migrations/20261108000000_student_progress_rpc.sql', import.meta.url)
const migrationSql = readFileSync(migrationPath, 'utf8')
await db.exec(migrationSql)

console.log('3. Seeding Test Fixtures...')
// Identifiers
const c1 = '10000000-0000-0000-0000-000000000001'
const c2 = '10000000-0000-0000-0000-000000000002'

const s1 = '20000000-0000-0000-0000-000000000001' // Active in c1
const s2 = '20000000-0000-0000-0000-000000000002' // Active in c1, locked [2026-11-04, 2026-11-06)
const s3 = '20000000-0000-0000-0000-000000000003' // PAUSED in c1
const s4 = '20000000-0000-0000-0000-000000000004' // Active in c1 and c2

// Classes
await db.query(`insert into public.classes(id, name) values ($1, 'Toán 12A'), ($2, 'Văn 12B')`, [c1, c2])

// Profiles
await db.query(`
  insert into public.profiles(id, username, full_name, role, is_locked) values
    ($1, 'student_1', 'Nguyễn Văn An', 'STUDENT', false),
    ($2, 'student_2', 'Trần Thị Bình', 'STUDENT', false),
    ($3, 'student_3', 'Lê Hoàng Cường', 'STUDENT', false),
    ($4, 'student_4', 'Phạm Minh Đức', 'STUDENT', false)
`, [s1, s2, s3, s4])

// Student Classes
await db.query(`
  insert into public.student_classes(student_id, class_id, status) values
    ($1, $5, 'ACTIVE'),
    ($2, $5, 'ACTIVE'),
    ($3, $5, 'PAUSED'),
    ($4, $5, 'ACTIVE'),
    ($4, $6, 'ACTIVE')
`, [s1, s2, s3, s4, c1, c2])

// Student 2 Lock Interval: [2026-11-04, 2026-11-06)
await db.query(`
  insert into public.student_lock_intervals(student_id, start_date, end_date) values
    ($1, '2026-11-04', '2026-11-06')
`, [s2])

// Chapters & Lessons
const ch1 = '30000000-0000-0000-0000-000000000001'
const l1 = '40000000-0000-0000-0000-000000000001'
await db.query(`insert into public.chapters(id, class_id, title) values ($1, $2, 'Chương 1')`, [ch1, c1])
await db.query(`insert into public.lessons(id, chapter_id, title) values ($1, $2, 'Bài 1')`, [l1, ch1])

const ch2 = '30000000-0000-0000-0000-000000000002'
const l2 = '40000000-0000-0000-0000-000000000002'
await db.query(`insert into public.chapters(id, class_id, title) values ($1, $2, 'Chương 2')`, [ch2, c2])
await db.query(`insert into public.lessons(id, chapter_id, title) values ($1, $2, 'Bài 2')`, [l2, ch2])

// Homeworks
const hw1 = '50000000-0000-0000-0000-000000000001' // c1, published
const hw2 = '50000000-0000-0000-0000-000000000002' // c1, UNPUBLISHED
const hw3 = '50000000-0000-0000-0000-000000000003' // c1, published (late & 23:30 boundary test)
const hw4 = '50000000-0000-0000-0000-000000000004' // c2, published (other class)
await db.query(`
  insert into public.homeworks(id, lesson_id, title, is_published) values
    ($1, $5, 'BTVN Đạo hàm', true),
    ($2, $5, 'BTVN Chưa xuất bản', false),
    ($3, $5, 'BTVN Tích phân', true),
    ($4, $6, 'BTVN Văn học', true)
`, [hw1, hw2, hw3, hw4, l1, l2])

// Submissions
// s1 submissions
await db.query(`
  insert into public.submissions(id, homework_id, student_id, submitted_at, is_late, is_trial, status, total_score, max_score) values
    -- hw1: Attempt 1: 2026-11-05 10:00 UTC (17:00 VN), score 6/10, not late -> XP: 10 + round(10*9/10)=9 + 5 = 24. Date: 2026-11-05
    ('60000000-0000-0000-0000-000000000001', $1, $2, '2026-11-05T10:00:00Z', false, false, 'SUBMITTED', 6, 10),
    -- hw1: Attempt 2: 2026-11-06 02:00 UTC, score 9/10, not late (improves score)
    ('60000000-0000-0000-0000-000000000002', $1, $2, '2026-11-06T02:00:00Z', false, false, 'SUBMITTED', 9, 10),
    -- hw1: Attempt 3 (trial, must be ignored)
    ('60000000-0000-0000-0000-000000000003', $1, $2, '2026-11-06T03:00:00Z', false, true, 'SUBMITTED', 10, 10),
    -- hw1: Attempt 4 (status DRAFT, must be ignored)
    ('60000000-0000-0000-0000-000000000004', $1, $2, '2026-11-06T04:00:00Z', false, false, 'DRAFT', 10, 10),
    -- hw2 (unpublished, must be ignored)
    ('60000000-0000-0000-0000-000000000005', $3, $2, '2026-11-06T05:00:00Z', false, false, 'SUBMITTED', 10, 10),
    -- hw4 (c2, s1 is not enrolled, must be ignored)
    ('60000000-0000-0000-0000-000000000006', $4, $2, '2026-11-06T06:00:00Z', false, false, 'SUBMITTED', 10, 10),
    -- hw3: Boundary test: submitted at 2026-11-06 23:30:00Z (+7h = 2026-11-07 06:30 VN)
    -- is_late = true -> on_time = 0. total_score = 10, max_score = 10 -> score_xp = 10. Total XP = 20. Event date = 2026-11-07
    ('60000000-0000-0000-0000-000000000007', $5, $2, '2026-11-06T23:30:00Z', true, false, 'SUBMITTED', 10, 10)
`, [hw1, s1, hw2, hw4, hw3])

// s2 submissions
await db.query(`
  insert into public.submissions(id, homework_id, student_id, submitted_at, is_late, is_trial, status, total_score, max_score) values
    -- hw1: Attempt 1: 2026-11-05 10:00 UTC, late, score 10/10 -> XP: 10 + 10 + 0 = 20. Date: 2026-11-05
    ('60000000-0000-0000-0000-000000000010', $1, $2, '2026-11-05T10:00:00Z', true, false, 'SUBMITTED', 10, 10)
`, [hw1, s2])

// s4 submissions
await db.query(`
  insert into public.submissions(id, homework_id, student_id, submitted_at, is_late, is_trial, status, total_score, max_score) values
    -- hw1: Attempt 1: 2026-11-05 12:00 UTC, late, score 10/10 -> XP: 10 + 10 + 0 = 20. Date: 2026-11-05
    ('60000000-0000-0000-0000-000000000020', $1, $2, '2026-11-05T12:00:00Z', true, false, 'SUBMITTED', 10, 10)
`, [hw1, s4])

// Attendance Sessions for class 1:
// sess0: 2026-10-10 (earlier, outside current week)
// sess1: 2026-11-03 (Tue, this week)
// sess2: 2026-11-05 (Thu, inside s2's lock interval 2026-11-04..2026-11-06)
// sess3: 2026-11-06 (Fri, outside s2's lock interval)
const sess0 = '70000000-0000-0000-0000-000000000000'
const sess1 = '70000000-0000-0000-0000-000000000001'
const sess2 = '70000000-0000-0000-0000-000000000002'
const sess3 = '70000000-0000-0000-0000-000000000003'

await db.query(`
  insert into public.attendance_sessions(id, class_id, session_date, note) values
    ($1, $5, '2026-10-10', 'Buổi 0'),
    ($2, $5, '2026-11-03', 'Buổi 1'),
    ($3, $5, '2026-11-05', 'Buổi 2'),
    ($4, $5, '2026-11-06', 'Buổi 3')
`, [sess0, sess1, sess2, sess3, c1])

// Attendance Records:
await db.query(`
  insert into public.attendance_records(session_id, student_id, is_present) values
    -- sess0: s1 present, s2 present, s4 absent
    ($1, $5, true),
    ($1, $6, true),
    ($1, $7, false),
    -- sess1 (2026-11-03): s1 present, s2 present, s4 present (classTotal=3, classPresent=3)
    ($2, $5, true),
    ($2, $6, true),
    ($2, $7, true),
    -- sess2 (2026-11-05): s1 present, s2 present (but s2 locked!), s4 absent (classTotal=3, classPresent=2)
    ($3, $5, true),
    ($3, $6, true),
    ($3, $7, false),
    -- sess3 (2026-11-06): s1 NO RECORD (not counted), s2 present, s4 present (classTotal=2, classPresent=2)
    ($4, $6, true),
    ($4, $7, true)
`, [sess0, sess1, sess2, sess3, s1, s2, s4])

console.log('4. Building Independent JS Oracle from Raw Fixtures...')

// Pure JS Oracle Definitions
function oracleCalculateAttendance({
  sessions,
  records,
  lockIntervals,
  studentId,
  classId,
  fromDate,
  toDate,
}) {
  const filteredSessions = sessions.filter(
    (s) => s.class_id === classId && s.session_date >= fromDate && s.session_date <= toDate
  )

  const sessionItems = []
  let presentCount = 0
  let absentCount = 0
  let notCountedCount = 0
  const classRates = []

  for (const s of filteredSessions) {
    const sessionRecords = records.filter((r) => r.session_id === s.id)
    const classTotal = sessionRecords.length
    const classPresent = sessionRecords.filter((r) => r.is_present).length
    const classRate = classTotal > 0 ? Math.round((classPresent * 100 / classTotal) * 10) / 10 : null
    if (classTotal > 0) {
      classRates.push((classPresent * 100) / classTotal)
    }

    const isLocked = lockIntervals.some(
      (inv) =>
        inv.student_id === studentId &&
        inv.start_date <= s.session_date &&
        (inv.end_date === null || s.session_date < inv.end_date)
    )

    const myRec = sessionRecords.find((r) => r.student_id === studentId)
    let status = 'NOT_COUNTED'
    if (isLocked || !myRec) {
      status = 'NOT_COUNTED'
      notCountedCount++
    } else if (myRec.is_present) {
      status = 'PRESENT'
      presentCount++
    } else {
      status = 'ABSENT'
      absentCount++
    }

    sessionItems.push({
      sessionId: s.id,
      date: s.session_date,
      note: s.note,
      status,
      classPresent,
      classTotal,
      classRate,
    })
  }

  sessionItems.sort((a, b) => b.date.localeCompare(a.date) || a.sessionId.localeCompare(b.sessionId))

  const classSessions = filteredSessions.length
  const countedSessions = presentCount + absentCount
  const attendanceRate = countedSessions > 0 ? Math.round((presentCount * 100 / countedSessions) * 10) / 10 : null
  const classAverageRate =
    classRates.length > 0
      ? Math.round((classRates.reduce((a, b) => a + b, 0) / classRates.length) * 10) / 10
      : null

  return {
    classId,
    fromDate,
    toDate,
    summary: {
      classSessions,
      countedSessions,
      present: presentCount,
      absent: absentCount,
      notCounted: notCountedCount,
      attendanceRate,
      classAverageRate,
    },
    sessions: sessionItems,
  }
}

function oracleGetVnDate(dateInput) {
  // +7 hours
  const ms = typeof dateInput === 'string' ? Date.parse(dateInput) : dateInput.getTime()
  return new Date(ms + 7 * 3600000).toISOString().slice(0, 10)
}

function oracleCalculateAchievements({
  studentId,
  todayStr,
  homeworks,
  submissions,
  attendanceSessions,
  attendanceRecords,
  lockIntervals,
  studentClasses,
}) {
  const enrolledClasses = new Set(
    studentClasses.filter((sc) => sc.student_id === studentId).map((sc) => sc.class_id)
  )

  // 1. Homework XP Events
  const validSubs = submissions.filter((s) => {
    if (s.student_id !== studentId) return false
    if (s.status !== 'SUBMITTED' || s.is_trial) return false
    const hw = homeworks.find((h) => h.id === s.homework_id)
    if (!hw || !hw.is_published) return false
    if (!enrolledClasses.has(hw.class_id)) return false
    return true
  })

  // Group by homework_id
  const hwMap = new Map()
  for (const sub of validSubs) {
    if (!hwMap.has(sub.homework_id)) hwMap.set(sub.homework_id, [])
    hwMap.get(sub.homework_id).push(sub)
  }

  const xpEvents = []
  let completedCount = 0
  let perfectCount = 0
  let ontimeCount = 0

  for (const [hwId, subs] of hwMap.entries()) {
    completedCount++
    // Sort by submitted_at ASC, id ASC
    subs.sort((a, b) => a.submitted_at.localeCompare(b.submitted_at) || a.id.localeCompare(b.id))
    const firstSub = subs[0]
    const eventDate = oracleGetVnDate(firstSub.submitted_at)

    // Best sub: max total_score
    const bestSub = [...subs].sort(
      (a, b) => b.total_score - a.total_score || (b.total_score / (b.max_score || 1)) - (a.total_score / (a.max_score || 1))
    )[0]

    if (bestSub.max_score > 0 && bestSub.total_score >= bestSub.max_score) {
      perfectCount++
    }
    if (!firstSub.is_late) {
      ontimeCount++
    }

    const completionXp = 10
    const scoreXp = bestSub.max_score > 0 ? Math.round((10 * bestSub.total_score) / bestSub.max_score) : 0
    const ontimeXp = !firstSub.is_late ? 5 : 0
    const totalHwXp = completionXp + scoreXp + ontimeXp

    xpEvents.push({ eventDate, xp: totalHwXp, type: 'homework' })
  }

  // 2. Attendance XP Events
  let attendedSessionCount = 0
  for (const rec of attendanceRecords) {
    if (rec.student_id !== studentId || !rec.is_present) continue
    const sess = attendanceSessions.find((s) => s.id === rec.session_id)
    if (!sess || !enrolledClasses.has(sess.class_id)) continue

    const isLocked = lockIntervals.some(
      (inv) =>
        inv.student_id === studentId &&
        inv.start_date <= sess.session_date &&
        (inv.end_date === null || sess.session_date < inv.end_date)
    )
    if (isLocked) continue

    attendedSessionCount++
    xpEvents.push({ eventDate: sess.session_date, xp: 10, type: 'attendance' })
  }

  // Total XP & weekly XP
  const totalXp = xpEvents.reduce((sum, e) => sum + e.xp, 0)
  const level = Math.floor(totalXp / 200) + 1
  const levelXp = totalXp % 200
  const nextLevelXp = 200

  // Week range for todayStr
  const todayDate = new Date(`${todayStr}T00:00:00Z`)
  const dayOfWeek = (todayDate.getUTCDay() + 6) % 7
  const weekStart = new Date(todayDate.getTime() - dayOfWeek * 86400000).toISOString().slice(0, 10)
  const weekEnd = new Date(todayDate.getTime() + (6 - dayOfWeek) * 86400000).toISOString().slice(0, 10)

  const thisWeekXp = xpEvents
    .filter((e) => e.eventDate >= weekStart && e.eventDate <= weekEnd)
    .reduce((sum, e) => sum + e.xp, 0)

  // 3. Streak calculation
  const activeDatesSet = new Set()
  for (const sub of validSubs) {
    activeDatesSet.add(oracleGetVnDate(sub.submitted_at))
  }
  for (const rec of attendanceRecords) {
    if (rec.student_id !== studentId || !rec.is_present) continue
    const sess = attendanceSessions.find((s) => s.id === rec.session_id)
    if (!sess || !enrolledClasses.has(sess.class_id)) continue
    const isLocked = lockIntervals.some(
      (inv) =>
        inv.student_id === studentId &&
        inv.start_date <= sess.session_date &&
        (inv.end_date === null || sess.session_date < inv.end_date)
    )
    if (!isLocked) activeDatesSet.add(sess.session_date)
  }

  const allActiveDates = Array.from(activeDatesSet)
    .filter((d) => d <= todayStr)
    .sort()

  const activeToday = allActiveDates.includes(todayStr)
  const lastActiveDate = allActiveDates.length > 0 ? allActiveDates[allActiveDates.length - 1] : null

  // Calculate best streak
  let bestStreak = 0
  let curRun = 0
  for (let i = 0; i < allActiveDates.length; i++) {
    if (i === 0) {
      curRun = 1
    } else {
      const prevMs = Date.parse(`${allActiveDates[i - 1]}T00:00:00Z`)
      const curMs = Date.parse(`${allActiveDates[i]}T00:00:00Z`)
      if (Math.round((curMs - prevMs) / 86400000) === 1) {
        curRun++
      } else {
        curRun = 1
      }
    }
    if (curRun > bestStreak) bestStreak = curRun
  }

  // Calculate current streak
  let currentStreak = 0
  const yesterdayStr = new Date(Date.parse(`${todayStr}T00:00:00Z`) - 86400000).toISOString().slice(0, 10)

  let checkDate = activeToday ? todayStr : (allActiveDates.includes(yesterdayStr) ? yesterdayStr : null)
  if (checkDate) {
    while (allActiveDates.includes(checkDate)) {
      currentStreak++
      checkDate = new Date(Date.parse(`${checkDate}T00:00:00Z`) - 86400000).toISOString().slice(0, 10)
    }
  }

  return {
    today: todayStr,
    xp: {
      total: totalXp,
      level,
      levelXp,
      nextLevelXp,
      thisWeek: thisWeekXp,
    },
    streak: {
      current: currentStreak,
      best: bestStreak,
      activeToday,
      lastActiveDate,
    },
    badges: [
      { id: 'first-step', title: 'Khởi đầu', description: 'Hoàn thành bài tập đầu tiên', icon: 'fa-seedling', earned: completedCount >= 1, progress: Math.min(completedCount, 1), target: 1 },
      { id: 'hard-worker', title: 'Chăm chỉ', description: 'Hoàn thành 10 bài tập', icon: 'fa-book-open', earned: completedCount >= 10, progress: Math.min(completedCount, 10), target: 10 },
      { id: 'marathon', title: 'Bền bỉ', description: 'Hoàn thành 30 bài tập', icon: 'fa-person-running', earned: completedCount >= 30, progress: Math.min(completedCount, 30), target: 30 },
      { id: 'perfect', title: 'Điểm tuyệt đối', description: 'Đạt điểm tối đa ở một bài', icon: 'fa-star', earned: perfectCount >= 1, progress: Math.min(perfectCount, 1), target: 1 },
      { id: 'on-time', title: 'Đúng hẹn', description: 'Nộp đúng hạn lần đầu 10 bài', icon: 'fa-clock', earned: ontimeCount >= 10, progress: Math.min(ontimeCount, 10), target: 10 },
      { id: 'streak-3', title: 'Lửa nhỏ', description: 'Học 3 ngày liên tiếp', icon: 'fa-fire', earned: bestStreak >= 3, progress: Math.min(bestStreak, 3), target: 3 },
      { id: 'streak-7', title: 'Ngọn lửa tuần', description: 'Học 7 ngày liên tiếp', icon: 'fa-fire-flame-curved', earned: bestStreak >= 7, progress: Math.min(bestStreak, 7), target: 7 },
      { id: 'attendance-10', title: 'Chuyên cần', description: 'Có mặt 10 buổi học', icon: 'fa-clipboard-check', earned: attendedSessionCount >= 10, progress: Math.min(attendedSessionCount, 10), target: 10 },
    ],
  }
}

// Fixture objects in JS memory for oracle
const fixtureSessions = [
  { id: sess0, class_id: c1, session_date: '2026-10-10', note: 'Buổi 0' },
  { id: sess1, class_id: c1, session_date: '2026-11-03', note: 'Buổi 1' },
  { id: sess2, class_id: c1, session_date: '2026-11-05', note: 'Buổi 2' },
  { id: sess3, class_id: c1, session_date: '2026-11-06', note: 'Buổi 3' },
]

const fixtureRecords = [
  { session_id: sess0, student_id: s1, is_present: true },
  { session_id: sess0, student_id: s2, is_present: true },
  { session_id: sess0, student_id: s4, is_present: false },

  { session_id: sess1, student_id: s1, is_present: true },
  { session_id: sess1, student_id: s2, is_present: true },
  { session_id: sess1, student_id: s4, is_present: true },

  { session_id: sess2, student_id: s1, is_present: true },
  { session_id: sess2, student_id: s2, is_present: true }, // locked
  { session_id: sess2, student_id: s4, is_present: false },

  { session_id: sess3, student_id: s2, is_present: true },
  { session_id: sess3, student_id: s4, is_present: true },
]

const fixtureLockIntervals = [
  { student_id: s2, start_date: '2026-11-04', end_date: '2026-11-06' },
]

const fixtureHomeworks = [
  { id: hw1, class_id: c1, is_published: true },
  { id: hw2, class_id: c1, is_published: false },
  { id: hw3, class_id: c1, is_published: true },
  { id: hw4, class_id: c2, is_published: true },
]

const fixtureSubmissions = [
  { id: '60000000-0000-0000-0000-000000000001', homework_id: hw1, student_id: s1, submitted_at: '2026-11-05T10:00:00Z', is_late: false, is_trial: false, status: 'SUBMITTED', total_score: 6, max_score: 10 },
  { id: '60000000-0000-0000-0000-000000000002', homework_id: hw1, student_id: s1, submitted_at: '2026-11-06T02:00:00Z', is_late: false, is_trial: false, status: 'SUBMITTED', total_score: 9, max_score: 10 },
  { id: '60000000-0000-0000-0000-000000000003', homework_id: hw1, student_id: s1, submitted_at: '2026-11-06T03:00:00Z', is_late: false, is_trial: true, status: 'SUBMITTED', total_score: 10, max_score: 10 },
  { id: '60000000-0000-0000-0000-000000000004', homework_id: hw1, student_id: s1, submitted_at: '2026-11-06T04:00:00Z', is_late: false, is_trial: false, status: 'DRAFT', total_score: 10, max_score: 10 },
  { id: '60000000-0000-0000-0000-000000000005', homework_id: hw2, student_id: s1, submitted_at: '2026-11-06T05:00:00Z', is_late: false, is_trial: false, status: 'SUBMITTED', total_score: 10, max_score: 10 },
  { id: '60000000-0000-0000-0000-000000000006', homework_id: hw4, student_id: s1, submitted_at: '2026-11-06T06:00:00Z', is_late: false, is_trial: false, status: 'SUBMITTED', total_score: 10, max_score: 10 },
  { id: '60000000-0000-0000-0000-000000000007', homework_id: hw3, student_id: s1, submitted_at: '2026-11-06T23:30:00Z', is_late: true, is_trial: false, status: 'SUBMITTED', total_score: 10, max_score: 10 },

  { id: '60000000-0000-0000-0000-000000000010', homework_id: hw1, student_id: s2, submitted_at: '2026-11-05T10:00:00Z', is_late: true, is_trial: false, status: 'SUBMITTED', total_score: 10, max_score: 10 },

  { id: '60000000-0000-0000-0000-000000000020', homework_id: hw1, student_id: s4, submitted_at: '2026-11-05T12:00:00Z', is_late: true, is_trial: false, status: 'SUBMITTED', total_score: 10, max_score: 10 },
]

const fixtureStudentClasses = [
  { student_id: s1, class_id: c1, status: 'ACTIVE' },
  { student_id: s2, class_id: c1, status: 'ACTIVE' },
  { student_id: s3, class_id: c1, status: 'PAUSED' },
  { student_id: s4, class_id: c1, status: 'ACTIVE' },
  { student_id: s4, class_id: c2, status: 'ACTIVE' },
]

console.log('5. Running Verification Tests against Independent Oracle...')

// TEST A: fn_student_attendance
console.log('--- Test A: Attendance for student 1 (s1) ---')
{
  const res = await db.query(
    `select public.fn_student_attendance($1, $2, '2026-11-01'::date, '2026-11-07'::date) as data`,
    [s1, c1]
  )
  const actual = res.rows[0].data

  const oracle = oracleCalculateAttendance({
    sessions: fixtureSessions,
    records: fixtureRecords,
    lockIntervals: fixtureLockIntervals,
    studentId: s1,
    classId: c1,
    fromDate: '2026-11-01',
    toDate: '2026-11-07',
  })

  // Invariant 1: present + absent + notCounted = classSessions
  const s = actual.summary
  assert.equal(
    s.present + s.absent + s.notCounted,
    s.classSessions,
    'Invariant: present + absent + notCounted === classSessions'
  )
  assert.equal(s.countedSessions, s.present + s.absent, 'countedSessions === present + absent')

  // Compare actual with oracle
  assert.equal(actual.classId, c1)
  assert.equal(actual.className, 'Toán 12A')
  assert.deepStrictEqual(actual.summary, oracle.summary, 'Summary mismatch')
  assert.equal(actual.sessions.length, oracle.sessions.length, 'Sessions length mismatch')
  for (let i = 0; i < actual.sessions.length; i++) {
    assert.deepStrictEqual(actual.sessions[i], oracle.sessions[i], `Session [${i}] mismatch`)
  }
}
console.log('✓ Attendance s1 passed')

console.log('--- Test B: Attendance for student 2 (s2, locked interval test) ---')
{
  const res = await db.query(
    `select public.fn_student_attendance($1, $2, '2026-11-01'::date, '2026-11-07'::date) as data`,
    [s2, c1]
  )
  const actual = res.rows[0].data

  const oracle = oracleCalculateAttendance({
    sessions: fixtureSessions,
    records: fixtureRecords,
    lockIntervals: fixtureLockIntervals,
    studentId: s2,
    classId: c1,
    fromDate: '2026-11-01',
    toDate: '2026-11-07',
  })

  // Session on 2026-11-05 should be NOT_COUNTED because s2 is locked [2026-11-04, 2026-11-06)
  const sess2Actual = actual.sessions.find((sess) => sess.date === '2026-11-05')
  assert.ok(sess2Actual, 'Session 2026-11-05 exists')
  assert.equal(sess2Actual.status, 'NOT_COUNTED', 'Locked session must be NOT_COUNTED')

  // Invariant 1: present + absent + notCounted = classSessions
  const s = actual.summary
  assert.equal(s.present + s.absent + s.notCounted, s.classSessions)
  assert.deepStrictEqual(actual.summary, oracle.summary, 'Summary mismatch for s2')
}
console.log('✓ Attendance s2 (lock interval) passed')

// TEST C: fn_student_achievements
console.log('--- Test C: Achievements for student 1 (s1) on 2026-11-07 ---')
{
  const res = await db.query(
    `select public.fn_student_achievements($1, '2026-11-07'::date) as data`,
    [s1]
  )
  const actual = res.rows[0].data

  const oracle = oracleCalculateAchievements({
    studentId: s1,
    todayStr: '2026-11-07',
    homeworks: fixtureHomeworks,
    submissions: fixtureSubmissions,
    attendanceSessions: fixtureSessions,
    attendanceRecords: fixtureRecords,
    lockIntervals: fixtureLockIntervals,
    studentClasses: fixtureStudentClasses,
  })

  // Check XP breakdown:
  // hw1: 10 + 9 + 5 = 24 XP (submitted 2026-11-05)
  // hw3: 10 + 10 + 0 = 20 XP (submitted 2026-11-06 23:30 UTC -> 2026-11-07 VN)
  // sess0: 10 XP (2026-10-10)
  // sess1: 10 XP (2026-11-03)
  // sess2: 10 XP (2026-11-05)
  // Total = 24 + 20 + 10 + 10 + 10 = 74 XP
  assert.equal(actual.xp.total, 74, 'Total XP should be 74')
  assert.deepStrictEqual(actual.xp, oracle.xp, 'XP object mismatch')

  // Check streak:
  // Active days: 2026-10-10, 2026-11-03, 2026-11-05, 2026-11-06, 2026-11-07
  // Consecutive streak ending today (2026-11-07): 11-05, 11-06, 11-07 -> 3 days
  assert.equal(actual.streak.current, 3, 'Current streak should be 3')
  assert.equal(actual.streak.best, 3, 'Best streak should be 3')
  assert.equal(actual.streak.activeToday, true, 'Active today should be true')
  assert.equal(actual.streak.lastActiveDate, '2026-11-07', 'Last active date should be 2026-11-07')
  assert.deepStrictEqual(actual.streak, oracle.streak, 'Streak object mismatch')

  // Badges:
  for (let i = 0; i < actual.badges.length; i++) {
    const ab = actual.badges[i]
    const ob = oracle.badges[i]
    assert.equal(ab.id, ob.id, `Badge [${i}] id`)
    assert.equal(ab.earned, ob.earned, `Badge [${i}] earned`)
    assert.equal(ab.progress, ob.progress, `Badge [${i}] progress`)
    assert.equal(ab.target, ob.target, `Badge [${i}] target`)
    assert.ok(ab.progress <= ab.target, `Badge [${i}] progress <= target`)
  }
}
console.log('✓ Achievements s1 on 2026-11-07 passed')

// TEST D: Invariant check - streak when today hasn't studied but yesterday did
console.log('--- Test D: Streak invariant on 2026-11-08 (no activity today, activity yesterday) ---')
{
  const res = await db.query(
    `select public.fn_student_achievements($1, '2026-11-08'::date) as data`,
    [s1]
  )
  const actual = res.rows[0].data

  const oracle = oracleCalculateAchievements({
    studentId: s1,
    todayStr: '2026-11-08',
    homeworks: fixtureHomeworks,
    submissions: fixtureSubmissions,
    attendanceSessions: fixtureSessions,
    attendanceRecords: fixtureRecords,
    lockIntervals: fixtureLockIntervals,
    studentClasses: fixtureStudentClasses,
  })

  // Invariant: current streak continues from yesterday!
  assert.equal(actual.streak.activeToday, false, 'activeToday is false on 11-08')
  assert.equal(actual.streak.current, 3, 'current streak remains 3 because yesterday was active')
  assert.equal(actual.streak.best, 3, 'best streak is 3')
  assert.deepStrictEqual(actual.streak, oracle.streak, 'Streak matches oracle')
}
console.log('✓ Streak invariant (activity yesterday, none today) passed')

// TEST E: Invariant check - streak broken after two days of inactivity
console.log('--- Test E: Streak broken on 2026-11-09 ---')
{
  const res = await db.query(
    `select public.fn_student_achievements($1, '2026-11-09'::date) as data`,
    [s1]
  )
  const actual = res.rows[0].data
  assert.equal(actual.streak.activeToday, false)
  assert.equal(actual.streak.current, 0, 'current streak resets to 0 after gap')
  assert.equal(actual.streak.best, 3, 'best streak remains 3')
}
console.log('✓ Streak reset after gap passed')

// TEST F: Leaderboard & Tied ranks test
console.log('--- Test F: Class Leaderboard for class 1 (week 2026-11-02 to 2026-11-08) ---')
{
  const res = await db.query(
    `select public.fn_class_leaderboard($1, '2026-11-02'::date, '2026-11-08'::date) as data`,
    [c1]
  )
  const actual = res.rows[0].data

  // Active students in c1 are s1, s2, s4 (s3 is PAUSED -> excluded)
  assert.equal(actual.classId, c1)
  assert.equal(actual.className, 'Toán 12A')
  assert.equal(actual.totalStudents, 3, 'Total active students in c1 is 3 (s3 paused excluded)')

  // XP in week:
  // s1: sess1(10) + sess2(10) + hw1(24) + hw3(20) = 64 XP
  // s2: sess1(10) + sess3(10) + hw1(20) = 40 XP
  // s4: sess1(10) + sess3(10) + hw1(20) = 40 XP
  const stuMap = new Map(actual.students.map((s) => [s.studentId, s]))

  assert.ok(stuMap.has(s1))
  assert.ok(stuMap.has(s2))
  assert.ok(stuMap.has(s4))
  assert.equal(stuMap.has(s3), false, 's3 is PAUSED and must be excluded')

  assert.equal(stuMap.get(s1).xp, 64)
  assert.equal(stuMap.get(s2).xp, 40)
  assert.equal(stuMap.get(s4).xp, 40)

  // Invariant 2: XP leaderboard tuần <= XP tổng
  // For s1: week XP (64) <= total XP (74)
  const s1TotalXp = 74
  assert.ok(
    stuMap.get(s1).xp <= s1TotalXp,
    `Invariant: XP leaderboard tuần (${stuMap.get(s1).xp}) <= XP tổng (${s1TotalXp})`
  )

  // Check ranks: s1 is rank 1. s2 and s4 are TIED for rank 2.
  assert.equal(stuMap.get(s1).rank, 1, 's1 rank 1')
  assert.equal(stuMap.get(s2).rank, 2, 's2 tied rank 2')
  assert.equal(stuMap.get(s4).rank, 2, 's4 tied rank 2')
}
console.log('✓ Leaderboard week & XP invariant passed')

// TEST G: Tied rank 1 with 1, 1, 3 ranking
console.log('--- Test G: Tied Rank 1 (1, 1, 3 ranking test) ---')
{
  // In period 2026-11-06 to 2026-11-06 (sess3 only):
  // s2: sess3(10) = 10 XP
  // s4: sess3(10) = 10 XP
  // s1: no record for sess3, no hw on 11-06 = 0 XP
  // s2 and s4 tie for rank 1 with 10 XP each. Next student s1 MUST HAVE RANK 3 (1, 1, 3 ranking)!
  const res = await db.query(
    `select public.fn_class_leaderboard($1, '2026-11-06'::date, '2026-11-06'::date) as data`,
    [c1]
  )
  const actual = res.rows[0].data
  const stuMap = new Map(actual.students.map((s) => [s.studentId, s]))

  assert.equal(stuMap.get(s2).xp, 10)
  assert.equal(stuMap.get(s4).xp, 10)
  assert.equal(stuMap.get(s1).xp, 0)

  assert.equal(stuMap.get(s2).rank, 1, 's2 tied rank 1')
  assert.equal(stuMap.get(s4).rank, 1, 's4 tied rank 1')
  assert.equal(stuMap.get(s1).rank, 3, 's1 must be rank 3 (1, 1, 3 ranking)')
}
console.log('✓ Tied Rank 1 (1, 1, 3) passed')

// =====================================================================
// 6. Seeded Random Property-Based Testing (30 Diverse Datasets)
// =====================================================================
console.log('6. Running 30 Seeded Random Datasets against Independent Oracle...')

function mulberry32(a) {
  return function () {
    let t = (a += 0x6d2b79f5)
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}
const rng = mulberry32(20261108)
const randInt = (min, max) => Math.floor(rng() * (max - min + 1)) + min
const randChoice = (arr) => arr[randInt(0, arr.length - 1)]

for (let d = 1; d <= 30; d++) {
  const rndClassId = `80000000-0000-0000-0000-${String(d).padStart(12, '0')}`
  const rndClassName = `Lớp Random ${d}`
  await db.query(`insert into public.classes(id, name) values ($1, $2)`, [rndClassId, rndClassName])

  const rndChapId = `81000000-0000-0000-0000-${String(d).padStart(12, '0')}`
  const rndLesId = `82000000-0000-0000-0000-${String(d).padStart(12, '0')}`
  await db.query(`insert into public.chapters(id, class_id, title) values ($1, $2, 'Chương Rnd')`, [rndChapId, rndClassId])
  await db.query(`insert into public.lessons(id, chapter_id, title) values ($1, $2, 'Bài Rnd')`, [rndLesId, rndChapId])

  // 3-5 students
  const numStudents = randInt(3, 5)
  const rndStudents = []
  const rndStudentClasses = []
  const rndLockIntervals = []

  for (let sIdx = 1; sIdx <= numStudents; sIdx++) {
    const stuId = `83000000-0000-0000-${String(d).padStart(4, '0')}-${String(sIdx).padStart(12, '0')}`
    const status = sIdx === numStudents ? randChoice(['ACTIVE', 'PAUSED']) : 'ACTIVE'
    const fullName = `Học Sinh Rnd ${d}_${sIdx}`
    await db.query(
      `insert into public.profiles(id, username, full_name, role) values ($1, $2, $3, 'STUDENT')`,
      [stuId, `rnd_${d}_${sIdx}`, fullName]
    )
    await db.query(
      `insert into public.student_classes(student_id, class_id, status) values ($1, $2, $3)`,
      [stuId, rndClassId, status]
    )

    rndStudents.push({ id: stuId, fullName, status })
    rndStudentClasses.push({ student_id: stuId, class_id: rndClassId, status })

    // Maybe a lock interval
    if (randInt(1, 3) === 1) {
      const startDay = randInt(2, 5)
      const lockObj = {
        student_id: stuId,
        start_date: `2026-11-0${startDay}`,
        end_date: `2026-11-0${startDay + 2}`,
      }
      await db.query(
        `insert into public.student_lock_intervals(student_id, start_date, end_date) values ($1, $2, $3)`,
        [stuId, lockObj.start_date, lockObj.end_date]
      )
      rndLockIntervals.push(lockObj)
    }
  }

  // 2-3 homeworks
  const numHw = randInt(2, 3)
  const rndHomeworks = []
  const rndSubmissions = []

  for (let hIdx = 1; hIdx <= numHw; hIdx++) {
    const hwId = `84000000-0000-0000-${String(d).padStart(4, '0')}-${String(hIdx).padStart(12, '0')}`
    const isPub = hIdx === 1 ? true : randChoice([true, false])
    await db.query(
      `insert into public.homeworks(id, lesson_id, title, is_published) values ($1, $2, $3, $4)`,
      [hwId, rndLesId, `BTVN Rnd ${hIdx}`, isPub]
    )
    rndHomeworks.push({ id: hwId, class_id: rndClassId, is_published: isPub })

    // Random submissions for students
    for (const stu of rndStudents) {
      const numAttempts = randInt(0, 3)
      for (let att = 1; att <= numAttempts; att++) {
        const subId = `85000000-0000-${String(d).padStart(4, '0')}-${String(hIdx).padStart(4, '0')}-${String(rndSubmissions.length + 1).padStart(12, '0')}`
        const subDay = randInt(2, 6)
        const subHour = randInt(0, 23)
        const subMin = randInt(0, 59)
        const submittedAt = `2026-11-0${subDay}T${String(subHour).padStart(2, '0')}:${String(subMin).padStart(2, '0')}:00Z`
        const isLate = randChoice([true, false])
        const isTrial = randChoice([false, false, false, true])
        const subStatus = randChoice(['SUBMITTED', 'SUBMITTED', 'DRAFT'])
        const totalScore = randInt(4, 10)

        await db.query(
          `insert into public.submissions(id, homework_id, student_id, submitted_at, is_late, is_trial, status, total_score, max_score) values
           ($1, $2, $3, $4, $5, $6, $7, $8, 10)`,
          [subId, hwId, stu.id, submittedAt, isLate, isTrial, subStatus, totalScore]
        )

        rndSubmissions.push({
          id: subId,
          homework_id: hwId,
          student_id: stu.id,
          submitted_at: submittedAt,
          is_late: isLate,
          is_trial: isTrial,
          status: subStatus,
          total_score: totalScore,
          max_score: 10,
        })
      }
    }
  }

  // 3-4 attendance sessions
  const numSess = randInt(3, 4)
  const rndSessions = []
  const rndRecords = []

  for (let seIdx = 1; seIdx <= numSess; seIdx++) {
    const sessId = `86000000-0000-0000-${String(d).padStart(4, '0')}-${String(seIdx).padStart(12, '0')}`
    const sessDate = `2026-11-0${seIdx + 1}`
    await db.query(
      `insert into public.attendance_sessions(id, class_id, session_date, note) values ($1, $2, $3, 'Buổi Rnd')`,
      [sessId, rndClassId, sessDate]
    )
    rndSessions.push({ id: sessId, class_id: rndClassId, session_date: sessDate, note: 'Buổi Rnd' })

    for (const stu of rndStudents) {
      if (randChoice([true, true, false])) {
        const isPres = randChoice([true, true, false])
        await db.query(
          `insert into public.attendance_records(session_id, student_id, is_present) values ($1, $2, $3)`,
          [sessId, stu.id, isPres]
        )
        rndRecords.push({ session_id: sessId, student_id: stu.id, is_present: isPres })
      }
    }
  }

  // Run comparisons for student 1 in this dataset
  const testStudent = rndStudents[0]
  const fromDate = '2026-11-01'
  const toDate = '2026-11-07'

  // Attendance Check
  const attRes = await db.query(
    `select public.fn_student_attendance($1, $2, $3::date, $4::date) as data`,
    [testStudent.id, rndClassId, fromDate, toDate]
  )
  const attActual = attRes.rows[0].data
  const attOracle = oracleCalculateAttendance({
    sessions: rndSessions,
    records: rndRecords,
    lockIntervals: rndLockIntervals,
    studentId: testStudent.id,
    classId: rndClassId,
    fromDate,
    toDate,
  })

  assert.equal(
    attActual.summary.present + attActual.summary.absent + attActual.summary.notCounted,
    attActual.summary.classSessions,
    `[ds ${d}] Attendance invariant failed`
  )
  assert.deepStrictEqual(attActual.summary, attOracle.summary, `[ds ${d}] Attendance summary mismatch`)

  // Achievements Check
  const achRes = await db.query(
    `select public.fn_student_achievements($1, '2026-11-07'::date) as data`,
    [testStudent.id]
  )
  const achActual = achRes.rows[0].data
  const achOracle = oracleCalculateAchievements({
    studentId: testStudent.id,
    todayStr: '2026-11-07',
    homeworks: rndHomeworks,
    submissions: rndSubmissions,
    attendanceSessions: rndSessions,
    attendanceRecords: rndRecords,
    lockIntervals: rndLockIntervals,
    studentClasses: rndStudentClasses,
  })

  assert.deepStrictEqual(achActual.xp, achOracle.xp, `[ds ${d}] XP mismatch`)
  assert.deepStrictEqual(achActual.streak, achOracle.streak, `[ds ${d}] Streak mismatch`)

  // Leaderboard Check
  const lbRes = await db.query(
    `select public.fn_class_leaderboard($1, $2::date, $3::date) as data`,
    [rndClassId, fromDate, toDate]
  )
  const lbActual = lbRes.rows[0].data
  const activeStudentCount = rndStudents.filter((s) => s.status === 'ACTIVE').length
  assert.equal(lbActual.totalStudents, activeStudentCount, `[ds ${d}] Leaderboard totalStudents mismatch`)

  // Invariant: Week XP in leaderboard <= Total XP
  const stuEntry = lbActual.students.find((s) => s.studentId === testStudent.id)
  if (stuEntry) {
    assert.ok(stuEntry.xp <= achActual.xp.total, `[ds ${d}] Week XP <= Total XP invariant failed`)
  }
}
console.log('✓ All 30 Seeded Random Property-Based Datasets Passed with 100% assertions!')

console.log('=====================================================================')
console.log('ALL DB RPC & ORACLE TESTS PASSED (100% assertions verified)!')
console.log('=====================================================================')
