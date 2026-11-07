if (typeof document !== 'undefined' && document.head) {
  import('../../css/mochi/homework-history.css')
}
import { renderSidebar, bindSidebarEvents } from '../components/sidebar.js'
import { renderNavbar } from '../components/navbar.js'
import { state } from '../state.js'
import { renderPaginationBar, bindPaginationEvents } from '../components/pagination.js'
import { isMochiUI } from '../ui-flag.js'
import { renderMascot } from '../components/mascot.js'
import { escapeHtml } from '../utils/download-helper.js'

let selectedClassId = ''
let selectedChapterId = ''
let selectedLessonId = ''
let searchQuery = ''
let currentPage = 1
let pageSize = 10

function isMochiMode() {
  return Boolean(state.token) && state.user?.role === 'STUDENT' && isMochiUI()
}

function formatScore(val) {
  if (val === undefined || val === null) return '0'
  const num = Number(val)
  if (isNaN(num)) return '0'
  return Number.isInteger(num) ? num.toString() : Number(num.toFixed(2)).toString()
}

function formatDuration(secs = 0) {
  const s = Number(secs) || 0
  const mins = Math.floor(s / 60)
  const remainingSecs = s % 60
  return `${mins}m ${remainingSecs}s`
}

export function renderMochiSubmissionCard(sub) {
  const scoreNum = (sub.score !== null && sub.score !== undefined && sub.score !== '') ? Number(sub.score) : NaN
  const hasScore = Number.isFinite(scoreNum)
  const maxNum = (sub.maxScore !== null && sub.maxScore !== undefined && sub.maxScore !== '') ? Number(sub.maxScore) : NaN
  const hasValidMax = Number.isFinite(maxNum) && maxNum > 0
  const maxScoreText = hasValidMax ? formatScore(maxNum) : '10'

  const isPassed = hasScore ? sub.isPassed !== false : false
  const durationText = formatDuration(sub.durationSecondsTaken || 0)
  const isLate = sub.isLate === true || sub.is_late === true || sub.isLate === 'true' || sub.is_late === 'true'
  const totalQuestions = (Number(sub.correctCount) || 0) + (Number(sub.wrongCount) || 0)

  let scoreBoxClass = 'is-unscored'
  let scoreValText = '—'
  let chipClass = 'm-chip--secondary'
  let chipText = 'Chưa có điểm'

  if (hasScore) {
    scoreBoxClass = isPassed ? 'is-passed' : 'is-failed'
    scoreValText = formatScore(scoreNum)
    chipClass = isPassed ? 'm-chip--ok' : 'm-chip--warn'
    chipText = isPassed ? 'ĐẠT' : 'CHƯA ĐẠT'
  }

  return `
    <article class="m-sub-card">
      <div class="m-sub-score-box ${scoreBoxClass}">
        <div class="m-sub-score-val">${scoreValText}</div>
        <div class="m-sub-score-max">/ ${maxScoreText}</div>
        <span class="m-chip ${chipClass} m-sub-score-chip">
          ${chipText}
        </span>
      </div>
      <div class="m-sub-card-body">
        <div class="m-hw-card-tags">
          ${sub.className ? `<span class="m-chip m-chip--secondary"><i class="fa-solid fa-graduation-cap" aria-hidden="true"></i> ${escapeHtml(sub.className)}</span>` : ''}
          ${sub.lesson ? `<span class="m-chip"><i class="fa-solid fa-book-open" aria-hidden="true"></i> ${escapeHtml(sub.lesson)}</span>` : ''}
          ${isLate ? `<span class="m-chip m-chip--warn"><i class="fa-solid fa-clock-rotate-left" aria-hidden="true"></i> Nộp muộn</span>` : ''}
        </div>
        <h3 class="m-hw-card-title">${escapeHtml(sub.homeworkTitle || 'Bài tập')}</h3>
        <div class="m-sub-meta-grid">
          <span class="m-sub-meta-item">
            <i class="fa-solid fa-circle-check" style="color:var(--m-ok)" aria-hidden="true"></i>
            <strong>${sub.correctCount ?? 0}</strong> đúng
          </span>
          <span class="m-sub-meta-item">
            <i class="fa-solid fa-circle-xmark" style="color:var(--m-warn)" aria-hidden="true"></i>
            <strong>${sub.wrongCount ?? 0}</strong> sai
            ${totalQuestions > 0 ? `<span style="font-weight:400; color:var(--m-muted);">(${totalQuestions} câu)</span>` : ''}
          </span>
          <span class="m-sub-meta-item">
            <i class="fa-regular fa-hourglass" aria-hidden="true"></i> ${durationText}
          </span>
          <span class="m-sub-meta-item">
            <i class="fa-regular fa-calendar-check" aria-hidden="true"></i> ${escapeHtml(sub.submittedAt || '—')}
          </span>
        </div>
      </div>
      <div class="m-sub-card-action">
        <button type="button" class="m-btn m-btn--secondary" onclick="window.location.hash='#assignment-review?submissionId=${sub.id}'" aria-label="Xem kết quả bài ${escapeHtml(sub.homeworkTitle || '')}">
          <i class="fa-solid fa-eye" aria-hidden="true"></i> Xem kết quả
        </button>
      </div>
    </article>
  `
}

