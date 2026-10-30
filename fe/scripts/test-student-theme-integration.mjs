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
const { setStudentTheme, renderStudentThemePicker } = await import('../src/js/theme.js')
state.user = { id: 'fixture', role: 'STUDENT' }
state.currentHomework = null // No real exam/API/session is opened.
assert.match(renderExamRoomView(), /exam-room-layout pastel-student/)
assert.match(renderStudentThemePicker('exam-student-theme-picker'), /data-student-theme-picker/)
const examSource = readFileSync(new URL('../src/js/views/exam-room.js', import.meta.url), 'utf8')
assert.match(examSource, /renderStudentThemePicker\('exam-student-theme-picker'\)/)
assert.doesNotMatch(examSource, /renderThemeToggle/, 'exam uses the student picker, not the global binary toggle')
setStudentTheme('light')
assert.match(renderExamRoomView(), /class="exam-room-layout"/)
setStudentTheme('dark')
assert.match(renderExamRoomView(), /exam-room-layout navy-student/)

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
