import test from 'node:test'
import assert from 'node:assert/strict'
import { register } from 'node:module'
import { readFileSync } from 'node:fs'

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
  removeItem: key => saved.delete(key),
  clear: () => saved.clear()
}

globalThis.localStorage = storage
globalThis.sessionStorage = storage
globalThis.CustomEvent = class {
  constructor(type, options = {}) { this.type = type; this.detail = options.detail }
}

let activeDocumentHtml = ''
const docElement = {
  dataset: {},
  style: {},
  getAttribute(attr) {
    if (attr === 'data-ui') return docElement.dataset.ui || null
    if (attr === 'data-student-theme') return docElement.dataset.studentTheme || null
    return null
  }
}

globalThis.document = {
  documentElement: docElement,
  addEventListener: () => {},
  dispatchEvent: () => {},
  querySelectorAll: () => [],
  getElementById: (id) => {
    if (id === 'student-report-body' || id === 'shared-report-body') {
      return {
        id,
        innerHTML: activeDocumentHtml,
        set innerHTML(val) { activeDocumentHtml = val },
        querySelector: (sel) => {
          if (sel === '#report-retry-btn' && activeDocumentHtml.includes('report-retry-btn')) {
            return { addEventListener: () => {} }
          }
          return null
        }
      }
    }
    if (id === 'report-trend-chart' && activeDocumentHtml.includes('report-trend-chart')) {
      return {
        id: 'report-trend-chart',
        getContext: () => ({}),
        closest: (sel) => {
          if (sel.includes('m-student-page') && activeDocumentHtml.includes('m-student-page')) return true
          if (sel.includes('admin-dark') && activeDocumentHtml.includes('admin-dark')) return true
          return null
        }
      }
    }
    return null
  }
}

globalThis.window = {
  location: { hash: '#student-report?fromDate=2026-10-01&toDate=2026-10-31', search: '' },
  addEventListener: () => {},
  matchMedia: () => ({ matches: false })
}

const { state } = await import('../src/js/state.js')
const {
  renderStudentReportView,
  renderClassicStudentReportView,
  renderSharedReportView,
  renderMochiReportInner,
  renderClassicReportInner,
  reportChartPalette
} = await import('../src/js/views/student-report.js')

function useStudent() {
  state.token = 'test-student-token'
  state.user = { id: 'student-101', role: 'STUDENT', fullName: 'Nguyễn Văn An', username: 'an_nguyen' }
  state.classes = [{ id: 'cls-1', name: 'Lớp 12A1' }]
  state.reportParams = { studentId: 'student-101', classId: 'cls-1', fromDate: '2026-10-01', toDate: '2026-10-31' }
  window.location.hash = '#student-report?studentId=student-101&classId=cls-1&fromDate=2026-10-01&toDate=2026-10-31'
}

function useAdmin() {
  state.token = 'test-admin-token'
  state.user = { id: 'admin-1', role: 'ADMIN', fullName: 'Thầy Hùng Quản Trị', username: 'admin' }
  state.classes = [{ id: 'cls-1', name: 'Lớp 12A1' }]
  state.students = [{ id: 'student-101', fullName: 'Nguyễn Văn An' }]
  state.reportParams = { studentId: 'student-101', classId: 'cls-1', fromDate: '2026-10-01', toDate: '2026-10-31' }
  window.location.hash = '#student-report?studentId=student-101&classId=cls-1&fromDate=2026-10-01&toDate=2026-10-31'
}

function setMochi(enabled) {
  if (enabled) {
    saved.set('eduportal-ui', 'mochi')
    docElement.dataset.ui = 'mochi'
  } else {
    saved.set('eduportal-ui', 'classic') // Mochi là mặc định: chọn classic tường minh để tắt
    delete docElement.dataset.ui
  }
  window.location.search = ''
}

