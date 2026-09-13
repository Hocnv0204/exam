import { renderSidebar, bindSidebarEvents } from '../components/sidebar.js'
import { renderNavbar } from '../components/navbar.js'
import { openModal } from '../components/modal.js'
import { showToast } from '../components/toast.js'
import { state } from '../state.js'
import { api } from '../api.js'

export const DEFAULT_GRADE_BLOCKS = ['12-Toán', '12-Hóa', '11-Toán', '11-Hóa']

let cachedGradeBlocks = []

export async function fetchGradeBlocks(forceRefresh = false) {
  if (!forceRefresh && cachedGradeBlocks && cachedGradeBlocks.length > 0) {
    return cachedGradeBlocks
  }
  try {
    const res = await api.getGradeBlocks()
    if (Array.isArray(res)) {
      cachedGradeBlocks = res
    } else if (res && Array.isArray(res.data)) {
      cachedGradeBlocks = res.data
    }
  } catch (e) {
    console.warn('[ClassMgmt] Failed to load grade blocks:', e)
  }

  if (!cachedGradeBlocks || cachedGradeBlocks.length === 0) {
    const custom = (state.classes || []).map(c => c.gradeBlock).filter(Boolean)
    const unique = Array.from(new Set([...DEFAULT_GRADE_BLOCKS, ...custom]))
    cachedGradeBlocks = unique.map((name, i) => ({ id: `default-${i}`, name, description: '' }))
  }
  return cachedGradeBlocks
}

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
              <p class="page-description">Quản lý danh sách các lớp học, khối học và phân bổ học sinh.</p>
            </div>
            <div style="display:flex; gap:10px; flex-wrap:wrap;">
              <button class="btn-secondary" id="open-manage-grade-blocks-btn" style="padding:9px 16px; font-size:13px; font-weight:600; cursor:pointer; display:inline-flex; align-items:center; gap:8px; border-radius:10px; background:#f8fafc; border:1px solid #cbd5e1; color:#334155;">
                <i class="fa-solid fa-layer-group" style="color:#0284c7;"></i> Quản lý khối học
              </button>
              <button class="btn-primary" id="open-create-class-btn" style="width:auto; cursor:pointer;">
                <i class="fa-solid fa-plus"></i> Tạo lớp học mới
              </button>
            </div>
          </div>

          <div class="card">
            <!-- Filter Bar -->
            <div class="flex-wrap-mobile" style="display:flex; gap:16px; margin-bottom:20px; align-items:center;">
              <div class="search-box full-width-mobile" style="width: 100%; max-width: 320px;">
                <i class="fa-solid fa-magnifying-glass"></i>
                <input type="text" id="class-search-input" placeholder="Tìm tên lớp hoặc khối...">
              </div>
            </div>

              <!-- Class Data Table -->
              <div class="table-responsive">
                <table class="data-table">
                  <thead>
                    <tr>
                      <th>Tên lớp học <i class="fa-solid fa-arrow-down-short-wide"></i></th>
                      <th>Khối</th>
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
      <td>
        <span class="badge" style="background:#e0f2fe; color:#0369a1; font-weight:700; padding:4px 10px; border-radius:6px; font-size:12px; border:1px solid #bae6fd; display:inline-flex; align-items:center; gap:5px;">
          <i class="fa-solid fa-layer-group" style="font-size:11px;"></i>${c.gradeBlock || '12-Toán'}
        </span>
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

