import { renderSidebar, bindSidebarEvents } from '../components/sidebar.js'
import { renderNavbar } from '../components/navbar.js'
import { openModal } from '../components/modal.js'
import { showToast } from '../components/toast.js'
import { state } from '../state.js'
import { api, SUPABASE_URL } from '../api.js'
import { renderPdfViewer } from '../components/pdf-viewer.js'
import { openAssignHomeworkModal } from '../components/assign-homework-modal.js'
import { renderPaginationBar, bindPaginationEvents } from '../components/pagination.js'
import {
  normalizeSearchText,
  highlightMatch,
  filterLessons,
  groupLessonsByChapter,
  filterAndSortLessons,
  createSearchController,
  escapeHtml
} from '../utils/curriculum-search.js'

function formatTheoryFileName(file) {
  if (!file) return ''
  const base = file.startsWith('http') ? (file.split('/').pop() || file) : file
  let clean = base.replace(/^[0-9]+_+/, '')
  clean = clean.replace(/_+/g, ' ').trim()
  return clean || base
}

// Copy text với fallback cho trình duyệt cũ / iframe không có quyền clipboard.
async function copyTextToClipboard(text) {
  try {
    await navigator.clipboard.writeText(text)
    return true
  } catch (e) {
    try {
      const ta = document.createElement('textarea')
      ta.value = text
      ta.style.position = 'fixed'
      ta.style.opacity = '0'
      document.body.appendChild(ta)
      ta.select()
      const ok = document.execCommand('copy')
      document.body.removeChild(ta)
      return ok
    } catch (e2) {
      return false
    }
  }
}

function bindCopyMeetLinkButtons(root) {
  root.querySelectorAll('.btn-copy-meet-link').forEach(btn => {
    btn.addEventListener('click', async () => {
      const uri = btn.getAttribute('data-uri') || ''
      if (!uri) return
      const ok = await copyTextToClipboard(uri)
      if (ok) {
        showToast('Đã copy link Meet! Gửi cho học sinh để tham gia.', 'success')
        const original = btn.innerHTML
        btn.innerHTML = '<i class="fa-solid fa-check"></i> Đã copy'
        setTimeout(() => { btn.innerHTML = original }, 2000)
      } else {
        showToast('Không copy được tự động. Hãy bôi đen link để copy thủ công.', 'error')
      }
    })
  })
}

function getVideoPlatformInfo(url) {
  if (!url) return null
  if (url.includes('drive.google.com')) {
    return {
      icon: 'fa-brands fa-google-drive',
      color: '#0f9d58',
      name: 'Google Drive Video'
    }
  }
  if (url.includes('youtube.com') || url.includes('youtu.be')) {
    return {
      icon: 'fa-brands fa-youtube',
      color: '#ff0000',
      name: 'YouTube Video'
    }
  }
  return {
    icon: 'fa-solid fa-video',
    color: '#0066cc',
    name: 'Video bài giảng'
  }
}

window.previewTheoryPdf = (disp, mappedUrl) => {
  openModal(
    disp,
    `<div id="modal-pdf-container" style="width:100%; height:65vh; overflow-y:auto; -webkit-overflow-scrolling:touch; border-radius:8px;"></div>
     <div style="margin-top:12px; display:flex; justify-content:flex-end;">
       <a href="${mappedUrl}" target="_blank" rel="noopener noreferrer" class="btn-secondary" style="font-size:12px; padding:6px 12px; display:inline-flex; align-items:center; gap:6px; text-decoration:none; background:#eff6ff; color:#0066cc; border:1px solid #bfdbfe; border-radius:8px;">
         <i class="fa-solid fa-up-right-from-square"></i> Mở file PDF trong tab mới
       </a>
     </div>`
  )
  const mc = document.querySelector('#modal-container .modal-content')
  if (mc) mc.style.maxWidth = '900px'
  const container = document.getElementById('modal-pdf-container')
  if (container) {
    renderPdfViewer(container, mappedUrl)
  }
}

let activeClassId = state.classes[0]?.id || 'c1'
let isLoadingCurriculum = false
let curriculumError = null
let selectedLessonId = null
let selectedChapterId = null
let cachedClassCurriculumSummaries = {}
let currentSearchQuery = ''
let selectedChapterFilter = 'all'
let selectedSortOrder = 'order'
let curriculumCurrentPage = 1
let CURRICULUM_PAGE_SIZE = 15
let serverLessonsResult = { items: [], total: 0, page: 1, pageSize: 15 }
let currentChapters = []

export async function fetchCurriculumLessons(classId, options = {}) {
  const res = await api.searchClassLessons(classId, currentSearchQuery, {
    chapterId: selectedChapterFilter !== 'all' ? selectedChapterFilter : undefined,
    sort: selectedSortOrder,
    page: curriculumCurrentPage,
    pageSize: CURRICULUM_PAGE_SIZE,
    ...options
  })

  const items = Array.isArray(res) ? res : (res?.items || res?.results || [])
  const total = typeof res?.total === 'number'
    ? res.total
    : (typeof res?.totalLessons === 'number' ? res.totalLessons : items.length)

  serverLessonsResult = {
    items,
    total,
    page: res?.page || curriculumCurrentPage,
    pageSize: res?.pageSize || CURRICULUM_PAGE_SIZE
  }
  curriculumError = null
  return serverLessonsResult
}

export async function ensureCurriculumLoaded(classId) {
  if (activeClassId !== classId) {
    activeClassId = classId
    selectedChapterId = null
    selectedLessonId = null
    currentSearchQuery = ''
    selectedChapterFilter = 'all'
    selectedSortOrder = 'order'
    curriculumCurrentPage = 1
    curriculumError = null
  }

  isLoadingCurriculum = true
  curriculumError = null

  try {
    const [rawChapters, lessonRes] = await Promise.all([
      api.getChapters(classId),
      api.searchClassLessons(classId, currentSearchQuery, {
        chapterId: selectedChapterFilter !== 'all' ? selectedChapterFilter : undefined,
        sort: selectedSortOrder,
        page: curriculumCurrentPage,
        pageSize: CURRICULUM_PAGE_SIZE,
        silent: true
      })
    ])

    const rawList = Array.isArray(rawChapters) ? rawChapters : (rawChapters?.items || [])
    currentChapters = rawList.map(ch => ({
      id: ch.id,
      code: '',
      title: ch.title,
      orderIndex: ch.order_index,
      lessons: ch.lessons || []
    }))

    const items = Array.isArray(lessonRes) ? lessonRes : (lessonRes?.items || lessonRes?.results || [])
    const total = typeof lessonRes?.total === 'number'
      ? lessonRes.total
      : (typeof lessonRes?.totalLessons === 'number' ? lessonRes.totalLessons : items.length)

    serverLessonsResult = {
      items,
      total,
      page: lessonRes?.page || curriculumCurrentPage,
      pageSize: lessonRes?.pageSize || CURRICULUM_PAGE_SIZE
    }

    // Gắn metadata tóm tắt vào cachedClassCurriculumSummaries để tương thích
    cachedClassCurriculumSummaries[classId] = {
      classId,
      totalChapters: currentChapters.length,
      totalLessons: total,
      results: items
    }

    const existingIndex = state.curriculums.findIndex(c => c.classId === classId)
    if (existingIndex !== -1) {
      state.curriculums[existingIndex].chapters = currentChapters
    } else {
      state.curriculums.push({
        classId,
        chapters: currentChapters
      })
    }

    return currentChapters
  } catch (err) {
    console.error('Failed to load curriculum:', err)
    curriculumError = err.message || 'Không thể tải chương trình học cho lớp này!'
    showToast(curriculumError, 'error')
    return currentChapters
  } finally {
    isLoadingCurriculum = false
  }
}

function getCurriculumLessons(classId, chapters) {
  if (serverLessonsResult && Array.isArray(serverLessonsResult.items) && serverLessonsResult.items.length > 0) {
    return serverLessonsResult.items
  }
  const summary = cachedClassCurriculumSummaries[classId]
  if (summary && Array.isArray(summary.results)) {
    return summary.results
  }
  return []
}

