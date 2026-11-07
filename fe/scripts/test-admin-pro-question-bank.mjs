// fe/scripts/test-admin-pro-question-bank.mjs
// Unit tests cho Mochi Pro Admin UI — Nhóm G4: Question Bank

import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { register } from 'node:module'

// Bỏ qua import .css và .svg trong môi trường Node test
register('data:text/javascript,' + encodeURIComponent(`
  export async function load(url, context, nextLoad) {
    if (url.endsWith('.css')) {
      return { format: 'module', shortCircuit: true, source: '' }
    }
    if (url.endsWith('.svg')) {
      return { format: 'module', shortCircuit: true, source: 'export default "test.svg";' }
    }
    return nextLoad(url, context)
  }
`))

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)

const saved = new Map()
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
  documentElement: { dataset: {}, style: {} },
  addEventListener: () => {},
  dispatchEvent: () => {},
  querySelectorAll: () => [],
  querySelector: () => null,
  getElementById: () => null,
  head: {}
}
globalThis.window = {
  location: { hash: '#question-bank', search: '' },
  addEventListener: () => {},
  matchMedia: () => ({ matches: false })
}

const { state } = await import('../src/js/state.js')
const { isAdminProUI } = await import('../src/js/ui-flag.js')
const { renderQuestionBankView } = await import('../src/js/views/question-bank.js')

function useAdmin() {
  state.token = 'admin-token'
  state.user = { id: 'admin-1', role: 'ADMIN', fullName: 'Thầy Hoàng', username: 'admin' }
}

function setUI(value, query = '') {
  saved.set('eduportal-ui', value)
  window.location.search = query
}

function extractIds(html) {
  const matches = [...html.matchAll(/\bid="([^"]+)"/g)].map(m => m[1])
  return new Set(matches)
}

