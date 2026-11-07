if (typeof document !== 'undefined' && document.head) {
  import('../../css/mochi/attendance.css')
}
import { renderSidebar, bindSidebarEvents } from '../components/sidebar.js'
import { renderNavbar } from '../components/navbar.js'
import { renderMascot } from '../components/mascot.js'
import { escapeHtml } from '../utils/download-helper.js'
import { state } from '../state.js'
import { api } from '../api.js'

let activeController = null
let requestId = 0
let activeRequestKey = ''

function vnToday() {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: 'Asia/Ho_Chi_Minh', year: 'numeric', month: '2-digit', day: '2-digit'
  }).formatToParts(new Date())
  const get = type => parts.find(part => part.type === type)?.value || ''
  return `${get('year')}-${get('month')}-${get('day')}`
}

function addDays(date, amount) {
  const value = new Date(`${date}T12:00:00Z`)
  value.setUTCDate(value.getUTCDate() + amount)
  return value.toISOString().slice(0, 10)
}

function defaultRange() {
  const toDate = vnToday()
  return { fromDate: addDays(toDate, -29), toDate }
}

export function validateAttendanceRange(fromDate, toDate) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(fromDate || '') || !/^\d{4}-\d{2}-\d{2}$/.test(toDate || '')) {
    return 'Vui lòng chọn đầy đủ từ ngày và đến ngày.'
  }
  const from = new Date(`${fromDate}T12:00:00Z`)
  const to = new Date(`${toDate}T12:00:00Z`)
  if (Number.isNaN(from.getTime()) || Number.isNaN(to.getTime()) || from.toISOString().slice(0, 10) !== fromDate || to.toISOString().slice(0, 10) !== toDate) {
    return 'Ngày đã chọn không hợp lệ.'
  }
  const days = Math.round((to - from) / 86400000) + 1
  if (days < 1) return 'Từ ngày phải trước hoặc trùng với đến ngày.'
  if (days > 366) return 'Khoảng thời gian không được vượt quá 366 ngày.'
  return ''
}

function formatDate(date) {
  const value = new Date(`${date}T12:00:00Z`)
  if (Number.isNaN(value.getTime())) return escapeHtml(date || '—')
  const weekdays = ['Chủ Nhật', 'Thứ Hai', 'Thứ Ba', 'Thứ Tư', 'Thứ Năm', 'Thứ Sáu', 'Thứ Bảy']
  return `${weekdays[value.getUTCDay()]}, ${String(value.getUTCDate()).padStart(2, '0')}/${String(value.getUTCMonth() + 1).padStart(2, '0')}/${value.getUTCFullYear()}`
}

function monthLabel(date) {
  const [year, month] = String(date || '').split('-')
  return `Tháng ${Number(month) || '—'}/${year || '—'}`
}

function safeNumber(value, fallback = 0) {
  const number = Number(value)
  return Number.isFinite(number) ? number : fallback
}

function rateText(value) {
  return value === null || value === undefined || !Number.isFinite(Number(value)) ? '—' : `${Number(value).toLocaleString('vi-VN', { maximumFractionDigits: 1 })}%`
}

const STATUS = {
  PRESENT: { label: 'Có mặt', icon: 'fa-check', className: 'is-present' },
  ABSENT: { label: 'Vắng', icon: 'fa-xmark', className: 'is-absent' },
  NOT_COUNTED: { label: 'Không tính', icon: 'fa-minus', className: 'is-not-counted' }
}

function statusMeta(status) {
  return STATUS[status] || STATUS.NOT_COUNTED
}

