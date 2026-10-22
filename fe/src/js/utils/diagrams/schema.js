/**
 * schema.js — Kiểm tra schema JSON "version 2" cho các khối hình toán
 * (bbt / graph / geo3d) theo hợp đồng MD_RULES_VE_HINH_TOAN_V2.md.
 *
 * Nguyên tắc:
 *  - Không có "default âm thầm": thiếu/sai dữ liệu ⇒ trả diagnostic rõ ràng.
 *  - Khóa lạ bị từ chối (phát hiện lỗi đánh máy).
 *  - Dữ liệu mâu thuẫn về toán học bị từ chối (không ép vô hực để khớp mũi tên).
 *
 * Module thuần (không phụ thuộc DOM) để unit-test bằng Node.
 */

import {
  parseExpression,
  evaluateConstant,
  checkExpression,
  evaluate,
  isDefinedAt,
  asAffine,
  ExpressionError
} from './expression.js'

/* ------------------------------------------------------------------ *
 * Diagnostic
 * ------------------------------------------------------------------ */

/**
 * @typedef {{severity:'error'|'warning'|'info', code:string, field?:string,
 *            line?:number|null, message:string}} Diagnostic
 */

export function makeDiagnostic(severity, code, message, field = null, line = null) {
  return { severity, code, field, line, message }
}

export function hasErrors(diagnostics) {
  return (diagnostics || []).some(d => d.severity === 'error')
}

/* ------------------------------------------------------------------ *
 * Giá trị số / vô cực dùng chung (BBT & graph)
 * ------------------------------------------------------------------ */

const INF_STRINGS = new Set(['+inf', '-inf', '+\\infty', '-\\infty', '+\u221e', '-\u221e', 'inf', '+infinity', '-infinity'])

/**
 * Chuẩn hóa một "giá trị" trong BBT: số, vô cực, hoặc biểu thức hằng.
 * @returns {{ok:boolean, value?:{kind:'number'|'inf', num:number, inf:number, text:string}, error?:string}}
 */
export function normalizeScalar(raw) {
  if (typeof raw === 'number') {
    if (!Number.isFinite(raw)) return { ok: false, error: 'Giá trị phải là số hữu hạn' }
    return { ok: true, value: { kind: 'number', num: raw, inf: 0, text: String(raw) } }
  }
  if (typeof raw === 'string') {
    const text = raw.trim()
    if (!text) return { ok: false, error: 'Giá trị rỗng' }
    if (INF_STRINGS.has(text.toLowerCase())) {
      const positive = !text.trim().startsWith('-')
      return { ok: true, value: { kind: 'inf', num: positive ? Infinity : -Infinity, inf: positive ? 1 : -1, text } }
    }
    try {
      const ast = parseExpression(text)
      const num = evaluateConstant(ast)
      return { ok: true, value: { kind: 'number', num, inf: 0, text } }
    } catch (err) {
      return { ok: false, error: err instanceof ExpressionError ? err.message : String(err.message || err) }
    }
  }
  return { ok: false, error: 'Giá trị không hợp lệ' }
}

/** So sánh hai giá trị đã chuẩn hóa: -1 (nhỏ hơn), 0 (bằng), 1 (lớn hơn). */
export function compareValues(a, b) {
  if (!a || !b) return 0
  if (a.num < b.num) return -1
  if (a.num > b.num) return 1
  return 0
}

/* ------------------------------------------------------------------ *
 * Tiện ích kiểm tra key lạ
 * ------------------------------------------------------------------ */

function checkUnknownKeys(obj, allowed, code, diagnostics, prefix = '') {
  if (!obj || typeof obj !== 'object') return
  for (const key of Object.keys(obj)) {
    if (!allowed.includes(key)) {
      diagnostics.push(makeDiagnostic(
        'error',
        code,
        `Khóa "${prefix}${key}" không được hỗ trợ. Các khóa hợp lệ: ${allowed.join(', ')}.`,
        prefix + key
      ))
    }
  }
}

function isPlainObject(value) {
  return !!value && typeof value === 'object' && !Array.isArray(value)
}

/* ================================================================== *
 * BBT — version 2
 * ================================================================== */

const BBT_KEYS = ['version', 'labels', 'knots', 'signs', 'derivativeAt', 'values']
const BBT_LABEL_KEYS = ['x', 'derivative', 'value']
const SIGN_VALUES = ['+', '-', '0', 'none']
const DERIV_VALUES = ['zero', 'nonzero', 'undefined']

/**
 * Validate + chuyển JSON V2 của BBT thành model nội bộ.
 * @returns {{model:object|null, diagnostics:Diagnostic[]}}
 */
