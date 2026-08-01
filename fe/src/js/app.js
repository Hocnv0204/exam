import { state } from './state.js'
import { api } from './api.js'
import { renderLoginView, bindLoginEvents } from './views/login.js'
import { renderMyClassesView, bindMyClassesEvents } from './views/my-classes.js'
import { renderClassMgmtView, bindClassMgmtEvents } from './views/class-mgmt.js'
import { renderStudentMgmtView, bindStudentMgmtEvents } from './views/student-mgmt.js'
import { renderCreateHwView, bindCreateHwEvents } from './views/create-hw.js'
import { renderCurriculumView, bindCurriculumEvents } from './views/curriculum.js'
import { renderHomeworkSolverView, bindHomeworkSolverEvents } from './views/homework-solver.js'
import { renderAssignmentReviewView, bindAssignmentReviewEvents } from './views/assignment-review.js'
import { renderLearningHistoryView, bindLearningHistoryEvents } from './views/learning-history.js'
import { renderAdminDashboardView, bindAdminDashboardEvents } from './views/admin-dashboard.js'
import { renderAdminHistoryView, bindAdminHistoryEvents } from './views/admin-history.js'
import { renderClassDetailsView, bindClassDetailsEvents } from './views/class-details.js'
import { renderStudentDetailsView, bindStudentDetailsEvents } from './views/student-details.js'

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
  'student-details': { render: renderStudentDetailsView, bind: bindStudentDetailsEvents }
}

async function router() {
  const hashUrl = window.location.hash.replace('#', '')
  const [routePath, queryString] = hashUrl.split('?')
  const params = new URLSearchParams(queryString || '')
  
  const defaultPage = state.token ? (state.user?.role === 'ADMIN' ? 'admin-dashboard' : 'my-classes') : 'login'
  let hash = routePath || defaultPage

  // Route Guard: Access Control based on Role
  if (state.token && state.user) {
    const adminOnlyRoutes = ['admin-dashboard', 'students', 'classes-admin', 'curriculum', 'create-homework', 'admin-history']
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
        }
      }

      // 1. Fetch Classes (for Class Management, Students dropdown, Curriculum, Homework Creation, My Classes)
      if (['classes-admin', 'students', 'curriculum', 'create-homework', 'my-classes', 'admin-dashboard', 'admin-history', 'class-details', 'student-details'].includes(hash)) {
        const rawClasses = await api.getClasses()
        state.classes = (rawClasses || []).map(c => {
          return {
            id: c.id,
            name: c.name,
            studentsCount: c.studentsCount || 0,
            tuitionFee: c.tuitionFee || 0,
            progress: 0
          }
        })

        // Eager load class details for students on My Classes page
        if (hash === 'my-classes') {
          const classId = params.get('classId')
          const lessonId = params.get('lessonId')
          if (classId) {
            const rawChapters = await api.getChapters(classId)
            const chapters = []
            for (const ch of (rawChapters || [])) {
              const rawLessons = await api.getLessons(ch.id)
              chapters.push({
                id: ch.id,
                code: `CHƯƠNG ${ch.order_index || ''}`.trim(),
                title: ch.title,
                lessons: (rawLessons || []).map(l => ({
                  id: l.id,
                  code: `${ch.order_index || 1}.${l.order_index || 1}`,
                  title: l.title,
                  videoUrl: l.video_url || '',
                  theoryFiles: l.theory_files || [],
                  content: l.content
                }))
              })
            }
            state.classChapters = chapters

            if (lessonId) {
              const rawHomeworks = await api.getHomeworks(lessonId)
              state.activeLessonHomeworks = (rawHomeworks || []).map(h => ({
                id: h.id,
                title: h.title,
                lessonId: h.lesson_id,
                pdfPath: h.pdf_path,
                durationMinutes: h.duration_minutes,
                passScore: h.pass_score,
                maxScore: h.max_score
              }))
            } else {
              state.activeLessonHomeworks = []
            }
          } else {
            state.classChapters = []
            state.activeLessonHomeworks = []
          }
        }
      }

      // 2. Fetch Students (for Student Management, Admin Dashboard, Class Management)
      if (['students', 'admin-dashboard', 'classes-admin', 'class-details', 'student-details'].includes(hash)) {
        const students = await api.getStudents()
        state.students = students || []
        
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
            lesson: 'Bài tập chủ đề',
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
    } catch (err) {
      console.warn('[Router] Failed to pre-fetch real data from backend:', err.message)
    }
  }

  const app = document.getElementById('app')
  if (app) {
    app.innerHTML = route.render()
    route.bind()
  }
}

window.addEventListener('hashchange', router)
window.addEventListener('DOMContentLoaded', router)

// Global event delegation for Collapsible Sidebar Toggle Button
document.addEventListener('click', (e) => {
  const toggleBtn = e.target.closest('#sidebar-toggle-btn')
  if (toggleBtn) {
    const layout = document.querySelector('.app-layout')
    if (layout) {
      layout.classList.toggle('sidebar-collapsed')
    }
  }
})

