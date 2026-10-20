/**
 * Bộ biên dịch Code-to-SVG cho đề thi Toán & Hóa học THPT.
 * Hỗ trợ: Bảng biến thiên (bbt), Đồ thị hàm số (graph),
 * Hình không gian (geo3d), Công thức cấu tạo (smiles).
 */

let diagramUid = 0

export function compileDiagramToSVG(type, code) {
  diagramUid += 1
  try {
    switch ((type || '').toLowerCase()) {
      case 'bbt':
        return renderBBT(code, diagramUid)
      case 'graph':
        return renderFunctionGraph(code, diagramUid)
      case 'geo3d':
        return renderGeo3D(code)
      case 'smiles':
        return renderSmilesBlock(code, diagramUid)
      default:
        return ''
    }
  } catch (err) {
    console.error(`[DiagramRenderer] Lỗi biên dịch khối ${type}:`, err)
    return `<div style="padding:8px;font-size:12px;color:#b91c1c;border:1px solid #fecaca;border-radius:8px;background:#fef2f2;">Lỗi cú pháp hình vẽ (${type})</div>`
  }
}

/* ==========================================================================
 * 1. BẢNG BIẾN THIÊN & BẢNG XÉT DẤU (BBT)
 * ========================================================================== */
function renderBBT(code, uid) {
  const lines = String(code || '').split('\n').map((l) => l.trim()).filter(Boolean)
  const rows = {}
  lines.forEach((line) => {
    const sepIdx = line.indexOf('|')
    if (sepIdx !== -1) {
      const key = line.slice(0, sepIdx).trim()
      const val = line.slice(sepIdx + 1).trim()
      rows[key] = val
    }
  })

  const xLabel = rows['x'] !== undefined ? 'x' : Object.keys(rows)[0] || 'x'
  const ypLabel = rows["y'"] !== undefined ? "y'" : (rows["f'(x)"] !== undefined ? "f'(x)" : "y'")
  const yLabel = rows['y'] !== undefined ? 'y' : (rows['f(x)'] !== undefined ? 'f(x)' : 'y')

  const xCells = (rows[xLabel] || '').split(',').map((s) => s.trim()).filter(Boolean)
  const ypTokens = (rows[ypLabel] || '').split(',').map((s) => s.trim()).filter(Boolean)
  const yRaw = rows[yLabel] || ''

  const hasYRow = Boolean(yRaw)
  const longestLabel = [xLabel, ypLabel, ...(hasYRow ? [yLabel] : [])]
    .reduce((m, l) => Math.max(m, String(l).length), 1)
  const labelColWidth = Math.max(58, longestLabel * 10 + 18)

  // Lưới cột lấy từ dòng y' (khoảng / điểm tới hạn xen kẽ).
  // Mọi hàng (x, y', y) đều bám trên CÙNG lưới này để các mốc thẳng hàng nhau.
  const grid = ypTokens.length ? ypTokens : xCells
  const N = Math.max(1, grid.length)
  const colWidth = 74
  const contentW = Math.max(xCells.length, N, 1) * colWidth
  const cellW = contentW / N
  const cellL = (i) => labelColWidth + i * cellW
  const cellC = (i) => labelColWidth + (i + 0.5) * cellW

  const width = labelColWidth + contentW + 14
  const height = hasYRow ? 196 : 80
  const arrowId = `bbt-arrow-${uid}`

  // Các ô "điểm" (y' = 0 hoặc ||) — nơi đặt mốc x và các giá trị cực trị
  const pointCells = []
  grid.forEach((tk, i) => { if (tk === '0' || tk === '||') pointCells.push(i) })

  // Vị trí neo: giá trị đầu sát mép trái ô đầu, giá trị cuối sát mép phải ô cuối,
  // các giá trị ở giữa rơi vào ô điểm tương ứng (nếu không khớp thì chia đều).
  const anchorFor = (count, i) => {
    if (count <= 1) return cellC(0)
    if (i === 0) return cellL(0) + cellW * 0.2
    if (i === count - 1) return cellL(N - 1) + cellW * 0.8
    if (pointCells.length >= count - 2) return cellC(pointCells[i - 1])
    return cellL(0) + (contentW * i) / (count - 1)
  }

  let svg = `<div class="diagram-wrap" style="margin:12px 0;display:flex;justify-content:center;overflow-x:auto;user-select:none;">` +
    `<svg width="${width}" height="${height}" viewBox="0 0 ${width} ${height}" style="background:#fff;border:1px solid #0f172a;border-radius:6px;">` +
    `<defs><marker id="${arrowId}" viewBox="0 0 10 10" refX="7" refY="5" markerWidth="6" markerHeight="6" orient="auto-start-reverse">` +
    `<path d="M 0 1.5 L 8.5 5 L 0 8.5 z" fill="#0f172a" /></marker></defs>` +
    `<line x1="${labelColWidth}" y1="0" x2="${labelColWidth}" y2="${height}" stroke="#0f172a" stroke-width="1.2"/>` +
    `<line x1="0" y1="38" x2="${width}" y2="38" stroke="#0f172a" stroke-width="1.2"/>` +
    (hasYRow ? `<line x1="0" y1="76" x2="${width}" y2="76" stroke="#0f172a" stroke-width="1.2"/>` : '') +
    `<foreignObject x="0" y="4" width="${labelColWidth}" height="30"><div style="display:flex;align-items:center;justify-content:center;height:100%;">$${xLabel}$</div></foreignObject>` +
    `<foreignObject x="0" y="42" width="${labelColWidth}" height="30"><div style="display:flex;align-items:center;justify-content:center;height:100%;">$${ypLabel}$</div></foreignObject>` +
    (hasYRow ? `<foreignObject x="0" y="120" width="${labelColWidth}" height="34"><div style="display:flex;align-items:center;justify-content:center;height:100%;">$${yLabel}$</div></foreignObject>` : '')

  xCells.forEach((val, idx) => {
    const cx = anchorFor(xCells.length, idx)
    svg += `<foreignObject x="${cx - 34}" y="4" width="68" height="30"><div style="display:flex;align-items:center;justify-content:center;height:100%;">$${val}$</div></foreignObject>`
  })

  ypTokens.forEach((val, idx) => {
    const cx = cellC(idx)
    if (val === '||') {
      svg += `<line x1="${cx - 2.5}" y1="38" x2="${cx - 2.5}" y2="${height}" stroke="#0f172a" stroke-width="1.1"/>`
      svg += `<line x1="${cx + 2.5}" y1="38" x2="${cx + 2.5}" y2="${height}" stroke="#0f172a" stroke-width="1.1"/>`
    } else {
      svg += `<foreignObject x="${cx - 28}" y="42" width="56" height="30"><div style="display:flex;align-items:center;justify-content:center;height:100%;">$${val}$</div></foreignObject>`
    }
  })

  if (hasYRow) {
    const tokens = yRaw.split(/\s+/).filter(Boolean)
    const valTokens = tokens.filter((tk) => tk !== '->' && tk !== '\\nearrow' && tk !== '~>' && tk !== '\\searrow' && tk !== '||')
    const vals = []
    const arrows = []
    let pendingDir = null

    for (let i = 0; i < tokens.length; i++) {
      const tk = tokens[i]
      if (tk === '->' || tk === '\\nearrow') {
        pendingDir = 'up'
      } else if (tk === '~>' || tk === '\\searrow') {
        pendingDir = 'down'
      } else if (tk === '||') {
        continue
      } else {
        const prev = tokens[i - 1]
        const next = tokens[i + 1]
        const vIdx = vals.length

        // Giá trị neo trên lưới cột; lệch nhẹ khi sát tiệm cận đứng || để khỏi chồng nét đôi
        let cx = anchorFor(valTokens.length, vIdx)
        if (next === '||') cx -= 18
        else if (prev === '||') cx += 18

        const prevUp = pendingDir === 'up'
        const nextUp = next === '->' || next === '\\nearrow'
        const nextDown = next === '~>' || next === '\\searrow'

        // Top = 96, Mid = 136, Bottom = 174.
        // Mũi tên kề quyết định đỉnh/đáy; vô cực chỉ dùng khi không có mũi tên kề.
        let cy = 136
        if (prevUp || nextDown) cy = 96
        else if (pendingDir === 'down' || nextUp) cy = 174
        else if (tk.includes('-\\infty')) cy = 174
        else if (tk.includes('+\\infty')) cy = 96

        if (vIdx > 0) arrows.push({ from: vIdx - 1, to: vIdx })
        vals.push({ text: tk, x: cx, y: cy })
        pendingDir = null
      }
    }

    vals.forEach((v) => {
      svg += `<foreignObject x="${(v.x - 34).toFixed(1)}" y="${v.y - 15}" width="68" height="30"><div style="display:flex;align-items:center;justify-content:center;height:100%;">$${v.text}$</div></foreignObject>`
    })

    arrows.forEach(({ from, to }) => {
      const a = vals[from]
      const b = vals[to]
      if (!a || !b) return
      const dx = b.x - a.x
      const dy = b.y - a.y
      const dist = Math.hypot(dx, dy) || 1
      const pad = Math.min(26, dist * 0.3)
      const x1 = a.x + (dx / dist) * pad
      const y1 = a.y + (dy / dist) * pad
      const x2 = b.x - (dx / dist) * pad
      const y2 = b.y - (dy / dist) * pad
      svg += `<line x1="${x1.toFixed(1)}" y1="${y1.toFixed(1)}" x2="${x2.toFixed(1)}" y2="${y2.toFixed(1)}" stroke="#0f172a" stroke-width="1.3" marker-end="url(#${arrowId})" />`
    })
  }

  svg += `</svg></div>`
  return svg
}

