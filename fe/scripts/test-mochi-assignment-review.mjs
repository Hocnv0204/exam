import test from 'node:test'
import assert from 'node:assert/strict'
import { register } from 'node:module'

// Intercept .css, .svg and mock import.meta.env during node test execution
register('data:text/javascript,' + encodeURIComponent(`
  import { readFileSync } from 'node:fs';
  import { fileURLToPath } from 'node:url';

  export async function load(url, context, nextLoad) {
    if (url.endsWith('.css')) {
      return { format: 'module', shortCircuit: true, source: '' };
    }
    if (url.endsWith('.svg')) {
      return { format: 'module', shortCircuit: true, source: 'export default "test-mascot.svg";' };
    }
    if (url.includes('assignment-review.js')) {
      const filePath = fileURLToPath(url);
      const code = readFileSync(filePath, 'utf8')
        .replace(/import\\.meta\\.env\\.VITE_SUPABASE_URL/g, '""');
      return { format: 'module', shortCircuit: true, source: code };
    }
    return nextLoad(url, context);
  }
`))

const saved = new Map()
const storage = {
  getItem: key => saved.get(key) ?? null,
  setItem: (key, value) => saved.set(key, String(value)),
  removeItem: key => saved.delete(key),
  clear: () => saved.clear()
}

globalThis.localStorage = storage
globalThis.sessionStorage = storage
globalThis.CustomEvent = class {
  constructor(type, options = {}) { this.type = type; this.detail = options.detail }
}
globalThis.document = {
  documentElement: { dataset: {}, style: {} },
  addEventListener: () => {},
  dispatchEvent: () => {},
  querySelectorAll: () => [],
  getElementById: () => null
}
globalThis.window = {
  location: { hash: '#assignment-review', search: '' },
  addEventListener: () => {},
  matchMedia: () => ({ matches: false })
}

const { state } = await import('../src/js/state.js')
const {
  renderAssignmentReviewView,
  renderClassicAssignmentReviewView,
  renderMochiAssignmentReviewView
} = await import('../src/js/views/assignment-review.js')
const { canViewHomeworkPdf } = await import('../src/js/utils/homework-pdf-policy.js')

function useStudent() {
  state.token = 'test-student-token'
  state.user = { id: 'student-1', role: 'STUDENT', fullName: 'Lê Minh Anh', username: 'minhanh' }
  state.classes = [{ id: 'class-1', name: 'Lớp 12A1' }]
}

function useAdmin() {
  state.token = 'test-admin-token'
  state.user = { id: 'admin-1', role: 'ADMIN', fullName: 'Quản trị viên', username: 'admin' }
}

function useGuest() {
  state.token = null
  state.user = null
}

function setMochi(enabled) {
  if (enabled) saved.set('eduportal-ui', 'mochi')
  else saved.set('eduportal-ui', 'classic')
  window.location.search = ''
}

function extractIds(html) {
  const ids = new Set()
  for (const m of String(html).matchAll(/id="([^"]+)"/g)) {
    ids.add(m[1])
  }
  return ids
}

