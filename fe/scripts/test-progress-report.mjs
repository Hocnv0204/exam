import test from 'node:test'
import assert from 'node:assert/strict'

// Stub browser environment for node testing
const storage = new Map()
globalThis.localStorage = {
  getItem: key => storage.get(key) ?? null,
  setItem: (key, value) => storage.set(key, String(value)),
  removeItem: key => storage.delete(key),
  clear: () => storage.clear()
}
globalThis.sessionStorage = globalThis.localStorage
globalThis.window = globalThis
globalThis.document = {
  head: null,
  documentElement: { dataset: {}, style: {} },
  addEventListener: () => {},
  dispatchEvent: () => {}
}

const {
  renderProgressReport,
  ratingFor,
  trendFor,
  masteryFor,
  levelLabel,
  formatScore,
  levelSentence,
  autoSummary
} = await import('../src/js/views/report/progress-report.js')

test('ratingFor: xếp loại và kiểm tra giá trị biên', () => {
  // >= 8: Tốt
  assert.equal(ratingFor(10).key, 'good')
  assert.equal(ratingFor(10).label, 'Tốt')
  assert.equal(ratingFor(8.0).key, 'good')
  assert.equal(ratingFor(8.0).label, 'Tốt')

  // >= 6.5 và < 8: Khá
  assert.equal(ratingFor(7.9).key, 'fair')
  assert.equal(ratingFor(7.9).label, 'Khá')
  assert.equal(ratingFor(6.5).key, 'fair')
  assert.equal(ratingFor(6.5).label, 'Khá')

  // >= 5 và < 6.5: Cần cố gắng
  assert.equal(ratingFor(6.4).key, 'try')
  assert.equal(ratingFor(6.4).label, 'Cần cố gắng')
  assert.equal(ratingFor(5.0).key, 'try')
  assert.equal(ratingFor(5.0).label, 'Cần cố gắng')

  // < 5: Cần hỗ trợ ngay
  assert.equal(ratingFor(4.9).key, 'help')
  assert.equal(ratingFor(4.9).label, 'Cần hỗ trợ ngay')
  assert.equal(ratingFor(0).key, 'help')
  assert.equal(ratingFor(0).label, 'Cần hỗ trợ ngay')

  // null / undefined / NaN: none (Chưa có điểm)
  assert.equal(ratingFor(null).key, 'none')
  assert.equal(ratingFor(null).label, 'Chưa có điểm')
  assert.equal(ratingFor(undefined).key, 'none')
  assert.equal(ratingFor(NaN).key, 'none')
  assert.equal(ratingFor('').key, 'none')
})

test('trendFor: xu hướng điểm số và ngưỡng ±0,25', () => {
  // delta > 0.25 -> up
  const up = trendFor(8.0, 7.5)
  assert.equal(up.key, 'up')
  assert.equal(up.arrow, '↑')
  assert.equal(up.label, '+0,5')
  assert.equal(up.delta, 0.5)

  // delta > 0.25 biên
  const upBorder = trendFor(8.26, 8.0)
  assert.equal(upBorder.key, 'up')
  assert.equal(upBorder.arrow, '↑')

  // delta < -0.25 -> down
  const down = trendFor(7.2, 8.0)
  assert.equal(down.key, 'down')
  assert.equal(down.arrow, '↓')
  assert.equal(down.label, '-0,8')
  assert.equal(down.delta, -0.8)

  // delta < -0.25 biên
  const downBorder = trendFor(7.74, 8.0)
  assert.equal(downBorder.key, 'down')
  assert.equal(downBorder.arrow, '↓')

  // trong khoảng [-0.25, 0.25] -> flat
  const flatExact = trendFor(8.0, 8.0)
  assert.equal(flatExact.key, 'flat')
  assert.equal(flatExact.arrow, '→')
  assert.equal(flatExact.label, '0,0')

  const flatBorderPos = trendFor(8.25, 8.0)
  assert.equal(flatBorderPos.key, 'flat')
  assert.equal(flatBorderPos.arrow, '→')

  const flatBorderNeg = trendFor(7.75, 8.0)
  assert.equal(flatBorderNeg.key, 'flat')
  assert.equal(flatBorderNeg.arrow, '→')

  // Dữ liệu thiếu / null
  const noneCurr = trendFor(null, 8.0)
  assert.equal(noneCurr.key, 'none')
  assert.equal(noneCurr.arrow, '')
  assert.equal(noneCurr.label, 'Chưa có kỳ trước để so sánh')
  assert.equal(noneCurr.delta, null)

  const nonePrev = trendFor(8.0, null)
  assert.equal(nonePrev.key, 'none')
  assert.equal(nonePrev.arrow, '')
  assert.equal(nonePrev.label, 'Chưa có kỳ trước để so sánh')
})