export function validateBbtV2(raw) {
  const diagnostics = []
  checkUnknownKeys(raw, BBT_KEYS, 'BBT_V2_UNKNOWN_KEY', diagnostics)

  const model = {
    kind: 'bbt',
    version: 2,
    labels: { x: 'x', derivative: "f'(x)", value: 'f(x)' },
    knots: [],
    signs: [],
    derivativeAt: [],
    values: [],
    hasValueRow: false,
    arrows: null
  }

  // ---- labels ----
  if (raw.labels !== undefined) {
    if (!isPlainObject(raw.labels)) {
      diagnostics.push(makeDiagnostic('error', 'BBT_V2_BAD_LABELS', 'Trường "labels" phải là object.', 'labels'))
    } else {
      checkUnknownKeys(raw.labels, BBT_LABEL_KEYS, 'BBT_V2_UNKNOWN_KEY', diagnostics, 'labels.')
      for (const key of BBT_LABEL_KEYS) {
        if (raw.labels[key] !== undefined) {
          if (typeof raw.labels[key] !== 'string') {
            diagnostics.push(makeDiagnostic('error', 'BBT_V2_BAD_LABELS', `labels.${key} phải là chuỗi.`, `labels.${key}`))
          } else {
            model.labels[key] = raw.labels[key]
          }
        }
      }
    }
  }

  // ---- knots ----
  if (!Array.isArray(raw.knots) || raw.knots.length < 2) {
    diagnostics.push(makeDiagnostic('error', 'BBT_V2_BAD_KNOTS', 'Trường "knots" bắt buộc và cần ít nhất 2 mốc.', 'knots'))
    return { model: null, diagnostics }
  }

  const knotValues = []
  raw.knots.forEach((k, i) => {
    const norm = normalizeScalar(k)
    if (!norm.ok) {
      diagnostics.push(makeDiagnostic('error', 'BBT_V2_BAD_KNOT', `Mốc thứ ${i + 1} không hợp lệ: ${norm.error}.`, 'knots', i + 1))
      knotValues.push(null)
      return
    }
    knotValues.push(norm.value)
  })

  // tăng nghiêm ngặt + ±inf chỉ ở hai đầu
  for (let i = 0; i < knotValues.length; i++) {
    const v = knotValues[i]
    if (!v) continue
    if (v.inf === 1 && i !== knotValues.length - 1) {
      diagnostics.push(makeDiagnostic('error', 'BBT_V2_INF_POSITION', 'Giá trị +inf chỉ được đặt ở mốc cuối cùng.', 'knots', i + 1))
    }
    if (v.inf === -1 && i !== 0) {
      diagnostics.push(makeDiagnostic('error', 'BBT_V2_INF_POSITION', 'Giá trị -inf chỉ được đặt ở mốc đầu tiên.', 'knots', i + 1))
    }
    if (i > 0 && knotValues[i - 1] && compareValues(knotValues[i - 1], v) >= 0) {
      diagnostics.push(makeDiagnostic('error', 'BBT_V2_KNOT_ORDER', 'Các mốc phải tăng nghiêm ngặt.', 'knots', i + 1))
    }
  }
  model.knots = knotValues.map((v, i) => ({
    index: i,
    num: v ? v.num : null,
    inf: v ? v.inf : 0,
    text: v ? v.text : String(raw.knots[i])
  }))

  const N = knotValues.length

  // ---- signs ----
  if (raw.signs !== undefined) {
    if (!Array.isArray(raw.signs)) {
      diagnostics.push(makeDiagnostic('error', 'BBT_V2_BAD_SIGNS', 'Trường "signs" phải là mảng.', 'signs'))
    } else {
      if (raw.signs.length !== N - 1) {
        diagnostics.push(makeDiagnostic(
          'error', 'BBT_V2_SIGN_COUNT',
          `Số mốc là ${N} nên phải có đúng ${N - 1} dấu khoảng, nhưng "signs" có ${raw.signs.length} phần tử.`,
          'signs'
        ))
      }
      raw.signs.forEach((s, i) => {
        if (!SIGN_VALUES.includes(s)) {
          diagnostics.push(makeDiagnostic('error', 'BBT_V2_BAD_SIGN', `Dấu "${s}" không hợp lệ (chỉ +, -, 0, none).`, 'signs', i + 1))
        }
      })
      model.signs = raw.signs.slice()
    }
  }
  if (model.signs.length !== N - 1) {
    // thiếu dấu → không tự bịa, dừng validate
    diagnostics.push(makeDiagnostic(
      'error', 'BBT_V2_MISSING_SIGNS',
      'Thiếu dấu của khoảng: mỗi khoảng giữa hai mốc liền nhau phải có đúng một dấu.',
      'signs'
    ))
    return { model: null, diagnostics }
  }

  // ---- derivativeAt ----
  if (raw.derivativeAt !== undefined) {
    if (!Array.isArray(raw.derivativeAt)) {
      diagnostics.push(makeDiagnostic('error', 'BBT_V2_BAD_DERIV', 'Trường "derivativeAt" phải là mảng.', 'derivativeAt'))
    } else {
      if (raw.derivativeAt.length !== N) {
        diagnostics.push(makeDiagnostic(
          'error', 'BBT_V2_DERIV_COUNT',
          `"derivativeAt" phải có đúng ${N} phần tử (tương ứng ${N} mốc), nhưng có ${raw.derivativeAt.length}.`,
          'derivativeAt'
        ))
      }
      raw.derivativeAt.forEach((d, i) => {
        if (d === null || d === undefined) return
        if (!DERIV_VALUES.includes(d)) {
          diagnostics.push(makeDiagnostic('error', 'BBT_V2_BAD_DERIV', `derivativeAt "${d}" không hợp lệ (zero, nonzero, undefined hoặc null).`, 'derivativeAt', i + 1))
        }
        const knot = model.knots[i]
        if (knot && knot.inf !== 0 && d !== null && d !== undefined) {
          diagnostics.push(makeDiagnostic('error', 'BBT_V2_DERIV_INF', 'Tại mốc vô cực, derivativeAt phải là null.', 'derivativeAt', i + 1))
        }
      })
      model.derivativeAt = raw.derivativeAt.map(d => {
        if (d === 'zero') return { kind: 'zero' }
        if (d === 'nonzero') return { kind: 'nonzero', sign: null }
        if (d === 'undefined') return { kind: 'undefined' }
        return null
      })
    }
  }
  while (model.derivativeAt.length < N) model.derivativeAt.push(null)

  // ---- values ----
  if (raw.values !== undefined) {
    if (!Array.isArray(raw.values)) {
      diagnostics.push(makeDiagnostic('error', 'BBT_V2_BAD_VALUES', 'Trường "values" phải là mảng.', 'values'))
    } else {
      if (raw.values.length !== N) {
        diagnostics.push(makeDiagnostic(
          'error', 'BBT_V2_VALUE_COUNT',
          `"values" phải có đúng ${N} phần tử (tương ứng ${N} mốc), nhưng có ${raw.values.length}.`,
          'values'
        ))
      }
      raw.values.forEach((v, i) => {
        model.values[i] = normalizeBbtValue(v, i, diagnostics)
      })
      model.hasValueRow = true
    }
  }
  while (model.values.length < N) model.values.push(null)

  validateBbtConsistency(model, diagnostics)
  if (hasErrors(diagnostics)) return { model: null, diagnostics }
  return { model, diagnostics }
}

/** Chuẩn hóa một phần tử của hàng "values". */
function normalizeBbtValue(raw, index, diagnostics) {
  if (raw === null || raw === undefined) return null

  if (isPlainObject(raw)) {
    checkUnknownKeys(raw, ['left', 'right', 'at'], 'BBT_V2_UNKNOWN_KEY', diagnostics, `values[${index}].`)
    const leftRaw = raw.left
    const rightRaw = raw.right
    const atRaw = raw.at === undefined ? null : raw.at
    let left = null
    let right = null
    let at = null
    if (leftRaw !== null && leftRaw !== undefined) {
      const norm = normalizeScalar(leftRaw)
      if (!norm.ok) diagnostics.push(makeDiagnostic('error', 'BBT_V2_BAD_VALUE', `values[${index}].left không hợp lệ: ${norm.error}.`, `values[${index}].left`))
      else left = norm.value
    }
    if (rightRaw !== null && rightRaw !== undefined) {
      const norm = normalizeScalar(rightRaw)
      if (!norm.ok) diagnostics.push(makeDiagnostic('error', 'BBT_V2_BAD_VALUE', `values[${index}].right không hợp lệ: ${norm.error}.`, `values[${index}].right`))
      else right = norm.value
    }
    if (atRaw !== null && atRaw !== undefined) {
      const norm = normalizeScalar(atRaw)
      if (!norm.ok) diagnostics.push(makeDiagnostic('error', 'BBT_V2_BAD_VALUE', `values[${index}].at không hợp lệ: ${norm.error}.`, `values[${index}].at`))
      else at = norm.value
    }
    if (left === null || right === null) {
      diagnostics.push(makeDiagnostic(
        'error', 'BBT_V2_BAD_VALUE',
        `values[${index}] dạng {left,right,at} cần có cả "left" và "right".`,
        `values[${index}]`
      ))
      return null
    }
    const same = compareValues(left, right) === 0
    if (same && at === null) {
      // lỗ thủng: có giới hạn nhưng hàm không xác định tại mốc
      return { kind: 'hole', limit: left, at: null }
    }
    if (same && at !== null) {
      return { kind: 'number', num: at.num, inf: at.inf, text: at.text }
    }
    return { kind: 'jump', left, right, at }
  }

  const norm = normalizeScalar(raw)
  if (!norm.ok) {
    diagnostics.push(makeDiagnostic('error', 'BBT_V2_BAD_VALUE', `values[${index}] không hợp lệ: ${norm.error}.`, `values[${index}]`))
    return null
  }
  return norm.value
}

