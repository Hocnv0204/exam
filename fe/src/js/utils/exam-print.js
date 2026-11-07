/**
 * exam-print.js — Xuất đề bài (Markdown đã render) ra PDF qua hộp thoại in của trình duyệt.
 *
 * - Không dùng thư viện PDF: dựng trang in A4 trong iframe ẩn rồi gọi print(),
 *   người dùng chọn "Lưu dưới dạng PDF".
 * - Hai chế độ:
 *   + 'student': đề trắng — không lời giải, không đánh dấu đáp án đúng.
 *   + 'answer' : đề + lời giải dưới mỗi câu + bảng đáp án tổng hợp cuối đề.
 *
 * Các hàm thuần (normalize/build/canExport) không đụng DOM để test node import được.
 * Phần DOM chỉ chạy trong exportExamPdf().
 */
import { renderMarkdown } from './exam-parser.js'
import { canViewHomeworkPdf } from './homework-pdf-policy.js'
import { parsePrompt, safeImage } from './homework-markdown-preview.js'
import { ensureKatexLoaded, renderMath } from '../components/math-renderer.js'
import { showToast } from '../components/toast.js'

export const EXAM_PRINT_MODES = ['student', 'answer']

const KATEX_CSS_URL = 'https://cdn.jsdelivr.net/npm/katex@0.16.9/dist/katex.min.css'

