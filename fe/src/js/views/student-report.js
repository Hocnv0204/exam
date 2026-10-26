import { renderSidebar, bindSidebarEvents } from '../components/sidebar.js'
import { renderNavbar } from '../components/navbar.js'
import { state } from '../state.js'
import { api } from '../api.js'
import { openModal } from '../components/modal.js'
import { showToast } from '../components/toast.js'
import QRCode from 'qrcode'
import {
  buildSharedReportUrl,
  formatShareDateTime,
  friendlyShareErrorMessage,
  getShareTokenFromHash,
  isSharedReportServerError,
  isShareSetupError,
  isValidShareTokenFormat,
  normalizeExpiresInDays,
  SHARE_EXPIRY_DEFAULT_DAYS,
  SHARE_EXPIRY_MAX_DAYS,
  SHARE_EXPIRY_MIN_DAYS,
  shareStatusBadgeClass,
  shareStatusLabel
} from '../utils/report-share.js'

// ================== Helpers ==================

// Escape text động (title/name) để tránh chèn HTML từ dữ liệu backend
function escapeHtml(str) {
  return String(str ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')
}

// Điểm số: làm tròn 1-2 chữ số, bỏ số 0 dư (8.5, 8.25 -> '8.25', 8 -> '8')
function fmtScore(val, digits = 2) {
  const num = Number(val)
  if (!Number.isFinite(num)) return '0'
  const rounded = Number(num.toFixed(digits))
  return Number.isInteger(rounded) ? String(rounded) : String(rounded)
}

function fmtScoreToNum(v) {
  const n = Number(v)
  return Number.isFinite(n) ? n : 0
}

function numberOr(v, dflt) {
  const n = Number(v)
  return Number.isFinite(n) ? n : dflt
}

function fmtPercent(val) {
  const num = Number(val)
  if (!Number.isFinite(num)) return '0%'
  return `${Number.isInteger(num) ? num : Math.round(num * 100) / 100}%`
}

function fmtDateVN(iso) {
  if (!iso) return ''
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return String(iso)
  return d.toLocaleDateString('vi-VN')
}

function fmtDateTimeVN(iso) {
  if (!iso) return ''
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return String(iso)
  return d.toLocaleString('vi-VN')
}

function fmtDuration(seconds) {
  const s = Number(seconds)
  if (!Number.isFinite(s) || s <= 0) return 'Không rõ'
  const m = Math.floor(s / 60)
  const rest = Math.floor(s % 60)
  return m > 0 ? `${m} phút ${rest} giây` : `${rest} giây`
}

// ================== States ==================

// Guard chống stale async response + duplicate load (đối chiếu pattern của admin-history.js)
let reportRequestId = 0
let reportAbortCtrl = null
let reportLoading = false

// Đăng ký đúng MỘT hashchange listener cho module lifetime (không đăng ký lại mỗi lần bind/render)
let routeLeaveHookInstalled = false

// Đường path của report view đang được mount: 'student-report' | 'shared-report'.
// Dùng để dọn dẹp view khi rời route.
let reportMountedPath = null

// Container id của report body hiện tại đang mount trong DOM.
let reportBodyId = 'student-report-body'

// ===== Public shared report (route #shared-report?token=...) =====
let sharedRequestId = 0
let sharedAbortCtrl = null
let sharedLoading = false

// State tạm giữ share info của phiên hiện tại (raw token chỉ nằm trong memory này).
let currentShareToken = ''
let currentShareId = ''

// Share create/QR/list state
let shareCreating = false
let shareQrDataUrl = ''
let shareQrLoading = false
let shareQrError = ''
let shareListLoading = false
let shareListError = ''

// Generation của phiên report đang mở: tăng mỗi lần mount/teardown view (render lại,
// rời route, đổi params). Request write/GET đang bay khi generation đổi coi như STALE:
// không lưu state, không cập nhật DOM (nhưng write KHÔNG auto-retry và KHÔNG bị abort mù).
let shareLifecycle = 0

// Guard trong-lifetime: request mới hơn (cùng lifecycle) thắng, request cũ bỏ qua DOM update.
let shareQrReqId = 0
let shareListReqId = 0

// Dọn dẹp view khi rời route:
// - abort request còn chạy + tăng stale guard để response trễ bị bỏ qua
// - reset loading flag và destroy Chart instance (kể cả chart đã render xong)
function teardownReportView() {
  reportRequestId++
  sharedRequestId++
  if (reportAbortCtrl) {
    try { reportAbortCtrl.abort() } catch (e) {}
    reportAbortCtrl = null
  }
  if (sharedAbortCtrl) {
    try { sharedAbortCtrl.abort() } catch (e) {}
    sharedAbortCtrl = null
  }
  reportLoading = false
  sharedLoading = false
  destroyReportChart()
  // Raw token/link chỉ giữ trong phiên report đang mở; rời route là xoá khỏi memory.
  // Bump lifecycle: mọi POST create/QR/GET list đang bay coi như stale -> response tới
  // sau KHÔNG được ghi token vào module/UI nữa.
  shareLifecycle++
  shareQrReqId++
  shareListReqId++
  shareListChain = Promise.resolve()
  currentShareToken = ''
  currentShareId = ''
  shareQrDataUrl = ''
  shareQrError = ''
}

function ensureRouteLeaveCleanup() {
  if (routeLeaveHookInstalled) return
  routeLeaveHookInstalled = true
  window.addEventListener('hashchange', () => {
    const routePath = (window.location.hash || '').replace('#', '').split('?')[0]
    if (routePath !== reportMountedPath) {
      teardownReportView()
    }
  })
}

// ================== Render shell ==================

function backRoute(studentId, classId) {
  if (state.user?.role === 'ADMIN' && studentId && classId) {
    return `#student-details?studentId=${encodeURIComponent(studentId)}&classId=${encodeURIComponent(classId)}`
  }
  return '#history'
}

function renderBackdrop(breadcrumb, options = {}) {
  const isPublic = Boolean(options.public)
  const bodyId = isPublic ? 'shared-report-body' : 'student-report-body'
  const sidebarRole = isPublic ? null : (state.user?.role === 'ADMIN' ? 'students' : 'history')
  const backRow = isPublic ? '' : `
    <div style="margin-bottom:16px;">
      <a href="${backRoute(state.reportParams?.studentId, state.reportParams?.classId)}" class="btn-secondary" style="padding:6px 14px; font-size:13px; font-weight:600; text-decoration:none; display:inline-flex; align-items:center; gap:6px;">
        <i class="fa-solid fa-arrow-left"></i> Quay lại
      </a>
    </div>
  `
  return `
    <div class="app-layout${isPublic ? ' public-report-layout' : ''}">
      ${sidebarRole ? renderSidebar(sidebarRole) : ''}
      <div class="main-content">
        ${isPublic ? '' : renderNavbar(breadcrumb)}
        <div class="content-body">
          ${backRow}
          <div id="${bodyId}"></div>
        </div>
      </div>
    </div>
  `
}

export function renderStudentReportView() {
  const hashUrl = window.location.hash.replace('#', '')
  const [_, queryString] = hashUrl.split('?')
  const params = new URLSearchParams(queryString || '')
  const studentId = params.get('studentId') || ''
  const classId = params.get('classId') || ''
  const fromDate = params.get('fromDate') || ''
  const toDate = params.get('toDate') || ''

  // Trước mỗi lần route render lại (kể cả đổi params trên cùng route):
  // abort request cũ, bump stale guard, destroy Chart cũ
  teardownReportView()
  ensureRouteLeaveCleanup()
  state.reportParams = { studentId, classId, fromDate, toDate }
  reportMountedPath = 'student-report'
  reportBodyId = 'student-report-body'

  return renderBackdrop('Nền tảng / Báo cáo tiến độ')
}

// ================== Public shared report view (#shared-report?token=...) ==================

function renderSharedPublicBar() {
  return `
    <div class="report-public-bar">
      <div class="report-public-brand">
        <span class="report-public-logo"><i class="fa-solid fa-graduation-cap"></i></span>
        <div>
          <span class="report-public-name">EduPortal</span>
          <span class="report-public-tag">Báo cáo tiến độ học sinh</span>
        </div>
      </div>
      <div class="report-public-expiry" id="shared-report-expiry">Chưa xác định thời hạn.</div>
    </div>
  `
}

export function renderSharedReportView() {
  const hashUrl = window.location.hash.replace('#', '')
  const [_, queryString] = hashUrl.split('?')
  const params = new URLSearchParams(queryString || '')
  const token = getShareTokenFromHash(window.location.hash)

  teardownReportView()
  ensureRouteLeaveCleanup()
  reportMountedPath = 'shared-report'
  reportBodyId = 'shared-report-body'

  return `
    <div class="app-layout public-report-layout">
      <div class="main-content">
        <div class="content-body">
          ${renderSharedPublicBar()}
          <div id="shared-report-body"></div>
        </div>
      </div>
    </div>
  `
}

export function bindSharedReportEvents() {
  loadSharedReport()
}

// Load báo cáo công khai theo token trên hash.
// Không cần Authorization; token sai/thiếu phải chặn TRƯỚC khi gọi API.
async function loadSharedReport() {
  if (sharedLoading) return
  sharedLoading = true
  const reqId = ++sharedRequestId
  if (sharedAbortCtrl) {
    try { sharedAbortCtrl.abort() } catch (e) {}
  }
  sharedAbortCtrl = new AbortController()
  const signal = sharedAbortCtrl.signal

  const token = getShareTokenFromHash(window.location.hash)
  if (!token || !isValidShareTokenFormat(token)) {
    // Params thiếu/sai: báo lỗi ngay, không đốt request tới backend.
    sharedLoading = false
    renderError('Link chia sẻ không hợp lệ hoặc đã bị đổi. Vui lòng dùng đúng link đã nhận từ giáo viên.')
    return
  }

  renderLoading('Đang tải báo cáo công khai theo link chia sẻ...')
  try {
    // Public endpoint: không gửi Authorization của user (isPublic trong api.js).
    const data = await api.getSharedReport({ shareToken: token }, { signal })
    // Stale guard: token trên hash đổi / rời route / request mới hơn -> bỏ qua DOM update
    if (reqId !== sharedRequestId || signal.aborted) return
    renderSharedReportData(data || {})
  } catch (err) {
    if (reqId !== sharedRequestId || signal.aborted) return
    console.warn('[StudentReport] Failed to load shared report:', err?.message)
    // Lỗi 500 kỹ thuật (kể cả thiếu bảng share) -> thông báo chung, không lộ chi tiết backend.
    // 400/404/410 (link sai/hết hạn/thu hồi) giữ nguyên vì đã là thông báo chung, không leak.
    const sharedFallback = 'Không thể tải báo cáo công khai. Link có thể đã hết hạn hoặc bị thu hồi. Vui lòng thử lại sau.'
    renderError(isSharedReportServerError(err) ? sharedFallback : (err?.message || sharedFallback))
  } finally {
    if (reqId === sharedRequestId) {
      sharedLoading = false
    }
  }
}

// Render payload public (scope SHARED_REPORT) bằng CHUNG renderer với report auth,
// để auth/public không drift: cùng hero, KPI, so sánh, biểu đồ, phân tích chương, bảng lượt nộp.
// Payload public không chứa internal IDs nên không cần resolveNames theo state.
function renderSharedReportData(data) {
  const summary = data?.summary || {}
  const scoreTrend = Array.isArray(data?.scoreTrend) ? data.scoreTrend : []
  const isEmpty = Number(summary.attemptCount || 0) === 0 && scoreTrend.length === 0

  renderReportInner({
    studentName: data?.studentName || 'Học sinh',
    className: data?.className || 'Lớp học',
    period: {
      fromDate: data?.period?.fromDate,
      toDate: data?.period?.toDate,
      days: data?.period?.days
    },
    summary,
    comparison: data?.comparison,
    scoreTrend,
    topicBreakdown: data?.topicBreakdown,
    submissions: data?.submissions,
    isEmpty
  }, { includeSharePanel: false })

  updateSharedPublicExpiry(data?.expiresAt)
}

// Cập nhật dòng hạn xem trên thanh branding công khai (read-only, không có controls).
function updateSharedPublicExpiry(expiresAt) {
  const el = document.getElementById('shared-report-expiry')
  if (!el) return
  el.textContent = expiresAt
    ? `Hạn xem: đến ${formatShareDateTime(expiresAt)}`
    : 'Link chia sẻ này không có hạn sử dụng.'
}

// ================== Loading / Error / Empty helpers ==================

function setBody(html) {
  destroyReportChart()
  const body = document.getElementById(reportBodyId)
  if (!body) return null
  body.innerHTML = html
  return body
}

function renderLoading(desc) {
  setBody(`
    <div class="report-state-box">
      <i class="fa-solid fa-circle-notch fa-spin report-loading-icon"></i>
      <p class="report-state-title">Đang tải báo cáo tiến độ...</p>
      <p class="report-state-desc">${escapeHtml(desc !== undefined ? desc : (state.reportPeriodLabel || ''))}</p>
    </div>
  `)
}

// Retry button bấm lại loader đúng với view đang mount (auth report hay public shared report)
function retryActiveLoad() {
  if (reportMountedPath === 'shared-report') {
    void loadSharedReport()
    return
  }
  void loadReport()
}

function renderError(message) {
  const body = setBody(`
    <div class="report-state-box report-state-error">
      <i class="fa-solid fa-triangle-exclamation" style="font-size:32px; color:#ef4444; margin-bottom:12px;"></i>
      <p class="report-state-title">Không thể tải báo cáo</p>
      <p class="report-state-desc">${escapeHtml(message)}</p>
      <button id="report-retry-btn" class="btn-primary" style="width:auto; cursor:pointer; padding:8px 18px; font-size:13px; font-weight:600; border-radius:8px; display:inline-flex; align-items:center; gap:6px; margin-top:6px;">
        <i class="fa-solid fa-rotate-right"></i> Thử lại
      </button>
    </div>
  `)
  if (body) {
    body.querySelector('#report-retry-btn')?.addEventListener('click', () => {
      retryActiveLoad()
    })
  }
}

// ================== Data loading ==================

export function bindStudentReportEvents() {
  bindSidebarEvents()
  loadReport()
}

async function loadReport() {
  // Chặn duplicate load khi retry được bấm liên tiếp
  if (reportLoading) return
  reportLoading = true
  const reqId = ++reportRequestId
  if (reportAbortCtrl) {
    try { reportAbortCtrl.abort() } catch (e) {}
  }
  reportAbortCtrl = new AbortController()
  const signal = reportAbortCtrl.signal

  const { studentId, classId, fromDate, toDate } = state.reportParams || {}
  const role = state.user?.role || 'STUDENT'

  // ---- Validate params trước, không gọi API nếu thiếu/sai ----
  const dateRe = /^\d{4}-\d{2}-\d{2}$/
  const calendarValid = (raw) => {
    if (!dateRe.test(raw)) return false
    const [y, m, d] = raw.split('-').map(Number)
    const dt = new Date(Date.UTC(y, m - 1, d))
    return dt.getUTCFullYear() === y && dt.getUTCMonth() === m - 1 && dt.getUTCDate() === d
  }
  if (role === 'ADMIN' && !studentId) {
    reportLoading = false
    renderError('Thiếu tham số báo cáo: cần studentId và classId trên URL. Hãy mở báo cáo từ trang chi tiết học sinh.')
    return
  }
  if (!fromDate || !toDate) {
    reportLoading = false
    renderError('Thiếu khoảng ngày báo cáo (fromDate/toDate) trên URL. Hãy mở báo cáo từ trang chi tiết học sinh.')
    return
  }
  if (!calendarValid(fromDate) || !calendarValid(toDate)) {
    reportLoading = false
    renderError('Khoảng ngày không hợp lệ (định dạng YYYY-MM-DD hoặc ngày không tồn tại). Hãy mở lại báo cáo từ trang chi tiết học sinh.')
    return
  }
  if (fromDate > toDate) {
    reportLoading = false
    renderError('Từ ngày không được sau Đến ngày. Hãy mở lại báo cáo với khoảng ngày hợp lệ.')
    return
  }

  state.reportPeriodLabel = `Kỳ báo cáo: ${fmtDateVN(fromDate)} – ${fmtDateVN(toDate)}`
  renderLoading()

  try {
    const data = await api.getStudentProgressReport({
      studentId: studentId || undefined,
      classId: classId || undefined,
      fromDate,
      toDate
    }, { signal })

    // Stale guard: request mới hơn đã bắt đầu hoặc response bị hủy -> bỏ qua DOM update
    if (reqId !== reportRequestId || signal.aborted) return
    renderReport(data || {})
  } catch (err) {
    if (reqId !== reportRequestId || signal.aborted) return
    console.warn('[StudentReport] Failed to load progress report:', err?.message)
    renderError(err?.message || 'Đã có lỗi khi tải báo cáo. Vui lòng thử lại sau.')
  } finally {
    if (reqId === reportRequestId) {
      reportLoading = false
    }
  }
}

// ================== Tên hiển thị ==================

function resolveNames(data) {
  const { studentId, classId } = state.reportParams || {}
  const role = state.user?.role || 'STUDENT'
  let studentName = ''
  let className = ''

  if (role === 'ADMIN') {
    const st = (state.students || []).find(s => s.id === studentId)
    if (st) studentName = st.fullName || st.username || ''
    const cls = (state.classes || []).find(c => c.id === classId)
    if (cls) className = cls.name || ''
  } else {
    // STUDENT không phụ thuộc API admin: dùng state.user (localStorage) + dữ liệu response
    studentName = state.user?.fullName || state.user?.username || ''
  }

  // Fallback từ response (className đính kèm từng submission)
  if (!className) {
    const clsName = (data?.submissions || []).find(s => s.className)?.className
    if (clsName) className = clsName
  }
  if (!studentName) studentName = studentId ? `Học sinh (${studentId.substring(0, 8)}…)` : 'Học sinh'
  if (!className) className = classId ? `Lớp ${classId.substring(0, 8)}…` : 'Tất cả lớp đang tham gia'

  // Trả về tên thô (caller sẽ escape khi render) để auth/public không drift.
  return { studentName, className }
}

// ================== Sections ==================

function kpiCardHTML(label, value, sub, icon, tone) {
  return `
    <div class="report-kpi report-kpi--${tone}">
      <div class="report-kpi-icon"><i class="fa-solid ${icon}"></i></div>
      <div class="report-kpi-body">
        <p class="report-kpi-label">${escapeHtml(label)}</p>
        <div class="report-kpi-value">${escapeHtml(value)}</div>
        <p class="report-kpi-sub">${escapeHtml(sub)}</p>
      </div>
    </div>
  `
}

function renderSummarySection(summary) {
  const s = {
    assignedCount: Number(summary?.assignedCount || 0),
    submittedCount: Number(summary?.submittedCount || 0),
    completionRate: Number(summary?.completionRate || 0),
    onTimeRate: Number(summary?.onTimeRate ?? 0),
    averageScore: Number(summary?.averageScore || 0),
    highestScore: Number(summary?.highestScore || 0),
    lowestScore: Number(summary?.lowestScore || 0),
    activeDays: Number(summary?.activeDays || 0),
    attemptCount: Number(summary?.attemptCount || 0)
  }
  return `
    <div class="report-section">
      <h2 class="report-section-title"><i class="fa-solid fa-gauge-high"></i> Chỉ số tổng quan</h2>
      <div class="report-kpi-grid">
        ${kpiCardHTML('Bài được giao', String(s.assignedCount), 'theo hạn nộp trong kỳ', 'fa-clipboard-list', 'blue')}
        ${kpiCardHTML('Bài đã nộp', String(s.submittedCount), `${s.submittedCount}/${s.assignedCount || 0} bài`, 'fa-circle-check', 'green')}
        ${kpiCardHTML('Tỷ lệ hoàn thành', fmtPercent(s.completionRate), 'trên các bài được giao', 'fa-square-poll-vertical', 'green')}
        ${kpiCardHTML('Nộp đúng hạn', fmtPercent(s.onTimeRate), `${s.attemptCount} lượt nộp`, 'fa-clock', 'amber')}
        ${kpiCardHTML('Điểm trung bình', fmtScore(s.averageScore, 1), 'quy đổi thang 10 (best/bài)', 'fa-star', 'blue')}
        ${kpiCardHTML('Điểm cao nhất', fmtScore(s.highestScore, 1), 'best score của các bài đã nộp', 'fa-arrow-trend-up', 'green')}
        ${kpiCardHTML('Điểm thấp nhất', fmtScore(s.lowestScore, 1), 'điểm thấp nhất trong các bài đã nộp', 'fa-arrow-trend-down', 'rose')}
        ${kpiCardHTML('Ngày có hoạt động', String(s.activeDays), 'ngày có lượt nộp bài', 'fa-calendar-days', 'blue')}
      </div>
    </div>
  `
}

function trendLabelFor(trend) {
  if (trend === 'IMPROVING') return { text: 'Cải thiện', icon: 'fa-arrow-trend-up', cls: 'report-trend-chip--improving', note: 'Điểm trung bình nửa cuối tốt hơn nửa đầu.' }
  if (trend === 'DECLINING') return { text: 'Giảm', icon: 'fa-arrow-trend-down', cls: 'report-trend-chip--declining', note: 'Điểm trung bình nửa cuối kém hơn nửa đầu — cần theo sát hơn.' }
  return { text: 'Ổn định', icon: 'fa-minus', cls: 'report-trend-chip--stable', note: 'Điểm trung bình hai nửa kỳ gần như không đổi.' }
}

function halfStatCompare(label, firstHalf, secondHalf, unit, key, digits) {
  const f = Number(firstHalf?.[key] ?? 0)
  const s = numberOr(secondHalf?.[key], 0)
  return `
    <div class="report-trend-row">
      <span class="report-trend-row-label">${escapeHtml(label)}</span>
      <div class="report-trend-row-vals">
        <span class="report-half-val" title="Nửa đầu kỳ">${fmtScore(f, digits)}${unit}</span>
        <i class="fa-solid fa-arrow-right-long"></i>
        <span class="report-half-val" title="Nửa cuối kỳ">${fmtScore(s, digits)}${unit}</span>
        <span class="report-delta ${(s - f) >= 0 ? 'report-delta--up' : 'report-delta--down'}">
          ${(s - f) >= 0 ? '▲ +' : '▼ '}${fmtScore(s - f, digits)}${unit}
        </span>
      </div>
    </div>
  `
}

function renderTrendSection(comparison) {
  const firstHalf = comparison?.firstHalf || {}
  const secondHalf = comparison?.secondHalf || {}
  const label = trendLabelFor(comparison?.trend)
  return `
    <div class="report-section">
      <h2 class="report-section-title"><i class="fa-solid fa-chart-line"></i> So sánh nửa đầu – nửa cuối kỳ</h2>
      <div class="report-trend-block">
        <div class="report-trend-chip ${label.cls}">
          <i class="fa-solid ${label.icon}"></i> <strong>${escapeHtml(label.text)}</strong>
          <span class="report-trend-chip-note">${escapeHtml(label.note)}</span>
        </div>
        ${halfStatCompare('Điểm trung bình', firstHalf, secondHalf, '', 'averageScore', 1)}
        ${halfStatCompare('Tỷ lệ hoàn thành', firstHalf, secondHalf, '%', 'completionRate', 1)}
        ${halfStatCompare('Bài đã nộp', firstHalf, secondHalf, '', 'submittedCount', 0)}
        ${halfStatCompare('Lượt nộp', firstHalf, secondHalf, '', 'attemptCount', 0)}
      </div>
    </div>
  `
}

// ================== Chart ==================

let reportChartInstance = null

function destroyReportChart() {
  // Hủy Chart cũ trước khi vẽ lại / thay innerHTML (tránh instance Chart.js rò rỉ)
  if (reportChartInstance) {
    try { reportChartInstance.destroy() } catch (e) {}
    reportChartInstance = null
  }
}

// ================== Nhãn điểm trên biểu đồ (plugin Chart.js nội bộ) ==================

// Rút gọn tên bài cho trục X nhưng giữ cả đầu và cuối để các bài có cùng tiền tố
// (vd "Toán thực tế - ...") vẫn phân biệt được khi chụp màn hình.
function shortHomeworkTitle(title) {
  const t = String(title || 'Bài tập').replace(/\s+/g, ' ').trim()
  if (!t) return 'Bài tập'
  if (t.length <= 20) return t
  return `${t.slice(0, 11).trimEnd()}…${t.slice(-7).trimStart()}`
}

// Backend cũ có thể trả attemptNo thiếu hoặc trùng trong cùng một bài. Khi đó dùng
// thứ tự thời gian thực tế của các điểm đang hiển thị; nếu dữ liệu hợp lệ thì giữ nguyên.
function addDisplayAttemptNumbers(items) {
  const groups = new Map()
  items.forEach((a, idx) => {
    const key = String(a?.homeworkId || a?.homeworkTitle || `__unknown_${idx}`)
    if (!groups.has(key)) groups.set(key, [])
    groups.get(key).push({ a, idx })
  })

  groups.forEach(group => {
    const attempts = group.map(({ a }) => Number(a?.attemptNo))
    const validUnique = attempts.every(n => Number.isInteger(n) && n > 0) && new Set(attempts).size === attempts.length
    group.forEach(({ a }, groupIdx) => {
      a._displayAttemptNo = validUnique ? attempts[groupIdx] : groupIdx + 1
    })
  })
  return items
}

// Nhãn trục X: tên bài rút gọn + số lần nộp, vd "Kiểm tra C1 · L2".
// attemptNo là số lần nộp TRONG MỖI BÀI nên chỉ hiện "#1" sẽ lặp lại giữa các bài.
function trendXLabel(a, idx) {
  const attempt = Number(a?._displayAttemptNo || a?.attemptNo || idx + 1)
  return `${shortHomeworkTitle(a?.homeworkTitle)} · L${attempt}`
}

// Plugin vẽ nhãn điểm trực tiếp trên biểu đồ để chụp màn hình gửi phụ huynh không cần hover.
// - Chỉ đọc dataset line (từng lượt nộp): mỗi lượt tối đa một nhãn; dataset bar không
//   vẽ nhãn riêng nên không bao giờ trùng nhãn bar + line.
// - Bỏ qua điểm null/skip.
// - Nhãn = scaledScore quy đổi /10, fmtScore(..., 1): 9.4, 10, 8.7.
// - Vị trí mặc định phía trên điểm; điểm sát đỉnh (gần 10) thì lật xuống dưới để không bị cắt.
// - Chống che nhau: giữ nhãn của điểm best trước, rồi đến các lượt thường theo thứ tự thời
//   gian; nhãn chồng lên nhãn đã giữ thì thử lật vị trí, vẫn chồng thì bỏ qua (giá trị vẫn
//   xem được qua tooltip và bảng lượt nộp).
// - Pill nền trắng mờ + chữ đậm slate-900: đọc được cả trên cột xanh nhạt lẫn đường nét đứt.
// - HiDPI: Chart.js đã scale context theo devicePixelRatio nên plugin vẽ bằng tọa độ chart
//   là nét trên màn Retina; font-family lấy từ canvas để đồng bộ font của app.
const reportDataLabelsPlugin = {
  id: 'reportDataLabels',
  afterDatasetsDraw(chart) {
    const lineMeta = chart.getDatasetMeta(1)
    if (!lineMeta || !lineMeta.data || !lineMeta.data.length) return
    const { ctx, chartArea } = chart
    if (!chartArea) return
    const lineData = chart.data.datasets[1]?.data || []
    const bestFlags = chart.data.datasets[1]?.reportBestFlags || []

    let family = 'system-ui, sans-serif'
    try {
      family = window.getComputedStyle(chart.canvas).fontFamily || family
    } catch (e) {}
    const font = `600 11px ${family}`
    ctx.save()
    ctx.font = font
    ctx.textAlign = 'center'
    ctx.textBaseline = 'middle'

    const padX = 5
    const gap = 4 // khoảng cách từ điểm tới pill
    const collideGap = 3
    const items = []

    lineMeta.data.forEach((el, i) => {
      if (!el || el.skip) return
      const val = Number(lineData[i])
      if (!Number.isFinite(val)) return
      const isBest = Boolean(bestFlags[i])
      const text = fmtScore(val, 1)
      const w = Math.ceil(ctx.measureText(text).width) + padX * 2
      const h = 18
      items.push({ x: el.x, y: el.y, r: 5, text, w, h, isBest })
    })

    const placeBox = (it, side) => {
      const cy = side === 'above' ? it.y - it.r - gap - it.h / 2 : it.y + it.r + gap + it.h / 2
      let left = it.x - it.w / 2
      if (left < chartArea.left + 1) left = chartArea.left + 1
      if (left + it.w > chartArea.right - 1) left = chartArea.right - 1 - it.w
      return { left, top: cy - it.h / 2, right: left + it.w, bottom: cy + it.h / 2, cx: left + it.w / 2, cy }
    }
    const inside = (b) => b.top >= chartArea.top - 0.5 && b.bottom <= chartArea.bottom + 0.5
    const overlaps = (a, b) =>
      a.left < b.right + collideGap && a.right + collideGap > b.left &&
      a.top < b.bottom + collideGap && a.bottom + collideGap > b.top

    // Best trước (luôn ưu tiên giữ nhãn), rồi lượt thường theo thứ tự thời gian.
    // Array.prototype.sort ổn định nên thứ tự thời gian trong từng nhóm được giữ nguyên.
    const ordered = [...items].sort((a, b) => Number(b.isBest) - Number(a.isBest))
    const kept = []
    for (const it of ordered) {
      const preferAbove = it.y - it.r - gap - it.h >= chartArea.top
      const first = placeBox(it, preferAbove ? 'above' : 'below')
      let box = inside(first) && !kept.some((k) => overlaps(first, k.box)) ? first : null
      if (!box) {
        const flipped = placeBox(it, preferAbove ? 'below' : 'above')
        if (inside(flipped) && !kept.some((k) => overlaps(flipped, k.box))) box = flipped
      }
      if (box) kept.push({ ...it, box })
    }

    // Vẽ pill + chữ. Hook afterDatasetsDraw nên nhãn nằm trên đường/cột, không bị che.
    for (const k of kept) {
      const { left, top, cx, cy } = k.box
      const r = 5
      ctx.beginPath()
      if (typeof ctx.roundRect === 'function') {
        ctx.roundRect(left, top, k.w, k.h, r)
      } else {
        ctx.moveTo(left + r, top)
        ctx.lineTo(left + k.w - r, top)
        ctx.quadraticCurveTo(left + k.w, top, left + k.w, top + r)
        ctx.lineTo(left + k.w, top + k.h - r)
        ctx.quadraticCurveTo(left + k.w, top + k.h, left + k.w - r, top + k.h)
        ctx.lineTo(left + r, top + k.h)
        ctx.quadraticCurveTo(left, top + k.h, left, top + k.h - r)
        ctx.lineTo(left, top + r)
        ctx.quadraticCurveTo(left, top, left + r, top)
        ctx.closePath()
      }
      ctx.fillStyle = 'rgba(255, 255, 255, 0.92)'
      ctx.fill()
      ctx.strokeStyle = 'rgba(100, 116, 139, 0.45)'
      ctx.lineWidth = 1
      ctx.stroke()
      ctx.fillStyle = '#0f172a'
      ctx.fillText(k.text, cx, cy + 0.5)
    }
    ctx.restore()
  }
}

function renderScoreTrendChart(scoreTrend) {
  const canvas = document.getElementById('report-trend-chart')
  if (!canvas || !window.Chart) return
  const oldChart = window.Chart?.getChart?.(canvas)
  if (oldChart) {
    try { oldChart.destroy() } catch (e) {}
  }
  reportChartInstance = null

  const trend = addDisplayAttemptNumbers([...(scoreTrend || [])].map((a, idx) => ({ ...a, _idx: idx })))
  const labels = trend.map((a, idx) => trendXLabel(a, idx))
  const scores = trend.map(a => fmtScoreToNum(a.scaledScore ?? a.score))

  const pointColors = trend.map(a => {
    if (a.isBest && a.isLate) return '#f59e0b' // best nhưng nộp muộn
    if (a.isBest) return '#10b981'
    if (a.isLate) return '#ef4444'
    return '#0284c7'
  })
  const pointStyle = trend.map(a => {
    if (a.isLate) return 'triangle'
    if (a.isBest) return 'rectRot'
    return 'circle'
  })
  // Mỗi lượt nộp đều có cột. Best chỉ khác màu, không còn biến lượt thường thành null.
  const barData = [...scores]
  const barColors = trend.map(a => {
    if (a.isBest && a.isLate) return 'rgba(245, 158, 11, 0.38)'
    if (a.isBest) return 'rgba(16, 185, 129, 0.38)'
    if (a.isLate) return 'rgba(239, 68, 68, 0.18)'
    return 'rgba(2, 132, 199, 0.18)'
  })
  const barBorderColors = trend.map(a => {
    if (a.isBest && a.isLate) return '#f59e0b'
    if (a.isBest) return '#10b981'
    if (a.isLate) return '#ef4444'
    return '#0284c7'
  })

  reportChartInstance = new window.Chart(canvas.getContext('2d'), {
    type: 'line',
    plugins: [reportDataLabelsPlugin],
    data: {
      labels,
      datasets: [
        {
          type: 'bar',
          label: 'Điểm từng lượt nộp (cột)',
          data: barData,
          backgroundColor: barColors,
          borderColor: barBorderColors,
          borderWidth: trend.map(a => a.isBest ? 2 : 1),
          borderRadius: 6,
          barPercentage: 0.55,
          categoryPercentage: 0.75,
          order: 2
        },
        {
          type: 'line',
          label: 'Từng lượt nộp',
          data: scores,
          borderColor: 'rgba(100, 116, 139, 0.55)',
          borderWidth: 2,
          borderDash: [6, 4],
          pointRadius: 5,
          pointHoverRadius: 8,
          pointBackgroundColor: pointColors,
          pointBorderColor: '#ffffff',
          pointBorderWidth: 2,
          pointStyle,
          reportBestFlags: trend.map(a => Boolean(a.isBest)),
          fill: false,
          order: 1
        }
      ]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      interaction: { mode: 'index', intersect: false },
      plugins: {
        legend: {
          display: true,
          position: 'bottom',
          labels: { usePointStyle: true, boxWidth: 8, font: { size: 11, weight: 600 }, color: '#475569' }
        },
        tooltip: {
          callbacks: {
            title: (items) => {
              const a = trend[items[0]?.dataIndex]
              if (!a) return ''
              return `${a.homeworkTitle || 'Bài tập'} · Lần ${a._displayAttemptNo || a.attemptNo || a._idx + 1}${a.isBest ? ' (Best)' : ''}`
            },
            label: (ctx) => {
              const a = trend[ctx.dataIndex]
              if (ctx.dataset.type === 'bar') {
                if (ctx.parsed.y === null) return null
                return `${a?.isBest ? 'Điểm best' : 'Điểm lượt nộp'} (quy đổi): ${fmtScore(ctx.parsed.y, 2)}`
              }
              const raw = fmtScore(a?.score ?? ctx.parsed.y, 2)
              const max = fmtScore(a?.maxScore ?? 10, 2)
              const scaled = fmtScore(a?.scaledScore ?? ctx.parsed.y, 2)
              return `Điểm: ${raw}/${max} → quy đổi ${scaled}/10`
            },
            afterLabel: (ctx) => {
              const a = trend[ctx.dataIndex]
              if (!a) return []
              const lines = []
              if (ctx.dataset.type === 'bar') return []
              lines.push(`Lần nộp thứ ${a._displayAttemptNo || a.attemptNo || a._idx + 1} · ${a.isLate ? 'Nộp muộn' : 'Đúng hạn'}`)
              lines.push(`Ngày nộp: ${fmtDateTimeVN(a.submittedAt)}`)
              lines.push(a.isBest ? 'Đây là lần nộp điểm cao nhất của bài' : 'Lần nộp sau có điểm cao hơn bài này')
              const pass = Number(a.score ?? 0) >= Number(a.passScore ?? 5)
              lines.push(pass ? 'Kết quả: ĐẠT' : 'Kết quả: CHƯA ĐẠT')
              return lines
            }
          },
          filter: (item) => item.parsed.y !== null
        }
      },
      scales: {
        y: {
          beginAtZero: true,
          max: 10.5,
          ticks: { stepSize: 2, color: '#64748b', font: { size: 11, weight: 600 } },
          grid: { color: '#f1f5f9' }
        },
        x: {
          ticks: { autoSkip: true, autoSkipPadding: 8, maxRotation: 0, color: '#64748b', font: { size: 11, weight: 600 } },
          grid: { display: false }
        }
      }
    }
  })
}

function renderScoreTrendSection(scoreTrend) {
  return `
    <div class="report-section">
      <h2 class="report-section-title"><i class="fa-solid fa-chart-simple"></i> Biểu đồ xu hướng điểm (từng lượt nộp)</h2>
      <div class="report-chart-legend">
        <span><span class="report-dot" style="background:#10b981;"></span> Best (đúng hạn)</span>
        <span><span class="report-dot" style="background:#f59e0b;"></span> Best (nộp muộn)</span>
        <span><span class="report-dot" style="background:#0284c7;"></span> Lượt nộp thường</span>
        <span><span class="report-dot" style="background:#ef4444;"></span> Lượt nộp muộn</span>
        <span><span class="report-bar-dot"></span> Cột: điểm từng lượt (best đậm hơn)</span>
      </div>
      <div class="report-chart-wrap">
        <canvas id="report-trend-chart" aria-label="Biểu đồ điểm theo từng lượt nộp" role="img"></canvas>
      </div>
      <p class="report-chart-note">Điểm được quy đổi về thang 10 (score/maxScore) và hiển thị trực tiếp trên từng điểm. Mỗi lượt nộp đều có một cột; cột best có màu đậm hơn, đường nét đứt thể hiện xu hướng qua các lượt. Khi có quá nhiều lượt nộp, nhãn của điểm best luôn được giữ, nhãn lượt thường có thể ẩn bớt để khỏi che nhau (xem đủ qua tooltip hoặc bảng lượt nộp).</p>
    </div>
  `
}

// ================== Topic breakdown ==================

function renderTopicSection(topicBreakdown) {
  const topics = Array.isArray(topicBreakdown) ? topicBreakdown : []
  if (topics.length === 0) {
    return `
      <div class="report-section">
        <h2 class="report-section-title"><i class="fa-solid fa-layer-group"></i> Phân tích theo chương</h2>
        <p class="report-empty-inline">Chưa có dữ liệu theo chương trong kỳ này (chỉ nhóm theo chương có metadata thật từ backend).</p>
      </div>
    `
  }
  return `
    <div class="report-section">
      <h2 class="report-section-title"><i class="fa-solid fa-layer-group"></i> Phân tích theo chương</h2>
      <div class="report-topic-list">
        ${topics.map(t => {
          const rate = Number(t.completionRate || 0)
          const avg = Number(t.averageScore || 0)
          const tone = rate >= 80 ? 'report-topic-bar-track--good' : rate >= 50 ? 'report-topic-bar-track--mid' : 'report-topic-bar-track--weak'
          return `
            <div class="report-topic-row">
              <div class="report-topic-head">
                <strong>${escapeHtml(t.topicTitle || t.chapterTitle || 'Chương')}</strong>
                <span>TB ${fmtScore(avg, 1)}/10 · ${Number(t.submittedCount || 0)}/${Number(t.assignedCount || 0)} bài · ${Number(t.attemptCount || 0)} lượt</span>
              </div>
              <div class="report-topic-bar-track ${tone}"><div class="report-topic-bar" style="width:${Math.min(100, Math.max(0, rate))}%"></div></div>
              <p class="report-topic-foot">Hoàn thành ${fmtPercent(rate)} · điểm cao nhất ${fmtScore(t.highestScore, 1)} · thấp nhất ${fmtScore(t.lowestScore, 1)}</p>
            </div>
          `
        }).join('')}
      </div>
    </div>
  `
}

// ================== Submissions table ==================

function renderSubmissionsSection(submissions) {
  const subs = Array.isArray(submissions) ? submissions : []
  if (subs.length === 0) {
    return `
      <div class="report-section">
        <h2 class="report-section-title"><i class="fa-solid fa-clock-rotate-left"></i> Danh sách lượt nộp</h2>
        <p class="report-empty-inline">Chưa có lượt nộp nào trong kỳ báo cáo.</p>
      </div>
    `
  }
  return `
    <div class="report-section">
      <h2 class="report-section-title"><i class="fa-solid fa-clock-rotate-left"></i> Danh sách lượt nộp (${subs.length})</h2>
      <div class="report-table-responsive">
        <table class="report-table">
          <thead>
            <tr>
              <th>Bài tập</th>
              <th>Chương</th>
              <th class="report-col-center">Lần</th>
              <th class="report-col-center">Điểm</th>
              <th class="report-col-center">Trạng thái</th>
              <th>Ngày nộp</th>
              <th>Thời gian làm</th>
            </tr>
          </thead>
          <tbody>
            ${subs.map(sub => {
              const badges = []
              if (sub.isBest) badges.push('<span class="report-badge report-badge--best">BEST</span>')
              if (sub.isLate) badges.push('<span class="report-badge report-badge--late">MUỘN</span>')
              if (Number(sub.bonusScore || 0) !== 0) badges.push(`<span class="report-badge report-badge--bonus">+${fmtScore(sub.bonusScore, 1)}</span>`)
              const pass = Number(sub.isPassed ?? (Number(sub.score ?? 0) >= Number(sub.passScore ?? 5)))
              return `
                <tr>
                  <td class="report-td-title"><strong>${escapeHtml(sub.homeworkTitle || 'Bài tập')}</strong>${badges.length ? ` ${badges.join(' ')}` : ''}</td>
                  <td class="report-td-meta">
                    ${sub.chapterTitle ? escapeHtml(sub.chapterTitle) : '<span class="report-muted">—</span>'}
                    ${sub.lessonTitle ? `<br><span class="report-muted">${escapeHtml(sub.lessonTitle)}</span>` : ''}
                  </td>
                  <td class="report-col-center">#${Number(sub.attemptNo || 1)}</td>
                  <td class="report-col-center"><strong>${fmtScore(sub.score, 2)}</strong><span class="report-muted">/${fmtScore(sub.maxScore, 2)}</span></td>
                  <td class="report-col-center">
                    ${pass
                      ? '<span class="report-badge report-badge--pass">ĐẠT</span>'
                      : '<span class="report-badge report-badge--fail">CHƯA ĐẠT</span>'}
                  </td>
                  <td class="report-td-meta">${fmtDateTimeVN(sub.submittedAt)}</td>
                  <td class="report-td-meta">${fmtDuration(sub.durationSecondsTaken)}</td>
                </tr>
              `
            }).join('')}
          </tbody>
        </table>
      </div>
    </div>
  `
}


// ================== Chia sẻ báo cáo (chỉ ADMIN) ==================

function renderSharePanel() {
  return `
    <div class="report-section report-share-panel">
      <h2 class="report-section-title"><i class="fa-solid fa-share-nodes"></i> Chia sẻ báo cáo</h2>
      <p class="report-share-desc">Tạo link công khai để phụ huynh xem báo cáo tiến độ của học sinh này. Chỉ giáo viên (ADMIN) được thực hiện thao tác chia sẻ.</p>
      <div class="report-share-bar">
        <button id="share-create-btn" class="btn-primary" style="width:auto; cursor:pointer; padding:9px 18px; font-size:13px; font-weight:600; border-radius:8px; display:inline-flex; align-items:center; gap:6px;">
          <i class="fa-solid fa-share"></i> Tạo link chia sẻ
        </button>
        <div class="report-share-expiry">
          <label for="share-expiry-days">Hạn sử dụng</label>
          <select id="share-expiry-days" class="form-input">
            ${Array.from({ length: SHARE_EXPIRY_MAX_DAYS - SHARE_EXPIRY_MIN_DAYS + 1 }, (_, i) => SHARE_EXPIRY_MIN_DAYS + i)
              .map((d) => `<option value="${d}" ${d === SHARE_EXPIRY_DEFAULT_DAYS ? 'selected' : ''}>${d} ngày</option>`)
              .join('')}
          </select>
        </div>
      </div>
      <p id="report-share-status" class="report-share-status" role="status"></p>

      <div id="report-share-created" style="display:none;">
        <p class="report-share-created-title"><i class="fa-solid fa-circle-check"></i> Đã tạo link chia sẻ thành công. Gửi cho phụ huynh xem báo cáo.</p>
        <div class="report-share-link-row">
          <input id="report-share-link" type="text" readonly class="report-share-link-input" />
          <button id="share-copy-btn" class="btn-secondary" style="width:auto; cursor:pointer; padding:9px 16px; font-size:13px; font-weight:600; border-radius:8px; display:inline-flex; align-items:center; gap:6px;">
            <i class="fa-solid fa-copy"></i> Sao chép link
          </button>
        </div>
        <div class="report-share-qr">
          <img id="report-share-qr-img" alt="Mã QR báo cáo tiến độ" style="display:none; width:180px; height:180px; padding:6px; border:1px solid #e2e8f0; border-radius:8px; background:#ffffff;" />
          <button id="share-qr-download-btn" class="btn-secondary" style="display:none; width:auto; cursor:pointer; padding:9px 16px; font-size:13px; font-weight:600; border-radius:8px; gap:6px; align-items:center;" >
            <i class="fa-solid fa-qrcode"></i> Tải QR PNG
          </button>
          <p id="report-share-qr-error" class="report-share-error" style="display:none; color:#dc2626; font-size:12px; margin:0;"></p>
        </div>
      </div>

      <div id="report-share-list-wrap">
        <p class="report-share-list-title">Các link đã tạo</p>
        <div id="report-share-list-loading" class="report-share-list-msg">Đang tải danh sách...</div>
        <ul id="report-share-list" class="report-share-list"></ul>
        <p id="report-share-list-error" class="report-share-error" style="display:none; color:#dc2626; font-size:12px; margin:8px 0 0 0;"></p>
        <p class="report-share-hint">Lưu ý: sau khi tải lại trang, không thể sao chép lại link cũ vì token chỉ được phát hành một lần.</p>
      </div>
    </div>
  `
}

function setShareStatus(message, type = '') {
  const el = document.getElementById('report-share-status')
  if (!el) return
  el.textContent = message || ''
  el.className = `report-share-status${type ? ` report-share-status--${type}` : ''}`
}

function bindReportShareEvents() {
  const createBtn = document.getElementById('share-create-btn')
  createBtn?.addEventListener('click', () => {
    if (shareCreating) return
    void createReportShare()
  })

  const copyBtn = document.getElementById('share-copy-btn')
  copyBtn?.addEventListener('click', () => {
    void copyShareLink()
  })

  const qrDownloadBtn = document.getElementById('share-qr-download-btn')
  qrDownloadBtn?.addEventListener('click', () => {
    void downloadShareQr()
  })

  const listEl = document.getElementById('report-share-list')
  listEl?.addEventListener('click', (e) => {
    const btn = e.target.closest('[data-action="revoke-share"]')
    if (!btn) return
    const shareId = btn.getAttribute('data-share-id') || ''
    if (!shareId) return
    void revokeReportShare(shareId)
  })
}

async function createReportShare() {
  const { studentId, classId, fromDate, toDate } = state.reportParams || {}
  if (shareCreating) return
  if (!studentId || !classId || !fromDate || !toDate) {
    setShareStatus('Thiếu thông tin học sinh / lớp / kỳ báo cáo để tạo link. Vui lòng mở báo cáo từ trang chi tiết học sinh.', 'error')
    return
  }
  const expiresInDays = normalizeExpiresInDays(document.getElementById('share-expiry-days')?.value, SHARE_EXPIRY_DEFAULT_DAYS)
  if (expiresInDays === null) {
    setShareStatus(`Hạn sử dụng không hợp lệ. Cho phép từ ${SHARE_EXPIRY_MIN_DAYS} đến ${SHARE_EXPIRY_MAX_DAYS} ngày.`, 'error')
    return
  }

  shareCreating = true
  setShareStatus('Đang tạo link chia sẻ báo cáo...')
  const createBtn = document.getElementById('share-create-btn')
  if (createBtn) {
    createBtn.disabled = true
    createBtn.innerHTML = `<i class="fa-solid fa-circle-notch fa-spin"></i> Đang tạo...`
  }
  const lifecycle = shareLifecycle

  try {
    // KHÔNG auto-retry: nếu thất bại thì báo lỗi cho người dùng quyết định có thử lại.
    const result = await api.createStudentReportShare({
      studentId,
      classId,
      fromDate,
      toDate,
      expiresInDays
    })
    if (shareLifecycle !== lifecycle) {
      // Stale: trong lúc POST chạy, người dùng đã rời/đổi route (lifecycle tăng).
      // Không lưu raw token vào module, không đụng DOM. Write KHÔNG tự retry; request
      // vẫn hoàn tất ở backend. Limitation: backend chỉ phát raw token MỘT lần nên
      // link này không có cách nào hiển thị/copy lại -> phải tạo link mới nếu còn cần.
      console.warn('[StudentReport] Share create finished after route change; raw token discarded (cannot be re-displayed).')
      showToast('Link đã được tạo nhưng bạn đã rời trang báo cáo. Token chỉ phát một lần nên phải tạo lại link mới nếu cần.', 'warning')
      return
    }
    currentShareToken = String(result?.shareToken || '')
    currentShareId = String(result?.shareId || '')
    const shareUrl = buildSharedReportUrl(currentShareToken)
    const createdEl = document.getElementById('report-share-created')
    const linkInput = document.getElementById('report-share-link')
    if (linkInput) linkInput.value = shareUrl
    if (createdEl) createdEl.style.display = 'block'
    setShareStatus(`Đã tạo link chia sẻ thành công. Hạn sử dụng đến ${formatShareDateTime(result?.expiresAt) || '—'}.`, 'success')
    await renderShareQr(shareUrl, lifecycle)
    await loadShareList()
  } catch (err) {
    if (shareLifecycle !== lifecycle) {
      // Lỗi tới sau khi đã rời route: không đụng DOM/toast nữa (người dùng không còn ở panel).
      console.warn('[StudentReport] Share create failed after route change; skipped UI update.')
      return
    }
    console.warn('[StudentReport] Create report share failed:', err?.message)
    if (isShareSetupError(err)) {
      // Lỗi setup: MỘT thông báo duy nhất ở status, không toast trùng, không lộ raw schema error.
      // Không retry POST (create đã không retry từ trước).
      setShareStatus(friendlyShareErrorMessage(err), 'error')
    } else {
      setShareStatus(`Không thể tạo link chia sẻ: ${err?.message || 'Vui lòng thử lại sau.'}`, 'error')
      showToast('Không thể tạo link chia sẻ báo cáo. Vui lòng thử lại sau.', 'error')
    }
  } finally {
    shareCreating = false
    const createBtn2 = document.getElementById('share-create-btn')
    if (createBtn2) {
      createBtn2.disabled = false
      createBtn2.innerHTML = `<i class="fa-solid fa-share"></i> Tạo link chia sẻ`
    }
  }
}

async function renderShareQr(shareUrl, expectedLifecycle) {
  const qrImg = document.getElementById('report-share-qr-img')
  const qrDownloadBtn = document.getElementById('share-qr-download-btn')
  const qrErrorEl = document.getElementById('report-share-qr-error')
  const reqId = ++shareQrReqId
  shareQrLoading = true
  shareQrError = ''
  // Reset sạch: bỏ src cũ để không giữ QR (và gián tiếp token link) của lần share trước.
  if (qrImg) {
    qrImg.removeAttribute('src')
    qrImg.style.display = 'none'
  }
  if (qrDownloadBtn) qrDownloadBtn.style.display = 'none'
  if (qrErrorEl) qrErrorEl.style.display = 'none'
  try {
    // QR được tao MOI LOCAL trong browser (bundle) -> KHÔNG gui token ve ngoai.
    const dataUrl = await QRCode.toDataURL(shareUrl, {
      margin: 1,
      width: 256,
      color: { dark: '#0f172a', light: '#ffffff' }
    })
    // Stale guard: rời route (lifecycle đổi) hoặc đã có lượt tạo QR mới -> không gán src.
    if (shareLifecycle !== expectedLifecycle || reqId !== shareQrReqId) {
      console.warn('[StudentReport] Share QR skipped: stale after route/generation change.')
      return
    }
    shareQrDataUrl = dataUrl
    if (qrImg) {
      qrImg.src = dataUrl
      qrImg.style.display = 'block'
    }
    if (qrDownloadBtn) qrDownloadBtn.style.display = 'inline-flex'
  } catch (err) {
    if (shareLifecycle !== expectedLifecycle || reqId !== shareQrReqId) return
    shareQrError = 'Không thể tạo mã QR. Vui lòng thử lại sau.'
    if (qrErrorEl) {
      qrErrorEl.textContent = shareQrError
      qrErrorEl.style.display = 'block'
    }
  } finally {
    if (reqId === shareQrReqId) {
      shareQrLoading = false
    }
  }
}

async function copyShareLink() {
  const shareUrl = currentShareToken ? buildSharedReportUrl(currentShareToken) : ''
  if (!shareUrl) {
    showToast('Chưa có link để sao chép. Vui lòng tạo link trước.', 'warning')
    return
  }
  try {
    if (navigator.clipboard?.writeText) {
      await navigator.clipboard.writeText(shareUrl)
    } else {
      const ta = document.createElement('textarea')
      ta.value = shareUrl
      document.body.appendChild(ta)
      ta.select()
      document.execCommand('copy')
      ta.remove()
    }
    showToast('Đã sao chép link báo cáo. Gửi cho phụ huynh xem.', 'success')
  } catch (err) {
    console.warn('[StudentReport] Copy share link failed:', err?.message)
    showToast('Không thể sao chép link: ' + (err?.message || 'Vui lòng sao chép thủ công.'), 'error')
  }
}

async function downloadShareQr() {
  if (!shareQrDataUrl) {
    showToast('Mã QR chưa sẵn sàng. Vui lòng tạo lại link báo cáo.', 'warning')
    return
  }
  try {
    const res = await fetch(shareQrDataUrl)
    if (!res.ok) throw new Error(`HTTP ${res.status}`)
    const blob = await res.blob()
    const blobUrl = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = blobUrl
    a.download = `bao-cao-tien-diem-${currentShareId || 'hoc-sinh'}.png`
    document.body.appendChild(a)
    a.click()
    document.body.removeChild(a)
    setTimeout(() => URL.revokeObjectURL(blobUrl), 4000)
    showToast('Đã tải mã QR về máy. Mở file PNG và gửi cho phụ huynh.', 'success')
  } catch (err) {
    console.warn('[StudentReport] Download share QR failed:', err?.message)
    showToast('Không thể tải mã QR: ' + (err?.message || 'Vui lòng thử lại sau.'), 'error')
  }
}

async function revokeReportShare(shareId) {
  openModal(
    'Thu hồi báo cáo',
    `
      <p style="font-size:14px; color:#334155; line-height:1.6; margin:0 0 8px 0;">
        Thu hồi link chia sẻ báo cáo này? Sau khi thu hồi, phụ huynh sẽ không thể xem báo cáo qua link đã phát hành.
      </p>
      <p style="font-size:12px; color:#94a3b8; margin:0;">
        Thao tác này chỉ tạm thời vô hiệu hoá link (soft revoke); không ảnh hưởng dữ liệu báo cáo.
      </p>
    `,
    async () => {
      try {
        // DELETE soft revoke ở backend là idempotent; KHÔNG optimistic set status trên UI,
        // chỉ render lại danh sách theo response thực tế.
        await api.revokeStudentReportShare(shareId)
        await loadShareList()
        return true
      } catch (err) {
        console.warn('[StudentReport] Revoke share failed:', err?.message)
        showToast(isShareSetupError(err) ? friendlyShareErrorMessage(err) : 'Không thể thu hồi link chia sẻ: ' + (err?.message || 'Vui lòng thử lại sau.'), 'error')
        return false // giữ modal mở để người dùng thử lại / huỷ
      }
    },
    { confirmLabel: 'Thu hồi', cancelLabel: 'Hủy' }
  )
}

function renderShareList(shares) {
  const listEl = document.getElementById('report-share-list')
  const loadingEl = document.getElementById('report-share-list-loading')
  const errorEl = document.getElementById('report-share-list-error')
  if (!Array.isArray(shares)) {
    if (listEl) listEl.innerHTML = ''
    return
  }
  if (loadingEl) loadingEl.style.display = 'none'
  if (errorEl) errorEl.style.display = 'none'
  if (listEl) {
    listEl.innerHTML = shares.length === 0
      ? `<li class="report-share-item report-share-item--empty">Chưa có link chia sẻ nào cho học sinh này.</li>`
      : shares.map((s) => {
        const status = s?.status || 'active'
        const canRevoke = status === 'active'
        const shareIdAttr = escapeHtml(String(s?.shareId || ''))
        return `
          <li class="report-share-item" data-share-id="${shareIdAttr}">
            <div class="report-share-item-main">
              <span class="report-share-item-status ${shareStatusBadgeClass(status)}">${escapeHtml(shareStatusLabel(status))}</span>
              <span>Được tạo: ${escapeHtml(formatShareDateTime(s?.createdAt) || '—')}</span>
              <span>Hết hạn: ${escapeHtml(formatShareDateTime(s?.expiresAt) || '—')}</span>
            </div>
            ${canRevoke
              ? `<button type="button" class="btn-secondary" data-action="revoke-share" data-share-id="${shareIdAttr}" style="padding:6px 12px; font-size:12px; font-weight:600; border-radius:8px; cursor:pointer;">
                   <i class="fa-solid fa-ban"></i> Thu hồi
                 </button>`
              : ''}
          </li>
        `
      }).join('')
  }
}

// Serialize các lần GET danh sách (create xong refresh + reload tự refresh)
// để response trả sau không ghi đè DOM của kết quả cũ theo thứ tự ngược.
let shareListChain = Promise.resolve()

function loadShareList() {
  const run = shareListChain.then(() => doLoadShareList())
  shareListChain = run.catch(() => {})
  return run
}

async function doLoadShareList() {
  const { studentId, classId } = state.reportParams || {}
  const listEl = document.getElementById('report-share-list')
  const loadingEl = document.getElementById('report-share-list-loading')
  const errorEl = document.getElementById('report-share-list-error')
  if (!studentId || !classId) return
  // Guard: request cũ hơn (reqId) hoặc request chạy bé qua ranh giới lifecycle
  // (rời route / re-render cùng route) -> KHÔNG được ghi đè panel mới.
  const lifecycle = shareLifecycle
  const reqId = ++shareListReqId
  shareListLoading = true
  shareListError = ''
  if (listEl) listEl.innerHTML = ''
  if (loadingEl) loadingEl.style.display = 'block'
  if (errorEl) errorEl.style.display = 'none'
  try {
    const res = await api.listStudentReportShares({ studentId, classId })
    if (reqId !== shareListReqId || shareLifecycle !== lifecycle || reportMountedPath !== 'student-report') return
    renderShareList(res?.shares || [])
  } catch (err) {
    if (reqId !== shareListReqId || shareLifecycle !== lifecycle || reportMountedPath !== 'student-report') return
    shareListError = friendlyShareErrorMessage(err, 'Không tải được danh sách link chia sẻ.')
    if (loadingEl) loadingEl.style.display = 'none'
    if (listEl) listEl.innerHTML = ''
    if (errorEl) {
      errorEl.textContent = shareListError
      errorEl.style.display = 'block'
    }
  } finally {
    shareListLoading = false
  }
}

// ================== Full render ==================

function renderReportInner(opts, { includeSharePanel = false } = {}) {
  const {
    studentName,
    className,
    period,
    summary,
    comparison,
    scoreTrend,
    topicBreakdown,
    submissions,
    isEmpty
  } = opts

  const scoreTrendArr = Array.isArray(scoreTrend) ? scoreTrend : []
  const periodText = `${fmtDateVN(period?.fromDate)} – ${fmtDateVN(period?.toDate)}`
  const trendInfo = trendLabelFor(comparison?.trend)
  const trendBadgeCls = (comparison?.trend) === 'IMPROVING'
    ? 'report-trend-chip--improving'
    : ((comparison?.trend) === 'DECLINING' ? 'report-trend-chip--declining' : 'report-trend-chip--stable')

  const emptyBanner = isEmpty ? `
    <div class="report-empty-banner">
      <i class="fa-solid fa-circle-info"></i>
      Học sinh chưa có lượt nộp nào trong kỳ báo cáo nên các chỉ số hiển thị là 0 và tổng kết dựa trên bài được giao.
    </div>
  ` : ''

  const sharePanel = includeSharePanel && state.user?.role === 'ADMIN' ? renderSharePanel() : ''

  const body = `
    <div class="report-hero">
      <div>
        <h1 class="report-hero-title">${escapeHtml(studentName || 'Học sinh')}</h1>
        <div class="report-hero-meta">
          <span><i class="fa-solid fa-graduation-cap"></i> ${escapeHtml(className || '')}</span>
          <span><i class="fa-solid fa-calendar-range"></i> Kỳ báo cáo: ${escapeHtml(periodText)}</span>
          ${period?.days ? `<span><i class="fa-solid fa-hourglass-half"></i> ${Number(period.days)} ngày</span>` : ''}
        </div>
      </div>
      <div class="report-hero-badge ${trendBadgeCls}">
        ${escapeHtml(trendInfo.text)}
      </div>
    </div>
    ${emptyBanner}
    ${sharePanel}
    ${renderSummarySection(summary)}
    ${isEmpty ? '' : renderScoreTrendSection(scoreTrendArr)}
    ${renderTrendSection(comparison || {})}
    ${renderTopicSection(topicBreakdown)}
    ${renderSubmissionsSection(submissions)}
  `

  setBody(body)
  if (!isEmpty) {
    renderScoreTrendChart(scoreTrendArr)
  }
}

function renderReport(data) {
  const { fromDate, toDate } = state.reportParams || {}
  const names = resolveNames(data)
  const summary = data?.summary || {}
  const scoreTrend = Array.isArray(data?.scoreTrend) ? data.scoreTrend : []
  const isEmpty = Number(summary.attemptCount || 0) === 0 && scoreTrend.length === 0

  renderReportInner({
    studentName: names.studentName,
    className: names.className,
    period: { fromDate, toDate, days: data?.period?.days },
    summary,
    comparison: data?.comparison,
    scoreTrend,
    topicBreakdown: data?.topicBreakdown,
    submissions: data?.submissions,
    isEmpty
  }, { includeSharePanel: true })

  if (state.user?.role === 'ADMIN') {
    bindReportShareEvents()
    // Danh sách link hiện có: tải ngay sau khi panel render (không để panel kẹt "Đang tải
    // danh sách..." đến khi create/revoke). loadShareList tự serialize + tự bắt lỗi hiển
    // thị trong panel nên không ném unhandled rejection ra ngoài.
    void loadShareList().catch(() => {})
  }
}