/* ==========================================================================
 * 2. ĐỒ THỊ HÀM SỐ (GRAPH)
 * ========================================================================== */
function renderFunctionGraph(code, uid) {
  const cfg = {
    fn: 'x^3 - 3*x + 1',
    domain: [-3, 3],
    range: [-3, 3],
    points: [],
    asymptotes: []
  }

  String(code || '').split('\n').forEach((line) => {
    const sep = line.indexOf(':')
    if (sep === -1) return
    const key = line.slice(0, sep).trim().toLowerCase()
    const val = line.slice(sep + 1).trim()
    if (!val) return

    if (key === 'fn') cfg.fn = val
    else if (key === 'domain') { try { cfg.domain = JSON.parse(val) } catch (_) {} }
    else if (key === 'range') { try { cfg.range = JSON.parse(val) } catch (_) {} }
    else if (key === 'points') {
      const matches = [...val.matchAll(/\(\s*([+-]?\d+(?:\.\d+)?)\s*,\s*([+-]?\d+(?:\.\d+)?)\s*\)/g)]
      cfg.points = matches.map((m) => [parseFloat(m[1]), parseFloat(m[2])])
    } else if (key === 'asymptotes') {
      cfg.asymptotes = val.split(',').map((s) => s.trim()).filter(Boolean)
    }
  })

  const width = 300
  const height = 280
  const pad = 28
  const [xMin, xMax] = cfg.domain
  const [yMin, yMax] = cfg.range

  const toX = (x) => pad + ((x - xMin) / (xMax - xMin)) * (width - 2 * pad)
  const toY = (y) => height - pad - ((y - yMin) / (yMax - yMin)) * (height - 2 * pad)

  const ox = toX(0)
  const oy = toY(0)
  const axisArrow = `graph-arrow-${uid}`
  const clipId = `graph-clip-${uid}`

  const compileExpr = (exprStr) => {
    const jsExpr = String(exprStr)
      .replace(/\^/g, '**')
      .replace(/\b(sin|cos|tan|sqrt|abs|log|exp)\b/g, 'Math.$1')
    return new Function('x', `try { return (${jsExpr}); } catch(e) { return NaN; }`)
  }

  let svg = `<div class="diagram-wrap" style="margin:12px 0;display:flex;justify-content:center;user-select:none;">` +
    `<svg width="${width}" height="${height}" viewBox="0 0 ${width} ${height}" style="background:#fff;border:1px solid #cbd5e1;border-radius:6px;">` +
    `<defs><marker id="${axisArrow}" viewBox="0 0 10 10" refX="8" refY="5" markerWidth="6" markerHeight="6" orient="auto">` +
    `<path d="M 0 1.5 L 9 5 L 0 8.5 z" fill="#0f172a" /></marker>` +
    `<clipPath id="${clipId}"><rect x="${pad}" y="${pad}" width="${width - 2 * pad}" height="${height - 2 * pad}" /></clipPath></defs>` +
    `<line x1="${pad - 8}" y1="${oy}" x2="${width - pad + 10}" y2="${oy}" stroke="#0f172a" stroke-width="1.3" marker-end="url(#${axisArrow})" />` +
    `<line x1="${ox}" y1="${height - pad + 8}" x2="${ox}" y2="${pad - 10}" stroke="#0f172a" stroke-width="1.3" marker-end="url(#${axisArrow})" />` +
    `<foreignObject x="${width - pad + 4}" y="${oy + 2}" width="24" height="24"><div style="font-size:12px;">$x$</div></foreignObject>` +
    `<foreignObject x="${ox - 22}" y="${pad - 18}" width="24" height="24"><div style="font-size:12px;">$y$</div></foreignObject>` +
    `<foreignObject x="${ox - 18}" y="${oy + 2}" width="20" height="20"><div style="font-size:12px;">$O$</div></foreignObject>`

  cfg.asymptotes.forEach((asym) => {
    const [lhs, rhs] = asym.split('=').map((s) => s.trim())
    if (lhs === 'x') {
      const xv = toX(parseFloat(rhs))
      svg += `<line x1="${xv}" y1="${pad}" x2="${xv}" y2="${height - pad}" stroke="#475569" stroke-width="1.1" stroke-dasharray="5,4" />`
    } else if (lhs === 'y') {
      const fAsym = compileExpr(rhs)
      const y1 = toY(fAsym(xMin))
      const y2 = toY(fAsym(xMax))
      svg += `<line x1="${toX(xMin)}" y1="${y1}" x2="${toX(xMax)}" y2="${y2}" stroke="#475569" stroke-width="1.1" stroke-dasharray="5,4" clip-path="url(#${clipId})" />`
    }
  })

  const fnList = cfg.fn.split(';').map((s) => s.trim()).filter(Boolean)
  fnList.forEach((fnStr) => {
    const f = compileExpr(fnStr)
    const steps = 320
    const dx = (xMax - xMin) / steps
    let pathD = ''
    let penDown = false
    let prevY = null

    for (let i = 0; i <= steps; i++) {
      const x = xMin + i * dx
      const y = f(x)
      if (!Number.isFinite(y) || Math.abs(y) > (yMax - yMin) * 8) {
        penDown = false
        prevY = null
        continue
      }
      if (prevY !== null && Math.abs(y - prevY) > (yMax - yMin) * 1.5) {
        penDown = false
      }
      const px = toX(x).toFixed(2)
      const py = toY(y).toFixed(2)
      pathD += `${penDown ? 'L' : 'M'} ${px} ${py} `
      penDown = true
      prevY = y
    }
    svg += `<path d="${pathD}" fill="none" stroke="#0f172a" stroke-width="1.8" clip-path="url(#${clipId})" />`
  })

  cfg.points.forEach(([xVal, yVal]) => {
    const px = toX(xVal)
    const py = toY(yVal)

    if (xVal !== 0 && yVal !== 0) {
      svg += `<line x1="${px}" y1="${py}" x2="${px}" y2="${oy}" stroke="#475569" stroke-width="1" stroke-dasharray="3.5,3.5" />`
      svg += `<line x1="${px}" y1="${py}" x2="${ox}" y2="${py}" stroke="#475569" stroke-width="1" stroke-dasharray="3.5,3.5" />`
    }
    svg += `<circle cx="${px}" cy="${py}" r="2.6" fill="#0f172a" />`

    if (xVal !== 0) {
      const labelY = yVal >= 0 ? oy + 2 : oy - 22
      svg += `<foreignObject x="${px - 16}" y="${labelY}" width="32" height="22"><div style="display:flex;justify-content:center;font-size:12px;">$${xVal}$</div></foreignObject>`
    }
    if (yVal !== 0) {
      const labelX = xVal >= 0 ? ox - 28 : ox + 4
      svg += `<foreignObject x="${labelX}" y="${py - 11}" width="26" height="22"><div style="display:flex;justify-content:center;font-size:12px;">$${yVal}$</div></foreignObject>`
    }
  })

  svg += `</svg></div>`
  return svg
}

