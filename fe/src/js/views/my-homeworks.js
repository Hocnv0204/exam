if (typeof document !== 'undefined' && document.head) {
  import('../../css/mochi/homework-history.css')
}
import { renderSidebar, bindSidebarEvents } from '../components/sidebar.js'
import mascotUrl from '../../assets/mascot-study.svg'
import { renderNavbar } from '../components/navbar.js'
import { showToast } from '../components/toast.js'
import { openModal } from '../components/modal.js'
import { state } from '../state.js'
import { api } from '../api.js'
import { escapeHtml, downloadHomeworkPdf } from '../utils/download-helper.js'
import { canViewHomeworkPdf } from '../utils/homework-pdf-policy.js'
import { isMochiUI } from '../ui-flag.js'
import { renderMascot } from '../components/mascot.js'

// Đảm bảo nút làm/làm lại bài luôn hoạt động kể cả khi vào thẳng trang này
if (!window.confirmStartHomework) {
  window.confirmStartHomework = (homeworkId, type = 'PRACTICE') => {
    if (type === 'EXAM') {
      sessionStorage.removeItem(`exam_active_${homeworkId}`)
      window.location.hash = `#exam-room?homeworkId=${homeworkId}`
      return
    }
    openModal(
      'Xác nhận làm bài tập',
      `<p style="font-size:15px; color:#475569; line-height:1.6; margin:0;">
        Bạn có chắc chắn muốn bắt đầu làm bài tập này?<br>
        Thời gian làm bài sẽ <strong>bắt đầu đếm ngược ngay lập tức</strong>!
       </p>`,
      () => {
        window.location.hash = `#homework-attempt?homeworkId=${homeworkId}`
        return true
      }
    )
  }
}

let filterStatus = 'all' // all | done | todo
let filterClassId = ''
let filterChapterId = ''
let filterLessonId = ''
let filterSearch = ''
let currentPage = 1
const PAGE_SIZE = 10
let totalItems = 0
let totalPages = 1
let listRequestId = 0
let chapterRequestId = 0
let lessonRequestId = 0

function isMochiMode() {
  return Boolean(state.token) && state.user?.role === 'STUDENT' && isMochiUI()
}

export function renderClassicMyHomeworksView() {
  return `
    <div class="app-layout navy-student">
      ${renderSidebar('my-homeworks')}
      <div class="main-content">
        ${renderNavbar('Học tập / Bài tập của tôi')}
        <div class="content-body">
          <div class="navy-hero">
            <img src="${typeof mascotUrl !== 'undefined' ? mascotUrl : ''}" alt="Linh vật học tập">
            <div>
              <h1>Bài tập của tôi</h1>
              <p>Theo dõi bài chưa làm, đã làm và các bài cần xem lại.</p>
            </div>
          </div>
          <div class="page-header" style="margin-bottom:16px;">
            <div>
              <h2 class="page-title">Danh sách bài tập</h2>
              <p class="page-description">Tất cả bài tập và bài thi được giao theo lớp của bạn — gồm cả bài đã làm (điểm số, làm lại) và bài chưa làm.</p>
            </div>
            <div style="display:flex; gap:12px;">
              <button class="btn-secondary" id="btn-replay-myhw-tour"><i class="fa-solid fa-circle-question"></i> Hướng dẫn</button>
            </div>
          </div>

          <div id="myhw-stats" style="display:grid; grid-template-columns:repeat(auto-fit, minmax(180px, 1fr)); gap:12px; margin-bottom:16px;"></div>

          <div class="card" id="tour-myhw-filter" style="margin:0 0 16px 0; padding:14px 16px;">
            <div style="display:flex; gap:10px; flex-wrap:wrap; align-items:center;">
              <div style="display:flex; background:#f1f5f9; border-radius:10px; padding:3px; gap:4px;">
                 <button type="button" class="myhw-status-btn ${filterStatus === 'all' ? 'active' : ''}" data-status="all" aria-pressed="${filterStatus === 'all'}" style="border:none; padding:6px 14px; font-size:13px; font-weight:700; border-radius:8px; cursor:pointer;">Tất cả</button>
                <button type="button" class="myhw-status-btn" data-status="todo" style="border:none; padding:6px 14px; font-size:13px; font-weight:700; border-radius:8px; cursor:pointer;">Chưa làm</button>
                <button type="button" class="myhw-status-btn" data-status="done" style="border:none; padding:6px 14px; font-size:13px; font-weight:700; border-radius:8px; cursor:pointer;">Đã làm</button>
              </div>
              <select id="myhw-class-filter" style="height:38px; border:1px solid #cbd5e1; border-radius:8px; padding:0 10px; font-size:13px; min-width:180px;">
                <option value="">Tất cả lớp</option>
              </select>
              <select id="myhw-chapter-filter" aria-label="Lọc theo chương" disabled style="height:38px; border:1px solid #cbd5e1; border-radius:8px; padding:0 10px; font-size:13px; min-width:160px;">
                <option value="">Tất cả chương</option>
              </select>
              <select id="myhw-lesson-filter" aria-label="Lọc theo bài học" disabled style="height:38px; border:1px solid #cbd5e1; border-radius:8px; padding:0 10px; font-size:13px; min-width:160px;">
                <option value="">Tất cả bài học</option>
              </select>
              <div style="position:relative; flex:1; min-width:200px;">
                <i class="fa-solid fa-magnifying-glass" style="position:absolute; left:12px; top:12px; color:#94a3b8; font-size:13px;"></i>
                <input id="myhw-search" type="text" value="${escapeHtml(filterSearch)}" placeholder="Tìm theo tên bài..." style="width:100%; height:38px; border:1px solid #cbd5e1; border-radius:8px; padding:0 12px 0 36px; font-size:13px;">
              </div>
            </div>
          </div>

          <div id="myhw-list" style="display:flex; flex-direction:column; gap:12px;">
            <div style="text-align:center; padding:48px; color:#94a3b8;">
              <i class="fa-solid fa-spinner fa-spin" style="font-size:26px; color:#0066cc;"></i>
              <div style="margin-top:8px; font-size:13px;">Đang tải bài tập...</div>
            </div>
          </div>

          <div id="myhw-pagination" style="display:flex; align-items:center; justify-content:space-between; margin-top:14px; flex-wrap:wrap; gap:10px;"></div>
        </div>
      </div>
    </div>
  `
}

