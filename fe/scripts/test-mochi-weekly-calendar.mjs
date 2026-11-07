import test from 'node:test'
import assert from 'node:assert/strict'
import { register } from 'node:module'
import { readFileSync } from 'node:fs'

register('data:text/javascript,' + encodeURIComponent(`
  export async function load(url, context, nextLoad) {
    if (url.endsWith('.css')) return { format: 'module', shortCircuit: true, source: '' };
    if (url.endsWith('.svg')) return { format: 'module', shortCircuit: true, source: 'export default "test-mascot.svg";' };
    return nextLoad(url, context);
  }
`))

const saved = new Map()
globalThis.localStorage = {
  getItem: key => saved.get(key) ?? null,
  setItem: (key, value) => saved.set(key, String(value)),
  removeItem: key => saved.delete(key)
}
globalThis.document = {
  head: null,
  documentElement: { dataset: {}, style: {} },
  addEventListener() {},
  querySelectorAll: () => [],
  getElementById: () => null
}
globalThis.window = {
  location: { hash: '#weekly-calendar', search: '' },
  addEventListener() {},
  matchMedia: () => ({ matches: false })
}

const { state } = await import('../src/js/state.js')
const {
  renderWeeklyCalendarView,
  renderClassicWeeklyCalendarView,
  renderMochiWeeklyCalendarView
} = await import('../src/js/views/weekly-calendar.js')

function useStudent() {
  state.token = 'fixture-token'
  state.user = { id: 'student-1', role: 'STUDENT', fullName: 'Học sinh' }
}

function useAdmin() {
  state.token = 'fixture-token'
  state.user = { id: 'admin-1', role: 'ADMIN', fullName: 'Quản trị viên' }
}

function setMochi(enabled) {
  saved.set('eduportal-ui', enabled ? 'mochi' : 'classic')
  window.location.search = ''
}

function attributes(html, pattern) {
  return new Set([...String(html).matchAll(pattern)].map(match => match[1]))
}

test('cờ classic giữ nguyên đúng renderer cũ và ADMIN luôn dùng giao diện cũ', () => {
  useStudent()
  setMochi(false)
  assert.equal(renderWeeklyCalendarView(), renderClassicWeeklyCalendarView())

  useAdmin()
  setMochi(true)
  assert.equal(renderWeeklyCalendarView(), renderClassicWeeklyCalendarView())
  assert.doesNotMatch(renderWeeklyCalendarView(), /m-weekly-calendar/)
})

test('Mochi student có header, điều hướng, lưới đích và không có tính năng giả', () => {
  useStudent()
  setMochi(true)
  const html = renderWeeklyCalendarView()
  assert.equal(html, renderMochiWeeklyCalendarView())
  assert.match(html, /class="content-body m-weekly-calendar"/)
  assert.match(html, /<h1>Lịch học<\/h1>/)
  assert.match(html, /id="wc-prev"/)
  assert.match(html, /id="wc-today"/)
  assert.match(html, /id="wc-next"/)
  assert.match(html, /id="wc-content"/)
  assert.match(html, /m-mascot/)
  assert.doesNotMatch(html, /streak|leaderboard|huy hiệu|\bXP\b/i)
})

test('Mochi bảo toàn toàn bộ id và data-* chức năng của classic', () => {
  useStudent()
  setMochi(true)
  const classic = renderClassicWeeklyCalendarView()
  const mochi = renderWeeklyCalendarView()
  const classicIds = attributes(classic, /\bid="([^"]+)"/g)
  const mochiIds = attributes(mochi, /\bid="([^"]+)"/g)
  const withoutStyles = html => html.replace(/<style>[\s\S]*?<\/style>/g, '')
  const classicData = attributes(withoutStyles(classic), /\b(data-[\w-]+)(?:=|\s|>)/g)
  const mochiData = attributes(withoutStyles(mochi), /\b(data-[\w-]+)(?:=|\s|>)/g)
  for (const id of classicIds) assert.ok(mochiIds.has(id), `Mochi thiếu id ${id}`)
  for (const name of classicData) assert.ok(mochiData.has(name), `Mochi thiếu thuộc tính ${name}`)
})

// Run the real binding code with a tiny DOM/API harness to cover honest empty data.
const viewSource = readFileSync(new URL('../src/js/views/weekly-calendar.js', import.meta.url), 'utf8')
const cssSource = readFileSync(new URL('../src/css/mochi/weekly-calendar.css', import.meta.url), 'utf8')
const calendar = await import('../src/js/utils/weekly-calendar.js')

function deferred() {
  let resolve, reject
  const promise = new Promise((yes, no) => { resolve = yes; reject = no })
  return { promise, resolve, reject }
}

