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
  // Bộ chọn 4 chế độ màu admin (data-admin-palette-option) thay nút Sáng/Tối (data-theme-toggle) của classic.
  if (hooks.has('data-admin-palette-option')) hooks.add('data-theme-toggle')
  return hooks
}

// Hook của giao diện cũ mà luồng tạo bài Pro 3 bước chủ động bỏ (đề mẫu, nhập file .md, đính kèm/xuất PDF,
// JSON đáp án; ma trận & số lượng câu chỉ còn ở chế độ đề PDF).
const PRO_CREATE_REMOVED_HOOKS = [
  'id:btn-load-math-tpl', 'id:btn-load-chem-tpl', 'id:btn-export-exam-pdf',
  'id:interactive-pdf-attachment-container', 'id:hw-interactive-pdf-input', 'id:btn-select-interactive-pdf',
  'id:copy-sample-btn', 'id:copy-answers-btn', 'id:import-answers-btn',
  'id:cfg-mc-count', 'id:cfg-tf-count', 'id:cfg-sa-count', 'id:update-config-btn', 'id:answer-matrix-container',
  'data-option', 'data-index', 'data-sub', 'data-val'
]
const CARD_HOOKS = ['id:raw-max-points-badge', 'data-preset', 'data-qindex', 'data-qnum', 'data-optid', 'data-subid']

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

  // Stepper 3 bước: Thông tin → Đề bài & kiểm tra → Cấu hình & giao bài
  assert.match(proCreate, /id="hw-stepper-bar"/, 'Thanh stepper')
  assert.match(proCreate, /data-step="1"/, 'Nút bước 1')
  assert.match(proCreate, /data-step="2"/, 'Nút bước 2')
  assert.match(proCreate, /data-step="3"/, 'Nút bước 3')
  assert.doesNotMatch(proCreate, /data-step="4"/, 'Không còn bước 4')
  assert.match(proCreate, /Bước <strong id="current-step-display">1<\/strong> \/ 3/, 'Chỉ báo bước x / 3')

  const panel = (n) => proCreate.slice(proCreate.indexOf(`data-step-panel="${n}"`), n < 3 ? proCreate.indexOf(`data-step-panel="${n + 1}"`) : proCreate.indexOf('ap-hw-sticky-footer'))
  // Bước 1: tên, phân loại, lớp, chương, bài học
  const step1 = panel(1)
  for (const id of ['hw-title', 'hw-type', 'hw-class-select', 'hw-chapter-select', 'hw-lesson-select']) {
    assert.match(step1, new RegExp(`id="${id}"`), `Bước 1 có ${id}`)
  }
  // Bước 2: Markdown + phân tích + sơ đồ câu + tổng quan lỗi + xem trước
  const step2 = panel(2)
  for (const id of ['create-hw-left-pane', 'btn-mode-interactive', 'btn-mode-pdf', 'hw-markdown-input', 'btn-import-md-file', 'hw-md-file-input', 'btn-upload-pdf-file', 'btn-generate-exam-pdf', 'ap-md-source', 'btn-parse-markdown', 'ap-md-status', 'ap-q-summary', 'hw-question-map', 'ap-q-issues', 'interactive-preview-container']) {
    assert.match(step2, new RegExp(`id="${id}"`), `Bước 2 có ${id}`)
  }
  // Bài mới ở Pro bắt đầu với khung Markdown trống (không còn đề mẫu)
  assert.match(step2, /<textarea id="hw-markdown-input"[^>]*><\/textarea>/, 'Textarea Markdown trống khi tạo mới')
  assert.match(step2, /<details class="ap-q-source" id="ap-md-source" open>/, 'Khung Markdown mở sẵn khi chưa có câu hỏi')
  assert.ok(step2.indexOf('id="interactive-preview-container"') < step2.indexOf('class="ap-q-side"'), 'Cột trái là xem trước câu hỏi')
  assert.ok(step2.indexOf('id="hw-question-map"') < step2.indexOf('id="hw-markdown-input"'), 'Khung Markdown nằm dưới sơ đồ câu hỏi')
  // Các tính năng đã bỏ ở Pro
  for (const id of ['btn-load-math-tpl', 'btn-load-chem-tpl', 'btn-export-exam-pdf', 'interactive-pdf-attachment-container', 'copy-sample-btn', 'copy-answers-btn', 'import-answers-btn']) {
    assert.doesNotMatch(proCreate, new RegExp(`id="${id}"`), `Pro đã bỏ ${id}`)
  }
  // Ma trận đáp án chỉ còn ở chế độ đề PDF
  assert.doesNotMatch(step2, /id="answer-matrix-container"/, 'Đề Markdown không còn ma trận đáp án')
  // Bước 3: thời gian, số lần làm, lời giải, hạn nộp, giao riêng
  const step3 = panel(3)
  for (const id of ['hw-duration', 'hw-max-attempts', 'hw-max-violations', 'hw-show-solutions', 'hw-deadline-date', 'hw-deadline-hour', 'hw-deadline-minute', 'hw-deadline-clear-btn', 'assign-mode-class', 'assign-mode-select', 'assign-student-search', 'btn-assign-select-all', 'btn-assign-deselect-all', 'assign-selected-count', 'assign-students-list', 'ap-hw-review-summary']) {
    assert.match(step3, new RegExp(`id="${id}"`), `Bước 3 có ${id}`)
  }
  assert.match(step3, /data-deadline-days="7"/, 'Chọn nhanh hạn nộp')
  assert.match(step3, /id="assign-mode-class"[^>]*checked/, 'Mặc định giao cả lớp')

  // Sticky footer
  assert.match(proCreate, /class="[^"]*ap-hw-sticky-footer[^"]*"/, 'Thanh footer dính đáy')
  assert.match(proCreate, /id="btn-hw-prev-step"/, 'Nút bước trước')
  assert.match(proCreate, /id="btn-hw-next-step"/, 'Nút tiếp tục')
  assert.match(proCreate, /id="current-step-display"/, 'Hiển thị bước hiện tại')
  assert.match(proCreate, /id="save-homework-btn"/, 'Nút lưu bài tập')

  // Superset hook check for CreateHomework — trừ các tính năng đã chủ động bỏ ở Pro
  // và hook thẻ câu hỏi (bài mới ở Pro không còn nạp sẵn đề mẫu).
  const removed = new Set(PRO_CREATE_REMOVED_HOOKS)
  const classicHooks = new Set([...functionalHooks(classicCreate)].filter(h => !removed.has(h) && !CARD_HOOKS.includes(h)))
  assertSuperset(functionalHooks(proCreate), classicHooks, 'CreateHomework Pro')
})

