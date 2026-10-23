/**
 * Modal nạp tiền DÙNG CHUNG cho toàn hệ thống.
 *
 * Mục đích: một nơi duy nhất cho luồng "nạp tiền" (validate -> gọi API nạp ->
 * cập nhật state -> toast), dùng lại được ở:
 *   - Quản lý học sinh (student-mgmt.js)
 *   - Chi tiết lớp (class-details.js)
 *   - Popup "Học sinh có số dư 0 đ" của dashboard quản trị (admin-dashboard.js)
 *
 * Nguyên tắc nghiệp vụ:
 *   - LUÔN gọi API nạp (`api.addStudentBalance`) để BE tự gạch nợ học phí cũ.
 *     Không bao giờ gán số dư bằng API sửa học sinh.
 *   - Lỗi: hiển thị ngay trong modal + giữ modal mở để người dùng thử lại.
 *   - Double-click: nút xác nhận bị khoá trong lúc request đang chạy (không gửi trùng).
 *
 * Chống race (request cũ đụng modal mới):
 *   - Mỗi lần mở modal ghi lại THAM CHIẾU DOM của đúng modal đó (form, ô nhập,
 *     ô lỗi, ô trạng thái, nút xác nhận) và chỉ đụng vào chúng khi element còn
 *     thuộc đúng modal hiện tại (`isConnected` + so khớp `getElementById`).
 *     => Response của request cũ không sửa nhầm modal mới.
 *   - `pendingTopups` (key theo studentId) chặn mở/gửi nạp trùng cho cùng học sinh
 *     khi request trước chưa xong. KHÔNG tự retry thao tác ghi tiền.
 *   - Khi đang nạp, người dùng không đóng được modal bằng tay (nút Huỷ/X/nền ngoài)
 *     để tránh bỏ rơi rồi nạp lại (giao dịch tiền thật). Đóng bằng code
 *     (vd đổi route) vẫn được phép.
 *   - Dù modal đã đóng, kết quả nạp THÀNH CÔNG vẫn được áp dụng vào nghiệp vụ
 *     (state, danh sách, toast, thống kê số dư 0 đ).
 *
 * Lifecycle (tuỳ chọn, backwards compatible):
 *   - onSuccess(result, { amount, balance }) : nạp thành công
 *   - onCancel()                            : người dùng huỷ (nút Huỷ / nút X / bấm nền)
 *   - onClose(reason)                       : modal đã đóng ('cancel' | 'confirm' | 'close')
 */

import { openModal } from './modal.js'
import { showToast } from './toast.js'
import { api } from '../api.js'
import { state } from '../state.js'
import {
  parseTopupAmount,
  resolveTopupBalance,
  buildTopupSuccessMessage,
  describeTopupError,
  formatVnd,
  createTopupSubmitter
} from '../utils/topup.js'

export const TOPUP_FORM_ID = 'topup-modal-form'
export const TOPUP_AMOUNT_ID = 'topup-modal-amount'
export const TOPUP_ERROR_ID = 'topup-modal-error'
export const TOPUP_STATUS_ID = 'topup-modal-status'

/**
 * Các lần nạp đang chạy, key theo studentId.
 * Dùng chung cho mọi nơi gọi modal nạp (dashboard, quản lý học sinh, chi tiết lớp)
 * => không thể gửi 2 request nạp cho cùng 1 học sinh khi request trước chưa xong.
 */
const pendingTopups = new Map()

function escapeHtml(str) {
  if (str === null || str === undefined) return ''
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;')
}

/** Modal nạp tiền đang mở hay không (dùng để chặn mở chồng / dọn khi đổi route). */
export function isTopupModalOpen() {
  return Boolean(document.getElementById(TOPUP_FORM_ID))
}

/** HTML form nạp tiền (dùng chung cho mọi nơi gọi nạp tiền). */
export function renderTopupFormHTML(student = {}, { amountLabel = 'Số tiền cần nạp (VND)' } = {}) {
  const name = student.fullName || student.username || 'Học sinh'
  const balance = Number(student.balance || 0)

  return `
    <form id="${TOPUP_FORM_ID}" onsubmit="return false;" style="display:flex; flex-direction:column; gap:16px;">
      <div style="font-size:14px; color:#334155; margin-bottom:8px;">
        Học sinh: <strong style="color:#0f172a;">${escapeHtml(name)}</strong><br/>
        Số dư hiện tại: <strong style="color:#10b981; font-size:16px;">${balance.toLocaleString('vi-VN')} đ</strong>
      </div>

      <div>
        <label style="font-size:13px; font-weight:600; color:#334155; display:block; margin-bottom:6px;">
          ${escapeHtml(amountLabel)} <span style="color:#ef4444;">*</span>
        </label>
        <input
          type="text"
          id="${TOPUP_AMOUNT_ID}"
          class="form-input"
          placeholder="Ví dụ: 500,000"
          inputmode="numeric"
          autocomplete="off"
          required
          oninput="let v = this.value.replace(/[^0-9]/g, ''); this.value = v ? new Intl.NumberFormat('en-US').format(v) : ''"
        >
      </div>

      <div id="${TOPUP_STATUS_ID}" style="display:none; align-items:center; gap:8px; font-size:13px; font-weight:600; color:#0284c7;">
        <i class="fa-solid fa-spinner fa-spin"></i> <span>Đang nạp tiền, vui lòng chờ...</span>
      </div>

      <div id="${TOPUP_ERROR_ID}" style="display:none; font-size:13px; font-weight:600; color:#b91c1c; background:#fef2f2; border:1px solid #fecaca; border-radius:8px; padding:10px 12px;"></div>
    </form>
  `
}