/** Kiểm tra tính nhất quán toán học của bảng BBT (dấu ↔ giá trị ↔ đạo hàm). */
function validateBbtConsistency(model, diagnostics) {
  const N = model.knots.length
  const signs = model.signs

  // 1) dấu ↔ giá trị ở hai đầu mỗi khoảng
  for (let i = 0; i < signs.length; i++) {
    const sign = signs[i]
    if (sign !== '+' && sign !== '-') continue
    if (!model.hasValueRow) continue
    const leftV = endpointValue(model, i, 'start')
    const rightV = endpointValue(model, i + 1, 'end')
    if (!leftV || !rightV) continue
    const cmp = compareValues(leftV, rightV)
    if (sign === '+' && cmp > 0) {
      diagnostics.push(makeDiagnostic(
        'error', 'BBT_V2_VALUE_SIGN_CONFLICT',
        `Mâu thuẫn: dấu "${sign}" trên khoảng (${model.knots[i].text}, ${model.knots[i + 1].text}) nhưng giá trị lại giảm (${leftV.text} → ${rightV.text}).`,
        'values', i + 1
      ))
    }
    if (sign === '-' && cmp < 0) {
      diagnostics.push(makeDiagnostic(
        'error', 'BBT_V2_VALUE_SIGN_CONFLICT',
        `Mâu thuẫn: dấu "${sign}" trên khoảng (${model.knots[i].text}, ${model.knots[i + 1].text}) nhưng giá trị lại tăng (${leftV.text} → ${rightV.text}).`,
        'values', i + 1
      ))
    }
  }

  // 2) đạo hàm bằng 0 nhưng dấu không đổi → điểm đi ngang (thông tin, không chặn lưu)
  for (let i = 1; i < N - 1; i++) {
    const d = model.derivativeAt[i]
    if (!d || d.kind !== 'zero') continue
    const s1 = signs[i - 1]
    const s2 = signs[i]
    if (s1 === s2 && s1 !== 'none' && s1 !== '0') {
      diagnostics.push(makeDiagnostic(
        'info', 'BBT_V2_NO_SIGN_CHANGE',
        `Tại x = ${model.knots[i].text}: đạo hàm bằng 0 nhưng dấu không đổi (${s1}) ⇒ đây là điểm đi ngang, không phải cực trị.`,
        'derivativeAt', i + 1
      ))
    }
  }

  // 3) gián đoạn (nhảy) ⇒ không thể nối mũi tên qua mốc đó
  for (let i = 0; i < N; i++) {
    const v = model.values[i]
    if (v && v.kind === 'jump') {
      const d = model.derivativeAt[i]
      if (d && d.kind === 'zero') {
        diagnostics.push(makeDiagnostic(
          'error', 'BBT_V2_DISCONTINUOUS_ZERO',
          `Tại x = ${model.knots[i].text} hàm gián đoạn nên không thể có đạo hàm bằng 0.`,
          'derivativeAt', i + 1
        ))
      }
    }
  }
}

/**
 * Giá trị ở đầu/cuối một khoảng (xử lý gián đoạn).
 *  - 'start': giá trị ở mốc trái của khoảng (nếu mốc đó gián đoạn ⇒ lấy giới hạn PHẢI)
 *  - 'end':   giá trị ở mốc phải của khoảng (nếu mốc đó gián đoạn ⇒ lấy giới hạn TRÁI)
 */
function endpointValue(model, knotIndex, side) {
  const v = model.values[knotIndex]
  if (!v) return null
  if (v.kind === 'jump') return side === 'start' ? v.right : v.left
  if (v.kind === 'hole') return v.limit
  return v
}

/* ================================================================== *
 * GRAPH — version 2
 * ================================================================== */

const GRAPH_KEYS = ['version', 'viewport', 'scale', 'curves', 'points', 'asymptotes', 'labels']
const GRAPH_CURVE_KEYS = ['id', 'expr', 'domain', 'breaks', 'label', 'color']
const GRAPH_DOMAIN_KEYS = ['from', 'to', 'closed']
const GRAPH_POINT_KEYS = ['curve', 'x', 'y', 'label', 'guides', 'marker']
const GRAPH_ASYMPTOTE_KEYS = ['axis', 'value', 'expr', 'label']

