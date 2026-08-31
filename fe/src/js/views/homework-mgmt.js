import { renderSidebar, bindSidebarEvents } from '../components/sidebar.js'
import { renderNavbar } from '../components/navbar.js'
import { showToast } from '../components/toast.js'
import { openModal } from '../components/modal.js'
import { state } from '../state.js'
import { api } from '../api.js'

let allHomeworks = []
let allClasses = []
let chaptersCache = {} // classId -> chapters array
let lessonsCache = {}  // chapterId -> lessons array

let filterState = {
  search: '',
  classId: '',
  chapterId: '',
  lessonId: '',
  type: '',
  sortBy: 'newest'
}

export function renderHomeworkMgmtView() {
  return `
    <div class="app-layout">
      ${renderSidebar('homework-mgmt')}
      <div class="main-content">
        ${renderNavbar('Nền tảng / Quản lý bài tập')}
        <div class="content-body" style="padding: 24px;">
          
          <!-- Page Header -->
          <div class="page-header" style="display:flex; justify-content:space-between; align-items:center; margin-bottom:24px; flex-wrap:wrap; gap:16px;">
            <div>
              <h1 class="page-title" style="font-family:var(--font-heading); font-size:24px; font-weight:700; color:#0f172a; margin:0 0 4px 0;">
                Quản lý bài tập & bài thi
              </h1>
              <p class="page-description" style="font-size:14px; color:#64748b; margin:0;">
                Tìm kiếm, phân loại theo lớp/chương/bài học và quản lý các bài tập trực tuyến
              </p>
            </div>
            <div>
              <button class="btn-primary" id="btn-create-homework" style="padding:10px 20px; font-size:14px; font-weight:600; cursor:pointer; display:inline-flex; align-items:center; gap:8px; border-radius:10px; background:#0066cc; color:#ffffff; border:none; box-shadow:0 2px 8px rgba(0,102,204,0.25);">
                <i class="fa-solid fa-plus" style="font-size:14px;"></i> Tạo bài tập mới
              </button>
            </div>
          </div>

          <!-- Summary Statistics Cards -->
          <div style="display:grid; grid-template-columns: repeat(auto-fit, minmax(200px, 1fr)); gap:16px; margin-bottom:24px;">
            <div class="card" style="margin:0; padding:16px 20px; border:1px solid #e2e8f0; border-radius:14px; background:#ffffff; display:flex; align-items:center; gap:16px;">
              <div style="width:48px; height:48px; border-radius:12px; background:#eff6ff; color:#0066cc; display:flex; align-items:center; justify-content:center; font-size:20px; flex-shrink:0;">
                <i class="fa-solid fa-book-open-reader"></i>
              </div>
              <div>
                <div style="font-size:12px; font-weight:600; color:#64748b; text-transform:uppercase;">Tổng số bài tập</div>
                <div id="stat-total-hw" style="font-size:22px; font-weight:800; color:#0f172a; font-family:var(--font-heading);">0</div>
              </div>
            </div>

            <div class="card" style="margin:0; padding:16px 20px; border:1px solid #e2e8f0; border-radius:14px; background:#ffffff; display:flex; align-items:center; gap:16px;">
              <div style="width:48px; height:48px; border-radius:12px; background:#f0fdf4; color:#16a34a; display:flex; align-items:center; justify-content:center; font-size:20px; flex-shrink:0;">
                <i class="fa-solid fa-feather-pointed"></i>
              </div>
              <div>
                <div style="font-size:12px; font-weight:600; color:#64748b; text-transform:uppercase;">Bài luyện tập</div>
                <div id="stat-practice-hw" style="font-size:22px; font-weight:800; color:#16a34a; font-family:var(--font-heading);">0</div>
              </div>
            </div>

            <div class="card" style="margin:0; padding:16px 20px; border:1px solid #e2e8f0; border-radius:14px; background:#ffffff; display:flex; align-items:center; gap:16px;">
              <div style="width:48px; height:48px; border-radius:12px; background:#fef2f2; color:#ef4444; display:flex; align-items:center; justify-content:center; font-size:20px; flex-shrink:0;">
                <i class="fa-solid fa-stopwatch"></i>
              </div>
              <div>
                <div style="font-size:12px; font-weight:600; color:#64748b; text-transform:uppercase;">Bài thi chính thức</div>
                <div id="stat-exam-hw" style="font-size:22px; font-weight:800; color:#ef4444; font-family:var(--font-heading);">0</div>
              </div>
            </div>

            <div class="card" style="margin:0; padding:16px 20px; border:1px solid #e2e8f0; border-radius:14px; background:#ffffff; display:flex; align-items:center; gap:16px;">
              <div style="width:48px; height:48px; border-radius:12px; background:#f0f9ff; color:#0284c7; display:flex; align-items:center; justify-content:center; font-size:20px; flex-shrink:0;">
                <i class="fa-solid fa-graduation-cap"></i>
              </div>
              <div>
                <div style="font-size:12px; font-weight:600; color:#64748b; text-transform:uppercase;">Số lớp đang áp dụng</div>
                <div id="stat-classes-count" style="font-size:22px; font-weight:800; color:#0284c7; font-family:var(--font-heading);">0</div>
              </div>
            </div>
          </div>

          <!-- Search & Filter Controls Toolbar -->
          <div class="card" style="margin-bottom:24px; padding:20px; border:1px solid #e2e8f0; border-radius:14px; background:#ffffff;">
            <div style="display:grid; grid-template-columns: repeat(auto-fit, minmax(160px, 1fr)); gap:12px; align-items:end; margin-bottom:14px;">
              
              <!-- Search Bar -->
              <div>
                <label style="font-size:12px; font-weight:700; color:#334155; display:block; margin-bottom:6px;">
                  <i class="fa-solid fa-magnifying-glass" style="color:#0066cc;"></i> Tìm kiếm bài tập
                </label>
                <input type="text" id="hw-search-input" class="form-input" placeholder="Nhập tên bài tập..." style="padding:9px 14px; font-size:13px; border-radius:8px; border:1px solid #cbd5e1; width:100%;">
              </div>

              <!-- Filter Class -->
              <div>
                <label style="font-size:12px; font-weight:700; color:#334155; display:block; margin-bottom:6px;">
                  <i class="fa-solid fa-book-bookmark" style="color:#0284c7;"></i> Lớp học
                </label>
                <select id="hw-filter-class" class="form-input" style="padding:9px 12px; font-size:13px; border-radius:8px; border:1px solid #cbd5e1; background:#ffffff; cursor:pointer; width:100%;">
                  <option value="">Tất cả lớp học</option>
                </select>
              </div>

              <!-- Filter Chapter -->
              <div>
                <label style="font-size:12px; font-weight:700; color:#334155; display:block; margin-bottom:6px;">
                  <i class="fa-solid fa-folder-open" style="color:#d97706;"></i> Chương
                </label>
                <select id="hw-filter-chapter" class="form-input" style="padding:9px 12px; font-size:13px; border-radius:8px; border:1px solid #cbd5e1; background:#ffffff; cursor:pointer; width:100%;">
                  <option value="">Tất cả chương</option>
                </select>
              </div>

              <!-- Filter Lesson -->
              <div>
                <label style="font-size:12px; font-weight:700; color:#334155; display:block; margin-bottom:6px;">
                  <i class="fa-solid fa-file-lines" style="color:#059669;"></i> Bài học
                </label>
                <select id="hw-filter-lesson" class="form-input" style="padding:9px 12px; font-size:13px; border-radius:8px; border:1px solid #cbd5e1; background:#ffffff; cursor:pointer; width:100%;">
                  <option value="">Tất cả bài học</option>
                </select>
              </div>

              <!-- Filter Type -->
              <div>
                <label style="font-size:12px; font-weight:700; color:#334155; display:block; margin-bottom:6px;">
                  <i class="fa-solid fa-sliders" style="color:#7c3aed;"></i> Loại bài
                </label>
                <select id="hw-filter-type" class="form-input" style="padding:9px 12px; font-size:13px; border-radius:8px; border:1px solid #cbd5e1; background:#ffffff; cursor:pointer; width:100%;">
                  <option value="">Tất cả loại</option>
                  <option value="PRACTICE">Luyện tập</option>
                  <option value="EXAM">Bài thi</option>
                </select>
              </div>

            </div>

            <div style="display:flex; justify-content:space-between; align-items:center; border-top:1px solid #f1f5f9; padding-top:12px; flex-wrap:wrap; gap:12px;">
              <div style="font-size:13px; color:#64748b;">
                Hiển thị <strong id="hw-filtered-count" style="color:#0f172a;">0</strong> kết quả bài tập
              </div>

              <div style="display:flex; align-items:center; gap:12px;">
                <div style="display:flex; align-items:center; gap:8px;">
                  <label style="font-size:12px; font-weight:700; color:#475569; white-space:nowrap;">Sắp xếp theo:</label>
                  <select id="hw-sort-select" class="form-input" style="padding:6px 12px; font-size:13px; border-radius:8px; border:1px solid #cbd5e1; background:#ffffff; cursor:pointer;">
                    <option value="newest">Mới nhất (Ngày tạo)</option>
                    <option value="oldest">Cũ nhất (Ngày tạo)</option>
                    <option value="title-asc">Tên bài tập (A - Z)</option>
                    <option value="title-desc">Tên bài tập (Z - A)</option>
                    <option value="duration-desc">Thời gian thi (Dài nhất)</option>
                    <option value="duration-asc">Thời gian thi (Ngắn nhất)</option>
                  </select>
                </div>

                <button class="btn-secondary" id="hw-reset-filter-btn" style="padding:6px 14px; font-size:12px; font-weight:600; border-radius:8px; border:1px solid #cbd5e1; background:#ffffff; color:#475569; cursor:pointer;">
                  <i class="fa-solid fa-arrow-rotate-left"></i> Đặt lại
                </button>
              </div>
            </div>
          </div>

          <!-- Homework Data Table Container -->
          <div class="card" style="padding:0; overflow:hidden; border:1px solid #e2e8f0; border-radius:14px; background:#ffffff; box-shadow:0 2px 10px rgba(0,0,0,0.02);">
            <div class="table-responsive">
              <table style="width:100%; border-collapse:collapse; text-align:left; font-size:13px;">
                <thead>
                  <tr style="background:#f8fafc; border-bottom:1px solid #e2e8f0; color:#475569; font-weight:700; font-size:12px; text-transform:uppercase;">
                    <th style="padding:14px 16px; width:50px; text-align:center;">#</th>
                    <th style="padding:14px 16px; min-width:240px;">Bài tập / Bài thi</th>
                    <th style="padding:14px 16px; min-width:180px;">Lớp / Chương / Bài học</th>
                    <th style="padding:14px 16px; min-width:150px;">Cấu hình phòng thi</th>
                    <th style="padding:14px 16px; min-width:140px;">Hạn chót (Deadline)</th>
                    <th style="padding:14px 16px; min-width:130px;">Ngày tạo</th>
                    <th style="padding:14px 16px; width:130px; text-align:center;">Thao tác</th>
                  </tr>
                </thead>
                <tbody id="hw-table-body">
                  <tr>
                    <td colspan="7" style="padding:40px; text-align:center; color:#64748b;">
                      <i class="fa-solid fa-spinner fa-spin" style="font-size:24px; color:#0066cc; margin-bottom:8px; display:block;"></i>
                      Đang tải danh sách bài tập...
                    </td>
                  </tr>
                </tbody>
              </table>
            </div>
          </div>

        </div>
      </div>
    </div>
  `
}

