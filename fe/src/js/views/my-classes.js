import { renderSidebar, bindSidebarEvents } from '../components/sidebar.js'
import mascotUrl from '../../assets/mascot-study.svg'
import { renderNavbar } from '../components/navbar.js'
import { state } from '../state.js'
import { renderPdfViewer } from '../components/pdf-viewer.js'
import { openModal } from '../components/modal.js'
import { showToast } from '../components/toast.js'
import { mochiConfirm } from '../components/mochi-dialog.js'
import { api, SUPABASE_URL } from '../api.js'
import { downloadHomeworkPdf, escapeHtml } from '../utils/download-helper.js'
import { canViewHomeworkPdf } from '../utils/homework-pdf-policy.js'
import {
  normalizeSearchText,
  highlightMatch,
  filterLessons,
  groupLessonsByChapter,
  createSearchController
} from '../utils/curriculum-search.js'
import { getClassLessonsNewestFirst } from '../utils/student-lesson-sort.js'
import { summarizeStudentProgress, studentBalanceIsZero, recentScores } from '../utils/student-dashboard.js'
import { isMochiUI } from '../ui-flag.js'
import { renderMascot } from '../components/mascot.js'
import { renderMochiStudentHome, bindMochiStudentHome } from './mochi/student-home.js'
import { renderMochiLessonMap, bindMochiLessonMap } from './mochi/lesson-map.js'
import { renderMochiLessonDetail, bindMochiLessonDetail } from './mochi/lesson-detail.js'

