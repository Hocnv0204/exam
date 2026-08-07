import { renderSidebar, bindSidebarEvents } from '../components/sidebar.js'
import { renderNavbar } from '../components/navbar.js'
import { openModal } from '../components/modal.js'
import { showToast } from '../components/toast.js'
import { state } from '../state.js'
import { api } from '../api.js'

export function renderClassMgmtView() {
  const classes = state.classes

  return `
    <div class="app-layout">
      ${renderSidebar('classes-admin')}
      <div class="main-content">
        ${renderNavbar('Nền tảng / Bảng điều khiển')}
        <div class="content-body">
          <div class="page-header">
            <div>
              <h1 class="page-title">Quản lý lớp học</h1>
              <p class="page-description">Quản lý danh sách các lớp học và phân bổ học sinh.</p>
            </div>
            <button class="btn-primary" id="open-create-class-btn" style="width:auto; cursor:pointer;">
              <i class="fa-solid fa-plus"></i> Tạo lớp học mới
            </button>
          </div>

          <div class="card">
            <!-- Filter Bar -->
            <div style="display:flex; gap:16px; margin-bottom:20px; align-items:center;">
              <div class="search-box" style="width:320px;">
                <i class="fa-solid fa-magnifying-glass"></i>
                <input type="text" id="class-search-input" placeholder="Tìm tên lớp...">
              </div>
            </div>

            <!-- Class Data Table -->
            <div class="table-responsive">
              <table class="data-table">
                <thead>
                  <tr>
                    <th>Tên lớp học <i class="fa-solid fa-arrow-down-short-wide"></i></th>
                    <th>Số học sinh</th>
                    <th>Tiến độ</th>
                    <th>Thao tác</th>
                  </tr>
                </thead>
                <tbody id="classes-table-body">
                  ${classes.map(c => renderClassRow(c)).join('')}
                </tbody>
              </table>
            </div>

            <!-- Summary Bar -->
            <div style="display:flex; align-items:center; justify-content:space-between; margin-top:20px; font-size:13px; color:#64748b;">
              <div id="class-count-summary">Hiển thị 1 đến ${classes.length} trong tổng số ${classes.length} lớp học</div>
            </div>
          </div>
        </div>
      </div>
    </div>
  `
}

function renderClassRow(c) {
  return `
    <tr id="row-class-${c.id}">
      <td>
        <div style="font-weight:700; color:#0f172a;">${c.name}</div>
      </td>
      <td style="font-weight:600; color:#0f172a;"><i class="fa-solid fa-users" style="color:#64748b;"></i> ${c.studentsCount} học sinh</td>
      <td>
        <div style="display:flex; align-items:center; gap:8px;">
          <div class="progress-bar-bg" style="width:100px; height:8px;">
            <div class="progress-bar-fill" style="width: ${c.progress}%;"></div>
          </div>
          <span style="font-size:12px; font-weight:700; color:#0066cc;">${c.progress}%</span>
        </div>
      </td>
      <td>
        <div style="display:flex; gap:10px; align-items:center;">
          <a href="#class-details?classId=${c.id}" class="btn-primary" style="padding:5px 12px; font-size:12px; width:auto; border-radius:6px; text-decoration:none; display:inline-flex; align-items:center; gap:6px; cursor:pointer;"><i class="fa-solid fa-circle-info"></i> Chi tiết</a>
          <button class="btn-edit-class" data-id="${c.id}" style="background:none; border:none; color:#0066cc; cursor:pointer; font-size:16px;" title="Chỉnh sửa lớp học"><i class="fa-solid fa-pen-to-square"></i></button>
          <button class="btn-delete-class" data-id="${c.id}" data-name="${c.name}" title="Xóa lớp học" style="background:none; border:none; color:#ef4444; cursor:pointer;"><i class="fa-solid fa-trash"></i></button>
        </div>
      </td>
    </tr>
  `
}

