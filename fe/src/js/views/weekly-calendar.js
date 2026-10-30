import { renderSidebar, bindSidebarEvents } from '../components/sidebar.js'
import mascotUrl from '../../assets/mascot-study.svg'
import { renderNavbar } from '../components/navbar.js'
import { state } from '../state.js'
import { api } from '../api.js'
import { escapeHtml } from '../utils/download-helper.js'
import {
  CALENDAR_TIME_ZONE, addCalendarDays, calendarLocalDay, calendarWeekStart, calendarTime,
  calendarLessonLink, calendarDatedEvents, safeCalendarMeetUrl, buildWeeklyCalendarIcs, createCalendarLoader,
} from '../utils/weekly-calendar.js'

export function renderWeeklyCalendarView() {
  return `
    <div class="app-layout navy-student">
      ${renderSidebar('weekly-calendar')}
      <div class="main-content">
        ${renderNavbar('Học tập / Lịch tuần')}
        <div class="content-body" id="weekly-calendar-root">
          <div class="navy-hero">
            <img src="${typeof mascotUrl !== 'undefined' ? mascotUrl : ''}" alt="Linh vật học tập">
            <div>
              <h1>Lịch tuần</h1>
              <p>Ngày học đã lưu và hạn nộp bài theo tuần.</p>
            </div>
          </div>
          <style>
            #weekly-calendar-root .wc-toolbar {display:flex;flex-wrap:wrap;align-items:center;gap:10px;margin:16px 0}
            #weekly-calendar-root button {width:auto;min-height:44px}
            #weekly-calendar-root select {max-width:100%;min-height:44px;padding:6px;border:1px solid #cbd5e1;border-radius:8px}
            #weekly-calendar-root .wc-grid {display:grid;grid-template-columns:repeat(7,minmax(0,1fr));gap:8px}
            #weekly-calendar-root .wc-day {min-width:0;padding:12px;background:#fff;border:1px solid #cbd5e1;border-radius:10px;overflow-wrap:anywhere}
            #weekly-calendar-root .wc-day h3 {font-size:14px;margin:0 0 12px}
            #weekly-calendar-root .wc-day[aria-current="date"] {border:2px solid #0066cc}
            #weekly-calendar-root .wc-events {list-style:none;padding:0;margin:0}
            #weekly-calendar-root .wc-event {border-left:3px solid #0066cc;border-radius:4px;padding:8px;margin-bottom:10px;background:#eff6ff;font-size:13px}
            #weekly-calendar-root .wc-event.session {border-color:#15803d;background:#f0fdf4}
            #weekly-calendar-root .wc-meta {font-size:12px;color:#475569;margin:5px 0}
            #weekly-calendar-root .wc-note {padding:12px;border:1px solid #cbd5e1;border-radius:8px;margin:12px 0;background:#f8fafc}
            #weekly-calendar-root .wc-meet-list {display:grid;grid-template-columns:repeat(auto-fit,minmax(min(100%,260px),1fr));gap:12px;list-style:none;padding:0}
            #weekly-calendar-root a:focus-visible, #weekly-calendar-root button:focus-visible, #weekly-calendar-root select:focus-visible {outline:3px solid #0066cc;outline-offset:3px}
            @media(max-width:1000px) {#weekly-calendar-root .wc-grid {grid-template-columns:1fr} #weekly-calendar-root .wc-day {padding:14px} #weekly-calendar-root .wc-day h3 {font-size:16px}}
          </style>
          <p class="page-description">Ngày học đã lưu và hạn nộp bài • Giờ Việt Nam (UTC+07:00, Asia/Ho_Chi_Minh).</p>
          <p class="wc-note">Ngày học có thể là dữ liệu đã ghi nhận, chưa có giờ cụ thể. Link Meet theo bài học không phải lịch hẹn. Lịch này chỉ xem, không chỉnh sửa lịch dạy.</p>
          <div class="wc-toolbar" role="group" aria-label="Điều hướng tuần và lọc lớp">
            <button type="button" class="btn-secondary" id="wc-prev" aria-label="Tuần trước">← Tuần trước</button>
            <button type="button" class="btn-secondary" id="wc-today">Tuần này</button>
            <button type="button" class="btn-secondary" id="wc-next" aria-label="Tuần sau">Tuần sau →</button>
            <label for="wc-class">Lớp học</label>
            <select id="wc-class"><option value="">Tất cả lớp</option></select>
            <button type="button" class="btn-secondary" id="wc-export" disabled>Xuất lịch .ics</button>
          </div>
          <h2 id="wc-range" style="font-size:18px;"></h2>
          <p id="wc-status" role="status" aria-live="polite"></p>
          <div id="wc-content" aria-busy="true"></div>
          <section aria-labelledby="wc-meet-heading" style="margin-top:24px;">
            <h2 id="wc-meet-heading" style="font-size:18px;">Link Meet theo bài học, chưa xếp giờ</h2>
            <p class="wc-meta">Mục này không phụ thuộc tuần đang chọn. Không có liên kết giữa Meet và ngày học; ngày tạo link không phải giờ học.</p>
            <div id="wc-meet-content"></div>
          </section>
        </div>
      </div>
    </div>`
}

