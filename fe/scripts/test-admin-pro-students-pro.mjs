import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

const saved = new Map([['eduportal-ui', 'classic']])
const storage = {
  getItem: key => saved.get(key) ?? null,
  setItem: (key, value) => saved.set(key, String(value)),
  removeItem: key => saved.delete(key)
}

globalThis.localStorage = storage
globalThis.sessionStorage = storage
globalThis.CustomEvent = class { constructor(type, options = {}) { this.type = type; this.detail = options.detail } }
globalThis.confirm = () => false
globalThis.document = {
  documentElement: { dataset: {}, style: {} },
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
const {
  renderStudentMgmtView,
  renderClassicStudentMgmtView,
  bindStudentMgmtEvents
} = await import('../src/js/views/student-mgmt.js')
const {
  renderStudentDetailsView,
  renderClassicStudentDetailsView,
  bindStudentDetailsEvents
} = await import('../src/js/views/student-details.js')

function fixture() {
  state.token = 'admin-token'
  state.user = { id: 'admin-1', role: 'ADMIN', fullName: 'Quản trị viên' }
  state.classes = [{ id: 'c1', name: 'Toán 12', tuitionFee: 120000 }]
  state.students = [{
    id: 's1', fullName: 'Nguyễn Minh Anh', username: 'minhanh', studentCode: 'HS001',
    classId: 'c1', classIds: ['c1'], className: 'Toán 12', balance: -50000,
    status: 'Hoạt động', createdAt: '10/11/2026'
  }]
}

function setUI(value) {
  saved.set('eduportal-ui', value)
  window.location.search = ''
}

function hooks(markup) {
  const result = new Set()
  for (const match of markup.matchAll(/\bid="([^"]+)"/g)) result.add(`id:${match[1]}`)
  for (const match of markup.matchAll(/\b(data-[\w-]+)(?:=|\s|>)/g)) result.add(match[1])
  return result
}

function assertSuperset(actual, expected) {
  for (const hook of expected) assert.ok(actual.has(hook), `Pro phải giữ hook ${hook}`)
}

function cssSelectors(css) {
  const selectors = []
  const source = css.replace(/\/\*[\s\S]*?\*\//g, '')
  const walk = block => {
    let cursor = 0
    while (cursor < block.length) {
      const open = block.indexOf('{', cursor)
      if (open < 0) break
      const prelude = block.slice(cursor, open).trim()
      let depth = 1
      let close = open + 1
      while (close < block.length && depth) {
        if (block[close] === '{') depth++
        if (block[close] === '}') depth--
        close++
      }
      const body = block.slice(open + 1, close - 1)
      if (/^@media\b/.test(prelude)) walk(body)
      else if (prelude && !prelude.startsWith('@')) {
        let start = 0
        let selectorDepth = 0
        for (let i = 0; i < prelude.length; i++) {
          if (prelude[i] === '(' || prelude[i] === '[') selectorDepth++
          if (prelude[i] === ')' || prelude[i] === ']') selectorDepth--
          if (prelude[i] === ',' && selectorDepth === 0) {
            selectors.push(prelude.slice(start, i))
            start = i + 1
          }
        }
        selectors.push(prelude.slice(start))
      }
      cursor = close
    }
  }
  walk(source)
  return selectors
}

test('(a) cờ tắt gọi đúng renderer classic không thay đổi output', () => {
  fixture()
  setUI('classic')
  window.location.hash = '#students'
  assert.equal(renderStudentMgmtView(), renderClassicStudentMgmtView())
  window.location.hash = '#student-details?studentId=s1&classId=c1'
  assert.equal(renderStudentDetailsView(), renderClassicStudentDetailsView())
})

test('(b) Pro có bố cục mới và tập hook chức năng là superset classic', () => {
  fixture()
  setUI('classic')
  window.location.hash = '#students'
  const classicList = renderStudentMgmtView()
  window.location.hash = '#student-details?studentId=s1&classId=c1'
  const classicDetail = renderStudentDetailsView()

  setUI('mochi')
  window.location.hash = '#students'
  const proList = renderStudentMgmtView()
  assert.match(proList, /ap-student-stats/)
  assert.match(proList, /ap-student-filter/)
  assert.match(proList, /ap-students-table-card/)
  assert.match(proList, /aria-label="Nạp học phí cho Nguyễn Minh Anh"/)
  assertSuperset(hooks(proList), hooks(classicList))

  window.location.hash = '#student-details?studentId=s1&classId=c1'
  const proDetail = renderStudentDetailsView()
  assert.match(proDetail, /ap-profile-card/)
  assert.match(proDetail, /ap-detail-summary/)
  assert.match(proDetail, /ap-schedule-card/)
  assert.match(proDetail, /ap-homework-card/)
  assert.match(proDetail, /detail-add-balance-btn/)
  assert.match(proDetail, /detail-toggle-lock-btn/)
  assertSuperset(hooks(proDetail), hooks(classicDetail))
})

test('(c) bind trên DOM Pro tối thiểu không ném lỗi', () => {
  fixture()
  setUI('mochi')
  window.location.hash = '#students'
  assert.doesNotThrow(() => bindStudentMgmtEvents())
  window.location.hash = '#student-details?studentId=s1&classId=c1'
  assert.doesNotThrow(() => bindStudentDetailsEvents())
})

test('(d) dữ liệu rỗng và route lỗi render trạng thái rõ ràng, không crash', () => {
  fixture()
  setUI('mochi')
  state.students = []
  window.location.hash = '#students'
  assert.match(renderStudentMgmtView(), /Chưa có học sinh phù hợp/)
  window.location.hash = '#student-details?studentId=missing&classId=c1'
  assert.match(renderStudentDetailsView(), /Không tìm thấy thông tin học sinh/)
})

test('(e) mọi rule CSS mới đều có scope Pro và đủ breakpoint', () => {
  const css = readFileSync(new URL('../src/css/admin-pro/pages/students-pro.css', import.meta.url), 'utf8')
  const selectors = cssSelectors(css)
  assert.ok(selectors.length > 0)
  for (const selector of selectors) assert.match(selector.trim(), /^html\[data-admin-ui="pro"\]/, `Selector chưa scope: ${selector.trim()}`)
  assert.match(css, /@media\s*\(max-width:\s*1279px\)/)
  assert.match(css, /@media\s*\(max-width:\s*900px\)/)
  assert.match(css, /@media\s*\(max-width:\s*640px\)/)
  assert.match(css, /overflow-x:\s*auto/)
})
