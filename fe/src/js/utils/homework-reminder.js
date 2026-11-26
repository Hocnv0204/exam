/**
 * Tiện ích cho bộ lọc "Đến hạn hôm nay" và tạo tin nhắn nhắc học sinh chưa làm bài.
 */

/**
 * Tính khoảng thời gian từ đầu ngày (00:00:00.000) đến cuối ngày (23:59:59.999)
 * theo giờ máy người dùng và trả về cặp chuỗi ISO UTC.
 * @param {Date|string|number} [now=new Date()]
 * @returns {{ deadlineFrom: string, deadlineTo: string }}
 */
export function todayDeadlineRange(now = new Date()) {
  const parsed = now instanceof Date ? now : new Date(now)
  const base = Number.isNaN(parsed.getTime()) ? new Date() : parsed
  const y = base.getFullYear()
  const m = base.getMonth()
  const d = base.getDate()
  return {
    deadlineFrom: new Date(y, m, d, 0, 0, 0, 0).toISOString(),
    deadlineTo: new Date(y, m, d, 23, 59, 59, 999).toISOString()
  }
}

function formatDeadline(deadline) {
  if (deadline === undefined || deadline === null || deadline === '') return ''
  const d = deadline instanceof Date ? deadline : new Date(deadline)
  if (Number.isNaN(d.getTime())) return ''
  const pad = (n) => String(n).padStart(2, '0')
  return `${pad(d.getHours())}:${pad(d.getMinutes())} ${pad(d.getDate())}/${pad(d.getMonth() + 1)}/${d.getFullYear()}`
}

function cleanSingleLine(value) {
  if (value === undefined || value === null) return ''
  return String(value).replace(/\s+/g, ' ').trim()
}

function formatStudentName(student) {
  if (typeof student === 'string') return cleanSingleLine(student) || 'Học sinh'
  if (!student || typeof student !== 'object') return 'Học sinh'
  return (
    cleanSingleLine(student.fullName) ||
    cleanSingleLine(student.studentName) ||
    cleanSingleLine(student.username) ||
    'Học sinh'
  )
}

/**
 * Tạo tin nhắn văn bản thuần để giáo viên copy gửi Zalo/Messenger nhắc học sinh chưa làm bài.
 * Không escape HTML vì đích là tin nhắn plain text; vẫn loại ký tự xuống dòng trong tên.
 * @param {object} params
 * @param {string} [params.title]
 * @param {string|Date|null} [params.deadline]
 * @param {Array<object|string>} [params.students]
 * @param {number|string|null} [params.totalStudents]
 * @param {string} [params.url]
 * @returns {string}
 */
export function buildHomeworkReminderMessage({
  title = '',
  deadline = null,
  students = [],
  totalStudents = null,
  url = ''
} = {}) {
  const safeTitle = cleanSingleLine(title) || 'Bài tập'
  const deadlineStr = formatDeadline(deadline)
  const list = Array.isArray(students) ? students : []
  const n = list.length

  const parsedTotal = (typeof totalStudents === 'number' || (typeof totalStudents === 'string' && totalStudents.trim() !== ''))
    ? Number(totalStudents)
    : NaN
  const countText = Number.isFinite(parsedTotal) && parsedTotal > 0 ? `(${n}/${parsedTotal})` : `(${n})`

  const lines = [`📢 Nhắc làm bài: ${safeTitle}`]
  if (deadlineStr) {
    lines.push(`⏰ Hạn nộp: ${deadlineStr}`)
  }
  lines.push(`👥 Các bạn chưa làm ${countText}:`)
  list.forEach((student, index) => {
    lines.push(`${index + 1}. ${formatStudentName(student)}`)
  })
  lines.push(`👉 Làm bài tại: ${cleanSingleLine(url)}`)
  lines.push(deadlineStr ? 'Các bạn hoàn thành trước hạn nhé!' : 'Các bạn hoàn thành sớm nhé!')

  return lines.join('\n')
}
