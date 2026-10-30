import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

const saved = new Map([['eduportal-theme', 'dark'], ['eduportal-student-theme', 'pastel']])
const listeners = new Map()
globalThis.localStorage = {
  getItem: key => saved.get(key) ?? null,
  setItem: (key, value) => saved.set(key, value)
}
globalThis.CustomEvent = class { constructor(type, options) { this.type = type; this.detail = options.detail } }
const root = { dataset: {}, style: {} }
let canvas = null
globalThis.document = {
  documentElement: root,
  addEventListener: (type, fn) => listeners.set(type, fn),
  dispatchEvent: event => listeners.get(event.type)?.(event),
  querySelectorAll: () => [],
  getElementById: id => id === 'report-trend-chart' ? canvas : null
}
globalThis.window = { location: { hash: '#student-report' }, addEventListener: () => {} }

const { state } = await import('../src/js/state.js')
const { renderExamRoomView } = await import('../src/js/views/exam-room.js')
const { updateReportChartTheme } = await import('../src/js/views/student-report.js')
const { setStudentTheme, toggleStudentTheme, renderStudentThemeToggle, getStudentTheme } = await import('../src/js/theme.js')
state.user = { id: 'fixture', role: 'STUDENT' }
state.currentHomework = null // No real exam/API/session is opened.
assert.match(renderExamRoomView(), /exam-room-layout pastel-student/)

// The exam toolbar carries the shared two-way button, never a native select.
const examToggle = renderStudentThemeToggle('exam-student-theme-toggle')
assert.match(examToggle, /data-student-theme-toggle/)
assert.match(examToggle, /class="theme-toggle student-theme-toggle exam-student-theme-toggle"/)
assert.doesNotMatch(examToggle, /sáng|<select|data-student-theme-picker/i)
const examSource = readFileSync(new URL('../src/js/views/exam-room.js', import.meta.url), 'utf8')
assert.match(examSource, /renderStudentThemeToggle\('exam-student-theme-toggle'\)/)
assert.doesNotMatch(examSource, /renderThemeToggle|student-theme-picker|renderStudentThemePicker/,
  'exam uses the student toggle, not the global binary toggle nor the old picker')

// Toggling only flips the shell class: no rerender, so answers/drafts survive.
toggleStudentTheme()
assert.equal(getStudentTheme(), 'dark')
assert.match(renderExamRoomView(), /exam-room-layout navy-student/)
toggleStudentTheme()
assert.match(renderExamRoomView(), /exam-room-layout pastel-student/)
setStudentTheme('invalid')
assert.equal(getStudentTheme(), 'pastel', 'invalid input cannot replace the valid mode')
setStudentTheme('light')
assert.equal(getStudentTheme(), 'pastel', "a legacy 'light' cannot return to the student palette")
assert.equal(saved.get('eduportal-student-theme'), 'pastel')
assert.equal(saved.get('eduportal-theme'), 'dark', 'the student control cannot change the global theme')
setStudentTheme('dark')
assert.match(renderExamRoomView(), /exam-room-layout navy-student/)

// Compact styling: no dead picker rules, and the button keeps a 44px target in
// the navbar and the exam toolbar at phone widths.
const cssSource = readFileSync(new URL('../src/css/theme-public.css', import.meta.url), 'utf8')
assert.doesNotMatch(cssSource, /student-theme-picker/, 'the dead three-way picker CSS is removed')
assert.match(cssSource, /\.top-navbar \.student-theme-toggle \{[^}]*min-width: 44px;[^}]*min-height: 44px;/,
  'the navbar toggle keeps a 44px touch target at touch widths')
assert.match(cssSource, /\.exam-top-toolbar \.student-theme-toggle \{[^}]*min-width: 44px;[^}]*min-height: 44px;/,
  'the exam toolbar toggle keeps a 44px touch target at phone widths')
assert.match(cssSource, /\.app-layout\.sidebar-hover-expand \.sidebar-theme-toggle \{[^}]*min-height: 44px;/,
  'the collapsed rail reuses the shared 44px icon target')

const chart = {
  data: { datasets: [{}, {}] },
  options: {
    scales: { x: { ticks: {} }, y: { ticks: {}, grid: {} } },
    plugins: { legend: { labels: {} }, tooltip: {} }
  },
  updates: [],
  update(mode) { this.updates.push(mode) }
}
let shell = 'pastel-student'
canvas = { closest: selector => selector.includes(shell) && selector.includes('student-report') ? {} : null }
window.Chart = { getChart: target => target === canvas ? chart : null }
updateReportChartTheme()
const pastelLine = chart.data.datasets[1].borderColor
assert.match(pastelLine, /147, 74, 154/)
assert.equal(chart.options.plugins.tooltip.titleColor, '#fff8fc')
shell = 'navy-student'
updateReportChartTheme()
assert.notEqual(chart.data.datasets[1].borderColor, pastelLine)
shell = 'public-report-layout'
updateReportChartTheme()
assert.equal(chart.options.scales.x.ticks.color, '#64748b', 'public report keeps the light palette')
assert.deepEqual(chart.updates, ['none', 'none', 'none'], 'theme changes repaint an existing chart')
console.log('Student exam shell / private report chart palette: OK')