function comparison(summary) {
  const mine = Number(summary?.attendanceRate)
  const average = Number(summary?.classAverageRate)
  if (summary?.attendanceRate == null || summary?.classAverageRate == null || !Number.isFinite(mine) || !Number.isFinite(average)) {
    return 'Chưa đủ dữ liệu để so sánh với lớp.'
  }
  const difference = mine - average
  if (Math.abs(difference) < 1) return 'Tỉ lệ chuyên cần của bạn đang ngang với lớp.'
  return difference > 0
    ? `Bạn đang cao hơn trung bình lớp ${Math.abs(difference).toLocaleString('vi-VN', { maximumFractionDigits: 1 })} điểm phần trăm.`
    : `Bạn đang thấp hơn trung bình lớp ${Math.abs(difference).toLocaleString('vi-VN', { maximumFractionDigits: 1 })} điểm phần trăm.`
}

function renderSession(session) {
  const status = statusMeta(session?.status)
  const total = Math.max(0, safeNumber(session?.classTotal))
  const present = Math.max(0, safeNumber(session?.classPresent))
  const classRate = session?.classRate == null ? null : safeNumber(session.classRate, null)
  return `<article class="m-att-session ${status.className}">
    <div class="m-att-session-main">
      <time datetime="${escapeHtml(session?.date || '')}" class="m-att-session-date">${formatDate(session?.date)}</time>
      ${session?.note ? `<p class="m-att-session-note">${escapeHtml(session.note)}</p>` : ''}
    </div>
    <span class="m-att-status ${status.className}"><i class="fa-solid ${status.icon}" aria-hidden="true"></i>${status.label}</span>
    <div class="m-att-class-stat">
      <span>Lớp: <strong>${present}/${total}</strong> có mặt (${rateText(classRate)})</span>
      <div class="m-att-mini-progress" aria-hidden="true"><span style="--m-att-rate:${Math.min(100, Math.max(0, classRate || 0))}%"></span></div>
    </div>
  </article>`
}

