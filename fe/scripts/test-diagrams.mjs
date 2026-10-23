/**
 * test-diagrams.mjs — Bộ kiểm thử hồi quy cho khối hình toán (bbt / graph / geo3d)
 * và trình phân tích đề (parser).
 *
 * Chạy:  node fe/scripts/test-diagrams.mjs
 * Không cần trình duyệt, không cần API.
 *
 * Nguyên tắc: mọi khẳng định dùng giá trị/QUAN HỆ toán học độc lập làm chuẩn,
 * không chỉ assert "có <svg>".
 */

import { readFileSync, existsSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, resolve } from 'node:path'
import { createHash } from 'node:crypto'

import {
  parseExpression, evaluate, evaluateConstant, isDefinedAt, asAffine, ExpressionError
} from '../src/js/utils/diagrams/expression.js'
import {
  validateBbtV2, validateGraphV2, validateGeo3dV2, hasErrors, normalizeScalar
} from '../src/js/utils/diagrams/schema.js'
import {
  adaptLegacyBBT, adaptLegacyGraph, adaptLegacyGeo3d
} from '../src/js/utils/diagrams/legacy-adapter.js'
import { compileDiagram } from '../src/js/utils/diagrams/compiler.js'
import { renderBBT } from '../src/js/utils/diagrams/bbt.js'
import { renderGraph, sampleCurve, collectGuards, findRoots, buildViewportMapping } from '../src/js/utils/diagrams/graph.js'
import { renderGeo3D, buildProjection } from '../src/js/utils/diagrams/geometry3d.js'
import { parseExamMarkdown, formatQuestionToMarkdown, renderMarkdown, validateQuestionDiagrams } from '../src/js/utils/exam-parser.js'
import { compileDiagramToSVG } from '../src/js/utils/diagram-renderer.js'
import * as FIXTURES from './diagram-fixtures.mjs'

const __dirname = dirname(fileURLToPath(import.meta.url))
const REPO_ROOT = resolve(__dirname, '../..')

let passed = 0
let failed = 0
const failures = []

function check(name, condition, extra = '') {
  if (condition) {
    passed++
    console.log(`  ✓ ${name}`)
  } else {
    failed++
    failures.push(name)
    console.log(`  ✗ ${name}${extra ? ` -> ${extra}` : ''}`)
  }
}

function eq(name, actual, expected) {
  const ok = JSON.stringify(actual) === JSON.stringify(expected)
  check(name, ok, ok ? '' : `expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`)
}

function near(name, actual, expected, tol = 1e-9) {
  const ok = typeof actual === 'number' && Math.abs(actual - expected) <= tol
  check(name, ok, ok ? '' : `expected ≈${expected}, got ${actual}`)
}

function section(title) {
  console.log(`\n=== ${title} ===`)
}

/* ================================================================== *
 * 1. BIỂU THỨC TOÁN — an toàn, đúng thứ tự ưu tiên
 * ================================================================== */
section('1. Biểu thức toán (không eval/new Function)')

{
  const ev = (src, x) => evaluate(parseExpression(src), x)
  near('-x^2 = -(x^2) tại x=3', ev('-x^2', 3), -9)
  near('(-x)^2 = x^2 tại x=3', ev('(-x)^2', 3), 9)
  near('x^2^3 = x^(2^3) tại x=2', ev('x^2^3', 2), 256)
  near('2^-1 = 1/2', ev('2^-1', 0), 0.5)
  near('2^-3', ev('2^-3', 0), 0.125)
  near('-2^-2 = -(2^-2)', ev('-2^-2', 0), -0.25)
  near('2*3+4', ev('2*3+4', 0), 10)
  near('2+3*4', ev('2+3*4', 0), 14)
  near('(2+3)*4', ev('(2+3)*4', 0), 20)
  near('8/2/2 = (8/2)/2', ev('8/2/2', 0), 2)
  near('sqrt(9)', ev('sqrt(9)', 0), 3)
  near('abs(-3)', ev('abs(-3)', 0), 3)
  near('ln(e)', ev('ln(e)', 0), 1)
  near('log(e) = ln(e)', ev('log(e)', 0), 1)
  near('exp(0)', ev('exp(0)', 0), 1)
  near('sin(pi/2)', ev('sin(pi/2)', 0), 1)
  near('tan(0)', ev('tan(0)', 0), 0)
  near('pi', ev('pi', 0), Math.PI)
  near('x^2 tại x=-4', ev('x^2', -4), 16)
  near('1/(x-1) tại x=3', ev('1/(x-1)', 3), 0.5)
  near('(x^2-1)/(x-1) tại x=3', ev('(x^2-1)/(x-1)', 3), 4)
}

{
  // Từ chối: truy cập global, gán biến, thuộc tính, câu lệnh, nhân ẩn
  const rejected = [
    'window', 'globalThis', 'document', 'eval("1")', 'x = 1', 'x.y', 'x[0]',
    '2x', 'x;', 'f(x)', 'Math.sin(x)', 'constructor', '__proto__', 'x=>x',
    'alert(1)', 'this', 'x++', '1e', 'sqrt()', 'sin(1,2)'
  ]
  rejected.forEach(src => {
    let threw = false
    try { parseExpression(src) } catch (e) { threw = e instanceof ExpressionError }
    check(`từ chối biểu thức không an toàn: "${src}"`, threw)
  })
}

{
  // Miền xác định
  const ast = parseExpression('sqrt(4-x^2)')
  check('sqrt(4-x^2) xác định tại x=0', isDefinedAt(ast, 0))
  check('sqrt(4-x^2) KHÔNG xác định tại x=3', !isDefinedAt(ast, 3))
  const ast2 = parseExpression('1/(x-1)')
  check('1/(x-1) KHÔNG xác định tại x=1', !isDefinedAt(ast2, 1))
  check('1/(x-1) xác định tại x=2', isDefinedAt(ast2, 2))
  const ast3 = parseExpression('ln(x)')
  check('ln(x) KHÔNG xác định tại x=0', !isDefinedAt(ast3, 0))
  check('ln(x) xác định tại x=1', isDefinedAt(ast3, 1))
  const ast4 = parseExpression('tan(x)')
  check('tan(x) KHÔNG xác định tại pi/2', !isDefinedAt(ast4, Math.PI / 2))
}

{
  near('asAffine(x+1).a', asAffine(parseExpression('x+1')).a, 1)
  near('asAffine(x+1).b', asAffine(parseExpression('x+1')).b, 1)
  near('asAffine(3).a', asAffine(parseExpression('3')).a, 0)
  near('asAffine(3).b', asAffine(parseExpression('3')).b, 3)
  check('asAffine(x^2) = null', asAffine(parseExpression('x^2')) === null)
}

/* ================================================================== *
 * 2. BBT — neo chung, gián đoạn, dấu lặp, dữ liệu mâu thuẫn
 * ================================================================== */
section('2. Bảng biến thiên / bảng xét dấu')

{
  // Fixture: bảng đã cung cấp (x = -∞,0,2,+∞)
  const model = validateBbtV2({
    version: 2,
    labels: { x: 'x', derivative: "f'(x)", value: 'f(x)' },
    knots: ['-inf', 0, 2, '+inf'],
    signs: ['-', '+', '-'],
    derivativeAt: [null, 'zero', 'zero', null],
    values: ['+inf', 1, 4, '-inf']
  })
  check('BBT fixture hợp lệ (không lỗi)', !hasErrors(model.diagnostics), JSON.stringify(model.diagnostics))
  const svg = renderBBT(model.model, 1, [])
  check('BBT có vẽ SVG', svg.includes('<svg'))

  // Neo dùng chung: xem vị trí các điểm neo (trục dọc của bảng) và các nhãn
  const anchors = [...svg.matchAll(/<circle cx="([\d.]+)"/g)].map(m => parseFloat(m[1]))
  check('BBT không có điểm tròn thừa (giá trị không vẽ chấm)', anchors.length === 0)

  // Đường đôi khi gián đoạn
  const model2 = validateBbtV2({
    version: 2,
    knots: ['-inf', 1, '+inf'],
    signs: ['-', '-'],
    derivativeAt: [null, 'undefined', null],
    values: [0, { left: '-inf', right: '+inf', at: null }, 0]
  })
  check('BBT gián đoạn hợp lệ', !hasErrors(model2.diagnostics), JSON.stringify(model2.diagnostics))
  if (!model2.model) throw new Error('model rỗng')
  const svg2 = renderBBT(model2.model, 2, [])
  const dbl = (svg2.match(/stroke-width="1.1"/g) || []).length
  check('BBT gián đoạn vẽ đường đôi (2 nét)', dbl === 2, `thấy ${dbl} nét`)
  // Không nối mũi tên qua đường đôi: không đoạn nào có x1 < neo < x2
  const dblX = [...svg2.matchAll(/<line x1="([\d.]+)" y1="[\d.]+" x2="\1"/g)].map(m => parseFloat(m[1]))
  const anchor = dblX.length ? (dblX[0] + dblX[1]) / 2 : null
  const segs = [...svg2.matchAll(/<line x1="([\d.]+)" y1="[\d.]+" x2="([\d.]+)" y2="[\d.]+" stroke="#0f172a" stroke-width="1.3"/g)]
    .map(m => ({ x1: parseFloat(m[1]), x2: parseFloat(m[2]) }))
  check('BBT gián đoạn có vẽ các đoạn hàng giá trị', segs.length === 2, `thấy ${segs.length} đoạn`)
  check('BBT gián đoạn KHÔNG nối mũi tên qua đường đôi',
    segs.every(s => !(s.x1 < anchor - 3 && s.x2 > anchor + 3)),
    JSON.stringify({ anchor, segs }))
}

