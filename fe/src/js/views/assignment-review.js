import { renderSidebar, bindSidebarEvents } from '../components/sidebar.js'
import { renderNavbar } from '../components/navbar.js'
import { state } from '../state.js'

export function renderAssignmentReviewView() {
  const result = state.lastSubmissionResult
  if (!result) {
    return `
      <div class="app-layout">
        ${renderSidebar('history')}
        <div class="main-content">
          ${renderNavbar('Nền tảng / Bảng điều khiển')}
          <div class="content-body" style="padding:40px; text-align:center; color:#64748b;">
            <i class="fa-solid fa-square-poll-vertical" style="font-size:48px; color:#64748b; margin-bottom:16px;"></i>
            <h2 style="font-weight:700; color:#0f172a; margin-bottom:8px;">Chưa có kết quả làm bài</h2>
            <p>Vui lòng nộp bài để xem kết quả đánh giá chi tiết.</p>
          </div>
        </div>
      </div>
    `
  }

  const sub = result.submission || {
    id: result.submissionId,
    homeworkTitle: result.homeworkTitle,
    score: result.score,
    maxScore: result.maxScore,
    passScore: result.passScore,
    correctCount: result.correctCount,
    wrongCount: result.wrongCount,
    submittedAt: result.submittedAt,
    isLate: result.isLate,
    pdfUrl: result.pdfUrl
  }

  const pdfUrl = sub.pdfUrl || result.pdfUrl || ''
  
  const answers = result.questionReview ? result.questionReview.map(q => ({
    is_correct: q.isCorrect,
    score_earned: q.scoreEarned,
    given_answer: q.givenAnswer,
    correct_answer: q.correctAnswerSummary,
    statementGrades: q.statementGrades,
    questions: {
      question_number: q.questionNumber,
      question_type: q.questionType,
      prompt: q.prompt,
      points: q.pointsPossible
    }
  })) : (result.answers || [])

  // Sort answers by question number ascending to fix out-of-order display bug
  const sortedAnswers = [...answers].sort((a, b) => {
    const numA = a.questions?.question_number || 0
    const numB = b.questions?.question_number || 0
    return numA - numB
  })

  const percentage = Math.round((sub.score / (sub.maxScore || 10)) * 100)
  const isPassed = sub.score >= (sub.passScore || 5)

  // Calculate scores for each section (multiple choice, true/false, short answer)
  let mcEarned = 0, mcPossible = 0
  let tfEarned = 0, tfPossible = 0
  let saEarned = 0, saPossible = 0

  sortedAnswers.forEach(ans => {
    const qType = ans.questions?.question_type
    const score = ans.score_earned !== undefined ? ans.score_earned : (ans.scoreEarned || 0)
    const points = ans.questions?.points !== undefined ? ans.questions.points : 1

    if (qType === 'MULTIPLE_CHOICE') {
      mcEarned += score
      mcPossible += points
    } else if (qType === 'TRUE_FALSE') {
      tfEarned += score
      tfPossible += points
    } else if (qType === 'SHORT_ANSWER') {
      saEarned += score
      saPossible += points
    }
  })

  const formatScore = (val) => Number(Number(val).toFixed(2))

  return `
    <div class="app-layout">
      ${renderSidebar('history')}
      <div class="main-content">
        ${renderNavbar('Nền tảng / Bảng điều khiển')}
        <div class="content-body">
          <div class="page-header">
            <div>
              <h1 class="page-title">Xem lại kết quả bài tập</h1>
              <p class="page-description">${sub.homeworkTitle}</p>
            </div>
            <div style="display:flex; gap:10px; align-items:center; flex-shrink:0;">
              ${pdfUrl ? `
                <button id="toggle-pdf-btn" class="btn-primary" style="display:inline-flex; align-items:center; gap:8px; font-size:14px; padding:10px 16px; border-radius:8px; background:#0066cc; color:#ffffff; font-weight:600; cursor:pointer; border:none; white-space:nowrap;">
                  <i class="fa-solid fa-file-pdf"></i> Xem đề bài (PDF)
                </button>
                <a id="download-pdf-btn" href="${pdfUrl}" download target="_blank" class="btn-secondary" style="display:none; align-items:center; gap:8px; font-size:14px; padding:10px 16px; border-radius:8px; border:1px solid #cbd5e1; background:#ffffff; color:#334155; font-weight:600; cursor:pointer; text-decoration:none; white-space:nowrap;">
                  <i class="fa-solid fa-download"></i> Tải file PDF
                </a>
              ` : ''}
              <button class="btn-secondary" onclick="window.location.hash='${state.user?.role === 'ADMIN' ? '#admin-history' : '#history'}'" style="cursor:pointer; white-space:nowrap;">
                <i class="fa-solid fa-arrow-left"></i> Quay lại lịch sử
              </button>
            </div>
          </div>

          <!-- Top Overview Banner -->
          <div id="overview-banner-card" class="card" style="display:flex; flex-direction:column; gap:20px; background:linear-gradient(135deg, #ffffff 0%, #f8fafc 100%); border:1px solid #e2e8f0; border-radius:16px; padding:24px;">
            <div style="display:flex; justify-content:space-between; align-items:center; flex-wrap:wrap; gap:16px;">
              <div style="display:flex; align-items:center; gap:12px; flex-wrap:wrap;">
                <div class="badge ${isPassed ? 'badge-graded' : 'badge-failed'}" style="font-size:13px; background:${isPassed ? '#dcfce7' : '#fee2e2'}; color:${isPassed ? '#15803d' : '#b91c1c'}; border:none; padding:8px 16px; border-radius:8px; font-weight:700;">
                  <i class="fa-solid ${isPassed ? 'fa-circle-check' : 'fa-circle-xmark'}"></i> ${isPassed ? 'Đã Đạt! Chúc mừng bạn đã hoàn thành bài tập.' : 'Chưa Đạt. Hãy cố gắng luyện tập thêm.'}
                </div>
                ${(sub.isLate || sub.is_late || result.isLate) ? `
                  <div style="font-size:13px; background:#fef3c7; color:#b45309; border:1px solid #fde68a; padding:8px 16px; border-radius:8px; font-weight:700; display:inline-flex; align-items:center; gap:6px;">
                    <i class="fa-solid fa-clock-rotate-left"></i> Nộp muộn
                  </div>
                ` : ''}
              </div>
              
              <!-- Total Score prominently displayed -->
              <div style="display:flex; align-items:center; gap:12px; background:#f0f9ff; border:1px solid #bae6fd; padding:8px 18px; border-radius:10px;">
                <span style="font-size:13px; color:#0369a1; font-weight:700; text-transform:uppercase; letter-spacing:0.5px;">Tổng Điểm Số:</span>
                <strong style="font-size:24px; color:#0284c7; font-family:var(--font-heading);">${formatScore(sub.score)} <span style="font-size:15px; color:#0284c7; font-weight:600;">/ ${formatScore(sub.maxScore || 10)}</span></strong>
              </div>
            </div>

            <!-- Divider -->
            <div style="height:1px; background:#e2e8f0; width:100%;"></div>

            <div style="display:flex; justify-content:space-between; align-items:center; flex-wrap:wrap; gap:24px;">
              <!-- Score breakdown by section -->
              <div style="display:flex; gap:16px; flex-wrap:wrap;">
                ${mcPossible > 0 ? `
                  <div style="background:#f8fafc; padding:8px 16px; border-radius:8px; border:1px solid #e2e8f0; display:flex; flex-direction:column; gap:4px; min-width:140px;">
                    <span style="font-size:11px; font-weight:700; color:#64748b; text-transform:uppercase;">Trắc nghiệm</span>
                    <strong style="font-size:15px; color:#1e293b;">${formatScore(mcEarned)} / ${formatScore(mcPossible)}đ</strong>
                  </div>
                ` : ''}
                ${tfPossible > 0 ? `
                  <div style="background:#f8fafc; padding:8px 16px; border-radius:8px; border:1px solid #e2e8f0; display:flex; flex-direction:column; gap:4px; min-width:140px;">
                    <span style="font-size:11px; font-weight:700; color:#64748b; text-transform:uppercase;">Đúng / Sai</span>
                    <strong style="font-size:15px; color:#1e293b;">${formatScore(tfEarned)} / ${formatScore(tfPossible)}đ</strong>
                  </div>
                ` : ''}
                ${saPossible > 0 ? `
                  <div style="background:#f8fafc; padding:8px 16px; border-radius:8px; border:1px solid #e2e8f0; display:flex; flex-direction:column; gap:4px; min-width:140px;">
                    <span style="font-size:11px; font-weight:700; color:#64748b; text-transform:uppercase;">Trả lời ngắn</span>
                    <strong style="font-size:15px; color:#1e293b;">${formatScore(saEarned)} / ${formatScore(saPossible)}đ</strong>
                  </div>
                ` : ''}
              </div>

              <!-- Question counts (Correct / Wrong) -->
              <div style="display:flex; gap:24px; background:#fafafa; border:1px solid #f0f0f0; padding:10px 20px; border-radius:10px;">
                <div style="text-align:center;">
                  <div style="font-size:11px; color:#16a34a; font-weight:700; text-transform:uppercase;"><i class="fa-solid fa-circle-check"></i> Đúng</div>
                  <strong style="font-size:18px; color:#15803d; font-family:var(--font-heading);">${sub.correctCount} câu</strong>
                </div>
                <div style="width:1px; background:#e5e5e5; height:30px; align-self:center;"></div>
                <div style="text-align:center;">
                  <div style="font-size:11px; color:#dc2626; font-weight:700; text-transform:uppercase;"><i class="fa-solid fa-circle-xmark"></i> Sai</div>
                  <strong style="font-size:18px; color:#b91c1c; font-family:var(--font-heading);">${sub.wrongCount} câu</strong>
                </div>
              </div>
            </div>
          </div>

          <!-- Main Layout Wrapper with transition -->
          <div id="review-layout-wrapper" style="display: grid; grid-template-columns: 1fr; gap: 24px; transition: all 0.3s ease;">
            
            <!-- PDF Preview Pane (Initially hidden) -->
            <div id="pdf-preview-pane" style="display: none; height: calc(100vh - 240px); position: sticky; top: 90px; z-index: 10;">
              <iframe id="pdf-preview-iframe" src="" style="width:100%; height:100%; border:1px solid #cbd5e1; border-radius:12px; box-shadow: 0 4px 12px rgba(0,0,0,0.08);"></iframe>
            </div>

            <!-- Content Pane -->
            <div id="content-pane" style="display: flex; flex-direction: column; gap: 24px;">
              <div id="questions-grid" class="grid-3">
            <div style="grid-column: span 2; display:flex; flex-direction:column; gap:16px;">
              ${sortedAnswers.map(ans => {
                const qNum = ans.questions?.question_number || 1
                const isCorrect = ans.is_correct !== undefined ? ans.is_correct : ans.isCorrect
                const qTypeStr = ans.questions?.question_type === 'MULTIPLE_CHOICE' ? 'TRẮC NGHIỆM' : (ans.questions?.question_type === 'TRUE_FALSE' ? 'ĐÚNG/SAI' : 'TRẢ LỜI NGẮN')
                const scoreEarned = ans.score_earned !== undefined ? ans.score_earned : ans.scoreEarned
                const pointsPossible = ans.questions?.points || 1
                const givenAnswer = ans.given_answer !== undefined ? ans.given_answer : ans.givenAnswer
                const qType = ans.questions?.question_type

                let cardBorderColor = '#ef4444'
                let badgeBg = '#fee2e2'
                let badgeColor = '#dc2626'
                let badgeIcon = 'fa-xmark'

                if (isCorrect) {
                  cardBorderColor = '#10b981'
                  badgeBg = '#dcfce7'
                  badgeColor = '#16a34a'
                  badgeIcon = 'fa-check'
                } else if (scoreEarned > 0) {
                  cardBorderColor = '#f59e0b'
                  badgeBg = '#fef3c7'
                  badgeColor = '#d97706'
                  badgeIcon = 'fa-triangle-exclamation'
                }
                
                let givenStr = ''
                if (givenAnswer?.type === 'TRUE_FALSE') {
                  const val = givenAnswer?.value || {}
                  const renderVal = (v) => v === true ? 'Đ' : (v === false ? 'S' : '_')
                  givenStr = `a: ${renderVal(val.a)}, b: ${renderVal(val.b)}, c: ${renderVal(val.c)}, d: ${renderVal(val.d)}`
                } else {
                  givenStr = givenAnswer?.value !== null && givenAnswer?.value !== undefined && givenAnswer?.value !== '' ? String(givenAnswer.value) : 'Không trả lời'
                }

                let correctStr = ''
                const corrKey = ans.correct_answer || ans.questions?.question_answers
                
                if (qType === 'MULTIPLE_CHOICE') {
                  correctStr = corrKey?.mc_answer || corrKey || 'A'
                } else if (qType === 'TRUE_FALSE') {
                  const val = corrKey?.tf_answers || corrKey || {}
                  const a = val.a !== undefined ? val.a : val.s1
                  const b = val.b !== undefined ? val.b : val.s2
                  const c = val.c !== undefined ? val.c : val.s3
                  const d = val.d !== undefined ? val.d : val.s4
                  correctStr = `a: ${a ? 'Đ' : 'S'}, b: ${b ? 'Đ' : 'S'}, c: ${c ? 'Đ' : 'S'}, d: ${d ? 'Đ' : 'S'}`
                } else {
                  const val = corrKey?.sa_answer !== undefined && corrKey?.sa_answer !== null 
                    ? corrKey.sa_answer 
                    : (corrKey?.answer !== undefined && corrKey?.answer !== null ? corrKey.answer : corrKey)
                  correctStr = val !== undefined && val !== null ? String(val) : 'Chưa có'
                }

                let reviewBody = ''
                if (qType === 'TRUE_FALSE') {
                  const tfObj = givenAnswer?.value || {}
                  const corrKeyVal = corrKey?.tf_answers || corrKey || {}
                  const correctA = corrKeyVal.a !== undefined ? corrKeyVal.a : corrKeyVal.s1
                  const correctB = corrKeyVal.b !== undefined ? corrKeyVal.b : corrKeyVal.s2
                  const correctC = corrKeyVal.c !== undefined ? corrKeyVal.c : corrKeyVal.s3
                  const correctD = corrKeyVal.d !== undefined ? corrKeyVal.d : corrKeyVal.s4
                  const correctMap = { a: correctA, b: correctB, c: correctC, d: correctD }

                  let statementGrades = ans.statementGrades || ans.questions?.statementGrades
                  if (!statementGrades && correctMap.a !== undefined) {
                    statementGrades = {
                      a: tfObj.a === correctMap.a,
                      b: tfObj.b === correctMap.b,
                      c: tfObj.c === correctMap.c,
                      d: tfObj.d === correctMap.d
                    }
                  }
                  if (!statementGrades) {
                    statementGrades = {}
                  }

                  const tfReviewHtml = ['a', 'b', 'c', 'd'].map(sub => {
                    const studentVal = tfObj[sub]
                    const isStmtCorrect = statementGrades[sub] === true
                    const displayVal = studentVal !== undefined ? (studentVal ? 'Đúng (Đ)' : 'Sai (S)') : 'Không trả lời'
                    const correctValText = correctMap[sub] !== undefined ? (correctMap[sub] ? 'Đ' : 'S') : ''

                    return `
                      <div style="display:flex; flex-direction:column; gap:4px; padding:10px; background:${isStmtCorrect ? '#f0fdf4' : '#fef2f2'}; border:1px solid ${isStmtCorrect ? '#10b981' : '#ef4444'}; border-radius:8px; font-size:13px;">
                        <div style="display:flex; justify-content:space-between; align-items:center;">
                          <span style="font-weight:700; color:#334155;">Ý ${sub.toUpperCase()}:</span>
                          <span style="font-weight:700; color:${isStmtCorrect ? '#15803d' : '#b91c1c'}; display:flex; align-items:center; gap:4px;">
                            <i class="fa-solid ${isStmtCorrect ? 'fa-circle-check' : 'fa-circle-xmark'}"></i>
                            ${displayVal}
                          </span>
                        </div>
                        ${(state.user?.role === 'ADMIN' && correctValText) ? `
                          <div style="font-size:11px; color:#475569; border-top:1px dashed #cbd5e1; margin-top:4px; padding-top:4px;">
                            Đáp án đúng: <strong style="color:#15803d;">${correctValText}</strong>
                          </div>
                        ` : ''}
                      </div>
                    `
                  }).join('')

                  reviewBody = `
                    <div style="display:grid; grid-template-columns:1fr 1fr; gap:10px;">
                      ${tfReviewHtml}
                    </div>
                  `
                } else {
                  reviewBody = `
                    <div style="display:flex; flex-direction:column; gap:10px;">
                      <div style="display:flex; justify-content:space-between; align-items:center; padding:12px 16px; background:${isCorrect ? '#f0fdf4' : '#fef2f2'}; border:1px solid ${isCorrect ? '#10b981' : '#ef4444'}; border-radius:10px;">
                        <div style="display:flex; align-items:center; gap:10px; font-weight:600; color:${isCorrect ? '#15803d' : '#b91c1c'}; font-size:14px;">
                          <i class="fa-solid ${isCorrect ? 'fa-circle-check' : 'fa-circle-xmark'}"></i> Đáp án của bạn: ${givenStr}
                        </div>
                      </div>
                      ${(!isCorrect && state.user?.role === 'ADMIN') ? `
                        <div style="display:flex; justify-content:space-between; align-items:center; padding:12px 16px; background:#f0fdf4; border:1px solid #10b981; border-radius:10px;">
                          <div style="display:flex; align-items:center; gap:10px; font-weight:600; color:#15803d; font-size:14px;">
                            <i class="fa-solid fa-circle-check"></i> Đáp án đúng: ${correctStr}
                          </div>
                        </div>
                      ` : ''}
                    </div>
                  `
                }

                return `
                  <div class="card" style="border-left:4px solid ${cardBorderColor}; margin-bottom: 0;">
                    <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:12px;">
                      <div>
                        <span class="question-badge" style="background:${cardBorderColor}; color:#ffffff; padding:4px 8px; border-radius:6px; font-weight:700; margin-right:8px;">${qNum}</span>
                        <span style="font-size:12px; font-weight:700; color:#64748b; text-transform:uppercase;">${qTypeStr}</span>
                      </div>
                      ${qType === 'TRUE_FALSE' ? `
                        <span class="badge" style="background:${badgeBg}; color:${badgeColor}; border:none; padding:4px 8px; border-radius:6px; font-weight:700; font-size:12px;">
                          <i class="fa-solid ${badgeIcon}"></i> ${scoreEarned} / ${pointsPossible} điểm
                        </span>
                      ` : ''}
                    </div>

                    <div style="font-size:15px; font-weight:600; color:#0f172a; margin-bottom:12px;">
                      Câu hỏi số ${qNum}
                    </div>

                    ${reviewBody}
                  </div>
                `
              }).join('')}
            </div>

            <!-- Right Column: Question Navigator -->
            <div>
              <div class="card">
                <h3 style="font-family:var(--font-heading); font-size:16px; font-weight:700; margin-bottom:12px;">Sơ đồ câu hỏi</h3>
                
                <div class="question-nav-grid" style="display:grid; grid-template-columns: repeat(5, 1fr); gap:8px;">
                  ${sortedAnswers.map(ans => {
                    const qNum = ans.questions?.question_number || 1
                    const isCorrect = ans.is_correct !== undefined ? ans.is_correct : ans.isCorrect
                    const scoreEarned = ans.score_earned !== undefined ? ans.score_earned : (ans.scoreEarned || 0)

                    let navBg = '#fee2e2'
                    let navColor = '#dc2626'
                    let navBorder = '#ef4444'

                    if (isCorrect) {
                      navBg = '#dcfce7'
                      navColor = '#16a34a'
                      navBorder = '#10b981'
                    } else if (scoreEarned > 0) {
                      navBg = '#fef3c7'
                      navColor = '#d97706'
                      navBorder = '#f59e0b'
                    }

                    return `
                      <div class="nav-grid-item" style="
                        background:${navBg}; 
                        color:${navColor}; 
                        border: 1px solid ${navBorder};
                        width: 36px; height: 36px; border-radius: 8px; display: flex; align-items: center; justify-content: center; font-weight: 700; font-size: 13px;
                      ">${qNum}</div>
                    `
                  }).join('')}
                </div>

                <div style="display:flex; flex-direction:column; gap:8px; margin-top:16px; font-size:12px;">
                  <div style="display:flex; align-items:center; gap:6px;">
                    <div style="width:12px; height:12px; background:#dcfce7; border: 1px solid #10b981; border-radius:3px;"></div> Đúng hoàn toàn
                  </div>
                  <div style="display:flex; align-items:center; gap:6px;">
                    <div style="width:12px; height:12px; background:#fef3c7; border: 1px solid #f59e0b; border-radius:3px;"></div> Đúng một phần
                  </div>
                  <div style="display:flex; align-items:center; gap:6px;">
                    <div style="width:12px; height:12px; background:#fee2e2; border: 1px solid #ef4444; border-radius:3px;"></div> Sai hoàn toàn
                  </div>
                </div>
              </div>

              <!-- Refresher Card -->
              <div class="card" style="background:#0066cc; color:#ffffff; text-align:center;">
                <h3 style="font-family:var(--font-heading); font-size:17px; font-weight:700; margin-bottom:8px;">Cần ôn tập thêm?</h3>
                <p style="font-size:13px; opacity:0.9; margin-bottom:16px;">
                  Quay lại giao diện học để ôn tập kỹ lý thuyết và bài tập.
                </p>
                <button class="btn-secondary" style="width:100%; border:none; color:#0066cc; font-weight:700; cursor:pointer;" onclick="window.location.hash='#my-classes'">
                  Đến trang lớp học
                </button>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  `
}

