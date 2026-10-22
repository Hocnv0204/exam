/**
 * legacy-adapter.js — Chuyển định dạng khối hình CŨ (key:value / dấu |)
 * thành model nội bộ, kèm diagnostic có ý nghĩa.
 *
 * Nguyên tắc (theo MATH_DIAGRAM_IMPROVEMENT_PLAN.md §8 P0):
 *  - Không tự bịa dữ liệu còn thiếu: phần thiếu được báo rõ, phần đọc được thì vẽ.
 *  - Không fallback âm thầm (preset không tồn tại ⇒ báo lỗi, không đổi sang hình khác).
 *  - Legacy geo3d là HÌNH SƠ ĐỒ 2D (toạ độ pixel) — không phải dựng hình 3D đúng;
 *    adapter phải nói rõ điều đó.
 */

import { makeDiagnostic, normalizeScalar } from './schema.js'
import { parseExpression, evaluate, isDefinedAt } from './expression.js'

/* ------------------------------------------------------------------ *
 * Tiện ích
 * ------------------------------------------------------------------ */

/**
 * Tách các dòng "key | value" (bbt) hoặc "key: value" (graph, geo3d) của định dạng legacy.
 * Nếu một dòng có cả hai, ưu tiên '|' (định dạng bbt).
 */
export function parseLegacyLines(code) {
  const rows = {}
  String(code || '').split('\n').forEach((rawLine) => {
    const line = rawLine.trim()
    if (!line) return
    let sep = line.indexOf('|')
    if (sep === -1) sep = line.indexOf(':')
    if (sep === -1) return
    const key = line.slice(0, sep).trim()
    const val = line.slice(sep + 1).trim()
    if (!key) return
    rows[key] = val
  })
  return rows
}

/** Tách theo dấu phẩy ở cấp ngoài cùng (không cắt trong ngoặc). */
export function splitTopLevel(text, separator = ',') {
  const out = []
  let depth = 0
  let current = ''
  for (const ch of String(text || '')) {
    if (ch === '(' || ch === '[' || ch === '{') depth++
    else if (ch === ')' || ch === ']' || ch === '}') depth--
    if (ch === separator && depth === 0) {
      out.push(current.trim())
      current = ''
    } else {
      current += ch
    }
  }
  if (current.trim()) out.push(current.trim())
  return out.filter(s => s.length)
}

/* ------------------------------------------------------------------ *
 * BBT legacy
 * ------------------------------------------------------------------ */

const UP_TOKENS = ['->', '\\nearrow', '↑', '->>', '\\to']
const DOWN_TOKENS = ['~>', '\\searrow', '↓', '~>>']