function sampleReportData() {
  return {
    studentName: 'Nguyễn Văn An',
    className: 'Lớp 12A1',
    period: { fromDate: '2026-10-01', toDate: '2026-10-31', days: 30 },
    summary: {
      assignedCount: 12,
      submittedCount: 10,
      completionRate: 83.33,
      onTimeRate: 90,
      averageScore: 8.5,
      highestScore: 10,
      lowestScore: 6.0,
      activeDays: 7,
      attemptCount: 15
    },
    comparison: {
      trend: 'IMPROVING',
      firstHalf: { averageScore: 7.8, completionRate: 75, submittedCount: 4, attemptCount: 6 },
      secondHalf: { averageScore: 9.0, completionRate: 90, submittedCount: 6, attemptCount: 9 }
    },
    scoreTrend: [
      { homeworkId: 'hw-1', homeworkTitle: 'Đại số 12: Khảo sát hàm số', attemptNo: 1, score: 7.5, maxScore: 10, scaledScore: 7.5, submittedAt: '2026-10-05T08:30:00Z', isBest: false, isLate: false },
      { homeworkId: 'hw-1', homeworkTitle: 'Đại số 12: Khảo sát hàm số', attemptNo: 2, score: 9.0, maxScore: 10, scaledScore: 9.0, submittedAt: '2026-10-06T09:00:00Z', isBest: true, isLate: false },
      { homeworkId: 'hw-2', homeworkTitle: 'Hình học 12: Thể tích khối đa diện', attemptNo: 1, score: 10.0, maxScore: 10, scaledScore: 10.0, submittedAt: '2026-10-15T10:00:00Z', isBest: true, isLate: false }
    ],
    topicBreakdown: [
      { topicTitle: 'Chương 1: Ứng dụng đạo hàm', assignedCount: 8, submittedCount: 7, attemptCount: 10, completionRate: 87.5, averageScore: 8.8, highestScore: 10, lowestScore: 7.0 },
      { topicTitle: 'Chương 2: Hàm số lũy thừa', assignedCount: 4, submittedCount: 1, attemptCount: 1, completionRate: 25.0, averageScore: 4.5, highestScore: 4.5, lowestScore: 4.5 }
    ],
    submissions: [
      {
        homeworkTitle: 'Đại số 12: Khảo sát hàm số',
        chapterTitle: 'Chương 1: Ứng dụng đạo hàm',
        lessonTitle: 'Bài 1: Sự đồng biến, nghịch biến',
        attemptNo: 2,
        score: 9.0,
        maxScore: 10,
        isBest: true,
        isLate: false,
        bonusScore: 0.5,
        isPassed: true,
        submittedAt: '2026-10-06T09:00:00Z',
        durationSecondsTaken: 1500
      },
      {
        homeworkTitle: 'Đại số 12: Khảo sát hàm số',
        chapterTitle: 'Chương 1: Ứng dụng đạo hàm',
        lessonTitle: 'Bài 1: Sự đồng biến, nghịch biến',
        attemptNo: 1,
        score: 7.5,
        maxScore: 10,
        isBest: false,
        isLate: false,
        bonusScore: 0,
        isPassed: true,
        submittedAt: '2026-10-05T08:30:00Z',
        durationSecondsTaken: 1800
      }
    ],
    isEmpty: false
  }
}

// --------------------------------------------------------------------------
// Test Suite
// --------------------------------------------------------------------------

test('cờ Mochi tắt: output #student-report giữ nguyên 100% snapshot classic', () => {
  useStudent()
  setMochi(false)

  const classicShell = renderClassicStudentReportView()
  const currentShell = renderStudentReportView()
  assert.equal(currentShell, classicShell, 'renderStudentReportView phải trùng khớp renderClassicStudentReportView khi cờ tắt')

  // Inner report check
  const data = sampleReportData()
  renderClassicReportInner(data)
  const classicInnerHtml = activeDocumentHtml

  renderMochiReportInner(data)
  // Khi gọi trực tiếp renderClassicReportInner vs cờ tắt qua renderReportInner:
  assert.ok(classicInnerHtml.includes('report-hero'), 'Bản classic chứa class .report-hero')
  assert.ok(classicInnerHtml.includes('report-kpi-grid'), 'Bản classic chứa class .report-kpi-grid')
  assert.ok(!classicInnerHtml.includes('m-report-hero'), 'Bản classic không có .m-report-hero')
  assert.ok(!classicInnerHtml.includes('m-report-stats-grid'), 'Bản classic không có .m-report-stats-grid')
})

