import test from 'node:test'
import assert from 'node:assert/strict'
import { register } from 'node:module'

// Intercept .css and .svg imports during node test execution
register('data:text/javascript,' + encodeURIComponent(`
  export async function load(url, context, nextLoad) {
    if (url.endsWith('.css')) {
      return { format: 'module', shortCircuit: true, source: '' }
    }
    if (url.endsWith('.svg')) {
      return { format: 'module', shortCircuit: true, source: 'export default "test-mascot.svg";' }
    }
    return nextLoad(url, context)
  }
`))

const saved = new Map()
const storage = {
  getItem: key => saved.get(key) ?? null,
  setItem: (key, value) => saved.set(key, String(value)),
  removeItem: key => saved.delete(key)
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
  location: { hash: '#my-homeworks', search: '' },
  addEventListener: () => {},
  matchMedia: () => ({ matches: false })
}

const { state } = await import('../src/js/state.js')
const {
  renderMyHomeworksView,
  renderClassicMyHomeworksView,
  renderMochiStats,
  hwCard
} = await import('../src/js/views/my-homeworks.js')
const {
  renderLearningHistoryView,
  renderClassicLearningHistoryView
} = await import('../src/js/views/learning-history.js')
const { canViewHomeworkPdf } = await import('../src/js/utils/homework-pdf-policy.js')

function useStudent() {
  state.token = 'test-student-token'
  state.user = { id: 'student-1', role: 'STUDENT', fullName: 'Lê Minh Anh', username: 'minhanh' }
  state.classes = [{ id: 'class-1', name: 'Lớp 12A1' }]
  state.submissions = []
}

function useAdmin() {
  state.token = 'test-admin-token'
  state.user = { id: 'admin-1', role: 'ADMIN', fullName: 'Quản trị viên', username: 'admin' }
}

function setMochi(enabled) {
  if (enabled) saved.set('eduportal-ui', 'mochi')
  else saved.set('eduportal-ui', 'classic') // Mochi là mặc định: phải chọn giao diện cũ tường minh
  window.location.search = ''
}

test('cờ Mochi tắt: output my-homeworks và learning-history giữ nguyên 100% snapshot classic', () => {
  useStudent()
  setMochi(false)

  const classicHw = renderClassicMyHomeworksView()
  const currentHw = renderMyHomeworksView()
  assert.equal(currentHw, classicHw, 'renderMyHomeworksView phải trùng khớp renderClassicMyHomeworksView')

  state.submissions = [
    {
      id: 'sub-1',
      homeworkTitle: 'Đại số 12: Đạo hàm',
      lesson: 'Bài 1: Định nghĩa đạo hàm',
      submittedAt: '01/11/2026 14:00',
      score: 9.5,
      maxScore: 10,
      correctCount: 19,
      wrongCount: 1,
      durationSecondsTaken: 1200,
      isPassed: true
    }
  ]
  const classicHistory = renderClassicLearningHistoryView()
  const currentHistory = renderLearningHistoryView()
  assert.equal(currentHistory, classicHistory, 'renderLearningHistoryView phải trùng khớp renderClassicLearningHistoryView')
})

test('cờ Mochi bật nhưng role ADMIN: giữ nguyên output classic, không hiển thị Mochi student view', () => {
  useAdmin()
  setMochi(true)

  assert.equal(renderMyHomeworksView(), renderClassicMyHomeworksView())
  assert.equal(renderLearningHistoryView(), renderClassicLearningHistoryView())
})

