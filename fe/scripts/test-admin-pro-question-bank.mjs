// fe/scripts/test-admin-pro-question-bank.mjs
// Unit tests cho Mochi Pro Admin UI — Nhóm G4: Question Bank

import test from "node:test"
import assert from "node:assert/strict"
import fs from "node:fs"
import path from "node:path"
import { fileURLToPath } from "node:url"
import { register } from "node:module"

// Bỏ qua import .css và .svg trong môi trường Node test
register("data:text/javascript," + encodeURIComponent(`
  export async function load(url, context, nextLoad) {
    if (url.endsWith(".css")) {
      return { format: "module", shortCircuit: true, source: "" }
    }
    if (url.endsWith(".svg")) {
      return { format: "module", shortCircuit: true, source: "export default 'test.svg';" }
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

const mockElements = new Map()
function createMockElement(id = "", tag = "div") {
  const el = {
    id,
    tagName: tag.toUpperCase(),
    dataset: {},
    classList: {
      _classes: new Set(),
      add: function(...c) { c.forEach(x => this._classes.add(x)) },
      remove: function(...c) { c.forEach(x => this._classes.delete(x)) },
      contains: function(c) { return this._classes.has(c) },
      toggle: function(c, force) {
        if (force === true) { this._classes.add(c); return true }
        if (force === false) { this._classes.delete(c); return false }
        if (this._classes.has(c)) { this._classes.delete(c); return false }
        this._classes.add(c); return true
      }
    },
    style: {},
    value: "",
    checked: false,
    textContent: "",
    innerHTML: "",
    addEventListener: () => {},
    removeEventListener: () => {},
    querySelector: () => null,
    querySelectorAll: () => [],
    closest: () => el,
    setAttribute: () => {},
    getAttribute: () => ""
  }
  return el
}

globalThis.document = {
  documentElement: { dataset: {}, style: {} },
  addEventListener: () => {},
  dispatchEvent: () => {},
  querySelectorAll: () => [],
  querySelector: () => null,
  getElementById: (id) => {
    if (!mockElements.has(id)) {
      mockElements.set(id, createMockElement(id))
    }
    return mockElements.get(id)
  },
  head: {}
}
globalThis.window = {
  location: { hash: "#question-bank", search: "" },
  addEventListener: () => {},
  matchMedia: () => ({ matches: false })
}

const { state } = await import("../src/js/state.js")
const { api } = await import("../src/js/api.js")
const { isAdminProUI } = await import("../src/js/ui-flag.js")
const {
  renderQuestionBankView,
  renderClassicQuestionBankView,
  renderProQuestionBankView,
  bindQuestionBankEvents,
  parseQuestionPrompt
} = await import("../src/js/views/question-bank.js")

function useAdmin() {
  state.token = "admin-token"
  state.user = { id: "admin-1", role: "ADMIN", fullName: "Thầy Hoàng", username: "admin" }
}

function setUI(value, query = "") {
  saved.set("eduportal-ui", value)
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

test("(a) Opt-out classic: renderQuestionBankView trả về layout classic y hệt trước khi sửa", () => {
  useAdmin()
  setUI("classic")
  assert.equal(isAdminProUI(), false, "isAdminProUI phải là false khi opt-out classic")

  const htmlClassic = renderQuestionBankView()
  const htmlDirectClassic = renderClassicQuestionBankView()

  // So sánh y hệt với hàm renderClassicQuestionBankView
  assert.equal(htmlClassic, htmlDirectClassic, "Classic output phải khớp hoàn toàn renderClassicQuestionBankView")

  // Không có class Pro
  assert.doesNotMatch(htmlClassic, /class="[^"]*\bap-question-bank\b[^"]*"/, "Classic không được chứa class ap-question-bank")
  assert.match(htmlClassic, /<div class="app-layout">/, "Classic layout phải có class=\"app-layout\" nguyên bản")

  // Đầy đủ các thành phần chức năng ngân hàng câu hỏi
  assert.match(htmlClassic, /id="stat-total-q"/, "Phải có id stat-total-q")
  assert.match(htmlClassic, /id="stat-mc-q"/, "Phải có id stat-mc-q")
  assert.match(htmlClassic, /id="stat-tf-q"/, "Phải có id stat-tf-q")
  assert.match(htmlClassic, /id="stat-sa-q"/, "Phải có id stat-sa-q")
  assert.match(htmlClassic, /id="qb-filter-grade-block"/, "Phải có id qb-filter-grade-block")
  assert.match(htmlClassic, /id="qb-filter-class"/, "Phải có id qb-filter-class")
  assert.match(htmlClassic, /id="qb-filter-chapter"/, "Phải có id qb-filter-chapter")
  assert.match(htmlClassic, /id="qb-search-input"/, "Phải có id qb-search-input")
  assert.match(htmlClassic, /id="qb-bulk-bar"/, "Phải có id qb-bulk-bar")
  assert.match(htmlClassic, /id="qb-questions-container"/, "Phải có id qb-questions-container")
  assert.match(htmlClassic, /id="qb-modal-container"/, "Phải có id qb-modal-container")
  assert.match(htmlClassic, /id="btn-open-matrix-gen"/, "Phải có nút tạo đề theo ma trận")
  assert.match(htmlClassic, /id="btn-open-sync-modal"/, "Phải có nút đồng bộ sang constant")
})

test("(b) Pro mode: có các khối chính theo prototype và tập id, data-* chức năng ⊇ bản classic", () => {
  useAdmin()
  setUI("mochi")
  assert.equal(isAdminProUI(), true, "isAdminProUI phải là true khi ADMIN chọn mochi")

  const htmlPro = renderQuestionBankView()

  // Kiểm tra hook class Pro
  assert.match(htmlPro, /<div class="app-layout ap-question-bank">/, "Pro layout phải có class ap-question-bank")

  // 1. Header & Page Actions
  assert.match(htmlPro, /class="ap-qb-header"/, "Phải có header ap-qb-header")
  assert.match(htmlPro, /class="ap-qb-title"/, "Phải có title ap-qb-title")
  assert.match(htmlPro, /id="btn-open-matrix-gen"/, "Phải có id btn-open-matrix-gen")
  assert.match(htmlPro, /id="btn-open-sync-modal"/, "Phải có id btn-open-sync-modal")
  assert.match(htmlPro, /id="btn-open-taxonomy-modal"/, "Phải có id btn-open-taxonomy-modal")
  assert.match(htmlPro, /id="btn-open-import-md"/, "Phải có id btn-open-import-md")
  assert.match(htmlPro, /id="btn-open-import-hw"/, "Phải có id btn-open-import-hw")

  // 2. Statistics KPI Cards
  assert.match(htmlPro, /class="ap-qb-stats-grid"/, "Phải có grid KPI thống kê")
  assert.match(htmlPro, /id="stat-total-q"/, "Phải có id stat-total-q")
  assert.match(htmlPro, /id="stat-mc-q"/, "Phải có id stat-mc-q")
  assert.match(htmlPro, /id="stat-tf-q"/, "Phải có id stat-tf-q")
  assert.match(htmlPro, /id="stat-sa-q"/, "Phải có id stat-sa-q")

  // 3. Filter Section & Level Chips
  assert.match(htmlPro, /class="card ap-qb-filter-section"/, "Phải có section bộ lọc")
  assert.match(htmlPro, /id="qb-filter-grade-block"/, "Phải có id qb-filter-grade-block")
  assert.match(htmlPro, /id="qb-filter-class"/, "Phải có id qb-filter-class")
  assert.match(htmlPro, /id="qb-filter-chapter"/, "Phải có id qb-filter-chapter")
  assert.match(htmlPro, /id="qb-filter-lesson-wrap"/, "Phải có id qb-filter-lesson-wrap")
  assert.match(htmlPro, /id="qb-filter-question-type-id"/, "Phải có id qb-filter-question-type-id")
  assert.match(htmlPro, /id="qb-filter-type"/, "Phải có id qb-filter-type")
  assert.match(htmlPro, /id="qb-filter-difficulty"/, "Phải có id qb-filter-difficulty")
  assert.match(htmlPro, /id="qb-filter-unassigned"/, "Phải có id qb-filter-unassigned")
  assert.match(htmlPro, /class="ap-diff-chips-group"/, "Phải có nhóm chips mức độ nhận thức")
  assert.match(htmlPro, /data-diff="NHAN_BIET"/, "Phải có chip Nhận biết")
  assert.match(htmlPro, /data-diff="THONG_HIEU"/, "Phải có chip Thông hiểu")
  assert.match(htmlPro, /data-diff="VAN_DUNG"/, "Phải có chip Vận dụng")
  assert.match(htmlPro, /data-diff="VAN_DUNG_CAO"/, "Phải có chip Vận dụng cao")
  assert.match(htmlPro, /id="qb-search-input"/, "Phải có id qb-search-input")
  assert.match(htmlPro, /id="qb-btn-reset-filters"/, "Phải có id qb-btn-reset-filters")

  // 4. Main Grid & Sticky Cart Panel
  assert.match(htmlPro, /class="ap-qb-main-grid"/, "Phải có bố cục lưới 2 cột ap-qb-main-grid")
  assert.match(htmlPro, /class="ap-qb-cart-panel"/, "Phải có panel aside Đề đang tạo sticky")
  assert.match(htmlPro, /id="ap-cart-selected-count"/, "Phải có badge đếm câu đang tạo")
  assert.match(htmlPro, /id="ap-cart-mc-count"/, "Phải có đếm trắc nghiệm")
  assert.match(htmlPro, /id="ap-cart-tf-count"/, "Phải có đếm đúng sai")
  assert.match(htmlPro, /id="ap-cart-sa-count"/, "Phải có đếm trả lời ngắn")
  assert.match(htmlPro, /id="ap-cart-total-points"/, "Phải có tổng điểm dự kiến")
  assert.match(htmlPro, /id="ap-cart-create-btn"/, "Phải có nút tạo bài tập từ câu đã chọn")
  assert.match(htmlPro, /id="ap-cart-clear-btn"/, "Phải có nút bỏ chọn tất cả")

  // 5. Questions List & Bulk Bar & Modals
  assert.match(htmlPro, /id="qb-select-all-page"/, "Phải có id qb-select-all-page")
  assert.match(htmlPro, /id="qb-current-count"/, "Phải có id qb-current-count")
  assert.match(htmlPro, /id="qb-bulk-bar"/, "Phải có id qb-bulk-bar")
  assert.match(htmlPro, /id="qb-questions-container"/, "Phải có id qb-questions-container")
  assert.match(htmlPro, /id="qb-pagination-container"/, "Phải có id qb-pagination-container")
  assert.match(htmlPro, /id="qb-modal-container"/, "Phải có id qb-modal-container")

  // So sánh tập ID chức năng giữa Pro và Classic
  setUI("classic")
  const htmlClassic = renderQuestionBankView()
  setUI("mochi")

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

test("(c) gọi hàm bind trên DOM Pro giả lập không ném lỗi", async () => {
  useAdmin()
  setUI("mochi")

  // Mock API methods called during bind
  api.getConstantTaxonomy = async () => ({
    gradeBlocks: [{ code: "12-Toán", name: "Khối 12 Toán" }],
    classes: [{ id: "c1", name: "12A1", grade_block: "12-Toán" }],
    chapters: [{ id: "ch1", class_id: "c1", title: "Chương 1" }],
    lessons: [{ id: "l1", chapter_id: "ch1", title: "Bài 1", order_index: 1 }],
    questionTypes: [{ id: "t1", lesson_id: "l1", name: "Dạng 1" }]
  })
  api.getClasses = async () => [{ id: "c1", name: "12A1", gradeBlock: "12-Toán" }]
  api.getQuestionBank = async () => ({
    items: [
      {
        id: "q-1",
        question_type: "MULTIPLE_CHOICE",
        difficulty: "NHAN_BIET",
        prompt: JSON.stringify({ text: "Hàm số y = x^2 đạt cực trị tại x = ?", options: [{ key: "A", text: "x = 0" }, { key: "B", text: "x = 1" }] }),
        mc_answer: "A",
        usage_count: 5
      }
    ],
    total: 1,
    stats: { total: 1, mc: 1, tf: 0, sa: 0, diffCounts: { NHAN_BIET: 1, THONG_HIEU: 0, VAN_DUNG: 0, VAN_DUNG_CAO: 0 } }
  })
  api.getQuestionBankStats = async () => ({
    total: 1, mc: 1, tf: 0, sa: 0, diffCounts: { NHAN_BIET: 1, THONG_HIEU: 0, VAN_DUNG: 0, VAN_DUNG_CAO: 0 }
  })

  // Gọi bindQuestionBankEvents không ném lỗi
  await assert.doesNotReject(async () => {
    await bindQuestionBankEvents()
  }, "bindQuestionBankEvents phải chạy thành công trên mock DOM")
})

test("(d) dữ liệu rỗng/lỗi không crash và parseQuestionPrompt xử lý an toàn", () => {
  // Test prompt parsing edge cases
  assert.equal(parseQuestionPrompt(null).text, "")
  assert.equal(parseQuestionPrompt(undefined).text, "")
  assert.equal(parseQuestionPrompt("").text, "")
  assert.equal(parseQuestionPrompt("Câu hỏi đơn giản").text, "Câu hỏi đơn giản")
  assert.deepEqual(parseQuestionPrompt({ text: "Câu hỏi object", options: [] }).options, [])

  // Nested JSON string unwrapping test
  const doubleNested = JSON.stringify({ text: JSON.stringify({ text: "Nội dung câu lồng", options: [{ key: "A", text: "1" }] }) })
  const unwrapped = parseQuestionPrompt(doubleNested)
  assert.equal(unwrapped.text, "Nội dung câu lồng")
  assert.equal(unwrapped.options.length, 1)
})

test("(e) Mọi rule trong fe/src/css/admin-pro/pages/question-bank.css đều có tiền tố html[data-admin-ui=\"pro\"]", () => {
  const cssPath = path.resolve(__dirname, "../src/css/admin-pro/pages/question-bank.css")
  assert.ok(fs.existsSync(cssPath), `File CSS phải tồn tại tại ${cssPath}`)

  const css = fs.readFileSync(cssPath, "utf8")
  const cleanCss = css.replace(/\/\*[\s\S]*?\*\//g, "")

  function splitSelectors(selectorStr) {
    const result = []
    let current = ""
    let parenDepth = 0
    let bracketDepth = 0
    let quote = null

    for (let i = 0; i < selectorStr.length; i++) {
      const c = selectorStr[i]
      if (quote) {
        current += c
        if (c === quote && selectorStr[i - 1] !== "\\") quote = null
      } else if (c === '"' || c === "'") {
        quote = c
        current += c
      } else if (c === "(") {
        parenDepth++
        current += c
      } else if (c === ")") {
        parenDepth--
        current += c
      } else if (c === "[") {
        bracketDepth++
        current += c
      } else if (c === "]") {
        bracketDepth--
        current += c
      } else if (c === "," && parenDepth === 0 && bracketDepth === 0) {
        result.push(current.trim())
        current = ""
      } else {
        current += c
      }
    }
    if (current.trim()) result.push(current.trim())
    return result
  }

  const lines = cleanCss.split("\n")
  const testedSelectors = []
  const invalidSelectors = []

  for (let line of lines) {
    line = line.trim()
    if (!line || line.startsWith("@media")) continue
    if (line.includes("{")) {
      const selPart = line.split("{")[0].trim()
      if (!selPart) continue
      const subSelectors = splitSelectors(selPart)
      for (const sub of subSelectors) {
        testedSelectors.push(sub)
        if (!sub.startsWith("html[data-admin-ui=\"pro\"]")) {
          invalidSelectors.push(sub)
        }
      }
    }
  }

  assert.ok(testedSelectors.length >= 25, `CSS phải có đủ rules (đã kiểm tra ${testedSelectors.length} selectors)`)
  assert.deepEqual(invalidSelectors, [], `Tất cả selectors phải bắt đầu bằng html[data-admin-ui="pro"]. Vi phạm: ${invalidSelectors.join(", ")}`)
})

test("(f) Token styling: CSS bao gồm đầy đủ màu sắc mức độ và loại câu hỏi theo prototype Mochi Pro", () => {
  const cssPath = path.resolve(__dirname, "../src/css/admin-pro/pages/question-bank.css")
  const css = fs.readFileSync(cssPath, "utf8")

  // Mức độ nhận thức: Nhận biết=ok, Thông hiểu=blue, Vận dụng=warn, Vận dụng cao=accent2
  assert.match(css, /var\(--ap-ok\)/, "Phải có token --ap-ok cho Nhận biết")
  assert.match(css, /var\(--ap-blue\)/, "Phải có token --ap-blue cho Thông hiểu")
  assert.match(css, /var\(--ap-warn\)/, "Phải có token --ap-warn cho Vận dụng")
  assert.match(css, /var\(--ap-accent2\)/, "Phải có token --ap-accent2 cho Vận dụng cao")

  // Loại câu hỏi: Trắc nghiệm, Đúng/Sai, Trả lời ngắn
  assert.match(css, /var\(--ap-accent\)/, "Phải có token --ap-accent")

  // KaTeX và media bảo toàn
  assert.match(css, /\.katex/, "Phải có rule bảo toàn cho .katex")
  assert.match(css, /\.math-content/, "Phải có rule cho .math-content")

  // Responsive breakpoints
  assert.match(css, /@media\s*\(max-width:\s*900px\)/, "Phải có breakpoint 900px")
  assert.match(css, /@media\s*\(max-width:\s*640px\)/, "Phải có breakpoint 640px")
})
