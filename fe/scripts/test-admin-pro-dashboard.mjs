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
const { renderAdminDashboardView, getAdminChartPalette } = await import('../src/js/views/admin-dashboard.js')
const { renderTuitionLedgerView } = await import('../src/js/views/tuition-ledger.js')

const scriptDir = dirname(fileURLToPath(import.meta.url))
const cssPath = resolve(scriptDir, '../src/css/admin-pro/pages/dashboard.css')
const dashboardCss = readFileSync(cssPath, 'utf8')

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

test('opt-out classic giữ nguyên root markup cũ của dashboard và sổ học phí', () => {
  fixture()
  setUI('classic')

  window.location.hash = '#admin-dashboard'
  const dashboard = renderAdminDashboardView()
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
  assertSuperset(functionalHooks(proDashboard), functionalHooks(classicDashboard), 'Dashboard Pro')

  window.location.hash = '#tuition-ledger'
  const proLedger = renderTuitionLedgerView()
  assert.match(proLedger, /class="app-layout admin-dark" id="tuition-ledger" data-route="tuition-ledger" data-role="ADMIN"/)
  assertSuperset(functionalHooks(proLedger), functionalHooks(classicLedger), 'Sổ học phí Pro')
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