function emptyHarness() {
  const elements = new Map()
  const element = () => ({
    innerHTML: '', textContent: '', value: '', disabled: false, attrs: {}, events: {}, children: [],
    setAttribute(key, value) { this.attrs[key] = value },
    addEventListener(name, callback) { this.events[name] = callback },
    appendChild(child) { this.children.push(child) },
    insertAdjacentHTML(_where, html) { this.innerHTML += html },
    click() { this.events.click?.() },
    remove() {}
  })
  const root = {
    isConnected: true,
    querySelector(selector) {
      if (!elements.has(selector)) elements.set(selector, element())
      return elements.get(selector)
    }
  }
  const mockDocument = {
    head: null,
    getElementById: id => id === 'weekly-calendar-root' ? root : null,
    createElement: () => element(),
    body: element()
  }
  const mockWindow = {
    location: { hash: '#weekly-calendar?weekStart=2026-10-26', search: '' },
    history: { replaceState(_state, _title, hash) { mockWindow.location.hash = hash } }
  }
  const mockState = { token: 'fixture', user: { id: 'student-1', role: 'STUDENT' } }
  const requests = []
  const dependencies = {
    ...calendar,
    state: mockState,
    document: mockDocument,
    window: mockWindow,
    Blob,
    URL: { createObjectURL: () => 'blob:fixture', revokeObjectURL() {} },
    setTimeout: callback => callback(),
    mascotUrl: 'fixture.svg',
    isMochiUI: () => true,
    renderMascot: () => '<svg class="m-mascot" aria-hidden="true"></svg>',
    renderSidebar: () => '',
    bindSidebarEvents() {},
    renderNavbar: () => '',
    escapeHtml: value => String(value ?? '').replace(/[&<>"']/g, char => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#039;' })[char]),
    api: { getWeeklyCalendar(params, options) {
      const pending = deferred()
      requests.push({ ...pending, params, signal: options.signal })
      return pending.promise
    } }
  }
  const stripped = viewSource.replace(/^import[\s\S]*?from ['"][^'"]+['"]\n/gm, '').replace(/^export /gm, '')
  const view = new Function(...Object.keys(dependencies), `${stripped}\nreturn { bindWeeklyCalendarEvents }`)(...Object.values(dependencies))
  return { view, requests, get: id => root.querySelector(`#${id}`) }
}

test('dữ liệu rỗng render đủ bảy ngày, trạng thái hướng dẫn và không phát sinh lỗi', async () => {
  const harness = emptyHarness()
  harness.view.bindWeeklyCalendarEvents()
  harness.requests[0].resolve({
    timeZone: calendar.CALENDAR_TIME_ZONE,
    weekStart: '2026-10-26',
    classes: [], events: [], meetings: [], meetingsAvailable: true, warnings: []
  })
  await new Promise(resolve => setImmediate(resolve))
  const html = harness.get('wc-content').innerHTML
  assert.match(html, /m-wc-empty/)
  assert.match(html, /Tuần này chưa có lịch/)
  assert.equal((html.match(/class="wc-day"/g) || []).length, 7)
  assert.equal((html.match(/Không có lịch/g) || []).length, 7)
  assert.equal(harness.get('wc-content').attrs['aria-busy'], 'false')
})

test('thẻ sự kiện Mochi giữ tên đầy đủ trong title và dùng hook rút gọn một dòng', async () => {
  const harness = emptyHarness()
  harness.view.bindWeeklyCalendarEvents()
  harness.requests[0].resolve({
    timeZone: calendar.CALENDAR_TIME_ZONE,
    weekStart: '2026-10-26',
    classes: [{ id: 'class-1', name: 'Toán 12 – Thầy Hoàng & Cô Mai' }],
    events: [{
      id: 'deadline-1', kind: 'deadline', classId: 'class-1', className: 'Toán 12 – Thầy Hoàng & Cô Mai',
      lessonId: 'lesson-1', lessonTitle: 'Khảo sát hàm số và ứng dụng rất dài', title: 'Bài luyện tập',
      date: '2026-10-26', at: '2026-10-26T08:00:00Z'
    }],
    meetings: [], meetingsAvailable: true, warnings: []
  })
  await new Promise(resolve => setImmediate(resolve))
  const html = harness.get('wc-content').innerHTML
  assert.match(html, /m-wc-event-heading/)
  assert.match(html, /class="m-wc-event-title" title="Bài luyện tập"/)
  assert.match(html, /class="wc-meta m-wc-event-meta" title="Toán 12 – Thầy Hoàng &amp; Cô Mai"/)
  assert.match(html, /title="Khảo sát hàm số và ứng dụng rất dài"/)
})

test('CSS dùng lề an toàn, breakpoint 7/4/2/1 cột và token Mochi thắng navy dark', () => {
  assert.match(cssSource, /max-width:\s*1200px/)
  assert.match(cssSource, /width:\s*calc\(100% - 56px\)/)
  assert.match(cssSource, /grid-template-columns:\s*repeat\(4,/)
  assert.match(cssSource, /@container weekly-calendar \(min-width:\s*1180px\)[\s\S]*grid-template-columns:\s*repeat\(7,/)
  assert.match(cssSource, /@media \(max-width:\s*900px\)[\s\S]*grid-template-columns:\s*repeat\(2,/)
  assert.match(cssSource, /@media \(max-width:\s*640px\)[\s\S]*grid-template-columns:\s*minmax\(0,\s*1fr\)/)
  assert.match(cssSource, /#weekly-calendar-root\.m-weekly-calendar \.wc-day\[aria-current="date"\][\s\S]*var\(--m-accent\)[\s\S]*!important/)
  assert.match(cssSource, /#weekly-calendar-root\.m-weekly-calendar \.wc-toolbar #wc-today[\s\S]*background:\s*var\(--m-accent\)\s*!important/)
  assert.match(cssSource, /\.m-wc-event-meta[\s\S]*text-overflow:\s*ellipsis;[\s\S]*white-space:\s*nowrap;/)
})
