import { renderSidebar, bindSidebarEvents } from '../components/sidebar.js'
import { renderNavbar } from '../components/navbar.js'
import { openModal } from '../components/modal.js'
import { showToast } from '../components/toast.js'
import { api } from '../api.js'
import { renderPaginationBar, bindPaginationEvents } from '../components/pagination.js'

let cachedGradeBlocks = []
let searchQuery = ''
let currentPage = 1
let pageSize = 10
let isLoading = false

export async function fetchGradeBlocksData() {
  isLoading = true
  try {
    const res = await api.getGradeBlocks({ includeStats: true })
    if (Array.isArray(res)) {
      cachedGradeBlocks = res
    } else if (res && Array.isArray(res.data)) {
      cachedGradeBlocks = res.data
    } else {
      cachedGradeBlocks = []
    }
  } catch (e) {
    console.error('[GradeBlocksView] Failed to fetch grade blocks:', e)
    showToast(e.message || 'Không thể tải danh sách khối học', 'error')
  } finally {
    isLoading = false
  }
  return cachedGradeBlocks
}

function getFilteredBlocks() {
  const q = searchQuery.toLowerCase().trim()
  if (!q) return cachedGradeBlocks

  return cachedGradeBlocks.filter(b => {
    const matchName = b.name && b.name.toLowerCase().includes(q)
    const matchDesc = b.description && b.description.toLowerCase().includes(q)
    return matchName || matchDesc
  })
}

