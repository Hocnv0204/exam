// Independent transaction oracle: run with `node --test supabase/scripts/test-exam-submission.mjs`.
// This models the database row lock/rollback boundary; it does not connect to production.
import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

const sql = readFileSync(new URL('../migrations/20261030020001_exam_submission_atomic.sql', import.meta.url), 'utf8')
const edge = readFileSync(new URL('../functions/submit-homework/index.ts', import.meta.url), 'utf8')
assert.match(sql, /FOR UPDATE/)
assert.match(sql, /CREATE UNIQUE INDEX IF NOT EXISTS submissions_exam_session_unique/)
assert.match(sql, /REVOKE ALL ON FUNCTION public\.commit_exam_submission/)
assert.match(edge, /rpc\('commit_exam_submission'/)

const minute = 60_000
const grace = 90_000
function newExam(overrides = {}) {
  return { published: true, role: 'STUDENT', enrolled: true, targeted: true, maxAttempts: 1,
    submittedCount: 0, started: 0, deadline: 10 * minute, duration: 5 * minute,
    status: null, token: null, draft: [], answer: null, rows: [], ...overrides }
}
function start(s, token, now) {
  if (s.role !== 'STUDENT' || !s.published || !s.enrolled || !s.targeted) throw Error('FORBIDDEN')
  if (s.status === 'ACTIVE') { s.token = token; return s.started }
  if (now >= s.deadline) throw Error('EXAM_EXPIRED')
  if (s.maxAttempts > 0 && s.submittedCount >= s.maxAttempts) throw Error('ATTEMPT_LIMIT')
  s.status = 'ACTIVE'; s.started = now; s.token = token
  return now
}
function autosave(s, token, answers, now) {
  if (s.status !== 'ACTIVE' || s.token !== token || now >= Math.min(s.deadline, s.started + s.duration)) throw Error('INVALID_TOKEN')
  s.draft = answers
}
function commit(s, token, answers, now, fail = false) {
  if (s.token !== token || !['ACTIVE', 'SUBMITTED'].includes(s.status)) throw Error('INVALID_SESSION')
  if (s.answer !== null) {
    if (JSON.stringify(s.answer) !== JSON.stringify(answers)) throw Error('SUBMISSION_CONFLICT')
    return s.submission
  }
  const cutoff = Math.min(s.deadline, s.started + s.duration)
  if (now >= cutoff && (now > cutoff + grace || JSON.stringify(s.draft) !== JSON.stringify(answers))) throw Error('EXAM_EXPIRED')
  if (!s.enrolled || !s.targeted || !s.published) throw Error('FORBIDDEN')
  // Transaction rollback: simulated answer insert failure leaves every row untouched.
  if (fail) throw Error('ANSWER_INSERT_FAILED')
  s.answer = structuredClone(answers)
  s.rows = structuredClone(answers)
  s.submission = { id: 'stable-id', late: now > cutoff }
  s.submittedCount++
  s.status = 'SUBMITTED'
  return s.submission
}

test('access, publication, class and target are required even on restart', () => {
  for (const field of ['role', 'published', 'enrolled', 'targeted']) {
    const s = newExam({ [field]: field === 'role' ? 'ADMIN' : false })
    assert.throws(() => start(s, 't', 0), /FORBIDDEN/)
    assert.equal(s.status, null)
  }
  const s = newExam()
  start(s, 'first', 0)
  assert.equal(start(s, 'second', minute), 0)
  assert.equal(s.token, 'second')
  assert.throws(() => commit(s, 'first', [], minute), /INVALID_SESSION/)
})

test('attempt limit and admin-created active reopen semantics', () => {
  const s = newExam({ submittedCount: 1 })
  assert.throws(() => start(s, 't', 0), /ATTEMPT_LIMIT/)
  s.status = 'ACTIVE'; s.started = 300; s.token = 'admin-placeholder'
  assert.equal(start(s, 'new', 500), 300)
})

test('expiry rejects new drafts and final answers but permits only saved draft for bounded grace', () => {
  const s = newExam(); start(s, 't', 0)
  const draft = [{ questionId: 'q', givenAnswer: { value: 'A' } }]
  autosave(s, 't', draft, 4 * minute)
  assert.throws(() => autosave(s, 't', [], 5 * minute), /INVALID_TOKEN/)
  assert.throws(() => commit(s, 't', [], 5 * minute), /EXAM_EXPIRED/)
  assert.equal(commit(s, 't', draft, 5 * minute + 30_000).late, true)
  const expired = newExam(); start(expired, 't', 0); autosave(expired, 't', draft, minute)
  assert.throws(() => commit(expired, 't', draft, 5 * minute + grace + 1), /EXAM_EXPIRED/)
})

test('failed insert rolls back; concurrent/retried identical submissions have one result, conflict fails', async () => {
  const s = newExam(); start(s, 't', 0)
  const answer = [{ questionId: 'q', givenAnswer: { value: 'B' } }]
  assert.throws(() => commit(s, 't', answer, minute, true), /ANSWER_INSERT_FAILED/)
  assert.equal(s.status, 'ACTIVE'); assert.equal(s.answer, null); assert.deepEqual(s.rows, [])
  const results = await Promise.all(Array.from({ length: 8 }, () => Promise.resolve().then(() => commit(s, 't', answer, minute))))
  assert.ok(results.every(r => r === results[0]))
  assert.equal(s.submittedCount, 1); assert.equal(s.rows.length, 1)
  assert.throws(() => commit(s, 't', [], minute), /SUBMISSION_CONFLICT/)
  assert.equal(commit(s, 't', answer, 20 * minute).id, 'stable-id')
})
