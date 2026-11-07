import { state } from './state.js'
import { api } from './api.js'
// Applies the saved global and student preferences before the first render.
import { isDarkTheme, getTheme, getStudentTheme, getClassicStudentTheme, applyStudentThemeToDocument } from './theme.js'
import { syncMochiUI, isMochiUI } from './ui-flag.js'

// Skin học sinh đang hiển thị: Mochi dùng đủ 4 bảng màu; giao diện cũ chỉ dark/sakura.
const studentSkin = () => (isMochiUI() ? getStudentTheme() : getClassicStudentTheme())
import { renderLoginView, bindLoginEvents } from './views/login.js'
import { renderMyClassesView, bindMyClassesEvents } from './views/my-classes.js'
import { renderClassMgmtView, bindClassMgmtEvents } from './views/class-mgmt.js'
import { renderStudentMgmtView, bindStudentMgmtEvents } from './views/student-mgmt.js'
import { renderHomeworkSolverView, bindHomeworkSolverEvents } from './views/homework-solver.js'
// Các view lớn được nạp theo route ở dưới để giảm bundle khởi động.
import { renderLearningHistoryView, bindLearningHistoryEvents } from './views/learning-history.js'
// class-details, question-bank, exam-proctoring dùng lazy loader.
import { renderStudentDetailsView, bindStudentDetailsEvents } from './views/student-details.js'
import { renderHomeworkMgmtView, bindHomeworkMgmtEvents } from './views/homework-mgmt.js'
import { renderTrialView, bindTrialEvents } from './views/trial.js'
import { renderTrialManagementView, bindTrialManagementEvents } from './views/trial-management.js'
import { renderMyHomeworksView, bindMyHomeworksEvents } from './views/my-homeworks.js'
import { renderGradeBlocksView, bindGradeBlocksEvents, fetchGradeBlocksData } from './views/grade-blocks.js'
import { renderExamRoomView, bindExamRoomEvents } from './views/exam-room.js'
import { renderTuitionLedgerView, bindTuitionLedgerEvents } from './views/tuition-ledger.js'
import { renderActivityLogsView, bindActivityLogsEvents } from './views/activity-logs.js'
import { renderWeeklyCalendarView, bindWeeklyCalendarEvents } from './views/weekly-calendar.js'
import { renderQuestionAppealsView, bindQuestionAppealsEvents } from './views/question-appeals.js'
import { showTrialRegistrationModal } from './components/modal.js'
import { showToast } from './components/toast.js'
import { sortClassChaptersLessons } from './utils/student-lesson-sort.js'

// Admin routes whose legacy light markup is re-themed to navy by the admin themes.
// Student routes opt into the same navy surfaces through studentDarkRoutes below;
// exam-room has no .app-layout root, so it carries navy-student on its own layout.
const adminDarkRoutes = new Set([
  'admin-dashboard',
  'students',
  'grade-blocks',
  'classes',
  'classes-admin',
  'curriculum',
  'create-homework',
  'homework',
  'homework-mgmt',
  'admin-history',
  'question-bank',
  'question-appeals',
  'exam-proctoring',
  'tuition-ledger',
  'activity-logs',
  'trial-management',
  'class-details',
  'student-details',
  'student-report',
  'assignment-review',
  'weekly-calendar'
])

// Student routes re-themed to navy by the student theme (2026-10-30: extended
// from dashboard-only to every student surface, including the exam room).
// They also receive admin-dark so the admin navy surfaces (cards, tables,
// forms, question paper, report/review pages, modals) apply unchanged.
// Public trial/roadmap/login routes are intentionally NOT included.
const studentDarkRoutes = new Set([
  'student-dashboard',
  'my-classes',
  'my-homeworks',
  'weekly-calendar',
  'homework-attempt',
  'assignment-review',
  'history',
  'student-report',
  'attendance',
  'achievements'
])

// Dark skins are keyed on these classes, so they follow the active theme.
// Light mode drops them and the original light design shows through.
function applyThemeClasses(layout, hash) {
  if (!layout) return
  const dark = isDarkTheme()
  const studentRoute = state.user?.role === 'STUDENT' && studentDarkRoutes.has(hash)
  const isStudentDark = studentRoute && studentSkin() === 'dark'
  // Student preference is independent of the global theme used by admin/public.
  layout.classList.toggle('admin-dark', (dark && state.user?.role === 'ADMIN' && adminDarkRoutes.has(hash)) || isStudentDark)
  layout.classList.toggle('navy-student', isStudentDark)
  layout.classList.toggle('pastel-student', studentRoute && studentSkin() === 'sakura')
}

