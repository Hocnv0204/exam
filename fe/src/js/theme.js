// Site-wide theme preference. Dark is the default ("giao diện mới");
// light restores the original light design on every screen.
const STORAGE_KEY = 'eduportal-theme'
const STUDENT_STORAGE_KEY = 'eduportal-student-theme'
const DEFAULT_THEME = 'dark'
// Students only ever get the navy dark skin or the rose pastel skin. The old
// 'light' value (and any unknown/missing one) maps back to navy dark, always
// independent of the global admin/public dark/light preference.
const STUDENT_THEMES = ['dark', 'pastel']
const DEFAULT_STUDENT_THEME = 'dark'
const CHANGE_EVENT = 'eduportal:themechange'
let currentTheme
let studentPreference = readStudentPreference()

function normalizeTheme(value) {
  return value === 'light' || value === 'dark' ? value : DEFAULT_THEME
}

function normalizeStudentTheme(value) {
  return value === 'pastel' ? 'pastel' : DEFAULT_STUDENT_THEME
}

function readStoredTheme() {
  try { return normalizeTheme(localStorage.getItem(STORAGE_KEY)) } catch (_) { return DEFAULT_THEME }
}

function readStudentPreference() {
  try {
    const stored = localStorage.getItem(STUDENT_STORAGE_KEY)
    const normalized = normalizeStudentTheme(stored)
    // Persist the migration so a legacy 'light'/unknown value cannot resurface.
    if (stored !== normalized) localStorage.setItem(STUDENT_STORAGE_KEY, normalized)
    return normalized
  } catch (_) { return DEFAULT_STUDENT_THEME }
}

export function getStudentTheme() {
  return STUDENT_THEMES.includes(studentPreference) ? studentPreference : DEFAULT_STUDENT_THEME
}

function notifyThemeChange() {
  document.dispatchEvent(new CustomEvent(CHANGE_EVENT, {
    detail: { theme: getTheme(), studentTheme: getStudentTheme() }
  }))
}

// The student switch reuses the admin toggle pattern: a real <button> whose
// icon/label describe the mode it switches TO, so no popup and no rerender.
function studentToggleTargets() {
  const current = getStudentTheme()
  const toPastel = current === 'dark'
  return {
    current,
    toPastel,
    iconClass: toPastel ? 'fa-palette' : 'fa-moon',
    label: toPastel ? 'Hồng pastel' : 'Giao diện tối',
    action: toPastel ? 'Chuyển sang giao diện hồng pastel' : 'Chuyển sang giao diện tối'
  }
}

export function updateStudentThemeToggle() {
  const { toPastel, iconClass, label, action } = studentToggleTargets()
  document.querySelectorAll?.('[data-student-theme-toggle]').forEach((btn) => {
    btn.setAttribute('aria-label', action)
    btn.setAttribute('title', action)
    btn.setAttribute('aria-pressed', String(!toPastel))
    const icon = btn.querySelector('i')
    if (icon) icon.className = `fa-solid ${iconClass}`
    const text = btn.querySelector('.theme-toggle-label')
    if (text) text.textContent = label
  })
}

export function renderStudentThemeToggle(extraClass = '') {
  const { toPastel, iconClass, label, action } = studentToggleTargets()
  return `
    <button type="button" class="theme-toggle student-theme-toggle${extraClass ? ` ${extraClass}` : ''}" data-student-theme-toggle
      aria-label="${action}" title="${action}" aria-pressed="${!toPastel}">
      <i class="fa-solid ${iconClass}" aria-hidden="true"></i>
      <span class="theme-toggle-label">${label}</span>
    </button>
  `
}

function applyStudentPreference(preference) {
  const previous = getStudentTheme()
  studentPreference = normalizeStudentTheme(preference)
  const next = getStudentTheme()
  document.documentElement.dataset.studentTheme = next
  updateStudentThemeToggle()
  if (previous !== next) notifyThemeChange()
  return next
}

