if (typeof document !== 'undefined' && document.head) {
  import('../../css/mochi/student-exam-notice.css')
}

import { api } from '../api.js'
import { isMochiUI } from '../ui-flag.js'

const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i

export function isValidUuid(str) {
  if (typeof str !== 'string') return false
  return UUID_REGEX.test(str.trim())
}

export function escapeHtml(str) {
  if (!str) return ''
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;')
}

export function formatNoticeTime(isoString) {
  if (!isoString) return ''
  const d = new Date(isoString)
  if (isNaN(d.getTime())) return ''
  return d.toLocaleString('vi-VN', {
    hour: '2-digit',
    minute: '2-digit',
    day: '2-digit',
    month: '2-digit',
    year: 'numeric'
  })
}

export function renderExamNoticeCard(item, isMochi = false) {
  if (!item) return ''
  const isApproved = item.type === 'EXAM_ATTEMPT_APPROVED'
  const canEnter = isApproved && isValidUuid(item.relatedId)
  const timeFormatted = formatNoticeTime(item.createdAt)

  const iconHtml = isApproved
    ? `<i class="fa-solid fa-circle-check" style="color:${isMochi ? 'var(--m-ok, #16a34a)' : '#16a34a'}; font-size:18px; flex-shrink:0;" aria-hidden="true"></i>`
    : `<i class="fa-solid fa-circle-info" style="color:${isMochi ? 'var(--m-warn, #d97706)' : '#d97706'}; font-size:18px; flex-shrink:0;" aria-hidden="true"></i>`

  const cardClass = isMochi
    ? `student-exam-notice-card m-exam-notice-card ${isApproved ? 'm-exam-notice-card--approved' : 'm-exam-notice-card--rejected'}`
    : `student-exam-notice-card`

  const inlineCardStyle = isMochi
    ? ''
    : `background:${isApproved ? '#f0fdf4' : '#fffbeb'}; border:1px solid ${isApproved ? '#bbf7d0' : '#fde68a'}; border-radius:12px; padding:14px 18px; display:flex; flex-direction:column; gap:10px; margin-bottom:12px;`

  const btnPrimaryClass = isMochi ? 'm-btn m-btn--primary' : 'btn-primary'
  const btnSecondaryClass = isMochi ? 'm-btn m-btn--secondary' : 'btn-secondary'

  const btnPrimaryStyle = isMochi
    ? ''
    : `min-height:44px; padding:8px 18px; font-size:13.5px; font-weight:700; border-radius:8px; cursor:pointer; display:inline-flex; align-items:center; gap:6px; width:auto;`

  const btnSecondaryStyle = isMochi
    ? ''
    : `min-height:44px; padding:8px 18px; font-size:13.5px; font-weight:600; border-radius:8px; cursor:pointer; display:inline-flex; align-items:center; gap:6px; width:auto;`

  const enterButtonHtml = canEnter
    ? `<button type="button" class="${btnPrimaryClass}" data-action="enter" data-id="${escapeHtml(item.id)}" data-related-id="${escapeHtml(item.relatedId)}" style="${btnPrimaryStyle}">
        <i class="fa-solid fa-play" aria-hidden="true"></i> Vào thi ngay
      </button>`
    : ''

  const ackButtonHtml = `
    <button type="button" class="${btnSecondaryClass}" data-action="ack" data-id="${escapeHtml(item.id)}" style="${btnSecondaryStyle}">
      <i class="fa-solid fa-check" aria-hidden="true"></i> Đã hiểu
    </button>
  `

  return `
    <div class="${cardClass}" data-id="${escapeHtml(item.id)}" data-type="${escapeHtml(item.type)}" style="${inlineCardStyle}">
      <div class="student-exam-notice-header m-exam-notice-header" style="display:flex; justify-content:space-between; align-items:center; gap:8px; flex-wrap:wrap;">
        <div class="m-exam-notice-title-wrap" style="display:flex; align-items:center; gap:8px;">
          ${iconHtml}
          <strong class="student-exam-notice-title m-exam-notice-title" style="font-size:15px; color:${isMochi ? 'var(--m-ink, #0f172a)' : '#0f172a'};">${escapeHtml(item.title || '')}</strong>
        </div>
        ${timeFormatted ? `<span class="student-exam-notice-time m-exam-notice-time" style="font-size:12.5px; color:${isMochi ? 'var(--m-muted, #64748b)' : '#64748b'};">${escapeHtml(timeFormatted)}</span>` : ''}
      </div>
      <div class="student-exam-notice-content m-exam-notice-content" style="font-size:14px; line-height:1.55; color:${isMochi ? 'var(--m-ink, #334155)' : '#334155'};">
        ${escapeHtml(item.content || '')}
      </div>
      <div class="student-exam-notice-actions m-exam-notice-actions" style="display:flex; align-items:center; gap:10px; margin-top:2px; flex-wrap:wrap;">
        ${enterButtonHtml}
        ${ackButtonHtml}
      </div>
    </div>
  `
}

