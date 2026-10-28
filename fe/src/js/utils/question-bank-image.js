/**
 * Helper chen ảnh dán (Ctrl+V) vào đúng khối Markdown của một câu hỏi trong
 * modal Ngân hàng câu hỏi > Nhập từ Markdown.
 *
 * Grammar ảnh dùng chung với parser (`exam-parser.js`):
 *   [Ảnh: <data:image/... | https://... | blob:...>]
 * Nhờ vậy sau khi parse lại, ảnh nằm ở `imageUrl` của đúng câu và còn nguyên
 * khi lưu vào ngân hàng / mở lại.
 *
 * File thuần JS, không phụ thuộc DOM để có thể test standalone.
 */

// Mirror parser: định nghĩa ảnh reference `[id]: <url>` bị loại khỏi luồng parse chính.
const IMAGE_REF_DEF_REGEX = /^\[([^\]]+)\]:\s*(data:image\/[^\s]+|https?:\/\/[^\s]+|blob:[^\s]+)\s*$/i
// Mirror parser: dòng tiêu đề câu hỏi `[Câu 1]` / `Câu 1:` / `[Bài 2]` ...
const HEADER_BRACKET_REGEX = /^\[(?:Câu|Bài)\s*(\d+)\]/i
const HEADER_PLAIN_REGEX = /^(?:Câu|Bài)\s*(\d+)/i
// Dòng thẻ ảnh mà parser hiểu là ảnh của câu hiện tại.
const QUESTION_IMAGE_TAG_REGEX = /^\s*(?:\[(?:Ảnh|Hình ảnh|Hình vẽ|Sơ đồ)(?:\s*:\s*[^\]]*)?\]|!\[[^\]]*\]\([^)]*\)|!\[\[[^\]]*\]\])\s*$/i

/**
 * Tách nguồn Markdown batch thành từng khối câu theo đúng quy tắc nhận diện header
 * của parser — dùng để sửa / chèn ảnh vào đúng 1 câu mà không đụng câu khác.
 * Trả về { lines, lineOffsets, blocks:[{startLine,endLine,start,end}], preamble }.
 */
export function splitQuestionSourceBlocks(source) {
  const src = String(source || '')
  const lines = src.split('\n')
  const lineOffsets = []
  let offset = 0
  lines.forEach((line, lineIndex) => {
    lineOffsets[lineIndex] = offset
    offset += line.length + 1
  })

  const starts = []
  lines.forEach((line, lineIndex) => {
    const trimmed = line.trim()
    if (!trimmed || IMAGE_REF_DEF_REGEX.test(trimmed)) return
    if (HEADER_BRACKET_REGEX.test(trimmed) || HEADER_PLAIN_REGEX.test(trimmed)) starts.push(lineIndex)
  })

  const blocks = starts.map((startLine, i) => {
    const endLine = i + 1 < starts.length ? starts[i + 1] : lines.length
    return {
      startLine,
      endLine,
      start: lineOffsets[startLine],
      end: endLine < lines.length ? lineOffsets[endLine] : src.length
    }
  })

  return {
    lines,
    lineOffsets,
    blocks,
    preamble: blocks.length ? src.slice(0, blocks[0].start) : src
  }
}

/** Có phải dòng thẻ ảnh mà parser sẽ gắn vào câu hiện tại? */
export function isQuestionImageTagLine(line) {
  return QUESTION_IMAGE_TAG_REGEX.test(String(line || ''))
}

/** Nguồn ảnh hợp lệ để đưa vào thẻ `[Ảnh: ...]` (khớp parser). */
export function isSupportedImageSource(value) {
  const src = String(value || '').trim()
  if (!src) return false
  const dataMatch = src.match(/^data:image\/[a-z0-9.+-]+(?:;[^,]*)?,/i)
  if (dataMatch) return src.slice(dataMatch[0].length).trim().length > 0
  return /^(?:https?:\/\/\S+|blob:\S+)$/i.test(src)
}

/**
 * Chuẩn hóa data URL ảnh thành 1 dòng thẻ ảnh đúng grammar parser.
 * Ném lỗi nếu ảnh rỗng/không hỗ trợ để UI hiển thị feedback thay vì chèn rác.
 */
export function buildQuestionImageTag(imageSource) {
  const src = String(imageSource || '').trim()
  if (!isSupportedImageSource(src)) {
    throw new Error('Ảnh không hợp lệ hoặc rỗng. Hãy thử dán lại ảnh.')
  }
  // Data URL không được chứa xuống dòng — nếu có thì thẻ sẽ vỡ khi parse.
  return `[Ảnh: ${src.replace(/\s+/g, '')}]`
}

