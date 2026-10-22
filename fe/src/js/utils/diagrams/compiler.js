/**
 * compiler.js — Bộ biên dịch khối hình toán (bbt / graph / geo3d).
 *
 * Kiến trúc:  text → (V2 JSON | legacy) → schema validation → model toán học → layout → SVG
 *
 * Kết quả: { ok, model, svg, diagnostics }
 *   - diagnostics: [{ severity, code, field, line, message }]
 *   - ok = false khi có diagnostic mức 'error' (không vẽ được hình).
 */

import {
  validateBbtV2,
  validateGraphV2,
  validateGeo3dV2,
  makeDiagnostic,
  hasErrors
} from './schema.js'
import {
  adaptLegacyBBT,
  adaptLegacyGraph,
  adaptLegacyGeo3d
} from './legacy-adapter.js'
import { renderBBT } from './bbt.js'
import { renderGraph } from './graph.js'
import { renderGeo3D, renderLegacyGeo3D } from './geometry3d.js'
import { errorBox } from './svg.js'

export const DIAGRAM_TYPES = ['bbt', 'graph', 'geo3d']

/**
 * Biên dịch một khối hình.
 * @param {string} type 'bbt' | 'graph' | 'geo3d'
 * @param {string} code nội dung khối
 * @param {object} ctx   { uid?:number, question?:number, line?:number }
 */
export function compileDiagram(type, code, ctx = {}) {
  const kind = String(type || '').toLowerCase()
  const diagnostics = []

  if (!DIAGRAM_TYPES.includes(kind)) {
    diagnostics.push(makeDiagnostic('error', 'UNKNOWN_DIAGRAM_TYPE', `Loại khối hình "${type}" không được hỗ trợ (bbt, graph, geo3d).`, null, ctx.line ?? null))
    return { ok: false, model: null, svg: '', diagnostics }
  }

  const text = String(code == null ? '' : code).trim()
  if (!text) {
    diagnostics.push(makeDiagnostic('error', 'EMPTY_DIAGRAM', `Khối hình "${kind}" rỗng.`, null, ctx.line ?? null))
    return { ok: false, model: null, svg: '', diagnostics }
  }

  const isJson = text.startsWith('{')
  let model = null

  if (isJson) {
    let raw
    try {
      raw = JSON.parse(text)
    } catch (err) {
      diagnostics.push(makeDiagnostic(
        'error', 'INVALID_JSON',
        `JSON không hợp lệ: ${err.message}`,
        null, ctx.line ?? null
      ))
      return { ok: false, model: null, svg: '', diagnostics }
    }
    if (!raw || typeof raw !== 'object' || Array.isArray(raw)) {
      diagnostics.push(makeDiagnostic('error', 'INVALID_JSON', 'Nội dung JSON phải là object.', null, ctx.line ?? null))
      return { ok: false, model: null, svg: '', diagnostics }
    }
    if (raw.version !== 2) {
      diagnostics.push(makeDiagnostic(
        'error', 'UNSUPPORTED_VERSION',
        `Phiên bản khối hình "${raw.version === undefined ? 'không khai báo' : raw.version}" chưa được hỗ trợ. Hãy dùng JSON với "version": 2.`,
        'version', ctx.line ?? null
      ))
      return { ok: false, model: null, svg: '', diagnostics }
    }
    const res = kind === 'bbt' ? validateBbtV2(raw)
      : (kind === 'graph' ? validateGraphV2(raw) : validateGeo3dV2(raw))
    diagnostics.push(...res.diagnostics)
    model = res.model
  } else {
    const res = kind === 'bbt' ? adaptLegacyBBT(text)
      : (kind === 'graph' ? adaptLegacyGraph(text) : adaptLegacyGeo3d(text))
    diagnostics.push(...res.diagnostics)
    model = res.model
  }

  if (!model || hasErrors(diagnostics)) {
    return { ok: false, model: null, svg: '', diagnostics }
  }

  const renderDiagnostics = []
  let svg = ''
  try {
    if (kind === 'bbt') svg = renderBBT(model, ctx.uid ?? 0, renderDiagnostics)
    else if (kind === 'graph') svg = renderGraph(model, ctx.uid ?? 0, renderDiagnostics)
    else if (model.kind === 'geo3d-legacy') svg = renderLegacyGeo3D(model, ctx.uid ?? 0, renderDiagnostics)
    else svg = renderGeo3D(model, ctx.uid ?? 0, renderDiagnostics)
  } catch (err) {
    diagnostics.push(makeDiagnostic(
      'error', 'RENDER_FAILED',
      `Lỗi khi dựng hình: ${err && err.message ? err.message : err}`,
      null, ctx.line ?? null
    ))
    return { ok: false, model: null, svg: '', diagnostics }
  }
  diagnostics.push(...renderDiagnostics)

  return { ok: !hasErrors(diagnostics), model, svg, diagnostics }
}

/** Biểu diễn diagnostic thành text (dùng cho thông báo trong UI). */
export function formatDiagnostics(diagnostics = []) {
  return (diagnostics || []).map(d => {
    const sev = d.severity === 'error' ? 'LỖI' : (d.severity === 'warning' ? 'CẢNH BÁO' : 'THÔNG TIN')
    const where = d.field ? ` [${d.field}]` : ''
    return `${sev}${where}: ${d.message}`
  })
}

/** HTML hộp lỗi có cấu trúc (dùng khi không vẽ được hình). */
export function renderDiagramError(type, diagnostics) {
  return errorBox(type, diagnostics)
}
