import assert from 'node:assert/strict'
import { planQuestionRegrade, validateEditedKey } from '../functions/create-homework/edit-question.ts'

let passed = 0
const test = (name, fn) => { fn(); passed++; console.log(`  ✓ ${name}`) }

const sub = (id, total, correct, wrong, max = 10) => ({ id, total_score: total, max_score: max, correct_count: correct, wrong_count: wrong })
const mcAnswer = (id, submission_id, value, score, ok, locked = false) => ({
  id, submission_id, given_answer: { type: 'MULTIPLE_CHOICE', value }, score_earned: score, is_correct: ok, locked,
})
const base = { questionId: 'q1', questionType: 'MULTIPLE_CHOICE', points: 0.25 }

test('đổi đáp án MC: người chọn đáp án mới được +điểm, người chọn đáp án cũ bị -điểm', () => {
  const plan = planQuestionRegrade({
    ...base,
    key: { mcAnswer: 'C', tfAnswers: null, saAnswer: null, saTolerance: 0 },
    answers: [mcAnswer('a1', 's1', 'A', 0.25, true), mcAnswer('a2', 's2', 'C', 0, false), mcAnswer('a3', 's3', 'B', 0, false)],
    submissions: [sub('s1', 5, 20, 20), sub('s2', 5, 20, 20), sub('s3', 5, 20, 20)],
  })
  const byId = Object.fromEntries(plan.answerUpdates.map(a => [a.id, a]))
  assert.deepEqual([byId.a1.is_correct, byId.a1.score_earned], [false, 0])
  assert.deepEqual([byId.a2.is_correct, byId.a2.score_earned], [true, 0.25])
  assert.equal(byId.a3, undefined, 'bài không đổi kết quả thì không ghi')
  const subs = Object.fromEntries(plan.submissionUpdates.map(s => [s.id, s]))
  assert.deepEqual([subs.s1.total_score, subs.s1.correct_count, subs.s1.wrong_count], [4.75, 19, 21])
  assert.deepEqual([subs.s2.total_score, subs.s2.correct_count, subs.s2.wrong_count], [5.25, 21, 19])
  assert.equal(subs.s3, undefined)
})

test('chỉ điều chỉnh theo chênh lệch: giữ điểm thưởng/tự luận trong tổng, không vượt max_score', () => {
  const plan = planQuestionRegrade({
    ...base,
    key: { mcAnswer: 'C', tfAnswers: null, saAnswer: null, saTolerance: 0 },
    answers: [mcAnswer('a1', 's1', 'C', 0, false), mcAnswer('a2', 's2', 'A', 0.25, true)],
    submissions: [sub('s1', 9.9, 1, 1), sub('s2', 0.1, 1, 0)],
  })
  const subs = Object.fromEntries(plan.submissionUpdates.map(s => [s.id, s]))
  assert.equal(subs.s1.total_score, 10, 'trần 10')
  assert.equal(subs.s2.total_score, 0, 'sàn 0')
})

test('câu đã cộng điểm thủ công được giữ nguyên và được đếm', () => {
  const plan = planQuestionRegrade({
    ...base,
    key: { mcAnswer: 'C', tfAnswers: null, saAnswer: null, saTolerance: 0 },
    answers: [mcAnswer('a1', 's1', 'A', 0.25, false, true)],
    submissions: [sub('s1', 5, 0, 1)],
  })
  assert.equal(plan.answerUpdates.length, 0)
  assert.equal(plan.submissionUpdates.length, 0)
  assert.equal(plan.skippedLocked, 1)
})

