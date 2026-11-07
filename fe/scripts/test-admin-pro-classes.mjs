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
  location: { hash: '#classes-admin', search: '' },
  addEventListener: () => {},
  matchMedia: () => ({ matches: false }),
  open: () => null
}

const { state } = await import('../src/js/state.js')
const { setTheme } = await import('../src/js/theme.js')
const { renderClassMgmtView } = await import('../src/js/views/class-mgmt.js')
const { renderClassDetailsView } = await import('../src/js/views/class-details.js')
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

test('(a) opt-out classic giữ nguyên root markup và id cũ của nhóm classes', () => {
  fixture()
  setUI('classic')

  window.location.hash = '#classes-admin'
  const classMgmt = renderClassMgmtView()
  assert.match(classMgmt, /<div class="app-layout">/)
  assert.doesNotMatch(classMgmt, /id="classes-admin"/)

  window.location.hash = '#class-details?classId=class-1'
  const classDetails = renderClassDetailsView()
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

  window.location.search = '?ui=classic'
  assert.equal(renderClassMgmtView(), classMgmt, 'query opt-out không thay đổi output classic của class-mgmt')
  assert.equal(renderGradeBlocksView(), gradeBlocks, 'query opt-out không thay đổi output classic của grade-blocks')
})

test('(b) Pro có root hook mới và giữ toàn bộ id/data-* chức năng của classic cho cả 4 view', () => {
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

  window.location.hash = '#classes-admin'
  const proMgmt = renderClassMgmtView()
  assert.match(proMgmt, /class="app-layout admin-dark" id="classes-admin" data-route="classes-admin" data-role="ADMIN"/)
  assertSuperset(functionalHooks(proMgmt), functionalHooks(classicMgmt), 'ClassMgmt Pro')

  window.location.hash = '#class-details?classId=class-1'
  const proDetails = renderClassDetailsView()
  assert.match(proDetails, /class="app-layout admin-dark" id="class-details" data-route="class-details" data-role="ADMIN"/)
  assertSuperset(functionalHooks(proDetails), functionalHooks(classicDetails), 'ClassDetails Pro')

  window.location.hash = '#curriculum'
  const proCurriculum = renderCurriculumView()
  assert.match(proCurriculum, /class="app-layout admin-dark" id="curriculum" data-route="curriculum" data-role="ADMIN"/)
  assertSuperset(functionalHooks(proCurriculum), functionalHooks(classicCurriculum), 'Curriculum Pro')

  window.location.hash = '#grade-blocks'
  const proGradeBlocks = renderGradeBlocksView()
  assert.match(proGradeBlocks, /class="app-layout admin-dark" id="grade-blocks" data-route="grade-blocks" data-role="ADMIN"/)
  assertSuperset(functionalHooks(proGradeBlocks), functionalHooks(classicGradeBlocks), 'GradeBlocks Pro')
})

test('(c) mọi rule trong classes.css đều được scope bằng cổng html[data-admin-ui="pro"]', () => {
  const selectors = collectRuleSelectors(classesCss)
  assert.ok(selectors.length > 0, 'Phải có ít nhất 1 selector trong classes.css')
  for (const selectorList of selectors) {
    for (const selector of splitSelectorList(selectorList)) {
      assert.match(selector.trim(), /^html\[data-admin-ui="pro"\]/, `Selector chưa scope: ${selector.trim()}`)
    }
  }
  assert.match(classesCss, /@media\s*\(max-width:\s*900px\)/, 'Phải có responsive breakpoint 900px')
  assert.match(classesCss, /@media\s*\(max-width:\s*640px\)/, 'Phải có responsive breakpoint 640px')
  assert.match(classesCss, /overflow-x:\s*auto/, 'Phải hỗ trợ cuộn ngang bảng overflow-x: auto')
})