export function renderAttendanceData(data, statusFilter = 'ALL') {
  const summary = data?.summary || {}
  const sessions = Array.isArray(data?.sessions) ? [...data.sessions].sort((a, b) => String(b?.date || '').localeCompare(String(a?.date || ''))) : []
  const filtered = sessions.filter(item => statusFilter === 'ALL' || item?.status === statusFilter)
  const grouped = new Map()
  filtered.forEach(session => {
    const key = String(session?.date || '').slice(0, 7)
    if (!grouped.has(key)) grouped.set(key, [])
    grouped.get(key).push(session)
  })
  const notCounted = Math.max(0, safeNumber(summary.notCounted))
  const mine = summary.attendanceRate == null ? 0 : Math.min(100, Math.max(0, safeNumber(summary.attendanceRate)))
  const average = summary.classAverageRate == null ? 0 : Math.min(100, Math.max(0, safeNumber(summary.classAverageRate)))
  const chronological = [...sessions].sort((a, b) => String(a?.date || '').localeCompare(String(b?.date || '')))

  return `<div class="m-att-data-stack"><section class="m-att-overview" aria-label="Tổng quan điểm danh">
    <div class="m-att-stat"><span>Buổi lớp đã học</span><strong>${Math.max(0, safeNumber(summary.classSessions))}</strong></div>
    <div class="m-att-stat is-present"><span>Có mặt</span><strong>${Math.max(0, safeNumber(summary.present))}</strong></div>
    <div class="m-att-stat is-absent"><span>Vắng</span><strong>${Math.max(0, safeNumber(summary.absent))}</strong></div>
    ${notCounted > 0 ? `<div class="m-att-stat is-not-counted" title="Buổi trước khi vào lớp, tạm nghỉ hoặc tài khoản tạm khoá"><span>Không tính <i class="fa-regular fa-circle-question" aria-hidden="true"></i></span><strong>${notCounted}</strong><small>Buổi trước khi vào lớp, tạm nghỉ hoặc tài khoản tạm khoá</small></div>` : ''}
  </section>
  <section class="m-card m-att-compare" aria-label="So sánh chuyên cần">
    <div class="m-att-rate-copy"><span class="m-chip m-chip--accent2">Tỉ lệ chuyên cần</span><h2>Bạn và cả lớp</h2><p>${comparison(summary)}</p></div>
    <div class="m-att-rate-bars">
      <div><span>Bạn <strong>${rateText(summary.attendanceRate)}</strong></span><div class="m-att-rate-track"><i style="--m-att-rate:${mine}%"></i></div></div>
      <div><span>Trung bình lớp <strong>${rateText(summary.classAverageRate)}</strong></span><div class="m-att-rate-track is-class"><i style="--m-att-rate:${average}%"></i></div></div>
    </div>
  </section>
  ${sessions.length ? `<section class="m-card m-att-heatmap" aria-label="Lịch chấm điểm danh"><div><h2>Lịch chấm</h2><p>Mỗi ô là một buổi, theo thứ tự thời gian.</p></div><div class="m-att-heat-cells">${chronological.map(session => {
    const meta = statusMeta(session?.status)
    return `<span class="${meta.className}" title="${escapeHtml(`${formatDate(session?.date)}: ${meta.label}`)}" aria-label="${escapeHtml(`${formatDate(session?.date)}: ${meta.label}`)}"></span>`
  }).join('')}</div></section>` : ''}
  <section class="m-att-list-section" aria-labelledby="attendance-list-title">
    <div class="m-att-list-head"><div><h2 id="attendance-list-title">Các buổi học</h2><p>${escapeHtml(data?.className || 'Lớp học')}</p></div>
      <div class="m-tabs m-att-status-filter" role="group" aria-label="Lọc trạng thái">
        ${[['ALL', 'Tất cả'], ['PRESENT', 'Có mặt'], ['ABSENT', 'Vắng']].map(([value, label]) => `<button type="button" class="m-tab" data-att-status="${value}" aria-pressed="${statusFilter === value}">${label}</button>`).join('')}
      </div>
    </div>
    <div class="m-att-session-list">${sessions.length === 0
      ? `<div class="m-att-empty">${renderMascot({ mood: 'wink', size: 128 })}<div><h3>Chưa có buổi học trong khoảng này</h3><p>Hãy thử mở rộng khoảng ngày để xem thêm nhé!</p></div></div>`
      : filtered.length === 0
        ? '<div class="m-att-filter-empty"><p>Không có buổi nào khớp trạng thái đã chọn.</p></div>'
        : [...grouped.entries()].map(([, items]) => `<section class="m-att-month"><h3>${monthLabel(items[0]?.date)}</h3>${items.map(renderSession).join('')}</section>`).join('')}
    </div>
  </section></div>`
}

function renderSkeleton() {
  return `<div class="m-att-skeleton" aria-label="Đang tải điểm danh"><span></span><span></span><span></span><span></span></div>`
}

export function renderAttendanceView() {
  return `<div class="app-layout navy-student m-student-page m-attendance-page">
    ${renderSidebar('attendance')}
    <div class="main-content">
      ${renderNavbar('Học tập / Điểm danh')}
      <main class="content-body"><div class="m-att-wrap" id="attendance-root">
        <header class="m-att-hero"><div><span class="m-chip"><i class="fa-solid fa-clipboard-check" aria-hidden="true"></i> Chuyên cần</span><h1>Điểm danh</h1><p>Theo dõi các buổi bạn đã học và đã nghỉ so với cả lớp</p></div><div class="m-att-hero-mascot">${renderMascot({ mood: 'happy', size: 112 })}</div></header>
        <div id="attendance-app" aria-live="polite">${renderSkeleton()}</div>
      </div></main>
    </div>
  </div>`
}

function normalizeClasses(raw) {
  const list = Array.isArray(raw) ? raw : (raw?.items || raw?.classes || [])
  const allowed = Array.isArray(state.user?.classIds) ? new Set(state.user.classIds) : null
  return list.filter(item => item?.id && (!allowed || allowed.has(item.id))).map(item => ({ id: String(item.id), name: String(item.name || 'Lớp học') }))
}

