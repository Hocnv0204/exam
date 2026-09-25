import { renderSidebar, bindSidebarEvents } from '../components/sidebar.js'
import { renderNavbar } from '../components/navbar.js'
import { state } from '../state.js'
import { api } from '../api.js'
import { showToast } from '../components/toast.js'
import { openModal } from '../components/modal.js'
import { renderMath, renderMarkdown } from '../utils/exam-parser.js'

let currentMode = 'class' // 'class' | 'trial'
let selectedClassId = ''
let selectedHomeworkId = ''
let currentSubTab = 'submitted' // 'submitted' | 'wrong-questions' | 'unsubmitted'
let submissions = []
let wrongQuestionsSummary = []
let classHomeworks = []
let submissionStats = null
let unsubmittedStudents = []
let unsubmittedFilter = 'ALL' // 'ALL' | 'NOT_STARTED' | 'IN_PROGRESS'
let unsubmittedSearch = ''
const classHomeworksCache = new Map()

function parseQuestionPrompt(rawPrompt, qType) {
  let text = ''
  let options = []
  let explanation = ''
  let imageUrl = ''

  if (!rawPrompt) return { text: '', options: [], explanation: '', imageUrl: '' }

  if (typeof rawPrompt === 'string') {
    const trimmed = rawPrompt.trim()
    if (trimmed.startsWith('{') && trimmed.endsWith('}')) {
      try {
        const parsed = JSON.parse(trimmed)
        text = parsed.text || parsed.prompt || parsed.content || ''
        options = Array.isArray(parsed.options) ? parsed.options : []
        explanation = parsed.explanation || ''
        imageUrl = parsed.imageUrl || parsed.image || ''
        return { text, options, explanation, imageUrl }
      } catch (e) {
        text = rawPrompt
      }
    } else {
      text = rawPrompt
    }
  } else if (typeof rawPrompt === 'object' && rawPrompt !== null) {
    text = rawPrompt.text || rawPrompt.prompt || rawPrompt.content || ''
    options = Array.isArray(rawPrompt.options) ? rawPrompt.options : []
    explanation = rawPrompt.explanation || ''
    imageUrl = rawPrompt.imageUrl || rawPrompt.image || ''
    return { text, options, explanation, imageUrl }
  }

  return { text, options, explanation, imageUrl }
}

function renderQuestionPromptHtml(rawPrompt, qType) {
  const { text, options, explanation, imageUrl } = parseQuestionPrompt(rawPrompt, qType)
  
  let html = ''
  if (text) {
    html += `<div class="math-content" style="font-size:13px; color:#1e293b; line-height:1.5; margin-bottom:8px; font-weight:500; word-break:break-word;">${renderMarkdown(text)}</div>`
  }
  if (imageUrl) {
    html += `<div style="margin-bottom:8px; text-align:center;"><img src="${imageUrl}" style="max-width:100%; max-height:180px; border-radius:6px; border:1px solid #e2e8f0;"></div>`
  }
  if (options && options.length > 0) {
    html += `<div style="display:grid; grid-template-columns:1fr; gap:4px; margin-bottom:8px;">`
    options.forEach(opt => {
      const optId = opt.id || opt.key || ''
      const optText = opt.text || (typeof opt === 'string' ? opt : '')
      html += `
        <div style="font-size:12px; color:#334155; padding:3px 6px; background:#f8fafc; border-radius:4px; border:1px solid #f1f5f9; display:flex; align-items:baseline; gap:6px;">
          <strong style="color:#0284c7; min-width:16px;">${optId}.</strong>
          <span class="math-content" style="flex:1; line-height:1.4;">${renderMarkdown(optText)}</span>
        </div>
      `
    })
    html += `</div>`
  }
  if (explanation) {
    html += `
      <div style="font-size:11px; background:#f8fafc; border:1px dashed #cbd5e1; border-radius:6px; padding:6px 8px; color:#475569; margin-bottom:8px;">
        <span style="font-weight:700; color:#0066cc;"><i class="fa-solid fa-lightbulb"></i> Lời giải:</span>
        <div class="math-content" style="margin-top:2px; word-break:break-word;">${renderMarkdown(explanation)}</div>
      </div>
    `
  }
  return html
}

function formatGivenAnswer(rawAnswer, qType) {
  if (rawAnswer === undefined || rawAnswer === null || rawAnswer === '') {
    return 'Bỏ trống (Chưa làm)'
  }

  let val = rawAnswer
  if (typeof val === 'string' && (val.startsWith('{') || val.startsWith('['))) {
    try {
      val = JSON.parse(val)
    } catch {}
  }

  if (typeof val === 'object' && val !== null) {
    if (val.value !== undefined) {
      val = val.value
    }
  }

  if (val === undefined || val === null || val === '' || val === 'null' || val === '{}') {
    return 'Bỏ trống (Chưa làm)'
  }

  if (typeof val === 'object' && val !== null) {
    if (qType === 'TRUE_FALSE') {
      const getLetter = (v) => (v === true || v === 'true' || v === 1 || v === '1') ? 'Đ' : ((v === false || v === 'false' || v === 0 || v === '0') ? 'S' : '-')
      const a = getLetter(val.a !== undefined ? val.a : val.s1)
      const b = getLetter(val.b !== undefined ? val.b : val.s2)
      const c = getLetter(val.c !== undefined ? val.c : val.s3)
      const d = getLetter(val.d !== undefined ? val.d : val.s4)
      return `a: ${a}, b: ${b}, c: ${c}, d: ${d}`
    }
    return JSON.stringify(val)
  }

  return String(val)
}

function formatCorrectAnswer(rawAns, qType) {
  if (!rawAns || rawAns === 'N/A') return 'N/A'
  if (typeof rawAns === 'object') {
    if (qType === 'TRUE_FALSE') {
      const getLetter = (v) => (v === true || v === 'true' || v === 1 || v === '1') ? 'Đ' : ((v === false || v === 'false' || v === 0 || v === '0') ? 'S' : '-')
      const a = getLetter(rawAns.a !== undefined ? rawAns.a : rawAns.s1)
      const b = getLetter(rawAns.b !== undefined ? rawAns.b : rawAns.s2)
      const c = getLetter(rawAns.c !== undefined ? rawAns.c : rawAns.s3)
      const d = getLetter(rawAns.d !== undefined ? rawAns.d : rawAns.s4)
      return `a: ${a}, b: ${b}, c: ${c}, d: ${d}`
    }
    if (rawAns.answer !== undefined) return String(rawAns.answer)
    return JSON.stringify(rawAns)
  }
  if (typeof rawAns === 'string' && rawAns.startsWith('{')) {
    try {
      const parsed = JSON.parse(rawAns)
      return formatCorrectAnswer(parsed, qType)
    } catch {}
  }
  return String(rawAns)
}

function formatScore(val) {
  if (val === undefined || val === null) return '0'
  const num = Number(val)
  if (isNaN(num)) return '0'
  return Number.isInteger(num) ? num.toString() : Number(num.toFixed(2)).toString()
}

function parseUrlParams() {
  const hash = window.location.hash || ''
  const queryIndex = hash.indexOf('?')
  if (queryIndex !== -1) {
    const params = new URLSearchParams(hash.substring(queryIndex + 1))
    const mode = params.get('mode')
    const tabParam = params.get('tab') || params.get('subTab')
    const cId = params.get('classId')
    const hId = params.get('homeworkId')

    if (mode === 'trial' || tabParam === 'trial' || cId === 'TRIAL') {
      currentMode = 'trial'
      selectedClassId = 'TRIAL'
    } else {
      currentMode = 'class'
      if (cId && cId !== 'TRIAL') {
        selectedClassId = cId
      }
    }
    selectedHomeworkId = hId || ''
    if (tabParam && ['submitted', 'wrong-questions', 'unsubmitted'].includes(tabParam)) {
      currentSubTab = tabParam
    }
  }
}

