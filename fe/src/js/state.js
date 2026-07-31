export const state = {
  user: JSON.parse(localStorage.getItem('edu_user') || 'null'),
  token: localStorage.getItem('edu_token') || null,

  classes: [],
  curriculums: [],
  students: [],
  homeworks: [],
  submissions: []
}

export function setSession(user, token) {
  state.user = user
  state.token = token
  if (user && token) {
    localStorage.setItem('edu_user', JSON.stringify(user))
    localStorage.setItem('edu_token', token)
  } else {
    localStorage.removeItem('edu_user')
    localStorage.removeItem('edu_token')
  }
}

export function logout() {
  setSession(null, null)
  window.location.hash = '#login'
}
