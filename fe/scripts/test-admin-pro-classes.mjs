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
  location: { hash: '#classes-admin', search: '', origin: 'http://localhost', pathname: '/' },
  addEventListener: () => {},
  matchMedia: () => ({ matches: false }),
  open: () => null
}

const { state } = await import('../src/js/state.js')
const { setTheme } = await import('../src/js/theme.js')
const { api } = await import('../src/js/api.js')
const {
  renderClassMgmtView,
  renderClassicClassMgmtView,
  bindClassMgmtEvents
} = await import('../src/js/views/class-mgmt.js')
const {
  renderClassDetailsView,
  renderClassicClassDetailsView,
  bindClassDetailsEvents
} = await import('../src/js/views/class-details.js')
const { renderCurriculumView } = await import('../src/js/views/curriculum.js')
const { renderGradeBlocksView } = await import('../src/js/views/grade-blocks.js')

const scriptDir = dirname(fileURLToPath(import.meta.url))
const cssPath = resolve(scriptDir, '../src/css/admin-pro/pages/classes.css')
const classesCss = readFileSync(cssPath, 'utf8')

function fixture() {
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

test('(a) cờ tắt → output renderer cũ y hệt (so với hàm cũ)', () => {
  fixture()
  setUI('classic')

  window.location.hash = '#classes-admin'
  const classMgmt = renderClassMgmtView()
  const classicMgmtExpected = renderClassicClassMgmtView()
  assert.equal(classMgmt, classicMgmtExpected, 'ClassMgmt khi cờ tắt phải trả về output classic y hệt')
  assert.match(classMgmt, /<div class="app-layout">/)
  assert.doesNotMatch(classMgmt, /id="classes-admin"/)

  window.location.hash = '#class-details?classId=class-1'
  const classDetails = renderClassDetailsView()
  const curClass = state.classes[0]
  const classStudents = state.students.filter(s => s.classIds?.includes('class-1'))
  const shortId = `${curClass.id.substring(0, 8)}...${curClass.id.substring(curClass.id.length - 4)}`
  const classicDetailsExpected = renderClassicClassDetailsView(curClass, classStudents, shortId)
  assert.equal(classDetails, classicDetailsExpected, 'ClassDetails khi cờ tắt phải trả về output classic y hệt')
  assert.match(classDetails, /<div class="app-layout">/)
  assert.doesNotMatch(classDetails, /id="class-details"/)

  window.location.hash = '#curriculum'
  const curriculum = renderCurriculumView()
  assert.match(curriculum, /<div class="app-layout">/)
  assert.doesNotMatch(curriculum, /id="curriculum"/)

  window.location.hash = '#grade-blocks'
  const gradeBlocks = renderGradeBlocksView()
  assert.match(gradeBlocks, /<div class="app-layout">/)
  assert.doesNotMatch(gradeBlocks, /id="grade-blocks"/)

  // Query opt-out ?ui=classic
  setUI('mochi', '?ui=classic')
  window.location.hash = '#classes-admin'
  assert.equal(renderClassMgmtView(), classicMgmtExpected, 'query opt-out không thay đổi output classic của class-mgmt')

  window.location.hash = '#class-details?classId=class-1'
  assert.equal(renderClassDetailsView(), classicDetailsExpected, 'query opt-out không thay đổi output classic của class-details')
})

test('(b) cờ bật → có các khối chính của bố cục mới; TẬP id + data-* chức năng của bản Pro ⊇ bản cũ cùng dữ liệu', () => {
  fixture()
  setUI('classic')

  window.location.hash = '#classes-admin'
  const classicMgmt = renderClassMgmtView()

  window.location.hash = '#class-details?classId=class-1'
  const classicDetails = renderClassDetailsView()

  window.location.hash = '#curriculum'
  const classicCurriculum = renderCurriculumView()

  window.location.hash = '#grade-blocks'
  const classicGradeBlocks = renderGradeBlocksView()

  setUI('mochi')

  // 1. Quản lý lớp học (ClassMgmt Pro)
  window.location.hash = '#classes-admin'
  const proMgmt = renderClassMgmtView()

  // Root hooks
  assert.match(proMgmt, /class="app-layout admin-dark" id="classes-admin" data-route="classes-admin" data-role="ADMIN"/, 'Root Pro ClassMgmt')

  // Header & action buttons
  assert.match(proMgmt, /class="page-header ap-classes-header"/, 'Header Pro')
  assert.match(proMgmt, /id="open-manage-grade-blocks-btn"/, 'Nút quản lý khối học')
  assert.match(proMgmt, /id="open-create-class-btn"/, 'Nút tạo lớp học mới')
  assert.match(proMgmt, /href="#curriculum"/, 'Link chương trình học')

  // 4 KPI cards
  assert.match(proMgmt, /class="ap-classes-kpi-grid"/, 'Grid KPI lớp học')
  assert.match(proMgmt, /Tổng số lớp học/, 'KPI Tổng số lớp học')
  assert.match(proMgmt, /Học sinh đang học/, 'KPI Học sinh đang học')
  assert.match(proMgmt, /Khối học áp dụng/, 'KPI Khối học áp dụng')
  assert.match(proMgmt, /Học phí TB \/ buổi/, 'KPI Học phí TB / buổi')

  // Toolbar bộ lọc & chuyển đổi chế độ xem
  assert.match(proMgmt, /class="card ap-filter-card"/, 'Toolbar bộ lọc')
  assert.match(proMgmt, /id="class-search-input"/, 'Ô tìm kiếm lớp')
  assert.match(proMgmt, /class="ap-chip-scroller"/, 'Dải chip khối học')
  assert.match(proMgmt, /data-block="ALL"/, 'Chip khối tất cả')
  assert.match(proMgmt, /id="btn-view-card"/, 'Nút chế độ Lưới')
  assert.match(proMgmt, /id="btn-view-table"/, 'Nút chế độ Bảng')
  assert.match(proMgmt, /id="class-count-summary"/, 'Tổng số hiển thị')

  // Danh sách thẻ lớp học & Thẻ tạo mới viền đứt
  assert.match(proMgmt, /id="classes-cards-grid"/, 'Lưới thẻ lớp học')
  assert.match(proMgmt, /id="card-create-class-trigger"/, 'Thẻ + Tạo lớp mới viền đứt')
  assert.match(proMgmt, /class="[^"]*ap-class-card[^"]*"/, 'Thẻ lớp học Mochi Pro')

  // Bảng lớp học & Trạng thái trống
  assert.match(proMgmt, /id="classes-table-container"/, 'Khung bảng lớp học')
  assert.match(proMgmt, /id="classes-table-body"/, 'Tbody bảng lớp học')
  assert.match(proMgmt, /id="classes-empty-state"/, 'Trạng thái trống')
  assert.match(proMgmt, /id="btn-empty-create-class"/, 'Nút CTA tạo lớp khi trống')

  // Superset hook check
  assertSuperset(functionalHooks(proMgmt), functionalHooks(classicMgmt), 'ClassMgmt Pro')

  // 2. Chi tiết lớp học (ClassDetails Pro)
  window.location.hash = '#class-details?classId=class-1'
  const proDetails = renderClassDetailsView()

  // Root hooks
  assert.match(proDetails, /class="app-layout admin-dark" id="class-details" data-route="class-details" data-role="ADMIN"/, 'Root Pro ClassDetails')

  // Top Breadcrumb & Switcher
  assert.match(proDetails, /class="[^"]*ap-details-breadcrumb[^"]*"/, 'Breadcrumb Pro')
  assert.match(proDetails, /href="#classes-admin"/, 'Link quay lại danh sách lớp')
  assert.match(proDetails, /id="quick-class-switcher"/, 'Dropdown chuyển lớp nhanh')
  assert.match(proDetails, /id="btn-edit-class-info"/, 'Nút sửa thông tin lớp')

  // Hero Card
  assert.match(proDetails, /class="[^"]*ap-class-hero[^"]*"/, 'Hero card chi tiết lớp')
  assert.match(proDetails, /class="[^"]*ap-hero-avatar[^"]*"/, 'Avatar khối lớp')
  assert.match(proDetails, /class="[^"]*class-title-heading[^"]*"/, 'Tiêu đề lớp')
  assert.match(proDetails, /id="btn-copy-class-id"/, 'Nút sao chép mã lớp')
  assert.match(proDetails, /id="header-student-count"/, 'Số lượng học sinh trên hero')

  // 5 KPI Cards
  assert.match(proDetails, /class="[^"]*ap-details-kpi-grid[^"]*"/, 'Grid 5 KPI chi tiết lớp')
  assert.match(proDetails, /id="kpi-total-sessions"/, 'KPI tổng số buổi')
  assert.match(proDetails, /id="kpi-unpaid-tuition"/, 'KPI học phí chưa thu')
  assert.match(proDetails, /id="kpi-unpaid-students-count"/, 'KPI số học sinh nợ')
  assert.match(proDetails, /id="kpi-month-sessions"/, 'KPI buổi trong tháng')
  assert.match(proDetails, /id="kpi-latest-session-date"/, 'KPI ngày học gần nhất')
  assert.match(proDetails, /id="kpi-open-homeworks"/, 'KPI bài tập đang mở')

  // Pill Tabs Navigation
  assert.match(proDetails, /class="[^"]*ap-details-tabs-bar[^"]*"/, 'Thanh tab pill')
  assert.match(proDetails, /data-tab="students"/, 'Tab học sinh')
  assert.match(proDetails, /data-tab="curriculum"/, 'Tab chương trình')
  assert.match(proDetails, /data-tab="attendance"/, 'Tab điểm danh')
  assert.match(proDetails, /data-tab="tuition"/, 'Tab học phí')
  assert.match(proDetails, /data-tab="homework"/, 'Tab bài tập')
  assert.match(proDetails, /data-tab="settings"/, 'Tab cài đặt')
  assert.match(proDetails, /id="class-tab-content-container"/, 'Khung chứa nội dung tab')

  // Superset hook check for details
  assertSuperset(functionalHooks(proDetails), functionalHooks(classicDetails), 'ClassDetails Pro')

  // 3. Tab Điểm danh (2 cột theo Prototype Attendance / PhoneAttendance)
  window.location.hash = '#class-details?classId=class-1&tab=attendance'
  const proAttendance = renderClassDetailsView()
  assert.match(proAttendance, /class="ap-attendance-grid"/, 'Grid điểm danh 2 cột')
  assert.match(proAttendance, /class="[^"]*ap-att-left-col[^"]*"/, 'Cột trái cấu hình & lịch sử')
  assert.match(proAttendance, /class="[^"]*ap-att-right-col[^"]*"/, 'Cột phải danh sách học sinh')
  assert.match(proAttendance, /id="attendance-session-date-input"/, 'Input ngày điểm danh')
  assert.match(proAttendance, /id="attendance-session-note"/, 'Input nội dung bài dạy')
  assert.match(proAttendance, /id="cb-send-telegram-recap"/, 'Checkbox gửi Telegram recap')
  assert.match(proAttendance, /id="attendance-mode-badge"/, 'Badge trạng thái buổi')
  assert.match(proAttendance, /id="btn-open-attendance-modal"/, 'Nút mở modal điểm danh nâng cao')
  assert.match(proAttendance, /id="attendance-history-tbody"/, 'Lịch sử buổi học gần đây')
  assert.match(proAttendance, /id="attendance-roster-list"/, 'Danh sách điểm danh nhanh')
  assert.match(proAttendance, /class="ap-roster-touch-target"/, 'Vùng bấm cảm ứng lớn')
  assert.match(proAttendance, /id="btn-att-select-all"/, 'Nút tất cả có mặt')
  assert.match(proAttendance, /id="btn-att-deselect-all"/, 'Nút tất cả vắng')
  assert.match(proAttendance, /id="btn-save-attendance-inline"/, 'Nút lưu điểm danh dính đáy')

  // 4. Tab Học phí (3 KPI, công nợ, nút thu)
  window.location.hash = '#class-details?classId=class-1&tab=tuition'
  const proTuition = renderClassDetailsView()
  assert.match(proTuition, /class="[^"]*ap-tuition-actions[^"]*"/, 'Thanh công cụ học phí')
  assert.match(proTuition, /class="[^"]*ap-tuition-kpi-grid[^"]*"/, 'Grid 3 thẻ KPI học phí')
  assert.match(proTuition, /id="btn-quick-edit-tuition"/, 'Nút sửa học phí nhanh')
  assert.match(proTuition, /id="btn-goto-ledger"/, 'Nút đến sổ cái')
  assert.match(proTuition, /id="btn-tuition-export"/, 'Nút xuất bảng kê')
  assert.match(proTuition, /id="btn-collect-all-class-tuition"/, 'Nút thu học phí cả lớp')
  assert.match(proTuition, /id="tuition-debt-tbody"/, 'Bảng theo dõi công nợ học sinh')

  // 5. Tab Bài tập & đề thi
  window.location.hash = '#class-details?classId=class-1&tab=homework'
  const proHomework = renderClassDetailsView()
  assert.match(proHomework, /id="btn-generate-practice"/, 'Nút AI sinh đề luyện tập')
  assert.match(proHomework, /href="#create-homework"/, 'Link giao bài tập mới')
  assert.match(proHomework, /id="class-homeworks-tbody"/, 'Bảng bài tập của lớp')

  // 6. Tab Cài đặt (2 cột, form + Telegram + Vùng nguy hiểm)
  window.location.hash = '#class-details?classId=class-1&tab=settings'
  const proSettings = renderClassDetailsView()
  assert.match(proSettings, /class="ap-settings-grid"/, 'Grid cài đặt 2 cột')
  assert.match(proSettings, /id="form-update-class-settings"/, 'Form cập nhật thông tin')
  assert.match(proSettings, /id="setting-class-name"/, 'Input tên lớp')
  assert.match(proSettings, /id="setting-class-tuition"/, 'Input học phí')
  assert.match(proSettings, /id="setting-class-description"/, 'Textarea mô tả')
  assert.match(proSettings, /id="telegram-config-card"/, 'Thẻ cấu hình Telegram')
  assert.match(proSettings, /class="[^"]*ap-danger-zone-card[^"]*"/, 'Vùng nguy hiểm')
  assert.match(proSettings, /id="btn-archive-class"/, 'Nút lưu trữ lớp')
  assert.match(proSettings, /id="btn-delete-class-permanent"/, 'Nút xoá lớp vĩnh viễn')

  // 7. Superset checks cho Curriculum & GradeBlocks
  window.location.hash = '#curriculum'
  const proCurriculum = renderCurriculumView()
  assert.match(proCurriculum, /class="app-layout admin-dark" id="curriculum" data-route="curriculum" data-role="ADMIN"/)
  assertSuperset(functionalHooks(proCurriculum), functionalHooks(classicCurriculum), 'Curriculum Pro')

  window.location.hash = '#grade-blocks'
  const proGradeBlocks = renderGradeBlocksView()
  assert.match(proGradeBlocks, /class="app-layout admin-dark" id="grade-blocks" data-route="grade-blocks" data-role="ADMIN"/)
  assertSuperset(functionalHooks(proGradeBlocks), functionalHooks(classicGradeBlocks), 'GradeBlocks Pro')
})

test('(c) gọi hàm bind trên DOM Pro giả lập không ném lỗi', () => {
  fixture()
  setUI('mochi')

  // Giả lập mock element cho DOM tree
  function createMockElement(id = '', tag = 'div') {
    return {
      id,
      tagName: tag.toUpperCase(),
      dataset: {},
      classList: {
        _classes: new Set(),
        add: (...c) => c.forEach(x => this?._classes?.add(x)),
        remove: (...c) => c.forEach(x => this?._classes?.delete(x)),
        contains: (c) => Boolean(this?._classes?.has(c)),
        toggle: (c) => this?._classes?.has(c) ? this._classes.delete(c) : this?._classes?.add(c)
      },
      style: {},
      value: '',
      children: [],
      addEventListener: () => {},
      removeEventListener: () => {},
      querySelector: () => null,
      querySelectorAll: () => [],
      getAttribute: (name) => this?.[name] || '',
      setAttribute: () => {},
      closest: () => null
    }
  }

  const domElements = new Map()
  window.location.hash = '#classes-admin'
  const mgmtHtml = renderClassMgmtView()
  for (const match of mgmtHtml.matchAll(/\bid="([^"]+)"/g)) {
    domElements.set(match[1], createMockElement(match[1]))
  }

  window.location.hash = '#class-details?classId=class-1&tab=attendance'
  const detailsHtml = renderClassDetailsView()
  for (const match of detailsHtml.matchAll(/\bid="([^"]+)"/g)) {
    domElements.set(match[1], createMockElement(match[1]))
  }

  const origGetElementById = document.getElementById
  const origQuerySelectorAll = document.querySelectorAll
  const origQuerySelector = document.querySelector
  const origCreateElement = document.createElement

  document.getElementById = (id) => domElements.get(id) || createMockElement(id)
  document.querySelectorAll = () => []
  document.querySelector = (sel) => createMockElement()
  document.createElement = (tag) => createMockElement('', tag)

  const origBody = document.body
  document.body = createMockElement('body')
  document.body.appendChild = () => {}
  document.body.removeChild = () => {}

  const origGetGradeBlocks = api.getGradeBlocks
  const origGetClassKpiStats = api.getClassKpiStats
  const origGetAttendanceHistory = api.getAttendanceHistory
  const origGetClassAttendanceHistory = api.getClassAttendanceHistory
  const origGetClassDebtSummary = api.getClassDebtSummary
  const origGetClassStudents = api.getClassStudents
  const origGetClassHomeworks = api.getClassHomeworks

  api.getGradeBlocks = async () => ({ ok: true, data: [] })
  api.getClassKpiStats = async () => ({})
  api.getAttendanceHistory = async () => ({ ok: true, data: [] })
  api.getClassAttendanceHistory = async () => ({ ok: true, data: [] })
  api.getClassDebtSummary = async () => ({ ok: true, data: [] })
  api.getClassStudents = async () => ({ ok: true, data: [] })
  api.getClassHomeworks = async () => ({ ok: true, data: [] })

  try {
    assert.doesNotThrow(() => {
      bindClassMgmtEvents()
    }, 'bindClassMgmtEvents không được ném lỗi trên DOM Pro')

    assert.doesNotThrow(() => {
      bindClassDetailsEvents()
    }, 'bindClassDetailsEvents không được ném lỗi trên DOM Pro')
  } finally {
    document.getElementById = origGetElementById
    document.querySelectorAll = origQuerySelectorAll
    document.querySelector = origQuerySelector
    document.createElement = origCreateElement
    document.body = origBody

    api.getGradeBlocks = origGetGradeBlocks
    api.getClassKpiStats = origGetClassKpiStats
    api.getClassAttendanceHistory = origGetClassAttendanceHistory
    api.getClassDebtSummary = origGetClassDebtSummary
    api.getClassStudents = origGetClassStudents
    api.getClassHomeworks = origGetClassHomeworks
  }
})

