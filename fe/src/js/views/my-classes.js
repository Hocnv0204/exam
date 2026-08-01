import { renderSidebar, bindSidebarEvents } from '../components/sidebar.js'
import { renderNavbar } from '../components/navbar.js'
import { state } from '../state.js'
import { openModal } from '../components/modal.js'
import { api, SUPABASE_URL } from '../api.js'

window.confirmStartHomework = (homeworkId) => {
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

export function renderMyClassesView() {
  const hashUrl = window.location.hash.replace('#', '')
  const [_, queryString] = hashUrl.split('?')
  const params = new URLSearchParams(queryString || '')
  const classId = params.get('classId')
  const lessonId = params.get('lessonId')

  const classes = state.classes || []
  const classChapters = state.classChapters || []
  const activeLessonHomeworks = state.activeLessonHomeworks || []

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

  // Case 1: Viewing Specific Class Details (Lessons & Assignments)
  if (classId) {
    const selectedClass = classes.find(c => c.id === classId) || classes[0]

    return `
      <div class="app-layout">
        ${renderSidebar('my-classes')}
        <div class="main-content">
          ${renderNavbar('Nền tảng / Bảng điều khiển')}
          <div class="content-body">
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
                        <iframe src="${embedUrl}" style="position:absolute; top:0; left:0; width:100%; height:100%; border:0;" allowfullscreen allow="autoplay"></iframe>
                      </div>
                    ` : `
                      <div style="padding:48px 16px; border:1px dashed #cbd5e1; border-radius:12px; text-align:center; color:#64748b; margin-bottom:20px;">
                        <i class="fa-solid fa-video-slash" style="font-size:32px; color:#94a3b8; margin-bottom:12px;"></i>
                        <p style="font-weight:600; font-size:14px;">Bài học này không có video bài giảng</p>
                      </div>
                    `}

                    <!-- Lesson Information -->
                    <div class="card" style="padding:20px;">
                      <h2 style="font-family:var(--font-heading); font-size:18px; font-weight:700; color:#0f172a; margin-bottom:10px;">${activeLesson.title}</h2>
                      <div style="font-size:14px; color:#475569; line-height:1.6; margin-bottom:20px;">
                        ${activeLesson.content || 'Không có mô tả chi tiết cho bài học này.'}
                      </div>

                      <h3 style="font-family:var(--font-heading); font-size:15px; font-weight:700; color:#0f172a; margin-bottom:12px; border-top:1px solid #f1f5f9; padding-top:16px;">
                        <i class="fa-solid fa-paperclip" style="color:#0066cc;"></i> Tài liệu đính kèm
                      </h3>
                      ${(!activeLesson.theoryFiles || activeLesson.theoryFiles.length === 0) ? `
                        <p style="font-size:13px; color:#64748b; font-style:italic;">Không có tài liệu lý thuyết nào.</p>
                      ` : `
                        <div style="display:flex; flex-direction:column; gap:8px;">
                          ${activeLesson.theoryFiles.map(file => {
                            const dispName = file.split('_').slice(1).join('_') || file
                            return `
                              <div style="display:flex; align-items:center; justify-content:space-between; padding:10px 14px; background:#f8fafc; border:1px solid #e2e8f0; border-radius:8px;">
                                <span style="font-size:13px; font-weight:600; color:#334155; font-family:monospace;">${dispName}</span>
                                <button class="btn-secondary btn-download-theory" data-file="${file}" style="padding:4px 10px; font-size:11px; cursor:pointer;">
                                  <i class="fa-solid fa-download"></i> Tải xuống
                                </button>
                              </div>
                            `
                          }).join('')}
                        </div>
                      `}
                    </div>
                  </div>

                  <!-- Right Side: Homework of Lesson -->
                  <div>
                    <div class="card" style="padding:20px;">
                      <h3 style="font-family:var(--font-heading); font-size:16px; font-weight:700; margin-bottom:16px; color:#0f172a; display:flex; align-items:center; gap:8px;">
                        <i class="fa-solid fa-list-check" style="color:#0066cc;"></i> Bài tập tự luyện
                      </h3>

                      <div style="display:flex; flex-direction:column; gap:12px;">
                        ${(activeLessonHomeworks.length === 0) ? `
                          <div style="text-align:center; padding:16px; border:1px dashed #cbd5e1; border-radius:8px; color:#64748b; font-size:12px;">
                            Bài học này chưa có bài tập nào.
                          </div>
                        ` : `
                          <div style="display:flex; flex-direction:column; gap:12px;">
                            ${activeLessonHomeworks.map(hw => `
                              <div style="padding:12px; background:#f8fafc; border:1px solid #e2e8f0; border-radius:10px;">
                                <div style="font-weight:700; font-size:13px; color:#0f172a; margin-bottom:4px;">${hw.title}</div>
                                <div style="font-size:11px; color:#64748b; margin-bottom:10px;">
                                  <i class="fa-regular fa-clock"></i> Thời gian: ${hw.durationMinutes || 45} phút
                                </div>
                                <button class="btn-primary" onclick="window.confirmStartHomework('${hw.id}')" style="padding:6px 12px; font-size:12px; width:100%; cursor:pointer; border-radius:6px;">
                                  Vào làm bài ngay <i class="fa-solid fa-arrow-right"></i>
                                </button>
                              </div>
                            `).join('')}
                          </div>
                        `}
                      </div>
                    </div>
                  </div>
                </div>
              `
            })() : `
              <div class="grid-3" style="display: grid; grid-template-columns: repeat(3, 1fr); gap: 20px;">
                <!-- Left: Chapters list -->
                <div style="grid-column: span 2;">
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
                  ` : classChapters.map(ch => `
                    <div class="card" style="padding:18px; margin-bottom:16px;">
                      <div style="display:flex; justify-content:space-between; align-items:center;">
                        <div>
                          <span style="background:#e0f2fe; color:#0369a1; font-size:11px; font-weight:700; padding:2px 8px; border-radius:4px; text-transform:uppercase;">${ch.code || 'CHƯƠNG'}</span>
                          <h3 style="font-size:16px; font-weight:700; color:#0f172a; margin-top:4px;">${ch.title}</h3>
                        </div>
                        <span style="font-size:12px; color:#64748b;">${ch.lessons?.length || 0} bài học</span>
                      </div>

                      <div style="margin-top:14px; padding-top:14px; border-top:1px solid #f1f5f9; display:flex; flex-direction:column; gap:10px;">
                        ${(ch.lessons || []).map(l => {
                          const isSelected = lessonId === l.id
                          return `
                            <div class="lesson-item-btn" data-id="${l.id}" style="display:flex; align-items:center; justify-content:space-between; padding:12px 14px; background:${isSelected ? '#e0f2fe' : '#f8fafc'}; border:1px solid ${isSelected ? '#0066cc' : 'transparent'}; border-radius:10px; cursor:pointer; transition:all 0.15s ease;">
                              <div style="display:flex; align-items:center; gap:12px; flex:1;">
                                <span style="width:26px; height:26px; background:#ffffff; border:1px solid ${isSelected ? '#0066cc' : '#cbd5e1'}; border-radius:50%; display:flex; align-items:center; justify-content:center; font-size:11px; font-weight:700;">${l.code || '1.1'}</span>
                                <div>
                                  <div style="font-weight:600; font-size:14px; color:${isSelected ? '#0369a1' : '#0f172a'};">${l.title}</div>
                                </div>
                              </div>
                              <div style="color:${isSelected ? '#0066cc' : '#94a3b8'};">
                                <i class="fa-solid fa-chevron-right"></i>
                              </div>
                            </div>
                          `
                        }).join('')}
                      </div>
                    </div>
                  `).join('')}
                </div>

                <!-- Right: Prompt to select lesson -->
                <div>
                  <div class="card">
                    <h3 style="font-family:var(--font-heading); font-size:16px; font-weight:700; margin-bottom:16px; color:#0f172a;">
                      <i class="fa-solid fa-list-check" style="color:#0066cc;"></i> Danh sách bài tập
                    </h3>
                    <div style="text-align:center; padding:24px 12px; color:#64748b;">
                      <i class="fa-solid fa-arrow-left-long" style="font-size:24px; color:#94a3b8; margin-bottom:10px; display:block;"></i>
                      <span style="font-size:13px;">Chọn một bài học ở cột bên trái để xem bài tập và nội dung học chi tiết.</span>
                    </div>
                  </div>
                </div>
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

          <!-- Bottom Summary Panel -->
          <div class="card">
            <h3 style="font-family:var(--font-heading); font-size:17px; font-weight:700; margin-bottom:12px;">
              <i class="fa-solid fa-bullhorn" style="color:#0066cc;"></i> Thông báo học tập
            </h3>
            <p style="font-size:13px; color:#64748b;">
              Hãy chọn lớp học của bạn ở trên để kiểm tra toàn bộ danh sách bài học và bài tập về nhà chưa hoàn thành.
            </p>
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

  // Download theory confirmation popup
  document.querySelectorAll('.btn-download-theory').forEach(btn => {
    btn.onclick = () => {
      const file = btn.getAttribute('data-file')
      const displayName = file.split('_').slice(1).join('_') || file
      openModal(
        'Xác nhận tải tài liệu',
        `<p style="font-size:15px; color:#475569; line-height:1.6; margin:0;">
          Bạn có chắc chắn muốn tải xuống tài liệu lý thuyết <strong>"${displayName}"</strong> không?
         </p>`,
        () => {
          window.open(`${SUPABASE_URL}/storage/v1/object/public/pdf-files/${file}`, '_blank')
          return true
        }
      )
    }
  })
}