export function renderCurriculumTabHTML(currentClass) {
  if (!currentClass) {
    return `<div class="card" style="padding:24px; text-align:center; color:#64748b;">Không tìm thấy thông tin lớp học.</div>`
  }

  if (activeClassId !== currentClass.id) {
    activeClassId = currentClass.id
    selectedChapterId = null
    selectedLessonId = null
    currentSearchQuery = ''
    selectedChapterFilter = 'all'
    selectedSortOrder = 'order'
    curriculumCurrentPage = 1
    curriculumError = null
  }

  const currObj = state.curriculums?.find(c => c.classId === currentClass.id) || { chapters: [] }
  const chapters = currentChapters.length > 0 ? currentChapters : (currObj.chapters || [])
  const totalLessons = serverLessonsResult.total

  // Kiểm tra nếu đang xem chi tiết 1 bài học (workspace)
  let selectedChapter = null
  let selectedLesson = null
  if (selectedLessonId) {
    selectedLesson = serverLessonsResult.items.find(l => l.id === selectedLessonId) || null
    if (!selectedLesson) {
      for (const ch of chapters) {
        const found = (ch.lessons || []).find(l => l.id === selectedLessonId)
        if (found) {
          selectedLesson = found
          break
        }
      }
    }
    if (selectedLesson) {
      selectedChapter = chapters.find(ch => ch.id === selectedLesson.chapterId) || null
    }
  }

  return `
    <div class="card" style="padding:24px; border-radius:16px;">
      <!-- Toolbar Header -->
      <div class="class-tab-toolbar">
        <div>
          <h2 style="font-family:var(--font-heading); font-size:18px; font-weight:700; color:#0f172a; margin:0 0 4px 0;">
            <i class="fa-solid fa-book-open" style="color:#0066cc;"></i> Chương trình & Kế hoạch giảng dạy
          </h2>
          <p style="font-size:13px; color:#64748b; margin:0;">
            Quản lý bài học, video bài giảng, tài liệu lý thuyết và bài tập của lớp <strong>${escapeHtml(currentClass.name)}</strong>.
          </p>
        </div>
        <div class="class-toolbar-actions" style="display:flex; align-items:center; gap:10px; flex-wrap:wrap;">
          <button class="btn-primary" id="btn-quick-add-lesson" style="width:auto; padding:9px 18px; font-size:13px; font-weight:700; border-radius:10px; display:inline-flex; align-items:center; gap:8px; background:linear-gradient(135deg, #0284c7, #0066cc); color:#ffffff; border:none; cursor:pointer; box-shadow:0 2px 6px rgba(2,132,199,0.25);">
            <i class="fa-solid fa-bolt"></i> Tạo bài học nhanh
          </button>
          <button class="btn-secondary" id="add-chapter-btn" style="width:auto; padding:9px 18px; font-size:13px; font-weight:700; border-radius:10px; display:inline-flex; align-items:center; gap:8px; cursor:pointer;">
            <i class="fa-solid fa-plus"></i> Tạo chương mới
          </button>
        </div>
      </div>

      <!-- Quick Stats Pills -->
      <div style="display:flex; gap:12px; margin-bottom:20px; flex-wrap:wrap;">
        <div style="background:#f0f9ff; border:1px solid #bae6fd; padding:8px 16px; border-radius:10px; display:inline-flex; align-items:center; gap:8px;">
          <i class="fa-solid fa-layer-group" style="color:#0284c7;"></i>
          <span style="font-size:13px; font-weight:600; color:#0369a1;">Tổng số chương: <strong>${chapters.length}</strong></span>
        </div>
        <div style="background:#f0fdf4; border:1px solid #bbf7d0; padding:8px 16px; border-radius:10px; display:inline-flex; align-items:center; gap:8px;">
          <i class="fa-solid fa-book-bookmark" style="color:#16a34a;"></i>
          <span style="font-size:13px; font-weight:600; color:#15803d;">Tổng số bài học: <strong>${totalLessons}</strong></span>
        </div>
      </div>

      <!-- Main Curriculum Workspace: Lesson-First View hoặc Lesson Workspace Detail -->
      ${isLoadingCurriculum ? `
        <div style="text-align:center; padding:48px 20px; color:#64748b;">
          <i class="fa-solid fa-circle-notch fa-spin" style="font-size:32px; color:#0066cc; margin-bottom:12px; display:block;"></i>
          <p style="font-weight:600; margin:0;">Đang tải danh sách bài học & chương trình...</p>
        </div>
      ` : curriculumError ? `
        <div class="card" style="padding:32px 20px; text-align:center; border:1px solid #fecaca; background:#fef2f2; border-radius:12px; margin-bottom:16px;">
          <i class="fa-solid fa-triangle-exclamation" style="font-size:32px; color:#ef4444; margin-bottom:10px; display:block;"></i>
          <h4 style="font-size:15px; font-weight:700; color:#991b1b; margin-bottom:6px;">Lỗi tải chương trình học</h4>
          <p style="font-size:13px; color:#7f1d1d; margin-bottom:14px;">${escapeHtml(curriculumError)}</p>
          <button id="btn-retry-curriculum" class="btn-primary" style="width:auto; padding:8px 18px; font-size:13px; font-weight:600; border-radius:8px; cursor:pointer;">
            <i class="fa-solid fa-rotate-right"></i> Thử lại
          </button>
        </div>
      ` : (chapters.length === 0 ? `
        <div style="text-align:center; padding:48px 20px; color:#64748b; border:2px dashed #e2e8f0; border-radius:12px; background:#f8fafc;">
          <i class="fa-solid fa-folder-open" style="font-size:36px; color:#cbd5e1; display:block; margin-bottom:12px;"></i>
          <p style="font-weight:700; color:#334155; margin-bottom:4px; font-size:15px;">Chưa có chương học nào cho lớp học này</p>
          <p style="font-size:13px; color:#64748b; margin:0;">Nhấn nút <strong>"Tạo chương mới"</strong> ở trên để bắt đầu thêm bài học.</p>
        </div>
      ` : `
        <div id="curriculum-level-container">
          ${selectedLesson ? renderLessonDetail(selectedChapter, selectedLesson) : renderLessonFirstView(currentClass, chapters, serverLessonsResult)}
        </div>
      `)}
    </div>
  `
}

// Lesson-First View: Danh sách chính là DANH SÁCH BÀI HỌC lấy từ Server, Chương chỉ là bộ lọc
function renderLessonFirstView(currentClass, chapters, lessonResult) {
  const pagedLessons = lessonResult.items || []
  const totalItems = typeof lessonResult.total === 'number' ? lessonResult.total : pagedLessons.length
  const totalPages = Math.max(1, Math.ceil(totalItems / CURRICULUM_PAGE_SIZE))
  if (curriculumCurrentPage > totalPages) curriculumCurrentPage = totalPages
  if (curriculumCurrentPage < 1) curriculumCurrentPage = 1

  const startIndex = (curriculumCurrentPage - 1) * CURRICULUM_PAGE_SIZE

  const activeFilteredChapter = selectedChapterFilter !== 'all'
    ? chapters.find(c => c.id === selectedChapterFilter)
    : null

  return `
    <!-- Lesson-First Filter & Search Bar -->
    <div style="background:#f8fafc; border:1px solid #e2e8f0; border-radius:12px; padding:16px; margin-bottom:20px;">
      <div style="display:flex; gap:12px; align-items:flex-end; flex-wrap:wrap;">
        <!-- Chapter Filter (Chương là filter) -->
        <div style="flex:1 1 240px; min-width:200px;">
          <label style="display:block; font-size:12px; font-weight:700; color:#475569; margin-bottom:6px;">
            <i class="fa-solid fa-filter" style="color:#0066cc;"></i> Chương học (Bộ lọc)
          </label>
          <select id="curriculum-chapter-filter" class="form-input" style="height:42px; border-radius:10px; font-size:13px; background:#ffffff;">
            <option value="all" ${selectedChapterFilter === 'all' ? 'selected' : ''}>
              Tất cả chương (${chapters.length} chương)
            </option>
            ${chapters.map((ch, idx) => {
              return `
                <option value="${ch.id}" ${selectedChapterFilter === ch.id ? 'selected' : ''}>
                  Chương ${idx + 1}: ${escapeHtml(ch.title)}
                </option>
              `
            }).join('')}
          </select>
        </div>

        <!-- Search Text Input (Tùy chọn) -->
        <div style="flex:2 1 320px; min-width:260px; position:relative;">
          <label style="display:block; font-size:12px; font-weight:700; color:#475569; margin-bottom:6px;">
            <i class="fa-solid fa-magnifying-glass" style="color:#0066cc;"></i> Tìm kiếm bài học toàn lớp
          </label>
          <div style="position:relative; display:flex; align-items:center;">
            <i class="fa-solid fa-magnifying-glass" style="position:absolute; left:14px; color:#94a3b8; font-size:13.5px; z-index:1;"></i>
            <input
              type="text"
              id="curriculum-lesson-search-input"
              class="form-input"
              style="padding-left:38px; padding-right:72px; height:42px; border-radius:10px; font-size:13px; background:#ffffff;"
              placeholder="Tìm theo tên bài học, mô tả, số thứ tự... (Phím tắt: /)"
              value="${escapeHtml(currentSearchQuery)}"
              autocomplete="off"
            />
            <div style="position:absolute; right:10px; display:flex; align-items:center; gap:6px; z-index:1;">
              <button type="button" id="curriculum-lesson-search-clear" style="${currentSearchQuery ? 'display:inline-flex;' : 'display:none;'} background:none; border:none; color:#94a3b8; cursor:pointer; font-size:14px; padding:4px;" title="Xóa tìm kiếm">
                <i class="fa-solid fa-xmark"></i>
              </button>
              <kbd class="curriculum-search-shortcut" title="Phím tắt">Esc</kbd>
            </div>
          </div>
        </div>

        <!-- Sort Order -->
        <div style="flex:1 1 200px; min-width:180px;">
          <label style="display:block; font-size:12px; font-weight:700; color:#475569; margin-bottom:6px;">
            <i class="fa-solid fa-arrow-down-short-wide" style="color:#0066cc;"></i> Sắp xếp bài học
          </label>
          <select id="curriculum-sort-select" class="form-input" style="height:42px; border-radius:10px; font-size:13px; background:#ffffff;">
            <option value="order" ${selectedSortOrder === 'order' ? 'selected' : ''}>Thứ tự: Theo chương & STT</option>
            <option value="title-asc" ${selectedSortOrder === 'title-asc' ? 'selected' : ''}>Tên bài (A → Z)</option>
            <option value="newest" ${selectedSortOrder === 'newest' ? 'selected' : ''}>Mới tạo gần nhất</option>
          </select>
        </div>
      </div>
    </div>

    <!-- Active Filter Chapter Banner (hiển thị khi đang lọc theo 1 chương cụ thể) -->
    ${activeFilteredChapter ? `
      <div style="display:flex; align-items:center; justify-content:space-between; padding:12px 16px; background:#eff6ff; border:1px solid #bfdbfe; border-radius:10px; margin-bottom:16px; gap:12px; flex-wrap:wrap;">
        <div style="display:flex; align-items:center; gap:10px;">
          <i class="fa-solid fa-folder-open" style="color:#0066cc; font-size:16px;"></i>
          <span style="font-weight:700; font-size:14px; color:#1e3a8a;">
            Đang lọc: ${escapeHtml(activeFilteredChapter.title)}
          </span>
          <span class="chapter-weak-badge" data-weak-chapter="${activeFilteredChapter.id}" style="display:none; font-size:11px; font-weight:700; background:#fef2f2; color:#b91c1c; border:1px solid #fecaca; padding:2px 8px; border-radius:6px;"></span>
        </div>
        <div style="display:flex; align-items:center; gap:8px;">
          <button class="btn-secondary btn-edit-chapter" data-id="${activeFilteredChapter.id}" data-title="${escapeHtml(activeFilteredChapter.title)}" style="padding:5px 10px; font-size:12px; border-radius:6px; cursor:pointer;" title="Sửa tên chương">
            <i class="fa-solid fa-pen"></i> Sửa tên
          </button>
          <button class="btn-secondary btn-delete-chapter" data-id="${activeFilteredChapter.id}" style="padding:5px 10px; font-size:12px; border-radius:6px; cursor:pointer; color:#ef4444; border-color:#fecaca; background:#fff5f5;" title="Xóa chương">
            <i class="fa-solid fa-trash"></i> Xóa chương
          </button>
          <button class="btn-secondary btn-add-lesson" data-chapter-id="${activeFilteredChapter.id}" style="padding:5px 12px; font-size:12px; font-weight:600; border-radius:6px; cursor:pointer; background:#ffffff; color:#0066cc; border-color:#93c5fd;" title="Thêm bài học vào chương này">
            <i class="fa-solid fa-plus"></i> Thêm bài
          </button>
        </div>
      </div>
    ` : ''}

    <!-- Result Summary / Counter -->
    <div style="display:flex; align-items:center; justify-content:space-between; margin-bottom:12px; padding:0 4px; font-size:13px; color:#475569;">
      <span style="font-weight:600;">
        <i class="fa-solid fa-list-ul" style="color:#0066cc; margin-right:6px;"></i>
        Danh sách bài học (${totalItems} bài${selectedChapterFilter !== 'all' || currentSearchQuery ? ' phù hợp' : ''})
      </span>
      ${(selectedChapterFilter !== 'all' || currentSearchQuery) ? `
        <button id="btn-reset-filters" style="background:none; border:none; color:#0066cc; font-size:12.5px; font-weight:600; cursor:pointer; display:inline-flex; align-items:center; gap:4px;">
          <i class="fa-solid fa-rotate-left"></i> Xóa bộ lọc
        </button>
      ` : ''}
    </div>

    <!-- Main Lessons List -->
    ${pagedLessons.length === 0 ? `
      <div style="text-align:center; padding:48px 20px; color:#64748b; border:2px dashed #e2e8f0; border-radius:12px; background:#f8fafc;">
        <i class="fa-solid fa-magnifying-glass" style="font-size:32px; color:#cbd5e1; display:block; margin-bottom:12px;"></i>
        <p style="font-weight:700; color:#334155; margin-bottom:4px; font-size:15px;">
          ${(selectedChapterFilter !== 'all' || currentSearchQuery) ? 'Không tìm thấy bài học nào phù hợp' : 'Lớp học chưa có bài học nào'}
        </p>
        <p style="font-size:13px; color:#64748b; margin:0 0 16px 0;">
          ${(selectedChapterFilter !== 'all' || currentSearchQuery)
            ? 'Thử đổi từ khóa tìm kiếm hoặc chọn <strong>"Tất cả chương"</strong> để xem đầy đủ bài học.'
            : 'Nhấn nút <strong>"Tạo bài học nhanh"</strong> ở trên để thêm bài học đầu tiên.'}
        </p>
        ${(selectedChapterFilter !== 'all' || currentSearchQuery) ? `
          <button id="btn-reset-filters-empty" class="btn-secondary" style="font-size:13px; padding:7px 16px; border-radius:8px; cursor:pointer;">
            <i class="fa-solid fa-rotate-left"></i> Xóa bộ lọc tìm kiếm
          </button>
        ` : ''}
      </div>
    ` : `
      <div style="display:flex; flex-direction:column; gap:10px;">
        ${pagedLessons.map((l, lIdx) => {
          const isSelected = selectedLessonId === l.id
          const createdDateStr = (l.createdAt || l.created_at) ? new Date(l.createdAt || l.created_at).toLocaleDateString('vi-VN') : ''
          const highlightedTitle = highlightMatch(l.title, currentSearchQuery)
          const highlightedContent = l.content ? highlightMatch(l.content, currentSearchQuery) : ''

          return `
            <div class="curriculum-lesson-card curriculum-lesson-item ${isSelected ? 'active' : ''}" data-id="${l.id}" data-chapter-id="${l.chapterId}" style="cursor:pointer; display:flex; align-items:center; justify-content:space-between; gap:14px; padding:15px 18px; background:#ffffff; border:1px solid ${isSelected ? '#0066cc' : '#e2e8f0'}; border-radius:12px; transition:all 0.15s ease; box-shadow:0 1px 3px rgba(0,0,0,0.02);">
              <div style="display:flex; align-items:flex-start; gap:14px; flex:1; min-width:0;">
                <span style="width:36px; height:36px; border-radius:10px; background:${isSelected ? '#0066cc' : '#eff6ff'}; color:${isSelected ? '#ffffff' : '#0066cc'}; display:inline-flex; align-items:center; justify-content:center; font-size:14px; font-weight:800; flex-shrink:0; margin-top:2px;">
                  ${escapeHtml(l.code || l.orderIndex || (startIndex + lIdx + 1))}
                </span>
                <div style="flex:1; min-width:0;">
                  <div style="display:flex; align-items:center; gap:8px; flex-wrap:wrap; margin-bottom:4px;">
                    <span style="font-size:12px; font-weight:700; color:#0284c7; background:#f0f9ff; border:1px solid #e0f2fe; padding:2px 8px; border-radius:6px; display:inline-flex; align-items:center; gap:4px;">
                      <i class="fa-solid fa-folder" style="font-size:11px;"></i> ${escapeHtml(l.chapterTitle || 'Chương')}
                    </span>
                    ${l.isTrial ? `
                      <span style="font-size:11px; font-weight:700; color:#15803d; background:#dcfce7; border:1px solid #86efac; padding:2px 7px; border-radius:5px; display:inline-flex; align-items:center; gap:4px;">
                        <i class="fa-solid fa-sparkles" style="font-size:10px;"></i> Học thử
                      </span>
                    ` : `
                      <span style="font-size:11px; font-weight:600; color:#64748b; background:#f1f5f9; padding:2px 7px; border-radius:5px; display:inline-flex; align-items:center; gap:4px;">
                        <i class="fa-solid fa-lock" style="font-size:10px;"></i> Nội bộ
                      </span>
                    `}
                  </div>

                  <div class="lesson-title-text" style="font-size:15px; font-weight:700; color:#0f172a; line-height:1.4; margin-bottom:4px;" title="${escapeHtml(l.title)}">
                    ${highlightedTitle}
                  </div>

                  ${highlightedContent ? `
                    <div style="font-size:12.5px; color:#64748b; line-height:1.4; margin-bottom:6px; display:-webkit-box; -webkit-line-clamp:1; -webkit-box-orient:vertical; overflow:hidden;">
                      ${highlightedContent}
                    </div>
                  ` : ''}

                  <div style="display:flex; align-items:center; gap:10px; flex-wrap:wrap; font-size:12px; color:#64748b; margin-top:4px;">
                    ${l.hasVideo ? `
                      <span style="color:#0284c7; font-weight:600; display:inline-flex; align-items:center; gap:4px;">
                        <i class="fa-solid fa-circle-play"></i> Video bài giảng
                      </span>
                    ` : `
                      <span style="color:#94a3b8; display:inline-flex; align-items:center; gap:4px;">
                        <i class="fa-regular fa-circle-play"></i> Chưa có video
                      </span>
                    `}
                    <span>•</span>
                    <span style="display:inline-flex; align-items:center; gap:4px;">
                      <i class="fa-solid fa-paperclip" style="color:#64748b;"></i> ${l.theoryFilesCount || (Array.isArray(l.theoryFiles) ? l.theoryFiles.length : 0)} tài liệu
                    </span>
                    <span>•</span>
                    <span style="display:inline-flex; align-items:center; gap:4px; color:#16a34a; font-weight:600;">
                      <i class="fa-solid fa-list-check"></i> ${l.homeworksCount || (Array.isArray(l.homeworks) ? l.homeworks.length : 0)} bài tập
                    </span>
                    ${createdDateStr ? `
                      <span>•</span>
                      <span style="color:#94a3b8;"><i class="fa-regular fa-calendar"></i> ${createdDateStr}</span>
                    ` : ''}
                  </div>
                </div>
              </div>

              <div style="display:flex; align-items:center; gap:8px; flex-shrink:0;">
                <span class="btn-open-lesson-hint" style="font-size:12.5px; font-weight:600; color:#0066cc; display:inline-flex; align-items:center; gap:6px; padding:6px 12px; border-radius:8px; background:#eff6ff;">
                  Mở bài học <i class="fa-solid fa-chevron-right" style="font-size:11px;"></i>
                </span>
              </div>
            </div>
          `
        }).join('')}
      </div>
    `}

    <!-- Pagination -->
    ${totalPages > 1 ? `
      ${renderPaginationBar({
        currentPage: curriculumCurrentPage,
        totalItems,
        pageSize: CURRICULUM_PAGE_SIZE,
        containerId: 'curriculum-pagination-container',
        pageSizeOptions: [15, 30, 50]
      })}
    ` : ''}
  `
}

