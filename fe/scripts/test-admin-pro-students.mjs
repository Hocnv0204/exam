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
  documentElement: {
    dataset: { theme: 'light' },
    style: {},
    getAttribute: attr => {
      if (attr === 'data-admin-ui') return saved.get('eduportal-ui') === 'mochi' ? 'pro' : null
      if (attr === 'data-theme') return saved.get('eduportal-theme') || 'light'
      return null
    }
  },
  addEventListener: () => {},
  dispatchEvent: () => {},
  querySelector: () => null,
  querySelectorAll: () => [],
  getElementById: () => null
}
globalThis.window = {
  location: { hash: '#students', search: '', origin: 'http://localhost', pathname: '/' },
  addEventListener: () => {},
  matchMedia: () => ({ matches: false }),
  open: () => null
}

const { state } = await import('../src/js/state.js')
const { setTheme } = await import('../src/js/theme.js')
const { renderStudentMgmtView } = await import('../src/js/views/student-mgmt.js')
const { renderStudentDetailsView } = await import('../src/js/views/student-details.js')
const {
  renderStudentReportView,
  renderClassicStudentReportView,
  renderSharedReportView,
  reportChartPalette
} = await import('../src/js/views/student-report.js')
const { renderTrialManagementView } = await import('../src/js/views/trial-management.js')
const { renderActivityLogsView } = await import('../src/js/views/activity-logs.js')

let renderWeeklyCalendarView, renderClassicWeeklyCalendarView, renderMochiWeeklyCalendarView
try {
  const mod = await import('../src/js/views/weekly-calendar.js')
  renderWeeklyCalendarView = mod.renderWeeklyCalendarView
  renderClassicWeeklyCalendarView = mod.renderClassicWeeklyCalendarView
  renderMochiWeeklyCalendarView = mod.renderMochiWeeklyCalendarView
} catch (err) {
  if (err.code === 'ERR_UNKNOWN_FILE_EXTENSION') {
    const { isMochiUI, isAdminProUI } = await import('../src/js/ui-flag.js')
    const { renderSidebar } = await import('../src/js/components/sidebar.js')
    const { renderNavbar } = await import('../src/js/components/navbar.js')
    const { renderMascot } = await import('../src/js/components/mascot.js')
    const { escapeHtml } = await import('../src/js/utils/download-helper.js')
    const calendarUtils = await import('../src/js/utils/weekly-calendar.js')
    const viewSource = readFileSync(new URL('../src/js/views/weekly-calendar.js', import.meta.url), 'utf8')
    const stripped = viewSource.replace(/^import[\s\S]*?from ['"][^'"]+['"]\n/gm, '').replace(/^export /gm, '')
    const dependencies = {
      renderSidebar,
      renderNavbar,
      state,
      isMochiUI,
      isAdminProUI,
      renderMascot,
      escapeHtml,
      mascotUrl: '',
      ...calendarUtils
    }
    const view = new Function(...Object.keys(dependencies), `${stripped}\nreturn { renderWeeklyCalendarView, renderClassicWeeklyCalendarView, renderMochiWeeklyCalendarView }`)(...Object.values(dependencies))
    renderWeeklyCalendarView = view.renderWeeklyCalendarView
    renderClassicWeeklyCalendarView = view.renderClassicWeeklyCalendarView
    renderMochiWeeklyCalendarView = view.renderMochiWeeklyCalendarView
  } else {
    throw err
  }
}

const scriptDir = dirname(fileURLToPath(import.meta.url))
const cssPath = resolve(scriptDir, '../src/css/admin-pro/pages/students.css')
const studentsCss = readFileSync(cssPath, 'utf8')

function fixtureAdmin() {
  state.token = 'admin-token'
  state.user = { id: 'admin-1', role: 'ADMIN', fullName: 'Thầy Hoàng', username: 'admin' }
  state.classes = [
    { id: 'class-1', name: 'Toán 12 Nâng Cao', tuitionFee: 150000, studentsCount: 20 },
    { id: 'class-2', name: 'Hóa 11 Cơ Bản', tuitionFee: 120000, studentsCount: 15 }
  ]
  state.students = [
    { id: 'st-1', fullName: 'Nguyễn Văn A', username: 'vana', classId: 'class-1', classIds: ['class-1'], status: 'Hoạt động', balance: 500000 },
    { id: 'st-2', fullName: 'Trần Thị B', username: 'thib', classId: 'class-1', classIds: ['class-1'], status: 'Hoạt động', balance: -200000 }
  ]
  setTheme('light')
}

