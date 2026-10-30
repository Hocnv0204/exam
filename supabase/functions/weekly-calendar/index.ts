/** Read-only calendar. No schedule is inferred from lesson/meeting creation dates.
 * GET ?weekStart=YYYY-MM-DD (Monday, 7 local days)&classId=UUID (optional).
 * Student scope is requireAuth.user.classIds ONLY; targeted homework is checked
 * separately without returning target/student IDs. All DTOs exclude tuition/PII.
 * Existing Meet policy is admin-only: students receive verified lesson links,
 * not meeting URIs. Neither role receives a fabricated Meet date/time.
 */
import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { requireAuth } from '../../shared/auth-middleware.ts'
import { handleCors, jsonResponse, errorResponse } from '../../shared/response-helper.ts'

const TIME_ZONE = 'Asia/Ho_Chi_Minh'
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
const CLASS_CHUNK = 50
const MAX_CLASSES = 500
const ROW_LIMIT = 500 // below PostgREST's default row cap, with one overflow sentinel
const MAX_EVENTS = 1000
const MAX_MEETINGS = 100
type Client = Awaited<ReturnType<typeof requireAuth>>['serviceRoleClient']

class CalendarError extends Error {
  constructor(message: string, public status = 500) { super(message) }
}

function addDays(day: string, count: number) {
  return new Date(Date.parse(`${day}T00:00:00Z`) + count * 86400000).toISOString().slice(0, 10)
}

function localDay(now: Date) {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: TIME_ZONE, year: 'numeric', month: '2-digit', day: '2-digit',
  }).formatToParts(now)
  const get = (type: string) => parts.find(p => p.type === type)?.value
  return `${get('year')}-${get('month')}-${get('day')}`
}

function weekRange(raw: string | null) {
  let start = raw || localDay(new Date())
  // Modern dates only: Vietnam is UTC+07 year-round, independent of the
  // browser/server timezone and their DST transitions.
  if (!/^20\d{2}-\d{2}-\d{2}$/.test(start) ||
      !Number.isFinite(Date.parse(`${start}T00:00:00Z`)) || addDays(start, 0) !== start) {
    throw new CalendarError('weekStart phải là ngày hợp lệ (2000–2099).', 400)
  }
  const weekday = new Date(`${start}T00:00:00Z`).getUTCDay()
  if (raw && weekday !== 1) throw new CalendarError('weekStart phải là thứ Hai.', 400)
  if (!raw) start = addDays(start, -((weekday + 6) % 7))
  const end = addDays(start, 7)
  return { start, end, startAt: `${start}T00:00:00+07:00`, endAt: `${end}T00:00:00+07:00` }
}

function chunks<T>(items: T[], size: number): T[][] {
  const result: T[][] = []
  for (let i = 0; i < items.length; i += size) result.push(items.slice(i, i + size))
  return result
}

function boundedRows(result: { data: any[] | null; error: unknown }, max = ROW_LIMIT): any[] {
  if (result.error) throw new CalendarError('Không tải được dữ liệu lịch tuần. Vui lòng thử lại.')
  const rows = result.data || []
  if (rows.length > max) throw new CalendarError('Lịch có quá nhiều dữ liệu. Vui lòng chọn một lớp hoặc tuần khác.', 413)
  return rows
}

function safeMeetUrl(raw: unknown): string | null {
  if (typeof raw !== 'string' || raw.length > 2048) return null
  try {
    const url = new URL(raw)
    if (url.protocol !== 'https:' || url.hostname !== 'meet.google.com' ||
        url.username || url.password || url.port || !/^\/[a-z]{3}-[a-z]{4}-[a-z]{3}\/?$/.test(url.pathname)) return null
    return `https://meet.google.com${url.pathname.replace(/\/$/, '')}`
  } catch { return null }
}

