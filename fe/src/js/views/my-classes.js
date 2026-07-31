import { renderSidebar, bindSidebarEvents } from '../components/sidebar.js'
import { renderNavbar } from '../components/navbar.js'
import { state } from '../state.js'
import { openModal } from '../components/modal.js'
import { api } from '../api.js'

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

let selectedClassId = null
let selectedLessonId = null
let classChapters = []
let activeLessonHomeworks = []
let isLoadingChapters = false
let isLoadingHomeworks = false

export function renderMyClassesView() {
  const classes = state.classes

  // Case 1: Viewing Specific Class Details (Lessons & Assignments)
  if (selectedClassId) {
    const selectedClass = classes.find(c => c.id === selectedClassId) || classes[0]

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
                    <h1 class="page-title" style="font-size:24px; margin-top:2px;">${selectedClass.name}</h1>
                    <div style="font-size:13px; color:#64748b; margin-top:4px;">
                      <i class="fa-solid fa-users"></i> ${selectedClass.studentsCount} Học sinh
                    </div>
                  </div>
                </div>

                <div style="text-align:right;">
                  <div style="font-size:12px; color:#64748b; margin-bottom:4px;">Tiến độ môn học</div>
                  <div style="font-family:var(--font-heading); font-size:28px; font-weight:700; color:#0066cc;">${selectedClass.progress}%</div>
                </div>
              </div>
            </div>

            <!-- Main Content: Lessons & Assignments Split -->
            <div class="grid-3">
              <!-- Left Column: Chapter & Lesson List (Span 2) -->
              <div style="grid-column: span 2;">
                <div class="page-header" style="margin-bottom:16px;">
                  <h2 style="font-family:var(--font-heading); font-size:18px; font-weight:700; color:#0f172a;">
                    <i class="fa-solid fa-book-open" style="color:#0066cc;"></i> Chương & Bài học
                  </h2>
                </div>

                ${isLoadingChapters ? `
                  <div class="card" style="text-align:center; padding:40px; color:#64748b;">
                    <i class="fa-solid fa-circle-notch fa-spin" style="font-size:32px; color:#0066cc; margin-bottom:12px;"></i>
                    <p style="font-weight:600;">Đang tải danh sách bài học...</p>
                  </div>
                ` : (classChapters.length === 0 ? `
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
                        const isSelected = selectedLessonId === l.id
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
                `).join(''))}
              </div>

              <!-- Right Column: Assignments details for selected lesson -->
              <div>
                <div class="card">
                  <h3 style="font-family:var(--font-heading); font-size:16px; font-weight:700; margin-bottom:16px; color:#0f172a;">
                    <i class="fa-solid fa-list-check" style="color:#0066cc;"></i> Danh sách bài tập
                  </h3>

                  ${!selectedLessonId ? `
                    <div style="text-align:center; padding:24px 12px; color:#64748b;">
                      <i class="fa-solid fa-arrow-left-long" style="font-size:24px; color:#94a3b8; margin-bottom:10px; display:block;"></i>
                      <span style="font-size:13px;">Chọn một bài học ở cột bên trái để xem bài tập chi tiết.</span>
                    </div>
                  ` : (isLoadingHomeworks ? `
                    <div style="text-align:center; padding:24px 0; color:#64748b;">
                      <i class="fa-solid fa-circle-notch fa-spin" style="font-size:24px; color:#0066cc; margin-bottom:8px; display:block; margin-left:auto; margin-right:auto;"></i>
                      <span style="font-size:13px;">Đang tải bài tập...</span>
                    </div>
                  ` : (activeLessonHomeworks.length === 0 ? `
                    <div style="text-align:center; padding:24px 12px; color:#64748b;">
                      <i class="fa-solid fa-clipboard-question" style="font-size:28px; color:#94a3b8; margin-bottom:10px; display:block;"></i>
                      <span style="font-size:13px;">Bài học này hiện tại chưa có bài tập nào.</span>
                    </div>
                  ` : `
                    <div style="display:flex; flex-direction:column; gap:12px;">
                      ${activeLessonHomeworks.map(hw => `
                        <div style="padding:14px; background:#f8fafc; border:1px solid #e2e8f0; border-radius:12px;">
                          <div style="font-weight:700; font-size:14px; color:#0f172a; margin-bottom:4px;">${hw.title}</div>
                          <div style="font-size:12px; color:#64748b; margin-bottom:12px;">
                            <i class="fa-regular fa-clock"></i> Thời gian: ${hw.durationMinutes || 45} phút
                          </div>
                          <button class="btn-primary" onclick="window.confirmStartHomework('${hw.id}')" style="padding:8px 14px; font-size:13px; width:100%; cursor:pointer;">
                            Vào làm bài ngay <i class="fa-solid fa-arrow-right"></i>
                          </button>
                        </div>
                      `).join('')}
                    </div>
                  `))}
                </div>
              </div>
            </div>
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

  // Event to open a class and view its lessons & homeworks (Lazy fetch chapters & lessons)
  document.querySelectorAll('.select-class-card').forEach(card => {
    card.addEventListener('click', async () => {
      const classId = card.getAttribute('data-id')
      selectedClassId = classId
      selectedLessonId = null
      classChapters = []
      activeLessonHomeworks = []
      isLoadingChapters = true

      // Re-render immediately to show loading spinner
      const app = document.getElementById('app')
      if (app) {
        app.innerHTML = renderMyClassesView()
        bindMyClassesEvents()
      }

      try {
        const rawChapters = await api.getChapters(classId)
        const chapters = []
        for (const ch of (rawChapters || [])) {
          const rawLessons = await api.getLessons(ch.id)
          chapters.push({
            id: ch.id,
            code: `CHƯƠNG ${ch.order_index || ''}`.trim(),
            title: ch.title,
            lessons: (rawLessons || []).map(l => ({
              id: l.id,
              code: `${ch.order_index || 1}.${l.order_index || 1}`,
              title: l.title
            }))
          })
        }
        classChapters = chapters
      } catch (err) {
        console.error('Failed to load chapters/lessons:', err)
      } finally {
        isLoadingChapters = false
        if (app) {
          app.innerHTML = renderMyClassesView()
          bindMyClassesEvents()
        }
      }
    })
  })

  // Event to click on a lesson and load its homework (Lazy fetch homeworks)
  document.querySelectorAll('.lesson-item-btn').forEach(btn => {
    btn.addEventListener('click', async () => {
      const lessonId = btn.getAttribute('data-id')
      selectedLessonId = lessonId
      activeLessonHomeworks = []
      isLoadingHomeworks = true

      const app = document.getElementById('app')
      if (app) {
        app.innerHTML = renderMyClassesView()
        bindMyClassesEvents()
      }

      try {
        const rawHomeworks = await api.getHomeworks(lessonId)
        activeLessonHomeworks = (rawHomeworks || []).map(h => ({
          id: h.id,
          title: h.title,
          lessonId: h.lesson_id,
          pdfPath: h.pdf_path,
          durationMinutes: h.duration_minutes,
          passScore: h.pass_score,
          maxScore: h.max_score
        }))
      } catch (err) {
        console.error('Failed to load homeworks:', err)
      } finally {
        isLoadingHomeworks = false
        if (app) {
          app.innerHTML = renderMyClassesView()
          bindMyClassesEvents()
        }
      }
    })
  })

  // Back button to return to all classes list
  document.getElementById('back-to-classes-btn')?.addEventListener('click', () => {
    selectedClassId = null
    selectedLessonId = null
    classChapters = []
    activeLessonHomeworks = []
    const app = document.getElementById('app')
    if (app) {
      app.innerHTML = renderMyClassesView()
      bindMyClassesEvents()
    }
  })
}
