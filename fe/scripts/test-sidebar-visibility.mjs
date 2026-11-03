import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import vm from 'node:vm'

const source = readFileSync(new URL('../src/js/app.js', import.meta.url), 'utf8')
const handlers = source.slice(source.indexOf("window.addEventListener('resize',"), source.indexOf("document.addEventListener('keydown',"))

function mount(width) {
  const listeners = {}
  const classes = new Set(['sidebar-hover-expand'])
  const attrs = {}
  const toggle = { setAttribute: (key, value) => { attrs[key] = value } }
  const layout = {
    classList: {
      contains: value => classes.has(value),
      add: value => classes.add(value),
      remove: value => classes.delete(value),
      toggle: (value, force) => { if (force === undefined ? !classes.has(value) : force) classes.add(value); else classes.delete(value) },
    },
    querySelector: () => toggle,
  }
  const context = {
    state: { token: 'test' }, window: { innerWidth: width, addEventListener: (key, fn) => { listeners[key] = fn } },
    document: { querySelector: () => layout, addEventListener: (key, fn) => { listeners[key] = fn }, getElementById: () => toggle },
  }
  vm.createContext(context)
  vm.runInContext(handlers, context)
  return { listeners, classes, context, attrs }
}

test('bấm menu desktop không ẩn thanh bên khi route không thay đổi', () => {
  const page = mount(1440)
  const nav = { id: 'dashboard', closest: selector => selector === '#sidebar-toggle-btn' ? null : nav }
  page.listeners.click({ target: nav })
  assert.equal(page.classes.has('sidebar-collapsed'), false)
})

test('menu tự đóng ở mobile nhưng khôi phục icon rail khi mở rộng viewport', () => {
  const page = mount(800)
  const nav = { id: 'dashboard', closest: selector => selector === '#sidebar-toggle-btn' ? null : nav }
  page.listeners.click({ target: nav })
  assert.equal(page.classes.has('sidebar-collapsed'), true)
  page.context.window.innerWidth = 1440
  page.listeners.resize()
  assert.equal(page.classes.has('sidebar-collapsed'), false)
  assert.equal(page.classes.has('sidebar-hover-expand'), true)
  assert.equal(page.attrs['aria-expanded'], 'true')
})