export async function mountStudentExamNotice(container) {
  if (!container) return

  const mountId = String(Date.now()) + Math.random()
  container.dataset.mountId = mountId

  let data
  try {
    data = await api.getStudentNotifications({ unreadOnly: true, limit: 10 })
  } catch (_err) {
    // Lỗi tải → không hiển thị gì (không chặn trang).
    return
  }

  // Bỏ qua nếu container đã bị thay thế hoặc ngắt kết nối
  if (container.dataset.mountId !== mountId) return
  if (typeof container.isConnected === 'boolean' && !container.isConnected) return

  const rawItems = Array.isArray(data) ? data : (data?.items || [])
  const examNotices = rawItems.filter(item =>
    item && (item.type === 'EXAM_ATTEMPT_APPROVED' || item.type === 'EXAM_ATTEMPT_REJECTED')
  )

  if (examNotices.length === 0) {
    container.innerHTML = ''
    return
  }

  const isMochi = isMochiUI()
  const visibleItems = examNotices.slice(0, 3)
  const remainingCount = examNotices.length - visibleItems.length

  const cardsHtml = visibleItems.map(item => renderExamNoticeCard(item, isMochi)).join('')
  const moreHtml = remainingCount > 0
    ? `<div class="student-exam-notice-more m-exam-notice-more" style="font-size:13px; color:${isMochi ? 'var(--m-muted, #64748b)' : '#64748b'}; text-align:center; padding:6px 12px; font-style:italic;">và ${remainingCount} thông báo khác</div>`
    : ''

  container.innerHTML = `
    <div class="student-exam-notice-banner m-exam-notice-banner" role="status" aria-live="polite" style="display:flex; flex-direction:column; gap:12px; margin-bottom:20px;">
      ${cardsHtml}
      ${moreHtml}
    </div>
  `

  const cardEls = container.querySelectorAll('.student-exam-notice-card')
  cardEls.forEach(card => {
    const id = card.dataset.id
    if (!id) return

    let isBusy = false
    const enterBtn = card.querySelector('[data-action="enter"]')
    const ackBtn = card.querySelector('[data-action="ack"]')

    const setBusy = (busy) => {
      isBusy = busy
      if (enterBtn) enterBtn.disabled = busy
      if (ackBtn) ackBtn.disabled = busy
    }

    if (enterBtn) {
      enterBtn.onclick = async () => {
        if (isBusy) return
        const relatedId = enterBtn.dataset.relatedId
        if (!isValidUuid(relatedId)) return
        setBusy(true)
        try {
          await api.markNotificationsRead([id])
        } catch (_e) {
          // Bỏ qua lỗi đánh dấu đọc để không chặn vào thi
        }
        window.location.hash = `#exam-room?homeworkId=${encodeURIComponent(relatedId.trim())}`
      }
    }

    if (ackBtn) {
      ackBtn.onclick = async () => {
        if (isBusy) return
        setBusy(true)
        try {
          await api.markNotificationsRead([id])
        } catch (_e) {
          // Bỏ qua lỗi đánh dấu đọc
        }
        card.remove()
        const remainingCards = container.querySelectorAll('.student-exam-notice-card')
        if (remainingCards.length === 0) {
          container.innerHTML = ''
        }
      }
    }
  })
}
