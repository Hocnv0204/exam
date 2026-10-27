/**
 * test-homework-pdf-policy.mjs — Bộ kiểm thử hồi quy cho quyền hiển thị PDF.
 *
 * Nghiệp vụ: học sinh (STUDENT) tuyệt đối không được thấy link hoặc nút tải
 * PDF của BÀI THI (EXAM), kể cả bài đã gắn PDF. Các loại khác
 * (PRACTICE / ASSIGNMENT / QUIZ) và giáo viên / admin giữ nguyên hành vi.
 *
 * Chạy:  node fe/scripts/test-homework-pdf-policy.mjs
 * Không cần trình duyệt, không cần API.
 *
 * Gồm 2 phần:
 *  1. Ma trận chính sách trên helper thật (fe/src/js/utils/homework-pdf-policy.js)
 *     — chính helper này được mọi view học sinh dùng để quyết định render nút.
 *  2. Kiểm tra nối dây (wiring): các view / helper tải PDF phải gọi helper đó,
 *     và backend phải có đoạn chặn metadata PDF cho STUDENT + EXAM.
 */

import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, resolve } from 'node:path'

import { canViewHomeworkPdf, isExamHomework } from '../src/js/utils/homework-pdf-policy.js'

const scriptsDir = dirname(fileURLToPath(import.meta.url))
const feRoot = resolve(scriptsDir, '..')
const repoRoot = resolve(scriptsDir, '..', '..')
let failures = 0

function check(name, actual, expected) {
  const ok = actual === expected
  if (!ok) failures++
  console.log(`${ok ? 'PASS' : 'FAIL'} ${name}: got ${JSON.stringify(actual)}, want ${JSON.stringify(expected)}`)
}

function checkContains(name, base, relPath, needle) {
  const content = readFileSync(resolve(base, relPath), 'utf-8')
  const ok = content.includes(needle)
  if (!ok) failures++
  console.log(`${ok ? 'PASS' : 'FAIL'} wiring ${name}: ${relPath} contains ${JSON.stringify(needle)}`)
}

// ---------- 1. Ma trận chính sách ----------
console.log('--- policy matrix ---')
check('STUDENT + EXAM => no link', canViewHomeworkPdf('STUDENT', { type: 'EXAM' }), false)
check('STUDENT + PRACTICE => link kept', canViewHomeworkPdf('STUDENT', { type: 'PRACTICE' }), true)
check('STUDENT + ASSIGNMENT => link kept', canViewHomeworkPdf('STUDENT', { type: 'ASSIGNMENT' }), true)
check('STUDENT + QUIZ => link kept', canViewHomeworkPdf('STUDENT', { type: 'QUIZ' }), true)
check('STUDENT + legacy null type => link kept (defaults to PRACTICE)', canViewHomeworkPdf('STUDENT', { type: null }), true)
check('STUDENT + legacy missing type => link kept', canViewHomeworkPdf('STUDENT', {}), true)
check('TEACHER + EXAM => link kept', canViewHomeworkPdf('TEACHER', { type: 'EXAM' }), true)
check('ADMIN + EXAM => link kept', canViewHomeworkPdf('ADMIN', { type: 'EXAM' }), true)
check('guest (no role) + EXAM => link kept (trial unaffected)', canViewHomeworkPdf(undefined, { type: 'EXAM' }), true)
check('isExamHomework EXAM', isExamHomework({ type: 'EXAM' }), true)
check('isExamHomework PRACTICE', isExamHomework({ type: 'PRACTICE' }), false)
check('isExamHomework ASSIGNMENT', isExamHomework({ type: 'ASSIGNMENT' }), false)
check('isExamHomework QUIZ', isExamHomework({ type: 'QUIZ' }), false)
check('isExamHomework legacy null', isExamHomework({ type: null }), false)

// ---------- 2. Kiểm tra nối dây ----------
// Frontend: mọi mặt render nút tải PDF cho học sinh phải gọi helper.
console.log('--- frontend wiring ---')
for (const f of [
  'src/js/views/my-homeworks.js',
  'src/js/views/my-classes.js',
  'src/js/views/homework-solver.js',
  'src/js/views/class-details.js',
  'src/js/views/assignment-review.js',
  'src/js/utils/download-helper.js',
]) {
  checkContains(f, feRoot, f, 'canViewHomeworkPdf')
}
// Backend: danh sách + chi tiết phải chặn metadata PDF cho STUDENT + EXAM.
console.log('--- backend wiring ---')
checkContains('create-homework list strip', repoRoot, 'supabase/functions/create-homework/index.ts', "hw.type === 'EXAM' ? '' : hw.pdf_path")
checkContains('homework-detail strip flag', repoRoot, 'supabase/functions/homework-detail/index.ts', 'hidePdfForStudentExam')

if (failures > 0) {
  console.error(`\n${failures} CHECK(S) FAILED`)
  process.exit(1)
}
console.log('\nTẤT CẢ TEST HOMEWORK-PDF-POLICY PASS')