test('cờ Mochi bật nhưng role ADMIN: giữ nguyên output classic, không hiển thị Mochi view', () => {
  useAdmin()
  setMochi(true)

  const classicShell = renderClassicStudentReportView()
  const currentShell = renderStudentReportView()
  assert.equal(currentShell, classicShell, 'ADMIN mở student report phải dùng 100% shell classic')
  assert.ok(!currentShell.includes('m-student-page'), 'ADMIN shell không chứa m-student-page')
  assert.ok(!currentShell.includes('m-report-page'), 'ADMIN shell không chứa m-report-page')

  const data = sampleReportData()
  renderClassicReportInner(data, { includeSharePanel: true })
  const adminInnerHtml = activeDocumentHtml
  assert.ok(adminInnerHtml.includes('report-share-panel'), 'ADMIN view chứa panel chia sẻ báo cáo')
  assert.ok(!adminInnerHtml.includes('m-report-hero'), 'ADMIN view không chứa header Mochi')
})

test('#shared-report (công khai, không đăng nhập): giữ nguyên layout classic', () => {
  setMochi(true)
  window.location.hash = '#shared-report?token=123e4567-e89b-12d3-a456-426614174000.AbCdEfGhIjKlMnOpQrStUvWxYz0123456789_-abcde'

  const publicHtml = renderSharedReportView()
  assert.ok(publicHtml.includes('public-report-layout'), 'Chứa class public-report-layout')
  assert.ok(publicHtml.includes('shared-report-body'), 'Chứa id shared-report-body')
  assert.ok(publicHtml.includes('report-public-bar'), 'Chứa thanh branding công khai')
  assert.ok(!publicHtml.includes('m-student-page'), 'Public report không chứa m-student-page')
  assert.ok(!publicHtml.includes('m-report-page'), 'Public report không chứa m-report-page')

  window.location.hash = '#student-report?fromDate=2026-10-01&toDate=2026-10-31'
})

