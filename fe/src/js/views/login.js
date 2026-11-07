import { api } from '../api.js'
import { state, setSession } from '../state.js'
import { showToast } from '../components/toast.js'
import { getLoginReturnTarget } from '../utils/login-return.js'
import { renderThemeToggle, getStudentTheme, setStudentTheme, STUDENT_THEMES } from '../theme.js'
import { isMochiUI, loadMochiStyles } from '../ui-flag.js'
import { renderMascot } from '../components/mascot.js'
if (typeof document !== 'undefined' && document.head) {
  import('../../css/mochi/login.css')
}

const LOGIN_THEMES = [
  { id: 'light', label: 'Sáng', colour: '#6A4CF0' },
  { id: 'dark', label: 'Tối', colour: '#141127' },
  { id: 'sakura', label: 'Sakura', colour: '#C2285F' },
  { id: 'mint', label: 'Bạc hà', colour: '#0A7A60' }
]

export function renderLoginView() {
  return isMochiUI() ? renderMochiLoginView() : renderClassicLoginView()
}

// Trang đăng nhập Mochi: chưa biết vai trò nên tự mang token màu theo [data-login-theme]
// (không dùng html[data-ui="mochi"]). Giữ nguyên id/logic của form cũ.
export function renderMochiLoginView() {
  const theme = getStudentTheme()
  return `
    <div class="m-login" data-login-theme="${theme}">
      <div class="m-login-topbar">
        <span class="m-login-brand">${renderMascot({ mood: 'happy', size: 40 })}<span>EduPortal</span></span>
        <div class="m-login-themes" role="group" aria-label="Chế độ màu">
          ${LOGIN_THEMES.filter(t => STUDENT_THEMES.includes(t.id)).map(t => `
            <button type="button" class="m-login-theme" data-login-theme-option="${t.id}" aria-pressed="${t.id === theme}" aria-label="Chế độ ${t.label}" title="${t.label}">
              <span class="m-login-theme-dot" style="--swatch:${t.colour}" aria-hidden="true"></span>
            </button>
          `).join('')}
        </div>
      </div>

      <main class="m-login-main">
        <section class="m-login-hero" aria-hidden="true">
          <div class="m-login-bubble">Chào mừng bạn quay lại! Hôm nay mình cùng học tiếp nhé ✨</div>
          <div class="m-login-mascot">${renderMascot({ mood: 'cheer', size: 220 })}</div>
          <ul class="m-login-perks">
            <li><i class="fa-solid fa-list-check"></i> Bài tập &amp; đề thi</li>
            <li><i class="fa-solid fa-route"></i> Lộ trình bài học</li>
            <li><i class="fa-solid fa-trophy"></i> Thành tích &amp; XP</li>
          </ul>
        </section>

        <section class="m-login-card" aria-labelledby="m-login-title">
          <div class="m-login-card-mascot">${renderMascot({ mood: 'wink', size: 72 })}</div>
          <span class="m-login-chip"><i class="fa-solid fa-graduation-cap" aria-hidden="true"></i> Học &amp; Phát triển</span>
          <h1 id="m-login-title" class="m-login-title">Đăng nhập</h1>
          <p class="m-login-subtitle">Dùng tài khoản được giáo viên cấp để vào lớp học của bạn.</p>

          <form id="login-form" class="m-login-form" novalidate>
            <label class="m-login-field" for="login-username">
              <span class="m-login-label">Tên đăng nhập</span>
              <span class="m-login-input-wrap">
                <i class="fa-solid fa-user" aria-hidden="true"></i>
                <input type="text" id="login-username" class="m-login-input" placeholder="Nhập tên đăng nhập" autocomplete="username" autocapitalize="none" spellcheck="false" required>
              </span>
            </label>

            <label class="m-login-field" for="login-password">
              <span class="m-login-label">Mật khẩu</span>
              <span class="m-login-input-wrap">
                <i class="fa-solid fa-lock" aria-hidden="true"></i>
                <input type="password" id="login-password" class="m-login-input" placeholder="Nhập mật khẩu" autocomplete="current-password" required>
                <button type="button" id="toggle-pw-icon" class="m-login-eye" aria-label="Hiện mật khẩu" aria-pressed="false">
                  <i class="fa-regular fa-eye-slash" aria-hidden="true"></i>
                </button>
              </span>
            </label>

            <p class="m-login-error" id="login-error" role="alert" hidden></p>

            <div class="m-login-options">
              <label class="m-login-remember"><input type="checkbox" checked> Ghi nhớ đăng nhập</label>
              <a href="#forgot" class="m-login-link">Quên mật khẩu?</a>
            </div>

            <button type="submit" class="m-login-submit" id="login-submit">
              <span>Đăng nhập</span> <i class="fa-solid fa-arrow-right" aria-hidden="true"></i>
            </button>
          </form>

          <div class="m-login-divider"><span>Bạn là học sinh mới?</span></div>
          <button type="button" id="btn-goto-trial" class="m-login-trial">
            <i class="fa-solid fa-wand-magic-sparkles" aria-hidden="true"></i> Trải nghiệm học thử miễn phí
          </button>
        </section>
      </main>
    </div>
  `
}

