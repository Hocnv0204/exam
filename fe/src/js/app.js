import { state } from './state.js'
import { api } from './api.js'
import { renderLoginView, bindLoginEvents } from './views/login.js'
import { renderMyClassesView, bindMyClassesEvents } from './views/my-classes.js'
import { renderClassMgmtView, bindClassMgmtEvents } from './views/class-mgmt.js'
import { renderStudentMgmtView, bindStudentMgmtEvents } from './views/student-mgmt.js'
import { renderCreateHwView, bindCreateHwEvents, resetCreateForm } from './views/create-hw.js'
import { renderCurriculumView, bindCurriculumEvents } from './views/curriculum.js'
import { renderHomeworkSolverView, bindHomeworkSolverEvents } from './views/homework-solver.js'
import { renderAssignmentReviewView, bindAssignmentReviewEvents } from './views/assignment-review.js'
import { renderLearningHistoryView, bindLearningHistoryEvents } from './views/learning-history.js'
import { renderAdminDashboardView, bindAdminDashboardEvents } from './views/admin-dashboard.js'
import { renderAdminHistoryView, bindAdminHistoryEvents, loadAdminHistoryData } from './views/admin-history.js'
import { renderClassDetailsView, bindClassDetailsEvents } from './views/class-details.js'
import { renderStudentDetailsView, bindStudentDetailsEvents } from './views/student-details.js'
import { renderHomeworkMgmtView, bindHomeworkMgmtEvents } from './views/homework-mgmt.js'
import { renderTrialView, bindTrialEvents } from './views/trial.js'
import { renderQuestionBankView, bindQuestionBankEvents } from './views/question-bank.js'
import { renderGradeBlocksView, bindGradeBlocksEvents, fetchGradeBlocksData } from './views/grade-blocks.js'
import { renderExamRoomView, bindExamRoomEvents } from './views/exam-room.js'
import { renderExamProctoringView, bindExamProctoringEvents } from './views/exam-proctoring.js'

const routes = {
  login: { render: renderLoginView, bind: bindLoginEvents },
  trial: { render: renderTrialView, bind: bindTrialEvents },
  roadmap: { render: renderTrialView, bind: bindTrialEvents },
  'my-classes': { render: renderMyClassesView, bind: bindMyClassesEvents },
  students: { render: renderStudentMgmtView, bind: bindStudentMgmtEvents },
  'classes-admin': { render: renderClassMgmtView, bind: bindClassMgmtEvents },
  'create-homework': { render: renderCreateHwView, bind: bindCreateHwEvents },
  curriculum: { render: renderCurriculumView, bind: bindCurriculumEvents },
  'homework-attempt': { render: renderHomeworkSolverView, bind: bindHomeworkSolverEvents },
  'assignment-review': { render: renderAssignmentReviewView, bind: bindAssignmentReviewEvents },
  history: { render: renderLearningHistoryView, bind: bindLearningHistoryEvents },
  'admin-dashboard': { render: renderAdminDashboardView, bind: bindAdminDashboardEvents },
  'admin-history': { render: renderAdminHistoryView, bind: bindAdminHistoryEvents },
  'class-details': { render: renderClassDetailsView, bind: bindClassDetailsEvents },
  'student-details': { render: renderStudentDetailsView, bind: bindStudentDetailsEvents },
  'homework-mgmt': { render: renderHomeworkMgmtView, bind: bindHomeworkMgmtEvents },
  'question-bank': { render: renderQuestionBankView, bind: bindQuestionBankEvents },
  'grade-blocks': { render: renderGradeBlocksView, bind: bindGradeBlocksEvents },
  'exam-room': { render: renderExamRoomView, bind: bindExamRoomEvents },
  'exam-proctoring': { render: renderExamProctoringView, bind: bindExamProctoringEvents }
}