test('Đúng/Sai: chấm theo từng ý và cập nhật statementGrades', () => {
  const plan = planQuestionRegrade({
    questionId: 'q2', questionType: 'TRUE_FALSE', points: 1,
    key: { mcAnswer: null, tfAnswers: { a: true, b: false, c: true, d: false }, saAnswer: null, saTolerance: 0 },
    answers: [{ id: 'a1', submission_id: 's1', given_answer: { type: 'TRUE_FALSE', value: { a: true, b: false, c: true, d: false } }, score_earned: 0, is_correct: false }],
    submissions: [sub('s1', 2, 0, 1)],
  })
  assert.equal(plan.answerUpdates[0].is_correct, true)
  assert.equal(plan.answerUpdates[0].score_earned, 1)
  assert.deepEqual(plan.answerUpdates[0].given_answer.statementGrades, { a: true, b: true, c: true, d: true })
  assert.equal(plan.submissionUpdates[0].total_score, 3)
})

test('trả lời ngắn: dùng đáp án mới và dung sai', () => {
  const plan = planQuestionRegrade({
    questionId: 'q3', questionType: 'SHORT_ANSWER', points: 0.5,
    key: { mcAnswer: null, tfAnswers: null, saAnswer: '2.5', saTolerance: 0.1 },
    answers: [
      { id: 'a1', submission_id: 's1', given_answer: { type: 'SHORT_ANSWER', value: '2,55' }, score_earned: 0, is_correct: false },
      { id: 'a2', submission_id: 's2', given_answer: { type: 'SHORT_ANSWER', value: '3' }, score_earned: 0, is_correct: false },
    ],
    submissions: [sub('s1', 1, 0, 1), sub('s2', 1, 0, 1)],
  })
  assert.deepEqual(plan.answerUpdates.map(a => a.id), ['a1'])
  assert.equal(plan.submissionUpdates[0].total_score, 1.5)
})

test('đáp án sửa không hợp lệ bị từ chối; không hỗ trợ tự luận', () => {
  assert.ok(validateEditedKey('MULTIPLE_CHOICE', { mcAnswer: 'E' }))
  assert.equal(validateEditedKey('MULTIPLE_CHOICE', { mcAnswer: 'B' }), null)
  assert.ok(validateEditedKey('TRUE_FALSE', { tfAnswers: { a: true } }))
  assert.ok(validateEditedKey('SHORT_ANSWER', { saAnswer: ' ' }))
  assert.ok(validateEditedKey('ESSAY', {}))
})

test('đề 40 câu x 1 điểm quy về thang 10: +1 câu đúng = +0.25 điểm bài, không phải +1', () => {
  const plan = planQuestionRegrade({
    questionId: 'q1', questionType: 'MULTIPLE_CHOICE', points: 1, scoreScale: 10 / 40,
    key: { mcAnswer: 'C', tfAnswers: null, saAnswer: null, saTolerance: 0 },
    answers: [mcAnswer('a1', 's1', 'C', 0, false)],
    submissions: [sub('s1', 5, 20, 20)],
  })
  assert.equal(plan.submissionUpdates[0].total_score, 5.25)
})

test('điểm thưởng giữ nguyên khi tổng đang bị trần: mất 1 điểm gốc thì tổng giảm 1 (10 -> 9), thưởng vẫn còn', () => {
  const plan = planQuestionRegrade({
    ...base, points: 1,
    key: { mcAnswer: 'C', tfAnswers: null, saAnswer: null, saTolerance: 0 },
    answers: [mcAnswer('a1', 's1', 'A', 1, true)],
    submissions: [{ ...sub('s1', 10, 5, 0), bonus_score: 1 }],
  })
  assert.equal(plan.submissionUpdates[0].total_score, 9)
})

test('câu được cộng đủ điểm thủ công nhưng không có log (tổng đã chạm trần) vẫn được giữ', () => {
  const plan = planQuestionRegrade({
    ...base,
    key: { mcAnswer: 'C', tfAnswers: null, saAnswer: null, saTolerance: 0 },
    answers: [mcAnswer('a1', 's1', 'A', 0.25, false, false)],
    submissions: [sub('s1', 10, 0, 1)],
  })
  assert.equal(plan.answerUpdates.length, 0)
  assert.equal(plan.skippedLocked, 1)
})

console.log(`\nKết quả: ${passed} passed`)
