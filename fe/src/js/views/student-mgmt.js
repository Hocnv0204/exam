import { renderSidebar, bindSidebarEvents } from '../components/sidebar.js'
import { renderNavbar } from '../components/navbar.js'
import { openModal } from '../components/modal.js'
import { showToast } from '../components/toast.js'
import { state } from '../state.js'
import { api } from '../api.js'

export function renderStudentMgmtView() {
  const students = state.students

  return `
    <div class="app-layout">
      ${renderSidebar('students')}
      <div class="main-content">
        ${renderNavbar('Nền tảng / Bảng điều khiển')}
        <div class="content-body">
          <div class="page-header">
            <div>
              <h1 class="page-title">Quản lý học sinh</h1>
              <p class="page-description">Quản lý tài khoản học sinh, phân lớp và quyền truy cập.</p>
            </div>
            <button class="btn-primary" id="open-create-student-btn" onclick="window.showCreateStudentModal()" style="width:auto; cursor:pointer;">
              <i class="fa-solid fa-user-plus"></i> Tạo học sinh mới
            </button>
          </div>

          <div class="card">
            <!-- Filter Bar -->
            <div style="display:flex; gap:16px; margin-bottom:20px; align-items:center;">
              <div class="search-box" style="width:320px;">
                <i class="fa-solid fa-magnifying-glass"></i>
                <input type="text" id="student-search-input" placeholder="Tìm theo tên hoặc mã học sinh...">
              </div>
              <select id="class-filter-select" style="padding:10px 14px; border:1px solid var(--border-color); border-radius:10px; font-size:14px; outline:none; background:#ffffff;">
                <option value="">Tất cả các lớp</option>
                ${state.classes.map(c => `<option value="${c.id}">${c.name}</option>`).join('')}
              </select>
              <button class="btn-secondary" style="margin-left:auto;"><i class="fa-solid fa-sliders"></i> Bộ lọc khác</button>
            </div>

            <!-- Student Data Table -->
            <div class="table-responsive">
              <table class="data-table">
                <thead>
                  <tr>
                    <th>Họ và tên <i class="fa-solid fa-arrow-down-short-wide"></i></th>
                    <th>Mã học sinh</th>
                    <th>Lớp học</th>
                    <th>Trạng thái</th>
                    <th>Ngày tạo</th>
                    <th>Thao tác</th>
                  </tr>
                </thead>
                <tbody id="students-table-body">
                  ${students.map(s => renderStudentRow(s)).join('')}
                </tbody>
              </table>
            </div>

            <!-- Pagination Bar -->
            <div style="display:flex; align-items:center; justify-content:space-between; margin-top:20px; font-size:13px; color:#64748b;">
              <div id="student-count-summary">Hiển thị 1 đến ${students.length} trong tổng số ${students.length} học sinh</div>
              <div style="display:flex; gap:6px; align-items:center;">
                <button class="btn-secondary" style="padding:4px 10px;">&lt;</button>
                <button class="btn-primary" style="width:auto; padding:4px 12px; border-radius:6px;">1</button>
                <button class="btn-secondary" style="padding:4px 10px;">2</button>
                <button class="btn-secondary" style="padding:4px 10px;">3</button>
                <span>...</span>
                <button class="btn-secondary" style="padding:4px 10px;">12</button>
                <button class="btn-secondary" style="padding:4px 10px;">&gt;</button>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  `
}