export function showCreateClassModal() {
  const modalHTML = `
    <form id="create-class-modal-form" onsubmit="return false;" style="display:flex; flex-direction:column; gap:16px;">
      <div>
        <label style="font-size:13px; font-weight:600; color:#334155; display:block; margin-bottom:6px;">
          <i class="fa-solid fa-book-bookmark" style="color:#0066cc;"></i> Tên lớp học <span style="color:#ef4444;">*</span>
        </label>
        <input type="text" id="modal-class-name" class="form-input" placeholder="Ví dụ: Sinh học 11" required>
      </div>
      <div>
        <label style="font-size:13px; font-weight:600; color:#334155; display:block; margin-bottom:6px;">
          <i class="fa-solid fa-money-bill-wave" style="color:#10b981;"></i> Học phí (VND/Buổi) <span style="color:#ef4444;">*</span>
        </label>
        <input type="number" id="modal-class-tuition" class="form-input" placeholder="Ví dụ: 150000" min="0" value="0" required>
      </div>
    </form>
  `

  openModal('Tạo Lớp Học Mới', modalHTML, async () => {
    const name = document.getElementById('modal-class-name')?.value.trim()
    const tuitionFee = parseFloat(document.getElementById('modal-class-tuition')?.value) || 0

    if (!name) {
      showToast('Vui lòng nhập tên lớp học!', 'error')
      return false
    }

    try {
      showToast('Đang tạo lớp học...', 'info')
      const createdClass = await api.createClass({ name, tuitionFee })
      
      const newClass = {
        id: createdClass.id,
        name: createdClass.name,
        studentsCount: 0,
        tuitionFee: createdClass.tuitionFee || 0,
        progress: 0
      }

      state.classes.unshift(newClass)
      updateClassTable(newClass)
      showToast(`Đã tạo thành công lớp học "${name}"!`, 'success')
    } catch (err) {
      showToast(`Tạo lớp học thất bại: ${err.message}`, 'error')
    }
  })
}

export function showEditClassModal(classId) {
  const currentClass = state.classes.find(c => c.id === classId)
  if (!currentClass) {
    showToast('Không tìm thấy thông tin lớp học!', 'error')
    return
  }

  const modalHTML = `
    <form id="edit-class-modal-form" onsubmit="return false;" style="display:flex; flex-direction:column; gap:16px;">
      <div>
        <label style="font-size:13px; font-weight:600; color:#334155; display:block; margin-bottom:6px;">
          <i class="fa-solid fa-book-bookmark" style="color:#0066cc;"></i> Tên lớp học <span style="color:#ef4444;">*</span>
        </label>
        <input type="text" id="modal-class-name" class="form-input" value="${currentClass.name}" placeholder="Ví dụ: Sinh học 11" required>
      </div>
      <div>
        <label style="font-size:13px; font-weight:600; color:#334155; display:block; margin-bottom:6px;">
          <i class="fa-solid fa-money-bill-wave" style="color:#10b981;"></i> Học phí (VND/Buổi) <span style="color:#ef4444;">*</span>
        </label>
        <input type="number" id="modal-class-tuition" class="form-input" value="${currentClass.tuitionFee || 0}" placeholder="Ví dụ: 150000" min="0" required>
      </div>
    </form>
  `

  openModal('Chỉnh Sửa Lớp Học', modalHTML, async () => {
    const name = document.getElementById('modal-class-name')?.value.trim()
    const tuitionFee = parseFloat(document.getElementById('modal-class-tuition')?.value) || 0

    if (!name) {
      showToast('Vui lòng nhập tên lớp học!', 'error')
      return false
    }

    try {
      showToast('Đang cập nhật lớp học...', 'info')
      const updatedClass = await api.updateClass({ classId, name, tuitionFee })
      
      // Update local state
      const idx = state.classes.findIndex(c => c.id === classId)
      if (idx !== -1) {
        state.classes[idx].name = updatedClass.name
        state.classes[idx].tuitionFee = updatedClass.tuitionFee || 0
      }
      
      // Re-render class row in table
      const row = document.getElementById(`row-class-${classId}`)
      if (row) {
        const tempDiv = document.createElement('tbody')
        tempDiv.innerHTML = renderClassRow(state.classes[idx])
        row.replaceWith(tempDiv.firstElementChild)
      }
      
      bindClassTableActionEvents()
      showToast(`Đã cập nhật thành công lớp học!`, 'success')
    } catch (err) {
      showToast(`Cập nhật lớp học thất bại: ${err.message}`, 'error')
    }
  })
}

