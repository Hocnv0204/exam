import { renderSidebar, bindSidebarEvents } from '../components/sidebar.js'
import { renderNavbar } from '../components/navbar.js'
import { showToast } from '../components/toast.js'
import { openModal } from '../components/modal.js'
import { state } from '../state.js'
import { api } from '../api.js'
import { renderPdfViewer } from '../components/pdf-viewer.js'
import { renderMath, parseExamMarkdown, formatQuestionToMarkdown, formatExamToMarkdown, compressImage, MATH_TEMPLATE, CHEM_TEMPLATE } from '../utils/exam-parser.js'
import { calculateExamRawMax, applyExamPreset, EXAM_PRESETS } from '../utils/scoring-engine.js'

// In-memory state for building the answer matrix
let currentConfig = {
  mcCount: 12,  // Trắc nghiệm ABCD
  tfCount: 4,   // Trắc nghiệm Đúng/Sai (4 ý)
  saCount: 6   // Trả lời ngắn
}

// Interactive Exam State
let currentMode = 'INTERACTIVE' // 'INTERACTIVE' | 'PDF'
let interactiveMarkdown = MATH_TEMPLATE
let interactiveQuestions = []
let interactivePdfFile = null
let interactivePdfUrl = ''
let interactivePdfName = ''
let isInteractivePdfRemoved = false

// Initialize default parsed questions from MATH_TEMPLATE
try {
  interactiveQuestions = parseExamMarkdown(MATH_TEMPLATE).questions || []
} catch (e) {
  interactiveQuestions = []
}

// Store chosen answers relative to their sections:
// mcAnswers: { 1: 'A', 2: 'B', ... }
// tfAnswers: { 1: { a: true, b: false, ... }, ... }
// saAnswers: { 1: '9.8', ... }
let mcAnswers = {}
let tfAnswers = {}
let saAnswers = {}
let chaptersCache = {}
let lessonsCache = {}

function initAnswersState() {
  mcAnswers = {}
  tfAnswers = {}
  saAnswers = {}
}

// Initial call
initAnswersState()

export function resetCreateForm() {
  currentConfig.editingHomeworkId = null
  currentConfig.mcCount = 12
  currentConfig.tfCount = 4
  currentConfig.saCount = 6
  currentMode = 'INTERACTIVE'
  interactiveMarkdown = MATH_TEMPLATE
  interactiveQuestions = parseExamMarkdown(MATH_TEMPLATE).questions || []
  if (interactivePdfUrl && interactivePdfUrl.startsWith('blob:')) {
    URL.revokeObjectURL(interactivePdfUrl)
  }
  interactivePdfFile = null
  interactivePdfUrl = ''
  interactivePdfName = ''
  isInteractivePdfRemoved = false
  initAnswersState()
}

function escapeHtml(str) {
  if (!str) return ''
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;')
}

function renderInteractiveCardsHtml() {
  if (!interactiveQuestions || interactiveQuestions.length === 0) {
    return `
      <div style="background:#ffffff; border:1px dashed #cbd5e1; border-radius:10px; padding:30px; text-align:center; color:#64748b;">
        <i class="fa-solid fa-file-lines" style="font-size:36px; color:#cbd5e1; margin-bottom:10px; display:block;"></i>
        <div style="font-weight:600; font-size:14px; margin-bottom:4px;">Chưa có câu hỏi nào được bóc tách</div>
        <div style="font-size:12px;">Nhập nội dung vào khung soạn thảo ở trên và bấm "Phân tích & Xem trước", hoặc bấm "Mẫu Toán" / "Mẫu Hóa".</div>
      </div>
    `
  }

  const rawMax = calculateExamRawMax(interactiveQuestions)
  const isStandard10 = Math.abs(rawMax - 10.0) < 1e-4

  return `
    <div style="background:#f8fafc; border:1px solid #e2e8f0; border-radius:10px; padding:12px 14px; margin-bottom:12px;">
      <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:8px; flex-wrap:wrap; gap:8px;">
        <div style="display:flex; align-items:center; gap:8px; flex-wrap:wrap;">
          <span style="font-weight:700; font-size:13.5px; color:#0f172a;">
            <i class="fa-solid fa-list-check" style="color:#10b981;"></i> Danh sách câu hỏi (${interactiveQuestions.length} câu)
          </span>
          <span id="raw-max-points-badge" class="badge" style="background:${isStandard10 ? '#dcfce7' : '#eff6ff'}; color:${isStandard10 ? '#16a34a' : '#0284c7'}; border:1px solid ${isStandard10 ? '#bbf7d0' : '#bfdbfe'}; font-weight:700; font-size:12px; padding:3px 8px; border-radius:6px;">
            <i class="fa-solid ${isStandard10 ? 'fa-circle-check' : 'fa-calculator'}"></i> Tổng điểm thô: <strong>${rawMax}đ</strong> ${isStandard10 ? '(Chuẩn 10.0đ)' : '→ Tự động quy đổi thang 10'}
          </span>
        </div>
        <span style="font-size:11.5px; color:#0284c7; background:#e0f2fe; padding:3px 10px; border-radius:10px; font-weight:600;">
          <i class="fa-solid fa-paste"></i> Mẹo: Bấm nút "Sửa MD" để sửa từng câu, hoặc dán ảnh vào câu hỏi
        </span>
      </div>

      <!-- Quick Point Presets Toolbar -->
      <div style="display:flex; align-items:center; gap:6px; flex-wrap:wrap; font-size:12px; border-top:1px dashed #cbd5e1; padding-top:8px;">
        <span style="font-weight:600; color:#64748b; margin-right:4px;">
          <i class="fa-solid fa-wand-magic-sparkles" style="color:#8b5cf6;"></i> Mẫu phân bổ điểm:
        </span>
        <button type="button" class="btn-apply-preset" data-preset="THPT_TOAN" style="padding:3px 8px; border-radius:5px; background:#ffffff; border:1px solid #cbd5e1; font-size:11.5px; font-weight:600; color:#334155; cursor:pointer; display:inline-flex; align-items:center; gap:4px;" title="12 Trắc nghiệm (0.25đ) + 4 Đúng/Sai (1.0đ) + 6 Điền khuyết (0.5đ) = 10đ">
          THPT Toán (12-4-6)
        </button>
        <button type="button" class="btn-apply-preset" data-preset="THPT_KHTN" style="padding:3px 8px; border-radius:5px; background:#ffffff; border:1px solid #cbd5e1; font-size:11.5px; font-weight:600; color:#334155; cursor:pointer; display:inline-flex; align-items:center; gap:4px;" title="18 Trắc nghiệm (0.25đ) + 4 Đúng/Sai (1.0đ) + 6 Điền khuyết (0.25đ) = 10đ">
          THPT KHTN (18-4-6)
        </button>
        <button type="button" class="btn-apply-preset" data-preset="EQUAL_10" style="padding:3px 8px; border-radius:5px; background:#ffffff; border:1px solid #cbd5e1; font-size:11.5px; font-weight:600; color:#334155; cursor:pointer; display:inline-flex; align-items:center; gap:4px;" title="Chia đều 10 điểm cho toàn bộ số câu trong đề">
          Chia đều 10đ
        </button>
        <button type="button" class="btn-apply-preset" data-preset="EQUAL_1" style="padding:3px 8px; border-radius:5px; background:#ffffff; border:1px solid #cbd5e1; font-size:11.5px; font-weight:600; color:#334155; cursor:pointer; display:inline-flex; align-items:center; gap:4px;" title="Mỗi câu 1 điểm (Hệ thống tự động quy đổi thang 10 khi nộp)">
          1.0đ / câu
        </button>
      </div>
    </div>

    ${interactiveQuestions.map((q, idx) => {
      const qIndex = idx
      const qNum = q.questionNumber || (idx + 1)
      const typeLabel = q.questionType === 'MULTIPLE_CHOICE'
        ? 'Phần I: Trắc nghiệm ABCD'
        : (q.questionType === 'TRUE_FALSE' ? 'Phần II: Đúng / Sai' : 'Phần III: Trả lời ngắn')
      const typeColor = q.questionType === 'MULTIPLE_CHOICE'
        ? '#0066cc'
        : (q.questionType === 'TRUE_FALSE' ? '#0284c7' : '#4f46e5')

      return `
        <div class="interactive-q-card" data-qindex="${qIndex}" data-qnum="${qNum}" tabindex="0">
          <div class="interactive-q-header">
            <div style="display:flex; align-items:center; gap:8px; flex-wrap:wrap;">
              <span class="badge" style="background:${typeColor}15; color:${typeColor}; font-weight:700; font-size:12px;">
                ${typeLabel}
              </span>
              <span style="font-weight:700; font-size:14px; color:#0f172a;">Câu ${qNum}</span>
            </div>
            <div style="display:flex; align-items:center; gap:8px; flex-wrap:wrap;">
              <button type="button" class="btn-edit-q-md btn-secondary" data-qindex="${qIndex}" data-qnum="${qNum}" title="Chỉnh sửa cú pháp Markdown của Câu ${qNum}" style="padding:4px 10px; font-size:12px; font-weight:600; border-radius:6px; background:#eff6ff; color:#0284c7; border:1px solid #bfdbfe; cursor:pointer; display:inline-flex; align-items:center; gap:4px; transition:all 0.15s ease;">
                <i class="fa-solid fa-pen-to-square"></i> Sửa MD
              </button>
              <div style="font-size:12px; color:#64748b; display:flex; align-items:center; gap:5px;">
                <span>Điểm:</span>
                <input type="number" step="0.25" min="0" value="${q.points || (q.questionType === 'TRUE_FALSE' ? 1.0 : (q.questionType === 'SHORT_ANSWER' ? 0.5 : 0.25))}" data-qindex="${qIndex}" data-qnum="${qNum}" class="q-points-input" style="width:55px; padding:2px 6px; font-size:12px; border:1px solid #cbd5e1; border-radius:4px;">
              </div>
            </div>
          </div>

          <!-- Prompt Text with KaTeX -->
          <div class="interactive-q-prompt">${escapeHtml(q.promptText || '')}</div>

          <!-- Image Area (Dropzone or Attached Image) -->
          <div style="margin:10px 0 14px 0;">
            ${q.imageUrl ? `
              <div style="position:relative; display:inline-block; max-width:100%;">
                <img src="${q.imageUrl}" alt="Câu ${qNum}" class="interactive-q-image" style="margin:0;">
                <button type="button" class="btn-remove-q-image" data-qindex="${qIndex}" data-qnum="${qNum}" style="position:absolute; top:8px; right:8px; background:rgba(239,68,68,0.9); color:#ffffff; border:none; border-radius:6px; padding:4px 8px; font-size:11px; cursor:pointer; font-weight:600; display:inline-flex; align-items:center; gap:4px; box-shadow:0 2px 6px rgba(0,0,0,0.2);">
                  <i class="fa-solid fa-trash"></i> Xóa ảnh
                </button>
              </div>
            ` : `
              <div class="image-paste-zone" data-qindex="${qIndex}" data-qnum="${qNum}" tabindex="0" title="Nhấp vào đây và bấm Ctrl+V để dán ảnh chụp màn hình, hoặc bấm để tải ảnh từ máy">
                <input type="file" accept="image/*" class="q-image-file-input" data-qindex="${qIndex}" data-qnum="${qNum}" style="display:none;">
                <i class="fa-regular fa-image" style="font-size:22px; color:#94a3b8; margin-bottom:4px; display:block;"></i>
                <div style="font-size:12px; font-weight:600; color:#334155; margin-bottom:2px;">
                  Chèn hình ảnh cho Câu ${qNum}
                </div>
                <div style="font-size:11px; color:#64748b;">
                  Kéo thả ảnh vào đây, hoặc <span style="color:#0066cc; font-weight:600; text-decoration:underline;">chọn từ máy</span>, hoặc bấm <strong>Ctrl + V</strong> để dán ảnh chụp
                </div>
              </div>
            `}
          </div>

          <!-- Options Preview -->
          ${q.questionType === 'MULTIPLE_CHOICE' ? `
            <div class="exam-options-grid grid-2col">
              ${(q.options || []).map(opt => {
                const isCorrect = q.mcAnswer === opt.id
                return `
                  <div class="exam-option-card ${isCorrect ? 'selected' : ''}" data-qindex="${qIndex}" data-qnum="${qNum}" data-optid="${opt.id}" style="${isCorrect ? 'border-color:#16a34a; background:#f0fdf4; color:#15803d;' : ''}">
                    <div class="exam-opt-badge" style="${isCorrect ? 'background:#16a34a; color:#ffffff;' : ''}">${opt.id}</div>
                    <div style="flex:1 1 auto;">${escapeHtml(opt.text || '')}</div>
                    ${isCorrect ? '<i class="fa-solid fa-circle-check" style="color:#16a34a; font-size:16px;"></i>' : ''}
                  </div>
                `
              }).join('')}
            </div>
          ` : (q.questionType === 'TRUE_FALSE' ? `
            <div style="display:flex; flex-direction:column; gap:6px; margin-bottom:10px;">
              ${(q.options || []).map(sub => {
                const isTrue = q.tfAnswers && q.tfAnswers[sub.id] === true
                return `
                  <div class="tf-statement-row" data-qindex="${qIndex}" data-subid="${sub.id}">
                    <div class="tf-statement-text">
                      <strong>${sub.id})</strong> ${escapeHtml(sub.text || '')}
                    </div>
                    <div class="tf-toggle-btns">
                      <span class="badge" style="${isTrue ? 'background:#16a34a; color:#ffffff;' : 'background:#dc2626; color:#ffffff;'} font-weight:700; padding:3px 10px; font-size:11px;">
                        ${isTrue ? 'ĐÚNG' : 'SAI'}
                      </span>
                    </div>
                  </div>
                `
              }).join('')}
            </div>
          ` : `
            <div style="background:#f8fafc; border:1px solid #e2e8f0; border-radius:8px; padding:10px 14px; margin-bottom:10px; display:flex; align-items:center; justify-content:space-between; flex-wrap:wrap; gap:10px;">
              <div style="font-size:13px; font-weight:600; color:#334155;">
                <i class="fa-solid fa-key" style="color:#4f46e5;"></i> Đáp án đúng: <span style="color:#15803d; font-family:monospace; font-size:14px; background:#dcfce7; padding:2px 8px; border-radius:4px;">${escapeHtml(q.saAnswer || 'Chưa nhập')}</span>
              </div>
              <div style="font-size:12px; color:#64748b;">
                Dung sai cho phép: <strong>&plusmn; ${q.saTolerance || 0}</strong>
              </div>
            </div>
          `)}

          <!-- Explanation (Lời giải) -->
          ${q.explanation ? `
            <div style="background:#f1f5f9; border-left:3px solid #0284c7; border-radius:0 8px 8px 0; padding:8px 12px; margin-top:8px; font-size:12.5px; color:#334155; line-height:1.5;">
              <strong style="color:#0284c7; display:flex; align-items:center; gap:4px; margin-bottom:3px;">
                <i class="fa-solid fa-lightbulb"></i> Lời giải chi tiết:
              </strong>
              <div>${escapeHtml(q.explanation)}</div>
            </div>
          ` : ''}
        </div>
      `
    }).join('')}
  `
}