export function bindHomeworkMgmtEvents() {
  bindSidebarEvents()

  // Click handler for "Tạo bài tập mới" button -> Redirect to /create-homework
  document.getElementById('btn-create-homework')?.addEventListener('click', () => {
    window.location.hash = '#create-homework'
  })

  loadData()
}

async function loadData() {
  const tableBody = document.getElementById('hw-table-body')
  try {
    // 1. Fetch Classes from state or single API call if needed
    if (state.classes && state.classes.length > 0) {
      allClasses = state.classes
    } else {
      allClasses = await api.getClasses() || []
    }

    // 2. Single API call for Homeworks (with joined metadata from backend)
    const hwData = await api.getHomeworks()

    // 3. Normalize raw response
    allHomeworks = (hwData || []).map(raw => {
      const lessonInfo = raw.lessons || raw.lesson
      const chapterInfo = lessonInfo?.chapters || raw.chapters
      const classInfo = chapterInfo?.classes || raw.classes

      return {
        id: raw.id,
        lessonId: raw.lessonId || raw.lesson_id,
        title: raw.title,
        pdfPath: raw.pdfPath || raw.pdf_path || '',
        durationMinutes: raw.durationMinutes !== undefined ? raw.durationMinutes : (raw.duration_minutes || 45),
        passScore: raw.passScore !== undefined ? raw.passScore : (raw.pass_score || 5.0),
        maxScore: raw.maxScore !== undefined ? raw.maxScore : (raw.max_score || 10.0),
        isPublished: raw.isPublished !== undefined ? raw.isPublished : (raw.is_published !== false),
        createdAt: raw.createdAt || raw.created_at,
        deadline: raw.deadline,
        maxAttempts: raw.maxAttempts !== undefined ? raw.maxAttempts : raw.max_attempts,
        type: raw.type || 'PRACTICE',
        maxViolations: raw.maxViolations !== undefined ? raw.maxViolations : raw.max_violations,
        lessonTitle: raw.lessonTitle || lessonInfo?.title || '',
        chapterId: raw.chapterId || chapterInfo?.id || lessonInfo?.chapter_id || null,
        chapterTitle: raw.chapterTitle || chapterInfo?.title || '',
        classId: raw.classId || classInfo?.id || chapterInfo?.class_id || null,
        className: raw.className || classInfo?.name || ''
      }
    })

    // Populate stats
    updateStats()

    // Populate Class Filter dropdown
    populateClassDropdown()

    // Render list
    renderFilteredHomeworks()

    // Attach Filter Event Listeners
    attachFilterListeners()

  } catch (err) {
    if (tableBody) {
      tableBody.innerHTML = `
        <tr>
          <td colspan="7" style="padding:40px; text-align:center; color:#ef4444;">
            <i class="fa-solid fa-triangle-exclamation" style="font-size:32px; margin-bottom:12px; display:block;"></i>
            Lỗi khi tải dữ liệu bài tập: ${err.message}
          </td>
        </tr>
      `
    }
  }
}

