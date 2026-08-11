export const state = {
  user: JSON.parse(localStorage.getItem('edu_user') || 'null'),
  token: localStorage.getItem('edu_token') || null,
  refreshToken: localStorage.getItem('edu_refresh_token') || null,

  classes: [],
  curriculums: [],
  students: [],
  homeworks: [],
  submissions: []
}

export function setSession(user, token, refreshToken = null) {
  state.user = user
  state.token = token
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
  window.location.hash = '#login'
}