function createSampleReviewData({
  type = 'PRACTICE',
  hasPdf = true,
  isLate = false,
  showSolutions = true,
  duration = 1200,
  score = 8.5
} = {}) {
  return {
    submissionId: 'sub-review-123',
    homeworkTitle: 'Đại số 12: Khảo sát hàm số',
    type,
    score,
    maxScore: 10,
    passScore: 5,
    correctCount: 2,
    wrongCount: 1,
    durationSecondsTaken: duration,
    isLate,
    showSolutions,
    submittedAt: '2026-11-01T14:30:00.000Z',
    pdfUrl: hasPdf ? 'https://example.com/test-de-bai.pdf' : null,
    bonus_score: 0.5,
    submission: {
      id: 'sub-review-123',
      homeworkTitle: 'Đại số 12: Khảo sát hàm số',
      type,
      score,
      maxScore: 10,
      passScore: 5,
      correctCount: 2,
      wrongCount: 1,
      durationSecondsTaken: duration,
      isLate,
      showSolutions,
      submittedAt: '2026-11-01T14:30:00.000Z',
      pdfUrl: hasPdf ? 'https://example.com/test-de-bai.pdf' : null,
      bonus_score: 0.5
    },
    answers: [
      {
        id: 'ans-1',
        questionNumber: 1,
        questionType: 'MULTIPLE_CHOICE',
        is_correct: true,
        score_earned: 3.0,
        pointsPossible: 3.0,
        given_answer: { value: 'A' },
        correct_answer: 'A',
        prompt: 'Hàm số y = x^3 - 3x có bao nhiêu điểm cực trị?',
        options: [
          { key: 'A', text: '2 điểm cực trị' },
          { key: 'B', text: '1 điểm cực trị' },
          { key: 'C', text: '0 điểm cực trị' },
          { key: 'D', text: '3 điểm cực trị' }
        ],
        explanation: 'Ta có y\' = 3x^2 - 3 = 0 <=> x = ±1 nên hàm số có 2 điểm cực trị.'
      },
      {
        id: 'ans-2',
        questionNumber: 2,
        questionType: 'TRUE_FALSE',
        is_correct: false,
        score_earned: 0.5,
        pointsPossible: 1.0,
        given_answer: { value: { a: true, b: false, c: true, d: false } },
        correct_answer: { a: true, b: true, c: true, d: false },
        prompt: 'Cho hàm số f(x) liên tục trên R.',
        statements: [
          { key: 'a', text: 'Mệnh đề a đúng' },
          { key: 'b', text: 'Mệnh đề b đúng' },
          { key: 'c', text: 'Mệnh đề c đúng' },
          { key: 'd', text: 'Mệnh đề d sai' }
        ],
        explanation: 'Lời giải chi tiết cho câu đúng sai.'
      },
      {
        id: 'ans-3',
        questionNumber: 3,
        questionType: 'SHORT_ANSWER',
        is_correct: true,
        score_earned: 5.0,
        pointsPossible: 5.0,
        given_answer: { value: '42' },
        correct_answer: '42',
        prompt: 'Tìm giá trị lớn nhất của biểu thức.',
        explanation: 'Áp dụng bất đẳng thức Cauchy-Schwarz ta có GTLN = 42.'
      }
    ]
  }
}

test('cờ Mochi tắt: output assignment-review giữ nguyên 100% snapshot classic', () => {
  useStudent()
  setMochi(false)
  state.lastSubmissionResult = createSampleReviewData()

  const classicReview = renderClassicAssignmentReviewView()
  const currentReview = renderAssignmentReviewView()
  assert.equal(currentReview, classicReview, 'renderAssignmentReviewView phải trùng khớp renderClassicAssignmentReviewView khi cờ tắt')
})

test('cờ Mochi bật nhưng role ADMIN: giữ nguyên output classic, không hiển thị Mochi view', () => {
  useAdmin()
  setMochi(true)
  state.lastSubmissionResult = createSampleReviewData()

  const classicReview = renderClassicAssignmentReviewView()
  const currentReview = renderAssignmentReviewView()
  assert.equal(currentReview, classicReview, 'ADMIN phải luôn nhận giao diện classic 100%')
})

test('khách (guest / không có token): giữ nguyên output classic, không hiển thị Mochi view', () => {
  useGuest()
  setMochi(true)
  state.lastSubmissionResult = createSampleReviewData()

  const classicReview = renderClassicAssignmentReviewView()
  const currentReview = renderAssignmentReviewView()
  assert.equal(currentReview, classicReview, 'Khách phải luôn nhận giao diện classic')
})