export function renderGradeBlocksView() {
  const filtered = getFilteredBlocks()
  const totalItems = filtered.length
  const totalPages = Math.max(1, Math.ceil(totalItems / pageSize))
  if (currentPage > totalPages) currentPage = totalPages

  const from = (currentPage - 1) * pageSize
  const pagedBlocks = filtered.slice(from, from + pageSize)

  // Calculate statistics
  const totalBlocks = cachedGradeBlocks.length
  const totalClasses = cachedGradeBlocks.reduce((sum, b) => sum + (Number(b.classesCount) || 0), 0)
  const totalQuestions = cachedGradeBlocks.reduce((sum, b) => sum + (Number(b.questionsCount) || 0), 0)

  return `
    <div class="app-layout">
      ${renderSidebar('grade-blocks')}
      <div class="main-content">
        ${renderNavbar('Nền tảng / Quản trị viên')}
        <div class="content-body">
          <!-- Page Header -->
          <div class="page-header" style="display:flex; justify-content:space-between; align-items:center; flex-wrap:wrap; gap:16px; margin-bottom:24px;">
            <div>
              <h1 class="page-title" style="display:flex; align-items:center; gap:10px;">
                <i class="fa-solid fa-layer-group" style="color:#0284c7;"></i> Quản lý khối học
              </h1>
              <p class="page-description">Quản lý danh mục các khối chuyên đề, phân bổ lớp học và liên kết câu hỏi theo khối.</p>
            </div>
            <div style="display:flex; gap:12px; align-items:center;">
              <button class="btn-primary" id="open-create-block-modal-btn" style="display:inline-flex; align-items:center; gap:8px; padding:10px 18px; font-weight:600; cursor:pointer;">
                <i class="fa-solid fa-plus"></i> Tạo khối mới
              </button>
            </div>
          </div>

          <!-- KPI Stats Overview -->
          <div class="grid-3" style="margin-bottom:24px;">
            <div class="card" style="padding:18px 20px; display:flex; align-items:center; gap:16px; margin-bottom:0; border-left:4px solid #0284c7;">
              <div style="width:48px; height:48px; border-radius:12px; background:#e0f2fe; color:#0284c7; display:flex; align-items:center; justify-content:center; font-size:22px;">
                <i class="fa-solid fa-layer-group"></i>
              </div>
              <div>
                <div style="font-size:24px; font-weight:800; color:#0f172a; line-height:1.2;">${totalBlocks}</div>
                <div style="font-size:13px; color:#64748b; font-weight:500;">Tổng số khối học</div>
              </div>
            </div>

            <div class="card" style="padding:18px 20px; display:flex; align-items:center; gap:16px; margin-bottom:0; border-left:4px solid #10b981;">
              <div style="width:48px; height:48px; border-radius:12px; background:#d1fae5; color:#10b981; display:flex; align-items:center; justify-content:center; font-size:22px;">
                <i class="fa-solid fa-book-bookmark"></i>
              </div>
              <div>
                <div style="font-size:24px; font-weight:800; color:#0f172a; line-height:1.2;">${totalClasses}</div>
                <div style="font-size:13px; color:#64748b; font-weight:500;">Lớp học đã phân khối</div>
              </div>
            </div>

            <div class="card" style="padding:18px 20px; display:flex; align-items:center; gap:16px; margin-bottom:0; border-left:4px solid #8b5cf6;">
              <div style="width:48px; height:48px; border-radius:12px; background:#ede9fe; color:#8b5cf6; display:flex; align-items:center; justify-content:center; font-size:22px;">
                <i class="fa-solid fa-boxes-stacked"></i>
              </div>
              <div>
                <div style="font-size:24px; font-weight:800; color:#0f172a; line-height:1.2;">${totalQuestions}</div>
                <div style="font-size:13px; color:#64748b; font-weight:500;">Câu hỏi trong ngân hàng</div>
              </div>
            </div>
          </div>

          <!-- Main Table Card -->
          <div class="card">
            <!-- Filter Bar -->
            <div class="flex-wrap-mobile" style="display:flex; justify-content:space-between; align-items:center; margin-bottom:20px; gap:16px;">
              <div class="search-box full-width-mobile" style="width: 100%; max-width: 380px;">
                <i class="fa-solid fa-magnifying-glass"></i>
                <input type="text" id="grade-block-search-input" placeholder="Tìm kiếm theo tên khối hoặc mô tả..." value="${searchQuery}">
              </div>
              <div style="display:flex; align-items:center; gap:8px;">
                <button class="btn-secondary" id="refresh-grade-blocks-btn" style="padding:9px 14px; font-size:13px; border-radius:8px; cursor:pointer; display:inline-flex; align-items:center; gap:6px;">
                  <i class="fa-solid fa-rotate-right"></i> Làm mới
                </button>
              </div>
            </div>

            <!-- Table -->
            <div class="table-responsive">
              <table class="data-table">
                <thead>
                  <tr>
                    <th style="width:180px;">Tên khối học</th>
                    <th>Mô tả chi tiết</th>
                    <th style="width:240px;">Lớp học áp dụng</th>
                    <th style="width:160px; text-align:center;">Ngân hàng câu hỏi</th>
                    <th style="width:140px;">Ngày tạo</th>
                    <th style="width:140px; text-align:right;">Thao tác</th>
                  </tr>
                </thead>
                <tbody id="grade-blocks-table-body">
                  ${isLoading ? `
                    <tr>
                      <td colspan="6" style="text-align:center; padding:40px; color:#64748b;">
                        <i class="fa-solid fa-spinner fa-spin" style="font-size:20px; color:#0284c7; margin-bottom:8px;"></i>
                        <div>Đang tải danh sách khối học...</div>
                      </td>
                    </tr>
                  ` : pagedBlocks.length === 0 ? `
                    <tr>
                      <td colspan="6" style="text-align:center; padding:40px; color:#64748b;">
                        <i class="fa-regular fa-folder-open" style="font-size:28px; color:#94a3b8; margin-bottom:8px; display:block;"></i>
                        Không tìm thấy khối học nào phù hợp.
                      </td>
                    </tr>
                  ` : pagedBlocks.map(b => renderGradeBlockRow(b)).join('')}
                </tbody>
              </table>
            </div>

            <!-- Pagination -->
            <div id="grade-block-pagination-wrapper">
              ${renderPaginationBar({
                currentPage,
                totalItems,
                pageSize,
                containerId: 'grade-block-pagination-container',
                pageSizeOptions: [10, 20, 50]
              })}
            </div>
          </div>
        </div>
      </div>
    </div>
  `
}

