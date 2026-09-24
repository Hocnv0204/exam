import { renderSidebar, bindSidebarEvents } from '../components/sidebar.js'
import { renderNavbar } from '../components/navbar.js'
import { state } from '../state.js'
import { api } from '../api.js'
import { showToast } from '../components/toast.js'
import { openModal, closeModal } from '../components/modal.js'

// Module-level state for the active class view
let activeTab = 'students' // 'students' | 'attendance' | 'tuition' | 'homework' | 'settings'
let cachedKpiStats = null
let cachedDebtSummary = null
let cachedAttendanceHistory = null
let cachedHomeworks = null
let cachedClassStudents = []
let studentSearchQuery = ''
let studentStatusFilter = 'ALL' // 'ALL' | 'ACTIVE' | 'PAUSED'

export function renderClassDetailsView() {
  const hashUrl = window.location.hash.replace('#', '')
  const [_, queryString] = hashUrl.split('?')
  const params = new URLSearchParams(queryString || '')
  const classId = params.get('classId')

  const currentClass = state.classes.find(c => c.id === classId)
  if (!currentClass) {
    return `
      <div class="app-layout">
        ${renderSidebar('classes-admin')}
        <div class="main-content">
          ${renderNavbar('Nền tảng / Chi tiết lớp học')}
          <div class="content-body" style="padding: 24px;">
            <div class="card" style="text-align:center; padding:48px 24px; color:#ef4444; border-radius:16px;">
              <i class="fa-solid fa-triangle-exclamation" style="font-size:42px; margin-bottom:16px;"></i>
              <h2 style="font-size:20px; font-weight:700; margin-bottom:8px;">Không tìm thấy thông tin lớp học!</h2>
              <p style="color:#64748b; font-size:14px; margin-bottom:20px;">Lớp học có thể đã bị xóa hoặc đường dẫn không hợp lệ.</p>
              <a href="#classes-admin" class="btn-primary" style="display:inline-flex; align-items:center; gap:8px; width:auto; text-decoration:none; padding:10px 20px;">
                <i class="fa-solid fa-arrow-left"></i> Quay lại danh sách lớp
              </a>
            </div>
          </div>
        </div>
      </div>
    `
  }

  // Initial student filter from local state
  const classStudents = state.students.filter(s => s.classIds ? s.classIds.includes(classId) : (s.classId === classId))
  const shortId = currentClass.id ? `${currentClass.id.substring(0, 8)}...${currentClass.id.substring(currentClass.id.length - 4)}` : 'N/A'

  return `
    <div class="app-layout">
      ${renderSidebar('classes-admin')}
      <div class="main-content">
        ${renderNavbar('Nền tảng / Chi tiết lớp học')}
        <div class="content-body" style="padding: 24px; max-width: 1400px; margin: 0 auto;">
          
          <!-- Top Breadcrumb & Actions -->
          <div class="class-top-bar">
            <div class="class-top-breadcrumb">
              <a href="#classes-admin" style="color:#0066cc; text-decoration:none; font-weight:600; display:inline-flex; align-items:center; gap:6px;">
                <i class="fa-solid fa-arrow-left"></i> Danh sách lớp
              </a>
              <span>/</span>
              <span class="class-top-breadcrumb-title">${escapeHtml(currentClass.name)}</span>
              ${currentClass.is_archived ? `<span class="badge" style="background:#fee2e2; color:#b91c1c; font-size:11px;">Đã lưu trữ</span>` : ''}
            </div>
            <div class="class-top-actions">
              <button id="btn-edit-class-info" class="btn-secondary" style="padding:8px 16px; font-size:13px; font-weight:600; display:inline-flex; align-items:center; gap:6px; cursor:pointer; border-radius:10px;">
                <i class="fa-solid fa-pen-to-square" style="color:#0066cc;"></i> Sửa thông tin lớp
              </button>
              <a href="#classes-admin" class="btn-secondary" style="padding:8px 16px; font-size:13px; font-weight:600; text-decoration:none; display:inline-flex; align-items:center; gap:6px; border-radius:10px;">
                <i class="fa-solid fa-arrow-left"></i> Quay lại
              </a>
            </div>
          </div>

          <!-- Class Header Banner -->
          <div class="card class-banner-card">
            <div class="class-banner-container">
              <div class="class-banner-main">
                <div class="class-banner-icon">
                  <i class="fa-solid fa-graduation-cap"></i>
                </div>
                <div class="class-banner-details">
                  <div class="class-banner-title-row">
                    <h1 class="page-title class-title-heading">${escapeHtml(currentClass.name)}</h1>
                    <span class="badge badge-class-grade">
                      <i class="fa-solid fa-layer-group" style="font-size:11px;"></i> ${escapeHtml(currentClass.gradeBlock || '12-Toán')}
                    </span>
                  </div>
                  <div class="class-banner-meta">
                    <div class="class-id-pill" title="${currentClass.id}">
                      <span>ID: <strong>${shortId}</strong></span>
                      <button class="btn-copy-id" id="btn-copy-class-id" data-copy="${currentClass.id}" title="Sao chép toàn bộ ID">
                        <i class="fa-regular fa-copy"></i>
                      </button>
                    </div>
                    ${currentClass.description ? `<span class="class-banner-desc">${escapeHtml(currentClass.description)}</span>` : ''}
                  </div>
                </div>
              </div>
              <div class="class-banner-metrics">
                <div class="class-banner-metric-item">
                  <div class="class-metric-label">Học phí / Buổi</div>
                  <strong class="class-metric-value text-emerald">
                    ${(Number(currentClass.tuitionFee || 0)).toLocaleString('vi-VN')} <span class="class-metric-unit">VND</span>
                  </strong>
                </div>
                <div class="class-banner-metric-item has-divider">
                  <div class="class-metric-label">Sĩ số hiện tại</div>
                  <strong id="header-student-count" class="class-metric-value text-slate">
                    <i class="fa-solid fa-users" style="color:#0066cc; font-size:16px;"></i> ${classStudents.length} <span class="class-metric-unit">học sinh</span>
                  </strong>
                </div>
              </div>
            </div>
          </div>

          <!-- Dashboard Stats (5 KPI Cards) -->
          <div class="class-kpi-grid" id="class-kpi-container">
            <!-- Card 1: Tổng học sinh -->
            <div class="class-kpi-card">
              <div class="class-kpi-icon" style="background:#eff6ff; color:#0066cc;">
                <i class="fa-solid fa-users"></i>
              </div>
              <div class="class-kpi-content">
                <div class="class-kpi-title">Tổng học sinh</div>
                <div class="class-kpi-value" id="kpi-total-students">${classStudents.length}</div>
                <div class="class-kpi-subtitle" id="kpi-student-status-breakdown">
                  <span style="color:#15803d; font-weight:700;">${classStudents.length} đang học</span> / <span>0 tạm nghỉ</span>
                </div>
              </div>
            </div>

            <!-- Card 2: Chuyên cần 30 ngày -->
            <div class="class-kpi-card">
              <div class="class-kpi-icon" style="background:#f0fdf4; color:#16a34a;">
                <i class="fa-solid fa-calendar-check"></i>
              </div>
              <div class="class-kpi-content">
                <div class="class-kpi-title">Chuyên cần 30 ngày</div>
                <div class="class-kpi-value" id="kpi-attendance-rate" style="color:#16a34a;">--%</div>
                <div class="class-kpi-subtitle">Tỷ lệ có mặt các buổi gần nhất</div>
              </div>
            </div>

            <!-- Card 3: Học phí chưa thu -->
            <div class="class-kpi-card">
              <div class="class-kpi-icon" style="background:#fef3c7; color:#d97706;">
                <i class="fa-solid fa-hand-holding-dollar"></i>
              </div>
              <div class="class-kpi-content">
                <div class="class-kpi-title">Học phí chưa thu</div>
                <div class="class-kpi-value" id="kpi-unpaid-tuition" style="color:#b45309;">0 VND</div>
                <div class="class-kpi-subtitle" id="kpi-unpaid-students-count">0 học sinh còn nợ</div>
              </div>
            </div>

            <!-- Card 4: Bài tập đang mở -->
            <div class="class-kpi-card">
              <div class="class-kpi-icon" style="background:#f5f3ff; color:#7c3aed;">
                <i class="fa-solid fa-book-open-reader"></i>
              </div>
              <div class="class-kpi-content">
                <div class="class-kpi-title">Bài tập đang mở</div>
                <div class="class-kpi-value" id="kpi-open-homeworks">0</div>
                <div class="class-kpi-subtitle" id="kpi-pending-submissions">Đang tải...</div>
              </div>
            </div>

            <!-- Card 5: Buổi học gần nhất -->
            <div class="class-kpi-card">
              <div class="class-kpi-icon" style="background:#f0f9ff; color:#0284c7;">
                <i class="fa-solid fa-clock-rotate-left"></i>
              </div>
              <div class="class-kpi-content">
                <div class="class-kpi-title">Buổi học gần nhất</div>
                <div class="class-kpi-value" id="kpi-latest-session-date" style="font-size:16px;">Chưa có</div>
                <div class="class-kpi-subtitle" id="kpi-latest-session-present">Chưa điểm danh</div>
              </div>
            </div>
          </div>

          <!-- Navigation Tab Bar -->
          <div class="class-tabs-nav">
            <button class="class-tab-item ${activeTab === 'students' ? 'active' : ''}" data-tab="students">
              <i class="fa-solid fa-users"></i> Học sinh
              <span class="class-tab-badge" id="tab-badge-students">${classStudents.length}</span>
            </button>
            <button class="class-tab-item ${activeTab === 'attendance' ? 'active' : ''}" data-tab="attendance">
              <i class="fa-solid fa-clipboard-check"></i> Điểm danh
              <span class="class-tab-badge" id="tab-badge-attendance">0</span>
            </button>
            <button class="class-tab-item ${activeTab === 'tuition' ? 'active' : ''}" data-tab="tuition">
              <i class="fa-solid fa-money-bill-wave"></i> Học phí
              <span class="class-tab-badge" id="tab-badge-tuition" style="display:none;">0 nợ</span>
            </button>
            <button class="class-tab-item ${activeTab === 'homework' ? 'active' : ''}" data-tab="homework">
              <i class="fa-solid fa-file-pen"></i> Bài tập
              <span class="class-tab-badge" id="tab-badge-homework">0</span>
            </button>
            <button class="class-tab-item ${activeTab === 'settings' ? 'active' : ''}" data-tab="settings">
              <i class="fa-solid fa-gear"></i> Cài đặt
            </button>
          </div>

          <!-- Tab Content Container -->
          <div id="class-tab-content-container">
            ${renderActiveTabContent(currentClass, classStudents)}
          </div>

        </div>
      </div>
    </div>
  `
}

function renderActiveTabContent(currentClass, classStudents) {
  switch (activeTab) {
    case 'attendance':
      return renderAttendanceTabHTML(currentClass)
    case 'tuition':
      return renderTuitionTabHTML(currentClass)
    case 'homework':
      return renderHomeworkTabHTML(currentClass)
    case 'settings':
      return renderSettingsTabHTML(currentClass)
    case 'students':
    default:
      return renderStudentsTabHTML(currentClass, classStudents)
  }
}

