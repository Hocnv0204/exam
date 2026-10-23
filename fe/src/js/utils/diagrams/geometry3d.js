/**
 * geometry3d.js — Hình học không gian.
 *
 * V2 (JSON version 2): dựng hình bằng TỌA ĐỘ TOÁN HỌC 3D, tính các điểm dựng
 * (trung điểm, trọng tâm, ratio, hình chiếu lên đường thẳng / mặt phẳng) trong
 * không gian rồi CHIẾU TRỰC GIAO (orthographic) ra 2D. Camera cố định; manual
 * dùng style người soạn, auto dùng faces + depth test cho đa diện lồi.
 *
 * Legacy (key:value cũ): hình sơ đồ 2D với toạ độ pixel — KHÔNG phải dựng hình 3D
 * đúng, nên adapter phát cảnh báo rõ ràng.
 */

import { diagramWrap, foreignLabel, escapeXml, r2 } from './svg.js'
import { vSub, vLen, vDot } from './schema.js'

const WIDTH = 320
const HEIGHT = 280
const MARGIN = 26
const VIS_TOL = 1e-7
const vCross = (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]]
const vAdd = (a, b) => [a[0] + b[0], a[1] + b[1], a[2] + b[2]]
const vScale = (a, k) => [a[0] * k, a[1] * k, a[2] * k]
const edgeKey = (a, b) => [a, b].sort().join('\u0000')

function pointInPolygon(point, polygon) {
  let inside = false
  for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i++) {
    const xi = polygon[i][0]; const yi = polygon[i][1]
    const xj = polygon[j][0]; const yj = polygon[j][1]
    if (((yi > point[1]) !== (yj > point[1])) && point[0] < (xj - xi) * (point[1] - yi) / ((yj - yi) || 1e-15) + xi) inside = !inside
  }
  return inside
}

function prepareFaceInfos(model, camera, projection) {
  const points = Object.values(model.points)
  const center = points.reduce((sum, p) => vAdd(sum, p), [0, 0, 0]).map(v => v / Math.max(1, points.length))
  return (model.faces || []).map(face => {
    const vertices = face.vertices.map(id => model.points[id])
    const p0 = vertices[0]
    let normal = vCross(vSub(vertices[1], p0), vSub(vertices[2], p0))
    const len = vLen(normal)
    if (!(len > VIS_TOL)) return null
    normal = vScale(normal, 1 / len)
    if (vDot(normal, vSub(center, p0)) > 0) normal = vScale(normal, -1)
    return {
      id: face.id,
      p0,
      normal,
      front: vDot(normal, vSub(camera.eye, p0)) > VIS_TOL,
      polygon: vertices.map(p => projection.toPx(projectToPlane(camera, p)))
    }
  }).filter(Boolean)
}

function isOccluded(point, info, camera, projection) {
  if (Math.abs(vDot(info.normal, vSub(point, info.p0))) <= 1e-6) return false
  const denom = vDot(info.normal, camera.forward)
  if (Math.abs(denom) <= VIS_TOL) return false
  const t = vDot(info.normal, vSub(info.p0, camera.eye)) / denom
  const depth = vDot(vSub(point, camera.eye), camera.forward)
  if (!(t > VIS_TOL && t < depth - VIS_TOL)) return false
  return pointInPolygon(projection.toPx(projectToPlane(camera, point)), info.polygon)
}

function makeFaceEdgeMap(model) {
  const map = new Map()
  for (const face of model.faces || []) {
    for (let i = 0; i < face.vertices.length; i++) {
      const key = edgeKey(face.vertices[i], face.vertices[(i + 1) % face.vertices.length])
      if (!map.has(key)) map.set(key, [])
      map.get(key).push(face.id)
    }
  }
  return map
}

function autoEdgeRuns(model, edge, infos, faceMap, camera, projection) {
  const [u, v] = edge.ends
  const a = model.points[u]; const b = model.points[v]
  const adjacent = faceMap.get(edgeKey(u, v)) || []
  const infoById = new Map(infos.map(info => [info.id, info]))
  const stateAt = (t) => {
    const p = vAdd(a, vScale(vSub(b, a), t))
    if (adjacent.length) return adjacent.some(id => infoById.get(id)?.front)
    return !infos.some(info => isOccluded(p, info, camera, projection))
  }
  const n = 32
  const states = Array.from({ length: n + 1 }, (_, i) => stateAt(i / n))
  const cuts = [0]
  for (let i = 1; i <= n; i++) {
    if (states[i] === states[i - 1]) continue
    let lo = (i - 1) / n; let hi = i / n; const before = states[i - 1]
    for (let k = 0; k < 14; k++) {
      const mid = (lo + hi) / 2
      if (stateAt(mid) === before) lo = mid; else hi = mid
    }
    cuts.push((lo + hi) / 2)
  }
  cuts.push(1)
  return cuts.slice(0, -1).map((from, i) => ({ from, to: cuts[i + 1], visible: stateAt((from + cuts[i + 1]) / 2) }))
}

