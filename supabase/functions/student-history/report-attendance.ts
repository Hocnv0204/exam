/**
 * Mục "Điểm danh" của báo cáo tiến độ (scope=report | shared-report).
 * Dữ liệu lấy từ RPC fn_student_attendance — cùng nguồn với tab Điểm danh của học sinh —
 * nên số buổi lớp học / có mặt / vắng khớp tuyệt đối giữa hai màn hình.
 * Logic thuần (không import Deno) để test bằng Node.
 */

export type ReportAttendanceSession = {
  sessionId?: string
  date: string
  status: 'PRESENT' | 'ABSENT' | 'NOT_COUNTED'
}

export type ReportAttendance = {
  summary: {
    classSessions: number
    countedSessions: number
    present: number
    absent: number
    notCounted: number
    attendanceRate: number | null
  }
  sessions: ReportAttendanceSession[]
}

const STATUSES = new Set(['PRESENT', 'ABSENT', 'NOT_COUNTED'])

function int(value: unknown): number {
  const n = Number(value)
  return Number.isFinite(n) ? Math.max(0, Math.trunc(n)) : 0
}

function rate(value: unknown): number | null {
  if (value === null || value === undefined || value === '') return null
  const n = Number(value)
  return Number.isFinite(n) ? n : null
}

/**
 * Chuẩn hoá output RPC. `isPublic` = link chia sẻ công khai: bỏ sessionId (id nội bộ),
 * giống cách payload SHARED_REPORT bỏ mọi id khác.
 * Chỉ giữ buổi học của lớp và trạng thái tham gia của học sinh (bỏ note, sĩ số/tỉ lệ lớp).
 */
export function toReportAttendance(raw: any, isPublic: boolean): ReportAttendance | null {
  if (!raw || typeof raw !== 'object') return null
  const s = raw.summary || {}
  const sessions = (Array.isArray(raw.sessions) ? raw.sessions : [])
    .filter((x: any) => x && typeof x.date === 'string')
    .map((x: any) => {
      const item: ReportAttendanceSession = {
        date: x.date,
        status: STATUSES.has(x.status) ? x.status : 'NOT_COUNTED',
      }
      if (!isPublic && x.sessionId) item.sessionId = String(x.sessionId)
      return item
    })
  return {
    summary: {
      classSessions: int(s.classSessions),
      countedSessions: int(s.countedSessions),
      present: int(s.present),
      absent: int(s.absent),
      notCounted: int(s.notCounted),
      attendanceRate: rate(s.attendanceRate),
    },
    sessions,
  }
}

/**
 * Gọi RPC bằng service role. Báo cáo không có lớp cụ thể -> null (UI ẩn mục).
 * Lỗi RPC không làm hỏng cả báo cáo: trả `{ error }` để UI báo riêng mục điểm danh.
 */
export async function loadReportAttendance(
  client: any,
  params: { studentId: string | null; classId: string | null; fromDate: string; toDate: string; isPublic: boolean }
): Promise<ReportAttendance | { error: string } | null> {
  if (!params.studentId || !params.classId) return null
  const { data, error } = await client.rpc('fn_student_attendance', {
    p_student_id: params.studentId,
    p_class_id: params.classId,
    p_from: params.fromDate,
    p_to: params.toDate,
  })
  if (error) {
    console.error('[student-history] report attendance rpc error:', error.message)
    return { error: 'Không tải được dữ liệu điểm danh.' }
  }
  return toReportAttendance(data, params.isPublic)
}