test('cờ Mochi bật + STUDENT: #student-report có đầy đủ layout Mochi, sticker, hero, linh vật và thẻ số liệu', () => {
  useStudent()
  setMochi(true)

  const shellHtml = renderStudentReportView()
  assert.ok(shellHtml.includes('m-student-page'), 'Shell Mochi có class m-student-page')
  assert.ok(shellHtml.includes('m-report-page'), 'Shell Mochi có class m-report-page')
  assert.ok(shellHtml.includes('m-page-wrap'), 'Shell Mochi có khung .m-page-wrap')
  assert.ok(shellHtml.includes('id="student-report-body"'), 'Shell Mochi bảo toàn id student-report-body')
  assert.ok(shellHtml.includes('id="btn-report-back"'), 'Shell Mochi có nút quay lại với id btn-report-back')
  assert.ok(shellHtml.includes('href="#history"'), 'Nút quay lại trỏ về #history cho học sinh')

  // Render dữ liệu Mochi
  const data = sampleReportData()
  renderMochiReportInner(data)
  const innerHtml = activeDocumentHtml

  // 1. Hero
  assert.ok(innerHtml.includes('m-report-hero'), 'Chứa hero Mochi .m-report-hero')
  assert.ok(innerHtml.includes('Nguyễn Văn An'), 'Hero chứa tên học sinh')
  assert.ok(innerHtml.includes('Lớp 12A1'), 'Hero chứa tên lớp')
  assert.ok(innerHtml.includes('Kỳ: 1/10/2026 – 31/10/2026'), 'Hero chứa kỳ báo cáo đã định dạng tiếng Việt')
  assert.ok(innerHtml.includes('30 ngày'), 'Hero chứa số ngày trong kỳ')
  assert.ok(innerHtml.includes('Xu hướng: Cải thiện'), 'Hero chứa chip xu hướng')
  assert.ok(innerHtml.includes('m-mascot'), 'Hero chứa linh vật SVG m-mascot')
  assert.ok(innerHtml.includes('aria-hidden="true"'), 'Linh vật SVG có aria-hidden="true"')

  // 2. Summary stats (8 thẻ sticker)
  assert.ok(innerHtml.includes('m-report-stats-grid'), 'Chứa grid thẻ số liệu Mochi')
  assert.ok(innerHtml.includes('Bài được giao'), 'Có thẻ Bài được giao')
  assert.ok(innerHtml.includes('Bài đã nộp'), 'Có thẻ Bài đã nộp')
  assert.ok(innerHtml.includes('Tỷ lệ hoàn thành'), 'Có thẻ Tỷ lệ hoàn thành')
  assert.ok(innerHtml.includes('83.33%'), 'Hiển thị đúng 83.33%')
  assert.ok(innerHtml.includes('Nộp đúng hạn'), 'Có thẻ Nộp đúng hạn')
  assert.ok(innerHtml.includes('90%'), 'Hiển thị đúng 90% nộp đúng hạn')
  assert.ok(innerHtml.includes('Điểm trung bình'), 'Có thẻ Điểm trung bình')
  assert.ok(innerHtml.includes('8.5'), 'Hiển thị đúng điểm trung bình 8.5')
  assert.ok(innerHtml.includes('Điểm cao nhất'), 'Có thẻ Điểm cao nhất')
  assert.ok(innerHtml.includes('Điểm thấp nhất'), 'Có thẻ Điểm thấp nhất')
  assert.ok(innerHtml.includes('Ngày hoạt động'), 'Có thẻ Ngày hoạt động')
  assert.ok(innerHtml.includes('m-stat-card'), 'Thẻ dùng class .m-stat-card')

  // 3. Biểu đồ xu hướng điểm
  assert.ok(innerHtml.includes('id="report-trend-chart"'), 'Bảo toàn canvas id="report-trend-chart"')
  assert.ok(innerHtml.includes('m-report-chart-card'), 'Biểu đồ đặt trong card Mochi')
  assert.ok(innerHtml.includes('m-report-chart-legend'), 'Có chú giải biểu đồ Mochi')

  // 4. So sánh nửa đầu – nửa cuối
  assert.ok(innerHtml.includes('m-report-trend-card'), 'Chứa card so sánh xu hướng')
  assert.ok(innerHtml.includes('Nửa đầu'), 'Có nhãn Nửa đầu')
  assert.ok(innerHtml.includes('Nửa cuối'), 'Có nhãn Nửa cuối')
  assert.ok(innerHtml.includes('▲ +1.2'), 'Delta điểm trung bình dương có mũi tên tăng (7.8 -> 9.0 = +1.2)')

  // 5. Phân tích theo chương
  assert.ok(innerHtml.includes('m-report-topic-card'), 'Chứa card phân tích theo chương')
  assert.ok(innerHtml.includes('Chương 1: Ứng dụng đạo hàm'), 'Hiển thị tên chương 1')
  assert.ok(innerHtml.includes('Chương 2: Hàm số lũy thừa'), 'Hiển thị tên chương 2')
  assert.ok(innerHtml.includes('Nắm vững'), 'Chương điểm cao có chip Nắm vững')
  assert.ok(innerHtml.includes('Cần củng cố'), 'Chương điểm yếu có chip Cần củng cố')
  assert.ok(innerHtml.includes('m-progress'), 'Có thanh tiến độ .m-progress')

  // 6. Danh sách lượt nộp
  assert.ok(innerHtml.includes('m-report-table-card'), 'Chứa card bảng danh sách lượt nộp')
  assert.ok(innerHtml.includes('m-report-table-wrap'), 'Bảng bọc trong wrap cuộn ngang chống tràn')
  assert.ok(innerHtml.includes('m-report-table'), 'Bảng dùng class .m-report-table')
  assert.ok(innerHtml.includes('BEST'), 'Có badge BEST')
  assert.ok(innerHtml.includes('ĐẠT'), 'Có badge ĐẠT')
})

