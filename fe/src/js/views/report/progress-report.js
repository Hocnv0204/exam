/**
 * Renderer báo cáo tiến độ học sinh mới (chuẩn hoá A4 in ấn, dùng chung Pro/Mochi/Shared).
 * Hàm thuần (pure template renderer), không đọc state, không gọi API.
 */

if (typeof document !== 'undefined' && document.head) {
  import('../../../css/report/progress-report.css')
}

import { escapeHtml } from '../../utils/download-helper.js'

/**
 * Xếp loại học lực theo điểm trung bình thang 10.
 * ≥8: Tốt | ≥6,5: Khá | ≥5: Cần cố gắng | <5: Cần hỗ trợ ngay | null: Chưa có điểm
 * @param {number|null|undefined} avg
 * @returns {{ key: 'good'|'fair'|'try'|'help'|'none', label: string, icon: string }}
 */
export function ratingFor(avg) {
  if (avg === null || avg === undefined || avg === '') {
    return { key: 'none', label: 'Chưa có điểm', icon: 'fa-regular fa-circle-question' }
  }
  const num = Number(avg)
  if (!Number.isFinite(num)) {
    return { key: 'none', label: 'Chưa có điểm', icon: 'fa-regular fa-circle-question' }
  }
  if (num >= 8) {
    return { key: 'good', label: 'Tốt', icon: 'fa-solid fa-star' }
  }
  if (num >= 6.5) {
    return { key: 'fair', label: 'Khá', icon: 'fa-solid fa-circle-check' }
  }
  if (num >= 5) {
    return { key: 'try', label: 'Cần cố gắng', icon: 'fa-solid fa-circle-exclamation' }
  }
  return { key: 'help', label: 'Cần hỗ trợ ngay', icon: 'fa-solid fa-triangle-exclamation' }
}

/**
 * Xu hướng điểm số so với kỳ liền trước (ngưỡng ±0,25).
 * @param {number|null|undefined} current
 * @param {number|null|undefined} previous
 * @returns {{ key: 'up'|'flat'|'down'|'none', arrow: '↑'|'→'|'↓'|'', label: string, delta: number|null }}
 */
export function trendFor(current, previous) {
  if (
    current === null || current === undefined || current === '' ||
    previous === null || previous === undefined || previous === ''
  ) {
    return { key: 'none', arrow: '', label: 'Chưa có kỳ trước để so sánh', delta: null }
  }
  const curr = Number(current)
  const prev = Number(previous)
  if (!Number.isFinite(curr) || !Number.isFinite(prev)) {
    return { key: 'none', arrow: '', label: 'Chưa có kỳ trước để so sánh', delta: null }
  }

  const rawDiff = curr - prev
  const delta = Number(rawDiff.toFixed(2))

  if (delta > 0.25) {
    return {
      key: 'up',
      arrow: '↑',
      label: `+${formatScore(delta)}`,
      delta
    }
  }
  if (delta < -0.25) {
    return {
      key: 'down',
      arrow: '↓',
      label: `-${formatScore(Math.abs(delta))}`,
      delta
    }
  }
  return {
    key: 'flat',
    arrow: '→',
    label: delta > 0 ? `+${formatScore(delta)}` : (delta < 0 ? `-${formatScore(Math.abs(delta))}` : '0,0'),
    delta
  }
}

/**
 * Đánh giá mức độ nắm vững chuyên đề theo thang điểm 10.
 * ≥8: Đã vững (✓) | ≥6,5: Tạm ổn (~) | <6,5: Chưa đạt (✗)
 * @param {number|null|undefined} score
 * @returns {{ key: 'solid'|'ok'|'weak', symbol: '✓'|'~'|'✗', label: 'Đã vững'|'Tạm ổn'|'Chưa đạt' }}
 */
export function masteryFor(score) {
  if (score === null || score === undefined || score === '') {
    return { key: 'weak', symbol: '✗', label: 'Chưa đạt' }
  }
  const num = Number(score)
  if (!Number.isFinite(num)) {
    return { key: 'weak', symbol: '✗', label: 'Chưa đạt' }
  }
  if (num >= 8) {
    return { key: 'solid', symbol: '✓', label: 'Đã vững' }
  }
  if (num >= 6.5) {
    return { key: 'ok', symbol: '~', label: 'Tạm ổn' }
  }
  return { key: 'weak', symbol: '✗', label: 'Chưa đạt' }
}

/**
 * Tên nhãn mức độ tư duy.
 * @param {string} level
 * @returns {string}
 */
export function levelLabel(level) {
  switch (level) {
    case 'NHAN_BIET':
      return 'Nhận biết'
    case 'THONG_HIEU':
      return 'Thông hiểu'
    case 'VAN_DUNG':
      return 'Vận dụng'
    case 'VAN_DUNG_CAO':
      return 'Vận dụng cao'
    default:
      return level ? String(level) : '—'
  }
}

/**
 * Định dạng điểm số với 1 chữ số thập phân, dùng dấu phẩy, null/NaN -> '—'.
 * @param {number|string|null|undefined} n
 * @returns {string}
 */
