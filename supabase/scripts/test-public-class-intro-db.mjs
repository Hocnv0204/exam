// PostgreSQL/WASM (PGlite) test cho migration 20261122000000_public_class_intro.sql.
// Không mạng, không cloud, không dữ liệu thật.
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { pathToFileURL } from 'node:url'

if (!process.env.PGLITE_MODULE) {
  throw new Error('Set PGLITE_MODULE to an external @electric-sql/pglite dist/index.js path.')
}

const { PGlite } = await import(pathToFileURL(process.env.PGLITE_MODULE).href)
const db = new PGlite()

console.log('Running test-public-class-intro-db.mjs...')

// 1. Tạo roles và schema tối thiểu
await db.exec(`
  CREATE ROLE anon;
  CREATE ROLE authenticated;
  CREATE ROLE service_role BYPASSRLS;

  CREATE TABLE public.classes (
    id UUID PRIMARY KEY,
    name TEXT NOT NULL,
    description TEXT,
    grade_block TEXT NOT NULL,
    is_archived BOOLEAN NOT NULL DEFAULT FALSE
  );

  CREATE TABLE public.student_classes (
    student_id UUID NOT NULL,
    class_id UUID NOT NULL REFERENCES public.classes(id),
    status TEXT NOT NULL DEFAULT 'ACTIVE'
  );

  CREATE TABLE public.attendance_sessions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    class_id UUID NOT NULL REFERENCES public.classes(id),
    session_date DATE NOT NULL
  );

  GRANT USAGE ON SCHEMA public TO anon, authenticated, service_role;
  GRANT ALL ON ALL TABLES IN SCHEMA public TO service_role;
  GRANT SELECT ON ALL TABLES IN SCHEMA public TO anon, authenticated;
`)

// 2. Chạy migration 2 lần để kiểm tra tính an toàn khi chạy lại (idempotent)
const migrationSql = readFileSync(new URL('../migrations/20261122000000_public_class_intro.sql', import.meta.url), 'utf8')
await db.exec(migrationSql)
await db.exec(migrationSql)
console.log('✓ Migration executed idempotently')

// Helper function để bắt lỗi
const expectError = async (fn, pattern) => {
  try {
    await fn()
    assert.fail('Expected error but none was thrown')
  } catch (err) {
    if (pattern) {
      assert.match(String(err.message), pattern)
    }
  }
}

// 3. Kiểm tra CHECK constraints
await db.exec('SET ROLE service_role')
const badId1 = '00000000-0000-4000-8000-000000000091'
const badId2 = '00000000-0000-4000-8000-000000000092'
const badId3 = '00000000-0000-4000-8000-000000000093'
const badId4 = '00000000-0000-4000-8000-000000000094'

// 3.a public_schedule không phải mảng (object)
await expectError(
  () => db.query(`INSERT INTO public.classes (id, name, grade_block, public_schedule) VALUES ($1, 'Bad Schedule Object', '12-Toán', '{"key": "val"}'::jsonb)`, [badId1]),
  /classes_public_schedule_check/
)

// 3.b public_schedule không phải mảng (string/number)
await expectError(
  () => db.query(`INSERT INTO public.classes (id, name, grade_block, public_schedule) VALUES ($1, 'Bad Schedule String', '12-Toán', '"text"'::jsonb)`, [badId2]),
  /classes_public_schedule_check/
)

// 3.c max_students = 0
await expectError(
  () => db.query(`INSERT INTO public.classes (id, name, grade_block, max_students) VALUES ($1, 'Zero Max Students', '12-Toán', 0)`, [badId3]),
  /classes_max_students_check/
)

// 3.d max_students = 501
await expectError(
  () => db.query(`INSERT INTO public.classes (id, name, grade_block, max_students) VALUES ($1, 'Over Max Students', '12-Toán', 501)`, [badId4]),
  /classes_max_students_check/
)
console.log('✓ CHECK constraints enforced')

