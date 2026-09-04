import { renderSidebar, bindSidebarEvents } from '../components/sidebar.js'
import { renderNavbar } from '../components/navbar.js'
import { state } from '../state.js'
import { api } from '../api.js'
import { showToast } from '../components/toast.js'
import { openModal } from '../components/modal.js'

let selectedClassId = ''
let selectedHomeworkId = ''
let currentTab = 'submitted' // 'submitted' | 'unsubmitted'
let submissions = []
let wrongQuestionsSummary = []
let classHomeworks = []
let submissionStats = null
let unsubmittedStudents = []
let unsubmittedFilter = 'ALL' // 'ALL' | 'NOT_STARTED' | 'IN_PROGRESS'
let unsubmittedSearch = ''
const classHomeworksCache = new Map()

function parseUrlParams() {
  const hash = window.location.hash || ''
  const queryIndex = hash.indexOf('?')
  if (queryIndex !== -1) {
    const params = new URLSearchParams(hash.substring(queryIndex + 1))
    const cId = params.get('classId')
    const hId = params.get('homeworkId')
    const tab = params.get('tab')
    selectedClassId = cId || ''
    selectedHomeworkId = hId || ''
    if (tab === 'unsubmitted' || tab === 'submitted') currentTab = tab
  } else {
    selectedClassId = ''
    selectedHomeworkId = ''
  }
}

function formatRemainingTime(deadline) {
  if (!deadline) return ''
  const diff = new Date(deadline) - new Date()
  if (diff <= 0) {
    const absDiff = Math.abs(diff)
    const hours = Math.floor(absDiff / (1000 * 60 * 60))
    const days = Math.floor(hours / 24)
    if (days > 0) return `Trễ ${days} ngày`
    return `Trễ ${Math.max(1, hours)} giờ`
  }
  const hours = Math.floor(diff / (1000 * 60 * 60))
  const days = Math.floor(hours / 24)
  const remainingHours = hours % 24
  if (days > 0) {
    return `Còn ${days} ngày ${remainingHours}h`
  }
  const mins = Math.floor((diff % (1000 * 60 * 60)) / (1000 * 60))
  if (hours > 0) return `Còn ${hours}h ${mins}m`
  return `Còn ${Math.max(1, mins)} phút`
}