export function formatScore(n) {
  if (n === null || n === undefined || n === '') return '—'
  const num = Number(n)
  if (!Number.isFinite(num)) return '—'
  return num.toFixed(1).replace('.', ',')
}

/**
 * Sinh câu nhận xét thân thiện theo mức độ tư duy (tránh thuật ngữ trần).
 * @param {Array<{ level: string, correct: number, total: number, rate?: number|null }>} levelBreakdown
 * @returns {string}
 */
export function levelSentence(levelBreakdown) {
  if (!Array.isArray(levelBreakdown) || levelBreakdown.length === 0) {
    return 'Chưa có đủ dữ liệu phân tích mức độ tư duy.'
  }

  const byLevel = {}
  for (const item of levelBreakdown) {
    if (item?.level) byLevel[item.level] = item
  }

  const nb = byLevel.NHAN_BIET
  const th = byLevel.THONG_HIEU
  const vd = byLevel.VAN_DUNG
  const vdc = byLevel.VAN_DUNG_CAO

  const basicCorrect = (nb?.correct || 0) + (th?.correct || 0)
  const basicTotal = (nb?.total || 0) + (th?.total || 0)
  const advCorrect = (vd?.correct || 0) + (vdc?.correct || 0)
  const advTotal = (vd?.total || 0) + (vdc?.total || 0)

  if (basicTotal === 0 && advTotal === 0) {
    return 'Chưa có đủ dữ liệu phân tích mức độ tư duy.'
  }

  const basicRate = basicTotal > 0 ? (basicCorrect / basicTotal) * 100 : null
  const advRate = advTotal > 0 ? (advCorrect / advTotal) * 100 : null

  if (basicRate !== null && advRate !== null) {
    if (basicRate >= 75 && advRate >= 75) {
      return 'Làm tốt cả câu cơ bản lẫn bài toán vận dụng nâng cao.'
    }
    if (basicRate >= 75 && advRate < 50) {
      return 'Làm tốt câu cơ bản, còn lúng túng ở bài vận dụng.'
    }
    if (basicRate >= 75 && advRate >= 50) {
      return 'Nắm chắc kiến thức cơ bản, có tiến bộ ở bài vận dụng.'
    }
    if (basicRate < 60 && advRate < 50) {
      return 'Cần củng cố thêm kiến thức cơ bản trước khi luyện câu vận dụng.'
    }
    return 'Làm bài khá đều, cần rèn luyện thêm bài tập vận dụng để nâng cao điểm số.'
  }

  if (basicRate !== null) {
    if (basicRate >= 75) return 'Nắm chắc các kiến thức cơ bản.'
    return 'Cần rèn luyện thêm để củng cố các câu cơ bản.'
  }

  if (advRate !== null) {
    if (advRate >= 75) return 'Làm tốt các dạng bài tập vận dụng.'
    return 'Cần hỗ trợ thêm ở các dạng bài vận dụng.'
  }

  return 'Chưa có đủ dữ liệu phân tích mức độ tư duy.'
}

/**
 * Tự động tạo 2–3 câu nhận xét tổng quát (tiến bộ/điểm mạnh trước, cải thiện sau) khi notes null.
 * @param {object} report
 * @returns {string}
 */
