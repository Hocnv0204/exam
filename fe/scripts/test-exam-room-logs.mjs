import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import vm from 'node:vm'
import { setImmediate as nextTick } from 'node:timers/promises'

const source = readFileSync(new URL('../src/js/views/exam-room.js', import.meta.url), 'utf8')
  .replace(/^import .*$/gm, '')
  .replace(/export function /g, 'function ')
  .replace(/import\.meta\.env\.VITE_SUPABASE_URL/g, 'undefined')

const homeworkId = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'
const sessionId = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb'
const storage = () => {
  const values = new Map()
  return { getItem: key => values.get(key) || null, setItem: (key, value) => values.set(key, value), removeItem: key => values.delete(key) }
}

async function scenario(responses, steps, options = {}) {
  const calls = []
  const signals = []
  const modals = []
  const listeners = new Map()
  const nodes = new Map()
  const intervals = []
  const submissions = []
  const localStorage = storage()
  if (options.resume) {
    localStorage.setItem(`exam_active_${homeworkId}_fixture`, 'true')
    localStorage.setItem(`exam_session_token_${homeworkId}_fixture`, 'resume-token')
  }
  let now = Date.now()
  const deadlineAt = new Date(now + (options.remainingMs ?? 45000)).toISOString()
  const element = id => {
    if (!nodes.has(id)) nodes.set(id, {
      id, style: {}, dataset: {}, textContent: '', innerHTML: '', disabled: false,
      addEventListener(type, fn) { listeners.set(`${id}:${type}`, fn) },
      querySelector() { return null }, querySelectorAll() { return [] },
      closest() { return null }, classList: { add() {}, remove() {} }
    })
    return nodes.get(id)
  }
  const document = {
    hidden: false, activeElement: null,
    body: { querySelectorAll() { return [] } },
    getElementById: element, querySelector() { return null }, querySelectorAll() { return [] },
    addEventListener(type, fn) { listeners.set(type, fn) }, removeEventListener() {}
  }
  const window = {
    location: { hash: '#exam-room' },
    addEventListener(type, fn) { listeners.set(`window:${type}`, fn) }, removeEventListener() {}
  }
  const api = {
    initExamSession: async () => ({ success: true, sessionId, createdAt: new Date(now).toISOString(), deadlineAt,
      serverNow: new Date(now).toISOString(), draftAnswers: options.draftAnswers || [], currentViolations: 0 }),
    submitExamLog: async body => {
      if (['EXAM_STARTED', 'EXAM_RESUMED', 'CONNECTION_RESTORED', 'AUTOSAVE_RECOVERED'].includes(body.action)) {
        signals.push(body)
        if (options.signalResponse) return options.signalResponse(body)
        return { success: true, counted: false, currentViolations: 0 }
      }
      calls.push(body)
      const next = responses.shift()
      if (next instanceof Error) throw next
      return next
    },
    submitHomework: async body => {
      submissions.push(body)
      if (options.submitError) throw new Error(options.submitError)
      return { submissionId: 'confirmed-submission' }
    },
    heartbeatExamSession: async () => ({}), autosaveExamSession: async (...args) => {
      if (options.autosave) return options.autosave(...args)
      return {}
    }
  }
  let seq = 0
  const context = vm.createContext({
    state: { currentHomework: { homework: { id: homeworkId, durationMinutes: 45 }, questions: [] }, user: { id: 'fixture' } },
    api, document, window, localStorage, sessionStorage: storage(),
    crypto: { randomUUID: () => `event-${++seq}` },
    openModal: (title, body, onConfirm, options) => { modals.push({ title, body, onConfirm, options }) },
    closeModal() {}, showToast() {}, renderMath() {}, renderMarkdown: x => x,
    isDarkTheme: () => false, console: { warn() {}, error() {} },
    setTimeout: () => 1, clearTimeout() {}, setInterval: fn => { intervals.push(fn); return intervals.length }, clearInterval() {},
    Date, performance: { now: () => now }, structuredClone
  })
  vm.runInContext(`${source}\nbindExamRoomEvents()`, context)
  if (!options.resume) {
    assert.equal(modals.at(-1).title, 'QUY CHẾ PHÒNG THI CHÍNH THỨC')
    assert.equal(await modals.at(-1).onConfirm(), true)
  } else await nextTick()
  await steps({ calls, signals, modals, listeners, document, nodes, submissions, localStorage,
    advance(ms) { now += ms; intervals.slice().forEach(fn => fn()) }, intervals })
}

const acknowledged = (count, extra = {}) => ({ currentViolations: count, maxViolations: 3, counted: true, autoSubmitted: false, autoSubmitPending: false, ...extra })

await scenario([], async ({ signals, listeners, localStorage }) => {
  await nextTick()
  assert.equal(signals.length, 1)
  assert.equal(signals[0].action, 'EXAM_STARTED')
  listeners.get('window:online')() // initial online notification is not a restoration
  assert.equal(signals.length, 1)
  assert.equal(JSON.parse(localStorage.getItem(`exam_pending_signals_${homeworkId}_fixture`)).length, 1)
  listeners.get('window:offline')()
  listeners.get('window:online')()
  await nextTick()
  assert.deepEqual(signals.map(s => s.action), ['EXAM_STARTED', 'EXAM_STARTED', 'CONNECTION_RESTORED'])
  assert.equal(signals[0].eventId, signals[1].eventId, 'uncertain signal retains event ID')
  assert.equal(localStorage.getItem(`exam_pending_signals_${homeworkId}_fixture`), '[]')
}, { signalResponse: (() => { let first = true; return () => {
  if (first) { first = false; throw new Error('network uncertain') }
  return { success: true }
} })() })

