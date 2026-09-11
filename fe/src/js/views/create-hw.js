import { renderSidebar, bindSidebarEvents } from '../components/sidebar.js'
import { renderNavbar } from '../components/navbar.js'
import { showToast } from '../components/toast.js'
import { openModal } from '../components/modal.js'
import { state } from '../state.js'
import { api } from '../api.js'
import { renderPdfViewer } from '../components/pdf-viewer.js'
import { parseLatexExam, parseSingleQuestionBlock, parseAnswerKeyString } from '../utils/latex-parser.js'
import { renderMath } from '../components/math-renderer.js'

// In-memory state
let currentInputMode = 'latex' // 'latex' | 'pdf'
let parsedLatexData = null
let latexInputText = ''
let selectedQuestionForImage = null
let isPasteListenerRegistered = false
let editingQuestionNumber = null
let singleQuestionEditErrors = {}

function escapeHtml(str) {
  if (!str) return ''
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;')
}

let currentConfig = {
  editingHomeworkId: null,
  mcCount: 12,  // Trắc nghiệm ABCD
  tfCount: 4,   // Trắc nghiệm Đúng/Sai (4 ý)
  saCount: 6   // Trả lời ngắn
}

// Store chosen answers relative to their sections:
let mcAnswers = {}
let tfAnswers = {}
let saAnswers = {}
let chaptersCache = {}
let lessonsCache = {}

function initAnswersState() {
  mcAnswers = {}
  tfAnswers = {}
  saAnswers = {}
}

function parseAndApplyJsonAnswers(jsonContent) {
  let json = null
  if (typeof jsonContent === 'string') {
    json = JSON.parse(jsonContent.trim())
  } else if (typeof jsonContent === 'object') {
    json = jsonContent
  }
  if (!json) return 0

  // Unwrap root wrappers if present
  if (json.answers && typeof json.answers === 'object') json = json.answers
  else if (json.data && (Array.isArray(json.data) || typeof json.data === 'object')) json = json.data
  else if (json.keys && typeof json.keys === 'object') json = json.keys
  else if (json.dap_an && typeof json.dap_an === 'object') json = json.dap_an

  let count = 0

  const processQuestionAnswer = (qNum, val, typeHint = null) => {
    if (isNaN(qNum) || qNum <= 0) return

    // If val is an object (nested answer format)
    if (typeof val === 'object' && val !== null) {
      if (val.mc_answer || val.mcAnswer || val.answer || val.dap_an) {
        const mcVal = String(val.mc_answer || val.mcAnswer || val.answer || val.dap_an).trim().toUpperCase()
        if (['A', 'B', 'C', 'D'].includes(mcVal)) {
          mcAnswers[qNum] = mcVal
          count++
          return
        }
      }
      if (val.tf_answers || val.tfAnswers || val.statements || val.a !== undefined || val.s1 !== undefined) {
        const tfObj = val.tf_answers || val.tfAnswers || val.statements || val
        const parseBool = (v) => v === true || v === 1 || v === 'T' || v === 'Đ' || v === 'true' || v === 'D' || v === 'd'
        const parseDefinedBool = (v) => v !== undefined && v !== null ? parseBool(v) : undefined

        const resTf = {}
        const a = parseDefinedBool(tfObj.a !== undefined ? tfObj.a : tfObj.s1)
        const b = parseDefinedBool(tfObj.b !== undefined ? tfObj.b : tfObj.s2)
        const c = parseDefinedBool(tfObj.c !== undefined ? tfObj.c : tfObj.s3)
        const d = parseDefinedBool(tfObj.d !== undefined ? tfObj.d : tfObj.s4)
        if (a !== undefined) resTf.a = a
        if (b !== undefined) resTf.b = b
        if (c !== undefined) resTf.c = c
        if (d !== undefined) resTf.d = d

        if (Object.keys(resTf).length > 0) {
          tfAnswers[qNum] = resTf
          count++
          return
        }
      }
      if (val.sa_answer !== undefined || val.saAnswer !== undefined) {
        saAnswers[qNum] = String(val.sa_answer !== undefined ? val.sa_answer : val.saAnswer).trim()
        count++
        return
      }
    }

    // If val is a simple string or number
    if (typeof val === 'string' || typeof val === 'number') {
      const strVal = String(val).trim()
      const upper = strVal.toUpperCase()

      const qObj = parsedLatexData?.questions?.find(q => q.questionNumber === qNum)
      const qType = qObj?.questionType || typeHint

      if (qType === 'TRUE_FALSE' || (/^[ĐSDTF\s,;]+$/i.test(strVal) && strVal.length >= 4)) {
        const chars = strVal.replace(/[^ĐSDTF]/gi, '').toUpperCase().split('')
        if (chars.length >= 4) {
          tfAnswers[qNum] = {
            a: chars[0] === 'Đ' || chars[0] === 'T' || chars[0] === 'D',
            b: chars[1] === 'Đ' || chars[1] === 'T' || chars[1] === 'D',
            c: chars[2] === 'Đ' || chars[2] === 'T' || chars[2] === 'D',
            d: chars[3] === 'Đ' || chars[3] === 'T' || chars[3] === 'D'
          }
          count++
          return
        }
      }

      if (['A', 'B', 'C', 'D'].includes(upper)) {
        mcAnswers[qNum] = upper
        count++
        return
      }

      if (strVal !== '') {
        saAnswers[qNum] = strVal
        count++
        return
      }
    }
  }

  if (Array.isArray(json)) {
    json.forEach((item, idx) => {
      const qNum = parseInt(item.questionNumber || item.question_number || item.cau || item.id || (idx + 1), 10)
      const val = item.answer !== undefined ? item.answer : (item.mcAnswer !== undefined ? item.mcAnswer : (item.dap_an !== undefined ? item.dap_an : item))
      processQuestionAnswer(qNum, val, item.questionType || item.question_type)
    })
  } else if (typeof json === 'object') {
    Object.entries(json).forEach(([k, v]) => {
      const qNum = parseInt(k.replace(/\D/g, ''), 10)
      processQuestionAnswer(qNum, v)
    })
  }

  // Sync with parsedLatexData.questions
  if (parsedLatexData?.questions) {
    parsedLatexData.questions.forEach(q => {
      if (mcAnswers[q.questionNumber]) q.mcAnswer = mcAnswers[q.questionNumber]
      if (tfAnswers[q.questionNumber]) q.tfAnswers = tfAnswers[q.questionNumber]
      if (saAnswers[q.questionNumber]) q.saAnswer = saAnswers[q.questionNumber]
    })
  }

  return count
}

initAnswersState()

export function resetCreateForm() {
  currentConfig.editingHomeworkId = null
  currentConfig.mcCount = 12
  currentConfig.tfCount = 4
  currentConfig.saCount = 6
  currentInputMode = 'latex'
  parsedLatexData = null
  latexInputText = ''
  selectedQuestionForImage = null
  initAnswersState()
}

