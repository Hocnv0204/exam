/**
 * TikZ to SVG Converter
 * Chuyển đổi mã TikZ hình học 2D thông dụng (góc lượng giác, đường tròn lượng giác, trục tọa độ, cung tròn, vector)
 * sang SVG chuẩn hiển thị trực tiếp trên trình duyệt.
 */

const COLOR_MAP = {
  minionblue: '#1A5276',
  minionred: '#E74C3C',
  miniondark: '#2C3E50',
  miniongreen: '#27AE60',
  minionyellow: '#FCE029',
  miniongray: '#BDC3C7',
  minionlightyellow: '#FEF9E7',
  black: '#0f172a',
  blue: '#2563eb',
  red: '#dc2626',
  green: '#16a34a',
  gray: '#64748b',
  white: '#ffffff'
}

function resolveColor(name, defaultColor = '#0f172a') {
  if (!name) return defaultColor
  const clean = name.toLowerCase().split('!')[0].trim()
  return COLOR_MAP[clean] || name
}

function parseAngleRadius(str) {
  const parts = str.split(':')
  if (parts.length === 2) {
    const angleDeg = parseFloat(parts[0])
    const r = parseFloat(parts[1])
    const rad = (angleDeg * Math.PI) / 180
    return {
      x: r * Math.cos(rad),
      y: r * Math.sin(rad)
    }
  }
  return null
}

function parsePoint(ptStr, coordinates) {
  const clean = ptStr.replace(/[()]/g, '').trim()
  if (coordinates[clean]) {
    return { ...coordinates[clean] }
  }
  if (clean.includes(':')) {
    const polar = parseAngleRadius(clean)
    if (polar) return polar
  }
  const parts = clean.split(',').map(s => parseFloat(s.trim()))
  if (parts.length === 2 && !isNaN(parts[0]) && !isNaN(parts[1])) {
    return { x: parts[0], y: parts[1] }
  }
  return null
}

function extractBraceContent(str, startIndex = 0) {
  const braceStart = str.indexOf('{', startIndex)
  if (braceStart === -1) return null
  let depth = 1
  let i = braceStart + 1
  while (i < str.length && depth > 0) {
    if (str[i] === '\\') { i += 2; continue }
    if (str[i] === '{') depth++
    else if (str[i] === '}') depth--
    if (depth === 0) {
      return {
        content: str.substring(braceStart + 1, i),
        endIndex: i
      }
    }
    i++
  }
  return null
}