export function renderAdminHistoryView() {
  parseUrlParams()

  const classes = state.classes || []

  // Find selected class and homework names
  const selectedClass = classes.find(c => c.id === selectedClassId)
  const classNameText = selectedClass ? selectedClass.name : 'Chưa chọn lớp'

  const selectedHw = classHomeworks.find(h => h.id === selectedHomeworkId)
  const hwNameText = selectedHw ? selectedHw.title : (submissionStats?.homeworkTitle || 'Tất cả bài tập')

  const totalClassStudents = submissionStats?.totalStudents || 0
  const submittedCount = submissionStats?.submittedCount !== undefined ? submissionStats.submittedCount : submissions.length
  const unsubmittedCount = submissionStats?.unsubmittedCount !== undefined ? submissionStats.unsubmittedCount : unsubmittedStudents.length
  const inProgressCount = submissionStats?.inProgressCount || 0
  const submissionRate = submissionStats?.submissionRate !== undefined ? submissionStats.submissionRate : 0
  const isOverdue = submissionStats?.isOverdue || false
  const deadline = submissionStats?.deadline

  const deadlineFormatted = deadline ? new Date(deadline).toLocaleString('vi-VN', {
    hour: '2-digit',
    minute: '2-digit',
    day: '2-digit',
    month: '2-digit',
    year: 'numeric'
  }) : 'Không giới hạn'

  return `
    <div class="app-layout">
      ${renderSidebar('admin-history')}
      <div class="main-content">
        ${renderNavbar('Quản trị / Lịch sử nộp bài')}
        <div class="content-body">
          
          <div class="page-header">
            <div>
              <h1 class="page-title">Lịch sử & Theo dõi nộp bài học sinh</h1>
              <p class="page-description">Theo dõi tiến độ nộp bài, phân tích câu sai và quản lý danh sách học sinh chưa làm bài.</p>
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

          ${(selectedClassId && selectedHomeworkId && submissionStats) ? `
            <!-- Submission Progress KPI Overview Card -->
            <div class="card" style="margin-bottom:24px; padding:20px; border:1px solid #e2e8f0; border-radius:14px; background:#ffffff; box-shadow:0 2px 10px rgba(0,0,0,0.02);">
              
              <div style="display:flex; justify-content:space-between; align-items:flex-start; flex-wrap:wrap; gap:12px; margin-bottom:16px;">
                <div>
                  <div style="font-size:11px; font-weight:700; color:#0066cc; text-transform:uppercase; margin-bottom:4px; display:flex; align-items:center; gap:6px;">
                    <i class="fa-solid fa-chart-pie"></i> Tiến độ nộp bài của lớp học
                  </div>
                  <h2 style="font-family:var(--font-heading); font-size:18px; font-weight:700; color:#0f172a; margin:0 0 4px 0;">
                    ${hwNameText}
                  </h2>
                  <div style="font-size:12px; color:#64748b;">
                    Lớp: <strong style="color:#0284c7;">${classNameText}</strong>
                  </div>
                </div>

                <div style="display:flex; align-items:center; gap:10px; flex-wrap:wrap;">
                  ${deadline ? `
                    <span class="${isOverdue ? 'badge-deadline-overdue' : 'badge-deadline-pending'}">
                      <i class="fa-solid ${isOverdue ? 'fa-triangle-exclamation' : 'fa-clock'}"></i>
                      ${isOverdue ? `Đã quá hạn (${formatRemainingTime(deadline)})` : `Hạn nộp: ${deadlineFormatted} (${formatRemainingTime(deadline)})`}
                    </span>
                  ` : `
                    <span class="badge" style="background:#f8fafc; color:#64748b; border:1px solid #e2e8f0; padding:4px 10px; border-radius:6px; font-size:12px; font-weight:600;">
                      <i class="fa-solid fa-infinity"></i> Không giới hạn hạn chót
                    </span>
                  `}

                  <span class="badge" style="background:#eff6ff; color:#0066cc; border:1px solid #bfdbfe; padding:4px 10px; border-radius:6px; font-size:12px; font-weight:600;">
                    <i class="fa-regular fa-clock"></i> ${submissionStats.durationMinutes || 45} phút
                  </span>
                </div>
              </div>

              <!-- Visual Progress Bar -->
              <div style="margin-bottom:18px;">
                <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:6px; font-size:13px;">
                  <span style="font-weight:700; color:#0f172a;">
                    Tỷ lệ nộp bài: <span style="color:#059669;">${submissionRate}%</span>
                  </span>
                  <span style="color:#64748b; font-size:12px;">
                    Đã nộp <strong>${submittedCount}</strong> / <strong>${totalClassStudents}</strong> học sinh
                  </span>
                </div>
                <div class="tracking-progress-track">
                  <div class="tracking-progress-fill-done" style="width: ${submissionRate}%;" title="Đã nộp: ${submittedCount} học sinh (${submissionRate}%)"></div>
                  ${(totalClassStudents > 0 && inProgressCount > 0) ? `
                    <div class="tracking-progress-fill-active" style="width: ${(inProgressCount / totalClassStudents) * 100}%;" title="Đang trong phòng thi: ${inProgressCount} học sinh"></div>
                  ` : ''}
                </div>
              </div>

              <!-- 4 Stat Counters -->
              <div style="display:grid; grid-template-columns: repeat(auto-fit, minmax(140px, 1fr)); gap:12px;">
                
                <div style="background:#f8fafc; border:1px solid #e2e8f0; border-radius:10px; padding:12px 14px;">
                  <div style="font-size:11px; font-weight:700; color:#64748b; text-transform:uppercase;">Tổng học sinh lớp</div>
                  <div style="font-size:22px; font-weight:800; color:#0f172a; margin-top:2px;">${totalClassStudents}</div>
                </div>

                <div style="background:#f0fdf4; border:1px solid #bbf7d0; border-radius:10px; padding:12px 14px;">
                  <div style="font-size:11px; font-weight:700; color:#15803d; text-transform:uppercase;">Đã nộp bài</div>
                  <div style="font-size:22px; font-weight:800; color:#16a34a; margin-top:2px;">
                    ${submittedCount} <span style="font-size:13px; font-weight:600;">(${submissionRate}%)</span>
                  </div>
                </div>

                <div style="background:#fef2f2; border:1px solid #fecaca; border-radius:10px; padding:12px 14px;">
                  <div style="font-size:11px; font-weight:700; color:#b91c1c; text-transform:uppercase;">Chưa làm bài</div>
                  <div style="font-size:22px; font-weight:800; color:#dc2626; margin-top:2px;">
                    ${unsubmittedCount} <span style="font-size:13px; font-weight:600;">(${totalClassStudents > 0 ? Math.round((unsubmittedCount / totalClassStudents) * 100) : 0}%)</span>
                  </div>
                </div>

                <div style="background:#eff6ff; border:1px solid #bfdbfe; border-radius:10px; padding:12px 14px;">
                  <div style="font-size:11px; font-weight:700; color:#0284c7; text-transform:uppercase;">Đang làm dở</div>
                  <div style="font-size:22px; font-weight:800; color:#0284c7; margin-top:2px;">
                    ${inProgressCount}
                  </div>
                </div>

              </div>

            </div>
          ` : (selectedClassId && !selectedHomeworkId) ? `
            <div class="card" style="margin-bottom:24px; padding:16px 20px; background:#f0f9ff; border:1px solid #bae6fd; border-radius:10px; display:flex; align-items:center; gap:12px;">
              <i class="fa-solid fa-circle-info" style="font-size:20px; color:#0284c7;"></i>
              <div style="font-size:13px; color:#0369a1;">
                <strong>Gợi ý:</strong> Chọn một bài tập cụ thể trong ô <strong>"Lọc theo bài tập"</strong> phía trên để theo dõi <strong>danh sách học sinh chưa làm bài</strong> và thống kê các câu làm sai.
              </div>
            </div>
          ` : ''}

          <!-- TAB SWITCHER NAVIGATION (when homework is chosen) -->
          ${(selectedClassId && selectedHomeworkId) ? `
            <div class="submission-tabs-container">
              <button class="submission-tab-btn ${currentTab === 'submitted' ? 'active' : ''}" id="tab-btn-submitted">
                <i class="fa-solid fa-circle-check" style="color:${currentTab === 'submitted' ? '#16a34a' : '#64748b'};"></i>
                Đã nộp bài
                <span class="submission-tab-badge badge-submitted">${submissions.length}</span>
              </button>
              <button class="submission-tab-btn ${currentTab === 'unsubmitted' ? 'active' : ''}" id="tab-btn-unsubmitted">
                <i class="fa-solid fa-clock-rotate-left" style="color:${currentTab === 'unsubmitted' ? '#dc2626' : '#64748b'};"></i>
                Chưa làm bài
                <span class="submission-tab-badge badge-unsubmitted">${unsubmittedStudents.length}</span>
              </button>
            </div>
          ` : ''}

          <!-- TAB CONTENT 1: SUBMITTED TAB -->
          <div id="tab-content-submitted" style="display:${currentTab === 'submitted' ? 'block' : 'none'};">
            
            ${(selectedClassId && selectedHomeworkId && wrongQuestionsSummary.length > 0) ? `
              <!-- Wrong Questions Analysis Section -->
              <div class="card" style="margin-bottom:24px; padding:20px; border-left:4px solid #ef4444; background:#fafdfd;">
                <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:16px;">
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
            ` : ''}

            <!-- Submissions Table Card -->
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
                            <td style="font-weight:700; color:#0f172a;" class="row-student-name">
                              ${sub.studentName}
                              <div style="font-size:11px; font-weight:500; color:#64748b;">@${sub.username || ''}</div>
                            </td>
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

          <!-- TAB CONTENT 2: UNANSWERED / UNSUBMITTED STUDENTS TAB -->
          <div id="tab-content-unsubmitted" style="display:${currentTab === 'unsubmitted' ? 'block' : 'none'};">
            
            <div class="card">
              
              <!-- Toolbar for Unsubmitted Students -->
              <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:20px; flex-wrap:wrap; gap:12px;">
                <div>
                  <h3 style="font-family:var(--font-heading); font-size:16px; font-weight:700; color:#0f172a; margin:0 0 4px 0;">
                    Danh sách học sinh chưa làm bài (${unsubmittedStudents.length})
                  </h3>
                  <p style="font-size:13px; color:#64748b; margin:0;">
                    Học sinh trong lớp chưa hoàn thành nộp bài tập này.
                  </p>
                </div>

                <div style="display:flex; align-items:center; gap:10px; flex-wrap:wrap;">
                  
                  <!-- Filter Status -->
                  <select id="unsubmitted-status-filter" class="form-input" style="padding:7px 12px; font-size:12px; background:#ffffff; width:auto; border-radius:8px; cursor:pointer;">
                    <option value="ALL">Tất cả trạng thái</option>
                    <option value="NOT_STARTED">Chưa bắt đầu</option>
                    <option value="IN_PROGRESS">Đang trong phòng thi</option>
                  </select>

                  <!-- Search box -->
                  <div class="search-box" style="width:220px; margin:0;">
                    <i class="fa-solid fa-magnifying-glass"></i>
                    <input type="text" id="unsubmitted-search-input" placeholder="Tìm tên, username...">
                  </div>

                  <!-- Quick Action: Copy Reminder Message -->
                  <button class="btn-copy-reminder" id="btn-copy-reminder" title="Sao chép nội dung nhắc nhở định dạng sẵn để dán vào Zalo/Messenger">
                    <i class="fa-solid fa-copy"></i> Sao chép nhắc Zalo
                  </button>

                  <!-- Quick Action: Export CSV -->
                  <button class="btn-secondary" id="btn-export-unsubmitted-csv" style="padding:7px 12px; font-size:12px; font-weight:600; cursor:pointer; border-radius:8px;">
                    <i class="fa-solid fa-file-excel" style="color:#16a34a;"></i> Xuất Excel/CSV
                  </button>

                </div>
              </div>

              <!-- Unsubmitted Data Table -->
              <div class="table-responsive">
                <table class="data-table">
                  <thead>
                    <tr>
                      <th style="width:50px; text-align:center;">#</th>
                      <th>Học sinh</th>
                      <th>Tên tài khoản</th>
                      <th>Lớp học</th>
                      <th>Trạng thái làm bài</th>
                      <th>Tình trạng hạn chót</th>
                      <th style="text-align:center;">Thao tác</th>
                    </tr>
                  </thead>
                  <tbody id="unsubmitted-table-body">
                    ${renderUnsubmittedRows()}
                  </tbody>
                </table>
              </div>

            </div>

          </div>

        </div>
      </div>
    </div>
  `
}

