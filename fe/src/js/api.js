import { state } from './state.js'

const SUPABASE_FUNCTIONS_URL = 'http://127.0.0.1:54321/functions/v1'

async function request(endpoint, options = {}) {
  const headers = {
    'Content-Type': 'application/json',
    ...(options.headers || {})
  }

  if (state.token) {
    headers['Authorization'] = `Bearer ${state.token}`
  }

  try {
    const response = await fetch(`${SUPABASE_FUNCTIONS_URL}/${endpoint}`, {
      ...options,
      headers
    })

    const result = await response.json()
    if (!response.ok || result.success === false) {
      throw new Error(result.error || `HTTP ${response.status}`)
    }

    return result.data
  } catch (err) {
    console.warn(`[API] Edge Function call ${endpoint} failed, falling back to local state mode:`, err.message)
    throw err
  }
}

export const api = {
  login: (username, password) => request('login', { method: 'POST', body: JSON.stringify({ username, password }) }),
  createStudent: (data) => request('create-student', { method: 'POST', body: JSON.stringify(data) }),
  resetPassword: (data) => request('reset-password', { method: 'POST', body: JSON.stringify(data) }),
  createClass: (data) => request('create-class', { method: 'POST', body: JSON.stringify(data) }),
  getClasses: () => request('create-class', { method: 'GET' }),
  deleteClass: (classId) => request(`create-class?classId=${classId}`, { method: 'DELETE' }),
  createChapter: (data) => request('create-chapter', { method: 'POST', body: JSON.stringify(data) }),
  getChapters: (classId = '') => request(`create-chapter${classId ? `?classId=${classId}` : ''}`, { method: 'GET' }),
  deleteChapter: (chapterId) => request(`create-chapter?chapterId=${chapterId}`, { method: 'DELETE' }),
  createLesson: (data) => request('create-lesson', { method: 'POST', body: JSON.stringify(data) }),
  getLessons: (chapterId = '') => request(`create-lesson${chapterId ? `?chapterId=${chapterId}` : ''}`, { method: 'GET' }),
  deleteLesson: (lessonId) => request(`create-lesson?lessonId=${lessonId}`, { method: 'DELETE' }),
  createHomework: (data) => request('create-homework', { method: 'POST', body: JSON.stringify(data) }),
  updateHomework: (data) => request('create-homework', { method: 'PUT', body: JSON.stringify(data) }),
  getHomeworks: (lessonId = '') => request(`create-homework${lessonId ? `?lessonId=${lessonId}` : ''}`, { method: 'GET' }),
  submitHomework: (data) => request('submit-homework', { method: 'POST', body: JSON.stringify(data) }),
  getDashboard: () => request('dashboard', { method: 'GET' }),
  getStatistics: (params = '') => request(`statistics?${params}`, { method: 'GET' }),
  getStudentHistory: (params = '') => request(`student-history?${params}`, { method: 'GET' }),
  getHomeworkDetail: (homeworkId) => request(`homework-detail?homeworkId=${homeworkId}`, { method: 'GET' }),
  getStudents: () => request('create-student', { method: 'GET' }),
  deleteStudent: (studentId) => request(`create-student?studentId=${studentId}`, { method: 'DELETE' }),
  uploadFile: async (file) => {
    const fileName = `${Date.now()}_${file.name.replace(/[^a-zA-Z0-9.]/g, '_')}`
    const response = await fetch(`http://127.0.0.1:54321/storage/v1/object/pdf-files/${fileName}`, {
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
  }
}
