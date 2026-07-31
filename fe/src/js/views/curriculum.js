import { renderSidebar, bindSidebarEvents } from '../components/sidebar.js'
import { renderNavbar } from '../components/navbar.js'
import { openModal } from '../components/modal.js'
import { showToast } from '../components/toast.js'
import { state } from '../state.js'
import { api } from '../api.js'

let activeClassId = state.classes[0]?.id || 'c1'
let isLoadingCurriculum = false

async function ensureCurriculumLoaded(classId) {
  if (state.curriculums.some(c => c.classId === classId)) {
    return // Already loaded!
  }

  isLoadingCurriculum = true
  // Re-render immediately to show loading spinner
  const app = document.getElementById('app')
  if (app) {
    app.innerHTML = renderCurriculumView()
    bindCurriculumEvents()
  }

  try {
    // 1. Fetch homeworks if not loaded yet
    if (state.homeworks.length === 0) {
      const rawHomeworks = await api.getHomeworks()
      state.homeworks = (rawHomeworks || []).map(h => ({
        id: h.id,
        title: h.title,
        lessonId: h.lesson_id,
        pdfPath: h.pdf_path,
        durationMinutes: h.duration_minutes,
        passScore: h.pass_score,
        maxScore: h.max_score
      }))
    }

    // 2. Fetch Chapters & Lessons of this class
    const rawChapters = await api.getChapters(classId)
    const chapters = []
    for (const ch of (rawChapters || [])) {
      const rawLessons = await api.getLessons(ch.id)
      chapters.push({
        id: ch.id,
        code: `CHƯƠNG ${ch.order_index || ''}`.trim(),
        title: ch.title,
        lessons: (rawLessons || []).map(l => {
          const hwCount = state.homeworks.filter(h => h.lessonId === l.id).length
          return {
            id: l.id,
            code: `${ch.order_index || 1}.${l.order_index || 1}`,
            title: l.title,
            hwCount,
            refCount: 0
          }
        })
      })
    }

    // Add or Update in state.curriculums
    const existingIndex = state.curriculums.findIndex(c => c.classId === classId)
    if (existingIndex !== -1) {
      state.curriculums[existingIndex].chapters = chapters
    } else {
      state.curriculums.push({
        classId,
        chapters
      })
    }
  } catch (err) {
    console.error('Failed to load curriculum lazily:', err)
    showToast('Không thể tải chương trình học cho lớp này!', 'error')
  } finally {
    isLoadingCurriculum = false
    if (app) {
      app.innerHTML = renderCurriculumView()
      bindCurriculumEvents()
    }
  }
}

