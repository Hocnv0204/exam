/**
 * graph.js — Đồ thị hàm số.
 *
 * Nguyên tắc (đã kiểm chứng bằng test):
 *  - Biểu thức được đánh giá bằng AST an toàn (không eval/new Function).
 *  - Miền xét (domain) tách khỏi cửa sổ nhìn (viewport).
 *  - Lấy mẫu THÍCH ỨNG theo sai số màn hình; bắt buộc chia tại điểm chia (breaks),
 *    biên miền và các điểm không xác định (cực, lỗ thủng, biên căn, điểm 0 của log).
 *  - Không nối qua vùng không hợp lệ.
 *  - scale "equal" giữ cùng pixel/đơn vị cho hai trục (letterbox), không méo hình.
 *  - Điểm thuộc đường cong: lấy y từ hàm (không nhập tọa độ tự do rồi giả là nằm trên đồ thị).
 */

import { diagramWrap, foreignLabel, axisMarker, escapeXml, r2 } from './svg.js'
import { evaluate, isDefinedAt } from './expression.js'

const WIDTH = 380
const HEIGHT = 300
const M_LEFT = 42
const M_RIGHT = 20
const M_TOP = 18
const M_BOTTOM = 36

const PLOT_X0 = M_LEFT
const PLOT_X1 = WIDTH - M_RIGHT
const PLOT_Y0 = M_TOP
const PLOT_Y1 = HEIGHT - M_BOTTOM
const PLOT_W = PLOT_X1 - PLOT_X0
const PLOT_H = PLOT_Y1 - PLOT_Y0

const CURVE_COLORS = ['#0f172a', '#b91c1c', '#0369a1', '#15803d', '#7c3aed', '#c2410c']
const PIXEL_TOLERANCE = 0.4
const MAX_DEPTH = 14
const MAX_POINTS = 8000

/** Bước chia "đẹp" cho tick trục. */
function niceStep(range, target = 6) {
  if (!(range > 0)) return 1
  const raw = range / target
  const mag = Math.pow(10, Math.floor(Math.log10(raw)))
  const norm = raw / mag
  let mult
  if (norm < 1.5) mult = 1
  else if (norm < 3) mult = 2
  else if (norm < 7) mult = 5
  else mult = 10
  return mult * mag
}

function formatTick(value) {
  if (Math.abs(value) < 1e-10) return '0'
  const rounded = Math.round(value * 1e6) / 1e6
  if (Number.isInteger(rounded)) return String(rounded)
  return String(Number(rounded.toPrecision(8)))
}

/**
 * Ánh xạ viewport (toạ độ toán) → pixel.
 *  - scale 'free': mỗi trục một tỷ lệ riêng.
 *  - scale 'equal': cùng pixel/đơn vị cho hai trục, dùng letterbox nếu cần
 *    (cửa sổ khai báo không bị đổi, chỉ là phần hiển thị bị thu nhỏ).
 */
export function buildViewportMapping(viewport, scaleMode = 'free') {
  const vp = viewport
  let xVis, yVis, sx, sy
  if (scaleMode === 'equal') {
    const s = Math.min(PLOT_W / (vp.x[1] - vp.x[0]), PLOT_H / (vp.y[1] - vp.y[0]))
    sx = s
    sy = s
    const cx = (vp.x[0] + vp.x[1]) / 2
    const cy = (vp.y[0] + vp.y[1]) / 2
    xVis = [cx - PLOT_W / (2 * s), cx + PLOT_W / (2 * s)]
    yVis = [cy - PLOT_H / (2 * s), cy + PLOT_H / (2 * s)]
  } else {
    xVis = [vp.x[0], vp.x[1]]
    yVis = [vp.y[0], vp.y[1]]
    sx = PLOT_W / (vp.x[1] - vp.x[0])
    sy = PLOT_H / (vp.y[1] - vp.y[0])
  }
  return {
    xVis, yVis, sx, sy, scaleMode,
    toX: (x) => PLOT_X0 + (x - xVis[0]) * sx,
    toY: (y) => PLOT_Y1 - (y - yVis[0]) * sy
  }
}

/**
 * Vẽ đồ thị.
 * @param {object} model
 * @param {number} uid
 * @param {Array} diagnostics
 */
