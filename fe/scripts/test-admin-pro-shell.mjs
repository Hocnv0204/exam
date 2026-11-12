import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

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
  querySelector: () => null,
  getElementById: () => null
}
globalThis.window = {
  location: { hash: '#admin-dashboard', search: '' },
  addEventListener: () => {},
  matchMedia: () => ({ matches: false })
}

const { state } = await import('../src/js/state.js')
const {
  isAdminProUI,
  isMochiUI,
  syncAdminProUI
} = await import('../src/js/ui-flag.js')
const {
  renderSidebar,
  renderClassicSidebar,
  renderAdminProSidebar,
  renderMochiSidebar
} = await import('../src/js/components/sidebar.js')
const {
  renderNavbar,
  renderClassicNavbar,
  renderMochiNavbar
} = await import('../src/js/components/navbar.js')

function useAdmin() {
  state.token = 'admin-token'
  state.user = { id: 'admin-1', role: 'ADMIN', fullName: 'Thầy Hoàng', username: 'admin' }
}

function useStudent() {
  state.token = 'student-token'
  state.user = { id: 'student-1', role: 'STUDENT', fullName: 'Nguyễn Minh Anh', username: 'minhanh' }
}

function setUI(value, query = '') {
  saved.set('eduportal-ui', value)
  window.location.search = query
}

test('isAdminProUI chỉ bật cho ADMIN theo lựa chọn Mochi dùng chung', () => {
  useAdmin()
  setUI('mochi')
  assert.equal(isMochiUI(), true)
  assert.equal(isAdminProUI(), true)

  setUI('mochi', '?ui=classic')
  assert.equal(isAdminProUI(), false)
  assert.equal(saved.get('eduportal-ui'), 'classic', 'query classic phải lưu opt-out')

  setUI('classic', '?ui=mochi')
  assert.equal(isAdminProUI(), true)
  assert.equal(saved.get('eduportal-ui'), 'mochi', 'query mochi phải bật lại lựa chọn')

  useStudent()
  window.location.search = ''
  assert.equal(isAdminProUI(), false)
  state.token = null
  state.user = null
  assert.equal(isAdminProUI(), false)
})