/* ------------------------------------------------------------------ *
 * Chiếu trực giao
 * ------------------------------------------------------------------ */

/** Chiếu một điểm 3D lên mặt phẳng 2D của camera (trước khi fit). */
export function projectToPlane(camera, p) {
  const d = vSub(p, camera.target)
  return [vDot(d, camera.right), vDot(d, camera.trueUp)]
}

/**
 * Dựng khung nhìn pixel từ camera + tập điểm (fit đều, KHÔNG scale x/y riêng).
 */
export function buildProjection(camera, points) {
  const ids = Object.keys(points)
  const proj = {}
  let minX = Infinity
  let maxX = -Infinity
  let minY = Infinity
  let maxY = -Infinity
  ids.forEach(id => {
    const q = projectToPlane(camera, points[id])
    proj[id] = q
    minX = Math.min(minX, q[0])
    maxX = Math.max(maxX, q[0])
    minY = Math.min(minY, q[1])
    maxY = Math.max(maxY, q[1])
  })
  if (!ids.length) return { proj, toPx: () => [0, 0], scale: 1 }
  const spanX = Math.max(maxX - minX, 1e-9)
  const spanY = Math.max(maxY - minY, 1e-9)
  const plotW = WIDTH - 2 * MARGIN
  const plotH = HEIGHT - 2 * MARGIN
  const scale = Math.min(plotW / spanX, plotH / spanY)
  const cx = (minX + maxX) / 2
  const cy = (minY + maxY) / 2
  const toPx = (q) => [
    WIDTH / 2 + (q[0] - cx) * scale,
    HEIGHT / 2 - (q[1] - cy) * scale
  ]
  return { proj, toPx, scale, center: [cx, cy] }
}

/* ------------------------------------------------------------------ *
 * Vẽ hình 3D (V2)
 * ------------------------------------------------------------------ */

export function renderGeo3D(model, uid, diagnostics = []) {
  const camera = model.camera
  const points = model.points
  if (!camera || !Object.keys(points).length) {
    return diagramWrap(`<svg width="${WIDTH}" height="${HEIGHT}"></svg>`)
  }

  const projection = buildProjection(camera, points)
  const { proj, toPx, scale } = projection
  const px = (id) => {
    const q = proj[id]
    return q ? toPx(q) : [WIDTH / 2, HEIGHT / 2]
  }

  let svg = `<svg width="${WIDTH}" height="${HEIGHT}" viewBox="0 0 ${WIDTH} ${HEIGHT}" style="background:#fff;border:1px solid #cbd5e1;border-radius:6px;max-width:100%;">`

  // --- cạnh: manual giữ nguyên; auto dùng mặt + depth test và tách run ---
  const faceInfos = model.visibility === 'auto' ? prepareFaceInfos(model, camera, projection) : []
  const faceMap = model.visibility === 'auto' ? makeFaceEdgeMap(model) : new Map()
  model.edges.forEach(edge => {
    const [u, v] = edge.ends
    const a3 = points[u]; const b3 = points[v]
    const drawRun = (from, to, visible) => {
      const p1 = vAdd(a3, vScale(vSub(b3, a3), from))
      const p2 = vAdd(a3, vScale(vSub(b3, a3), to))
      const a = px(u); const b = px(v)
      const q1 = from === 0 ? a : toPx(projectToPlane(camera, p1))
      const q2 = to === 1 ? b : toPx(projectToPlane(camera, p2))
      const dash = visible ? '' : ' stroke-dasharray="5,4"'
      svg += `<line x1="${r2(q1[0])}" y1="${r2(q1[1])}" x2="${r2(q2[0])}" y2="${r2(q2[1])}" stroke="#0f172a" stroke-width="1.5"${dash}/>`
    }
    if (model.visibility !== 'auto' || edge.styleExplicit) {
      drawRun(0, 1, edge.style !== 'dashed')
    } else {
      autoEdgeRuns(model, edge, faceInfos, faceMap, camera, projection).forEach(run => drawRun(run.from, run.to, run.visible))
    }
  })

  // --- ký hiệu góc vuông ---
  model.rightAngles.forEach(([aId, vId, bId]) => {
    const A = points[aId]
    const V = points[vId]
    const B = points[bId]
    const u1 = vSub(A, V)
    const u2 = vSub(B, V)
    const l1 = vLen(u1)
    const l2 = vLen(u2)
    if (!(l1 > 1e-9) || !(l2 > 1e-9)) return
    let sMath = 0.16 * Math.min(l1, l2)
    let sPx = sMath * scale
    if (sPx > 26) { sPx = 26; sMath = sPx / scale }
    if (sPx < 8) { sPx = 8; sMath = sPx / scale }
    const e1 = [u1[0] / l1, u1[1] / l1, u1[2] / l1]
    const e2 = [u2[0] / l2, u2[1] / l2, u2[2] / l2]
    const p1 = [V[0] + e1[0] * sMath, V[1] + e1[1] * sMath, V[2] + e1[2] * sMath]
    const p2 = [V[0] + e1[0] * sMath + e2[0] * sMath, V[1] + e1[1] * sMath + e2[1] * sMath, V[2] + e1[2] * sMath + e2[2] * sMath]
    const p3 = [V[0] + e2[0] * sMath, V[1] + e2[1] * sMath, V[2] + e2[2] * sMath]
    const q1 = toPx(projectToPlane(camera, p1))
    const q2 = toPx(projectToPlane(camera, p2))
    const q3 = toPx(projectToPlane(camera, p3))
    svg += `<polyline points="${r2(q1[0])},${r2(q1[1])} ${r2(q2[0])},${r2(q2[1])} ${r2(q3[0])},${r2(q3[1])}" fill="none" stroke="#334155" stroke-width="1.1"/>`
  })

  // --- điểm + nhãn ---
  model.pointOrder.forEach(id => {
    const p = px(id)
    svg += `<circle cx="${r2(p[0])}" cy="${r2(p[1])}" r="2.6" fill="#0f172a"/>`
    const cfg = model.labels[id]
    const offset = cfg ? cfg.offset : [8, -18]
    svg += foreignLabel(p[0] + offset[0], p[1] + offset[1], 34, 22, id, { fontSize: 12, justify: 'flex-start', align: 'left' })
  })

  svg += `</svg>`
  return diagramWrap(svg)
}