// Level 2: Chi tiết bài học đã chọn (Lesson Workspace)
function renderLessonDetail(selectedChapter, selectedLesson) {
  return `
    <div style="margin-bottom:14px; display:flex; align-items:center; justify-content:space-between; gap:12px; flex-wrap:wrap;">
      <nav class="curriculum-breadcrumb" style="margin-bottom:0;">
        <a href="javascript:void(0)" class="curriculum-bc-link btn-back-to-curriculum">
          <i class="fa-solid fa-book-open"></i> Danh sách bài học
        </a>
        <i class="fa-solid fa-chevron-right curriculum-bc-sep"></i>
        <span style="color:#64748b; font-weight:600;">
          <i class="fa-solid fa-folder"></i> ${escapeHtml(selectedChapter?.title || 'Chương')}
        </span>
        <i class="fa-solid fa-chevron-right curriculum-bc-sep"></i>
        <span class="curriculum-bc-current">
          Bài ${escapeHtml(selectedLesson?.code || '')}: ${escapeHtml(selectedLesson?.title || '')}
        </span>
      </nav>
      <button class="btn-secondary btn-back-to-curriculum" style="padding:6px 14px; font-size:12.5px; font-weight:600; border-radius:8px; cursor:pointer; display:inline-flex; align-items:center; gap:6px;">
        <i class="fa-solid fa-arrow-left"></i> Quay lại danh sách bài học
      </button>
    </div>
    ${renderLessonWorkspace(selectedChapter, selectedLesson)}
  `
}

