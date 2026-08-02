import { renderSidebar, bindSidebarEvents } from '../components/sidebar.js'
import { renderNavbar } from '../components/navbar.js'
import { showToast } from '../components/toast.js'
import { state } from '../state.js'
import { api } from '../api.js'

// In-memory state for building the answer matrix
let currentConfig = {
  mcCount: 12,  // Trắc nghiệm ABCD
  tfCount: 4,   // Trắc nghiệm Đúng/Sai (4 ý)
  saCount: 6   // Trả lời ngắn
}

// Store chosen answers:
// mcAnswers: { 1: 'A', 2: 'B', ... }
// tfAnswers: { 1: { a: true, b: true, c: false, d: true }, ... }
// saAnswers: { 1: '9.8', 2: '100', ... }
let mcAnswers = {}
let tfAnswers = {}
let saAnswers = {}

function initAnswersState() {
  mcAnswers = {}
  for (let i = 1; i <= currentConfig.mcCount; i++) {
    mcAnswers[i] = 'A'
  }

  tfAnswers = {}
  for (let i = 1; i <= currentConfig.tfCount; i++) {
    const actualQNum = currentConfig.mcCount + i
    tfAnswers[actualQNum] = { a: true, b: true, c: false, d: true }
  }

  saAnswers = {}
  for (let i = 1; i <= currentConfig.saCount; i++) {
    const actualQNum = currentConfig.mcCount + currentConfig.tfCount + i
    saAnswers[actualQNum] = ''
  }
}

// Initial call
initAnswersState()