window.confirmStartHomework = (homeworkId, type = 'PRACTICE') => {
  if (type === 'EXAM') {
    sessionStorage.removeItem(`exam_active_${homeworkId}`)
    window.location.hash = `#exam-room?homeworkId=${homeworkId}`
    return
  }

  if (isMochiUI()) {
    openModal(
      'Bắt đầu làm bài tập',
      `
        <div class="m-modal-start-body" style="text-align:center; display:flex; flex-direction:column; align-items:center; gap:10px; padding:4px 0;">
          <div class="m-mascot-box" style="margin-bottom:2px;">
            ${renderMascot({ mood: 'cheer', size: 96 })}
          </div>
          <div style="font-family:var(--m-font-heading); font-size:18px; font-weight:800; color:var(--m-ink); line-height:1.3;">
            Sẵn sàng làm bài tập chưa bạn ơi?
          </div>
          <p style="font-size:14.5px; color:var(--m-muted); line-height:1.6; margin:0; max-width:380px;">
            Thời gian làm bài sẽ <strong>bắt đầu đếm ngược ngay lập tức</strong> khi bạn nhấn nút bắt đầu!
          </p>
          <div class="m-chip m-chip--ok" style="font-size:13px; font-weight:800; padding:6px 14px; border-radius:var(--m-radius-pill); display:inline-flex; align-items:center; gap:6px; margin-top:4px;">
            <i class="fa-solid fa-stopwatch" aria-hidden="true"></i>
            <span>Đồng hồ sẽ tính giờ tự động</span>
          </div>
        </div>
      `,
      () => {
        window.location.hash = `#homework-attempt?homeworkId=${homeworkId}`
        return true
      },
      { confirmLabel: 'Bắt đầu ngay', cancelLabel: 'Để sau' }
    )
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

let collapsedChapterIds = new Set()
let studentSelectedChapterId = 'all'
// Tab đang xem ở section Chương & Bài học: 'chapters' (mặc định) | 'newest'
let studentLessonViewTab = 'chapters'
let lastStudentClassId = null

// Đo thời gian xem bài học/video: log LESSON_VIEW khi mở, VIDEO_WATCH kèm
// số giây khi rời bài (chỉ học sinh). Dùng keepalive để không mất log khi chuyển trang.
let videoTrackStart = 0
let videoTrackMeta = null
let videoTrackInstalled = false

function flushVideoTrack() {
  if (!videoTrackStart || !videoTrackMeta) return
  const secs = Math.max(0, Math.round((Date.now() - videoTrackStart) / 1000))
  const meta = videoTrackMeta
  videoTrackStart = 0
  videoTrackMeta = null
  // Ghi nhận cả lượt mở nhanh (<5s) với duration thực tế, bỏ qua 0 giây
  if (secs <= 0) return
  try {
    api.logActivity({
      action: 'VIDEO_WATCH',
      metadata: meta,
      durationSeconds: secs
    }, { keepalive: true })
  } catch (_) {}
}

export function renderMyClassesView() {
  if (!(isMochiUI() && state.user?.role === 'STUDENT')) return renderClassicMyClassesView()

  const hashUrl = window.location.hash.replace('#', '')
  const [_, queryString] = hashUrl.split('?')
  const params = new URLSearchParams(queryString || '')
  const classId = params.get('classId')
  const lessonId = params.get('lessonId')
  const isDashboard = !hashUrl || hashUrl.split('?')[0] === 'student-dashboard'
  let classes = state.classes || []
  if (Array.isArray(state.user?.classIds)) classes = classes.filter(item => state.user.classIds.includes(item.id))
  const classChapters = state.classChapters || []
  let activeLesson = null
  if (lessonId) {
    for (const chapter of classChapters) {
      activeLesson = (chapter.lessons || []).find(lesson => lesson.id === lessonId) || null
      if (activeLesson) break
    }
  }
  const activeLessonHomeworks = activeLesson && Array.isArray(activeLesson.homeworks) && activeLesson.homeworks.length
    ? activeLesson.homeworks
    : (state.activeLessonHomeworks || [])

  if (isDashboard) return renderMochiStudentHome({ classes, user: state.user })
  if (classId && activeLesson) return renderMochiLessonDetail({ classes, classChapters, activeLesson, activeLessonHomeworks, classId, role: state.user.role })
  if (classId) return renderMochiLessonMap({ classes, classChapters, classId })
  return renderClassicMyClassesView()
}

export function renderClassicMyClassesView() {
  const hashUrl = window.location.hash.replace('#', '')
  const [_, queryString] = hashUrl.split('?')
  const params = new URLSearchParams(queryString || '')
  const classId = params.get('classId')
  const lessonId = params.get('lessonId')
  const isDashboard = !hashUrl || hashUrl.split('?')[0] === 'student-dashboard'

  let classes = state.classes || []
  if (state.user?.role === 'STUDENT' && Array.isArray(state.user?.classIds)) {
    classes = classes.filter(c => state.user.classIds.includes(c.id))
  }
  const classChapters = state.classChapters || []

  let activeLesson = null
  if (lessonId) {
    for (const ch of classChapters) {
      const found = (ch.lessons || []).find(l => l.id === lessonId)
      if (found) {
        activeLesson = found
        break
      }
    }
  }

  const activeLessonHomeworks = (activeLesson && Array.isArray(activeLesson.homeworks) && activeLesson.homeworks.length > 0)
    ? activeLesson.homeworks
    : (state.activeLessonHomeworks || [])

  // Case 1: Viewing Specific Class Details (Lessons & Assignments)
  if (classId) {
    if (lastStudentClassId !== classId) {
      lastStudentClassId = classId
      studentSelectedChapterId = 'all'
    }
    const selectedClass = classes.find(c => c.id === classId) || classes[0]
    const totalLessonsCount = classChapters.reduce((acc, ch) => acc + ((ch.lessons || []).length), 0)
    const displayedChapters = studentSelectedChapterId === 'all'
      ? classChapters
      : classChapters.filter(c => c.id === studentSelectedChapterId)

    // Tab "Bài mới cập nhật": danh sách phẳng toàn lớp, mới nhất trước, theo đúng
    // contract helper (sort theo createdAt/created_at, không mutate input; mỗi bài
    // kèm chapterId/chapterTitle/chapterOrderIndex). Lọc chương áp dụng như tab chương.
    const newestLessonsAll = getClassLessonsNewestFirst(classChapters)
    const newestLessons = studentSelectedChapterId === 'all'
      ? newestLessonsAll
      : newestLessonsAll.filter(l => l.chapterId === studentSelectedChapterId)

    return `
      <div class="app-layout navy-student student-class-detail">
        ${renderSidebar('my-classes')}
        <div class="main-content">
          ${renderNavbar('Học tập / Lớp học của tôi / ' + (selectedClass?.name || ''))}
          <div class="content-body">
            ${activeLesson ? '' : `
              <!-- Back Button & Page Header -->
              <div style="margin-bottom:16px;">
                <button class="btn-secondary" id="back-to-classes-btn" style="padding:6px 14px; font-size:13px; font-weight:600; cursor:pointer;">
                  <i class="fa-solid fa-arrow-left"></i> Quay lại danh sách lớp học
                </button>
              </div>

              <!-- Class Banner -->
              <div class="card" style="background:linear-gradient(135deg, #ffffff 0%, #f0f7ff 100%); padding:24px; margin-bottom:24px;">
                <div style="display:flex; justify-content:space-between; align-items:center;">
                  <div style="display:flex; align-items:center; gap:20px;">
                    <div style="width:60px; height:60px; background:#0066cc; color:#ffffff; border-radius:16px; display:flex; align-items:center; justify-content:center; font-size:28px;">
                      <i class="fa-solid fa-graduation-cap"></i>
                    </div>
                    <div>
                      <h1 class="page-title" style="font-size:24px; margin-top:2px;">${selectedClass ? selectedClass.name : 'Đang tải...'}</h1>
                      <div style="font-size:13px; color:#64748b; margin-top:4px;">
                        <i class="fa-solid fa-users"></i> ${selectedClass ? selectedClass.studentsCount : 0} Học sinh
                      </div>
                    </div>
                  </div>

                  <div style="text-align:right;">
                    <div style="font-size:12px; color:#64748b; margin-bottom:4px;">Tiến độ môn học</div>
                    <div style="font-family:var(--font-heading); font-size:28px; font-weight:700; color:#0066cc;">${selectedClass ? selectedClass.progress : 0}%</div>
                  </div>
                </div>
              </div>
            `}

            <!-- Main Content: Lessons & Assignments Split -->
            ${activeLesson ? (() => {
              const getEmbedUrl = (url) => {
                if (!url) return null
                let match = url.match(/(?:youtube\.com\/(?:[^\/]+\/.+\/|(?:v|e(?:mbed)?)\/|.*[?&]v=)|youtu\.be\/)([^"&?\/ ]{11})/)
                if (match && match[1]) {
                  return `https://www.youtube.com/embed/${match[1]}`
                }
                match = url.match(/drive\.google\.com\/file\/d\/([a-zA-Z0-9_-]+)/)
                if (match && match[1]) {
                  return `https://drive.google.com/file/d/${match[1]}/preview`
                }
                return url
              }

              const embedUrl = getEmbedUrl(activeLesson.videoUrl)

              return `
                <div style="grid-column: span 3; margin-bottom: 12px; display:flex; gap:12px; align-items:center;">
                  <button class="btn-secondary" id="btn-back-to-lessons" style="padding:8px 16px; font-size:13px; font-weight:600; cursor:pointer; width:auto; display:inline-flex; align-items:center; gap:6px;">
                    <i class="fa-solid fa-arrow-left"></i> Quay lại danh sách bài học
                  </button>
                  <button class="btn-secondary" id="btn-replay-lesson-tour" style="padding:8px 16px; font-size:13px; font-weight:600; cursor:pointer; width:auto; display:inline-flex; align-items:center; gap:6px;">
                    <i class="fa-solid fa-circle-question"></i> Hướng dẫn
                  </button>
                </div>
                <div class="grid-3" style="grid-column: span 3; gap: 20px;">
                  <div style="grid-column: span 2;" id="tour-lesson-left">
                    <!-- Video Area -->
                    ${embedUrl ? `
                      <div style="position:relative; padding-bottom:56.25%; height:0; overflow:hidden; border-radius:12px; border:1px solid #e2e8f0; margin-bottom:20px; background:#000; box-shadow: 0 4px 12px rgba(0,0,0,0.05);">
                        <iframe src="${embedUrl}" style="position:absolute; top:0; left:0; width:100%; height:100%; border:0;" allowfullscreen allow="autoplay; encrypted-media; fullscreen" referrerpolicy="no-referrer"></iframe>
                      </div>
                    ` : `
                      <div style="padding:48px 16px; border:1px dashed #cbd5e1; border-radius:12px; text-align:center; color:#64748b; margin-bottom:20px;">
                        <i class="fa-solid fa-video-slash" style="font-size:32px; color:#94a3b8; margin-bottom:12px;"></i>
                        <p style="font-weight:600; font-size:14px;">Bài học này không có video bài giảng</p>
                      </div>
                    `}

                    <!-- Lesson Information -->
                    <div class="card" id="tour-lesson-info" style="padding:20px; margin-bottom:0;">
                      <h2 style="font-family:var(--font-heading); font-size:18px; font-weight:700; color:#0f172a; margin-bottom:10px;">${activeLesson.title}</h2>
                      <div style="font-size:14px; color:#475569; line-height:1.6;">
                        ${activeLesson.content || 'Không có mô tả chi tiết cho bài học này.'}
                      </div>
                    </div>
                  </div>

                  <!-- Right column beside video: Tài liệu + Bài tập -->
                  <div style="display:flex; flex-direction:column; gap:20px;" id="tour-lesson-right">
                    <div class="card" id="tour-lesson-files" style="padding:20px; margin:0;">
                      <h3 style="font-family:var(--font-heading); font-size:15px; font-weight:700; color:#0f172a; margin:0 0 12px 0;">
                        <i class="fa-solid fa-paperclip" style="color:#0066cc;"></i> Tài liệu đính kèm
                      </h3>
                      ${(!activeLesson.theoryFiles || activeLesson.theoryFiles.length === 0) ? `
                        <p style="font-size:13px; color:#64748b; font-style:italic;">Không có tài liệu lý thuyết nào.</p>
                      ` : `
                        <div style="display:flex; flex-direction:column; gap:8px;">
                          ${activeLesson.theoryFiles.map(file => {
                            const rawName = file.startsWith('http') ? (file.split('/').pop() || file) : file
                            const dispName = rawName.split('_').slice(1).join('_') || rawName
                            return `
                              <div style="display:flex; align-items:center; justify-content:space-between; padding:10px 14px; background:#f8fafc; border:1px solid #e2e8f0; border-radius:8px;">
                                <span style="font-size:13px; font-weight:600; color:#334155; font-family:monospace;">${dispName}</span>
                                <div style="display:flex; gap:6px;">
                                  <button class="btn-secondary btn-preview-theory" data-file="${file}" style="padding:4px 10px; font-size:11px; cursor:pointer; background:#ffffff; border-color:#0066cc; color:#0066cc;">
                                    <i class="fa-solid fa-eye"></i> Xem
                                  </button>
                                  <button class="btn-secondary btn-download-theory" data-file="${file}" style="padding:4px 10px; font-size:11px; cursor:pointer;">
                                    <i class="fa-solid fa-download"></i> Tải xuống
                                  </button>
                                </div>
                              </div>
                            `
                          }).join('')}
                        </div>
                      `}
                  </div>

                  <!-- Homework of Lesson -->
                  <div class="card" id="tour-lesson-homeworks" style="padding:20px; margin:0;">
                    <h3 style="font-family:var(--font-heading); font-size:16px; font-weight:700; margin:0 0 16px 0; color:#0f172a; display:flex; align-items:center; gap:8px;">
                      <i class="fa-solid fa-list-check" style="color:#0066cc;"></i> Bài tập tự luyện
                    </h3>

                      <div style="display:flex; flex-direction:column; gap:12px;">
                        ${(activeLessonHomeworks.length === 0) ? `
                          <div style="text-align:center; padding:16px; border:1px dashed #cbd5e1; border-radius:8px; color:#64748b; font-size:12px;">
                            Bài học này chưa có bài tập nào.
                          </div>
                        ` : `
                          <div style="display:flex; flex-direction:column; gap:12px;">
                            ${activeLessonHomeworks.map(hw => {
                              const isExpired = hw.deadline ? new Date() > new Date(hw.deadline) : false
                              // Học sinh tuyệt đối không thấy nút tải PDF của BÀI THI.
                              const canShowPdf = canViewHomeworkPdf(state.user?.role, hw)
                              const deadlineHtml = hw.deadline
                                ? `<div style="margin-top: 6px; display: flex; flex-direction: column; gap: 4px;">
                                    <span style="color: #b91c1c; background: #fee2e2; border: 1px solid #fecaca; padding: 4px 8px; border-radius: 6px; display: inline-flex; align-items: center; gap: 6px; font-weight: 600; width: fit-content; font-size: 11px;">
                                      <i class="fa-solid fa-calendar-day"></i> Hạn chót: ${new Date(hw.deadline).toLocaleString('vi-VN')}
                                    </span>
                                    ${isExpired ? `
                                      <span style="color: #d97706; background: #fef3c7; border: 1px solid #fde68a; padding: 2px 8px; border-radius: 4px; display: inline-flex; align-items: center; gap: 4px; font-weight: 700; font-size: 10px; width: fit-content; text-transform: uppercase;">
                                        <i class="fa-solid fa-clock-rotate-left"></i> Quá hạn (Nộp muộn)
                                      </span>
                                    ` : ''}
                                   </div>`
                                : ''
                              return `
                                <div style="padding:12px; background:#f8fafc; border:1px solid #e2e8f0; border-radius:10px;">
                                  <div style="font-weight:700; font-size:13px; color:#0f172a; margin-bottom:4px;">${escapeHtml(hw.title)}</div>
                                  <div style="font-size:11px; color:#64748b; margin-bottom:10px; display:flex; flex-direction:column; gap:4px;">
                                    <span><i class="fa-regular fa-clock"></i> Thời gian: ${hw.durationMinutes || 45} phút</span>
                                    ${deadlineHtml}
                                  </div>
                                  <div style="display:flex; gap:6px; margin-top:8px;">
                                    ${canShowPdf ? `<button type="button" class="btn-secondary btn-download-pdf-card" onclick="window.downloadHomeworkPdf('${hw.id}')" style="padding:6px 10px; font-size:11.5px; font-weight:600; background:#eff6ff; color:#0066cc; border:1px solid #bfdbfe; border-radius:6px; display:inline-flex; align-items:center; justify-content:center; gap:5px; cursor:pointer; transition:all 0.15s ease; white-space:nowrap; flex-shrink:0;" title="Tải file PDF đề bài (${escapeHtml(hw.title)})">
                                      <i class="fa-solid fa-file-arrow-down" style="font-size:12px; color:#0066cc;"></i> Tải PDF
                                    </button>` : ''}
                                    <button class="btn-primary" onclick="window.confirmStartHomework('${hw.id}', '${hw.type || 'PRACTICE'}')" style="flex:1; padding:6px 10px; font-size:11.5px; font-weight:600; cursor:pointer; border-radius:6px; background: ${hw.type === 'EXAM' ? '#dc2626' : (isExpired ? '#d97706' : '')}; border-color: ${hw.type === 'EXAM' ? '#dc2626' : (isExpired ? '#d97706' : '')}; display:inline-flex; align-items:center; justify-content:center; gap:4px;">
                                      ${hw.type === 'EXAM' ? '<i class="fa-solid fa-shield-cat"></i> Vào phòng thi' : (isExpired ? 'Vào làm bài (Nộp muộn) <i class="fa-solid fa-arrow-right"></i>' : 'Vào làm bài ngay <i class="fa-solid fa-arrow-right"></i>')}
                                    </button>
                                  </div>
                                </div>
                              `
                            }).join('')}
                          </div>
                        `}
                      </div>
                    </div>
                  </div>
                </div>
              `
            })() : `
              <div>
                <div class="page-header" style="margin-bottom:16px;">
                  <h2 style="font-family:var(--font-heading); font-size:18px; font-weight:700; color:#0f172a;">
                    <i class="fa-solid fa-book-open" style="color:#0066cc;"></i> Chương & Bài học
                  </h2>
                  <p style="margin:6px 0 0 0; font-size:13px; color:#64748b;">Đang hiển thị ${displayedChapters.length} chương • ${displayedChapters.reduce((acc, c) => acc + ((c.lessons || []).length), 0)} bài học</p>
                </div>

                <style>
                  .mc-lesson-card { background:#ffffff; border:1px solid #e2e8f0; box-shadow:0 1px 2px rgba(0,0,0,0.03); }
                  .mc-lesson-card:hover { border-color:#93c5fd; box-shadow:0 4px 12px rgba(0,102,204,0.10); transform:translateY(-1px); }
                  .mc-lesson-card:focus-visible { outline:2px solid #0066cc; outline-offset:2px; }
                  .mc-lesson-selected { background:#e0f2fe; border-color:#0066cc; }
                  .mc-lesson-selected:hover { border-color:#0066cc; box-shadow:0 4px 12px rgba(0,102,204,0.15); }
                  .mc-toggle-btn { background:#f8fafc; border:1px solid #e2e8f0; }
                  .mc-toggle-btn:hover { background:#eff6ff; border-color:#93c5fd; }
                  .mc-toggle-btn:focus-visible { outline:2px solid #0066cc; outline-offset:2px; }
                  @media (max-width: 640px) {
                    .mc-filter-row { flex-direction:column !important; align-items:stretch !important; }
                    .mc-filter-row > div { flex:1 1 100% !important; min-width:0 !important; }
                  }
                  @media (prefers-reduced-motion: reduce) {
                    .mc-lesson-card, .mc-toggle-btn, .mc-tab-btn { transition:none !important; }
                  }
                  .mc-tab-btn { background:transparent; border:none; border-radius:8px; padding:8px 16px; font-family:inherit; font-size:13px; font-weight:700; color:#475569; cursor:pointer; transition:all 0.15s ease; }
                  .mc-tab-btn:hover { color:#0f172a; }
                  .mc-tab-btn:focus-visible { outline:2px solid #0066cc; outline-offset:2px; }
                  .mc-tab-active { background:#ffffff; color:#0f172a; box-shadow:0 1px 3px rgba(15,23,42,0.10); }
                </style>
                <!-- Student Chapter Filter & Search Bar -->
                <div style="background:#ffffff; border:1px solid #e2e8f0; border-radius:14px; padding:18px; margin-bottom:20px; box-shadow:0 1px 3px rgba(15,23,42,0.06);">
                  <div class="mc-filter-row" style="display:flex; gap:12px; align-items:flex-end; flex-wrap:wrap;">
                    <!-- Chapter Filter -->
                    <div style="flex:1 1 240px; min-width:200px;">
                      <label style="display:block; font-size:12px; font-weight:700; color:#475569; margin-bottom:6px;">
                        <i class="fa-solid fa-filter" style="color:#0066cc;"></i> Lọc theo chương học
                      </label>
                      <select id="student-chapter-filter" class="form-input" style="height:42px; border-radius:10px; font-size:13px; background:#ffffff;">
                        <option value="all" ${studentSelectedChapterId === 'all' ? 'selected' : ''}>
                          Tất cả chương (${totalLessonsCount} bài học)
                        </option>
                        ${classChapters.map((ch, idx) => `
                          <option value="${ch.id}" ${studentSelectedChapterId === ch.id ? 'selected' : ''}>
                            Chương ${ch.orderIndex || ch.order_index || idx + 1}: ${escapeHtml(ch.title)} (${(ch.lessons || []).length} bài)
                          </option>
                        `).join('')}
                      </select>
                    </div>

                    <!-- Search Input -->
                    <div style="flex:2 1 320px; min-width:260px; position:relative;">
                      <label style="display:block; font-size:12px; font-weight:700; color:#475569; margin-bottom:6px;">
                        <i class="fa-solid fa-magnifying-glass" style="color:#0066cc;"></i> Tìm kiếm bài học
                      </label>
                      <div class="curriculum-search-input-wrap">
                        <i class="fa-solid fa-magnifying-glass" style="position:absolute; left:14px; color:#94a3b8; font-size:14px; z-index:1;"></i>
                        <input
                          type="text"
                          id="student-curriculum-search-input"
                          class="form-input"
                          style="padding-left:38px; padding-right:72px; height:42px; border-radius:10px; font-size:13.5px; background:#ffffff;"
                          placeholder="Tìm kiếm bài học theo tên, nội dung... (Phím tắt: /)"
                          autocomplete="off"
                        />
                        <div style="position:absolute; right:10px; display:flex; align-items:center; gap:6px; z-index:1;">
                          <button type="button" id="student-curriculum-search-clear" class="btn-clear-search" style="display:none; background:none; border:none; color:#94a3b8; cursor:pointer; font-size:14px; padding:4px;" title="Xóa tìm kiếm">
                            <i class="fa-solid fa-xmark"></i>
                          </button>
                          <kbd class="curriculum-search-shortcut" title="Phím tắt">Esc</kbd>
                        </div>
                      </div>
                      <div id="student-curriculum-search-results-panel" class="curriculum-search-results-panel" style="display:none;"></div>
                    </div>
                  </div>
                </div>

                <div role="tablist" aria-label="Chế độ xem bài học" style="display:flex; gap:6px; flex-wrap:wrap; background:#f1f5f9; border:1px solid #e2e8f0; border-radius:12px; padding:4px; margin-bottom:20px; width:fit-content; max-width:100%;">
                  <button type="button" role="tab" id="student-lesson-tab-chapters" aria-controls="student-lesson-panel-chapters" aria-selected="${studentLessonViewTab === 'chapters' ? 'true' : 'false'}" tabindex="${studentLessonViewTab === 'chapters' ? '0' : '-1'}" data-lesson-tab="chapters" class="mc-tab-btn${studentLessonViewTab === 'chapters' ? ' mc-tab-active' : ''}">Theo chương</button>
                  <button type="button" role="tab" id="student-lesson-tab-newest" aria-controls="student-lesson-panel-newest" aria-selected="${studentLessonViewTab === 'newest' ? 'true' : 'false'}" tabindex="${studentLessonViewTab === 'newest' ? '0' : '-1'}" data-lesson-tab="newest" class="mc-tab-btn${studentLessonViewTab === 'newest' ? ' mc-tab-active' : ''}">Bài mới cập nhật</button>
                </div>

                ${studentLessonViewTab === 'newest' ? `
                  <div id="student-lesson-panel-newest" role="tabpanel" aria-labelledby="student-lesson-tab-newest" tabindex="0">
                    ${(newestLessonsAll.length === 0) ? `
                      <div class="card" style="text-align:center; padding:32px; color:#64748b;">
                        <i class="fa-solid fa-folder-open" style="font-size:36px; color:#94a3b8; margin-bottom:12px;"></i>
                        <p style="font-weight:600;">Lớp học này chưa cập nhật danh sách bài học.</p>
                      </div>
                    ` : (newestLessons.length === 0 ? `
                      <div class="card" style="text-align:center; padding:32px; color:#64748b;">
                        <i class="fa-solid fa-folder-open" style="font-size:36px; color:#94a3b8; margin-bottom:12px;"></i>
                        <p style="font-weight:600;">Không có bài mới cập nhật trong chương đã chọn.</p>
                        <button type="button" class="btn-clear-chapter-filter btn-secondary" style="margin-top:12px; width:auto; cursor:pointer;">Xóa bộ lọc</button>
                      </div>
                    ` : `
                      <p style="font-size:13px; color:#64748b; margin:0 0 12px 0;">${newestLessons.length} bài học${studentSelectedChapterId !== 'all' ? ' trong chương đã chọn' : ''} • sắp xếp mới nhất trước</p>
                      <div style="display:grid; grid-template-columns:repeat(auto-fit, minmax(min(100%, 320px), 1fr)); gap:12px;">
                        ${newestLessons.map((l, nIdx) => {
                          const isSelected = lessonId === l.id
                          const createdDateStr = (l.createdAt || l.created_at) ? new Date(l.createdAt || l.created_at).toLocaleDateString('vi-VN') : ''
                          const createdTime = (l.createdAt || l.created_at) ? new Date(l.createdAt || l.created_at).getTime() : NaN
                          const isNew = Number.isFinite(createdTime) && (Date.now() - createdTime) <= 7 * 24 * 3600 * 1000
                          const hwCount = (l.homeworks || []).length
                          const hasVideo = !!(l.videoUrl)
                          const fileCount = (l.theoryFiles || []).length
                          const upcoming = (l.homeworks || [])
                            .filter(h => h.deadline && !isNaN(new Date(h.deadline).getTime()))
                            .sort((a, b) => new Date(a.deadline) - new Date(b.deadline))[0]
                          const upcomingOverdue = upcoming ? (new Date() > new Date(upcoming.deadline)) : false
                          return `
                          <div class="lesson-item-btn mc-lesson-card${isSelected ? ' mc-lesson-selected' : ''}" data-id="${l.id}" role="button" tabindex="0" aria-label="Mở bài học: ${escapeHtml(l.title)}" style="display:flex; align-items:center; justify-content:space-between; gap:12px; padding:14px 16px; border-radius:12px; cursor:pointer; transition:all 0.15s ease;">
                            <div style="display:flex; align-items:center; gap:12px; flex:1; min-width:0;">
                              <span style="width:36px; height:36px; background:#0066cc; color:#ffffff; border-radius:10px; display:flex; align-items:center; justify-content:center; font-size:13px; font-weight:800; flex-shrink:0;">${nIdx + 1}</span>
                              <div style="min-width:0; flex:1;">
                                <div style="font-weight:700; font-size:14px; color:${isSelected ? '#0369a1' : '#0f172a'}; display:-webkit-box; -webkit-line-clamp:2; -webkit-box-orient:vertical; overflow:hidden;" title="${escapeHtml(l.title)}">
                                  ${escapeHtml(l.title)}
                                </div>
                                ${l.chapterTitle ? `
                                <div style="font-size:12px; color:#64748b; font-weight:500; margin-top:2px; white-space:nowrap; overflow:hidden; text-overflow:ellipsis;" title="${escapeHtml(l.chapterTitle)}">
                                  <i class="fa-solid fa-folder-open" style="color:#0066cc; font-size:11px;"></i> ${escapeHtml(l.chapterTitle)}
                                </div>
                                ` : ''}
                                <div style="display:flex; align-items:center; gap:6px; flex-wrap:wrap; margin-top:5px;">
                                  ${isNew ? `
                                    <span style="font-size:11px; font-weight:700; color:#15803d; background:#f0fdf4; padding:2px 8px; border-radius:6px; display:inline-flex; align-items:center; gap:4px; border:1px solid #bbf7d0;">
                                      Mới
                                    </span>
                                  ` : ''}
                                  ${createdDateStr ? `
                                    <span style="font-size:11px; color:#64748b; background:#ffffff; padding:2px 8px; border-radius:6px; display:inline-flex; align-items:center; gap:4px; border:1px solid #e2e8f0;">
                                      <i class="fa-regular fa-calendar" style="color:#94a3b8; font-size:11px;"></i> Ngày tạo: ${createdDateStr}
                                    </span>
                                  ` : ''}
                                  <span style="font-size:11px; font-weight:700; color:#475569; background:#f1f5f9; padding:2px 8px; border-radius:6px; display:inline-flex; align-items:center; gap:4px;">
                                    <i class="fa-solid fa-list-check" style="color:#0066cc; font-size:10px;"></i> ${hwCount} bài tập
                                  </span>
                                  ${hasVideo ? `
                                    <span style="font-size:11px; font-weight:700; color:#0369a1; background:#e0f2fe; padding:2px 8px; border-radius:6px; display:inline-flex; align-items:center; gap:4px;">
                                      <i class="fa-solid fa-circle-play" style="font-size:10px;"></i> Video
                                    </span>
                                  ` : ''}
                                  ${fileCount > 0 ? `
                                    <span style="font-size:11px; font-weight:700; color:#475569; background:#f1f5f9; padding:2px 8px; border-radius:6px; display:inline-flex; align-items:center; gap:4px;">
                                      <i class="fa-solid fa-paperclip" style="font-size:10px;"></i> ${fileCount} tài liệu
                                    </span>
                                  ` : ''}
                                  ${upcoming ? `
                                    <span style="font-size:11px; font-weight:700; color:${upcomingOverdue ? '#b91c1c' : '#b45309'}; background:${upcomingOverdue ? '#fef2f2' : '#fffbeb'}; padding:2px 8px; border-radius:6px; display:inline-flex; align-items:center; gap:4px; border:1px solid ${upcomingOverdue ? '#fecaca' : '#fde68a'};" title="Hạn gần nhất: ${escapeHtml(upcoming.title)}">
                                      <i class="fa-regular fa-clock" style="font-size:10px;"></i> ${upcomingOverdue ? 'Quá hạn' : 'Hạn'}: ${new Date(upcoming.deadline).toLocaleDateString('vi-VN')}
                                    </span>
                                  ` : ''}
                                </div>
                              </div>
                            </div>
                            <div style="color:${isSelected ? '#0066cc' : '#94a3b8'}; flex-shrink:0;">
                              <i class="fa-solid fa-chevron-right"></i>
                            </div>
                          </div>
                        `
                        }).join('')}
                      </div>
                    `)}
                  </div>
                ` : `
                  <div id="student-lesson-panel-chapters" role="tabpanel" aria-labelledby="student-lesson-tab-chapters" tabindex="0">
                ${(classChapters.length === 0) ? `
                  <div class="card" style="text-align:center; padding:32px; color:#64748b;">
                    <i class="fa-solid fa-folder-open" style="font-size:36px; color:#94a3b8; margin-bottom:12px;"></i>
                    <p style="font-weight:600;">Lớp học này chưa cập nhật danh sách bài học.</p>
                  </div>
                ` : (displayedChapters.length === 0 ? `
                  <div class="card" style="text-align:center; padding:32px; color:#64748b;">
                    <i class="fa-solid fa-folder-open" style="font-size:36px; color:#94a3b8; margin-bottom:12px;"></i>
                    <p style="font-weight:600;">Không có bài học nào trong chương đã chọn.</p>
                    <button type="button" class="btn-clear-chapter-filter btn-secondary" style="margin-top:12px; width:auto; cursor:pointer;">Xóa bộ lọc</button>
                  </div>
                ` : displayedChapters.map(ch => {
                  const isCollapsed = collapsedChapterIds.has(ch.id)
                  return `
                  <div class="card chapter-card-item mc-chapter-card" data-ch-id="${ch.id}" style="padding:0; margin-bottom:16px; overflow:hidden;">
                    <div style="display:flex; justify-content:space-between; align-items:center; gap:12px; flex-wrap:wrap; cursor:pointer; user-select:none; padding:16px 18px;" class="chapter-card-header mc-chapter-header" data-ch-id="${ch.id}">
                      <div style="display:flex; align-items:center; gap:12px; flex:1; min-width:0;">
                        <span style="width:40px; height:40px; background:#eff6ff; border-radius:10px; display:flex; align-items:center; justify-content:center; flex-shrink:0;">
                          <i class="fa-solid ${isCollapsed ? 'fa-folder' : 'fa-folder-open'}" style="color:#0066cc; font-size:17px;"></i>
                        </span>
                        <div style="min-width:0;">
                          <h3 style="font-size:16px; font-weight:700; color:#0f172a; margin:0; overflow-wrap:break-word;">${escapeHtml(ch.title)}</h3>
                          <div style="font-size:12px; color:#64748b; font-weight:500; margin-top:2px;">Chương ${ch.orderIndex || classChapters.findIndex(c => c.id === ch.id) + 1} • ${ch.lessons?.length || 0} bài học</div>
                        </div>
                      </div>
                      <div style="display:flex; align-items:center; gap:12px; flex-shrink:0;">
                        <button type="button" class="btn-toggle-chapter mc-toggle-btn" data-ch-id="${ch.id}" aria-expanded="${isCollapsed ? 'false' : 'true'}" aria-controls="chapter-lessons-${ch.id}" aria-label="${isCollapsed ? 'Mở rộng' : 'Thu gọn'} chương ${escapeHtml(ch.title)}" style="border-radius:8px; padding:6px 12px; cursor:pointer; display:inline-flex; align-items:center; gap:6px; font-size:12px; color:#475569; font-weight:600; transition:all 0.15s ease;">
                          <span class="btn-toggle-label">${isCollapsed ? 'Mở rộng' : 'Thu gọn'}</span>
                          <i class="fa-solid ${isCollapsed ? 'fa-chevron-down' : 'fa-chevron-up'} btn-toggle-icon" style="font-size:11px; color:#64748b;"></i>
                        </button>
                      </div>
                    </div>

                    <div class="chapter-lessons-body" id="chapter-lessons-${ch.id}" style="padding:16px 18px 18px; border-top:1px solid #f1f5f9; background:#fbfcfe; display:${isCollapsed ? 'none' : 'grid'}; grid-template-columns:repeat(auto-fit, minmax(min(100%, 320px), 1fr)); gap:12px;">
                      ${(ch.lessons || []).map((l, lIdx) => {
                        const isSelected = lessonId === l.id
                        const createdDateStr = (l.createdAt || l.created_at) ? new Date(l.createdAt || l.created_at).toLocaleDateString('vi-VN') : ''
                        const hwCount = (l.homeworks || []).length
                        const hasVideo = !!(l.videoUrl)
                        const fileCount = (l.theoryFiles || []).length
                        const upcoming = (l.homeworks || [])
                          .filter(h => h.deadline && !isNaN(new Date(h.deadline).getTime()))
                          .sort((a, b) => new Date(a.deadline) - new Date(b.deadline))[0]
                        const upcomingOverdue = upcoming ? (new Date() > new Date(upcoming.deadline)) : false
                        return `
                          <div class="lesson-item-btn mc-lesson-card${isSelected ? ' mc-lesson-selected' : ''}" data-id="${l.id}" role="button" tabindex="0" aria-label="Mở bài học: ${escapeHtml(l.title)}" style="display:flex; align-items:center; justify-content:space-between; gap:12px; padding:14px 16px; border-radius:12px; cursor:pointer; transition:all 0.15s ease;">
                            <div style="display:flex; align-items:center; gap:12px; flex:1; min-width:0;">
                              <span style="width:36px; height:36px; background:${isSelected ? '#0066cc' : '#eff6ff'}; color:${isSelected ? '#ffffff' : '#0066cc'}; border-radius:10px; display:flex; align-items:center; justify-content:center; font-size:13px; font-weight:800; flex-shrink:0;">${l.order_index || l.code || (lIdx + 1)}</span>
                              <div style="min-width:0; flex:1;">
                                <div style="font-weight:700; font-size:14px; color:${isSelected ? '#0369a1' : '#0f172a'}; display:-webkit-box; -webkit-line-clamp:2; -webkit-box-orient:vertical; overflow:hidden;" title="${escapeHtml(l.title)}">
                                  ${escapeHtml(l.title)}
                                </div>
                                <div style="display:flex; align-items:center; gap:6px; flex-wrap:wrap; margin-top:5px;">
                                  <span style="font-size:11px; font-weight:700; color:#475569; background:#f1f5f9; padding:2px 8px; border-radius:6px; display:inline-flex; align-items:center; gap:4px;">
                                    <i class="fa-solid fa-list-check" style="color:#0066cc; font-size:10px;"></i> ${hwCount} bài tập
                                  </span>
                                  ${hasVideo ? `
                                    <span style="font-size:11px; font-weight:700; color:#0369a1; background:#e0f2fe; padding:2px 8px; border-radius:6px; display:inline-flex; align-items:center; gap:4px;">
                                      <i class="fa-solid fa-circle-play" style="font-size:10px;"></i> Video
                                    </span>
                                  ` : ''}
                                  ${fileCount > 0 ? `
                                    <span style="font-size:11px; font-weight:700; color:#475569; background:#f1f5f9; padding:2px 8px; border-radius:6px; display:inline-flex; align-items:center; gap:4px;">
                                      <i class="fa-solid fa-paperclip" style="font-size:10px;"></i> ${fileCount} tài liệu
                                    </span>
                                  ` : ''}
                                  ${createdDateStr ? `
                                    <span style="font-size:11px; color:#64748b; background:#ffffff; padding:2px 8px; border-radius:6px; display:inline-flex; align-items:center; gap:4px; border:1px solid #e2e8f0;" title="Ngày tạo: ${createdDateStr}">
                                      <i class="fa-regular fa-calendar" style="color:#94a3b8; font-size:11px;"></i> ${createdDateStr}
                                    </span>
                                  ` : ''}
                                  ${upcoming ? `
                                    <span style="font-size:11px; font-weight:700; color:${upcomingOverdue ? '#b91c1c' : '#b45309'}; background:${upcomingOverdue ? '#fef2f2' : '#fffbeb'}; padding:2px 8px; border-radius:6px; display:inline-flex; align-items:center; gap:4px; border:1px solid ${upcomingOverdue ? '#fecaca' : '#fde68a'};" title="Hạn gần nhất: ${escapeHtml(upcoming.title)}">
                                      <i class="fa-regular fa-clock" style="font-size:10px;"></i> ${upcomingOverdue ? 'Quá hạn' : 'Hạn'}: ${new Date(upcoming.deadline).toLocaleDateString('vi-VN')}
                                    </span>
                                  ` : ''}
                                </div>
                              </div>
                            </div>
                            <div style="color:${isSelected ? '#0066cc' : '#94a3b8'}; flex-shrink:0;">
                              <i class="fa-solid fa-chevron-right"></i>
                            </div>
                          </div>
                        `
                      }).join('')}
                    </div>
                  </div>
                `}).join(''))}
                  </div>
                `}
              </div>
            `}
          </div>
        </div>
      </div>
    `
  }

  // Case 2: List of All Classes for Student
  return `
    <div class="app-layout navy-student student-class-list">
      ${renderSidebar(isDashboard ? 'student-dashboard' : 'my-classes')}
      <div class="main-content">
        ${renderNavbar(isDashboard ? 'Học tập / Dashboard' : 'Học tập / Lớp học của tôi')}
        <div class="content-body">
          ${!isDashboard ? `<div class="navy-hero">
            ${isMochiUI() && state.user?.role === 'STUDENT' ? renderMascot({ mood: 'happy', size: 96 }) : `<img src="${typeof mascotUrl !== 'undefined' ? mascotUrl : ''}" alt="Linh vật học tập">`}
            <div>
              <h1>Lớp học của tôi</h1>
              <p>Chọn lớp để xem bài học và tài liệu.</p>
            </div>
          </div>` : ''}
          ${isDashboard ? '<div id="student-tuition-notice" aria-live="polite"></div>' : ''}
          ${!isDashboard ? `<div class="page-header">
            <div>
              <h2 class="page-title">Danh sách lớp học</h2>
              <p class="page-description">Danh sách các lớp học đã đăng ký. Nhấn vào lớp để xem bài học và bài tập chi tiết.</p>
            </div>
          </div>` : ''}

          ${isDashboard ? `<!-- Latest homeworks: gọn ở đầu trang -->
          <div class="card" id="tour-latest-hw" style="padding:14px 18px; margin-bottom:20px; border:1px solid #bfdbfe; background:#f5faff;">
            <div class="student-latest-heading">
              <h2><i class="fa-solid fa-bolt" style="color:#d97706;"></i> Bài tập mới giao</h2>
              <button type="button" class="btn-secondary" id="btn-replay-tour">Hướng dẫn</button>
            </div>
            <div id="latest-homeworks-container">
              <p style="font-size:13px; color:#64748b; margin:0;">
                <i class="fa-solid fa-circle-notch fa-spin" style="color:#0066cc;"></i> Đang tải bài tập mới...
              </p>
            </div>
          </div>

          <!-- In-progress drafts: tiếp tục bài đang làm dở -->
          <div class="card" id="inprogress-drafts-card" style="padding:14px 18px; margin-bottom:20px; border:1px solid #fde68a; background:#fffbeb; display:none;">
            <h3 style="font-family:var(--font-heading); font-size:15px; font-weight:700; margin:0 0 10px 0; display:flex; align-items:center; gap:8px;">
              <i class="fa-solid fa-hourglass-half" style="color:#d97706;"></i> Đang làm dở
            </h3>
            <div id="inprogress-drafts-container"></div>
          </div>

          <section class="card" aria-label="Tiến độ bài tập của tôi" style="padding:18px;margin-bottom:20px;">
            <h2 style="font-size:17px;margin:0 0 12px;">Thống kê bài tập</h2>
            <div id="student-dashboard-stats" aria-live="polite">Đang tải tiến độ học tập...</div>
          </section>

          <section class="card" aria-label="Biểu đồ điểm số" style="padding:18px;margin-bottom:20px;">
            <h2 style="font-size:17px;margin:0 0 12px;">Điểm 10 bài nộp gần nhất</h2>
            <div id="student-dashboard-scores" aria-live="polite">Đang tải biểu đồ điểm số...</div>
          </section>

          ` : ''}
          ${!isDashboard ? `<!-- Classes Cards Grid -->
          <div class="grid-4" id="tour-class-grid" style="margin-bottom:28px;">
            ${classes.length === 0 ? '<p>Chưa có lớp học nào. Hãy liên hệ quản trị viên để được xếp lớp.</p>' : ''}
            ${classes.map(c => `
              <div class="class-card select-class-card" role="link" tabindex="0" aria-label="Mở lớp ${escapeHtml(c.name)}" data-id="${escapeHtml(c.id)}" style="cursor:pointer; padding: 20px;">
                <div class="class-card-body" style="padding: 0;">
                  <h3 class="class-title" style="margin-bottom: 12px;">${escapeHtml(c.name)}</h3>

                  <div class="class-footer">
                    <span><i class="fa-solid fa-users"></i> ${c.studentsCount} Học sinh</span>
                    <div class="enter-class-btn" style="color:#0066cc; font-weight:700;">
                      Xem bài học <i class="fa-solid fa-arrow-right"></i>
                    </div>
                  </div>
                </div>
              </div>
            `).join('')}
          </div>` : ''}

          ${isDashboard ? `<!-- Weak Topics Panel -->
          <div class="card" style="margin-bottom:20px; border:1px solid #fecaca; background:linear-gradient(180deg,#fffafa 0%,#ffffff 100%);">
            <h3 style="font-family:var(--font-heading); font-size:17px; font-weight:700; margin-bottom:4px;">
              <i class="fa-solid fa-triangle-exclamation" style="color:#ef4444;"></i> Điểm yếu cần luyện
            </h3>
            <p style="font-size:12px; color:#64748b; margin:0 0 12px 0;">Các chương bạn làm sai nhiều nhất — hãy ưu tiên ôn lại trước khi làm bài mới.</p>
            <div id="weak-topics-container">
              <p style="font-size:13px; color:#64748b; margin:0;">
                <i class="fa-solid fa-circle-notch fa-spin" style="color:#0066cc;"></i> Đang phân tích kết quả làm bài...
              </p>
            </div>
          </div>` : ''}
        </div>
      </div>
    </div>
  `
}

async function loadStudentDashboardStats() {
  const container = document.getElementById('student-dashboard-stats')
  if (!container) return
  const userId = state.user?.id
  try {
    const response = await api.getMyHomeworks('&status=all&page=1&pageSize=1')
    if (!container.isConnected || state.user?.id !== userId || state.user?.role !== 'STUDENT') return
    const progress = summarizeStudentProgress(response?.stats)
    const notice = document.getElementById('student-tuition-notice')
    if (notice) notice.innerHTML = studentBalanceIsZero(response.accountBalance) ? `
      <div role="status" class="student-tuition-alert"><i class="fa-solid fa-circle-exclamation"></i>
        <div><strong>Thông báo đóng học phí</strong><br>Bạn đã đến hạn đóng học phí. Vui lòng liên hệ giáo viên để đóng học phí.</div>
      </div>` : ''
    container.innerHTML = `<div class="student-assignment-chart" role="group" aria-label="Đã hoàn thành ${progress.done} trên ${progress.total} bài; còn ${progress.todo} bài chưa hoàn thành">
      <div class="student-assignment-ring" style="--completion:${progress.completion ?? 0}%" aria-hidden="true">
        <div><strong>${progress.completion === null ? '—' : `${progress.completion}%`}</strong><span>hoàn thành</span></div>
      </div>
      <div class="student-assignment-details">
        <div class="student-assignment-summary">
          <div><strong>${progress.total}</strong><span>Bài được giao</span></div>
          <div><strong>${progress.done}</strong><span>Đã hoàn thành</span></div>
          <div><strong>${progress.todo}</strong><span>Chưa hoàn thành</span></div>
        </div>
        ${progress.total === 0 ? '<p>Chưa có bài tập được giao.</p>' : `<div class="student-assignment-breakdown">
          <div class="student-assignment-breakdown-title"><strong>Tiến độ hoàn thành</strong><span>${progress.done}/${progress.total} bài</span></div>
          <div class="student-assignment-progress" role="img" aria-label="Đã hoàn thành ${progress.done} bài; chưa hoàn thành ${progress.todo} bài">
            <span style="width:${progress.done / progress.total * 100}%"></span>
          </div>
          <div class="student-assignment-legend"><span>Đã hoàn thành: ${progress.done}</span><span>Chưa hoàn thành: ${progress.todo}</span></div>
        </div>`}
      </div>
    </div>`
  } catch (err) {
    if (!container.isConnected || state.user?.id !== userId) return
    container.innerHTML = `<p>Không tải được tiến độ học tập. <button type="button" class="btn-secondary" id="student-dashboard-retry" style="width:auto;">Thử lại</button></p>`
    container.querySelector('#student-dashboard-retry')?.addEventListener('click', () => {
      container.textContent = 'Đang tải tiến độ học tập...'
      loadStudentDashboardStats()
    })
  }
}

async function loadStudentDashboardScores() {
  const container = document.getElementById('student-dashboard-scores')
  if (!container) return
  const userId = state.user?.id
  try {
    const result = await api.getStudentHistory({ page: 1, pageSize: 10 })
    if (!container.isConnected || state.user?.id !== userId || state.user?.role !== 'STUDENT') return
    if (!Array.isArray(result?.history)) throw new Error('Dữ liệu lịch sử không hợp lệ')
    const scores = recentScores(result.history)
    if (!scores.length) {
      container.textContent = 'Chưa có bài nộp để vẽ biểu đồ điểm.'
      return
    }
    container.innerHTML = `<p style="font-size:12px;margin:0 0 12px;">${scores.length} lượt nộp gần nhất · điểm quy đổi về thang 10</p>
      <div class="student-score-chart" role="list" aria-label="Điểm các bài nộp gần nhất">
        ${scores.map(item => `<div class="student-score-column" role="listitem" aria-label="${escapeHtml(`${item.title}: ${item.score === null ? 'Chưa có điểm' : `${item.score} trên 10`}`)}">
          <strong>${item.score === null ? '—' : item.score}</strong><div class="student-score-track">${item.score === null ? '' : `<div class="student-score-bar" style="height:${Math.max(0, Math.min(100, item.score * 10))}%"></div>`}</div>
          <span class="student-score-title">${escapeHtml(item.title)}</span>
          <span class="student-score-date">${item.date && !isNaN(Date.parse(item.date)) ? new Date(item.date).toLocaleDateString('vi-VN', { day: '2-digit', month: '2-digit', year: 'numeric' }) : '—'}</span>
        </div>`).join('')}
      </div>`
  } catch (err) {
    if (!container.isConnected || state.user?.id !== userId) return
    container.innerHTML = '<p>Không tải được biểu đồ điểm số. <button type="button" class="btn-secondary" id="student-scores-retry" style="width:auto;">Thử lại</button></p>'
    container.querySelector('#student-scores-retry')?.addEventListener('click', () => {
      container.textContent = 'Đang tải biểu đồ điểm số...'
      loadStudentDashboardScores()
    })
  }
}

export function bindMyClassesEvents() {
  bindSidebarEvents()

  const hashUrl = window.location.hash.replace('#', '')
  const [_, queryString] = hashUrl.split('?')
  const params = new URLSearchParams(queryString || '')
  const classId = params.get('classId')
  const lessonId = params.get('lessonId')

  const isDashboard = !hashUrl || hashUrl.split('?')[0] === 'student-dashboard'
  if (isMochiUI() && state.user?.role === 'STUDENT' && (isDashboard || classId)) {
    if (isDashboard) {
      bindMochiStudentHome({
        loadStats: loadStudentDashboardStats,
        loadScores: loadStudentDashboardScores,
        loadHomeworks: loadLatestHomeworksAll,
        loadWeakTopics,
        loadDrafts: loadInprogressDrafts,
        startTour: maybeStartDashboardTour
      })
      return
    }

    bindMochiLessonTracking(classId, lessonId)
    if (lessonId) {
      bindMochiLessonDetail()
      bindLessonResourceEvents()
      maybeStartLessonTour()
    } else {
      bindMochiLessonMap({
        classId,
        rerender: () => {
          const app = document.getElementById('app')
          if (!app) return
          app.innerHTML = renderMyClassesView()
          bindMyClassesEvents()
        }
      })
    }
    return
  }

  // Load todo homeworks for student notifications
  if (!classId && (!hashUrl || hashUrl.split('?')[0] === 'student-dashboard') && state.user?.role === 'STUDENT') {
    loadStudentDashboardStats()
    loadStudentDashboardScores()
    loadLatestHomeworksAll()
    loadWeakTopics()
    loadInprogressDrafts()
    maybeStartDashboardTour()
  }

  // Theo dõi thời gian xem bài học của học sinh
  if (!videoTrackInstalled) {
    videoTrackInstalled = true
    window.addEventListener('hashchange', flushVideoTrack)
    // Đóng tab/tải lại trang: vẫn kịp gửi log nhờ keepalive
    window.addEventListener('pagehide', flushVideoTrack)
  }
  flushVideoTrack()
  if (classId && lessonId && state.user?.role === 'STUDENT') {
    // Tra cứu tên bài/lớp để log audit đọc được ngay, không còn UUID thô
    let lessonTitle = ''
    let className = ''
    for (const ch of (state.classChapters || [])) {
      const found = (ch.lessons || []).find(l => l.id === lessonId)
      if (found) {
        lessonTitle = found.title || ''
        const cls = (state.classes || []).find(c => c.id === classId)
        className = cls?.name || ''
        break
      }
    }
    videoTrackStart = Date.now()
    videoTrackMeta = { lessonId, classId, lessonTitle, className }
    try {
      api.logActivity({ action: 'LESSON_VIEW', metadata: { lessonId, classId, lessonTitle, className } })
    } catch (_) {}
  }

  // Toggle collapse/expand chapter lessons
  document.querySelectorAll('.chapter-card-header').forEach(header => {
    header.addEventListener('click', () => {
      const chId = header.getAttribute('data-ch-id')
      if (!chId) return
      const body = document.getElementById(`chapter-lessons-${chId}`)
      const label = header.querySelector('.btn-toggle-label')
      const icon = header.querySelector('.btn-toggle-icon')
      const folderIcon = header.querySelector('.fa-folder, .fa-folder-open')
      const toggleBtn = header.querySelector('.btn-toggle-chapter')
      if (!body) return

      const isHidden = body.style.display === 'none'
      if (isHidden) {
        body.style.display = 'grid'
        collapsedChapterIds.delete(chId)
        if (label) label.textContent = 'Thu gọn'
        if (toggleBtn) toggleBtn.setAttribute('aria-expanded', 'true')
        if (icon) {
          icon.classList.remove('fa-chevron-down')
          icon.classList.add('fa-chevron-up')
        }
        if (folderIcon) {
          folderIcon.classList.remove('fa-folder')
          folderIcon.classList.add('fa-folder-open')
        }
      } else {
        body.style.display = 'none'
        collapsedChapterIds.add(chId)
        if (label) label.textContent = 'Mở rộng'
        if (toggleBtn) toggleBtn.setAttribute('aria-expanded', 'false')
        if (icon) {
          icon.classList.remove('fa-chevron-up')
          icon.classList.add('fa-chevron-down')
        }
        if (folderIcon) {
          folderIcon.classList.remove('fa-folder-open')
          folderIcon.classList.add('fa-folder')
        }
      }
    })
  })

  // Click on Class Card -> Route to My Classes with classId
  document.querySelectorAll('.select-class-card').forEach(card => {
    card.addEventListener('click', () => {
      const id = card.getAttribute('data-id')
      window.location.hash = `#my-classes?classId=${id}`
    })
    card.addEventListener('keydown', event => {
      if (event.key === 'Enter' || event.key === ' ') {
        event.preventDefault()
        card.click()
      }
    })
  })

  // Click on Lesson -> Route to My Classes with classId and lessonId
  document.querySelectorAll('.lesson-item-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      const lessonId = btn.getAttribute('data-id')
      window.location.hash = `#my-classes?classId=${classId}&lessonId=${lessonId}`
    })
    // Keyboard: Enter/Space on a lesson card navigates exactly like a click
    btn.addEventListener('keydown', (e) => {
      if (e.key !== 'Enter' && e.key !== ' ') return
      e.preventDefault()
      const lessonId = btn.getAttribute('data-id')
      window.location.hash = `#my-classes?classId=${classId}&lessonId=${lessonId}`
    })
  })

  // Back button: Class Details -> Class List
  document.getElementById('back-to-classes-btn')?.addEventListener('click', () => {
    window.location.hash = '#my-classes'
  })

  // Back button: Lesson Study -> Chapters/Lessons List
  document.getElementById('btn-back-to-lessons')?.addEventListener('click', () => {
    window.location.hash = `#my-classes?classId=${classId}`
  })

  // Chapter Filter for Student
  const studentChapterFilter = document.getElementById('student-chapter-filter')
  studentChapterFilter?.addEventListener('change', (e) => {
    studentSelectedChapterId = e.target.value
    const app = document.getElementById('app')
    if (app) {
      app.innerHTML = renderMyClassesView()
      bindMyClassesEvents()
    }
  })

  // Segmented tabs: Theo chương / Bài mới cập nhật (giữ nguyên bộ lọc chương khi đổi tab)
  document.querySelectorAll('[data-lesson-tab]').forEach(tabBtn => {
    tabBtn.addEventListener('click', () => {
      const nextTab = tabBtn.getAttribute('data-lesson-tab')
      if (!nextTab || nextTab === studentLessonViewTab) return
      studentLessonViewTab = nextTab
      const app = document.getElementById('app')
      if (app) {
        app.innerHTML = renderMyClassesView()
        bindMyClassesEvents()
        document.getElementById(nextTab === 'newest' ? 'student-lesson-tab-newest' : 'student-lesson-tab-chapters')?.focus()
      }
    })
  })

  // Empty-state: xóa bộ lọc chương (cả hai tab)
  document.querySelectorAll('.btn-clear-chapter-filter').forEach(btn => {
    btn.addEventListener('click', () => {
      studentSelectedChapterId = 'all'
      const app = document.getElementById('app')
      if (app) {
        app.innerHTML = renderMyClassesView()
        bindMyClassesEvents()
      }
    })
  })

  // Search Input for Student in Class Curriculum
  const studentSearchInput = document.getElementById('student-curriculum-search-input')
  const studentClearBtn = document.getElementById('student-curriculum-search-clear')
  const studentResultsPanel = document.getElementById('student-curriculum-search-results-panel')

  if (studentSearchInput && studentResultsPanel) {
    let highlightedIndex = -1
    let currentSearchResults = []

    const getAllClassLessons = () => {
      const list = []
      const chapters = state.classChapters || []
      for (const ch of chapters) {
        for (const l of (ch.lessons || [])) {
          const publishedHws = (l.homeworks || []).filter(h => h.is_published !== false)
          list.push({
            id: l.id,
            chapterId: ch.id,
            chapterTitle: ch.title,
            chapterOrderIndex: Number(ch.orderIndex || ch.order_index || 0),
            code: String(l.order_index || l.code || ''),
            title: l.title || '',
            content: l.content || '',
            hasVideo: Boolean(l.videoUrl || l.video_url),
            theoryFilesCount: Array.isArray(l.theoryFiles) ? l.theoryFiles.length : 0,
            homeworksCount: publishedHws.length
          })
        }
      }
      return list
    }

    const renderStudentSearchResultsHTML = (results, query) => {
      if (!results || results.length === 0) {
        return `
          <div style="padding:24px; text-align:center; color:#64748b;">
            <i class="fa-solid fa-magnifying-glass" style="font-size:24px; color:#cbd5e1; margin-bottom:8px; display:block;"></i>
            Không tìm thấy bài học nào phù hợp với từ khóa "<strong>${escapeHtml(query)}</strong>"
          </div>
        `
      }

      const grouped = groupLessonsByChapter(results)
      let globalIdx = 0

      return grouped.map(g => `
        <div class="curriculum-search-group">
          <div class="curriculum-search-chapter-header">
            <span><i class="fa-solid fa-folder-open" style="color:#0066cc; margin-right:6px;"></i> ${escapeHtml(g.chapterTitle)}</span>
            <span style="font-size:11px; font-weight:600; color:#64748b;">${g.lessons.length} bài phù hợp</span>
          </div>
          <div class="curriculum-search-items">
            ${g.lessons.map(l => {
              const thisIdx = globalIdx++
              const highlightedTitle = highlightMatch(l.title, query)
              const highlightedContent = l.content ? highlightMatch(l.content, query) : ''
              return `
                <div class="curriculum-search-result-item" data-index="${thisIdx}" data-chapter-id="${l.chapterId}" data-lesson-id="${l.id}">
                  <div style="display:flex; align-items:center; gap:10px; flex-1; min-width:0;">
                    <span style="width:28px; height:28px; border-radius:8px; background:#eff6ff; color:#0066cc; font-size:12px; font-weight:800; display:inline-flex; align-items:center; justify-content:center; flex-shrink:0;">
                      ${escapeHtml(l.code || '')}
                    </span>
                    <div style="flex:1; min-width:0;">
                      <div style="font-size:13.5px; font-weight:700; color:#0f172a; white-space:nowrap; overflow:hidden; text-overflow:ellipsis;">
                        ${highlightedTitle}
                      </div>
                      ${highlightedContent ? `
                        <div style="font-size:12px; color:#64748b; white-space:nowrap; overflow:hidden; text-overflow:ellipsis; margin-top:2px;">
                          ${highlightedContent}
                        </div>
                      ` : ''}
                    </div>
                  </div>
                  <div style="display:flex; align-items:center; gap:6px; flex-shrink:0;">
                    ${l.hasVideo ? `<span style="font-size:11px; color:#0284c7;" title="Có video bài giảng"><i class="fa-solid fa-circle-play"></i></span>` : ''}
                    <span style="font-size:11px; color:#64748b; background:#f1f5f9; padding:2px 6px; border-radius:4px;">
                      <i class="fa-solid fa-list-check" style="font-size:10px;"></i> ${l.homeworksCount || 0} bài tập
                    </span>
                    <i class="fa-solid fa-arrow-right" style="color:#94a3b8; font-size:11px; margin-left:4px;"></i>
                  </div>
                </div>
              `
            }).join('')}
          </div>
        </div>
      `).join('')
    }

    const studentSearchCtrl = createSearchController({
      debounceMs: 200,
      onSearch: async (query, { isCurrent, signal }) => {
        const q = query.trim()
        if (!q) {
          if (studentResultsPanel) studentResultsPanel.style.display = 'none'
          if (studentClearBtn) studentClearBtn.style.display = 'none'
          return
        }

        if (studentClearBtn) studentClearBtn.style.display = 'inline-flex'
        if (studentResultsPanel) {
          studentResultsPanel.style.display = 'block'
          studentResultsPanel.innerHTML = `
            <div style="padding:20px; text-align:center; color:#64748b;">
              <i class="fa-solid fa-circle-notch fa-spin" style="color:#0066cc; margin-bottom:8px; font-size:18px; display:block;"></i>
              <span style="font-size:12.5px;">Đang tìm kiếm bài học...</span>
            </div>
          `
        }

        try {
          const res = await api.searchClassLessons(classId, q, {
            chapterId: studentSelectedChapterId !== 'all' ? studentSelectedChapterId : undefined,
            signal
          })
          if (!isCurrent()) return

          const matched = Array.isArray(res) ? res : (res?.items || res?.results || [])
          currentSearchResults = matched
          highlightedIndex = -1

          if (studentResultsPanel) {
            studentResultsPanel.style.display = 'block'
            studentResultsPanel.innerHTML = renderStudentSearchResultsHTML(matched, q)

            studentResultsPanel.querySelectorAll('.curriculum-search-result-item').forEach(item => {
              item.addEventListener('click', () => {
                const chId = item.getAttribute('data-chapter-id')
                const lId = item.getAttribute('data-lesson-id')
                if (chId) collapsedChapterIds.delete(chId)
                if (lId) {
                  window.location.hash = `#my-classes?classId=${classId}&lessonId=${lId}`
                }
              })
            })
          }
        } catch (err) {
          if (err?.name === 'AbortError') return
          if (!isCurrent()) return
          if (studentResultsPanel) {
            studentResultsPanel.style.display = 'block'
            studentResultsPanel.innerHTML = `
              <div style="padding:16px; text-align:center; color:#ef4444; font-size:13px;">
                <i class="fa-solid fa-triangle-exclamation" style="margin-bottom:6px; display:block;"></i>
                Không thể tải kết quả tìm kiếm: ${escapeHtml(err.message)}
              </div>
            `
          }
        }
      }
    })

    studentSearchInput.addEventListener('input', (e) => {
      studentSearchCtrl.search(e.target.value)
    })

    studentClearBtn?.addEventListener('click', () => {
      studentSearchInput.value = ''
      studentSearchCtrl.abort()
      studentResultsPanel.style.display = 'none'
      studentClearBtn.style.display = 'none'
    })

    studentSearchInput.addEventListener('keydown', (e) => {
      if (e.key === 'Escape') {
        studentSearchInput.value = ''
        studentSearchCtrl.abort()
        studentResultsPanel.style.display = 'none'
        if (studentClearBtn) studentClearBtn.style.display = 'none'
        studentSearchInput.blur()
        return
      }

      const items = studentResultsPanel.querySelectorAll('.curriculum-search-result-item') || []
      if (items.length === 0 || studentResultsPanel.style.display === 'none') return

      if (e.key === 'ArrowDown') {
        e.preventDefault()
        highlightedIndex = (highlightedIndex + 1) % items.length
        items.forEach((item, idx) => {
          if (idx === highlightedIndex) {
            item.classList.add('highlighted')
            item.scrollIntoView({ block: 'nearest' })
          } else {
            item.classList.remove('highlighted')
          }
        })
      } else if (e.key === 'ArrowUp') {
        e.preventDefault()
        highlightedIndex = (highlightedIndex - 1 + items.length) % items.length
        items.forEach((item, idx) => {
          if (idx === highlightedIndex) {
            item.classList.add('highlighted')
            item.scrollIntoView({ block: 'nearest' })
          } else {
            item.classList.remove('highlighted')
          }
        })
      } else if (e.key === 'Enter') {
        e.preventDefault()
        if (highlightedIndex >= 0 && highlightedIndex < items.length) {
          items[highlightedIndex].click()
        } else if (items.length > 0) {
          items[0].click()
        }
      }
    })

    document.addEventListener('click', (e) => {
      if (!e.target.closest('.curriculum-search-container')) {
        if (studentResultsPanel) studentResultsPanel.style.display = 'none'
      }
    })
  }

  // Tour chi tiết bài học (chạy 1 lần đầu cho học sinh)
  if (classId && lessonId && state.user?.role === 'STUDENT') {
    maybeStartLessonTour()
  }

  // Preview theory PDF
  document.querySelectorAll('.btn-preview-theory').forEach(btn => {
    btn.onclick = () => {
      const file = btn.getAttribute('data-file')
      const rawName = file.startsWith('http') ? (file.split('/').pop() || file) : file
      const displayName = rawName.split('_').slice(1).join('_') || rawName
      const fileUrl = file.startsWith('http') ? file : `${SUPABASE_URL}/storage/v1/object/public/pdf-files/${file}`
      const mappedUrl = file.startsWith('http') ? file : fileUrl.replace(/https?:\/\/kong:8000/g, import.meta.env.VITE_SUPABASE_URL || 'http://localhost:54321')
      openModal(
        displayName,
        `<div id="modal-pdf-container" style="width:100%; height:65vh; overflow-y:auto; -webkit-overflow-scrolling:touch; border-radius:8px;"></div>
         <div style="margin-top:12px; display:flex; justify-content:flex-end;">
           <a href="${mappedUrl}" target="_blank" rel="noopener noreferrer" class="btn-secondary" style="font-size:12px; padding:6px 12px; display:inline-flex; align-items:center; gap:6px; text-decoration:none; background:#eff6ff; color:#0066cc; border:1px solid #bfdbfe; border-radius:8px;">
             <i class="fa-solid fa-up-right-from-square"></i> Mở file PDF trong tab mới
           </a>
         </div>`
      )
      const modalPdfContainer = document.getElementById('modal-pdf-container')
      if (modalPdfContainer) {
        renderPdfViewer(modalPdfContainer, mappedUrl)
      }
      const modalContent = document.querySelector('#modal-container .modal-content')
      if (modalContent) {
        modalContent.style.maxWidth = '900px'
      }
    }
  })

  // Download theory confirmation popup
  document.querySelectorAll('.btn-download-theory').forEach(btn => {
    btn.onclick = () => {
      const file = btn.getAttribute('data-file')
      const rawName = file.startsWith('http') ? (file.split('/').pop() || file) : file
      const displayName = rawName.split('_').slice(1).join('_') || rawName
      openModal(
        'Xác nhận tải tài liệu',
        `<p style="font-size:15px; color:#475569; line-height:1.6; margin:0;">
          Bạn có chắc chắn muốn tải xuống tài liệu lý thuyết <strong>"${displayName}"</strong> không?
         </p>`,
        () => {
          const fileUrl = file.startsWith('http') ? file : `${SUPABASE_URL}/storage/v1/object/public/pdf-files/${file}`
          window.open(file.startsWith('http') ? file : fileUrl.replace(/https?:\/\/kong:8000/g, import.meta.env.VITE_SUPABASE_URL || 'http://localhost:54321'), '_blank')
          return true
        }
      )
    }
  })
}

