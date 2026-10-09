import { api } from '../api.js'
import { showToast } from '../components/toast.js'
import { openModal } from '../components/modal.js'
import { renderPdfViewer } from '../components/pdf-viewer.js'

export function escapeHtml(str) {
  if (!str) return ''
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;')
}

/**
 * Resolve the viewable PDF URL + download name of a homework.
 * Returns null (kèm toast) khi bài không có file PDF hợp lệ.
 */
async function resolveHomeworkPdf(homeworkId, defaultTitle = 'De_Bai') {
  const hwData = await api.getHomeworkDetail(homeworkId)
  const hw = hwData?.homework || {}
  const rawPdfUrl = hw.pdfUrl || ''
  const mappedUrl = rawPdfUrl.replace(/https?:\/\/kong:8000/g, import.meta.env.VITE_SUPABASE_URL || 'http://localhost:54321')
  const finalPdfPath = hw.pdfPath || ''

  const hasValidPdf = !!(
    mappedUrl &&
    finalPdfPath !== 'INTERACTIVE' &&
    finalPdfPath !== 'Homework_Attachment.pdf' &&
    (!finalPdfPath || finalPdfPath.endsWith('.pdf') || finalPdfPath.startsWith('http'))
  )

  if (!mappedUrl || !hasValidPdf) {
    showToast('Bài tập này không có file PDF đính kèm (bài tập tương tác trực tiếp)!', 'warning')
    return null
  }

  const downloadName = (finalPdfPath && finalPdfPath !== 'INTERACTIVE' && !finalPdfPath.startsWith('http'))
    ? finalPdfPath
    : `${(hw.title || defaultTitle || 'De_Bai').replace(/[/\\?%*:|"<>]/g, '_')}.pdf`

  return { url: mappedUrl, name: downloadName, title: hw.title || defaultTitle }
}

/**
 * Preview the attached PDF file of a homework in a modal.
 * Trong màn preview có nút tải file về máy.
 * @param {string} homeworkId
 */
export async function previewHomeworkPdf(homeworkId) {
  if (!homeworkId) {
    showToast('Không tìm thấy thông tin bài tập!', 'warning')
    return
  }

  try {
    showToast('Đang tải xem trước file PDF...', 'info')
    const pdf = await resolveHomeworkPdf(homeworkId)
    if (!pdf) return

    const safeTitle = escapeHtml(pdf.title)
    openModal(
      safeTitle,
      `<div id="modal-pdf-container" style="width:100%; height:65vh; overflow-y:auto; -webkit-overflow-scrolling:touch; border-radius:8px;"></div>
       <div style="margin-top:12px; display:flex; justify-content:flex-end; gap:8px;">
         <button id="modal-pdf-download-btn" class="btn-secondary" style="font-size:12px; padding:6px 12px; display:inline-flex; align-items:center; gap:6px; border-radius:8px; cursor:pointer;">
           <i class="fa-solid fa-download"></i> Tải file PDF
         </button>
         <a href="${pdf.url}" target="_blank" rel="noopener noreferrer" class="btn-secondary" style="font-size:12px; padding:6px 12px; display:inline-flex; align-items:center; gap:6px; text-decoration:none; background:#eff6ff; color:#0066cc; border:1px solid #bfdbfe; border-radius:8px;">
           <i class="fa-solid fa-up-right-from-square"></i> Mở trong tab mới
         </a>
       </div>`
    )
    const mc = document.querySelector('#modal-container .modal-content')
    if (mc) mc.style.maxWidth = '900px'
    const container = document.getElementById('modal-pdf-container')
    if (container) renderPdfViewer(container, pdf.url)

    document.getElementById('modal-pdf-download-btn')?.addEventListener('click', () => {
      downloadHomeworkPdf(homeworkId, pdf.title)
    })
  } catch (err) {
    console.error('Error previewing homework PDF:', err)
    showToast('Lỗi khi xem trước file PDF: ' + (err.message || 'Vui lòng thử lại sau'), 'error')
  }
}

/**
 * Downloads the attached PDF file of a homework assignment.
 * @param {string} homeworkId
 * @param {string} defaultTitle
 */
export async function downloadHomeworkPdf(homeworkId, defaultTitle = 'De_Bai') {
  if (!homeworkId) {
    showToast('Không tìm thấy thông tin bài tập!', 'warning')
    return
  }

  try {
    showToast('Đang kiểm tra và chuẩn bị file PDF đề bài...', 'info')

    const pdf = await resolveHomeworkPdf(homeworkId, defaultTitle)
    if (!pdf) return
    const { url: mappedUrl, name: downloadName } = pdf

    showToast(`Đang tải file "${downloadName}" về máy...`, 'info')

    try {
      const res = await fetch(mappedUrl)
      if (!res.ok) throw new Error(`HTTP ${res.status}`)
      const blob = await res.blob()
      const blobUrl = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = blobUrl
      a.download = downloadName
      document.body.appendChild(a)
      a.click()
      document.body.removeChild(a)
      setTimeout(() => URL.revokeObjectURL(blobUrl), 2000)
      showToast(`Đã tải file "${downloadName}" thành công!`, 'success')
    } catch (fetchErr) {
      console.warn('Fetch blob download failed, opening in new tab:', fetchErr)
      window.open(mappedUrl, '_blank')
    }
  } catch (err) {
    console.error('Error downloading homework PDF:', err)
    showToast('Lỗi khi tải file PDF: ' + (err.message || 'Vui lòng thử lại sau'), 'error')
  }
}

// Bind to window so inline onclick handlers across templates can call it seamlessly
window.downloadHomeworkPdf = downloadHomeworkPdf
window.previewHomeworkPdf = previewHomeworkPdf
window.openHomeworkPdf = openHomeworkPdf

/**
 * Mở trực tiếp link PDF của bài tập sang tab mới (không qua modal preview
 * để tránh chờ render).
 * @param {string} homeworkId
 */
export async function openHomeworkPdf(homeworkId) {
  if (!homeworkId) {
    showToast('Không tìm thấy thông tin bài tập!', 'warning')
    return
  }
  try {
    showToast('Đang mở file PDF...', 'info')
    const pdf = await resolveHomeworkPdf(homeworkId)
    if (!pdf) return
    window.open(pdf.url, '_blank', 'noopener')
  } catch (err) {
    console.error('Error opening homework PDF:', err)
    showToast('Lỗi khi mở file PDF: ' + (err.message || 'Vui lòng thử lại sau'), 'error')
  }
}