export function renderCreateHwView() {
  const isEdit = !!state.editHomeworkData
  const hw = isEdit ? state.editHomeworkData.homework : null
  const questions = isEdit ? (state.editHomeworkData.questions || []) : []

  let deadlineVal = ''
  if (isEdit && hw && (hw.deadline || hw.deadline_at)) {
    const d = new Date(hw.deadline || hw.deadline_at)
    if (!isNaN(d.getTime())) {
      const year = d.getFullYear()
      const month = String(d.getMonth() + 1).padStart(2, '0')
      const day = String(d.getDate()).padStart(2, '0')
      const hours = String(d.getHours()).padStart(2, '0')
      const minutes = String(d.getMinutes()).padStart(2, '0')
      deadlineVal = `${year}-${month}-${day}T${hours}:${minutes}`
    }
  }

  if (isEdit && hw && questions.length > 0) {
    if (currentConfig.editingHomeworkId !== hw.id) {
      currentConfig.editingHomeworkId = hw.id

      const mcQ = questions.filter(q => q.question_type === 'MULTIPLE_CHOICE')
      const tfQ = questions.filter(q => q.question_type === 'TRUE_FALSE')
      const saQ = questions.filter(q => q.question_type === 'SHORT_ANSWER')

      currentConfig.mcCount = mcQ.length
      currentConfig.tfCount = tfQ.length
      currentConfig.saCount = saQ.length

      mcAnswers = {}
      mcQ.forEach(q => {
        mcAnswers[q.question_number] = q.answerKey?.mc_answer || 'A'
      })

      tfAnswers = {}
      tfQ.forEach(q => {
        const val = q.answerKey?.tf_answers || {}
        const a = val.a !== undefined ? val.a : (val.s1 !== undefined ? val.s1 : true)
        const b = val.b !== undefined ? val.b : (val.s2 !== undefined ? val.s2 : true)
        const c = val.c !== undefined ? val.c : (val.s3 !== undefined ? val.s3 : false)
        const d = val.d !== undefined ? val.d : (val.s4 !== undefined ? val.s4 : true)
        tfAnswers[q.question_number] = { a, b, c, d }
      })

      saAnswers = {}
      saQ.forEach(q => {
        saAnswers[q.question_number] = q.answerKey?.sa_answer !== undefined && q.answerKey?.sa_answer !== null ? String(q.answerKey.sa_answer) : ''
      })
    }
  } else if (!isEdit) {
    if (currentConfig.editingHomeworkId) {
      currentConfig.editingHomeworkId = null
      currentConfig.mcCount = 10
      currentConfig.tfCount = 4
      currentConfig.saCount = 2
      initAnswersState()
    }
  }

  const classOptions = state.classes.map(c => {
    const isSel = isEdit && (hw.classId === c.id || hw.class_id === c.id)
    return `<option value="${c.id}" ${isSel ? 'selected' : ''}>${c.name}</option>`
  }).join('')

  return `
    <div class="app-layout">
      ${renderSidebar('create-homework')}
      <div class="main-content">
        ${renderNavbar(isEdit ? 'Quản trị / Sửa bài tập' : 'Quản trị / Tạo bài tập')}
        <div class="content-body" style="padding: 16px 24px;">
          <div class="split-homework-layout">
            
            <!-- LEFT COLUMN: PDF VIEWER & UPLOAD (60%) -->
            <div class="pdf-viewer-container" style="box-shadow: 0 4px 12px rgba(0,0,0,0.05); border:1px solid #cbd5e1; display:flex; flex-direction:column; overflow:hidden;">
              <div class="pdf-toolbar" style="display:flex; justify-content:space-between; align-items:center;">
                <div style="font-weight:700; color:#0f172a; display:flex; align-items:center; gap:8px;">
                  <i class="fa-solid fa-file-pdf" style="color:#ef4444; font-size:18px;"></i>
                  <span id="pdf-viewer-title">${hw?.pdfPath || 'Chưa chọn file PDF'}</span>
                </div>
                <div>
                  <input type="file" id="hw-pdf-file" accept=".pdf" style="display:none;">
                  <button class="btn-primary" type="button" onclick="document.getElementById('hw-pdf-file').click()" style="padding:6px 12px; font-size:12px; height:auto; line-height:1; display:flex; align-items:center; gap:4px; cursor:pointer;">
                    <i class="fa-solid fa-upload"></i> Chọn file PDF
                  </button>
                </div>
              </div>

              <!-- PDF Iframe Preview / Placeholder -->
              <div id="pdf-preview-container" style="flex-grow:1; display:flex; height:calc(100vh - 180px); background:#f8fafc; border:1px dashed #cbd5e1; border-radius:8px; justify-content:center; align-items:center; overflow:hidden; position:relative;">
                <iframe id="pdf-preview-iframe" src="${isEdit && hw?.pdfUrl ? hw.pdfUrl.replace(/https?:\/\/kong:8000/g, import.meta.env.VITE_SUPABASE_URL || 'http://localhost:54321') : ''}" style="width:100%; height:100%; border:none; background:#f8fafc; ${isEdit && hw?.pdfUrl ? '' : 'display:none;'}"></iframe>
                ${!(isEdit && hw?.pdfUrl) ? `
                  <div id="pdf-placeholder" style="color:#64748b; text-align:center; padding:20px;">
                    <i class="fa-regular fa-file-pdf" style="font-size:48px; color:#cbd5e1; margin-bottom:12px; display:block;"></i>
                    <span style="font-size:13px;">Vui lòng chọn file đề bài PDF để xem trước</span>
                  </div>
                ` : ''}
              </div>
            </div>

            <!-- RIGHT COLUMN: CONFIG & ANSWER KEY MATRIX (40%) -->
            <div class="question-column" style="overflow-y:auto; max-height:calc(100vh - 120px); display:flex; flex-direction:column; gap:20px; padding-right:4px;">
              
              <!-- General Homework Info Card -->
              <div class="card" style="margin:0; padding:16px;">
                <h3 style="font-family:var(--font-heading); font-size:16px; font-weight:700; margin-bottom:12px; display:flex; align-items:center; gap:8px;">
                  <i class="fa-regular fa-clipboard" style="color:#0066cc;"></i> Thông tin bài tập
                </h3>

                <div style="display:flex; flex-direction:column; gap:12px;">
                  <div>
                    <label style="font-size:12px; font-weight:600; display:block; margin-bottom:4px;">Tên bài tập <span style="color:#ef4444;">*</span></label>
                    <input type="text" id="hw-title" class="form-input" placeholder="Ví dụ: Kiểm tra Chương 3..." value="${isEdit ? hw.title : ''}" style="padding:8px 12px; font-size:13px;">
                  </div>

                  <div style="display:grid; grid-template-columns:1fr 1fr 1fr; gap:10px;">
                    <div>
                      <label style="font-size:12px; font-weight:600; display:block; margin-bottom:4px;">Chọn lớp học <span style="color:#ef4444;">*</span></label>
                      <select id="hw-class-select" class="form-input" style="background:#ffffff; cursor:pointer; padding:8px 12px; font-size:13px;">
                        ${classOptions}
                      </select>
                    </div>
                    <div>
                      <label style="font-size:12px; font-weight:600; display:block; margin-bottom:4px;">Chọn chương <span style="color:#ef4444;">*</span></label>
                      <select id="hw-chapter-select" class="form-input" style="background:#ffffff; cursor:pointer; padding:8px 12px; font-size:13px;">
                        <option value="">Đang tải chương...</option>
                      </select>
                    </div>
                    <div>
                      <label style="font-size:12px; font-weight:600; display:block; margin-bottom:4px;">Chọn bài học <span style="color:#ef4444;">*</span></label>
                      <select id="hw-lesson-select" class="form-input" style="background:#ffffff; cursor:pointer; padding:8px 12px; font-size:13px;">
                        <option value="">Chọn chương trước...</option>
                      </select>
                    </div>
                  </div>

                  <div style="display:grid; grid-template-columns:1fr 1fr; gap:10px;">
                    <div>
                      <label style="font-size:12px; font-weight:600; display:block; margin-bottom:4px;">Thời gian làm bài (Phút)</label>
                      <input type="number" id="hw-duration" class="form-input" value="${isEdit ? hw.durationMinutes || 45 : 45}" min="5" style="padding:8px 12px; font-size:13px;">
                    </div>
                    <div>
                      <label style="font-size:12px; font-weight:600; display:block; margin-bottom:4px;">Số lần làm tối đa (0 = Không giới hạn)</label>
                      <input type="number" id="hw-max-attempts" class="form-input" value="${isEdit && hw.maxAttempts !== undefined && hw.maxAttempts !== null ? hw.maxAttempts : (isEdit && hw.max_attempts !== undefined && hw.max_attempts !== null ? hw.max_attempts : 0)}" min="0" style="padding:8px 12px; font-size:13px;">
                    </div>
                  </div>

                  <div style="display:grid; grid-template-columns:1fr 1fr; gap:10px;">
                    <div>
                      <label style="font-size:12px; font-weight:600; display:block; margin-bottom:4px;">Hạn chót nộp bài (Deadline)</label>
                      <input type="datetime-local" id="hw-deadline" class="form-input" value="${deadlineVal}" style="padding:8px 12px; font-size:13px; background:#ffffff;">
                    </div>
                    <div style="display:flex; align-items:flex-end;">
                      <button class="btn-primary" id="save-homework-btn" style="width:100%; padding:9px 12px; font-size:13px; cursor:pointer; height:38px;">
                        <i class="fa-solid fa-cloud-arrow-up"></i> ${isEdit ? 'Cập nhật bài tập' : 'Lưu & Xuất bản'}
                      </button>
                    </div>
                  </div>
                </div>
              </div>

              <!-- Config Section: Select Quantities for 3 Question Types -->
              <div class="card" style="border:2px solid #e0f2fe; background:#fafdfm; margin:0; padding:12px 16px;">
                <h3 style="font-family:var(--font-heading); font-size:14px; font-weight:700; color:#0369a1; margin-bottom:10px; display:flex; align-items:center; gap:8px;">
                  <i class="fa-solid fa-sliders"></i> Cấu hình số lượng câu hỏi
                </h3>
                
                <div style="display:grid; grid-template-columns:1fr 1fr 1fr; gap:8px; margin-bottom:12px;">
                  <div style="background:#ffffff; padding:8px; border:1px solid #e2e8f0; border-radius:8px;">
                    <label style="font-size:11px; font-weight:700; color:#0f172a; display:block; margin-bottom:4px; text-align:center;">
                      T.Nghiệm ABCD
                    </label>
                    <input type="number" id="cfg-mc-count" class="form-input" value="${currentConfig.mcCount}" min="0" max="100" style="font-weight:700; text-align:center; padding:4px; font-size:12px;">
                  </div>

                  <div style="background:#ffffff; padding:8px; border:1px solid #e2e8f0; border-radius:8px;">
                    <label style="font-size:11px; font-weight:700; color:#0f172a; display:block; margin-bottom:4px; text-align:center;">
                      Đúng / Sai
                    </label>
                    <input type="number" id="cfg-tf-count" class="form-input" value="${currentConfig.tfCount}" min="0" max="50" style="font-weight:700; text-align:center; padding:4px; font-size:12px;">
                  </div>

                  <div style="background:#ffffff; padding:8px; border:1px solid #e2e8f0; border-radius:8px;">
                    <label style="font-size:11px; font-weight:700; color:#0f172a; display:block; margin-bottom:4px; text-align:center;">
                      Trả lời ngắn
                    </label>
                    <input type="number" id="cfg-sa-count" class="form-input" value="${currentConfig.saCount}" min="0" max="50" style="font-weight:700; text-align:center; padding:4px; font-size:12px;">
                  </div>
                </div>

                <button class="btn-primary" id="update-config-btn" style="width:100%; padding:8px 12px; font-size:12px; background:#0066cc; cursor:pointer;">
                  <i class="fa-solid fa-arrows-rotate"></i> Cập nhật số lượng câu hỏi
                </button>
              </div>

              <!-- Answer Key Matrix Section -->
              <div id="answer-matrix-container" style="display:flex; flex-direction:column; gap:16px;">
                ${renderAnswerMatrix()}
              </div>
            </div>

          </div>
        </div>
      </div>
    </div>
  `
}

