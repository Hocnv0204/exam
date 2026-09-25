import { renderSidebar, bindSidebarEvents } from '../components/sidebar.js'
import { renderNavbar } from '../components/navbar.js'
import { state } from '../state.js'
import { renderPdfViewer } from '../components/pdf-viewer.js'
import { renderMath, renderMarkdown } from '../utils/exam-parser.js'

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
    id: result.submissionId || result.id,
    homeworkTitle: result.homeworkTitle || result.homework?.title,
    score: result.score !== undefined ? result.score : result.total_score,
    maxScore: result.maxScore || result.max_score,
    passScore: result.passScore || result.pass_score,
    correctCount: result.correctCount || result.correct_count,
    wrongCount: result.wrongCount || result.wrong_count,
    submittedAt: result.submittedAt || result.submitted_at,
    isLate: result.isLate || result.is_late,
    pdfUrl: result.pdfUrl || result.pdf_url,
    showSolutions: result.showSolutions !== undefined ? result.showSolutions : result.show_solutions,
    student: result.student || result.profiles,
    guest_name: result.guest_name || result.guestName,
    guest_phone: result.guest_phone || result.guestPhone,
    durationSecondsTaken: result.durationSecondsTaken || result.duration_seconds_taken
  }

  const studentInfo = result.student || sub.student || sub.profiles || result.profiles || {}
  const studentName = sub.guest_name || result.guestName || sub.guestName || studentInfo.full_name || studentInfo.fullName || studentInfo.name || studentInfo.username || ''
  const studentPhone = sub.guest_phone || result.guestPhone || sub.guestPhone || studentInfo.phone || ''
  const studentClass = sub.className || result.className || sub.homeworks?.lessons?.chapters?.classes?.name || ''

  const pdfUrl = sub.pdfUrl || result.pdfUrl || ''
  const showSolutions = state.user?.role === 'ADMIN' || (result.showSolutions !== false && result.show_solutions !== false && sub.showSolutions !== false && sub.show_solutions !== false)
  
  const rawAnswers = result.questionReview ? result.questionReview.map(q => ({
    is_correct: q.isCorrect !== undefined ? q.isCorrect : q.is_correct,
    score_earned: q.scoreEarned !== undefined ? q.scoreEarned : q.score_earned,
    given_answer: q.givenAnswer !== undefined ? q.givenAnswer : q.given_answer,
    correct_answer: q.correctAnswerSummary !== undefined ? q.correctAnswerSummary : q.correct_answer,
    statementGrades: q.statementGrades,
    questionNumber: q.questionNumber !== undefined ? q.questionNumber : q.question_number,
    questions: {
      question_number: q.questionNumber !== undefined ? q.questionNumber : q.question_number,
      question_type: q.questionType || q.question_type,
      prompt: q.prompt,
      content: q.content,
      options: q.options,
      statements: q.statements,
      part_title: q.partTitle || q.part_title,
      explanation: q.explanation,
      points: q.pointsPossible || q.points
    }
  })) : (result.answers || [])

  const answers = rawAnswers.map((ans, idx) => {
    const qObj = Array.isArray(ans.questions) ? ans.questions[0] : (ans.questions || {})
    const qNum = qObj.question_number !== undefined ? qObj.question_number : (ans.questionNumber !== undefined ? ans.questionNumber : (ans.question_number !== undefined ? ans.question_number : (idx + 1)))
    const qType = qObj.question_type || ans.questionType || ans.question_type || 'MULTIPLE_CHOICE'
    const prompt = qObj.prompt !== undefined ? qObj.prompt : (ans.prompt !== undefined ? ans.prompt : '')
    const content = qObj.content !== undefined ? qObj.content : (ans.content !== undefined ? ans.content : '')
    const options = qObj.options || ans.options || null
    const statements = qObj.statements || ans.statements || null
    const partTitle = qObj.part_title || qObj.partTitle || ans.partTitle || ans.part_title || null
    const explanation = qObj.explanation || ans.explanation || null
    const points = qObj.points || ans.pointsPossible || ans.points || 1

    return {
      ...ans,
      is_correct: ans.is_correct !== undefined ? ans.is_correct : ans.isCorrect,
      score_earned: ans.score_earned !== undefined ? ans.score_earned : ans.scoreEarned,
      given_answer: ans.given_answer !== undefined ? ans.given_answer : ans.givenAnswer,
      correct_answer: ans.correct_answer !== undefined ? ans.correct_answer : ans.correctAnswerSummary,
      statementGrades: ans.statementGrades || qObj.statementGrades || ans.given_answer?.statementGrades || ans.givenAnswer?.statementGrades,
      rawQuestionNumber: Number(qNum) || (idx + 1),
      questions: {
        question_number: Number(qNum) || (idx + 1),
        question_type: qType,
        prompt,
        content,
        options,
        statements,
        part_title: partTitle,
        explanation,
        points
      }
    }
  })

  // Sort answers by question number ascending to fix out-of-order display bug
  const sortedAnswers = [...answers].sort((a, b) => {
    const numA = a.rawQuestionNumber || a.questions?.question_number || 0
    const numB = b.rawQuestionNumber || b.questions?.question_number || 0
    return numA - numB
  })

  // Assign type-based numbering starting at 1 for each question type
  let mcIndex = 0
  let tfIndex = 0
  let saIndex = 0

  sortedAnswers.forEach(ans => {
    const qType = ans.questions?.question_type || ans.questionType
    if (qType === 'MULTIPLE_CHOICE') {
      mcIndex++
      ans.displayNumber = mcIndex
      ans.typePrefix = 'MC'
    } else if (qType === 'TRUE_FALSE') {
      tfIndex++
      ans.displayNumber = tfIndex
      ans.typePrefix = 'TF'
    } else if (qType === 'SHORT_ANSWER') {
      saIndex++
      ans.displayNumber = saIndex
      ans.typePrefix = 'SA'
    } else {
      mcIndex++
      ans.displayNumber = mcIndex
      ans.typePrefix = 'MC'
    }
    ans.anchorId = `review-q-${ans.typePrefix}-${ans.displayNumber}`
  })

  // Section statistics
  const totalQuestions = sortedAnswers.length
  const mcCount = sortedAnswers.filter(a => (a.questions?.question_type || a.questionType) === 'MULTIPLE_CHOICE').length
  const tfCount = sortedAnswers.filter(a => (a.questions?.question_type || a.questionType) === 'TRUE_FALSE').length
  const saCount = sortedAnswers.filter(a => (a.questions?.question_type || a.questionType) === 'SHORT_ANSWER').length

  const calculatedScore = Number(sub.score ?? 0)
  const maxScore = Number(sub.maxScore || 10)
  const isPassed = calculatedScore >= (sub.passScore || 5)

  // Calculate scores for each section (multiple choice, true/false, short answer)
  let mcEarned = 0, mcPossible = 0
  let tfEarned = 0, tfPossible = 0
  let saEarned = 0, saPossible = 0

  sortedAnswers.forEach(ans => {
    const qType = ans.questions?.question_type || ans.questionType
    const score = ans.score_earned !== undefined ? Number(ans.score_earned) : (Number(ans.scoreEarned) || 0)
    const points = ans.pointsPossible !== undefined && ans.pointsPossible !== null
      ? Number(ans.pointsPossible)
      : (ans.questions?.points !== undefined && ans.questions?.points !== null ? Number(ans.questions.points) : (qType === 'TRUE_FALSE' ? 1.0 : (qType === 'SHORT_ANSWER' ? 0.5 : 0.25)))

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

  const getSectionLabel = (prefix, count, possible) => {
    if (count <= 0) return prefix
    const pt = possible / count
    return `${prefix} (${formatScore(pt)}đ/câu)`
  }

  const mcLabel = getSectionLabel('Trắc nghiệm', mcCount, mcPossible)
  const tfLabel = getSectionLabel('Đúng / Sai', tfCount, tfPossible)
  const saLabel = getSectionLabel('Trả lời ngắn', saCount, saPossible)
  const hasMultipleSections = ((mcCount > 0 ? 1 : 0) + (tfCount > 0 ? 1 : 0) + (saCount > 0 ? 1 : 0)) > 1

  const renderNavButton = (ans) => {
    const displayNum = ans.displayNumber
    const anchorId = ans.anchorId
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
      <div class="nav-grid-item" data-target-id="${anchorId}" data-qnum="${ans.rawQuestionNumber}" style="
        background:${navBg}; 
        color:${navColor}; 
        border: 1px solid ${navBorder};
        width: 36px; height: 36px; border-radius: 8px; display: flex; align-items: center; justify-content: center; font-weight: 700; font-size: 13px; cursor: pointer; user-select: none; transition: transform 0.15s;
      " title="Xem câu ${displayNum}">${displayNum}</div>
    `
  }

  const renderNavSection = (qType, title, count) => {
    if (count === 0) return ''
    const list = sortedAnswers.filter(a => (a.questions?.question_type || a.questionType) === qType)
    return `
      <div style="margin-bottom:14px;">
        <div style="font-size:11px; font-weight:700; color:#475569; text-transform:uppercase; margin-bottom:6px; display:flex; justify-content:space-between; align-items:center;">
          <span>${title}</span>
          <span style="font-size:10px; background:#f1f5f9; color:#64748b; padding:2px 6px; border-radius:4px; font-weight:700;">${count} câu</span>
        </div>
        <div class="question-nav-grid" style="display:grid; grid-template-columns: repeat(5, 1fr); gap:8px;">
          ${list.map(ans => renderNavButton(ans)).join('')}
        </div>
      </div>
    `
  }

  return `
    <div class="app-layout">
      ${renderSidebar(isTrial ? 'trial' : (state.user?.role === 'ADMIN' ? 'admin-history' : 'history'))}
      <div class="main-content">
        ${renderNavbar(isTrial ? 'Học thử / Kết quả đánh giá' : (state.user?.role === 'ADMIN' ? 'Quản trị / Chi tiết bài nộp học sinh' : 'Nền tảng / Bảng điều khiển'))}
        <div class="content-body">
          <div class="page-header">
            <div>
              <h1 class="page-title">${isTrial ? 'Kết quả làm bài học thử' : (state.user?.role === 'ADMIN' ? 'Xem lại bài làm của học sinh' : 'Xem lại kết quả bài tập')}</h1>
              <p class="page-description">${sub.homeworkTitle || 'Bài tập'}</p>
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
                <i class="fa-solid fa-arrow-left"></i> ${isTrial ? 'Quay lại bài học thử' : (state.user?.role === 'ADMIN' ? 'Quay lại danh sách nộp bài' : 'Quay lại lịch sử')}
              </button>
            </div>
          </div>

          <!-- Top Overview Banner -->
          <div id="overview-banner-card" class="card" style="display:flex; flex-direction:column; gap:20px; background:linear-gradient(135deg, #ffffff 0%, #f8fafc 100%); border:1px solid #e2e8f0; border-radius:16px; padding:24px;">
            ${(state.user?.role === 'ADMIN' && studentName) ? `
              <!-- Student Profile Banner for Admin -->
              <div style="display:flex; align-items:center; justify-content:space-between; flex-wrap:wrap; gap:12px; background:#eff6ff; border:1px solid #bfdbfe; padding:12px 18px; border-radius:12px;">
                <div style="display:flex; align-items:center; gap:12px; flex-wrap:wrap;">
                  <div style="width:36px; height:36px; border-radius:50%; background:#0284c7; color:#ffffff; display:flex; align-items:center; justify-content:center; font-size:15px;">
                    <i class="fa-solid fa-user-graduate"></i>
                  </div>
                  <div>
                    <div style="font-size:14px; font-weight:800; color:#0f172a;">
                      Học sinh: <span style="color:#0284c7;">${studentName}</span>
                    </div>
                    <div style="font-size:12px; color:#64748b; display:flex; align-items:center; gap:8px; margin-top:2px; flex-wrap:wrap;">
                      ${studentClass ? `<span><i class="fa-solid fa-graduation-cap" style="color:#0066cc;"></i> Lớp: <strong>${studentClass}</strong></span>` : ''}
                      ${studentPhone ? `<span>• <i class="fa-solid fa-phone" style="color:#64748b;"></i> ${studentPhone}</span>` : ''}
                    </div>
                  </div>
                </div>
                ${sub.submittedAt ? `
                  <div style="font-size:12px; color:#475569; background:#ffffff; padding:6px 12px; border-radius:8px; border:1px solid #cbd5e1; display:flex; align-items:center; gap:6px;">
                    <i class="fa-regular fa-clock" style="color:#0284c7;"></i> Nộp lúc: <strong>${new Date(sub.submittedAt).toLocaleString('vi-VN')}</strong>
                  </div>
                ` : ''}
              </div>
            ` : ''}

            <div style="display:flex; justify-content:space-between; align-items:center; flex-wrap:wrap; gap:16px;">
              <div style="display:flex; align-items:center; gap:12px; flex-wrap:wrap;">
                <div class="badge ${isPassed ? 'badge-graded' : 'badge-failed'}" style="font-size:13px; background:${isPassed ? '#dcfce7' : '#fee2e2'}; color:${isPassed ? '#15803d' : '#b91c1c'}; border:none; padding:8px 16px; border-radius:8px; font-weight:700;">
                  <i class="fa-solid ${isPassed ? 'fa-circle-check' : 'fa-circle-xmark'}"></i> ${isPassed ? (state.user?.role === 'ADMIN' ? 'Học sinh Đã Đạt bài tập' : 'Đã Đạt! Chúc mừng bạn đã hoàn thành bài tập.') : (state.user?.role === 'ADMIN' ? 'Học sinh Chưa Đạt bài tập' : 'Chưa Đạt. Hãy cố gắng luyện tập thêm.')}
                </div>
                ${(sub.isLate || sub.is_late || result.isLate) ? `
                  <div style="font-size:13px; background:#fef3c7; color:#b45309; border:1px solid #fde68a; padding:8px 16px; border-radius:8px; font-weight:700; display:inline-flex; align-items:center; gap:6px;">
                    <i class="fa-solid fa-clock-rotate-left"></i> Nộp muộn
                  </div>
                ` : ''}
                ${!showSolutions ? `
                  <div style="font-size:13px; background:#f8fafc; color:#475569; border:1px solid #cbd5e1; padding:8px 16px; border-radius:8px; font-weight:600; display:inline-flex; align-items:center; gap:6px;">
                    <i class="fa-solid fa-eye-slash" style="color:#64748b;"></i> Ẩn đáp án & giải thích
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
              ${(() => {
                let currentSectionType = null

                return sortedAnswers.map((ans, idx) => {
                  const qNum = ans.displayNumber || (idx + 1)
                  const anchorId = ans.anchorId || `review-q-${idx + 1}`
                  const rawNum = ans.rawQuestionNumber || ans.questions?.question_number || (idx + 1)
                  const isCorrect = ans.is_correct !== undefined ? ans.is_correct : ans.isCorrect
                  const qType = ans.questions?.question_type || ans.questionType
                  const qTypeStr = qType === 'MULTIPLE_CHOICE' ? 'TRẮC NGHIỆM' : (qType === 'TRUE_FALSE' ? 'ĐÚNG/SAI' : 'TRẢ LỜI NGẮN')
                  const pointsPossible = ans.pointsPossible !== undefined && ans.pointsPossible !== null
                    ? Number(ans.pointsPossible)
                    : (ans.questions?.points !== undefined && ans.questions?.points !== null ? Number(ans.questions.points) : (qType === 'TRUE_FALSE' ? 1.0 : (qType === 'SHORT_ANSWER' ? 0.5 : 0.25)))

                  const scoreEarned = ans.score_earned !== undefined ? Number(ans.score_earned) : (Number(ans.scoreEarned) || 0)

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
                  const corrKey = ans.correct_answer || ans.correctAnswerSummary || ans.correctAnswer || ans.questions?.question_answers
                  
                  if (qType === 'MULTIPLE_CHOICE') {
                    correctStr = corrKey?.mc_answer || (typeof corrKey === 'string' ? corrKey : '') || ''
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

                  let promptObj = null
                  try {
                    const rawP = ans.questions?.prompt || ans.prompt
                    if (typeof rawP === 'string' && rawP.startsWith('{')) {
                      const parsed = JSON.parse(rawP)
                      if (parsed.isInteractive) promptObj = parsed
                    }
                  } catch (e) {}

                  const qContent = ans.questions?.content || ans.content || ans.questions?.prompt || ''
                  const qOptions = ans.questions?.options || ans.options || null
                  const qStatements = ans.questions?.statements || ans.statements || null
                  const qExplanation = ans.questions?.explanation || ans.explanation || null

                  let reviewBody = ''
                  if (qType === 'TRUE_FALSE') {
                    let tfObj = givenAnswer?.value !== undefined ? givenAnswer.value : givenAnswer
                    if (typeof tfObj === 'string') {
                      try { tfObj = JSON.parse(tfObj) } catch {}
                    }
                    tfObj = tfObj || {}

                    let corrKeyVal = corrKey?.tf_answers || corrKey || {}
                    if (typeof corrKeyVal === 'string') {
                      try { corrKeyVal = JSON.parse(corrKeyVal) } catch {}
                    }

                    const getBool = (v) => {
                      if (v === true || v === 'true' || v === 1 || v === '1') return true
                      if (v === false || v === 'false' || v === 0 || v === '0') return false
                      return undefined
                    }

                    const correctA = getBool(corrKeyVal.a !== undefined ? corrKeyVal.a : corrKeyVal.s1)
                    const correctB = getBool(corrKeyVal.b !== undefined ? corrKeyVal.b : corrKeyVal.s2)
                    const correctC = getBool(corrKeyVal.c !== undefined ? corrKeyVal.c : corrKeyVal.s3)
                    const correctD = getBool(corrKeyVal.d !== undefined ? corrKeyVal.d : corrKeyVal.s4)
                    const correctMap = { a: correctA, b: correctB, c: correctC, d: correctD }

                    let statementGrades = ans.statementGrades || ans.questions?.statementGrades || givenAnswer?.statementGrades
                    if (typeof statementGrades === 'string') {
                      try { statementGrades = JSON.parse(statementGrades) } catch {}
                    }

                    // If not present, compare student value with correct key if available
                    if (!statementGrades && (correctA !== undefined || correctB !== undefined || correctC !== undefined || correctD !== undefined)) {
                      statementGrades = {
                        a: getBool(tfObj.a !== undefined ? tfObj.a : tfObj.s1) === correctA,
                        b: getBool(tfObj.b !== undefined ? tfObj.b : tfObj.s2) === correctB,
                        c: getBool(tfObj.c !== undefined ? tfObj.c : tfObj.s3) === correctC,
                        d: getBool(tfObj.d !== undefined ? tfObj.d : tfObj.s4) === correctD
                      }
                    }

                    // Fallback for full score
                    if (!statementGrades && (isCorrect || scoreEarned >= pointsPossible)) {
                      statementGrades = { a: true, b: true, c: true, d: true }
                    }

                    let stmtList = []
                    if (Array.isArray(qStatements)) {
                      stmtList = qStatements.map((s, idx) => ({ key: s.key || ['a', 'b', 'c', 'd'][idx], text: s.text || String(s) }))
                    } else if (typeof qStatements === 'object' && qStatements) {
                      stmtList = ['a', 'b', 'c', 'd'].map(k => ({ key: k, text: qStatements[k] || '' }))
                    }

                    const tfReviewHtml = ['a', 'b', 'c', 'd'].map(sub => {
                      const studentRaw = tfObj[sub] !== undefined ? tfObj[sub] : tfObj[`s${sub === 'a' ? 1 : sub === 'b' ? 2 : sub === 'c' ? 3 : 4}`]
                      const studentVal = getBool(studentRaw)
                      const isStmtCorrect = statementGrades ? (statementGrades[sub] === true) : (isCorrect && studentVal !== undefined)
                      const displayVal = studentVal !== undefined ? (studentVal ? 'Đúng (Đ)' : 'Sai (S)') : 'Không trả lời'
                      const correctVal = correctMap[sub]
                      const correctValText = correctVal !== undefined ? (correctVal ? 'Đ' : 'S') : ''
                      
                      const stmtObj = (stmtList && stmtList.find(s => s.key === sub)) || promptObj?.options?.find(o => (o.id || o.key || '').toLowerCase() === sub.toLowerCase())
                      const stmtText = stmtObj?.text || (typeof stmtObj === 'string' ? stmtObj : '')

                      return `
                        <div style="display:flex; flex-direction:column; gap:6px; padding:12px; background:${isStmtCorrect ? '#f0fdf4' : '#fef2f2'}; border:1.5px solid ${isStmtCorrect ? '#10b981' : '#ef4444'}; border-radius:8px; font-size:13px; transition:all 0.2s ease;">
                          ${stmtText ? `
                            <div style="font-size:14px; color:#1e293b; line-height:1.5; margin-bottom:4px;">
                              <strong style="color:#0284c7;">${sub})</strong> ${renderMarkdown(stmtText)}
                            </div>
                          ` : `
                            <div style="font-weight:700; color:#334155;">Ý ${sub.toUpperCase()}:</div>
                          `}
                          <div style="display:flex; justify-content:space-between; align-items:center; padding-top:4px; border-top:1px dashed ${isStmtCorrect ? '#bbf7d0' : '#fecaca'};">
                            <span style="font-weight:600; color:#475569; font-size:12px;">Lựa chọn của bạn:</span>
                            <span style="font-weight:700; color:${isStmtCorrect ? '#15803d' : '#b91c1c'}; display:flex; align-items:center; gap:6px;">
                              <i class="fa-solid ${isStmtCorrect ? 'fa-circle-check' : 'fa-circle-xmark'}"></i>
                              <span>${displayVal}</span>
                              <span style="font-size:11px; padding:2px 6px; border-radius:4px; background:${isStmtCorrect ? '#dcfce7' : '#fee2e2'}; font-weight:700;">${isStmtCorrect ? 'Chính xác' : 'Chưa đúng'}</span>
                            </span>
                          </div>
                          ${(showSolutions && (state.user?.role === 'ADMIN' || !isStmtCorrect) && correctValText) ? `
                            <div style="font-size:11px; color:#475569; display:flex; justify-content:space-between; align-items:center; margin-top:2px;">
                              <span>Đáp án đúng:</span>
                              <strong style="color:#15803d;">${correctValText === 'Đ' ? 'Đúng (Đ)' : 'Sai (S)'}</strong>
                            </div>
                          ` : ''}
                        </div>
                      `
                    }).join('')

                    reviewBody = `
                      <div style="display:grid; grid-template-columns:1fr; gap:10px;">
                        ${tfReviewHtml}
                      </div>
                    `
                  } else if (qType === 'MULTIPLE_CHOICE' && ((promptObj?.options && promptObj.options.length > 0) || qOptions)) {
                    let optList = []
                    if (promptObj?.options && promptObj.options.length > 0) {
                      optList = promptObj.options.map(opt => ({
                        key: (opt.id || opt.key || '').toUpperCase(),
                        text: opt.text || ''
                      }))
                    } else if (Array.isArray(qOptions)) {
                      optList = qOptions.map(opt => typeof opt === 'string' ? { key: '', text: opt } : opt)
                    } else if (typeof qOptions === 'object' && qOptions) {
                      optList = ['A', 'B', 'C', 'D'].map(k => ({ key: k, text: qOptions[k] || '' }))
                    }

                    reviewBody = `
                      <div style="display:flex; flex-direction:column; gap:8px;">
                        ${optList.map(opt => {
                          const optKey = opt.key || ''
                          const isChosen = String(givenAnswer?.value || givenStr || '').trim().toUpperCase() === optKey.trim().toUpperCase()
                          const isRight = correctStr ? (correctStr.trim().toUpperCase() === optKey.trim().toUpperCase()) : (isChosen && isCorrect)
                          let optBorder = '#e2e8f0'
                          let optBg = '#ffffff'
                          let badge = ''

                          if (isChosen && (isCorrect || isRight)) {
                            optBorder = '#10b981'
                            optBg = '#f0fdf4'
                            badge = `<span style="font-size:12px; font-weight:700; color:#15803d; background:#dcfce7; padding:3px 8px; border-radius:6px; white-space:nowrap;"><i class="fa-solid fa-circle-check"></i> Bạn chọn (Đúng)</span>`
                          } else if (isChosen && !isCorrect) {
                            optBorder = '#ef4444'
                            optBg = '#fef2f2'
                            badge = `<span style="font-size:12px; font-weight:700; color:#b91c1c; background:#fee2e2; padding:3px 8px; border-radius:6px; white-space:nowrap;"><i class="fa-solid fa-circle-xmark"></i> Bạn chọn (Sai)</span>`
                          } else if (showSolutions && !isChosen && isRight && (state.user?.role === 'ADMIN' || !isCorrect)) {
                            optBorder = '#86efac'
                            optBg = '#f0fdf4'
                            badge = `<span style="font-size:12px; font-weight:700; color:#15803d; background:#dcfce7; padding:3px 8px; border-radius:6px; white-space:nowrap;"><i class="fa-solid fa-check"></i> Đáp án đúng</span>`
                          }

                          return `
                            <div style="display:flex; justify-content:space-between; align-items:center; padding:10px 14px; border:1.5px solid ${optBorder}; background:${optBg}; border-radius:10px; gap:12px;">
                              <div style="display:flex; align-items:center; gap:12px; flex:1;">
                                <span style="width:28px; height:28px; border-radius:50%; background:${isChosen ? (isCorrect ? '#10b981' : '#ef4444') : (isRight && (state.user?.role === 'ADMIN' || showSolutions) ? '#10b981' : '#f1f5f9')}; color:${(isChosen || (isRight && (state.user?.role === 'ADMIN' || showSolutions))) ? '#ffffff' : '#334155'}; font-weight:800; font-size:13px; display:flex; align-items:center; justify-content:center; flex-shrink:0;">
                                  ${optKey}
                                </span>
                                <div style="font-size:14px; color:#1e293b; line-height:1.5;">${renderMarkdown(opt.text || '')}</div>
                              </div>
                              ${badge}
                            </div>
                          `
                        }).join('')}
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
                        ${(showSolutions && (!isCorrect || state.user?.role === 'ADMIN') && correctStr) ? `
                          <div style="display:flex; justify-content:space-between; align-items:center; padding:12px 16px; background:#f0fdf4; border:1px solid #10b981; border-radius:10px;">
                            <div style="display:flex; align-items:center; gap:10px; font-weight:600; color:#15803d; font-size:14px;">
                              <i class="fa-solid fa-circle-check"></i> Đáp án đúng: ${correctStr}
                            </div>
                          </div>
                        ` : ''}
                      </div>
                    `
                  }

                  let explanationContent = promptObj?.explanation || qExplanation
                  let explanationHtml = ''
                  if (showSolutions && explanationContent) {
                    explanationHtml = `
                      <div class="solution-explanation-box review-explanation-card" style="background:#eff6ff; border:1px solid #bfdbfe; border-left:4px solid #3b82f6; border-radius:10px; padding:14px 18px; margin-top:14px; font-size:14px; color:#1e3a8a; line-height:1.6;">
                        <div style="font-weight:700; color:#1d4ed8; margin-bottom:6px; display:flex; align-items:center; gap:6px;">
                          <i class="fa-solid fa-lightbulb" style="color:#eab308;"></i> Lời giải chi tiết:
                        </div>
                        <div class="explanation-content explanation-text" style="color:#1e293b; line-height:1.6;">${renderMarkdown(explanationContent)}</div>
                      </div>
                    `
                  }

                  let sectionHeaderHtml = ''
                  if (hasMultipleSections && currentSectionType !== qType) {
                    currentSectionType = qType
                    if (qType === 'MULTIPLE_CHOICE') {
                      sectionHeaderHtml = `
                        <div class="review-section-header" style="background: linear-gradient(135deg, #eff6ff 0%, #dbeafe 100%); border: 1.5px solid #bfdbfe; border-radius: 12px; padding: 14px 20px; font-weight: 800; font-size: 15px; color: #1e40af; display: flex; align-items: center; justify-content: space-between; margin-top: ${idx > 0 ? '16px' : '0'};">
                          <div style="display:flex; align-items:center; gap:10px;">
                            <i class="fa-solid fa-list-check" style="color: #2563eb; font-size:18px;"></i>
                            <span>PHẦN I: CÂU TRẮC NGHIỆM NHIỀU PHƯƠNG ÁN LỰA CHỌN (${mcCount} câu)</span>
                          </div>
                          <span style="font-size:12px; font-weight:700; color:#1d4ed8; background:#ffffff; padding:4px 12px; border-radius:8px; border:1px solid #bfdbfe;">Câu 1 - ${mcCount}</span>
                        </div>
                      `
                    } else if (qType === 'TRUE_FALSE') {
                      sectionHeaderHtml = `
                        <div class="review-section-header" style="background: linear-gradient(135deg, #f0fdf4 0%, #dcfce7 100%); border: 1.5px solid #bbf7d0; border-radius: 12px; padding: 14px 20px; font-weight: 800; font-size: 15px; color: #15803d; display: flex; align-items: center; justify-content: space-between; margin-top: 16px;">
                          <div style="display:flex; align-items:center; gap:10px;">
                            <i class="fa-solid fa-square-check" style="color: #16a34a; font-size:18px;"></i>
                            <span>PHẦN II: CÂU TRẮC NGHIỆM ĐÚNG / SAI (${tfCount} câu)</span>
                          </div>
                          <span style="font-size:12px; font-weight:700; color:#15803d; background:#ffffff; padding:4px 12px; border-radius:8px; border:1px solid #bbf7d0;">Câu 1 - ${tfCount}</span>
                        </div>
                      `
                    } else if (qType === 'SHORT_ANSWER') {
                      sectionHeaderHtml = `
                        <div class="review-section-header" style="background: linear-gradient(135deg, #fefce8 0%, #fef9c3 100%); border: 1.5px solid #fef08a; border-radius: 12px; padding: 14px 20px; font-weight: 800; font-size: 15px; color: #854d0e; display: flex; align-items: center; justify-content: space-between; margin-top: 16px;">
                          <div style="display:flex; align-items:center; gap:10px;">
                            <i class="fa-solid fa-pen-to-square" style="color: #ca8a04; font-size:18px;"></i>
                            <span>PHẦN III: CÂU TRẮC NGHIỆM TRẢ LỜI NGẮN (${saCount} câu)</span>
                          </div>
                          <span style="font-size:12px; font-weight:700; color:#854d0e; background:#ffffff; padding:4px 12px; border-radius:8px; border:1px solid #fef08a;">Câu 1 - ${saCount}</span>
                        </div>
                      `
                    }
                  }

                  const isGenericPlaceholder = !qContent || !!qContent.trim().match(/^Câu hỏi số\s*\d+$/i)

                  return `
                    ${sectionHeaderHtml}
                    <div class="card review-question-card" id="${anchorId}" data-legacy-id="review-question-${rawNum}" style="border-left:4px solid ${cardBorderColor}; margin-bottom: 0; scroll-margin-top: 14px;">
                      <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:12px;">
                        <div>
                          <span class="question-badge" style="background:${cardBorderColor}; color:#ffffff; padding:4px 8px; border-radius:6px; font-weight:700; margin-right:8px;">${qNum}</span>
                          <span style="font-size:12px; font-weight:700; color:#64748b; text-transform:uppercase;">${qTypeStr}</span>
                        </div>
                        <span class="badge" style="background:${badgeBg}; color:${badgeColor}; border:none; padding:4px 8px; border-radius:6px; font-weight:700; font-size:12px;">
                          <i class="fa-solid ${badgeIcon}"></i> ${formatScore(scoreEarned)} / ${formatScore(pointsPossible)} điểm
                        </span>
                      </div>

                      ${promptObj ? `
                        <div class="interactive-prompt-text" style="font-size:15px; font-weight:600; color:#0f172a; line-height:1.6; margin-bottom:12px;">
                          ${renderMarkdown(promptObj.text || `Câu hỏi số ${qNum}`)}
                        </div>
                        ${promptObj.imageUrl ? `
                          <div style="text-align:center; margin-bottom:14px;">
                            <img src="${promptObj.imageUrl}" alt="Hình minh họa câu ${qNum}" style="max-width:100%; max-height:260px; border-radius:8px; border:1px solid #e2e8f0; object-fit:contain; box-shadow:0 2px 6px rgba(0,0,0,0.06);" />
                          </div>
                        ` : ''}
                      ` : (!isGenericPlaceholder ? `
                        <div class="question-prompt-text" style="font-size:15px; color:#0f172a; line-height:1.6; margin-bottom:14px;">
                          ${renderMarkdown(qContent)}
                        </div>
                      ` : `
                        <div style="font-size:15px; font-weight:600; color:#0f172a; margin-bottom:12px;">
                          Câu hỏi số ${qNum}
                        </div>
                      `)}

                      ${reviewBody}

                      ${explanationHtml}
                    </div>
                  `
                }).join('')
              })()}
            </div>

            <!-- Right Column: Question Navigator (Sticky sidebar follows user scroll) -->
            <div class="review-sidebar-col">
              <div class="card review-navigator-card">
                <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:12px;">
                  <h3 style="font-family:var(--font-heading); font-size:16px; font-weight:700; margin:0; display:flex; align-items:center; gap:8px; color:#0f172a;">
                    <i class="fa-solid fa-map-location-dot" style="color:#0284c7;"></i> Sơ đồ câu hỏi
                  </h3>
                  <span style="font-size:11px; font-weight:700; color:#64748b; background:#f1f5f9; padding:2px 8px; border-radius:6px;">${totalQuestions} câu</span>
                </div>
                
                ${hasMultipleSections ? `
                  ${renderNavSection('MULTIPLE_CHOICE', 'Phần I: Trắc nghiệm', mcCount)}
                  ${renderNavSection('TRUE_FALSE', 'Phần II: Đúng / Sai', tfCount)}
                  ${renderNavSection('SHORT_ANSWER', 'Phần III: Trả lời ngắn', saCount)}
                ` : `
                  <div class="question-nav-grid" style="display:grid; grid-template-columns: repeat(5, 1fr); gap:8px;">
                    ${sortedAnswers.map(ans => renderNavButton(ans)).join('')}
                  </div>
                `}

                <div style="display:flex; flex-direction:column; gap:8px; margin-top:16px; font-size:12px; padding-top:12px; border-top:1px solid #f1f5f9;">
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

              <!-- Refresher / Admin Action Card -->
              <div class="card" style="background:${isTrial ? 'linear-gradient(135deg, #0284c7 0%, #0369a1 100%)' : (state.user?.role === 'ADMIN' ? 'linear-gradient(135deg, #0f172a 0%, #1e293b 100%)' : '#0066cc')}; color:#ffffff; text-align:center; margin-bottom:0;">
                <h3 style="font-family:var(--font-heading); font-size:17px; font-weight:700; margin-bottom:8px;">
                  ${isTrial ? 'Trải nghiệm thêm' : (state.user?.role === 'ADMIN' ? 'Quản lý lịch sử nộp bài' : 'Cần ôn tập thêm?')}
                </h3>
                <p style="font-size:13px; opacity:0.9; margin-bottom:16px;">
                  ${isTrial ? 'Xem các bài học thử khác hoặc đăng nhập để tham gia khóa học chính thức.' : (state.user?.role === 'ADMIN' ? 'Quay lại danh sách để xem báo cáo hoặc duyệt bài nộp của học sinh khác.' : 'Quay lại giao diện học để ôn tập kỹ lý thuyết và bài tập.')}
                </p>
                <button class="btn-secondary" style="width:100%; border:none; color:${state.user?.role === 'ADMIN' ? '#0f172a' : '#0066cc'}; background:#ffffff; font-weight:700; cursor:pointer;" onclick="window.location.hash='${isTrial ? '#trial' : (state.user?.role === 'ADMIN' ? '#admin-history' : '#my-classes')}'">
                  ${isTrial ? 'Danh sách học thử' : (state.user?.role === 'ADMIN' ? 'Quay lại danh sách nộp bài' : 'Đến trang lớp học')}
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
                <button class="btn-primary" onclick="window.showTrialRegistrationModal()" style="background: #f59e0b; border: none; color: #ffffff; padding: 10px 20px; border-radius: 8px; font-weight: 700; cursor: pointer; box-shadow: 0 4px 12px rgba(245, 158, 11, 0.4);">
                  <i class="fa-solid fa-user-plus"></i> Đăng ký học chính thức
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

  const reviewContainer = document.getElementById('questions-grid') || document.querySelector('.content-body')
  if (reviewContainer) {
    renderMath(reviewContainer)
  }

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

  // Question navigator click-to-scroll & active question highlighting
  const navItems = document.querySelectorAll('.nav-grid-item')
  const questionCards = document.querySelectorAll('.review-question-card')

  navItems.forEach(item => {
    item.addEventListener('click', () => {
      const targetId = item.getAttribute('data-target-id')
      const qNum = item.getAttribute('data-qnum')
      const target = (targetId && document.getElementById(targetId)) ||
        (qNum && document.getElementById(`review-question-${qNum}`)) ||
        (qNum && document.querySelector(`[data-legacy-id="review-question-${qNum}"]`))
      if (target) {
        target.scrollIntoView({ behavior: 'smooth', block: 'start' })
        
        // Brief flash highlight on target question card
        questionCards.forEach(c => c.classList.remove('highlight-target'))
        target.classList.add('highlight-target')
        setTimeout(() => target.classList.remove('highlight-target'), 1600)

        // Highlight active nav item
        navItems.forEach(ni => ni.classList.remove('active-nav-question'))
        item.classList.add('active-nav-question')
      }
    })
  })

  // ScrollSpy with IntersectionObserver to highlight current question on user scroll
  if (questionCards.length > 0 && navItems.length > 0 && 'IntersectionObserver' in window) {
    const navMap = new Map()
    navItems.forEach(item => {
      const targetId = item.getAttribute('data-target-id')
      const qNum = item.getAttribute('data-qnum')
      if (targetId) navMap.set(targetId, item)
      if (qNum) {
        navMap.set(`review-question-${qNum}`, item)
        navMap.set(qNum, item)
      }
    })

    const observer = new IntersectionObserver((entries) => {
      entries.forEach(entry => {
        if (entry.isIntersecting) {
          const cardId = entry.target.id
          const legacyId = entry.target.getAttribute('data-legacy-id')
          const matchingNav = navMap.get(cardId) || 
            (legacyId ? navMap.get(legacyId) : null) ||
            document.querySelector(`.nav-grid-item[data-target-id="${cardId}"]`)
          if (matchingNav) {
            navItems.forEach(ni => ni.classList.remove('active-nav-question'))
            matchingNav.classList.add('active-nav-question')
          }
        }
      })
    }, {
      root: null,
      rootMargin: '-84px 0px -65% 0px',
      threshold: 0
    })

    questionCards.forEach(card => observer.observe(card))
  }

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