function formatRemainingTime(deadline) {
  if (!deadline) return ''
  const diff = new Date(deadline).getTime() - new Date().getTime()
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
  const isTrialMode = currentMode === 'trial'

  // If in class mode and no classId is selected, default to the first class if available
  if (!isTrialMode && !selectedClassId && classes.length > 0) {
    selectedClassId = classes[0].id
  }

  // Find selected class and homework names
  const selectedClass = classes.find(c => c.id === selectedClassId)
  const classNameText = isTrialMode ? '🌟 Học sinh học thử (Khách trải nghiệm)' : (selectedClass ? selectedClass.name : 'Chưa chọn lớp')

  const selectedHw = classHomeworks.find(h => h.id === selectedHomeworkId)
  const hwNameText = selectedHw ? selectedHw.title : (submissionStats?.homeworkTitle || (isTrialMode ? 'Tất cả bài tập học thử' : 'Tất cả bài tập trong lớp'))

  const totalClassStudents = submissionStats?.totalStudents || 0
  const submittedCount = submissionStats?.submittedCount !== undefined ? submissionStats.submittedCount : submissions.length
  const unsubmittedCount = submissionStats?.unsubmittedCount !== undefined ? submissionStats.unsubmittedCount : unsubmittedStudents.length
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
          
          <div class="page-header" style="margin-bottom:20px;">
            <div>
              <h1 class="page-title">Lịch sử & Theo dõi nộp bài</h1>
              <p class="page-description">Theo dõi tiến độ nộp bài của học sinh trong lớp hoặc danh sách khách trải nghiệm học thử (Leads).</p>
            </div>
          </div>

          <!-- 2 Segmented Navigation Tabs (Chia rõ 2 đối tượng) -->
          <div style="display:flex; gap:12px; margin-bottom:24px; border-bottom:2px solid #e2e8f0; padding-bottom:12px; flex-wrap:wrap;">
            <button id="btn-mode-class" class="btn-mode ${!isTrialMode ? 'active' : ''}" style="display:inline-flex; align-items:center; gap:8px; padding:10px 22px; font-size:15px; font-weight:700; border-radius:10px; cursor:pointer; transition:all 0.2s; border:1.5px solid ${!isTrialMode ? '#0066cc' : '#cbd5e1'}; background:${!isTrialMode ? '#eff6ff' : '#ffffff'}; color:${!isTrialMode ? '#0066cc' : '#64748b'}; box-shadow:${!isTrialMode ? '0 2px 8px rgba(0,102,204,0.1)' : 'none'};">
              <i class="fa-solid fa-graduation-cap"></i> 1. Học sinh trong lớp (Chính thức)
            </button>
            <button id="btn-mode-trial" class="btn-mode ${isTrialMode ? 'active' : ''}" style="display:inline-flex; align-items:center; gap:8px; padding:10px 22px; font-size:15px; font-weight:700; border-radius:10px; cursor:pointer; transition:all 0.2s; border:1.5px solid ${isTrialMode ? '#16a34a' : '#cbd5e1'}; background:${isTrialMode ? '#f0fdf4' : '#ffffff'}; color:${isTrialMode ? '#16a34a' : '#64748b'}; box-shadow:${isTrialMode ? '0 2px 8px rgba(22,163,74,0.1)' : 'none'};">
              <i class="fa-solid fa-sparkles"></i> 2. Học sinh học thử (Khách trải nghiệm & Leads)
            </button>
          </div>

          ${isTrialMode ? `
            <!-- ================= TAB 2: HỌC SINH HỌC THỬ (LEADS) ================= -->

            <!-- Trial KPI Card -->
            <div class="card" style="margin-bottom:24px; padding:20px; border:1px solid #bbf7d0; border-radius:14px; background:linear-gradient(135deg, #ffffff 0%, #f0fdf4 100%); box-shadow:0 2px 10px rgba(22,163,74,0.04);">
              <div style="display:flex; justify-content:space-between; align-items:flex-start; flex-wrap:wrap; gap:12px; margin-bottom:16px;">
                <div>
                  <div style="font-size:11px; font-weight:700; color:#15803d; text-transform:uppercase; margin-bottom:4px; display:flex; align-items:center; gap:6px;">
                    <i class="fa-solid fa-sparkles"></i> Tổng quan học sinh học thử
                  </div>
                  <h2 style="font-family:var(--font-heading); font-size:18px; font-weight:700; color:#0f172a; margin:0 0 4px 0;">
                    ${hwNameText}
                  </h2>
                  <div style="font-size:12px; color:#64748b;">
                    Danh sách các bạn học sinh làm bài trải nghiệm và để lại thông tin liên hệ (Leads)
                  </div>
                </div>

                <div style="display:flex; align-items:center; gap:10px;">
                  <button class="btn-secondary" id="btn-export-trial-csv" style="padding:8px 16px; font-size:13px; font-weight:700; cursor:pointer; border-radius:8px; display:inline-flex; align-items:center; gap:6px; background:#16a34a; border:1px solid #15803d; color:#ffffff;">
                    <i class="fa-solid fa-file-excel"></i> Xuất Excel danh sách Leads / SĐT
                  </button>
                </div>
              </div>

              <!-- 4 Stat Counters for Trial -->
              <div style="display:grid; grid-template-columns: repeat(auto-fit, minmax(140px, 1fr)); gap:12px;">
                <div style="background:#ffffff; border:1px solid #bbf7d0; border-radius:10px; padding:12px 14px;">
                  <div style="font-size:11px; font-weight:700; color:#15803d; text-transform:uppercase;"><i class="fa-solid fa-paper-plane"></i> Tổng lượt nộp bài</div>
                  <div style="font-size:22px; font-weight:800; color:#15803d; margin-top:2px;">${submissions.length}</div>
                </div>

                <div style="background:#ffffff; border:1px solid #bfdbfe; border-radius:10px; padding:12px 14px;">
                  <div style="font-size:11px; font-weight:700; color:#0284c7; text-transform:uppercase;"><i class="fa-solid fa-star"></i> Điểm trung bình</div>
                  <div style="font-size:22px; font-weight:800; color:#0284c7; margin-top:2px;">
                    ${submissionStats?.averageScore || '0'}<span style="font-size:13px; font-weight:600; color:#64748b;">/10</span>
                  </div>
                </div>

                <div style="background:#ffffff; border:1px solid #fed7aa; border-radius:10px; padding:12px 14px;">
                  <div style="font-size:11px; font-weight:700; color:#c2410c; text-transform:uppercase;"><i class="fa-solid fa-circle-check"></i> Tỷ lệ đạt (>= 5đ)</div>
                  <div style="font-size:22px; font-weight:800; color:#ea580c; margin-top:2px;">
                    ${submissionStats?.passRate || 0}% <span style="font-size:12px; font-weight:600; color:#64748b;">(${submissionStats?.passCount || 0} bài)</span>
                  </div>
                </div>

                <div style="background:#ffffff; border:1px solid #e9d5ff; border-radius:10px; padding:12px 14px;">
                  <div style="font-size:11px; font-weight:700; color:#7e22ce; text-transform:uppercase;"><i class="fa-solid fa-phone"></i> SĐT thu thập (Leads)</div>
                  <div style="font-size:22px; font-weight:800; color:#9333ea; margin-top:2px;">
                    ${submissionStats?.leadsCount || 0} <span style="font-size:12px; font-weight:600; color:#64748b;">SĐT</span>
                  </div>
                </div>
              </div>
            </div>

            <!-- Trial Filters & Search Area -->
            <div class="card" style="margin-bottom:24px; padding:18px 20px;">
              <div style="display:flex; align-items:center; gap:16px; flex-wrap:wrap;">
                
                <!-- Filter by Trial Homework -->
                <div style="display:flex; flex-direction:column; gap:6px; min-width:280px; flex:1;">
                  <label style="font-size:12px; font-weight:700; color:#15803d; text-transform:uppercase;">
                    <i class="fa-solid fa-book-open-reader"></i> Lọc theo bài tập học thử
                  </label>
                  <select id="admin-history-hw-select" class="form-input" style="background:#ffffff; cursor:pointer;">
                    <option value="">-- Tất cả bài tập học thử (${classHomeworks.length} bài) --</option>
                    ${classHomeworks.map(h => `
                      <option value="${h.id}" ${h.id === selectedHomeworkId ? 'selected' : ''}>${h.title} (${h.className})</option>
                    `).join('')}
                  </select>
                </div>

                <!-- Search Leads by Name or Phone -->
                <div style="display:flex; flex-direction:column; gap:6px; min-width:300px; flex:1;">
                  <label style="font-size:12px; font-weight:700; color:#64748b; text-transform:uppercase;">
                    <i class="fa-solid fa-magnifying-glass"></i> Tìm kiếm học sinh học thử
                  </label>
                  <div class="search-box" style="width:100%; margin:0;">
                    <i class="fa-solid fa-magnifying-glass"></i>
                    <input type="text" id="admin-history-lead-search" placeholder="Nhập tên hoặc số điện thoại (VD: 0853930832, Diệp Anh...)" style="width:100%;">
                  </div>
                </div>

              </div>
            </div>

            <!-- Trial Submissions Table -->
            <div class="card">
              <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:16px; flex-wrap:wrap; gap:12px;">
                <h3 style="font-family:var(--font-heading); font-size:16px; font-weight:700; color:#0f172a; margin:0;">
                  Danh sách học sinh học thử (${submissions.length} bài nộp)
                </h3>
              </div>

              <div class="table-responsive">
                <table class="data-table">
                  <thead>
                    <tr>
                      <th>Học sinh học thử</th>
                      <th>Số điện thoại (Leads)</th>
                      <th>Bài tập học thử</th>
                      <th>Ngày nộp</th>
                      <th>Điểm số</th>
                      <th>Câu sai</th>
                      <th>Thời gian làm</th>
                      <th style="text-align:center;">Thao tác</th>
                    </tr>
                  </thead>
                  <tbody id="admin-history-table-body">
                    ${submissions.length === 0 ? `
                      <tr>
                        <td colspan="8" style="text-align:center; padding:40px; color:#64748b;">
                          <i class="fa-solid fa-sparkles" style="font-size:36px; margin-bottom:12px; color:#bbf7d0; display:block;"></i>
                          Chưa có bài nộp học thử nào phù hợp với bộ lọc này.
                        </td>
                      </tr>
                    ` : submissions.map(sub => {
                      const isPassed = sub.isPassed !== false
                      const submittedDate = new Date(sub.submittedAt).toLocaleString('vi-VN')
                      const wrongList = sub.wrongAnswers || []
                      
                      return `
                        <tr class="history-row">
                          <td style="font-weight:700; color:#0f172a;" class="row-student-name">
                            <div style="display:flex; align-items:center; gap:6px; flex-wrap:wrap;">
                              <span>${sub.studentName}</span>
                              <span style="font-size:10px; font-weight:700; background:#dcfce7; color:#15803d; border:1px solid #86efac; padding:2px 8px; border-radius:10px;">HỌC THỬ</span>
                            </div>
                          </td>
                          <td>
                            ${sub.guestPhone ? `
                              <div style="display:flex; align-items:center; gap:6px;">
                                <span style="font-weight:800; font-size:13px; color:#0284c7; background:#e0f2fe; border:1px solid #bae6fd; padding:3px 8px; border-radius:6px;">
                                  <i class="fa-solid fa-phone" style="font-size:10px;"></i> ${sub.guestPhone}
                                </span>
                                <button class="btn-copy-phone" data-phone="${sub.guestPhone}" title="Sao chép SĐT" style="border:none; background:#eff6ff; color:#0066cc; border-radius:4px; cursor:pointer; padding:3px 7px; font-size:11px; font-weight:600;">
                                  <i class="fa-regular fa-copy"></i> Chép
                                </button>
                                <a href="tel:${sub.guestPhone}" title="Gọi điện" style="text-decoration:none; background:#f0fdf4; color:#16a34a; border:1px solid #bbf7d0; border-radius:4px; padding:3px 7px; font-size:11px; font-weight:600; display:inline-flex; align-items:center; gap:3px;">
                                  <i class="fa-solid fa-phone-volume"></i> Gọi
                                </a>
                              </div>
                            ` : `
                              <span style="color:#94a3b8; font-size:12px;">Không để lại SĐT</span>
                            `}
                          </td>
                          <td style="color:#475569;" class="row-hw-title">
                            <span style="font-weight:600; color:#0f172a;">${sub.homeworkTitle}</span>
                            <div style="font-size:11px; color:#64748b; margin-top:2px;">${sub.className}</div>
                          </td>
                          <td style="color:#64748b; font-size:12px;">${submittedDate}</td>
                          <td style="font-family:var(--font-heading); font-weight:700; font-size:16px; color:${isPassed ? '#16a34a' : '#dc2626'};">
                            <div style="display:flex; align-items:baseline; gap:3px;">
                              <span>${formatScore(sub.score)}</span>
                              <span style="font-size:12px; font-weight:600; color:#64748b;">/ ${formatScore(sub.maxScore || 10)}</span>
                            </div>
                            <div style="font-size:11px; font-weight:500; color:#64748b; font-family:var(--font-sans); margin-top:2px;">
                              (${sub.correctCount}/${(sub.correctCount || 0) + (sub.wrongCount || 0)} câu đúng)
                            </div>
                          </td>
                          <td>
                            ${wrongList.length === 0 ? `
                              <span style="color:#16a34a; font-weight:700; font-size:12px;"><i class="fa-solid fa-circle-check"></i> Đúng 100%</span>
                            ` : `
                              <div style="display:flex; align-items:center; gap:6px; flex-wrap:wrap;">
                                <button class="btn-secondary view-wrong-modal-btn" data-subid="${sub.submissionId}" data-stuname="${sub.studentName}" data-hwtitle="${sub.homeworkTitle}" style="padding:3px 8px; font-size:11px; font-weight:700; background:#fef2f2; color:#dc2626; border:1px solid #fecaca; border-radius:6px; cursor:pointer;">
                                  <i class="fa-solid fa-circle-xmark"></i> ${wrongList.length} câu sai
                                </button>
                              </div>
                            `}
                          </td>
                          <td style="color:#475569; font-weight:600; font-size:12px;">
                            ${(() => {
                              const secs = sub.durationSecondsTaken || 0
                              const mins = Math.floor(secs / 60)
                              const remainingSecs = secs % 60
                              return `${mins}m ${remainingSecs}s`
                            })()}
                          </td>
                          <td style="white-space:nowrap; text-align:center;">
                            <button class="btn-secondary view-detail-btn" data-id="${sub.submissionId}" title="Xem toàn bộ bài làm" style="padding:4px 10px; font-size:12px; cursor:pointer; color:#0066cc; border-color:#bfdbfe; background:#eff6ff;">
                              <i class="fa-solid fa-eye"></i> Xem bài
                            </button>
                          </td>
                        </tr>
                      `
                    }).join('')}
                  </tbody>
                </table>
              </div>
            </div>

          ` : `
            <!-- ================= TAB 1: HỌC SINH TRONG LỚP (CHÍNH THỨC) ================= -->

            <!-- Class & Homework Filter Area -->
            <div class="card" style="margin-bottom:24px; padding:20px;">
              <div style="display:flex; align-items:center; gap:16px; flex-wrap:wrap;">
                
                <!-- 1. Search & Select Class -->
                <div style="display:flex; flex-direction:column; gap:6px; min-width:260px; flex:1;">
                  <label style="font-size:12px; font-weight:700; color:#0066cc; text-transform:uppercase;">
                    <i class="fa-solid fa-graduation-cap"></i> Chọn Lớp Học <span style="color:#ef4444;">*</span>
                  </label>
                  <select id="admin-history-class-select" class="form-input" style="background:#ffffff; cursor:pointer; font-weight:600;">
                    <option value="">-- Chọn lớp học --</option>
                    ${classes.map(c => `
                      <option value="${c.id}" ${c.id === selectedClassId ? 'selected' : ''}>${c.name}</option>
                    `).join('')}
                  </select>
                </div>

                <!-- 2. Search & Select Homework of Class -->
                <div style="display:flex; flex-direction:column; gap:6px; min-width:280px; flex:1.5;">
                  <label style="font-size:12px; font-weight:700; color:#0284c7; text-transform:uppercase;">
                    <i class="fa-solid fa-book-open-reader"></i> Lọc theo Bài học / Bài tập
                  </label>
                  <select id="admin-history-hw-select" class="form-input" style="background:#ffffff; cursor:pointer;" ${!selectedClassId ? 'disabled' : ''}>
                    <option value="">-- Tất cả bài tập trong lớp (${classHomeworks.length} bài) --</option>
                    ${classHomeworks.map(h => `
                      <option value="${h.id}" ${h.id === selectedHomeworkId ? 'selected' : ''}>
                        ${h.title} ${h.type === 'EXAM' ? '[Bài thi]' : '[Luyện tập]'}
                      </option>
                    `).join('')}
                  </select>
                </div>
                
                <div style="display:flex; flex-direction:column; gap:4px; margin-left:auto; text-align:right; align-items:flex-end;">
                  <span style="font-size:12px; color:#64748b;">Đang xem lớp: <strong style="color:#0066cc;">${classNameText}</strong></span>
                  <span style="font-size:13px; font-weight:700; color:#0f172a;">${hwNameText}</span>
                  ${selectedHomeworkId ? `
                    <button class="btn-secondary redirect-edit-hw-btn" data-hwid="${selectedHomeworkId}" style="margin-top:4px; padding:4px 10px; font-size:12px; font-weight:600; display:inline-flex; align-items:center; gap:6px; cursor:pointer; background:#eff6ff; color:#0066cc; border:1px solid #bfdbfe; border-radius:6px; transition:all 0.2s;">
                      <i class="fa-solid fa-pen-to-square"></i> Chỉnh sửa bài tập này
                    </button>
                  ` : ''}
                </div>

              </div>
            </div>

            ${(selectedHomeworkId && submissionStats) ? `
              <!-- Progress KPI Overview Card for specific Homework -->
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
                    <span style="color:#64748b;">
                      <strong>${submittedCount}</strong>/${totalClassStudents} học sinh đã nộp
                    </span>
                  </div>
                  <div style="width:100%; height:8px; background:#e2e8f0; border-radius:4px; overflow:hidden;">
                    <div style="width:${submissionRate}%; height:100%; background:linear-gradient(90deg, #10b981, #059669); border-radius:4px; transition:width 0.4s ease;"></div>
                  </div>
                </div>

                <!-- 4 KPI Stat Counters -->
                <div style="display:grid; grid-template-columns: repeat(auto-fit, minmax(130px, 1fr)); gap:12px;">
                  <div style="background:#f8fafc; border:1px solid #e2e8f0; border-radius:10px; padding:12px 14px;">
                    <div style="font-size:11px; font-weight:700; color:#64748b; text-transform:uppercase;"><i class="fa-solid fa-users"></i> Sĩ số lớp</div>
                    <div style="font-size:22px; font-weight:800; color:#0f172a; margin-top:2px;">${totalClassStudents}</div>
                  </div>

                  <div style="background:#f0fdf4; border:1px solid #bbf7d0; border-radius:10px; padding:12px 14px;">
                    <div style="font-size:11px; font-weight:700; color:#15803d; text-transform:uppercase;"><i class="fa-solid fa-circle-check"></i> Đã nộp bài</div>
                    <div style="font-size:22px; font-weight:800; color:#16a34a; margin-top:2px;">${submittedCount}</div>
                  </div>

                  <div style="background:#fff7ed; border:1px solid #fed7aa; border-radius:10px; padding:12px 14px;">
                    <div style="font-size:11px; font-weight:700; color:#c2410c; text-transform:uppercase;"><i class="fa-solid fa-clock-rotate-left"></i> Chưa làm bài</div>
                    <div style="font-size:22px; font-weight:800; color:#ea580c; margin-top:2px;">${unsubmittedCount}</div>
                  </div>

                  <div style="background:#eff6ff; border:1px solid #bfdbfe; border-radius:10px; padding:12px 14px;">
                    <div style="font-size:11px; font-weight:700; color:#0066cc; text-transform:uppercase;"><i class="fa-solid fa-star"></i> Điểm TB lớp</div>
                    <div style="font-size:22px; font-weight:800; color:#0066cc; margin-top:2px;">
                      ${submissionStats.averageScore || '0'}<span style="font-size:13px; font-weight:600; color:#64748b;">/10</span>
                    </div>
                  </div>
                </div>

              </div>

              <!-- 3 Sub-tabs for Specific Homework -->
              <div style="display:flex; gap:8px; margin-bottom:16px; border-bottom:1px solid #e2e8f0; padding-bottom:12px;">
                <button id="tab-btn-submitted" class="btn-subtab ${currentSubTab === 'submitted' ? 'active' : ''}" style="padding:8px 16px; font-size:14px; font-weight:700; border-radius:8px; cursor:pointer; border:1px solid ${currentSubTab === 'submitted' ? '#0066cc' : '#e2e8f0'}; background:${currentSubTab === 'submitted' ? '#eff6ff' : '#ffffff'}; color:${currentSubTab === 'submitted' ? '#0066cc' : '#64748b'};">
                  <i class="fa-solid fa-list-check"></i> Đã nộp bài (${submissions.length})
                </button>
                <button id="tab-btn-wrong" class="btn-subtab ${currentSubTab === 'wrong-questions' ? 'active' : ''}" style="padding:8px 16px; font-size:14px; font-weight:700; border-radius:8px; cursor:pointer; border:1px solid ${currentSubTab === 'wrong-questions' ? '#ef4444' : '#e2e8f0'}; background:${currentSubTab === 'wrong-questions' ? '#fef2f2' : '#ffffff'}; color:${currentSubTab === 'wrong-questions' ? '#ef4444' : '#64748b'};">
                  <i class="fa-solid fa-circle-exclamation"></i> Phân tích câu sai (${wrongQuestionsSummary.length})
                </button>
                <button id="tab-btn-unsubmitted" class="btn-subtab ${currentSubTab === 'unsubmitted' ? 'active' : ''}" style="padding:8px 16px; font-size:14px; font-weight:700; border-radius:8px; cursor:pointer; border:1px solid ${currentSubTab === 'unsubmitted' ? '#ea580c' : '#e2e8f0'}; background:${currentSubTab === 'unsubmitted' ? '#fff7ed' : '#ffffff'}; color:${currentSubTab === 'unsubmitted' ? '#ea580c' : '#64748b'};">
                  <i class="fa-solid fa-user-clock"></i> Chưa làm bài (${unsubmittedStudents.length})
                </button>
              </div>
            ` : ''}

            <!-- Subtab Content: Wrong Questions Analysis -->
            ${(selectedHomeworkId && currentSubTab === 'wrong-questions') ? `
              <div class="card" style="margin-bottom:24px;">
                <div style="margin-bottom:16px;">
                  <h3 style="font-family:var(--font-heading); font-size:16px; font-weight:700; color:#dc2626; margin:0 0 4px 0;">
                    <i class="fa-solid fa-triangle-exclamation"></i> Các câu hỏi học sinh làm sai nhiều nhất
                  </h3>
                  <p style="font-size:13px; color:#64748b; margin:0;">Tổng hợp những câu hỏi có tỷ lệ trả lời sai hoặc bỏ trống cao trong bài tập này.</p>
                </div>

                ${wrongQuestionsSummary.length === 0 ? `
                  <div style="text-align:center; padding:40px; color:#16a34a; font-weight:600;">
                    <i class="fa-solid fa-circle-check" style="font-size:36px; display:block; margin-bottom:10px;"></i>
                    Chúc mừng! Chưa ghi nhận câu sai nào trong bài nộp của học sinh.
                  </div>
                ` : `
                  <div style="display:grid; grid-template-columns: repeat(auto-fill, minmax(340px, 1fr)); gap:16px;">
                    ${wrongQuestionsSummary.map(q => {
                      const qTypeStr = q.questionType === 'MULTIPLE_CHOICE' ? 'Trắc nghiệm ABCD' : (q.questionType === 'TRUE_FALSE' ? 'Đúng / Sai' : 'Trả lời ngắn')
                      const promptHtml = renderQuestionPromptHtml(q.prompt, q.questionType)
                      const correctAnsFormatted = formatCorrectAnswer(q.correctAnswer, q.questionType)

                      return `
                        <div style="background:#ffffff; border:1px solid #fecaca; border-radius:10px; padding:14px; box-shadow:0 1px 4px rgba(0,0,0,0.03); display:flex; flex-direction:column; justify-content:space-between;">
                          <div>
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
                            ${promptHtml}

                            <div style="font-size:12px; background:#f0fdf4; border:1px solid #bbf7d0; padding:6px 10px; border-radius:6px; color:#15803d; font-weight:700; margin-bottom:10px;">
                              <i class="fa-solid fa-circle-check"></i> Đáp án đúng: <span class="math-content">${correctAnsFormatted}</span>
                            </div>
                          </div>

                          <div style="border-top:1px dashed #e2e8f0; padding-top:8px; font-size:12px;">
                            <span style="font-size:11px; font-weight:700; color:#64748b; text-transform:uppercase; display:block; margin-bottom:4px;">Học sinh chưa đạt:</span>
                            <div style="display:flex; flex-direction:column; gap:4px; max-height:140px; overflow-y:auto; padding-right:4px;">
                              ${q.students.map(st => {
                                const ansFormatted = formatGivenAnswer(st.givenAnswer, q.questionType)
                                const isUnans = st.isUnanswered || ansFormatted.startsWith('Bỏ trống')
                                return `
                                  <div style="display:flex; justify-content:space-between; align-items:center; background:${isUnans ? '#fffbeb' : '#fef2f2'}; border:1px solid ${isUnans ? '#fde68a' : '#fee2e2'}; padding:4px 8px; border-radius:4px; font-size:11px;">
                                    <span style="font-weight:700; color:#0f172a;">${st.studentName}</span>
                                    ${isUnans ? `
                                      <span style="color:#b45309; font-weight:700;"><i class="fa-regular fa-square"></i> Bỏ trống</span>
                                    ` : `
                                      <span style="color:#dc2626; font-weight:600;">Điền: <strong class="math-content">${ansFormatted}</strong></span>
                                    `}
                                  </div>
                                `
                              }).join('')}
                            </div>
                          </div>
                        </div>
                      `
                    }).join('')}
                  </div>
                `}
              </div>
            ` : ''}

            <!-- Subtab Content: Unsubmitted Students -->
            ${(selectedHomeworkId && currentSubTab === 'unsubmitted') ? `
              <div class="card" style="margin-bottom:24px;">
                <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:16px; flex-wrap:wrap; gap:12px;">
                  <div>
                    <h3 style="font-family:var(--font-heading); font-size:16px; font-weight:700; color:#ea580c; margin:0 0 4px 0;">
                      <i class="fa-solid fa-clock-rotate-left"></i> Danh sách học sinh chưa làm bài (${unsubmittedStudents.length})
                    </h3>
                    <p style="font-size:13px; color:#64748b; margin:0;">Nhắc nhở học sinh nộp bài đúng hạn hoặc xuất file để gửi danh sách vào nhóm lớp.</p>
                  </div>
                  <div style="display:flex; gap:10px; align-items:center; flex-wrap:wrap;">
                    <button class="btn-secondary" id="btn-copy-reminder" style="padding:8px 14px; font-size:12px; font-weight:700; cursor:pointer; border-radius:8px; display:inline-flex; align-items:center; gap:6px; background:#eff6ff; color:#0066cc; border:1px solid #bfdbfe;">
                      <i class="fa-regular fa-copy"></i> Sao chép tin nhắn nhắc nhở
                    </button>
                    <button class="btn-secondary" id="btn-export-unsubmitted-csv" style="padding:8px 14px; font-size:12px; font-weight:700; cursor:pointer; border-radius:8px; display:inline-flex; align-items:center; gap:6px; background:#fff7ed; color:#ea580c; border:1px solid #fed7aa;">
                      <i class="fa-solid fa-file-excel"></i> Xuất Excel danh sách
                    </button>
                  </div>
                </div>

                <div class="table-responsive">
                  <table class="data-table">
                    <thead>
                      <tr>
                        <th>Học sinh</th>
                        <th>Tên đăng nhập</th>
                        <th>Trạng thái</th>
                        <th>Hạn chót</th>
                      </tr>
                    </thead>
                    <tbody>
                      ${unsubmittedStudents.length === 0 ? `
                        <tr>
                          <td colspan="4" style="text-align:center; padding:40px; color:#16a34a; font-weight:600;">
                            <i class="fa-solid fa-circle-check" style="font-size:36px; display:block; margin-bottom:10px;"></i>
                            Tuyệt vời! Tất cả học sinh trong lớp đã hoàn thành bài tập này.
                          </td>
                        </tr>
                      ` : unsubmittedStudents.map(st => `
                        <tr>
                          <td style="font-weight:700; color:#0f172a;">${st.fullName || st.studentName}</td>
                          <td style="color:#64748b;">@${st.username}</td>
                          <td>
                            <span class="badge" style="background:#fee2e2; color:#dc2626; border:1px solid #fecaca; padding:3px 8px; border-radius:6px; font-size:11px; font-weight:700;">
                              <i class="fa-solid fa-circle-xmark"></i> Chưa bắt đầu
                            </span>
                          </td>
                          <td>
                            ${st.deadline ? `
                              <span class="${isOverdue ? 'badge-deadline-overdue' : 'badge-deadline-pending'}">
                                ${isOverdue ? `Quá hạn (${formatRemainingTime(st.deadline)})` : formatRemainingTime(st.deadline)}
                              </span>
                            ` : '<span style="color:#94a3b8; font-size:12px;">Không có hạn</span>'}
                          </td>
                        </tr>
                      `).join('')}
                    </tbody>
                  </table>
                </div>
              </div>
            ` : ''}

            <!-- Subtab Content: Submitted List (Mặc định hoặc chọn Tất cả bài tập) -->
            ${(!selectedHomeworkId || currentSubTab === 'submitted') ? `
              <div class="card">
                <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:16px; flex-wrap:wrap; gap:12px;">
                  <h3 style="font-family:var(--font-heading); font-size:16px; font-weight:700; color:#0f172a; margin:0;">
                    Danh sách bài đã nộp (${submissions.length})
                  </h3>
                  <div style="display:flex; gap:10px; align-items:center; flex-wrap:wrap;">
                    <div class="search-box" style="width:260px; margin:0;">
                      <i class="fa-solid fa-magnifying-glass"></i>
                      <input type="text" id="admin-history-search" placeholder="Tìm tên học sinh, username, bài tập...">
                    </div>
                    <button class="btn-secondary" id="btn-export-submissions-csv" style="padding:8px 14px; font-size:12px; font-weight:600; cursor:pointer; border-radius:8px; display:inline-flex; align-items:center; gap:6px;">
                      <i class="fa-solid fa-file-excel" style="color:#16a34a;"></i> Xuất Excel bài nộp
                    </button>
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
                            Chưa có bài tập nào nộp phù hợp với bộ lọc này.
                          </td>
                        </tr>
                      ` : submissions.map(sub => {
                        const isPassed = sub.isPassed !== false
                        const submittedDate = new Date(sub.submittedAt).toLocaleString('vi-VN')
                        const wrongList = sub.wrongAnswers || []
                        
                        return `
                          <tr class="history-row">
                            <td style="font-weight:700; color:#0f172a;" class="row-student-name">
                              <div>${sub.studentName}</div>
                              ${sub.username ? `<div style="font-size:11px; font-weight:500; color:#64748b;">@${sub.username}</div>` : ''}
                            </td>
                            <td style="color:#475569;" class="row-hw-title">
                              <div style="margin-bottom: 4px; display:flex; align-items:center; gap:6px; flex-wrap:wrap;">
                                <span style="font-weight:600; color:#0f172a;">${sub.homeworkTitle}</span>
                                <button class="btn-secondary redirect-edit-hw-btn" data-hwid="${sub.homeworkId}" title="Chỉnh sửa bài tập này" style="padding:2px 6px; font-size:11px; cursor:pointer; color:#0066cc; border-color:#bae6fd; background:#eff6ff; border-radius:4px; display:inline-flex; align-items:center; gap:3px;">
                                  <i class="fa-solid fa-pen-to-square"></i> Sửa
                                </button>
                              </div>
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
                            <td style="color:#64748b; font-size:12px;">${submittedDate}</td>
                            <td style="font-family:var(--font-heading); font-weight:700; font-size:16px; color:${isPassed ? '#16a34a' : '#dc2626'};">
                              <div style="display:flex; align-items:baseline; gap:3px;">
                                <span>${formatScore(sub.score)}</span>
                                <span style="font-size:12px; font-weight:600; color:#64748b;">/ ${formatScore(sub.maxScore || 10)}</span>
                              </div>
                              <div style="font-size:11px; font-weight:500; color:#64748b; font-family:var(--font-sans); margin-top:2px;">
                                (${sub.correctCount}/${(sub.correctCount || 0) + (sub.wrongCount || 0)} câu đúng)
                              </div>
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
                                    ${wrongList.slice(0, 3).map(w => `
                                      <span style="background:#fee2e2; color:#991b1b; padding:1px 5px; border-radius:4px; font-size:10px; font-weight:700;">C${w.questionNumber}</span>
                                    `).join('')}
                                    ${wrongList.length > 3 ? `<span style="font-size:10px; color:#64748b; font-weight:700;">+${wrongList.length - 3}</span>` : ''}
                                  </div>
                                </div>
                              `}
                            </td>
                            <td style="color:#475569; font-weight:600; font-size:12px;">
                              ${(() => {
                                const secs = sub.durationSecondsTaken || 0
                                const mins = Math.floor(secs / 60)
                                const remainingSecs = secs % 60
                                return `${mins}m ${remainingSecs}s`
                              })()}
                            </td>
                            <td style="white-space:nowrap; text-align:center;">
                              <div style="display:flex; gap:6px; justify-content:center; flex-wrap:wrap;">
                                <button class="btn-secondary view-detail-btn" data-id="${sub.submissionId}" title="Xem toàn bộ bài làm" style="padding:4px 10px; font-size:12px; cursor:pointer;">
                                  <i class="fa-solid fa-eye"></i> Chi tiết
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
              </div>
            ` : ''}

          `}

        </div>
      </div>
    </div>
  `
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
  text += `Các bạn vui lòng hoàn thành bài tập sớm đúng hạn nhé!`
  return text
}