export function autoSummary(report) {
  if (!report || report.isEmpty) {
    return 'Chưa có đủ dữ liệu bài tập và bài thi trong kỳ để đưa ra nhận xét chi tiết. Học sinh cần tiếp tục hoàn thành các bài học tiếp theo.'
  }

  const avg = report.summary?.averageScore
  const prevAvg = report.previousPeriod?.summary?.averageScore
  const completion = report.summary?.completionRate
  const topics = Array.isArray(report.topicBreakdown) ? report.topicBreakdown : []

  const sentences = []

  // Câu 1: Kết quả học tập & tiến bộ
  if (avg !== null && avg !== undefined && Number.isFinite(Number(avg))) {
    const numAvg = Number(avg)
    const trend = trendFor(numAvg, prevAvg)
    if (numAvg >= 8) {
      if (trend.key === 'up') {
        sentences.push(`Học sinh duy trì kết quả học tập rất tốt với điểm trung bình ${formatScore(numAvg)}, có bước tiến bộ rõ rệt so với kỳ trước.`)
      } else {
        sentences.push(`Học sinh đạt kết quả học tập tốt với điểm trung bình ${formatScore(numAvg)}.`)
      }
    } else if (numAvg >= 6.5) {
      if (trend.key === 'up') {
        sentences.push(`Học sinh có sự tiến bộ tích cực, nâng điểm trung bình lên ${formatScore(numAvg)}.`)
      } else {
        sentences.push(`Học sinh đạt mức học lực khá với điểm trung bình ${formatScore(numAvg)}.`)
      }
    } else if (numAvg >= 5) {
      sentences.push(`Học sinh đạt điểm trung bình ${formatScore(numAvg)}, đã nỗ lực hoàn thành các bài tập trong kỳ.`)
    } else {
      sentences.push(`Điểm trung bình kỳ này đạt ${formatScore(numAvg)}, cần được theo sát và hỗ trợ thêm để cải thiện kết quả.`)
    }
  } else {
    sentences.push('Học sinh đang trong quá trình tích lũy điểm số các bài kiểm tra trong kỳ.')
  }

  // Câu 2: Điểm mạnh / nề nếp / chuyên cần
  const attRate = report.attendance?.summary?.attendanceRate
  const solidTopic = topics.find(t => masteryFor(t.averageScore).key === 'solid')

  if (completion !== null && completion !== undefined && Number(completion) >= 80) {
    sentences.push(`Ý thức tự giác làm bài tốt với tỉ lệ hoàn thành đạt ${completion}%.`)
  } else if (attRate !== null && attRate !== undefined && Number(attRate) >= 80) {
    sentences.push('Học sinh đi học đầy đủ và duy trì tốt nề nếp học tập.')
  } else if (solidTopic) {
    sentences.push(`Đã nắm vững chuyên đề ${solidTopic.topicTitle}.`)
  } else if (Number(report.summary?.submittedCount) > 0) {
    sentences.push(`Đã hoàn thành ${report.summary.submittedCount} bài tập được giao.`)
  }

  // Câu 3: Điểm cần cải thiện / hành động tiếp theo
  const weakTopic = topics.find(t => masteryFor(t.averageScore).key === 'weak')
  const mistakes = Array.isArray(report.commonMistakes) ? report.commonMistakes : []

  if (weakTopic) {
    sentences.push(`Cần dành thêm thời gian ôn tập chuyên đề ${weakTopic.topicTitle} để khắc phục các phần còn hổng.`)
  } else if (mistakes.length > 0 && mistakes[0]?.questionType) {
    sentences.push(`Nên rèn luyện thêm dạng bài "${mistakes[0].questionType}" để tránh các lỗi sai lặp lại.`)
  } else if (completion !== null && completion !== undefined && Number(completion) < 70) {
    sentences.push('Cần chủ động nộp bài tập đúng hạn để củng cố kiến thức đều đặn.')
  } else {
    sentences.push('Tiếp tục phát huy tinh thần học tập để đạt kết quả cao hơn trong kỳ tới.')
  }

  return sentences.slice(0, 3).join(' ')
}

// =============================================================================
// Internal Helpers
// =============================================================================

function formatDate(iso) {
  if (!iso) return '—'
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(iso))
  if (m) return `${m[3]}/${m[2]}/${m[1]}`
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return escapeHtml(String(iso))
  return d.toLocaleDateString('vi-VN')
}

function formatPeriod(period) {
  if (!period) return '—'
  const from = formatDate(period.fromDate)
  const to = formatDate(period.toDate)
  if (from === '—' && to === '—') return '—'
  return `${from} – ${to}`
}

function formatRate(val) {
  if (val === null || val === undefined || val === '' || !Number.isFinite(Number(val))) return '—'
  return `${Number(val).toLocaleString('vi-VN', { maximumFractionDigits: 1 })}%`
}

function formatMultiline(str) {
  if (!str) return '—'
  return escapeHtml(str).replace(/\n/g, '<br>')
}

function renderGoalNext(notes) {
  if (!notes) return '—'
  const parts = []
  if (notes.goalText) parts.push(escapeHtml(notes.goalText))
  if (notes.goalScore !== null && notes.goalScore !== undefined && Number.isFinite(Number(notes.goalScore))) {
    parts.push(`Đạt TB từ ${formatScore(notes.goalScore)}`)
  }
  return parts.length > 0 ? parts.join(' · ') : '—'
}

/**
 * Vẽ biểu đồ đường SVG thuần cho điểm trung bình tuần (kèm đường TB lớp nét đứt).
 */