test('masteryFor: mức độ nắm chuyên đề', () => {
  // >= 8: solid ✓
  assert.deepEqual(masteryFor(10), { key: 'solid', symbol: '✓', label: 'Đã vững' })
  assert.deepEqual(masteryFor(8.0), { key: 'solid', symbol: '✓', label: 'Đã vững' })

  // >= 6.5 và < 8: ok ~
  assert.deepEqual(masteryFor(7.9), { key: 'ok', symbol: '~', label: 'Tạm ổn' })
  assert.deepEqual(masteryFor(6.5), { key: 'ok', symbol: '~', label: 'Tạm ổn' })

  // < 6.5: weak ✗
  assert.deepEqual(masteryFor(6.4), { key: 'weak', symbol: '✗', label: 'Chưa đạt' })
  assert.deepEqual(masteryFor(0), { key: 'weak', symbol: '✗', label: 'Chưa đạt' })
  assert.deepEqual(masteryFor(null), { key: 'weak', symbol: '✗', label: 'Chưa đạt' })
})

test('levelLabel: chuyển đổi mã mức độ tư duy sang tiếng Việt', () => {
  assert.equal(levelLabel('NHAN_BIET'), 'Nhận biết')
  assert.equal(levelLabel('THONG_HIEU'), 'Thông hiểu')
  assert.equal(levelLabel('VAN_DUNG'), 'Vận dụng')
  assert.equal(levelLabel('VAN_DUNG_CAO'), 'Vận dụng cao')
  assert.equal(levelLabel(null), '—')
})

test('formatScore: 1 chữ số thập phân, dấu phẩy, null -> —', () => {
  assert.equal(formatScore(7.5), '7,5')
  assert.equal(formatScore(8), '8,0')
  assert.equal(formatScore(9.25), '9,3')
  assert.equal(formatScore(0), '0,0')
  assert.equal(formatScore(null), '—')
  assert.equal(formatScore(undefined), '—')
  assert.equal(formatScore(NaN), '—')
  assert.equal(formatScore(''), '—')
})

test('levelSentence: sinh câu nhận xét tự nhiên không dùng thuật ngữ trần', () => {
  const breakdownGoodBasic = [
    { level: 'NHAN_BIET', correct: 10, total: 10, rate: 100 },
    { level: 'THONG_HIEU', correct: 8, total: 10, rate: 80 },
    { level: 'VAN_DUNG', correct: 3, total: 10, rate: 30 },
    { level: 'VAN_DUNG_CAO', correct: 0, total: 5, rate: 0 }
  ]
  const sentence = levelSentence(breakdownGoodBasic)
  assert.equal(sentence, 'Làm tốt câu cơ bản, còn lúng túng ở bài vận dụng.')
  assert.doesNotMatch(sentence, /NHAN_BIET|THONG_HIEU|VAN_DUNG/)

  const emptySentence = levelSentence([])
  assert.equal(emptySentence, 'Chưa có đủ dữ liệu phân tích mức độ tư duy.')
})

test('autoSummary: tạo nhận xét tổng quát tiến bộ trước, cải thiện sau khi notes null', () => {
  const summary = autoSummary({
    summary: { averageScore: 8.5, completionRate: 90, submittedCount: 10 },
    previousPeriod: { summary: { averageScore: 7.5 } },
    topicBreakdown: [
      { topicTitle: 'Đạo hàm', averageScore: 9.0 },
      { topicTitle: 'Hình không gian', averageScore: 5.5 }
    ],
    commonMistakes: [{ questionType: 'Tìm cực trị hàm hợp', wrongCount: 3 }]
  })

  assert.match(summary, /tiến bộ/i)
  assert.match(summary, /8,5/)
  assert.match(summary, /hoàn thành.*90%/)
  assert.match(summary, /Hình không gian/)
})