function renderGradeBlockRow(b) {
  const classesList = b.classesList || []
  const classesCount = Number(b.classesCount) || 0
  const questionsCount = Number(b.questionsCount) || 0

  // Render class tags
  let classTagsHtml = ''
  if (classesList.length > 0) {
    const displayed = classesList.slice(0, 3)
    const remaining = classesList.length - 3
    classTagsHtml = `
      <div style="display:flex; flex-wrap:wrap; gap:4px; align-items:center;">
        ${displayed.map(clsName => `
          <span style="background:#f1f5f9; color:#334155; padding:3px 8px; border-radius:6px; font-size:11px; font-weight:600; border:1px solid #e2e8f0;">
            ${clsName}
          </span>
        `).join('')}
        ${remaining > 0 ? `
          <span style="background:#e2e8f0; color:#475569; padding:2px 6px; border-radius:6px; font-size:10px; font-weight:700;">
            +${remaining}
          </span>
        ` : ''}
        <span style="font-size:11px; color:#64748b; margin-left:4px;">(${classesCount} lớp)</span>
      </div>
    `
  } else {
    classTagsHtml = `<span style="color:#94a3b8; font-size:12px; font-style:italic;">Chưa có lớp nào</span>`
  }

  // Format created date
  let formattedDate = '--'
  if (b.created_at) {
    try {
      const d = new Date(b.created_at)
      formattedDate = d.toLocaleDateString('vi-VN', { year: 'numeric', month: '2-digit', day: '2-digit' })
    } catch (e) {}
  }

  return `
    <tr id="row-grade-block-${b.id}">
      <td>
        <div style="display:flex; align-items:center; gap:8px;">
          <span style="background:#e0f2fe; color:#0369a1; padding:6px 12px; border-radius:8px; font-weight:700; font-size:13px; display:inline-flex; align-items:center; gap:6px; border:1px solid #bae6fd;">
            <i class="fa-solid fa-layer-group" style="font-size:11px;"></i>
            ${b.name}
          </span>
        </div>
      </td>
      <td>
        <div style="color:#334155; font-size:13px; max-width:320px; overflow:hidden; text-overflow:ellipsis;">
          ${b.description ? b.description : '<span style="color:#94a3b8; font-style:italic;">Chưa có mô tả</span>'}
        </div>
      </td>
      <td>
        ${classTagsHtml}
      </td>
      <td style="text-align:center;">
        <span onclick="window.location.hash='#question-bank'" style="cursor:pointer; background:#ede9fe; color:#6d28d9; padding:4px 10px; border-radius:12px; font-size:12px; font-weight:700; display:inline-flex; align-items:center; gap:5px; border:1px solid #ddd6fe;" title="Xem trong ngân hàng câu hỏi">
          <i class="fa-solid fa-boxes-stacked" style="font-size:11px;"></i>
          ${questionsCount} câu
        </span>
      </td>
      <td>
        <span style="color:#64748b; font-size:12px;">${formattedDate}</span>
      </td>
      <td style="text-align:right;">
        <div style="display:inline-flex; gap:6px; justify-content:flex-end;">
          <button class="btn-action-icon btn-edit-grade-block" data-id="${b.id}" data-name="${b.name}" data-description="${b.description || ''}" title="Chỉnh sửa khối" style="width:32px; height:32px; border-radius:8px; background:#f8fafc; border:1px solid #e2e8f0; color:#0284c7; cursor:pointer; display:inline-flex; align-items:center; justify-content:center;">
            <i class="fa-solid fa-pen-to-square"></i>
          </button>
          <button class="btn-action-icon btn-delete-grade-block" data-id="${b.id}" data-name="${b.name}" data-classes-count="${classesCount}" title="${classesCount > 0 ? 'Không thể xóa khối đang có lớp học' : 'Xóa khối'}" style="width:32px; height:32px; border-radius:8px; background:#f8fafc; border:1px solid #e2e8f0; color:${classesCount > 0 ? '#94a3b8' : '#ef4444'}; cursor:pointer; display:inline-flex; align-items:center; justify-content:center;">
            <i class="fa-solid fa-trash-can"></i>
          </button>
        </div>
      </td>
    </tr>
  `
}

