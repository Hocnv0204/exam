/**
 * bbt.js — Bảng biến thiên / bảng xét dấu (BBT).
 *
 * Nguyên tắc hình học (đã kiểm chứng bằng test):
 *  - N mốc ⇒ N-1 khoảng. Mọi hàng (x, f', f) dùng CHUNG một lưới neo
 *    anchorX[i]; dấu của khoảng nằm giữa hai neo, giá trị tại mốc nằm đúng neo.
 *  - Chiều mũi tên suy từ dấu khoảng (V2) hoặc từ mũi tên khai báo (legacy),
 *    không phải từ hai nguồn sự thật trái ngược.
 *  - Gián đoạn (nhảy) ⇒ vẽ đường đôi, KHÔNG nối mũi tên qua mốc đó.
 *  - Đạo hàm không tồn tại (undefined) nhưng hàm liên tục ⇒ không vẽ đường đôi.
 *  - Bảng chỉ xét dấu (không có hàng giá trị) ⇒ không tự thêm hàng y.
 */

import { diagramWrap, foreignLabel, arrowMarker, escapeXml, r2 } from './svg.js'

const ROW_X_HEIGHT = 34
const ROW_DERIV_HEIGHT = 42
const ROW_VALUE_HEIGHT = 118
const COL_WIDTH = 96
const PADDING = 12
const JUMP_OFFSET = 11   // lệch ngang của hai giới hạn quanh đường đôi
const HOLE_OFFSET = 9

/** Nhãn hiển thị cho giá trị vô cực. */
function valueLabel(v) {
  if (!v) return ''
  if (v.kind === 'inf') return v.inf > 0 ? '+\\infty' : '-\\infty'
  if (v.kind === 'number') return v.text
  return ''
}

/** Nhãn hiển thị cho mốc (vô cực viết bằng \infty). */
function knotLabel(k) {
  if (!k) return ''
  if (k.inf === 1) return '+\\infty'
  if (k.inf === -1) return '-\\infty'
  return k.text
}

/** Chiều mũi tên của khoảng i. */
function intervalDirection(model, i) {
  if (model.arrows && model.arrows[i]) return model.arrows[i]
  const s = model.signs[i]
  if (s === '+') return 'up'
  if (s === '-') return 'down'
  if (s === '0') return 'flat'
  return 'none'
}

/**
 * Vẽ bảng BBT từ model nội bộ.
 * @param {object} model
 * @param {number} uid  (dùng để sinh ID duy nhất cho marker)
 * @param {Array} diagnostics (mảng diagnostics được push thêm nếu có)
 */