/**
 * Chèn / thay thẻ ảnh trong Markdown của MỘT câu.
 * - Đã có thẻ ảnh → thay tại chỗ (tránh nhân đôi ảnh khi dán lại).
 * - Chưa có → chèn ngay sau dòng header câu, luôn nằm trong vùng đề bài
 *   (trước phương án / lời giải) nên parser gắn đúng câu hiện tại.
 * Trả về { source, tagStart, tagEnd, replaced } — offset tính trong `questionSource`.
 */
export function insertImageTagIntoQuestionSource(questionSource, imageTag) {
  const tag = String(imageTag || '').trim()
  if (!isQuestionImageTagLine(tag)) {
    throw new Error('Thẻ ảnh Markdown không hợp lệ.')
  }

  const source = String(questionSource ?? '').replace(/\r\n/g, '\n')
  const lines = source.split('\n')
  const existingIndex = lines.findIndex(line => isQuestionImageTagLine(line))

  let insertLineIndex = -1
  let replaced = false
  if (existingIndex >= 0) {
    lines[existingIndex] = tag
    insertLineIndex = existingIndex
    replaced = true
  } else {
    const headerIndex = lines.findIndex((line) => {
      const trimmed = line.trim()
      if (!trimmed || IMAGE_REF_DEF_REGEX.test(trimmed)) return false
      return HEADER_BRACKET_REGEX.test(trimmed) || HEADER_PLAIN_REGEX.test(trimmed)
    })
    insertLineIndex = headerIndex >= 0 ? headerIndex + 1 : 0
    lines.splice(insertLineIndex, 0, tag)
  }

  let lineStart = 0
  for (let i = 0; i < insertLineIndex; i++) lineStart += lines[i].length + 1

  return {
    source: lines.join('\n'),
    tagStart: lineStart,
    tagEnd: lineStart + tag.length,
    replaced
  }
}

/**
 * Tìm chỉ số câu chứa offset con trỏ trong nguồn batch.
 * Offset nằm ở preamble (trước `[Câu 1]`) → null để UI cảnh báo thay vì gắn ảnh sai câu.
 */
export function findQuestionBlockIndexAtOffset(blocks, offset) {
  const list = Array.isArray(blocks) ? blocks : []
  const pos = Number(offset)
  if (!Number.isFinite(pos) || list.length === 0) return null
  for (let i = 0; i < list.length; i++) {
    const block = list[i]
    if (!block) continue
    if (pos >= block.start && pos < block.end) return i
  }
  // Con trỏ ở cuối file (ngay sau câu cuối) vẫn thuộc câu cuối.
  const last = list[list.length - 1]
  if (last && pos === last.end) return list.length - 1
  return null
}

/**
 * Chèn thẻ ảnh vào đúng câu `questionIndex` của nguồn batch.
 * Trả về null nếu không xác định được khối câu.
 */
export function insertImageTagIntoSource(source, questionIndex, imageTag) {
  const src = String(source || '').replace(/\r\n/g, '\n')
  const split = splitQuestionSourceBlocks(src)
  const block = split.blocks[questionIndex]
  if (!block) return null

  const blockSource = src.slice(block.start, block.end)
  const result = insertImageTagIntoQuestionSource(blockSource, imageTag)
  return {
    source: src.slice(0, block.start) + result.source + src.slice(block.end),
    blockStart: block.start,
    tagStart: block.start + result.tagStart,
    tagEnd: block.start + result.tagEnd,
    replaced: result.replaced
  }
}

/**
 * Gỡ toàn bộ thẻ ảnh khỏi Markdown của một câu (dùng cho nút "Xóa ảnh").
 * Trả về { source, removed } hoặc null nếu không xác định được khối câu.
 */
export function removeImageTagsFromSource(source, questionIndex) {
  const src = String(source || '').replace(/\r\n/g, '\n')
  const split = splitQuestionSourceBlocks(src)
  const block = split.blocks[questionIndex]
  if (!block) return null

  const blockLines = src.slice(block.start, block.end).split('\n')
  const kept = blockLines.filter(line => !isQuestionImageTagLine(line))
  const removed = kept.length !== blockLines.length
  if (!removed) return { source: src, removed: false }

  const nextSource = src.slice(0, block.start) + kept.join('\n') + src.slice(block.end)
  return { source: nextSource, removed: true }
}