test('dữ liệu rỗng: render an toàn, có thông báo hướng dẫn, không crash', () => {
  useStudent()
  setMochi(true)

  const emptyData = {
    studentName: 'Trần Thị Mai',
    className: 'Lớp 11B2',
    period: { fromDate: '2026-10-01', toDate: '2026-10-31', days: 30 },
    summary: { assignedCount: 5, submittedCount: 0, completionRate: 0, onTimeRate: 0, averageScore: 0, highestScore: 0, lowestScore: 0, activeDays: 0, attemptCount: 0 },
    comparison: { trend: 'STABLE', firstHalf: {}, secondHalf: {} },
    scoreTrend: [],
    topicBreakdown: [],
    submissions: [],
    isEmpty: true
  }

  assert.doesNotThrow(() => {
    renderMochiReportInner(emptyData)
  }, 'Dữ liệu rỗng không được gây exception')

  const innerHtml = activeDocumentHtml
  assert.ok(innerHtml.includes('m-report-empty-banner'), 'Chứa banner thông báo học sinh chưa có lượt nộp')
  assert.ok(!innerHtml.includes('id="report-trend-chart"'), 'Không render canvas biểu đồ khi dữ liệu rỗng')
  assert.ok(innerHtml.includes('Chưa có lượt nộp nào trong kỳ báo cáo'), 'Thông báo bảng nộp bài trống')
  assert.ok(innerHtml.includes('Chưa có dữ liệu theo chương'), 'Thông báo phân tích chương trống')
})

test('bảo toàn tập ID chức năng: không có ID nào bị mất giữa classic và Mochi', () => {
  useStudent()

  // Shell IDs
  setMochi(false)
  const classicShell = renderClassicStudentReportView()
  setMochi(true)
  const mochiShell = renderStudentReportView()

  assert.ok(classicShell.includes('id="student-report-body"'))
  assert.ok(mochiShell.includes('id="student-report-body"'))

  // Inner report IDs
  const data = sampleReportData()
  renderClassicReportInner(data)
  const classicInner = activeDocumentHtml
  renderMochiReportInner(data)
  const mochiInner = activeDocumentHtml

  assert.ok(classicInner.includes('id="report-trend-chart"'))
  assert.ok(mochiInner.includes('id="report-trend-chart"'))
})

test('MOCHI_FEATURES: streak, xp, badges, leaderboard không xuất hiện', () => {
  useStudent()
  setMochi(true)

  const data = sampleReportData()
  renderMochiReportInner(data)
  const innerHtml = activeDocumentHtml

  assert.ok(!innerHtml.includes('streak'), 'Không có streak')
  assert.ok(!innerHtml.includes('leaderboard'), 'Không có leaderboard')
  assert.ok(!innerHtml.includes('bảng xếp hạng'), 'Không có bảng xếp hạng')
  assert.ok(!innerHtml.includes('điểm kinh nghiệm'), 'Không có điểm kinh nghiệm')
})

