import { renderSidebar, bindSidebarEvents } from '../components/sidebar.js'
import { renderNavbar } from '../components/navbar.js'
import { showToast } from '../components/toast.js'
import { openModal } from '../components/modal.js'
import { state } from '../state.js'
import { api } from '../api.js'
import { renderPdfViewer } from '../components/pdf-viewer.js'

// In-memory state for building the answer matrix
let currentConfig = {
  mcCount: 12,  // Trắc nghiệm ABCD
  tfCount: 4,   // Trắc nghiệm Đúng/Sai (4 ý)
  saCount: 6   // Trả lời ngắn
}

// Store chosen answers relative to their sections:
// mcAnswers: { 1: 'A', 2: 'B', ... }
// tfAnswers: { 1: { a: true, b: false, ... }, ... }
// saAnswers: { 1: '9.8', ... }
let mcAnswers = {}
let tfAnswers = {}
let saAnswers = {}

function initAnswersState() {
  mcAnswers = {}
  tfAnswers = {}
  saAnswers = {}
}

// Initial call
initAnswersState()

export function resetCreateForm() {
  currentConfig.editingHomeworkId = null
  currentConfig.mcCount = 12
  currentConfig.tfCount = 4
  currentConfig.saCount = 6
  initAnswersState()
}

export function renderCreateHwView() {
  const isEdit = !!state.editHomeworkData
  const hw = isEdit ? state.editHomeworkData.homework : null
  const questions = isEdit ? (state.editHomeworkData.questions || []) : []

  const pdfDownloadUrl = (isEdit && hw?.pdfUrl) ? hw.pdfUrl.replace(/https?:\/\/kong:8000/g, import.meta.env.VITE_SUPABASE_URL || 'http://localhost:54321') : ''
  const pdfDownloadName = hw?.pdfPath || 'Homework_Attachment.pdf'

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
      mcQ.forEach((q, index) => {
        mcAnswers[index + 1] = q.answerKey?.mc_answer || 'A'
      })

      tfAnswers = {}
      tfQ.forEach((q, index) => {
        const val = q.answerKey?.tf_answers || {}
        const a = val.a !== undefined ? val.a : (val.s1 !== undefined ? val.s1 : true)
        const b = val.b !== undefined ? val.b : (val.s2 !== undefined ? val.s2 : true)
        const c = val.c !== undefined ? val.c : (val.s3 !== undefined ? val.s3 : false)
        const d = val.d !== undefined ? val.d : (val.s4 !== undefined ? val.s4 : true)
        tfAnswers[index + 1] = { a, b, c, d }
      })

      saAnswers = {}
      saQ.forEach((q, index) => {
        saAnswers[index + 1] = q.answerKey?.sa_answer !== undefined && q.answerKey?.sa_answer !== null ? String(q.answerKey.sa_answer) : ''
      })
    }
  } else if (!isEdit) {
    currentConfig.editingHomeworkId = null
  }

  const classOptions = state.classes.map(c => {
    const isSel = isEdit && (hw.classId === c.id || hw.class_id === c.id)
    return `<option value="${c.id}" ${isSel ? 'selected' : ''}>${c.name}</option>`
  }).join('')

  let displayTitle = isEdit ? (hw?.title || '') : ''
  if (isEdit && hw?.title && hw?.lessonTitle) {
    const prefix = `${hw.lessonTitle} - `
    if (displayTitle.startsWith(prefix)) {
      displayTitle = displayTitle.substring(prefix.length)
    }
  }

  return `
    <div class="app-layout">
      ${renderSidebar('create-homework')}
      <div class="main-content">
        ${renderNavbar(isEdit ? 'Quản trị / Sửa bài tập' : 'Quản trị / Tạo bài tập')}
        <div class="content-body" style="padding: 16px 24px;">
          <div class="split-homework-layout">
            
            <!-- LEFT COLUMN: PDF VIEWER & UPLOAD (60%) -->
            <div class="pdf-viewer-container" style="box-shadow: 0 4px 12px rgba(0,0,0,0.05); border:1px solid #cbd5e1; display:flex; flex-direction:column; overflow:hidden;">
              <div class="pdf-toolbar" style="display:flex; justify-content:space-between; align-items:center; flex-wrap:nowrap; gap:10px; margin-bottom:12px; padding:8px 14px; box-sizing:border-box;">
                <div style="font-weight:700; color:#0f172a; display:flex; align-items:center; gap:8px; min-width:0; flex:1 1 auto; overflow:hidden;">
                  <i class="fa-solid fa-file-pdf" style="color:#ef4444; font-size:18px; flex-shrink:0;"></i>
                  <span id="pdf-viewer-title" style="overflow:hidden; text-overflow:ellipsis; white-space:nowrap; font-size:13px;" title="${hw?.pdfPath || 'Chưa chọn file PDF'}">${hw?.pdfPath || 'Chưa chọn file PDF'}</span>
                </div>
                <div style="display:flex; align-items:center; gap:8px; flex-shrink:0; flex-wrap:nowrap;">
                  <div class="pdf-controls-slot" style="display:flex; align-items:center; flex-shrink:0;"></div>
                  <input type="file" id="hw-pdf-file" accept=".pdf" style="display:none;">
                  <button class="btn-primary" type="button" onclick="document.getElementById('hw-pdf-file').click()" style="width:auto !important; white-space:nowrap; flex-shrink:0; padding:6px 12px; font-size:12px; height:32px; line-height:1; display:inline-flex; align-items:center; gap:5px; cursor:pointer; box-shadow:none; border-radius:6px;">
                    <i class="fa-solid fa-upload"></i> Chọn file PDF
                  </button>
                  <a id="download-hw-pdf-btn" href="${pdfDownloadUrl || '#'}" download="${pdfDownloadName}" target="_blank" rel="noopener noreferrer" style="width:auto !important; white-space:nowrap; flex-shrink:0; padding:6px 12px; font-size:12px; height:32px; box-sizing:border-box; line-height:1; display:inline-flex; align-items:center; gap:5px; text-decoration:none; ${pdfDownloadUrl ? 'background:#eff6ff; color:#0066cc; border:1px solid #bfdbfe; cursor:pointer;' : 'background:#f8fafc; color:#94a3b8; border:1px solid #e2e8f0; cursor:not-allowed; opacity:0.7;'} border-radius:6px; font-weight:600; transition:all 0.2s;" title="${pdfDownloadUrl ? `Tải file PDF: ${pdfDownloadName}` : 'Chưa có file PDF để tải xuống'}">
                    <i class="fa-solid fa-download"></i> Tải file PDF
                  </a>
                </div>
              </div>

              <!-- PDF Iframe Preview / Placeholder -->
              <div id="pdf-preview-container" class="pdf-iframe-wrapper" style="flex-grow:1; display:flex; height:calc(100vh - 180px); background:#f8fafc; border:1px dashed #cbd5e1; border-radius:8px; justify-content:center; align-items:center; overflow-y:auto; -webkit-overflow-scrolling:touch; touch-action:pan-x pan-y; position:relative;">
                <iframe id="pdf-preview-iframe" src="${isEdit && hw?.pdfUrl ? hw.pdfUrl.replace(/https?:\/\/kong:8000/g, import.meta.env.VITE_SUPABASE_URL || 'http://localhost:54321') : ''}" style="width:100%; height:100%; min-height:100%; border:none; background:#f8fafc; -webkit-overflow-scrolling:touch; ${isEdit && hw?.pdfUrl ? '' : 'display:none;'}"></iframe>
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
                    <input type="text" id="hw-title" class="form-input" placeholder="Ví dụ: TN - 1, Bài tập 1..." value="${displayTitle}" style="padding:8px 12px; font-size:13px;">
                    <div style="font-size:11px; color:#64748b; margin-top:3px;"><i class="fa-solid fa-circle-info" style="color:#0066cc;"></i> Tiền tố tên bài học sẽ tự động được thêm vào trước tên bài tập khi gửi dữ liệu</div>
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

                  <div style="display:grid; grid-template-columns:1fr 1fr 1fr 1fr; gap:10px;">
                    <div>
                      <label style="font-size:12px; font-weight:600; display:block; margin-bottom:4px;">Loại bài tập <span style="color:#ef4444;">*</span></label>
                      <select id="hw-type" class="form-input" style="background:#ffffff; cursor:pointer; padding:8px 12px; font-size:13px;">
                        <option value="PRACTICE" ${isEdit && hw.type === 'PRACTICE' ? 'selected' : ''}>Luyện tập</option>
                        <option value="EXAM" ${isEdit && hw.type === 'EXAM' ? 'selected' : ''}>Bài thi</option>
                      </select>
                    </div>
                    <div>
                      <label style="font-size:12px; font-weight:600; display:block; margin-bottom:4px;">Thời gian (Phút)</label>
                      <input type="number" id="hw-duration" class="form-input" value="${isEdit ? hw.durationMinutes || 45 : 45}" min="5" style="padding:8px 12px; font-size:13px;">
                    </div>
                    <div>
                      <label style="font-size:12px; font-weight:600; display:block; margin-bottom:4px;">Giới hạn vi phạm</label>
                      <input type="number" id="hw-max-violations" class="form-input" value="${isEdit && hw.maxViolations !== undefined ? hw.maxViolations : 3}" min="1" max="10" style="padding:8px 12px; font-size:13px;">
                    </div>
                    <div>
                      <label style="font-size:12px; font-weight:600; display:block; margin-bottom:4px;">Số lần</label>
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

              <!-- JSON Import/Export Answers Card -->
              <div class="card" style="border:2px solid #cbd5e1; background:#f8fafc; margin:0; padding:12px 16px;">
                <h3 style="font-family:var(--font-heading); font-size:14px; font-weight:700; color:#334155; margin-bottom:10px; display:flex; align-items:center; gap:8px;">
                  <i class="fa-solid fa-file-import"></i> Nhập / Xuất đáp án nhanh
                </h3>
                <div style="display:flex; gap:8px; flex-wrap:wrap;">
                  <button class="btn-secondary" id="copy-sample-btn" type="button" style="flex:1 1 130px; padding:8px 10px; font-size:12px; cursor:pointer; display:flex; align-items:center; justify-content:center; gap:5px; border:1px solid #cbd5e1; background:#ffffff; border-radius:8px; font-weight:600; white-space:nowrap;" title="Sao chép cấu trúc JSON mẫu gồm 12 câu TN, 4 câu Đ/S, 6 câu TLN">
                    <i class="fa-regular fa-file-code"></i> Sao chép JSON mẫu
                  </button>
                  <button class="btn-secondary" id="copy-answers-btn" type="button" style="flex:1 1 130px; padding:8px 10px; font-size:12px; cursor:pointer; display:flex; align-items:center; justify-content:center; gap:5px; border:1px solid #0066cc; background:#eff6ff; color:#0066cc; border-radius:8px; font-weight:600; white-space:nowrap;" title="Sao chép toàn bộ đáp án hiện tại của bảng dưới dạng JSON">
                    <i class="fa-regular fa-copy"></i> Sao chép đáp án JSON
                  </button>
                  <button class="btn-primary" id="import-answers-btn" type="button" style="flex:1 1 130px; padding:8px 10px; font-size:12px; cursor:pointer; display:flex; align-items:center; justify-content:center; gap:5px; background:#059669; border-radius:8px; font-weight:600; white-space:nowrap; width:auto;" title="Nhập danh sách đáp án từ chuỗi JSON">
                    <i class="fa-solid fa-keyboard"></i> Nhập đáp án (JSON)
                  </button>
                </div>
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
    const selected = mcAnswers[qNum]
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
    const tfObj = tfAnswers[index] || {}
    return `
              <div style="background:#f8fafc; border:1px solid #e2e8f0; border-radius:10px; padding:10px;">
                <div style="font-weight:700; font-size:13px; color:#0f172a; margin-bottom:8px;">Câu ${actualQNum}</div>
                <div style="display:grid; grid-template-columns:1fr 1fr; gap:6px;">
                  ${['a', 'b', 'c', 'd'].map(sub => {
      const isTrue = tfObj[sub] === true
      const isFalse = tfObj[sub] === false
      return `
                      <div style="display:flex; align-items:center; justify-content:space-between; background:#ffffff; padding:4px 8px; border-radius:6px; border:1px solid #e2e8f0; font-size:12px;">
                        <span style="font-weight:700; color:#475569;">${sub})</span>
                        <div style="display:flex; gap:4px;">
                          <button type="button" class="tf-option-btn ${isTrue ? 'active-true' : ''}" data-index="${index}" data-sub="${sub}" data-val="true" style="
                            padding:2px 8px; border-radius:4px; font-weight:700; font-size:11px; cursor:pointer;
                            border:1px solid ${isTrue ? '#16a34a' : '#cbd5e1'};
                            background:${isTrue ? '#16a34a' : '#ffffff'};
                            color:${isTrue ? '#ffffff' : '#475569'};
                          ">Đ</button>
                          <button type="button" class="tf-option-btn ${isFalse ? 'active-false' : ''}" data-index="${index}" data-sub="${sub}" data-val="false" style="
                            padding:2px 8px; border-radius:4px; font-weight:700; font-size:11px; cursor:pointer;
                            border:1px solid ${isFalse ? '#dc2626' : '#cbd5e1'};
                            background:${isFalse ? '#dc2626' : '#ffffff'};
                            color:${isFalse ? '#ffffff' : '#475569'};
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
    const val = saAnswers[index] || ''
    return `
              <div style="display:flex; align-items:center; justify-content:space-between; padding:8px 12px; background:#f8fafc; border:1px solid #e2e8f0; border-radius:10px;">
                <span style="font-weight:700; font-size:13px; color:#334155; width:54px;">Câu ${actualQNum}</span>
                <input type="text" class="form-input sa-input" data-index="${index}" value="${val}" placeholder="Nhập đáp án chuẩn..." style="padding:6px 10px; font-size:13px; background:#ffffff;">
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
  const downloadBtn = document.getElementById('download-hw-pdf-btn')

  if (isEditMode && hwData?.homework?.pdfUrl) {
    const container = document.getElementById('pdf-preview-container')
    const titleSpan = document.getElementById('pdf-viewer-title')

    if (container) {
      const mappedUrl = hwData.homework.pdfUrl.replace(/https?:\/\/kong:8000/g, import.meta.env.VITE_SUPABASE_URL || 'http://localhost:54321')
      renderPdfViewer(container, mappedUrl)
      const fileName = hwData.homework.pdfPath || 'Homework_Attachment.pdf'
      if (titleSpan) titleSpan.textContent = fileName
      if (downloadBtn) {
        downloadBtn.href = mappedUrl
        downloadBtn.download = fileName
        downloadBtn.style.background = '#eff6ff'
        downloadBtn.style.color = '#0066cc'
        downloadBtn.style.borderColor = '#bfdbfe'
        downloadBtn.style.cursor = 'pointer'
        downloadBtn.style.opacity = '1'
        downloadBtn.title = `Tải file PDF: ${fileName}`
      }
    }
  }

  // PDF Preview file change listener
  const fileInput = document.getElementById('hw-pdf-file')
  fileInput?.addEventListener('change', (e) => {
    const file = e.target.files[0]
    const container = document.getElementById('pdf-preview-container')
    const titleSpan = document.getElementById('pdf-viewer-title')

    if (file && file.type === 'application/pdf') {
      const fileURL = URL.createObjectURL(file)
      if (container) {
        renderPdfViewer(container, fileURL)
      }
      if (titleSpan) titleSpan.textContent = file.name
      if (downloadBtn) {
        downloadBtn.href = fileURL
        downloadBtn.download = file.name
        downloadBtn.style.background = '#eff6ff'
        downloadBtn.style.color = '#0066cc'
        downloadBtn.style.borderColor = '#bfdbfe'
        downloadBtn.style.cursor = 'pointer'
        downloadBtn.style.opacity = '1'
        downloadBtn.title = `Tải file PDF: ${file.name}`
      }
    } else {
      if (container) {
        container.innerHTML = `
          <div id="pdf-placeholder" style="color:#64748b; text-align:center; padding:20px;">
            <i class="fa-regular fa-file-pdf" style="font-size:48px; color:#cbd5e1; margin-bottom:12px; display:block;"></i>
            <span style="font-size:13px;">Vui lòng chọn file đề bài PDF để xem trước</span>
          </div>
        `
      }
      if (titleSpan) titleSpan.textContent = 'Chưa chọn file PDF'
      if (downloadBtn) {
        downloadBtn.href = '#'
        downloadBtn.removeAttribute('download')
        downloadBtn.style.background = '#f8fafc'
        downloadBtn.style.color = '#94a3b8'
        downloadBtn.style.borderColor = '#e2e8f0'
        downloadBtn.style.cursor = 'not-allowed'
        downloadBtn.style.opacity = '0.7'
        downloadBtn.title = 'Chưa có file PDF để tải xuống'
      }
    }
  })

  // Download PDF button click listener
  downloadBtn?.addEventListener('click', async (e) => {
    const href = downloadBtn.getAttribute('href')
    if (!href || href === '#' || downloadBtn.style.cursor === 'not-allowed') {
      e.preventDefault()
      showToast('Chưa có file PDF nào để tải xuống!', 'warning')
      return
    }
    if (href.startsWith('blob:')) {
      return
    }
    e.preventDefault()
    try {
      showToast('Đang tải file PDF...', 'info')
      const res = await fetch(href)
      if (!res.ok) throw new Error(`HTTP ${res.status}`)
      const blob = await res.blob()
      const blobUrl = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = blobUrl
      a.download = downloadBtn.getAttribute('download') || 'De_Bai.pdf'
      document.body.appendChild(a)
      a.click()
      document.body.removeChild(a)
      setTimeout(() => URL.revokeObjectURL(blobUrl), 2000)
    } catch (err) {
      console.warn('Direct blob download failed, falling back to window.open:', err)
      window.open(href, '_blank')
    }
  })

  // Dynamic class -> chapter -> lesson dropdown loader
  const classSelect = document.getElementById('hw-class-select')
  const chapterSelect = document.getElementById('hw-chapter-select')
  const lessonSelect = document.getElementById('hw-lesson-select')
  const typeSelect = document.getElementById('hw-type')
  const maxAttemptsInput = document.getElementById('hw-max-attempts')

  let previousLessonTitle = ''

  const getSelectedLessonTitle = () => {
    if (!lessonSelect || lessonSelect.selectedIndex < 0) return ''
    const opt = lessonSelect.options[lessonSelect.selectedIndex]
    if (!opt || !opt.value) return ''
    return opt.textContent.trim()
  }

  const applyLessonPrefixToTitle = (newLessonTitle) => {
    const titleInput = document.getElementById('hw-title')
    if (!titleInput || !newLessonTitle) return
    const currentVal = titleInput.value.trim()

    // If input is empty
    if (!currentVal) {
      titleInput.value = `${newLessonTitle} - `
      previousLessonTitle = newLessonTitle
      return
    }

    // If title currently starts with previousLessonTitle, replace old prefix with new prefix
    if (previousLessonTitle && currentVal.startsWith(previousLessonTitle)) {
      const suffix = currentVal.substring(previousLessonTitle.length).replace(/^[\s\-–—:]+/, '').trim()
      titleInput.value = suffix ? `${newLessonTitle} - ${suffix}` : `${newLessonTitle} - `
      previousLessonTitle = newLessonTitle
      return
    }

    // If title already starts with newLessonTitle, don't duplicate
    if (currentVal.startsWith(newLessonTitle)) {
      previousLessonTitle = newLessonTitle
      return
    }

    // If title already has some custom name, prepend newLessonTitle
    titleInput.value = `${newLessonTitle} - ${currentVal}`
    previousLessonTitle = newLessonTitle
  }

  // Disable max attempts if Exam
  const maxViolationsInput = document.getElementById('hw-max-violations')
  if (typeSelect && maxAttemptsInput) {
    const handleTypeChange = () => {
      if (typeSelect.value === 'EXAM') {
        maxAttemptsInput.value = 1;
        maxAttemptsInput.disabled = true;
        maxAttemptsInput.style.backgroundColor = '#f1f5f9';

        if (maxViolationsInput) {
          maxViolationsInput.disabled = false;
          maxViolationsInput.style.backgroundColor = '#ffffff';
        }
      } else {
        maxAttemptsInput.disabled = false;
        maxAttemptsInput.style.backgroundColor = '#ffffff';

        if (maxViolationsInput) {
          maxViolationsInput.disabled = true;
          maxViolationsInput.style.backgroundColor = '#f1f5f9';
        }
      }
    };
    typeSelect.addEventListener('change', handleTypeChange);
    // Init state
    handleTypeChange();
  }

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
        if (!isEdit && lessons && lessons.length === 1) {
          lessonSelect.value = lessons[0].id
          applyLessonPrefixToTitle(lessons[0].title)
        } else if (isEdit && editLessonId) {
          const currentOpt = lessonSelect.options[lessonSelect.selectedIndex]
          if (currentOpt && currentOpt.value) {
            previousLessonTitle = currentOpt.textContent.trim()
          }
        }
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

    if (initialClassId && classSelect) {
      classSelect.value = initialClassId
    }
    await updateChaptersDropdown(initialChapterId, initialLessonId)

    if (isEdit && hw) {
      previousLessonTitle = hw.lessonTitle || getSelectedLessonTitle()
    }
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
      if (!tfAnswers[i]) tfAnswers[i] = { a: true, b: true, c: false, d: true }
    }
    for (let i = 1; i <= currentConfig.saCount; i++) {
      if (saAnswers[i] === undefined) saAnswers[i] = ''
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

  // Universal clipboard copy helper
  const copyTextToClipboard = async (text) => {
    if (navigator.clipboard && window.isSecureContext) {
      try {
        await navigator.clipboard.writeText(text)
        return true
      } catch (e) {
        // fallback below
      }
    }
    const textArea = document.createElement('textarea')
    textArea.value = text
    textArea.style.position = 'fixed'
    textArea.style.left = '-999999px'
    textArea.style.top = '-999999px'
    document.body.appendChild(textArea)
    textArea.focus()
    textArea.select()
    try {
      const successful = document.execCommand('copy')
      document.body.removeChild(textArea)
      return successful
    } catch (err) {
      document.body.removeChild(textArea)
      return false
    }
  }

  // Handle Copy Sample JSON
  document.getElementById('copy-sample-btn')?.addEventListener('click', async () => {
    const sampleQuestions = [];

    // Part I: MC (12 questions)
    for (let i = 1; i <= 12; i++) {
      sampleQuestions.push({
        questionNumber: i,
        questionType: "MULTIPLE_CHOICE",
        mcAnswer: i % 4 === 1 ? "A" : i % 4 === 2 ? "B" : i % 4 === 3 ? "C" : "D"
      });
    }

    // Part II: TF (4 questions)
    for (let i = 1; i <= 4; i++) {
      sampleQuestions.push({
        questionNumber: 12 + i,
        questionType: "TRUE_FALSE",
        tfAnswers: {
          a: i % 2 === 1,
          b: i % 2 === 0,
          c: i % 3 === 1,
          d: i % 3 !== 1
        }
      });
    }

    // Part III: SA (6 questions)
    const saSamples = ["10.5", "42", "Hà Nội", "3.14", "2026", "Bài tập"];
    for (let i = 1; i <= 6; i++) {
      sampleQuestions.push({
        questionNumber: 16 + i,
        questionType: "SHORT_ANSWER",
        saAnswer: saSamples[i - 1]
      });
    }

    const jsonStr = JSON.stringify(sampleQuestions, null, 2);
    const success = await copyTextToClipboard(jsonStr);
    if (success) {
      showToast("Đã sao chép JSON mẫu vào bộ nhớ tạm!", "success");
    } else {
      showToast("Không thể tự động sao chép vào bộ nhớ tạm!", "error");
    }
  });

  // Handle Copy Current Answers JSON
  document.getElementById('copy-answers-btn')?.addEventListener('click', async () => {
    const totalQuestions = currentConfig.mcCount + currentConfig.tfCount + currentConfig.saCount;
    if (totalQuestions === 0) {
      showToast('Chưa có câu hỏi nào để sao chép đáp án!', 'warning');
      return;
    }

    const currentQuestions = [];
    let globalIndex = 1;

    // Part I: MC
    for (let i = 1; i <= currentConfig.mcCount; i++) {
      currentQuestions.push({
        questionNumber: globalIndex++,
        questionType: 'MULTIPLE_CHOICE',
        mcAnswer: mcAnswers[i] || 'A'
      });
    }

    // Part II: TF
    for (let i = 1; i <= currentConfig.tfCount; i++) {
      const tf = tfAnswers[i] || {};
      currentQuestions.push({
        questionNumber: globalIndex++,
        questionType: 'TRUE_FALSE',
        tfAnswers: {
          a: tf.a !== undefined ? tf.a : true,
          b: tf.b !== undefined ? tf.b : true,
          c: tf.c !== undefined ? tf.c : false,
          d: tf.d !== undefined ? tf.d : true
        }
      });
    }

    // Part III: SA
    for (let i = 1; i <= currentConfig.saCount; i++) {
      const ans = saAnswers[i] !== undefined && saAnswers[i] !== null ? String(saAnswers[i]) : '';
      currentQuestions.push({
        questionNumber: globalIndex++,
        questionType: 'SHORT_ANSWER',
        saAnswer: ans
      });
    }

    const jsonStr = JSON.stringify(currentQuestions, null, 2);
    const success = await copyTextToClipboard(jsonStr);
    if (success) {
      showToast(`Đã sao chép đáp án JSON (${currentQuestions.length} câu) vào bộ nhớ tạm!`, 'success');
    } else {
      showToast('Không thể tự động sao chép vào bộ nhớ tạm!', 'error');
    }
  });

  // Handle Import JSON Text Dialog
  document.getElementById('import-answers-btn')?.addEventListener('click', () => {
    const bodyHTML = `
      <div style="display:flex; flex-direction:column; gap:10px;">
        <div style="font-size:12px; color:#64748b; line-height:1.4;">
          Dán chuỗi JSON danh sách đáp án của bạn vào khung bên dưới. Định dạng dữ liệu phải khớp với cấu trúc mẫu (mảng gồm các câu hỏi liên tục bắt đầu từ câu 1).
        </div>
        <textarea id="import-json-textarea" class="form-input" placeholder="[\n  {\n    &quot;questionNumber&quot;: 1,\n    &quot;questionType&quot;: &quot;MULTIPLE_CHOICE&quot;,\n    &quot;mcAnswer&quot;: &quot;A&quot;\n  }\n]" style="width:100%; height:250px; font-family:monospace; font-size:12px; padding:10px; line-height:1.5; resize:vertical; background:#f8fafc; border:1px solid #cbd5e1; border-radius:6px;"></textarea>
        <div id="modal-error-msg" style="color:#ef4444; font-size:12px; display:none; font-weight:600;"></div>
      </div>
    `;

    openModal("Nhập đáp án JSON", bodyHTML, () => {
      const textarea = document.getElementById('import-json-textarea');
      const errorMsgDiv = document.getElementById('modal-error-msg');
      if (!textarea) return false;

      const text = textarea.value.trim();
      if (!text) {
        if (errorMsgDiv) {
          errorMsgDiv.textContent = "Vui lòng nhập dữ liệu JSON!";
          errorMsgDiv.style.display = "block";
        }
        return false;
      }

      try {
        const parsed = JSON.parse(text);

        if (!Array.isArray(parsed)) {
          throw new Error("Dữ liệu JSON phải là một danh sách các câu hỏi (mảng).");
        }

        if (parsed.length === 0) {
          throw new Error("Danh sách câu hỏi trống.");
        }

        // 1. Validate structure and numbers
        const sorted = [...parsed].sort((a, b) => a.questionNumber - b.questionNumber);

        for (let i = 0; i < sorted.length; i++) {
          const q = sorted[i];
          const expectedNum = i + 1;
          if (q.questionNumber !== expectedNum) {
            throw new Error(`Số câu không liên tục hoặc không hợp lệ. Mong đợi Câu ${expectedNum} nhưng nhận được Câu ${q.questionNumber}.`);
          }
          if (!q.questionType || !['MULTIPLE_CHOICE', 'TRUE_FALSE', 'SHORT_ANSWER'].includes(q.questionType)) {
            throw new Error(`Câu ${q.questionNumber} có loại câu hỏi không hợp lệ hoặc bị thiếu.`);
          }

          if (q.questionType === 'MULTIPLE_CHOICE') {
            if (!q.mcAnswer || !['A', 'B', 'C', 'D'].includes(q.mcAnswer)) {
              throw new Error(`Câu ${q.questionNumber} (Trắc nghiệm) phải có đáp án 'mcAnswer' là A, B, C hoặc D.`);
            }
          } else if (q.questionType === 'TRUE_FALSE') {
            if (!q.tfAnswers || typeof q.tfAnswers !== 'object') {
              throw new Error(`Câu ${q.questionNumber} (Đúng/Sai) thiếu cấu trúc đáp án 'tfAnswers'.`);
            }
            const keys = ['a', 'b', 'c', 'd'];
            for (const key of keys) {
              if (q.tfAnswers[key] === undefined || typeof q.tfAnswers[key] !== 'boolean') {
                throw new Error(`Câu ${q.questionNumber} (Đúng/Sai) phải chứa ý phụ '${key}' có giá trị true hoặc false.`);
              }
            }
          } else if (q.questionType === 'SHORT_ANSWER') {
            if (q.saAnswer === undefined || q.saAnswer === null || String(q.saAnswer).trim() === '') {
              throw new Error(`Câu ${q.questionNumber} (Trả lời ngắn) phải có đáp án 'saAnswer' không được để trống.`);
            }
          }
        }

        // 2. Validate ordering partition (MULTIPLE_CHOICE -> TRUE_FALSE -> SHORT_ANSWER)
        let lastType = 'MULTIPLE_CHOICE';
        for (let i = 0; i < sorted.length; i++) {
          const q = sorted[i];
          const type = q.questionType;
          if (type === 'MULTIPLE_CHOICE') {
            if (lastType !== 'MULTIPLE_CHOICE') {
              throw new Error(`Lỗi thứ tự: Câu trắc nghiệm (Câu ${q.questionNumber}) không được phép đứng sau câu loại khác.`);
            }
          } else if (type === 'TRUE_FALSE') {
            if (lastType === 'SHORT_ANSWER') {
              throw new Error(`Lỗi thứ tự: Câu Đúng/Sai (Câu ${q.questionNumber}) không được phép đứng sau câu tự luận/ngắn.`);
            }
            lastType = 'TRUE_FALSE';
          } else if (type === 'SHORT_ANSWER') {
            lastType = 'SHORT_ANSWER';
          }
        }

        // 3. Count types
        const mcQ = sorted.filter(q => q.questionType === 'MULTIPLE_CHOICE');
        const tfQ = sorted.filter(q => q.questionType === 'TRUE_FALSE');
        const saQ = sorted.filter(q => q.questionType === 'SHORT_ANSWER');

        const mcCount = mcQ.length;
        const tfCount = tfQ.length;
        const saCount = saQ.length;

        // 4. Update in-memory answer maps
        const newMcAnswers = {};
        const newTfAnswers = {};
        const newSaAnswers = {};

        mcQ.forEach((q, idx) => {
          newMcAnswers[idx + 1] = q.mcAnswer;
        });

        tfQ.forEach((q, idx) => {
          newTfAnswers[idx + 1] = {
            a: q.tfAnswers.a,
            b: q.tfAnswers.b,
            c: q.tfAnswers.c,
            d: q.tfAnswers.d
          };
        });

        saQ.forEach((q, idx) => {
          newSaAnswers[idx + 1] = String(q.saAnswer);
        });

        // Apply updates
        currentConfig.mcCount = mcCount;
        currentConfig.tfCount = tfCount;
        currentConfig.saCount = saCount;

        mcAnswers = newMcAnswers;
        tfAnswers = newTfAnswers;
        saAnswers = newSaAnswers;

        // Update input element values in HTML if they exist
        const mcInput = document.getElementById('cfg-mc-count');
        const tfInput = document.getElementById('cfg-tf-count');
        const saInput = document.getElementById('cfg-sa-count');
        if (mcInput) mcInput.value = mcCount;
        if (tfInput) tfInput.value = tfCount;
        if (saInput) saInput.value = saCount;

        // Re-render UI matrix
        const container = document.getElementById('answer-matrix-container');
        if (container) {
          container.innerHTML = renderAnswerMatrix();
          bindMatrixEvents();
        }

        showToast(`Nhập thành công ${sorted.length} câu hỏi từ chuỗi JSON!`, "success");
        return true; // Closes modal
      } catch (err) {
        if (errorMsgDiv) {
          errorMsgDiv.textContent = `Lỗi: ${err.message}`;
          errorMsgDiv.style.display = "block";
        }
        return false; // Keep modal open
      }
    });
  });

  bindMatrixEvents()

  // Save Homework Event
  document.getElementById('save-homework-btn')?.addEventListener('click', async () => {
    let title = document.getElementById('hw-title')?.value.trim()
    const classId = document.getElementById('hw-class-select')?.value
    const lessonId = document.getElementById('hw-lesson-select')?.value
    const selectedLessonTitle = getSelectedLessonTitle()
    const duration = parseInt(document.getElementById('hw-duration')?.value || '45', 10)
    const deadlineRaw = document.getElementById('hw-deadline')?.value
    const maxAttemptsVal = parseInt(document.getElementById('hw-max-attempts')?.value || '0', 10)
    const maxViolationsVal = parseInt(document.getElementById('hw-max-violations')?.value || '3', 10)
    const typeVal = document.getElementById('hw-type')?.value || 'PRACTICE'

    const deadline = deadlineRaw ? new Date(deadlineRaw).toISOString() : null
    const maxAttempts = maxAttemptsVal > 0 ? maxAttemptsVal : null
    const maxViolations = maxViolationsVal > 0 ? maxViolationsVal : 3

    if (!title) {
      showToast('Vui lòng nhập tên bài tập!', 'error')
      return
    }

    if (!lessonId) {
      showToast('Vui lòng chọn bài học cho bài tập này!', 'error')
      return
    }

    let finalTitle = title
    if (selectedLessonTitle) {
      const prefix = `${selectedLessonTitle} - `
      if (!title.startsWith(prefix)) {
        finalTitle = `${prefix}${title}`
      }
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
      const ans = mcAnswers[i]
      if (!ans) {
        showToast(`Vui lòng chọn đáp án cho Câu ${globalIndex} (Phần I)`, 'error')
        return
      }
      questions.push({
        id: `q_${globalIndex}`,
        questionNumber: globalIndex,
        questionType: 'MULTIPLE_CHOICE',
        mcAnswer: ans,
        points: 1.0
      })
      globalIndex++
    }

    // Part II: TF
    for (let i = 1; i <= currentConfig.tfCount; i++) {
      const tf = tfAnswers[i] || {}
      if (tf.a === undefined || tf.b === undefined || tf.c === undefined || tf.d === undefined) {
        showToast(`Vui lòng chọn đầy đủ Đúng/Sai cho Câu ${globalIndex} (Phần II)`, 'error')
        return
      }
      questions.push({
        id: `q_${globalIndex}`,
        questionNumber: globalIndex,
        questionType: 'TRUE_FALSE',
        tfAnswers: { a: tf.a, b: tf.b, c: tf.c, d: tf.d },
        points: 1.0
      })
      globalIndex++
    }

    // Part III: SA
    for (let i = 1; i <= currentConfig.saCount; i++) {
      const ans = saAnswers[i]
      if (ans === undefined || ans === null || ans.trim() === '') {
        showToast(`Vui lòng nhập đáp án cho Câu ${globalIndex} (Phần III)`, 'error')
        return
      }
      questions.push({
        id: `q_${globalIndex}`,
        questionNumber: globalIndex,
        questionType: 'SHORT_ANSWER',
        saAnswer: ans.trim(),
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
          title: finalTitle,
          pdfPath,
          durationMinutes: duration,
          passScore: hw.passScore || hw.pass_score || 5.0,
          maxScore: hw.maxScore || hw.max_score || 10.0,
          isPublished: hw.isPublished !== false,
          questions,
          deadline,
          maxAttempts,
          type: typeVal,
          maxViolations
        })
        showToast(`Đã cập nhật bài tập "${finalTitle}" thành công!`, 'success')
        window.location.hash = '#homework-mgmt'
      } else {
        showToast('Đang lưu cấu hình bài tập...', 'info')
        await api.createHomework({
          lessonId,
          title: finalTitle,
          pdfPath,
          durationMinutes: duration,
          passScore: 5.0,
          maxScore: 10.0,
          isPublished: true,
          questions,
          deadline,
          maxAttempts,
          type: typeVal,
          maxViolations
        })
        showToast(`Đã xuất bản bài tập "${finalTitle}" thành công!`, 'success')
        window.location.hash = '#homework-mgmt'
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
      const index = parseInt(btn.getAttribute('data-index'), 10)
      const sub = btn.getAttribute('data-sub')
      const val = btn.getAttribute('data-val') === 'true'

      if (!tfAnswers[index]) tfAnswers[index] = {}
      tfAnswers[index][sub] = val

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
      const index = parseInt(input.getAttribute('data-index'), 10)
      saAnswers[index] = e.target.value
    })
  })
}
