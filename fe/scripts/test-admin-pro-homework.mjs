import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

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
  getElementById: () => null,
  createElement: () => ({ style: {}, addEventListener: () => {}, appendChild: () => {} }),
  body: { appendChild: () => {}, removeChild: () => {} }
}
globalThis.window = {
  location: { hash: '#homework-mgmt', search: '', origin: 'http://localhost:3000', pathname: '/' },
  addEventListener: () => {},
  matchMedia: () => ({ matches: false }),
  open: () => null,
  scrollTo: () => null
}

const { state } = await import('../src/js/state.js')
const { api } = await import('../src/js/api.js')
const {
  renderHomeworkMgmtView,
  renderClassicHomeworkMgmtView,
  renderProHomeworkMgmtView,
  bindHomeworkMgmtEvents
} = await import('../src/js/views/homework-mgmt.js')
const {
  renderCreateHwView,
  renderClassicCreateHwView,
  renderProCreateHwView,
  bindCreateHwEvents,
  resetCreateForm
} = await import('../src/js/views/create-hw.js')

const homeworkCss = readFileSync(new URL('../src/css/admin-pro/pages/homework.css', import.meta.url), 'utf8')

function fixture() {
  state.token = 'admin-token'
  state.user = { id: 'admin-1', role: 'ADMIN', fullName: 'Thầy Hoàng', username: 'admin' }
  state.classes = [
    { id: 'class-1', name: 'Toán 12 Nâng cao', gradeBlock: '12-Toán', studentsCount: 24 }
  ]
  state.editHomeworkData = null
  resetCreateForm()
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
  let quote = null
  for (let i = 0; i < selectorList.length; i++) {
    const char = selectorList[i]
    if (quote) {
      if (char === quote && selectorList[i - 1] !== '\\') quote = null
      continue
    }
    if (char === '"' || char === "'") quote = char
    else if (char === '(' || char === '[') depth++
    else if (char === ')' || char === ']') depth--
    else if (char === ',' && depth === 0) {
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

  window.location.hash = '#homework-mgmt'
  const classicMgmt = renderHomeworkMgmtView()
  const classicMgmtExpected = renderClassicHomeworkMgmtView()
  assert.equal(classicMgmt, classicMgmtExpected, 'HomeworkMgmt khi cờ tắt phải trả về output classic y hệt')
  assert.match(classicMgmt, /<div class="app-layout">/)
  assert.doesNotMatch(classicMgmt, /\bap-homework-mgmt\b/)

  window.location.hash = '#create-homework'
  const classicCreate = renderCreateHwView()
  const classicCreateExpected = renderClassicCreateHwView()
  assert.equal(classicCreate, classicCreateExpected, 'CreateHomework khi cờ tắt phải trả về output classic y hệt')
  assert.match(classicCreate, /<div class="app-layout">/)
  assert.doesNotMatch(classicCreate, /\bap-create-homework\b/)

  // Query opt-out ?ui=classic
  setUI('mochi', '?ui=classic')
  window.location.hash = '#homework-mgmt'
  assert.equal(renderHomeworkMgmtView(), classicMgmtExpected, 'query opt-out phải giữ nguyên output homework-mgmt classic')
  window.location.hash = '#create-homework'
  assert.equal(renderCreateHwView(), classicCreateExpected, 'query opt-out phải giữ nguyên output create-homework classic')
})

test('(b) cờ bật → có các khối chính của bố cục mới; TẬP id + data-* chức năng của bản Pro ⊇ bản cũ cùng dữ liệu', () => {
  fixture()
  setUI('classic')
  window.location.hash = '#homework-mgmt'
  const classicMgmt = renderHomeworkMgmtView()
  window.location.hash = '#create-homework'
  const classicCreate = renderCreateHwView()

  setUI('mochi')

  // 1. Quản lý bài tập (HomeworkMgmt Pro)
  window.location.hash = '#homework-mgmt'
  const proMgmt = renderHomeworkMgmtView()

  // Layout hook & Header
  assert.match(proMgmt, /<div class="app-layout ap-homework-mgmt">/)
  assert.match(proMgmt, /class="[^"]*ap-hw-mgmt-header[^"]*"/, 'Header Pro')
  assert.match(proMgmt, /id="btn-goto-question-bank"/, 'Nút ngân hàng câu hỏi')
  assert.match(proMgmt, /id="btn-create-homework"/, 'Nút tạo bài tập mới')

  // 4 KPI Cards
  assert.match(proMgmt, /class="[^"]*ap-hw-kpi-grid[^"]*"/, 'Grid KPI 4 thẻ')
  assert.match(proMgmt, /id="stat-total-hw"/, 'KPI Tổng số bài tập')
  assert.match(proMgmt, /id="stat-practice-hw"/, 'KPI Bài luyện tập')
  assert.match(proMgmt, /id="stat-exam-hw"/, 'KPI Bài thi chính thức')
  assert.match(proMgmt, /id="stat-classes-count"/, 'KPI Số lớp đang áp dụng')

  // Filter Toolbar Card
  assert.match(proMgmt, /class="[^"]*ap-hw-filter-card[^"]*"/, 'Thanh công cụ lọc')
  assert.match(proMgmt, /id="hw-search-input"/, 'Ô tìm kiếm bài tập')
  assert.match(proMgmt, /id="hw-filter-class"/, 'Select lọc lớp học')
  assert.match(proMgmt, /id="hw-filter-chapter"/, 'Select lọc chương')
  assert.match(proMgmt, /id="hw-filter-lesson"/, 'Select lọc bài học')
  assert.match(proMgmt, /id="hw-filter-type"/, 'Select lọc phân loại')
  assert.match(proMgmt, /id="hw-filtered-count"/, 'Tổng số bài tập lọc')
  assert.match(proMgmt, /id="hw-sort-select"/, 'Select sắp xếp')
  assert.match(proMgmt, /id="hw-reset-filter-btn"/, 'Nút đặt lại bộ lọc')

  // Table Card
  assert.match(proMgmt, /class="[^"]*ap-hw-table-card[^"]*"/, 'Thẻ bảng bài tập')
  assert.match(proMgmt, /id="hw-table-body"/, 'Tbody bảng bài tập')
  assert.match(proMgmt, /id="hw-pagination-wrapper"/, 'Khung phân trang')

  // Superset hook check for HomeworkMgmt
  assertSuperset(functionalHooks(proMgmt), functionalHooks(classicMgmt), 'HomeworkMgmt Pro')

  // 2. Tạo bài tập mới (CreateHomework Pro)
  window.location.hash = '#create-homework'
  const proCreate = renderCreateHwView()

  // Layout hook & Hero Card
  assert.match(proCreate, /<div class="app-layout ap-create-homework">/)
  assert.match(proCreate, /class="[^"]*ap-hw-breadcrumb[^"]*"/, 'Breadcrumb đường dẫn')
  assert.match(proCreate, /class="[^"]*ap-create-hw-hero[^"]*"/, 'Hero card tạo bài tập')

  // Stepper 4 bước (đáp án & sơ đồ câu hỏi gộp vào bước 2)
  assert.match(proCreate, /id="hw-stepper-bar"/, 'Thanh stepper 4 bước')
  assert.match(proCreate, /data-step="1"/, 'Nút bước 1')
  assert.match(proCreate, /data-step="2"/, 'Nút bước 2')
  assert.match(proCreate, /data-step="3"/, 'Nút bước 3')
  assert.match(proCreate, /data-step="4"/, 'Nút bước 4')
  assert.doesNotMatch(proCreate, /data-step="5"/, 'Không còn bước 5')

  // 4 Step Panels
  assert.match(proCreate, /data-step-panel="1"/, 'Panel Bước 1: Thông tin cơ bản')
  assert.match(proCreate, /id="hw-title"/, 'Input tên bài tập')
  assert.match(proCreate, /id="hw-type"/, 'Select loại bài')
  assert.match(proCreate, /id="hw-class-select"/, 'Select lớp học')
  assert.match(proCreate, /id="hw-chapter-select"/, 'Select chương')
  assert.match(proCreate, /id="hw-lesson-select"/, 'Select bài học')

  assert.match(proCreate, /data-step-panel="2"/, 'Panel Bước 2: Đề bài Markdown / PDF')
  assert.match(proCreate, /id="create-hw-left-pane"/, 'Khung soạn thảo đề bài')
  assert.match(proCreate, /id="btn-mode-interactive"/, 'Nút đề tương tác')
  assert.match(proCreate, /id="btn-mode-pdf"/, 'Nút đề PDF')
  assert.match(proCreate, /id="hw-markdown-input"/, 'Textarea nhập Markdown')
  assert.match(proCreate, /id="interactive-preview-container"/, 'Khung xem trước câu hỏi tương tác')

  // Đáp án & sơ đồ câu hỏi nằm trong panel bước 2
  const step2Panel = proCreate.slice(proCreate.indexOf('data-step-panel="2"'), proCreate.indexOf('data-step-panel="3"'))
  assert.match(step2Panel, /id="hw-question-map"/, 'Sơ đồ câu hỏi nằm trong bước 2')
  assert.match(step2Panel, /id="answer-matrix-container"/, 'Ma trận đáp án nằm trong bước 2')
  assert.match(proCreate, /id="cfg-mc-count"/, 'Cấu hình số câu trắc nghiệm ABCD')
  assert.match(proCreate, /id="cfg-tf-count"/, 'Cấu hình số câu đúng sai')
  assert.match(proCreate, /id="cfg-sa-count"/, 'Cấu hình số câu trả lời ngắn')
  assert.match(proCreate, /id="update-config-btn"/, 'Nút cập nhật số lượng câu')
  assert.match(proCreate, /id="copy-sample-btn"/, 'Nút sao chép JSON mẫu')
  assert.match(proCreate, /id="copy-answers-btn"/, 'Nút sao chép đáp án JSON')
  assert.match(proCreate, /id="import-answers-btn"/, 'Nút nhập đáp án JSON')
  assert.match(proCreate, /id="answer-matrix-container"/, 'Ma trận đáp án')

  assert.match(proCreate, /data-step-panel="3"/, 'Panel Bước 3: Phòng thi & Deadline')
  assert.match(proCreate, /id="hw-duration"/, 'Input thời lượng thi')
  assert.match(proCreate, /id="hw-max-attempts"/, 'Input số lần làm bài')
  assert.match(proCreate, /id="hw-max-violations"/, 'Input giới hạn vi phạm')
  assert.match(proCreate, /id="hw-show-solutions"/, 'Checkbox hiển thị lời giải')
  assert.match(proCreate, /id="hw-deadline-date"/, 'Input ngày hạn chót')
  assert.match(proCreate, /id="hw-deadline-hour"/, 'Select giờ hạn chót')
  assert.match(proCreate, /id="hw-deadline-minute"/, 'Select phút hạn chót')
  assert.match(proCreate, /id="hw-deadline-clear-btn"/, 'Nút xóa hạn chót')

  assert.match(proCreate, /data-step-panel="4"/, 'Panel Bước 4: Giao lớp & Hoàn tất')
  assert.doesNotMatch(proCreate, /data-step-panel="5"/, 'Không còn panel bước 5')
  assert.match(proCreate, /id="btn-assign-select-all"/, 'Nút chọn tất cả học sinh')
  assert.match(proCreate, /id="btn-assign-deselect-all"/, 'Nút bỏ chọn học sinh')
  assert.match(proCreate, /id="assign-selected-count"/, 'Badge số học sinh được chọn')
  assert.match(proCreate, /id="assign-students-list"/, 'Danh sách học sinh giao bài')

  // Sticky footer
  assert.match(proCreate, /class="[^"]*ap-hw-sticky-footer[^"]*"/, 'Thanh footer dính đáy')
  assert.match(proCreate, /id="btn-hw-prev-step"/, 'Nút bước trước')
  assert.match(proCreate, /id="btn-hw-next-step"/, 'Nút tiếp tục')
  assert.match(proCreate, /id="current-step-display"/, 'Hiển thị bước hiện tại')
  assert.match(proCreate, /id="save-homework-btn"/, 'Nút lưu bài tập')

  // Superset hook check for CreateHomework
  assertSuperset(functionalHooks(proCreate), functionalHooks(classicCreate), 'CreateHomework Pro')
})

test('(c) gọi hàm bind trên DOM Pro giả lập không ném lỗi', () => {
  fixture()
  setUI('mochi')

  function createMockElement(id = '', tag = 'div') {
    const classes = new Set()
    return {
      id,
      tagName: tag.toUpperCase(),
      dataset: {},
      classList: {
        _classes: classes,
        add: (...c) => c.forEach(x => classes.add(x)),
        remove: (...c) => c.forEach(x => classes.delete(x)),
        contains: (c) => classes.has(c),
        toggle: (c, force) => {
          if (force !== undefined) {
            force ? classes.add(c) : classes.delete(c)
            return force
          }
          if (classes.has(c)) { classes.delete(c); return false }
          classes.add(c); return true
        }
      },
      style: {},
      value: '',
      children: [],
      isConnected: true,
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

  window.location.hash = '#homework-mgmt'
  const mgmtHtml = renderHomeworkMgmtView()
  for (const match of mgmtHtml.matchAll(/\bid="([^"]+)"/g)) {
    domElements.set(match[1], createMockElement(match[1]))
  }

  window.location.hash = '#create-homework'
  const createHtml = renderCreateHwView()
  for (const match of createHtml.matchAll(/\bid="([^"]+)"/g)) {
    domElements.set(match[1], createMockElement(match[1]))
  }

  const origGetElementById = document.getElementById
  const origQuerySelectorAll = document.querySelectorAll
  const origQuerySelector = document.querySelector
  const origCreateElement = document.createElement

  document.getElementById = (id) => domElements.get(id) || createMockElement(id)
  document.querySelectorAll = () => []
  document.querySelector = () => createMockElement()
  document.createElement = (tag) => createMockElement('', tag)

  const origGetHomeworks = api.getHomeworks
  const origGetClasses = api.getClasses
  const origGetChapters = api.getChapters
  const origGetLessons = api.getLessons

  api.getHomeworks = async () => ({ items: [], total: 0, stats: { total: 0, practiceCount: 0, examCount: 0, classesCount: 0 } })
  api.getClasses = async () => []
  api.getChapters = async () => []
  api.getLessons = async () => []

  try {
    assert.doesNotThrow(() => {
      bindHomeworkMgmtEvents()
    }, 'bindHomeworkMgmtEvents không được ném lỗi trên DOM Pro')

    assert.doesNotThrow(() => {
      bindCreateHwEvents()
    }, 'bindCreateHwEvents không được ném lỗi trên DOM Pro')
  } finally {
    document.getElementById = origGetElementById
    document.querySelectorAll = origQuerySelectorAll
    document.querySelector = origQuerySelector
    document.createElement = origCreateElement

    api.getHomeworks = origGetHomeworks
    api.getClasses = origGetClasses
    api.getChapters = origGetChapters
    api.getLessons = origGetLessons
  }
})

test('(d) dữ liệu rỗng/lỗi không crash', () => {
  setUI('mochi')

  // 1. Dữ liệu classes rỗng
  state.classes = []
  window.location.hash = '#homework-mgmt'
  assert.doesNotThrow(() => {
    const emptyMgmt = renderHomeworkMgmtView()
    assert.match(emptyMgmt, /id="hw-table-body"/, 'HomeworkMgmt vẫn render được khi state.classes rỗng')
  }, 'HomeworkMgmt không crash khi classes rỗng')

  // 2. Tạo bài tập mới với state rỗng
  state.editHomeworkData = null
  resetCreateForm()
  window.location.hash = '#create-homework'
  assert.doesNotThrow(() => {
    const createHtml = renderCreateHwView()
    assert.match(createHtml, /id="hw-stepper-bar"/, 'CreateHomework render được khi tạo mới')
    assert.match(createHtml, /id="save-homework-btn"/, 'CreateHomework có nút lưu khi tạo mới')
  }, 'CreateHomework không crash khi tạo mới với state rỗng')

  // 3. Sửa bài tập với editHomeworkData tối thiểu / thiếu trường
  state.editHomeworkData = {
    homework: { id: 'hw-minimal', title: 'Bài tối thiểu', type: 'PRACTICE' },
    questions: []
  }
  assert.doesNotThrow(() => {
    const editHtml = renderCreateHwView()
    assert.match(editHtml, /id="hw-title"/, 'CreateHomework render được khi sửa bài với questions rỗng')
  }, 'CreateHomework không crash khi sửa bài tập có questions rỗng')
})

test('(e) mọi rule homework.css đều scope qua html[data-admin-ui="pro"]', () => {
  const selectors = collectRuleSelectors(homeworkCss)
  assert.ok(selectors.length >= 50, 'homework.css phải có đủ rule cho hai view')
  for (const selectorList of selectors) {
    for (const selector of splitSelectorList(selectorList)) {
      assert.match(selector.trim(), /^html\[data-admin-ui="pro"\]/, `Selector chưa scope: ${selector.trim()}`)
    }
  }
  assert.match(homeworkCss, /@media\s*\(max-width:\s*900px\)/)
  assert.match(homeworkCss, /@media\s*\(max-width:\s*640px\)/)
  assert.match(homeworkCss, /overflow-x:\s*auto/, 'bảng rộng phải cuộn trong khung')
})

test('nút thao tác icon của bảng có aria-label ở nhánh Pro mà không đổi nhánh classic', () => {
  const source = readFileSync(new URL('../src/js/views/homework-mgmt.js', import.meta.url), 'utf8')
  for (const className of ['btn-proctor-hw', 'btn-history-hw', 'btn-pdf-hw', 'btn-assign-hw', 'btn-edit-hw', 'btn-delete-hw']) {
    const line = source.split('\n').find(item => item.includes(`class="btn-secondary ${className}"`)) || ''
    assert.match(line, /isPro \? 'aria-label=/, `${className} phải có aria-label chỉ ở Pro`)
  }
})
