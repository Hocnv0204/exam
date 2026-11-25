// PostgreSQL/WASM (PGlite) test cho migration 20261125100001_report_class_stats.sql.
// Không mạng, không cloud, không dữ liệu thật.
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { pathToFileURL } from 'node:url'

const pglitePath = process.env.PGLITE_MODULE || '/tmp/claude-1000/-home-hocnguyen-Documents-Projects-Personal-Projects-exam/cde7740b-bec0-4e24-a388-a3955b20ad33/scratchpad/pglite/node_modules/@electric-sql/pglite/dist/index.js'
const { PGlite } = await import(pathToFileURL(pglitePath).href)
const db = new PGlite()

console.log('Running test-report-class-stats-db.mjs...')

// 1. Tạo roles và schema tối thiểu
await db.exec(`
  CREATE ROLE anon;
  CREATE ROLE authenticated;
  CREATE ROLE service_role BYPASSRLS;

  CREATE TABLE public.classes (
    id UUID PRIMARY KEY,
    name TEXT NOT NULL,
    description TEXT,
    grade_block TEXT,
    is_archived BOOLEAN NOT NULL DEFAULT FALSE
  );

  CREATE TABLE public.chapters (
    id UUID PRIMARY KEY,
    class_id UUID NOT NULL REFERENCES public.classes(id),
    title TEXT NOT NULL
  );

  CREATE TABLE public.lessons (
    id UUID PRIMARY KEY,
    chapter_id UUID NOT NULL REFERENCES public.chapters(id),
    title TEXT NOT NULL,
    is_trial BOOLEAN NOT NULL DEFAULT FALSE
  );

  CREATE TABLE public.homeworks (
    id UUID PRIMARY KEY,
    lesson_id UUID NOT NULL REFERENCES public.lessons(id),
    title TEXT NOT NULL,
    max_score NUMERIC DEFAULT 10,
    is_published BOOLEAN NOT NULL DEFAULT TRUE
  );

  CREATE TABLE public.student_classes (
    student_id UUID NOT NULL,
    class_id UUID NOT NULL REFERENCES public.classes(id),
    status TEXT NOT NULL DEFAULT 'ACTIVE'
  );

  CREATE TABLE public.submissions (
    id UUID PRIMARY KEY,
    student_id UUID NOT NULL,
    homework_id UUID NOT NULL REFERENCES public.homeworks(id),
    total_score NUMERIC NOT NULL,
    max_score NUMERIC,
    status TEXT NOT NULL DEFAULT 'SUBMITTED',
    submitted_at TIMESTAMPTZ NOT NULL
  );

  GRANT USAGE ON SCHEMA public TO anon, authenticated, service_role;
  GRANT ALL ON ALL TABLES IN SCHEMA public TO service_role;
  GRANT SELECT ON ALL TABLES IN SCHEMA public TO anon, authenticated;
`)

// 2. Chạy migration 2 lần để kiểm tra idempotent
const migrationSql = readFileSync(new URL('../migrations/20261125100001_report_class_stats.sql', import.meta.url), 'utf8')
await db.exec(migrationSql)
await db.exec(migrationSql)
console.log('✓ Migration executed idempotently')

// 3. Fixtures
const id = (n) => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`
const class1 = id(1)
const class2 = id(2)

const ch1 = id(10)
const ch2 = id(20)

const les1 = id(100)
const les2 = id(200)
const lesTrial = id(300)

const hw1 = id(1000) // max_score 10
const hw2 = id(2000) // max_score 20
const hwUnpublished = id(3000)
const hwTrial = id(4000)

const s1 = id(101) // Active
const s2 = id(102) // Active
const s3 = id(103) // Active, no submissions
const sPaused = id(104) // Paused

await db.exec('SET ROLE service_role')

// Classes
await db.query(`INSERT INTO public.classes (id, name) VALUES ($1, 'Lớp 12A'), ($2, 'Lớp 12B')`, [class1, class2])
// Chapters
await db.query(`INSERT INTO public.chapters (id, class_id, title) VALUES ($1, $2, 'Chương 1'), ($3, $4, 'Chương 2')`, [ch1, class1, ch2, class2])
// Lessons
await db.query(`
  INSERT INTO public.lessons (id, chapter_id, title, is_trial) VALUES
  ($1, $2, 'Bài 1', false),
  ($3, $2, 'Bài 2', false),
  ($4, $2, 'Bài Thử', true)
`, [les1, ch1, les2, lesTrial])
// Homeworks
await db.query(`
  INSERT INTO public.homeworks (id, lesson_id, title, max_score, is_published) VALUES
  ($1, $2, 'BTVN 1', 10, true),
  ($3, $2, 'BTVN 2', 20, true),
  ($4, $2, 'BTVN Ẩn', 10, false),
  ($5, $6, 'BTVN Học thử', 10, true)
`, [hw1, les1, hw2, hwUnpublished, hwTrial, lesTrial])

// Enrollments
await db.query(`
  INSERT INTO public.student_classes (student_id, class_id, status) VALUES
  ($1, $5, 'ACTIVE'),
  ($2, $5, 'ACTIVE'),
  ($3, $5, 'ACTIVE'),
  ($4, $5, 'PAUSED')