export function renderGraph(model, uid, diagnostics = []) {
  const map = buildViewportMapping(model.viewport, model.scale || 'free')
  const { xVis, yVis, sx, sy } = map
  const toX = map.toX
  const toY = map.toY

  const clipId = `graph-clip-${uid}`
  const arrowId = `graph-arrow-${uid}`

  /* ================= trục & lưới ================= */
  let svg = `<svg width="${WIDTH}" height="${HEIGHT}" viewBox="0 0 ${WIDTH} ${HEIGHT}" style="background:#fff;border:1px solid #cbd5e1;border-radius:6px;max-width:100%;">`
  svg += `<defs>${axisMarker(arrowId)}<clipPath id="${clipId}"><rect x="${PLOT_X0}" y="${PLOT_Y0}" width="${PLOT_W}" height="${PLOT_H}"/></clipPath></defs>`

  const originX = toX(0)
  const originY = toY(0)
  const xAxisVisible = originY >= PLOT_Y0 - 0.5 && originY <= PLOT_Y1 + 0.5
  const yAxisVisible = originX >= PLOT_X0 - 0.5 && originX <= PLOT_X1 + 0.5

  // tick trục hoành
  const xStep = niceStep(xVis[1] - xVis[0], 6)
  const yStep = niceStep(yVis[1] - yVis[0], 5)
  const ticks = []
  if (xStep > 0) {
    for (let v = Math.ceil(xVis[0] / xStep) * xStep; v <= xVis[1] + 1e-9; v += xStep) {
      if (Math.abs(v) < 1e-9) continue
      ticks.push({ axis: 'x', v, px: toX(v) })
    }
  }
  if (yStep > 0) {
    for (let v = Math.ceil(yVis[0] / yStep) * yStep; v <= yVis[1] + 1e-9; v += yStep) {
      if (Math.abs(v) < 1e-9) continue
      ticks.push({ axis: 'y', v, py: toY(v) })
    }
  }

  ticks.forEach(t => {
    if (t.axis === 'x') {
      if (t.px < PLOT_X0 - 1 || t.px > PLOT_X1 + 1) return
      if (xAxisVisible) {
        svg += `<line x1="${r2(t.px)}" y1="${r2(originY - 3)}" x2="${r2(t.px)}" y2="${r2(originY + 3)}" stroke="#94a3b8" stroke-width="1"/>`
        const labelY = originY + 20 <= HEIGHT ? originY + 2 : originY - 20
        svg += foreignLabel(t.px - 22, labelY, 44, 18, formatTick(t.v), { fontSize: 10 })
      }
    } else {
      if (t.py < PLOT_Y0 - 1 || t.py > PLOT_Y1 + 1) return
      if (yAxisVisible) {
        svg += `<line x1="${r2(originX - 3)}" y1="${r2(t.py)}" x2="${r2(originX + 3)}" y2="${r2(t.py)}" stroke="#94a3b8" stroke-width="1"/>`
        const labelX = originX - 40 >= 0 ? originX - 40 : originX + 4
        svg += foreignLabel(labelX, t.py - 9, 36, 18, formatTick(t.v), { fontSize: 10, justify: labelX < originX ? 'flex-end' : 'flex-start' })
      }
    }
  })

  // trục
  if (xAxisVisible) {
    svg += `<line x1="${r2(PLOT_X0 - 12)}" y1="${r2(originY)}" x2="${r2(PLOT_X1 + 12)}" y2="${r2(originY)}" stroke="#0f172a" stroke-width="1.3" marker-end="url(#${arrowId})"/>`
  }
  if (yAxisVisible) {
    svg += `<line x1="${r2(originX)}" y1="${r2(PLOT_Y1 + 10)}" x2="${r2(originX)}" y2="${r2(PLOT_Y0 - 10)}" stroke="#0f172a" stroke-width="1.3" marker-end="url(#${arrowId})"/>`
  }
  if (xAxisVisible) {
    svg += foreignLabel(PLOT_X1 + 6, originY - 12, 22, 20, 'x', { fontSize: 12 })
  }
  if (yAxisVisible) {
    svg += foreignLabel(originX + 5, PLOT_Y0 - 16, 22, 20, 'y', { fontSize: 12 })
  }
  if (xAxisVisible && yAxisVisible) {
    svg += foreignLabel(originX - 20, originY + 2, 18, 18, 'O', { fontSize: 11 })
  }

  /* ================= tiệm cận ================= */
  const asymptoteSvg = []
  model.asymptotes.forEach(as => {
    if (as.axis === 'x') {
      const px = toX(as.value)
      if (px < PLOT_X0 - 40 || px > PLOT_X1 + 40) return
      asymptoteSvg.push(`<line x1="${r2(px)}" y1="${PLOT_Y0}" x2="${r2(px)}" y2="${PLOT_Y1}" stroke="#64748b" stroke-width="1.1" stroke-dasharray="6,4" clip-path="url(#${clipId})"/>`)
      if (as.label) {
        asymptoteSvg.push(foreignLabel(px - 26, PLOT_Y0 + 2, 52, 18, as.label, { fontSize: 10 }))
      }
    } else {
      const y1 = as.affine.a * xVis[0] + as.affine.b
      const y2 = as.affine.a * xVis[1] + as.affine.b
      asymptoteSvg.push(`<line x1="${r2(toX(xVis[0]))}" y1="${r2(toY(y1))}" x2="${r2(toX(xVis[1]))}" y2="${r2(toY(y2))}" stroke="#64748b" stroke-width="1.1" stroke-dasharray="6,4" clip-path="url(#${clipId})"/>`)
      if (as.label) {
        asymptoteSvg.push(foreignLabel(PLOT_X1 - 60, toY(y2) - 20, 58, 18, as.label, { fontSize: 10 }))
      }
    }
  })
  svg += asymptoteSvg.join('')

  /* ================= đường cong ================= */
  model.curves.forEach((curve, ci) => {
    const color = CURVE_COLORS[ci % CURVE_COLORS.length]
    const paths = []
    curve.domain.forEach(iv => {
      const segs = sampleCurve(curve, iv, xVis, toX, toY, diagnostics)
      segs.forEach(seg => {
        if (seg.length < 2) return
        let d = ''
        seg.forEach((p, i) => {
          const px = clamp(toX(p.x), PLOT_X0 - 4 * PLOT_W, PLOT_X1 + 4 * PLOT_W)
          const py = clamp(toY(p.y), PLOT_Y0 - 4 * PLOT_H, PLOT_Y1 + 4 * PLOT_H)
          d += `${i === 0 ? 'M' : 'L'} ${r2(px)} ${r2(py)} `
        })
        paths.push(`<path d="${d.trim()}" fill="none" stroke="${color}" stroke-width="1.9" stroke-linejoin="round" stroke-linecap="round" clip-path="url(#${clipId})"/>`)
      })
    })
    svg += paths.join('')

    // Mũi tên trên đường cong chưa dùng; nhãn đường cong (nếu có)
    if (curve.label) {
      svg += foreignLabel(PLOT_X1 - 70, PLOT_Y0 + 2, 68, 18, curve.label, { fontSize: 10.5, justify: 'flex-end' })
    }
  })

  /* ================= điểm ================= */
  const pointData = []
  model.points.forEach(p => {
    let px, py
    let y = p.y
    if (p.kind === 'curve') {
      const curve = model.curves.find(c => c.id === p.curveId)
      if (!curve) return
      y = evaluate(curve.ast, p.x)
      if (!Number.isFinite(y)) {
        diagnostics.push({
          severity: 'error',
          code: 'GRAPH_POINT_NOT_ON_CURVE',
          field: 'points',
          line: null,
          message: `Điểm x = ${p.x} không nằm trên đường cong "${curve.id}" (hàm không xác định tại đó).`
        })
        return
      }
    }
    px = toX(p.x)
    py = toY(y)
    pointData.push({ p, px, py, y })

    if (p.guides && xAxisVisible && yAxisVisible) {
      if (Math.abs(p.x) > 1e-12) {
        svg += `<line x1="${r2(px)}" y1="${r2(py)}" x2="${r2(px)}" y2="${r2(originY)}" stroke="#94a3b8" stroke-width="0.9" stroke-dasharray="3,3" clip-path="url(#${clipId})"/>`
      }
      if (Math.abs(y) > 1e-12) {
        svg += `<line x1="${r2(px)}" y1="${r2(py)}" x2="${r2(originX)}" y2="${r2(py)}" stroke="#94a3b8" stroke-width="0.9" stroke-dasharray="3,3" clip-path="url(#${clipId})"/>`
      }
    }
  })

  pointData.forEach(({ p, px, py }) => {
    if (p.marker === 'open') {
      svg += `<circle cx="${r2(px)}" cy="${r2(py)}" r="3.4" fill="#ffffff" stroke="#0f172a" stroke-width="1.3"/>`
    } else {
      svg += `<circle cx="${r2(px)}" cy="${r2(py)}" r="2.8" fill="#0f172a"/>`
    }
    if (p.label) {
      svg += foreignLabel(px + 6, py - 20, 70, 20, p.label, { fontSize: 11, justify: 'flex-start', align: 'left' })
    }
  })

  svg += `</svg>`
  return diagramWrap(svg)
}