function bindMochiLessonTracking(classId, lessonId) {
  if (!videoTrackInstalled) {
    videoTrackInstalled = true
    window.addEventListener('hashchange', flushVideoTrack)
    window.addEventListener('pagehide', flushVideoTrack)
  }
  flushVideoTrack()
  if (!classId || !lessonId) return

  let lessonTitle = ''
  let className = ''
  for (const chapter of (state.classChapters || [])) {
    const found = (chapter.lessons || []).find(lesson => lesson.id === lessonId)
    if (!found) continue
    lessonTitle = found.title || ''
    className = (state.classes || []).find(item => item.id === classId)?.name || ''
    break
  }
  videoTrackStart = Date.now()
  videoTrackMeta = { lessonId, classId, lessonTitle, className }
  try {
    api.logActivity({ action: 'LESSON_VIEW', metadata: { lessonId, classId, lessonTitle, className } })
  } catch (_) {}
}

export function bindLessonResourceEvents() {
  document.querySelectorAll('.btn-preview-theory').forEach(btn => {
    btn.onclick = () => {
      const file = btn.getAttribute('data-file')
      if (!file) return
      const rawName = file.startsWith('http') ? (file.split('/').pop() || file) : file
      const displayName = rawName.split('_').slice(1).join('_') || rawName
      const fileUrl = file.startsWith('http') ? file : `${SUPABASE_URL}/storage/v1/object/public/pdf-files/${file}`
      const mappedUrl = file.startsWith('http') ? file : fileUrl.replace(/https?:\/\/kong:8000/g, import.meta.env.VITE_SUPABASE_URL || 'http://localhost:54321')
      openModal(
        displayName,
        `<div id="modal-pdf-container" style="width:100%; height:65vh; overflow-y:auto; -webkit-overflow-scrolling:touch; border-radius:8px;"></div>
         <div style="margin-top:12px; display:flex; justify-content:flex-end;">
           <a href="${mappedUrl}" target="_blank" rel="noopener noreferrer" class="btn-secondary" style="font-size:12px; padding:6px 12px; display:inline-flex; align-items:center; gap:6px; text-decoration:none; background:#eff6ff; color:#0066cc; border:1px solid #bfdbfe; border-radius:8px;">
             <i class="fa-solid fa-up-right-from-square"></i> Mở file PDF trong tab mới
           </a>
         </div>`
      )
      const modalPdfContainer = document.getElementById('modal-pdf-container')
      if (modalPdfContainer) renderPdfViewer(modalPdfContainer, mappedUrl)
      const modalContent = document.querySelector('#modal-container .modal-content')
      if (modalContent) modalContent.style.maxWidth = '900px'
    }
  })

  document.querySelectorAll('.btn-download-theory').forEach(btn => {
    btn.onclick = () => {
      const file = btn.getAttribute('data-file')
      if (!file) return
      const rawName = file.startsWith('http') ? (file.split('/').pop() || file) : file
      const displayName = rawName.split('_').slice(1).join('_') || rawName
      openModal(
        'Xác nhận tải tài liệu',
        `<p style="font-size:15px; color:#475569; line-height:1.6; margin:0;">Bạn có chắc chắn muốn tải xuống tài liệu lý thuyết <strong>"${displayName}"</strong> không?</p>`,
        () => {
          const fileUrl = file.startsWith('http') ? file : `${SUPABASE_URL}/storage/v1/object/public/pdf-files/${file}`
          window.open(file.startsWith('http') ? file : fileUrl.replace(/https?:\/\/kong:8000/g, import.meta.env.VITE_SUPABASE_URL || 'http://localhost:54321'), '_blank')
          return true
        }
      )
    }
  })
}

