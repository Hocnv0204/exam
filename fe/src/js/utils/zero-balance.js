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

/**
 * Trang yêu cầu có nằm ngoài trang cuối không (dữ liệu bị rút ngắn sau khi nạp tiền)?
 *
 * Ví dụ: đang xem trang 3 (trang cuối) với 1 học sinh, nạp tiền xong học sinh đó
 * rời khỏi danh sách => trang 3 trả về rỗng => phải lùi về trang hợp lệ.
 *
 * @returns {boolean} true nếu cần tải lại trang khác
 */
export function needsZeroBalancePageReload({ requestedPage = 1, total = 0, itemCount = 0 } = {}) {
  if (Number(itemCount) > 0) return false
  const pagination = computeZeroBalancePagination({ page: requestedPage, total })
  if (pagination.total <= 0) return false
  return pagination.currentPage < (Number(requestedPage) || 1)
}

/** Skeleton khi đang tải danh sách. */
export function renderZeroBalanceSkeleton() {
  const rows = Array.from({ length: 5 }, () => `
    <tr>
      <td><span style="display:inline-block; width:24px; height:12px; border-radius:4px; background:#e2e8f0;"></span></td>
      <td><span style="display:inline-block; width:150px; height:12px; border-radius:4px; background:#e2e8f0;"></span></td>
      <td><span style="display:inline-block; width:110px; height:12px; border-radius:4px; background:#e2e8f0;"></span></td>
      <td style="text-align:center;"><span style="display:inline-block; width:84px; height:20px; border-radius:8px; background:#e2e8f0;"></span></td>
    </tr>
  `).join('')

  return `
    <div class="table-responsive">
      <table class="data-table" style="font-size:13px; min-width:480px;">
        <thead>
          <tr>
            <th style="width:56px;">STT</th>
            <th style="min-width:170px;">Họ tên</th>
            <th style="min-width:140px;">Lớp học</th>
            <th style="text-align:center; width:120px;">Nạp nhanh</th>
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

/** Nút "Nạp nhanh" cho 1 học sinh trong danh sách số dư 0 đ. */
export function renderZeroBalanceTopupButton(item = {}) {
  const studentId = escapeHtml(item?.id || '')
  const fullName = escapeHtml(item?.fullName || item?.username || '')
  return `
    <button
      type="button"
      class="btn-secondary"
      data-zb-topup="${studentId}"
      data-zb-name="${fullName}"
      title="Nạp nhanh cho ${fullName}"
      style="width:auto; padding:5px 10px; font-size:12px; font-weight:700; display:inline-flex; align-items:center; gap:5px; color:#b45309; border-color:#fcd34d; background:#fffbeb; white-space:nowrap;"
    >
      <i class="fa-solid fa-bolt" style="font-size:10px;"></i> Nạp nhanh
    </button>
  `
}

/**
 * Bảng danh sách học sinh số dư 0 đ.
 * Chỉ 4 cột: STT · Họ tên · Lớp học · Nạp nhanh (mọi học sinh trong danh sách
 * đều có số dư 0 đ nên không cần hiện cột số dư / mã đăng nhập / trạng thái).
 */
export function renderZeroBalanceTable(items = [], { page = 1, pageSize = ZERO_BALANCE_PAGE_SIZE } = {}) {
  const startIndex = (Math.max(1, Number(page) || 1) - 1) * pageSize

  const rows = items.map((item, idx) => `
    <tr>
      <td style="color:#64748b; font-weight:600; vertical-align:middle;">${startIndex + idx + 1}</td>
      <td style="font-weight:700; color:#0f172a; vertical-align:middle; word-break:break-word; min-width:170px;">${escapeHtml(item?.fullName || '')}</td>
      <td style="color:#475569; vertical-align:middle; word-break:break-word; min-width:140px;">${escapeHtml(item?.className || 'Chưa phân lớp')}</td>
      <td style="text-align:center; vertical-align:middle;">${renderZeroBalanceTopupButton(item)}</td>
    </tr>
  `).join('')

  return `
    <div class="table-responsive">
      <table class="data-table" style="font-size:13px; min-width:480px;">
        <thead>
          <tr>
            <th style="width:56px;">STT</th>
            <th style="min-width:170px;">Họ tên</th>
            <th style="min-width:140px;">Lớp học</th>
            <th style="text-align:center; width:120px;">Nạp nhanh</th>
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