test('cờ Mochi bật + STUDENT: assignment-review có đầy đủ layout Mochi, thẻ tổng kết, mascot, thẻ câu hỏi, bộ điều hướng', () => {
  useStudent()
  setMochi(true)
  state.lastSubmissionResult = createSampleReviewData({ isLate: true, duration: 1500 })

  const mochiHtml = renderAssignmentReviewView()

  // Layout wrap
  assert.match(mochiHtml, /m-review-wrap/, 'phải có khung m-review-wrap')
  assert.match(mochiHtml, /m-review-top-bar/, 'phải có thanh trên m-review-top-bar')
  assert.match(mochiHtml, /m-review-hero/, 'phải có thẻ tổng kết hero')
  assert.match(mochiHtml, /id="overview-banner-card"/, 'phải giữ ID overview-banner-card')

  // Mascot & speech bubble
  assert.match(mochiHtml, /m-mascot/, 'phải có linh vật mascot')
  assert.match(mochiHtml, /m-review-mascot-bubble/, 'phải có bong bóng lời thoại mascot')

  // Score & stats
  assert.match(mochiHtml, /id="review-total-score"/, 'phải có ID review-total-score')
  assert.match(mochiHtml, /id="bonus-score-badge"/, 'phải có ID bonus-score-badge')
  assert.match(mochiHtml, /8\.5/, 'phải hiển thị đúng điểm 8.5')
  assert.match(mochiHtml, /Nộp muộn/, 'phải hiển thị chip Nộp muộn khi có dữ liệu')
  assert.match(mochiHtml, /Thời gian/, 'phải hiển thị thời gian làm bài')

  // Question cards & options
  assert.match(mochiHtml, /review-question-card/, 'phải có class review-question-card')
  assert.match(mochiHtml, /m-review-q-card/, 'phải có class m-review-q-card')
  assert.match(mochiHtml, /m-review-opt/, 'các phương án trắc nghiệm phải dùng m-review-opt')
  assert.match(mochiHtml, /Bạn chọn \(Đúng\)/, 'phải có nhãn Bạn chọn (Đúng)')

  // Navigator
  assert.match(mochiHtml, /review-navigator-card/, 'phải có ID review-navigator-card')
  assert.match(mochiHtml, /nav-grid-item/, 'các nút số câu phải có class nav-grid-item')
  assert.match(mochiHtml, /m-review-nav-legend/, 'phải có chú thích màu sắc')
})

test('bảo toàn tập ID: không có ID nào bị mất giữa classic và Mochi', () => {
  useStudent()
  state.lastSubmissionResult = createSampleReviewData({ hasPdf: true })

  setMochi(false)
  // Bỏ qua ID thuộc sidebar do sidebar.js quản lý riêng giữa classic và Mochi shell
  const classicIds = [...extractIds(renderClassicAssignmentReviewView())].filter(id => !id.startsWith('sidebar-'))

  setMochi(true)
  const mochiIds = extractIds(renderAssignmentReviewView())

  for (const id of classicIds) {
    assert.ok(
      mochiIds.has(id),
      `ID "${id}" có trong classic assignment-review nhưng bị thiếu trong Mochi assignment-review`
    )
  }
})

test('bảo toàn data-* attributes chức năng', () => {
  useStudent()
  setMochi(true)
  state.lastSubmissionResult = createSampleReviewData()

  const html = renderAssignmentReviewView()

  // data-legacy-id
  assert.match(html, /data-legacy-id="review-question-1"/, 'phải có data-legacy-id cho câu 1')
  assert.match(html, /data-legacy-id="review-question-2"/, 'phải có data-legacy-id cho câu 2')
  assert.match(html, /data-legacy-id="review-question-3"/, 'phải có data-legacy-id cho câu 3')

  // data-score-badge
  assert.match(html, /data-score-badge="ans-1"/, 'phải có data-score-badge cho câu 1')

  // data-target-id & data-qnum trên nav-grid-item
  assert.match(html, /class="[^"]*nav-grid-item[^"]*"[^>]*data-target-id="review-q-MC-1"/, 'nav button phải có data-target-id')
  assert.match(html, /data-qnum="1"/, 'nav button phải có data-qnum')
})