export function bindAssignmentReviewEvents() {
  bindSidebarEvents()

  const togglePdfBtn = document.getElementById('toggle-pdf-btn')
  const downloadPdfBtn = document.getElementById('download-pdf-btn')
  const pdfPane = document.getElementById('pdf-preview-pane')
  const pdfIframe = document.getElementById('pdf-preview-iframe')
  const wrapper = document.getElementById('review-layout-wrapper')
  const questionsGrid = document.getElementById('questions-grid')
  const overviewBanner = document.getElementById('overview-banner-card')

  if (togglePdfBtn && pdfPane && pdfIframe && wrapper) {
    const rawPdfUrl = state.lastSubmissionResult?.submission?.pdfUrl || state.lastSubmissionResult?.pdfUrl || ''
    const pdfUrl = rawPdfUrl.replace(/https?:\/\/kong:8000/g, import.meta.env.VITE_SUPABASE_URL || 'http://localhost:54321')

    togglePdfBtn.onclick = () => {
      const isHidden = pdfPane.style.display === 'none'
      if (isHidden) {
        // Show PDF side-by-side
        pdfIframe.src = `${pdfUrl}#toolbar=0`
        pdfPane.style.display = 'block'
        if (overviewBanner) overviewBanner.style.display = 'none'
        if (downloadPdfBtn) downloadPdfBtn.style.display = 'inline-flex'
        
        // Split page to 1.3fr (PDF) and 1fr (Questions & Navigation stacked)
        wrapper.style.gridTemplateColumns = '1.3fr 1fr'
        if (questionsGrid) {
          questionsGrid.style.gridTemplateColumns = '1fr'
          questionsGrid.style.gap = '20px'
          // Make the columns inside questionsGrid stack
          const cols = questionsGrid.children
          if (cols[0]) cols[0].style.gridColumn = 'span 1'
        }
        togglePdfBtn.innerHTML = `<i class="fa-solid fa-eye-slash"></i> Ẩn đề bài`
        togglePdfBtn.style.background = '#64748b'
      } else {
        // Hide PDF
        pdfPane.style.display = 'none'
        pdfIframe.src = ''
        if (overviewBanner) overviewBanner.style.display = 'flex'
        if (downloadPdfBtn) downloadPdfBtn.style.display = 'none'
        
        // Restore layout
        wrapper.style.gridTemplateColumns = '1fr'
        if (questionsGrid) {
          questionsGrid.style.gridTemplateColumns = '2fr 1fr'
          questionsGrid.style.gap = '24px'
          const cols = questionsGrid.children
          if (cols[0]) cols[0].style.gridColumn = 'span 2'
        }
        togglePdfBtn.innerHTML = `<i class="fa-solid fa-file-pdf"></i> Xem đề bài (PDF)`
        togglePdfBtn.style.background = '#0066cc'
      }
    }
  }
}
