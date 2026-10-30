import assert from 'node:assert/strict'

const saved = new Map([['eduportal-theme', 'malformed-json']])
const listeners = new Map()
const buttons = new Set()
const root = { dataset: {}, style: {} }
globalThis.localStorage = {
  getItem: key => saved.get(key) ?? null,
  setItem: (key, value) => saved.set(key, value)
}
globalThis.CustomEvent = class { constructor(type, options) { this.type = type; this.detail = options.detail } }
globalThis.document = {
  documentElement: root,
  addEventListener: (type, fn) => listeners.set(`document:${type}`, fn),
  dispatchEvent: event => listeners.get(`document:${event.type}`)?.(event),
  querySelectorAll: () => [...buttons]
}
globalThis.window = { addEventListener: (type, fn) => listeners.set(`window:${type}`, fn) }

const theme = await import('../src/js/theme.js')
assert.equal(root.dataset.theme, 'dark', 'unknown storage must default dark')
assert.match(theme.renderThemeToggle(), /aria-pressed="false"/)
const attrs = {}
const icon = { className: '' }
const label = { textContent: '' }
buttons.add({
  setAttribute: (key, value) => { attrs[key] = value },
  querySelector: selector => selector === 'i' ? icon : label
})
let changes = 0
listeners.set('document:eduportal:themechange', () => changes++)
theme.toggleTheme()
assert.equal(saved.get('eduportal-theme'), 'light')
assert.equal(root.dataset.theme, 'light')
assert.equal(attrs['aria-pressed'], 'true')
assert.match(attrs['aria-label'], /tối/)
assert.equal(changes, 1)
theme.setTheme('invalid')
assert.equal(saved.get('eduportal-theme'), 'dark')
listeners.get('window:storage')({ key: 'eduportal-theme', newValue: 'light' })
assert.equal(root.dataset.theme, 'light', 'cross-tab changes must update without navigation')
listeners.get('window:storage')({ key: 'eduportal-theme', newValue: null })
assert.equal(root.dataset.theme, 'dark', 'storage removal falls back to default')
assert.equal(changes, 4)
console.log('Theme preference / cross-tab / accessible state: OK')
