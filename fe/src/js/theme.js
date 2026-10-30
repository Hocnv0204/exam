// Site-wide theme preference. Dark is the default ("giao diện mới");
// light restores the original light design on every screen.
const STORAGE_KEY = 'eduportal-theme'
const DEFAULT_THEME = 'dark'
const CHANGE_EVENT = 'eduportal:themechange'
let currentTheme

function normalizeTheme(value) {
  return value === 'light' || value === 'dark' ? value : DEFAULT_THEME
}

function readStoredTheme() {
  try { return normalizeTheme(localStorage.getItem(STORAGE_KEY)) } catch (_) { return DEFAULT_THEME }
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
  if (previous && previous !== next) document.dispatchEvent(new CustomEvent(CHANGE_EVENT, { detail: { theme: next } }))
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

window.addEventListener('storage', (event) => {
  if (event.key !== STORAGE_KEY && event.key !== null) return
  applyTheme(event.key === STORAGE_KEY ? normalizeTheme(event.newValue) : readStoredTheme())
})

applyTheme()
