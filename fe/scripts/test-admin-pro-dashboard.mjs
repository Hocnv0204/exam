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
globalThis.document = {
  documentElement: { dataset: { theme: 'light' }, style: {} },
  addEventListener: () => {},
  dispatchEvent: () => {},
  querySelector: () => null,
  querySelectorAll: () => [],
  getElementById: () => null
}
globalThis.window = {
  location: { hash: '#admin-dashboard', search: '' },
  addEventListener: () => {},
  matchMedia: () => ({ matches: false }),
  open: () => null
}

const { state } = await import('../src/js/state.js')
const { setTheme } = await import('../src/js/theme.js')
const {
  renderAdminDashboardView,
  renderClassicAdminDashboardView,
  bindAdminDashboardEvents,
  getAdminChartPalette
} = await import('../src/js/views/admin-dashboard.js')
const { api } = await import('../src/js/api.js')
const { renderTuitionLedgerView } = await import('../src/js/views/tuition-ledger.js')

const scriptDir = dirname(fileURLToPath(import.meta.url))
const cssPath = resolve(scriptDir, '../src/css/admin-pro/pages/dashboard.css')
const dashboardCss = readFileSync(cssPath, 'utf8')
const dashboardSource = readFileSync(resolve(scriptDir, '../src/js/views/admin-dashboard.js'), 'utf8')

function fixture() {
  state.token = 'admin-token'
  state.user = { id: 'admin-1', role: 'ADMIN', fullName: 'Thầy Hoàng', username: 'admin' }
  state.classes = [{ id: 'class-1', name: 'Toán 12' }]
  state.dashboard = {
    overview: {
      totalStudents: 24,
      totalClasses: 3,
      totalHomeworks: 8,
      totalSubmissions: 18,
      totalTaughtSessions: 12,
      totalTuitionFee: 12000000,
      totalPaidTuitionFee: 9000000,
      totalUnpaidTuitionFee: 3000000,
      averageScore: 7.5,
      passRate: 82,
      onTimeRate: 90
    },
    monthlyStats: [],
    recentSubmissions: [],
    studentAttendanceStats: [],
    scoreDistribution: { excellent: 0, good: 0, fair: 0, average: 0, poor: 0 }
  }
  setTheme('light')
}

function setUI(value, query = '') {
  saved.set('eduportal-ui', value)
  window.location.search = query
}

function functionalHooks(markup) {
  const hooks = new Set()
  for (const match of markup.matchAll(/\bid="([^"]+)"/g)) hooks.add(`id:${match[1]}`)
  for (const match of markup.matchAll(/\b(data-[\w-]+)(?:=|\s|>)/g)) hooks.add(match[1])
  return hooks
}

