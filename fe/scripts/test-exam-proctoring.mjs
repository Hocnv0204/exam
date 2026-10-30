import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import vm from 'node:vm'
import { setImmediate as tick } from 'node:timers/promises'

const source = readFileSync(new URL('../src/js/views/exam-proctoring.js', import.meta.url), 'utf8')
  .replace(/^import .*$/gm, '').replace(/export function /g, 'function ')
const homeworkId = 'homework-1'
const sessions = Array.from({ length: 105 }, (_, i) => ({
  id: `session-${i + 1}`, student_id: `student-${i + 1}`,
  profiles: { full_name: i === 50 ? '<script>unsafe</script>' : `Học sinh ${i + 1}`, username: `account-${i + 1}` },
  status: i % 2 ? 'SUBMITTED' : 'ACTIVE', last_heartbeat_at: new Date().toISOString(), created_at: new Date().toISOString()
}))
const calls = { sessions: [], logs: [] }
let pendingSession = null
let failSession = false
const modalCalls = []
let modalHtml = ''
let detailButtons = []
const mount = { innerHTML: '' }
const nodes = new Map()
const makeNode = (id, dataset = {}) => ({
  id, dataset, value: '', disabled: false, selectionStart: 0,
  addEventListener(type, handler) { this[type] = handler },
  focus() {}, setSelectionRange() {}
})
const findNode = id => {
  if (id === 'proctoring-mount') return mount
  if (!mount.innerHTML.includes(`id="${id}"`) && !modalHtml.includes(`id="${id}"`)) return null
  if (!nodes.has(id)) nodes.set(id, makeNode(id))
  return nodes.get(id)
}
const document = {
  getElementById: findNode,
  querySelectorAll(selector) {
    if (selector !== '.view-session-logs-btn') return []
    detailButtons = [...mount.innerHTML.matchAll(/class="btn-secondary view-session-logs-btn" data-session-id="([^"]+)"/g)]
      .map(([, id]) => makeNode('view-session', { sessionId: id }))
    return detailButtons
  }
}
const window = {
  location: { hash: `#exam-proctoring?homeworkId=${homeworkId}` },
  addEventListener() {}, removeEventListener() {}
}
const api = {
  getHomeworkDetail: async () => ({ homework: { title: 'Bài <kiểm tra>', durationMinutes: 45 } }),
  getExamSessions: async (query) => {
    const url = new URL(`https://mock.invalid/exam-session?homeworkId=${query}`)
    const page = Number(url.searchParams.get('page'))
    assert.equal(url.searchParams.get('homeworkId'), homeworkId)
    assert.equal(url.searchParams.get('limit'), '50')
    calls.sessions.push(page)
    if (pendingSession?.page === page) return pendingSession.promise
    if (failSession) { failSession = false; throw new Error('offline') }
    return sessions.slice((page - 1) * 50, page * 50)
  },
  getExamLogs: async (id, query) => {
    assert.equal(id, homeworkId)
    calls.logs.push(query)
    if (query.includes('sessionId=session-101')) return [{ session_id: 'session-101', attempt_no: 2,
      student_id: 'student-101', profiles: { full_name: 'Học sinh 101' }, counted: false,
      action: 'CONNECTION_RESTORED', server_timestamp: new Date().toISOString() }]
    return []
  }
}
const context = vm.createContext({
  document, window, api, URLSearchParams, encodeURIComponent, Date, setInterval: () => 1, clearInterval() {},
  renderSidebar: () => '', renderNavbar: () => '', bindSidebarEvents() {},
  openModal(title, body, _confirm, opts) { modalCalls.push({ title, body, opts }); modalHtml = body }
})
vm.runInContext(`${source}\nrenderExamProctoringView(); bindExamProctoringEvents()`, context)
const click = async id => { const node = findNode(id); assert.ok(node, `missing ${id}`); assert.ok(node.click, `unbound ${id}`); node.click(); await tick() }
await tick()
assert.deepEqual(calls.sessions, [1])
assert.match(mount.innerHTML, /Phiên thi · trang 1 \(50\)/)
assert.match(mount.innerHTML, /Có tín hiệu · phiên trang 1/)
assert.match(mount.innerHTML, /không phải tổng toàn bài thi/)
assert.ok(!mount.innerHTML.includes('session-51'))
assert.ok(!mount.innerHTML.includes('<kiểm tra>'), 'homework title escaped')