function renderMochiMyHomeworksView() {
  return `
    <div class="app-layout navy-student m-student-page m-homework-page">
      ${renderSidebar('my-homeworks')}
      <div class="main-content">
        ${renderNavbar('Học tập / Bài tập của tôi')}
        <main class="content-body">
          <div class="m-page-wrap">
            <header class="m-hw-hero">
              <div class="m-hw-hero-copy">
                <span class="m-chip m-chip--accent2">Học tập</span>
                <h1 class="m-hw-hero-title">Bài tập của tôi</h1>
                <p class="m-hw-hero-desc">Theo dõi bài chưa làm, đã làm và các bài cần xem lại.</p>
              </div>
              <div class="m-hw-hero-mascot">
                ${renderMascot({ mood: 'happy', size: 120 })}
              </div>
            </header>

            <div class="m-hw-top-bar">
              <div class="m-hw-title-group">
                <h2 class="m-hw-section-title">Danh sách bài tập</h2>
                <p class="m-hw-section-sub">Tất cả bài tập và bài thi được giao theo lớp của bạn — gồm cả bài đã làm và bài chưa làm.</p>
              </div>
              <button type="button" class="m-btn m-btn--secondary" id="btn-replay-myhw-tour" aria-label="Xem hướng dẫn bài tập">
                <i class="fa-solid fa-circle-question" aria-hidden="true"></i> Hướng dẫn
              </button>
            </div>

            <section id="myhw-stats" class="m-hw-stats" aria-label="Thống kê bài tập"></section>

            <section class="m-card m-hw-filters" id="tour-myhw-filter" aria-label="Bộ lọc bài tập">
              <div class="m-hw-filter-bar">
                <div class="m-hw-status-tabs" role="tablist" aria-label="Trạng thái bài tập">
                  <button type="button" role="tab" class="m-tab myhw-status-btn ${filterStatus === 'all' ? 'active' : ''}" data-status="all" aria-pressed="${filterStatus === 'all'}" aria-selected="${filterStatus === 'all'}">Tất cả</button>
                  <button type="button" role="tab" class="m-tab myhw-status-btn ${filterStatus === 'todo' ? 'active' : ''}" data-status="todo" aria-pressed="${filterStatus === 'todo'}" aria-selected="${filterStatus === 'todo'}">Chưa làm</button>
                  <button type="button" role="tab" class="m-tab myhw-status-btn ${filterStatus === 'done' ? 'active' : ''}" data-status="done" aria-pressed="${filterStatus === 'done'}" aria-selected="${filterStatus === 'done'}">Đã làm</button>
                </div>
                <div class="m-hw-select-group">
                  <select id="myhw-class-filter" class="m-select" aria-label="Lọc theo lớp học">
                    <option value="">Tất cả lớp</option>
                  </select>
                  <select id="myhw-chapter-filter" class="m-select" aria-label="Lọc theo chương" disabled>
                    <option value="">Tất cả chương</option>
                  </select>
                  <select id="myhw-lesson-filter" class="m-select" aria-label="Lọc theo bài học" disabled>
                    <option value="">Tất cả bài học</option>
                  </select>
                </div>
                <div class="m-hw-search-box">
                  <i class="fa-solid fa-magnifying-glass" aria-hidden="true"></i>
                  <input id="myhw-search" type="search" value="${escapeHtml(filterSearch)}" placeholder="Tìm theo tên bài..." aria-label="Tìm theo tên bài tập">
                </div>
              </div>
            </section>

            <div id="myhw-list" class="m-hw-list" aria-live="polite">
              <div class="m-loading-box">
                <i class="fa-solid fa-circle-notch fa-spin" aria-hidden="true"></i>
                <div>Đang tải bài tập...</div>
              </div>
            </div>

            <nav id="myhw-pagination" class="m-hw-pagination" aria-label="Phân trang bài tập"></nav>
          </div>
        </main>
      </div>
    </div>
  `
}

