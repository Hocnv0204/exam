import { renderSidebar, bindSidebarEvents } from '../components/sidebar.js'
import { renderNavbar } from '../components/navbar.js'
import { state } from '../state.js'
import { api } from '../api.js'
import { showToast } from '../components/toast.js'

let selectedClassId = ''
let submissions = []

export function renderAdminHistoryView() {
  const classes = state.classes || []

  // Find selected class name
  const selectedClass = classes.find(c => c.id === selectedClassId)
  const classNameText = selectedClass ? selectedClass.name : 'Chưa chọn lớp'

  return `
    <div class="app-layout">
      ${renderSidebar('admin-history')}
      <div class="main-content">
        ${renderNavbar('Quản trị / Lịch sử nộp bài')}
        <div class="content-body">
          <div class="page-header">
            <div>
              <h1 class="page-title">Lịch sử làm bài của học sinh</h1>
              <p class="page-description">Theo dõi, kiểm tra chi tiết kết quả làm bài tập của học sinh theo từng lớp học.</p>
            </div>
          </div>

          <!-- Filter Area -->
          <div class="card" style="margin-bottom:24px; padding:20px;">
            <div style="display:flex; align-items:center; gap:16px; flex-wrap:wrap;">
              <div style="display:flex; flex-direction:column; gap:6px; min-width:240px;">
                <label style="font-size:12px; font-weight:700; color:#64748b; text-transform:uppercase;">Chọn Lớp Học</label>
                <select id="admin-history-class-select" class="form-input" style="background:#ffffff; cursor:pointer;">
                  <option value="">-- Chọn lớp học để xem --</option>
                  ${classes.map(c => `
                    <option value="${c.id}" ${c.id === selectedClassId ? 'selected' : ''}>${c.name}</option>
                  `).join('')}
                </select>
              </div>
              
              <div style="display:flex; flex-direction:column; gap:6px; margin-left:auto; text-align:right;">
                <span style="font-size:12px; color:#64748b;">Lớp đang xem</span>
                <strong style="font-family:var(--font-heading); font-size:18px; color:#0f172a;">${classNameText}</strong>
              </div>
            </div>
          </div>

          <!-- Table Container -->
          <div class="card">
            ${selectedClassId ? `
              <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:20px;">
                <h3 style="font-family:var(--font-heading); font-size:16px; font-weight:700; color:#0f172a;">Danh sách bài đã nộp (${submissions.length})</h3>
                <div class="search-box" style="width:280px; margin:0;">
                  <i class="fa-solid fa-magnifying-glass"></i>
                  <input type="text" id="admin-history-search" placeholder="Tìm tên học sinh, bài tập...">
                </div>
              </div>

              <div class="table-responsive">
                <table class="data-table">
                  <thead>
                    <tr>
                      <th>Học sinh</th>
                      <th>Tên bài tập</th>
                      <th>Ngày nộp</th>
                      <th>Điểm số</th>
                      <th>Thời gian làm</th>
                      <th>Thao tác</th>
                    </tr>
                  </thead>
                  <tbody id="admin-history-table-body">
                    ${submissions.length === 0 ? `
                      <tr>
                        <td colspan="6" style="text-align:center; padding:40px; color:#64748b;">
                          <i class="fa-solid fa-folder-open" style="font-size:36px; margin-bottom:12px; color:#cbd5e1; display:block;"></i>
                          Chưa có học sinh nào nộp bài trong lớp này.
                        </td>
                      </tr>
                    ` : submissions.map(sub => {
    const isPassed = sub.isPassed !== false
    const submittedDate = new Date(sub.submittedAt).toLocaleString('vi-VN')
    return `
                        <tr class="history-row">
                          <td style="font-weight:700; color:#0f172a;" class="row-student-name">${sub.studentName}</td>
                          <td style="color:#475569;" class="row-hw-title">${sub.homeworkTitle}</td>
                          <td style="color:#64748b;">${submittedDate}</td>
                          <td style="font-family:var(--font-heading); font-weight:700; font-size:16px; color:${isPassed ? '#16a34a' : '#dc2626'};">
                            ${sub.correctCount}/${(sub.correctCount || 0) + (sub.wrongCount || 0)}
                          </td>
                          <td style="color:#475569; font-weight:600;">
                            ${(() => {
                              const secs = sub.durationSecondsTaken || 0
                              const mins = Math.floor(secs / 60)
                              const remainingSecs = secs % 60
                              return `${mins}m ${remainingSecs}s`
                            })()}
                          </td>
                          <td>
                            <button class="btn-secondary view-detail-btn" data-id="${sub.submissionId}" style="padding:4px 10px; font-size:12px; cursor:pointer;">
                              Xem chi tiết
                            </button>
                          </td>
                        </tr>
                      `
  }).join('')}
                  </tbody>
                </table>
              </div>
            ` : `
              <div style="text-align:center; padding:60px 40px; color:#64748b;">
                <i class="fa-solid fa-graduation-cap" style="font-size:48px; color:#cbd5e1; margin-bottom:16px; display:block;"></i>
                <h3 style="font-weight:700; color:#0f172a; margin-bottom:8px;">Vui lòng chọn một lớp học</h3>
                <p style="font-size:14px; max-width:320px; margin:0 auto;">Chọn lớp học từ danh sách phía trên để theo dõi kết quả làm bài tập của học sinh.</p>
              </div>
            `}
          </div>
        </div>
      </div>
    </div>
  `
}

export function bindAdminHistoryEvents() {
  bindSidebarEvents()

  // Class Select Change Event
  const classSelect = document.getElementById('admin-history-class-select')
  classSelect?.addEventListener('change', async (e) => {
    selectedClassId = e.target.value
    if (selectedClassId) {
      try {
        showToast('Đang tải lịch sử làm bài...', 'info')
        const result = await api.getStudentHistory(`classId=${selectedClassId}`)
        submissions = result?.history || []
        showToast(`Đã tải thành công ${submissions.length} lượt nộp bài`, 'success')
      } catch (err) {
        submissions = []
        showToast(`Tải lịch sử làm bài thất bại: ${err.message}`, 'error')
      }
    } else {
      submissions = []
    }
    // Re-render
    const app = document.getElementById('app')
    if (app) {
      app.innerHTML = renderAdminHistoryView()
      bindAdminHistoryEvents()
    }
  })

  // Search filter
  const searchInput = document.getElementById('admin-history-search')
  searchInput?.addEventListener('input', (e) => {
    const q = e.target.value.toLowerCase().trim()
    document.querySelectorAll('.history-row').forEach(row => {
      const studentName = row.querySelector('.row-student-name')?.textContent.toLowerCase() || ''
      const hwTitle = row.querySelector('.row-hw-title')?.textContent.toLowerCase() || ''
      const match = studentName.includes(q) || hwTitle.includes(q)
      row.style.display = match ? '' : 'none'
    })
  })

  // View detail buttons click
  document.querySelectorAll('.view-detail-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      const subId = btn.getAttribute('data-id')
      if (subId) {
        window.location.hash = `#assignment-review?submissionId=${subId}`
      }
    })
  })
}
