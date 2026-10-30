import { renderNavbar } from '../components/navbar.js'
import { showToast } from '../components/toast.js'
import { state } from '../state.js'
import { api } from '../api.js'
import { openModal, closeModal } from '../components/modal.js'
import { renderMath, renderMarkdown } from '../utils/exam-parser.js'
import { getStudentTheme, renderStudentThemeToggle } from '../theme.js'

// The exam room has no .app-layout root; app.js updates this shell on theme changes.
const examShell = () => {
  const theme = getStudentTheme()
  return `exam-room-layout${theme === 'dark' ? ' navy-student' : theme === 'pastel' ? ' pastel-student' : ''}`
}

// Student's current answers state for exam
let studentAnswers = {
  mc: {}, // { 1: 'A', 2: 'B', ... }
  tf: {}, // { 1: { a: true, b: false, c: true, d: false }, ... }
  sa: {},
  essay: {}  // { 1: 'Văn bản nhiều dòng', ... }
}
let isDraftRestored = false
let saDebounceTimer = null
let flaggedQuestions = new Set()

function escapeHtml(str) {
  if (!str) return ''
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;')
}

function formatExamContent(str) {
  if (!str) return ''
  return renderMarkdown(str)
}

function parsePromptPayload(rawPrompt, fallbackContent) {
  let promptData = { text: '', imageUrl: '', options: [], statements: [], explanation: '', isInteractive: false }
  try {
    if (typeof rawPrompt === 'string') {
      const parsed = JSON.parse(rawPrompt)
      if (parsed && typeof parsed === 'object') promptData = { ...promptData, ...parsed }
      else promptData.text = rawPrompt
    } else if (typeof rawPrompt === 'object' && rawPrompt !== null) {
      promptData = { ...promptData, ...rawPrompt }
    }
  } catch (_) {
    promptData.text = rawPrompt || ''
  }

  // Unwrap if promptData.text is itself a stringified JSON (prevent double-nested JSON bug)
  let unwrapLimit = 0
  while (typeof promptData.text === 'string' && promptData.text.trim().startsWith('{') && unwrapLimit < 3) {
    try {
      const inner = JSON.parse(promptData.text)
      if (inner && typeof inner === 'object' && (inner.text !== undefined || inner.options || inner.statements)) {
        promptData = {
          ...promptData,
          ...inner,
          text: inner.text !== undefined ? inner.text : promptData.text,
          options: (inner.options && inner.options.length) ? inner.options : promptData.options,
          statements: (inner.statements && inner.statements.length) ? inner.statements : promptData.statements,
          explanation: inner.explanation || promptData.explanation || '',
          imageUrl: inner.imageUrl || promptData.imageUrl || '',
          isInteractive: inner.isInteractive !== undefined ? inner.isInteractive : promptData.isInteractive
        }
        unwrapLimit++
      } else {
        break
      }
    } catch (_) {
      break
    }
  }

  if (!Array.isArray(promptData.options)) promptData.options = []
  if (!Array.isArray(promptData.statements)) promptData.statements = []
  if (!promptData.text && fallbackContent) promptData.text = fallbackContent

  return promptData
}

function getDraftStorageKey(hwId) {
  const userId = state.user?.id || 'anonymous'
  return `exam_draft_${userId}_${hwId}`
}

function loadDraftFromStorage(hwId) {
  try {
    const raw = localStorage.getItem(getDraftStorageKey(hwId))
    if (!raw) return null
    return JSON.parse(raw)
  } catch (e) {
    return null
  }
}

function saveDraftToStorage(hwId, answers, timeLeft) {
  try {
    const data = {
      answers,
      timeLeft,
      updatedAt: new Date().toISOString()
    }
    localStorage.setItem(getDraftStorageKey(hwId), JSON.stringify(data))
    const el = document.getElementById('exam-autosave-status')
    if (el) el.textContent = 'Nháp đã lưu trên thiết bị (chưa xác nhận trên máy chủ)'
  } catch (e) {}
}

function clearDraftStorage(hwId) {
  try {
    localStorage.removeItem(getDraftStorageKey(hwId))
  } catch (e) {}
}

function updateAutosaveIndicator(saved = true) {
  const el = document.getElementById('exam-autosave-status')
  if (!el) return
  if (saved) {
    const now = new Date().toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit', second: '2-digit' })
    el.innerHTML = `<i class="fa-solid fa-cloud-arrow-up" style="color:#10b981;"></i> Đã lưu nháp (${now})`
    el.style.color = '#065f46'
    el.style.background = '#ecfdf5'
    el.style.borderColor = '#a7f3d0'
  } else {
    el.innerHTML = `<i class="fa-solid fa-spinner fa-spin" style="color:#0284c7;"></i> Đang lưu nháp...`
    el.style.color = '#0369a1'
    el.style.background = '#f0f9ff'
    el.style.borderColor = '#bae6fd'
  }
}

function showAutosaveError() {
  const el = document.getElementById('exam-autosave-status')
  if (el) {
    el.textContent = 'Chưa lưu được nháp lên máy chủ (nháp trên thiết bị vẫn được giữ)'
    el.style.color = '#b45309'
  }
}