test('chính sách PDF: học sinh tuyệt đối không thấy nút tải PDF của bài EXAM', () => {
  useStudent()
  setMochi(true)

  // Bài EXAM
  state.lastSubmissionResult = createSampleReviewData({ type: 'EXAM', hasPdf: true })
  assert.equal(canViewHomeworkPdf(state.user.role, { type: 'EXAM' }), false)
  const examHtml = renderAssignmentReviewView()
  assert.doesNotMatch(examHtml, /id="download-pdf-btn"/, 'học sinh không được có nút download-pdf-btn đối với bài EXAM')
  assert.match(examHtml, /id="toggle-pdf-btn"/, 'nút xem đề toggle-pdf-btn vẫn phải có để đối chiếu')

  // Bài PRACTICE
  state.lastSubmissionResult = createSampleReviewData({ type: 'PRACTICE', hasPdf: true })
  assert.equal(canViewHomeworkPdf(state.user.role, { type: 'PRACTICE' }), true)
  const practiceHtml = renderAssignmentReviewView()
  assert.match(practiceHtml, /id="download-pdf-btn"/, 'học sinh được có nút download-pdf-btn đối với bài PRACTICE')
})

test('dữ liệu rỗng: render trạng thái trống an toàn có hướng dẫn và mascot, không crash', () => {
  useStudent()
  state.lastSubmissionResult = null

  // Khi cờ tắt: khớp classic rỗng
  setMochi(false)
  const classicEmpty = renderClassicAssignmentReviewView()
  assert.equal(renderAssignmentReviewView(), classicEmpty)

  // Khi cờ bật: có linh vật và nút quay lại
  setMochi(true)
  const mochiEmpty = renderAssignmentReviewView()
  assert.match(mochiEmpty, /m-review-empty-card/)
  assert.match(mochiEmpty, /m-mascot/)
  assert.match(mochiEmpty, /Chưa có kết quả làm bài/)
  assert.match(mochiEmpty, /Quay lại lớp học/)
})

test('ẩn đáp án & giải thích: tuân thủ cờ showSolutions = false', () => {
  useStudent()
  setMochi(true)
  state.lastSubmissionResult = createSampleReviewData({ showSolutions: false })

  const html = renderAssignmentReviewView()
  assert.match(html, /Ẩn đáp án &amp; giải thích/, 'phải có huy hiệu Ẩn đáp án & giải thích')
  assert.doesNotMatch(html, /Lời giải chi tiết:/, 'không được hiển thị khối lời giải chi tiết khi showSolutions=false')
})

test('các tính năng chưa bật trong MOCHI_FEATURES không xuất hiện', () => {
  useStudent()
  setMochi(true)
  state.lastSubmissionResult = createSampleReviewData()

  const html = renderAssignmentReviewView()
  assert.doesNotMatch(html, /streak-badge|mochi-streak/, 'không được có streak')
  assert.doesNotMatch(html, /xp-badge|mochi-xp/, 'không được có xp')
  assert.doesNotMatch(html, /leaderboard/, 'không được có leaderboard')
})

test('thời gian làm bài và nộp muộn chỉ hiển thị khi có dữ liệu thật', () => {
  useStudent()
  setMochi(true)

  // Kịch bản: không nộp muộn, duration = 0
  state.lastSubmissionResult = createSampleReviewData({ isLate: false, duration: 0 })
  const htmlNoData = renderAssignmentReviewView()
  assert.doesNotMatch(htmlNoData, /Nộp muộn/, 'không được hiện Nộp muộn khi isLate=false')
  assert.doesNotMatch(htmlNoData, /Thời gian:/, 'không được hiện Thời gian khi duration=0')

  // Kịch bản: có nộp muộn, duration = 300
  state.lastSubmissionResult = createSampleReviewData({ isLate: true, duration: 300 })
  const htmlWithData = renderAssignmentReviewView()
  assert.match(htmlWithData, /Nộp muộn/, 'phải hiện Nộp muộn khi isLate=true')
  assert.match(htmlWithData, /Thời gian:/, 'phải hiện Thời gian khi duration > 0')
  assert.match(htmlWithData, /5 phút/, 'phải format đúng 5 phút')
})