export function bindGradeBlocksEvents() {
  bindSidebarEvents()

  // 1. Refresh Button
  document.getElementById('refresh-grade-blocks-btn')?.addEventListener('click', async () => {
    const btn = document.getElementById('refresh-grade-blocks-btn')
    if (btn) btn.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> Đang tải...'
    await fetchGradeBlocksData()
    renderCurrentTable()
    if (btn) btn.innerHTML = '<i class="fa-solid fa-rotate-right"></i> Làm mới'
    showToast('Đã làm mới danh sách khối học', 'info')
  })

  // 2. Search Input
  const searchInput = document.getElementById('grade-block-search-input')
  if (searchInput) {
    let timeout = null
    searchInput.addEventListener('input', (e) => {
      clearTimeout(timeout)
      timeout = setTimeout(() => {
        searchQuery = e.target.value
        currentPage = 1
        renderCurrentTable()
      }, 250)
    })
  }

  // 3. Open Create Modal
  document.getElementById('open-create-block-modal-btn')?.addEventListener('click', () => {
    showCreateGradeBlockModal()
  })

  // 4. Delegated Row Action Events (Edit & Delete)
  attachRowActionListeners()

  // 5. Initial Data Load if empty
  if (cachedGradeBlocks.length === 0) {
    fetchGradeBlocksData().then(() => {
      renderCurrentTable()
    })
  }
}

function renderCurrentTable() {
  const filtered = getFilteredBlocks()
  const totalItems = filtered.length
  const totalPages = Math.max(1, Math.ceil(totalItems / pageSize))
  if (currentPage > totalPages) currentPage = totalPages

  const from = (currentPage - 1) * pageSize
  const pagedBlocks = filtered.slice(from, from + pageSize)

  const tbody = document.getElementById('grade-blocks-table-body')
  if (tbody) {
    if (isLoading) {
      tbody.innerHTML = `
        <tr>
          <td colspan="6" style="text-align:center; padding:40px; color:#64748b;">
            <i class="fa-solid fa-spinner fa-spin" style="font-size:20px; color:#0284c7; margin-bottom:8px;"></i>
            <div>Đang tải danh sách khối học...</div>
          </td>
        </tr>
      `
    } else if (pagedBlocks.length === 0) {
      tbody.innerHTML = `
        <tr>
          <td colspan="6" style="text-align:center; padding:40px; color:#64748b;">
            <i class="fa-regular fa-folder-open" style="font-size:28px; color:#94a3b8; margin-bottom:8px; display:block;"></i>
            Không tìm thấy khối học nào phù hợp.
          </td>
        </tr>
      `
    } else {
      tbody.innerHTML = pagedBlocks.map(b => renderGradeBlockRow(b)).join('')
    }
  }

  // Update Pagination Bar
  const pagWrapper = document.getElementById('grade-block-pagination-wrapper')
  if (pagWrapper) {
    pagWrapper.innerHTML = renderPaginationBar({
      currentPage,
      totalItems,
      pageSize,
      containerId: 'grade-block-pagination-container',
      pageSizeOptions: [10, 20, 50]
    })

    bindPaginationEvents({
      containerId: 'grade-block-pagination-container',
      onPageChange: (newPage) => {
        currentPage = newPage
        renderCurrentTable()
      },
      onPageSizeChange: (newSize) => {
        pageSize = newSize
        currentPage = 1
        renderCurrentTable()
      }
    })
  }

  attachRowActionListeners()
}

function attachRowActionListeners() {
  // Edit buttons
  document.querySelectorAll('.btn-edit-grade-block').forEach(btn => {
    btn.onclick = (e) => {
      e.stopPropagation()
      const id = btn.dataset.id
      const name = btn.dataset.name
      const description = btn.dataset.description
      showEditGradeBlockModal({ id, name, description })
    }
  })

  // Delete buttons
  document.querySelectorAll('.btn-delete-grade-block').forEach(btn => {
    btn.onclick = (e) => {
      e.stopPropagation()
      const id = btn.dataset.id
      const name = btn.dataset.name
      const classesCount = Number(btn.dataset.classesCount) || 0
      showDeleteGradeBlockConfirmation(id, name, classesCount)
    }
  })
}

