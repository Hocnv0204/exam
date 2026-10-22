/**
 * fence.js — Quét các khối hình (code fence) trong văn bản Markdown.
 *
 * Dùng chung cho:
 *  - renderMarkdown (che khu vực hình trước khi xử lý $...$)
 *  - parseExamMarkdown (biết chính xác khối hình nằm ở đâu: đề / phương án / lời giải)
 *  - kiểm tra lỗi: fence chưa đóng.
 */

export const DIAGRAM_FENCE_TYPES = ['bbt', 'graph', 'geo3d', 'smiles']

const FENCE_OPEN = /^```\s*(bbt|graph|geo3d|smiles)\s*$/i
const FENCE_CLOSE = /^```\s*$/

/**
 * Quét toàn bộ văn bản, trả về danh sách khối hình.
 * @param {string} text
 * @returns {{blocks:Array, unclosed:Array}}
 *   block: { type, code, startLine, endLine, closed, startOffset, endOffset }
 *   (startLine/endLine là số thứ tự dòng, 1-based)
 */
export function scanDiagramFences(text) {
  const src = String(text == null ? '' : text).replace(/\r\n/g, '\n')
  const lines = src.split('\n')
  const blocks = []
  let current = null

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]
    const trimmed = line.trim()
    if (!current) {
      const m = trimmed.match(FENCE_OPEN)
      if (m) {
        current = {
          type: m[1].toLowerCase(),
          codeLines: [],
          startLine: i + 1,
          endLine: i + 1,
          closed: false
        }
      }
      continue
    }
    if (FENCE_CLOSE.test(trimmed)) {
      current.closed = true
      current.endLine = i + 1
      current.code = current.codeLines.join('\n')
      blocks.push(current)
      current = null
      continue
    }
    current.codeLines.push(line)
  }

  if (current) {
    current.code = current.codeLines.join('\n')
    current.endLine = lines.length
    blocks.push(current)
  }

  const unclosed = blocks.filter(b => !b.closed)
  return { blocks, unclosed }
}

/**
 * Tìm các thẻ inline [SMILES: ...]
 */
export function scanInlineSmiles(text) {
  const out = []
  const re = /\[SMILES:\s*([^\]]+)\]/gi
  let m
  const src = String(text == null ? '' : text)
  while ((m = re.exec(src)) !== null) {
    const line = src.slice(0, m.index).split('\n').length
    out.push({ code: (m[1] || '').trim(), line })
  }
  return out
}

/**
 * Tất cả khối hình (kể cả inline smiles) — dùng để kiểm tra lỗi khi lưu đề.
 */
export function collectDiagramBlocks(text) {
  const { blocks, unclosed } = scanDiagramFences(text)
  const all = blocks.map(b => ({
    type: b.type,
    code: b.code,
    startLine: b.startLine,
    endLine: b.endLine,
    closed: b.closed
  }))
  const inline = scanInlineSmiles(text).map(s => ({
    type: 'smiles',
    code: s.code,
    startLine: s.line,
    endLine: s.line,
    closed: true
  }))
  return { blocks: all.concat(inline), unclosed }
}