await click('sessions-next')
assert.deepEqual(calls.sessions, [1, 2])
assert.match(mount.innerHTML, /Phiên thi · trang 2 \(50\)/)
assert.match(mount.innerHTML, /Trang phiên 2/)
assert.ok(mount.innerHTML.includes('session-51'))
assert.ok(!mount.innerHTML.includes('session-1"'))
assert.ok(mount.innerHTML.includes('&lt;script&gt;unsafe&lt;/script&gt;'))
assert.ok(!mount.innerHTML.includes('<script>'))
assert.match(mount.innerHTML, /Đã nộp · phiên trang 2/)

const search = findNode('proctor-search')
search.value = 'Học sinh 101'
search.input({ target: search })
assert.match(mount.innerHTML, /không tìm toàn bộ/)
assert.match(mount.innerHTML, /Không có phiên phù hợp trong trang này/)
assert.ok(!mount.innerHTML.includes('session-101'))
await click('sessions-next')
assert.deepEqual(calls.sessions, [1, 2, 3])
assert.match(mount.innerHTML, /Phiên thi · trang 3 \(5\)/)
assert.ok(mount.innerHTML.includes('session-101'))
assert.match(mount.innerHTML, /<strong[^>]*>3<\/strong><span[^>]*>Có tín hiệu · phiên trang 3/)
assert.match(mount.innerHTML, /<strong[^>]*>2<\/strong><span[^>]*>Đã nộp · phiên trang 3/)
assert.match(mount.innerHTML, /id="sessions-next"[^>]*disabled/)

// Both tabs keep independent page cursors and scoped counters/search labels.
await click('tab-btn-logs')
assert.match(mount.innerHTML, /nhật ký trang 1 \(không tìm toàn bộ\)/)
assert.match(mount.innerHTML, /Sự kiện · nhật ký trang 1/)
await click('tab-btn-sessions')
assert.match(mount.innerHTML, /Trang phiên 3/)

// A slower refresh must not replace a newer response, even when both target the same page.
let resolveOld
pendingSession = { page: 3, promise: new Promise(resolve => { resolveOld = resolve }) }
await click('proctor-refresh-now')
pendingSession = null
await click('proctor-refresh-now')
resolveOld(sessions.slice(0, 50))
await tick()
assert.match(mount.innerHTML, /Phiên thi · trang 3 \(5\)/)
assert.ok(mount.innerHTML.includes('session-101'))

failSession = true
await click('proctor-refresh-now')
assert.match(mount.innerHTML, /Không tải được phiên trang 3/)
assert.match(mount.innerHTML, /Phiên thi · trang 3 \(5\)/, 'failed refresh retains previous page with warning')
await click('proctor-refresh-now')
assert.ok(!mount.innerHTML.includes('Không tải được phiên trang 3'))

const detailButton = detailButtons[0]
assert.ok(detailButton)
detailButton.click()
await tick()
assert.match(modalCalls.at(-1).body, /session-101/)
assert.ok(calls.logs.some(query => query.includes('sessionId=session-101')))
assert.match(modalCalls.at(-1).body, /Trình duyệt báo kết nối trở lại/)
assert.match(modalCalls.at(-1).body, /Thông tin · không tính vi phạm/)
assert.match(modalCalls.at(-1).body, /Lần thi: 2/)
assert.match(modalCalls.at(-1).body, /Trang 1/)
assert.ok(!modalCalls.at(-1).body.includes('Được tính vi phạm'))
console.log('Exam proctoring paginated UI mock oracle: OK')