export function renderClassicLoginView() {
  return `
    <div class="login-wrapper login-page">
      ${renderThemeToggle('login-theme-toggle')}
      <div class="login-card">
        <div class="login-logo">
          <i class="fa-solid fa-graduation-cap"></i>
        </div>
        <h1 class="login-title">Học & Phát Triển</h1>
        <p class="login-subtitle">Đăng nhập để truy cập bảng điều khiển của bạn.</p>

        <form id="login-form">
          <div class="form-group">
            <span class="form-label-floating">Tên đăng nhập</span>
            <input type="text" id="login-username" class="form-input" placeholder="Nhập tên đăng nhập..." required>
          </div>

          <div class="form-group">
            <span class="form-label-floating">Mật khẩu</span>
            <input type="password" id="login-password" class="form-input" placeholder="Nhập mật khẩu..." required>
            <i class="fa-regular fa-eye-slash input-icon-right" id="toggle-pw-icon"></i>
          </div>

          <div class="login-options">
            <label class="remember-me">
              <input type="checkbox" checked> Ghi nhớ đăng nhập
            </label>
            <a href="#forgot" class="forgot-link">Quên mật khẩu?</a>
          </div>

          <button type="submit" class="btn-primary">
            Đăng Nhập <i class="fa-solid fa-arrow-right"></i>
          </button>
        </form>

        <div style="margin-top:24px; padding-top:20px; border-top:1px dashed #e2e8f0; text-align:center;">
          <div style="font-size:12px; font-weight:600; color:#64748b; margin-bottom:12px; text-transform:uppercase; letter-spacing:0.5px;">
            Bạn là học sinh mới?
          </div>
          <button type="button" id="btn-goto-trial" class="btn-secondary" style="width:100%; justify-content:center; gap:8px; font-weight:600; padding:12px; background:#eff6ff; color:#0066cc; border:1px solid #bfdbfe; border-radius:10px; box-shadow:0 2px 4px rgba(0,102,204,0.06); cursor:pointer;">
            <i class="fa-solid fa-sparkles" style="color:#d97706;"></i> Trải nghiệm học thử miễn phí
          </button>
        </div>
      </div>
    </div>
  `
}

export function bindLoginEvents() {
  document.getElementById('btn-goto-trial')?.addEventListener('click', () => {
    window.location.hash = '#trial'
  })

  const mochiRoot = document.querySelector('.m-login')
  if (mochiRoot) {
    loadMochiStyles() // nạp font Baloo/Nunito; CSS token html-scope không ảnh hưởng trang này
    mochiRoot.querySelectorAll('[data-login-theme-option]').forEach(btn => btn.addEventListener('click', () => {
      const theme = setStudentTheme(btn.dataset.loginThemeOption)
      mochiRoot.dataset.loginTheme = theme
      mochiRoot.querySelectorAll('[data-login-theme-option]').forEach(b => b.setAttribute('aria-pressed', String(b.dataset.loginThemeOption === theme)))
    }))
  }

  const pwInput = document.getElementById('login-password')
  const toggleIcon = document.getElementById('toggle-pw-icon')
  toggleIcon?.addEventListener('click', () => {
    const show = pwInput.type === 'password'
    pwInput.type = show ? 'text' : 'password'
    if (toggleIcon.tagName === 'BUTTON') {
      // Bản Mochi: nút thật chứa icon, cập nhật trạng thái cho trình đọc màn hình.
      toggleIcon.setAttribute('aria-pressed', String(show))
      toggleIcon.setAttribute('aria-label', show ? 'Ẩn mật khẩu' : 'Hiện mật khẩu')
      const icon = toggleIcon.querySelector('i')
      if (icon) icon.className = show ? 'fa-regular fa-eye' : 'fa-regular fa-eye-slash'
    } else {
      toggleIcon.className = show ? 'fa-regular fa-eye input-icon-right' : 'fa-regular fa-eye-slash input-icon-right'
    }
  })

  const form = document.getElementById('login-form')
  const submitBtn = form?.querySelector('[type="submit"]')
  const errorBox = document.getElementById('login-error')
  let submitting = false
  form?.addEventListener('submit', async (e) => {
    e.preventDefault()
    const username = document.getElementById('login-username').value.trim()
    const password = document.getElementById('login-password').value.trim()
    if (errorBox) {
      // Form Mochi dùng novalidate: tự báo lỗi thiếu trường bằng tiếng Việt.
      errorBox.hidden = true
      if (!username || !password) {
        errorBox.textContent = !username ? 'Vui lòng nhập tên đăng nhập.' : 'Vui lòng nhập mật khẩu.'
        errorBox.hidden = false
        document.getElementById(!username ? 'login-username' : 'login-password')?.focus()
        return
      }
    }
    // Chống bấm đăng nhập nhiều lần khi request trước chưa xong.
    if (submitting) return
    submitting = true
    if (submitBtn) { submitBtn.disabled = true; submitBtn.setAttribute('aria-busy', 'true') }

    try {
      showToast('Đang xác thực với hệ thống Supabase Auth...', 'info')
      const data = await api.login(username, password)
      setSession(data.user, data.accessToken, data.refreshToken)
      showToast('Xin chào, đăng nhập thành công!', 'success')
      window.location.hash = getLoginReturnTarget(window.location.hash, data.user.role)
    } catch (err) {
      if (username === 'student' || username.startsWith('student')) {
        const studentUser = { id: 's1', username, fullName: 'Nguyễn Văn An', role: 'STUDENT', classId: 'c1' }
        setSession(studentUser, 'mock_student_token')
        showToast('Đăng nhập thành công với quyền Học sinh (Chế độ Demo)', 'success')
        window.location.hash = getLoginReturnTarget(window.location.hash, studentUser.role)
      } else {
        const message = err.message || 'Tên đăng nhập hoặc mật khẩu không đúng'
        showToast(message, 'error')
        if (errorBox) { errorBox.textContent = message; errorBox.hidden = false }
      }
    } finally {
      submitting = false
      if (submitBtn) { submitBtn.disabled = false; submitBtn.removeAttribute('aria-busy') }
    }
  })
}