function updateStats() {
  const statTotal = document.getElementById('stat-total-hw')
  const statPractice = document.getElementById('stat-practice-hw')
  const statExam = document.getElementById('stat-exam-hw')
  const statClasses = document.getElementById('stat-classes-count')

  if (statTotal) statTotal.textContent = allHomeworks.length
  
  const practiceCount = allHomeworks.filter(h => (h.type || 'PRACTICE') === 'PRACTICE').length
  const examCount = allHomeworks.filter(h => h.type === 'EXAM').length

  if (statPractice) statPractice.textContent = practiceCount
  if (statExam) statExam.textContent = examCount

  // Count unique class IDs
  const uniqueClassIds = new Set(allHomeworks.map(h => h.classId).filter(Boolean))
  if (statClasses) statClasses.textContent = uniqueClassIds.size || allClasses.length
}

function populateClassDropdown() {
  const classSelect = document.getElementById('hw-filter-class')
  if (!classSelect) return

  let html = '<option value="">Tất cả lớp học</option>'
  allClasses.forEach(c => {
    html += `<option value="${c.id}">${c.name}</option>`
  })
  classSelect.innerHTML = html
}

async function handleClassChange(classId) {
  filterState.classId = classId
  filterState.chapterId = ''
  filterState.lessonId = ''

  const chapterSelect = document.getElementById('hw-filter-chapter')
  const lessonSelect = document.getElementById('hw-filter-lesson')

  if (!chapterSelect || !lessonSelect) return

  if (!classId) {
    chapterSelect.innerHTML = '<option value="">Tất cả chương</option>'
    lessonSelect.innerHTML = '<option value="">Tất cả bài học</option>'
    renderFilteredHomeworks()
    return
  }

  chapterSelect.innerHTML = '<option value="">Đang tải chương...</option>'
  lessonSelect.innerHTML = '<option value="">Tất cả bài học</option>'

  try {
    if (!chaptersCache[classId]) {
      const chapters = await api.getChapters(classId)
      chaptersCache[classId] = chapters || []
    }
    const chapters = chaptersCache[classId]

    let chHtml = '<option value="">Tất cả chương</option>'
    chapters.forEach(ch => {
      chHtml += `<option value="${ch.id}">${ch.title}</option>`
    })
    chapterSelect.innerHTML = chHtml
  } catch (e) {
    chapterSelect.innerHTML = '<option value="">Lỗi khi tải chương</option>'
  }

  renderFilteredHomeworks()
}

