import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

const saved = new Map([['eduportal-theme', 'malformed-json']])
const listeners = new Map()
const buttons = new Set()
const studentButtons = new Set()
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
  querySelectorAll: selector => selector === '[data-student-theme-toggle]' ? [...studentButtons] : [...buttons]
}
globalThis.window = { addEventListener: (type, fn) => listeners.set(`window:${type}`, fn) }

const theme = await import('../src/js/theme.js')
assert.equal(root.dataset.theme, 'dark', 'unknown storage must default dark')
assert.equal(theme.getStudentTheme(), 'dark', 'without a stored choice students start on navy dark')
assert.equal(root.dataset.studentTheme, 'dark')
assert.equal(saved.get('eduportal-student-theme'), 'dark', 'a missing/legacy value is migrated to navy dark in storage')
assert.match(theme.renderThemeToggle(), /aria-pressed="false"/)
assert.match(theme.renderThemeToggle(), /sáng/i, 'the admin/public toggle keeps its light mode')
const studentMarkup = theme.renderStudentThemeToggle()
assert.match(studentMarkup, /<button type="button"/, 'the student control is a real button (keyboard operable)')
assert.match(studentMarkup, /data-student-theme-toggle/)
assert.match(studentMarkup, /Hồng pastel/, 'the label describes the next mode')
assert.match(studentMarkup, /fa-palette/)
assert.match(studentMarkup, /aria-pressed="false"/)
assert.match(studentMarkup, /aria-label="Chuyển sang giao diện hồng pastel"/)
assert.doesNotMatch(studentMarkup, /sáng/i, 'the student control has no light mode')
assert.doesNotMatch(studentMarkup, /<select|data-student-theme-picker/, 'no three-way native select remains')

const attrs = {}
const icon = { className: '' }
const label = { textContent: '' }
buttons.add({
  setAttribute: (key, value) => { attrs[key] = value },
  querySelector: selector => selector === 'i' ? icon : label
})
const studentAttrs = {}
const studentIcon = { className: '' }
const studentLabel = { textContent: '' }
studentButtons.add({
  setAttribute: (key, value) => { studentAttrs[key] = value },
  querySelector: selector => selector === 'i' ? studentIcon : studentLabel
})
let changes = 0
listeners.set('document:eduportal:themechange', () => changes++)

theme.toggleTheme()
assert.equal(saved.get('eduportal-theme'), 'light')
assert.equal(root.dataset.theme, 'light')
assert.equal(theme.getStudentTheme(), 'dark', 'students no longer follow the global light preference')
assert.equal(studentAttrs['aria-label'], 'Chuyển sang giao diện hồng pastel')
assert.equal(studentAttrs['aria-pressed'], 'false')
assert.equal(attrs['aria-pressed'], 'true')
assert.match(attrs['aria-label'], /tối/)
assert.equal(changes, 1)
theme.setTheme('invalid')
assert.equal(saved.get('eduportal-theme'), 'dark')
listeners.get('window:storage')({ key: 'eduportal-theme', newValue: 'light' })
assert.equal(root.dataset.theme, 'light', 'cross-tab changes must update without navigation')
listeners.get('window:storage')({ key: 'eduportal-theme', newValue: null })
assert.equal(root.dataset.theme, 'dark', 'storage removal falls back to default')
assert.equal(theme.getStudentTheme(), 'dark', 'global theme changes never move the student skin')
assert.equal(changes, 4)

// The student control only flips navy dark <-> rose pastel, in place.
const beforeStudent = changes
assert.equal(theme.toggleStudentTheme(), 'pastel')
assert.equal(changes, beforeStudent + 1, 'student changes notify charts without navigation')
assert.equal(saved.get('eduportal-student-theme'), 'pastel')
assert.equal(saved.get('eduportal-theme'), 'dark', 'student preference cannot change global theme')
assert.equal(root.dataset.theme, 'dark', 'admin/public preference is still global')
assert.equal(root.dataset.studentTheme, 'pastel')
assert.equal(studentAttrs['aria-pressed'], 'true')
assert.equal(studentAttrs['aria-label'], 'Chuyển sang giao diện tối')
assert.equal(studentAttrs['title'], 'Chuyển sang giao diện tối')
assert.equal(studentIcon.className, 'fa-solid fa-moon')
assert.equal(studentLabel.textContent, 'Giao diện tối')
assert.match(theme.renderStudentThemeToggle(), /aria-pressed="true"/)
assert.match(theme.renderStudentThemeToggle(), /Giao diện tối/)
assert.doesNotMatch(theme.renderStudentThemeToggle(), /sáng/i)
theme.toggleStudentTheme()
assert.equal(theme.getStudentTheme(), 'dark', 'the student control is two-way')
theme.setTheme('light')
assert.equal(theme.getStudentTheme(), 'dark', 'global toggles do not override a student choice')
assert.equal(root.dataset.theme, 'light', 'admin/public preference is still global')
assert.equal(theme.setStudentTheme('invalid'), 'dark', 'invalid input cannot replace the valid value')
assert.equal(theme.setStudentTheme('light'), 'dark', "a legacy 'light' write cannot return")
assert.equal(saved.get('eduportal-student-theme'), 'dark')