{
  // Dấu lặp (điểm đi ngang) — không được vẽ cực trị
  const model = validateBbtV2(FIXTURES.TN1_Q9_SIGN_TABLE.json)
  check('BBT câu 9 (dấu lặp) hợp lệ', !hasErrors(model.diagnostics), JSON.stringify(model.diagnostics))
  const infos = model.diagnostics.filter(d => d.code === 'BBT_V2_NO_SIGN_CHANGE')
  check('BBT câu 9 báo thông tin "điểm đi ngang" tại x=0', infos.length === 1)
  check('BBT câu 9 không có hàng giá trị', model.model.hasValueRow === false)
  const svg = renderBBT(model.model, 3, [])
  check('BBT chỉ xét dấu không vẽ hàng y', !svg.includes('f(x)'))
}

{
  // Dữ liệu mâu thuẫn: dấu '-' nhưng giá trị tăng
  const res = validateBbtV2({
    version: 2,
    knots: ['-inf', 0, '+inf'],
    signs: ['-', '+'],
    derivativeAt: [null, 'zero', null],
    values: [0, 5, 1]
  })
  check('BBT từ chối dữ liệu mâu thuẫn (dấu + nhưng giá trị giảm)', hasErrors(res.diagnostics))
  check('BBT mâu thuẫn có mã lỗi rõ ràng', res.diagnostics.some(d => d.code === 'BBT_V2_VALUE_SIGN_CONFLICT'))
}

{
  // Thiếu dấu
  const res = validateBbtV2({
    version: 2,
    knots: ['-inf', 0, 2, '+inf'],
    signs: ['-', '+'],
    derivativeAt: [null, 'zero', 'zero', null]
  })
  check('BBT từ chối thiếu dấu khoảng', hasErrors(res.diagnostics))
}

{
  // Khóa lạ bị từ chối
  const res = validateBbtV2({ version: 2, knots: [0, 1], signs: ['+'], foo: 1 })
  check('BBT từ chối khóa lạ', res.diagnostics.some(d => d.code === 'BBT_V2_UNKNOWN_KEY'))
}

{
  // Legacy: thiếu dấu khoảng → cảnh báo (không chặn), vẫn vẽ được
  const legacy = adaptLegacyBBT(`x  | -\\infty, -1, 2, +\\infty
y' | +, 0, -, 0
y  | -\\infty -> 3 ~> +\\infty`)
  check('BBT legacy thiếu dấu → cảnh báo (không phải lỗi)', legacy.diagnostics.some(d => d.code === 'LEGACY_BBT_MISSING_SIGN' && d.severity === 'warning'))
  check('BBT legacy không có lỗi chặn vẽ', !hasErrors(legacy.diagnostics), JSON.stringify(legacy.diagnostics))
  check('BBT legacy có 4 mốc', legacy.model.knots.length === 4)
  check('BBT legacy có 3 khoảng', legacy.model.signs.length === 3)
  check('BBT legacy đánh dấu khoảng thiếu dấu', legacy.model.signs[2] === 'none')
  check('BBT legacy dựng được đạo hàm tại các mốc', legacy.model.derivativeAt[1].kind === 'zero')
}

{
  // Legacy: gián đoạn "||"
  const legacy = adaptLegacyBBT(`x  | -\\infty, 0, 2, +\\infty
y' | -, ||, -, 0, +
y  | +\\infty ~> -\\infty || -\\infty ~> 0 -> +\\infty`)
  check('BBT legacy gián đoạn: mốc 0 là jump', legacy.model.values[1] && legacy.model.values[1].kind === 'jump')
  check('BBT legacy gián đoạn: giới hạn trái = -inf', legacy.model.values[1].left.inf === -1)
  check('BBT legacy gián đoạn: giới hạn phải = -inf', legacy.model.values[1].right.inf === -1)
  const svg = renderBBT(legacy.model, 4, [])
  check('BBT legacy gián đoạn vẽ đường đôi', (svg.match(/stroke-width="1.1"/g) || []).length === 2)
}

{
  // Legacy: preset không tồn tại ⇒ KHÔNG fallback im lặng
  const legacy = adaptLegacyGeo3d('preset: khong_ton_tai\nsolid: AB')
  check('geo3d legacy preset lạ ⇒ lỗi (không fallback)', hasErrors(legacy.diagnostics))
  check('geo3d legacy preset lạ có mã lỗi', legacy.diagnostics.some(d => d.code === 'LEGACY_GEO3D_UNKNOWN_PRESET'))
}

/* ================================================================== *
 * 3. ĐỒ THỊ — miền, cực, lỗ thủng, scale, điểm trên đường cong
 * ================================================================== */
section('3. Đồ thị hàm số')

