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
    submittedAt: result.submittedAt
  }
  
  const answers = result.questionReview ? result.questionReview.map(q => ({
    is_correct: q.isCorrect,
    score_earned: q.scoreEarned,
    given_answer: q.givenAnswer,
    correct_answer: q.correctAnswerSummary,
    questions: {
      question_number: q.questionNumber,
      question_type: q.questionType,
      prompt: q.prompt,
      points: q.pointsPossible
    }
  })) : (result.answers || [])

  const percentage = Math.round((sub.score / (sub.maxScore || 10)) * 100)
  const isPassed = sub.score >= (sub.passScore || 5)

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
            <button class="btn-secondary" onclick="window.location.hash='${state.user?.role === 'ADMIN' ? '#admin-history' : '#history'}'" style="cursor:pointer;">
              <i class="fa-solid fa-arrow-left"></i> Quay lại lịch sử
            </button>
          </div>

          <!-- Top Overview Banner -->
          <div class="card" style="display:flex; justify-content:space-between; align-items:center; background:linear-gradient(135deg, #ffffff 0%, #f0f7ff 100%);">
            <div style="display:flex; align-items:center; gap:24px;">
              <div>
                <div style="font-size:12px; font-weight:700; color:#64748b; text-transform:uppercase;">TỔNG ĐIỂM SỐ</div>
                <div style="font-family:var(--font-heading); font-size:42px; font-weight:700; color:#0f172a;">
                  ${sub.score} <span style="font-size:20px; color:#64748b; font-weight:400;">/ ${sub.maxScore}</span>
                </div>
                <div class="badge ${isPassed ? 'badge-graded' : 'badge-failed'}" style="font-size:13px; background:${isPassed ? '#dcfce7' : '#fee2e2'}; color:${isPassed ? '#15803d' : '#b91c1c'}; border:none; padding:6px 12px; border-radius:8px; display:inline-block; font-weight:700; margin-top:8px;">
                  <i class="fa-solid ${isPassed ? 'fa-circle-check' : 'fa-circle-xmark'}"></i> ${isPassed ? 'Đã Đạt! Chúc mừng bạn đã hoàn thành bài tập.' : 'Chưa Đạt. Hãy cố gắng luyện tập thêm.'}
                </div>
              </div>

              <!-- Circular Score Dial -->
              <div class="score-circle-widget" style="width:72px; height:72px; border-radius:50%; border:5px solid ${isPassed ? '#16a34a' : '#dc2626'}; display:flex; align-items:center; justify-content:center; font-weight:800; font-size:18px; color:${isPassed ? '#16a34a' : '#dc2626'}; background:#ffffff;">
                ${percentage}%
              </div>
            </div>

            <!-- Detailed Stat Badges -->
            <div style="display:flex; gap:32px;">
              <div>
                <div style="font-size:12px; color:#16a34a; font-weight:700;"><i class="fa-solid fa-circle-check"></i> Đúng</div>
                <div style="font-family:var(--font-heading); font-size:26px; font-weight:700; text-align:center;">${sub.correctCount}</div>
              </div>
              <div>
                <div style="font-size:12px; color:#dc2626; font-weight:700;"><i class="fa-solid fa-circle-xmark"></i> Sai</div>
                <div style="font-family:var(--font-heading); font-size:26px; font-weight:700; text-align:center;">${sub.wrongCount}</div>
              </div>
            </div>
          </div>

          <!-- Main Layout: Question Reviews + Right Sidebar Navigator -->
          <div class="grid-3">
            <div style="grid-column: span 2; display:flex; flex-direction:column; gap:16px;">
              ${answers.map(ans => {
                const qNum = ans.questions?.question_number || 1
                const isCorrect = ans.is_correct !== undefined ? ans.is_correct : ans.isCorrect
                const qTypeStr = ans.questions?.question_type === 'MULTIPLE_CHOICE' ? 'TRẮC NGHIỆM' : (ans.questions?.question_type === 'TRUE_FALSE' ? 'ĐÚNG/SAI' : 'TRẢ LỜI NGẮN')
                const scoreEarned = ans.score_earned !== undefined ? ans.score_earned : ans.scoreEarned
                const givenAnswer = ans.given_answer !== undefined ? ans.given_answer : ans.givenAnswer
                
                let givenStr = ''
                if (givenAnswer?.type === 'TRUE_FALSE') {
                  const val = givenAnswer?.value || {}
                  givenStr = `a: ${val.a ? 'Đ' : 'S'}, b: ${val.b ? 'Đ' : 'S'}, c: ${val.c ? 'Đ' : 'S'}, d: ${val.d ? 'Đ' : 'S'}`
                } else {
                  givenStr = givenAnswer?.value !== null && givenAnswer?.value !== undefined ? String(givenAnswer.value) : 'Không trả lời'
                }

                let correctStr = ''
                const corrKey = ans.correct_answer || ans.questions?.question_answers
                const qType = ans.questions?.question_type
                
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

                return `
                  <div class="card" style="border-left:4px solid ${isCorrect ? '#10b981' : '#ef4444'}; margin-bottom: 0;">
                    <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:12px;">
                      <div>
                        <span class="question-badge" style="background:${isCorrect ? '#10b981' : '#ef4444'}; color:#ffffff; padding:4px 8px; border-radius:6px; font-weight:700; margin-right:8px;">${qNum}</span>
                        <span style="font-size:12px; font-weight:700; color:#64748b; text-transform:uppercase;">${qTypeStr}</span>
                      </div>
                      <span class="badge" style="background:${isCorrect ? '#dcfce7' : '#fee2e2'}; color:${isCorrect ? '#16a34a' : '#dc2626'}; border:none; padding:4px 8px; border-radius:6px; font-weight:700; font-size:12px;">
                        <i class="fa-solid ${isCorrect ? 'fa-check' : 'fa-xmark'}"></i> ${scoreEarned} / ${ans.questions?.points || 1} điểm
                      </span>
                    </div>

                    <div style="font-size:15px; font-weight:600; color:#0f172a; margin-bottom:12px;">
                      Câu hỏi số ${qNum}
                    </div>

                    <div style="display:flex; flex-direction:column; gap:10px;">
                      <div style="display:flex; justify-content:space-between; align-items:center; padding:12px 16px; background:${isCorrect ? '#f0fdf4' : '#fef2f2'}; border:1px solid ${isCorrect ? '#10b981' : '#ef4444'}; border-radius:10px;">
                        <div style="display:flex; align-items:center; gap:10px; font-weight:600; color:${isCorrect ? '#15803d' : '#b91c1c'}; font-size:14px;">
                          <i class="fa-solid ${isCorrect ? 'fa-circle-check' : 'fa-circle-xmark'}"></i> Đáp án của bạn: ${givenStr}
                        </div>
                      </div>
                      ${!isCorrect ? `
                        <div style="display:flex; justify-content:space-between; align-items:center; padding:12px 16px; background:#f0fdf4; border:1px solid #10b981; border-radius:10px;">
                          <div style="display:flex; align-items:center; gap:10px; font-weight:600; color:#15803d; font-size:14px;">
                            <i class="fa-solid fa-circle-check"></i> Đáp án đúng: ${correctStr}
                          </div>
                        </div>
                      ` : ''}
                    </div>
                  </div>
                `
              }).join('')}
            </div>

            <!-- Right Column: Question Navigator -->
            <div>
              <div class="card">
                <h3 style="font-family:var(--font-heading); font-size:16px; font-weight:700; margin-bottom:12px;">Sơ đồ câu hỏi</h3>
                
                <div class="question-nav-grid" style="display:grid; grid-template-columns: repeat(5, 1fr); gap:8px;">
                  ${answers.map(ans => {
                    const qNum = ans.questions?.question_number || 1
                    const isCorrect = ans.is_correct !== undefined ? ans.is_correct : ans.isCorrect
                    return `
                      <div class="nav-grid-item" style="
                        background:${isCorrect ? '#e0f2fe' : '#fee2e2'}; 
                        color:${isCorrect ? '#0066cc' : '#ef4444'}; 
                        border: 1px solid ${isCorrect ? '#0066cc' : '#ef4444'};
                        width: 36px; height: 36px; border-radius: 8px; display: flex; align-items: center; justify-content: center; font-weight: 700; font-size: 13px;
                      ">${qNum}</div>
                    `
                  }).join('')}
                </div>

                <div style="display:flex; gap:16px; margin-top:16px; font-size:12px;">
                  <div style="display:flex; align-items:center; gap:6px;">
                    <div style="width:12px; height:12px; background:#e0f2fe; border: 1px solid #0066cc; border-radius:3px;"></div> Đúng
                  </div>
                  <div style="display:flex; align-items:center; gap:6px;">
                    <div style="width:12px; height:12px; background:#fee2e2; border: 1px solid #ef4444; border-radius:3px;"></div> Sai
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
}