const escapeHtml = value => String(value ?? '')
  .replace(/&/g, '&amp;')
  .replace(/</g, '&lt;')
  .replace(/>/g, '&gt;')
  .replace(/"/g, '&quot;')
  .replace(/'/g, '&#039;')

const TYPE_ALIASES = { MC: 'MULTIPLE_CHOICE', TF: 'TRUE_FALSE', SA: 'SHORT_ANSWER', TL: 'ESSAY' }
const KNOWN_TYPES = ['MULTIPLE_CHOICE', 'TRUE_FALSE', 'SHORT_ANSWER', 'ESSAY']

const DEFAULT_PART_TITLES = {
  MULTIPLE_CHOICE: 'TRẮC NGHIỆM NHIỀU LỰA CHỌN',
  TRUE_FALSE: 'TRẮC NGHIỆM ĐÚNG / SAI',
  SHORT_ANSWER: 'TRẮC NGHIỆM TRẢ LỜI NGẮN',
  ESSAY: 'TỰ LUẬN'
}

const TYPE_LABELS = {
  MULTIPLE_CHOICE: 'Trắc nghiệm',
  TRUE_FALSE: 'Đúng / Sai',
  SHORT_ANSWER: 'Trả lời ngắn',
  ESSAY: 'Tự luận'
}

const ROMAN = ['I', 'II', 'III', 'IV', 'V', 'VI', 'VII', 'VIII', 'IX', 'X']

function normType(raw) {
  const t = String(raw || 'MULTIPLE_CHOICE').toUpperCase()
  if (TYPE_ALIASES[t]) return TYPE_ALIASES[t]
  return KNOWN_TYPES.includes(t) ? t : 'MULTIPLE_CHOICE'
}

/** Chuẩn hoá danh sách phương án / mệnh đề về [{id,text}]. */
function normItems(list, lowerCase) {
  if (!Array.isArray(list)) return []
  return list.map((opt, i) => {
    const fallbackId = lowerCase ? String.fromCharCode(97 + i) : String.fromCharCode(65 + i)
    if (typeof opt === 'string') return { id: fallbackId, text: opt }
    if (!opt || typeof opt !== 'object') return { id: fallbackId, text: '' }
    const rawId = String(opt.id ?? opt.key ?? opt.label ?? fallbackId).trim() || fallbackId
    return {
      id: lowerCase ? rawId.toLowerCase() : rawId.toUpperCase(),
      text: String(opt.text ?? opt.content ?? '')
    }
  })
}

function toBool(v) {
  if (v === true || v === false) return v
  const s = String(v ?? '').trim().toLowerCase()
  if (['true', 'đ', 'd', 'đúng', 'dung', '1'].includes(s)) return true
  if (['false', 's', 'sai', '0'].includes(s)) return false
  return undefined
}

/** tfAnswers: object {a:true,...} hoặc mảng boolean → {a:true,...} | null */
function normTf(raw) {
  if (!raw) return null
  let data = raw
  if (typeof data === 'string') {
    try { data = JSON.parse(data) } catch { return null }
  }
  const out = {}
  if (Array.isArray(data)) {
    data.forEach((v, i) => {
      const b = toBool(v)
      if (b !== undefined) out[String.fromCharCode(97 + i)] = b
    })
  } else if (typeof data === 'object') {
    Object.keys(data).forEach(k => {
      const b = toBool(data[k])
      if (b !== undefined) out[String(k).trim().toLowerCase()] = b
    })
  }
  return Object.keys(out).length ? out : null
}

function cleanString(v) {
  if (v === undefined || v === null) return null
  const s = String(v).trim()
  return s ? s : null
}

/**
 * Chuẩn hoá thứ tự câu từ Ngân hàng câu hỏi (đánh số 1..n theo thứ tự hiển thị, không mutate mảng/object gốc).
 * @param {Array} rows - Danh sách dòng câu hỏi từ question_bank hoặc previewQuestions
 * @returns {Array} Mảng các object mới với question_number: 1..n
 */
export function buildBankPrintQuestions(rows) {
  if (!Array.isArray(rows)) return []
  return rows.filter(r => r && typeof r === 'object').map((row, idx) => ({
    ...row,
    question_number: idx + 1,
    questionNumber: idx + 1
  }))
}

function isApiShape(q) {
  return 'question_type' in q || 'question_number' in q || 'answerKey' in q || ('prompt' in q && !('promptText' in q))
}

/**
 * Chuẩn hoá câu hỏi từ parser (create-hw) hoặc từ API getHomeworkDetail về một shape chung:
 * { number, type, partTitle, promptText, imageUrl, options:[{id,text}], statements:[{id,text}],
 *   answer:{ mc, tf, sa }, explanation }
 */
export function normalizePrintQuestions(questions) {
  if (!Array.isArray(questions)) return []
  return questions.filter(q => q && typeof q === 'object').map((q, idx) => {
    if (isApiShape(q)) {
      const prompt = parsePrompt(q.prompt, q.content)
      const type = normType(q.question_type || q.questionType || prompt.questionType)
      const key = q.answerKey && typeof q.answerKey === 'object' ? q.answerKey : null
      const mcOptions = Array.isArray(prompt.options) && prompt.options.length ? prompt.options : q.options
      const tfStatements = Array.isArray(q.statements) && q.statements.length
        ? q.statements
        : (Array.isArray(prompt.statements) && prompt.statements.length ? prompt.statements : prompt.options)
      const mcRaw = key ? key.mc_answer : q.mc_answer
      const tfRaw = key ? key.tf_answers : q.tf_answers
      const saRaw = key ? key.sa_answer : q.sa_answer
      const explanation = key
        ? String(key.explanation || prompt.explanation || '')
        : String(q.explanation || prompt.explanation || '')
      return {
        number: q.question_number || q.questionNumber || idx + 1,
        type,
        partTitle: String(q.part_title || prompt.partTitle || ''),
        promptText: String(prompt.text || ''),
        imageUrl: typeof prompt.imageUrl === 'string' ? prompt.imageUrl : '',
        options: type === 'MULTIPLE_CHOICE' ? normItems(mcOptions, false) : [],
        statements: type === 'TRUE_FALSE' ? normItems(tfStatements, true) : [],
        answer: {
          mc: type === 'MULTIPLE_CHOICE' ? cleanString(mcRaw)?.toUpperCase() ?? null : null,
          tf: type === 'TRUE_FALSE' ? normTf(tfRaw) : null,
          sa: type === 'SHORT_ANSWER' || type === 'ESSAY' ? cleanString(saRaw) : null
        },
        explanation
      }
    }

    // Dữ liệu từ parseExamMarkdown
    const type = normType(q.questionType || q.question_type)
    const rawOptions = Array.isArray(q.options) ? q.options : []
    let mc = cleanString(q.mcAnswer)
    if (!mc) {
      const correct = rawOptions.find(o => o && typeof o === 'object' && o.isCorrect)
      if (correct) mc = cleanString(correct.id)
    }
    const tfSource = Array.isArray(q.statements) && q.statements.length
      ? q.statements
      : (Array.isArray(q.subQuestions) && q.subQuestions.length ? q.subQuestions : rawOptions)
    return {
      number: q.questionNumber || q.question_number || idx + 1,
      type,
      partTitle: String(q.partTitle || ''),
      promptText: String(q.promptText ?? q.content ?? ''),
      imageUrl: typeof q.imageUrl === 'string' ? q.imageUrl : '',
      options: type === 'MULTIPLE_CHOICE' ? normItems(rawOptions, false) : [],
      statements: type === 'TRUE_FALSE' ? normItems(tfSource, true) : [],
      answer: {
        mc: type === 'MULTIPLE_CHOICE' && mc ? mc.toUpperCase() : null,
        tf: type === 'TRUE_FALSE' ? normTf(q.tfAnswers) : null,
        sa: type === 'SHORT_ANSWER' ? cleanString(q.saAnswer) : (type === 'ESSAY' ? cleanString(q.essayAnswer) : null)
      },
      explanation: String(q.explanation || '')
    }
  })
}

/** Ảnh an toàn: http(s)/data base64 (theo preview hiện có) + blob: cùng origin của trang soạn đề. */
function printImageSrc(url) {
  const safe = safeImage(url)
  if (safe) return safe
  return typeof url === 'string' && /^blob:https?:\/\//i.test(url) ? escapeHtml(url) : ''
}

/** Độ dài "nhìn thấy" xấp xỉ của text thô (bỏ lệnh LaTeX, dấu $). */
function visibleLength(text) {
  return String(text || '')
    .replace(/\\(?:ce|text|mathrm|mathbf)\{([^{}]*)\}/g, '$1')
    .replace(/\\[a-zA-Z]+/g, 'x')
    .replace(/[${}^_\s]/g, '')
    .length
}

/** Số cột lưới phương án MC: 4 / 2 / 1 theo độ dài phương án dài nhất. */
export function pickOptionColumns(options) {
  if (!Array.isArray(options) || !options.length) return 1
  const complex = options.some(o => /\n|```|\|.*\||!\[|\[SMILES:/i.test(String(o.text || '')))
  if (complex) return 1
  const maxLen = Math.max(...options.map(o => visibleLength(o.text)))
  if (maxLen <= 14) return 4
  if (maxLen <= 34) return 2
  return 1
}

function tfAnswerString(q) {
  const tf = q.answer?.tf
  if (!tf) return '—'
  const ids = q.statements.length ? q.statements.map(s => s.id) : Object.keys(tf).sort()
  return ids.map(id => (tf[id] === true ? 'Đ' : tf[id] === false ? 'S' : '?')).join('')
}

/** Đáp án dạng chuỗi ngắn cho một câu (dùng cho bảng đáp án). */
export function answerSummary(q) {
  if (q.type === 'MULTIPLE_CHOICE') return q.answer?.mc || '—'
  if (q.type === 'TRUE_FALSE') return tfAnswerString(q)
  if (q.type === 'SHORT_ANSWER') return q.answer?.sa || '—'
  return q.answer?.sa ? 'Xem lời giải' : '—'
}

function renderOptionsHtml(q) {
  if (!q.options.length) return ''
  const cols = pickOptionColumns(q.options)
  return `<div class="pq-options pq-cols-${cols}">${q.options.map(o =>
    `<div class="pq-opt"><span class="pq-opt-label">${escapeHtml(o.id)}.</span> <span class="pq-opt-text">${renderMarkdown(o.text)}</span></div>`
  ).join('')}</div>`
}

function renderTfTableHtml(q, mode) {
  if (!q.statements.length) return ''
  const tf = mode === 'answer' ? (q.answer?.tf || {}) : {}
  return `<table class="pq-tf"><thead><tr><th class="pq-tf-id">Ý</th><th>Mệnh đề</th><th class="pq-tf-col">Đúng</th><th class="pq-tf-col">Sai</th></tr></thead><tbody>${q.statements.map(s => {
    const t = mode === 'answer' && tf[s.id] === true ? 'X' : ''
    const f = mode === 'answer' && tf[s.id] === false ? 'X' : ''
    return `<tr><td class="pq-tf-id">${escapeHtml(s.id)})</td><td>${renderMarkdown(s.text)}</td><td class="pq-tf-col">${t}</td><td class="pq-tf-col">${f}</td></tr>`
  }).join('')}</tbody></table>`
}

function renderSolutionHtml(q) {
  let keyText
  if (q.type === 'TRUE_FALSE') {
    const tf = q.answer?.tf
    keyText = tf && q.statements.length
      ? q.statements.map(s => `${escapeHtml(s.id)}) ${tf[s.id] === true ? 'Đúng' : tf[s.id] === false ? 'Sai' : '—'}`).join('; ')
      : '—'
  } else if (q.type === 'ESSAY') {
    keyText = q.answer?.sa ? renderMarkdown(q.answer.sa) : '—'
  } else {
    keyText = escapeHtml(answerSummary(q))
  }
  return `<div class="pq-solution"><div class="pq-solution-key"><strong>Đáp án:</strong> ${keyText}</div>${
    q.explanation ? `<div class="pq-solution-text"><strong>Lời giải:</strong> ${renderMarkdown(q.explanation)}</div>` : ''
  }</div>`
}

/** Câu có khối hình, bảng Markdown, ảnh hoặc SMILES trong đề/phương án/mệnh đề. */
function isRichPrintContent(q) {
  const texts = [q.promptText, ...q.options.map(o => o.text), ...q.statements.map(s => s.text)]
  return texts.some(t => /```|!\[|\[SMILES:|^\s*\|.*\|\s*$/im.test(String(t || '')))
}

/**
 * Dựng thân đề (HTML, chưa render KaTeX). Thuần, không đụng DOM.
 * @param {ReturnType<typeof normalizePrintQuestions>} normalized
 * @param {{mode?: 'student'|'answer'}} opts
 */
export function buildExamPrintBody(normalized, { mode = 'student' } = {}) {
  const isAnswer = mode === 'answer'
  const list = Array.isArray(normalized) ? normalized : []
  let lastPartKey = null
  let partIndex = 0
  return list.map(q => {
    let partHtml = ''
    const partKey = q.partTitle ? `title:${q.partTitle}` : `type:${q.type}`
    if (partKey !== lastPartKey) {
      lastPartKey = partKey
      const label = q.partTitle
        ? escapeHtml(q.partTitle)
        : `PHẦN ${ROMAN[partIndex] || partIndex + 1}. ${DEFAULT_PART_TITLES[q.type]}`
      partIndex++
      partHtml = `<h3 class="pq-part">${label}</h3>`
    }
    const img = printImageSrc(q.imageUrl)
    let body = ''
    if (q.type === 'MULTIPLE_CHOICE') body = renderOptionsHtml(q)
    else if (q.type === 'TRUE_FALSE') body = renderTfTableHtml(q, mode)
    else if (q.type === 'SHORT_ANSWER') body = '<div class="pq-sa">Trả lời: <span class="pq-blank"></span></div>'
    else if (!isAnswer) body = `<div class="pq-lines">${'<div class="pq-line"></div>'.repeat(8)}</div>`
    // Câu có hình/bảng/ảnh hoặc kèm lời giải có thể cao gần một trang: cho phép ngắt
    // trong câu (giữ nguyên từng khối hình/công thức/phương án), tránh đẩy cả câu sang
    // trang sau để lại trang trống.
    const flow = isAnswer || !!img || isRichPrintContent(q)
    return `${partHtml}<section class="pq${flow ? ' pq-flow' : ''}" data-q="${escapeHtml(q.number)}">
<div class="pq-prompt"><strong class="pq-num">Câu ${escapeHtml(q.number)}.</strong> ${renderMarkdown(q.promptText)}</div>
${img ? `<div class="pq-img"><img src="${img}" alt="Hình minh họa câu ${escapeHtml(q.number)}"></div>` : ''}
${body}
${isAnswer ? renderSolutionHtml(q) : ''}
</section>`
  }).join('\n')
}

/** Bảng đáp án tổng hợp (mode answer). Thiếu đáp án → "—". */
export function buildAnswerKeyHtml(normalized) {
  const list = Array.isArray(normalized) ? normalized : []
  const rows = list.map(q =>
    `<tr data-q="${escapeHtml(q.number)}"><td>${escapeHtml(q.number)}</td><td>${TYPE_LABELS[q.type] || ''}</td><td class="pq-key-val">${escapeHtml(answerSummary(q))}</td></tr>`
  ).join('')
  return `<section class="pq-answer-key"><h2>BẢNG ĐÁP ÁN</h2><table class="pq-key-table"><thead><tr><th>Câu</th><th>Loại</th><th>Đáp án</th></tr></thead><tbody>${rows}</tbody></table></section>`
}

/** Quyền xuất: theo chính sách PDF hiện có; đề kèm đáp án chỉ ADMIN/TEACHER. */
export function canExportExam(role, homework, mode) {
  if (!EXAM_PRINT_MODES.includes(mode)) return false
  if (!canViewHomeworkPdf(role, homework)) return false
  if (mode === 'answer') return role === 'ADMIN' || role === 'TEACHER'
  return true
}

/** Tên đề → tên file PDF hợp lệ. */
export function sanitizePrintTitle(title) {
  const s = String(title || '')
    .replace(/[\\/:*?"<>|\u0000-\u001f]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 120)
  return s || 'De_bai'
}

export const PRINT_CSS = `
@page { size: A4; margin: 15mm; }
* { box-sizing: border-box; }
html, body { margin: 0; padding: 0; background: #fff; color: #000; }
body { font-family: "Times New Roman", "Noto Serif", "DejaVu Serif", "Liberation Serif", Georgia, serif; font-size: 12.5pt; line-height: 1.45; -webkit-print-color-adjust: exact; print-color-adjust: exact; }
.ep-header { text-align: center; margin-bottom: 10pt; border-bottom: 1px solid #000; padding-bottom: 8pt; }
.ep-title { font-size: 15pt; font-weight: 700; text-transform: uppercase; margin: 0 0 4pt; }
.ep-meta { font-size: 11.5pt; margin: 2pt 0; }
.ep-mode { font-style: italic; font-size: 11pt; }
.ep-candidate { display: flex; gap: 24pt; margin-top: 8pt; text-align: left; font-size: 12pt; }
.ep-candidate span { flex: 1; }
.pq-part { font-size: 12.5pt; font-weight: 700; margin: 12pt 0 6pt; break-after: avoid; page-break-after: avoid; }
.pq { break-inside: avoid; page-break-inside: avoid; margin: 0 0 9pt; }
.pq.pq-flow { break-inside: auto; page-break-inside: auto; }
.pq-flow .pq-prompt, .pq-part + .pq .pq-prompt { break-after: avoid; page-break-after: avoid; }
.pq-opt, .pq-tf tr, .pq-solution-key, .md-table tr { break-inside: avoid; page-break-inside: avoid; }
.pq-num { margin-right: 2pt; }
.pq-prompt { margin-bottom: 4pt; }
.pq-img { margin: 4pt 0; text-align: center; }
img { max-width: 100%; height: auto; }
.pq-img img { max-height: 90mm; object-fit: contain; }
/* KaTeX — theo "KaTeX Formula Adjustments" (styles.css), bỏ cuộn ngang khi in */
.katex { font-size: 1.08em; line-height: 1.25; }
.katex-display { margin: 0.75em 0 !important; padding: 4px 0; overflow: visible; break-inside: avoid; page-break-inside: avoid; }
/* Markdown — chép bản nền sáng của "Markdown Rich Styles" (styles.css) */
.table-responsive { width: 100%; overflow: visible; margin: 12px 0; break-inside: avoid; page-break-inside: avoid; }
.md-table { width: 100%; border-collapse: collapse; font-size: 13.5px; border: 1px solid #cbd5e1; background: #ffffff; }
.md-table th { background: #f8fafc; color: #1e293b; font-weight: 700; padding: 8px 14px; border: 1px solid #cbd5e1; white-space: nowrap; }
.md-table td { padding: 8px 14px; border: 1px solid #cbd5e1; color: #334155; }
.md-table tr:nth-child(even) td { background: #f8fafc; }
.md-h2 { font-size: 18px; font-weight: 800; margin: 12px 0 8px 0; color: #0f172a; }
.md-h3 { font-size: 16px; font-weight: 700; margin: 10px 0 6px 0; color: #0f172a; }
.md-h4 { font-size: 15px; font-weight: 700; margin: 8px 0 4px 0; color: #0f172a; }
.md-link { color: #0284c7; text-decoration: underline; }
.md-code { background: #f1f5f9; color: #0f172a; padding: 2px 6px; border-radius: 4px; font-family: monospace; font-size: 12.5px; }
.md-quote { border-left: 3px solid #0284c7; padding: 4px 12px; margin: 6px 0; background: #f0f9ff; color: #0369a1; border-radius: 0 6px 6px 0; }
.md-ul { margin: 6px 0; padding-left: 4px; list-style-type: disc; }
.md-li { margin-left: 20px; line-height: 1.6; }
.md-spacer { height: 8px; }
.md-img { max-width: 100%; max-height: 360px; object-fit: contain; border-radius: 8px; margin: 8px 0; border: 1px solid #e2e8f0; display: block; }
/* Khối hình (bbt/graph/geo3d/SMILES): nền trắng, chữ tối, không tràn trang */
.diagram-wrap { max-width: 100%; break-inside: avoid; page-break-inside: avoid; }
.diagram-wrap svg { max-width: 100%; height: auto; background: #fff; }
.diagram-wrap foreignObject div { color: #0f172a; }
svg { max-width: 100%; }
/* Bảng riêng của bản in */
.pq-tf, .pq-key-table { border-collapse: collapse; margin: 4pt 0; max-width: 100%; }
.pq-tf th, .pq-tf td, .pq-key-table th, .pq-key-table td { border: 1px solid #000; padding: 3pt 6pt; vertical-align: top; }
.pq-tf th, .pq-key-table th { background: #f1f1f1; }
.pq-options { display: grid; gap: 3pt 12pt; margin-top: 3pt; }
.pq-cols-4 { grid-template-columns: repeat(4, 1fr); }
.pq-cols-2 { grid-template-columns: repeat(2, 1fr); }
.pq-cols-1 { grid-template-columns: 1fr; }
.pq-opt-label { font-weight: 700; }
.pq-tf { width: 100%; }
.pq-tf-id { width: 28pt; text-align: center; }
.pq-tf-col { width: 40pt; text-align: center; font-weight: 700; }
.pq-sa { margin-top: 4pt; }
.pq-blank { display: inline-block; min-width: 60mm; border-bottom: 1px dotted #000; height: 1.2em; vertical-align: bottom; }
.pq-lines { margin-top: 4pt; }
.pq-line { border-bottom: 1px dotted #555; height: 8mm; }
.pq-solution { margin-top: 5pt; padding: 5pt 8pt; border-left: 2pt solid #444; background: #f6f6f6; }
.pq-solution-text { margin-top: 3pt; }
.pq-answer-key { break-before: page; page-break-before: always; }
.pq-answer-key h2 { text-align: center; font-size: 14pt; margin: 0 0 8pt; }
.pq-key-table { width: 100%; }
.pq-key-table td:first-child, .pq-key-table th:first-child { width: 40pt; text-align: center; }
.pq-key-val { font-weight: 700; }
`

/** Tài liệu HTML đầy đủ cho iframe in (thuần). */
export function buildExamPrintDocument({ title, meta = {}, bodyHtml = '', mode = 'student' } = {}) {
  const cleanTitle = sanitizePrintTitle(title)
  const metaParts = []
  if (meta?.subject) metaParts.push(`Môn: ${escapeHtml(meta.subject)}`)
  const minutes = Number(meta?.durationMinutes)
  if (Number.isFinite(minutes) && minutes > 0) metaParts.push(`Thời gian làm bài: ${minutes} phút`)
  if (meta?.extra) metaParts.push(escapeHtml(meta.extra))
  const header = `<header class="ep-header">
<div class="ep-title">${escapeHtml(title || cleanTitle)}</div>
${metaParts.length ? `<div class="ep-meta">${metaParts.join(' &nbsp;|&nbsp; ')}</div>` : ''}
${mode === 'answer'
    ? '<div class="ep-mode">(Đề kèm đáp án và lời giải)</div>'
    : '<div class="ep-candidate"><span>Họ và tên: ......................................................</span><span>SBD: ....................</span></div>'}
</header>`
  return `<!doctype html><html lang="vi"><head><meta charset="utf-8"><title>${escapeHtml(cleanTitle)}</title>
<link rel="stylesheet" href="${KATEX_CSS_URL}" data-katex="1">
<style>${PRINT_CSS}</style></head><body>${header}<main>${bodyHtml}</main></body></html>`
}

/**
 * Xây dựng CSS in được scope trong container để không ảnh hưởng đến giao diện chính.
 * @param {string} rootClass Tên class bao quanh container
 * @returns {string} CSS đã scope
 */
export function buildScopedPrintCss(rootClass = 'exam-pdf-render-host') {
  const scopedBase = `
.${rootClass} {
  box-sizing: border-box;
  font-family: "Times New Roman", "Noto Serif", "DejaVu Serif", "Liberation Serif", Georgia, serif;
  font-size: 12.5pt;
  line-height: 1.45;
  background: #ffffff;
  color: #000000;
  width: 180mm;
}
.${rootClass} * {
  box-sizing: border-box;
}
.${rootClass} .ep-header { margin-bottom: 0; padding-bottom: 14pt; }
.${rootClass} .pq-part { margin: 0; padding-top: 10pt; padding-bottom: 6pt; }
.${rootClass} .pq { margin: 0; padding-bottom: 9pt; }
.${rootClass} .pq-answer-key { margin: 0; padding-top: 12pt; }
.${rootClass} .ep-header, .${rootClass} .pq-part, .${rootClass} .pq, .${rootClass} .pq-answer-key { background: #ffffff; }
`
  const rules = PRINT_CSS
    .replace(/@page\s*\{[^}]*\}/g, '')
    .replace(/html,\s*body\s*\{[^}]*\}/g, '')
    .replace(/\*\s*\{[^}]*box-sizing:[^}]*\}/g, '')
    .replace(/^body\s*\{[^}]*\}/gm, '')
    .split('\n')
    .map(line => {
      const trimmed = line.trim()
      if (!trimmed || trimmed.startsWith('/*')) return line
      if (line.includes('{') && !line.startsWith('@')) {
        const [selectors, rest] = line.split('{')
        const scopedSelectors = selectors.split(',').map(s => {
          const st = s.trim()
          if (!st) return ''
          return `.${rootClass} ${st}`
        }).filter(Boolean).join(', ')
        return `${scopedSelectors} {${rest}`
      }
      return line
    })
    .join('\n')

  return `${scopedBase}\n${rules}`
}

