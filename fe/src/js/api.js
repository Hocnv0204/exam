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
          title: 'Bài thi thử nghiệm chính thức (Demo Exam)',
          deadline: new Date(Date.now() + 86400000).toISOString(),
          durationMinutes: 45,
          maxAttempts: 3,
          type: 'EXAM',
          maxViolations: 3,
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
        homework: {
          id: 'mock-hw-1',
          title: 'Bài thi thử nghiệm chính thức (Demo Exam)',
          durationMinutes: 45,
          passScore: 5,
          maxScore: 10,
          isPublished: true,
          createdAt: new Date().toISOString(),
          deadline: new Date(Date.now() + 86400000).toISOString(),
          maxAttempts: 3,
          type: 'EXAM',
          maxViolations: 3,
          showSolutions: true,
          lessonTitle: 'Bài học mẫu',
          chapterTitle: 'Chương mẫu',
          lessonId: 'l1',
          chapterId: 'ch1',
          classId: 'c1',
          pdfPath: '',
          pdfUrl: ''
        },
        questions: [
          {
            id: 'q1',
            question_number: 1,
            question_type: 'MULTIPLE_CHOICE',
            prompt: JSON.stringify({
              text: 'Cho hàm số $y = f(x)$ có bảng biến thiên như hình vẽ. Hàm số đồng biến trên khoảng nào sau đây?',
              options: [
                { id: 'A', text: '$(-\\infty; -1)$' },
                { id: 'B', text: '$(-1; 1)$' },
                { id: 'C', text: '$(1; +\\infty)$' },
                { id: 'D', text: '$(0; 2)$' }
              ]
            }),
            points: 1
          },
          {
            id: 'q2',
            question_number: 2,
            question_type: 'TRUE_FALSE',
            prompt: JSON.stringify({
              text: 'Cho hình lăng trụ tam giác đều $ABC.A\'B\'C\'$ có tất cả các cạnh bằng $a$. Xét tính đúng sai của các khẳng định sau:',
              statements: [
                { key: 'a', text: 'Góc giữa $A\'B$ và $(ABC)$ bằng $45^\\circ$.' },
                { key: 'b', text: 'Thể tích khối lăng trụ bằng $\\frac{a^3\\sqrt{3}}{4}$.' },
                { key: 'c', text: 'Khoảng cách giữa $AA\'$ và $BC$ bằng $a\\frac{\\sqrt{3}}{2}$.' },
                { key: 'd', text: 'Mặt phẳng $(A\'BC)$ vuông góc với mặt phẳng $(ABB\'A\')$.' }
              ]
            }),
            points: 1
          },
          {
            id: 'q3',
            question_number: 3,
            question_type: 'SHORT_ANSWER',
            prompt: JSON.stringify({
              text: 'Tìm giá trị lớn nhất của hàm số $f(x) = -x^2 + 4x + 5$ trên đoạn $[0; 3]$.'
            }),
            points: 1
          }
        ],
        attemptsCount: 0
      })
    }
    if (endpoint.startsWith('exam-session')) {
      return Promise.resolve({
        success: true,
        resumed: false,
        draftAnswers: null
      })
    }
    if (endpoint.startsWith('exam-log')) {
      try {
        const body = options.body ? JSON.parse(options.body) : {}
        const penalizedActions = ['LEAVE_TAB', 'BLUR_TAB', 'LEAVE_EXAM', 'DEVTOOLS', 'FULLSCREEN_EXIT', 'COPY', 'PASTE', 'SHORTCUT_DEVTOOLS']
        let currentVio = parseInt(sessionStorage.getItem('mock_violations_count') || '0', 10)
        if (penalizedActions.includes(body.action)) {
          currentVio++
          sessionStorage.setItem('mock_violations_count', String(currentVio))
        }
        const maxV = 3
        return Promise.resolve({
          success: true,
          currentViolations: currentVio,
          maxViolations: maxV,
          autoSubmitted: currentVio >= maxV
        })
      } catch (e) {
        return Promise.resolve({
          success: true,
          currentViolations: 0,
          maxViolations: 3,
          autoSubmitted: false
        })
      }
    }
    if (endpoint.startsWith('submit-homework')) {
      return Promise.resolve({
        submission: {
          id: "mock-submission-id",
          homeworkTitle: "Bài thi thử nghiệm chính thức",
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
            prompt: "Cho hàm số $y = f(x)$ có bảng biến thiên...",
            questionType: "MULTIPLE_CHOICE",
            givenAnswer: { type: "MULTIPLE_CHOICE", value: "A" },
            isCorrect: true,
            scoreEarned: 1.0,
            pointsPossible: 1.0
          },
          {
            questionNumber: 2,
            prompt: "Cho hình lăng trụ tam giác đều $ABC.A'B'C'$...",
            questionType: "TRUE_FALSE",
            givenAnswer: { type: "TRUE_FALSE", value: { a: true, b: false, c: true, d: false } },
            isCorrect: false,
            scoreEarned: 0.5,
            pointsPossible: 1.0
          },
          {
            questionNumber: 3,
            prompt: "Tìm giá trị lớn nhất của hàm số...",
            questionType: "SHORT_ANSWER",
            givenAnswer: { type: "SHORT_ANSWER", value: "9" },
            isCorrect: true,
            scoreEarned: 1.0,
            pointsPossible: 1.0
          }
        ]
      })
    }
    return Promise.resolve([])
  }

  const isPublicEndpoint = endpoint.startsWith('login') ||
    endpoint.startsWith('refresh-token') ||
    endpoint.includes('isTrial=true') ||
    endpoint.includes('trial=true') ||
    options.isPublic === true ||
    (endpoint.startsWith('homework-detail') && !state.token) ||
    (endpoint.startsWith('submit-homework') && !state.token) ||
    (endpoint.startsWith('student-history') && !state.token)

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
  } else if (import.meta.env.VITE_SUPABASE_ANON_KEY) {
    headers['Authorization'] = `Bearer ${import.meta.env.VITE_SUPABASE_ANON_KEY}`
  }

  const isSilent = Boolean(options.silent || options.skipLoading)
  const fetchOptions = { ...options }
  delete fetchOptions.silent
  delete fetchOptions.skipLoading
  delete fetchOptions.isPublic

  if (!isSilent) {
    showLoading()
  }
  try {
    let response = await fetch(`${SUPABASE_FUNCTIONS_URL}/${endpoint}`, {
      ...fetchOptions,
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
                ...fetchOptions,
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

      // If we still get a 401, logout only for protected endpoints
      if (response.status === 401) {
        if (!isPublicEndpoint) {
          logout()
          throw new Error('Phiên làm việc đã hết hạn. Vui lòng đăng nhập lại.')
        } else {
          throw new Error('Không thể truy cập dữ liệu công khai.')
        }
      }
    }

    const result = await response.json()
    if (!response.ok || result.success === false) {
      const errMsg = (typeof result.error === 'string' && result.error) ||
        result.message ||
        (typeof result.data === 'object' && (result.data?.message || result.data?.error)) ||
        `HTTP ${response.status}`
      if (response.status === 401 || errMsg.includes('Authorization') || errMsg.includes('Unauthorized')) {
        if (!isPublicEndpoint) {
          logout()
          throw new Error('Phiên làm việc đã hết hạn. Vui lòng đăng nhập lại.')
        }
      }
      throw new Error(errMsg)
    }

    return result.data
  } catch (err) {
    console.warn(`[API] Edge Function call ${endpoint} failed:`, err.message)
    throw err
  } finally {
    if (!isSilent) {
      hideLoading()
    }
  }
}

