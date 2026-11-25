// Unit tests for report-insights.ts logic (pure TypeScript, runs under Node).
// Chạy: node supabase/scripts/test-report-insights.mjs
import test from 'node:test'
import assert from 'node:assert/strict'
import {
  isValidCalendarDate,
  getCalendarDays,
  getPreviousPeriod,
  getMondayOfWeek,
  getIntersectingWeeks,
  toVnDateKey,
  calculateScaledScore,
  buildPeriodSummary,
  computeClassAverage,
  computeWeeklyTrend,
  computeLevelBreakdown,
  computeCommonMistakes,
  mapReportNotes,
  mapPreviousGoal,
} from '../functions/student-history/report-insights.ts'

console.log('Running test-report-insights.mjs...')

// 1. Kiểm tra ngày hợp lệ (isValidCalendarDate)
test('isValidCalendarDate chặn ngày không có thật hoặc sai format', () => {
  assert.equal(isValidCalendarDate('2026-11-25'), true)
  assert.equal(isValidCalendarDate('2026-02-28'), true)
  assert.equal(isValidCalendarDate('2024-02-29'), true, 'năm nhuận hợp lệ')
  assert.equal(isValidCalendarDate('2026-02-29'), false, 'năm không nhuận')
  assert.equal(isValidCalendarDate('2026-02-30'), false, '30/02 không tồn tại')
  assert.equal(isValidCalendarDate('2026-04-31'), false, '31/04 không tồn tại')
  assert.equal(isValidCalendarDate('2026-13-01'), false, 'tháng 13 không tồn tại')
  assert.equal(isValidCalendarDate('2026/11/25'), false, 'sai format')
  assert.equal(isValidCalendarDate('invalid'), false)
  assert.equal(isValidCalendarDate(''), false)
})

// 2. Biên tuần (week boundary) & giờ VN UTC+7
test('biên tuần: thứ Hai bắt đầu tuần, Chủ nhật kết thúc tuần, múi giờ VN UTC+7', () => {
  // 2026-10-26 là thứ Hai -> Monday = 2026-10-26
  assert.equal(getMondayOfWeek('2026-10-26'), '2026-10-26')
  // 2026-10-28 là thứ Tư -> Monday = 2026-10-26
  assert.equal(getMondayOfWeek('2026-10-28'), '2026-10-26')
  // 2026-11-01 là Chủ nhật -> Monday = 2026-10-26
  assert.equal(getMondayOfWeek('2026-11-01'), '2026-10-26')
  // 2026-11-02 là thứ Hai kế tiếp -> Monday = 2026-11-02
  assert.equal(getMondayOfWeek('2026-11-02'), '2026-11-02')

  // Giờ nộp bài: 2026-11-01T17:30:00Z ở UTC là ngày 01/11,
  // nhưng ở VN (UTC+7) là 00:30 ngày 02/11 -> dateKey = '2026-11-02'
  assert.equal(toVnDateKey('2026-11-01T17:30:00.000Z'), '2026-11-02')
  // 2026-11-01T16:59:59Z ở VN là 23:59:59 ngày 01/11 -> dateKey = '2026-11-01'
  assert.equal(toVnDateKey('2026-11-01T16:59:59.000Z'), '2026-11-01')

  // getIntersectingWeeks: kỳ từ 2026-11-01 (Chủ nhật) đến 2026-11-25 (thứ Tư)
  // Tuần đầu giao: 2026-10-26 (chứa 01/11)
  // Tuần cuối giao: 2026-11-23 (chứa 25/11)
  const weeks = getIntersectingWeeks('2026-11-01', '2026-11-25')
  assert.deepEqual(weeks, [
    '2026-10-26',
    '2026-11-02',
    '2026-11-09',
    '2026-11-16',
    '2026-11-23',
  ])
})