// =========================================================
// TAB 1: HỌC SINH (STUDENTS)
// =========================================================
function renderStudentsTabHTML(currentClass, classStudents) {
  const studentsToRender = cachedClassStudents.length > 0 ? cachedClassStudents : classStudents

  // Filter students based on search and status
  const filtered = studentsToRender.filter(s => {
    const matchSearch = !studentSearchQuery || 
      (s.fullName && s.fullName.toLowerCase().includes(studentSearchQuery.toLowerCase())) ||
      (s.username && s.username.toLowerCase().includes(studentSearchQuery.toLowerCase())) ||
      (s.studentCode && s.studentCode.toLowerCase().includes(studentSearchQuery.toLowerCase()))
    
    const status = s.status || 'ACTIVE'
    const matchStatus = studentStatusFilter === 'ALL' || status === studentStatusFilter

    return matchSearch && matchStatus
  })

  return `
    <div class="card" style="padding:24px; border-radius:16px;">
      <!-- Toolbar -->
      <div class="class-tab-toolbar">
        <div class="class-toolbar-filters">
          <!-- Search input -->
          <div class="search-box" style="flex:1; min-width:220px; position:relative;">
            <i class="fa-solid fa-magnifying-glass" style="position:absolute; left:14px; top:12px; color:#94a3b8;"></i>
            <input type="text" id="tab-student-search-input" placeholder="Tìm theo tên, mã HS, tên đăng nhập..." value="${escapeHtml(studentSearchQuery)}" style="width:100%; padding:10px 14px 10px 38px; border:1px solid #cbd5e1; border-radius:10px; font-size:13px; outline:none; background:#ffffff;">
          </div>
          <!-- Status Filter -->
          <select id="tab-student-status-filter" class="class-filter-select">
            <option value="ALL" ${studentStatusFilter === 'ALL' ? 'selected' : ''}>Tất cả trạng thái</option>
            <option value="ACTIVE" ${studentStatusFilter === 'ACTIVE' ? 'selected' : ''}>Đang học</option>
            <option value="PAUSED" ${studentStatusFilter === 'PAUSED' ? 'selected' : ''}>Tạm nghỉ</option>
          </select>
        </div>
        <div class="class-toolbar-actions">
          <button id="btn-add-student-to-class" class="btn-primary" style="padding:10px 20px; font-size:13px; font-weight:700; width:auto; border-radius:10px; display:inline-flex; align-items:center; gap:8px;">
            <i class="fa-solid fa-user-plus"></i> Thêm học sinh vào lớp
          </button>
        </div>
      </div>

      <!-- Table -->
      <div class="table-responsive">
        <table class="data-table">
          <thead>
            <tr>
              <th>Học sinh</th>
              <th>Mã học sinh</th>
              <th>Trạng thái</th>
              <th>Chuyên cần</th>
              <th>Tiền còn nợ</th>
              <th style="text-align:center;">Thao tác</th>
            </tr>
          </thead>
          <tbody id="class-students-tbody">
            ${filtered.length === 0 ? `
              <tr>
                <td colspan="6" style="text-align:center; padding:48px 20px; color:#64748b;">
                  <i class="fa-solid fa-users-slash" style="font-size:36px; color:#cbd5e1; display:block; margin-bottom:12px;"></i>
                  ${studentSearchQuery || studentStatusFilter !== 'ALL' ? 'Không tìm thấy học sinh nào khớp với bộ lọc.' : 'Chưa có học sinh nào trong lớp này.'}
                </td>
              </tr>
            ` : filtered.map(s => {
              const initials = s.fullName ? s.fullName.split(' ').map(n => n[0]).join('').substring(0, 2).toUpperCase() : 'HS'
              const isActive = (s.status || 'ACTIVE') === 'ACTIVE'
              const attendanceRate = s.attendanceRate !== undefined ? s.attendanceRate : 100
              const unpaidDebt = s.unpaidDebt || 0
              
              return `
                <tr id="student-row-${s.id}">
                  <td>
                    <div class="student-info-cell">
                      <div class="avatar-circle" style="background:#eff6ff; color:#0066cc; font-weight:800;">${initials}</div>
                      <div>
                        <div style="font-weight:700; color:#0f172a;">${escapeHtml(s.fullName)}</div>
                        <div style="font-size:12px; color:#64748b;">${escapeHtml(s.username)}</div>
                      </div>
                    </div>
                  </td>
                  <td style="font-family:monospace; font-weight:600; color:#334155;">${escapeHtml(s.studentCode || 'N/A')}</td>
                  <td>
                    <button class="btn-toggle-student-status badge ${isActive ? 'badge-present' : 'badge-paused'}" data-student-id="${s.id}" data-current-status="${isActive ? 'ACTIVE' : 'PAUSED'}" title="Nhấn để đổi trạng thái" style="border:none; cursor:pointer;">
                      <i class="fa-solid fa-circle" style="font-size:6px;"></i> ${isActive ? 'Đang học' : 'Tạm nghỉ'}
                    </button>
                  </td>
                  <td>
                    <div style="display:flex; align-items:center; gap:8px;">
                      <div class="progress-bar-bg" style="width:70px; height:6px; background:#e2e8f0; border-radius:3px; overflow:hidden;">
                        <div class="progress-bar-fill" style="width:${attendanceRate}%; height:100%; background:${attendanceRate >= 80 ? '#10b981' : '#f59e0b'};"></div>
                      </div>
                      <span style="font-size:12px; font-weight:700; color:#334155;">${attendanceRate}%</span>
                    </div>
                    ${s.attendedSessions !== undefined ? `<div style="font-size:11px; color:#64748b; margin-top:3px; font-weight:500;"><i class="fa-regular fa-calendar-check" style="color:#0066cc;"></i> ${s.attendedSessions} buổi đã học</div>` : ''}
                  </td>
                  <td>
                    ${unpaidDebt > 0 ? `
                      <span class="badge badge-unpaid">
                        ${unpaidDebt.toLocaleString('vi-VN')} VND
                      </span>
                      ${s.unpaidSessions ? `<div style="font-size:11px; color:#b45309; margin-top:3px; font-weight:600;"><i class="fa-regular fa-clock"></i> ${s.unpaidSessions} buổi chưa đóng</div>` : ''}
                    ` : `
                      <span class="badge badge-paid">
                        0 VND (Đã đủ)
                      </span>
                    `}
                  </td>
                  <td style="text-align:center;">
                    <div style="display:inline-flex; align-items:center; gap:8px;">
                      <a href="#student-details?studentId=${s.id}&classId=${currentClass.id}" class="btn-secondary" title="Xem chi tiết học tập & lịch học" style="padding:6px 12px; font-size:12px; text-decoration:none; display:inline-flex; align-items:center; gap:6px; border-radius:8px;">
                        <i class="fa-solid fa-calendar-day" style="color:#0066cc;"></i> Chi tiết
                      </a>
                      <button class="btn-remove-from-class" data-student-id="${s.id}" data-student-name="${escapeHtml(s.fullName)}" title="Xóa khỏi lớp học" style="padding:6px 10px; font-size:12px; border-radius:8px; cursor:pointer; background:#fee2e2; border:1px solid #fecaca; color:#b91c1c; font-weight:600; display:inline-flex; align-items:center; gap:4px;">
                        <i class="fa-solid fa-user-minus"></i> Xóa
                      </button>
                    </div>
                  </td>
                </tr>
              `
            }).join('')}
          </tbody>
        </table>
      </div>
    </div>
  `
}

// =========================================================
// TAB 2: ĐIỂM DANH (ATTENDANCE)
// =========================================================
function renderAttendanceTabHTML(currentClass) {
  const history = cachedAttendanceHistory || []

  return `
    <div class="card" style="padding:24px; border-radius:16px;">
      <!-- Action Header -->
      <div class="class-tab-toolbar">
        <div>
          <h2 style="font-family:var(--font-heading); font-size:18px; font-weight:700; color:#0f172a; margin:0 0 4px 0;">
            <i class="fa-solid fa-clipboard-user" style="color:#0066cc;"></i> Quản lý Điểm danh
          </h2>
          <p style="font-size:13px; color:#64748b; margin:0;">
            Điểm danh học sinh từng buổi học. Mỗi học sinh có mặt sẽ tự động phát sinh học phí buổi đó.
          </p>
        </div>
        <div class="class-toolbar-actions">
          <button id="btn-open-attendance-modal" class="btn-primary" style="padding:10px 22px; font-size:14px; font-weight:700; width:auto; border-radius:10px; background:#10b981; border-color:#10b981; box-shadow:0 4px 12px rgba(16,185,129,0.25); display:inline-flex; align-items:center; gap:8px;">
            <i class="fa-solid fa-clipboard-check"></i> Điểm danh hôm nay
          </button>
        </div>
      </div>

      <!-- Attendance History Table -->
      <div class="table-responsive">
        <table class="data-table">
          <thead>
            <tr>
              <th>Ngày học</th>
              <th>Sĩ số có mặt</th>
              <th>Tỷ lệ chuyên cần</th>
              <th>Học phí phát sinh</th>
              <th>Ghi chú buổi học</th>
              <th style="text-align:center;">Thao tác</th>
            </tr>
          </thead>
          <tbody id="attendance-history-tbody">
            ${history.length === 0 ? `
              <tr>
                <td colspan="6" style="text-align:center; padding:48px 20px; color:#64748b;">
                  <i class="fa-solid fa-calendar-xmark" style="font-size:36px; color:#cbd5e1; display:block; margin-bottom:12px;"></i>
                  Lớp học này chưa có buổi điểm danh nào. Nhấn <strong>"Điểm danh hôm nay"</strong> để bắt đầu.
                </td>
              </tr>
            ` : history.map(h => {
              const [y, m, d] = (h.sessionDate || '').split('-')
              const formattedDate = d && m && y ? `${d}/${m}/${y}` : h.sessionDate
              const rate = h.attendanceRate !== undefined ? h.attendanceRate : (h.totalCount > 0 ? Math.round((h.presentCount / h.totalCount) * 100) : 0)
              
              return `
                <tr id="session-row-${h.id}">
                  <td>
                    <div style="font-weight:700; color:#0f172a; display:inline-flex; align-items:center; gap:8px;">
                      <i class="fa-regular fa-calendar" style="color:#0066cc;"></i> ${formattedDate}
                    </div>
                  </td>
                  <td>
                    <span class="badge ${h.presentCount > 0 ? 'badge-present' : 'badge-absent'}">
                      <i class="fa-solid fa-user-check" style="font-size:11px;"></i> ${h.presentCount}/${h.totalCount} học sinh
                    </span>
                  </td>
                  <td>
                    <div style="display:flex; align-items:center; gap:8px;">
                      <div class="progress-bar-bg" style="width:60px; height:6px; background:#e2e8f0; border-radius:3px; overflow:hidden;">
                        <div class="progress-bar-fill" style="width:${rate}%; height:100%; background:${rate >= 80 ? '#10b981' : '#f59e0b'};"></div>
                      </div>
                      <span style="font-size:12px; font-weight:700; color:#334155;">${rate}%</span>
                    </div>
                  </td>
                  <td>
                    <strong style="color:#10b981; font-size:13px;">
                      ${(Number(h.totalFee || (h.presentCount * (h.feePerSession || 0)))).toLocaleString('vi-VN')} VND
                    </strong>
                    <div style="font-size:11px; color:#64748b;">${(Number(h.feePerSession || 0)).toLocaleString('vi-VN')} đ/buổi</div>
                  </td>
                  <td style="max-width:240px; color:#64748b; font-size:13px;">
                    ${h.note ? escapeHtml(h.note) : '<span style="color:#cbd5e1; font-style:italic;">Không có ghi chú</span>'}
                  </td>
                  <td style="text-align:center;">
                    <div style="display:inline-flex; align-items:center; gap:8px;">
                      <button class="btn-edit-attendance btn-secondary" data-date="${h.sessionDate}" style="padding:6px 12px; font-size:12px; border-radius:8px; cursor:pointer; font-weight:600; display:inline-flex; align-items:center; gap:6px;">
                        <i class="fa-solid fa-pen-to-square" style="color:#0066cc;"></i> Xem / Sửa
                      </button>
                      <button class="btn-delete-attendance" data-session-id="${h.id}" data-class-id="${currentClass.id}" data-session-date="${h.sessionDate}" data-date="${formattedDate}" style="padding:6px 10px; font-size:12px; border-radius:8px; cursor:pointer; background:#fee2e2; border:1px solid #fecaca; color:#b91c1c; font-weight:600; display:inline-flex; align-items:center; gap:4px;">
                        <i class="fa-solid fa-trash"></i>
                      </button>
                    </div>
                  </td>
                </tr>
              `
            }).join('')}
          </tbody>
        </table>
      </div>
    </div>
  `
}

