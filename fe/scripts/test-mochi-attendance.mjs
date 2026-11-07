import test from 'node:test'
import assert from 'node:assert/strict'
import { register } from 'node:module'
import { readFileSync } from 'node:fs'

register('data:text/javascript,' + encodeURIComponent(`
  export async function load(url, context, nextLoad) {
    if (url.endsWith('.css')) return { format: 'module', shortCircuit: true, source: '' };
    return nextLoad(url, context);
  }
`))

const storage = new Map()
globalThis.localStorage = {
  getItem: key => storage.get(key) ?? null,
  setItem: (key, value) => storage.set(key, String(value)),
  removeItem: key => storage.delete(key)
}
globalThis.document = {
  head: null,
  documentElement: { dataset: {}, style: {} },
  addEventListener() {}, dispatchEvent() {}, querySelectorAll: () => [], getElementById: () => null
}
globalThis.window = {
  location: { hash: '#attendance', search: '' }, addEventListener() {}, matchMedia: () => ({ matches: false })
}

const attendanceModule = await import('../src/js/views/attendance.js')
const { renderAttendanceData, renderAttendanceView, validateAttendanceRange } = attendanceModule

const fixture = {
  classId: 'class-1',
  className: 'Toán <12>',
  summary: {
    classSessions: 3, countedSessions: 2, present: 1, absent: 1, notCounted: 1,
    attendanceRate: 50, classAverageRate: 82
  },
  sessions: [
    { sessionId: 's1', date: '2026-11-05', note: '<img src=x onerror=alert(1)>', status: 'PRESENT', classPresent: 18, classTotal: 22, classRate: 81.8 },
    { sessionId: 's2', date: '2026-11-03', note: null, status: 'ABSENT', classPresent: 19, classTotal: 22, classRate: 86.4 },
    { sessionId: 's3', date: '2026-10-30', note: 'Chưa vào lớp', status: 'NOT_COUNTED', classPresent: 20, classTotal: 22, classRate: 90.9 }
  ]
}

test('render dữ liệu mẫu có đúng tóm tắt, ba trạng thái, nhóm tháng và escape chuỗi API', () => {
  const html = renderAttendanceData(fixture)
  assert.match(html, /Buổi lớp đã học[\s\S]*?<strong>3<\/strong>/)
  assert.match(html, /Có mặt[\s\S]*?<strong>1<\/strong>/)
  assert.match(html, /Vắng[\s\S]*?<strong>1<\/strong>/)
  assert.match(html, /Không tính[\s\S]*?<strong>1<\/strong>/)
  assert.match(html, /fa-check/)
  assert.match(html, /fa-xmark/)
  assert.match(html, /fa-minus/)
  assert.match(html, /Tháng 11\/2026/)
  assert.match(html, /Tháng 10\/2026/)
  assert.match(html, /Toán &lt;12&gt;/)
  assert.match(html, /&lt;img src=x onerror=alert\(1\)&gt;/)
  assert.doesNotMatch(html, /<img src=x/)
})

test('rate null hiển thị dấu gạch và không đưa ra so sánh cao/thấp', () => {
  const html = renderAttendanceData({ ...fixture, summary: { ...fixture.summary, attendanceRate: null, classAverageRate: null } })
  assert.ok((html.match(/—/g) || []).length >= 2)
  assert.match(html, /Chưa đủ dữ liệu để so sánh/)
  assert.doesNotMatch(html, /cao hơn|thấp hơn/)
})

test('dữ liệu rỗng không lỗi và có hướng dẫn mở rộng ngày', () => {
  const html = renderAttendanceData({ className: 'Toán', summary: {}, sessions: [] })
  assert.match(html, /Chưa có buổi học trong khoảng này/)
  assert.match(html, /m-mascot/)
  assert.doesNotMatch(html, /NaN/)
})

test('view có hero Mochi và validation chặn ngày đảo hoặc quá 366 ngày', () => {
  assert.match(renderAttendanceView(), /m-student-page m-attendance-page/)
  assert.match(renderAttendanceView(), /Theo dõi các buổi bạn đã học và đã nghỉ so với cả lớp/)
  assert.match(validateAttendanceRange('2026-11-08', '2026-11-07'), /Từ ngày/)
  assert.match(validateAttendanceRange('2025-01-01', '2026-01-02'), /366 ngày/)
  assert.equal(validateAttendanceRange('2026-01-01', '2027-01-01'), '')
})

function deferred() {
  let resolve, reject
  const promise = new Promise((yes, no) => { resolve = yes; reject = no })
  return { promise, resolve, reject }
}