test('linh vật và lời nhắn phản ánh đúng kết quả theo 4 trường hợp (xuất sắc, đạt, chưa đạt, chưa có điểm)', () => {
  useStudent()
  setMochi(true)

  // 1. Tỉ lệ điểm >= 0.8: khen xuất sắc (mood cheer)
  state.lastSubmissionResult = createSampleReviewData({ score: 9.0 })
  const htmlCheer = renderAssignmentReviewView()
  assert.match(htmlCheer, /m-mascot--cheer/, 'tỉ lệ điểm >= 0.8 phải dùng mascot mood cheer')
  assert.match(htmlCheer, /Xuất sắc!/, 'tỉ lệ điểm >= 0.8 phải có lời khen xuất sắc')

  // 2. Đạt (score >= passScore hoặc isPassed, tỉ lệ < 0.8 như 6.5/10, pass 5): khích lệ đạt, xem lại câu sai
  state.lastSubmissionResult = createSampleReviewData({ score: 6.5 })
  const htmlPassed = renderAssignmentReviewView()
  assert.match(htmlPassed, /m-mascot--happy/, 'đạt tỉ lệ < 0.8 phải dùng mascot mood happy')
  assert.match(htmlPassed, /Bạn đã đạt/, 'phải có lời khích lệ bạn đã đạt')
  assert.match(htmlPassed, /xem lại các câu sai để tiến bộ hơn/, 'phải nhắc xem lại các câu sai để tiến bộ hơn')
  assert.doesNotMatch(htmlPassed, /Xuất sắc!/, '6.5/10 không được nói xuất sắc')

  // 3. Chưa đạt (score < passScore): động viên ôn lại (mood wink, không chê)
  const unpassed = createSampleReviewData({ score: 3.0 })
  unpassed.passScore = 5
  unpassed.submission.passScore = 5
  unpassed.isPassed = false
  unpassed.submission.isPassed = false
  state.lastSubmissionResult = unpassed
  const htmlUnpassed = renderAssignmentReviewView()
  assert.match(htmlUnpassed, /m-mascot--wink/, 'chưa đạt phải dùng mood động viên (wink)')
  assert.match(htmlUnpassed, /Cố lên bạn nhé!/, 'chưa đạt phải có lời động viên cố lên')
  assert.doesNotMatch(htmlUnpassed, /Xuất sắc!/, 'chưa đạt không được khen xuất sắc')
  assert.doesNotMatch(htmlUnpassed, /Bạn đã đạt/, 'chưa đạt không được nói Bạn đã đạt')

  // 4. Không có điểm (null / không hữu hạn): trung tính "Bài đang chờ chấm/chưa có điểm"
  const pending = createSampleReviewData({ score: null })
  pending.submission.score = null
  state.lastSubmissionResult = pending
  const htmlPending = renderAssignmentReviewView()
  assert.match(htmlPending, /m-mascot--happy/, 'chưa có điểm dùng mood trung tính (happy)')
  assert.match(htmlPending, /Bài đang chờ chấm\/chưa có điểm/, 'phải có thông báo trung tính bài đang chờ chấm/chưa có điểm')
  assert.doesNotMatch(htmlPending, /Xuất sắc!/, 'chưa có điểm không được khen xuất sắc')
  assert.doesNotMatch(htmlPending, /Bạn đã đạt/, 'chưa có điểm không được nói Bạn đã đạt')
})

