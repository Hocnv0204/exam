import { renderSidebar, bindSidebarEvents } from '../components/sidebar.js'
import { renderNavbar } from '../components/navbar.js'
import { state } from '../state.js'
import { api } from '../api.js'
import { showToast } from '../components/toast.js'

export function renderClassDetailsView() {
  const hashUrl = window.location.hash.replace('#', '')
  const [_, queryString] = hashUrl.split('?')
  const params = new URLSearchParams(queryString || '')
  const classId = params.get('classId')

  const currentClass = state.classes.find(c => c.id === classId)
  if (!currentClass) {
    return `
      <div class="app-layout">
        ${renderSidebar('classes-admin')}
        <div class="main-content">
          ${renderNavbar('Nền tảng / Bảng điều khiển')}
          <div class="content-body">
            <div class="card" style="text-align:center; padding:40px; color:#ef4444;">
              <i class="fa-solid fa-triangle-exclamation" style="font-size:36px; margin-bottom:12px;"></i>
              <p style="font-weight:600;">Không tìm thấy thông tin lớp học!</p>
              <a href="#classes-admin" class="btn-primary" style="display:inline-block; margin-top:16px; width:auto; text-decoration:none;">Quay lại danh sách lớp</a>
            </div>
          </div>
        </div>
      </div>
    `
  }

  // Filter students enrolled in this class
  const classStudents = state.students.filter(s => s.classIds ? s.classIds.includes(classId) : (s.classId === classId))

  return `
    <div class="app-layout">
      ${renderSidebar('classes-admin')}
      <div class="main-content">
        ${renderNavbar('Nền tảng / Chi tiết lớp học')}
        <div class="content-body">
          <!-- Back button and title -->
          <div style="margin-bottom:16px; display:flex; align-items:center; justify-content:space-between;">
            <a href="#classes-admin" class="btn-secondary" style="padding:6px 14px; font-size:13px; font-weight:600; text-decoration:none; display:inline-flex; align-items:center; gap:6px;">
              <i class="fa-solid fa-arrow-left"></i> Quay lại danh sách lớp học
            </a>
          </div>

          <!-- Class Banner Card -->
          <div class="card" style="background:linear-gradient(135deg, #ffffff 0%, #f0f7ff 100%); padding:24px; margin-bottom:24px; border:1px solid #e2e8f0; border-radius:16px;">
            <div style="display:flex; justify-content:space-between; align-items:center; flex-wrap:wrap; gap:16px;">
              <div style="display:flex; align-items:center; gap:20px;">
                <div style="width:60px; height:60px; background:#0066cc; color:#ffffff; border-radius:16px; display:flex; align-items:center; justify-content:center; font-size:28px;">
                  <i class="fa-solid fa-graduation-cap"></i>
                </div>
                <div>
                  <h1 class="page-title" style="font-size:24px; margin:0 0 4px 0; font-weight:800; color:#0f172a;">${currentClass.name}</h1>
                  <span style="font-size:12px; color:#64748b; font-family:monospace; background:#e2e8f0; padding:2px 8px; border-radius:6px;">ID: ${currentClass.id}</span>
                </div>
              </div>
              <div style="display:flex; gap:32px;">
                <div style="text-align:right;">
                  <div style="font-size:12px; color:#64748b; margin-bottom:4px;">Tổng học sinh</div>
                  <strong style="font-size:20px; color:#0f172a;"><i class="fa-solid fa-users" style="color:#64748b;"></i> ${classStudents.length}</strong>
                </div>
                <div style="text-align:right;">
                  <div style="font-size:12px; color:#64748b; margin-bottom:4px;">Học phí / Buổi</div>
                  <strong style="font-size:20px; color:#10b981;"><i class="fa-solid fa-money-bill-wave" style="color:#10b981;"></i> ${(currentClass.tuitionFee || 0).toLocaleString('vi-VN')} VND</strong>
                </div>
              </div>
            </div>
          </div>

          <!-- Roster Card -->
          <div class="card" style="padding:20px;">
            <h2 style="font-family:var(--font-heading); font-size:18px; font-weight:700; color:#0f172a; margin:0 0 16px 0; display:flex; align-items:center; gap:8px;">
              <i class="fa-solid fa-address-book" style="color:#0066cc;"></i> Danh sách học sinh của lớp
            </h2>

            <div class="table-responsive">
              <table class="data-table">
                <thead>
                  <tr>
                    <th>Họ và tên</th>
                    <th>Mã học sinh</th>
                    <th>Tên đăng nhập</th>
                    <th>Trạng thái</th>
                    <th>Thao tác</th>
                  </tr>
                </thead>
                <tbody>
                  ${classStudents.length === 0 ? `
                    <tr>
                      <td colspan="5" style="text-align:center; padding:32px; color:#64748b;">
                        <i class="fa-solid fa-users-slash" style="font-size:36px; color:#94a3b8; display:block; margin-bottom:12px;"></i>
                        Chưa có học sinh nào được phân vào lớp học này.
                      </td>
                    </tr>
                  ` : classStudents.map(s => {
                    const initials = s.fullName ? s.fullName.split(' ').map(n => n[0]).join('').substring(0, 2).toUpperCase() : 'HS'
                    return `
                      <tr>
                        <td>
                          <div class="student-info-cell">
                            <div class="avatar-circle">${initials}</div>
                            <div>
                              <div style="font-weight:700; color:#0f172a;">${s.fullName}</div>
                              <div style="font-size:12px; color:#64748b;">${s.email || `${s.username}@eduportal.vn`}</div>
                            </div>
                          </div>
                        </td>
                        <td style="font-family:monospace; font-weight:600; color:#334155;">${s.studentCode || 'N/A'}</td>
                        <td style="color:#64748b;">${s.username}</td>
                        <td>
                          <span class="badge badge-active">
                            <i class="fa-solid fa-circle" style="font-size:6px;"></i> Hoạt động
                          </span>
                        </td>
                        <td>
                          <div style="display:flex; align-items:center; gap:8px;">
                            <a href="#student-details?studentId=${s.id}&classId=${classId}" class="btn-primary" style="padding:6px 12px; font-size:12px; text-decoration:none; display:inline-flex; align-items:center; gap:6px; width:auto; cursor:pointer; border-radius:8px;">
                              <i class="fa-solid fa-calendar-day"></i> Gán lịch học & Học phí
                            </a>
                            <button class="btn-remove-from-class" data-student-id="${s.id}" data-student-name="${s.fullName}" style="padding:6px 12px; font-size:12px; width:auto; border-radius:8px; cursor:pointer; background:#ef4444; border:none; color:#ffffff; font-weight:600; display:inline-flex; align-items:center; gap:6px;">
                              <i class="fa-solid fa-user-minus"></i> Xóa khỏi lớp
                            </button>
                          </div>
                        </td>
                      </tr>
                    `
                  }).join('')}
                </tbody>
              </table>
            </div>
          </div>

          ${renderTelegramSection(currentClass)}
        </div>
      </div>
    </div>
  `
}

