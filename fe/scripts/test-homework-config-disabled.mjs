/**
 * Test: input số bị khóa bởi coupling Loại bài tập (Số lần làm / Giới hạn vi phạm)
 * trong popup "Tạo đề từ ngân hàng" (cs) và "Tạo đề theo Ma trận" (mx).
 *
 * Regression đã fix: coupling từng ghi inline `style.backgroundColor` qua
 * CSSOM → browser chuẩn hoá attribute sang rgb() → mất chuỗi
 * `background:#ffffff` mà theme-admin-modals.css bắt để map nền navy →
 * input disabled near-white trên nền gần trắng trong admin tối.
 *
 * Checks:
 * 1. Coupling giữ nguyên hành vi EXAM/PRACTICE và KHÔNG ghi style inline.
 * 2. Markup partial giữ chuỗi `background:#ffffff` (invariant cho mapping navy).
 * 3. CSS có rule scoped `input.hw-config-locked`: light giữ #f1f5f9, dark
 *    (cổng body:has admin-dark/navy-student) dùng surface-strong + text-muted !important.
 * 4. Cả hai popup cs/mx trong question-bank.js vẫn nối coupling.
 */
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

// ---------- DOM fixture tối giản ----------
const elements = new Map()
const makeEl = (id, { value = '', type = 'text' } = {}) => {
  const classes = new Set()
  const inlineStyleWrites = []
  const el = {
    id,
    type,
    value,
    disabled: false,
    checked: false,
    listeners: new Map(),
    classList: {
      add: c => classes.add(c),
      remove: c => classes.delete(c),
      toggle: (c, force) => { (force === undefined ? !classes.has(c) : force) ? classes.add(c) : classes.delete(c) },
      contains: c => classes.has(c)
    },
    style: new Proxy({}, {
      set: (_t, prop, v) => { inlineStyleWrites.push(`${String(prop)}=${v}`); return true }
    }),
    addEventListener: (type, fn) => el.listeners.set(type, fn),
    inlineStyleWrites
  }
  elements.set(id, el)
  return el
}
globalThis.document = { getElementById: id => elements.get(id) ?? null }

const { renderHomeworkConfigFields, bindHomeworkConfigFields, bindHomeworkTypeCoupling, collectHomeworkConfig } =
  await import('../src/js/components/homework-config-fields.js')

