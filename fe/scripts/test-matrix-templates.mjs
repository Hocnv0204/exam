import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import vm from 'node:vm'
import * as helpers from '../src/js/utils/matrix-template.js'

const tree = {
  classes: [{ id: 'c1', grade_block: '12-Toán', name: 'Lớp 12' }, { id: 'c2', grade_block: '11-Toán' }],
  chapters: [{ id: 'ch1', class_id: 'c1' }],
  lessons: [{ id: 'l1', chapter_id: 'ch1' }],
  questionTypes: [{ id: 't1', lesson_id: 'l1' }]
}
const fixture = () => ({ version: 1, name: 'Mẫu 12', scope: { scopeType: 'MULTI', gradeBlock: '12-Toán', classIds: ['c1'], chapterIds: ['ch1'], lessonIds: ['l1'], typeIds: ['t1'], paths: [{ classId: 'c1', chapterId: 'ch1', lessonId: 'l1', typeId: 't1' }] }, matrix: { mc: { total: 2, distribution: { nb: 1, th: 1, vd: 0, vdc: 0 } }, tf: { total: 0, distribution: { nb: 0, th: 0, vd: 0, vdc: 0 } }, sa: { total: 0, distribution: { nb: 0, th: 0, vd: 0, vdc: 0 } } }, options: { advanced: true, borrow: true, balanced: false } })
const clone = x => JSON.parse(JSON.stringify(x))
const valid = fixture()
assert.deepEqual(helpers.parseMatrixTemplate(JSON.stringify(valid)), valid)
assert.throws(() => helpers.parseMatrixTemplate('{'), /JSON/)
assert.throws(() => helpers.parseMatrixTemplate(' '.repeat(65537)), /64 KB/)
for (const version of [0, 2, '1', null]) assert.throws(() => helpers.sanitizeMatrixTemplate({ ...valid, version }), /Phiên bản/)
for (const total of [-1, 1.5, 501, Infinity, '2', null]) {
  const bad = fixture(); bad.matrix.mc.total = total
  assert.throws(() => helpers.sanitizeMatrixTemplate(bad), /Số câu/)
}
const mismatch = fixture(); mismatch.matrix.mc.distribution.nb = 0
assert.throws(() => helpers.sanitizeMatrixTemplate(mismatch), /Phân bổ/)
const zero = fixture(); zero.matrix.mc = clone(zero.matrix.tf)
assert.throws(() => helpers.sanitizeMatrixTemplate(zero), /Tổng số câu/)
const empty = fixture(); empty.scope.paths = []
assert.throws(() => helpers.sanitizeMatrixTemplate(empty), /phạm vi/)
const invalidId = fixture(); invalidId.scope.typeIds = ['<script>']
assert.throws(() => helpers.sanitizeMatrixTemplate(invalidId), /ID danh mục/)
const injected = JSON.parse(JSON.stringify(valid).replace('"version":1', '"__proto__":{"polluted":true},"version":1'))
Object.assign(injected, { previewQuestions: [{ answer: 'SECRET' }], token: 'SECRET', title: 'SECRET', deadline: 'SECRET' })
assert.equal(JSON.stringify(helpers.sanitizeMatrixTemplate(injected)).includes('SECRET'), false)
assert.equal(Object.hasOwn(helpers.sanitizeMatrixTemplate(injected), '__proto__'), false)
assert.equal({}.polluted, undefined)
assert.deepEqual(helpers.reconcileMatrixTemplate(valid, tree), valid)
for (const mutate of [t => { t.questionTypes = [] }, t => { t.classes[0].grade_block = '11-Toán' }, t => { t.chapters[0].class_id = 'c2' }, t => { t.lessons = [] }]) {
  const changed = clone(tree); mutate(changed)
  assert.throws(() => helpers.reconcileMatrixTemplate(valid, changed))
}
const withSibling = clone(tree); withSibling.questionTypes.push({ id: 't2', lesson_id: 'l1' })
assert.deepEqual(helpers.reconcileMatrixTemplate(valid, withSibling).scope.typeIds, ['t1'])
const untyped = fixture(); untyped.scope.typeIds = []; untyped.scope.paths[0].typeId = null
assert.throws(() => helpers.reconcileMatrixTemplate(untyped, tree), /Danh mục đã đổi/)
const data = new Map()
const storage = { getItem: k => data.get(k) ?? null, setItem: (k, v) => data.set(k, v) }
const a = helpers.matrixTemplateStore(storage, 'admin-a')
const b = helpers.matrixTemplateStore(storage, 'admin-b')
a.save(valid)
assert.deepEqual(b.read(), [])
assert.throws(() => a.save({ ...valid, name: 'MẪU 12' }), /đã tồn tại/)
for (let n = 1; n < 20; n++) a.save({ ...valid, name: `Mẫu phụ ${n}` })
assert.throws(() => a.save({ ...valid, name: 'Quá giới hạn' }), /20 mẫu/)
a.remove('Mẫu 12'); assert.equal(a.read().length, 19)
assert.throws(() => helpers.matrixTemplateStore(storage, '').read(), /admin/)
assert.throws(() => helpers.matrixTemplateStore({ getItem() { throw Error() } }, 'a').read(), /bộ nhớ/)
assert.throws(() => helpers.matrixTemplateStore({ getItem: () => null, setItem() { throw Error() } }, 'a').save(valid), /bị chặn/)
assert.throws(() => helpers.matrixTemplateStore({ getItem: () => '{bad' }, 'a').save(valid), /không ghi đè/)
assert.throws(() => helpers.matrixTemplateStore({ getItem: () => ' '.repeat(524289) }, 'a').read(), /dung lượng/)