// =========================================================
// TAB 3: HỌC PHÍ (TUITION & CÔNG NỢ)
// =========================================================
function renderTuitionTabHTML(currentClass) {
  const debtList = cachedDebtSummary || []
  const totalDebt = debtList.reduce((sum, s) => sum + (s.unpaidDebt || 0), 0)
  const owingCount = debtList.filter(s => (s.unpaidDebt || 0) > 0).length

  return `
    <div style="display:flex; flex-direction:column; gap:24px;">
      <!-- Tuition Fee Configuration Card -->
      <div class="card class-tab-toolbar" style="padding:20px 24px; border-radius:16px; background:#ffffff; border:1px solid #e2e8f0; margin-bottom:0;">
        <div style="display:flex; align-items:center; gap:16px;">
          <div style="width:48px; height:48px; border-radius:12px; background:#f0fdf4; color:#16a34a; display:flex; align-items:center; justify-content:center; font-size:22px; flex-shrink:0;">
            <i class="fa-solid fa-money-bill-wave"></i>
          </div>
          <div>
            <div style="font-size:12px; font-weight:700; color:#64748b; text-transform:uppercase;">Học phí quy định của lớp</div>
            <div style="font-size:22px; font-weight:800; color:#0f172a; font-family:var(--font-heading);">
              ${(Number(currentClass.tuitionFee || 0)).toLocaleString('vi-VN')} <span style="font-size:14px; color:#64748b; font-weight:600;">VND / buổi</span>
            </div>
          </div>
        </div>
        <div class="class-toolbar-actions">
          <button id="btn-quick-edit-tuition" class="btn-secondary" style="padding:8px 16px; font-size:13px; font-weight:600; border-radius:10px; cursor:pointer; display:inline-flex; align-items:center; gap:6px;">
            <i class="fa-solid fa-pen"></i> Đổi mức học phí
          </button>
        </div>
      </div>

      <!-- Financial Summary Cards -->
      <div style="display:grid; grid-template-columns:repeat(auto-fit, minmax(220px, 1fr)); gap:16px;">
        <div class="card" style="margin:0; padding:18px 20px; border-radius:16px; border:1px solid #fed7aa; background:#fffbeb;">
          <div style="font-size:12px; font-weight:700; color:#b45309; text-transform:uppercase;">Tổng học phí chưa thu</div>
          <div style="font-size:24px; font-weight:800; color:#b45309; font-family:var(--font-heading); margin-top:4px;">
            ${totalDebt.toLocaleString('vi-VN')} VND
          </div>
          <div style="font-size:12px; color:#92400e; margin-top:4px;">${owingCount} học sinh đang còn nợ</div>
        </div>
      </div>

      <!-- Debt Table by Student -->
      <div class="card" style="padding:24px; border-radius:16px;">
        <div class="class-tab-toolbar">
          <h2 style="font-family:var(--font-heading); font-size:18px; font-weight:700; color:#0f172a; margin:0;">
            <i class="fa-solid fa-file-invoice-dollar" style="color:#0066cc;"></i> Bảng theo dõi công nợ học sinh
          </h2>
          <div class="class-toolbar-actions">
            ${owingCount > 0 ? `
              <button id="btn-collect-all-class-tuition" class="btn-primary" style="padding:8px 18px; font-size:13px; font-weight:700; border-radius:10px; width:auto; background:#10b981; border-color:#10b981; display:inline-flex; align-items:center; gap:6px;">
                <i class="fa-solid fa-check-double"></i> Đánh dấu thu tất cả nợ
              </button>
            ` : ''}
          </div>
        </div>

        <div class="table-responsive">
          <table class="data-table">
            <thead>
              <tr>
                <th>Học sinh</th>
                <th>Số buổi có mặt</th>
                <th>Đã đóng</th>
                <th>Chưa đóng</th>
                <th>Tổng học phí đã đóng</th>
                <th>Trạng thái</th>
                <th style="text-align:center;">Thao tác</th>
              </tr>
            </thead>
            <tbody id="tuition-debt-tbody">
              ${debtList.length === 0 ? `
                <tr>
                  <td colspan="7" style="text-align:center; padding:48px 20px; color:#64748b;">
                    <i class="fa-solid fa-receipt" style="font-size:36px; color:#cbd5e1; display:block; margin-bottom:12px;"></i>
                    Chưa có dữ liệu học phí hoặc điểm danh cho lớp học này.
                  </td>
                </tr>
              ` : debtList.map(s => {
                const initials = s.fullName ? s.fullName.split(' ').map(n => n[0]).join('').substring(0, 2).toUpperCase() : 'HS'
                const hasDebt = (s.unpaidDebt || 0) > 0
                const paidMoney = s.paidAmount !== undefined ? s.paidAmount : ((s.paidSessions || 0) * (Number(currentClass.tuitionFee) || 0))

                return `
                  <tr id="debt-row-${s.studentId}">
                    <td>
                      <div class="student-info-cell">
                        <div class="avatar-circle" style="background:#eff6ff; color:#0066cc; font-weight:800;">${initials}</div>
                        <div>
                          <div style="font-weight:700; color:#0f172a;">${escapeHtml(s.fullName)}</div>
                          <div style="font-size:12px; color:#64748b;">${escapeHtml(s.username)}</div>
                        </div>
                      </div>
                    </td>
                    <td style="font-weight:600; color:#0f172a;">${s.attendedSessions || 0} buổi</td>
                    <td>
                      <span class="badge badge-paid">
                        ${s.paidSessions || 0} buổi
                      </span>
                    </td>
                    <td>
                      ${(s.unpaidSessions || 0) > 0 ? `
                        <span class="badge badge-unpaid">
                          ${s.unpaidSessions} buổi
                        </span>
                      ` : `
                        <span class="badge badge-paid">0 buổi</span>
                      `}
                    </td>
                    <td>
                      <strong style="color:#15803d; font-size:14px; font-family:var(--font-heading);">
                        ${paidMoney.toLocaleString('vi-VN')} VND
                      </strong>
                    </td>
                    <td>
                      ${hasDebt ? `
                        <span class="badge badge-unpaid">
                          <i class="fa-solid fa-clock" style="font-size:9px;"></i> Còn nợ ${(s.unpaidDebt || 0).toLocaleString('vi-VN')} đ
                        </span>
                      ` : `
                        <span class="badge badge-paid">
                          <i class="fa-solid fa-check" style="font-size:10px;"></i> Đã đóng đủ
                        </span>
                      `}
                    </td>
                    <td style="text-align:center;">
                      <div style="display:inline-flex; align-items:center; gap:8px;">
                        ${hasDebt ? `
                          <button class="btn-collect-student-tuition btn-primary" data-student-id="${s.studentId}" data-student-name="${escapeHtml(s.fullName)}" data-debt="${s.unpaidDebt}" style="padding:6px 12px; font-size:12px; border-radius:8px; cursor:pointer; width:auto; background:#10b981; border-color:#10b981; display:inline-flex; align-items:center; gap:4px; font-weight:600;">
                            <i class="fa-solid fa-check"></i> Thu nợ
                          </button>
                        ` : ''}
                        <button class="btn-view-student-sessions btn-secondary" data-student-id="${s.studentId}" data-student-name="${escapeHtml(s.fullName)}" style="padding:6px 12px; font-size:12px; border-radius:8px; cursor:pointer; font-weight:600; display:inline-flex; align-items:center; gap:4px;">
                          <i class="fa-solid fa-list-check"></i> Xem buổi
                        </button>
                        <a href="#student-details?studentId=${s.studentId}&classId=${currentClass.id}" class="btn-secondary" title="Mở lịch học cá nhân của học sinh" style="padding:6px 10px; font-size:12px; border-radius:8px; text-decoration:none; display:inline-flex; align-items:center; gap:4px; font-weight:600;">
                          <i class="fa-regular fa-calendar-check" style="color:#0066cc;"></i> Lịch học
                        </a>
                      </div>
                    </td>
                  </tr>
                `
              }).join('')}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  `
}