function renderWeeklyTrendSvg(weeklyTrend, classAverage) {
  if (!Array.isArray(weeklyTrend) || weeklyTrend.length === 0) {
    return '<div class="pr-chart-empty"><p class="pr-empty-note">Chưa có dữ liệu xu hướng theo tuần.</p></div>'
  }

  const width = 600
  const height = 220
  const padLeft = 40
  const padRight = 24
  const padTop = 22
  const padBottom = 36

  const chartW = width - padLeft - padRight
  const chartH = height - padTop - padBottom
  const n = weeklyTrend.length

  const getY = (score) => {
    const s = Math.max(0, Math.min(10, Number(score) || 0))
    return Math.round((padTop + chartH - (s / 10) * chartH) * 10) / 10
  }

  const getX = (i) => {
    if (n <= 1) return padLeft + chartW / 2
    return Math.round((padLeft + (i / (n - 1)) * chartW) * 10) / 10
  }

  // Các đường gióng ngang trục y (0, 2.5, 5, 7.5, 10)
  const gridScores = [0, 2.5, 5, 7.5, 10]
  const gridLines = gridScores.map(s => {
    const y = getY(s)
    const label = s === 0 ? '0' : String(s).replace('.', ',')
    return `
      <line x1="${padLeft}" y1="${y}" x2="${width - padRight}" y2="${y}" stroke="var(--pr-line, #e2e8f0)" stroke-width="1" stroke-dasharray="2,2" />
      <text x="${padLeft - 8}" y="${y + 4}" font-size="10" text-anchor="end" fill="var(--pr-muted, #64748b)">${label}</text>
    `
  }).join('')

  // Tọa độ điểm của học sinh
  const studentPoints = []
  weeklyTrend.forEach((w, i) => {
    if (w.averageScore !== null && w.averageScore !== undefined && Number.isFinite(Number(w.averageScore))) {
      studentPoints.push({ x: getX(i), y: getY(w.averageScore), score: Number(w.averageScore) })
    }
  })

  // Tọa độ điểm trung bình lớp
  const classPoints = []
  weeklyTrend.forEach((w, i) => {
    const clsScore = w.classAverageScore ?? classAverage?.averageScore
    if (clsScore !== null && clsScore !== undefined && Number.isFinite(Number(clsScore))) {
      classPoints.push({ x: getX(i), y: getY(clsScore), score: Number(clsScore) })
    }
  })

  let classPolyline = ''
  if (classPoints.length >= 2) {
    const pts = classPoints.map(p => `${p.x},${p.y}`).join(' ')
    classPolyline = `<polyline fill="none" stroke="#94a3b8" stroke-width="2" stroke-dasharray="4,4" points="${pts}" />`
  }

  let studentPolyline = ''
  if (studentPoints.length >= 2) {
    const pts = studentPoints.map(p => `${p.x},${p.y}`).join(' ')
    studentPolyline = `<polyline fill="none" stroke="var(--pr-primary, #6a4cf0)" stroke-width="3" stroke-linejoin="round" stroke-linecap="round" points="${pts}" />`
  }

  const studentDots = studentPoints.map(p => `
    <circle cx="${p.x}" cy="${p.y}" r="4" fill="var(--pr-primary, #6a4cf0)" stroke="#ffffff" stroke-width="2" />
    <text x="${p.x}" y="${p.y - 8}" font-size="11" font-weight="700" text-anchor="middle" fill="var(--pr-ink, #1e293b)">${formatScore(p.score)}</text>
  `).join('')

  const xLabels = weeklyTrend.map((w, i) => {
    const x = getX(i)
    let label = ''
    if (w.weekStart) {
      const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(w.weekStart))
      label = m ? `${m[3]}/${m[2]}` : String(w.weekStart).slice(5)
    } else {
      label = `T${i + 1}`
    }
    return `<text x="${x}" y="${height - 10}" font-size="11" text-anchor="middle" fill="var(--pr-muted, #64748b)">${label}</text>`
  }).join('')

  return `
    <div class="pr-chart-wrapper">
      <svg class="pr-chart-svg" viewBox="0 0 ${width} ${height}" role="img" aria-label="Biểu đồ đường điểm trung bình theo tuần">
        <title>Biểu đồ đường điểm trung bình theo tuần</title>
        ${gridLines}
        ${classPolyline}
        ${studentPolyline}
        ${studentDots}
        ${xLabels}
      </svg>
      <div class="pr-chart-legend">
        <span class="pr-legend-item"><span class="pr-legend-dot pr-legend-dot--student"></span> Điểm học sinh</span>
        <span class="pr-legend-item"><span class="pr-legend-line pr-legend-line--class"></span> TB lớp (tham khảo)</span>
      </div>
    </div>
  `
}

// =============================================================================
// Main Export: renderProgressReport
// =============================================================================

/**
 * Render báo cáo tiến độ học tập ra HTML string.
 * @param {object} report
 * @param {object} [opts]
 * @param {'pro'|'shared'|'mochi'} [opts.variant='pro']
 * @param {boolean} [opts.canEditNotes=false]
 * @param {string} [opts.autoSummary]
 * @returns {string} HTML string
 */