function clamp(v, lo, hi) {
  if (!Number.isFinite(v)) return lo
  return Math.min(hi, Math.max(lo, v))
}

/**
 * Lấy mẫu một khoảng miền, trả về mảng các polyline (mỗi polyline là mảng {x,y}).
 * Không nối qua vùng hàm không xác định.
 */
export function sampleCurve(curve, interval, xVis, toX, toY, diagnostics = []) {
  const ast = curve.ast
  const lo = Math.max(interval.from, xVis[0])
  const hi = Math.min(interval.to, xVis[1])
  if (!(lo < hi)) {
    if (lo === hi && interval.closed[0] && interval.closed[1]) {
      const y = safeEval(ast, lo)
      if (y !== null) return [[{ x: lo, y }]]
    }
    return []
  }

  // --- Điểm chia bắt buộc: nghiệm của các biểu thức ràng buộc miền + breaks khai báo ---
  const cutSet = new Set([lo, hi])
  collectGuards(ast).forEach(g => {
    findRoots(g.expr, lo, hi).forEach(r => {
      if (r > lo && r < hi) cutSet.add(r)
    })
  })
  curve.breaks.forEach(b => {
    if (b > lo && b < hi) cutSet.add(b)
  })
  const cuts = Array.from(cutSet).sort((a, b) => a - b)

  const segments = []
  for (let i = 0; i < cuts.length - 1; i++) {
    const s = cuts[i]
    const e = cuts[i + 1]
    const mid = (s + e) / 2
    // Định nghĩa hằng số trên mỗi đoạn giữa hai điểm chia ⇒ kiểm tra midpoint
    if (!isDefinedAt(ast, mid)) continue

    let s2 = s
    let e2 = e
    if (!isDefinedAt(ast, s)) s2 = findDefinedStart(ast, s, mid)
    if (!isDefinedAt(ast, e)) e2 = findDefinedEnd(ast, mid, e)
    if (!(s2 < e2)) continue

    const pts = flatten(ast, s2, e2, toX, toY, 0, [], diagnostics)
    pushPoints(segments, pts)
  }

  // Đầu mút đóng / mở
  const out = segments.filter(s => s && s.length)
  if (interval.closed[0] === false && out.length) out[0].shift()
  if (interval.closed[1] === false && out.length) out[out.length - 1].pop()
  return out.filter(s => s.length >= 2)
}