export function adaptLegacyBBT(code) {
  const diagnostics = []
  const rows = parseLegacyLines(code)
  const model = {
    kind: 'bbt',
    version: 'legacy',
    labels: { x: 'x', derivative: "f'(x)", value: 'f(x)' },
    knots: [],
    signs: [],
    derivativeAt: [],
    values: [],
    hasValueRow: false,
    arrows: null
  }

  const xKey = rows['x'] !== undefined ? 'x' : Object.keys(rows).find(k => k.toLowerCase() === 'x')
  const derivKey = ["y'", "f'(x)", 'y′'].find(k => rows[k] !== undefined)
  const valueKey = ['y', 'f(x)'].find(k => rows[k] !== undefined)

  if (!xKey) {
    diagnostics.push(makeDiagnostic('error', 'LEGACY_BBT_NO_X', 'Khối bbt legacy thiếu dòng "x | ..." (các mốc).', 'x'))
    return { model: null, diagnostics }
  }

  // ---- Dòng x: các mốc ----
  const knotTokens = splitTopLevel(rows[xKey])
  const knotValues = []
  knotTokens.forEach((tok, i) => {
    const norm = normalizeScalar(tok)
    if (!norm.ok) {
      diagnostics.push(makeDiagnostic('error', 'LEGACY_BBT_BAD_KNOT', `Mốc "${tok}" không hợp lệ: ${norm.error}.`, 'x', i + 1))
      knotValues.push(null)
    } else {
      knotValues.push(norm.value)
    }
  })
  if (knotValues.length < 2) {
    diagnostics.push(makeDiagnostic('error', 'LEGACY_BBT_BAD_KNOT', 'Dòng "x" cần ít nhất 2 mốc.', 'x'))
    return { model: null, diagnostics }
  }
  for (let i = 0; i < knotValues.length; i++) {
    const v = knotValues[i]
    if (!v) continue
    if (v.inf === 1 && i !== knotValues.length - 1) {
      diagnostics.push(makeDiagnostic('error', 'LEGACY_BBT_INF_POSITION', 'Giá trị +inf chỉ được đặt ở mốc cuối.', 'x', i + 1))
    }
    if (v.inf === -1 && i !== 0) {
      diagnostics.push(makeDiagnostic('error', 'LEGACY_BBT_INF_POSITION', 'Giá trị -inf chỉ được đặt ở mốc đầu.', 'x', i + 1))
    }
    if (i > 0 && knotValues[i - 1] && knotValues[i - 1].num >= v.num) {
      diagnostics.push(makeDiagnostic('error', 'LEGACY_BBT_KNOT_ORDER', 'Các mốc phải tăng nghiêm ngặt.', 'x', i + 1))
    }
  }
  model.knots = knotValues.map((v, i) => ({
    index: i,
    num: v ? v.num : null,
    inf: v ? v.inf : 0,
    text: v ? v.text : knotTokens[i]
  }))
  const N = knotValues.length

  // ---- Dòng y': xen kẽ dấu khoảng / giá trị tại mốc ----
  const derivativeAt = new Array(N).fill(null)
  const signs = new Array(N - 1).fill('none')
  const discontinuousKnots = new Set()

  if (derivKey) {
    const tokens = splitTopLevel(rows[derivKey])
    let ki = 0      // chỉ số mốc cho giá trị đạo hàm
    let role = 'sign'
    let signIdx = 0
    tokens.forEach((tok, ti) => {
      if (role === 'sign') {
        if (signIdx >= N - 1) {
          diagnostics.push(makeDiagnostic('error', 'LEGACY_BBT_EXTRA_TOKEN', `Dòng "${derivKey}" có thừa giá trị "${tok}".`, derivKey, ti + 1))
          return
        }
        if (tok === '||') {
          diagnostics.push(makeDiagnostic('error', 'LEGACY_BBT_BAD_SIGN', 'Dấu "||" chỉ dùng ở vị trí giá trị tại mốc, không dùng cho khoảng.', derivKey, ti + 1))
        } else if (['+', '-', '0', 'none'].includes(tok)) {
          signs[signIdx] = tok
        } else {
          diagnostics.push(makeDiagnostic('error', 'LEGACY_BBT_BAD_SIGN', `Dấu "${tok}" không hợp lệ (chỉ +, -, 0, none).`, derivKey, ti + 1))
        }
        signIdx++
        role = 'deriv'
        ki++
      } else {
        if (ki >= N - 1) {
          // giá trị tại mốc cuối cùng
          if (tok === '0') derivativeAt[N - 1] = { kind: 'zero' }
          else if (tok === '||') { derivativeAt[N - 1] = { kind: 'undefined' }; discontinuousKnots.add(N - 1) }
          else if (tok === '+' || tok === '-') derivativeAt[N - 1] = { kind: 'nonzero', sign: tok }
          else {
            diagnostics.push(makeDiagnostic('error', 'LEGACY_BBT_BAD_DERIV', `Giá trị "${tok}" tại mốc không hợp lệ.`, derivKey, ti + 1))
          }
          return
        }
        if (tok === '0') derivativeAt[ki] = { kind: 'zero' }
        else if (tok === '||') { derivativeAt[ki] = { kind: 'undefined' }; discontinuousKnots.add(ki) }
        else if (tok === '+' || tok === '-') derivativeAt[ki] = { kind: 'nonzero', sign: tok }
        else if (tok === 'none') derivativeAt[ki] = null
        else {
          diagnostics.push(makeDiagnostic('error', 'LEGACY_BBT_BAD_DERIV', `Giá trị "${tok}" tại mốc không hợp lệ (0, ||, +, -, none).`, derivKey, ti + 1))
        }
        role = 'sign'
      }
    })
    // Thiếu dấu ở các khoảng còn lại
    for (let i = 0; i < N - 1; i++) {
      if (signs[i] === 'none' && !hasExplicitNone(tokens, i, N)) {
        diagnostics.push(makeDiagnostic(
          'warning', 'LEGACY_BBT_MISSING_SIGN',
          `Thiếu dấu của khoảng (${model.knots[i].text}, ${model.knots[i + 1].text}) trong dòng "${derivKey}" — khoảng này được bỏ trống.`,
          derivKey
        ))
      }
    }
  } else {
    diagnostics.push(makeDiagnostic('warning', 'LEGACY_BBT_NO_DERIV', `Khối bbt legacy thiếu dòng đạo hàm ("${derivKey || "y'"} | ...").`, derivKey || "y'"))
  }
  model.signs = signs
  model.derivativeAt = derivativeAt

  // ---- Dòng y: giá trị + mũi tên ----
  if (valueKey) {
    const parsed = parseLegacyValues(rows[valueKey])
    parsed.errors.forEach(e => diagnostics.push(e))
    model.values = assignLegacyValues(parsed, N, diagnostics)
    model.hasValueRow = true
    model.arrows = parsed.arrows
    // đối chiếu mũi tên với dấu
    for (let i = 0; i < Math.min(N - 1, parsed.arrows.length); i++) {
      const arrow = parsed.arrows[i]
      if (!arrow || arrow === 'none') continue
      const sign = signs[i]
      if (sign !== '+' && sign !== '-') continue
      const expected = sign === '+' ? 'up' : 'down'
      if (arrow !== expected) {
        diagnostics.push(makeDiagnostic(
          'warning', 'LEGACY_BBT_ARROW_SIGN_CONFLICT',
          `Khoảng (${model.knots[i].text}, ${model.knots[i + 1].text}): mũi tên dòng y (${arrow === 'up' ? 'lên' : 'xuống'}) không khớp dấu dòng đạo hàm (${sign}).`,
          valueKey
        ))
      }
    }
  } else {
    diagnostics.push(makeDiagnostic('info', 'LEGACY_BBT_NO_VALUE_ROW', 'Khối bbt legacy không có dòng giá trị y — chỉ vẽ bảng xét dấu.', 'y'))
  }

  // các mốc đánh dấu gián đoạn ở dòng y' nhưng dòng y không có "||"
  discontinuousKnots.forEach(k => {
    const v = model.values[k]
    if (v && v.kind === 'jump') return
    if (model.hasValueRow) {
      diagnostics.push(makeDiagnostic(
        'warning', 'LEGACY_BBT_BREAK_MISSING_VALUES',
        `Mốc ${model.knots[k].text} được đánh dấu "||" ở dòng đạo hàm nhưng dòng y không có "||" — thiếu giới hạn trái/phải.`,
        valueKey || "y'"
      ))
    }
  })

  return { model, diagnostics }
}

