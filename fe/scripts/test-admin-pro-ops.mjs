import test from 'node:test'
import assert from 'node:assert/strict'
import { register } from 'node:module'
import { readFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

// Intercept .css and .svg imports during node test execution
register('data:text/javascript,' + encodeURIComponent(`
  export async function load(url, context, nextLoad) {
    if (url.endsWith('.css')) {
      return { format: 'module', shortCircuit: true, source: '' }
    }
    if (url.endsWith('.svg')) {
      return { format: 'module', shortCircuit: true, source: 'export default "test-mascot.svg";' }
    }
    return nextLoad(url, context)
  }
`))

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

let activeReportBodyHtml = ''

globalThis.document = {
  documentElement: {
    dataset: { theme: 'light' },
    style: {},
    getAttribute: attr => {
      if (attr === 'data-admin-ui') return saved.get('eduportal-ui') === 'mochi' ? 'pro' : null
      if (attr === 'data-ui') return saved.get('eduportal-ui') === 'mochi' ? 'mochi' : null
      if (attr === 'data-theme') return saved.get('eduportal-theme') || 'light'
      return null
    }
  },
  addEventListener: () => {},
  dispatchEvent: () => {},
  querySelector: () => null,
  querySelectorAll: () => [],
  getElementById: (id) => {
    if (id === 'student-report-body' || id === 'shared-report-body') {
      return {
        id,
        innerHTML: activeReportBodyHtml,
        set innerHTML(val) { activeReportBodyHtml = val },
        querySelector: () => null
      }
    }
    return null
  }
}

globalThis.window = {
  location: { hash: '#trial-management', search: '', origin: 'http://localhost', pathname: '/' },
  history: { replaceState: () => {}, pushState: () => {} },
  addEventListener: () => {},
  matchMedia: () => ({ matches: false }),
  open: () => null
}

const { state } = await import('../src/js/state.js')
const { setTheme } = await import('../src/js/theme.js')
const { api } = await import('../src/js/api.js')

const {
  renderTrialManagementView,
  renderClassicTrialManagementView,
  renderProTrialManagementView,
  bindTrialManagementEvents
} = await import('../src/js/views/trial-management.js')

const {
  renderWeeklyCalendarView,
  renderClassicWeeklyCalendarView,
  renderProWeeklyCalendarView,
  renderMochiWeeklyCalendarView,
  bindWeeklyCalendarEvents
} = await import('../src/js/views/weekly-calendar.js')

const {
  renderGradeBlocksView,
  renderClassicGradeBlocksView,
  renderProGradeBlocksView,
  bindGradeBlocksEvents
} = await import('../src/js/views/grade-blocks.js')

const {
  renderStudentReportView,
  renderClassicStudentReportView,
  renderProStudentReportView,
  renderSharedReportView,
  renderClassicReportInner,
  renderProReportInner,
  bindStudentReportEvents
} = await import('../src/js/views/student-report.js')

const scriptDir = dirname(fileURLToPath(import.meta.url))
const cssPath = resolve(scriptDir, '../src/css/admin-pro/pages/ops.css')
const opsCss = readFileSync(cssPath, 'utf8')

function fixtureAdmin() {
  state.token = 'admin-token'
  state.user = { id: 'admin-1', role: 'ADMIN', fullName: 'Thầy Hoàng', username: 'admin' }
  state.classes = [
    { id: 'class-1', name: 'Toán 12 Nâng Cao', gradeBlock: '12-Toán', tuitionFee: 150000, studentsCount: 20 },
    { id: 'class-2', name: 'Hóa 11 Cơ Bản', gradeBlock: '11-Hóa', tuitionFee: 120000, studentsCount: 15 }
  ]
  state.students = [
    { id: 'st-1', fullName: 'Nguyễn Văn A', username: 'vana', classIds: ['class-1'], status: 'ACTIVE' },
    { id: 'st-2', fullName: 'Trần Thị B', username: 'thib', classIds: ['class-1'], status: 'ACTIVE' }
  ]
  setTheme('light')
}

function fixtureStudent() {
  state.token = 'student-token'
  state.user = { id: 'st-1', role: 'STUDENT', fullName: 'Nguyễn Văn A', username: 'vana' }
  state.classes = [
    { id: 'class-1', name: 'Toán 12 Nâng Cao', gradeBlock: '12-Toán', tuitionFee: 150000, studentsCount: 20 }
  ]
  state.students = []
  setTheme('light')
}

function setUI(value, query = '') {
  saved.set('eduportal-ui', value)
  window.location.search = query
  if (value === 'mochi') {
    document.documentElement.dataset.ui = 'mochi'
  } else {
    delete document.documentElement.dataset.ui
  }
}

function functionalHooks(markup) {
  const hooks = new Set()
  for (const match of markup.matchAll(/\bid="([^"]+)"/g)) hooks.add(`id:${match[1]}`)
  for (const match of markup.matchAll(/\b(data-[\w-]+)(?:=|\s|>)/g)) hooks.add(match[1])
  // Bộ chọn 4 chế độ màu admin (data-admin-palette-option) thay nút Sáng/Tối (data-theme-toggle) của classic.
  if (hooks.has('data-admin-palette-option')) hooks.add('data-theme-toggle')
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

function createMockElement(id = '', tag = 'div', store = null) {
  const el = {
    id,
    tagName: tag.toUpperCase(),
    dataset: {},
    classList: {
      _classes: new Set(),
      add: (...c) => c.forEach(x => el.classList._classes.add(x)),
      remove: (...c) => c.forEach(x => el.classList._classes.delete(x)),
      contains: (c) => Boolean(el.classList._classes.has(c)),
      toggle: (c) => el.classList._classes.has(c) ? el.classList._classes.delete(c) : el.classList._classes.add(c)
    },
    style: {},
    value: '',
    children: [],
    isConnected: true,
    addEventListener: () => {},
    removeEventListener: () => {},
    appendChild: (child) => { el.children.push(child); return child },
    removeChild: (child) => {
      const idx = el.children.indexOf(child)
      if (idx >= 0) el.children.splice(idx, 1)
      return child
    },
    querySelector: (sel) => {
      if (sel && sel.startsWith('#')) {
        const targetId = sel.slice(1)
        if (store && store.has(targetId)) return store.get(targetId)
        return createMockElement(targetId, 'div', store)
      }
      return createMockElement('', 'div', store)
    },
    querySelectorAll: () => [],
    getAttribute: (name) => el[name] || '',
    setAttribute: (name, val) => { el[name] = val },
    removeAttribute: (name) => { delete el[name] },
    closest: () => null,
    getContext: () => ({
      clearRect: () => {},
      beginPath: () => {},
      moveTo: () => {},
      lineTo: () => {},
      stroke: () => {},
      fill: () => {},
      arc: () => {},
      closePath: () => {},
      fillText: () => {},
      measureText: () => ({ width: 40 })
    })
  }
  return el
}

test('(a) cờ tắt → output renderer cũ y hệt (so với hàm cũ)', () => {
  fixtureAdmin()
  setUI('classic')

  // 1. Trial Management
  window.location.hash = '#trial-management'
  const trialHtml = renderTrialManagementView()
  const trialClassicExpected = renderClassicTrialManagementView()
  assert.equal(trialHtml, trialClassicExpected, 'TrialManagement khi cờ tắt phải trả về output classic y hệt')
  assert.match(trialHtml, /class="app-layout"/)
  assert.doesNotMatch(trialHtml, /id="trial-management"/)

  // 2. Weekly Calendar (ADMIN)
  window.location.hash = '#weekly-calendar'
  const weeklyHtml = renderWeeklyCalendarView()
  const weeklyClassicExpected = renderClassicWeeklyCalendarView()
  assert.equal(weeklyHtml, weeklyClassicExpected, 'WeeklyCalendar ADMIN khi cờ tắt phải trả về output classic y hệt')
  assert.match(weeklyHtml, /class="app-layout navy-student"/)

  // 3. Grade Blocks
  window.location.hash = '#grade-blocks'
  const gradeBlocksHtml = renderGradeBlocksView()
  const gradeBlocksClassicExpected = renderClassicGradeBlocksView()
  assert.equal(gradeBlocksHtml, gradeBlocksClassicExpected, 'GradeBlocks khi cờ tắt phải trả về output classic y hệt')
  assert.match(gradeBlocksHtml, /class="app-layout"/)
  assert.doesNotMatch(gradeBlocksHtml, /id="grade-blocks"/)

  // 4. Student Report (ADMIN)
  window.location.hash = '#student-report?studentId=st-1'
  const reportHtml = renderStudentReportView()
  const reportClassicExpected = renderClassicStudentReportView()
  assert.equal(reportHtml, reportClassicExpected, 'StudentReport ADMIN khi cờ tắt phải trả về output classic y hệt')

  // Query opt-out ?ui=classic khi eduportal-ui là mochi
  setUI('mochi', '?ui=classic')
  assert.equal(renderTrialManagementView(), trialClassicExpected, 'opt-out ?ui=classic cho trial-management')
  assert.equal(renderWeeklyCalendarView(), weeklyClassicExpected, 'opt-out ?ui=classic cho weekly-calendar')
  assert.equal(renderGradeBlocksView(), gradeBlocksClassicExpected, 'opt-out ?ui=classic cho grade-blocks')
  assert.equal(renderStudentReportView(), reportClassicExpected, 'opt-out ?ui=classic cho student-report')
})

test('(b) cờ bật → có các khối chính của bố cục mới; TẬP id + data-* chức năng của bản Pro ⊇ bản cũ cùng dữ liệu', () => {
  fixtureAdmin()
  setUI('classic')

  // Lấy snapshot classic
  window.location.hash = '#trial-management'
  const classicTrial = renderTrialManagementView()

  window.location.hash = '#weekly-calendar'
  const classicWeekly = renderWeeklyCalendarView()

  window.location.hash = '#grade-blocks'
  const classicGradeBlocks = renderGradeBlocksView()

  // Chuyển sang Mochi Pro
  setUI('mochi')

  // 1. Quản lý học thử (Trial Management Pro)
  window.location.hash = '#trial-management'
  const proTrial = renderTrialManagementView()

  // Root hooks
  assert.match(proTrial, /id="trial-management" data-route="trial-management" data-role="ADMIN"/, 'Root Pro Trial')

  // Header & Controls
  assert.match(proTrial, /class="page-header"/, 'Header Pro Trial')
  assert.match(proTrial, /Quản lý học thử/, 'Tiêu đề trang')

  // KPI cards
  assert.match(proTrial, /id="trial-kpis"/, 'Container KPI')

  // Toolbar bộ lọc
  assert.match(proTrial, /id="trial-filter-q"/, 'Ô tìm kiếm')
  assert.match(proTrial, /id="trial-filter-class"/, 'Lọc theo lớp')
  assert.match(proTrial, /id="trial-filter-chapter"/, 'Lọc theo chuyên đề')
  assert.match(proTrial, /id="trial-filter-status"/, 'Lọc theo trạng thái')
  assert.match(proTrial, /id="trial-filter-video"/, 'Lọc theo video')
  assert.match(proTrial, /id="btn-trial-reset-filters-top"/, 'Nút xóa bộ lọc')

  // Danh sách & table container
  assert.match(proTrial, /id="trial-count"/, 'Tổng số kết quả')
  assert.match(proTrial, /id="trial-notice"/, 'Khu vực thông báo')
  assert.match(proTrial, /id="trial-mgmt-list"/, 'Danh sách quản lý bài học thử')
  assert.match(proTrial, /class="card ap-card ap-trial-table-card"/, 'Thẻ bọc bảng bài học Pro')

  // Superset hook check
  assertSuperset(functionalHooks(proTrial), functionalHooks(classicTrial), 'TrialManagement Pro')

  // 2. Lịch tuần ADMIN (Weekly Calendar Pro)
  window.location.hash = '#weekly-calendar'
  const proWeekly = renderWeeklyCalendarView()

  // Root hooks
  assert.match(proWeekly, /id="weekly-calendar" data-route="weekly-calendar" data-role="ADMIN"/, 'Root Pro Weekly Calendar')

  // Header & Controls
  assert.match(proWeekly, /Lịch tuần đào tạo/, 'Tiêu đề Lịch tuần')
  assert.match(proWeekly, /id="wc-export"/, 'Nút xuất lịch .ics')
  assert.match(proWeekly, /href="#homework-mgmt"/, 'Link giao bài tập')

  // Filter toolbar
  assert.match(proWeekly, /id="wc-prev"/, 'Nút tuần trước')
  assert.match(proWeekly, /id="wc-today"/, 'Nút tuần này')
  assert.match(proWeekly, /id="wc-next"/, 'Nút tuần sau')
  assert.match(proWeekly, /id="wc-range"/, 'Nhãn khoảng tuần')
  assert.match(proWeekly, /id="wc-class"/, 'Dropdown lọc lớp')

  // Meets & Tuần
  assert.match(proWeekly, /id="wc-status"/, 'Trạng thái tải lịch')
  assert.match(proWeekly, /id="wc-content"/, 'Khung nội dung tuần')
  assert.match(proWeekly, /id="wc-meet-heading"/, 'Tiêu đề link Meet')
  assert.match(proWeekly, /id="wc-meet-content"/, 'Container danh sách Meet')

  // Superset hook check
  assertSuperset(functionalHooks(proWeekly), functionalHooks(classicWeekly), 'WeeklyCalendar Pro')

  // 3. Khối lớp (Grade Blocks Pro)
  window.location.hash = '#grade-blocks'
  const proGradeBlocks = renderGradeBlocksView()

  // Root hooks
  assert.match(proGradeBlocks, /id="grade-blocks" data-route="grade-blocks" data-role="ADMIN"/, 'Root Pro GradeBlocks')

  // Header & Actions
  assert.match(proGradeBlocks, /Quản lý khối học/, 'Tiêu đề Khối học')
  assert.match(proGradeBlocks, /id="open-create-block-modal-btn"/, 'Nút thêm khối lớp')

  // 3 KPI cards
  assert.match(proGradeBlocks, /Tổng số khối học/, 'KPI Tổng số khối học')
  assert.match(proGradeBlocks, /Lớp học đã phân khối/, 'KPI Lớp áp dụng')
  assert.match(proGradeBlocks, /Câu hỏi trong ngân hàng/, 'KPI Số câu hỏi')

  // Toolbar & Table
  assert.match(proGradeBlocks, /id="grade-block-search-input"/, 'Ô tìm kiếm khối lớp')
  assert.match(proGradeBlocks, /id="refresh-grade-blocks-btn"/, 'Nút làm mới khối lớp')
  assert.match(proGradeBlocks, /id="grade-blocks-table-body"/, 'Tbody khối lớp')
  assert.match(proGradeBlocks, /id="grade-block-pagination-wrapper"/, 'Khung phân trang')

  // Superset hook check
  assertSuperset(functionalHooks(proGradeBlocks), functionalHooks(classicGradeBlocks), 'GradeBlocks Pro')

  // 4. Báo cáo tiến độ ADMIN (Student Report Pro Inner)
  const dummyOpts = {
    studentName: 'Nguyễn Văn A',
    className: 'Toán 12',
    period: { fromDate: '2026-03-01', toDate: '2026-03-31', days: 30 },
    summary: {
      assignedCount: 10,
      submittedCount: 8,
      completionRate: 0.8,
      onTimeRate: 0.9,
      averageScore: 8.5,
      highestScore: 10,
      lowestScore: 6,
      activeDays: 12,
      attemptCount: 15
    },
    comparison: { trend: 'IMPROVING' },
    scoreTrend: [{ title: 'Bài 1', score: 8, date: '2026-03-05' }],
    topicBreakdown: [{ topic: 'Hàm số', count: 5, avg: 8.2 }],
    submissions: [
      { id: 'sub-1', test_title: 'Kiểm tra 15p', score: 9, max_score: 10, passed: true, created_at: '2026-03-01T10:00:00Z', duration_seconds: 600 }
    ],
    isEmpty: false
  }

  const classicReportInner = renderClassicReportInner(dummyOpts, { includeSharePanel: true })
  const proReportInner = renderProReportInner(dummyOpts, { includeSharePanel: true })

  // Bộ chọn khoảng ngày
  assert.match(proReportInner, /id="report-filter-from"/, 'Input ngày bắt đầu')
  assert.match(proReportInner, /id="report-filter-to"/, 'Input ngày kết thúc')
  assert.match(proReportInner, /id="btn-report-update-date"/, 'Nút cập nhật ngày')

  // 8 thẻ KPI
  assert.match(proReportInner, /Bài được giao/, 'KPI Bài được giao')
  assert.match(proReportInner, /Bài đã nộp/, 'KPI Bài đã nộp')
  assert.match(proReportInner, /Tỷ lệ hoàn thành/, 'KPI Tỷ lệ hoàn thành')
  assert.match(proReportInner, /Nộp đúng hạn/, 'KPI Nộp đúng hạn')
  assert.match(proReportInner, /Điểm trung bình/, 'KPI Điểm trung bình')
  assert.match(proReportInner, /Điểm cao nhất/, 'KPI Điểm cao nhất')
  assert.match(proReportInner, /Điểm thấp nhất/, 'KPI Điểm thấp nhất')
  assert.match(proReportInner, /Ngày hoạt động/, 'KPI Ngày hoạt động')

  // Trend Chart, So sánh nửa kỳ, Phân tích chương, Lượt nộp
  assert.match(proReportInner, /id="report-trend-chart"/, 'Canvas biểu đồ xu hướng')
  assert.match(proReportInner, /So sánh nửa kỳ/, 'Tiêu đề so sánh nửa kỳ')
  assert.match(proReportInner, /Phân tích theo chương/, 'Tiến độ theo chương')
  assert.match(proReportInner, /Danh sách lượt nộp/, 'Danh sách lượt nộp')

  // Panel chia sẻ báo cáo + QR + handler
  assert.match(proReportInner, /class="[^"]*report-share-panel[^"]*"/, 'Thẻ chia sẻ báo cáo')
  assert.match(proReportInner, /id="share-create-btn"/, 'Nút tạo link chia sẻ')
  assert.match(proReportInner, /id="share-expiry-days"/, 'Hạn sử dụng link')
  assert.match(proReportInner, /id="report-share-link"/, 'Ô link chia sẻ')
  assert.match(proReportInner, /id="share-copy-btn"/, 'Nút copy link chia sẻ')
  assert.match(proReportInner, /id="report-share-qr-img"/, 'Ảnh QR code')
  assert.match(proReportInner, /id="share-qr-download-btn"/, 'Nút tải QR PNG')

  // Superset hook check for Student Report Inner
  assertSuperset(functionalHooks(proReportInner), functionalHooks(classicReportInner), 'StudentReport Pro Inner')
})

test('(c) assertion học sinh và #shared-report không bị ảnh hưởng', () => {
  // 1. Học sinh truy cập Weekly Calendar -> phải là giao diện học sinh, không bị Admin Pro chiếm
  fixtureStudent()
  setUI('mochi')

  window.location.hash = '#weekly-calendar'
  const studentWeeklyHtml = renderWeeklyCalendarView()
  assert.doesNotMatch(studentWeeklyHtml, /data-role="ADMIN"/, 'Học sinh không mang data-role ADMIN')
  assert.doesNotMatch(studentWeeklyHtml, /Lịch tuần đào tạo/, 'Học sinh không render tiêu đề Lịch tuần đào tạo của admin')
  assert.match(studentWeeklyHtml, /id="weekly-calendar-root"/, 'Học sinh có container lịch cá nhân')
  assert.match(studentWeeklyHtml, /m-weekly-calendar/, 'Học sinh dùng class m-weekly-calendar')

  // 2. Học sinh truy cập Student Report -> render giao diện báo cáo học sinh Mochi
  window.location.hash = '#student-report'
  const studentReportHtml = renderStudentReportView()
  assert.match(studentReportHtml, /id="student-report-body"/, 'Học sinh có container body')
  assert.match(studentReportHtml, /class="[^"]*m-page-wrap[^"]*"/, 'Học sinh hiển thị layout Mochi với m-page-wrap')
  assert.doesNotMatch(studentReportHtml, /report-share-panel/, 'Học sinh không có panel chia sẻ của admin')

  // 3. Trang công khai #shared-report (không đăng nhập hoặc token công khai)
  window.location.hash = '#shared-report?token=123e4567-e89b-12d3-a456-426614174000.AbCdEfGhIjKlMnOpQrStUvWxYz0123456789_-abcde'
  const sharedReportHtml = renderSharedReportView()
  assert.match(sharedReportHtml, /id="shared-report-body"/, 'Trang công khai có id shared-report-body')
  assert.match(sharedReportHtml, /public-report-layout/, 'Trang công khai có class public-report-layout')
  assert.doesNotMatch(sharedReportHtml, /report-share-panel/, 'Trang công khai không chứa control quản trị share')
})

test('(d) gọi hàm bind trên DOM Pro giả lập không ném lỗi', () => {
  fixtureAdmin()
  setUI('mochi')

  const domElements = new Map()

  // Nạp toàn bộ DOM ID từ các view Pro
  window.location.hash = '#trial-management'
  const trialHtml = renderTrialManagementView()
  for (const m of trialHtml.matchAll(/\bid="([^"]+)"/g)) domElements.set(m[1], createMockElement(m[1], 'div', domElements))

  window.location.hash = '#weekly-calendar'
  const weeklyHtml = renderWeeklyCalendarView()
  for (const m of weeklyHtml.matchAll(/\bid="([^"]+)"/g)) domElements.set(m[1], createMockElement(m[1], 'div', domElements))

  window.location.hash = '#grade-blocks'
  const gradeBlocksHtml = renderGradeBlocksView()
  for (const m of gradeBlocksHtml.matchAll(/\bid="([^"]+)"/g)) domElements.set(m[1], createMockElement(m[1], 'div', domElements))

  const dummyOpts = {
    studentName: 'Nguyễn Văn A',
    className: 'Toán 12',
    period: { fromDate: '2026-03-01', toDate: '2026-03-31', days: 30 },
    summary: { assignedCount: 1, submittedCount: 1, completionRate: 1, averageScore: 9 },
    comparison: { trend: 'STABLE' },
    scoreTrend: [],
    topicBreakdown: [],
    submissions: [{ id: 'sub-1', test_title: 'Kiểm tra', score: 8, max_score: 10, passed: true, created_at: '2026-03-01T10:00:00Z', duration_seconds: 600 }],
    isEmpty: false
  }
  const reportInnerHtml = renderProReportInner(dummyOpts, { includeSharePanel: true })
  for (const m of reportInnerHtml.matchAll(/\bid="([^"]+)"/g)) domElements.set(m[1], createMockElement(m[1], 'div', domElements))

  // Mock global DOM methods
  const origGetElementById = document.getElementById
  const origQuerySelectorAll = document.querySelectorAll
  const origQuerySelector = document.querySelector
  const origCreateElement = document.createElement

  document.getElementById = (id) => domElements.get(id) || createMockElement(id, 'div', domElements)
  document.querySelectorAll = () => []
  document.querySelector = (sel) => {
    if (sel && sel.startsWith('#')) {
      const targetId = sel.slice(1)
      return domElements.get(targetId) || createMockElement(targetId, 'div', domElements)
    }
    return createMockElement('', 'div', domElements)
  }
  document.createElement = (tag) => createMockElement('', tag, domElements)

  // Mock API methods
  const origGetTrialCatalog = api.getTrialCatalog
  const origGetWeeklyCalendar = api.getWeeklyCalendar
  const origGetGradeBlocks = api.getGradeBlocks
  const origGetStudentReport = api.getStudentReport

  api.getTrialCatalog = async () => ({ ok: true, data: { lessons: [], classes: [], chapters: [] } })
  api.getWeeklyCalendar = async () => ({ ok: true, data: { days: [], events: [], meets: [] } })
  api.getGradeBlocks = async () => ({ ok: true, data: [] })
  api.getStudentReport = async () => ({ ok: true, data: dummyOpts })

  try {
    assert.doesNotThrow(() => {
      bindTrialManagementEvents()
    }, 'bindTrialManagementEvents không được ném lỗi trên DOM Pro')

    assert.doesNotThrow(() => {
      bindWeeklyCalendarEvents()
    }, 'bindWeeklyCalendarEvents không được ném lỗi trên DOM Pro')

    assert.doesNotThrow(() => {
      bindGradeBlocksEvents()
    }, 'bindGradeBlocksEvents không được ném lỗi trên DOM Pro')

    assert.doesNotThrow(() => {
      bindStudentReportEvents()
    }, 'bindStudentReportEvents không được ném lỗi trên DOM Pro')
  } finally {
    document.getElementById = origGetElementById
    document.querySelectorAll = origQuerySelectorAll
    document.querySelector = origQuerySelector
    document.createElement = origCreateElement

    api.getTrialCatalog = origGetTrialCatalog
    api.getWeeklyCalendar = origGetWeeklyCalendar
    api.getGradeBlocks = origGetGradeBlocks
    api.getStudentReport = origGetStudentReport
  }
})

test('(e) dữ liệu rỗng/lỗi không crash', () => {
  fixtureAdmin()
  setUI('mochi')

  // 1. Trial management với state rỗng
  assert.doesNotThrow(() => {
    const html = renderTrialManagementView()
    assert.match(html, /id="trial-mgmt-list"/)
  }, 'Trial Management không crash khi rỗng')

  // 2. Weekly Calendar không có lớp nào
  state.classes = []
  assert.doesNotThrow(() => {
    const html = renderWeeklyCalendarView()
    assert.match(html, /id="wc-content"/)
  }, 'Weekly Calendar không crash khi classes rỗng')

  // 3. Student Report dữ liệu null/rỗng
  assert.doesNotThrow(() => {
    const emptyInner = renderProReportInner({
      studentName: 'Chưa có tên',
      className: '',
      period: { fromDate: '', toDate: '', days: 0 },
      summary: {},
      comparison: {},
      scoreTrend: [],
      topicBreakdown: [],
      submissions: [],
      isEmpty: true
    }, { includeSharePanel: true })
    assert.match(emptyInner, /Chưa có lượt nộp nào trong kỳ báo cáo/)
  }, 'Student Report Pro không crash khi không có submissions')
})

test('(f) mọi rule CSS mới có tiền tố html[data-admin-ui="pro"]', () => {
  const selectors = collectRuleSelectors(opsCss)
  assert.ok(selectors.length > 0, 'Phải có ít nhất 1 selector trong ops.css')

  for (const selectorList of selectors) {
    for (const selector of splitSelectorList(selectorList)) {
      const trimmed = selector.trim()
      assert.match(trimmed, /^html\[data-admin-ui="pro"\]/, `Selector chưa scope: ${trimmed}`)
    }
  }

  assert.match(opsCss, /@media\s*\(max-width:\s*900px\)/, 'Phải có responsive breakpoint 900px')
  assert.match(opsCss, /@media\s*\(max-width:\s*640px\)/, 'Phải có responsive breakpoint 640px')
  assert.match(opsCss, /overflow-x:\s*auto/, 'Phải hỗ trợ cuộn ngang bảng overflow-x: auto')

  // Không được dùng giá trị màu cứng hex
  const hexPropertyValues = opsCss.match(/:\s*#[0-9a-fA-F]{3,8}/g) || []
  assert.equal(hexPropertyValues.length, 0, `Không được dùng màu cứng hex: ${hexPropertyValues.join(', ')}`)
})
