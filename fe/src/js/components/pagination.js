/**
 * Reusable Pagination Component for Data Tables
 */

export function renderPaginationBar({
  currentPage = 1,
  totalItems = 0,
  pageSize = 10,
  containerId = 'pagination-container',
  pageSizeOptions = [10, 20, 50]
}) {
  const totalPages = Math.max(1, Math.ceil(totalItems / pageSize))
  const safeCurrentPage = Math.min(Math.max(1, currentPage), totalPages)
  const from = totalItems === 0 ? 0 : (safeCurrentPage - 1) * pageSize + 1
  const to = Math.min(totalItems, safeCurrentPage * pageSize)

  // Generate page numbers to display with smart ellipsis
  const pages = []
  const maxVisiblePages = 5

  if (totalPages <= maxVisiblePages) {
    for (let i = 1; i <= totalPages; i++) pages.push(i)
  } else {
    pages.push(1)
    let start = Math.max(2, safeCurrentPage - 1)
    let end = Math.min(totalPages - 1, safeCurrentPage + 1)

    if (safeCurrentPage <= 2) {
      end = 4
    } else if (safeCurrentPage >= totalPages - 1) {
      start = totalPages - 3
    }

    if (start > 2) pages.push('...')
    for (let i = start; i <= end; i++) pages.push(i)
    if (end < totalPages - 1) pages.push('...')
    pages.push(totalPages)
  }

  return `
    <div id="${containerId}" class="flex-wrap-mobile" style="display:flex; align-items:center; justify-content:space-between; margin-top:20px; font-size:13px; color:#64748b; gap:12px;">
      <div style="display:flex; align-items:center; gap:12px;">
        <span class="pagination-summary">Hiển thị <strong>${from}</strong> đến <strong>${to}</strong> trong tổng số <strong>${totalItems}</strong> mục</span>
        <select class="pagination-page-size form-input" style="padding:4px 8px; font-size:12px; width:auto; border-radius:6px; background:#ffffff; cursor:pointer;">
          ${pageSizeOptions.map(size => `
            <option value="${size}" ${size === pageSize ? 'selected' : ''}>${size} / trang</option>
          `).join('')}
        </select>
      </div>

      <div style="display:flex; gap:6px; align-items:center;">
        <button class="btn-secondary pagination-btn" data-page="${safeCurrentPage - 1}" ${safeCurrentPage <= 1 ? 'disabled style="padding:4px 10px; opacity:0.4; cursor:not-allowed;"' : 'style="padding:4px 10px; cursor:pointer;"'} title="Trang trước">
          <i class="fa-solid fa-chevron-left" style="font-size:10px;"></i>
        </button>

        ${pages.map(p => {
          if (p === '...') {
            return `<span style="padding:4px 8px; color:#94a3b8;">...</span>`
          }
          const isActive = p === safeCurrentPage
          return `
            <button class="${isActive ? 'btn-primary' : 'btn-secondary'} pagination-btn" data-page="${p}" style="padding:4px 12px; min-width:32px; border-radius:6px; font-weight:${isActive ? '700' : '500'}; width:auto; cursor:pointer;">
              ${p}
            </button>
          `
        }).join('')}

        <button class="btn-secondary pagination-btn" data-page="${safeCurrentPage + 1}" ${safeCurrentPage >= totalPages ? 'disabled style="padding:4px 10px; opacity:0.4; cursor:not-allowed;"' : 'style="padding:4px 10px; cursor:pointer;"'} title="Trang sau">
          <i class="fa-solid fa-chevron-right" style="font-size:10px;"></i>
        </button>
      </div>
    </div>
  `
}

export function bindPaginationEvents({
  containerId = 'pagination-container',
  onPageChange,
  onPageSizeChange
}) {
  const container = document.getElementById(containerId)
  if (!container) return

  // Attach click listener to pagination buttons
  container.querySelectorAll('.pagination-btn').forEach(btn => {
    btn.addEventListener('click', (e) => {
      e.preventDefault()
      if (btn.hasAttribute('disabled')) return
      const targetPage = parseInt(btn.getAttribute('data-page'), 10)
      if (!isNaN(targetPage) && onPageChange) {
        onPageChange(targetPage)
      }
    })
  })

  // Attach change listener to page size selector
  const pageSizeSelect = container.querySelector('.pagination-page-size')
  pageSizeSelect?.addEventListener('change', (e) => {
    const newSize = parseInt(e.target.value, 10)
    if (!isNaN(newSize) && onPageSizeChange) {
      onPageSizeChange(newSize)
    }
  })
}