/** Kiểm tra xem dấu 'none' có được viết tường minh trong dòng đạo hàm không. */
function hasExplicitNone(tokens, signIdx, N) {
  // Vai trò xen kẽ: sign, deriv, sign, ...
  let signCount = 0
  let role = 'sign'
  for (const tok of tokens) {
    if (role === 'sign') {
      if (signCount === signIdx) return tok === 'none'
      signCount++
      role = 'deriv'
    } else {
      role = 'sign'
    }
  }
  return false
}

/** Phân tích dòng giá trị legacy (giá trị + mũi tên + ||). */
export function parseLegacyValues(rawText) {
  const errors = []
  const tokens = String(rawText || '').split(/\s+/).filter(Boolean)
  const values = []
  const splits = new Set()
  let pendingArrow = null
  let pendingSplit = false

  tokens.forEach((tok) => {
    if (UP_TOKENS.includes(tok)) { pendingArrow = 'up'; return }
    if (DOWN_TOKENS.includes(tok)) { pendingArrow = 'down'; return }
    if (tok === '||') { pendingSplit = true; return }
    const norm = normalizeScalar(tok)
    if (!norm.ok) {
      errors.push(makeDiagnostic('error', 'LEGACY_BBT_BAD_VALUE', `Giá trị "${tok}" không hợp lệ: ${norm.error}.`, 'y'))
      pendingArrow = null
      pendingSplit = false
      return
    }
    values.push({ value: norm.value, arrowBefore: pendingArrow })
    if (pendingSplit) { splits.add(values.length - 1); pendingSplit = false }
    pendingArrow = null
  })

  return { values, splits, arrows: [], errors }
}

