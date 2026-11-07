import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { summarizeStudentProgress, studentBalanceIsZero, recentScores } from '../src/js/utils/student-dashboard.js'
import { getLoginReturnTarget } from '../src/js/utils/login-return.js'

const read = path => readFileSync(new URL(path, import.meta.url), 'utf8')

test('tiến độ từ thống kê bài được giao; không bịa 0% khi chưa có bài', () => {
  assert.deepEqual(summarizeStudentProgress({ total: 7, done: 3, todo: 4 }), { total: 7, done: 3, todo: 4, completion: 43 })
  assert.deepEqual(summarizeStudentProgress({ total: 0, done: 0, todo: 0 }), { total: 0, done: 0, todo: 0, completion: null })
  assert.throws(() => summarizeStudentProgress({ total: 5, done: 8, todo: 0 }), /không hợp lệ/)
  assert.throws(() => summarizeStudentProgress({ total: 3, done: 2 }), /không hợp lệ/)
})

test('đăng nhập học sinh vào dashboard; link làm bài hợp lệ vẫn quay về bài', () => {
  assert.equal(getLoginReturnTarget('#login', 'STUDENT'), '#student-dashboard')
  assert.equal(getLoginReturnTarget('#login', 'ADMIN'), '#admin-dashboard')
  assert.equal(getLoginReturnTarget('#login?next=%23exam-room%3FhomeworkId%3Dh123', 'STUDENT'), '#exam-room?homeworkId=h123')
  assert.equal(getLoginReturnTarget('#login?next=https%3A%2F%2Fevil.example', 'STUDENT'), '#student-dashboard')
})

test('dashboard dùng dữ liệu riêng học sinh và vẫn giữ route lớp/lesson cũ', () => {
  const app = read('../src/js/app.js')
  const view = read('../src/js/views/my-classes.js')
  assert.match(app, /'student-dashboard': \{ render: renderMyClassesView, bind: bindMyClassesEvents \}/)
  assert.match(app, /'student-dashboard', 'my-classes'/)
  assert.match(view, /api\.getMyHomeworks\('&status=all&page=1&pageSize=1'\)/)
  assert.match(view, /api\.getTodoHomeworks\(\)/)
  assert.match(view, /api\.getWeakTopics\(\{ limit: 3 \}\)/)
  assert.match(view, /student-dashboard-stats/)
  assert.match(view, /#my-classes\?classId=/)
  assert.doesNotMatch(view.slice(view.indexOf('<!-- Classes Cards Grid -->'), view.indexOf('<!-- Weak Topics Panel -->')), /\$\{c\.progress\}%/)
})

test('bỏ banner dashboard, bài mới giao ở trước thống kê và vẫn giữ hướng dẫn', () => {
  const view = read('../src/js/views/my-classes.js')
  const dashboard = view.slice(view.indexOf('// Case 2: List of All Classes for Student'), view.indexOf('async function loadStudentDashboardStats'))
  assert.match(dashboard, /\$\{!isDashboard \? `<div class="navy-hero">/)
  assert.ok(dashboard.indexOf('id="tour-latest-hw"') < dashboard.indexOf('id="inprogress-drafts-card"'))
  assert.ok(dashboard.indexOf('id="inprogress-drafts-card"') < dashboard.indexOf('id="student-dashboard-stats"'))
  assert.ok(dashboard.indexOf('id="tour-latest-hw"') < dashboard.indexOf('id="student-dashboard-stats"'))
  assert.ok(dashboard.indexOf('id="student-dashboard-stats"') < dashboard.indexOf('id="student-dashboard-scores"'))
  assert.match(dashboard, /id="btn-replay-tour"/)
  assert.match(view, /progress\.total === 0 \? '<p>Chưa có bài tập được giao\.<\/p>' : `<div class="student-assignment-breakdown">/)
  assert.match(view, /width:\$\{progress\.done \/ progress\.total \* 100\}%/)
})

test('10 lượt nộp mới nhất kể cả quá 12 tháng, không bỏ bài chưa có điểm hoặc gộp tên trùng', () => {
  const history = Array.from({ length: 11 }, (_, i) => ({
    homeworkTitle: i < 2 ? 'Đề trùng' : `Đề ${i}`,
    submittedAt: new Date(Date.UTC(2024, i, 1)).toISOString(), score: i === 10 ? null : 4, maxScore: 8
  }))
  const scores = recentScores(history)
  assert.equal(scores.length, 10)
  assert.equal(scores[0].title, 'Đề trùng')
  assert.equal(scores.at(-1).title, 'Đề 10')
  assert.deepEqual(scores.slice(0, 2).map(s => s.title), ['Đề trùng', 'Đề 2'])
  assert.equal(scores[0].score, 5)
  assert.equal(scores.at(-1).score, null)
  assert.equal(scores.at(-1).date, history[10].submittedAt)
  assert.deepEqual(recentScores([{ homeworkTitle: 'Điểm lẻ', submittedAt: '2026-02-01', score: 3, maxScore: 8 }]).map(s => s.score), [3.8])
  assert.deepEqual(recentScores(null), [])
})

test('chỉ nhắc học phí khi backend xác nhận số dư là 0, không nhầm null/missing thành 0', () => {
  assert.equal(studentBalanceIsZero(0), true)
  assert.equal(studentBalanceIsZero('0.00'), true)
  for (const value of [undefined, null, '', '   ', 'invalid', -1, 100000]) assert.equal(studentBalanceIsZero(value), false)
  const backend = read('../../supabase/functions/create-homework/index.ts')
  assert.match(backend, /\.select\('balance'\)\.eq\('id', user\.id\)\.eq\('role', 'STUDENT'\)\.single\(\)/)
  assert.match(backend, /accountBalance,/)
  const view = read('../src/js/views/my-classes.js')
  assert.match(view, /studentBalanceIsZero\(response\.accountBalance\)/)
  assert.match(view, /Bạn đã đến hạn đóng học phí\. Vui lòng liên hệ giáo viên để đóng học phí\./)
  assert.match(view, /api\.getStudentHistory\(\{ page: 1, pageSize: 10 \}\)/)
  assert.doesNotMatch(view, /api\.getStudentProgressReport\(/)
  assert.match(view, /student-score-title">\$\{escapeHtml\(item\.title\)\}/)
  assert.match(view, /\$\{!isDashboard \? `<!-- Classes Cards Grid -->/)
})