function assertSuperset(actual, expected, label) {
  for (const hook of expected) assert.ok(actual.has(hook), `${label} phải giữ hook ${hook}`)
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

function splitSelectorList(selectorList) {
  const selectors = []
  let start = 0
  let depth = 0
  for (let i = 0; i < selectorList.length; i++) {
    if (selectorList[i] === '(' || selectorList[i] === '[') depth++
    if (selectorList[i] === ')' || selectorList[i] === ']') depth--
    if (selectorList[i] === ',' && depth === 0) {
      selectors.push(selectorList.slice(start, i))
      start = i + 1
    }
  }
  selectors.push(selectorList.slice(start))
  return selectors
}

test('opt-out classic giữ nguyên output renderer cũ của dashboard và sổ học phí', () => {
  fixture()
  setUI('classic')

  window.location.hash = '#admin-dashboard'
  const dashboard = renderAdminDashboardView()
  assert.equal(dashboard, renderClassicAdminDashboardView(), 'cờ tắt phải trả về renderer classic y hệt')
  assert.match(dashboard, /<div class="app-layout" data-route="admin-dashboard" data-role="ADMIN">/)
  assert.doesNotMatch(dashboard, /id="admin-dashboard"/)

  window.location.hash = '#tuition-ledger'
  const ledger = renderTuitionLedgerView()
  assert.match(ledger, /<div class="app-layout">/)
  assert.doesNotMatch(ledger, /id="tuition-ledger"|data-route="tuition-ledger"/)

  window.location.search = '?ui=classic'
  assert.equal(renderTuitionLedgerView(), ledger, 'query opt-out không thay output classic của view')
})

test('Pro có root hook mới và giữ toàn bộ id/data-* chức năng của classic', () => {
  fixture()
  setUI('classic')

  window.location.hash = '#admin-dashboard'
  const classicDashboard = renderAdminDashboardView()
  window.location.hash = '#tuition-ledger'
  const classicLedger = renderTuitionLedgerView()

  setUI('mochi')
  window.location.hash = '#admin-dashboard'
  const proDashboard = renderAdminDashboardView()
  assert.match(proDashboard, /class="app-layout admin-dark" id="admin-dashboard" data-route="admin-dashboard"/)
  assert.match(proDashboard, /class="ap-dashboard-hero"/, 'Có header Mochi Pro')
  assert.match(proDashboard, /class="ap-dashboard-kpis"/, 'Có lưới KPI sticker')
  assert.match(proDashboard, /Học phí theo tháng/, 'Có biểu đồ học phí')
  assert.match(proDashboard, /Phân bố điểm/, 'Có khối phân bố điểm')
  assert.match(proDashboard, /Học sinh cần đóng tiền/, 'Có khối học sinh cần đóng tiền')
  assert.doesNotMatch(proDashboard, /<span>Lượt nộp bài tập<\/span>/, 'Pro không còn KPI lượt nộp bài tập')
  assert.doesNotMatch(proDashboard, /<span>Điểm trung bình<\/span>/, 'Pro không còn KPI điểm trung bình')
  assertSuperset(functionalHooks(proDashboard), functionalHooks(classicDashboard), 'Dashboard Pro')

  window.location.hash = '#tuition-ledger'
  const proLedger = renderTuitionLedgerView()
  assert.match(proLedger, /class="app-layout admin-dark" id="tuition-ledger" data-route="tuition-ledger" data-role="ADMIN"/)
  assertSuperset(functionalHooks(proLedger), functionalHooks(classicLedger), 'Sổ học phí Pro')
})

test('popup học sinh cần đóng tiền giữ lớp classic và chỉ thêm hook ở Pro', () => {
  assert.match(
    dashboardSource,
    /contentClass:\s*isAdminProUI\(\)\s*\?\s*'zb-popup ap-zero-balance-modal'\s*:\s*'zb-popup'/
  )
  assert.match(
    dashboardSource,
    /isAdminProUI\(\)\s*\?\s*renderZeroBalanceModalTable[\s\S]*?:\s*renderZeroBalanceTable/
  )
  const classicContentClass = dashboardSource.match(/:\s*'zb-popup'\s*\n\s*}/)?.[0] || ''
  assert.match(classicContentClass, /'zb-popup'/, 'classic vẫn dùng zb-popup')
  assert.doesNotMatch(classicContentClass, /ap-zero-balance-modal/, 'classic không có hook Pro')
  assert.match(dashboardCss, /#modal-container \.ap-zero-balance-modal/)
})

test('bind dashboard trên DOM Pro tối thiểu và dữ liệu rỗng/lỗi không ném lỗi', async () => {
  fixture()
  setUI('mochi')
  state.dashboard = null
  const markup = renderAdminDashboardView()
  assert.match(markup, /id="dash-stu-table-body"/)

  const events = []
  const fakeElement = () => ({
    addEventListener: (type) => events.push(type),
    innerHTML: '',
    textContent: '',
    closest: () => null
  })
  const originalGetElementById = document.getElementById
  const originalZeroBalance = api.getZeroBalanceCount
  const elements = new Map([
    ['dash-zero-balance-card', fakeElement()],
    ['dash-stu-search', fakeElement()],
    ['dash-stu-filter-month', fakeElement()],
    ['dash-stu-filter-class', fakeElement()],
    ['dash-stu-filter-status', fakeElement()]
  ])
  document.getElementById = id => elements.get(id) || null
  api.getZeroBalanceCount = async () => { throw new Error('fixture error') }

  try {
    assert.doesNotThrow(() => bindAdminDashboardEvents())
    await Promise.resolve()
    assert.ok(events.length >= 6, 'Các hook Pro phải nhận listener của bind')
  } finally {
    document.getElementById = originalGetElementById
    api.getZeroBalanceCount = originalZeroBalance
  }
})

test('palette Chart.js Pro dùng token tương ứng ở cả sáng và tối', () => {
  fixture()
  setUI('mochi')

  setTheme('light')
  assert.deepEqual(getAdminChartPalette(), {
    surfaceColor: '#ffffff',
    gridColor: '#e6dff5',
    tickColor: '#5e5674',
    legendTextColor: '#2b2340',
    emptyBg: '#f6f2ff',
    emptyBorder: '#e6dff5',
    accentCyan: '#1d5fbf',
    accentGold: '#a93a0c'
  })

  setTheme('dark')
  assert.deepEqual(getAdminChartPalette(), {
    surfaceColor: '#1e1a38',
    gridColor: '#3a3166',
    tickColor: '#b9b0da',
    legendTextColor: '#f4f0ff',
    emptyBg: '#28224a',
    emptyBorder: '#3a3166',
    accentCyan: '#8db8ff',
    accentGold: '#ffad7a'
  })
})

test('mọi rule trong dashboard.css đều được scope bằng cổng ADMIN Pro', () => {
  const selectors = collectRuleSelectors(dashboardCss)
  assert.ok(selectors.length > 0)
  for (const selectorList of selectors) {
    for (const selector of splitSelectorList(selectorList)) {
      assert.match(selector.trim(), /^html\[data-admin-ui="pro"\]/, `Selector chưa scope: ${selector.trim()}`)
    }
  }
  assert.match(dashboardCss, /@media\s*\(max-width:\s*900px\)/)
  assert.match(dashboardCss, /@media\s*\(max-width:\s*640px\)/)
  assert.match(dashboardCss, /overflow-x:\s*auto/)
})