// 4. Tạo Fixture dữ liệu để so sánh với Oracle JS độc lập
const id = n => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`

const cListed1 = id(1)
const cListed2 = id(2)
const cListed3 = id(3)
const cUnlisted = id(4)
const cArchived = id(5)

const s1 = id(101)
const s2 = id(102)
const s3 = id(103)
const s4 = id(104)

const rawClasses = [
  {
    id: cListed1,
    name: 'Toán 12 Cơ Bản',
    description: 'Lớp ôn thi THPT',
    grade_block: '12-Toán',
    is_archived: false,
    public_listed: true,
    public_schedule: [{ day: 2, start: '18:00', end: '19:30' }],
    max_students: 30,
  },
  {
    id: cListed2,
    name: 'Hóa 11 Chuyên Sâu',
    description: 'Hóa học hữu cơ',
    grade_block: '11-Hóa',
    is_archived: false,
    public_listed: true,
    public_schedule: [{ day: 4, start: '19:00', end: '20:30' }, { day: 6, start: '19:00', end: '20:30' }],
    max_students: null,
  },
  {
    id: cListed3,
    name: 'Toán 10 Nâng Cao',
    description: 'Lớp nâng cao hình học',
    grade_block: '10-Toán',
    is_archived: false,
    public_listed: true,
    public_schedule: [],
    max_students: 20,
  },
  {
    id: cUnlisted,
    name: 'Lớp Riêng Chưa Mở',
    description: 'Chưa hiển thị',
    grade_block: '12-Toán',
    is_archived: false,
    public_listed: false, // unlisted
    public_schedule: [],
    max_students: 15,
  },
  {
    id: cArchived,
    name: 'Lớp Năm Ngoái Đã Lưu Trữ',
    description: 'Đã lưu trữ',
    grade_block: '11-Hóa',
    is_archived: true, // archived
    public_listed: true,
    public_schedule: [],
    max_students: 50,
  },
]

for (const c of rawClasses) {
  await db.query(
    `INSERT INTO public.classes (id, name, description, grade_block, is_archived, public_listed, public_schedule, max_students)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
    [c.id, c.name, c.description, c.grade_block, c.is_archived, c.public_listed, JSON.stringify(c.public_schedule), c.max_students]
  )
}

const rawStudentClasses = [
  // Lớp cListed1: 2 học sinh ACTIVE (s1, s2), s2 bị duplicate dòng trong DB, s3 PAUSED
  { student_id: s1, class_id: cListed1, status: 'ACTIVE' },
  { student_id: s2, class_id: cListed1, status: 'ACTIVE' },
  { student_id: s2, class_id: cListed1, status: 'ACTIVE' }, // Duplicate student_id
  { student_id: s3, class_id: cListed1, status: 'PAUSED' }, // PAUSED: không được đếm

  // Lớp cListed2: Không có học sinh nào -> 0

  // Lớp cListed3: 1 học sinh ACTIVE (s4)
  { student_id: s4, class_id: cListed3, status: 'ACTIVE' },

  // Lớp cUnlisted: có 2 học sinh ACTIVE
  { student_id: s1, class_id: cUnlisted, status: 'ACTIVE' },
  { student_id: s2, class_id: cUnlisted, status: 'ACTIVE' },

  // Lớp cArchived: có 1 học sinh ACTIVE
  { student_id: s3, class_id: cArchived, status: 'ACTIVE' },
]

for (const sc of rawStudentClasses) {
  await db.query(
    `INSERT INTO public.student_classes (student_id, class_id, status) VALUES ($1, $2, $3)`,
    [sc.student_id, sc.class_id, sc.status]
  )
}

const rawAttendanceSessions = [
  // Lớp cListed1: 3 buổi học
  { class_id: cListed1, session_date: '2026-11-01' },
  { class_id: cListed1, session_date: '2026-11-08' },
  { class_id: cListed1, session_date: '2026-11-15' },

  // Lớp cListed2: 0 buổi học -> 0

  // Lớp cListed3: 1 buổi học
  { class_id: cListed3, session_date: '2026-11-10' },

  // Lớp cUnlisted: 2 buổi học
  { class_id: cUnlisted, session_date: '2026-11-05' },
  { class_id: cUnlisted, session_date: '2026-11-12' },

  // Lớp cArchived: 5 buổi học
  { class_id: cArchived, session_date: '2026-10-01' },
]

for (const att of rawAttendanceSessions) {
  await db.query(
    `INSERT INTO public.attendance_sessions (class_id, session_date) VALUES ($1, $2)`,
    [att.class_id, att.session_date]
  )
}
console.log('✓ Fixture data inserted')

// 5. Oracle JS độc lập tính toán kết quả mong đợi
const oracleExpected = rawClasses
  .filter(c => c.public_listed === true && !c.is_archived)
  .map(c => {
    // Đếm DISTINCT student_id có status = 'ACTIVE'
    const activeStudentSet = new Set(
      rawStudentClasses
        .filter(sc => sc.class_id === c.id && sc.status === 'ACTIVE')
        .map(sc => sc.student_id)
    )
    const activeStudents = activeStudentSet.size

    // Đếm số buổi attendance_sessions
    const sessionsHeld = rawAttendanceSessions.filter(att => att.class_id === c.id).length

    return {
      class_id: c.id,
      name: c.name,
      grade_block: c.grade_block,
      description: c.description,
      schedule: c.public_schedule,
      max_students: c.max_students,
      active_students: activeStudents,
      sessions_held: sessionsHeld,
    }
  })
  .sort((a, b) => {
    const cmpGrade = a.grade_block.localeCompare(b.grade_block)
    if (cmpGrade !== 0) return cmpGrade
    return a.name.localeCompare(b.name)
  })

// 6. Gọi RPC bằng service_role và đối chiếu với Oracle JS
const rpcResult = await db.query('SELECT * FROM public.fn_public_class_intro()')
const rpcRows = rpcResult.rows

