import { state, logout } from '../state.js'

export function renderSidebar(currentRoute) {
  const role = state.user?.role || 'ADMIN'

  return `
    <aside class="sidebar">
      <div class="brand-logo">
        <i class="fa-solid fa-graduation-cap"></i>
        <span>EduPortal</span>
      </div>

      ${role === 'ADMIN' ? `
        <div class="nav-section-title">Quản trị viên</div>
        <div class="nav-item ${currentRoute === 'admin-dashboard' ? 'active' : ''}" onclick="window.location.hash='#admin-dashboard'">
          <i class="fa-solid fa-table-cells-large"></i> Dashboard
        </div>
        <div class="nav-item ${currentRoute === 'students' ? 'active' : ''}" onclick="window.location.hash='#students'">
          <i class="fa-solid fa-users"></i> Quản lý học sinh
        </div>
        <div class="nav-item ${currentRoute === 'classes-admin' ? 'active' : ''}" onclick="window.location.hash='#classes-admin'">
          <i class="fa-solid fa-book-bookmark"></i> Quản lý lớp học
        </div>
        <div class="nav-item ${currentRoute === 'curriculum' ? 'active' : ''}" onclick="window.location.hash='#curriculum'">
          <i class="fa-solid fa-book-open"></i> Chương & Bài học
        </div>
        <div class="nav-item ${currentRoute === 'create-homework' ? 'active' : ''}" onclick="window.location.hash='#create-homework'">
          <i class="fa-solid fa-file-signature"></i> Tạo bài tập
        </div>
        <div class="nav-item ${currentRoute === 'admin-history' ? 'active' : ''}" onclick="window.location.hash='#admin-history'">
          <i class="fa-solid fa-clock-rotate-left"></i> Lịch sử nộp bài
        </div>
      ` : `
        <div class="nav-section-title">Dành cho học sinh</div>
        <div class="nav-item ${currentRoute === 'my-classes' ? 'active' : ''}" onclick="window.location.hash='#my-classes'">
          <i class="fa-solid fa-graduation-cap"></i> Lớp học của tôi
        </div>
        <div class="nav-item ${currentRoute === 'history' ? 'active' : ''}" onclick="window.location.hash='#history'">
          <i class="fa-solid fa-clock-rotate-left"></i> Lịch sử nộp bài
        </div>
      `}

      <div style="margin-top:auto; padding-top:20px; border-top:1px solid var(--border-color);">
        <div class="nav-item" id="sidebar-logout-btn">
          <i class="fa-solid fa-arrow-right-from-bracket"></i> Đăng xuất
        </div>
      </div>
    </aside>
  `
}

export function bindSidebarEvents() {
  document.getElementById('sidebar-logout-btn')?.addEventListener('click', () => {
    logout()
  })
}