export async function loadInprogressDrafts() {
  const card = document.getElementById('inprogress-drafts-card')
  const container = document.getElementById('inprogress-drafts-container')
  if (!card || !container) return

  try {
    const drafts = await api.getMyDrafts()
    if (!drafts || drafts.length === 0) {
      card.style.display = 'none'
      return
    }
    card.style.display = 'block'
    container.innerHTML = `
      <div class="mc-drafts-grid" style="display:grid; grid-template-columns:repeat(auto-fill, minmax(min(100%, 300px), 1fr)); gap:8px;">
        ${drafts.map(d => `
          <div class="mc-draft-row" style="display:flex; align-items:center; gap:10px; padding:10px 12px; background:#ffffff; border:1px solid #fde68a; border-radius:10px;">
            <div class="mc-homework-info" style="flex:1 1 auto; min-width:0;">
              <div class="mc-homework-title" style="font-size:13px; font-weight:700; color:#0f172a; white-space:nowrap; overflow:hidden; text-overflow:ellipsis;" title="${d.title || ''}">${d.title || 'Bài tập'}</div>
              <div class="mc-homework-meta" style="font-size:11px; color:#64748b; margin-top:2px;">
                ${d.className ? `<span style="color:#0066cc; font-weight:600;">${d.className}</span> • ` : ''}Đã làm ${d.answeredCount || 0} câu • ${d.updatedAt ? new Date(d.updatedAt).toLocaleString('vi-VN') : ''}
              </div>
            </div>
            <div class="mc-draft-actions">
              <button class="btn-primary" onclick="window.location.hash='#homework-attempt?homeworkId=${d.homeworkId}'" style="width:auto; flex-shrink:0; padding:6px 14px; font-size:12px; font-weight:700; border-radius:8px; cursor:pointer; background:#d97706; border-color:#d97706;">
                Tiếp tục
              </button>
              <button class="btn-secondary btn-discard-draft" data-id="${d.homeworkId}" title="Xóa bản nháp" aria-label="Xóa bản nháp" style="flex-shrink:0; padding:6px 9px; font-size:12px; border-radius:8px; cursor:pointer; color:#ef4444; border-color:#fecaca; background:#fff5f5;">
                <i class="fa-solid fa-trash"></i>
              </button>
            </div>
          </div>
        `).join('')}
      </div>
    `
    container.querySelectorAll('.btn-discard-draft').forEach(btn => {
      btn.addEventListener('click', async () => {
        if (!(await mochiConfirm({
          title: 'Xóa bản nháp?',
          message: 'Xóa bản nháp này? Bài làm dở sẽ mất.',
          confirmLabel: 'Xóa bản nháp',
          cancelLabel: 'Hủy',
          tone: 'danger'
        }))) return
        const hwId = btn.getAttribute('data-id')
        try {
          await api.deleteDraft(hwId)
          try {
            localStorage.removeItem(`homework_draft_${state.user?.id || 'guest'}_${hwId}`)
          } catch (_) {}
          showToast('Đã xóa bản nháp.', 'success')
          loadInprogressDrafts()
        } catch (err) {
          showToast(`Xóa nháp thất bại: ${err.message}`, 'error')
        }
      })
    })
  } catch (err) {
    console.warn('Failed to load drafts:', err)
    card.style.display = 'none'
  }
}