// =========================================================
// TAB 4: BÀI TẬP (HOMEWORKS & ASSIGNMENTS)
// =========================================================
function renderHomeworkTabHTML(currentClass) {
  const homeworks = cachedHomeworks || []

  return `
    <div class="card" style="padding:24px; border-radius:16px;">
      <div class="class-tab-toolbar">
        <div>
          <h2 style="font-family:var(--font-heading); font-size:18px; font-weight:700; color:#0f172a; margin:0 0 4px 0;">
            <i class="fa-solid fa-book-open" style="color:#0066cc;"></i> Danh sách Bài tập & Bài thi
          </h2>
          <p style="font-size:13px; color:#64748b; margin:0;">
            Các bài tập, bài thi trắc nghiệm và tự luận được phân bổ cho lớp học này.
          </p>
        </div>
        <div class="class-toolbar-actions">
          <a href="#create-homework" class="btn-primary" style="padding:10px 20px; font-size:13px; font-weight:700; border-radius:10px; width:auto; text-decoration:none; display:inline-flex; align-items:center; gap:8px;">
            <i class="fa-solid fa-plus"></i> Tạo bài tập mới
          </a>
        </div>
      </div>

      <div class="table-responsive">
        <table class="data-table">
          <thead>
            <tr>
              <th>Tiêu đề bài tập</th>
              <th>Loại bài</th>
              <th>Chương & Bài học</th>
              <th>Hạn nộp</th>
              <th>Trạng thái</th>
              <th style="text-align:center;">Thao tác</th>
            </tr>
          </thead>
          <tbody id="class-homeworks-tbody">
            ${homeworks.length === 0 ? `
              <tr>
                <td colspan="6" style="text-align:center; padding:48px 20px; color:#64748b;">
                  <i class="fa-solid fa-folder-open" style="font-size:36px; color:#cbd5e1; display:block; margin-bottom:12px;"></i>
                  Lớp học này chưa có bài tập nào. Hãy tạo bài tập mới để giao cho học sinh.
                </td>
              </tr>
            ` : homeworks.map(hw => {
              const isExam = hw.type === 'EXAM'
              const now = new Date().toISOString()
              const isOverdue = hw.deadline && hw.deadline < now

              return `
                <tr>
                  <td>
                    <div style="font-weight:700; color:#0f172a;">${escapeHtml(hw.title)}</div>
                    <div style="font-size:12px; color:#64748b;">Thời lượng: ${hw.durationMinutes || 45} phút | Điểm tối đa: ${hw.maxScore || 10}</div>
                  </td>
                  <td>
                    <span class="badge" style="background:${isExam ? '#fef2f2' : '#f0fdf4'}; color:${isExam ? '#b91c1c' : '#15803d'}; border:1px solid ${isExam ? '#fecaca' : '#bbf7d0'};">
                      ${isExam ? '<i class="fa-solid fa-stopwatch"></i> Bài thi' : '<i class="fa-solid fa-feather-pointed"></i> Luyện tập'}
                    </span>
                  </td>
                  <td style="color:#64748b; font-size:13px;">
                    <div><strong>${escapeHtml(hw.chapterTitle || 'Chương')}</strong></div>
                    <div>${escapeHtml(hw.lessonTitle || 'Bài học')}</div>
                  </td>
                  <td>
                    ${hw.deadline ? `
                      <span class="badge ${isOverdue ? 'badge-absent' : 'badge-unpaid'}">
                        <i class="fa-regular fa-clock"></i> ${new Date(hw.deadline).toLocaleString('vi-VN')}
                      </span>
                    ` : '<span style="color:#94a3b8; font-size:12px;">Không có hạn</span>'}
                  </td>
                  <td>
                    <span class="badge ${hw.isPublished ? 'badge-paid' : 'badge-absent'}">
                      <i class="fa-solid fa-circle" style="font-size:6px;"></i> ${hw.isPublished ? 'Đang mở' : 'Bản nháp'}
                    </span>
                  </td>
                  <td style="text-align:center;">
                    <div style="display:inline-flex; align-items:center; gap:8px;">
                      <a href="#admin-history?classId=${currentClass.id}&homeworkId=${hw.id}&tab=unsubmitted" class="btn-primary" style="padding:6px 12px; font-size:12px; text-decoration:none; display:inline-flex; align-items:center; gap:6px; border-radius:8px; width:auto;">
                        <i class="fa-solid fa-square-poll-vertical"></i> Kết quả
                      </a>
                    </div>
                  </td>
                </tr>
              `
            }).join('')}
          </tbody>
        </table>
      </div>
    </div>
  `
}

// =========================================================
// TAB 5: CÀI ĐẶT (SETTINGS)
// =========================================================
function renderSettingsTabHTML(currentClass) {
  return `
    <div style="display:flex; flex-direction:column; gap:24px;">
      <!-- Class Basic Settings Card -->
      <div class="card" style="padding:24px; border-radius:16px;">
        <h2 style="font-family:var(--font-heading); font-size:18px; font-weight:700; color:#0f172a; margin:0 0 16px 0; display:flex; align-items:center; gap:8px;">
          <i class="fa-solid fa-sliders" style="color:#0066cc;"></i> Cấu hình thông tin lớp học
        </h2>
        <form id="form-update-class-settings" onsubmit="return false;" style="display:flex; flex-direction:column; gap:16px; max-width:600px;">
          <div>
            <label style="font-size:13px; font-weight:600; color:#334155; display:block; margin-bottom:6px;">Tên lớp học</label>
            <input type="text" id="setting-class-name" class="form-input" value="${escapeHtml(currentClass.name)}" required>
          </div>
          <div>
            <label style="font-size:13px; font-weight:600; color:#334155; display:block; margin-bottom:6px;">Học phí (VND/Buổi)</label>
            <input type="number" id="setting-class-tuition" class="form-input" min="0" value="${Number(currentClass.tuitionFee || 0)}" required>
          </div>
          <div>
            <label style="font-size:13px; font-weight:600; color:#334155; display:block; margin-bottom:6px;">Mô tả ngắn</label>
            <textarea id="setting-class-description" class="form-input" rows="3" style="resize:vertical;">${escapeHtml(currentClass.description || '')}</textarea>
          </div>
          <div>
            <button type="submit" id="btn-save-class-settings" class="btn-primary" style="padding:10px 24px; font-size:14px; font-weight:700; width:auto; border-radius:10px;">
              <i class="fa-solid fa-floppy-disk"></i> Lưu thay đổi
            </button>
          </div>
        </form>
      </div>

      <!-- Telegram Bot Config Card -->
      <div class="card" id="telegram-config-card" style="padding:24px; border-radius:16px;">
        <h2 style="font-family:var(--font-heading); font-size:18px; font-weight:700; color:#0f172a; margin:0 0 16px 0; display:flex; align-items:center; gap:8px;">
          <i class="fa-brands fa-telegram" style="color:#0088cc;"></i> Cấu hình Bot Telegram
        </h2>
        <div id="telegram-config-body">
          <div style="color:#64748b;">Đang tải cấu hình Telegram...</div>
        </div>
      </div>

      <!-- Danger Zone Card -->
      <div class="card" style="padding:24px; border-radius:16px; border:1px solid #fee2e2; background:#fffafa;">
        <h2 style="font-family:var(--font-heading); font-size:18px; font-weight:700; color:#b91c1c; margin:0 0 8px 0; display:flex; align-items:center; gap:8px;">
          <i class="fa-solid fa-triangle-exclamation"></i> Vùng nguy hiểm (Danger Zone)
        </h2>
        <p style="font-size:13px; color:#64748b; margin:0 0 16px 0;">
          Các thao tác này ảnh hưởng trực tiếp tới dữ liệu lớp học, hãy cẩn trọng khi thực hiện.
        </p>
        <div style="display:flex; gap:12px; flex-wrap:wrap;">
          <button id="btn-archive-class" class="btn-secondary" style="padding:10px 18px; font-size:13px; font-weight:600; border-radius:10px; cursor:pointer;">
            <i class="fa-solid fa-box-archive"></i> ${currentClass.is_archived ? 'Hủy lưu trữ lớp' : 'Lưu trữ lớp học'}
          </button>
          <button id="btn-delete-class-permanent" style="padding:10px 18px; font-size:13px; font-weight:600; border-radius:10px; cursor:pointer; background:#ef4444; border:none; color:#ffffff;">
            <i class="fa-solid fa-trash"></i> Xóa vĩnh viễn lớp học
          </button>
        </div>
      </div>
    </div>
  `
}

// =========================================================
// EVENT BINDINGS & CONTROLLERS
// =========================================================
export function bindClassDetailsEvents() {
  bindSidebarEvents()

  const hashUrl = window.location.hash.replace('#', '')
  const [_, queryString] = hashUrl.split('?')
  const params = new URLSearchParams(queryString || '')
  const classId = params.get('classId')
  if (!classId) return

  const currentClass = state.classes.find(c => c.id === classId)
  if (!currentClass) return

  // 1. Copy Class ID
  const copyBtn = document.getElementById('btn-copy-class-id')
  if (copyBtn) {
    copyBtn.onclick = () => {
      const text = copyBtn.getAttribute('data-copy') || ''
      navigator.clipboard.writeText(text).then(() => {
        showToast('Đã sao chép mã ID lớp học', 'success')
      }).catch(() => {
        showToast('Sao chép thất bại', 'error')
      })
    }
  }

  // 2. Edit class header quick button
  const editHeaderBtn = document.getElementById('btn-edit-class-info')
  if (editHeaderBtn) {
    editHeaderBtn.onclick = () => showEditClassModal(currentClass)
  }

  // 3. Tab switching buttons
  document.querySelectorAll('.class-tab-item').forEach(btn => {
    btn.onclick = () => {
      const targetTab = btn.getAttribute('data-tab')
      if (!targetTab || targetTab === activeTab) return

      activeTab = targetTab
      document.querySelectorAll('.class-tab-item').forEach(b => b.classList.remove('active'))
      btn.classList.add('active')

      const container = document.getElementById('class-tab-content-container')
      if (container) {
        container.innerHTML = renderActiveTabContent(currentClass, state.students.filter(s => s.classIds ? s.classIds.includes(classId) : (s.classId === classId)))
        bindActiveTabEvents(classId, currentClass)
      }
    }
  })

  // 4. Fetch dynamic background KPI data & Tab events
  fetchClassKpiAndTabData(classId, currentClass)
  bindActiveTabEvents(classId, currentClass)
}

function bindActiveTabEvents(classId, currentClass) {
  // Bind events according to active tab
  if (activeTab === 'students') {
    bindStudentsTabEvents(classId, currentClass)
  } else if (activeTab === 'attendance') {
    bindAttendanceTabEvents(classId, currentClass)
  } else if (activeTab === 'tuition') {
    bindTuitionTabEvents(classId, currentClass)
  } else if (activeTab === 'homework') {
    // homework links are hash-based
  } else if (activeTab === 'settings') {
    bindSettingsTabEvents(classId, currentClass)
  }
}

