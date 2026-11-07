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
  documentElement: { dataset: { theme: 'light' }, style: {} },
  addEventListener: () => {},
  dispatchEvent: () => {},
  querySelector: () => null,
  querySelectorAll: () => [],
  getElementById: () => null
}
globalThis.window = {
  location: { hash: '#homework-mgmt', search: '' },
  addEventListener: () => {},
  matchMedia: () => ({ matches: false }),
  open: () => null
}

const { state } = await import('../src/js/state.js')
const { renderHomeworkMgmtView } = await import('../src/js/views/homework-mgmt.js')
const { renderCreateHwView, resetCreateForm } = await import('../src/js/views/create-hw.js')

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

test('(a) opt-out classic giữ nguyên output của cả hai view homework', () => {
  fixture()
  setUI('classic')

  window.location.hash = '#homework-mgmt'
  const classicMgmt = renderHomeworkMgmtView()
  assert.match(classicMgmt, /<div class="app-layout">/)
  assert.doesNotMatch(classicMgmt, /\bap-homework-mgmt\b/)

  window.location.hash = '#create-homework'
  const classicCreate = renderCreateHwView()
  assert.match(classicCreate, /<div class="app-layout">/)
  assert.doesNotMatch(classicCreate, /\bap-create-homework\b/)

  window.location.search = '?ui=classic'
  window.location.hash = '#homework-mgmt'
  assert.equal(renderHomeworkMgmtView(), classicMgmt, 'query opt-out phải giữ nguyên output homework-mgmt classic')
  window.location.hash = '#create-homework'
  assert.equal(renderCreateHwView(), classicCreate, 'query opt-out phải giữ nguyên output create-homework classic')
})

test('(b) Pro có hook giao diện và giữ tập id/data-* chức năng của classic', () => {
  fixture()
  setUI('classic')
  window.location.hash = '#homework-mgmt'
  const classicMgmt = renderHomeworkMgmtView()
  window.location.hash = '#create-homework'
  const classicCreate = renderCreateHwView()

  setUI('mochi')
  window.location.hash = '#homework-mgmt'
  const proMgmt = renderHomeworkMgmtView()
  window.location.hash = '#create-homework'
  const proCreate = renderCreateHwView()

  assert.match(proMgmt, /<div class="app-layout ap-homework-mgmt">/)
  assert.match(proCreate, /<div class="app-layout ap-create-homework">/)
  assertSuperset(functionalHooks(proMgmt), functionalHooks(classicMgmt), 'HomeworkMgmt Pro')
  assertSuperset(functionalHooks(proCreate), functionalHooks(classicCreate), 'CreateHomework Pro')

  assert.match(proMgmt, /id="hw-table-body"/)
  assert.match(proCreate, /id="hw-markdown-input"/)
  assert.match(proCreate, /id="answer-matrix-container"/)
  assert.match(proCreate, /id="save-homework-btn"/)
})

test('(c) mọi rule homework.css đều scope qua html[data-admin-ui="pro"]', () => {
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