export function bindClassMgmtEvents() {
  bindSidebarEvents()
  bindClassTableActionEvents()

  const createBtn = document.getElementById('open-create-class-btn')
  if (createBtn) {
    createBtn.addEventListener('click', (e) => {
      e.preventDefault()
      showCreateClassModal()
    })
  }

  const searchInput = document.getElementById('class-search-input')

  const filterClasses = () => {
    const query = searchInput?.value.toLowerCase().trim() || ''

    const filtered = state.classes.filter(c => {
      return !query || c.name.toLowerCase().includes(query)
    })

    const tbody = document.getElementById('classes-table-body')
    if (tbody) {
      tbody.innerHTML = filtered.map(c => renderClassRow(c)).join('')
    }

    const summary = document.getElementById('class-count-summary')
    if (summary) {
      summary.textContent = `Hiển thị 1 đến ${filtered.length} trong tổng số ${state.classes.length} lớp học`
    }

    bindClassTableActionEvents()
  }

  searchInput?.addEventListener('input', filterClasses)
}

function updateClassTable(newClass) {
  const tbody = document.getElementById('classes-table-body')
  if (tbody) {
    const tempDiv = document.createElement('tbody')
    tempDiv.innerHTML = renderClassRow(newClass)
    if (tempDiv.firstElementChild) {
      tbody.prepend(tempDiv.firstElementChild)
    }
  }

  const summary = document.getElementById('class-count-summary')
  if (summary) {
    summary.textContent = `Hiển thị 1 đến ${state.classes.length} trong tổng số ${state.classes.length} lớp học`
  }

  bindClassTableActionEvents()
}

function bindClassTableActionEvents() {
  document.querySelectorAll('.btn-delete-class').forEach(btn => {
    btn.onclick = async () => {
      const id = btn.getAttribute('data-id')
      const name = btn.getAttribute('data-name')
      if (confirm(`Bạn có chắc chắn muốn xóa lớp học ${name}?`)) {
        try {
          showToast('Đang xóa lớp học...', 'info')
          await api.deleteClass(id)
          state.classes = state.classes.filter(c => c.id !== id)
          document.getElementById(`row-class-${id}`)?.remove()
          showToast(`Đã xóa lớp học ${name}`, 'success')
        } catch (err) {
          showToast(`Xóa lớp học thất bại: ${err.message}`, 'error')
        }
      }
    }
  })

  document.querySelectorAll('.btn-edit-class').forEach(btn => {
    btn.onclick = () => {
      const id = btn.getAttribute('data-id')
      showEditClassModal(id)
    }
  })
}

let selectedSessionDates = new Set()

