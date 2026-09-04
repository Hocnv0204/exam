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

const routes = {
  login: { render: renderLoginView, bind: bindLoginEvents },
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
  'homework-mgmt': { render: renderHomeworkMgmtView, bind: bindHomeworkMgmtEvents }
}

async function router() {
  const hashUrl = window.location.hash.replace('#', '')
  const [routePath, queryString] = hashUrl.split('?')
  const params = new URLSearchParams(queryString || '')
  
  const defaultPage = state.token ? (state.user?.role === 'ADMIN' ? 'admin-dashboard' : 'my-classes') : 'login'
  let hash = routePath || defaultPage

  // Route Guard: Access Control based on Role
  if (state.token && state.user) {
    const adminOnlyRoutes = ['admin-dashboard', 'students', 'classes-admin', 'curriculum', 'create-homework', 'admin-history', 'homework-mgmt']
    const studentOnlyRoutes = ['my-classes', 'homework-attempt', 'history']
    
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
      // Fetch Homework Attempt Details dynamically
      if (hash === 'homework-attempt') {
        const homeworkId = params.get('homeworkId')
        if (homeworkId) {
          const hwData = await api.getHomeworkDetail(homeworkId)
          state.currentHomework = hwData
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

      // 1. Fetch Classes & Chapters for My Classes and Admin pages
      if (['classes-admin', 'students', 'curriculum', 'create-homework', 'my-classes', 'class-details', 'student-details'].includes(hash)) {
        const classId = hash === 'my-classes' ? params.get('classId') : null
        const lessonId = hash === 'my-classes' ? params.get('lessonId') : null

        state.classChaptersCache = state.classChaptersCache || {}
        const needClasses = (!state.classes || state.classes.length === 0 || hash === 'classes-admin')
        const needChapters = classId ? !state.classChaptersCache[classId] : false

        if (needClasses && needChapters) {
          // Parallel fetch on cold reload!
          const [rawClasses, rawChapters] = await Promise.all([
            api.getClasses(),
            api.getChapters(classId, true)
          ])
          state.classes = (rawClasses || []).map(c => ({
            id: c.id,
            name: c.name,
            studentsCount: c.studentsCount || 0,
            tuitionFee: c.tuitionFee || 0,
            progress: 0
          }))
          state.classChaptersCache[classId] = (rawChapters || []).map(ch => ({
            id: ch.id,
            code: `CHƯƠNG ${ch.order_index || ''}`.trim(),
            title: ch.title,
            lessons: (ch.lessons || []).map(l => ({
              id: l.id,
              code: `${ch.order_index || 1}.${l.order_index || 1}`,
              title: l.title,
              videoUrl: l.video_url || '',
              theoryFiles: l.theory_files || [],
              content: l.content,
              homeworks: (l.homeworks || []).map(h => ({
                id: h.id,
                title: h.title,
                lessonId: h.lesson_id || l.id,
                pdfPath: h.pdf_path,
                durationMinutes: h.duration_minutes !== undefined ? h.duration_minutes : 45,
                passScore: h.pass_score !== undefined ? h.pass_score : 5,
                maxScore: h.max_score !== undefined ? h.max_score : 10,
                deadline: h.deadline,
                maxAttempts: h.max_attempts,
                type: h.type
              }))
            }))
          }))
        } else {
          if (needClasses) {
            const rawClasses = await api.getClasses()
            state.classes = (rawClasses || []).map(c => ({
              id: c.id,
              name: c.name,
              studentsCount: c.studentsCount || 0,
              tuitionFee: c.tuitionFee || 0,
              progress: 0
            }))
          }
          if (needChapters) {
            const rawChapters = await api.getChapters(classId, true)
            state.classChaptersCache[classId] = (rawChapters || []).map(ch => ({
              id: ch.id,
              code: `CHƯƠNG ${ch.order_index || ''}`.trim(),
              title: ch.title,
              lessons: (ch.lessons || []).map(l => ({
                id: l.id,
                code: `${ch.order_index || 1}.${l.order_index || 1}`,
                title: l.title,
                videoUrl: l.video_url || '',
                theoryFiles: l.theory_files || [],
                content: l.content,
                homeworks: (l.homeworks || []).map(h => ({
                  id: h.id,
                  title: h.title,
                  lessonId: h.lesson_id || l.id,
                  pdfPath: h.pdf_path,
                  durationMinutes: h.duration_minutes !== undefined ? h.duration_minutes : 45,
                  passScore: h.pass_score !== undefined ? h.pass_score : 5,
                  maxScore: h.max_score !== undefined ? h.max_score : 10,
                  deadline: h.deadline,
                  maxAttempts: h.max_attempts,
                  type: h.type
                }))
              }))
            }))
          }
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
              } else if (foundLesson && Array.isArray(foundLesson.homeworks) && foundLesson.homeworks.length === 0) {
                state.activeLessonHomeworks = []
              } else {
                const rawHomeworks = await api.getHomeworks(lessonId)
                state.activeLessonHomeworks = (rawHomeworks || []).map(h => ({
                  id: h.id,
                  title: h.title,
                  lessonId: h.lesson_id || h.lessonId,
                  pdfPath: h.pdf_path || h.pdfPath,
                  durationMinutes: h.duration_minutes !== undefined ? h.duration_minutes : (h.durationMinutes || 45),
                  passScore: h.pass_score !== undefined ? h.pass_score : (h.passScore || 5),
                  maxScore: h.max_score !== undefined ? h.max_score : (h.maxScore || 10),
                  deadline: h.deadline
                }))
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

      // 2. Fetch Students (for Student Management, Class Management)
      if (['students', 'classes-admin', 'class-details', 'student-details'].includes(hash)) {
        if (!state.students || state.students.length === 0) {
          const students = await api.getStudents()
          state.students = students || []
        }

        // Count student profiles associated with each class to populate studentsCount
        state.classes.forEach(c => {
          c.studentsCount = state.students.filter(s => s.classIds ? s.classIds.includes(c.id) : (s.classId === c.id)).length
        })
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
        if (submissionId) {
          const detail = await api.getStudentHistory(`submissionId=${submissionId}`)
          state.lastSubmissionResult = detail
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

      // 7. Fetch Admin History & Tracking Data (Parallelized with Classes loader, no extra students call)
      if (hash === 'admin-history') {
        const classId = params.get('classId') || ''
        const homeworkId = params.get('homeworkId') || ''

        const loadClassesTask = (!state.classes || state.classes.length === 0)
          ? api.getClasses().then(rawClasses => {
              state.classes = (rawClasses || []).map(c => ({
                id: c.id,
                name: c.name,
                studentsCount: c.studentsCount || 0,
                tuitionFee: c.tuitionFee || 0,
                progress: 0
              }))
            })
          : Promise.resolve()

        await Promise.all([
          loadClassesTask,
          loadAdminHistoryData(classId, homeworkId)
        ])
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