function renderLessonWorkspace(ch, l) {
  const platform = getVideoPlatformInfo(l.videoUrl)
  const theoryFiles = l.theoryFiles || []
  const homeworks = l.homeworks || []
  const isHwLoading = l.homeworks === null
  const createdDateStr = (l.createdAt || l.created_at) ? new Date(l.createdAt || l.created_at).toLocaleDateString('vi-VN') : ''

  return `
    <!-- Lesson Header -->
    <div style="display:flex; justify-content:space-between; align-items:flex-start; gap:16px; flex-wrap:wrap; padding-bottom:16px; border-bottom:1px solid #f1f5f9;">
      <div>
        <div style="font-size:12px; font-weight:600; color:#0066cc; margin-bottom:4px; display:inline-flex; align-items:center; gap:6px; background:#eff6ff; padding:2px 8px; border-radius:6px;">
          <i class="fa-solid fa-folder-open"></i> ${escapeHtml(ch?.title || 'Chương')}
        </div>
        <h2 style="font-size:20px; font-weight:700; color:#0f172a; margin:4px 0 8px 0; line-height:1.3;">
          Bài ${escapeHtml(l.code || '')}: ${escapeHtml(l.title)}
        </h2>
        <div style="display:flex; align-items:center; gap:10px; flex-wrap:wrap;">
          ${(l.isTrial || l.is_trial) ? `
            <span style="font-size:11px; font-weight:700; background:#dcfce7; color:#15803d; border:1px solid #86efac; padding:3px 8px; border-radius:6px; display:inline-flex; align-items:center; gap:4px;">
              <i class="fa-solid fa-sparkles"></i> Cho phép học thử (Công khai)
            </span>
          ` : `
            <span style="font-size:11px; font-weight:600; background:#f1f5f9; color:#475569; border:1px solid #e2e8f0; padding:3px 8px; border-radius:6px; display:inline-flex; align-items:center; gap:4px;">
              <i class="fa-solid fa-lock"></i> Lớp học nội bộ
            </span>
          `}
          ${createdDateStr ? `
            <span style="font-size:12px; color:#64748b; display:inline-flex; align-items:center; gap:4px;">
              <i class="fa-regular fa-calendar" style="color:#94a3b8;"></i> Tạo ngày: ${createdDateStr}
            </span>
          ` : ''}
        </div>
      </div>
      <div style="display:flex; align-items:center; gap:8px; flex-wrap:wrap;">
        <label style="display:inline-flex; align-items:center; gap:7px; padding:8px 14px; font-size:13px; font-weight:600; border-radius:10px; cursor:pointer; background:${(l.isTrial || l.is_trial) ? '#f0fdf4' : '#f8fafc'}; border:1px solid ${(l.isTrial || l.is_trial) ? '#bbf7d0' : '#e2e8f0'}; color:${(l.isTrial || l.is_trial) ? '#15803d' : '#64748b'};" title="Cho phép khách xem bài này mà không cần đăng nhập">
          <input type="checkbox" class="lesson-trial-toggle" data-chapter-id="${ch?.id}" data-lesson-id="${l.id}" ${(l.isTrial || l.is_trial) ? 'checked' : ''} style="width:15px; height:15px; accent-color:#16a34a; cursor:pointer;">
          <i class="fa-solid fa-sparkles"></i> Học thử
        </label>
        <button class="btn-secondary btn-edit-selected-lesson" data-chapter-id="${ch?.id}" data-lesson-id="${l.id}" style="padding:8px 16px; font-size:13px; font-weight:600; border-radius:10px; display:inline-flex; align-items:center; gap:6px; cursor:pointer;">
          <i class="fa-solid fa-pen-to-square" style="color:#0066cc;"></i> Sửa bài học
        </button>
        <button class="btn-secondary btn-delete-selected-lesson" data-chapter-id="${ch?.id}" data-lesson-id="${l.id}" style="padding:8px 14px; font-size:13px; font-weight:600; border-radius:10px; display:inline-flex; align-items:center; gap:6px; cursor:pointer; color:#ef4444; border-color:#fecaca; background:#fff5f5;">
          <i class="fa-solid fa-trash"></i> Xóa bài
        </button>
      </div>
    </div>

    <!-- Section 1: Video bài giảng -->
    <div>
      <div style="display:flex; align-items:center; justify-content:space-between; margin-bottom:10px;">
        <h3 style="font-size:15px; font-weight:700; color:#0f172a; margin:0; display:flex; align-items:center; gap:8px;">
          <i class="fa-solid fa-video" style="color:#0066cc;"></i> Video bài giảng
        </h3>
      </div>
      ${l.videoUrl ? `
        <div style="display:flex; align-items:center; justify-content:space-between; padding:14px 18px; background:#f8fafc; border:1px solid #e2e8f0; border-radius:12px; gap:16px; flex-wrap:wrap;">
          <div style="display:flex; align-items:center; gap:12px; min-width:240px; flex:1;">
            <div style="width:42px; height:42px; border-radius:10px; background:#ffffff; border:1px solid #e2e8f0; display:flex; align-items:center; justify-content:center; font-size:20px; color:${platform.color}; flex-shrink:0; box-shadow:0 1px 2px rgba(0,0,0,0.04);">
              <i class="${platform.icon}"></i>
            </div>
            <div style="overflow:hidden; flex:1;">
              <div style="font-weight:700; font-size:14px; color:#0f172a;">${platform.name}</div>
              <div style="font-size:12px; color:#64748b; font-family:monospace; white-space:nowrap; overflow:hidden; text-overflow:ellipsis; max-width:480px; margin-top:2px;" title="${escapeHtml(l.videoUrl)}">
                ${escapeHtml(l.videoUrl)}
              </div>
            </div>
          </div>
          <div style="display:flex; align-items:center; gap:8px;">
            <a href="${l.videoUrl}" target="_blank" rel="noopener noreferrer" class="btn-primary" style="padding:8px 16px; font-size:13px; font-weight:600; text-decoration:none; display:inline-flex; align-items:center; gap:6px; border-radius:8px;">
              <i class="fa-solid fa-play"></i> Mở xem video <i class="fa-solid fa-arrow-up-right-from-square" style="font-size:11px;"></i>
            </a>
            <button class="btn-secondary btn-video-url" data-chapter-id="${ch?.id}" data-lesson-id="${l.id}" style="padding:8px 12px; font-size:13px; border-radius:8px; cursor:pointer;" title="Chỉnh sửa liên kết">
              <i class="fa-solid fa-pen"></i> Đổi link
            </button>
          </div>
        </div>
        <div id="meet-origin" data-lesson-id="${l.id}" style="margin-top:10px;"></div>
      ` : `
        <div id="meet-section" data-lesson-id="${l.id}" data-lesson-title="${escapeHtml(l.title)}">
          <div style="padding:20px; border:1px dashed #cbd5e1; border-radius:12px; background:#f8fafc; text-align:center; color:#64748b;">
            <i class="fa-solid fa-circle-notch fa-spin" style="font-size:20px; color:#0066cc; margin-bottom:8px; display:block;"></i>
            <span style="font-size:13px;">Đang kiểm tra buổi học Google Meet...</span>
          </div>
        </div>
      `}
    </div>

    <!-- Section 2: Tài liệu lý thuyết -->
    <div>
      <div style="display:flex; align-items:center; justify-content:space-between; margin-bottom:10px;">
        <h3 style="font-size:15px; font-weight:700; color:#0f172a; margin:0; display:flex; align-items:center; gap:8px;">
          <i class="fa-solid fa-file-pdf" style="color:#ef4444;"></i> Tài liệu lý thuyết (${theoryFiles.length})
        </h3>
        <input type="file" id="theory-upload-input" accept=".pdf" style="display:none;" data-chapter-id="${ch?.id}" data-lesson-id="${l.id}">
        <button class="btn-secondary" id="btn-upload-theory-file" data-chapter-id="${ch?.id}" data-lesson-id="${l.id}" style="padding:4px 10px; font-size:12px; border-radius:6px; cursor:pointer;" title="Tải file PDF lý thuyết lên">
          <i class="fa-solid fa-upload"></i> Tải file lên
        </button>
      </div>
      ${theoryFiles.length > 0 ? `
        <div style="display:grid; grid-template-columns: repeat(auto-fill, minmax(280px, 1fr)); gap:10px;">
          ${theoryFiles.map(file => {
            const cleanName = formatTheoryFileName(file)
            const fileUrl = file.startsWith('http') ? file : `${SUPABASE_URL}/storage/v1/object/public/pdf-files/${file}`
            const mappedUrl = file.startsWith('http') ? file : fileUrl.replace(/https?:\/\/kong:8000/g, import.meta.env.VITE_SUPABASE_URL || 'http://localhost:54321')
            return `
              <div style="display:flex; align-items:center; justify-content:space-between; padding:10px 14px; background:#f8fafc; border:1px solid #e2e8f0; border-radius:10px; gap:10px;">
                <div style="display:flex; align-items:center; gap:10px; overflow:hidden; flex:1; min-width:0;">
                  <i class="fa-solid fa-file-pdf" style="color:#ef4444; font-size:20px; flex-shrink:0;"></i>
                  <span style="font-size:13px; font-weight:600; color:#334155; white-space:nowrap; overflow:hidden; text-overflow:ellipsis;" title="${escapeHtml(cleanName)}">
                    ${escapeHtml(cleanName)}
                  </span>
                </div>
                <div style="display:flex; align-items:center; gap:6px; flex-shrink:0;">
                  <button class="btn-secondary" style="padding:4px 8px; font-size:12px; border-radius:6px; cursor:pointer;" onclick="window.previewTheoryPdf('${escapeHtml(cleanName)}', '${mappedUrl}')" title="Xem trước tài liệu">
                    <i class="fa-solid fa-eye"></i> Xem
                  </button>
                  <a href="${mappedUrl}" target="_blank" download class="btn-secondary" style="padding:4px 8px; font-size:12px; border-radius:6px; text-decoration:none; color:#475569;" title="Tải xuống">
                    <i class="fa-solid fa-download"></i>
                  </a>
                  <button class="btn-secondary btn-delete-theory-file" data-chapter-id="${ch?.id}" data-lesson-id="${l.id}" data-file="${escapeHtml(file)}" data-name="${escapeHtml(cleanName)}" style="padding:4px 8px; font-size:12px; border-radius:6px; cursor:pointer; color:#ef4444; border-color:#fecaca; background:#fff5f5;" title="Xóa file này">
                    <i class="fa-solid fa-trash"></i>
                  </button>
                </div>
              </div>
            `
          }).join('')}
        </div>
      ` : `
        <div style="padding:20px; border:1px dashed #cbd5e1; border-radius:12px; background:#f8fafc; text-align:center; color:#64748b;">
          <i class="fa-solid fa-file-arrow-up" style="font-size:24px; color:#cbd5e1; margin-bottom:8px; display:block;"></i>
          <span style="font-size:13px;">Chưa có tài liệu lý thuyết nào đính kèm.</span>
        </div>
      `}
    </div>

    <!-- Section 3: Bài tập thực hành & BTVN -->
    <div>
      <div style="display:flex; align-items:center; justify-content:space-between; margin-bottom:12px; flex-wrap:wrap; gap:10px;">
        <h3 style="font-size:15px; font-weight:700; color:#0f172a; margin:0; display:flex; align-items:center; gap:8px;">
          <i class="fa-solid fa-list-check" style="color:#10b981;"></i> Danh sách bài tập & Đề thi (${homeworks.length})
        </h3>
        <a href="#create-homework?classId=${activeClassId}&chapterId=${ch?.id}&lessonId=${l.id}" class="btn-primary" style="padding:6px 14px; font-size:12px; font-weight:700; border-radius:8px; text-decoration:none; display:inline-flex; align-items:center; gap:6px;">
          <i class="fa-solid fa-plus"></i> Tạo bài tập mới
        </a>
      </div>

      ${isHwLoading ? `
        <div style="text-align:center; padding:24px; color:#64748b;">
          <i class="fa-solid fa-circle-notch fa-spin" style="color:#0066cc; margin-right:6px;"></i> Đang tải danh sách bài tập...
        </div>
      ` : (homeworks.length > 0 ? `
        <div style="display:flex; flex-direction:column; gap:10px;">
          ${homeworks.map(hw => `
            <div style="display:flex; align-items:center; justify-content:space-between; padding:12px 16px; background:#f8fafc; border:1px solid #e2e8f0; border-radius:12px; gap:12px; flex-wrap:wrap;">
              <div style="display:flex; align-items:center; gap:12px;">
                <div style="width:38px; height:38px; border-radius:10px; background:#f0fdf4; border:1px solid #bbf7d0; display:flex; align-items:center; justify-content:center; color:#16a34a; font-size:16px;">
                  <i class="fa-solid fa-file-signature"></i>
                </div>
                <div>
                  <div style="font-weight:700; font-size:14px; color:#0f172a;">
                    ${escapeHtml(hw.title)}
                  </div>
                  <div style="font-size:12px; color:#64748b; margin-top:2px; display:flex; align-items:center; gap:8px;">
                    <span><i class="fa-regular fa-clock"></i> ${hw.durationMinutes || 45} phút</span>
                    <span>•</span>
                    <span><i class="fa-solid fa-bullseye"></i> Điểm đạt: ${hw.passScore || 5}/${hw.maxScore || 10}</span>
                  </div>
                </div>
              </div>
              <div style="display:flex; align-items:center; gap:8px;">
                <button class="btn-secondary btn-assign-homework" data-id="${hw.id}" data-title="${escapeHtml(hw.title)}" data-duration="${hw.durationMinutes || 45}" data-type="${hw.type || 'PRACTICE'}" data-chapter-title="${escapeHtml(ch?.title || '')}" data-lesson-title="${escapeHtml(l.title)}" style="padding:6px 12px; font-size:12px; font-weight:600; background:#f0fdf4; border-color:#bbf7d0; color:#16a34a; border-radius:8px; cursor:pointer;" title="Gán bài tập sang lớp khác">
                  <i class="fa-solid fa-share-nodes"></i> Gán lớp khác
                </button>
                <button class="btn-secondary btn-edit-homework" data-id="${hw.id}" style="padding:6px 12px; font-size:12px; font-weight:600; border-radius:8px; cursor:pointer;" title="Chỉnh sửa nội dung đề">
                  <i class="fa-solid fa-wrench"></i> Sửa đề
                </button>
              </div>
            </div>
          `).join('')}
        </div>
      ` : `
        <div style="padding:24px; border:1px dashed #cbd5e1; border-radius:12px; background:#f8fafc; text-align:center; color:#64748b;">
          <i class="fa-solid fa-clipboard-question" style="font-size:24px; color:#cbd5e1; margin-bottom:8px; display:block;"></i>
          <span style="font-size:13px;">Chưa có bài tập nào được tạo cho bài học này.</span>
          <div style="margin-top:10px;">
            <a href="#create-homework?classId=${activeClassId}&chapterId=${ch?.id}&lessonId=${l.id}" class="btn-secondary" style="font-size:12px; display:inline-flex; align-items:center; gap:6px; text-decoration:none;">
              <i class="fa-solid fa-plus"></i> Tạo bài tập ngay
            </a>
          </div>
        </div>
      `)}
    </div>
  `
}

