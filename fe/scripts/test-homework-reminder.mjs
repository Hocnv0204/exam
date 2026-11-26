import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

import { todayDeadlineRange, buildHomeworkReminderMessage } from '../src/js/utils/homework-reminder.js'

test('todayDeadlineRange trả đầu/cuối ngày theo giờ máy dạng ISO', () => {
  // 02:15 giờ Việt Nam (UTC+7) vẫn thuộc ngày 2026-11-26 ở giờ máy (dù là 2026-11-25T19:15Z ở UTC)
  const localSample = new Date(2026, 10, 26, 2, 15, 30, 500)
  const snapshot = localSample.getTime()

  const { deadlineFrom, deadlineTo } = todayDeadlineRange(localSample)
  const expectedStart = new Date(2026, 10, 26, 0, 0, 0, 0)
  const expectedEnd = new Date(2026, 10, 26, 23, 59, 59, 999)

  assert.equal(deadlineFrom, expectedStart.toISOString())
  assert.equal(deadlineTo, expectedEnd.toISOString())
  assert.equal(localSample.getTime(), snapshot, 'không được mutate Date đầu vào')

  // Chạy dưới TZ=Asia/Ho_Chi_Minh: mốc UTC 2026-11-25T18:30:00.000Z là 01:30 ngày 26/11 tại VN
  if (process.env.TZ === 'Asia/Ho_Chi_Minh') {
    const vnRange = todayDeadlineRange(new Date('2026-11-25T18:30:00.000Z'))
    assert.equal(vnRange.deadlineFrom, '2026-11-25T17:00:00.000Z')
    assert.equal(vnRange.deadlineTo, '2026-11-26T16:59:59.999Z')
  }

  // Cuối ngày sát 23:59 ở giờ máy vẫn lấy đúng ngày địa phương
  const lateLocal = new Date(2026, 0, 15, 23, 59, 59, 999)
  const lateRange = todayDeadlineRange(lateLocal)
  assert.equal(lateRange.deadlineFrom, new Date(2026, 0, 15, 0, 0, 0, 0).toISOString())
  assert.equal(lateRange.deadlineTo, new Date(2026, 0, 15, 23, 59, 59, 999).toISOString())
})

test('buildHomeworkReminderMessage đúng từng dòng mẫu khi có đủ thông tin & deadline', () => {
  const deadline = new Date(2026, 10, 26, 20, 5, 0, 0)
  const msg = buildHomeworkReminderMessage({
    title: 'Đề ôn tập Chương 2',
    deadline,
    students: [
      { fullName: 'Nguyễn Văn An', studentName: 'An', username: 'an1' },
      { fullName: '', studentName: 'Trần Thị Bình', username: 'binh2' },
      { username: 'cuong3' }
    ],
    totalStudents: 25,
    url: 'https://exam.edu.vn/#homework-attempt?homeworkId=hw-1'
  })

  assert.equal(msg, [
    '📢 Nhắc làm bài: Đề ôn tập Chương 2',
    '⏰ Hạn nộp: 20:05 26/11/2026',
    '👥 Các bạn chưa làm (3/25):',
    '1. Nguyễn Văn An',
    '2. Trần Thị Bình',
    '3. cuong3',
    '👉 Làm bài tại: https://exam.edu.vn/#homework-attempt?homeworkId=hw-1',
    'Các bạn hoàn thành trước hạn nhé!'
  ].join('\n'))
})

test('buildHomeworkReminderMessage khi không có deadline hoặc deadline hỏng', () => {
  for (const badDeadline of [null, undefined, '', 'not-a-valid-date', new Date('invalid')]) {
    const msg = buildHomeworkReminderMessage({
      title: 'Bài tập tự luyện',
      deadline: badDeadline,
      students: [{ fullName: 'Phạm Minh' }],
      totalStudents: 10,
      url: 'https://exam.edu.vn/#exam-room?homeworkId=hw-2'
    })

    assert.equal(msg, [
      '📢 Nhắc làm bài: Bài tập tự luyện',
      '👥 Các bạn chưa làm (1/10):',
      '1. Phạm Minh',
      '👉 Làm bài tại: https://exam.edu.vn/#exam-room?homeworkId=hw-2',
      'Các bạn hoàn thành sớm nhé!'
    ].join('\n'))
  }
})