function renderAnswerMatrix() {
  return `
    <!-- PART 1: Multiple Choice ABCD -->
    <div class="card" style="margin:0; padding:16px;">
      <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:12px; padding-bottom:8px; border-bottom:1px solid #f1f5f9;">
        <h3 style="font-family:var(--font-heading); font-size:15px; font-weight:700; color:#0f172a;">
          <span style="background:#0066cc; color:#ffffff; padding:3px 8px; border-radius:6px; font-size:12px; margin-right:6px;">Phần I</span>
          Trắc nghiệm A/B/C/D (${currentConfig.mcCount} Câu)
        </h3>
      </div>

      ${currentConfig.mcCount === 0 ? `
        <div style="font-size:12px; color:#94a3b8; text-align:center; padding:8px;">Không có câu hỏi Trắc nghiệm ABCD.</div>
      ` : `
        <div style="display:flex; flex-direction:column; gap:8px;">
          ${Array.from({ length: currentConfig.mcCount }, (_, i) => i + 1).map(qNum => {
            const selected = mcAnswers[qNum] || 'A'
            return `
              <div style="display:flex; align-items:center; justify-content:space-between; padding:8px 12px; background:#f8fafc; border:1px solid #e2e8f0; border-radius:10px;">
                <span style="font-weight:700; font-size:13px; color:#334155; width:54px;">Câu ${qNum}</span>
                <div style="display:flex; gap:6px;">
                  ${['A', 'B', 'C', 'D'].map(opt => `
                    <button type="button" class="mc-option-btn ${selected === opt ? 'active' : ''}" data-qnum="${qNum}" data-option="${opt}" style="
                      width:30px; height:30px; border-radius:6px; border:1px solid ${selected === opt ? '#0066cc' : '#cbd5e1'};
                      background:${selected === opt ? '#0066cc' : '#ffffff'};
                      color:${selected === opt ? '#ffffff' : '#334155'};
                      font-weight:700; font-size:12px; cursor:pointer; transition:all 0.15s ease;
                    ">${opt}</button>
                  `).join('')}
                </div>
              </div>
            `
          }).join('')}
        </div>
      `}
    </div>

    <!-- PART 2: True / False -->
    <div class="card" style="margin:0; padding:16px;">
      <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:12px; padding-bottom:8px; border-bottom:1px solid #f1f5f9;">
        <h3 style="font-family:var(--font-heading); font-size:15px; font-weight:700; color:#0f172a;">
          <span style="background:#0284c7; color:#ffffff; padding:3px 8px; border-radius:6px; font-size:12px; margin-right:6px;">Phần II</span>
          Đúng / Sai (${currentConfig.tfCount} Câu)
        </h3>
      </div>

      ${currentConfig.tfCount === 0 ? `
        <div style="font-size:12px; color:#94a3b8; text-align:center; padding:8px;">Không có câu hỏi Đúng / Sai.</div>
      ` : `
        <div style="display:flex; flex-direction:column; gap:12px;">
          ${Array.from({ length: currentConfig.tfCount }, (_, i) => i + 1).map(index => {
            const actualQNum = currentConfig.mcCount + index
            const tfObj = tfAnswers[actualQNum] || { a: true, b: true, c: false, d: true }
            return `
              <div style="background:#f8fafc; border:1px solid #e2e8f0; border-radius:10px; padding:10px;">
                <div style="font-weight:700; font-size:13px; color:#0f172a; margin-bottom:8px;">Câu ${actualQNum}</div>
                <div style="display:grid; grid-template-columns:1fr 1fr; gap:6px;">
                  ${['a', 'b', 'c', 'd'].map(sub => {
                    const isTrue = tfObj[sub] !== false
                    return `
                      <div style="display:flex; align-items:center; justify-content:space-between; background:#ffffff; padding:4px 8px; border-radius:6px; border:1px solid #e2e8f0; font-size:12px;">
                        <span style="font-weight:700; color:#475569;">${sub})</span>
                        <div style="display:flex; gap:4px;">
                          <button type="button" class="tf-option-btn ${isTrue ? 'active-true' : ''}" data-qnum="${actualQNum}" data-sub="${sub}" data-val="true" style="
                            padding:2px 8px; border-radius:4px; font-weight:700; font-size:11px; cursor:pointer;
                            border:1px solid ${isTrue ? '#16a34a' : '#cbd5e1'};
                            background:${isTrue ? '#16a34a' : '#ffffff'};
                            color:${isTrue ? '#ffffff' : '#475569'};
                          ">Đ</button>
                          <button type="button" class="tf-option-btn ${!isTrue ? 'active-false' : ''}" data-qnum="${actualQNum}" data-sub="${sub}" data-val="false" style="
                            padding:2px 8px; border-radius:4px; font-weight:700; font-size:11px; cursor:pointer;
                            border:1px solid ${!isTrue ? '#dc2626' : '#cbd5e1'};
                            background:${!isTrue ? '#dc2626' : '#ffffff'};
                            color:${!isTrue ? '#ffffff' : '#475569'};
                          ">S</button>
                        </div>
                      </div>
                    `
                  }).join('')}
                </div>
              </div>
            `
          }).join('')}
        </div>
      `}
    </div>

    <!-- PART 3: Short Answer -->
    <div class="card" style="margin:0; padding:16px;">
      <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:12px; padding-bottom:8px; border-bottom:1px solid #f1f5f9;">
        <h3 style="font-family:var(--font-heading); font-size:15px; font-weight:700; color:#0f172a;">
          <span style="background:#059669; color:#ffffff; padding:3px 8px; border-radius:6px; font-size:12px; margin-right:6px;">Phần III</span>
          Trả lời ngắn (${currentConfig.saCount} Câu)
        </h3>
      </div>

      ${currentConfig.saCount === 0 ? `
        <div style="font-size:12px; color:#94a3b8; text-align:center; padding:8px;">Không có câu hỏi Trả lời ngắn.</div>
      ` : `
        <div style="display:flex; flex-direction:column; gap:8px;">
          ${Array.from({ length: currentConfig.saCount }, (_, i) => i + 1).map(index => {
            const actualQNum = currentConfig.mcCount + currentConfig.tfCount + index
            const val = saAnswers[actualQNum] || ''
            return `
              <div style="display:flex; align-items:center; justify-content:space-between; padding:8px 12px; background:#f8fafc; border:1px solid #e2e8f0; border-radius:10px;">
                <span style="font-weight:700; font-size:13px; color:#334155; width:54px;">Câu ${actualQNum}</span>
                <input type="text" class="form-input sa-input" data-qnum="${actualQNum}" value="${val}" placeholder="Nhập đáp án chuẩn..." style="padding:6px 10px; font-size:13px; background:#ffffff;">
              </div>
            `
          }).join('')}
        </div>
      `}
    </div>
  `
}

