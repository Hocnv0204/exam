// Toast: chống lặp cùng nội dung, giới hạn số lượng, hiển thị text (không chèn HTML).
import test from 'node:test'
import assert from 'node:assert/strict'

function makeEl(tag) {
  const el = {
    tagName: tag, className: '', style: {}, children: [], parent: null, _text: '',
    get isConnected() { return !!this.parent },
    get textContent() { return this._text || this.children.map(c => c.textContent).join('') },
    set textContent(v) { this._text = String(v) },
    get firstElementChild() { return this.children[0] || null },
    append(...nodes) { nodes.forEach(n => this.appendChild(n)) },
    appendChild(n) { n.parent = this; this.children.push(n); return n },
    remove() { if (this.parent) { this.parent.children.splice(this.parent.children.indexOf(this), 1); this.parent = null } },
    set innerHTML(_v) { throw new Error('toast không được dùng innerHTML') },
  }
  return el
}
const container = makeEl('div')
globalThis.document = { getElementById: id => (id === 'toast-container' ? container : null), createElement: makeEl }
const { showToast } = await import('../src/js/components/toast.js')

test('cùng nội dung + loại khi toast còn hiện → chỉ 1 toast', () => {
  container.children.length = 0
  showToast('Đã xuất bản bài tập "A" thành công!', 'success')
  showToast('Đã xuất bản bài tập "A" thành công!', 'success')
  assert.equal(container.children.length, 1)
  showToast('Đã xuất bản bài tập "A" thành công!', 'info')
  assert.equal(container.children.length, 2, 'khác loại vẫn hiện riêng')
})

test('tối đa 4 toast; nội dung là text, không chèn HTML', () => {
  container.children.length = 0
  for (let i = 0; i < 6; i++) showToast(`Thông báo ${i}`, 'info')
  assert.equal(container.children.length, 4)
  assert.equal(container.children[0].textContent, 'Thông báo 2')
  showToast('<img src=x onerror=alert(1)>', 'error')
  assert.equal(container.children.at(-1).textContent, '<img src=x onerror=alert(1)>')
})
