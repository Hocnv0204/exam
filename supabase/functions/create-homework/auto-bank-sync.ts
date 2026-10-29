/**
 * Đồng bộ câu hỏi từ bài tập Markdown interactive sang Ngân hàng câu hỏi Constant.
 *
 * Nguyên tắc nghiệp vụ:
 * - Chỉ đồng bộ câu hỏi có source = MARKDOWN_INTERACTIVE (không tự động áp dụng cho PDF manual
 *   hoặc caller cũ chưa gửi source).
 * - Target Constant lấy theo phân cấp bài học động của bài tập: Khối/Lớp -> Chương -> Bài.
 *   Mọi cấp phải khớp DUY NHẤT sau chuẩn hóa; không tự tạo taxonomy, không đoán khi mơ hồ.
 * - Dạng bài: dùng metadata [DẠNG BÀI] nếu khớp duy nhất trong bài học Constant; nếu không
 *   khớp/mơ hồ thì dùng Dạng bài "Khác" có sẵn. Không bao giờ tạo Dạng bài mới.
 * - Chống trùng bằng content_hash trong phạm vi (qb_lesson_id, content_hash) — đúng unique
 *   index uq_qb_constant_lesson_hash. Câu cùng nội dung ở bài Constant khác vẫn được lưu.
 * - Hàm này KHÔNG được làm hỏng việc lưu bài tập: mọi lỗi đồng bộ đều trả về summary
 *   created/skipped/unsynced/failed để caller báo cho Admin, không throw ra ngoài.
 */

export type SyncQuestionInput = {
  questionNumber?: number
  questionType: string
  prompt?: unknown
  content?: string | null
  options?: unknown
  statements?: unknown
  partTitle?: string | null
  points?: number | null
  difficulty?: string | null
  explanation?: string | null
  mcAnswer?: string | null
  tfAnswers?: unknown
  saAnswer?: unknown
  saTolerance?: number | null
  imageUrl?: string | null
  classTag?: string | null
  gradeTag?: string | null
  subjectTag?: string | null
  chapterTag?: string | null
  lessonTag?: string | null
  questionTypeTag?: string | null
  source?: string | null
}

export type DynamicLessonHierarchy = {
  id?: string | null
  chapter_id?: string | null
  title?: string | null
  chapters?: {
    id?: string | null
    title?: string | null
    class_id?: string | null
    classes?: {
      id?: string | null
      name?: string | null
      grade_block?: string | null
    } | null
  } | null
}

export type ConstantClassRow = { id: string; name: string; grade_block: string }
export type ConstantChapterRow = { id: string; class_id: string; title: string }
export type ConstantLessonRow = { id: string; chapter_id: string; title: string }
export type ConstantQuestionTypeRow = { id: string; lesson_id: string; name: string }

export type ConstantTaxonomy = {
  classes: ConstantClassRow[]
  chapters: ConstantChapterRow[]
  lessons: ConstantLessonRow[]
  questionTypes: ConstantQuestionTypeRow[]
}

export type ConstantTarget = {
  classId: string
  chapterId: string
  lessonId: string
  gradeBlock: string
  className: string
  chapterTitle: string
  lessonTitle: string
}

export type QuestionBankSyncAdapter = {
  loadClasses: () => Promise<ConstantClassRow[]>
  loadChapters: (classId: string) => Promise<ConstantChapterRow[]>
  loadLessons: (chapterId: string) => Promise<ConstantLessonRow[]>
  loadQuestionTypes: (lessonId: string) => Promise<ConstantQuestionTypeRow[]>
  loadExistingHashes: (
    lessonId: string,
    hashes: string[]
  ) => Promise<Array<{ qb_lesson_id?: string | null; content_hash?: string | null }>>
  insertRows: (rows: Record<string, unknown>[]) => Promise<{
    error?: { message?: string; code?: string } | null
  }>
}

export type AutoBankSyncSummary = {
  enabled: boolean
  source: 'MARKDOWN_INTERACTIVE' | null
  totalQuestions: number
  createdCount: number
  skippedDuplicateCount: number
  unsyncedCount: number
  failedCount: number
  fallbackTypeCount: number
  reasons: Array<{ questionNumber: number | null; reason: string }>
  target: {
    classId: string
    chapterId: string
    lessonId: string
    gradeBlock: string
    className: string
    chapterTitle: string
    lessonTitle: string
  } | null
}

const VALID_DIFFICULTIES = ['NHAN_BIET', 'THONG_HIEU', 'VAN_DUNG', 'VAN_DUNG_CAO']

const ROMAN_MAP: Record<string, number> = {
  i: 1,
  ii: 2,
  iii: 3,
  iv: 4,
  v: 5,
  vi: 6,
  vii: 7,
  viii: 8,
  ix: 9,
  x: 10,
  xi: 11,
  xii: 12,
  xiii: 13,
  xiv: 14,
  xv: 15,
  xvi: 16,
  xvii: 17,
  xviii: 18,
  xix: 19,
  xx: 20,
}