// =========================================================
// MAIN RENDER: EXAM ROOM VIEW (NO SIDEBAR)
// =========================================================
export function renderExamRoomView() {
  const hwData = state.currentHomework
  const hw = hwData?.homework || hwData
  const questions = hwData?.questions || []

  if (!hw || !hw.id) {
    return `
      <div class="${examShell()}">
        <div style="padding:60px 20px; text-align:center; color:#64748b;">
          <i class="fa-solid fa-spinner fa-spin" style="font-size:32px; color:#0284c7; margin-bottom:12px;"></i>
          <p style="font-size:15px; font-weight:600;">Đang chuẩn bị đề thi...</p>
        </div>
      </div>
    `
  }

  const attemptsCount = hwData?.attemptsCount || 0
  const maxAttempts = hw.maxAttempts || hw.max_attempts || 1
  // Mỗi lần admin khôi phục bài thi sẽ cấp thêm 1 lượt (activeAttemptNo tăng dần).
  // Cho phép vào thi khi số lần đã nộp < maxAttempts + (lượt được cấp thêm).
  const grantedExtra = Math.max(0, (hwData?.activeAttemptNo || 0) - 1)
  const attemptAllowance = maxAttempts + grantedExtra
  const isExceeded = maxAttempts > 0 && attemptsCount >= attemptAllowance

  if (isExceeded) {
    return `
      <div class="${examShell()}">
        <div style="max-width:540px; margin: 80px auto; padding: 40px; background:#ffffff; border-radius: 16px; box-shadow: 0 4px 24px rgba(0,0,0,0.06); border: 1px solid #e2e8f0; text-align:center;">
          <i class="fa-solid fa-lock" style="font-size:56px; color:#ef4444; margin-bottom:20px;"></i>
          <h2 style="font-weight:700; color:#0f172a; margin-bottom:12px; font-family:var(--font-heading);">Đạt Giới Hạn Lượt Thi</h2>
          <p style="font-size:14.5px; color:#475569; line-height:1.6; margin-bottom:24px;">
            Bài thi chính thức <strong>${escapeHtml(hw.title)}</strong> chỉ cho phép thực hiện tối đa <strong>${maxAttempts}</strong> lần.<br>
            Bạn đã nộp bài thi này và không thể làm lại trừ khi được giáo viên cấp quyền.
          </p>
          <button class="btn-primary" onclick="window.location.hash='#my-classes'" style="padding:10px 24px; font-size:14px; cursor:pointer;">
            <i class="fa-solid fa-arrow-left"></i> Quay lại danh sách lớp học
          </button>
        </div>
      </div>
    `
  }

  // Check saved draft
  const savedDraft = loadDraftFromStorage(hw.id)
  isDraftRestored = !!(savedDraft && savedDraft.answers && (
    Object.keys(savedDraft.answers.mc || {}).length > 0 ||
    Object.keys(savedDraft.answers.tf || {}).length > 0 ||
    Object.keys(savedDraft.answers.sa || {}).length > 0
    || Object.keys(savedDraft.answers.essay || {}).length > 0
  ))

  studentAnswers = {
    mc: savedDraft?.answers?.mc || {},
    tf: savedDraft?.answers?.tf || {},
    sa: savedDraft?.answers?.sa || {},
    essay: savedDraft?.answers?.essay || {}
  }

  // Parse questions
  const parsedQuestionList = questions.map(q => {
    const pObj = parsePromptPayload(q.prompt, q.content)
    const qNum = q.question_number || q.questionNumber
    const rawType = (q.question_type || q.questionType || '').toUpperCase()
    const isTf = rawType === 'TRUE_FALSE' || rawType === 'TF' || (pObj.statements && pObj.statements.length > 0)
    const isSa = rawType === 'SHORT_ANSWER' || rawType === 'SA'
    const isEssay = rawType === 'ESSAY' || rawType === 'TL'
    const questionType = isTf ? 'TRUE_FALSE' : (isEssay ? 'ESSAY' : (isSa ? 'SHORT_ANSWER' : 'MULTIPLE_CHOICE'))

    let promptText = pObj.text || q.content || (typeof q.prompt === 'string' && !q.prompt.trim().startsWith('{') ? q.prompt : '') || `Câu hỏi số ${qNum}`
    let options = []

    if (isTf) {
      let rawStatements = []
      if (Array.isArray(q.statements) && q.statements.length > 0) rawStatements = q.statements
      else if (Array.isArray(pObj.statements) && pObj.statements.length > 0) rawStatements = pObj.statements
      else if (Array.isArray(q.options) && q.options.length > 0) rawStatements = q.options
      else if (Array.isArray(pObj.options) && pObj.options.length > 0) rawStatements = pObj.options
      else if (typeof q.statements === 'object' && q.statements !== null) {
        rawStatements = ['a', 'b', 'c', 'd'].map(k => ({ key: k, text: q.statements[k] || '' }))
      } else if (typeof pObj.statements === 'object' && pObj.statements !== null) {
        rawStatements = ['a', 'b', 'c', 'd'].map(k => ({ key: k, text: pObj.statements[k] || '' }))
      }

      const tfKeys = ['a', 'b', 'c', 'd']
      options = tfKeys.map((k, idx) => {
        const found = rawStatements.find(s => {
          if (!s) return false
          const sKey = String(s.key || s.id || '').trim().toLowerCase()
          return sKey === k
        }) || rawStatements[idx]

        let stmtText = ''
        if (found) {
          if (typeof found === 'string') stmtText = found
          else if (typeof found === 'object') stmtText = found.text || found.content || found.prompt || ''
        }
        stmtText = stmtText.replace(/^[a-d]\s*[\)\.:]\s*/i, '').trim()
        return { id: k, text: stmtText }
      })
    } else if (!isSa && !isEssay) {
      let rawOptions = pObj.options.length > 0 ? pObj.options : (q.options || [])
      if (Array.isArray(rawOptions) && rawOptions.length > 0) {
        options = rawOptions.map((opt, idx) => {
          if (typeof opt === 'string') return { id: ['A', 'B', 'C', 'D'][idx] || String(idx + 1), text: opt }
          return { id: (opt.id || opt.key || ['A', 'B', 'C', 'D'][idx] || '').toUpperCase(), text: opt.text || opt.content || '' }
        })
      } else if (typeof rawOptions === 'object' && rawOptions !== null) {
        options = ['A', 'B', 'C', 'D'].map(k => ({ id: k, text: rawOptions[k] || '' }))
      }
      if (!options || options.length === 0) {
        options = ['A', 'B', 'C', 'D'].map(k => ({ id: k, text: '' }))
      }
    }

    return {
      id: q.id,
      questionNumber: qNum,
      questionType,
      points: q.points || (questionType === 'TRUE_FALSE' ? 1.0 : (questionType === 'SHORT_ANSWER' ? 0.5 : 1.0)),
      promptText,
      imageUrl: pObj.imageUrl || '',
      options,
      explanation: pObj.explanation || q.explanation || ''
    }
  })

  // Count answered
  const totalQuestions = parsedQuestionList.length
  let answeredCount = 0
  parsedQuestionList.forEach(q => {
    const qNum = q.questionNumber
    if (q.questionType === 'MULTIPLE_CHOICE' && studentAnswers.mc[qNum]) answeredCount++
    else if (q.questionType === 'TRUE_FALSE') {
      const tf = studentAnswers.tf[qNum] || {}
      if (['a', 'b', 'c', 'd'].every(k => tf[k] !== undefined)) answeredCount++
    } else if (q.questionType === 'SHORT_ANSWER' && studentAnswers.sa[qNum] && String(studentAnswers.sa[qNum]).trim() !== '') {
      answeredCount++
    } else if (q.questionType === 'ESSAY' && studentAnswers.essay[qNum] && String(studentAnswers.essay[qNum]).trim() !== '') {
      answeredCount++
    }
  })
  const progressPercent = totalQuestions > 0 ? Math.round((answeredCount / totalQuestions) * 100) : 0

  const maxViolationsAllowed = hw.maxViolations || hw.max_violations || 3
  const hasAttachedPdf = !!(hw && (hw.pdfUrl || (hw.pdfPath && hw.pdfPath !== 'INTERACTIVE' && hw.pdfPath !== 'Homework_Attachment.pdf' && hw.pdfPath.endsWith('.pdf'))))
  const pdfDownloadUrl = (hw?.pdfUrl || '').replace(/https?:\/\/kong:8000/, import.meta.env.VITE_SUPABASE_URL || 'http://localhost:54321')
  const studentFullName = state.user?.fullName || state.user?.username || 'Thí sinh'

  return `
    <div class="${examShell()}">
      <!-- TOP EXAM TOOLBAR (Dedicated Focus Bar, No Sidebar button) -->
      <header class="exam-top-toolbar">
        <div class="exam-toolbar-identity" style="display:flex; align-items:center; gap:16px; min-width:0; flex:1 1 auto;">
          <button type="button" class="exam-toolbar-back" aria-label="Rời phòng thi" title="Rời phòng thi">
            <i class="fa-solid fa-arrow-left" aria-hidden="true"></i><span>Quay lại</span>
          </button>
          <div class="brand-logo" style="margin:0; padding:0; cursor:default; font-size:18px;">
            <i class="fa-solid fa-graduation-cap"></i>
            <span>EduPortal</span>
          </div>
          <div style="height:24px; width:1px; background:#cbd5e1;"></div>
          <div class="exam-toolbar-heading" style="min-width:0; overflow:hidden;">
            <div class="exam-toolbar-badges" style="display:flex; align-items:center; gap:8px; margin-bottom:2px; flex-wrap:wrap;">
              <span style="background:#fee2e2; color:#b91c1c; border:1px solid #fecaca; font-weight:800; font-size:11px; padding:2px 8px; border-radius:6px; display:inline-flex; align-items:center; gap:4px;">
                <i class="fa-solid fa-shield-halved"></i> PHÒNG THI CHÍNH THỨC
              </span>
              <span id="exam-autosave-status" style="font-size:11.5px; color:#065f46; background:#ecfdf5; border:1px solid #a7f3d0; padding:2px 10px; border-radius:12px; font-weight:600; display:inline-flex; align-items:center; gap:4px;">
                <i class="fa-solid fa-cloud-arrow-up" style="color:#10b981;"></i> Tự động lưu nháp
              </span>
            </div>
            <h1 style="font-family:var(--font-heading); font-size:16px; font-weight:700; color:#0f172a; margin:0; overflow:hidden; text-overflow:ellipsis; white-space:nowrap;">
              ${escapeHtml(hw.title)}
            </h1>
          </div>
        </div>

        <div class="exam-toolbar-actions" style="display:flex; align-items:center; gap:12px; flex-shrink:0;">
          ${renderStudentThemeToggle('exam-student-theme-toggle')}
          <div style="display:flex; align-items:center; gap:8px; font-size:13px; color:#475569; background:#f8fafc; padding:6px 12px; border-radius:8px; border:1px solid #e2e8f0;">
            <i class="fa-solid fa-user-graduate" style="color:#0284c7;"></i>
            <strong style="color:#0f172a;">${escapeHtml(studentFullName)}</strong>
          </div>

          <!-- Violation counter in toolbar -->
          <div id="exam-violations-pill" style="display:inline-flex; align-items:center; gap:6px; font-size:12.5px; font-weight:700; color:#991b1b; background:#fef2f2; border:1px solid #fecaca; padding:6px 12px; border-radius:8px;" title="Số lần vi phạm quy chế thi (chuyển tab/mở app ngoài)">
            <i class="fa-solid fa-triangle-exclamation" style="color:#ef4444;"></i>
            <span>Vi phạm: <strong id="exam-violations-count">0</strong>/${maxViolationsAllowed}</span>
          </div>

          ${hasAttachedPdf ? `
            <button type="button" id="btn-toggle-exam-pdf" class="btn-secondary" style="padding:7px 14px; font-size:12.5px; font-weight:600; background:#f0fdf4; color:#16a34a; border:1px solid #bbf7d0; border-radius:8px; display:inline-flex; align-items:center; gap:6px; cursor:pointer;" title="Mở đối chiếu đề bài PDF đính kèm">
              <i class="fa-solid fa-file-pdf"></i> Xem Đề PDF
            </button>
          ` : ''}

          <!-- Countdown Timer Box -->
          <div class="timer-box" style="padding:7px 18px; font-size:16px; font-weight:800; border-radius:8px; background:#eff6ff; color:#0066cc; border:1.5px solid #bfdbfe; display:inline-flex; align-items:center; gap:7px; letter-spacing:0.5px;">
            <i class="fa-regular fa-clock" style="color:#0284c7;"></i> 
            <span id="exam-timer-display">${String(hw.durationMinutes || 45).padStart(2, '0')}:00</span>
          </div>

          <button type="button" id="btn-top-submit-exam" class="btn-primary" style="padding:8px 20px; font-size:13px; font-weight:700; background:#059669; border-color:#059669; cursor:pointer; display:inline-flex; align-items:center; gap:6px;">
            <i class="fa-solid fa-paper-plane"></i> Nộp bài
          </button>
        </div>
      </header>

      <!-- MAIN BODY CONTAINER -->
      <main class="exam-room-body">
        <div class="exam-split-grid">
          
          <!-- LEFT COLUMN: QUESTION CARDS WITH RICH MARKDOWN -->
          <div id="exam-questions-container" style="min-width:0;">
            ${renderExamQuestionCards(parsedQuestionList)}
          </div>

          <!-- RIGHT COLUMN: STICKY NAVIGATION PALETTE -->
          <aside class="exam-sidebar-palette" style="position:sticky; top:80px; background:#ffffff; border:1px solid #e2e8f0; border-radius:14px; padding:20px; box-shadow:0 4px 16px rgba(0,0,0,0.04); display:flex; flex-direction:column; gap:18px; max-height:calc(100vh - 110px); overflow-y:auto;">
            
            <!-- Progress Section -->
            <div>
              <div style="display:flex; justify-content:space-between; font-size:13px; font-weight:600; color:#475569; margin-bottom:6px;">
                <span>Tiến độ làm bài:</span>
                <span id="exam-progress-text" style="color:#0066cc; font-weight:700;">${answeredCount}/${totalQuestions} câu (${progressPercent}%)</span>
              </div>
              <div style="height:8px; background:#f1f5f9; border-radius:6px; overflow:hidden;">
                <div id="exam-progress-bar" style="height:100%; width:${progressPercent}%; background:linear-gradient(90deg, #0284c7, #10b981); border-radius:6px; transition:width 0.25s ease;"></div>
              </div>
            </div>

            <!-- Legend -->
            <div style="display:flex; flex-wrap:wrap; gap:10px; font-size:11px; color:#64748b; padding-bottom:10px; border-bottom:1px solid #f1f5f9;">
              <div style="display:flex; align-items:center; gap:5px;"><span style="width:10px; height:10px; border-radius:3px; background:#0066cc; display:inline-block;"></span> Đã làm</div>
              <div style="display:flex; align-items:center; gap:5px;"><span style="width:10px; height:10px; border-radius:3px; background:#e0f2fe; border:1px solid #0284c7; display:inline-block;"></span> Làm 1 phần</div>
              <div style="display:flex; align-items:center; gap:5px;"><span style="width:10px; height:10px; border-radius:3px; background:#ffffff; border:1px solid #cbd5e1; display:inline-block;"></span> Chưa làm</div>
              <div style="display:flex; align-items:center; gap:5px;"><span style="width:10px; height:10px; border-radius:3px; background:#f59e0b; display:inline-block;"></span> Đã cắm cờ</div>
            </div>

            <!-- Question Grid Palette -->
            <div>
              <div style="font-weight:700; font-size:13px; color:#1e293b; margin-bottom:12px; display:flex; align-items:center; justify-content:space-between;">
                <span>BẢNG ĐIỀU HƯỚNG</span>
                <span style="font-size:11px; color:#64748b; font-weight:normal;">Bấm số để cuộn tới câu</span>
              </div>

              <div class="exam-nav-grid" id="exam-nav-palette" style="display:grid; grid-template-columns:repeat(5, 1fr); gap:6px;">
                ${parsedQuestionList.map(q => {
                  const qNum = q.questionNumber
                  const isFlagged = flaggedQuestions.has(qNum)
                  let isAnswered = false
                  let isPartial = false
                  if (q.questionType === 'MULTIPLE_CHOICE') {
                    isAnswered = !!studentAnswers.mc[qNum]
                  } else if (q.questionType === 'TRUE_FALSE') {
                    const tf = studentAnswers.tf[qNum] || {}
                    const ansCount = ['a', 'b', 'c', 'd'].filter(k => tf[k] !== undefined).length
                    isAnswered = ansCount === 4
                    isPartial = ansCount > 0 && ansCount < 4
                  } else if (q.questionType === 'SHORT_ANSWER') {
                    isAnswered = studentAnswers.sa[qNum] !== undefined && String(studentAnswers.sa[qNum]).trim() !== ''
                  } else if (q.questionType === 'ESSAY') {
                    isAnswered = studentAnswers.essay[qNum] !== undefined && String(studentAnswers.essay[qNum]).trim() !== ''
                  }

                  return `
                    <button type="button" class="exam-nav-btn ${isAnswered ? 'answered' : (isPartial ? 'partial' : '')} ${isFlagged ? 'flagged' : ''}" data-qnum="${qNum}">
                      ${qNum}
                    </button>
                  `
                }).join('')}
              </div>
            </div>

            <!-- Anti-Cheat Status Summary in Sidebar -->
            <div style="background:#f8fafc; border:1px solid #e2e8f0; border-radius:10px; padding:12px; font-size:12px; color:#475569; display:flex; flex-direction:column; gap:6px;">
              <div style="display:flex; align-items:center; gap:6px; font-weight:700; color:#0f172a;">
                <i class="fa-solid fa-shield-cat" style="color:#0284c7;"></i> Giám sát thi tự động
              </div>
              <div style="display:flex; justify-content:space-between;">
                <span>Giới hạn vi phạm:</span>
                <strong style="color:#b91c1c;"><span id="exam-side-violations">0</span>/${maxViolationsAllowed} lần</strong>
              </div>
              <div style="font-size:11px; color:#64748b;">Không chuyển thẻ hoặc mở ứng dụng khác khi đang làm bài.</div>
            </div>

            <!-- Submit Button in Sticky Sidebar -->
            <div style="padding-top:12px; border-top:1px solid #f1f5f9; display:flex; flex-direction:column; gap:8px;">
              <button type="button" id="btn-submit-exam-sidebar" class="btn-primary" style="width:100%; padding:12px; font-size:14px; font-weight:700; background:#059669; border-color:#059669; cursor:pointer; display:flex; align-items:center; justify-content:center; gap:8px; border-radius:10px; box-shadow:0 2px 8px rgba(5,150,105,0.2);">
                <i class="fa-solid fa-check-double"></i> NỘP BÀI THI
              </button>
              
              <button type="button" id="btn-exit-exam-room" style="background:transparent; border:none; color:#94a3b8; font-size:12px; font-weight:600; cursor:pointer; padding:6px; display:flex; align-items:center; justify-content:center; gap:6px;">
                <i class="fa-solid fa-door-open"></i> Rời khỏi phòng thi
              </button>
            </div>
          </aside>
        </div>
      </main>
    </div>
  `
}

