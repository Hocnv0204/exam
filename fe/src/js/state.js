export const state = {
  user: JSON.parse(localStorage.getItem('edu_user') || 'null'),
  token: localStorage.getItem('edu_token') || null,
  refreshToken: localStorage.getItem('edu_refresh_token') || null,

  classes: [],
  curriculums: [],
  students: [],
  // Mốc thời gian prefetch state.students gần nhất (ms). View dùng để tái sử dụng
  // dữ liệu router vừa tải thay vì gọi lại API ngay sau đó.
  studentsFetchedAt: 0,
  homeworks: [],
  submissions: [],
  classChapters: [],
  classChaptersClassId: null,
  activeLessonHomeworks: []
  ,sessionVersion: 0
}

export function setSession(user, token, refreshToken = null) {
  state.sessionVersion++
  state.user = user
  state.token = token
  state.classes = []
  state.students = []
  state.studentsFetchedAt = 0
  state.classChapters = []
  state.classChaptersClassId = null
  state.activeLessonHomeworks = []
  if (refreshToken) {
    state.refreshToken = refreshToken
  }
  if (user && token) {
    localStorage.setItem('edu_user', JSON.stringify(user))
    localStorage.setItem('edu_token', token)
    if (refreshToken) {
      localStorage.setItem('edu_refresh_token', refreshToken)
    }
  } else {
    localStorage.removeItem('edu_user')
    localStorage.removeItem('edu_token')
    localStorage.removeItem('edu_refresh_token')
    state.refreshToken = null
  }
}

/**
 * Chỉ thay access/refresh token sau khi refresh im lặng (cùng user).
 * KHÔNG xoá cache classes/students như setSession — refresh token không đổi dữ liệu.
 */
export function updateTokens(token, refreshToken = null) {
  if (!token || !state.user) return
  state.token = token
  localStorage.setItem('edu_token', token)
  if (refreshToken) {
    state.refreshToken = refreshToken
    localStorage.setItem('edu_refresh_token', refreshToken)
  }
}

export function logout() {
  setSession(null, null)
  try {
    // Xóa cả backup mượn phiên (nếu có) để tab mới đăng nhập không bị banner cũ
    sessionStorage.removeItem('edu_admin_backup')
  } catch {}
  window.location.hash = '#login'
}
