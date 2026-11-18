// Nội dung toast báo kết quả đồng bộ Ngân hàng câu hỏi sau khi lưu bài tập (hàm thuần, test bằng Node).

/**
 * Báo kết quả auto-sync Ngân hàng câu hỏi Constant sau khi lưu bài tập thành công.
 * Tuyệt đối không báo "thành công" cho phần chưa đồng bộ hoặc đã lưu mà CHƯA gắn Bài
 * Constant (unattachedCount: không hiện khi lọc theo Chương/Bài); chỉ hiển thị cho Admin.
 * Toast hiển thị dạng text nên KHÔNG escape HTML ở đây (tránh hiện "&quot;").
 */
export function autoBankSyncToastMessage(summary) {
  if (!summary || !summary.enabled) return null

  const created = Number(summary.createdCount) || 0
  const unattached = Math.min(created, Number(summary.unattachedCount) || 0)
  const attached = created - unattached
  const skipped = Number(summary.skippedDuplicateCount) || 0
  const unsynced = Number(summary.unsyncedCount) || 0
  const failed = Number(summary.failedCount) || 0
  const notSynced = unsynced + failed
  const targetName = summary.target?.lessonTitle ? ` vào bài "${summary.target.lessonTitle}"` : ''
  const reasons = Array.isArray(summary.reasons) ? summary.reasons.map(r => String(r?.reason || '')).filter(Boolean) : []

  if (notSynced === 0 && unattached === 0) {
    if (created === 0 && skipped > 0) {
      return { type: 'info', text: `Ngân hàng câu hỏi: không có câu mới, bỏ qua ${skipped} câu đã có.` }
    }
    const parts = [`Ngân hàng câu hỏi: đã gắn ${attached} câu${targetName}`]
    if (skipped > 0) parts.push(`bỏ qua ${skipped} câu đã có`)
    return { type: 'success', text: `${parts.join(', ')}.` }
  }

  const parts = [`Ngân hàng câu hỏi: đã gắn ${attached} câu vào đúng bài`]
  if (unattached > 0) parts.push(`${unattached} câu đã lưu nhưng CHƯA gắn được bài (sẽ không hiện khi lọc theo Chương/Bài)`)
  if (notSynced > 0) parts.push(`${notSynced} câu CHƯA đồng bộ`)
  if (skipped > 0) parts.push(`bỏ qua ${skipped} câu đã có`)
  let text = `${parts.join(', ')}.`
  if (reasons.length > 0) {
    text += ` Lý do: ${reasons[0]}`
    if (reasons.length > 1) text += ` (và ${reasons.length - 1} lý do khác — kiểm tra lại thẻ [CHƯƠNG]/[BÀI HỌC] theo bảng tra cứu Constant)`
  }
  return { type: 'warning', text }
}