// ---------------------------------------------------------
// ASYNC DATA FETCHING FOR CLASS KPI & TAB BADGES
// ---------------------------------------------------------
async function fetchClassKpiAndTabData(classId, currentClass) {
  try {
    // 1. Fetch KPI Stats
    api.getClassKpiStats(classId).then(kpi => {
      cachedKpiStats = kpi
      updateKpiUI(kpi)
    }).catch(err => console.warn('Failed to load KPI stats:', err))

    // 2. Fetch Attendance History
    api.getAttendanceHistory(classId).then(history => {
      cachedAttendanceHistory = history
      const tabBadgeAtt = document.getElementById('tab-badge-attendance')
      if (tabBadgeAtt) tabBadgeAtt.textContent = (history || []).length

      if (activeTab === 'attendance') {
        const container = document.getElementById('class-tab-content-container')
        if (container) {
          container.innerHTML = renderAttendanceTabHTML(currentClass)
          bindAttendanceTabEvents(classId, currentClass)
        }
      }
    }).catch(err => console.warn('Failed to load attendance history:', err))

    // 3. Fetch Debt Summary
    api.getClassDebtSummary(classId).then(debtList => {
      cachedDebtSummary = debtList
      const list = debtList || []
      const totalDebt = list.reduce((sum, s) => sum + (s.unpaidDebt || 0), 0)
      const owingCount = list.filter(s => (s.unpaidDebt || 0) > 0).length
      
      // Ensure KPI card 3 stays perfectly in sync with the debt summary list
      const unpaidEl = document.getElementById('kpi-unpaid-tuition')
      const unpaidCountEl = document.getElementById('kpi-unpaid-students-count')
      if (unpaidEl) unpaidEl.textContent = `${totalDebt.toLocaleString('vi-VN')} VND`
      if (unpaidCountEl) unpaidCountEl.textContent = `${owingCount} học sinh còn nợ`

      const tabBadgeTui = document.getElementById('tab-badge-tuition')
      if (tabBadgeTui) {
        if (owingCount > 0) {
          tabBadgeTui.textContent = `${owingCount} nợ`
          tabBadgeTui.style.display = 'inline-block'
          tabBadgeTui.style.background = '#fef3c7'
          tabBadgeTui.style.color = '#b45309'
        } else {
          tabBadgeTui.style.display = 'none'
        }
      }

      // Sync debt into cached student list
      if (debtList && debtList.length > 0) {
        cachedClassStudents = debtList.map(d => ({
          id: d.studentId,
          fullName: d.fullName,
          username: d.username,
          studentCode: d.studentCode,
          status: d.status,
          attendanceRate: d.attendanceRate,
          unpaidDebt: d.unpaidDebt,
          attendedSessions: d.attendedSessions,
          totalSessions: d.totalSessions,
          unpaidSessions: d.unpaidSessions
        }))
      }

      if (activeTab === 'tuition' || activeTab === 'students') {
        const container = document.getElementById('class-tab-content-container')
        if (container) {
          container.innerHTML = renderActiveTabContent(currentClass, cachedClassStudents)
          bindActiveTabEvents(classId, currentClass)
        }
      }
    }).catch(err => console.warn('Failed to load debt summary:', err))

    // 4. Fetch Homeworks for class
    api.getHomeworks('', classId).then(hws => {
      cachedHomeworks = Array.isArray(hws) ? hws : (hws?.items || [])
      const tabBadgeHw = document.getElementById('tab-badge-homework')
      if (tabBadgeHw) tabBadgeHw.textContent = cachedHomeworks.length

      if (activeTab === 'homework') {
        const container = document.getElementById('class-tab-content-container')
        if (container) {
          container.innerHTML = renderHomeworkTabHTML(currentClass)
        }
      }
    }).catch(err => console.warn('Failed to load homeworks:', err))

  } catch (e) {
    console.error('Error fetching class details data:', e)
  }
}

function updateKpiUI(kpi) {
  if (!kpi) return

  // KPI 1: Students
  const totalEl = document.getElementById('kpi-total-students')
  const breakdownEl = document.getElementById('kpi-student-status-breakdown')
  if (totalEl) totalEl.textContent = kpi.totalStudents?.total ?? 0
  if (breakdownEl) {
    breakdownEl.innerHTML = `
      <span style="color:#15803d; font-weight:700;">${kpi.totalStudents?.active ?? 0} đang học</span> / 
      <span style="color:#b45309; font-weight:600;">${kpi.totalStudents?.paused ?? 0} tạm nghỉ</span>
    `
  }

  // KPI 2: Attendance Rate
  const attRateEl = document.getElementById('kpi-attendance-rate')
  if (attRateEl) {
    const rate = kpi.attendanceRate30Days !== undefined ? kpi.attendanceRate30Days : 100
    attRateEl.textContent = `${rate}%`
    attRateEl.style.color = rate >= 80 ? '#16a34a' : '#d97706'
  }

  // KPI 3: Unpaid Tuition
  const unpaidEl = document.getElementById('kpi-unpaid-tuition')
  const unpaidCountEl = document.getElementById('kpi-unpaid-students-count')
  if (unpaidEl) {
    const amount = kpi.uncollectedTuition?.totalAmount ?? 0
    unpaidEl.textContent = `${amount.toLocaleString('vi-VN')} VND`
  }
  if (unpaidCountEl) {
    unpaidCountEl.textContent = `${kpi.uncollectedTuition?.owingStudentsCount ?? 0} học sinh còn nợ`
  }

  // KPI 4: Homeworks
  const hwOpenEl = document.getElementById('kpi-open-homeworks')
  const hwPendingEl = document.getElementById('kpi-pending-submissions')
  if (hwOpenEl) hwOpenEl.textContent = kpi.homeworks?.openCount ?? 0
  if (hwPendingEl) {
    hwPendingEl.textContent = `${kpi.homeworks?.pendingSubmissionsCount ?? 0} bài tập chưa nộp`
  }

  // KPI 5: Latest Session
  const sessDateEl = document.getElementById('kpi-latest-session-date')
  const sessPresentEl = document.getElementById('kpi-latest-session-present')
  if (sessDateEl && kpi.latestSession) {
    const [y, m, d] = (kpi.latestSession.sessionDate || '').split('-')
    sessDateEl.textContent = d && m && y ? `${d}/${m}/${y}` : kpi.latestSession.sessionDate
  }
  if (sessPresentEl && kpi.latestSession) {
    sessPresentEl.innerHTML = `<span style="color:#15803d; font-weight:700;">${kpi.latestSession.presentCount}/${kpi.latestSession.totalCount} có mặt</span>`
  }
}

// ---------------------------------------------------------
// TAB 1 BINDINGS: HỌC SINH
// ---------------------------------------------------------
function bindStudentsTabEvents(classId, currentClass) {
  // Search input
  const searchInput = document.getElementById('tab-student-search-input')
  if (searchInput) {
    searchInput.oninput = () => {
      studentSearchQuery = searchInput.value.trim()
      refreshStudentsTable(currentClass)
    }
  }

  // Status Filter
  const statusFilter = document.getElementById('tab-student-status-filter')
  if (statusFilter) {
    statusFilter.onchange = () => {
      studentStatusFilter = statusFilter.value
      refreshStudentsTable(currentClass)
    }
  }

  // Add student to class modal
  const addStudentBtn = document.getElementById('btn-add-student-to-class')
  if (addStudentBtn) {
    addStudentBtn.onclick = () => showAddStudentModal(classId, currentClass)
  }

  // Toggle student status (ACTIVE <-> PAUSED)
  document.querySelectorAll('.btn-toggle-student-status').forEach(btn => {
    btn.onclick = async () => {
      const studentId = btn.getAttribute('data-student-id')
      const currentStatus = btn.getAttribute('data-current-status')
      const nextStatus = currentStatus === 'ACTIVE' ? 'PAUSED' : 'ACTIVE'
      const label = nextStatus === 'ACTIVE' ? 'Đang học' : 'Tạm nghỉ'

      showToast(`Đang chuyển trạng thái sang "${label}"...`, 'info')
      try {
        await api.updateStudentClassStatus(classId, studentId, nextStatus)
        showToast(`Đã chuyển học sinh sang trạng thái ${label}`, 'success')

        // Update local state
        const target = cachedClassStudents.find(s => s.id === studentId || s.studentId === studentId)
        if (target) target.status = nextStatus

        refreshStudentsTable(currentClass)
        // Refresh KPI
        api.getClassKpiStats(classId).then(updateKpiUI)
      } catch (err) {
        showToast(`Cập nhật thất bại: ${err.message}`, 'error')
      }
    }
  })

  // Remove student from class
  document.querySelectorAll('.btn-remove-from-class').forEach(btn => {
    btn.onclick = async () => {
      const studentId = btn.getAttribute('data-student-id')
      const studentName = btn.getAttribute('data-student-name')

      if (confirm(`Bạn có chắc chắn muốn xóa học sinh "${studentName}" ra khỏi lớp học này?`)) {
        try {
          showToast('Đang xóa học sinh khỏi lớp...', 'info')
          await api.removeStudentFromClass(classId, studentId)

          // Update local state
          cachedClassStudents = cachedClassStudents.filter(s => s.id !== studentId && s.studentId !== studentId)
          const stdObj = state.students.find(s => s.id === studentId)
          if (stdObj) {
            const currentClassIds = stdObj.classIds || (stdObj.classId ? [stdObj.classId] : [])
            stdObj.classIds = currentClassIds.filter(id => id !== classId)
            stdObj.classId = stdObj.classIds[0] || null
          }

          showToast(`Đã xóa học sinh "${studentName}" khỏi lớp`, 'success')
          refreshStudentsTable(currentClass)
          api.getClassKpiStats(classId).then(updateKpiUI)
        } catch (e) {
          showToast(`Xóa thất bại: ${e.message}`, 'error')
        }
      }
    }
  })
}

function refreshStudentsTable(currentClass) {
  const container = document.getElementById('class-tab-content-container')
  if (container && activeTab === 'students') {
    container.innerHTML = renderStudentsTabHTML(currentClass, cachedClassStudents)
    bindStudentsTabEvents(currentClass.id, currentClass)
  }
}