// ---------- 1. Markup partial: chuỗi nền trắng phải còn để CSS map navy ----------
for (const prefix of ['cs', 'mx']) {
  const markup = renderHomeworkConfigFields(prefix)
  for (const field of ['duration', 'attempts', 'violations']) {
    assert.match(markup, new RegExp(`id="${prefix}-${field}"`), `${prefix}-${field} tồn tại`)
    const inputTag = markup.match(new RegExp(`<input[^>]*id="${prefix}-${field}"[^>]*>`))?.[0]
    assert.ok(inputTag, `tag ${prefix}-${field} khớp`)
    assert.match(inputTag, /background:#ffffff/, `${prefix}-${field} giữ chuỗi background:#ffffff cho theme navy`)
    assert.doesNotMatch(inputTag, /f1f5f9/, `${prefix}-${field} không hardcode nền disabled inline`)
  }
}

// ---------- 2. Coupling EXAM/PRACTICE, không ghi style inline ----------
const wireFixture = prefix => ({
  type: makeEl(`${prefix}-type`, { value: 'PRACTICE' }),
  attempts: makeEl(`${prefix}-attempts`, { value: '0' }),
  violations: makeEl(`${prefix}-violations`, { value: '3' })
})

for (const prefix of ['cs', 'mx']) {
  const f = wireFixture(prefix)
  bindHomeworkTypeCoupling(`${prefix}-type`, `${prefix}-attempts`, `${prefix}-violations`)

  // PRACTICE (mặc định): lần làm mở, vi phạm khóa + class
  assert.equal(f.attempts.disabled, false, `${prefix}: PRACTICE mở Số lần làm`)
  assert.equal(f.attempts.classList.contains('hw-config-locked'), false)
  assert.equal(f.violations.disabled, true, `${prefix}: PRACTICE khóa Giới hạn vi phạm`)
  assert.equal(f.violations.classList.contains('hw-config-locked'), true)

  // EXAM: lần làm = 1 và khóa, vi phạm mở
  f.type.value = 'EXAM'
  f.type.listeners.get('change')()
  assert.equal(String(f.attempts.value), '1', `${prefix}: EXAM đặt Số lần làm = 1`)
  assert.equal(f.attempts.disabled, true, `${prefix}: EXAM khóa Số lần làm`)
  assert.equal(f.attempts.classList.contains('hw-config-locked'), true)
  assert.equal(f.violations.disabled, false, `${prefix}: EXAM mở Giới hạn vi phạm`)
  assert.equal(f.violations.classList.contains('hw-config-locked'), false)

  // Quay lại PRACTICE: class được gỡ sạch (toggle idempotent)
  f.type.value = 'PRACTICE'
  f.type.listeners.get('change')()
  assert.equal(f.attempts.disabled, false)
  assert.equal(f.attempts.classList.contains('hw-config-locked'), false)
  assert.equal(f.violations.classList.contains('hw-config-locked'), true)

  assert.deepEqual(f.attempts.inlineStyleWrites, [], `${prefix}: không ghi inline style lên Số lần làm`)
  assert.deepEqual(f.violations.inlineStyleWrites, [], `${prefix}: không ghi inline style lên Giới hạn vi phạm`)
}

// ---------- 3. collectHomeworkConfig vẫn đọc đúng fixture ----------
const cf = wireFixture('cs')
makeEl('cs-duration', { value: '45' })
makeEl('cs-show-solutions').checked = true
makeEl('cs-deadline-date', { value: '' })
bindHomeworkTypeCoupling('cs-type', 'cs-attempts', 'cs-violations')
const cfg = collectHomeworkConfig('cs')
assert.equal(cfg.durationMinutes, 45)
assert.equal(cfg.maxAttempts, 0, 'PRACTICE giữ Số lần làm do user nhập')
assert.equal(cfg.maxViolations, 3)
assert.equal(cfg.deadline, null, 'không có hạn chót => deadline null')
assert.equal(cfg.showSolutions, true)

// bindHomeworkConfigFields không ném khi thiếu nút xóa hạn chót
bindHomeworkConfigFields('missing-prefix')

// ---------- 4. CSS scoped: light giữ look cũ, dark dùng surface muted ----------
const css = readFileSync(new URL('../src/css/theme-admin-modals.css', import.meta.url), 'utf8')

const ungatedIdx = css.indexOf(':is(#modal-container, #qb-modal-container) input.hw-config-locked {')
assert.ok(ungatedIdx !== -1, 'có rule light cho input.hw-config-locked')
const ungatedBlock = css.slice(ungatedIdx, css.indexOf('}', ungatedIdx))
assert.match(ungatedBlock, /background:\s*#f1f5f9\s*!important/, 'light admin giữ nền disabled cũ #f1f5f9')
assert.match(ungatedBlock, /border-color:\s*#cbd5e1\s*!important/, 'light admin giữ viền cũ')
assert.match(ungatedBlock, /color:\s*#475569\s*!important/, 'light admin có chữ đủ tương phản trên nền disabled')

const darkGate = 'body:has(:is(.app-layout.admin-dark, .exam-room-layout.navy-student):not([data-route="create-homework"])) :is(#modal-container, #qb-modal-container) input.hw-config-locked {'
const darkIdx = css.indexOf(darkGate)
assert.ok(darkIdx !== -1, 'có rule dark cho input.hw-config-locked đúng cổng body:has')
assert.ok(darkIdx > ungatedIdx, 'rule dark đứng sau rule light (cùng !important, thứ tự có chủ đích)')
const darkBlock = css.slice(darkIdx, css.indexOf('}', darkIdx))
assert.match(darkBlock, /background:\s*var\(--adm-modal-surface-strong\)\s*!important/, 'dark: nền muted navy surface-strong')
assert.match(darkBlock, /color:\s*var\(--adm-modal-text-muted\)\s*!important/, 'dark: chữ muted đọc được trên nền tối')
assert.match(darkBlock, /border-color:\s*var\(--adm-modal-border\)\s*!important/, 'dark: viền navy')

// Không còn ghi inline backgroundColor trong coupling (nguyên nhân gốc)
const jsSource = readFileSync(new URL('../src/js/components/homework-config-fields.js', import.meta.url), 'utf8')
assert.doesNotMatch(jsSource, /style\.backgroundColor/, 'coupling không ghi backgroundColor inline nữa')
assert.match(jsSource, /classList\.toggle\('hw-config-locked'/, 'coupling dùng class hw-config-locked')

// Cả hai popup (cs/mx) trong question-bank.js vẫn nối coupling
const qbSource = readFileSync(new URL('../src/js/views/question-bank.js', import.meta.url), 'utf8')
assert.match(qbSource, /bindHomeworkTypeCoupling\('create-selected-type', 'cs-attempts', 'cs-violations'\)/, 'popup Tạo đề từ ngân hàng nối coupling')
assert.match(qbSource, /bindHomeworkTypeCoupling\('gen-exam-type', 'mx-attempts', 'mx-violations'\)/, 'popup ma trận nối coupling')

console.log('Homework config disabled inputs (dark admin modal theme): OK')
