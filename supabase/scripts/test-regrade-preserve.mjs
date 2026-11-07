// Kiểm thử giữ điểm khi chấm lại toàn bài (regrade-preserve.ts). Offline, không DB.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { combineRegrade, isPreservedAnswer } from '../functions/create-homework/regrade-preserve.ts'
import { gradeExam } from '../shared/grading-service.ts'

const mc = (id, points = 0.25) => ({ questionId: id, questionType: 'MULTIPLE_CHOICE', points, mcAnswer: 'A' })
const ans = (id, given, is_correct, score_earned) => ({ id, given_answer: { type: 'MULTIPLE_CHOICE', value: given }, is_correct, score_earned })

test('không có điểm cần giữ → trùng khớp gradeExam (không đổi hành vi cũ)', () => {
  const qs = Array.from({ length: 40 }, (_, i) => mc(`q${i}`))
  const givens = qs.map((_, i) => (i % 3 === 0 ? 'A' : 'B'))
  const inputs = qs.map((q, i) => ({ ...q, givenAnswer: { type: 'MULTIPLE_CHOICE', value: givens[i] } }))
  const g = gradeExam(inputs, { targetScale: 10, roundingStep: 0.01 })
  const r = combineRegrade({
    questions: qs, results: g.questionResults,
    oldAnswers: qs.map((q, i) => ans(`a${i}`, givens[i], false, 0)),
    awardedAnswerIds: new Set(), targetScale: 10
  })
  assert.equal(r.totalScore, g.totalScore)
  assert.equal(r.correctCount, g.correctCount)
  assert.equal(r.wrongCount, g.wrongCount)
  assert.equal(r.regradedIndexes.length, 40)
})

test('bonus_score được cộng lại sau khi chấm, chặn trần max_score', () => {
  const qs = [mc('q1', 5), mc('q2', 5)]
  const g = gradeExam(qs.map(q => ({ ...q, givenAnswer: { type: 'MULTIPLE_CHOICE', value: 'A' } })), { targetScale: 10 })
  // Đúng cả 2 câu = 10 điểm; thưởng 1 → vẫn chặn ở 10
  const full = combineRegrade({ questions: qs, results: g.questionResults, oldAnswers: [ans('a1', 'A', true, 5), ans('a2', 'A', true, 5)], awardedAnswerIds: new Set(), targetScale: 10, bonusScore: 1, maxScore: 10 })
  assert.equal(full.totalScore, 10)
  // Đúng 1 câu = 5 điểm; thưởng 1.5 → 6.5
  const g2 = gradeExam([{ ...qs[0], givenAnswer: { type: 'MULTIPLE_CHOICE', value: 'A' } }, { ...qs[1], givenAnswer: { type: 'MULTIPLE_CHOICE', value: 'B' } }], { targetScale: 10 })
  const half = combineRegrade({ questions: qs, results: g2.questionResults, oldAnswers: [ans('a1', 'A', true, 5), ans('a2', 'B', false, 0)], awardedAnswerIds: new Set(), targetScale: 10, bonusScore: 1.5, maxScore: 10 })
  assert.equal(half.baseScore, 5)
  assert.equal(half.totalScore, 6.5)
})

test('câu được cộng điểm thủ công (có log) giữ nguyên điểm & trạng thái, không bị chấm lại', () => {
  const qs = [mc('q1', 5), mc('q2', 5)]
  // Học sinh chọn B ở cả 2 câu (sai); admin đã cộng đủ 5 điểm câu 2 (log theo answer a2)
  const g = gradeExam(qs.map(q => ({ ...q, givenAnswer: { type: 'MULTIPLE_CHOICE', value: 'B' } })), { targetScale: 10 })
  const r = combineRegrade({ questions: qs, results: g.questionResults, oldAnswers: [ans('a1', 'B', false, 0), ans('a2', 'B', true, 5)], awardedAnswerIds: new Set(['a2']), targetScale: 10 })
  assert.equal(r.totalScore, 5)
  assert.deepEqual(r.regradedIndexes, [0], 'chỉ câu 1 được ghi lại')
  assert.equal(r.correctCount, 1)
})

test('câu sai nhưng đã được cộng đủ điểm (không log vì tổng chạm trần) vẫn được giữ', () => {
  const q = mc('q1', 0.5)
  assert.equal(isPreservedAnswer(q, { id: 'a', is_correct: false, score_earned: 0.5 }, new Set()), true)
  assert.equal(isPreservedAnswer(q, { id: 'a', is_correct: false, score_earned: 0.25 }, new Set()), false)
  assert.equal(isPreservedAnswer(q, { id: 'a', is_correct: true, score_earned: 0.5 }, new Set()), false)
  assert.equal(isPreservedAnswer(q, undefined, new Set()), false)
})

test('câu tự luận giữ điểm chấm tay; không tính là câu sai', () => {
  const qs = [mc('q1', 5), { questionId: 'q2', questionType: 'ESSAY', points: 5 }]
  const g = gradeExam([{ ...qs[0], givenAnswer: { type: 'MULTIPLE_CHOICE', value: 'A' } }, { ...qs[1], givenAnswer: { type: 'ESSAY', value: 'bài làm' } }], { targetScale: 10 })
  const r = combineRegrade({ questions: qs, results: g.questionResults, oldAnswers: [ans('a1', 'A', true, 5), { id: 'a2', is_correct: false, score_earned: 3.5 }], awardedAnswerIds: new Set(), targetScale: 10 })
  assert.equal(r.totalScore, 8.5)
  assert.equal(r.wrongCount, 0)
  assert.deepEqual(r.regradedIndexes, [0])
})

test('đề không quy về thang 10 (40 câu × 1 điểm): giữ quy đổi như gradeExam rồi mới cộng thưởng', () => {
  const qs = Array.from({ length: 40 }, (_, i) => mc(`q${i}`, 1))
  const inputs = qs.map((q, i) => ({ ...q, givenAnswer: { type: 'MULTIPLE_CHOICE', value: i < 20 ? 'A' : 'B' } }))
  const g = gradeExam(inputs, { targetScale: 10 })
  const r = combineRegrade({ questions: qs, results: g.questionResults, oldAnswers: qs.map((_, i) => ans(`a${i}`, 'x', false, 0)), awardedAnswerIds: new Set(), targetScale: 10, bonusScore: 0.5, maxScore: 10 })
  assert.equal(r.baseScore, 5)
  assert.equal(r.totalScore, 5.5)
})