/**
 * Phân trang các khối nội dung lên trang in A4.
 * Hàm THUẦN (không đụng DOM, phù hợp test độc lập).
 *
 * @param {number[]} blockHeights Chiều cao các khối (px) theo thứ tự
 * @param {number} pageHeight Chiều cao khả dụng của một trang (px)
 * @returns {Array<Array<{ blockIndex: number, offsetY: number, height: number }>>}
 */
export function paginateBlocks(blockHeights, pageHeight) {
  if (!Array.isArray(blockHeights) || !Number.isFinite(pageHeight) || pageHeight <= 0) {
    return []
  }

  const pages = []
  let currentPage = []
  let currentPageHeight = 0
  const EPSILON = 1e-4

  const flushPage = () => {
    if (currentPage.length > 0) {
      pages.push(currentPage)
      currentPage = []
      currentPageHeight = 0
    }
  }

  for (let i = 0; i < blockHeights.length; i++) {
    const rawH = blockHeights[i]
    const h = Number(rawH)
    if (!Number.isFinite(h) || h <= 0) continue

    if (h <= pageHeight + EPSILON) {
      const remainingSpace = pageHeight - currentPageHeight
      if (h <= remainingSpace + EPSILON) {
        currentPage.push({ blockIndex: i, offsetY: 0, height: h })
        currentPageHeight += h
        if (currentPageHeight >= pageHeight - EPSILON) {
          flushPage()
        }
      } else {
        flushPage()
        currentPage.push({ blockIndex: i, offsetY: 0, height: h })
        currentPageHeight = h
        if (currentPageHeight >= pageHeight - EPSILON) {
          flushPage()
        }
      }
    } else {
      // Khối cao hơn một trang: cắt thành nhiều đoạn liên tiếp, mỗi đoạn <= pageHeight
      let remainingBlockHeight = h
      let currentOffsetY = 0

      // Nếu trang hiện tại còn chỗ, cắt đoạn đầu lấp đầy trang hiện tại
      const remainingSpace = pageHeight - currentPageHeight
      if (remainingSpace > EPSILON && currentPage.length > 0) {
        currentPage.push({ blockIndex: i, offsetY: currentOffsetY, height: remainingSpace })
        currentOffsetY += remainingSpace
        remainingBlockHeight -= remainingSpace
        flushPage()
      } else if (currentPage.length > 0) {
        flushPage()
      }

      while (remainingBlockHeight > EPSILON) {
        const sliceH = Math.min(remainingBlockHeight, pageHeight)
        currentPage.push({ blockIndex: i, offsetY: currentOffsetY, height: sliceH })
        currentOffsetY += sliceH
        remainingBlockHeight -= sliceH
        currentPageHeight = sliceH

        if (currentPageHeight >= pageHeight - EPSILON) {
          flushPage()
        }
      }
    }
  }

  flushPage()
  return pages
}