export function validateGraphV2(raw) {
  const diagnostics = []
  checkUnknownKeys(raw, GRAPH_KEYS, 'GRAPH_V2_UNKNOWN_KEY', diagnostics)

  const model = {
    kind: 'graph',
    version: 2,
    viewport: null,
    scale: 'free',
    curves: [],
    points: [],
    asymptotes: []
  }

  // ---- viewport ----
  const vp = raw.viewport
  if (!isPlainObject(vp)) {
    diagnostics.push(makeDiagnostic('error', 'GRAPH_V2_NO_VIEWPORT', 'Trường "viewport" bắt buộc, gồm khoảng x và khoảng y.', 'viewport'))
    return { model: null, diagnostics }
  }
  checkUnknownKeys(vp, ['x', 'y'], 'GRAPH_V2_UNKNOWN_KEY', diagnostics, 'viewport.')
  const xr = readRange(vp.x, 'viewport.x', diagnostics)
  const yr = readRange(vp.y, 'viewport.y', diagnostics)
  if (!xr || !yr) return { model: null, diagnostics }
  model.viewport = { x: xr, y: yr }

  // ---- scale ----
  if (raw.scale !== undefined) {
    if (raw.scale !== 'free' && raw.scale !== 'equal') {
      diagnostics.push(makeDiagnostic('error', 'GRAPH_V2_BAD_SCALE', '"scale" chỉ nhận "free" hoặc "equal".', 'scale'))
    } else {
      model.scale = raw.scale
    }
  }

  // ---- curves ----
  if (!Array.isArray(raw.curves) || raw.curves.length === 0) {
    diagnostics.push(makeDiagnostic('error', 'GRAPH_V2_NO_CURVES', 'Trường "curves" bắt buộc và phải có ít nhất 1 đường cong.', 'curves'))
    return { model: null, diagnostics }
  }
  const seenIds = new Set()
  raw.curves.forEach((curve, ci) => {
    const field = `curves[${ci}]`
    if (!isPlainObject(curve)) {
      diagnostics.push(makeDiagnostic('error', 'GRAPH_V2_BAD_CURVE', 'Mỗi phần tử của "curves" phải là object.', field))
      return
    }
    checkUnknownKeys(curve, GRAPH_CURVE_KEYS, 'GRAPH_V2_UNKNOWN_KEY', diagnostics, `${field}.`)
    const id = typeof curve.id === 'string' && curve.id.trim() ? curve.id.trim() : `curve${ci + 1}`
    if (seenIds.has(id)) {
      diagnostics.push(makeDiagnostic('error', 'GRAPH_V2_DUPLICATE_ID', `ID đường cong "${id}" bị trùng.`, `${field}.id`))
      return
    }
    seenIds.add(id)

    if (typeof curve.expr !== 'string' || !curve.expr.trim()) {
      diagnostics.push(makeDiagnostic('error', 'GRAPH_V2_NO_EXPR', 'Đường cong cần trường "expr" (biểu thức theo x).', `${field}.expr`))
      return
    }
    let ast = null
    try {
      ast = parseExpression(curve.expr)
    } catch (err) {
      diagnostics.push(makeDiagnostic('error', 'GRAPH_V2_BAD_EXPR', `Biểu thức không hợp lệ: ${err.message}`, `${field}.expr`))
      return
    }

    // domain
    const domain = []
    if (!Array.isArray(curve.domain) || curve.domain.length === 0) {
      diagnostics.push(makeDiagnostic(
        'error', 'GRAPH_V2_NO_DOMAIN',
        'Đường cong cần "domain": mảng các khoảng {from, to, closed:[trái,phải]} mô tả miền xét.',
        `${field}.domain`
      ))
      return
    }
    curve.domain.forEach((iv, ii) => {
      const ivField = `${field}.domain[${ii}]`
      if (!isPlainObject(iv)) {
        diagnostics.push(makeDiagnostic('error', 'GRAPH_V2_BAD_DOMAIN', 'Mỗi khoảng miền phải là object.', ivField))
        return
      }
      checkUnknownKeys(iv, GRAPH_DOMAIN_KEYS, 'GRAPH_V2_UNKNOWN_KEY', diagnostics, `${ivField}.`)
      const from = readBound(iv.from, `${ivField}.from`, diagnostics, -Infinity)
      const to = readBound(iv.to, `${ivField}.to`, diagnostics, Infinity)
      if (from === null || to === null) return
      if (!(from < to)) {
        diagnostics.push(makeDiagnostic('error', 'GRAPH_V2_BAD_DOMAIN', 'Miền phải có from < to.', ivField))
        return
      }
      let closed = [true, true]
      if (iv.closed !== undefined) {
        if (!Array.isArray(iv.closed) || iv.closed.length !== 2 || iv.closed.some(c => typeof c !== 'boolean')) {
          diagnostics.push(makeDiagnostic('error', 'GRAPH_V2_BAD_DOMAIN', '"closed" phải là mảng 2 phần tử boolean.', `${ivField}.closed`))
          return
        }
        closed = [!!iv.closed[0], !!iv.closed[1]]
      }
      domain.push({ from, to, closed })
    })
    if (domain.length === 0) return

    // breaks
    const breaks = []
    if (curve.breaks !== undefined) {
      if (!Array.isArray(curve.breaks)) {
        diagnostics.push(makeDiagnostic('error', 'GRAPH_V2_BAD_BREAKS', '"breaks" phải là mảng các giá trị x.', `${field}.breaks`))
        return
      }
      curve.breaks.forEach((b, bi) => {
        const norm = normalizeScalar(b)
        if (!norm.ok || !Number.isFinite(norm.value.num)) {
          diagnostics.push(makeDiagnostic('error', 'GRAPH_V2_BAD_BREAKS', `Điểm chia "${b}" không phải số hữu hạn.`, `${field}.breaks[${bi}]`))
          return
        }
        breaks.push(norm.value.num)
      })
    }

    model.curves.push({ id, expr: curve.expr.trim(), ast, domain, breaks })
  })

  if (model.curves.length === 0) return { model: null, diagnostics }

  // ---- points ----
  if (raw.points !== undefined) {
    if (!Array.isArray(raw.points)) {
      diagnostics.push(makeDiagnostic('error', 'GRAPH_V2_BAD_POINTS', '"points" phải là mảng.', 'points'))
    } else {
      raw.points.forEach((p, pi) => {
        const field = `points[${pi}]`
        if (!isPlainObject(p)) {
          diagnostics.push(makeDiagnostic('error', 'GRAPH_V2_BAD_POINTS', 'Mỗi điểm phải là object.', field))
          return
        }
        checkUnknownKeys(p, GRAPH_POINT_KEYS, 'GRAPH_V2_UNKNOWN_KEY', diagnostics, `${field}.`)
        const label = typeof p.label === 'string' ? p.label : ''
        const guides = p.guides === undefined ? true : !!p.guides
        const marker = p.marker === undefined ? 'filled' : p.marker
        if (marker !== 'filled' && marker !== 'open') {
          diagnostics.push(makeDiagnostic('error', 'GRAPH_V2_BAD_MARKER', '"marker" chỉ nhận "filled" hoặc "open".', `${field}.marker`))
          return
        }
        if (p.curve !== undefined) {
          if (typeof p.curve !== 'string' || !seenIds.has(p.curve)) {
            diagnostics.push(makeDiagnostic('error', 'GRAPH_V2_BAD_POINT_CURVE', `Điểm tham chiếu đường cong "${p.curve}" không tồn tại.`, `${field}.curve`))
            return
          }
          const xNorm = normalizeScalar(p.x)
          if (!xNorm.ok || !Number.isFinite(xNorm.value.num)) {
            diagnostics.push(makeDiagnostic('error', 'GRAPH_V2_BAD_POINT_X', 'Điểm trên đường cong cần giá trị "x" hữu hạn.', `${field}.x`))
            return
          }
          let y = null
          if (p.y !== undefined && p.y !== null) {
            const yNorm = normalizeScalar(p.y)
            if (!yNorm.ok || !Number.isFinite(yNorm.value.num)) {
              diagnostics.push(makeDiagnostic('error', 'GRAPH_V2_BAD_POINT_Y', 'Giá trị "y" của điểm phải là số hữu hạn.', `${field}.y`))
              return
            }
            y = yNorm.value.num
          }
          model.points.push({ kind: 'curve', curveId: p.curve, x: xNorm.value.num, y, label, guides, marker })
        } else {
          const xNorm = normalizeScalar(p.x)
          const yNorm = normalizeScalar(p.y)
          if (!xNorm.ok || !Number.isFinite(xNorm.value.num) || !yNorm.ok || !Number.isFinite(yNorm.value.num)) {
            diagnostics.push(makeDiagnostic(
              'error', 'GRAPH_V2_BAD_FREE_POINT',
              'Điểm tự do cần cả "x" và "y" (số hữu hạn).',
              field
            ))
            return
          }
          model.points.push({
            kind: 'free', x: xNorm.value.num, y: yNorm.value.num,
            label, guides, marker
          })
        }
      })
    }
  }

  // ---- asymptotes ----
  if (raw.asymptotes !== undefined) {
    if (!Array.isArray(raw.asymptotes)) {
      diagnostics.push(makeDiagnostic('error', 'GRAPH_V2_BAD_ASYMPTOTES', '"asymptotes" phải là mảng.', 'asymptotes'))
    } else {
      raw.asymptotes.forEach((a, ai) => {
        const field = `asymptotes[${ai}]`
        if (!isPlainObject(a)) {
          diagnostics.push(makeDiagnostic('error', 'GRAPH_V2_BAD_ASYMPTOTES', 'Mỗi tiệm cận phải là object.', field))
          return
        }
        checkUnknownKeys(a, GRAPH_ASYMPTOTE_KEYS, 'GRAPH_V2_UNKNOWN_KEY', diagnostics, `${field}.`)
        if (a.axis === 'x') {
          const norm = normalizeScalar(a.value)
          if (!norm.ok || !Number.isFinite(norm.value.num)) {
            diagnostics.push(makeDiagnostic('error', 'GRAPH_V2_BAD_ASYMPTOTE', 'Tiệm cận đứng cần "value" là số hữu hạn.', `${field}.value`))
            return
          }
          model.asymptotes.push({ axis: 'x', value: norm.value.num, label: typeof a.label === 'string' ? a.label : '' })
        } else if (a.axis === 'y') {
          if (typeof a.expr !== 'string' || !a.expr.trim()) {
            diagnostics.push(makeDiagnostic('error', 'GRAPH_V2_BAD_ASYMPTOTE', 'Tiệm cận ngang cần "expr".', `${field}.expr`))
            return
          }
          let ast = null
          try {
            ast = parseExpression(a.expr)
          } catch (err) {
            diagnostics.push(makeDiagnostic('error', 'GRAPH_V2_BAD_ASYMPTOTE', `Biểu thức tiệm cận không hợp lệ: ${err.message}`, `${field}.expr`))
            return
          }
          const affine = asAffine(ast)
          if (!affine) {
            diagnostics.push(makeDiagnostic(
              'error', 'GRAPH_V2_BAD_ASYMPTOTE',
              'Tiệm cận ngang chỉ nhận biểu thức hằng hoặc affine (y = ax + b).',
              `${field}.expr`
            ))
            return
          }
          model.asymptotes.push({ axis: 'y', expr: a.expr.trim(), ast, affine, label: typeof a.label === 'string' ? a.label : '' })
        } else {
          diagnostics.push(makeDiagnostic('error', 'GRAPH_V2_BAD_ASYMPTOTE', '"axis" chỉ nhận "x" hoặc "y".', `${field}.axis`))
        }
      })
    }
  }

  if (hasErrors(diagnostics)) return { model: null, diagnostics }
  return { model, diagnostics }
}

