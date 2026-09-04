import { renderSidebar, bindSidebarEvents } from '../components/sidebar.js'
import { renderNavbar } from '../components/navbar.js'
import { showToast } from '../components/toast.js'
import { state } from '../state.js'
import { api } from '../api.js'
import { openModal } from '../components/modal.js'
import { renderPdfViewer } from '../components/pdf-viewer.js'

// Student's current answers state
let studentAnswers = {
  mc: {}, // { 1: 'A', 2: 'B', ... }
  tf: {}, // { 1: { a: true, b: false, c: true, d: false }, ... }
  sa: {}  // { 1: '9.8', ... }
}

export function renderHomeworkSolverView() {
  const hw = state.currentHomework?.homework
  const questions = state.currentHomework?.questions || []

  if (!hw) {
    return `
      <div class="app-layout">
        ${renderSidebar('homework-attempt')}
        <div class="main-content">
          ${renderNavbar('Nền tảng / Bảng điều khiển')}
          <div class="content-body" style="padding:40px; text-align:center; color:#64748b;">
            <i class="fa-solid fa-triangle-exclamation" style="font-size:48px; color:#ef4444; margin-bottom:16px;"></i>
            <h2 style="font-weight:700; color:#0f172a; margin-bottom:8px;">Không tìm thấy bài tập</h2>
            <p>Vui lòng quay lại danh sách lớp học và chọn một bài tập hợp lệ.</p>
          </div>
        </div>
      </div>
    `
  }

  const attemptsCount = state.currentHomework?.attemptsCount || 0
  const maxAttempts = hw.maxAttempts || hw.max_attempts || 0
  const deadline = hw.deadline || hw.deadline_at || null

  const isExpired = deadline ? new Date() > new Date(deadline) : false
  const isExceeded = (maxAttempts > 0 && attemptsCount >= maxAttempts)

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
              <button class="btn-primary" onclick="window.location.hash = '#my-classes'" style="padding:10px 24px; font-size:14px; cursor:pointer;">
                <i class="fa-solid fa-arrow-left"></i> Quay lại danh sách lớp học
              </button>
            </div>
          </div>
        </div>
      </div>
    `
  }

  // Reset studentAnswers structure for this homework
  studentAnswers = {
    mc: {},
    tf: {},
    sa: {}
  }

  // Separate questions by type
  const mcQuestions = questions.filter(q => (q.question_type || q.questionType) === 'MULTIPLE_CHOICE')
  const tfQuestions = questions.filter(q => (q.question_type || q.questionType) === 'TRUE_FALSE')
  const saQuestions = questions.filter(q => (q.question_type || q.questionType) === 'SHORT_ANSWER')

  // Populate defaults
  questions.forEach(q => {
    const qNum = q.question_number || q.questionNumber
    const type = q.question_type || q.questionType
    if (type === 'MULTIPLE_CHOICE') {
      studentAnswers.mc[qNum] = null
    } else if (type === 'TRUE_FALSE') {
      studentAnswers.tf[qNum] = {}
    } else if (type === 'SHORT_ANSWER') {
      studentAnswers.sa[qNum] = ''
    }
  })

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
                  <i class="fa-solid fa-file-pdf" style="color:#ef4444; font-size:18px; flex-shrink:0;"></i>
                  <span style="overflow:hidden; text-overflow:ellipsis; white-space:nowrap;">${hw.pdfPath || 'De_Bai_Kiem_Tra.pdf'}</span>
                </div>
                <div style="display:flex; align-items:center; gap:8px; flex-wrap:nowrap; flex-shrink:0;">
                  <div class="pdf-controls-slot" style="display:flex; align-items:center; flex-shrink:0;"></div>
                  ${hw.pdfUrl ? `
                    <a href="${(hw.pdfUrl || '').replace(/https?:\/\/kong:8000/, import.meta.env.VITE_SUPABASE_URL || 'http://localhost:54321')}" download="${hw.pdfPath || 'De_Bai_Kiem_Tra.pdf'}" target="_blank" rel="noopener noreferrer" class="btn-secondary" style="padding:6px 14px; font-size:13px; font-weight:600; background:#eff6ff; color:#0066cc; border:1px solid #bfdbfe; border-radius:8px; display:inline-flex; align-items:center; gap:6px; text-decoration:none; flex-shrink:0; cursor:pointer;" title="Tải file PDF bài tập về máy">
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
                    <span class="badge" style="background:#e0f2fe; color:#0369a1; font-weight:700;">PHIẾU ĐIỀN ĐÁP ÁN</span>
                    <h3 style="font-family:var(--font-heading); font-size:18px; font-weight:700; margin-top:4px;">${hw.title}</h3>
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
                      ${mcQuestions.map(q => {
                        const qNum = q.question_number
                        const selected = studentAnswers.mc[qNum] || null
                        return `
                          <div style="display:flex; align-items:center; justify-content:space-between; padding:8px 12px; background:#f8fafc; border:1px solid #e2e8f0; border-radius:10px;">
                            <span style="font-weight:700; font-size:13px; color:#334155; width:54px;">Câu ${qNum}</span>
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
                      ${tfQuestions.map(q => {
                        const qNum = q.question_number
                        const tfObj = studentAnswers.tf[qNum] || {}
                        return `
                          <div style="background:#f8fafc; border:1px solid #e2e8f0; border-radius:10px; padding:10px;">
                            <div style="font-weight:700; font-size:13px; color:#0f172a; margin-bottom:8px;">Câu ${qNum}</div>
                            <div style="display:grid; grid-template-columns:1fr 1fr; gap:6px;">
                              ${['a', 'b', 'c', 'd'].map(sub => {
                                const val = tfObj[sub]
                                return `
                                  <div style="display:flex; items-center; justify-content:space-between; background:#ffffff; padding:4px 8px; border-radius:6px; border:1px solid #e2e8f0; font-size:12px;">
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
                      ${saQuestions.map(q => {
                        const qNum = q.question_number
                        const val = studentAnswers.sa[qNum] || ''
                        return `
                          <div style="display:flex; align-items:center; justify-content:space-between; padding:8px 12px; background:#f8fafc; border:1px solid #e2e8f0; border-radius:10px;">
                            <span style="font-weight:700; font-size:13px; color:#334155; width:54px;">Câu ${qNum}</span>
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

  // Render PDF using PDF.js for 100% smooth touch scrolling on Real Mobile/iPad
  const pdfContainer = document.querySelector('.pdf-iframe-wrapper')
  if (pdfContainer && hw.pdfUrl) {
    const mappedUrl = (hw.pdfUrl || '').replace(/https?:\/\/kong:8000/, import.meta.env.VITE_SUPABASE_URL || 'http://localhost:54321')
    renderPdfViewer(pdfContainer, mappedUrl)
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
      const type = q.question_type || q.questionType
      if (type === 'MULTIPLE_CHOICE') {
        return {
          questionId: q.id,
          givenAnswer: {
            type: 'MULTIPLE_CHOICE',
            value: studentAnswers.mc[qNum] || null
          }
        }
      } else if (type === 'TRUE_FALSE') {
        const tfObj = studentAnswers.tf[qNum] || {}
        const valObj = {}
        if (tfObj.a !== undefined) valObj.a = tfObj.a
        if (tfObj.b !== undefined) valObj.b = tfObj.b
        if (tfObj.c !== undefined) valObj.c = tfObj.c
        if (tfObj.d !== undefined) valObj.d = tfObj.d
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
            value: studentAnswers.sa[qNum] || ''
          }
        }
      }
    })
  }

  // Shared submit helper
  const performSubmit = async () => {
    try {
      showToast('Đang gửi bài làm lên máy chủ chấm điểm...', 'info')
      
      const submissionAnswers = buildSubmissionAnswers()


      const totalDurationSeconds = (hw.durationMinutes || 45) * 60
      const durationSecondsTaken = Math.max(0, totalDurationSeconds - timeLeftSeconds)

      const payload = {
        homeworkId: hw.id,
        answers: submissionAnswers,
        durationSecondsTaken
      }
      if (hw.type === 'EXAM' && examSessionToken) {
        payload.sessionToken = examSessionToken
      }

      const result = await api.submitHomework(payload)
      
      showToast('Nộp bài thành công! Đang tải kết quả chấm điểm...', 'success')
      
      // Save result details to state for review page if needed
      state.lastSubmissionResult = result
      
      window.location.hash = '#assignment-review'
    } catch (err) {
      showToast(`Nộp bài thất bại: ${err.message}`, 'error')
    }
  }

  // Timer Countdown Setup
  let timeLeftSeconds = (hw.durationMinutes || 45) * 60
  let timerInterval = null

  const startTimer = () => {
    const timerDisplay = document.getElementById('exam-timer-display')
    if (timerInterval) clearInterval(timerInterval)

    timerInterval = setInterval(() => {
      if (timeLeftSeconds <= 0) {
        clearInterval(timerInterval)
        showToast('Hết thời gian làm bài! Hệ thống tự động nộp bài...', 'warning')
        performSubmit()
        return
      }

      timeLeftSeconds--

      if (timeLeftSeconds === 300) {
        showToast('Thời gian làm bài của bạn còn lại 5 phút!', 'warning')
      }

      const minutes = Math.floor(timeLeftSeconds / 60)
      const seconds = timeLeftSeconds % 60
      if (timerDisplay) {
        timerDisplay.textContent = `${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`
        if (timeLeftSeconds <= 300) {
          timerDisplay.style.color = '#ef4444'
          timerDisplay.style.fontWeight = '700'
        }
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

  // EXAM MODE tracking & instructions popup
  if (hw.type === 'EXAM') {
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


  // Student MC click
  document.querySelectorAll('.student-mc-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      const qNum = parseInt(btn.getAttribute('data-qnum'), 10)
      const opt = btn.getAttribute('data-option')

      if (studentAnswers.mc[qNum] === opt) {
        studentAnswers.mc[qNum] = null
      } else {
        studentAnswers.mc[qNum] = opt
      }

      document.querySelectorAll(`.student-mc-btn[data-qnum="${qNum}"]`).forEach(b => {
        const isSel = b.getAttribute('data-option') === studentAnswers.mc[qNum]
        b.style.background = isSel ? '#0066cc' : '#ffffff'
        b.style.color = isSel ? '#ffffff' : '#334155'
        b.style.borderColor = isSel ? '#0066cc' : '#cbd5e1'
      })
    })
  })

  // Student TF click
  document.querySelectorAll('.student-tf-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      const qNum = parseInt(btn.getAttribute('data-qnum'), 10)
      const sub = btn.getAttribute('data-sub')
      const val = btn.getAttribute('data-val') === 'true'

      if (!studentAnswers.tf[qNum]) studentAnswers.tf[qNum] = {}
      
      if (studentAnswers.tf[qNum][sub] === val) {
        delete studentAnswers.tf[qNum][sub]
      } else {
        studentAnswers.tf[qNum][sub] = val
      }

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

  // Student SA input change
  document.querySelectorAll('.student-sa-input').forEach(input => {
    input.addEventListener('input', (e) => {
      const qNum = parseInt(input.getAttribute('data-qnum'), 10)
      studentAnswers.sa[qNum] = e.target.value
    })
  })

  // Submit Homework Event
  document.getElementById('submit-answers-btn')?.addEventListener('click', () => {
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
  })
}
