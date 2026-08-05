import { state, logout } from './state.js'

// Supabase URL from Vite environment variables (falls back to local dev URL)
export const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL || 'http://127.0.0.1:54321'

const SUPABASE_FUNCTIONS_URL = `${SUPABASE_URL}/functions/v1`

let activeRequests = 0
let loadingOverlay = null

function showLoading() {
  activeRequests++
  if (activeRequests === 1) {
    if (!loadingOverlay) {
      loadingOverlay = document.createElement('div')
      loadingOverlay.className = 'loading-overlay'
      loadingOverlay.innerHTML = `
        <div class="spinner-ring">
          <div></div><div></div><div></div><div></div>
        </div>
        <div class="loading-text">Đang tải dữ liệu...</div>
      `
      document.body.appendChild(loadingOverlay)
    }
    // Force reflow
    loadingOverlay.getBoundingClientRect()
    loadingOverlay.classList.add('active')
  }
}

function hideLoading() {
  activeRequests = Math.max(0, activeRequests - 1)
  if (activeRequests === 0 && loadingOverlay) {
    loadingOverlay.classList.remove('active')
  }
}

async function request(endpoint, options = {}) {
  const headers = {
    'Content-Type': 'application/json',
    ...(options.headers || {})
  }

  if (state.token) {
    headers['Authorization'] = `Bearer ${state.token}`
  }

  showLoading()
  try {
    const response = await fetch(`${SUPABASE_FUNCTIONS_URL}/${endpoint}`, {
      ...options,
      headers
    })

    if (response.status === 401) {
      logout()
      throw new Error('Phiên làm việc đã hết hạn. Vui lòng đăng nhập lại.')
    }

    const result = await response.json()
    if (!response.ok || result.success === false) {
      throw new Error(result.error || `HTTP ${response.status}`)
    }

    return result.data
  } catch (err) {
    console.warn(`[API] Edge Function call ${endpoint} failed, falling back to local state mode:`, err.message)
    throw err
  } finally {
    hideLoading()
  }
}

export const api = {
  login: (username, password) => request('login', { method: 'POST', body: JSON.stringify({ username, password }) }),
  createStudent: (data) => request('create-student', { method: 'POST', body: JSON.stringify(data) }),
  updateStudent: (data) => request('create-student', { method: 'PUT', body: JSON.stringify(data) }),
  resetPassword: (data) => request('reset-password', { method: 'POST', body: JSON.stringify(data) }),
  createClass: (data) => request('create-class', { method: 'POST', body: JSON.stringify(data) }),
  updateClass: (data) => request('create-class?action=update', { method: 'PUT', body: JSON.stringify(data) }),
  getClasses: () => request('create-class', { method: 'GET' }),
  deleteClass: (classId) => request(`create-class?classId=${classId}`, { method: 'DELETE' }),
  getClassSessions: (classId, month) => request(`create-class?action=get-sessions&classId=${classId}&month=${month}`, { method: 'GET' }),
  setClassSessions: (classId, sessionDates, month) => request('create-class?action=set-sessions', { method: 'POST', body: JSON.stringify({ classId, sessionDates, month }) }),
  getStudentSessions: (studentId, classId, month) => request(`create-class?action=get-student-sessions&studentId=${studentId}&classId=${classId}&month=${month}`, { method: 'GET' }),
  setStudentSessions: (studentId, classId, sessionDates, month) => request('create-class?action=set-student-sessions', { method: 'POST', body: JSON.stringify({ studentId, classId, sessionDates, month }) }),
  createChapter: (data) => request('create-chapter', { method: 'POST', body: JSON.stringify(data) }),
  getChapters: (classId = '') => request(`create-chapter${classId ? `?classId=${classId}` : ''}`, { method: 'GET' }),
  deleteChapter: (chapterId) => request(`create-chapter?chapterId=${chapterId}`, { method: 'DELETE' }),
  createLesson: (data) => request('create-lesson', { method: 'POST', body: JSON.stringify(data) }),
  updateLesson: (data) => request('create-lesson?action=update', { method: 'PUT', body: JSON.stringify(data) }),
  getLessons: (chapterId = '') => request(`create-lesson${chapterId ? `?chapterId=${chapterId}` : ''}`, { method: 'GET' }),
  deleteLesson: (lessonId) => request(`create-lesson?lessonId=${lessonId}`, { method: 'DELETE' }),
  createHomework: (data) => request('create-homework', { method: 'POST', body: JSON.stringify(data) }),
  updateHomework: (data) => request('create-homework', { method: 'PUT', body: JSON.stringify(data) }),
  getHomeworks: (lessonId = '') => request(`create-homework${lessonId ? `?lessonId=${lessonId}` : ''}`, { method: 'GET' }),
  getTodoHomeworks: () => request('create-homework?todoOnly=true', { method: 'GET' }),
  submitHomework: (data) => request('submit-homework', { method: 'POST', body: JSON.stringify(data) }),
  getDashboard: () => request('dashboard', { method: 'GET' }),
  getStatistics: (params = '') => request(`statistics?${params}`, { method: 'GET' }),
  getStudentHistory: (params = '') => request(`student-history?${params}`, { method: 'GET' }),
  getHomeworkDetail: (homeworkId) => request(`homework-detail?homeworkId=${homeworkId}`, { method: 'GET' }),
  getStudents: () => request('create-student', { method: 'GET' }),
  deleteStudent: (studentId) => request(`create-student?studentId=${studentId}`, { method: 'DELETE' }),
  uploadFile: async (file) => {
    const fileName = `${Date.now()}_${file.name.replace(/[^a-zA-Z0-9.]/g, '_')}`
    showLoading()
    try {
      const response = await fetch(`${SUPABASE_URL}/storage/v1/object/pdf-files/${fileName}`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${state.token}`
        },
        body: file
      })
      if (!response.ok) {
        const errText = await response.text()
        throw new Error(`Upload failed: ${errText}`)
      }
      return fileName
    } finally {
      hideLoading()
    }
  }
}