// Modal: Thêm học sinh vào lớp
function showAddStudentModal(classId, currentClass) {
  // Find students in system who are NOT yet enrolled in this class
  const enrolledIds = new Set(cachedClassStudents.map(s => s.id || s.studentId))
  const candidateStudents = state.students.filter(s => !enrolledIds.has(s.id))

  const bodyHTML = `
    <div style="display:flex; flex-direction:column; gap:16px;">
      <p style="margin:0; font-size:13px; color:#64748b;">
        Chọn học sinh để thêm vào lớp <strong>${escapeHtml(currentClass.name)}</strong>:
      </p>
      
      <div class="search-box" style="position:relative;">
        <i class="fa-solid fa-magnifying-glass" style="position:absolute; left:14px; top:12px; color:#94a3b8;"></i>
        <input type="text" id="modal-search-candidate-input" placeholder="Tìm theo tên hoặc tên đăng nhập..." style="width:100%; padding:10px 14px 10px 38px; border:1px solid #cbd5e1; border-radius:10px; font-size:13px; outline:none; background:#ffffff;">
      </div>

      <div id="modal-candidate-list" style="max-height:300px; overflow-y:auto; border:1px solid #e2e8f0; border-radius:10px; padding:8px;">
        ${candidateStudents.length === 0 ? `
          <div style="text-align:center; padding:24px; color:#94a3b8; font-size:13px;">
            Tất cả học sinh hiện tại đã có trong lớp hoặc hệ thống chưa có học sinh khác.
          </div>
        ` : candidateStudents.map(s => `
          <label class="modal-candidate-item" style="display:flex; align-items:center; gap:12px; padding:10px 12px; border-radius:8px; cursor:pointer; transition:background 0.15s; margin-bottom:4px;">
            <input type="checkbox" name="candidate-student-cb" value="${s.id}" style="width:18px; height:18px; accent-color:#0066cc;">
            <div style="flex:1;">
              <div style="font-weight:700; color:#0f172a; font-size:14px;">${escapeHtml(s.fullName)}</div>
              <div style="font-size:12px; color:#64748b;">${escapeHtml(s.username)}</div>
            </div>
          </label>
        `).join('')}
      </div>
    </div>
  `

  openModal('Thêm Học Sinh Vào Lớp', bodyHTML, async () => {
    const selectedCheckboxes = document.querySelectorAll('input[name="candidate-student-cb"]:checked')
    const selectedIds = Array.from(selectedCheckboxes).map(cb => cb.value)

    if (selectedIds.length === 0) {
      showToast('Vui lòng chọn ít nhất một học sinh!', 'error')
      return false
    }

    showToast(`Đang thêm ${selectedIds.length} học sinh vào lớp...`, 'info')
    try {
      for (const sId of selectedIds) {
        await api.addStudentToClass(classId, sId)
        
        // Add to local state
        const studentObj = state.students.find(s => s.id === sId)
        if (studentObj) {
          studentObj.classIds = studentObj.classIds || []
          if (!studentObj.classIds.includes(classId)) {
            studentObj.classIds.push(classId)
          }
          studentObj.classId = classId

          cachedClassStudents.push({
            id: studentObj.id,
            studentId: studentObj.id,
            fullName: studentObj.fullName,
            username: studentObj.username,
            studentCode: studentObj.studentCode || 'N/A',
            status: 'ACTIVE',
            attendanceRate: 100,
            unpaidDebt: 0
          })
        }
      }

      showToast(`Đã thêm thành công ${selectedIds.length} học sinh vào lớp`, 'success')
      refreshStudentsTable(currentClass)
      api.getClassKpiStats(classId).then(updateKpiUI)
      return true
    } catch (err) {
      showToast(`Thêm thất bại: ${err.message}`, 'error')
      return false
    }
  })

  // Candidate search filtering
  setTimeout(() => {
    const searchInput = document.getElementById('modal-search-candidate-input')
    const listEl = document.getElementById('modal-candidate-list')
    if (searchInput && listEl) {
      searchInput.oninput = () => {
        const query = searchInput.value.toLowerCase().trim()
        listEl.querySelectorAll('.modal-candidate-item').forEach(item => {
          const text = item.textContent.toLowerCase()
          item.style.display = text.includes(query) ? 'flex' : 'none'
        })
      }
    }
  }, 100)
}

// ---------------------------------------------------------
// TAB 2 BINDINGS: ĐIỂM DANH (ATTENDANCE ENGINE)
// ---------------------------------------------------------
function bindAttendanceTabEvents(classId, currentClass) {
  // Nút Điểm danh hôm nay
  const openModalBtn = document.getElementById('btn-open-attendance-modal')
  if (openModalBtn) {
    const today = new Date().toISOString().split('T')[0]
    openModalBtn.onclick = () => showAttendanceModal(classId, currentClass, today)
  }

  // Nút Xem / Sửa buổi điểm danh
  document.querySelectorAll('.btn-edit-attendance').forEach(btn => {
    btn.onclick = () => {
      const date = btn.getAttribute('data-date')
      if (date) showAttendanceModal(classId, currentClass, date)
    }
  })

  // Nút Xóa buổi điểm danh
  document.querySelectorAll('.btn-delete-attendance').forEach(btn => {
    btn.onclick = async () => {
      const sessionId = btn.getAttribute('data-session-id')
      const classIdAttr = btn.getAttribute('data-class-id') || classId
      const sessionDate = btn.getAttribute('data-session-date')
      const date = btn.getAttribute('data-date')
      if (!confirm(`Bạn có chắc chắn muốn xóa buổi điểm danh ngày ${date}? Toàn bộ dữ liệu điểm danh và khoản phí liên quan sẽ được gỡ bỏ.`)) return

      showToast('Đang xóa buổi điểm danh...', 'info')
      try {
        await api.deleteAttendanceSession(sessionId, classIdAttr, sessionDate)
        showToast('Đã xóa buổi điểm danh', 'success')

        // Reload data
        fetchClassKpiAndTabData(classId, currentClass)
      } catch (err) {
        showToast(`Xóa thất bại: ${err.message}`, 'error')
      }
    }
  })
}

// MODAL ĐIỂM DANH CHUẨN ĐẶC TẢ
async function showAttendanceModal(classId, currentClass, initialDate) {
  const today = new Date().toISOString().split('T')[0]
  const targetDate = initialDate || today

  // Load existing session for this date
  showToast('Đang tải danh sách học sinh...', 'info')
  let attendanceData = null
  try {
    attendanceData = await api.getAttendance(classId, targetDate)
  } catch (err) {
    console.warn('Failed to load attendance:', err)
  }

  const isEditMode = !!(attendanceData?.session)
  const students = attendanceData?.students || []
  // Only present active students, or students who already have a record/session for this date
  const activeStudents = students.filter(s => s.status === 'ACTIVE' || s.recordId || s.isPresent)

  // Pre-calculate present count
  const hasPreRecorded = activeStudents.some(s => s.isPresent)
  let initialPresentCount = activeStudents.filter(s => s.isPresent).length
  if (!hasPreRecorded) {
    // Default in create mode with no pre-scheduled sessions: all present
    initialPresentCount = activeStudents.length
  }

  const percent = activeStudents.length > 0 ? Math.round((initialPresentCount / activeStudents.length) * 100) : 0

  const bodyHTML = `
    <div style="display:flex; flex-direction:column; gap:16px;">
      <!-- Date Picker & Mode Banner -->
      <div style="display:flex; justify-content:space-between; align-items:center; flex-wrap:wrap; gap:12px; background:#f8fafc; padding:14px 16px; border-radius:12px; border:1px solid #e2e8f0;">
        <div style="display:flex; align-items:center; gap:10px;">
          <label style="font-size:13px; font-weight:700; color:#334155;">
            <i class="fa-regular fa-calendar" style="color:#0066cc;"></i> Ngày điểm danh:
          </label>
          <input type="date" id="attendance-session-date-input" value="${targetDate}" max="${today}" style="padding:6px 12px; border:1px solid #cbd5e1; border-radius:8px; font-size:13px; font-weight:600; outline:none; background:#ffffff; color:#0f172a;">
        </div>
        <div id="attendance-mode-badge">
          ${isEditMode ? `
            <span class="badge" style="background:#e0f2fe; color:#0369a1; border:1px solid #bae6fd;">
              <i class="fa-solid fa-pen-to-square"></i> Chế độ: Sửa điểm danh
            </span>
          ` : `
            <span class="badge badge-paid">
              <i class="fa-solid fa-plus"></i> Chế độ: Điểm danh mới
            </span>
          `}
        </div>
      </div>

      <!-- Quick Toolbar: Select All / Deselect All + Realtime Counter -->
      <div style="display:flex; justify-content:space-between; align-items:center; flex-wrap:wrap; gap:12px;">
        <div style="display:flex; gap:8px;">
          <button type="button" id="btn-att-select-all" class="btn-secondary" style="padding:6px 12px; font-size:12px; font-weight:600; border-radius:8px; cursor:pointer;">
            <i class="fa-solid fa-check-double"></i> Chọn tất cả
          </button>
          <button type="button" id="btn-att-deselect-all" class="btn-secondary" style="padding:6px 12px; font-size:12px; font-weight:600; border-radius:8px; cursor:pointer;">
            <i class="fa-solid fa-xmark"></i> Bỏ chọn tất cả
          </button>
        </div>
        <div>
          <span id="attendance-realtime-counter" class="badge badge-present" style="font-size:13px; padding:6px 14px;">
            Có mặt <strong id="att-present-num">${initialPresentCount}</strong> / ${activeStudents.length} (${percent}%)
          </span>
        </div>
      </div>

      <!-- Student List Checklist -->
      <div id="attendance-roster-list" style="max-height:360px; overflow-y:auto; padding:2px;">
        ${activeStudents.length === 0 ? `
          <div style="text-align:center; padding:32px; color:#64748b; font-size:13px;">
            Không có học sinh nào đang hoạt động trong lớp học này.
          </div>
        ` : activeStudents.map(s => {
          const isChecked = hasPreRecorded ? s.isPresent : true
          const initials = s.fullName ? s.fullName.split(' ').map(n => n[0]).join('').substring(0, 2).toUpperCase() : 'HS'
          const isPaid = s.paymentStatus === 'paid'

          return `
            <div class="attendance-roster-item ${isChecked ? 'present' : ''}" id="att-item-${s.studentId}">
              <div class="attendance-roster-info">
                <input type="checkbox" class="attendance-check-box" data-student-id="${s.studentId}" data-is-paid="${isPaid}" ${isChecked ? 'checked' : ''}>
                <div class="avatar-circle" style="width:36px; height:36px; font-size:13px; background:#eff6ff; color:#0066cc; flex-shrink:0;">${initials}</div>
                <div style="min-width:0; flex:1;">
                  <div class="attendance-student-name">${escapeHtml(s.fullName)}</div>
                  <div class="attendance-student-sub">${escapeHtml(s.username)}</div>
                </div>
              </div>
              <div class="attendance-roster-actions">
                ${isPaid ? `
                  <span class="badge badge-paid" title="Học sinh này đã đóng học phí cho buổi học này">
                    <i class="fa-solid fa-circle-check"></i> Đã đóng
                  </span>
                ` : ''}
                <span class="att-status-pill badge ${isChecked ? 'badge-present' : 'badge-absent'}">
                  ${isChecked ? 'Có mặt' : 'Vắng'}
                </span>
              </div>
            </div>
          `
        }).join('')}
      </div>

      <!-- Note Input -->
      <div>
        <label style="font-size:13px; font-weight:600; color:#334155; display:block; margin-bottom:6px;">
          Ghi chú buổi học (tùy chọn)
        </label>
        <input type="text" id="attendance-session-note" class="form-input" placeholder="Ví dụ: Ôn tập chương 1, bài thi thử..." value="${escapeHtml(attendanceData?.session?.note || '')}">
      </div>

      <!-- Telegram Send Option -->
      <div style="display:flex; align-items:center; gap:8px;">
        <input type="checkbox" id="cb-send-telegram-recap" style="width:16px; height:16px; accent-color:#0066cc; cursor:pointer;" checked>
        <label for="cb-send-telegram-recap" style="font-size:13px; color:#334155; cursor:pointer; font-weight:500;">
          Gửi thông báo tóm tắt sĩ số buổi học vào nhóm Telegram lớp (nếu có liên kết)
        </label>
      </div>
    </div>
  `

  openModal(
    `Điểm danh: ${currentClass.name}`,
    bodyHTML,
    async () => {
      const dateInput = document.getElementById('attendance-session-date-input')
      const noteInput = document.getElementById('attendance-session-note')
      const tgCheckbox = document.getElementById('cb-send-telegram-recap')
      
      const sessionDate = dateInput?.value || today
      const note = noteInput?.value?.trim() || ''
      const sendTelegram = tgCheckbox?.checked ?? true

      // Collect records
      const checkboxes = document.querySelectorAll('.attendance-check-box')
      const records = Array.from(checkboxes).map(cb => ({
        studentId: cb.getAttribute('data-student-id'),
        isPresent: cb.checked
      }))

      // Warning check: if user uncheck someone who is paid
      let hasUncheckedPaidStudent = false
      checkboxes.forEach(cb => {
        const isPaid = cb.getAttribute('data-is-paid') === 'true'
        if (isPaid && !cb.checked) {
          hasUncheckedPaidStudent = true
        }
      })

      if (hasUncheckedPaidStudent) {
        if (!confirm('Cảnh báo: Có học sinh đã ĐÓNG HỌC PHÍ bị đánh dấu vắng mặt. Bạn có chắc chắn muốn bỏ tích học sinh này không?')) {
          return false
        }
      }

      showToast('Đang lưu dữ liệu điểm danh...', 'info')
      try {
        await api.saveAttendance({
          classId,
          sessionDate,
          note,
          records,
          sendTelegram
        })

        showToast('Điểm danh thành công!', 'success')

        // Refresh all class data
        fetchClassKpiAndTabData(classId, currentClass)
        return true
      } catch (err) {
        showToast(`Lưu điểm danh thất bại: ${err.message}`, 'error')
        return false
      }
    }
  )

  // Attach real-time event handlers inside modal
  setTimeout(() => {
    const listEl = document.getElementById('attendance-roster-list')
    const dateInput = document.getElementById('attendance-session-date-input')

    // 1. Date change handler: re-fetch attendance for selected date
    if (dateInput) {
      dateInput.onchange = () => {
        const newDate = dateInput.value
        if (newDate) {
          closeModal()
          showAttendanceModal(classId, currentClass, newDate)
        }
      }
    }

    // 2. Real-time counter updater
    const updateRealtimeCounter = () => {
      const cbs = document.querySelectorAll('.attendance-check-box')
      const checked = Array.from(cbs).filter(c => c.checked).length
      const total = cbs.length
      const pct = total > 0 ? Math.round((checked / total) * 100) : 0

      const numEl = document.getElementById('att-present-num')
      const counterEl = document.getElementById('attendance-realtime-counter')
      if (numEl) numEl.textContent = checked
      if (counterEl) {
        counterEl.innerHTML = `Có mặt <strong id="att-present-num">${checked}</strong> / ${total} (${pct}%)`
      }
    }

    // 3. Checkbox toggles
    document.querySelectorAll('.attendance-check-box').forEach(cb => {
      cb.onchange = () => {
        const parentItem = cb.closest('.attendance-roster-item')
        const pill = parentItem?.querySelector('.att-status-pill')

        if (cb.checked) {
          parentItem?.classList.add('present')
          if (pill) {
            pill.className = 'att-status-pill badge badge-present'
            pill.textContent = 'Có mặt'
          }
        } else {
          parentItem?.classList.remove('present')
          if (pill) {
            pill.className = 'att-status-pill badge badge-absent'
            pill.textContent = 'Vắng'
          }
        }
        updateRealtimeCounter()
      }
    })

    // 4. Select all
    const selectAllBtn = document.getElementById('btn-att-select-all')
    if (selectAllBtn) {
      selectAllBtn.onclick = () => {
        document.querySelectorAll('.attendance-check-box').forEach(cb => {
          cb.checked = true
          const parentItem = cb.closest('.attendance-roster-item')
          const pill = parentItem?.querySelector('.att-status-pill')
          parentItem?.classList.add('present')
          if (pill) {
            pill.className = 'att-status-pill badge badge-present'
            pill.textContent = 'Có mặt'
          }
        })
        updateRealtimeCounter()
      }
    }

    // 5. Deselect all
    const deselectAllBtn = document.getElementById('btn-att-deselect-all')
    if (deselectAllBtn) {
      deselectAllBtn.onclick = () => {
        document.querySelectorAll('.attendance-check-box').forEach(cb => {
          cb.checked = false
          const parentItem = cb.closest('.attendance-roster-item')
          const pill = parentItem?.querySelector('.att-status-pill')
          parentItem?.classList.remove('present')
          if (pill) {
            pill.className = 'att-status-pill badge badge-absent'
            pill.textContent = 'Vắng'
          }
        })
        updateRealtimeCounter()
      }
    }
  }, 100)
}