export function bindCreateHwEvents() {
  bindSidebarEvents()

  // PDF Preview pre-load if in Edit Mode
  const isEditMode = !!state.editHomeworkData
  const hwData = state.editHomeworkData
  if (isEditMode && hwData?.homework?.pdfUrl) {
    const iframe = document.getElementById('pdf-preview-iframe')
    const container = document.getElementById('pdf-preview-container')
    const placeholder = document.getElementById('pdf-placeholder')
    const titleSpan = document.getElementById('pdf-viewer-title')
    
    if (iframe && container) {
      const mappedUrl = hwData.homework.pdfUrl.replace(/https?:\/\/kong:8000/g, import.meta.env.VITE_SUPABASE_URL || 'http://localhost:54321')
      if (!iframe.src || iframe.src === 'about:blank' || iframe.src === window.location.href) {
        iframe.src = mappedUrl
      }
      iframe.style.display = 'block'
      if (placeholder) placeholder.style.display = 'none'
      if (titleSpan) titleSpan.textContent = hwData.homework.pdfPath || 'Homework_Attachment.pdf'
    }
  }

  // PDF Preview file change listener
  const fileInput = document.getElementById('hw-pdf-file')
  fileInput?.addEventListener('change', (e) => {
    const file = e.target.files[0]
    const iframe = document.getElementById('pdf-preview-iframe')
    const placeholder = document.getElementById('pdf-placeholder')
    const titleSpan = document.getElementById('pdf-viewer-title')

    if (file && file.type === 'application/pdf') {
      const fileURL = URL.createObjectURL(file)
      if (iframe) {
        iframe.src = fileURL
        iframe.style.display = 'block'
      }
      if (placeholder) placeholder.style.display = 'none'
      if (titleSpan) titleSpan.textContent = file.name
    } else {
      if (iframe) iframe.style.display = 'none'
      if (placeholder) placeholder.style.display = 'block'
      if (titleSpan) titleSpan.textContent = 'Chưa chọn file PDF'
    }
  })

  // Dynamic class -> chapter -> lesson dropdown loader
  const classSelect = document.getElementById('hw-class-select')
  const chapterSelect = document.getElementById('hw-chapter-select')
  const lessonSelect = document.getElementById('hw-lesson-select')

  const updateChaptersDropdown = async (targetChapterId = null, targetLessonId = null) => {
    const classId = classSelect?.value
    if (!classId) return

    if (chapterSelect) {
      chapterSelect.innerHTML = '<option value="">Đang tải chương...</option>'
    }
    if (lessonSelect) {
      lessonSelect.innerHTML = '<option value="">Chọn chương trước...</option>'
    }

    try {
      const chapters = await api.getChapters(classId)
      let chOptions = '<option value="">-- Chọn chương --</option>'
      
      const isEdit = !!state.editHomeworkData
      const hw = isEdit ? state.editHomeworkData.homework : null
      const editChapterId = targetChapterId || (hw ? (hw.chapterId || hw.chapter_id) : null)
      const editLessonId = targetLessonId || (hw ? (hw.lessonId || hw.lesson_id) : null)

      let selectedChId = ''
      for (const ch of (chapters || [])) {
        const isSel = editChapterId === ch.id
        if (isSel) selectedChId = ch.id
        chOptions += `<option value="${ch.id}" ${isSel ? 'selected' : ''}>${ch.title}</option>`
      }

      if (chapterSelect) {
        chapterSelect.innerHTML = chOptions
      }

      // If we have a pre-selected chapter
      if (selectedChId) {
        await updateLessonsDropdown(selectedChId, editLessonId)
      } else if (!isEdit && chapters && chapters.length === 1) {
        chapterSelect.value = chapters[0].id
        await updateLessonsDropdown(chapters[0].id, null)
      }
    } catch (e) {
      if (chapterSelect) {
        chapterSelect.innerHTML = '<option value="">Lỗi khi tải chương</option>'
      }
    }
  }

  const updateLessonsDropdown = async (chapterId, targetLessonId = null) => {
    if (!chapterId) {
      if (lessonSelect) {
        lessonSelect.innerHTML = '<option value="">Chọn chương trước...</option>'
      }
      return
    }

    if (lessonSelect) {
      lessonSelect.innerHTML = '<option value="">Đang tải bài học...</option>'
    }

    try {
      const lessons = await api.getLessons(chapterId)
      let lOptions = '<option value="">-- Chọn bài học --</option>'

      const isEdit = !!state.editHomeworkData
      const hw = isEdit ? state.editHomeworkData.homework : null
      const editLessonId = targetLessonId || (hw ? (hw.lessonId || hw.lesson_id) : null)

      for (const l of (lessons || [])) {
        const isSel = editLessonId === l.id ? 'selected' : ''
        lOptions += `<option value="${l.id}" ${isSel}>${l.title}</option>`
      }

      if (lessonSelect) {
        lessonSelect.innerHTML = lOptions || '<option value="">Chưa có bài học nào</option>'
      }
    } catch (e) {
      if (lessonSelect) {
        lessonSelect.innerHTML = '<option value="">Lỗi khi tải bài học</option>'
      }
    }
  }

  classSelect?.addEventListener('change', () => {
    updateChaptersDropdown()
  })

  chapterSelect?.addEventListener('change', (e) => {
    updateLessonsDropdown(e.target.value)
  })

  // Trigger initial dropdown load
  const isEdit = !!state.editHomeworkData
  const hw = isEdit ? state.editHomeworkData.homework : null

  const initDropdowns = async () => {
    let initialChapterId = hw ? (hw.chapterId || hw.chapter_id) : null
    let initialLessonId = hw ? (hw.lessonId || hw.lesson_id) : null
    let initialClassId = hw ? (hw.classId || hw.class_id) : null

    // Fallback lookup: resolve IDs via matching names if they are not provided by edge function response
    if (isEdit && hw && (!initialChapterId || !initialLessonId || !initialClassId)) {
      for (const cls of state.classes) {
        try {
          const chapters = await api.getChapters(cls.id)
          for (const ch of (chapters || [])) {
            if (ch.title === hw.chapterTitle) {
              const lessons = await api.getLessons(ch.id)
              for (const l of (lessons || [])) {
                if (l.title === hw.lessonTitle) {
                  initialClassId = cls.id
                  initialChapterId = ch.id
                  initialLessonId = l.id
                  break
                }
              }
            }
            if (initialLessonId) break
          }
        } catch (e) {
          console.error('[CreateHW] Fallback matching failed:', e)
        }
        if (initialLessonId) break
      }
    }

    if (initialClassId && classSelect) {
      classSelect.value = initialClassId
    }
    await updateChaptersDropdown(initialChapterId, initialLessonId)
  }

  initDropdowns()

  // Handler for updating question counts config
  const updateConfig = () => {
    const mcVal = parseInt(document.getElementById('cfg-mc-count')?.value || '0', 10)
    const tfVal = parseInt(document.getElementById('cfg-tf-count')?.value || '0', 10)
    const saVal = parseInt(document.getElementById('cfg-sa-count')?.value || '0', 10)

    currentConfig.mcCount = Math.max(0, mcVal)
    currentConfig.tfCount = Math.max(0, tfVal)
    currentConfig.saCount = Math.max(0, saVal)

    // Re-init state for new question indices if needed
    for (let i = 1; i <= currentConfig.mcCount; i++) {
      if (!mcAnswers[i]) mcAnswers[i] = 'A'
    }
    for (let i = 1; i <= currentConfig.tfCount; i++) {
      const actualQNum = currentConfig.mcCount + i
      if (!tfAnswers[actualQNum]) tfAnswers[actualQNum] = { a: true, b: true, c: false, d: true }
    }
    for (let i = 1; i <= currentConfig.saCount; i++) {
      const actualQNum = currentConfig.mcCount + currentConfig.tfCount + i
      if (saAnswers[actualQNum] === undefined) saAnswers[actualQNum] = ''
    }

    const container = document.getElementById('answer-matrix-container')
    if (container) {
      container.innerHTML = renderAnswerMatrix()
      bindMatrixEvents()
    }
  }

  document.getElementById('update-config-btn')?.addEventListener('click', () => {
    updateConfig()
    showToast('Đã cập nhật số lượng câu hỏi và bảng đáp án!', 'info')
  })

  bindMatrixEvents()

  // Save Homework Event
  document.getElementById('save-homework-btn')?.addEventListener('click', async () => {
    const title = document.getElementById('hw-title')?.value.trim()
    const classId = document.getElementById('hw-class-select')?.value
    const lessonId = document.getElementById('hw-lesson-select')?.value
    const duration = parseInt(document.getElementById('hw-duration')?.value || '45', 10)
    const deadlineRaw = document.getElementById('hw-deadline')?.value
    const maxAttemptsVal = parseInt(document.getElementById('hw-max-attempts')?.value || '0', 10)

    const deadline = deadlineRaw ? new Date(deadlineRaw).toISOString() : null
    const maxAttempts = maxAttemptsVal > 0 ? maxAttemptsVal : null

    if (!title) {
      showToast('Vui lòng nhập tên bài tập!', 'error')
      return
    }

    if (!lessonId) {
      showToast('Vui lòng chọn bài học cho bài tập này!', 'error')
      return
    }

    const totalQuestions = currentConfig.mcCount + currentConfig.tfCount + currentConfig.saCount
    if (totalQuestions === 0) {
      showToast('Bài tập phải có ít nhất 1 câu hỏi!', 'error')
      return
    }

    // Build questions list
    const questions = []
    let globalIndex = 1

    // Part I: MC
    for (let i = 1; i <= currentConfig.mcCount; i++) {
      questions.push({
        id: `q_${globalIndex}`,
        questionNumber: globalIndex,
        questionType: 'MULTIPLE_CHOICE',
        mcAnswer: mcAnswers[globalIndex] || 'A',
        points: 1.0
      })
      globalIndex++
    }

    // Part II: TF
    for (let i = 1; i <= currentConfig.tfCount; i++) {
      questions.push({
        id: `q_${globalIndex}`,
        questionNumber: globalIndex,
        questionType: 'TRUE_FALSE',
        tfAnswers: tfAnswers[globalIndex] || { a: true, b: true, c: false, d: true },
        points: 1.0
      })
      globalIndex++
    }

    // Part III: SA
    for (let i = 1; i <= currentConfig.saCount; i++) {
      questions.push({
        id: `q_${globalIndex}`,
        questionNumber: globalIndex,
        questionType: 'SHORT_ANSWER',
        saAnswer: saAnswers[globalIndex] || '',
        points: 1.0
      })
      globalIndex++
    }

    const isEdit = !!state.editHomeworkData
    const hw = isEdit ? state.editHomeworkData.homework : null

    const fileInput = document.getElementById('hw-pdf-file')
    const file = fileInput?.files[0]
    let pdfPath = hw ? (hw.pdfPath || hw.pdf_path || 'Homework_Attachment.pdf') : 'Homework_Attachment.pdf'

    try {
      if (file) {
        const sanitizedName = file.name.replace(/[^a-zA-Z0-9.]/g, '_')
        const isSameFile = hw && (hw.pdfPath || hw.pdf_path) && (hw.pdfPath || hw.pdf_path).endsWith(sanitizedName)
        if (!isSameFile) {
          showToast('Đang tải file PDF mới lên kho lưu trữ...', 'info')
          pdfPath = await api.uploadFile(file)
        } else {
          console.log('[CreateHw] File name is identical to existing. Skipping upload.')
        }
      }

      if (isEdit && hw) {
        showToast('Đang cập nhật bài tập...', 'info')
        await api.updateHomework({
          homeworkId: hw.id,
          lessonId,
          title,
          pdfPath,
          durationMinutes: duration,
          passScore: hw.passScore || hw.pass_score || 5.0,
          maxScore: hw.maxScore || hw.max_score || 10.0,
          isPublished: hw.isPublished !== false,
          questions,
          deadline,
          maxAttempts
        })
        showToast(`Đã cập nhật bài tập "${title}" thành công!`, 'success')
        window.location.hash = '#curriculum'
      } else {
        showToast('Đang lưu cấu hình bài tập...', 'info')
        await api.createHomework({
          lessonId,
          title,
          pdfPath,
          durationMinutes: duration,
          passScore: 5.0,
          maxScore: 10.0,
          isPublished: true,
          questions,
          deadline,
          maxAttempts
        })
        showToast(`Đã xuất bản bài tập "${title}" thành công!`, 'success')
        window.location.hash = '#curriculum'
      }
    } catch (err) {
      showToast(`Lưu bài tập thất bại: ${err.message}`, 'error')
    }
  })
}