{
  const res = validateGraphV2(FIXTURES.TN1_Q22_GRAPH.json)
  check('graph TN-1 câu 22 hợp lệ', !hasErrors(res.diagnostics), JSON.stringify(res.diagnostics))
  const svg = renderGraph(res.model, 5, [])
  check('graph TN-1 câu 22 có đường cong', /<path d="M [\d.]+ [\d.]+ L/.test(svg))
}

{
  // Điểm thuộc đường cong: y phải được tính từ hàm
  const res = validateGraphV2({
    version: 2,
    viewport: { x: [-3, 3], y: [-2, 6] },
    curves: [{ id: 'f', expr: 'x^3-3*x+2', domain: [{ from: -3, to: 3, closed: [true, true] }] }],
    points: [{ curve: 'f', x: -1 }]
  })
  const svg = renderGraph(res.model, 6, [])
  // f(-1) = -1 + 3 + 2 = 4
  const circles = [...svg.matchAll(/<circle cx="([\d.]+)" cy="([\d.]+)"/g)]
  check('graph vẽ đúng 1 điểm trên đường cong', circles.length === 1)
  // viewport y [-2,6], PLOT_Y0=18 PLOT_Y1=264 → toY(4) = 264 - (4-(-2))/(8)*246 = 264 - 184.5 = 79.5
  near('graph: y của điểm tính từ hàm (f(-1)=4)', parseFloat(circles[0][2]), 79.5, 0.6)
}

{
  // Cực: 1/(x-1) — đường cong KHÔNG được đi qua x = 1
  const res = validateGraphV2({
    version: 2,
    viewport: { x: [-3, 3], y: [-5, 5] },
    curves: [{ id: 'f', expr: '1/(x-1)', domain: [{ from: -3, to: 3, closed: [true, true] }] }],
    points: []
  })
  check('graph cực 1/(x-1) hợp lệ', !hasErrors(res.diagnostics))
  const curve = res.model.curves[0]
  const segs = sampleCurve(curve, curve.domain[0], [-3, 3], x => x, y => y, [])
  check('graph cực: đường cong tách thành 2 nhánh', segs.length === 2, `thấy ${segs.length} nhánh`)
  const pts = segs.flat()
  const nearPole = pts.filter(p => Math.abs(p.x - 1) < 1e-6)
  check('graph cực: KHÔNG có điểm nào trong khung nhìn tại x=1',
    nearPole.every(p => Math.abs(p.y) > 1e6),
    JSON.stringify(nearPole.slice(0, 3)))
  // giá trị đúng: f(2) = 1
  const p2 = pts.find(p => Math.abs(p.x - 2) < 1e-6)
  check('graph cực: f(2) = 1', !!p2 && Math.abs(p2.y - 1) < 1e-9)
}

{
  // Lỗ thủng: (x^2-1)/(x-1) tại x = 1
  const res = validateGraphV2(FIXTURES.GRAPH_HOLE.json)
  check('graph lỗ thủng hợp lệ', !hasErrors(res.diagnostics), JSON.stringify(res.diagnostics))
  const curve = res.model.curves[0]
  const segs = sampleCurve(curve, curve.domain[0], [-3, 3], x => x, y => y, [])
  check('graph lỗ thủng: hàm không xác định tại x=1', !isDefinedAt(curve.ast, 1))
  check('graph lỗ thủng: có marker open', res.model.points[0].marker === 'open')
  const holeSvg = renderGraph(res.model, 31, [])
  check('graph lỗ thủng: vẽ điểm rỗng', /<circle[^>]*fill="#ffffff"/.test(holeSvg))
}

{
  // Căn: miền hữu hạn
  const res = validateGraphV2(FIXTURES.TN1_Q58_GRAPH.json)
  check('graph sqrt(4-x^2) hợp lệ', !hasErrors(res.diagnostics))
  const curve = res.model.curves[0]
  const segs = sampleCurve(curve, curve.domain[0], [-2, 2], x => x, y => y, [])
  const xs = segs.flat().map(p => p.x)
  check('graph căn: nằm trong [-2,2]', xs.every(x => x >= -2 - 1e-9 && x <= 2 + 1e-9))
  const ys = segs.flat().map(p => p.y)
  check('graph căn: y >= 0', ys.every(y => y >= -1e-9))
  near('graph căn: đỉnh y=2 tại x=0', Math.max(...ys), 2, 1e-9)
}

{
  // ln và tan
  const res = validateGraphV2({
    version: 2,
    viewport: { x: [-1, 5], y: [-3, 3] },
    curves: [{ id: 'f', expr: 'ln(x)', domain: [{ from: 0, to: 5, closed: [false, true] }] }]
  })
  const curve = res.model.curves[0]
  const segs = sampleCurve(curve, curve.domain[0], [-1, 5], x => x, y => y, [])
  const xs = segs.flat().map(p => p.x)
  check('graph ln: không có điểm x <= 0', xs.every(x => x > 0))

  const res2 = validateGraphV2({
    version: 2,
    viewport: { x: [-5, 5], y: [-5, 5] },
    curves: [{ id: 'f', expr: 'tan(x)', domain: [{ from: -5, to: 5, closed: [true, true] }] }]
  })
  const curve2 = res2.model.curves[0]
  const segs2 = sampleCurve(curve2, curve2.domain[0], [-5, 5], x => x, y => y, [])
  check('graph tan: bị cắt tại các cực (nhiều nhánh)', segs2.length >= 4, `thấy ${segs2.length} nhánh`)
}

{
  // Guards: tìm nghiệm của ràng buộc miền
  const guards = collectGuards(parseExpression('1/(x-1)'))
  check('guards: 1/(x-1) có 1 ràng buộc', guards.length === 1)
  const roots = findRoots(guards[0].expr, -3, 3)
  check('guards: nghiệm mẫu số x-1 tại 1', roots.length === 1 && Math.abs(roots[0] - 1) < 1e-6)
  const guards2 = collectGuards(parseExpression('sqrt(4-x^2)'))
  const roots2 = findRoots(guards2[0].expr, -3, 3)
  check('guards: nghiệm 4-x^2 tại ±2', roots2.length === 2 && roots2.some(r => Math.abs(r + 2) < 1e-6) && roots2.some(r => Math.abs(r - 2) < 1e-6))
}

{
  // Scale equal: nửa đường tròn không bị méo
  const res = validateGraphV2(FIXTURES.TN1_Q58_GRAPH.json)
  const svg = renderGraph(res.model, 7, [])
  const circles = [...svg.matchAll(/<circle cx="([\d.]+)" cy="([\d.]+)"/g)]
  // Điểm (0, 0) của hàm: f(0) = 2 → toY(2)
  check('graph equal scale: vẽ điểm (0,2)', circles.length === 1)
  // Kiểm tra tỷ lệ pixel: khoảng cách theo trục x và y phải bằng nhau
  const res2 = validateGraphV2({
    version: 2,
    viewport: { x: [-3, 3], y: [-3, 3] },
    scale: 'equal',
    curves: [{ id: 'f', expr: 'x^2', domain: [{ from: -1, to: 1, closed: [true, true] }] }]
  })
  check('graph equal scale: hợp lệ', !hasErrors(res2.diagnostics), JSON.stringify(res2.diagnostics))
  const svg2 = renderGraph(res2.model, 8, [])
  const mapEq = buildViewportMapping({ x: [-3, 3], y: [-3, 3] }, 'equal')
  near('graph equal scale: cùng pixel/đơn vị trên hai trục (x)', mapEq.sx, mapEq.sy, 1e-12)
  const mapFree = buildViewportMapping({ x: [-3, 3], y: [-3, 3] }, 'free')
  check('graph free scale: hai trục có tỷ lệ khác nhau', Math.abs(mapFree.sx - mapFree.sy) > 1e-6)
  // Nửa đường tròn bán kính 2 (scale equal) phải giữ tỷ lệ: bán kính ngang = bán kính dọc
  const mapCircle = buildViewportMapping({ x: [-3, 3], y: [-1, 3] }, 'equal')
  const leftEnd = mapCircle.toX(-2)
  const rightEnd = mapCircle.toX(2)
  const top = mapCircle.toY(2)
  const bottom = mapCircle.toY(0)
  near('graph equal scale: nửa đường tròn không méo (bán kính ngang = dọc)',
    (rightEnd - leftEnd) / 2, Math.abs(top - bottom), 0.6)
}

{
  // Cửa sổ y quanh 1000 và gốc ngoài viewport
  const res = validateGraphV2({
    version: 2,
    viewport: { x: [999, 1001], y: [999, 1001] },
    curves: [{ id: 'f', expr: '1000+x', domain: [{ from: 999, to: 1001, closed: [true, true] }] }]
  })
  const svg = renderGraph(res.model, 9, [])
  check('graph gốc ngoài viewport: không vẽ nhãn O', !/>O</.test(svg))
  check('graph gốc ngoài viewport: không vẽ trục tung', !/marker-end="url\(#graph-arrow-9\)"[^>]*\/><line x1="4/.test(svg))
  check('graph cửa sổ y ~1000: không có NaN/Infinity trong SVG', !/NaN|Infinity|undefined/.test(svg))
}

{
  // Tiệm cận ngang phải là hằng/affine
  const res = validateGraphV2({
    version: 2,
    viewport: { x: [-3, 3], y: [-3, 3] },
    curves: [{ id: 'f', expr: 'x^2', domain: [{ from: -3, to: 3, closed: [true, true] }] }],
    asymptotes: [{ axis: 'y', expr: 'x^2' }]
  })
  check('graph từ chối tiệm cận ngang phi tuyến', hasErrors(res.diagnostics))
}

{
  // Legacy graph: đọc fn/domain/range
  const legacy = adaptLegacyGraph(`fn: x^3 - 3*x + 1
domain: [-2.2, 2.2]
range: [-2.5, 3.8]
points: (-1, 3), (1, -1)
asymptotes: x = 1, y = 2`)
  check('graph legacy hợp lệ', !hasErrors(legacy.diagnostics), JSON.stringify(legacy.diagnostics))
  check('graph legacy viewport đúng', JSON.stringify(legacy.model.viewport.x) === JSON.stringify([-2.2, 2.2]))
  check('graph legacy có 1 đường cong', legacy.model.curves.length === 1)
  check('graph legacy có 2 điểm', legacy.model.points.length === 2)
  check('graph legacy có 2 tiệm cận', legacy.model.asymptotes.length === 2)
  const bad = adaptLegacyGraph('fn: x^2\ndomain: [3, 1]\nrange: [0,1]')
  check('graph legacy báo lỗi khi domain sai', hasErrors(bad.diagnostics))
  const missing = adaptLegacyGraph('domain: [0,1]\nrange: [0,1]')
  check('graph legacy báo lỗi khi thiếu fn', hasErrors(missing.diagnostics))
}

/* ================================================================== *
 * 4. HÌNH KHÔNG GIAN — dựng hình, chiếu trực giao, vuông góc
 * ================================================================== */
section('4. Hình học không gian (3D)')

{
  const res = validateGeo3dV2(FIXTURES.GEO3D_PYRAMID.json)
  check('geo3d fixture hợp lệ', !hasErrors(res.diagnostics), JSON.stringify(res.diagnostics))
  const pts = res.model.points
  near('geo3d: M = trung điểm SC (1.5,1.5,2)', pts.M[0], 1.5, 1e-9)
  near('geo3d: M.y', pts.M[1], 1.5, 1e-9)
  near('geo3d: M.z', pts.M[2], 2, 1e-9)
  // Oracle trong tài liệu: H = (1.92, 0, 1.44)
  near('geo3d: H = hình chiếu A trên SB (1.92, 0, 1.44)', pts.H[0], 1.92, 1e-9)
  near('geo3d: H.y = 0', pts.H[1], 0, 1e-9)
  near('geo3d: H.z = 1.44', pts.H[2], 1.44, 1e-9)
  // AH ⊥ SB
  const dot = (pts.A[0] - pts.H[0]) * (pts.B[0] - pts.S[0]) +
    (pts.A[1] - pts.H[1]) * (pts.B[1] - pts.S[1]) +
    (pts.A[2] - pts.H[2]) * (pts.B[2] - pts.S[2])
  check('geo3d: AH ⊥ SB (tích phân tuyến = 0)', Math.abs(dot) < 1e-9, `dot=${dot}`)
  // H nằm trên đường SB
  const t = (pts.H[0] - pts.S[0]) / (pts.B[0] - pts.S[0])
  near('geo3d: H nằm trên đường thẳng SB', pts.S[2] + t * (pts.B[2] - pts.S[2]), pts.H[2], 1e-9)
}

{
  // Centroid + ratio
  const res = validateGeo3dV2(FIXTURES.GEO3D_BOX.json)
  check('geo3d hộp hợp lệ', !hasErrors(res.diagnostics), JSON.stringify(res.diagnostics))
  near('geo3d: G = trọng tâm ABC = (2, 2/3, 0)', res.model.points.G[0], 2, 1e-9)
  near('geo3d: G.y', res.model.points.G[1], 2 / 3, 1e-9)
  near('geo3d: N = A + 0.25(B-A) = (0.75,0,0)', res.model.points.N[0], 0.75, 1e-9)
}

{
  // projectPlane
  const res = validateGeo3dV2({
    version: 2,
    points: { A: [0, 0, 0], B: [1, 0, 0], C: [0, 1, 0], P: [1, 1, 2] },
    constructions: [{ id: 'H', op: 'projectPlane', args: ['P', 'A', 'B', 'C'] }],
    camera: { projection: 'orthographic', eye: [5, -5, 5], target: [0.5, 0.5, 0.5], up: [0, 0, 1] }
  })
  check('geo3d projectPlane hợp lệ', !hasErrors(res.diagnostics), JSON.stringify(res.diagnostics))
  near('geo3d: H = (1,1,0)', res.model.points.H[2], 0, 1e-9)
}

{
  // Vòng phụ thuộc
  const res = validateGeo3dV2({
    version: 2,
    points: { A: [0, 0, 0], B: [1, 0, 0] },
    constructions: [
      { id: 'X', op: 'mid', args: ['Y', 'B'] },
      { id: 'Y', op: 'mid', args: ['X', 'A'] }
    ]
  })
  check('geo3d phát hiện vòng phụ thuộc', hasErrors(res.diagnostics))
  check('geo3d vòng phụ thuộc có mã lỗi', res.diagnostics.some(d => d.code === 'GEO3D_V2_CYCLE'))
}

{
  // Thiếu điểm
  const res = validateGeo3dV2({
    version: 2,
    points: { A: [0, 0, 0] },
    constructions: [{ id: 'M', op: 'mid', args: ['A', 'Z'] }]
  })
  check('geo3d phát hiện tham chiếu điểm không tồn tại', res.diagnostics.some(d => d.code === 'GEO3D_V2_MISSING_POINT'))
}

{
  // Mặt phẳng suy biến (A, B, C thẳng hàng)
  const res = validateGeo3dV2({
    version: 2,
    points: { A: [0, 0, 0], B: [1, 0, 0], C: [2, 0, 0], P: [0, 1, 1] },
    constructions: [{ id: 'H', op: 'projectPlane', args: ['P', 'A', 'B', 'C'] }]
  })
  check('geo3d từ chối mặt phẳng suy biến', hasErrors(res.diagnostics))
  check('geo3d suy biến có mã lỗi', res.diagnostics.some(d => d.code === 'GEO3D_V2_BAD_CONSTRUCTION'))
}

{
  // Góc vuông khai báo sai
  const res = validateGeo3dV2({
    version: 2,
    points: { A: [0, 0, 0], B: [1, 0, 0], C: [2, 1, 0] },
    rightAngles: [['A', 'B', 'C']]
  })
  check('geo3d từ chối góc vuông khai báo sai', hasErrors(res.diagnostics))
  check('geo3d góc vuông sai có mã lỗi', res.diagnostics.some(d => d.code === 'GEO3D_V2_NOT_PERPENDICULAR'))
}

{
  // Camera: eye == target, up song song
  const res = validateGeo3dV2({
    version: 2,
    points: { A: [0, 0, 0], B: [1, 0, 0] },
    camera: { projection: 'orthographic', eye: [1, 1, 1], target: [1, 1, 1], up: [0, 0, 1] }
  })
  check('geo3d từ chối camera eye == target', hasErrors(res.diagnostics))
  const res2 = validateGeo3dV2({
    version: 2,
    points: { A: [0, 0, 0], B: [1, 0, 0] },
    camera: { projection: 'orthographic', eye: [0, 0, 5], target: [0, 0, 0], up: [0, 0, 1] }
  })
  check('geo3d từ chối up song song hướng nhìn', hasErrors(res2.diagnostics))
}

{
  // Chiếu trực giao: giữ tỷ lệ khoảng cách trên cùng một đường thẳng
  const res = validateGeo3dV2(FIXTURES.GEO3D_BOX.json)
  const cam = res.model.camera
  const { proj, toPx } = buildProjection(cam, res.model.points)
  // A, B, N trên cùng đường thẳng AB → tỷ lệ khoảng cách pixel phải giữ nguyên
  const pA = toPx(proj.A)
  const pB = toPx(proj.B)
  const pN = toPx(proj.N)
  const dAB = Math.hypot(pB[0] - pA[0], pB[1] - pA[1])
  const dAN = Math.hypot(pN[0] - pA[0], pN[1] - pA[1])
  near('geo3d: chiếu trực giao giữ tỷ lệ AN/AB = 0.25', dAN / dAB, 0.25, 1e-9)
  // Chiếu là phép affine: trọng tâm ảnh = trọng tâm các ảnh
  const pC = toPx(proj.C)
  const pG = toPx(proj.G)
  near('geo3d: ảnh trọng tâm = trung bình các ảnh (x)', pG[0], (pA[0] + pB[0] + pC[0]) / 3, 1e-9)
  near('geo3d: ảnh trọng tâm = trung bình các ảnh (y)', pG[1], (pA[1] + pB[1] + pC[1]) / 3, 1e-9)
  // Góc vuông được kiểm tra trong KHÔNG GIAN trước khi chiếu.
  // (Hình chiếu trực giao KHÔNG bắt buộc nhìn vuông góc 90° trên màn hình.)
  const Ap = res.model.points["A'"]
  const Bp = res.model.points.B
  const AA = [Ap[0] - 0, Ap[1] - 0, Ap[2] - 0]
  const AB = [Bp[0] - 0, Bp[1] - 0, Bp[2] - 0]
  const dot3d = AA[0] * AB[0] + AA[1] * AB[1] + AA[2] * AB[2]
  near('geo3d: AA\' ⊥ AB trong không gian (kiểm tra trước khi chiếu)', dot3d, 0, 1e-12)
  // Chiếu trực giao là phép affine (tuyến tính): hai đoạn song song trong không gian
  // cho hai vectơ chiếu bằng nhau (A'D' và AD có cùng vectơ (0,2,0)).
  const pAp = toPx(proj["A'"])
  const pD = toPx(proj.D)
  const pDp = toPx(proj["D'"])
  near('geo3d: vectơ chiếu của A\'D\' bằng vectơ chiếu của AD (x)', pDp[0] - pAp[0], pD[0] - pA[0], 1e-9)
  near('geo3d: vectơ chiếu của A\'D\' bằng vectơ chiếu của AD (y)', pDp[1] - pAp[1], pD[1] - pA[1], 1e-9)
}

{
  // Góc vuông: chỉ hợp lệ khi dot(A-V, B-V) ≈ 0
  const res = validateGeo3dV2(FIXTURES.GEO3D_PYRAMID.json)
  const svg = renderGeo3D(res.model, 10, [])
  check('geo3d vẽ ký hiệu góc vuông', svg.includes('<polyline'))
  check('geo3d vẽ cạnh nét đứt cho cạnh khuất', svg.includes('stroke-dasharray'))
  check('geo3d không có NaN/Infinity trong SVG', !/NaN|Infinity|undefined/.test(svg))
}

/* ================================================================== *
 * 4b. P0 — faces / visibility auto|manual / kind auxiliary
 *     (GEO3D_VISIBILITY_SOLUTION.md §2, §3.1, §6, §7-P0)
 * ================================================================== */
section('4b. Geo3d P0: faces, visibility, kind auxiliary')

{
  // Audit §1: hộp chữ nhật camera [8,-9,7] — phải dùng 4 style đã sửa,
  // suy luận độc lập từ cực trị camera: mặt nhìn thấy là trên / trước / phải.
  const res = validateGeo3dV2(FIXTURES.GEO3D_BOX.json)
  const styleOf = (u, v) => {
    const e = res.model.edges.find(x => x.ends[0] === u && x.ends[1] === v)
    return e ? e.style : 'missing'
  }
  eq("audit hộp: CD phải dashed", styleOf('C', 'D'), 'dashed')
  eq("audit hộp: DA phải dashed", styleOf('D', 'A'), 'dashed')
  eq("audit hộp: CC' phải solid", styleOf('C', "C'"), 'solid')
  eq("audit hộp: D'A' phải solid", styleOf("D'", "A'"), 'solid')
}

{
  // Manually rendered output phải giữ nguyên hành vi cũ (§6 mục 7).
  // golden sha256 chụp từ renderGeo3D TRƯỚC khi thêm P0 (renderer không đổi).
  const golden = {
    GEO3D_PYRAMID: '963cf6551b9d9ae74c9a88699ce947a6796126c7ae80b48b42ca59fc6f6a6fd7',
    GEO3D_BOX: '3ea1e0015a403ade539fd4acfc364ab769dda57ca0056adae22a1be01f8ddd93'
  }
  for (const [name, digest] of Object.entries(golden)) {
    const res = validateGeo3dV2(FIXTURES[name].json)
    const svg = renderGeo3D(res.model, 10, [])
    eq(`manual byte-identical: ${name}`, createHash('sha256').update(svg).digest('hex'), digest)
  }
  // Kiểm tra nội dung theo từng cạnh: edges vẽ theo thứ tự khai báo.
  const res = validateGeo3dV2(FIXTURES.GEO3D_BOX.json)
  const svg = renderGeo3D(res.model, 10, [])
  const lines = svg.match(/<line[^>]*>/g) || []
  eq('manual hộp: vẽ giữa 12 <line>', lines.length, 12)
  check("manual hộp: CD (line #3) nét đứt", lines[2].includes('stroke-dasharray'), lines[2])
  check("manual hộp: DA (line #4) nét đứt", lines[3].includes('stroke-dasharray'), lines[3])
  check("manual hộp: C'D' vẫn nét liền", !lines[6].includes('stroke-dasharray'), lines[6])
  check("manual hộp: D'A' nét liền (audit)", !lines[7].includes('stroke-dasharray'), lines[7])
  check("manual hộp: CC' nét liền (audit)", !lines[10].includes('stroke-dasharray'), lines[10])
  check("manual hộp: DD' vẫn nét đứt", lines[11].includes('stroke-dasharray'), lines[11])
  // kind không được thay đổi bản vẽ
  check('manual hộp: edge có kind "edge" (mặc đ định)', res.model.edges.every(e => e.kind === 'edge'))
}

{
  // §3.1.1: faces ≥ 3 đỉnh; §6 mục 8: thiếu đỉnh/tham chiếu lỗi bị từ chối
  const base = {
    version: 2,
    points: { A: [0, 0, 0], B: [1, 0, 0], C: [0, 1, 0] },
    camera: { projection: 'orthographic', eye: [3, -3, 2], target: [0.3, 0.3, 0], up: [0, 0, 1] }
  }
  const bad = validateGeo3dV2({
    ...base,
    faces: [
      { id: 'F1', vertices: ['A', 'B', 'Z'] },   // tham chiếu đỉnh không tồn tại
      { id: 'F2', vertices: ['A', 'B'] },        // ít hơn 3 đỉnh
      { id: 'F3', vertices: ['A', 'B', 'B'] },   // đỉnh trùng nhau
      { id: 'F4', vertices: ['A', 'A', 'B', 'C'] }
    ]
  })
  check('faces lỗi bị từ chối', hasErrors(bad.diagnostics))
  check('faces: mã GEO3D_V2_BAD_FACE ≥ 3', bad.diagnostics.filter(d => d.code === 'GEO3D_V2_BAD_FACE').length >= 3)
  // ID mặt trùng
  const dup = validateGeo3dV2({
    ...base,
    faces: [
      { id: 'F', vertices: ['A', 'B', 'C'] },
      { id: 'F', vertices: ['B', 'C', 'A'] }
    ]
  })
  check('faces ID trùng bị từ chối', dup.diagnostics.some(d => d.code === 'GEO3D_V2_DUPLICATE_ID'))
  // mặt suy biến (thẳng hàng)
  const degenerate = validateGeo3dV2({
    version: 2,
    points: { A: [0, 0, 0], B: [1, 0, 0], C: [2, 0, 0] },
    faces: [{ id: 'BAD', vertices: ['A', 'B', 'C'] }]
  })
  check('mặt suy biến (thẳng hàng) bị từ chối', !degenerate.model)
  check('mặt suy biến có mã GEO3D_V2_BAD_FACE', degenerate.diagnostics.some(d => d.code === 'GEO3D_V2_BAD_FACE'))
  // khóa lạ trong face
  const unknownKey = validateGeo3dV2({
    ...base,
    faces: [{ id: 'F', vertices: ['A', 'B', 'C'], color: 'red' }]
  })
  check('faces khóa lạ bị từ chối', unknownKey.diagnostics.some(d => d.code === 'GEO3D_V2_UNKNOWN_KEY'))
}

{
  // §3.1.2 — §6 mục 8: mặt không phẳng bị từ chối
  const res = validateGeo3dV2({
    version: 2,
    points: {
      A: [0, 0, 0], B: [1, 0, 0], C: [1, 1, 0],
      D: [0, 1, 0.5]   // D lệch khỏi mặt z=0
    },
    faces: [{ id: 'BAD', vertices: ['A', 'B', 'C', 'D'] }]
  })
  check('mặt không phẳng bị từ chối', hasErrors(res.diagnostics))
  check('mã GEO3D_V2_NON_PLANAR_FACE', res.diagnostics.some(d => d.code === 'GEO3D_V2_NON_PLANAR_FACE'))
  // mặt phẳng đúng trong dung sai 1e-6 thì được chấp nhận
  const ok = validateGeo3dV2({
    ...res,
    points: undefined, faces: undefined
  })
  // kiểm tra độc lập: phân tích trực tiếp analyze-like oracle = tích vô hướng với pháp tuyến
  const points = { A: [0, 0, 0], B: [1, 0, 0], C: [1, 1, 0], D: [0, 1, 5e-7] }
  const nrm = [0, 0, 1]
  const maxDev = Math.max(...Object.values(points).map(p => Math.abs(p[2])))
  check('oracle mặt gần phẳng: lệch trong 1e-6 (được chấp nhận)', maxDev <= 1e-6)
  check('oracle mặt lệch 0.5 (bị từ chối)', 0.5 > 1e-6)
  const okRes = validateGeo3dV2({
    version: 2,
    points,
    faces: [{ id: 'OK', vertices: ['A', 'B', 'C', 'D'] }]
  })
  check('mặt phẳng trong dung sai được chấp nhận', !hasErrors(okRes.diagnostics), JSON.stringify(okRes.diagnostics))
}

{
  // §3.1.3 — mặt lõm bị từ chối; tách thành mặt lồi thì hợp lệ
  const points = {
    A: [0, 0, 0], B: [4, 0, 0], C: [4, 4, 0], D: [3, 1, 0]
  }
  const concave = validateGeo3dV2({
    version: 2, points, faces: [{ id: 'ABCD', vertices: ['A', 'B', 'C', 'D'] }]
  })
  check('mặt lõm bị từ chối', hasErrors(concave.diagnostics))
  check('mã GEO3D_V2_NON_CONVEX_FACE', concave.diagnostics.some(d => d.code === 'GEO3D_V2_NON_CONVEX_FACE'))
  // tái tạo bước tam giác từ đỉnh lõm (D nhìn từ A-C không lồi? — dùng tam giác A-B-C và B-C-D lồi)
  const ok = validateGeo3dV2({
    version: 2, points,
    faces: [
      { id: 'BCD', vertices: ['B', 'C', 'D'] }
    ]
  })
  check('tách thành mặt lồi được chấp nhận', !hasErrors(ok.diagnostics), JSON.stringify(ok.diagnostics))
  // kiểm tra lồi nhất quán 2 chiều perp: tam giác luôn lồi
  const ok2 = validateGeo3dV2({
    version: 2, points, faces: [
      { id: 'T1', vertices: ['A', 'B', 'C'] },
      { id: 'T2', vertices: ['C', 'D', 'A'] }
    ]
  })
  check('tách thành các tam giác lồi được chấp nhận', !hasErrors(ok2.diagnostics), JSON.stringify(ok2.diagnostics))
}

{
  // §2 — visibility: auto bắt buộc faces (§6 + §3.1)
  const geo = {
    version: 2,
    points: { A: [0, 0, 0], B: [1, 0, 0], C: [1, 1, 0], D: [0, 1, 0] },
    camera: { projection: 'orthographic', eye: [3, -3, 2], target: [0.5, 0.5, 0], up: [0, 0, 1] }
  }
  const autoNoFaces = validateGeo3dV2({ ...geo, visibility: 'auto' })
  check('auto không khai faces bị từ chối', hasErrors(autoNoFaces.diagnostics))
  check('mã GEO3D_V2_AUTO_NEEDS_FACES', autoNoFaces.diagnostics.some(d => d.code === 'GEO3D_V2_AUTO_NEEDS_FACES'))
  check('auto không khai faces không trả model', autoNoFaces.model === null)
  const autoWithFaces = validateGeo3dV2({
    ...geo,
    faces: [{ id: 'ABCD', vertices: ['A', 'B', 'C', 'D'] }],
    visibility: 'auto'
  })
  check('auto + faces hợp lệ', !hasErrors(autoWithFaces.diagnostics), JSON.stringify(autoWithFaces.diagnostics))
  eq('model giữ nguyên faces và camera', JSON.stringify({ faces: autoWithFaces.model.faces, visibility: autoWithFaces.model.visibility }),
    JSON.stringify({ faces: [{ id: 'ABCD', vertices: ['A', 'B', 'C', 'D'] }], visibility: 'auto' }))
  eq('visibility undefined → mặc định "manual" (đề cũ không phá)', validateGeo3dV2(geo).model.visibility, 'manual')
  const badVisibility = validateGeo3dV2({ ...geo, visibility: 'magic' })
  check('visibility lạ bị từ chối', badVisibility.diagnostics.some(d => d.code === 'GEO3D_V2_BAD_VISIBILITY'))
  // faces trong manual không phá đề cũ
  const manualWithFaces = validateGeo3dV2({ ...geo, faces: [{ id: 'ABCD', vertices: ['A', 'B', 'C', 'D'] }] })
  check('manual + faces không bắt buộc auto', !hasErrors(manualWithFaces.diagnostics), JSON.stringify(manualWithFaces.diagnostics))
  eq('manual + faces vẫn manual', manualWithFaces.model.visibility, 'manual')
}

{
  // §2.2 — kind:"auxiliary"
  const geo = {
    version: 2,
    points: { A: [0, 0, 0], B: [3, 0, 0], S: [0, 0, 4] },
    camera: { projection: 'orthographic', eye: [7, -10, 7], target: [1, 1, 2], up: [0, 0, 1] }
  }
  const res = validateGeo3dV2({
    ...geo,
    edges: [{ ends: ['A', 'B'], style: 'solid' }, { ends: ['A', 'S'], kind: 'auxiliary' }]
  })
  check('kind auxiliary được chấp nhận', !hasErrors(res.diagnostics), JSON.stringify(res.diagnostics))
  eq('model giữ kind auxiliary', res.model.edges[1].kind, 'auxiliary')
  eq('model mặc định kind "edge"', res.model.edges[0].kind, 'edge')
  const badKind = validateGeo3dV2({
    ...geo,
    edges: [{ ends: ['A', 'B'], kind: 'weird' }]
  })
  check('kind lạ bị từ chối', badKind.diagnostics.some(d => d.code === 'GEO3D_V2_BAD_EDGE'))
  const autoOverride = validateGeo3dV2({
    ...GEO_JSON_PYRAMID_AUTO_WITH_STYLE()
  })
  check('auto có style override chỉ báo thông tin GEO3D_V2_EDGE_OVERRIDE', autoOverride.diagnostics.some(
    d => d.severity === 'info' && d.code === 'GEO3D_V2_EDGE_OVERRIDE'
  ))
  check('override không phải lỗi', !hasErrors(autoOverride.diagnostics))

  function GEO_JSON_PYRAMID_AUTO_WITH_STYLE() {
    return {
      version: 2,
      points: { A: [0, 0, 0], B: [3, 0, 0], C: [3, 3, 0], D: [0, 3, 0], S: [0, 0, 4] },
      faces: [
        { id: 'SAB', vertices: ['S', 'A', 'B'] },
        { id: 'SBC', vertices: ['S', 'B', 'C'] },
        { id: 'SCD', vertices: ['S', 'C', 'D'] },
        { id: 'SDA', vertices: ['S', 'D', 'A'] },
        { id: 'ABCD', vertices: ['A', 'B', 'C', 'D'] }
      ],
      edges: [{ ends: ['S', 'A'], style: 'dashed' }],
      camera: { projection: 'orthographic', eye: [7, -10, 7], target: [1.5, 1.5, 2], up: [0, 0, 1] },
      visibility: 'auto'
    }
  }
}

{
  // §6 mục 10: parse → format → parse giữ nguyên faces, camera, visibility, kind
  const json = JSON.stringify(FIXTURES.GEO3D_PYRAMID_AUTO.json, null, 2)
  const md = `[Câu 1]\nĐề\n\`\`\`geo3d\n${json}\n\`\`\`\nA. A\n*B. B\nC. C\nD. D\n[Lời giải]\nG\n`
  const first = parseExamMarkdown(md)
  const fmt = formatQuestionToMarkdown(first.questions[0])
  const second = parseExamMarkdown(fmt)
  eq('round-trip faces: đề giữ nguyên DAM assisting', second.questions[0].promptText, first.questions[0].promptText)
  // fence text vẫn chứa các trường P0
  const fence = /```geo3d\n([\s\S]*?)```/.exec(second.questions[0].promptText)[1]
  for (const key of ['"faces"', '"visibility"', '"auto"', '"kind"', '"auxiliary"']) {
    check(`round-trip faces: giá trị "${key}" còn nguyên`, fence.includes(key), fence.slice(0, 80))
  }
}

{
  // compileDiagram với auto: tự phân loại cạnh theo mặt/camera (P1)
  const res = compileDiagram('geo3d', JSON.stringify(FIXTURES.GEO3D_PYRAMID_AUTO.json), { uid: 7 })
  check('auto compile không lỗi', res.ok && !hasErrors(res.diagnostics), JSON.stringify(res.diagnostics))
  check('auto compile có cạnh SVG', res.svg.includes('<line '), res.svg.slice(0, 120))
  check('auto compile không còn pending', !res.diagnostics.some(d => d.code === 'GEO3D_V2_AUTO_RENDER_PENDING'))
  const pyramidAutoLines = [...res.svg.matchAll(/<line [^>]*stroke-dasharray="5,4"[^>]*>/g)]
  check('auto chóp có nét đứt khuất', pyramidAutoLines.length >= 3, `dashed=${pyramidAutoLines.length}`)

  const boxAuto = { ...FIXTURES.GEO3D_BOX.json, visibility: 'auto', faces: [
    { id: 'front', vertices: ['A', 'B', "B'", "A'"] },
    { id: 'right', vertices: ['B', 'C', "C'", "B'"] },
    { id: 'back', vertices: ['C', 'D', "D'", "C'"] },
    { id: 'left', vertices: ['D', 'A', "A'", "D'"] },
    { id: 'top', vertices: ["A'", "B'", "C'", "D'"] },
    { id: 'bottom', vertices: ['A', 'D', 'C', 'B'] }
  ], edges: FIXTURES.GEO3D_BOX.json.edges.map(e => ({ ends: e.ends })) }
  const boxAutoRes = compileDiagram('geo3d', JSON.stringify(boxAuto), { uid: 8 })
  check('auto hộp không lỗi', boxAutoRes.ok && !hasErrors(boxAutoRes.diagnostics), JSON.stringify(boxAutoRes.diagnostics))
  check('auto hộp có solid và dashed', boxAutoRes.svg.includes('stroke-dasharray="5,4"') && boxAutoRes.svg.includes('stroke-width="1.5"'), boxAutoRes.svg.slice(0, 120))
  const boxLines = boxAutoRes.svg.match(/<line [^>]+>/g) || []
  check('auto hộp đủ 12 cạnh', boxLines.length === 12, `lines=${boxLines.length}`)
  check('auto hộp CD/DA/DD dashed', [2, 3, 11].every(i => boxLines[i].includes('stroke-dasharray="5,4"')), boxLines.join('\n'))
  check('auto hộp CC/D\'A\' solid', [6, 7, 10].every(i => !boxLines[i].includes('stroke-dasharray')), boxLines.join('\n'))
  // manual vẫn render như cũ qua compileDiagram
  const manual = compileDiagram('geo3d', JSON.stringify(FIXTURES.GEO3D_PYRAMID.json), { uid: 7 })
  check('manual compile vẫn vẽ dòng nét đứt', manual.svg.includes('stroke-dasharray'))
  check('manual compile không có diagnostic pending', !manual.diagnostics.some(d => d.code === 'GEO3D_V2_AUTO_RENDER_PENDING'))
}

{
  // Lỗi schema vẫn chặn Česk lưu qua validateQuestionDiagrams
  const badMd = {
    promptText: '```geo3d\n{"version":2,"points":{"A":[0,0,0],"B":[1,0,0]},"visibility":"auto"}\n```',
    options: [], explanation: ''
  }
  const res = validateQuestionDiagrams(badMd)
  const rendered = renderMarkdown? undefined : undefined
  check('validate UI chặn auto-thiếu-faces', res.hasError)
}

{
  section('4c. Trục Oxyz và mặt cầu')
  const axes = compileDiagram('axes3d', JSON.stringify({
    version: 2,
    ranges: { x: [-4, 4], y: [-4, 4], z: [0, 4] },
    step: 1,
    camera: { projection: 'orthographic', eye: [7, -10, 7], target: [0, 0, 1], up: [0, 0, 1] }
  }), { uid: 90 })
  check('axes3d hợp lệ', axes.ok && axes.svg.includes('>x</text>') && axes.svg.includes('>z</text>'), JSON.stringify(axes.diagnostics))
  const sphere = compileDiagram('sphere3d', JSON.stringify({
    version: 2, center: [0, 0, 0], radius: 3,
    sectionPlane: { normal: [0, 0, 1], offset: -1, label: '(P)' }, axes: false,
    camera: { projection: 'orthographic', eye: [7, -10, 7], target: [0, 0, 0], up: [0, 0, 1] }
  }), { uid: 91 })
  check('sphere3d hợp lệ', sphere.ok && sphere.svg.includes('<polyline'), JSON.stringify(sphere.diagnostics))
  check('sphere3d có đường bao wireframe', (sphere.svg.match(/<polyline/g) || []).length >= 1, 'polyline count')
  check('sphere3d có giao tuyến mặt phẳng', sphere.svg.includes('>H</text>') && sphere.svg.includes('>(P)</text>'), sphere.svg.slice(0, 500))
  const noSection = compileDiagram('sphere3d', JSON.stringify({
    version: 2, center: [-1, 2, 3], radius: 2,
    sectionPlane: { normal: [0, 0, 1], offset: 0 },
    camera: { projection: 'orthographic', eye: [7, -10, 7], target: [-1, 2, 1], up: [0, 0, 1] }
  }), { uid: 93 })
  check('sphere3d từ chối mặt phẳng không cắt cầu', !noSection.ok && noSection.diagnostics.some(d => d.code === 'SPHERE_NO_SECTION'))
  const badSphere = compileDiagram('sphere3d', JSON.stringify({ version: 2, center: [0, 0, 0], radius: 0 }), { uid: 92 })
  check('sphere3d từ chối bán kính không dương', !badSphere.ok && badSphere.diagnostics.some(d => d.code === 'SPHERE_BAD_RADIUS'))
}

{
  // §6 mục 9 — không NaN/Infinity: faces có tọa độ tuyệt đối khổng lồ SUCCESS vẫn bị chặn sulf phát hiện không phẳng
  const res = validateGeo3dV2({
    version: 2,
    points: { A: [0, 0, 0], B: [1e9, 0, 0], C: [1e9, 1e9, 0], D: [0, 1e9, 2] },
    faces: [{ id: 'HUGE', vertices: ['A', 'B', 'C', 'D'] }]
  })
  check('mặt không phẳng scale lớn vẫn bị phát hiện', hasErrors(res.diagnostics))
}


/* ================================================================== *
 * 5. PARSER — ngữ cảnh hình, round-trip, fence lỗi
 * ================================================================== */
section('5. Trình phân tích đề (parser)')

{
  const md = `[Câu 1]
Đề bài có hình:
\`\`\`bbt
x  | -\\infty, 0, +\\infty
y' | +, 0, -
\`\`\`
A. Phương án A
B. Phương án B có hình:
\`\`\`graph
{"version":2,"viewport":{"x":[-2,2],"y":[-2,2]},"curves":[{"id":"f","expr":"x^2","domain":[{"from":-2,"to":2,"closed":[true,true]}]}],"points":[],"asymptotes":[]}
\`\`\`
C. Phương án C
D. Phương án D
[Lời giải]
Lời giải có hình riêng:
\`\`\`bbt
x  | -\\infty, 0, +\\infty
y' | -, 0, +
\`\`\`
`
  const res = parseExamMarkdown(md)
  eq('parser: tách đúng 1 câu', res.questions.length, 1)
  const q = res.questions[0]
  check('parser: hình trong đề nằm ở phần đề', q.promptText.includes('```bbt'))
  check('parser: hình phương án B nằm trong phương án B', q.options[1].text.includes('```graph'))
  check('parser: phương án A không chứa hình', !q.options[0].text.includes('```'))
  check('parser: hình lời giải KHÔNG bị chuyển sang đề', !q.promptText.includes('y\' | -, 0, +'))
  check('parser: hình lời giải nằm trong lời giải', q.explanation.includes('```bbt'))
  check('parser: phần đề chỉ chứa 1 khối hình', (q.promptText.match(/```/g) || []).length === 2)
}

{
  // Fence chưa đóng: KHÔNG nuốt câu tiếp theo + báo lỗi
  const md = `[Câu 1]
Đề có hình lỗi
\`\`\`bbt
x | -\\infty, +\\infty

[Câu 2]
Câu hai
A. 1
B. 2
`
  const res = parseExamMarkdown(md)
  eq('parser: fence chưa đóng không nuốt câu sau', res.questions.length, 2)
  check('parser: báo lỗi fence chưa đóng', res.diagnostics.some(d => d.code === 'FENCE_NOT_CLOSED' && d.severity === 'error'))
  check('parser: diagnostic có số dòng', res.diagnostics[0] && typeof res.diagnostics[0].line === 'number')
}

{
  // Round-trip: parse → format → parse giữ nguyên ý nghĩa
  const md = `[Câu 1]
Đề bài
\`\`\`bbt
x  | -\\infty, 0, +\\infty
y' | -, 0, +
\`\`\`
A. $(1)$
*B. $(2)$
C. $(3)$
D. $(4)
[Lời giải]
Giải thích
`
  const first = parseExamMarkdown(md)
  const formatted = formatQuestionToMarkdown(first.questions[0])
  const second = parseExamMarkdown(formatted)
  const q1 = first.questions[0]
  const q2 = second.questions[0]
  eq('round-trip: số câu', second.questions.length, 1)
  eq('round-trip: đề bài giữ nguyên', q2.promptText, q1.promptText)
  eq('round-trip: phương án giữ nguyên', JSON.stringify(q2.options), JSON.stringify(q1.options))
  eq('round-trip: đáp án đúng giữ nguyên', q2.mcAnswer, q1.mcAnswer)
  eq('round-trip: lời giải giữ nguyên', q2.explanation, q1.explanation)
}

{
  // Phương án nhiều dòng
  const md = `[Câu 1]
Đề
A. dòng 1
dòng 2 của A
B. B
C. C
D. D
`
  const res = parseExamMarkdown(md)
  eq('parser: phương án nhiều dòng được gộp', res.questions[0].options[0].text, 'dòng 1\ndòng 2 của A')
  eq('parser: các phương án sau không bị dính', res.questions[0].options[1].text, 'B')
}

{
  // Đúng/Sai: hình trong ý a
  const md = `[Câu 1] [TF]
Đề
*a) ý a
\`\`\`bbt
x | -\\infty, +\\infty
y' | +, 0, -
\`\`\`
b) ý b
c) ý c
d) ý d
[Lời giải]
LG
`
  const res = parseExamMarkdown(md)
  check('parser: hình trong ý đúng/sai nằm đúng ý', res.questions[0].options[0].text.includes('```bbt'))
  check('parser: ý b không chứa hình', !res.questions[0].options[1].text.includes('```'))
}

{
  // An toàn: nhãn HTML không được thực thi
  const evil = '[Câu 1]\n```bbt\nx | <img src=x onerror=alert(1)>, 1\ny\' | +, 0\n```\n'
  const res = parseExamMarkdown(evil)
  const html = renderMarkdown(res.questions[0].promptText)
  check('an toàn: nhãn HTML bị escape trong SVG', !html.includes('<img src=x'))
  check('an toàn: nhãn được escape thành &lt;img', html.includes('&lt;img'))
}

{
  // Không có eval/new Function trong mã nguồn khối hình
  const files = [
    'src/js/utils/diagrams/expression.js',
    'src/js/utils/diagrams/graph.js',
    'src/js/utils/diagrams/bbt.js',
    'src/js/utils/diagrams/geometry3d.js',
    'src/js/utils/diagrams/schema.js',
    'src/js/utils/diagrams/legacy-adapter.js',
    'src/js/utils/diagrams/compiler.js',
    'src/js/utils/diagram-renderer.js'
  ]
  files.forEach(f => {
    const src = readFileSync(resolve(REPO_ROOT, 'fe', f), 'utf8')
    const code = src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/[^\n]*/g, '')
    check(`an toàn: ${f} không dùng eval/new Function`,
      !/new\s+Function\s*\(/.test(code) && !/(^|[^.\w])eval\s*\(/.test(code))
  })
}

{
  // Hành vi cũ của khối smiles phải được giữ nguyên
  const html = compileDiagramToSVG('smiles', 'CC(=O)O')
  check('smiles: vẫn trả về thẻ <svg> với data-smiles', html.includes('data-smiles="CC(=O)O"'))
  check('smiles: vẫn dùng lớp diagram-wrap', html.includes('diagram-wrap'))
}

{
  // validateQuestionDiagrams phát hiện lỗi
  const bad = { promptText: '```graph\n{"version":2}\n```', options: [], explanation: '' }
  const res = validateQuestionDiagrams(bad)
  check('validate: phát hiện JSON thiếu trường bắt buộc', res.hasError)
  const good = { promptText: '```bbt\n{"version":2,"knots":[0,1],"signs":["+"]}\n```', options: [], explanation: '' }
  check('validate: khối hợp lệ không báo lỗi', !validateQuestionDiagrams(good).hasError)
}

/* ================================================================== *
 * 6. VÍ DỤ TRONG TÀI LIỆU — rules không được lệch code
 * ================================================================== */
section('6. Kiểm tra ví dụ trong tài liệu (MD_RULES_VE_HINH_TOAN_V2.md)')

{
  const docPath = resolve(REPO_ROOT, 'MD_RULES_VE_HINH_TOAN_V2.md')
  if (!existsSync(docPath)) {
    check('tài liệu V2 tồn tại', false, docPath)
  } else {
    const doc = readFileSync(docPath, 'utf8')
    const re = /```(bbt|graph|geo3d)\n([\s\S]*?)```/g
    let m
    let count = 0
    while ((m = re.exec(doc)) !== null) {
      const type = m[1]
      const code = m[2].trim()
      count++
      const res = compileDiagram(type, code, { uid: count })
      check(`ví dụ ${type} #${count} trong tài liệu biên dịch được`, res.ok,
        JSON.stringify(res.diagnostics.map(d => `${d.code}: ${d.message}`)))
    }
    check('tài liệu có ít nhất 4 ví dụ khối hình', count >= 4, `thấy ${count}`)
  }
}

/* ================================================================== *
 * 7. FIXTURE TN-1 — công thức xác định
 * ================================================================== */
section('7. Fixture lấy từ TN-1 (công thức xác định)')

{
  const cases = [
    ['TN-1 Q14 bảng dấu', FIXTURES.TN1_Q14_DERIVATIVE_SIGNS.json, 'bbt'],
    ['TN-1 Q22 đồ thị', FIXTURES.TN1_Q22_GRAPH.json, 'graph'],
    ['TN-1 Q24 đồ thị phân thức', FIXTURES.TN1_Q24_GRAPH.json, 'graph'],
    ['TN-1 Q58 nửa đường tròn', FIXTURES.TN1_Q58_GRAPH.json, 'graph'],
    ['TN-1 Q66 lượng giác', FIXTURES.TN1_Q66_GRAPH.json, 'graph'],
    ['TN-1 Q9 bảng dấu minh họa', FIXTURES.TN1_Q9_SIGN_TABLE.json, 'bbt'],
    ['3D chóp (fixture riêng)', FIXTURES.GEO3D_PYRAMID.json, 'geo3d'],
    ['3D hộp (fixture riêng)', FIXTURES.GEO3D_BOX.json, 'geo3d']
  ]
  cases.forEach(([name, json, type]) => {
    const res = compileDiagram(type, JSON.stringify(json), { uid: 99 })
    check(`${name}: biên dịch thành công`, res.ok,
      JSON.stringify(res.diagnostics.map(d => `${d.code}: ${d.message}`)))
    check(`${name}: có SVG`, res.svg.includes('<svg'))
  })

  // Kiểm chứng bằng giá trị toán học độc lập
  const q24 = FIXTURES.TN1_Q24_GRAPH.json
  const f24 = parseExpression('(x^2+3)/(x+1)')
  near('TN-1 Q24: f(-3) = -6', evaluate(f24, -3), -6, 1e-12)
  near('TN-1 Q24: f(1) = 2', evaluate(f24, 1), 2, 1e-12)
  const f58 = parseExpression('sqrt(4-x^2)')
  near('TN-1 Q58: f(0) = 2', evaluate(f58, 0), 2, 1e-12)
  near('TN-1 Q58: f(2) = 0', evaluate(f58, 2), 0, 1e-12)
  const f66 = parseExpression('sin(x)+cos(2*x)')
  const xMax = Math.asin(0.25)
  near('TN-1 Q66: GTLN = 9/8', evaluate(f66, xMax), 9 / 8, 1e-12)
  const f22 = parseExpression('x^3-3*x+2')
  near('TN-1 Q22: f(-1) = 4', evaluate(f22, -1), 4, 1e-12)
  near('TN-1 Q22: f(1) = 0', evaluate(f22, 1), 0, 1e-12)
}

/* ================================================================== *
 * Tổng kết
 * ================================================================== */
console.log(`\n${'-'.repeat(60)}`)
console.log(`KẾT QUẢ: ${passed} đạt, ${failed} lỗi`)
if (failed) {
  console.log('Các mục lỗi:')
  failures.forEach(f => console.log(`  - ${f}`))
  process.exit(1)
}
console.log('Tất cả kiểm thử đều đạt ✅')
