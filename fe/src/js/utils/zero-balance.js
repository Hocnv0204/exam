/**
 * Helper thuần cho ô thống kê + popup "Học sinh có số dư 0 đ" (Dashboard quản trị).
 *
 * Không import gì từ app (không phụ thuộc DOM/network) để có thể unit-test
 * bằng Node: xem fe/scripts/test-zero-balance.mjs.
 */

export const ZERO_BALANCE_PAGE_SIZE = 20

/**
 * Escape HTML trước khi chèn vào template (tên/lớp/mã đăng nhập do người dùng nhập).
 */
export function escapeHtml(str) {
  if (str === null || str === undefined) return ''
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;')
}

/**
 * Đọc `count` từ payload API.
 * Trả null nếu payload không hợp lệ (để hiện lỗi thay vì hiện số 0 giả).
 */
export function parseZeroBalanceCount(payload) {
  if (!payload || typeof payload !== 'object') return null
  const raw = payload.count
  if (raw === null || raw === undefined || raw === '') return null
  const count = Number(raw)
  if (!Number.isFinite(count) || count < 0) return null
  return count
}

/**
 * Tính thông tin phân trang.
 */
export function computeZeroBalancePagination({ page = 1, pageSize = ZERO_BALANCE_PAGE_SIZE, total = 0 } = {}) {
  const safeTotal = Number.isFinite(Number(total)) && Number(total) > 0 ? Number(total) : 0
  const totalPages = Math.max(1, Math.ceil(safeTotal / pageSize))
  const currentPage = Math.min(Math.max(1, Number(page) || 1), totalPages)
  const from = safeTotal === 0 ? 0 : (currentPage - 1) * pageSize + 1
  const to = Math.min(safeTotal, currentPage * pageSize)

  return {
    currentPage,
    totalPages,
    total: safeTotal,
    pageSize,
    from,
    to,
    hasPrev: currentPage > 1,
    hasNext: currentPage < totalPages
  }
}

/** Skeleton khi đang tải danh sách. */
export function renderZeroBalanceSkeleton() {
  const rows = Array.from({ length: 5 }, () => `
    <tr>
      <td><span style="display:inline-block; width:24px; height:12px; border-radius:4px; background:#e2e8f0;"></span></td>
      <td><span style="display:inline-block; width:140px; height:12px; border-radius:4px; background:#e2e8f0;"></span></td>
      <td><span style="display:inline-block; width:90px; height:12px; border-radius:4px; background:#e2e8f0;"></span></td>
      <td><span style="display:inline-block; width:120px; height:12px; border-radius:4px; background:#e2e8f0;"></span></td>
      <td style="text-align:right;"><span style="display:inline-block; width:48px; height:12px; border-radius:4px; background:#e2e8f0;"></span></td>
      <td style="text-align:center;"><span style="display:inline-block; width:64px; height:12px; border-radius:4px; background:#e2e8f0;"></span></td>
    </tr>
  `).join('')

  return `
    <div class="table-responsive">
      <table class="data-table" style="font-size:13px; min-width:640px;">
        <thead>
          <tr>
            <th style="width:56px;">STT</th>
            <th>Họ tên</th>
            <th>Mã đăng nhập</th>
            <th>Lớp học</th>
            <th style="text-align:right;">Số dư</th>
            <th style="text-align:center;">Trạng thái</th>
          </tr>
        </thead>
        <tbody>${rows}</tbody>
      </table>
    </div>
    <div style="text-align:center; padding:14px 0 4px; color:#64748b; font-size:12px; font-weight:600;">
      <i class="fa-solid fa-spinner fa-spin" style="margin-right:6px; color:#0284c7;"></i> Đang tải danh sách học sinh...
    </div>
  `
}