/**
 * Mở modal nạp tiền.
 *
 * @param {object} options
 * @param {object} [options.student]        học sinh cần nạp ({ id, fullName, balance })
 * @param {string} [options.studentId]      id học sinh (dùng khi không truyền `student`)
 * @param {string} [options.title]          tiêu đề modal
 * @param {string} [options.confirmLabel]   nhãn nút xác nhận
 * @param {string} [options.cancelLabel]    nhãn nút huỷ
 * @param {string} [options.amountLabel]    nhãn ô nhập số tiền
 * @param {Function} [options.onSuccess]    (result, { amount, balance })
 * @param {Function} [options.onCancel]     () khi người dùng huỷ
 * @param {Function} [options.onClose]      (reason) khi modal đã đóng
 * @param {Function} [options.onBalanceApplied] (studentId, newBalance) cập nhật state riêng của caller
 * @param {boolean}  [options.demoFallback] cho phép fallback chế độ demo khi API lỗi (chỉ dùng cho luồng cũ)
 * @param {boolean}  [options.syncStudentList] gọi lại API danh sách học sinh sau khi nạp
 * @param {Function} [options.requestTopup] override hàm gọi API (dùng cho test)
 */
export function openTopupModal(options = {}) {
  const {
    student = null,
    studentId = null,
    title = 'Nạp Học Phí (Thêm Số Dư)',
    confirmLabel = 'Xác nhận',
    cancelLabel = 'Huỷ',
    amountLabel = 'Số tiền cần nạp (VND)',
    onSuccess = null,
    onCancel = null,
    onClose = null,
    onBalanceApplied = null,
    demoFallback = false,
    syncStudentList = true,
    requestTopup = null
  } = options

  const target = student || state.students.find(s => s.id === studentId) || null
  const targetId = target?.id || studentId

  if (!targetId) {
    showToast('Không tìm thấy thông tin học sinh!', 'error')
    return null
  }

  // Chống nạp trùng: học sinh này đang có request nạp chưa xong (vd request cũ
  // của modal trước còn bay, hoặc người dùng mở lại modal nạp cho cùng HS).
  if (pendingTopups.has(targetId)) {
    showToast('Học sinh này đang có yêu cầu nạp tiền chưa hoàn tất. Vui lòng chờ trước khi nạp tiếp!', 'error')
    return null
  }

  // ---- Tham chiếu DOM của ĐÚNG modal này ----------------------------------
  // Gán sau khi openModal() render xong. Mọi thao tác DOM về sau đều đi qua
  // `owns()` để KHÔNG đụng vào modal khác (vd modal mới đã mở thay modal cũ).
  let formEl = null
  let amountEl = null
  let errorEl = null
  let statusEl = null
  let confirmBtn = null

  /** Element còn thuộc đúng modal này? (đã bị thay/tháo => false) */
  const owns = (el) => Boolean(el && el.isConnected && el.id && document.getElementById(el.id) === el)

  // ---- Helpers DOM trong modal -------------------------------------------
  const setStatus = (message) => {
    if (!owns(statusEl)) return
    if (message) {
      statusEl.style.display = 'flex'
      const span = statusEl.querySelector('span')
      if (span) span.textContent = message
    } else {
      statusEl.style.display = 'none'
    }
  }

  const setError = (message) => {
    if (!owns(errorEl)) return
    if (message) {
      errorEl.style.display = 'block'
      errorEl.textContent = message
    } else {
      errorEl.style.display = 'none'
      errorEl.textContent = ''
    }
  }

  const setConfirmDisabled = (disabled) => {
    if (!owns(confirmBtn)) return
    confirmBtn.disabled = Boolean(disabled)
  }

  // ---- Cập nhật số dư trong state ---------------------------------------
  const applyLocalBalance = (newBalance) => {
    const inState = state.students.find(s => s.id === targetId)
    if (inState) inState.balance = newBalance
    if (target && target.id === targetId && target !== inState) target.balance = newBalance
    try {
      onBalanceApplied?.(targetId, newBalance)
    } catch (err) {
      console.warn('[topup] onBalanceApplied lỗi:', err)
    }
  }

  const refreshStudentList = async () => {
    if (!syncStudentList) return
    try {
      const updatedStudents = await api.getStudents({}, { silent: true })
      if (Array.isArray(updatedStudents)) {
        state.students = updatedStudents
      }
    } catch (err) {
      console.warn('Lỗi khi cập nhật lại danh sách học sinh:', err)
    }
  }

  const refreshOtherViews = (newBalance) => {
    try {
      if (window._refreshStudentMgmtTable) {
        window._refreshStudentMgmtTable(false)
      } else {
        document.getElementById('student-search-input')?.dispatchEvent(new Event('input'))
      }
    } catch (err) {
      console.warn('[topup] Không refresh được bảng học sinh:', err)
    }
    try {
      window._refreshClassDetailsTab?.(targetId, newBalance)
    } catch (err) {
      console.warn('[topup] Không refresh được tab chi tiết lớp:', err)
    }
  }

  const submitter = createTopupSubmitter({
    requestTopup: requestTopup || ((id, amount) => api.addStudentBalance(id, amount)),

    onPendingChange: (isPending) => {
      // Đăng ký / gỡ "đang nạp" (key theo học sinh) => chặn nạp trùng.
      if (isPending) {
        pendingTopups.set(targetId, { startedAt: Date.now() })
      } else {
        pendingTopups.delete(targetId)
      }
      setConfirmDisabled(isPending)
      setStatus(isPending ? 'Đang nạp tiền, vui lòng chờ...' : '')
    },

    onSuccess: async (result, { amount }) => {
      const newBalance = resolveTopupBalance(result, target?.balance ?? 0, amount)
      await refreshStudentList()
      applyLocalBalance(newBalance)
      refreshOtherViews(newBalance)
      showToast(buildTopupSuccessMessage({ amount, balance: newBalance, result }), 'success')
      // Nạp tiền làm thay đổi số học sinh có số dư 0 đ
      window._invalidateZeroBalanceStats?.()
      onSuccess?.(result, { amount, balance: newBalance })
    },

    onError: (err, { amount }) => {
      if (!demoFallback) return
      // Chế độ demo (chỉ dùng cho luồng cũ khi API không hoạt động):
      // cập nhật số dư cục bộ, KHÔNG ghi sổ và KHÔNG gọi lại API.
      const newBalance = (Number(target?.balance) || 0) + (Number(amount) || 0)
      applyLocalBalance(newBalance)
      refreshOtherViews(newBalance)
      showToast(`Nạp ${formatVnd(amount)}đ thành công! (Chế độ Demo)`, 'success')
    }
  })

  const confirmHandler = async () => {
    // Đọc số tiền từ ĐÚNG modal này. Nếu modal đã bị thay (mở modal khác)
    // thì huỷ thao tác, KHÔNG đọc nhầm giá trị của modal mới.
    if (!owns(formEl) || !owns(amountEl)) return false

    const amount = parseTopupAmount(amountEl.value)

    if (amount === null) {
      showToast('Vui lòng nhập số tiền hợp lệ lớn hơn 0!', 'error')
      setError('Số tiền không hợp lệ. Vui lòng nhập một số lớn hơn 0.')
      return false
    }

    setError('')

    const outcome = await submitter.submit({ studentId: targetId, amount })

    // Bị bỏ qua vì đang nạp (double-click) -> giữ modal mở, không gửi thêm request.
    if (outcome.skipped) return false

    if (!outcome.ok) {
      if (demoFallback) return true // đã xử lý ở onError (chế độ demo)
      const message = describeTopupError(outcome.error)
      setError(`Nạp tiền thất bại: ${message}. Bạn có thể thử lại.`)
      showToast(`Nạp tiền thất bại: ${message}`, 'error')
      return false // giữ modal mở để thử lại
    }

    return true
  }

  openModal(title, renderTopupFormHTML(target || {}, { amountLabel }), confirmHandler, {
    cancelLabel,
    confirmLabel,
    onCancel: onCancel || null,
    onClose: onClose || null,
    // Chặn người dùng đóng modal khi request nạp đang chạy (tránh bỏ rơi rồi
    // nạp lại => giao dịch tiền thật bị nhân đôi). Đóng bằng code (đổi route)
    // vẫn được phép vì không đi qua hook này.
    beforeClose: (reason) => {
      if (reason !== 'cancel') return true
      if (!submitter.pending) return true
      showToast('Đang nạp tiền, vui lòng chờ hoàn tất để tránh nạp trùng!', 'error')
      return false
    }
  })

  // Ghi lại tham chiếu DOM của modal vừa mở (để không đụng modal khác về sau)
  formEl = document.getElementById(TOPUP_FORM_ID)
  amountEl = document.getElementById(TOPUP_AMOUNT_ID)
  errorEl = document.getElementById(TOPUP_ERROR_ID)
  statusEl = document.getElementById(TOPUP_STATUS_ID)
  confirmBtn = document.getElementById('modal-confirm-btn')

  return { studentId: targetId, submitter }
}
