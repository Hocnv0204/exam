// Khối "Soạn nhận xét" cho admin trong báo cáo tiến độ (spec 007).
// Mở modal chung, điền sẵn bản đã lưu (hoặc nháp tự sinh từ số liệu), lưu qua student-report-notes.
import { api } from '../../api.js'
import { openModal } from '../../components/modal.js'
import { showToast } from '../../components/toast.js'
import { escapeHtml } from '../../utils/download-helper.js'

export const NOTE_FIELDS = [
  { key: 'summary', label: 'Tóm tắt (2–3 câu, tiến bộ trước, cần cải thiện sau)', rows: 3 },
  { key: 'strengths', label: 'Điểm mạnh', rows: 3 },
  { key: 'improvements', label: 'Cần cải thiện (nêu cụ thể lỗi hay gặp)', rows: 3 },
  { key: 'attitude', label: 'Thái độ học tập (tập trung, phát biểu)', rows: 2 },
  { key: 'goalText', label: 'Mục tiêu kỳ tới', rows: 2 },
  { key: 'teacherSupport', label: 'Giáo viên sẽ hỗ trợ', rows: 2 },
  { key: 'parentActions', label: 'Phụ huynh có thể làm gì', rows: 2 }
]
export const MAX_NOTE_LENGTH = 1500

function textOf(value) {
  return value === null || value === undefined ? '' : String(value)
}

/** Đọc form → payload; trả { ok, value } hoặc { ok:false, error } (khớp validate phía server). */
export function collectNotesForm(root, period) {
  const value = { ...period }
  for (const field of NOTE_FIELDS) {
    const raw = textOf(root.querySelector(`[data-note-field="${field.key}"]`)?.value).trim()
    if (raw.length > MAX_NOTE_LENGTH) return { ok: false, error: `"${field.label}" dài quá ${MAX_NOTE_LENGTH} ký tự.` }
    value[field.key] = raw || null
  }
  const goalRaw = textOf(root.querySelector('[data-note-field="goalScore"]')?.value).trim().replace(',', '.')
  if (goalRaw === '') {
    value.goalScore = null
  } else {
    const goal = Number(goalRaw)
    if (!Number.isFinite(goal) || goal < 0 || goal > 10) return { ok: false, error: 'Điểm mục tiêu phải từ 0 đến 10.' }
    value.goalScore = Math.round(goal * 100) / 100
  }
  return { ok: true, value }
}

export function renderNotesForm(notes = {}) {
  const goal = notes?.goalScore === null || notes?.goalScore === undefined ? '' : String(notes.goalScore)
  return `
    <form class="pr-notes-form" data-pr-notes-form novalidate>
      <p class="pr-notes-hint">Nhận xét đã lưu sẽ hiện trên link chia sẻ cho phụ huynh. Viết điểm tiến bộ trước, điểm cần cải thiện sau, tránh thuật ngữ chuyên môn.</p>
      ${NOTE_FIELDS.map(field => `
        <label class="pr-notes-field">
          <span>${escapeHtml(field.label)}</span>
          <textarea class="form-input" rows="${field.rows}" maxlength="${MAX_NOTE_LENGTH}" data-note-field="${field.key}">${escapeHtml(textOf(notes?.[field.key]))}</textarea>
        </label>`).join('')}
      <label class="pr-notes-field pr-notes-field--short">
        <span>Điểm mục tiêu kỳ tới (0–10, có thể để trống)</span>
        <input class="form-input" type="number" min="0" max="10" step="0.5" inputmode="decimal" data-note-field="goalScore" value="${escapeHtml(goal)}">
      </label>
      <div class="pr-notes-actions">
        <button type="button" class="btn-secondary" data-pr-notes-action="use-draft">Dùng lại nháp tự động</button>
      </div>
      <p class="pr-notes-error" role="alert" data-pr-notes-error hidden></p>
    </form>
  `
}

function fillForm(root, notes) {
  NOTE_FIELDS.forEach(field => {
    const el = root.querySelector(`[data-note-field="${field.key}"]`)
    if (el) el.value = textOf(notes?.[field.key])
  })
  const goal = root.querySelector('[data-note-field="goalScore"]')
  if (goal) goal.value = notes?.goalScore === null || notes?.goalScore === undefined ? '' : String(notes.goalScore)
}

function formSnapshot(root) {
  return JSON.stringify([...root.querySelectorAll('[data-note-field]')].map(el => el.value))
}

/**
 * Mở khối soạn nhận xét. period = { studentId, classId, fromDate, toDate }.
 * onSaved(savedNotes) được gọi sau khi lưu thành công (để báo cáo hiển thị bản mới).
 */
export async function openReportNotesEditor(period, { onSaved } = {}) {
  let loaded
  try {
    loaded = await api.getStudentReportNotes(period)
  } catch (err) {
    showToast(`Không tải được nhận xét: ${err?.message || 'lỗi không xác định'}`, 'error')
    return
  }
  const draft = loaded?.draft || null
  const initial = loaded?.saved || draft || {}
  let initialSnapshot = ''
  let saved = false

  openModal(loaded?.saved ? 'Sửa nhận xét báo cáo' : 'Soạn nhận xét báo cáo', renderNotesForm(initial), async () => {
    const root = document.querySelector('[data-pr-notes-form]')
    if (!root) return false
    const errorEl = root.querySelector('[data-pr-notes-error]')
    const result = collectNotesForm(root, period)
    if (!result.ok) {
      if (errorEl) { errorEl.textContent = result.error; errorEl.hidden = false }
      return false
    }
    if (errorEl) errorEl.hidden = true
    try {
      const savedNotes = await api.saveStudentReportNotes(result.value)
      saved = true
      showToast('Đã lưu nhận xét báo cáo', 'success')
      onSaved?.(savedNotes)
      return true
    } catch (err) {
      if (errorEl) { errorEl.textContent = `Không lưu được: ${err?.message || 'lỗi không xác định'}`; errorEl.hidden = false }
      return false
    }
  }, {
    confirmLabel: 'Lưu nhận xét',
    contentClass: 'pr-notes-modal',
    beforeClose: reason => {
      if (reason === 'confirm' || saved) return true
      const root = document.querySelector('[data-pr-notes-form]')
      if (!root || formSnapshot(root) === initialSnapshot) return true
      return window.confirm('Nhận xét chưa được lưu. Đóng và bỏ thay đổi?')
    }
  })

  const root = document.querySelector('[data-pr-notes-form]')
  if (!root) return
  initialSnapshot = formSnapshot(root)
  const useDraft = root.querySelector('[data-pr-notes-action="use-draft"]')
  if (!draft) {
    useDraft?.setAttribute('disabled', 'true')
    useDraft?.setAttribute('title', 'Chưa tạo được nháp tự động cho kỳ này')
  }
  useDraft?.addEventListener('click', () => {
    if (draft) fillForm(root, draft)
  })
}