function lessonTourSteps() {
  return [
    { selector: '#tour-lesson-left', title: 'Video & nội dung bài học', text: 'Xem video bài giảng và đọc mô tả bài học ở cột trái. Học kỹ phần này trước khi làm bài tập nhé!' },
    { selector: '#tour-lesson-files', title: 'Tài liệu đính kèm', text: 'Tài liệu lý thuyết PDF của bài: bấm "Xem" để đọc ngay tại chỗ, "Tải xuống" để lưu về máy.' },
    { selector: '#tour-lesson-homeworks', title: 'Bài tập của bài học', text: 'Danh sách bài tập/bài thi của bài này: bấm "Làm bài" để bắt đầu (có tính giờ), "Tải PDF" để xem đề giấy. Bài thi thì vào phòng thi có giám sát.' },
  ]
}

async function maybeStartLessonTour() {
  const { startTour } = await import('../utils/tour.js')
  document.getElementById('btn-replay-lesson-tour')?.addEventListener('click', () => startTour(lessonTourSteps()))
}

function dashboardTourSteps() {
  return [
    { selector: '[data-tour-nav="classes"]', title: 'Lớp học của tôi', text: 'Mọi lớp bạn đã đăng ký nằm ở đây. Bấm vào từng lớp để xem bài học, video và tài liệu.' },
    { selector: '#tour-latest-hw', title: 'Bài tập mới giao', text: 'Bài tập chưa làm mới nhất hiện ở đây. Bấm "Làm bài" (hoặc "Vào thi" với bài thi) để bắt đầu ngay.' },
    { selector: '#student-dashboard-stats', title: 'Tiến độ bài tập', text: 'Biểu đồ cho biết tỉ lệ bài đã hoàn thành và số bài còn cần làm.' },
    { selector: '#student-dashboard-scores', title: 'Xu hướng điểm số', text: 'Các cột điểm theo lượt nộp gần đây, quy đổi về thang 10.' },
    { selector: '[data-tour-nav="homeworks"]', title: 'Bài tập của tôi', text: 'Toàn bộ bài được giao: chưa làm thì làm bài, đã làm thì xem điểm và làm lại. Đừng quên mục này nhé!' },
  ]
}