function readRange(value, field, diagnostics) {
  if (!Array.isArray(value) || value.length !== 2) {
    diagnostics.push(makeDiagnostic('error', 'GRAPH_V2_BAD_RANGE', `${field} phải là mảng [min, max] (hai số hữu hạn, min < max).`, field))
    return null
  }
  const a = Number(value[0])
  const b = Number(value[1])
  if (!Number.isFinite(a) || !Number.isFinite(b)) {
    diagnostics.push(makeDiagnostic('error', 'GRAPH_V2_BAD_RANGE', `${field} phải gồm hai số hữu hạn.`, field))
    return null
  }
  if (!(a < b)) {
    diagnostics.push(makeDiagnostic('error', 'GRAPH_V2_BAD_RANGE', `${field} cần min < max.`, field))
    return null
  }
  return [a, b]
}

function readBound(value, field, diagnostics, fallback) {
  if (value === null || value === undefined) {
    if (fallback === -Infinity) {
      diagnostics.push(makeDiagnostic('error', 'GRAPH_V2_BAD_DOMAIN', `${field} là bắt buộc.`, field))
      return null
    }
    return fallback
  }
  const norm = normalizeScalar(value)
  if (!norm.ok) {
    diagnostics.push(makeDiagnostic('error', 'GRAPH_V2_BAD_DOMAIN', `${field} không hợp lệ: ${norm.error}.`, field))
    return null
  }
  return norm.value.num
}

/* ================================================================== *
 * GEO3D — version 2
 * ================================================================== */

const GEO_KEYS = ['version', 'points', 'constructions', 'edges', 'rightAngles', 'camera', 'visibility', 'labels']
const GEO_CAMERA_KEYS = ['projection', 'eye', 'target', 'up']
const GEO_CONSTRUCTION_KEYS = ['id', 'op', 'args']
const GEO_EDGE_KEYS = ['ends', 'style']

export const CONSTRUCTION_SPECS = Object.freeze({
  mid: { arity: 2, label: 'trung điểm' },
  centroid: { arity: 3, label: 'trọng tâm' },
  ratio: { arity: 3, label: 'điểm chia tỉ lệ' },
  projectLine: { arity: 3, label: 'hình chiếu lên đường thẳng' },
  projectPlane: { arity: 4, label: 'hình chiếu lên mặt phẳng' }
})