// ==========================================
// MODALS: Create, Edit, Delete
// ==========================================

export function showCreateGradeBlockModal() {
  const modalHtml = `
    <div style="padding:4px 0;">
      <p style="color:#64748b; font-size:13px; margin-bottom:18px;">
        Thêm khối học mới vào danh mục hệ thống. Sau khi tạo, bạn có thể gán khối này cho các lớp học và ngân hàng câu hỏi.
      </p>

      <form id="create-grade-block-form">
        <div class="form-group" style="margin-bottom:16px;">
          <label style="display:block; font-size:13px; font-weight:700; color:#1e293b; margin-bottom:6px;">
            Tên khối học <span style="color:#ef4444;">*</span>
          </label>
          <input 
            type="text" 
            id="modal-create-block-name" 
            class="form-input" 
            placeholder="Ví dụ: 10-Toán, 10-Hóa, Luyện thi ĐGNL..." 
            style="width:100%; height:40px; font-size:14px;" 
            required 
            autofocus 
          />
          <div style="font-size:11px; color:#64748b; margin-top:4px;">Nên đặt theo định dạng chuẩn: [Lớp]-[Môn], ví dụ: 10-Toán, 11-Hóa.</div>
        </div>

        <div class="form-group" style="margin-bottom:20px;">
          <label style="display:block; font-size:13px; font-weight:700; color:#1e293b; margin-bottom:6px;">
            Mô tả khối học (Tùy chọn)
          </label>
          <textarea 
            id="modal-create-block-desc" 
            class="form-input" 
            placeholder="Nhập mô tả hoặc ghi chú cho khối học này..." 
            rows="3" 
            style="width:100%; font-size:13px; padding:10px 12px; resize:vertical;"
          ></textarea>
        </div>

        <div style="display:flex; justify-content:flex-end; gap:10px; margin-top:24px; padding-top:16px; border-top:1px solid #f1f5f9;">
          <button type="button" class="btn-secondary" id="modal-cancel-create-block-btn" style="padding:9px 18px; border-radius:8px; cursor:pointer;">
            Hủy bỏ
          </button>
          <button type="submit" class="btn-primary" id="modal-submit-create-block-btn" style="display:inline-flex; align-items:center; gap:8px; padding:9px 20px; border-radius:8px; cursor:pointer;">
            <i class="fa-solid fa-check"></i> Tạo khối học
          </button>
        </div>
      </form>
    </div>
  `

  openModal('Tạo khối học mới', modalHtml)

  document.getElementById('modal-cancel-create-block-btn')?.addEventListener('click', () => {
    document.querySelector('.modal-overlay')?.remove()
  })

  document.getElementById('create-grade-block-form')?.addEventListener('submit', async (e) => {
    e.preventDefault()
    const name = document.getElementById('modal-create-block-name')?.value?.trim()
    const description = document.getElementById('modal-create-block-desc')?.value?.trim()

    if (!name) {
      showToast('Vui lòng nhập tên khối học', 'warning')
      return
    }

    const submitBtn = document.getElementById('modal-submit-create-block-btn')
    if (submitBtn) {
      submitBtn.disabled = true
      submitBtn.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> Đang tạo...'
    }

    try {
      await api.createGradeBlock({ name, description })
      showToast(`Đã tạo khối "${name}" thành công!`, 'success')
      document.querySelector('.modal-overlay')?.remove()

      // Reload data
      await fetchGradeBlocksData()
      renderCurrentTable()
    } catch (err) {
      console.error('[CreateGradeBlock] Error:', err)
      showToast(err.message || 'Lỗi khi tạo khối học', 'error')
      if (submitBtn) {
        submitBtn.disabled = false
        submitBtn.innerHTML = '<i class="fa-solid fa-check"></i> Tạo khối học'
      }
    }
  })
}