function renderInteractivePdfAttachmentHtml() {
  const hasFile = !!(interactivePdfFile || interactivePdfUrl)
  const fileName = interactivePdfFile ? interactivePdfFile.name : (interactivePdfName || 'Tep_Dinh_Kem.pdf')
  const fileSizeText = interactivePdfFile ? ` (${(interactivePdfFile.size / (1024 * 1024)).toFixed(2)} MB)` : ''

  return `
    <div class="interactive-pdf-attachment-bar" style="background:#ffffff; border:1px solid ${hasFile ? '#bfdbfe' : '#e2e8f0'}; border-radius:10px; padding:10px 14px; margin-bottom:12px; display:flex; justify-content:space-between; align-items:center; flex-wrap:wrap; gap:10px; box-shadow:0 2px 6px rgba(0,0,0,0.02);">
      <input type="file" id="hw-interactive-pdf-input" accept=".pdf" style="display:none;">
      
      <div style="display:flex; align-items:center; gap:10px; min-width:0; flex:1 1 auto; overflow:hidden;">
        <div style="width:36px; height:36px; border-radius:8px; background:${hasFile ? '#eff6ff' : '#f8fafc'}; color:${hasFile ? '#ef4444' : '#94a3b8'}; display:flex; align-items:center; justify-content:center; font-size:18px; flex-shrink:0; border:1px solid ${hasFile ? '#dbeafe' : '#e2e8f0'};">
          <i class="fa-solid fa-file-pdf"></i>
        </div>
        <div style="min-width:0; overflow:hidden;">
          ${hasFile ? `
            <div style="font-weight:700; font-size:13px; color:#0f172a; overflow:hidden; text-overflow:ellipsis; white-space:nowrap;" title="${escapeHtml(fileName)}">
              ${escapeHtml(fileName)}<span style="font-size:11.5px; font-weight:normal; color:#64748b;">${fileSizeText}</span>
            </div>
            <div style="font-size:11px; color:#059669; display:flex; align-items:center; gap:4px; margin-top:2px;">
              <i class="fa-solid fa-circle-check"></i> ${interactivePdfFile ? 'Đã chọn file từ máy (sẽ upload khi lưu bài tập)' : 'File PDF đính kèm của bài tập'}
            </div>
          ` : `
            <div style="font-weight:600; font-size:13px; color:#334155;">
              Đính kèm file PDF đề bài (Tùy chọn)
            </div>
            <div style="font-size:11px; color:#64748b; margin-top:1px;">
              Giúp học sinh có thể xem hoặc tải file PDF đề bài gốc về máy trong lúc làm bài
            </div>
          `}
        </div>
      </div>

      <div style="display:flex; align-items:center; gap:8px; flex-shrink:0; flex-wrap:nowrap;">
        ${hasFile ? `
          <button type="button" class="btn-secondary" id="btn-preview-interactive-pdf" style="padding:6px 12px; font-size:12px; font-weight:600; border-radius:6px; background:#eff6ff; color:#0066cc; border:1px solid #bfdbfe; cursor:pointer; display:inline-flex; align-items:center; gap:5px;" title="Xem trước file PDF">
            <i class="fa-solid fa-eye"></i> Xem preview
          </button>
          <button type="button" class="btn-secondary" id="btn-change-interactive-pdf" style="padding:6px 10px; font-size:12px; font-weight:600; border-radius:6px; cursor:pointer; display:inline-flex; align-items:center; gap:5px;" title="Chọn file PDF khác">
            <i class="fa-solid fa-arrow-rotate-right"></i> Đổi file
          </button>
          <button type="button" class="btn-secondary" id="btn-remove-interactive-pdf" style="padding:6px 10px; font-size:12px; font-weight:600; border-radius:6px; color:#dc2626; border-color:#fca5a5; background:#fff1f2; cursor:pointer; display:inline-flex; align-items:center; gap:5px;" title="Xóa file PDF đính kèm">
            <i class="fa-solid fa-trash"></i> Xóa
          </button>
        ` : `
          <button type="button" class="btn-secondary" id="btn-select-interactive-pdf" style="padding:6px 14px; font-size:12.5px; font-weight:600; border-radius:6px; background:#f0f9ff; color:#0284c7; border:1px solid #bae6fd; cursor:pointer; display:inline-flex; align-items:center; gap:6px;">
            <i class="fa-solid fa-cloud-arrow-up"></i> Tải file PDF
          </button>
        `}
      </div>
    </div>
  `
}

function openPdfPreviewModal(pdfUrl, fileName) {
  if (!pdfUrl) {
    showToast('Chưa có file PDF nào để xem trước!', 'warning')
    return
  }

  const modalBodyHtml = `
    <div style="display:flex; flex-direction:column; height:72vh; width:100%; box-sizing:border-box;">
      <div id="interactive-pdf-modal-container" class="pdf-viewer-container" style="flex:1; display:flex; flex-direction:column; border:1px solid #cbd5e1; border-radius:10px; overflow:hidden; background:#f8fafc; position:relative; box-shadow:0 4px 12px rgba(0,0,0,0.05);">
        <div class="pdf-toolbar" style="display:flex; justify-content:space-between; align-items:center; padding:8px 14px; background:#f1f5f9; border-bottom:1px solid #cbd5e1; flex-shrink:0; flex-wrap:nowrap; gap:10px;">
          <div style="font-weight:700; font-size:13px; color:#0f172a; display:flex; align-items:center; gap:8px; overflow:hidden; text-overflow:ellipsis; white-space:nowrap; min-width:0; flex:1 1 auto;">
            <i class="fa-solid fa-file-pdf" style="color:#ef4444; font-size:16px; flex-shrink:0;"></i>
            <span style="overflow:hidden; text-overflow:ellipsis; white-space:nowrap;" title="${escapeHtml(fileName || 'Xem_Truoc_De_Bai.pdf')}">${escapeHtml(fileName || 'Xem_Truoc_De_Bai.pdf')}</span>
          </div>
          <div style="display:flex; align-items:center; gap:8px; flex-shrink:0; flex-wrap:nowrap;">
            <div class="pdf-controls-slot" style="display:flex; align-items:center; flex-shrink:0;"></div>
            <a href="${pdfUrl}" download="${escapeHtml(fileName || 'De_Bai.pdf')}" target="_blank" rel="noopener noreferrer" class="btn-secondary" style="padding:5px 12px; font-size:12px; font-weight:600; border-radius:6px; background:#eff6ff; color:#0066cc; border:1px solid #bfdbfe; cursor:pointer; display:inline-flex; align-items:center; gap:5px; text-decoration:none;" title="Tải file về máy">
              <i class="fa-solid fa-download"></i> Tải về
            </a>
          </div>
        </div>
        <div id="interactive-modal-pdf-viewport" class="pdf-iframe-wrapper" style="flex:1; width:100%; height:100%; min-height:0; position:relative; overflow:hidden; background:#334155; display:flex; justify-content:center; align-items:center;"></div>
      </div>
    </div>
  `

  openModal(`Xem trước File PDF Đề bài`, modalBodyHtml, null)
  const mc = document.querySelector('#modal-container .modal-content')
  if (mc) mc.style.maxWidth = '920px'

  setTimeout(() => {
    const viewport = document.getElementById('interactive-modal-pdf-viewport')
    if (viewport) {
      renderPdfViewer(viewport, pdfUrl)
    }
  }, 60)
}

function bindInteractivePdfEvents() {
  const fileInput = document.getElementById('hw-interactive-pdf-input')
  const selectBtn = document.getElementById('btn-select-interactive-pdf')
  const changeBtn = document.getElementById('btn-change-interactive-pdf')
  const removeBtn = document.getElementById('btn-remove-interactive-pdf')
  const previewBtn = document.getElementById('btn-preview-interactive-pdf')

  selectBtn?.addEventListener('click', () => fileInput?.click())
  changeBtn?.addEventListener('click', () => fileInput?.click())

  fileInput?.addEventListener('change', (e) => {
    const file = e.target.files?.[0]
    if (file && file.type === 'application/pdf') {
      interactivePdfFile = file
      interactivePdfName = file.name
      isInteractivePdfRemoved = false
      if (interactivePdfUrl && interactivePdfUrl.startsWith('blob:')) {
        URL.revokeObjectURL(interactivePdfUrl)
      }
      interactivePdfUrl = URL.createObjectURL(file)
      
      const container = document.getElementById('interactive-pdf-attachment-container')
      if (container) {
        container.innerHTML = renderInteractivePdfAttachmentHtml()
        bindInteractivePdfEvents()
      }
      showToast(`Đã chọn file PDF: ${file.name}`, 'success')
    }
  })

  removeBtn?.addEventListener('click', () => {
    if (interactivePdfUrl && interactivePdfUrl.startsWith('blob:')) {
      URL.revokeObjectURL(interactivePdfUrl)
    }
    interactivePdfFile = null
    interactivePdfUrl = ''
    interactivePdfName = ''
    isInteractivePdfRemoved = true
    if (fileInput) fileInput.value = ''

    const container = document.getElementById('interactive-pdf-attachment-container')
    if (container) {
      container.innerHTML = renderInteractivePdfAttachmentHtml()
      bindInteractivePdfEvents()
    }
    showToast('Đã gỡ bỏ file PDF đính kèm!', 'info')
  })

  previewBtn?.addEventListener('click', () => {
    if (interactivePdfUrl) {
      openPdfPreviewModal(interactivePdfUrl, interactivePdfName || interactivePdfFile?.name)
    } else {
      showToast('Chưa có file PDF để xem trước!', 'warning')
    }
  })
}

function renderLeftColumn(hw, isEdit, pdfDownloadUrl, pdfDownloadName) {
  return `
    <div style="margin-bottom:12px; display:flex; justify-content:space-between; align-items:center; flex-wrap:wrap; gap:10px;">
      <div class="exam-mode-switch">
        <button type="button" class="exam-mode-tab ${currentMode === 'INTERACTIVE' ? 'active' : ''}" id="btn-mode-interactive">
          <i class="fa-solid fa-wand-magic-sparkles" style="color:#0284c7;"></i> Đề thi Tương tác (Toán & Hóa)
        </button>
        <button type="button" class="exam-mode-tab ${currentMode === 'PDF' ? 'active' : ''}" id="btn-mode-pdf">
          <i class="fa-solid fa-file-pdf" style="color:#ef4444;"></i> Đề bài qua file PDF
        </button>
      </div>

      ${currentMode === 'INTERACTIVE' ? `
        <div style="display:flex; gap:6px; align-items:center;">
          <button type="button" class="btn-secondary" id="btn-load-math-tpl" style="padding:5px 10px; font-size:12px; border-radius:6px; cursor:pointer;" title="Nạp nội dung đề mẫu môn Toán">
            <i class="fa-solid fa-square-root-variable" style="color:#0284c7;"></i> Mẫu Toán
          </button>
          <button type="button" class="btn-secondary" id="btn-load-chem-tpl" style="padding:5px 10px; font-size:12px; border-radius:6px; cursor:pointer;" title="Nạp nội dung đề mẫu môn Hóa học">
            <i class="fa-solid fa-flask" style="color:#10b981;"></i> Mẫu Hóa
          </button>
          <button type="button" class="btn-primary" id="btn-parse-markdown" style="padding:5px 12px; font-size:12px; border-radius:6px; cursor:pointer; background:linear-gradient(135deg, #0284c7, #0066cc);">
            <i class="fa-solid fa-bolt"></i> Phân tích & Xem trước
          </button>
        </div>
      ` : ''}
    </div>

    ${currentMode === 'INTERACTIVE' ? `
      <!-- INTERACTIVE MARKDOWN & QUESTION PREVIEW -->
      <div class="interactive-creator-wrapper" style="display:flex; flex-direction:column; gap:14px; height:calc(100vh - 180px); overflow-y:auto; padding-right:6px;">
        
        <!-- Attached PDF Section in Interactive Mode -->
        <div id="interactive-pdf-attachment-container">
          ${renderInteractivePdfAttachmentHtml()}
        </div>

        <!-- Collapsible Markdown Input Box -->
        <div class="card" style="margin:0; padding:14px; border:1px solid #cbd5e1; border-radius:10px; background:#ffffff;">
          <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:8px;">
            <span style="font-weight:700; font-size:13px; color:#1e293b; display:flex; align-items:center; gap:6px;">
              <i class="fa-solid fa-code" style="color:#0284c7;"></i> Nội dung Đề thi Text / Markdown (Toán & Hóa):
            </span>
            <span style="font-size:11px; color:#64748b;">
              Công thức: <code>$...$</code>, Hóa học: <code>$\\ce{...}$</code>, Ảnh: <code>[Ảnh]</code>
            </span>
          </div>
          <textarea id="hw-markdown-input" class="form-input" style="width:100%; height:180px; font-family:monospace; font-size:12px; line-height:1.5; padding:10px; resize:vertical; background:#f8fafc; border:1px solid #cbd5e1; border-radius:8px;">${interactiveMarkdown}</textarea>
        </div>

        <!-- Parsed Questions Cards List -->
        <div id="interactive-preview-container">
          ${renderInteractiveCardsHtml()}
        </div>
      </div>
    ` : `
      <!-- PDF VIEWER CONTAINER (ORIGINAL) -->
      <div class="pdf-viewer-container" style="box-shadow: 0 4px 12px rgba(0,0,0,0.05); border:1px solid #cbd5e1; display:flex; flex-direction:column; overflow:hidden;">
        <div class="pdf-toolbar" style="display:flex; justify-content:space-between; align-items:center; flex-wrap:nowrap; gap:10px; margin-bottom:12px; padding:8px 14px; box-sizing:border-box;">
          <div style="font-weight:700; color:#0f172a; display:flex; align-items:center; gap:8px; min-width:0; flex:1 1 auto; overflow:hidden;">
            <i class="fa-solid fa-file-pdf" style="color:#ef4444; font-size:18px; flex-shrink:0;"></i>
            <span id="pdf-viewer-title" style="overflow:hidden; text-overflow:ellipsis; white-space:nowrap; font-size:13px;" title="${hw?.pdfPath || 'Chưa chọn file PDF'}">${hw?.pdfPath || 'Chưa chọn file PDF'}</span>
          </div>
          <div style="display:flex; align-items:center; gap:8px; flex-shrink:0; flex-wrap:nowrap;">
            <div class="pdf-controls-slot" style="display:flex; align-items:center; flex-shrink:0;"></div>
            <input type="file" id="hw-pdf-file" accept=".pdf" style="display:none;">
            <button class="btn-primary" type="button" onclick="document.getElementById('hw-pdf-file').click()" style="width:auto !important; white-space:nowrap; flex-shrink:0; padding:6px 12px; font-size:12px; height:32px; line-height:1; display:inline-flex; align-items:center; gap:5px; cursor:pointer; box-shadow:none; border-radius:6px;">
              <i class="fa-solid fa-upload"></i> Chọn file PDF
            </button>
            <a id="download-hw-pdf-btn" href="${pdfDownloadUrl || '#'}" download="${pdfDownloadName}" target="_blank" rel="noopener noreferrer" style="width:auto !important; white-space:nowrap; flex-shrink:0; padding:6px 12px; font-size:12px; height:32px; box-sizing:border-box; line-height:1; display:inline-flex; align-items:center; gap:5px; text-decoration:none; ${pdfDownloadUrl ? 'background:#eff6ff; color:#0066cc; border:1px solid #bfdbfe; cursor:pointer;' : 'background:#f8fafc; color:#94a3b8; border:1px solid #e2e8f0; cursor:not-allowed; opacity:0.7;'} border-radius:6px; font-weight:600; transition:all 0.2s;" title="${pdfDownloadUrl ? `Tải file PDF: ${pdfDownloadName}` : 'Chưa có file PDF để tải xuống'}">
              <i class="fa-solid fa-download"></i> Tải file PDF
            </a>
          </div>
        </div>

        <div id="pdf-preview-container" class="pdf-iframe-wrapper" style="flex-grow:1; display:flex; height:calc(100vh - 180px); background:#f8fafc; border:1px dashed #cbd5e1; border-radius:8px; justify-content:center; align-items:center; overflow-y:auto; -webkit-overflow-scrolling:touch; touch-action:pan-x pan-y; position:relative;">
          <iframe id="pdf-preview-iframe" src="${isEdit && hw?.pdfUrl ? hw.pdfUrl.replace(/https?:\/\/kong:8000/g, import.meta.env.VITE_SUPABASE_URL || 'http://localhost:54321') : ''}" style="width:100%; height:100%; min-height:100%; border:none; background:#f8fafc; -webkit-overflow-scrolling:touch; ${isEdit && hw?.pdfUrl ? '' : 'display:none;'}"></iframe>
          ${!(isEdit && hw?.pdfUrl) ? `
            <div id="pdf-placeholder" style="color:#64748b; text-align:center; padding:20px;">
              <i class="fa-regular fa-file-pdf" style="font-size:48px; color:#cbd5e1; margin-bottom:12px; display:block;"></i>
              <span style="font-size:13px;">Vui lòng chọn file đề bài PDF để xem trước</span>
            </div>
          ` : ''}
        </div>
      </div>
    `}
  `
}