export async function showClassDetailsModal(classId, className) {
  const currentClass = state.classes.find(c => c.id === classId)
  const tuitionFee = currentClass?.tuitionFee || 0
  
  if (!state.students || state.students.length === 0) {
    try {
      state.students = await api.getStudents() || []
    } catch (e) {
      console.warn("Could not load students: ", e)
    }
  }
  
  const classStudents = state.students.filter(s => s.classIds ? s.classIds.includes(classId) : (s.classId === classId))
  
  const now = new Date()
  const defaultMonth = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`
  
  const modalHTML = `
    <div style="display:flex; flex-direction:column; gap:20px; min-width: 500px; max-width:100%;">
      <div style="background:#f8fafc; border:1px solid #e2e8f0; border-radius:12px; padding:16px; display:flex; justify-content:space-between; align-items:center;">
        <div>
          <h3 style="font-size:16px; font-weight:700; color:#0f172a; margin:0;">${className}</h3>
          <span style="font-size:12px; color:#64748b;">Mã lớp: ${classId}</span>
        </div>
        <div style="text-align:right;">
          <div style="font-size:12px; color:#64748b; margin-bottom:4px;">Học phí / Buổi</div>
          <strong style="font-size:16px; color:#10b981;">${tuitionFee.toLocaleString('vi-VN')} VND</strong>
        </div>
      </div>
      
      <div style="display:flex; border-bottom:1px solid #e2e8f0; gap:20px;">
        <button id="tab-students-btn" style="background:none; border:none; padding:10px 0; font-weight:600; font-size:14px; cursor:pointer; color:#0066cc; border-bottom:2px solid #0066cc;">Danh sách học sinh (${classStudents.length})</button>
        <button id="tab-sessions-btn" style="background:none; border:none; padding:10px 0; font-weight:600; font-size:14px; cursor:pointer; color:#64748b;">Quản lý buổi học</button>
      </div>
      
      <div id="modal-tab-content">
        <div id="content-students-tab">
          ${classStudents.length === 0 ? `
            <div style="text-align:center; padding:32px; color:#94a3b8;">
              <i class="fa-solid fa-users-slash" style="font-size:32px; margin-bottom:8px; display:block;"></i>
              Chưa có học sinh nào trong lớp này
            </div>
          ` : `
            <div style="max-height:250px; overflow-y:auto; border:1px solid #e2e8f0; border-radius:10px;">
              <table style="width:100%; border-collapse:collapse; font-size:13px; text-align:left;">
                <thead>
                  <tr style="background:#f1f5f9; border-bottom:1px solid #e2e8f0;">
                    <th style="padding:10px;">Họ tên</th>
                    <th style="padding:10px;">Mã học sinh</th>
                    <th style="padding:10px;">Username</th>
                  </tr>
                </thead>
                <tbody>
                  ${classStudents.map(s => `
                    <tr style="border-bottom:1px solid #f1f5f9;">
                      <td style="padding:10px; font-weight:600; color:#1e293b;">${s.fullName}</td>
                      <td style="padding:10px; color:#64748b; font-family:monospace;">${s.studentCode || 'N/A'}</td>
                      <td style="padding:10px; color:#64748b;">${s.username}</td>
                    </tr>
                  `).join('')}
                </tbody>
              </table>
            </div>
          `}
        </div>
        
        <div id="content-sessions-tab" style="display:none;">
          <div style="display:flex; gap:16px; align-items:center; margin-bottom:16px;">
            <label style="font-size:13px; font-weight:600; color:#334155;">Chọn tháng gán lịch học:</label>
            <input type="month" id="sessions-month-picker" class="form-input" style="width:200px; padding:6px 12px;" value="${defaultMonth}">
          </div>
          
          <div id="sessions-calendar-container"></div>
          
          <div style="margin-top:16px; display:flex; justify-content:flex-end;">
            <button class="btn-primary" id="save-sessions-btn" style="width:auto; cursor:pointer; padding:8px 16px;">
              <i class="fa-solid fa-save"></i> Lưu buổi học
            </button>
          </div>
        </div>
      </div>
    </div>
  `
  
  openModal('Chi Tiết Lớp Học', modalHTML, null, false)
  
  const tabStudentsBtn = document.getElementById('tab-students-btn')
  const tabSessionsBtn = document.getElementById('tab-sessions-btn')
  const contentStudentsTab = document.getElementById('content-students-tab')
  const contentSessionsTab = document.getElementById('content-sessions-tab')
  
  tabStudentsBtn.onclick = () => {
    tabStudentsBtn.style.color = '#0066cc'
    tabStudentsBtn.style.borderBottom = '2px solid #0066cc'
    tabSessionsBtn.style.color = '#64748b'
    tabSessionsBtn.style.borderBottom = 'none'
    contentStudentsTab.style.display = 'block'
    contentSessionsTab.style.display = 'none'
  }
  
  tabSessionsBtn.onclick = async () => {
    tabSessionsBtn.style.color = '#0066cc'
    tabSessionsBtn.style.borderBottom = '2px solid #0066cc'
    tabStudentsBtn.style.color = '#64748b'
    tabStudentsBtn.style.borderBottom = 'none'
    contentStudentsTab.style.display = 'none'
    contentSessionsTab.style.display = 'block'
    
    await loadSessionsForMonth(classId, defaultMonth)
  }
  
  const monthPicker = document.getElementById('sessions-month-picker')
  if (monthPicker) {
    monthPicker.onchange = async () => {
      await loadSessionsForMonth(classId, monthPicker.value)
    }
  }
}

async function loadSessionsForMonth(classId, month) {
  const container = document.getElementById('sessions-calendar-container')
  if (!container) return
  
  container.innerHTML = `
    <div style="text-align:center; padding:20px; color:#64748b;">
      <i class="fa-solid fa-circle-notch fa-spin" style="font-size:24px; color:#0066cc; margin-bottom:8px;"></i>
      Đang tải lịch học...
    </div>
  `
  
  try {
    const sessions = await api.getClassSessions(classId, month)
    selectedSessionDates = new Set(sessions)
    
    const [year, m] = month.split('-').map(Number)
    const totalDays = new Date(year, m, 0).getDate()
    
    let daysHTML = `
      <div style="font-size:12px; color:#64748b; margin-bottom:8px;">
        <i class="fa-solid fa-info-circle"></i> Nhấp vào các ngày để gán buổi học (màu xanh dương biểu thị ngày học).
      </div>
      <div style="display:grid; grid-template-columns: repeat(7, 1fr); gap:8px;">
    `
    
    const weekdays = ['T2', 'T3', 'T4', 'T5', 'T6', 'T7', 'CN']
    weekdays.forEach(day => {
      daysHTML += `<div style="text-align:center; font-weight:700; font-size:11px; color:#94a3b8; padding:4px 0;">${day}</div>`
    })
    
    let startDayIdx = new Date(year, m - 1, 1).getDay()
    startDayIdx = startDayIdx === 0 ? 6 : startDayIdx - 1
    
    for (let i = 0; i < startDayIdx; i++) {
      daysHTML += `<div></div>`
    }
    
    for (let day = 1; day <= totalDays; day++) {
      const dateStr = `${year}-${String(m).padStart(2, '0')}-${String(day).padStart(2, '0')}`
      const isSelected = selectedSessionDates.has(dateStr)
      const bgColor = isSelected ? '#0066cc' : '#ffffff'
      const textColor = isSelected ? '#ffffff' : '#334155'
      const border = isSelected ? '1px solid #0066cc' : '1px solid #e2e8f0'
      
      daysHTML += `
        <button class="calendar-day-btn" data-date="${dateStr}" style="
          background:${bgColor};
          color:${textColor};
          border:${border};
          border-radius:8px;
          height:36px;
          font-weight:600;
          font-size:13px;
          cursor:pointer;
          display:flex;
          align-items:center;
          justify-content:center;
          transition: all 0.2s;
        " onmouseover="this.style.filter='brightness(0.9)'" onmouseout="this.style.filter='none'">
          ${day}
        </button>
      `
    }
    
    daysHTML += `</div>`
    container.innerHTML = daysHTML
    
    document.querySelectorAll('.calendar-day-btn').forEach(btn => {
      btn.onclick = () => {
        const dateStr = btn.getAttribute('data-date')
        if (selectedSessionDates.has(dateStr)) {
          selectedSessionDates.delete(dateStr)
          btn.style.background = '#ffffff'
          btn.style.color = '#334155'
          btn.style.border = '1px solid #e2e8f0'
        } else {
          selectedSessionDates.add(dateStr)
          btn.style.background = '#0066cc'
          btn.style.color = '#ffffff'
          btn.style.border = '1px solid #0066cc'
        }
      }
    })
    
    const saveBtn = document.getElementById('save-sessions-btn')
    if (saveBtn) {
      saveBtn.onclick = async () => {
        try {
          showToast('Đang lưu lịch học...', 'info')
          await api.setClassSessions(classId, Array.from(selectedSessionDates), month)
          showToast('Đã lưu lịch học thành công!', 'success')
        } catch (e) {
          showToast(`Lưu lịch học thất bại: ${e.message}`, 'error')
        }
      }
    }
    
  } catch (e) {
    container.innerHTML = `
      <div style="text-align:center; padding:20px; color:#ef4444;">
        <i class="fa-solid fa-triangle-exclamation" style="font-size:24px; margin-bottom:8px; display:block;"></i>
        Tải lịch học thất bại: ${e.message}
      </div>
    `
  }
}