export function renderClassicLearningHistoryView() {
  const submissions = state.submissions || []

  // Unique Classes list extracted from history
  const uniqueClasses = Array.from(
    new Map(submissions.filter(s => s.classId).map(s => [s.classId, s.className])).entries()
  ).map(([id, name]) => ({ id, name }))

  // Unique Chapters list filtered by selectedClassId
  const uniqueChapters = Array.from(
    new Map(
      submissions
        .filter(s => s.chapterId && (!selectedClassId || s.classId === selectedClassId))
        .map(s => [s.chapterId, s.chapterTitle])
    ).entries()
  ).map(([id, title]) => ({ id, title }))

  // Unique Lessons list filtered by selectedClassId and selectedChapterId
  const uniqueLessons = Array.from(
    new Map(
      submissions
        .filter(s => s.lessonId && (!selectedClassId || s.classId === selectedClassId) && (!selectedChapterId || s.chapterId === selectedChapterId))
        .map(s => [s.lessonId, s.lesson])
    ).entries()
  ).map(([id, title]) => ({ id, title }))

  // Filter submissions list based on selections
  const filteredSubmissions = submissions.filter(sub => {
    const matchesClass = !selectedClassId || sub.classId === selectedClassId
    const matchesChapter = !selectedChapterId || sub.chapterId === selectedChapterId
    const matchesLesson = !selectedLessonId || sub.lessonId === selectedLessonId
    const matchesSearch = !searchQuery || (sub.homeworkTitle || '').toLowerCase().includes(searchQuery.toLowerCase())
    return matchesClass && matchesChapter && matchesLesson && matchesSearch
  })

  const totalSubmissions = filteredSubmissions.length
  const lateCount = filteredSubmissions.filter(s => s.isLate === true || s.is_late === true || s.isLate === 'true' || s.is_late === 'true').length
  const avgProgress = totalSubmissions > 0
    ? Math.round((filteredSubmissions.reduce((acc, s) => acc + (s.score / (s.maxScore || 10)), 0) / totalSubmissions) * 100)
    : 0

  const totalPages = Math.max(1, Math.ceil(totalSubmissions / pageSize))
  if (currentPage > totalPages) currentPage = totalPages
  const from = (currentPage - 1) * pageSize
  const pagedSubmissions = filteredSubmissions.slice(from, from + pageSize)

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
              <div style="background:#fef3c7; padding:10px 20px; border-radius:12px; text-align:center;">
                <div style="font-size:11px; font-weight:700; color:#b45309; text-transform:uppercase;">NỘP MUỘN</div>
                <div style="font-family:var(--font-heading); font-size:22px; font-weight:700; color:#d97706;">${lateCount}</div>
              </div>
            </div>
          </div>

          <!-- Table Container -->
          <div class="card">
            <!-- Filter Bar -->
            <div style="display:flex; flex-wrap:wrap; gap:12px; margin-bottom:20px; align-items:center;">
              <div class="search-box" style="width:240px;">
                <i class="fa-solid fa-magnifying-glass"></i>
                <input type="text" id="search-hw-input" placeholder="Tìm tên bài tập..." value="${escapeHtml(searchQuery)}">
              </div>
              
              <!-- Class Filter -->
              <select id="filter-class-select" style="padding:8px 14px; border:1px solid var(--border-color); border-radius:10px; font-size:13px; outline:none; background:#ffffff; font-weight:600; color:#475569; cursor:pointer;">
                <option value="">Tất cả Lớp học</option>
                ${uniqueClasses.map(c => `<option value="${escapeHtml(c.id)}" ${c.id === selectedClassId ? 'selected' : ''}>Lớp: ${escapeHtml(c.name)}</option>`).join('')}
              </select>

              <!-- Chapter Filter -->
              <select id="filter-chapter-select" style="padding:8px 14px; border:1px solid var(--border-color); border-radius:10px; font-size:13px; outline:none; background:#ffffff; font-weight:600; color:#475569; cursor:pointer;">
                <option value="">Tất cả Chương</option>
                ${uniqueChapters.map(ch => `<option value="${escapeHtml(ch.id)}" ${ch.id === selectedChapterId ? 'selected' : ''}>Chương: ${escapeHtml(ch.title)}</option>`).join('')}
              </select>

              <!-- Lesson Filter -->
              <select id="filter-lesson-select" style="padding:8px 14px; border:1px solid var(--border-color); border-radius:10px; font-size:13px; outline:none; background:#ffffff; font-weight:600; color:#475569; cursor:pointer;">
                <option value="">Tất cả Bài học</option>
                ${uniqueLessons.map(l => `<option value="${escapeHtml(l.id)}" ${l.id === selectedLessonId ? 'selected' : ''}>Bài: ${escapeHtml(l.title)}</option>`).join('')}
              </select>

              <!-- Completed Status (Visual indicator) -->
              <button class="btn-primary" style="width:auto; padding:8px 16px; font-size:13px; font-weight:600;"><i class="fa-solid fa-circle-check"></i> Đã hoàn thành</button>
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
                    <th>Thời gian làm</th>
                    <th>Thao tác</th>
                  </tr>
                </thead>
                <tbody>
                  ${pagedSubmissions.length === 0 ? `
                    <tr>
                      <td colspan="6" style="text-align:center; padding:30px; color:#64748b;">Chưa có bài tập nào phù hợp với bộ lọc.</td>
                    </tr>
                  ` : pagedSubmissions.map(sub => {
                    const isPassed = sub.isPassed !== false
                    return `
                      <tr>
                        <td style="font-weight:700; color:#0f172a;">
                          ${escapeHtml(sub.homeworkTitle)}
                          ${(sub.isLate || sub.is_late) ? `
                            <span style="background:#fef3c7; color:#d97706; border:1px solid #fde68a; padding:2px 6px; border-radius:4px; font-size:10px; font-weight:700; margin-left:6px; display:inline-flex; align-items:center; gap:4px;">
                              <i class="fa-solid fa-clock-rotate-left"></i> Nộp muộn
                            </span>
                          ` : ''}
                        </td>
                        <td style="color:#64748b;">${escapeHtml(sub.lesson)}</td>
                        <td style="color:#64748b;">${escapeHtml(sub.submittedAt)}</td>
                        <td style="font-family:var(--font-heading); font-weight:700; font-size:16px; color:${isPassed ? '#16a34a' : '#dc2626'};">
                          <div style="display:flex; align-items:baseline; gap:3px;">
                            <span>${formatScore(sub.score)}</span>
                            <span style="font-size:12px; font-weight:600; color:#64748b;">/ ${formatScore(sub.maxScore || 10)}</span>
                          </div>
                          <div style="font-size:11px; font-weight:500; color:#64748b; font-family:var(--font-sans); margin-top:2px;">
                            (${sub.correctCount}/${(sub.correctCount || 0) + (sub.wrongCount || 0)} câu đúng)
                          </div>
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
                          <button class="btn-secondary" onclick="window.location.hash='#assignment-review?submissionId=${sub.id}'" style="padding:4px 10px; font-size:12px; cursor:pointer;">
                            Xem kết quả
                          </button>
                        </td>
                      </tr>
                    `
                  }).join('')}
                </tbody>
              </table>
            </div>

            <!-- Dynamic Pagination Bar -->
            <div id="history-pagination-wrapper">
              ${renderPaginationBar({
                currentPage,
                totalItems: totalSubmissions,
                pageSize,
                containerId: 'history-pagination-container',
                pageSizeOptions: [10, 20, 50]
              })}
            </div>
          </div>
        </div>
      </div>
    </div>
  `
}

function renderMochiLearningHistoryView() {
  const submissions = state.submissions || []

  const uniqueClasses = Array.from(
    new Map(submissions.filter(s => s.classId).map(s => [s.classId, s.className])).entries()
  ).map(([id, name]) => ({ id, name }))

  const uniqueChapters = Array.from(
    new Map(
      submissions
        .filter(s => s.chapterId && (!selectedClassId || s.classId === selectedClassId))
        .map(s => [s.chapterId, s.chapterTitle])
    ).entries()
  ).map(([id, title]) => ({ id, title }))

  const uniqueLessons = Array.from(
    new Map(
      submissions
        .filter(s => s.lessonId && (!selectedClassId || s.classId === selectedClassId) && (!selectedChapterId || s.chapterId === selectedChapterId))
        .map(s => [s.lessonId, s.lesson])
    ).entries()
  ).map(([id, title]) => ({ id, title }))

  const filteredSubmissions = submissions.filter(sub => {
    const matchesClass = !selectedClassId || sub.classId === selectedClassId
    const matchesChapter = !selectedChapterId || sub.chapterId === selectedChapterId
    const matchesLesson = !selectedLessonId || sub.lessonId === selectedLessonId
    const matchesSearch = !searchQuery || (sub.homeworkTitle || '').toLowerCase().includes(searchQuery.toLowerCase())
    return matchesClass && matchesChapter && matchesLesson && matchesSearch
  })

  const totalSubmissions = filteredSubmissions.length
  const lateCount = filteredSubmissions.filter(s => s.isLate === true || s.is_late === true || s.isLate === 'true' || s.is_late === 'true').length
  const scoredSubmissions = filteredSubmissions.filter(s => {
    const score = (s?.score !== null && s?.score !== undefined && s?.score !== '') ? Number(s.score) : NaN
    const maxScore = (s?.maxScore !== null && s?.maxScore !== undefined && s?.maxScore !== '') ? Number(s.maxScore) : NaN
    return Number.isFinite(score) && Number.isFinite(maxScore) && maxScore > 0
  })
  const avgProgressText = scoredSubmissions.length > 0
    ? `${Math.round((scoredSubmissions.reduce((acc, s) => acc + (Number(s.score) / Number(s.maxScore)), 0) / scoredSubmissions.length) * 100)}%`
    : '—'

  const totalPages = Math.max(1, Math.ceil(totalSubmissions / pageSize))
  if (currentPage > totalPages) currentPage = totalPages
  const from = (currentPage - 1) * pageSize
  const pagedSubmissions = filteredSubmissions.slice(from, from + pageSize)

  return `
    <div class="app-layout navy-student m-student-page m-history-page">
      ${renderSidebar('history')}
      <div class="main-content">
        ${renderNavbar('Học tập / Lịch sử làm bài')}
        <main class="content-body">
          <div class="m-page-wrap">
            <header class="m-hw-hero">
              <div class="m-hw-hero-copy">
                <span class="m-chip m-chip--accent2">Kết quả</span>
                <h1 class="m-hw-hero-title">Lịch sử làm bài</h1>
                <p class="m-hw-hero-desc">Xem lại các bài tập đã làm, điểm số và chi tiết từng câu trả lời.</p>
              </div>
              <div class="m-hw-hero-mascot">
                ${renderMascot({ mood: 'happy', size: 120 })}
              </div>
            </header>

            <section class="m-hw-stats" aria-label="Thống kê kết quả">
              <div class="m-stat-card m-stat-card--avg">
                <div class="m-stat-label">ĐIỂM TRUNG BÌNH</div>
                <div class="m-stat-val">${avgProgressText}</div>
                <div class="m-chip m-chip--accent2">Toàn bộ bài đã nộp</div>
              </div>
              <div class="m-stat-card m-stat-card--total">
                <div class="m-stat-label">TỔNG BÀI ĐÃ LÀM</div>
                <div class="m-stat-val">${totalSubmissions}</div>
                <div class="m-chip m-chip--secondary">Bài tập hoàn thành</div>
              </div>
              <div class="m-stat-card m-stat-card--todo">
                <div class="m-stat-label">NỘP MUỘN</div>
                <div class="m-stat-val">${lateCount}</div>
                <div class="m-chip ${lateCount > 0 ? 'm-chip--warn' : 'm-chip--ok'}">${lateCount > 0 ? 'Cần chú ý hạn' : 'Đúng hạn tốt'}</div>
              </div>
            </section>

            <section class="m-card m-hw-filters" aria-label="Bộ lọc lịch sử">
              <div class="m-hw-filter-bar">
                <div class="m-hw-search-box">
                  <i class="fa-solid fa-magnifying-glass" aria-hidden="true"></i>
                  <input type="search" id="search-hw-input" placeholder="Tìm tên bài tập..." value="${escapeHtml(searchQuery)}" aria-label="Tìm kiếm theo tên bài tập">
                </div>

                <div class="m-hw-select-group">
                  <select id="filter-class-select" class="m-select" aria-label="Lọc theo lớp học">
                    <option value="">Tất cả Lớp học</option>
                    ${uniqueClasses.map(c => `<option value="${escapeHtml(c.id)}" ${c.id === selectedClassId ? 'selected' : ''}>Lớp: ${escapeHtml(c.name)}</option>`).join('')}
                  </select>

                  <select id="filter-chapter-select" class="m-select" aria-label="Lọc theo chương">
                    <option value="">Tất cả Chương</option>
                    ${uniqueChapters.map(ch => `<option value="${escapeHtml(ch.id)}" ${ch.id === selectedChapterId ? 'selected' : ''}>Chương: ${escapeHtml(ch.title)}</option>`).join('')}
                  </select>

                  <select id="filter-lesson-select" class="m-select" aria-label="Lọc theo bài học">
                    <option value="">Tất cả Bài học</option>
                    ${uniqueLessons.map(l => `<option value="${escapeHtml(l.id)}" ${l.id === selectedLessonId ? 'selected' : ''}>Bài: ${escapeHtml(l.title)}</option>`).join('')}
                  </select>
                </div>

                <span class="m-chip m-chip--ok m-filter-status-indicator">
                  <i class="fa-solid fa-circle-check" aria-hidden="true"></i> Đã hoàn thành
                </span>
              </div>
            </section>

            <div class="m-history-list" aria-live="polite">
              ${pagedSubmissions.length === 0 ? `
                <div class="m-empty-state">
                  ${renderMascot({ mood: 'cheer', size: 140 })}
                  <h3 class="m-empty-title">Chưa có bài tập nào phù hợp</h3>
                  <p class="m-empty-desc">Thử đổi lớp, chương hoặc từ khoá tìm kiếm khác nhé!</p>
                </div>
              ` : pagedSubmissions.map(sub => renderMochiSubmissionCard(sub)).join('')}
            </div>

            <div id="history-pagination-wrapper" class="m-hw-pagination-wrap">
              ${renderPaginationBar({
                currentPage,
                totalItems: totalSubmissions,
                pageSize,
                containerId: 'history-pagination-container',
                pageSizeOptions: [10, 20, 50]
              })}
            </div>
          </div>
        </main>
      </div>
    </div>
  `
}

export function renderLearningHistoryView() {
  if (isMochiMode()) {
    return renderMochiLearningHistoryView()
  }
  return renderClassicLearningHistoryView()
}

export function bindLearningHistoryEvents() {
  bindSidebarEvents()

  const app = document.getElementById('app')

  // Bind pagination events
  bindPaginationEvents({
    containerId: 'history-pagination-container',
    onPageChange: (newPage) => {
      currentPage = newPage
      if (app) {
        app.innerHTML = renderLearningHistoryView()
        bindLearningHistoryEvents()
      }
    },
    onPageSizeChange: (newSize) => {
      pageSize = newSize
      currentPage = 1
      if (app) {
        app.innerHTML = renderLearningHistoryView()
        bindLearningHistoryEvents()
      }
    }
  })

  // Search input event
  const searchInput = document.getElementById('search-hw-input')
  if (searchInput) {
    searchInput.addEventListener('input', (e) => {
      searchQuery = e.target.value
      currentPage = 1
      if (app) {
        app.innerHTML = renderLearningHistoryView()
        bindLearningHistoryEvents()
        const newSearchInput = document.getElementById('search-hw-input')
        if (newSearchInput) {
          newSearchInput.focus()
          newSearchInput.setSelectionRange(searchQuery.length, searchQuery.length)
        }
      }
    })
  }

  // Class select event
  document.getElementById('filter-class-select')?.addEventListener('change', (e) => {
    selectedClassId = e.target.value
    selectedChapterId = ''
    selectedLessonId = ''
    currentPage = 1
    if (app) {
      app.innerHTML = renderLearningHistoryView()
      bindLearningHistoryEvents()
    }
  })

  // Chapter select event
  document.getElementById('filter-chapter-select')?.addEventListener('change', (e) => {
    selectedChapterId = e.target.value
    selectedLessonId = ''
    currentPage = 1
    if (app) {
      app.innerHTML = renderLearningHistoryView()
      bindLearningHistoryEvents()
    }
  })

  // Lesson select event
  document.getElementById('filter-lesson-select')?.addEventListener('change', (e) => {
    selectedLessonId = e.target.value
    currentPage = 1
    if (app) {
      app.innerHTML = renderLearningHistoryView()
      bindLearningHistoryEvents()
    }
  })
}