export function renderMyHomeworksView() {
  if (isMochiMode()) {
    return renderMochiMyHomeworksView()
  }
  return renderClassicMyHomeworksView()
}

function paintStatusButtons() {
  document.querySelectorAll('.myhw-status-btn').forEach(b => {
    const active = b.getAttribute('data-status') === filterStatus
    b.classList.toggle('active', active)
    b.setAttribute('aria-pressed', String(active))
    b.setAttribute('aria-selected', String(active))
  })
}

function renderClassicStats(stats) {
  const el = document.getElementById('myhw-stats')
  if (!el) return
  const card = (label, value, sub, color, bg) => `
    <div class="card" style="margin:0; padding:14px 16px; border-radius:12px; background:${bg}; border:1px solid #e2e8f0;">
      <div style="font-size:11px; font-weight:700; color:${color}; text-transform:uppercase;">${label}</div>
      <div style="font-size:22px; font-weight:800; color:#0f172a;">${value}</div>
      <div style="font-size:12px; color:#64748b;">${sub}</div>
    </div>
  `
  el.className = ''
  el.style.cssText = 'display:grid; grid-template-columns:repeat(auto-fit, minmax(180px, 1fr)); gap:12px; margin-bottom:16px;'
  el.innerHTML =
    card('Tổng bài được giao', stats.total ?? 0, 'Mọi lớp của bạn', '#0066cc', '#eff6ff') +
    card('Chưa làm', stats.todo ?? 0, 'Cần hoàn thành', '#b45309', '#fffbeb') +
    card('Đã làm', stats.done ?? 0, 'Có điểm số', '#15803d', '#f0fdf4') +
    card('Điểm trung bình', stats.avgScore ?? '—', 'Các bài đã làm', '#7c3aed', '#faf5ff')
}

export function renderMochiStats(stats) {
  const el = document.getElementById('myhw-stats')
  if (!el) return
  el.removeAttribute('style')
  el.className = 'm-hw-stats'

  const rawAvg = stats?.avgScore
  const avgNum = (rawAvg !== null && rawAvg !== undefined && rawAvg !== '') ? Number(rawAvg) : NaN
  const avgVal = Number.isFinite(avgNum)
    ? (Number.isInteger(avgNum) ? avgNum.toString() : Number(avgNum.toFixed(2)).toString())
    : '—'

  el.innerHTML = `
    <div class="m-stat-card m-stat-card--total">
      <div class="m-stat-label">Tổng bài được giao</div>
      <div class="m-stat-val">${stats?.total ?? 0}</div>
      <div class="m-chip m-chip--secondary">Mọi lớp của bạn</div>
    </div>
    <div class="m-stat-card m-stat-card--todo">
      <div class="m-stat-label">Chưa làm</div>
      <div class="m-stat-val">${stats?.todo ?? 0}</div>
      <div class="m-chip m-chip--warn">Cần hoàn thành</div>
    </div>
    <div class="m-stat-card m-stat-card--done">
      <div class="m-stat-label">Đã làm</div>
      <div class="m-stat-val">${stats?.done ?? 0}</div>
      <div class="m-chip m-chip--ok">Có điểm số</div>
    </div>
    <div class="m-stat-card m-stat-card--avg">
      <div class="m-stat-label">Điểm trung bình</div>
      <div class="m-stat-val">${avgVal}</div>
      <div class="m-chip m-chip--accent2">Các bài đã làm</div>
    </div>
  `
}

function renderStats(stats) {
  if (isMochiMode()) {
    renderMochiStats(stats)
  } else {
    renderClassicStats(stats)
  }
}

function getDeadlineInfo(deadline) {
  if (!deadline) return null
  const d = new Date(deadline)
  if (isNaN(d.getTime())) return null
  const now = new Date()
  const diffMs = d.getTime() - now.getTime()
  const isOverdue = diffMs < 0

  if (isOverdue) {
    return {
      urgency: 'overdue',
      chipClass: 'm-chip--warn',
      icon: 'fa-triangle-exclamation',
      label: `Quá hạn · ${d.toLocaleString('vi-VN')} (vẫn nộp được)`
    }
  }

  const hoursLeft = diffMs / (1000 * 60 * 60)
  const isToday = d.toDateString() === now.toDateString()
  if (isToday || hoursLeft <= 24) {
    const timeStr = d.toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit' })
    return {
      urgency: 'today',
      chipClass: 'm-chip--urgent',
      icon: 'fa-fire',
      label: `Hôm nay · ${timeStr}`
    }
  }

  return {
    urgency: 'upcoming',
    chipClass: 'm-chip--secondary',
    icon: 'fa-calendar-days',
    label: `Hạn chót: ${d.toLocaleString('vi-VN')}`
  }
}