// Execute the actual modal controller with a small DOM fixture, no real API/accounts.
const source = await readFile(new URL('../src/js/views/question-bank.js', import.meta.url), 'utf8')
const controller = source.slice(source.indexOf('async function openMatrixGeneratorModal()'), source.indexOf('function openEditQuestionModal(q)'))
const nodes = new Map()
class Node {
  constructor(id = '') { this.id = id; this.value = ''; this.style = {}; this.checked = false; this.disabled = false; this.isConnected = true; this.handlers = {}; this.options = []; this.textContent = '' }
  set innerHTML(html) {
    this.html = html
    if (this.id === 'qb-modal-container') {
      for (const n of nodes.values()) if (n !== this) n.isConnected = false
      nodes.clear(); nodes.set(this.id, this)
    }
    for (const match of html.matchAll(/<[^>]+\bid="([^"]+)"[^>]*>/g)) {
      const n = new Node(match[1]); n.value = match[0].match(/\bvalue="([^"]*)"/)?.[1] || ''; n.checked = /\bchecked\b/.test(match[0]); nodes.set(n.id, n)
    }
  }
  get innerHTML() { return this.html || '' }
  querySelectorAll() { return [] }
  querySelector() { return null }
  addEventListener(event, handler) { (this.handlers[event] ||= []).push(handler) }
  async fire(event) { for (const handler of this.handlers[event] || []) await handler({ target: this }) }
  replaceChildren() { this.options = []; this.html = '' }
  add(option) { this.options.push(option); if (!this.value) this.value = option.value }
  click() { return this.fire('click') }
}
nodes.set('qb-modal-container', new Node('qb-modal-container'))
let checkResolve
let rollResolve
let rolledScope
let checks = 0
let homeworkWrites = 0
let exported
let confirmed = false
const document = { getElementById: id => nodes.get(id) || null, querySelectorAll: () => [], querySelector: () => null, createElement: () => new Node() }
const context = {
  ...helpers, document, console, TextEncoder, Blob,
  URL: { createObjectURL: blob => { exported = blob; return 'blob:fixture' }, revokeObjectURL() {} },
  Option: function(text, value) { this.text = text; this.value = value },
  window: { localStorage: storage, confirm: () => confirmed },
  state: { user: { id: 'modal-admin', role: 'ADMIN' } },
  generatorState: {}, constantTaxonomyState: clone(tree), cachedGradeBlocksList: ['12-Toán'], filterState: {},
  allClasses: [{ id: 'destination' }],
  api: { checkQuestionBankAvailability() { checks++; return new Promise(resolve => { checkResolve = resolve }) }, generateRandomExam(payload) { rolledScope = payload.scope; return new Promise(resolve => { rollResolve = resolve }) }, createHomeworkFromBankQuestions() { homeworkWrites++ } },
  renderHomeworkConfigFields: () => '', bindHomeworkConfigFields() {}, bindHomeworkTypeCoupling() {}, showToast() {}, escapeHtml: s => s,
}
vm.createContext(context)
vm.runInContext(controller, context)
const get = id => nodes.get(id)
const flush = async () => { await Promise.resolve(); await Promise.resolve() }
await context.openMatrixGeneratorModal()
const modal = get('matrix-gen-backdrop')
assert.equal(get('btn-roll-preview').disabled, true)
assert.equal(get('matrix-template-use').disabled, true)
await get('btn-scope-select-block').click()
get('gen-matrix-mc').value = '2'; await get('gen-matrix-mc').fire('input')
assert.equal(get('btn-roll-preview').disabled, true, 'pending availability blocks generation')
checkResolve({ total: 10, mc: 10, tf: 0, sa: 0 }); await flush()
assert.equal(get('btn-roll-preview').disabled, false)
get('matrix-template-name').value = '<img src=x onerror=alert(1)>'
await get('matrix-template-save').click()
assert.equal(get('matrix-gen-backdrop'), modal, 'save never replaces the shared modal')
assert.equal(get('matrix-template-list').options[0].text, '<img src=x onerror=alert(1)>')
await get('matrix-template-save').click()
assert.match(get('matrix-template-status').textContent, /đã tồn tại/)
await get('matrix-template-export').click()
const exportedConfig = helpers.parseMatrixTemplate(await exported.text())
assert.equal(exportedConfig.matrix.mc.total, 2)
assert.equal(exportedConfig.scope.paths[0].typeId, 't1')
context.generatorState.previewQuestions = [{ id: 'old' }]; context.generatorState.rejectedIds = ['old']
const previousChecks = checks
await get('matrix-template-use').click()
assert.equal(context.generatorState.previewQuestions.length, 0)
assert.equal(context.generatorState.rejectedIds.length, 0)
assert.equal(checks, previousChecks + 1)
assert.equal(get('btn-roll-preview').disabled, true)
checkResolve({ total: 10, mc: 10, tf: 0, sa: 0 }); await flush()
assert.equal(get('btn-roll-preview').disabled, false)
const rollPromise = get('btn-roll-preview').click()
await flush()
assert.equal(rolledScope.constantOnly, true)
assert.equal(get('btn-roll-preview').disabled, true)
await get('matrix-template-use').click()
rollResolve({ previewQuestions: [{ id: 'stale-question' }] })
await rollPromise
assert.equal(context.generatorState.previewQuestions.length, 0, 'loading a template invalidates pending generation')
assert.notEqual(get('matrix-gen-step1').style.display, 'none')
checkResolve({ total: 10, mc: 10, tf: 0, sa: 0 }); await flush()
context.constantTaxonomyState.questionTypes.push({ id: 't2', lesson_id: 'l1' })
await get('matrix-template-use').click()
assert.deepEqual(Array.from(context.generatorState.selectedTypeIds), ['t1'])
assert.equal(context.generatorState.selectedClassIds.length, 0, 'new sibling is never included by a saved class selection')
assert.equal(context.generatorState.selectedLessonIds.length, 0, 'new sibling is never included by a saved lesson selection')
context.constantTaxonomyState.questionTypes = []
await get('matrix-template-use').click()
assert.match(get('matrix-template-status').textContent, /Danh mục đã đổi/)
assert.equal(context.generatorState.gradeBlock, '12-Toán', 'failed load never falls back to ALL')
context.constantTaxonomyState = clone(tree)
get('matrix-template-file').files = [{ size: 5, text: async () => '{bad' }]
await get('matrix-template-file').fire('change')
assert.match(get('matrix-template-status').textContent, /JSON/)
get('matrix-template-file').files = [{ size: 65537, text: async () => { throw Error('must not read oversized file') } }]
await get('matrix-template-file').fire('change')
assert.match(get('matrix-template-status').textContent, /64 KB/)
const imported = { ...exportedConfig, name: 'Mẫu nhập' }
get('matrix-template-file').files = [{ size: 1000, text: async () => JSON.stringify(imported) }]
await get('matrix-template-file').fire('change')
assert.equal(get('matrix-template-list').value, 'Mẫu nhập')
await get('matrix-template-delete').click()
assert.equal(helpers.matrixTemplateStore(storage, 'modal-admin').read().length, 2, 'cancel delete preserves data')
confirmed = true; await get('matrix-template-delete').click()
assert.equal(helpers.matrixTemplateStore(storage, 'modal-admin').read().length, 1)
await get('btn-scope-select-block').click()
const staleResolve = checkResolve
await get('matrix-gen-close-btn').click()
await context.openMatrixGeneratorModal()
staleResolve({ total: 999, mc: 999 }); await flush()
assert.equal(get('btn-roll-preview').disabled, true, 'old modal response cannot enable new modal')
let oldFileResolve
get('matrix-template-file').files = [{ size: 1000, text: () => new Promise(resolve => { oldFileResolve = resolve }) }]
const oldImport = get('matrix-template-file').fire('change')
get('matrix-template-file').files = [{ size: 1000, text: async () => JSON.stringify({ ...exportedConfig, name: 'Tệp mới' }) }]
await get('matrix-template-file').fire('change')
oldFileResolve(JSON.stringify({ ...exportedConfig, name: 'Tệp cũ' }))
await oldImport
assert.equal(get('matrix-template-list').value, 'Tệp mới')
assert.equal(helpers.matrixTemplateStore(storage, 'modal-admin').read().some(t => t.name === 'Tệp cũ'), false)
context.state.user = { id: 'other-admin', role: 'ADMIN' }
get('matrix-template-name').value = 'không được lưu'
await get('matrix-template-save').click()
assert.deepEqual(helpers.matrixTemplateStore(storage, 'other-admin').read(), [])
await get('matrix-gen-close-btn').click()
Object.defineProperty(context.window, 'localStorage', { get() { throw Error('SecurityError') } })
await context.openMatrixGeneratorModal()
assert.match(get('matrix-template-status').textContent, /Bộ nhớ trình duyệt bị chặn/)
assert.equal(get('matrix-template-use').disabled, true)
assert.equal(homeworkWrites, 0)
console.log('✓ Matrix templates: schema, safety, quotas, account isolation, taxonomy reconciliation, roundtrip and actual modal handlers')
