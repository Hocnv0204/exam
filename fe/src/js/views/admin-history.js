import { renderSidebar, bindSidebarEvents } from '../components/sidebar.js'
import { renderNavbar } from '../components/navbar.js'
import { state } from '../state.js'
import { api } from '../api.js'
import { showToast } from '../components/toast.js'
import { openModal } from '../components/modal.js'

let selectedClassId = ''
let selectedHomeworkId = ''
let submissions = []
let wrongQuestionsSummary = []
let classHomeworks = []
let isInitializedFromUrl = false

function parseUrlParams() {
  const hash = window.location.hash || ''
  const queryIndex = hash.indexOf('?')
  if (queryIndex !== -1) {
    const params = new URLSearchParams(hash.substring(queryIndex + 1))
    const cId = params.get('classId')
    const hId = params.get('homeworkId')
    if (cId) selectedClassId = cId
    if (hId) selectedHomeworkId = hId
  }
}

export function renderAdminHistoryView() {
  if (!isInitializedFromUrl) {
    parseUrlParams()
    isInitializedFromUrl = true
  }

  const classes = state.classes || []

  // Find selected class and homework names
  const selectedClass = classes.find(c => c.id === selectedClassId)
  const classNameText = selectedClass ? selectedClass.name : 'Chưa chọn lớp'

  const selectedHw = classHomeworks.find(h => h.id === selectedHomeworkId)
  const hwNameText = selectedHw ? selectedHw.title : 'Tất cả bài tập'

  return `
    <div class="app-layout">
      ${renderSidebar('admin-history')}
      <div class="main-content">
        ${renderNavbar('Quản trị / Lịch sử nộp bài')}
        <div class="content-body">
          <div class="page-header">
            <div>
              <h1 class="page-title">Lịch sử & Thống kê câu sai của học sinh</h1>
              <p class="page-description">Theo dõi, kiểm tra chi tiết kết quả nộp bài và phân tích các câu làm sai của học sinh.</p>
            </div>
          </div>

          <!-- Filter Area -->
          <div class="card" style="margin-bottom:24px; padding:20px;">
            <div style="display:flex; align-items:center; gap:16px; flex-wrap:wrap;">
              
              <!-- Select Class -->
              <div style="display:flex; flex-direction:column; gap:6px; min-width:220px;">
                <label style="font-size:12px; font-weight:700; color:#64748b; text-transform:uppercase;">
                  <i class="fa-solid fa-graduation-cap" style="color:#0066cc;"></i> Chọn Lớp Học <span style="color:#ef4444;">*</span>
                </label>
                <select id="admin-history-class-select" class="form-input" style="background:#ffffff; cursor:pointer;">
                  <option value="">-- Chọn lớp học --</option>
                  ${classes.map(c => `
                    <option value="${c.id}" ${c.id === selectedClassId ? 'selected' : ''}>${c.name}</option>
                  `).join('')}
                </select>
              </div>

              <!-- Select Homework -->
              <div style="display:flex; flex-direction:column; gap:6px; min-width:260px;">
                <label style="font-size:12px; font-weight:700; color:#64748b; text-transform:uppercase;">
                  <i class="fa-solid fa-book-open-reader" style="color:#0284c7;"></i> Lọc theo bài tập
                </label>
                <select id="admin-history-hw-select" class="form-input" style="background:#ffffff; cursor:pointer;" ${!selectedClassId ? 'disabled' : ''}>
                  <option value="">-- Tất cả bài tập trong lớp --</option>
                  ${classHomeworks.map(h => `
                    <option value="${h.id}" ${h.id === selectedHomeworkId ? 'selected' : ''}>${h.title}</option>
                  `).join('')}
                </select>
              </div>
              
              <div style="display:flex; flex-direction:column; gap:4px; margin-left:auto; text-align:right;">
                <span style="font-size:12px; color:#64748b;">Đang xem: <strong>${classNameText}</strong></span>
                <span style="font-size:13px; font-weight:700; color:#0f172a;">${hwNameText}</span>
              </div>

            </div>
          </div>

          ${(selectedClassId && selectedHomeworkId && wrongQuestionsSummary.length > 0) ? `
            <!-- Wrong Questions Analysis Section -->
            <div class="card" style="margin-bottom:24px; padding:20px; border-left:4px solid #ef4444; background:#fafdfd;">
              <div style="display:flex; justify-content:space-between; align-align:center; margin-bottom:16px;">
                <div>
                  <h3 style="font-family:var(--font-heading); font-size:16px; font-weight:700; color:#991b1b; margin:0 0 4px 0; display:flex; align-items:center; gap:8px;">
                    <i class="fa-solid fa-triangle-exclamation" style="color:#ef4444;"></i>
                    Thống kê các câu hỏi làm sai / bỏ trống (${wrongQuestionsSummary.length} câu) - ${hwNameText}
                  </h3>
                  <p style="font-size:13px; color:#64748b; margin:0;">
                    Phân tích chi tiết danh sách câu hỏi học sinh đã làm sai hoặc bỏ trống trong bài tập này.
                  </p>
                </div>
                <button class="btn-secondary" id="toggle-wrong-summary-btn" style="font-size:12px; padding:6px 12px; cursor:pointer;">
                  <i class="fa-solid fa-chevron-up"></i> Thu gọn
                </button>
              </div>

              <div id="wrong-summary-container" style="display:grid; grid-template-columns: repeat(auto-fit, minmax(320px, 1fr)); gap:14px;">
                ${wrongQuestionsSummary.map(q => {
                  const qTypeStr = q.questionType === 'MULTIPLE_CHOICE' ? 'Trắc nghiệm ABCD' : (q.questionType === 'TRUE_FALSE' ? 'Đúng / Sai' : 'Trả lời ngắn')
                  return `
                    <div style="background:#ffffff; border:1px solid #fecaca; border-radius:10px; padding:14px; box-shadow:0 1px 4px rgba(0,0,0,0.03);">
                      <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:8px;">
                        <span style="background:#ef4444; color:#ffffff; padding:2px 8px; border-radius:4px; font-weight:700; font-size:12px;">Câu ${q.questionNumber}</span>
                        <div style="display:flex; gap:4px; align-items:center;">
                          ${q.wrongCount > 0 ? `
                            <span style="font-size:11px; font-weight:700; color:#dc2626; background:#fee2e2; border:1px solid #fecaca; padding:2px 6px; border-radius:12px;">
                              <i class="fa-solid fa-xmark"></i> ${q.wrongCount} làm sai
                            </span>
                          ` : ''}
                          ${q.unansweredCount > 0 ? `
                            <span style="font-size:11px; font-weight:700; color:#b45309; background:#fffbeb; border:1px solid #fde68a; padding:2px 6px; border-radius:12px;">
                              <i class="fa-regular fa-square"></i> ${q.unansweredCount} bỏ trống
                            </span>
                          ` : ''}
                        </div>
                      </div>

                      <div style="font-size:12px; color:#64748b; font-weight:600; margin-bottom:6px;">${qTypeStr}</div>
                      ${q.prompt ? `<div style="font-size:13px; color:#334155; margin-bottom:8px; line-height:1.4;">${q.prompt}</div>` : ''}

                      <div style="font-size:12px; background:#f0fdf4; border:1px solid #bbf7d0; padding:6px 10px; border-radius:6px; color:#15803d; font-weight:700; margin-bottom:8px;">
                        <i class="fa-solid fa-circle-check"></i> Đáp án đúng: ${q.correctAnswer || 'N/A'}
                      </div>

                      <div style="border-top:1px dashed #e2e8f0; padding-top:6px; font-size:12px;">
                        <span style="font-size:11px; font-weight:700; color:#64748b; text-transform:uppercase; display:block; margin-bottom:4px;">Chi tiết học sinh chưa đạt:</span>
                        <div style="display:flex; flex-direction:column; gap:4px; max-height:130px; overflow-y:auto; padding-right:4px;">
                          ${q.students.map(st => `
                            <div style="display:flex; justify-content:space-between; align-items:center; background:${st.isUnanswered ? '#fffbeb' : '#fef2f2'}; border:1px solid ${st.isUnanswered ? '#fde68a' : '#fee2e2'}; padding:4px 8px; border-radius:4px; font-size:11px;">
                              <span style="font-weight:700; color:#0f172a;">${st.studentName}</span>
                              ${st.isUnanswered ? `
                                <span style="color:#b45309; font-weight:700;"><i class="fa-regular fa-square"></i> Bỏ trống</span>
                              ` : `
                                <span style="color:#dc2626; font-weight:600;">Điền/chọn: <strong>${st.givenAnswer}</strong></span>
                              `}
                            </div>
                          `).join('')}
                        </div>
                      </div>
                    </div>
                  `
                }).join('')}
              </div>
            </div>
          ` : (selectedClassId && !selectedHomeworkId) ? `
            <div class="card" style="margin-bottom:24px; padding:16px 20px; background:#f0f9ff; border:1px solid #bae6fd; border-radius:10px; display:flex; align-items:center; gap:12px;">
              <i class="fa-solid fa-circle-info" style="font-size:20px; color:#0284c7;"></i>
              <div style="font-size:13px; color:#0369a1;">
                <strong>Gợi ý:</strong> Chọn một bài tập cụ thể trong ô <strong>"Lọc theo bài tập"</strong> phía trên để xem phân tích thống kê chi tiết các câu làm sai / bỏ trống của bài tập đó.
              </div>
            </div>
          ` : ''}

          <!-- Submissions Table Container -->
          <div class="card">
            ${selectedClassId ? `
              <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:20px; flex-wrap:wrap; gap:12px;">
                <h3 style="font-family:var(--font-heading); font-size:16px; font-weight:700; color:#0f172a; margin:0;">
                  Danh sách bài đã nộp (${submissions.length})
                </h3>
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
                      <th>Các câu làm sai</th>
                      <th>Thời gian làm</th>
                      <th style="text-align:center;">Thao tác</th>
                    </tr>
                  </thead>
                  <tbody id="admin-history-table-body">
                    ${submissions.length === 0 ? `
                      <tr>
                        <td colspan="7" style="text-align:center; padding:40px; color:#64748b;">
                          <i class="fa-solid fa-folder-open" style="font-size:36px; margin-bottom:12px; color:#cbd5e1; display:block;"></i>
                          Chưa có học sinh nào nộp bài phù hợp với bộ lọc này.
                        </td>
                      </tr>
                    ` : submissions.map(sub => {
                      const isPassed = sub.isPassed !== false
                      const submittedDate = new Date(sub.submittedAt).toLocaleString('vi-VN')
                      const wrongList = sub.wrongAnswers || []
                      
                      return `
                        <tr class="history-row">
                          <td style="font-weight:700; color:#0f172a;" class="row-student-name">${sub.studentName}</td>
                          <td style="color:#475569;" class="row-hw-title">
                            <div style="margin-bottom: 4px;">${sub.homeworkTitle}</div>
                            ${sub.type === 'EXAM' ? `
                              <span style="background:#fef2f2; color:#ef4444; border:1px solid #fecaca; padding:2px 6px; border-radius:4px; font-size:10px; font-weight:700; display:inline-flex; align-items:center; gap:4px;">
                                <i class="fa-solid fa-file-contract"></i> Bài thi
                              </span>
                            ` : `
                              <span style="background:#f0fdf4; color:#16a34a; border:1px solid #bbf7d0; padding:2px 6px; border-radius:4px; font-size:10px; font-weight:700; display:inline-flex; align-items:center; gap:4px;">
                                <i class="fa-solid fa-dumbbell"></i> Luyện tập
                              </span>
                            `}
                            ${(sub.isLate || sub.is_late) ? `
                              <span style="background:#fef3c7; color:#d97706; border:1px solid #fde68a; padding:2px 6px; border-radius:4px; font-size:10px; font-weight:700; margin-left:6px; display:inline-flex; align-items:center; gap:4px;">
                                <i class="fa-solid fa-clock-rotate-left"></i> Nộp muộn
                              </span>
                            ` : ''}
                          </td>
                          <td style="color:#64748b;">${submittedDate}</td>
                          <td style="font-family:var(--font-heading); font-weight:700; font-size:16px; color:${isPassed ? '#16a34a' : '#dc2626'};">
                            ${sub.correctCount}/${(sub.correctCount || 0) + (sub.wrongCount || 0)}
                          </td>
                          <td>
                            ${wrongList.length === 0 ? `
                              <span style="color:#16a34a; font-weight:700; font-size:12px;"><i class="fa-solid fa-circle-check"></i> Đúng 100%</span>
                            ` : `
                              <div style="display:flex; align-items:center; gap:6px; flex-wrap:wrap;">
                                <button class="btn-secondary view-wrong-modal-btn" data-subid="${sub.submissionId}" data-stuname="${sub.studentName}" data-hwtitle="${sub.homeworkTitle}" style="padding:3px 8px; font-size:11px; font-weight:700; background:#fef2f2; color:#dc2626; border:1px solid #fecaca; border-radius:6px; cursor:pointer;">
                                  <i class="fa-solid fa-circle-xmark"></i> ${wrongList.length} câu sai
                                </button>
                                <div style="display:flex; gap:3px; flex-wrap:wrap; max-width:160px;">
                                  ${wrongList.slice(0, 4).map(w => `
                                    <span style="background:#fee2e2; color:#991b1b; padding:1px 5px; border-radius:4px; font-size:10px; font-weight:700;">Câu ${w.questionNumber}</span>
                                  `).join('')}
                                  ${wrongList.length > 4 ? `<span style="font-size:10px; color:#64748b; font-weight:700;">+${wrongList.length - 4}</span>` : ''}
                                </div>
                              </div>
                            `}
                          </td>
                          <td style="color:#475569; font-weight:600;">
                            ${(() => {
                              const secs = sub.durationSecondsTaken || 0
                              const mins = Math.floor(secs / 60)
                              const remainingSecs = secs % 60
                              return `${mins}m ${remainingSecs}s`
                            })()}
                          </td>
                          <td style="white-space:nowrap; text-align:center;">
                            <div style="display:flex; gap:6px; justify-content:center;">
                              <button class="btn-secondary view-detail-btn" data-id="${sub.submissionId}" title="Xem toàn bộ bài làm" style="padding:4px 10px; font-size:12px; cursor:pointer;">
                                <i class="fa-solid fa-eye"></i> Xem chi tiết
                              </button>
                              <button class="btn-secondary reopen-sub-btn" data-hwid="${sub.homeworkId}" data-stuid="${sub.studentId}" data-name="${sub.studentName}" title="Cho phép học sinh làm lại" style="padding:4px 10px; font-size:12px; cursor:pointer; color:#b45309; border-color:#fde68a; background:#fffbeb;">
                                <i class="fa-solid fa-rotate-left"></i> Khôi phục
                              </button>
                            </div>
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
                <p style="font-size:14px; max-width:320px; margin:0 auto;">Chọn lớp học từ danh sách phía trên để theo dõi kết quả làm bài tập và danh sách câu sai của học sinh.</p>
              </div>
            `}
          </div>
        </div>
      </div>
    </div>
  `
}

async function loadHistoryData() {
  if (!selectedClassId) {
    submissions = []
    wrongQuestionsSummary = []
    return
  }

  try {
    showToast('Đang tải dữ liệu lịch sử bài tập...', 'info')

    // 1. Fetch homeworks for the selected class if not already cached
    const hwList = await api.getHomeworks('', selectedClassId)
    classHomeworks = hwList || []

    // 2. Fetch history with potential homework filter
    let queryStr = `classId=${selectedClassId}`
    if (selectedHomeworkId) {
      queryStr += `&homeworkId=${selectedHomeworkId}`
    }

    const result = await api.getStudentHistory(queryStr)
    submissions = result?.history || []
    wrongQuestionsSummary = result?.wrongQuestionsSummary || []

    showToast(`Đã tải ${submissions.length} bài nộp`, 'success')
  } catch (err) {
    submissions = []
    wrongQuestionsSummary = []
    showToast(`Tải lịch sử làm bài thất bại: ${err.message}`, 'error')
  }
}

export function bindAdminHistoryEvents() {
  bindSidebarEvents()

  // Initial load if classId is present in URL or state
  if (selectedClassId && submissions.length === 0) {
    loadHistoryData().then(() => {
      const app = document.getElementById('app')
      if (app) {
        app.innerHTML = renderAdminHistoryView()
        bindAdminHistoryEvents()
      }
    })
  }

  // Class Select Change Event
  const classSelect = document.getElementById('admin-history-class-select')
  classSelect?.addEventListener('change', async (e) => {
    selectedClassId = e.target.value
    selectedHomeworkId = ''
    classHomeworks = []

    if (selectedClassId) {
      await loadHistoryData()
    } else {
      submissions = []
      wrongQuestionsSummary = []
    }

    const app = document.getElementById('app')
    if (app) {
      app.innerHTML = renderAdminHistoryView()
      bindAdminHistoryEvents()
    }
  })

  // Homework Select Change Event
  const hwSelect = document.getElementById('admin-history-hw-select')
  hwSelect?.addEventListener('change', async (e) => {
    selectedHomeworkId = e.target.value
    if (selectedClassId) {
      await loadHistoryData()
    }

    const app = document.getElementById('app')
    if (app) {
      app.innerHTML = renderAdminHistoryView()
      bindAdminHistoryEvents()
    }
  })

  // Toggle Wrong Questions Summary Panel
  const toggleSummaryBtn = document.getElementById('toggle-wrong-summary-btn')
  const summaryContainer = document.getElementById('wrong-summary-container')
  toggleSummaryBtn?.addEventListener('click', () => {
    if (summaryContainer) {
      const isHidden = summaryContainer.style.display === 'none'
      summaryContainer.style.display = isHidden ? 'grid' : 'none'
      toggleSummaryBtn.innerHTML = isHidden 
        ? `<i class="fa-solid fa-chevron-up"></i> Thu gọn` 
        : `<i class="fa-solid fa-chevron-down"></i> Mở rộng (${wrongQuestionsSummary.length} câu)`
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

  // View detail buttons click -> Navigate to full review
  document.querySelectorAll('.view-detail-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      const subId = btn.getAttribute('data-id')
      if (subId) {
        window.location.hash = `#assignment-review?submissionId=${subId}`
      }
    })
  })

  // View wrong modal buttons click -> Open Modal showing that student's wrong answers
  document.querySelectorAll('.view-wrong-modal-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      const subId = btn.getAttribute('data-subid')
      const studentName = btn.getAttribute('data-stuname') || 'Học sinh'
      const hwTitle = btn.getAttribute('data-hwtitle') || 'Bài tập'

      const sub = submissions.find(s => s.submissionId === subId || s.id === subId)
      const wrongList = sub?.wrongAnswers || []

      if (wrongList.length === 0) {
        showToast('Học sinh này làm đúng toàn bộ câu hỏi!', 'info')
        return
      }

      const wrongCountOnly = wrongList.filter(w => !w.isUnanswered).length
      const unansweredCountOnly = wrongList.filter(w => w.isUnanswered).length

      const modalHtml = `
        <div style="display:flex; flex-direction:column; gap:16px;">
          <div style="font-size:13px; color:#475569; background:#f8fafc; border:1px solid #e2e8f0; padding:10px 14px; border-radius:8px; display:flex; justify-content:space-between; align-items:center; flex-wrap:wrap; gap:8px;">
            <div>Học sinh: <strong style="color:#0f172a;">${studentName}</strong> | Bài tập: <strong>${hwTitle}</strong></div>
            <div style="display:flex; gap:6px;">
              ${wrongCountOnly > 0 ? `<span style="background:#fee2e2; color:#dc2626; border:1px solid #fecaca; padding:2px 8px; border-radius:12px; font-size:11px; font-weight:700;"><i class="fa-solid fa-xmark"></i> ${wrongCountOnly} câu làm sai</span>` : ''}
              ${unansweredCountOnly > 0 ? `<span style="background:#fffbeb; color:#b45309; border:1px solid #fde68a; padding:2px 8px; border-radius:12px; font-size:11px; font-weight:700;"><i class="fa-regular fa-square"></i> ${unansweredCountOnly} câu bỏ trống</span>` : ''}
            </div>
          </div>

          <div style="display:flex; flex-direction:column; gap:12px; max-height:400px; overflow-y:auto; padding-right:4px;">
            ${wrongList.map(w => {
              const qTypeStr = w.questionType === 'MULTIPLE_CHOICE' ? 'Trắc nghiệm ABCD' : (w.questionType === 'TRUE_FALSE' ? 'Đúng / Sai' : 'Trả lời ngắn')
              const isUn = w.isUnanswered
              return `
                <div style="background:#ffffff; border:1px solid ${isUn ? '#fde68a' : '#fecaca'}; border-radius:10px; padding:12px; display:flex; flex-direction:column; gap:6px;">
                  <div style="display:flex; justify-content:space-between; align-items:center;">
                    <div style="display:flex; align-items:center; gap:6px;">
                      <span style="background:${isUn ? '#d97706' : '#dc2626'}; color:#ffffff; padding:2px 8px; border-radius:4px; font-weight:700; font-size:12px;">Câu ${w.questionNumber}</span>
                      ${isUn ? `<span style="background:#fffbeb; color:#b45309; border:1px solid #fde68a; padding:1px 6px; border-radius:4px; font-size:11px; font-weight:700;"><i class="fa-regular fa-square"></i> Bỏ trống</span>` : `<span style="background:#fee2e2; color:#dc2626; border:1px solid #fecaca; padding:1px 6px; border-radius:4px; font-size:11px; font-weight:700;"><i class="fa-solid fa-xmark"></i> Làm sai</span>`}
                    </div>
                    <span style="font-size:11px; color:#64748b; font-weight:600;">${qTypeStr}</span>
                  </div>

                  ${w.prompt ? `<div style="font-size:13px; font-weight:600; color:#0f172a;">${w.prompt}</div>` : ''}

                  <div style="display:grid; grid-template-columns:1fr 1fr; gap:8px; margin-top:4px;">
                    <div style="background:${isUn ? '#fffbeb' : '#fef2f2'}; border:1px solid ${isUn ? '#fde68a' : '#fee2e2'}; padding:8px 10px; border-radius:6px; font-size:12px;">
                      <span style="font-weight:700; color:${isUn ? '#b45309' : '#dc2626'}; display:block; margin-bottom:2px;">Đáp án học sinh chọn/điền:</span>
                      <strong style="color:${isUn ? '#b45309' : '#b91c1c'};">${w.givenAnswer}</strong>
                    </div>

                    <div style="background:#f0fdf4; border:1px solid #bbf7d0; padding:8px 10px; border-radius:6px; font-size:12px;">
                      <span style="font-weight:700; color:#16a34a; display:block; margin-bottom:2px;">Đáp án đúng chuẩn:</span>
                      <strong style="color:#15803d;">${w.correctAnswer}</strong>
                    </div>
                  </div>
                </div>
              `
            }).join('')}
          </div>
        </div>
      `

      openModal(`Chi tiết câu làm sai - ${studentName}`, modalHtml)
    })
  })

  // Reopen submission button click
  document.querySelectorAll('.reopen-sub-btn').forEach(btn => {
    btn.addEventListener('click', (e) => {
      e.stopPropagation()
      const hwId = btn.getAttribute('data-hwid')
      const studentId = btn.getAttribute('data-stuid')
      const studentName = btn.getAttribute('data-name') || 'học sinh'

      if (!hwId || !studentId) return

      const bodyHtml = `
        <div style="display:flex; flex-direction:column; gap:16px;">
          <p style="font-size:14px; color:#475569; margin:0; line-height:1.5;">
            Hành động này sẽ khôi phục bài thi của học sinh <strong>${studentName}</strong> về trạng thái "Đang làm".
            Bài nộp cũ sẽ được lưu trữ lại.
          </p>
          <div style="display:flex; flex-direction:column; gap:10px;">
            <label style="display:flex; align-items:center; gap:8px; font-size:14px; color:#1e293b; cursor:pointer;">
              <input type="checkbox" id="reopen-reset-timer" style="width:16px; height:16px;" checked>
              Thiết lập lại thời gian làm bài (đếm lại từ đầu)
            </label>
            <label style="display:flex; align-items:center; gap:8px; font-size:14px; color:#1e293b; cursor:pointer;">
              <input type="checkbox" id="reopen-reset-answers" style="width:16px; height:16px;" checked>
              Xóa các đáp án đã chọn (làm lại từ đầu)
            </label>
          </div>
        </div>
      `
      openModal('Khôi phục bài thi', bodyHtml, async () => {
        const resetTimer = document.getElementById('reopen-reset-timer')?.checked || false
        const resetAnswers = document.getElementById('reopen-reset-answers')?.checked || false
        try {
          showToast('Đang khôi phục bài thi...', 'info')
          await api.reopenSubmission(hwId, studentId, resetTimer, resetAnswers)
          showToast('Đã khôi phục bài thi thành công!', 'success')
          await loadHistoryData()
          const app = document.getElementById('app')
          if (app) {
            app.innerHTML = renderAdminHistoryView()
            bindAdminHistoryEvents()
          }
        } catch(err) {
          showToast(`Khôi phục bài thi thất bại: ${err.message}`, 'error')
        }
        return true
      })
    })
  })
}
