/** Trình vẽ công thức cấu tạo thu gọn (khối `ctct`), không phụ thuộc DOM. */
import { escapeXml } from './svg.js'

const CHAR_W = 11
const LINE_H = 22
const FONT = 17
const GAP = 4
const ATOM_RE = /[A-Za-z0-9()+⁺⁻]+/g
const KNOWN_CHARS = /^[A-Za-z0-9()+⁺⁻\s—–\-=≡|‖/\\]$/

function splitSubscripts(label) {
  const parts = []
  let i = 0
  while (i < label.length) {
    const ch = label[i]
    const prev = label[i - 1]
    if (/\d/.test(ch) && prev && /[A-Za-z)]/.test(prev)) {
      let j = i
      while (j < label.length && /\d/.test(label[j])) j++
      parts.push({ text: label.slice(i, j), sub: true })
      i = j
    } else {
      let j = i
      while (j < label.length && !(/\d/.test(label[j]) && /[A-Za-z)]/.test(label[j - 1] || ''))) j++
      parts.push({ text: label.slice(i, j), sub: false })
      i = j
    }
  }
  return parts
}

function glyphWidth(label) {
  // Ngoặc hẹp hơn ký tự chữ; nhờ vậy (CH2)5 không đẩy liên kết lệch về một phía.
  return splitSubscripts(label).reduce((width, part) => width + [...part.text].reduce((sum, ch) => {
    if (ch === '(' || ch === ')') return sum + FONT * 0.35
    return sum + (part.sub ? FONT * 0.42 : FONT * 0.64)
  }, 0), 0)
}

/**
 * Phân tích lưới CTCT. `row` trong diagnostics là chỉ số dòng 0-based của khối
 * gốc; renderer dùng nó để gắn số dòng của file đề.
 */
