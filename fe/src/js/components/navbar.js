import { state } from '../state.js'
import { showToast } from './toast.js'
import { api } from '../api.js'
import { isImpersonating } from '../utils/impersonate.js'

const escapeText = value => String(value ?? '').replace(/[&<>"']/g, char => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[char]))

async function switchToHocnvSession() {
  try {
    showToast('Đang mở phiên học sinh hocnv...', 'info')
    const res = await api.getStudents()
    const students = Array.isArray(res) ? res : (res?.items || res?.students || [])
    const target = students.find(s => (s.username || '').toLowerCase() === 'hocnv')
    if (!target) {
      showToast('Không tìm thấy học sinh có tài khoản hocnv!', 'error')
      return
    }
    const { startImpersonation } = await import('../utils/impersonate.js')
    startImpersonation(target.id, target.fullName || target.username)
  } catch (err) {
    showToast(`Không đổi được phiên: ${err.message}`, 'error')
  }
}

window.switchToHocnvSession = switchToHocnvSession

export function renderNavbar(breadcrumbText = 'Nền tảng / Bảng điều khiển') {
  const isGuest = !state.token
  const name = isGuest ? 'Khách trải nghiệm' : (state.user?.fullName || 'Quản trị hệ thống')
  const initials = isGuest ? 'KT' : name.split(' ').map(n => n[0]).join('').substring(0, 2).toUpperCase()
  const impersonating = !isGuest && isImpersonating()

  return `
    ${impersonating ? `
    <div style="display:flex; align-items:center; justify-content:space-between; gap:12px; background:#fffbeb; border:1px solid #fde68a; color:#92400e; font-size:13px; font-weight:600; padding:8px 16px; border-radius:0;">
       <span><i class="fa-solid fa-user-secret"></i> Đang xem với tư cách học sinh <strong>${escapeText(name)}</strong> <span style="color:#b45309;">(@${escapeText(state.user?.username)})</span> <span style="background:#16a34a; color:#fff; font-size:10px; padding:2px 8px; border-radius:6px;">ROLE: STUDENT</span> <span style="font-weight:400;">— mọi thao tác giống tài khoản thật.</span></span>
      <button onclick="window.stopImpersonation()" style="background:#b45309; color:#ffffff; border:none; border-radius:8px; padding:6px 14px; font-size:12px; font-weight:700; cursor:pointer; white-space:nowrap;">
        <i class="fa-solid fa-arrow-right-from-bracket"></i> Thoát về admin
      </button>
    </div>
    ` : ''}
    <header class="top-navbar" style="display:flex; align-items:center; justify-content:space-between;">
      <div style="display:flex; align-items:center; gap:16px;">
         <button id="sidebar-toggle-btn" type="button" aria-label="Mở menu điều hướng" aria-controls="app-sidebar" aria-expanded="false" style="background:none; border:none; font-size:18px; color:var(--text-muted); cursor:pointer; padding:6px; display:flex; align-items:center; justify-content:center; border-radius:8px; transition:all 0.15s;" title="Ẩn/Hiện sidebar">
           <i class="fa-solid fa-bars"></i>
         </button>
         <span class="navbar-breadcrumb" aria-label="Vị trí hiện tại" title="${escapeText(breadcrumbText)}">${escapeText(breadcrumbText)}</span>
      </div>
      <div class="top-navbar-right">
        ${isGuest ? `
          <button class="btn-primary" onclick="window.location.hash='#login'" style="padding:6px 14px; font-size:13px; font-weight:600; cursor:pointer;">
            <i class="fa-solid fa-arrow-right-to-bracket"></i> Đăng nhập
          </button>
        ` : `
          ${!impersonating && state.user?.role === 'ADMIN' ? `
          <button class="admin-impersonate-btn" onclick="window.switchToHocnvSession()" aria-label="Xem như học sinh" title="Đổi sang phiên học sinh hocnv" style="display:inline-flex; align-items:center; gap:6px; padding:6px 14px; font-size:13px; font-weight:700; cursor:pointer; background:#f5f3ff; border:1px solid #c4b5fd; color:#6d28d9; border-radius:8px; margin-right:10px;">
            <i class="fa-solid fa-user-secret" aria-hidden="true"></i><span>Xem như HS</span>
          </button>
          ` : ''}
          <div class="user-profile-chip" title="Hồ sơ người dùng">
             <span>${escapeText(name)}</span>
             <div class="user-avatar-circle" aria-hidden="true">${escapeText(initials)}</div>
          </div>
        `}
      </div>
    </header>
  `
}