export function renderCurriculumView() {
  // If activeClassId is not in the list of classes, set it to the first class id
  if (state.classes.length > 0 && !state.classes.some(c => c.id === activeClassId)) {
    activeClassId = state.classes[0].id
  }

  const currentClass = state.classes.find(c => c.id === activeClassId) || {
    id: 'c1',
    name: 'Chưa có lớp học',
    studentsCount: 0
  }

  const currObj = state.curriculums?.find(c => c.classId === currentClass.id) || { chapters: [] }
  const chapters = currObj.chapters || []
  const totalLessons = chapters.reduce((acc, ch) => acc + (ch.lessons?.length || 0), 0)

  const classOptionsHTML = state.classes.map(c => `
    <option value="${c.id}" ${c.id === currentClass.id ? 'selected' : ''}>
      ${c.name}
    </option>
  `).join('')

  return `
    <div class="app-layout">
      ${renderSidebar('curriculum')}
      <div class="main-content">
        ${renderNavbar('Nền tảng / Bảng điều khiển')}
        <div class="content-body">
          <!-- Class Selector Header Bar -->
          <div class="card" style="margin-bottom:20px; padding:16px 20px; display:flex; justify-content:space-between; align-items:center;">
            <div style="display:flex; align-items:center; gap:12px;">
              <i class="fa-solid fa-graduation-cap" style="font-size:20px; color:#0066cc;"></i>
              <span style="font-weight:700; font-size:15px; color:#0f172a;">Chọn lớp học quản lý:</span>
            </div>
            <select id="curriculum-class-select" style="padding:10px 16px; border:2px solid #0066cc; border-radius:10px; font-weight:700; font-size:14px; color:#0066cc; outline:none; background:#ffffff; cursor:pointer; min-width:280px;">
              ${classOptionsHTML}
            </select>
          </div>

          <!-- Course Header Banner -->
          <div class="card" style="display:flex; justify-content:space-between; align-items:center; background:linear-gradient(135deg, #ffffff 0%, #f0f7ff 100%); margin-bottom:24px;">
            <div style="display:flex; align-items:center; gap:20px;">
              <div style="width:56px; height:56px; background:#0066cc; color:#ffffff; border-radius:14px; display:flex; align-items:center; justify-content:center; font-size:24px;">
                <i class="fa-solid fa-book-open"></i>
              </div>
              <div>
                <h1 class="page-title" style="font-size:22px;">${currentClass.name}</h1>
                <div style="font-size:13px; color:#64748b; margin-top:2px;">
                  <i class="fa-solid fa-users"></i> ${currentClass.studentsCount || 0} Học sinh
                </div>
              </div>
            </div>

            <div style="display:flex; gap:16px; text-align:center;">
              <div style="background:#e0f2fe; padding:10px 20px; border-radius:12px;">
                <div style="font-size:11px; font-weight:700; color:#0369a1; text-transform:uppercase;">Chương</div>
                <div style="font-family:var(--font-heading); font-size:22px; font-weight:700; color:#0284c7;">
                  ${isLoadingCurriculum ? '<i class="fa-solid fa-circle-notch fa-spin" style="font-size:16px;"></i>' : chapters.length}
                </div>
              </div>
              <div style="background:#e0f2fe; padding:10px 20px; border-radius:12px;">
                <div style="font-size:11px; font-weight:700; color:#0369a1; text-transform:uppercase;">Bài học</div>
                <div style="font-family:var(--font-heading); font-size:22px; font-weight:700; color:#0284c7;">
                  ${isLoadingCurriculum ? '<i class="fa-solid fa-circle-notch fa-spin" style="font-size:16px;"></i>' : totalLessons}
                </div>
              </div>
              <div style="background:#e0f2fe; padding:10px 20px; border-radius:12px;">
                <div style="font-size:11px; font-weight:700; color:#0369a1; text-transform:uppercase;">Tiến độ</div>
                <div style="font-family:var(--font-heading); font-size:22px; font-weight:700; color:#0284c7;">${currentClass.progress || 0}%</div>
              </div>
            </div>
          </div>

          <!-- Main Grid: Curriculum Plan + Sidebar Panels -->
          <div class="grid-3">
            <div style="grid-column: span 2;">
              <div class="page-header" style="margin-bottom:16px;">
                <h2 style="font-family:var(--font-heading); font-size:20px; font-weight:700;">Chương trình & Kế hoạch giảng dạy</h2>
                <button class="btn-primary" id="add-chapter-btn" style="width:auto; padding:8px 16px;">
                  <i class="fa-solid fa-plus"></i> Tạo chương mới
                </button>
              </div>

              <div id="chapters-container">
                ${isLoadingCurriculum ? `
                  <div class="card" style="text-align:center; padding:40px; color:#64748b;">
                    <i class="fa-solid fa-circle-notch fa-spin" style="font-size:32px; color:#0066cc; margin-bottom:12px;"></i>
                    <p style="font-weight:600;">Đang tải danh sách chương & bài học...</p>
                  </div>
                ` : (chapters.length === 0 ? `
                  <div class="card" style="text-align:center; padding:32px; color:#64748b;">
                    <i class="fa-solid fa-folder-open" style="font-size:36px; color:#94a3b8; margin-bottom:12px;"></i>
                    <p style="font-weight:600;">Chưa có chương học nào cho lớp học này.</p>
                    <p style="font-size:13px; margin-top:4px;">Nhấn nút "Tạo chương mới" ở trên để bắt đầu thêm bài học.</p>
                  </div>
                ` : chapters.map(ch => renderChapterCard(ch)).join(''))}
              </div>
            </div>

            <!-- Right Column Panels -->
            <div>
              <div class="card">
                <h3 style="font-family:var(--font-heading); font-size:16px; font-weight:700; margin-bottom:14px;">Thao tác nhanh</h3>
                <div style="display:flex; flex-direction:column; gap:10px;">
                  <button class="btn-secondary" style="justify-content:flex-start;" onclick="window.location.hash='#create-homework'"><i class="fa-solid fa-file-export"></i> Tạo bài tập mới</button>
                  <button class="btn-secondary" style="justify-content:flex-start;" onclick="alert('Tính năng nhập file Excel đang được phát triển')"><i class="fa-solid fa-file-import"></i> Nhập chương trình học</button>
                  <button class="btn-secondary" style="justify-content:flex-start;" onclick="window.print()"><i class="fa-solid fa-print"></i> Xuất đề cương học tập</button>
                </div>
              </div>

              <div class="card" style="text-align:center;">
                <h3 style="font-family:var(--font-heading); font-size:16px; font-weight:700; margin-bottom:14px;">Độ phủ đề cương</h3>
                <div style="width:100px; height:100px; border-radius:50%; border:8px solid #0066cc; border-right-color:#e2e8f0; border-bottom-color:#e2e8f0; display:flex; align-items:center; justify-content:center; margin:0 auto 12px auto; font-family:var(--font-heading); font-size:22px; font-weight:700; color:#0066cc;">
                  ${isLoadingCurriculum ? '<i class="fa-solid fa-circle-notch fa-spin" style="font-size:16px;"></i>' : (chapters.length > 0 ? `${Math.min(100, chapters.length * 25)}%` : '0%')}
                </div>
                <div style="font-size:13px; color:#64748b;">${chapters.length} Chương đang hoạt động</div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  `
}

