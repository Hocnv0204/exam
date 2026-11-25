import assert from 'node:assert/strict'
import {
  validateNotesPayload,
  buildDraftNotes,
  formatViNumber,
  isValidCalendarDate,
} from '../functions/student-report-notes/logic.ts'

console.log('Running test-student-report-notes-logic.mjs...')

const validStudentId = '11111111-2222-4333-8444-555555555555'
const validClassId = '66666666-7777-4888-8999-000000000000'

// =========================================================================
// 1. isValidCalendarDate
// =========================================================================
{
  assert.equal(isValidCalendarDate('2026-11-25'), true)
  assert.equal(isValidCalendarDate('2024-02-29'), true) // năm nhuận
  assert.equal(isValidCalendarDate('2026-02-29'), false) // không nhuận
  assert.equal(isValidCalendarDate('2026-02-30'), false)
  assert.equal(isValidCalendarDate('2026-13-01'), false)
  assert.equal(isValidCalendarDate('2026-00-10'), false)
  assert.equal(isValidCalendarDate('not-a-date'), false)
  assert.equal(isValidCalendarDate('2026/11/25'), false)
  console.log('✓ isValidCalendarDate passed')
}

// =========================================================================
// 2. formatViNumber
// =========================================================================
{
  assert.equal(formatViNumber(7.5), '7,5')
  assert.equal(formatViNumber(8), '8')
  assert.equal(formatViNumber(8.25, 2), '8,25')
  assert.equal(formatViNumber(0), '0')
  assert.equal(formatViNumber(null), '0')
  assert.equal(formatViNumber(undefined), '0')
  assert.equal(formatViNumber(NaN), '0')
  console.log('✓ formatViNumber passed')
}

// =========================================================================
// 3. validateNotesPayload
// =========================================================================
{
  // 3.a Hợp lệ cơ bản (camelCase)
  const validBody = {
    studentId: validStudentId,
    classId: validClassId,
    fromDate: '2026-11-01',
    toDate: '2026-11-25',
    summary: 'Tóm tắt kỳ học.',
    strengths: 'Điểm mạnh.',
    improvements: 'Cần cải thiện.',
    attitude: 'Chăm chú nghe giảng.',
    goalText: 'Đạt điểm từ 8,5 trở lên.',
    goalScore: 8.5,
    teacherSupport: 'Hỗ trợ nâng cao.',
    parentActions: 'Nhắc con làm bài.',
  }
  const res1 = validateNotesPayload(validBody)
  assert.equal(res1.ok, true)
  if (res1.ok) {
    assert.equal(res1.value.studentId, validStudentId)
    assert.equal(res1.value.classId, validClassId)
    assert.equal(res1.value.fromDate, '2026-11-01')
    assert.equal(res1.value.toDate, '2026-11-25')
    assert.equal(res1.value.goalScore, 8.5)
  }

  // 3.b Hỗ trợ snake_case aliases và trim chuỗi rỗng thành null
  const resAliases = validateNotesPayload({
    studentId: validStudentId,
    classId: validClassId,
    fromDate: '2026-11-01',
    toDate: '2026-11-25',
    summary: '   ',
    attitude: '',
    goal_text: 'Mục tiêu snake_case',
    goal_score: '9,25',
    teacher_support: '  Hỗ trợ  ',
    parent_actions: null,
  })
  assert.equal(resAliases.ok, true)
  if (resAliases.ok) {
    assert.equal(resAliases.value.summary, null)
    assert.equal(resAliases.value.attitude, null)
    assert.equal(resAliases.value.goalText, 'Mục tiêu snake_case')
    assert.equal(resAliases.value.goalScore, 9.25)
    assert.equal(resAliases.value.teacherSupport, 'Hỗ trợ')
    assert.equal(resAliases.value.parentActions, null)
  }

  // 3.c Biên độ dài 1500 ký tự hợp lệ, 1501 ký tự bị từ chối
  const text1500 = 'x'.repeat(1500)
  const text1501 = 'x'.repeat(1501)
  const resBoundary1500 = validateNotesPayload({
    studentId: validStudentId,
    classId: validClassId,
    fromDate: '2026-11-01',
    toDate: '2026-11-25',
    summary: text1500,
  })
  assert.equal(resBoundary1500.ok, true)

  const resOver1500 = validateNotesPayload({
    studentId: validStudentId,
    classId: validClassId,
    fromDate: '2026-11-01',
    toDate: '2026-11-25',
    summary: text1501,
  })
  assert.equal(resOver1500.ok, false)
  if (!resOver1500.ok) assert.match(resOver1500.error, /1500 ký tự/i)

  // 3.d goalScore: -1, 10.01, null, số kiểu chuỗi
  const resNegativeScore = validateNotesPayload({
    studentId: validStudentId,
    classId: validClassId,
    fromDate: '2026-11-01',
    toDate: '2026-11-25',
    goalScore: -1,
  })
  assert.equal(resNegativeScore.ok, false)
  if (!resNegativeScore.ok) assert.match(resNegativeScore.error, /goalScore/i)

  const resOverScore = validateNotesPayload({
    studentId: validStudentId,
    classId: validClassId,
    fromDate: '2026-11-01',
    toDate: '2026-11-25',
    goalScore: 10.01,
  })
  assert.equal(resOverScore.ok, false)
  if (!resOverScore.ok) assert.match(resOverScore.error, /goalScore/i)

  const resNullScore = validateNotesPayload({
    studentId: validStudentId,
    classId: validClassId,
    fromDate: '2026-11-01',
    toDate: '2026-11-25',
    goalScore: null,
  })
  assert.equal(resNullScore.ok, true)
  if (resNullScore.ok) assert.equal(resNullScore.value.goalScore, null)

  // 3.e Ngày sai định dạng hoặc fromDate > toDate
  const resInvalidDate = validateNotesPayload({
    studentId: validStudentId,
    classId: validClassId,
    fromDate: '2026-02-30',
    toDate: '2026-03-05',
  })
  assert.equal(resInvalidDate.ok, false)

  const resReversedDate = validateNotesPayload({
    studentId: validStudentId,
    classId: validClassId,
    fromDate: '2026-11-25',
    toDate: '2026-11-01',
  })
  assert.equal(resReversedDate.ok, false)
  if (!resReversedDate.ok) assert.match(resReversedDate.error, /nhỏ hơn hoặc bằng/i)

  // 3.f studentId / classId không hợp lệ
  assert.equal(validateNotesPayload({ studentId: 'abc', classId: validClassId, fromDate: '2026-11-01', toDate: '2026-11-25' }).ok, false)
  assert.equal(validateNotesPayload({ studentId: validStudentId, classId: 'xyz', fromDate: '2026-11-01', toDate: '2026-11-25' }).ok, false)
  assert.equal(validateNotesPayload(null).ok, false)
  assert.equal(validateNotesPayload('invalid').ok, false)

  console.log('✓ validateNotesPayload invariants passed')
}

