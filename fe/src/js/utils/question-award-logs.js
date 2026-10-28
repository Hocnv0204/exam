/**
 * question-award-logs.js — Helper hiển thị nhật ký cộng điểm theo câu
 * (question_award_logs) ở assignment review và danh sách bài nộp admin.
 *
 * Mọi giá trị người dùng (tên admin, tiêu đề phần...) đều được escape trước
 * khi chèn vào template HTML. Hàm rỗng/không hợp lệ trả '' hoặc null để view
 * KHÔNG render gì (không có ô log thừa khi chưa từng cộng điểm).
 *
 * Không import gì để test node import trực tiếp file này.
 */

/** Escape text người dùng trước khi chèn vào HTML (pattern dùng chung view). */
export function escapeAwardLogHtml(value) {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')
}

/** Định dạng delta đã cộng: 0.5 -> '+0.5đ'; giá trị không hợp lệ / <= 0 -> null. */
export function formatAwardDelta(delta) {
  const n = Number(delta)
  if (!Number.isFinite(n) || n <= 0) return null
  return `+${Number(n.toFixed(2))}đ`
}

/** Định dạng thời gian log theo locale vi-VN; thiếu/không hợp lệ -> null. */
export function formatAwardTime(iso) {
  if (!iso) return null
  const d = new Date(iso)
  if (!Number.isFinite(d.getTime())) return null
  return d.toLocaleString('vi-VN')
}

/**
 * Một dòng log đã escape: 'Cộng điểm câu 2: +0.5đ · admin · 28/10/2026 10:00:00'.
 * Log thiếu delta hợp lệ -> null (không render).
 */
export function describeAwardLog(log) {
  if (!log || typeof log !== 'object') return null
  const delta = formatAwardDelta(log.delta)
  if (!delta) return null
  const qNum = Number(log.questionNumber)
  const qLabel = Number.isInteger(qNum) && qNum > 0
    ? `câu ${qNum}`
    : (log.partTitle ? `phần ${escapeAwardLogHtml(log.partTitle)}` : 'một câu')
  const actor = log.actorName ? escapeAwardLogHtml(log.actorName) : 'admin'
  const time = formatAwardTime(log.createdAt)
  return `Cộng điểm ${qLabel}: ${delta} · ${actor}${time ? ` · ${time}` : ''}`
}

/**
 * Tổng hợp cho badge danh sách: { count, totalDelta, lastAt } hoặc null khi
 * không có dòng log hợp lệ nào (view không render badge).
 */
export function summarizeAwardLogs(logs) {
  if (!Array.isArray(logs)) return null
  let count = 0
  let totalDelta = 0
  let lastAtMs = null
  for (const log of logs) {
    const n = Number(log?.delta)
    if (!Number.isFinite(n) || n <= 0) continue
    count += 1
    totalDelta += n
    const t = log?.createdAt ? new Date(log.createdAt).getTime() : NaN
    if (Number.isFinite(t) && (lastAtMs === null || t > lastAtMs)) lastAtMs = t
  }
  if (count === 0) return null
  return {
    count,
    totalDelta: Math.round(totalDelta * 100) / 100,
    lastAt: lastAtMs === null ? null : new Date(lastAtMs).toISOString()
  }
}

/** HTML các dòng log (đã escape); không có dòng hợp lệ -> ''. */
export function buildAwardLogEntriesHtml(logs) {
  if (!Array.isArray(logs)) return ''
  return logs
    .map(describeAwardLog)
    .filter(Boolean)
    .map(text => `<div style="font-size:12px; color:#92400e; background:#fef3c7; border:1px solid #fde68a; border-radius:6px; padding:4px 10px; align-self:flex-start;">${text}</div>`)
    .join('')
}

/**
 * Khối nhật ký cho assignment review (gần summary/questions).
 * Không có log -> '' (không render ô rỗng).
 */
export function buildAwardLogSectionHtml(logs) {
  const entriesHtml = buildAwardLogEntriesHtml(logs)
  if (!entriesHtml) return ''
  return `
    <div class="question-award-logs-section" style="background:#fffbeb; border:1px dashed #f59e0b; border-radius:10px; padding:12px 16px; margin-bottom:24px;">
      <div style="font-size:12px; font-weight:800; color:#b45309; text-transform:uppercase; letter-spacing:0.4px; margin-bottom:8px; display:flex; align-items:center; gap:6px;">
        <i class="fa-solid fa-star"></i> Nhật ký cộng điểm theo câu
      </div>
      <div class="question-award-log-items" style="display:flex; flex-direction:column; gap:4px;">${entriesHtml}</div>
    </div>`
}

/**
 * Badge cho một hàng submission trong danh sách admin: có cộng điểm, tổng cộng,
 * thời gian; nhiều lần cộng thì kèm nút expand (class .award-logs-toggle-btn +
 * data-award-target trỏ tới id khối chi tiết, view tự bind sự kiện).
 * Không có log -> ''.
 */
export function buildAwardLogBadgeHtml(logs, options = {}) {
  const summary = summarizeAwardLogs(logs)
  if (!summary) return ''
  const entryTexts = (Array.isArray(logs) ? logs : []).map(describeAwardLog).filter(Boolean)
  if (entryTexts.length === 0) return ''
  const timeText = formatAwardTime(summary.lastAt)
  const badgeStyle = 'font-size:10px; font-weight:700; color:#b45309; background:#fffbeb; border:1px solid #fde68a; border-radius:6px; padding:2px 7px; display:inline-flex; align-items:center; gap:4px; margin-top:3px;'
  if (summary.count === 1) {
    // Một lần cộng: hiện thẳng dòng mô tả đầy đủ, không cần expand.
    return `<div style="${badgeStyle}; max-width:100%;"><i class="fa-solid fa-star"></i> ${entryTexts[entryTexts.length - 1]}</div>`
  }
  const entriesHtml = entryTexts
    .map(text => `<div style="font-size:12px; color:#92400e; background:#fef3c7; border:1px solid #fde68a; border-radius:6px; padding:4px 10px;">${text}</div>`)
    .join('')
  const deltaText = formatAwardDelta(summary.totalDelta)
  const rawTarget = String(options.targetId || '')
  const targetId = `award-logs-${escapeAwardLogHtml(/^[0-9a-f-]{36}$/i.test(rawTarget) ? rawTarget : Math.random().toString(36).slice(2))}`
  return `
    <div style="${badgeStyle} flex-wrap:wrap;">
      <i class="fa-solid fa-star"></i> Cộng điểm câu: ${deltaText} (${summary.count} lần)${timeText ? ` · ${timeText}` : ''}
      <button type="button" class="btn-secondary award-logs-toggle-btn" data-award-target="${targetId}" style="padding:1px 6px; font-size:10px; font-weight:700; cursor:pointer; color:#b45309; border-color:#fde68a; background:#ffffff; border-radius:4px; width:auto;">Xem</button>
    </div>
    <div id="${targetId}" style="display:none; flex-direction:column; gap:4px; margin-top:4px; padding:6px 8px; background:#fffbeb; border:1px dashed #fde68a; border-radius:6px;">${entriesHtml}</div>`
}
