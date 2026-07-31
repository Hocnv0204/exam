export function openModal(title, bodyHTML, onConfirm = null) {
  let container = document.getElementById('modal-container')
  if (!container) {
    container = document.createElement('div')
    container.id = 'modal-container'
    document.body.appendChild(container)
  }

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

  const closeModal = () => { container.innerHTML = '' }

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

// Make openModal globally accessible on window for direct inline invocation
window.openModal = openModal