export function showEditGradeBlockModal(block) {
  const modalHtml = `
    <div style="padding:4px 0;">
      <div style="background:#fffbeb; border:1px solid #fde68a; border-radius:8px; padding:12px 14px; margin-bottom:18px; display:flex; gap:10px; align-items:flex-start;">
        <i class="fa-solid fa-triangle-exclamation" style="color:#d97706; font-size:16px; margin-top:2px;"></i>
        <div style="font-size:12px; color:#92400e; line-height:1.5;">
          <strong>Lưu ý đồng bộ:</strong> Nếu bạn thay đổi tên khối, hệ thống sẽ <strong>tự động cập nhật tên mới</strong> cho toàn bộ các lớp học và câu hỏi trong ngân hàng đang liên kết với khối này.
        </div>
      </div>

      <form id="edit-grade-block-form">
        <input type="hidden" id="modal-edit-block-id" value="${block.id}" />

        <div class="form-group" style="margin-bottom:16px;">
          <label style="display:block; font-size:13px; font-weight:700; color:#1e293b; margin-bottom:6px;">
            Tên khối học <span style="color:#ef4444;">*</span>
          </label>
          <input 
            type="text" 
            id="modal-edit-block-name" 
            class="form-input" 
            value="${block.name}" 
            style="width:100%; height:40px; font-size:14px;" 
            required 
            autofocus 
          />
        </div>

        <div class="form-group" style="margin-bottom:20px;">
          <label style="display:block; font-size:13px; font-weight:700; color:#1e293b; margin-bottom:6px;">
            Mô tả khối học
          </label>
          <textarea 
            id="modal-edit-block-desc" 
            class="form-input" 
            rows="3" 
            style="width:100%; font-size:13px; padding:10px 12px; resize:vertical;"
          >${block.description || ''}</textarea>
        </div>

        <div style="display:flex; justify-content:flex-end; gap:10px; margin-top:24px; padding-top:16px; border-top:1px solid #f1f5f9;">
          <button type="button" class="btn-secondary" id="modal-cancel-edit-block-btn" style="padding:9px 18px; border-radius:8px; cursor:pointer;">
            Hủy bỏ
          </button>
          <button type="submit" class="btn-primary" id="modal-submit-edit-block-btn" style="display:inline-flex; align-items:center; gap:8px; padding:9px 20px; border-radius:8px; cursor:pointer;">
            <i class="fa-solid fa-floppy-disk"></i> Lưu thay đổi
          </button>
        </div>
      </form>
    </div>
  `

  openModal(`Chỉnh sửa khối: ${block.name}`, modalHtml)

  document.getElementById('modal-cancel-edit-block-btn')?.addEventListener('click', () => {
    document.querySelector('.modal-overlay')?.remove()
  })

  document.getElementById('edit-grade-block-form')?.addEventListener('submit', async (e) => {
    e.preventDefault()
    const id = document.getElementById('modal-edit-block-id')?.value
    const name = document.getElementById('modal-edit-block-name')?.value?.trim()
    const description = document.getElementById('modal-edit-block-desc')?.value?.trim()

    if (!name) {
      showToast('Tên khối không được để trống', 'warning')
      return
    }

    const submitBtn = document.getElementById('modal-submit-edit-block-btn')
    if (submitBtn) {
      submitBtn.disabled = true
      submitBtn.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> Đang lưu...'
    }

    try {
      await api.updateGradeBlock({ id, name, description })
      showToast(`Đã cập nhật khối "${name}" thành công!`, 'success')
      document.querySelector('.modal-overlay')?.remove()

      // Reload data
      await fetchGradeBlocksData()
      renderCurrentTable()
    } catch (err) {
      console.error('[EditGradeBlock] Error:', err)
      showToast(err.message || 'Lỗi khi cập nhật khối học', 'error')
      if (submitBtn) {
        submitBtn.disabled = false
        submitBtn.innerHTML = '<i class="fa-solid fa-floppy-disk"></i> Lưu thay đổi'
      }
    }
  })
}