/**
 * Thu thập các biểu thức ràng buộc miền xác định:
 *  - mẫu số ≠ 0,  - căn bậc hai: u ≥ 0,  - ln/log: u > 0,  - tan: cos(u) ≠ 0.
 */
export function collectGuards(ast, out = []) {
  switch (ast.type) {
    case 'binary':
      if (ast.op === '/') out.push({ expr: ast.right, kind: 'ne0' })
      else if (ast.op === '^') {
        const exp = ast.right
        if (exp.type === 'number' && !Number.isInteger(exp.value)) {
          out.push({ expr: ast.left, kind: 'ge0' })
        }
      }
      collectGuards(ast.left, out)
      collectGuards(ast.right, out)
      break
    case 'call':
      if (ast.name === 'sqrt') out.push({ expr: ast.args[0], kind: 'ge0' })
      else if (ast.name === 'ln' || ast.name === 'log') out.push({ expr: ast.args[0], kind: 'gt0' })
      else if (ast.name === 'tan') {
        out.push({ expr: { type: 'call', name: 'cos', args: [ast.args[0]] }, kind: 'ne0' })
      }
      ast.args.forEach(a => collectGuards(a, out))
      break
    case 'unary':
      collectGuards(ast.arg, out)
      break
    default:
      break
  }
  return out
}

/** Tìm nghiệm của biểu thức trong [a,b] bằng quét + bisection. */
export function findRoots(expr, a, b, samples = 400) {
  const roots = []
  const step = (b - a) / samples
  let prevX = a
  let prevY = guardValue(expr, a)
  for (let i = 1; i <= samples; i++) {
    const x = a + i * step
    const y = guardValue(expr, x)
    if (Number.isFinite(y) && y === 0) {
      roots.push(x)
    } else if (Number.isFinite(prevY) && Number.isFinite(y) && prevY * y < 0) {
      let lo = prevX
      let hi = x
      let flo = prevY
      for (let k = 0; k < 60; k++) {
        const m = (lo + hi) / 2
        const fm = guardValue(expr, m)
        if (!Number.isFinite(fm)) break
        if (flo * fm <= 0) hi = m
        else { lo = m; flo = fm }
      }
      roots.push((lo + hi) / 2)
    }
    prevX = x
    prevY = y
  }
  return roots
}

