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
  location: { hash: '#admin-history', search: '' },
  addEventListener: () => {},
  removeEventListener: () => {},
  matchMedia: () => ({ matches: false }),
  open: () => null
}

const { state } = await import('../src/js/state.js')
const { setTheme } = await import('../src/js/theme.js')
const { api } = await import('../src/js/api.js')
const {
  renderAdminHistoryView,
  renderClassicAdminHistoryView,
  bindAdminHistoryEvents
} = await import('../src/js/views/admin-history.js')
const {
  renderAssignmentReviewView,
  renderClassicAssignmentReviewView,
  bindAssignmentReviewEvents
} = await import('../src/js/views/assignment-review.js')
const {
  renderQuestionAppealsView,
  renderClassicQuestionAppealsView,
  bindQuestionAppealsEvents
} = await import('../src/js/views/question-appeals.js')
const {
  renderExamProctoringView,
  renderClassicExamProctoringView,
  bindExamProctoringEvents
} = await import('../src/js/views/exam-proctoring.js')
const { renderClassHomeworkHistory } = await import('../src/js/views/class-homework-history-modal.js')

const scriptDir = dirname(fileURLToPath(import.meta.url))
const cssPath = resolve(scriptDir, '../src/css/admin-pro/pages/grading.css')
const gradingCss = readFileSync(cssPath, 'utf8')

function fixtureAdmin() {
  state.token = 'admin-token'
  state.user = { id: 'admin-1', role: 'ADMIN', fullName: 'Thầy Hoàng', username: 'admin' }
  state.classes = [
    { id: 'class-1', name: 'Toán 12 Nâng Cao', gradeBlock: '12-Toán', tuitionFee: 150000, studentsCount: 20 },
    { id: 'class-2', name: 'Hóa 11 Cơ Bản', gradeBlock: '11-Hóa', tuitionFee: 120000, studentsCount: 15 }
  ]
  state.lastSubmissionResult = {
    submissionId: 'sub-1',
    homeworkTitle: 'Kiểm tra 45 phút khảo sát hàm số',
    score: 8.5,
    maxScore: 10,
    correctCount: 17,
    wrongCount: 3,
    submittedAt: '2026-11-07T21:44:00Z',
    isLate: false,
    student: {
      fullName: 'Trần Gia Bảo',
      username: 'giabao'
    },
    answers: []
  }
  setTheme('light')
}

