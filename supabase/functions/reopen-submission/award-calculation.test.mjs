import assert from 'node:assert/strict'
import { calculateQuestionAward } from './award-calculation.js'

assert.deepEqual(calculateQuestionAward(0.25, 0.75, 2.5, 10), {
  target: 0.75, delta: 0.5, newTotal: 3, appliedDelta: 0.5
})
assert.deepEqual(calculateQuestionAward(0.75, 0.75, 3, 10), {
  target: 0.75, delta: 0, newTotal: 3, appliedDelta: 0
})
assert.deepEqual(calculateQuestionAward(0, 1.25, 9.8, 10), {
  target: 1.25, delta: 1.25, newTotal: 10, appliedDelta: 0.2
})
assert.deepEqual(calculateQuestionAward(0, 0.335, 1.005, 5), {
  target: 0.34, delta: 0.34, newTotal: 1.35, appliedDelta: 0.34
})
// Idempotent click: câu đã đủ điểm -> delta = appliedDelta = 0 (backend không ghi audit log).
assert.deepEqual(calculateQuestionAward(1.25, 1.25, 4, 10), {
  target: 1.25, delta: 0, newTotal: 4, appliedDelta: 0
})
// Tổng đã chạm max_score: delta > 0 nhưng appliedDelta = 0 -> backend KHÔNG ghi event log.
assert.deepEqual(calculateQuestionAward(0, 1, 10, 10), {
  target: 1, delta: 1, newTotal: 10, appliedDelta: 0
})
// appliedDelta > 0 <=> điểm tổng bài thật sự tăng (điều kiện ghi log).
for (const args of [[0.25, 0.75, 2.5, 10], [0, 1.25, 9.8, 10], [0.5, 2, 3.3, 10], [0, 1, 10, 10], [1, 1, 5, 5]]) {
  const r = calculateQuestionAward(...args)
  assert.equal(r.appliedDelta > 0, r.newTotal > Math.round((Number(args[2]) + Number.EPSILON) * 100) / 100)
}
console.log('Award calculation invariants passed')
