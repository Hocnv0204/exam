/**
 * Logic thuần cho student-progress Edge Function.
 * Không phụ thuộc runtime Deno để test được bằng Node.js.
 */

export const VN_TIME_ZONE = 'Asia/Ho_Chi_Minh'
export const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
export const DATE_REGEX = /^20\d{2}-(0[1-9]|1[0-2])-(0[1-9]|[12]\d|3[01])$/

export interface LeaderboardRpcStudent {
  studentId: string
  fullName: string
  xp: number
  rank: number
}

export interface LeaderboardRpcData {
  classId: string
  className: string
  totalStudents: number
  students: LeaderboardRpcStudent[]
}

export interface LeaderboardEntry {
  rank: number
  displayName: string
  initials: string
  xp: number
  isMe: boolean
}

export interface LeaderboardResponse {
  classId: string
  className: string
  period: 'week' | 'month'
  fromDate: string
  toDate: string
  entries: LeaderboardEntry[]
  me: {
    rank: number | null
    xp: number
  }
  totalStudents: number
}

/** Ngày YYYY-MM-DD theo giờ Việt Nam (UTC+07, không DST). */
export function getVnDateString(input: Date | string | number = new Date()): string {
  const date = input instanceof Date ? input : new Date(input)
  if (!Number.isFinite(date.getTime())) throw new Error('Invalid date')
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: VN_TIME_ZONE,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(date)
  const get = (type: string) => parts.find((p) => p.type === type)?.value
  return `${get('year')}-${get('month')}-${get('day')}`
}

/** Kiểm tra chuỗi ngày hợp lệ YYYY-MM-DD và có thật trong lịch */
export function isValidCalendarDate(dateStr: string): boolean {
  if (typeof dateStr !== 'string' || !DATE_REGEX.test(dateStr)) return false
  const parsed = new Date(`${dateStr}T00:00:00Z`)
  if (!Number.isFinite(parsed.getTime())) return false
  return parsed.toISOString().slice(0, 10) === dateStr
}

/** Cộng / trừ ngày an toàn trên chuẩn UTC */
export function addDays(dateStr: string, count: number): string {
  const ms = Date.parse(`${dateStr}T00:00:00Z`) + count * 86400000
  return new Date(ms).toISOString().slice(0, 10)
}

/** Khoảng cách số ngày giữa hai ngày YYYY-MM-DD */
export function getDateDiffDays(fromDate: string, toDate: string): number {
  const fromMs = Date.parse(`${fromDate}T00:00:00Z`)
  const toMs = Date.parse(`${toDate}T00:00:00Z`)
  return Math.round((toMs - fromMs) / 86400000)
}

/** Lấy khoảng tuần hiện tại (Thứ Hai -> Chủ Nhật) theo ngày VN */
export function getVnWeekRange(todayStr: string): { fromDate: string; toDate: string } {
  const parsed = new Date(`${todayStr}T00:00:00Z`)
  const dayOfWeek = (parsed.getUTCDay() + 6) % 7 // 0 = Thứ Hai, ..., 6 = Chủ Nhật
  const fromDate = addDays(todayStr, -dayOfWeek)
  const toDate = addDays(fromDate, 6)
  return { fromDate, toDate }
}

/** Lấy khoảng tháng dương lịch hiện tại (ngày 1 -> ngày cuối tháng) theo ngày VN */
export function getVnMonthRange(todayStr: string): { fromDate: string; toDate: string } {
  const year = Number(todayStr.slice(0, 4))
  const month = Number(todayStr.slice(5, 7)) // 1-12
  const fromDate = `${todayStr.slice(0, 7)}-01`
  // Ngày 0 của tháng kế tiếp = ngày cuối của tháng hiện tại
  const lastDay = new Date(Date.UTC(year, month, 0)).getUTCDate()
  const toDate = `${todayStr.slice(0, 7)}-${String(lastDay).padStart(2, '0')}`
  return { fromDate, toDate }
}

/**
 * Định dạng tên học sinh riêng tư theo hợp đồng:
 * "Nguyễn Minh Anh" -> tên + chữ cái đầu họ: "Minh Anh N."
 * một từ -> giữ nguyên
 * rỗng -> "Học sinh"
 * initials: 2 ký tự (ví dụ "MA")
 */
export function formatStudentName(fullName: string | null | undefined): { displayName: string; initials: string } {
  if (!fullName || !fullName.trim()) {
    return { displayName: 'Học sinh', initials: 'HS' }
  }
  const parts = fullName.trim().split(/\s+/)
  if (parts.length === 1) {
    const word = parts[0]
    const initials = word.length >= 2 ? word.substring(0, 2).toUpperCase() : `${word}X`.toUpperCase()
    return { displayName: word, initials }
  }
  const ho = parts[0]
  const tenParts = parts.slice(1)
  const ten = tenParts.join(' ')
  const hoInitial = ho[0].toUpperCase()
  const displayName = `${ten} ${hoInitial}.`

  let initials = ''
  if (tenParts.length >= 2) {
    // "Minh Anh" -> 'M' + 'A' = "MA"
    const lastTwo = tenParts.slice(-2)
    initials = (lastTwo[0][0] + lastTwo[1][0]).toUpperCase()
  } else {
    // 1 từ trong tên, ví dụ "Nam": lấy 2 chữ cái đầu nếu có, hoặc chữ cái tên + họ
    const singleTen = tenParts[0]
    if (singleTen.length >= 2) {
      initials = singleTen.substring(0, 2).toUpperCase()
    } else {
      initials = `${singleTen[0]}${ho[0]}`.toUpperCase()
    }
  }

  return { displayName, initials }
}