export function validateGeo3dV2(raw) {
  const diagnostics = []
  checkUnknownKeys(raw, GEO_KEYS, 'GEO3D_V2_UNKNOWN_KEY', diagnostics)

  const model = {
    kind: 'geo3d',
    version: 2,
    points: {},
    pointOrder: [],
    edges: [],
    rightAngles: [],
    camera: null,
    labels: {},
    visibility: 'manual'
  }

  // ---- points ----
  if (!isPlainObject(raw.points) || Object.keys(raw.points).length === 0) {
    diagnostics.push(makeDiagnostic('error', 'GEO3D_V2_NO_POINTS', 'Trường "points" bắt buộc và phải có ít nhất 1 điểm.', 'points'))
    return { model: null, diagnostics }
  }
  for (const [id, coord] of Object.entries(raw.points)) {
    if (!/^[A-Za-z][A-Za-z0-9_']*$/.test(id)) {
      diagnostics.push(makeDiagnostic('error', 'GEO3D_V2_BAD_ID', `Tên điểm "${id}" không hợp lệ (chỉ chữ, số, _ và ').`, 'points'))
      continue
    }
    if (!Array.isArray(coord) || coord.length !== 3) {
      diagnostics.push(makeDiagnostic('error', 'GEO3D_V2_BAD_COORD', `Tọa độ điểm "${id}" phải là mảng [x, y, z].`, `points.${id}`))
      continue
    }
    const xyz = []
    let ok = true
    coord.forEach((c, ci) => {
      const norm = normalizeScalar(c)
      if (!norm.ok || !Number.isFinite(norm.value.num)) {
        diagnostics.push(makeDiagnostic('error', 'GEO3D_V2_BAD_COORD', `Toạ độ "${id}"[${ci}] không phải số hữu hạn: ${norm.error || 'giá trị không hữu hạn'}.`, `points.${id}`))
        ok = false
      } else {
        xyz.push(norm.value.num)
      }
    })
    if (!ok) continue
    model.points[id] = xyz
    model.pointOrder.push(id)
  }
  if (model.pointOrder.length === 0) return { model: null, diagnostics }

  // ---- constructions ----
  const constructions = []
  if (raw.constructions !== undefined) {
    if (!Array.isArray(raw.constructions)) {
      diagnostics.push(makeDiagnostic('error', 'GEO3D_V2_BAD_CONSTRUCTION', '"constructions" phải là mảng.', 'constructions'))
    } else {
      raw.constructions.forEach((c, ci) => {
        const field = `constructions[${ci}]`
        if (!isPlainObject(c)) {
          diagnostics.push(makeDiagnostic('error', 'GEO3D_V2_BAD_CONSTRUCTION', 'Mỗi dựng hình phải là object.', field))
          return
        }
        checkUnknownKeys(c, GEO_CONSTRUCTION_KEYS, 'GEO3D_V2_UNKNOWN_KEY', diagnostics, `${field}.`)
        if (typeof c.id !== 'string' || !c.id.trim()) {
          diagnostics.push(makeDiagnostic('error', 'GEO3D_V2_BAD_CONSTRUCTION', 'Dựng hình cần "id" (tên điểm kết quả).', `${field}.id`))
          return
        }
        const id = c.id.trim()
        if (!/^[A-Za-z][A-Za-z0-9_']*$/.test(id)) {
          diagnostics.push(makeDiagnostic('error', 'GEO3D_V2_BAD_ID', `Tên điểm dựng "${id}" không hợp lệ.`, `${field}.id`))
          return
        }
        if (!Object.prototype.hasOwnProperty.call(CONSTRUCTION_SPECS, c.op)) {
          diagnostics.push(makeDiagnostic(
            'error', 'GEO3D_V2_BAD_OP',
            `Phép toán "${c.op}" chưa hỗ trợ (hỗ trợ: ${Object.keys(CONSTRUCTION_SPECS).join(', ')}).`,
            `${field}.op`
          ))
          return
        }
        if (!Array.isArray(c.args)) {
          diagnostics.push(makeDiagnostic('error', 'GEO3D_V2_BAD_CONSTRUCTION', '"args" phải là mảng.', `${field}.args`))
          return
        }
        const spec = CONSTRUCTION_SPECS[c.op]
        if (c.args.length !== spec.arity) {
          diagnostics.push(makeDiagnostic(
            'error', 'GEO3D_V2_BAD_ARITY',
            `Phép toán "${c.op}" cần đúng ${spec.arity} đối số, nhưng có ${c.args.length}.`,
            `${field}.args`
          ))
          return
        }
        constructions.push({ id, op: c.op, args: c.args.slice(), field })
      })
    }
  }

  // trùng ID
  const idSet = new Set(model.pointOrder)
  constructions.forEach(c => {
    if (idSet.has(c.id)) {
      diagnostics.push(makeDiagnostic('error', 'GEO3D_V2_DUPLICATE_ID', `Tên điểm "${c.id}" bị trùng.`, c.field))
    } else {
      idSet.add(c.id)
    }
  })

  // resolve constructions (thiếu tên / vòng phụ thuộc)
  const resolved = resolveConstructions(model.points, constructions, diagnostics)
  if (!resolved) return { model: null, diagnostics }
  model.points = resolved.points
  model.pointOrder = Object.keys(resolved.points)

  // ---- edges ----
  if (raw.edges !== undefined) {
    if (!Array.isArray(raw.edges)) {
      diagnostics.push(makeDiagnostic('error', 'GEO3D_V2_BAD_EDGES', '"edges" phải là mảng.', 'edges'))
    } else {
      raw.edges.forEach((e, ei) => {
        const field = `edges[${ei}]`
        if (!isPlainObject(e)) {
          diagnostics.push(makeDiagnostic('error', 'GEO3D_V2_BAD_EDGES', 'Mỗi cạnh phải là object.', field))
          return
        }
        checkUnknownKeys(e, GEO_EDGE_KEYS, 'GEO3D_V2_UNKNOWN_KEY', diagnostics, `${field}.`)
        if (!Array.isArray(e.ends) || e.ends.length !== 2) {
          diagnostics.push(makeDiagnostic('error', 'GEO3D_V2_BAD_EDGE', '"ends" phải là cặp [đỉnh1, đỉnh2].', `${field}.ends`))
          return
        }
        const [u, v] = e.ends.map(s => String(s).trim())
        if (!model.points[u] || !model.points[v]) {
          diagnostics.push(makeDiagnostic('error', 'GEO3D_V2_BAD_EDGE', `Cạnh [${u}, ${v}] tham chiếu điểm không tồn tại.`, `${field}.ends`))
          return
        }
        if (u === v) {
          diagnostics.push(makeDiagnostic('error', 'GEO3D_V2_BAD_EDGE', `Cạnh [${u}, ${v}] có hai đầu trùng nhau.`, `${field}.ends`))
          return
        }
        const style = e.style === undefined ? 'solid' : e.style
        if (style !== 'solid' && style !== 'dashed') {
          diagnostics.push(makeDiagnostic('error', 'GEO3D_V2_BAD_EDGE', '"style" chỉ nhận "solid" hoặc "dashed".', `${field}.style`))
          return
        }
        model.edges.push({ ends: [u, v], style })
      })
    }
  }

  // ---- rightAngles ----
  if (raw.rightAngles !== undefined) {
    if (!Array.isArray(raw.rightAngles)) {
      diagnostics.push(makeDiagnostic('error', 'GEO3D_V2_BAD_RIGHT_ANGLE', '"rightAngles" phải là mảng các bộ [A, V, B].', 'rightAngles'))
    } else {
      raw.rightAngles.forEach((ra, ri) => {
        const field = `rightAngles[${ri}]`
        if (!Array.isArray(ra) || ra.length !== 3) {
          diagnostics.push(makeDiagnostic('error', 'GEO3D_V2_BAD_RIGHT_ANGLE', 'Mỗi góc vuông phải là bộ [A, V, B] (V là đỉnh).', field))
          return
        }
        const [a, v, b] = ra.map(s => String(s).trim())
        if (!model.points[a] || !model.points[v] || !model.points[b]) {
          diagnostics.push(makeDiagnostic('error', 'GEO3D_V2_BAD_RIGHT_ANGLE', `Góc vuông [${a}, ${v}, ${b}] tham chiếu điểm không tồn tại.`, field))
          return
        }
        const check = checkPerpendicular(model.points[a], model.points[v], model.points[b])
        if (!check.ok) {
          diagnostics.push(makeDiagnostic(
            'error', 'GEO3D_V2_NOT_PERPENDICULAR',
            `Góc vuông [${a}, ${v}, ${b}] không đúng: ${check.reason}`,
            field
          ))
          return
        }
        model.rightAngles.push([a, v, b])
      })
    }
  }

  // ---- camera ----
  if (raw.camera !== undefined) {
    if (!isPlainObject(raw.camera)) {
      diagnostics.push(makeDiagnostic('error', 'GEO3D_V2_BAD_CAMERA', '"camera" phải là object.', 'camera'))
    } else {
      checkUnknownKeys(raw.camera, GEO_CAMERA_KEYS, 'GEO3D_V2_UNKNOWN_KEY', diagnostics, 'camera.')
      if (raw.camera.projection !== undefined && raw.camera.projection !== 'orthographic') {
        diagnostics.push(makeDiagnostic('error', 'GEO3D_V2_BAD_CAMERA', 'Chỉ hỗ trợ phép chiếu "orthographic".', 'camera.projection'))
      }
      const eye = readVector(raw.camera.eye, 'camera.eye', diagnostics)
      const target = readVector(raw.camera.target, 'camera.target', diagnostics)
      const up = readVector(raw.camera.up, 'camera.up', diagnostics)
      if (eye && target && up) {
        const cam = buildCamera(eye, target, up)
        if (!cam.ok) {
          diagnostics.push(makeDiagnostic('error', 'GEO3D_V2_BAD_CAMERA', cam.reason, 'camera'))
        } else {
          model.camera = cam.camera
        }
      }
    }
  }
  if (!model.camera) {
    const cam = defaultCamera(model.points)
    if (cam.ok) {
      model.camera = cam.camera
      diagnostics.push(makeDiagnostic(
        'info', 'GEO3D_V2_DEFAULT_CAMERA',
        'Không khai báo "camera": dùng camera trực giao mặc định (mắt nhìn chéo từ trên xuống). Hãy kiểm tra lại góc nhìn và nét khuất.',
        'camera'
      ))
    } else {
      diagnostics.push(makeDiagnostic('error', 'GEO3D_V2_BAD_CAMERA', cam.reason, 'camera'))
    }
  }

  // ---- visibility ----
  if (raw.visibility !== undefined && raw.visibility !== 'manual') {
    diagnostics.push(makeDiagnostic('error', 'GEO3D_V2_BAD_VISIBILITY', 'Giai đoạn này chỉ hỗ trợ "visibility": "manual".', 'visibility'))
  }

  // ---- labels ----
  if (raw.labels !== undefined) {
    if (!isPlainObject(raw.labels)) {
      diagnostics.push(makeDiagnostic('error', 'GEO3D_V2_BAD_LABELS', '"labels" phải là object.', 'labels'))
    } else {
      for (const [id, cfg] of Object.entries(raw.labels)) {
        if (!model.points[id]) {
          diagnostics.push(makeDiagnostic('error', 'GEO3D_V2_BAD_LABELS', `Nhãn "${id}" không có điểm tương ứng.`, `labels.${id}`))
          continue
        }
        if (!isPlainObject(cfg)) {
          diagnostics.push(makeDiagnostic('error', 'GEO3D_V2_BAD_LABELS', `labels.${id} phải là object.`, `labels.${id}`))
          continue
        }
        checkUnknownKeys(cfg, ['offset'], 'GEO3D_V2_UNKNOWN_KEY', diagnostics, `labels.${id}.`)
        let offset = [0, 0]
        if (cfg.offset !== undefined) {
          if (!Array.isArray(cfg.offset) || cfg.offset.length !== 2 || cfg.offset.some(v => !Number.isFinite(Number(v)))) {
            diagnostics.push(makeDiagnostic('error', 'GEO3D_V2_BAD_LABELS', `labels.${id}.offset phải là [dx, dy] (pixel).`, `labels.${id}.offset`))
            continue
          }
          offset = [Number(cfg.offset[0]), Number(cfg.offset[1])]
        }
        model.labels[id] = { offset }
      }
    }
  }

  if (hasErrors(diagnostics)) return { model: null, diagnostics }
  return { model, diagnostics }
}

function readVector(value, field, diagnostics) {
  if (!Array.isArray(value) || value.length !== 3) {
    diagnostics.push(makeDiagnostic('error', 'GEO3D_V2_BAD_CAMERA', `${field} phải là mảng [x, y, z].`, field))
    return null
  }
  const out = []
  for (let i = 0; i < 3; i++) {
    const n = Number(value[i])
    if (!Number.isFinite(n)) {
      diagnostics.push(makeDiagnostic('error', 'GEO3D_V2_BAD_CAMERA', `${field} phải gồm số hữu hạn.`, field))
      return null
    }
    out.push(n)
  }
  return out
}

/* ------------------------------------------------------------------ *
 * Vector helpers + camera
 * ------------------------------------------------------------------ */

export function vSub(a, b) { return [a[0] - b[0], a[1] - b[1], a[2] - b[2]] }
export function vAdd(a, b) { return [a[0] + b[0], a[1] + b[1], a[2] + b[2]] }
export function vScale(a, k) { return [a[0] * k, a[1] * k, a[2] * k] }
export function vDot(a, b) { return a[0] * b[0] + a[1] * b[1] + a[2] * b[2] }
export function vCross(a, b) {
  return [
    a[1] * b[2] - a[2] * b[1],
    a[2] * b[0] - a[0] * b[2],
    a[0] * b[1] - a[1] * b[0]
  ]
}
export function vLen(a) { return Math.sqrt(vDot(a, a)) }

/** Tạo camera trực giao. */
export function buildCamera(eye, target, up) {
  const dir = vSub(target, eye)
  const len = vLen(dir)
  if (!(len > 1e-9)) return { ok: false, reason: 'camera.eye không được trùng camera.target.' }
  const forward = vScale(dir, 1 / len)
  const right = vCross(forward, up)
  const rLen = vLen(right)
  if (!(rLen > 1e-9)) return { ok: false, reason: 'camera.up không được song song với hướng nhìn.' }
  const r = vScale(right, 1 / rLen)
  const trueUp = vCross(r, forward)
  return {
    ok: true,
    camera: {
      projection: 'orthographic',
      eye, target, up,
      right: r,
      trueUp,
      forward
    }
  }
}

/** Camera mặc định khi không khai báo (thông báo cho giáo viên). */
export function defaultCamera(points) {
  const ids = Object.keys(points)
  if (!ids.length) return { ok: false, reason: 'Không có điểm nào để dựng camera.' }
  const lo = [Infinity, Infinity, Infinity]
  const hi = [-Infinity, -Infinity, -Infinity]
  ids.forEach(id => {
    const p = points[id]
    for (let i = 0; i < 3; i++) {
      lo[i] = Math.min(lo[i], p[i])
      hi[i] = Math.max(hi[i], p[i])
    }
  })
  const center = [(lo[0] + hi[0]) / 2, (lo[1] + hi[1]) / 2, (lo[2] + hi[2]) / 2]
  const size = Math.max(hi[0] - lo[0], hi[1] - lo[1], hi[2] - lo[2], 1)
  const eye = [center[0] + size * 1.4, center[1] - size * 1.8, center[2] + size * 1.2]
  const built = buildCamera(eye, center, [0, 0, 1])
  if (!built.ok) return built
  return { ok: true, camera: built.camera }
}

/** Kiểm tra vuông góc trong không gian (tương đối). */
export function checkPerpendicular(a, v, b) {
  const u1 = vSub(a, v)
  const u2 = vSub(b, v)
  const l1 = vLen(u1)
  const l2 = vLen(u2)
  if (!(l1 > 1e-9) || !(l2 > 1e-9)) {
    return { ok: false, reason: 'vector tới đỉnh bị suy biến (trùng điểm).' }
  }
  const dot = vDot(u1, u2)
  const cos = dot / (l1 * l2)
  const tol = 1e-6
  if (Math.abs(cos) > tol) {
    return { ok: false, reason: `cos góc = ${cos.toFixed(4)} ≠ 0 (góc không vuông).` }
  }
  return { ok: true }
}

/* ------------------------------------------------------------------ *
 * Giải phụ thuộc dựng hình (topological sort)
 * ------------------------------------------------------------------ */

function resolveConstructions(basePoints, constructions, diagnostics) {
  const points = { ...basePoints }
  const byId = new Map()
  constructions.forEach(c => byId.set(c.id, c))

  const state = new Map() // id -> 'visiting' | 'done'
  const stack = []

  const visit = (c) => {
    const st = state.get(c.id)
    if (st === 'done') return
    if (st === 'visiting') {
      diagnostics.push(makeDiagnostic(
        'error', 'GEO3D_V2_CYCLE',
        `Vòng phụ thuộc khi dựng "${c.id}": ${[...stack, c.id].join(' → ')}.`,
        c.field
      ))
      return
    }
    state.set(c.id, 'visiting')
    stack.push(c.id)
    for (const arg of c.args) {
      if (typeof arg !== 'string') continue
      if (byId.has(arg)) {
        visit(byId.get(arg))
      } else if (!points[arg]) {
        diagnostics.push(makeDiagnostic(
          'error', 'GEO3D_V2_MISSING_POINT',
          `Dựng "${c.id}" tham chiếu điểm "${arg}" không tồn tại.`,
          c.field
        ))
      }
    }
    stack.pop()
    state.set(c.id, 'done')

    const missing = c.args.filter(a => typeof a === 'string' && !points[a])
    if (missing.length) return

    let result = null
    try {
      result = computeConstruction(c, points)
    } catch (err) {
      diagnostics.push(makeDiagnostic(
        'error', 'GEO3D_V2_BAD_CONSTRUCTION',
        `Không dựng được "${c.id}": ${err.message}`,
        c.field
      ))
      return
    }
    points[c.id] = result
  }

  constructions.forEach(c => visit(c))
  if (hasErrors(diagnostics)) return null
  return { points }
}

function computeConstruction(c, points) {
  const P = (name) => {
    const p = points[name]
    if (!p) throw new Error(`thiếu điểm "${name}"`)
    return p
  }
  switch (c.op) {
    case 'mid': {
      const a = P(c.args[0]); const b = P(c.args[1])
      return [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2, (a[2] + b[2]) / 2]
    }
    case 'centroid': {
      const a = P(c.args[0]); const b = P(c.args[1]); const cc = P(c.args[2])
      return [(a[0] + b[0] + cc[0]) / 3, (a[1] + b[1] + cc[1]) / 3, (a[2] + b[2] + cc[2]) / 3]
    }
    case 'ratio': {
      const a = P(c.args[0]); const b = P(c.args[1])
      const tRaw = c.args[2]
      let t
      if (typeof tRaw === 'number') t = tRaw
      else {
        const norm = normalizeScalar(tRaw)
        if (!norm.ok || !Number.isFinite(norm.value.num)) throw new Error('tham số t không phải số hữu hạn')
        t = norm.value.num
      }
      return [a[0] + t * (b[0] - a[0]), a[1] + t * (b[1] - a[1]), a[2] + t * (b[2] - a[2])]
    }
    case 'projectLine': {
      const p = P(c.args[0]); const a = P(c.args[1]); const b = P(c.args[2])
      const ab = vSub(b, a)
      const den = vDot(ab, ab)
      if (!(den > 1e-12)) throw new Error('đường thẳng AB bị suy biến (A = B)')
      const t = vDot(vSub(p, a), ab) / den
      return [a[0] + t * ab[0], a[1] + t * ab[1], a[2] + t * ab[2]]
    }
    case 'projectPlane': {
      const p = P(c.args[0]); const a = P(c.args[1]); const b = P(c.args[2]); const cc = P(c.args[3])
      const n = vCross(vSub(b, a), vSub(cc, a))
      const den = vDot(n, n)
      if (!(den > 1e-12)) throw new Error('mặt phẳng ABC bị suy biến (A, B, C thẳng hàng)')
      const t = vDot(vSub(p, a), n) / den
      return [p[0] - t * n[0], p[1] - t * n[1], p[2] - t * n[2]]
    }
    default:
      throw new Error(`phép toán "${c.op}" chưa hỗ trợ`)
  }
}

export { evaluate, isDefinedAt, checkExpression }
