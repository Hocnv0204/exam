import { renderSidebar, bindSidebarEvents } from '../components/sidebar.js'
import { renderNavbar } from '../components/navbar.js'
import { state } from '../state.js'
import { renderPdfViewer } from '../components/pdf-viewer.js'

export function renderAssignmentReviewView() {
  const isTrial = window.location.hash.includes('trial=true') || !state.token
  let result = state.lastSubmissionResult
  if (!result && isTrial) {
    try {
      const cached = sessionStorage.getItem('last_trial_submission')
      if (cached) {
        result = JSON.parse(cached)
        state.lastSubmissionResult = result
      }
    } catch (e) {}
  }

  if (!result) {
    return `
      <div class="app-layout">
        ${renderSidebar(isTrial ? 'trial' : 'history')}
        <div class="main-content">
          ${renderNavbar(isTrial ? 'Học thử / Kết quả đánh giá' : 'Nền tảng / Bảng điều khiển')}
          <div class="content-body" style="padding:40px; text-align:center; color:#64748b;">
            <i class="fa-solid fa-square-poll-vertical" style="font-size:48px; color:#64748b; margin-bottom:16px;"></i>
            <h2 style="font-weight:700; color:#0f172a; margin-bottom:8px;">Chưa có kết quả làm bài</h2>
            <p>Vui lòng nộp bài để xem kết quả đánh giá chi tiết.</p>
            <button class="btn-primary" onclick="window.location.hash = '${isTrial ? '#trial' : '#my-classes'}'" style="padding:10px 24px; font-size:14px; cursor:pointer; margin-top:16px;">
              <i class="fa-solid fa-arrow-left"></i> ${isTrial ? 'Quay lại bài học thử' : 'Quay lại lớp học'}
            </button>
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

  // Determine active structure
  const totalQuestions = sortedAnswers.length
  const mcCount = sortedAnswers.filter(a => (a.questions?.question_type || a.questionType) === 'MULTIPLE_CHOICE').length
  const tfCount = sortedAnswers.filter(a => (a.questions?.question_type || a.questionType) === 'TRUE_FALSE').length
  const saCount = sortedAnswers.filter(a => (a.questions?.question_type || a.questionType) === 'SHORT_ANSWER').length

  const isAllMC = mcCount === totalQuestions && totalQuestions > 0
  const isStructureB = mcCount === 12 && tfCount === 4 && saCount === 6
  const isStructureC = mcCount === 18 && tfCount === 4 && saCount === 6

  let calculatedScore = Number(sub.score)
  if (isAllMC && totalQuestions > 0 && sub.correctCount !== undefined) {
    calculatedScore = Math.round((Number(sub.correctCount) / totalQuestions) * 10 * 10) / 10
  }

  const maxScore = Number(sub.maxScore || 10)
  const isPassed = calculatedScore >= (sub.passScore || 5)

  // Calculate scores for each section (multiple choice, true/false, short answer)
  let mcEarned = 0, mcPossible = 0
  let tfEarned = 0, tfPossible = 0
  let saEarned = 0, saPossible = 0

  if (isAllMC) {
    mcEarned = calculatedScore
    mcPossible = maxScore
  } else if (isStructureB) {
    sortedAnswers.forEach(ans => {
      const qType = ans.questions?.question_type || ans.questionType
      const score = ans.score_earned !== undefined ? Number(ans.score_earned) : (Number(ans.scoreEarned) || 0)
      if (qType === 'MULTIPLE_CHOICE') mcEarned += score
      else if (qType === 'TRUE_FALSE') tfEarned += score
      else if (qType === 'SHORT_ANSWER') saEarned += score
    })
    mcPossible = 3.0
    tfPossible = 4.0
    saPossible = 3.0
  } else if (isStructureC) {
    sortedAnswers.forEach(ans => {
      const qType = ans.questions?.question_type || ans.questionType
      const score = ans.score_earned !== undefined ? Number(ans.score_earned) : (Number(ans.scoreEarned) || 0)
      if (qType === 'MULTIPLE_CHOICE') mcEarned += score
      else if (qType === 'TRUE_FALSE') tfEarned += score
      else if (qType === 'SHORT_ANSWER') saEarned += score
    })
    mcPossible = 4.5
    tfPossible = 4.0
    saPossible = 1.5
  } else {
    sortedAnswers.forEach(ans => {
      const qType = ans.questions?.question_type || ans.questionType
      const score = ans.score_earned !== undefined ? Number(ans.score_earned) : (Number(ans.scoreEarned) || 0)
      let points = ans.pointsPossible !== undefined && ans.pointsPossible !== null ? Number(ans.pointsPossible) : (ans.questions?.points || 1)
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
  }

  const formatScore = (val) => Number(Number(val).toFixed(2))

  let mcLabel = 'Trắc nghiệm'
  if (isAllMC) {
    const ptPerQ = totalQuestions > 0 ? (10 / totalQuestions) : 0.25
    mcLabel = `Trắc nghiệm (${formatScore(ptPerQ)}đ/câu)`
  } else if (isStructureB || isStructureC) {
    mcLabel = 'Trắc nghiệm (0.25đ/câu)'
  }

  let tfLabel = 'Đúng / Sai (1đ/câu)'
  let saLabel = isStructureC ? 'Trả lời ngắn (0.25đ/câu)' : 'Trả lời ngắn (0.5đ/câu)'

  return `
    <div class="app-layout">
      ${renderSidebar(isTrial ? 'trial' : 'history')}
      <div class="main-content">
        ${renderNavbar(isTrial ? 'Học thử / Kết quả đánh giá' : 'Nền tảng / Bảng điều khiển')}
        <div class="content-body">
          <div class="page-header">
            <div>
              <h1 class="page-title">${isTrial ? 'Kết quả làm bài học thử' : 'Xem lại kết quả bài tập'}</h1>
              <p class="page-description">${sub.homeworkTitle}</p>
            </div>
            <div style="display:flex; gap:10px; align-items:center; flex-shrink:0;">
              ${state.user?.role === 'ADMIN' && sub.homeworkTitle ? `
                <button id="view-exam-logs-btn" class="btn-secondary" style="display:inline-flex; align-items:center; gap:8px; font-size:14px; padding:10px 16px; border-radius:8px; border:1px solid #fecaca; background:#fef2f2; color:#dc2626; font-weight:600; cursor:pointer; white-space:nowrap;">
                  <i class="fa-solid fa-shield-cat"></i> Xem nhật ký vi phạm
                </button>
                <button id="reopen-submission-btn" class="btn-primary" style="display:inline-flex; align-items:center; gap:8px; font-size:14px; padding:10px 16px; border-radius:8px; background:#f59e0b; color:#ffffff; font-weight:600; cursor:pointer; border:none; white-space:nowrap;">
                  <i class="fa-solid fa-rotate-left"></i> Khôi phục bài thi
                </button>
              ` : ''}
              ${pdfUrl ? `
                <button id="toggle-pdf-btn" class="btn-primary" style="display:inline-flex; align-items:center; gap:8px; font-size:14px; padding:10px 16px; border-radius:8px; background:#0066cc; color:#ffffff; font-weight:600; cursor:pointer; border:none; white-space:nowrap;">
                  <i class="fa-solid fa-file-pdf"></i> Xem đề bài (PDF)
                </button>
                <a id="download-pdf-btn" href="${pdfUrl}" download target="_blank" class="btn-secondary" style="display:none; align-items:center; gap:8px; font-size:14px; padding:10px 16px; border-radius:8px; border:1px solid #cbd5e1; background:#ffffff; color:#334155; font-weight:600; cursor:pointer; text-decoration:none; white-space:nowrap;">
                  <i class="fa-solid fa-download"></i> Tải file PDF
                </a>
              ` : ''}
              <button class="btn-secondary" onclick="window.location.hash='${isTrial ? '#trial' : (state.user?.role === 'ADMIN' ? '#admin-history' : '#history')}'" style="cursor:pointer; white-space:nowrap;">
                <i class="fa-solid fa-arrow-left"></i> ${isTrial ? 'Quay lại bài học thử' : 'Quay lại lịch sử'}
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
                <strong style="font-size:24px; color:#0284c7; font-family:var(--font-heading);">${formatScore(calculatedScore)} <span style="font-size:15px; color:#0284c7; font-weight:600;">/ ${formatScore(maxScore)}</span></strong>
              </div>
            </div>

            <!-- Divider -->
            <div style="height:1px; background:#e2e8f0; width:100%;"></div>

            <div style="display:flex; justify-content:space-between; align-items:center; flex-wrap:wrap; gap:24px;">
              <!-- Score breakdown by section -->
              <div style="display:flex; gap:16px; flex-wrap:wrap;">
                ${mcPossible > 0 ? `
                  <div style="background:#f8fafc; padding:8px 16px; border-radius:8px; border:1px solid #e2e8f0; display:flex; flex-direction:column; gap:4px; min-width:140px;">
                    <span style="font-size:11px; font-weight:700; color:#64748b; text-transform:uppercase;">${mcLabel}</span>
                    <strong style="font-size:15px; color:#1e293b;">${formatScore(mcEarned)} / ${formatScore(mcPossible)}đ</strong>
                  </div>
                ` : ''}
                ${tfPossible > 0 ? `
                  <div style="background:#f8fafc; padding:8px 16px; border-radius:8px; border:1px solid #e2e8f0; display:flex; flex-direction:column; gap:4px; min-width:140px;">
                    <span style="font-size:11px; font-weight:700; color:#64748b; text-transform:uppercase;">${tfLabel}</span>
                    <strong style="font-size:15px; color:#1e293b;">${formatScore(tfEarned)} / ${formatScore(tfPossible)}đ</strong>
                  </div>
                ` : ''}
                ${saPossible > 0 ? `
                  <div style="background:#f8fafc; padding:8px 16px; border-radius:8px; border:1px solid #e2e8f0; display:flex; flex-direction:column; gap:4px; min-width:140px;">
                    <span style="font-size:11px; font-weight:700; color:#64748b; text-transform:uppercase;">${saLabel}</span>
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
          <div id="exam-logs-container" style="margin-bottom: 24px;"></div>

          <!-- Main Layout Wrapper with transition -->
          <div id="review-layout-wrapper" style="display: grid; grid-template-columns: 1fr; gap: 24px; transition: all 0.3s ease;">
            
            <!-- PDF Preview Pane (Initially hidden) -->
            <div id="pdf-preview-pane" class="pdf-viewer-container" style="display: none;">
              <div class="pdf-toolbar" style="display:flex; justify-content:space-between; align-items:center; width:100%; flex-wrap:nowrap; gap:10px; background:#ffffff; padding:8px 14px; border-bottom:1px solid #e2e8f0; border-radius:12px 12px 0 0; box-sizing:border-box; flex-shrink:0;">
                <div style="font-weight:700; color:#0f172a; display:flex; align-items:center; gap:8px; overflow:hidden; text-overflow:ellipsis; white-space:nowrap; min-width:0; flex:1 1 auto; font-size:13px;">
                  <i class="fa-solid fa-file-pdf" style="color:#ef4444; font-size:16px; flex-shrink:0;"></i>
                  <span style="overflow:hidden; text-overflow:ellipsis; white-space:nowrap;" title="${sub.homeworkTitle || 'Đề bài'}">${sub.homeworkTitle || 'Đề bài PDF'}</span>
                </div>
                <div class="pdf-controls-slot" style="display:flex; align-items:center; flex-shrink:0;"></div>
              </div>
              <div id="pdf-canvas-container" style="flex:1; width:100%; height:100%; min-height:0; overflow:hidden; position:relative;"></div>
            </div>

            <!-- Content Pane (Student Answers) -->
            <div id="content-pane" style="display: flex; flex-direction: column; gap: 20px;">
              <!-- Compact summary bar visible only in split mode -->
              <div class="card review-compact-summary" style="padding: 12px 16px; margin-bottom: 0; background: #f8fafc; border: 1px solid #e2e8f0; justify-content: space-between; align-items: center; border-radius: 10px; flex-shrink: 0; flex-wrap: wrap; gap: 8px;">
                <div style="display: flex; align-items: center; gap: 8px;">
                  <span class="badge ${isPassed ? 'badge-graded' : 'badge-failed'}" style="font-size: 11px; padding: 4px 10px; font-weight: 700;">
                    ${isPassed ? 'ĐÃ ĐẠT' : 'CHƯA ĐẠT'}
                  </span>
                  <span style="font-size: 12px; color: #64748b;">
                    Đúng: <strong style="color: #15803d;">${sub.correctCount}</strong> | Sai: <strong style="color: #b91c1c;">${sub.wrongCount}</strong>
                  </span>
                </div>
                <strong style="font-size: 16px; color: #0284c7; font-family: var(--font-heading);">
                  ${formatScore(calculatedScore)} / ${formatScore(maxScore)} điểm
                </strong>
              </div>

              <div id="questions-grid" class="grid-3">
            <div style="grid-column: span 2; display:flex; flex-direction:column; gap:16px;">
              ${sortedAnswers.map(ans => {
                const qNum = ans.questions?.question_number || 1
                const isCorrect = ans.is_correct !== undefined ? ans.is_correct : ans.isCorrect
                const qType = ans.questions?.question_type || ans.questionType
                const qTypeStr = qType === 'MULTIPLE_CHOICE' ? 'TRẮC NGHIỆM' : (qType === 'TRUE_FALSE' ? 'ĐÚNG/SAI' : 'TRẢ LỜI NGẮN')
                let pointsPossible = ans.pointsPossible
                if (isAllMC) {
                  pointsPossible = totalQuestions > 0 ? (10 / totalQuestions) : 0.25
                } else if (isStructureB) {
                  if (qType === 'MULTIPLE_CHOICE') pointsPossible = 0.25
                  else if (qType === 'TRUE_FALSE') pointsPossible = 1.0
                  else if (qType === 'SHORT_ANSWER') pointsPossible = 0.5
                } else if (isStructureC) {
                  if (qType === 'MULTIPLE_CHOICE') pointsPossible = 0.25
                  else if (qType === 'TRUE_FALSE') pointsPossible = 1.0
                  else if (qType === 'SHORT_ANSWER') pointsPossible = 0.25
                } else if (pointsPossible === undefined || pointsPossible === null) {
                  pointsPossible = ans.questions?.points || 1
                }

                let scoreEarned = ans.score_earned !== undefined ? Number(ans.score_earned) : (Number(ans.scoreEarned) || 0)
                if (isAllMC) {
                  scoreEarned = isCorrect ? pointsPossible : 0
                }

                const givenAnswer = ans.given_answer !== undefined ? ans.given_answer : ans.givenAnswer

                let cardBorderColor = '#ef4444'
                let badgeBg = '#fee2e2'
                let badgeColor = '#dc2626'
                let badgeIcon = 'fa-xmark'

                if (isCorrect || scoreEarned >= pointsPossible) {
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
                const corrKey = ans.correct_answer || ans.correctAnswerSummary || ans.questions?.question_answers
                
                if (qType === 'MULTIPLE_CHOICE') {
                  correctStr = corrKey?.mc_answer || corrKey || ''
                } else if (qType === 'TRUE_FALSE') {
                  const val = corrKey?.tf_answers || corrKey || {}
                  const a = val.a !== undefined ? val.a : val.s1
                  const b = val.b !== undefined ? val.b : val.s2
                  const c = val.c !== undefined ? val.c : val.s3
                  const d = val.d !== undefined ? val.d : val.s4
                  if (a !== undefined || b !== undefined || c !== undefined || d !== undefined) {
                    correctStr = `a: ${a ? 'Đ' : 'S'}, b: ${b ? 'Đ' : 'S'}, c: ${c ? 'Đ' : 'S'}, d: ${d ? 'Đ' : 'S'}`
                  }
                } else {
                  const val = corrKey?.sa_answer !== undefined && corrKey?.sa_answer !== null 
                    ? corrKey.sa_answer 
                    : (corrKey?.answer !== undefined && corrKey?.answer !== null ? corrKey.answer : corrKey)
                  correctStr = val !== undefined && val !== null ? String(val) : ''
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
                    if (isCorrect || scoreEarned >= pointsPossible) {
                      statementGrades = { a: true, b: true, c: true, d: true }
                    } else {
                      statementGrades = {}
                    }
                  }

                  const tfReviewHtml = ['a', 'b', 'c', 'd'].map(sub => {
                    const studentVal = tfObj[sub]
                    const isStmtCorrect = statementGrades[sub] === true || (isCorrect && studentVal !== undefined)
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
                      ${(state.user?.role === 'ADMIN' && !isCorrect && correctStr) ? `
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
                  <div class="card review-question-card" id="review-question-${qNum}" style="border-left:4px solid ${cardBorderColor}; margin-bottom: 0; scroll-margin-top: 14px;">
                    <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:12px;">
                      <div>
                        <span class="question-badge" style="background:${cardBorderColor}; color:#ffffff; padding:4px 8px; border-radius:6px; font-weight:700; margin-right:8px;">${qNum}</span>
                        <span style="font-size:12px; font-weight:700; color:#64748b; text-transform:uppercase;">${qTypeStr}</span>
                      </div>
                      <span class="badge" style="background:${badgeBg}; color:${badgeColor}; border:none; padding:4px 8px; border-radius:6px; font-weight:700; font-size:12px;">
                        <i class="fa-solid ${badgeIcon}"></i> ${formatScore(scoreEarned)} / ${formatScore(pointsPossible)} điểm
                      </span>
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
                      <div class="nav-grid-item" data-qnum="${qNum}" style="
                        background:${navBg}; 
                        color:${navColor}; 
                        border: 1px solid ${navBorder};
                        width: 36px; height: 36px; border-radius: 8px; display: flex; align-items: center; justify-content: center; font-weight: 700; font-size: 13px; cursor: pointer; user-select: none; transition: transform 0.15s;
                      " title="Xem câu ${qNum}">${qNum}</div>
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
              <div class="card" style="background:${isTrial ? 'linear-gradient(135deg, #0284c7 0%, #0369a1 100%)' : '#0066cc'}; color:#ffffff; text-align:center;">
                <h3 style="font-family:var(--font-heading); font-size:17px; font-weight:700; margin-bottom:8px;">${isTrial ? 'Trải nghiệm thêm' : 'Cần ôn tập thêm?'}</h3>
                <p style="font-size:13px; opacity:0.9; margin-bottom:16px;">
                  ${isTrial ? 'Xem các bài học thử khác hoặc đăng nhập để tham gia khóa học chính thức.' : 'Quay lại giao diện học để ôn tập kỹ lý thuyết và bài tập.'}
                </p>
                <button class="btn-secondary" style="width:100%; border:none; color:#0066cc; background:#ffffff; font-weight:700; cursor:pointer;" onclick="window.location.hash='${isTrial ? '#trial' : '#my-classes'}'">
                  ${isTrial ? 'Danh sách học thử' : 'Đến trang lớp học'}
                </button>
              </div>
            </div>
          </div>

          ${isTrial ? `
            <!-- Trial Lead CTA Banner -->
            <div style="background: linear-gradient(135deg, #1e3a8a 0%, #0284c7 100%); color: #ffffff; padding: 24px; border-radius: 16px; margin-top: 24px; display: flex; align-items: center; justify-content: space-between; flex-wrap: wrap; gap: 16px; box-shadow: 0 10px 25px -5px rgba(2, 132, 199, 0.3);">
              <div>
                <h3 style="font-size: 18px; font-weight: 700; margin: 0 0 6px 0; color: #ffffff;">Bạn muốn tham gia lộ trình học tập đầy đủ?</h3>
                <p style="font-size: 14px; margin: 0; color: #e0f2fe;">Đăng ký tài khoản ngay để truy cập toàn bộ ngân hàng đề thi ôn luyện, xem video bài giảng chuyên sâu và nhận báo cáo tiến độ chi tiết.</p>
              </div>
              <div style="display: flex; gap: 12px; align-items: center; flex-wrap: wrap;">
                <button class="btn-secondary" onclick="window.location.hash='#trial'" style="background: rgba(255,255,255,0.15); border: 1px solid rgba(255,255,255,0.3); color: #ffffff; padding: 10px 18px; border-radius: 8px; font-weight: 600; cursor: pointer;">
                  <i class="fa-solid fa-sparkles"></i> Bài học thử khác
                </button>
                <button class="btn-primary" onclick="window.location.hash='#login'" style="background: #f59e0b; border: none; color: #ffffff; padding: 10px 20px; border-radius: 8px; font-weight: 700; cursor: pointer; box-shadow: 0 4px 12px rgba(245, 158, 11, 0.4);">
                  <i class="fa-solid fa-user-plus"></i> Đăng ký / Đăng nhập ngay
                </button>
              </div>
            </div>
          ` : ''}

        </div>
      </div>
    </div>
  `
}

export function bindAssignmentReviewEvents() {
  bindSidebarEvents()

  // Fetch and display exam logs if user is admin
  const logsContainer = document.getElementById('exam-logs-container')
  const viewLogsBtn = document.getElementById('view-exam-logs-btn')

  const subData = state.lastSubmissionResult?.submission || {}
  const hwId = state.lastSubmissionResult?.homeworkId || subData.homeworkId || subData.homework_id
  const studentId = state.lastSubmissionResult?.studentId || subData.studentId || subData.student_id || subData.student?.id

  if (state.user?.role === 'ADMIN' && hwId) {
    const maxV = subData.maxViolations || subData.max_violations || subData.homework?.maxViolations || subData.homework?.max_violations || 3
    import('../api.js').then(({ api }) => {
      api.getExamLogs(hwId).then(logs => {
        const studentLogs = (logs || []).filter(l => l.student_id === studentId || l.studentId === studentId)
        
        if (logsContainer && studentLogs.length > 0) {
          const violationCount = studentLogs.filter(l => l.action !== 'RETURN_TAB').length
          logsContainer.innerHTML = `
            <div style="background:#fef2f2; border:1px solid #fecaca; border-radius:12px; padding:16px; margin-top:16px;">
              <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:12px;">
                <h4 style="color:#dc2626; font-weight:700; margin:0; display:flex; align-items:center; gap:8px; font-size:14px;">
                  <i class="fa-solid fa-shield-cat" style="font-size:18px;"></i> NHẬT KÝ GIÁM SÁT VI PHẠM (Phát hiện ${violationCount}/${maxV} lượt vi phạm)
                </h4>
                <span style="font-size:12px; font-weight:600; color:#991b1b; background:#fee2e2; padding:3px 10px; border-radius:20px;">
                  ${violationCount} / ${maxV} vi phạm
                </span>
              </div>
              <div style="display:flex; flex-direction:column; gap:8px; max-height:180px; overflow-y:auto; padding-right:4px;">
                ${studentLogs.map((l, idx) => {
                  const timeStr = new Date(l.created_at).toLocaleString('vi-VN')
                  let actionBadge = ''
                  if (l.action === 'LEAVE_TAB') actionBadge = '<span style="color:#ef4444; font-weight:700;"><i class="fa-solid fa-up-right-from-square"></i> Rời khỏi màn hình làm bài</span>'
                  else if (l.action === 'RETURN_TAB') actionBadge = '<span style="color:#059669; font-weight:600;"><i class="fa-solid fa-rotate-left"></i> Quay lại màn hình làm bài</span>'
                  else if (l.action === 'LEAVE_EXAM') actionBadge = '<span style="color:#991b1b; font-weight:700;"><i class="fa-solid fa-door-open"></i> Bấm thoát phòng thi</span>'
                  else if (l.action === 'COPY') actionBadge = '<span style="color:#d97706; font-weight:600;"><i class="fa-solid fa-copy"></i> Cố gắng sao chép đề thi</span>'
                  else if (l.action === 'PASTE') actionBadge = '<span style="color:#d97706; font-weight:600;"><i class="fa-solid fa-paste"></i> Thao tác dán nội dung</span>'
                  else actionBadge = `<span style="font-weight:600;">${l.action}</span>`

                  return `
                    <div style="display:flex; justify-content:space-between; align-items:center; background:#ffffff; border:1px solid #fecaca; padding:8px 12px; border-radius:8px; font-size:12px;">
                      <div>
                        <span style="color:#94a3b8; font-weight:700; margin-right:8px;">#${studentLogs.length - idx}</span>
                        ${actionBadge}
                      </div>
                      <div style="color:#64748b; font-size:11px;"><i class="fa-regular fa-clock"></i> ${timeStr}</div>
                    </div>
                  `
                }).join('')}
              </div>
            </div>
          `
        }

        if (viewLogsBtn) {
          viewLogsBtn.onclick = async () => {
            const { openModal } = await import('../components/modal.js')
            if (!studentLogs || studentLogs.length === 0) {
              openModal(
                'NHẬT KÝ GIÁM SÁT VI PHẠM',
                `<div style="text-align:center; padding:24px;">
                   <i class="fa-solid fa-circle-check" style="font-size:48px; color:#16a34a; margin-bottom:16px;"></i>
                   <h3 style="font-size:16px; font-weight:700; color:#0f172a; margin-bottom:8px;">Học sinh làm bài nghiêm túc!</h3>
                   <p style="font-size:13px; color:#64748b; margin:0;">Quá trình làm bài thi không phát hiện bất kỳ hành vi vi phạm quy chế nào (rời tab, sao chép,...).</p>
                 </div>`
              )
              return
            }

            const violationCount = studentLogs.filter(l => l.action !== 'RETURN_TAB').length

            const modalBody = `
              <div style="display:flex; flex-direction:column; gap:16px;">
                <div style="display:flex; justify-content:space-between; align-items:center; background:#fef2f2; border:1px solid #fee2e2; padding:14px 16px; border-radius:12px;">
                  <div style="display:flex; align-items:center; gap:12px;">
                    <i class="fa-solid fa-shield-cat" style="font-size:28px; color:#ef4444;"></i>
                    <div>
                      <div style="font-weight:700; font-size:14px; color:#991b1b;">Nhật ký giám sát bài thi chính thức</div>
                      <div style="font-size:12px; color:#b91c1c;">Tổng số lượt vi phạm ghi nhận: <strong>${violationCount} / ${maxV} lần</strong></div>
                    </div>
                  </div>
                </div>

                <div style="display:flex; flex-direction:column; gap:8px; max-height:360px; overflow-y:auto; padding-right:4px;">
                  ${studentLogs.map((l, idx) => {
                    const timeStr = new Date(l.created_at).toLocaleString('vi-VN')
                    let actionBadge = ''
                    if (l.action === 'LEAVE_TAB') actionBadge = '<span style="color:#ef4444; font-weight:700;"><i class="fa-solid fa-up-right-from-square"></i> Rời khỏi màn hình thi (Chuyển tab / Cửa sổ)</span>'
                    else if (l.action === 'RETURN_TAB') actionBadge = '<span style="color:#059669; font-weight:600;"><i class="fa-solid fa-rotate-left"></i> Quay lại màn hình thi</span>'
                    else if (l.action === 'LEAVE_EXAM') actionBadge = '<span style="color:#991b1b; font-weight:700;"><i class="fa-solid fa-door-open"></i> Bấm thoát phòng thi</span>'
                    else if (l.action === 'COPY') actionBadge = '<span style="color:#d97706; font-weight:600;"><i class="fa-solid fa-copy"></i> Cố gắng sao chép đề thi</span>'
                    else if (l.action === 'PASTE') actionBadge = '<span style="color:#d97706; font-weight:600;"><i class="fa-solid fa-paste"></i> Thao tác dán nội dung</span>'
                    else actionBadge = `<span style="font-weight:600;">${l.action}</span>`

                    return `
                      <div style="display:flex; justify-content:space-between; align-items:center; padding:10px 14px; background:#f8fafc; border:1px solid #e2e8f0; border-radius:8px; font-size:13px;">
                        <div>
                          <span style="color:#94a3b8; font-weight:700; margin-right:8px;">#${studentLogs.length - idx}</span>
                          ${actionBadge}
                        </div>
                        <div style="color:#64748b; font-size:12px; white-space:nowrap;"><i class="fa-regular fa-clock"></i> ${timeStr}</div>
                      </div>
                    `
                  }).join('')}
                </div>
              </div>
            `
            openModal('Chi tiết nhật ký vi phạm', modalBody)
          }
        }
      }).catch(err => console.error("Failed to fetch exam logs", err))
    })
  }

  // Admin Reopen Submission feature
  const reopenBtn = document.getElementById('reopen-submission-btn')
  if (reopenBtn && state.user?.role === 'ADMIN' && state.lastSubmissionResult?.submission) {
    reopenBtn.onclick = () => {
      import('../components/modal.js').then(({ openModal }) => {
        const bodyHtml = `
          <div style="display:flex; flex-direction:column; gap:16px;">
            <p style="font-size:14px; color:#475569; margin:0; line-height:1.5;">
              Hành động này sẽ đưa bài thi về trạng thái "Đang làm" và học sinh có thể tiếp tục làm bài. 
              Bài nộp cũ sẽ được lưu trữ lại.
            </p>
            <div style="display:flex; flex-direction:column; gap:10px;">
              <label style="display:flex; align-items:center; gap:8px; font-size:14px; color:#1e293b; cursor:pointer;">
                <input type="checkbox" id="reopen-reset-timer" style="width:16px; height:16px;" checked>
                Thiết lập lại thời gian làm bài (đếm lại từ đầu)
              </label>
              <label style="display:flex; align-items:center; gap:8px; font-size:14px; color:#1e293b; cursor:pointer;">
                <input type="checkbox" id="reopen-reset-answers" style="width:16px; height:16px;" checked>
                Xóa các đáp án đã chọn (làm lại từ đầu)
              </label>
            </div>
          </div>
        `
        openModal('Khôi phục bài thi', bodyHtml, async () => {
          const resetTimer = document.getElementById('reopen-reset-timer')?.checked || false
          const resetAnswers = document.getElementById('reopen-reset-answers')?.checked || false
          const hwId = state.lastSubmissionResult.submission.homeworkId || state.lastSubmissionResult.homeworkId
          const studentId = state.lastSubmissionResult.studentId
          
          if (!hwId || !studentId) {
             import('../components/toast.js').then(({ showToast }) => showToast('Không tìm thấy thông tin bài thi.', 'error'))
             return true
          }
          
          try {
             const { api } = await import('../api.js')
             await api.reopenSubmission(hwId, studentId, resetTimer, resetAnswers)
             import('../components/toast.js').then(({ showToast }) => showToast('Đã khôi phục bài thi thành công.', 'success'))
             setTimeout(() => {
                window.location.hash = '#admin-history'
             }, 1000)
          } catch(e) {
             import('../components/toast.js').then(({ showToast }) => showToast(e.message || 'Lỗi khi khôi phục bài thi', 'error'))
          }
          return true
        })
      })
    }
  }

  // Clean up split mode when navigating away
  const cleanupSplitMode = () => {
    document.body.classList.remove('review-split-mode')
  }
  window.addEventListener('hashchange', cleanupSplitMode, { once: true })

  // Question navigator click-to-scroll
  document.querySelectorAll('.nav-grid-item').forEach(item => {
    item.addEventListener('click', () => {
      const qNum = item.getAttribute('data-qnum')
      const target = document.getElementById(`review-question-${qNum}`)
      if (target) {
        target.scrollIntoView({ behavior: 'smooth', block: 'start' })
      }
    })
  })

  const togglePdfBtn = document.getElementById('toggle-pdf-btn')
  const downloadPdfBtn = document.getElementById('download-pdf-btn')
  const pdfPane = document.getElementById('pdf-preview-pane')
  const pdfCanvasContainer = document.getElementById('pdf-canvas-container')
  const wrapper = document.getElementById('review-layout-wrapper')
  const overviewBanner = document.getElementById('overview-banner-card')

  if (togglePdfBtn && pdfPane && wrapper) {
    const rawPdfUrl = state.lastSubmissionResult?.submission?.pdfUrl || state.lastSubmissionResult?.pdfUrl || ''
    const pdfUrl = rawPdfUrl.replace(/https?:\/\/kong:8000/g, import.meta.env.VITE_SUPABASE_URL || 'http://localhost:54321')

    togglePdfBtn.onclick = () => {
      const isSplitActive = wrapper.classList.contains('split-review-active')
      if (!isSplitActive) {
        // Activate split review mode with 2 independent scroll areas
        wrapper.classList.add('split-review-active')
        document.body.classList.add('review-split-mode')
        pdfPane.style.display = 'flex'
        const targetContainer = pdfCanvasContainer || pdfPane
        renderPdfViewer(targetContainer, pdfUrl)
        if (overviewBanner) overviewBanner.style.display = 'none'
        if (downloadPdfBtn) downloadPdfBtn.style.display = 'inline-flex'
        
        togglePdfBtn.innerHTML = `<i class="fa-solid fa-eye-slash"></i> Ẩn đề bài`
        togglePdfBtn.style.background = '#64748b'
      } else {
        // Deactivate split review mode, restore full page
        wrapper.classList.remove('split-review-active')
        document.body.classList.remove('review-split-mode')
        pdfPane.style.display = 'none'
        if (pdfCanvasContainer) pdfCanvasContainer.innerHTML = ''
        else pdfPane.innerHTML = ''
        if (overviewBanner) overviewBanner.style.display = 'flex'
        if (downloadPdfBtn) downloadPdfBtn.style.display = 'none'
        
        togglePdfBtn.innerHTML = `<i class="fa-solid fa-file-pdf"></i> Xem đề bài (PDF)`
        togglePdfBtn.style.background = '#0066cc'
      }
    }
  }
}