export type ParseResult<T> =
  | { ok: true; params: T }
  | { ok: false; status: number; error: string }

/** Phân tích & validate query params cho scope=attendance */
export function parseAttendanceQuery(
  searchParams: URLSearchParams,
  userClassIds: string[],
  todayVn: string
): ParseResult<{ classId: string; fromDate: string; toDate: string }> {
  const classId = searchParams.get('classId') || ''
  if (!classId || !UUID_REGEX.test(classId)) {
    return { ok: false, status: 400, error: 'classId không hợp lệ.' }
  }
  if (!userClassIds.includes(classId)) {
    return { ok: false, status: 403, error: 'Bạn không thuộc lớp này.' }
  }

  const rawToDate = searchParams.get('toDate')
  let toDate = todayVn
  if (rawToDate !== null && rawToDate !== '') {
    if (!isValidCalendarDate(rawToDate)) {
      return { ok: false, status: 400, error: 'toDate không hợp lệ (định dạng YYYY-MM-DD).' }
    }
    toDate = rawToDate
  }

  const rawFromDate = searchParams.get('fromDate')
  let fromDate = addDays(toDate, -29)
  if (rawFromDate !== null && rawFromDate !== '') {
    if (!isValidCalendarDate(rawFromDate)) {
      return { ok: false, status: 400, error: 'fromDate không hợp lệ (định dạng YYYY-MM-DD).' }
    }
    fromDate = rawFromDate
  }

  if (fromDate > toDate) {
    return { ok: false, status: 400, error: 'fromDate không được lớn hơn toDate.' }
  }

  if (getDateDiffDays(fromDate, toDate) > 366) {
    return { ok: false, status: 400, error: 'Khoảng thời gian không được vượt quá 366 ngày.' }
  }

  return { ok: true, params: { classId, fromDate, toDate } }
}

/** Phân tích & validate query params cho scope=leaderboard */
export function parseLeaderboardQuery(
  searchParams: URLSearchParams,
  userClassIds: string[],
  todayVn: string
): ParseResult<{ classId: string; period: 'week' | 'month'; fromDate: string; toDate: string }> {
  const classId = searchParams.get('classId') || ''
  if (!classId || !UUID_REGEX.test(classId)) {
    return { ok: false, status: 400, error: 'classId không hợp lệ.' }
  }
  if (!userClassIds.includes(classId)) {
    return { ok: false, status: 403, error: 'Bạn không thuộc lớp này.' }
  }

  const rawPeriod = searchParams.get('period') || 'week'
  if (rawPeriod !== 'week' && rawPeriod !== 'month') {
    return { ok: false, status: 400, error: "period phải là 'week' hoặc 'month'." }
  }
  const period = rawPeriod as 'week' | 'month'

  const { fromDate, toDate } = period === 'week' ? getVnWeekRange(todayVn) : getVnMonthRange(todayVn)
  return { ok: true, params: { classId, period, fromDate, toDate } }
}

/**
 * Xử lý dữ liệu bảng xếp hạng từ RPC trước khi trả về client:
 * - Ẩn danh danh tính học sinh khác, giữ tên đầy đủ cho chính mình
 * - Xếp top 10 cho `entries`
 * - Gán mục `me` với rank và xp
 */
export function processLeaderboardData(
  rpcData: LeaderboardRpcData,
  currentUserId: string,
  currentUserName: string | null | undefined,
  period: 'week' | 'month',
  fromDate: string,
  toDate: string
): LeaderboardResponse {
  const rawStudents = Array.isArray(rpcData?.students) ? rpcData.students : []
  const meStudent = rawStudents.find((s) => s.studentId === currentUserId)

  const me = {
    rank: meStudent ? meStudent.rank : null,
    xp: meStudent ? meStudent.xp : 0,
  }

  // Chuyển đổi thành các entry với tên riêng tư
  const mapped = rawStudents.map((s) => {
    const isMe = s.studentId === currentUserId
    const formatted = formatStudentName(s.fullName)
    const displayName = isMe ? (currentUserName || s.fullName || 'Tôi') : formatted.displayName
    const initials = formatted.initials
    return {
      studentId: s.studentId,
      rank: s.rank,
      displayName,
      initials,
      xp: s.xp,
      isMe,
    }
  })

  // Thứ tự hiển thị: rank tăng dần (XP giảm dần), phụ theo displayName (tiếng Việt)
  mapped.sort((a, b) => {
    if (a.rank !== b.rank) return a.rank - b.rank
    return a.displayName.localeCompare(b.displayName, 'vi')
  })

  // entries chỉ lấy tối đa 10 học sinh dẫn đầu
  const entries: LeaderboardEntry[] = mapped.slice(0, 10).map(({ rank, displayName, initials, xp, isMe }) => ({
    rank,
    displayName,
    initials,
    xp,
    isMe,
  }))

  return {
    classId: rpcData?.classId || '',
    className: rpcData?.className || '',
    period,
    fromDate,
    toDate,
    entries,
    me,
    totalStudents: rpcData?.totalStudents ?? rawStudents.length,
  }
}