/** Gán các giá trị legacy vào các mốc (một mốc gián đoạn có 2 giá trị). */
function assignLegacyValues(parsed, N, diagnostics) {
  const out = new Array(N).fill(null)
  const firstValueIdx = new Array(N).fill(-1)
  let vi = 0
  for (let k = 0; k < N; k++) {
    if (vi >= parsed.values.length) break
    firstValueIdx[k] = vi
    const left = parsed.values[vi].value
    vi++
    if (parsed.splits.has(vi)) {
      const right = parsed.values[vi] ? parsed.values[vi].value : null
      vi++
      if (!right) {
        diagnostics.push(makeDiagnostic('warning', 'LEGACY_BBT_MISSING_LIMIT', 'Thiếu giới hạn phía phải sau dấu "||".', 'y'))
        out[k] = { kind: 'jump', left, right: left, at: null }
      } else {
        out[k] = { kind: 'jump', left, right, at: null }
      }
    } else {
      out[k] = left
    }
  }
  if (vi < parsed.values.length) {
    diagnostics.push(makeDiagnostic(
      'warning', 'LEGACY_BBT_EXTRA_VALUES',
      `Dòng y có ${parsed.values.length} giá trị nhưng bảng chỉ có ${N} mốc — các giá trị dư được bỏ qua.`,
      'y'
    ))
  }
  // mũi tên theo khoảng
  const arrows = []
  for (let k = 1; k < N; k++) {
    const idx = firstValueIdx[k]
    const arrow = idx >= 0 && parsed.values[idx] ? parsed.values[idx].arrowBefore : null
    arrows[k - 1] = arrow || 'none'
  }
  parsed.arrows = arrows
  return out
}

/* ------------------------------------------------------------------ *
 * GRAPH legacy
 * ------------------------------------------------------------------ */

export function adaptLegacyGraph(code) {
  const diagnostics = []
  const rows = parseLegacyLines(code)
  const model = {
    kind: 'graph',
    version: 'legacy',
    viewport: null,
    scale: 'free',
    curves: [],
    points: [],
    asymptotes: []
  }

  const fnText = rows['fn'] || rows['f'] || rows['expr']
  if (!fnText) {
    diagnostics.push(makeDiagnostic('error', 'LEGACY_GRAPH_NO_FN', 'Khối graph legacy thiếu dòng "fn: ..." (biểu thức hàm số).', 'fn'))
    return { model: null, diagnostics }
  }

  const domain = readLegacyRange(rows['domain'] || rows['x'], diagnostics, 'domain')
  const range = readLegacyRange(rows['range'] || rows['y'], diagnostics, 'range')
  if (!domain || !range) return { model: null, diagnostics }
  model.viewport = { x: domain, y: range }

  const fns = splitTopLevel(fnText, ';')
  fns.forEach((exprText, i) => {
    const text = exprText.trim()
    if (!text) return
    let ast
    try {
      ast = parseExpression(text)
    } catch (err) {
      diagnostics.push(makeDiagnostic('error', 'LEGACY_GRAPH_BAD_EXPR', `Biểu thức "${text}" không hợp lệ: ${err.message}`, 'fn', i + 1))
      return
    }
    model.curves.push({
      id: `f${model.curves.length + 1}`,
      expr: text,
      ast,
      domain: [{ from: domain[0], to: domain[1], closed: [true, true] }],
      breaks: []
    })
  })
  if (!model.curves.length) return { model: null, diagnostics }

  // ---- points ----
  const pointsText = rows['points'] || ''
  const pointMatches = [...pointsText.matchAll(/\(\s*([^,()]+)\s*,\s*([^,()]+)\s*\)/g)]
  pointMatches.forEach((m, i) => {
    const xn = normalizeScalar(m[1])
    const yn = normalizeScalar(m[2])
    if (!xn.ok || !yn.ok || !Number.isFinite(xn.value.num) || !Number.isFinite(yn.value.num)) {
      diagnostics.push(makeDiagnostic('warning', 'LEGACY_GRAPH_BAD_POINT', `Điểm "${m[0]}" không hợp lệ — bỏ qua.`, 'points', i + 1))
      return
    }
    const x = xn.value.num
    const y = yn.value.num
    // Nếu điểm nằm trên một đường cong thì lấy y từ hàm (đúng hơn nhập tay)
    let onCurve = null
    for (const c of model.curves) {
      const yc = evaluateSafe(c.ast, x)
      if (yc !== null && Math.abs(yc - y) <= Math.max(1e-6, Math.abs(yc) * 1e-9)) { onCurve = c; break }
    }
    if (onCurve) {
      model.points.push({ kind: 'curve', curveId: onCurve.id, x, y: null, label: '', guides: true, marker: 'filled' })
    } else {
      model.points.push({ kind: 'free', x, y, label: '', guides: true, marker: 'filled' })
      diagnostics.push(makeDiagnostic(
        'info', 'LEGACY_GRAPH_POINT_FREE',
        `Điểm (${m[1].trim()}, ${m[2].trim()}) không nằm trên đường cong nào — vẽ như điểm tự do.`,
        'points', i + 1
      ))
    }
  })

  // ---- asymptotes ----
  const asymText = rows['asymptotes'] || ''
  splitTopLevel(asymText).forEach((item, i) => {
    const m = item.match(/^([xy])\s*=\s*(.+)$/)
    if (!m) {
      diagnostics.push(makeDiagnostic('warning', 'LEGACY_GRAPH_BAD_ASYMPTOTE', `Tiệm cận "${item}" không đúng định dạng (x = ... hoặc y = ...).`, 'asymptotes', i + 1))
      return
    }
    const axis = m[1].toLowerCase()
    const valueText = m[2].trim()
    if (axis === 'x') {
      const norm = normalizeScalar(valueText)
      if (!norm.ok || !Number.isFinite(norm.value.num)) {
        diagnostics.push(makeDiagnostic('warning', 'LEGACY_GRAPH_BAD_ASYMPTOTE', `Tiệm cận đứng "${item}" không hợp lệ — bỏ qua.`, 'asymptotes', i + 1))
        return
      }
      model.asymptotes.push({ axis: 'x', value: norm.value.num, label: '' })
    } else {
      let ast
      try {
        ast = parseExpression(valueText)
      } catch (err) {
        diagnostics.push(makeDiagnostic('warning', 'LEGACY_GRAPH_BAD_ASYMPTOTE', `Tiệm cận ngang "${item}" không hợp lệ — bỏ qua.`, 'asymptotes', i + 1))
        return
      }
      model.asymptotes.push({ axis: 'y', expr: valueText, ast, affine: { a: 0, b: 0 }, label: '' })
    }
  })

  return { model, diagnostics }
}

