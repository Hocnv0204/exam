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
        <div style="display:flex; gap:10px;">
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
    </form>
  `

  openModal('Tạo Lớp Học Mới', modalHTML, async () => {
    const name = document.getElementById('modal-class-name')?.value.trim()

    if (!name) {
      showToast('Vui lòng nhập tên lớp học!', 'error')
      return false
    }

    try {
      showToast('Đang tạo lớp học...', 'info')
      const createdClass = await api.createClass({ name })
      
      const newClass = {
        id: createdClass.id,
        name: createdClass.name,
        studentsCount: 0,
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
}