test('renderProgressReport: hiển thị đầy đủ 6 mục với ký hiệu ✓ ~ ✗, mũi tên và SVG', () => {
  const fullReport = {
    studentName: 'Nguyễn Văn A',
    className: 'Toán 12 VIP',
    period: { fromDate: '2026-11-01', toDate: '2026-11-25', days: 25 },
    summary: {
      averageScore: 8.2,
      highestScore: 10.0,
      lowestScore: 6.5,
      completionRate: 92,
      onTimeRate: 88,
      assignedCount: 12,
      submittedCount: 11,
      attemptCount: 15
    },
    previousPeriod: {
      fromDate: '2026-10-01',
      toDate: '2026-10-25',
      summary: { averageScore: 7.4, completionRate: 85, onTimeRate: 80, submittedCount: 10 }
    },
    classAverage: { averageScore: 7.1, studentCount: 20 },
    weeklyTrend: [
      { weekStart: '2026-11-01', averageScore: 7.5, classAverageScore: 7.0, submissions: 3 },
      { weekStart: '2026-11-08', averageScore: 8.0, classAverageScore: 7.2, submissions: 3 },
      { weekStart: '2026-11-15', averageScore: 8.5, classAverageScore: 7.1, submissions: 3 },
      { weekStart: '2026-11-22', averageScore: 8.8, classAverageScore: 7.3, submissions: 2 }
    ],
    scoreTrend: [
      {
        homeworkTitle: 'Đề thi giữa kỳ 1',
        homeworkType: 'EXAM',
        score: 8.5,
        maxScore: 10,
        isPassed: true,
        isBest: true,
        date: '2026-11-10'
      },
      {
        homeworkTitle: 'Bài tập tuần 1',
        homeworkType: 'HOMEWORK',
        score: 6.0,
        maxScore: 10,
        isPassed: true,
        isBest: true,
        date: '2026-11-03'
      }
    ],
    topicBreakdown: [
      { topicTitle: 'Khảo sát hàm số', averageScore: 8.5, submittedCount: 5, assignedCount: 5, completionRate: 100 },
      { topicTitle: 'Khối đa diện', averageScore: 7.0, submittedCount: 4, assignedCount: 4, completionRate: 100 },
      { topicTitle: 'Số phức cơ bản', averageScore: 6.0, submittedCount: 2, assignedCount: 3, completionRate: 67 }
    ],
    levelBreakdown: [
      { level: 'NHAN_BIET', correct: 20, total: 20, rate: 100 },
      { level: 'THONG_HIEU', correct: 18, total: 20, rate: 90 },
      { level: 'VAN_DUNG', correct: 8, total: 15, rate: 53 },
      { level: 'VAN_DUNG_CAO', correct: 2, total: 10, rate: 20 }
    ],
    commonMistakes: [
      { questionType: 'Tính đơn điệu hàm hợp chứa tham số m', wrongCount: 4 },
      { questionType: 'Góc giữa hai mặt phẳng trong không gian', wrongCount: 2 }
    ],
    attendance: {
      summary: {
        classSessions: 8,
        countedSessions: 8,
        present: 7,
        absent: 1,
        notCounted: 0,
        attendanceRate: 87.5,
        classAverageRate: 82.0
      },
      sessions: []
    },
    goalPrevious: {
      goalScore: 8.0,
      goalText: 'Đạt điểm TB 8.0 trở lên',
      fromDate: '2026-10-01',
      toDate: '2026-10-25'
    },
    notes: {
      summary: 'Em A đã có nhiều tiến bộ trong tháng vừa qua, đặc biệt là phần khảo sát hàm số.',
      strengths: 'Chăm chỉ làm bài, nắm chắc kiến thức cơ bản.',
      improvements: 'Cần cẩn thận hơn khi làm các câu vận dụng cao có tham số.',
      attitude: 'Ngoan ngoãn, tập trung phát biểu trong giờ học.',
      goalText: 'Tăng tốc giải đề thi thử',
      goalScore: 8.5,
      teacherSupport: 'Kèm riêng phần góc và khoảng cách trong hình học.',
      parentActions: 'Nhắc nhở con ngủ sớm trước ngày thi.',
      updatedAt: '2026-11-24',
      isSaved: true
    },
    isEmpty: false
  }

  const html = renderProgressReport(fullReport, {
    variant: 'pro',
    canEditNotes: true
  })

  // 1. Kiểm tra cấu trúc vỏ ngoài
  assert.match(html, /<article class="pr-report pr-report--pro">/)

  // 2. Đầu trang
  assert.match(html, /BÁO CÁO TIẾN ĐỘ HỌC TẬP/)
  assert.match(html, /Nguyễn Văn A/)
  assert.match(html, /Toán 12 VIP/)
  assert.match(html, /01\/11\/2026 – 25\/11\/2026/)
  // Người dùng bỏ dòng "Giáo viên phụ trách" (2026-11-25): không in tên/SĐT/email giáo viên trên đầu báo cáo.
  assert.doesNotMatch(html, /Giáo viên phụ trách|0349097659|nguyenhh1102/)
  assert.match(html, /data-pr-action="print"/)
  assert.match(html, /data-pr-action="edit-notes"/)

  // 3. Khung tóm tắt nổi bật
  assert.match(html, /8,2/)
  assert.match(html, /Tốt/)
  assert.match(html, /↑/)
  assert.match(html, /\+0,8/)
  assert.match(html, /TB lớp: 7,1 \(tham khảo\)/)
  assert.match(html, /Mục tiêu kỳ trước/)
  assert.match(html, /Đạt ✓/)

  // 4. Chuyên cần & bài tập
  assert.match(html, /7\/8 buổi/)
  assert.match(html, /1 buổi/)
  assert.match(html, /87,5%/)
  assert.match(html, /TB lớp: 82%/)
  assert.match(html, /92%/)
  assert.match(html, /Ngoan ngoãn, tập trung phát biểu/)

  // 5. Kết quả học tập (SVG inline & bảng bài thi)
  assert.match(html, /<svg class="pr-chart-svg"/)
  assert.match(html, /<title>Biểu đồ đường điểm trung bình theo tuần<\/title>/)
  assert.match(html, /aria-label="Biểu đồ đường điểm trung bình theo tuần"/)
  assert.match(html, /Đề thi giữa kỳ 1/)
  assert.match(html, /Đạt ✓/)

  // 6. Mức độ nắm kiến thức (✓, ~, ✗)
  assert.match(html, /Khảo sát hàm số/)
  assert.match(html, /✓ Đã vững/)
  assert.match(html, /~ Tạm ổn/)
  assert.match(html, /✗ Chưa đạt/)
  assert.match(html, /Tính đơn điệu hàm hợp/)

  // 7. Nhận xét & kế hoạch
  assert.match(html, /<section class="pr-section pr-notes" data-pr-notes>/)
  assert.match(html, /Chăm chỉ làm bài/)
  assert.match(html, /Đạt TB từ 8,5/)
  assert.match(html, /Kèm riêng phần góc/)
  assert.match(html, /Nhắc nhở con ngủ sớm/)
})