function renderChapterCard(ch) {
  return `
    <div class="card" style="padding:18px; margin-bottom:16px;" id="chapter-card-${ch.id}">
      <div style="display:flex; justify-content:space-between; align-items:center;">
        <div>
          <span style="background:#e0f2fe; color:#0369a1; font-size:11px; font-weight:700; padding:2px 8px; border-radius:4px; text-transform:uppercase;">${ch.code || 'CHƯƠNG'}</span>
          <h3 style="font-size:17px; font-weight:700; color:#0f172a; margin-top:4px;">${ch.title}</h3>
          <div style="font-size:12px; color:#64748b;">${ch.lessons?.length || 0} Bài học</div>
        </div>
        <button class="btn-delete-chapter" data-id="${ch.id}" title="Xóa chương" style="background:none; border:none; color:#ef4444; cursor:pointer; font-size:16px;">
          <i class="fa-solid fa-trash"></i>
        </button>
      </div>

      <div style="margin-top:16px; padding-top:16px; border-top:1px solid #f1f5f9; display:flex; flex-direction:column; gap:12px;">
        ${(ch.lessons || []).map(l => {
          const lessonHomeworks = state.homeworks?.filter(h => h.lessonId === l.id) || []
          return `
            <div style="display:flex; flex-direction:column; padding:12px; background:#f8fafc; border:1px solid #e2e8f0; border-radius:10px; gap:8px;">
              <div style="display:flex; align-items:center; justify-content:space-between;">
                <div style="display:flex; align-items:center; gap:12px;">
                  <span style="width:28px; height:28px; background:#ffffff; border:1px solid #cbd5e1; border-radius:50%; display:flex; align-items:center; justify-content:center; font-size:12px; font-weight:700;">${l.code || '1.1'}</span>
                  <div>
                    <div style="font-weight:600; font-size:14px; color:#0f172a;">${l.title}</div>
                    <div style="font-size:12px; color:#64748b;">
                      <i class="fa-regular fa-file"></i> ${lessonHomeworks.length} Bài tập &nbsp;•&nbsp; 
                      <i class="fa-solid fa-paperclip"></i> ${l.refCount || 0} Tài liệu tham khảo
                    </div>
                  </div>
                </div>
                <button class="btn-secondary btn-edit-lesson" data-chapter-id="${ch.id}" data-lesson-id="${l.id}" style="padding:4px 10px; font-size:12px; cursor:pointer;"><i class="fa-solid fa-pen-to-square"></i> Sửa</button>
              </div>
              
              <!-- Homework list under this lesson -->
              ${lessonHomeworks.length > 0 ? `
                <div style="display:flex; flex-direction:column; gap:6px; margin-left:40px; padding-left:12px; border-left:2px solid #e2e8f0; margin-top:4px;">
                  ${lessonHomeworks.map(hw => `
                    <div style="display:flex; align-items:center; justify-content:space-between; padding:6px 12px; background:#ffffff; border:1px solid #e2e8f0; border-radius:8px;">
                      <div style="font-size:13px; font-weight:500; color:#475569;">
                        <i class="fa-solid fa-file-signature" style="color:#64748b; font-size:11px; margin-right:4px;"></i>
                        ${hw.title} <span style="font-size:11px; color:#94a3b8;">(${hw.durationMinutes || 45} phút)</span>
                      </div>
                      <button class="btn-secondary btn-edit-homework" data-id="${hw.id}" style="padding:2px 8px; font-size:11px; cursor:pointer; background:#f8fafc; border-color:#cbd5e1;">
                        <i class="fa-solid fa-wrench"></i> Sửa bài tập
                      </button>
                    </div>
                  `).join('')}
                </div>
              ` : ''}
            </div>
          `
        }).join('')}

        <div style="text-align:center; padding-top:4px;">
          <button class="btn-secondary btn-add-lesson" data-chapter-id="${ch.id}" style="font-size:12px; border:dashed 1px #cbd5e1; color:#0066cc;">
            <i class="fa-solid fa-plus"></i> Thêm bài học vào ${ch.title}
          </button>
        </div>
      </div>
    </div>
  `
}

