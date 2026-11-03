import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import vm from 'node:vm'

// Hồi quy: bỏ khu vực Mẫu, nhưng form ma trận vẫn bốc đề được và
// phản hồi availability cũ không bật nút của modal mới.
const source = await readFile(new URL('../src/js/views/question-bank.js', import.meta.url), 'utf8')
const controller = source.slice(source.indexOf('async function openMatrixGeneratorModal()'), source.indexOf('function openEditQuestionModal(q)'))
assert.ok(controller.startsWith('async function openMatrixGeneratorModal()'))
assert.ok(!controller.includes('matrix-template-'))
assert.ok(!controller.includes('matrixTemplateStore'))

const nodes = new Map()
class Node {
  constructor(id = '') {
    this.id = id; this.value = ''; this.style = {}; this.checked = false
    this.disabled = false; this.isConnected = true; this.handlers = {}; this.textContent = ''
  }
  set innerHTML(html) {
    this.html = html
    if (this.id === 'qb-modal-container') {
      for (const node of nodes.values()) if (node !== this) node.isConnected = false
      nodes.clear(); nodes.set(this.id, this)
    }
    for (const match of html.matchAll(/<[^>]+\bid="([^"]+)"[^>]*>/g)) {
      const node = new Node(match[1])
      node.value = match[0].match(/\bvalue="([^"]*)"/)?.[1] || ''
      node.checked = /\bchecked\b/.test(match[0])
      nodes.set(node.id, node)
    }
  }
  get innerHTML() { return this.html || '' }
  querySelectorAll() { return [] }
  querySelector() { return null }
  addEventListener(event, handler) { (this.handlers[event] ||= []).push(handler) }
  async fire(event) { for (const handler of this.handlers[event] || []) await handler({ target: this }) }
  replaceChildren() { this.html = '' }
  click() { return this.fire('click') }
}
nodes.set('qb-modal-container', new Node('qb-modal-container'))
let checkResolve
let rollResolve
let rolledScope
let homeworkWrites = 0
const document = { getElementById: id => nodes.get(id) || null, querySelectorAll: () => [], querySelector: () => null }
const context = {
  document, console,
  window: {},
  state: { user: { id: 'modal-admin', role: 'ADMIN' } },
  generatorState: {},
  constantTaxonomyState: {
    classes: [{ id: 'c1', grade_block: '12-Toán', name: 'Lớp 12' }],
    chapters: [{ id: 'ch1', class_id: 'c1' }],
    lessons: [{ id: 'l1', chapter_id: 'ch1' }],
    questionTypes: [{ id: 't1', lesson_id: 'l1' }],
  },
  cachedGradeBlocksList: ['12-Toán'], filterState: {}, allClasses: [{ id: 'destination' }],
  api: {
    checkQuestionBankAvailability() { return new Promise(resolve => { checkResolve = resolve }) },
    generateRandomExam(payload) { rolledScope = payload.scope; return new Promise(resolve => { rollResolve = resolve }) },
    createHomeworkFromBankQuestions() { homeworkWrites++ },
  },
  renderHomeworkConfigFields: () => '', bindHomeworkConfigFields() {}, bindHomeworkTypeCoupling() {},
  showToast() {}, escapeHtml: value => value,
}
vm.createContext(context)
vm.runInContext(controller, context)
const get = id => nodes.get(id)
const flush = async () => { await Promise.resolve(); await Promise.resolve() }

await context.openMatrixGeneratorModal()
assert.equal(get('matrix-template-name'), undefined)
assert.equal(get('btn-roll-preview').disabled, true)
await get('btn-scope-select-block').click()
get('gen-matrix-mc').value = '2'
await get('gen-matrix-mc').fire('input')
assert.equal(get('btn-roll-preview').disabled, true, 'chờ availability mới cho bốc đề')
checkResolve({ total: 10, mc: 10, tf: 0, sa: 0 }); await flush()
assert.equal(get('btn-roll-preview').disabled, false)
const rolling = get('btn-roll-preview').click()
await flush()
assert.equal(rolledScope.constantOnly, true)
assert.equal(get('btn-roll-preview').disabled, true)
await get('matrix-gen-close-btn').click()
rollResolve({ previewQuestions: [{ id: 'stale' }] })
await rolling
await context.openMatrixGeneratorModal()
assert.equal(get('btn-roll-preview').disabled, true)
assert.equal(homeworkWrites, 0)
console.log('✓ Form ma trận không còn mẫu/JSON; vẫn bốc đề đúng phạm vi và chặn phản hồi cũ')