function mochiHwCard(hw) {
  const isExam = (hw.type || 'PRACTICE') === 'EXAM'
  const canShowPdf = canViewHomeworkPdf(state.user?.role, hw)
  const deadlineInfo = getDeadlineInfo(hw.deadline)

  const typeBadge = isExam
    ? `<span class="m-chip m-chip--warn"><i class="fa-solid fa-award" aria-hidden="true"></i> BÀI THI</span>`
    : `<span class="m-chip"><i class="fa-solid fa-book-open" aria-hidden="true"></i> LUYỆN TẬP</span>`

  let statusBlock = ''
  let actions = ''

  if (hw.done) {
    const rawScore = (hw.score !== null && hw.score !== undefined && hw.score !== '') ? Number(hw.score) : NaN
    const hasScore = Number.isFinite(rawScore)
    const rawMax = (hw.maxScore !== null && hw.maxScore !== undefined && hw.maxScore !== '') ? Number(hw.maxScore) : NaN
    const hasValidMax = Number.isFinite(rawMax) && rawMax > 0
    const max = hasValidMax ? rawMax : 10
    const passed = hasScore ? hw.isPassed !== false : false

    const scoreDisplay = hasScore
      ? (Number.isInteger(rawScore) ? rawScore.toString() : Number(rawScore.toFixed(2)).toString())
      : '—'
    const scoreBoxClass = hasScore ? (passed ? 'is-passed' : 'is-failed') : 'is-unscored'
    const chipClass = hasScore ? (passed ? 'm-chip--ok' : 'm-chip--warn') : 'm-chip--secondary'
    const chipLabel = hasScore ? (passed ? 'ĐẠT' : 'CHƯA ĐẠT') : 'Chưa có điểm'

    statusBlock = `
      <div class="m-hw-score-row">
        <span class="m-hw-score ${scoreBoxClass}">
          ${scoreDisplay}/${max} điểm
        </span>
        <span class="m-chip ${chipClass}">
          ${chipLabel}
        </span>
        ${hw.isLate ? `<span class="m-chip m-chip--warn"><i class="fa-solid fa-clock-rotate-left" aria-hidden="true"></i> Nộp muộn</span>` : ''}
        <span class="m-hw-submitted-time">
          <i class="fa-regular fa-calendar-check" aria-hidden="true"></i> Nộp lúc: ${hw.submittedAt ? new Date(hw.submittedAt).toLocaleString('vi-VN') : '—'}
        </span>
      </div>
    `
    actions = `
      ${canShowPdf ? `<button type="button" class="m-btn m-btn--secondary btn-myhw-pdf" data-hwid="${hw.id}" title="Tải file PDF đề bài">
        <i class="fa-solid fa-file-arrow-down" aria-hidden="true"></i> Tải PDF
      </button>` : ''}
      <a href="#assignment-review?submissionId=${hw.submissionId}" class="m-btn m-btn--secondary">
        <i class="fa-solid fa-eye" aria-hidden="true"></i> Xem kết quả
      </a>
      <button type="button" class="m-btn m-btn--primary" onclick="window.confirmStartHomework('${hw.id}','${hw.type || 'PRACTICE'}')">
        <i class="fa-solid fa-rotate-right" aria-hidden="true"></i> Làm lại
      </button>
    `
  } else {
    statusBlock = deadlineInfo
      ? `<div class="m-hw-card-status"><span class="m-chip ${deadlineInfo.chipClass}"><i class="fa-solid ${deadlineInfo.icon}" aria-hidden="true"></i> ${deadlineInfo.label}</span></div>`
      : `<div class="m-hw-card-status"><span class="m-chip m-chip--ghost"><i class="fa-regular fa-clock" aria-hidden="true"></i> Không giới hạn thời gian nộp</span></div>`
    actions = `
      ${canShowPdf ? `<button type="button" class="m-btn m-btn--secondary btn-myhw-pdf" data-hwid="${hw.id}" title="Tải file PDF đề bài">
        <i class="fa-solid fa-file-arrow-down" aria-hidden="true"></i> Tải PDF
      </button>` : ''}
      <button type="button" class="m-btn m-btn--primary" onclick="window.confirmStartHomework('${hw.id}','${hw.type || 'PRACTICE'}')">
        <i class="fa-solid fa-pen-to-square" aria-hidden="true"></i> ${isExam ? 'Vào phòng thi' : 'Làm bài'}
      </button>
    `
  }

  return `
    <article class="m-hw-card myhw-card" data-status="${hw.done ? 'done' : 'todo'}" data-class="${hw.classId || ''}" data-title="${escapeHtml((hw.title || '').toLowerCase())}">
      <div class="m-hw-card-main">
        <div class="m-hw-card-tags">
          ${typeBadge}
          <span class="m-chip m-chip--secondary"><i class="fa-solid fa-graduation-cap" aria-hidden="true"></i> ${escapeHtml(hw.className || 'Lớp học')}</span>
        </div>
        <h3 class="m-hw-card-title">${escapeHtml(hw.title || 'Bài tập')}</h3>
        <div class="m-hw-card-meta">
          <span class="m-hw-meta-item"><i class="fa-regular fa-hourglass" aria-hidden="true"></i> ${hw.durationMinutes || 45} phút</span>
          ${hw.totalQuestions ? `<span class="m-hw-meta-item"><i class="fa-solid fa-list-ol" aria-hidden="true"></i> ${hw.totalQuestions} câu</span>` : ''}
        </div>
        ${statusBlock}
      </div>
      <div class="m-hw-card-actions">
        ${actions}
      </div>
    </article>
  `
}

