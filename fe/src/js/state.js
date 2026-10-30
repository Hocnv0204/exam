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
  activeLessonHomeworks: []
}

export function setSession(user, token, refreshToken = null) {
  state.user = user
  state.token = token
  state.classes = []
  state.students = []
  state.studentsFetchedAt = 0
  state.classChapters = []
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

export function logout() {
  setSession(null, null)
  try {
    // Xóa cả backup mượn phiên (nếu có) để tab mới đăng nhập không bị banner cũ
    sessionStorage.removeItem('edu_admin_backup')
  } catch {}
  window.location.hash = '#login'
}