function editFixture(id, interactive) {
  fixture()
  const prompt = (obj) => JSON.stringify({ isInteractive: true, ...obj })
  state.editHomeworkData = {
    homework: { id, title: 'Đại số - Đề ôn', type: 'PRACTICE', classId: 'class-1', lessonTitle: 'Đại số', durationMinutes: 45, maxAttempts: 2, pdfPath: interactive ? 'INTERACTIVE' : 'de.pdf', assignedStudentIds: ['stu-1'] },
    questions: interactive ? [
      { question_number: 1, question_type: 'MULTIPLE_CHOICE', prompt: prompt({ text: 'Tính $1+1$', options: [{ id: 'A', text: '1' }, { id: 'B', text: '2' }, { id: 'C', text: '3' }, { id: 'D', text: '4' }] }), answerKey: { mc_answer: 'B' } },
      { question_number: 2, question_type: 'TRUE_FALSE', prompt: prompt({ text: 'Xét đúng sai', statements: [{ id: 'a', text: 'x' }, { id: 'b', text: 'y' }, { id: 'c', text: 'z' }, { id: 'd', text: 't' }] }), answerKey: { tf_answers: { a: true, b: false, c: true, d: false } } }
    ] : [
      { question_number: 1, question_type: 'MULTIPLE_CHOICE', prompt: 'Câu hỏi số 1', answerKey: { mc_answer: 'C' } }
    ]
  }
}

