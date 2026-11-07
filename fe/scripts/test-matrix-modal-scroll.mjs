import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import postcss from 'postcss'

const css = postcss.parse(readFileSync(new URL('../src/css/theme-admin-modals.css', import.meta.url), 'utf8'))
const view = readFileSync(new URL('../src/js/views/question-bank.js', import.meta.url), 'utf8')

function declaration(selector, property) {
  let value
  css.walkRules(rule => {
    if (rule.selectors.includes(selector)) rule.walkDecls(property, decl => { value = decl.value })
  })
  return value
}

test('popup Ma trận khóa cuộn trang/backdrop, chỉ nội dung cuộn và tự nhả khóa khi đóng', () => {
  assert.equal(declaration('html:has(:is(#matrix-gen-backdrop, #import-md-backdrop))', 'overflow-y'), 'hidden')
  assert.equal(declaration('body:has(:is(#matrix-gen-backdrop, #import-md-backdrop))', 'overflow-y'), 'hidden')
  assert.equal(declaration('#qb-modal-container :is(#matrix-gen-backdrop, #import-md-backdrop)', 'overflow'), 'hidden')
  assert.equal(declaration(':is(#matrix-gen-backdrop, #import-md-backdrop) :is(.matrix-gen-body, .md-import-body)', 'min-height'), '0')
  assert.equal(declaration(':is(#matrix-gen-backdrop, #import-md-backdrop) :is(.matrix-gen-body, .md-import-body)', 'overscroll-behavior'), 'contain')
  assert.match(view, /id="matrix-gen-step1" class="matrix-gen-body"[^>]*overflow-y:auto/)
  assert.match(view, /const closeModal = \(\) => \{ rollRequestId\+\+; modalContainer\.innerHTML = '' \}/)
})

test('popup nhập Markdown giữ cuộn editor, preview đi theo body và khóa backdrop', () => {
  assert.match(view, /id="import-md-backdrop"/)
  assert.match(view, /class="md-import-body"[^>]*overflow-y:auto/)
  assert.match(view, /id="md-editor-textarea"[^>]*height:220px/)
  assert.doesNotMatch(view.match(/id="md-preview-questions-list"[^>]*>/)?.[0] || '', /max-height|overflow-y/)
  assert.equal(declaration(':is(#matrix-gen-backdrop, #import-md-backdrop) :is(.matrix-gen-header, .matrix-gen-footer, .md-import-header, .md-import-footer)', 'flex'), '0 0 auto')
})
