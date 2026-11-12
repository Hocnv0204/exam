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

const listeners = new Map()
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
  addEventListener: (event, cb) => {
    if (!listeners.has(event)) listeners.set(event, [])
    listeners.get(event).push(cb)
  },
  dispatchEvent: () => {},
  querySelector: () => null,
  querySelectorAll: () => [],
  getElementById: () => null
}

globalThis.window = {
  location: { hash: '#class-details?classId=c1&tab=curriculum', search: '', origin: 'http://localhost', pathname: '/' },
  addEventListener: () => {},
  matchMedia: () => ({ matches: false }),
  open: () => null
}

const { state } = await import('../src/js/state.js')
const { setTheme } = await import('../src/js/theme.js')
const {
  renderCurriculumTabHTML,
  renderClassicCurriculumTabHTML,
  renderProCurriculumTabHTML,
  renderCurriculumView,
  bindCurriculumTabEvents
} = await import('../src/js/views/curriculum.js')

const scriptDir = dirname(fileURLToPath(import.meta.url))
const cssPath = resolve(scriptDir, '../src/css/admin-pro/pages/curriculum.css')
const curriculumCss = readFileSync(cssPath, 'utf8')

function fixture() {
  state.token = 'admin-token'
  state.user = { id: 'admin-1', role: 'ADMIN', fullName: 'Thầy Hoàng', username: 'admin' }
  state.classes = [
    { id: 'c1', name: 'Toán 12A – Luyện thi THPT', gradeBlock: '12-Toán', tuitionFee: 150000, studentsCount: 20 },
    { id: 'c2', name: 'Hóa 11 Cơ Bản', gradeBlock: '11-Hóa', tuitionFee: 120000, studentsCount: 15 }
  ]
  state.curriculums = [
    {
      classId: 'c1',
      chapters: [
        {
          id: 'ch1',
          code: 'C1',
          title: 'Ứng dụng đạo hàm khảo sát hàm số',
          orderIndex: 1,
          lessons: [
            {
              id: 'l1',
              chapterId: 'ch1',
              code: '1',
              title: 'Tính đơn điệu của hàm số và ứng dụng',
              content: 'Tóm tắt bài học tính đơn điệu',
              videoUrl: 'https://drive.google.com/file/d/sample/view',
              theoryFiles: ['ly-thuyet-cuc-tri.pdf'],
              homeworks: [
                { id: 'hw1', title: 'Luyện tập cực trị hàm số', durationMinutes: 45, passScore: 5, maxScore: 10 }
              ],
              isTrial: false,
              hasVideo: true,
              theoryFilesCount: 1,
              homeworksCount: 1
            },
            {
              id: 'l2',
              chapterId: 'ch1',
              code: '2',
              title: 'Cực trị của hàm số và bài toán chứa tham số m',
              content: 'Cực trị hàm số',
              videoUrl: '',
              theoryFiles: [],
              homeworks: [],
              isTrial: true,
              hasVideo: false,
              theoryFilesCount: 0,
              homeworksCount: 0
            }
          ]
        },
        {
          id: 'ch2',
          code: 'C2',
          title: 'Hàm số luỹ thừa, mũ và logarit',
          orderIndex: 2,
          lessons: []
        }
      ]
    }
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

test('(a) cờ tắt → output renderer cũ y hệt (so với hàm cũ)', () => {
  fixture()
  setUI('classic')

  const currentClass = state.classes[0]
  const rendered = renderCurriculumTabHTML(currentClass)
  const chapters = state.curriculums[0].chapters

  // So sánh với renderer classic chuyên biệt
  const classicOutput = renderClassicCurriculumTabHTML(currentClass, chapters, 0, null, null)
  assert.equal(rendered, classicOutput, 'renderCurriculumTabHTML khi cờ tắt phải trả về output classic y hệt')

  // Kiểm tra query opt-out ?ui=classic
  setUI('mochi', '?ui=classic')
  assert.equal(renderCurriculumTabHTML(currentClass), classicOutput, 'query ?ui=classic phải trả về output classic')

  // Kiểm tra renderCurriculumView khi opt-out không có id="curriculum"
  setUI('classic')
  window.location.hash = '#curriculum'
  const curriculumView = renderCurriculumView()
  assert.match(curriculumView, /<div class="app-layout">/)
  assert.doesNotMatch(curriculumView, /id="curriculum"/)
})

test('(b) cờ bật → có các khối chính của bố cục mới; TẬP id + data-* chức năng của bản Pro ⊇ bản cũ cùng dữ liệu', () => {
  fixture()
  const currentClass = state.classes[0]

  setUI('classic')
  const classicMarkup = renderCurriculumTabHTML(currentClass)
  const classicHooks = functionalHooks(classicMarkup)

  setUI('mochi')
  const proMarkup = renderCurriculumTabHTML(currentClass)
  const proHooks = functionalHooks(proMarkup)

  // 1. Kiểm tra cấu trúc Pro: Header card & 2 thẻ số nhỏ
  assert.match(proMarkup, /class="ap-curriculum-container"/, 'Phải có container Pro ap-curriculum-container')
  assert.match(proMarkup, /class="ap-curriculum-header-card"/, 'Phải có header card Pro')
  assert.match(proMarkup, /class="ap-curriculum-stats"/, 'Phải có nhóm thống kê stats')
  assert.match(proMarkup, /Tổng số chương/, 'Header phải có thẻ số Tổng số chương')
  assert.match(proMarkup, /Tổng số bài học/, 'Header phải có thẻ số Tổng số bài học')

  // 2. Kiểm tra bố cục 2 cột: Cây chương trình (trái) + Không gian bài học (phải)
  assert.match(proMarkup, /class="ap-curriculum-grid"/, 'Phải có grid 2 cột ap-curriculum-grid')
  assert.match(proMarkup, /<aside class="ap-curriculum-tree" aria-label="Cây chương trình">/, 'Phải có cột trái Cây chương trình')
  assert.match(proMarkup, /<section class="ap-curriculum-main" aria-label="Không gian bài học">/, 'Phải có cột phải Không gian bài học')

  // 3. Cây chương trình có "Tất cả bài học" + danh sách chương
  assert.match(proMarkup, /data-chapter-id="all"/, 'Cây chương trình phải có mục Tất cả bài học')
  assert.match(proMarkup, /data-chapter-id="ch1"/, 'Cây chương trình phải chứa chương ch1')
  assert.match(proMarkup, /data-chapter-id="ch2"/, 'Cây chương trình phải chứa chương ch2')
  assert.match(proMarkup, /id="add-chapter-btn-tree"/, 'Cây chương trình phải có nút thêm chương')

  // 4. Thanh công cụ & tìm kiếm bài học
  assert.match(proMarkup, /id="curriculum-lesson-search-input"/, 'Phải giữ id ô tìm kiếm')
  assert.match(proMarkup, /id="curriculum-sort-select"/, 'Phải giữ id select sắp xếp')
  assert.match(proMarkup, /id="btn-quick-add-lesson"/, 'Phải giữ id nút tạo bài học nhanh')
  assert.match(proMarkup, /id="add-chapter-btn"/, 'Phải giữ id nút tạo chương mới')
  assert.match(proMarkup, /id="curriculum-chapter-filter"/, 'Phải giữ select đồng bộ curriculum-chapter-filter')

  // 5. Tập hook chức năng bản Pro ⊇ bản Classic
  assertSuperset(proHooks, classicHooks, 'Curriculum Pro Listing Mode')

  // 6. Kiểm tra Workspace Chi tiết bài học
  const chapters = state.curriculums[0].chapters
  const selectedLesson = chapters[0].lessons[0]
  const selectedChapter = chapters[0]

  setUI('classic')
  const classicWs = renderClassicCurriculumTabHTML(currentClass, chapters, 2, selectedChapter, selectedLesson)
  const classicWsHooks = functionalHooks(classicWs)

  setUI('mochi')
  const proWs = renderProCurriculumTabHTML(currentClass, chapters, 2, selectedChapter, selectedLesson)
  const proWsHooks = functionalHooks(proWs)

  assert.match(proWs, /class="curriculum-breadcrumb ap-lw-breadcrumb"/, 'Workspace Pro phải có breadcrumb')
  assert.match(proWs, /class="btn-secondary lw-btn btn-back-to-curriculum ap-lw-back-btn"/, 'Workspace Pro phải có nút quay lại')
  assert.match(proWs, /class="ap-lw-grid"/, 'Workspace Pro phải có grid 2 cột')
  assert.match(proWs, /class="ap-lw-left-col"/, 'Workspace Pro phải có cột trái video + lý thuyết')
  assert.match(proWs, /class="ap-lw-right-col"/, 'Workspace Pro phải có cột phải bài tập')
  assert.match(proWs, /#trial-management\?lessonId=l1/, 'Workspace Pro phải có link sang Quản lý học thử')

  assertSuperset(proWsHooks, classicWsHooks, 'Curriculum Pro Workspace Detail')
})

test('(c) gọi hàm bind trên DOM Pro giả lập không ném lỗi', () => {
  fixture()
  setUI('mochi')

  const currentClass = state.classes[0]
  const proMarkup = renderCurriculumTabHTML(currentClass)

  // Giả lập DOM tối thiểu từ markup Pro
  const domElements = new Map()

  // Tạo mock element hỗ trợ addEventListener & querySelectorAll
  function createMockElement(id = '', className = '') {
    return {
      id,
      className,
      value: '',
      style: {},
      addEventListener: () => {},
      removeEventListener: () => {},
      querySelectorAll: () => [],
      querySelector: () => null,
      getAttribute: () => '',
      setAttribute: () => {},
      dataset: {}
    }
  }

  // Thu thập mọi id từ markup để mock getElementById
  for (const match of proMarkup.matchAll(/\bid="([^"]+)"/g)) {
    domElements.set(match[1], createMockElement(match[1]))
  }

  const origGetElementById = document.getElementById
  const origQuerySelectorAll = document.querySelectorAll

  document.getElementById = (id) => domElements.get(id) || null
  document.querySelectorAll = () => []

  try {
    assert.doesNotThrow(() => {
      bindCurriculumTabEvents(currentClass.id, currentClass, () => {})
    }, 'bindCurriculumTabEvents không được ném lỗi trên DOM Pro')
  } finally {
    document.getElementById = origGetElementById
    document.querySelectorAll = origQuerySelectorAll
  }
})

test('(d) dữ liệu rỗng/lỗi không crash', () => {
  setUI('mochi')

  // 1. Lớp null không crash
  assert.doesNotThrow(() => {
    const html = renderCurriculumTabHTML(null)
    assert.match(html, /Không tìm thấy thông tin lớp học/)
  }, 'currentClass = null không làm crash renderer')

  // 2. Không có chương nào (empty state)
  const emptyClass = { id: 'c-empty', name: 'Lớp Trống', gradeBlock: '10' }
  state.curriculums = [{ classId: 'c-empty', chapters: [] }]

  assert.doesNotThrow(() => {
    const html = renderCurriculumTabHTML(emptyClass)
    assert.match(html, /Chưa có chương học nào cho lớp học này/)
    assert.match(html, /id="add-chapter-btn"/)
    assert.match(html, /id="add-chapter-btn-grid"/)
  }, 'Lớp không có chương học render empty state an toàn')
})

test('(e) mọi rule CSS mới có tiền tố html[data-admin-ui="pro"]', () => {
  const selectors = collectRuleSelectors(curriculumCss)
  assert.ok(selectors.length > 0, 'Phải có ít nhất 1 selector trong curriculum.css')

  for (const selectorList of selectors) {
    for (const selector of splitSelectorList(selectorList)) {
      const trimmed = selector.trim()
      assert.match(trimmed, /^html\[data-admin-ui="pro"\]/, `Selector chưa scope: ${trimmed}`)
    }
  }

  assert.match(curriculumCss, /@media\s*\(max-width:\s*1023px\)/, 'Phải có responsive breakpoint 1023px cho dải chip chương')
  assert.match(curriculumCss, /@media\s*\(max-width:\s*900px\)/, 'Phải có responsive breakpoint 900px')
  assert.match(curriculumCss, /@media\s*\(max-width:\s*640px\)/, 'Phải có responsive breakpoint 640px')
  assert.match(curriculumCss, /overflow-x:\s*auto/, 'Phải hỗ trợ cuộn ngang overflow-x: auto')

  // Không có màu cứng ngoài biến --ap-*
  const hexColors = curriculumCss.match(/#[0-9a-fA-F]{3,8}/g) || []
  assert.equal(hexColors.length, 0, `Không được dùng màu cứng hex: ${hexColors.join(', ')}`)
})
