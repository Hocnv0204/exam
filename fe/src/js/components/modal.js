/**
 * Mở modal dùng chung (chỉ 1 modal tại 1 thời điểm).
 *
 * options (tùy chọn):
 * - cancelLabel: nhãn nút hủy (mặc định 'Hủy')
 * - confirmLabel: nhãn nút xác nhận (mặc định 'Xác nhận')
 * - showCancel: ẩn/hiện nút hủy (mặc định true)
 * - contentStyle: style inline cho hộp `.modal-content` (ví dụ 'max-width:960px;')
 * - contentClass: class bổ sung cho `.modal-content` (CSS riêng cho từng loại modal)
 * - bodyStyle: style inline cho hộp `.modal-body` (dùng cho modal có vùng nội dung cuộn riêng)
 * - beforeClose: (reason) => boolean|void — trả `false` để CHẶN đóng modal.
 *   Chỉ áp dụng cho đóng bằng thao tác người dùng (reason = 'cancel');
 *   đóng bằng code (closeModal()) không bị chặn.
 * - onCancel: callback khi người dùng huỷ (nút Hủy / nút X / bấm nền ngoài)
 * - onClose: callback khi modal đã đóng, nhận lý do 'cancel' | 'confirm' | 'close'
 *
 * Lưu ý:
 * - Chỉ 1 modal active: mở modal mới sẽ thay thế modal cũ. Callback của modal cũ
 *   không được xoá modal mới (tránh "nested modal corruption").
 * - Nút xác nhận bị khoá trong lúc handler xác nhận đang chạy => chống double-click.
 */
let activeModalToken = 0
let activeModalHooks = null

export function openModal(title, bodyHTML, onConfirm = null, options = {}) {
  const {
    cancelLabel = 'Hủy',
    confirmLabel = 'Xác nhận',
    showCancel = true,
    contentStyle = '',
    contentClass = '',
    bodyStyle = '',
    shellFlex = false,
    beforeClose = null,
    onCancel = null,
    onClose = null
  } = options

  let container = document.getElementById('modal-container')
  if (!container) {
    container = document.createElement('div')
    container.id = 'modal-container'
    document.body.appendChild(container)
  }

  const token = ++activeModalToken
  activeModalHooks = { token, onCancel, onClose }

  document.body.classList.add('modal-open')

  container.innerHTML = `
    <div class="modal-backdrop" id="active-modal-backdrop">
      <div class="modal-content ${contentClass}" onclick="event.stopPropagation()" style="${contentStyle}">
        <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:20px; padding-bottom:14px; border-bottom:1px solid #e2e8f0;${shellFlex ? 'flex:0 0 auto;' : ''}">
          <h3 style="font-family:var(--font-heading); font-size:20px; font-weight:700; color:#0f172a;">${title}</h3>
          <button id="modal-close-btn" style="background:none; border:none; font-size:20px; color:#94a3b8; cursor:pointer; padding:4px;"><i class="fa-solid fa-xmark"></i></button>
        </div>
        <div class="modal-body" style="margin-bottom:24px;${bodyStyle}">
          ${bodyHTML}
        </div>
        <div style="display:flex; justify-content:flex-end; gap:12px; padding-top:14px; border-top:1px solid #f1f5f9;${shellFlex ? 'flex:0 0 auto;' : ''}">
          ${showCancel ? `<button id="modal-cancel-btn" class="btn-secondary" style="padding:10px 20px;">${cancelLabel}</button>` : ''}
          ${onConfirm ? `<button id="modal-confirm-btn" class="btn-primary" style="width:auto; padding:10px 24px; background:#0066cc;">${confirmLabel}</button>` : ''}
        </div>
      </div>
    </div>
  `

  const close = (reason = 'close') => {
    // Chỉ đóng nếu đây vẫn là modal đang active (tránh xoá modal khác vừa mở).
    if (activeModalHooks?.token !== token) return
    // Hook chặn đóng (vd: đang ghi tiền thì không cho huỷ bằng tay).
    if (typeof beforeClose === 'function' && beforeClose(reason) === false) return
    activeModalHooks = null
    container.innerHTML = ''
    document.body.classList.remove('modal-open')
    if (reason === 'cancel') onCancel?.()
    onClose?.(reason)
  }

  document.getElementById('modal-close-btn')?.addEventListener('click', () => close('cancel'))
  document.getElementById('modal-cancel-btn')?.addEventListener('click', () => close('cancel'))
  document.getElementById('active-modal-backdrop')?.addEventListener('click', () => close('cancel'))

  if (onConfirm) {
    const confirmBtn = document.getElementById('modal-confirm-btn')
    confirmBtn?.addEventListener('click', async () => {
      // Chống double-click: bỏ qua khi nút đang bị khoá (request trước chưa xong).
      if (confirmBtn.disabled) return
      const originalHtml = confirmBtn.innerHTML
      confirmBtn.disabled = true
      try {
        const result = await onConfirm()
        if (result === false) {
          // Handler báo lỗi -> mở lại nút để người dùng thử lại.
          confirmBtn.disabled = false
          confirmBtn.innerHTML = originalHtml
        } else {
          close('confirm')
        }
      } catch (err) {
        console.error('[modal] Lỗi trong handler xác nhận:', err)
        confirmBtn.disabled = false
        confirmBtn.innerHTML = originalHtml
      }
    })
  }
}

