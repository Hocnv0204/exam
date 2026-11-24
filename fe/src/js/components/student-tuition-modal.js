import { openModal } from './modal.js'
import { renderMascot } from './mascot.js'
import { isMochiUI } from '../ui-flag.js'
import { studentBalanceIsZero } from '../utils/student-dashboard.js'

export const TUITION_POPUP_PENDING_KEY = 'edu_student_tuition_popup_pending_user'

let pendingUserId = null

function readPendingFromStorage() {
  try {
    return typeof sessionStorage !== 'undefined' ? sessionStorage.getItem(TUITION_POPUP_PENDING_KEY) : null
  } catch (_) {
    return null
  }
}

export function markStudentTuitionPopupPending(userId) {
  if (!userId) return
  const normalized = String(userId)
  pendingUserId = normalized
  try {
    if (typeof sessionStorage !== 'undefined') {
      sessionStorage.setItem(TUITION_POPUP_PENDING_KEY, normalized)
    }
  } catch (_) {}
}

export function clearStudentTuitionPopupPending() {
  pendingUserId = null
  try {
    if (typeof sessionStorage !== 'undefined') {
      sessionStorage.removeItem(TUITION_POPUP_PENDING_KEY)
    }
  } catch (_) {}
}

export function isStudentTuitionPopupPending(userId) {
  if (!userId) return false
  const normalized = String(userId)
  return pendingUserId === normalized || readPendingFromStorage() === normalized
}

export function buildStudentTuitionModalHtml(mochi = isMochiUI()) {
  if (mochi) {
    return `
      <div class="m-tuition-modal" role="status" aria-live="polite">
        <div class="m-tuition-modal-icon" aria-hidden="true">
          ${renderMascot({ mood: 'wink', size: 104 })}
        </div>
        <h3 class="m-tuition-modal-title">Đến hạn đóng học phí</h3>
        <p class="m-tuition-modal-text">Bạn đã đến hạn đóng học phí. Vui lòng liên hệ giáo viên để đóng học phí.</p>
      </div>
    `
  }

  return `
    <div class="student-tuition-modal-body" role="status" aria-live="polite">
      <div class="student-tuition-modal-icon" aria-hidden="true">
        ${renderMascot({ mood: 'wink', size: 96 })}
      </div>
      <h3 class="student-tuition-modal-title">Đến hạn đóng học phí</h3>
      <p class="student-tuition-modal-text">Bạn đã đến hạn đóng học phí. Vui lòng liên hệ giáo viên để đóng học phí.</p>
    </div>
  `
}

export function showStudentTuitionModal(openModalFn = openModal) {
  openModalFn(
    'Thông báo đóng học phí',
    buildStudentTuitionModalHtml(isMochiUI()),
    null,
    {
      cancelLabel: 'Đóng',
      showCancel: true,
      contentClass: 'student-tuition-modal',
      contentStyle: 'max-width:460px;'
    }
  )
}

export function maybeShowStudentTuitionPopup({
  userId,
  role,
  accountBalance,
  route = '',
  openModalFn = openModal
} = {}) {
  if (role !== 'STUDENT' || !userId || !isStudentTuitionPopupPending(userId)) {
    return false
  }

  // Không làm phiền khi đang làm bài trong phòng thi hoặc khi chưa có dữ liệu số dư từ backend.
  if (route === 'exam-room' || route === 'login' || accountBalance === undefined) {
    return false
  }

  if (!studentBalanceIsZero(accountBalance)) {
    clearStudentTuitionPopupPending()
    return false
  }

  clearStudentTuitionPopupPending()
  showStudentTuitionModal(openModalFn)
  return true
}
