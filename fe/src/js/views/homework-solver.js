import { renderSidebar, bindSidebarEvents } from '../components/sidebar.js'
import { renderNavbar } from '../components/navbar.js'
import { showToast } from '../components/toast.js'
import { state } from '../state.js'
import { api } from '../api.js'
import { openModal } from '../components/modal.js'

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

  if (isExpired || isExceeded) {
    let warningTitle = "Bài tập đã bị khóa"
    let warningMsg = ""
    if (isExpired) {
      warningTitle = "Bài tập đã quá hạn nộp"
      const dateStr = new Date(deadline).toLocaleString('vi-VN')
      warningMsg = `Hạn chót của bài tập này là <strong>${dateStr}</strong>. Bạn không thể tiếp tục thực hiện bài tập này.`
    } else if (isExceeded) {
      warningTitle = "Đạt giới hạn số lần làm bài"
      warningMsg = `Bài tập này chỉ cho phép làm tối đa <strong>${maxAttempts}</strong> lần. Bạn đã thực hiện <strong>${attemptsCount}</strong> lần.`
    }

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
          <div class="split-homework-layout">
            
            <!-- LEFT COLUMN: PDF VIEWER (LARGER PORTION ~60%) -->
            <div class="pdf-viewer-container" style="box-shadow: 0 4px 12px rgba(0,0,0,0.05); border:1px solid #cbd5e1; display:flex; flex-direction:column; overflow:hidden;">
              <div class="pdf-toolbar">
                <div style="font-weight:700; color:#0f172a; display:flex; align-items:center; gap:8px;">
                  <i class="fa-solid fa-file-pdf" style="color:#ef4444; font-size:18px;"></i>
                  <span>${hw.pdfPath || 'De_Bai_Kiem_Tra.pdf'}</span>
                </div>
              </div>

              <!-- PDF Iframe Preview -->
              <div style="flex-grow: 1; display: flex; height: calc(100vh - 180px);">
                <iframe src="${(hw.pdfUrl || '').replace(/https?:\/\/kong:8000/, import.meta.env.VITE_SUPABASE_URL || 'http://localhost:54321')}" style="width: 100%; height: 100%; border: none; background:#f8fafc;"></iframe>
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

  const attemptsCount = state.currentHomework?.attemptsCount || 0
  const maxAttempts = hw.maxAttempts || hw.max_attempts || 0
  const deadline = hw.deadline || hw.deadline_at || null

  const isExpired = deadline ? new Date() > new Date(deadline) : false
  const isExceeded = (maxAttempts > 0 && attemptsCount >= maxAttempts)

  if (isExpired || isExceeded) return

  // Shared submit helper
  const performSubmit = async () => {
    try {
      showToast('Đang gửi bài làm lên máy chủ chấm điểm...', 'info')
      
      // Build answers array in format expected by backend validator submittedAnswerItemSchema
      const submissionAnswers = questions.map(q => {
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

      const totalDurationSeconds = (hw.durationMinutes || 45) * 60
      const durationSecondsTaken = Math.max(0, totalDurationSeconds - timeLeftSeconds)

      const result = await api.submitHomework({
        homeworkId: hw.id,
        answers: submissionAnswers,
        durationSecondsTaken
      })
      
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

  // Cleanup handler for route changes to clear interval
  const hashChangeListener = () => {
    if (timerInterval) {
      clearInterval(timerInterval)
    }
    window.removeEventListener('hashchange', hashChangeListener)
  }
  window.addEventListener('hashchange', hashChangeListener)

  // Start the timer countdown automatically on page load
  startTimer()


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
