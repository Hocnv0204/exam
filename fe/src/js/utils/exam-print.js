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
      return {
        number: q.question_number || q.questionNumber || idx + 1,
        type,
        partTitle: String(q.part_title || prompt.partTitle || ''),
        promptText: String(prompt.text || ''),
        imageUrl: typeof prompt.imageUrl === 'string' ? prompt.imageUrl : '',
        options: type === 'MULTIPLE_CHOICE' ? normItems(mcOptions, false) : [],
        statements: type === 'TRUE_FALSE' ? normItems(tfStatements, true) : [],
        answer: {
          mc: type === 'MULTIPLE_CHOICE' ? cleanString(key?.mc_answer)?.toUpperCase() ?? null : null,
          tf: type === 'TRUE_FALSE' ? normTf(key?.tf_answers) : null,
          sa: type === 'SHORT_ANSWER' || type === 'ESSAY' ? cleanString(key?.sa_answer) : null
        },
        explanation: String(key?.explanation || prompt.explanation || '')
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

const PRINT_CSS = `
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

/* ===================== Phần DOM (trình duyệt) ===================== */

let printing = false

const wait = ms => new Promise(resolve => setTimeout(resolve, ms))
const nextFrame = () => new Promise(resolve => {
  if (typeof requestAnimationFrame === 'function') requestAnimationFrame(() => resolve())
  else setTimeout(resolve, 16)
})
const withTimeout = (promise, ms) => Promise.race([Promise.resolve(promise).catch(() => {}), wait(ms)])

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