function dayLabel(day, includeYear = false) {
  return new Intl.DateTimeFormat('vi-VN', {
    timeZone: CALENDAR_TIME_ZONE, weekday: 'long', day: '2-digit', month: '2-digit',
    ...(includeYear ? { year: 'numeric' } : {}),
  }).format(new Date(`${day}T12:00:00+07:00`))
}

function renderEvent(event, role) {
  const isDeadline = event.kind === 'deadline'
  const link = calendarLessonLink(event, role)
  return `<li class="wc-event ${isDeadline ? '' : 'session'}">
    <div><strong>${isDeadline ? `Hạn nộp • <time datetime="${escapeHtml(event.at)}">${escapeHtml(calendarTime(event.at))}</time>` : 'Ngày học (chưa có giờ)'}</strong></div>
    ${isDeadline ? `<p style="margin:6px 0;">${escapeHtml(event.title || 'Bài tập')}</p>` : ''}
    <p class="wc-meta">${escapeHtml(event.className || 'Lớp học')}</p>
    ${event.lessonTitle ? `<p class="wc-meta">${escapeHtml(event.lessonTitle)}</p>` : ''}
    <a href="${escapeHtml(link)}">${isDeadline ? 'Xem bài học' : 'Xem lớp học'}</a>
  </li>`
}

