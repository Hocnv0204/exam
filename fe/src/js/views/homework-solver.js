import { renderSidebar, bindSidebarEvents } from '../components/sidebar.js'
import { renderNavbar } from '../components/navbar.js'
import { showToast } from '../components/toast.js'
import { state } from '../state.js'
import { api } from '../api.js'
import { openModal, closeModal } from '../components/modal.js'
import { renderPdfViewer } from '../components/pdf-viewer.js'
import { renderMath } from '../utils/exam-parser.js'

// Student's current answers state
let studentAnswers = {
  mc: {}, // { 1: 'A', 2: 'B', ... }
  tf: {}, // { 1: { a: true, b: false, c: true, d: false }, ... }
  sa: {}  // { 1: '9.8', ... }
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

function isInteractiveHomework(hw, questions) {
  if (hw?.pdfPath === 'INTERACTIVE' || hw?.pdf_path === 'INTERACTIVE') return true

  const hasPdf = !!(hw && (hw.pdfUrl || (hw.pdfPath && hw.pdfPath !== 'INTERACTIVE' && hw.pdfPath !== 'Homework_Attachment.pdf' && hw.pdfPath.endsWith('.pdf'))))
  if (!hasPdf) return true

  return questions.some(q => {
    try {
      const p = parsePromptPayload(q.prompt, q.content)
      if (p && p.isInteractive) return true
      if (p && ((p.statements && p.statements.length > 0) || (p.options && p.options.length > 0 && p.options.some(o => o.text)))) {
        return true
      }
    } catch (_) {}
    return false
  })
}

function renderInteractiveSolverQuestionCards(parsedQuestions) {
  let currentSection = ''

  return parsedQuestions.map(q => {
    const qNum = q.questionNumber
    let sectionHeader = ''

    let newSection = ''
    if (q.questionType === 'MULTIPLE_CHOICE') newSection = 'PHẦN I: TRẮC NGHIỆM NHIỀU LỰA CHỌN (A, B, C, D)'
    else if (q.questionType === 'TRUE_FALSE') newSection = 'PHẦN II: TRẮC NGHIỆM ĐÚNG / SAI (4 Ý a, b, c, d)'
    else if (q.questionType === 'SHORT_ANSWER') newSection = 'PHẦN III: TRẢ LỜI NGẮN (ĐIỀN KẾT QUẢ SỐ)'

    if (newSection !== currentSection) {
      currentSection = newSection
      sectionHeader = `
        <div style="background:linear-gradient(135deg, #f8fafc, #f1f5f9); border:1px solid #e2e8f0; border-radius:10px; padding:10px 16px; margin:${qNum === 1 ? '0' : '28px'} 0 14px 0; font-weight:700; font-size:14px; color:#0f172a; display:flex; align-items:center; gap:8px;">
          <i class="fa-solid fa-bookmark" style="color:#0284c7;"></i> ${currentSection}
        </div>
      `
    }

    const isFlagged = flaggedQuestions.has(qNum)

    // True/False statements fallback guaranteeing 4 statements: a, b, c, d
    const tfStatements = (q.options && q.options.length > 0) ? q.options : [
      { id: 'a', text: '' },
      { id: 'b', text: '' },
      { id: 'c', text: '' },
      { id: 'd', text: '' }
    ]

    return `
      ${sectionHeader}
      <div class="interactive-q-card ${isFlagged ? 'flagged' : ''}" id="exam-q-card-${qNum}" data-qnum="${qNum}">
        <div class="interactive-q-header">
          <div style="display:flex; align-items:center; gap:8px;">
            <span style="font-weight:700; font-size:15px; color:#0f172a;">Câu ${qNum}:</span>
            <span class="badge" style="background:#f1f5f9; color:#475569; font-size:12px; font-weight:600;">
              (${q.points || (q.questionType === 'TRUE_FALSE' ? 1.0 : (q.questionType === 'SHORT_ANSWER' ? 0.5 : 0.25))} điểm)
            </span>
          </div>
          <button type="button" class="btn-flag-question ${isFlagged ? 'active' : ''}" data-qnum="${qNum}" style="background:transparent; border:none; color:${isFlagged ? '#f59e0b' : '#94a3b8'}; cursor:pointer; font-size:12.5px; font-weight:600; display:inline-flex; align-items:center; gap:5px; transition:all 0.15s ease;" title="Đánh dấu để xem lại sau">
            <i class="fa-solid fa-bookmark"></i> ${isFlagged ? 'Đã đánh dấu' : 'Đánh dấu'}
          </button>
        </div>

        <!-- Prompt Text with Math -->
        <div class="interactive-q-prompt">${escapeHtml(q.promptText || '')}</div>

        <!-- Attached Image (if any) -->
        ${q.imageUrl ? `
          <div style="margin:10px 0 16px 0;">
            <img src="${q.imageUrl}" alt="Hình câu ${qNum}" class="interactive-q-image">
          </div>
        ` : ''}

        <!-- Answering Controls -->
        ${q.questionType === 'MULTIPLE_CHOICE' ? `
          <div class="exam-options-grid grid-2col">
            ${(q.options || []).map(opt => {
              const isSelected = studentAnswers.mc[qNum] === opt.id
              return `
                <div class="exam-option-card ${isSelected ? 'selected' : ''}" data-qnum="${qNum}" data-optid="${opt.id}">
                  <div class="exam-opt-badge">${opt.id}</div>
                  <div style="flex:1 1 auto;">${escapeHtml(opt.text || '')}</div>
                </div>
              `
            }).join('')}
          </div>
        ` : (q.questionType === 'TRUE_FALSE' ? `
          <div class="tf-statements-container" style="display:flex; flex-direction:column; gap:8px; margin-top:12px;">
            ${tfStatements.map(sub => {
              const subKey = String(sub.id || '').toLowerCase()
              const val = studentAnswers.tf[qNum]?.[subKey] !== undefined 
                ? studentAnswers.tf[qNum][subKey] 
                : studentAnswers.tf[qNum]?.[sub.id]
              const displayText = sub.text ? escapeHtml(sub.text) : `<span style="color:#64748b; font-style:italic;">Ý ${subKey.toUpperCase()}</span>`
              const isTrue = val === true || val === 'true'
              const isFalse = val === false || val === 'false'
              const isSelected = isTrue || isFalse

              return `
                <div class="tf-statement-row" style="display:flex; justify-content:space-between; align-items:center; padding:10px 14px; border:1.5px solid ${isSelected ? (isTrue ? '#86efac' : '#fca5a5') : '#e2e8f0'}; border-radius:10px; background:${isSelected ? (isTrue ? '#f0fdf4' : '#fef2f2') : '#ffffff'}; gap:12px; transition:all 0.15s ease;">
                  <div class="tf-statement-text" style="font-size:14px; color:#1e293b; line-height:1.5; flex:1;">
                    <strong style="color:#0284c7; margin-right:4px;">${subKey})</strong> ${displayText}
                  </div>
                  <div class="tf-toggle-btns" style="display:flex; gap:6px; flex-shrink:0;">
                    <button type="button" class="tf-toggle-btn true ${isTrue ? 'active' : ''}" data-qnum="${qNum}" data-sub="${subKey}" data-val="true" style="padding:6px 14px; font-size:12.5px; font-weight:700; border-radius:7px; cursor:pointer; transition:all 0.15s ease; display:inline-flex; align-items:center; gap:4px; border:1px solid ${isTrue ? '#16a34a' : '#cbd5e1'}; background:${isTrue ? '#16a34a' : '#ffffff'}; color:${isTrue ? '#ffffff' : '#475569'}; box-shadow:${isTrue ? '0 2px 4px rgba(22,163,74,0.2)' : 'none'};">
                      <i class="fa-solid fa-check"></i> Đúng
                    </button>
                    <button type="button" class="tf-toggle-btn false ${isFalse ? 'active' : ''}" data-qnum="${qNum}" data-sub="${subKey}" data-val="false" style="padding:6px 14px; font-size:12.5px; font-weight:700; border-radius:7px; cursor:pointer; transition:all 0.15s ease; display:inline-flex; align-items:center; gap:4px; border:1px solid ${isFalse ? '#dc2626' : '#cbd5e1'}; background:${isFalse ? '#dc2626' : '#ffffff'}; color:${isFalse ? '#ffffff' : '#475569'}; box-shadow:${isFalse ? '0 2px 4px rgba(220,38,38,0.2)' : 'none'};">
                      <i class="fa-solid fa-xmark"></i> Sai
                    </button>
                  </div>
                </div>
              `
            }).join('')}
          </div>
        ` : `
          <div style="background:#f8fafc; border:1px solid #e2e8f0; border-radius:8px; padding:12px 14px;">
            <label style="display:block; font-size:12px; font-weight:600; color:#475569; margin-bottom:6px;">
              <i class="fa-solid fa-pen"></i> Nhập kết quả của bạn:
            </label>
            <input type="text" class="form-input student-interactive-sa-input" data-qnum="${qNum}" value="${studentAnswers.sa[qNum] || ''}" placeholder="Điền đáp án số (ví dụ: 2.67 hoặc -5)..." style="font-size:14px; padding:8px 12px; background:#ffffff; font-weight:600; color:#0f172a; max-width:320px;">
          </div>
        `)}
      </div>
    `
  }).join('')
}

function renderInteractiveSolverView(hw, parsedQuestions, isTrial, isExpired, deadline) {
  const totalQuestions = parsedQuestions.length
  let answeredCount = 0

  parsedQuestions.forEach(q => {
    const qNum = q.questionNumber
    if (q.questionType === 'MULTIPLE_CHOICE' && studentAnswers.mc[qNum]) answeredCount++
    else if (q.questionType === 'TRUE_FALSE') {
      const tf = studentAnswers.tf[qNum] || {}
      if (['a', 'b', 'c', 'd'].every(k => tf[k] !== undefined)) answeredCount++
    } else if (q.questionType === 'SHORT_ANSWER' && studentAnswers.sa[qNum] && String(studentAnswers.sa[qNum]).trim() !== '') {
      answeredCount++
    }
  })

  const progressPercent = totalQuestions > 0 ? Math.round((answeredCount / totalQuestions) * 100) : 0

  const hasAttachedPdf = !!(hw && (hw.pdfUrl || (hw.pdfPath && hw.pdfPath !== 'INTERACTIVE' && hw.pdfPath !== 'Homework_Attachment.pdf' && hw.pdfPath.endsWith('.pdf'))))
  const pdfDownloadUrl = (hw?.pdfUrl || '').replace(/https?:\/\/kong:8000/, import.meta.env.VITE_SUPABASE_URL || 'http://localhost:54321')
  const pdfDownloadName = (hw?.pdfPath && hw.pdfPath !== 'INTERACTIVE' && !hw.pdfPath.startsWith('http')) ? hw.pdfPath : `${hw.title || 'De_Bai'}.pdf`

  return `
    <div class="app-layout">
      ${renderSidebar('homework-attempt')}
      <div class="main-content">
        ${renderNavbar('Nền tảng / Bảng điều khiển')}
        <div class="content-body" style="padding:16px 24px;">
          ${isExpired ? `
            <div style="background:#fef3c7; border:1px solid #fde68a; color:#92400e; padding:12px 16px; border-radius:10px; margin-bottom:16px; font-size:13px; display:flex; align-items:center; gap:10px; font-weight:600;">
              <i class="fa-solid fa-clock-rotate-left" style="font-size:18px; color:#d97706;"></i>
              <div>
                Bài tập này đã quá hạn nộp bài (${deadline ? new Date(deadline).toLocaleString('vi-VN') : ''}). Bài làm của bạn vẫn có thể nộp và sẽ được ghi nhận là <strong style="color:#b45309;">Nộp muộn</strong>.
              </div>
            </div>
          ` : ''}

          <!-- Header Toolbar -->
          <div style="display:flex; justify-content:space-between; align-items:center; background:#ffffff; padding:12px 20px; border-radius:12px; border:1px solid #e2e8f0; margin-bottom:16px; box-shadow:0 2px 8px rgba(0,0,0,0.03); flex-wrap:wrap; gap:10px;">
            <div style="display:flex; align-items:center; gap:12px; min-width:0; flex:1 1 auto;">
              <button type="button" class="btn-secondary" onclick="window.location.hash='${isTrial ? '#trial' : '#my-classes'}'" style="padding:6px 12px; font-size:12.5px; font-weight:600; border-radius:7px; display:inline-flex; align-items:center; gap:5px; cursor:pointer; flex-shrink:0;">
                <i class="fa-solid fa-arrow-left"></i> ${isTrial ? 'Học thử' : 'Quay lại'}
              </button>
              <div style="min-width:0; overflow:hidden;">
                <div style="display:flex; align-items:center; gap:8px; margin-bottom:2px;">
                  <span class="badge" style="background:#0284c715; color:#0284c7; font-weight:700; font-size:11px;">ĐỀ THI TƯƠNG TÁC TRỰC TUYẾN</span>
                  ${isTrial ? '<span class="badge" style="background:#fef3c7; color:#b45309; font-weight:700; font-size:11px;"><i class="fa-solid fa-sparkles"></i> HỌC THỬ</span>' : ''}
                  <span id="autosave-status" style="font-size:11px; color:#065f46; background:#ecfdf5; border:1px solid #a7f3d0; padding:2px 8px; border-radius:12px; font-weight:600; display:inline-flex; align-items:center; gap:4px;">
                    <i class="fa-solid fa-cloud-arrow-up" style="color:#10b981;"></i> Tự động lưu nháp
                  </span>
                </div>
                <h2 style="font-family:var(--font-heading); font-size:17px; font-weight:700; color:#0f172a; margin:0; overflow:hidden; text-overflow:ellipsis; white-space:nowrap;">
                  ${hw.title}
                </h2>
              </div>
            </div>

            <!-- Timer & Actions -->
            <div style="display:flex; align-items:center; gap:10px; flex-shrink:0;">
              ${hasAttachedPdf && pdfDownloadUrl ? `
                <button type="button" id="btn-download-solver-pdf" class="btn-secondary" style="padding:7px 14px; font-size:13px; font-weight:600; background:#eff6ff; color:#0066cc; border:1px solid #bfdbfe; border-radius:8px; display:inline-flex; align-items:center; gap:6px; cursor:pointer; transition:all 0.15s ease;" title="Tải file PDF đề bài (${escapeHtml(pdfDownloadName)}) về máy">
                  <i class="fa-solid fa-file-arrow-down" style="font-size:14px; color:#0066cc;"></i> Tải file PDF
                </button>
              ` : ''}
              <div class="timer-box" style="padding:8px 16px; font-size:16px; font-weight:700; border-radius:8px; background:#eff6ff; color:#0066cc; border:1px solid #bfdbfe; display:inline-flex; align-items:center; gap:6px;">
                <i class="fa-regular fa-clock"></i> <span id="exam-timer-display">${hw.durationMinutes || 45}:00</span>
              </div>
            </div>
          </div>

          <!-- Split Layout: Questions List (70%) vs Sticky Palette (30%) -->
          <div class="split-homework-layout" style="display:grid; grid-template-columns:1fr 340px; gap:20px; align-items:start;">
            
            <!-- LEFT MAIN COLUMN: Scrollable Questions -->
            <div id="interactive-solver-container" style="height:calc(100vh - 160px); overflow-y:auto; padding-right:8px;">
              ${renderInteractiveSolverQuestionCards(parsedQuestions)}
            </div>

            <!-- RIGHT COLUMN: Sticky Exam Navigation Palette & Submit Button -->
            <div class="interactive-exam-sidebar" style="position:sticky; top:16px; background:#ffffff; border:1px solid #e2e8f0; border-radius:12px; padding:18px; box-shadow:0 4px 14px rgba(0,0,0,0.04); display:flex; flex-direction:column; gap:16px; max-height:calc(100vh - 160px); overflow-y:auto;">
              
              <!-- Progress Indicator -->
              <div>
                <div style="display:flex; justify-content:space-between; font-size:12.5px; font-weight:600; color:#475569; margin-bottom:6px;">
                  <span>Tiến độ hoàn thành:</span>
                  <span id="exam-progress-text" style="color:#0066cc; font-weight:700;">${answeredCount}/${totalQuestions} câu (${progressPercent}%)</span>
                </div>
                <div style="height:8px; background:#f1f5f9; border-radius:6px; overflow:hidden;">
                  <div id="exam-progress-bar" style="height:100%; width:${progressPercent}%; background:linear-gradient(90deg, #0284c7, #10b981); border-radius:6px; transition:width 0.25s ease;"></div>
                </div>
              </div>

              <!-- Question Palette Grid -->
              <div>
                <div style="font-weight:700; font-size:13px; color:#1e293b; margin-bottom:10px; display:flex; align-items:center; justify-content:space-between;">
                  <span>BẢNG ĐIỀU HƯỚNG CÂU HỎI</span>
                  <span style="font-size:11px; color:#64748b; font-weight:normal;">Bấm số để cuộn tới</span>
                </div>

                <div class="exam-nav-grid" id="exam-nav-palette" style="display:grid; grid-template-columns:repeat(5, 1fr); gap:6px;">
                  ${parsedQuestions.map(q => {
                    const qNum = q.questionNumber
                    const isFlagged = flaggedQuestions.has(qNum)
                    let isAnswered = false
                    let isPartial = false
                    if (q.questionType === 'MULTIPLE_CHOICE') {
                      isAnswered = !!studentAnswers.mc[qNum]
                    } else if (q.questionType === 'TRUE_FALSE') {
                      const tf = studentAnswers.tf[qNum] || {}
                      const answeredCount = ['a', 'b', 'c', 'd'].filter(k => tf[k] !== undefined).length
                      isAnswered = answeredCount === 4
                      isPartial = answeredCount > 0 && answeredCount < 4
                    } else if (q.questionType === 'SHORT_ANSWER') {
                      isAnswered = studentAnswers.sa[qNum] !== undefined && String(studentAnswers.sa[qNum]).trim() !== ''
                    }

                    return `
                      <button type="button" class="exam-nav-btn ${isAnswered ? 'answered' : (isPartial ? 'partial' : '')} ${isFlagged ? 'flagged' : ''}" data-qnum="${qNum}" id="nav-btn-q-${qNum}">
                        ${qNum}
                      </button>
                    `
                  }).join('')}
                </div>

                <!-- Legend -->
                <div style="display:flex; justify-content:space-between; align-items:center; margin-top:12px; padding-top:10px; border-top:1px solid #f1f5f9; font-size:11px; color:#64748b; flex-wrap:wrap; gap:6px;">
                  <span style="display:inline-flex; align-items:center; gap:4px;">
                    <span style="width:10px; height:10px; border-radius:3px; background:#0066cc; display:inline-block;"></span> Đã xong
                  </span>
                  <span style="display:inline-flex; align-items:center; gap:4px;">
                    <span style="width:10px; height:10px; border-radius:3px; background:#e0f2fe; border:1px solid #0284c7; display:inline-block;"></span> Đang làm
                  </span>
                  <span style="display:inline-flex; align-items:center; gap:4px;">
                    <span style="width:10px; height:10px; border-radius:3px; border:1px solid #cbd5e1; background:#ffffff; display:inline-block;"></span> Chưa làm
                  </span>
                  <span style="display:inline-flex; align-items:center; gap:4px;">
                    <span style="width:10px; height:10px; border-radius:50%; background:#f59e0b; display:inline-block;"></span> Đánh dấu
                  </span>
                </div>
              </div>

              <!-- Big Submit Button -->
              <div style="padding-top:10px; border-top:1px solid #f1f5f9; margin-top:auto;">
                <button type="button" class="btn-primary" id="submit-answers-btn" style="width:100%; padding:13px 20px; font-size:15px; font-weight:700; cursor:pointer; background:linear-gradient(135deg, #0284c7, #0066cc); box-shadow:0 4px 14px rgba(2,132,199,0.3); border-radius:9px; display:inline-flex; align-items:center; justify-content:center; gap:8px;">
                  <i class="fa-solid fa-paper-plane"></i> Nộp bài làm ngay
                </button>
              </div>

            </div>

          </div>
        </div>
      </div>
    </div>
  `
}

function getDraftStorageKey(hwId) {
  const userId = state.user?.id || 'guest'
  return `homework_draft_${userId}_${hwId}`
}

function loadDraftFromStorage(hwId) {
  try {
    const raw = localStorage.getItem(getDraftStorageKey(hwId))
    if (!raw) return null
    return JSON.parse(raw)
  } catch (e) {
    console.warn('[Draft] Failed to load draft:', e)
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
    updateAutosaveIndicator(true)
  } catch (e) {
    console.warn('[Draft] Failed to save draft:', e)
  }
}

function clearDraftStorage(hwId) {
  try {
    localStorage.removeItem(getDraftStorageKey(hwId))
  } catch (e) {}
}

function updateAutosaveIndicator(saved = true) {
  const el = document.getElementById('autosave-status')
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



export function renderHomeworkSolverView() {
  const isTrial = window.location.hash.includes('trial=true') || !state.token
  const hw = state.currentHomework?.homework || state.currentHomework
  const questions = state.currentHomework?.questions || []

  if (!hw || !hw.id) {
    return `
      <div class="app-layout">
        ${renderSidebar('homework-attempt')}
        <div class="main-content">
          ${renderNavbar('Nền tảng / Bảng điều khiển')}
          <div class="content-body" style="padding:40px; text-align:center; color:#64748b;">
            <i class="fa-solid fa-triangle-exclamation" style="font-size:48px; color:#ef4444; margin-bottom:16px;"></i>
            <h2 style="font-weight:700; color:#0f172a; margin-bottom:8px;">Không tìm thấy bài tập</h2>
            <p>Vui lòng quay lại ${isTrial ? 'danh sách bài học thử' : 'danh sách lớp học'} và chọn một bài tập hợp lệ.</p>
            <button class="btn-primary" onclick="window.location.hash = '${isTrial ? '#trial' : '#my-classes'}'" style="padding:10px 24px; font-size:14px; cursor:pointer; margin-top:16px;">
              <i class="fa-solid fa-arrow-left"></i> ${isTrial ? 'Quay lại trang học thử' : 'Quay lại danh sách lớp học'}
            </button>
          </div>
        </div>
      </div>
    `
  }

  const attemptsCount = state.currentHomework?.attemptsCount || 0
  const maxAttempts = hw.maxAttempts || hw.max_attempts || 0
  const deadline = hw.deadline || hw.deadline_at || null

  const isExpired = deadline ? new Date() > new Date(deadline) : false
  const isExceeded = !isTrial && (maxAttempts > 0 && attemptsCount >= maxAttempts)

  if (isExceeded) {
    const warningTitle = "Đạt giới hạn số lần làm bài"
    const warningMsg = `Bài tập này chỉ cho phép làm tối đa <strong>${maxAttempts}</strong> lần. Bạn đã thực hiện <strong>${attemptsCount}</strong> lần.`

    return `
      <div class="app-layout">
        ${renderSidebar('homework-attempt')}
        <div class="main-content">
          ${renderNavbar('Nền tảng / Bảng điều khiển')}
          <div class="content-body" style="padding:40px; text-align:center; color:#64748b;">
            <div style="background:#ffffff; max-width:500px; margin: 40px auto; padding: 40px; border-radius: 16px; box-shadow: 0 4px 20px rgba(0,0,0,0.05); border: 1px solid #cbd5e1;">
              <i class="fa-solid fa-lock" style="font-size:56px; color:#ef4444; margin-bottom:20px;"></i>
              <h2 style="font-weight:700; color:#0f172a; margin-bottom:12px; font-family:var(--font-heading);">${warningTitle}</h2>
              <p style="font-size:14px; color:#475569; line-height:1.6; margin-bottom:24px;">${warningMsg}</p>
              <button class="btn-primary" onclick="window.location.hash = '${isTrial ? '#trial' : '#my-classes'}'" style="padding:10px 24px; font-size:14px; cursor:pointer;">
                <i class="fa-solid fa-arrow-left"></i> ${isTrial ? 'Quay lại trang học thử' : 'Quay lại danh sách lớp học'}
              </button>
            </div>
          </div>
        </div>
      </div>
    `
  }

  // Check if there is an existing saved draft
  const savedDraft = loadDraftFromStorage(hw.id)
  isDraftRestored = !!(savedDraft && savedDraft.answers && (
    Object.keys(savedDraft.answers.mc || {}).length > 0 ||
    Object.keys(savedDraft.answers.tf || {}).length > 0 ||
    Object.keys(savedDraft.answers.sa || {}).length > 0
  ))

  studentAnswers = {
    mc: savedDraft?.answers?.mc || {},
    tf: savedDraft?.answers?.tf || {},
    sa: savedDraft?.answers?.sa || {}
  }

  // Separate questions by type
  const mcQuestions = questions.filter(q => {
    const rawType = (q.question_type || q.questionType || '').toUpperCase()
    return rawType === 'MULTIPLE_CHOICE' || rawType === 'MC'
  })
  const tfQuestions = questions.filter(q => {
    const rawType = (q.question_type || q.questionType || '').toUpperCase()
    return rawType === 'TRUE_FALSE' || rawType === 'TF'
  })
  const saQuestions = questions.filter(q => {
    const rawType = (q.question_type || q.questionType || '').toUpperCase()
    return rawType === 'SHORT_ANSWER' || rawType === 'SA'
  })

  // Populate defaults for any question not in draft
  questions.forEach(q => {
    const qNum = q.question_number || q.questionNumber
    const pObj = parsePromptPayload(q.prompt, q.content)
    const rawType = (q.question_type || q.questionType || '').toUpperCase()
    const isTf = rawType === 'TRUE_FALSE' || rawType === 'TF' || (pObj.statements && pObj.statements.length > 0)
    const isSa = rawType === 'SHORT_ANSWER' || rawType === 'SA'

    if (isTf && studentAnswers.tf[qNum] === undefined) {
      studentAnswers.tf[qNum] = {}
    } else if (isSa && studentAnswers.sa[qNum] === undefined) {
      studentAnswers.sa[qNum] = ''
    } else if (!isTf && !isSa && studentAnswers.mc[qNum] === undefined) {
      studentAnswers.mc[qNum] = null
    }
  })

  const isInteractive = isInteractiveHomework(hw, questions)

  if (isInteractive) {
    const parsedQuestionList = questions.map(q => {
      const pObj = parsePromptPayload(q.prompt, q.content)
      const qNum = q.question_number || q.questionNumber
      const rawType = (q.question_type || q.questionType || '').toUpperCase()
      const isTf = rawType === 'TRUE_FALSE' || rawType === 'TF' || (pObj.statements && pObj.statements.length > 0)
      const isSa = rawType === 'SHORT_ANSWER' || rawType === 'SA'
      const questionType = isTf ? 'TRUE_FALSE' : (isSa ? 'SHORT_ANSWER' : 'MULTIPLE_CHOICE')

      let promptText = pObj.text || q.content || (typeof q.prompt === 'string' && !q.prompt.trim().startsWith('{') ? q.prompt : '') || `Câu hỏi số ${qNum}`
      let options = []

      if (isTf) {
        let rawStatements = []
        if (Array.isArray(q.statements) && q.statements.length > 0) {
          rawStatements = q.statements
        } else if (Array.isArray(pObj.statements) && pObj.statements.length > 0) {
          rawStatements = pObj.statements
        } else if (Array.isArray(q.options) && q.options.length > 0) {
          rawStatements = q.options
        } else if (Array.isArray(pObj.options) && pObj.options.length > 0) {
          rawStatements = pObj.options
        } else if (typeof q.statements === 'object' && q.statements !== null) {
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
      } else if (!isSa) {
        let rawOptions = pObj.options.length > 0 ? pObj.options : (q.options || [])
        if (Array.isArray(rawOptions) && rawOptions.length > 0) {
          options = rawOptions.map((opt, idx) => {
            if (typeof opt === 'string') {
              return { id: ['A', 'B', 'C', 'D'][idx] || String(idx + 1), text: opt }
            }
            return {
              id: (opt.id || opt.key || ['A', 'B', 'C', 'D'][idx] || '').toUpperCase(),
              text: opt.text || opt.content || ''
            }
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
        points: q.points || (questionType === 'TRUE_FALSE' ? 1.0 : (questionType === 'SHORT_ANSWER' ? 0.5 : 0.25)),
        promptText,
        imageUrl: pObj.imageUrl || '',
        options,
        explanation: pObj.explanation || q.explanation || ''
      }
    })
    return renderInteractiveSolverView(hw, parsedQuestionList, isTrial, isExpired, deadline)
  }
  return `
    <div class="app-layout">
      ${renderSidebar('homework-attempt')}
      <div class="main-content">
        ${renderNavbar('Nền tảng / Bảng điều khiển')}
        <div class="content-body" style="padding:16px 24px;">
          ${isExpired ? `
            <div style="background:#fef3c7; border:1px solid #fde68a; color:#92400e; padding:12px 16px; border-radius:10px; margin-bottom:16px; font-size:13px; display:flex; align-items:center; gap:10px; font-weight:600;">
              <i class="fa-solid fa-clock-rotate-left" style="font-size:18px; color:#d97706;"></i>
              <div>
                Bài tập này đã quá hạn nộp bài (${deadline ? new Date(deadline).toLocaleString('vi-VN') : ''}). Bài làm của bạn vẫn có thể nộp và sẽ được ghi nhận là <strong style="color:#b45309;">Nộp muộn</strong>.
              </div>
            </div>
          ` : ''}
          <div class="split-homework-layout">
            
            <!-- LEFT COLUMN: PDF VIEWER (LARGER PORTION ~60%) -->
            <div class="pdf-viewer-container" style="box-shadow: 0 4px 12px rgba(0,0,0,0.05); border:1px solid #cbd5e1; display:flex; flex-direction:column; overflow:hidden;">
              <div class="pdf-toolbar" style="display:flex; justify-content:space-between; align-items:center; width:100%; flex-wrap:nowrap; gap:10px;">
                <div style="font-weight:700; color:#0f172a; display:flex; align-items:center; gap:8px; overflow:hidden; text-overflow:ellipsis; white-space:nowrap; min-width:0; flex:1 1 auto;">
                  <button type="button" class="btn-secondary" onclick="window.location.hash='${isTrial ? '#trial' : '#my-classes'}'" style="padding:5px 10px; font-size:12px; font-weight:600; border-radius:6px; display:inline-flex; align-items:center; gap:5px; cursor:pointer; flex-shrink:0;">
                    <i class="fa-solid fa-arrow-left"></i> ${isTrial ? 'Học thử' : 'Quay lại'}
                  </button>
                  <i class="fa-solid fa-file-pdf" style="color:#ef4444; font-size:18px; flex-shrink:0;"></i>
                  <span style="overflow:hidden; text-overflow:ellipsis; white-space:nowrap;">${hw.pdfPath || 'De_Bai_Kiem_Tra.pdf'}</span>
                </div>
                <div style="display:flex; align-items:center; gap:8px; flex-wrap:nowrap; flex-shrink:0;">
                  <div class="pdf-controls-slot" style="display:flex; align-items:center; flex-shrink:0;"></div>
                  ${hw.pdfUrl ? `
                    <a id="btn-download-pdf-mode" href="${(hw.pdfUrl || '').replace(/https?:\/\/kong:8000/, import.meta.env.VITE_SUPABASE_URL || 'http://localhost:54321')}" download="${hw.pdfPath || 'De_Bai_Kiem_Tra.pdf'}" target="_blank" rel="noopener noreferrer" class="btn-secondary" style="padding:6px 14px; font-size:13px; font-weight:600; background:#eff6ff; color:#0066cc; border:1px solid #bfdbfe; border-radius:8px; display:inline-flex; align-items:center; gap:6px; text-decoration:none; flex-shrink:0; cursor:pointer;" title="Tải file PDF bài tập về máy">
                      <i class="fa-solid fa-download"></i> Tải PDF
                    </a>
                  ` : ''}
                </div>
              </div>

              <!-- PDF Iframe Preview -->
              <div class="pdf-iframe-wrapper" style="flex-grow: 1; display: flex; height: calc(100vh - 180px); overflow-y: auto; -webkit-overflow-scrolling: touch; touch-action: pan-x pan-y;">
                <iframe src="${(hw.pdfUrl || '').replace(/https?:\/\/kong:8000/, import.meta.env.VITE_SUPABASE_URL || 'http://localhost:54321')}" style="width: 100%; height: 100%; min-height: 100%; border: none; background:#f8fafc; -webkit-overflow-scrolling: touch;"></iframe>
              </div>
            </div>

            <!-- RIGHT COLUMN: ANSWER ENTRY SHEET (SMALLER PORTION ~40%) -->
            <div class="question-column" style="overflow-y:auto; max-height:calc(100vh - 120px); display:flex; flex-direction:column; gap:20px;">
              <div>
                <!-- Header Info & Timer -->
                <div style="display:flex; justify-content:space-between; align-items:flex-start; margin-bottom:16px; padding-bottom:12px; border-bottom:1px solid #e2e8f0;">
                  <div>
                    <div style="display:flex; align-items:center; gap:8px; flex-wrap:wrap; margin-bottom:4px;">
                      <span class="badge" style="background:#e0f2fe; color:#0369a1; font-weight:700;">PHIẾU ĐIỀN ĐÁP ÁN</span>
                      ${isTrial ? `
                        <span class="badge" style="background:#fef3c7; color:#b45309; font-weight:700; display:inline-flex; align-items:center; gap:4px;">
                          <i class="fa-solid fa-sparkles"></i> BÀI TẬP HỌC THỬ
                        </span>
                      ` : ''}
                      <span id="autosave-status" style="font-size:11px; color:#065f46; background:#ecfdf5; border:1px solid #a7f3d0; padding:2px 8px; border-radius:12px; font-weight:600; display:inline-flex; align-items:center; gap:4px; transition:all 0.2s ease;">
                        <i class="fa-solid fa-cloud-arrow-up" style="color:#10b981;"></i> Tự động lưu nháp
                      </span>
                    </div>
                    <h3 style="font-family:var(--font-heading); font-size:18px; font-weight:700; margin:0;">${hw.title}</h3>
                  </div>
                  <div class="timer-box" style="flex-shrink:0;">
                    <i class="fa-regular fa-clock"></i> <span id="exam-timer-display">${hw.durationMinutes || 45}:00</span>
                  </div>
                </div>

                <!-- Section 1: MC ABCD Answer Inputs -->
                ${mcQuestions.length === 0 ? '' : `
                  <div style="margin-bottom:20px;">
                    <div style="font-weight:700; font-size:14px; color:#0066cc; margin-bottom:10px; display:flex; align-items:center; justify-content:space-between;">
                      <span>PHẦN I: TRẮC NGHIỆM A/B/C/D (${mcQuestions.length} câu)</span>
                    </div>

                    <div style="display:flex; flex-direction:column; gap:8px;">
                      ${mcQuestions.map((q, idx) => {
                        const qNum = q.question_number || q.questionNumber
                        const selected = studentAnswers.mc[qNum] || null
                        return `
                          <div style="display:flex; align-items:center; justify-content:space-between; padding:8px 12px; background:#f8fafc; border:1px solid #e2e8f0; border-radius:10px;">
                            <span style="font-weight:700; font-size:13px; color:#334155; width:54px;">Câu ${idx + 1}</span>
                            <div style="display:flex; gap:6px;">
                              ${['A', 'B', 'C', 'D'].map(opt => `
                                <button type="button" class="student-mc-btn ${selected === opt ? 'selected' : ''}" data-qnum="${qNum}" data-option="${opt}" style="
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
                  </div>
                `}

                <!-- Section 2: True / False Answer Inputs -->
                ${tfQuestions.length === 0 ? '' : `
                  <div style="margin-bottom:20px;">
                    <div style="font-weight:700; font-size:14px; color:#0284c7; margin-bottom:10px;">
                      PHẦN II: ĐÚNG / SAI (${tfQuestions.length} câu - 4 ý a,b,c,d)
                    </div>

                    <div style="display:flex; flex-direction:column; gap:12px;">
                      ${tfQuestions.map((q, idx) => {
                        const qNum = q.question_number || q.questionNumber
                        const tfObj = studentAnswers.tf[qNum] || {}
                        return `
                          <div style="background:#f8fafc; border:1px solid #e2e8f0; border-radius:10px; padding:10px;">
                            <div style="font-weight:700; font-size:13px; color:#0f172a; margin-bottom:8px;">Câu ${idx + 1}</div>
                            <div style="grid-template-columns:1fr 1fr; display:grid; gap:6px;">
                              ${['a', 'b', 'c', 'd'].map(sub => {
                                const val = tfObj[sub]
                                return `
                                  <div style="display:flex; align-items:center; justify-content:space-between; background:#ffffff; padding:4px 8px; border-radius:6px; border:1px solid #e2e8f0; font-size:12px;">
                                    <span style="font-weight:700; color:#475569;">${sub})</span>
                                    <div style="display:flex; gap:4px;">
                                      <button type="button" class="student-tf-btn" data-qnum="${qNum}" data-sub="${sub}" data-val="true" style="
                                        padding:2px 8px; border-radius:4px; font-weight:700; font-size:11px; cursor:pointer;
                                        border:1px solid ${val === true ? '#16a34a' : '#cbd5e1'};
                                        background:${val === true ? '#16a34a' : '#ffffff'};
                                        color:${val === true ? '#ffffff' : '#475569'};
                                      ">Đ</button>
                                      <button type="button" class="student-tf-btn" data-qnum="${qNum}" data-sub="${sub}" data-val="false" style="
                                        padding:2px 8px; border-radius:4px; font-weight:700; font-size:11px; cursor:pointer;
                                        border:1px solid ${val === false ? '#dc2626' : '#cbd5e1'};
                                        background:${val === false ? '#dc2626' : '#ffffff'};
                                        color:${val === false ? '#ffffff' : '#475569'};
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
                  </div>
                `}

                <!-- Section 3: Short Answer Inputs -->
                ${saQuestions.length === 0 ? '' : `
                  <div style="margin-bottom:20px;">
                    <div style="font-weight:700; font-size:14px; color:#059669; margin-bottom:10px;">
                      PHẦN III: TRẢ LỜI NGẮN (${saQuestions.length} câu)
                    </div>

                    <div style="display:flex; flex-direction:column; gap:8px;">
                      ${saQuestions.map((q, idx) => {
                        const qNum = q.question_number || q.questionNumber
                        const val = studentAnswers.sa[qNum] || ''
                        return `
                          <div style="display:flex; align-items:center; justify-content:space-between; padding:8px 12px; background:#f8fafc; border:1px solid #e2e8f0; border-radius:10px;">
                            <span style="font-weight:700; font-size:13px; color:#334155; width:54px;">Câu ${idx + 1}</span>
                            <input type="text" class="form-input student-sa-input" data-qnum="${qNum}" value="${val}" placeholder="Điền đáp án..." style="padding:6px 10px; font-size:13px; background:#ffffff;">
                          </div>
                        `
                      }).join('')}
                    </div>
                  </div>
                `}
              </div>

              <!-- Footer Bar with Submit Button -->
              <div style="padding-top:16px; border-top:1px solid #f1f5f9; margin-top:auto;">
                <button class="btn-primary" id="submit-answers-btn" style="width:100%; padding:12px 20px; font-size:15px; cursor:pointer;">
                  <i class="fa-solid fa-paper-plane"></i> Nộp bài làm ngay
                </button>
              </div>
            </div>

          </div>
        </div>
      </div>
    </div>
  `
}

export function bindHomeworkSolverEvents() {
  bindSidebarEvents()

  const hw = state.currentHomework?.homework
  const questions = state.currentHomework?.questions || []
  if (!hw) return

  const isInteractive = isInteractiveHomework(hw, questions)

  if (isInteractive) {
    const solverContainer = document.getElementById('interactive-solver-container')
    if (solverContainer) {
      renderMath(solverContainer)
    }

    const updateInteractiveProgress = () => {
      let answered = 0
      questions.forEach(q => {
        const qNum = q.question_number || q.questionNumber
        const pObj = parsePromptPayload(q.prompt, q.content)
        const rawType = (q.question_type || q.questionType || '').toUpperCase()
        const isTf = rawType === 'TRUE_FALSE' || rawType === 'TF' || (pObj.statements && pObj.statements.length > 0)
        const isSa = rawType === 'SHORT_ANSWER' || rawType === 'SA'
        const isMc = !isTf && !isSa

        if (isMc && studentAnswers.mc[qNum]) answered++
        else if (isTf) {
          const tf = studentAnswers.tf[qNum] || {}
          if (['a', 'b', 'c', 'd'].every(k => tf[k] !== undefined)) answered++
        } else if (isSa && studentAnswers.sa[qNum] && String(studentAnswers.sa[qNum]).trim() !== '') {
          answered++
        }
      })
      const total = questions.length
      const pct = total > 0 ? Math.round((answered / total) * 100) : 0
      const textEl = document.getElementById('exam-progress-text')
      const barEl = document.getElementById('exam-progress-bar')
      if (textEl) textEl.textContent = `${answered}/${total} câu (${pct}%)`
      if (barEl) barEl.style.width = `${pct}%`
    }

    // MC options click (clicking selected option again deselects it)
    document.querySelectorAll('#interactive-solver-container .exam-option-card').forEach(card => {
      card.addEventListener('click', () => {
        const qNum = parseInt(card.getAttribute('data-qnum'), 10)
        const optId = card.getAttribute('data-optid')
        const isAlreadySelected = studentAnswers.mc[qNum] === optId

        const parent = card.parentElement
        if (isAlreadySelected) {
          // Bỏ chọn đáp án khi click lại
          studentAnswers.mc[qNum] = null
          card.classList.remove('selected')
        } else {
          studentAnswers.mc[qNum] = optId
          if (parent) {
            parent.querySelectorAll('.exam-option-card').forEach(c => {
              c.classList.toggle('selected', c.getAttribute('data-optid') === optId)
            })
          }
        }

        const navBtn = document.getElementById(`nav-btn-q-${qNum}`)
        if (navBtn) {
          if (studentAnswers.mc[qNum]) navBtn.classList.add('answered')
          else navBtn.classList.remove('answered')
        }

        updateInteractiveProgress()
        saveDraftToStorage(hw.id, studentAnswers, timeLeftSeconds)
      })
    })

    // TF toggle buttons click
    document.querySelectorAll('#interactive-solver-container .tf-toggle-btn').forEach(btn => {
      btn.addEventListener('click', (e) => {
        e.preventDefault()
        const qNum = parseInt(btn.getAttribute('data-qnum'), 10)
        const sub = (btn.getAttribute('data-sub') || '').toLowerCase()
        const val = btn.getAttribute('data-val') === 'true'

        if (!studentAnswers.tf[qNum]) studentAnswers.tf[qNum] = {}
        const currentVal = studentAnswers.tf[qNum][sub]
        const row = btn.closest('.tf-statement-row')
        const parent = btn.parentElement

        if (currentVal === val) {
          // Deselect if clicked again
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
          if (parent) {
            parent.querySelectorAll('.tf-toggle-btn').forEach(b => {
              b.classList.remove('active')
              b.style.background = '#ffffff'
              b.style.color = '#475569'
              b.style.borderColor = '#cbd5e1'
              b.style.boxShadow = 'none'
            })
          }
          btn.classList.add('active')
          btn.style.background = val ? '#16a34a' : '#dc2626'
          btn.style.color = '#ffffff'
          btn.style.borderColor = val ? '#16a34a' : '#dc2626'
          btn.style.boxShadow = val ? '0 2px 4px rgba(22,163,74,0.2)' : '0 2px 4px rgba(220,38,38,0.2)'
          if (row) {
            row.style.background = val ? '#f0fdf4' : '#fef2f2'
            row.style.borderColor = val ? '#86efac' : '#fca5a5'
          }
        }

        const tf = studentAnswers.tf[qNum] || {}
        const answeredStatementsCount = ['a', 'b', 'c', 'd'].filter(k => tf[k] !== undefined).length
        const allDone = answeredStatementsCount === 4
        const navBtn = document.getElementById(`nav-btn-q-${qNum}`)
        if (navBtn) {
          navBtn.classList.toggle('answered', allDone)
          navBtn.classList.toggle('partial', !allDone && answeredStatementsCount > 0)
        }

        updateInteractiveProgress()
        saveDraftToStorage(hw.id, studentAnswers, timeLeftSeconds)
      })
    })

    // SA input change
    document.querySelectorAll('#interactive-solver-container .student-interactive-sa-input').forEach(input => {
      input.addEventListener('input', (e) => {
        const qNum = parseInt(input.getAttribute('data-qnum'), 10)
        const val = e.target.value
        studentAnswers.sa[qNum] = val

        const navBtn = document.getElementById(`nav-btn-q-${qNum}`)
        if (navBtn) {
          if (val.trim()) navBtn.classList.add('answered')
          else navBtn.classList.remove('answered')
        }

        updateInteractiveProgress()
        clearTimeout(saDebounceTimer)
        saDebounceTimer = setTimeout(() => {
          saveDraftToStorage(hw.id, studentAnswers, timeLeftSeconds)
        }, 500)
      })
    })

    // Flag button click
    document.querySelectorAll('.btn-flag-question').forEach(btn => {
      btn.addEventListener('click', () => {
        const qNum = parseInt(btn.getAttribute('data-qnum'), 10)
        if (flaggedQuestions.has(qNum)) {
          flaggedQuestions.delete(qNum)
          btn.classList.remove('active')
          btn.style.color = '#94a3b8'
          btn.innerHTML = '<i class="fa-solid fa-bookmark"></i> Đánh dấu'
          document.getElementById(`exam-q-card-${qNum}`)?.classList.remove('flagged')
          document.getElementById(`nav-btn-q-${qNum}`)?.classList.remove('flagged')
        } else {
          flaggedQuestions.add(qNum)
          btn.classList.add('active')
          btn.style.color = '#f59e0b'
          btn.innerHTML = '<i class="fa-solid fa-bookmark"></i> Đã đánh dấu'
          document.getElementById(`exam-q-card-${qNum}`)?.classList.add('flagged')
          document.getElementById(`nav-btn-q-${qNum}`)?.classList.add('flagged')
        }
      })
    })

    // Navigation Palette click
    document.querySelectorAll('.exam-nav-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        const qNum = parseInt(btn.getAttribute('data-qnum'), 10)
        const targetCard = document.getElementById(`exam-q-card-${qNum}`)
        if (targetCard) {
          targetCard.scrollIntoView({ behavior: 'smooth', block: 'center' })
          targetCard.style.transition = 'box-shadow 0.3s'
          targetCard.style.boxShadow = '0 0 0 3px rgba(2, 132, 199, 0.4)'
          setTimeout(() => {
            targetCard.style.boxShadow = ''
          }, 1200)
        }
      })
    })

    // Download PDF in Interactive Solver mode
    const downloadPdfBtn = document.getElementById('btn-download-solver-pdf')
    if (downloadPdfBtn) {
      downloadPdfBtn.addEventListener('click', async (e) => {
        e.preventDefault()
        const mappedUrl = (hw.pdfUrl || '').replace(/https?:\/\/kong:8000/, import.meta.env.VITE_SUPABASE_URL || 'http://localhost:54321')
        const downloadName = (hw.pdfPath && hw.pdfPath !== 'INTERACTIVE' && !hw.pdfPath.startsWith('http')) ? hw.pdfPath : `${hw.title || 'De_Bai'}.pdf`
        
        if (!mappedUrl) {
          showToast('Bài tập này không có file PDF đính kèm!', 'warning')
          return
        }

        try {
          showToast('Đang tải file PDF đề bài về máy...', 'info')
          const res = await fetch(mappedUrl)
          if (!res.ok) throw new Error(`HTTP ${res.status}`)
          const blob = await res.blob()
          const blobUrl = URL.createObjectURL(blob)
          const a = document.createElement('a')
          a.href = blobUrl
          a.download = downloadName
          document.body.appendChild(a)
          a.click()
          document.body.removeChild(a)
          setTimeout(() => URL.revokeObjectURL(blobUrl), 2000)
          showToast(`Đã tải file "${downloadName}" thành công!`, 'success')
        } catch (err) {
          console.warn('Fetch blob download failed, falling back to window.open:', err)
          window.open(mappedUrl, '_blank')
        }
      })
    }
  } else {
    // Render PDF using PDF.js for 100% smooth touch scrolling on Real Mobile/iPad
    const pdfContainer = document.querySelector('.pdf-iframe-wrapper')
    if (pdfContainer && hw.pdfUrl) {
      const mappedUrl = (hw.pdfUrl || '').replace(/https?:\/\/kong:8000/, import.meta.env.VITE_SUPABASE_URL || 'http://localhost:54321')
      renderPdfViewer(pdfContainer, mappedUrl)
    }

    // Download PDF in PDF mode
    const pdfModeDownloadBtn = document.getElementById('btn-download-pdf-mode')
    if (pdfModeDownloadBtn) {
      pdfModeDownloadBtn.addEventListener('click', async (e) => {
        const href = pdfModeDownloadBtn.getAttribute('href')
        if (!href || href === '#') return
        e.preventDefault()
        const downloadName = pdfModeDownloadBtn.getAttribute('download') || hw.pdfPath || 'De_Bai_Kiem_Tra.pdf'
        try {
          showToast('Đang tải file PDF về máy...', 'info')
          const res = await fetch(href)
          if (!res.ok) throw new Error(`HTTP ${res.status}`)
          const blob = await res.blob()
          const blobUrl = URL.createObjectURL(blob)
          const a = document.createElement('a')
          a.href = blobUrl
          a.download = downloadName
          document.body.appendChild(a)
          a.click()
          document.body.removeChild(a)
          setTimeout(() => URL.revokeObjectURL(blobUrl), 2000)
          showToast(`Đã tải file "${downloadName}" thành công!`, 'success')
        } catch (err) {
          console.warn('Fetch blob download failed, falling back to window.open:', err)
          window.open(href, '_blank')
        }
      })
    }

    // PDF Mode: MC options click
    document.querySelectorAll('.student-mc-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        const qNum = parseInt(btn.getAttribute('data-qnum'), 10)
        const opt = btn.getAttribute('data-option')

        if (studentAnswers.mc[qNum] === opt) {
          studentAnswers.mc[qNum] = null
        } else {
          studentAnswers.mc[qNum] = opt
        }

        saveDraftToStorage(hw.id, studentAnswers, timeLeftSeconds)

        document.querySelectorAll(`.student-mc-btn[data-qnum="${qNum}"]`).forEach(b => {
          const isSel = b.getAttribute('data-option') === studentAnswers.mc[qNum]
          b.style.background = isSel ? '#0066cc' : '#ffffff'
          b.style.color = isSel ? '#ffffff' : '#334155'
          b.style.borderColor = isSel ? '#0066cc' : '#cbd5e1'
        })
      })
    })

    // PDF Mode: TF toggle click
    document.querySelectorAll('.student-tf-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        const qNum = parseInt(btn.getAttribute('data-qnum'), 10)
        const sub = (btn.getAttribute('data-sub') || '').toLowerCase()
        const val = btn.getAttribute('data-val') === 'true'

        if (!studentAnswers.tf[qNum]) studentAnswers.tf[qNum] = {}
        
        if (studentAnswers.tf[qNum][sub] === val) {
          delete studentAnswers.tf[qNum][sub]
        } else {
          studentAnswers.tf[qNum][sub] = val
        }

        saveDraftToStorage(hw.id, studentAnswers, timeLeftSeconds)

        const parent = btn.parentElement
        if (parent) {
          parent.querySelectorAll('.student-tf-btn').forEach(b => {
            const btnVal = b.getAttribute('data-val') === 'true'
            const currentVal = studentAnswers.tf[qNum][sub]
            const isSel = currentVal !== undefined && currentVal === btnVal
            if (isSel) {
              b.style.background = btnVal ? '#16a34a' : '#dc2626'
              b.style.color = '#ffffff'
              b.style.borderColor = btnVal ? '#16a34a' : '#dc2626'
            } else {
              b.style.background = '#ffffff'
              b.style.color = '#475569'
              b.style.borderColor = '#cbd5e1'
            }
          })
        }
      })
    })

    // PDF Mode: SA input change
    document.querySelectorAll('.student-sa-input').forEach(input => {
      input.addEventListener('input', (e) => {
        const qNum = parseInt(input.getAttribute('data-qnum'), 10)
        studentAnswers.sa[qNum] = e.target.value

        updateAutosaveIndicator(false)
        clearTimeout(saDebounceTimer)
        saDebounceTimer = setTimeout(() => {
          saveDraftToStorage(hw.id, studentAnswers, timeLeftSeconds)
        }, 400)
      })
    })
  }

  const attemptsCount = state.currentHomework?.attemptsCount || 0
  const maxAttempts = hw.maxAttempts || hw.max_attempts || 0
  const deadline = hw.deadline || hw.deadline_at || null

  const isExpired = deadline ? new Date() > new Date(deadline) : false
  const isExceeded = (maxAttempts > 0 && attemptsCount >= maxAttempts)

  if (isExceeded) return

  // Shared helper to build answers array
  const buildSubmissionAnswers = () => {
    return questions.map(q => {
      const qNum = q.question_number || q.questionNumber
      const pObj = parsePromptPayload(q.prompt, q.content)
      const rawType = (q.question_type || q.questionType || '').toUpperCase()
      const isTf = rawType === 'TRUE_FALSE' || rawType === 'TF' || (pObj.statements && pObj.statements.length > 0)
      const isSa = rawType === 'SHORT_ANSWER' || rawType === 'SA'
      const isMc = !isTf && !isSa

      if (isMc) {
        return {
          questionId: q.id,
          givenAnswer: {
            type: 'MULTIPLE_CHOICE',
            value: studentAnswers.mc[qNum] || null
          }
        }
      } else if (isTf) {
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
        return {
          questionId: q.id,
          givenAnswer: {
            type: 'TRUE_FALSE',
            value: valObj
          }
        }
      } else {
        return {
          questionId: q.id,
          givenAnswer: {
            type: 'SHORT_ANSWER',
            value: studentAnswers.sa[qNum] !== undefined && studentAnswers.sa[qNum] !== null ? String(studentAnswers.sa[qNum]) : ''
          }
        }
      }
    })
  }

  const isTrial = window.location.hash.includes('trial=true') || !state.token

  let isSubmitting = false

  const disableAllInputs = () => {
    const root = document.getElementById('homework-solver-container') || document.querySelector('.exam-container') || document.body
    const elements = root.querySelectorAll('input, textarea, button:not(#retry-submit-btn), select')
    elements.forEach(el => {
      if (el.id !== 'modal-close-btn' && el.id !== 'modal-cancel-btn') {
        el.disabled = true
        el.style.pointerEvents = 'none'
      }
    })

    // Specifically disable interactive markdown option cards and toggle buttons
    const interactiveCards = root.querySelectorAll('.exam-option-card, .tf-toggle-btn, .tf-statement-row, .student-mc-btn, .student-tf-btn, .btn-flag-question')
    interactiveCards.forEach(card => {
      card.style.pointerEvents = 'none'
      card.style.cursor = 'not-allowed'
    })

    // Freeze entire interactive question containers
    const questionContainers = root.querySelectorAll('#interactive-solver-container, .interactive-solver-body, .exam-container, .exam-questions-scroll')
    questionContainers.forEach(qc => {
      qc.style.pointerEvents = 'none'
      qc.style.opacity = '0.75'
    })
  }

  // Shared submit helper
  const performSubmit = async (guestName = '', guestPhone = '') => {
    if (isSubmitting) return
    isSubmitting = true

    // Close any open modals immediately and prevent further edits
    closeModal()
    disableAllInputs()

    // Stop all background intervals during submit to prevent collisions
    if (timerInterval) clearInterval(timerInterval)
    if (heartbeatInterval) clearInterval(heartbeatInterval)
    if (autosaveInterval) clearInterval(autosaveInterval)

    try {
      showToast('Đang gửi bài làm lên máy chủ chấm điểm...', 'info')
      
      const submissionAnswers = buildSubmissionAnswers()

      const totalDurationSeconds = (hw.durationMinutes || 45) * 60
      const durationSecondsTaken = Math.max(0, totalDurationSeconds - Math.max(0, timeLeftSeconds))

      const payload = {
        homeworkId: hw.id,
        answers: submissionAnswers,
        durationSecondsTaken
      }

      if (isTrial) {
        payload.isTrial = true
        const resolvedGuestName = guestName || localStorage.getItem('trial_guest_name') || 'Học sinh trải nghiệm'
        const resolvedGuestPhone = guestPhone || localStorage.getItem('trial_guest_phone') || ''
        if (resolvedGuestName) payload.guestName = resolvedGuestName
        if (resolvedGuestPhone) payload.guestPhone = resolvedGuestPhone
      } else if (hw.type === 'EXAM' && examSessionToken) {
        payload.sessionToken = examSessionToken
      }

      const result = await api.submitHomework(payload)
      
      showToast('Nộp bài thành công! Đang tải kết quả chấm điểm...', 'success')
      
      // Clear local draft storage on successful submit
      clearDraftStorage(hw.id)

      // Save result details to state for review page if needed
      state.lastSubmissionResult = result

      if (isTrial) {
        try {
          sessionStorage.setItem('last_trial_submission', JSON.stringify(result))

          // Append to persistent trial submission history in localStorage
          const localHistoryStr = localStorage.getItem('trial_submissions_history')
          let localHistory = localHistoryStr ? JSON.parse(localHistoryStr) : []
          if (!Array.isArray(localHistory)) localHistory = []

          // Remove duplicate if already present
          localHistory = localHistory.filter(item => item.submissionId !== result.submissionId)

          localHistory.unshift({
            submissionId: result.submissionId,
            homeworkId: hw.id,
            homeworkTitle: hw.title || 'Bài tập tự luyện thử',
            lessonTitle: hw.lessonTitle || '',
            score: result.score,
            maxScore: result.maxScore || hw.maxScore || 10,
            passScore: result.passScore || hw.passScore || 5,
            isPassed: result.isPassed,
            correctCount: result.correctCount,
            wrongCount: result.wrongCount,
            durationSecondsTaken,
            guestName: payload.guestName || 'Học sinh trải nghiệm',
            guestPhone: payload.guestPhone || '',
            submittedAt: new Date().toISOString()
          })

          localStorage.setItem('trial_submissions_history', JSON.stringify(localHistory))
          if (payload.guestPhone) {
            localStorage.setItem('trial_guest_phone', payload.guestPhone)
          }
          if (payload.guestName) {
            localStorage.setItem('trial_guest_name', payload.guestName)
          }
        } catch (e) {
          console.warn('[Trial] Failed to save trial submission to localStorage:', e)
        }
        window.location.hash = `#assignment-review?trial=true&submissionId=${result.submissionId}`
      } else {
        window.location.hash = `#assignment-review?submissionId=${result.submissionId}`
      }
    } catch (err) {
      isSubmitting = false
      console.error('[HomeworkSolver] Submit failed:', err)
      showToast(`Nộp bài thất bại: ${err.message}`, 'error')

      // If submit failed on timeout, provide a direct retry modal so the student doesn't lose their answers
      if (timeLeftSeconds <= 0) {
        openModal(
          'LỖI NỘP BÀI TỰ ĐỘNG',
          `
            <div style="text-align:center; padding:12px; color:#ef4444;">
              <i class="fa-solid fa-triangle-exclamation" style="font-size:44px; margin-bottom:12px;"></i>
              <p style="font-size:15px; color:#1e293b; font-weight:600; margin-bottom:8px;">Hết giờ làm bài nhưng kết nối máy chủ gặp lỗi</p>
              <p style="font-size:13px; color:#64748b; line-height:1.5; margin-bottom:12px;">
                Chi tiết: ${err.message || 'Lỗi mạng hoặc máy chủ bận'}.<br>
                Bài làm của bạn đã được bảo lưu an toàn. Vui lòng bấm <strong>"Thử nộp lại"</strong> ngay.
              </p>
            </div>
          `,
          async () => {
            await performSubmit(guestName, guestPhone)
            return true
          }
        )
        const retryBtn = document.getElementById('modal-confirm-btn')
        if (retryBtn) {
          retryBtn.id = 'retry-submit-btn'
          retryBtn.innerHTML = '<i class="fa-solid fa-rotate-right"></i> Thử nộp lại'
          retryBtn.style.background = '#0284c7'
          retryBtn.disabled = false
          retryBtn.style.pointerEvents = 'auto'
        }
      }
    }
  }

  // Timer Countdown Setup (deducting real elapsed time since last save)
  const savedDraft = loadDraftFromStorage(hw.id)
  let timeLeftSeconds = (hw.durationMinutes || 45) * 60
  if (savedDraft?.timeLeft && savedDraft.timeLeft > 0) {
    let elapsed = 0
    if (savedDraft.updatedAt) {
      const lastSave = new Date(savedDraft.updatedAt).getTime()
      if (!isNaN(lastSave)) {
        elapsed = Math.max(0, Math.floor((Date.now() - lastSave) / 1000))
      }
    }
    const adjusted = savedDraft.timeLeft - elapsed
    timeLeftSeconds = Math.min(timeLeftSeconds, Math.max(0, adjusted))
  }
  let timerInterval = null

  if (isDraftRestored) {
    showToast('Đã tự động khôi phục bài làm từ bản lưu nháp gần nhất!', 'info')
    updateAutosaveIndicator(true)
  }

  const updateTimerDisplay = () => {
    const timerDisplay = document.getElementById('exam-timer-display')
    if (!timerDisplay) return
    const safeSeconds = Math.max(0, timeLeftSeconds)
    const minutes = Math.floor(safeSeconds / 60)
    const seconds = safeSeconds % 60
    timerDisplay.textContent = `${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`
    if (safeSeconds <= 300) {
      timerDisplay.style.color = '#ef4444'
      timerDisplay.style.fontWeight = '700'
    }
  }

  const startTimer = () => {
    updateTimerDisplay()
    if (timerInterval) clearInterval(timerInterval)

    // If time already expired when opening/resuming
    if (timeLeftSeconds <= 0) {
      showToast('Thời gian làm bài đã kết thúc! Hệ thống tự động nộp bài...', 'warning')
      disableAllInputs()
      performSubmit(isTrial ? (localStorage.getItem('trial_guest_name') || 'Học sinh trải nghiệm (Hết giờ)') : '')
      return
    }

    timerInterval = setInterval(() => {
      if (timeLeftSeconds <= 0) {
        clearInterval(timerInterval)
        showToast('Hết thời gian làm bài! Hệ thống tự động nộp bài...', 'warning')
        disableAllInputs()
        performSubmit(isTrial ? (localStorage.getItem('trial_guest_name') || 'Học sinh trải nghiệm (Hết giờ)') : '')
        return
      }

      timeLeftSeconds--
      updateTimerDisplay()

      if (timeLeftSeconds % 10 === 0) {
        saveDraftToStorage(hw.id, studentAnswers, timeLeftSeconds)
      }

      if (timeLeftSeconds === 300) {
        showToast('Thời gian làm bài của bạn còn lại 5 phút!', 'warning')
      }
    }, 1000)
  }

  let heartbeatInterval = null
  let autosaveInterval = null
  let examSessionToken = null

  // Cleanup handler for route changes to clear intervals
  const hashChangeListener = () => {
    if (timerInterval) clearInterval(timerInterval)
    if (heartbeatInterval) clearInterval(heartbeatInterval)
    if (autosaveInterval) clearInterval(autosaveInterval)
    window.removeEventListener('hashchange', hashChangeListener)
  }
  window.addEventListener('hashchange', hashChangeListener)

  // EXAM MODE tracking & instructions popup (Only for enrolled students)
  if (hw.type === 'EXAM' && !isTrial) {
    let examStarted = false
    let isLeavingOrFocusLost = false
    let currentViolationsCount = 0
    let maxViolationsAllowed = hw.maxViolations || hw.max_violations || 3

    const handleVisibilityChange = async () => {
      if (!examStarted) return
      if (document.hidden) {
        isLeavingOrFocusLost = true
        logCheatAttempt('LEAVE_TAB')
      } else {
        if (isLeavingOrFocusLost) {
          isLeavingOrFocusLost = false
          await logCheatAttempt('RETURN_TAB')
          openModal(
            'CẢNH BÁO GIAN LẬN',
            `<p style="font-size:15px; color:#ef4444; line-height:1.6; margin:0; text-align:center;">
               <i class="fa-solid fa-triangle-exclamation" style="font-size:40px; margin-bottom:12px;"></i><br>
               Hệ thống phát hiện bạn vừa chuyển thẻ (tab) hoặc thu nhỏ cửa sổ.<br>
               Hành động này đã được ghi lại trong nhật ký giám sát.<br><br>
               <span style="background:#fee2e2; border:1px solid #fecaca; padding:6px 16px; border-radius:20px; font-size:13px; font-weight:700; color:#991b1b; display:inline-block;">
                 Số lần vi phạm: <strong style="font-size:16px; color:#dc2626;">${currentViolationsCount}</strong> / ${maxViolationsAllowed} lần
               </span>
             </p>`,
            () => true
          )
        }
      }
    }

    const handleBlur = () => {
      if (!examStarted) return
      if (!isLeavingOrFocusLost) {
        isLeavingOrFocusLost = true
        logCheatAttempt('LEAVE_TAB')
      }
    }

    const handleFocus = () => {
      if (!examStarted) return
      if (isLeavingOrFocusLost && !document.hidden) {
        isLeavingOrFocusLost = false
        logCheatAttempt('RETURN_TAB').then(() => {
          openModal(
            'CẢNH BÁO GIAN LẬN',
            `<p style="font-size:15px; color:#ef4444; line-height:1.6; margin:0; text-align:center;">
               <i class="fa-solid fa-triangle-exclamation" style="font-size:40px; margin-bottom:12px;"></i><br>
               Hệ thống phát hiện bạn vừa rời khỏi màn hình làm bài (mở ứng dụng khác / thu nhỏ trình duyệt).<br>
               Hành động này đã được ghi lại trong nhật ký giám sát.<br><br>
               <span style="background:#fee2e2; border:1px solid #fecaca; padding:6px 16px; border-radius:20px; font-size:13px; font-weight:700; color:#991b1b; display:inline-block;">
                 Số lần vi phạm: <strong style="font-size:16px; color:#dc2626;">${currentViolationsCount}</strong> / ${maxViolationsAllowed} lần
               </span>
             </p>`,
            () => true
          )
        })
      }
    }

    const handleBeforeUnload = (e) => {
      if (examStarted) {
        e.preventDefault()
        e.returnValue = 'Bạn đang trong phòng thi chính thức. Bạn có chắc chắn muốn rời đi?'
        return e.returnValue
      }
    }

    const handleCopy = (e) => {
      if (!examStarted) return
      e.preventDefault()
      showToast('Không được phép sao chép nội dung trong phòng thi!', 'error')
      logCheatAttempt('COPY')
    }

    const handlePaste = () => {
      if (!examStarted) return
      logCheatAttempt('PASTE')
    }

    const handleContextMenu = (e) => {
      if (!examStarted) return
      e.preventDefault()
    }

    // Intercept Sidebar & Navbar navigation clicks during active exam
    const handleNavClick = (e) => {
      if (!examStarted) return
      e.preventDefault()
      e.stopPropagation()
      e.stopImmediatePropagation()

      const targetHash = e.currentTarget.getAttribute('onclick')?.match(/hash=['"]?([^'"]+)['"]?/)?.[1] || '#my-classes'

      openModal(
        'CẢNH BÁO RỜI PHÒNG THI',
        `<p style="font-size:14px; color:#ef4444; line-height:1.6; margin:0; text-align:center;">
           <i class="fa-solid fa-triangle-exclamation" style="font-size:40px; margin-bottom:12px;"></i><br>
           Bạn đang trong bài thi chính thức! Rời khỏi phòng thi lúc này sẽ <strong>ghi nhận 01 lần vi phạm (Rời phòng thi)</strong>.<br>
           Bạn có chắc chắn muốn thoát ra không?
         </p>`,
        async () => {
          examStarted = false
          await logCheatAttempt('LEAVE_EXAM')
          window.removeEventListener('beforeunload', handleBeforeUnload)
          window.location.hash = targetHash
          return true
        }
      )
    }

    // Bind event listeners
    document.addEventListener('visibilitychange', handleVisibilityChange)
    window.addEventListener('blur', handleBlur)
    window.addEventListener('focus', handleFocus)
    window.addEventListener('beforeunload', handleBeforeUnload)
    document.addEventListener('copy', handleCopy)
    document.addEventListener('paste', handlePaste)
    document.addEventListener('contextmenu', handleContextMenu)

    // Attach capture-phase listener to all sidebar and navigation items
    const navItems = document.querySelectorAll('.sidebar .nav-item, .brand-logo, #sidebar-logout-btn')
    navItems.forEach(item => {
      item.addEventListener('click', handleNavClick, true)
    })

    const cleanupTracking = () => {
      document.removeEventListener('visibilitychange', handleVisibilityChange)
      window.removeEventListener('blur', handleBlur)
      window.removeEventListener('focus', handleFocus)
      window.removeEventListener('beforeunload', handleBeforeUnload)
      document.removeEventListener('copy', handleCopy)
      document.removeEventListener('paste', handlePaste)
      document.removeEventListener('contextmenu', handleContextMenu)
      navItems.forEach(item => {
        item.removeEventListener('click', handleNavClick, true)
      })
      window.removeEventListener('hashchange', cleanupTracking)
    }
    window.addEventListener('hashchange', cleanupTracking)

    const logCheatAttempt = async (actionText) => {
      try {
        const res = await api.submitExamLog({ homeworkId: hw.id, action: actionText })
        if (res) {
          if (res.currentViolations !== undefined) currentViolationsCount = res.currentViolations
          if (res.maxViolations !== undefined) maxViolationsAllowed = res.maxViolations

          if (res.autoSubmitted) {
            if (timerInterval) clearInterval(timerInterval)
            if (heartbeatInterval) clearInterval(heartbeatInterval)
            if (autosaveInterval) clearInterval(autosaveInterval)
            
            openModal(
              'ĐÌNH CHỈ THI',
              `<p style="font-size:15px; color:#ef4444; line-height:1.6; margin:0; text-align:center;">
                 <i class="fa-solid fa-ban" style="font-size:48px; margin-bottom:16px;"></i><br>
                 Hệ thống đã tự động thu bài của bạn do <strong>vi phạm quy chế thi quá số lần cho phép (${currentViolationsCount}/${maxViolationsAllowed} lần)</strong>.
               </p>`,
              () => {
                window.location.hash = '#assignment-review'
                return true
              }
            )
          }
        }
      } catch(e) {}
    }

    const startHeartbeat = () => {
      heartbeatInterval = setInterval(async () => {
        try {
          await api.heartbeatExamSession(hw.id, examSessionToken)
        } catch(e) {
          console.warn('Heartbeat failed:', e)
        }
      }, 30000)
    }

    const startAutosave = () => {
      autosaveInterval = setInterval(async () => {
        try {
          const draftAnswers = buildSubmissionAnswers()
          await api.autosaveExamSession(hw.id, examSessionToken, draftAnswers)
        } catch(e) {
          console.warn('Autosave failed:', e)
        }
      }, 15000)
    }

    // Show initial Exam Rules Modal before starting
    const maxVio = hw.maxViolations || hw.max_violations || 3
    const examRulesBody = `
      <div style="display:flex; flex-direction:column; gap:16px;">
        <div style="display:flex; align-items:center; gap:12px; background:#fef2f2; border:1px solid #fee2e2; padding:14px 16px; border-radius:12px; color:#991b1b;">
          <i class="fa-solid fa-shield-cat" style="font-size:32px; color:#ef4444; flex-shrink:0;"></i>
          <div style="font-size:13px; line-height:1.5;">
            Đây là <strong>Bài thi chính thức</strong> được giám sát bằng hệ thống chống gian lận tự động. Vui lòng đọc kỹ các quy định dưới đây trước khi bắt đầu:
          </div>
        </div>

        <div style="display:flex; flex-direction:column; gap:12px; font-size:13px; color:#334155; background:#f8fafc; padding:16px; border-radius:12px; border:1px solid #e2e8f0;">
          <div style="display:flex; align-items:flex-start; gap:10px;">
            <i class="fa-solid fa-triangle-exclamation" style="color:#ef4444; margin-top:2px; font-size:16px; flex-shrink:0;"></i>
            <div><strong>Cảnh báo rời khỏi màn hình thi:</strong> Không chuyển tab, không mở ứng dụng khác, không thu nhỏ trình duyệt. Vi phạm quá <strong>${maxVio} lần</strong> hệ thống sẽ <strong>tự động thu bài & đình chỉ thi</strong>.</div>
          </div>
          
          <div style="display:flex; align-items:flex-start; gap:10px;">
            <i class="fa-solid fa-ban" style="color:#ef4444; margin-top:2px; font-size:16px; flex-shrink:0;"></i>
            <div><strong>Cấm Sao chép & Dán (Copy / Paste):</strong> Thao tác copy, paste và chuột phải đều bị vô hiệu hóa và ghi lại nhật ký vi phạm.</div>
          </div>

          <div style="display:flex; align-items:flex-start; gap:10px;">
            <i class="fa-solid fa-desktop" style="color:#d97706; margin-top:2px; font-size:16px; flex-shrink:0;"></i>
            <div><strong>Giám sát phiên làm bài (Single Session):</strong> Không mở bài thi trên 2 thiết bị hoặc 2 tab cùng lúc. Hệ thống sẽ vô hiệu hóa phiên cũ nếu phát hiện đăng nhập trùng lặp.</div>
          </div>

          <div style="display:flex; align-items:flex-start; gap:10px;">
            <i class="fa-solid fa-cloud-arrow-up" style="color:#059669; margin-top:2px; font-size:16px; flex-shrink:0;"></i>
            <div><strong>Tự động lưu bài làm (Autosave):</strong> Đáp án bài làm sẽ được hệ thống lưu tự động ngầm định kỳ 15 giây/lần.</div>
          </div>

          <div style="display:flex; align-items:flex-start; gap:10px;">
            <i class="fa-solid fa-stopwatch" style="color:#0284c7; margin-top:2px; font-size:16px; flex-shrink:0;"></i>
            <div><strong>Thời gian thi:</strong> Đếm ngược <strong>${hw.durationMinutes || 45} phút</strong>. Hệ thống tự động thu bài ngay khi hết giờ.</div>
          </div>

          <div style="display:flex; align-items:flex-start; gap:10px;">
            <i class="fa-solid fa-lock" style="color:#7c3aed; margin-top:2px; font-size:16px; flex-shrink:0;"></i>
            <div><strong>Số lần nộp bài:</strong> Mỗi học sinh chỉ có <strong>01 lần làm bài duy nhất</strong>.</div>
          </div>
        </div>

        <div style="font-size:12px; color:#64748b; text-align:center; font-weight:600;">
          Nhấn nút <strong style="color:#059669;">"Bắt đầu làm bài"</strong> để đồng ý tuân thủ quy chế phòng thi và tính giờ.
        </div>
      </div>
    `

    openModal(
      'QUY CHẾ PHÒNG THI TRỰC TUYẾN',
      examRulesBody,
      async () => {
        try {
          // Generate a session token or grab from crypto
          const token = crypto.randomUUID ? crypto.randomUUID() : Math.random().toString(36).substring(2)
          await api.initExamSession(hw.id, token)
          examSessionToken = token
        } catch(e) {
          showToast(e.message || 'Không thể bắt đầu phiên thi', 'error')
          return false
        }
        
        examStarted = true
        startTimer()
        startHeartbeat()
        startAutosave()
        showToast('Bài thi đã bắt đầu! Chúc bạn làm bài tốt.', 'info')
        return true
      }
    )

    // Customize modal buttons for exam start
    const confirmBtn = document.getElementById('modal-confirm-btn')
    const cancelBtn = document.getElementById('modal-cancel-btn')
    const closeBtn = document.getElementById('modal-close-btn')
    if (confirmBtn) {
      confirmBtn.innerHTML = '<i class="fa-solid fa-play"></i> Bắt đầu làm bài'
      confirmBtn.style.background = '#059669'
    }
    if (cancelBtn) {
      cancelBtn.innerHTML = '<i class="fa-solid fa-arrow-left"></i> Quay lại'
      cancelBtn.addEventListener('click', () => {
        window.location.hash = '#my-classes'
      }, { once: true })
    }
    if (closeBtn) {
      closeBtn.addEventListener('click', () => {
        window.location.hash = '#my-classes'
      }, { once: true })
    }
  } else {
    // Normal Practice homework: start timer immediately
    startTimer()
  }



  // Submit Homework Event
  document.getElementById('submit-answers-btn')?.addEventListener('click', () => {
    if (isSubmitting || timeLeftSeconds <= 0) return

    if (isTrial) {
      openModal(
        'Nộp bài làm học thử',
        `
          <div style="display:flex; flex-direction:column; gap:16px;">
            <div style="background:#eff6ff; border:1px solid #bfdbfe; color:#1e40af; padding:12px 14px; border-radius:10px; font-size:13px; line-height:1.5;">
              <i class="fa-solid fa-circle-info" style="color:#2563eb; margin-right:4px;"></i> Chúc mừng bạn đã hoàn thành bài làm thử! Vui lòng cung cấp thông tin để hệ thống chấm điểm và gửi kết quả chi tiết.
            </div>
            <div>
              <label style="display:block; font-size:13px; font-weight:600; color:#334155; margin-bottom:6px;">Họ và tên của bạn <span style="color:#ef4444;">*</span></label>
              <input type="text" id="trial-guest-name" class="form-input" placeholder="Ví dụ: Nguyễn Văn An" style="width:100%; box-sizing:border-box;" required>
            </div>
            <div>
              <label style="display:block; font-size:13px; font-weight:600; color:#334155; margin-bottom:6px;">Số điện thoại / Zalo <span style="color:#64748b; font-weight:400;">(Tùy chọn - nhận tư vấn lộ trình)</span></label>
              <input type="tel" id="trial-guest-phone" class="form-input" placeholder="Ví dụ: 0912345678" style="width:100%; box-sizing:border-box;">
            </div>
          </div>
        `,
        async () => {
          const guestNameInput = document.getElementById('trial-guest-name')
          const guestPhoneInput = document.getElementById('trial-guest-phone')
          const guestName = guestNameInput?.value?.trim() || 'Học sinh trải nghiệm'
          const guestPhone = guestPhoneInput?.value?.trim() || ''

          if (timerInterval) clearInterval(timerInterval)
          await performSubmit(guestName, guestPhone)
          return true
        }
      )
    } else {
      openModal(
        'Nộp bài làm',
        `<p style="font-size:15px; color:#475569; line-height:1.6; margin:0;">
          Bạn có chắc chắn muốn nộp bài làm này?<br>
          Kết quả sẽ được tự động chấm điểm và lưu trữ ngay lập tức.
         </p>`,
        async () => {
          if (timerInterval) clearInterval(timerInterval)
          await performSubmit()
          return true
        }
      )
    }
  })
}
