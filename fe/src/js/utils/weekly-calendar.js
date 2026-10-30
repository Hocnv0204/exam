export const CALENDAR_TIME_ZONE = 'Asia/Ho_Chi_Minh'

export function isCalendarDay(value) {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false
  const stamp = Date.parse(`${value}T00:00:00Z`)
  return Number.isFinite(stamp) && new Date(stamp).toISOString().slice(0, 10) === value
}

export function addCalendarDays(day, count) {
  if (!isCalendarDay(day)) throw new Error('Ngày không hợp lệ')
  return new Date(Date.parse(`${day}T00:00:00Z`) + count * 86400000).toISOString().slice(0, 10)
}

export function calendarLocalDay(value = new Date()) {
  const date = new Date(value)
  if (!Number.isFinite(date.getTime())) return ''
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: CALENDAR_TIME_ZONE, year: 'numeric', month: '2-digit', day: '2-digit',
  }).formatToParts(date)
  const get = type => parts.find(part => part.type === type)?.value
  return `${get('year')}-${get('month')}-${get('day')}`
}

export function calendarWeekStart(day = calendarLocalDay()) {
  if (!isCalendarDay(day)) day = calendarLocalDay()
  const weekday = new Date(`${day}T00:00:00Z`).getUTCDay()
  return addCalendarDays(day, -((weekday + 6) % 7))
}

export function calendarInstant(raw) {
  // Never parse a naive date/time in the device timezone.
  if (typeof raw !== 'string' || !isCalendarDay(raw.slice(0, 10)) ||
      !/T\d{2}:\d{2}.*(?:Z|[+-]\d{2}:\d{2})$/i.test(raw)) return null
  const stamp = Date.parse(raw)
  return Number.isFinite(stamp) ? new Date(stamp) : null
}

export function calendarTime(raw) {
  const date = calendarInstant(raw)
  return date ? new Intl.DateTimeFormat('vi-VN', {
    timeZone: CALENDAR_TIME_ZONE, hour: '2-digit', minute: '2-digit', hourCycle: 'h23',
  }).format(date) : ''
}

export function safeCalendarMeetUrl(raw) {
  if (typeof raw !== 'string' || raw.length > 2048) return null
  try {
    const url = new URL(raw)
    if (url.protocol !== 'https:' || url.hostname !== 'meet.google.com' || url.username ||
        url.password || url.port || !/^\/[a-z]{3}-[a-z]{4}-[a-z]{3}\/?$/.test(url.pathname)) return null
    return `https://meet.google.com${url.pathname.replace(/\/$/, '')}`
  } catch { return null }
}

export function calendarLessonLink(item, role) {
  if (!item?.classId) return ''
  const sp = new URLSearchParams({ classId: item.classId })
  if (role === 'ADMIN') sp.set('tab', 'curriculum')
  if (item.lessonId) sp.set('lessonId', item.lessonId)
  return `#${role === 'ADMIN' ? 'class-details' : 'my-classes'}?${sp.toString()}`
}

export function calendarDatedEvents(events, weekStart, classes) {
  const end = addCalendarDays(weekStart, 7)
  const ids = new Set((classes || []).map(cls => cls.id))
  const seen = new Set()
  return (events || []).filter(event => {
    if (!event?.id || seen.has(event.id) || !ids.has(event.classId)) return false
    if (!isCalendarDay(event.date) || event.date < weekStart || event.date >= end) return false
    if (event.kind === 'deadline') {
      const date = calendarInstant(event.at)
      if (!date || calendarLocalDay(date) !== event.date) return false
    } else if (event.kind !== 'class-session' || event.allDay !== true) return false
    seen.add(event.id)
    return true
  }).sort((a, b) => a.date.localeCompare(b.date) || (a.at || '').localeCompare(b.at || '') || a.id.localeCompare(b.id))
}

export function escapeIcsText(raw) {
  return String(raw ?? '').replace(/<[^>]*>/g, '').replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/g, '')
    .replace(/\\/g, '\\\\').replace(/\r\n|\r|\n/g, '\\n').replace(/;/g, '\\;').replace(/,/g, '\\,')
}

function foldIcsLine(line) {
  // RFC 5545: fold at 75 OCTETS, never inside a UTF-8 code point.
  const encoder = new TextEncoder()
  let output = '', bytes = 0
  for (const char of line) {
    const length = encoder.encode(char).length
    if (bytes + length > 75) { output += '\r\n '; bytes = 1 }
    output += char
    bytes += length
  }
  return output
}

export function buildWeeklyCalendarIcs(events, now = new Date()) {
  const utc = date => date.toISOString().replace(/[-:]/g, '').replace(/\.\d{3}Z$/, 'Z')
  const lines = ['BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//EduPortal//Lich tuan//VI',
    'CALSCALE:GREGORIAN', 'METHOD:PUBLISH', 'X-WR-CALNAME:Lịch tuần EduPortal']
  for (const event of events || []) {
    if (!event?.id) continue
    let dates
    if (event.kind === 'deadline') {
      const at = calendarInstant(event.at)
      if (!at) continue
      // UTC instants import correctly even on devices with DST. A deadline is
      // a point, not an invented lesson/exam duration.
      dates = [`DTSTART:${utc(at)}`]
    } else if (event.kind === 'class-session' && event.allDay === true && isCalendarDay(event.date)) {
      dates = [`DTSTART;VALUE=DATE:${event.date.replace(/-/g, '')}`,
        `DTEND;VALUE=DATE:${addCalendarDays(event.date, 1).replace(/-/g, '')}`]
    } else continue // Meet/undated/unknown events can NEVER enter the export.
    const uid = Array.from(new TextEncoder().encode(String(event.id)))
      .map(byte => byte.toString(16).padStart(2, '0')).join('')
    const summary = event.kind === 'deadline'
      ? `Hạn nộp: ${event.title || ''} — ${event.className || ''}`
      : `Ngày học (chưa có giờ) — ${event.className || ''}`
    lines.push('BEGIN:VEVENT', `UID:${uid}@eduportal`, `DTSTAMP:${utc(new Date(now))}`, ...dates,
      `SUMMARY:${escapeIcsText(summary)}`,
      `DESCRIPTION:${escapeIcsText(event.kind === 'deadline'
        ? 'Hạn nộp bài. Múi giờ hiển thị trên EduPortal: Asia/Ho_Chi_Minh (UTC+07:00).'
        : 'Ngày học đã lưu; chưa có giờ. Không xác nhận lịch dạy hoặc lịch Meet.')}`,
      'TRANSP:TRANSPARENT', 'END:VEVENT')
  }
  lines.push('END:VCALENDAR')
  return lines.map(foldIcsLine).join('\r\n') + '\r\n'
}

// View-owned loader: abort old reads AND reject late results, including reads
// finishing after leaving/re-entering the route or switching accounts.
export function createCalendarLoader({ isActive, onLoading, onData, onError }) {
  let generation = 0
  let controller
  return {
    async load(fetcher) {
      const current = ++generation
      controller?.abort()
      controller = new AbortController()
      const signal = controller.signal
      onLoading()
      const active = () => current === generation && !signal.aborted && isActive()
      try {
        const data = await fetcher(signal)
        if (active()) onData(data)
      } catch (error) {
        if (active()) onError(error)
      }
    },
    cancel() { generation++; controller?.abort() },
  }
}
