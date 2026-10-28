// Lõi thuần (pure) cho phạm vi "Dạng bài Constant" (qb_question_types) khi tạo đề
// từ ma trận. Không truy cập DB, không phụ thuộc Deno để có thể kiểm thử độc lập.
//
// Quy ước:
// - typeIds: các Dạng bài Constant người dùng chọn (leaf của cây Khối > Lớp > Chương > Bài > Dạng bài).
// - untypedLessonIds: các Bài học KHÔNG có Dạng bài nào, được chọn nguyên bài (giữ hành vi cũ).
// - lessonIds/chapterIds/classIds: phạm vi cha do client gửi kèm. Khi có typeIds, MỌI nhánh
//   typed đều phải kèm qb_question_type_id.in.(typeIds) để không "OR" lọt các Dạng bài khác
//   trong cùng Bài/Chương/Lớp.

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

export const MAX_SCOPE_TYPE_IDS = 1000

export interface TypeIdNormalization {
  ids: string[]
  invalid: string[]
  tooMany: boolean
}

export interface TypePoolClauseInput {
  typeIds: string[]
  untypedLessonIds?: string[]
  lessonIds?: string[]
  chapterIds?: string[]
  classIds?: string[]
  // true chỉ dùng cho các item distribution: thu hẹp typeIds theo Lớp/Chương/Bài của item.
  // false (mặc định, flow cây chọn leaf): typeIds đã là tập leaf chính xác, các ID cha
  // chỉ là ngữ cảnh kiểm chứng nên không được dùng để giới hạn pool (nếu không sẽ mất
  // các Dạng bài ở Bài chỉ được chọn một phần).
  restrictToScope?: boolean
}

const uniqueStrings = (values: unknown[] | undefined | null): string[] => {
  const out: string[] = []
  const seen = new Set<string>()
  for (const value of values || []) {
    if (value === null || value === undefined) continue
    const text = String(value).trim()
    if (!text || seen.has(text)) continue
    seen.add(text)
    out.push(text)
  }
  return out
}

// Sinh danh sách mệnh đề PostgREST OR cho pool câu hỏi.
// - Không có typeIds -> trả [] để buildPoolQuery giữ nguyên hành vi cũ.
// - Có typeIds -> mọi nhánh typed đều bị khóa bởi qb_question_type_id.in.(typeIds),
//   nhánh untyped chỉ dành cho Bài không có Dạng bài.
export function buildTypePoolClauses(input: TypePoolClauseInput): string[] {
  const typeIds = uniqueStrings(input.typeIds)
  if (typeIds.length === 0) return []

  const typeClause = `qb_question_type_id.in.(${typeIds.join(',')})`
  const lessonIds = uniqueStrings(input.lessonIds)
  const chapterIds = uniqueStrings(input.chapterIds)
  const classIds = uniqueStrings(input.classIds)
  const untypedLessonIds = uniqueStrings(input.untypedLessonIds)

  const clauses: string[] = []
  if (input.restrictToScope === true) {
    if (lessonIds.length > 0) clauses.push(`and(${typeClause},qb_lesson_id.in.(${lessonIds.join(',')}))`)
    if (chapterIds.length > 0) clauses.push(`and(${typeClause},qb_chapter_id.in.(${chapterIds.join(',')}))`)
    if (classIds.length > 0) clauses.push(`and(${typeClause},qb_class_id.in.(${classIds.join(',')}))`)
  }
  if (clauses.length === 0) clauses.push(typeClause)

  if (untypedLessonIds.length > 0) {
    clauses.push(`qb_lesson_id.in.(${untypedLessonIds.join(',')})`)
  }

  return clauses
}

// Nhận mảng hoặc chuỗi phân tách bằng dấu phẩy (GET query param lẫn POST body).
// Trả riêng các ID sai định dạng UUID để caller trả 400 thay vì âm thầm bỏ qua.
export function normalizeTypeIdList(input: unknown): TypeIdNormalization {
  let raw: unknown[] = []
  if (Array.isArray(input)) {
    raw = input
  } else if (typeof input === 'string' && input.trim()) {
    raw = input.split(',')
  }

  const ids: string[] = []
  const invalid: string[] = []
  const seen = new Set<string>()

  for (const value of raw) {
    if (value === null || value === undefined) continue
    const text = String(value).trim()
    if (!text) continue
    if (!UUID_RE.test(text)) {
      invalid.push(text)
      continue
    }
    const id = text.toLowerCase()
    if (!seen.has(id)) {
      seen.add(id)
      ids.push(id)
    }
  }

  const tooMany = ids.length > MAX_SCOPE_TYPE_IDS
  return {
    ids: tooMany ? ids.slice(0, MAX_SCOPE_TYPE_IDS) : ids,
    invalid,
    tooMany
  }
}

// Tách Lesson ID đã chọn thành: Bài có Dạng bài (typed) và Bài không có Dạng bài (untyped).
// Backend dùng tập typedLessonIds để giới hạn nhánh typed, và untypedLessonIds để giữ
// hành vi cũ "chọn nguyên bài không có Dạng bài".
export function splitLessonIdsByTypePresence(
  lessonIds: string[] | undefined | null,
  typedLessonIds: string[] | undefined | null
): { typedLessonIds: string[]; untypedLessonIds: string[] } {
  const typedSet = new Set(uniqueStrings(typedLessonIds))
  const typed: string[] = []
  const untyped: string[] = []
  for (const id of uniqueStrings(lessonIds)) {
    if (typedSet.has(id)) typed.push(id)
    else untyped.push(id)
  }
  return { typedLessonIds: typed, untypedLessonIds: untyped }
}