/* ===================== Phần DOM (trình duyệt) ===================== */

let printing = false

const wait = ms => new Promise(resolve => setTimeout(resolve, ms))
const nextFrame = () => new Promise(resolve => {
  if (typeof requestAnimationFrame === 'function') requestAnimationFrame(() => resolve())
  else setTimeout(resolve, 16)
})
const withTimeout = (promise, ms) => Promise.race([Promise.resolve(promise).catch(() => {}), wait(ms)])

/** Như withTimeout nhưng HẾT GIỜ thì ném lỗi (dùng cho bước bắt buộc phải xong). */
export function rejectAfter(promise, ms, message) {
  let timer
  return Promise.race([
    Promise.resolve(promise).finally(() => clearTimeout(timer)),
    new Promise((_, reject) => { timer = setTimeout(() => reject(new Error(message)), ms) })
  ])
}

/**
 * Trích các khối @font-face từ CSS KaTeX, chỉ giữ nguồn woff2 (URL tuyệt đối). Hàm thuần để test.
 * @returns {Array<{ css: string, url: string }>}
 */
export function extractKatexFontFaces(cssText, baseUrl) {
  const faces = []
  for (const m of String(cssText || '').matchAll(/@font-face\s*\{([^}]*)\}/g)) {
    const body = m[1]
    const woff2 = body.match(/url\(\s*['"]?([^'")]+\.woff2)['"]?\s*\)\s*format\(\s*['"]?woff2['"]?\s*\)/i)
    if (!woff2) continue
    const url = new URL(woff2[1], baseUrl).href
    const rest = body.replace(/src\s*:[^;]*;?/i, '').trim().replace(/;?\s*$/, '')
    faces.push({ css: rest, url })
  }
  return faces
}

let katexFontEmbedCssPromise = null
/**
 * CSS @font-face chỉ gồm font KaTeX (woff2 → data URL), tạo MỘT lần mỗi phiên.
 * Truyền vào html-to-image (`fontEmbedCSS`) để nó KHÔNG tự quét & nhúng toàn bộ web font
 * của trang (Google Fonts, Font Awesome…) ở mỗi lần chụp khối — việc đó làm treo nhiều phút.
 * Lỗi mạng → '' (công thức dùng font dự phòng, vẫn ra PDF).
 */
function getKatexFontEmbedCss() {
  if (katexFontEmbedCssPromise) return katexFontEmbedCssPromise
  katexFontEmbedCssPromise = (async () => {
    try {
      const res = await rejectAfter(fetch(KATEX_CSS_URL), 10000, 'KaTeX CSS timeout')
      const faces = extractKatexFontFaces(await res.text(), KATEX_CSS_URL)
      const toDataUrl = blob => new Promise((resolve, reject) => {
        const reader = new FileReader()
        reader.onload = () => resolve(reader.result)
        reader.onerror = () => reject(reader.error)
        reader.readAsDataURL(blob)
      })
      const parts = await Promise.all(faces.map(async face => {
        try {
          const fontRes = await rejectAfter(fetch(face.url), 10000, 'font timeout')
          const dataUrl = await toDataUrl(await fontRes.blob())
          return `@font-face{${face.css};src:url(${dataUrl}) format('woff2')}`
        } catch { return '' }
      }))
      return parts.join('\n')
    } catch (err) {
      console.warn('[exam-print] Không nhúng được font KaTeX:', err)
      katexFontEmbedCssPromise = null
      return ''
    }
  })()
  return katexFontEmbedCssPromise
}

function waitStylesheet(link, ms) {
  if (!link) return Promise.resolve()
  try { if (link.sheet) return Promise.resolve() } catch { /* cross-origin sheet: coi như đã có */ return Promise.resolve() }
  return withTimeout(new Promise(resolve => {
    link.addEventListener('load', resolve, { once: true })
    link.addEventListener('error', resolve, { once: true })
  }), ms)
}

/**
 * Xuất đề ra PDF qua hộp thoại in.
 * @returns {Promise<boolean>} true nếu đã mở hộp thoại in.
 */
export async function exportExamPdf({ title, meta = {}, questions, mode = 'student', role, homework = null } = {}) {
  if (printing) {
    showToast('Đang chuẩn bị bản in, vui lòng chờ...', 'warning')
    return false
  }
  if (!canExportExam(role, homework, mode)) {
    showToast(mode === 'answer'
      ? 'Bạn không có quyền xuất đề kèm đáp án.'
      : 'Bạn không có quyền xuất PDF đề bài này.', 'warning')
    return false
  }
  const normalized = normalizePrintQuestions(questions)
  if (!normalized.length) {
    showToast('Đề chưa có câu hỏi để xuất PDF.', 'warning')
    return false
  }

  printing = true
  let holder = null
  let iframe = null
  let cleaned = false
  let fallbackTimer = null
  const cleanup = () => {
    if (cleaned) return
    cleaned = true
    if (fallbackTimer) clearTimeout(fallbackTimer)
    holder?.remove()
    iframe?.remove()
    printing = false
  }

  try {
    showToast('Đang chuẩn bị bản in PDF...', 'info')
    holder = document.createElement('div')
    holder.setAttribute('aria-hidden', 'true')
    holder.style.cssText = 'position:fixed;left:-10000px;top:0;width:180mm;background:#fff;color:#000;pointer-events:none;'
    holder.innerHTML = buildExamPrintBody(normalized, { mode }) + (mode === 'answer' ? buildAnswerKeyHtml(normalized) : '')
    document.body.appendChild(holder)

    await ensureKatexLoaded()
    await renderMath(holder)
    // SMILES vẽ bằng setTimeout(0) qua document.getElementById → chờ vài nhịp.
    await nextFrame()
    await nextFrame()
    await wait(60)
    await Promise.all(Array.from(holder.querySelectorAll('img')).map(img =>
      typeof img.decode === 'function' ? withTimeout(img.decode(), 5000) : null))
    if (document.fonts?.ready) await withTimeout(document.fonts.ready, 3000)

    const html = buildExamPrintDocument({ title, meta, bodyHtml: holder.innerHTML, mode })
    holder.remove()

    iframe = document.createElement('iframe')
    iframe.setAttribute('sandbox', 'allow-modals allow-same-origin')
    iframe.setAttribute('aria-hidden', 'true')
    iframe.setAttribute('tabindex', '-1')
    iframe.style.cssText = 'position:fixed;right:0;bottom:0;width:0;height:0;border:0;opacity:0;pointer-events:none;'
    await withTimeout(new Promise(resolve => {
      iframe.addEventListener('load', resolve, { once: true })
      iframe.srcdoc = html
      document.body.appendChild(iframe)
    }), 10000)

    const doc = iframe.contentDocument
    const win = iframe.contentWindow
    if (!doc || !win) throw new Error('Không khởi tạo được khung in.')
    await waitStylesheet(doc.querySelector('link[data-katex]'), 3000)
    if (doc.fonts?.ready) await withTimeout(doc.fonts.ready, 3000)
    await withTimeout(Promise.all(Array.from(doc.images || []).map(img =>
      typeof img.decode === 'function' ? img.decode() : null)), 5000)

    win.addEventListener('afterprint', () => setTimeout(cleanup, 0), { once: true })
    win.focus()
    win.print()
    // print() chặn tới khi đóng hộp thoại ở đa số trình duyệt; chỉ hẹn dọn dự phòng
    // SAU khi print() trả về để không gỡ iframe khi hộp thoại còn mở.
    fallbackTimer = setTimeout(cleanup, 60000)
    return true
  } catch (err) {
    console.error('[exam-print] Lỗi xuất PDF:', err)
    cleanup()
    showToast(`Không xuất được PDF: ${err?.message || 'Lỗi không xác định'}`, 'error')
    return false
  }
}

/**
 * Tự động tạo Blob PDF (application/pdf) thật sự từ danh sách câu hỏi đề thi,
 * không mở hộp thoại in của trình duyệt.
 *
 * @param {Object} params
 * @param {string} params.title Tên đề / bài tập
 * @param {Object} [params.meta] Metadata ({ durationMinutes, subject, extra })
 * @param {Array} params.questions Danh sách câu hỏi
 * @param {'student'|'answer'} [params.mode='student'] Chế độ in ('student' = đề trắng)
 * @returns {Promise<Blob>}
 */
export async function renderExamPdfBlob({ title, meta = {}, questions, mode = 'student' } = {}) {
  const normalized = normalizePrintQuestions(questions)
  if (!normalized.length) {
    throw new Error('Đề chưa có câu hỏi để tạo file PDF.')
  }

  let holder = null
  try {
    const { toCanvas } = await import('html-to-image')
    const jsPdfModule = await import('jspdf')
    const jsPDF = jsPdfModule.jsPDF || jsPdfModule.default

    const cleanTitle = sanitizePrintTitle(title)
    const metaParts = []
    if (meta?.subject) metaParts.push(`Môn: ${escapeHtml(meta.subject)}`)
    const minutes = Number(meta?.durationMinutes)
    if (Number.isFinite(minutes) && minutes > 0) metaParts.push(`Thời gian làm bài: ${minutes} phút`)
    if (meta?.extra) metaParts.push(escapeHtml(meta.extra))
    const headerHtml = `<header class="ep-header">
<div class="ep-title">${escapeHtml(title || cleanTitle)}</div>
${metaParts.length ? `<div class="ep-meta">${metaParts.join(' &nbsp;|&nbsp; ')}</div>` : ''}
${mode === 'answer'
    ? '<div class="ep-mode">(Đề kèm đáp án và lời giải)</div>'
    : '<div class="ep-candidate"><span>Họ và tên: ......................................................</span><span>SBD: ....................</span></div>'}
</header>`

    const bodyHtml = buildExamPrintBody(normalized, { mode }) + (mode === 'answer' ? buildAnswerKeyHtml(normalized) : '')

    holder = document.createElement('div')
    holder.setAttribute('aria-hidden', 'true')
    holder.className = 'exam-pdf-render-host'
    holder.style.cssText = 'position:fixed;left:-10000px;top:0;width:180mm;background:#fff;color:#000;pointer-events:none;z-index:-9999;'

    const scopedCss = buildScopedPrintCss('exam-pdf-render-host')
    holder.innerHTML = `<style>${scopedCss}</style><div class="exam-pdf-content">${headerHtml}${bodyHtml}</div>`
    document.body.appendChild(holder)

    await ensureKatexLoaded()
    await renderMath(holder)
    await nextFrame()
    await nextFrame()
    await wait(60)

    await Promise.all(Array.from(holder.querySelectorAll('img')).map(img =>
      typeof img.decode === 'function' ? withTimeout(img.decode(), 5000) : null))
    if (document.fonts?.ready) await withTimeout(document.fonts.ready, 3000)

    const blocks = Array.from(holder.querySelectorAll('.ep-header, .pq-part, .pq, .pq-answer-key'))
    if (!blocks.length) {
      throw new Error('Không thể phân tích các khối nội dung đề thi.')
    }

    const pixelRatio = 2
    const blockCanvases = []
    const blockHeights = []

    // MathML ẩn của KaTeX chỉ phục vụ trợ năng; khi chụp ảnh (nhất là nhãn trong SVG
    // foreignObject) CSS ẩn có thể không được áp → chữ bị lặp. Bỏ hẳn trước khi chụp.
    holder.querySelectorAll('.katex-mathml').forEach(el => el.remove())

    // Chỉ nhúng font KaTeX (tạo 1 lần/phiên). Không truyền thì html-to-image tải + base64
    // MỌI web font của trang cho TỪNG khối → đề vài chục câu treo nhiều phút.
    const fontEmbedCSS = await getKatexFontEmbedCss()

    for (const block of blocks) {
      // margin:0 trên bản clone: html-to-image đo theo kích thước phần tử (không gồm margin)
      // nên giữ margin-top sẽ đẩy nội dung xuống và cắt mất phần dưới.
      const raw = await rejectAfter(
        toCanvas(block, { pixelRatio, backgroundColor: '#ffffff', style: { margin: '0' }, fontEmbedCSS }),
        30000,
        'Quá thời gian dựng hình một câu khi tạo PDF'
      )
      // Khoảng trắng sau mỗi khối (thay cho margin đã bỏ) — nằm trong canvas để phân trang tính luôn.
      const gapPx = block.classList.contains('pq-part') ? 4 : (block.classList.contains('ep-header') ? 14 : 12)
      const canvas = document.createElement('canvas')
      canvas.width = raw.width
      canvas.height = raw.height + Math.round(gapPx * pixelRatio)
      const gctx = canvas.getContext('2d')
      gctx.fillStyle = '#ffffff'
      gctx.fillRect(0, 0, canvas.width, canvas.height)
      gctx.drawImage(raw, 0, 0)
      blockCanvases.push(canvas)
      blockHeights.push(canvas.height / pixelRatio)
    }

    const containerWidthPx = holder.getBoundingClientRect().width || 680
    const pageHeightPx = containerWidthPx * (267 / 180)

    const pages = paginateBlocks(blockHeights, pageHeightPx)
    if (!pages.length) {
      throw new Error('Không tạo được trang in cho đề thi.')
    }

    const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' })

    pages.forEach((pageSegments, pageIdx) => {
      if (pageIdx > 0) doc.addPage()
      let currentYMm = 15

      for (const seg of pageSegments) {
        const sourceCanvas = blockCanvases[seg.blockIndex]
        const segHeightMm = (seg.height / containerWidthPx) * 180
        const isSliced = seg.offsetY > 0 || seg.height < (sourceCanvas.height / pixelRatio) - 0.5

        let sliceCanvas = sourceCanvas
        if (isSliced) {
          const srcY = Math.round(seg.offsetY * pixelRatio)
          const srcHeight = Math.round(seg.height * pixelRatio)
          const srcWidth = sourceCanvas.width
          const actualHeight = Math.min(srcHeight, Math.max(1, sourceCanvas.height - srcY))

          sliceCanvas = document.createElement('canvas')
          sliceCanvas.width = srcWidth
          sliceCanvas.height = actualHeight
          const ctx = sliceCanvas.getContext('2d')
          ctx.fillStyle = '#ffffff'
          ctx.fillRect(0, 0, sliceCanvas.width, sliceCanvas.height)
          ctx.drawImage(
            sourceCanvas,
            0, srcY, srcWidth, actualHeight,
            0, 0, srcWidth, actualHeight
          )
        }

        const imgData = sliceCanvas.toDataURL('image/jpeg', 0.92)
        doc.addImage(imgData, 'JPEG', 15, currentYMm, 180, segHeightMm)
        currentYMm += segHeightMm
      }
    })

    return doc.output('blob')
  } finally {
    holder?.remove()
  }
}

