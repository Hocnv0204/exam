// Mục Điểm danh trong báo cáo tiến độ: chuẩn hoá output fn_student_attendance,
// ẩn khi không có lớp, link công khai không lộ sessionId, lỗi RPC không làm hỏng báo cáo.
// Chạy: node supabase/scripts/test-report-attendance.mjs
import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { toReportAttendance, loadReportAttendance } from '../functions/student-history/report-attendance.ts'

const RAW = {
  classId: 'c1', className: 'Lớp 12A', fromDate: '2026-11-01', toDate: '2026-11-18',
  summary: { classSessions: 3, countedSessions: 2, present: 1, absent: 1, notCounted: 1, attendanceRate: 50.0, classAverageRate: '83.3' },
  sessions: [
    { sessionId: 's3', date: '2026-11-15', note: 'Ôn chương 2', status: 'ABSENT', classPresent: 9, classTotal: 10, classRate: 90 },
    { sessionId: 's2', date: '2026-11-08', note: '  ', status: 'PRESENT', classPresent: 8, classTotal: 10, classRate: 80 },
    { sessionId: 's1', date: '2026-11-01', note: null, status: 'NOT_COUNTED', classPresent: 0, classTotal: 0, classRate: null },
  ],
}

test('chuẩn hoá summary + sessions, giữ thứ tự RPC (mới nhất trước) và loại bỏ note/sĩ số/tỉ lệ lớp', () => {
  const r = toReportAttendance(RAW, false)
  assert.deepEqual(r.summary, { classSessions: 3, countedSessions: 2, present: 1, absent: 1, notCounted: 1, attendanceRate: 50 })
  assert.deepEqual(r.sessions.map(s => [s.date, s.status]), [['2026-11-15', 'ABSENT'], ['2026-11-08', 'PRESENT'], ['2026-11-01', 'NOT_COUNTED']])
  assert.equal(r.sessions[0].sessionId, 's3')
  assert.equal('classAverageRate' in r.summary, false)
  for (const s of r.sessions) {
    assert.equal('note' in s, false)
    assert.equal('classPresent' in s, false)
    assert.equal('classTotal' in s, false)
    assert.equal('classRate' in s, false)
  }
})

test('link công khai không trả sessionId', () => {
  const r = toReportAttendance(RAW, true)
  assert.ok(r.sessions.every(s => !('sessionId' in s)))
  assert.ok(!JSON.stringify(r).includes('c1'), 'không lộ classId')
  assert.ok(!JSON.stringify(r).includes('Ôn chương 2'), 'không lộ note buổi học')
})

test('dữ liệu lạ/thiếu không làm vỡ', () => {
  assert.equal(toReportAttendance(null, false), null)
  const r = toReportAttendance({ sessions: [{ date: '2026-11-02', status: 'WEIRD', classPresent: 'x', note: 'secret' }, null, { status: 'PRESENT' }] }, false)
  assert.equal(r.summary.classSessions, 0)
  assert.equal(r.summary.attendanceRate, null)
  assert.equal(r.sessions.length, 1)
  assert.equal(r.sessions[0].status, 'NOT_COUNTED')
  assert.deepEqual(r.sessions[0], { date: '2026-11-02', status: 'NOT_COUNTED' })
})

test('không có lớp -> null, không gọi RPC', async () => {
  let called = false
  const client = { rpc: async () => { called = true; return { data: RAW, error: null } } }
  assert.equal(await loadReportAttendance(client, { studentId: 'u1', classId: null, fromDate: '2026-11-01', toDate: '2026-11-18', isPublic: false }), null)
  assert.equal(called, false)
})

test('gọi RPC đúng tham số; lỗi RPC -> { error } thay vì throw', async () => {
  let args
  const ok = await loadReportAttendance({ rpc: async (name, a) => { args = [name, a]; return { data: RAW, error: null } } },
    { studentId: 'u1', classId: 'c1', fromDate: '2026-11-01', toDate: '2026-11-18', isPublic: true })
  assert.deepEqual(args, ['fn_student_attendance', { p_student_id: 'u1', p_class_id: 'c1', p_from: '2026-11-01', p_to: '2026-11-18' }])
  assert.equal(ok.summary.present, 1)
  const origError = console.error
  console.error = () => {}
  try {
    const bad = await loadReportAttendance({ rpc: async () => ({ data: null, error: { message: 'boom' } }) },
      { studentId: 'u1', classId: 'c1', fromDate: '2026-11-01', toDate: '2026-11-18', isPublic: false })
    assert.deepEqual(bad, { error: 'Không tải được dữ liệu điểm danh.' })
  } finally {
    console.error = origError
  }
})

test('student-history gắn attendance vào cả REPORT và SHARED_REPORT', () => {
  const src = readFileSync(new URL('../functions/student-history/index.ts', import.meta.url), 'utf8')
  assert.match(src, /loadReportAttendance\(serviceRoleClient, \{[\s\S]*?isPublic: !!shared/)
  assert.match(src, /submissions: publicSubmissions,\s*attendance,/)
  assert.match(src, /submissions: reportSubmissions,\s*attendance,/)
})