function exportUnsubmittedToCsv() {
  if (!unsubmittedStudents || unsubmittedStudents.length === 0) {
    showToast('Không có học sinh nào chưa làm bài để xuất file!', 'warning')
    return
  }

  const selectedClass = (state.classes || []).find(c => c.id === selectedClassId)
  const classNameText = selectedClass ? selectedClass.name.replace(/[^a-zA-Z0-9]/g, '_') : 'Lop_Hoc'
  const hwTitle = (submissionStats?.homeworkTitle || 'Bai_Tap').replace(/[^a-zA-Z0-9]/g, '_')

  let csvContent = '\uFEFF' // UTF-8 BOM
  csvContent += 'STT,Họ và tên,Tên tài khoản,Trạng thái,Hạn chót,Thời gian hạn\n'

  unsubmittedStudents.forEach((st, idx) => {
    const name = `"${(st.fullName || st.studentName || '').replace(/"/g, '""')}"`
    const user = `"${(st.username || '').replace(/"/g, '""')}"`
    const status = st.status === 'IN_PROGRESS' ? 'Đang làm dở' : 'Chưa bắt đầu'
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

function exportSubmissionsToCsv() {
  const isTrialMode = currentMode === 'trial'
  if (!submissions || submissions.length === 0) {
    showToast('Không có dữ liệu bài nộp để xuất file!', 'warning')
    return
  }

  const selectedClass = (state.classes || []).find(c => c.id === selectedClassId)
  const classNameText = isTrialMode ? 'Hoc_Sinh_Hoc_Thu' : (selectedClass ? selectedClass.name.replace(/[^a-zA-Z0-9]/g, '_') : 'Lop_Hoc')
  const hwTitle = (submissionStats?.homeworkTitle || 'Tat_Ca').replace(/[^a-zA-Z0-9]/g, '_')

  let csvContent = '\uFEFF' // UTF-8 BOM
  if (isTrialMode) {
    csvContent += 'STT,Họ và tên học thử,Số điện thoại (Leads),Tên bài tập,Điểm số,Thang điểm,Kết quả,Số câu đúng,Số câu sai,Thời gian làm,Ngày nộp bài\n'
    submissions.forEach((sub, idx) => {
      const isPassed = sub.isPassed ? 'Đạt' : 'Chưa đạt'
      const durSecs = sub.durationSecondsTaken || 0
      const durStr = `${Math.floor(durSecs / 60)}m ${durSecs % 60}s`
      const dateStr = sub.submittedAt ? new Date(sub.submittedAt).toLocaleString('vi-VN') : ''
      csvContent += `${idx + 1},"${(sub.studentName || '').replace(/"/g, '""')}","${sub.guestPhone || ''}","${(sub.homeworkTitle || '').replace(/"/g, '""')}",${sub.score || 0},${sub.maxScore || 10},"${isPassed}",${sub.correctCount || 0},${sub.wrongCount || 0},"${durStr}","${dateStr}"\n`
    })
  } else {
    csvContent += 'STT,Học sinh,Tên tài khoản,Lớp học,Tên bài tập,Điểm số,Thang điểm,Kết quả,Số câu đúng,Số câu sai,Thời gian làm,Ngày nộp bài\n'
    submissions.forEach((sub, idx) => {
      const isPassed = sub.isPassed ? 'Đạt' : 'Chưa đạt'
      const durSecs = sub.durationSecondsTaken || 0
      const durStr = `${Math.floor(durSecs / 60)}m ${durSecs % 60}s`
      const dateStr = sub.submittedAt ? new Date(sub.submittedAt).toLocaleString('vi-VN') : ''
      csvContent += `${idx + 1},"${(sub.studentName || '').replace(/"/g, '""')}","${sub.username || ''}","${(sub.className || '').replace(/"/g, '""')}","${(sub.homeworkTitle || '').replace(/"/g, '""')}",${sub.score || 0},${sub.maxScore || 10},"${isPassed}",${sub.correctCount || 0},${sub.wrongCount || 0},"${durStr}","${dateStr}"\n`
    })
  }

  const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' })
  const url = URL.createObjectURL(blob)
  const link = document.createElement('a')
  link.setAttribute('href', url)
  link.setAttribute('download', `DS_Nop_Bai_${classNameText}_${hwTitle}.csv`)
  document.body.appendChild(link)
  link.click()
  document.body.removeChild(link)
  URL.revokeObjectURL(url)

  showToast('Đã xuất file CSV danh sách bài nộp thành công!', 'success')
}

export async function loadAdminHistoryData(classId = '', homeworkId = '', mode = '') {
  // Update state from parameters
  if (mode === 'trial' || classId === 'TRIAL') {
    currentMode = 'trial'
    selectedClassId = 'TRIAL'
  } else {
    currentMode = 'class'
    selectedClassId = (classId && classId !== 'TRIAL') ? classId : (selectedClassId || '')
  }
  selectedHomeworkId = homeworkId || ''

  submissions = []
  wrongQuestionsSummary = []
  submissionStats = null
  unsubmittedStudents = []

  // If in class mode and no classId is specified, pick the first available class
  if (currentMode === 'class' && !selectedClassId && state.classes && state.classes.length > 0) {
    selectedClassId = state.classes[0].id
  }

  try {
    let queryStr = ''
    if (currentMode === 'trial') {
      queryStr = 'scope=TRIAL'
      if (selectedHomeworkId) {
        queryStr += `&homeworkId=${selectedHomeworkId}`
      }
    } else {
      queryStr = 'scope=CLASS'
      if (selectedClassId) {
        queryStr += `&classId=${selectedClassId}`
      }
      if (selectedHomeworkId) {
        queryStr += `&homeworkId=${selectedHomeworkId}`
      }
    }

    const result = await api.getStudentHistory(queryStr)
    submissions = result?.history || []
    wrongQuestionsSummary = result?.wrongQuestionsSummary || []
    submissionStats = result?.submissionStats || null
    unsubmittedStudents = result?.unsubmittedStudents || []

    if (result?.classHomeworks && result.classHomeworks.length > 0) {
      classHomeworks = result.classHomeworks
      if (selectedClassId) {
        classHomeworksCache.set(selectedClassId, classHomeworks)
      }
    } else if (currentMode === 'class' && selectedClassId) {
      if (classHomeworksCache.has(selectedClassId)) {
        classHomeworks = classHomeworksCache.get(selectedClassId) || []
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

  // 1. Mode Switcher: Class vs Trial
  const btnModeClass = document.getElementById('btn-mode-class')
  const btnModeTrial = document.getElementById('btn-mode-trial')

  btnModeClass?.addEventListener('click', () => {
    currentMode = 'class'
    const firstClassId = (state.classes && state.classes.length > 0) ? state.classes[0].id : ''
    window.location.hash = `#admin-history?mode=class${firstClassId ? `&classId=${firstClassId}` : ''}`
  })

  btnModeTrial?.addEventListener('click', () => {
    currentMode = 'trial'
    window.location.hash = `#admin-history?mode=trial`
  })

  // 2. Sub-tab switching: Submitted vs Wrong Analysis vs Unsubmitted
  const tabBtnSubmitted = document.getElementById('tab-btn-submitted')
  const tabBtnWrong = document.getElementById('tab-btn-wrong')
  const tabBtnUnsubmitted = document.getElementById('tab-btn-unsubmitted')

  tabBtnSubmitted?.addEventListener('click', () => {
    currentSubTab = 'submitted'
    window.location.hash = `#admin-history?mode=class&classId=${selectedClassId}&homeworkId=${selectedHomeworkId}&subTab=submitted`
  })

  tabBtnWrong?.addEventListener('click', () => {
    currentSubTab = 'wrong-questions'
    window.location.hash = `#admin-history?mode=class&classId=${selectedClassId}&homeworkId=${selectedHomeworkId}&subTab=wrong-questions`
  })

  tabBtnUnsubmitted?.addEventListener('click', () => {
    currentSubTab = 'unsubmitted'
    window.location.hash = `#admin-history?mode=class&classId=${selectedClassId}&homeworkId=${selectedHomeworkId}&subTab=unsubmitted`
  })

  // 3. Class Select Change
  const classSelect = document.getElementById('admin-history-class-select')
  classSelect?.addEventListener('change', (e) => {
    const classId = e.target.value
    if (classId) {
      window.location.hash = `#admin-history?mode=class&classId=${classId}`
    } else {
      window.location.hash = `#admin-history?mode=class`
    }
  })

  // 4. Homework Select Change
  const hwSelect = document.getElementById('admin-history-hw-select')
  hwSelect?.addEventListener('change', (e) => {
    const hwId = e.target.value
    if (currentMode === 'trial') {
      if (hwId) {
        window.location.hash = `#admin-history?mode=trial&homeworkId=${hwId}`
      } else {
        window.location.hash = `#admin-history?mode=trial`
      }
    } else {
      if (hwId) {
        window.location.hash = `#admin-history?mode=class&classId=${selectedClassId}&homeworkId=${hwId}`
      } else {
        window.location.hash = `#admin-history?mode=class&classId=${selectedClassId}`
      }
    }
  })

  // 5. Real-time Search for Formal Submissions
  const searchInput = document.getElementById('admin-history-search')
  searchInput?.addEventListener('input', (e) => {
    const query = e.target.value.toLowerCase().trim()
    document.querySelectorAll('.history-row').forEach(row => {
      const text = row.textContent.toLowerCase()
      row.style.display = text.includes(query) ? '' : 'none'
    })
  })

  // 6. Real-time Search for Trial Leads (Name or Phone)
  const leadSearchInput = document.getElementById('admin-history-lead-search')
  leadSearchInput?.addEventListener('input', (e) => {
    const query = e.target.value.toLowerCase().trim()
    document.querySelectorAll('.history-row').forEach(row => {
      const text = row.textContent.toLowerCase()
      row.style.display = text.includes(query) ? '' : 'none'
    })
  })

  // 7. Copy Phone Number Buttons
  document.querySelectorAll('.btn-copy-phone').forEach(btn => {
    btn.addEventListener('click', (e) => {
      e.stopPropagation()
      const phone = btn.getAttribute('data-phone')
      if (phone) {
        navigator.clipboard.writeText(phone).then(() => {
          showToast(`Đã sao chép SĐT: ${phone}`, 'success')
        }).catch(() => {
          showToast(`SĐT: ${phone}`, 'info')
        })
      }
    })
  })

  // 8. Export CSV Buttons
  document.getElementById('btn-export-trial-csv')?.addEventListener('click', () => {
    exportSubmissionsToCsv()
  })

  document.getElementById('btn-export-submissions-csv')?.addEventListener('click', () => {
    exportSubmissionsToCsv()
  })

  document.getElementById('btn-export-unsubmitted-csv')?.addEventListener('click', () => {
    exportUnsubmittedToCsv()
  })

  // 9. Copy Reminder Button
  document.getElementById('btn-copy-reminder')?.addEventListener('click', () => {
    const text = generateReminderText()
    navigator.clipboard.writeText(text).then(() => {
      showToast('Đã sao chép nội dung nhắc nhở bài tập!', 'success')
    }).catch(() => {
      showToast('Không thể sao chép văn bản!', 'error')
    })
  })

  // 10. View Submission Details
  document.querySelectorAll('.view-detail-btn').forEach(btn => {
    btn.addEventListener('click', (e) => {
      e.stopPropagation()
      const subId = btn.getAttribute('data-id')
      if (subId) {
        window.location.hash = `#assignment-review?submissionId=${subId}${currentMode === 'trial' ? '&trial=true' : ''}`
      }
    })
  })

  // 11. View Wrong Answers Modal
  document.querySelectorAll('.view-wrong-modal-btn').forEach(btn => {
    btn.addEventListener('click', (e) => {
      e.stopPropagation()
      const subId = btn.getAttribute('data-subid')
      const stuname = btn.getAttribute('data-stuname') || 'Học sinh'
      const hwtitle = btn.getAttribute('data-hwtitle') || 'Bài tập'
      const targetSub = submissions.find(s => s.submissionId === subId || s.id === subId)
      const wrongList = targetSub?.wrongAnswers || []

      openModal(`Chi tiết câu sai - ${stuname}`, `
        <div style="margin-bottom:12px;">
          <div style="font-size:13px; color:#64748b;">Bài tập: <strong style="color:#0f172a;">${hwtitle}</strong></div>
          <div style="font-size:13px; color:#dc2626; font-weight:700; margin-top:4px;">Tổng số câu làm sai / chưa làm: ${wrongList.length} câu</div>
        </div>
        <div style="display:flex; flex-direction:column; gap:10px; max-height:450px; overflow-y:auto;">
          ${wrongList.map(w => {
            const promptHtml = renderQuestionPromptHtml(w.prompt, w.questionType)
            const corr = formatCorrectAnswer(w.correctAnswer, w.questionType)
            const given = formatGivenAnswer(w.givenAnswer, w.questionType)
            const isUnans = w.isUnanswered || given.startsWith('Bỏ trống')

            return `
            <div style="background:#f8fafc; border:1px solid #e2e8f0; border-radius:8px; padding:10px 12px;">
              <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:6px;">
                <span style="font-weight:700; color:#ef4444; font-size:13px;">Câu ${w.questionNumber}</span>
                <span style="font-size:11px; background:${isUnans ? '#fef3c7' : '#fee2e2'}; color:${isUnans ? '#b45309' : '#991b1b'}; padding:2px 6px; border-radius:4px; font-weight:600;">
                  ${isUnans ? 'Chưa làm' : 'Sai'}
                </span>
              </div>
              ${promptHtml}
              <div style="font-size:12px; margin-bottom:3px;">
                <span style="color:#64748b;">Đáp án đã chọn:</span> 
                <strong style="color:#dc2626;" class="math-content">${given}</strong>
              </div>
              <div style="font-size:12px;">
                <span style="color:#64748b;">Đáp án đúng:</span> 
                <strong style="color:#16a34a;" class="math-content">${corr}</strong>
              </div>
            </div>
          `}).join('')}
        </div>
      `)
      setTimeout(() => renderMath(document.querySelector('#modal-container')), 50)
    })
  })

  // 12. Reopen Submission Modal
  document.querySelectorAll('.reopen-sub-btn').forEach(btn => {
    btn.addEventListener('click', (e) => {
      e.stopPropagation()
      const hwId = btn.getAttribute('data-hwid')
      const stuId = btn.getAttribute('data-stuid')
      const name = btn.getAttribute('data-name') || 'Học sinh'

      openModal('Khôi phục bài làm', `
        <div style="margin-bottom:16px;">
          <p style="font-size:14px; color:#334155; margin-bottom:12px;">
            Bạn đang cho phép học sinh <strong>${name}</strong> được làm lại bài tập này.
          </p>
          <div style="display:flex; flex-direction:column; gap:10px; background:#f8fafc; padding:12px; border-radius:8px; border:1px solid #e2e8f0;">
            <label style="display:flex; align-items:center; gap:8px; font-size:13px; cursor:pointer;">
              <input type="checkbox" id="reopen-reset-timer" checked>
              <span>Làm mới lại đồng hồ bấm giờ (Timer)</span>
            </label>
            <label style="display:flex; align-items:center; gap:8px; font-size:13px; cursor:pointer;">
              <input type="checkbox" id="reopen-reset-answers" checked>
              <span>Xóa câu trả lời cũ để học sinh làm bài mới hoàn toàn</span>
            </label>
          </div>
        </div>
        <div style="display:flex; justify-content:flex-end; gap:10px;">
          <button class="btn-secondary close-modal-btn" style="padding:8px 16px; cursor:pointer;">Hủy bỏ</button>
          <button class="btn-primary" id="confirm-reopen-btn" style="padding:8px 16px; cursor:pointer; background:#0066cc;">
            <i class="fa-solid fa-rotate-left"></i> Xác nhận khôi phục
          </button>
        </div>
      `)

      document.getElementById('confirm-reopen-btn')?.addEventListener('click', async () => {
        const resetTimer = document.getElementById('reopen-reset-timer')?.checked || false
        const resetAnswers = document.getElementById('reopen-reset-answers')?.checked || false
        try {
          await api.reopenSubmission(hwId, stuId, resetTimer, resetAnswers)
          showToast(`Đã cho phép ${name} làm lại bài tập thành công!`, 'success')
          document.querySelector('.modal-overlay')?.remove()
          await loadAdminHistoryData(selectedClassId, selectedHomeworkId, currentMode)
          const app = document.getElementById('app')
          if (app) {
            app.innerHTML = renderAdminHistoryView()
            bindAdminHistoryEvents()
          }
        } catch (err) {
          showToast(`Khôi phục thất bại: ${err.message}`, 'error')
        }
      })
    })
  })

  // 13. Redirect to Homework Editor
  document.querySelectorAll('.redirect-edit-hw-btn').forEach(btn => {
    btn.addEventListener('click', (e) => {
      e.stopPropagation()
      const hwId = btn.getAttribute('data-hwid')
      if (hwId) {
        window.location.hash = `#create-hw?editId=${hwId}`
      }
    })
  })

  // 14. Render KaTeX / Math / Chemical formulas on the page
  setTimeout(() => {
    const contentBody = document.querySelector('.content-body')
    if (contentBody) renderMath(contentBody)
  }, 50)
}