export function setStudentTheme(theme) {
  // 'light' and unknown values are no longer part of the student palette; they
  // must not replace a valid navy/pastel preference.
  if (!STUDENT_THEMES.includes(theme)) return getStudentTheme()
  try { localStorage.setItem(STUDENT_STORAGE_KEY, theme) } catch (_) {}
  return applyStudentPreference(theme)
}

export function toggleStudentTheme() {
  return setStudentTheme(getStudentTheme() === 'dark' ? 'pastel' : 'dark')
}

export function getTheme() {
  if (currentTheme) return currentTheme
  return readStoredTheme()
}

export function isDarkTheme() {
  return getTheme() === 'dark'
}

export function applyTheme(theme = getTheme()) {
  const next = normalizeTheme(theme)
  const previous = document.documentElement.dataset.theme
  const previousStudent = getStudentTheme()
  currentTheme = next
  document.documentElement.dataset.theme = next
  document.documentElement.style.colorScheme = next
  document.documentElement.dataset.studentTheme = getStudentTheme()
  updateToggleButtons()
  updateStudentThemeToggle()
  if ((previous && previous !== next) || previousStudent !== getStudentTheme()) notifyThemeChange()
  return next
}

export function setTheme(theme) {
  const next = normalizeTheme(theme)
  try {
    localStorage.setItem(STORAGE_KEY, next)
  } catch (_) {}
  return applyTheme(next)
}

export function toggleTheme() {
  const next = getTheme() === 'dark' ? 'light' : 'dark'
  setTheme(next)
  return next
}

export function renderThemeToggle(extraClass = '') {
  const dark = getTheme() === 'dark'
  return `
    <button type="button" class="theme-toggle${extraClass ? ` ${extraClass}` : ''}" data-theme-toggle
      aria-label="${dark ? 'Chuyển sang giao diện sáng' : 'Chuyển sang giao diện tối'}"
      title="${dark ? 'Chuyển sang giao diện sáng' : 'Chuyển sang giao diện tối'}" aria-pressed="${!dark}">
      <i class="fa-solid ${dark ? 'fa-sun' : 'fa-moon'}" aria-hidden="true"></i>
      <span class="theme-toggle-label">${dark ? 'Giao diện sáng' : 'Giao diện tối'}</span>
    </button>
  `
}

export function updateToggleButtons() {
  const dark = getTheme() === 'dark'
  const actionLabel = dark ? 'Chuyển sang giao diện sáng' : 'Chuyển sang giao diện tối'
  document.querySelectorAll?.('[data-theme-toggle]').forEach((btn) => {
    btn.setAttribute('aria-label', actionLabel)
    btn.setAttribute('title', actionLabel)
    btn.setAttribute('aria-pressed', String(!dark))
    const icon = btn.querySelector('i')
    if (icon) icon.className = `fa-solid ${dark ? 'fa-sun' : 'fa-moon'}`
    const label = btn.querySelector('.theme-toggle-label')
    if (label) label.textContent = dark ? 'Giao diện sáng' : 'Giao diện tối'
  })
}

// Delegated once so views can re-render the button without rebinding. The
// student switch is its own control: toggling only repaints classes/attributes
// (never a route), so exam drafts and answers stay in memory.
document.addEventListener('click', (event) => {
  if (event.target.closest?.('[data-student-theme-toggle]')) {
    toggleStudentTheme()
    return
  }
  if (!event.target.closest?.('[data-theme-toggle]')) return
  toggleTheme()
})

window.addEventListener('storage', (event) => {
  if (event.key === STUDENT_STORAGE_KEY || event.key === null) {
    // Cross-tab writes are normalized too: a legacy 'light' maps to navy dark.
    applyStudentPreference(event.key === null ? readStudentPreference()
      : normalizeStudentTheme(event.newValue))
  }
  if (event.key !== STORAGE_KEY && event.key !== null) return
  applyTheme(event.key === STORAGE_KEY ? normalizeTheme(event.newValue) : readStoredTheme())
})

applyTheme()
