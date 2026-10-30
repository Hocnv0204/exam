import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

const saved = new Map([['eduportal-theme', 'malformed-json']])
const listeners = new Map()
const buttons = new Set()
const pickers = new Set()
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
  querySelectorAll: selector => selector === '[data-student-theme-picker]' ? [...pickers] : [...buttons]
}
globalThis.window = { addEventListener: (type, fn) => listeners.set(`window:${type}`, fn) }

const theme = await import('../src/js/theme.js')
assert.equal(root.dataset.theme, 'dark', 'unknown storage must default dark')
assert.equal(theme.getStudentTheme(), 'dark', 'old global preference remains the fallback')
assert.equal(root.dataset.studentTheme, 'dark')
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
const picker = { value: '' }
pickers.add(picker)
theme.toggleTheme()
assert.equal(saved.get('eduportal-theme'), 'light')
assert.equal(root.dataset.theme, 'light')
assert.equal(theme.getStudentTheme(), 'light', 'unmigrated students follow the global preference')
assert.equal(picker.value, 'light')
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
saved.set('eduportal-theme', 'light')
listeners.get('window:storage')({ key: 'eduportal-theme', newValue: 'light' })
assert.equal(theme.getStudentTheme(), 'light')
const beforePastel = changes
theme.setStudentTheme('pastel')
assert.equal(changes, beforePastel + 1, 'student changes notify charts without navigation')
assert.equal(saved.get('eduportal-student-theme'), 'pastel')
assert.equal(saved.get('eduportal-theme'), 'light', 'student preference cannot change global theme')
assert.equal(root.dataset.theme, 'light')
assert.equal(root.dataset.studentTheme, 'pastel')
assert.equal(picker.value, 'pastel')
assert.match(theme.renderStudentThemePicker(), /value="pastel" selected/)
theme.setTheme('dark')
assert.equal(theme.getStudentTheme(), 'pastel', 'global toggles do not override a student choice')
assert.equal(root.dataset.theme, 'dark', 'admin/public preference is still global')
theme.setTheme('light')
theme.setStudentTheme('invalid')
assert.equal(theme.getStudentTheme(), 'pastel', 'invalid input cannot replace the valid value')
listeners.get('window:storage')({ key: 'eduportal-student-theme', newValue: 'dark' })
assert.equal(theme.getStudentTheme(), 'dark', 'cross-tab student preference is applied')
assert.equal(picker.value, 'dark')
listeners.get('window:storage')({ key: 'eduportal-student-theme', newValue: 'broken' })
assert.equal(theme.getStudentTheme(), 'light', 'invalid stored value falls back to global')
listeners.get('window:storage')({ key: 'eduportal-student-theme', newValue: null })
assert.equal(theme.getStudentTheme(), 'light', 'removing student preference restores global fallback')
listeners.get('document:change')({ target: { matches: () => true, value: 'pastel' } })
assert.equal(theme.getStudentTheme(), 'pastel', 'native select change is keyboard operable')

// Keep role-based controls and route updates independent from the theme event;
// no theme handler should invoke the router or destroy in-flight view state.
const { state } = await import('../src/js/state.js')
const { renderSidebar } = await import('../src/js/components/sidebar.js')
state.token = 'fixture'
state.user = { role: 'STUDENT' }
assert.match(renderSidebar('my-classes'), /data-student-theme-picker/)
assert.doesNotMatch(renderSidebar('my-classes'), /data-theme-toggle/)
state.user = { role: 'ADMIN' }
assert.match(renderSidebar('admin-dashboard'), /data-theme-toggle/)
assert.doesNotMatch(renderSidebar('admin-dashboard'), /data-student-theme-picker/)
state.user = null
state.token = null
assert.match(renderSidebar('roadmap'), /data-theme-toggle/)
const appSource = readFileSync(new URL('../src/js/app.js', import.meta.url), 'utf8')
const themeHandler = appSource.match(/document\.addEventListener\('eduportal:themechange', \(\) => \{([\s\S]*?)\n\}\)/)?.[1]
assert.ok(themeHandler)
assert.doesNotMatch(themeHandler, /router\(|innerHTML|route\.render/, 'theme changes must never rerender routes')
console.log('Theme preference / cross-tab / accessible state: OK')
