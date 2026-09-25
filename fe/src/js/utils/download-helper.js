import { api } from '../api.js'
import { showToast } from '../components/toast.js'

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
      return
    }

    const downloadName = (finalPdfPath && finalPdfPath !== 'INTERACTIVE' && !finalPdfPath.startsWith('http'))
      ? finalPdfPath
      : `${(hw.title || defaultTitle || 'De_Bai').replace(/[/\\?%*:|"<>]/g, '_')}.pdf`

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