function extractDataAttrs(html) {
  const matches = [...html.matchAll(/\b(data-[a-zA-Z0-9_-]+)(?:="([^"]*)")?/g)].map(m => m[1])
  return new Set(matches)
}

test('(a) Opt-out classic: renderQuestionBankView trả về layout classic y hệt trước khi sửa', () => {
  useAdmin()
  setUI('classic')
  assert.equal(isAdminProUI(), false, 'isAdminProUI phải là false khi opt-out classic')

  const htmlClassic = renderQuestionBankView()

  // Không có class Pro
  assert.doesNotMatch(htmlClassic, /class="[^"]*\bap-question-bank\b[^"]*"/, 'Classic không được chứa class ap-question-bank')
  assert.match(htmlClassic, /<div class="app-layout">/, 'Classic layout phải có class="app-layout" nguyên bản')

  // Đầy đủ các thành phần chức năng ngân hàng câu hỏi
  assert.match(htmlClassic, /id="stat-total-q"/, 'Phải có id stat-total-q')
  assert.match(htmlClassic, /id="stat-mc-q"/, 'Phải có id stat-mc-q')
  assert.match(htmlClassic, /id="stat-tf-q"/, 'Phải có id stat-tf-q')
  assert.match(htmlClassic, /id="stat-sa-q"/, 'Phải có id stat-sa-q')
  assert.match(htmlClassic, /id="qb-filter-grade-block"/, 'Phải có id qb-filter-grade-block')
  assert.match(htmlClassic, /id="qb-filter-class"/, 'Phải có id qb-filter-class')
  assert.match(htmlClassic, /id="qb-filter-chapter"/, 'Phải có id qb-filter-chapter')
  assert.match(htmlClassic, /id="qb-search-input"/, 'Phải có id qb-search-input')
  assert.match(htmlClassic, /id="qb-bulk-bar"/, 'Phải có id qb-bulk-bar')
  assert.match(htmlClassic, /id="qb-questions-container"/, 'Phải có id qb-questions-container')
  assert.match(htmlClassic, /id="qb-modal-container"/, 'Phải có id qb-modal-container')
  assert.match(htmlClassic, /id="btn-open-matrix-gen"/, 'Phải có nút tạo đề theo ma trận')
  assert.match(htmlClassic, /id="btn-open-sync-modal"/, 'Phải có nút đồng bộ sang constant')
})

test('(b) Pro mode: có hook class ap-question-bank và tập id, data-* chức năng ⊇ bản classic', () => {
  useAdmin()
  setUI('mochi')
  assert.equal(isAdminProUI(), true, 'isAdminProUI phải là true khi ADMIN chọn mochi')

  const htmlPro = renderQuestionBankView()

  // Kiểm tra hook class Pro
  assert.match(htmlPro, /<div class="app-layout ap-question-bank">/, 'Pro layout phải có class ap-question-bank')

  // So sánh tập ID chức năng giữa Pro và Classic
  setUI('classic')
  const htmlClassic = renderQuestionBankView()
  setUI('mochi')

  const idsClassic = extractIds(htmlClassic)
  const idsPro = extractIds(htmlPro)

  for (const id of idsClassic) {
    assert.ok(idsPro.has(id), `Pro mode phải chứa id "${id}" của classic (tập id ⊇ classic)`)
  }

  const dataAttrsClassic = extractDataAttrs(htmlClassic)
  const dataAttrsPro = extractDataAttrs(htmlPro)

  for (const attr of dataAttrsClassic) {
    assert.ok(dataAttrsPro.has(attr), `Pro mode phải chứa attribute "${attr}" của classic`)
  }
})

test('(c) Mọi rule trong fe/src/css/admin-pro/pages/question-bank.css đều có tiền tố html[data-admin-ui="pro"]', () => {
  const cssPath = path.resolve(__dirname, '../src/css/admin-pro/pages/question-bank.css')
  assert.ok(fs.existsSync(cssPath), `File CSS phải tồn tại tại ${cssPath}`)

  const css = fs.readFileSync(cssPath, 'utf8')
  const cleanCss = css.replace(/\/\*[\s\S]*?\*\//g, '')

  function splitSelectors(selectorStr) {
    const result = []
    let current = ''
    let parenDepth = 0
    let bracketDepth = 0
    let quote = null

    for (let i = 0; i < selectorStr.length; i++) {
      const c = selectorStr[i]
      if (quote) {
        current += c
        if (c === quote && selectorStr[i - 1] !== '\\') quote = null
      } else if (c === '"' || c === "'") {
        quote = c
        current += c
      } else if (c === '(') {
        parenDepth++
        current += c
      } else if (c === ')') {
        parenDepth--
        current += c
      } else if (c === '[') {
        bracketDepth++
        current += c
      } else if (c === ']') {
        bracketDepth--
        current += c
      } else if (c === ',' && parenDepth === 0 && bracketDepth === 0) {
        result.push(current.trim())
        current = ''
      } else {
        current += c
      }
    }
    if (current.trim()) result.push(current.trim())
    return result
  }

  const lines = cleanCss.split('\n')
  const testedSelectors = []
  const invalidSelectors = []

  for (let line of lines) {
    line = line.trim()
    if (!line || line.startsWith('@media')) continue
    if (line.includes('{')) {
      const selPart = line.split('{')[0].trim()
      if (!selPart) continue
      const subSelectors = splitSelectors(selPart)
      for (const sub of subSelectors) {
        testedSelectors.push(sub)
        if (!sub.startsWith('html[data-admin-ui="pro"]')) {
          invalidSelectors.push(sub)
        }
      }
    }
  }

  assert.ok(testedSelectors.length >= 25, `CSS phải có đủ rules (đã kiểm tra ${testedSelectors.length} selectors)`)
  assert.deepEqual(invalidSelectors, [], `Tất cả selectors phải bắt đầu bằng html[data-admin-ui="pro"]. Vi phạm: ${invalidSelectors.join(', ')}`)
})

test('(d) Token styling: CSS bao gồm đầy đủ màu sắc mức độ và loại câu hỏi theo prototype Mochi Pro', () => {
  const cssPath = path.resolve(__dirname, '../src/css/admin-pro/pages/question-bank.css')
  const css = fs.readFileSync(cssPath, 'utf8')

  // Mức độ nhận thức: Nhận biết=ok, Thông hiểu=blue, Vận dụng=warn, Vận dụng cao=accent2
  assert.match(css, /var\(--ap-ok\)/, 'Phải có token --ap-ok cho Nhận biết')
  assert.match(css, /var\(--ap-blue\)/, 'Phải có token --ap-blue cho Thông hiểu')
  assert.match(css, /var\(--ap-warn\)/, 'Phải có token --ap-warn cho Vận dụng')
  assert.match(css, /var\(--ap-accent2\)/, 'Phải có token --ap-accent2 cho Vận dụng cao')

  // Loại câu hỏi: Trắc nghiệm, Đúng/Sai, Trả lời ngắn
  assert.match(css, /var\(--ap-accent\)/, 'Phải có token --ap-accent')

  // KaTeX và media bảo toàn
  assert.match(css, /\.katex/, 'Phải có rule bảo toàn cho .katex')
  assert.match(css, /\.math-content/, 'Phải có rule cho .math-content')

  // Responsive breakpoints
  assert.match(css, /@media\s*\(max-width:\s*900px\)/, 'Phải có breakpoint 900px')
  assert.match(css, /@media\s*\(max-width:\s*640px\)/, 'Phải có breakpoint 640px')
})
