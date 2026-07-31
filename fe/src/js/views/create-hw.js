import { renderSidebar, bindSidebarEvents } from '../components/sidebar.js'
import { renderNavbar } from '../components/navbar.js'
import { showToast } from '../components/toast.js'
import { state } from '../state.js'
import { api } from '../api.js'

// In-memory state for building the answer matrix
let currentConfig = {
  mcCount: 10,  // Trắc nghiệm ABCD
  tfCount: 4,   // Trắc nghiệm Đúng/Sai (4 ý)
  saCount: 2    // Trả lời ngắn
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
    const isSel = isEdit && hw.classId === c.id
    return `<option value="${c.id}" ${isSel ? 'selected' : ''}>${c.name}</option>`
  }).join('')

  return `
    <div class="app-layout">
      ${renderSidebar('create-homework')}
      <div class="main-content">
        ${renderNavbar(isEdit ? 'Quản trị / Sửa bài tập' : 'Quản trị / Tạo bài tập')}
        <div class="content-body">
          <div class="page-header">
            <div>
              <h1 class="page-title">${isEdit ? 'Chỉnh sửa bài tập' : 'Tạo bài tập về nhà mới'}</h1>
              <p class="page-description">${isEdit ? 'Cập nhật đề bài PDF, thời gian làm bài, cấu hình số lượng câu hỏi và đáp án chi tiết.' : 'Cấu hình số lượng câu hỏi và nhập đáp án chuẩn cho 3 loại bài tập (Trắc nghiệm ABCD, Đúng/Sai 4 ý, Trả lời ngắn).'}</p>
            </div>
            <button class="btn-primary" id="save-homework-btn" style="width:auto;">
              <i class="fa-solid fa-cloud-arrow-up"></i> ${isEdit ? 'Cập nhật bài tập' : 'Lưu & Xuất bản bài tập'}
            </button>
          </div>

          <!-- General Homework Info -->
          <div class="card">
            <h3 style="font-family:var(--font-heading); font-size:18px; font-weight:700; margin-bottom:16px;">
              <i class="fa-regular fa-clipboard" style="color:#0066cc;"></i> Thông tin chung bài tập
            </h3>

            <div style="display:flex; flex-direction:column; gap:16px;">
              <div class="grid-3">
                <div>
                  <label style="font-size:13px; font-weight:600; display:block; margin-bottom:6px;">Tên bài tập <span style="color:#ef4444;">*</span></label>
                  <input type="text" id="hw-title" class="form-input" placeholder="Ví dụ: Kiểm tra Chương 3: Con lắc đơn & Động lực học" value="${isEdit ? hw.title : 'Bài tập Kiểm tra Tổng hợp'}">
                </div>
                <div>
                  <label style="font-size:13px; font-weight:600; display:block; margin-bottom:6px;">Chọn lớp học <span style="color:#ef4444;">*</span></label>
                  <select id="hw-class-select" class="form-input" style="background:#ffffff; cursor:pointer;">
                    ${classOptions}
                  </select>
                </div>
                <div>
                  <label style="font-size:13px; font-weight:600; display:block; margin-bottom:6px;">Chọn bài học <span style="color:#ef4444;">*</span></label>
                  <select id="hw-lesson-select" class="form-input" style="background:#ffffff; cursor:pointer;">
                    <option value="">Đang tải bài học...</option>
                  </select>
                </div>
              </div>

              <div class="grid-3">
                <div>
                  <label style="font-size:13px; font-weight:600; display:block; margin-bottom:6px;">Thời gian làm bài (Phút)</label>
                  <input type="number" id="hw-duration" class="form-input" value="${isEdit ? hw.durationMinutes || 45 : 45}" min="5">
                </div>
                <div style="grid-column: span 2;">
                  <label style="font-size:13px; font-weight:600; display:block; margin-bottom:6px;">Tài liệu đính kèm (File đề bài PDF)</label>
                  ${isEdit && hw?.pdfPath ? `
                    <div id="existing-pdf-info" style="display:flex; align-items:center; gap:10px; margin-bottom:10px; padding:10px 14px; background:#f0fdf4; border:1px solid #bbf7d0; border-radius:10px;">
                      <i class="fa-solid fa-file-pdf" style="color:#ef4444; font-size:20px;"></i>
                      <div style="flex:1; min-width:0;">
                        <div style="font-size:13px; font-weight:700; color:#166534;">Đã có file đề bài PDF</div>
                        <div style="font-size:12px; color:#15803d; overflow:hidden; text-overflow:ellipsis; white-space:nowrap;">${hw.pdfPath}</div>
                      </div>
                      <span style="font-size:11px; color:#16a34a; background:#dcfce7; padding:3px 10px; border-radius:6px; font-weight:600;">Đang sử dụng</span>
                    </div>
                  ` : ''}
                  <input type="file" id="hw-pdf-file" accept=".pdf" class="form-input" style="padding:7px 12px; background:#ffffff;">
                  ${isEdit && hw?.pdfPath ? `
                    <div style="font-size:11px; color:#64748b; margin-top:4px;">
                      <i class="fa-solid fa-info-circle"></i> Chọn file mới để thay thế file hiện tại, hoặc bỏ trống để giữ nguyên.
                    </div>
                  ` : ''}
                  <div id="pdf-preview-container" style="${isEdit && (hw?.pdfUrl || hw?.pdfPath) ? 'display:block' : 'display:none'}; margin-top:16px;">
                    <label style="font-size:13px; font-weight:700; color:#0f172a; display:block; margin-bottom:6px;">
                      <i class="fa-solid fa-file-pdf" style="color:#ef4444;"></i> Xem trước file đề bài PDF:
                    </label>
                    <iframe id="pdf-preview-iframe" style="width:100%; height:500px; border:1px solid #cbd5e1; border-radius:10px; background:#f8fafc;" src="${isEdit && hw?.pdfUrl ? hw.pdfUrl.replace(/https?:\/\/kong:8000/g, 'http://localhost:54321') : ''}"></iframe>
                  </div>
                </div>
              </div>
            </div>
          </div>

          <!-- Config Section: Select Quantities for 3 Question Types -->
          <div class="card" style="border:2px solid #e0f2fe; background:#fafdfm;">
            <h3 style="font-family:var(--font-heading); font-size:18px; font-weight:700; color:#0369a1; margin-bottom:14px; display:flex; align-items:center; gap:8px;">
              <i class="fa-solid fa-sliders"></i> Cấu hình số lượng câu hỏi theo loại
            </h3>
            
            <div class="grid-3" style="margin-bottom:16px;">
              <div style="background:#ffffff; padding:14px; border:1px solid #e2e8f0; border-radius:12px;">
                <label style="font-size:13px; font-weight:700; color:#0f172a; display:block; margin-bottom:6px;">
                  1. Trắc nghiệm A/B/C/D
                </label>
                <div style="display:flex; align-items:center; gap:10px;">
                  <input type="number" id="cfg-mc-count" class="form-input" value="${currentConfig.mcCount}" min="0" max="100" style="font-weight:700; text-align:center;">
                  <span style="font-size:13px; color:#64748b;">Câu</span>
                </div>
              </div>

              <div style="background:#ffffff; padding:14px; border:1px solid #e2e8f0; border-radius:12px;">
                <label style="font-size:13px; font-weight:700; color:#0f172a; display:block; margin-bottom:6px;">
                  2. Đúng / Sai (4 ý / câu)
                </label>
                <div style="display:flex; align-items:center; gap:10px;">
                  <input type="number" id="cfg-tf-count" class="form-input" value="${currentConfig.tfCount}" min="0" max="50" style="font-weight:700; text-align:center;">
                  <span style="font-size:13px; color:#64748b;">Câu</span>
                </div>
              </div>

              <div style="background:#ffffff; padding:14px; border:1px solid #e2e8f0; border-radius:12px;">
                <label style="font-size:13px; font-weight:700; color:#0f172a; display:block; margin-bottom:6px;">
                  3. Trả lời ngắn
                </label>
                <div style="display:flex; align-items:center; gap:10px;">
                  <input type="number" id="cfg-sa-count" class="form-input" value="${currentConfig.saCount}" min="0" max="50" style="font-weight:700; text-align:center;">
                  <span style="font-size:13px; color:#64748b;">Câu</span>
                </div>
              </div>
            </div>

            <div style="text-align:right;">
              <button class="btn-primary" id="update-config-btn" style="width:auto; padding:8px 20px; background:#0066cc;">
                <i class="fa-solid fa-arrows-rotate"></i> Cập nhật số lượng câu hỏi
              </button>
            </div>
          </div>

          <!-- Answer Key Matrix Section -->
          <div id="answer-matrix-container">
            ${renderAnswerMatrix()}
          </div>
        </div>
      </div>
    </div>
  `
}