// ---------------------------------------------------------
// TAB 3 BINDINGS: HỌC PHÍ & CÔNG NỢ
// ---------------------------------------------------------
function bindTuitionTabEvents(classId, currentClass) {
  // Quick edit tuition fee
  const quickEditBtn = document.getElementById('btn-quick-edit-tuition')
  if (quickEditBtn) {
    quickEditBtn.onclick = () => showEditClassModal(currentClass)
  }

  // Collect single student's debt
  document.querySelectorAll('.btn-collect-student-tuition').forEach(btn => {
    btn.onclick = async () => {
      const studentId = btn.getAttribute('data-student-id')
      const studentName = btn.getAttribute('data-student-name')
      const debt = Number(btn.getAttribute('data-debt') || 0)

      if (!confirm(`Xác nhận đã thu toàn bộ học phí nợ (${debt.toLocaleString('vi-VN')} VND) của học sinh "${studentName}"?`)) return

      showToast('Đang cập nhật trạng thái học phí...', 'info')
      try {
        await api.markStudentTuitionPaid(classId, studentId)
        showToast(`Đã thu toàn bộ nợ của học sinh ${studentName}`, 'success')
        fetchClassKpiAndTabData(classId, currentClass)
      } catch (err) {
        showToast(`Thu học phí thất bại: ${err.message}`, 'error')
      }
    }
  })

  // Collect all debt for entire class
  const collectAllBtn = document.getElementById('btn-collect-all-class-tuition')
  if (collectAllBtn) {
    collectAllBtn.onclick = async () => {
      if (!confirm('Bạn có chắc chắn muốn đánh dấu đã đóng học phí cho TẤT CẢ các học sinh còn nợ trong lớp?')) return

      showToast('Đang xử lý thu toàn bộ nợ của lớp...', 'info')
      try {
        const debtList = cachedDebtSummary || []
        for (const s of debtList) {
          if ((s.unpaidDebt || 0) > 0) {
            await api.markStudentTuitionPaid(classId, s.studentId)
          }
        }
        showToast('Đã đánh dấu đã đóng toàn bộ học phí cho lớp', 'success')
        fetchClassKpiAndTabData(classId, currentClass)
      } catch (err) {
        showToast(`Xử lý thất bại: ${err.message}`, 'error')
      }
    }
  }

  // View detailed sessions for student
  document.querySelectorAll('.btn-view-student-sessions').forEach(btn => {
    btn.onclick = () => {
      const studentId = btn.getAttribute('data-student-id')
      const studentName = btn.getAttribute('data-student-name')
      showStudentSessionDebtModal(classId, currentClass, studentId, studentName)
    }
  })
}

// Modal xem chi tiết từng buổi học và toggle trạng thái đóng tiền của học sinh
function showStudentSessionDebtModal(classId, currentClass, studentId, studentName) {
  const student = (cachedDebtSummary || []).find(s => s.studentId === studentId)
  const sessions = student?.sessions || []

  const bodyHTML = `
    <div style="display:flex; flex-direction:column; gap:16px;">
      <div style="display:flex; justify-content:space-between; align-items:center; background:#f8fafc; padding:12px 16px; border-radius:12px; border:1px solid #e2e8f0; flex-wrap:wrap; gap:12px;">
        <div>
          <div style="font-weight:700; color:#0f172a; font-size:15px;">${escapeHtml(studentName)}</div>
          <div style="font-size:12px; color:#64748b;">Tổng số buổi tham gia: ${sessions.length} buổi</div>
        </div>
        <div style="display:flex; align-items:center; gap:16px;">
          <div style="text-align:right;">
            <div style="font-size:11px; color:#64748b; font-weight:600; text-transform:uppercase;">Còn nợ</div>
            <strong style="color:#b45309; font-size:16px; font-family:var(--font-heading);">${(student?.unpaidDebt || 0).toLocaleString('vi-VN')} VND</strong>
          </div>
          <a href="#student-details?studentId=${studentId}&classId=${classId}" onclick="closeModal()" class="btn-secondary" style="font-size:12px; padding:6px 12px; border-radius:8px; display:inline-flex; align-items:center; gap:6px; text-decoration:none; font-weight:600; color:#0066cc; background:#ffffff; border:1px solid #cbd5e1;" title="Mở lịch học cá nhân của học sinh">
            <i class="fa-regular fa-calendar-check"></i> Mở lịch học học sinh
          </a>
        </div>
      </div>

      <div style="max-height:340px; overflow-y:auto; border:1px solid #e2e8f0; border-radius:10px;">
        <table class="data-table" style="margin:0;">
          <thead>
            <tr>
              <th>Ngày học</th>
              <th>Học phí</th>
              <th>Trạng thái</th>
              <th style="text-align:center;">Thao tác</th>
            </tr>
          </thead>
          <tbody>
            ${sessions.length === 0 ? `
              <tr>
                <td colspan="4" style="text-align:center; padding:24px; color:#64748b;">Chưa có buổi học nào.</td>
              </tr>
            ` : sessions.map(sess => {
              const [y, m, d] = (sess.sessionDate || '').split('-')
              const formattedDate = d && m && y ? `${d}/${m}/${y}` : sess.sessionDate
              const isPaid = sess.paymentStatus === 'paid'

              return `
                <tr>
                  <td>
                    <div style="font-weight:600; color:#0f172a;">${formattedDate}</div>
                    ${sess.sessionNote ? `<div style="font-size:11px; color:#64748b;">${escapeHtml(sess.sessionNote)}</div>` : ''}
                  </td>
                  <td>
                    <strong>${(sess.feeAmount || 0).toLocaleString('vi-VN')} đ</strong>
                  </td>
                  <td>
                    <span class="badge ${isPaid ? 'badge-paid' : 'badge-unpaid'}">
                      ${isPaid ? 'Đã đóng' : 'Chưa đóng'}
                    </span>
                  </td>
                  <td style="text-align:center;">
                    <button class="btn-toggle-session-payment btn-secondary" data-record-id="${sess.recordId || ''}" data-student-id="${studentId}" data-session-date="${sess.sessionDate}" data-current-status="${sess.paymentStatus}" style="padding:4px 10px; font-size:11px; border-radius:6px; cursor:pointer; font-weight:600;">
                      ${isPaid ? 'Đổi sang Chưa đóng' : 'Đánh dấu Đã đóng'}
                    </button>
                  </td>
                </tr>
              `
            }).join('')}
          </tbody>
        </table>
      </div>
    </div>
  `

  openModal(`Chi tiết học phí: ${studentName}`, bodyHTML)

  setTimeout(() => {
    document.querySelectorAll('.btn-toggle-session-payment').forEach(btn => {
      btn.onclick = async () => {
        const recordId = btn.getAttribute('data-record-id')
        const studentIdAttr = btn.getAttribute('data-student-id') || studentId
        const sessionDate = btn.getAttribute('data-session-date')
        const currentStatus = btn.getAttribute('data-current-status')
        const nextStatus = currentStatus === 'paid' ? 'unpaid' : 'paid'

        showToast('Đang cập nhật...', 'info')
        try {
          await api.markTuitionPaid({
            classId,
            studentId: studentIdAttr,
            sessionDate,
            status: nextStatus,
            isPaid: nextStatus === 'paid',
            recordIds: recordId ? [recordId] : []
          })
          showToast('Đã cập nhật trạng thái buổi học', 'success')
          closeModal()
          fetchClassKpiAndTabData(classId, currentClass)
        } catch (err) {
          showToast(`Lỗi: ${err.message}`, 'error')
        }
      }
    })
  }, 100)
}

