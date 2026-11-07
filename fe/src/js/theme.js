// Site-wide admin/public preference. Student colours are stored independently.
const STORAGE_KEY = 'eduportal-theme'
const STUDENT_STORAGE_KEY = 'eduportal-student-theme'
const DEFAULT_THEME = 'dark'
export const STUDENT_THEMES = ['light', 'dark', 'sakura', 'mint']
const CHANGE_EVENT = 'eduportal:themechange'
let currentTheme
let studentDocumentEnabled = true

// Mặc định giữ navy tối như giao diện cũ (không theo prefers-color-scheme) để học
// sinh chưa từng chọn theme không bị đổi sang bảng màu sáng cũ khi chưa bật Mochi.
function preferredStudentTheme() {
  return 'dark'
}

function normalizeTheme(value) {
  return value === 'light' || value === 'dark' ? value : DEFAULT_THEME
}

function normalizeStudentTheme(value) {
  if (value === 'pastel') return 'sakura'
  return STUDENT_THEMES.includes(value) ? value : preferredStudentTheme()
}

function readStoredTheme() {
  try { return normalizeTheme(localStorage.getItem(STORAGE_KEY)) } catch (_) { return DEFAULT_THEME }
}

function readStudentPreference() {
  const fallback = preferredStudentTheme()
  try {
    const stored = localStorage.getItem(STUDENT_STORAGE_KEY)
    const normalized = normalizeStudentTheme(stored)
    if (stored !== normalized) localStorage.setItem(STUDENT_STORAGE_KEY, normalized)
    return normalized
  } catch (_) {
    return fallback
  }
}

let studentPreference = readStudentPreference()

export function getStudentTheme() {
  return STUDENT_THEMES.includes(studentPreference) ? studentPreference : preferredStudentTheme()
}

/**
 * Giao diện CŨ chỉ có 2 skin học sinh (navy tối, hồng). 'light'/'mint' là bảng màu của
 * giao diện Mochi; khi Mochi tắt chúng phải hiển thị như navy tối, không rơi về palette
 * sáng cũ.
 */
export function getClassicStudentTheme() {
  return getStudentTheme() === 'sakura' ? 'sakura' : 'dark'
}

export function applyStudentThemeToDocument(enabled = true) {
  studentDocumentEnabled = Boolean(enabled)
  if (studentDocumentEnabled) document.documentElement.dataset.studentTheme = getStudentTheme()
  else delete document.documentElement.dataset.studentTheme
}

function notifyThemeChange() {
  document.dispatchEvent(new CustomEvent(CHANGE_EVENT, {
    detail: { theme: getTheme(), studentTheme: getStudentTheme() }
  }))
}

// Kept for existing classic navigation. It remains a compact two-state control
// while the Mochi picker exposes all four student palettes.
function studentToggleTargets() {
  // Nút gạt 2 trạng thái của giao diện cũ dựa trên skin đang HIỂN THỊ (light/mint = navy).
  const toSakura = getClassicStudentTheme() === 'dark'
  return {
    toSakura,
    iconClass: toSakura ? 'fa-palette' : 'fa-moon',
    label: toSakura ? 'Hồng Sakura' : 'Giao diện tối',
    action: toSakura ? 'Chuyển sang giao diện Sakura' : 'Chuyển sang giao diện tối'
  }
}

export function updateStudentThemeToggle() {
  const { toSakura, iconClass, label, action } = studentToggleTargets()
  document.querySelectorAll?.('[data-student-theme-toggle]').forEach((btn) => {
    btn.setAttribute('aria-label', action)
    btn.setAttribute('title', action)
    btn.setAttribute('aria-pressed', String(!toSakura))
    const icon = btn.querySelector('i')
    if (icon) icon.className = `fa-solid ${iconClass}`
    const text = btn.querySelector('.theme-toggle-label')
    if (text) text.textContent = label
  })
}

export function renderStudentThemeToggle(extraClass = '') {
  const { toSakura, iconClass, label, action } = studentToggleTargets()
  return `
    <button type="button" class="theme-toggle student-theme-toggle${extraClass ? ` ${extraClass}` : ''}" data-student-theme-toggle
      aria-label="${action}" title="${action}" aria-pressed="${!toSakura}">
      <i class="fa-solid ${iconClass}" aria-hidden="true"></i>
      <span class="theme-toggle-label">${label}</span>
    </button>
  `
}

function applyStudentPreference(preference, { persist = false } = {}) {
  const previous = getStudentTheme()
  studentPreference = normalizeStudentTheme(preference)
  const next = getStudentTheme()
  if (persist) {
    try { localStorage.setItem(STUDENT_STORAGE_KEY, next) } catch (_) {}
  }
  applyStudentThemeToDocument(studentDocumentEnabled)
  updateStudentThemeToggle()
  updateStudentThemePicker()
  if (previous !== next) notifyThemeChange()
  return next
}

export function setStudentTheme(theme) {
  if (!STUDENT_THEMES.includes(theme)) return getStudentTheme()
  return applyStudentPreference(theme, { persist: true })
}

export function toggleStudentTheme() {
  return setStudentTheme(getClassicStudentTheme() === 'dark' ? 'sakura' : 'dark')
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
  currentTheme = next
  document.documentElement.dataset.theme = next
  document.documentElement.style.colorScheme = next
  updateToggleButtons()
  updateStudentThemeToggle()
  updateStudentThemePicker()
  if (previous && previous !== next) notifyThemeChange()
  return next
}

export function setTheme(theme) {
  const next = normalizeTheme(theme)
  try { localStorage.setItem(STORAGE_KEY, next) } catch (_) {}
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

export function updateStudentThemePicker() {
  const current = getStudentTheme()
  document.querySelectorAll?.('[data-student-theme-option]').forEach((button) => {
    button.setAttribute('aria-pressed', String(button.dataset.studentThemeOption === current))
  })
}

document.addEventListener('click', (event) => {
  const option = event.target.closest?.('[data-student-theme-option]')
  if (option) {
    setStudentTheme(option.dataset.studentThemeOption)
    return
  }
  if (event.target.closest?.('[data-student-theme-toggle]')) {
    toggleStudentTheme()
    return
  }
  if (!event.target.closest?.('[data-theme-toggle]')) return
  toggleTheme()
})

window.addEventListener('storage', (event) => {
  if (event.key === STUDENT_STORAGE_KEY || event.key === null) {
    const next = event.key === null ? readStudentPreference() : normalizeStudentTheme(event.newValue)
    applyStudentPreference(next, { persist: event.newValue !== next })
  }
  if (event.key !== STORAGE_KEY && event.key !== null) return
  applyTheme(event.key === STORAGE_KEY ? normalizeTheme(event.newValue) : readStoredTheme())
})

applyTheme()
