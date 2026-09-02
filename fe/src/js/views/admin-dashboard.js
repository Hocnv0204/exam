import { renderSidebar, bindSidebarEvents } from '../components/sidebar.js'
import { renderNavbar } from '../components/navbar.js'
import { state } from '../state.js'

export function renderAdminDashboardView() {
  const overview = state.dashboard?.overview || {
    totalStudents: 0,
    totalClasses: 0,
    totalHomeworks: 0,
    totalTaughtSessions: 0,
    totalTuitionFee: 0,
    totalPaidTuitionFee: undefined,
    totalUnpaidTuitionFee: undefined,
    averageScore: 0
  }
  const monthlyStats = state.dashboard?.monthlyStats || []
  const recentSubmissions = state.dashboard?.recentSubmissions || []

  // Detect if backend Edge Function is running legacy response without totalPaidTuitionFee & monthlyStats
  const hasPaidInfo = overview.totalPaidTuitionFee !== undefined || (monthlyStats && monthlyStats.length > 0)
  
  const totalPaid = overview.totalPaidTuitionFee !== undefined
    ? overview.totalPaidTuitionFee
    : monthlyStats.reduce((acc, m) => acc + (m.paidTuitionFee || 0), 0)

  const totalTuition = overview.totalTuitionFee || 0
  const totalUnpaid = overview.totalUnpaidTuitionFee !== undefined
    ? overview.totalUnpaidTuitionFee
    : (totalTuition - totalPaid)

  return `
    <div class="app-layout">
      ${renderSidebar('admin-dashboard')}
      <div class="main-content">
        ${renderNavbar('Nền tảng / Dashboard Quản trị viên')}
        <div class="content-body">
          <div class="page-header">
            <div>
              <h1 class="page-title">Dashboard Quản trị viên</h1>
              <p class="page-description">Thống kê số buổi dạy của các lớp, học phí (Đã đóng, Chưa đóng & Tổng học phí) và lượt nộp bài.</p>
            </div>
            <button class="btn-primary" onclick="window.location.hash='#create-homework'" style="width:auto;">
              <i class="fa-solid fa-plus"></i> Tạo bài tập về nhà mới
            </button>
          </div>

          ${!hasPaidInfo ? `
            <div style="background:#fffbeb; border:1px solid #fde68a; color:#b45309; padding:12px 16px; border-radius:12px; margin-bottom:24px; font-size:13px; font-weight:600; display:flex; align-items:center; gap:10px;">
              <i class="fa-solid fa-triangle-exclamation" style="font-size:18px; color:#d97706;"></i>
              <div>
                <strong>Thông báo kết nối Backend:</strong> API Server Edge Function hiện tại chưa trả về trường <code>totalPaidTuitionFee</code> và <code>monthlyStats</code>. 
                Vui lòng đảm bảo Edge Function <code>dashboard</code> đã được khởi động lại/re-deploy phiên bản mới nhất.
              </div>
            </div>
          ` : ''}

          <!-- Overview Stat Cards Grid -->
          <div style="display:grid; grid-template-columns: repeat(auto-fit, minmax(210px, 1fr)); gap:18px; margin-bottom:28px;">
            <div class="card" style="display:flex; align-items:center; gap:14px; padding:16px 20px;">
              <div style="width:48px; height:48px; background:#e0f2fe; color:#0284c7; border-radius:12px; display:flex; align-items:center; justify-content:center; font-size:20px;">
                <i class="fa-solid fa-users"></i>
              </div>
              <div>
                <div style="font-size:11px; font-weight:700; color:#64748b; text-transform:uppercase;">Tổng học sinh</div>
                <div style="font-family:var(--font-heading); font-size:24px; font-weight:700; color:#0f172a;">${overview.totalStudents}</div>
              </div>
            </div>

            <div class="card" style="display:flex; align-items:center; gap:14px; padding:16px 20px;">
              <div style="width:48px; height:48px; background:#e0f2fe; color:#0284c7; border-radius:12px; display:flex; align-items:center; justify-content:center; font-size:20px;">
                <i class="fa-solid fa-graduation-cap"></i>
              </div>
              <div>
                <div style="font-size:11px; font-weight:700; color:#64748b; text-transform:uppercase;">Tổng lớp học</div>
                <div style="font-family:var(--font-heading); font-size:24px; font-weight:700; color:#0f172a;">${overview.totalClasses}</div>
              </div>
            </div>

            <div class="card" style="display:flex; align-items:center; gap:14px; padding:16px 20px;">
              <div style="width:48px; height:48px; background:#fef3c7; color:#d97706; border-radius:12px; display:flex; align-items:center; justify-content:center; font-size:20px;">
                <i class="fa-solid fa-chalkboard-user"></i>
              </div>
              <div>
                <div style="font-size:11px; font-weight:700; color:#64748b; text-transform:uppercase;">Tổng số buổi đã dạy</div>
                <div style="font-family:var(--font-heading); font-size:24px; font-weight:700; color:#0f172a;">${overview.totalTaughtSessions || 0} <span style="font-size:13px; font-weight:500; color:#64748b;">buổi</span></div>
              </div>
            </div>

            <div class="card" style="display:flex; align-items:center; gap:14px; padding:16px 20px;">
              <div style="width:48px; height:48px; background:#e0e7ff; color:#4338ca; border-radius:12px; display:flex; align-items:center; justify-content:center; font-size:20px;">
                <i class="fa-solid fa-wallet"></i>
              </div>
              <div>
                <div style="font-size:11px; font-weight:700; color:#64748b; text-transform:uppercase;">Tổng học phí phát sinh</div>
                <div style="font-family:var(--font-heading); font-size:20px; font-weight:800; color:#3730a3;">${totalTuition.toLocaleString('vi-VN')} VND</div>
              </div>
            </div>

            <div class="card" style="display:flex; align-items:center; gap:14px; padding:16px 20px;">
              <div style="width:48px; height:48px; background:#d1fae5; color:#047857; border-radius:12px; display:flex; align-items:center; justify-content:center; font-size:20px;">
                <i class="fa-solid fa-circle-check"></i>
              </div>
              <div>
                <div style="font-size:11px; font-weight:700; color:#64748b; text-transform:uppercase;">Học phí đã đóng</div>
                <div style="font-family:var(--font-heading); font-size:20px; font-weight:800; color:#047857;">
                  ${hasPaidInfo ? `${totalPaid.toLocaleString('vi-VN')} VND` : '<span style="font-size:13px; color:#64748b;">Chờ server...</span>'}
                </div>
              </div>
            </div>

            <div class="card" style="display:flex; align-items:center; gap:14px; padding:16px 20px;">
              <div style="width:48px; height:48px; background:#fee2e2; color:#b91c1c; border-radius:12px; display:flex; align-items:center; justify-content:center; font-size:20px;">
                <i class="fa-solid fa-clock-rotate-left"></i>
              </div>
              <div>
                <div style="font-size:11px; font-weight:700; color:#64748b; text-transform:uppercase;">Học phí chưa đóng</div>
                <div style="font-family:var(--font-heading); font-size:20px; font-weight:800; color:#b91c1c;">
                  ${hasPaidInfo ? `${totalUnpaid.toLocaleString('vi-VN')} VND` : '<span style="font-size:13px; color:#64748b;">Chờ server...</span>'}
                </div>
              </div>
            </div>
          </div>

          <!-- Monthly Tuition & Sessions Column Chart Section -->
          <div class="card" style="margin-bottom:28px;">
            <div style="display:flex; align-items:center; justify-content:space-between; flex-wrap:wrap; gap:12px; margin-bottom:20px;">
              <div>
                <h3 style="font-family:var(--font-heading); font-size:18px; font-weight:700; color:#0f172a; margin-bottom:4px;">
                  <i class="fa-solid fa-chart-column" style="color:#0284c7; margin-right:8px;"></i>
                  Biểu đồ cột Thống kê Học phí & Số buổi đã dạy theo tháng
                </h3>
                <p style="font-size:13px; color:#64748b; margin:0;">Biểu đồ cột so sánh Tổng học phí, Tiền đã đóng, Chưa đóng và Số buổi đã dạy của các lớp.</p>
              </div>
              <div style="display:flex; align-items:center; gap:16px; flex-wrap:wrap; font-size:12px; font-weight:600;">
                <span style="display:inline-flex; align-items:center; gap:6px;">
                  <span style="width:12px; height:12px; background-color:#3b82f6; border-radius:3px;"></span> Tổng học phí
                </span>
                <span style="display:inline-flex; align-items:center; gap:6px;">
                  <span style="width:12px; height:12px; background-color:#10b981; border-radius:3px;"></span> Đã đóng
                </span>
                <span style="display:inline-flex; align-items:center; gap:6px;">
                  <span style="width:12px; height:12px; background-color:#ef4444; border-radius:3px;"></span> Chưa đóng
                </span>
                <span style="display:inline-flex; align-items:center; gap:6px;">
                  <span style="width:12px; height:12px; background-color:#f59e0b; border-radius:3px;"></span> Số buổi dạy
                </span>
              </div>
            </div>

            <div style="position:relative; width:100%; min-height:320px;">
              <canvas id="dashboard-monthly-chart"></canvas>
            </div>

            <!-- Detailed Monthly Breakdown Table -->
            ${monthlyStats.length > 0 ? `
              <div style="margin-top:24px; border-top:1px solid #e2e8f0; padding-top:20px;">
                <h4 style="font-size:14px; font-weight:700; color:#334155; margin-bottom:12px;">Bảng thống kê chi tiết theo từng tháng</h4>
                <div class="table-responsive">
                  <table class="data-table" style="font-size:13px;">
                    <thead>
                      <tr>
                        <th>Tháng</th>
                        <th>Số buổi đã dạy</th>
                        <th>Tổng học phí phát sinh</th>
                        <th>Học phí đã đóng</th>
                        <th>Học phí chưa đóng</th>
                        <th>Tỷ lệ đã đóng</th>
                      </tr>
                    </thead>
                    <tbody>
                      ${monthlyStats.map(m => {
                        const unpaid = m.unpaidTuitionFee !== undefined ? m.unpaidTuitionFee : (m.tuitionFee - m.paidTuitionFee)
                        const pct = m.tuitionFee > 0 ? Math.round((m.paidTuitionFee / m.tuitionFee) * 100) : 0
                        return `
                          <tr>
                            <td style="font-weight:700; color:#0f172a;">${m.label || m.month}</td>
                            <td>
                              <span style="background:#fef3c7; color:#b45309; padding:3px 10px; border-radius:12px; font-weight:700;">
                                ${m.sessionCount} buổi
                              </span>
                            </td>
                            <td style="font-weight:700; color:#3730a3;">${(m.tuitionFee || 0).toLocaleString('vi-VN')} VND</td>
                            <td style="font-weight:700; color:#047857;">${(m.paidTuitionFee || 0).toLocaleString('vi-VN')} VND</td>
                            <td style="font-weight:700; color:#b91c1c;">${(unpaid || 0).toLocaleString('vi-VN')} VND</td>
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
              </div>
            ` : `
              <div style="text-align:center; padding:24px; color:#64748b; font-size:13px;">
                Chưa có dữ liệu thống kê buổi học theo tháng trong hệ thống.
              </div>
            `}
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
                  ${recentSubmissions.map((sub) => {
                    const totalQs = (sub.correctCount || 0) + (sub.wrongCount || 0)
                    const scoreDisplay = `${sub.score}/${sub.maxScore || 10}`
                    return `
                    <tr>
                      <td style="font-weight:700;">${sub.studentName} (@${sub.username})</td>
                      <td style="color:#64748b;">
                        ${sub.homeworkTitle}
                        ${(sub.isLate || sub.is_late) ? `
                          <span style="background:#fef3c7; color:#d97706; border:1px solid #fde68a; padding:2px 6px; border-radius:4px; font-size:10px; font-weight:700; margin-left:6px; display:inline-flex; align-items:center; gap:4px;">
                            <i class="fa-solid fa-clock-rotate-left"></i> Nộp muộn
                          </span>
                        ` : ''}
                      </td>
                      <td>
                        <span style="font-family:var(--font-heading); font-weight:700; color:${Number(sub.score) >= 5 ? '#0066cc' : '#ef4444'};">
                          ${scoreDisplay}
                        </span>
                      </td>
                      <td style="color:#64748b;">${new Date(sub.submittedAt).toLocaleString('vi-VN')}</td>
                      <td>
                        <button class="btn-secondary" onclick="window.location.hash='#assignment-review?submissionId=${sub.submissionId}'" style="padding:4px 10px; font-size:12px;">Xem lại</button>
                      </td>
                    </tr>
                  `}).join('') || `<tr><td colspan="5" style="text-align:center; color:#64748b; padding:20px;">Chưa có lượt nộp bài nào</td></tr>`}
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

  // Render Monthly Column Chart
  setTimeout(() => {
    const chartCanvas = document.getElementById('dashboard-monthly-chart')
    if (!chartCanvas || !window.Chart) return

    const existingChart = window.Chart.getChart(chartCanvas)
    if (existingChart) existingChart.destroy()

    let monthlyStats = state.dashboard?.monthlyStats || []

    // If no monthly stats from DB yet, generate preview months so chart renders cleanly
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
          tuitionFee: 0,
          paidTuitionFee: 0,
          unpaidTuitionFee: 0,
          studentSessionCount: 0
        })
      }
    }

    const labels = monthlyStats.map(m => m.label || m.month)
    const tuitionData = monthlyStats.map(m => m.tuitionFee || 0)
    const paidTuitionData = monthlyStats.map(m => m.paidTuitionFee || 0)
    const unpaidTuitionData = monthlyStats.map(m => m.unpaidTuitionFee !== undefined ? m.unpaidTuitionFee : ((m.tuitionFee || 0) - (m.paidTuitionFee || 0)))
    const sessionData = monthlyStats.map(m => m.sessionCount || 0)

    const ctx = chartCanvas.getContext('2d')
    new window.Chart(ctx, {
      type: 'bar',
      data: {
        labels: labels,
        datasets: [
          {
            label: 'Tổng học phí (VND)',
            data: tuitionData,
            backgroundColor: '#3b82f6',
            borderColor: '#2563eb',
            borderWidth: 1,
            borderRadius: 6,
            yAxisID: 'yTuition',
            order: 2
          },
          {
            label: 'Đã đóng (VND)',
            data: paidTuitionData,
            backgroundColor: '#10b981',
            borderColor: '#059669',
            borderWidth: 1,
            borderRadius: 6,
            yAxisID: 'yTuition',
            order: 3
          },
          {
            label: 'Chưa đóng (VND)',
            data: unpaidTuitionData,
            backgroundColor: '#ef4444',
            borderColor: '#dc2626',
            borderWidth: 1,
            borderRadius: 6,
            yAxisID: 'yTuition',
            order: 4
          },
          {
            label: 'Số buổi dạy (Buổi)',
            data: sessionData,
            backgroundColor: '#f59e0b',
            borderColor: '#d97706',
            borderWidth: 1,
            borderRadius: 6,
            yAxisID: 'ySessions',
            order: 1
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
          legend: {
            display: false
          },
          tooltip: {
            callbacks: {
              label: function(context) {
                let label = context.dataset.label || ''
                if (label) label += ': '
                if (context.dataset.yAxisID === 'yTuition') {
                  label += (context.parsed.y || 0).toLocaleString('vi-VN') + ' VND'
                } else {
                  label += (context.parsed.y || 0) + ' buổi'
                }
                return label
              }
            }
          }
        },
        scales: {
          x: {
            grid: {
              display: false
            }
          },
          yTuition: {
            type: 'linear',
            display: true,
            position: 'left',
            title: {
              display: true,
              text: 'Học phí (VND)',
              color: '#3b82f6',
              font: { weight: 'bold' }
            },
            ticks: {
              callback: function(value) {
                if (value >= 1e6) return (value / 1e6).toFixed(1) + ' tr'
                if (value >= 1e3) return (value / 1e3).toFixed(0) + ' k'
                return value
              }
            }
          },
          ySessions: {
            type: 'linear',
            display: true,
            position: 'right',
            title: {
              display: true,
              text: 'Số buổi dạy',
              color: '#d97706',
              font: { weight: 'bold' }
            },
            grid: {
              drawOnChartArea: false
            },
            ticks: {
              precision: 0,
              stepSize: 1
            }
          }
        }
      }
    })
  }, 50)
}