// 3. Kỳ 1 ngày (1-day period)
test('kỳ 1 ngày: tính đúng kỳ trước cùng độ dài 1 ngày, danh sách tuần đúng 1 tuần', () => {
  const p1 = getPreviousPeriod('2026-11-15', '2026-11-15')
  assert.equal(p1.days, 1)
  assert.equal(p1.fromDate, '2026-11-14')
  assert.equal(p1.toDate, '2026-11-14')

  const weeks = getIntersectingWeeks('2026-11-15', '2026-11-15')
  // 2026-11-15 là Chủ nhật -> tuần bắt đầu từ thứ Hai 2026-11-09
  assert.deepEqual(weeks, ['2026-11-09'])
})

// 4. Tháng 31 ngày (31-day month)
test('tháng 31 ngày: tính kỳ trước cùng độ dài đúng 31 ngày qua biên tháng', () => {
  // Kỳ hiện tại: 2026-10-01 đến 2026-10-31 (tháng 10 có 31 ngày)
  assert.equal(getCalendarDays('2026-10-01', '2026-10-31'), 31)

  const pOct = getPreviousPeriod('2026-10-01', '2026-10-31')
  assert.equal(pOct.days, 31)
  assert.equal(pOct.toDate, '2026-09-30')
  assert.equal(pOct.fromDate, '2026-08-31') // 31 ngày: 1 ngày tháng 8 + 30 ngày tháng 9

  // Kỳ từ 01/11 đến 25/11 (25 ngày) -> kỳ trước 07/10 đến 31/10 (25 ngày) như spec ví dụ
  const pNov = getPreviousPeriod('2026-11-01', '2026-11-25')
  assert.equal(pNov.days, 25)
  assert.equal(pNov.toDate, '2026-10-31')
  assert.equal(pNov.fromDate, '2026-10-07')
  assert.equal(getCalendarDays('2026-10-07', '2026-10-31'), 25)
})

// 5. Kỳ trước không có dữ liệu (previous period has no data)
test('kỳ trước không có dữ liệu -> summary null', () => {
  const summaryEmpty = buildPeriodSummary([], [{ id: 'hw-1' }])
  assert.equal(summaryEmpty, null)

  const summaryNull = buildPeriodSummary(null, [{ id: 'hw-1' }])
  assert.equal(summaryNull, null)
})

// 6. Điểm cao nhất mỗi bài (highest score per homework) & tính điểm TB
test('điểm cao nhất mỗi bài: chọn lượt tốt nhất mỗi bài khi tính điểm TB học sinh và TB lớp', () => {
  // Học sinh nộp HW1 hai lần: lần 1 được 5/10, lần 2 được 9/10
  // Học sinh nộp HW2 một lần: 16/20 (thang 10: 8)
  const attempts = [
    { homeworkId: 'hw-1', scaledScore: 5, isLate: false },
    { homeworkId: 'hw-1', scaledScore: 9, isLate: true },
    { homeworkId: 'hw-2', scaledScore: 8, isLate: false },
  ]
  const assigned = [{ id: 'hw-1' }, { id: 'hw-2' }, { id: 'hw-3' }]

  const summary = buildPeriodSummary(attempts, assigned)
  assert.ok(summary)
  // TB điểm cao nhất: (9 + 8) / 2 = 8.5
  assert.equal(summary.averageScore, 8.5)
  assert.equal(summary.submittedCount, 2)
  // 2 bài đã nộp / 3 bài giao = 66.67%
  assert.equal(summary.completionRate, 66.67)
  // 3 lượt nộp, 2 lượt on time -> 2/3 = 66.67%
  assert.equal(summary.onTimeRate, 66.67)

  // Test class average với nhiều lượt nộp của nhiều học sinh
  // S1: HW1 (best 8), HW2 (best 6) -> TB S1 = 7.0
  // S2: HW1 (best 9) -> TB S2 = 9.0
  // S3: PAUSED -> không được tính
  // S4: ACTIVE nhưng 0 nộp bài -> không được tính
  const activeIds = new Set(['s1', 's2', 's4'])
  const classSubs = [
    { studentId: 's1', homeworkId: 'hw-1', total_score: 5, max_score: 10 },
    { studentId: 's1', homeworkId: 'hw-1', total_score: 8, max_score: 10 },
    { studentId: 's1', homeworkId: 'hw-2', total_score: 6, max_score: 10 },
    { studentId: 's2', homeworkId: 'hw-1', total_score: 9, max_score: 10 },
    { studentId: 's3_paused', homeworkId: 'hw-1', total_score: 10, max_score: 10 },
  ]

  const classAvg = computeClassAverage(activeIds, classSubs)
  assert.equal(classAvg.studentCount, 2)
  // TB lớp = (7.0 + 9.0) / 2 = 8.0
  assert.equal(classAvg.averageScore, 8.0)
})