export function renderCreateHwView() {
  const isEdit = !!state.editHomeworkData
  const hw = isEdit ? state.editHomeworkData.homework : null
  const questions = isEdit ? (state.editHomeworkData.questions || []) : []

  // If editing an existing homework with native questions
  if (isEdit && hw && questions.length > 0 && currentConfig.editingHomeworkId !== hw.id) {
    currentConfig.editingHomeworkId = hw.id
    
    // Check if this homework has native content
    const hasNativeQuestions = questions.some(q => q.content || q.options || q.statements)
    if (hasNativeQuestions) {
      currentInputMode = 'latex'
      parsedLatexData = {
        success: true,
        title: hw.title || '',
        questions: questions.map(q => ({
          questionNumber: q.question_number,
          questionType: q.question_type,
          partTitle: q.part_title || null,
          content: q.content || q.prompt || '',
          options: q.options || null,
          statements: q.statements || null,
          mcAnswer: q.answerKey?.mc_answer || null,
          tfAnswers: q.answerKey?.tf_answers || null,
          saAnswer: q.answerKey?.sa_answer || null,
          explanation: q.answerKey?.explanation || null
        })),
        errors: []
      }
    } else {
      currentInputMode = 'pdf'
    }

    const mcQ = questions.filter(q => q.question_type === 'MULTIPLE_CHOICE')
    const tfQ = questions.filter(q => q.question_type === 'TRUE_FALSE')
    const saQ = questions.filter(q => q.question_type === 'SHORT_ANSWER')

    currentConfig.mcCount = mcQ.length
    currentConfig.tfCount = tfQ.length
    currentConfig.saCount = saQ.length

    mcAnswers = {}
    mcQ.forEach((q, index) => {
      const ans = q.answerKey?.mc_answer || 'A'
      mcAnswers[index + 1] = ans
      if (q.question_number) mcAnswers[q.question_number] = ans
    })

    tfAnswers = {}
    tfQ.forEach((q, index) => {
      const val = q.answerKey?.tf_answers || {}
      const a = val.a !== undefined ? val.a : (val.s1 !== undefined ? val.s1 : true)
      const b = val.b !== undefined ? val.b : (val.s2 !== undefined ? val.s2 : true)
      const c = val.c !== undefined ? val.c : (val.s3 !== undefined ? val.s3 : false)
      const d = val.d !== undefined ? val.d : (val.s4 !== undefined ? val.s4 : true)
      const parsedTf = { a, b, c, d }
      tfAnswers[index + 1] = parsedTf
      if (q.question_number) tfAnswers[q.question_number] = parsedTf
    })

    saAnswers = {}
    saQ.forEach((q, index) => {
      const val = q.answerKey?.sa_answer !== undefined && q.answerKey?.sa_answer !== null ? String(q.answerKey.sa_answer) : ''
      saAnswers[index + 1] = val
      if (q.question_number) saAnswers[q.question_number] = val
    })
  }

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

  const classOptions = state.classes.map(c => {
    const isSel = isEdit && (hw.classId === c.id || hw.class_id === c.id)
    return `<option value="${c.id}" ${isSel ? 'selected' : ''}>${c.name}</option>`
  }).join('')

  let displayTitle = isEdit ? (hw?.title || '') : (parsedLatexData?.title || '')
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
          
          <!-- Mode Switcher Tabs -->
          <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:16px; flex-wrap:wrap; gap:12px;">
            <div style="display:flex; align-items:center; gap:8px; background:#f1f5f9; padding:4px; border-radius:12px; border:1px solid #e2e8f0;">
              <button type="button" id="tab-mode-latex" style="padding:8px 18px; font-size:13px; font-weight:700; border:none; cursor:pointer; border-radius:8px; display:inline-flex; align-items:center; gap:8px; transition:all 0.2s; ${currentInputMode === 'latex' ? 'background:#0066cc; color:#ffffff; box-shadow:0 2px 6px rgba(0,102,204,0.2);' : 'background:transparent; color:#64748b;'}">
                <i class="fa-solid fa-square-root-variable"></i> Nhập từ file / mã LaTeX
              </button>
              <button type="button" id="tab-mode-pdf" style="padding:8px 18px; font-size:13px; font-weight:700; border:none; cursor:pointer; border-radius:8px; display:inline-flex; align-items:center; gap:8px; transition:all 0.2s; ${currentInputMode === 'pdf' ? 'background:#0066cc; color:#ffffff; box-shadow:0 2px 6px rgba(0,102,204,0.2);' : 'background:transparent; color:#64748b;'}">
                <i class="fa-solid fa-file-pdf"></i> Upload file PDF truyền thống
              </button>
            </div>

            <div style="display:flex; align-items:center; gap:8px;">
              ${currentInputMode === 'latex' ? `
                <span class="badge" style="background:#eff6ff; color:#0066cc; font-size:12px; padding:6px 12px; font-weight:600;">
                  <i class="fa-solid fa-circle-check" style="color:#10b981;"></i> Hỗ trợ KaTeX & mhchem (Toán & Hóa)
                </span>
              ` : ''}
            </div>
          </div>

          <div class="split-homework-layout" style="display:grid; grid-template-columns:1fr 420px; gap:20px; align-items:start;">
            
            <!-- LEFT COLUMN: CONTENT SOURCE (LATEX OR PDF) -->
            <div id="left-source-column" style="display:flex; flex-direction:column; gap:16px;">
              ${currentInputMode === 'latex' ? renderLatexInputPanel() : renderPdfViewerPanel(hw, isEdit, pdfDownloadUrl, pdfDownloadName)}
            </div>

            <!-- RIGHT COLUMN: CONFIG & ANSWER MATRIX -->
            <div class="question-column" style="overflow-y:auto; max-height:calc(100vh - 120px); display:flex; flex-direction:column; gap:20px; padding-right:4px;">
              
              <!-- General Info Card -->
              <div class="card" style="margin:0; padding:18px; border:1px solid #e2e8f0; border-radius:14px; background:#ffffff;">
                <h3 style="font-family:var(--font-heading); font-size:16px; font-weight:700; margin-bottom:14px; display:flex; align-items:center; gap:8px; color:#0f172a;">
                  <i class="fa-regular fa-clipboard" style="color:#0066cc;"></i> Thông tin bài tập
                </h3>

                <div style="display:flex; flex-direction:column; gap:12px;">
                  <div>
                    <label style="font-size:12px; font-weight:700; display:block; margin-bottom:4px; color:#334155;">Tên bài tập <span style="color:#ef4444;">*</span></label>
                    <input type="text" id="hw-title" class="form-input" placeholder="Ví dụ: Đạo hàm bài 1, TN - Phương trình điện li..." value="${displayTitle}" style="padding:9px 12px; font-size:13px; font-weight:600;">
                  </div>

                  <div style="display:grid; grid-template-columns:1fr 1fr; gap:10px;">
                    <div>
                      <label style="font-size:12px; font-weight:700; display:block; margin-bottom:4px; color:#334155;">Lớp học <span style="color:#ef4444;">*</span></label>
                      <select id="hw-class-select" class="form-input" style="background:#ffffff; cursor:pointer; padding:8px 12px; font-size:13px;">
                        ${classOptions}
                      </select>
                    </div>
                    <div>
                      <label style="font-size:12px; font-weight:700; display:block; margin-bottom:4px; color:#334155;">Chương học <span style="color:#ef4444;">*</span></label>
                      <select id="hw-chapter-select" class="form-input" style="background:#ffffff; cursor:pointer; padding:8px 12px; font-size:13px;">
                        <option value="">Đang tải chương...</option>
                      </select>
                    </div>
                  </div>

                  <div>
                    <label style="font-size:12px; font-weight:700; display:block; margin-bottom:4px; color:#334155;">Bài học <span style="color:#ef4444;">*</span></label>
                    <select id="hw-lesson-select" class="form-input" style="background:#ffffff; cursor:pointer; padding:8px 12px; font-size:13px;">
                      <option value="">Chọn chương trước...</option>
                    </select>
                  </div>

                  <div style="display:grid; grid-template-columns:1fr 1fr; gap:10px;">
                    <div>
                      <label style="font-size:12px; font-weight:700; display:block; margin-bottom:4px; color:#334155;">Chế độ làm bài <span style="color:#ef4444;">*</span></label>
                      <select id="hw-type" class="form-input" style="background:#ffffff; cursor:pointer; padding:8px 12px; font-size:13px; font-weight:600;">
                        <option value="PRACTICE" ${isEdit && hw?.type === 'PRACTICE' ? 'selected' : ''}>Luyện tập tự do</option>
                        <option value="EXAM" ${isEdit && hw?.type === 'EXAM' ? 'selected' : ''}>Phòng thi (Chống gian lận)</option>
                      </select>
                    </div>
                    <div>
                      <label style="font-size:12px; font-weight:700; display:block; margin-bottom:4px; color:#334155;">Thời gian (Phút)</label>
                      <input type="number" id="hw-duration" class="form-input" value="${isEdit ? hw?.durationMinutes || 45 : 45}" min="5" style="padding:8px 12px; font-size:13px;">
                    </div>
                  </div>

                  <div style="display:grid; grid-template-columns:1fr 1fr; gap:10px;">
                    <div>
                      <label style="font-size:12px; font-weight:700; display:block; margin-bottom:4px; color:#334155;">Số lần làm tối đa</label>
                      <input type="number" id="hw-max-attempts" class="form-input" value="${isEdit && hw?.maxAttempts !== undefined && hw?.maxAttempts !== null ? hw?.maxAttempts : (isEdit && hw?.max_attempts !== undefined && hw?.max_attempts !== null ? hw?.max_attempts : 0)}" min="0" style="padding:8px 12px; font-size:13px;" title="0 = Không giới hạn">
                    </div>
                    <div>
                      <label style="font-size:12px; font-weight:700; display:block; margin-bottom:4px; color:#334155;">Giới hạn vi phạm</label>
                      <input type="number" id="hw-max-violations" class="form-input" value="${isEdit && hw?.maxViolations !== undefined ? hw?.maxViolations : 3}" min="1" max="10" style="padding:8px 12px; font-size:13px;">
                    </div>
                  </div>

                  <div>
                    <label style="font-size:12px; font-weight:700; display:block; margin-bottom:4px; color:#334155;">Hạn chót nộp bài (Deadline)</label>
                    <input type="datetime-local" id="hw-deadline" class="form-input" value="${deadlineVal}" style="padding:8px 12px; font-size:13px; background:#ffffff;">
                  </div>

                  <div style="margin-top:4px;">
                    <button class="btn-primary" id="save-homework-btn" style="width:100%; padding:11px 16px; font-size:14px; font-weight:700; cursor:pointer; height:44px; border-radius:10px; background:#0066cc; box-shadow:0 3px 10px rgba(0,102,204,0.25);">
                      <i class="fa-solid fa-cloud-arrow-up"></i> ${isEdit ? 'Cập nhật bài tập' : 'Lưu & Xuất bản đề thi'}
                    </button>
                  </div>
                </div>
              </div>

              <!-- Answer Key Matrix Section -->
              <div id="answer-matrix-container" style="display:flex; flex-direction:column; gap:16px;">
                ${currentInputMode === 'latex' ? renderLatexMatrixPanel() : renderPdfMatrixPanel()}
              </div>

            </div>
          </div>
        </div>
      </div>
    </div>
  `
}

function renderLatexInputPanel() {
  const parsedQuestions = parsedLatexData?.questions || []
  const hasParsed = parsedQuestions.length > 0
  const errors = parsedLatexData?.errors || []

  return `
    <div class="card" style="margin:0; padding:20px; border:1px solid #e2e8f0; border-radius:14px; background:#ffffff;">
      <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:14px;">
        <h3 style="font-family:var(--font-heading); font-size:16px; font-weight:700; color:#0f172a; margin:0; display:flex; align-items:center; gap:8px;">
          <i class="fa-solid fa-file-code" style="color:#0066cc;"></i> Mã nguồn LaTeX đề thi
        </h3>

        <div style="display:flex; gap:8px;">
          <input type="file" id="latex-file-input" accept=".tex,.txt" style="display:none;">
          <button type="button" class="btn-secondary" onclick="document.getElementById('latex-file-input').click()" style="padding:6px 12px; font-size:12px; cursor:pointer; display:inline-flex; align-items:center; gap:6px; border-radius:8px;">
            <i class="fa-solid fa-upload"></i> Tải file .tex
          </button>
          <button type="button" class="btn-secondary" id="clear-latex-btn" style="padding:6px 12px; font-size:12px; cursor:pointer; display:inline-flex; align-items:center; gap:6px; border-radius:8px; color:#ef4444; border-color:#fecaca;">
            <i class="fa-solid fa-trash"></i> Xóa
          </button>
        </div>
      </div>

      <!-- LaTeX Textarea Editor -->
      <textarea id="latex-source-textarea" class="latex-textarea-editor" placeholder="Dán mã nguồn LaTeX của đề thi vào đây... (Hỗ trợ cú pháp \\Cau, \\choice, \\choiceTwo, \\choiceFour, \\choiceTF, \\ce{...}, tkz-tab...)" style="margin-bottom:12px;">${latexInputText}</textarea>

      <!-- Quick Action Toolbar: Quick Answer Bar & Parse Button -->
      <div style="background:#f8fafc; border:1px solid #e2e8f0; border-radius:10px; padding:12px; margin-bottom:16px;">
        <div style="font-size:12px; font-weight:700; color:#334155; margin-bottom:8px; display:flex; align-items:center; gap:6px;">
          <i class="fa-solid fa-bolt" style="color:#f59e0b;"></i> Nhập đáp án nhanh (Dành cho đề chưa có đáp án trong mã LaTeX)
        </div>
        
        <div style="display:flex; gap:8px; flex-wrap:wrap;">
          <input type="text" id="quick-key-string-input" class="form-input" placeholder="Ví dụ: 1A 2B 3C 4D 5A... hoặc dán mã JSON..." style="flex:1; min-width:240px; padding:7px 12px; font-size:13px;">
          <button type="button" class="btn-secondary" id="apply-quick-key-btn" style="padding:7px 14px; font-size:12px; font-weight:700; background:#eff6ff; color:#0066cc; border-color:#bfdbfe; cursor:pointer; border-radius:8px;">
            Áp dụng đáp án
          </button>
          <button type="button" class="btn-secondary" id="btn-paste-json-answers" style="padding:7px 14px; font-size:12px; font-weight:700; background:#f0fdf4; color:#15803d; border:1px solid #bbf7d0; cursor:pointer; border-radius:8px; display:inline-flex; align-items:center; gap:6px;">
            <i class="fa-solid fa-paste"></i> Dán JSON đáp án
          </button>
        </div>
      </div>

      <!-- Parse Action Button -->
      <div style="display:flex; justify-content:space-between; align-items:center; gap:12px; margin-bottom:16px;">
        <button type="button" class="btn-primary" id="btn-parse-latex" style="padding:10px 20px; font-size:14px; font-weight:700; cursor:pointer; border-radius:10px; background:#0066cc; display:inline-flex; align-items:center; gap:8px;">
          <i class="fa-solid fa-wand-magic-sparkles"></i> Phân tích cú pháp & Xem trước đề thi
        </button>

        ${hasParsed ? `
          <span style="font-size:13px; font-weight:700; color:#16a34a;">
            <i class="fa-solid fa-circle-check"></i> Đã bóc tách thành công ${parsedQuestions.length} câu hỏi
          </span>
        ` : ''}
      </div>

      <!-- Errors diagnostics alert banner -->
      ${errors.length > 0 ? `
        <div class="parse-error-card">
          <div style="font-weight:700; margin-bottom:6px; display:flex; align-items:center; gap:6px;">
            <i class="fa-solid fa-triangle-exclamation"></i> Phát hiện ${errors.length} cảnh báo cú pháp LaTeX:
          </div>
          <ul style="margin:0; padding-left:20px; line-height:1.5;">
            ${errors.map(err => `<li><strong>Câu ${err.questionNumber}:</strong> ${err.reason}</li>`).join('')}
          </ul>
        </div>
      ` : ''}

      <!-- Rendered Live Preview Section -->
      ${hasParsed ? `
        <div style="border-top:2px solid #e2e8f0; padding-top:16px; margin-top:8px;">
          <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:16px;">
            <h4 style="font-family:var(--font-heading); font-size:15px; font-weight:700; color:#0f172a; margin:0;">
              Bản xem trước đề thi tương tác (${parsedQuestions.length} câu)
            </h4>
          </div>

          <div id="latex-rendered-preview-container" style="max-height:600px; overflow-y:auto; padding-right:6px;">
            ${renderQuestionsPreviewHtml(parsedQuestions)}
          </div>
        </div>
      ` : `
        <div style="text-align:center; padding:40px 20px; color:#64748b; background:#f8fafc; border:1px dashed #cbd5e1; border-radius:10px;">
          <i class="fa-solid fa-file-circle-question" style="font-size:40px; color:#94a3b8; margin-bottom:12px; display:block;"></i>
          <p style="margin:0; font-size:14px; font-weight:600;">Chưa có dữ liệu xem trước</p>
          <p style="margin:4px 0 0 0; font-size:12px;">Dán mã LaTeX hoặc tải file .tex rồi bấm "Phân tích cú pháp & Xem trước đề thi"</p>
        </div>
      `}
    </div>
  `
}

function renderQuestionsPreviewHtml(questions) {
  let html = ''
  let lastPart = null

  questions.forEach(q => {
    if (q.partTitle && q.partTitle !== lastPart) {
      lastPart = q.partTitle
      html += `
        <div style="background:#0066cc; color:#ffffff; padding:8px 14px; border-radius:8px; font-weight:700; font-size:14px; margin:16px 0 12px 0;">
          ${q.partTitle}
        </div>
      `
    }

    const isEditing = editingQuestionNumber === q.questionNumber
    const isSelected = selectedQuestionForImage === q.questionNumber
    const typeBadge = q.questionType === 'MULTIPLE_CHOICE' ? 'Trắc nghiệm ABCD' : (q.questionType === 'TRUE_FALSE' ? 'Đúng / Sai' : 'Trả lời ngắn')

    if (isEditing) {
      // INLINE LATEX EDITOR VIEW
      const rawCode = q.rawBlock || ''
      const editError = singleQuestionEditErrors[q.questionNumber] || q.parseError || null

      html += `
        <div class="question-card-item editing-single-latex" data-qnum="${q.questionNumber}" style="padding:16px; margin-bottom:14px; border:2px solid #2563eb; background:#f8fafc; border-radius:12px; box-shadow:0 4px 14px rgba(37,99,235,0.12);">
          <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:10px; padding-bottom:8px; border-bottom:1px solid #e2e8f0;">
            <div style="display:flex; align-items:center; gap:8px;">
              <span class="question-badge" style="background:#2563eb; color:#ffffff; font-size:12px; padding:2px 8px;">Câu ${q.questionNumber}</span>
              <span style="font-size:12px; font-weight:700; color:#1e40af;"><i class="fa-solid fa-code"></i> Sửa mã nguồn LaTeX câu này</span>
            </div>
            <div style="font-size:11px; color:#64748b; font-weight:600;">
              Chỉnh sửa riêng câu ${q.questionNumber}
            </div>
          </div>

          ${editError ? `
            <div style="margin-bottom:10px; padding:8px 12px; background:#fef2f2; border:1px solid #fecaca; border-radius:8px; color:#b91c1c; font-size:12px; display:flex; align-items:flex-start; gap:8px;">
              <i class="fa-solid fa-circle-exclamation" style="margin-top:2px;"></i>
              <div><strong>Cảnh báo/Lỗi:</strong> ${escapeHtml(editError)}</div>
            </div>
          ` : ''}

          <div style="margin-bottom:8px;">
            <label style="display:block; font-size:12px; font-weight:700; color:#334155; margin-bottom:4px;">
              Mã LaTeX câu hỏi (Nội dung, công thức, TikZ, phương án, đáp án):
            </label>
            <textarea id="single-q-latex-textarea-${q.questionNumber}" class="single-q-latex-textarea" rows="7" style="width:100%; font-family:var(--font-mono, 'Fira Code', monospace); font-size:13px; line-height:1.5; padding:10px 12px; border:1.5px solid #94a3b8; border-radius:8px; background:#ffffff; color:#0f172a; resize:vertical; box-sizing:border-box;" placeholder="Nhập mã LaTeX của câu hỏi...">${escapeHtml(rawCode)}</textarea>
          </div>

          <div style="margin-bottom:12px; font-size:11px; color:#475569; background:#ffffff; border:1px solid #e2e8f0; padding:8px 10px; border-radius:6px; line-height:1.6;">
            <div style="font-weight:700; color:#0369a1; margin-bottom:2px;"><i class="fa-solid fa-lightbulb"></i> Mẹo cú pháp:</div>
            <div>• Trắc nghiệm ABCD: <code>% Câu ${q.questionNumber} - Key: A</code> và <code>\\choice{\\True A}{B}{C}{D}</code></div>
            <div>• Đúng / Sai 4 ý: <code>\\choiceTF{\\True Ý 1}{Ý 2}{\\True Ý 3}{Ý 4}</code> hoặc <code>% Key: a-Đ, b-S, c-Đ, d-S</code></div>
            <div>• Trả lời ngắn: <code>\\shortans{12.5}</code> hoặc <code>% Key: 12.5</code></div>
            <div>• Bảng biến thiên TikZ: <code>\\begin{tikzpicture} \\tkzTabInit... \\tkzTabLine... \\end{tikzpicture}</code></div>
            <div>• Ảnh đính kèm: <code>[HÌNH: ten_anh.png]</code> hoặc <code>\\includegraphics{ten_anh.png}</code></div>
          </div>

          <div style="display:flex; justify-content:flex-end; gap:8px;">
            <button type="button" class="btn-cancel-single-q-latex" data-qnum="${q.questionNumber}" style="padding:6px 14px; background:#f1f5f9; border:1px solid #cbd5e1; border-radius:6px; font-size:12px; font-weight:600; color:#475569; cursor:pointer;">
              <i class="fa-solid fa-xmark"></i> Hủy
            </button>
            <button type="button" class="btn-save-single-q-latex" data-qnum="${q.questionNumber}" style="padding:6px 16px; background:#2563eb; color:#ffffff; border:none; border-radius:6px; font-size:12px; font-weight:700; cursor:pointer; display:inline-flex; align-items:center; gap:6px; box-shadow:0 1px 3px rgba(37,99,235,0.3);">
              <i class="fa-solid fa-floppy-disk"></i> Lưu & Render lại câu này
            </button>
          </div>
        </div>
      `
      return
    }

    // NORMAL PREVIEW CARD
    let attachedImg = q.attachedImage || null
    if (!attachedImg && q.content) {
      const matchDataImg = q.content.match(/<img[^>]+src=["'](data:image\/[^"']+|https?:\/\/[^"']+)["']/i)
      if (matchDataImg) {
        attachedImg = matchDataImg[1]
        q.attachedImage = attachedImg
      }
    }

    let displayPrompt = q.content || ''
    if (attachedImg) {
      displayPrompt = displayPrompt.replace(/<div class="latex-image-container"[^>]*>[\s\S]*?<\/div>\s*<\/div>/gi, '')
      displayPrompt = displayPrompt.replace(/<div class="question-image-wrapper"[^>]*>[\s\S]*?<\/div>/gi, '')
    }

    html += `
      <div class="question-card-item ${isSelected ? 'selected-for-paste' : ''} ${q.parseError ? 'has-parse-error' : ''}" data-qnum="${q.questionNumber}" tabindex="0" style="padding:16px; margin-bottom:14px; cursor:default; ${q.parseError ? 'border-color:#fdba74; background:#fffcf9;' : ''}">
        <div class="question-card-header" style="display:flex; justify-content:space-between; align-items:center; margin-bottom:10px; padding-bottom:8px; border-bottom:1px solid #f1f5f9;">
          <div style="display:flex; align-items:center; gap:8px; flex-wrap:wrap;">
            <span class="question-badge" style="font-size:12px; padding:2px 8px;">Câu ${q.questionNumber}</span>
            <span style="font-size:11px; font-weight:700; color:#64748b; text-transform:uppercase;">${typeBadge}</span>
            ${q.parseError ? `
              <span class="badge" style="background:#fef2f2; color:#b91c1c; font-size:11px; font-weight:700; border:1px solid #fecaca;">
                <i class="fa-solid fa-triangle-exclamation"></i> Có cảnh báo cú pháp
              </span>
            ` : ''}
            ${isSelected ? `
              <span class="badge" style="background:#e0f2fe; color:#0369a1; font-size:11px; font-weight:700; display:inline-flex; align-items:center; gap:4px; padding:2px 8px;">
                <i class="fa-solid fa-crosshairs"></i> Đang chọn (Bấm Ctrl+V để dán ảnh)
              </span>
            ` : ''}
          </div>

          <div style="display:flex; align-items:center; gap:6px;">
            <button type="button" class="btn-edit-question-latex" data-qnum="${q.questionNumber}" style="background:#eff6ff; border:1px solid #bfdbfe; border-radius:6px; padding:4px 9px; font-size:11px; font-weight:600; color:#1d4ed8; cursor:pointer; display:inline-flex; align-items:center; gap:5px;" title="Chỉnh sửa mã LaTeX của riêng câu này">
              <i class="fa-solid fa-pen-to-square"></i> Sửa LaTeX
            </button>
            <input type="file" accept="image/*" class="q-image-file-input" data-qnum="${q.questionNumber}" style="display:none;" />
            <button type="button" class="btn-attach-image-trigger" data-qnum="${q.questionNumber}" style="background:#f8fafc; border:1px solid #cbd5e1; border-radius:6px; padding:4px 9px; font-size:11px; font-weight:600; color:#475569; cursor:pointer; display:inline-flex; align-items:center; gap:5px;" title="Chọn file ảnh hoặc bấm Ctrl+V để dán ảnh">
              <i class="fa-regular fa-image" style="color:#0066cc;"></i>
              ${attachedImg ? 'Đổi ảnh' : '+ Thêm/Dán ảnh'}
            </button>
            ${attachedImg ? `
              <button type="button" class="btn-remove-attached-image" data-qnum="${q.questionNumber}" style="background:#fff1f2; border:1px solid #fecdd3; border-radius:6px; padding:4px 8px; font-size:11px; font-weight:600; color:#e11d48; cursor:pointer;" title="Xóa ảnh khỏi câu hỏi này">
                <i class="fa-solid fa-trash"></i>
              </button>
            ` : ''}
          </div>
        </div>

        ${q.parseError ? `
          <div style="margin-bottom:12px; padding:8px 12px; background:#fff7ed; border:1.5px solid #fdba74; border-radius:8px; color:#9a3412; font-size:12px; display:flex; justify-content:space-between; align-items:center; gap:8px;">
            <div style="display:flex; align-items:center; gap:6px;">
              <i class="fa-solid fa-triangle-exclamation" style="font-size:14px; color:#ea580c;"></i>
              <span><strong>Cảnh báo bóc tách:</strong> ${escapeHtml(q.parseError)}</span>
            </div>
            <button type="button" class="btn-edit-question-latex" data-qnum="${q.questionNumber}" style="background:#ea580c; color:#ffffff; border:none; border-radius:6px; padding:4px 10px; font-size:11px; font-weight:700; cursor:pointer; display:inline-flex; align-items:center; gap:4px; white-space:nowrap;">
              <i class="fa-solid fa-pen-to-square"></i> Sửa câu này ngay
            </button>
          </div>
        ` : ''}

        <div class="question-prompt-text" style="font-size:14px; margin-bottom:12px;">
          ${displayPrompt}
        </div>

        <!-- Khung hiển thị ảnh đính kèm (nếu có) -->
        ${attachedImg ? `
          <div class="question-image-attached-box" style="margin:12px 0; padding:10px; background:#f8fafc; border:1px solid #e2e8f0; border-radius:10px; text-align:center;">
            <img src="${attachedImg}" alt="Hình câu ${q.questionNumber}" style="max-width:100%; max-height:280px; object-fit:contain; border-radius:6px; box-shadow:0 1px 4px rgba(0,0,0,0.08); display:block; margin:0 auto;" />
            <div style="margin-top:6px; font-size:11px; color:#16a34a; font-weight:600; display:flex; align-items:center; justify-content:center; gap:6px;">
              <i class="fa-solid fa-circle-check"></i> Đã gắn hình ảnh (Thầy cô có thể bấm Ctrl+V để dán ảnh mới đè lên)
            </div>
          </div>
        ` : (q.imageName ? `
          <div class="question-image-slot-dropzone" data-qnum="${q.questionNumber}">
            <div style="font-size:13px; font-weight:700; color:#0284c7; display:flex; align-items:center; justify-content:center; gap:8px;">
              <i class="fa-solid fa-cloud-arrow-up" style="font-size:18px;"></i>
              <span>Vị trí hình ảnh: <strong>${q.imageName}</strong></span>
            </div>
            <p style="margin:4px 0 0 0; font-size:12px; color:#475569;">
              👉 Bấm để chọn ảnh từ máy hoặc <strong>chụp ảnh màn hình (Win + Shift + S) rồi bấm Ctrl + V</strong> để dán trực tiếp
            </p>
          </div>
        ` : '')}

        ${q.questionType === 'MULTIPLE_CHOICE' && q.options ? `
          <div style="display:grid; grid-template-columns:1fr 1fr; gap:8px;">
            ${q.options.map(opt => `
              <div style="display:flex; align-items:center; gap:8px; padding:8px 12px; border:1px solid ${q.mcAnswer === opt.key ? '#10b981' : '#e2e8f0'}; border-radius:8px; background:${q.mcAnswer === opt.key ? '#f0fdf4' : '#ffffff'};">
                <strong style="width:24px; height:24px; border-radius:50%; background:${q.mcAnswer === opt.key ? '#10b981' : '#f1f5f9'}; color:${q.mcAnswer === opt.key ? '#ffffff' : '#334155'}; display:flex; align-items:center; justify-content:center; font-size:12px;">${opt.key}</strong>
                <span style="font-size:13px;">${opt.content}</span>
                ${q.mcAnswer === opt.key ? '<i class="fa-solid fa-check" style="color:#16a34a; margin-left:auto;"></i>' : ''}
              </div>
            `).join('')}
          </div>
        ` : ''}

        ${q.questionType === 'TRUE_FALSE' && q.statements ? `
          <div style="display:flex; flex-direction:column; gap:6px;">
            ${q.statements.map(st => {
              const isTrue = q.tfAnswers ? q.tfAnswers[st.key] : false
              return `
                <div style="display:flex; justify-content:space-between; align-items:center; padding:8px 12px; border:1px solid #e2e8f0; border-radius:8px; background:#f8fafc; font-size:13px;">
                  <span><strong>${st.key})</strong> ${st.content}</span>
                  <span class="badge" style="background:${isTrue ? '#dcfce7' : '#fee2e2'}; color:${isTrue ? '#15803d' : '#b91c1c'}; font-size:11px; padding:2px 8px; font-weight:700;">
                    ${isTrue ? 'ĐÚNG' : 'SAI'}
                  </span>
                </div>
              `
            }).join('')}
          </div>
        ` : ''}

        ${q.questionType === 'SHORT_ANSWER' ? `
          <div style="background:#f0fdf4; border:1px solid #bbf7d0; padding:8px 12px; border-radius:8px; font-size:13px; color:#166534;">
            Đáp án dự kiến: <strong>${q.saAnswer !== null && q.saAnswer !== undefined ? q.saAnswer : 'Chưa thiết lập'}</strong>
          </div>
        ` : ''}
      </div>
    `
  })

  return html
}

function handleImageFileForQuestion(file, qNum) {
  if (!file || !file.type.startsWith('image/')) {
    showToast('Tệp được chọn không phải là hình ảnh!', 'error')
    return
  }

  const reader = new FileReader()
  reader.onload = (e) => {
    const dataUrl = e.target.result
    attachImageToQuestion(qNum, dataUrl)
  }
  reader.readAsDataURL(file)
}

function attachImageToQuestion(qNum, dataUrl) {
  if (!parsedLatexData?.questions) return
  const q = parsedLatexData.questions.find(item => item.questionNumber === qNum)
  if (!q) return

  q.attachedImage = dataUrl
  selectedQuestionForImage = qNum

  refreshQuestionsPreview()
  showToast(`Đã gắn hình ảnh vào Câu ${qNum} thành công!`, 'success')
}

function removeImageFromQuestion(qNum) {
  if (!parsedLatexData?.questions) return
  const q = parsedLatexData.questions.find(item => item.questionNumber === qNum)
  if (!q) return

  q.attachedImage = null
  refreshQuestionsPreview()
  showToast(`Đã xóa hình ảnh khỏi Câu ${qNum}`, 'info')
}

function refreshQuestionsPreview() {
  const previewContainer = document.getElementById('latex-rendered-preview-container')
  if (previewContainer && parsedLatexData?.questions) {
    previewContainer.innerHTML = renderQuestionsPreviewHtml(parsedLatexData.questions)
    bindQuestionImageEvents(previewContainer)
    renderMath(previewContainer)
  }
}

function refreshAnswerMatrix() {
  const matrixContainer = document.getElementById('answer-matrix-container')
  if (matrixContainer && currentInputMode === 'latex') {
    matrixContainer.innerHTML = renderLatexMatrixPanel()
    bindLatexMatrixEvents(matrixContainer)
  }
}

function bindLatexMatrixEvents(container) {
  if (!container) return

  container.querySelectorAll('.latex-matrix-mc-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      const qNum = parseInt(btn.getAttribute('data-qnum'), 10)
      const opt = btn.getAttribute('data-option')
      mcAnswers[qNum] = opt
      if (parsedLatexData?.questions) {
        const found = parsedLatexData.questions.find(q => q.questionNumber === qNum)
        if (found) found.mcAnswer = opt
      }
      container.querySelectorAll(`.latex-matrix-mc-btn[data-qnum="${qNum}"]`).forEach(b => {
        const isSel = b.getAttribute('data-option') === opt
        b.style.background = isSel ? '#0066cc' : '#ffffff'
        b.style.color = isSel ? '#ffffff' : '#334155'
        b.style.borderColor = isSel ? '#0066cc' : '#cbd5e1'
      })
      refreshQuestionsPreview()
    })
  })

  container.querySelectorAll('.latex-matrix-tf-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      const qNum = parseInt(btn.getAttribute('data-qnum'), 10)
      const sub = btn.getAttribute('data-sub')
      const val = btn.getAttribute('data-val') === 'true'

      if (!tfAnswers[qNum]) tfAnswers[qNum] = {}
      tfAnswers[qNum][sub] = val
      if (parsedLatexData?.questions) {
        const found = parsedLatexData.questions.find(q => q.questionNumber === qNum)
        if (found) {
          if (!found.tfAnswers) found.tfAnswers = {}
          found.tfAnswers[sub] = val
        }
      }

      const parent = btn.parentElement
      if (parent) {
        parent.querySelectorAll('.latex-matrix-tf-btn').forEach(b => {
          const isVal = b.getAttribute('data-val') === (val ? 'true' : 'false')
          b.style.background = isVal ? (val ? '#16a34a' : '#dc2626') : '#ffffff'
          b.style.color = isVal ? '#ffffff' : '#475569'
          b.style.borderColor = isVal ? (val ? '#16a34a' : '#dc2626') : '#cbd5e1'
        })
      }
      refreshQuestionsPreview()
    })
  })

  container.querySelectorAll('.latex-matrix-sa-input').forEach(input => {
    input.addEventListener('input', (e) => {
      const qNum = parseInt(input.getAttribute('data-qnum'), 10)
      saAnswers[qNum] = e.target.value.trim()
      if (parsedLatexData?.questions) {
        const found = parsedLatexData.questions.find(q => q.questionNumber === qNum)
        if (found) found.saAnswer = e.target.value.trim()
      }
    })
  })
}

function bindQuestionImageEvents(container) {
  if (!container) return

  // Click on question card to select it for paste
  container.querySelectorAll('.question-card-item').forEach(card => {
    card.addEventListener('click', (e) => {
      if (e.target.closest('button') || e.target.closest('input') || e.target.closest('textarea')) return
      const qNum = parseInt(card.dataset.qnum, 10)
      if (selectedQuestionForImage !== qNum) {
        selectedQuestionForImage = qNum
        container.querySelectorAll('.question-card-item').forEach(c => c.classList.remove('selected-for-paste'))
        card.classList.add('selected-for-paste')
      }
    })
  })

  // Edit single question LaTeX button
  container.querySelectorAll('.btn-edit-question-latex').forEach(btn => {
    btn.addEventListener('click', (e) => {
      e.stopPropagation()
      const qNum = parseInt(btn.dataset.qnum, 10)
      editingQuestionNumber = qNum
      refreshQuestionsPreview()
      setTimeout(() => {
        const ta = document.getElementById(`single-q-latex-textarea-${qNum}`)
        if (ta) {
          ta.focus()
          ta.scrollIntoView({ behavior: 'smooth', block: 'center' })
        }
      }, 50)
    })
  })

  // Cancel edit single question button
  container.querySelectorAll('.btn-cancel-single-q-latex').forEach(btn => {
    btn.addEventListener('click', (e) => {
      e.stopPropagation()
      const qNum = parseInt(btn.dataset.qnum, 10)
      editingQuestionNumber = null
      delete singleQuestionEditErrors[qNum]
      refreshQuestionsPreview()
    })
  })

  // Save single question LaTeX button
  container.querySelectorAll('.btn-save-single-q-latex').forEach(btn => {
    btn.addEventListener('click', (e) => {
      e.stopPropagation()
      const qNum = parseInt(btn.dataset.qnum, 10)
      const ta = document.getElementById(`single-q-latex-textarea-${qNum}`)
      const newRawCode = ta ? ta.value.trim() : ''

      if (!newRawCode) {
        showToast('Mã câu hỏi không được để trống!', 'warning')
        return
      }

      if (!parsedLatexData?.questions) return
      const oldIdx = parsedLatexData.questions.findIndex(item => item.questionNumber === qNum)
      if (oldIdx === -1) return
      const oldQ = parsedLatexData.questions[oldIdx]

      const { question: updatedQ, error, partTitle } = parseSingleQuestionBlock(newRawCode, qNum, oldQ.partTitle)

      if (error) {
        singleQuestionEditErrors[qNum] = error
        showToast(`Cảnh báo bóc tách: ${error}`, 'warning')
      } else {
        delete singleQuestionEditErrors[qNum]
      }

      if (updatedQ) {
        // Retain attached image if any
        if (oldQ.attachedImage) {
          updatedQ.attachedImage = oldQ.attachedImage
        }
        if (partTitle) {
          updatedQ.partTitle = partTitle
        }

        parsedLatexData.questions[oldIdx] = updatedQ

        // Sync answer matrix
        if (updatedQ.questionType === 'MULTIPLE_CHOICE' && updatedQ.mcAnswer) {
          mcAnswers[qNum] = updatedQ.mcAnswer
        } else if (updatedQ.questionType === 'TRUE_FALSE' && updatedQ.tfAnswers) {
          tfAnswers[qNum] = updatedQ.tfAnswers
        } else if (updatedQ.questionType === 'SHORT_ANSWER' && updatedQ.saAnswer) {
          saAnswers[qNum] = updatedQ.saAnswer
        }

        editingQuestionNumber = null
        refreshQuestionsPreview()
        refreshAnswerMatrix()
        showToast(`Đã lưu và render lại Câu ${qNum}!`, 'success')
      }
    })
  })

  // Trigger file chooser button
  container.querySelectorAll('.btn-attach-image-trigger').forEach(btn => {
    btn.addEventListener('click', (e) => {
      e.stopPropagation()
      const qNum = parseInt(btn.dataset.qnum, 10)
      selectedQuestionForImage = qNum
      const fileInput = container.querySelector(`.q-image-file-input[data-qnum="${qNum}"]`)
      fileInput?.click()
    })
  })

  // Dropzone click & drag drop
  container.querySelectorAll('.question-image-slot-dropzone').forEach(dz => {
    dz.addEventListener('click', (e) => {
      e.stopPropagation()
      const qNum = parseInt(dz.dataset.qnum, 10)
      selectedQuestionForImage = qNum
      const fileInput = container.querySelector(`.q-image-file-input[data-qnum="${qNum}"]`)
      fileInput?.click()
    })

    dz.addEventListener('dragover', (e) => {
      e.preventDefault()
      dz.style.background = '#e0f2fe'
      dz.style.borderColor = '#0284c7'
    })
    dz.addEventListener('dragleave', () => {
      dz.style.background = '#f0f9ff'
      dz.style.borderColor = '#38bdf8'
    })
    dz.addEventListener('drop', (e) => {
      e.preventDefault()
      dz.style.background = '#f0f9ff'
      dz.style.borderColor = '#38bdf8'
      const file = e.dataTransfer?.files?.[0]
      const qNum = parseInt(dz.dataset.qnum, 10)
      if (file && qNum) {
        handleImageFileForQuestion(file, qNum)
      }
    })
  })

  // File input change
  container.querySelectorAll('.q-image-file-input').forEach(input => {
    input.addEventListener('change', (e) => {
      const file = e.target.files?.[0]
      const qNum = parseInt(input.dataset.qnum, 10)
      if (file && qNum) {
        handleImageFileForQuestion(file, qNum)
      }
    })
  })

  // Remove image button
  container.querySelectorAll('.btn-remove-attached-image').forEach(btn => {
    btn.addEventListener('click', (e) => {
      e.stopPropagation()
      const qNum = parseInt(btn.dataset.qnum, 10)
      removeImageFromQuestion(qNum)
    })
  })
}

function registerGlobalPasteListener() {
  if (isPasteListenerRegistered) return
  isPasteListenerRegistered = true

  document.addEventListener('paste', (e) => {
    const previewContainer = document.getElementById('latex-rendered-preview-container')
    if (!previewContainer || !parsedLatexData?.questions) return

    const items = e.clipboardData?.items
    if (!items) return

    let imageItem = null
    for (let i = 0; i < items.length; i++) {
      if (items[i].type.indexOf('image') !== -1) {
        imageItem = items[i]
        break
      }
    }

    if (imageItem) {
      let targetQNum = selectedQuestionForImage

      if (!targetQNum) {
        const hoveredCard = document.querySelector('.question-card-item:hover')
        if (hoveredCard) {
          targetQNum = parseInt(hoveredCard.dataset.qnum, 10)
        }
      }

      if (!targetQNum) {
        const waitingQ = parsedLatexData.questions.find(q => q.imageName && !q.attachedImage)
        if (waitingQ) targetQNum = waitingQ.questionNumber
      }

      if (!targetQNum && parsedLatexData.questions.length > 0) {
        targetQNum = parsedLatexData.questions[0].questionNumber
      }

      if (targetQNum) {
        e.preventDefault()
        const blob = imageItem.getAsFile()
        handleImageFileForQuestion(blob, targetQNum)
      }
    }
  })
}

function renderLatexMatrixPanel() {
  const parsedQuestions = parsedLatexData?.questions || []
  if (parsedQuestions.length === 0) {
    return `
      <div class="card" style="margin:0; padding:16px; text-align:center; color:#64748b; font-size:13px;">
        <i class="fa-solid fa-table-cells" style="font-size:28px; color:#cbd5e1; margin-bottom:8px; display:block;"></i>
        Bảng đáp án sẽ tự động xuất hiện sau khi phân tích đề thi LaTeX
      </div>
    `
  }

  // Count answered
  let answeredCount = 0
  parsedQuestions.forEach(q => {
    if (q.questionType === 'MULTIPLE_CHOICE' && q.mcAnswer) answeredCount++
    else if (q.questionType === 'TRUE_FALSE' && q.tfAnswers) answeredCount++
    else if (q.questionType === 'SHORT_ANSWER' && q.saAnswer) answeredCount++
  })

  return `
    <div class="card" style="margin:0; padding:16px; border:1px solid #e2e8f0; border-radius:14px; background:#ffffff;">
      <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:12px; padding-bottom:8px; border-bottom:1px solid #f1f5f9;">
        <h3 style="font-family:var(--font-heading); font-size:15px; font-weight:700; color:#0f172a; margin:0;">
          Ma trận đáp án (${parsedQuestions.length} câu)
        </h3>
        <span class="badge" style="background:#ecfdf5; color:#065f46; font-size:12px; font-weight:700; border:1px solid #a7f3d0;">
          Đã có đáp án: ${answeredCount}/${parsedQuestions.length}
        </span>
      </div>

      <div style="display:flex; flex-direction:column; gap:10px; max-height:480px; overflow-y:auto; padding-right:4px;">
        ${parsedQuestions.map(q => {
          const qNum = q.questionNumber

          if (q.questionType === 'MULTIPLE_CHOICE') {
            return `
              <div style="display:flex; align-items:center; justify-content:space-between; padding:6px 10px; background:#f8fafc; border:1px solid #e2e8f0; border-radius:8px;">
                <span style="font-weight:700; font-size:12px; color:#334155; width:50px;">Câu ${qNum}</span>
                <div style="display:flex; gap:4px;">
                  ${['A', 'B', 'C', 'D'].map(opt => `
                    <button type="button" class="latex-matrix-mc-btn" data-qnum="${qNum}" data-option="${opt}" style="
                      width:28px; height:28px; border-radius:6px; font-weight:700; font-size:12px; cursor:pointer; transition:all 0.15s ease;
                      border:1px solid ${q.mcAnswer === opt ? '#0066cc' : '#cbd5e1'};
                      background:${q.mcAnswer === opt ? '#0066cc' : '#ffffff'};
                      color:${q.mcAnswer === opt ? '#ffffff' : '#334155'};
                    ">${opt}</button>
                  `).join('')}
                </div>
              </div>
            `
          }

          if (q.questionType === 'TRUE_FALSE') {
            const tfObj = q.tfAnswers || {}
            return `
              <div style="background:#f8fafc; border:1px solid #e2e8f0; border-radius:8px; padding:8px 10px;">
                <div style="font-weight:700; font-size:12px; color:#0f172a; margin-bottom:6px;">Câu ${qNum} (Đúng/Sai)</div>
                <div style="display:grid; grid-template-columns:1fr 1fr; gap:4px;">
                  ${['a', 'b', 'c', 'd'].map(sub => {
                    const isTrue = tfObj[sub] === true
                    return `
                      <div style="display:flex; align-items:center; justify-content:space-between; background:#ffffff; padding:2px 6px; border-radius:6px; border:1px solid #e2e8f0; font-size:11px;">
                        <span style="font-weight:700; color:#475569;">${sub})</span>
                        <div style="display:flex; gap:3px;">
                          <button type="button" class="latex-matrix-tf-btn" data-qnum="${qNum}" data-sub="${sub}" data-val="true" style="
                            padding:1px 6px; border-radius:4px; font-weight:700; font-size:10px; cursor:pointer;
                            border:1px solid ${isTrue ? '#16a34a' : '#cbd5e1'};
                            background:${isTrue ? '#16a34a' : '#ffffff'};
                            color:${isTrue ? '#ffffff' : '#475569'};
                          ">Đ</button>
                          <button type="button" class="latex-matrix-tf-btn" data-qnum="${qNum}" data-sub="${sub}" data-val="false" style="
                            padding:1px 6px; border-radius:4px; font-weight:700; font-size:10px; cursor:pointer;
                            border:1px solid ${tfObj[sub] === false ? '#dc2626' : '#cbd5e1'};
                            background:${tfObj[sub] === false ? '#dc2626' : '#ffffff'};
                            color:${tfObj[sub] === false ? '#ffffff' : '#475569'};
                          ">S</button>
                        </div>
                      </div>
                    `
                  }).join('')}
                </div>
              </div>
            `
          }

          if (q.questionType === 'SHORT_ANSWER') {
            return `
              <div style="display:flex; align-items:center; justify-content:space-between; padding:6px 10px; background:#f8fafc; border:1px solid #e2e8f0; border-radius:8px;">
                <span style="font-weight:700; font-size:12px; color:#334155; width:50px;">Câu ${qNum}</span>
                <input type="text" class="latex-matrix-sa-input form-input" data-qnum="${qNum}" placeholder="Đáp án..." value="${q.saAnswer !== null && q.saAnswer !== undefined ? q.saAnswer : ''}" style="width:140px; padding:3px 8px; font-size:12px; text-align:right;">
              </div>
            `
          }

          return ''
        }).join('')}
      </div>
    </div>
  `
}

function renderPdfViewerPanel(hw, isEdit, pdfDownloadUrl, pdfDownloadName) {
  return `
    <div class="pdf-viewer-container" style="box-shadow: 0 4px 12px rgba(0,0,0,0.05); border:1px solid #cbd5e1; display:flex; flex-direction:column; overflow:hidden; border-radius:14px; background:#ffffff;">
      <div class="pdf-toolbar" style="display:flex; justify-content:space-between; align-items:center; flex-wrap:nowrap; gap:10px; padding:10px 16px; border-bottom:1px solid #e2e8f0;">
        <div style="font-weight:700; color:#0f172a; display:flex; align-items:center; gap:8px; min-width:0; flex:1 1 auto; overflow:hidden;">
          <i class="fa-solid fa-file-pdf" style="color:#ef4444; font-size:18px; flex-shrink:0;"></i>
          <span id="pdf-viewer-title" style="overflow:hidden; text-overflow:ellipsis; white-space:nowrap; font-size:13px;" title="${hw?.pdfPath || 'Chưa chọn file PDF'}">${hw?.pdfPath || 'Chưa chọn file PDF'}</span>
        </div>
        <div style="display:flex; align-items:center; gap:8px; flex-shrink:0;">
          <input type="file" id="hw-pdf-file" accept=".pdf" style="display:none;">
          <button class="btn-primary" type="button" onclick="document.getElementById('hw-pdf-file').click()" style="padding:6px 12px; font-size:12px; border-radius:8px; cursor:pointer;">
            <i class="fa-solid fa-upload"></i> Chọn file PDF
          </button>
          <a id="download-hw-pdf-btn" href="${pdfDownloadUrl || '#'}" download="${pdfDownloadName}" target="_blank" rel="noopener noreferrer" style="padding:6px 12px; font-size:12px; text-decoration:none; ${pdfDownloadUrl ? 'background:#eff6ff; color:#0066cc; border:1px solid #bfdbfe; cursor:pointer;' : 'background:#f8fafc; color:#94a3b8; border:1px solid #e2e8f0; cursor:not-allowed; opacity:0.7;'} border-radius:8px; font-weight:600;">
            <i class="fa-solid fa-download"></i> Tải file
          </a>
        </div>
      </div>

      <div id="pdf-preview-container" class="pdf-iframe-wrapper" style="flex-grow:1; display:flex; height:calc(100vh - 240px); min-height:480px; background:#f8fafc; justify-content:center; align-items:center; position:relative;">
        <iframe id="pdf-preview-iframe" src="${isEdit && hw?.pdfUrl ? hw.pdfUrl.replace(/https?:\/\/kong:8000/g, import.meta.env.VITE_SUPABASE_URL || 'http://localhost:54321') : ''}" style="width:100%; height:100%; min-height:100%; border:none; ${isEdit && hw?.pdfUrl ? '' : 'display:none;'}"></iframe>
        ${!(isEdit && hw?.pdfUrl) ? `
          <div id="pdf-placeholder" style="color:#64748b; text-align:center; padding:20px;">
            <i class="fa-regular fa-file-pdf" style="font-size:48px; color:#cbd5e1; margin-bottom:12px; display:block;"></i>
            <span style="font-size:13px;">Vui lòng chọn file đề bài PDF để xem trước</span>
          </div>
        ` : ''}
      </div>
    </div>
  `
}

function renderPdfMatrixPanel() {
  return `
    <div class="card" style="border:2px solid #e0f2fe; background:#fafdfm; margin:0; padding:12px 16px;">
      <h3 style="font-family:var(--font-heading); font-size:14px; font-weight:700; color:#0369a1; margin-bottom:10px; display:flex; align-items:center; gap:8px;">
        <i class="fa-solid fa-sliders"></i> Cấu hình số lượng câu hỏi
      </h3>
      
      <div style="display:grid; grid-template-columns:1fr 1fr 1fr; gap:8px; margin-bottom:12px;">
        <div style="background:#ffffff; padding:8px; border:1px solid #e2e8f0; border-radius:8px;">
          <label style="font-size:11px; font-weight:700; color:#0f172a; display:block; margin-bottom:4px; text-align:center;">T.Nghiệm ABCD</label>
          <input type="number" id="cfg-mc-count" class="form-input" value="${currentConfig.mcCount}" min="0" max="100" style="font-weight:700; text-align:center; padding:4px; font-size:12px;">
        </div>
        <div style="background:#ffffff; padding:8px; border:1px solid #e2e8f0; border-radius:8px;">
          <label style="font-size:11px; font-weight:700; color:#0f172a; display:block; margin-bottom:4px; text-align:center;">Đúng / Sai</label>
          <input type="number" id="cfg-tf-count" class="form-input" value="${currentConfig.tfCount}" min="0" max="50" style="font-weight:700; text-align:center; padding:4px; font-size:12px;">
        </div>
        <div style="background:#ffffff; padding:8px; border:1px solid #e2e8f0; border-radius:8px;">
          <label style="font-size:11px; font-weight:700; color:#0f172a; display:block; margin-bottom:4px; text-align:center;">Trả lời ngắn</label>
          <input type="number" id="cfg-sa-count" class="form-input" value="${currentConfig.saCount}" min="0" max="50" style="font-weight:700; text-align:center; padding:4px; font-size:12px;">
        </div>
      </div>

      <button class="btn-primary" id="update-config-btn" style="width:100%; padding:8px 12px; font-size:12px; background:#0066cc; cursor:pointer;">
        <i class="fa-solid fa-arrows-rotate"></i> Cập nhật số lượng câu hỏi
      </button>
    </div>

    <!-- Part 1: MC -->
    <div class="card" style="margin:0; padding:16px;">
      <h3 style="font-family:var(--font-heading); font-size:14px; font-weight:700; color:#0f172a; margin-bottom:12px;">
        Phần I: Trắc nghiệm ABCD (${currentConfig.mcCount} câu)
      </h3>
      <div style="display:flex; flex-direction:column; gap:8px; max-height:260px; overflow-y:auto; padding-right:4px;">
        ${Array.from({ length: currentConfig.mcCount }, (_, i) => i + 1).map(qNum => {
          const sel = mcAnswers[qNum] || null
          return `
            <div style="display:flex; align-items:center; justify-content:space-between; padding:4px 8px; background:#f8fafc; border:1px solid #e2e8f0; border-radius:6px;">
              <span style="font-weight:700; font-size:12px; color:#334155;">Câu ${qNum}</span>
              <div style="display:flex; gap:4px;">
                ${['A', 'B', 'C', 'D'].map(opt => `
                  <button type="button" class="mc-option-btn" data-qnum="${qNum}" data-option="${opt}" style="
                    width:26px; height:26px; border-radius:4px; font-weight:700; font-size:11px; cursor:pointer;
                    border:1px solid ${sel === opt ? '#0066cc' : '#cbd5e1'};
                    background:${sel === opt ? '#0066cc' : '#ffffff'};
                    color:${sel === opt ? '#ffffff' : '#334155'};
                  ">${opt}</button>
                `).join('')}
              </div>
            </div>
          `
        }).join('')}
      </div>
    </div>

    <!-- Part 2: TF -->
    <div class="card" style="margin:0; padding:16px;">
      <h3 style="font-family:var(--font-heading); font-size:14px; font-weight:700; color:#0f172a; margin-bottom:12px;">
        Phần II: Đúng / Sai (${currentConfig.tfCount} câu)
      </h3>
      <div style="display:flex; flex-direction:column; gap:8px; max-height:260px; overflow-y:auto; padding-right:4px;">
        ${Array.from({ length: currentConfig.tfCount }, (_, i) => i + 1).map(qNum => {
          const tfObj = tfAnswers[qNum] || {}
          return `
            <div style="background:#f8fafc; border:1px solid #e2e8f0; border-radius:8px; padding:6px 10px;">
              <div style="font-weight:700; font-size:12px; color:#0f172a; margin-bottom:4px;">Câu ${qNum}</div>
              <div style="display:grid; grid-template-columns:1fr 1fr; gap:4px;">
                ${['a', 'b', 'c', 'd'].map(sub => `
                  <div style="display:flex; align-items:center; justify-content:space-between; background:#ffffff; padding:2px 6px; border-radius:4px; border:1px solid #e2e8f0; font-size:11px;">
                    <span style="font-weight:700; color:#475569;">${sub})</span>
                    <div style="display:flex; gap:3px;">
                      <button type="button" class="tf-option-btn" data-index="${qNum}" data-sub="${sub}" data-val="true" style="
                        padding:1px 5px; border-radius:4px; font-weight:700; font-size:10px; cursor:pointer;
                        border:1px solid ${tfObj[sub] === true ? '#16a34a' : '#cbd5e1'};
                        background:${tfObj[sub] === true ? '#16a34a' : '#ffffff'};
                        color:${tfObj[sub] === true ? '#ffffff' : '#475569'};
                      ">Đ</button>
                      <button type="button" class="tf-option-btn" data-index="${qNum}" data-sub="${sub}" data-val="false" style="
                        padding:1px 5px; border-radius:4px; font-weight:700; font-size:10px; cursor:pointer;
                        border:1px solid ${tfObj[sub] === false ? '#dc2626' : '#cbd5e1'};
                        background:${tfObj[sub] === false ? '#dc2626' : '#ffffff'};
                        color:${tfObj[sub] === false ? '#ffffff' : '#475569'};
                      ">S</button>
                    </div>
                  </div>
                `).join('')}
              </div>
            </div>
          `
        }).join('')}
      </div>
    </div>

    <!-- Part 3: SA -->
    <div class="card" style="margin:0; padding:16px;">
      <h3 style="font-family:var(--font-heading); font-size:14px; font-weight:700; color:#0f172a; margin-bottom:12px;">
        Phần III: Trả lời ngắn (${currentConfig.saCount} câu)
      </h3>
      <div style="display:flex; flex-direction:column; gap:8px; max-height:200px; overflow-y:auto; padding-right:4px;">
        ${Array.from({ length: currentConfig.saCount }, (_, i) => i + 1).map(qNum => `
          <div style="display:flex; align-items:center; justify-content:space-between; padding:4px 8px; background:#f8fafc; border:1px solid #e2e8f0; border-radius:6px;">
            <span style="font-weight:700; font-size:12px; color:#334155;">Câu ${qNum}</span>
            <input type="text" class="sa-input form-input" data-index="${qNum}" placeholder="Đáp án..." value="${saAnswers[qNum] || ''}" style="width:140px; padding:3px 8px; font-size:12px; text-align:right;">
          </div>
        `).join('')}
      </div>
    </div>
  `
}

function getSelectedLessonTitle() {
  const lessonSelect = document.getElementById('hw-lesson-select')
  if (!lessonSelect || lessonSelect.selectedIndex < 0) return ''
  const selectedOption = lessonSelect.options[lessonSelect.selectedIndex]
  return selectedOption ? selectedOption.text.replace(/^[0-9.]+\s*/, '').trim() : ''
}

export function bindCreateHwEvents() {
  bindSidebarEvents()
  registerGlobalPasteListener()

  const previewContainer = document.getElementById('latex-rendered-preview-container')
  if (previewContainer) {
    bindQuestionImageEvents(previewContainer)
  }

  // Mode tab switching
  document.getElementById('tab-mode-latex')?.addEventListener('click', () => {
    currentInputMode = 'latex'
    const app = document.getElementById('app')
    if (app) {
      app.innerHTML = renderCreateHwView()
      bindCreateHwEvents()
    }
  })

  document.getElementById('tab-mode-pdf')?.addEventListener('click', () => {
    currentInputMode = 'pdf'
    const app = document.getElementById('app')
    if (app) {
      app.innerHTML = renderCreateHwView()
      bindCreateHwEvents()
    }
  })

  // Class / Chapter / Lesson Dropdown cascading
  const classSelect = document.getElementById('hw-class-select')
  const chapterSelect = document.getElementById('hw-chapter-select')
  const lessonSelect = document.getElementById('hw-lesson-select')

  const updateChapters = async (classId, preselectedChapterId = null, preselectedLessonId = null) => {
    if (!chapterSelect) return
    chapterSelect.innerHTML = '<option value="">Đang tải chương...</option>'
    if (lessonSelect) lessonSelect.innerHTML = '<option value="">Chọn chương trước...</option>'

    try {
      let chapters = chaptersCache[classId]
      if (!chapters) {
        chapters = await api.getChapters(classId)
        chaptersCache[classId] = chapters
      }

      chapterSelect.innerHTML = '<option value="">-- Chọn chương --</option>'
      chapters.forEach(ch => {
        chapterSelect.innerHTML += `<option value="${ch.id}">${ch.title}</option>`
      })

      if (preselectedChapterId) {
        chapterSelect.value = preselectedChapterId
        await updateLessons(preselectedChapterId, preselectedLessonId)
      } else if (chapters.length > 0) {
        chapterSelect.selectedIndex = 1
        await updateLessons(chapterSelect.value)
      }
    } catch (e) {
      console.error(e)
    }
  }

  const updateLessons = async (chapterId, preselectedLessonId = null) => {
    if (!lessonSelect) return
    lessonSelect.innerHTML = '<option value="">Đang tải bài học...</option>'

    try {
      let lessons = lessonsCache[chapterId]
      if (!lessons) {
        lessons = await api.getLessons(chapterId)
        lessonsCache[chapterId] = lessons
      }

      lessonSelect.innerHTML = '<option value="">-- Chọn bài học --</option>'
      lessons.forEach(ls => {
        lessonSelect.innerHTML += `<option value="${ls.id}">${ls.title}</option>`
      })

      if (preselectedLessonId) {
        lessonSelect.value = preselectedLessonId
      } else if (lessons.length > 0) {
        lessonSelect.selectedIndex = 1
      }
    } catch (e) {
      console.error(e)
    }
  }

  classSelect?.addEventListener('change', () => {
    updateChapters(classSelect.value)
  })

  chapterSelect?.addEventListener('change', () => {
    updateLessons(chapterSelect.value)
  })

  const hw = state.editHomeworkData?.homework
  const initialClassId = classSelect?.value || (state.classes[0]?.id)
  if (initialClassId) {
    updateChapters(initialClassId, hw?.chapterId || hw?.chapter_id, hw?.lessonId || hw?.lesson_id)
  }

  // --- LATEX MODE SPECIFIC EVENTS ---
  if (currentInputMode === 'latex') {
    const latexTextarea = document.getElementById('latex-source-textarea')
    if (latexTextarea) {
      latexTextarea.addEventListener('input', (e) => {
        latexInputText = e.target.value
      })
    }

    // Clear LaTeX button
    document.getElementById('clear-latex-btn')?.addEventListener('click', () => {
      latexInputText = ''
      parsedLatexData = null
      const app = document.getElementById('app')
      if (app) {
        app.innerHTML = renderCreateHwView()
        bindCreateHwEvents()
      }
    })

    // Upload .tex file
    const latexFileInput = document.getElementById('latex-file-input')
    latexFileInput?.addEventListener('change', (e) => {
      const file = e.target.files?.[0]
      if (!file) return
      const reader = new FileReader()
      reader.onload = (evt) => {
        latexInputText = evt.target.result
        // Automatically parse on file upload
        runLatexParse()
      }
      reader.readAsText(file)
    })

    // Parse LaTeX button
    document.getElementById('btn-parse-latex')?.addEventListener('click', () => {
      runLatexParse()
    })

    const runLatexParse = () => {
      const raw = document.getElementById('latex-source-textarea')?.value || latexInputText
      if (!raw.trim()) {
        showToast('Vui lòng nhập hoặc tải file mã nguồn LaTeX!', 'warning')
        return
      }

      latexInputText = raw
      const parsed = parseLatexExam(raw)
      parsedLatexData = parsed

      if (!parsed.success) {
        showToast(`Không thể phân tích đề thi: ${parsed.errors[0]?.reason || 'Lỗi không xác định'}`, 'error')
      } else {
        showToast(`Đã bóc tách thành công ${parsed.questions.length} câu hỏi!`, 'success')

        // Auto set title if detected
        if (parsed.title) {
          const titleInput = document.getElementById('hw-title')
          if (titleInput && !titleInput.value) {
            titleInput.value = parsed.title
          }
        }

        // Auto update answers from parsed questions
        parsed.questions.forEach(q => {
          if (q.questionType === 'MULTIPLE_CHOICE' && q.mcAnswer) {
            mcAnswers[q.questionNumber] = q.mcAnswer
          } else if (q.questionType === 'TRUE_FALSE' && q.tfAnswers) {
            tfAnswers[q.questionNumber] = q.tfAnswers
          } else if (q.questionType === 'SHORT_ANSWER' && q.saAnswer) {
            saAnswers[q.questionNumber] = q.saAnswer
          }
        })
      }

      // Re-render view to show preview and matrix
      const app = document.getElementById('app')
      if (app) {
        app.innerHTML = renderCreateHwView()
        bindCreateHwEvents()

        // Render Math in Preview
        const previewContainer = document.getElementById('latex-rendered-preview-container')
        if (previewContainer) {
          renderMath(previewContainer)
        }
      }
    }

    // Quick Answer String or Direct JSON apply
    document.getElementById('apply-quick-key-btn')?.addEventListener('click', () => {
      const str = document.getElementById('quick-key-string-input')?.value.trim()
      if (!str) {
        showToast('Vui lòng nhập chuỗi hoặc dán mã JSON đáp án!', 'warning')
        return
      }

      // Check if user pasted JSON directly into the input bar
      if (str.startsWith('{') || str.startsWith('[')) {
        try {
          const count = parseAndApplyJsonAnswers(str)
          if (count > 0) {
            showToast(`Đã áp dụng thành công ${count} đáp án từ JSON!`, 'success')
            const app = document.getElementById('app')
            if (app) {
              app.innerHTML = renderCreateHwView()
              bindCreateHwEvents()
              const previewContainer = document.getElementById('latex-rendered-preview-container')
              if (previewContainer) renderMath(previewContainer)
            }
            return
          }
        } catch (e) {
          // If JSON parsing fails, fall through to string parsing
        }
      }

      const keyMap = parseAnswerKeyString(str)
      const matchedCount = Object.keys(keyMap).length
      if (matchedCount === 0) {
        showToast('Không thể nhận diện đáp án từ chuỗi vừa nhập. Vui lòng kiểm tra lại định dạng (ví dụ: 1A 2B 3C... hoặc mã JSON).', 'warning')
        return
      }

      // Apply to parsedQuestions
      if (parsedLatexData?.questions) {
        parsedLatexData.questions.forEach(q => {
          if (keyMap[q.questionNumber]) {
            q.mcAnswer = keyMap[q.questionNumber]
            mcAnswers[q.questionNumber] = keyMap[q.questionNumber]
          }
        })
      }

      showToast(`Đã áp dụng thành công ${matchedCount} đáp án!`, 'success')
      const app = document.getElementById('app')
      if (app) {
        app.innerHTML = renderCreateHwView()
        bindCreateHwEvents()
        const previewContainer = document.getElementById('latex-rendered-preview-container')
        if (previewContainer) renderMath(previewContainer)
      }
    })

    // Button to open JSON Paste Modal
    document.getElementById('btn-paste-json-answers')?.addEventListener('click', () => {
      openModal(
        'Dán mã JSON đáp án',
        `
          <div style="display:flex; flex-direction:column; gap:12px;">
            <div style="font-size:13px; color:#475569; line-height:1.5;">
              Copy và dán nội dung JSON chứa danh sách đáp án vào ô bên dưới. Hệ thống hỗ trợ đa dạng định dạng:
              <ul style="margin:6px 0 0 16px; padding:0; color:#64748b; font-size:12px;">
                <li>Dạng Object: <code>{"1": "A", "2": "B", "3": "C"}</code></li>
                <li>Dạng Đúng/Sai: <code>{"1": {"a": true, "b": false, "c": true, "d": false}}</code> hoặc <code>{"1": "Đ S Đ S"}</code></li>
                <li>Dạng Trả lời ngắn: <code>{"1": "2.5", "2": 3.14}</code></li>
                <li>Dạng Array: <code>[{"question": 1, "answer": "A"}, ...]</code></li>
              </ul>
            </div>
            <textarea id="json-paste-textarea" style="width:100%; height:220px; font-family:'Consolas', monospace; font-size:13px; padding:12px; border:1.5px solid #cbd5e1; border-radius:10px; box-sizing:border-box; outline:none; resize:vertical;" placeholder='Dán mã JSON đáp án vào đây...&#10;Ví dụ:&#10;{&#10;  "1": "A",&#10;  "2": "B",&#10;  "3": "C",&#10;  "4": { "a": true, "b": false, "c": true, "d": false },&#10;  "5": "2.5"&#10;}'></textarea>
          </div>
        `,
        () => {
          const textarea = document.getElementById('json-paste-textarea')
          const rawContent = textarea?.value?.trim()
          if (!rawContent) {
            showToast('Vui lòng dán nội dung JSON!', 'warning')
            return false
          }
          try {
            const count = parseAndApplyJsonAnswers(rawContent)
            if (count > 0) {
              showToast(`Đã nạp thành công ${count} đáp án từ JSON!`, 'success')
              const app = document.getElementById('app')
              if (app) {
                app.innerHTML = renderCreateHwView()
                bindCreateHwEvents()
                const previewContainer = document.getElementById('latex-rendered-preview-container')
                if (previewContainer) renderMath(previewContainer)
              }
              return true
            } else {
              showToast('Không tìm thấy đáp án hợp lệ trong mã JSON!', 'warning')
              return false
            }
          } catch (err) {
            showToast(`Mã JSON không hợp lệ: ${err.message}`, 'error')
            return false
          }
        }
      )

      const confirmBtn = document.getElementById('modal-confirm-btn')
      if (confirmBtn) {
        confirmBtn.innerHTML = '<i class="fa-solid fa-check"></i> Áp dụng JSON'
        confirmBtn.style.background = '#15803d'
      }
    })

    // Bind matrix click events for LaTeX palette
    const matrixContainer = document.getElementById('answer-matrix-container')
    if (matrixContainer) {
      bindLatexMatrixEvents(matrixContainer)
    }

    // If preview container already exists in DOM, render math on it
    const previewContainer = document.getElementById('latex-rendered-preview-container')
    if (previewContainer) {
      renderMath(previewContainer)
    }
  }

  // --- PDF MODE SPECIFIC EVENTS ---
  if (currentInputMode === 'pdf') {
    const pdfFileInput = document.getElementById('hw-pdf-file')
    pdfFileInput?.addEventListener('change', (e) => {
      const file = e.target.files?.[0]
      if (!file) return
      const titleEl = document.getElementById('pdf-viewer-title')
      if (titleEl) titleEl.textContent = file.name

      const iframe = document.getElementById('pdf-preview-iframe')
      const placeholder = document.getElementById('pdf-placeholder')
      const downloadBtn = document.getElementById('download-hw-pdf-btn')

      const objectUrl = URL.createObjectURL(file)
      if (iframe) {
        iframe.src = objectUrl
        iframe.style.display = 'block'
      }
      if (placeholder) placeholder.style.display = 'none'
      if (downloadBtn) {
        downloadBtn.href = objectUrl
        downloadBtn.download = file.name
        downloadBtn.style.background = '#eff6ff'
        downloadBtn.style.color = '#0066cc'
        downloadBtn.style.borderColor = '#bfdbfe'
        downloadBtn.style.cursor = 'pointer'
        downloadBtn.style.opacity = '1'
      }
    })

    document.getElementById('update-config-btn')?.addEventListener('click', () => {
      const mc = parseInt(document.getElementById('cfg-mc-count')?.value || '0', 10)
      const tf = parseInt(document.getElementById('cfg-tf-count')?.value || '0', 10)
      const sa = parseInt(document.getElementById('cfg-sa-count')?.value || '0', 10)

      currentConfig.mcCount = mc
      currentConfig.tfCount = tf
      currentConfig.saCount = sa

      const matrixContainer = document.getElementById('answer-matrix-container')
      if (matrixContainer) {
        matrixContainer.innerHTML = renderPdfMatrixPanel()
        bindMatrixEvents()
      }
      showToast('Đã cập nhật số lượng câu hỏi!', 'success')
    })

    bindMatrixEvents()
  }

  // --- SAVE HOMEWORK BUTTON ---
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

    const isEdit = !!state.editHomeworkData
    const hw = isEdit ? state.editHomeworkData.homework : null
    const questionsPayload = []

    if (currentInputMode === 'latex') {
      const parsedQuestions = parsedLatexData?.questions || []
      if (parsedQuestions.length === 0) {
        showToast('Vui lòng bấm "Phân tích cú pháp & Xem trước đề thi" trước khi lưu!', 'error')
        return
      }

      // Check missing answers
      const missingAnswers = []
      parsedQuestions.forEach(q => {
        const qNum = q.questionNumber

        // Ghép ảnh đính kèm vào content câu hỏi nếu có
        let finalContent = q.content || ''
        if (q.attachedImage) {
          const imgMarkup = `<div class="question-image-wrapper" style="text-align:center; margin:12px 0;"><img src="${q.attachedImage}" alt="Hình vẽ câu ${qNum}" style="max-width:100%; max-height:360px; object-fit:contain; border-radius:8px; box-shadow:0 1px 4px rgba(0,0,0,0.1);" /></div>`
          if (finalContent.includes('class="latex-image-container"') || finalContent.includes('latex-image-container')) {
            finalContent = finalContent.replace(
              /<div class="latex-image-container"[^>]*>[\s\S]*?<\/div>\s*<\/div>/gi,
              imgMarkup
            )
          } else if (!finalContent.includes(q.attachedImage)) {
            finalContent = `${finalContent}\n${imgMarkup}`
          }
        }

        if (q.questionType === 'MULTIPLE_CHOICE') {
          const ans = mcAnswers[qNum] || q.mcAnswer
          if (!ans) missingAnswers.push(`Câu ${qNum}`)
          else {
            questionsPayload.push({
              questionNumber: qNum,
              questionType: 'MULTIPLE_CHOICE',
              prompt: finalContent ? finalContent.substring(0, 150) : `Câu ${qNum}`,
              content: finalContent,
              options: q.options,
              partTitle: q.partTitle || null,
              mcAnswer: ans,
              points: 1.0
            })
          }
        } else if (q.questionType === 'TRUE_FALSE') {
          const tf = tfAnswers[qNum] || q.tfAnswers || {}
          if (tf.a === undefined || tf.b === undefined || tf.c === undefined || tf.d === undefined) {
            missingAnswers.push(`Câu ${qNum} (chưa đủ 4 ý)`)
          } else {
            questionsPayload.push({
              questionNumber: qNum,
              questionType: 'TRUE_FALSE',
              prompt: finalContent ? finalContent.substring(0, 150) : `Câu ${qNum}`,
              content: finalContent,
              statements: q.statements,
              partTitle: q.partTitle || null,
              tfAnswers: { a: tf.a, b: tf.b, c: tf.c, d: tf.d },
              points: 1.0
            })
          }
        } else if (q.questionType === 'SHORT_ANSWER') {
          const ans = saAnswers[qNum] || q.saAnswer
          if (ans === undefined || ans === null || String(ans).trim() === '') {
            missingAnswers.push(`Câu ${qNum}`)
          } else {
            questionsPayload.push({
              questionNumber: qNum,
              questionType: 'SHORT_ANSWER',
              prompt: finalContent ? finalContent.substring(0, 150) : `Câu ${qNum}`,
              content: finalContent,
              partTitle: q.partTitle || null,
              saAnswer: String(ans).trim(),
              points: 1.0
            })
          }
        }
      })

      if (missingAnswers.length > 0) {
        showToast(`Các câu sau chưa được chọn đáp án: ${missingAnswers.slice(0, 5).join(', ')}${missingAnswers.length > 5 ? '...' : ''}. Vui lòng hoàn thành ma trận đáp án!`, 'error')
        return
      }
    } else {
      // PDF Mode
      const totalQuestions = currentConfig.mcCount + currentConfig.tfCount + currentConfig.saCount
      if (totalQuestions === 0) {
        showToast('Bài tập phải có ít nhất 1 câu hỏi!', 'error')
        return
      }

      let globalIndex = 1
      for (let i = 1; i <= currentConfig.mcCount; i++) {
        const ans = mcAnswers[i]
        if (!ans) {
          showToast(`Vui lòng chọn đáp án cho Câu ${i} (Phần I)`, 'error')
          return
        }
        questionsPayload.push({
          questionNumber: globalIndex,
          questionType: 'MULTIPLE_CHOICE',
          partTitle: 'Phần I: Trắc nghiệm',
          prompt: `Câu hỏi số ${i}`,
          mcAnswer: ans,
          points: 1.0
        })
        globalIndex++
      }

      for (let i = 1; i <= currentConfig.tfCount; i++) {
        const tf = tfAnswers[i] || {}
        if (tf.a === undefined || tf.b === undefined || tf.c === undefined || tf.d === undefined) {
          showToast(`Vui lòng chọn đầy đủ Đúng/Sai cho Câu ${i} (Phần II)`, 'error')
          return
        }
        questionsPayload.push({
          questionNumber: globalIndex,
          questionType: 'TRUE_FALSE',
          partTitle: 'Phần II: Đúng / Sai',
          prompt: `Câu hỏi số ${i}`,
          tfAnswers: { a: tf.a, b: tf.b, c: tf.c, d: tf.d },
          points: 1.0
        })
        globalIndex++
      }

      for (let i = 1; i <= currentConfig.saCount; i++) {
        const ans = saAnswers[i]
        if (ans === undefined || ans === null || ans.trim() === '') {
          showToast(`Vui lòng nhập đáp án cho Câu ${i} (Phần III)`, 'error')
          return
        }
        questionsPayload.push({
          questionNumber: globalIndex,
          questionType: 'SHORT_ANSWER',
          partTitle: 'Phần III: Trả lời ngắn',
          prompt: `Câu hỏi số ${i}`,
          saAnswer: ans.trim(),
          points: 1.0
        })
        globalIndex++
      }
    }

    // PDF upload handling
    const fileInput = document.getElementById('hw-pdf-file')
    const file = fileInput?.files?.[0]
    let pdfPath = hw ? (hw.pdfPath || hw.pdf_path || null) : null

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
          title: finalTitle,
          pdfPath: pdfPath || (currentInputMode === 'latex' ? null : 'Homework_Attachment.pdf'),
          durationMinutes: duration,
          passScore: hw.passScore || hw.pass_score || 5.0,
          maxScore: hw.maxScore || hw.max_score || 10.0,
          isPublished: hw.isPublished !== false,
          questions: questionsPayload,
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
          pdfPath: pdfPath || (currentInputMode === 'latex' ? null : 'Homework_Attachment.pdf'),
          durationMinutes: duration,
          passScore: 5.0,
          maxScore: 10.0,
          isPublished: true,
          questions: questionsPayload,
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
  document.querySelectorAll('.mc-option-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      const qNum = parseInt(btn.getAttribute('data-qnum'), 10)
      const opt = btn.getAttribute('data-option')
      mcAnswers[qNum] = opt
      document.querySelectorAll(`.mc-option-btn[data-qnum="${qNum}"]`).forEach(b => {
        const isCurrent = b.getAttribute('data-option') === opt
        b.style.background = isCurrent ? '#0066cc' : '#ffffff'
        b.style.color = isCurrent ? '#ffffff' : '#334155'
        b.style.borderColor = isCurrent ? '#0066cc' : '#cbd5e1'
      })
    })
  })

  document.querySelectorAll('.tf-option-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      const index = parseInt(btn.getAttribute('data-index'), 10)
      const sub = btn.getAttribute('data-sub')
      const val = btn.getAttribute('data-val') === 'true'

      if (!tfAnswers[index]) tfAnswers[index] = {}
      tfAnswers[index][sub] = val

      const parent = btn.parentElement
      if (parent) {
        parent.querySelectorAll('.tf-option-btn').forEach(b => {
          const isVal = b.getAttribute('data-val') === (val ? 'true' : 'false')
          b.style.background = isVal ? (val ? '#16a34a' : '#dc2626') : '#ffffff'
          b.style.color = isVal ? '#ffffff' : '#475569'
          b.style.borderColor = isVal ? (val ? '#16a34a' : '#dc2626') : '#cbd5e1'
        })
      }
    })
  })

  document.querySelectorAll('.sa-input').forEach(input => {
    input.addEventListener('input', (e) => {
      const index = parseInt(input.getAttribute('data-index'), 10)
      saAnswers[index] = e.target.value
    })
  })
}