export function renderCreateHwView() {
  const isEdit = !!state.editHomeworkData
  const hw = isEdit ? state.editHomeworkData.homework : null
  const questions = isEdit ? (state.editHomeworkData.questions || []) : []

  const pdfDownloadUrl = (isEdit && hw?.pdfUrl) ? hw.pdfUrl.replace(/https?:\/\/kong:8000/g, import.meta.env.VITE_SUPABASE_URL || 'http://localhost:54321') : ''
  const pdfDownloadName = hw?.pdfPath || 'Homework_Attachment.pdf'

  let deadlineVal = ''
  if (isEdit && hw && (hw.deadline || hw.deadline_at)) {
    const d = new Date(hw.deadline || hw.deadline_at)
    if (!isNaN(d.getTime())) {
      const year = d.getFullYear()
      const month = String(d.getMonth() + 1).padStart(2, '0')
      const day = String(d.getDate()).padStart(2, '0')
      const hours = String(d.getHours()).padStart(2, '0')
      const minutes = String(d.getMinutes()).padStart(2, '0')
      deadlineVal = `${year}-${month}-${day}T${hours}:${minutes}`
    }
  }

  if (isEdit && hw && questions.length > 0) {
    if (currentConfig.editingHomeworkId !== hw.id) {
      currentConfig.editingHomeworkId = hw.id

      // Check if interactive questions
      const hasInteractive = questions.some(q => {
        try {
          const p = typeof q.prompt === 'string' && q.prompt.startsWith('{') ? JSON.parse(q.prompt) : null
          return p && p.isInteractive
        } catch (e) { return false }
      })

      if (hasInteractive) {
        currentMode = 'INTERACTIVE'
        const hasPdf = !!(hw.pdfPath && hw.pdfPath !== 'INTERACTIVE' && hw.pdfPath !== 'Homework_Attachment.pdf' && hw.pdfPath.endsWith('.pdf'))
        if (hasPdf && !isInteractivePdfRemoved) {
          interactivePdfName = hw.pdfPath
          interactivePdfUrl = hw.pdfUrl ? hw.pdfUrl.replace(/https?:\/\/kong:8000/g, import.meta.env.VITE_SUPABASE_URL || 'http://localhost:54321') : ''
        }
        interactiveQuestions = questions.map(q => {
          let pObj = {}
          try {
            pObj = typeof q.prompt === 'string' && q.prompt.startsWith('{') ? JSON.parse(q.prompt) : {}
          } catch (e) {}
          const qa = q.answerKey || {}
          return {
            questionNumber: q.question_number || q.questionNumber,
            questionType: q.question_type || q.questionType,
            points: q.points || (q.question_type === 'TRUE_FALSE' ? 1.0 : (q.question_type === 'SHORT_ANSWER' ? 0.5 : 0.25)),
            promptText: pObj.text || q.prompt || '',
            imageUrl: pObj.imageUrl || '',
            options: pObj.options || [],
            explanation: pObj.explanation || '',
            mcAnswer: qa.mc_answer || 'A',
            tfAnswers: qa.tf_answers || { a: true, b: true, c: false, d: true },
            saAnswer: qa.sa_answer !== undefined && qa.sa_answer !== null ? String(qa.sa_answer) : '',
            saTolerance: qa.sa_tolerance || 0,
            hasImagePlaceholder: !!pObj.imageUrl
          }
        })
        interactiveMarkdown = formatExamToMarkdown(interactiveQuestions) || MATH_TEMPLATE
      } else {
        currentMode = 'PDF'
      }

      const mcQ = questions.filter(q => q.question_type === 'MULTIPLE_CHOICE')
      const tfQ = questions.filter(q => q.question_type === 'TRUE_FALSE')
      const saQ = questions.filter(q => q.question_type === 'SHORT_ANSWER')

      currentConfig.mcCount = mcQ.length
      currentConfig.tfCount = tfQ.length
      currentConfig.saCount = saQ.length

      mcAnswers = {}
      mcQ.forEach((q, index) => {
        const ans = q.answerKey?.mc_answer || 'A'
        mcAnswers[index + 1] = ans
        if (q.question_number) mcAnswers[q.question_number] = ans
      })

      tfAnswers = {}
      tfQ.forEach((q, index) => {
        const val = q.answerKey?.tf_answers || {}
        const a = val.a !== undefined ? val.a : (val.s1 !== undefined ? val.s1 : true)
        const b = val.b !== undefined ? val.b : (val.s2 !== undefined ? val.s2 : true)
        const c = val.c !== undefined ? val.c : (val.s3 !== undefined ? val.s3 : false)
        const d = val.d !== undefined ? val.d : (val.s4 !== undefined ? val.s4 : true)
        const parsedTf = { a, b, c, d }
        tfAnswers[index + 1] = parsedTf
        if (q.question_number) tfAnswers[q.question_number] = parsedTf
      })

      saAnswers = {}
      saQ.forEach((q, index) => {
        const val = q.answerKey?.sa_answer !== undefined && q.answerKey?.sa_answer !== null ? String(q.answerKey.sa_answer) : ''
        saAnswers[index + 1] = val
        if (q.question_number) saAnswers[q.question_number] = val
      })
    }
  } else if (!isEdit) {
    currentConfig.editingHomeworkId = null
    if (interactiveQuestions.length === 0) {
      interactiveQuestions = parseExamMarkdown(MATH_TEMPLATE).questions || []
    }
  }

  const classOptions = state.classes.map(c => {
    const isSel = isEdit && (hw.classId === c.id || hw.class_id === c.id)
    return `<option value="${c.id}" ${isSel ? 'selected' : ''}>${c.name}</option>`
  }).join('')

  let displayTitle = isEdit ? (hw?.title || '') : ''
  if (isEdit && hw?.title && hw?.lessonTitle) {
    const prefix = `${hw.lessonTitle} - `
    if (displayTitle.startsWith(prefix)) {
      displayTitle = displayTitle.substring(prefix.length)
    }
  }

  return `
    <div class="app-layout">
      ${renderSidebar('create-homework')}
      <div class="main-content">
        ${renderNavbar(isEdit ? 'Quản trị / Sửa bài tập' : 'Quản trị / Tạo bài tập')}
        <div class="content-body" style="padding: 16px 24px;">
          <div class="split-homework-layout">
            
            <!-- LEFT COLUMN: INTERACTIVE OR PDF -->
            <div id="create-hw-left-pane" style="display:flex; flex-direction:column; overflow:hidden;">
              ${renderLeftColumn(hw, isEdit, pdfDownloadUrl, pdfDownloadName)}
            </div>

            <!-- RIGHT COLUMN: CONFIG & ANSWER KEY MATRIX (40%) -->
            <div class="question-column" style="overflow-y:auto; max-height:calc(100vh - 120px); display:flex; flex-direction:column; gap:20px; padding-right:4px;">
              
              <!-- Question Bank Shortcut Banner -->
              <div style="background:linear-gradient(135deg, #eff6ff, #f0fdf4); border:1px solid #bfdbfe; border-radius:12px; padding:12px 16px; display:flex; justify-content:space-between; align-items:center; flex-wrap:wrap; gap:10px;">
                <div style="display:flex; align-items:center; gap:10px;">
                  <span style="font-size:22px; color:#0284c7;"><i class="fa-solid fa-wand-magic-sparkles"></i></span>
                  <div>
                    <div style="font-size:13px; font-weight:700; color:#0f172a;">Tạo đề ngẫu nhiên từ Ngân hàng đề?</div>
                    <div style="font-size:12px; color:#64748b;">Bốc đề theo ma trận số câu, theo Lớp, Chương hoặc Bài học đã chuẩn bị sẵn.</div>
                  </div>
                </div>
                <button type="button" onclick="window.location.hash='#question-bank'" style="padding:6px 14px; font-size:12px; font-weight:600; border-radius:8px; background:#0284c7; color:#ffffff; border:none; cursor:pointer; display:inline-flex; align-items:center; gap:6px; box-shadow:0 2px 6px rgba(2,132,199,0.25);">
                  <i class="fa-solid fa-boxes-stacked"></i> Mở Ngân hàng câu hỏi
                </button>
              </div>

              <!-- General Homework Info Card -->
              <div class="card" style="margin:0; padding:16px;">
                <h3 style="font-family:var(--font-heading); font-size:16px; font-weight:700; margin-bottom:12px; display:flex; align-items:center; gap:8px;">
                  <i class="fa-regular fa-clipboard" style="color:#0066cc;"></i> Thông tin bài tập
                </h3>

                <div style="display:flex; flex-direction:column; gap:12px;">
                  <div>
                    <label style="font-size:12px; font-weight:600; display:block; margin-bottom:4px;">Tên bài tập <span style="color:#ef4444;">*</span></label>
                    <input type="text" id="hw-title" class="form-input" placeholder="Ví dụ: TN - 1, Bài tập 1..." value="${displayTitle}" style="padding:8px 12px; font-size:13px;">
                    <div style="font-size:11px; color:#64748b; margin-top:3px;"><i class="fa-solid fa-circle-info" style="color:#0066cc;"></i> Tiền tố tên bài học sẽ tự động được thêm vào trước tên bài tập khi gửi dữ liệu</div>
                  </div>

                  <div style="display:grid; grid-template-columns:1fr 1fr 1fr; gap:10px;">
                    <div>
                      <label style="font-size:12px; font-weight:600; display:block; margin-bottom:4px;">Chọn lớp học <span style="color:#ef4444;">*</span></label>
                      <select id="hw-class-select" class="form-input" style="background:#ffffff; cursor:pointer; padding:8px 12px; font-size:13px;">
                        ${classOptions}
                      </select>
                    </div>
                    <div>
                      <label style="font-size:12px; font-weight:600; display:block; margin-bottom:4px;">Chọn chương <span style="color:#ef4444;">*</span></label>
                      <select id="hw-chapter-select" class="form-input" style="background:#ffffff; cursor:pointer; padding:8px 12px; font-size:13px;">
                        <option value="">Đang tải chương...</option>
                      </select>
                    </div>
                    <div>
                      <label style="font-size:12px; font-weight:600; display:block; margin-bottom:4px;">Chọn bài học <span style="color:#ef4444;">*</span></label>
                      <select id="hw-lesson-select" class="form-input" style="background:#ffffff; cursor:pointer; padding:8px 12px; font-size:13px;">
                        <option value="">Chọn chương trước...</option>
                      </select>
                    </div>
                  </div>

                  <div style="display:grid; grid-template-columns:1fr 1fr 1fr 1fr; gap:10px;">
                    <div>
                      <label style="font-size:12px; font-weight:600; display:block; margin-bottom:4px;">Loại bài tập <span style="color:#ef4444;">*</span></label>
                      <select id="hw-type" class="form-input" style="background:#ffffff; cursor:pointer; padding:8px 12px; font-size:13px;">
                        <option value="PRACTICE" ${isEdit && hw.type === 'PRACTICE' ? 'selected' : ''}>Luyện tập</option>
                        <option value="EXAM" ${isEdit && hw.type === 'EXAM' ? 'selected' : ''}>Bài thi</option>
                      </select>
                    </div>
                    <div>
                      <label style="font-size:12px; font-weight:600; display:block; margin-bottom:4px;">Thời gian (Phút)</label>
                      <input type="number" id="hw-duration" class="form-input" value="${isEdit ? hw.durationMinutes || 45 : 45}" min="5" style="padding:8px 12px; font-size:13px;">
                    </div>
                    <div>
                      <label style="font-size:12px; font-weight:600; display:block; margin-bottom:4px;">Giới hạn vi phạm</label>
                      <input type="number" id="hw-max-violations" class="form-input" value="${isEdit && hw.maxViolations !== undefined ? hw.maxViolations : 3}" min="1" max="10" style="padding:8px 12px; font-size:13px;">
                    </div>
                    <div>
                      <label style="font-size:12px; font-weight:600; display:block; margin-bottom:4px;">Số lần</label>
                      <input type="number" id="hw-max-attempts" class="form-input" value="${isEdit && hw.maxAttempts !== undefined && hw.maxAttempts !== null ? hw.maxAttempts : (isEdit && hw.max_attempts !== undefined && hw.max_attempts !== null ? hw.max_attempts : 0)}" min="0" style="padding:8px 12px; font-size:13px;">
                    </div>
                  </div>

                  <div style="display:grid; grid-template-columns:1fr 1fr; gap:10px;">
                    <div>
                      <label style="font-size:12px; font-weight:600; display:block; margin-bottom:4px;">Hạn chót nộp bài (Deadline)</label>
                      <input type="datetime-local" id="hw-deadline" class="form-input" value="${deadlineVal}" style="padding:8px 12px; font-size:13px; background:#ffffff;">
                    </div>
                    <div style="display:flex; align-items:flex-end;">
                      <button class="btn-primary" id="save-homework-btn" style="width:100%; padding:9px 12px; font-size:13px; cursor:pointer; height:38px;">
                        <i class="fa-solid fa-cloud-arrow-up"></i> ${isEdit ? 'Cập nhật bài tập' : 'Lưu & Xuất bản'}
                      </button>
                    </div>
                  </div>

                  <div style="background:#f8fafc; border:1px solid #e2e8f0; border-radius:8px; padding:10px 14px; margin-top:2px;">
                    <label style="display:flex; align-items:center; gap:10px; cursor:pointer; margin:0;">
                      <input type="checkbox" id="hw-show-solutions" ${isEdit ? (hw?.showSolutions !== false && hw?.show_solutions !== false ? 'checked' : '') : 'checked'} style="width:18px; height:18px; accent-color:#0066cc; cursor:pointer;">
                      <span style="font-size:13px; font-weight:600; color:#1e293b;"><i class="fa-regular fa-eye" style="color:#0066cc; margin-right:4px;"></i> Hiển thị đáp án & giải thích sau khi nộp</span>
                    </label>
                    <div style="font-size:11px; color:#64748b; margin-left:28px; margin-top:3px;">
                      Nếu chọn thì khi nộp bài sẽ hiển thị đáp án và giải thích, nếu ẩn thì chỉ hiển thị là sai, không có đáp án và giải thích.
                    </div>
                  </div>
                </div>
              </div>

              <!-- Config Section: Select Quantities for 3 Question Types -->
              <div class="card" style="border:2px solid #e0f2fe; background:#fafdfm; margin:0; padding:12px 16px;">
                <h3 style="font-family:var(--font-heading); font-size:14px; font-weight:700; color:#0369a1; margin-bottom:10px; display:flex; align-items:center; gap:8px;">
                  <i class="fa-solid fa-sliders"></i> Cấu hình số lượng câu hỏi
                </h3>
                
                <div style="display:grid; grid-template-columns:1fr 1fr 1fr; gap:8px; margin-bottom:12px;">
                  <div style="background:#ffffff; padding:8px; border:1px solid #e2e8f0; border-radius:8px;">
                    <label style="font-size:11px; font-weight:700; color:#0f172a; display:block; margin-bottom:4px; text-align:center;">
                      T.Nghiệm ABCD
                    </label>
                    <input type="number" id="cfg-mc-count" class="form-input" value="${currentConfig.mcCount}" min="0" max="100" style="font-weight:700; text-align:center; padding:4px; font-size:12px;">
                  </div>

                  <div style="background:#ffffff; padding:8px; border:1px solid #e2e8f0; border-radius:8px;">
                    <label style="font-size:11px; font-weight:700; color:#0f172a; display:block; margin-bottom:4px; text-align:center;">
                      Đúng / Sai
                    </label>
                    <input type="number" id="cfg-tf-count" class="form-input" value="${currentConfig.tfCount}" min="0" max="50" style="font-weight:700; text-align:center; padding:4px; font-size:12px;">
                  </div>

                  <div style="background:#ffffff; padding:8px; border:1px solid #e2e8f0; border-radius:8px;">
                    <label style="font-size:11px; font-weight:700; color:#0f172a; display:block; margin-bottom:4px; text-align:center;">
                      Trả lời ngắn
                    </label>
                    <input type="number" id="cfg-sa-count" class="form-input" value="${currentConfig.saCount}" min="0" max="50" style="font-weight:700; text-align:center; padding:4px; font-size:12px;">
                  </div>
                </div>

                <button class="btn-primary" id="update-config-btn" style="width:100%; padding:8px 12px; font-size:12px; background:#0066cc; cursor:pointer;">
                  <i class="fa-solid fa-arrows-rotate"></i> Cập nhật số lượng câu hỏi
                </button>
              </div>

              <!-- JSON Import/Export Answers Card -->
              <div class="card" style="border:2px solid #cbd5e1; background:#f8fafc; margin:0; padding:12px 16px;">
                <h3 style="font-family:var(--font-heading); font-size:14px; font-weight:700; color:#334155; margin-bottom:10px; display:flex; align-items:center; gap:8px;">
                  <i class="fa-solid fa-file-import"></i> Nhập / Xuất đáp án nhanh
                </h3>
                <div style="display:flex; gap:8px; flex-wrap:wrap;">
                  <button class="btn-secondary" id="copy-sample-btn" type="button" style="flex:1 1 130px; padding:8px 10px; font-size:12px; cursor:pointer; display:flex; align-items:center; justify-content:center; gap:5px; border:1px solid #cbd5e1; background:#ffffff; border-radius:8px; font-weight:600; white-space:nowrap;" title="Sao chép cấu trúc JSON mẫu gồm 12 câu TN, 4 câu Đ/S, 6 câu TLN">
                    <i class="fa-regular fa-file-code"></i> Sao chép JSON mẫu
                  </button>
                  <button class="btn-secondary" id="copy-answers-btn" type="button" style="flex:1 1 130px; padding:8px 10px; font-size:12px; cursor:pointer; display:flex; align-items:center; justify-content:center; gap:5px; border:1px solid #0066cc; background:#eff6ff; color:#0066cc; border-radius:8px; font-weight:600; white-space:nowrap;" title="Sao chép toàn bộ đáp án hiện tại của bảng dưới dạng JSON">
                    <i class="fa-regular fa-copy"></i> Sao chép đáp án JSON
                  </button>
                  <button class="btn-primary" id="import-answers-btn" type="button" style="flex:1 1 130px; padding:8px 10px; font-size:12px; cursor:pointer; display:flex; align-items:center; justify-content:center; gap:5px; background:#059669; border-radius:8px; font-weight:600; white-space:nowrap; width:auto;" title="Nhập danh sách đáp án từ chuỗi JSON">
                    <i class="fa-solid fa-keyboard"></i> Nhập đáp án (JSON)
                  </button>
                </div>
              </div>

              <!-- Answer Key Matrix Section -->
              <div id="answer-matrix-container" style="display:flex; flex-direction:column; gap:16px;">
                ${renderAnswerMatrix()}
              </div>
            </div>

          </div>
        </div>
      </div>
    </div>
  `
}

