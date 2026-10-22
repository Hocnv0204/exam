/**
 * svg.js — Tiện ích SVG dùng chung cho các khối hình toán.
 *
 * Nguyên tắc:
 *  - Mọi nhãn do người dùng soạn đều được escape trước khi chèn vào SVG
 *    (không đưa raw HTML vào foreignObject).
 *  - Mọi số đưa vào thuộc tính SVG phải là số hữu hạn (NaN/Infinity bị chặn).
 */

/** Escape XML cho text node / thuộc tính. */
export function escapeXml(value) {
  if (value === null || value === undefined) return ''
  return String(value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')
}

/** Escape HTML (dùng cho nội dung trong foreignObject). */
export function escapeHtml(value) {
  return escapeXml(value)
}

/** Số hữu hạn an toàn cho thuộc tính SVG. */
export function num(value, fallback = 0) {
  const n = Number(value)
  if (!Number.isFinite(n)) return fallback
  return n
}

/** Làm tròn số để SVG gọn (2 chữ số thập phân). */
export function r2(value, fallback = 0) {
  const n = num(value, fallback)
  return Math.round(n * 100) / 100
}

/**
 * Nhãn KaTeX: escape HTML rồi bọc trong $...$ để renderMath tự biên dịch.
 * Nhãn rỗng → chuỗi rỗng.
 */
export function katexLabel(text) {
  if (text === null || text === undefined) return ''
  const raw = String(text).trim()
  if (!raw) return ''
  return `$${escapeHtml(raw)}$`
}

/**
 * Chuẩn hóa nhãn toán:
 *  - số thuần → giữ nguyên (chế độ toán)
 *  - có dấu `\` → coi là LaTeX do người soạn viết (chế độ toán)
 *  - còn lại (ví dụ "sqrt(2)", "không xác định") → bọc \text{} để hiện thẳng,
 *    tránh lỗi KaTeX với ký tự tiếng Việt có dấu.
 */
export function mathLabel(text) {
  if (text === null || text === undefined) return ''
  const raw = String(text).trim()
  if (!raw) return ''
  if (/^[-+]?\d+(\.\d+)?$/.test(raw)) return raw
  if (raw.includes('\\')) return raw
  const escaped = raw
    .replace(/\\/g, '\\textbackslash{}')
    .replace(/([&%$#_{}])/g, '\\$1')
    .replace(/~/g, '\\textasciitilde{}')
    .replace(/\^/g, '\\textasciicircum{}')
  return `\\text{${escaped}}`
}

/**
 * Khối nhãn trong foreignObject (đã escape).
 * @param {number} x @param {number} y @param {number} w @param {number} h
 * @param {string} text nhãn (đã escape bên trong hàm này)
 * @param {object} opts { fontSize, align, weight, math:false để hiện text thuần }
 */
export function foreignLabel(x, y, w, h, text, opts = {}) {
  const fontSize = opts.fontSize || 12
  const align = opts.align || 'center'
  const justify = opts.justify || 'center'
  const weight = opts.weight || 'normal'
  const extra = opts.style ? `;${opts.style}` : ''
  let inner = ''
  if (opts.math === false) {
    const raw = String(text == null ? '' : text).trim()
    if (!raw) return ''
    inner = escapeHtml(raw)
  } else {
    const label = katexLabel(opts.math === true ? text : mathLabel(text))
    if (!label) return ''
    inner = label
  }
  return `<foreignObject x="${r2(x)}" y="${r2(y)}" width="${r2(Math.max(1, w))}" height="${r2(Math.max(1, h))}">` +
    `<div xmlns="http://www.w3.org/1999/xhtml" style="display:flex;align-items:center;justify-content:${justify};` +
    `text-align:${align};height:100%;font-size:${fontSize}px;font-weight:${weight};line-height:1.1;` +
    `white-space:nowrap;overflow:visible${extra};">${inner}</div></foreignObject>`
}

/** Marker mũi tên (dùng chung cho BBT). */
export function arrowMarker(id, color = '#0f172a') {
  return `<marker id="${escapeXml(id)}" viewBox="0 0 10 10" refX="8" refY="5" markerWidth="6" markerHeight="6" orient="auto-start-reverse">` +
    `<path d="M 0 1.5 L 9 5 L 0 8.5 z" fill="${escapeXml(color)}" /></marker>`
}

/** Marker mũi tên nhỏ dùng cho trục toạ độ. */
export function axisMarker(id, color = '#0f172a') {
  return `<marker id="${escapeXml(id)}" viewBox="0 0 10 10" refX="8" refY="5" markerWidth="6" markerHeight="6" orient="auto">` +
    `<path d="M 0 1.5 L 9 5 L 0 8.5 z" fill="${escapeXml(color)}" /></marker>`
}

/** Vỏ ngoài + style chung cho mọi khối hình. */
export function diagramWrap(svgInner, extraStyle = '') {
  return `<div class="diagram-wrap" style="margin:12px 0;display:flex;justify-content:center;user-select:none;${extraStyle}">${svgInner}</div>`
}

/** Hộp báo lỗi có cấu trúc (hiển thị từng diagnostic). */
export function errorBox(type, diagnostics = []) {
  const items = diagnostics.map(d =>
    `<li style="margin:2px 0;">${escapeHtml(d.code ? `[${d.code}] ` : '')}${escapeHtml(d.message || '')}</li>`
  ).join('')
  return `<div class="diagram-wrap" style="margin:12px 0;">` +
    `<div style="padding:8px 10px;font-size:12px;color:#b91c1c;border:1px solid #fecaca;border-radius:8px;background:#fef2f2;">` +
    `<strong style="display:block;margin-bottom:4px;">Lỗi khối hình "${escapeHtml(type)}" — không thể vẽ</strong>` +
    (items ? `<ul style="margin:0;padding-left:16px;">${items}</ul>` : '') +
    `</div></div>`
}
