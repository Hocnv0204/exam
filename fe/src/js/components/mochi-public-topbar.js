// Thanh trên cùng Mochi cho các trang công khai (lộ trình, học thử). CSS nằm trong
// css/mochi/roadmap.css (selector .m-roadmap .m-rm-*): gốc trang phải có class "m-roadmap"
// và thuộc tính data-roadmap-theme (token màu 4 chế độ).
import { escapeHtml } from '../utils/download-helper.js'
import { ROADMAP_SUBJECTS } from '../data/roadmaps/index.js'
import { renderMascot } from './mascot.js'
import { getStudentTheme, setStudentTheme, STUDENT_THEMES } from '../theme.js'

if (typeof document !== 'undefined' && document.head) {
  import('../../css/mochi/roadmap.css')
}

export const MOCHI_PUBLIC_THEMES = [
  { id: 'light', label: 'Sáng', colour: '#6A4CF0' },
  { id: 'dark', label: 'Tối', colour: '#141127' },
  { id: 'sakura', label: 'Sakura', colour: '#C2285F' },
  { id: 'mint', label: 'Bạc hà', colour: '#0A7A60' }
]

/**
 * @param {{ active: string }} opts  active = route của môn đang xem ('roadmap', 'roadmap-math-12', …) hoặc 'trial'
 */
export function renderMochiPublicTopbar({ active = '' } = {}) {
  const currentTheme = getStudentTheme()
  const brandRoute = ROADMAP_SUBJECTS.some(s => s.route === active) ? active : 'roadmap'
  const trialActive = active === 'trial'
  return `
    <header class="m-rm-topbar">
      <div class="m-rm-topbar-inner">
        <a href="#${escapeHtml(brandRoute)}" class="m-rm-brand" aria-label="EduPortal Trang chủ lộ trình">
          ${renderMascot({ mood: 'happy', size: 36 })}
          <span class="m-rm-brand-text">EduPortal</span>
        </a>

        <nav class="m-rm-nav" aria-label="Chọn môn học lộ trình">
          <div class="m-rm-tabs">
            ${ROADMAP_SUBJECTS.map(s => {
              const isActive = s.route === active
              return `
                <a href="#${escapeHtml(s.route)}" class="m-rm-tab${isActive ? ' is-active' : ''}" ${isActive ? 'aria-current="page"' : ''}>
                  <i class="fa-solid ${escapeHtml(s.icon)} m-rm-tab-icon" aria-hidden="true"></i>
                  <span class="m-rm-tab-info">
                    <span class="m-rm-tab-label">${escapeHtml(s.label)}</span>
                    <span class="m-rm-tab-tagline">${escapeHtml(s.tagline)}</span>
                  </span>
                </a>
              `
            }).join('')}
            <a href="#trial?tab=lessons" class="m-rm-tab m-rm-tab-trial${trialActive ? ' is-active' : ''}" ${trialActive ? 'aria-current="page"' : ''}>
              <i class="fa-solid fa-wand-magic-sparkles m-rm-tab-icon" aria-hidden="true"></i>
              <span class="m-rm-tab-info">
                <span class="m-rm-tab-label">Bài học thử</span>
                <span class="m-rm-tab-tagline">Học thử miễn phí</span>
              </span>
            </a>
          </div>
        </nav>

        <div class="m-rm-topbar-actions">
          <div class="m-rm-themes" role="group" aria-label="Chế độ màu">
            ${MOCHI_PUBLIC_THEMES.filter(t => STUDENT_THEMES.includes(t.id)).map(t => `
              <button type="button" class="m-rm-theme-btn" data-roadmap-theme-option="${t.id}" aria-pressed="${t.id === currentTheme}" aria-label="Chế độ ${t.label}" title="${t.label}">
                <span class="m-rm-theme-dot" style="--swatch:${t.colour}" aria-hidden="true"></span>
              </button>
            `).join('')}
          </div>
          <a href="#login" class="m-rm-login-btn">
            <i class="fa-solid fa-arrow-right-to-bracket" aria-hidden="true"></i>
            <span>Đăng nhập</span>
          </a>
        </div>
      </div>
    </header>
  `
}

/** Gắn bộ chọn màu: đổi data-roadmap-theme trên root, không render lại trang. */
export function bindMochiPublicTopbar(root) {
  if (!root?.querySelectorAll) return
  root.querySelectorAll('[data-roadmap-theme-option]').forEach(btn => {
    btn.addEventListener('click', () => {
      const nextTheme = setStudentTheme(btn.dataset.roadmapThemeOption)
      root.dataset.roadmapTheme = nextTheme
      root.querySelectorAll('[data-roadmap-theme-option]').forEach(b => {
        b.setAttribute('aria-pressed', String(b.dataset.roadmapThemeOption === nextTheme))
      })
    })
  })
}
