import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

// Independent cent-based business examples; this does not execute PostgreSQL.
function oracle(input, mode) {
  const s = structuredClone(input)
  if (mode === 'mark_correct' && s.correct !== false) throw Error('already correct')
  const increase = Math.max(0, s.points - s.earned)
  if (mode === 'award' && increase === 0) return s
  s.earned += increase
  s.total = Math.min(s.max, s.total + increase * s.max / (s.rawMax ?? s.max))
  if (mode === 'mark_correct') { s.correct = true; s.right++; s.wrong-- }
  s.logs.push({ mode, delta: s.total - input.total })
  return s
}
const initial = { points: 100, earned: 25, total: 600, max: 1000, bonus: 100, correct: false, right: 3, wrong: 2, logs: [] }
const award = oracle(initial, 'award')
assert.deepEqual([award.earned, award.total, award.correct, award.right, award.wrong], [100, 675, false, 3, 2])
assert.equal(award.bonus, 100)
assert.deepEqual(oracle(award, 'award'), award)
const correct = oracle(initial, 'mark_correct')
assert.deepEqual([correct.earned, correct.total, correct.correct, correct.right, correct.wrong], [100, 675, true, 4, 1])
assert.throws(() => oracle(correct, 'mark_correct'), /already correct/)
const full = oracle(award, 'mark_correct')
assert.deepEqual(full.logs.at(-1), { mode: 'mark_correct', delta: 0 })
assert.deepEqual([full.total, full.right, full.wrong], [675, 4, 1])
const capped = oracle({ ...initial, total: 980 }, 'mark_correct')
assert.equal(capped.total, 1000)
assert.equal(capped.logs[0].delta, 20)
const fortyQuestions = oracle({ points: 1, earned: 0, total: 5, max: 10, rawMax: 40, correct: false, right: 20, wrong: 20, logs: [] }, 'mark_correct')
assert.deepEqual([fortyQuestions.earned, fortyQuestions.total, fortyQuestions.right, fortyQuestions.wrong], [1, 5.25, 21, 19])

// Contract checks only: these cannot establish SQL execution or isolation behavior.
const sql = readFileSync(new URL('../migrations/20261104000000_atomic_question_award.sql', import.meta.url), 'utf8')
assert.match(sql, /from public\.submissions where id = p_submission_id for update/i)
assert.match(sql, /submission_id = s\.id for update/i)
assert.match(sql, /a\.is_correct is distinct from false/i)
assert.match(sql, /p_mode = 'award' and v_target = v_before/i)
assert.match(sql, /case when p_mode = 'mark_correct' then true else is_correct end/i)
assert.match(sql, /correct_count[^\n]+\+ 1/i)
assert.match(sql, /wrong_count[^\n]+- 1/i)
assert.match(sql, /sum\(coalesce\(questions\.points, 0\)\)/i)
assert.match(sql, /\(v_target - v_before\) \* coalesce\(s\.max_score, 10\) \/ v_raw_max/i)
assert.match(sql, /least\(coalesce\(s\.max_score, 10\)/i)
assert.match(sql, /insert into public\.question_award_logs/i)
assert.match(sql, /applied_delta >= 0/i)
assert.match(sql, /revoke all on function[^;]+authenticated/i)
assert.doesNotMatch(sql, /set\s+given_answer\s*=/i)
const regrade = readFileSync(new URL('../functions/create-homework/index.ts', import.meta.url), 'utf8')
assert.match(regrade, /from\('question_award_logs'\)\.select\('answer_id'\)/)
console.log('Question award modes: oracle examples and static SQL contract passed (SQL not executed)')