export function convertTikzToSvg(tikzCode) {
  try {
    const coordinates = {}
    const elements = []

    // Parse options from \begin{tikzpicture}[...]
    const scaleMatch = tikzCode.match(/\\begin\{tikzpicture\}(?:\[([^\]]*)\])?/)
    let tikzScale = 1
    if (scaleMatch && scaleMatch[1]) {
      const sM = scaleMatch[1].match(/scale\s*=\s*([0-9.]+)/)
      if (sM) tikzScale = parseFloat(sM[1]) || 1
    }

    // Split statements ending in ';'
    // Remove comments
    const cleanedCode = tikzCode
      .replace(/\\begin\{tikzpicture\}(?:\[[^\]]*\])?/g, '')
      .replace(/\\end\{tikzpicture\}/g, '')
      .replace(/%[^\n]*/g, '')

    const statements = cleanedCode
      .split(';')
      .map(s => s.trim())
      .filter(s => s.length > 0)

    for (const stmt of statements) {
      // 1. \coordinate (Name) at (x,y);
      const coordMatch = stmt.match(/\\coordinate\s*\(([^)]+)\)\s*at\s*\(([^)]+)\)/)
      if (coordMatch) {
        const name = coordMatch[1].trim()
        const pt = parsePoint(coordMatch[2], coordinates)
        if (pt) coordinates[name] = pt
        continue
      }

      // 2. \node[...] at (x,y) {Text}; or \node at (x,y) {Text};
      if (stmt.startsWith('\\node')) {
        const optMatch = stmt.match(/\\node\s*(?:\[([^\]]*)\])?/)
        const optStr = optMatch && optMatch[1] ? optMatch[1] : ''
        const atMatch = stmt.match(/at\s*\(([^)]+)\)/)
        const ptStr = atMatch ? atMatch[1] : '(0,0)'
        const brace = extractBraceContent(stmt)
        const text = brace ? brace.content.trim() : ''
        const pt = parsePoint(ptStr, coordinates)
        if (pt && text) {
          elements.push({
            type: 'text',
            x: pt.x,
            y: pt.y,
            text,
            options: optStr
          })
        }
        continue
      }

      // 3. \fill[...] ...
      if (stmt.startsWith('\\fill')) {
        const fillOptMatch = stmt.match(/\\fill(?:\[([^\]]*)\])?/)
        const fillOpts = fillOptMatch ? fillOptMatch[1] : ''
        const fillColMatch = fillOpts ? fillOpts.match(/([a-zA-Z]+(?:![0-9]+)?)/) : null
        const fillColor = fillColMatch ? resolveColor(fillColMatch[1], '#16a34a') : '#16a34a'
        const opacityMatch = fillOpts ? fillOpts.match(/opacity\s*=\s*([0-9.]+)/) : null
        const opacity = opacityMatch ? parseFloat(opacityMatch[1]) : 1

        // Check if it's a point fill: \fill (1,0) circle (1.2pt) node[...]{$A$};
        const ptFillMatch = stmt.match(/\\fill(?:\[[^\]]*\])?\s*\(([^)]+)\)\s*circle\s*\(([^)]+)\)/)
        if (ptFillMatch) {
          const pt = parsePoint(ptFillMatch[1], coordinates)
          const radiusStr = ptFillMatch[2]
          const radius = radiusStr.includes('pt') ? parseFloat(radiusStr) * 0.04 : parseFloat(radiusStr)

          let nodeOpt = ''
          let nodeText = ''
          const nodeIdx = stmt.indexOf('node')
          if (nodeIdx !== -1) {
            const optMatch = stmt.substring(nodeIdx).match(/node\s*(?:\[([^\]]*)\])?/)
            if (optMatch && optMatch[1]) nodeOpt = optMatch[1]
            const brace = extractBraceContent(stmt, nodeIdx)
            if (brace) nodeText = brace.content.trim()
          }

          if (pt) {
            elements.push({
              type: 'circle',
              cx: pt.x,
              cy: pt.y,
              r: radius || 0.05,
              fill: fillColor,
              stroke: 'none'
            })
            if (nodeText) {
              elements.push({
                type: 'text',
                x: pt.x,
                y: pt.y,
                text: nodeText,
                options: nodeOpt
              })
            }
          }
          continue
        }

        // Check if it's a sector fill: \fill[...] (0,0) -- (0:0.4) arc (0:60:0.4) -- cycle;
        const sectorMatch = stmt.match(/\\fill(?:\[[^\]]*\])?\s*\(([^)]+)\)\s*--\s*\(([^)]+)\)\s*arc\s*\(([^:]+):([^:]+):([^)]+)\)\s*--\s*cycle/)
        if (sectorMatch) {
          const center = parsePoint(sectorMatch[1], coordinates) || { x: 0, y: 0 }
          const startAngle = parseFloat(sectorMatch[3])
          const endAngle = parseFloat(sectorMatch[4])
          const r = parseFloat(sectorMatch[5])

          elements.push({
            type: 'sector',
            cx: center.x,
            cy: center.y,
            r,
            startAngle,
            endAngle,
            fill: fillColor,
            opacity
          })
          continue
        }
      }

      // 4. \draw[...] ...
      if (stmt.startsWith('\\draw')) {
        const drawOptMatch = stmt.match(/\\draw(?:\[([^\]]*)\])?/)
        const drawOpts = drawOptMatch ? (drawOptMatch[1] || '') : ''
        const hasArrow = drawOpts.includes('->') || drawOpts.includes('stealth')

        let strokeColor = '#0f172a'
        for (const cKey of Object.keys(COLOR_MAP)) {
          if (drawOpts.toLowerCase().includes(cKey)) {
            strokeColor = COLOR_MAP[cKey]
            break
          }
        }

        let lineWidth = 1.2
        if (drawOpts.includes('line width=0.8pt')) lineWidth = 1
        else if (drawOpts.includes('line width=1pt')) lineWidth = 1.4
        else if (drawOpts.includes('line width=1.2pt')) lineWidth = 1.8
        else if (drawOpts.includes('line width=1.5pt')) lineWidth = 2.2

        // Circle draw: \draw (0,0) circle (1);
        const circleDrawMatch = stmt.match(/\\draw(?:\[[^\]]*\])?\s*\(([^)]+)\)\s*circle\s*\(([^)]+)\)/)
        if (circleDrawMatch) {
          const pt = parsePoint(circleDrawMatch[1], coordinates)
          const r = parseFloat(circleDrawMatch[2])
          if (pt && !isNaN(r)) {
            elements.push({
              type: 'circle',
              cx: pt.x,
              cy: pt.y,
              r,
              fill: 'none',
              stroke: strokeColor,
              strokeWidth: lineWidth
            })
          }
          continue
        }

        // Arc draw: \draw[...] (1.2,0) arc (0:50:1.2);
        const arcDrawMatch = stmt.match(/\\draw(?:\[[^\]]*\])?\s*\(([^)]+)\)\s*arc\s*\(([^:]+):([^:]+):([^)]+)\)/)
        if (arcDrawMatch) {
          const startPt = parsePoint(arcDrawMatch[1], coordinates)
          const startAngle = parseFloat(arcDrawMatch[2])
          const endAngle = parseFloat(arcDrawMatch[3])
          const r = parseFloat(arcDrawMatch[4])

          if (startPt) {
            elements.push({
              type: 'arc',
              startX: startPt.x,
              startY: startPt.y,
              startAngle,
              endAngle,
              r,
              stroke: strokeColor,
              strokeWidth: lineWidth
            })
          }
          continue
        }

        // Line / Segment / Axis draw: \draw[->] (p1) -- (p2) node[...]{...};
        const lineMatch = stmt.match(/\\draw(?:\[[^\]]*\])?\s*\(([^)]+)\)\s*--\s*\(([^)]+)\)/)
        if (lineMatch) {
          const p1 = parsePoint(lineMatch[1], coordinates)
          const p2 = parsePoint(lineMatch[2], coordinates)

          let nodeOpt = ''
          let nodeText = ''
          const nodeIdx = stmt.indexOf('node')
          if (nodeIdx !== -1) {
            const optMatch = stmt.substring(nodeIdx).match(/node\s*(?:\[([^\]]*)\])?/)
            if (optMatch && optMatch[1]) nodeOpt = optMatch[1]
            const brace = extractBraceContent(stmt, nodeIdx)
            if (brace) nodeText = brace.content.trim()
          }

          if (p1 && p2) {
            elements.push({
              type: 'line',
              x1: p1.x,
              y1: p1.y,
              x2: p2.x,
              y2: p2.y,
              stroke: strokeColor,
              strokeWidth: lineWidth,
              hasArrow
            })

            if (nodeText) {
              elements.push({
                type: 'text',
                x: p2.x,
                y: p2.y,
                text: nodeText,
                options: nodeOpt
              })
            }
          }
          continue
        }
      }
    }

    if (elements.length === 0) return null

    // Compute bounding box in TikZ coordinates
    let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity
    for (const el of elements) {
      if (el.type === 'line') {
        minX = Math.min(minX, el.x1, el.x2)
        maxX = Math.max(maxX, el.x1, el.x2)
        minY = Math.min(minY, el.y1, el.y2)
        maxY = Math.max(maxY, el.y1, el.y2)
      } else if (el.type === 'circle') {
        minX = Math.min(minX, el.cx - el.r)
        maxX = Math.max(maxX, el.cx + el.r)
        minY = Math.min(minY, el.cy - el.r)
        maxY = Math.max(maxY, el.cy + el.r)
      } else if (el.type === 'arc') {
        const rad1 = (el.startAngle * Math.PI) / 180
        const rad2 = (el.endAngle * Math.PI) / 180
        const cx = el.startX - el.r * Math.cos(rad1)
        const cy = el.startY - el.r * Math.sin(rad1)
        const endX = cx + el.r * Math.cos(rad2)
        const endY = cy + el.r * Math.sin(rad2)
        minX = Math.min(minX, el.startX, endX, cx - el.r)
        maxX = Math.max(maxX, el.startX, endX, cx + el.r)
        minY = Math.min(minY, el.startY, endY, cy - el.r)
        maxY = Math.max(maxY, el.startY, endY, cy + el.r)
      } else if (el.type === 'text' || el.type === 'sector') {
        const px = el.x !== undefined ? el.x : el.cx
        const py = el.y !== undefined ? el.y : el.cy
        minX = Math.min(minX, px - 0.5)
        maxX = Math.max(maxX, px + 0.5)
        minY = Math.min(minY, py - 0.5)
        maxY = Math.max(maxY, py + 0.5)
      }
    }

    if (!isFinite(minX)) {
      minX = -2; maxX = 2; minY = -2; maxY = 2;
    }

    // Add margin
    const margin = 0.4
    minX -= margin
    maxX += margin
    minY -= margin
    maxY += margin

    const tikzWidth = maxX - minX
    const tikzHeight = maxY - minY

    // Target pixel scale
    const basePixelsPerUnit = 70 * tikzScale
    const svgWidth = Math.round(tikzWidth * basePixelsPerUnit)
    const svgHeight = Math.round(tikzHeight * basePixelsPerUnit)

    // Transformation function: TikZ (X right, Y UP) -> SVG (X right, Y DOWN)
    const toSvgX = (x) => ((x - minX) * basePixelsPerUnit).toFixed(1)
    const toSvgY = (y) => ((maxY - y) * basePixelsPerUnit).toFixed(1)
    const toSvgR = (r) => (r * basePixelsPerUnit).toFixed(1)

    let svgContent = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${svgWidth} ${svgHeight}" width="${svgWidth}" height="${svgHeight}" class="tikz-rendered-svg" style="display:block; margin:14px auto; background:#ffffff; border-radius:10px; box-shadow:0 1px 4px rgba(0,0,0,0.05); font-family:var(--font-sans, -apple-system, sans-serif);">`
    
    // Markers (Arrowheads)
    svgContent += `
      <defs>
        <marker id="tikz-arrow" viewBox="0 0 10 10" refX="7" refY="5" markerWidth="6" markerHeight="6" orient="auto-start-reverse">
          <path d="M 0 1.5 L 8 5 L 0 8.5 z" fill="#1A5276" />
        </marker>
        <marker id="tikz-arrow-default" viewBox="0 0 10 10" refX="7" refY="5" markerWidth="6" markerHeight="6" orient="auto-start-reverse">
          <path d="M 0 1.5 L 8 5 L 0 8.5 z" fill="#0f172a" />
        </marker>
      </defs>
    `

    for (const el of elements) {
      if (el.type === 'sector') {
        const cx = parseFloat(toSvgX(el.cx))
        const cy = parseFloat(toSvgY(el.cy))
        const r = parseFloat(toSvgR(el.r))
        const rad1 = (el.startAngle * Math.PI) / 180
        const rad2 = (el.endAngle * Math.PI) / 180
        const x1 = cx + r * Math.cos(rad1)
        const y1 = cy - r * Math.sin(rad1)
        const x2 = cx + r * Math.cos(rad2)
        const y2 = cy - r * Math.sin(rad2)
        const largeArc = Math.abs(el.endAngle - el.startAngle) > 180 ? 1 : 0
        const sweep = el.endAngle > el.startAngle ? 0 : 1

        svgContent += `<path d="M ${cx} ${cy} L ${x1.toFixed(1)} ${y1.toFixed(1)} A ${r} ${r} 0 ${largeArc} ${sweep} ${x2.toFixed(1)} ${y2.toFixed(1)} Z" fill="${el.fill}" fill-opacity="${el.opacity || 0.4}" />`
      } else if (el.type === 'circle') {
        svgContent += `<circle cx="${toSvgX(el.cx)}" cy="${toSvgY(el.cy)}" r="${toSvgR(el.r)}" fill="${el.fill}" stroke="${el.stroke}" stroke-width="${el.strokeWidth || 1}" />`
      } else if (el.type === 'arc') {
        const rad1 = (el.startAngle * Math.PI) / 180
        const rad2 = (el.endAngle * Math.PI) / 180
        const cx = el.startX - el.r * Math.cos(rad1)
        const cy = el.startY - el.r * Math.sin(rad1)
        const endX = cx + el.r * Math.cos(rad2)
        const endY = cy + el.r * Math.sin(rad2)

        const sx0 = toSvgX(el.startX)
        const sy0 = toSvgY(el.startY)
        const sx1 = toSvgX(endX)
        const sy1 = toSvgY(endY)
        const r = toSvgR(el.r)
        const largeArc = Math.abs(el.endAngle - el.startAngle) > 180 ? 1 : 0
        const sweep = el.endAngle > el.startAngle ? 0 : 1

        svgContent += `<path d="M ${sx0} ${sy0} A ${r} ${r} 0 ${largeArc} ${sweep} ${sx1} ${sy1}" fill="none" stroke="${el.stroke}" stroke-width="${el.strokeWidth}" />`
      } else if (el.type === 'line') {
        const marker = el.hasArrow ? (el.stroke === COLOR_MAP.minionblue ? 'url(#tikz-arrow)' : 'url(#tikz-arrow-default)') : 'none'
        svgContent += `<line x1="${toSvgX(el.x1)}" y1="${toSvgY(el.y1)}" x2="${toSvgX(el.x2)}" y2="${toSvgY(el.y2)}" stroke="${el.stroke}" stroke-width="${el.strokeWidth}" marker-end="${marker}" />`
      } else if (el.type === 'text') {
        let dx = 0, dy = 0
        let textAnchor = 'middle'
        const opt = el.options.toLowerCase()
        if (opt.includes('below left')) { dx = -8; dy = 16; textAnchor = 'end' }
        else if (opt.includes('below right')) { dx = 8; dy = 16; textAnchor = 'start' }
        else if (opt.includes('above left')) { dx = -8; dy = -10; textAnchor = 'end' }
        else if (opt.includes('above right')) { dx = 8; dy = -10; textAnchor = 'start' }
        else if (opt.includes('above')) { dy = -10; textAnchor = 'middle' }
        else if (opt.includes('below')) { dy = 16; textAnchor = 'middle' }
        else if (opt.includes('left')) { dx = -10; dy = 4; textAnchor = 'end' }
        else if (opt.includes('right')) { dx = 10; dy = 4; textAnchor = 'start' }
        else { dy = 4; textAnchor = 'middle' }

        // Clean math symbols for SVG text display
        let cleanText = el.text
          .replace(/\\mathbf\{([^}]+)\}/g, '$1')
          .replace(/\\textbf\{([^}]+)\}/g, '$1')
          .replace(/\\text\{([^}]+)\}/g, '$1')
          .replace(/\\dfrac\{([^}]+)\}\{([^}]+)\}/g, '$1/$2')
          .replace(/\\frac\{([^}]+)\}\{([^}]+)\}/g, '$1/$2')
          .replace(/\\pi/g, 'π')
          .replace(/\^\\circ/g, '°')
          .replace(/\^\{?\\circ\}?/g, '°')
          .replace(/\\circ/g, '°')
          .replace(/\^/g, '')
          .replace(/\$/g, '')
          .replace(/[{}]/g, '')
          .trim()

        svgContent += `<text x="${parseFloat(toSvgX(el.x)) + dx}" y="${parseFloat(toSvgY(el.y)) + dy}" text-anchor="${textAnchor}" font-size="14" font-weight="600" fill="#1e293b">${cleanText}</text>`
      }
    }

    svgContent += `</svg>`
    return svgContent
  } catch (err) {
    console.warn('[TikZ2SVG] Failed to convert TikZ:', err)
    return null
  }
}