function renderExamQuestionCards(parsedQuestions) {
  let currentSection = ''

  return parsedQuestions.map(q => {
    const qNum = q.questionNumber
    let sectionHeader = ''

    let newSection = ''
    if (q.questionType === 'MULTIPLE_CHOICE') newSection = 'PHẦN I: TRẮC NGHIỆM NHIỀU LỰA CHỌN (A, B, C, D)'
    else if (q.questionType === 'TRUE_FALSE') newSection = 'PHẦN II: TRẮC NGHIỆM ĐÚNG / SAI (4 Ý a, b, c, d)'
    else if (q.questionType === 'SHORT_ANSWER') newSection = 'PHẦN III: TRẢ LỜI NGẮN (ĐIỀN KẾT QUẢ SỐ)'
    else if (q.questionType === 'ESSAY') newSection = 'PHẦN IV: TỰ LUẬN (NHẬP VĂN BẢN)'

    if (newSection !== currentSection) {
      currentSection = newSection
      sectionHeader = `
        <div style="background:linear-gradient(135deg, #f8fafc, #f1f5f9); border:1px solid #e2e8f0; border-radius:10px; padding:12px 18px; margin:${qNum === 1 ? '0' : '28px'} 0 16px 0; font-weight:700; font-size:14px; color:#0f172a; display:flex; align-items:center; gap:8px;">
          <i class="fa-solid fa-bookmark" style="color:#0284c7;"></i> ${currentSection}
        </div>
      `
    }

    const isFlagged = flaggedQuestions.has(qNum)

    const tfStatements = (q.options && q.options.length > 0) ? q.options : [
      { id: 'a', text: '' },
      { id: 'b', text: '' },
      { id: 'c', text: '' },
      { id: 'd', text: '' }
    ]

    return `
      ${sectionHeader}
      <article class="interactive-q-card ${isFlagged ? 'flagged' : ''}" id="exam-q-card-${qNum}" data-qnum="${qNum}">
        <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:14px; padding-bottom:10px; border-bottom:1px solid #f1f5f9;">
          <div style="display:flex; align-items:center; gap:8px;">
            <span style="font-weight:700; font-size:15px; color:#0f172a;">Câu ${qNum}:</span>
            <span style="background:#f1f5f9; color:#475569; font-size:12px; font-weight:600; padding:2px 8px; border-radius:6px;">
              (${q.points || (q.questionType === 'TRUE_FALSE' ? 1.0 : (q.questionType === 'SHORT_ANSWER' ? 0.5 : 1.0))} điểm)
            </span>
          </div>
          <button type="button" class="btn-flag-question ${isFlagged ? 'active' : ''}" data-qnum="${qNum}" style="background:transparent; border:none; color:${isFlagged ? '#f59e0b' : '#94a3b8'}; cursor:pointer; font-size:12.5px; font-weight:600; display:inline-flex; align-items:center; gap:5px;" title="Đánh dấu để xem lại">
            <i class="fa-solid fa-bookmark"></i> ${isFlagged ? 'Đã đánh dấu' : 'Đánh dấu'}
          </button>
        </div>

        <!-- Prompt with Math -->
        <div class="interactive-q-prompt">${formatExamContent(q.promptText || '')}</div>

        <!-- Attached Image (if any) -->
        ${q.imageUrl ? `
          <div style="margin:12px 0 16px 0; text-align:center;">
            <img src="${q.imageUrl}" alt="Hình câu ${qNum}" style="max-width:100%; max-height:360px; object-fit:contain; border-radius:8px; border:1px solid #e2e8f0;" />
          </div>
        ` : ''}

        <!-- Answering Options -->
        ${q.questionType === 'MULTIPLE_CHOICE' ? `
          <div class="exam-options-grid grid-2col">
            ${(q.options || []).map(opt => {
              const isSelected = studentAnswers.mc[qNum] === opt.id
              return `
                <div class="exam-option-card ${isSelected ? 'selected' : ''}" data-qnum="${qNum}" data-optid="${opt.id}">
                  <div class="exam-opt-badge">${opt.id}</div>
                  <div style="flex:1 1 auto; line-height:1.5;">${formatExamContent(opt.text || '')}</div>
                </div>
              `
            }).join('')}
          </div>
        ` : (q.questionType === 'TRUE_FALSE' ? `
          <div style="display:flex; flex-direction:column; gap:10px; margin-top:12px;">
            ${tfStatements.map(sub => {
              const subKey = String(sub.id || '').toLowerCase()
              const val = studentAnswers.tf[qNum]?.[subKey] !== undefined 
                ? studentAnswers.tf[qNum][subKey] 
                : studentAnswers.tf[qNum]?.[sub.id]
              const displayText = sub.text ? formatExamContent(sub.text) : `<span style="color:#64748b; font-style:italic;">Ý ${subKey.toUpperCase()}</span>`
              const isTrue = val === true || val === 'true'
              const isFalse = val === false || val === 'false'
              const isSelected = isTrue || isFalse

              return `
                <div class="tf-statement-row" style="border:1.5px solid ${isSelected ? (isTrue ? '#86efac' : '#fca5a5') : '#e2e8f0'}; background:${isSelected ? (isTrue ? '#f0fdf4' : '#fef2f2') : '#ffffff'};">
                  <div style="font-size:14px; color:#1e293b; line-height:1.5; flex:1;">
                    <strong style="color:#0284c7; margin-right:6px;">${subKey})</strong> ${displayText}
                  </div>
                  <div style="display:flex; gap:6px; flex-shrink:0;">
                    <button type="button" class="tf-toggle-btn ${isTrue ? 'active' : ''}" data-qnum="${qNum}" data-sub="${subKey}" data-val="true" style="border-color:${isTrue ? '#16a34a' : '#cbd5e1'}; background:${isTrue ? '#16a34a' : '#ffffff'}; color:${isTrue ? '#ffffff' : '#475569'};">
                      <i class="fa-solid fa-check"></i> Đúng
                    </button>
                    <button type="button" class="tf-toggle-btn ${isFalse ? 'active' : ''}" data-qnum="${qNum}" data-sub="${subKey}" data-val="false" style="border-color:${isFalse ? '#dc2626' : '#cbd5e1'}; background:${isFalse ? '#dc2626' : '#ffffff'}; color:${isFalse ? '#ffffff' : '#475569'};">
                      <i class="fa-solid fa-xmark"></i> Sai
                    </button>
                  </div>
                </div>
              `
            }).join('')}
          </div>
        ` : (q.questionType === 'ESSAY' ? `
          <div style="background:#faf5ff; border:1px solid #e9d5ff; border-radius:10px; padding:14px 16px;">
            <label style="display:block; font-size:12.5px; font-weight:600; color:#6b21a8; margin-bottom:8px;">Nhập câu trả lời tự luận:</label>
            <textarea class="student-interactive-essay-input" data-qnum="${qNum}" rows="7" placeholder="Nhập câu trả lời của em..." style="width:100%; resize:vertical; line-height:1.5;">${escapeHtml(studentAnswers.essay[qNum] || '')}</textarea>
          </div>
        ` : `
          <div style="background:#f8fafc; border:1px solid #e2e8f0; border-radius:10px; padding:14px 16px;">
            <label style="display:block; font-size:12.5px; font-weight:600; color:#475569; margin-bottom:8px;">
              <i class="fa-solid fa-pen"></i> Nhập kết quả của bạn:
            </label>
            <input type="text" class="student-interactive-sa-input" data-qnum="${qNum}" value="${studentAnswers.sa[qNum] || ''}" placeholder="Điền đáp án số (ví dụ: 2.67 hoặc -5)...">
          </div>
        `))}
      </article>
    `
  }).join('')
}