function renderAnswerMatrix() {
  return `
    <!-- PART 1: Multiple Choice ABCD -->
    <div class="card" style="margin:0; padding:16px;">
      <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:12px; padding-bottom:8px; border-bottom:1px solid #f1f5f9;">
        <h3 style="font-family:var(--font-heading); font-size:15px; font-weight:700; color:#0f172a;">
          <span style="background:#0066cc; color:#ffffff; padding:3px 8px; border-radius:6px; font-size:12px; margin-right:6px;">Phần I</span>
          Trắc nghiệm A/B/C/D (${currentConfig.mcCount} Câu)
        </h3>
      </div>

      ${currentConfig.mcCount === 0 ? `
        <div style="font-size:12px; color:#94a3b8; text-align:center; padding:8px;">Không có câu hỏi Trắc nghiệm ABCD.</div>
      ` : `
        <div style="display:flex; flex-direction:column; gap:8px;">
          ${Array.from({ length: currentConfig.mcCount }, (_, i) => i + 1).map(qNum => {
    const selected = mcAnswers[qNum]
    return `
              <div style="display:flex; align-items:center; justify-content:space-between; padding:8px 12px; background:#f8fafc; border:1px solid #e2e8f0; border-radius:10px;">
                <span style="font-weight:700; font-size:13px; color:#334155; width:54px;">Câu ${qNum}</span>
                <div style="display:flex; gap:6px;">
                  ${['A', 'B', 'C', 'D'].map(opt => `
                    <button type="button" class="mc-option-btn ${selected === opt ? 'active' : ''}" data-qnum="${qNum}" data-option="${opt}" style="
                      width:30px; height:30px; border-radius:6px; border:1px solid ${selected === opt ? '#0066cc' : '#cbd5e1'};
                      background:${selected === opt ? '#0066cc' : '#ffffff'};
                      color:${selected === opt ? '#ffffff' : '#334155'};
                      font-weight:700; font-size:12px; cursor:pointer; transition:all 0.15s ease;
                    ">${opt}</button>
                  `).join('')}
                </div>
              </div>
            `
  }).join('')}
        </div>
      `}
    </div>

    <!-- PART 2: True / False -->
    <div class="card" style="margin:0; padding:16px;">
      <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:12px; padding-bottom:8px; border-bottom:1px solid #f1f5f9;">
        <h3 style="font-family:var(--font-heading); font-size:15px; font-weight:700; color:#0f172a;">
          <span style="background:#0284c7; color:#ffffff; padding:3px 8px; border-radius:6px; font-size:12px; margin-right:6px;">Phần II</span>
          Đúng / Sai (${currentConfig.tfCount} Câu)
        </h3>
      </div>

      ${currentConfig.tfCount === 0 ? `
        <div style="font-size:12px; color:#94a3b8; text-align:center; padding:8px;">Không có câu hỏi Đúng / Sai.</div>
      ` : `
        <div style="display:flex; flex-direction:column; gap:12px;">
          ${Array.from({ length: currentConfig.tfCount }, (_, i) => i + 1).map(index => {
    const actualQNum = currentConfig.mcCount + index
    const tfObj = tfAnswers[index] || {}
    return `
              <div style="background:#f8fafc; border:1px solid #e2e8f0; border-radius:10px; padding:10px;">
                <div style="font-weight:700; font-size:13px; color:#0f172a; margin-bottom:8px;">Câu ${actualQNum}</div>
                <div style="display:grid; grid-template-columns:1fr 1fr; gap:6px;">
                  ${['a', 'b', 'c', 'd'].map(sub => {
      const isTrue = tfObj[sub] === true
      const isFalse = tfObj[sub] === false
      return `
                      <div style="display:flex; align-items:center; justify-content:space-between; background:#ffffff; padding:4px 8px; border-radius:6px; border:1px solid #e2e8f0; font-size:12px;">
                        <span style="font-weight:700; color:#475569;">${sub})</span>
                        <div style="display:flex; gap:4px;">
                          <button type="button" class="tf-option-btn ${isTrue ? 'active-true' : ''}" data-index="${index}" data-sub="${sub}" data-val="true" style="
                            padding:2px 8px; border-radius:4px; font-weight:700; font-size:11px; cursor:pointer;
                            border:1px solid ${isTrue ? '#16a34a' : '#cbd5e1'};
                            background:${isTrue ? '#16a34a' : '#ffffff'};
                            color:${isTrue ? '#ffffff' : '#475569'};
                          ">Đ</button>
                          <button type="button" class="tf-option-btn ${isFalse ? 'active-false' : ''}" data-index="${index}" data-sub="${sub}" data-val="false" style="
                            padding:2px 8px; border-radius:4px; font-weight:700; font-size:11px; cursor:pointer;
                            border:1px solid ${isFalse ? '#dc2626' : '#cbd5e1'};
                            background:${isFalse ? '#dc2626' : '#ffffff'};
                            color:${isFalse ? '#ffffff' : '#475569'};
                          ">S</button>
                        </div>
                      </div>
                    `
    }).join('')}
                </div>
              </div>
            `
  }).join('')}
        </div>
      `}
    </div>

    <!-- PART 3: Short Answer -->
    <div class="card" style="margin:0; padding:16px;">
      <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:12px; padding-bottom:8px; border-bottom:1px solid #f1f5f9;">
        <h3 style="font-family:var(--font-heading); font-size:15px; font-weight:700; color:#0f172a;">
          <span style="background:#059669; color:#ffffff; padding:3px 8px; border-radius:6px; font-size:12px; margin-right:6px;">Phần III</span>
          Trả lời ngắn (${currentConfig.saCount} Câu)
        </h3>
      </div>

      ${currentConfig.saCount === 0 ? `
        <div style="font-size:12px; color:#94a3b8; text-align:center; padding:8px;">Không có câu hỏi Trả lời ngắn.</div>
      ` : `
        <div style="display:flex; flex-direction:column; gap:8px;">
          ${Array.from({ length: currentConfig.saCount }, (_, i) => i + 1).map(index => {
    const actualQNum = currentConfig.mcCount + currentConfig.tfCount + index
    const val = saAnswers[index] || ''
    return `
              <div style="display:flex; align-items:center; justify-content:space-between; padding:8px 12px; background:#f8fafc; border:1px solid #e2e8f0; border-radius:10px;">
                <span style="font-weight:700; font-size:13px; color:#334155; width:54px;">Câu ${actualQNum}</span>
                <input type="text" class="form-input sa-input" data-index="${index}" value="${val}" placeholder="Nhập đáp án chuẩn..." style="padding:6px 10px; font-size:13px; background:#ffffff;">
              </div>
            `
  }).join('')}
        </div>
      `}
    </div>
  `
}