// ---------------------------------------------------------
// TAB 5 BINDINGS: CÀI ĐẶT (SETTINGS)
// ---------------------------------------------------------
function bindSettingsTabEvents(classId, currentClass) {
  // 1. Update class settings form
  const form = document.getElementById('form-update-class-settings')
  if (form) {
    form.onsubmit = async (e) => {
      e.preventDefault()
      const name = document.getElementById('setting-class-name')?.value.trim()
      const tuitionFee = parseFloat(document.getElementById('setting-class-tuition')?.value) || 0
      const description = document.getElementById('setting-class-description')?.value.trim() || ''

      if (!name) {
        showToast('Tên lớp học không được để trống!', 'error')
        return
      }

      showToast('Đang cập nhật thông tin lớp...', 'info')
      try {
        const updated = await api.updateClass({
          classId,
          name,
          tuitionFee,
          description
        })

        // Update state
        Object.assign(currentClass, updated)
        showToast('Đã lưu thông tin lớp học thành công', 'success')
        window.location.reload()
      } catch (err) {
        showToast(`Cập nhật thất bại: ${err.message}`, 'error')
      }
    }
  }

  // 2. Telegram config
  bindTelegramConfigEvents(classId)

  // 3. Archive class button
  const archiveBtn = document.getElementById('btn-archive-class')
  if (archiveBtn) {
    archiveBtn.onclick = async () => {
      const isArchived = !currentClass.is_archived
      const actionText = isArchived ? 'lưu trữ' : 'hủy lưu trữ'
      if (!confirm(`Bạn có chắc muốn ${actionText} lớp học này?`)) return

      showToast(`Đang ${actionText} lớp học...`, 'info')
      try {
        await api.archiveClass(classId, isArchived)
        currentClass.is_archived = isArchived
        showToast(`Đã ${actionText} lớp học thành công`, 'success')
        window.location.reload()
      } catch (err) {
        showToast(`Thất bại: ${err.message}`, 'error')
      }
    }
  }

  // 4. Permanent delete class
  const deleteBtn = document.getElementById('btn-delete-class-permanent')
  if (deleteBtn) {
    deleteBtn.onclick = async () => {
      if (confirm(`CẢNH BÁO NGUY HIỂM: Bạn có chắc chắn muốn xóa VĨNH VIỄN lớp học "${currentClass.name}"? Toàn bộ bài tập, dữ liệu điểm danh và thông tin lớp sẽ bị xóa hoàn toàn.`)) {
        showToast('Đang xóa lớp học...', 'info')
        try {
          await api.deleteClass(classId)
          state.classes = state.classes.filter(c => c.id !== classId)
          showToast(`Đã xóa vĩnh viễn lớp ${currentClass.name}`, 'success')
          window.location.hash = '#classes-admin'
        } catch (err) {
          showToast(`Xóa thất bại: ${err.message}`, 'error')
        }
      }
    }
  }
}

// Modal sửa thông tin lớp (Header & Settings)
function showEditClassModal(currentClass) {
  const modalHTML = `
    <form id="edit-class-modal-form" onsubmit="return false;" style="display:flex; flex-direction:column; gap:16px;">
      <div>
        <label style="font-size:13px; font-weight:600; color:#334155; display:block; margin-bottom:6px;">Tên lớp học *</label>
        <input type="text" id="modal-edit-class-name" class="form-input" value="${escapeHtml(currentClass.name)}" required>
      </div>
      <div>
        <label style="font-size:13px; font-weight:600; color:#334155; display:block; margin-bottom:6px;">Học phí (VND/Buổi) *</label>
        <input type="number" id="modal-edit-class-tuition" class="form-input" min="0" value="${Number(currentClass.tuitionFee || 0)}" required>
      </div>
      <div>
        <label style="font-size:13px; font-weight:600; color:#334155; display:block; margin-bottom:6px;">Mô tả</label>
        <textarea id="modal-edit-class-desc" class="form-input" rows="3">${escapeHtml(currentClass.description || '')}</textarea>
      </div>
    </form>
  `

  openModal('Sửa thông tin lớp học', modalHTML, async () => {
    const name = document.getElementById('modal-edit-class-name')?.value.trim()
    const tuitionFee = parseFloat(document.getElementById('modal-edit-class-tuition')?.value) || 0
    const description = document.getElementById('modal-edit-class-desc')?.value.trim() || ''

    if (!name) {
      showToast('Tên lớp không được để trống!', 'error')
      return false
    }

    showToast('Đang cập nhật...', 'info')
    try {
      const updated = await api.updateClass({
        classId: currentClass.id,
        name,
        tuitionFee,
        description
      })

      Object.assign(currentClass, updated)
      showToast('Đã cập nhật thông tin lớp học', 'success')
      window.location.reload()
      return true
    } catch (err) {
      showToast(`Cập nhật thất bại: ${err.message}`, 'error')
      return false
    }
  })
}

// ---------------------------------------------------------
// TELEGRAM BOT HELPERS
// ---------------------------------------------------------
async function loadTelegramConfig(classId) {
  try {
    const config = await api.getTelegramConfig(classId)
    return config
  } catch (e) {
    console.error('Failed to load telegram config:', e)
    return null
  }
}

async function bindTelegramConfigEvents(classId) {
  const bodyEl = document.getElementById('telegram-config-body')
  if (!bodyEl) return

  const config = await loadTelegramConfig(classId)
  renderTelegramConfigUI(classId, config, bodyEl)

  bodyEl.querySelectorAll('.btn-copy-link').forEach(btn => {
    btn.onclick = () => {
      const text = btn.getAttribute('data-copy') || ''
      navigator.clipboard.writeText(text).then(() => {
        showToast('Đã sao chép lệnh vào clipboard', 'success')
      }).catch(() => {
        showToast('Sao chép thất bại', 'error')
      })
    }
  })
}

function renderTelegramConfigUI(classId, config, container) {
  const botUsername = (window.TELEGRAM_BOT_USERNAME || 'MyExamSystemBot').startsWith('@')
    ? window.TELEGRAM_BOT_USERNAME || 'MyExamSystemBot'
    : `@${window.TELEGRAM_BOT_USERNAME || 'MyExamSystemBot'}`

  if (!config) {
    container.innerHTML = `
      <div style="background:#f8fafc; border:1px dashed #cbd5e1; padding:18px; border-radius:12px;">
        <p style="margin:0 0 8px 0; color:#334155; font-weight:700;">Chưa liên kết Telegram</p>
        <p style="margin:0 0 12px 0; color:#64748b; font-size:13px; line-height:1.5;">
          Để nhận thông báo nộp bài và tóm tắt điểm danh, mời bot <strong>${botUsername}</strong> vào nhóm/kênh của lớp và gõ lệnh:
        </p>
        <div style="display:flex; align-items:center; gap:8px; background:#ffffff; border:1px solid #e2e8f0; padding:8px 12px; border-radius:8px; max-width:500px;">
          <code style="flex:1; font-family:monospace; color:#0f172a; font-size:13px;">/link ${classId}</code>
          <button class="btn-copy-link" data-copy="/link ${classId}" style="padding:6px 14px; font-size:12px; border-radius:8px; cursor:pointer; background:#0066cc; border:none; color:#ffffff; font-weight:600;">Copy</button>
        </div>
      </div>
    `
    return
  }

  const statusLabel = config.is_enabled ? 'Đang bật' : 'Đã tắt'
  const statusColor = config.is_enabled ? '#10b981' : '#94a3b8'

  container.innerHTML = `
    <div style="background:#f8fafc; border:1px solid #e2e8f0; padding:18px; border-radius:12px;">
      <div style="display:flex; justify-content:space-between; align-items:center; flex-wrap:wrap; gap:16px;">
        <div>
          <div style="color:#334155; font-weight:700; font-size:15px;">Nhóm/kênh: <span style="color:#0f172a;">${escapeHtml(config.chat_title || 'N/A')}</span></div>
          <div style="color:#64748b; font-size:13px; margin-top:4px;">Chat ID: <span style="font-family:monospace;">${escapeHtml(config.chat_id)}</span></div>
          <div style="color:#64748b; font-size:13px; margin-top:4px;">Trạng thái: <span style="color:${statusColor}; font-weight:700;">${statusLabel}</span></div>
        </div>
        <div style="display:flex; gap:10px; flex-wrap:wrap;">
          <button class="btn-toggle-telegram" data-enabled="${!config.is_enabled}" style="padding:8px 16px; font-size:13px; border-radius:8px; cursor:pointer; background:${config.is_enabled ? '#f1f5f9' : '#0066cc'}; border:none; color:${config.is_enabled ? '#0f172a' : '#ffffff'}; font-weight:600;">
            ${config.is_enabled ? 'Tắt thông báo' : 'Bật thông báo'}
          </button>
          <button class="btn-unlink-telegram" style="padding:8px 16px; font-size:13px; border-radius:8px; cursor:pointer; background:#fee2e2; border:1px solid #fecaca; color:#b91c1c; font-weight:600;">
            Hủy liên kết
          </button>
        </div>
      </div>
    </div>
  `

  const toggleBtn = container.querySelector('.btn-toggle-telegram')
  if (toggleBtn) {
    toggleBtn.onclick = async () => {
      const enabled = toggleBtn.getAttribute('data-enabled') === 'true'
      showToast('Đang cập nhật cấu hình Telegram...', 'info')
      try {
        const updated = await api.updateTelegramConfig({
          classId,
          chatId: config.chat_id,
          chatTitle: config.chat_title,
          isEnabled: enabled,
        })
        showToast('Đã cập nhật trạng thái thông báo', 'success')
        renderTelegramConfigUI(classId, updated, container)
      } catch (e) {
        showToast(`Cập nhật thất bại: ${e.message}`, 'error')
      }
    }
  }

  const unlinkBtn = container.querySelector('.btn-unlink-telegram')
  if (unlinkBtn) {
    unlinkBtn.onclick = async () => {
      if (!confirm('Bạn có chắc muốn hủy liên kết Telegram của lớp học này?')) return
      showToast('Đang hủy liên kết...', 'info')
      try {
        await api.deleteTelegramConfig(classId)
        showToast('Đã hủy liên kết Telegram', 'success')
        renderTelegramConfigUI(classId, null, container)
      } catch (e) {
        showToast(`Hủy liên kết thất bại: ${e.message}`, 'error')
      }
    }
  }
}

function escapeHtml(str) {
  return String(str || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
}