function renderUnsubmittedRows() {
  let filtered = unsubmittedStudents.filter(st => {
    if (unsubmittedFilter === 'NOT_STARTED' && st.status !== 'NOT_STARTED') return false
    if (unsubmittedFilter === 'IN_PROGRESS' && st.status !== 'IN_PROGRESS') return false
    if (unsubmittedSearch) {
      const q = unsubmittedSearch.toLowerCase()
      const matchName = (st.fullName || st.studentName || '').toLowerCase().includes(q)
      const matchUser = (st.username || '').toLowerCase().includes(q)
      return matchName || matchUser
    }
    return true
  })

  if (filtered.length === 0) {
    if (unsubmittedStudents.length === 0) {
      return `
        <tr>
          <td colspan="7" style="text-align:center; padding:50px 20px; color:#16a34a;">
            <i class="fa-solid fa-circle-check" style="font-size:48px; margin-bottom:12px; display:block; color:#10b981;"></i>
            <h3 style="margin:0 0 6px 0; font-size:16px; font-weight:700; color:#0f172a;">Tuyệt vời! Tất cả học sinh đều đã hoàn thành bài tập</h3>
            <p style="color:#64748b; font-size:13px; margin:0;">100% học sinh trong lớp này đã nộp bài tập đầy đủ.</p>
          </td>
        </tr>
      `
    }
    return `
      <tr>
        <td colspan="7" style="text-align:center; padding:40px; color:#64748b;">
          <i class="fa-solid fa-magnifying-glass" style="font-size:32px; margin-bottom:10px; color:#cbd5e1; display:block;"></i>
          Không tìm thấy học sinh nào phù hợp với bộ lọc tìm kiếm.
        </td>
      </tr>
    `
  }

  return filtered.map((st, index) => {
    const isOverdue = st.isOverdue || false
    const isInProgress = st.status === 'IN_PROGRESS'
    const name = st.fullName || st.studentName || 'Học sinh'
    const initial = name.charAt(0).toUpperCase()

    return `
      <tr class="unsubmitted-row">
        <td style="text-align:center; font-weight:700; color:#94a3b8;">${index + 1}</td>
        <td>
          <div style="display:flex; align-items:center; gap:10px;">
            <div style="width:34px; height:34px; border-radius:50%; background:#e0f2fe; color:#0284c7; font-weight:700; font-size:13px; display:flex; align-items:center; justify-content:center; flex-shrink:0;">
              ${initial}
            </div>
            <div>
              <div style="font-weight:700; color:#0f172a; font-size:13px;" class="unsubmitted-name">${name}</div>
              <div style="font-size:11px; color:#64748b;">ID: ${st.id?.substring(0, 8)}...</div>
            </div>
          </div>
        </td>
        <td style="color:#475569; font-family:monospace; font-size:13px;" class="unsubmitted-username">
          @${st.username || 'n/a'}
        </td>
        <td style="color:#334155; font-size:13px;">
          ${document.getElementById('admin-history-class-select')?.selectedOptions[0]?.text || 'Lớp học'}
        </td>
        <td>
          ${isInProgress ? `
            <span class="badge-status-in-progress" title="Bắt đầu lúc: ${st.sessionStartedAt ? new Date(st.sessionStartedAt).toLocaleTimeString('vi-VN') : ''}">
              <i class="fa-solid fa-spinner fa-spin"></i> Đang làm bài (Trong phòng thi)
            </span>
          ` : `
            <span class="badge-status-not-started">
              <i class="fa-solid fa-circle-xmark"></i> Chưa bắt đầu
            </span>
          `}
        </td>
        <td>
          ${st.deadline ? `
            <span class="${isOverdue ? 'badge-deadline-overdue' : 'badge-deadline-pending'}">
              <i class="fa-solid ${isOverdue ? 'fa-triangle-exclamation' : 'fa-clock'}"></i>
              ${isOverdue ? `Quá hạn (${formatRemainingTime(st.deadline)})` : `${formatRemainingTime(st.deadline)}`}
            </span>
          ` : `
            <span style="color:#94a3b8; font-size:12px;">Không có hạn</span>
          `}
        </td>
        <td style="text-align:center; white-space:nowrap;">
          <button class="btn-secondary btn-view-student-profile" data-stuid="${st.id}" title="Xem chi tiết học sinh" style="padding:4px 10px; font-size:12px; cursor:pointer; border-radius:6px; background:#ffffff; color:#0066cc; border:1px solid #cbd5e1;">
            <i class="fa-solid fa-user"></i> Hồ sơ
          </button>
        </td>
      </tr>
    `
  }).join('')
}