async function handleChapterChange(chapterId) {
  filterState.chapterId = chapterId
  filterState.lessonId = ''

  const lessonSelect = document.getElementById('hw-filter-lesson')
  if (!lessonSelect) return

  if (!chapterId) {
    lessonSelect.innerHTML = '<option value="">Tất cả bài học</option>'
    renderFilteredHomeworks()
    return
  }

  lessonSelect.innerHTML = '<option value="">Đang tải bài học...</option>'

  try {
    if (!lessonsCache[chapterId]) {
      const lessons = await api.getLessons(chapterId)
      lessonsCache[chapterId] = lessons || []
    }
    const lessons = lessonsCache[chapterId]

    let lHtml = '<option value="">Tất cả bài học</option>'
    lessons.forEach(l => {
      lHtml += `<option value="${l.id}">${l.title}</option>`
    })
    lessonSelect.innerHTML = lHtml
  } catch (e) {
    lessonSelect.innerHTML = '<option value="">Lỗi khi tải bài học</option>'
  }

  renderFilteredHomeworks()
}

function attachFilterListeners() {
  const searchInput = document.getElementById('hw-search-input')
  const classSelect = document.getElementById('hw-filter-class')
  const chapterSelect = document.getElementById('hw-filter-chapter')
  const lessonSelect = document.getElementById('hw-filter-lesson')
  const typeSelect = document.getElementById('hw-filter-type')
  const sortSelect = document.getElementById('hw-sort-select')
  const resetBtn = document.getElementById('hw-reset-filter-btn')

  let debounceTimer = null
  searchInput?.addEventListener('input', (e) => {
    clearTimeout(debounceTimer)
    debounceTimer = setTimeout(() => {
      filterState.search = e.target.value.trim().toLowerCase()
      renderFilteredHomeworks()
    }, 250)
  })

  classSelect?.addEventListener('change', (e) => {
    handleClassChange(e.target.value)
  })

  chapterSelect?.addEventListener('change', (e) => {
    handleChapterChange(e.target.value)
  })

  lessonSelect?.addEventListener('change', (e) => {
    filterState.lessonId = e.target.value
    renderFilteredHomeworks()
  })

  typeSelect?.addEventListener('change', (e) => {
    filterState.type = e.target.value
    renderFilteredHomeworks()
  })

  sortSelect?.addEventListener('change', (e) => {
    filterState.sortBy = e.target.value
    renderFilteredHomeworks()
  })

  resetBtn?.addEventListener('click', () => {
    filterState = {
      search: '',
      classId: '',
      chapterId: '',
      lessonId: '',
      type: '',
      sortBy: 'newest'
    }

    if (searchInput) searchInput.value = ''
    if (classSelect) classSelect.value = ''
    if (chapterSelect) chapterSelect.innerHTML = '<option value="">Tất cả chương</option>'
    if (lessonSelect) lessonSelect.innerHTML = '<option value="">Tất cả bài học</option>'
    if (typeSelect) typeSelect.value = ''
    if (sortSelect) sortSelect.value = 'newest'

    renderFilteredHomeworks()
  })
}