export function hwCard(hw) {
  if (isMochiMode()) {
    return mochiHwCard(hw)
  }
  const isExam = (hw.type || 'PRACTICE') === 'EXAM'
  // Học sinh tuyệt đối không thấy nút tải PDF của BÀI THI (kể cả bài đã gắn PDF).
  const canShowPdf = canViewHomeworkPdf(state.user?.role, hw)
  const deadlineDate = hw.deadline && !isNaN(new Date(hw.deadline).getTime()) ? new Date(hw.deadline) : null
  const overdue = deadlineDate ? (new Date() > deadlineDate) : false
  const typeBadge = isExam
    ? `<span style="font-size:11px; font-weight:700; padding:2px 8px; border-radius:6px; background:#fef2f2; color:#dc2626; border:1px solid #fecaca;">BÀI THI</span>`
    : `<span style="font-size:11px; font-weight:700; padding:2px 8px; border-radius:6px; background:#eff6ff; color:#0284c7; border:1px solid #bfdbfe;">LUYỆN TẬP</span>`

  let statusBlock = ''
  let actions = ''
  if (hw.done) {
    const score = Number(hw.score ?? 0)
    const max = Number(hw.maxScore ?? 10)
    const passed = hw.isPassed !== false
    statusBlock = `
      <div style="display:flex; align-items:center; gap:8px; flex-wrap:wrap;">
        <span style="font-size:15px; font-weight:800; color:${passed ? '#15803d' : '#b91c1c'}; background:${passed ? '#f0fdf4' : '#fef2f2'}; border:1px solid ${passed ? '#bbf7d0' : '#fecaca'}; padding:4px 12px; border-radius:8px;">
          ${score}/${max} điểm
        </span>
        <span style="font-size:11px; font-weight:700; padding:2px 8px; border-radius:6px; background:${passed ? '#dcfce7' : '#fee2e2'}; color:${passed ? '#15803d' : '#b91c1c'};">
          ${passed ? 'ĐẠT' : 'CHƯA ĐẠT'}
        </span>
        ${hw.isLate ? `<span style="font-size:11px; font-weight:700; padding:2px 8px; border-radius:6px; background:#fffbeb; color:#b45309; border:1px solid #fde68a;">Nộp muộn</span>` : ''}
      </div>
      <div style="font-size:12px; color:#64748b; margin-top:4px;">Nộp lúc: ${hw.submittedAt ? new Date(hw.submittedAt).toLocaleString('vi-VN') : '—'}</div>
    `
    actions = `
      ${canShowPdf ? `<button type="button" class="btn-secondary btn-myhw-pdf" data-hwid="${hw.id}" style="padding:8px 12px; font-size:12px; font-weight:600; background:#eff6ff; color:#0066cc; border:1px solid #bfdbfe; border-radius:8px; display:inline-flex; align-items:center; gap:5px; cursor:pointer; white-space:nowrap;" title="Tải file PDF đề bài">
        <i class="fa-solid fa-file-arrow-down"></i> Tải PDF
      </button>` : ''}
      <a href="#assignment-review?submissionId=${hw.submissionId}" class="btn-secondary" style="padding:8px 14px; font-size:13px; font-weight:600; border-radius:8px; text-decoration:none; display:inline-flex; align-items:center; gap:6px;">
        <i class="fa-solid fa-eye"></i> Xem kết quả
      </a>
      <button type="button" class="btn-primary" onclick="window.confirmStartHomework('${hw.id}','${hw.type || 'PRACTICE'}')" style="padding:8px 16px; font-size:13px; font-weight:700; border-radius:8px; cursor:pointer; display:inline-flex; align-items:center; gap:6px; width:auto;">
        <i class="fa-solid fa-rotate-right"></i> Làm lại
      </button>
    `
  } else {
    statusBlock = deadlineDate ? `
      <div style="font-size:13px; font-weight:600; color:${overdue ? '#b91c1c' : '#475569'}; display:flex; align-items:center; gap:6px;">
        <i class="fa-regular fa-clock"></i> Hạn chót: ${deadlineDate.toLocaleString('vi-VN')}
        ${overdue ? `<span style="font-size:11px; font-weight:700; padding:2px 8px; border-radius:6px; background:#fef2f2; color:#b91c1c; border:1px solid #fecaca;">Quá hạn (vẫn nộp được)</span>` : ''}
      </div>
    ` : `<div style="font-size:12px; color:#94a3b8;">Không giới hạn thời gian nộp</div>`
    actions = `
      ${canShowPdf ? `<button type="button" class="btn-secondary btn-myhw-pdf" data-hwid="${hw.id}" style="padding:8px 12px; font-size:12px; font-weight:600; background:#eff6ff; color:#0066cc; border:1px solid #bfdbfe; border-radius:8px; display:inline-flex; align-items:center; gap:5px; cursor:pointer; white-space:nowrap;" title="Tải file PDF đề bài">
        <i class="fa-solid fa-file-arrow-down"></i> Tải PDF
      </button>` : ''}
      <button type="button" class="btn-primary" onclick="window.confirmStartHomework('${hw.id}','${hw.type || 'PRACTICE'}')" style="padding:8px 18px; font-size:13px; font-weight:700; border-radius:8px; cursor:pointer; display:inline-flex; align-items:center; gap:6px; width:auto; background:${overdue ? '#d97706' : ''}; border-color:${overdue ? '#d97706' : ''};">
        <i class="fa-solid fa-pen-to-square"></i> ${isExam ? 'Vào phòng thi' : 'Làm bài'}
      </button>
    `
  }

  return `
    <div class="card myhw-card" data-status="${hw.done ? 'done' : 'todo'}" data-class="${hw.classId || ''}" data-title="${escapeHtml((hw.title || '').toLowerCase())}" style="margin:0; padding:16px 18px; border-radius:14px;">
      <div style="display:flex; justify-content:space-between; gap:14px; flex-wrap:wrap;">
        <div style="flex:1; min-width:240px;">
          <div style="display:flex; align-items:center; gap:8px; flex-wrap:wrap; margin-bottom:6px;">
            ${typeBadge}
            <span style="font-size:12px; color:#64748b; font-weight:600;"><i class="fa-solid fa-users" style="font-size:11px;"></i> ${escapeHtml(hw.className || 'Lớp học')}</span>
          </div>
          <div style="font-size:15px; font-weight:700; color:#0f172a; margin-bottom:6px;">${escapeHtml(hw.title || 'Bài tập')}</div>
          <div style="font-size:12px; color:#64748b; margin-bottom:8px;"><i class="fa-regular fa-hourglass"></i> ${hw.durationMinutes || 45} phút</div>
          ${statusBlock}
        </div>
        <div style="display:flex; align-items:center; gap:8px; flex-wrap:wrap; align-content:center;">
          ${actions}
        </div>
      </div>
    </div>
  `
}