export function bindCreateHwEvents() {
  bindSidebarEvents()

  // PDF Preview pre-load if in Edit Mode
  const isEditMode = !!state.editHomeworkData
  const hwData = state.editHomeworkData
  const downloadBtn = document.getElementById('download-hw-pdf-btn')

  // Pre-seed cache from homework-detail if available to avoid extra network requests
  if (isEditMode && hwData) {
    const hw = hwData.homework
    const editClassId = hw ? (hw.classId || hw.class_id) : null
    const editChapterId = hw ? (hw.chapterId || hw.chapter_id) : null
    if (editClassId && hwData.classChapters && hwData.classChapters.length > 0) {
      chaptersCache[editClassId] = hwData.classChapters
    }
    if (editChapterId && hwData.chapterLessons && hwData.chapterLessons.length > 0) {
      lessonsCache[editChapterId] = hwData.chapterLessons
    }
  }

  // Helper to refresh interactive cards
  const refreshInteractiveCards = () => {
    const previewContainer = document.getElementById('interactive-preview-container')
    if (previewContainer) {
      previewContainer.innerHTML = renderInteractiveCardsHtml()
      bindInteractiveCardEvents()
      renderMath(previewContainer)
    }
  }

  // Synchronize counts and answers with the right column answer matrix
  const syncCountsFromInteractive = () => {
    const mcQ = interactiveQuestions.filter(q => q.questionType === 'MULTIPLE_CHOICE')
    const tfQ = interactiveQuestions.filter(q => q.questionType === 'TRUE_FALSE')
    const saQ = interactiveQuestions.filter(q => q.questionType === 'SHORT_ANSWER')

    currentConfig.mcCount = mcQ.length
    currentConfig.tfCount = tfQ.length
    currentConfig.saCount = saQ.length

    mcAnswers = {}
    mcQ.forEach((q, idx) => {
      mcAnswers[idx + 1] = q.mcAnswer || 'A'
    })

    tfAnswers = {}
    tfQ.forEach((q, idx) => {
      tfAnswers[idx + 1] = q.tfAnswers || { a: true, b: true, c: false, d: true }
    })

    saAnswers = {}
    saQ.forEach((q, idx) => {
      saAnswers[idx + 1] = q.saAnswer !== undefined && q.saAnswer !== null ? String(q.saAnswer) : ''
    })

    const mcInput = document.getElementById('cfg-mc-count')
    const tfInput = document.getElementById('cfg-tf-count')
    const saInput = document.getElementById('cfg-sa-count')
    if (mcInput) mcInput.value = currentConfig.mcCount
    if (tfInput) tfInput.value = currentConfig.tfCount
    if (saInput) saInput.value = currentConfig.saCount

    const matrixContainer = document.getElementById('answer-matrix-container')
    if (matrixContainer) {
      matrixContainer.innerHTML = renderAnswerMatrix()
      bindMatrixEvents()
    }
  }

  // Open dedicated Markdown Editor Modal for a single question
  const openEditSingleQuestionModal = (qIndex) => {
    const q = interactiveQuestions[qIndex]
    if (!q) return

    const qNum = q.questionNumber || (qIndex + 1)
    const typeLabel = q.questionType === 'MULTIPLE_CHOICE'
      ? 'Trắc nghiệm ABCD'
      : (q.questionType === 'TRUE_FALSE' ? 'Đúng / Sai' : 'Trả lời ngắn')
    const initialMd = formatQuestionToMarkdown(q)

    const modalBodyHtml = `
      <div style="display:flex; flex-direction:column; gap:12px;">
        <!-- Guide banner -->
        <div style="background:#f0f9ff; border:1px solid #bae6fd; border-radius:8px; padding:10px 14px; font-size:12px; color:#0369a1; line-height:1.5;">
          <div style="font-weight:700; margin-bottom:4px; display:flex; align-items:center; gap:6px;">
            <i class="fa-solid fa-circle-info"></i> Quy tắc Markdown (${typeLabel}):
          </div>
          <div style="display:flex; flex-direction:column; gap:2px; font-size:11.5px;">
            ${q.questionType === 'MULTIPLE_CHOICE' ? `
              <span>- Đánh dấu <code>*</code> trước phương án đúng (Ví dụ: <code>*B. Tọa độ (-1; 2)</code>).</span>
              <span>- Công thức Toán trong <code>$...$</code> hoặc <code>$$...$$</code>. Hóa học trong <code>$\\ce{...}$</code>.</span>
              <span>- Thêm <code>[Ảnh]</code> nếu có hình minh họa. Nhập <code>[Lời giải]</code> ở cuối nếu có giải thích.</span>
            ` : (q.questionType === 'TRUE_FALSE' ? `
              <span>- Đánh dấu <code>*</code> trước mệnh đề <strong>ĐÚNG</strong> (Ví dụ: <code>*a) Khẳng định 1</code>, <code>b) Khẳng định 2</code>).</span>
              <span>- Công thức Toán trong <code>$...$</code>. Thêm <code>[Ảnh]</code> nếu có hình. <code>[Lời giải]</code> để giải thích chi tiết.</span>
            ` : `
              <span>- Cú pháp: <code>[Đáp án: 2.67]</code>, <code>[Dung sai: 0.05]</code> (tùy chọn).</span>
              <span>- Công thức Toán trong <code>$...$</code>. Thêm <code>[Ảnh]</code> nếu có hình. <code>[Lời giải]</code> để giải thích chi tiết.</span>
            `)}
          </div>
        </div>

        <!-- Quick insert toolbar & Tabs -->
        <div style="display:flex; justify-content:space-between; align-items:center; flex-wrap:wrap; gap:8px;">
          <!-- Quick insert buttons -->
          <div style="display:flex; gap:6px; align-items:center; flex-wrap:wrap;">
            <span style="font-size:11px; font-weight:700; color:#64748b;">Chèn nhanh:</span>
            <button type="button" id="btn-insert-math" class="btn-secondary" style="padding:3px 8px; font-size:11px; border-radius:4px; cursor:pointer;" title="Chèn công thức toán LaTeX">$...$</button>
            <button type="button" id="btn-insert-chem" class="btn-secondary" style="padding:3px 8px; font-size:11px; border-radius:4px; cursor:pointer;" title="Chèn công thức hóa học">\\ce{...}</button>
            <button type="button" id="btn-insert-img-tag" class="btn-secondary" style="padding:3px 8px; font-size:11px; border-radius:4px; cursor:pointer;" title="Chèn thẻ ảnh">[Ảnh]</button>
            <button type="button" id="btn-insert-sol-tag" class="btn-secondary" style="padding:3px 8px; font-size:11px; border-radius:4px; cursor:pointer;" title="Chèn thẻ lời giải">[Lời giải]</button>
            ${q.questionType !== 'SHORT_ANSWER' ? `
              <button type="button" id="btn-insert-star" class="btn-secondary" style="padding:3px 8px; font-size:11px; border-radius:4px; cursor:pointer;" title="Chèn dấu sao đánh dấu đáp án đúng">* (Đúng)</button>
            ` : ''}
          </div>

          <!-- Tab Switch -->
          <div style="display:flex; border:1px solid #cbd5e1; border-radius:6px; overflow:hidden; background:#f1f5f9;">
            <button type="button" id="tab-btn-edit-md" style="padding:4px 12px; font-size:12px; font-weight:600; border:none; background:#0066cc; color:#ffffff; cursor:pointer;">
              <i class="fa-solid fa-code"></i> Soạn thảo
            </button>
            <button type="button" id="tab-btn-preview-md" style="padding:4px 12px; font-size:12px; font-weight:600; border:none; background:transparent; color:#64748b; cursor:pointer;">
              <i class="fa-solid fa-eye"></i> Xem trước
            </button>
          </div>
        </div>

        <!-- Editor Pane -->
        <div id="single-q-edit-pane">
          <textarea id="single-q-md-textarea" style="width:100%; height:260px; font-family:'Fira Code', monospace, sans-serif; font-size:13px; line-height:1.6; padding:12px; border:1px solid #cbd5e1; border-radius:8px; background:#f8fafc; color:#1e293b; resize:vertical; box-sizing:border-box; outline:none;">${escapeHtml(initialMd)}</textarea>
          <div style="font-size:11px; color:#64748b; margin-top:4px; display:flex; justify-content:space-between; flex-wrap:wrap; gap:4px;">
            <span><i class="fa-solid fa-paste"></i> Mẹo: Bấm Ctrl+V trong ô này để dán ảnh chụp màn hình</span>
            <span>Cú pháp chuẩn Bộ GD&ĐT 2025</span>
          </div>
        </div>

        <!-- Preview Pane (Hidden by default) -->
        <div id="single-q-preview-pane" style="display:none; min-height:220px; max-height:360px; overflow-y:auto; border:1px solid #e2e8f0; border-radius:8px; padding:14px; background:#ffffff;">
          <div id="single-q-preview-content"></div>
        </div>
      </div>
    `

    openModal(`Sửa Markdown - Câu ${qNum} (${typeLabel})`, modalBodyHtml, async () => {
      const textarea = document.getElementById('single-q-md-textarea')
      const newText = (textarea?.value || '').trim()
      if (!newText) {
        showToast('Nội dung câu hỏi không được để trống!', 'warning')
        return false
      }

      const parsed = parseExamMarkdown(newText, q.questionType)
      if (!parsed.questions || parsed.questions.length === 0) {
        showToast('Không tìm thấy câu hỏi hợp lệ! Vui lòng giữ đúng định dạng [Câu ...]', 'error')
        return false
      }

      const newQ = parsed.questions[0]
      // Preserve existing image if user didn't supply new one but kept [Ảnh] or old image was attached
      if (newText.includes('[Ảnh]') && !newQ.imageUrl && q.imageUrl) {
        newQ.imageUrl = q.imageUrl
        newQ.hasImagePlaceholder = true
      } else if (!newText.includes('[Ảnh]')) {
        newQ.imageUrl = ''
        newQ.hasImagePlaceholder = false
      }

      // Preserve points
      newQ.points = q.points || newQ.points

      // Update in array
      interactiveQuestions[qIndex] = newQ

      // Sync global markdown
      interactiveMarkdown = formatExamToMarkdown(interactiveQuestions)
      const globalMdTextarea = document.getElementById('hw-markdown-input')
      if (globalMdTextarea) {
        globalMdTextarea.value = interactiveMarkdown
      }

      // Re-render cards and sync counts
      refreshInteractiveCards()
      syncCountsFromInteractive()
      showToast(`Đã cập nhật nội dung Câu ${newQ.questionNumber || qNum} thành công!`, 'success')
      return true
    })

    const modalContainer = document.querySelector('#modal-container .modal-content')
    if (modalContainer) modalContainer.style.maxWidth = '780px'

    // Bind toolbar & preview tabs inside modal
    const textarea = document.getElementById('single-q-md-textarea')
    const editPane = document.getElementById('single-q-edit-pane')
    const previewPane = document.getElementById('single-q-preview-pane')
    const editTabBtn = document.getElementById('tab-btn-edit-md')
    const previewTabBtn = document.getElementById('tab-btn-preview-md')

    const insertAtCursor = (text) => {
      if (!textarea) return
      const start = textarea.selectionStart || 0
      const end = textarea.selectionEnd || 0
      const val = textarea.value
      textarea.value = val.substring(0, start) + text + val.substring(end)
      textarea.focus()
      textarea.selectionStart = textarea.selectionEnd = start + text.length
    }

    document.getElementById('btn-insert-math')?.addEventListener('click', () => insertAtCursor('$x^2$'))
    document.getElementById('btn-insert-chem')?.addEventListener('click', () => insertAtCursor('$\\ce{H2SO4}$'))
    document.getElementById('btn-insert-img-tag')?.addEventListener('click', () => insertAtCursor('\n[Ảnh]\n'))
    document.getElementById('btn-insert-sol-tag')?.addEventListener('click', () => insertAtCursor('\n[Lời giải]\n'))
    document.getElementById('btn-insert-star')?.addEventListener('click', () => insertAtCursor('*'))

    // Paste listener for image inside modal textarea
    textarea?.addEventListener('paste', async (e) => {
      const items = (e.clipboardData || window.clipboardData)?.items
      if (!items) return
      for (let i = 0; i < items.length; i++) {
        if (items[i].type.indexOf('image') !== -1) {
          e.preventDefault()
          const blob = items[i].getAsFile()
          try {
            showToast('Đang xử lý ảnh dán...', 'info')
            const dataUrl = await compressImage(blob)
            q.imageUrl = dataUrl
            q.hasImagePlaceholder = true
            if (!textarea.value.includes('[Ảnh]')) {
              insertAtCursor('\n[Ảnh]\n')
            }
            showToast('Đã dán ảnh vào câu hỏi!', 'success')
          } catch (err) {
            showToast(`Lỗi dán ảnh: ${err.message}`, 'error')
          }
          break
        }
      }
    })

    const updatePreview = () => {
      const content = textarea?.value || ''
      const parsed = parseExamMarkdown(content, q.questionType)
      const previewSlot = document.getElementById('single-q-preview-content')
      if (!previewSlot) return
      if (parsed.questions && parsed.questions.length > 0) {
        const pQ = parsed.questions[0]
        if (q.imageUrl && !pQ.imageUrl && content.includes('[Ảnh]')) {
          pQ.imageUrl = q.imageUrl
        }
        previewSlot.innerHTML = `
          <div style="font-weight:700; font-size:14px; margin-bottom:8px; color:#0f172a;">Câu ${pQ.questionNumber || qNum}</div>
          <div class="interactive-q-prompt" style="font-size:14px; margin-bottom:10px;">${escapeHtml(pQ.promptText || '')}</div>
          ${pQ.imageUrl ? `<img src="${pQ.imageUrl}" style="max-width:100%; max-height:220px; object-fit:contain; border-radius:6px; margin:8px 0; display:block;" />` : ''}
          ${pQ.questionType === 'MULTIPLE_CHOICE' ? `
            <div class="exam-options-grid" style="display:grid; grid-template-columns:1fr 1fr; gap:6px; margin-bottom:8px;">
              ${(pQ.options || []).map(o => `
                <div style="padding:6px 10px; border-radius:6px; font-size:12.5px; border:1px solid ${pQ.mcAnswer === o.id ? '#16a34a' : '#cbd5e1'}; background:${pQ.mcAnswer === o.id ? '#f0fdf4' : '#ffffff'}; font-weight:${pQ.mcAnswer === o.id ? '700' : 'normal'}; color:${pQ.mcAnswer === o.id ? '#15803d' : '#334155'};">
                  <strong>${o.id}.</strong> ${escapeHtml(o.text || '')}
                </div>
              `).join('')}
            </div>
          ` : (pQ.questionType === 'TRUE_FALSE' ? `
            <div style="display:flex; flex-direction:column; gap:4px; margin-bottom:8px;">
              ${(pQ.options || []).map(s => `
                <div style="padding:4px 8px; border-radius:6px; font-size:12px; background:#f8fafc; border:1px solid #e2e8f0; display:flex; justify-content:space-between; align-items:center;">
                  <span><strong>${s.id})</strong> ${escapeHtml(s.text || '')}</span>
                  <span class="badge" style="background:${pQ.tfAnswers?.[s.id] ? '#16a34a' : '#dc2626'}; color:#fff; font-size:10.5px; padding:1px 6px;">${pQ.tfAnswers?.[s.id] ? 'ĐÚNG' : 'SAI'}</span>
                </div>
              `).join('')}
            </div>
          ` : `
            <div style="font-size:12.5px; font-weight:600; color:#15803d; background:#dcfce7; padding:6px 10px; border-radius:6px; margin-bottom:8px;">
              Đáp án: <code>${escapeHtml(pQ.saAnswer || 'Chưa nhập')}</code> ${pQ.saTolerance ? `(&plusmn; ${pQ.saTolerance})` : ''}
            </div>
          `)}
          ${pQ.explanation ? `
            <div style="margin-top:8px; padding:6px 10px; background:#f1f5f9; border-left:3px solid #0284c7; font-size:12px; color:#334155;">
              <strong>Lời giải:</strong> ${escapeHtml(pQ.explanation)}
            </div>
          ` : ''}
        `
        renderMath(previewSlot)
      } else {
        previewSlot.innerHTML = '<div style="color:#ef4444; font-size:12px;">Cú pháp Markdown chưa hợp lệ!</div>'
      }
    }

    editTabBtn?.addEventListener('click', () => {
      editTabBtn.style.background = '#0066cc'
      editTabBtn.style.color = '#ffffff'
      previewTabBtn.style.background = 'transparent'
      previewTabBtn.style.color = '#64748b'
      editPane.style.display = 'block'
      previewPane.style.display = 'none'
    })

    previewTabBtn?.addEventListener('click', () => {
      previewTabBtn.style.background = '#0066cc'
      previewTabBtn.style.color = '#ffffff'
      editTabBtn.style.background = 'transparent'
      editTabBtn.style.color = '#64748b'
      editPane.style.display = 'none'
      previewPane.style.display = 'block'
      updatePreview()
    })
  }

  // Bind events for preview question cards (option click, image paste, upload, drop, edit MD)
  const bindInteractiveCardEvents = () => {
    const previewContainer = document.getElementById('interactive-preview-container')
    if (!previewContainer) return

    // Render KaTeX Math & Chem
    renderMath(previewContainer)

    // Edit MD button click
    previewContainer.querySelectorAll('.btn-edit-q-md').forEach(btn => {
      btn.addEventListener('click', (e) => {
        e.stopPropagation()
        const qIndex = parseInt(btn.getAttribute('data-qindex'), 10)
        openEditSingleQuestionModal(qIndex)
      })
    })

    // Option cards click in preview (changes the correct answer)
    previewContainer.querySelectorAll('.exam-option-card').forEach(card => {
      card.addEventListener('click', () => {
        const qIndex = parseInt(card.getAttribute('data-qindex'), 10)
        const optId = card.getAttribute('data-optid')
        const q = interactiveQuestions[qIndex]
        if (q && q.questionType === 'MULTIPLE_CHOICE') {
          q.mcAnswer = optId
          interactiveMarkdown = formatExamToMarkdown(interactiveQuestions)
          const mdInput = document.getElementById('hw-markdown-input')
          if (mdInput) mdInput.value = interactiveMarkdown
          refreshInteractiveCards()
          syncCountsFromInteractive()
        }
      })
    })

    // TF statement rows toggle
    previewContainer.querySelectorAll('.tf-statement-row').forEach(row => {
      row.addEventListener('click', () => {
        const qIndex = parseInt(row.getAttribute('data-qindex'), 10)
        const strong = row.querySelector('strong')
        const subId = row.getAttribute('data-subid') || strong?.textContent?.replace(/[\)\.\:]/g, '').trim().toLowerCase()
        const q = interactiveQuestions[qIndex]
        if (q && q.questionType === 'TRUE_FALSE' && subId) {
          if (!q.tfAnswers) q.tfAnswers = {}
          q.tfAnswers[subId] = !q.tfAnswers[subId]
          interactiveMarkdown = formatExamToMarkdown(interactiveQuestions)
          const mdInput = document.getElementById('hw-markdown-input')
          if (mdInput) mdInput.value = interactiveMarkdown
          refreshInteractiveCards()
          syncCountsFromInteractive()
        }
      })
    })

    // Preset button clicks
    previewContainer.querySelectorAll('.btn-apply-preset').forEach(btn => {
      btn.addEventListener('click', (e) => {
        e.stopPropagation()
        const presetKey = btn.getAttribute('data-preset')
        applyExamPreset(interactiveQuestions, presetKey)
        refreshInteractiveCards()
        showToast(`Đã áp dụng mẫu phân bổ điểm: ${btn.textContent.trim()}`, 'success')
      })
    })

    // Points input change & real-time badge update
    previewContainer.querySelectorAll('.q-points-input').forEach(input => {
      const updatePoints = (val) => {
        const qIndex = parseInt(input.getAttribute('data-qindex'), 10)
        const q = interactiveQuestions[qIndex]
        if (q) {
          q.points = Math.max(0, parseFloat(val) || 0)
          const rawMax = calculateExamRawMax(interactiveQuestions)
          const badge = document.getElementById('raw-max-points-badge')
          if (badge) {
            const isStandard10 = Math.abs(rawMax - 10.0) < 1e-4
            badge.style.background = isStandard10 ? '#dcfce7' : '#eff6ff'
            badge.style.color = isStandard10 ? '#16a34a' : '#0284c7'
            badge.style.borderColor = isStandard10 ? '#bbf7d0' : '#bfdbfe'
            badge.innerHTML = `<i class="fa-solid ${isStandard10 ? 'fa-circle-check' : 'fa-calculator'}"></i> Tổng điểm thô: <strong>${rawMax}đ</strong> ${isStandard10 ? '(Chuẩn 10.0đ)' : '→ Tự động quy đổi thang 10'}`
          }
        }
      }

      input.addEventListener('input', (e) => {
        updatePoints(e.target.value)
      })

      input.addEventListener('change', (e) => {
        updatePoints(e.target.value)
      })
    })

    // Remove image button
    previewContainer.querySelectorAll('.btn-remove-q-image').forEach(btn => {
      btn.addEventListener('click', (e) => {
        e.stopPropagation()
        const qIndex = parseInt(btn.getAttribute('data-qindex'), 10)
        const q = interactiveQuestions[qIndex]
        if (q) {
          q.imageUrl = ''
          q.hasImagePlaceholder = false
          interactiveMarkdown = formatExamToMarkdown(interactiveQuestions)
          const mdInput = document.getElementById('hw-markdown-input')
          if (mdInput) mdInput.value = interactiveMarkdown
          refreshInteractiveCards()
          showToast(`Đã xóa ảnh của Câu ${q.questionNumber || (qIndex + 1)}`, 'info')
        }
      })
    })

    // File input changes
    previewContainer.querySelectorAll('.q-image-file-input').forEach(input => {
      input.addEventListener('change', async (e) => {
        const file = e.target.files?.[0]
        if (!file) return
        const qIndex = parseInt(input.getAttribute('data-qindex'), 10)
        const q = interactiveQuestions[qIndex]
        if (!q) return
        try {
          showToast(`Đang nén ảnh cho Câu ${q.questionNumber || (qIndex + 1)}...`, 'info')
          const dataUrl = await compressImage(file)
          q.imageUrl = dataUrl
          q.hasImagePlaceholder = true
          interactiveMarkdown = formatExamToMarkdown(interactiveQuestions)
          const mdInput = document.getElementById('hw-markdown-input')
          if (mdInput) mdInput.value = interactiveMarkdown
          refreshInteractiveCards()
          showToast(`Đã chèn ảnh cho Câu ${q.questionNumber || (qIndex + 1)} thành công!`, 'success')
        } catch (err) {
          showToast(`Lỗi: ${err.message}`, 'error')
        }
      })
    })

    // Image paste zones (Click to browse, drag & drop)
    previewContainer.querySelectorAll('.image-paste-zone').forEach(zone => {
      const qIndex = parseInt(zone.getAttribute('data-qindex'), 10)

      zone.addEventListener('click', (e) => {
        if (e.target.closest('.btn-remove-q-image')) return
        const fileInput = zone.querySelector('.q-image-file-input')
        if (fileInput) fileInput.click()
      })

      zone.addEventListener('dragover', (e) => {
        e.preventDefault()
        zone.style.borderColor = '#0066cc'
        zone.style.background = '#eff6ff'
      })
      zone.addEventListener('dragleave', () => {
        zone.style.borderColor = '#cbd5e1'
        zone.style.background = '#f8fafc'
      })
      zone.addEventListener('drop', async (e) => {
        e.preventDefault()
        zone.style.borderColor = '#cbd5e1'
        zone.style.background = '#f8fafc'
        const file = e.dataTransfer?.files?.[0]
        if (file && file.type.startsWith('image/')) {
          const q = interactiveQuestions[qIndex]
          if (!q) return
          try {
            showToast(`Đang nén ảnh cho Câu ${q.questionNumber || (qIndex + 1)}...`, 'info')
            const dataUrl = await compressImage(file)
            q.imageUrl = dataUrl
            q.hasImagePlaceholder = true
            interactiveMarkdown = formatExamToMarkdown(interactiveQuestions)
            const mdInput = document.getElementById('hw-markdown-input')
            if (mdInput) mdInput.value = interactiveMarkdown
            refreshInteractiveCards()
            showToast(`Đã đính kèm ảnh cho Câu ${q.questionNumber || (qIndex + 1)}!`, 'success')
          } catch (err) {
            showToast(`Lỗi: ${err.message}`, 'error')
          }
        }
      })
    })

    // Paste listener (Ctrl + V) on question cards
    previewContainer.querySelectorAll('.interactive-q-card').forEach(card => {
      card.addEventListener('paste', async (e) => {
        const items = (e.clipboardData || window.clipboardData)?.items
        if (!items) return
        for (let i = 0; i < items.length; i++) {
          if (items[i].type.indexOf('image') !== -1) {
            e.preventDefault()
            e.stopPropagation()
            const blob = items[i].getAsFile()
            const qIndex = parseInt(card.getAttribute('data-qindex'), 10)
            const q = interactiveQuestions[qIndex]
            if (!q) return
            try {
              showToast(`Đang dán ảnh chụp màn hình cho Câu ${q.questionNumber || (qIndex + 1)}...`, 'info')
              const dataUrl = await compressImage(blob)
              q.imageUrl = dataUrl
              q.hasImagePlaceholder = true
              interactiveMarkdown = formatExamToMarkdown(interactiveQuestions)
              const mdInput = document.getElementById('hw-markdown-input')
              if (mdInput) mdInput.value = interactiveMarkdown
              refreshInteractiveCards()
              showToast(`Đã dán ảnh cho Câu ${q.questionNumber || (qIndex + 1)} thành công!`, 'success')
            } catch (err) {
              showToast(`Lỗi: ${err.message}`, 'error')
            }
            break
          }
        }
      })
    })
  }

  // Update Left Pane on tab switch
  const updateLeftPane = () => {
    const leftPane = document.getElementById('create-hw-left-pane')
    if (leftPane) {
      leftPane.innerHTML = renderLeftColumn(hwData?.homework, isEditMode, downloadBtn?.getAttribute('href'), downloadBtn?.getAttribute('download'))
      bindInteractiveToolbarEvents()
      if (currentMode === 'INTERACTIVE') {
        bindInteractiveCardEvents()
        bindInteractivePdfEvents()
        syncCountsFromInteractive()
      } else {
        initPdfListeners()
      }
    }
  }

  // Toolbar events (Mẫu Toán, Mẫu Hóa, Phân tích)
  const bindInteractiveToolbarEvents = () => {
    document.getElementById('btn-mode-interactive')?.addEventListener('click', () => {
      currentMode = 'INTERACTIVE'
      updateLeftPane()
    })
    document.getElementById('btn-mode-pdf')?.addEventListener('click', () => {
      currentMode = 'PDF'
      updateLeftPane()
    })

    // Math template
    document.getElementById('btn-load-math-tpl')?.addEventListener('click', () => {
      const textarea = document.getElementById('hw-markdown-input')
      if (textarea) textarea.value = MATH_TEMPLATE
      interactiveMarkdown = MATH_TEMPLATE
      const parsed = parseExamMarkdown(MATH_TEMPLATE)
      interactiveQuestions = parsed.questions || []
      refreshInteractiveCards()
      syncCountsFromInteractive()
      showToast('Đã nạp đề mẫu môn Toán (Chuẩn BGD)!', 'success')
    })

    // Chem template
    document.getElementById('btn-load-chem-tpl')?.addEventListener('click', () => {
      const textarea = document.getElementById('hw-markdown-input')
      if (textarea) textarea.value = CHEM_TEMPLATE
      interactiveMarkdown = CHEM_TEMPLATE
      const parsed = parseExamMarkdown(CHEM_TEMPLATE)
      interactiveQuestions = parsed.questions || []
      refreshInteractiveCards()
      syncCountsFromInteractive()
      showToast('Đã nạp đề mẫu môn Hóa học (Chuẩn BGD)!', 'success')
    })

    // Parse button
    document.getElementById('btn-parse-markdown')?.addEventListener('click', () => {
      const textarea = document.getElementById('hw-markdown-input')
      const text = textarea?.value || ''
      interactiveMarkdown = text
      const parsed = parseExamMarkdown(text)
      if (parsed.questions && parsed.questions.length > 0) {
        // Preserve any existing attached images if questions match by index or type+number
        parsed.questions.forEach((newQ, idx) => {
          let oldQ = interactiveQuestions[idx]
          if (!oldQ || oldQ.questionType !== newQ.questionType || oldQ.questionNumber !== newQ.questionNumber) {
            oldQ = interactiveQuestions.find(x => x.questionType === newQ.questionType && x.questionNumber === newQ.questionNumber)
          }
          if (oldQ && oldQ.imageUrl) {
            newQ.imageUrl = oldQ.imageUrl
            newQ.hasImagePlaceholder = true
          }
        })
        interactiveQuestions = parsed.questions
        refreshInteractiveCards()
        syncCountsFromInteractive()
        showToast(`Đã phân tích thành công ${parsed.questions.length} câu hỏi!`, 'success')
      } else {
        showToast('Không tìm thấy câu hỏi hợp lệ trong văn bản!', 'error')
      }
    })
  }

  // Initial binding for interactive mode
  bindInteractiveToolbarEvents()
  if (currentMode === 'INTERACTIVE') {
    bindInteractiveCardEvents()
    bindInteractivePdfEvents()
    syncCountsFromInteractive()
  }

  const initPdfListeners = () => {
    if (isEditMode && hwData?.homework?.pdfUrl) {
      const container = document.getElementById('pdf-preview-container')
      const titleSpan = document.getElementById('pdf-viewer-title')
      const dBtn = document.getElementById('download-hw-pdf-btn')

      if (container) {
        const mappedUrl = hwData.homework.pdfUrl.replace(/https?:\/\/kong:8000/g, import.meta.env.VITE_SUPABASE_URL || 'http://localhost:54321')
        renderPdfViewer(container, mappedUrl)
        const fileName = hwData.homework.pdfPath || 'Homework_Attachment.pdf'
        if (titleSpan) titleSpan.textContent = fileName
        if (dBtn) {
          dBtn.href = mappedUrl
          dBtn.download = fileName
          dBtn.style.background = '#eff6ff'
          dBtn.style.color = '#0066cc'
          dBtn.style.borderColor = '#bfdbfe'
          dBtn.style.cursor = 'pointer'
          dBtn.style.opacity = '1'
          dBtn.title = `Tải file PDF: ${fileName}`
        }
      }
    }

    // PDF Preview file change listener
    const fInput = document.getElementById('hw-pdf-file')
    fInput?.addEventListener('change', (e) => {
      const file = e.target.files[0]
      const container = document.getElementById('pdf-preview-container')
      const titleSpan = document.getElementById('pdf-viewer-title')
      const dBtn = document.getElementById('download-hw-pdf-btn')

      if (file && file.type === 'application/pdf') {
        const fileURL = URL.createObjectURL(file)
        if (container) {
          renderPdfViewer(container, fileURL)
        }
        if (titleSpan) titleSpan.textContent = file.name
        if (dBtn) {
          dBtn.href = fileURL
          dBtn.download = file.name
          dBtn.style.background = '#eff6ff'
          dBtn.style.color = '#0066cc'
          dBtn.style.borderColor = '#bfdbfe'
          dBtn.style.cursor = 'pointer'
          dBtn.style.opacity = '1'
          dBtn.title = `Tải file PDF: ${file.name}`
        }
      }
    })
  }

  initPdfListeners()

  // Download PDF button click listener
  downloadBtn?.addEventListener('click', async (e) => {
    const href = downloadBtn.getAttribute('href')
    if (!href || href === '#' || downloadBtn.style.cursor === 'not-allowed') {
      e.preventDefault()
      showToast('Chưa có file PDF nào để tải xuống!', 'warning')
      return
    }
    if (href.startsWith('blob:')) {
      return
    }
    e.preventDefault()
    try {
      showToast('Đang tải file PDF...', 'info')
      const res = await fetch(href)
      if (!res.ok) throw new Error(`HTTP ${res.status}`)
      const blob = await res.blob()
      const blobUrl = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = blobUrl
      a.download = downloadBtn.getAttribute('download') || 'De_Bai.pdf'
      document.body.appendChild(a)
      a.click()
      document.body.removeChild(a)
      setTimeout(() => URL.revokeObjectURL(blobUrl), 2000)
    } catch (err) {
      console.warn('Direct blob download failed, falling back to window.open:', err)
      window.open(href, '_blank')
    }
  })

  // Dynamic class -> chapter -> lesson dropdown loader
  const classSelect = document.getElementById('hw-class-select')
  const chapterSelect = document.getElementById('hw-chapter-select')
  const lessonSelect = document.getElementById('hw-lesson-select')
  const typeSelect = document.getElementById('hw-type')
  const maxAttemptsInput = document.getElementById('hw-max-attempts')

  let previousLessonTitle = ''

  const getSelectedLessonTitle = () => {
    if (!lessonSelect || lessonSelect.selectedIndex < 0) return ''
    const opt = lessonSelect.options[lessonSelect.selectedIndex]
    if (!opt || !opt.value) return ''
    return opt.textContent.trim()
  }

  const applyLessonPrefixToTitle = (newLessonTitle) => {
    const titleInput = document.getElementById('hw-title')
    if (!titleInput || !newLessonTitle) return
    const currentVal = titleInput.value.trim()

    // If input is empty
    if (!currentVal) {
      titleInput.value = `${newLessonTitle} - `
      previousLessonTitle = newLessonTitle
      return
    }

    // If title currently starts with previousLessonTitle, replace old prefix with new prefix
    if (previousLessonTitle && currentVal.startsWith(previousLessonTitle)) {
      const suffix = currentVal.substring(previousLessonTitle.length).replace(/^[\s\-–—:]+/, '').trim()
      titleInput.value = suffix ? `${newLessonTitle} - ${suffix}` : `${newLessonTitle} - `
      previousLessonTitle = newLessonTitle
      return
    }

    // If title already starts with newLessonTitle, don't duplicate
    if (currentVal.startsWith(newLessonTitle)) {
      previousLessonTitle = newLessonTitle
      return
    }

    // If title already has some custom name, prepend newLessonTitle
    titleInput.value = `${newLessonTitle} - ${currentVal}`
    previousLessonTitle = newLessonTitle
  }

  // Disable max attempts if Exam
  const maxViolationsInput = document.getElementById('hw-max-violations')
  if (typeSelect && maxAttemptsInput) {
    const handleTypeChange = () => {
      if (typeSelect.value === 'EXAM') {
        maxAttemptsInput.value = 1;
        maxAttemptsInput.disabled = true;
        maxAttemptsInput.style.backgroundColor = '#f1f5f9';

        if (maxViolationsInput) {
          maxViolationsInput.disabled = false;
          maxViolationsInput.style.backgroundColor = '#ffffff';
        }
      } else {
        maxAttemptsInput.disabled = false;
        maxAttemptsInput.style.backgroundColor = '#ffffff';

        if (maxViolationsInput) {
          maxViolationsInput.disabled = true;
          maxViolationsInput.style.backgroundColor = '#f1f5f9';
        }
      }
    };
    typeSelect.addEventListener('change', handleTypeChange);
    // Init state
    handleTypeChange();
  }

  const updateChaptersDropdown = async (targetChapterId = null, targetLessonId = null) => {
    const classId = classSelect?.value
    if (!classId) return

    if (chapterSelect) {
      chapterSelect.innerHTML = '<option value="">Đang tải chương...</option>'
    }
    if (lessonSelect) {
      lessonSelect.innerHTML = '<option value="">Chọn chương trước...</option>'
    }

    try {
      let chapters = chaptersCache[classId]
      if (!chapters) {
        chapters = await api.getChapters(classId)
        chaptersCache[classId] = chapters || []
      }
      let chOptions = '<option value="">-- Chọn chương --</option>'

      const isEdit = !!state.editHomeworkData
      const hw = isEdit ? state.editHomeworkData.homework : null
      const editChapterId = targetChapterId || (hw ? (hw.chapterId || hw.chapter_id) : null)
      const editLessonId = targetLessonId || (hw ? (hw.lessonId || hw.lesson_id) : null)

      let selectedChId = ''
      for (const ch of (chapters || [])) {
        const isSel = editChapterId === ch.id
        if (isSel) selectedChId = ch.id
        chOptions += `<option value="${ch.id}" ${isSel ? 'selected' : ''}>${ch.title}</option>`
      }

      if (chapterSelect) {
        chapterSelect.innerHTML = chOptions
      }

      // If we have a pre-selected chapter
      if (selectedChId) {
        await updateLessonsDropdown(selectedChId, editLessonId)
      } else if (!isEdit && chapters && chapters.length === 1) {
        chapterSelect.value = chapters[0].id
        await updateLessonsDropdown(chapters[0].id, null)
      }
    } catch (e) {
      if (chapterSelect) {
        chapterSelect.innerHTML = '<option value="">Lỗi khi tải chương</option>'
      }
    }
  }

  const updateLessonsDropdown = async (chapterId, targetLessonId = null) => {
    if (!chapterId) {
      if (lessonSelect) {
        lessonSelect.innerHTML = '<option value="">Chọn chương trước...</option>'
      }
      return
    }

    if (lessonSelect) {
      lessonSelect.innerHTML = '<option value="">Đang tải bài học...</option>'
    }

    try {
      let lessons = lessonsCache[chapterId]
      if (!lessons) {
        lessons = await api.getLessons(chapterId)
        lessonsCache[chapterId] = lessons || []
      }
      let lOptions = '<option value="">-- Chọn bài học --</option>'

      const isEdit = !!state.editHomeworkData
      const hw = isEdit ? state.editHomeworkData.homework : null
      const editLessonId = targetLessonId || (hw ? (hw.lessonId || hw.lesson_id) : null)

      for (const l of (lessons || [])) {
        const isSel = editLessonId === l.id ? 'selected' : ''
        lOptions += `<option value="${l.id}" ${isSel}>${l.title}</option>`
      }

      if (lessonSelect) {
        lessonSelect.innerHTML = lOptions || '<option value="">Chưa có bài học nào</option>'
        if (!isEdit && lessons && lessons.length === 1) {
          lessonSelect.value = lessons[0].id
          applyLessonPrefixToTitle(lessons[0].title)
        } else if (isEdit && editLessonId) {
          const currentOpt = lessonSelect.options[lessonSelect.selectedIndex]
          if (currentOpt && currentOpt.value) {
            previousLessonTitle = currentOpt.textContent.trim()
          }
        }
      }
    } catch (e) {
      if (lessonSelect) {
        lessonSelect.innerHTML = '<option value="">Lỗi khi tải bài học</option>'
      }
    }
  }

  classSelect?.addEventListener('change', () => {
    updateChaptersDropdown()
  })

  chapterSelect?.addEventListener('change', (e) => {
    updateLessonsDropdown(e.target.value)
  })

  // Trigger initial dropdown load
  const isEdit = !!state.editHomeworkData
  const hw = isEdit ? state.editHomeworkData.homework : null

  const initDropdowns = async () => {
    let initialChapterId = hw ? (hw.chapterId || hw.chapter_id) : null
    let initialLessonId = hw ? (hw.lessonId || hw.lesson_id) : null
    let initialClassId = hw ? (hw.classId || hw.class_id) : null

    if (initialClassId && classSelect) {
      classSelect.value = initialClassId
    }
    await updateChaptersDropdown(initialChapterId, initialLessonId)

    if (isEdit && hw) {
      previousLessonTitle = hw.lessonTitle || getSelectedLessonTitle()
    }
  }

  initDropdowns()

  // Handler for updating question counts config
  const updateConfig = () => {
    const mcVal = parseInt(document.getElementById('cfg-mc-count')?.value || '0', 10)
    const tfVal = parseInt(document.getElementById('cfg-tf-count')?.value || '0', 10)
    const saVal = parseInt(document.getElementById('cfg-sa-count')?.value || '0', 10)

    currentConfig.mcCount = Math.max(0, mcVal)
    currentConfig.tfCount = Math.max(0, tfVal)
    currentConfig.saCount = Math.max(0, saVal)

    // Re-init state for new question indices if needed
    for (let i = 1; i <= currentConfig.mcCount; i++) {
      if (!mcAnswers[i]) mcAnswers[i] = 'A'
    }
    for (let i = 1; i <= currentConfig.tfCount; i++) {
      if (!tfAnswers[i]) tfAnswers[i] = { a: true, b: true, c: false, d: true }
    }
    for (let i = 1; i <= currentConfig.saCount; i++) {
      if (saAnswers[i] === undefined) saAnswers[i] = ''
    }

    const container = document.getElementById('answer-matrix-container')
    if (container) {
      container.innerHTML = renderAnswerMatrix()
      bindMatrixEvents()
    }
  }

  document.getElementById('update-config-btn')?.addEventListener('click', () => {
    updateConfig()
    showToast('Đã cập nhật số lượng câu hỏi và bảng đáp án!', 'info')
  })

  // Universal clipboard copy helper
  const copyTextToClipboard = async (text) => {
    if (navigator.clipboard && window.isSecureContext) {
      try {
        await navigator.clipboard.writeText(text)
        return true
      } catch (e) {
        // fallback below
      }
    }
    const textArea = document.createElement('textarea')
    textArea.value = text
    textArea.style.position = 'fixed'
    textArea.style.left = '-999999px'
    textArea.style.top = '-999999px'
    document.body.appendChild(textArea)
    textArea.focus()
    textArea.select()
    try {
      const successful = document.execCommand('copy')
      document.body.removeChild(textArea)
      return successful
    } catch (err) {
      document.body.removeChild(textArea)
      return false
    }
  }

  // Handle Copy Sample JSON
  document.getElementById('copy-sample-btn')?.addEventListener('click', async () => {
    const sampleQuestions = [];

    // Part I: MC (12 questions)
    for (let i = 1; i <= 12; i++) {
      sampleQuestions.push({
        questionNumber: i,
        questionType: "MULTIPLE_CHOICE",
        mcAnswer: i % 4 === 1 ? "A" : i % 4 === 2 ? "B" : i % 4 === 3 ? "C" : "D"
      });
    }

    // Part II: TF (4 questions)
    for (let i = 1; i <= 4; i++) {
      sampleQuestions.push({
        questionNumber: 12 + i,
        questionType: "TRUE_FALSE",
        tfAnswers: {
          a: i % 2 === 1,
          b: i % 2 === 0,
          c: i % 3 === 1,
          d: i % 3 !== 1
        }
      });
    }

    // Part III: SA (6 questions)
    const saSamples = ["10.5", "42", "Hà Nội", "3.14", "2026", "Bài tập"];
    for (let i = 1; i <= 6; i++) {
      sampleQuestions.push({
        questionNumber: 16 + i,
        questionType: "SHORT_ANSWER",
        saAnswer: saSamples[i - 1]
      });
    }

    const jsonStr = JSON.stringify(sampleQuestions, null, 2);
    const success = await copyTextToClipboard(jsonStr);
    if (success) {
      showToast("Đã sao chép JSON mẫu vào bộ nhớ tạm!", "success");
    } else {
      showToast("Không thể tự động sao chép vào bộ nhớ tạm!", "error");
    }
  });

  // Handle Copy Current Answers JSON
  document.getElementById('copy-answers-btn')?.addEventListener('click', async () => {
    const totalQuestions = currentConfig.mcCount + currentConfig.tfCount + currentConfig.saCount;
    if (totalQuestions === 0) {
      showToast('Chưa có câu hỏi nào để sao chép đáp án!', 'warning');
      return;
    }

    const currentQuestions = [];
    let globalIndex = 1;

    // Part I: MC
    for (let i = 1; i <= currentConfig.mcCount; i++) {
      currentQuestions.push({
        questionNumber: globalIndex++,
        questionType: 'MULTIPLE_CHOICE',
        mcAnswer: mcAnswers[i] || 'A'
      });
    }

    // Part II: TF
    for (let i = 1; i <= currentConfig.tfCount; i++) {
      const tf = tfAnswers[i] || {};
      currentQuestions.push({
        questionNumber: globalIndex++,
        questionType: 'TRUE_FALSE',
        tfAnswers: {
          a: tf.a !== undefined ? tf.a : true,
          b: tf.b !== undefined ? tf.b : true,
          c: tf.c !== undefined ? tf.c : false,
          d: tf.d !== undefined ? tf.d : true
        }
      });
    }

    // Part III: SA
    for (let i = 1; i <= currentConfig.saCount; i++) {
      const ans = saAnswers[i] !== undefined && saAnswers[i] !== null ? String(saAnswers[i]) : '';
      currentQuestions.push({
        questionNumber: globalIndex++,
        questionType: 'SHORT_ANSWER',
        saAnswer: ans
      });
    }

    const jsonStr = JSON.stringify(currentQuestions, null, 2);
    const success = await copyTextToClipboard(jsonStr);
    if (success) {
      showToast(`Đã sao chép đáp án JSON (${currentQuestions.length} câu) vào bộ nhớ tạm!`, 'success');
    } else {
      showToast('Không thể tự động sao chép vào bộ nhớ tạm!', 'error');
    }
  });

  // Handle Import JSON Text Dialog
  document.getElementById('import-answers-btn')?.addEventListener('click', () => {
    const bodyHTML = `
      <div style="display:flex; flex-direction:column; gap:10px;">
        <div style="font-size:12px; color:#64748b; line-height:1.4;">
          Dán chuỗi JSON danh sách đáp án của bạn vào khung bên dưới. Định dạng dữ liệu phải khớp với cấu trúc mẫu (mảng gồm các câu hỏi liên tục bắt đầu từ câu 1).
        </div>
        <textarea id="import-json-textarea" class="form-input" placeholder="[\n  {\n    &quot;questionNumber&quot;: 1,\n    &quot;questionType&quot;: &quot;MULTIPLE_CHOICE&quot;,\n    &quot;mcAnswer&quot;: &quot;A&quot;\n  }\n]" style="width:100%; height:250px; font-family:monospace; font-size:12px; padding:10px; line-height:1.5; resize:vertical; background:#f8fafc; border:1px solid #cbd5e1; border-radius:6px;"></textarea>
        <div id="modal-error-msg" style="color:#ef4444; font-size:12px; display:none; font-weight:600;"></div>
      </div>
    `;

    openModal("Nhập đáp án JSON", bodyHTML, () => {
      const textarea = document.getElementById('import-json-textarea');
      const errorMsgDiv = document.getElementById('modal-error-msg');
      if (!textarea) return false;

      const text = textarea.value.trim();
      if (!text) {
        if (errorMsgDiv) {
          errorMsgDiv.textContent = "Vui lòng nhập dữ liệu JSON!";
          errorMsgDiv.style.display = "block";
        }
        return false;
      }

      try {
        const parsed = JSON.parse(text);

        if (!Array.isArray(parsed)) {
          throw new Error("Dữ liệu JSON phải là một danh sách các câu hỏi (mảng).");
        }

        if (parsed.length === 0) {
          throw new Error("Danh sách câu hỏi trống.");
        }

        // 1. Validate structure and numbers
        const sorted = [...parsed].sort((a, b) => a.questionNumber - b.questionNumber);

        for (let i = 0; i < sorted.length; i++) {
          const q = sorted[i];
          const expectedNum = i + 1;
          if (q.questionNumber !== expectedNum) {
            throw new Error(`Số câu không liên tục hoặc không hợp lệ. Mong đợi Câu ${expectedNum} nhưng nhận được Câu ${q.questionNumber}.`);
          }
          if (!q.questionType || !['MULTIPLE_CHOICE', 'TRUE_FALSE', 'SHORT_ANSWER'].includes(q.questionType)) {
            throw new Error(`Câu ${q.questionNumber} có loại câu hỏi không hợp lệ hoặc bị thiếu.`);
          }

          if (q.questionType === 'MULTIPLE_CHOICE') {
            if (!q.mcAnswer || !['A', 'B', 'C', 'D'].includes(q.mcAnswer)) {
              throw new Error(`Câu ${q.questionNumber} (Trắc nghiệm) phải có đáp án 'mcAnswer' là A, B, C hoặc D.`);
            }
          } else if (q.questionType === 'TRUE_FALSE') {
            if (!q.tfAnswers || typeof q.tfAnswers !== 'object') {
              throw new Error(`Câu ${q.questionNumber} (Đúng/Sai) thiếu cấu trúc đáp án 'tfAnswers'.`);
            }
            const keys = ['a', 'b', 'c', 'd'];
            for (const key of keys) {
              if (q.tfAnswers[key] === undefined || typeof q.tfAnswers[key] !== 'boolean') {
                throw new Error(`Câu ${q.questionNumber} (Đúng/Sai) phải chứa ý phụ '${key}' có giá trị true hoặc false.`);
              }
            }
          } else if (q.questionType === 'SHORT_ANSWER') {
            if (q.saAnswer === undefined || q.saAnswer === null || String(q.saAnswer).trim() === '') {
              throw new Error(`Câu ${q.questionNumber} (Trả lời ngắn) phải có đáp án 'saAnswer' không được để trống.`);
            }
          }
        }

        // 2. Validate ordering partition (MULTIPLE_CHOICE -> TRUE_FALSE -> SHORT_ANSWER)
        let lastType = 'MULTIPLE_CHOICE';
        for (let i = 0; i < sorted.length; i++) {
          const q = sorted[i];
          const type = q.questionType;
          if (type === 'MULTIPLE_CHOICE') {
            if (lastType !== 'MULTIPLE_CHOICE') {
              throw new Error(`Lỗi thứ tự: Câu trắc nghiệm (Câu ${q.questionNumber}) không được phép đứng sau câu loại khác.`);
            }
          } else if (type === 'TRUE_FALSE') {
            if (lastType === 'SHORT_ANSWER') {
              throw new Error(`Lỗi thứ tự: Câu Đúng/Sai (Câu ${q.questionNumber}) không được phép đứng sau câu tự luận/ngắn.`);
            }
            lastType = 'TRUE_FALSE';
          } else if (type === 'SHORT_ANSWER') {
            lastType = 'SHORT_ANSWER';
          }
        }

        // 3. Count types
        const mcQ = sorted.filter(q => q.questionType === 'MULTIPLE_CHOICE');
        const tfQ = sorted.filter(q => q.questionType === 'TRUE_FALSE');
        const saQ = sorted.filter(q => q.questionType === 'SHORT_ANSWER');

        const mcCount = mcQ.length;
        const tfCount = tfQ.length;
        const saCount = saQ.length;

        // 4. Update in-memory answer maps
        const newMcAnswers = {};
        const newTfAnswers = {};
        const newSaAnswers = {};

        mcQ.forEach((q, idx) => {
          newMcAnswers[idx + 1] = q.mcAnswer;
        });

        tfQ.forEach((q, idx) => {
          newTfAnswers[idx + 1] = {
            a: q.tfAnswers.a,
            b: q.tfAnswers.b,
            c: q.tfAnswers.c,
            d: q.tfAnswers.d
          };
        });

        saQ.forEach((q, idx) => {
          newSaAnswers[idx + 1] = String(q.saAnswer);
        });

        // Apply updates
        currentConfig.mcCount = mcCount;
        currentConfig.tfCount = tfCount;
        currentConfig.saCount = saCount;

        mcAnswers = newMcAnswers;
        tfAnswers = newTfAnswers;
        saAnswers = newSaAnswers;

        // Update input element values in HTML if they exist
        const mcInput = document.getElementById('cfg-mc-count');
        const tfInput = document.getElementById('cfg-tf-count');
        const saInput = document.getElementById('cfg-sa-count');
        if (mcInput) mcInput.value = mcCount;
        if (tfInput) tfInput.value = tfCount;
        if (saInput) saInput.value = saCount;

        // Re-render UI matrix
        const container = document.getElementById('answer-matrix-container');
        if (container) {
          container.innerHTML = renderAnswerMatrix();
          bindMatrixEvents();
        }

        showToast(`Nhập thành công ${sorted.length} câu hỏi từ chuỗi JSON!`, "success");
        return true; // Closes modal
      } catch (err) {
        if (errorMsgDiv) {
          errorMsgDiv.textContent = `Lỗi: ${err.message}`;
          errorMsgDiv.style.display = "block";
        }
        return false; // Keep modal open
      }
    });
  });

  bindMatrixEvents()

  // Save Homework Event
  document.getElementById('save-homework-btn')?.addEventListener('click', async () => {
    let title = document.getElementById('hw-title')?.value.trim()
    const classId = document.getElementById('hw-class-select')?.value
    const lessonId = document.getElementById('hw-lesson-select')?.value
    const selectedLessonTitle = getSelectedLessonTitle()
    const duration = parseInt(document.getElementById('hw-duration')?.value || '45', 10)
    const deadlineRaw = document.getElementById('hw-deadline')?.value
    const maxAttemptsVal = parseInt(document.getElementById('hw-max-attempts')?.value || '0', 10)
    const maxViolationsVal = parseInt(document.getElementById('hw-max-violations')?.value || '3', 10)
    const typeVal = document.getElementById('hw-type')?.value || 'PRACTICE'
    const showSolutions = document.getElementById('hw-show-solutions') ? document.getElementById('hw-show-solutions').checked : true

    const deadline = deadlineRaw ? new Date(deadlineRaw).toISOString() : null
    const maxAttempts = maxAttemptsVal > 0 ? maxAttemptsVal : null
    const maxViolations = maxViolationsVal > 0 ? maxViolationsVal : 3

    if (!title) {
      showToast('Vui lòng nhập tên bài tập!', 'error')
      return
    }

    if (!lessonId) {
      showToast('Vui lòng chọn bài học cho bài tập này!', 'error')
      return
    }

    let finalTitle = title
    if (selectedLessonTitle) {
      const prefix = `${selectedLessonTitle} - `
      if (!title.startsWith(prefix)) {
        finalTitle = `${prefix}${title}`
      }
    }

    // Build questions list
    let questions = []

    if (currentMode === 'INTERACTIVE') {
      if (!interactiveQuestions || interactiveQuestions.length === 0) {
        showToast('Bài tập phải có ít nhất 1 câu hỏi!', 'error')
        return
      }

      for (let i = 0; i < interactiveQuestions.length; i++) {
        const q = interactiveQuestions[i]
        if (q.questionType === 'MULTIPLE_CHOICE' && !q.mcAnswer) {
          showToast(`Vui lòng chọn đáp án đúng cho Câu ${q.questionNumber} (Phần I)!`, 'error')
          return
        }
        if (q.questionType === 'SHORT_ANSWER' && (!q.saAnswer || String(q.saAnswer).trim() === '')) {
          showToast(`Vui lòng nhập đáp án cho Câu ${q.questionNumber} (Phần III)!`, 'error')
          return
        }
      }

      questions = interactiveQuestions.map((q, idx) => {
        const isTf = q.questionType === 'TRUE_FALSE'
        const isMc = q.questionType === 'MULTIPLE_CHOICE'
        const isSa = q.questionType === 'SHORT_ANSWER'

        const opts = q.options || []
        const statements = isTf ? opts : (q.statements || [])

        return {
          id: `q_${idx + 1}`,
          questionNumber: q.questionNumber || (idx + 1),
          questionType: q.questionType,
          points: q.points || (isTf ? 1.0 : (isSa ? 0.5 : 0.25)),
          prompt: JSON.stringify({
            isInteractive: true,
            text: q.promptText || '',
            imageUrl: q.imageUrl || '',
            options: isMc ? opts : [],
            statements: isTf ? statements : [],
            explanation: q.explanation || ''
          }),
          content: q.promptText || '',
          options: isMc ? opts : null,
          statements: isTf ? statements : null,
          explanation: q.explanation || '',
          mcAnswer: isMc ? q.mcAnswer || 'A' : undefined,
          tfAnswers: isTf ? (q.tfAnswers || { a: true, b: true, c: false, d: true }) : undefined,
          saAnswer: isSa ? String(q.saAnswer || '').trim() : undefined,
          saTolerance: isSa ? (Number(q.saTolerance) || 0) : 0
        }
      })
    } else {
      const totalQuestions = currentConfig.mcCount + currentConfig.tfCount + currentConfig.saCount
      if (totalQuestions === 0) {
        showToast('Bài tập phải có ít nhất 1 câu hỏi!', 'error')
        return
      }

      let globalIndex = 1

      // Part I: MC
      for (let i = 1; i <= currentConfig.mcCount; i++) {
        const ans = mcAnswers[i]
        if (!ans) {
          showToast(`Vui lòng chọn đáp án cho Câu ${i} (Phần I)`, 'error')
          return
        }
        questions.push({
          id: `q_${globalIndex}`,
          questionNumber: globalIndex,
          questionType: 'MULTIPLE_CHOICE',
          partTitle: 'Phần I: Trắc nghiệm',
          prompt: `Câu hỏi số ${i}`,
          mcAnswer: ans,
          points: 1.0
        })
        globalIndex++
      }

      // Part II: TF
      for (let i = 1; i <= currentConfig.tfCount; i++) {
        const tf = tfAnswers[i] || {}
        if (tf.a === undefined || tf.b === undefined || tf.c === undefined || tf.d === undefined) {
          showToast(`Vui lòng chọn đầy đủ Đúng/Sai cho Câu ${i} (Phần II)`, 'error')
          return
        }
        questions.push({
          id: `q_${globalIndex}`,
          questionNumber: globalIndex,
          questionType: 'TRUE_FALSE',
          partTitle: 'Phần II: Đúng / Sai',
          prompt: `Câu hỏi số ${i}`,
          tfAnswers: { a: tf.a, b: tf.b, c: tf.c, d: tf.d },
          points: 1.0
        })
        globalIndex++
      }

      // Part III: SA
      for (let i = 1; i <= currentConfig.saCount; i++) {
        const ans = saAnswers[i]
        if (ans === undefined || ans === null || ans.trim() === '') {
          showToast(`Vui lòng nhập đáp án cho Câu ${i} (Phần III)`, 'error')
          return
        }
        questions.push({
          id: `q_${globalIndex}`,
          questionNumber: globalIndex,
          questionType: 'SHORT_ANSWER',
          partTitle: 'Phần III: Trả lời ngắn',
          prompt: `Câu hỏi số ${i}`,
          saAnswer: ans.trim(),
          points: 1.0
        })
        globalIndex++
      }
    }

    const isEdit = !!state.editHomeworkData
    const hw = isEdit ? state.editHomeworkData.homework : null

    let pdfPath = 'INTERACTIVE'
    let fileToUpload = null

    if (currentMode === 'INTERACTIVE') {
      if (interactivePdfFile) {
        fileToUpload = interactivePdfFile
      } else if (!isInteractivePdfRemoved && isEdit && hw && hw.pdfPath && hw.pdfPath !== 'INTERACTIVE') {
        pdfPath = hw.pdfPath
      } else {
        pdfPath = 'INTERACTIVE'
      }
    } else {
      const fileInput = document.getElementById('hw-pdf-file')
      const file = fileInput?.files?.[0]
      pdfPath = hw ? (hw.pdfPath || hw.pdf_path || 'Homework_Attachment.pdf') : 'Homework_Attachment.pdf'
      if (file) {
        fileToUpload = file
      }
    }

    try {
      if (fileToUpload) {
        const sanitizedName = fileToUpload.name.replace(/[^a-zA-Z0-9.]/g, '_')
        const isSameFile = hw && (hw.pdfPath || hw.pdf_path) && (hw.pdfPath || hw.pdf_path).endsWith(sanitizedName)
        if (!isSameFile) {
          showToast('Đang tải file PDF lên kho lưu trữ...', 'info')
          pdfPath = await api.uploadFile(fileToUpload)
        } else {
          console.log('[CreateHw] File name is identical to existing. Skipping upload.')
          pdfPath = hw.pdfPath || hw.pdf_path
        }
      }

      if (isEdit && hw) {
        showToast('Đang cập nhật bài tập...', 'info')
        await api.updateHomework({
          homeworkId: hw.id,
          lessonId,
          title: finalTitle,
          pdfPath,
          durationMinutes: duration,
          passScore: hw.passScore || hw.pass_score || 5.0,
          maxScore: hw.maxScore || hw.max_score || 10.0,
          isPublished: hw.isPublished !== false,
          questions,
          deadline,
          maxAttempts,
          type: typeVal,
          maxViolations,
          showSolutions
        })
        showToast(`Đã cập nhật bài tập "${finalTitle}" thành công!`, 'success')
        window.location.hash = '#homework-mgmt'
      } else {
        showToast('Đang lưu cấu hình bài tập...', 'info')
        await api.createHomework({
          lessonId,
          title: finalTitle,
          pdfPath,
          durationMinutes: duration,
          passScore: 5.0,
          maxScore: 10.0,
          isPublished: true,
          questions,
          deadline,
          maxAttempts,
          type: typeVal,
          maxViolations,
          showSolutions
        })
        showToast(`Đã xuất bản bài tập "${finalTitle}" thành công!`, 'success')
        window.location.hash = '#homework-mgmt'
      }
    } catch (err) {
      showToast(`Lưu bài tập thất bại: ${err.message}`, 'error')
    }
  })
}

