const UI_STORAGE_KEY = 'eduportal-ui'

export const MOCHI_FEATURES = Object.freeze({
  streak: false,
  xp: false,
  badges: false,
  leaderboard: false
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
      localStorage.removeItem(UI_STORAGE_KEY)
      return false
    }
    return localStorage.getItem(UI_STORAGE_KEY) === 'mochi'
  } catch (_) {
    return requested === 'mochi'
  }
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
