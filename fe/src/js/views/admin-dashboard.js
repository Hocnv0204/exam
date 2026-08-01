import { renderSidebar, bindSidebarEvents } from '../components/sidebar.js'
import { renderNavbar } from '../components/navbar.js'
import { state } from '../state.js'

export function renderAdminDashboardView() {
  const overview = state.dashboard?.overview || {
    totalStudents: 0,
    totalClasses: 0,
    totalHomeworks: 0,
    averageScore: 0
  }
  const recentSubmissions = state.dashboard?.recentSubmissions || []

  return `
    <div class="app-layout">
      ${renderSidebar('admin-dashboard')}
      <div class="main-content">
        ${renderNavbar('Nền tảng / Dashboard Quản trị viên')}
        <div class="content-body">
          <div class="page-header">
            <div>
              <h1 class="page-title">Dashboard Quản trị viên</h1>
              <p class="page-description">Thống kê thời gian thực, danh sách nộp bài gần đây và tổng quan hệ thống.</p>
            </div>
            <button class="btn-primary" onclick="window.location.hash='#create-homework'" style="width:auto;">
              <i class="fa-solid fa-plus"></i> Tạo bài tập về nhà mới
            </button>
          </div>

          <!-- Overview Stat Cards -->
          <div class="grid-4" style="margin-bottom:28px;">
            <div class="card" style="display:flex; align-items:center; gap:16px;">
              <div style="width:50px; height:50px; background:#e0f2fe; color:#0284c7; border-radius:12px; display:flex; align-items:center; justify-content:center; font-size:22px;">
                <i class="fa-solid fa-users"></i>
              </div>
              <div>
                <div style="font-size:12px; font-weight:700; color:#64748b; text-transform:uppercase;">Tổng học sinh</div>
                <div style="font-family:var(--font-heading); font-size:26px; font-weight:700; color:#0f172a;">${overview.totalStudents}</div>
              </div>
            </div>

            <div class="card" style="display:flex; align-items:center; gap:16px;">
              <div style="width:50px; height:50px; background:#e0f2fe; color:#0284c7; border-radius:12px; display:flex; align-items:center; justify-content:center; font-size:22px;">
                <i class="fa-solid fa-graduation-cap"></i>
              </div>
              <div>
                <div style="font-size:12px; font-weight:700; color:#64748b; text-transform:uppercase;">Tổng lớp học</div>
                <div style="font-family:var(--font-heading); font-size:26px; font-weight:700; color:#0f172a;">${overview.totalClasses}</div>
              </div>
            </div>

            <div class="card" style="display:flex; align-items:center; gap:16px;">
              <div style="width:50px; height:50px; background:#e0f2fe; color:#0284c7; border-radius:12px; display:flex; align-items:center; justify-content:center; font-size:22px;">
                <i class="fa-solid fa-book-open"></i>
              </div>
              <div>
                <div style="font-size:12px; font-weight:700; color:#64748b; text-transform:uppercase;">Tổng bài tập</div>
                <div style="font-family:var(--font-heading); font-size:26px; font-weight:700; color:#0f172a;">${overview.totalHomeworks}</div>
              </div>
            </div>

            <div class="card" style="display:flex; align-items:center; gap:16px;">
              <div style="width:50px; height:50px; background:#d1fae5; color:#047857; border-radius:12px; display:flex; align-items:center; justify-content:center; font-size:22px;">
                <i class="fa-solid fa-money-bill-wave"></i>
              </div>
              <div>
                <div style="font-size:12px; font-weight:700; color:#64748b; text-transform:uppercase;">Tổng học phí</div>
                <div style="font-family:var(--font-heading); font-size:20px; font-weight:800; color:#047857;">${(overview.totalTuitionFee || 0).toLocaleString('vi-VN')} VND</div>
              </div>
            </div>
          </div>

          <!-- Recent Submissions Card -->
          <div class="card">
            <h3 style="font-family:var(--font-heading); font-size:18px; font-weight:700; margin-bottom:16px;">Lượt nộp bài gần đây</h3>
            
            <div class="table-responsive">
              <table class="data-table">
                <thead>
                  <tr>
                    <th>Học sinh</th>
                    <th>Tên bài tập</th>
                    <th>Điểm số</th>
                    <th>Thời gian nộp</th>
                    <th>Thao tác</th>
                  </tr>
                </thead>
                <tbody>
                  ${recentSubmissions.map((sub) => `
                    <tr>
                      <td style="font-weight:700;">${sub.studentName} (@${sub.username})</td>
                      <td style="color:#64748b;">${sub.homeworkTitle}</td>
                      <td>
                        <span style="font-family:var(--font-heading); font-weight:700; color:${Number(sub.score) >= 5 ? '#0066cc' : '#ef4444'};">
                          ${sub.score}/${sub.maxScore}
                        </span>
                      </td>
                      <td style="color:#64748b;">${new Date(sub.submittedAt).toLocaleString('vi-VN')}</td>
                      <td>
                        <button class="btn-secondary" onclick="window.location.hash='#assignment-review'" style="padding:4px 10px; font-size:12px;">Xem lại</button>
                      </td>
                    </tr>
                  `).join('') || `<tr><td colspan="5" style="text-align:center; color:#64748b; padding:20px;">Chưa có lượt nộp bài nào</td></tr>`}
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
}
