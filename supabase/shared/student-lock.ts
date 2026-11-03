/**
 * Helper thuần cho vòng đời khóa tài khoản học sinh theo khoảng ngày.
 *
 * Quy ước (khớp migration 20261103000000_student_lock_intervals.sql):
 * - Ngày tính theo Asia/Ho_Chi_Minh, không theo UTC của server/browser.
 * - start_date inclusive, end_date exclusive.
 * - end_date = null => còn khóa tới vô hạn.
 * - Mở khóa không làm các buổi trong [start_date, end_date) hợp lệ trở lại.
 *
 * File này chỉ chứa logic thuần + hàm truy vấn mỏng, không import Deno để
 * unit-test được bằng Node: xem supabase/scripts/test-student-lock-lifecycle.mjs.
 */

export const VN_TIME_ZONE = 'Asia/Ho_Chi_Minh'

export interface StudentLockInterval {
  student_id?: string
  start_date: string
  end_date: string | null
}

export interface LockIntervalQueryClient {
  from: (table: string) => any
}

/** Ngày YYYY-MM-DD theo giờ Việt Nam (UTC+07, không DST). */
export function vnDateString(input: Date | string | number = new Date()): string {
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

/** Một ngày buổi học có nằm trong bất kỳ interval nào không. */
export function isDateLockedOn(
  sessionDate: string,
  intervals: readonly StudentLockInterval[],
): boolean {
  if (!sessionDate) return false
  return (intervals || []).some((interval) => {
    if (!interval?.start_date) return false
    if (sessionDate < interval.start_date) return false
    return interval.end_date === null || interval.end_date === undefined
      ? true
      : sessionDate < interval.end_date
  })
}

/** Một học sinh có bị khóa trong ngày buổi học hay không. */
export function isStudentLockedOn(
  studentId: string,
  sessionDate: string,
  intervals: readonly StudentLockInterval[],
): boolean {
  if (!studentId) return false
  return (intervals || []).some((interval) => {
    if (interval?.student_id && interval.student_id !== studentId) return false
    return isDateLockedOn(sessionDate, [interval])
  })
}

/** Tập student_id bị khóa trong ngày (dùng cho roster/attendance). */
export function lockedStudentIdsOn(
  sessionDate: string,
  intervals: readonly StudentLockInterval[],
): Set<string> {
  const result = new Set<string>()
  for (const interval of intervals || []) {
    if (interval?.student_id && isDateLockedOn(sessionDate, [interval])) {
      result.add(interval.student_id)
    }
  }
  return result
}

/**
 * Lọc records điểm danh trước khi ghi.
 * Chỉ loại record của học sinh bị khóa đúng session_date; record pre-lock
 * hoặc sau end_date vẫn được giữ.
 */
export function filterAttendanceRecordsForLock<T extends { studentId: string }>(
  records: readonly T[],
  sessionDate: string,
  intervals: readonly StudentLockInterval[],
): { records: T[]; skipped: T[] } {
  const allowed: T[] = []
  const skipped: T[] = []
  for (const record of records || []) {
    if (record?.studentId && isStudentLockedOn(record.studentId, sessionDate, intervals)) {
      skipped.push(record)
    } else {
      allowed.push(record)
    }
  }
  return { records: allowed, skipped }
}

/**
 * Lọc danh sách ngày của set-student-sessions.
 * Không cho tạo student_session trong khoảng khóa, kể cả khi hồ sơ đã mở khóa
 * (interval cũ vẫn còn hiệu lực lịch sử).
 */
export function filterStudentSessionDates(
  sessionDates: readonly string[],
  intervals: readonly StudentLockInterval[],
): { allowed: string[]; skipped: string[] } {
  const allowed: string[] = []
  const skipped: string[] = []
  for (const date of sessionDates || []) {
    if (isDateLockedOn(date, intervals)) skipped.push(date)
    else allowed.push(date)
  }
  return { allowed, skipped }
}

function chunk<T>(items: readonly T[], size: number): T[][] {
  const result: T[][] = []
  for (let i = 0; i < items.length; i += size) result.push(items.slice(i, i + size))
  return result
}

/**
 * Truy vấn interval của nhiều học sinh rồi trả về tập id bị khóa trong ngày.
 * Ném Error khi DB lỗi để caller không âm thầm bỏ guard.
 */
export async function fetchLockedStudentIdsForDate(
  client: LockIntervalQueryClient,
  studentIds: readonly string[],
  sessionDate: string,
): Promise<Set<string>> {
  const uniqueIds = Array.from(new Set((studentIds || []).filter(Boolean)))
  const locked = new Set<string>()
  if (uniqueIds.length === 0 || !sessionDate) return locked

  for (const group of chunk(uniqueIds, 100)) {
    const { data, error } = await client
      .from('student_lock_intervals')
      .select('student_id, start_date, end_date')
      .in('student_id', group)
      .lte('start_date', sessionDate)
      .or(`end_date.is.null,end_date.gt.${sessionDate}`)
    if (error) throw new Error(error.message || 'Cannot load student lock intervals')
    for (const row of (data || []) as StudentLockInterval[]) {
      if (row?.student_id && isDateLockedOn(sessionDate, [row])) {
        locked.add(row.student_id)
      }
    }
  }
  return locked
}

/** Toàn bộ interval lịch sử của 1 học sinh, cũ nhất trước. */
export async function fetchStudentLockIntervals(
  client: LockIntervalQueryClient,
  studentId: string,
): Promise<StudentLockInterval[]> {
  const { data, error } = await client
    .from('student_lock_intervals')
    .select('student_id, start_date, end_date')
    .eq('student_id', studentId)
    .order('start_date', { ascending: true })
  if (error) throw new Error(error.message || 'Cannot load student lock intervals')
  return (data || []) as StudentLockInterval[]
}

/** Các khoảng khóa của một danh sách học sinh để lọc báo cáo nhiều ngày. */
export async function fetchLockIntervalsForStudents(
  client: LockIntervalQueryClient,
  studentIds: readonly string[],
): Promise<StudentLockInterval[]> {
  const ids = Array.from(new Set(studentIds.filter(Boolean)))
  const intervals: StudentLockInterval[] = []
  for (const group of chunk(ids, 100)) {
    const { data, error } = await client.from('student_lock_intervals')
      .select('student_id, start_date, end_date').in('student_id', group)
    if (error) throw new Error(error.message || 'Cannot load student lock intervals')
    intervals.push(...(data || []) as StudentLockInterval[])
  }
  return intervals
}