function fixtureStudent() {
  state.token = 'student-token'
  state.user = { id: 'student-1', role: 'STUDENT', fullName: 'Nguyễn Văn A', username: 'vana' }
  state.classes = [{ id: 'class-1', name: 'Toán 12 Nâng Cao' }]
  state.lastSubmissionResult = {
    submissionId: 'sub-student-1',
    homeworkTitle: 'Bài tập về nhà số 1',
    score: 9.0,
    maxScore: 10,
    correctCount: 18,
    wrongCount: 2,
    submittedAt: '2026-11-07T20:00:00Z',
    isLate: false,
    student: {
      fullName: 'Nguyễn Văn A',
      username: 'vana'
    },
    answers: []
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

test('(a) opt-out classic giữ nguyên root markup và id cũ của nhóm grading', () => {
  fixtureAdmin()
  setUI('classic')

  window.location.hash = '#admin-history'
  const adminHistory = renderAdminHistoryView()
  assert.match(adminHistory, /<div class="app-layout">/)
  assert.doesNotMatch(adminHistory, /id="admin-history"/)

  window.location.hash = '#assignment-review'
  const assignmentReview = renderClassicAssignmentReviewView()
  assert.match(assignmentReview, /<div class="app-layout">/)
  assert.doesNotMatch(assignmentReview, /id="assignment-review"/)

  window.location.hash = '#question-appeals'
  const questionAppeals = renderQuestionAppealsView()
  assert.match(questionAppeals, /<div class="app-layout">/)
  assert.doesNotMatch(questionAppeals, /id="question-appeals"/)

  window.location.hash = '#exam-proctoring'
  const examProctoring = renderExamProctoringView()
  assert.match(examProctoring, /<div class="app-layout">/)
  assert.doesNotMatch(examProctoring, /id="exam-proctoring"/)

  const modalHtml = renderClassHomeworkHistory({
    history: [],
    unsubmittedStudents: [],
    wrongQuestionsSummary: [],
    submissionStats: { totalStudents: 20 }
  })
  assert.match(modalHtml, /class-hw-history-tab/)

  window.location.search = '?ui=classic'
  assert.equal(renderAdminHistoryView(), adminHistory, 'query opt-out không thay đổi output classic của admin-history')
  assert.equal(renderQuestionAppealsView(), questionAppeals, 'query opt-out không thay đổi output classic của question-appeals')
})

test('(b) Pro có root hook mới và giữ toàn bộ id/data-* chức năng của classic cho cả 4 view admin', () => {
  fixtureAdmin()
  setUI('classic')

  window.location.hash = '#admin-history'
  const classicHistory = renderClassicAdminHistoryView()

  window.location.hash = '#assignment-review'
  const classicReview = renderClassicAssignmentReviewView()

  window.location.hash = '#question-appeals'
  const classicAppeals = renderClassicQuestionAppealsView()

  window.location.hash = '#exam-proctoring'
  const classicProctoring = renderClassicExamProctoringView()

  setUI('mochi')

  window.location.hash = '#admin-history'
  const proHistory = renderAdminHistoryView()
  assert.match(proHistory, /class="app-layout admin-dark" id="admin-history" data-route="admin-history" data-role="ADMIN"/)
  assertSuperset(functionalHooks(proHistory), functionalHooks(classicHistory), 'AdminHistory Pro')

  window.location.hash = '#assignment-review'
  const proReview = renderAssignmentReviewView()
  assert.match(proReview, /class="app-layout admin-dark" id="assignment-review" data-route="assignment-review" data-role="ADMIN"/)
  assertSuperset(functionalHooks(proReview), functionalHooks(classicReview), 'AssignmentReview Pro')

  window.location.hash = '#question-appeals'
  const proAppeals = renderQuestionAppealsView()
  assert.match(proAppeals, /class="app-layout admin-dark" id="question-appeals" data-route="question-appeals" data-role="ADMIN"/)
  assertSuperset(functionalHooks(proAppeals), functionalHooks(classicAppeals), 'QuestionAppeals Pro')

  window.location.hash = '#exam-proctoring'
  const proProctoring = renderExamProctoringView()
  assert.match(proProctoring, /class="app-layout admin-dark" id="exam-proctoring" data-route="exam-proctoring" data-role="ADMIN"/)
  assertSuperset(functionalHooks(proProctoring), functionalHooks(classicProctoring), 'ExamProctoring Pro')
})

test('(c) gọi hàm bind trên DOM Pro giả lập không ném lỗi', () => {
  fixtureAdmin()
  setUI('mochi')

  const domElements = new Map()
  function createMockElement(id = '', tag = 'div') {
    const listeners = new Map()
    const classList = new Set()
    return {
      id,
      tagName: tag.toUpperCase(),
      dataset: {},
      style: {},
      value: '',
      classList: {
        add: (...c) => c.forEach(x => classList.add(x)),
        remove: (...c) => c.forEach(x => classList.delete(x)),
        contains: c => classList.has(c),
        toggle: (c, v) => (v ?? !classList.has(c)) ? classList.add(c) : classList.delete(c)
      },
      addEventListener: (evt, fn) => {
        if (!listeners.has(evt)) listeners.set(evt, [])
        listeners.get(evt).push(fn)
      },
      dispatchEvent: evt => (listeners.get(evt.type) || []).forEach(fn => fn(evt)),
      querySelectorAll: () => [],
      querySelector: (sel) => createMockElement(sel ? String(sel).replace(/^[#.]/, '') : ''),
      closest: () => null,
      appendChild: () => {},
      removeChild: () => {},
      setAttribute: () => {},
      getAttribute: () => null,
      focus: () => {}
    }
  }

  window.location.hash = '#admin-history'
  const historyHtml = renderAdminHistoryView()
  for (const match of historyHtml.matchAll(/\bid="([^"]+)"/g)) {
    domElements.set(match[1], createMockElement(match[1]))
  }

  window.location.hash = '#assignment-review'
  const reviewHtml = renderAssignmentReviewView()
  for (const match of reviewHtml.matchAll(/\bid="([^"]+)"/g)) {
    domElements.set(match[1], createMockElement(match[1]))
  }

  window.location.hash = '#question-appeals'
  const appealsHtml = renderQuestionAppealsView()
  for (const match of appealsHtml.matchAll(/\bid="([^"]+)"/g)) {
    domElements.set(match[1], createMockElement(match[1]))
  }

  window.location.hash = '#exam-proctoring?homeworkId=hw-1'
  const proctorHtml = renderExamProctoringView()
  for (const match of proctorHtml.matchAll(/\bid="([^"]+)"/g)) {
    domElements.set(match[1], createMockElement(match[1]))
  }

  const origGetElementById = document.getElementById
  const origQuerySelectorAll = document.querySelectorAll
  const origQuerySelector = document.querySelector

  document.getElementById = (id) => domElements.get(id) || createMockElement(id)
  document.querySelectorAll = () => []
  document.querySelector = () => createMockElement()

  try {
    assert.doesNotThrow(() => {
      bindAdminHistoryEvents()
    }, 'bindAdminHistoryEvents không được ném lỗi trên DOM Pro')

    assert.doesNotThrow(() => {
      bindAssignmentReviewEvents()
    }, 'bindAssignmentReviewEvents không được ném lỗi trên DOM Pro')

    assert.doesNotThrow(() => {
      bindQuestionAppealsEvents()
    }, 'bindQuestionAppealsEvents không được ném lỗi trên DOM Pro')

    assert.doesNotThrow(() => {
      bindExamProctoringEvents()
    }, 'bindExamProctoringEvents không được ném lỗi trên DOM Pro')
  } finally {
    document.getElementById = origGetElementById
    document.querySelectorAll = origQuerySelectorAll
    document.querySelector = origQuerySelector
  }
})

test('(d) dữ liệu rỗng/lỗi không crash', () => {
  fixtureAdmin()
  setUI('mochi')

  // 1. Lịch sử không có submission / không có lớp
  state.classes = []
  window.location.hash = '#admin-history'
  assert.doesNotThrow(() => {
    const html = renderAdminHistoryView()
    assert.match(html, /Chưa có lượt nộp phù hợp|Danh sách lượt nộp/)
  }, 'AdminHistory Pro không crash khi classes rỗng')

  // 2. Assignment review không có kết quả bài nộp
  state.lastSubmissionResult = null
  window.location.hash = '#assignment-review'
  assert.doesNotThrow(() => {
    const html = renderAssignmentReviewView()
    assert.match(html, /Chưa có kết quả làm bài/)
  }, 'AssignmentReview Pro không crash khi lastSubmissionResult = null')

  // 3. Question appeals khi chưa có yêu cầu
  window.location.hash = '#question-appeals'
  assert.doesNotThrow(() => {
    const html = renderQuestionAppealsView()
    assert.match(html, /id="appeal-inbox-list"/)
  }, 'QuestionAppeals Pro không crash')

  // 4. Exam proctoring không có homeworkId
  window.location.hash = '#exam-proctoring'
  assert.doesNotThrow(() => {
    const html = renderExamProctoringView()
    assert.match(html, /id="proctoring-mount"/)
  }, 'ExamProctoring Pro không crash khi thiếu homeworkId')
})

test('(e) mọi rule trong grading.css đều được scope bằng cổng html[data-admin-ui="pro"]', () => {
  const selectors = collectRuleSelectors(gradingCss)
  assert.ok(selectors.length > 0, 'Phải có ít nhất 1 selector trong grading.css')
  for (const selectorList of selectors) {
    for (const selector of splitSelectorList(selectorList)) {
      assert.match(selector.trim(), /^html\[data-admin-ui="pro"\]/, `Selector chưa scope: ${selector.trim()}`)
    }
  }
  assert.match(gradingCss, /@media\s*\(max-width:\s*900px\)/, 'Phải có responsive breakpoint 900px')
  assert.match(gradingCss, /@media\s*\(max-width:\s*640px\)/, 'Phải có responsive breakpoint 640px')
  assert.match(gradingCss, /overflow-x:\s*auto/, 'Phải hỗ trợ cuộn ngang bảng overflow-x: auto')

  // Không dùng mã màu cứng hex trong giá trị thuộc tính CSS
  const hexPropertyValues = gradingCss.match(/:\s*#[0-9a-fA-F]{3,8}/g) || []
  assert.equal(hexPropertyValues.length, 0, `Không được dùng màu cứng hex: ${hexPropertyValues.join(', ')}`)
})

test('(f) học sinh render assignment-review KHÔNG chịu ảnh hưởng — output nhánh Mochi học sinh y hệt', () => {
  fixtureStudent()
  setUI('mochi')

  window.location.hash = '#assignment-review'
  const studentMochiReview = renderAssignmentReviewView()

  // Không bao giờ có data-admin-ui hay id="assignment-review" trên nhánh học sinh
  assert.doesNotMatch(studentMochiReview, /data-admin-ui="pro"/)
  assert.doesNotMatch(studentMochiReview, /id="assignment-review" data-route="assignment-review"/)
  assert.match(studentMochiReview, /m-review-wrap/, 'Phải là giao diện Mochi học sinh')
  assert.match(studentMochiReview, /m-review-hero/, 'Hero card Mochi học sinh')
  assert.match(studentMochiReview, /m-mascot/, 'Linh vật Mochi học sinh')
})
