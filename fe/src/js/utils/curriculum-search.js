/**
 * Curriculum Search & Navigation Utilities
 * Tối ưu tìm kiếm bài học toàn lớp/khóa học cho Admin và Học sinh.
 * Hỗ trợ tiếng Việt không dấu, regex highlight an toàn XSS,
 * gom nhóm theo chương, debounce và chống race-condition (stale responses).
 */

export function escapeHtml(unsafe) {
  if (unsafe === undefined || unsafe === null) return ''
  return String(unsafe)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;')
}

/**
 * Chuẩn hóa chuỗi tiếng Việt: bỏ dấu thanh, chuyển đ/Đ thành d/D, lowercase, trim.
 */
export function normalizeSearchText(str) {
  if (!str) return ''
  return String(str)
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[đ]/g, 'd')
    .replace(/[Đ]/g, 'D')
    .toLowerCase()
    .trim()
}

const VIETNAMESE_ACCENT_PATTERNS = {
  a: '[aáàảãạăắằẳẵặâấầẩẫậAÁÀẢÃẠĂẮẰẲẴẶÂẤẦẨẪẬ]',
  e: '[eéèẻẽẹêếềểễệEÉÈẺẼẸÊẾỀỂỄỆ]',
  i: '[iíìỉĩịIÍÌỈĨỊ]',
  o: '[oóòỏõọôốồổỗộơớờởỡợOÓÒỎÕỌÔỐỒỔỖỘƠỚỜỞỠỢ]',
  u: '[uúùủũụưứừửữựUÚÙỦŨỤƯỨỪỬỮỰ]',
  y: '[yýỳỷỹỵYÝỲỶỸỴ]',
  d: '[dđDĐ]'
}

/**
 * Xây dựng biểu thức chính quy nhận diện từ khóa tiếng Việt không dấu lẫn có dấu.
 */
export function buildVietnameseRegex(query, flags = 'i') {
  const norm = normalizeSearchText(query)
  if (!norm) return null

  let pattern = ''
  for (let i = 0; i < norm.length; i++) {
    const ch = norm[i]
    if (VIETNAMESE_ACCENT_PATTERNS[ch]) {
      pattern += VIETNAMESE_ACCENT_PATTERNS[ch]
    } else if (/\s/.test(ch)) {
      pattern += '\\s+'
    } else {
      pattern += ch.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
    }
  }

  try {
    return new RegExp(`(${pattern})`, flags)
  } catch (_) {
    return null
  }
}

/**
 * Highlight từ khóa trong văn bản an toàn XSS.
 * Giữ nguyên chữ hoa/thường và dấu gốc của văn bản, bao bọc bởi <mark class="curriculum-search-mark">.
 */
export function highlightMatch(text, query) {
  if (!text) return ''
  const str = String(text)
  if (!query || !query.trim()) return escapeHtml(str)

  const splitRegex = buildVietnameseRegex(query, 'gi')
  if (!splitRegex) return escapeHtml(str)

  const parts = str.split(splitRegex)
  if (parts.length <= 1) return escapeHtml(str)

  const testRegex = buildVietnameseRegex(query, 'i')

  return parts.map(part => {
    if (!part) return ''
    if (testRegex && testRegex.test(part)) {
      return `<mark class="curriculum-search-mark">${escapeHtml(part)}</mark>`
    }
    return escapeHtml(part)
  }).join('')
}

/**
 * Lọc danh sách bài học theo từ khóa (tìm theo title, content, code/stt, chapterTitle).
 */
export function filterLessons(lessons, query) {
  if (!Array.isArray(lessons)) return []
  if (!query || !query.trim()) return lessons.slice()

  const normQuery = normalizeSearchText(query)
  if (!normQuery) return lessons.slice()

  return lessons.filter(l => {
    const title = normalizeSearchText(l.title || '')
    const content = normalizeSearchText(l.content || '')
    const code = normalizeSearchText(String(l.code || l.orderIndex || l.order_index || ''))
    const chapterTitle = normalizeSearchText(l.chapterTitle || l.chapter_title || '')

    return title.includes(normQuery) ||
      content.includes(normQuery) ||
      code.includes(normQuery) ||
      chapterTitle.includes(normQuery)
  })
}