async function loadTelegramConfig(classId) {
  try {
    const config = await api.getTelegramConfig(classId)
    return config
  } catch (e) {
    console.error('Failed to load telegram config:', e)
    return null
  }
}

function renderTelegramSection(currentClass) {
  return `
    <div class="card" id="telegram-config-card" style="padding:20px; margin-top:24px;">
      <h2 style="font-family:var(--font-heading); font-size:18px; font-weight:700; color:#0f172a; margin:0 0 16px 0; display:flex; align-items:center; gap:8px;">
        <i class="fa-brands fa-telegram" style="color:#0088cc;"></i> Cấu hình Bot Telegram
      </h2>
      <div id="telegram-config-body">
        <div style="color:#64748b;">Đang tải cấu hình...</div>
      </div>
    </div>
  `
}

async function bindTelegramConfigEvents(classId) {
  const bodyEl = document.getElementById('telegram-config-body')
  if (!bodyEl) return

  const config = await loadTelegramConfig(classId)
  renderTelegramConfigUI(classId, config, bodyEl)

  // Bind copy button events
  bodyEl.querySelectorAll('.btn-copy-link').forEach(btn => {
    btn.onclick = () => {
      const text = btn.getAttribute('data-copy') || ''
      navigator.clipboard.writeText(text).then(() => {
        showToast('Đã sao chép lệnh vào clipboard', 'success')
      }).catch(() => {
        showToast('Sao chép thất bại', 'error')
      })
    }
  })
}

