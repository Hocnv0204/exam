/**
 * diagram-renderer.js — Facade biên dịch khối hình (giữ tương thích API cũ).
 *
 * Hỗ trợ: Bảng biến thiên (bbt), Đồ thị hàm số (graph), Hình không gian (geo3d),
 * Công thức cấu tạo Hóa học: thu gọn (ctct) và từ SMILES (smiles, có vòng/polime).
 *
 * - Toán học (bbt/graph/geo3d) nằm trong thư mục ./diagrams (module thuần, test được).
 * - Biểu thức KHÔNG dùng eval / new Function.
 * - Lỗi trả về dạng hộp thông báo có cấu trúc (kèm mã lỗi), không che bằng
 *   thông báo chung chung.
 */

import { compileDiagram, formatDiagnostics } from './diagrams/compiler.js'
import { collectDiagramBlocks } from './diagrams/fence.js'
import { renderCtct } from './diagrams/chem-ctct.js'
import { renderSmiles } from './diagrams/chem-smiles.js'

const CHEM_TYPES = ['smiles', 'ctct']

let diagramUid = 0

/**
 * Biên dịch khối hình → HTML (API cũ, giữ nguyên hành vi cho caller hiện có).
 * @param {string} type bbt | graph | geo3d | axes3d | sphere3d | smiles | ctct
 * @param {string} code nội dung khối
 * @param {{inline?:boolean}} [opts] inline = thẻ [SMILES: ...] nằm giữa dòng chữ
 * @returns {string} HTML
 */
export function compileDiagramToSVG(type, code, opts = {}) {
  diagramUid += 1
  const kind = String(type || '').toLowerCase()

  if (CHEM_TYPES.includes(kind)) {
    const result = compileChem(kind, code, {})
    if (result.ok) return chemWrap(result.svg, !!opts.inline)
    return renderErrorBlock(kind, result.diagnostics.filter(d => d.severity === 'error'))
  }

  const result = compileDiagram(kind, code, { uid: diagramUid })
  if (result.ok) return result.svg
  return renderErrorBlock(kind, result.diagnostics)
}

/**
 * Biên dịch khối hình và trả về kết quả đầy đủ (model + svg + diagnostics).
 * Dùng cho màn xem trước / kiểm tra lỗi trước khi lưu.
 */
export function compileDiagramWithDiagnostics(type, code, ctx = {}) {
  diagramUid += 1
  const kind = String(type || '').toLowerCase()
  if (CHEM_TYPES.includes(kind)) {
    const result = compileChem(kind, code, ctx)
    return {
      ok: result.ok,
      model: null,
      svg: result.ok ? chemWrap(result.svg, false) : renderErrorBlock(kind, result.diagnostics.filter(d => d.severity === 'error')),
      diagnostics: result.diagnostics
    }
  }
  return compileDiagram(kind, code, { ...ctx, uid: diagramUid })
}

function compileChem(kind, code, ctx) {
  try {
    return kind === 'ctct' ? renderCtct(code, ctx) : renderSmiles(code, ctx)
  } catch (err) {
    console.error('[DiagramRenderer] chem render failed:', err)
    return {
      ok: false,
      svg: '',
      diagnostics: [{ severity: 'error', code: 'RENDER_FAILED', field: null, line: ctx.line ?? null, message: `Không vẽ được công thức (${err && err.message ? err.message : 'lỗi không xác định'}).` }]
    }
  }
}

/** SVG công thức dùng currentColor: nền trong suốt, theo màu chữ của nơi hiển thị. */
function chemWrap(svg, inline) {
  if (inline) {
    return `<span class="diagram-wrap chem-wrap chem-inline" style="display:inline-block;vertical-align:middle;margin:4px 8px;max-width:100%;">${svg}</span>`
  }
  return `<div class="diagram-wrap chem-wrap" style="margin:12px 0;max-width:100%;overflow-x:auto;">${svg}</div>`
}

/**
 * Kiểm tra toàn bộ văn bản Markdown có khối hình lỗi không.
 * @param {string} text
 * @returns {{errors:Array, warnings:Array, infos:Array, hasError:boolean, blocks:number}}
 */
export function validateDiagramsInText(text) {
  const { blocks, unclosed } = collectDiagramBlocks(text)
  const errors = []
  const warnings = []
  const infos = []

  unclosed.forEach(b => {
    errors.push({
      severity: 'error',
      code: 'FENCE_NOT_CLOSED',
      field: null,
      line: b.startLine,
      message: `Khối hình "${b.type}" mở ở dòng ${b.startLine} nhưng không có dấu \`\`\` đóng. Hãy đóng khối trước khi lưu.`
    })
  })

  blocks.forEach(b => {
    if (!b.closed) return
    // Khối fence: dòng mở ``` là startLine, nội dung bắt đầu ở dòng kế; thẻ inline nằm ngay trên dòng đó.
    const res = compileDiagramWithDiagnostics(b.type, b.code, { line: b.inline ? b.startLine - 1 : b.startLine })
    res.diagnostics.forEach(d => {
      const item = { ...d, line: d.line ?? b.startLine }
      if (item.severity === 'error') errors.push(item)
      else if (item.severity === 'warning') warnings.push(item)
      else infos.push(item)
    })
  })

  return {
    errors,
    warnings,
    infos,
    hasError: errors.length > 0,
    blocks: blocks.length
  }
}

function renderErrorBlock(type, diagnostics) {
  const items = (diagnostics || []).map(d => {
    const sev = d.severity === 'error' ? 'Lỗi' : (d.severity === 'warning' ? 'Cảnh báo' : 'Thông tin')
    return `<li style="margin:2px 0;"><strong>[${esc(d.code)}]</strong> ${esc(d.message)} <span style="color:#64748b;">(${sev})</span></li>`
  }).join('')
  return `<div class="diagram-wrap" style="margin:12px 0;">` +
    `<div style="padding:8px 10px;font-size:12px;color:#b91c1c;border:1px solid #fecaca;border-radius:8px;background:#fef2f2;">` +
    `<strong style="display:block;margin-bottom:4px;">Lỗi khối hình "${esc(type)}" — không thể vẽ</strong>` +
    (items ? `<ul style="margin:0;padding-left:16px;">${items}</ul>` : `<div>${esc(formatDiagnostics(diagnostics).join('\n'))}</div>`) +
    `</div></div>`
}

function esc(value) {
  if (value === null || value === undefined) return ''
  return String(value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
}