// =========================================================================
// 4. buildDraftNotes
// =========================================================================
{
  // 4.a Dữ liệu rỗng / chưa có lượt nộp bài
  const emptyDraft = buildDraftNotes({})
  assert.equal(emptyDraft.attitude, null, 'attitude phải là null')
  assert.equal(emptyDraft.goalScore, null, 'goalScore phải là null khi chưa có điểm')
  assert.ok(emptyDraft.summary.length > 20, 'summary không được rỗng')
  assert.ok(emptyDraft.goalText.length > 10, 'goalText không được rỗng')
  assert.ok(emptyDraft.strengths.length > 10, 'strengths không được rỗng')
  assert.ok(emptyDraft.improvements.length > 10, 'improvements không được rỗng')
  assert.ok(emptyDraft.teacherSupport.length > 10, 'teacherSupport không được rỗng')
  assert.ok(emptyDraft.parentActions.length > 10, 'parentActions không được rỗng')

  // Đảm bảo không bị rò rỉ NaN, undefined, null trong các chuỗi sinh ra
  for (const [key, value] of Object.entries(emptyDraft)) {
    if (typeof value === 'string') {
      assert.doesNotMatch(value, /\bNaN\b/, `draft.${key} không được chứa NaN`)
      assert.doesNotMatch(value, /\bundefined\b/, `draft.${key} không được chứa undefined`)
      assert.doesNotMatch(value, /\bnull\b/, `draft.${key} không được chứa chữ null`)
    }
  }

  // 4.b Học sinh tốt / tiến bộ
  const goodReport = {
    summary: {
      averageScore: 8.2,
      completionRate: 100,
      onTimeRate: 95,
      submittedCount: 8,
      assignedCount: 8,
    },
    attendance: {
      summary: {
        attendanceRate: 100,
        classAverageRate: 90,
        present: 8,
        absent: 0,
        classSessions: 8,
      },
    },
    previousPeriod: {
      summary: {
        averageScore: 7.5,
      },
    },
    topicBreakdown: [
      { topicTitle: 'Đạo hàm', averageScore: 9.0 },
      { topicTitle: 'Tích phân', averageScore: 8.5 },
      { topicTitle: 'Hình không gian', averageScore: 7.2 },
    ],
    commonMistakes: [],
    levelBreakdown: [
      { level: 'NHAN_BIET', rate: 95 },
      { level: 'VAN_DUNG', rate: 80 },
    ],
  }

  const goodDraft = buildDraftNotes(goodReport)
  assert.equal(goodDraft.attitude, null)

  // goalScore: min(10, ceil0.5(8.2 + 0.5)) = ceil0.5(8.7) = 9.0
  assert.equal(goodDraft.goalScore, 9.0)

  // Thứ tự: tiến bộ / điểm mạnh trước
  assert.match(goodDraft.summary, /tiến bộ rõ rệt|tăng/i, 'Tóm tắt phải nêu tiến bộ trước')
  // Số định dạng kiểu Việt (7,5; 8,2; 0,7)
  assert.match(goodDraft.summary, /8,2/, 'Điểm phải format dấu phẩy kiểu Việt')
  assert.match(goodDraft.summary, /0,7/, 'Chênh lệch điểm phải format kiểu Việt')
  assert.doesNotMatch(goodDraft.summary, /8\.2/, 'Không được dùng dấu chấm số thập phân trong tiếng Việt')

  // Không có thuật ngữ "yếu vận dụng"
  assert.doesNotMatch(goodDraft.strengths, /yếu vận dụng/i)
  assert.doesNotMatch(goodDraft.improvements, /yếu vận dụng/i)

  // Phụ huynh: 2 gợi ý cụ thể (chứa ít nhất 2 dấu gạch đầu dòng)
  const parentActionLines = goodDraft.parentActions.split('\n').filter(l => l.startsWith('-'))
  assert.equal(parentActionLines.length, 2, 'parentActions phải có đúng 2 gợi ý cụ thể')

  // 4.c Học sinh yếu / cần hỗ trợ
  const weakReport = {
    summary: {
      averageScore: 5.3,
      completionRate: 50,
      onTimeRate: 40,
      submittedCount: 3,
      assignedCount: 6,
    },
    attendance: {
      summary: {
        attendanceRate: 60,
        classAverageRate: 90,
        present: 3,
        absent: 2,
        classSessions: 5,
      },
    },
    previousPeriod: {
      summary: {
        averageScore: 6.0,
      },
    },
    topicBreakdown: [
      { topicTitle: 'Hàm số mũ', averageScore: 4.5 },
      { topicTitle: 'Logarit', averageScore: 5.8 },
      { topicTitle: 'Hình giải tích', averageScore: 6.8 },
    ],
    commonMistakes: [
      { questionType: 'Tính nhầm dấu', wrongCount: 4 },
      { questionType: 'Quên điều kiện xác định', wrongCount: 3 },
    ],
    levelBreakdown: [
      { level: 'NHAN_BIET', rate: 70 },
      { level: 'VAN_DUNG', rate: 25 },
    ],
  }

  const weakDraft = buildDraftNotes(weakReport)
  // goalScore: min(10, ceil0.5(5.3 + 0.5)) = ceil0.5(5.8) = 6.0
  assert.equal(weakDraft.goalScore, 6.0)

  // Diễn đạt thân thiện, không dùng "yếu vận dụng" trần trụi
  assert.match(weakDraft.improvements, /làm được bài cơ bản, còn lúng túng ở bài vận dụng/i)
  assert.doesNotMatch(weakDraft.improvements, /yếu vận dụng/i)

  // Giáo viên hỗ trợ gợi ý theo chương < 6.5 và lỗi hay sai
  assert.match(weakDraft.teacherSupport, /Hàm số mũ/i, 'Gợi ý chương < 6.5')
  assert.match(weakDraft.teacherSupport, /Tính nhầm dấu|Quên điều kiện/i, 'Gợi ý dạng bài hay sai')

  // Phụ huynh có gợi ý nhắc nhở làm bài trước hạn
  assert.match(weakDraft.parentActions, /Nhắc con làm bài trước hạn, kiểm tra 2 lần mỗi tuần/i)

  // 4.d Kiểm tra công thức goalScore chi tiết
  const testGoalFormula = (avg) => {
    const d = buildDraftNotes({ summary: { averageScore: avg, submittedCount: 5 } })
    return d.goalScore
  }

  assert.equal(testGoalFormula(7.0), 7.5) // 7.0 + 0.5 = 7.5 -> 7.5
  assert.equal(testGoalFormula(7.1), 8.0) // 7.1 + 0.5 = 7.6 -> 8.0
  assert.equal(testGoalFormula(7.2), 8.0) // 7.2 + 0.5 = 7.7 -> 8.0
  assert.equal(testGoalFormula(7.5), 8.0) // 7.5 + 0.5 = 8.0 -> 8.0
  assert.equal(testGoalFormula(7.6), 8.5) // 7.6 + 0.5 = 8.1 -> 8.5
  assert.equal(testGoalFormula(9.4), 10.0) // 9.4 + 0.5 = 9.9 -> 10.0
  assert.equal(testGoalFormula(9.8), 10.0) // 9.8 + 0.5 = 10.3 -> min(10, 10.5) = 10.0
  assert.equal(testGoalFormula(10.0), 10.0)

  console.log('✓ buildDraftNotes invariants and formula passed')
}

console.log('ALL LOGIC TESTS PASSED! ✅')