// 7. Tuần trống (empty week)
test('tuần trống: tuần không có bài vẫn xuất hiện với averageScore null và submissions 0', () => {
  // Kỳ từ 2026-11-02 (thứ Hai) đến 2026-11-22 (Chủ nhật) = 3 tuần
  // Tuần 1: 2026-11-02 (có bài)
  // Tuần 2: 2026-11-09 (trống)
  // Tuần 3: 2026-11-16 (có bài)
  const studentAttempts = [
    { homeworkId: 'hw-1', scaledScore: 8, dateKey: '2026-11-04' },
    { homeworkId: 'hw-2', scaledScore: 7, dateKey: '2026-11-18' },
  ]
  const classAttempts = [
    { studentId: 's2', homeworkId: 'hw-1', total_score: 9, max_score: 10, submittedAt: '2026-11-04T10:00:00Z' },
  ]
  const activeIds = new Set(['s1', 's2'])

  const trend = computeWeeklyTrend({
    fromDate: '2026-11-02',
    toDate: '2026-11-22',
    studentAttempts,
    classAttempts,
    activeStudentIds: activeIds,
  })

  assert.equal(trend.length, 3)

  // Tuần 1: 2026-11-02 -> có bài
  assert.equal(trend[0].weekStart, '2026-11-02')
  assert.equal(trend[0].averageScore, 8)
  assert.equal(trend[0].submissions, 1)
  assert.equal(trend[0].classAverageScore, 9)

  // Tuần 2: 2026-11-09 -> tuần trống
  assert.equal(trend[1].weekStart, '2026-11-09')
  assert.equal(trend[1].averageScore, null)
  assert.equal(trend[1].submissions, 0)
  assert.equal(trend[1].classAverageScore, null)

  // Tuần 3: 2026-11-16 -> có bài học sinh, lớp không nộp
  assert.equal(trend[2].weekStart, '2026-11-16')
  assert.equal(trend[2].averageScore, 7)
  assert.equal(trend[2].submissions, 1)
  assert.equal(trend[2].classAverageScore, null)
})

// 8. Level breakdown với level total 0 (level total 0)
test('levelBreakdown: đủ 4 level, level không có câu nào -> total 0, rate null', () => {
  const questionsMap = new Map([
    ['q1', { id: 'q1', question_bank_id: 'b1', question_bank: { difficulty: 'NHAN_BIET' } }],
    ['q2', { id: 'q2', question_bank_id: 'b2', question_bank: { difficulty: 'NHAN_BIET' } }],
    ['q3', { id: 'q3', question_bank_id: 'b3', question_bank: { difficulty: 'THONG_HIEU' } }],
    ['q4', { id: 'q4', question_bank_id: null }], // Không gắn ngân hàng câu hỏi -> bỏ qua
  ])

  const answers = [
    { submission_id: 'sub-1', question_id: 'q1', is_correct: true },
    { submission_id: 'sub-1', question_id: 'q2', is_correct: false },
    { submission_id: 'sub-1', question_id: 'q3', is_correct: true },
    { submission_id: 'sub-1', question_id: 'q4', is_correct: true },
  ]

  const breakdown = computeLevelBreakdown(answers, questionsMap)
  assert.equal(breakdown.length, 4)

  const nb = breakdown.find(l => l.level === 'NHAN_BIET')
  assert.deepEqual(nb, { level: 'NHAN_BIET', correct: 1, total: 2, rate: 50 })

  const th = breakdown.find(l => l.level === 'THONG_HIEU')
  assert.deepEqual(th, { level: 'THONG_HIEU', correct: 1, total: 1, rate: 100 })

  const vd = breakdown.find(l => l.level === 'VAN_DUNG')
  assert.deepEqual(vd, { level: 'VAN_DUNG', correct: 0, total: 0, rate: null })

  const vdc = breakdown.find(l => l.level === 'VAN_DUNG_CAO')
  assert.deepEqual(vdc, { level: 'VAN_DUNG_CAO', correct: 0, total: 0, rate: null })
})

