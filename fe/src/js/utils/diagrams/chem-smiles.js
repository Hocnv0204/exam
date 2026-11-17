/**
 * chem-smiles.js — Vẽ công thức cấu tạo từ SMILES thành SVG (đồng bộ, không DOM).
 *
 * SmilesDrawer chỉ dùng để phân tích SMILES và tính toạ độ 2D (Parser + DrawerBase, thuần JS);
 * nét vẽ, nhãn, vòng thơm, ngoặc polime do module này tự vẽ theo kiểu SGK, dùng currentColor
 * nên đúng ở mọi chế độ màu và bản in.
 *
 * Cú pháp khối (dòng đầu là SMILES, các dòng sau là tuỳ chọn `khoá: giá trị`):
 *   *CC(c1ccccc1)*        ← dấu * đánh dấu 2 đầu mắt xích polime
 *   polymer: n            ← chữ chỉ số mắt xích (mặc định n khi có đúng 2 dấu *)
 *   style: condensed      ← skeletal (mặc định, công thức khung) | condensed (hiện CH3/CH2/CH ngoài vòng)
 *
 * Kết quả: { ok, svg, smiles, diagnostics:[{severity, code, field, line, message}] }
 */

import Parser from 'smiles-drawer/src/Parser.js'
import DrawerBase from 'smiles-drawer/src/DrawerBase.js'
import { escapeXml } from './svg.js'

const VALENCE = { B: 3, C: 4, N: 3, O: 2, P: 3, S: 2, F: 1, Cl: 1, Br: 1, I: 1 }
const FONT = 16
const SUB_FONT = 11
const STYLES = ['skeletal', 'condensed']
const KNOWN_OPTIONS = ['polymer', 'style']

const f1 = n => (Number.isFinite(n) ? Math.round(n * 10) / 10 : 0)

function diag(severity, code, message, line) {
  return { severity, code, field: null, line: line ?? null, message }
}

/** Tách SMILES + tuỳ chọn. Dòng của tuỳ chọn tính theo vị trí trong khối (1-based). */
export function parseSmilesBlock(code) {
  const lines = String(code == null ? '' : code).replace(/\r\n/g, '\n').split('\n')
  let smiles = ''
  let smilesLine = 1
  const options = {}
  const optionLines = {}
  const unknown = []
  lines.forEach((raw, i) => {
    const t = raw.trim()
    if (!t) return
    const m = t.match(/^([a-z_]+)\s*:\s*(.*)$/i)
    if (smiles && m) {
      const key = m[1].toLowerCase()
      if (KNOWN_OPTIONS.includes(key)) { options[key] = m[2].trim(); optionLines[key] = i + 1 } else unknown.push({ key, line: i + 1 })
      return
    }
    if (!smiles) { smiles = t; smilesLine = i + 1; return }
    unknown.push({ key: t, line: i + 1 })
  })
  return { smiles, smilesLine, options, optionLines, unknown }
}

function layout(smiles) {
  const tree = Parser.parse(smiles, {})
  const d = new DrawerBase({})
  d.initDraw(tree, 'light', false)
  d.processGraph()
  const atoms = d.graph.vertices.map(v => ({
    id: v.id,
    x: v.position.x,
    y: v.position.y,
    el: v.value.element,
    aromatic: !!v.value.isPartOfAromaticRing,
    bracket: v.value.bracket || null
  }))
  const bonds = d.graph.edges.map(e => ({
    a: e.sourceId,
    b: e.targetId,
    o: e.bondType === '=' ? 2 : e.bondType === '#' ? 3 : e.bondType === '$' ? 4 : 1
  }))
  const rings = (d.rings || []).map(r => r.members.slice())
  return { atoms, bonds, rings, bondLength: d.opts.bondLength || 30 }
}

function labelText(parts) {
  // parts: [{t, kind:'n'|'sub'|'sup'}] → tspans với dy tuyệt đối để quay về đúng dòng gốc
  let shift = 0
  return parts.map(p => {
    const target = p.kind === 'sub' ? 4 : p.kind === 'sup' ? -6 : 0
    const dy = target - shift
    shift = target
    const size = p.kind === 'n' ? '' : ` font-size="${SUB_FONT}"`
    return `<tspan${size}${dy ? ` dy="${dy}"` : ''}>${escapeXml(p.t)}</tspan>`
  }).join('')
}

function labelWidth(parts) {
  return parts.reduce((w, p) => w + p.t.length * (p.kind === 'n' ? FONT * 0.6 : SUB_FONT * 0.55), 0)
}