test('reportChartPalette: trả về màu sắc chuẩn xác cho cả 4 chế độ màu (light, dark, sakura, mint)', () => {
  useStudent()
  setMochi(true)

  const mockCanvas = {
    closest: (sel) => {
      if (sel.includes('.m-student-page')) return true
      return null
    }
  }

  // 1. Dark theme
  docElement.dataset.studentTheme = 'dark'
  const darkPalette = reportChartPalette(mockCanvas)
  assert.equal(darkPalette.text, '#B9B0DA')
  assert.equal(darkPalette.legend, '#F4F0FF')
  assert.equal(darkPalette.pointBorder, '#1E1A38')
  assert.ok(darkPalette.line.includes('161, 141, 255'))

  // 2. Sakura theme
  docElement.dataset.studentTheme = 'sakura'
  const sakuraPalette = reportChartPalette(mockCanvas)
  assert.equal(sakuraPalette.text, '#74505F')
  assert.equal(sakuraPalette.legend, '#3A1E2E')
  assert.ok(sakuraPalette.line.includes('194, 40, 95'))

  // 3. Mint theme
  docElement.dataset.studentTheme = 'mint'
  const mintPalette = reportChartPalette(mockCanvas)
  assert.equal(mintPalette.text, '#46675D')
  assert.equal(mintPalette.legend, '#0F3329')
  assert.ok(mintPalette.line.includes('10, 122, 96'))

  // 4. Light theme
  docElement.dataset.studentTheme = 'light'
  const lightPalette = reportChartPalette(mockCanvas)
  assert.equal(lightPalette.text, '#625A78')
  assert.equal(lightPalette.legend, '#2B2340')
  assert.ok(lightPalette.line.includes('106, 76, 240'))
})

test('CSS file test: student-report.css scoped under html[data-ui="mochi"]', () => {
  const css = readFileSync(new URL('../src/css/mochi/student-report.css', import.meta.url), 'utf8')

  // Mọi selector quy tắc (ngoài @media, @keyframes, comment) phải bắt đầu bằng html[data-ui="mochi"]
  const lines = css.split('\n')
  for (const line of lines) {
    const trimmed = line.trim()
    if (!trimmed || trimmed.startsWith('/*') || trimmed.startsWith('*') || trimmed.startsWith('//') || trimmed.startsWith('@') || trimmed.startsWith('}') || trimmed.includes('{') === false) {
      continue
    }
    // Dòng chứa selector
    const selectorPart = trimmed.split('{')[0].trim()
    const selectors = selectorPart.split(',').map(s => s.trim())
    for (const sel of selectors) {
      if (sel.startsWith('@')) continue
      assert.ok(
        sel.startsWith('html[data-ui="mochi"]'),
        `Selector "${sel}" trong student-report.css phải được scope dưới html[data-ui="mochi"]`
      )
    }
  }

  // Responsive breakpoints
  assert.ok(css.includes('@media (max-width: 900px)'), 'Có breakpoint tablet <=900px')
  assert.ok(css.includes('@media (max-width: 640px)'), 'Có breakpoint mobile <=640px')
  assert.ok(css.includes('overflow-x: auto'), 'Bảng có cơ chế cuộn ngang trong khung')
})

test('fix 1: khoảng cách dọc giữa các mục và bảo vệ tiêu đề không bị che', () => {
  const css = readFileSync(new URL('../src/css/mochi/student-report.css', import.meta.url), 'utf8')
  assert.ok(css.includes('gap: 28px'), 'Desktop #student-report-body có gap ≈ 28px')
  assert.ok(css.includes('gap: 20px'), 'Mobile #student-report-body có gap 20px')
  assert.ok(css.includes('.m-report-section-head'), 'Có class head cho tiêu đề mục')
  assert.ok(css.includes('z-index: 1'), 'Tiêu đề có z-index: 1 để không bị thẻ/shadow phía trên che')
})

test('fix 2: mobile hero ôm sát nội dung, linh vật nhỏ (72px) đặt trên/cạnh tiêu đề, không có min-height/stretch thừa', () => {
  const css = readFileSync(new URL('../src/css/mochi/student-report.css', import.meta.url), 'utf8')
  assert.ok(css.includes('width: 72px') && css.includes('height: 72px'), 'Linh vật trên mobile có kích thước 72px')
  assert.ok(css.includes('order: -1'), 'Linh vật được đặt phía trên tiêu đề trên mobile')
  assert.ok(css.includes('min-height: auto'), 'Hero và copy có min-height: auto, ôm trọn nội dung')
})