// 9. Top 5 lỗi thường gặp (top 5 common mistakes)
test('commonMistakes: tối đa 5 dạng bài sai nhiều nhất, giảm dần, bỏ qua câu đúng/tự luận/không gắn tag', () => {
  const verifiedBank = (typeId, name) => ({
    id: `bank-${typeId}`,
    qb_lesson_id: 'les-1',
    qb_question_types: { id: typeId, lesson_id: 'les-1', name }
  })

  const qMap = new Map([
    // 7 dạng bài khác nhau
    ['q1', { id: 'q1', question_type: 'MULTIPLE_CHOICE', prompt: { metadata: { questionTypeTag: 'Dạng 1' } } }],
    ['q2', { id: 'q2', question_type: 'MULTIPLE_CHOICE', prompt: { metadata: { questionTypeTag: 'Dạng 2' } } }],
    ['q3', { id: 'q3', question_type: 'MULTIPLE_CHOICE', prompt: {}, question_bank: verifiedBank('t3', 'Dạng 3') }],
    ['q4', { id: 'q4', question_type: 'MULTIPLE_CHOICE', prompt: { metadata: { questionTypeTag: 'Dạng 4' } } }],
    ['q5', { id: 'q5', question_type: 'MULTIPLE_CHOICE', prompt: { metadata: { questionTypeTag: 'Dạng 5' } } }],
    ['q6', { id: 'q6', question_type: 'MULTIPLE_CHOICE', prompt: { metadata: { questionTypeTag: 'Dạng 6' } } }],
    ['q7', { id: 'q7', question_type: 'MULTIPLE_CHOICE', prompt: { metadata: { questionTypeTag: 'Dạng 7' } } }],
    ['qCorrect', { id: 'qCorrect', question_type: 'MULTIPLE_CHOICE', prompt: { metadata: { questionTypeTag: 'Dạng 1' } } }],
    ['qEssay', { id: 'qEssay', question_type: 'ESSAY', prompt: { metadata: { questionTypeTag: 'Dạng Tự Luận' } } }],
    ['qUntagged', { id: 'qUntagged', question_type: 'MULTIPLE_CHOICE', prompt: 'plain question' }],
  ])

  // Tạo các lượt sai với số lượng khác nhau:
  // Dạng 1: 5 lần
  // Dạng 2: 4 lần
  // Dạng 3: 3 lần
  // Dạng 4: 2 lần
  // Dạng 5: 2 lần (thứ tự alphabetic)
  // Dạng 6: 1 lần (rơi khỏi top 5)
  // Dạng 7: 1 lần (rơi khỏi top 5)
  const answers = [
    // Dạng 1 x5
    { submission_id: 's1', question_id: 'q1', is_correct: false },
    { submission_id: 's2', question_id: 'q1', is_correct: false },
    { submission_id: 's3', question_id: 'q1', is_correct: false },
    { submission_id: 's4', question_id: 'q1', is_correct: false },
    { submission_id: 's5', question_id: 'q1', is_correct: false },
    // Dạng 2 x4
    { submission_id: 's1', question_id: 'q2', is_correct: false },
    { submission_id: 's2', question_id: 'q2', is_correct: false },
    { submission_id: 's3', question_id: 'q2', is_correct: false },
    { submission_id: 's4', question_id: 'q2', is_correct: false },
    // Dạng 3 x3
    { submission_id: 's1', question_id: 'q3', is_correct: false },
    { submission_id: 's2', question_id: 'q3', is_correct: false },
    { submission_id: 's3', question_id: 'q3', is_correct: false },
    // Dạng 4 x2
    { submission_id: 's1', question_id: 'q4', is_correct: false },
    { submission_id: 's2', question_id: 'q4', is_correct: false },
    // Dạng 5 x2
    { submission_id: 's1', question_id: 'q5', is_correct: false },
    { submission_id: 's2', question_id: 'q5', is_correct: false },
    // Dạng 6 x1
    { submission_id: 's1', question_id: 'q6', is_correct: false },
    // Dạng 7 x1
    { submission_id: 's1', question_id: 'q7', is_correct: false },
    // Câu đúng -> không tính
    { submission_id: 's1', question_id: 'qCorrect', is_correct: true },
    // Tự luận -> không tính
    { submission_id: 's1', question_id: 'qEssay', is_correct: false },
    // Không tag -> không tính
    { submission_id: 's1', question_id: 'qUntagged', is_correct: false },
  ]

  const mistakes = computeCommonMistakes(answers, qMap)
  assert.equal(mistakes.length, 5, 'chỉ lấy tối đa 5')
  assert.deepEqual(mistakes, [
    { questionType: 'Dạng 1', wrongCount: 5 },
    { questionType: 'Dạng 2', wrongCount: 4 },
    { questionType: 'Dạng 3', wrongCount: 3 },
    { questionType: 'Dạng 4', wrongCount: 2 },
    { questionType: 'Dạng 5', wrongCount: 2 },
  ])
})