function renderStudentRow(s) {
  const initials = s.fullName.split(' ').map(n => n[0]).join('').substring(0, 2).toUpperCase()
  return `
    <tr id="row-student-${s.id}">
      <td>
        <div class="student-info-cell">
          <div class="avatar-circle">${initials}</div>
          <div>
            <div style="font-weight:700; color:#0f172a;">${s.fullName}</div>
            <div style="font-size:12px; color:#64748b;">${s.email || `${s.username}@eduportal.vn`}</div>
          </div>
        </div>
      </td>
      <td style="font-family:monospace; font-weight:600; color:#334155;">${s.studentCode || 'STU-8942'}</td>
      <td>
        <span style="background:#e0f2fe; color:#0369a1; padding:4px 10px; border-radius:6px; font-size:12px; font-weight:600;">
          ${s.className}
        </span>
      </td>
      <td>
        <span class="badge ${s.status === 'Hoạt động' ? 'badge-active' : 'badge-inactive'}">
          <i class="fa-solid fa-circle" style="font-size:6px;"></i> ${s.status || 'Hoạt động'}
        </span>
      </td>
      <td style="color:#64748b;">${s.createdAt || 'Mới khởi tạo'}</td>
      <td>
        <div style="display:flex; gap:10px;">
          <button class="btn-reset-pw" data-id="${s.id}" data-name="${s.fullName}" title="Đặt lại mật khẩu" style="background:none; border:none; color:#0066cc; cursor:pointer;"><i class="fa-solid fa-key"></i></button>
          <button class="btn-delete-student" data-id="${s.id}" data-name="${s.fullName}" title="Xóa" style="background:none; border:none; color:#ef4444; cursor:pointer;"><i class="fa-solid fa-trash"></i></button>
        </div>
      </td>
    </tr>
  `
}

export function showCreateStudentModal() {
  const classOptionsHTML = state.classes.length > 0 
    ? state.classes.map(c => `<option value="${c.id}">${c.name}</option>`).join('')
    : `<option value="">Chưa có lớp học</option>`

  const modalHTML = `
    <form id="create-student-modal-form" onsubmit="return false;" style="display:flex; flex-direction:column; gap:16px;">
      <div>
        <label style="font-size:13px; font-weight:600; color:#334155; display:block; margin-bottom:6px;">
          <i class="fa-regular fa-user" style="color:#0066cc;"></i> Tên đăng nhập (Username) <span style="color:#ef4444;">*</span>
        </label>
        <input type="text" id="modal-student-username" class="form-input" placeholder="Ví dụ: nguyen_van_a" required>
      </div>

      <div>
        <label style="font-size:13px; font-weight:600; color:#334155; display:block; margin-bottom:6px;">
          <i class="fa-solid fa-lock" style="color:#0066cc;"></i> Mật khẩu (Password) <span style="color:#ef4444;">*</span>
        </label>
        <input type="password" id="modal-student-password" class="form-input" placeholder="Tối thiểu 6 ký tự" required>
      </div>

      <div>
        <label style="font-size:13px; font-weight:600; color:#334155; display:block; margin-bottom:6px;">
          <i class="fa-solid fa-id-card" style="color:#0066cc;"></i> Tên học sinh (Họ và tên) <span style="color:#ef4444;">*</span>
        </label>
        <input type="text" id="modal-student-fullname" class="form-input" placeholder="Ví dụ: Nguyễn Văn An" required>
      </div>

      <div>
        <label style="font-size:13px; font-weight:600; color:#334155; display:block; margin-bottom:6px;">
          <i class="fa-solid fa-graduation-cap" style="color:#0066cc;"></i> Chọn lớp học (Danh sách lớp đã có) <span style="color:#ef4444;">*</span>
        </label>
        <select id="modal-student-class" class="form-input" style="background:#ffffff; cursor:pointer;" required>
          ${classOptionsHTML}
        </select>
      </div>
    </form>
  `

  openModal('Tạo Học Sinh Mới', modalHTML, async () => {
    const username = document.getElementById('modal-student-username')?.value.trim()
    const password = document.getElementById('modal-student-password')?.value.trim()
    const fullName = document.getElementById('modal-student-fullname')?.value.trim()
    const classId = document.getElementById('modal-student-class')?.value

    if (!username || !password || !fullName || !classId) {
      showToast('Vui lòng nhập đầy đủ Username, Password, Tên học sinh và Chọn lớp!', 'error')
      return false
    }

    const selectedClass = state.classes.find(c => c.id === classId)
    const className = selectedClass ? selectedClass.name : 'Toán 11'

    try {
      showToast('Đang tạo tài khoản học sinh...', 'info')
      const createdData = await api.createStudent({ username, password, fullName, classId })
      const newStudent = {
        id: createdData.id || ('s_' + Date.now()),
        username,
        fullName,
        studentCode: 'STU-' + Math.floor(1000 + Math.random() * 9000),
        email: `${username}@eduportal.vn`,
        className,
        classId,
        status: 'Hoạt động',
        createdAt: new Date().toLocaleDateString('vi-VN')
      }
      state.students.unshift(newStudent)
      updateTable(newStudent)
      showToast(`Tạo thành công học sinh "${fullName}" cho lớp ${className}!`, 'success')
    } catch (err) {
      const newStudent = {
        id: 's_' + Date.now(),
        username,
        fullName,
        studentCode: 'STU-' + Math.floor(1000 + Math.random() * 9000),
        email: `${username}@eduportal.vn`,
        className,
        classId,
        status: 'Hoạt động',
        createdAt: new Date().toLocaleDateString('vi-VN')
      }
      state.students.unshift(newStudent)
      updateTable(newStudent)
      showToast(`Tạo thành công học sinh "${fullName}" cho lớp ${className}! (Chế độ Demo)`, 'success')
    }
  })
}