test('(d) dữ liệu rỗng/lỗi không crash', () => {
  setUI('mochi')

  // 1. Không có lớp học nào (empty classes)
  state.classes = []
  state.students = []
  window.location.hash = '#classes-admin'

  assert.doesNotThrow(() => {
    const emptyHtml = renderClassMgmtView()
    assert.match(emptyHtml, /id="classes-empty-state"/, 'Phải có container empty state')
    assert.match(emptyHtml, /id="btn-empty-create-class"/, 'Phải có CTA tạo lớp')
  }, 'ClassMgmt không crash khi classes rỗng')

  // 2. Không tìm thấy lớp học (invalid classId)
  window.location.hash = '#class-details?classId=non-existent-class'

  assert.doesNotThrow(() => {
    const notFoundPro = renderClassDetailsView()
    assert.match(notFoundPro, /class="card ap-not-found-card"/, 'Phải hiển thị thẻ Không tìm thấy lớp học')
    assert.match(notFoundPro, /href="#classes-admin"/, 'Phải có nút quay lại danh sách lớp')
  }, 'ClassDetails Pro không crash khi classId không tồn tại')

  // 3. Opt-out classic khi không tìm thấy lớp học
  setUI('classic')
  assert.doesNotThrow(() => {
    const notFoundClassic = renderClassDetailsView()
    assert.match(notFoundClassic, /Không tìm thấy thông tin lớp học/)
    assert.match(notFoundClassic, /href="#classes-admin"/)
  }, 'ClassDetails Classic không crash khi classId không tồn tại')
})

test('(e) mọi rule CSS mới có tiền tố html[data-admin-ui="pro"]', () => {
  const selectors = collectRuleSelectors(classesCss)
  assert.ok(selectors.length > 0, 'Phải có ít nhất 1 selector trong classes.css')

  for (const selectorList of selectors) {
    for (const selector of splitSelectorList(selectorList)) {
      const trimmed = selector.trim()
      assert.match(trimmed, /^html\[data-admin-ui="pro"\]/, `Selector chưa scope: ${trimmed}`)
    }
  }

  assert.match(classesCss, /@media\s*\(max-width:\s*900px\)/, 'Phải có responsive breakpoint 900px')
  assert.match(classesCss, /@media\s*\(max-width:\s*640px\)/, 'Phải có responsive breakpoint 640px')
  assert.match(classesCss, /overflow-x:\s*auto/, 'Phải hỗ trợ cuộn ngang bảng overflow-x: auto')

  // Không được dùng giá trị màu cứng hex
  const hexPropertyValues = classesCss.match(/:\s*#[0-9a-fA-F]{3,8}/g) || []
  assert.equal(hexPropertyValues.length, 0, `Không được dùng màu cứng hex: ${hexPropertyValues.join(', ')}`)
})
