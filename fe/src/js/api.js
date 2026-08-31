import { state, logout, setSession } from './state.js'

// Supabase URL from Vite environment variables (falls back to local dev URL)
export const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL || 'http://127.0.0.1:54321'

const SUPABASE_FUNCTIONS_URL = `${SUPABASE_URL}/functions/v1`

let activeRequests = 0
let loadingOverlay = null
let isRefreshing = false

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
  // Mock mode interceptor for demo student account
  if (state.token === 'mock_student_token') {
    console.log(`[API Mock] Intercepting endpoint: ${endpoint}`)
    if (endpoint.startsWith('create-homework?todoOnly=true')) {
      return Promise.resolve([
        {
          id: 'mock-hw-1',
          title: 'Bài tập Demo trắc nghiệm & tự luận',
          deadline: new Date(Date.now() + 86400000).toISOString(),
          durationMinutes: 45,
          maxAttempts: 3,
          lessonTitle: 'Bài học mẫu',
          chapterTitle: 'Chương mẫu',
          className: 'Lớp học mẫu 12A'
        }
      ])
    }
    if (endpoint.startsWith('create-class')) {
      return Promise.resolve([
        {
          id: 'c1',
          name: 'Lớp học mẫu 12A',
          description: 'Lớp học demo cho học sinh'
        }
      ])
    }
    if (endpoint.startsWith('student-history')) {
      return Promise.resolve({
        studentId: 's1',
        totalSubmissions: 1,
        history: [
          {
            id: 'mock-sub-1',
            homeworkTitle: 'Bài tập ôn tập số 1',
            score: 8.5,
            maxScore: 10,
            passScore: 5,
            isPassed: true,
            correctCount: 8,
            wrongCount: 2,
            durationSecondsTaken: 150,
            submittedAt: new Date(Date.now() - 3600000 * 2).toISOString(),
            lessonTitle: 'Lý thuyết cơ bản',
            chapterTitle: 'Chương 1',
            className: 'Lớp học mẫu 12A'
          }
        ]
      })
    }
    if (endpoint.startsWith('homework-detail')) {
      return Promise.resolve({
        id: 'mock-hw-1',
        title: 'Bài tập Demo trắc nghiệm & tự luận',
        durationMinutes: 45,
        questions: [
          {
            id: 'q1',
            question_number: 1,
            question_type: 'MULTIPLE_CHOICE',
            prompt: 'Đáp án nào đúng nhất?',
            points: 1
          },
          {
            id: 'q2',
            question_number: 2,
            question_type: 'TRUE_FALSE',
            prompt: 'Chọn Đúng hoặc Sai cho các phát biểu sau:',
            points: 1
          },
          {
            id: 'q3',
            question_number: 3,
            question_type: 'SHORT_ANSWER',
            prompt: 'Kết quả của 1 + 1 bằng bao nhiêu?',
            points: 1
          }
        ]
      })
    }
    if (endpoint.startsWith('submit-homework')) {
      return Promise.resolve({
        submission: {
          id: "mock-submission-id",
          homeworkTitle: "Bài tập Demo",
          studentName: state.user?.fullName || "Nguyễn Văn An",
          score: 8.5,
          maxScore: 10,
          passScore: 5,
          correctCount: 2,
          wrongCount: 1,
          durationSecondsTaken: 120,
          submittedAt: new Date().toISOString(),
          pdfUrl: ""
        },
        questionReview: [
          {
            questionNumber: 1,
            prompt: "Đáp án nào đúng nhất?",
            questionType: "MULTIPLE_CHOICE",
            givenAnswer: { type: "MULTIPLE_CHOICE", value: "A" },
            isCorrect: true,
            scoreEarned: 1.0,
            pointsPossible: 1.0
          },
          {
            questionNumber: 2,
            prompt: "Chọn Đúng hoặc Sai cho các phát biểu sau:",
            questionType: "TRUE_FALSE",
            givenAnswer: { type: "TRUE_FALSE", value: { a: true, b: false, c: true, d: false } },
            isCorrect: false,
            scoreEarned: 0.5,
            pointsPossible: 1.0
          },
          {
            questionNumber: 3,
            prompt: "Kết quả của 1 + 1 bằng bao nhiêu?",
            questionType: "SHORT_ANSWER",
            givenAnswer: { type: "SHORT_ANSWER", value: "2" },
            isCorrect: true,
            scoreEarned: 1.0,
            pointsPossible: 1.0
          }
        ]
      })
    }
    return Promise.resolve([])
  }

  const isPublicEndpoint = endpoint.startsWith('login') || endpoint.startsWith('refresh-token')

  // If access token is missing but refresh token exists, attempt refresh before sending request
  if (!state.token && !isPublicEndpoint && state.refreshToken && !isRefreshing) {
    isRefreshing = true
    try {
      console.log('[API] Access Token missing. Attempting silent token refresh before request...')
      const refreshRes = await fetch(`${SUPABASE_FUNCTIONS_URL}/refresh-token`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ refreshToken: state.refreshToken })
      })
      if (refreshRes.ok) {
        const refreshResult = await refreshRes.json()
        if (refreshResult.success && refreshResult.data) {
          const { accessToken, refreshToken } = refreshResult.data
          setSession(state.user, accessToken, refreshToken)
        }
      }
    } catch (e) {
      console.error('[API] Pre-request token refresh failed:', e)
    } finally {
      isRefreshing = false
    }
  }

  // If still no token for protected endpoint, logout cleanly
  if (!state.token && !isPublicEndpoint) {
    logout()
    throw new Error('Phiên làm việc đã hết hạn. Vui lòng đăng nhập lại.')
  }

  const headers = {
    'Content-Type': 'application/json',
    ...(import.meta.env.VITE_SUPABASE_ANON_KEY ? { 'apikey': import.meta.env.VITE_SUPABASE_ANON_KEY } : {}),
    ...(options.headers || {})
  }

  if (state.token) {
    headers['Authorization'] = `Bearer ${state.token}`
  }

  showLoading()
  try {
    let response = await fetch(`${SUPABASE_FUNCTIONS_URL}/${endpoint}`, {
      ...options,
      headers
    })

    if (response.status === 401) {
      // If we have a refresh token and we're not currently refreshing, try to refresh
      if (state.refreshToken && !isRefreshing && endpoint !== 'refresh-token') {
        isRefreshing = true
        try {
          console.log('[API] Access Token expired. Attempting silent token refresh...')
          const refreshRes = await fetch(`${SUPABASE_FUNCTIONS_URL}/refresh-token`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ refreshToken: state.refreshToken })
          })

          if (refreshRes.ok) {
            const refreshResult = await refreshRes.json()
            if (refreshResult.success && refreshResult.data) {
              const { accessToken, refreshToken } = refreshResult.data
              setSession(state.user, accessToken, refreshToken)
              console.log('[API] Silent token refresh successful!')

              // Retry the original request with the new access token
              headers['Authorization'] = `Bearer ${accessToken}`
              response = await fetch(`${SUPABASE_FUNCTIONS_URL}/${endpoint}`, {
                ...options,
                headers
              })
            }
          }
        } catch (refreshErr) {
          console.error('[API] Silent token refresh failed:', refreshErr)
        } finally {
          isRefreshing = false
        }
      }

      // If we still get a 401, logout
      if (response.status === 401) {
        logout()
        throw new Error('Phiên làm việc đã hết hạn. Vui lòng đăng nhập lại.')
      }
    }

    const result = await response.json()
    if (!response.ok || result.success === false) {
      const errMsg = result.error || `HTTP ${response.status}`
      if (response.status === 401 || errMsg.includes('Authorization') || errMsg.includes('Unauthorized')) {
        logout()
        throw new Error('Phiên làm việc đã hết hạn. Vui lòng đăng nhập lại.')
      }
      throw new Error(errMsg)
    }

    return result.data
  } catch (err) {
    console.warn(`[API] Edge Function call ${endpoint} failed:`, err.message)
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
  getChapters: (classId = '', includeLessons = false) => request(`create-chapter${classId ? `?classId=${classId}` : ''}${includeLessons ? `${classId ? '&' : '?'}includeLessons=true` : ''}`, { method: 'GET' }),
  deleteChapter: (chapterId) => request(`create-chapter?chapterId=${chapterId}`, { method: 'DELETE' }),
  updateChapter: (data) => request('create-chapter', { method: 'PUT', body: JSON.stringify(data) }),
  createLesson: (data) => request('create-lesson', { method: 'POST', body: JSON.stringify(data) }),
  updateLesson: (data) => request('create-lesson?action=update', { method: 'PUT', body: JSON.stringify(data) }),
  getLessons: (chapterId = '') => request(`create-lesson${chapterId ? `?chapterId=${chapterId}` : ''}`, { method: 'GET' }),
  deleteLesson: (lessonId) => request(`create-lesson?lessonId=${lessonId}`, { method: 'DELETE' }),
  createHomework: (data) => request('create-homework', { method: 'POST', body: JSON.stringify(data) }),
  updateHomework: (data) => request('create-homework', { method: 'PUT', body: JSON.stringify(data) }),
  deleteHomework: (homeworkId) => request(`create-homework?homeworkId=${homeworkId}`, { method: 'DELETE' }),
  getHomeworks: (lessonIdOrQuery = '', classId = '') => {
    if (typeof lessonIdOrQuery === 'string' && lessonIdOrQuery.includes('=')) {
      const q = lessonIdOrQuery.startsWith('?') ? lessonIdOrQuery : `?${lessonIdOrQuery}`
      return request(`create-homework${q}`, { method: 'GET' })
    }
    return request(`create-homework${classId ? `?classId=${classId}` : (lessonIdOrQuery ? `?lessonId=${lessonIdOrQuery}` : '')}`, { method: 'GET' })
  },
  getTodoHomeworks: () => request('create-homework?todoOnly=true', { method: 'GET' }),
  submitHomework: (data) => request('submit-homework', { method: 'POST', body: JSON.stringify(data) }),
  submitExamLog: (data) => request('exam-log', { method: 'POST', body: JSON.stringify(data) }),
  getExamLogs: (homeworkId) => request(`exam-log?homeworkId=${homeworkId}`, { method: 'GET' }),
  reopenSubmission: (homeworkId, studentId, resetTimer, resetAnswers) => request(`reopen-submission`, { method: 'POST', body: JSON.stringify({ homeworkId, studentId, resetTimer, resetAnswers }) }),
  initExamSession: (homeworkId, sessionToken) => request(`exam-session`, { method: 'POST', body: JSON.stringify({ action: 'init', homeworkId, sessionToken }) }),
  heartbeatExamSession: (homeworkId, sessionToken) => request(`exam-session`, { method: 'POST', body: JSON.stringify({ action: 'heartbeat', homeworkId, sessionToken }) }),
  autosaveExamSession: (homeworkId, sessionToken, draftAnswers) => request(`exam-session`, { method: 'POST', body: JSON.stringify({ action: 'autosave', homeworkId, sessionToken, draftAnswers }) }),
  getDashboard: () => request('dashboard', { method: 'GET' }),
  getStatistics: (params = '') => request(`statistics?${params}`, { method: 'GET' }),
  getStudentHistory: (params = '') => request(`student-history?${params}`, { method: 'GET' }),
  getHomeworkDetail: (homeworkId) => request(`homework-detail?homeworkId=${homeworkId}`, { method: 'GET' }),
  getStudents: () => request('create-student', { method: 'GET' }),
  deleteStudent: (studentId) => request(`create-student?studentId=${studentId}`, { method: 'DELETE' }),
  getTelegramConfig: (classId) => request(`create-class?action=get-telegram-config&classId=${classId}`, { method: 'GET' }),
  updateTelegramConfig: (data) => request('create-class?action=update-telegram-config', { method: 'PUT', body: JSON.stringify(data) }),
  deleteTelegramConfig: (classId) => request(`create-class?action=delete-telegram-config&classId=${classId}`, { method: 'DELETE' }),
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