export function parseCtct(source) {
  const diagnostics = []
  let sourceLines = String(source || '').replace(/\t/g, '    ').split('\n')
  let polymer = null
  const head = (sourceLines[0] || '').trim().match(/^polymer\s*:?[\s]+([a-z])$/i)
  if (head) {
    polymer = head[1]
    sourceLines = sourceLines.slice(1)
  }

  let first = 0
  let last = sourceLines.length
  while (first < last && !sourceLines[first].trim()) first++
  while (last > first && !sourceLines[last - 1].trim()) last--
  const lineOffset = polymer ? 1 : 0
  const lines = sourceLines.slice(first, last)
  const rows = lines.map((text, index) => ({ text, row: lineOffset + first + index }))
  const atoms = []
  const bonds = []

  for (const { text: line, row } of rows) {
    ATOM_RE.lastIndex = 0
    let match
    while ((match = ATOM_RE.exec(line))) {
      atoms.push({ id: atoms.length, row, start: match.index, end: match.index + match[0].length, label: match[0] })
    }
    for (let col = 0; col < line.length; col++) {
      if (!KNOWN_CHARS.test(line[col])) {
        diagnostics.push({ code: 'UNKNOWN_CHAR', row, col, message: `Dòng ${row + 1}, cột ${col + 1}: ký tự "${line[col]}" không hợp lệ.` })
      }
    }
  }

  const atomsInRow = row => atoms.filter(atom => atom.row === row).sort((a, b) => a.start - b.start)
  const atomAt = (row, col, slack = 1) => atomsInRow(row).find(atom => col >= atom.start - slack && col < atom.end + slack)

  for (const { text: line, row } of rows) {
    const rowAtoms = atomsInRow(row)
    for (let k = 0; k + 1 < rowAtoms.length; k++) {
      const a = rowAtoms[k]
      const b = rowAtoms[k + 1]
      const between = line.slice(a.end, b.start)
      const token = between.replace(/\s/g, '')
      if (!token) {
        diagnostics.push({ code: 'MISSING_BOND', row, message: `Dòng ${row + 1}: "${a.label}" và "${b.label}" đứng cạnh nhau nhưng không có liên kết.` })
        continue
      }
      const order = /≡/.test(token) ? 3 : /=/.test(token) ? 2 : /[—–-]/.test(token) ? 1 : 0
      if (!order) {
        diagnostics.push({ code: 'UNKNOWN_BOND', row, message: `Dòng ${row + 1}: ký hiệu liên kết "${token}" không hợp lệ.` })
        continue
      }
      bonds.push({ kind: 'h', a: a.id, b: b.id, order })
    }

    for (let col = 0; col < line.length; col++) {
      const ch = line[col]
      if (ch === '|' || ch === '‖') {
        const dbl = ch === '‖' || line[col + 1] === '|'
        if (line[col - 1] === '|') continue
        const up = atomAt(row - 1, col)
        const down = atomAt(row + 1, col)
        if (!up || !down) {
          diagnostics.push({ code: 'DANGLING_BOND', row, col, message: `Dòng ${row + 1}, cột ${col + 1}: liên kết dọc không nối với nhóm nguyên tử ${!up ? 'ở trên' : 'ở dưới'}.` })
          continue
        }
        bonds.push({ kind: 'v', a: up.id, b: down.id, order: dbl ? 2 : 1, col: col + (dbl && ch === '|' ? 0.5 : 0) })
      } else if (ch === '/' || ch === '\\') {
        const upCandidates = atomsInRow(row - 1)
        const downCandidates = atomsInRow(row + 1)
        // Cho phép lệch tối đa 3 cột: nhãn như CH2 rộng hơn ký tự liên kết
        // nên đầu nhãn gần nhất có thể không nằm đúng dưới dấu / hoặc \\.
        const up = ch === '/' ? upCandidates.find(atom => atom.start >= col - 3 && atom.start <= col + 3) : [...upCandidates].reverse().find(atom => atom.end <= col + 3 && atom.end >= col - 3)
        const down = ch === '/' ? [...downCandidates].reverse().find(atom => atom.end <= col + 3 && atom.end >= col - 3) : downCandidates.find(atom => atom.start >= col - 3 && atom.start <= col + 3)
        if (!up || !down) {
          diagnostics.push({ code: 'DANGLING_BOND', row, col, message: `Dòng ${row + 1}, cột ${col + 1}: liên kết chéo "${ch}" không nối đủ hai đầu.` })
          continue
        }
        bonds.push({ kind: 'd', a: up.id, b: down.id, order: 1 })
      }
    }
  }

  if (!atoms.length) diagnostics.push({ code: 'EMPTY', row: 0, message: 'Khối ctct trống.' })
  return { lines, atoms, bonds, polymer, diagnostics }
}

function diagnosticForContext(diagnostic, ctx) {
  const offset = Number.isFinite(ctx.line) ? ctx.line : 0
  return {
    severity: 'error',
    code: diagnostic.code,
    field: null,
    line: offset + diagnostic.row + 1,
    message: diagnostic.message
  }
}