window.showCreateStudentModal = showCreateStudentModal

export function bindStudentMgmtEvents() {
  bindSidebarEvents()
  bindTableActionEvents()

  const createBtn = document.getElementById('open-create-student-btn')
  if (createBtn) {
    createBtn.addEventListener('click', (e) => {
      e.preventDefault()
      showCreateStudentModal()
    })
  }

  const searchInput = document.getElementById('student-search-input')
  const filterSelect = document.getElementById('class-filter-select')

  const filterStudents = () => {
    const query = searchInput?.value.toLowerCase().trim() || ''
    const selectedClass = filterSelect?.value || ''

    const filtered = state.students.filter(s => {
      const matchQuery = !query || s.fullName.toLowerCase().includes(query) || (s.studentCode && s.studentCode.toLowerCase().includes(query)) || (s.username && s.username.toLowerCase().includes(query))
      const matchClass = !selectedClass || s.classId === selectedClass
      return matchQuery && matchClass
    })

    const tbody = document.getElementById('students-table-body')
    if (tbody) {
      tbody.innerHTML = filtered.map(s => renderStudentRow(s)).join('')
    }

    const summary = document.getElementById('student-count-summary')
    if (summary) {
      summary.textContent = `Hiển thị 1 đến ${filtered.length} trong tổng số ${state.students.length} học sinh`
    }

    bindTableActionEvents()
  }

  searchInput?.addEventListener('input', filterStudents)
  filterSelect?.addEventListener('change', filterStudents)
}

function updateTable(newStudent) {
  const tbody = document.getElementById('students-table-body')
  if (tbody) {
    const tempDiv = document.createElement('tbody')
    tempDiv.innerHTML = renderStudentRow(newStudent)
    if (tempDiv.firstElementChild) {
      tbody.prepend(tempDiv.firstElementChild)
    }
  }

  const summary = document.getElementById('student-count-summary')
  if (summary) {
    summary.textContent = `Hiển thị 1 đến ${state.students.length} trong tổng số ${state.students.length} học sinh`
  }

  bindTableActionEvents()
}

function bindTableActionEvents() {
  document.querySelectorAll('.btn-reset-pw').forEach(btn => {
    btn.onclick = () => {
      const name = btn.getAttribute('data-name')
      showToast(`Đã gửi liên kết đặt lại mật khẩu cho ${name}`, 'info')
    }
  })

  document.querySelectorAll('.btn-delete-student').forEach(btn => {
    btn.onclick = async () => {
      const id = btn.getAttribute('data-id')
      const name = btn.getAttribute('data-name')
      if (confirm(`Bạn có chắc chắn muốn xóa học sinh ${name}?`)) {
        try {
          showToast('Đang xóa học sinh...', 'info')
          await api.deleteStudent(id)
          state.students = state.students.filter(s => s.id !== id)
          document.getElementById(`row-student-${id}`)?.remove()
          showToast(`Đã xóa học sinh ${name}`, 'success')
        } catch (err) {
          showToast(`Xóa học sinh thất bại: ${err.message}`, 'error')
        }
      }
    }
  })
}