function generateReminderText() {
  const selectedClass = (state.classes || []).find(c => c.id === selectedClassId)
  const classNameText = selectedClass ? selectedClass.name : 'Lớp học'
  const hwTitle = submissionStats?.homeworkTitle || 'Bài tập'
  const dlStr = submissionStats?.deadline 
    ? new Date(submissionStats.deadline).toLocaleString('vi-VN', { hour: '2-digit', minute: '2-digit', day: '2-digit', month: '2-digit', year: 'numeric' }) 
    : 'Không có hạn chót'
  const isOverdue = submissionStats?.isOverdue || false

  let text = `📢 [NHẮC NHỞ BÀI TẬP] - ${classNameText}\n`
  text += `📝 Bài tập: ${hwTitle}\n`
  text += `⏰ Hạn chót: ${dlStr} ${isOverdue ? '(ĐÃ QUÁ HẠN)' : ''}\n`
  text += `----------------------------------------\n`
  text += `Hiện còn ${unsubmittedStudents.length} bạn chưa hoàn thành bài:\n`

  unsubmittedStudents.forEach((st, idx) => {
    const statusText = st.status === 'IN_PROGRESS' ? 'Đang làm dở' : 'Chưa làm'
    text += `${idx + 1}. ${st.fullName || st.studentName} (@${st.username}) - [${statusText}]\n`
  })

  text += `----------------------------------------\n`
  text += `👉 Các bạn vui lòng truy cập nền tảng để hoàn thành bài tập sớm nhất nhé!`
  return text
}

