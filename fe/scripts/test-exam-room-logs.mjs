import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import vm from 'node:vm'
import { setImmediate as nextTick } from 'node:timers/promises'
import { createFocusShield, applyShieldState } from '../src/js/utils/exam-focus-shield.js'
import { renderExamFocusShield } from '../src/js/components/exam-focus-shield.js'

const source = readFileSync(new URL('../src/js/views/exam-room.js', import.meta.url), 'utf8')
  .replace(/^import .*$/gm, '')
  .replace(/export function /g, 'function ')
  .replace(/import\.meta\.env(?:\??\.[A-Za-z0-9_]+)?/g, 'undefined')

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
    if (!nodes.has(id)) {
      const attributes = new Map()
      const classes = new Set()
      nodes.set(id, {
        id, style: {}, dataset: {}, textContent: '', innerHTML: '', disabled: false,
        hidden: id === 'exam-focus-shield',
        attributes,
        setAttribute(name, value) { attributes.set(name, String(value)) },
        removeAttribute(name) { attributes.delete(name) },
        hasAttribute(name) { return attributes.has(name) },
        getAttribute(name) { return attributes.get(name) ?? null },
        classList: {
          add(cls) { classes.add(cls) },
          remove(cls) { classes.delete(cls) },
          contains(cls) { return classes.has(cls) },
        },
        addEventListener(type, fn) { listeners.set(`${id}:${type}`, fn) },
        removeEventListener(type, fn) { listeners.delete(`${id}:${type}`) },
        querySelector() { return null }, querySelectorAll() { return [] },
        closest() { return null }
      })
    }
    return nodes.get(id)
  }
  const queryMap = new Map()
  const queryNode = selector => {
    if (!queryMap.has(selector)) {
      queryMap.set(selector, element(selector))
    }
    return queryMap.get(selector)
  }
  let docVisibilityState = 'visible'
  let docHasFocus = true
  const document = {
    get visibilityState() { return docVisibilityState },
    set visibilityState(val) { docVisibilityState = val },
    get hidden() { return docVisibilityState === 'hidden' },
    set hidden(val) { docVisibilityState = val ? 'hidden' : 'visible' },
    hasFocus() { return docHasFocus },
    setHasFocus(val) { docHasFocus = val },
    activeElement: null,
    body: { querySelectorAll() { return [] } },
    getElementById: element,
    querySelector(sel) { return queryNode(sel) },
    querySelectorAll(sel) {
      if (sel === '[data-exam-shield-timer]') return [element('exam-shield-timer-mock')]
      if (sel === '.exam-option-card') {
        const card = element('mock-opt-card')
        card.dataset.qnum = '1'
        card.dataset.optid = 'A'
        return [card]
      }
      return []
    },
    addEventListener(type, fn) { listeners.set(type, fn) },
    removeEventListener(type, fn) { listeners.delete(type) }
  }
  const window = {
    location: { hash: '#exam-room' },
    addEventListener(type, fn) { listeners.set(`window:${type}`, fn) },
    removeEventListener(type, fn) { listeners.delete(`window:${type}`) }
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
    createFocusShield, applyShieldState, renderExamFocusShield,
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
await scenario([], async ({ signals, advance, listeners }) => {
  listeners.get('mock-opt-card:click')?.()
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

// (a), (b), (c), (d): Kiểm tra màn che khi hidden/blur, mở khi visible/focus, lặp 10 lần không khoá, không nộp, không gửi log vi phạm
await scenario([], async ({ calls, signals, listeners, document, nodes, submissions, modals }) => {
  await nextTick()
  // (d) Vẫn gửi EXAM_STARTED khi bắt đầu bài thi
  assert.equal(signals.length, 1)
  assert.equal(signals[0].action, 'EXAM_STARTED')

  const shieldEl = document.getElementById('exam-focus-shield')
  const bodyEl = document.querySelector('.exam-room-body')
  const rootEl = document.querySelector('.exam-room-layout')

  // Ban đầu: chưa che
  assert.equal(shieldEl.hidden, true)
  assert.equal(bodyEl.hasAttribute('inert'), false)
  assert.equal(rootEl.classList.contains('exam-shielded'), false)

  // (b) Màn che bật khi hidden/blur
  document.hidden = true
  listeners.get('visibilitychange')()
  listeners.get('window:blur')()
  await Promise.resolve()

  // (a) Không gọi submitExamLog với action vi phạm nào
  assert.equal(calls.length, 0, 'hidden/blur không được gửi action vi phạm lên submitExamLog')
  // (b) Màn che bật: shieldEl.hidden = false, bodyEl có inert + aria-hidden, rootEl có class exam-shielded
  assert.equal(shieldEl.hidden, false, 'shield phải hiển thị (hidden = false)')
  assert.equal(bodyEl.hasAttribute('inert'), true, 'vùng đề phải có inert')
  assert.equal(bodyEl.getAttribute('aria-hidden'), 'true')
  assert.equal(rootEl.classList.contains('exam-shielded'), true)

  // Quay lại tab: visible và có focus -> mở che
  document.hidden = false
  listeners.get('visibilitychange')()
  listeners.get('window:focus')()
  await Promise.resolve()

  assert.equal(shieldEl.hidden, true, 'shield phải ẩn (hidden = true)')
  assert.equal(bodyEl.hasAttribute('inert'), false, 'vùng đề không còn inert')
  assert.equal(bodyEl.hasAttribute('aria-hidden'), false)
  assert.equal(rootEl.classList.contains('exam-shielded'), false)
  assert.equal(calls.length, 0, 'quay lại không gửi RETURN_TAB')

  // (c) Lặp 10 lần không khoá, không nộp bài, không popup cảnh báo
  for (let i = 0; i < 10; i++) {
    document.hidden = true
    listeners.get('visibilitychange')()
    listeners.get('window:blur')()
    await Promise.resolve()

    assert.equal(shieldEl.hidden, false)
    assert.equal(bodyEl.hasAttribute('inert'), true)

    document.hidden = false
    listeners.get('visibilitychange')()
    listeners.get('window:focus')()
    await Promise.resolve()

    assert.equal(shieldEl.hidden, true)
    assert.equal(bodyEl.hasAttribute('inert'), false)
  }

  assert.equal(calls.length, 0, 'sau 10 lần rời và quay lại, không có call log vi phạm')
  assert.equal(submissions.length, 0, 'sau 10 lần không bị tự nộp bài')
  assert.equal(modals.length, 1, 'không có popup cảnh báo vi phạm hay đình chỉ')
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
  assert.equal(modals.at(-1).title, 'PHIÊN THI ĐÃ HẾT GIỜ')
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
await scenario([], async ({ advance, submissions, listeners }) => {
  listeners.get('mock-opt-card:click')?.()
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