/** Chuẩn hóa văn bản tiếng Việt: bỏ dấu, lowercase, gộp khoảng trắng, bỏ dấu câu phân cách. */
export function normalizeTaxonomyText(value: unknown): string {
  return String(value ?? '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/đ/g, 'd')
    .replace(/Đ/g, 'D')
    .toLowerCase()
    .replace(/[–—−]/g, '-')
    .replace(/[:.]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

/** Nhận diện môn Toán/Hóa theo từ độc lập; trả null nếu không rõ hoặc mơ hồ. */
export function normalizeSubject(value: unknown): 'Toán' | 'Hóa' | null {
  const norm = normalizeTaxonomyText(value)
  if (!norm) return null
  const words = new Set(norm.split(/[^a-z0-9]+/).filter(Boolean))
  const hasToan = words.has('toan') || words.has('math')
  const hasHoa = words.has('hoa') || words.has('chem') || words.has('chemistry')
  if (hasToan && !hasHoa) return 'Toán'
  if (hasHoa && !hasToan) return 'Hóa'
  return null
}

export function extractGradeLevel(value: unknown): number | null {
  const match = String(value ?? '').match(/\b(10|11|12)\b/)
  return match ? parseInt(match[1], 10) : null
}

/**
 * Canonical hóa Khối/Lớp về dạng "<grade>-<subject>" để so khớp các cách ghi
 * "12-Toán", "Toán 12", "Lớp 12 - Toán" mà không đoán môn.
 */
export function canonicalGradeBlock(value: unknown): string | null {
  const grade = extractGradeLevel(value)
  const subject = normalizeSubject(value)
  if (!grade || !subject) return null
  return `${grade}-${normalizeTaxonomyText(subject)}`
}

function romanOrNumberToInt(raw: string): number | null {
  if (/^\d+$/.test(raw)) return parseInt(raw, 10)
  return ROMAN_MAP[raw] || null
}

/**
 * Canonical hóa tiêu đề Chương/Bài: đưa số La Mã về Ả Rập, bỏ dấu câu,
 * để "Chương I: Đạo hàm" khớp "Chương 1. Đạo hàm".
 */
export function canonicalTitleKey(value: unknown): string {
  const norm = normalizeTaxonomyText(value)
  if (!norm) return ''
  return norm.replace(/\b(chuong|bai)\s+([ivxlcdm]+|\d+)\b/g, (whole, prefix, raw) => {
    const num = romanOrNumberToInt(String(raw))
    return num === null ? whole : `${prefix} ${num}`
  })
}

function coreTitleKey(value: unknown): string {
  return canonicalTitleKey(value)
    .replace(/^(chuong|bai)\s+\d+\s*/, '')
    .trim()
}

function titleNumbersConflict(left: unknown, right: unknown): boolean {
  const leftNumber = extractChapterOrLessonNumber(left)
  const rightNumber = extractChapterOrLessonNumber(right)
  return leftNumber !== null && rightNumber !== null && leftNumber !== rightNumber
}

/** Lấy số thứ tự Chương/Bài từ tag hoặc tiêu đề, kể cả dạng chỉ ghi số/La Mã. */
function extractChapterOrLessonNumber(value: unknown): number | null {
  const key = canonicalTitleKey(value)
  const prefixed = key.match(/^(?:chuong|bai)\s+(\d+)\b/)
  if (prefixed) return parseInt(prefixed[1], 10)
  const solo = key.match(/^([ivxlcdm]+|\d+)\b/)
  if (!solo) return null
  return romanOrNumberToInt(solo[1])
}

/**
 * So tag Chương/Bài với tiêu đề Constant đích bằng canonical hóa (không dùng
 * includes/chuỗi con). Cho phép tag chỉ ghi số ("Bài 1", "Chương I") khi số khớp.
 */
function titleTagMatchesTarget(tag: unknown, targetTitle: unknown): boolean {
  const tagKey = canonicalTitleKey(tag)
  if (!tagKey) return true
  const targetKey = canonicalTitleKey(targetTitle)
  if (!targetKey) return false
  if (tagKey === targetKey) return true

  const tagCore = coreTitleKey(tag)
  const targetCore = coreTitleKey(targetTitle)
  if (tagCore && targetCore && tagCore === targetCore && !titleNumbersConflict(tag, targetTitle)) return true

  // Một bên chỉ có "Chương N"/"Bài N": so số thứ tự thay vì so chuỗi con.
  const tagNumber = extractChapterOrLessonNumber(tag)
  const targetNumber = extractChapterOrLessonNumber(targetTitle)
  if (!tagCore && tagNumber !== null && targetNumber !== null) return tagNumber === targetNumber
  return false
}

/**
 * Kiểm tra metadata cấp câu có xung đột với đích Constant đã resolve duy nhất.
 * Trả null nếu không có tag hoặc tag khớp; trả lý do tiếng Việt nếu xung đột.
 * Không dùng so khớp chuỗi con yếu để tránh "Chương 1" khớp nhầm "Chương 10".
 */
export function resolveQuestionMetadataConflict(
  question: SyncQuestionInput,
  target: ConstantTarget,
  classes: ConstantClassRow[] = []
): string | null {
  // Hỗ trợ cả tag top-level lẫn tag nằm trong prompt.metadata (dữ liệu Markdown cũ).
  const promptMetadata = asObject(parsePromptObject(question).metadata) || {}
  const classTag = question.classTag || promptMetadata.classTag || null
  const gradeTag = question.gradeTag || promptMetadata.gradeTag || null
  const subjectTag = question.subjectTag || promptMetadata.subjectTag || null
  const chapterTag = question.chapterTag || promptMetadata.chapterTag || null
  const lessonTag = question.lessonTag || promptMetadata.lessonTag || null

  const targetBlockKey = canonicalGradeBlock(target.gradeBlock)
  const targetGrade =
    extractGradeLevel(target.gradeBlock) ?? extractGradeLevel(target.className)
  const targetSubject =
    normalizeSubject(target.gradeBlock) || normalizeSubject(target.className)

  for (const [label, tag] of [
    ['Lớp', classTag],
    ['Khối', gradeTag],
  ] as const) {
    const raw = String(tag ?? '').trim()
    if (!raw) continue

    // Tag trùng đúng tên/khối của một Lớp Constant KHÁC target -> xung đột rõ ràng.
    // Chỉ so khớp chuẩn hóa chính xác, không dùng chuỗi con.
    if (classes.length > 0) {
      const tagNorm = normalizeTaxonomyText(raw)
      const exactClasses = classes.filter((cl) => {
        const nameNorm = normalizeTaxonomyText(cl.name)
        const blockNorm = normalizeTaxonomyText(cl.grade_block)
        return (!!nameNorm && tagNorm === nameNorm) || (!!blockNorm && tagNorm === blockNorm)
      })
      if (exactClasses.length > 0 && !exactClasses.some((cl) => cl.id === target.classId)) {
        return `Metadata ${label} "${raw}" thuộc Lớp Constant "${exactClasses[0].name}" khác Lớp đích "${target.className}"`
      }
    }

    const tagBlockKey = canonicalGradeBlock(raw)
    if (tagBlockKey && targetBlockKey && tagBlockKey !== targetBlockKey) {
      return `Metadata ${label} "${raw}" (${tagBlockKey}) không khớp Khối/Lớp Constant đích "${target.gradeBlock || target.className}" (${targetBlockKey})`
    }
    const tagGrade = extractGradeLevel(raw)
    if (tagGrade !== null && targetGrade !== null && tagGrade !== targetGrade) {
      return `Metadata ${label} "${raw}" (lớp ${tagGrade}) không khớp Khối Constant đích "${target.gradeBlock || target.className}" (lớp ${targetGrade})`
    }
    const tagSubject = normalizeSubject(raw)
    if (tagSubject && targetSubject && tagSubject !== targetSubject) {
      return `Metadata ${label} "${raw}" (môn ${tagSubject}) không khớp môn Constant đích "${targetSubject}"`
    }
  }

  const subjectRaw = String(subjectTag ?? '').trim()
  if (subjectRaw) {
    const tagSubject = normalizeSubject(subjectRaw)
    if (tagSubject && targetSubject && tagSubject !== targetSubject) {
      return `Metadata Môn "${subjectRaw}" (${tagSubject}) không khớp môn Constant đích "${targetSubject}"`
    }
  }

  const chapterRaw = String(chapterTag ?? '').trim()
  if (chapterRaw && !titleTagMatchesTarget(chapterRaw, target.chapterTitle)) {
    return `Metadata Chương "${chapterRaw}" không khớp Chương Constant đích "${target.chapterTitle}"`
  }

  const lessonRaw = String(lessonTag ?? '').trim()
  if (lessonRaw && !titleTagMatchesTarget(lessonRaw, target.lessonTitle)) {
    return `Metadata Bài học "${lessonRaw}" không khớp Bài học Constant đích "${target.lessonTitle}"`
  }

  return null
}

function pickUniqueBy<T>(
  rows: T[],
  predicate: (row: T) => boolean
): { row: T | null; ambiguous: boolean } {
  const matches = rows.filter(predicate)
  if (matches.length === 1) return { row: matches[0], ambiguous: false }
  return { row: null, ambiguous: matches.length > 1 }
}

function matchTitle<T extends { title?: string | null }>(
  rows: T[],
  dynamicTitle: unknown
): { row: T | null; ambiguous: boolean } {
  const key = canonicalTitleKey(dynamicTitle)
  if (!key) return { row: null, ambiguous: false }

  const exact = pickUniqueBy(rows, (row) => canonicalTitleKey(row.title) === key)
  if (exact.row || exact.ambiguous) return exact

  const core = coreTitleKey(dynamicTitle)
  if (core.length < 4) return { row: null, ambiguous: false }
  const coreExact = pickUniqueBy(rows, (row) =>
    coreTitleKey(row.title) === core && !titleNumbersConflict(dynamicTitle, row.title)
  )
  if (coreExact.row || coreExact.ambiguous) return coreExact

  // Không suy đoán từ chuỗi con: "Đạo hàm" không đương nhiên là
  // "Ứng dụng đạo hàm" dù chỉ có một bài trong danh mục.
  return { row: null, ambiguous: false }
}

/**
 * Ánh xạ Khối/Lớp của bài học động sang đúng một Lớp Constant.
 * Ưu tiên khối chuẩn hóa (12-Toán), sau đó dùng tên lớp để phá mơ hồ nếu khớp duy nhất.
 */
export function resolveConstantClassForDynamic(
  dynamicLesson: DynamicLessonHierarchy | null | undefined,
  classes: ConstantClassRow[]
): { success: boolean; targetClass: ConstantClassRow | null; error: string | null } {
  if (!dynamicLesson) {
    return { success: false, targetClass: null, error: 'Không đọc được bài học động của bài tập' }
  }

  const dynamicClass = dynamicLesson.chapters?.classes || null
  const dynamicGradeBlock = dynamicClass?.grade_block || ''
  const dynamicClassName = dynamicClass?.name || ''

  if (!dynamicGradeBlock && !dynamicClassName) {
    return {
      success: false,
      targetClass: null,
      error: 'Bài học động thiếu thông tin Khối/Lớp để đối chiếu Constant',
    }
  }

  const canonicalBlock = canonicalGradeBlock(dynamicGradeBlock)
  const classRows = (classes || []).filter(Boolean)
  let classMatches: ConstantClassRow[] = []

  if (canonicalBlock) {
    classMatches = classRows.filter((cl) => canonicalGradeBlock(cl.grade_block) === canonicalBlock)
    // Trường hợp Khối custom không tách được môn/khối: so khớp trực tiếp chuỗi đã chuẩn hóa.
    if (classMatches.length === 0) {
      const normalizedDynamicBlock = normalizeTaxonomyText(dynamicGradeBlock)
      if (normalizedDynamicBlock) {
        classMatches = classRows.filter(
          (cl) =>
            normalizeTaxonomyText(cl.grade_block) === normalizedDynamicBlock ||
            normalizeTaxonomyText(cl.name) === normalizedDynamicBlock
        )
      }
    }
  } else {
    const normalizedDynamicBlock = normalizeTaxonomyText(dynamicGradeBlock)
    if (normalizedDynamicBlock) {
      classMatches = classRows.filter(
        (cl) =>
          normalizeTaxonomyText(cl.grade_block) === normalizedDynamicBlock ||
          normalizeTaxonomyText(cl.name) === normalizedDynamicBlock
      )
    }
  }

  if (classMatches.length === 0) {
    return {
      success: false,
      targetClass: null,
      error: `Không có Lớp Constant tương ứng với khối "${dynamicGradeBlock || 'chưa xác định'}"`,
    }
  }

  if (classMatches.length === 1) {
    return { success: true, targetClass: classMatches[0], error: null }
  }

  const normalizedName = normalizeTaxonomyText(dynamicClassName)
  if (normalizedName) {
    const byName = classMatches.filter((cl) => normalizeTaxonomyText(cl.name) === normalizedName)
    if (byName.length === 1) {
      return { success: true, targetClass: byName[0], error: null }
    }
  }

  return {
    success: false,
    targetClass: null,
    error: `Nhiều Lớp Constant cùng khối "${dynamicGradeBlock}" và không xác định duy nhất theo tên lớp "${dynamicClassName}"`,
  }
}

/**
 * Ánh xạ bài học động của bài tập sang đúng một Bài học Constant.
 * Không tạo mới; trả lỗi rõ ràng nếu thiếu hoặc mơ hồ ở bất kỳ cấp nào.
 */
export function resolveConstantLessonForDynamic(
  dynamicLesson: DynamicLessonHierarchy | null | undefined,
  taxonomy: ConstantTaxonomy
): { success: boolean; target: ConstantTarget | null; error: string | null } {
  if (!dynamicLesson) {
    return { success: false, target: null, error: 'Không đọc được bài học động của bài tập' }
  }

  const dynamicChapterTitle = dynamicLesson.chapters?.title || ''
  const dynamicLessonTitle = dynamicLesson.title || ''

  if (!dynamicChapterTitle) {
    return { success: false, target: null, error: 'Bài học động thiếu tên Chương để đối chiếu Constant' }
  }
  if (!dynamicLessonTitle) {
    return { success: false, target: null, error: 'Bài học động thiếu tên Bài để đối chiếu Constant' }
  }

  const classResolution = resolveConstantClassForDynamic(dynamicLesson, taxonomy.classes || [])
  if (!classResolution.success || !classResolution.targetClass) {
    return { success: false, target: null, error: classResolution.error }
  }
  const targetClass = classResolution.targetClass

  const chapterRows = (taxonomy.chapters || []).filter((ch) => ch.class_id === targetClass.id)
  if (chapterRows.length === 0) {
    return {
      success: false,
      target: null,
      error: `Lớp Constant "${targetClass.name}" chưa có Chương nào để đối chiếu`,
    }
  }

  const chapterMatch = matchTitle(chapterRows, dynamicChapterTitle)
  if (!chapterMatch.row) {
    return {
      success: false,
      target: null,
      error: chapterMatch.ambiguous
        ? `Chương "${dynamicChapterTitle}" khớp nhiều Chương Constant trong lớp "${targetClass.name}"`
        : `Không có Chương Constant tương ứng với "${dynamicChapterTitle}" trong lớp "${targetClass.name}"`,
    }
  }
  const targetChapter = chapterMatch.row

  const lessonRows = (taxonomy.lessons || []).filter((ls) => ls.chapter_id === targetChapter.id)
  if (lessonRows.length === 0) {
    return {
      success: false,
      target: null,
      error: `Chương Constant "${targetChapter.title}" chưa có Bài học nào để đối chiếu`,
    }
  }

  const lessonMatch = matchTitle(lessonRows, dynamicLessonTitle)
  if (!lessonMatch.row) {
    return {
      success: false,
      target: null,
      error: lessonMatch.ambiguous
        ? `Bài "${dynamicLessonTitle}" khớp nhiều Bài học Constant trong chương "${targetChapter.title}"`
        : `Không có Bài học Constant tương ứng với "${dynamicLessonTitle}" trong chương "${targetChapter.title}"`,
    }
  }
  const targetLesson = lessonMatch.row

  return {
    success: true,
    target: {
      classId: targetClass.id,
      chapterId: targetChapter.id,
      lessonId: targetLesson.id,
      gradeBlock: targetClass.grade_block,
      className: targetClass.name,
      chapterTitle: targetChapter.title,
      lessonTitle: targetLesson.title,
    },
    error: null,
  }
}

/**
 * Chọn Dạng bài Constant: khớp duy nhất theo metadata thì dùng; mọi trường hợp còn lại
 * (không có tag, không khớp, mơ hồ) chỉ được fallback vào "Khác" có sẵn của chính bài.
 */
export function resolveQuestionTypeForBank(
  questionTypeTag: unknown,
  lessonId: string,
  questionTypes: ConstantQuestionTypeRow[]
): { success: boolean; type: ConstantQuestionTypeRow | null; isFallback: boolean; error: string | null } {
  const typesInLesson = (questionTypes || []).filter((t) => t.lesson_id === lessonId)
  // Chỉ dùng "Khác" khi tồn tại DUY NHẤT sau chuẩn hóa. Nhiều bản ghi "Khác" là dữ liệu
  // mơ hồ: không chọn bản đầu tiên, trả unsynced để Admin dọn dữ liệu thay vì gán sai.
  const otherTypes = typesInLesson.filter((t) => normalizeTaxonomyText(t.name) === 'khac')
  const otherType = otherTypes.length === 1 ? otherTypes[0] : null
  const tag = String(questionTypeTag ?? '').trim()

  if (tag) {
    // Hỗ trợ tag dạng path "Bài học > Dạng bài" giống FE resolver.
    const parts = tag.split('>').map((part) => part.trim()).filter(Boolean)
    const targetName = parts.length > 0 ? parts[parts.length - 1] : tag
    const normalizedTarget = normalizeTaxonomyText(targetName)
    const exact = typesInLesson.filter((t) => normalizeTaxonomyText(t.name) === normalizedTarget)
    if (exact.length === 1) {
      return { success: true, type: exact[0], isFallback: false, error: null }
    }

    // Tương thích resolver FE: chỉ nhận chuỗi con khi khớp DUY NHẤT; mơ hồ -> "Khác".
    if (normalizedTarget.length >= 3) {
      const subMatches = typesInLesson.filter((t) => {
        const typeName = normalizeTaxonomyText(t.name)
        return typeName.includes(normalizedTarget) || normalizedTarget.includes(typeName)
      })
      if (subMatches.length === 1) {
        return { success: true, type: subMatches[0], isFallback: false, error: null }
      }
    }
  }

  if (otherTypes.length > 1) {
    return {
      success: false,
      type: null,
      isFallback: false,
      error: `Bài học Constant có ${otherTypes.length} Dạng bài "Khác" trùng chuẩn hóa; không chọn ngẫu nhiên (cần dọn dữ liệu Dạng bài)`,
    }
  }

  if (otherType) {
    return { success: true, type: otherType, isFallback: true, error: null }
  }

  return {
    success: false,
    type: null,
    isFallback: false,
    error: 'Bài học Constant chưa có Dạng bài "Khác" để fallback (không tự tạo Dạng bài mới)',
  }
}

function asObject(value: unknown): Record<string, any> | null {
  if (value && typeof value === 'object' && !Array.isArray(value)) {
    return value as Record<string, any>
  }
  return null
}

function parsePromptObject(q: SyncQuestionInput): Record<string, any> {
  const raw = q.prompt
  let parsed: Record<string, any> | null = asObject(raw)
  if (!parsed && typeof raw === 'string') {
    const text = raw.trim()
    if (text.startsWith('{')) {
      try {
        parsed = asObject(JSON.parse(text))
      } catch (_) {
        parsed = null
      }
    }
    if (!parsed) parsed = { text: raw }
  }
  if (!parsed) parsed = {}

  // Bóc JSON lồng trong prompt.text (dữ liệu cũ có thể bị stringify 2 lớp).
  let unwrapCount = 0
  while (
    typeof parsed.text === 'string' &&
    parsed.text.trim().startsWith('{') &&
    unwrapCount < 3
  ) {
    try {
      const inner = asObject(JSON.parse(parsed.text))
      if (!inner || (inner.text === undefined && !inner.options && !inner.statements)) break
      parsed = {
        ...parsed,
        ...inner,
        text: inner.text !== undefined ? inner.text : parsed.text,
        options: Array.isArray(inner.options) && inner.options.length > 0 ? inner.options : parsed.options,
        statements:
          Array.isArray(inner.statements) && inner.statements.length > 0
            ? inner.statements
            : parsed.statements,
        explanation: inner.explanation || parsed.explanation || '',
        imageUrl: inner.imageUrl || parsed.imageUrl || '',
      }
      unwrapCount++
    } catch (_) {
      break
    }
  }

  return parsed
}

function asArray(value: unknown): any[] {
  return Array.isArray(value) ? value : []
}

/** Dựng prompt JSONB lưu Ngân hàng câu hỏi, giữ text/ảnh/options/TF/explanation/metadata. */
export function buildQuestionBankPrompt(q: SyncQuestionInput): Record<string, any> {
  const parsed = parsePromptObject(q)
  const questionType = String(q.questionType || '').toUpperCase()
  const promptText =
    (parsed.text !== undefined && parsed.text !== null ? String(parsed.text) : '') ||
    (q.content !== undefined && q.content !== null ? String(q.content) : '') ||
    ''

  let options =
    questionType === 'MULTIPLE_CHOICE'
      ? asArray(q.options).length > 0
        ? asArray(q.options)
        : asArray(parsed.options)
      : []
  let statements =
    questionType === 'TRUE_FALSE'
      ? asArray(q.statements).length > 0
        ? asArray(q.statements)
        : asArray(parsed.statements).length > 0
          ? asArray(parsed.statements)
          : asArray(q.options).length > 0
            ? asArray(q.options)
            : asArray(parsed.options)
      : []

  // Dữ liệu cũ đôi khi đặt options/statements lẫn nhau; chuẩn hóa theo loại câu.
  if (questionType === 'MULTIPLE_CHOICE' && options.length === 0) {
    if (asArray(q.statements).length > 0) options = asArray(q.statements)
    else if (asArray(parsed.statements).length > 0) options = asArray(parsed.statements)
  }
  if (questionType === 'TRUE_FALSE' && statements.length === 0 && options.length > 0) {
    statements = options
  }

  const difficultyRaw = String(q.difficulty || parsed.difficulty || 'THONG_HIEU').toUpperCase()
  const difficulty = VALID_DIFFICULTIES.includes(difficultyRaw) ? difficultyRaw : 'THONG_HIEU'

  const metadataSource = asObject(parsed.metadata) || {}
  const metadata = {
    classTag: q.classTag || q.gradeTag || metadataSource.classTag || null,
    gradeTag: q.gradeTag || q.classTag || metadataSource.gradeTag || null,
    subjectTag: q.subjectTag || metadataSource.subjectTag || null,
    chapterTag: q.chapterTag || metadataSource.chapterTag || null,
    lessonTag: q.lessonTag || metadataSource.lessonTag || null,
    questionTypeTag: q.questionTypeTag || metadataSource.questionTypeTag || null,
  }

  // TRUE_FALSE: KHÔNG ghi `options` (kể cả mảng rỗng). fn_compute_qb_content_hash ưu tiên
  // `options` nếu jsonb_typeof = 'array', nên `options: []` sẽ khiến hash chỉ theo stem và
  // bỏ qua toàn bộ mệnh đề. Bỏ hẳn key để DB/JS cùng hash theo statements.
  return {
    isInteractive: true,
    text: promptText,
    imageUrl: q.imageUrl || parsed.imageUrl || '',
    partTitle: q.partTitle || parsed.partTitle || '',
    ...(questionType === 'TRUE_FALSE' ? {} : { options }),
    statements,
    explanation:
      (q.explanation !== undefined && q.explanation !== null ? String(q.explanation) : '') ||
      (parsed.explanation !== undefined && parsed.explanation !== null ? String(parsed.explanation) : ''),
    difficulty,
    metadata,
  }
}

function normalizeHashText(value: unknown): string {
  return String(value ?? '')
    .trim()
    .toLowerCase()
    .replace(/\s+/g, ' ')
}

/**
 * Hash nội dung PHẢI khớp public.fn_compute_qb_content_hash trong DB:
 * question_type + text + options/statements (id + text). Không hash ảnh/lời giải/metadata.
 */
export async function computeQuestionContentHash(
  questionType: string,
  prompt: Record<string, any> | null | undefined
): Promise<string> {
  const payload = prompt || {}
  const normalizedText = normalizeHashText(payload.text)
  let optionsStr = ''

  if (Array.isArray(payload.options)) {
    for (const item of payload.options) {
      optionsStr += `|${item?.id ?? ''}:${normalizeHashText(item?.text)}`
    }
  } else if (Array.isArray(payload.statements)) {
    for (const item of payload.statements) {
      optionsStr += `|${item?.id ?? ''}:${normalizeHashText(item?.text)}`
    }
  }

  const combined = `${String(questionType || '').toUpperCase()}:::${normalizedText}:::${optionsStr}`
  const bytes = new TextEncoder().encode(combined)
  const digest = await crypto.subtle.digest('SHA-256', bytes)
  return Array.from(new Uint8Array(digest))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('')
}

function defaultPoints(questionType: string): number {
  if (questionType === 'TRUE_FALSE') return 1.0
  if (questionType === 'SHORT_ANSWER') return 0.5
  return 0.25
}

function normalizePoints(value: unknown, questionType: string): number {
  const points = Number(value)
  if (!Number.isFinite(points) || points <= 0 || points > 10) return defaultPoints(questionType)
  return points
}

function subjectFromGradeBlock(gradeBlock: string): string {
  return normalizeSubject(gradeBlock) === 'Hóa' ? 'HOA_HOC' : 'TOAN'
}

function safeOutputAnswer(questionType: string, q: SyncQuestionInput, prompt: Record<string, any>): string | null {
  if (questionType !== 'SHORT_ANSWER') return null
  if (q.saAnswer !== undefined && q.saAnswer !== null) return String(q.saAnswer)
  return prompt.saAnswer !== undefined && prompt.saAnswer !== null ? String(prompt.saAnswer) : null
}

/** Dựng một row question_bank hoàn chỉnh cho target Constant đã xác minh. */
export async function buildQuestionBankRow(
  q: SyncQuestionInput,
  target: ConstantTarget,
  dynamicLesson: DynamicLessonHierarchy,
  questionTypeId: string,
  homeworkTitle: string
): Promise<Record<string, any>> {
  const prompt = buildQuestionBankPrompt(q)
  const questionType = String(q.questionType || '').toUpperCase()
  const contentHash = await computeQuestionContentHash(questionType, prompt)
  const gradeBlock = target.gradeBlock || ''
  const points = normalizePoints(q.points, questionType)
  const difficulty = VALID_DIFFICULTIES.includes(String(prompt.difficulty || ''))
    ? prompt.difficulty
    : 'THONG_HIEU'
  const gradeSource = `${gradeBlock} ${target.className || ''}`

  const tags = Array.from(
    new Set(
      [homeworkTitle]
        .map((tag) => String(tag || '').trim().toLowerCase())
        .filter(Boolean)
    )
  ).slice(0, 20)

  return {
    subject: subjectFromGradeBlock(gradeSource),
    grade_level: extractGradeLevel(gradeSource) || 12,
    grade_block: gradeBlock,
    qb_class_id: target.classId,
    qb_chapter_id: target.chapterId,
    qb_lesson_id: target.lessonId,
    qb_question_type_id: questionTypeId,
    source_dynamic_lesson_id: dynamicLesson.id || null,
    class_id: dynamicLesson.chapters?.class_id || null,
    chapter_id: dynamicLesson.chapter_id || null,
    lesson_id: dynamicLesson.id || null,
    question_type: questionType,
    difficulty,
    prompt,
    mc_answer: questionType === 'MULTIPLE_CHOICE' ? q.mcAnswer || prompt.mcAnswer || null : null,
    tf_answers: questionType === 'TRUE_FALSE' ? q.tfAnswers || prompt.tfAnswers || null : null,
    sa_answer: safeOutputAnswer(questionType, q, prompt),
    sa_tolerance:
      questionType === 'SHORT_ANSWER' ? Number(q.saTolerance ?? prompt.saTolerance ?? 0) || 0 : 0,
    points,
    tags,
    usage_count: 1,
    content_hash: contentHash,
  }
}

function isDuplicateError(error: { message?: string; code?: string } | null | undefined): boolean {
  if (!error) return false
  if (String(error.code || '') === '23505') return true
  return /duplicate key|unique constraint|uq_qb_constant_lesson_hash/i.test(String(error.message || ''))
}

function emptySummary(enabled: boolean): AutoBankSyncSummary {
  return {
    enabled,
    source: enabled ? 'MARKDOWN_INTERACTIVE' : null,
    totalQuestions: 0,
    createdCount: 0,
    skippedDuplicateCount: 0,
    unsyncedCount: 0,
    failedCount: 0,
    fallbackTypeCount: 0,
    reasons: [],
    target: null,
  }
}

/** Adapter production bọc Supabase service-role client (không query ở phía FE). */
export function createSupabaseQuestionBankSyncAdapter(client: any): QuestionBankSyncAdapter {
  const unwrap = (result: { data?: any; error?: any }, label: string): any => {
    if (result?.error) {
      throw new Error(`${label}: ${result.error.message || 'Unknown database error'}`)
    }
    return result?.data || []
  }

  return {
    async loadClasses() {
      const result = await client.from('qb_classes').select('id, name, grade_block')
      return unwrap(result, 'Không đọc được danh mục Lớp Constant')
    },
    async loadChapters(classId: string) {
      const result = await client
        .from('qb_chapters')
        .select('id, class_id, title')
        .eq('class_id', classId)
      return unwrap(result, 'Không đọc được danh mục Chương Constant')
    },
    async loadLessons(chapterId: string) {
      const result = await client
        .from('qb_lessons')
        .select('id, chapter_id, title')
        .eq('chapter_id', chapterId)
      return unwrap(result, 'Không đọc được danh mục Bài học Constant')
    },
    async loadQuestionTypes(lessonId: string) {
      const result = await client
        .from('qb_question_types')
        .select('id, lesson_id, name')
        .eq('lesson_id', lessonId)
      return unwrap(result, 'Không đọc được danh mục Dạng bài Constant')
    },
    async loadExistingHashes(lessonId: string, hashes: string[]) {
      if (hashes.length === 0) return []
      const result = await client
        .from('question_bank')
        .select('qb_lesson_id, content_hash')
        .eq('qb_lesson_id', lessonId)
        .in('content_hash', hashes)
      return unwrap(result, 'Không kiểm tra được câu hỏi trùng trong Ngân hàng câu hỏi')
    },
    async insertRows(rows: Record<string, unknown>[]) {
      const result = await client.from('question_bank').insert(rows).select('id')
      return { error: result?.error || null }
    },
  }
}

/**
 * Đồng bộ danh sách câu hỏi sang Ngân hàng câu hỏi Constant.
 * Luôn resolve summary thay vì throw; caller giữ nguyên kết quả lưu bài tập.
 */
export async function syncHomeworkQuestionsToConstantBank(
  adapter: QuestionBankSyncAdapter,
  input: {
    questions: SyncQuestionInput[]
    dynamicLesson: DynamicLessonHierarchy | null | undefined
    homeworkTitle?: string | null
  }
): Promise<AutoBankSyncSummary> {
  const allQuestions = Array.isArray(input.questions) ? input.questions : []
  const questions = allQuestions.filter((q) => q && q.source === 'MARKDOWN_INTERACTIVE')
  if (questions.length === 0) {
    return emptySummary(false)
  }

  const summary = emptySummary(true)
  summary.totalQuestions = questions.length

  const failAll = (reason: string) => {
    summary.unsyncedCount = questions.length
    summary.reasons.push({ questionNumber: null, reason })
    return summary
  }

  try {
    const dynamic = input.dynamicLesson || null
    const classes = await adapter.loadClasses()
    const classResolution = resolveConstantClassForDynamic(dynamic, classes)
    if (!classResolution.success || !classResolution.targetClass) {
      return failAll(classResolution.error || 'Không xác định được Lớp Constant duy nhất')
    }
    const targetClass = classResolution.targetClass

    const chapters = await adapter.loadChapters(targetClass.id)
    if (chapters.length === 0) {
      return failAll('Lớp Constant tương ứng chưa có Chương nào')
    }

    const chapterMatch = matchTitle(chapters, dynamic?.chapters?.title)
    if (!chapterMatch.row) {
      return failAll(
        chapterMatch.ambiguous
          ? `Chương "${dynamic?.chapters?.title || ''}" khớp nhiều Chương Constant trong lớp "${targetClass.name}"`
          : `Không có Chương Constant tương ứng với "${dynamic?.chapters?.title || ''}" trong lớp "${targetClass.name}"`
      )
    }
    const targetChapter = chapterMatch.row

    const lessons = await adapter.loadLessons(targetChapter.id)
    if (lessons.length === 0) {
      return failAll(`Chương Constant "${targetChapter.title}" chưa có Bài học nào`)
    }

    const lessonMatch = matchTitle(lessons, dynamic?.title)
    if (!lessonMatch.row) {
      return failAll(
        lessonMatch.ambiguous
          ? `Bài "${dynamic?.title || ''}" khớp nhiều Bài học Constant trong chương "${targetChapter.title}"`
          : `Không có Bài học Constant tương ứng với "${dynamic?.title || ''}" trong chương "${targetChapter.title}"`
      )
    }
    const targetLesson = lessonMatch.row
    const target: ConstantTarget = {
      classId: targetClass.id,
      chapterId: targetChapter.id,
      lessonId: targetLesson.id,
      gradeBlock: targetClass.grade_block,
      className: targetClass.name,
      chapterTitle: targetChapter.title,
      lessonTitle: targetLesson.title,
    }
    summary.target = {
      classId: target.classId,
      chapterId: target.chapterId,
      lessonId: target.lessonId,
      gradeBlock: target.gradeBlock,
      className: target.className,
      chapterTitle: target.chapterTitle,
      lessonTitle: target.lessonTitle,
    }

    const questionTypes = await adapter.loadQuestionTypes(target.lessonId)
    const preparedRows: Array<{ questionNumber: number | null; row: Record<string, any> }> = []
    const seenInBatch = new Set<string>()

    for (let index = 0; index < questions.length; index++) {
      const question = questions[index]
      const questionNumber =
        typeof question.questionNumber === 'number' ? question.questionNumber : index + 1

      // Metadata cấp câu (nếu có) phải khớp đích Constant đã resolve duy nhất.
      // Một câu lệch Chương/Bài/Khối không được ghi nhầm sang bài tập hiện tại.
      const metadataConflict = resolveQuestionMetadataConflict(question, target, classes)
      if (metadataConflict) {
        summary.unsyncedCount++
        summary.reasons.push({ questionNumber, reason: metadataConflict })
        continue
      }

      const typeResolution = resolveQuestionTypeForBank(
        question.questionTypeTag,
        target.lessonId,
        questionTypes
      )
      if (!typeResolution.success || !typeResolution.type) {
        summary.unsyncedCount++
        summary.reasons.push({
          questionNumber,
          reason: typeResolution.error || 'Không xác định được Dạng bài Constant',
        })
        continue
      }

      if (typeResolution.isFallback) summary.fallbackTypeCount++

      const row = await buildQuestionBankRow(
        question,
        target,
        dynamic as DynamicLessonHierarchy,
        typeResolution.type.id,
        String(input.homeworkTitle || '')
      )
      const hash = String(row.content_hash || '')
      const dedupKey = `${target.lessonId}|${hash}`
      if (seenInBatch.has(dedupKey)) {
        summary.skippedDuplicateCount++
        continue
      }
      seenInBatch.add(dedupKey)
      preparedRows.push({ questionNumber, row })
    }

    if (preparedRows.length === 0) {
      return summary
    }

    // Kiểm tra trùng trong DB theo đúng phạm vi (qb_lesson_id, content_hash).
    const hashes = Array.from(new Set(preparedRows.map((item) => String(item.row.content_hash))))
    const existingPairs = new Set<string>()
    const CHUNK_SIZE = 100
    for (let offset = 0; offset < hashes.length; offset += CHUNK_SIZE) {
      const chunk = hashes.slice(offset, offset + CHUNK_SIZE)
      const existing = await adapter.loadExistingHashes(target.lessonId, chunk)
      for (const row of existing) {
        if (row.content_hash) {
          existingPairs.add(`${row.qb_lesson_id || target.lessonId}|${row.content_hash}`)
        }
      }
    }

    const rowsToInsert = preparedRows.filter((item) => {
      const key = `${target.lessonId}|${item.row.content_hash}`
      if (existingPairs.has(key)) {
        summary.skippedDuplicateCount++
        return false
      }
      return true
    })

    if (rowsToInsert.length === 0) {
      return summary
    }

    const bulkResult = await adapter.insertRows(rowsToInsert.map((item) => item.row))
    if (!bulkResult.error) {
      summary.createdCount += rowsToInsert.length
      return summary
    }

    // Bulk insert có thể thất bại do race với request khác (unique 23505). Thử từng row
    // để phân loại chính xác: row trùng -> skipped, row lỗi thật -> failed + reason.
    // Không retry vô hạn; mỗi row chỉ thử đúng một lần sau bulk.
    for (const item of rowsToInsert) {
      const singleResult = await adapter.insertRows([item.row])
      if (!singleResult.error) {
        summary.createdCount++
      } else if (isDuplicateError(singleResult.error)) {
        summary.skippedDuplicateCount++
      } else {
        summary.failedCount++
        if (summary.reasons.length < 20) {
          summary.reasons.push({
            questionNumber: item.questionNumber,
            reason: `Lỗi ghi Ngân hàng câu hỏi: ${singleResult.error.message || 'Unknown error'}`,
          })
        }
      }
    }

    return summary
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    const attempted = summary.createdCount + summary.skippedDuplicateCount + summary.unsyncedCount + summary.failedCount
    const remaining = Math.max(0, summary.totalQuestions - attempted)
    if (remaining > 0) summary.failedCount += remaining
    if (summary.reasons.length < 20) {
      summary.reasons.push({ questionNumber: null, reason: `Không đồng bộ được Ngân hàng câu hỏi: ${message}` })
    }
    return summary
  }
}
