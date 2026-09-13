import { renderSidebar, bindSidebarEvents } from '../components/sidebar.js'
import { renderNavbar } from '../components/navbar.js'
import { state } from '../state.js'

function getAvatarColor(name) {
  const colors = ['#0284c7', '#4338ca', '#7e22ce', '#059669', '#d97706', '#0891b2', '#2563eb']
  let hash = 0
  for (let i = 0; i < (name || '').length; i++) {
    hash = name.charCodeAt(i) + ((hash << 5) - hash)
  }
  return colors[Math.abs(hash) % colors.length]
}

function getInitials(name) {
  if (!name) return 'HS'
  const parts = name.trim().split(/\s+/)
  if (parts.length === 1) return parts[0].substring(0, 2).toUpperCase()
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase()
}

// Module-level state for Student Attendance & Tuition Table filtering
let studentFilterState = {
  selectedMonth: 'all',
  selectedClass: 'all',
  selectedStatus: 'all',
  searchQuery: '',
  currentPage: 1,
  pageSize: 10
}

export function renderAdminDashboardView() {
  const overview = state.dashboard?.overview || {
    totalStudents: 0,
    totalClasses: 0,
    totalHomeworks: 0,
    totalSubmissions: 0,
    totalTaughtSessions: 0,
    totalTuitionFee: 0,
    totalPaidTuitionFee: 0,
    totalUnpaidTuitionFee: 0,
    collectionRate: 0,
    averageScore: 0,
    passRate: 0,
    onTimeRate: 100
  }
  const monthlyStats = state.dashboard?.monthlyStats || []
  const recentSubmissions = state.dashboard?.recentSubmissions || []
  const studentAttendanceStats = state.dashboard?.studentAttendanceStats || []
  const scoreDistribution = state.dashboard?.scoreDistribution || {
    excellent: 0, good: 0, fair: 0, average: 0, poor: 0
  }
  const submissionTiming = state.dashboard?.submissionTiming || {
    total: overview.totalSubmissions || 0,
    onTime: overview.totalSubmissions || 0,
    late: 0,
    onTimeRate: overview.onTimeRate || 100
  }

  const totalTuition = overview.totalTuitionFee || 0
  const totalPaid = overview.totalPaidTuitionFee !== undefined
    ? overview.totalPaidTuitionFee
    : monthlyStats.reduce((acc, m) => acc + (m.paidTuitionFee || 0), 0)
  const totalUnpaid = overview.totalUnpaidTuitionFee !== undefined
    ? overview.totalUnpaidTuitionFee
    : (totalTuition - totalPaid)
  
  const collectionRate = totalTuition > 0
    ? Math.round((totalPaid / totalTuition) * 100)
    : (overview.collectionRate || 0)

  const avgScore = Number(overview.averageScore || 0)
  let scoreBadgeClass = 'pill-warning'
  let scoreText = 'Đạt chuẩn'
  if (avgScore >= 8.0) {
    scoreBadgeClass = 'pill-success'
    scoreText = 'Xuất sắc'
  } else if (avgScore >= 6.5) {
    scoreBadgeClass = 'pill-info'
    scoreText = 'Khá'
  } else if (avgScore < 5.0 && avgScore > 0) {
    scoreBadgeClass = 'pill-danger'
    scoreText = 'Cần cải thiện'
  }

  // Get distinct classes for filter dropdown
  const classOptions = Array.from(new Set(studentAttendanceStats.flatMap(s => s.classNames || []))).filter(Boolean)

  return `
    <div class="app-layout">
      ${renderSidebar('admin-dashboard')}
      <div class="main-content">
        ${renderNavbar('Nền tảng / Trung tâm Thống kê')}
        <div class="content-body">
          
          <!-- Top Header -->
          <div class="page-header" style="margin-bottom: 24px;">
            <div>
              <div style="display:flex; align-items:center; gap:8px; margin-bottom:4px;">
                <h1 class="page-title" style="margin:0;">Trung Tâm Thống Kê & Báo Cáo</h1>
                <span class="badge" style="background:#e0f2fe; color:#0284c7; font-weight:700;">Live Analytics</span>
              </div>
              <p class="page-description">Bức tranh toàn cảnh về hoạt động giảng dạy, kết quả học tập và dòng tiền học phí của hệ thống.</p>
            </div>
            <div style="display:flex; gap:10px; flex-wrap:wrap;">
              <button class="btn-secondary" onclick="window.location.hash='#classes'" style="width:auto; font-size:13px;">
                <i class="fa-solid fa-layer-group"></i> Quản lý lớp
              </button>
              <button class="btn-primary" onclick="window.location.hash='#create-homework'" style="width:auto; font-size:13px;">
                <i class="fa-solid fa-plus"></i> Tạo bài tập mới
              </button>
            </div>
          </div>

          <!-- SECTION 1: ACADEMIC & TEACHING METRICS -->
          <div class="dash-section">
            <div class="dash-section-header">
              <div class="dash-section-title">
                <i class="fa-solid fa-graduation-cap" style="color:#0284c7;"></i>
                Hoạt Động Giảng Dạy & Học Vụ
              </div>
              <span class="dash-section-badge badge-academic">Học tập</span>
            </div>

            <div class="dash-kpi-grid">
              <!-- Total Students -->
              <div class="dash-kpi-card" onclick="window.location.hash='#students'" style="cursor:pointer;">
                <div class="dash-kpi-top">
                  <div class="dash-kpi-icon icon-blue">
                    <i class="fa-solid fa-users"></i>
                  </div>
                  <span class="dash-kpi-pill pill-info">
                    <i class="fa-solid fa-arrow-right" style="font-size:9px;"></i> Xem danh sách
                  </span>
                </div>
                <div>
                  <div class="dash-kpi-label">Tổng học sinh</div>
                  <div class="dash-kpi-value">${overview.totalStudents}</div>
                  <div class="dash-kpi-subtext">
                    <i class="fa-regular fa-id-badge"></i> Đang theo học tại trung tâm
                  </div>
                </div>
              </div>

              <!-- Total Classes -->
              <div class="dash-kpi-card" onclick="window.location.hash='#classes'" style="cursor:pointer;">
                <div class="dash-kpi-top">
                  <div class="dash-kpi-icon icon-cyan">
                    <i class="fa-solid fa-chalkboard"></i>
                  </div>
                  <span class="dash-kpi-pill pill-info">
                    <i class="fa-solid fa-arrow-right" style="font-size:9px;"></i> Các lớp
                  </span>
                </div>
                <div>
                  <div class="dash-kpi-label">Lớp học đang mở</div>
                  <div class="dash-kpi-value">${overview.totalClasses}</div>
                  <div class="dash-kpi-subtext">
                    <i class="fa-solid fa-user-group"></i> Lớp học chính khóa & chuyên đề
                  </div>
                </div>
              </div>

              <!-- Total Taught Sessions -->
              <div class="dash-kpi-card">
                <div class="dash-kpi-top">
                  <div class="dash-kpi-icon icon-amber">
                    <i class="fa-solid fa-chalkboard-user"></i>
                  </div>
                  <span class="dash-kpi-pill pill-warning">
                    <i class="fa-solid fa-check"></i> Đã hoàn thành
                  </span>
                </div>
                <div>
                  <div class="dash-kpi-label">Tổng buổi đã dạy</div>
                  <div class="dash-kpi-value">${overview.totalTaughtSessions || 0} <span style="font-size:14px; font-weight:600; color:#64748b;">buổi</span></div>
                  <div class="dash-kpi-subtext">
                    <i class="fa-solid fa-calendar-check"></i> Điểm danh thực tế các lớp
                  </div>
                </div>
              </div>

              <!-- Total Submissions -->
              <div class="dash-kpi-card" onclick="window.location.hash='#homework'" style="cursor:pointer;">
                <div class="dash-kpi-top">
                  <div class="dash-kpi-icon icon-indigo">
                    <i class="fa-solid fa-file-signature"></i>
                  </div>
                  <span class="dash-kpi-pill pill-success">
                    ${submissionTiming.onTimeRate}% đúng hạn
                  </span>
                </div>
                <div>
                  <div class="dash-kpi-label">Lượt nộp bài tập</div>
                  <div class="dash-kpi-value">${overview.totalSubmissions || 0}</div>
                  <div class="dash-kpi-subtext">
                    <i class="fa-solid fa-book-open"></i> Trên tổng số ${overview.totalHomeworks} bài đã giao
                  </div>
                </div>
              </div>

              <!-- Average Score -->
              <div class="dash-kpi-card">
                <div class="dash-kpi-top">
                  <div class="dash-kpi-icon icon-purple">
                    <i class="fa-solid fa-award"></i>
                  </div>
                  <span class="dash-kpi-pill ${scoreBadgeClass}">
                    ${scoreText}
                  </span>
                </div>
                <div>
                  <div class="dash-kpi-label">Điểm trung bình</div>
                  <div class="dash-kpi-value">
                    ${avgScore.toFixed(1)} <span style="font-size:14px; font-weight:600; color:#64748b;">/ 10</span>
                  </div>
                  <div class="dash-kpi-subtext">
                    <i class="fa-solid fa-chart-line"></i> Tỷ lệ đạt: <strong>${overview.passRate || 0}%</strong>
                  </div>
                </div>
              </div>
            </div>
          </div>

          <!-- SECTION 2: FINANCIAL & TUITION METRICS -->
          <div class="dash-section">
            <div class="dash-section-header">
              <div class="dash-section-title">
                <i class="fa-solid fa-wallet" style="color:#059669;"></i>
                Tình Hình Tài Chính & Học Phí
              </div>
              <span class="dash-section-badge badge-finance">Tài chính</span>
            </div>

            <div class="dash-kpi-grid" style="grid-template-columns: repeat(auto-fit, minmax(280px, 1fr));">
              <!-- Total Revenue Generated -->
              <div class="dash-kpi-card">
                <div class="dash-kpi-top">
                  <div class="dash-kpi-icon icon-indigo">
                    <i class="fa-solid fa-coins"></i>
                  </div>
                  <span class="dash-kpi-pill pill-info">
                    Tổng phát sinh
                  </span>
                </div>
                <div>
                  <div class="dash-kpi-label">Tổng học phí phát sinh</div>
                  <div class="dash-kpi-value" style="color:#3730a3;">
                    ${totalTuition.toLocaleString('vi-VN')} <span style="font-size:14px; font-weight:600;">VND</span>
                  </div>
                  <div class="dash-kpi-subtext">
                    <i class="fa-solid fa-calculator"></i> Tính từ số buổi tham gia thực tế
                  </div>
                </div>
              </div>

              <!-- Paid Tuition -->
              <div class="dash-kpi-card">
                <div class="dash-kpi-top">
                  <div class="dash-kpi-icon icon-emerald">
                    <i class="fa-solid fa-circle-check"></i>
                  </div>
                  <span class="dash-kpi-pill pill-success">
                    <i class="fa-solid fa-arrow-trend-up"></i> ${collectionRate}% thu hồi
                  </span>
                </div>
                <div>
                  <div class="dash-kpi-label">Học phí đã thu</div>
                  <div class="dash-kpi-value" style="color:#059669;">
                    ${totalPaid.toLocaleString('vi-VN')} <span style="font-size:14px; font-weight:600;">VND</span>
                  </div>
                  <div class="dash-kpi-subtext">
                    <div style="flex:1; margin-right:8px;" class="progress-pill-bar">
                      <div style="width:${collectionRate}%; background:#10b981; height:100%;"></div>
                    </div>
                    <span>${collectionRate}%</span>
                  </div>
                </div>
              </div>

              <!-- Unpaid Tuition / Outstanding -->
              <div class="dash-kpi-card">
                <div class="dash-kpi-top">
                  <div class="dash-kpi-icon icon-rose">
                    <i class="fa-solid fa-clock-rotate-left"></i>
                  </div>
                  <span class="dash-kpi-pill pill-danger">
                    Cần thu hồi
                  </span>
                </div>
                <div>
                  <div class="dash-kpi-label">Công nợ / Chưa đóng</div>
                  <div class="dash-kpi-value" style="color:#dc2626;">
                    ${totalUnpaid.toLocaleString('vi-VN')} <span style="font-size:14px; font-weight:600;">VND</span>
                  </div>
                  <div class="dash-kpi-subtext">
                    <i class="fa-solid fa-triangle-exclamation" style="color:#dc2626;"></i> Cần nhắc phụ huynh & học sinh
                  </div>
                </div>
              </div>
            </div>
          </div>

          <!-- SECTION 3: VISUAL CHARTS GRID 1 (FINANCE & COLLECTION) -->
          <div class="dash-charts-grid-2">
            <!-- Monthly Revenue Bar Chart -->
            <div class="dash-chart-card">
              <div class="dash-chart-header">
                <div>
                  <h3 class="dash-chart-title">
                    <i class="fa-solid fa-chart-column" style="color:#0284c7;"></i>
                    Học Phí Đã Thu & Chưa Thu Theo Tháng
                  </h3>
                  <div class="dash-chart-desc">So sánh số tiền học phí đã thu và còn nợ qua từng tháng học.</div>
                </div>
                <div style="display:flex; align-items:center; gap:14px; font-size:12px; font-weight:600;">
                  <span style="display:inline-flex; align-items:center; gap:6px;">
                    <span style="width:10px; height:10px; background-color:#10b981; border-radius:3px;"></span> Đã thu
                  </span>
                  <span style="display:inline-flex; align-items:center; gap:6px;">
                    <span style="width:10px; height:10px; background-color:#ef4444; border-radius:3px;"></span> Chưa thu
                  </span>
                </div>
              </div>
              <div style="position:relative; width:100%; height:290px;">
                <canvas id="chart-monthly-revenue"></canvas>
              </div>
            </div>

            <!-- Tuition Doughnut Collection Rate -->
            <div class="dash-chart-card">
              <div class="dash-chart-header">
                <div>
                  <h3 class="dash-chart-title">
                    <i class="fa-solid fa-chart-pie" style="color:#10b981;"></i>
                    Tỷ Lệ Thu Học Phí
                  </h3>
                  <div class="dash-chart-desc">Tỷ trọng đã thu vs chưa thu toàn hệ thống</div>
                </div>
              </div>
              <div style="position:relative; width:100%; height:210px; display:flex; align-items:center; justify-content:center;">
                <canvas id="chart-tuition-doughnut"></canvas>
              </div>
              <div style="margin-top:16px; border-top:1px solid #f1f5f9; padding-top:14px; display:flex; justify-content:space-around; text-align:center;">
                <div>
                  <div style="font-size:11px; font-weight:700; color:#64748b; text-transform:uppercase;">Đã thu</div>
                  <div style="font-family:var(--font-heading); font-size:16px; font-weight:700; color:#059669;">${totalPaid.toLocaleString('vi-VN')} đ</div>
                  <div style="font-size:11px; font-weight:600; color:#10b981;">${collectionRate}%</div>
                </div>
                <div style="width:1px; background:#e2e8f0;"></div>
                <div>
                  <div style="font-size:11px; font-weight:700; color:#64748b; text-transform:uppercase;">Chưa thu</div>
                  <div style="font-family:var(--font-heading); font-size:16px; font-weight:700; color:#dc2626;">${totalUnpaid.toLocaleString('vi-VN')} đ</div>
                  <div style="font-size:11px; font-weight:600; color:#ef4444;">${100 - collectionRate}%</div>
                </div>
              </div>
            </div>
          </div>

          <!-- SECTION 4: VISUAL CHARTS GRID 2 (ACADEMIC & TEACHING ACTIVITY) -->
          <div class="dash-charts-grid-equal">
            <!-- Grade Distribution Doughnut Chart -->
            <div class="dash-chart-card">
              <div class="dash-chart-header">
                <div>
                  <h3 class="dash-chart-title">
                    <i class="fa-solid fa-graduation-cap" style="color:#7e22ce;"></i>
                    Phổ Điểm & Năng Lực Học Sinh
                  </h3>
                  <div class="dash-chart-desc">Phân loại học sinh theo phổ điểm trung bình bài tập.</div>
                </div>
              </div>
              <div style="position:relative; width:100%; height:260px;">
                <canvas id="chart-grade-dist"></canvas>
              </div>
            </div>

            <!-- Activity Trends: Teaching Sessions -->
            <div class="dash-chart-card">
              <div class="dash-chart-header">
                <div>
                  <h3 class="dash-chart-title">
                    <i class="fa-solid fa-chalkboard-user" style="color:#f59e0b;"></i>
                    Xu Hướng Hoạt Động Giảng Dạy
                  </h3>
                  <div class="dash-chart-desc">Số buổi đã dạy (cột) và đường cong xu hướng qua các tháng.</div>
                </div>
                <div style="display:flex; align-items:center; gap:14px; font-size:12px; font-weight:600;">
                  <span style="display:inline-flex; align-items:center; gap:6px;">
                    <span style="width:10px; height:10px; background-color:#f59e0b; border-radius:3px;"></span> Buổi dạy (cột)
                  </span>
                  <span style="display:inline-flex; align-items:center; gap:6px;">
                    <span style="width:14px; height:3px; background-color:#0284c7; border-radius:2px;"></span> Đường xu hướng
                  </span>
                </div>
              </div>
              <div style="position:relative; width:100%; height:260px;">
                <canvas id="chart-activity-trend"></canvas>
              </div>
            </div>
          </div>

          <!-- SECTION 5: STUDENT ATTENDANCE & TUITION BREAKDOWN TABLE (NEW) -->
          <div class="card" style="margin-bottom:28px;">
            <div style="display:flex; align-items:center; justify-content:space-between; flex-wrap:wrap; gap:12px; margin-bottom:16px;">
              <div>
                <h3 style="font-family:var(--font-heading); font-size:16px; font-weight:700; color:#0f172a; margin:0 0 4px 0;">
                  <i class="fa-solid fa-user-check" style="color:#0284c7; margin-right:8px;"></i>
                  Thống Kê Điểm Danh & Học Phí Từng Học Sinh
                </h3>
                <p style="font-size:13px; color:#64748b; margin:0;">Chi tiết số buổi đã học, số buổi đã đóng tiền và công nợ học phí theo từng tháng hoặc tổng tất cả.</p>
              </div>
            </div>

            <!-- Filter Controls -->
            <div style="display:flex; gap:12px; flex-wrap:wrap; align-items:center; background:#f8fafc; padding:14px; border-radius:10px; border:1px solid #e2e8f0; margin-bottom:18px;">
              <div style="flex:1; min-width:200px;">
                <input type="text" id="dash-stu-search" class="form-input" placeholder="Tìm theo tên học sinh, username..." style="padding:8px 12px; font-size:13px; height:38px; border-radius:8px; background:#ffffff;">
              </div>
              <div style="min-width:180px;">
                <select id="dash-stu-filter-month" class="form-input" style="padding:8px 12px; font-size:13px; height:38px; border-radius:8px; background:#ffffff;">
                  <option value="all">📅 Tất cả các tháng (Tổng lũy kế)</option>
                  ${monthlyStats.map(m => `<option value="${m.month}">📅 ${m.label || m.month}</option>`).join('')}
                </select>
              </div>
              <div style="min-width:160px;">
                <select id="dash-stu-filter-class" class="form-input" style="padding:8px 12px; font-size:13px; height:38px; border-radius:8px; background:#ffffff;">
                  <option value="all">🏫 Tất cả lớp học</option>
                  ${classOptions.map(cls => `<option value="${cls}">${cls}</option>`).join('')}
                </select>
              </div>
              <div style="min-width:160px;">
                <select id="dash-stu-filter-status" class="form-input" style="padding:8px 12px; font-size:13px; height:38px; border-radius:8px; background:#ffffff;">
                  <option value="all">🏷️ Tất cả trạng thái</option>
                  <option value="paid">✅ Đã đóng đủ</option>
                  <option value="unpaid">⚠️ Còn nợ học phí</option>
                  <option value="no_sessions">⚪ Chưa có buổi học</option>
                </select>
              </div>
            </div>

            <!-- Filtered KPI Summary Banner -->
            <div id="dash-stu-kpi-summary" style="display:grid; grid-template-columns:repeat(auto-fit, minmax(180px, 1fr)); gap:12px; margin-bottom:16px;">
              <!-- Dynamic content updated in JS -->
            </div>

            <!-- Student Attendance Table Container -->
            <div class="table-responsive">
              <table class="data-table" style="font-size:13px;">
                <thead>
                  <tr>
                    <th>Học sinh</th>
                    <th>Lớp học</th>
                    <th style="text-align:center;">Số buổi đã học</th>
                    <th style="text-align:center;">Đã đóng tiền</th>
                    <th style="text-align:center;">Chưa đóng / Nợ</th>
                    <th style="text-align:right;">Học phí phát sinh</th>
                    <th style="text-align:right;">Đã thanh toán</th>
                    <th style="text-align:right;">Còn nợ</th>
                    <th style="text-align:center;">Trạng thái</th>
                    <th style="text-align:right;">Thao tác</th>
                  </tr>
                </thead>
                <tbody id="dash-stu-table-body">
                  <!-- Rendered dynamically -->
                </tbody>
              </table>
            </div>

            <!-- Pagination Container -->
            <div id="dash-stu-pagination" style="display:flex; justify-content:space-between; align-items:center; margin-top:16px; padding-top:12px; border-top:1px solid #e2e8f0;">
              <!-- Rendered dynamically -->
            </div>
          </div>

          <!-- SECTION 6: DETAILED MONTHLY BREAKDOWN TABLE -->
          <div class="card" style="margin-bottom:28px;">
            <div style="display:flex; align-items:center; justify-content:space-between; flex-wrap:wrap; gap:12px; margin-bottom:18px;">
              <div>
                <h3 style="font-family:var(--font-heading); font-size:16px; font-weight:700; color:#0f172a; margin:0 0 4px 0;">
                  <i class="fa-solid fa-table-list" style="color:#0284c7; margin-right:8px;"></i>
                  Bảng Thống Kê Chi Tiết Theo Từng Tháng
                </h3>
                <p style="font-size:13px; color:#64748b; margin:0;">Số liệu tổng hợp buổi dạy, lượt nộp bài, doanh thu phát sinh và tỷ lệ thu hồi học phí.</p>
              </div>
            </div>

            ${monthlyStats.length > 0 ? `
              <div class="table-responsive">
                <table class="data-table" style="font-size:13px;">
                  <thead>
                    <tr>
                      <th>Tháng</th>
                      <th>Số buổi dạy</th>
                      <th>Lượt nộp bài</th>
                      <th>Tổng học phí</th>
                      <th>Học phí đã đóng</th>
                      <th>Học phí còn nợ</th>
                      <th style="min-width:140px;">Tiến độ thu</th>
                    </tr>
                  </thead>
                  <tbody>
                    ${monthlyStats.map(m => {
                      const unpaid = m.unpaidTuitionFee !== undefined ? m.unpaidTuitionFee : (m.tuitionFee - m.paidTuitionFee)
                      const pct = m.tuitionFee > 0 ? Math.round((m.paidTuitionFee / m.tuitionFee) * 100) : 0
                      const subCount = m.submissionCount || 0
                      return `
                        <tr>
                          <td style="font-weight:700; color:#0f172a;">${m.label || m.month}</td>
                          <td>
                            <span style="background:#fef3c7; color:#b45309; padding:3px 10px; border-radius:12px; font-weight:700; font-size:12px;">
                              ${m.sessionCount} buổi
                            </span>
                          </td>
                          <td>
                            <span style="background:#eff6ff; color:#1d4ed8; padding:3px 10px; border-radius:12px; font-weight:700; font-size:12px;">
                              ${subCount} bài
                            </span>
                          </td>
                          <td style="font-weight:700; color:#3730a3;">${(m.tuitionFee || 0).toLocaleString('vi-VN')} VND</td>
                          <td style="font-weight:700; color:#059669;">${(m.paidTuitionFee || 0).toLocaleString('vi-VN')} VND</td>
                          <td style="font-weight:700; color:#dc2626;">${(unpaid || 0).toLocaleString('vi-VN')} VND</td>
                          <td>
                            <div style="display:flex; align-items:center; gap:8px;">
                              <div style="flex:1; background:#e2e8f0; height:8px; border-radius:4px; overflow:hidden;">
                                <div style="width:${pct}%; background:#10b981; height:100%;"></div>
                              </div>
                              <span style="font-weight:700; font-size:12px; color:#334155; min-width:36px;">${pct}%</span>
                            </div>
                          </td>
                        </tr>
                      `
                    }).join('')}
                  </tbody>
                </table>
              </div>
            ` : `
              <div style="text-align:center; padding:32px; color:#64748b; font-size:13px;">
                <i class="fa-solid fa-calendar-xmark" style="font-size:32px; color:#cbd5e1; margin-bottom:10px; display:block;"></i>
                Chưa có dữ liệu thống kê tháng trong hệ thống. Dữ liệu sẽ tự động xuất hiện khi có buổi học và học phí.
              </div>
            `}
          </div>

          <!-- SECTION 7: RECENT SUBMISSIONS FEED -->
          <div class="card">
            <div style="display:flex; align-items:center; justify-content:space-between; margin-bottom:18px;">
              <div>
                <h3 style="font-family:var(--font-heading); font-size:16px; font-weight:700; color:#0f172a; margin:0 0 4px 0;">
                  <i class="fa-solid fa-clock-rotate-left" style="color:#4338ca; margin-right:8px;"></i>
                  Lượt Nộp Bài Gần Đây
                </h3>
                <p style="font-size:13px; color:#64748b; margin:0;">10 bài tập được học sinh nộp mới nhất trong hệ thống.</p>
              </div>
              <button class="btn-secondary" onclick="window.location.hash='#homework'" style="font-size:12px; padding:6px 12px;">
                Xem tất cả bài tập
              </button>
            </div>
            
            <div class="table-responsive">
              <table class="data-table">
                <thead>
                  <tr>
                    <th>Học sinh</th>
                    <th>Tên bài tập</th>
                    <th>Điểm số</th>
                    <th>Thời gian nộp</th>
                    <th>Hành động</th>
                  </tr>
                </thead>
                <tbody>
                  ${recentSubmissions.map((sub) => {
                    const initials = getInitials(sub.studentName)
                    const avatarColor = getAvatarColor(sub.studentName)
                    const scoreNum = Number(sub.score || 0)
                    let scoreBadge = 'score-fail'
                    if (scoreNum >= 8.0) scoreBadge = 'score-high'
                    else if (scoreNum >= 5.0) scoreBadge = 'score-pass'

                    return `
                    <tr>
                      <td>
                        <div style="display:flex; align-items:center; gap:10px;">
                          <div class="avatar-chip" style="background:${avatarColor};">
                            ${initials}
                          </div>
                          <div>
                            <div style="font-weight:700; color:#0f172a;">${sub.studentName}</div>
                            <div style="font-size:12px; color:#64748b;">@${sub.username}</div>
                          </div>
                        </div>
                      </td>
                      <td>
                        <div style="font-weight:600; color:#334155; margin-bottom:2px;">
                          ${sub.homeworkTitle}
                        </div>
                        ${(sub.isLate || sub.is_late) ? `
                          <span style="background:#fef3c7; color:#d97706; border:1px solid #fde68a; padding:2px 7px; border-radius:4px; font-size:11px; font-weight:700; display:inline-flex; align-items:center; gap:4px;">
                            <i class="fa-solid fa-clock"></i> Nộp muộn
                          </span>
                        ` : `
                          <span style="background:#dcfce7; color:#15803d; border:1px solid #bbf7d0; padding:2px 7px; border-radius:4px; font-size:11px; font-weight:700; display:inline-flex; align-items:center; gap:4px;">
                            <i class="fa-solid fa-check"></i> Đúng hạn
                          </span>
                        `}
                      </td>
                      <td>
                        <span class="score-badge ${scoreBadge}">
                          ${scoreNum.toFixed(1)} / ${sub.maxScore || 10}
                        </span>
                      </td>
                      <td style="color:#64748b; font-size:13px;">
                        <i class="fa-regular fa-clock" style="margin-right:4px;"></i>
                        ${new Date(sub.submittedAt).toLocaleString('vi-VN')}
                      </td>
                      <td>
                        <button class="btn-secondary" onclick="window.location.hash='#assignment-review?submissionId=${sub.submissionId}'" style="padding:6px 12px; font-size:12px; font-weight:600;">
                          <i class="fa-solid fa-eye" style="margin-right:4px;"></i> Xem lại bài
                        </button>
                      </td>
                    </tr>
                  `}).join('') || `
                    <tr>
                      <td colspan="5" style="text-align:center; color:#64748b; padding:32px;">
                        <i class="fa-regular fa-folder-open" style="font-size:32px; color:#cbd5e1; margin-bottom:8px; display:block;"></i>
                        Chưa có lượt nộp bài nào gần đây
                      </td>
                    </tr>
                  `}
                </tbody>
              </table>
            </div>
          </div>

        </div>
      </div>
    </div>
  `
}

