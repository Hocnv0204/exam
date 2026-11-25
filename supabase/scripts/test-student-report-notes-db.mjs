// PostgreSQL/WASM (PGlite) test cho migration 20261125100000_student_report_notes.sql.
// Không mạng, không cloud, không dữ liệu thật.
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { pathToFileURL } from 'node:url'

const pgliteModulePath = process.env.PGLITE_MODULE || '/tmp/claude-1000/-home-hocnguyen-Documents-Projects-Personal-Projects-exam/cde7740b-bec0-4e24-a388-a3955b20ad33/scratchpad/pglite/node_modules/@electric-sql/pglite/dist/index.js'

const { PGlite } = await import(pathToFileURL(pgliteModulePath).href)
const db = new PGlite()

console.log('Running test-student-report-notes-db.mjs...')

// 1. Tạo roles và schema phụ thuộc tối thiểu
await db.exec(`
  CREATE ROLE anon;
  CREATE ROLE authenticated;
  CREATE ROLE service_role BYPASSRLS;

  CREATE TABLE public.profiles (
    id UUID PRIMARY KEY,
    full_name TEXT NOT NULL,
    role TEXT NOT NULL DEFAULT 'STUDENT'
  );

  CREATE TABLE public.classes (
    id UUID PRIMARY KEY,
    name TEXT NOT NULL
  );

  GRANT USAGE ON SCHEMA public TO anon, authenticated, service_role;
  GRANT ALL ON ALL TABLES IN SCHEMA public TO service_role;
`)

// 2. Chạy migration 2 lần để kiểm tra tính an toàn khi chạy lại (idempotent)
const migrationSql = readFileSync(new URL('../migrations/20261125100000_student_report_notes.sql', import.meta.url), 'utf8')
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

// 3. Chuẩn bị dữ liệu mẫu (profiles, classes)
await db.exec('SET ROLE service_role')
const s1 = '10000000-0000-4000-8000-000000000001'
const s2 = '10000000-0000-4000-8000-000000000002'
const adminUser = '20000000-0000-4000-8000-000000000001'
const c1 = '30000000-0000-4000-8000-000000000001'

await db.query(`INSERT INTO public.profiles (id, full_name, role) VALUES ($1, 'Học sinh 1', 'STUDENT')`, [s1])
await db.query(`INSERT INTO public.profiles (id, full_name, role) VALUES ($1, 'Học sinh 2', 'STUDENT')`, [s2])
await db.query(`INSERT INTO public.profiles (id, full_name, role) VALUES ($1, 'Admin Giáo viên', 'ADMIN')`, [adminUser])
await db.query(`INSERT INTO public.classes (id, name) VALUES ($1, 'Lớp Toán 12')`, [c1])

// 4. Test chèn dữ liệu hợp lệ (service_role)
const noteId1 = '40000000-0000-4000-8000-000000000001'
await db.query(`
  INSERT INTO public.student_report_notes (
    id, student_id, class_id, from_date, to_date,
    summary, strengths, improvements, attitude,
    goal_text, goal_score, teacher_support, parent_actions,
    updated_by
  ) VALUES (
    $1, $2, $3, '2026-11-01', '2026-11-25',
    'Tóm tắt kỳ học tốt.', 'Điểm mạnh: làm bài nhanh.', 'Cần cải thiện: cẩn thận hơn.', 'Thái độ tốt.',
    'Đạt 8,5 điểm.', 8.50, 'Thầy hỗ trợ chuyên đề khó.', 'Bố mẹ nhắc làm bài đúng hạn.',
    $4
  )
`, [noteId1, s1, c1, adminUser])
console.log('✓ Valid record inserted successfully by service_role')

// 5. Test UNIQUE (student_id, class_id, from_date, to_date)
await expectError(
  () => db.query(`
    INSERT INTO public.student_report_notes (
      student_id, class_id, from_date, to_date, summary
    ) VALUES (
      $1, $2, '2026-11-01', '2026-11-25', 'Trùng kỳ'
    )
  `, [s1, c1]),
  /unique|student_report_notes_student_class_period_key/i
)
console.log('✓ UNIQUE constraint (student_id, class_id, from_date, to_date) enforced')

// 6. Test CHECK from_date <= to_date
await expectError(
  () => db.query(`
    INSERT INTO public.student_report_notes (
      student_id, class_id, from_date, to_date, summary
    ) VALUES (
      $1, $2, '2026-11-25', '2026-11-01', 'from > to'
    )
  `, [s2, c1]),
  /student_report_notes_period_dates_check/i
)
console.log('✓ CHECK (from_date <= to_date) enforced')