test('renderProgressReport với dữ liệu backend cũ: không in NaN, undefined, null', () => {
  const legacyReport = {
    studentName: 'Học sinh cũ',
    className: 'Lớp 11A',
    period: { fromDate: '2026-10-01', toDate: '2026-10-31', days: 30 },
    summary: {
      averageScore: 7.0,
      highestScore: 8.0,
      lowestScore: 6.0,
      completionRate: 80,
      onTimeRate: 75,
      assignedCount: 8,
      submittedCount: 6,
      attemptCount: 8
    },
    // Không có: previousPeriod, classAverage, weeklyTrend, levelBreakdown, commonMistakes, notes, goalPrevious
    scoreTrend: [
      { homeworkTitle: 'Bài tập 1', score: 7.0, maxScore: 10, isPassed: true }
    ],
    topicBreakdown: [
      { topicTitle: 'Hàm số lượng giác', averageScore: 7.0 }
    ],
    submissions: [],
    attendance: null,
    isEmpty: false
  }

  const html = renderProgressReport(legacyReport, { variant: 'pro', canEditNotes: false })

  // Tuyệt đối không xuất hiện NaN, undefined, null dưới dạng chữ trên giao diện
  assert.doesNotMatch(html, />NaN</)
  assert.doesNotMatch(html, />undefined</)
  assert.doesNotMatch(html, />null</)
  assert.doesNotMatch(html, /NaN\s/)
  assert.doesNotMatch(html, /undefined\s/)
  assert.doesNotMatch(html, /null\s/)

  // Khối thiếu hiển thị thông báo trung tính
  assert.match(html, /Chưa có kỳ trước để so sánh/)
  assert.match(html, /Chưa có dữ liệu điểm danh/)
  assert.match(html, /Chưa có dữ liệu xu hướng theo tuần/)
  assert.match(html, /Chưa có dữ liệu phân tích mức độ tư duy/)
  assert.match(html, /Chưa phát hiện dạng bài sai lặp lại/)
})