test('sơ đồ câu hỏi, chú thích, chip và thẻ phương án phân biệt rõ 3 trạng thái Đúng, Một phần, Sai', () => {
  useStudent()
  setMochi(true)
  const sample = createSampleReviewData({ score: 6.5 })
  // Thêm câu trả lời sai hoàn toàn để kiểm tra cả 3 trạng thái
  sample.answers.push({
    id: 'ans-4',
    questionNumber: 4,
    questionType: 'MULTIPLE_CHOICE',
    is_correct: false,
    score_earned: 0,
    pointsPossible: 1.0,
    given_answer: { value: 'B' },
    correct_answer: 'A',
    prompt: 'Câu hỏi kiểm tra đáp án sai',
    options: [
      { key: 'A', text: 'Đáp án A (Đúng)' },
      { key: 'B', text: 'Đáp án B (Bạn chọn - Sai)' }
    ]
  })
  sample.wrongCount = 1
  sample.submission.wrongCount = 1
  state.lastSubmissionResult = sample

  const html = renderAssignmentReviewView()

  // Ô số câu và ký hiệu
  assert.match(html, /m-nav-item--correct/, 'phải có ô số câu đúng')
  assert.match(html, /m-nav-item--partial/, 'phải có ô số câu đúng một phần')
  assert.match(html, /m-nav-item--wrong/, 'phải có ô số câu sai')
  assert.match(html, /aria-label="Xem câu \d+ \(Đúng ✓\)"/, 'aria-label câu đúng phải có icon hoặc ký hiệu')
  assert.match(html, /aria-label="Xem câu \d+ \(Một phần !\)"/, 'aria-label câu một phần phải có icon hoặc ký hiệu')
  assert.match(html, /aria-label="Xem câu \d+ \(Sai ✗\)"/, 'aria-label câu sai phải có icon hoặc ký hiệu')

  // Chú thích (legend)
  assert.match(html, /m-legend-dot--correct/, 'legend phải có chấm đúng')
  assert.match(html, /m-legend-dot--partial/, 'legend phải có chấm một phần')
  assert.match(html, /m-legend-dot--wrong/, 'legend phải có chấm sai')
  assert.match(html, /m-legend-dot--blank/, 'legend phải có chấm chưa làm')

  // Chip trạng thái câu hỏi
  assert.match(html, /m-review-stat-chip--ok/, 'phải có chip trạng thái ok')
  assert.match(html, /m-review-stat-chip--partial/, 'phải có chip trạng thái một phần')

  // Thẻ phương án Bạn chọn (Sai)
  assert.match(html, /Bạn chọn \(Sai\)/, 'phải có nhãn Bạn chọn (Sai)')
  assert.match(html, /is-chosen is-wrong/, 'thẻ phương án chọn sai phải có class is-wrong')
})

test('CSS Mochi assignment-review tuân thủ 3 màu độc lập và dùng token --m-* ở chế độ tối, không dùng navy/cyan cũ', async () => {
  const { readFileSync } = await import('node:fs')
  const css = readFileSync(new URL('../src/css/mochi/assignment-review.css', import.meta.url), 'utf8')

  // Token 3 màu phân biệt rõ ở cả 4 theme
  assert.match(css, /--m-review-ok:/, 'phải khai báo token --m-review-ok')
  assert.match(css, /--m-review-partial:/, 'phải khai báo token --m-review-partial (vàng/amber)')
  assert.match(css, /--m-review-wrong:/, 'phải khai báo token --m-review-wrong (đỏ/danger)')
  assert.match(css, /html\[data-ui="mochi"\]\[data-student-theme="dark"\]/, 'phải có định nghĩa token riêng cho theme dark')
  assert.match(css, /html\[data-ui="mochi"\]\[data-student-theme="mint"\]/, 'phải có định nghĩa token riêng cho theme mint')

  // Rule bảo vệ chế độ tối khỏi theme navy/admin-dark cũ
  assert.match(css, /\.app-layout:is\(\.admin-dark, \.navy-student\)/, 'phải có selector bảo vệ chống theme cũ ghi đè')
  assert.match(css, /solution-explanation-box\.review-explanation-card\.m-review-explanation/, 'phải bảo vệ khối lời giải chi tiết')
  assert.match(css, /m-review-tip-card/, 'phải bảo vệ thẻ cần ôn tập thêm')
  assert.match(css, /m-review-actions \.m-btn--secondary/, 'phải bảo vệ nút quay lại lịch sử')

  // Không dùng màu cyan (#38bdf8) hoặc xanh navy (#1e3a8a, #0f172a) cũ trong file CSS của trang
  assert.doesNotMatch(css, /#38bdf8/i, 'không được chứa màu cyan cũ #38bdf8')
  assert.doesNotMatch(css, /#1e3a8a/i, 'không được chứa màu navy cũ #1e3a8a')
})
