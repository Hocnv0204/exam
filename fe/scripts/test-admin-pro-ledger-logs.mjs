import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const saved = new Map([
  ['eduportal-ui', 'classic'],
  ['eduportal-theme', 'light']
])

const storage = {
  getItem: key => saved.get(key) ?? null,
  setItem: (key, value) => saved.set(key, String(value)),
  removeItem: key => saved.delete(key)
}

globalThis.localStorage = storage
globalThis.sessionStorage = storage
globalThis.CustomEvent = class {
  constructor(type, options = {}) { this.type = type; this.detail = options.detail }
}

// --- DOM giả lập tối thiểu: getElementById trả về stub theo register() ---
let els = new Map()

function el(extra = {}) {
  const node = {
    innerHTML: '',
    textContent: '',
    value: '',
    disabled: false,
    dataset: {},
    style: {},
    title: '',
    listeners: {},
    addEventListener(type, fn) { (node.listeners[type] ||= []).push(fn) },
    setAttribute() {},
    getAttribute: () => null,
    querySelector: () => null,
    querySelectorAll: () => [],
    appendChild() {},
    removeChild() {},
    remove() {},
    click() {},
    ...extra
  }
  return node
}

globalThis.document = {
  documentElement: {
    dataset: { theme: 'light' },
    style: {},
    getAttribute: attr => {
      if (attr === 'data-admin-ui') return saved.get('eduportal-ui') === 'mochi' ? 'pro' : null
      if (attr === 'data-theme') return saved.get('eduportal-theme') || 'light'
      return null
    }
  },
  head: null,
  body: { appendChild() {}, removeChild() {} },
  createElement: () => el(),
  addEventListener: () => {},
  dispatchEvent: () => {},
  querySelector: () => null,
  querySelectorAll: () => [],
  getElementById: id => els.get(id) || null
}

globalThis.window = {
  location: { hash: '#tuition-ledger', search: '', origin: 'http://localhost', pathname: '/' },
  addEventListener: () => {},
  matchMedia: () => ({ matches: false }),
  open: () => null
}

const { state } = await import('../src/js/state.js')
const { setTheme } = await import('../src/js/theme.js')
const { api } = await import('../src/js/api.js')
const { renderTuitionLedgerView, bindTuitionLedgerEvents } = await import('../src/js/views/tuition-ledger.js')
const { renderActivityLogsView, bindActivityLogsEvents } = await import('../src/js/views/activity-logs.js')

const scriptDir = dirname(fileURLToPath(import.meta.url))
const cssPath = resolve(scriptDir, '../src/css/admin-pro/pages/ledger-logs.css')
const ledgerLogsCss = readFileSync(cssPath, 'utf8')

const settle = () => new Promise(resolve => setTimeout(resolve, 10))

function fixtureAdmin() {
  state.token = 'admin-token'
  state.user = { id: 'admin-1', role: 'ADMIN', fullName: 'Thầy Hoàng', username: 'admin' }
  state.classes = [
    { id: 'class-1', name: 'Toán 12 Nâng Cao' },
    { id: 'class-2', name: 'Hóa 11 Cơ Bản' }
  ]
  setTheme('light')
}

function setUI(value, query = '') {
  saved.set('eduportal-ui', value)
  window.location.search = query
}

function resetModules() {
  window.location.hash = '#tuition-ledger'
  window.location.search = ''
  saved.set('eduportal-ui', 'classic')
  els = new Map()
}

function functionalHooks(markup) {
  const hooks = new Set()
  for (const match of markup.matchAll(/\bid="([^"]+)"/g)) hooks.add(`id:${match[1]}`)
  for (const match of markup.matchAll(/\b(data-[\w-]+)(?:=|\s|>)/g)) hooks.add(match[1])
  return hooks
}

function assertSuperset(actual, expected, label) {
  for (const hook of expected) {
    assert.ok(actual.has(hook), `${label} phải giữ hook ${hook}`)
  }
}