assert.equal(rpcRows.length, oracleExpected.length, 'Số lượng lớp trả về phải khớp với Oracle')

for (let i = 0; i < oracleExpected.length; i++) {
  const exp = oracleExpected[i]
  const act = rpcRows[i]

  assert.equal(act.class_id, exp.class_id)
  assert.equal(act.name, exp.name)
  assert.equal(act.grade_block, exp.grade_block)
  assert.equal(act.description, exp.description)
  assert.deepEqual(act.schedule, exp.schedule)
  assert.equal(act.max_students, exp.max_students)
  assert.equal(act.active_students, exp.active_students)
  assert.equal(act.sessions_held, exp.sessions_held)

  // Bảo đảm KHÔNG chứa bất kỳ cột nào lộ thông tin học sinh
  assert.equal(act.student_id, undefined)
  assert.equal(act.student_name, undefined)
  assert.equal(act.username, undefined)
}
console.log('✓ Oracle matches RPC results identically:')
console.log('  - Unlisted and archived classes excluded')
console.log('  - PAUSED students not counted')
console.log('  - Duplicate student rows not double counted')
console.log('  - Empty class -> 0 active students and 0 sessions')
console.log('  - Sorted by grade_block, then name')
console.log('  - No student information leaked')

// 7. Kiểm tra phân quyền: anon / authenticated bị cấm, service_role được gọi
await db.exec('SET ROLE anon')
await expectError(
  () => db.query('SELECT * FROM public.fn_public_class_intro()'),
  /permission denied/i
)
console.log('✓ anon role rejected with permission denied')

await db.exec('SET ROLE authenticated')
await expectError(
  () => db.query('SELECT * FROM public.fn_public_class_intro()'),
  /permission denied/i
)
console.log('✓ authenticated role rejected with permission denied')

await db.exec('SET ROLE service_role')
const allowedRes = await db.query('SELECT count(*)::int as cnt FROM public.fn_public_class_intro()')
assert.equal(allowedRes.rows[0].cnt, oracleExpected.length)
console.log('✓ service_role permitted successfully')

// 8. Migration 20261122010000: mặc định hiện mọi lớp + tổng học sinh khác nhau đang theo học
const followUpSql = readFileSync(new URL('../migrations/20261122010000_public_class_intro_default_listed.sql', import.meta.url), 'utf8')
await db.exec('RESET ROLE')
await db.exec(followUpSql)
await db.exec(followUpSql)
console.log('✓ Follow-up migration executed idempotently')

const allClasses = (await db.query('SELECT id, is_archived, public_listed FROM public.classes')).rows
assert.ok(allClasses.every(c => c.public_listed === true), 'mọi lớp hiện có phải được bật hiện')
const newId = '00000000-0000-4000-8000-00000000ffff'
await db.query(`INSERT INTO public.classes (id, name, grade_block) VALUES ($1, 'Lớp mới', '12-Toán')`, [newId])
assert.equal((await db.query('SELECT public_listed FROM public.classes WHERE id = $1', [newId])).rows[0].public_listed, true, 'lớp tạo mới mặc định hiện')

// Oracle JS: đếm học sinh khác nhau có ghi danh ACTIVE ở lớp chưa lưu trữ.
const archived = new Set(allClasses.filter(c => c.is_archived).map(c => c.id))
const enrollments = (await db.query('SELECT student_id, class_id, status FROM public.student_classes')).rows
const oracleTotal = new Set(enrollments.filter(e => e.status === 'ACTIVE' && !archived.has(e.class_id)).map(e => e.student_id)).size
const perClassSum = enrollments.filter(e => e.status === 'ACTIVE' && !archived.has(e.class_id)).length
assert.ok(oracleTotal > 0, 'fixture phải có học sinh ACTIVE')

await db.exec('SET ROLE service_role')
const totalRpc = (await db.query('SELECT public.fn_public_active_student_total() AS t')).rows[0].t
assert.equal(totalRpc, oracleTotal, 'tổng học sinh khớp oracle (không đếm trùng, bỏ PAUSED và lớp lưu trữ)')
const listedNow = (await db.query('SELECT count(*)::int AS cnt FROM public.fn_public_class_intro()')).rows[0].cnt
assert.equal(listedNow, allClasses.filter(c => !c.is_archived).length + 1, 'mọi lớp chưa lưu trữ (kể cả lớp mới) đều hiện')
console.log(`✓ Default listed + distinct active total = ${totalRpc} (per-class rows ${perClassSum})`)

for (const role of ['anon', 'authenticated']) {
  await db.exec(`SET ROLE ${role}`)
  await expectError(() => db.query('SELECT public.fn_public_active_student_total()'), /permission denied/i)
}
await db.exec('RESET ROLE')
console.log('✓ fn_public_active_student_total rejected for anon/authenticated')

console.log('ALL DB TESTS PASSED!')