function exportUnsubmittedToCsv() {
  if (unsubmittedStudents.length === 0) {
    showToast('Không có học sinh nào trong danh sách chưa nộp bài.', 'info')
    return
  }

  const selectedClass = (state.classes || []).find(c => c.id === selectedClassId)
  const classNameText = selectedClass ? selectedClass.name : 'Lop_hoc'
  const hwTitle = (submissionStats?.homeworkTitle || 'Bai_tap').replace(/[^a-zA-Z0-9_\u00C0-\u024F\u1E00-\u1EFF]/g, '_')

  let csvContent = '\uFEFF' // UTF-8 BOM for Excel
  csvContent += 'STT,Họ và tên,Tên tài khoản,Trạng thái làm bài,Tình trạng hạn chót,Hạn chót\n'

  unsubmittedStudents.forEach((st, idx) => {
    const name = `"${(st.fullName || st.studentName || '').replace(/"/g, '""')}"`
    const user = `"${(st.username || '').replace(/"/g, '""')}"`
    const status = st.status === 'IN_PROGRESS' ? 'Đang trong phòng thi' : 'Chưa bắt đầu'
    const overdue = st.isOverdue ? 'Quá hạn' : 'Còn hạn'
    const dl = st.deadline ? new Date(st.deadline).toLocaleString('vi-VN') : 'Không có'
    csvContent += `${idx + 1},${name},${user},${status},${overdue},"${dl}"\n`
  })

  const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' })
  const url = URL.createObjectURL(blob)
  const link = document.createElement('a')
  link.setAttribute('href', url)
  link.setAttribute('download', `DS_Chua_Nop_${classNameText}_${hwTitle}.csv`)
  document.body.appendChild(link)
  link.click()
  document.body.removeChild(link)
  URL.revokeObjectURL(url)

  showToast('Đã xuất file CSV danh sách chưa làm bài thành công!', 'success')
}