function renderStudentAttendanceTable() {
  const allStudents = state.dashboard?.studentAttendanceStats || []
  const selectedMonth = studentFilterState.selectedMonth
  const selectedClass = studentFilterState.selectedClass
  const selectedStatus = studentFilterState.selectedStatus
  const searchQuery = studentFilterState.searchQuery.toLowerCase().trim()

  // Filter students
  const filtered = allStudents.filter(s => {
    // Search query
    if (searchQuery) {
      const matchName = s.fullName && s.fullName.toLowerCase().includes(searchQuery)
      const matchUser = s.username && s.username.toLowerCase().includes(searchQuery)
      if (!matchName && !matchUser) return false
    }

    // Class filter
    if (selectedClass !== 'all') {
      if (!s.classNames || !s.classNames.includes(selectedClass)) return false
    }

    // Month & Status filter
    const stats = selectedMonth === 'all'
      ? s.total
      : (s.monthly && s.monthly[selectedMonth] ? s.monthly[selectedMonth] : { attendedSessions: 0, paidSessions: 0, unpaidSessions: 0, tuitionFee: 0, paidTuitionFee: 0, unpaidTuitionFee: 0 })

    if (selectedStatus === 'paid') {
      if (stats.attendedSessions === 0 || stats.unpaidSessions > 0) return false
    } else if (selectedStatus === 'unpaid') {
      if (stats.unpaidSessions <= 0) return false
    } else if (selectedStatus === 'no_sessions') {
      if (stats.attendedSessions > 0) return false
    }

    return true
  })

  // Calculate filtered KPI Summary
  let totalAttended = 0
  let totalPaid = 0
  let totalUnpaid = 0
  let totalTuition = 0
  let totalPaidFee = 0
  let totalUnpaidFee = 0

  filtered.forEach(s => {
    const stats = selectedMonth === 'all'
      ? s.total
      : (s.monthly && s.monthly[selectedMonth] ? s.monthly[selectedMonth] : { attendedSessions: 0, paidSessions: 0, unpaidSessions: 0, tuitionFee: 0, paidTuitionFee: 0, unpaidTuitionFee: 0 })
    
    totalAttended += (stats.attendedSessions || 0)
    totalPaid += (stats.paidSessions || 0)
    totalUnpaid += (stats.unpaidSessions || 0)
    totalTuition += (stats.tuitionFee || 0)
    totalPaidFee += (stats.paidTuitionFee || 0)
    totalUnpaidFee += (stats.unpaidTuitionFee || 0)
  })

  // Render KPI Summary
  const kpiContainer = document.getElementById('dash-stu-kpi-summary')
  if (kpiContainer) {
    kpiContainer.innerHTML = `
      <div style="background:#eff6ff; border:1px solid #bfdbfe; border-radius:8px; padding:10px 14px;">
        <div style="font-size:11px; font-weight:700; color:#1e40af; text-transform:uppercase;">Học sinh hiển thị</div>
        <div style="font-size:18px; font-weight:800; color:#1d4ed8; margin-top:2px;">${filtered.length} <span style="font-size:12px; font-weight:600; color:#64748b;">học sinh</span></div>
      </div>
      <div style="background:#fef3c7; border:1px solid #fde68a; border-radius:8px; padding:10px 14px;">
        <div style="font-size:11px; font-weight:700; color:#92400e; text-transform:uppercase;">Tổng buổi đã học</div>
        <div style="font-size:18px; font-weight:800; color:#b45309; margin-top:2px;">${totalAttended} <span style="font-size:12px; font-weight:600; color:#64748b;">buổi</span></div>
      </div>
      <div style="background:#ecfdf5; border:1px solid #a7f3d0; border-radius:8px; padding:10px 14px;">
        <div style="font-size:11px; font-weight:700; color:#065f46; text-transform:uppercase;">Buổi đã đóng / Tỷ lệ</div>
        <div style="font-size:18px; font-weight:800; color:#059669; margin-top:2px;">${totalPaid} / ${totalAttended} <span style="font-size:12px; font-weight:600; color:#10b981;">(${totalAttended > 0 ? Math.round((totalPaid / totalAttended) * 100) : 100}%)</span></div>
      </div>
      <div style="background:#f1f5f9; border:1px solid #e2e8f0; border-radius:8px; padding:10px 14px;">
        <div style="font-size:11px; font-weight:700; color:#475569; text-transform:uppercase;">Học phí phát sinh</div>
        <div style="font-size:16px; font-weight:800; color:#334155; margin-top:2px;">${totalTuition.toLocaleString('vi-VN')} đ</div>
      </div>
      <div style="background:#ecfdf5; border:1px solid #a7f3d0; border-radius:8px; padding:10px 14px;">
        <div style="font-size:11px; font-weight:700; color:#065f46; text-transform:uppercase;">Đã thu</div>
        <div style="font-size:16px; font-weight:800; color:#059669; margin-top:2px;">${totalPaidFee.toLocaleString('vi-VN')} đ</div>
      </div>
      <div style="background:#fff1f2; border:1px solid #fecdd3; border-radius:8px; padding:10px 14px;">
        <div style="font-size:11px; font-weight:700; color:#9f1239; text-transform:uppercase;">Còn nợ</div>
        <div style="font-size:16px; font-weight:800; color:#e11d48; margin-top:2px;">${totalUnpaidFee.toLocaleString('vi-VN')} đ</div>
      </div>
    `
  }

  // Pagination calculation
  const totalPages = Math.max(1, Math.ceil(filtered.length / studentFilterState.pageSize))
  if (studentFilterState.currentPage > totalPages) {
    studentFilterState.currentPage = totalPages
  }
  const fromIndex = (studentFilterState.currentPage - 1) * studentFilterState.pageSize
  const pagedStudents = filtered.slice(fromIndex, fromIndex + studentFilterState.pageSize)

  // Render Table Body
  const tbody = document.getElementById('dash-stu-table-body')
  if (tbody) {
    if (pagedStudents.length === 0) {
      tbody.innerHTML = `
        <tr>
          <td colspan="10" style="text-align:center; padding:32px; color:#64748b;">
            <i class="fa-solid fa-user-slash" style="font-size:28px; color:#cbd5e1; margin-bottom:8px; display:block;"></i>
            Không tìm thấy học sinh nào phù hợp với bộ lọc hiện tại.
          </td>
        </tr>
      `
    } else {
      tbody.innerHTML = pagedStudents.map((s, idx) => {
        const initials = getInitials(s.fullName)
        const avatarColor = getAvatarColor(s.fullName)

        const stats = selectedMonth === 'all'
          ? s.total
          : (s.monthly && s.monthly[selectedMonth] ? s.monthly[selectedMonth] : { attendedSessions: 0, paidSessions: 0, unpaidSessions: 0, tuitionFee: 0, paidTuitionFee: 0, unpaidTuitionFee: 0 })

        const attended = stats.attendedSessions || 0
        const paid = stats.paidSessions || 0
        const unpaid = stats.unpaidSessions || 0
        const fee = stats.tuitionFee || 0
        const paidFee = stats.paidTuitionFee || 0
        const unpaidFee = stats.unpaidTuitionFee !== undefined ? stats.unpaidTuitionFee : (fee - paidFee)

        let statusBadge = ''
        if (attended === 0) {
          statusBadge = `<span style="background:#f1f5f9; color:#64748b; padding:3px 8px; border-radius:12px; font-size:11px; font-weight:700;">Chưa học</span>`
        } else if (unpaid === 0) {
          statusBadge = `<span style="background:#dcfce7; color:#15803d; border:1px solid #bbf7d0; padding:3px 8px; border-radius:12px; font-size:11px; font-weight:700;"><i class="fa-solid fa-check"></i> Đã đóng đủ</span>`
        } else if (paid > 0) {
          statusBadge = `<span style="background:#fef3c7; color:#b45309; border:1px solid #fde68a; padding:3px 8px; border-radius:12px; font-size:11px; font-weight:700;"><i class="fa-solid fa-circle-half-stroke"></i> Đóng 1 phần</span>`
        } else {
          statusBadge = `<span style="background:#fee2e2; color:#b91c1c; border:1px solid #fecaca; padding:3px 8px; border-radius:12px; font-size:11px; font-weight:700;"><i class="fa-solid fa-triangle-exclamation"></i> Chưa đóng</span>`
        }

        return `
          <tr>
            <td>
              <div style="display:flex; align-items:center; gap:10px;">
                <div class="avatar-chip" style="background:${avatarColor}; width:34px; height:34px; font-size:12px;">
                  ${initials}
                </div>
                <div>
                  <div style="font-weight:700; color:#0f172a;">${s.fullName}</div>
                  <div style="font-size:12px; color:#64748b;">@${s.username}</div>
                </div>
              </div>
            </td>
            <td>
              <div style="font-weight:600; color:#334155; max-width:180px; overflow:hidden; text-overflow:ellipsis; white-space:nowrap;" title="${s.className}">
                ${s.className || 'Chưa vào lớp'}
              </div>
            </td>
            <td style="text-align:center;">
              <span style="background:#fef3c7; color:#b45309; padding:4px 10px; border-radius:12px; font-weight:700; font-size:12px; display:inline-block;">
                ${attended} buổi
              </span>
            </td>
            <td style="text-align:center;">
              <span style="background:#dcfce7; color:#15803d; padding:4px 10px; border-radius:12px; font-weight:700; font-size:12px; display:inline-block;">
                ${paid} buổi
              </span>
            </td>
            <td style="text-align:center;">
              ${unpaid > 0 ? `
                <span style="background:#fee2e2; color:#b91c1c; padding:4px 10px; border-radius:12px; font-weight:700; font-size:12px; display:inline-block;">
                  ${unpaid} buổi
                </span>
              ` : `
                <span style="color:#94a3b8; font-weight:600; font-size:12px;">0 buổi</span>
              `}
            </td>
            <td style="text-align:right; font-weight:700; color:#334155;">
              ${fee.toLocaleString('vi-VN')} đ
            </td>
            <td style="text-align:right; font-weight:700; color:#059669;">
              ${paidFee.toLocaleString('vi-VN')} đ
            </td>
            <td style="text-align:right; font-weight:700; color:${unpaidFee > 0 ? '#dc2626' : '#94a3b8'};">
              ${unpaidFee.toLocaleString('vi-VN')} đ
            </td>
            <td style="text-align:center;">
              ${statusBadge}
            </td>
            <td style="text-align:right;">
              <a href="#student-details?studentId=${s.studentId}" class="btn-secondary" style="padding:4px 10px; font-size:12px; font-weight:600; display:inline-flex; align-items:center; gap:4px; text-decoration:none;">
                <i class="fa-solid fa-circle-user"></i> Chi tiết
              </a>
            </td>
          </tr>
        `
      }).join('')
    }
  }

  // Render Pagination Controls
  const paginationContainer = document.getElementById('dash-stu-pagination')
  if (paginationContainer) {
    if (filtered.length === 0) {
      paginationContainer.innerHTML = ''
    } else {
      paginationContainer.innerHTML = `
        <div style="font-size:12px; font-weight:600; color:#64748b;">
          Hiển thị <strong>${fromIndex + 1}</strong> - <strong>${Math.min(fromIndex + studentFilterState.pageSize, filtered.length)}</strong> trong tổng số <strong>${filtered.length}</strong> học sinh
        </div>
        <div style="display:flex; gap:6px; align-items:center;">
          <button id="dash-stu-prev-page" class="btn-secondary" style="padding:4px 10px; font-size:12px;" ${studentFilterState.currentPage <= 1 ? 'disabled' : ''}>
            <i class="fa-solid fa-chevron-left"></i> Trước
          </button>
          <span style="font-size:12px; font-weight:700; color:#334155; padding:0 8px;">
            Trang ${studentFilterState.currentPage} / ${totalPages}
          </span>
          <button id="dash-stu-next-page" class="btn-secondary" style="padding:4px 10px; font-size:12px;" ${studentFilterState.currentPage >= totalPages ? 'disabled' : ''}>
            Sau <i class="fa-solid fa-chevron-right"></i>
          </button>
        </div>
      `

      document.getElementById('dash-stu-prev-page')?.addEventListener('click', () => {
        if (studentFilterState.currentPage > 1) {
          studentFilterState.currentPage--
          renderStudentAttendanceTable()
        }
      })

      document.getElementById('dash-stu-next-page')?.addEventListener('click', () => {
        if (studentFilterState.currentPage < totalPages) {
          studentFilterState.currentPage++
          renderStudentAttendanceTable()
        }
      })
    }
  }
}

