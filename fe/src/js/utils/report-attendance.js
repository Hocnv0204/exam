// Mục "Điểm danh" trong báo cáo tiến độ học sinh (trang admin + link chia sẻ + giao diện Mochi).
// Dữ liệu: `attendance` do student-history (scope=report|shared-report) trả về, cùng nguồn
// fn_student_attendance với tab Điểm danh của học sinh. Hàm thuần (không DOM) để test bằng Node.

const STATUS = {
  PRESENT: { label: 'Có mặt', icon: 'fa-check', cls: 'is-present' },
  ABSENT: { label: 'Vắng', icon: 'fa-xmark', cls: 'is-absent' },
  NOT_COUNTED: { label: 'Không tính', icon: 'fa-minus', cls: 'is-not-counted' }
}

const WEEKDAYS = ['CN', 'T2', 'T3', 'T4', 'T5', 'T6', 'T7']

function esc(value) {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')
}

function num(value) {
  const n = Number(value)
  return Number.isFinite(n) ? n : 0
}

function rateText(value) {
  if (value === null || value === undefined || value === '' || !Number.isFinite(Number(value))) return '—'
  return `${Number(value).toLocaleString('vi-VN', { maximumFractionDigits: 1 })}%`
}

/** "2026-11-15" -> "T7, 15/11/2026" (ngày lịch, không lệch múi giờ). */
export function formatSessionDate(iso) {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(iso || ''))
  if (!m) return esc(iso || '—')
  const weekday = WEEKDAYS[new Date(Date.UTC(+m[1], +m[2] - 1, +m[3])).getUTCDay()]
  return `${weekday}, ${m[3]}/${m[2]}/${m[1]}`
}

/** Báo cáo không có lớp cụ thể -> backend trả null/không có trường: ẩn cả mục. */
export function hasReportAttendance(attendance) {
  return !!attendance && typeof attendance === 'object'
}

/** Nội dung mục (không gồm tiêu đề/khung) — mỗi giao diện tự bọc theo phong cách riêng. */
export function renderReportAttendanceBody(attendance) {
  if (attendance?.error) {
    return `<p class="report-att-empty report-att-error"><i class="fa-solid fa-triangle-exclamation" aria-hidden="true"></i> ${esc(attendance.error)}</p>`
  }
  const s = attendance?.summary || {}
  const sessions = Array.isArray(attendance?.sessions) ? attendance.sessions : []
  if (sessions.length === 0) {
    return '<p class="report-att-empty">Lớp chưa có buổi học nào được điểm danh trong kỳ báo cáo.</p>'
  }

  const stats = [
    { label: 'Lớp đã học', value: `${num(s.classSessions)} buổi`, cls: '' },
    { label: 'Có mặt', value: `${num(s.present)} buổi`, cls: 'is-present' },
    { label: 'Vắng', value: `${num(s.absent)} buổi`, cls: num(s.absent) > 0 ? 'is-absent' : '' },
    { label: 'Chuyên cần', value: rateText(s.attendanceRate), cls: '', note: `TB lớp ${rateText(s.classAverageRate)}` }
  ]
  const notCounted = num(s.notCounted)

  const rows = sessions.map(item => {
    const meta = STATUS[item?.status] || STATUS.NOT_COUNTED
    const total = num(item?.classTotal)
    const classLine = total > 0 ? `Lớp có mặt ${num(item?.classPresent)}/${total}` : 'Chưa có dữ liệu sĩ số'
    return `
      <li class="report-att-row ${meta.cls}">
        <div class="report-att-when">
          <strong>${formatSessionDate(item?.date)}</strong>
          ${item?.note ? `<span class="report-att-note">${esc(item.note)}</span>` : ''}
        </div>
        <span class="report-att-class">${classLine}</span>
        <span class="report-att-badge ${meta.cls}"><i class="fa-solid ${meta.icon}" aria-hidden="true"></i> ${meta.label}</span>
      </li>`
  }).join('')

  return `
    <div class="report-att-stats">
      ${stats.map(st => `
        <div class="report-att-stat ${st.cls}">
          <span class="report-att-stat-label">${st.label}</span>
          <strong class="report-att-stat-value">${st.value}</strong>
          ${st.note ? `<small class="report-att-stat-note">${st.note}</small>` : ''}
        </div>`).join('')}
    </div>
    ${notCounted > 0 ? `<p class="report-att-hint"><i class="fa-solid fa-circle-info" aria-hidden="true"></i> ${notCounted} buổi không tính (học sinh chưa được điểm danh hoặc đang tạm khoá).</p>` : ''}
    <ul class="report-att-list" aria-label="Các buổi học trong kỳ">${rows}
    </ul>`
}

/** Tiêu đề phụ: "3 buổi · vắng 1". */
export function reportAttendanceSubtitle(attendance) {
  if (!attendance || attendance.error) return ''
  const s = attendance.summary || {}
  const total = num(s.classSessions)
  if (!total) return ''
  const absent = num(s.absent)
  return `${total} buổi${absent ? ` · vắng ${absent}` : ''}`
}