function renderPager() {
  const pager = document.getElementById('myhw-pagination')
  if (!pager) return
  if (totalItems === 0) {
    pager.innerHTML = ''
    return
  }
  const from = (currentPage - 1) * PAGE_SIZE + 1
  const to = Math.min(currentPage * PAGE_SIZE, totalItems)
  let nums = ''
  const startP = Math.max(1, Math.min(currentPage - 2, totalPages - 4))
  const endP = Math.min(totalPages, startP + 4)

  if (isMochiMode()) {
    for (let p = startP; p <= endP; p++) {
      nums += `<button type="button" class="${p === currentPage ? 'is-active' : ''}" data-myhw-page="${p}" aria-label="Trang ${p}" aria-current="${p === currentPage ? 'page' : 'false'}">${p}</button>`
    }
    pager.className = 'm-hw-pagination'
    pager.removeAttribute('style')
    pager.innerHTML = `
      <div class="m-hw-pagination-info">Hiển thị ${from}–${to} / ${totalItems} bài</div>
      ${totalPages <= 1 ? '' : `
      <div class="m-hw-pagination-btns">
        <button type="button" data-myhw-page="prev" ${currentPage <= 1 ? 'disabled' : ''} aria-label="Trang trước">‹ Trước</button>
        ${nums}
        <button type="button" data-myhw-page="next" ${currentPage >= totalPages ? 'disabled' : ''} aria-label="Trang sau">Sau ›</button>
      </div>`}
    `
  } else {
    for (let p = startP; p <= endP; p++) {
      nums += `<button data-myhw-page="${p}" style="min-width:32px; height:32px; border-radius:8px; border:1px solid ${p === currentPage ? '#0066cc' : '#cbd5e1'}; background:${p === currentPage ? '#0066cc' : '#ffffff'}; color:${p === currentPage ? '#ffffff' : '#334155'}; font-weight:700; font-size:13px; cursor:pointer;">${p}</button>`
    }
    pager.className = ''
    pager.style.cssText = 'display:flex; align-items:center; justify-content:space-between; margin-top:14px; flex-wrap:wrap; gap:10px;'
    pager.innerHTML = `
      <div style="font-size:13px; color:#64748b;">Hiển thị ${from}–${to} / ${totalItems} bài</div>
      ${totalPages <= 1 ? '' : `
      <div style="display:flex; align-items:center; gap:6px;">
        <button data-myhw-page="prev" ${currentPage <= 1 ? 'disabled' : ''} style="height:32px; padding:0 12px; border-radius:8px; border:1px solid #cbd5e1; background:#ffffff; font-size:13px; font-weight:600; cursor:pointer; opacity:${currentPage <= 1 ? '0.4' : '1'};">‹ Trước</button>
        ${nums}
        <button data-myhw-page="next" ${currentPage >= totalPages ? 'disabled' : ''} style="height:32px; padding:0 12px; border-radius:8px; border:1px solid #cbd5e1; background:#ffffff; font-size:13px; font-weight:600; cursor:pointer; opacity:${currentPage >= totalPages ? '0.4' : '1'};">Sau ›</button>
      </div>`}
    `
  }

  pager.querySelectorAll('[data-myhw-page]').forEach(btn => {
    btn.onclick = () => {
      const v = btn.getAttribute('data-myhw-page')
      if (v === 'prev') currentPage--
      else if (v === 'next') currentPage++
      else currentPage = parseInt(v, 10) || 1
      fetchMyHomeworks()
    }
  })
}

