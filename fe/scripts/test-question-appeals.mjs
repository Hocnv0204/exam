import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

globalThis.localStorage = { getItem: () => null, setItem() {}, removeItem() {} }
globalThis.sessionStorage = { getItem: () => null }
globalThis.window = { location: { hash: '#assignment-review' } }
globalThis.document = { getElementById: () => null, createElement: () => ({ dataset: {}, style: {} }) }
const { questionAppealReviewContext: context, renderQuestionAppealSlot, renderAppealThread, renderAdminAppealCard,
  bindReviewQuestionAppeals, renderQuestionAppealsView, bindQuestionAppealsEvents } = await import('../src/js/views/question-appeals.js')
const { state } = await import('../src/js/state.js')
const id = n => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`
const submissionId = id(10), answerId = id(20)
const user = { id: id(1), role: 'STUDENT' }
const result = { submissionId, submittedAt: '2026-10-30T00:00:00Z' }
assert.deepEqual(context(result, user, 'token'), { submissionId })
assert.equal(context(result, user, null), null)
assert.equal(context(result, { ...user, role: 'ADMIN' }, 'token'), null)
assert.equal(context(result, user, 'token', '#assignment-review?trial=true'), null)
for (const altered of [{ ...result, isTrial: true }, { ...result, status: 'IN_PROGRESS' }, { ...result, studentId: id(2) }, { submissionId }]) assert.equal(context(altered, user, 'token'), null)
assert.equal(context({ submission: { id: submissionId, submittedAt: result.submittedAt, is_trial: true } }, user, 'token'), null)
assert.equal(renderQuestionAppealSlot('"><img src=x>'), '')
assert.match(renderQuestionAppealSlot(answerId), /Hỏi về câu này/)
assert.match(renderQuestionAppealSlot(null, 2, 'TRUE_FALSE'), /data-appeal-question-number="2"/)
const item = { id: id(100), submissionAnswerId: answerId, submissionId, message: '<img src=x onerror=alert(1)>', response: '<script>bad</script>', status: 'ANSWERED', version: 2,
  studentName: '<iframe srcdoc=x>', className: '<svg onload=x>', homeworkTitle: 'Bài <b>1</b>', correctAnswer: 'HIDDEN_SOLUTION' }
for (const html of [renderAppealThread(item), renderAdminAppealCard(item)]) {
  assert.doesNotMatch(html, /<(?:img|script|iframe|svg)\b|HIDDEN_SOLUTION/)
  assert.match(html, /&lt;img/)
  assert.match(html, /&lt;script/)
}
assert.match(renderAdminAppealCard({ ...item, status: 'OPEN' }), /data-appeal-reply/)
assert.match(renderAdminAppealCard({ ...item, questionNumber: 2 }), /#assignment-review\?submissionId=00000000-0000-4000-8000-000000000010&amp;questionNumber=2&amp;from=question-appeals/)
assert.doesNotMatch(renderAdminAppealCard({ ...item, questionNumber: '<script>' }), /Mở bài nộp tại câu/)
assert.doesNotMatch(renderAdminAppealCard({ ...item, status: 'CLOSED' }), /data-appeal-reply|data-appeal-close/)
assert.doesNotMatch(renderQuestionAppealsView(), /appeal-inbox-list/)

const tick = () => new Promise(resolve => setImmediate(resolve))
const deferred = () => { let resolve, reject; const promise = new Promise((a, b) => { resolve = a; reject = b }); return { promise, resolve, reject } }
function reviewFixture(answer = answerId) {
  const events = new Map()
  const slot = { dataset: { questionAppealAnswer: answer, appealQuestionNumber: '2', appealQuestionType: 'TRUE_FALSE' }, innerHTML: '', querySelector: () => ({ focus() {} }) }
  const root = { isConnected: true, querySelectorAll: () => [slot], contains: () => true, addEventListener: (key, fn) => events.set(key, fn) }
  const session = { token: 'token', user }
  const error = { textContent: '' }
  const buttons = [{ disabled: false }, { disabled: false }]
  const form = { isConnected: true, elements: { message: { value: 'Vì sao câu này chưa đúng?' } },
    closest: selector => selector === '[data-question-appeal-create]' ? form : slot,
    querySelector: () => error, querySelectorAll: () => buttons, appendChild(node) { this.retry = node } }
  const submit = () => events.get('submit')({ target: form, preventDefault() {} })
  const click = action => {
    const button = { dataset: { appealAction: action }, closest: () => slot }
    events.get('click')({ target: { closest: () => button } })
  }
  return { root, slot, session, error, form, buttons, submit, click }
}
// Loading + double click + safe rendering after write.
let listCalls = 0, createCalls = 0
const first = deferred(), write = deferred()
const f = reviewFixture()
bindReviewQuestionAppeals(f.root, submissionId, {
  listQuestionAppeals: async () => { listCalls++; return first.promise },
  createQuestionAppeal: async data => { createCalls++; assert.equal(data.submissionAnswerId, answerId); return write.promise },
}, f.session)
assert.match(f.slot.innerHTML, /Đang tải/)
await f.submit()
assert.equal(createCalls, 0, 'cannot create before duplicate lookup finishes')
first.resolve({ items: [], total: 0 }); await tick()
f.click('ask'); assert.match(f.slot.innerHTML, /maxlength="1000"/)
const pendingSubmit = f.submit(); await f.submit()
assert.equal(createCalls, 1)
assert.ok(f.buttons.every(button => button.disabled))
write.resolve(item); await pendingSubmit
assert.match(f.slot.innerHTML, /&lt;script/)
await f.submit(); assert.equal(createCalls, 1, 'existing question cannot be submitted twice')

// List failure only offers read retry, never offers a duplicate create before reconciliation.
const failed = reviewFixture()
let attempts = 0
bindReviewQuestionAppeals(failed.root, submissionId, { listQuestionAppeals: async () => {
  if (++attempts === 1) throw new Error('offline')
  return { items: [item], total: 1 }
} }, failed.session)
await tick()
assert.match(failed.slot.innerHTML, /Thử tải lại/)
assert.doesNotMatch(failed.slot.innerHTML, /data-appeal-action="ask"/)
failed.click('reload'); await tick(); assert.match(failed.slot.innerHTML, /Phản hồi của giáo viên/)

// An ambiguous write error keeps text safe and permits read-only reconciliation.
const ambiguous = reviewFixture()
bindReviewQuestionAppeals(ambiguous.root, submissionId, {
  listQuestionAppeals: async () => ({ items: [], total: 0 }),
  createQuestionAppeal: async () => { throw new Error('<img>offline') },
}, ambiguous.session)
await tick(); await ambiguous.submit()
assert.equal(ambiguous.error.textContent, '<img>offline')
assert.equal(ambiguous.form.retry.textContent, 'Tải lại để kiểm tra')
assert.ok(ambiguous.buttons.every(button => !button.disabled))

// Detached view, route and account changes all reject an old async response.
for (const invalidate of [f => { f.root.isConnected = false }, f => { f.session.token = 'new-token' }, f => { f.session.user = { ...user, id: id(9) } }, () => { window.location.hash = '#history' }]) {
  window.location.hash = '#assignment-review'
  const stale = reviewFixture(), task = deferred()
  bindReviewQuestionAppeals(stale.root, submissionId, { listQuestionAppeals: () => task.promise }, stale.session)
  const before = stale.slot.innerHTML
  invalidate(stale); task.resolve({ items: [item], total: 1 }); await tick()
  assert.equal(stale.slot.innerHTML, before)
}
window.location.hash = '#assignment-review'
const staleWrite = reviewFixture(), delayedWrite = deferred()
bindReviewQuestionAppeals(staleWrite.root, submissionId, { listQuestionAppeals: async () => ({ items: [], total: 0 }), createQuestionAppeal: () => delayedWrite.promise }, staleWrite.session)
await tick(); const submitted = staleWrite.submit(); staleWrite.root.isConnected = false
const beforeWrite = staleWrite.slot.innerHTML
delayedWrite.resolve(item); await submitted; assert.equal(staleWrite.slot.innerHTML, beforeWrite)

// Legacy immediate result needs answer-ID hydration; returned keys must never be injected.
const hydrated = reviewFixture('')
let historyCalls = 0
bindReviewQuestionAppeals(hydrated.root, submissionId, {
  getStudentHistory: async params => { historyCalls++; assert.equal(params.submissionId, submissionId); return { submissionId, answers: [{ id: answerId, questionNumber: 2, questionType: 'TRUE_FALSE', correctAnswer: 'HIDDEN_SOLUTION' }] } },
  listQuestionAppeals: async () => ({ items: [], total: 0 }),
}, hydrated.session)
await tick()
assert.equal(historyCalls, 1)
assert.equal(hydrated.slot.dataset.questionAppealAnswer, answerId)
assert.doesNotMatch(hydrated.slot.innerHTML, /HIDDEN_SOLUTION/)

// Pagination covers all answer appeals (including an existing request on later pages).
const paged = reviewFixture()
const pages = []
bindReviewQuestionAppeals(paged.root, submissionId, { listQuestionAppeals: async ({ page }) => {
  pages.push(page)
  return page === 1 ? { total: 2, items: [{ ...item, submissionAnswerId: id(21) }] } : { total: 2, items: [item] }
} }, paged.session)
await tick(); assert.deepEqual(pages, [1, 2]); assert.match(paged.slot.innerHTML, /Phản hồi của giáo viên/)

// Admin filter race: newer filter wins; reply and close pass version, duplicate submits blocked.
window.location.hash = '#question-appeals'
state.token = 'admin-token'; state.user = { id: id(3), role: 'ADMIN' }
assert.match(renderQuestionAppealsView(), /Trạng thái/)
const rootEvents = new Map(), filterEvents = new Map()
const nodes = {
  '#appeal-filters': { elements: { status: { value: 'OPEN' }, studentId: { value: '' }, classId: { value: '' } }, addEventListener: (key, fn) => filterEvents.set(key, fn) },
  '#appeal-inbox-list': { innerHTML: '' }, '#appeal-inbox-error': { textContent: '' }, '#appeal-inbox-page': { textContent: '' },
}
const root = { isConnected: true, querySelector: selector => nodes[selector], querySelectorAll: () => [], addEventListener: (key, fn) => rootEvents.set(key, fn) }
document.getElementById = key => key === 'question-appeals-view' ? root : null
const oldList = deferred(), freshList = deferred(), replyTask = deferred()
let adminListCalls = 0, replies = 0, closes = 0
bindQuestionAppealsEvents({
  listQuestionAppeals: params => { adminListCalls++; return adminListCalls === 1 ? oldList.promise : adminListCalls === 2 ? freshList.promise : Promise.resolve({ items: [item], total: 1 }) },
  replyQuestionAppeal: async data => { replies++; assert.equal(data.version, 2); return replyTask.promise },
  closeQuestionAppeal: async data => { closes++; assert.equal(data.version, 2) },
})
nodes['#appeal-filters'].elements.status.value = 'ANSWERED'
filterEvents.get('submit')({ preventDefault() {} })
freshList.resolve({ items: [item], total: 1 }); await tick()
const freshHtml = nodes['#appeal-inbox-list'].innerHTML
oldList.resolve({ items: [], total: 0 }); await tick()
assert.equal(nodes['#appeal-inbox-list'].innerHTML, freshHtml)
const rowError = { textContent: '' }, rowButtons = [{ disabled: false }]
const card = { isConnected: true, dataset: { inboxAppeal: item.id }, querySelector: () => rowError, querySelectorAll: () => rowButtons }
const replyForm = { elements: { response: { value: 'Đã xem.' } }, closest: selector => selector === '[data-appeal-reply]' ? replyForm : card }
const replyEvent = { target: replyForm, preventDefault() {} }
rootEvents.get('submit')(replyEvent); rootEvents.get('submit')(replyEvent)
assert.equal(replies, 1)
replyTask.resolve(item); await tick()
const closeButton = { closest: () => card }
rootEvents.get('click')({ target: { closest: selector => selector === '[data-appeal-close]' ? closeButton : null } })
await tick(); assert.equal(closes, 1)

const source = readFileSync(new URL('../src/js/views/assignment-review.js', import.meta.url), 'utf8')
assert.match(source, /renderQuestionAppealSlot\(ans.id, ans.rawQuestionNumber, qType\)/)
assert.match(source, /bindReviewQuestionAppeals\(reviewContainer, appealContext.submissionId\)/)
const viewSource = readFileSync(new URL('../src/js/views/question-appeals.js', import.meta.url), 'utf8')
assert.doesNotMatch(viewSource, /\.from\(|showModal\(/, 'no direct PostgREST or nested modal')
console.log('Question appeals FE: eligibility/XSS/loading/retry/duplicate/legacy IDs/pagination/stale read+write/admin CAS PASS (DOM fixtures).')