function renderFilteredHomeworks() {
  const tableBody = document.getElementById('hw-table-body')
  const countBadge = document.getElementById('hw-filtered-count')

  if (!tableBody) return

  // 1. Filter logic
  let filtered = allHomeworks.filter(hw => {
    // Search matching
    if (filterState.search) {
      const titleMatch = (hw.title || '').toLowerCase().includes(filterState.search)
      const lessonMatch = (hw.lessonTitle || '').toLowerCase().includes(filterState.search)
      const chapterMatch = (hw.chapterTitle || '').toLowerCase().includes(filterState.search)
      const classMatch = (hw.className || '').toLowerCase().includes(filterState.search)

      if (!titleMatch && !lessonMatch && !chapterMatch && !classMatch) {
        return false
      }
    }

    // Class filter
    if (filterState.classId && hw.classId !== filterState.classId) {
      return false
    }

    // Chapter filter
    if (filterState.chapterId && hw.chapterId !== filterState.chapterId) {
      return false
    }

    // Lesson filter
    if (filterState.lessonId && hw.lessonId !== filterState.lessonId) {
      return false
    }

    // Type filter
    if (filterState.type) {
      const hwType = hw.type || 'PRACTICE'
      if (hwType !== filterState.type) return false
    }

    return true
  })

  // 2. Sort logic
  filtered.sort((a, b) => {
    if (filterState.sortBy === 'newest') {
      return new Date(b.createdAt || 0) - new Date(a.createdAt || 0)
    }
    if (filterState.sortBy === 'oldest') {
      return new Date(a.createdAt || 0) - new Date(b.createdAt || 0)
    }
    if (filterState.sortBy === 'title-asc') {
      return (a.title || '').localeCompare(b.title || '', 'vi')
    }
    if (filterState.sortBy === 'title-desc') {
      return (b.title || '').localeCompare(a.title || '', 'vi')
    }
    if (filterState.sortBy === 'duration-desc') {
      return (b.durationMinutes || 0) - (a.durationMinutes || 0)
    }
    if (filterState.sortBy === 'duration-asc') {
      return (a.durationMinutes || 0) - (b.durationMinutes || 0)
    }
    return 0
  })

  if (countBadge) {
    countBadge.textContent = filtered.length
  }

  if (filtered.length === 0) {
    tableBody.innerHTML = `
      <tr>
        <td colspan="7" style="padding:40px; text-align:center; color:#64748b;">
          <i class="fa-regular fa-folder-open" style="font-size:40px; color:#cbd5e1; margin-bottom:12px; display:block;"></i>
          <div style="font-size:15px; font-weight:700; color:#0f172a; margin-bottom:4px;">Không tìm thấy bài tập nào</div>
          <p style="font-size:13px; color:#64748b; margin:0;">Thử điều chỉnh từ khóa tìm kiếm hoặc các bộ lọc lớp / chương / bài học.</p>
        </td>
      </tr>
    `
    return
  }

  let html = ''
  filtered.forEach((hw, index) => {
    const isExam = hw.type === 'EXAM'
    const typeBadge = isExam
      ? `<span class="badge" style="background:#fef2f2; color:#dc2626; border:1px solid #fecaca; padding:3px 8px; border-radius:6px; font-weight:700; font-size:11px;"><i class="fa-solid fa-shield-halved"></i> BÀI THI</span>`
      : `<span class="badge" style="background:#f0fdf4; color:#16a34a; border:1px solid #bbf7d0; padding:3px 8px; border-radius:6px; font-weight:700; font-size:11px;"><i class="fa-solid fa-pen-to-square"></i> LUYỆN TẬP</span>`

    const deadlineText = hw.deadline ? new Date(hw.deadline).toLocaleString('vi-VN') : '<span style="color:#94a3b8;">Không có</span>'
    const createdAtText = hw.createdAt ? new Date(hw.createdAt).toLocaleDateString('vi-VN') : ''

    html += `
      <tr style="border-bottom:1px solid #f1f5f9; transition:background 0.15s ease;">
        <td style="padding:12px 16px; text-align:center; font-weight:700; color:#64748b;">${index + 1}</td>
        <td style="padding:12px 16px;">
          <div style="display:flex; flex-direction:column; gap:4px;">
            <div style="display:flex; align-items:center; gap:8px;">
              <strong style="color:#0f172a; font-size:14px;">${hw.title}</strong>
              ${typeBadge}
            </div>
            ${hw.pdfPath ? `
              <div style="font-size:11px; color:#64748b; display:flex; align-items:center; gap:4px;">
                <i class="fa-regular fa-file-pdf" style="color:#ef4444;"></i> ${hw.pdfPath}
              </div>
            ` : ''}
          </div>
        </td>
        <td style="padding:12px 16px;">
          <div style="display:flex; flex-direction:column; gap:4px; font-size:12px;">
            <div><span style="font-weight:700; color:#0369a1;">Lớp:</span> ${hw.className || 'Chưa gán lớp'}</div>
            <div style="color:#475569;"><span style="font-weight:700; color:#d97706;">Chương:</span> ${hw.chapterTitle || '-'}</div>
            <div style="color:#475569;"><span style="font-weight:700; color:#059669;">Bài:</span> ${hw.lessonTitle || '-'}</div>
          </div>
        </td>
        <td style="padding:12px 16px;">
          <div style="display:flex; flex-direction:column; gap:3px; font-size:12px; color:#334155;">
            <div><i class="fa-regular fa-clock" style="color:#0284c7;"></i> <strong>${hw.durationMinutes || 45} phút</strong></div>
            <div><i class="fa-solid fa-rotate" style="color:#64748b;"></i> Lần làm: ${isExam ? '<strong>01 lần</strong>' : (hw.maxAttempts ? `Tối đa ${hw.maxAttempts} lần` : 'Không giới hạn')}</div>
            ${isExam ? `
              <div style="color:#dc2626; font-size:11px;"><i class="fa-solid fa-triangle-exclamation"></i> Tối đa ${hw.maxViolations || 3} lần vi phạm</div>
            ` : ''}
          </div>
        </td>
        <td style="padding:12px 16px; font-size:12px; color:#334155;">
          ${deadlineText}
        </td>
        <td style="padding:12px 16px; font-size:12px; color:#64748b;">
          ${createdAtText}
        </td>
        <td style="padding:12px 16px; text-align:center;">
          <div style="display:flex; align-items:center; justify-content:center; gap:6px;">
            <button class="btn-secondary btn-history-hw" data-id="${hw.id}" data-classid="${hw.classId || ''}" title="Xem lịch sử & câu sai" style="padding:6px 10px; font-size:12px; cursor:pointer; border-radius:6px; background:#ffffff; border:1px solid #bae6fd; color:#0284c7;">
              <i class="fa-solid fa-chart-pie"></i>
            </button>
            <button class="btn-secondary btn-edit-hw" data-id="${hw.id}" title="Sửa bài tập" style="padding:6px 10px; font-size:12px; cursor:pointer; border-radius:6px; background:#ffffff; border:1px solid #cbd5e1; color:#0066cc;">
              <i class="fa-solid fa-pen-to-square"></i>
            </button>
            <button class="btn-secondary btn-delete-hw" data-id="${hw.id}" data-title="${hw.title}" title="Xóa bài tập" style="padding:6px 10px; font-size:12px; cursor:pointer; border-radius:6px; background:#ffffff; border:1px solid #fecaca; color:#dc2626;">
              <i class="fa-solid fa-trash-can"></i>
            </button>
          </div>
        </td>
      </tr>
    `
  })

  tableBody.innerHTML = html

  // Attach History buttons listeners -> Redirect to /admin-history?classId=...&homeworkId=...
  tableBody.querySelectorAll('.btn-history-hw').forEach(btn => {
    btn.addEventListener('click', () => {
      const hwId = btn.getAttribute('data-id')
      const classId = btn.getAttribute('data-classid')
      let hash = '#admin-history'
      if (classId && hwId) {
        hash += `?classId=${classId}&homeworkId=${hwId}`
      } else if (hwId) {
        hash += `?homeworkId=${hwId}`
      }
      window.location.hash = hash
    })
  })

  // Attach Edit buttons listeners -> Redirect to /create-homework?homeworkId=...
  tableBody.querySelectorAll('.btn-edit-hw').forEach(btn => {
    btn.addEventListener('click', () => {
      const hwId = btn.getAttribute('data-id')
      if (hwId) {
        window.location.hash = `#create-homework?homeworkId=${hwId}`
      }
    })
  })

  // Attach Delete buttons listeners
  tableBody.querySelectorAll('.btn-delete-hw').forEach(btn => {
    btn.addEventListener('click', () => {
      const hwId = btn.getAttribute('data-id')
      const hwTitle = btn.getAttribute('data-title') || 'Bài tập'

      openModal(
        'Xác nhận xóa bài tập',
        `<p style="font-size:14px; color:#475569; margin:0; line-height:1.5;">
           Bạn có chắc chắn muốn xóa bài tập <strong>"${hwTitle}"</strong>?<br>
           <span style="color:#ef4444; font-size:12px;">Cảnh báo: Tất cả câu hỏi và bài làm liên quan của học sinh cũng sẽ bị xóa.</span>
         </p>`,
        async () => {
          try {
            await api.deleteHomework(hwId)
            showToast(`Đã xóa bài tập "${hwTitle}" thành công!`, 'success')
            
            // Remove from array and update view
            allHomeworks = allHomeworks.filter(h => h.id !== hwId)
            updateStats()
            renderFilteredHomeworks()
            return true
          } catch (err) {
            showToast(`Xóa bài tập thất bại: ${err.message}`, 'error')
            return false
          }
        }
      )
    })
  })
}