export async function showCreateClassModal() {
  const blocks = await fetchGradeBlocks()

  const modalHTML = `
    <form id="create-class-modal-form" onsubmit="return false;" style="display:flex; flex-direction:column; gap:16px;">
      <div>
        <label style="font-size:13px; font-weight:600; color:#334155; display:block; margin-bottom:6px;">
          <i class="fa-solid fa-book-bookmark" style="color:#0066cc;"></i> Tên lớp học <span style="color:#ef4444;">*</span>
        </label>
        <input type="text" id="modal-class-name" class="form-input" placeholder="Ví dụ: Lớp Toán 12 Nâng Cao" required>
      </div>
      <div>
        <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:6px;">
          <label style="font-size:13px; font-weight:600; color:#334155; margin:0;">
            <i class="fa-solid fa-layer-group" style="color:#6366f1;"></i> Chọn khối học <span style="color:#ef4444;">*</span>
          </label>
          <button type="button" id="btn-toggle-new-block-create" style="background:none; border:none; color:#0066cc; font-size:12px; font-weight:600; cursor:pointer; padding:0; display:inline-flex; align-items:center; gap:4px;">
            <i class="fa-solid fa-circle-plus"></i> + Tạo khối mới
          </button>
        </div>
        <select id="modal-class-grade-block" class="form-input" required>
          ${blocks.map(b => `<option value="${b.name}">${b.name}${b.description ? ` (${b.description})` : ''}</option>`).join('')}
        </select>

        <!-- Inline quick block creator -->
        <div id="inline-create-block-create-box" style="display:none; margin-top:8px; padding:12px; border:1px dashed #93c5fd; border-radius:8px; background:#eff6ff;">
          <div style="font-size:12px; font-weight:700; color:#1e40af; margin-bottom:6px;">
            <i class="fa-solid fa-folder-plus"></i> Tạo nhanh khối học mới
          </div>
          <div style="display:flex; gap:8px; align-items:center;">
            <input type="text" id="inline-new-block-create-input" placeholder="Nhập tên khối mới (VD: 10-Toán, 10-Hóa...)" style="flex:1; height:38px; border:1px solid #cbd5e1; border-radius:8px; padding:0 12px; font-size:13px; background:#ffffff; box-sizing:border-box;" />
            <button type="button" id="inline-btn-save-block-create" class="btn-primary" style="height:38px; padding:0 14px; font-size:12px; border-radius:8px; background:#0066cc; color:#fff; border:none; cursor:pointer; white-space:nowrap; width:auto;">
              Lưu & Chọn
            </button>
          </div>
        </div>
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
    const gradeBlock = document.getElementById('modal-class-grade-block')?.value?.trim() || '12-Toán'
    const tuitionFee = parseFloat(document.getElementById('modal-class-tuition')?.value) || 0

    if (!name) {
      showToast('Vui lòng nhập tên lớp học!', 'error')
      return false
    }

    try {
      showToast('Đang tạo lớp học...', 'info')
      const createdClass = await api.createClass({ name, gradeBlock, tuitionFee })
      
      const newClass = {
        id: createdClass.id,
        name: createdClass.name,
        gradeBlock: createdClass.gradeBlock || gradeBlock,
        studentsCount: 0,
        tuitionFee: createdClass.tuitionFee || 0,
        progress: 0
      }

      state.classes.unshift(newClass)
      updateClassTable(newClass)
      showToast(`Đã tạo thành công lớp học "${name}" (${newClass.gradeBlock})!`, 'success')
    } catch (err) {
      showToast(`Tạo lớp học thất bại: ${err.message}`, 'error')
    }
  })

  // Bind inline quick-create toggle
  const toggleBtn = document.getElementById('btn-toggle-new-block-create')
  const inlineBox = document.getElementById('inline-create-block-create-box')
  const inlineInput = document.getElementById('inline-new-block-create-input')
  const inlineSaveBtn = document.getElementById('inline-btn-save-block-create')
  const blockSelect = document.getElementById('modal-class-grade-block')

  toggleBtn?.addEventListener('click', () => {
    if (!inlineBox) return
    const isHidden = inlineBox.style.display === 'none'
    inlineBox.style.display = isHidden ? 'block' : 'none'
    if (isHidden && inlineInput) inlineInput.focus()
  })

  inlineSaveBtn?.addEventListener('click', async () => {
    const newName = inlineInput?.value?.trim()
    if (!newName) {
      return showToast('Vui lòng nhập tên khối mới!', 'warning')
    }

    inlineSaveBtn.disabled = true
    inlineSaveBtn.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i>'

    try {
      const created = await api.createGradeBlock({ name: newName })
      showToast(`Đã tạo khối "${newName}" thành công!`, 'success')

      // Add to select and select it
      if (blockSelect) {
        const opt = document.createElement('option')
        opt.value = created.name || newName
        opt.textContent = created.name || newName
        opt.selected = true
        blockSelect.appendChild(opt)
        blockSelect.value = created.name || newName
      }

      // Add to cachedGradeBlocks
      cachedGradeBlocks.push(created)

      // Hide inline box
      if (inlineBox) inlineBox.style.display = 'none'
      if (inlineInput) inlineInput.value = ''
    } catch (err) {
      showToast('Tạo khối thất bại: ' + err.message, 'error')
    } finally {
      inlineSaveBtn.disabled = false
      inlineSaveBtn.innerHTML = 'Lưu & Chọn'
    }
  })
}

export async function showEditClassModal(classId) {
  const currentClass = state.classes.find(c => c.id === classId)
  if (!currentClass) {
    showToast('Không tìm thấy thông tin lớp học!', 'error')
    return
  }

  const blocks = await fetchGradeBlocks()

  const modalHTML = `
    <form id="edit-class-modal-form" onsubmit="return false;" style="display:flex; flex-direction:column; gap:16px;">
      <div>
        <label style="font-size:13px; font-weight:600; color:#334155; display:block; margin-bottom:6px;">
          <i class="fa-solid fa-book-bookmark" style="color:#0066cc;"></i> Tên lớp học <span style="color:#ef4444;">*</span>
        </label>
        <input type="text" id="modal-class-name" class="form-input" value="${currentClass.name}" placeholder="Ví dụ: Lớp Toán 12 Nâng Cao" required>
      </div>
      <div>
        <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:6px;">
          <label style="font-size:13px; font-weight:600; color:#334155; margin:0;">
            <i class="fa-solid fa-layer-group" style="color:#6366f1;"></i> Chọn khối học <span style="color:#ef4444;">*</span>
          </label>
          <button type="button" id="btn-toggle-new-block-edit" style="background:none; border:none; color:#0066cc; font-size:12px; font-weight:600; cursor:pointer; padding:0; display:inline-flex; align-items:center; gap:4px;">
            <i class="fa-solid fa-circle-plus"></i> + Tạo khối mới
          </button>
        </div>
        <select id="modal-class-grade-block" class="form-input" required>
          ${blocks.map(b => `<option value="${b.name}" ${b.name === (currentClass.gradeBlock || '12-Toán') ? 'selected' : ''}>${b.name}${b.description ? ` (${b.description})` : ''}</option>`).join('')}
        </select>

        <!-- Inline quick block creator -->
        <div id="inline-create-block-edit-box" style="display:none; margin-top:8px; padding:12px; border:1px dashed #93c5fd; border-radius:8px; background:#eff6ff;">
          <div style="font-size:12px; font-weight:700; color:#1e40af; margin-bottom:6px;">
            <i class="fa-solid fa-folder-plus"></i> Tạo nhanh khối học mới
          </div>
          <div style="display:flex; gap:8px; align-items:center;">
            <input type="text" id="inline-new-block-edit-input" placeholder="Nhập tên khối mới (VD: 10-Toán, 10-Hóa...)" style="flex:1; height:38px; border:1px solid #cbd5e1; border-radius:8px; padding:0 12px; font-size:13px; background:#ffffff; box-sizing:border-box;" />
            <button type="button" id="inline-btn-save-block-edit" class="btn-primary" style="height:38px; padding:0 14px; font-size:12px; border-radius:8px; background:#0066cc; color:#fff; border:none; cursor:pointer; white-space:nowrap; width:auto;">
              Lưu & Chọn
            </button>
          </div>
        </div>
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
    const gradeBlock = document.getElementById('modal-class-grade-block')?.value?.trim() || '12-Toán'
    const tuitionFee = parseFloat(document.getElementById('modal-class-tuition')?.value) || 0

    if (!name) {
      showToast('Vui lòng nhập tên lớp học!', 'error')
      return false
    }

    try {
      showToast('Đang cập nhật lớp học...', 'info')
      const updatedClass = await api.updateClass({ classId, name, gradeBlock, tuitionFee })
      
      // Update local state
      const idx = state.classes.findIndex(c => c.id === classId)
      if (idx !== -1) {
        state.classes[idx].name = updatedClass.name
        state.classes[idx].gradeBlock = updatedClass.gradeBlock || gradeBlock
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

  // Bind inline quick-create toggle
  const toggleBtn = document.getElementById('btn-toggle-new-block-edit')
  const inlineBox = document.getElementById('inline-create-block-edit-box')
  const inlineInput = document.getElementById('inline-new-block-edit-input')
  const inlineSaveBtn = document.getElementById('inline-btn-save-block-edit')
  const blockSelect = document.getElementById('modal-class-grade-block')

  toggleBtn?.addEventListener('click', () => {
    if (!inlineBox) return
    const isHidden = inlineBox.style.display === 'none'
    inlineBox.style.display = isHidden ? 'block' : 'none'
    if (isHidden && inlineInput) inlineInput.focus()
  })

  inlineSaveBtn?.addEventListener('click', async () => {
    const newName = inlineInput?.value?.trim()
    if (!newName) {
      return showToast('Vui lòng nhập tên khối mới!', 'warning')
    }

    inlineSaveBtn.disabled = true
    inlineSaveBtn.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i>'

    try {
      const created = await api.createGradeBlock({ name: newName })
      showToast(`Đã tạo khối "${newName}" thành công!`, 'success')

      if (blockSelect) {
        const opt = document.createElement('option')
        opt.value = created.name || newName
        opt.textContent = created.name || newName
        opt.selected = true
        blockSelect.appendChild(opt)
        blockSelect.value = created.name || newName
      }

      cachedGradeBlocks.push(created)

      if (inlineBox) inlineBox.style.display = 'none'
      if (inlineInput) inlineInput.value = ''
    } catch (err) {
      showToast('Tạo khối thất bại: ' + err.message, 'error')
    } finally {
      inlineSaveBtn.disabled = false
      inlineSaveBtn.innerHTML = 'Lưu & Chọn'
    }
  })
}

// Modal: Quản lý danh sách Khối học
export async function showGradeBlockManagementModal() {
  const blocks = await fetchGradeBlocks()

  const renderBlocksTable = () => {
    return (cachedGradeBlocks || []).map(b => {
      const count = (state.classes || []).filter(c => (c.gradeBlock || '12-Toán') === b.name).length
      return `
        <tr id="row-block-${b.id || b.name}">
          <td style="padding:10px 14px;">
            <span class="badge" style="background:#e0f2fe; color:#0369a1; font-weight:700; padding:4px 10px; border-radius:6px; font-size:12px; border:1px solid #bae6fd; display:inline-flex; align-items:center; gap:5px;">
              <i class="fa-solid fa-layer-group" style="font-size:11px;"></i>${b.name}
            </span>
          </td>
          <td style="padding:10px 14px; font-size:13px; color:#64748b;">
            ${b.description || '<em style="color:#94a3b8;">Không có mô tả</em>'}
          </td>
          <td style="padding:10px 14px; font-size:13px; font-weight:600; color:#1e293b;">
            <i class="fa-solid fa-graduation-cap" style="color:#64748b; margin-right:4px;"></i> ${count} lớp học
          </td>
          <td style="padding:10px 14px; text-align:right;">
            ${count === 0 ? `
              <button class="btn-delete-grade-block" data-id="${b.id}" data-name="${b.name}" style="background:none; border:none; color:#ef4444; cursor:pointer; font-size:14px; padding:4px;" title="Xóa khối">
                <i class="fa-solid fa-trash-can"></i>
              </button>
            ` : `
              <span style="font-size:11px; color:#94a3b8;" title="Đang có lớp thuộc khối này, không thể xóa">
                <i class="fa-solid fa-lock"></i> Đang dùng
              </span>
            `}
          </td>
        </tr>
      `
    }).join('')
  }

  const modalHTML = `
    <div style="display:flex; flex-direction:column; gap:18px;">
      <!-- Create new block form -->
      <div style="background:#f8fafc; border:1px solid #e2e8f0; border-radius:12px; padding:16px;">
        <div style="font-size:13px; font-weight:700; color:#1e293b; margin-bottom:10px; display:flex; align-items:center; gap:6px;">
          <i class="fa-solid fa-plus-circle" style="color:#0284c7;"></i> Thêm khối học mới
        </div>
        <div style="display:flex; gap:10px; flex-wrap:wrap; align-items:center;">
          <div style="flex:1; min-width:180px;">
            <input type="text" id="mgmt-new-block-name" class="form-input" placeholder="Tên khối (VD: 10-Toán, 10-Hóa...)" style="height:38px; width:100%; padding:0 12px; border-radius:8px;" required />
          </div>
          <div style="flex:1.5; min-width:200px;">
            <input type="text" id="mgmt-new-block-desc" class="form-input" placeholder="Mô tả (tùy chọn)" style="height:38px; width:100%; padding:0 12px; border-radius:8px;" />
          </div>
          <button type="button" id="mgmt-btn-add-block" class="btn-primary" style="height:38px; padding:0 16px; font-size:13px; border-radius:8px; background:#0066cc; color:#fff; border:none; cursor:pointer; white-space:nowrap; display:inline-flex; align-items:center; gap:6px; width:auto;">
            <i class="fa-solid fa-plus"></i> Tạo khối
          </button>
        </div>
      </div>

      <!-- Grade blocks list -->
      <div>
        <div style="font-size:13px; font-weight:700; color:#334155; margin-bottom:8px;">
          Danh sách khối học hiện có (<span id="mgmt-blocks-count">${cachedGradeBlocks.length}</span> khối)
        </div>
        <div style="border:1px solid #e2e8f0; border-radius:10px; overflow:hidden; max-height:280px; overflow-y:auto;">
          <table style="width:100%; border-collapse:collapse; text-align:left;">
            <thead style="background:#f8fafc; border-bottom:1px solid #e2e8f0; position:sticky; top:0; z-index:1;">
              <tr>
                <th style="padding:10px 14px; font-size:12px; font-weight:600; color:#475569;">Tên khối</th>
                <th style="padding:10px 14px; font-size:12px; font-weight:600; color:#475569;">Mô tả</th>
                <th style="padding:10px 14px; font-size:12px; font-weight:600; color:#475569;">Số lớp</th>
                <th style="padding:10px 14px; font-size:12px; font-weight:600; color:#475569; text-align:right;">Thao tác</th>
              </tr>
            </thead>
            <tbody id="mgmt-blocks-tbody">
              ${renderBlocksTable()}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  `

  openModal('Quản Lý Danh Sách Khối Học', modalHTML, null)

  const bindDeleteBlockButtons = () => {
    document.querySelectorAll('.btn-delete-grade-block').forEach(btn => {
      btn.onclick = async () => {
        const id = btn.getAttribute('data-id')
        const name = btn.getAttribute('data-name')
        if (!confirm(`Bạn có chắc muốn xóa khối "${name}"?`)) return

        try {
          showToast('Đang xóa khối...', 'info')
          await api.deleteGradeBlock(id)
          cachedGradeBlocks = cachedGradeBlocks.filter(b => b.id !== id)
          
          const tbody = document.getElementById('mgmt-blocks-tbody')
          if (tbody) tbody.innerHTML = renderBlocksTable()
          const countEl = document.getElementById('mgmt-blocks-count')
          if (countEl) countEl.textContent = cachedGradeBlocks.length
          
          bindDeleteBlockButtons()
          showToast(`Đã xóa khối "${name}" thành công!`, 'success')
        } catch (err) {
          showToast('Xóa khối thất bại: ' + err.message, 'error')
        }
      }
    })
  }

  bindDeleteBlockButtons()

  // Add block
  document.getElementById('mgmt-btn-add-block')?.addEventListener('click', async () => {
    const nameInput = document.getElementById('mgmt-new-block-name')
    const descInput = document.getElementById('mgmt-new-block-desc')
    const name = nameInput?.value?.trim()
    const description = descInput?.value?.trim() || null

    if (!name) {
      return showToast('Vui lòng nhập tên khối!', 'warning')
    }

    const btn = document.getElementById('mgmt-btn-add-block')
    btn.disabled = true
    btn.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i>'

    try {
      const created = await api.createGradeBlock({ name, description })
      cachedGradeBlocks.push(created)

      const tbody = document.getElementById('mgmt-blocks-tbody')
      if (tbody) tbody.innerHTML = renderBlocksTable()
      const countEl = document.getElementById('mgmt-blocks-count')
      if (countEl) countEl.textContent = cachedGradeBlocks.length

      if (nameInput) nameInput.value = ''
      if (descInput) descInput.value = ''

      bindDeleteBlockButtons()
      showToast(`Đã tạo thành công khối "${name}"!`, 'success')
    } catch (err) {
      showToast('Tạo khối thất bại: ' + err.message, 'error')
    } finally {
      btn.disabled = false
      btn.innerHTML = '<i class="fa-solid fa-plus"></i> Tạo khối'
    }
  })
}

export function bindClassMgmtEvents() {
  bindSidebarEvents()
  bindClassTableActionEvents()
  fetchGradeBlocks().catch(() => {})

  const manageBlocksBtn = document.getElementById('open-manage-grade-blocks-btn')
  if (manageBlocksBtn) {
    manageBlocksBtn.addEventListener('click', (e) => {
      e.preventDefault()
      window.location.hash = '#grade-blocks'
    })
  }

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
      return !query || c.name.toLowerCase().includes(query) || (c.gradeBlock && c.gradeBlock.toLowerCase().includes(query))
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
    <div class="full-width-mobile" style="display:flex; flex-direction:column; gap:20px; width: 500px; max-width:100%;">
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