function bindMatrixEvents() {
  // MC click selection
  document.querySelectorAll('.mc-option-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      const qNum = parseInt(btn.getAttribute('data-qnum'), 10)
      const opt = btn.getAttribute('data-option')
      mcAnswers[qNum] = opt

      // Update active UI for this qNum
      document.querySelectorAll(`.mc-option-btn[data-qnum="${qNum}"]`).forEach(b => {
        const isCurrent = b.getAttribute('data-option') === opt
        b.style.background = isCurrent ? '#0066cc' : '#ffffff'
        b.style.color = isCurrent ? '#ffffff' : '#334155'
        b.style.borderColor = isCurrent ? '#0066cc' : '#cbd5e1'
      })
    })
  })

  // TF click selection
  document.querySelectorAll('.tf-option-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      const qNum = parseInt(btn.getAttribute('data-qnum'), 10)
      const sub = btn.getAttribute('data-sub')
      const val = btn.getAttribute('data-val') === 'true'

      if (!tfAnswers[qNum]) tfAnswers[qNum] = { a: true, b: true, c: false, d: true }
      tfAnswers[qNum][sub] = val

      // Update UI for this sub item
      const parent = btn.parentElement
      if (parent) {
        parent.querySelectorAll('.tf-option-btn').forEach(b => {
          const isVal = b.getAttribute('data-val') === (val ? 'true' : 'false')
          if (isVal) {
            b.style.background = val ? '#16a34a' : '#dc2626'
            b.style.color = '#ffffff'
            b.style.borderColor = val ? '#16a34a' : '#dc2626'
          } else {
            b.style.background = '#ffffff'
            b.style.color = '#475569'
            b.style.borderColor = '#cbd5e1'
          }
        })
      }
    })
  })

  // Short answer inputs change
  document.querySelectorAll('.sa-input').forEach(input => {
    input.addEventListener('input', (e) => {
      const qNum = parseInt(input.getAttribute('data-qnum'), 10)
      saAnswers[qNum] = e.target.value
    })
  })
}