function guardValue(expr, x) {
  if (!isDefinedAt(expr, x)) return NaN
  const v = evaluate(expr, x)
  return Number.isFinite(v) ? v : NaN
}

/** Biên trái của vùng xác định (x0 chưa xác định, x1 đã xác định). */
function findDefinedStart(ast, x0, x1) {
  let lo = x0
  let hi = x1
  for (let k = 0; k < 60; k++) {
    const m = (lo + hi) / 2
    if (isDefinedAt(ast, m)) hi = m
    else lo = m
  }
  return hi
}

/** Biên phải của vùng xác định (x0 đã xác định, x1 chưa xác định). */
function findDefinedEnd(ast, x0, x1) {
  let lo = x0
  let hi = x1
  for (let k = 0; k < 60; k++) {
    const m = (lo + hi) / 2
    if (isDefinedAt(ast, m)) lo = m
    else hi = m
  }
  return lo
}

function pushPoints(segments, pts) {
  let current = []
  pts.forEach(p => {
    if (p.y === null) {
      if (current.length) segments.push(current)
      current = []
    } else {
      current.push(p)
    }
  })
  if (current.length) segments.push(current)
}

function safeEval(ast, x) {
  if (!isDefinedAt(ast, x)) return null
  const y = evaluate(ast, x)
  if (!Number.isFinite(y)) return null
  return y
}

/**
 * Đệ quy làm mượt đoạn [x0,x1]: thêm điểm vào `out`, y === null nghĩa là ngắt.
 */
function flatten(ast, x0, x1, toX, toY, depth, out, diagnostics) {
  if (out.length > MAX_POINTS) return out
  const y0 = safeEval(ast, x0)
  const y1 = safeEval(ast, x1)

  if (y0 === null && y1 === null) {
    out.push({ x: x0, y: null })
    return out
  }

  const xm = (x0 + x1) / 2
  const ym = safeEval(ast, xm)

  if (y0 === null || y1 === null || ym === null) {
    // Tìm chính xác biên của vùng không xác định rồi vẽ từng nhánh hợp lệ
    if (y0 === null && y1 !== null) {
      const start = findDefinedStart(ast, x0, x1)
      out.push({ x: x0, y: null })
      flatten(ast, start, x1, toX, toY, depth + 1, out, diagnostics)
      return out
    }
    if (y0 !== null && y1 === null) {
      const end = findDefinedEnd(ast, x0, x1)
      flatten(ast, x0, end, toX, toY, depth + 1, out, diagnostics)
      out.push({ x: x1, y: null })
      return out
    }
    // cả hai đầu hợp lệ nhưng giữa có vùng không xác định
    if (depth >= MAX_DEPTH) {
      out.push({ x: x0, y: null })
      return out
    }
    const left = findDefinedEnd(ast, x0, xm)
    const right = findDefinedStart(ast, xm, x1)
    flatten(ast, x0, left, toX, toY, depth + 1, out, diagnostics)
    out.push({ x: left, y: null })
    flatten(ast, right, x1, toX, toY, depth + 1, out, diagnostics)
    return out
  }

  const p0 = testPx(toX(x0), toY(y0))
  const pm = testPx(toX(xm), toY(ym))
  const p1 = testPx(toX(x1), toY(y1))
  const dev = pointLineDistance(pm, p0, p1)
  const jump = Math.hypot(p1.x - p0.x, p1.y - p0.y)
  const jumpTol = 6 * Math.hypot(PLOT_W, PLOT_H)

  if (depth < MAX_DEPTH && (dev > PIXEL_TOLERANCE || jump > jumpTol)) {
    flatten(ast, x0, xm, toX, toY, depth + 1, out, diagnostics)
    flatten(ast, xm, x1, toX, toY, depth + 1, out, diagnostics)
    return out
  }

  out.push({ x: x0, y: y0 })
  out.push({ x: x1, y: y1 })
  return out
}

/** Toạ độ pixel "mềm" (kẹp) để đo sai số mà không bị lệch vì giá trị ngoài khung. */
function testPx(px, py) {
  return {
    x: clamp(px, PLOT_X0 - 3 * PLOT_W, PLOT_X1 + 3 * PLOT_W),
    y: clamp(py, PLOT_Y0 - 3 * PLOT_H, PLOT_Y1 + 3 * PLOT_H)
  }
}

function pointLineDistance(p, a, b) {
  const dx = b.x - a.x
  const dy = b.y - a.y
  const len = Math.hypot(dx, dy)
  if (len < 1e-9) return Math.hypot(p.x - a.x, p.y - a.y)
  return Math.abs((p.x - a.x) * dy - (p.y - a.y) * dx) / len
}