async function maybeStartDashboardTour() {
  // Chụp hash + guard NGAY khi bind view để async import xong không hẹn tour
  // cho một view đã bị thay thế (stale async).
  const boundHash = window.location.hash
  const guard = document.getElementById('tour-latest-hw')
  const { startTour, scheduleAutoIntroTour } = await import('../utils/tour.js')

  // Hướng dẫn thủ công luôn hoạt động, kể cả sau auto và khi danh sách rỗng.
  document.getElementById('btn-replay-tour')?.addEventListener('click', () => startTour(dashboardTourSteps()))

  // Chỉ dashboard tự mở tour, và chỉ khi login server trả autoIntro = true
  // (lần đăng nhập đầu tiên). My-homeworks / lesson tours không auto.
  scheduleAutoIntroTour(dashboardTourSteps(), {
    user: state.user,
    key: 'student-dashboard',
    hash: boundHash,
    guard,
    delay: 800
  })
}

export async function loadLatestHomeworksAll() {
  const container = document.getElementById('latest-homeworks-container')
  if (!container) return
  const userId = state.user?.id

  try {
    // Chỉ lấy bài CHƯA làm (server đã loại bài đã nộp)
    const res = await api.getTodoHomeworks()
    if (!container.isConnected || state.user?.id !== userId) return
    const list = Array.isArray(res) ? res : (res?.items || [])
    const continueButton = document.getElementById('m-home-continue')
    if (continueButton && list.length > 0) {
      const deadlineRank = item => {
        const time = Date.parse(item?.deadline)
        return Number.isFinite(time) ? Math.abs(time - Date.now()) : Number.POSITIVE_INFINITY
      }
      const nearest = [...list].sort((a, b) => deadlineRank(a) - deadlineRank(b))[0]
      continueButton.dataset.homeworkId = nearest.id
      continueButton.dataset.homeworkType = nearest.type === 'EXAM' ? 'EXAM' : (nearest.type || 'PRACTICE')
    }
    const sorted = list
      .sort((a, b) => new Date(b.createdAt || 0) - new Date(a.createdAt || 0))
      .slice(0, 5)
    if (sorted.length === 0) {
      container.innerHTML = `<p style="font-size:13px; color:#64748b; margin:0;">Bạn chưa có bài tập mới.</p>`
      return
    }
    container.innerHTML = `
      <div class="mc-latest-grid" style="display:grid; grid-template-columns:repeat(auto-fill, minmax(min(100%, 420px), 1fr)); gap:4px 24px;">
        ${sorted.map((hw, idx) => {
          const isExam = hw.type === 'EXAM'
          const isOverdue = hw.deadline ? new Date() > new Date(hw.deadline) : false
          const hwTitle = hw.title || hw.lessonTitle || 'Bài tập'
          return `
          <div class="mc-latest-row" style="display:flex; align-items:center; gap:10px; padding:8px 4px; ${idx > 0 ? 'border-top:1px solid #e2e8f0;' : ''}">
            ${idx === 0 ? '<span style="font-size:10px; font-weight:800; color:#ffffff; background:#ef4444; padding:2px 7px; border-radius:6px; flex-shrink:0;">MỚI</span>' : ''}
            <div class="mc-homework-info" style="flex:1 1 auto; min-width:0;">
              <span class="mc-homework-title" style="font-size:13px; font-weight:700; color:#0f172a; white-space:nowrap; overflow:hidden; text-overflow:ellipsis; display:block;" title="${escapeHtml(hwTitle)}">${escapeHtml(hwTitle)}</span>
              <span class="mc-homework-meta" style="font-size:11px; color:#64748b; white-space:nowrap; overflow:hidden; text-overflow:ellipsis; display:block;">
                <span style="color:#0066cc; font-weight:600;">${escapeHtml(hw.className || '')}</span> • ${isExam ? 'Bài thi' : 'Luyện tập'}${hw.deadline ? ` • <span style="color:${isOverdue ? '#b91c1c' : '#64748b'};">Hạn: ${new Date(hw.deadline).toLocaleDateString('vi-VN')}</span>` : ''}
              </span>
            </div>
            <button class="btn-primary btn-latest-hw" data-homework-id="${escapeHtml(hw.id)}" data-homework-type="${isExam ? 'EXAM' : 'PRACTICE'}" style="width:auto; flex-shrink:0; padding:6px 14px; font-size:12px; font-weight:700; border-radius:8px; cursor:pointer; ${isExam ? 'background:#dc2626; border-color:#dc2626;' : ''}">
              ${isExam ? 'Vào thi' : 'Làm bài'}
            </button>
          </div>`
        }).join('')}
      </div>
    `
    container.querySelectorAll('.btn-latest-hw').forEach(button => {
      button.onclick = () => window.confirmStartHomework(button.dataset.homeworkId, button.dataset.homeworkType)
    })
  } catch (err) {
    if (!container.isConnected || state.user?.id !== userId) return
    console.warn('Failed to load latest homeworks:', err)
    container.innerHTML = `<p style="font-size:13px; color:#64748b; margin:0;">Chưa tải được bài tập mới.</p>`
  }
}