export function bindCurriculumTabEvents(classId, currentClass, onRefresh) {
  activeClassId = classId

  const refreshUI = () => {
    if (onRefresh) {
      onRefresh()
    }
  }

  const fetchLessonsAndRefresh = async () => {
    isLoadingCurriculum = true
    refreshUI()
    try {
      await fetchCurriculumLessons(activeClassId)
    } catch (err) {
      curriculumError = err.message || 'Lỗi khi tải danh sách bài học'
    } finally {
      isLoadingCurriculum = false
      refreshUI()
    }
  }

  // Nút Thử lại khi có lỗi tải dữ liệu
  document.getElementById('btn-retry-curriculum')?.addEventListener('click', () => {
    fetchLessonsAndRefresh()
  })

  // Create Chapter Handler
  const openAddChapterModal = () => {
    const modalHTML = `
      <div style="display:flex; flex-direction:column; gap:14px;">
        <div>
          <label style="font-size:13px; font-weight:600; display:block; margin-bottom:6px;">Tên chương <span style="color:#ef4444;">*</span></label>
          <input type="text" id="modal-chapter-title" class="form-input" placeholder="Ví dụ: Phương trình & Hệ phương trình" required>
        </div>
      </div>
    `
    openModal('Thêm Chương Mới', modalHTML, async () => {
      const title = document.getElementById('modal-chapter-title')?.value.trim()
      if (!title) {
        showToast('Vui lòng nhập tên chương học!', 'error')
        return false
      }

      let currObj = state.curriculums.find(c => c.classId === activeClassId)
      if (!currObj) {
        currObj = { classId: activeClassId, chapters: [] }
        state.curriculums.push(currObj)
      }

      try {
        showToast('Đang tạo chương học...', 'info')
        const orderIndex = currObj.chapters.length + 1
        const createdChapter = await api.createChapter({
          classId: activeClassId,
          title,
          orderIndex
        })
        const newChapter = {
          id: createdChapter.id,
          code: '',
          title: createdChapter.title,
          orderIndex,
          lessons: []
        }

        currObj.chapters.push(newChapter)
        currentChapters.push(newChapter)
        selectedChapterId = newChapter.id
        showToast(`Đã thêm thành công chương "${title}"!`, 'success')
        await fetchLessonsAndRefresh()
        return true
      } catch (err) {
        showToast(`Tạo chương học thất bại: ${err.message}`, 'error')
        return false
      }
    })
  }

  document.getElementById('add-chapter-btn')?.addEventListener('click', openAddChapterModal)
  document.getElementById('add-chapter-btn-grid')?.addEventListener('click', openAddChapterModal)

  // Quick Add Lesson Modal (cho phép chọn chương đích từ bất kỳ màn hình nào, tạo xong mở ngay)
  const openQuickAddLessonModal = (defaultChapterId) => {
    let currObj = state.curriculums.find(c => c.classId === activeClassId)
    if (!currObj) {
      currObj = { classId: activeClassId, chapters: [] }
      state.curriculums.push(currObj)
    }

    const chapters = currObj.chapters || []
    if (chapters.length === 0) {
      showToast('Lớp học chưa có chương nào. Vui lòng tạo chương trước khi thêm bài học!', 'warning')
      openAddChapterModal()
      return
    }

    const preselectedChapterId = defaultChapterId || selectedChapterId || chapters[0].id

    const modalHTML = `
      <div class="full-width-mobile" style="display:flex; flex-direction:column; gap:14px; width:440px; max-width: 100%;">
        <div>
          <label style="font-size:13px; font-weight:700; display:block; margin-bottom:6px; color:#1e293b;">
            Chương học đích <span style="color:#ef4444;">*</span>
          </label>
          <select id="modal-quick-chapter-id" class="form-input" style="width:100%;">
            ${chapters.map((ch, idx) => `
              <option value="${ch.id}" ${ch.id === preselectedChapterId ? 'selected' : ''}>
                Chương ${idx + 1}: ${escapeHtml(ch.title)}
              </option>
            `).join('')}
          </select>
        </div>
        <div>
          <label style="font-size:13px; font-weight:700; display:block; margin-bottom:6px; color:#1e293b;">
            Tên bài học <span style="color:#ef4444;">*</span>
          </label>
          <input type="text" id="modal-quick-lesson-title" class="form-input" placeholder="Ví dụ: Ôn tập đại số cơ bản" required>
        </div>
        <div>
          <label style="font-size:13px; font-weight:600; display:block; margin-bottom:6px; color:#475569;">
            Mô tả tóm tắt (tùy chọn)
          </label>
          <textarea id="modal-quick-lesson-content" class="form-input" rows="2" placeholder="Tóm tắt ngắn gọn nội dung hoặc mục tiêu bài học..."></textarea>
        </div>
        <div>
          <label style="font-size:13px; font-weight:600; display:block; margin-bottom:6px; color:#475569;">
            Link Video bài giảng (tùy chọn)
          </label>
          <input type="text" id="modal-quick-lesson-video" class="form-input" placeholder="Dán link YouTube hoặc Google Drive video">
        </div>
        <div>
          <label style="display:inline-flex; align-items:center; gap:8px; font-size:13px; font-weight:600; color:#1e293b; cursor:pointer;">
            <input type="checkbox" id="modal-quick-lesson-trial" style="width:16px; height:16px; accent-color:#16a34a; cursor:pointer;">
            <span><i class="fa-solid fa-sparkles" style="color:#16a34a;"></i> Cho phép học thử (Công khai cho khách)</span>
          </label>
        </div>
      </div>
    `

    openModal('Tạo Bài Học Nhanh', modalHTML, async () => {
      const chapterId = document.getElementById('modal-quick-chapter-id')?.value
      const title = document.getElementById('modal-quick-lesson-title')?.value.trim()
      const content = document.getElementById('modal-quick-lesson-content')?.value.trim() || null
      const videoUrl = document.getElementById('modal-quick-lesson-video')?.value.trim() || null
      const isTrial = document.getElementById('modal-quick-lesson-trial')?.checked || false

      if (!title) {
        showToast('Vui lòng nhập tên bài học!', 'error')
        return false
      }
      if (!chapterId) {
        showToast('Vui lòng chọn chương học đích!', 'error')
        return false
      }

      const targetChapter = chapters.find(c => c.id === chapterId)
      if (!targetChapter) {
        showToast('Chương học đã chọn không tồn tại!', 'error')
        return false
      }

      try {
        showToast('Đang tạo bài học...', 'info')
        const orderIndex = targetChapter.lessons ? targetChapter.lessons.length + 1 : 1
        const createdLesson = await api.createLesson({
          chapterId,
          title,
          orderIndex,
          content,
          videoUrl,
          theoryFiles: [],
          isTrial
        })

        if (!targetChapter.lessons) targetChapter.lessons = []
        const newLesson = {
          id: createdLesson.id,
          code: `${orderIndex}`,
          title: createdLesson.title,
          content: createdLesson.content || content || '',
          videoUrl: createdLesson.video_url || videoUrl || '',
          theoryFiles: createdLesson.theory_files || [],
          isTrial: createdLesson.is_trial ?? isTrial,
          createdAt: createdLesson.created_at || new Date().toISOString(),
          homeworks: [],
          refCount: 0
        }
        targetChapter.lessons.push(newLesson)
        serverLessonsResult.items.unshift({
          ...newLesson,
          chapterId: targetChapter.id,
          chapterTitle: targetChapter.title,
          chapterOrderIndex: targetChapter.orderIndex,
          theoryFilesCount: 0,
          homeworksCount: 0
        })
        serverLessonsResult.total = (serverLessonsResult.total || 0) + 1

        if (cachedClassCurriculumSummaries[activeClassId]) {
          cachedClassCurriculumSummaries[activeClassId].totalLessons = (cachedClassCurriculumSummaries[activeClassId].totalLessons || 0) + 1
        }

        // Tạo xong mở đúng bài / chương đích
        selectedChapterId = chapterId
        selectedLessonId = newLesson.id

        showToast(`Đã thêm thành công bài học "${title}"!`, 'success')
        refreshUI()
        return true
      } catch (err) {
        showToast(`Thêm bài học thất bại: ${err.message}`, 'error')
        return false
      }
    })
  }

  // Gắn nút Tạo bài học nhanh từ toolbar
  document.getElementById('btn-quick-add-lesson')?.addEventListener('click', () => {
    openQuickAddLessonModal()
  })

  // Add Lesson Handler (trong danh sách bài học của chương)
  document.querySelectorAll('.btn-add-lesson').forEach(btn => {
    btn.addEventListener('click', () => {
      const chId = btn.getAttribute('data-chapter-id')
      openQuickAddLessonModal(chId)
    })
  })

  // Edit Lesson Modal (can be triggered from selected workspace or sidebar)
  const openEditLessonModal = (chId, lessonId) => {
    const currObj = state.curriculums.find(c => c.classId === activeClassId)
    const ch = currObj?.chapters.find(c => c.id === chId)
    const lesson = ch?.lessons?.find(l => l.id === lessonId)
    if (!lesson) return

    const modalHTML = `
      <div class="full-width-mobile" style="display:flex; flex-direction:column; gap:14px; width:380px; max-width: 100%;">
        <div>
          <label style="font-size:13px; font-weight:600; display:block; margin-bottom:6px;">Tên bài học <span style="color:#ef4444;">*</span></label>
          <input type="text" id="modal-lesson-title" class="form-input" value="${escapeHtml(lesson.title)}" required>
        </div>
      </div>
    `

    openModal(`Sửa Bài Học`, modalHTML, async () => {
      const title = document.getElementById('modal-lesson-title')?.value.trim()
      if (!title) {
        showToast('Vui lòng nhập tên bài học!', 'error')
        return false
      }

      try {
        showToast('Đang cập nhật bài học...', 'info')
        await api.updateLesson({ lessonId, title })

        lesson.title = title

        showToast('Cập nhật bài học thành công!', 'success')
        refreshUI()
        return true
      } catch (err) {
        showToast(`Cập nhật bài học thất bại: ${err.message}`, 'error')
        return false
      }
    })
  }

  // Modal nhập link video riêng (dùng cho nút Đổi link / Thêm link video / Nhập link thủ công)
  const openVideoUrlModal = (chId, lessonId) => {
    const currObj = state.curriculums.find(c => c.classId === activeClassId)
    const ch = currObj?.chapters.find(c => c.id === chId)
    const lesson = ch?.lessons?.find(l => l.id === lessonId)
    if (!lesson) return

    const modalHTML = `
      <div class="full-width-mobile" style="display:flex; flex-direction:column; gap:14px; width:380px; max-width: 100%;">
        <div>
          <label style="font-size:13px; font-weight:600; display:block; margin-bottom:6px;">Link Video (Drive/Youtube)</label>
          <input type="text" id="modal-lesson-video" class="form-input" value="${escapeHtml(lesson.videoUrl || '')}" placeholder="Dán link youtube hoặc drive vào đây">
        </div>
      </div>
    `

    openModal(`Gắn Link Video`, modalHTML, async () => {
      const videoUrl = document.getElementById('modal-lesson-video')?.value.trim() || null
      try {
        showToast('Đang lưu link video...', 'info')
        await api.updateLesson({ lessonId, videoUrl })

        lesson.videoUrl = videoUrl || ''

        showToast('Đã gắn link video cho bài học!', 'success')
        refreshUI()
        return true
      } catch (err) {
        showToast(`Lưu link thất bại: ${err.message}`, 'error')
        return false
      }
    })
  }

  document.querySelectorAll('.btn-edit-selected-lesson').forEach(btn => {
    btn.addEventListener('click', () => {
      const chId = btn.getAttribute('data-chapter-id')
      const lessonId = btn.getAttribute('data-lesson-id')
      openEditLessonModal(chId, lessonId)
    })
  })

  // Nút gắn link video (mở modal 1 input riêng)
  document.querySelectorAll('.btn-video-url').forEach(btn => {
    btn.addEventListener('click', () => {
      const chId = btn.getAttribute('data-chapter-id')
      const lessonId = btn.getAttribute('data-lesson-id')
      openVideoUrlModal(chId, lessonId)
    })
  })

  // Tickbox Học thử ở header chi tiết bài học
  document.querySelectorAll('.lesson-trial-toggle').forEach(toggle => {
    toggle.addEventListener('change', async () => {
      const chId = toggle.getAttribute('data-chapter-id')
      const lessonId = toggle.getAttribute('data-lesson-id')
      const isTrial = toggle.checked
      const currObj = state.curriculums.find(c => c.classId === activeClassId)
      const lesson = currObj?.chapters.find(c => c.id === chId)?.lessons?.find(l => l.id === lessonId)
      if (!lesson) return
      toggle.disabled = true
      try {
        await api.updateLesson({ lessonId, isTrial })
        lesson.isTrial = isTrial
        lesson.is_trial = isTrial
        showToast(isTrial ? 'Đã bật chế độ học thử cho bài này!' : 'Đã tắt chế độ học thử.', 'success')
        refreshUI()
      } catch (err) {
        showToast(`Đổi chế độ học thử thất bại: ${err.message}`, 'error')
        toggle.checked = !isTrial
        toggle.disabled = false
      }
    })
  })

  // Upload theory file directly (replaces "Quản lý file" modal flow)
  const uploadBtn = document.getElementById('btn-upload-theory-file')
  const uploadInput = document.getElementById('theory-upload-input')
  uploadBtn?.addEventListener('click', () => uploadInput?.click())
  uploadInput?.addEventListener('change', async (e) => {
    const file = e.target.files?.[0]
    if (!file) return
    const chId = uploadInput.getAttribute('data-chapter-id')
    const lessonId = uploadInput.getAttribute('data-lesson-id')
    const currObj = state.curriculums.find(c => c.classId === activeClassId)
    const lesson = currObj?.chapters.find(c => c.id === chId)?.lessons?.find(x => x.id === lessonId)
    if (!lesson) return
    try {
      showToast('Đang tải file lên...', 'info')
      const uploadedName = await api.uploadFile(file)
      const nextFiles = [...(lesson.theoryFiles || []), uploadedName]
      await api.updateLesson({
        lessonId,
        chapterId: chId,
        title: lesson.title,
        orderIndex: parseInt(lesson.code, 10) || 1,
        videoUrl: lesson.videoUrl || null,
        theoryFiles: nextFiles,
        isTrial: lesson.isTrial || lesson.is_trial || false
      })
      lesson.theoryFiles = nextFiles
      showToast('Tải file lên thành công!', 'success')
      refreshUI()
    } catch (err) {
      showToast(`Tải lên thất bại: ${err.message}`, 'error')
    } finally {
      uploadInput.value = ''
    }
  })

  // Delete theory file with confirm popup
  document.querySelectorAll('.btn-delete-theory-file').forEach(btn => {
    btn.addEventListener('click', () => {
      const chId = btn.getAttribute('data-chapter-id')
      const lessonId = btn.getAttribute('data-lesson-id')
      const file = btn.getAttribute('data-file')
      const name = btn.getAttribute('data-name') || file
      if (!file) return
      openModal('Xóa tài liệu', `
        <div style="font-size:14px; color:#334155; line-height:1.6;">
          Bạn có chắc chắn muốn xóa file <strong>"${escapeHtml(name)}"</strong> khỏi bài học này?<br>
          <span style="font-size:12px; color:#64748b;">File sẽ bị gỡ khỏi danh sách tài liệu lý thuyết.</span>
        </div>
      `, async () => {
        const currObj = state.curriculums.find(c => c.classId === activeClassId)
        const lesson = currObj?.chapters.find(c => c.id === chId)?.lessons?.find(x => x.id === lessonId)
        if (!lesson) return false
        try {
          showToast('Đang xóa file...', 'info')
          const nextFiles = (lesson.theoryFiles || []).filter(f => f !== file)
          await api.updateLesson({
            lessonId,
            chapterId: chId,
            title: lesson.title,
            orderIndex: parseInt(lesson.code, 10) || 1,
            videoUrl: lesson.videoUrl || null,
            theoryFiles: nextFiles,
            isTrial: lesson.isTrial || lesson.is_trial || false
          })
          // Best-effort: xóa object trong storage nếu là file Supabase Storage
          if (!file.startsWith('http')) {
            try {
              await fetch(`${SUPABASE_URL}/storage/v1/object/pdf-files/${file}`, {
                method: 'DELETE',
                headers: { 'Authorization': `Bearer ${state.token}` }
              })
            } catch (_) {}
          }
          lesson.theoryFiles = nextFiles
          showToast('Đã xóa file thành công!', 'success')
          refreshUI()
          return true
        } catch (err) {
          showToast(`Xóa file thất bại: ${err.message}`, 'error')
          return false
        }
      })
    })
  })

  // Delete Lesson Handler
  document.querySelectorAll('.btn-delete-selected-lesson').forEach(btn => {
    btn.addEventListener('click', async () => {
      const chId = btn.getAttribute('data-chapter-id')
      const lessonId = btn.getAttribute('data-lesson-id')
      const currObj = state.curriculums.find(c => c.classId === activeClassId)
      const ch = currObj?.chapters.find(c => c.id === chId)
      const lesson = ch?.lessons?.find(l => l.id === lessonId)
      if (!lesson) return

      if (confirm(`Bạn có chắc chắn muốn xóa bài học "${lesson.title}"?`)) {
        try {
          showToast('Đang xóa bài học...', 'info')
          await api.deleteLesson(lessonId)
          ch.lessons = ch.lessons.filter(l => l.id !== lessonId)
          showToast(`Đã xóa bài học "${lesson.title}"`, 'success')
          if (selectedLessonId === lessonId) {
            selectedLessonId = ch.lessons[0]?.id || null
          }
          await fetchLessonsAndRefresh()
        } catch (err) {
          showToast(`Xóa bài học thất bại: ${err.message}`, 'error')
        }
      }
    })
  })

  // Delete Chapter Event
  document.querySelectorAll('.btn-delete-chapter').forEach(btn => {
    btn.addEventListener('click', async (e) => {
      e.stopPropagation()
      const chId = btn.getAttribute('data-id')
      if (confirm('Bạn có chắc chắn muốn xóa chương này cùng toàn bộ các bài học bên trong?')) {
        try {
          showToast('Đang xóa chương học...', 'info')
          await api.deleteChapter(chId)
          const currObj = state.curriculums.find(c => c.classId === activeClassId)
          if (currObj) {
            currObj.chapters = currObj.chapters.filter(c => c.id !== chId)
            currentChapters = currentChapters.filter(c => c.id !== chId)
            if (selectedChapterId === chId) {
              selectedChapterId = null
              selectedLessonId = null
            }
            if (cachedClassCurriculumSummaries[activeClassId]) {
              cachedClassCurriculumSummaries[activeClassId].totalChapters = Math.max(0, (cachedClassCurriculumSummaries[activeClassId].totalChapters || 1) - 1)
            }
            showToast('Đã xóa chương học thành công', 'success')
            await fetchLessonsAndRefresh()
          }
        } catch (err) {
          showToast(`Xóa chương học thất bại: ${err.message}`, 'error')
        }
      }
    })
  })

  // Edit Chapter Event
  document.querySelectorAll('.btn-edit-chapter').forEach(btn => {
    btn.addEventListener('click', () => {
      const chId = btn.getAttribute('data-id')
      const currentTitle = btn.getAttribute('data-title')
      
      const modalHTML = `
        <div style="display:flex; flex-direction:column; gap:16px;">
          <div>
            <label style="font-size:13px; font-weight:600; color:#475569; display:block; margin-bottom:6px;">Tên chương học mới</label>
            <input type="text" id="modal-edit-chapter-title" class="form-input" value="${escapeHtml(currentTitle)}" required>
          </div>
        </div>
      `
      openModal('Sửa Tên Chương', modalHTML, async () => {
        const newTitle = document.getElementById('modal-edit-chapter-title')?.value.trim()
        if (!newTitle) {
          showToast('Vui lòng nhập tên chương', 'error')
          return false
        }
        try {
          showToast('Đang cập nhật tên chương...', 'info')
          const updatedChapter = await api.updateChapter({
            chapterId: chId,
            title: newTitle
          })
          const currObj = state.curriculums.find(c => c.classId === activeClassId)
          if (currObj) {
            const ch = currObj.chapters.find(c => c.id === chId)
            if (ch) {
              ch.title = updatedChapter.title
            }
            const ch2 = currentChapters.find(c => c.id === chId)
            if (ch2) {
              ch2.title = updatedChapter.title
            }
            showToast('Cập nhật tên chương thành công', 'success')
            await fetchLessonsAndRefresh()
          }
          return true
        } catch (err) {
          showToast(`Cập nhật thất bại: ${err.message}`, 'error')
          return false
        }
      })
    })
  })

  // Assign Homework Event
  document.querySelectorAll('.btn-assign-homework').forEach(btn => {
    btn.addEventListener('click', (e) => {
      e.stopPropagation()
      const hwId = btn.getAttribute('data-id')
      const hwTitle = btn.getAttribute('data-title') || 'Bài tập'
      const hwDuration = parseInt(btn.getAttribute('data-duration') || '45', 10)
      const hwType = btn.getAttribute('data-type') || 'PRACTICE'
      const chapterTitle = btn.getAttribute('data-chapter-title') || ''
      const lessonTitle = btn.getAttribute('data-lesson-title') || ''
      const currClass = currentClass || state.classes.find(c => c.id === activeClassId)

      openAssignHomeworkModal({
        id: hwId,
        title: hwTitle,
        durationMinutes: hwDuration,
        type: hwType,
        classId: activeClassId,
        className: currClass?.name || 'Lớp học',
        chapterTitle,
        lessonTitle
      }, async () => {
        ensureCurriculumLoaded(activeClassId, refreshUI)
      })
    })
  })

  // Edit Homework Event
  document.querySelectorAll('.btn-edit-homework').forEach(btn => {
    btn.addEventListener('click', () => {
      const hwId = btn.getAttribute('data-id')
      if (hwId) {
        window.location.hash = `#create-homework?homeworkId=${hwId}`
      }
    })
  })

  // ---- Google Meet integration (meet.md §4) ----
  // Khung video render đồng bộ nên trạng thái Meet được nạp bất đồng bộ
  // vào #meet-section (chưa có video) hoặc #meet-origin (đã có video).
  const meetBox = document.getElementById('meet-section')
  if (meetBox) {
    const lessonId = meetBox.getAttribute('data-lesson-id')
    const lessonTitle = meetBox.getAttribute('data-lesson-title') || ''
    const chIdForMeet = selectedChapterId

    const renderNoMeet = () => {
      meetBox.innerHTML = `
        <div style="padding:20px; border:1px dashed #cbd5e1; border-radius:12px; background:#f8fafc; text-align:center; color:#64748b;">
          <i class="fa-solid fa-film" style="font-size:24px; color:#cbd5e1; margin-bottom:8px; display:block;"></i>
          <span style="font-size:13px;">Chưa gắn video bài giảng cho bài học này.</span>
          <div style="margin-top:10px; display:flex; align-items:center; justify-content:center; gap:8px; flex-wrap:wrap;">
            <button class="btn-secondary btn-video-url" data-chapter-id="${chIdForMeet || ''}" data-lesson-id="${lessonId}" style="padding:6px 12px; font-size:12px; border-radius:8px; cursor:pointer;">
              <i class="fa-solid fa-plus"></i> Thêm link video
            </button>
            <button id="btn-create-meet" style="padding:8px 18px; font-size:13px; font-weight:700; border-radius:10px; cursor:pointer; border:none; color:#ffffff; background:linear-gradient(135deg,#00832d,#0066cc); display:inline-flex; align-items:center; gap:8px; box-shadow:0 2px 8px rgba(0,102,204,0.35);">
              <i class="fa-solid fa-video"></i> 📹 Tạo buổi học Google Meet
            </button>
          </div>
        </div>`
      meetBox.querySelector('#btn-create-meet')?.addEventListener('click', async (e) => {
        const btnEl = e.currentTarget
        btnEl.disabled = true
        btnEl.innerHTML = '<i class="fa-solid fa-circle-notch fa-spin"></i> Đang tạo link Meet...'
        try {
          showToast('Đang tạo buổi học Google Meet...', 'info')
          const res = await api.createMeetSession(lessonId, lessonTitle)
          const uri = res?.meeting_uri || res?.meetingUri
          if (uri) window.open(uri, '_blank', 'noopener')
          showToast('Đã tạo buổi học Google Meet!', 'success')
          refreshUI()
        } catch (err) {
          showToast(`Tạo buổi học thất bại: ${err.message}`, 'error')
          btnEl.disabled = false
          btnEl.innerHTML = '<i class="fa-solid fa-video"></i> 📹 Tạo buổi học Google Meet'
        }
      })
      // Nút "Thêm link video" được render động nên bind trực tiếp
      meetBox.querySelectorAll('.btn-video-url').forEach(btn => {
        btn.addEventListener('click', () => {
          openVideoUrlModal(btn.getAttribute('data-chapter-id'), btn.getAttribute('data-lesson-id'))
        })
      })
    }

    const renderWaitingMeet = (session) => {
      meetBox.innerHTML = `
        <div style="border:1px solid #bfdbfe; border-radius:14px; background:linear-gradient(180deg,#f5faff 0%,#eff6ff 100%); padding:16px 18px; box-shadow:0 1px 3px rgba(0,102,204,0.08);">
          <div style="display:flex; align-items:center; justify-content:space-between; gap:14px; flex-wrap:wrap;">
            <div style="display:flex; align-items:center; gap:12px; min-width:0; flex:1 1 240px;">
              <div style="width:44px; height:44px; border-radius:12px; background:#ffffff; border:1px solid #dbeafe; display:flex; align-items:center; justify-content:center; font-size:22px; color:#0066cc; flex-shrink:0; box-shadow:0 1px 2px rgba(0,0,0,0.05);">
                <i class="fa-brands fa-google"></i>
              </div>
              <div style="min-width:0;">
                <div style="font-weight:700; font-size:15px; color:#0f172a; line-height:1.35;">Buổi học Google Meet đã sẵn sàng</div>
                ${session.meeting_code ? `<div style="font-size:12.5px; color:#475569; margin-top:3px;">Mã phòng: <code style="font-family:monospace; font-weight:700; color:#1d4ed8; background:#dbeafe; padding:1px 7px; border-radius:6px;">${escapeHtml(session.meeting_code)}</code></div>` : ''}
              </div>
            </div>
            <div style="display:flex; align-items:center; gap:8px; flex-shrink:0;">
              <a href="${session.meeting_uri}" target="_blank" rel="noopener noreferrer" class="btn-primary" style="height:40px; padding:0 20px; font-size:13.5px; font-weight:700; text-decoration:none; display:inline-flex; align-items:center; gap:8px; border-radius:10px; white-space:nowrap;">
                <i class="fa-solid fa-video"></i> Tham gia Meet <i class="fa-solid fa-arrow-up-right-from-square" style="font-size:11px; opacity:0.85;"></i>
              </a>
              <button class="btn-secondary btn-copy-meet-link" data-uri="${escapeHtml(session.meeting_uri)}" style="height:40px; padding:0 16px; font-size:13px; font-weight:600; border-radius:10px; cursor:pointer; display:inline-flex; align-items:center; gap:7px; background:#ffffff; white-space:nowrap;" title="Copy link Meet để gửi cho học sinh">
                <i class="fa-regular fa-copy"></i> Copy link
              </button>
              <button class="btn-secondary btn-manual-video-link" style="height:40px; padding:0 16px; font-size:13px; font-weight:600; border-radius:10px; cursor:pointer; display:inline-flex; align-items:center; gap:7px; background:#ffffff; white-space:nowrap;" title="Tự dán link video nếu bản ghi chưa về kịp">
                <i class="fa-solid fa-link"></i> Nhập link thủ công
              </button>
              <button class="btn-secondary btn-sync-meet-now" style="height:40px; padding:0 16px; font-size:13px; font-weight:600; border-radius:10px; cursor:pointer; display:inline-flex; align-items:center; gap:7px; background:#ffffff; white-space:nowrap;" title="Quét bản ghi ngay, không cần đợi cron đêm">
                <i class="fa-solid fa-arrows-rotate"></i> Đồng bộ ngay
              </button>
            </div>
          </div>
          <div style="margin-top:14px; padding-top:12px; border-top:1px dashed #bfdbfe; display:flex; flex-direction:column; gap:6px;">
            <div style="display:inline-flex; align-items:center; gap:8px; align-self:flex-start; background:#fef9c3; border:1px solid #fde047; color:#854d0e; font-size:12.5px; font-weight:600; padding:7px 13px; border-radius:9px;">
              <i class="fa-solid fa-hourglass-half"></i> Đang đợi đồng bộ bản ghi từ Google Drive...
            </div>
            <div style="font-size:12.5px; color:#64748b; line-height:1.5;">
              Sau khi kết thúc buổi học và bản ghi được xử lý xong, video sẽ tự động gắn vào bài học này (đồng bộ rạng sáng hàng ngày, tự thử lại nếu lỗi).
            </div>
          </div>
        </div>`
      bindCopyMeetLinkButtons(meetBox)
      // Nhập link thủ công: mở modal sửa bài học để dán video_url
      meetBox.querySelector('.btn-manual-video-link')?.addEventListener('click', () => {
        openVideoUrlModal(chIdForMeet, lessonId)
      })
      // Đồng bộ ngay: quét bản ghi của buổi này mà không đợi cron
      meetBox.querySelector('.btn-sync-meet-now')?.addEventListener('click', async (e) => {
        const btnEl = e.currentTarget
        btnEl.disabled = true
        const original = btnEl.innerHTML
        btnEl.innerHTML = '<i class="fa-solid fa-circle-notch fa-spin"></i> Đang đồng bộ...'
        try {
          showToast('Đang quét bản ghi Google Meet...', 'info')
          const res = await api.syncMeetNow(lessonId)
          if (res?.outcome === 'READY') {
            showToast('Đã lấy được video! Bài học được gắn link tự động.', 'success')
            // Renew: lấy drive_url mới về patch vào state rồi mới render,
            // tránh refreshUI từ dữ liệu cũ (vẫn hiện card chờ)
            try {
              const meet = await api.getMeetSession(lessonId)
              const driveUrl = meet?.recordings?.find(r => r.drive_url)?.drive_url
              if (driveUrl) {
                const currObj = state.curriculums.find(c => c.classId === activeClassId)
                const lesson = currObj?.chapters
                  ?.find(c => c.id === chIdForMeet)?.lessons
                  ?.find(l => l.id === lessonId)
                if (lesson) lesson.videoUrl = driveUrl
              }
            } catch (e) {
              console.warn('Renew lesson video_url failed:', e)
            }
          } else if (res?.outcome === 'EXPIRED') {
            showToast('Buổi học đã quá hạn 7 ngày, không còn bản ghi.', 'error')
          } else if (res?.outcome === 'ERROR') {
            showToast(`Đồng bộ lỗi: ${res?.message || 'thử lại sau'}`, 'error')
          } else {
            showToast('Chưa có bản ghi từ Google. Thử lại sau khi buổi học kết thúc.', 'info')
          }
          refreshUI()
        } catch (err) {
          showToast(`Đồng bộ thất bại: ${err.message}`, 'error')
          btnEl.disabled = false
          btnEl.innerHTML = original
        }
      })
    }

    api.getMeetSession(lessonId)
      .then(res => {
        if (!res || !res.session) {
          renderNoMeet()
          return
        }
        // Session tồn tại nhưng video_url vẫn rỗng -> chờ đồng bộ
        renderWaitingMeet(res.session)
      })
      .catch(() => renderNoMeet())
  }

  // Scenario 3 bổ sung: nút xem bản gốc Google Drive khi video đã về
  const originBox = document.getElementById('meet-origin')
  if (originBox) {
    const lessonId = originBox.getAttribute('data-lesson-id')
    api.getMeetSession(lessonId)
      .then(res => {
        const rec = res?.recordings?.find(r => r.drive_url) || res?.recordings?.[0]
        const driveUrl = rec?.drive_url
        if (res?.session && driveUrl) {
          originBox.innerHTML = `
            <div style="display:flex; align-items:center; gap:8px; flex-wrap:wrap; padding:8px 12px; background:#f0fdf4; border:1px solid #bbf7d0; border-radius:10px;">
              <span style="font-size:12px; font-weight:700; color:#15803d; display:inline-flex; align-items:center; gap:6px;">
                <i class="fa-solid fa-circle-check"></i> Video tự động từ Google Meet
              </span>
              <a href="${driveUrl}" target="_blank" rel="noopener noreferrer" style="font-size:12px; font-weight:600; color:#0066cc; text-decoration:none; display:inline-flex; align-items:center; gap:4px;">
                <i class="fa-solid fa-clock-rotate-left"></i> Xem bản gốc trên Google Drive
              </a>
              ${res.session.meeting_uri ? `
              <button class="btn-secondary btn-copy-meet-link" data-uri="${escapeHtml(res.session.meeting_uri)}" style="padding:4px 10px; font-size:12px; border-radius:6px; cursor:pointer; display:inline-flex; align-items:center; gap:4px;" title="Copy link Meet để gửi cho học sinh">
                <i class="fa-solid fa-copy"></i> Copy link Meet
              </button>` : ''}
            </div>`
          bindCopyMeetLinkButtons(originBox)
        }
      })
      .catch(() => {})
  }

  // Chapter Filter Change (Bộ lọc chương học)
  const chapterFilterSelect = document.getElementById('curriculum-chapter-filter')
  chapterFilterSelect?.addEventListener('change', async (e) => {
    selectedChapterFilter = e.target.value
    curriculumCurrentPage = 1
    await fetchLessonsAndRefresh()
  })

  // Sort Order Change (Sắp xếp danh sách bài học)
  const sortSelect = document.getElementById('curriculum-sort-select')
  sortSelect?.addEventListener('change', async (e) => {
    selectedSortOrder = e.target.value
    curriculumCurrentPage = 1
    await fetchLessonsAndRefresh()
  })

  // Search Input for Lesson-First List (Debounced search & realtime filter via Server API)
  const lessonSearchInput = document.getElementById('curriculum-lesson-search-input')
  const lessonSearchClear = document.getElementById('curriculum-lesson-search-clear')

  const searchCtrl = createSearchController({
    debounceMs: 250,
    onSearch: async (q, { isCurrent, signal }) => {
      currentSearchQuery = q
      curriculumCurrentPage = 1
      try {
        await fetchCurriculumLessons(activeClassId, { signal })
        if (!isCurrent()) return
        refreshUI()
      } catch (err) {
        if (err?.name === 'AbortError') return
        if (!isCurrent()) return
        curriculumError = err.message || 'Lỗi tìm kiếm'
        refreshUI()
      }
    }
  })

  lessonSearchInput?.addEventListener('input', (e) => {
    const val = e.target.value
    searchCtrl.search(val)
    if (lessonSearchClear) {
      lessonSearchClear.style.display = val ? 'inline-flex' : 'none'
    }
  })

  const handleClearSearch = async () => {
    if (lessonSearchInput) lessonSearchInput.value = ''
    currentSearchQuery = ''
    searchCtrl.abort()
    curriculumCurrentPage = 1
    await fetchLessonsAndRefresh()
  }

  lessonSearchClear?.addEventListener('click', handleClearSearch)

  lessonSearchInput?.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') {
      handleClearSearch()
      lessonSearchInput?.blur()
    }
  })

  // Reset Filters Handlers
  const handleResetFilters = async () => {
    selectedChapterFilter = 'all'
    currentSearchQuery = ''
    curriculumCurrentPage = 1
    searchCtrl.abort()
    const inp = document.getElementById('curriculum-lesson-search-input')
    if (inp) inp.value = ''
    await fetchLessonsAndRefresh()
  }
  document.getElementById('btn-reset-filters')?.addEventListener('click', handleResetFilters)
  document.getElementById('btn-reset-filters-empty')?.addEventListener('click', handleResetFilters)

  // Pagination Handler
  bindPaginationEvents({
    containerId: 'curriculum-pagination-container',
    onPageChange: async (newPage) => {
      curriculumCurrentPage = newPage
      await fetchLessonsAndRefresh()
    },
    onPageSizeChange: async (newSize) => {
      CURRICULUM_PAGE_SIZE = newSize
      curriculumCurrentPage = 1
      await fetchLessonsAndRefresh()
    }
  })

  // Click on a Lesson Card: Mở trực tiếp workspace chi tiết bài học
  document.querySelectorAll('.curriculum-lesson-card').forEach(card => {
    card.addEventListener('click', async (e) => {
      if (e.target.closest('button, a, input, select')) return

      const lessonId = card.getAttribute('data-id')
      const chId = card.getAttribute('data-chapter-id')
      if (!lessonId) return

      selectedLessonId = lessonId
      selectedChapterId = chId || null

      const currObj = state.curriculums.find(c => c.classId === activeClassId)
      const ch = currObj?.chapters?.find(c => c.id === chId)

      // Lazy-load danh sách bài học của chương nếu chưa tải đầy đủ
      if (ch && ch.lessons === null) {
        try {
          const rawLessons = await api.getLessons(chId)
          ch.lessons = (rawLessons || []).map((l, idx) => ({
            id: l.id,
            code: `${l.order_index || (idx + 1)}`,
            title: l.title,
            content: l.content || '',
            videoUrl: l.video_url || '',
            theoryFiles: l.theory_files || [],
            isTrial: l.is_trial || l.isTrial || false,
            createdAt: l.created_at || l.createdAt || null,
            refCount: 0,
            homeworks: null
          }))
        } catch (err) {
          console.warn('Failed to load lessons for chapter:', err)
        }
      }

      // Đảm bảo bài học có đầy đủ theoryFiles và videoUrl
      let lesson = ch?.lessons?.find(l => l.id === lessonId)
      if (!lesson) {
        const allL = getCurriculumLessons(activeClassId, currObj?.chapters || [])
        lesson = allL.find(l => l.id === lessonId)
      }

      if (lesson && (lesson.theoryFiles === null || lesson.theoryFiles === undefined)) {
        try {
          const fullLesson = await api.getLesson(lessonId).catch(() => null)
          if (fullLesson) {
            lesson.theoryFiles = fullLesson.theory_files || []
            lesson.videoUrl = fullLesson.video_url || lesson.videoUrl || ''
          } else {
            lesson.theoryFiles = []
          }
        } catch (_) {
          lesson.theoryFiles = []
        }
      }

      // Lazy-load bài tập của bài học này nếu chưa có
      if (lesson && (lesson.homeworks === null || lesson.homeworks === undefined)) {
        refreshUI()
        try {
          const rawHomeworks = await api.getHomeworks(lessonId)
          lesson.homeworks = (rawHomeworks || []).map(hw => ({
            id: hw.id,
            title: hw.title,
            lessonId: hw.lesson_id || hw.lessonId || lessonId,
            pdfPath: hw.pdf_path || hw.pdfPath,
            durationMinutes: hw.duration_minutes !== undefined ? hw.duration_minutes : (hw.durationMinutes !== undefined ? hw.durationMinutes : 45),
            passScore: hw.pass_score !== undefined ? hw.pass_score : (hw.passScore !== undefined ? hw.passScore : 5),
            maxScore: hw.max_score !== undefined ? hw.max_score : (hw.maxScore !== undefined ? hw.maxScore : 10),
            deadline: hw.deadline,
            isPublished: hw.is_published !== undefined ? hw.is_published : (hw.isPublished !== undefined ? hw.isPublished : true)
          }))
        } catch (err) {
          console.error('Failed to load homeworks:', err)
          showToast('Không thể tải bài tập!', 'error')
          lesson.homeworks = []
        }
      }

      refreshUI()
    })
  })

  // Back: Quay lại danh sách bài học chính từ workspace
  document.querySelectorAll('.btn-back-to-curriculum, .btn-back-to-lessons, .btn-back-to-chapters').forEach(btn => {
    btn.addEventListener('click', () => {
      selectedLessonId = null
      refreshUI()
    })
  })

  // Shortcut phím tắt / để focus nhanh vào ô tìm kiếm bài học
  const onKeyDownSlash = (e) => {
    if (e.key === '/' && !['INPUT', 'TEXTAREA'].includes(document.activeElement?.tagName)) {
      e.preventDefault()
      lessonSearchInput?.focus()
      lessonSearchInput?.select()
    }
  }
  window.addEventListener('keydown', onKeyDownSlash)
}

