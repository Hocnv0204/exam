import { renderSidebar, bindSidebarEvents } from '../components/sidebar.js'
import { renderNavbar } from '../components/navbar.js'
import { state } from '../state.js'

export function renderLearningHistoryView() {
  const submissions = state.submissions
  const totalSubmissions = submissions.length
  const avgProgress = totalSubmissions > 0
    ? Math.round((submissions.reduce((acc, s) => acc + (s.score / (s.maxScore || 10)), 0) / totalSubmissions) * 100)
    : 0

  return `
    <div class="app-layout">
      ${renderSidebar('history')}
      <div class="main-content">
        ${renderNavbar('Nền tảng / Bảng điều khiển')}
        <div class="content-body">
          <div class="page-header">
            <div>
              <h1 class="page-title">Lịch sử học tập</h1>
              <p class="page-description">Xem lại các bài tập đã làm và kết quả học tập của bạn</p>
            </div>

            <div style="display:flex; gap:16px;">
              <div style="background:#e0f2fe; padding:10px 20px; border-radius:12px; text-align:center;">
                <div style="font-size:11px; font-weight:700; color:#0369a1; text-transform:uppercase;">ĐIỂM TRUNG BÌNH</div>
                <div style="font-family:var(--font-heading); font-size:22px; font-weight:700; color:#0284c7;">${avgProgress}%</div>
              </div>
              <div style="background:#e0f2fe; padding:10px 20px; border-radius:12px; text-align:center;">
                <div style="font-size:11px; font-weight:700; color:#0369a1; text-transform:uppercase;">TỔNG BÀI TẬP</div>
                <div style="font-family:var(--font-heading); font-size:22px; font-weight:700; color:#0284c7;">${totalSubmissions}</div>
              </div>
            </div>
          </div>

          <!-- Table Container -->
          <div class="card">
            <!-- Filter Bar -->
            <div style="display:flex; gap:16px; margin-bottom:20px; align-items:center;">
              <div class="search-box" style="width:320px;">
                <i class="fa-solid fa-magnifying-glass"></i>
                <input type="text" placeholder="Tìm tên bài tập...">
              </div>
              <button class="btn-primary" style="width:auto; padding:8px 16px;"><i class="fa-solid fa-check"></i> Đã hoàn thành</button>
              <select style="padding:8px 14px; border:1px solid var(--border-color); border-radius:10px; font-size:14px; outline:none; background:#ffffff;">
                <option>Chương</option>
              </select>
              <button class="btn-secondary"><i class="fa-regular fa-calendar"></i> Khoảng thời gian</button>
            </div>

            <!-- Table -->
            <div class="table-responsive">
              <table class="data-table">
                <thead>
                  <tr>
                    <th>Tên bài tập</th>
                    <th>Bài học</th>
                    <th>Ngày nộp</th>
                    <th>Điểm số</th>
                    <th>Trạng thái</th>
                    <th>Thao tác</th>
                  </tr>
                </thead>
                <tbody>
                  ${submissions.map(sub => {
                    const isPassed = sub.isPassed !== false
                    return `
                      <tr>
                        <td style="font-weight:700; color:#0f172a;">${sub.homeworkTitle}</td>
                        <td style="color:#64748b;">${sub.lesson}</td>
                        <td style="color:#64748b;">${sub.submittedAt}</td>
                        <td style="font-family:var(--font-heading); font-weight:700; font-size:16px; color:${isPassed ? '#16a34a' : '#dc2626'};">
                          ${sub.correctCount}/${(sub.correctCount || 0) + (sub.wrongCount || 0)}
                        </td>
                        <td>
                          <span class="badge ${isPassed ? 'badge-graded' : 'badge-failed'}" style="background:${isPassed ? '#dcfce7' : '#fee2e2'}; color:${isPassed ? '#16a34a' : '#dc2626'}; border:none; padding:4px 8px; border-radius:6px; font-weight:700; font-size:12px;">
                            ${isPassed ? 'Đạt' : 'Chưa đạt'}
                          </span>
                        </td>
                        <td>
                          <button class="btn-secondary" onclick="window.location.hash='#assignment-review?submissionId=${sub.id}'" style="padding:4px 10px; font-size:12px;">
                            Xem kết quả
                          </button>
                        </td>
                      </tr>
                    `
                  }).join('')}
                </tbody>
              </table>
            </div>

            <!-- Pagination -->
            <div style="display:flex; align-items:center; justify-content:space-between; margin-top:20px; font-size:13px; color:#64748b;">
              <div>Hiển thị 1 đến ${totalSubmissions} trong tổng số ${totalSubmissions} bài tập</div>
              <div style="display:flex; gap:6px; align-items:center;">
                <button class="btn-secondary" style="padding:4px 10px;">&lt;</button>
                <button class="btn-primary" style="width:auto; padding:4px 12px; border-radius:6px;">1</button>
                <button class="btn-secondary" style="padding:4px 10px;">2</button>
                <button class="btn-secondary" style="padding:4px 10px;">3</button>
                <button class="btn-secondary" style="padding:4px 10px;">&gt;</button>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  `
}

export function bindLearningHistoryEvents() {
  bindSidebarEvents()
}