async function assignedHomeworkIds(client: Client, ids: string[], studentId: string) {
  const allowed = new Set<string>()
  for (const group of chunks(ids, 100)) {
    // Empty !inner embed = existence check; no unbounded target arrays and no
    // assumption that a filtered-out target means "assigned to everyone".
    const [targetedResult, ownResult] = await Promise.all([
      client.from('homeworks').select('id,homework_targets!inner()').in('id', group).limit(101),
      client.from('homework_targets').select('homework_id').in('homework_id', group)
        .eq('student_id', studentId).limit(101),
    ])
    const targeted = new Set(boundedRows(targetedResult, 100).map(row => row.id))
    const own = new Set(boundedRows(ownResult, 100).map(row => row.homework_id))
    for (const id of group) if (!targeted.has(id) || own.has(id)) allowed.add(id)
  }
  return allowed
}

serve(async (req: Request) => {
  const cors = handleCors(req)
  if (cors) return cors
  if (req.method !== 'GET') return errorResponse('Method not allowed', 405)
  try {
    let auth: Awaited<ReturnType<typeof requireAuth>>
    try { auth = await requireAuth(req) } catch { return errorResponse('Unauthorized', 401) }
    const { user, serviceRoleClient: client } = auth
    if (user.role !== 'ADMIN' && user.role !== 'STUDENT') return errorResponse('Không có quyền xem lịch.', 403)
    const url = new URL(req.url)
    const range = weekRange(url.searchParams.get('weekStart'))
    const classId = url.searchParams.get('classId') || ''
    if (classId && !UUID.test(classId)) return errorResponse('classId không hợp lệ.', 400)
    const enrolled = [...new Set(user.classIds || [])]
    if (user.role === 'STUDENT' && classId && !enrolled.includes(classId)) {
      return errorResponse('Bạn không thuộc lớp này.', 403)
    }
    if (user.role === 'STUDENT' && enrolled.length > MAX_CLASSES) {
      throw new CalendarError('Có quá nhiều lớp để tải lịch tuần.', 413)
    }

    // Only minimal metadata for the class filter. No profiles, balances,
    // attendance records, student_sessions, or financial columns are queried.
    const classes: { id: string; name: string }[] = []
    if (user.role === 'ADMIN') {
      classes.push(...boundedRows(await client.from('classes').select('id,name')
        .order('name').order('id').limit(MAX_CLASSES + 1), MAX_CLASSES).map(({ id, name }) => ({ id, name })))
    } else {
      // Các lô lớp độc lập nhau -> chạy song song (giữ nguyên thứ tự lô khi gộp)
      const classChunkResults = await Promise.all(
        chunks(enrolled, CLASS_CHUNK).map((group) => client.from('classes').select('id,name')
          .in('id', group).order('name').order('id').limit(CLASS_CHUNK + 1))
      )
      for (const result of classChunkResults) {
        classes.push(...boundedRows(result, CLASS_CHUNK)
          .filter(row => enrolled.includes(row.id)).map(({ id, name }) => ({ id, name })))
      }
    }
    if (classId && !classes.some(cls => cls.id === classId)) return errorResponse('Không tìm thấy lớp.', 404)
    const selected = classes.filter(cls => !classId || cls.id === classId)
    const classNames = new Map(selected.map(cls => [cls.id, cls.name]))
    const allowedClassIds = [...classNames.keys()]
    const homeworks: any[] = []
    const sessions: any[] = []
    const meetingRows: any[] = []
    const warnings: string[] = []
    let meetingsAvailable = true
    let meetingsTruncated = false

    // Các lô lớp độc lập nhau -> truy vấn song song, gộp theo thứ tự lô
    const eventChunkResults = await Promise.all(
      chunks(allowedClassIds, CLASS_CHUNK).map((group) => Promise.all([
        client.from('homeworks')
          .select('id,title,deadline,is_published,lessons!inner(id,title,chapters!inner(class_id))')
          .eq('is_published', true).in('lessons.chapters.class_id', group)
          .gte('deadline', range.startAt).lt('deadline', range.endAt)
          .order('deadline').order('id').limit(ROW_LIMIT + 1),
        client.from('class_sessions').select('id,class_id,session_date')
          .in('class_id', group).gte('session_date', range.start).lt('session_date', range.end)
          .order('session_date').order('id').limit(ROW_LIMIT + 1),
        client.from('meeting_sessions')
          .select(user.role === 'ADMIN'
            ? 'id,lesson_id,meeting_uri,created_at,lessons!inner(id,title,chapters!inner(class_id))'
            : 'id,lesson_id,created_at,lessons!inner(id,title,chapters!inner(class_id))')
          .in('lessons.chapters.class_id', group)
          .order('created_at', { ascending: false }).order('id').limit(MAX_MEETINGS + 1),
      ]))
    )

    for (const [hwResult, sessionResult, meetResult] of eventChunkResults) {
      homeworks.push(...boundedRows(hwResult))
      sessions.push(...boundedRows(sessionResult))
      if (homeworks.length + sessions.length > MAX_EVENTS) {
        throw new CalendarError('Lịch có quá nhiều sự kiện. Vui lòng chọn một lớp.', 413)
      }
      // Meet is contextual/optional. A missing table or lookup failure must not
      // invent events or hide the separately loaded dated calendar.
      if (meetResult.error) meetingsAvailable = false
      else {
        const rows = meetResult.data || []
        if (rows.length > MAX_MEETINGS) meetingsTruncated = true
        meetingRows.push(...rows.slice(0, MAX_MEETINGS))
      }
    }

    const candidates = homeworks.filter(row => row.is_published === true &&
      classNames.has(row.lessons?.chapters?.class_id) &&
      Number.isFinite(Date.parse(row.deadline)) &&
      Date.parse(row.deadline) >= Date.parse(range.startAt) && Date.parse(row.deadline) < Date.parse(range.endAt))
    const assigned = user.role === 'STUDENT'
      ? await assignedHomeworkIds(client, candidates.map(row => row.id), user.id) : null
    const events: any[] = candidates.filter(row => !assigned || assigned.has(row.id)).map(row => ({
      id: `deadline-${row.id}`, kind: 'deadline', title: row.title,
      classId: row.lessons.chapters.class_id, className: classNames.get(row.lessons.chapters.class_id),
      lessonId: row.lessons.id, lessonTitle: row.lessons.title,
      homeworkId: row.id, at: new Date(row.deadline).toISOString(), date: localDay(new Date(row.deadline)),
    }))
    for (const row of sessions) {
      if (!classNames.has(row.class_id) || !/^\d{4}-\d{2}-\d{2}$/.test(row.session_date) ||
          row.session_date < range.start || row.session_date >= range.end) continue
      events.push({ id: `session-${row.id}`, kind: 'class-session', title: 'Ngày học (chưa có giờ)',
        classId: row.class_id, className: classNames.get(row.class_id), date: row.session_date, allDay: true })
    }
    events.sort((a, b) => a.date.localeCompare(b.date) || (a.at || '').localeCompare(b.at || '') || a.id.localeCompare(b.id))

    const meetings: any[] = []
    const seenLessons = new Set<string>()
    meetingRows.sort((a, b) => b.created_at.localeCompare(a.created_at))
    if (meetingsAvailable) for (const row of meetingRows) {
      const lesson = row.lessons
      const cls = lesson?.chapters?.class_id
      if (!classNames.has(cls) || row.lesson_id !== lesson?.id || seenLessons.has(lesson.id)) continue
      seenLessons.add(lesson.id)
      if (meetings.length >= MAX_MEETINGS) { meetingsTruncated = true; continue }
      meetings.push({ lessonId: lesson.id, lessonTitle: lesson.title, classId: cls, className: classNames.get(cls),
        // Preserve existing Meet authorization. Student can open only the
        // verified class lesson; this endpoint never broadens raw link access.
        ...(user.role === 'ADMIN' ? { url: safeMeetUrl(row.meeting_uri) } : {}),
      })
    }
    if (!meetingsAvailable) warnings.push('Không tải được liên kết Meet theo bài học. Lịch ngày học và deadline vẫn được hiển thị.')
    if (meetingsTruncated) warnings.push('Chỉ hiển thị tối đa 100 liên kết Meet gần nhất; hãy chọn một lớp hoặc xem các bài học để tìm thêm.')
    const response = jsonResponse({ timeZone: TIME_ZONE, weekStart: range.start, weekEnd: range.end,
      classes, events, meetings, meetingsAvailable, warnings })
    response.headers.set('Cache-Control', 'no-store')
    return response
  } catch (error) {
    return errorResponse(error instanceof CalendarError ? error.message : 'Không tải được lịch tuần.',
      error instanceof CalendarError ? error.status : 500)
  }
})