export function renderBBT(model, uid, diagnostics = []) {
  const knots = model.knots
  const N = knots.length
  const hasValueRow = !!model.hasValueRow

  const labels = model.labels || { x: 'x', derivative: "f'(x)", value: 'f(x)' }
  const labelTexts = [labels.x, labels.derivative, hasValueRow ? labels.value : null].filter(Boolean)
  const longestLabel = labelTexts.reduce((m, l) => Math.max(m, String(l).length), 1)
  const labelColWidth = Math.max(66, longestLabel * 9 + 26)

  const width = labelColWidth + N * COL_WIDTH + PADDING
  const valueTop = ROW_X_HEIGHT + ROW_DERIV_HEIGHT
  const height = valueTop + (hasValueRow ? ROW_VALUE_HEIGHT : 0) + PADDING

  const anchorX = (i) => labelColWidth + COL_WIDTH * (i + 0.5)
  const midX = (i) => (anchorX(i) + anchorX(i + 1)) / 2

  /* ---- Thang đo giá trị ---- */
  const yTop = valueTop + 16
  const yBot = valueTop + ROW_VALUE_HEIGHT - 18
  const bandH = yBot - yTop

  const finiteLevels = []
  if (hasValueRow) {
    knots.forEach((_, i) => {
      const v = model.values[i]
      if (!v) return
      if (v.kind === 'jump') {
        if (Number.isFinite(v.left.num)) finiteLevels.push(v.left.num)
        if (Number.isFinite(v.right.num)) finiteLevels.push(v.right.num)
      } else if (v.kind === 'hole') {
        if (v.limit && Number.isFinite(v.limit.num)) finiteLevels.push(v.limit.num)
      } else if (Number.isFinite(v.num)) {
        finiteLevels.push(v.num)
      }
    })
  }
  const hasInfinity = hasValueRow && model.values.some(v => v && (v.kind === 'inf' || (v.kind === 'jump' && (v.left.inf !== 0 || v.right.inf !== 0))))
  const bandTop = yTop + bandH * (hasInfinity ? 0.30 : 0.16)
  const bandBottom = yBot - bandH * (hasInfinity ? 0.30 : 0.16)

  const minFinite = finiteLevels.length ? Math.min(...finiteLevels) : 0
  const maxFinite = finiteLevels.length ? Math.max(...finiteLevels) : 0
  const span = maxFinite - minFinite

  /** Tọa độ y (pixel) của một giá trị đã chuẩn hóa. */
  const levelY = (v) => {
    if (!v) return null
    if (v.kind === 'inf') return v.inf > 0 ? yTop : yBot
    if (!Number.isFinite(v.num)) return null
    if (span <= 0) return (bandTop + bandBottom) / 2
    const t = (v.num - minFinite) / span
    return bandBottom - t * (bandBottom - bandTop)
  }

  /* ---- Điểm đầu/cuối mỗi khoảng (xử lý gián đoạn & lỗ thủng) ---- */
  const startPoint = (i) => {
    const v = model.values[i]
    if (!v) return null
    if (v.kind === 'jump') return { x: anchorX(i) + JUMP_OFFSET, y: levelY(v.right), limit: 'right' }
    if (v.kind === 'hole') return { x: anchorX(i) + HOLE_OFFSET, y: levelY(v.limit), limit: 'hole' }
    return { x: anchorX(i), y: levelY(v), limit: null }
  }
  const endPoint = (i) => {
    const v = model.values[i]
    if (!v) return null
    if (v.kind === 'jump') return { x: anchorX(i) - JUMP_OFFSET, y: levelY(v.left), limit: 'left' }
    if (v.kind === 'hole') return { x: anchorX(i) - HOLE_OFFSET, y: levelY(v.limit), limit: 'hole' }
    return { x: anchorX(i), y: levelY(v), limit: null }
  }

  /* ---- SVG ---- */
  const arrowId = `bbt-arrow-${uid}`
  let svg = `<svg width="${width}" height="${height}" viewBox="0 0 ${width} ${height}" style="background:#fff;border:1px solid #0f172a;border-radius:6px;max-width:100%;">`
  svg += `<defs>${arrowMarker(arrowId)}</defs>`
  svg += `<line x1="${r2(labelColWidth)}" y1="0" x2="${r2(labelColWidth)}" y2="${r2(height)}" stroke="#0f172a" stroke-width="1.2"/>`
  svg += `<line x1="0" y1="${ROW_X_HEIGHT}" x2="${r2(width)}" y2="${ROW_X_HEIGHT}" stroke="#0f172a" stroke-width="1.2"/>`
  if (hasValueRow) {
    svg += `<line x1="0" y1="${valueTop}" x2="${r2(width)}" y2="${valueTop}" stroke="#0f172a" stroke-width="1.2"/>`
  }

  /* Nhãn cột */
  svg += foreignLabel(0, 4, labelColWidth, ROW_X_HEIGHT - 8, labels.x, { fontSize: 13, math: true })
  svg += foreignLabel(0, ROW_X_HEIGHT + 4, labelColWidth, ROW_DERIV_HEIGHT - 8, labels.derivative, { fontSize: 13, math: true })
  if (hasValueRow) {
    svg += foreignLabel(0, valueTop + 6, labelColWidth, 30, labels.value, { fontSize: 13, math: true })
  }

  /* Hàng x */
  knots.forEach((k, i) => {
    svg += foreignLabel(anchorX(i) - 40, 4, 80, ROW_X_HEIGHT - 8, knotLabel(k), { fontSize: 12.5, math: true })
  })

  /* Hàng đạo hàm: dấu khoảng ở giữa, giá trị tại mốc */
  for (let i = 0; i < N - 1; i++) {
    const sign = model.signs[i]
    if (sign === 'none') continue
    const text = sign === '+' ? '+' : (sign === '-' ? '-' : '0')
    svg += foreignLabel(midX(i) - 26, ROW_X_HEIGHT + 6, 52, ROW_DERIV_HEIGHT - 12, text, { fontSize: 13, math: true })
  }
  for (let i = 0; i < N; i++) {
    const d = model.derivativeAt[i]
    if (!d) continue
    let text = ''
    if (d.kind === 'zero') text = '0'
    else if (d.kind === 'nonzero') text = d.sign ? d.sign : '\\neq 0'
    else if (d.kind === 'undefined') text = 'không xác định'
    if (!text) continue
    const isText = d.kind === 'undefined'
    svg += foreignLabel(anchorX(i) - 44, ROW_X_HEIGHT + 6, 88, ROW_DERIV_HEIGHT - 12, text, {
      fontSize: isText ? 10.5 : 11.5,
      math: !isText
    })
  }

  if (hasValueRow) {
    /* Đường đôi tại các mốc gián đoạn */
    for (let i = 0; i < N; i++) {
      const v = model.values[i]
      if (!v || v.kind !== 'jump') continue
      svg += `<line x1="${r2(anchorX(i) - 3)}" y1="${r2(yTop - 6)}" x2="${r2(anchorX(i) - 3)}" y2="${r2(yBot + 6)}" stroke="#0f172a" stroke-width="1.1"/>`
      svg += `<line x1="${r2(anchorX(i) + 3)}" y1="${r2(yTop - 6)}" x2="${r2(anchorX(i) + 3)}" y2="${r2(yBot + 6)}" stroke="#0f172a" stroke-width="1.1"/>`
    }

    /* Lỗ thủng: vẽ điểm rỗng */
    for (let i = 0; i < N; i++) {
      const v = model.values[i]
      if (!v || v.kind !== 'hole') continue
      const y = levelY(v.limit)
      if (y === null) continue
      svg += `<circle cx="${r2(anchorX(i))}" cy="${r2(y)}" r="3.4" fill="#ffffff" stroke="#0f172a" stroke-width="1.2"/>`
    }

    /* Các đoạn/mũi tên của hàng giá trị */
    for (let i = 0; i < N - 1; i++) {
      const dir = intervalDirection(model, i)
      if (dir === 'none') continue
      const a = startPoint(i)
      const b = endPoint(i + 1)
      if (!a || !b || a.y === null || b.y === null) continue

      const dx = b.x - a.x
      const dy = b.y - a.y
      const dist = Math.hypot(dx, dy) || 1
      const pad = Math.min(22, dist * 0.25)
      const x1 = a.x + (dx / dist) * pad
      const y1 = a.y + (dy / dist) * pad
      const x2 = b.x - (dx / dist) * pad
      const y2 = b.y - (dy / dist) * pad

      // hướng khai báo vs hình học thực tế
      const geoDir = dy < -0.5 ? 'up' : (dy > 0.5 ? 'down' : 'flat')
      let markerEnd = ''
      if (dir === 'flat') {
        markerEnd = ''
      } else if (dir === geoDir) {
        markerEnd = ` marker-end="url(#${arrowId})"`
      } else {
        // Dữ liệu mâu thuẫn: vẽ đoạn thẳng không mũi tên (không vẽ sai hướng)
        diagnostics.push({
          severity: 'warning',
          code: 'BBT_RENDER_DIRECTION_CONFLICT',
          field: 'values',
          line: null,
          message: `Khoảng (${model.knots[i].text}, ${model.knots[i + 1].text}): chiều mũi tên khai báo (${dir}) không khớp với chiều giá trị thực (${geoDir}) — đã vẽ đoạn thẳng không mũi tên. Hãy sửa dữ liệu.`
        })
      }
      svg += `<line x1="${r2(x1)}" y1="${r2(y1)}" x2="${r2(x2)}" y2="${r2(y2)}" stroke="#0f172a" stroke-width="1.3"${markerEnd} />`
    }

    /* Nhãn giá trị tại các mốc */
    for (let i = 0; i < N; i++) {
      const v = model.values[i]
      if (!v) continue
      if (v.kind === 'jump') {
        const yl = levelY(v.left)
        const yr = levelY(v.right)
        if (yl !== null) {
          svg += foreignLabel(anchorX(i) - 76, yl - 11, 68, 22, valueLabel(v.left), { fontSize: 12, align: 'right', justify: 'flex-end', math: true })
        }
        if (yr !== null) {
          svg += foreignLabel(anchorX(i) + 8, yr - 11, 68, 22, valueLabel(v.right), { fontSize: 12, align: 'left', justify: 'flex-start', math: true })
        }
        continue
      }
      if (v.kind === 'hole') continue
      const y = levelY(v)
      if (y === null) continue
      svg += foreignLabel(anchorX(i) - 40, y - 11, 80, 22, valueLabel(v), { fontSize: 12, math: true })
    }
  }

  svg += `</svg>`
  return diagramWrap(svg)
}
