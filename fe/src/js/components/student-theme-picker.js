import { STUDENT_THEMES, getStudentTheme } from '../theme.js'

const THEMES = [
  { id: 'light', label: 'Sáng', colour: '#6A4CF0' },
  { id: 'dark', label: 'Tối', colour: '#141127' },
  { id: 'sakura', label: 'Sakura', colour: '#C2285F' },
  { id: 'mint', label: 'Bạc hà', colour: '#0A7A60' }
]

export function renderStudentThemePicker(extraClass = '') {
  const current = getStudentTheme()
  return `
    <div class="m-theme-picker${extraClass ? ` ${extraClass}` : ''}" role="group" aria-label="Chế độ màu">
      ${THEMES.filter(theme => STUDENT_THEMES.includes(theme.id)).map(theme => `
        <button type="button" class="m-theme-choice" data-student-theme-option="${theme.id}"
          aria-pressed="${theme.id === current}" aria-label="Chuyển sang chế độ ${theme.label}">
          <span class="m-theme-dot" style="--m-theme-swatch:${theme.colour}" aria-hidden="true"></span>
          <span class="m-theme-label">${theme.label}</span>
        </button>
      `).join('')}
    </div>
  `
}