export async function loadWeakTopics() {
  const container = document.getElementById('weak-topics-container')
  if (!container) return
  const userId = state.user?.id

  try {
    const res = await api.getWeakTopics({ limit: 3 })
    if (!container.isConnected || state.user?.id !== userId) return
    const topics = res?.topics || []
    if (topics.length === 0) {
      container.innerHTML = `
        <p style="font-size:13px; color:#64748b; margin:0;">
          ${res && res.totalAnswered > 0
            ? 'Tuyệt vời! Bạn không có chương yếu rõ rệt. Duy trì phong độ nhé.'
            : 'Chưa đủ dữ liệu — hãy làm thêm bài tập để hệ thống nhận diện điểm yếu của bạn.'}
        </p>
      `
      return
    }

    container.innerHTML = topics.map((t, idx) => {
      const rate = t.wrongRate ?? 0
      const color = rate >= 60 ? '#ef4444' : rate >= 40 ? '#f59e0b' : '#eab308'
      const medal = idx === 0 ? '🥇' : idx === 1 ? '🥈' : '🥉'
      const rowTag = isMochiUI() && t.classId ? 'button' : 'div'
      const buttonAttrs = rowTag === 'button' ? 'type="button"' : ''
      return `
        <${rowTag} ${buttonAttrs} class="weak-topic-row" ${t.classId ? `data-class-id="${t.classId}"` : ''} style="display:flex; align-items:center; gap:12px; padding:10px 12px; background:#ffffff; border:1px solid #fee2e2; border-radius:10px; margin-bottom:8px; ${t.classId ? 'cursor:pointer;' : ''}" ${t.classId ? 'title="Bấm để mở lớp ôn lại chương này"' : ''}>
          <span style="font-size:18px;">${medal}</span>
          <div style="flex:1; min-width:0;">
            <div style="font-size:13px; font-weight:700; color:#0f172a; white-space:nowrap; overflow:hidden; text-overflow:ellipsis;">${escapeHtml(t.chapterTitle)} ${t.classId ? '<i class="fa-solid fa-arrow-right" style="font-size:11px; color:#94a3b8;"></i>' : ''}</div>
            <div style="height:6px; background:#fee2e2; border-radius:3px; overflow:hidden; margin-top:6px;">
              <div style="width:${Math.min(100, rate)}%; height:100%; background:${color}; border-radius:3px;"></div>
            </div>
          </div>
          <div style="text-align:right; flex-shrink:0;">
            <div style="font-size:14px; font-weight:800; color:${color};">${rate}% sai</div>
            <div style="font-size:11px; color:#64748b;">${t.wrong}/${t.answered} câu</div>
          </div>
        </${rowTag}>
      `
    }).join('')

    container.querySelectorAll('.weak-topic-row[data-class-id]').forEach(row => {
      row.onclick = () => {
        window.location.hash = `#my-classes?classId=${row.getAttribute('data-class-id')}`
      }
    })
  } catch (err) {
    if (!container.isConnected || state.user?.id !== userId) return
    console.warn('Failed to load weak topics:', err)
    container.innerHTML = `
      <p style="font-size:13px; color:#64748b; margin:0;">Chưa thể phân tích lúc này.</p>
    `
  }
}

