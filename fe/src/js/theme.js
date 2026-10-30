// Site-wide theme preference. Dark is the default ("giao diện mới");
// light restores the original light design on every screen.
const STORAGE_KEY = 'eduportal-theme'
const STUDENT_STORAGE_KEY = 'eduportal-student-theme'
const DEFAULT_THEME = 'dark'
const CHANGE_EVENT = 'eduportal:themechange'
let currentTheme
let studentPreference = readStudentPreference()

function normalizeTheme(value) {
  return value === 'light' || value === 'dark' ? value : DEFAULT_THEME
}

function readStoredTheme() {
  try { return normalizeTheme(localStorage.getItem(STORAGE_KEY)) } catch (_) { return DEFAULT_THEME }
}

function readStudentPreference() {
  try {
    const value = localStorage.getItem(STUDENT_STORAGE_KEY)
    return ['dark', 'light', 'pastel'].includes(value) ? value : null
  } catch (_) { return null }
}

export function getStudentTheme() {
  return studentPreference || getTheme()
}

function notifyThemeChange() {
  document.dispatchEvent(new CustomEvent(CHANGE_EVENT, {
    detail: { theme: getTheme(), studentTheme: getStudentTheme() }
  }))
}

export function updateStudentThemePicker() {
  const selected = getStudentTheme()
  document.querySelectorAll?.('[data-student-theme-picker]').forEach(picker => {
    picker.value = selected
  })
}

export function renderStudentThemePicker(extraClass = '') {
  const selected = getStudentTheme()
  return `<label class="student-theme-picker${extraClass ? ` ${extraClass}` : ''}">
    <span>Giao diện học sinh</span>
    <select data-student-theme-picker aria-label="Giao diện học sinh">
      <option value="dark"${selected === 'dark' ? ' selected' : ''}>Tối</option>
      <option value="light"${selected === 'light' ? ' selected' : ''}>Sáng</option>
      <option value="pastel"${selected === 'pastel' ? ' selected' : ''}>Hồng pastel</option>
    </select>
  </label>`
}

function applyStudentPreference(preference) {
  const previous = getStudentTheme()
  studentPreference = preference
  const next = getStudentTheme()
  document.documentElement.dataset.studentTheme = next
  updateStudentThemePicker()
  if (previous !== next) notifyThemeChange()
  return next
}

export function setStudentTheme(theme) {
  // Invalid values must not replace a valid preference.
  if (!['dark', 'light', 'pastel'].includes(theme)) return getStudentTheme()
  try { localStorage.setItem(STUDENT_STORAGE_KEY, theme) } catch (_) {}
  return applyStudentPreference(theme)
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
  updateStudentThemePicker()
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

// Delegated once so views can re-render the button without rebinding.
document.addEventListener('click', (event) => {
  if (!event.target.closest?.('[data-theme-toggle]')) return
  toggleTheme()
})

document.addEventListener('change', event => {
  if (!event.target.matches?.('[data-student-theme-picker]')) return
  setStudentTheme(event.target.value)
  updateStudentThemePicker()
})

window.addEventListener('storage', (event) => {
  if (event.key === STUDENT_STORAGE_KEY || event.key === null) {
    applyStudentPreference(event.key === null ? readStudentPreference()
      : (['dark', 'light', 'pastel'].includes(event.newValue) ? event.newValue : null))
  }
  if (event.key !== STORAGE_KEY && event.key !== null) return
  applyTheme(event.key === STORAGE_KEY ? normalizeTheme(event.newValue) : readStoredTheme())
})

applyTheme()