function bindMatrixEvents() {
  // MC click selection
  document.querySelectorAll('.mc-option-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      const qNum = parseInt(btn.getAttribute('data-qnum'), 10)
      const opt = btn.getAttribute('data-option')
      mcAnswers[qNum] = opt

      // Update active UI for this qNum
      document.querySelectorAll(`.mc-option-btn[data-qnum="${qNum}"]`).forEach(b => {
        const isCurrent = b.getAttribute('data-option') === opt
        b.style.background = isCurrent ? '#0066cc' : '#ffffff'
        b.style.color = isCurrent ? '#ffffff' : '#334155'
        b.style.borderColor = isCurrent ? '#0066cc' : '#cbd5e1'
      })
    })
  })

  // TF click selection
  document.querySelectorAll('.tf-option-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      const index = parseInt(btn.getAttribute('data-index'), 10)
      const sub = btn.getAttribute('data-sub')
      const val = btn.getAttribute('data-val') === 'true'

      if (!tfAnswers[index]) tfAnswers[index] = {}
      tfAnswers[index][sub] = val

      // Update UI for this sub item
      const parent = btn.parentElement
      if (parent) {
        parent.querySelectorAll('.tf-option-btn').forEach(b => {
          const isVal = b.getAttribute('data-val') === (val ? 'true' : 'false')
          if (isVal) {
            b.style.background = val ? '#16a34a' : '#dc2626'
            b.style.color = '#ffffff'
            b.style.borderColor = val ? '#16a34a' : '#dc2626'
          } else {
            b.style.background = '#ffffff'
            b.style.color = '#475569'
            b.style.borderColor = '#cbd5e1'
          }
        })
      }
    })
  })

  // Short answer inputs change
  document.querySelectorAll('.sa-input').forEach(input => {
    input.addEventListener('input', (e) => {
      const index = parseInt(input.getAttribute('data-index'), 10)
      saAnswers[index] = e.target.value
    })
  })
}
