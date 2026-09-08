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

            <!-- Activity Trends: Teaching Sessions & Submissions -->
            <div class="dash-chart-card">
              <div class="dash-chart-header">
                <div>
                  <h3 class="dash-chart-title">
                    <i class="fa-solid fa-chart-line" style="color:#f59e0b;"></i>
                    Xu Hướng Giảng Dạy & Nộp Bài
                  </h3>
                  <div class="dash-chart-desc">Số buổi đã dạy (cột) và lượt học sinh nộp bài (đường) theo tháng.</div>
                </div>
                <div style="display:flex; align-items:center; gap:12px; font-size:12px; font-weight:600;">
                  <span style="display:inline-flex; align-items:center; gap:6px;">
                    <span style="width:10px; height:10px; background-color:#f59e0b; border-radius:3px;"></span> Buổi dạy
                  </span>
                  <span style="display:inline-flex; align-items:center; gap:6px;">
                    <span style="width:10px; height:10px; background-color:#0284c7; border-radius:50%;"></span> Nộp bài
                  </span>
                </div>
              </div>
              <div style="position:relative; width:100%; height:260px;">
                <canvas id="chart-activity-trend"></canvas>
              </div>
            </div>
          </div>

          <!-- SECTION 5: DETAILED MONTHLY BREAKDOWN TABLE -->
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

          <!-- SECTION 6: RECENT SUBMISSIONS FEED -->
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

export function bindAdminDashboardEvents() {
  bindSidebarEvents()

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
                  return `${ctx.label}: ${val} bài (${pct}%)`
                }
              }
            }
          }
        }
      })
    }

    // ==========================================================
    // CHART 4: TEACHING & SUBMISSIONS TREND (Buổi dạy & Nộp bài)
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
              label: 'Lượt nộp bài',
              data: submissionData,
              borderColor: '#0284c7',
              backgroundColor: 'rgba(2, 132, 199, 0.08)',
              borderWidth: 3,
              tension: 0.35,
              fill: true,
              pointBackgroundColor: '#0284c7',
              pointRadius: 4,
              yAxisID: 'ySubmissions',
              order: 1
            },
            {
              type: 'bar',
              label: 'Số buổi dạy',
              data: sessionData,
              backgroundColor: '#f59e0b',
              borderRadius: 6,
              barPercentage: 0.5,
              yAxisID: 'ySessions',
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
                label: (ctx) => {
                  if (ctx.dataset.yAxisID === 'ySubmissions') {
                    return `Lượt nộp bài: ${ctx.parsed.y} lượt`
                  }
                  return `Số buổi dạy: ${ctx.parsed.y} buổi`
                }
              }
            }
          },
          scales: {
            x: {
              grid: { display: false }
            },
            ySessions: {
              type: 'linear',
              position: 'left',
              beginAtZero: true,
              title: {
                display: true,
                text: 'Buổi dạy',
                color: '#d97706',
                font: { size: 11, weight: 'bold' }
              },
              ticks: { precision: 0 }
            },
            ySubmissions: {
              type: 'linear',
              position: 'right',
              beginAtZero: true,
              title: {
                display: true,
                text: 'Lượt nộp',
                color: '#0284c7',
                font: { size: 11, weight: 'bold' }
              },
              grid: { drawOnChartArea: false },
              ticks: { precision: 0 }
            }
          }
        }
      })
    }
  }, 60)
}