/* ------------------------------------------------------------------ *
 * Hình sơ đồ 2D kiểu legacy (KHÔNG phải dựng hình 3D chuẩn)
 * ------------------------------------------------------------------ */

/**
 * Vẽ hình sơ đồ legacy 2D.
 * @param {object} model { kind:'geo3d-legacy', points:{id:[x,y]}, solid:[], dashed:[], rightAngles:[] }
 */
export function renderLegacyGeo3D(model, uid, diagnostics = []) {
  const pts = model.points
  const W = 300
  const H = 270

  let svg = `<svg width="${W}" height="${H}" viewBox="0 0 ${W} ${H}" style="background:#fff;border:1px solid #cbd5e1;border-radius:6px;max-width:100%;">`

  // ký hiệu góc vuông (vuông trong mặt phẳng hình vẽ 2D)
  model.rightAngles.forEach(([pA, pV, pB]) => {
    const A = pts[pA]
    const V = pts[pV]
    const B = pts[pB]
    if (!A || !V || !B) return
    const size = 9
    const u1x = A[0] - V[0]
    const u1y = A[1] - V[1]
    const l1 = Math.hypot(u1x, u1y) || 1
    const u2x = B[0] - V[0]
    const u2y = B[1] - V[1]
    const l2 = Math.hypot(u2x, u2y) || 1
    const p1 = [V[0] + (u1x / l1) * size, V[1] + (u1y / l1) * size]
    const p2 = [p1[0] + (u2x / l2) * size, p1[1] + (u2y / l2) * size]
    const p3 = [V[0] + (u2x / l2) * size, V[1] + (u2y / l2) * size]
    svg += `<polyline points="${r2(p1[0])},${r2(p1[1])} ${r2(p2[0])},${r2(p2[1])} ${r2(p3[0])},${r2(p3[1])}" fill="none" stroke="#334155" stroke-width="1"/>`
  })

  model.dashed.forEach(([u, v]) => {
    const A = pts[u]
    const B = pts[v]
    if (!A || !B) return
    svg += `<line x1="${r2(A[0])}" y1="${r2(A[1])}" x2="${r2(B[0])}" y2="${r2(B[1])}" stroke="#1e293b" stroke-width="1.25" stroke-dasharray="5,4"/>`
  })

  model.solid.forEach(([u, v]) => {
    const A = pts[u]
    const B = pts[v]
    if (!A || !B) return
    svg += `<line x1="${r2(A[0])}" y1="${r2(A[1])}" x2="${r2(B[0])}" y2="${r2(B[1])}" stroke="#0f172a" stroke-width="1.45"/>`
  })

  Object.entries(pts).forEach(([label, xy]) => {
    const x = xy[0]
    const y = xy[1]
    svg += `<circle cx="${r2(x)}" cy="${r2(y)}" r="2.4" fill="#0f172a"/>`
    const offsetX = x < 90 ? -20 : (x > 190 ? 6 : -8)
    const offsetY = y < 60 ? -22 : (y > 200 ? 4 : -18)
    svg += foreignLabel(x + offsetX, y + offsetY, 30, 22, label, { fontSize: 12, justify: 'flex-start', align: 'left' })
  })

  svg += `</svg>`
  return diagramWrap(svg)
}
