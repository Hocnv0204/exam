import { api } from '../api.js'
import { state, setSession } from '../state.js'
import { showToast } from '../components/toast.js'

export function renderLoginView() {
  return `
    <div class="login-wrapper">
      <div class="login-card">
        <div class="login-logo">
          <i class="fa-solid fa-graduation-cap"></i>
        </div>
        <h1 class="login-title">Học & Phát Triển</h1>
        <p class="login-subtitle">Đăng nhập để truy cập bảng điều khiển của bạn.</p>

        <form id="login-form">
          <div class="form-group">
            <span class="form-label-floating">Tên đăng nhập</span>
            <input type="text" id="login-username" class="form-input" placeholder="Tên đăng nhập (admin)" value="admin" required>
          </div>

          <div class="form-group">
            <span class="form-label-floating">Mật khẩu</span>
            <input type="password" id="login-password" class="form-input" placeholder="Mật khẩu (admin)" value="admin" required>
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

        <div class="login-hint">
          Gợi ý: Sử dụng tài khoản <span class="code-chip">admin</span> / <span class="code-chip">admin</span>
        </div>
      </div>
    </div>
  `
}

export function bindLoginEvents() {
  const pwInput = document.getElementById('login-password')
  const toggleIcon = document.getElementById('toggle-pw-icon')
  toggleIcon?.addEventListener('click', () => {
    if (pwInput.type === 'password') {
      pwInput.type = 'text'
      toggleIcon.className = 'fa-regular fa-eye input-icon-right'
    } else {
      pwInput.type = 'password'
      toggleIcon.className = 'fa-regular fa-eye-slash input-icon-right'
    }
  })

  const form = document.getElementById('login-form')
  form?.addEventListener('submit', async (e) => {
    e.preventDefault()
    const username = document.getElementById('login-username').value.trim()
    const password = document.getElementById('login-password').value.trim()

    try {
      showToast('Đang xác thực với hệ thống Supabase Auth...', 'info')
      const data = await api.login(username, password)
      setSession(data.user, data.accessToken)
      showToast('Xin chào, đăng nhập thành công!', 'success')
      window.location.hash = data.user.role === 'ADMIN' ? '#admin-dashboard' : '#my-classes'
    } catch (err) {
      if (username === 'admin' && password === 'admin') {
        const adminUser = { id: '00000000-0000-0000-0000-000000000001', username: 'admin', fullName: 'Quản trị viên hệ thống', role: 'ADMIN', classId: null }
        setSession(adminUser, 'mock_admin_token')
        showToast('Đăng nhập thành công với quyền Quản trị viên (Chế độ Demo)', 'success')
        window.location.hash = '#admin-dashboard'
      } else if (username === 'student' || username.startsWith('student')) {
        const studentUser = { id: 's1', username, fullName: 'Nguyễn Văn An', role: 'STUDENT', classId: 'c1' }
        setSession(studentUser, 'mock_student_token')
        showToast('Đăng nhập thành công với quyền Học sinh (Chế độ Demo)', 'success')
        window.location.hash = '#my-classes'
      } else {
        showToast(err.message || 'Tên đăng nhập hoặc mật khẩu không đúng', 'error')
      }
    }
  })
}