function renderFilters(container, classes, filters) {
  container.innerHTML = `<section class="m-card m-att-filters" aria-label="Bộ lọc điểm danh">
    <div class="m-att-filter-grid">
      <label class="m-att-field"><span>Lớp học</span>${classes.length > 1
        ? `<select id="attendance-class" class="m-select">${classes.map(item => `<option value="${escapeHtml(item.id)}" ${item.id === filters.classId ? 'selected' : ''}>${escapeHtml(item.name)}</option>`).join('')}</select>`
        : `<strong class="m-att-single-class">${escapeHtml(classes[0]?.name || 'Lớp học')}</strong>`}</label>
      <label class="m-att-field"><span>Từ ngày</span><input id="attendance-from" type="date" value="${escapeHtml(filters.fromDate)}"></label>
      <label class="m-att-field"><span>Đến ngày</span><input id="attendance-to" type="date" value="${escapeHtml(filters.toDate)}"></label>
      <button type="button" class="m-btn m-btn--primary" id="attendance-view"><i class="fa-solid fa-eye" aria-hidden="true"></i> Xem</button>
    </div>
    <div class="m-att-quick" aria-label="Khoảng ngày nhanh">
      <button type="button" class="m-chip" data-att-range="30">30 ngày</button>
      <button type="button" class="m-chip" data-att-range="month">Tháng này</button>
      <button type="button" class="m-chip" data-att-range="90">Học kỳ (90 ngày)</button>
    </div>
    <p class="m-att-error" id="attendance-filter-error" role="alert"></p>
  </section><div id="attendance-content">${renderSkeleton()}</div>`
}

function quickRangeValue(fromDate, toDate) {
  const today = vnToday()
  if (toDate !== today) return ''
  if (fromDate === `${today.slice(0, 7)}-01`) return 'month'
  if (fromDate === addDays(today, -29)) return '30'
  if (fromDate === addDays(today, -89)) return '90'
  return ''
}

