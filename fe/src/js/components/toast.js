// Toast dùng chung. Chống lặp: cùng nội dung + cùng loại khi toast trước còn hiện → không thêm toast mới,
// chỉ gia hạn thời gian hiển thị (trước đây gọi 2 lần là hiện 2 toast giống hệt nhau).
// Nội dung hiển thị dạng text (không chèn HTML) để thông báo lỗi chứa ký tự <…> không bị diễn giải.
const TOAST_DURATION_MS = 3500
const TOAST_FADE_MS = 300
const MAX_TOASTS = 4
const ICONS = { success: 'fa-circle-check', error: 'fa-triangle-exclamation', warning: 'fa-circle-exclamation' }

function scheduleHide(toast, duration = TOAST_DURATION_MS) {
  clearTimeout(toast._hideTimer)
  clearTimeout(toast._removeTimer)
  toast.style.opacity = ''
  toast.style.transform = ''
  toast._hideTimer = setTimeout(() => {
    toast.style.opacity = '0'
    toast.style.transform = 'translateY(10px)'
    toast._removeTimer = setTimeout(() => toast.remove(), TOAST_FADE_MS)
  }, duration)
}

/**
 * @param {string} message
 * @param {'info'|'success'|'warning'|'error'} [type]
 * @param {{ duration?: number }} [options] duration (ms) cho thông báo dài cần đọc kỹ; mặc định 3,5 giây.
 */
export function showToast(message, type = 'info', options = {}) {
  const duration = Number.isFinite(options?.duration) && options.duration > 0 ? options.duration : TOAST_DURATION_MS
  const container = document.getElementById('toast-container')
  if (!container) return

  const text = String(message ?? '')
  const key = `${type}|${text}`
  const existing = [...container.children].find(el => el._toastKey === key && el.isConnected)
  if (existing) {
    scheduleHide(existing, duration)
    return
  }

  const toast = document.createElement('div')
  toast.className = `toast toast-${type}`
  toast._toastKey = key
  const icon = document.createElement('i')
  icon.className = `fa-solid ${ICONS[type] || 'fa-circle-info'}`
  const span = document.createElement('span')
  span.textContent = text
  toast.append(icon, span)
  container.appendChild(toast)

  while (container.children.length > MAX_TOASTS) container.firstElementChild?.remove()
  scheduleHide(toast, duration)
}