export function renderProgressReport(report = {}, opts = {}) {
  const variant = opts.variant || 'pro'
  const canEditNotes = Boolean(opts.canEditNotes)

  const studentName = report.studentName || '—'
  const className = report.className || '—'
  const period = report.period || {}
  const summary = report.summary || {}
  const avg = summary.averageScore
  const prevAvg = report.previousPeriod?.summary?.averageScore

  const rating = ratingFor(avg)
  const trend = trendFor(avg, prevAvg)
  const isEmpty = Boolean(report.isEmpty)

  // 1. Đầu trang
  const headerHtml = `
    <header class="pr-header">
      <div class="pr-header-main">
        <h1 class="pr-header-title">BÁO CÁO TIẾN ĐỘ HỌC TẬP</h1>
        <div class="pr-meta-grid">
          <div class="pr-meta-item">
            <span class="pr-meta-label">Học sinh:</span>
            <strong class="pr-meta-value">${escapeHtml(studentName)}</strong>
          </div>
          <div class="pr-meta-item">
            <span class="pr-meta-label">Lớp:</span>
            <strong class="pr-meta-value">${escapeHtml(className)}</strong>
          </div>
          <div class="pr-meta-item">
            <span class="pr-meta-label">Kỳ:</span>
            <strong class="pr-meta-value">${formatPeriod(period)}</strong>
          </div>
        </div>
      </div>
      <div class="pr-toolbar" aria-label="Thao tác báo cáo">
        <button type="button" class="pr-btn pr-btn--print" data-pr-action="print">
          <i class="fa-solid fa-print" aria-hidden="true"></i> In / Lưu PDF
        </button>
        ${canEditNotes ? `
          <button type="button" class="pr-btn pr-btn--primary" data-pr-action="edit-notes">
            <i class="fa-solid fa-pen-to-square" aria-hidden="true"></i> Soạn nhận xét
          </button>
        ` : ''}
      </div>
    </header>
  `

  // 2. Khung tóm tắt nổi bật
  let summaryParagraph = ''
  if (report.notes?.summary) {
    summaryParagraph = escapeHtml(report.notes.summary).replace(/\n/g, '<br>')
  } else {
    summaryParagraph = opts.autoSummary || autoSummary(report)
  }

  let trendTextHtml = ''
  if (trend.key === 'none') {
    trendTextHtml = `<span class="pr-trend pr-trend--none">${escapeHtml(trend.label)}</span>`
  } else {
    const prevPeriodStr = report.previousPeriod ? formatPeriod(report.previousPeriod) : ''
    trendTextHtml = `
      <span class="pr-trend pr-trend--${trend.key}">
        <span class="pr-trend-arrow">${trend.arrow}</span>
        ${escapeHtml(trend.label)}${prevPeriodStr !== '—' ? ` so với ${prevPeriodStr}` : ''}
      </span>
    `
  }

  const classAvgHtml = report.classAverage?.averageScore !== null && report.classAverage?.averageScore !== undefined
    ? `<span class="pr-hero-class-avg">TB lớp: ${formatScore(report.classAverage.averageScore)} (tham khảo)</span>`
    : ''

  let goalPrevHtml = ''
  if (report.goalPrevious?.goalScore !== null && report.goalPrevious?.goalScore !== undefined) {
    const targetScore = Number(report.goalPrevious.goalScore)
    const isGoalPassed = avg !== null && avg !== undefined && Number(avg) >= targetScore
    const goalTextSuffix = report.goalPrevious.goalText ? ` · ${escapeHtml(report.goalPrevious.goalText)}` : ''
    goalPrevHtml = `
      <span class="pr-hero-goal-prev">
        Mục tiêu kỳ trước (${formatScore(targetScore)}):
        ${isGoalPassed
          ? '<span class="pr-goal-status pr-goal-status--pass">Đạt ✓</span>'
          : '<span class="pr-goal-status pr-goal-status--fail">Chưa đạt ✗</span>'
        }${goalTextSuffix}
      </span>
    `
  }

  const heroHtml = `
    <section class="pr-section pr-hero">
      <div class="pr-hero-row">
        <div class="pr-hero-score-box">
          <div class="pr-hero-score-wrap">
            <span class="pr-hero-score-label">Điểm trung bình kỳ</span>
            <strong class="pr-hero-score-val">${formatScore(avg)}</strong>
          </div>
          <span class="pr-chip pr-chip--${rating.key}">
            <i class="${rating.icon}" aria-hidden="true"></i> ${rating.label}
          </span>
        </div>
        <div class="pr-hero-indicators">
          ${trendTextHtml}
          ${classAvgHtml}
          ${goalPrevHtml}
        </div>
      </div>
      <div class="pr-hero-summary-text">
        ${summaryParagraph}
      </div>
    </section>
  `

  // 3. Chuyên cần & bài tập
  let attendanceBodyHtml = ''
  if (!report.attendance || report.attendance.error || !report.attendance.summary) {
    attendanceBodyHtml = '<p class="pr-empty-note">Chưa có dữ liệu điểm danh</p>'
  } else {
    const s = report.attendance.summary
    const attRate = formatRate(s.attendanceRate)
    const clsRate = s.classAverageRate !== null && s.classAverageRate !== undefined ? formatRate(s.classAverageRate) : null
    attendanceBodyHtml = `
      <table class="pr-table-kv">
        <tbody>
          <tr>
            <th scope="row">Có mặt</th>
            <td>${Number(s.present) || 0}/${Number(s.classSessions) || 0} buổi</td>
          </tr>
          <tr>
            <th scope="row">Vắng</th>
            <td>${Number(s.absent) || 0} buổi</td>
          </tr>
          <tr>
            <th scope="row">Tỉ lệ chuyên cần</th>
            <td>${attRate}${clsRate !== '—' && clsRate ? ` (TB lớp: ${clsRate})` : ''}</td>
          </tr>
        </tbody>
      </table>
    `
  }

  const completionRateText = formatRate(summary.completionRate)
  const onTimeRateText = formatRate(summary.onTimeRate)
  const attitudeText = report.notes?.attitude ? formatMultiline(report.notes.attitude) : '—'

  const attHwHtml = `
    <section class="pr-section pr-att-hw">
      <h2 class="pr-section-title"><i class="fa-solid fa-calendar-check" aria-hidden="true"></i> Chuyên cần &amp; Bài tập</h2>
      <div class="pr-grid-2">
        <div class="pr-card">
          <h3 class="pr-card-title"><i class="fa-solid fa-user-check" aria-hidden="true"></i> Chuyên cần</h3>
          ${attendanceBodyHtml}
        </div>
        <div class="pr-card">
          <h3 class="pr-card-title"><i class="fa-solid fa-book-open" aria-hidden="true"></i> Bài tập &amp; Nề nếp</h3>
          <table class="pr-table-kv">
            <tbody>
              <tr>
                <th scope="row">Bài được giao</th>
                <td>${summary.assignedCount !== null && summary.assignedCount !== undefined ? summary.assignedCount : '—'}</td>
              </tr>
              <tr>
                <th scope="row">Đã làm</th>
                <td>${summary.submittedCount !== null && summary.submittedCount !== undefined ? summary.submittedCount : '—'}</td>
              </tr>
              <tr>
                <th scope="row">Hoàn thành</th>
                <td>${completionRateText}</td>
              </tr>
              <tr>
                <th scope="row">Nộp đúng hạn</th>
                <td>${onTimeRateText}</td>
              </tr>
              <tr>
                <th scope="row">Thái độ học tập</th>
                <td>${attitudeText}</td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>
    </section>
  `

  // Nếu isEmpty = true: hiển thị thông báo trống thân thiện thay cho mục 4, 5 nhưng giữ đầu trang + chuyên cần
  if (isEmpty) {
    const emptyStateHtml = `
      <section class="pr-section pr-empty-state">
        <div class="pr-empty-box">
          <i class="fa-solid fa-inbox pr-empty-icon" aria-hidden="true"></i>
          <h3 class="pr-empty-title">Chưa có đủ dữ liệu bài làm trong kỳ</h3>
          <p class="pr-empty-desc">Học sinh chưa hoàn thành bài tập hoặc bài kiểm tra nào trong khoảng thời gian này.</p>
        </div>
      </section>
    `

    // Section 6 trong trường hợp empty: nếu có notes vẫn hiện, nếu notes null tuân thủ quy tắc pro/shared
    const notesSectionForEmpty = renderNotesSection(report.notes, variant, canEditNotes)

    return `
      <article class="pr-report pr-report--${variant}">
        ${headerHtml}
        ${heroHtml}
        ${attHwHtml}
        ${emptyStateHtml}
        ${notesSectionForEmpty}
      </article>
    `.trim()
  }

  // 4. Kết quả học tập
  const weeklyTrendSvgHtml = renderWeeklyTrendSvg(report.weeklyTrend, report.classAverage)

  // Bảng bài kiểm tra/bài thi trong kỳ:
  // Lấy lượt isBest; nếu không có cờ isBest thì lấy toàn bộ; ưu tiên type EXAM rồi các bài khác; tối đa 12
  const rawTrend = Array.isArray(report.scoreTrend) ? report.scoreTrend : []
  const hasIsBestFlag = rawTrend.some(item => item.isBest === true)
  const bestItems = hasIsBestFlag ? rawTrend.filter(item => item.isBest) : rawTrend

  const sortedTests = [...bestItems].sort((a, b) => {
    const aExam = (a.homeworkType === 'EXAM') ? 1 : 0
    const bExam = (b.homeworkType === 'EXAM') ? 1 : 0
    if (aExam !== bExam) return bExam - aExam
    const aDate = a.date || a.submittedAt || ''
    const bDate = b.date || b.submittedAt || ''
    return String(bDate).localeCompare(String(aDate))
  }).slice(0, 12)

  let testsTableHtml = ''
  if (sortedTests.length === 0) {
    testsTableHtml = '<p class="pr-empty-note">Chưa có bài kiểm tra hoặc bài tập nào trong kỳ.</p>'
  } else {
    testsTableHtml = `
      <div class="pr-table-wrapper">
        <table class="pr-table pr-table--tests">
          <thead>
            <tr>
              <th scope="col">Ngày</th>
              <th scope="col">Bài</th>
              <th scope="col">Điểm</th>
              <th scope="col">Đánh giá</th>
            </tr>
          </thead>
          <tbody>
            ${sortedTests.map(item => {
              const dateText = formatDate(item.date || item.submittedAt)
              const maxS = item.maxScore !== null && item.maxScore !== undefined ? item.maxScore : 10
              const scoreText = `${formatScore(item.score)} / ${formatScore(maxS)}`
              const isPassed = item.isPassed === true || (item.isPassed === undefined && Number(item.score) >= (Number(item.passScore) || 5))
              return `
                <tr>
                  <td>${dateText}</td>
                  <td>
                    ${item.homeworkType === 'EXAM' ? '<span class="pr-tag pr-tag--exam">Thi</span> ' : ''}
                    ${escapeHtml(item.homeworkTitle || 'Bài làm')}
                  </td>
                  <td><strong>${scoreText}</strong></td>
                  <td>
                    ${isPassed
                      ? '<span class="pr-badge pr-badge--pass">Đạt ✓</span>'
                      : '<span class="pr-badge pr-badge--fail">Chưa đạt ✗</span>'
                    }
                  </td>
                </tr>
              `
            }).join('')}
          </tbody>
        </table>
      </div>
    `
  }

  // Khối so sánh kỳ trước & mục tiêu trong mục 4
  let academicComparisonHtml = ''
  if (report.previousPeriod?.summary?.averageScore !== null && report.previousPeriod?.summary?.averageScore !== undefined) {
    const prevAvgVal = report.previousPeriod.summary.averageScore
    academicComparisonHtml += `
      <div class="pr-comp-item">
        <span class="pr-comp-label">So kỳ trước:</span>
        <span class="pr-comp-val">Điểm TB ${formatScore(prevAvgVal)} (${trend.arrow} ${trend.label})</span>
      </div>
    `
  }
  if (report.goalPrevious?.goalScore !== null && report.goalPrevious?.goalScore !== undefined) {
    const targetScore = Number(report.goalPrevious.goalScore)
    const isGoalPassed = avg !== null && avg !== undefined && Number(avg) >= targetScore
    academicComparisonHtml += `
      <div class="pr-comp-item">
        <span class="pr-comp-label">So mục tiêu:</span>
        <span class="pr-comp-val">
          Mục tiêu ${formatScore(targetScore)} —
          ${isGoalPassed
            ? '<strong class="pr-text--good">Đạt ✓</strong>'
            : '<strong class="pr-text--help">Chưa đạt ✗</strong>'
          }
        </span>
      </div>
    `
  }

  const academicHtml = `
    <section class="pr-section pr-academic">
      <h2 class="pr-section-title"><i class="fa-solid fa-chart-line" aria-hidden="true"></i> Kết quả học tập</h2>
      <div class="pr-chart-box">
        <h3 class="pr-card-title"><i class="fa-solid fa-timeline" aria-hidden="true"></i> Tiến trình điểm theo tuần</h3>
        ${weeklyTrendSvgHtml}
      </div>
      <div class="pr-card pr-tests-box">
        <h3 class="pr-card-title"><i class="fa-solid fa-list-check" aria-hidden="true"></i> Bài kiểm tra &amp; Bài thi trong kỳ</h3>
        ${testsTableHtml}
      </div>
      ${academicComparisonHtml ? `
        <div class="pr-comp-bar">
          ${academicComparisonHtml}
        </div>
      ` : ''}
    </section>
  `

  // 5. Mức độ nắm kiến thức
  // 5.1 Bảng chuyên đề (chương)
  const topics = Array.isArray(report.topicBreakdown) ? report.topicBreakdown : []
  let topicsTableHtml = ''
  if (topics.length === 0) {
    topicsTableHtml = '<p class="pr-empty-note">Chưa có dữ liệu phân tích chuyên đề.</p>'
  } else {
    topicsTableHtml = `
      <div class="pr-table-wrapper">
        <table class="pr-table pr-table--topics">
          <thead>
            <tr>
              <th scope="col">Chuyên đề (chương)</th>
              <th scope="col">Điểm TB</th>
              <th scope="col">Mức độ</th>
            </tr>
          </thead>
          <tbody>
            ${topics.map(t => {
              const m = masteryFor(t.averageScore)
              return `
                <tr>
                  <td>${escapeHtml(t.topicTitle || 'Chuyên đề')}</td>
                  <td><strong>${formatScore(t.averageScore)}</strong></td>
                  <td>
                    <span class="pr-mastery pr-mastery--${m.key}">
                      ${m.symbol} ${m.label}
                    </span>
                  </td>
                </tr>
              `
            }).join('')}
          </tbody>
        </table>
      </div>
    `
  }

  // 5.2 Mức độ tư duy
  const levels = Array.isArray(report.levelBreakdown) ? report.levelBreakdown : []
  let levelsHtml = ''
  if (levels.length === 0) {
    levelsHtml = '<p class="pr-empty-note">Chưa có dữ liệu phân tích mức độ tư duy.</p>'
  } else {
    const barsHtml = levels.map(item => {
      const label = levelLabel(item.level)
      const correct = item.correct ?? 0
      const total = item.total ?? 0
      const rate = item.rate !== null && item.rate !== undefined
        ? Math.round(Number(item.rate))
        : (total > 0 ? Math.round((correct / total) * 100) : 0)
      const levelCls = String(item.level || '').toLowerCase().replace(/_/g, '-')
      return `
        <div class="pr-level-row">
          <div class="pr-level-info">
            <span class="pr-level-name">${label}</span>
            <span class="pr-level-counts">${correct}/${total} câu (${rate}%)</span>
          </div>
          <div class="pr-level-bar-track">
            <div class="pr-level-bar-fill pr-level-bar-fill--${levelCls}" style="width:${Math.min(100, Math.max(0, rate))}%"></div>
          </div>
        </div>
      `
    }).join('')

    levelsHtml = `
      <div class="pr-levels-list">
        ${barsHtml}
      </div>
      <p class="pr-level-sentence"><i class="fa-solid fa-lightbulb" aria-hidden="true"></i> ${escapeHtml(levelSentence(levels))}</p>
    `
  }

  // 5.3 Dạng bài hay sai (tối đa 5)
  const mistakes = Array.isArray(report.commonMistakes) ? report.commonMistakes.slice(0, 5) : []
  let mistakesHtml = ''
  if (mistakes.length === 0) {
    mistakesHtml = '<p class="pr-mistake-empty">Chưa phát hiện dạng bài sai lặp lại.</p>'
  } else {
    mistakesHtml = `
      <ul class="pr-mistake-list">
        ${mistakes.map(m => `
          <li class="pr-mistake-item">
            <i class="fa-solid fa-triangle-exclamation" aria-hidden="true"></i>
            <span class="pr-mistake-type">${escapeHtml(m.questionType || 'Dạng bài')}</span>
            <span class="pr-mistake-count">(${Number(m.wrongCount) || 1} lần sai)</span>
          </li>
        `).join('')}
      </ul>
    `
  }

  const masteryHtml = `
    <section class="pr-section pr-mastery-section">
      <h2 class="pr-section-title"><i class="fa-solid fa-shapes" aria-hidden="true"></i> Mức độ nắm kiến thức</h2>
      <div class="pr-grid-2">
        <div class="pr-card">
          <h3 class="pr-card-title"><i class="fa-solid fa-layer-group" aria-hidden="true"></i> Nắm vững theo chuyên đề</h3>
          ${topicsTableHtml}
        </div>
        <div class="pr-card">
          <h3 class="pr-card-title"><i class="fa-solid fa-brain" aria-hidden="true"></i> Mức độ tư duy &amp; Lỗi thường gặp</h3>
          ${levelsHtml}
          <div class="pr-mistakes-box">
            <h4 class="pr-mistakes-title"><i class="fa-solid fa-circle-exclamation" aria-hidden="true"></i> Dạng bài hay sai</h4>
            ${mistakesHtml}
          </div>
        </div>
      </div>
    </section>
  `

  // 6. Nhận xét & kế hoạch
  const notesSectionHtml = renderNotesSection(report.notes, variant, canEditNotes)

  return `
    <article class="pr-report pr-report--${variant}">
      ${headerHtml}
      ${heroHtml}
      ${attHwHtml}
      ${academicHtml}
      ${masteryHtml}
      ${notesSectionHtml}
    </article>
  `.trim()
}