function evaluateSafe(ast, x) {
  if (!isDefinedAt(ast, x)) return null
  const v = evaluate(ast, x)
  return Number.isFinite(v) ? v : null
}

function readLegacyRange(text, diagnostics, field) {
  if (!text) {
    diagnostics.push(makeDiagnostic('error', 'LEGACY_GRAPH_NO_RANGE', `Khối graph legacy thiếu dòng "${field}: [a, b]".`, field))
    return null
  }
  const parts = splitTopLevel(text.replace(/^\[|\]$/g, ''))
  if (parts.length !== 2) {
    diagnostics.push(makeDiagnostic('error', 'LEGACY_GRAPH_BAD_RANGE', `Dòng "${field}" phải có dạng [a, b].`, field))
    return null
  }
  const a = Number(parts[0])
  const b = Number(parts[1])
  if (!Number.isFinite(a) || !Number.isFinite(b) || !(a < b)) {
    diagnostics.push(makeDiagnostic('error', 'LEGACY_GRAPH_BAD_RANGE', `Dòng "${field}" phải là hai số hữu hạn với min < max.`, field))
    return null
  }
  return [a, b]
}

/* ------------------------------------------------------------------ *
 * GEO3D legacy (hình sơ đồ 2D)
 * ------------------------------------------------------------------ */

/**
 * Preset legacy: toạ độ PIXEL trên mặt phẳng hình vẽ (KHÔNG phải toạ độ toán học 3D).
 * Giữ nguyên để các đề đã lưu không bị đổi hình.
 */