function fixtureStudent() {
  state.token = 'student-token'
  state.user = { id: 'st-1', role: 'STUDENT', fullName: 'Nguyễn Văn A', username: 'vana' }
  state.classes = [
    { id: 'class-1', name: 'Toán 12 Nâng Cao' }
  ]
  state.students = []
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

test('(a) opt-out classic giữ nguyên root markup và id cũ của nhóm students', () => {
  fixtureAdmin()
  setUI('classic')

  window.location.hash = '#students'
  const studentMgmt = renderStudentMgmtView()
  assert.match(studentMgmt, /<div class="app-layout">/)
  assert.doesNotMatch(studentMgmt, /id="students"/)

  window.location.hash = '#student-details?studentId=st-1&classId=class-1'
  const studentDetails = renderStudentDetailsView()
  assert.match(studentDetails, /<div class="app-layout">/)
  assert.doesNotMatch(studentDetails, /id="student-details"/)

  window.location.hash = '#student-report?studentId=st-1&classId=class-1'
  const studentReport = renderStudentReportView()
  assert.match(studentReport, /<div class="app-layout">/)
  assert.doesNotMatch(studentReport, /id="student-report"/)

  window.location.hash = '#trial-management'
  const trialMgmt = renderTrialManagementView()
  assert.match(trialMgmt, /<div class="app-layout">/)
  assert.doesNotMatch(trialMgmt, /id="trial-management"/)

  window.location.hash = '#activity-logs'
  const activityLogs = renderActivityLogsView()
  assert.match(activityLogs, /<div class="app-layout">/)
  assert.doesNotMatch(activityLogs, /id="activity-logs"/)

  window.location.hash = '#weekly-calendar'
  const weeklyCalendar = renderWeeklyCalendarView()
  assert.match(weeklyCalendar, /<div class="app-layout navy-student">/)
  assert.doesNotMatch(weeklyCalendar, /id="weekly-calendar"/)

  window.location.search = '?ui=classic'
  assert.equal(renderStudentMgmtView(), studentMgmt, 'query opt-out không thay đổi output classic của student-mgmt')
  assert.equal(renderTrialManagementView(), trialMgmt, 'query opt-out không thay đổi output classic của trial-management')
})

test('(b) Pro có root hook mới và giữ toàn bộ id/data-* chức năng của classic cho cả 6 view', () => {
  fixtureAdmin()
  setUI('classic')

  window.location.hash = '#students'
  const classicMgmt = renderStudentMgmtView()

  window.location.hash = '#student-details?studentId=st-1&classId=class-1'
  const classicDetails = renderStudentDetailsView()

  window.location.hash = '#student-report?studentId=st-1&classId=class-1'
  const classicReport = renderStudentReportView()

  window.location.hash = '#trial-management'
  const classicTrial = renderTrialManagementView()

  window.location.hash = '#activity-logs'
  const classicLogs = renderActivityLogsView()

  window.location.hash = '#weekly-calendar'
  const classicCalendar = renderWeeklyCalendarView()

  setUI('mochi')

  window.location.hash = '#students'
  const proMgmt = renderStudentMgmtView()
  assert.match(proMgmt, /class="app-layout admin-dark" id="students" data-route="students" data-role="ADMIN"/)
  assertSuperset(functionalHooks(proMgmt), functionalHooks(classicMgmt), 'StudentMgmt Pro')

  window.location.hash = '#student-details?studentId=st-1&classId=class-1'
  const proDetails = renderStudentDetailsView()
  assert.match(proDetails, /class="app-layout admin-dark" id="student-details" data-route="student-details" data-role="ADMIN"/)
  assertSuperset(functionalHooks(proDetails), functionalHooks(classicDetails), 'StudentDetails Pro')

  window.location.hash = '#student-report?studentId=st-1&classId=class-1'
  const proReport = renderStudentReportView()
  assert.match(proReport, /class="app-layout admin-dark" id="student-report" data-route="student-report" data-role="ADMIN"/)
  assertSuperset(functionalHooks(proReport), functionalHooks(classicReport), 'StudentReport Pro')

  window.location.hash = '#trial-management'
  const proTrial = renderTrialManagementView()
  assert.match(proTrial, /class="app-layout admin-dark" id="trial-management" data-route="trial-management" data-role="ADMIN"/)
  assertSuperset(functionalHooks(proTrial), functionalHooks(classicTrial), 'TrialManagement Pro')

  window.location.hash = '#activity-logs'
  const proLogs = renderActivityLogsView()
  assert.match(proLogs, /class="app-layout admin-dark" id="activity-logs" data-route="activity-logs" data-role="ADMIN"/)
  assertSuperset(functionalHooks(proLogs), functionalHooks(classicLogs), 'ActivityLogs Pro')

  window.location.hash = '#weekly-calendar'
  const proCalendar = renderWeeklyCalendarView()
  assert.match(proCalendar, /class="app-layout navy-student admin-dark" id="weekly-calendar" data-route="weekly-calendar" data-role="ADMIN"/)
  assertSuperset(functionalHooks(proCalendar), functionalHooks(classicCalendar), 'WeeklyCalendar Pro')
})

test('học sinh render weekly-calendar/student-report và #shared-report KHÔNG chịu ảnh hưởng', () => {
  // 1. Học sinh với giao diện Mochi:
  fixtureStudent()
  setUI('mochi')

  window.location.hash = '#weekly-calendar'
  const studentCalendar = renderWeeklyCalendarView()
  assert.match(studentCalendar, /class="content-body m-weekly-calendar"/)
  assert.doesNotMatch(studentCalendar, /data-admin-ui="pro"|id="weekly-calendar"/, 'Học sinh không nhận hook Pro admin của weekly calendar')

  window.location.hash = '#student-report?studentId=st-1&classId=class-1'
  const studentReport = renderStudentReportView()
  assert.match(studentReport, /class="app-layout navy-student m-student-page m-report-page"/)
  assert.doesNotMatch(studentReport, /data-admin-ui="pro"|id="student-report"/, 'Học sinh không nhận hook Pro admin của student report')

  // 2. Trang chia sẻ công khai #shared-report
  window.location.hash = '#shared-report?token=fake-token'
  const shared = renderSharedReportView()
  assert.match(shared, /class="app-layout public-report-layout"/)
  assert.doesNotMatch(shared, /id="student-report"|data-role="ADMIN"/, 'Public report không nhận hook Pro admin')
})

test('palette Chart.js Pro trong student-report dùng token tương ứng ở cả sáng và tối', () => {
  fixtureAdmin()
  setUI('mochi')

  const proAdminCanvas = {
    closest: sel => sel.includes('admin-dark') && sel.includes('student-report')
  }

  // Light mode Pro:
  saved.set('eduportal-theme', 'light')
  globalThis.document.documentElement.dataset.theme = 'light'
  const lightPalette = reportChartPalette(proAdminCanvas)
  assert.equal(lightPalette.text, '#5e5674', 'Light text token --ap-muted')
  assert.equal(lightPalette.legend, '#2b2340', 'Light legend token --ap-ink')
  assert.equal(lightPalette.grid, '#e6dff5', 'Light grid token --ap-line')
  assert.equal(lightPalette.line, 'rgba(106, 76, 240, 0.85)', 'Light line token --ap-accent')

  // Dark mode Pro:
  saved.set('eduportal-theme', 'dark')
  globalThis.document.documentElement.dataset.theme = 'dark'
  const darkPalette = reportChartPalette(proAdminCanvas)
  assert.equal(darkPalette.text, '#b9b0da', 'Dark text token --ap-muted')
  assert.equal(darkPalette.legend, '#f4f0ff', 'Dark legend token --ap-ink')
  assert.equal(darkPalette.grid, 'rgba(58, 49, 102, 0.6)', 'Dark grid token')
  assert.equal(darkPalette.line, 'rgba(161, 141, 255, 0.85)', 'Dark line token --ap-accent')
})

test('(c) mọi rule trong students.css đều được scope bằng cổng html[data-admin-ui="pro"]', () => {
  const selectors = collectRuleSelectors(studentsCss)
  assert.ok(selectors.length > 0, 'Phải có ít nhất 1 selector trong students.css')
  for (const selectorList of selectors) {
    for (const selector of splitSelectorList(selectorList)) {
      assert.match(selector.trim(), /^html\[data-admin-ui="pro"\]/, `Selector chưa scope: ${selector.trim()}`)
    }
  }
  assert.match(studentsCss, /@media\s*\(max-width:\s*900px\)/, 'Phải có responsive breakpoint 900px')
  assert.match(studentsCss, /@media\s*\(max-width:\s*640px\)/, 'Phải có responsive breakpoint 640px')
  assert.match(studentsCss, /overflow-x:\s*auto/, 'Phải hỗ trợ cuộn ngang bảng overflow-x: auto')
})