await scenario([], async ({ signals }) => {
  await nextTick()
  assert.deepEqual(signals.map(s => s.action), ['EXAM_RESUMED'])
}, { resume: true })

let saveCount = 0
await scenario([], async ({ signals, advance }) => {
  advance(15000)
  await nextTick()
  assert.equal(signals.filter(s => s.action === 'AUTOSAVE_RECOVERED').length, 0)
  advance(15000)
  await nextTick()
  assert.equal(signals.filter(s => s.action === 'AUTOSAVE_RECOVERED').length, 1)
  advance(5000)
  await nextTick()
  assert.equal(signals.filter(s => s.action === 'AUTOSAVE_RECOVERED').length, 1)
}, { autosave: async () => { if (++saveCount === 1) throw new Error('temporary save error') } })

await scenario([acknowledged(1), acknowledged(1, { counted: false })], async ({ calls, listeners, document, nodes }) => {
  document.hidden = true
  listeners.get('visibilitychange')()
  listeners.get('window:blur')()
  await Promise.resolve()
  assert.equal(calls.length, 1, 'blur and visibility must count as one absence')
  assert.equal(calls[0].action, 'LEAVE_TAB')
  assert.equal(calls[0].sessionId, sessionId)
  assert.ok(calls[0].sessionToken)
  assert.ok(calls[0].eventId)
  document.hidden = false
  await listeners.get('window:focus')()
  assert.equal(calls[1].action, 'RETURN_TAB')
  assert.equal(nodes.get('exam-violations-count').textContent, '1')
})

await scenario([new Error('offline'), acknowledged(1)], async ({ calls, listeners, modals, nodes }) => {
  listeners.get('window:blur')()
  await nextTick()
  assert.equal(nodes.get('exam-violations-count').textContent, '0', 'failed log must not increment counter')
  assert.equal(modals.at(-1).title, 'CHƯA XÁC NHẬN NHẬT KÝ')
  await modals.at(-1).onConfirm()
  assert.equal(calls.length, 2)
  assert.equal(calls[0].eventId, calls[1].eventId, 'retry must reuse the original event ID')
})

await scenario([acknowledged(3, { autoSubmitPending: true }), acknowledged(3, { autoSubmitted: true, submissionId: sessionId })], async ({ calls, listeners, modals, nodes }) => {
  listeners.get('window:blur')()
  await nextTick()
  assert.equal(modals.at(-1).title, 'ĐANG XÁC MINH BÀI THI')
  assert.equal(nodes.get('exam-violations-count').textContent, '3')
  await modals.at(-1).onConfirm()
  assert.equal(calls[0].eventId, calls[1].eventId)
  assert.equal(modals.at(-1).title, 'ĐÌNH CHỈ BÀI THI DO VI PHẠM')
})

const serverEssay = [{ questionId: 'essay-1', givenAnswer: { type: 'ESSAY', value: 'Bản máy chủ' } }]
await scenario([], async ({ advance, nodes, submissions, modals }) => {
  advance(2000)
  assert.equal(nodes.get('exam-timer-display').textContent, '00:03', 'countdown derives from deadline instant')
  advance(4000)
  await nextTick()
  assert.equal(submissions.length, 1)
  assert.equal(JSON.stringify(submissions[0].answers), JSON.stringify(serverEssay), 'expiry sends confirmed server ESSAY')
  advance(2000)
  await nextTick()
  assert.equal(submissions.length, 1, 'expiry cannot double-submit')
}, { remainingMs: 5000, draftAnswers: serverEssay })

await scenario([], async ({ advance, nodes, submissions, modals }) => {
  advance(6000)
  await nextTick()
  assert.equal(submissions.length, 1)
  assert.equal(modals.at(-1).title, 'BÀI THI ĐÃ HẾT HẠN')
  assert.equal(nodes.get('exam-timer-display').textContent, '00:00')
  advance(6000)
  assert.equal(submissions.length, 1, 'EXAM_EXPIRED must not offer a retry')
}, { remainingMs: 5000, submitError: 'EXAM_EXPIRED' })

await scenario([], async ({ advance, submissions, modals }) => {
  advance(6000)
  await nextTick()
  assert.equal(modals.at(-1).title, 'CHƯA XÁC NHẬN KẾT QUẢ NỘP BÀI')
  assert.match(modals.at(-1).body, /không gửi lại bài/)
  advance(6000)
  assert.equal(submissions.length, 1)
}, { remainingMs: 5000, submitError: 'network unavailable' })

let finishAutosave
await scenario([], async ({ advance, submissions }) => {
  advance(15000) // autosave started but not acknowledged
  await nextTick()
  advance(2000)
  await nextTick()
  assert.equal(JSON.stringify(submissions[0].answers), JSON.stringify(serverEssay), 'unacknowledged autosave cannot replace server snapshot')
  finishAutosave({})
  await nextTick()
  assert.equal(submissions.length, 1)
}, { remainingMs: 16000, draftAnswers: serverEssay, autosave: () => new Promise(resolve => { finishAutosave = resolve }) })

console.log('Exam room log and timing mock fixtures: OK')