/** Bảng danh sách học sinh (mỗi học sinh 1 dòng, số dư luôn 0 đ). */
export function renderZeroBalanceTable(items = [], { page = 1, pageSize = ZERO_BALANCE_PAGE_SIZE } = {}) {
  const startIndex = (Math.max(1, Number(page) || 1) - 1) * pageSize

  const rows = items.map((item, idx) => {
    const isLocked = Boolean(item?.isLocked)
    const balance = Number(item?.balance ?? 0)
    const balanceText = `${Number.isFinite(balance) ? balance.toLocaleString('vi-VN') : '0'} đ`

    const statusBadge = isLocked
      ? `<span style="background:#fef2f2; color:#b91c1c; border:1px solid #fecaca; padding:3px 8px; border-radius:12px; font-size:11px; font-weight:700; display:inline-flex; align-items:center; gap:4px;"><i class="fa-solid fa-lock" style="font-size:8px;"></i> Tạm khóa</span>`
      : `<span style="background:#dcfce7; color:#15803d; border:1px solid #bbf7d0; padding:3px 8px; border-radius:12px; font-size:11px; font-weight:700; display:inline-flex; align-items:center; gap:4px;"><i class="fa-solid fa-circle" style="font-size:6px;"></i> Hoạt động</span>`

    return `
      <tr>
        <td style="color:#64748b; font-weight:600;">${startIndex + idx + 1}</td>
        <td style="font-weight:700; color:#0f172a;">${escapeHtml(item?.fullName || '')}</td>
        <td style="font-family:monospace; color:#334155;">${escapeHtml(item?.username || '')}</td>
        <td style="color:#475569;">${escapeHtml(item?.className || 'Chưa phân lớp')}</td>
        <td style="text-align:right; font-weight:700; color:#b45309;">${balanceText}</td>
        <td style="text-align:center;">${statusBadge}</td>
      </tr>
    `
  }).join('')

  return `
    <div class="table-responsive">
      <table class="data-table" style="font-size:13px; min-width:640px;">
        <thead>
          <tr>
            <th style="width:56px;">STT</th>
            <th>Họ tên</th>
            <th>Mã đăng nhập</th>
            <th>Lớp học</th>
            <th style="text-align:right;">Số dư</th>
            <th style="text-align:center;">Trạng thái</th>
          </tr>
        </thead>
        <tbody>${rows}</tbody>
      </table>
    </div>
  `
}

/** Trạng thái rỗng. */
export function renderZeroBalanceEmpty() {
  return `
    <div style="text-align:center; padding:36px 12px; color:#64748b; font-size:13px;">
      <i class="fa-solid fa-wallet" style="font-size:30px; color:#cbd5e1; margin-bottom:10px; display:block;"></i>
      Không có học sinh nào có số dư 0 đ
    </div>
  `
}

/** Trạng thái lỗi + nút thử lại. */
export function renderZeroBalanceError(message) {
  const detail = message ? escapeHtml(String(message)) : ''
  return `
    <div style="text-align:center; padding:32px 12px; color:#64748b; font-size:13px;">
      <i class="fa-solid fa-triangle-exclamation" style="font-size:30px; color:#f87171; margin-bottom:10px; display:block;"></i>
      Không tải được danh sách học sinh${detail ? `: ${detail}` : '.'}
      <div style="margin-top:14px;">
        <button type="button" class="btn-secondary" data-zb-retry style="width:auto; padding:8px 18px; font-weight:600;">
          <i class="fa-solid fa-rotate-right" style="margin-right:6px;"></i> Thử lại
        </button>
      </div>
    </div>
  `
}

/** Thanh phân trang riêng trong popup. */
export function renderZeroBalancePaginationBar(pagination) {
  const { currentPage, totalPages, total, from, to, hasPrev, hasNext } = pagination

  if (total === 0) return ''

  return `
    <div class="flex-wrap-mobile" style="display:flex; align-items:center; justify-content:space-between; gap:12px; margin-top:16px; padding-top:12px; border-top:1px solid #e2e8f0; font-size:12px; color:#64748b;">
      <div>
        Hiển thị <strong>${from}</strong> - <strong>${to}</strong> trong tổng số <strong>${total}</strong> học sinh
      </div>
      <div style="display:flex; gap:6px; align-items:center;">
        <button type="button" class="btn-secondary" data-zb-page="${currentPage - 1}" ${hasPrev ? '' : 'disabled style="padding:4px 10px; opacity:0.4; cursor:not-allowed;"'} title="Trang trước">
          <i class="fa-solid fa-chevron-left" style="font-size:10px;"></i> Trước
        </button>
        <span style="font-weight:700; color:#334155; padding:0 8px;">Trang ${currentPage} / ${totalPages}</span>
        <button type="button" class="btn-secondary" data-zb-page="${currentPage + 1}" ${hasNext ? '' : 'disabled style="padding:4px 10px; opacity:0.4; cursor:not-allowed;"'} title="Trang sau">
          Sau <i class="fa-solid fa-chevron-right" style="font-size:10px;"></i>
        </button>
      </div>
    </div>
  `
}
