import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { createQuestionAppealsHandler, appealDto } from '../functions/question-appeals/handler.js'

const id = n => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`
const student = { id: id(1), role: 'STUDENT' }
const other = { id: id(2), role: 'STUDENT' }
const admin = { id: id(3), role: 'ADMIN' }
const SUB = id(10), ANSWER = id(20), CLASS = id(30)

// An independent in-memory repository contract, not real accounts/submissions.
// It models unique/CAS writes; SQL itself still requires migration validation locally.
function fixture() {
  const tables = {
    submissions: [
      { id: SUB, student_id: student.id, status: 'SUBMITTED', is_trial: false, total_score: 6.25 },
      { id: id(11), student_id: other.id, status: 'SUBMITTED', is_trial: false, total_score: 7 },
      { id: id(12), student_id: student.id, status: 'SUBMITTED', is_trial: true, total_score: 0 },
      { id: id(13), student_id: student.id, status: 'IN_PROGRESS', is_trial: false, total_score: 0 },
    ],
    submission_answers: [{ id: ANSWER, submission_id: SUB, score_earned: 0.25 }, { id: id(21), submission_id: id(11), score_earned: 1 }],
    question_appeals: [],
  }
  const calls = []
  let failTable = null
  const db = { from(table) {
    const call = { table, mode: 'read', filters: [], columns: '', payload: null }
    calls.push(call)
    let range = [0, Infinity]
    const q = {
      select(columns) { call.columns = columns; return q },
      eq(key, value) { call.filters.push([key, value]); return q },
      order() { return q },
      range(from, to) { range = [from, to]; return q },
      insert(payload) { call.mode = 'insert'; call.payload = payload; return q },
      update(payload) { call.mode = 'update'; call.payload = payload; return q },
      single() { return run(true) }, maybeSingle() { return run(true) },
      then(resolve, reject) { return run(false).then(resolve, reject) },
    }
    async function run(single) {
      if (failTable === table) return { data: null, error: { code: 'XX000', message: 'DB secret internal detail' } }
      assert.ok(tables[table], `unexpected table ${table}`)
      let rows = tables[table].filter(row => call.filters.every(([key, value]) => row[key] === value))
      if (call.mode === 'insert') {
        if (tables[table].some(row => row.submission_answer_id === call.payload.submission_answer_id)) return { data: null, error: { code: '23505' } }
        const row = { id: id(100 + tables[table].length), status: 'OPEN', response: null, version: 1,
          class_id: CLASS, homework_title: 'Bài 1', question_number: 2, part_title: 'I', created_at: '2026-10-30T00:00:00Z', updated_at: '2026-10-30T00:00:00Z',
          answered_at: null, closed_at: null, ...call.payload }
        tables[table].push(row); rows = [row]
      }
      if (call.mode === 'update') {
        for (const row of rows) Object.assign(row, call.payload, { version: row.version + 1,
          ...(call.payload.status === 'ANSWERED' ? { answered_at: '2026-10-30T01:00:00Z' } : { closed_at: '2026-10-30T02:00:00Z' }) })
      }
      const count = rows.length
      rows = rows.slice(range[0], range[1] === Infinity ? undefined : range[1] + 1).map(row => ({ ...row }))
      return { data: single ? rows[0] || null : rows, error: null, count }
    }
    return q
  } }
  const handler = createQuestionAppealsHandler({
    requireAuth: async req => {
      const user = ({ student, other, admin })[req.headers.get('authorization')]
      if (!user) throw new Error('Unauthorized')
      return { user, serviceRoleClient: db }
    },
    handleCors: req => req.method === 'OPTIONS' ? new Response('ok') : null,
    jsonResponse: (data, status = 200) => Response.json({ success: true, data }, { status }),
    errorResponse: (error, status) => Response.json({ success: false, error }, { status }),
  })
  async function request(user, method, body, query = '') {
    const response = await handler(new Request(`https://fixture.invalid/question-appeals${query}`, {
      method, headers: user ? { authorization: user } : {}, ...(body !== undefined ? { body: JSON.stringify(body) } : {}),
    }))
    return { status: response.status, body: await response.json() }
  }
  return { tables, calls, request, fail: table => { failTable = table } }
}
const create = { submissionId: SUB, submissionAnswerId: ANSWER, message: 'Em muốn hỏi cách chấm câu này.' }
const f = fixture()
const grades = JSON.stringify([f.tables.submissions, f.tables.submission_answers])
for (const [method, body, query] of [['POST', create, ''], ['GET', undefined, `?submissionId=${SUB}`], ['PATCH', { action: 'reply' }, '']]) {
  assert.equal((await f.request(null, method, body, query)).status, 401)
}
assert.equal(f.calls.length, 0, 'unauthenticated requests must not touch service role')
assert.equal((await f.request('admin', 'POST', create)).status, 403)
assert.equal((await f.request('student', 'POST', { ...create, submissionId: id(11), submissionAnswerId: id(21) })).status, 404)
assert.equal((await f.request('student', 'GET', undefined, `?submissionId=${id(11)}`)).status, 404)
assert.equal((await f.request('student', 'GET', undefined, `?submissionId=${SUB}&studentId=${other.id}`)).status, 403)
assert.equal((await f.request('student', 'GET')).status, 400)
for (const submissionId of [id(12), id(13)]) assert.equal((await f.request('student', 'POST', { ...create, submissionId })).status, 404)
assert.equal((await f.request('student', 'POST', { ...create, submissionAnswerId: id(21) })).status, 404)
for (const message of ['', '   ', 'x'.repeat(1001), 1]) assert.equal((await f.request('student', 'POST', { ...create, message })).status, 400)
const writes = await Promise.all([f.request('student', 'POST', { ...create, student_id: other.id, role: 'ADMIN', status: 'ANSWERED', response: 'forged' }), f.request('student', 'POST', create)])
assert.deepEqual(writes.map(r => r.status).sort(), [201, 409], 'concurrent duplicate create must create exactly once')
assert.equal(f.tables.question_appeals.length, 1)
const row = f.tables.question_appeals[0]
assert.equal(row.student_id, student.id)
assert.equal(row.status, 'OPEN')
assert.equal(row.response, null)
assert.equal(f.calls.find(c => c.mode === 'insert').payload.response, undefined, 'ignore forged admin fields')
assert.equal((await f.request('student', 'POST', create)).status, 409)
assert.equal((await f.request('student', 'PATCH', { action: 'reply', appealId: row.id, version: 1, response: 'fake', role: 'ADMIN' })).status, 403)
assert.equal((await f.request('other', 'POST', { action: 'close', appealId: row.id, version: 1 })).status, 403)
assert.equal((await f.request('admin', 'POST', { action: 'close', appealId: row.id, version: 1 })).status, 409, 'OPEN cannot skip response')
assert.equal((await f.request('admin', 'PATCH', { action: 'reply', appealId: row.id, version: 1, response: 'x'.repeat(2001) })).status, 400)
const replies = await Promise.all(['Thầy đã xem lại.', 'Một phản hồi khác'].map(response => f.request('admin', 'PATCH', { action: 'reply', appealId: row.id, version: 1, response })))
assert.deepEqual(replies.map(r => r.status).sort(), [200, 409], 'CAS rejects stale concurrent admin response')
assert.equal(row.version, 2)
assert.equal(row.response, 'Thầy đã xem lại.')
assert.equal(row.replied_by, admin.id)
const own = await f.request('student', 'GET', undefined, `?submissionId=${SUB}`)
assert.equal(own.status, 200)
assert.equal(own.body.data.items[0].response, 'Thầy đã xem lại.')
const scope = f.calls.findLast(c => c.table === 'question_appeals' && c.mode === 'read')
assert.ok(scope.filters.some(([key, value]) => key === 'student_id' && value === student.id))
assert.ok(scope.filters.some(([key, value]) => key === 'submission_id' && value === SUB))
for (const key of ['studentId', 'studentName', 'className', 'replied_by', 'correct_answer', 'given_answer', 'student']) assert.equal(key in own.body.data.items[0], false)
const inbox = await f.request('admin', 'GET', undefined, `?status=ANSWERED&classId=${CLASS}&studentId=${student.id}&page=1&pageSize=1`)
assert.equal(inbox.body.data.total, 1)
assert.equal(inbox.body.data.items[0].studentId, student.id)
for (const query of ['?page=0', '?pageSize=101', '?status=BOGUS', '?classId=bad']) assert.equal((await f.request('admin', 'GET', undefined, query)).status, 400)
assert.equal((await f.request('admin', 'POST', { action: 'close', appealId: row.id, version: 1 })).status, 409)
assert.equal((await f.request('admin', 'POST', { action: 'close', appealId: row.id, version: 2 })).status, 200)
assert.equal(row.status, 'CLOSED')
assert.equal(row.version, 3)
assert.equal((await f.request('admin', 'PATCH', { action: 'reply', appealId: row.id, version: 3, response: 'overwrite' })).status, 409)
assert.equal(JSON.stringify([f.tables.submissions, f.tables.submission_answers]), grades, 'appeals must not mutate grades or answers')
assert.ok(f.calls.filter(c => c.mode !== 'read').every(c => c.table === 'question_appeals'))
for (const table of ['submissions', 'submission_answers', 'question_appeals']) {
  const failed = fixture(); failed.fail(table)
  const result = await failed.request('student', 'POST', create)
  assert.equal(result.status, 500)
  assert.doesNotMatch(JSON.stringify(result.body), /secret|internal detail/)
}
const leaked = appealDto({ ...row, correct_answer: 'SECRET', question_answers: { sa_answer: 42 }, student: { full_name: 'Other student' }, adminToken: 'SECRET' })
assert.doesNotMatch(JSON.stringify(leaked), /SECRET|Other student|sa_answer/)

const sql = readFileSync(new URL('../migrations/20261030000000_question_appeals.sql', import.meta.url), 'utf8')
for (const invariant of [/enable row level security/i, /revoke all on table.*from public, anon, authenticated/i,
  /grant all on table.*to service_role/i, /submission_answer_id uuid not null unique/i,
  /references public\.submissions/, /references public\.submission_answers/, /for update/i, /for share/i,
  /s\.student_id is distinct from new\.student_id/, /s\.status is distinct from 'SUBMITTED'/,
  /coalesce\(s\.is_trial, false\)/, /new\.version := old\.version \+ 1/]) assert.match(sql, invariant)
assert.doesNotMatch(sql, /create policy|update public\.(submissions|submission_answers)\b/i)
console.log('Question appeals backend: auth/scope/trial/status/duplicate/CAS/DTO/grade invariants/DB errors PASS (mock repository; SQL not applied).')
