import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { resolveWrongQuestionType, isBlankWrongAnswer, loadAllAnalysisRows, loadChunkedWrongAnalysis, uniqueWrongAttempts } from '../functions/student-history/wrong-analysis.ts'

const verifiedBank = { id: 'bank-1', qb_lesson_id: 'lesson-1', qb_question_types: { id: 'type-1', lesson_id: 'lesson-1', name: ' Cân   bằng hóa học ' } }
assert.equal(resolveWrongQuestionType({ metadata: { questionTypeTag: ' Phản   ứng ' } }, verifiedBank), 'Phản ứng')
assert.equal(resolveWrongQuestionType(JSON.stringify({ metadata: { questionTypeTag: 'Hàm số' } })), 'Hàm số')
assert.equal(resolveWrongQuestionType({}, verifiedBank), 'Cân bằng hóa học')
assert.equal(resolveWrongQuestionType({}, { ...verifiedBank, qb_lesson_id: 'other' }), null)
assert.equal(resolveWrongQuestionType({ question_type: 'MULTIPLE_CHOICE', qbQuestionTypeId: 'type-1' }), null)
assert.equal(resolveWrongQuestionType('plain question'), null)
assert.equal(resolveWrongQuestionType({}, { ...verifiedBank, id: null }), null)
for (const blank of [null, undefined, '', '  ', '{}', {}, { value: '' }, { a: null, b: '' }]) assert.equal(isBlankWrongAnswer(blank), true)
for (const answer of [0, false, '0', 'false', 'A', { a: false }, { value: 0 }, { a: null, b: true }]) assert.equal(isBlankWrongAnswer(answer), false)

// Two submissions by the same student count twice; duplicate answer rows do not.
const rows = uniqueWrongAttempts([
  { submission_id: 'attempt-1', question_id: 'q1', student_id: 's1' },
  { submission_id: 'attempt-1', question_id: 'q1', student_id: 's1' },
  { submission_id: 'attempt-2', question_id: 'q1', student_id: 's1' },
  { submission_id: 'attempt-1', question_id: 'q2', student_id: 's1' },
])
assert.equal(rows.length, 3)
assert.equal(rows.filter(row => row.question_id === 'q1').length, 2)
assert.equal(new Set(rows.map(row => row.student_id)).size, 1)

const dataset = Array.from({ length: 1205 }, (_, id) => ({ id }))
let calls = 0
const full = await loadAllAnalysisRows(() => ({ range: async (start, end) => { calls++; return { data: dataset.slice(start, end + 1), error: null } } }))
assert.equal(full.data.length, 1205)
assert.equal(calls, 3)
assert.equal(full.data[1204].id, 1204)
const failed = await loadAllAnalysisRows(() => ({ range: async () => ({ data: null, error: { message: 'DB failure' } }) }))
assert.equal(failed.data, null)
assert.equal(failed.error.message, 'DB failure')
console.log('Wrong taxonomy membership, no guessing, blank semantics, unique attempt counts, pagination/error PASS')

// Independent fixture: >1000 UUID-shaped submission IDs and six answers per
// submission force BOTH bounded IN filters and multiple result pages per chunk.
const submissionIds = Array.from({ length: 1205 }, (_, i) => `00000000-0000-4000-8000-${String(i).padStart(12, '0')}`)
const answerRows = submissionIds.flatMap(submission_id => Array.from({ length: 6 }, (_, question_id) => ({ submission_id, question_id })))
const requests = []
const chunked = await loadChunkedWrongAnalysis([...submissionIds, submissionIds[0]], ids => ({
  async range(start, end) {
    assert.ok(ids.length <= 100, 'every IN filter is bounded independently of row pagination')
    requests.push({ ids: [...ids], start, end })
    const allowed = new Set(ids)
    return { data: answerRows.filter(row => allowed.has(row.submission_id)).slice(start, end + 1), error: null }
  },
}))
assert.equal(chunked.error, null)
assert.deepEqual(chunked.data, answerRows, 'all answers merged exactly once across chunk/page boundaries')
assert.deepEqual(requests.filter(request => request.start === 0).flatMap(request => request.ids), submissionIds)
assert.equal(requests.filter(request => request.start === 0).length, 13)
assert.equal(requests.filter(request => request.start === 500).length, 12)

// A later chunk/page fails after earlier successes: return no partial data.
for (const failingPage of [0, 500]) {
  const failureRequests = []
  const result = await loadChunkedWrongAnalysis(submissionIds, ids => ({
    async range(start, end) {
      failureRequests.push({ firstId: ids[0], start })
      if (ids[0] === submissionIds[100] && start === failingPage) return { data: null, error: { message: 'chunk unavailable' } }
      const allowed = new Set(ids)
      return { data: answerRows.filter(row => allowed.has(row.submission_id)).slice(start, end + 1), error: null }
    },
  }))
  assert.equal(result.data, null)
  assert.equal(result.error.message, 'chunk unavailable')
  assert.ok(failureRequests.some(request => request.firstId === submissionIds[0]))
  assert.ok(!failureRequests.some(request => request.firstId === submissionIds[200]), 'stop after the failed chunk')
}
let emptyCalls = 0
assert.deepEqual(await loadChunkedWrongAnalysis([], () => { emptyCalls++; throw new Error('should not query') }), { data: [], error: null })
assert.equal(emptyCalls, 0)
const backend = readFileSync(new URL('../functions/student-history/index.ts', import.meta.url), 'utf8')
assert.match(backend, /isClassHomeworkPopup\s*\? await loadChunkedWrongAnalysis\(subIds,/)
assert.match(backend, /: await buildWrongAnswersQuery\(\)/) // Legacy retains its single query.
assert.match(backend, /if \(analysisError && isClassHomeworkPopup\) return errorResponse\([^\n]+500\)/)
assert.match(backend, /!isClassHomeworkPopup \|\| subIds.length <= ANALYSIS_SUBMISSION_CHUNK_SIZE/)
console.log('1205 submission IDs: bounded IN chunks + per-chunk pagination, deduplication, atomic failures and legacy wiring PASS')
