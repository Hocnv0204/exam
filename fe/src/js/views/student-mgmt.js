import { renderSidebar, bindSidebarEvents } from '../components/sidebar.js'
import { renderNavbar } from '../components/navbar.js'
import { openModal } from '../components/modal.js'
import { showToast } from '../components/toast.js'
import { state } from '../state.js'
import { api } from '../api.js'
import { renderPaginationBar, bindPaginationEvents } from '../components/pagination.js'

let currentPage = 1
let pageSize = 10
let searchQuery = ''
let selectedClass = ''
let filteredStudents = null
let filterDebounceTimer = null
let currentFilterReqId = 0

function getCurrentStudents() {
  return filteredStudents !== null ? filteredStudents : (state.students || [])
}

export function renderStudentMgmtView() {
  // Khi vào trang: khởi tạo lại bộ lọc và hiển thị tất cả học sinh như hiện tại
  currentPage = 1
  searchQuery = ''
  selectedClass = ''
  filteredStudents = null
  if (filterDebounceTimer) {
    clearTimeout(filterDebounceTimer)
    filterDebounceTimer = null
  }

  const currentList = getCurrentStudents()
  const totalItems = currentList.length
  const totalPages = Math.max(1, Math.ceil(totalItems / pageSize))
  if (currentPage > totalPages) currentPage = totalPages

  const from = (currentPage - 1) * pageSize
  const pagedStudents = currentList.slice(from, from + pageSize)

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
            <div class="flex-wrap-mobile" style="display:flex; gap:16px; margin-bottom:20px; align-items:center;">
              <div class="search-box full-width-mobile" style="width: 100%; max-width: 320px;">
                <i class="fa-solid fa-magnifying-glass"></i>
                <input type="text" id="student-search-input" placeholder="Tìm theo tên hoặc mã học sinh..." value="${searchQuery}">
              </div>
              <select id="class-filter-select" style="padding:10px 14px; border:1px solid var(--border-color); border-radius:10px; font-size:14px; outline:none; background:#ffffff;">
                <option value="">Tất cả các lớp</option>
                ${state.classes.map(c => `<option value="${c.id}" ${c.id === selectedClass ? 'selected' : ''}>${c.name}</option>`).join('')}
              </select>
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
                  ${pagedStudents.length === 0 
                    ? `<tr><td colspan="6" style="text-align:center; padding:30px; color:#64748b;">Không tìm thấy học sinh nào phù hợp.</td></tr>`
                    : pagedStudents.map(s => renderStudentRow(s)).join('')
                  }
                </tbody>
              </table>
            </div>

            <!-- Pagination Bar Wrapper -->
            <div id="student-pagination-wrapper">
              ${renderPaginationBar({
                currentPage,
                totalItems,
                pageSize,
                containerId: 'student-pagination-container',
                pageSizeOptions: [10, 20, 50]
              })}
            </div>
          </div>
        </div>
      </div>
    </div>
  `
}

function renderStudentRow(s) {
  const initials = s.fullName ? s.fullName.split(' ').map(n => n[0]).join('').substring(0, 2).toUpperCase() : 'HS'
  
  // Render classes as individual badges
  const classBadges = s.className ? s.className.split(', ').map(name => `
    <span style="background:#e0f2fe; color:#0369a1; padding:2px 8px; border-radius:6px; font-size:11px; font-weight:600; margin-right:4px; display:inline-block;">
      ${name}
    </span>
  `).join('') : '<span style="color:#64748b; font-size:12px;">Chưa phân lớp</span>'

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
        <div style="display:flex; flex-wrap:wrap; gap:4px;">
          ${classBadges}
        </div>
      </td>
      <td>
        <span class="badge ${s.status === 'Hoạt động' ? 'badge-active' : 'badge-inactive'}">
          <i class="fa-solid fa-circle" style="font-size:6px;"></i> ${s.status || 'Hoạt động'}
        </span>
      </td>
      <td style="color:#64748b;">${s.createdAt || 'Mới khởi tạo'}</td>
      <td>
        <div style="display:flex; gap:10px; align-items:center;">
          <a href="#student-details?studentId=${s.id}&classId=${s.classId || (s.classIds && s.classIds[0]) || ''}" title="Xem chi tiết học tập & học phí" style="color:#10b981; font-size:16px; text-decoration:none; display:inline-flex; align-items:center;"><i class="fa-solid fa-circle-user"></i></a>
          <button class="btn-edit-student" data-id="${s.id}" title="Chỉnh sửa thông tin học sinh" style="background:none; border:none; color:#0066cc; cursor:pointer; font-size:16px;"><i class="fa-solid fa-pen-to-square"></i></button>
          <button class="btn-delete-student" data-id="${s.id}" data-name="${s.fullName}" title="Xóa" style="background:none; border:none; color:#ef4444; cursor:pointer; font-size:16px;"><i class="fa-solid fa-trash"></i></button>
        </div>
      </td>
    </tr>
  `
}