const source = readFileSync(new URL('../src/js/views/attendance.js', import.meta.url), 'utf8')
  .replace(/^if \(typeof document !== 'undefined'[\s\S]*?^}\n/m, '')
  .replace(/^import .*$/gm, '')
  .replace(/^export /gm, '')

function createHarness(hash = '#attendance?classId=class-1&fromDate=2026-10-09&toDate=2026-11-07', options = {}) {
  const requests = []
  const controllers = []
  let sidebarBindCount = 0
  let classRequestCount = 0
  const elements = new Map()
  const rangeButtons = ['30', 'month', '90'].map(value => makeElement({ dataset: { attRange: value } }))

  function makeElement(initial = {}) {
    let html = ''
    const element = {
      value: '', textContent: '', disabled: false, isConnected: true, dataset: {}, events: {}, attrs: {},
      ...initial,
      addEventListener(name, callback) { this.events[name] = callback },
      setAttribute(name, value) { this.attrs[name] = value },
      querySelector(selector) { return get(selector) },
      querySelectorAll(selector) {
        if (selector === '[data-att-range]') return rangeButtons
        if (selector === '[data-att-status]') return []
        return []
      },
      click() { return this.events.click?.({ target: this }) }
    }
    Object.defineProperty(element, 'innerHTML', {
      get: () => html,
      set(value) {
        html = String(value)
        for (const id of ['attendance-from', 'attendance-to']) {
          const match = html.match(new RegExp(`id="${id}"[^>]*value="([^"]*)"`))
          if (match) get(`#${id}`).value = match[1]
        }
        const selected = html.match(/<option value="([^"]*)" selected>/)
        if (selected) get('#attendance-class').value = selected[1]
      }
    })
    return element
  }

  function get(selector) {
    if (!elements.has(selector)) elements.set(selector, makeElement())
    return elements.get(selector)
  }

  const root = makeElement()
  const app = get('#attendance-app')
  root.querySelector = selector => selector === '#attendance-app' ? app : get(selector)
  const mockDocument = {
    head: null,
    getElementById(id) { return id === 'attendance-root' ? root : null }
  }
  const mockWindow = {
    location: { hash },
    history: { replaceState(_state, _title, nextHash) { mockWindow.location.hash = nextHash } },
    addEventListener() {}
  }
  const mockState = {
    token: 'fixture', user: { role: 'STUDENT', classIds: ['class-1'] },
    classes: options.initialClasses === undefined ? [{ id: 'class-1', name: 'Toán <12>' }] : options.initialClasses
  }
  const mockApi = {
    async getClasses() {
      classRequestCount++
      if (options.classFailures && classRequestCount <= options.classFailures) throw new Error('Lỗi tải lớp')
      return [{ id: 'class-1', name: 'Toán <12>' }]
    },
    getStudentAttendance(params, options) {
      const pending = deferred()
      requests.push({ ...pending, params, signal: options.signal })
      return pending.promise
    }
  }
  class HarnessAbortController extends AbortController {
    constructor() {
      super()
      this.listenerCount = 0
      const original = this.signal.addEventListener.bind(this.signal)
      this.signal.addEventListener = (...args) => {
        this.listenerCount++
        return original(...args)
      }
      controllers.push(this)
    }
  }
  const dependencies = {
    renderSidebar: () => '', bindSidebarEvents() { sidebarBindCount++ }, renderNavbar: () => '',
    renderMascot: () => '<svg class="m-mascot"></svg>',
    escapeHtml: value => String(value ?? '').replace(/[&<>"']/g, char => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#039;' })[char]),
    state: mockState, api: mockApi, document: mockDocument, window: mockWindow,
    Intl, Date, URLSearchParams, AbortController: HarnessAbortController
  }
  const view = new Function(...Object.keys(dependencies), `${source}\nreturn { bindAttendanceEvents }`)(...Object.values(dependencies))
  return {
    view, requests, window: mockWindow, get, controllers,
    sidebarBindCount: () => sidebarBindCount,
    classRequestCount: () => classRequestCount
  }
}

const flush = () => new Promise(resolve => setImmediate(resolve))

test('đọc tham số hash, gọi API đúng và ghi lại hash chuẩn hoá', async () => {
  const harness = createHarness()
  harness.view.bindAttendanceEvents()
  await flush()
  assert.equal(harness.requests.length, 1)
  assert.deepEqual(harness.requests[0].params, { classId: 'class-1', fromDate: '2026-10-09', toDate: '2026-11-07' })
  assert.match(harness.window.location.hash, /^#attendance\?classId=class-1&fromDate=2026-10-09&toDate=2026-11-07$/)
  harness.requests[0].resolve(fixture)
  await flush()
  assert.match(harness.get('#attendance-content').innerHTML, /Buổi lớp đã học/)
})

test('ngày sai hiển thị lỗi inline và không gọi API điểm danh', async () => {
  const harness = createHarness('#attendance?classId=class-1&fromDate=2026-11-08&toDate=2026-11-07')
  harness.view.bindAttendanceEvents()
  await flush()
  assert.equal(harness.requests.length, 0)
  assert.match(harness.get('#attendance-filter-error').textContent, /Từ ngày/)
})

test('phản hồi cũ bị bỏ qua khi đổi bộ lọc liên tiếp', async () => {
  const harness = createHarness()
  harness.view.bindAttendanceEvents()
  await flush()
  assert.equal(harness.requests.length, 1)
  harness.get('#attendance-from').value = '2026-11-01'
  harness.get('#attendance-to').value = '2026-11-07'
  harness.get('#attendance-view').click()
  assert.equal(harness.requests.length, 2)
  assert.equal(harness.requests[0].signal.aborted, true)

  const newer = { ...fixture, className: 'Dữ liệu mới', summary: { ...fixture.summary, classSessions: 9 } }
  harness.requests[1].resolve(newer)
  await flush()
  assert.match(harness.get('#attendance-content').innerHTML, /<strong>9<\/strong>/)
  harness.requests[0].resolve({ ...fixture, className: 'Dữ liệu cũ', summary: { ...fixture.summary, classSessions: 99 } })
  await flush()
  assert.doesNotMatch(harness.get('#attendance-content').innerHTML, /<strong>99<\/strong>/)
})

test('chip khoảng ngày áp dụng ngay, đánh dấu aria-pressed và không tích luỹ listener lifecycle', async () => {
  const harness = createHarness()
  harness.view.bindAttendanceEvents()
  await flush()
  assert.equal(harness.requests.length, 1)
  const semester = harness.get('#attendance-app').querySelectorAll('[data-att-range]')[2]
  semester.click()
  assert.equal(semester.attrs['aria-pressed'], 'true')
  assert.equal(harness.requests.length, 2, 'Bấm chip phải tải ngay, không chờ nút Xem')
  assert.match(harness.window.location.hash, /fromDate=/)
  assert.equal(harness.controllers[0].listenerCount, 1, 'Lifecycle chỉ có một listener abort cho attendance controller hiện tại')
})

test('retry danh sách lớp chỉ tải lại lớp, không bind sidebar lần hai', async () => {
  const harness = createHarness('#attendance', { initialClasses: [], classFailures: 1 })
  harness.view.bindAttendanceEvents()
  await flush()
  assert.equal(harness.sidebarBindCount(), 1)
  assert.equal(harness.classRequestCount(), 1)
  assert.match(harness.get('#attendance-app').innerHTML, /Không tải được danh sách lớp/)
  harness.get('#attendance-retry-classes').click()
  await flush()
  assert.equal(harness.classRequestCount(), 2)
  assert.equal(harness.sidebarBindCount(), 1)
  assert.equal(harness.requests.length, 1, 'Tải lớp thành công thì tiếp tục tải điểm danh')
})

test('CSS attendance chỉ dùng selector Mochi và có breakpoint tablet/mobile', () => {
  const css = readFileSync(new URL('../src/css/mochi/attendance.css', import.meta.url), 'utf8')
  const selectors = [...css.matchAll(/(?:^|})\s*([^{}]+)\{/gm)].map(match => match[1].trim()).filter(value => !value.startsWith('@'))
  for (const group of selectors) {
    for (const selector of group.split(',').map(value => value.trim()).filter(Boolean)) {
      assert.match(selector, /^html\[data-ui="mochi"\]/, `Selector chưa scope: ${selector}`)
    }
  }
  assert.match(css, /@media \(max-width:900px\)/)
  assert.match(css, /@media \(max-width:640px\)/)
  assert.match(css, /\.m-att-data-stack\{[^}]*gap:22px/)
  assert.match(css, /@media \(max-width:640px\)[\s\S]*\.m-att-data-stack\{gap:16px/)
  assert.match(css, /@media \(max-width:640px\)[\s\S]*\.m-att-overview\{grid-template-columns:repeat\(2,/)
  assert.match(css, /@media \(max-width:640px\)[\s\S]*\.m-att-heat-cells\{display:flex/)
  assert.match(css, /var\(--m-surface\)/)
  assert.match(css, /var\(--m-ink\)/)
})