function collectRuleSelectors(css) {
  const source = css.replace(/\/\*[\s\S]*?\*\//g, '')
  const selectors = []

  function walk(block) {
    let cursor = 0
    while (cursor < block.length) {
      const open = block.indexOf('{', cursor)
      if (open < 0) break
      const prelude = block.slice(cursor, open).trim()
      let depth = 1
      let close = open + 1
      while (close < block.length && depth > 0) {
        if (block[close] === '{') depth++
        if (block[close] === '}') depth--
        close++
      }
      const body = block.slice(open + 1, close - 1)
      if (/^@(?:media|supports|layer)\b/.test(prelude)) walk(body)
      else if (prelude && !prelude.startsWith('@')) selectors.push(prelude)
      cursor = close
    }
  }

  walk(source)
  return selectors
}

// Split a selector list on top-level commas (ignores commas inside :is() etc.)
function splitRemaining(selectorList) {
  const selectors = []
  let start = 0
  let depth = 0
  let sawComma = false
  for (let i = 0; i < selectorList.length; i++) {
    if (selectorList[i] === '(' || selectorList[i] === '[') depth++
    if (selectorList[i] === ')' || selectorList[i] === ']') depth--
    if (selectorList[i] === ',' && depth === 0) {
      selectors.push(selectorList.slice(start, i))
      start = i + 1
      sawComma = true
    }
  }
  selectors.push(selectorList.slice(start))
  return selectors
}

const ledgerTxFixture = [
  { type: 'topup', amount: 1200000, className: 'Toán 12 Nâng Cao', studentName: 'Trần Gia Bảo', receiptNo: 'BL-0248', note: 'Chuyển khoản', createdAt: '2026-11-07T09:42:00+07:00' },
  { type: 'auto_deduct', amount: -320000, className: 'Toán 12 Nâng Cao', studentName: 'Trần Gia Bảo', receiptNo: '', note: 'Buổi học 06/11', createdAt: '2026-11-07T08:15:00+07:00' },
  { type: 'refund', amount: -160000, className: 'Toán 12 Nâng Cao', studentName: 'Lê Thu Hà', receiptNo: 'BL-0247', note: 'Nghỉ có phép', createdAt: '2026-11-06T20:06:00+07:00' },
  { type: 'manual_collect', amount: 300000, className: 'Hóa 11 Cơ Bản', studentName: 'Đỗ Khánh Linh', receiptNo: 'BL-0246', note: '', createdAt: '2026-11-06T17:30:00+07:00' },
  { type: 'waive', amount: -320000, className: 'Hóa 11 Cơ Bản', studentName: 'Đỗ Khánh Linh', receiptNo: '', note: 'Miễn buổi bù', createdAt: '2026-11-05T19:45:00+07:00' }
]

const logsFixture = [
  { createdAt: '2026-11-07T20:14:00+07:00', userName: 'Nguyễn Minh Anh', username: '@minhanh12', action: 'HOMEWORK_SUBMIT', detail: 'Luyện đề hàm số', durationSeconds: 2520 },
  { createdAt: '2026-11-07T19:48:00+07:00', userName: 'Trần Gia Bảo', username: '@giabao', action: 'VIDEO_WATCH', detail: 'Cực trị hàm số', durationSeconds: 1080 },
  { createdAt: '2026-11-07T19:32:00+07:00', userName: 'Lê Thu Hà', username: '@thuha11', action: 'LOGIN', detail: '', durationSeconds: 0 },
  { createdAt: '2026-11-07T18:55:00+07:00', userName: 'Phạm Quốc Huy', username: '@quochuy', action: 'EXAM_START', detail: 'Kiểm tra chương 1', durationSeconds: 0 },
  { createdAt: '2026-11-07T18:41:00+07:00', userName: 'Đỗ Khánh Linh', username: '@khanhlinh', action: 'LESSON_VIEW', detail: 'Nguyên hàm cơ bản', durationSeconds: 720 },
  { createdAt: '2026-11-07T18:20:00+07:00', userName: 'Vũ Đức Minh', username: '@ducminh', action: 'UNKNOWN_ACTION_X', detail: '', durationSeconds: 0 }
]

test('(a) opt-out classic giữ nguyên output cũ của sổ học phí và nhật ký', () => {
  fixtureAdmin()
  resetModules()

  window.location.hash = '#tuition-ledger'
  const classicLedger = renderTuitionLedgerView()
  assert.match(classicLedger, /<div class="app-layout">/)
  assert.doesNotMatch(classicLedger, /id="tuition-ledger"/)
  assert.doesNotMatch(classicLedger, /admin-dark|ap-page-head|ap-filter-card|ap-summary-grid/)
  // Marker y hệt bản renderer cũ
  assert.match(classicLedger, /<option value="">Tất cả lớp học<\/option>/)
  assert.match(classicLedger, /<th>Ngày nạp<\/th><th>Giờ<\/th><th>Học sinh<\/th><th>Lớp<\/th><th style="text-align:right;">Số tiền nạp<\/th>/)
  assert.match(classicLedger, /<tbody id="ledger-topup-tbody"><tr><td colspan="8" style="text-align:center; padding:24px; color:#94a3b8;">Đang tải\.\.\.<\/td><\/tr><\/tbody>/)
  assert.match(classicLedger, /<h2 style="font-size:16px; font-weight:700; margin:0 0 2px 0;"><i class="fa-solid fa-wallet" style="color:#16a34a;"><\/i> Lịch sử nạp tiền/)
  assert.match(classicLedger, /<button id="ledger-export-btn" class="btn-secondary"/)

  window.location.hash = '#activity-logs'
  const classicLogs = renderActivityLogsView()
  assert.match(classicLogs, /<div class="app-layout">/)
  assert.doesNotMatch(classicLogs, /id="activity-logs"/)
  assert.doesNotMatch(classicLogs, /admin-dark|ap-page-head|ap-filter-card|ap-timeline-card/)
  assert.match(classicLogs, /<h1 class="page-title">Nhật ký hoạt động<\/h1>/)
  assert.match(classicLogs, /<tbody id="activity-logs-tbody">/)
  assert.match(classicLogs, /<div id="activity-pagination-wrapper"/)

  window.location.search = '?ui=classic'
  window.location.hash = '#tuition-ledger'
  assert.equal(renderTuitionLedgerView(), classicLedger, 'query opt-out không thay đổi output classic của ledger')
  window.location.hash = '#activity-logs'
  assert.equal(renderActivityLogsView(), classicLogs, 'query opt-out không thay đổi output classic của logs')
})

test('(b) Pro dựng lại bố cục mới và giữ tập id/data-* chức năng ⊇ bản classic', () => {
  fixtureAdmin()
  resetModules()

  window.location.hash = '#tuition-ledger'
  const classicLedger = renderTuitionLedgerView()
  window.location.hash = '#activity-logs'
  const classicLogs = renderActivityLogsView()

  setUI('mochi')

  window.location.hash = '#tuition-ledger'
  const proLedger = renderTuitionLedgerView()
  assert.match(proLedger, /class="app-layout admin-dark" id="tuition-ledger" data-route="tuition-ledger" data-role="ADMIN"/)
  assertSuperset(functionalHooks(proLedger), functionalHooks(classicLedger), 'Ledger Pro')
  // Khối bố cục Pro
  assert.match(proLedger, /ap-page-head/)
  assert.match(proLedger, /<h1 class="ap-page-title">Sổ giao dịch học phí<\/h1>/)
  assert.match(proLedger, /ap-page-filter/)
  assert.match(proLedger, /ap-filter-item/)
  assert.match(proLedger, /id="ledger-summary" class="ap-summary-grid"/)
  assert.match(proLedger, /ap-table-card/)
  assert.match(proLedger, /<button id="ledger-export-btn" class="ap-btn-primary"/)

  window.location.hash = '#activity-logs'
  const proLogs = renderActivityLogsView()
  assert.match(proLogs, /class="app-layout admin-dark" id="activity-logs" data-route="activity-logs" data-role="ADMIN"/)
  assertSuperset(functionalHooks(proLogs), functionalHooks(classicLogs), 'ActivityLogs Pro')
  assert.match(proLogs, /ap-page-head/)
  assert.match(proLogs, /<h1 class="ap-page-title">Nhật ký hoạt động<\/h1>/)
  assert.match(proLogs, /ap-page-filter/)
  assert.match(proLogs, /ap-filter-item/)
  assert.match(proLogs, /ap-timeline-card/)
  assert.match(proLogs, /<ol id="activity-logs-tbody" class="ap-tl">/)
  assert.match(proLogs, /id="activity-pagination-wrapper"/)
})

test('(c1) bind ledger trên DOM Pro không ném lỗi; hàng/summary có đủ hook chức năng', async () => {
  fixtureAdmin()
  resetModules()
  setUI('mochi')

  window.location.hash = '#tuition-ledger'
  renderTuitionLedgerView()

  els.set('ledger-filter-class', el())
  els.set('ledger-filter-type', el())
  els.set('ledger-search', el())
  els.set('ledger-export-btn', el())
  els.set('ledger-topup-tbody', el())
  els.set('ledger-deduct-tbody', el())
  els.set('ledger-summary', el())
  els.set('ledger-topup-count', el())
  els.set('ledger-deduct-count', el())

  const origGet = api.getTuitionTransactions
  api.getTuitionTransactions = async () => ledgerTxFixture
  try {
    bindTuitionLedgerEvents()
    await settle()

    const topHTML = els.get('ledger-topup-tbody').innerHTML
    const dedHTML = els.get('ledger-deduct-tbody').innerHTML
    // Hook chức năng giữ nguyên ở hàng Pro
    for (const html of [topHTML, dedHTML]) {
      assert.match(html, /data-tx-student/)
      assert.match(html, /data-tx-type/)
      assert.match(html, /class="btn-ledger-print btn-secondary"/)
      assert.match(html, /data-tx=/)
    }
    // Pro: chip loại đúng tone và số tiền có dấu
    assert.match(topHTML, /ap-tx-chip ap-tone-ok/)
    assert.match(dedHTML, /ap-tx-chip ap-tone-warn/)
    assert.match(dedHTML, /ap-tx-chip ap-tone-blue/)
    assert.match(dedHTML, /ap-tx-chip ap-tone-accent/)
    assert.match(dedHTML, /ap-tx-chip ap-tone-muted/)
    assert.match(topHTML, /ap-amt-plus/)
    assert.match(dedHTML, /ap-amt-minus/)
    // Đăng ký listener không ném lỗi
    assert.ok(els.get('ledger-filter-class').listeners.change, 'change listener của ledger-filter-class phải có')
    assert.ok(els.get('ledger-filter-type').listeners.change)
    assert.ok(els.get('ledger-search').listeners.input)
    assert.ok(els.get('ledger-export-btn').listeners.click)

    const sumHTML = els.get('ledger-summary').innerHTML
    assert.match(sumHTML, /TỔNG NẠP VÍ/)
    assert.match(sumHTML, /TỔNG TRỪ VÍ/)
    assert.match(sumHTML, /TỔNG THU TAY/)
    assert.match(sumHTML, /TỔNG MIỄN/)
    assert.match(sumHTML, /1.200\.000 đ/)
    assert.match(sumHTML, /ap-summary-value/)
  } finally {
    api.getTuitionTransactions = origGet
  }
})

test('(c2) bind ledger trên DOM classic vẫn tương thích — hàng y hệt renderer cũ', async () => {
  fixtureAdmin()
  resetModules()

  window.location.hash = '#tuition-ledger'
  renderTuitionLedgerView()
  for (const id of ['ledger-filter-class', 'ledger-filter-type', 'ledger-search', 'ledger-export-btn', 'ledger-topup-tbody', 'ledger-deduct-tbody', 'ledger-summary', 'ledger-topup-count', 'ledger-deduct-count']) {
    els.set(id, el())
  }

  const origGet = api.getTuitionTransactions
  api.getTuitionTransactions = async () => ledgerTxFixture
  try {
    bindTuitionLedgerEvents()
    await settle()

    const topHTML = els.get('ledger-topup-tbody').innerHTML
    const dedHTML = els.get('ledger-deduct-tbody').innerHTML
    assert.match(topHTML, /<span class="badge" style="font-size:11px;">/) // classic giữ badge cũ
    assert.match(topHTML, /color:#15803d;/)
    assert.match(dedHTML, /color:#b91c1c;/)
    assert.doesNotMatch(dedHTML, /ap-chip|ap-amt-minus|ap-amt-plus/)
    const sumHTML = els.get('ledger-summary').innerHTML
    assert.match(sumHTML, /background:#f0fdf4;/)
    assert.match(sumHTML, /TỔNG NẠP VÍ/)
  } finally {
    api.getTuitionTransactions = origGet
  }
})

test('(c3) bind activity-logs trên DOM Pro; timeline có icon theo hành động, count phân trang', async () => {
  fixtureAdmin()
  resetModules()
  setUI('mochi')

  window.location.hash = '#activity-logs'
  renderActivityLogsView()

  els.set('activity-search-input', el())
  els.set('activity-class-filter', el())
  els.set('activity-action-filter', el())
  els.set('activity-from-date', el())
  els.set('activity-to-date', el())
  els.set('activity-apply-btn', el())
  els.set('activity-reset-btn', el())
  els.set('activity-logs-tbody', el())
  els.set('activity-pagination-wrapper', el())
  els.set('ap-tl-count', el())

  const origGet = api.getUserActivity
  api.getUserActivity = async () => ({ total: 86, items: logsFixture })
  try {
    bindActivityLogsEvents()
    await settle()

    const listHTML = els.get('activity-logs-tbody').innerHTML
    assert.match(listHTML, /ap-tl-item/)
    assert.match(listHTML, /fa-right-to-bracket/)          // LOGIN
    assert.match(listHTML, /fa-play/)                      // VIDEO_WATCH
    assert.match(listHTML, /fa-circle-check/)              // HOMEWORK_SUBMIT
    assert.match(listHTML, /fa-door-open/)                 // EXAM_START
    assert.match(listHTML, /fa-book-open/)                 // LESSON_VIEW
    assert.match(listHTML, /fa-circle-info/)               // hành động không rõ
    assert.match(listHTML, /Escaped|<strong>Nguyễn Minh Anh<\/strong>/)
    // Phân trang giữ nguyên
    assert.match(els.get('activity-pagination-wrapper').innerHTML, /pagination-btn/)
    assert.match(els.get('activity-pagination-wrapper').innerHTML, /pagination-page-size/)
    assert.match(els.get('ap-tl-count').textContent, /Trang 1 · 86 bản ghi/)
    // Listener đăng ký đầy đủ
    assert.ok(els.get('activity-apply-btn').listeners.click)
    assert.ok(els.get('activity-reset-btn').listeners.click)
    assert.ok(els.get('activity-class-filter').listeners.change)
    assert.ok(els.get('activity-search-input').listeners.keydown)
  } finally {
    api.getUserActivity = origGet
  }
})

test('(d) dữ liệu rỗng/lỗi không crash, có trạng thái hiển thị rõ', async () => {
  fixtureAdmin()
  setUI('mochi')

  // --- rỗng ---
  resetModules()
  saved.set('eduportal-ui', 'mochi')
  window.location.hash = '#tuition-ledger'
  renderTuitionLedgerView()
  for (const id of ['ledger-filter-class', 'ledger-filter-type', 'ledger-search', 'ledger-export-btn', 'ledger-topup-tbody', 'ledger-deduct-tbody', 'ledger-summary', 'ledger-topup-count', 'ledger-deduct-count']) els.set(id, el())
  const origGet = api.getTuitionTransactions
  api.getTuitionTransactions = async () => []
  try {
    bindTuitionLedgerEvents()
    await settle()
    assert.match(els.get('ledger-topup-tbody').innerHTML, /Chưa có lượt nạp nào\./)
    assert.match(els.get('ledger-deduct-tbody').innerHTML, /Chưa có giao dịch trừ\/thu nào\./)
    assert.equal(els.get('ledger-summary').innerHTML.includes('0 đ'), true)
  } finally {
    api.getTuitionTransactions = origGet
  }

  // --- lỗi API ledger: còn empty state, không ném ---
  resetModules()
  saved.set('eduportal-ui', 'mochi')
  window.location.hash = '#tuition-ledger'
  renderTuitionLedgerView()
  for (const id of ['ledger-filter-class', 'ledger-filter-type', 'ledger-search', 'ledger-export-btn', 'ledger-topup-tbody', 'ledger-deduct-tbody', 'ledger-summary', 'ledger-topup-count', 'ledger-deduct-count']) els.set(id, el())
  api.getTuitionTransactions = async () => { throw new Error('network_<x>') }
  try {
    bindTuitionLedgerEvents()
    await settle()
    assert.match(els.get('ledger-topup-tbody').innerHTML, /Chưa có lượt nạp nào\./)
  } finally {
    api.getTuitionTransactions = origGet
  }

  // --- logs rỗng ---
  resetModules()
  saved.set('eduportal-ui', 'mochi')
  window.location.hash = '#activity-logs'
  renderActivityLogsView()
  for (const id of ['activity-search-input', 'activity-class-filter', 'activity-action-filter', 'activity-from-date', 'activity-to-date', 'activity-apply-btn', 'activity-reset-btn', 'activity-logs-tbody', 'activity-pagination-wrapper', 'ap-tl-count']) els.set(id, el())
  const origActivity = api.getUserActivity
  api.getUserActivity = async () => ({ total: 0, items: [] })
  try {
    bindActivityLogsEvents()
    await settle()
    assert.match(els.get('activity-logs-tbody').innerHTML, /Không có bản ghi nào khớp bộ lọc\./)
  } finally {
    api.getUserActivity = origActivity
  }

  // --- logs lỗi API ---
  api.getUserActivity = async () => { throw new Error('boom_<x>') }
  try {
    bindActivityLogsEvents()
    await settle()
    assert.match(els.get('activity-logs-tbody').innerHTML, /Tải thất bại: boom_&lt;x&gt;/)
  } finally {
    api.getUserActivity = origActivity
  }
})

test('(c4) bind logs trên DOM classic giữ skeleton/row bảng cũ', async () => {
  fixtureAdmin()
  resetModules()

  window.location.hash = '#activity-logs'
  renderActivityLogsView()
  for (const id of ['activity-search-input', 'activity-class-filter', 'activity-action-filter', 'activity-from-date', 'activity-to-date', 'activity-apply-btn', 'activity-reset-btn', 'activity-logs-tbody', 'activity-pagination-wrapper']) els.set(id, el())

  const origActivity = api.getUserActivity
  api.getUserActivity = async () => ({ total: 2, items: logsFixture.slice(0, 2) })
  try {
    bindActivityLogsEvents()
    await settle()
    const listHTML = els.get('activity-logs-tbody').innerHTML
    assert.match(listHTML, /<tr>/)
    assert.match(listHTML, /<span class="badge badge-paid">/)
    assert.doesNotMatch(listHTML, /ap-tl-item/)
    assert.match(els.get('activity-pagination-wrapper').innerHTML, /pagination-btn/)
  } finally {
    api.getUserActivity = origActivity
  }
})

test('(e) mọi rule trong ledger-logs.css đều scope bằng cổng html[data-admin-ui="pro"]', () => {
  const selectors = collectRuleSelectors(ledgerLogsCss)
  assert.ok(selectors.length > 0, 'Phải có ít nhất 1 selector trong ledger-logs.css')
  for (const selectorList of selectors) {
    for (const selector of splitRemaining(selectorList)) {
      assert.match(selector.trim(), /^html\[data-admin-ui="pro"\]/, `Selector chưa scope: ${selector.trim()}`)
    }
  }
  assert.match(ledgerLogsCss, /@media\s*\(min-width:\s*1280px\)/, 'Phải có breakpoint 1280px')
  assert.match(ledgerLogsCss, /@media\s*\(max-width:\s*900px\)/, 'Phải có responsive breakpoint 900px')
  assert.match(ledgerLogsCss, /@media\s*\(max-width:\s*640px\)/, 'Phải có responsive breakpoint 640px')
  assert.match(ledgerLogsCss, /overflow-x:\s*auto/, 'Phải hỗ trợ cuộn ngang bảng overflow-x: auto')
})