test('buildHomeworkReminderMessage khi totalStudents thiếu hoặc <= 0', () => {
  for (const badTotal of [undefined, null, 0, -4, 'abc', '', true, NaN]) {
    const msg = buildHomeworkReminderMessage({
      title: 'Bài kiểm tra',
      deadline: null,
      students: [{ fullName: 'A' }, { fullName: 'B' }],
      totalStudents: badTotal,
      url: 'https://exam.edu.vn/#homework-attempt?homeworkId=hw-3'
    })

    assert.match(msg, /^👥 Các bạn chưa làm \(2\):$/m)
  }
})

test('buildHomeworkReminderMessage xử lý tên rỗng, xuống dòng, không escape HTML và giữ thứ tự', () => {
  const msg = buildHomeworkReminderMessage({
    title: 'Bài <ĐẶC BIỆT> & "Thử"\nDòng 2',
    deadline: null,
    students: [
      { fullName: '  Lê\r\nThị   Hoa  ' },
      { fullName: '   \n  ', studentName: '  Ngô <B> & C  ' },
      { fullName: '', studentName: '', username: '   ' },
      {}
    ],
    totalStudents: 4,
    url: 'https://exam.edu.vn/#homework-attempt?homeworkId=hw-4'
  })

  const lines = msg.split('\n')
  assert.deepEqual(lines, [
    '📢 Nhắc làm bài: Bài <ĐẶC BIỆT> & "Thử" Dòng 2',
    '👥 Các bạn chưa làm (4/4):',
    '1. Lê Thị Hoa',
    '2. Ngô <B> & C',
    '3. Học sinh',
    '4. Học sinh',
    '👉 Làm bài tại: https://exam.edu.vn/#homework-attempt?homeworkId=hw-4',
    'Các bạn hoàn thành sớm nhé!'
  ])
})

test('homework-mgmt.js: giữ nguyên classic và bổ sung bộ lọc + 2 nút mới ở Pro', () => {
  const source = readFileSync(new URL('../src/js/views/homework-mgmt.js', import.meta.url), 'utf8')
  const classicStart = source.indexOf('export function renderClassicHomeworkMgmtView()')
  const proStart = source.indexOf('export function renderProHomeworkMgmtView()')
  const classicView = source.slice(classicStart, proStart)
  const proView = source.slice(proStart, source.indexOf('export function bindHomeworkMgmtEvents()'))

  assert.doesNotMatch(classicView, /hw-filter-due-today/, 'Classic không thêm nút Đến hạn hôm nay')
  assert.match(proView, /id="hw-filter-due-today"[^>]*aria-pressed=/, 'Pro có nút Đến hạn hôm nay với aria-pressed')
  assert.match(proView, /fa-calendar-day/, 'Pro có icon lịch')
  assert.match(proView, /Đến hạn hôm nay/, 'Pro có nhãn Đến hạn hôm nay')

  const classicRowsStart = source.indexOf('function renderHomeworkTableRows(')
  const classicRows = source.slice(classicRowsStart, source.indexOf('function attachRowActions('))
  assert.doesNotMatch(classicRows, /btn-stats-hw|btn-remind-hw/, 'Hàng classic không đổi')

  const proRowsStart = source.indexOf('function renderProHomeworkTableRows(')
  const proRows = source.slice(proRowsStart, source.indexOf('let previewRequestId'))
  const previewIdx = proRows.indexOf('btn-preview-hw')
  const statsIdx = proRows.indexOf('btn-stats-hw')
  const remindIdx = proRows.indexOf('btn-remind-hw')
  assert.ok(previewIdx > 0 && statsIdx > previewIdx && remindIdx > statsIdx, '2 nút mới nằm sau Xem trước')
  assert.match(proRows, /fa-chart-column/, 'Nút thống kê dùng fa-chart-column')
  assert.match(proRows, /fa-bell/, 'Nút nhắc dùng fa-bell')
  assert.match(proRows, /Bài tập chưa gán lớp/, 'Disabled title khi thiếu classId')
})