export async function loadAdminHistoryData(classId = '', homeworkId = '') {
  selectedClassId = classId || ''
  selectedHomeworkId = homeworkId || ''

  submissions = []
  wrongQuestionsSummary = []
  submissionStats = null
  unsubmittedStudents = []

  if (!classId && !homeworkId) {
    classHomeworks = []
    return
  }

  // Pre-seed from memory cache if available for instant dropdown rendering
  if (classId && classHomeworksCache.has(classId)) {
    classHomeworks = classHomeworksCache.get(classId) || []
  }

  try {
    // 1. Build query string for student-history
    let queryStr = classId ? `classId=${classId}` : ''
    if (homeworkId) {
      queryStr += `${queryStr ? '&' : ''}homeworkId=${homeworkId}`
    }

    // 2. Single optimized request: backend bundles history, stats, unsubmittedStudents & classHomeworks in parallel
    const result = await api.getStudentHistory(queryStr)
    submissions = result?.history || []
    wrongQuestionsSummary = result?.wrongQuestionsSummary || []
    submissionStats = result?.submissionStats || null
    unsubmittedStudents = result?.unsubmittedStudents || []

    // If backend returned bundled classHomeworks, update and cache
    if (result?.classHomeworks && result.classHomeworks.length > 0) {
      classHomeworks = result.classHomeworks
      if (classId) {
        classHomeworksCache.set(classId, classHomeworks)
      }
    } else if (classId && (!classHomeworks || classHomeworks.length === 0)) {
      // Fallback only if cache was empty and backend didn't bundle
      try {
        const hwList = await api.getHomeworks('', classId)
        classHomeworks = hwList || []
        classHomeworksCache.set(classId, classHomeworks)
      } catch (e) {
        console.warn('Fallback homework fetch error:', e)
      }
    }

    // If only homeworkId was passed and classId was inferred by backend
    if (!selectedClassId && result?.classId) {
      selectedClassId = result.classId
    }

    // 3. Client-side fallback if backend edge function didn't return unsubmittedStudents
    if (classId && homeworkId && unsubmittedStudents.length === 0 && (!result?.unsubmittedStudents || result.unsubmittedStudents.length === 0)) {
      if (!state.students || state.students.length === 0) {
        try {
          const fetchedStudents = await api.getStudents()
          state.students = fetchedStudents || []
        } catch (e) {}
      }
      const allStudents = state.students || []
      const classStudents = allStudents.filter(s => 
        s.classIds ? s.classIds.includes(classId) : (s.classId === classId)
      )

      const submittedIds = new Set(submissions.map(s => s.studentId || s.id))
      const unsubmittedList = classStudents.filter(s => !submittedIds.has(s.id))
      
      const selectedHw = classHomeworks.find(h => h.id === homeworkId)
      const deadline = selectedHw?.deadline || null
      const isOverdue = deadline ? new Date() > new Date(deadline) : false

      unsubmittedStudents = unsubmittedList.map(s => ({
        id: s.id,
        studentId: s.id,
        fullName: s.fullName || s.full_name || 'Học sinh',
        studentName: s.fullName || s.full_name || 'Học sinh',
        username: s.username || '',
        status: 'NOT_STARTED',
        isOverdue,
        deadline
      }))
    }

    if (classId && homeworkId && !submissionStats) {
      const allStudents = state.students || []
      const classStudents = allStudents.filter(s => 
        s.classIds ? s.classIds.includes(classId) : (s.classId === classId)
      )
      const selectedHw = classHomeworks.find(h => h.id === homeworkId)
      const total = classStudents.length > 0 ? classStudents.length : (submissions.length + unsubmittedStudents.length)
      const subCount = submissions.length
      const unCount = unsubmittedStudents.length
      const rate = total > 0 ? Math.round((subCount / total) * 1000) / 10 : 0
      const dl = selectedHw?.deadline || null

      submissionStats = {
        totalStudents: total,
        submittedCount: subCount,
        unsubmittedCount: unCount,
        inProgressCount: unsubmittedStudents.filter(s => s.status === 'IN_PROGRESS').length,
        submissionRate: rate,
        deadline: dl,
        isOverdue: dl ? new Date() > new Date(dl) : false,
        homeworkTitle: selectedHw?.title || '',
        homeworkType: selectedHw?.type || 'PRACTICE',
        durationMinutes: selectedHw?.durationMinutes || selectedHw?.duration_minutes || 45
      }
    }
  } catch (err) {
    console.error('[AdminHistory] Failed to load history data:', err)
    submissions = []
    wrongQuestionsSummary = []
    submissionStats = null
    unsubmittedStudents = []
    showToast(`Tải lịch sử làm bài thất bại: ${err.message}`, 'error')
  }
}