export function bindWeeklyCalendarEvents() {
  bindSidebarEvents()
  const root = document.getElementById('weekly-calendar-root')
  if (!root) return
  const query = id => root.querySelector(`#${id}`)
  const params = new URLSearchParams(window.location.hash.split('?')[1] || '')
  let weekStart = calendarWeekStart(params.get('weekStart') || calendarLocalDay())
  let classId = params.get('classId') || ''
  let datedEvents = []
  const user = state.user
  const active = () => root.isConnected && document.getElementById('weekly-calendar-root') === root &&
    state.user === user && Boolean(state.token) && window.location.hash.split('?')[0] === '#weekly-calendar'
  const setStatus = message => { query('wc-status').textContent = message }
  const exportButton = query('wc-export')

  if (classId) {
    const option = document.createElement('option')
    option.value = classId
    option.textContent = 'Lớp đang chọn'
    query('wc-class').appendChild(option)
    query('wc-class').value = classId
  }

  const loader = createCalendarLoader({
    isActive: active,
    onLoading() {
      datedEvents = []
      exportButton.disabled = true
      query('wc-content').setAttribute('aria-busy', 'true')
      query('wc-content').innerHTML = ''
      query('wc-meet-content').innerHTML = ''
      query('wc-range').textContent = `${dayLabel(weekStart, true)} – ${dayLabel(addCalendarDays(weekStart, 6), true)}`
      setStatus('Đang tải lịch tuần…')
    },
    onData(data) {
      // A mismatched response must never be painted/exported under a new week.
      if (data?.weekStart !== weekStart || data?.timeZone !== CALENDAR_TIME_ZONE || !Array.isArray(data.classes)) {
        throw new Error('Dữ liệu lịch tuần không hợp lệ. Vui lòng thử lại.')
      }
      const classes = data.classes.filter(cls => !classId || cls.id === classId)
      datedEvents = calendarDatedEvents(data.events, weekStart, classes)
      query('wc-class').innerHTML = '<option value="">Tất cả lớp</option>' + data.classes.map(cls =>
        `<option value="${escapeHtml(cls.id)}">${escapeHtml(cls.name)}</option>`).join('')
      query('wc-class').value = classId
      const today = calendarLocalDay()
      query('wc-content').innerHTML = `${datedEvents.length ? '' : '<p class="wc-note">Không có ngày học hoặc deadline trong tuần này ở các lớp đang chọn. Điều này không có nghĩa là lớp nghỉ học.</p>'}
        ${(data.warnings || []).map(message => `<p class="wc-note">${escapeHtml(message)}</p>`).join('')}
        <div class="wc-grid" role="group" aria-label="Lịch bảy ngày">${Array.from({ length: 7 }, (_, index) => {
          const day = addCalendarDays(weekStart, index)
          const events = datedEvents.filter(event => event.date === day)
          return `<section class="wc-day" aria-labelledby="wc-day-${index}" ${today === day ? 'aria-current="date"' : ''}>
            <h3 id="wc-day-${index}"><time datetime="${day}">${escapeHtml(dayLabel(day))}</time>${today === day ? ' • Hôm nay' : ''}</h3>
            ${events.length ? `<ul class="wc-events" role="list">${events.map(event => renderEvent(event, user?.role)).join('')}</ul>` : '<p class="wc-meta">Không có dữ liệu lịch.</p>'}
          </section>`
        }).join('')}</div>`
      const classIds = new Set(classes.map(cls => cls.id))
      const meetings = (data.meetings || []).filter(item => item.lessonId && classIds.has(item.classId))
      query('wc-meet-content').innerHTML = data.meetingsAvailable === false
        ? '<p class="wc-note">Nguồn liên kết Meet chưa khả dụng. Không có lịch Meet được suy ra.</p>'
        : meetings.length ? `<ul class="wc-meet-list" role="list">${meetings.map(item => {
          const meetUrl = user?.role === 'ADMIN' ? safeCalendarMeetUrl(item.url) : null
          return `<li class="wc-note" style="margin:0;overflow-wrap:anywhere;">
            <strong>${escapeHtml(item.lessonTitle || 'Bài học')}</strong>
            <p class="wc-meta">${escapeHtml(item.className || 'Lớp học')} • Chưa xếp giờ</p>
            <a href="${escapeHtml(calendarLessonLink(item, user?.role))}">Xem bài học</a>
            ${meetUrl ? `<span aria-hidden="true"> · </span><a href="${escapeHtml(meetUrl)}" target="_blank" rel="noopener noreferrer">Mở link Meet (tab mới)</a>` : ''}
          </li>`
        }).join('')}</ul>` : '<p class="wc-note">Chưa có liên kết Meet theo bài học trong các lớp đang chọn.</p>'
      if (user?.role === 'STUDENT' && meetings.length) {
        query('wc-meet-content').insertAdjacentHTML('beforeend', '<p class="wc-meta">Theo quyền truy cập hiện tại, học sinh chỉ có liên kết tới bài học; lịch không cấp thêm quyền xem link Meet.</p>')
      }
      query('wc-content').setAttribute('aria-busy', 'false')
      exportButton.disabled = datedEvents.length === 0
      setStatus(`Đã tải ${datedEvents.length} sự kiện có ngày. ${classes.length ? '' : 'Chưa có lớp học trong phạm vi của bạn.'}`)
    },
    onError(error) {
      datedEvents = []
      exportButton.disabled = true
      query('wc-meet-content').innerHTML = ''
      query('wc-content').setAttribute('aria-busy', 'false')
      setStatus(`Không tải được lịch tuần: ${error?.message || 'Vui lòng thử lại.'}`)
      query('wc-content').innerHTML = '<button type="button" class="btn-secondary" id="wc-retry">Thử lại</button>'
      query('wc-retry').addEventListener('click', load)
    },
  })

  function load() {
    const sp = new URLSearchParams({ weekStart })
    if (classId) sp.set('classId', classId)
    window.history.replaceState(null, '', `#weekly-calendar?${sp.toString()}`)
    const requested = { weekStart, classId }
    return loader.load(signal => api.getWeeklyCalendar(requested, { signal }))
  }
  query('wc-prev').addEventListener('click', () => { weekStart = addCalendarDays(weekStart, -7); load() })
  query('wc-next').addEventListener('click', () => { weekStart = addCalendarDays(weekStart, 7); load() })
  query('wc-today').addEventListener('click', () => { weekStart = calendarWeekStart(); load() })
  query('wc-class').addEventListener('change', event => { classId = event.target.value; load() })
  exportButton.addEventListener('click', () => {
    if (!active() || exportButton.disabled || !datedEvents.length) return
    const url = URL.createObjectURL(new Blob([buildWeeklyCalendarIcs(datedEvents)], { type: 'text/calendar;charset=utf-8' }))
    const anchor = document.createElement('a')
    anchor.href = url
    anchor.download = `eduportal-${weekStart}.ics`
    document.body.appendChild(anchor)
    anchor.click()
    anchor.remove()
    setTimeout(() => URL.revokeObjectURL(url), 1000)
  })
  load()
}
