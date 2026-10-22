/**
 * diagram-renderer.js — Facade biên dịch khối hình (giữ tương thích API cũ).
 *
 * Hỗ trợ: Bảng biến thiên (bbt), Đồ thị hàm số (graph), Hình không gian (geo3d),
 * Công thức cấu tạo (smiles).
 *
 * - Toán học (bbt/graph/geo3d) nằm trong thư mục ./diagrams (module thuần, test được).
 * - Biểu thức KHÔNG dùng eval / new Function.
 * - Lỗi trả về dạng hộp thông báo có cấu trúc (kèm mã lỗi), không che bằng
 *   thông báo chung chung.
 */

import { compileDiagram, formatDiagnostics } from './diagrams/compiler.js'
import { collectDiagramBlocks } from './diagrams/fence.js'

let diagramUid = 0

/**
 * Biên dịch khối hình → HTML (API cũ, giữ nguyên hành vi cho caller hiện có).
 * @param {string} type bbt | graph | geo3d | smiles
 * @param {string} code nội dung khối
 * @returns {string} HTML
 */
export function compileDiagramToSVG(type, code) {
  diagramUid += 1
  const kind = String(type || '').toLowerCase()

  if (kind === 'smiles') {
    return renderSmilesBlock(code, diagramUid)
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
  if (kind === 'smiles') {
    return {
      ok: true,
      model: null,
      svg: renderSmilesBlock(code, diagramUid),
      diagnostics: []
    }
  }
  return compileDiagram(kind, code, { ...ctx, uid: diagramUid })
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
    if (b.type === 'smiles') return
    const res = compileDiagramWithDiagnostics(b.type, b.code, { line: b.startLine })
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

/* ==========================================================================
 * CÔNG THỨC CẤU TẠO HÓA HỌC 2D (SMILES) — giữ nguyên hành vi cũ
 * ========================================================================== */
function renderSmilesBlock(smilesCode, uid) {
  const svgId = `smiles-svg-${uid}`
  setTimeout(() => {
    try {
      const el = document.getElementById(svgId)
      if (el && window.SmilesDrawer) {
        const drawer = new window.SmilesDrawer.SvgDrawer({ width: 220, height: 140 })
        window.SmilesDrawer.parse(smilesCode, (tree) => {
          drawer.draw(tree, `#${svgId}`, 'light', false)
        })
      }
    } catch (e) {
      console.error('[DiagramRenderer] SmilesDrawer failed:', e)
    }
  }, 0)

  return `<span class="diagram-wrap" style="display:inline-flex;align-items:center;justify-content:center;margin:4px 8px;vertical-align:middle;">` +
    `<svg id="${svgId}" width="220" height="140" style="background:#fff;border-radius:6px;" data-smiles="${String(smilesCode || '').replace(/"/g, '&quot;')}"></svg></span>`
}