/**
 * @param {string} code nội dung khối ```smiles (hoặc chuỗi inline)
 * @param {{line?:number}} ctx line = dòng mở khối trong file đề (để báo lỗi đúng dòng)
 */
export function renderSmiles(code, ctx = {}) {
  const base = Number.isFinite(ctx.line) ? ctx.line : 0
  const at = l => (base ? base + l : l)
  const { smiles, smilesLine, options, optionLines, unknown } = parseSmilesBlock(code)
  const diagnostics = []
  const fail = () => ({ ok: false, svg: '', smiles, diagnostics })

  unknown.forEach(u => diagnostics.push(diag('warning', 'UNKNOWN_OPTION',
    `Dòng ${u.line}: "${u.key}" không phải tuỳ chọn hợp lệ (chỉ dùng polymer:, style:). Dòng này bị bỏ qua.`, at(u.line))))

  if (!smiles) {
    diagnostics.push(diag('error', 'EMPTY', 'Khối smiles trống: dòng đầu phải là chuỗi SMILES.', at(1)))
    return fail()
  }
  const style = (options.style || 'skeletal').toLowerCase()
  if (!STYLES.includes(style)) {
    diagnostics.push(diag('error', 'BAD_OPTION',
      `Dòng ${optionLines.style}: style "${options.style}" không hợp lệ (chỉ skeletal hoặc condensed).`, at(optionLines.style)))
    return fail()
  }
  const condensed = style === 'condensed'
  if (options.polymer !== undefined && !/^[a-z]$/i.test(options.polymer)) {
    diagnostics.push(diag('error', 'BAD_OPTION',
      `Dòng ${optionLines.polymer}: polymer phải là 1 chữ cái (ví dụ polymer: n).`, at(optionLines.polymer)))
    return fail()
  }

  // SmilesDrawer bỏ qua số đóng vòng lẻ (C1CC) → tự kiểm tra: mỗi số vòng phải xuất hiện theo cặp
  const ringDigits = smiles.replace(/\[[^\]]*\]/g, '').match(/%\d\d|\d/g) || []
  const open = new Set()
  ringDigits.forEach(dg => { if (open.has(dg)) open.delete(dg); else open.add(dg) })
  if (open.size) {
    diagnostics.push(diag('error', 'SMILES_PARSE',
      `Dòng ${smilesLine}: chuỗi SMILES "${smiles}" có số đóng vòng ${[...open].join(', ')} chưa được đóng (mỗi số vòng phải xuất hiện 2 lần, ví dụ C1CCCCC1).`, at(smilesLine)))
    return fail()
  }

  let mol
  try {
    mol = layout(smiles)
  } catch (err) {
    const msg = err && err.message ? err.message : String(err)
    diagnostics.push(diag('error', 'SMILES_PARSE',
      `Dòng ${smilesLine}: chuỗi SMILES "${smiles}" không hợp lệ (${msg}). Kiểm tra ngoặc ( ), số đóng vòng và ký hiệu nguyên tố.`, at(smilesLine)))
    return fail()
  }
  const { atoms, bonds, rings } = mol
  if (!atoms.length) {
    diagnostics.push(diag('error', 'EMPTY', 'Chuỗi SMILES không có nguyên tử nào.', at(smilesLine)))
    return fail()
  }

  const nb = atoms.map(() => [])
  bonds.forEach((b, i) => { nb[b.a].push([b.b, i]); nb[b.b].push([b.a, i]) })
  atoms.forEach(a => { a.star = a.el === '*' })
  const stars = atoms.filter(a => a.star).map(a => a.id)
  if (stars.length !== 0 && stars.length !== 2) {
    diagnostics.push(diag('error', 'POLYMER_STARS',
      `Dòng ${smilesLine}: có ${stars.length} dấu *; polime cần đúng 2 dấu * ở hai đầu mắt xích (hoặc bỏ hết dấu * nếu không phải polime).`, at(smilesLine)))
    return fail()
  }
  if (stars.some(i => nb[i].length !== 1)) {
    diagnostics.push(diag('error', 'POLYMER_STARS',
      `Dòng ${smilesLine}: mỗi dấu * phải nối với đúng 1 nguyên tử (đầu mắt xích).`, at(smilesLine)))
    return fail()
  }
  if (options.polymer !== undefined && !stars.length) {
    diagnostics.push(diag('error', 'POLYMER_STARS',
      `Dòng ${optionLines.polymer}: có tuỳ chọn polymer nhưng SMILES không có 2 dấu * đánh dấu đầu mắt xích (ví dụ *CC(Cl)*).`, at(optionLines.polymer)))
    return fail()
  }
  const polymer = stars.length === 2 ? (options.polymer || 'n') : null

  const ringOf = atoms.map(() => [])
  rings.forEach((members, ri) => members.forEach(id => ringOf[id].push(ri)))
  const inRing = id => ringOf[id].length > 0
  const ringCenter = ri => {
    const m = rings[ri]
    return { x: m.reduce((s, id) => s + atoms[id].x, 0) / m.length, y: m.reduce((s, id) => s + atoms[id].y, 0) / m.length }
  }
  const sharedRing = (a, b) => ringOf[a].find(r => ringOf[b].includes(r))
  const ringAromatic = ri => rings[ri].every(id => atoms[id].aromatic)

  // Chuẩn hoá kích thước: độ dài liên kết 39px (khung) / 50px (thu gọn, chừa chỗ cho nhãn CH2)
  const BL = condensed ? 50 : 39
  const k = BL / mol.bondLength
  atoms.forEach(a => { a.x *= k; a.y *= k })

  // Polime: 2 nguyên tử đầu mạch nằm ngang, phần thân ở dưới mạch, dấu * kéo thẳng ra 2 bên
  if (polymer) {
    const ends = stars.map(s => nb[s][0][0])
    const [pp, qq] = (ends[0] !== ends[1] ? ends : stars).map(i => atoms[i]).sort((p, q) => p.x - q.x)
    const ang = -Math.atan2(qq.y - pp.y, qq.x - pp.x)
    if (Number.isFinite(ang) && (qq.x !== pp.x || qq.y !== pp.y)) {
      const c = Math.cos(ang), s = Math.sin(ang)
      atoms.forEach(a => { const x = a.x * c - a.y * s, y = a.x * s + a.y * c; a.x = x; a.y = y })
    }
    const body = atoms.filter(a => !a.star)
    const chainY = ends.reduce((t, i) => t + atoms[i].y, 0) / 2
    if (body.reduce((t, a) => t + a.y, 0) / body.length < chainY - 1) atoms.forEach(a => { a.y = -a.y })

    if (condensed) {
      // mạch chính (đường đi giữa 2 đầu) nằm ngang, mỗi nhánh xoay dựng thẳng xuống
      const [e0, e1] = ends
      const prev = new Map([[e0, -1]])
      const qu = [e0]
      while (qu.length) {
        const u = qu.shift()
        for (const [v] of nb[u]) if (!prev.has(v) && !atoms[v].star) { prev.set(v, u); qu.push(v) }
      }
      const chain = []
      for (let u = e1; u !== -1 && u !== undefined; u = prev.get(u)) chain.push(u)
      const inChain = new Set(chain)
      if (chain.length >= 2 && !chain.some(inRing)) {
        // đặt lại mạch chính thẳng hàng theo thứ tự từ trái sang phải
        const ordered = chain.slice().reverse()
        const left = Math.min(atoms[e0].x, atoms[e1].x)
        const y0 = atoms[e0].y
        const startAtLeft = atoms[ordered[0]].x <= atoms[ordered[ordered.length - 1]].x
        const seq = startAtLeft ? ordered : ordered.slice().reverse()
        const moved = new Set()
        seq.forEach((id, i) => {
          const nx = left + i * BL, dx = nx - atoms[id].x, dy = y0 - atoms[id].y
          // dời cả nhánh theo nguyên tử mạch chính
          const st = [id]; moved.add(id)
          while (st.length) {
            const u = st.pop(); atoms[u].x += dx; atoms[u].y += dy
            for (const [v] of nb[u]) if (!moved.has(v) && !inChain.has(v) && !atoms[v].star) { moved.add(v); st.push(v) }
          }
        })
      }
      const subtreeSize = (from, root) => {
        const seen = new Set([from, root]); const st = [root]; let n = 0
        while (st.length) { const u = st.pop(); n++; for (const [v] of nb[u]) if (!seen.has(v) && !atoms[v].star) { seen.add(v); st.push(v) } }
        return n
      }
      chain.forEach(cid => {
        const subs = nb[cid].map(([sid]) => sid).filter(sid => !inChain.has(sid) && !atoms[sid].star)
        if (!subs.length || subs.length > 2) return
        // 1 nhánh: dựng xuống; 2 nhánh: nhánh nhỏ lên trên, nhánh lớn xuống dưới (kiểu SGK, ví dụ PMMA)
        const order = subs.length === 2 ? subs.slice().sort((p, q) => subtreeSize(cid, p) - subtreeSize(cid, q)) : subs
        const targets = subs.length === 2 ? [-Math.PI / 2, Math.PI / 2] : [Math.PI / 2]
        order.forEach((sid, ti) => rotateBranch(cid, sid, targets[ti]))
      })
      function rotateBranch(cid, sid, target) {
        const C = atoms[cid]
        const rot = target - Math.atan2(atoms[sid].y - C.y, atoms[sid].x - C.x)
        const cs = Math.cos(rot), sn = Math.sin(rot)
        const seen = new Set([...inChain, sid])
        const st = [sid]
        while (st.length) {
          const u = st.pop()
          const a = atoms[u], x = a.x - C.x, y = a.y - C.y
          a.x = C.x + x * cs - y * sn
          a.y = C.y + x * sn + y * cs
          for (const [v] of nb[u]) if (!seen.has(v) && !atoms[v].star) { seen.add(v); st.push(v) }
        }
      }
    }
  }

  // Nhãn nguyên tử
  atoms.forEach(a => {
    if (a.star) return
    const deg = nb[a.id].length
    const used = nb[a.id].reduce((s, [, bi]) => s + bonds[bi].o, 0) + (a.aromatic ? 1 : 0)
    const br = a.bracket
    const charge = br && br.charge ? br.charge : 0
    let h = br && Number.isFinite(br.hcount) ? br.hcount : Math.max(0, (VALENCE[a.el] ?? 0) - used)
    if (br && !Number.isFinite(br.hcount)) h = 0
    const tiny = atoms.filter(x => !x.star).length <= 2   // CH≡CH, CH3–NH3+: hiện đủ nhãn C
    const showCarbon = a.el !== 'C' || deg === 0 || charge !== 0 || tiny || (condensed && !inRing(a.id))
    if (!showCarbon) return
    const elPart = { t: a.el, kind: 'n' }
    const hParts = h ? [{ t: 'H', kind: 'n' }].concat(h > 1 ? [{ t: String(h), kind: 'sub' }] : []) : []
    const avgx = nb[a.id].reduce((s, [j]) => s + atoms[j].x, 0) / (deg || 1)
    const hFirst = h && deg > 0 && a.el !== 'C' && avgx > a.x + 1
    const parts = hFirst ? hParts.concat(elPart) : [elPart].concat(hParts)
    if (charge) {
      const mag = Math.abs(charge)
      parts.push({ t: (mag > 1 ? String(mag) : '') + (charge > 0 ? '+' : '−'), kind: 'sup' })
    }
    a.parts = parts
    a.w = labelWidth(parts)
  })

  const out = []
  const line = (x1, y1, x2, y2) => out.push(`<line x1="${f1(x1)}" y1="${f1(y1)}" x2="${f1(x2)}" y2="${f1(y2)}"/>`)
  const trimAt = (a, ux, uy) => (a.parts ? Math.min(Math.abs(ux) * (a.w / 2 + 3) + Math.abs(uy) * 11, 24) : 0)
  const brackets = []
  const body = atoms.filter(a => !a.star)
  const bodyMinX = Math.min(...body.map(a => a.x - (a.w || 0) / 2))
  const bodyMaxX = Math.max(...body.map(a => a.x + (a.w || 0) / 2))

  // Hướng ngoặc: đầu mạch bên trái mở ngoặc trái, đầu bên phải mở ngoặc phải
  const starDir = new Map()
  if (polymer) {
    const [s0, s1] = stars
    const e0 = atoms[nb[s0][0][0]], e1 = atoms[nb[s1][0][0]]
    const leftFirst = e0.x !== e1.x ? e0.x < e1.x : atoms[s0].x <= atoms[s1].x
    starDir.set(s0, leftFirst ? -1 : 1)
    starDir.set(s1, leftFirst ? 1 : -1)
  }
  bonds.forEach(bd => {
    const A = atoms[bd.a], B = atoms[bd.b]
    if (A.star || B.star) {
      const st = A.star ? A : B, o = A.star ? B : A
      const dir = starDir.get(st.id)
      const pad = condensed ? 14 : 10
      const bx = dir > 0 ? Math.max(bodyMaxX + pad, o.x + BL * 0.6) : Math.min(bodyMinX - pad, o.x - BL * 0.6)
      const ex = bx + dir * 14
      const start = o.parts ? o.x + dir * (o.w / 2 + 3) : o.x
      line(start, o.y, ex, o.y)
      brackets.push({ x: bx, dir })
      st.x = ex; st.y = o.y
      return
    }
    const dx = B.x - A.x, dy = B.y - A.y, len = Math.hypot(dx, dy) || 1
    const ux = dx / len, uy = dy / len
    const ta = trimAt(A, ux, uy), tb = trimAt(B, ux, uy)
    const x1 = A.x + ux * ta, y1 = A.y + uy * ta, x2 = B.x - ux * tb, y2 = B.y - uy * tb
    const px = -uy, py = ux
    if (bd.o === 1) { line(x1, y1, x2, y2); return }
    if (bd.o >= 3) { [-1, 0, 1].forEach(t => line(x1 + px * 3.5 * t, y1 + py * 3.5 * t, x2 + px * 3.5 * t, y2 + py * 3.5 * t)); return }
    const ri = sharedRing(bd.a, bd.b)
    if (ri !== undefined) {
      const c = ringCenter(ri)
      const side = ((c.x - A.x) * px + (c.y - A.y) * py) >= 0 ? 1 : -1
      const off = 5 * side, sh = len * 0.15
      line(x1, y1, x2, y2)
      line(x1 + px * off + ux * sh, y1 + py * off + uy * sh, x2 + px * off - ux * sh, y2 + py * off - uy * sh)
      return
    }
    line(x1 + px * 2.6, y1 + py * 2.6, x2 + px * 2.6, y2 + py * 2.6)
    line(x1 - px * 2.6, y1 - py * 2.6, x2 - px * 2.6, y2 - py * 2.6)
  })

  // Vòng thơm (viết chữ thường) → vòng tròn bên trong
  rings.forEach((members, ri) => {
    if (!ringAromatic(ri)) return
    const c = ringCenter(ri)
    const inr = Math.min(...members.map(id => Math.hypot(atoms[id].x - c.x, atoms[id].y - c.y))) * Math.cos(Math.PI / members.length)
    out.push(`<circle cx="${f1(c.x)}" cy="${f1(c.y)}" r="${f1(inr * 0.62)}" fill="none"/>`)
  })

  atoms.forEach(a => {
    if (!a.parts) return
    out.push(`<text x="${f1(a.x)}" y="${f1(a.y + FONT * 0.35)}" text-anchor="middle" stroke="none">${labelText(a.parts)}</text>`)
  })

  // Khung bao
  const xs = [], ys = []
  atoms.forEach(a => {
    const hw = a.parts ? a.w / 2 : 0
    xs.push(a.x - hw, a.x + hw)
    ys.push(a.y - (a.parts ? FONT * 0.7 : 0), a.y + (a.parts ? FONT * 0.6 : 0))
  })
  let top = Math.min(...ys), bot = Math.max(...ys)
  if (brackets.length) {
    const bTop = Math.min(...body.map(a => a.y)) - 18
    const bBot = Math.max(...body.map(a => a.y)) + 16
    brackets.forEach(b => {
      out.push(`<path fill="none" d="M ${f1(b.x - 6 * b.dir)} ${f1(bTop)} Q ${f1(b.x + 6 * b.dir)} ${f1((bTop + bBot) / 2)} ${f1(b.x - 6 * b.dir)} ${f1(bBot)}"/>`)
      xs.push(b.x - 8, b.x + 8)
    })
    const r = brackets.find(b => b.dir > 0) || brackets[0]
    out.push(`<text x="${f1(r.x + 6)}" y="${f1(bBot + 5)}" font-style="italic" font-size="${FONT - 1}" stroke="none">${escapeXml(polymer)}</text>`)
    xs.push(r.x + 18)
    top = Math.min(top, bTop)
    bot = Math.max(bot, bBot + 8)
  }
  const M = 6
  const x0 = Math.min(...xs) - M, y0 = top - M
  const W = Math.max(...xs) - x0 + M, H = bot - y0 + M
  const label = polymer ? `Công thức cấu tạo mắt xích polime: ${smiles}` : `Công thức cấu tạo: ${smiles}`
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" class="chem-svg" viewBox="${f1(x0)} ${f1(y0)} ${f1(W)} ${f1(H)}" width="${Math.ceil(W)}" height="${Math.ceil(H)}"` +
    ` role="img" aria-label="${escapeXml(label)}" data-smiles="${escapeXml(smiles)}"` +
    ` style="max-width:100%;height:auto;overflow:visible" stroke="currentColor" stroke-width="1.4" stroke-linecap="round" fill="currentColor"` +
    ` font-family="'Times New Roman','Noto Serif',serif" font-size="${FONT}">${out.join('')}</svg>`
  return { ok: !diagnostics.some(d => d.severity === 'error'), svg, smiles, diagnostics }
}
