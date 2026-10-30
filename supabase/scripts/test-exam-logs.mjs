import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import vm from 'node:vm'
import { transformSync } from '../../fe/node_modules/esbuild/lib/main.js'

const id = n => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`
const homeworkId = id(1), studentId = id(2), sessionId = id(3)
const source = readFileSync(new URL('../functions/exam-log/index.ts', import.meta.url), 'utf8')
const compiled = transformSync(source.replace(/^import[^\n]+\n/gm, ''), { loader: 'ts', format: 'cjs' }).code
const sandbox = { console, URL, Request, Response, serve() {}, requireAuth() {}, handleCors() {},
  jsonResponse() {}, errorResponse() {}, exports: {}, module: { exports: {} } }
vm.runInNewContext(compiled, sandbox)
const create = sandbox.module.exports.createExamLogHandler

// Oracle độc lập: mô phỏng PostgREST — bảng student_classes chỉ có khóa kép
// (student_id, class_id) + status, KHÔNG có cột id. Chọn cột không tồn tại phải
// trả về lỗi SQL missing-column giống thật để regression test tự thất bại nếu
// code quay lại .select('id').
const TABLE_COLUMNS = {
  homeworks: ['id', 'type', 'is_published', 'max_violations', 'lessons'],
  student_classes: ['student_id', 'class_id', 'status'],
  homework_targets: ['student_id', 'homework_id'],
  exam_logs: ['id', 'session_id', 'attempt_no', 'action', 'event_id', 'counted', 'reason', 'severity',
    'server_timestamp', 'created_at', 'student_id', 'profiles'],
  exam_sessions: ['id', 'draft_answers', 'session_token', 'auto_submit_state', 'auto_submission_id']
}
function missingColumn(table, columns) {
  const known = TABLE_COLUMNS[table]
  if (!known || !columns) return null
  let depth = 0, cur = '', parts = []
  for (const ch of columns) {
    if (ch === '(') depth++
    if (ch === ')') depth--
    if (ch === ',' && depth === 0) { parts.push(cur); cur = '' } else cur += ch
  }
  if (cur) parts.push(cur)
  for (const part of parts) {
    const name = part.split(/[!(]/)[0].trim()
    if (name && !known.includes(name)) return name
  }
  return null
}

function fixture() {
  const logs = [], calls = []
  let state = 'READY', submissionId = null, token = 'secret', status = 'ACTIVE', outcome = { data: { submissionId: id(99) } }
  let errorTable = null
  const classId = id(4)
  let enrollment = { student_id: studentId, class_id: classId, status: 'ACTIVE' }
  let targets = []
  const homework = { id: homeworkId, type: 'EXAM', is_published: true, max_violations: 2,
    lessons: { is_trial: false, chapters: { class_id: classId } } }
  const session = { id: sessionId, draft_answers: [], session_token: token }
  const db = {
    from(table) {
      const filters = []
      let update = null, range = null, count = false, selectedColumns = null
      const q = {
        select(_columns, options) { selectedColumns = _columns; count = options?.count === 'exact'; return q },
        eq(key, value) { filters.push([key, value]); return q },
        order() { return q },
        range(a, b) { range = [a, b]; return q },
        update(value) { update = value; return q },
        maybeSingle: async () => {
          const missing = missingColumn(table, selectedColumns)
          if (missing) return { data: null, error: { message: `column ${table}.${missing} does not exist`, code: '42703' } }
          if (errorTable === table) return { data: null, error: { message: 'database failure' } }
          if (table === 'homeworks') return { data: homework, error: null }
          if (table === 'student_classes') {
            const row = enrollment && filters.every(([k, v]) => enrollment[k] === v) ? enrollment : null
            return { data: row, error: null }
          }
          if (table === 'exam_sessions') return { data: filters.some(([k, v]) => k === 'session_token' && v !== token)
            ? null : { ...session, auto_submit_state: state, auto_submission_id: submissionId }, error: null }
          return { data: null, error: null }
        },
        then(resolve, reject) {
          const missing = missingColumn(table, selectedColumns)
          if (missing) return Promise.resolve({ data: null, error: { message: `column ${table}.${missing} does not exist`, code: '42703' } }).then(resolve, reject)
          let data = table === 'homework_targets' ? targets : table === 'exam_logs' ? logs : []
          if (errorTable === table) return Promise.resolve({ data: null, error: { message: 'database failure' } }).then(resolve, reject)
          if (update && table === 'exam_sessions' && filters.every(([k, v]) => k !== 'auto_submit_state' || v === state)) {
            state = update.auto_submit_state
            submissionId = update.auto_submission_id || submissionId
          }
          data = data.filter(row => filters.every(([k, v]) => row[k] === v))
          if (range) data = data.slice(range[0], range[1] + 1)
          return Promise.resolve({ data, count: count ? data.length : null, error: null }).then(resolve, reject)
        }
      }
      return q
    },
    async rpc(name, p) {
      if (name === 'claim_exam_auto_submit') {
        const claimed = state === 'READY' && status === 'ACTIVE' && token === p.p_session_token && logs.filter(l => l.counted).length >= p.p_max_violations
        if (claimed) state = 'PENDING'
        return { data: claimed, error: null }
      }
      if (p.p_session_token !== token || status !== 'ACTIVE' || p.p_session_id && p.p_session_id !== sessionId)
        return { data: null, error: { message: 'INVALID_SESSION' } }
      let log = logs.find(l => l.event_id === p.p_event_id)
      if (log && log.action !== p.p_action) return { data: null, error: { message: 'EVENT_ID_CONFLICT' } }
      const already = !!log
      if (!log) {
        const penalized = ['LEAVE_TAB', 'BLUR_TAB', 'LEAVE_EXAM', 'DEVTOOLS', 'FULLSCREEN_EXIT'].includes(p.p_action)
        const previous = [...logs].reverse().find(l => ['LEAVE_TAB', 'BLUR_TAB'].includes(p.p_action)
          ? ['LEAVE_TAB', 'BLUR_TAB'].includes(l.action) : l.action === p.p_action)
        const counted = penalized && (!previous || Date.now() - previous.at >= (['LEAVE_TAB', 'BLUR_TAB'].includes(p.p_action) ? 3000 : 1000))
        log = { id: id(logs.length + 10), homework_id: homeworkId, event_id: p.p_event_id, session_id: sessionId,
          student_id: studentId, action: p.p_action, counted, at: Date.now(), reason: counted ? 'Violation' : 'Deduplicated' }
        logs.push(log)
      }
      return { data: [{ log_row: log, violation_count: logs.filter(l => l.counted).length,
        already_recorded: already, session_id: sessionId }], error: null }
    }
  }
  const handler = create({ requireAuth: async req => {
    if (!req.headers.get('authorization')) throw new Error('Unauthorized')
    return { user: { id: studentId, role: req.headers.get('authorization') === 'admin' ? 'ADMIN' : 'STUDENT' }, serviceRoleClient: db }
  }, handleCors: () => null,
  jsonResponse: (data, status = 200) => Response.json({ data }, { status }),
  errorResponse: (error, status) => Response.json({ error }, { status }),
  submitInvoker: async (_db, args) => { calls.push(args); return typeof outcome === 'function' ? outcome() : outcome } })
  return { logs, calls, setOutcome: value => { outcome = value }, setError: value => { errorTable = value },
    setEnrollment: value => { enrollment = value }, setTargets: value => { targets = value },
    state: () => state, setStatus: value => { status = value },
    async request(body, query = '', auth = 'student', method = 'POST') {
      const res = await handler(new Request(`https://example.invalid/exam-log${query}`, {
        method, headers: { authorization: auth, 'content-type': 'application/json' },
        ...(method === 'POST' ? { body: JSON.stringify(body) } : {}) }))
      return { status: res.status, ...(await res.json()) }
    } }
}