function myhwTourSteps() {
  return [
    { selector: '#tour-myhw-filter', title: 'Lọc bài tập', text: 'Lọc theo trạng thái, lớp, chương, bài học và tìm theo tên bài.' },
    { selector: '#myhw-stats', title: 'Tổng quan', text: 'Xem nhanh tổng số bài được giao, số bài chưa làm, đã làm và điểm trung bình của bạn.' },
    { selector: '#myhw-list', title: 'Danh sách bài', text: 'Bài chưa làm hiện hạn nộp \u2014 bấm "Làm bài" để bắt đầu ngay.' },
    { selector: '#myhw-list .myhw-card', title: 'Bài đã làm', text: 'Bài đã làm hiện điểm số và kết quả ĐẠT/CHƯA ĐẠT: bấm "Xem kết quả" để coi chi tiết từng câu, "Làm lại" để cải thiện điểm.' }
  ]
}

async function maybeStartMyhwTour() {
  const { startTour } = await import('../utils/tour.js')
  document.getElementById('btn-replay-myhw-tour')?.addEventListener('click', () => startTour(myhwTourSteps()))
}

async function fetchMyHomeworks() {
  const listEl = document.getElementById('myhw-list')
  if (!listEl) return
  const requestId = ++listRequestId
  const userId = state.user?.id
  if (listEl) {
    if (isMochiMode()) {
      listEl.innerHTML = `
        <div class="m-loading-box">
          <i class="fa-solid fa-circle-notch fa-spin" aria-hidden="true"></i>
          <div>Đang tải bài tập...</div>
        </div>
      `
    } else {
      listEl.innerHTML = `
        <div style="text-align:center; padding:48px; color:#94a3b8;">
          <i class="fa-solid fa-spinner fa-spin" style="font-size:26px; color:#0066cc;"></i>
          <div style="margin-top:8px; font-size:13px;">Đang tải bài tập...</div>
        </div>
      `
    }
  }
  try {
    const sp = new URLSearchParams({ status: filterStatus, page: String(currentPage), pageSize: String(PAGE_SIZE) })
    if (filterClassId) sp.set('classId', filterClassId)
    if (filterChapterId) sp.set('chapterId', filterChapterId)
    if (filterLessonId) sp.set('lessonId', filterLessonId)
    if (filterSearch.trim()) sp.set('search', filterSearch.trim())
    const res = await api.getMyHomeworks(`&${sp.toString()}`)
    if (requestId !== listRequestId || !listEl.isConnected || state.user?.id !== userId) return
    const items = res?.items || []
    totalItems = res?.total ?? items.length
    totalPages = res?.totalPages ?? 1
    currentPage = res?.page ?? currentPage
    renderStats(res?.stats || { total: 0, done: 0, todo: 0, avgScore: null })
    if (listEl) {
      if (items.length === 0) {
        listEl.innerHTML = isMochiMode()
          ? `<div class="m-empty-state">
              ${renderMascot({ mood: 'cheer', size: 140 })}
              <h3 class="m-empty-title">Không có bài nào khớp bộ lọc</h3>
              <p class="m-empty-desc">Thử đổi trạng thái hoặc chọn lớp học khác để xem thêm bài nhé!</p>
            </div>`
          : `<div class="card" style="margin:0; padding:40px; text-align:center; color:#64748b;">Không có bài nào khớp bộ lọc.</div>`
      } else {
        listEl.innerHTML = items.map(hwCard).join('')
        listEl.querySelectorAll('.btn-myhw-pdf').forEach(btn => {
          btn.onclick = () => downloadHomeworkPdf(btn.getAttribute('data-hwid'))
        })
      }
    }
    renderPager()
  } catch (err) {
    if (requestId !== listRequestId || !listEl.isConnected || state.user?.id !== userId) return
    if (listEl) {
      if (isMochiMode()) {
        listEl.innerHTML = `
          <div class="m-empty-state" style="border-color:var(--m-warn);">
            ${renderMascot({ mood: 'wink', size: 120 })}
            <h3 class="m-empty-title" style="color:var(--m-warn);">Không thể tải bài tập</h3>
            <p class="m-empty-desc">${escapeHtml(err.message)}</p>
          </div>
        `
      } else {
        listEl.innerHTML = `<div class="card" style="margin:0; padding:32px; text-align:center; color:#b91c1c;">Lỗi tải bài tập: ${escapeHtml(err.message)}</div>`
      }
    }
    showToast(`Lỗi tải bài tập: ${err.message}`, 'error')
  }
}

