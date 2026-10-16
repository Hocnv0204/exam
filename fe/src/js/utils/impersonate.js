import { state, setSession } from '../state.js'
import { api } from '../api.js'
import { showToast } from '../components/toast.js'

const BACKUP_KEY = 'edu_admin_backup'

export function isImpersonating() {
  try {
    const backup = JSON.parse(sessionStorage.getItem(BACKUP_KEY) || 'null')
    // Đang mượn phiên khi và chỉ khi: có backup của ADMIN khác user hiện tại,
    // và user hiện tại là STUDENT (tránh backup sót hiển thị sai cho admin/student thật)
    return !!(
      backup?.user?.id &&
      backup.user.role === 'ADMIN' &&
      state.user?.id &&
      state.user.id !== backup.user.id &&
      state.user.role === 'STUDENT'
    )
  } catch {
    return false
  }
}

export function getImpersonatedStudentName() {
  try {
    return state.user?.fullName || state.user?.username || 'học sinh'
  } catch {
    return 'học sinh'
  }
}

/** Admin mượn phiên học sinh để xem/test đúng như tài khoản thật. */
export async function startImpersonation(studentId, studentName) {
  if (state.user?.role !== 'ADMIN') {
    showToast('Chỉ quản trị viên mới dùng được chức năng này!', 'error')
    return false
  }
  if (!studentId) {
    showToast('Không tìm thấy thông tin học sinh!', 'error')
    return false
  }
  try {
    showToast('Đang mở phiên học sinh...', 'info')
    const data = await api.impersonateStudent(studentId)
    if (!data?.accessToken || !data?.user) {
      throw new Error('Không nhận được phiên học sinh')
    }
    if (data.user.role !== 'STUDENT') {
      throw new Error(`Tài khoản ${data.user.username || ''} không phải học sinh (role=${data.user.role})!`)
    }
    try {
      sessionStorage.setItem(BACKUP_KEY, JSON.stringify({
        user: state.user,
        token: state.token,
        refreshToken: state.refreshToken || null,
      }))
    } catch {
      showToast('Trình duyệt chặn lưu phiên admin, không thể tiếp tục!', 'error')
      return false
    }
    setSession(data.user, data.accessToken, data.refreshToken || null)
    showToast(`Đang xem với tư cách ${data.user.fullName || data.user.username}`, 'success')
    window.location.hash = '#my-classes'
    return true
  } catch (err) {
    showToast(`Mượn phiên thất bại: ${err.message}`, 'error')
    return false
  }
}

/** Thoát chế độ xem như học sinh, quay lại phiên admin (không đăng xuất). */
export function stopImpersonation() {
  let backup = null
  try {
    backup = JSON.parse(sessionStorage.getItem(BACKUP_KEY) || 'null')
  } catch {
    backup = null
  }
  if (!backup?.token || !backup?.user) {
    showToast('Không tìm thấy phiên admin để quay lại!', 'error')
    return false
  }
  // Backup sót (user hiện tại chính là admin trong backup): chỉ xóa backup, không restore
  if (state.user?.id && backup.user?.id && state.user.id === backup.user.id) {
    try {
      sessionStorage.removeItem(BACKUP_KEY)
    } catch {}
    showToast('Đã dọn trạng thái xem thử cũ!', 'info')
    window.location.hash = '#admin-dashboard'
    return true
  }
  try {
    sessionStorage.removeItem(BACKUP_KEY)
  } catch {}
  setSession(backup.user, backup.token, backup.refreshToken || null)
  showToast('Đã quay lại tài khoản quản trị!', 'success')
  window.location.hash = '#admin-dashboard'
  return true
}

window.stopImpersonation = stopImpersonation