export function showCreateStudentModal() {
  const classCheckboxesHTML = state.classes.length > 0 
    ? state.classes.map(c => `
        <label style="display:flex; align-items:center; gap:8px; font-size:13px; font-weight:500; color:#334155; cursor:pointer; padding:2px 0;">
          <input type="checkbox" name="student-classes" value="${c.id}" style="width:16px; height:16px; accent-color:#0066cc; cursor:pointer;">
          <span>${c.name}</span>
        </label>
      `).join('')
    : `<div style="font-size:13px; color:#64748b;">Chưa có lớp học nào</div>`

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
          <i class="fa-solid fa-graduation-cap" style="color:#0066cc;"></i> Chọn lớp học (Chọn nhiều lớp) <span style="color:#ef4444;">*</span>
        </label>
        <div style="border:1px solid var(--border-color); border-radius:10px; padding:12px; max-height:150px; overflow-y:auto; background:#ffffff; display:flex; flex-direction:column; gap:6px;">
          ${classCheckboxesHTML}
        </div>
      </div>
    </form>
  `

  openModal('Tạo Học Sinh Mới', modalHTML, async () => {
    const username = document.getElementById('modal-student-username')?.value.trim()
    const password = document.getElementById('modal-student-password')?.value.trim()
    const fullName = document.getElementById('modal-student-fullname')?.value.trim()
    const classIds = Array.from(document.querySelectorAll('input[name="student-classes"]:checked')).map(cb => cb.value)

    if (!username || !password || !fullName || classIds.length === 0) {
      showToast('Vui lòng nhập đầy đủ Username, Password, Tên học sinh và chọn ít nhất 1 lớp!', 'error')
      return false
    }

    const selectedClasses = state.classes.filter(c => classIds.includes(c.id))
    const classNames = selectedClasses.map(c => c.name).join(', ')

    try {
      showToast('Đang tạo tài khoản học sinh...', 'info')
      const createdData = await api.createStudent({ username, password, fullName, classIds })
      const newStudent = {
        id: createdData.id || ('s_' + Date.now()),
        username,
        fullName,
        studentCode: 'STU-' + Math.floor(1000 + Math.random() * 9000),
        email: `${username}@eduportal.vn`,
        className: classNames,
        classId: classIds[0],
        classIds: classIds,
        status: 'Hoạt động',
        createdAt: new Date().toLocaleDateString('vi-VN')
      }
      state.students.unshift(newStudent)
      updateTable(newStudent)
      showToast(`Tạo thành công học sinh "${fullName}" cho lớp ${classNames}!`, 'success')
    } catch (err) {
      const newStudent = {
        id: 's_' + Date.now(),
        username,
        fullName,
        studentCode: 'STU-' + Math.floor(1000 + Math.random() * 9000),
        email: `${username}@eduportal.vn`,
        className: classNames,
        classId: classIds[0],
        classIds: classIds,
        status: 'Hoạt động',
        createdAt: new Date().toLocaleDateString('vi-VN')
      }
      state.students.unshift(newStudent)
      updateTable(newStudent)
      showToast(`Tạo thành công học sinh "${fullName}" cho lớp ${classNames}! (Chế độ Demo)`, 'success')
    }
  })
}

export function showEditStudentModal(studentId) {
  const student = state.students.find(s => s.id === studentId)
  if (!student) {
    showToast('Không tìm thấy thông tin học sinh!', 'error')
    return
  }

  const studentClassIds = student.classIds || (student.classId ? [student.classId] : [])

  const classCheckboxesHTML = state.classes.map(c => {
    const isChecked = studentClassIds.includes(c.id) ? 'checked' : ''
    return `
      <label style="display:flex; align-items:center; gap:8px; font-size:13px; font-weight:500; color:#334155; cursor:pointer; padding:2px 0;">
        <input type="checkbox" name="student-classes-edit" value="${c.id}" ${isChecked} style="width:16px; height:16px; accent-color:#0066cc; cursor:pointer;">
        <span>${c.name}</span>
      </label>
    `
  }).join('')

  const modalHTML = `
    <form id="edit-student-modal-form" onsubmit="return false;" style="display:flex; flex-direction:column; gap:16px;">
      <div>
        <label style="font-size:13px; font-weight:600; color:#334155; display:block; margin-bottom:6px;">
          Tên đăng nhập (Username)
        </label>
        <input type="text" class="form-input" value="${student.username}" disabled style="background:#f1f5f9; cursor:not-allowed;">
      </div>

      <div>
        <label style="font-size:13px; font-weight:600; color:#334155; display:block; margin-bottom:6px;">
          Tên học sinh (Họ và tên) <span style="color:#ef4444;">*</span>
        </label>
        <input type="text" id="modal-edit-fullname" class="form-input" value="${student.fullName}" required>
      </div>

      <div>
        <label style="font-size:13px; font-weight:600; color:#334155; display:block; margin-bottom:6px;">
          Mật khẩu mới (Để trống nếu không muốn đổi)
        </label>
        <input type="password" id="modal-edit-password" class="form-input" placeholder="Nhập mật khẩu mới tối thiểu 6 ký tự">
      </div>

      <div>
        <label style="font-size:13px; font-weight:600; color:#334155; display:block; margin-bottom:6px;">
          Lớp học (Chọn nhiều lớp) <span style="color:#ef4444;">*</span>
        </label>
        <div style="border:1px solid var(--border-color); border-radius:10px; padding:12px; max-height:150px; overflow-y:auto; background:#ffffff; display:flex; flex-direction:column; gap:6px;">
          ${classCheckboxesHTML}
        </div>
      </div>
    </form>
  `

  openModal('Cập Nhật Thông Tin Học Sinh', modalHTML, async () => {
    const fullName = document.getElementById('modal-edit-fullname')?.value.trim()
    const password = document.getElementById('modal-edit-password')?.value.trim()
    const classIds = Array.from(document.querySelectorAll('input[name="student-classes-edit"]:checked')).map(cb => cb.value)

    if (!fullName || classIds.length === 0) {
      showToast('Vui lòng điền họ tên và chọn ít nhất 1 lớp!', 'error')
      return false
    }

    const selectedClasses = state.classes.filter(c => classIds.includes(c.id))
    const classNames = selectedClasses.map(c => c.name).join(', ')

    try {
      showToast('Đang cập nhật thông tin học sinh...', 'info')
      await api.updateStudent({
        studentId,
        fullName,
        classIds,
        password: password || null
      })

      // Update local state
      student.fullName = fullName
      student.className = classNames
      student.classId = classIds[0]
      student.classIds = classIds

      if (filteredStudents !== null) {
        const item = filteredStudents.find(s => s.id === studentId)
        if (item) {
          item.fullName = fullName
          item.className = classNames
          item.classId = classIds[0]
          item.classIds = classIds
        }
      }

      if (window._refreshStudentMgmtTable) {
        window._refreshStudentMgmtTable(false)
      } else {
        const searchInput = document.getElementById('student-search-input')
        searchInput?.dispatchEvent(new Event('input'))
      }

      showToast(`Đã cập nhật thành công thông tin học sinh "${fullName}"!`, 'success')
    } catch (err) {
      // Offline/Demo fallback
      student.fullName = fullName
      student.className = classNames
      student.classId = classIds[0]
      student.classIds = classIds
      
      if (filteredStudents !== null) {
        const item = filteredStudents.find(s => s.id === studentId)
        if (item) {
          item.fullName = fullName
          item.className = classNames
          item.classId = classIds[0]
          item.classIds = classIds
        }
      }

      if (window._refreshStudentMgmtTable) {
        window._refreshStudentMgmtTable(false)
      } else {
        const searchInput = document.getElementById('student-search-input')
        searchInput?.dispatchEvent(new Event('input'))
      }
      showToast(`Đã cập nhật thông tin học sinh "${fullName}" (Chế độ Demo)!`, 'success')
    }
  })
}

window.showCreateStudentModal = showCreateStudentModal
window.showEditStudentModal = showEditStudentModal

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

  const bindPagination = () => {
    bindPaginationEvents({
      containerId: 'student-pagination-container',
      onPageChange: (newPage) => {
        currentPage = newPage
        refreshTable(false)
      },
      onPageSizeChange: (newSize) => {
        pageSize = newSize
        currentPage = 1
        refreshTable(true)
      }
    })
  }

  const refreshTable = (rebindPagination = true) => {
    const currentList = getCurrentStudents()
    const totalItems = currentList.length
    const totalPages = Math.max(1, Math.ceil(totalItems / pageSize))
    if (currentPage > totalPages) currentPage = Math.max(1, totalPages)

    const from = (currentPage - 1) * pageSize
    const pagedStudents = currentList.slice(from, from + pageSize)

    const tbody = document.getElementById('students-table-body')
    if (tbody) {
      tbody.innerHTML = pagedStudents.length === 0
        ? `<tr><td colspan="6" style="text-align:center; padding:30px; color:#64748b;">Không tìm thấy học sinh nào phù hợp.</td></tr>`
        : pagedStudents.map(s => renderStudentRow(s)).join('')
    }

    const paginationWrapper = document.getElementById('student-pagination-wrapper')
    if (paginationWrapper) {
      paginationWrapper.innerHTML = renderPaginationBar({
        currentPage,
        totalItems,
        pageSize,
        containerId: 'student-pagination-container',
        pageSizeOptions: [10, 20, 50]
      })
      if (rebindPagination) {
        bindPagination()
      }
    }

    bindTableActionEvents()
  }

  const executeFilter = async () => {
    const q = searchQuery.trim()
    const cls = selectedClass

    // Khi không có bộ lọc: hiển thị lại toàn bộ học sinh ban đầu
    if (!q && !cls) {
      filteredStudents = null
      currentPage = 1
      refreshTable(true)
      return
    }

    const reqId = ++currentFilterReqId
    const tbody = document.getElementById('students-table-body')
    if (tbody) {
      tbody.innerHTML = `
        <tr>
          <td colspan="6" style="text-align:center; padding:32px; color:#0284c7;">
            <i class="fa-solid fa-spinner fa-spin" style="margin-right:8px; font-size:16px;"></i> Đang tải dữ liệu học sinh theo bộ lọc...
          </td>
        </tr>
      `
    }

    try {
      const params = {}
      if (q) params.search = q
      if (cls) params.classId = cls

      // Thực hiện gọi tiếp API get theo filter
      const data = await api.getStudents(params, { silent: true })
      if (reqId !== currentFilterReqId) return

      filteredStudents = Array.isArray(data) ? data : []
      currentPage = 1
      refreshTable(true)
    } catch (err) {
      if (reqId !== currentFilterReqId) return
      console.error('[student-mgmt] Lỗi gọi API filter:', err)
      showToast(`Không thể tải dữ liệu theo bộ lọc: ${err.message}`, 'error')

      // Dự phòng bộ lọc cục bộ nếu API gặp sự cố
      const qLower = q.toLowerCase()
      filteredStudents = (state.students || []).filter(s => {
        const matchQuery = !qLower || 
          (s.fullName && s.fullName.toLowerCase().includes(qLower)) || 
          (s.studentCode && s.studentCode.toLowerCase().includes(qLower)) || 
          (s.username && s.username.toLowerCase().includes(qLower))
        const matchClass = !cls || s.classId === cls || (s.classIds && s.classIds.includes(cls))
        return matchQuery && matchClass
      })
      currentPage = 1
      refreshTable(true)
    }
  }

  // Initial pagination bind
  bindPagination()

  searchInput?.addEventListener('input', (e) => {
    searchQuery = e.target.value
    if (filterDebounceTimer) clearTimeout(filterDebounceTimer)
    filterDebounceTimer = setTimeout(() => {
      executeFilter()
    }, 300)
  })

  filterSelect?.addEventListener('change', (e) => {
    selectedClass = e.target.value
    if (filterDebounceTimer) clearTimeout(filterDebounceTimer)
    executeFilter()
  })

  window._refreshStudentMgmtTable = refreshTable
  window._executeStudentFilter = executeFilter
}

function updateTable(newStudent) {
  currentPage = 1
  if (window._executeStudentFilter && filteredStudents !== null) {
    window._executeStudentFilter()
  } else if (window._refreshStudentMgmtTable) {
    window._refreshStudentMgmtTable(true)
  }
}

function bindTableActionEvents() {
  document.querySelectorAll('.btn-edit-student').forEach(btn => {
    btn.onclick = () => {
      const id = btn.getAttribute('data-id')
      showEditStudentModal(id)
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
          if (filteredStudents !== null) {
            filteredStudents = filteredStudents.filter(s => s.id !== id)
          }
          if (window._refreshStudentMgmtTable) {
            window._refreshStudentMgmtTable(true)
          } else {
            document.getElementById(`row-student-${id}`)?.remove()
          }
          showToast(`Đã xóa học sinh ${name}`, 'success')
        } catch (err) {
          showToast(`Xóa học sinh thất bại: ${err.message}`, 'error')
        }
      }
    }
  })
}