export const LEGACY_GEO3D_PRESETS = Object.freeze({
  chop_tam_giac: {
    S: [135, 28], A: [38, 170], B: [115, 225], C: [248, 170]
  },
  chop_tam_giac_sa_vuong: {
    S: [48, 28], A: [48, 175], B: [135, 228], C: [252, 175]
  },
  chop_tu_giac: {
    S: [135, 25], A: [78, 155], B: [32, 218], C: [195, 218], D: [242, 155]
  },
  chop_tu_giac_sa_vuong: {
    S: [78, 25], A: [78, 158], B: [30, 220], C: [195, 220], D: [243, 158]
  },
  chop_tu_giac_deu: {
    S: [137, 22], A: [78, 158], B: [30, 220], C: [195, 220], D: [243, 158], O: [136.5, 189]
  },
  lang_tru_tam_giac: {
    A: [45, 175], B: [120, 228], C: [235, 175],
    "A'": [45, 42], "B'": [120, 95], "C'": [235, 42]
  },
  hinh_hop: {
    A: [82, 162], B: [34, 222], C: [196, 222], D: [244, 162],
    "A'": [82, 42], "B'": [34, 102], "C'": [196, 102], "D'": [244, 42]
  }
})

export function adaptLegacyGeo3d(code) {
  const diagnostics = []
  const rows = parseLegacyLines(code)
  const model = {
    kind: 'geo3d-legacy',
    points: {},
    solid: [],
    dashed: [],
    rightAngles: []
  }

  const presetKey = (rows['preset'] || '').trim().toLowerCase()
  let pts = {}
  if (presetKey) {
    const preset = LEGACY_GEO3D_PRESETS[presetKey]
    if (!preset) {
      diagnostics.push(makeDiagnostic(
        'error', 'LEGACY_GEO3D_UNKNOWN_PRESET',
        `Preset "${presetKey}" không tồn tại (không tự đổi sang hình khác). Các preset hợp lệ: ${Object.keys(LEGACY_GEO3D_PRESETS).join(', ')}.`,
        'preset'
      ))
      return { model: null, diagnostics }
    }
    pts = JSON.parse(JSON.stringify(preset))
  } else {
    diagnostics.push(makeDiagnostic('error', 'LEGACY_GEO3D_NO_PRESET', 'Khối geo3d legacy thiếu dòng "preset: ...".', 'preset'))
    return { model: null, diagnostics }
  }

  // ---- Điểm phụ (mid/centroid/ratio/proj) ----
  const defs = splitTopLevel(rows['points'] || '')
  defs.forEach((def, i) => {
    const eq = def.indexOf('=')
    if (eq === -1) {
      diagnostics.push(makeDiagnostic('warning', 'LEGACY_GEO3D_BAD_POINT', `Định nghĩa điểm "${def}" không hợp lệ (cần dạng "M = mid(A, B)").`, 'points', i + 1))
      return
    }
    const name = def.slice(0, eq).trim()
    const expr = def.slice(eq + 1).trim()
    if (!name || !expr) {
      diagnostics.push(makeDiagnostic('warning', 'LEGACY_GEO3D_BAD_POINT', `Định nghĩa điểm "${def}" không hợp lệ.`, 'points', i + 1))
      return
    }
    const call = expr.match(/^([A-Za-z_][A-Za-z0-9_]*)\s*\(([\s\S]*)\)$/)
    if (!call) {
      diagnostics.push(makeDiagnostic('warning', 'LEGACY_GEO3D_BAD_POINT', `Không hiểu biểu thức dựng điểm "${expr}".`, 'points', i + 1))
      return
    }
    const op = call[1].toLowerCase()
    const args = splitTopLevel(call[2])
    const get = (n) => {
      const p = pts[n]
      if (!p) {
        diagnostics.push(makeDiagnostic('warning', 'LEGACY_GEO3D_MISSING_POINT', `Điểm "${n}" không tồn tại trong preset — bỏ qua điểm "${name}".`, 'points', i + 1))
        return null
      }
      return p
    }
    if (op === 'mid' && args.length === 2) {
      const a = get(args[0]); const b = get(args[1])
      if (a && b) pts[name] = [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2]
    } else if (op === 'centroid' && args.length === 3) {
      const a = get(args[0]); const b = get(args[1]); const c = get(args[2])
      if (a && b && c) pts[name] = [(a[0] + b[0] + c[0]) / 3, (a[1] + b[1] + c[1]) / 3]
    } else if (op === 'ratio' && args.length === 3) {
      const a = get(args[0]); const b = get(args[1])
      const t = Number(args[2])
      if (a && b && Number.isFinite(t)) {
        pts[name] = [a[0] + t * (b[0] - a[0]), a[1] + t * (b[1] - a[1])]
      } else {
        diagnostics.push(makeDiagnostic('warning', 'LEGACY_GEO3D_BAD_POINT', `ratio(...) không hợp lệ: "${expr}".`, 'points', i + 1))
      }
    } else if (op === 'proj' && args.length === 3) {
      const p = get(args[0]); const a = get(args[1]); const b = get(args[2])
      if (p && a && b) {
        // Hình chiếu vuông góc trong mặt phẳng hình sơ đồ 2D
        const dx = b[0] - a[0]
        const dy = b[1] - a[1]
        const den = dx * dx + dy * dy
        if (den <= 1e-12) {
          diagnostics.push(makeDiagnostic('warning', 'LEGACY_GEO3D_BAD_POINT', `proj(${args[0]},${args[1]},${args[2]}) không xác định (A = B).`, 'points', i + 1))
        } else {
          const t = ((p[0] - a[0]) * dx + (p[1] - a[1]) * dy) / den
          pts[name] = [a[0] + t * dx, a[1] + t * dy]
          diagnostics.push(makeDiagnostic(
            'info', 'LEGACY_GEO3D_PROJ_2D',
            `Điểm "${name}" dựng bằng proj() trên HÌNH SƠ ĐỒ 2D (toạ độ pixel) — không kiểm chứng được vuông góc trong không gian. Dùng JSON version 2 cho hình 3D thật.`,
            'points'
          ))
        }
      }
    } else {
      diagnostics.push(makeDiagnostic('warning', 'LEGACY_GEO3D_BAD_POINT', `Phép dựng "${op}(...)" không hỗ trợ.`, 'points', i + 1))
    }
  })

  model.points = pts

  // ---- Cạnh ----
  const resolveEdge = (text, field, di) => {
    const m = text.match(/^\s*([A-Za-z][A-Za-z0-9_']*)\s*,\s*([A-Za-z][A-Za-z0-9_']*)\s*$/)
    if (m) return [m[1], m[2]]
    const raw = text.trim()
    // Ghép tên đỉnh: thử mọi cách chia thành đúng 2 điểm đã biết
    for (let i = 1; i < raw.length; i++) {
      const left = raw.slice(0, i)
      const right = raw.slice(i)
      if (pts[left] && pts[right]) return [left, right]
    }
    di.push(makeDiagnostic('warning', 'LEGACY_GEO3D_BAD_EDGE', `Cạnh "${text}" không hợp lệ (cần 2 đỉnh có sẵn) — bỏ qua.`, field))
    return null
  }

  splitTopLevel(rows['solid'] || '').forEach((edgeText, i) => {
    const edge = resolveEdge(edgeText, 'solid', diagnostics)
    if (edge) model.solid.push(edge)
  })
  splitTopLevel(rows['dashed'] || '').forEach((edgeText, i) => {
    const edge = resolveEdge(edgeText, 'dashed', diagnostics)
    if (edge) model.dashed.push(edge)
  })

  // ---- Góc vuông ----
  const rightAngleText = rows['right_angle'] || rows['right_angle:'] || ''
  const raMatches = [...rightAngleText.matchAll(/\(\s*([^,()]+)\s*,\s*([^,()]+)\s*,\s*([^,()]+)\s*\)/g)]
  if (raMatches.length) {
    diagnostics.push(makeDiagnostic(
      'info', 'LEGACY_GEO3D_RIGHT_ANGLE_2D',
      'Góc vuông trong khối geo3d legacy được kiểm tra trên HÌNH SƠ ĐỒ 2D, không kiểm chứng được trong không gian. Dùng JSON version 2 (rightAngles) cho hình 3D thật.',
      'right_angle'
    ))
  }
  raMatches.forEach(m => {
    const [a, v, b] = [m[1].trim(), m[2].trim(), m[3].trim()]
    if (!pts[a] || !pts[v] || !pts[b]) {
      diagnostics.push(makeDiagnostic('warning', 'LEGACY_GEO3D_BAD_EDGE', `Góc vuông (${a},${v},${b}) tham chiếu điểm không tồn tại — bỏ qua.`, 'right_angle'))
      return
    }
    model.rightAngles.push([a, v, b])
  })

  diagnostics.push(makeDiagnostic(
    'info', 'LEGACY_GEO3D_SCHEMATIC',
    'Khối geo3d legacy là HÌNH SƠ ĐỒ 2D (toạ độ pixel), không phải dựng hình 3D đúng. Dùng JSON version 2 (points/constructions/edges/camera) cho hình không gian chính xác.',
    'preset'
  ))

  return { model, diagnostics }
}