export function bindAdminHistoryEvents() {
  bindSidebarEvents()

  // Tab switching events - NEVER trigger reload/network request, just toggle DOM display
  const tabBtnSubmitted = document.getElementById('tab-btn-submitted')
  const tabBtnUnsubmitted = document.getElementById('tab-btn-unsubmitted')
  const contentSubmitted = document.getElementById('tab-content-submitted')
  const contentUnsubmitted = document.getElementById('tab-content-unsubmitted')

  tabBtnSubmitted?.addEventListener('click', () => {
    currentTab = 'submitted'
    tabBtnSubmitted.classList.add('active')
    tabBtnUnsubmitted?.classList.remove('active')
    if (contentSubmitted) contentSubmitted.style.display = 'block'
    if (contentUnsubmitted) contentUnsubmitted.style.display = 'none'
  })

  tabBtnUnsubmitted?.addEventListener('click', () => {
    currentTab = 'unsubmitted'
    tabBtnUnsubmitted.classList.add('active')
    tabBtnSubmitted?.classList.remove('active')
    if (contentSubmitted) contentSubmitted.style.display = 'none'
    if (contentUnsubmitted) contentUnsubmitted.style.display = 'block'
  })

  // Class Select Change Event -> Update URL hash, router handles fetching and rendering cleanly
  const classSelect = document.getElementById('admin-history-class-select')
  classSelect?.addEventListener('change', (e) => {
    const classId = e.target.value
    if (classId) {
      window.location.hash = `#admin-history?classId=${classId}`
    } else {
      window.location.hash = `#admin-history`
    }
  })

  // Homework Select Change Event -> Update URL hash, router handles fetching and rendering cleanly
  const hwSelect = document.getElementById('admin-history-hw-select')
  hwSelect?.addEventListener('change', (e) => {
    const hwId = e.target.value
    const tabParam = currentTab ? `&tab=${currentTab}` : ''
    if (hwId) {
      window.location.hash = `#admin-history?classId=${selectedClassId}&homeworkId=${hwId}${tabParam}`
    } else {
      window.location.hash = `#admin-history?classId=${selectedClassId}${tabParam}`
    }
  })

  // Copy Reminder Button
  const copyReminderBtn = document.getElementById('btn-copy-reminder')
  copyReminderBtn?.addEventListener('click', () => {
    const text = generateReminderText()
    navigator.clipboard.writeText(text).then(() => {
      showToast('Đã sao chép nội dung nhắc nhở Zalo vào Clipboard!', 'success')
    }).catch(() => {
      const textArea = document.createElement('textarea')
      textArea.value = text
      document.body.appendChild(textArea)
      textArea.select()
      document.execCommand('copy')
      document.body.removeChild(textArea)
      showToast('Đã sao chép nội dung nhắc nhở Zalo vào Clipboard!', 'success')
    })
  })

  // Export CSV Button
  const exportCsvBtn = document.getElementById('btn-export-unsubmitted-csv')
  exportCsvBtn?.addEventListener('click', () => {
    exportUnsubmittedToCsv()
  })

  // Unsubmitted Filter Change
  const unsubmittedStatusFilter = document.getElementById('unsubmitted-status-filter')
  unsubmittedStatusFilter?.addEventListener('change', (e) => {
    unsubmittedFilter = e.target.value
    const tbody = document.getElementById('unsubmitted-table-body')
    if (tbody) tbody.innerHTML = renderUnsubmittedRows()
    attachStudentProfileButtons()
  })

  // Unsubmitted Search Input
  const unsubmittedSearchInput = document.getElementById('unsubmitted-search-input')
  unsubmittedSearchInput?.addEventListener('input', (e) => {
    unsubmittedSearch = e.target.value.trim()
    const tbody = document.getElementById('unsubmitted-table-body')
    if (tbody) tbody.innerHTML = renderUnsubmittedRows()
    attachStudentProfileButtons()
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

  // Search filter for submitted submissions
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

  // View student profile buttons click -> Navigate to student details
  function attachStudentProfileButtons() {
    document.querySelectorAll('.btn-view-student-profile').forEach(btn => {
      btn.addEventListener('click', () => {
        const studentId = btn.getAttribute('data-stuid')
        if (studentId) {
          window.location.hash = `#student-details?id=${studentId}`
        }
      })
    })
  }
  attachStudentProfileButtons()

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
          await loadAdminHistoryData(selectedClassId, selectedHomeworkId)
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