export function showDeleteGradeBlockConfirmation(id, name, classesCount) {
  if (classesCount > 0) {
    const blockedHtml = `
      <div style="padding:6px 0; text-align:center;">
        <div style="width:52px; height:52px; border-radius:50%; background:#fee2e2; color:#ef4444; display:inline-flex; align-items:center; justify-content:center; font-size:24px; margin-bottom:16px;">
          <i class="fa-solid fa-ban"></i>
        </div>
        <h3 style="font-size:16px; font-weight:700; color:#1e293b; margin-bottom:8px;">Không thể xóa khối học</h3>
        <p style="font-size:13px; color:#64748b; line-height:1.5; margin-bottom:20px;">
          Khối <strong>"${name}"</strong> hiện đang có <strong>${classesCount} lớp học</strong> liên kết.<br/>
          Để bảo toàn tính toàn vẹn dữ liệu, bạn cần chuyển các lớp học này sang khối khác trước khi thực hiện xóa.
        </p>
        <div style="display:flex; justify-content:center; gap:10px;">
          <button class="btn-secondary" onclick="document.querySelector('.modal-overlay')?.remove()" style="padding:9px 20px; border-radius:8px; cursor:pointer;">
            Đã hiểu
          </button>
          <button class="btn-primary" onclick="document.querySelector('.modal-overlay')?.remove(); window.location.hash='#classes-admin'" style="padding:9px 20px; border-radius:8px; cursor:pointer;">
            Đi tới Quản lý lớp học
          </button>
        </div>
      </div>
    `
    openModal('Cảnh báo an toàn dữ liệu', blockedHtml)
    return
  }

  const confirmHtml = `
    <div style="padding:6px 0; text-align:center;">
      <div style="width:52px; height:52px; border-radius:50%; background:#fef2f2; color:#ef4444; display:inline-flex; align-items:center; justify-content:center; font-size:24px; margin-bottom:16px;">
        <i class="fa-solid fa-triangle-exclamation"></i>
      </div>
      <h3 style="font-size:16px; font-weight:700; color:#1e293b; margin-bottom:8px;">Xác nhận xóa khối học</h3>
      <p style="font-size:13px; color:#64748b; line-height:1.5; margin-bottom:20px;">
        Bạn có chắc chắn muốn xóa khối <strong>"${name}"</strong> khỏi hệ thống?<br/>
        Hành động này không thể hoàn tác.
      </p>
      <div style="display:flex; justify-content:center; gap:10px;">
        <button class="btn-secondary" id="cancel-delete-block-btn" style="padding:9px 20px; border-radius:8px; cursor:pointer;">
          Hủy bỏ
        </button>
        <button class="btn-primary" id="confirm-delete-block-btn" style="background:#ef4444; border-color:#ef4444; color:#ffffff; padding:9px 20px; border-radius:8px; cursor:pointer; display:inline-flex; align-items:center; gap:8px;">
          <i class="fa-solid fa-trash-can"></i> Xóa khối
        </button>
      </div>
    </div>
  `

  openModal('Xóa khối học', confirmHtml)

  document.getElementById('cancel-delete-block-btn')?.addEventListener('click', () => {
    document.querySelector('.modal-overlay')?.remove()
  })

  document.getElementById('confirm-delete-block-btn')?.addEventListener('click', async () => {
    const btn = document.getElementById('confirm-delete-block-btn')
    if (btn) {
      btn.disabled = true
      btn.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> Đang xóa...'
    }

    try {
      await api.deleteGradeBlock(id)
      showToast(`Đã xóa khối "${name}" thành công!`, 'success')
      document.querySelector('.modal-overlay')?.remove()

      // Reload data
      await fetchGradeBlocksData()
      renderCurrentTable()
    } catch (err) {
      console.error('[DeleteGradeBlock] Error:', err)
      showToast(err.message || 'Lỗi khi xóa khối học', 'error')
      if (btn) {
        btn.disabled = false
        btn.innerHTML = '<i class="fa-solid fa-trash-can"></i> Xóa khối'
      }
    }
  })
}