test('cờ Mochi bật + STUDENT: my-homeworks có đầy đủ layout Mochi, sticker, tabs và mascot', () => {
  useStudent()
  setMochi(true)

  const html = renderMyHomeworksView()

  // Khung và layout Mochi
  assert.match(html, /m-student-page m-homework-page/)
  assert.match(html, /class="m-hw-hero"/)
  assert.match(html, /class="m-hw-hero-title">Bài tập của tôi<\/h1>/)
  assert.match(html, /<svg class="m-mascot/)

  // Header và nút hướng dẫn
  assert.match(html, /id="btn-replay-myhw-tour"/)
  assert.match(html, /class="m-btn m-btn--secondary"/)

  // Thống kê sticker container và bộ lọc tab bo tròn
  assert.match(html, /id="myhw-stats" class="m-hw-stats"/)
  assert.match(html, /id="tour-myhw-filter"/)
  assert.match(html, /class="m-hw-status-tabs"/)
  assert.match(html, /data-status="all"/)
  assert.match(html, /data-status="todo"/)
  assert.match(html, /data-status="done"/)

  // Các select lọc có class m-select và giữ disabled ban đầu
  assert.match(html, /id="myhw-class-filter"[^>]*class="m-select"/)
  assert.match(html, /id="myhw-chapter-filter"[^>]*class="m-select"[^>]*disabled/)
  assert.match(html, /id="myhw-lesson-filter"[^>]*class="m-select"[^>]*disabled/)

  // Hộp tìm kiếm và loading container
  assert.match(html, /id="myhw-search"/)
  assert.match(html, /class="m-hw-search-box"/)
  assert.match(html, /id="myhw-list" class="m-hw-list"/)
  assert.match(html, /id="myhw-pagination" class="m-hw-pagination"/)

  // Không hiển thị các khối tính năng bị ẩn (streak, xp, leaderboard)
  assert.doesNotMatch(html, /\bXP\b|streak|bảng xếp hạng/i)
})

test('cờ Mochi bật + STUDENT: learning-history có layout Mochi thẻ, điểm số, đúng/sai, nộp muộn', () => {
  useStudent()
  setMochi(true)

  state.submissions = [
    {
      id: 'sub-101',
      homeworkTitle: 'Đại số 12: Đạo hàm nâng cao',
      lesson: 'Chương 1: Ứng dụng đạo hàm',
      lessonId: 'les-1',
      chapterTitle: 'Chương 1',
      chapterId: 'chap-1',
      className: 'Toán 12A1',
      classId: 'class-1',
      submittedAt: '05/11/2026 20:30',
      score: 8.5,
      maxScore: 10,
      correctCount: 17,
      wrongCount: 3,
      durationSecondsTaken: 2450,
      isPassed: true,
      isLate: true
    },
    {
      id: 'sub-102',
      homeworkTitle: 'Hình học 12: Khối đa diện',
      lesson: 'Bài 2: Thể tích chóp',
      submittedAt: '06/11/2026 10:15',
      score: 4.0,
      maxScore: 10,
      correctCount: 8,
      wrongCount: 12,
      durationSecondsTaken: 1800,
      isPassed: false,
      isLate: false
    }
  ]

  const html = renderLearningHistoryView()

  // Khung và hero
  assert.match(html, /m-student-page m-history-page/)
  assert.match(html, /class="m-hw-hero-title">Lịch sử làm bài<\/h1>/)
  assert.match(html, /<svg class="m-mascot/)

  // Thống kê nhanh
  assert.match(html, /class="m-hw-stats"/)
  assert.match(html, /ĐIỂM TRUNG BÌNH/)
  assert.match(html, /TỔNG BÀI ĐÃ LÀM/)
  assert.match(html, /NỘP MUỘN/)

  // Bộ lọc
  assert.match(html, /id="search-hw-input"/)
  assert.match(html, /id="filter-class-select"/)
  assert.match(html, /id="filter-chapter-select"/)
  assert.match(html, /id="filter-lesson-select"/)
  assert.match(html, /Đã hoàn thành/)

  // Danh sách thẻ bài nộp
  assert.match(html, /class="m-sub-card"/)
  assert.match(html, /class="m-sub-score-box is-passed"/)
  assert.match(html, /class="m-sub-score-box is-failed"/)
  assert.match(html, /8\.5/)
  assert.match(html, /ĐẠT/)
  assert.match(html, /CHƯA ĐẠT/)
  assert.match(html, /Nộp muộn/)
  assert.match(html, /17.*đúng/)
  assert.match(html, /3.*sai/)
  assert.match(html, /40m 50s/) // 2450s = 40m 50s
  assert.match(html, /#assignment-review\?submissionId=sub-101/)

  // Không có biểu đồ hay số liệu bịa đặt
  assert.doesNotMatch(html, /<canvas/i)
})

test('chính sách PDF: học sinh tuyệt đối không thấy PDF của bài EXAM', () => {
  useStudent()

  const examHw = {
    id: 'exam-1',
    title: 'Kiểm tra giữa kỳ Toán 12',
    type: 'EXAM',
    pdfPath: 'homeworks/pdf/exam-1.pdf'
  }
  const practiceHw = {
    id: 'prac-1',
    title: 'Luyện tập đạo hàm',
    type: 'PRACTICE',
    pdfPath: 'homeworks/pdf/prac-1.pdf'
  }

  assert.equal(canViewHomeworkPdf(state.user.role, examHw), false, 'STUDENT không được xem PDF EXAM')
  assert.equal(canViewHomeworkPdf(state.user.role, practiceHw), true, 'STUDENT được xem PDF PRACTICE')
})

test('dữ liệu rỗng: không crash và render linh vật trạng thái trống thân thiện', () => {
  useStudent()
  setMochi(true)

  // Homeworks view không crash khi chưa có dữ liệu
  const hwHtml = renderMyHomeworksView()
  assert.ok(hwHtml.length > 0)
  assert.match(hwHtml, /class="m-hw-hero"/)

  // History view rỗng không crash và hiện empty state với mascot
  state.submissions = []
  const historyHtml = renderLearningHistoryView()
  assert.ok(historyHtml.length > 0)
  assert.match(historyHtml, /class="m-empty-state"/)
  assert.match(historyHtml, /Chưa có bài tập nào phù hợp/)
  assert.match(historyHtml, /<svg class="m-mascot/)

  // Xử lý null/undefined submission an toàn
  state.submissions = [
    {
      id: 'sub-null',
      homeworkTitle: null,
      lesson: null,
      submittedAt: null,
      score: null,
      maxScore: null,
      correctCount: null,
      wrongCount: null,
      durationSecondsTaken: null,
      isPassed: null
    }
  ]
  const safeHtml = renderLearningHistoryView()
  assert.ok(safeHtml.includes('sub-null'))
  assert.match(safeHtml, /Bài tập/)
  assert.doesNotMatch(safeHtml, /NaN/)
  assert.match(safeHtml, /<div class="m-stat-val">—<\/div>/)
  assert.match(safeHtml, /Chưa có điểm/)
})

test('Mochi learning-history & my-homeworks: xử lý bài thiếu điểm, không xuất hiện NaN, toàn bộ thiếu điểm hiện "—"', () => {
  useStudent()
  setMochi(true)

  // 1. Danh sách có bài thiếu điểm (pha trộn): điểm trung bình chỉ tính bài có điểm hợp lệ, không xuất hiện NaN
  state.submissions = [
    {
      id: 'sub-valid-1',
      homeworkTitle: 'Bài tập 1 (đạt)',
      score: 8,
      maxScore: 10,
      isPassed: true
    },
    {
      id: 'sub-valid-2',
      homeworkTitle: 'Bài tập 2 (chưa đạt)',
      score: 4,
      maxScore: 10,
      isPassed: false
    },
    {
      id: 'sub-missing-score',
      homeworkTitle: 'Bài tập tự luận chờ chấm',
      score: null,
      maxScore: 10,
      isPassed: null
    },
    {
      id: 'sub-undefined-score',
      homeworkTitle: 'Bài tập thiếu điểm',
      score: undefined,
      maxScore: 10
    },
    {
      id: 'sub-invalid-max',
      homeworkTitle: 'Bài tập maxScore không hợp lệ',
      score: 5,
      maxScore: 0
    }
  ]

  const mixedHtml = renderLearningHistoryView()
  assert.doesNotMatch(mixedHtml, /NaN%?/, 'Không được chứa NaN hoặc NaN%')
  // Điểm trung bình chỉ tính trên 2 bài hợp lệ: (8/10 + 4/10)/2 = 60%
  assert.match(mixedHtml, /<div class="m-stat-val">60%<\/div>/, 'Điểm TB tính trên các bài hợp lệ')
  // Ô điểm của bài thiếu điểm: hiện "—", maxScore "/ 10", nhãn "Chưa có điểm", không gắn "ĐẠT"
  assert.match(mixedHtml, /<div class="m-sub-score-val">—<\/div>/)
  assert.match(mixedHtml, /Chưa có điểm/)

  // 2. Toàn bộ danh sách thiếu điểm: điểm trung bình hiển thị "—" (không phải 0% hay NaN)
  state.submissions = [
    {
      id: 'sub-pending-1',
      homeworkTitle: 'Bài 1 tự luận',
      score: null,
      maxScore: 10
    },
    {
      id: 'sub-pending-2',
      homeworkTitle: 'Bài 2 tự luận',
      score: undefined,
      maxScore: 10
    }
  ]

  const allUnscoredHtml = renderLearningHistoryView()
  assert.doesNotMatch(allUnscoredHtml, /NaN%?/, 'Không được chứa NaN hoặc NaN%')
  assert.doesNotMatch(allUnscoredHtml, />0%<\/div>/, 'Không được hiển thị 0% khi toàn bộ thiếu điểm')
  assert.doesNotMatch(allUnscoredHtml, />—%<\/div>/, 'Không được hiển thị —%')
  // Thẻ điểm trung bình phải hiển thị "—"
  assert.match(allUnscoredHtml, /<div class="m-stat-val">—<\/div>/, 'Toàn bộ thiếu điểm thì điểm TB là "—"')
  // Không gắn nhãn ĐẠT khi không có điểm
  assert.doesNotMatch(allUnscoredHtml, /<span class="m-chip[^>]*>[\s\n]*ĐẠT[\s\n]*<\/span>/)

  // 3. hwCard trong my-homeworks: bài đã nộp (done) nhưng chưa có điểm
  const unscoredHw = {
    id: 'hw-unscored',
    title: 'Bài tự luận đã nộp chờ chấm',
    type: 'PRACTICE',
    className: 'Văn 12',
    durationMinutes: 45,
    done: true,
    score: null,
    maxScore: 10,
    submittedAt: '2026-11-06T15:00:00Z',
    submissionId: 'sub-pending-99'
  }
  const cardHtml = hwCard(unscoredHw)
  assert.doesNotMatch(cardHtml, /NaN/, 'hwCard không chứa NaN')
  assert.match(cardHtml, /—\/10 điểm/, 'Ô điểm hiển thị —/10 điểm thay vì 0/10')
  assert.match(cardHtml, /Chưa có điểm/, 'Có nhãn Chưa có điểm')
  assert.doesNotMatch(cardHtml, /m-chip--ok.*ĐẠT/, 'Không gắn nhãn ĐẠT khi không có điểm')
  assert.match(cardHtml, /is-unscored/)

  // 4. renderMochiStats trong my-homeworks khi avgScore là NaN / null
  const statsContainer = {
    id: 'myhw-stats',
    className: '',
    innerHTML: '',
    removeAttribute: () => {}
  }
  const origGetElementById = globalThis.document.getElementById
  globalThis.document.getElementById = (id) => (id === 'myhw-stats' ? statsContainer : null)
  try {
    renderMochiStats({ total: 5, todo: 2, done: 3, avgScore: NaN })
    assert.doesNotMatch(statsContainer.innerHTML, /NaN/, 'renderMochiStats không được chứa NaN')
    assert.match(statsContainer.innerHTML, /<div class="m-stat-val">—<\/div>/)

    renderMochiStats({ total: 5, todo: 2, done: 3, avgScore: null })
    assert.match(statsContainer.innerHTML, /<div class="m-stat-val">—<\/div>/)

    renderMochiStats({ total: 5, todo: 2, done: 3, avgScore: 8.5 })
    assert.match(statsContainer.innerHTML, /<div class="m-stat-val">8\.5<\/div>/)
  } finally {
    globalThis.document.getElementById = origGetElementById
  }
})

test('hwCard: hiển thị đúng chip độ gấp deadline, loại bài và các nút thao tác', () => {
  useStudent()
  setMochi(true)

  // 1. Bài quá hạn
  const overdueHw = {
    id: 'hw-overdue',
    title: 'Bài tập lượng giác quá hạn',
    type: 'PRACTICE',
    className: 'Toán 11',
    durationMinutes: 45,
    deadline: new Date(Date.now() - 86400000).toISOString(),
    done: false
  }
  const overdueCard = hwCard(overdueHw)
  assert.match(overdueCard, /m-chip--warn/)
  assert.match(overdueCard, /Quá hạn/)
  assert.match(overdueCard, /Làm bài/)

  // 2. Bài đến hạn hôm nay
  const todayHw = {
    id: 'hw-today',
    title: 'Bài tập hàm số đến hạn hôm nay',
    type: 'PRACTICE',
    className: 'Toán 12',
    durationMinutes: 60,
    deadline: new Date(Date.now() + 3600000 * 2).toISOString(),
    done: false
  }
  const todayCard = hwCard(todayHw)
  assert.match(todayCard, /m-chip--urgent/)
  assert.match(todayCard, /Hôm nay/)

  // 3. Bài thi chưa làm (EXAM): có nút Vào phòng thi, KHÔNG CÓ nút Tải PDF
  const examHw = {
    id: 'exam-active',
    title: 'Kiểm tra 1 tiết Đại số',
    type: 'EXAM',
    className: 'Toán 12',
    durationMinutes: 45,
    pdfPath: 'some/secret/exam.pdf',
    deadline: new Date(Date.now() + 86400000 * 3).toISOString(),
    done: false
  }
  const examCard = hwCard(examHw)
  assert.match(examCard, /BÀI THI/)
  assert.match(examCard, /Vào phòng thi/)
  assert.doesNotMatch(examCard, /btn-myhw-pdf/)
  assert.doesNotMatch(examCard, /Tải PDF/)

  // 4. Bài đã làm (done): điểm số, ĐẠT, nút Xem kết quả và Làm lại
  const doneHw = {
    id: 'hw-done-1',
    title: 'Luyện tập phương trình mũ',
    type: 'PRACTICE',
    className: 'Toán 12',
    durationMinutes: 30,
    done: true,
    score: 9,
    maxScore: 10,
    isPassed: true,
    isLate: false,
    submittedAt: '2026-11-05T08:00:00Z',
    submissionId: 'sub-done-123'
  }
  const doneCard = hwCard(doneHw)
  assert.match(doneCard, /9\/10 điểm/)
  assert.match(doneCard, /is-passed/)
  assert.match(doneCard, /ĐẠT/)
  assert.match(doneCard, /#assignment-review\?submissionId=sub-done-123/)
  assert.match(doneCard, /Làm lại/)
})

test('CSS homework-history.css: mọi selector bắt buộc scope html[data-ui="mochi"] và responsive', async () => {
  const { readFileSync } = await import('node:fs')
  const css = readFileSync(new URL('../src/css/mochi/homework-history.css', import.meta.url), 'utf8')

  // Loại bỏ comments trước khi kiểm tra selectors
  const cleanCss = css.replace(/\/\*[\s\S]*?\*\//g, '')
  const rules = cleanCss.split('}').map(r => r.trim()).filter(Boolean)

  for (const rule of rules) {
    if (rule.startsWith('@media')) {
      const mediaContent = rule.slice(rule.indexOf('{') + 1)
      const subRules = mediaContent.split('}').map(r => r.trim()).filter(Boolean)
      for (const sub of subRules) {
        const selectorPart = sub.split('{')[0].trim()
        for (const sel of selectorPart.split(',').map(s => s.trim())) {
          if (!sel) continue
          assert.match(
            sel,
            /^html\[data-ui="mochi"\]/,
            `Selector trong media query phải bắt đầu bằng html[data-ui="mochi"]: "${sel}"`
          )
        }
      }
      continue
    }
    const selectorPart = rule.split('{')[0].trim()
    for (const sel of selectorPart.split(',').map(s => s.trim())) {
      if (!sel) continue
      assert.match(
        sel,
        /^html\[data-ui="mochi"\]/,
        `Mọi selector phải bắt đầu bằng html[data-ui="mochi"]: "${sel}"`
      )
    }
  }

  // Chứa media query tablet và mobile
  assert.match(css, /@media\s*\(max-width:\s*900px\)/)
  assert.match(css, /@media\s*\(max-width:\s*640px\)/)
  // Sử dụng token chuẩn
  assert.match(css, /var\(--m-surface\)/)
  assert.match(css, /var\(--m-ink\)/)
  assert.match(css, /var\(--m-accent\)/)
  assert.match(css, /var\(--m-ok\)/)
  assert.match(css, /var\(--m-warn\)/)
})