function renderTelegramConfigUI(classId, config, container) {
  const botUsername = (window.TELEGRAM_BOT_USERNAME || 'MyExamSystemBot').startsWith('@')
    ? window.TELEGRAM_BOT_USERNAME || 'MyExamSystemBot'
    : `@${window.TELEGRAM_BOT_USERNAME || 'MyExamSystemBot'}`

  if (!config) {
    container.innerHTML = `
      <div style="background:#f8fafc; border:1px dashed #cbd5e1; padding:16px; border-radius:12px;">
        <p style="margin:0 0 8px 0; color:#334155; font-weight:600;">Chưa liên kết Telegram</p>
        <p style="margin:0 0 12px 0; color:#64748b; font-size:13px;">
          Để nhận thông báo nộp bài, mời bot <strong>${botUsername}</strong> vào nhóm/kênh và gõ lệnh:
        </p>
        <div style="display:flex; align-items:center; gap:8px; background:#ffffff; border:1px solid #e2e8f0; padding:8px 12px; border-radius:8px;">
          <code style="flex:1; font-family:monospace; color:#0f172a;">/link ${classId}</code>
          <button class="btn-copy-link" data-copy="/link ${classId}" style="padding:6px 12px; font-size:12px; border-radius:8px; cursor:pointer; background:#0066cc; border:none; color:#ffffff; font-weight:600;">Copy</button>
        </div>
        <p style="margin:12px 0 0 0; color:#94a3b8; font-size:12px;">
          ID lớp học: <span style="font-family:monospace;">${classId}</span>
        </p>
      </div>
    `
    return
  }

  const statusLabel = config.is_enabled ? 'Đang bật' : 'Đã tắt'
  const statusColor = config.is_enabled ? '#10b981' : '#94a3b8'
  container.innerHTML = `
    <div style="background:#f8fafc; border:1px solid #e2e8f0; padding:16px; border-radius:12px;">
      <div style="display:flex; justify-content:space-between; align-items:center; flex-wrap:wrap; gap:12px;">
        <div>
          <div style="color:#334155; font-weight:600;">Nhóm/kênh: <span style="color:#0f172a;">${escapeHtml(config.chat_title || 'N/A')}</span></div>
          <div style="color:#64748b; font-size:13px; margin-top:4px;">Chat ID: <span style="font-family:monospace;">${escapeHtml(config.chat_id)}</span></div>
          <div style="color:#64748b; font-size:13px; margin-top:4px;">Trạng thái: <span style="color:${statusColor}; font-weight:600;">${statusLabel}</span></div>
        </div>
        <div style="display:flex; gap:8px; flex-wrap:wrap;">
          <button class="btn-toggle-telegram" data-enabled="true" style="padding:8px 12px; font-size:13px; border-radius:8px; cursor:pointer; background:#e2e8f0; border:none; color:#0f172a; font-weight:600;">Bật thông báo</button>
          <button class="btn-toggle-telegram" data-enabled="false" style="padding:8px 12px; font-size:13px; border-radius:8px; cursor:pointer; background:#e2e8f0; border:none; color:#0f172a; font-weight:600;">Tắt thông báo</button>
          <button class="btn-unlink-telegram" style="padding:8px 12px; font-size:13px; border-radius:8px; cursor:pointer; background:#ef4444; border:none; color:#ffffff; font-weight:600;">Hủy liên kết</button>
        </div>
      </div>
    </div>
  `

  container.querySelectorAll('.btn-toggle-telegram').forEach(btn => {
    btn.onclick = async () => {
      const enabled = btn.getAttribute('data-enabled') === 'true'
      showToast('Đang cập nhật cấu hình Telegram...', 'info')
      try {
        const updated = await api.updateTelegramConfig({
          classId,
          chatId: config.chat_id,
          chatTitle: config.chat_title,
          isEnabled: enabled,
        })
        showToast('Đã cập nhật trạng thái thông báo', 'success')
        renderTelegramConfigUI(classId, updated, container)
      } catch (e) {
        showToast(`Cập nhật thất bại: ${e.message}`, 'error')
      }
    }
  })

  const unlinkBtn = container.querySelector('.btn-unlink-telegram')
  if (unlinkBtn) {
    unlinkBtn.onclick = async () => {
      if (!confirm('Bạn có chắc muốn hủy liên kết Telegram của lớp học này?')) return
      showToast('Đang hủy liên kết...', 'info')
      try {
        await api.deleteTelegramConfig(classId)
        showToast('Đã hủy liên kết Telegram', 'success')
        renderTelegramConfigUI(classId, null, container)
      } catch (e) {
        showToast(`Hủy liên kết thất bại: ${e.message}`, 'error')
      }
    }
  }
}