export function bindAttendanceEvents() {
  bindSidebarEvents()
  const root = document.getElementById('attendance-root')
  const app = root?.querySelector('#attendance-app')
  if (!root || !app) return

  activeController?.abort()
  const lifecycleController = new AbortController()
  activeController = lifecycleController
  const lifecycleId = ++requestId
  const active = () => !lifecycleController.signal.aborted && root.isConnected !== false && document.getElementById('attendance-root') === root && window.location.hash.split('?')[0] === '#attendance'
  const onHashChange = () => {
    if (window.location.hash.split('?')[0] !== '#attendance') lifecycleController.abort()
  }
  window.addEventListener?.('hashchange', onHashChange, { once: true })

  const initialize = async () => {
    let classes = normalizeClasses(state.classes || [])
    if (!classes.length) {
      try {
        const raw = await api.getClasses('', { signal: lifecycleController.signal })
        if (!active() || lifecycleId !== requestId) return
        classes = normalizeClasses(raw)
        state.classes = classes
      } catch (error) {
        if (!active() || error?.name === 'AbortError') return
        app.innerHTML = `<div class="m-att-message m-card"><h2>Không tải được danh sách lớp</h2><p>${escapeHtml(error?.message || 'Vui lòng thử lại.')}</p><button type="button" class="m-btn m-btn--secondary" id="attendance-retry-classes">Thử lại</button></div>`
        app.querySelector('#attendance-retry-classes')?.addEventListener('click', () => {
          app.innerHTML = renderSkeleton()
          initialize()
        })
        return
      }
    }
    if (!active()) return
    if (!classes.length) {
      app.innerHTML = `<div class="m-att-empty m-card">${renderMascot({ mood: 'wink', size: 128 })}<div><h2>Bạn chưa có lớp học</h2><p>Khi được thêm vào lớp, các buổi điểm danh sẽ xuất hiện tại đây.</p></div></div>`
      return
    }

    const params = new URLSearchParams(window.location.hash.split('?')[1] || '')
    const defaults = defaultRange()
    const requestedClass = params.get('classId') || ''
    const filters = {
      classId: classes.some(item => item.id === requestedClass) ? requestedClass : classes[0].id,
      fromDate: params.get('fromDate') || defaults.fromDate,
      toDate: params.get('toDate') || defaults.toDate
    }
    renderFilters(app, classes, filters)
    const content = app.querySelector('#attendance-content')
    const errorBox = app.querySelector('#attendance-filter-error')
    let statusFilter = 'ALL'
    let attendanceData = null
    let attendanceController = null
    lifecycleController.signal.addEventListener('abort', () => attendanceController?.abort(), { once: true })

    const updateQuickButtons = () => {
      const selected = quickRangeValue(app.querySelector('#attendance-from')?.value || '', app.querySelector('#attendance-to')?.value || '')
      app.querySelectorAll('[data-att-range]').forEach(button => {
        button.setAttribute('aria-pressed', String(button.dataset.attRange === selected))
      })
    }

    const bindStatus = () => {
      content?.querySelectorAll('[data-att-status]').forEach(button => button.addEventListener('click', () => {
        statusFilter = button.dataset.attStatus
        content.innerHTML = renderAttendanceData(attendanceData, statusFilter)
        bindStatus()
      }))
    }

    const load = async () => {
      filters.classId = app.querySelector('#attendance-class')?.value || filters.classId
      filters.fromDate = app.querySelector('#attendance-from')?.value || ''
      filters.toDate = app.querySelector('#attendance-to')?.value || ''
      const validation = validateAttendanceRange(filters.fromDate, filters.toDate)
      errorBox.textContent = validation
      if (validation) return
      const key = `${filters.classId}|${filters.fromDate}|${filters.toDate}`
      if (activeRequestKey === key && attendanceController && !attendanceController.signal.aborted) return
      attendanceController?.abort()
      attendanceController = new AbortController()
      const currentRequest = ++requestId
      activeRequestKey = key
      content.innerHTML = renderSkeleton()
      const query = new URLSearchParams(filters)
      window.history.replaceState(null, '', `#attendance?${query.toString()}`)
      try {
        const data = await api.getStudentAttendance({ ...filters }, { signal: attendanceController.signal })
        if (!active() || currentRequest !== requestId || attendanceController.signal.aborted) return
        attendanceData = data || {}
        statusFilter = 'ALL'
        content.innerHTML = renderAttendanceData(attendanceData, statusFilter)
        bindStatus()
      } catch (error) {
        if (!active() || currentRequest !== requestId || error?.name === 'AbortError') return
        content.innerHTML = `<div class="m-att-message m-card"><h2>Không tải được điểm danh</h2><p>${escapeHtml(error?.message || 'Vui lòng thử lại.')}</p><button type="button" class="m-btn m-btn--secondary" id="attendance-retry">Thử lại</button></div>`
        content.querySelector('#attendance-retry')?.addEventListener('click', load)
      } finally {
        if (currentRequest === requestId) activeRequestKey = ''
      }
    }

    app.querySelector('#attendance-view')?.addEventListener('click', load)
    app.querySelector('#attendance-from')?.addEventListener('change', updateQuickButtons)
    app.querySelector('#attendance-to')?.addEventListener('change', updateQuickButtons)
    app.querySelectorAll('[data-att-range]').forEach(button => button.addEventListener('click', () => {
      const today = vnToday()
      const range = button.dataset.attRange
      app.querySelector('#attendance-to').value = today
      app.querySelector('#attendance-from').value = range === 'month' ? `${today.slice(0, 7)}-01` : addDays(today, range === '90' ? -89 : -29)
      errorBox.textContent = ''
      updateQuickButtons()
      load()
    }))
    updateQuickButtons()
    load()
  }
  initialize()
}