test('XSS: chống chèn mã độc trong tên, bài làm và nhận xét', () => {
  const xssReport = {
    studentName: '<script>alert("xss-name")</script>',
    className: '<b onmouseover="alert(1)">Lớp XSS</b>',
    period: { fromDate: '2026-11-01', toDate: '2026-11-25' },
    summary: { averageScore: 8.0 },
    scoreTrend: [{ homeworkTitle: '<img src=x onerror=alert(2)>', score: 8.0, isPassed: true }],
    topicBreakdown: [{ topicTitle: '<script>alert(3)</script>', averageScore: 8.0 }],
    commonMistakes: [{ questionType: '<iframe src="evil.com"></iframe>', wrongCount: 2 }],
    notes: {
      summary: '<img src=x onerror=alert("summary")>\nDòng thứ hai',
      strengths: '<script>alert("strengths")</script>',
      improvements: '<b>In đậm an toàn</b>',
      attitude: '<svg onload=alert(4)>',
      goalText: '<a href="javascript:alert(5)">Bấm vào đây</a>',
      goalScore: 9.0
    }
  }

  const html = renderProgressReport(xssReport, { variant: 'pro' })

  // Đảm bảo không có thẻ HTML thực thi mã script hoặc handler nguy hiểm
  assert.doesNotMatch(html, /<script>/i)
  assert.doesNotMatch(html, /<img [^>]*onerror/i)
  assert.doesNotMatch(html, /<b [^>]*onmouseover/i)
  assert.doesNotMatch(html, /<svg [^>]*onload/i)
  assert.doesNotMatch(html, /<iframe/i)
  assert.doesNotMatch(html, /<a [^>]*href="javascript:/i)

  // Đảm bảo đã được escape thành entity HTML an toàn
  assert.match(html, /&lt;script&gt;alert\(&quot;xss-name&quot;\)&lt;\/script&gt;/)
  assert.match(html, /&lt;img src=x onerror=alert\(2\)&gt;/)
  assert.match(html, /&lt;img src=x onerror=alert\(&quot;summary&quot;\)&gt;<br>Dòng thứ hai/)
  assert.match(html, /&lt;b onmouseover=&quot;alert\(1\)&quot;&gt;Lớp XSS&lt;\/b&gt;/)
  assert.match(html, /&lt;svg onload=alert\(4\)&gt;/)
  assert.match(html, /&lt;a href=&quot;javascript:alert\(5\)&quot;&gt;Bấm vào đây&lt;\/a&gt;/)
})

test('shared + notes null: ẨN hẳn mục 6, không có data-pr-notes', () => {
  const report = {
    studentName: 'Bé Lan',
    className: 'Hóa 10',
    summary: { averageScore: 7.5 },
    notes: null
  }

  const html = renderProgressReport(report, { variant: 'shared' })
  assert.doesNotMatch(html, /data-pr-notes/)
  assert.doesNotMatch(html, /Nhận xét &amp; Kế hoạch/)
})

test('mochi + notes null: ẨN hẳn mục 6, không có data-pr-notes', () => {
  const report = {
    studentName: 'Bé Lan',
    className: 'Hóa 10',
    summary: { averageScore: 7.5 },
    notes: null
  }

  const html = renderProgressReport(report, { variant: 'mochi' })
  assert.doesNotMatch(html, /data-pr-notes/)
  assert.doesNotMatch(html, /Nhận xét &amp; Kế hoạch/)
})

test('pro + notes null: CÓ lời nhắc soạn nhận xét và data-pr-notes', () => {
  const report = {
    studentName: 'Học sinh Pro',
    className: 'Toán 12',
    summary: { averageScore: 7.5 },
    notes: null
  }

  const html = renderProgressReport(report, { variant: 'pro', canEditNotes: true })
  assert.match(html, /<section class="pr-section pr-notes" data-pr-notes>/)
  assert.match(html, /Chưa có nhận xét —/)
  assert.match(html, /Soạn nhận xét/)
})

test('canEditNotes: false ẩn nút soạn nhận xét, true hiển thị nút', () => {
  const report = {
    studentName: 'Học sinh Test',
    className: 'Lý 11',
    summary: { averageScore: 8.0 }
  }

  const htmlNoEdit = renderProgressReport(report, { variant: 'pro', canEditNotes: false })
  assert.doesNotMatch(htmlNoEdit, /data-pr-action="edit-notes"/)

  const htmlWithEdit = renderProgressReport(report, { variant: 'pro', canEditNotes: true })
  assert.match(htmlWithEdit, /data-pr-action="edit-notes"/)
})

test('isEmpty: hiển thị khung trống thân thiện nhưng vẫn có đầu trang và chuyên cần', () => {
  const emptyReport = {
    studentName: 'Học sinh Mới',
    className: 'Lớp Khởi đầu',
    period: { fromDate: '2026-11-01', toDate: '2026-11-25' },
    summary: { attemptCount: 0 },
    scoreTrend: [],
    attendance: {
      summary: { classSessions: 4, present: 4, absent: 0, attendanceRate: 100 }
    },
    isEmpty: true
  }

  const html = renderProgressReport(emptyReport, { variant: 'pro' })
  assert.match(html, /BÁO CÁO TIẾN ĐỘ HỌC TẬP/)
  assert.match(html, /Chuyên cần &amp; Bài tập/)
  assert.match(html, /Chưa có đủ dữ liệu bài làm trong kỳ/)
  assert.match(html, /pr-empty-box/)
})