test('ADMIN Pro có đủ menu, href đúng và giữ các mục ẩn ở trạng thái ẩn', () => {
  useAdmin()
  setUI('mochi')
  const sidebar = renderSidebar('admin-dashboard')
  const expected = new Map([
    ['Dashboard', '#admin-dashboard'],
    ['Lịch tuần', '#weekly-calendar'],
    ['Học sinh', '#students'],
    ['Lớp học', '#classes-admin'],
    ['Bài tập & đề thi', '#homework-mgmt'],
    ['Học thử', '#trial-management'],
    ['Ngân hàng câu hỏi', '#question-bank'],
    ['Chấm bài & nộp bài', '#admin-history'],
    ['Học phí', '#tuition-ledger'],
    ['Nhật ký hoạt động', '#activity-logs']
  ])
  for (const [label, href] of expected) {
    assert.match(sidebar, new RegExp(`href="${href.replace('#', '\\#')}"[^>]*>[\\s\\S]*?${label}`), label)
  }
  assert.match(sidebar, /Tổng quan/)
  assert.match(sidebar, /Giảng dạy/)
  assert.match(sidebar, /nav-section-title">Học sinh</)
  assert.match(sidebar, /Tài chính & hệ thống/)
  assert.doesNotMatch(sidebar, /href="#question-appeals"|href="#grade-blocks"/, 'mục đang ẩn không được tự hiện')
  assert.match(sidebar, /id="sidebar-logout-btn"/)
  // Bộ chọn 4 chế độ màu Mochi (Sáng/Tối/Sakura/Bạc hà) thay nút Sáng/Tối
  for (const p of ['light', 'dark', 'sakura', 'mint']) assert.match(sidebar, new RegExp(`data-admin-palette-option="${p}"`))
  assert.match(sidebar, /Thầy Hoàng/)
})

test('header ADMIN Pro có thương hiệu, điều khiển theme, tài khoản và đăng xuất', () => {
  useAdmin()
  setUI('mochi')
  window.location.hash = '#admin-dashboard'
  const header = renderNavbar('Quản trị / Dashboard')
  assert.match(header, /class="top-navbar ap-header"/)
  assert.match(header, /ap-header-brand[\s\S]*EduPortal[\s\S]*Quản trị/)
  // Bộ chọn 4 chế độ màu Mochi (Sáng/Tối/Sakura/Bạc hà) thay nút Sáng/Tối
  for (const p of ['light', 'dark', 'sakura', 'mint']) assert.match(header, new RegExp(`data-admin-palette-option="${p}"`))
  assert.match(header, /Thầy Hoàng/)
  assert.match(header, /data-admin-logout/)
})

test('route con ADMIN Pro active đúng mục cha', () => {
  useAdmin()
  setUI('mochi')
  const expectations = new Map([
    ['class-details', '#classes-admin'],
    ['curriculum', '#classes-admin'],
    ['grade-blocks', '#classes-admin'],
    ['exam-proctoring', '#homework-mgmt'],
    ['create-homework', '#homework-mgmt'],
    ['student-details', '#students'],
    ['student-report', '#students'],
    ['assignment-review', '#admin-history'],
    ['question-appeals', '#admin-history']
  ])
  for (const [route, href] of expectations) {
    const sidebar = renderSidebar(route)
    assert.match(sidebar, new RegExp(`class="nav-item ap-nav-item active" href="${href.replace('#', '\\#')}" aria-current="page"`), route)
    assert.equal((sidebar.match(/aria-current="page"/g) || []).length, 1, route)
  }
})

test('ADMIN opt-out trả đúng output classic, không chỉ giống hình thức', () => {
  useAdmin()
  setUI('classic')
  window.location.hash = '#admin-dashboard'
  assert.equal(renderSidebar('admin-dashboard'), renderClassicSidebar('admin-dashboard'))
  assert.equal(renderNavbar('Quản trị / Dashboard'), renderClassicNavbar('Quản trị / Dashboard'))
})

test('STUDENT tiếp tục dùng nguyên shell Mochi, không nhận shell Pro', () => {
  useStudent()
  setUI('mochi')
  window.location.hash = '#student-dashboard'
  assert.equal(renderSidebar('student-dashboard'), renderMochiSidebar('student-dashboard'))
  assert.equal(renderNavbar('không dùng'), renderMochiNavbar())
  assert.doesNotMatch(renderSidebar('student-dashboard') + renderNavbar(), /\bap-(?:sidebar|header|nav)\b/)
  assert.equal(isAdminProUI(), false)
})

test('data-admin-ui chỉ tồn tại trên route admin của ADMIN Pro', () => {
  useAdmin()
  setUI('mochi')
  assert.equal(syncAdminProUI(true), true)
  assert.equal(document.documentElement.dataset.adminUi, 'pro')
  assert.equal(syncAdminProUI(false), false)
  assert.equal('adminUi' in document.documentElement.dataset, false)

  useStudent()
  assert.equal(syncAdminProUI(true), false)
  assert.equal('adminUi' in document.documentElement.dataset, false)

  state.token = null
  state.user = null
  assert.equal(syncAdminProUI(true), false)
  assert.equal('adminUi' in document.documentElement.dataset, false, 'khách không bao giờ có data-admin-ui')
})

test('export renderer Pro khớp nhánh render chính khi bật cờ', () => {
  useAdmin()
  setUI('mochi')
  window.location.hash = '#students'
  assert.equal(renderSidebar('students'), renderAdminProSidebar('students'))
  assert.match(renderNavbar('Quản trị / Học sinh'), /class="top-navbar ap-header"/)
})

test('ADMIN không có hash vẫn nhận navbar Pro của route dashboard mặc định', () => {
  useAdmin()
  setUI('mochi')
  window.location.hash = ''
  assert.match(renderNavbar(), /class="top-navbar ap-header"/)
})

test('shell Pro thu gọn đúng ở tablet và sidebar không lặp tài khoản/đăng xuất', () => {
  const css = readFileSync(new URL('../src/css/admin-pro/components.css', import.meta.url), 'utf8')
  const tablet = css.match(/@media\s*\(max-width:\s*1100px\)\s*\{([\s\S]*?)\n\}/)?.[1] || ''
  const mobile = css.match(/@media\s*\(max-width:\s*900px\)\s*\{([\s\S]*?)\n\}/)?.[1] || ''

  assert.match(tablet, /\.theme-toggle-label[\s\S]*\.ap-icon-action span[\s\S]*\.ap-account > span[\s\S]*display:\s*none/)
  assert.match(tablet, /flex-wrap:\s*nowrap/)
  assert.match(mobile, /\.navbar-breadcrumb[\s\S]*display:\s*none/)
  assert.match(css, /\.ap-sidebar-footer :is\(\.ap-sidebar-user, \.ap-logout\)\s*\{\s*display:\s*none\s*!important;/)
})
