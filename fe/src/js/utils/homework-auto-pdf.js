/**
 * homework-auto-pdf.js — Tự động sinh & gắn file PDF đề trắng khi tạo đề từ Ngân hàng câu hỏi.
 */
import { api } from '../api.js'
import { renderExamPdfBlob } from './exam-print.js'
import { showToast } from '../components/toast.js'

/**
 * Chuẩn hoá tên bài tập thành tên file PDF ASCII an toàn, tránh ký tự đặc biệt.
 * @param {string} name Tên bài tập / đề thi
 * @returns {string} Tên file kết thúc bằng .pdf
 */
export function toSafeAsciiFileName(name) {
  const normalized = String(name || 'De_bai')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[đĐ]/g, m => (m === 'đ' ? 'd' : 'D'))
    .replace(/[^a-zA-Z0-9_\-\.]/g, '_')
    .replace(/_+/g, '_')
    .replace(/^_+|_+$/g, '')
    .slice(0, 80)
  return `${normalized || 'De_bai'}.pdf`
}

/**
 * Trích xuất danh sách homeworkId từ phản hồi của API createHomeworkFromBankQuestions.
 * Hỗ trợ cả kịch bản đơn đề ({ homeworkId }) và đa mã đề ({ isMultiVariant: true, variants: [...] }).
 * @param {Object} res Phản hồi từ api.createHomeworkFromBankQuestions
 * @returns {string[]} Danh sách homeworkId
 */
export function extractHomeworkIdsFromCreateResponse(res) {
  if (!res) return []
  if (res.isMultiVariant && Array.isArray(res.variants)) {
    return res.variants.map(v => v.homeworkId).filter(Boolean)
  }
  if (res.homeworkId) {
    return [res.homeworkId]
  }
  return []
}

/**
 * Tự động tạo và gắn file PDF đề trắng cho danh sách homeworkId.
 * Thực hiện tuần tự từng bài: getHomeworkDetail -> renderExamPdfBlob -> uploadFile -> updateHomework.
 * KHÔNG tự retry bước ghi khi lỗi không rõ; lỗi bài nào ghi nhận bài đó và tiếp tục bài khác.
 *
 * @param {string|string[]} homeworkIds Một hoặc nhiều homeworkId cần gắn PDF
 * @param {Object} [meta] Metadata bổ sung ({ title, durationMinutes })
 * @param {Object} [deps] Dependencies inject để test (api, renderExamPdfBlob, File)
 * @returns {Promise<Array<{ homeworkId: string, ok: boolean, pdfUrl?: string, error?: string }>>}
 */
export async function attachGeneratedPdfToHomeworks(
  homeworkIds,
  { title = '', durationMinutes = null } = {},
  deps = {}
) {
  const apiInstance = deps.api || api
  const renderPdf = deps.renderExamPdfBlob || renderExamPdfBlob
  const FileClass = deps.File || (typeof File !== 'undefined' ? File : null)

  const ids = Array.isArray(homeworkIds)
    ? homeworkIds.filter(Boolean)
    : (homeworkIds ? [homeworkIds] : [])

  const results = []

  for (const homeworkId of ids) {
    try {
      // 1. Lấy chi tiết bài tập theo đúng thứ tự & hoán vị thực tế đã lưu
      const detail = await apiInstance.getHomeworkDetail(homeworkId)
      const hw = detail?.homework || {}
      const questions = detail?.questions || []

      if (!Array.isArray(questions) || questions.length === 0) {
        results.push({
          homeworkId,
          ok: false,
          error: 'Bài tập không có câu hỏi để tạo file PDF.'
        })
        continue
      }

      // 2. Sinh PDF đề trắng mode 'student' với tiêu đề thực tế của bài
      const examTitle = hw.title || title || 'Đề bài'
      const examDuration = hw.durationMinutes ?? durationMinutes
      const pdfBlob = await renderPdf({
        title: examTitle,
        meta: { durationMinutes: examDuration },
        questions,
        mode: 'student'
      })

      // 3. Đóng gói thành File với tên ASCII an toàn
      const safeName = toSafeAsciiFileName(examTitle)
      let pdfFile
      if (FileClass) {
        pdfFile = new FileClass([pdfBlob], safeName, { type: 'application/pdf' })
      } else {
        pdfFile = pdfBlob
        pdfFile.name = safeName
      }

      // 4. Upload lên R2 qua pre-signed URL (KHÔNG tự retry nếu lỗi)
      const publicUrl = await apiInstance.uploadFile(pdfFile)
      if (!publicUrl) {
        throw new Error('Không nhận được URL sau khi tải lên file PDF.')
      }

      // 5. Cập nhật pdf_path vào homework (chỉ cập nhật pdf_path)
      await apiInstance.updateHomework({
        homeworkId,
        pdfPath: publicUrl
      })

      results.push({
        homeworkId,
        ok: true,
        pdfUrl: publicUrl
      })
    } catch (err) {
      results.push({
        homeworkId,
        ok: false,
        error: err?.message || String(err)
      })
    }
  }

  return results
}

let pdfQueuePromise = Promise.resolve()

/**
 * Đưa yêu cầu sinh & gắn PDF vào hàng đợi tuần tự để chống chạy trùng,
 * đồng thời hiển thị thông báo tiến trình và kết quả cho người dùng.
 *
 * @param {string|string[]} homeworkIds
 * @param {Object} [meta]
 * @param {Object} [deps]
 * @returns {Promise<Array<{ homeworkId: string, ok: boolean, pdfUrl?: string, error?: string }>>}
 */
export function queueAutoPdfGeneration(
  homeworkIds,
  meta = {},
  deps = {}
) {
  const toast = deps.showToast || showToast
  const runAttach = deps.attachGeneratedPdfToHomeworks || attachGeneratedPdfToHomeworks

  const task = async () => {
    toast('Đang tạo file PDF đề…', 'info')
    try {
      const results = await runAttach(homeworkIds, meta, deps)
      const successCount = results.filter(r => r.ok).length
      const failCount = results.length - successCount

      if (successCount > 0 && failCount === 0) {
        toast(`Đã gắn PDF cho ${successCount} đề`, 'success')
      } else if (successCount === 0) {
        const firstErr = results.find(r => !r.ok)?.error || 'Lỗi không xác định'
        toast(
          `Đề đã tạo nhưng chưa gắn được PDF: ${firstErr}. Có thể đính kèm thủ công trong trang sửa bài tập.`,
          'warning'
        )
      } else {
        const firstErr = results.find(r => !r.ok)?.error || 'Lỗi không xác định'
        toast(
          `Đã gắn PDF cho ${successCount}/${results.length} đề. Đề chưa gắn được: ${firstErr}. Có thể đính kèm thủ công trong trang sửa bài tập.`,
          'warning'
        )
      }
      return results
    } catch (err) {
      toast(
        `Đề đã tạo nhưng chưa gắn được PDF: ${err?.message || 'Lỗi hệ thống'}. Có thể đính kèm thủ công trong trang sửa bài tập.`,
        'warning'
      )
      return []
    }
  }

  pdfQueuePromise = pdfQueuePromise.then(task, task)
  return pdfQueuePromise
}
