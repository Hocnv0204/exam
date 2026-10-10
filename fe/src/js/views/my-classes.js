import { renderSidebar, bindSidebarEvents } from '../components/sidebar.js'
import { renderNavbar } from '../components/navbar.js'
import { state } from '../state.js'
import { renderPdfViewer } from '../components/pdf-viewer.js'
import { openModal } from '../components/modal.js'
import { showToast } from '../components/toast.js'
import { api, SUPABASE_URL } from '../api.js'
import { downloadHomeworkPdf, escapeHtml } from '../utils/download-helper.js'

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

let collapsedChapterIds = new Set()

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
  const hashUrl = window.location.hash.replace('#', '')
  const [_, queryString] = hashUrl.split('?')
  const params = new URLSearchParams(queryString || '')
  const classId = params.get('classId')
  const lessonId = params.get('lessonId')

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
    const selectedClass = classes.find(c => c.id === classId) || classes[0]

    return `
      <div class="app-layout">
        ${renderSidebar('my-classes')}
        <div class="main-content">
          ${renderNavbar('Nền tảng / Bảng điều khiển')}
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
                <div style="grid-column: span 3; margin-bottom: 12px;">
                  <button class="btn-secondary" id="btn-back-to-lessons" style="padding:8px 16px; font-size:13px; font-weight:600; cursor:pointer; width:auto; display:inline-flex; align-items:center; gap:6px;">
                    <i class="fa-solid fa-arrow-left"></i> Quay lại danh sách bài học
                  </button>
                </div>
                <div class="grid-3" style="grid-column: span 3; gap: 20px;">
                  <div style="grid-column: span 2;">
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
                    <div class="card" style="padding:20px; margin-bottom:0;">
                      <h2 style="font-family:var(--font-heading); font-size:18px; font-weight:700; color:#0f172a; margin-bottom:10px;">${activeLesson.title}</h2>
                      <div style="font-size:14px; color:#475569; line-height:1.6;">
                        ${activeLesson.content || 'Không có mô tả chi tiết cho bài học này.'}
                      </div>
                    </div>
                  </div>

                  <!-- Right column beside video: Tài liệu + Bài tập -->
                  <div style="display:flex; flex-direction:column; gap:20px;">
                    <div class="card" style="padding:20px; margin:0;">
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
                  <div class="card" style="padding:20px; margin:0;">
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
                                    <button type="button" class="btn-secondary btn-download-pdf-card" onclick="window.downloadHomeworkPdf('${hw.id}')" style="padding:6px 10px; font-size:11.5px; font-weight:600; background:#eff6ff; color:#0066cc; border:1px solid #bfdbfe; border-radius:6px; display:inline-flex; align-items:center; justify-content:center; gap:5px; cursor:pointer; transition:all 0.15s ease; white-space:nowrap; flex-shrink:0;" title="Tải file PDF đề bài (${escapeHtml(hw.title)})">
                                      <i class="fa-solid fa-file-arrow-down" style="font-size:12px; color:#0066cc;"></i> Tải PDF
                                    </button>
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
                </div>

                ${(classChapters.length === 0) ? `
                  <div class="card" style="text-align:center; padding:32px; color:#64748b;">
                    <i class="fa-solid fa-folder-open" style="font-size:36px; color:#94a3b8; margin-bottom:12px;"></i>
                    <p style="font-weight:600;">Lớp học này chưa cập nhật danh sách bài học.</p>
                  </div>
                ` : classChapters.map(ch => {
                  const isCollapsed = collapsedChapterIds.has(ch.id)
                  return `
                  <div class="card" style="padding:18px; margin-bottom:16px;">
                    <div style="display:flex; justify-content:space-between; align-items:center; cursor:pointer; user-select:none;" class="chapter-card-header" data-ch-id="${ch.id}">
                      <div style="display:flex; align-items:center; gap:10px;">
                        <i class="fa-solid ${isCollapsed ? 'fa-folder' : 'fa-folder-open'}" style="color:#0066cc; font-size:16px;"></i>
                        <h3 style="font-size:16px; font-weight:700; color:#0f172a; margin:0;">${escapeHtml(ch.title)}</h3>
                      </div>
                      <div style="display:flex; align-items:center; gap:12px;">
                        <span style="font-size:12px; color:#64748b; font-weight:500;">${ch.lessons?.length || 0} bài học</span>
                        <button type="button" class="btn-toggle-chapter" data-ch-id="${ch.id}" style="background:#f8fafc; border:1px solid #e2e8f0; border-radius:8px; padding:4px 10px; cursor:pointer; display:inline-flex; align-items:center; gap:6px; font-size:12px; color:#475569; font-weight:600; transition:all 0.15s ease;">
                          <span class="btn-toggle-label">${isCollapsed ? 'Mở rộng' : 'Thu gọn'}</span>
                          <i class="fa-solid ${isCollapsed ? 'fa-chevron-down' : 'fa-chevron-up'} btn-toggle-icon" style="font-size:11px; color:#64748b;"></i>
                        </button>
                      </div>
                    </div>

                    <div class="chapter-lessons-body" id="chapter-lessons-${ch.id}" style="margin-top:14px; padding-top:14px; border-top:1px solid #f1f5f9; display:${isCollapsed ? 'none' : 'grid'}; grid-template-columns:repeat(auto-fill, minmax(360px, 1fr)); gap:10px;">
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
                          <div class="lesson-item-btn" data-id="${l.id}" style="display:flex; align-items:center; justify-content:space-between; gap:12px; padding:14px 16px; background:${isSelected ? '#e0f2fe' : '#ffffff'}; border:1px solid ${isSelected ? '#0066cc' : '#e2e8f0'}; border-radius:12px; cursor:pointer; transition:all 0.15s ease; box-shadow:0 1px 2px rgba(0,0,0,0.03);">
                            <div style="display:flex; align-items:center; gap:12px; flex:1; min-width:0;">
                              <span style="width:32px; height:32px; background:${isSelected ? '#0066cc' : '#eff6ff'}; color:${isSelected ? '#ffffff' : '#0066cc'}; border-radius:10px; display:flex; align-items:center; justify-content:center; font-size:13px; font-weight:800; flex-shrink:0;">${l.order_index || l.code || (lIdx + 1)}</span>
                              <div style="min-width:0; flex:1;">
                                <div style="font-weight:700; font-size:14px; color:${isSelected ? '#0369a1' : '#0f172a'}; white-space:nowrap; overflow:hidden; text-overflow:ellipsis;" title="${escapeHtml(l.title)}">
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
                `}).join('')}
              </div>
            `}
          </div>
        </div>
      </div>
    `
  }

  // Case 2: List of All Classes for Student
  return `
    <div class="app-layout">
      ${renderSidebar('my-classes')}
      <div class="main-content">
        ${renderNavbar('Nền tảng / Bảng điều khiển')}
        <div class="content-body">
          <div class="page-header">
            <div>
              <h1 class="page-title">Lớp học của tôi</h1>
              <p class="page-description">Danh sách các lớp học đã đăng ký. Nhấn vào lớp để xem bài học và bài tập chi tiết.</p>
            </div>
            <div style="display:flex; gap:12px;">
              <button class="btn-secondary"><i class="fa-solid fa-sliders"></i> Bộ lọc</button>
            </div>
          </div>

          <!-- Latest homeworks: gọn ở đầu trang -->
          <div class="card" style="padding:14px 18px; margin-bottom:20px; border:1px solid #bfdbfe; background:#f5faff;">
            <h3 style="font-family:var(--font-heading); font-size:15px; font-weight:700; margin:0 0 10px 0; display:flex; align-items:center; gap:8px;">
              <i class="fa-solid fa-bolt" style="color:#d97706;"></i> Bài tập mới giao
            </h3>
            <div id="latest-homeworks-container">
              <p style="font-size:13px; color:#64748b; margin:0;">
                <i class="fa-solid fa-circle-notch fa-spin" style="color:#0066cc;"></i> Đang tải bài tập mới...
              </p>
            </div>
          </div>

          <!-- Classes Cards Grid -->
          <div class="grid-4" style="margin-bottom:28px;">
            ${classes.map(c => `
              <div class="class-card select-class-card" data-id="${c.id}" style="cursor:pointer; padding: 20px;">
                <div class="class-card-body" style="padding: 0;">
                  <h3 class="class-title" style="margin-bottom: 12px;">${c.name}</h3>

                  <div style="font-size:12px; display:flex; justify-content:space-between; margin-bottom:6px; color:#64748b;">
                    <span>Tiến độ môn học</span>
                    <span style="font-weight:700; color:#0066cc;">${c.progress}%</span>
                  </div>
                  <div class="progress-bar-bg">
                    <div class="progress-bar-fill" style="width: ${c.progress}%;"></div>
                  </div>

                  <div class="class-footer">
                    <span><i class="fa-solid fa-users"></i> ${c.studentsCount} Học sinh</span>
                    <div class="enter-class-btn" style="color:#0066cc; font-weight:700;">
                      Xem bài học <i class="fa-solid fa-arrow-right"></i>
                    </div>
                  </div>
                </div>
              </div>
            `).join('')}
          </div>

          <!-- Weak Topics Panel -->
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
          </div>
        </div>
      </div>
    </div>
  `
}

export function bindMyClassesEvents() {
  bindSidebarEvents()

  const hashUrl = window.location.hash.replace('#', '')
  const [_, queryString] = hashUrl.split('?')
  const params = new URLSearchParams(queryString || '')
  const classId = params.get('classId')
  const lessonId = params.get('lessonId')

  // Load todo homeworks for student notifications
  if (!classId && state.user?.role === 'STUDENT') {
    loadLatestHomeworksAll()
    loadWeakTopics()
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
    videoTrackStart = Date.now()
    videoTrackMeta = { lessonId, classId }
    try {
      api.logActivity({ action: 'LESSON_VIEW', metadata: { lessonId, classId } })
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
      if (!body) return

      const isHidden = body.style.display === 'none'
      if (isHidden) {
        body.style.display = 'grid'
        collapsedChapterIds.delete(chId)
        if (label) label.textContent = 'Thu gọn'
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
  })

  // Click on Lesson -> Route to My Classes with classId and lessonId
  document.querySelectorAll('.lesson-item-btn').forEach(btn => {
    btn.addEventListener('click', () => {
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

async function loadLatestHomeworksAll() {
  const container = document.getElementById('latest-homeworks-container')
  if (!container) return

  try {
    let classes = state.classes || []
    if (state.user?.role === 'STUDENT' && Array.isArray(state.user?.classIds)) {
      classes = classes.filter(c => state.user.classIds.includes(c.id))
    }
    if (classes.length === 0) {
      container.innerHTML = `<p style="font-size:13px; color:#64748b; margin:0;">Bạn chưa đăng ký lớp học nào.</p>`
      return
    }
    const results = await Promise.allSettled(
      classes.map(c => api.getHomeworks('', c.id, '', { silent: true }).then(res => ({ classObj: c, res })))
    )
    const merged = []
    for (const r of results) {
      if (r.status !== 'fulfilled') continue
      const { classObj, res } = r.value
      const list = Array.isArray(res) ? res : (res?.items || [])
      list.forEach(hw => merged.push({ ...hw, _className: classObj.name }))
    }
    const sorted = merged
      .sort((a, b) => new Date(b.createdAt || 0) - new Date(a.createdAt || 0))
      .slice(0, 5)
    if (sorted.length === 0) {
      container.innerHTML = `<p style="font-size:13px; color:#64748b; margin:0;">Chưa có bài tập nào được giao.</p>`
      return
    }
    container.innerHTML = `
      <div style="display:grid; grid-template-columns:repeat(auto-fill, minmax(420px, 1fr)); gap:4px 24px;">
        ${sorted.map((hw, idx) => {
          const isExam = hw.type === 'EXAM'
          const isOverdue = hw.deadline ? new Date() > new Date(hw.deadline) : false
          const hwTitle = hw.title || hw.lessonTitle || 'Bài tập'
          return `
          <div style="display:flex; align-items:center; gap:10px; padding:8px 4px; ${idx > 0 ? 'border-top:1px solid #e2e8f0;' : ''}">
            ${idx === 0 ? '<span style="font-size:10px; font-weight:800; color:#ffffff; background:#ef4444; padding:2px 7px; border-radius:6px; flex-shrink:0;">MỚI</span>' : ''}
            <div style="flex:1 1 auto; min-width:0;">
              <span style="font-size:13px; font-weight:700; color:#0f172a; white-space:nowrap; overflow:hidden; text-overflow:ellipsis; display:block;" title="${hwTitle}">${hwTitle}</span>
              <span style="font-size:11px; color:#64748b; white-space:nowrap; overflow:hidden; text-overflow:ellipsis; display:block;">
                <span style="color:#0066cc; font-weight:600;">${hw._className || ''}</span> • ${isExam ? 'Bài thi' : 'Luyện tập'}${hw.deadline ? ` • <span style="color:${isOverdue ? '#b91c1c' : '#64748b'};">Hạn: ${new Date(hw.deadline).toLocaleDateString('vi-VN')}</span>` : ''}
              </span>
            </div>
            <button class="btn-primary" onclick="window.confirmStartHomework('${hw.id}', '${hw.type || 'PRACTICE'}')" style="width:auto; flex-shrink:0; padding:6px 14px; font-size:12px; font-weight:700; border-radius:8px; cursor:pointer; ${isExam ? 'background:#dc2626; border-color:#dc2626;' : ''}">
              ${isExam ? 'Vào thi' : 'Làm bài'}
            </button>
          </div>`
        }).join('')}
      </div>
    `
  } catch (err) {
    console.warn('Failed to load latest homeworks:', err)
    container.innerHTML = `<p style="font-size:13px; color:#64748b; margin:0;">Chưa tải được bài tập mới.</p>`
  }
}

async function loadWeakTopics() {
  const container = document.getElementById('weak-topics-container')
  if (!container) return

  try {
    const res = await api.getWeakTopics({ limit: 3 })
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
      return `
        <div class="weak-topic-row" ${t.classId ? `data-class-id="${t.classId}"` : ''} style="display:flex; align-items:center; gap:12px; padding:10px 12px; background:#ffffff; border:1px solid #fee2e2; border-radius:10px; margin-bottom:8px; ${t.classId ? 'cursor:pointer;' : ''}" ${t.classId ? 'title="Bấm để mở lớp ôn lại chương này"' : ''}>
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
        </div>
      `
    }).join('')

    container.querySelectorAll('.weak-topic-row[data-class-id]').forEach(row => {
      row.onclick = () => {
        window.location.hash = `#my-classes?classId=${row.getAttribute('data-class-id')}`
      }
    })
  } catch (err) {
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
                <button type="button" class="btn-secondary btn-download-pdf-card" onclick="window.downloadHomeworkPdf('${hw.id}')" style="padding:8px 12px; font-size:12px; font-weight:600; background:#eff6ff; color:#0066cc; border:1px solid #bfdbfe; border-radius:8px; display:inline-flex; align-items:center; justify-content:center; gap:6px; cursor:pointer; transition:all 0.15s ease; white-space:nowrap; flex-shrink:0;" title="Tải file PDF đề bài (${escapeHtml(hw.title)})">
                  <i class="fa-solid fa-file-arrow-down" style="font-size:13px; color:#0066cc;"></i> Tải PDF
                </button>
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