async function loadChapterOptions() {
  const select = document.getElementById('myhw-chapter-filter')
  const lesson = document.getElementById('myhw-lesson-filter')
  if (!select || !lesson) return
  const requestId = ++chapterRequestId
  ++lessonRequestId
  const classId = filterClassId
  const userId = state.user?.id
  select.disabled = true
  select.innerHTML = `<option value="">${classId ? 'Đang tải chương...' : 'Tất cả chương'}</option>`
  lesson.disabled = true
  lesson.innerHTML = '<option value="">Tất cả bài học</option>'
  if (!classId) return
  try {
    const chapters = await api.getChapters(classId)
    if (requestId !== chapterRequestId || !select.isConnected || state.user?.id !== userId || filterClassId !== classId) return
    if (!Array.isArray(chapters)) throw new Error('Dữ liệu chương không hợp lệ')
    select.innerHTML = '<option value="">Tất cả chương</option>' + chapters.map(ch => `<option value="${escapeHtml(ch.id)}">${escapeHtml(ch.title)}</option>`).join('')
    if (!chapters.some(ch => ch.id === filterChapterId)) {
      filterChapterId = ''
      filterLessonId = ''
    }
    select.value = filterChapterId
    select.disabled = false
    if (filterChapterId) await loadLessonOptions()
  } catch (err) {
    if (requestId !== chapterRequestId || !select.isConnected || state.user?.id !== userId) return
    select.innerHTML = '<option value="">Không tải được chương</option>'
    filterChapterId = ''
    filterLessonId = ''
    showToast('Không tải được danh sách chương. Hãy chọn lại lớp để thử lại.', 'error')
  }
}

async function loadLessonOptions() {
  const select = document.getElementById('myhw-lesson-filter')
  if (!select) return
  const requestId = ++lessonRequestId
  const chapterId = filterChapterId
  const userId = state.user?.id
  select.disabled = true
  select.innerHTML = `<option value="">${chapterId ? 'Đang tải bài học...' : 'Tất cả bài học'}</option>`
  if (!chapterId) return
  try {
    const lessons = await api.getLessons(chapterId)
    if (requestId !== lessonRequestId || !select.isConnected || state.user?.id !== userId || filterChapterId !== chapterId) return
    if (!Array.isArray(lessons)) throw new Error('Dữ liệu bài học không hợp lệ')
    select.innerHTML = '<option value="">Tất cả bài học</option>' + lessons.map(l => `<option value="${escapeHtml(l.id)}">${escapeHtml(l.title)}</option>`).join('')
    if (!lessons.some(l => l.id === filterLessonId)) filterLessonId = ''
    select.value = filterLessonId
    select.disabled = false
  } catch (err) {
    if (requestId !== lessonRequestId || !select.isConnected || state.user?.id !== userId) return
    select.innerHTML = '<option value="">Không tải được bài học</option>'
    filterLessonId = ''
    showToast('Không tải được danh sách bài học. Hãy chọn lại chương để thử lại.', 'error')
  }
}

export async function bindMyHomeworksEvents() {
  bindSidebarEvents()
  paintStatusButtons()
  maybeStartMyhwTour()
  const view = document.getElementById('myhw-list')
  const userId = state.user?.id

  // Lớp filter lấy từ lớp đã đăng ký của học sinh
  try {
    if (!state.classes || state.classes.length === 0) {
      state.classes = await api.getClasses().catch(() => [])
    }
  } catch (_) {}
  if (!view?.isConnected || state.user?.id !== userId) return
  const classSel = document.getElementById('myhw-class-filter')
  if (classSel) {
    classSel.innerHTML = '<option value="">Tất cả lớp</option>' +
      (state.classes || []).map(c => `<option value="${escapeHtml(c.id)}">${escapeHtml(c.name)}</option>`).join('')
    if (!(state.classes || []).some(c => c.id === filterClassId)) {
      filterClassId = ''
      filterChapterId = ''
      filterLessonId = ''
    }
    classSel.value = filterClassId
  }

  const chapterOptionsPromise = loadChapterOptions()
  const homeworksPromise = fetchMyHomeworks()
  await Promise.all([chapterOptionsPromise, homeworksPromise])
  if (!view.isConnected || state.user?.id !== userId) return

  document.querySelectorAll('.myhw-status-btn').forEach(b => {
    b.addEventListener('click', () => {
      filterStatus = b.getAttribute('data-status')
      currentPage = 1
      paintStatusButtons()
      fetchMyHomeworks()
    })
  })
  document.getElementById('myhw-class-filter')?.addEventListener('change', (e) => {
    filterClassId = e.target.value
    filterChapterId = ''
    filterLessonId = ''
    currentPage = 1
    loadChapterOptions()
    fetchMyHomeworks()
  })
  document.getElementById('myhw-chapter-filter')?.addEventListener('change', (e) => {
    filterChapterId = e.target.value
    filterLessonId = ''
    currentPage = 1
    loadLessonOptions()
    fetchMyHomeworks()
  })
  document.getElementById('myhw-lesson-filter')?.addEventListener('change', (e) => {
    filterLessonId = e.target.value
    currentPage = 1
    fetchMyHomeworks()
  })
  let timer
  document.getElementById('myhw-search')?.addEventListener('input', (e) => {
    clearTimeout(timer)
    timer = setTimeout(() => {
      filterSearch = e.target.value
      currentPage = 1
      fetchMyHomeworks()
    }, 350)
  })
}
