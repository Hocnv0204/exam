/**
 * Nghiệp vụ nạp tiền (thuần: không DOM, không network) để unit-test bằng Node.
 * Xem fe/scripts/test-topup.mjs.
 *
 * NGUYÊN TẮC:
 * - Mọi thao tác ghi tiền đều phải đi qua API nạp (`create-student?action=add-balance`
 *   -> RPC `fn_add_student_balance`) để hệ thống tự gạch nợ học phí cũ và ghi sổ
 *   giao dịch. Module này KHÔNG gán số dư.
 * - Số dư sau khi nạp luôn lấy từ kết quả BE trả về (BE đã trừ nợ học phí cũ),
 *   chỉ fallback về `số dư hiện tại + số tiền nạp` khi BE không trả về số dư.
 */

/** Số tiền nạp tối thiểu hợp lệ (VND). */
export const TOPUP_MIN_AMOUNT = 1

/** Format số tiền theo kiểu Việt Nam. */
export function formatVnd(value) {
  const n = Number(value)
  return (Number.isFinite(n) ? n : 0).toLocaleString('vi-VN')
}

/**
 * Parse số tiền người dùng nhập (chấp nhận cả dấu phân cách nghìn).
 * Trả `null` nếu không hợp lệ (rỗng, không phải số, <= 0).
 */
export function parseTopupAmount(rawValue) {
  const raw = rawValue === null || rawValue === undefined ? '' : String(rawValue).trim()
  if (!raw) return null
  const amount = parseInt(raw.replace(/,/g, ''), 10)
  if (!Number.isFinite(amount) || amount < TOPUP_MIN_AMOUNT) return null
  return amount
}

/**
 * Số dư sau khi nạp.
 * Ưu tiên số dư do BE trả về (đã bao gồm việc gạch nợ học phí cũ),
 * fallback về `currentBalance + amount` khi BE không trả số dư.
 */
export function resolveTopupBalance(result, currentBalance, amount) {
  const raw = result?.balance
  if (raw !== undefined && raw !== null && raw !== '' && Number.isFinite(Number(raw))) {
    return Number(raw)
  }
  const base = Number(currentBalance)
  const current = Number.isFinite(base) ? base : 0
  return current + (Number(amount) || 0)
}

/** Nội dung thông báo thành công (kèm thông tin gạch nợ học phí nếu có). */
export function buildTopupSuccessMessage({ amount, balance, result } = {}) {
  let msg = `Nạp ${formatVnd(amount)}đ thành công! Số dư mới: ${formatVnd(balance)}đ`
  const paidCount = Number(result?.paid_sessions_count || 0)
  if (paidCount > 0) {
    msg += `\nĐã tự động trừ ${formatVnd(result?.total_deducted || 0)}đ để thanh toán cho ${paidCount} buổi học.`
  }
  return msg
}

/** Nội dung thông báo lỗi (luôn có nội dung để hiển thị cho người dùng). */
export function describeTopupError(err) {
  const raw = err?.message || (typeof err === 'string' ? err : '')
  return raw ? String(raw).trim() : 'Không xác định được lỗi khi nạp tiền.'
}

/**
 * Bộ chống gửi trùng cho thao tác nạp tiền.
 *
 * - `submit()` bị bỏ qua (skipped) nếu đang có 1 lần nạp chạy => chặn double-click.
 * - `onPendingChange(true/false)` để UI khoá nút gửi trong lúc đang nạp.
 * - `onSuccess` / `onError` nhận `(result|error, { studentId, amount })`.
 *
 * Không tự retry: nếu request đang chạy thì lần gọi sau bị bỏ qua, không gửi lại.
 */
export function createTopupSubmitter({ requestTopup, onPendingChange, onSuccess, onError } = {}) {
  let pending = false

  return {
    get pending() {
      return pending
    },

    async submit({ studentId, amount } = {}) {
      // Chống double-click: đang nạp thì bỏ qua, KHÔNG gửi request thứ 2.
      if (pending) return { skipped: true, ok: false }

      if (typeof requestTopup !== 'function') {
        const error = new Error('Thiếu hàm gọi API nạp tiền')
        onError?.(error, { studentId, amount })
        return { skipped: false, ok: false, error }
      }

      pending = true
      onPendingChange?.(true)

      try {
        const result = await requestTopup(studentId, amount)
        onSuccess?.(result, { studentId, amount })
        return { skipped: false, ok: true, result }
      } catch (error) {
        onError?.(error, { studentId, amount })
        return { skipped: false, ok: false, error }
      } finally {
        pending = false
        onPendingChange?.(false)
      }
    }
  }
}