/**
 * Gom nhóm danh sách bài học theo Chương học.
 * Giữ đúng thứ tự chương học (orderIndex) và thứ tự bài học bên trong.
 */
export function groupLessonsByChapter(lessons) {
  if (!Array.isArray(lessons)) return []

  const groupMap = new Map()

  for (const l of lessons) {
    const chId = l.chapterId || l.chapter_id || 'unknown'
    const chTitle = l.chapterTitle || l.chapter_title || 'Chương chưa phân loại'
    const chOrder = Number(l.chapterOrderIndex ?? l.chapter_order_index ?? 999)

    if (!groupMap.has(chId)) {
      groupMap.set(chId, {
        chapterId: chId,
        chapterTitle: chTitle,
        chapterOrderIndex: isNaN(chOrder) ? 999 : chOrder,
        lessons: []
      })
    }
    groupMap.get(chId).lessons.push(l)
  }

  const grouped = Array.from(groupMap.values())
  grouped.sort((a, b) => a.chapterOrderIndex - b.chapterOrderIndex)

  for (const g of grouped) {
    g.lessons.sort((a, b) => {
      const ordA = Number(a.orderIndex ?? a.order_index ?? 0)
      const ordB = Number(b.orderIndex ?? b.order_index ?? 0)
      return ordA - ordB
    })
  }

  return grouped
}

/**
 * Controller quản lý debounce, AbortController và requestId để chống race condition.
 */
export function createSearchController({ onSearch, debounceMs = 250 }) {
  let timer = null
  let currentController = null
  let currentRequestId = 0

  function abort() {
    if (timer) {
      clearTimeout(timer)
      timer = null
    }
    if (currentController) {
      currentController.abort()
      currentController = null
    }
  }

  function search(query) {
    abort()
    const requestId = ++currentRequestId
    currentController = new AbortController()
    const signal = currentController.signal

    timer = setTimeout(async () => {
      try {
        await onSearch(query, {
          signal,
          requestId,
          isCurrent: () => requestId === currentRequestId
        })
      } catch (err) {
        if (err?.name === 'AbortError') return
        console.warn('[CurriculumSearch] Search error:', err)
      }
    }, debounceMs)
  }

  return {
    search,
    abort,
    getCurrentRequestId: () => currentRequestId
  }
}

/**
 * Lọc và sắp xếp danh sách bài học (lesson-first) theo Chương học, từ khóa tìm kiếm và tiêu chí sort.
 */
export function filterAndSortLessons(lessons, { query = '', chapterId = 'all', sortBy = 'order' } = {}) {
  if (!Array.isArray(lessons)) return []
  let result = lessons.slice()

  // 1. Lọc theo Chương học (Chương chỉ đóng vai trò bộ lọc)
  if (chapterId && chapterId !== 'all') {
    result = result.filter(l => (l.chapterId || l.chapter_id) === chapterId)
  }

  // 2. Lọc theo từ khóa tìm kiếm (tùy chọn)
  if (query && query.trim()) {
    result = filterLessons(result, query)
  }

  // 3. Sắp xếp kết quả
  result.sort((a, b) => {
    if (sortBy === 'title-asc') {
      const titleA = String(a.title || '').trim().toLowerCase()
      const titleB = String(b.title || '').trim().toLowerCase()
      return titleA.localeCompare(titleB, 'vi')
    }
    if (sortBy === 'newest') {
      const dateA = a.createdAt || a.created_at ? new Date(a.createdAt || a.created_at).getTime() : 0
      const dateB = b.createdAt || b.created_at ? new Date(b.createdAt || b.created_at).getTime() : 0
      return dateB - dateA
    }
    // Default: 'order' (theo thứ tự chương, sau đó đến thứ tự bài học)
    const chOrderA = Number(a.chapterOrderIndex ?? a.chapter_order_index ?? 0)
    const chOrderB = Number(b.chapterOrderIndex ?? b.chapter_order_index ?? 0)
    if (chOrderA !== chOrderB) return chOrderA - chOrderB

    const ordA = Number(a.orderIndex ?? a.order_index ?? 0)
    const ordB = Number(b.orderIndex ?? b.order_index ?? 0)
    return ordA - ordB
  })

  return result
}

