import { renderSidebar, bindSidebarEvents } from '../components/sidebar.js'
import { renderNavbar } from '../components/navbar.js'
import { state } from '../state.js'
import { renderPaginationBar, bindPaginationEvents } from '../components/pagination.js'

let selectedClassId = ''
let selectedChapterId = ''
let selectedLessonId = ''
let searchQuery = ''
let currentPage = 1
let pageSize = 10

function formatScore(val) {
  if (val === undefined || val === null) return '0'
  const num = Number(val)
  if (isNaN(num)) return '0'
  return Number.isInteger(num) ? num.toString() : Number(num.toFixed(2)).toString()
}

export function renderLearningHistoryView() {
  const submissions = state.submissions

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
    const matchesSearch = !searchQuery || sub.homeworkTitle.toLowerCase().includes(searchQuery.toLowerCase())
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
                <input type="text" id="search-hw-input" placeholder="Tìm tên bài tập..." value="${searchQuery}">
              </div>
              
              <!-- Class Filter -->
              <select id="filter-class-select" style="padding:8px 14px; border:1px solid var(--border-color); border-radius:10px; font-size:13px; outline:none; background:#ffffff; font-weight:600; color:#475569; cursor:pointer;">
                <option value="">Tất cả Lớp học</option>
                ${uniqueClasses.map(c => `<option value="${c.id}" ${c.id === selectedClassId ? 'selected' : ''}>Lớp: ${c.name}</option>`).join('')}
              </select>

              <!-- Chapter Filter -->
              <select id="filter-chapter-select" style="padding:8px 14px; border:1px solid var(--border-color); border-radius:10px; font-size:13px; outline:none; background:#ffffff; font-weight:600; color:#475569; cursor:pointer;">
                <option value="">Tất cả Chương</option>
                ${uniqueChapters.map(ch => `<option value="${ch.id}" ${ch.id === selectedChapterId ? 'selected' : ''}>Chương: ${ch.title}</option>`).join('')}
              </select>

              <!-- Lesson Filter -->
              <select id="filter-lesson-select" style="padding:8px 14px; border:1px solid var(--border-color); border-radius:10px; font-size:13px; outline:none; background:#ffffff; font-weight:600; color:#475569; cursor:pointer;">
                <option value="">Tất cả Bài học</option>
                ${uniqueLessons.map(l => `<option value="${l.id}" ${l.id === selectedLessonId ? 'selected' : ''}>Bài: ${l.title}</option>`).join('')}
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
                          ${sub.homeworkTitle}
                          ${(sub.isLate || sub.is_late) ? `
                            <span style="background:#fef3c7; color:#d97706; border:1px solid #fde68a; padding:2px 6px; border-radius:4px; font-size:10px; font-weight:700; margin-left:6px; display:inline-flex; align-items:center; gap:4px;">
                              <i class="fa-solid fa-clock-rotate-left"></i> Nộp muộn
                            </span>
                          ` : ''}
                        </td>
                        <td style="color:#64748b;">${sub.lesson}</td>
                        <td style="color:#64748b;">${sub.submittedAt}</td>
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