// Standalone View compatibility wrapper (redirects to class details tab)
export function renderCurriculumView() {
  if (state.classes.length > 0 && !state.classes.some(c => c.id === activeClassId)) {
    activeClassId = state.classes[0].id
  }

  const currentClass = state.classes.find(c => c.id === activeClassId) || state.classes[0]
  if (currentClass) {
    setTimeout(() => {
      window.location.hash = `#class-details?classId=${currentClass.id}&tab=curriculum`
    }, 0)
    return `
      <div class="app-layout">
        ${renderSidebar('classes-admin')}
        <div class="main-content">
          ${renderNavbar('Nền tảng / Chương trình học')}
          <div class="content-body" style="padding:48px 24px; text-align:center; color:#64748b;">
            <i class="fa-solid fa-circle-notch fa-spin" style="font-size:32px; color:#0066cc; margin-bottom:12px; display:block;"></i>
            Đang chuyển hướng sang Quản lý lớp học...
          </div>
        </div>
      </div>
    `
  }

  return `
    <div class="app-layout">
      ${renderSidebar('classes-admin')}
      <div class="main-content">
        ${renderNavbar('Nền tảng / Chương trình học')}
        <div class="content-body">
          <div class="card" style="padding:48px; text-align:center; color:#64748b;">
            Chưa có lớp học nào.
          </div>
        </div>
      </div>
    </div>
  `
}

export function bindCurriculumEvents() {
  bindSidebarEvents()
}