async function loadTodoHomeworks() {
  const container = document.getElementById('todo-homeworks-container')
  if (!container) return

  container.innerHTML = `
    <div style="text-align:center; padding:24px; color:#64748b;">
      <i class="fa-solid fa-circle-notch fa-spin" style="font-size:24px; color:#0066cc; margin-bottom:8px; display:block; margin-left:auto; margin-right:auto;"></i>
      <span style="font-size:13px;">Đang tải danh sách bài tập chưa hoàn thành...</span>
    </div>
  `

  try {
    const todoHomeworks = await api.getTodoHomeworks()
    if (!todoHomeworks || todoHomeworks.length === 0) {
      container.innerHTML = `
        <p style="font-size:13px; color:#64748b; margin:0;">
          Tuyệt vời! Bạn đã hoàn thành tất cả các bài tập được giao.
        </p>
      `
      return
    }

    let currentFilter = 'ALL'

    const renderTodoList = (filter) => {
      const filteredHomeworks = todoHomeworks.filter(hw => {
        if (filter === 'PRACTICE') return hw.type !== 'EXAM'
        if (filter === 'EXAM') return hw.type === 'EXAM'
        return true
      })

      if (filteredHomeworks.length === 0) {
        return `
          <div style="text-align:center; padding:32px 16px; color:#64748b; background:#f8fafc; border-radius:12px; border:1px dashed #cbd5e1; margin-top:8px;">
            <i class="fa-regular fa-folder-open" style="font-size:32px; color:#94a3b8; margin-bottom:8px; display:block;"></i>
            <span style="font-size:13px;">Không có bài tập nào thuộc phân loại này.</span>
          </div>
        `
      }

      // Group by classId
      const groups = {}
      filteredHomeworks.forEach(hw => {
        if (!groups[hw.classId]) {
          groups[hw.classId] = {
            name: hw.className,
            homeworks: []
          }
        }
        groups[hw.classId].homeworks.push(hw)
      })

      let html = `
        <div class="todo-scroll-container" style="display:flex; flex-direction:column; gap:20px; margin-top:8px; max-height:420px; overflow-y:auto; padding-right:8px; scrollbar-width:thin; scrollbar-color:#cbd5e1 transparent;">
      `

      Object.values(groups).forEach(g => {
        const homeworksHtml = g.homeworks.map(hw => {
          const isExam = hw.type === 'EXAM'
          // Học sinh tuyệt đối không thấy nút tải PDF của BÀI THI.
          const canShowPdf = canViewHomeworkPdf(state.user?.role, hw)
          const typeBadge = isExam
            ? `<span style="color: #dc2626; background: #fef2f2; border: 1px solid #fecaca; padding: 3px 8px; border-radius: 6px; display: inline-flex; align-items: center; gap: 4px; font-weight: 700; font-size: 11px; width: fit-content;"><i class="fa-solid fa-shield-halved"></i> BÀI THI</span>`
            : `<span style="color: #16a34a; background: #f0fdf4; border: 1px solid #bbf7d0; padding: 3px 8px; border-radius: 6px; display: inline-flex; align-items: center; gap: 4px; font-weight: 700; font-size: 11px; width: fit-content;"><i class="fa-solid fa-pen-to-square"></i> LUYỆN TẬP</span>`

          const deadlineHtml = hw.deadline
            ? `<span style="color: #b91c1c; background: #fee2e2; border: 1px solid #fecaca; padding: 4px 8px; border-radius: 6px; display: inline-flex; align-items: center; gap: 6px; font-weight: 600; width: fit-content; margin-top: 4px;">
                <i class="fa-solid fa-calendar-day"></i> Hạn chót: ${new Date(hw.deadline).toLocaleString('vi-VN')}
               </span>`
            : ''

          return `
            <div style="padding:16px; background:#f8fafc; border:1px solid #e2e8f0; border-radius:12px; display:flex; flex-direction:column; justify-content:space-between; height:100%; box-sizing:border-box;">
              <div>
                <div style="display:flex; justify-content:space-between; align-items:flex-start; gap:8px; margin-bottom:8px;">
                  <div style="font-weight:700; font-size:14px; color:#0f172a; line-height:1.4; flex:1;">${escapeHtml(hw.title)}</div>
                  ${typeBadge}
                </div>
                <div style="font-size:12px; color:#64748b; margin-bottom:12px; display:flex; flex-direction:column; gap:4px;">
                  <span><i class="fa-regular fa-clock"></i> Thời gian: ${hw.durationMinutes || 45} phút</span>
                  ${deadlineHtml}
                </div>
              </div>
              <div style="display:flex; gap:8px; margin-top:8px;">
                ${canShowPdf ? `<button type="button" class="btn-secondary btn-download-pdf-card" onclick="window.downloadHomeworkPdf('${hw.id}')" style="padding:8px 12px; font-size:12px; font-weight:600; background:#eff6ff; color:#0066cc; border:1px solid #bfdbfe; border-radius:8px; display:inline-flex; align-items:center; justify-content:center; gap:6px; cursor:pointer; transition:all 0.15s ease; white-space:nowrap; flex-shrink:0;" title="Tải file PDF đề bài (${escapeHtml(hw.title)})">
                  <i class="fa-solid fa-file-arrow-down" style="font-size:13px; color:#0066cc;"></i> Tải PDF
                </button>` : ''}
                <button class="btn-primary" onclick="window.confirmStartHomework('${hw.id}', '${hw.type || 'PRACTICE'}')" style="flex:1; padding:8px 12px; font-size:12px; font-weight:600; cursor:pointer; border-radius:8px; background: ${hw.type === 'EXAM' ? '#dc2626' : ''}; border-color: ${hw.type === 'EXAM' ? '#dc2626' : ''}; display:inline-flex; align-items:center; justify-content:center; gap:6px;">
                  ${hw.type === 'EXAM' ? '<i class="fa-solid fa-shield-cat"></i> Vào phòng thi' : 'Bắt đầu làm bài <i class="fa-solid fa-arrow-right"></i>'}
                </button>
              </div>
            </div>
          `
        }).join('')

        html += `
          <div>
            <h4 style="font-family:var(--font-heading); font-size:14px; font-weight:700; color:#0f172a; margin:0 0 10px 0; display:flex; align-items:center; gap:8px;">
              <span style="display:inline-block; width:8px; height:8px; border-radius:50%; background:#0066cc;"></span>
              Lớp: ${g.name}
            </h4>
            <div style="display:grid; grid-template-columns: repeat(auto-fill, minmax(280px, 1fr)); gap:12px;">
              ${homeworksHtml}
            </div>
          </div>
        `
      })

      html += `</div>`
      return html
    }

    const allCount = todoHomeworks.length
    const practiceCount = todoHomeworks.filter(h => h.type !== 'EXAM').length
    const examCount = todoHomeworks.filter(h => h.type === 'EXAM').length

    let mainHtml = `
      <style>
        .todo-scroll-container::-webkit-scrollbar {
          width: 6px;
        }
        .todo-scroll-container::-webkit-scrollbar-track {
          background: transparent;
        }
        .todo-scroll-container::-webkit-scrollbar-thumb {
          background: #cbd5e1;
          border-radius: 4px;
        }
        .todo-scroll-container::-webkit-scrollbar-thumb:hover {
          background: #94a3b8;
        }
      </style>
      <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:12px; flex-wrap:wrap; gap:10px; border-bottom:1px solid #f1f5f9; padding-bottom:12px;">
        <div style="display:flex; gap:8px;">
          <button class="todo-filter-btn" data-filter="ALL" style="padding:6px 14px; font-size:12px; font-weight:700; border-radius:20px; border:1px solid #0066cc; background:#0066cc; color:#ffffff; cursor:pointer; transition:all 0.15s ease;">
            Tất cả (${allCount})
          </button>
          <button class="todo-filter-btn" data-filter="PRACTICE" style="padding:6px 14px; font-size:12px; font-weight:600; border-radius:20px; border:1px solid #cbd5e1; background:#ffffff; color:#475569; cursor:pointer; transition:all 0.15s ease;">
            <i class="fa-solid fa-pen-to-square" style="color:#16a34a;"></i> Luyện tập (${practiceCount})
          </button>
          <button class="todo-filter-btn" data-filter="EXAM" style="padding:6px 14px; font-size:12px; font-weight:600; border-radius:20px; border:1px solid #cbd5e1; background:#ffffff; color:#475569; cursor:pointer; transition:all 0.15s ease;">
            <i class="fa-solid fa-shield-halved" style="color:#dc2626;"></i> Bài thi (${examCount})
          </button>
        </div>
      </div>
      <div id="todo-list-wrapper">
        ${renderTodoList('ALL')}
      </div>
    `
    container.innerHTML = mainHtml

    // Bind Filter Events
    container.querySelectorAll('.todo-filter-btn').forEach(btn => {
      btn.onclick = () => {
        const filter = btn.getAttribute('data-filter')
        currentFilter = filter

        // Update active tab style
        container.querySelectorAll('.todo-filter-btn').forEach(b => {
          b.style.background = '#ffffff'
          b.style.color = '#475569'
          b.style.borderColor = '#cbd5e1'
          b.style.fontWeight = '600'
        })
        btn.style.background = '#0066cc'
        btn.style.color = '#ffffff'
        btn.style.borderColor = '#0066cc'
        btn.style.fontWeight = '700'

        const wrapper = document.getElementById('todo-list-wrapper')
        if (wrapper) {
          wrapper.innerHTML = renderTodoList(filter)
        }
      }
    })
  } catch (err) {
    console.error('Failed to load todo homeworks:', err)
    container.innerHTML = `
      <p style="font-size:13px; color:#ef4444; margin:0;">
        Không thể tải danh sách bài tập. Vui lòng tải lại trang hoặc thử lại sau.
      </p>
    `
  }
}
