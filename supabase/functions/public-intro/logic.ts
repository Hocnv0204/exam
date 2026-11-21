// Logic thuần cho public-intro: map, normalize, validate.
// Không import Deno hay npm packages.

export interface ScheduleItem {
  day: number
  start: string
  end: string
}

export interface IntroClassItem {
  classId: string
  name: string
  gradeBlock: string
  description: string | null
  schedule: ScheduleItem[]
  maxStudents: number | null
  activeStudents: number
  sessionsHeld: number
  seatsLeft: number | null
}

export interface IntroPayload {
  classes: IntroClassItem[]
  totals: {
    classes: number
    activeStudents: number
  }
}

export interface ValidatedPublicIntroInput {
  classId: string
  publicListed: boolean
  schedule: ScheduleItem[]
  maxStudents: number | null
}

export type ValidationResult =
  | { ok: true; value: ValidatedPublicIntroInput }
  | { ok: false; error: string }

const TIME_REGEX = /^(?:[01]\d|2[0-3]):[0-5]\d$/
const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

export function isValidScheduleItem(item: any): item is ScheduleItem {
  if (!item || typeof item !== 'object') return false
  const { day, start, end } = item
  if (typeof day !== 'number' || !Number.isInteger(day) || day < 1 || day > 7) {
    return false
  }
  if (typeof start !== 'string' || !TIME_REGEX.test(start)) {
    return false
  }
  if (typeof end !== 'string' || !TIME_REGEX.test(end)) {
    return false
  }
  if (start >= end) {
    return false
  }
  return true
}

export function normalizeSchedule(schedule: unknown): ScheduleItem[] {
  if (!Array.isArray(schedule)) return []
  const valid: ScheduleItem[] = schedule.filter(isValidScheduleItem).map(item => ({
    day: item.day,
    start: item.start,
    end: item.end,
  }))
  valid.sort((a, b) => {
    if (a.day !== b.day) return a.day - b.day
    return a.start.localeCompare(b.start)
  })
  return valid
}

export function validatePublicIntroInput(body: unknown): ValidationResult {
  if (!body || typeof body !== 'object') {
    return { ok: false, error: 'Dữ liệu yêu cầu không hợp lệ' }
  }

  const b = body as Record<string, any>

  // 1. classId: uuid
  if (typeof b.classId !== 'string' || !UUID_REGEX.test(b.classId)) {
    return { ok: false, error: 'Mã lớp (classId) phải là UUID hợp lệ' }
  }

  // 2. publicListed: boolean
  if (typeof b.publicListed !== 'boolean') {
    return { ok: false, error: 'Trạng thái hiển thị (publicListed) phải là true hoặc false' }
  }

  // 3. schedule: mảng tối đa 7 phần tử, mỗi phần tử hợp lệ, không trùng (day, start)
  if (!Array.isArray(b.schedule)) {
    return { ok: false, error: 'Lịch học (schedule) phải là một danh sách' }
  }

  if (b.schedule.length > 7) {
    return { ok: false, error: 'Lịch học không được vượt quá 7 khung giờ' }
  }

  const seen = new Set<string>()
  const parsedSchedule: ScheduleItem[] = []

  for (let i = 0; i < b.schedule.length; i++) {
    const item = b.schedule[i]
    if (!item || typeof item !== 'object') {
      return { ok: false, error: `Khung giờ thứ ${i + 1} không hợp lệ` }
    }

    const { day, start, end } = item

    if (typeof day !== 'number' || !Number.isInteger(day) || day < 1 || day > 7) {
      return { ok: false, error: `Thứ trong tuần (day) ở khung giờ thứ ${i + 1} phải là số nguyên từ 1 đến 7` }
    }

    if (typeof start !== 'string' || !TIME_REGEX.test(start)) {
      return { ok: false, error: `Giờ bắt đầu ở khung giờ thứ ${i + 1} phải theo định dạng HH:MM (00:00 - 23:59)` }
    }

    if (typeof end !== 'string' || !TIME_REGEX.test(end)) {
      return { ok: false, error: `Giờ kết thúc ở khung giờ thứ ${i + 1} phải theo định dạng HH:MM (00:00 - 23:59)` }
    }

    if (start >= end) {
      return { ok: false, error: `Giờ bắt đầu phải trước giờ kết thúc ở khung giờ thứ ${i + 1}` }
    }

    const key = `${day}_${start}`
    if (seen.has(key)) {
      return { ok: false, error: `Trùng lịch học: đã có khung giờ vào thứ ${day} bắt đầu lúc ${start}` }
    }
    seen.add(key)

    parsedSchedule.push({ day, start, end })
  }

  // Sắp theo day rồi start
  parsedSchedule.sort((a, b) => {
    if (a.day !== b.day) return a.day - b.day
    return a.start.localeCompare(b.start)
  })

  // 4. maxStudents: null hoặc int 1..500
  let maxStudents: number | null = null
  if (b.maxStudents !== null && b.maxStudents !== undefined) {
    if (
      typeof b.maxStudents !== 'number' ||
      !Number.isInteger(b.maxStudents) ||
      b.maxStudents < 1 ||
      b.maxStudents > 500
    ) {
      return { ok: false, error: 'Sĩ số tối đa (maxStudents) phải là số nguyên từ 1 đến 500 hoặc để trống (null)' }
    }
    maxStudents = b.maxStudents
  }

  return {
    ok: true,
    value: {
      classId: b.classId,
      publicListed: b.publicListed,
      schedule: parsedSchedule,
      maxStudents,
    },
  }
}

/**
 * totalActiveStudents: số học sinh khác nhau đang theo học (ACTIVE) ở mọi lớp chưa lưu trữ,
 * lấy từ RPC fn_public_active_student_total. Thiếu/không hợp lệ → cộng dồn theo lớp (dự phòng).
 */
export function mapIntroRows(rows: any[], totalActiveStudents?: unknown): IntroPayload {
  const rowList = Array.isArray(rows) ? rows : []

  const classes: IntroClassItem[] = rowList.map((row: any) => {
    const classId = String(row.class_id ?? row.classId ?? '')
    const name = String(row.name ?? '')
    const gradeBlock = String(row.grade_block ?? row.gradeBlock ?? '')
    const description = row.description !== undefined && row.description !== null ? String(row.description) : null
    const schedule = normalizeSchedule(row.schedule)

    const rawMax = row.max_students ?? row.maxStudents
    const maxStudents = typeof rawMax === 'number' && Number.isFinite(rawMax) ? rawMax : null

    const activeStudents = Math.max(0, Number(row.active_students ?? row.activeStudents ?? 0) || 0)
    const sessionsHeld = Math.max(0, Number(row.sessions_held ?? row.sessionsHeld ?? 0) || 0)

    const seatsLeft = maxStudents === null ? null : Math.max(0, maxStudents - activeStudents)

    return {
      classId,
      name,
      gradeBlock,
      description,
      schedule,
      maxStudents,
      activeStudents,
      sessionsHeld,
      seatsLeft,
    }
  })

  const totalNumber = Number(totalActiveStudents)
  const activeTotal = totalActiveStudents !== null && totalActiveStudents !== undefined && Number.isFinite(totalNumber)
    ? Math.max(0, Math.trunc(totalNumber))
    : classes.reduce((sum, c) => sum + c.activeStudents, 0)

  return {
    classes,
    totals: {
      classes: classes.length,
      activeStudents: activeTotal,
    },
  }
}