export function bindAdminDashboardEvents() {
  bindSidebarEvents()

  // Initial render of Student Attendance & Tuition Table
  renderStudentAttendanceTable()

  // Bind Student Attendance Table Filter Events
  const searchInput = document.getElementById('dash-stu-search')
  searchInput?.addEventListener('input', (e) => {
    studentFilterState.searchQuery = e.target.value
    studentFilterState.currentPage = 1
    renderStudentAttendanceTable()
  })

  const monthSelect = document.getElementById('dash-stu-filter-month')
  monthSelect?.addEventListener('change', (e) => {
    studentFilterState.selectedMonth = e.target.value
    studentFilterState.currentPage = 1
    renderStudentAttendanceTable()
  })

  const classSelect = document.getElementById('dash-stu-filter-class')
  classSelect?.addEventListener('change', (e) => {
    studentFilterState.selectedClass = e.target.value
    studentFilterState.currentPage = 1
    renderStudentAttendanceTable()
  })

  const statusSelect = document.getElementById('dash-stu-filter-status')
  statusSelect?.addEventListener('change', (e) => {
    studentFilterState.selectedStatus = e.target.value
    studentFilterState.currentPage = 1
    renderStudentAttendanceTable()
  })

  setTimeout(() => {
    if (!window.Chart) return

    const overview = state.dashboard?.overview || {}
    let monthlyStats = state.dashboard?.monthlyStats || []
    const scoreDistribution = state.dashboard?.scoreDistribution || {
      excellent: 0, good: 0, fair: 0, average: 0, poor: 0
    }

    // Default mock months if empty to ensure clean rendering
    if (monthlyStats.length === 0) {
      const now = new Date()
      monthlyStats = []
      for (let i = 5; i >= 0; i--) {
        const d = new Date(now.getFullYear(), now.getMonth() - i, 1)
        const mStr = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`
        const label = `Tháng ${String(d.getMonth() + 1).padStart(2, '0')}/${d.getFullYear()}`
        monthlyStats.push({
          month: mStr,
          label,
          sessionCount: 0,
          submissionCount: 0,
          tuitionFee: 0,
          paidTuitionFee: 0,
          unpaidTuitionFee: 0,
          studentSessionCount: 0
        })
      }
    }

    const monthLabels = monthlyStats.map(m => m.label || m.month)
    const paidTuitionData = monthlyStats.map(m => m.paidTuitionFee || 0)
    const unpaidTuitionData = monthlyStats.map(m => m.unpaidTuitionFee !== undefined ? m.unpaidTuitionFee : ((m.tuitionFee || 0) - (m.paidTuitionFee || 0)))
    const sessionData = monthlyStats.map(m => m.sessionCount || 0)
    const submissionData = monthlyStats.map(m => m.submissionCount || 0)

    // ==========================================================
    // CHART 1: MONTHLY REVENUE BAR CHART (Đã thu vs Chưa thu)
    // ==========================================================
    const canvasRevenue = document.getElementById('chart-monthly-revenue')
    if (canvasRevenue) {
      const existing = window.Chart.getChart(canvasRevenue)
      if (existing) existing.destroy()

      new window.Chart(canvasRevenue.getContext('2d'), {
        type: 'bar',
        data: {
          labels: monthLabels,
          datasets: [
            {
              label: 'Đã thu (VND)',
              data: paidTuitionData,
              backgroundColor: '#10b981',
              borderRadius: 6,
              barPercentage: 0.65,
              categoryPercentage: 0.7
            },
            {
              label: 'Chưa thu (VND)',
              data: unpaidTuitionData,
              backgroundColor: '#ef4444',
              borderRadius: 6,
              barPercentage: 0.65,
              categoryPercentage: 0.7
            }
          ]
        },
        options: {
          responsive: true,
          maintainAspectRatio: false,
          plugins: {
            legend: { display: false },
            tooltip: {
              callbacks: {
                label: (ctx) => `${ctx.dataset.label}: ${(ctx.parsed.y || 0).toLocaleString('vi-VN')} VND`
              }
            }
          },
          scales: {
            x: {
              grid: { display: false }
            },
            y: {
              beginAtZero: true,
              ticks: {
                callback: (val) => {
                  if (val >= 1e6) return (val / 1e6).toFixed(1) + ' tr'
                  if (val >= 1e3) return (val / 1e3).toFixed(0) + ' k'
                  return val
                }
              }
            }
          }
        }
      })
    }

    // ==========================================================
    // CHART 2: TUITION DOUGHNUT COLLECTION RATE (Tỷ lệ thu học phí)
    // ==========================================================
    const canvasDoughnut = document.getElementById('chart-tuition-doughnut')
    if (canvasDoughnut) {
      const existing = window.Chart.getChart(canvasDoughnut)
      if (existing) existing.destroy()

      const totalPaid = overview.totalPaidTuitionFee || 0
      const totalUnpaid = overview.totalUnpaidTuitionFee || 0
      const hasData = (totalPaid + totalUnpaid) > 0

      new window.Chart(canvasDoughnut.getContext('2d'), {
        type: 'doughnut',
        data: {
          labels: ['Đã thu', 'Chưa thu'],
          datasets: [
            {
              data: hasData ? [totalPaid, totalUnpaid] : [1, 0],
              backgroundColor: hasData ? ['#10b981', '#ef4444'] : ['#e2e8f0', '#cbd5e1'],
              borderWidth: 2,
              borderColor: '#ffffff',
              hoverOffset: 4
            }
          ]
        },
        options: {
          responsive: true,
          maintainAspectRatio: false,
          cutout: '72%',
          plugins: {
            legend: {
              position: 'bottom',
              labels: {
                boxWidth: 12,
                font: { size: 12, weight: '600' },
                padding: 12
              }
            },
            tooltip: {
              callbacks: {
                label: (ctx) => {
                  if (!hasData) return 'Chưa có số liệu'
                  const val = ctx.parsed || 0
                  return `${ctx.label}: ${val.toLocaleString('vi-VN')} VND`
                }
              }
            }
          }
        }
      })
    }

    // ==========================================================
    // CHART 3: GRADE DISTRIBUTION DOUGHNUT (Phổ điểm học sinh)
    // ==========================================================
    const canvasGrade = document.getElementById('chart-grade-dist')
    if (canvasGrade) {
      const existing = window.Chart.getChart(canvasGrade)
      if (existing) existing.destroy()

      const gradeCounts = [
        scoreDistribution.excellent || 0,
        scoreDistribution.good || 0,
        scoreDistribution.fair || 0,
        scoreDistribution.average || 0,
        scoreDistribution.poor || 0
      ]
      const totalGraded = gradeCounts.reduce((a, b) => a + b, 0)

      new window.Chart(canvasGrade.getContext('2d'), {
        type: 'doughnut',
        data: {
          labels: [
            'Xuất sắc (9 - 10)',
            'Giỏi (8 - 8.9)',
            'Khá (6.5 - 7.9)',
            'Trung bình (5 - 6.4)',
            'Cần cố gắng (< 5)'
          ],
          datasets: [
            {
              data: totalGraded > 0 ? gradeCounts : [0, 0, 0, 0, 1],
              backgroundColor: totalGraded > 0
                ? ['#10b981', '#3b82f6', '#8b5cf6', '#f59e0b', '#ef4444']
                : ['#e2e8f0'],
              borderWidth: 2,
              borderColor: '#ffffff'
            }
          ]
        },
        options: {
          responsive: true,
          maintainAspectRatio: false,
          cutout: '65%',
          plugins: {
            legend: {
              position: 'right',
              labels: {
                boxWidth: 12,
                font: { size: 12, weight: '500' },
                padding: 10
              }
            },
            tooltip: {
              callbacks: {
                label: (ctx) => {
                  if (totalGraded === 0) return 'Chưa có bài nộp'
                  const val = ctx.parsed || 0
                  const pct = Math.round((val / totalGraded) * 100)
                  return `${ctx.label}: ${val} học sinh (${pct}%)`
                }
              }
            }
          }
        }
      })
    }

    // ==========================================================
    // CHART 4: TEACHING SESSIONS TREND (Số buổi dạy & Đường cong)
    // ==========================================================
    const canvasActivity = document.getElementById('chart-activity-trend')
    if (canvasActivity) {
      const existing = window.Chart.getChart(canvasActivity)
      if (existing) existing.destroy()

      new window.Chart(canvasActivity.getContext('2d'), {
        type: 'bar',
        data: {
          labels: monthLabels,
          datasets: [
            {
              type: 'line',
              label: 'Đường xu hướng',
              data: sessionData,
              borderColor: '#0284c7',
              borderWidth: 2.5,
              cubicInterpolationMode: 'monotone',
              tension: 0.3,
              fill: false,
              pointBackgroundColor: '#0284c7',
              pointBorderColor: '#ffffff',
              pointBorderWidth: 2,
              pointRadius: 5,
              pointHoverRadius: 7,
              order: 1
            },
            {
              type: 'bar',
              label: 'Số buổi dạy',
              data: sessionData,
              backgroundColor: '#f59e0b',
              hoverBackgroundColor: '#d97706',
              borderRadius: 6,
              barPercentage: 0.5,
              categoryPercentage: 0.65,
              order: 2
            }
          ]
        },
        options: {
          responsive: true,
          maintainAspectRatio: false,
          interaction: {
            mode: 'index',
            intersect: false
          },
          plugins: {
            legend: { display: false },
            tooltip: {
              callbacks: {
                label: (ctx) => `Số buổi dạy: ${ctx.parsed.y} buổi`
              },
              filter: (item) => item.datasetIndex === 1
            }
          },
          scales: {
            x: {
              grid: { display: false }
            },
            y: {
              beginAtZero: true,
              grace: '15%',
              title: {
                display: true,
                text: 'Số buổi dạy',
                color: '#d97706',
                font: { size: 11, weight: 'bold' }
              },
              ticks: { precision: 0 }
            }
          }
        }
      })
    }
  }, 60)
}
