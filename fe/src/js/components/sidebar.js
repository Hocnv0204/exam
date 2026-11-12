import { state, logout } from '../state.js'
import { renderThemeToggle, renderStudentThemeToggle, renderAdminPalettePicker } from '../theme.js'
import { isMochiUI, isAdminProUI, ADMIN_PRO_ROUTES, MOCHI_FEATURES } from '../ui-flag.js'

const escapeText = value => String(value ?? '').replace(/[&<>"']/g, char => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[char]))

const MOCHI_STUDENT_ROUTES = new Set([
  'student-dashboard', 'my-classes', 'my-homeworks', 'weekly-calendar',
  'homework-attempt', 'assignment-review', 'history', 'student-report',
  'attendance', 'achievements'
])

const MOCHI_NAV_ITEMS = [
  { route: 'student-dashboard', label: 'Trang chủ', icon: 'fa-house', routes: ['student-dashboard'] },
  { route: 'my-classes', label: 'Lớp của tôi', shortLabel: 'Lớp học', icon: 'fa-graduation-cap', routes: ['my-classes'] },
  { route: 'my-homeworks', label: 'Bài tập', icon: 'fa-list-check', routes: ['my-homeworks', 'homework-attempt'] },
  { route: 'attendance', label: 'Điểm danh', icon: 'fa-clipboard-user', routes: ['attendance'] },
  { route: 'history', label: 'Lịch sử làm bài', shortLabel: 'Lịch sử', icon: 'fa-clock-rotate-left', routes: ['history', 'assignment-review', 'student-report'] },
  { route: 'achievements', label: 'Thành tích', icon: 'fa-trophy', routes: ['achievements'] }
]

// Tab bar điện thoại chỉ đủ 5 ô: 4 mục chính + "Thêm" chứa các mục còn lại.
const MOCHI_TAB_PRIMARY = ['student-dashboard', 'my-classes', 'my-homeworks', 'history']

function renderMochiTabbar(currentRoute) {
  const primary = MOCHI_NAV_ITEMS.filter(item => MOCHI_TAB_PRIMARY.includes(item.route))
  const extra = MOCHI_NAV_ITEMS.filter(item => !MOCHI_TAB_PRIMARY.includes(item.route))
  const extraActive = extra.some(item => item.routes.includes(currentRoute))
  return `
    <nav class="m-tabbar" aria-label="Điều hướng nhanh">
      ${primary.map(item => renderMochiNavLink(item, currentRoute, { compact: true })).join('')}
      <details class="m-tab-more${extraActive ? ' is-active' : ''}">
        <summary class="m-shell-nav-link m-tab-more-toggle">
          <i class="fa-solid fa-ellipsis" aria-hidden="true"></i>
          <span>Thêm</span>
        </summary>
        <div class="m-tab-more-menu" role="list">
          ${extra.map(item => renderMochiNavLink(item, currentRoute)).join('')}
          <button type="button" class="m-tab-more-logout" data-mochi-logout>
            <i class="fa-solid fa-arrow-right-from-bracket" aria-hidden="true"></i>
            <span>Đăng xuất</span>
          </button>
        </div>
      </details>
    </nav>
  `
}

function isMochiStudentShell(currentRoute) {
  return state.user?.role === 'STUDENT' && Boolean(state.token) &&
    MOCHI_STUDENT_ROUTES.has(currentRoute) && isMochiUI()
}

function renderMochiNavLink(item, currentRoute, { compact = false } = {}) {
  const active = item.routes.includes(currentRoute)
  return `<a class="m-shell-nav-link${active ? ' is-active' : ''}" href="#${item.route}"${active ? ' aria-current="page"' : ''}>
    <i class="fa-solid ${item.icon}" aria-hidden="true"></i>
    <span>${compact ? (item.shortLabel || item.label) : item.label}</span>
  </a>`
}

export function renderMochiSidebar(currentRoute) {
  const achievementsEnabled = MOCHI_FEATURES.xp || MOCHI_FEATURES.badges || MOCHI_FEATURES.leaderboard
  return `
    <aside class="m-shell-sidebar" id="app-sidebar">
      <nav class="m-shell-nav" aria-label="Điều hướng chính">
        ${MOCHI_NAV_ITEMS.map(item => renderMochiNavLink(item, currentRoute)).join('')}
        ${achievementsEnabled ? '<!-- Thành tích sẽ được bổ sung khi feature có dữ liệu thật. -->' : ''}
      </nav>
      <button type="button" class="m-shell-logout" data-mochi-logout>
        <i class="fa-solid fa-arrow-right-from-bracket" aria-hidden="true"></i>
        <span>Đăng xuất</span>
      </button>
    </aside>
    ${renderMochiTabbar(currentRoute)}
  `
}

export function renderSidebar(currentRoute) {
  if (state.token && ADMIN_PRO_ROUTES.has(currentRoute) && isAdminProUI()) return renderAdminProSidebar(currentRoute)
  if (isMochiStudentShell(currentRoute)) return renderMochiSidebar(currentRoute)
  return renderClassicSidebar(currentRoute)
}

const ADMIN_PRO_GROUPS = [
  {
    label: 'Tổng quan',
    items: [
      { route: 'admin-dashboard', label: 'Dashboard', icon: 'fa-table-cells-large', routes: ['admin-dashboard'] },
      { route: 'weekly-calendar', label: 'Lịch tuần', icon: 'fa-calendar-week', routes: ['weekly-calendar'] }
    ]
  },
  // Nhóm theo luồng công việc, nhãn ngắn (bỏ tiền tố "Quản lý" lặp lại). Route con được gom vào
  // mục cha: chi tiết lớp/chương trình/khối học → Lớp học; tạo bài/giám sát phòng thi → Bài tập;
  // xem lại bài/phúc khảo → Chấm bài; chi tiết/báo cáo học sinh → Học sinh.
  {
    label: 'Giảng dạy',
    items: [
      { route: 'classes-admin', label: 'Lớp học', icon: 'fa-book-bookmark', routes: ['classes', 'classes-admin', 'class-details', 'curriculum', 'grade-blocks'] },
      { route: 'homework-mgmt', label: 'Bài tập & đề thi', icon: 'fa-list-check', routes: ['homework', 'homework-mgmt', 'create-homework', 'exam-proctoring'] },
      { route: 'question-bank', label: 'Ngân hàng câu hỏi', icon: 'fa-boxes-stacked', routes: ['question-bank'] },
      { route: 'admin-history', label: 'Chấm bài & nộp bài', icon: 'fa-clipboard-check', routes: ['admin-history', 'assignment-review', 'question-appeals'] }
    ]
  },
  {
    label: 'Học sinh',
    items: [
      { route: 'students', label: 'Học sinh', icon: 'fa-users', routes: ['students', 'student-details', 'student-report'] },
      { route: 'trial-management', label: 'Học thử', icon: 'fa-wand-magic-sparkles', routes: ['trial-management'] }
    ]
  },
  {
    label: 'Tài chính & hệ thống',
    items: [
      { route: 'tuition-ledger', label: 'Học phí', icon: 'fa-receipt', routes: ['tuition-ledger'] },
      { route: 'activity-logs', label: 'Nhật ký hoạt động', icon: 'fa-clipboard-list', routes: ['activity-logs'] }
    ]
  }
]

function renderAdminProLink(item, currentRoute) {
  const active = item.routes.includes(currentRoute)
  return `<a class="nav-item ap-nav-item${active ? ' active' : ''}" href="#${item.route}"${active ? ' aria-current="page"' : ''}>
    <span class="ap-nav-icon"><i class="fa-solid ${item.icon}" aria-hidden="true"></i></span>
    <span>${item.label}</span>
  </a>`
}

export function renderAdminProSidebar(currentRoute) {
  const name = escapeText(state.user?.fullName || 'Quản trị hệ thống')
  return `
    <aside class="sidebar ap-sidebar" id="app-sidebar" aria-label="Điều hướng quản trị">
      <nav class="ap-nav" aria-label="Điều hướng chính">
        ${ADMIN_PRO_GROUPS.map(group => `
          <div class="ap-nav-group">
            <div class="nav-section-title">${group.label}</div>
            ${group.items.map(item => renderAdminProLink(item, currentRoute)).join('')}
          </div>
        `).join('')}
      </nav>
      <div class="ap-sidebar-footer">
        <div class="ap-sidebar-user" title="${name}"><i class="fa-solid fa-user-shield" aria-hidden="true"></i><span>${name}</span></div>
        ${renderAdminPalettePicker('ap-sidebar-palette')}
        <button type="button" class="nav-item ap-logout" id="sidebar-logout-btn">
          <i class="fa-solid fa-arrow-right-from-bracket" aria-hidden="true"></i><span>Đăng xuất</span>
        </button>
      </div>
    </aside>
  `
}

// Markup classic được giữ nguyên để cờ Mochi tắt không làm thay đổi output.
export function renderClassicSidebar(currentRoute) {
  const isGuest = !state.token
  const role = state.user?.role || 'STUDENT'

  // Tạm ẩn mục "Hỏi về câu đã nộp" ở admin và ba mục lịch/lộ trình ở học sinh; route vẫn hoạt động.
  return `
    <aside class="sidebar" id="app-sidebar" aria-label="Điều hướng chính">
      <div class="brand-logo" onclick="window.location.hash='${isGuest ? '#roadmap' : (role === 'ADMIN' ? '#admin-dashboard' : '#student-dashboard')}'" style="cursor:pointer;">
        <i class="fa-solid fa-graduation-cap"></i>
        <span>EduPortal</span>
      </div>

      ${isGuest ? `
        <div class="nav-section-title">Trải nghiệm học thử</div>
        <div class="nav-item ${currentRoute === 'roadmap' || currentRoute === 'roadmap-12' ? 'active' : ''}" onclick="window.location.hash='#roadmap'"><i class="fa-solid fa-route" style="color:#0284c7;"></i> Lộ trình Hóa 12 (Bứt phá 8+)</div>
        <div class="nav-item ${currentRoute === 'roadmap-11' ? 'active' : ''}" onclick="window.location.hash='#roadmap-11'"><i class="fa-solid fa-compass" style="color:#8b5cf6;"></i> Lộ trình Hóa 11 (Chuẩn KNTT)</div>
        ${isMochiUI() ? `
        <div class="nav-item ${currentRoute === 'roadmap-math-12' ? 'active' : ''}" onclick="window.location.hash='#roadmap-math-12'"><i class="fa-solid fa-square-root-variable" style="color:#d63b78;"></i> Lộ trình Toán 12 (Bứt phá 8+)</div>
        <div class="nav-item ${currentRoute === 'roadmap-math-11' ? 'active' : ''}" onclick="window.location.hash='#roadmap-math-11'"><i class="fa-solid fa-shapes" style="color:#0a7a60;"></i> Lộ trình Toán 11 (Chuẩn KNTT)</div>
        ` : ''}
        <div class="nav-item ${currentRoute === 'trial' ? 'active' : ''}" onclick="window.location.hash='#trial?tab=lessons'">
          <i class="fa-solid fa-wand-magic-sparkles" style="color:#16a34a;"></i> Bài học thử
        </div>
        <div class="nav-item" onclick="window.location.hash='#login'">
          <i class="fa-solid fa-arrow-right-to-bracket"></i> Đăng nhập
        </div>
      ` : (role === 'ADMIN' ? `
        <div class="nav-section-title">Quản trị viên</div>
        <a class="nav-item ${currentRoute === 'weekly-calendar' ? 'active' : ''}" href="#weekly-calendar" style="text-decoration:none;">
          <i class="fa-solid fa-calendar-week" aria-hidden="true"></i> Lịch tuần
        </a>
        <div class="nav-item ${currentRoute === 'admin-dashboard' ? 'active' : ''}" onclick="window.location.hash='#admin-dashboard'">
          <i class="fa-solid fa-table-cells-large"></i> Dashboard
        </div>
        <div class="nav-item ${currentRoute === 'students' ? 'active' : ''}" onclick="window.location.hash='#students'">
          <i class="fa-solid fa-users"></i> Quản lý học sinh
        </div>
        <div class="nav-item ${currentRoute === 'classes-admin' ? 'active' : ''}" onclick="window.location.hash='#classes-admin'">
          <i class="fa-solid fa-book-bookmark"></i> Quản lý lớp học
        </div>
        <div class="nav-item ${currentRoute === 'homework-mgmt' || currentRoute === 'create-homework' ? 'active' : ''}" onclick="window.location.hash='#homework-mgmt'">
          <i class="fa-solid fa-list-check"></i> Quản lý bài tập
        </div>
        <div class="nav-item ${currentRoute === 'trial-management' ? 'active' : ''}" onclick="window.location.hash='#trial-management'">
          <i class="fa-solid fa-wand-magic-sparkles" style="color:#16a34a;"></i> Quản lý học thử
        </div>
        <div class="nav-item ${currentRoute === 'question-bank' ? 'active' : ''}" onclick="window.location.hash='#question-bank'">
          <i class="fa-solid fa-boxes-stacked"></i> Ngân hàng câu hỏi
        </div>
        <div class="nav-item ${currentRoute === 'admin-history' ? 'active' : ''}" onclick="window.location.hash='#admin-history'">
          <i class="fa-solid fa-clock-rotate-left"></i> Lịch sử nộp bài
        </div>
        <div class="nav-item ${currentRoute === 'tuition-ledger' ? 'active' : ''}" onclick="window.location.hash='#tuition-ledger'">
          <i class="fa-solid fa-receipt"></i> Sổ giao dịch học phí
        </div>
        <div class="nav-item ${currentRoute === 'activity-logs' ? 'active' : ''}" onclick="window.location.hash='#activity-logs'">
          <i class="fa-solid fa-clipboard-list"></i> Nhật ký hoạt động
        </div>
      ` : `
        <div class="nav-section-title">Dành cho học sinh</div>
        <div class="nav-item ${currentRoute === 'student-dashboard' ? 'active' : ''}" onclick="window.location.hash='#student-dashboard'">
          <i class="fa-solid fa-chart-line"></i> Dashboard
        </div>
        <div class="nav-item ${currentRoute === 'my-classes' ? 'active' : ''}" data-tour-nav="classes" onclick="window.location.hash='#my-classes'">
          <i class="fa-solid fa-graduation-cap"></i> Lớp học của tôi
        </div>
        <div class="nav-item ${currentRoute === 'my-homeworks' ? 'active' : ''}" data-tour-nav="homeworks" onclick="window.location.hash='#my-homeworks'">
          <i class="fa-solid fa-list-check"></i> Bài tập của tôi
        </div>
        <div class="nav-item ${currentRoute === 'history' ? 'active' : ''}" data-tour-nav="history" onclick="window.location.hash='#history'">
          <i class="fa-solid fa-clock-rotate-left"></i> Lịch sử nộp bài
        </div>
      `)}

      <div style="margin-top:auto; padding-top:20px; border-top:1px solid var(--border-color);">
        ${state.user?.role === 'STUDENT' ? renderStudentThemeToggle('sidebar-theme-toggle') : renderThemeToggle('sidebar-theme-toggle')}
        <div class="nav-item" id="sidebar-logout-btn">
          <i class="fa-solid ${isGuest ? 'fa-arrow-right-to-bracket' : 'fa-arrow-right-from-bracket'}"></i> ${isGuest ? 'Đăng nhập' : 'Đăng xuất'}
        </div>
      </div>
    </aside>
  `
}

export function bindSidebarEvents() {
  // The legacy menu contains click-driven rows. Make them operable with a keyboard
  // without changing their existing routes or active-state styling.
  document.querySelectorAll?.('.sidebar .nav-item').forEach(item => {
    if (item.classList.contains('active')) item.setAttribute('aria-current', 'page')
    if (item.tagName === 'A') return
    item.setAttribute('role', 'link')
    item.tabIndex = 0
    item.addEventListener('keydown', event => {
      if (event.key === 'Enter' || event.key === ' ') {
        event.preventDefault()
        item.click()
      }
    })
  })
  const handleLogout = () => {
    if (!state.token) {
      window.location.hash = '#login'
    } else {
      logout()
    }
  }
  document.getElementById('sidebar-logout-btn')?.addEventListener('click', handleLogout)
  document.querySelectorAll?.('[data-mochi-logout], [data-admin-logout]').forEach(button => {
    button.addEventListener('click', handleLogout)
  })
}
