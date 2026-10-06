import { renderSidebar, bindSidebarEvents } from '../components/sidebar.js'
import { renderNavbar } from '../components/navbar.js'
import { openModal } from '../components/modal.js'
import { showToast } from '../components/toast.js'
import { state } from '../state.js'
import { api, SUPABASE_URL } from '../api.js'
import { renderPdfViewer } from '../components/pdf-viewer.js'
import { openAssignHomeworkModal } from '../components/assign-homework-modal.js'

function escapeHtml(unsafe) {
  if (unsafe === undefined || unsafe === null) return ''
  return String(unsafe)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;')
}

function formatTheoryFileName(file) {
  if (!file) return ''
  let clean = file.replace(/^[0-9]+_+/, '')
  clean = clean.replace(/_+/g, ' ').trim()
  return clean || file
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
let expandedChapterIds = new Set()
let selectedLessonId = null
let selectedChapterId = null

export async function ensureCurriculumLoaded(classId) {
  const existing = state.curriculums.find(c => c.classId === classId)
  if (existing && existing.chapters && existing.chapters.length > 0) {
    return existing.chapters
  }

  isLoadingCurriculum = true
  try {
    const rawChapters = await api.getChapters(classId)
    const chapters = (rawChapters || []).map(ch => ({
      id: ch.id,
      code: '',
      title: ch.title,
      orderIndex: ch.order_index,
      lessons: null
    }))

    const existingIndex = state.curriculums.findIndex(c => c.classId === classId)
    if (existingIndex !== -1) {
      state.curriculums[existingIndex].chapters = chapters
    } else {
      state.curriculums.push({
        classId,
        chapters
      })
    }

    // Auto-expand first chapter & preload its lessons if present
    if (chapters.length > 0) {
      expandedChapterIds.add(chapters[0].id)
      selectedChapterId = chapters[0].id
      try {
        const rawLessons = await api.getLessons(chapters[0].id)
        chapters[0].lessons = (rawLessons || []).map((l, idx) => ({
          id: l.id,
          code: `${l.order_index || (idx + 1)}`,
          title: l.title,
          videoUrl: l.video_url || '',
          theoryFiles: l.theory_files || [],
          isTrial: l.is_trial || l.isTrial || false,
          createdAt: l.created_at || l.createdAt || null,
          refCount: 0,
          homeworks: null
        }))
        if (chapters[0].lessons.length > 0 && !selectedLessonId) {
          selectedLessonId = chapters[0].lessons[0].id
          // Prefetch homeworks for first lesson
          api.getHomeworks(selectedLessonId).then(rawHw => {
            chapters[0].lessons[0].homeworks = (rawHw || []).map(hw => ({
              id: hw.id,
              title: hw.title,
              lessonId: hw.lesson_id || hw.lessonId || selectedLessonId,
              pdfPath: hw.pdf_path || hw.pdfPath,
              durationMinutes: hw.duration_minutes !== undefined ? hw.duration_minutes : (hw.durationMinutes !== undefined ? hw.durationMinutes : 45),
              passScore: hw.pass_score !== undefined ? hw.pass_score : (hw.passScore !== undefined ? hw.passScore : 5),
              maxScore: hw.max_score !== undefined ? hw.max_score : (hw.maxScore !== undefined ? hw.maxScore : 10),
              deadline: hw.deadline,
              isPublished: hw.is_published !== undefined ? hw.is_published : (hw.isPublished !== undefined ? hw.isPublished : true)
            }))
          }).catch(() => {})
        }
      } catch (e) {
        console.warn('Failed to pre-load first chapter lessons:', e)
      }
    }

    return chapters
  } catch (err) {
    console.error('Failed to load chapters lazily:', err)
    showToast('Không thể tải chương trình học cho lớp này!', 'error')
    return []
  } finally {
    isLoadingCurriculum = false
  }
}

export function renderCurriculumTabHTML(currentClass) {
  if (!currentClass) {
    return `<div class="card" style="padding:24px; text-align:center; color:#64748b;">Không tìm thấy thông tin lớp học.</div>`
  }

  const currObj = state.curriculums?.find(c => c.classId === currentClass.id) || { chapters: [] }
  const chapters = currObj.chapters || []
  const totalLessons = chapters.reduce((acc, ch) => acc + (ch.lessons?.length || 0), 0)

  // Determine currently selected lesson and chapter
  let selectedChapter = null
  let selectedLesson = null
  if (selectedLessonId) {
    for (const ch of chapters) {
      const found = ch.lessons?.find(l => l.id === selectedLessonId)
      if (found) {
        selectedChapter = ch
        selectedLesson = found
        break
      }
    }
  }

  // Fallback to first available lesson if none selected or selected was deleted
  if (!selectedLesson) {
    for (const ch of chapters) {
      if (ch.lessons && ch.lessons.length > 0) {
        selectedChapter = ch
        selectedLesson = ch.lessons[0]
        selectedLessonId = selectedLesson.id
        selectedChapterId = ch.id
        if (!expandedChapterIds.has(ch.id)) {
          expandedChapterIds.add(ch.id)
        }
        break
      }
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
            Quản lý chương, bài học, video bài giảng, tài liệu lý thuyết và bài tập của lớp <strong>${escapeHtml(currentClass.name)}</strong>.
          </p>
        </div>
        <div class="class-toolbar-actions" style="display:flex; align-items:center; gap:10px;">
          <button class="btn-primary" id="add-chapter-btn" style="width:auto; padding:10px 20px; font-size:13px; font-weight:700; border-radius:10px; display:inline-flex; align-items:center; gap:8px;">
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

      <!-- Main Curriculum Workspace -->
      ${isLoadingCurriculum ? `
        <div style="text-align:center; padding:48px 20px; color:#64748b;">
          <i class="fa-solid fa-circle-notch fa-spin" style="font-size:32px; color:#0066cc; margin-bottom:12px; display:block;"></i>
          <p style="font-weight:600; margin:0;">Đang tải danh sách chương & bài học...</p>
        </div>
      ` : (chapters.length === 0 ? `
        <div style="text-align:center; padding:48px 20px; color:#64748b; border:2px dashed #e2e8f0; border-radius:12px; background:#f8fafc;">
          <i class="fa-solid fa-folder-open" style="font-size:36px; color:#cbd5e1; display:block; margin-bottom:12px;"></i>
          <p style="font-weight:700; color:#334155; margin-bottom:4px; font-size:15px;">Chưa có chương học nào cho lớp học này</p>
          <p style="font-size:13px; color:#64748b; margin:0;">Nhấn nút <strong>"Tạo chương mới"</strong> ở trên để bắt đầu thêm bài học.</p>
        </div>
      ` : `
        <div class="curriculum-workspace">
          <!-- Column 1 (Left): Course Outline / Chapters & Lessons -->
          <div class="curriculum-sidebar-panel">
            <div style="font-size:13px; font-weight:700; color:#475569; display:flex; align-items:center; justify-content:space-between; margin-bottom:4px; padding:0 4px;">
              <span><i class="fa-solid fa-list-ol" style="color:#0066cc; margin-right:6px;"></i> Danh mục chương & bài học</span>
              <span style="font-size:11px; font-weight:500; color:#94a3b8;">${chapters.length} chương</span>
            </div>

            ${chapters.map(ch => renderSidebarChapter(ch)).join('')}

            <button class="btn-secondary" id="add-chapter-btn-sidebar" style="width:100%; padding:10px; font-size:13px; font-weight:600; border:1px dashed #cbd5e1; color:#0066cc; border-radius:10px; background:#ffffff; display:inline-flex; align-items:center; justify-content:center; gap:8px; cursor:pointer;">
              <i class="fa-solid fa-plus"></i> Tạo chương mới
            </button>
          </div>

          <!-- Column 2 (Right): Selected Lesson Details Workspace -->
          <div class="curriculum-content-panel">
            ${selectedLesson ? renderLessonWorkspace(selectedChapter, selectedLesson) : `
              <div style="text-align:center; padding:64px 20px; color:#64748b;">
                <i class="fa-solid fa-book-open-reader" style="font-size:48px; color:#cbd5e1; margin-bottom:16px; display:block;"></i>
                <h3 style="font-size:17px; font-weight:700; color:#334155; margin-bottom:6px;">Chưa chọn bài học nào</h3>
                <p style="font-size:13px; color:#64748b; margin:0; max-width:420px; margin:0 auto; line-height:1.5;">
                  Vui lòng chọn một bài học từ danh mục bên trái để xem video bài giảng, tài liệu lý thuyết và bài tập.
                </p>
              </div>
            `}
          </div>
        </div>
      `)}
    </div>
  `
}

function renderSidebarChapter(ch) {
  const isExpanded = expandedChapterIds.has(ch.id)
  const isLessonsLoading = isExpanded && ch.lessons === null
  const lessonCount = ch.lessons ? ch.lessons.length : 0

  return `
    <div class="curriculum-chapter-card" id="sidebar-chapter-${ch.id}">
      <div class="curriculum-chapter-header" data-id="${ch.id}">
        <div style="display:flex; align-items:center; gap:8px; overflow:hidden; flex:1; min-width:0;">
          <i class="fa-solid ${isExpanded ? 'fa-folder-open' : 'fa-folder'}" style="color:#0066cc; font-size:14px; flex-shrink:0;"></i>
          <span style="font-size:14px; font-weight:700; color:#0f172a; white-space:nowrap; overflow:hidden; text-overflow:ellipsis;" title="${escapeHtml(ch.title)}">
            ${escapeHtml(ch.title)}
          </span>
          <span style="font-size:11px; font-weight:600; background:#f1f5f9; color:#64748b; padding:1px 6px; border-radius:6px; flex-shrink:0;">
            ${lessonCount} bài
          </span>
          <span class="chapter-weak-badge" data-weak-chapter="${ch.id}" style="display:none; font-size:11px; font-weight:700; background:#fef2f2; color:#b91c1c; border:1px solid #fecaca; padding:1px 6px; border-radius:6px; flex-shrink:0;" title="Tỉ lệ làm sai của cả lớp ở chương này">
          </span>
        </div>
        <div style="display:flex; align-items:center; gap:8px; flex-shrink:0; margin-left:8px;">
          <button class="btn-edit-chapter" data-id="${ch.id}" data-title="${escapeHtml(ch.title)}" title="Sửa tên chương" style="background:none; border:none; color:#94a3b8; cursor:pointer; font-size:13px; padding:2px;" onclick="event.stopPropagation();">
            <i class="fa-solid fa-pen"></i>
          </button>
          <button class="btn-delete-chapter" data-id="${ch.id}" title="Xóa chương" style="background:none; border:none; color:#ef4444; cursor:pointer; font-size:13px; padding:2px;" onclick="event.stopPropagation();">
            <i class="fa-solid fa-trash"></i>
          </button>
          <i class="fa-solid ${isExpanded ? 'fa-chevron-up' : 'fa-chevron-down'}" style="color:#94a3b8; font-size:12px; margin-left:2px;"></i>
        </div>
      </div>

      <div class="curriculum-lessons-list" style="display: ${isExpanded ? 'flex' : 'none'};">
        ${isLessonsLoading ? `
          <div style="text-align:center; padding:12px; color:#64748b; font-size:12px;">
            <i class="fa-solid fa-circle-notch fa-spin" style="color:#0066cc; margin-right:6px;"></i> Đang tải bài học...
          </div>
        ` : (lessonCount === 0 ? `
          <div style="text-align:center; padding:12px; color:#94a3b8; font-size:12px; font-style:italic;">
            Chưa có bài học nào trong chương này
          </div>
        ` : (ch.lessons || []).map((l, lIdx) => {
          const isActive = l.id === selectedLessonId
          const hwCount = l.homeworks ? l.homeworks.length : 0
          const fileCount = l.theoryFiles ? l.theoryFiles.length : 0

          return `
            <div class="curriculum-lesson-item ${isActive ? 'active' : ''}" data-id="${l.id}" data-chapter-id="${ch.id}">
              <div style="display:flex; align-items:flex-start; gap:8px; overflow:hidden; flex:1; min-width:0;">
                <span style="width:22px; height:22px; border-radius:50%; background:${isActive ? '#0066cc' : '#f1f5f9'}; color:${isActive ? '#ffffff' : '#475569'}; display:inline-flex; align-items:center; justify-content:center; font-size:11px; font-weight:700; flex-shrink:0; margin-top:1px;">
                  ${l.code || (lIdx + 1)}
                </span>
                <div style="overflow:hidden; flex:1; min-width:0;">
                  <div class="lesson-title-text" style="font-size:13px; font-weight:600; color:#1e293b; line-height:1.3; white-space:nowrap; overflow:hidden; text-overflow:ellipsis;" title="${escapeHtml(l.title)}">
                    ${escapeHtml(l.title)}
                  </div>
                  <div style="display:flex; align-items:center; gap:6px; margin-top:3px; flex-wrap:wrap;">
                    ${(l.isTrial || l.is_trial) ? `
                      <span style="font-size:9px; font-weight:700; background:#dcfce7; color:#15803d; border:1px solid #86efac; padding:1px 4px; border-radius:4px; display:inline-flex; align-items:center; gap:2px;">
                        <i class="fa-solid fa-sparkles"></i> HỌC THỬ
                      </span>
                    ` : ''}
                    <span style="font-size:11px; color:#64748b;">
                      <i class="fa-regular fa-file"></i> ${hwCount} BT &nbsp;•&nbsp; <i class="fa-solid fa-paperclip"></i> ${fileCount} TL
                    </span>
                  </div>
                </div>
              </div>
              <i class="fa-solid fa-chevron-right" style="color:${isActive ? '#0066cc' : '#cbd5e1'}; font-size:11px; margin-left:6px; flex-shrink:0;"></i>
            </div>
          `
        }).join(''))}

        <button class="btn-secondary btn-add-lesson" data-chapter-id="${ch.id}" style="font-size:12px; margin-top:4px; padding:6px; border:dashed 1px #cbd5e1; color:#0066cc; background:#ffffff; border-radius:6px; display:inline-flex; align-items:center; justify-content:center; gap:6px; cursor:pointer;">
          <i class="fa-solid fa-plus"></i> Thêm bài học
        </button>
      </div>
    </div>
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
      <div style="display:flex; align-items:center; gap:8px;">
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
            <button class="btn-secondary btn-edit-selected-lesson" data-chapter-id="${ch?.id}" data-lesson-id="${l.id}" style="padding:8px 12px; font-size:13px; border-radius:8px; cursor:pointer;" title="Chỉnh sửa liên kết">
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
        <button class="btn-secondary btn-edit-selected-lesson" data-chapter-id="${ch?.id}" data-lesson-id="${l.id}" style="padding:4px 10px; font-size:12px; border-radius:6px; cursor:pointer;">
          <i class="fa-solid fa-upload"></i> Quản lý file
        </button>
      </div>
      ${theoryFiles.length > 0 ? `
        <div style="display:grid; grid-template-columns: repeat(auto-fill, minmax(280px, 1fr)); gap:10px;">
          ${theoryFiles.map(file => {
            const cleanName = formatTheoryFileName(file)
            const fileUrl = `${SUPABASE_URL}/storage/v1/object/public/pdf-files/${file}`
            const mappedUrl = fileUrl.replace(/https?:\/\/kong:8000/g, import.meta.env.VITE_SUPABASE_URL || 'http://localhost:54321')
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
        <a href="#create-hw?classId=${activeClassId}&lessonId=${l.id}" class="btn-primary" style="padding:6px 14px; font-size:12px; font-weight:700; border-radius:8px; text-decoration:none; display:inline-flex; align-items:center; gap:6px;">
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
            <a href="#create-hw?classId=${activeClassId}&lessonId=${l.id}" class="btn-secondary" style="font-size:12px; display:inline-flex; align-items:center; gap:6px; text-decoration:none;">
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
        expandedChapterIds.add(newChapter.id)
        selectedChapterId = newChapter.id
        showToast(`Đã thêm thành công chương "${title}"!`, 'success')
        refreshUI()
        return true
      } catch (err) {
        showToast(`Tạo chương học thất bại: ${err.message}`, 'error')
        return false
      }
    })
  }

  document.getElementById('add-chapter-btn')?.addEventListener('click', openAddChapterModal)
  document.getElementById('add-chapter-btn-sidebar')?.addEventListener('click', openAddChapterModal)

  // Add Lesson Handler
  document.querySelectorAll('.btn-add-lesson').forEach(btn => {
    btn.addEventListener('click', () => {
      const chId = btn.getAttribute('data-chapter-id')
      const currObj = state.curriculums.find(c => c.classId === activeClassId)
      const ch = currObj?.chapters.find(c => c.id === chId)
      if (!ch) return

      let uploadedTheoryFiles = []

      const renderFilesList = () => {
        const listContainer = document.getElementById('modal-uploaded-files-list')
        if (!listContainer) return
        if (uploadedTheoryFiles.length === 0) {
          listContainer.innerHTML = '<span style="font-size:12px; color:#64748b; font-style:italic;">Chưa tải lên tài liệu lý thuyết nào.</span>'
          return
        }
        listContainer.innerHTML = uploadedTheoryFiles.map((file, idx) => `
          <div style="display:flex; justify-content:space-between; align-items:center; background:#f8fafc; border:1px solid #e2e8f0; padding:6px 12px; border-radius:8px; font-size:13px; color:#334155; margin-bottom:6px;">
            <span style="font-weight:500; font-family:monospace; overflow:hidden; text-overflow:ellipsis; white-space:nowrap; max-width:260px;"><i class="fa-solid fa-file-pdf" style="color:#ef4444;"></i> ${escapeHtml(file.split('_').slice(1).join('_') || file)}</span>
            <button class="btn-remove-theory-file" data-index="${idx}" style="background:none; border:none; color:#ef4444; cursor:pointer;"><i class="fa-solid fa-times"></i></button>
          </div>
        `).join('')
        
        listContainer.querySelectorAll('.btn-remove-theory-file').forEach(btnRem => {
          btnRem.onclick = () => {
            const index = parseInt(btnRem.getAttribute('data-index'), 10)
            uploadedTheoryFiles.splice(index, 1)
            renderFilesList()
          }
        })
      }

      const modalHTML = `
        <div class="full-width-mobile" style="display:flex; flex-direction:column; gap:14px; width:380px; max-width: 100%;">
          <div>
            <label style="font-size:13px; font-weight:600; display:block; margin-bottom:6px;">Tên bài học <span style="color:#ef4444;">*</span></label>
            <input type="text" id="modal-lesson-title" class="form-input" placeholder="Ví dụ: Ôn tập đại số cơ bản" required>
          </div>
          <div>
            <label style="font-size:13px; font-weight:600; display:block; margin-bottom:6px;">Link Video (Drive/Youtube)</label>
            <input type="text" id="modal-lesson-video" class="form-input" placeholder="Dán link youtube hoặc drive vào đây">
          </div>
          <div>
            <label style="font-size:13px; font-weight:600; display:block; margin-bottom:6px;">Tài liệu lý thuyết (PDF)</label>
            <input type="file" id="modal-lesson-file-input" class="form-input" accept=".pdf" style="padding:6px;">
            <div id="modal-uploaded-files-list" style="margin-top:10px; max-height:120px; overflow-y:auto;"></div>
          </div>
          <div style="background:#f0fdf4; border:1px solid #bbf7d0; padding:10px 12px; border-radius:8px;">
            <label style="display:flex; align-items:center; gap:8px; cursor:pointer; font-size:13px; font-weight:600; color:#166534; margin:0;">
              <input type="checkbox" id="modal-lesson-is-trial" style="width:16px; height:16px; accent-color:#16a34a;">
              <span>Cho phép học thử (Công khai cho khách)</span>
            </label>
            <div style="font-size:11px; color:#4d7c0f; margin-left:24px; margin-top:3px;">Khách mới không cần đăng nhập vẫn có thể xem bài và làm bài tập.</div>
          </div>
        </div>
      `

      openModal(`Thêm Bài Học Vào ${ch.title}`, modalHTML, async () => {
        const title = document.getElementById('modal-lesson-title')?.value.trim()
        const videoUrl = document.getElementById('modal-lesson-video')?.value.trim() || null
        const isTrial = document.getElementById('modal-lesson-is-trial')?.checked || false
        if (!title) {
          showToast('Vui lòng nhập tên bài học!', 'error')
          return false
        }

        try {
          showToast('Đang tạo bài học...', 'info')
          const orderIndex = ch.lessons ? ch.lessons.length + 1 : 1
          const createdLesson = await api.createLesson({
            chapterId: chId,
            title,
            orderIndex,
            videoUrl,
            theoryFiles: uploadedTheoryFiles,
            isTrial
          })

          if (!ch.lessons) ch.lessons = []
          const newLesson = {
            id: createdLesson.id,
            code: `${orderIndex}`,
            title: createdLesson.title,
            videoUrl: createdLesson.video_url || '',
            theoryFiles: createdLesson.theory_files || [],
            isTrial: createdLesson.is_trial ?? isTrial,
            createdAt: createdLesson.created_at || new Date().toISOString(),
            homeworks: [],
            refCount: 0
          }
          ch.lessons.push(newLesson)
          selectedLessonId = newLesson.id
          selectedChapterId = chId
          expandedChapterIds.add(chId)

          showToast(`Đã thêm thành công bài học "${title}"!`, 'success')
          refreshUI()
          return true
        } catch (err) {
          showToast(`Thêm bài học thất bại: ${err.message}`, 'error')
          return false
        }
      })

      setTimeout(() => {
        renderFilesList()
        const fileInput = document.getElementById('modal-lesson-file-input')
        if (fileInput) {
          fileInput.onchange = async (e) => {
            const file = e.target.files[0]
            if (!file) return
            try {
              showToast('Đang tải lên file tài liệu...', 'info')
              const uploadedName = await api.uploadFile(file)
              uploadedTheoryFiles.push(uploadedName)
              renderFilesList()
              showToast('Tải lên thành công!', 'success')
              fileInput.value = ''
            } catch (err) {
              showToast(`Tải lên thất bại: ${err.message}`, 'error')
            }
          }
        }
      }, 50)
    })
  })

  // Edit Lesson Modal (can be triggered from selected workspace or sidebar)
  const openEditLessonModal = (chId, lessonId) => {
    const currObj = state.curriculums.find(c => c.classId === activeClassId)
    const ch = currObj?.chapters.find(c => c.id === chId)
    const lesson = ch?.lessons?.find(l => l.id === lessonId)
    if (!lesson) return

    let uploadedTheoryFiles = [...(lesson.theoryFiles || [])]

    const renderFilesList = () => {
      const listContainer = document.getElementById('modal-uploaded-files-list')
      if (!listContainer) return
      if (uploadedTheoryFiles.length === 0) {
        listContainer.innerHTML = '<span style="font-size:12px; color:#64748b; font-style:italic;">Chưa tải lên tài liệu lý thuyết nào.</span>'
        return
      }
      listContainer.innerHTML = uploadedTheoryFiles.map((file, idx) => `
        <div style="display:flex; justify-content:space-between; align-items:center; background:#f8fafc; border:1px solid #e2e8f0; padding:6px 12px; border-radius:8px; font-size:13px; color:#334155; margin-bottom:6px;">
          <span style="font-weight:500; font-family:monospace; overflow:hidden; text-overflow:ellipsis; white-space:nowrap; max-width:280px;"><i class="fa-solid fa-file-pdf" style="color:#ef4444;"></i> ${escapeHtml(file.split('_').slice(1).join('_') || file)}</span>
          <button class="btn-remove-theory-file" data-index="${idx}" style="background:none; border:none; color:#ef4444; cursor:pointer;"><i class="fa-solid fa-times"></i></button>
        </div>
      `).join('')
      
      listContainer.querySelectorAll('.btn-remove-theory-file').forEach(btnRem => {
        btnRem.onclick = () => {
          const index = parseInt(btnRem.getAttribute('data-index'), 10)
          uploadedTheoryFiles.splice(index, 1)
          renderFilesList()
        }
      })
    }

    const modalHTML = `
      <div class="full-width-mobile" style="display:flex; flex-direction:column; gap:14px; width:380px; max-width: 100%;">
        <div>
          <label style="font-size:13px; font-weight:600; display:block; margin-bottom:6px;">Tên bài học <span style="color:#ef4444;">*</span></label>
          <input type="text" id="modal-lesson-title" class="form-input" value="${escapeHtml(lesson.title)}" required>
        </div>
        <div>
          <label style="font-size:13px; font-weight:600; display:block; margin-bottom:6px;">Link Video (Drive/Youtube)</label>
          <input type="text" id="modal-lesson-video" class="form-input" value="${escapeHtml(lesson.videoUrl || '')}" placeholder="Dán link youtube hoặc drive vào đây">
        </div>
        <div>
          <label style="font-size:13px; font-weight:600; display:block; margin-bottom:6px;">Tài liệu lý thuyết (PDF)</label>
          <input type="file" id="modal-lesson-file-input" class="form-input" accept=".pdf" style="padding:6px;">
          <div id="modal-uploaded-files-list" style="margin-top:10px; max-height:120px; overflow-y:auto;"></div>
        </div>
        <div style="background:#f0fdf4; border:1px solid #bbf7d0; padding:10px 12px; border-radius:8px;">
          <label style="display:flex; align-items:center; gap:8px; cursor:pointer; font-size:13px; font-weight:600; color:#166534; margin:0;">
            <input type="checkbox" id="modal-lesson-is-trial" ${lesson.isTrial || lesson.is_trial ? 'checked' : ''} style="width:16px; height:16px; accent-color:#16a34a;">
            <span>Cho phép học thử (Công khai cho khách)</span>
          </label>
          <div style="font-size:11px; color:#4d7c0f; margin-left:24px; margin-top:3px;">Khách mới không cần đăng nhập vẫn có thể xem bài và làm bài tập.</div>
        </div>
      </div>
    `

    openModal(`Sửa Bài Học`, modalHTML, async () => {
      const title = document.getElementById('modal-lesson-title')?.value.trim()
      const videoUrl = document.getElementById('modal-lesson-video')?.value.trim() || null
      const isTrial = document.getElementById('modal-lesson-is-trial')?.checked || false
      if (!title) {
        showToast('Vui lòng nhập tên bài học!', 'error')
        return false
      }

      try {
        showToast('Đang cập nhật bài học...', 'info')
        await api.updateLesson({
          lessonId,
          chapterId: chId,
          title,
          orderIndex: parseInt(lesson.code, 10) || 1,
          videoUrl,
          theoryFiles: uploadedTheoryFiles,
          isTrial
        })

        lesson.title = title
        lesson.videoUrl = videoUrl || ''
        lesson.theoryFiles = uploadedTheoryFiles
        lesson.isTrial = isTrial
        lesson.is_trial = isTrial

        showToast('Cập nhật bài học thành công!', 'success')
        refreshUI()
        return true
      } catch (err) {
        showToast(`Cập nhật bài học thất bại: ${err.message}`, 'error')
        return false
      }
    })

    setTimeout(() => {
      renderFilesList()
      const fileInput = document.getElementById('modal-lesson-file-input')
      if (fileInput) {
        fileInput.onchange = async (e) => {
          const file = e.target.files[0]
          if (!file) return
          try {
            showToast('Đang tải lên file tài liệu...', 'info')
            const uploadedName = await api.uploadFile(file)
            uploadedTheoryFiles.push(uploadedName)
            renderFilesList()
            showToast('Tải lên thành công!', 'success')
            fileInput.value = ''
          } catch (err) {
            showToast(`Tải lên thất bại: ${err.message}`, 'error')
          }
        }
      }
    }, 50)
  }

  document.querySelectorAll('.btn-edit-selected-lesson').forEach(btn => {
    btn.addEventListener('click', () => {
      const chId = btn.getAttribute('data-chapter-id')
      const lessonId = btn.getAttribute('data-lesson-id')
      openEditLessonModal(chId, lessonId)
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
          refreshUI()
        } catch (err) {
          showToast(`Xóa bài học thất bại: ${err.message}`, 'error')
        }
      }
    })
  })

  // Delete Chapter Event
  document.querySelectorAll('.btn-delete-chapter').forEach(btn => {
    btn.addEventListener('click', () => {
      const chId = btn.getAttribute('data-id')
      if (confirm('Bạn có chắc chắn muốn xóa chương này cùng toàn bộ các bài học bên trong?')) {
        try {
          showToast('Đang xóa chương học...', 'info')
          api.deleteChapter(chId).then(() => {
            const currObj = state.curriculums.find(c => c.classId === activeClassId)
            if (currObj) {
              currObj.chapters = currObj.chapters.filter(c => c.id !== chId)
              expandedChapterIds.delete(chId)
              if (selectedChapterId === chId) {
                selectedChapterId = currObj.chapters[0]?.id || null
                selectedLessonId = currObj.chapters[0]?.lessons?.[0]?.id || null
              }
              showToast('Đã xóa chương học', 'success')
              refreshUI()
            }
          })
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
              showToast('Cập nhật tên chương thành công', 'success')
              refreshUI()
            }
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
            <button class="btn-secondary btn-edit-selected-lesson" data-chapter-id="${chIdForMeet || ''}" data-lesson-id="${lessonId}" style="padding:6px 12px; font-size:12px; border-radius:8px; cursor:pointer;">
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
      meetBox.querySelectorAll('.btn-edit-selected-lesson').forEach(btn => {
        btn.addEventListener('click', () => {
          openEditLessonModal(btn.getAttribute('data-chapter-id'), btn.getAttribute('data-lesson-id'))
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
        openEditLessonModal(chIdForMeet, lessonId)
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

  // Toggle Chapter Accordion & Lazy Load Lessons
  document.querySelectorAll('.curriculum-chapter-header').forEach(header => {
    header.addEventListener('click', async (e) => {
      if (e.target.closest('.btn-delete-chapter') || e.target.closest('.btn-edit-chapter')) return

      const chId = header.getAttribute('data-id')
      if (!chId) return

      const currObj = state.curriculums.find(c => c.classId === activeClassId)
      const ch = currObj?.chapters.find(c => c.id === chId)
      if (!ch) return

      if (expandedChapterIds.has(chId)) {
        expandedChapterIds.delete(chId)
        refreshUI()
      } else {
        expandedChapterIds.add(chId)
        selectedChapterId = chId
        if (ch.lessons === null) {
          refreshUI()
          try {
            const rawLessons = await api.getLessons(chId)
            ch.lessons = (rawLessons || []).map((l, idx) => ({
              id: l.id,
              code: `${l.order_index || (idx + 1)}`,
              title: l.title,
              videoUrl: l.video_url || '',
              theoryFiles: l.theory_files || [],
              isTrial: l.is_trial || l.isTrial || false,
              createdAt: l.created_at || l.createdAt || null,
              refCount: 0,
              homeworks: null
            }))
            if (ch.lessons.length > 0 && !selectedLessonId) {
              selectedLessonId = ch.lessons[0].id
            }
          } catch (err) {
            console.error('Failed to load lessons:', err)
            showToast('Không thể tải danh sách bài học!', 'error')
            expandedChapterIds.delete(chId)
          }
        }
        refreshUI()
      }
    })
  })

  // Select Lesson Item & Lazy Load Homeworks
  document.querySelectorAll('.curriculum-lesson-item').forEach(item => {
    item.addEventListener('click', async () => {
      const lessonId = item.getAttribute('data-id')
      const chId = item.getAttribute('data-chapter-id')
      if (!lessonId || !chId) return

      selectedLessonId = lessonId
      selectedChapterId = chId

      const currObj = state.curriculums.find(c => c.classId === activeClassId)
      const ch = currObj?.chapters.find(c => c.id === chId)
      const lesson = ch?.lessons?.find(l => l.id === lessonId)
      if (!lesson) return

      if (lesson.homeworks === null) {
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
        }
      }
      refreshUI()
    })
  })
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