test('fix 3: chip "Báo cáo tiến độ" inline-flex, width: auto và có gap giữa icon và chữ', () => {
  const css = readFileSync(new URL('../src/css/mochi/student-report.css', import.meta.url), 'utf8')
  assert.ok(css.includes('.m-report-hero .m-chip') || css.includes('.m-report-hero-copy .m-chip'), 'Có rule cho chip trong hero')
  assert.ok(css.includes('align-self: flex-start'), 'Chip trong hero không bị kéo dãn hết chiều ngang')
  assert.ok(css.includes('width: auto'), 'Chip hero có width: auto')
  assert.ok(css.includes('gap: 6px'), 'Chip hero có khoảng cách giữa icon và chữ')
})

test('fix 4: chế độ tối: nút quay lại, nút thử lại và thẻ lỗi dùng token --m-*', () => {
  const css = readFileSync(new URL('../src/css/mochi/student-report.css', import.meta.url), 'utf8')
  // Nút quay lại
  assert.ok(css.includes('m-report-back-btn') && css.includes('background: var(--m-surface) !important'), 'Nút quay lại dùng nền --m-surface')
  assert.ok(css.includes('border: 2px solid var(--m-ink) !important'), 'Nút quay lại dùng viền --m-ink')
  // Nút thử lại
  assert.ok(css.includes('#report-retry-btn') && css.includes('background: var(--m-accent) !important'), 'Nút thử lại dùng nền --m-accent')
  assert.ok(css.includes('color: var(--m-accent-ink) !important'), 'Nút thử lại dùng chữ --m-accent-ink')
  // Thẻ lỗi
  assert.ok(css.includes('m-report-state-card') && css.includes('border: 2px solid var(--m-line) !important'), 'Thẻ lỗi dùng viền --m-line thay vì viền đỏ cũ')
})

test('fix 5: hero ẩn dòng lớp khi thiếu tên lớp (chỉ có id), không làm thay đổi resolveNames và classic', () => {
  useStudent()
  setMochi(true)
  state.classes = [] // không có cache tên lớp trong state
  state.reportParams = { studentId: 'student-101', classId: '11111111-2222-3333-4444-555555555555', fromDate: '2026-10-01', toDate: '2026-10-31' }

  // 1. Trường hợp Mochi nhận fallback id: "Lớp 11111111…" -> phải ẩn dòng lớp
  const dataWithIdOnly = {
    ...sampleReportData(),
    className: 'Lớp 11111111…'
  }
  renderMochiReportInner(dataWithIdOnly)
  const mochiIdOnlyHtml = activeDocumentHtml
  assert.ok(!mochiIdOnlyHtml.includes('11111111'), 'Mochi không hiển thị id hoặc "Lớp 11111111…"')
  assert.ok(!mochiIdOnlyHtml.includes('fa-graduation-cap'), 'Mochi ẩn toàn bộ icon/dòng lớp khi thiếu tên lớp')

  // 2. Trường hợp Mochi có tên lớp thật -> phải hiển thị tên lớp
  const dataWithRealName = {
    ...sampleReportData(),
    className: 'Lớp 12A1'
  }
  renderMochiReportInner(dataWithRealName)
  const mochiRealHtml = activeDocumentHtml
  assert.ok(mochiRealHtml.includes('Lớp 12A1'), 'Mochi hiển thị tên lớp thật khi có')
  assert.ok(mochiRealHtml.includes('fa-graduation-cap'), 'Mochi hiển thị icon mũ tốt nghiệp khi có tên lớp')

  // 3. Classic view giữ nguyên: vẫn hiển thị fallback như cũ, không bị thay đổi
  setMochi(false)
  renderClassicReportInner(dataWithIdOnly)
  const classicHtml = activeDocumentHtml
  assert.ok(classicHtml.includes('Lớp 11111111…'), 'Classic vẫn giữ nguyên fallback tên lớp')
})