export const api = {
  login: (username, password) => request('login', { method: 'POST', body: JSON.stringify({ username, password }) }),
  createStudent: (data) => request('create-student', { method: 'POST', body: JSON.stringify(data) }),
  updateStudent: (data) => request('create-student', { method: 'PUT', body: JSON.stringify(data) }),
  resetPassword: (data) => request('reset-password', { method: 'POST', body: JSON.stringify(data) }),
  createClass: (data) => request('create-class', { method: 'POST', body: JSON.stringify(data) }),
  updateClass: (data) => request('create-class?action=update', { method: 'PUT', body: JSON.stringify(data) }),
  getClasses: (params = '') => request(`create-class${params ? (params.startsWith('?') ? params : `?${params}`) : ''}`, { method: 'GET' }),
  deleteClass: (classId) => request(`create-class?classId=${classId}`, { method: 'DELETE' }),
  removeStudentFromClass: (classId, studentId) => request('create-class?action=remove-student', { method: 'POST', body: JSON.stringify({ classId, studentId }) }),
  getGradeBlocks: (params = {}) => request(`create-class?action=get-grade-blocks${params?.includeStats ? '&includeStats=true' : ''}`, { method: 'GET' }),
  createGradeBlock: (data) => request('create-class?action=create-grade-block', { method: 'POST', body: JSON.stringify(data) }),
  updateGradeBlock: (data) => request('create-class?action=update-grade-block', { method: 'PUT', body: JSON.stringify(data) }),
  deleteGradeBlock: (id) => request(`create-class?action=delete-grade-block&id=${id}`, { method: 'DELETE' }),
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
  getTrialLessons: () => request('create-lesson?isTrial=true', { method: 'GET', isPublic: true }),
  deleteLesson: (lessonId) => request(`create-lesson?lessonId=${lessonId}`, { method: 'DELETE' }),
  createHomework: (data) => request('create-homework', { method: 'POST', body: JSON.stringify(data) }),
  updateHomework: (data) => request('create-homework', { method: 'PUT', body: JSON.stringify(data) }),
  deleteHomework: (homeworkId) => request(`create-homework?homeworkId=${homeworkId}`, { method: 'DELETE' }),
  getHomeworks: (lessonIdOrQuery = '', classId = '', extraParams = '') => {
    let query = ''
    if (typeof lessonIdOrQuery === 'string' && lessonIdOrQuery.includes('=')) {
      query = lessonIdOrQuery.startsWith('?') ? lessonIdOrQuery.substring(1) : lessonIdOrQuery
    } else if (lessonIdOrQuery) {
      query = `lessonId=${lessonIdOrQuery}`
    }
    if (classId) {
      query += `${query ? '&' : ''}classId=${classId}`
    }
    if (extraParams) {
      const extra = extraParams.startsWith('?') ? extraParams.substring(1) : extraParams
      query += `${query ? '&' : ''}${extra}`
    }
    return request(`create-homework${query ? `?${query}` : ''}`, { method: 'GET' })
  },
  getTodoHomeworks: (params = '') => request(`create-homework?todoOnly=true${params ? (params.startsWith('&') ? params : `&${params}`) : ''}`, { method: 'GET' }),
  submitHomework: (data) => request('submit-homework', { method: 'POST', body: JSON.stringify(data) }),
  submitExamLog: (data, options = {}) => request('exam-log', { method: 'POST', body: JSON.stringify(data), keepalive: true, silent: true, ...options }),
  getExamLogs: (homeworkId, params = '', options = {}) => request(`exam-log?homeworkId=${homeworkId}${params ? (params.startsWith('&') ? params : `&${params}`) : ''}`, { method: 'GET', ...options }),
  getExamSessions: (homeworkId, options = {}) => request(`exam-session?homeworkId=${homeworkId}`, { method: 'GET', ...options }),
  reopenSubmission: (homeworkId, studentId, resetTimer, resetAnswers, options = {}) => request(`reopen-submission`, { method: 'POST', body: JSON.stringify({ homeworkId, studentId, resetTimer, resetAnswers }), ...options }),
  initExamSession: (homeworkId, sessionToken, options = {}) => request(`exam-session`, { method: 'POST', body: JSON.stringify({ action: 'init', homeworkId, sessionToken }), silent: true, ...options }),
  heartbeatExamSession: (homeworkId, sessionToken, options = {}) => request(`exam-session`, { method: 'POST', body: JSON.stringify({ action: 'heartbeat', homeworkId, sessionToken }), silent: true, ...options }),
  autosaveExamSession: (homeworkId, sessionToken, draftAnswers, options = {}) => request(`exam-session`, { method: 'POST', body: JSON.stringify({ action: 'autosave', homeworkId, sessionToken, draftAnswers }), silent: true, ...options }),
  getDashboard: () => request('dashboard', { method: 'GET' }),
  getStatistics: (params = '') => request(`statistics?${params}`, { method: 'GET' }),
  getStudentHistory: (params = '') => request(`student-history${params ? (params.startsWith('?') ? params : `?${params}`) : ''}`, { method: 'GET' }),
  getHomeworkDetail: (homeworkId, options = {}) => request(`homework-detail?homeworkId=${homeworkId}`, { method: 'GET', ...options }),
  getStudents: (params = '') => request(`create-student${params ? (params.startsWith('?') ? params : `?${params}`) : ''}`, { method: 'GET' }),
  deleteStudent: (studentId) => request(`create-student?studentId=${studentId}`, { method: 'DELETE' }),
  getTelegramConfig: (classId) => request(`create-class?action=get-telegram-config&classId=${classId}`, { method: 'GET' }),
  updateTelegramConfig: (data) => request('create-class?action=update-telegram-config', { method: 'PUT', body: JSON.stringify(data) }),
  deleteTelegramConfig: (classId) => request(`create-class?action=delete-telegram-config&classId=${classId}`, { method: 'DELETE' }),
  getQuestionBank: (params = '') => request(`question-bank${params ? (params.startsWith('?') ? params : `?${params}`) : ''}`, { method: 'GET' }),
  getQuestionBankStats: (params = '') => request(`question-bank?stats=true${params ? `&${params}` : ''}`, { method: 'GET' }),
  checkQuestionBankAvailability: (params = '') => request(`question-bank?action=check-availability${params ? `&${params}` : ''}`, { method: 'GET' }),
  importQuestionBank: (data) => request('question-bank?action=import', { method: 'POST', body: JSON.stringify(data) }),
  importQuestionBankFromHomework: (data) => request('question-bank?action=import-from-homework', { method: 'POST', body: JSON.stringify(data) }),
  generateRandomExam: (data) => request('question-bank?action=generate-exam', { method: 'POST', body: JSON.stringify(data) }),
  swapQuestionInExam: (data) => request('question-bank?action=swap-question', { method: 'POST', body: JSON.stringify(data) }),
  createHomeworkFromBankQuestions: (data) => request('question-bank?action=create-from-selected', { method: 'POST', body: JSON.stringify(data) }),
  deleteQuestionFromBank: (id) => request(`question-bank?id=${id}`, { method: 'DELETE' }),
  updateQuestionInBank: (data) => request('question-bank', { method: 'PUT', body: JSON.stringify(data) }),
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

export function unwrapPaginated(res) {
  if (res && res.items && Array.isArray(res.items)) {
    return {
      items: res.items,
      pagination: res.pagination || {
        page: 1,
        limit: res.items.length,
        total: res.items.length,
        totalPages: 1,
        hasPrevPage: false,
        hasNextPage: false
      }
    }
  }
  if (Array.isArray(res)) {
    return {
      items: res,
      pagination: {
        page: 1,
        limit: res.length,
        total: res.length,
        totalPages: 1,
        hasPrevPage: false,
        hasNextPage: false
      }
    }
  }
  return { items: [], pagination: null }
}