function applyExamThemeClasses(layout, hash) {
  const studentRoute = state.user?.role === 'STUDENT' && hash === 'exam-room'
  layout.classList.toggle('navy-student', studentRoute && studentSkin() === 'dark')
  layout.classList.toggle('pastel-student', studentRoute && studentSkin() === 'sakura')
}

// Route đang được hiển thị thật sự: router render trang mặc định khi URL không
// có hash (#admin-dashboard với admin, #student-dashboard với học sinh, #roadmap với
// khách). Theme/role sync mà key trên '' sẽ gỡ .admin-dark / .navy-student và
// ghi đè data-route="" lên root vừa render => vỏ navy nhưng card dashboard sáng
// trắng. Mọi đường sync đều dùng helper này để khớp với router.
function resolveActiveRouteHash() {
  const routePath = (window.location.hash || '').replace(/^#/, '').split('?')[0]
  if (routePath) return routePath
  if (!state.token) return 'roadmap'
  return state.user?.role === 'ADMIN' ? 'admin-dashboard' : 'student-dashboard'
}

function syncDocumentTheme(hash) {
  // The legacy dark CSS also targets signed-in layouts without .admin-dark.
  // A student's light/pastel choice must therefore use the light base palette,
  // while the independently saved global theme remains intact for other roles.
  const studentRoute = state.user?.role === 'STUDENT' &&
    (studentDarkRoutes.has(hash) || hash === 'exam-room')
  const effective = studentRoute
    ? (studentSkin() === 'dark' ? 'dark' : 'light')
    : getTheme()
  applyStudentThemeToDocument(studentRoute)
  syncMochiUI(studentRoute)
  document.documentElement.dataset.theme = effective
  document.documentElement.style.colorScheme = effective
}

function syncThemeClassesToDom() {
  const hash = resolveActiveRouteHash()
  syncDocumentTheme(hash)
  document.querySelectorAll('.app-layout').forEach(el => applyThemeClasses(el, hash))
  document.querySelectorAll('.exam-room-layout').forEach(el => applyExamThemeClasses(el, hash))
}

let adminChartThemeUpdater = () => {}
let reportChartThemeUpdater = () => {}
document.addEventListener('eduportal:themechange', () => {
  syncThemeClassesToDom()
  // Never rerender a route to change color: it can destroy drafts, modal state,
  // chart instances and in-flight loading/error state.
  adminChartThemeUpdater()
  reportChartThemeUpdater()
})

const routes = {
  login: { render: renderLoginView, bind: bindLoginEvents },
  trial: { render: renderTrialView, bind: bindTrialEvents },
  'trial-management': { render: renderTrialManagementView, bind: bindTrialManagementEvents },
  roadmap: { render: renderTrialView, bind: bindTrialEvents },
  'roadmap-12': { render: renderTrialView, bind: bindTrialEvents },
  'roadmap-11': { render: renderTrialView, bind: bindTrialEvents },
  'my-classes': { render: renderMyClassesView, bind: bindMyClassesEvents },
  'student-dashboard': { render: renderMyClassesView, bind: bindMyClassesEvents },
  'my-homeworks': { render: renderMyHomeworksView, bind: bindMyHomeworksEvents },
  'weekly-calendar': { render: renderWeeklyCalendarView, bind: bindWeeklyCalendarEvents },
  'question-appeals': { render: renderQuestionAppealsView, bind: bindQuestionAppealsEvents },
  students: { render: renderStudentMgmtView, bind: bindStudentMgmtEvents },
  classes: { render: renderClassMgmtView, bind: bindClassMgmtEvents },
  'classes-admin': { render: renderClassMgmtView, bind: bindClassMgmtEvents },
  'create-homework': { loader: () => import('./views/create-hw.js'), renderName: 'renderCreateHwView', bindName: 'bindCreateHwEvents' },
  curriculum: { loader: () => import('./views/curriculum.js'), renderName: 'renderCurriculumView', bindName: 'bindCurriculumEvents' },
  'homework-attempt': { render: renderHomeworkSolverView, bind: bindHomeworkSolverEvents },
  'assignment-review': { loader: () => import('./views/assignment-review.js'), renderName: 'renderAssignmentReviewView', bindName: 'bindAssignmentReviewEvents' },
  history: { render: renderLearningHistoryView, bind: bindLearningHistoryEvents },
  attendance: { loader: () => import('./views/attendance.js'), renderName: 'renderAttendanceView', bindName: 'bindAttendanceEvents' },
  achievements: { loader: () => import('./views/achievements.js'), renderName: 'renderAchievementsView', bindName: 'bindAchievementsEvents' },
  'admin-dashboard': { loader: () => import('./views/admin-dashboard.js'), renderName: 'renderAdminDashboardView', bindName: 'bindAdminDashboardEvents' },
  'admin-history': { loader: () => import('./views/admin-history.js'), renderName: 'renderAdminHistoryView', bindName: 'bindAdminHistoryEvents' },
  'class-details': { loader: () => import('./views/class-details.js'), renderName: 'renderClassDetailsView', bindName: 'bindClassDetailsEvents' },
  'student-details': { render: renderStudentDetailsView, bind: bindStudentDetailsEvents },
  'student-report': { loader: () => import('./views/student-report.js'), renderName: 'renderStudentReportView', bindName: 'bindStudentReportEvents' },
  'shared-report': { loader: () => import('./views/student-report.js'), renderName: 'renderSharedReportView', bindName: 'bindSharedReportEvents' },
  homework: { render: renderHomeworkMgmtView, bind: bindHomeworkMgmtEvents },
  'homework-mgmt': { render: renderHomeworkMgmtView, bind: bindHomeworkMgmtEvents },
  'question-bank': { loader: () => import('./views/question-bank.js'), renderName: 'renderQuestionBankView', bindName: 'bindQuestionBankEvents' },
  'grade-blocks': { render: renderGradeBlocksView, bind: bindGradeBlocksEvents },
  'exam-room': { render: renderExamRoomView, bind: bindExamRoomEvents },
  'exam-proctoring': { loader: () => import('./views/exam-proctoring.js'), renderName: 'renderExamProctoringView', bindName: 'bindExamProctoringEvents' },
  'tuition-ledger': { render: renderTuitionLedgerView, bind: bindTuitionLedgerEvents },
  'activity-logs': { render: renderActivityLogsView, bind: bindActivityLogsEvents }
}

let routeSeq = 0

async function router() {
  const currentRouteSeq = ++routeSeq
  const isStale = () => currentRouteSeq !== routeSeq
  const hashUrl = window.location.hash.replace('#', '')
  const [routePath, queryString] = hashUrl.split('?')
  const params = new URLSearchParams(queryString || '')
  
  // Trang mặc định khi URL không hash phải trùng với resolveActiveRouteHash
  // để theme/role sync không bao giờ lệch với trang vừa render.
  let hash = routePath || resolveActiveRouteHash()

  // Public shared report route (#shared-report?token=...): route DUY NHAT duoc phep khong can Authorization.
  // Chi route nay duoc phep open khi chua dang nhap; token co gioi han duoc validate o backend (fail closed).
  const isPublicSharedReport = routePath === 'shared-report'

  // Guest & Unauthenticated Access Guard
  if (!state.token && !isPublicSharedReport) {
    // Regular shared homework links require login; explicit trial links stay public.
    if ((hash === 'homework-attempt' && params.get('trial') !== 'true') || hash === 'exam-room') {
      const next = `#${hash}${queryString ? `?${queryString}` : ''}`
      window.location.hash = `#login?next=${encodeURIComponent(next)}`
      return
    }
    const isTrialMode = params.get('trial') === 'true' || hash === 'trial' || hash.startsWith('roadmap')
    const guestRoutes = ['login', 'trial', 'roadmap', 'roadmap-12', 'roadmap-11', 'homework-attempt', 'assignment-review']
    if (!guestRoutes.includes(hash)) {
      window.location.hash = '#login'
      return
    }

    // Pre-fetch homework details for unauthenticated trial solver
    if (hash === 'homework-attempt') {
      const homeworkId = params.get('homeworkId')
      if (homeworkId) {
        try {
           const hwData = await api.getHomeworkDetail(homeworkId)
           if (isStale()) return
          state.currentHomework = hwData
          // Prefetch nháp server để khôi phục khi mở bài (luyện tập, đã đăng nhập)
          state.serverDraft = null
          if (state.token && state.user?.role === 'STUDENT' && hwData?.homework?.type !== 'EXAM') {
            try {
              const draft = await api.getDraft(homeworkId)
              if (draft) state.serverDraft = { homeworkId, draft }
            } catch (e) {
              console.warn('[Router] Failed to fetch server draft:', e?.message)
            }
          }
        } catch (e) {
          console.warn('[Router] Failed to fetch trial homework:', e)
        }
      }
    }

    // Restore cached trial submission result on review page if present, or fetch from API
    if (hash === 'assignment-review') {
      const submissionId = params.get('submissionId')
      if (submissionId) {
        try {
          const detail = await api.getStudentHistory(`submissionId=${submissionId}`)
          if (detail && !detail.error) {
            state.lastSubmissionResult = detail
          }
        } catch (e) {
          console.warn('[Router] Failed to fetch trial submission detail by ID:', e)
        }
      }
      if (!state.lastSubmissionResult) {
        try {
          const cached = sessionStorage.getItem('last_trial_submission')
          if (cached) {
            state.lastSubmissionResult = JSON.parse(cached)
          }
        } catch (e) {}
      }
    }
  }

  // Route Guard: Access Control based on Role
  if (state.token && state.user && !isPublicSharedReport) {
    const adminOnlyRoutes = ['admin-dashboard', 'students', 'grade-blocks', 'classes', 'classes-admin', 'curriculum', 'create-homework', 'homework', 'homework-mgmt', 'admin-history', 'question-bank', 'question-appeals', 'exam-proctoring', 'tuition-ledger', 'activity-logs', 'trial-management']
    const studentOnlyRoutes = ['student-dashboard', 'my-classes', 'my-homeworks', 'homework-attempt', 'history', 'exam-room', 'attendance', 'achievements']

    if (state.user.role === 'STUDENT' && adminOnlyRoutes.includes(hash)) {
      showToast('Tài khoản học sinh không có quyền truy cập trang quản trị này.', 'error')
      window.location.hash = '#student-dashboard'
      return
    }
    if (state.user.role === 'ADMIN' && studentOnlyRoutes.includes(hash)) {
      window.location.hash = '#admin-dashboard'
      return
    }
    if (state.user.role === 'ADMIN' && hash === 'curriculum') {
      const classId = params.get('classId') || (state.classes && state.classes.length > 0 ? state.classes[0].id : null)
      if (classId) {
        window.location.hash = `#class-details?classId=${classId}&tab=curriculum`
      } else {
        window.location.hash = '#classes-admin'
      }
      return
    }
  }

  const route = routes[hash] || routes['login']
  const routeModule = route.loader ? await route.loader() : route
  if (isStale()) return
  if (routeModule.updateAdminChartTheme) adminChartThemeUpdater = routeModule.updateAdminChartTheme
  if (routeModule.updateReportChartTheme) reportChartThemeUpdater = routeModule.updateReportChartTheme
  // Route tĩnh: { render, bind }. Route lazy: lấy hàm theo tên export đã khai báo.
  const renderRoute = route.loader ? routeModule[route.renderName] : route.render
  const bindRoute = route.loader ? routeModule[route.bindName] : route.bind
  if (typeof renderRoute !== 'function' || typeof bindRoute !== 'function') {
    throw new Error(`[Router] Route "${hash}" thiếu hàm render/bind`)
  }

  // Pre-fetch state data if user is logged in
  // (bo qua khi route public #shared-report -> public view se tu goi student-history?scope=shared-report)
  if (state.token && !isPublicSharedReport) {
    try {
      // Fetch Exam Room Details dynamically
      if (hash === 'exam-room') {
        const homeworkId = params.get('homeworkId')
        if (homeworkId) {
          const hwData = await api.getHomeworkDetail(homeworkId)
          if (isStale()) return
          state.currentHomework = hwData
          if (hwData?.homework?.type && hwData.homework.type !== 'EXAM') {
            window.location.hash = `#homework-attempt?homeworkId=${homeworkId}`
            return
          }
        }
      }

      // Fetch Homework Attempt Details dynamically
      if (hash === 'homework-attempt') {
        const homeworkId = params.get('homeworkId')
        if (homeworkId) {
          const hwData = await api.getHomeworkDetail(homeworkId)
          state.currentHomework = hwData
          if (hwData?.homework?.type === 'EXAM') {
            window.location.hash = `#exam-room?homeworkId=${homeworkId}`
            return
          }
        }
      }

      // Fetch Homework Details for Edit Mode dynamically
      if (hash === 'create-homework') {
        const homeworkId = params.get('homeworkId')
        if (homeworkId) {
          const [hwData] = await Promise.all([
            api.getHomeworkDetail(homeworkId),
            api.getClasses()
          ])
          if (isStale()) return
          state.editHomeworkData = hwData
        } else {
          state.editHomeworkData = null
           routeModule.resetCreateForm?.()
        }
      }

      // Fetch Grade Blocks dynamically
      if (hash === 'grade-blocks') {
         await fetchGradeBlocksData()
      }

      // 1. Fetch Classes & Chapters for My Classes and Admin pages
      // 1 & 2. Unified Parallel Pre-fetch for Classes, Chapters, and Students
      // student-report: chỉ ADMIN cần tên học sinh/lớp từ state; STUDENT tự render từ state.user + response.
      const prefetchableRoutes = ['classes-admin', 'classes', 'students', 'curriculum', 'create-homework', 'homework', 'homework-mgmt', 'my-classes', 'student-dashboard', 'class-details', 'student-details', 'question-bank', 'tuition-ledger', 'activity-logs']
      const reportPrefetch = hash === 'student-report' && state.user?.role === 'ADMIN'
      if (reportPrefetch || prefetchableRoutes.includes(hash)) {
        const classId = hash === 'my-classes' ? params.get('classId') : null
        const lessonId = hash === 'my-classes' ? params.get('lessonId') : null

        const needClasses = true
        // Chỉ dùng lại cây chương của cùng lớp trong 60s (đổi bài học liên tục không tải lại,
        // nhưng bài tập mới giao vẫn hiện sau tối đa 60s mà không cần tải lại trang).
        const hasChapters = classId && state.classChaptersClassId === classId && Array.isArray(state.classChapters) &&
          Date.now() - (state.classChaptersFetchedAt || 0) < 60000
        const needChapters = Boolean(classId) && !hasChapters
        const needStudents = reportPrefetch || ['students', 'class-details', 'student-details'].includes(hash)

        const prefetchTasks = []
        const taskTypes = []

        if (needClasses) {
          prefetchTasks.push(api.getClasses())
          taskTypes.push('classes')
        }
        if (needChapters) {
          prefetchTasks.push(api.getChapters(classId, true))
          taskTypes.push('chapters')
        }
        if (needStudents) {
          prefetchTasks.push(api.getStudents())
          taskTypes.push('students')
        }

        if (prefetchTasks.length > 0) {
          const results = await Promise.all(prefetchTasks)
          if (isStale()) return
          taskTypes.forEach((type, idx) => {
            const res = results[idx]
            if (type === 'classes') {
              const classesList = Array.isArray(res) ? res : (res?.items || res?.classes || [])
              state.classes = classesList.map(c => ({
                id: c.id,
                name: c.name,
                gradeBlock: c.gradeBlock || c.grade_block || '12-Toán',
                studentsCount: c.studentsCount || 0,
                tuitionFee: c.tuitionFee || 0,
                progress: 0
              }))
            } else if (type === 'chapters') {
              const chaptersList = Array.isArray(res) ? res : (res?.items || [])
              const mappedChapters = chaptersList.map(ch => ({
                id: ch.id,
                code: '',
                title: ch.title,
                orderIndex: ch.order_index,
                lessons: (ch.lessons || []).map((l, lIdx) => ({
                  id: l.id,
                  code: `${l.order_index || (lIdx + 1)}`,
                  title: l.title,
                  videoUrl: l.video_url || '',
                  theoryFiles: l.theory_files || [],
                  createdAt: l.created_at || l.createdAt || null,
                  orderIndex: l.order_index,
                  order_index: l.order_index,
                  content: l.content,
                  homeworks: (l.homeworks || []).map(h => ({
                    id: h.id,
                    title: h.title,
                    lessonId: h.lesson_id || h.lessonId || l.id,
                    pdfPath: h.pdf_path || h.pdfPath,
                    durationMinutes: h.duration_minutes !== undefined ? h.duration_minutes : (h.durationMinutes !== undefined ? h.durationMinutes : 45),
                    passScore: h.pass_score !== undefined ? h.pass_score : (h.passScore !== undefined ? h.passScore : 5),
                    maxScore: h.max_score !== undefined ? h.max_score : (h.maxScore !== undefined ? h.maxScore : 10),
                    deadline: h.deadline,
                    maxAttempts: h.max_attempts !== undefined ? h.max_attempts : h.maxAttempts,
                    type: h.type
                  }))
                }))
              }))
              state.classChapters = sortClassChaptersLessons(mappedChapters)
              state.classChaptersClassId = classId
              state.classChaptersFetchedAt = Date.now()
            } else if (type === 'students') {
              state.students = Array.isArray(res) ? res : (res?.items || res?.students || [])
              state.studentsFetchedAt = Date.now()
            }
          })
        }

        // Active class & lesson handling for My Classes page
        if (hash === 'my-classes' || hash === 'student-dashboard') {
          if (classId) {

            if (lessonId) {
              let foundLesson = null
              for (const ch of state.classChapters) {
                const found = (ch.lessons || []).find(l => l.id === lessonId)
                if (found) {
                  foundLesson = found
                  break
                }
              }

              if (foundLesson && Array.isArray(foundLesson.homeworks) && foundLesson.homeworks.length > 0) {
                state.activeLessonHomeworks = foundLesson.homeworks
              } else {
                try {
                  const rawHomeworks = await api.getHomeworks(lessonId)
                  if (isStale()) return
                  const mappedHws = (rawHomeworks || []).map(h => ({
                    id: h.id,
                    title: h.title,
                    lessonId: h.lesson_id || h.lessonId || lessonId,
                    pdfPath: h.pdf_path || h.pdfPath,
                    durationMinutes: h.duration_minutes !== undefined ? h.duration_minutes : (h.durationMinutes !== undefined ? h.durationMinutes : 45),
                    passScore: h.pass_score !== undefined ? h.pass_score : (h.passScore !== undefined ? h.passScore : 5),
                    maxScore: h.max_score !== undefined ? h.max_score : (h.maxScore !== undefined ? h.maxScore : 10),
                    deadline: h.deadline,
                    maxAttempts: h.max_attempts !== undefined ? h.max_attempts : h.maxAttempts,
                    type: h.type
                  }))
                  state.activeLessonHomeworks = mappedHws
                  if (foundLesson) {
                    foundLesson.homeworks = mappedHws
                  }
                } catch (err) {
                  console.error('[App] Failed to fetch homeworks for lesson:', err)
                  state.activeLessonHomeworks = foundLesson?.homeworks || []
                }
              }
            } else {
              state.activeLessonHomeworks = []
            }
          } else {
            state.classChapters = []
            state.activeLessonHomeworks = []
          }
        }
      }

      // Eager curriculum loader removed - now lazily loaded inside my-classes and curriculum views

      // 4. Fetch Dashboard Overview and Submissions (for Admin Dashboard)
      if (hash === 'admin-dashboard') {
        const dashboardData = await api.getDashboard()
        if (isStale()) return
        state.dashboard = dashboardData || { overview: {}, recentSubmissions: [] }
      }

      // 5. Fetch submission details for review view
      if (hash === 'assignment-review') {
        const submissionId = params.get('submissionId')
        const currentSubId = state.lastSubmissionResult?.submissionId || state.lastSubmissionResult?.submission?.id
        if (submissionId && currentSubId !== submissionId) {
          const detail = await api.getStudentHistory(`submissionId=${submissionId}`)
          if (isStale()) return
          if (detail && !detail.error) {
            state.lastSubmissionResult = detail
          }
        }
      }

      // 6. Fetch Submissions (for Student History page)
      if (hash === 'history') {
        const result = await api.getStudentHistory()
        if (isStale()) return
        const historyList = result?.history || []
        state.submissions = historyList.map(s => {
          return {
            id: s.submissionId,
            homeworkTitle: s.homeworkTitle || 'Bài tập',
            lesson: s.lessonTitle || 'Bài tập chủ đề',
            lessonId: s.lessonId,
            chapterTitle: s.chapterTitle || 'Chương học',
            chapterId: s.chapterId,
            className: s.className || 'Lớp học',
            classId: s.classId,
            submittedAt: new Date(s.submittedAt).toLocaleString('vi-VN'),
            score: s.score,
            maxScore: s.maxScore,
            correctCount: s.correctCount,
            wrongCount: s.wrongCount,
            isPassed: s.isPassed,
            durationSecondsTaken: s.durationSecondsTaken || 0,
            status: 'ĐÃ CHẤM'
          }
        })
      }

      // 7. Fetch Admin History & Tracking Data
      if (hash === 'admin-history') {
        const mode = params.get('mode') || (params.get('classId') === 'TRIAL' ? 'trial' : '') || ''
        const classId = params.get('classId') || ''
        // Chỉ khôi phục homeworkId khi URL có dấu hiệu user tự chọn bài (pick=1).
        // Link/Lịch sử vào trang hoặc link cũ chứa homeworkId không được tự chọn bài.
         const homeworkId = routeModule.resolveHistoryHomeworkId?.(params) || ''
        const page = Math.max(1, parseInt(params.get('page') || '1', 10) || 1)
        const search = params.get('search') || ''

        if (!state.classes || state.classes.length === 0) {
          try {
            const rawClasses = await api.getClasses()
            if (isStale()) return
            state.classes = (rawClasses || []).map(c => ({
              id: c.id,
              name: c.name,
              gradeBlock: c.gradeBlock || c.grade_block || '12-Toán',
              studentsCount: c.studentsCount || 0,
              tuitionFee: c.tuitionFee || 0,
              progress: 0
            }))
          } catch (e) {}
        }

        // In class mode, no class selected => all classes (backend default)
        const targetClassId = (mode === 'trial' || classId === 'TRIAL')
          ? 'TRIAL'
          : (classId || '')

         if (routeModule.loadAdminHistoryData) await routeModule.loadAdminHistoryData(targetClassId, homeworkId, mode, { page, search })
        if (isStale()) return
      }
    } catch (err) {
      console.warn('[Router] Failed to pre-fetch real data from backend:', err.message)
    }
  }

  if (isStale()) return

  const app = document.getElementById('app')
  if (app) {
    syncDocumentTheme(hash)
    try {
       app.innerHTML = renderRoute()
    } catch (renderErr) {
      console.error(`[Router] Error rendering view for route "${hash}":`, renderErr)
      app.innerHTML = `
        <div class="app-layout">
          ${renderSidebar(hash)}
          <div class="main-content">
            ${renderNavbar('Lỗi tải trang')}
            <div class="content-body" style="padding: 40px; text-align: center;">
              <div style="font-size: 48px; color: #ef4444; margin-bottom: 16px;"><i class="fa-solid fa-triangle-exclamation"></i></div>
              <h2 style="font-size: 20px; font-weight: 700; margin-bottom: 8px;">Đã xảy ra lỗi khi tải trang</h2>
              <p style="color: #64748b; margin-bottom: 24px;">${renderErr?.message || 'Không thể hiển thị nội dung trang này.'}</p>
              <button class="btn-primary" onclick="window.location.reload()" style="width: auto; margin: 0 auto; cursor: pointer;">Tải lại trang</button>
            </div>
          </div>
        </div>
      `
      return
    }
    // Keep desktop navigation visible; start with a closed drawer on touch widths.
    const layout = app.querySelector('.app-layout')
    if (layout) {
      layout.dataset.route = hash
      layout.dataset.role = state.user?.role || 'GUEST'
      // Desktop navigation uses an icon rail that expands over the content
      // on hover. Touch widths keep the existing drawer behaviour below.
      layout.classList.toggle('sidebar-hover-expand', window.innerWidth > 1024 && !!state.token)
      applyThemeClasses(layout, hash)
      layout.classList.toggle('sidebar-collapsed', window.innerWidth <= 1024)
      const toggle = layout.querySelector('#sidebar-toggle-btn')
      toggle?.setAttribute('aria-expanded', String(!layout.classList.contains('sidebar-collapsed')))
      toggle?.setAttribute('aria-label', layout.classList.contains('sidebar-collapsed') ? 'Mở menu điều hướng' : 'Đóng menu điều hướng')
    }
    // Exam room has its own root, with or without a surrounding app layout.
    app.querySelectorAll('.exam-room-layout').forEach(el => applyExamThemeClasses(el, hash))
    try {
      bindRoute()
    } catch (bindErr) {
      console.error(`[Router] Error binding events for route "${hash}":`, bindErr)
    }
    // Chip chuỗi ngày học trên header Mochi: dùng cache 60s của progress-widgets nên không gọi API mỗi lần đổi trang.
    if (state.user?.role === 'STUDENT' && app.querySelector('[data-progress-slot]')) {
      import('./components/progress-widgets.js')
        .then(mod => mod.fetchStudentAchievements())
        .then(data => { if (!isStale()) import('./components/progress-widgets.js').then(mod => mod.updateNavbarStreak(data)) })
        .catch(() => {})
    }
  }
}

// Several student views replace #app directly when a filter changes. Restore
// the router's theme/role hooks on the new root without rerendering its state.
window.addEventListener('DOMContentLoaded', () => {
  const app = document.getElementById('app')
  if (!app) return
  let lastLayout = app.firstElementChild
  new MutationObserver(() => {
    const layout = app.firstElementChild
    if (!layout || layout === lastLayout) return
    lastLayout = layout
    const hash = resolveActiveRouteHash()
    const shell = layout.matches('.app-layout') ? layout : null
    if (shell) {
      shell.dataset.route = hash
      shell.dataset.role = state.user?.role || 'GUEST'
      shell.classList.toggle('sidebar-hover-expand', window.innerWidth > 1024 && !!state.token)
      shell.classList.toggle('sidebar-collapsed', window.innerWidth <= 1024)
      const toggle = shell.querySelector('#sidebar-toggle-btn')
      toggle?.setAttribute('aria-expanded', String(!shell.classList.contains('sidebar-collapsed')))
      toggle?.setAttribute('aria-label', shell.classList.contains('sidebar-collapsed') ? 'Mở menu điều hướng' : 'Đóng menu điều hướng')
    }
    syncThemeClassesToDom()
  }).observe(app, { childList: true })
})

window.addEventListener('hashchange', router)
window.addEventListener('DOMContentLoaded', router)

window.addEventListener('resize', () => {
  const layout = document.querySelector('.app-layout')
  if (!layout) return
  const wasDesktop = layout.classList.contains('sidebar-hover-expand')
  const desktop = window.innerWidth > 1024
  layout.classList.toggle('sidebar-hover-expand', desktop && !!state.token)
  if (desktop) layout.classList.remove('sidebar-collapsed')
  else if (wasDesktop) layout.classList.add('sidebar-collapsed')
  const toggle = layout.querySelector('#sidebar-toggle-btn')
  toggle?.setAttribute('aria-expanded', String(!layout.classList.contains('sidebar-collapsed')))
  toggle?.setAttribute('aria-label', layout.classList.contains('sidebar-collapsed') ? 'Mở menu điều hướng' : 'Đóng menu điều hướng')
})

// Global event delegation for Collapsible Sidebar Toggle Button & Navigation auto-hide
document.addEventListener('click', (e) => {
  const toggleBtn = e.target.closest('#sidebar-toggle-btn')
  if (toggleBtn) {
    const layout = document.querySelector('.app-layout')
    if (layout) {
      layout.classList.toggle('sidebar-collapsed')
      toggleBtn.setAttribute('aria-expanded', String(!layout.classList.contains('sidebar-collapsed')))
      toggleBtn.setAttribute('aria-label', layout.classList.contains('sidebar-collapsed') ? 'Mở menu điều hướng' : 'Đóng menu điều hướng')
    }
    return
  }

  // Auto-hide sidebar when clicking any navigation link in sidebar
  const navItem = e.target.closest('.sidebar .nav-item')
  if (window.innerWidth <= 1024 && navItem && !navItem.id?.includes('logout')) {
    const layout = document.querySelector('.app-layout')
    if (layout) {
      layout.classList.add('sidebar-collapsed')
      document.getElementById('sidebar-toggle-btn')?.setAttribute('aria-expanded', 'false')
    }
    return
  }

  // Mobile / iPad backdrop click outside sidebar to close sidebar
  if (window.innerWidth <= 1024) {
    const layout = document.querySelector('.app-layout')
    const sidebar = document.querySelector('.sidebar')
    if (layout && !layout.classList.contains('sidebar-collapsed') && sidebar) {
      if (!sidebar.contains(e.target) && !e.target.closest('#sidebar-toggle-btn')) {
        layout.classList.add('sidebar-collapsed')
        document.getElementById('sidebar-toggle-btn')?.setAttribute('aria-expanded', 'false')
      }
    }
  }
})

document.addEventListener('keydown', event => {
  if (event.key !== 'Escape' || window.innerWidth > 1024) return
  const layout = document.querySelector('.app-layout')
  if (layout && !layout.classList.contains('sidebar-collapsed')) {
    layout.classList.add('sidebar-collapsed')
    const toggle = document.getElementById('sidebar-toggle-btn')
    toggle?.setAttribute('aria-expanded', 'false')
    toggle?.focus()
  }
})