// 7. Test CHECK goal_score 0..10
// 7.a goal_score < 0
await expectError(
  () => db.query(`
    INSERT INTO public.student_report_notes (
      student_id, class_id, from_date, to_date, goal_score
    ) VALUES (
      $1, $2, '2026-11-01', '2026-11-15', -0.5
    )
  `, [s2, c1]),
  /student_report_notes_goal_score_range_check/i
)
// 7.b goal_score > 10
await expectError(
  () => db.query(`
    INSERT INTO public.student_report_notes (
      student_id, class_id, from_date, to_date, goal_score
    ) VALUES (
      $1, $2, '2026-11-01', '2026-11-15', 10.01
    )
  `, [s2, c1]),
  /student_report_notes_goal_score_range_check/i
)
// 7.c biên 0 và 10 hợp lệ
await db.query(`
  INSERT INTO public.student_report_notes (
    student_id, class_id, from_date, to_date, goal_score
  ) VALUES (
    $1, $2, '2026-11-01', '2026-11-15', 0
  )
`, [s2, c1])
console.log('✓ CHECK (goal_score BETWEEN 0 AND 10) enforced')

// 8. Test CHECK char_length <= 1500 cho các cột text
const text1500 = 'A'.repeat(1500)
const text1501 = 'A'.repeat(1501)

// 8.a Biên 1500 ký tự hợp lệ
await db.query(`
  UPDATE public.student_report_notes
  SET summary = $1, strengths = $1, improvements = $1, attitude = $1,
      goal_text = $1, teacher_support = $1, parent_actions = $1
  WHERE id = $2
`, [text1500, noteId1])

// 8.b 1501 ký tự vượt quá giới hạn
await expectError(
  () => db.query(`UPDATE public.student_report_notes SET summary = $1 WHERE id = $2`, [text1501, noteId1]),
  /student_report_notes_summary_length_check/i
)
await expectError(
  () => db.query(`UPDATE public.student_report_notes SET strengths = $1 WHERE id = $2`, [text1501, noteId1]),
  /student_report_notes_strengths_length_check/i
)
await expectError(
  () => db.query(`UPDATE public.student_report_notes SET improvements = $1 WHERE id = $2`, [text1501, noteId1]),
  /student_report_notes_improvements_length_check/i
)
await expectError(
  () => db.query(`UPDATE public.student_report_notes SET attitude = $1 WHERE id = $2`, [text1501, noteId1]),
  /student_report_notes_attitude_length_check/i
)
await expectError(
  () => db.query(`UPDATE public.student_report_notes SET goal_text = $1 WHERE id = $2`, [text1501, noteId1]),
  /student_report_notes_goal_text_length_check/i
)
await expectError(
  () => db.query(`UPDATE public.student_report_notes SET teacher_support = $1 WHERE id = $2`, [text1501, noteId1]),
  /student_report_notes_teacher_support_length_check/i
)
await expectError(
  () => db.query(`UPDATE public.student_report_notes SET parent_actions = $1 WHERE id = $2`, [text1501, noteId1]),
  /student_report_notes_parent_actions_length_check/i
)
console.log('✓ CHECK char_length(col) <= 1500 enforced on all 7 text columns')

// 9. Test quyền anon: SELECT / INSERT bị cấm
await db.exec('SET ROLE anon')
await expectError(
  () => db.query(`SELECT * FROM public.student_report_notes`),
  /permission denied/i
)
await expectError(
  () => db.query(`INSERT INTO public.student_report_notes (student_id, class_id, from_date, to_date) VALUES ($1, $2, '2026-10-01', '2026-10-15')`, [s1, c1]),
  /permission denied/i
)
console.log('✓ anon role cannot SELECT or INSERT (permission denied)')

// 10. Test quyền authenticated: SELECT / INSERT bị cấm
await db.exec('SET ROLE authenticated')
await expectError(
  () => db.query(`SELECT * FROM public.student_report_notes`),
  /permission denied/i
)
await expectError(
  () => db.query(`INSERT INTO public.student_report_notes (student_id, class_id, from_date, to_date) VALUES ($1, $2, '2026-10-01', '2026-10-15')`, [s1, c1]),
  /permission denied/i
)
console.log('✓ authenticated role cannot SELECT or INSERT (permission denied)')

// 11. Test foreign key ON DELETE CASCADE và SET NULL
await db.exec('SET ROLE service_role')
// Delete admin user -> updated_by set to null
await db.query(`DELETE FROM public.profiles WHERE id = $1`, [adminUser])
const resAfterAdminDelete = await db.query(`SELECT updated_by FROM public.student_report_notes WHERE id = $1`, [noteId1])
assert.equal(resAfterAdminDelete.rows[0].updated_by, null, 'updated_by should be SET NULL on profile delete')

// Delete student s1 -> note cascade deleted
await db.query(`DELETE FROM public.profiles WHERE id = $1`, [s1])
const resAfterStudentDelete = await db.query(`SELECT count(*) FROM public.student_report_notes WHERE student_id = $1`, [s1])
assert.equal(Number(resAfterStudentDelete.rows[0].count), 0, 'student_report_notes should cascade delete with student')

console.log('ALL DB TESTS PASSED! ✅')