// The rendered buttons toggle through the delegated listener: attributes and
// theme classes are patched in place, never a route rerender.
listeners.get('document:click')({ target: { closest: selector => selector === '[data-student-theme-toggle]' ? {} : null } })
assert.equal(theme.getStudentTheme(), 'pastel', 'clicking the student button toggles in place')
assert.equal(studentAttrs['aria-pressed'], 'true')
listeners.get('document:click')({ target: { closest: selector => selector === '[data-theme-toggle]' ? {} : null } })
assert.equal(root.dataset.theme, 'dark', 'the global toggle stays independent')
listeners.get('document:click')({ target: { closest: () => null } })
assert.equal(theme.getStudentTheme(), 'pastel', 'unrelated clicks change nothing')

// Cross-tab student writes are normalized exactly like local ones.
listeners.get('window:storage')({ key: 'eduportal-student-theme', newValue: 'pastel' })
assert.equal(theme.getStudentTheme(), 'pastel', 'cross-tab student preference is applied')
listeners.get('window:storage')({ key: 'eduportal-student-theme', newValue: 'light' })
assert.equal(theme.getStudentTheme(), 'dark', "a cross-tab legacy 'light' maps to navy dark")
listeners.get('window:storage')({ key: 'eduportal-student-theme', newValue: 'broken' })
assert.equal(theme.getStudentTheme(), 'dark', 'invalid stored value falls back to navy dark')
listeners.get('window:storage')({ key: 'eduportal-student-theme', newValue: null })
assert.equal(theme.getStudentTheme(), 'dark', 'missing student preference restores navy dark')

// Keep role-based controls and route updates independent from the theme event;
// no theme handler should invoke the router or destroy in-flight view state.
const { state } = await import('../src/js/state.js')
const { renderSidebar } = await import('../src/js/components/sidebar.js')
state.token = 'fixture'
state.user = { role: 'STUDENT' }
assert.match(renderSidebar('my-classes'), /data-student-theme-toggle/)
assert.doesNotMatch(renderSidebar('my-classes'), /data-theme-toggle|student-theme-picker|sáng/i)
state.user = { role: 'ADMIN' }
assert.match(renderSidebar('admin-dashboard'), /data-theme-toggle/)
assert.match(renderSidebar('admin-dashboard'), /sáng/i, 'the admin sidebar keeps its light mode')
assert.doesNotMatch(renderSidebar('admin-dashboard'), /data-student-theme-toggle/)
state.user = null
state.token = null
assert.match(renderSidebar('roadmap'), /data-theme-toggle/)

const navbarSource = readFileSync(new URL('../src/js/components/navbar.js', import.meta.url), 'utf8')
assert.match(navbarSource, /renderStudentThemeToggle\('navbar-theme-toggle'\)/)
assert.doesNotMatch(navbarSource, /student-theme-picker|renderStudentThemePicker/)
const htmlSource = readFileSync(new URL('../index.html', import.meta.url), 'utf8')
assert.match(htmlSource, /=== 'pastel' \? 'pastel' : 'dark'/, 'the pre-CSS bootstrap only knows navy/pastel')
assert.doesNotMatch(htmlSource, /savedStudentTheme/, 'the bootstrap never maps students to the global light skin')
const appSource = readFileSync(new URL('../src/js/app.js', import.meta.url), 'utf8')
const themeHandler = appSource.match(/document\.addEventListener\('eduportal:themechange', \(\) => \{([\s\S]*?)\n\}\)/)?.[1]
assert.ok(themeHandler)
assert.doesNotMatch(themeHandler, /router\(|innerHTML|route\.render/, 'theme changes must never rerender routes')
console.log('Theme preference / cross-tab / accessible state: OK')
