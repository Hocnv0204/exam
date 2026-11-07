import test from 'node:test'
import assert from 'node:assert/strict'

const saved = new Map()
const storage = {
  getItem: key => saved.get(key) ?? null,
  setItem: (key, value) => saved.set(key, String(value)),
  removeItem: key => saved.delete(key)
}

globalThis.localStorage = storage
globalThis.sessionStorage = storage
globalThis.CustomEvent = class {
  constructor(type, options = {}) { this.type = type; this.detail = options.detail }
}
globalThis.document = {
  documentElement: { dataset: {}, style: {} },
  addEventListener: () => {},
  dispatchEvent: () => {},
  querySelectorAll: () => [],
  getElementById: () => null
}
globalThis.window = {
  location: { hash: '#student-dashboard', search: '' },
  addEventListener: () => {},
  matchMedia: () => ({ matches: false })
}

const { state } = await import('../src/js/state.js')
const {
  renderSidebar,
  renderClassicSidebar
} = await import('../src/js/components/sidebar.js')
const {
  renderNavbar,
  renderClassicNavbar
} = await import('../src/js/components/navbar.js')

function useStudent() {
  state.token = 'test-token'
  state.user = { id: 'student-1', role: 'STUDENT', fullName: 'Nguyễn Minh Anh', username: 'minhanh' }
}

function setMochi(enabled) {
  if (enabled) saved.set('eduportal-ui', 'mochi')
  else saved.set('eduportal-ui', 'classic') // Mochi là mặc định: phải chọn giao diện cũ tường minh
  window.location.search = ''
}

test('cờ tắt giữ nguyên tuyệt đối output shell classic', () => {
  useStudent()
  setMochi(false)
  assert.equal(renderSidebar('student-dashboard'), renderClassicSidebar('student-dashboard'))
  assert.equal(
    renderNavbar('Học tập / Dashboard'),
    renderClassicNavbar('Học tập / Dashboard')
  )
})

test('Mochi student shell có nav, tab bar, picker và route hiện tại', () => {
  useStudent()
  setMochi(true)
  const sidebar = renderSidebar('attendance')
  const navbar = renderNavbar('không dùng trong Mochi')
  const shell = sidebar + navbar

  assert.match(sidebar, /<nav class="m-shell-nav" aria-label="Điều hướng chính">/)
  assert.match(sidebar, /<nav class="m-tabbar" aria-label="Điều hướng nhanh">/)
  assert.match(sidebar, /href="#attendance" aria-current="page"/)
  assert.doesNotMatch(sidebar, /href="#weekly-calendar"/, 'học sinh không còn mục Lịch học trên menu')
  assert.equal((sidebar.match(/aria-current="page"/g) || []).length, 2, 'desktop và mobile cùng đánh dấu route')
  assert.match(navbar, /class="m-theme-picker m-shell-theme-picker"/)
  assert.equal((navbar.match(/data-student-theme-option=/g) || []).length, 4)
  // Thành tích/Điểm danh là mục điều hướng; số liệu XP/streak không nằm trong shell tĩnh.
  assert.match(sidebar, /href="#achievements"/)
  assert.match(sidebar, /href="#attendance"/)
  assert.match(sidebar, /<details class="m-tab-more is-active">/, 'mục phụ đang mở làm sáng ô Thêm')
  assert.doesNotMatch(shell, /\bXP\b|streak/i)
  assert.doesNotMatch(shell, /data-student-theme-toggle/)
})

test('mọi route con được ánh xạ về đúng mục điều hướng', () => {
  useStudent()
  setMochi(true)
  const expectations = new Map([
    ['student-dashboard', '#student-dashboard'],
    ['my-classes', '#my-classes'],
    ['my-homeworks', '#my-homeworks'],
    ['homework-attempt', '#my-homeworks'],
    ['history', '#history'],
    ['assignment-review', '#history'],
    ['student-report', '#history'],
    ['attendance', '#attendance'],
    ['achievements', '#achievements']
  ])
  for (const [route, href] of expectations) {
    assert.match(renderSidebar(route), new RegExp(`href="${href}" aria-current="page"`), route)
  }
})

test('ADMIN dùng shell Pro riêng khi cờ giao diện mới bật', () => {
  setMochi(true)
  state.token = 'admin-token'
  state.user = { id: 'admin-1', role: 'ADMIN', fullName: 'Quản trị viên', username: 'admin' }
  window.location.hash = '#admin-dashboard'
  assert.notEqual(renderSidebar('admin-dashboard'), renderClassicSidebar('admin-dashboard'))
  assert.notEqual(renderNavbar('Quản trị / Dashboard'), renderClassicNavbar('Quản trị / Dashboard'))
  assert.match(renderSidebar('admin-dashboard') + renderNavbar(), /ap-(?:sidebar|header)/)
  assert.doesNotMatch(renderSidebar('admin-dashboard') + renderNavbar(), /m-shell-(?:nav|header)/)
})

test('route ngoài shell và exam-room không nhận navbar Mochi', () => {
  useStudent()
  setMochi(true)
  for (const route of ['exam-room', 'question-appeals']) {
    window.location.hash = `#${route}`
    assert.equal(renderNavbar('Giữ khung riêng'), renderClassicNavbar('Giữ khung riêng'), route)
  }
  window.location.hash = '#student-dashboard'
})
