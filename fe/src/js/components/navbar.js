import { state } from '../state.js'

export function renderNavbar(breadcrumbText = 'Nền tảng / Bảng điều khiển') {
  const isGuest = !state.token
  const name = isGuest ? 'Khách trải nghiệm' : (state.user?.fullName || 'Quản trị hệ thống')
  const initials = isGuest ? 'KT' : name.split(' ').map(n => n[0]).join('').substring(0, 2).toUpperCase()

  return `
    <header class="top-navbar" style="display:flex; align-items:center; justify-content:space-between;">
      <div style="display:flex; align-items:center; gap:16px;">
        <button id="sidebar-toggle-btn" style="background:none; border:none; font-size:18px; color:var(--text-muted); cursor:pointer; padding:6px; display:flex; align-items:center; justify-content:center; border-radius:8px; transition:all 0.15s;" title="Ẩn/Hiện sidebar">
          <i class="fa-solid fa-bars"></i>
        </button>
        <div class="breadcrumb" style="margin:0;">${breadcrumbText}</div>
      </div>
      <div class="top-navbar-right">
        ${isGuest ? `
          <button class="btn-primary" onclick="window.location.hash='#login'" style="padding:6px 14px; font-size:13px; font-weight:600; cursor:pointer;">
            <i class="fa-solid fa-arrow-right-to-bracket"></i> Đăng nhập
          </button>
        ` : `
          <div class="search-box">
            <i class="fa-solid fa-magnifying-glass"></i>
            <input type="text" placeholder="Tìm kiếm hệ thống...">
          </div>
          <button class="notification-btn" title="Thông báo">
            <i class="fa-regular fa-bell"></i>
            <span class="notification-dot"></span>
          </button>
          <div class="user-profile-chip" title="Hồ sơ người dùng">
            <span>${name}</span>
            <div class="user-avatar-circle">${initials}</div>
          </div>
        `}
      </div>
    </header>
  `
}