function renderAnswerMatrix() {
  return `
    <!-- PART 1: Multiple Choice ABCD -->
    <div class="card">
      <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:16px; padding-bottom:12px; border-bottom:1px solid #f1f5f9;">
        <h3 style="font-family:var(--font-heading); font-size:18px; font-weight:700; color:#0f172a;">
          <span style="background:#0066cc; color:#ffffff; padding:4px 10px; border-radius:8px; font-size:14px; margin-right:8px;">Phần I</span>
          Trắc nghiệm A/B/C/D (${currentConfig.mcCount} Câu)
        </h3>
        <span style="font-size:13px; color:#64748b;">Chọn 1 đáp án đúng cho mỗi câu</span>
      </div>

      ${currentConfig.mcCount === 0 ? `
        <div style="font-size:13px; color:#94a3b8; text-align:center; padding:16px;">Không có câu hỏi Trắc nghiệm ABCD.</div>
      ` : `
        <div style="display:grid; grid-template-columns: repeat(auto-fill, minmax(220px, 1fr)); gap:14px;">
          ${Array.from({ length: currentConfig.mcCount }, (_, i) => i + 1).map(qNum => {
            const selected = mcAnswers[qNum] || 'A'
            return `
              <div style="background:#f8fafc; border:1px solid #e2e8f0; border-radius:12px; padding:12px; display:flex; align-items:center; justify-content:space-between;">
                <span style="font-weight:700; font-size:15px; color:#334155; width:60px;">Câu ${qNum}</span>
                <div style="display:flex; gap:6px;">
                  ${['A', 'B', 'C', 'D'].map(opt => `
                    <button type="button" class="mc-option-btn ${selected === opt ? 'active' : ''}" data-qnum="${qNum}" data-option="${opt}" style="
                      width:32px; height:32px; border-radius:8px; border:1px solid ${selected === opt ? '#0066cc' : '#cbd5e1'};
                      background:${selected === opt ? '#0066cc' : '#ffffff'};
                      color:${selected === opt ? '#ffffff' : '#334155'};
                      font-weight:700; font-size:13px; cursor:pointer; transition:all 0.15s ease;
                    ">${opt}</button>
                  `).join('')}
                </div>
              </div>
            `
          }).join('')}
        </div>
      `}
    </div>

    <!-- PART 2: True / False (4 sub-items: a, b, c, d) -->
    <div class="card">
      <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:16px; padding-bottom:12px; border-bottom:1px solid #f1f5f9;">
        <h3 style="font-family:var(--font-heading); font-size:18px; font-weight:700; color:#0f172a;">
          <span style="background:#0284c7; color:#ffffff; padding:4px 10px; border-radius:8px; font-size:14px; margin-right:8px;">Phần II</span>
          Trắc nghiệm Đúng / Sai (${currentConfig.tfCount} Câu - Mỗi câu 4 ý a, b, c, d)
        </h3>
        <span style="font-size:13px; color:#64748b;">Chọn Đúng (Đ) hoặc Sai (S) cho từng ý</span>
      </div>

      ${currentConfig.tfCount === 0 ? `
        <div style="font-size:13px; color:#94a3b8; text-align:center; padding:16px;">Không có câu hỏi Đúng / Sai.</div>
      ` : `
        <div style="display:grid; grid-template-columns: repeat(auto-fill, minmax(320px, 1fr)); gap:16px;">
          ${Array.from({ length: currentConfig.tfCount }, (_, i) => i + 1).map(index => {
            const actualQNum = currentConfig.mcCount + index
            const tfObj = tfAnswers[actualQNum] || { a: true, b: true, c: false, d: true }
            return `
              <div style="background:#f8fafc; border:1px solid #e2e8f0; border-radius:12px; padding:14px;">
                <div style="font-weight:700; font-size:15px; color:#0f172a; margin-bottom:10px; border-bottom:1px solid #e2e8f0; padding-bottom:6px;">
                  Câu ${actualQNum}
                </div>

                <div style="display:flex; flex-direction:column; gap:8px;">
                  ${['a', 'b', 'c', 'd'].map(sub => {
                    const isTrue = tfObj[sub] !== false
                    return `
                      <div style="display:flex; justify-content:space-between; align-items:center; background:#ffffff; padding:6px 12px; border-radius:8px; border:1px solid #f1f5f9;">
                        <span style="font-weight:600; font-size:13px; color:#334155;">Ý ${sub})</span>
                        <div style="display:flex; gap:6px;">
                          <button type="button" class="tf-option-btn ${isTrue ? 'active-true' : ''}" data-qnum="${actualQNum}" data-sub="${sub}" data-val="true" style="
                            padding:4px 14px; border-radius:6px; font-weight:700; font-size:12px; cursor:pointer;
                            border:1px solid ${isTrue ? '#16a34a' : '#cbd5e1'};
                            background:${isTrue ? '#16a34a' : '#ffffff'};
                            color:${isTrue ? '#ffffff' : '#475569'};
                          ">Đúng</button>
                          
                          <button type="button" class="tf-option-btn ${!isTrue ? 'active-false' : ''}" data-qnum="${actualQNum}" data-sub="${sub}" data-val="false" style="
                            padding:4px 14px; border-radius:6px; font-weight:700; font-size:12px; cursor:pointer;
                            border:1px solid ${!isTrue ? '#dc2626' : '#cbd5e1'};
                            background:${!isTrue ? '#dc2626' : '#ffffff'};
                            color:${!isTrue ? '#ffffff' : '#475569'};
                          ">Sai</button>
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
    <div class="card">
      <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:16px; padding-bottom:12px; border-bottom:1px solid #f1f5f9;">
        <h3 style="font-family:var(--font-heading); font-size:18px; font-weight:700; color:#0f172a;">
          <span style="background:#059669; color:#ffffff; padding:4px 10px; border-radius:8px; font-size:14px; margin-right:8px;">Phần III</span>
          Trả lời ngắn (${currentConfig.saCount} Câu)
        </h3>
        <span style="font-size:13px; color:#64748b;">Nhập đáp án số hoặc chuỗi văn bản chuẩn</span>
      </div>

      ${currentConfig.saCount === 0 ? `
        <div style="font-size:13px; color:#94a3b8; text-align:center; padding:16px;">Không có câu hỏi Trả lời ngắn.</div>
      ` : `
        <div style="display:grid; grid-template-columns: repeat(auto-fill, minmax(260px, 1fr)); gap:14px;">
          ${Array.from({ length: currentConfig.saCount }, (_, i) => i + 1).map(index => {
            const actualQNum = currentConfig.mcCount + currentConfig.tfCount + index
            const val = saAnswers[actualQNum] || ''
            return `
              <div style="background:#f8fafc; border:1px solid #e2e8f0; border-radius:12px; padding:12px;">
                <div style="font-weight:700; font-size:14px; color:#0f172a; margin-bottom:6px;">Câu ${actualQNum}</div>
                <input type="text" class="form-input sa-input" data-qnum="${actualQNum}" value="${val}" placeholder="Nhập đáp án chuẩn..." style="background:#ffffff;">
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
    if (iframe && container) {
      const mappedUrl = hwData.homework.pdfUrl.replace(/https?:\/\/kong:8000/g, 'http://localhost:54321')
      if (!iframe.src || iframe.src === 'about:blank' || iframe.src === window.location.href) {
        iframe.src = mappedUrl
      }
      container.style.display = 'block'
    }
  }

  // PDF Preview file change listener
  const fileInput = document.getElementById('hw-pdf-file')
  fileInput?.addEventListener('change', (e) => {
    const file = e.target.files[0]
    const container = document.getElementById('pdf-preview-container')
    const iframe = document.getElementById('pdf-preview-iframe')
    
    if (file && file.type === 'application/pdf') {
      const fileURL = URL.createObjectURL(file)
      if (iframe && container) {
        iframe.src = fileURL
        container.style.display = 'block'
      }
    } else {
      if (container) container.style.display = 'none'
    }
  })

  // Dynamic lesson dropdown loader based on selected class
  const classSelect = document.getElementById('hw-class-select')
  const lessonSelect = document.getElementById('hw-lesson-select')

  const updateLessonsDropdown = async () => {
    const classId = classSelect?.value
    if (!classId) return

    if (lessonSelect) {
      lessonSelect.innerHTML = '<option value="">Đang tải bài học...</option>'
    }

    try {
      const chapters = await api.getChapters(classId)
      let optionsHTML = ''
      const isEdit = !!state.editHomeworkData
      const hw = isEdit ? state.editHomeworkData.homework : null
      const selectedLessonId = hw ? (hw.lessonId || hw.lesson_id) : null

      for (const ch of (chapters || [])) {
        const lessons = await api.getLessons(ch.id)
        for (const l of (lessons || [])) {
          const isSel = selectedLessonId === l.id ? 'selected' : ''
          optionsHTML += `<option value="${l.id}" ${isSel}>${ch.title} - ${l.title}</option>`
        }
      }
      if (lessonSelect) {
        lessonSelect.innerHTML = optionsHTML || '<option value="">Chưa có bài học nào (Hãy tạo bài học trước)</option>'
      }
    } catch (e) {
      if (lessonSelect) {
        lessonSelect.innerHTML = '<option value="">Lỗi khi tải bài học</option>'
      }
    }
  }

  classSelect?.addEventListener('change', updateLessonsDropdown)
  
  // Trigger initial dropdown load
  updateLessonsDropdown()

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
        mcAnswer: mcAnswers[i] || 'A',
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
        tfAnswers: tfAnswers[i] || { a: true, b: true, c: false, d: true },
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
        saAnswer: saAnswers[i] || '',
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
        showToast('Đang tải file PDF lên kho lưu trữ...', 'info')
        pdfPath = await api.uploadFile(file)
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
          questions
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
          questions
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