// =========================================================
// BIND EVENTS & PROCTORING ENGINE
// =========================================================
export function bindExamRoomEvents() {
  const hwData = state.currentHomework
  const hw = hwData?.homework || hwData
  const questions = hwData?.questions || []

  if (!hw || !hw.id) return

  // =========================================================
  // TIMER & PROCTORING STATE ENGINE
  // =========================================================
  let timeLeftSeconds = (hw.durationMinutes || 45) * 60
  let deadlineMs = null
  let clockBaseMs = null
  let clockBaseTick = null
  let confirmedServerDraft = []
  let autosaveInFlight = false
  let autosaveFailed = false
  let submittedOrUncertain = false
  const remainingSeconds = () => deadlineMs === null ? timeLeftSeconds :
    Math.max(0, Math.ceil((deadlineMs - (clockBaseMs + performance.now() - clockBaseTick)) / 1000))
  const configureDeadline = (res) => {
    const parsed = Date.parse(res?.deadlineAt)
    if (!Number.isFinite(parsed)) throw new Error('Máy chủ chưa cung cấp thời hạn thi hợp lệ')
    deadlineMs = parsed
    // Prefer serverNow and monotonic elapsed time; without it the device clock at init is approximate.
    const serverNow = Date.parse(res?.serverNow)
    clockBaseMs = Number.isFinite(serverNow) ? serverNow : Date.now()
    clockBaseTick = performance.now()
    timeLeftSeconds = remainingSeconds()
    updateTimerDisplay()
  }
  const getSessionTokenKey = (hwId) => `exam_session_token_${hwId}_${state.user?.id || 'guest'}`
  const getActiveKey = (hwId) => `exam_active_${hwId}_${state.user?.id || 'guest'}`
  const submitAttemptKey = `exam_submit_attempt_${hw.id}_${state.user?.id || 'guest'}`
  const pendingLogKey = `exam_pending_log_${hw.id}_${state.user?.id || 'guest'}`
  const signalKey = `exam_pending_signals_${hw.id}_${state.user?.id || 'guest'}`
  const clearSessionStorageData = (hwId) => {
    localStorage.removeItem(getSessionTokenKey(hwId))
    localStorage.removeItem(getActiveKey(hwId))
    sessionStorage.removeItem(getSessionTokenKey(hwId))
    sessionStorage.removeItem(getActiveKey(hwId))
    sessionStorage.removeItem(`exam_session_token_${hwId}`)
    sessionStorage.removeItem(`exam_active_${hwId}`)
    sessionStorage.removeItem('mock_violations_count')
  }

  let timerInterval = null
  let heartbeatInterval = null
  let autosaveInterval = null
  let examSessionToken = localStorage.getItem(getSessionTokenKey(hw.id)) || 
                         sessionStorage.getItem(getSessionTokenKey(hw.id)) || 
                         sessionStorage.getItem(`exam_session_token_${hw.id}`) || null
  let examStarted = false
  let examSessionId = null
  let isAway = false
  let awayLog = null
  let examLocked = false
  let pendingViolation = null
  let currentViolationsCount = 0
  let maxViolationsAllowed = hw.maxViolations || hw.max_violations || 3
  let signalQueue = []
  let signalFlush = null
  let wasOffline = typeof navigator !== 'undefined' && navigator.onLine === false
  let engineClosed = false
  const persistSignals = () => localStorage.setItem(signalKey, JSON.stringify(signalQueue))
  const loadSignals = () => {
    try {
      const stored = JSON.parse(localStorage.getItem(signalKey))
      signalQueue = Array.isArray(stored) ? stored.filter(e => e.sessionId === examSessionId &&
        ['EXAM_STARTED', 'EXAM_RESUMED', 'CONNECTION_RESTORED', 'AUTOSAVE_RECOVERED'].includes(e.action) &&
        /^[A-Za-z0-9_-]{1,128}$/.test(e.eventId)) : []
    } catch (_) { signalQueue = [] }
    persistSignals()
  }
  const flushSignals = () => {
    if (signalFlush || !examStarted || examLocked || isSubmitting || engineClosed || !examSessionId || !examSessionToken ||
      (typeof navigator !== 'undefined' && navigator.onLine === false)) return signalFlush
    signalFlush = (async () => {
      while (signalQueue.length && !examLocked && !isSubmitting && !engineClosed) {
        const event = signalQueue[0]
        try {
          const result = await api.submitExamLog({ homeworkId: hw.id, action: event.action,
            eventId: event.eventId, sessionId: event.sessionId, sessionToken: examSessionToken })
          if (result?.success !== true) throw new Error('Chưa xác nhận tín hiệu')
          signalQueue.shift()
          persistSignals()
        } catch (error) {
          // Unknown outcome: keep the exact event ID for the next connectivity/recovery attempt.
          console.warn('[ExamRoom] Signal status uncertain:', error)
          break
        }
      }
    })().finally(() => { signalFlush = null })
    return signalFlush
  }
  const recordSignal = action => {
    if (!examStarted || examLocked || isSubmitting || engineClosed || !examSessionId || remainingSeconds() <= 0) return
    signalQueue.push({ action, eventId: crypto.randomUUID().replace(/-/g, ''), sessionId: examSessionId })
    persistSignals()
    flushSignals()
  }
  const handleOffline = () => { wasOffline = true }
  const handleOnline = () => {
    if (!wasOffline) return
    wasOffline = false
    if (!examStarted || examLocked || isSubmitting || engineClosed) return
    recordSignal('CONNECTION_RESTORED')
    flushSignals()
  }
  const loadPendingLog = () => {
    try {
      const event = JSON.parse(localStorage.getItem(pendingLogKey))
      if (event?.sessionId === examSessionId && /^[A-Za-z0-9_-]{1,128}$/.test(event.eventId) &&
        ['LEAVE_TAB', 'BLUR_TAB', 'LEAVE_EXAM', 'DEVTOOLS', 'FULLSCREEN_EXIT', 'COPY', 'PASTE'].includes(event.action)) return event
    } catch (_) {}
    localStorage.removeItem(pendingLogKey)
    return null
  }

  // Render KaTeX Math across questions container (same proven approach as homework-solver.js)
  const qContainer = document.getElementById('exam-questions-container')
  if (qContainer) {
    renderMath(qContainer)
    setTimeout(() => renderMath(qContainer), 150)
  }

  // Answer selection handlers (clicking selected option again deselects it)
  document.querySelectorAll('.exam-option-card').forEach(card => {
    card.addEventListener('click', () => {
      if (!examStarted || examLocked || isSubmitting || remainingSeconds() <= 0) {
        showToast('Vui lòng đọc và xác nhận quy chế phòng thi để bắt đầu làm bài!', 'warning')
        return
      }
      const qNum = parseInt(card.dataset.qnum, 10)
      const optId = card.dataset.optid
      const isAlreadySelected = studentAnswers.mc[qNum] === optId

      if (isAlreadySelected) {
        // Bỏ chọn đáp án khi click lại lần 2
        studentAnswers.mc[qNum] = null
        card.classList.remove('selected')
        updatePaletteButton(qNum, false)
      } else {
        studentAnswers.mc[qNum] = optId
        // Update card visual
        document.querySelectorAll(`.exam-option-card[data-qnum="${qNum}"]`).forEach(c => c.classList.remove('selected'))
        card.classList.add('selected')
        updatePaletteButton(qNum, true)
      }

      updateExamProgress(questions.length)
      saveDraftToStorage(hw.id, studentAnswers, timeLeftSeconds)
    })
  })

  // True/False toggle buttons (clicking active button again deselects it)
  document.querySelectorAll('.tf-toggle-btn').forEach(btn => {
    btn.addEventListener('click', (e) => {
      e.stopPropagation()
      if (!examStarted || examLocked || isSubmitting || remainingSeconds() <= 0) {
        showToast('Vui lòng đọc và xác nhận quy chế phòng thi để bắt đầu làm bài!', 'warning')
        return
      }
      const qNum = parseInt(btn.dataset.qnum, 10)
      const sub = btn.dataset.sub
      const val = btn.dataset.val === 'true'

      if (!studentAnswers.tf[qNum]) studentAnswers.tf[qNum] = {}
      const currentVal = studentAnswers.tf[qNum][sub]
      const row = btn.closest('.tf-statement-row')

      if (currentVal === val) {
        // Bỏ chọn đáp án Đúng/Sai khi click lại
        delete studentAnswers.tf[qNum][sub]
        btn.classList.remove('active')
        btn.style.background = '#ffffff'
        btn.style.color = '#475569'
        btn.style.borderColor = '#cbd5e1'
        btn.style.boxShadow = 'none'
        if (row) {
          row.style.background = '#ffffff'
          row.style.borderColor = '#e2e8f0'
        }
      } else {
        studentAnswers.tf[qNum][sub] = val
        if (row) {
          row.querySelectorAll('.tf-toggle-btn').forEach(b => {
            b.classList.remove('active')
            b.style.background = '#ffffff'
            b.style.color = '#475569'
            b.style.borderColor = '#cbd5e1'
            b.style.boxShadow = 'none'
          })
          btn.classList.add('active')
          btn.style.background = val ? '#16a34a' : '#dc2626'
          btn.style.color = '#ffffff'
          btn.style.borderColor = val ? '#16a34a' : '#dc2626'
          btn.style.boxShadow = val ? '0 2px 4px rgba(22,163,74,0.2)' : '0 2px 4px rgba(220,38,38,0.2)'
          row.style.background = val ? '#f0fdf4' : '#fef2f2'
          row.style.borderColor = val ? '#86efac' : '#fca5a5'
        }
      }

      // Check how many of 4 answered
      const tfCount = ['a', 'b', 'c', 'd'].filter(k => studentAnswers.tf[qNum][k] !== undefined).length
      updatePaletteButton(qNum, tfCount === 4, tfCount > 0 && tfCount < 4)
      updateExamProgress(questions.length)
      saveDraftToStorage(hw.id, studentAnswers, timeLeftSeconds)
    })
  })

  // Short answer inputs
  document.querySelectorAll('.student-interactive-sa-input').forEach(input => {
    input.addEventListener('focus', (e) => {
      if (!examStarted || examLocked || isSubmitting || remainingSeconds() <= 0) {
        e.target.blur()
        showToast('Vui lòng đọc và xác nhận quy chế phòng thi để bắt đầu làm bài!', 'warning')
      }
    })
    input.addEventListener('input', (e) => {
      if (!examStarted || examLocked || isSubmitting || remainingSeconds() <= 0) {
        e.target.value = ''
        return
      }
      const qNum = parseInt(input.dataset.qnum, 10)
      const val = e.target.value.trim()
      studentAnswers.sa[qNum] = val

      const hasVal = val.length > 0
      updatePaletteButton(qNum, hasVal)
      updateExamProgress(questions.length)

      clearTimeout(saDebounceTimer)
      saDebounceTimer = setTimeout(() => {
        saveDraftToStorage(hw.id, studentAnswers, timeLeftSeconds)
      }, 300)
    })
  })
  document.querySelectorAll('.student-interactive-essay-input').forEach(input => {
    input.addEventListener('focus', (e) => {
      if (!examStarted || examLocked || isSubmitting || remainingSeconds() <= 0) { e.target.blur(); return }
    })
    input.addEventListener('input', (e) => {
      if (!examStarted || examLocked || isSubmitting || remainingSeconds() <= 0) return
      const qNum = parseInt(input.dataset.qnum, 10)
      const val = e.target.value
      studentAnswers.essay[qNum] = val
      updatePaletteButton(qNum, !!val.trim())
      updateExamProgress(questions.length)
      clearTimeout(saDebounceTimer)
      saDebounceTimer = setTimeout(() => saveDraftToStorage(hw.id, studentAnswers, timeLeftSeconds), 500)
    })
  })

  // Quick jump palette buttons
  document.querySelectorAll('.exam-nav-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      const qNum = btn.dataset.qnum
      const targetCard = document.getElementById(`exam-q-card-${qNum}`)
      if (targetCard) {
        targetCard.scrollIntoView({ behavior: 'smooth', block: 'start' })
      }
    })
  })

  // Flag question button
  document.querySelectorAll('.btn-flag-question').forEach(btn => {
    btn.addEventListener('click', (e) => {
      e.stopPropagation()
      const qNum = parseInt(btn.dataset.qnum, 10)
      const card = document.getElementById(`exam-q-card-${qNum}`)
      const palBtn = document.querySelector(`.exam-nav-btn[data-qnum="${qNum}"]`)

      if (flaggedQuestions.has(qNum)) {
        flaggedQuestions.delete(qNum)
        btn.innerHTML = '<i class="fa-solid fa-bookmark"></i> Đánh dấu'
        btn.style.color = '#94a3b8'
        card?.classList.remove('flagged')
        palBtn?.classList.remove('flagged')
      } else {
        flaggedQuestions.add(qNum)
        btn.innerHTML = '<i class="fa-solid fa-bookmark"></i> Đã đánh dấu'
        btn.style.color = '#f59e0b'
        card?.classList.add('flagged')
        palBtn?.classList.add('flagged')
      }
    })
  })

  // Helpers to update palette
  function updatePaletteButton(qNum, isAnswered, isPartial = false) {
    const btn = document.querySelector(`.exam-nav-btn[data-qnum="${qNum}"]`)
    if (!btn) return
    btn.classList.remove('answered', 'partial')
    if (isAnswered) btn.classList.add('answered')
    else if (isPartial) btn.classList.add('partial')
  }

  function updateExamProgress(total) {
    let answered = 0
    questions.forEach(q => {
      const qNum = q.question_number || q.questionNumber
      if (q.question_type === 'MULTIPLE_CHOICE' && studentAnswers.mc[qNum]) answered++
      else if (q.question_type === 'TRUE_FALSE') {
        const tf = studentAnswers.tf[qNum] || {}
        if (['a', 'b', 'c', 'd'].every(k => tf[k] !== undefined)) answered++
      } else if (q.question_type === 'SHORT_ANSWER' && studentAnswers.sa[qNum] && String(studentAnswers.sa[qNum]).trim() !== '') {
        answered++
      } else if (q.question_type === 'ESSAY' && studentAnswers.essay[qNum] && String(studentAnswers.essay[qNum]).trim() !== '') {
        answered++
      }
    })

    const pct = total > 0 ? Math.round((answered / total) * 100) : 0
    const txt = document.getElementById('exam-progress-text')
    const bar = document.getElementById('exam-progress-bar')
    if (txt) txt.textContent = `${answered}/${total} câu (${pct}%)`
    if (bar) bar.style.width = `${pct}%`
  }

  // Build submission payload
  const buildSubmissionAnswers = () => {
    return questions.map(q => {
      const qNum = q.question_number || q.questionNumber
      const rawType = (q.question_type || q.questionType || '').toUpperCase()
      const isTf = rawType === 'TRUE_FALSE' || rawType === 'TF' || (Array.isArray(q.statements) && q.statements.length > 0)
      const isSa = rawType === 'SHORT_ANSWER' || rawType === 'SA'
      const isEssay = rawType === 'ESSAY' || rawType === 'TL'

      if (isTf) {
        const tfObj = studentAnswers.tf[qNum] || {}
        const valObj = {}
        const getBool = (v) => {
          if (v === true || v === 'true' || v === 1 || v === '1') return true
          if (v === false || v === 'false' || v === 0 || v === '0') return false
          return undefined
        }
        ;['a', 'b', 'c', 'd'].forEach(k => {
          const b = getBool(tfObj[k])
          if (b !== undefined) valObj[k] = b
        })
        return { questionId: q.id, givenAnswer: { type: 'TRUE_FALSE', value: valObj } }
      } else if (isEssay) {
        return { questionId: q.id, givenAnswer: { type: 'ESSAY', value: String(studentAnswers.essay[qNum] || '') } }
      } else if (isSa) {
        return {
          questionId: q.id,
          givenAnswer: {
            type: 'SHORT_ANSWER',
            value: studentAnswers.sa[qNum] !== undefined && studentAnswers.sa[qNum] !== null ? String(studentAnswers.sa[qNum]) : ''
          }
        }
      } else {
        return {
          questionId: q.id,
          givenAnswer: {
            type: 'MULTIPLE_CHOICE',
            value: studentAnswers.mc[qNum] || null
          }
        }
      }
    })
  }

  const disableAllInputs = () => {
    const root = document.querySelector('.exam-room-layout') || document.body
    const elements = root.querySelectorAll('input, textarea, button:not(#retry-submit-btn), select')
    elements.forEach(el => {
      if (el.id !== 'modal-close-btn' && el.id !== 'modal-cancel-btn') {
        el.disabled = true
        el.style.pointerEvents = 'none'
      }
    })

    // Specifically disable interactive markdown option cards, toggle buttons, and nav palette
    const interactiveCards = root.querySelectorAll('.exam-option-card, .tf-toggle-btn, .tf-statement-row, .btn-flag-question, .exam-nav-btn')
    interactiveCards.forEach(card => {
      card.style.pointerEvents = 'none'
      card.style.cursor = 'not-allowed'
    })

    // Freeze question containers
    const questionContainers = root.querySelectorAll('#exam-questions-container, .exam-room-body, .exam-sidebar-palette')
    questionContainers.forEach(qc => {
      qc.style.pointerEvents = 'none'
      qc.style.opacity = '0.75'
    })
  }

  const enableExamInputs = () => {
    const root = document.querySelector('.exam-room-layout')
    root?.querySelectorAll('input, textarea, button, select').forEach(el => {
      el.disabled = false
      el.style.pointerEvents = ''
    })
    root?.querySelectorAll('.exam-option-card, .tf-toggle-btn, .tf-statement-row, .btn-flag-question, .exam-nav-btn, #exam-questions-container, .exam-room-body, .exam-sidebar-palette').forEach(el => {
      el.style.pointerEvents = ''
      el.style.opacity = ''
      el.style.cursor = ''
    })
  }

  // Submit Handler
  let isSubmitting = false
  const performSubmit = async (expired = false) => {
    expired = expired || remainingSeconds() <= 0
    if (isSubmitting || submittedOrUncertain || (examLocked && !expired)) return
    isSubmitting = true
    submittedOrUncertain = true
    examLocked = true
    localStorage.setItem(submitAttemptKey, examSessionToken || '')

    // After expiry only the last acknowledged server snapshot is eligible; never claim
    // a debounced/local or in-flight autosave was accepted.
    clearTimeout(saDebounceTimer)
    if (!expired) saveDraftToStorage(hw.id, studentAnswers, remainingSeconds())
    closeModal()
    disableAllInputs()

    try {
      cleanupExamEngine()
       showToast(expired ? 'Hết giờ: đang gửi bản nháp đã được máy chủ xác nhận...' : 'Đang nộp bài làm và chấm điểm...', 'info')
      const submissionAnswers = expired ? confirmedServerDraft : buildSubmissionAnswers()
      const totalDurationSeconds = (hw.durationMinutes || 45) * 60
      const durationSecondsTaken = Math.max(0, totalDurationSeconds - remainingSeconds())

      const payload = {
        homeworkId: hw.id,
        answers: submissionAnswers,
        durationSecondsTaken,
         sessionToken: examSessionToken
      }

       const result = await api.submitHomework(payload)
       if (!result?.submissionId) throw new Error('Chưa xác nhận được bài nộp từ máy chủ')
       clearDraftStorage(hw.id)
        clearSessionStorageData(hw.id)
        localStorage.removeItem(pendingLogKey)
        localStorage.removeItem(signalKey)
        localStorage.removeItem(submitAttemptKey)

      state.lastSubmissionResult = result
       showToast('Nộp bài thành công!', 'success')
       window.location.hash = `#assignment-review?submissionId=${result.submissionId}`
      return result
    } catch (err) {
      console.error('Submit failed:', err)
      const expiredOnServer = String(err?.message || '').includes('EXAM_EXPIRED')
      showToast(expiredOnServer ? 'Máy chủ báo phiên thi đã hết giờ.' : 'Chưa xác nhận được kết quả nộp bài.', 'error')

       {
         openModal(
          expiredOnServer ? 'PHIÊN THI ĐÃ HẾT GIỜ' : 'CHƯA XÁC NHẬN KẾT QUẢ NỘP BÀI',
          `
            <div style="text-align:center; padding:12px; color:#ef4444;">
              <i class="fa-solid fa-triangle-exclamation" style="font-size:44px; margin-bottom:12px;"></i>
               <p style="font-size:15px; color:#1e293b; font-weight:600; margin-bottom:8px;">${expiredOnServer ? 'Máy chủ từ chối vì thời lượng phiên thi đã hết; hạn nộp bài tập không ngăn nộp muộn.' : 'Chưa biết yêu cầu nộp bài đã được xử lý hay chưa.'}</p>
              <p style="font-size:13px; color:#64748b; line-height:1.5; margin-bottom:12px;">
                 Chi tiết: ${escapeHtml(err.message || 'Lỗi mạng')}.<br>
                  ${expired ? 'Những thay đổi chưa được máy chủ xác nhận trước lúc hết giờ có thể không nằm trong bài nộp.<br>' : ''}
                  Bản nháp trên thiết bị vẫn được giữ. Hãy kiểm tra kết quả trong lớp học hoặc liên hệ giáo viên; không gửi lại bài khi chưa xác minh.
              </p>
            </div>
          `,
            () => { window.location.hash = '#my-classes'; return true },
            { confirmLabel: 'Kiểm tra trong lớp học', showCancel: false }
         )
      }
      return null
    }
  }

  // Bind Submit Buttons (top & sidebar)
  const handleConfirmSubmit = () => {
    if (!examStarted || isSubmitting || submittedOrUncertain || examLocked || remainingSeconds() <= 0) return
    let unansweredCount = 0
    questions.forEach(q => {
      const qNum = q.question_number || q.questionNumber
      if (q.question_type === 'MULTIPLE_CHOICE' && !studentAnswers.mc[qNum]) unansweredCount++
      else if (q.question_type === 'TRUE_FALSE') {
        const tf = studentAnswers.tf[qNum] || {}
        if (!['a', 'b', 'c', 'd'].every(k => tf[k] !== undefined)) unansweredCount++
      } else if (q.question_type === 'SHORT_ANSWER' && (!studentAnswers.sa[qNum] || String(studentAnswers.sa[qNum]).trim() === '')) {
        unansweredCount++
      } else if (q.question_type === 'ESSAY' && (!studentAnswers.essay[qNum] || String(studentAnswers.essay[qNum]).trim() === '')) {
        unansweredCount++
      }
    })

    const warningText = unansweredCount > 0 
      ? `<p style="color:#d97706; font-weight:600; margin-top:8px;">⚠️ Bạn còn <strong>${unansweredCount}</strong> câu chưa hoàn thành!</p>`
      : ''

    openModal(
      'XÁC NHẬN NỘP BÀI THI',
      `
        <div style="font-size:14.5px; line-height:1.6; color:#334155; text-align:center;">
          <i class="fa-solid fa-paper-plane" style="font-size:42px; color:#059669; margin-bottom:12px;"></i><br>
          Bạn có chắc chắn muốn nộp bài thi ngay bây giờ?<br>
          Bài thi chính thức chỉ được nộp <strong>01 lần duy nhất</strong>.
          ${warningText}
        </div>
      `,
       async () => !!(await performSubmit())
    )
  }

  document.getElementById('btn-top-submit-exam')?.addEventListener('click', handleConfirmSubmit)
  document.getElementById('btn-submit-exam-sidebar')?.addEventListener('click', handleConfirmSubmit)

  // Exit Exam Room warning
  const confirmExitExamRoom = () => {
    openModal(
      'CẢNH BÁO RỜI PHÒNG THI',
      `
        <div style="font-size:14.5px; color:#ef4444; line-height:1.6; text-align:center;">
          <i class="fa-solid fa-triangle-exclamation" style="font-size:40px; margin-bottom:12px;"></i><br>
          Rời khỏi phòng thi lúc này sẽ <strong>ghi nhận 01 lần vi phạm (Rời phòng thi)</strong>.<br>
          Bạn có chắc chắn muốn thoát về danh sách lớp học không?
        </div>
      `,
       async () => {
         const result = await recordViolation('LEAVE_EXAM')
         if (!result || examLocked) return false
         clearSessionStorageData(hw.id)
        cleanupExamEngine()
        window.location.hash = '#my-classes'
        return true
      }
    )
  }
  document.getElementById('btn-exit-exam-room')?.addEventListener('click', confirmExitExamRoom)
  document.querySelector('.exam-toolbar-back')?.addEventListener('click', confirmExitExamRoom)

  // View PDF Attachment Modal if requested
  document.getElementById('btn-toggle-exam-pdf')?.addEventListener('click', () => {
    const pdfUrl = (hw.pdfUrl || '').replace(/https?:\/\/kong:8000/, import.meta.env.VITE_SUPABASE_URL || 'http://localhost:54321')
    openModal(
      `Đề bài PDF: ${escapeHtml(hw.pdfPath || hw.title)}`,
      `
        <div style="height:70vh; width:100%;">
          <iframe src="${pdfUrl}" style="width:100%; height:100%; border:none; border-radius:8px; background:#f8fafc;"></iframe>
        </div>
      `
    )
  })

  // =========================================================
  // TIMER & PROCTORING UI UPDATERS
  // =========================================================
  const updateTimerDisplay = () => {
    const timerDisplay = document.getElementById('exam-timer-display')
    if (!timerDisplay) return
    timeLeftSeconds = remainingSeconds()
    const safeSeconds = timeLeftSeconds
    const minutes = Math.floor(safeSeconds / 60)
    const seconds = safeSeconds % 60
    timerDisplay.textContent = `${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`

    if (safeSeconds <= 300) {
      timerDisplay.style.color = '#dc2626'
      timerDisplay.style.fontWeight = '800'
      const timerBox = timerDisplay.closest('.timer-box') || timerDisplay.parentElement
      if (timerBox) {
        timerBox.style.background = '#fef2f2'
        timerBox.style.borderColor = '#fca5a5'
        timerBox.style.color = '#dc2626'
      }
    }
  }

  const updateViolationsDisplay = () => {
    const countEl = document.getElementById('exam-violations-count')
    const sideCountEl = document.getElementById('exam-side-violations')
    if (countEl) countEl.textContent = String(currentViolationsCount)
    if (sideCountEl) sideCountEl.textContent = String(currentViolationsCount)
    const pill = document.getElementById('exam-violations-pill')
    const side = sideCountEl?.parentElement
    if (pill?.querySelector('span')) pill.querySelector('span').innerHTML = `Vi phạm: <strong id="exam-violations-count">${currentViolationsCount}</strong>/${maxViolationsAllowed}`
    if (side) side.innerHTML = `<span id="exam-side-violations">${currentViolationsCount}</span>/${maxViolationsAllowed} lần`
  }

  const startTimer = () => {
    updateTimerDisplay()
      if (timerInterval) clearInterval(timerInterval)

    if (timeLeftSeconds <= 0) {
      if (!examLocked) performSubmit(true)
      return
    }

    let warnedFive = false
    let warnedOne = false
    timerInterval = setInterval(() => {
      updateTimerDisplay()
      if (timeLeftSeconds <= 0) {
        clearInterval(timerInterval)
        if (!examLocked) performSubmit(true)
        return
      }

      if (timeLeftSeconds <= 300 && !warnedFive) {
        warnedFive = true
        showToast('Thời gian làm bài thi của bạn còn 5 phút!', 'warning')
      } else if (timeLeftSeconds <= 60 && !warnedOne) {
        warnedOne = true
        showToast('Thời gian làm bài thi của bạn còn 1 phút!', 'warning')
      }
    }, 1000)
  }

  const handleSessionOverridden = () => {
    cleanupExamEngine()
    openModal(
      'PHIÊN THI BỊ THAY THẾ',
      `
        <div style="text-align:center; padding:18px; color:#ef4444;">
          <i class="fa-solid fa-desktop" style="font-size:52px; margin-bottom:16px;"></i><br>
          <h3 style="font-size:17px; font-weight:700; color:#0f172a; margin-bottom:10px;">Bài thi đang mở ở thiết bị hoặc tab khác</h3>
          <p style="font-size:14px; color:#475569; line-height:1.6; margin-bottom:12px;">
            Hệ thống phát hiện phiên thi của bạn đã được tiếp tục ở một cửa sổ trình duyệt hoặc thiết bị khác.<br>
            Để đảm bảo tính trung thực, cửa sổ này đã dừng hoạt động.
          </p>
        </div>
      `,
      () => {
        window.location.hash = '#my-classes'
        return true
      }
    )
  }

  const startHeartbeat = () => {
    if (heartbeatInterval) clearInterval(heartbeatInterval)
    heartbeatInterval = setInterval(async () => {
      if (!examSessionToken || examLocked || isSubmitting || remainingSeconds() <= 0) return
      try {
        await api.heartbeatExamSession(hw.id, examSessionToken)
      } catch (e) {
        if (e.message && (e.message.includes('INVALID_TOKEN') || e.message.includes('ghi đè') || e.message.includes('403'))) {
          handleSessionOverridden()
        } else {
          console.warn('Heartbeat blip:', e)
        }
      }
    }, 15000)
  }

  const startAutosave = () => {
    if (autosaveInterval) clearInterval(autosaveInterval)
    autosaveInterval = setInterval(async () => {
      if (!examSessionToken || examLocked || isSubmitting || autosaveInFlight || remainingSeconds() <= 0) return
      autosaveInFlight = true
      try {
        updateAutosaveIndicator(false)
        const draftAnswers = buildSubmissionAnswers()
        await api.autosaveExamSession(hw.id, examSessionToken, draftAnswers)
        if (!examLocked && remainingSeconds() > 0) {
          confirmedServerDraft = draftAnswers
          updateAutosaveIndicator(true)
          if (autosaveFailed) {
            autosaveFailed = false
            recordSignal('AUTOSAVE_RECOVERED')
          }
        }
      } catch (e) {
        if (e.message && (e.message.includes('INVALID_TOKEN') || e.message.includes('ghi đè') || e.message.includes('403'))) {
          handleSessionOverridden()
        } else {
          console.warn('Autosave blip:', e)
          autosaveFailed = true
          showAutosaveError()
        }
      } finally {
        autosaveInFlight = false
      }
    }, 15000)
  }

  const showLogUncertain = (event) => {
    if (isSubmitting) return
    showToast('Chưa xác nhận được nhật ký giám sát. Vui lòng thử đồng bộ lại; số vi phạm chưa được cập nhật.', 'warning')
    openModal('CHƯA XÁC NHẬN NHẬT KÝ',
      '<p>Không thể xác nhận trạng thái ghi nhận sự kiện. Bài làm vẫn được giữ; hãy thử đồng bộ lại trước khi tiếp tục.</p>',
      async () => !!(await recordViolation(event.action, event)),
      { confirmLabel: 'Thử đồng bộ lại', beforeClose: () => !pendingViolation })
  }

  const showPendingAutoSubmit = (event) => {
    openModal('ĐANG XÁC MINH BÀI THI',
      '<p>Máy chủ đang xử lý vi phạm. Chưa thể xác nhận bài thi đã nộp. Bản nháp được giữ trên thiết bị; vui lòng thử kiểm tra lại hoặc liên hệ giáo viên nếu trạng thái vẫn chưa rõ.</p>',
      async () => {
        await recordViolation(event.action, event)
        return !pendingViolation
      },
      { confirmLabel: 'Kiểm tra lại', beforeClose: () => !pendingViolation })
  }

  const handleConfirmedDisqualification = () => {
    if (examLocked && !pendingViolation) return
    pendingViolation = null
    examLocked = true
    cleanupExamEngine()
    disableAllInputs()
    clearDraftStorage(hw.id)
    clearSessionStorageData(hw.id)
    localStorage.removeItem(pendingLogKey)
    localStorage.removeItem(signalKey)
    openModal('ĐÌNH CHỈ BÀI THI DO VI PHẠM', `
      <div style="text-align:center; padding:18px; color:#b91c1c;">
        <i class="fa-solid fa-ban" style="font-size:52px; margin-bottom:16px;"></i>
        <h3>Máy chủ đã xác nhận đình chỉ và thu bài.</h3>
        <p>Số lần vi phạm: ${currentViolationsCount}/${maxViolationsAllowed}.</p>
      </div>`, () => { window.location.hash = '#my-classes'; return true },
    { confirmLabel: 'Quay lại lớp học', showCancel: false })
  }

  // Each physical event has one ID. An uncertain request is retried with that SAME ID,
  // never counted optimistically; only the server's confirmed count changes the UI.
  const recordViolation = async (action, retryEvent = null) => {
    if (!examStarted || isSubmitting || (examLocked && (!pendingViolation || retryEvent !== pendingViolation))) return null
    const event = retryEvent || { action, eventId: crypto.randomUUID().replace(/-/g, '') }
    if (event.inFlight) return event.inFlight
    // A reload during a request must retry the same logical event, not invent a new violation.
    if (action !== 'RETURN_TAB') localStorage.setItem(pendingLogKey, JSON.stringify({ action: event.action, eventId: event.eventId, sessionId: examSessionId }))
    event.inFlight = (async () => {
      try {
        const res = await api.submitExamLog({
          homeworkId: hw.id, action: event.action, sessionToken: examSessionToken,
          eventId: event.eventId, ...(examSessionId ? { sessionId: examSessionId } : {})
        })
        if (typeof res?.currentViolations !== 'number' || typeof res?.maxViolations !== 'number' || typeof res?.autoSubmitted !== 'boolean') {
          throw new Error('Phản hồi nhật ký không hợp lệ')
        }
        if (res.autoSubmitted && !res.submissionId) throw new Error('Thiếu xác nhận bài nộp')
        currentViolationsCount = res.currentViolations
        maxViolationsAllowed = res.maxViolations
        updateViolationsDisplay()
        if (res.autoSubmitted) {
          handleConfirmedDisqualification()
        } else if (res.autoSubmitPending || res.currentViolations >= res.maxViolations) {
          // READY/unknown is not equivalent to a confirmed submission either.
          examLocked = true
          pendingViolation = event
          clearInterval(timerInterval)
          clearInterval(autosaveInterval)
          disableAllInputs()
          showPendingAutoSubmit(event)
        } else if (pendingViolation === event) {
          pendingViolation = null
          examLocked = false
          enableExamInputs()
          startTimer()
          startAutosave()
        }
        if (!pendingViolation && action !== 'RETURN_TAB') localStorage.removeItem(pendingLogKey)
        return res
      } catch (e) {
        console.warn('[ExamRoom] Exam log status uncertain:', e)
        examLocked = true
        pendingViolation = event
        clearInterval(timerInterval)
        clearInterval(autosaveInterval)
        saveDraftToStorage(hw.id, studentAnswers, timeLeftSeconds)
        disableAllInputs()
        showLogUncertain(event)
        return null
      } finally {
        event.inFlight = null
      }
    })()
    return event.inFlight
  }

  // Visibility and focus commonly fire together: one away event per absence.
  const handleUserReturnedFromAway = async () => {
    if (!examStarted || !isAway || isSubmitting || examLocked) return
    isAway = false
    const result = await awayLog
    if (!result || examLocked || isSubmitting) return
    recordViolation('RETURN_TAB')
    openModal('CẢNH BÁO VI PHẠM QUY CHẾ THI', `
      <div style="text-align:center; padding:12px;">
        <p>Máy chủ đã ghi nhận sự kiện rời màn hình thi${result.counted ? ' và tính vi phạm' : ' (không tính thêm vi phạm)'}.</p>
        <strong>Số lần vi phạm: ${currentViolationsCount}/${maxViolationsAllowed}</strong>
      </div>`, () => true, { confirmLabel: 'Tiếp tục làm bài' })
  }

  const handleVisibilityChange = async () => {
    if (!examStarted || isSubmitting) return
    if (document.hidden) {
      if (!isAway) {
        isAway = true
        awayLog = recordViolation('LEAVE_TAB')
      }
    } else {
      await handleUserReturnedFromAway()
    }
  }

  const handleBlur = async () => {
    if (!examStarted || isSubmitting) return
    if (document.activeElement && document.activeElement.tagName === 'IFRAME') {
      return
    }
    if (!document.hidden && !isAway) {
      isAway = true
      awayLog = recordViolation('BLUR_TAB')
    }
  }

  const handleFocus = async () => {
    if (!examStarted || isSubmitting) return
    if (isAway && !document.hidden) {
      await handleUserReturnedFromAway()
    }
  }

  const handleKeyDown = async (e) => {
    if (!examStarted) return
    const key = e.key
    const ctrl = e.ctrlKey || e.metaKey
    const shift = e.shiftKey

    // Trap DevTools & Source Inspect Shortcuts
    if (
      key === 'F12' ||
      (ctrl && shift && (key === 'I' || key === 'i' || key === 'J' || key === 'j' || key === 'C' || key === 'c')) ||
      (ctrl && (key === 'U' || key === 'u' || key === 'S' || key === 's' || key === 'P' || key === 'p'))
    ) {
      e.preventDefault()
      e.stopPropagation()
      showToast('Phím tắt bị vô hiệu hóa trong phòng thi chính thức!', 'error')
      await recordViolation('DEVTOOLS')
      return false
    }

    // Trap Copy / Paste / Cut Shortcuts
    if (ctrl && (key === 'C' || key === 'c' || key === 'V' || key === 'v' || key === 'X' || key === 'x')) {
      const activeEl = document.activeElement
      const isInput = activeEl && (activeEl.tagName === 'INPUT' || activeEl.tagName === 'TEXTAREA')
      if (!isInput || (key === 'C' || key === 'c' || key === 'X' || key === 'x')) {
        e.preventDefault()
        e.stopPropagation()
        showToast('Thao tác sao chép / dán bị vô hiệu hóa trong phòng thi!', 'error')
        await recordViolation(key.toUpperCase() === 'V' ? 'PASTE' : 'COPY')
        return false
      }
    }
  }

  const handleBeforeUnload = (e) => {
    if (examStarted) {
      e.preventDefault()
      e.returnValue = 'Bạn đang trong bài thi chính thức. Rời khỏi phòng thi lúc này bài thi sẽ bị tính vi phạm.'
      return e.returnValue
    }
  }

  const handleCopy = (e) => {
    if (!examStarted) return
    e.preventDefault()
    showToast('Không được phép sao chép nội dung trong phòng thi!', 'error')
    recordViolation('COPY')
  }

  const handlePaste = (e) => {
    if (!examStarted) return
    const activeEl = document.activeElement
    if (!activeEl || activeEl.tagName !== 'INPUT') {
      e.preventDefault()
      showToast('Không được phép dán nội dung trong phòng thi!', 'error')
      recordViolation('PASTE')
    }
  }

  const handleContextMenu = (e) => {
    if (!examStarted) return
    e.preventDefault()
    showToast('Menu chuột phải bị khóa trong phòng thi!', 'warning')
  }

  const cleanupExamEngine = () => {
    engineClosed = true
    if (timerInterval) clearInterval(timerInterval)
    if (heartbeatInterval) clearInterval(heartbeatInterval)
    if (autosaveInterval) clearInterval(autosaveInterval)
    document.removeEventListener('visibilitychange', handleVisibilityChange)
    window.removeEventListener('blur', handleBlur)
    window.removeEventListener('focus', handleFocus)
    window.removeEventListener('keydown', handleKeyDown, true)
    window.removeEventListener('beforeunload', handleBeforeUnload)
    document.removeEventListener('copy', handleCopy)
    document.removeEventListener('paste', handlePaste)
    document.removeEventListener('contextmenu', handleContextMenu)
    window.removeEventListener('hashchange', cleanupExamEngine)
    window.removeEventListener('offline', handleOffline)
    window.removeEventListener('online', handleOnline)
  }
  window.addEventListener('hashchange', cleanupExamEngine)
  window.addEventListener('offline', handleOffline)
  window.addEventListener('online', handleOnline)

  // Attach event listeners
  document.addEventListener('visibilitychange', handleVisibilityChange)
  window.addEventListener('blur', handleBlur)
  window.addEventListener('focus', handleFocus)
  window.addEventListener('keydown', handleKeyDown, true)
  window.addEventListener('beforeunload', handleBeforeUnload)
  document.addEventListener('copy', handleCopy)
  document.addEventListener('paste', handlePaste)
  document.addEventListener('contextmenu', handleContextMenu)

  // =========================================================
  // INIT OR RESUME EXAM SESSION
  // =========================================================
  const restoreDraftAnswersFromServer = (drafts) => {
    if (!Array.isArray(drafts)) return
    confirmedServerDraft = structuredClone(drafts)
    studentAnswers = { mc: {}, tf: {}, sa: {}, essay: {} }
    document.querySelectorAll('.exam-option-card').forEach(el => el.classList.remove('selected'))
    document.querySelectorAll('.tf-toggle-btn').forEach(el => { el.classList.remove('active'); el.style.background = '#ffffff'; el.style.color = '#475569' })
    document.querySelectorAll('.student-interactive-sa-input, .student-interactive-essay-input').forEach(el => { el.value = '' })
    questions.forEach(q => updatePaletteButton(q.question_number || q.questionNumber, false))
    drafts.forEach(ans => {
      const q = questions.find(item => item.id === ans.questionId)
      if (!q) return
      const qNum = q.question_number || q.questionNumber
      if (ans.givenAnswer?.type === 'MULTIPLE_CHOICE' && ans.givenAnswer.value) {
        studentAnswers.mc[qNum] = ans.givenAnswer.value
        const card = document.querySelector(`.exam-option-card[data-qnum="${qNum}"][data-optid="${ans.givenAnswer.value}"]`)
        card?.classList.add('selected')
        updatePaletteButton(qNum, true)
      } else if (ans.givenAnswer?.type === 'TRUE_FALSE' && ans.givenAnswer.value) {
        if (!studentAnswers.tf[qNum]) studentAnswers.tf[qNum] = {}
        Object.entries(ans.givenAnswer.value).forEach(([sub, val]) => {
          studentAnswers.tf[qNum][sub] = val
          const b = document.querySelector(`.tf-toggle-btn[data-qnum="${qNum}"][data-sub="${sub}"][data-val="${val}"]`)
          if (b) {
            const row = b.closest('.tf-statement-row')
            if (row) {
              row.style.background = val ? '#f0fdf4' : '#fef2f2'
              row.style.borderColor = val ? '#86efac' : '#fca5a5'
            }
            b.style.background = val ? '#16a34a' : '#dc2626'
            b.style.color = '#ffffff'
            b.style.borderColor = val ? '#16a34a' : '#dc2626'
          }
        })
        const tfCount = ['a', 'b', 'c', 'd'].filter(k => studentAnswers.tf[qNum][k] !== undefined).length
        updatePaletteButton(qNum, tfCount === 4, tfCount > 0 && tfCount < 4)
      } else if (ans.givenAnswer?.type === 'SHORT_ANSWER' && ans.givenAnswer.value) {
        studentAnswers.sa[qNum] = ans.givenAnswer.value
        const inp = document.querySelector(`.student-interactive-sa-input[data-qnum="${qNum}"]`)
        if (inp) inp.value = ans.givenAnswer.value
        updatePaletteButton(qNum, true)
      } else if (ans.givenAnswer?.type === 'ESSAY' && ans.givenAnswer.value) {
        studentAnswers.essay[qNum] = ans.givenAnswer.value
        const inp = document.querySelector(`.student-interactive-essay-input[data-qnum="${qNum}"]`)
        if (inp) inp.value = ans.givenAnswer.value
        updatePaletteButton(qNum, true)
      }
    })
    updateExamProgress(questions.length)
  }

  const startExamFlow = async () => {
    // Initial display of timer & violations before starting
    updateTimerDisplay()
    updateViolationsDisplay()

    const isExamActive = localStorage.getItem(getActiveKey(hw.id)) === 'true' ||
                         sessionStorage.getItem(getActiveKey(hw.id)) === 'true' ||
                         sessionStorage.getItem(`exam_active_${hw.id}`) === 'true'

    // If active session token exists and was already confirmed active (e.g. reload F5 during exam), resume directly
    if (isExamActive && examSessionToken) {
      try {
        const res = await api.initExamSession(hw.id, examSessionToken)
        if (res && res.success !== false) {
          examSessionId = res.sessionId || null
          configureDeadline(res)
          restoreDraftAnswersFromServer(res.draftAnswers || [])
          if (typeof res.currentViolations === 'number') {
            currentViolationsCount = res.currentViolations
            updateViolationsDisplay()
          }
          examStarted = true
          loadSignals()
          if (localStorage.getItem(submitAttemptKey) === examSessionToken) {
            submittedOrUncertain = true
            examLocked = true
            disableAllInputs()
            openModal('CHƯA XÁC NHẬN KẾT QUẢ NỘP BÀI',
              '<p>Thiết bị này đã gửi yêu cầu nộp bài nhưng chưa nhận xác nhận. Hãy kiểm tra kết quả trong lớp học hoặc liên hệ giáo viên; không gửi lại bài.</p>',
              () => { window.location.hash = '#my-classes'; return true },
              { confirmLabel: 'Kiểm tra trong lớp học', showCancel: false })
            return
          }
          const unresolved = loadPendingLog()
          if (unresolved) await recordViolation(unresolved.action, unresolved)
          if (examLocked) return
          if (remainingSeconds() <= 0) {
            performSubmit(true)
            return
          }
          startTimer()
          startHeartbeat()
          startAutosave()
          recordSignal('EXAM_RESUMED')
          showToast('Đã tự động tiếp tục phiên thi của bạn! Đồng hồ đang tính giờ.', 'success')
          return
        }
      } catch (e) {
        console.warn('Cannot resume existing token, presenting rules modal:', e)
        if (String(e?.message || '').includes('EXAM_EXPIRED')) {
          disableAllInputs()
          openModal('PHIÊN THI ĐÃ HẾT GIỜ', '<p>Máy chủ báo thời lượng phiên thi đã hết. Hãy kiểm tra kết quả trong lớp học hoặc liên hệ giáo viên.</p>',
            () => { window.location.hash = '#my-classes'; return true }, { confirmLabel: 'Kiểm tra trong lớp học', showCancel: false })
          return
        }
      }
    }

    // Otherwise (fresh entry from my-classes or unconfirmed session), always show Official Exam Rules Modal
    const maxVio = hw.maxViolations || hw.max_violations || 3
    const examRulesBody = `
      <div style="display:flex; flex-direction:column; gap:16px;">
        <div style="display:flex; align-items:center; gap:12px; background:#fef2f2; border:1px solid #fee2e2; padding:14px 16px; border-radius:12px; color:#991b1b;">
          <i class="fa-solid fa-shield-cat" style="font-size:32px; color:#ef4444; flex-shrink:0;"></i>
          <div style="font-size:13px; line-height:1.5;">
            Đây là <strong>Bài thi chính thức</strong> được giám sát bằng hệ thống chống gian lận tự động. Vui lòng đọc kỹ các quy chế dưới đây trước khi bắt đầu:
          </div>
        </div>

        <div style="display:flex; flex-direction:column; gap:12px; font-size:13px; color:#334155; background:#f8fafc; padding:16px; border-radius:12px; border:1px solid #e2e8f0;">
          <div style="display:flex; align-items:flex-start; gap:10px;">
            <i class="fa-solid fa-triangle-exclamation" style="color:#ef4444; margin-top:2px; font-size:16px; flex-shrink:0;"></i>
            <div><strong>Cấm chuyển tab / rời màn hình thi:</strong> Không chuyển thẻ, không mở ứng dụng ngoài, không thu nhỏ trình duyệt. Vi phạm quá <strong>${maxVio} lần</strong> hệ thống sẽ <strong>tự động thu bài & đình chỉ thi</strong>.</div>
          </div>
          
          <div style="display:flex; align-items:flex-start; gap:10px;">
            <i class="fa-solid fa-ban" style="color:#ef4444; margin-top:2px; font-size:16px; flex-shrink:0;"></i>
            <div><strong>Cấm Sao chép & Dán (Copy/Paste):</strong> Thao tác copy, chuột phải và phím tắt đều bị khóa và ghi vào nhật ký vi phạm.</div>
          </div>

          <div style="display:flex; align-items:flex-start; gap:10px;">
            <i class="fa-solid fa-desktop" style="color:#d97706; margin-top:2px; font-size:16px; flex-shrink:0;"></i>
            <div><strong>Thiết bị thi duy nhất (Single Session):</strong> Tuyệt đối không mở bài thi trên 2 máy hoặc 2 tab đồng thời.</div>
          </div>

          <div style="display:flex; align-items:flex-start; gap:10px;">
            <i class="fa-solid fa-stopwatch" style="color:#0284c7; margin-top:2px; font-size:16px; flex-shrink:0;"></i>
            <div><strong>Thời gian thi:</strong> Đếm ngược <strong>${hw.durationMinutes || 45} phút</strong>. Đồng hồ sẽ <strong>bắt đầu đếm ngược ngay khi bấm Bắt đầu</strong>. Hết giờ hệ thống tự động khóa và thu bài.</div>
          </div>

          <div style="display:flex; align-items:flex-start; gap:10px;">
            <i class="fa-solid fa-lock" style="color:#7c3aed; margin-top:2px; font-size:16px; flex-shrink:0;"></i>
            <div><strong>Số lượt làm bài:</strong> Mỗi học sinh chỉ có <strong>01 lần nộp bài duy nhất</strong>.</div>
          </div>
        </div>

        <div style="font-size:12px; color:#64748b; text-align:center; font-weight:600;">
          Nhấn nút <strong style="color:#059669;">"Bắt đầu làm bài"</strong> để đồng ý tuân thủ quy chế phòng thi và kích hoạt tính giờ.
        </div>
      </div>
    `

    openModal(
      'QUY CHẾ PHÒNG THI CHÍNH THỨC',
      examRulesBody,
      async () => {
        try {
          const token = examSessionToken || (crypto.randomUUID ? crypto.randomUUID() : Math.random().toString(36).substring(2))
          const res = await api.initExamSession(hw.id, token)
          if (!res || res.success === false || !res.sessionId) throw new Error('Chưa xác nhận được phiên thi')
          examSessionId = res.sessionId
          examSessionToken = token
          localStorage.setItem(getSessionTokenKey(hw.id), token)
          localStorage.setItem(getActiveKey(hw.id), 'true')
          sessionStorage.setItem(getSessionTokenKey(hw.id), token)
          sessionStorage.setItem(getActiveKey(hw.id), 'true')
          sessionStorage.setItem(`exam_session_token_${hw.id}`, token)
          sessionStorage.setItem(`exam_active_${hw.id}`, 'true')
           configureDeadline(res)
           restoreDraftAnswersFromServer(res.draftAnswers || [])
          if (typeof res?.currentViolations === 'number') {
            currentViolationsCount = res.currentViolations
            updateViolationsDisplay()
          }
        } catch (e) {
          showToast(e.message || 'Không thể bắt đầu phiên thi', 'error')
          return false
        }

         examStarted = true
         loadSignals()
         const unresolved = loadPendingLog()
         if (unresolved) await recordViolation(unresolved.action, unresolved)
         if (examLocked) return true
         if (remainingSeconds() <= 0) { performSubmit(true); return true }
        startTimer()
        startHeartbeat()
         startAutosave()
         recordSignal('EXAM_STARTED')
        showToast('Bài thi đã bắt đầu! Thời gian đang đếm ngược.', 'info')
        return true
      }
    )

    // Customize Modal buttons & prevent backdrop click bypass
    const confirmBtn = document.getElementById('modal-confirm-btn')
    const cancelBtn = document.getElementById('modal-cancel-btn')
    const closeBtn = document.getElementById('modal-close-btn')
    const backdrop = document.getElementById('active-modal-backdrop')

    if (confirmBtn) {
      confirmBtn.innerHTML = '<i class="fa-solid fa-play"></i> Bắt đầu làm bài'
      confirmBtn.style.background = '#059669'
    }
    if (cancelBtn) {
      cancelBtn.innerHTML = '<i class="fa-solid fa-arrow-left"></i> Quay lại'
    }
    const handleExitModal = () => {
      clearSessionStorageData(hw.id)
      cleanupExamEngine()
      window.location.hash = '#my-classes'
    }
    cancelBtn?.addEventListener('click', handleExitModal, { once: true })
    closeBtn?.addEventListener('click', handleExitModal, { once: true })
    if (backdrop) {
      backdrop.onclick = (e) => {
        if (e.target === backdrop) {
          e.stopPropagation()
          showToast('Vui lòng chọn "Bắt đầu làm bài" hoặc "Quay lại"', 'warning')
        }
      }
    }
  }

  startExamFlow()
}