`, [s1, s2, s3, sPaused, class1])

// Submissions:
// Period: 2026-11-01 to 2026-11-25
// Week 1: 2026-10-26 (contains 2026-11-01)
// S1 submits HW1 twice on 2026-11-01:
//   attempt 1: score 6 / 10 -> scaled 6
//   attempt 2: score 8 / 10 -> scaled 8 (best)
// Week 2: 2026-11-02 to 2026-11-08
// S1 submits HW2 on 2026-11-05: score 14 / 20 -> scaled 7
// S2 submits HW1 on 2026-11-06: score 9 / 10 -> scaled 9
// SPaused submits HW1 on 2026-11-05: score 10 / 10 -> should be ignored!
// S1 submits HW_Unpublished on 2026-11-05: score 10 / 10 -> should be ignored!
// S1 submits HW_Trial on 2026-11-05: score 10 / 10 -> should be ignored!

await db.query(`
  INSERT INTO public.submissions (id, student_id, homework_id, total_score, max_score, status, submitted_at) VALUES
  ($1, $2, $3, 6, 10, 'SUBMITTED', '2026-11-01T08:00:00Z'),
  ($4, $2, $3, 8, 10, 'SUBMITTED', '2026-11-01T10:00:00Z'),
  ($5, $2, $6, 14, 20, 'SUBMITTED', '2026-11-05T09:00:00Z'),
  ($7, $8, $3, 9, 10, 'SUBMITTED', '2026-11-06T14:00:00Z'),
  ($9, $10, $3, 10, 10, 'SUBMITTED', '2026-11-05T10:00:00Z'),
  ($11, $2, $12, 10, 10, 'SUBMITTED', '2026-11-05T11:00:00Z'),
  ($13, $2, $14, 10, 10, 'SUBMITTED', '2026-11-05T12:00:00Z')
`, [
  id(501), s1, hw1,
  id(502),
  id(503), hw2,
  id(504), s2,
  id(505), sPaused,
  id(506), hwUnpublished,
  id(507), hwTrial,
])

console.log('✓ Fixture data inserted')

// 4. Test Calling RPC as service_role
const res = await db.query(`SELECT public.fn_report_class_stats($1, $2, $3) AS stats`, [class1, '2026-11-01', '2026-11-25'])
const stats = res.rows[0].stats
console.log('RPC result:', JSON.stringify(stats))

// S1 in period:
// HW1 best = 8.0
// HW2 best = 7.0
// S1 period avg = (8.0 + 7.0) / 2 = 7.5
// S2 in period:
// HW1 best = 9.0
// S2 period avg = 9.0
// Active students who submitted = 2 (S1, S2). S3 had 0 submissions -> excluded.
// Expected class average = (7.5 + 9.0) / 2 = 8.25
assert.equal(stats.classAverage.studentCount, 2)
assert.equal(Number(stats.classAverage.averageScore), 8.25)

// Weekly averages:
// Week 2026-10-26: only S1 submitted (HW1 best 8) -> 8.0
// Week 2026-11-02:
//   S1: HW2 best 7 -> avg 7.0
//   S2: HW1 best 9 -> avg 9.0
//   Class week avg = (7.0 + 9.0) / 2 = 8.0
assert.ok(Array.isArray(stats.weeklyClassAverages))
const w1 = stats.weeklyClassAverages.find(w => w.weekStart === '2026-10-26')
assert.ok(w1, 'week 2026-10-26 exists')
assert.equal(Number(w1.classAverageScore), 8.0)

const w2 = stats.weeklyClassAverages.find(w => w.weekStart === '2026-11-02')
assert.ok(w2, 'week 2026-11-02 exists')
assert.equal(Number(w2.classAverageScore), 8.0)

// 5. Test empty class (class2 has no submissions)
const res2 = await db.query(`SELECT public.fn_report_class_stats($1, $2, $3) AS stats`, [class2, '2026-11-01', '2026-11-25'])
const stats2 = res2.rows[0].stats
assert.equal(stats2.classAverage.averageScore, null)
assert.equal(stats2.classAverage.studentCount, 0)
assert.deepEqual(stats2.weeklyClassAverages, [])

// 6. Test invalid parameters
const resNull = await db.query(`SELECT public.fn_report_class_stats(NULL, '2026-11-01', '2026-11-25') AS stats`)
assert.equal(resNull.rows[0].stats, null)

// 7. Test permission: anon / authenticated must NOT be able to execute
await db.exec('SET ROLE anon')
try {
  await db.query(`SELECT public.fn_report_class_stats($1, $2, $3)`, [class1, '2026-11-01', '2026-11-25'])
  assert.fail('anon should not execute')
} catch (err) {
  assert.match(err.message, /permission denied/)
}

await db.exec('SET ROLE authenticated')
try {
  await db.query(`SELECT public.fn_report_class_stats($1, $2, $3)`, [class1, '2026-11-01', '2026-11-25'])
  assert.fail('authenticated should not execute')
} catch (err) {
  assert.match(err.message, /permission denied/)
}

console.log('✓ All PGlite tests for fn_report_class_stats passed successfully!')
await db.close()
process.exit(0)
