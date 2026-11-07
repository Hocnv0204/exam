import { state } from './state.js'

const UI_STORAGE_KEY = 'eduportal-ui'

export const ADMIN_PRO_ROUTES = new Set([
  'admin-dashboard', 'students', 'grade-blocks', 'classes', 'classes-admin',
  'curriculum', 'create-homework', 'homework', 'homework-mgmt', 'admin-history',
  'question-bank', 'question-appeals', 'exam-proctoring', 'tuition-ledger',
  'activity-logs', 'trial-management', 'class-details', 'student-details',
  'student-report', 'assignment-review', 'weekly-calendar'
])

export const MOCHI_FEATURES = Object.freeze({
  streak: true,
  xp: true,
  badges: true,
  leaderboard: true
})

function queryUI() {
  try {
    const search = new URLSearchParams(window.location.search || '')
    return search.get('ui')
  } catch (_) {
    return null
  }
}

export function isMochiUI() {
  const requested = queryUI()
  try {
    if (requested === 'mochi') {
      localStorage.setItem(UI_STORAGE_KEY, 'mochi')
      return true
    }
    if (requested === 'classic') {
      // Lưu lựa chọn quay về giao diện cũ (Mochi là mặc định nên phải ghi nhớ opt-out).
      localStorage.setItem(UI_STORAGE_KEY, 'classic')
      return false
    }
    // Mochi là mặc định; chỉ tắt khi người dùng đã chọn giao diện cũ.
    return localStorage.getItem(UI_STORAGE_KEY) !== 'classic'
  } catch (_) {
    return requested !== 'classic'
  }
}

export function isAdminProUI() {
  return state.user?.role === 'ADMIN' && isMochiUI()
}

let stylesPromise
export function loadMochiStyles() {
  // Unit-test/SSR documents have no head; route/flag state can still be tested
  // without asking Node to import CSS modules.
  if (!document.createElement || !document.head) return Promise.resolve([])
  if (!stylesPromise) {
    stylesPromise = Promise.all([
      import('../css/mochi/tokens.css'),
      import('../css/mochi/components.css'),
      import('../css/mochi/student-pages.css')
    ])
  }
  if (!document.querySelector?.('[data-mochi-fonts]')) {
    const link = document.createElement('link')
    link.rel = 'stylesheet'
    link.href = 'https://fonts.googleapis.com/css2?family=Baloo+2:wght@500;600;700;800&family=Nunito:wght@400;600;700;800&display=swap&subset=vietnamese'
    link.dataset.mochiFonts = ''
    document.head.append(link)
  }
  return stylesPromise
}

let adminStylesPromise
export function loadAdminProStyles() {
  if (!document.createElement || !document.head) return Promise.resolve([])
  if (!adminStylesPromise) {
    adminStylesPromise = Promise.all([
      import('../css/admin-pro/tokens.css'),
      import('../css/admin-pro/components.css')
    ])
  }
  // Dùng chung đúng bộ font với Mochi học sinh, không chèn link trùng.
  if (!document.querySelector?.('[data-mochi-fonts]')) {
    const link = document.createElement('link')
    link.rel = 'stylesheet'
    link.href = 'https://fonts.googleapis.com/css2?family=Baloo+2:wght@500;600;700;800&family=Nunito:wght@400;600;700;800&display=swap&subset=vietnamese'
    link.dataset.mochiFonts = ''
    document.head.append(link)
  }
  return adminStylesPromise
}

export function syncAdminProUI(adminRoute) {
  const enabled = Boolean(adminRoute) && isAdminProUI()
  if (enabled) {
    document.documentElement.dataset.adminUi = 'pro'
    loadAdminProStyles()
  } else {
    delete document.documentElement.dataset.adminUi
  }
  return enabled
}

export function syncMochiUI(studentRoute) {
  // Always resolve the query so ?ui=classic also clears a saved flag while an
  // admin/public route is open; only the document attribute is student-only.
  const requested = isMochiUI()
  const enabled = Boolean(studentRoute) && requested
  if (enabled) {
    document.documentElement.dataset.ui = 'mochi'
    loadMochiStyles()
  } else {
    delete document.documentElement.dataset.ui
  }
  return enabled
}