export function closeModal() {
  const container = document.getElementById('modal-container')
  if (container) {
    container.innerHTML = ''
  }
  document.body.classList.remove('modal-open')
  const hooks = activeModalHooks
  activeModalHooks = null
  hooks?.onClose?.('close')
}

// Make openModal and closeModal globally accessible on window for direct inline invocation
window.openModal = openModal
window.closeModal = closeModal

export function showTrialRegistrationModal() {
  openModal(
    'Đăng ký khóa học',
    `
      <div style="text-align:center; padding:12px 6px;">
        <div style="width:60px; height:60px; border-radius:50%; background:#eff6ff; color:#0284c7; display:flex; align-items:center; justify-content:center; font-size:26px; margin:0 auto 16px auto; box-shadow:0 4px 12px rgba(2,132,199,0.15);">
          <i class="fa-solid fa-comments"></i>
        </div>
        <h3 style="font-family:var(--font-heading); font-size:18px; font-weight:700; color:#0f172a; margin:0 0 10px 0; line-height:1.4;">
          Liên hệ admin qua zalo 0349097659 để đăng ký học
        </h3>
        <p style="font-size:14px; color:#64748b; line-height:1.6; margin:0 0 20px 0;">
          Quản trị viên sẽ hỗ trợ tư vấn lộ trình học tập phù hợp và cấp tài khoản chính thức cho bạn trong ít phút.
        </p>
        <div style="display:flex; justify-content:center; gap:10px; flex-wrap:wrap;">
          <a href="https://zalo.me/0349097659" target="_blank" rel="noopener noreferrer" class="btn-primary" style="padding:10px 22px; font-size:14px; font-weight:700; border-radius:8px; display:inline-flex; align-items:center; gap:8px; text-decoration:none; background:#0068ff; border-color:#0068ff; box-shadow:0 4px 14px rgba(0,104,255,0.25);">
            <i class="fa-solid fa-comment-dots"></i> Nhắn tin qua Zalo
          </a>
          <button type="button" class="btn-secondary" onclick="navigator.clipboard && navigator.clipboard.writeText('0349097659').then(() => alert('Đã sao chép SĐT Zalo: 0349097659'))" style="padding:10px 16px; font-size:14px; font-weight:600; border-radius:8px; cursor:pointer;">
            <i class="fa-regular fa-copy"></i> 0349097659
          </button>
        </div>
      </div>
    `
  )
}
window.showTrialRegistrationModal = showTrialRegistrationModal
