import { buildCamera } from './schema.js'

const W = 360; const H = 300; const PAD = 28
const cross = (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]]
const sub = (a, b) => a.map((v, i) => v - b[i])
const dot = (a, b) => a.reduce((s, v, i) => s + v * b[i], 0)
const add = (a, b) => a.map((v, i) => v + b[i])
const scale = (a, k) => a.map(v => v * k)

function escapeXml(s) { return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;') }
function cameraFor(raw, center) {
  const c = raw.camera || { eye: [7, -10, 7], target: center, up: [0, 0, 1] }
  const built = buildCamera(c.eye, c.target, c.up)
  return built.ok ? built.camera : null
}
function mapping(camera, samples) {
  const qs = samples.map(p => [dot(sub(p, camera.target), camera.right), dot(sub(p, camera.target), camera.trueUp)])
  const xs = qs.map(q => q[0]); const ys = qs.map(q => q[1])
  const minX = Math.min(...xs); const maxX = Math.max(...xs); const minY = Math.min(...ys); const maxY = Math.max(...ys)
  const sx = (W - 2 * PAD) / Math.max(maxX - minX, 1e-9); const sy = (H - 2 * PAD) / Math.max(maxY - minY, 1e-9)
  const k = Math.min(sx, sy); const cx = (minX + maxX) / 2; const cy = (minY + maxY) / 2
  return p => { const q = [dot(sub(p, camera.target), camera.right), dot(sub(p, camera.target), camera.trueUp)]; return [W / 2 + (q[0] - cx) * k, H / 2 - (q[1] - cy) * k] }
}
function line(a, b, dashed = false, color = '#0f172a', width = 1.25) {
  return `<line x1="${a[0].toFixed(2)}" y1="${a[1].toFixed(2)}" x2="${b[0].toFixed(2)}" y2="${b[1].toFixed(2)}" stroke="${color}" stroke-width="${width}"${dashed ? ' stroke-dasharray="5,4"' : ''}/>`
}
function label(p, text) { return `<text x="${(p[0] + 6).toFixed(2)}" y="${(p[1] - 6).toFixed(2)}" font-size="12" fill="#0f172a">${escapeXml(text)}</text>` }

export function validateSpatial(raw, type) {
  const diagnostics = []; const model = { kind: type, version: 2 }
  const error = (code, message, field) => diagnostics.push({ severity: 'error', code, message, field })
  if (!raw || raw.version !== 2) error('SPATIAL_BAD_VERSION', 'Khối cần "version": 2.', 'version')
  const center = raw?.center || [0, 0, 0]
  if (type === 'sphere3d') {
    if (!Array.isArray(center) || center.length !== 3 || center.some(v => !Number.isFinite(Number(v)))) error('SPHERE_BAD_CENTER', 'center phải là [x,y,z] hữu hạn.', 'center')
    if (!(Number(raw?.radius) > 0)) error('SPHERE_BAD_RADIUS', 'radius phải lớn hơn 0.', 'radius')
    model.center = center.map(Number); model.radius = Number(raw.radius); model.wireframe = raw.wireframe || {}; model.axes = raw.axes === true
    if (raw.sectionPlane !== undefined) {
      const plane = raw.sectionPlane
      if (!plane || !Array.isArray(plane.normal) || plane.normal.length !== 3 || plane.normal.some(v => !Number.isFinite(Number(v)))) {
        error('SPHERE_BAD_PLANE', 'sectionPlane.normal phải là vector [x,y,z] hữu hạn.', 'sectionPlane.normal')
      } else if (!(plane.normal.some(v => Number(v) !== 0))) {
        error('SPHERE_BAD_PLANE', 'sectionPlane.normal không được là vector 0.', 'sectionPlane.normal')
      } else {
        model.sectionPlane = { normal: plane.normal.map(Number), offset: Number(plane.offset || 0), label: plane.label || '(P)' }
        const nLen = Math.sqrt(model.sectionPlane.normal.reduce((s, v) => s + v * v, 0))
        const distance = Math.abs(model.sectionPlane.offset - model.sectionPlane.normal.reduce((s, v, i) => s + v * model.center[i], 0)) / nLen
        if (distance > model.radius + 1e-9) error('SPHERE_NO_SECTION', 'Mặt phẳng không cắt mặt cầu: khoảng cách từ tâm đến mặt phẳng lớn hơn bán kính.', 'sectionPlane')
      }
    }
  } else {
    model.ranges = raw?.ranges || { x: [-4, 4], y: [-4, 4], z: [0, 4] }
    for (const axis of ['x', 'y', 'z']) if (!Array.isArray(model.ranges[axis]) || model.ranges[axis].length !== 2 || !(Number(model.ranges[axis][0]) < Number(model.ranges[axis][1]))) error('AXES_BAD_RANGE', `Khoảng trục ${axis} không hợp lệ.`, `ranges.${axis}`)
    model.step = Number(raw?.step || 1); model.labels = raw?.labels || { x: 'x', y: 'y', z: 'z', origin: 'O' }
  }
  const cam = cameraFor(raw || {}, center); if (!cam) error('SPATIAL_BAD_CAMERA', 'Camera không hợp lệ.', 'camera'); model.camera = cam
  return { model: diagnostics.some(d => d.severity === 'error') ? null : model, diagnostics }
}

export function renderSpatial(model) {
  const center = model.kind === 'sphere3d' ? model.center : [0, 0, 0]
  const radius = model.kind === 'sphere3d' ? model.radius : Math.max(...Object.values(model.ranges).map(r => Math.max(Math.abs(r[0]), Math.abs(r[1]))))
  const samples = Array.from({ length: 20 }, (_, i) => [center[0] + radius * Math.cos(i * Math.PI / 10), center[1] + radius * Math.sin(i * Math.PI / 10), center[2]])
  const toPx = mapping(model.camera, samples.concat([add(center, [0, 0, radius]), add(center, [0, 0, -radius])]))
  let svg = `<svg width="${W}" height="${H}" viewBox="0 0 ${W} ${H}" style="background:#fff;border:1px solid #cbd5e1;border-radius:6px;max-width:100%;">`
  const axis = (dir, text, range) => { const a = toPx(add(center, scale(dir, range[0]))); const b = toPx(add(center, scale(dir, range[1]))); svg += line(a, b, false, '#334155', 1.1) + label(b, text) }
  if (model.kind === 'axes3d' || model.axes) {
    axis([1, 0, 0], model.labels?.x || 'x', model.kind === 'axes3d' ? model.ranges.x : [-radius, radius])
    axis([0, 1, 0], model.labels?.y || 'y', model.kind === 'axes3d' ? model.ranges.y : [-radius, radius])
    axis([0, 0, 1], model.labels?.z || 'z', model.kind === 'axes3d' ? model.ranges.z : [0, radius])
    svg += label(toPx(center), model.labels?.origin || 'O')
  }
  if (model.kind === 'sphere3d') {
    // Quy ước hình cầu THPT: đường bao ngoài liền; đường tròn/đường kính
    // phía sau đứt; nếu có mặt phẳng thì vẽ giao tuyến và chân chiếu H.
    const circle = (points, color, width, dashed = false) => {
      svg += `<polyline points="${points.map(p => { const q = toPx(p); return `${q[0].toFixed(2)},${q[1].toFixed(2)}` }).join(' ')}" fill="none" stroke="${color}" stroke-width="${width}"${dashed ? ' stroke-dasharray="4,3"' : ''}/>`
    }
    const cameraU = cameraBasis(model.camera, [1, 0, 0])
    const cameraV = cross(model.camera.forward, cameraU)
    const outline = Array.from({ length: 97 }, (_, i) => { const t = i * 2 * Math.PI / 96; return add(center, scale(add(scale(cameraU, Math.cos(t)), scale(cameraV, Math.sin(t))), radius)) })
    circle(outline, '#334155', 1.2)
    if (model.sectionPlane) {
      const plane = model.sectionPlane
      const nLen = Math.sqrt(dot(plane.normal, plane.normal)); const n = scale(plane.normal, 1 / nLen)
      const signed = (plane.offset - dot(n, center))
      const sectionRadiusSq = radius * radius - signed * signed
      if (sectionRadiusSq > 1e-8) {
        const H = add(center, scale(n, signed)); const sectionRadius = Math.sqrt(sectionRadiusSq)
        const u = normalized(Math.abs(n[2]) < 0.9 ? cross(n, [0, 0, 1]) : cross(n, [1, 0, 0]))
        const v = cross(n, u)
        const section = Array.from({ length: 97 }, (_, i) => { const t = i * 2 * Math.PI / 96; return add(H, scale(add(scale(u, Math.cos(t)), scale(v, Math.sin(t))), sectionRadius)) })
        const visible = []; const hidden = []
        for (let i = 0; i < 96; i++) {
          const mid = add(section[i], section[i + 1]); const facing = dot(sub(mid, center), sub(model.camera.eye, center)) >= 0
          ;(facing ? visible : hidden).push(section[i], section[i + 1])
        }
        circle(hidden, '#64748b', 1, true); circle(visible, '#334155', 1.15)
        const viewOnPlane = sub(model.camera.eye, H); const dir = normalized(sub(viewOnPlane, scale(n, dot(viewOnPlane, n))))
        const A = add(H, scale(dir, sectionRadius));
        svg += line(toPx(center), toPx(H), true, '#2563eb', 1)
        svg += line(toPx(H), toPx(A), false, '#2563eb', 1)
        svg += label(toPx(center), 'I') + label(toPx(H), 'H') + label(toPx(A), 'A') + label(toPx(add(H, scale(dir, sectionRadius * 1.2))), 'R')
        svg += label(toPx(add(H, scale(n, radius * 1.35))), plane.label || '(P)')
      }
    }
  }
  svg += '</svg>'
  return `<div class="diagram-wrap" style="margin:12px 0;display:flex;justify-content:center;overflow-x:auto;">${svg}</div>`
}

function normalized(v) { const len = Math.sqrt(dot(v, v)); return len > 1e-9 ? scale(v, 1 / len) : [1, 0, 0] }
function cameraBasis(camera, fallback) { return normalized(Math.abs(dot(camera.forward, fallback)) > 0.9 ? cross(camera.forward, [0, 1, 0]) : cross(camera.forward, fallback)) }