function escapeHtml(str) {
  return String(str || '')
    .replace(/&/g, '&')
    .replace(/</g, '<')
    .replace(/>/g, '>')
    .replace(/"/g, '"')
}

export function bindClassDetailsEvents() {
  bindSidebarEvents()

  const hashUrl = window.location.hash.replace('#', '')
  const [_, queryString] = hashUrl.split('?')
  const params = new URLSearchParams(queryString || '')
  const classId = params.get('classId')

  // Telegram config bindings
  if (classId) {
    bindTelegramConfigEvents(classId)
  }

  document.querySelectorAll('.btn-remove-from-class').forEach(btn => {
    btn.onclick = async () => {
      const studentId = btn.getAttribute('data-student-id')
      const studentName = btn.getAttribute('data-student-name')
      
      if (confirm(`Bạn có chắc chắn muốn xóa học sinh ${studentName} ra khỏi lớp học này?`)) {
        try {
          showToast('Đang xóa học sinh khỏi lớp...', 'info')
          
          const studentObj = state.students.find(s => s.id === studentId)
          if (!studentObj) throw new Error('Không tìm thấy học sinh trong hệ thống')
          
          const currentClassIds = studentObj.classIds || (studentObj.classId ? [studentObj.classId] : [])
          const newClassIds = currentClassIds.filter(id => id !== classId)
          
          await api.updateStudent({
            studentId: studentId,
            fullName: studentObj.fullName,
            classIds: newClassIds
          })
          
          studentObj.classIds = newClassIds
          studentObj.classId = newClassIds[0] || null
          
          const classes = state.classes.filter(c => newClassIds.includes(c.id))
          studentObj.className = classes.map(c => c.name).join(', ') || 'Chưa phân lớp'
          
          const currentClass = state.classes.find(c => c.id === classId)
          if (currentClass) {
            currentClass.studentsCount = Math.max(0, currentClass.studentsCount - 1)
          }

          btn.closest('tr')?.remove()
          
          const totalCountEl = document.querySelector('strong[style*="color:#0f172a"]')
          if (totalCountEl) {
            const currentTotal = state.students.filter(s => s.classIds ? s.classIds.includes(classId) : (s.classId === classId)).length
            totalCountEl.innerHTML = `<i class="fa-solid fa-users" style="color:#64748b;"></i> ${currentTotal}`
          }

          showToast(`Đã xóa học sinh ${studentName} ra khỏi lớp`, 'success')
        } catch (e) {
          showToast(`Xóa thất bại: ${e.message}`, 'error')
        }
      }
    }
  })
}