const post = (action, eventId, extra = {}) => ({ homeworkId, action, eventId, sessionToken: 'secret', ...extra })
{
  const f = fixture()
  assert.equal((await f.request(post('LEAVE_TAB', 'x', { sessionToken: '' }))).status, 400)
  assert.equal((await f.request(post('UNKNOWN', 'x'))).status, 400)
  assert.equal((await f.request(post('LEAVE_TAB', 'bad id'))).status, 400)
  assert.equal((await f.request(post('LEAVE_TAB', undefined))).status, 400)
  assert.equal((await f.request(post('LEAVE_TAB', 'x', { sessionToken: 'wrong' }))).status, 403)
  assert.equal((await f.request(post('LEAVE_TAB', 'x', { sessionId: id(555) }))).status, 403)
  assert.equal((await f.request(post('LEAVE_TAB', 'x'), '', 'admin')).status, 403)
  f.setError('homework_targets')
  assert.equal((await f.request(post('LEAVE_TAB', 'x'))).status, 500)
  f.setError(null)
  assert.equal((await f.request(post('LEAVE_TAB', 'x', { reason: 'forged' }))).data.log.reason, 'Violation')
  assert.equal((await f.request(post('LEAVE_TAB', 'x'))).data.idempotent, true)
  assert.equal((await f.request(post('DEVTOOLS', 'x'))).status, 403)
  assert.equal(f.logs.length, 1)
  assert.equal((await f.request(post('BLUR_TAB', 'y'))).data.counted, false)
  const next = await f.request(post('DEVTOOLS', 'z'))
  assert.equal(next.data.currentViolations, 2)
  assert.equal(next.data.autoSubmitted, true)
  assert.equal(next.data.submissionId, id(99))
  assert.equal(f.calls.length, 1)
  assert.equal((await f.request(post('DEVTOOLS', 'z'))).data.autoSubmitted, true)
  assert.equal(f.calls.length, 1, 'duplicate event cannot invoke submit twice')
  assert.equal((await f.request(null, `?homeworkId=${homeworkId}&limit=101`, 'student', 'GET')).status, 400)
  assert.equal((await f.request(null, `?homeworkId=${homeworkId}&sessionId=${id(88)}`, 'student', 'GET')).data.length, 0)
  assert.equal((await f.request(null, `?homeworkId=${homeworkId}&limit=1&page=2`, 'student', 'GET')).data.length, 1)
}
{
  const f = fixture()
  for (const action of ['EXAM_STARTED', 'EXAM_RESUMED', 'CONNECTION_RESTORED', 'AUTOSAVE_RECOVERED']) {
    const result = await f.request(post(action, action))
    assert.equal(result.status, 200)
    assert.equal(result.data.counted, false, `${action} must not count as a violation`)
    assert.equal(result.data.currentViolations, 0)
    assert.equal((await f.request(post(action, action))).data.idempotent, true)
  }
  assert.equal(f.calls.length, 0)
  await f.request(post('LEAVE_TAB', 'violation-1'))
  await f.request(post('DEVTOOLS', 'violation-2'))
  assert.equal(f.calls.length, 1)
  const afterThreshold = await f.request(post('CONNECTION_RESTORED', 'signal-after-threshold'))
  assert.equal(afterThreshold.data.counted, false)
  assert.equal(f.calls.length, 1, 'informational event must never claim a threshold submission')
}
{
  const f = fixture()
  f.setOutcome({ data: null, error: { message: 'timeout' } })
  await f.request(post('LEAVE_TAB', 'a'))
  const uncertain = await f.request(post('DEVTOOLS', 'b'))
  assert.equal(uncertain.data.autoSubmitted, false)
  assert.equal(uncertain.data.autoSubmitPending, true)
  await f.request(post('DEVTOOLS', 'b'))
  assert.equal(f.calls.length, 1, 'uncertain outcome must not be retried')
  assert.equal(f.state(), 'PENDING')
}
{
  const f = fixture()
  f.setOutcome({ data: { error: 'definitive validation failure' } })
  await f.request(post('LEAVE_TAB', 'a'))
  await f.request(post('DEVTOOLS', 'b'))
  assert.equal(f.state(), 'READY')
  const info = await f.request(post('AUTOSAVE_RECOVERED', 'info-at-threshold'))
  assert.equal(info.data.counted, false)
  assert.equal(f.calls.length, 1, 'informational event must not retrigger an unconfirmed threshold')
  f.setOutcome({ data: { submissionId: id(77) } })
  assert.equal((await f.request(post('DEVTOOLS', 'b'))).data.autoSubmitted, true)
  assert.equal(f.calls.length, 2)
}
{
  // Regression: student_classes không có cột id (khóa kép student_id + class_id).
  // Mock trả lỗi missing-column như PostgREST nên nếu code quay lại .select('id'),
  // các case dưới đây sẽ fail tại status 200/403/500 kỳ vọng.
  assert.equal(missingColumn('student_classes', 'id'), 'id', 'mock must reject nonexistent id column')
  assert.equal(missingColumn('student_classes', 'student_id, class_id, status'), null)
  const f = fixture()
  const enrolled = await f.request(post('LEAVE_TAB', 'enrolled-ok'))
  assert.equal(enrolled.status, 200, 'enrolled ACTIVE student must pass verification')
  assert.equal(enrolled.data.log.action, 'LEAVE_TAB')
  f.setEnrollment(null)
  const absent = await f.request(post('LEAVE_TAB', 'absent-1'))
  assert.equal(absent.status, 403)
  assert.match(absent.error, /not enrolled/)
  assert.equal(f.logs.length, 1, 'absent student must not record any event')
  f.setEnrollment({ student_id: studentId, class_id: id(4), status: 'PAUSED' })
  const paused = await f.request(post('LEAVE_TAB', 'paused-1'))
  assert.equal(paused.status, 403)
  assert.match(paused.error, /not enrolled/)
  f.setEnrollment({ student_id: studentId, class_id: id(4242), status: 'ACTIVE' })
  const otherClass = await f.request(post('LEAVE_TAB', 'other-class-1'))
  assert.equal(otherClass.status, 403)
  assert.match(otherClass.error, /not enrolled/)
}
{
  // Lỗi DB khi kiểm tra enrollment -> 500 Failed to verify enrollment (không nuốt lỗi).
  const f = fixture()
  f.setError('student_classes')
  const dbError = await f.request(post('LEAVE_TAB', 'db-err-1'))
  assert.equal(dbError.status, 500)
  assert.match(dbError.error, /Failed to verify enrollment/)
  assert.equal(f.logs.length, 0)
}
{
  // Homework targets: học sinh không được gán -> 403; được gán -> 200; không có target nào -> 200.
  const f = fixture()
  f.setTargets([{ homework_id: homeworkId, student_id: id(31) }])
  const notAssigned = await f.request(post('LEAVE_TAB', 'target-forbidden-1'))
  assert.equal(notAssigned.status, 403)
  assert.match(notAssigned.error, /not assigned/)
  assert.equal(f.logs.length, 0)
  f.setTargets([{ homework_id: homeworkId, student_id: studentId }])
  const assigned = await f.request(post('LEAVE_TAB', 'target-allowed-1'))
  assert.equal(assigned.status, 200)
  assert.equal(assigned.data.log.action, 'LEAVE_TAB')
}
const sql = readFileSync(new URL('../migrations/20261030020000_standardize_exam_logs.sql', import.meta.url), 'utf8')
assert.match(sql, /FOR UPDATE/)
assert.match(sql, /auto_submit_state = 'PENDING'/)
assert.doesNotMatch(sql, /UPDATE public\.exam_logs\s+SET counted = true/i)
console.log('Exam log backend oracle passed')