/* ==========================================================================
 * 3. HÌNH HỌC KHÔNG GIAN (GEO3D)
 * ========================================================================== */
const GEO3D_PRESETS = {
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
}

function renderGeo3D(code) {
  let presetKey = 'chop_tu_giac_sa_vuong'
  const customPoints = []
  let solidEdges = []
  let dashedEdges = []
  let rightAngles = []

  String(code || '').split('\n').forEach((line) => {
    const sep = line.indexOf(':')
    if (sep === -1) return
    const key = line.slice(0, sep).trim().toLowerCase()
    const val = line.slice(sep + 1).trim()

    if (key === 'preset') presetKey = val.toLowerCase()
    else if (key === 'points') customPoints.push(...val.split(',').map((s) => s.trim()).filter(Boolean))
    else if (key === 'solid') solidEdges = val.split(',').map((s) => s.trim()).filter(Boolean)
    else if (key === 'dashed') dashedEdges = val.split(',').map((s) => s.trim()).filter(Boolean)
    else if (key === 'right_angle') {
      const matches = [...val.matchAll(/\(\s*([^,]+)\s*,\s*([^,]+)\s*,\s*([^)]+)\s*\)/g)]
      rightAngles = matches.map((m) => [m[1].trim(), m[2].trim(), m[3].trim()])
    }
  })

  const pts = JSON.parse(JSON.stringify(GEO3D_PRESETS[presetKey] || GEO3D_PRESETS.chop_tu_giac_sa_vuong))

  customPoints.forEach((def) => {
    const [name, expr] = def.split('=').map((s) => s.trim())
    if (!name || !expr) return

    const midMatch = expr.match(/^mid\(\s*([^,]+)\s*,\s*([^)]+)\s*\)$/i)
    const centMatch = expr.match(/^centroid\(\s*([^,]+)\s*,\s*([^,]+)\s*,\s*([^)]+)\s*\)$/i)
    const projMatch = expr.match(/^proj\(\s*([^,]+)\s*,\s*([^,]+)\s*,\s*([^)]+)\s*\)$/i)
    const ratioMatch = expr.match(/^ratio\(\s*([^,]+)\s*,\s*([^,]+)\s*,\s*([^)]+)\s*\)$/i)

    if (midMatch && pts[midMatch[1]] && pts[midMatch[2]]) {
      const p1 = pts[midMatch[1]]
      const p2 = pts[midMatch[2]]
      pts[name] = [(p1[0] + p2[0]) / 2, (p1[1] + p2[1]) / 2]
    } else if (centMatch && pts[centMatch[1]] && pts[centMatch[2]] && pts[centMatch[3]]) {
      const p1 = pts[centMatch[1]]
      const p2 = pts[centMatch[2]]
      const p3 = pts[centMatch[3]]
      pts[name] = [(p1[0] + p2[0] + p3[0]) / 3, (p1[1] + p2[1] + p3[1]) / 3]
    } else if (projMatch && pts[projMatch[2]] && pts[projMatch[3]]) {
      const pStart = pts[projMatch[2]]
      const pEnd = pts[projMatch[3]]
      pts[name] = [pStart[0] + 0.42 * (pEnd[0] - pStart[0]), pStart[1] + 0.42 * (pEnd[1] - pStart[1])]
    } else if (ratioMatch && pts[ratioMatch[1]] && pts[ratioMatch[2]]) {
      const k = parseFloat(ratioMatch[3])
      const p1 = pts[ratioMatch[1]]
      const p2 = pts[ratioMatch[2]]
      pts[name] = [p1[0] + k * (p2[0] - p1[0]), p1[1] + k * (p2[1] - p1[1])]
    }
  })

  const parseEdge = (edgeStr) => {
    const tokens = String(edgeStr).match(/[A-Z]'?/g)
    return tokens && tokens.length === 2 ? tokens : []
  }

  let svg = `<div class="diagram-wrap" style="margin:12px 0;display:flex;justify-content:center;user-select:none;">` +
    `<svg width="290" height="255" viewBox="0 0 290 255" style="background:#fff;border-radius:6px;">`

  rightAngles.forEach(([pA, pV, pB]) => {
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
    const p2 = [V[0] + (u2x / l2) * size, V[1] + (u2y / l2) * size]
    const p12 = [p1[0] + (u2x / l2) * size, p1[1] + (u2y / l2) * size]

    svg += `<polyline points="${p1[0]},${p1[1]} ${p12[0]},${p12[1]} ${p2[0]},${p2[1]}" fill="none" stroke="#334155" stroke-width="1" />`
  })

  dashedEdges.forEach((edge) => {
    const [u, v] = parseEdge(edge)
    if (pts[u] && pts[v]) {
      svg += `<line x1="${pts[u][0]}" y1="${pts[u][1]}" x2="${pts[v][0]}" y2="${pts[v][1]}" stroke="#1e293b" stroke-width="1.25" stroke-dasharray="5,4" />`
    }
  })

  solidEdges.forEach((edge) => {
    const [u, v] = parseEdge(edge)
    if (pts[u] && pts[v]) {
      svg += `<line x1="${pts[u][0]}" y1="${pts[u][1]}" x2="${pts[v][0]}" y2="${pts[v][1]}" stroke="#0f172a" stroke-width="1.45" />`
    }
  })

  Object.entries(pts).forEach(([label, [x, y]]) => {
    svg += `<circle cx="${x}" cy="${y}" r="2.2" fill="#0f172a" />`
    const offsetX = x < 90 ? -20 : (x > 190 ? 6 : -8)
    const offsetY = y < 60 ? -22 : (y > 200 ? 4 : -18)
    svg += `<foreignObject x="${x + offsetX}" y="${y + offsetY}" width="28" height="24"><div style="display:flex;align-items:center;justify-content:center;font-size:12px;font-weight:500;">$${label}$</div></foreignObject>`
  })

  svg += `</svg></div>`
  return svg
}

/* ==========================================================================
 * 4. CÔNG THỨC CẤU TẠO HÓA HỌC 2D (SMILES)
 * ========================================================================== */
function renderSmilesBlock(smilesCode, uid) {
  const svgId = `smiles-svg-${uid}`
  setTimeout(() => {
    try {
      const el = document.getElementById(svgId)
      if (el && window.SmilesDrawer) {
        const drawer = new window.SmilesDrawer.SvgDrawer({ width: 220, height: 140 })
        window.SmilesDrawer.parse(smilesCode, (tree) => {
          drawer.draw(tree, `#${svgId}`, 'light', false)
        })
      }
    } catch (e) {
      console.error('[DiagramRenderer] SmilesDrawer failed:', e)
    }
  }, 0)

  return `<span class="diagram-wrap" style="display:inline-flex;align-items:center;justify-content:center;margin:4px 8px;vertical-align:middle;">` +
    `<svg id="${svgId}" width="220" height="140" style="background:#fff;border-radius:6px;" data-smiles="${String(smilesCode || '').replace(/"/g, '&quot;')}"></svg></span>`
}