/** Vẽ CTCT thành SVG độc lập, an toàn để nhúng trực tiếp. */
export function renderCtct(source, ctx = {}) {
  const model = parseCtct(source)
  const diagnostics = model.diagnostics.map(diagnostic => diagnosticForContext(diagnostic, ctx))
  if (diagnostics.some(diagnostic => diagnostic.severity === 'error')) return { ok: false, svg: '', diagnostics }

  const { atoms, bonds, polymer } = model
  const baseRow = Math.min(...atoms.map(atom => atom.row))
  const pos = atom => {
    const cx = (atom.start + atom.end) / 2 * CHAR_W
    const cy = (atom.row - baseRow) * LINE_H
    const width = glyphWidth(atom.label)
    return { cx, cy, width, left: cx - width / 2, right: cx + width / 2, top: cy - FONT * 0.55, bottom: cy + FONT * 0.5 }
  }
  const positions = new Map(atoms.map(atom => [atom.id, pos(atom)]))
  const minX = Math.min(...atoms.map(atom => positions.get(atom.id).left))
  const maxX = Math.max(...atoms.map(atom => positions.get(atom.id).right))
  const minY = Math.min(...atoms.map(atom => positions.get(atom.id).top))
  const maxY = Math.max(...atoms.map(atom => positions.get(atom.id).bottom))
  const f = value => Number(value).toFixed(1)
  const out = []
  const line = (x1, y1, x2, y2) => out.push(`<line x1="${f(x1)}" y1="${f(y1)}" x2="${f(x2)}" y2="${f(y2)}"/>`)

  for (const bond of bonds) {
    const a = positions.get(bond.a)
    const b = positions.get(bond.b)
    if (bond.kind === 'h') {
      const offsets = bond.order === 1 ? [0] : bond.order === 2 ? [-2.6, 2.6] : [-4, 0, 4]
      offsets.forEach(offset => line(a.right + GAP, a.cy + offset, b.left - GAP, a.cy + offset))
    } else if (bond.kind === 'v') {
      const offsets = bond.order === 1 ? [0] : [-2.6, 2.6]
      offsets.forEach(offset => line(bond.col * CHAR_W + CHAR_W / 2 + offset, a.bottom + GAP, bond.col * CHAR_W + CHAR_W / 2 + offset, b.top - GAP + 2))
    } else {
      const goesRight = a.cx > b.cx
      line(goesRight ? a.left + 2 : a.right - 2, a.bottom + 1, goesRight ? b.right - 2 : b.left + 2, b.top + 1)
    }
  }

  let pad = { left: 6, right: 6 }
  if (polymer) {
    const chain = atoms.filter(atom => atom.row === atoms[0].row).sort((a, b) => a.start - b.start)
    const first = positions.get(chain[0].id)
    const last = positions.get(chain[chain.length - 1].id)
    const top = minY - 8
    const bottom = maxY + 8
    const height = bottom - top
    // Ngoặc bao cả nhánh rộng hơn mạch chính (vd C6H5 dưới CH) để chỉ số n không đè lên nhãn
    const left = Math.min(first.left, minX) - 20
    const right = Math.max(last.right, maxX) + 20
    const curve = (x, direction) => out.push(`<path d="M ${f(x + 6 * direction)} ${f(top)} Q ${f(x - 6 * direction)} ${f(top + height / 2)} ${f(x + 6 * direction)} ${f(bottom)}" fill="none"/>`)
    curve(left, 1)
    curve(right, -1)
    line(left - 14, first.cy, first.left - GAP, first.cy)
    line(last.right + GAP, last.cy, right + 14, last.cy)
    out.push(`<text x="${f(right + 9)}" y="${f(bottom + 3)}" font-size="${f(FONT * 0.8)}" font-style="italic" stroke="none">${escapeXml(polymer)}</text>`)
    pad = { left: 30, right: 42 }
  }

  for (const atom of atoms) {
    const point = positions.get(atom.id)
    let isLow = false
    const spans = splitSubscripts(atom.label).map(part => {
      const dy = part.sub ? (isLow ? 0 : 4) : (isLow ? -4 : 0)
      isLow = part.sub
      return `<tspan${part.sub ? ` font-size="${f(FONT * 0.68)}"` : ''}${dy ? ` dy="${dy}"` : ''}>${escapeXml(part.text)}</tspan>`
    }).join('')
    out.push(`<text x="${f(point.cx)}" y="${f(point.cy + FONT * 0.35)}" text-anchor="middle" stroke="none">${spans}</text>`)
  }

  const vbX = minX - pad.left - 10
  const vbY = minY - 14
  const vbW = maxX - minX + pad.left + pad.right + 20
  const vbH = maxY - minY + 30
  const label = ctx.title || 'Công thức cấu tạo'
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" class="chem-svg" data-ctct="${escapeXml(source)}" viewBox="${f(vbX)} ${f(vbY)} ${f(vbW)} ${f(vbH)}" width="${f(vbW)}" height="${f(vbH)}" role="img" aria-label="${escapeXml(label)}" stroke="currentColor" stroke-width="${f(1.5)}" stroke-linecap="round" fill="currentColor" font-family="&#39;Times New Roman&#39;, &#39;Noto Serif&#39;, serif" font-size="${f(FONT)}" style="max-width:100%;height:auto;overflow:visible">${out.join('')}</svg>`
  return { ok: true, svg, diagnostics }
}