async function router() {
  const hashUrl = window.location.hash.replace('#', '')
  const [routePath, queryString] = hashUrl.split('?')
  const params = new URLSearchParams(queryString || '')
  
  const defaultPage = state.token ? (state.user?.role === 'ADMIN' ? 'admin-dashboard' : 'my-classes') : 'roadmap'
  let hash = routePath || defaultPage

  // Guest & Unauthenticated Access Guard
  if (!state.token) {
    const isTrialMode = params.get('trial') === 'true' || hash === 'trial' || hash === 'roadmap'
    const guestRoutes = ['login', 'trial', 'roadmap', 'homework-attempt', 'assignment-review']
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
          state.currentHomework = hwData
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
  if (state.token && state.user) {
    const adminOnlyRoutes = ['admin-dashboard', 'students', 'grade-blocks', 'classes-admin', 'curriculum', 'create-homework', 'admin-history', 'homework-mgmt', 'question-bank', 'exam-proctoring']
    const studentOnlyRoutes = ['my-classes', 'homework-attempt', 'history', 'exam-room']
    
    if (state.user.role === 'STUDENT' && adminOnlyRoutes.includes(hash)) {
      window.location.hash = '#my-classes'
      return
    }
    if (state.user.role === 'ADMIN' && studentOnlyRoutes.includes(hash)) {
      window.location.hash = '#admin-dashboard'
      return
    }
  }

  const route = routes[hash] || routes['login']

  // Pre-fetch state data if user is logged in
  if (state.token) {
    try {
      // Fetch Exam Room Details dynamically
      if (hash === 'exam-room') {
        const homeworkId = params.get('homeworkId')
        if (homeworkId) {
          const hwData = await api.getHomeworkDetail(homeworkId)
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
          const hwData = await api.getHomeworkDetail(homeworkId)
          state.editHomeworkData = hwData
        } else {
          state.editHomeworkData = null
          resetCreateForm()
        }
      }

      // Fetch Grade Blocks dynamically
      if (hash === 'grade-blocks') {
        await fetchGradeBlocksData()
      }

      // 1. Fetch Classes & Chapters for My Classes and Admin pages
      // 1 & 2. Unified Parallel Pre-fetch for Classes, Chapters, and Students
      if (['classes-admin', 'students', 'curriculum', 'create-homework', 'my-classes', 'class-details', 'student-details', 'question-bank'].includes(hash)) {
        const classId = hash === 'my-classes' ? params.get('classId') : null
        const lessonId = hash === 'my-classes' ? params.get('lessonId') : null

        state.classChaptersCache = state.classChaptersCache || {}
        const needClasses = (!state.classes || state.classes.length === 0 || hash === 'classes-admin')
        const needChapters = classId ? !state.classChaptersCache[classId] : false
        const needStudents = ['students', 'classes-admin', 'class-details', 'student-details'].includes(hash) &&
          (!state.students || state.students.length === 0 || hash === 'students')

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
          taskTypes.forEach((type, idx) => {
            const res = results[idx]
            if (type === 'classes') {
              state.classes = (res || []).map(c => ({
                id: c.id,
                name: c.name,
                gradeBlock: c.gradeBlock || c.grade_block || '12-Toán',
                studentsCount: c.studentsCount || 0,
                tuitionFee: c.tuitionFee || 0,
                progress: 0
              }))
            } else if (type === 'chapters') {
              state.classChaptersCache[classId] = (res || []).map(ch => ({
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
            } else if (type === 'students') {
              state.students = res || []
            }
          })
        }

        // Count student profiles associated with each class
        if (state.students && state.classes) {
          state.classes.forEach(c => {
            c.studentsCount = state.students.filter(s => s.classIds ? s.classIds.includes(c.id) : (s.classId === c.id)).length
          })
        }

        // Active class & lesson handling for My Classes page
        if (hash === 'my-classes') {
          if (classId) {
            state.classChapters = state.classChaptersCache[classId] || []

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
        state.dashboard = dashboardData || { overview: {}, recentSubmissions: [] }
      }

      // 5. Fetch submission details for review view
      if (hash === 'assignment-review') {
        const submissionId = params.get('submissionId')
        const currentSubId = state.lastSubmissionResult?.submissionId || state.lastSubmissionResult?.submission?.id
        if (submissionId && currentSubId !== submissionId) {
          const detail = await api.getStudentHistory(`submissionId=${submissionId}`)
          if (detail && !detail.error) {
            state.lastSubmissionResult = detail
          }
        }
      }

      // 6. Fetch Submissions (for Student History page)
      if (hash === 'history') {
        const result = await api.getStudentHistory()
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
        const homeworkId = params.get('homeworkId') || ''

        if (!state.classes || state.classes.length === 0) {
          try {
            const rawClasses = await api.getClasses()
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

        // In class mode, default to the first class so the screen is never blank
        const targetClassId = (mode === 'trial' || classId === 'TRIAL')
          ? 'TRIAL'
          : (classId || (state.classes && state.classes.length > 0 ? state.classes[0].id : ''))

        await loadAdminHistoryData(targetClassId, homeworkId, mode)
      }
    } catch (err) {
      console.warn('[Router] Failed to pre-fetch real data from backend:', err.message)
    }
  }

  const app = document.getElementById('app')
  if (app) {
    app.innerHTML = route.render()
    route.bind()

    // Auto-hide sidebar on entering all pages
    const layout = app.querySelector('.app-layout')
    if (layout) {
      layout.classList.add('sidebar-collapsed')
    }
  }
}

window.addEventListener('hashchange', router)
window.addEventListener('DOMContentLoaded', router)

// Global event delegation for Collapsible Sidebar Toggle Button & Navigation auto-hide
document.addEventListener('click', (e) => {
  const toggleBtn = e.target.closest('#sidebar-toggle-btn')
  if (toggleBtn) {
    const layout = document.querySelector('.app-layout')
    if (layout) {
      layout.classList.toggle('sidebar-collapsed')
    }
    return
  }

  // Auto-hide sidebar when clicking any navigation link in sidebar
  const navItem = e.target.closest('.sidebar .nav-item')
  if (navItem && !navItem.id?.includes('logout')) {
    const layout = document.querySelector('.app-layout')
    if (layout) {
      layout.classList.add('sidebar-collapsed')
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
      }
    }
  }
})