/**
 * Render mục 6: Nhận xét & kế hoạch.
 * notes null:
 * - variant 'pro': hiện khung gợi ý "Chưa có nhận xét — bấm Soạn nhận xét"
 * - variant 'shared'/'mochi': ẩn hẳn mục 6
 */
function renderNotesSection(notes, variant, canEditNotes) {
  if (!notes) {
    if (variant === 'pro') {
      return `
        <section class="pr-section pr-notes" data-pr-notes>
          <div class="pr-notes-prompt">
            <p>
              <i class="fa-solid fa-pen-to-square" aria-hidden="true"></i>
              Chưa có nhận xét — ${canEditNotes
                ? '<button type="button" class="pr-btn pr-btn--sm pr-btn--primary" data-pr-action="edit-notes">Soạn nhận xét</button>'
                : 'bấm Soạn nhận xét'
              }
            </p>
          </div>
        </section>
      `
    }
    return ''
  }

  return `
    <section class="pr-section pr-notes" data-pr-notes>
      <div class="pr-section-header">
        <h2 class="pr-section-title"><i class="fa-solid fa-clipboard-check" aria-hidden="true"></i> Nhận xét &amp; Kế hoạch</h2>
        ${canEditNotes ? `
          <button type="button" class="pr-btn pr-btn--sm pr-btn--secondary" data-pr-action="edit-notes">
            <i class="fa-solid fa-pen-to-square" aria-hidden="true"></i> Soạn nhận xét
          </button>
        ` : ''}
      </div>
      <ul class="pr-notes-list">
        <li class="pr-notes-item">
          <strong class="pr-notes-label"><i class="fa-solid fa-thumbs-up" aria-hidden="true"></i> Điểm mạnh:</strong>
          <div class="pr-notes-content">${formatMultiline(notes.strengths)}</div>
        </li>
        <li class="pr-notes-item">
          <strong class="pr-notes-label"><i class="fa-solid fa-arrow-trend-up" aria-hidden="true"></i> Cần cải thiện:</strong>
          <div class="pr-notes-content">${formatMultiline(notes.improvements)}</div>
        </li>
        <li class="pr-notes-item">
          <strong class="pr-notes-label"><i class="fa-solid fa-bullseye" aria-hidden="true"></i> Mục tiêu kỳ tới:</strong>
          <div class="pr-notes-content">${renderGoalNext(notes)}</div>
        </li>
        <li class="pr-notes-item">
          <strong class="pr-notes-label"><i class="fa-solid fa-chalkboard-user" aria-hidden="true"></i> Giáo viên sẽ hỗ trợ:</strong>
          <div class="pr-notes-content">${formatMultiline(notes.teacherSupport)}</div>
        </li>
        <li class="pr-notes-item">
          <strong class="pr-notes-label"><i class="fa-solid fa-handshake-angle" aria-hidden="true"></i> Phụ huynh có thể làm gì:</strong>
          <div class="pr-notes-content">${formatMultiline(notes.parentActions)}</div>
        </li>
      </ul>
    </section>
  `
}
