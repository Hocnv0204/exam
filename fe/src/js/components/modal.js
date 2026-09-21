export function openModal(title, bodyHTML, onConfirm = null) {
  let container = document.getElementById('modal-container')
  if (!container) {
    container = document.createElement('div')
    container.id = 'modal-container'
    document.body.appendChild(container)
  }

  document.body.classList.add('modal-open')

  container.innerHTML = `
    <div class="modal-backdrop" id="active-modal-backdrop">
      <div class="modal-content" onclick="event.stopPropagation()">
        <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:20px; padding-bottom:14px; border-bottom:1px solid #e2e8f0;">
          <h3 style="font-family:var(--font-heading); font-size:20px; font-weight:700; color:#0f172a;">${title}</h3>
          <button id="modal-close-btn" style="background:none; border:none; font-size:20px; color:#94a3b8; cursor:pointer; padding:4px;"><i class="fa-solid fa-xmark"></i></button>
        </div>
        <div class="modal-body" style="margin-bottom:24px;">
          ${bodyHTML}
        </div>
        <div style="display:flex; justify-content:flex-end; gap:12px; padding-top:14px; border-top:1px solid #f1f5f9;">
          <button id="modal-cancel-btn" class="btn-secondary" style="padding:10px 20px;">Hủy</button>
          ${onConfirm ? `<button id="modal-confirm-btn" class="btn-primary" style="width:auto; padding:10px 24px; background:#0066cc;">Xác nhận</button>` : ''}
        </div>
      </div>
    </div>
  `

  const closeModal = () => {
    container.innerHTML = ''
    document.body.classList.remove('modal-open')
  }

  document.getElementById('modal-close-btn')?.addEventListener('click', closeModal)
  document.getElementById('modal-cancel-btn')?.addEventListener('click', closeModal)
  document.getElementById('active-modal-backdrop')?.addEventListener('click', closeModal)

  if (onConfirm) {
    document.getElementById('modal-confirm-btn')?.addEventListener('click', async () => {
      const result = await onConfirm()
      if (result !== false) {
        closeModal()
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
