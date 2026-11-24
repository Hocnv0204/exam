// Báo cáo tiến độ: mục "Điểm danh trong kỳ" — buổi lớp học, buổi học sinh có mặt/vắng.
import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import {
  formatSessionDate,
  hasReportAttendance,
  renderReportAttendanceBody,
  reportAttendanceSubtitle
} from '../src/js/utils/report-attendance.js'

const DATA = {
  summary: { classSessions: 3, countedSessions: 2, present: 1, absent: 1, notCounted: 1, attendanceRate: 50, classAverageRate: 83.3 },
  sessions: [
    { date: '2026-11-15', note: 'Ôn <chương 2>', status: 'ABSENT', classPresent: 9, classTotal: 10, classRate: 90 },
    { date: '2026-11-08', note: null, status: 'PRESENT', classPresent: 8, classTotal: 10, classRate: 80 },
    { date: '2026-11-01', note: null, status: 'NOT_COUNTED', classPresent: 0, classTotal: 0, classRate: null }
  ]
}

test('ngày buổi học hiển thị thứ + dd/mm/yyyy, không lệch múi giờ', () => {
  assert.equal(formatSessionDate('2026-11-15'), 'CN, 15/11/2026')
  assert.equal(formatSessionDate('2026-11-17'), 'T3, 17/11/2026')
  assert.equal(formatSessionDate('x<y'), 'x&lt;y')
})

test('ẩn mục khi báo cáo không có lớp (attendance null/thiếu)', () => {
  assert.equal(hasReportAttendance(null), false)
  assert.equal(hasReportAttendance(undefined), false)
  assert.equal(hasReportAttendance(DATA), true)
})

test('tổng hợp: lớp đã học, có mặt, vắng, chuyên cần (không hiển thị TB lớp)', () => {
  const html = renderReportAttendanceBody(DATA)
  assert.match(html, /Lớp đã học<\/span>\s*<strong[^>]*>3 buổi/)
  assert.match(html, /Có mặt<\/span>\s*<strong[^>]*>1 buổi/)
  assert.match(html, /report-att-stat is-absent[\s\S]*?Vắng<\/span>\s*<strong[^>]*>1 buổi/)
  assert.match(html, /Chuyên cần<\/span>\s*<strong[^>]*>50%/)
  assert.doesNotMatch(html, /TB lớp/)
  assert.match(html, /1 buổi không tính/)
  assert.equal(reportAttendanceSubtitle(DATA), '3 buổi · vắng 1')
})

test('từng buổi: chỉ hiển thị ngày học và trạng thái tham gia (ẩn note và sĩ số lớp)', () => {
  const html = renderReportAttendanceBody(DATA)
  const rows = [...html.matchAll(/<li class="report-att-row ([^"]+)">([\s\S]*?)<\/li>/g)]
  assert.deepEqual(rows.map(r => r[1]), ['is-absent', 'is-present', 'is-not-counted'])
  assert.match(rows[0][2], /CN, 15\/11\/2026/)
  assert.match(rows[0][2], /> Vắng</)
  assert.match(rows[1][2], /> Có mặt</)
  assert.doesNotMatch(html, /Lớp có mặt/)
  assert.doesNotMatch(html, /Chưa có dữ liệu sĩ số/)
  assert.doesNotMatch(html, /Ôn .*chương 2/)
})

test('không có buổi nào / lỗi tải điểm danh', () => {
  assert.match(renderReportAttendanceBody({ summary: {}, sessions: [] }), /chưa có buổi học nào/)
  assert.equal(reportAttendanceSubtitle({ summary: {}, sessions: [] }), '')
  const err = renderReportAttendanceBody({ error: 'Không tải được <x>' })
  assert.match(err, /report-att-error/)
  assert.ok(err.includes('&lt;x&gt;'))
})

test('student-report gắn mục vào cả 3 giao diện và truyền attendance từ API', () => {
  const src = readFileSync(new URL('../src/js/views/student-report.js', import.meta.url), 'utf8')
  assert.equal((src.match(/attendance: data\?\.attendance/g) || []).length, 2, 'renderReport + renderSharedReportData')
  assert.match(src, /\$\{renderMochiAttendanceSection\(attendance\)\}/)
  assert.equal((src.match(/\$\{renderAttendanceSection\(attendance\)\}/g) || []).length, 2, 'classic + pro')
})