// 10. Mapping notes và goalPrevious
test('mapReportNotes và mapPreviousGoal chuẩn hóa đúng dữ liệu', () => {
  const rawNote = {
    summary: 'Học tốt',
    strengths: 'Chăm chỉ',
    improvements: 'Làm bài cẩn thận hơn',
    attitude: 'Tích cực',
    goal_text: 'Đạt điểm 8+',
    goal_score: '8.5',
    teacher_support: 'Hỗ trợ thêm chuyên đề este',
    parent_actions: 'Nhắc nhở làm bài đúng giờ',
    updated_at: '2026-11-25T10:00:00Z',
  }

  const mapped = mapReportNotes(rawNote)
  assert.deepEqual(mapped, {
    summary: 'Học tốt',
    strengths: 'Chăm chỉ',
    improvements: 'Làm bài cẩn thận hơn',
    attitude: 'Tích cực',
    goalText: 'Đạt điểm 8+',
    goalScore: 8.5,
    teacherSupport: 'Hỗ trợ thêm chuyên đề este',
    parentActions: 'Nhắc nhở làm bài đúng giờ',
    updatedAt: '2026-11-25T10:00:00Z',
    isSaved: true,
  })

  assert.equal(mapReportNotes(null), null)

  const rawGoal = {
    goal_score: '7.5',
    goal_text: 'Đạt 7.5 kỳ 1',
    from_date: '2026-10-01',
    to_date: '2026-10-31',
  }
  const mappedGoal = mapPreviousGoal(rawGoal)
  assert.deepEqual(mappedGoal, {
    goalScore: 7.5,
    goalText: 'Đạt 7.5 kỳ 1',
    fromDate: '2026-10-01',
    toDate: '2026-10-31',
  })

  assert.equal(mapPreviousGoal(null), null)
})

console.log('✓ All test-report-insights.mjs tests passed successfully!')
