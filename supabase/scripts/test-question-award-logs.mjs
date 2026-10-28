import assert from 'node:assert/strict'
import { QUESTION_AWARD_LOG_SELECT, mapQuestionAwardLogRow } from '../shared/question-award-logs.ts'

// ---------------------------------------------------------------------------
// Query shape: reopen-submission (ghi) và student-history (đọc) dùng chung
// SELECT này -> đổi cột ở một nơi mà quên DTO sẽ làm hỏng render log.
// ---------------------------------------------------------------------------
const cols = QUESTION_AWARD_LOG_SELECT.split(',').map(c => c.trim())
for (const required of [
  'id', 'submission_id', 'answer_id', 'question_id', 'actor_name',
  'question_number', 'part_title', 'question_points',
  'score_before', 'score_after', 'applied_delta', 'total_score_after', 'created_at'
]) {
  assert.ok(cols.includes(required), `QUESTION_AWARD_LOG_SELECT thiếu cột ${required}`)
}
assert.equal(new Set(cols).size, cols.length, 'QUESTION_AWARD_LOG_SELECT có cột trùng')

// ---------------------------------------------------------------------------
// DTO mapper: row PostgREST (snake_case, có thể null/rác) -> camelCase cho FE.
// ---------------------------------------------------------------------------
const row = {
  id: '11111111-1111-4111-8111-111111111111',
  submission_id: '22222222-2222-4222-8222-222222222222',
  answer_id: '33333333-3333-4333-8333-333333333333',
  question_id: '44444444-4444-4444-8444-444444444444',
  actor_name: 'Nguyễn Văn A',
  question_number: 2,
  part_title: 'Phần 3',
  question_points: '0.75',
  score_before: '0.25',
  score_after: '0.75',
  applied_delta: '0.50',
  total_score_after: '3.00',
  created_at: '2026-10-28T03:00:00.000Z'
}
assert.deepEqual(mapQuestionAwardLogRow(row), {
  id: row.id,
  submissionId: row.submission_id,
  answerId: row.answer_id,
  questionId: row.question_id,
  questionNumber: 2,
  partTitle: 'Phần 3',
  questionPoints: 0.75,
  scoreBefore: 0.25,
  scoreAfter: 0.75,
  delta: 0.5,
  totalScoreAfter: 3,
  actorName: 'Nguyễn Văn A',
  createdAt: '2026-10-28T03:00:00.000Z'
})

// Row null/rác (FK on delete set null, numeric text từ PostgREST) không được throw.
const fallback = mapQuestionAwardLogRow({
  id: 'x', submission_id: 'y',
  answer_id: null, question_id: null, question_number: null, part_title: null,
  question_points: null, score_before: 'abc', score_after: null,
  applied_delta: 'not-a-number', total_score_after: null, actor_name: null, created_at: null
})
assert.equal(fallback.answerId, null)
assert.equal(fallback.questionId, null)
assert.equal(fallback.questionNumber, null)
assert.equal(fallback.partTitle, null)
assert.equal(fallback.questionPoints, null)
assert.equal(fallback.scoreBefore, 0)
assert.equal(fallback.scoreAfter, 0)
assert.equal(fallback.delta, 0)
assert.equal(fallback.totalScoreAfter, null)
assert.equal(fallback.actorName, '')
assert.equal(fallback.createdAt, null)

// Row hoàn toàn trống (caller vẫn map được, filter rỗng ở tầng gọi).
const empty = mapQuestionAwardLogRow({})
assert.equal(empty.submissionId, '')
assert.equal(empty.delta, 0)

console.log('Question award log shared helper passed')