test('(b2) sửa bài Markdown ở Pro: nạp đề vào textarea + thẻ xem trước; giao riêng được tick sẵn', () => {
  setUI('mochi')
  editFixture('hw-edit-md', true)
  window.location.hash = '#create-homework?homeworkId=hw-edit-md'
  const pro = renderCreateHwView()
  assert.match(pro, /<textarea id="hw-markdown-input"[^>]*>[^<]*Tính \$1\+1\$/, 'Markdown của đề được nạp vào textarea')
  assert.match(pro, /class="interactive-q-card" data-qindex="0"/, 'Có thẻ xem trước câu 1')
  assert.match(pro, /<details class="ap-q-source" id="ap-md-source" >/, 'Đã có đề → khung Markdown thu gọn sẵn')
  assert.match(pro, /data-optid="B"/, 'Có phương án để bấm chọn đáp án')
  assert.match(pro, /id="assign-mode-select"[^>]*checked/, 'Bài đã giao riêng → chọn sẵn "Giao riêng"')
  assert.doesNotMatch(pro, /id="assign-select-wrap"[^>]*hidden/, 'Danh sách học sinh hiện khi giao riêng')
  assert.match(pro, /Cập nhật bài tập/, 'Nút lưu ở chế độ sửa')
  setUI('classic')
  const classic = renderCreateHwView()
  const removed = new Set(PRO_CREATE_REMOVED_HOOKS)
  setUI('mochi')
  const proAgain = renderCreateHwView()
  assertSuperset(functionalHooks(proAgain), new Set([...functionalHooks(classic)].filter(h => !removed.has(h))), 'CreateHomework Pro (sửa bài)')
})

test('(b3) sửa bài đề PDF ở Pro: vẫn có số lượng câu + ma trận đáp án', () => {
  setUI('mochi')
  editFixture('hw-edit-pdf', false)
  window.location.hash = '#create-homework?homeworkId=hw-edit-pdf'
  const pro = renderCreateHwView()
  const step2 = pro.slice(pro.indexOf('data-step-panel="2"'), pro.indexOf('data-step-panel="3"'))
  for (const id of ['pdf-preview-container', 'cfg-mc-count', 'cfg-tf-count', 'cfg-sa-count', 'update-config-btn', 'answer-matrix-container']) {
    assert.match(step2, new RegExp(`id="${id}"`), `Đề PDF có ${id}`)
  }
  assert.doesNotMatch(step2, /id="hw-markdown-input"/, 'Đề PDF không có khung Markdown')
  assert.match(step2, /data-option="C"/, 'Ma trận giữ đáp án đã lưu')
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

test('hàng bảng Pro: có nút Xem trước, bỏ Giám sát & Kết quả/lịch sử; classic giữ nguyên', () => {
  const source = readFileSync(new URL('../src/js/views/homework-mgmt.js', import.meta.url), 'utf8')
  const start = source.indexOf('function renderProHomeworkTableRows(')
  const end = source.indexOf('let previewRequestId')
  assert.ok(start > 0 && end > start, 'phải có renderer hàng riêng cho Pro')
  const proRows = source.slice(start, end)
  assert.match(proRows, /btn-preview-hw/, 'Pro phải có nút Xem trước')
  assert.doesNotMatch(proRows, /btn-proctor-hw|btn-history-hw/, 'Pro không còn Giám sát / Kết quả & lịch sử')
  for (const cls of ['btn-copy-link-hw', 'btn-pdf-hw', 'btn-assign-hw', 'btn-edit-hw', 'btn-delete-hw']) {
    assert.match(proRows, new RegExp(cls), `Pro vẫn giữ ${cls}`)
  }
  assert.match(source, /if \(isAdminProUI\(\)\) return renderProHomeworkTableRows/, 'chỉ nhánh Pro dùng renderer mới')
  assert.match(source, /class="btn-secondary btn-proctor-hw"/, 'classic giữ nút Giám sát')
  assert.match(source, /class="btn-secondary btn-history-hw"/, 'classic giữ nút Lịch sử')
  assert.match(source, /api\.getHomeworkDetail\(hw\.id\)/, 'Xem trước dùng API sẵn có')
  assert.match(homeworkCss, /\.ap-hw-preview-btn/, 'CSS cho nút Xem trước')
})