export function bindCurriculumEvents() {
  bindSidebarEvents()

  // Trigger lazy load if not already loaded
  if (activeClassId && !isLoadingCurriculum && !state.curriculums.some(c => c.classId === activeClassId)) {
    ensureCurriculumLoaded(activeClassId)
  }

  const selectEl = document.getElementById('curriculum-class-select')
  if (selectEl) {
    selectEl.addEventListener('change', (e) => {
      activeClassId = e.target.value
      const app = document.getElementById('app')
      if (app) {
        app.innerHTML = renderCurriculumView()
        bindCurriculumEvents()
      }
    })
  }

  // Create Chapter Event
  document.getElementById('add-chapter-btn')?.addEventListener('click', () => {
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
          code: `CHƯƠNG ${orderIndex}`,
          title: createdChapter.title,
          lessons: []
        }

        currObj.chapters.push(newChapter)
        showToast(`Đã thêm thành công chương "${title}"!`, 'success')

        const app = document.getElementById('app')
        if (app) {
          app.innerHTML = renderCurriculumView()
          bindCurriculumEvents()
        }
        return true
      } catch (err) {
        showToast(`Tạo chương học thất bại: ${err.message}`, 'error')
        return false
      }
    })
  })

  // Add Lesson Event
  document.querySelectorAll('.btn-add-lesson').forEach(btn => {
    btn.addEventListener('click', () => {
      const chId = btn.getAttribute('data-chapter-id')
      const currObj = state.curriculums.find(c => c.classId === activeClassId)
      const ch = currObj?.chapters.find(c => c.id === chId)

      if (!ch) return

      const modalHTML = `
        <div style="display:flex; flex-direction:column; gap:14px;">
          <div>
            <label style="font-size:13px; font-weight:600; display:block; margin-bottom:6px;">Tên bài học <span style="color:#ef4444;">*</span></label>
            <input type="text" id="modal-lesson-title" class="form-input" placeholder="Ví dụ: Ôn tập đại số cơ bản" required>
          </div>
        </div>
      `

      openModal(`Thêm Bài Học Vào ${ch.title}`, modalHTML, async () => {
        const title = document.getElementById('modal-lesson-title')?.value.trim()
        if (!title) {
          showToast('Vui lòng nhập tên bài học!', 'error')
          return false
        }

        try {
          showToast('Đang tạo bài học...', 'info')
          const orderIndex = ch.lessons.length + 1
          const createdLesson = await api.createLesson({
            chapterId: chId,
            title,
            orderIndex
          })

          const chNum = ch.code.replace('CHƯƠNG', '').trim() || '1'
          ch.lessons.push({
            id: createdLesson.id,
            code: `${chNum}.${orderIndex}`,
            title: createdLesson.title,
            hwCount: 0,
            refCount: 0
          })

          showToast(`Đã thêm thành công bài học "${title}"!`, 'success')

          const app = document.getElementById('app')
          if (app) {
            app.innerHTML = renderCurriculumView()
            bindCurriculumEvents()
          }
          return true
        } catch (err) {
          showToast(`Thêm bài học thất bại: ${err.message}`, 'error')
          return false
        }
      })
    })
  })

  // Edit Lesson Event
  document.querySelectorAll('.btn-edit-lesson').forEach(btn => {
    btn.addEventListener('click', () => {
      const chId = btn.getAttribute('data-chapter-id')
      const lessonId = btn.getAttribute('data-lesson-id')
      const currObj = state.curriculums.find(c => c.classId === activeClassId)
      const ch = currObj?.chapters.find(c => c.id === chId)
      const lesson = ch?.lessons.find(l => l.id === lessonId)

      if (!lesson) return

      const modalHTML = `
        <div style="display:flex; flex-direction:column; gap:14px;">
          <div>
            <label style="font-size:13px; font-weight:600; display:block; margin-bottom:6px;">Tên bài học <span style="color:#ef4444;">*</span></label>
            <input type="text" id="modal-lesson-title" class="form-input" value="${lesson.title}" required>
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
          await api.updateLesson({
            lessonId,
            chapterId: chId,
            title,
            orderIndex: parseInt(lesson.code.split('.')[1], 10) || 1
          })

          lesson.title = title
          showToast('Cập nhật bài học thành công!', 'success')

          const app = document.getElementById('app')
          if (app) {
            app.innerHTML = renderCurriculumView()
            bindCurriculumEvents()
          }
          return true
        } catch (err) {
          showToast(`Cập nhật bài học thất bại: ${err.message}`, 'error')
          return false
        }
      })
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
              showToast('Đã xóa chương học', 'success')
              const app = document.getElementById('app')
              if (app) {
                app.innerHTML = renderCurriculumView()
                bindCurriculumEvents()
              }
            }
          })
        } catch (err) {
          showToast(`Xóa chương học thất bại: ${err.message}`, 'error')
        }
      }
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
}
