/**
 * Đồng bộ câu hỏi từ bài tập Markdown interactive sang Ngân hàng câu hỏi.
 *
 * Nguyên tắc nghiệp vụ:
 * - Chỉ đồng bộ câu hỏi có source = MARKDOWN_INTERACTIVE (không tự động áp dụng cho PDF manual
 *   hoặc caller cũ chưa gửi source).
 * - Metadata phân loại của TỪNG câu là nguồn taxonomy ưu tiên; một batch có thể trộn nhiều
 *   Khối/Môn/Chương/Bài. Câu khớp DUY NHẤT Constant thì lưu Constant (Khối/Lớp -> Bài).
 * - Câu không có Constant tương ứng được lưu row động (qb_* NULL) theo Khối/Môn đã xác minh;
 *   raw Chương/Bài/Dạng bài vẫn giữ trong prompt.metadata. Không tự tạo taxonomy, không đoán
 *   khi mơ hồ, không gán nhầm Khối hoặc bài học.
 * - Dạng bài Constant: dùng metadata [DẠNG BÀI] nếu khớp duy nhất trong bài học Constant;
 *   nếu không khớp/mơ hồ thì dùng Dạng bài "Khác" có sẵn. Không bao giờ tạo Dạng bài mới.
 * - Chống trùng Constant theo (qb_lesson_id, content_hash); chống trùng row động theo
 *   (grade_block, content_hash) với qb_lesson_id IS NULL (đúng các partial unique index).
 * - summary.target chỉ có giá trị khi các câu đã chuẩn bị dùng đúng MỘT Constant target;
 *   batch trộn nhiều target trả null để UI không hiển thị sai một bài học duy nhất.
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
  /** Chống trùng cho câu fallback động: đúng phạm vi (grade_block, content_hash) với qb_lesson_id NULL. */
  loadExistingDynamicHashes: (
    gradeBlock: string,
    hashes: string[]
  ) => Promise<
    Array<{
      grade_block?: string | null
      qb_lesson_id?: string | null
      content_hash?: string | null
    }>
  >
  insertRows: (rows: Record<string, unknown>[]) => Promise<{
    error?: { message?: string; code?: string } | null
  }>
}

export type QuestionTaxonomyTags = {
  classTag: string | null
  gradeTag: string | null
  subjectTag: string | null
  chapterTag: string | null
  lessonTag: string | null
  questionTypeTag: string | null
}

export type QuestionClassification =
  | { success: true; grade: number; subject: 'Toán' | 'Hóa'; gradeBlock: string }
  | { success: false; kind: 'missing' | 'contradictory'; error: string }

export type DynamicFallbackIds = {
  classId: string | null
  chapterId: string | null
  lessonId: string | null
  sourceDynamicLessonId: string | null
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
  const {
    classTag,
    gradeTag,
    subjectTag,
    chapterTag,
    lessonTag,
  } = extractQuestionTaxonomyTags(question)

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

function firstNonEmptyTag(...values: unknown[]): string | null {
  for (const value of values) {
    if (value === undefined || value === null) continue
    const text = String(value).trim()
    if (text) return text
  }
  return null
}

/**
 * Metadata phân loại của TỪNG câu là nguồn taxonomy ưu tiên. Hỗ trợ cả field top-level
 * lẫn prompt.metadata (dữ liệu Markdown cũ bị stringify/lồng nhau), đặc biệt questionTypeTag.
 */
export function extractQuestionTaxonomyTags(q: SyncQuestionInput): QuestionTaxonomyTags {
  const promptMetadata = asObject(parsePromptObject(q).metadata) || {}
  return {
    classTag: firstNonEmptyTag(q.classTag, promptMetadata.classTag),
    gradeTag: firstNonEmptyTag(q.gradeTag, promptMetadata.gradeTag),
    subjectTag: firstNonEmptyTag(q.subjectTag, promptMetadata.subjectTag),
    chapterTag: firstNonEmptyTag(q.chapterTag, promptMetadata.chapterTag),
    lessonTag: firstNonEmptyTag(q.lessonTag, promptMetadata.lessonTag),
    questionTypeTag: firstNonEmptyTag(q.questionTypeTag, promptMetadata.questionTypeTag),
  }
}

function hasBothSubjectsInText(value: unknown): boolean {
  const words = new Set(normalizeTaxonomyText(value).split(/[^a-z0-9]+/).filter(Boolean))
  const hasToan = words.has('toan') || words.has('math')
  const hasHoa = words.has('hoa') || words.has('chem') || words.has('chemistry')
  return hasToan && hasHoa
}

/** Khối hiển thị chuẩn, thống nhất "Toán-11" và "11-Toán" về "11-Toán". */
export function formatCanonicalGradeBlock(grade: number, subject: 'Toán' | 'Hóa'): string {
  return `${grade}-${subject}`
}

/** Biến thể thứ tự Khối/Môn ngược ("Toán-11") để truy vấn dữ liệu cũ đã lưu trước khi chuẩn hóa. */
function alternateGradeBlockOrder(gradeBlock: string): string | null {
  const grade = extractGradeLevel(gradeBlock)
  const subject = normalizeSubject(gradeBlock)
  if (!grade || !subject) return null
  const canonical = formatCanonicalGradeBlock(grade, subject)
  const alternate = gradeBlock === canonical ? `${subject}-${grade}` : canonical
  return alternate === gradeBlock ? null : alternate
}

/**
 * Chuẩn hóa + kiểm tra mâu thuẫn metadata cấp câu. Thiếu Lớp/Môn phải fail closed,
 * tuyệt đối không fallback Khối 12 hay môn Toán.
 */
export function classifyQuestionTaxonomy(tags: QuestionTaxonomyTags): QuestionClassification {
  const identityTags = [tags.classTag, tags.gradeTag, tags.subjectTag].filter(
    (value): value is string => !!value
  )

  for (const raw of identityTags) {
    if (hasBothSubjectsInText(raw)) {
      return {
        success: false,
        kind: 'contradictory',
        error: `Metadata phân loại "${raw}" mơ hồ: vừa có Toán vừa có Hóa`,
      }
    }
  }

  const gradeCandidates = [tags.classTag, tags.gradeTag]
    .map((value) => extractGradeLevel(value))
    .filter((value): value is number => value !== null)
  const distinctGrades = Array.from(new Set(gradeCandidates))
  if (distinctGrades.length > 1) {
    return {
      success: false,
      kind: 'contradictory',
      error: `Metadata Lớp/Khối mâu thuẫn: ${distinctGrades.join(' và ')}`,
    }
  }

  const subjectCandidates = [tags.classTag, tags.gradeTag, tags.subjectTag]
    .map((value) => normalizeSubject(value))
    .filter((value): value is 'Toán' | 'Hóa' => value !== null)
  const distinctSubjects = Array.from(new Set(subjectCandidates))
  if (distinctSubjects.length > 1) {
    return {
      success: false,
      kind: 'contradictory',
      error: `Metadata Môn mâu thuẫn: ${distinctSubjects.join(' và ')}`,
    }
  }

  const grade = distinctGrades[0] ?? null
  const subject = distinctSubjects[0] ?? null
  if (grade === null && subject === null) {
    return {
      success: false,
      kind: 'missing',
      error: 'Câu hỏi thiếu metadata [LỚP] và [MÔN] để xác định Khối/Lớp Ngân hàng',
    }
  }
  if (grade === null) {
    return {
      success: false,
      kind: 'missing',
      error: `Có môn "${subject}" nhưng thiếu metadata [LỚP] (ví dụ: [LỚP: 11])`,
    }
  }
  if (subject === null) {
    return {
      success: false,
      kind: 'missing',
      error: `Có lớp "${grade}" nhưng thiếu metadata [MÔN] (ví dụ: [MÔN: Toán] hoặc [MÔN: Hóa])`,
    }
  }

  return {
    success: true,
    grade,
    subject,
    gradeBlock: formatCanonicalGradeBlock(grade, subject),
  }
}

/**
 * Tìm đúng một Lớp Constant theo Khối/Môn đã xác minh. classTag chỉ dùng để phá mơ hồ
 * khi khớp chính xác tên lớp/khối; không đoán theo thứ tự dữ liệu trả về.
 */
export function resolveConstantClassForMetadata(
  classification: Extract<QuestionClassification, { success: true }>,
  classTag: string | null,
  classes: ConstantClassRow[]
): {
  status: 'resolved' | 'absent' | 'ambiguous'
  targetClass: ConstantClassRow | null
  error: string | null
} {
  const expectedBlock = canonicalGradeBlock(classification.gradeBlock)
  const classRows = (classes || []).filter(Boolean)
  const matchesBlock = (cl: ConstantClassRow): boolean => {
    if (!expectedBlock) return false
    // grade_block là nguồn phân loại của Constant; tên lớp không được ghi đè
    // một grade_block khác khối/môn.
    return canonicalGradeBlock(cl.grade_block) === expectedBlock
  }

  // [LỚP: 11] là nhãn khối, KHÔNG phải tên riêng của một lớp Constant.
  // Tương tự "Toán-11" chỉ định khối/môn, không chọn lớp 11A hay 11B.
  const normalizedTag = normalizeTaxonomyText(classTag).replace(/^(lop|khoi)\s+/, '')
  const genericTags = new Set([
    String(classification.grade),
    `${classification.grade}-${normalizeTaxonomyText(classification.subject)}`,
    `${normalizeTaxonomyText(classification.subject)}-${classification.grade}`,
    `${classification.grade} ${normalizeTaxonomyText(classification.subject)}`,
    `${normalizeTaxonomyText(classification.subject)} ${classification.grade}`,
  ])
  const isGenericBlockTag = genericTags.has(normalizedTag)

  if (classTag && !isGenericBlockTag) {
    const tagNorm = normalizeTaxonomyText(classTag)
    const exact = classRows.filter((cl) => {
      const nameNorm = normalizeTaxonomyText(cl.name)
      const blockNorm = normalizeTaxonomyText(cl.grade_block)
      return (!!nameNorm && tagNorm === nameNorm) || (!!blockNorm && tagNorm === blockNorm)
    })
    if (exact.length === 1) {
      if (!matchesBlock(exact[0])) {
        return {
          status: 'ambiguous',
          targetClass: null,
          error: `Metadata Lớp "${classTag}" thuộc Khối "${exact[0].grade_block}" khác Khối/Môn đã xác minh "${classification.gradeBlock}"`,
        }
      }
      return { status: 'resolved', targetClass: exact[0], error: null }
    }
    if (exact.length > 1) {
      return {
        status: 'ambiguous',
        targetClass: null,
        error: `Metadata Lớp "${classTag}" khớp nhiều Lớp Constant`,
      }
    }
  }

  const candidates = classRows.filter(matchesBlock)
  if (candidates.length === 1) {
    return { status: 'resolved', targetClass: candidates[0], error: null }
  }
  if (candidates.length > 1) {
    if (isGenericBlockTag) {
      return {
        status: 'absent',
        targetClass: null,
        error: `Nhiều Lớp Constant cùng Khối/Môn "${classification.gradeBlock}"; lưu câu theo metadata khối, không chọn lớp ngẫu nhiên`,
      }
    }
    return {
      status: 'ambiguous',
      targetClass: null,
      error: `Nhiều Lớp Constant cùng Khối/Môn "${classification.gradeBlock}"; metadata Lớp không xác định duy nhất`,
    }
  }
  return {
    status: 'absent',
    targetClass: null,
    error: `Không có Lớp Constant cho Khối/Môn "${classification.gradeBlock}"`,
  }
}

/**
 * Chỉ gắn class/chapter/lesson ĐỘNG khi metadata câu khớp đầy đủ cấp bậc và
 * Khối/Môn canonical của bài học động. Lệch bất kỳ cấp nào -> không gắn id nào.
 */
export function resolveDynamicHierarchyForMetadata(
  tags: QuestionTaxonomyTags,
  dynamicLesson: DynamicLessonHierarchy | null | undefined,
  classification: Extract<QuestionClassification, { success: true }>
): { matched: boolean; ids: DynamicFallbackIds | null } {
  if (!dynamicLesson) return { matched: false, ids: null }
  const dynamicClass = dynamicLesson.chapters?.classes || null
  const dynamicBlock = canonicalGradeBlock(
    `${dynamicClass?.grade_block || ''} ${dynamicClass?.name || ''}`
  )
  const metadataBlock = canonicalGradeBlock(classification.gradeBlock)
  if (!dynamicBlock || !metadataBlock || dynamicBlock !== metadataBlock) {
    return { matched: false, ids: null }
  }

  const dynamicChapterTitle = dynamicLesson.chapters?.title
  const dynamicLessonTitle = dynamicLesson.title
  if (!tags.chapterTag || !tags.lessonTag || !dynamicChapterTitle || !dynamicLessonTitle) {
    return { matched: false, ids: null }
  }
  if (!titleTagMatchesTarget(tags.chapterTag, dynamicChapterTitle)) {
    return { matched: false, ids: null }
  }
  if (!titleTagMatchesTarget(tags.lessonTag, dynamicLessonTitle)) {
    return { matched: false, ids: null }
  }

  return {
    matched: true,
    ids: {
      classId: dynamicClass?.id || dynamicLesson.chapters?.class_id || null,
      chapterId: dynamicLesson.chapter_id || dynamicLesson.chapters?.id || null,
      lessonId: dynamicLesson.id || null,
      sourceDynamicLessonId: dynamicLesson.id || null,
    },
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

  // Giữ nguyên raw metadata của câu (kể cả dữ liệu Markdown cũ nằm trong prompt.metadata)
  // để fallback động vẫn truy vết được Chương/Bài/Dạng bài gốc.
  const tags = extractQuestionTaxonomyTags(q)
  const metadata = {
    classTag: tags.classTag || tags.gradeTag || null,
    gradeTag: tags.gradeTag || tags.classTag || null,
    subjectTag: tags.subjectTag || null,
    chapterTag: tags.chapterTag || null,
    lessonTag: tags.lessonTag || null,
    questionTypeTag: tags.questionTypeTag || null,
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

async function buildRowBase(
  q: SyncQuestionInput,
  homeworkTitle: string
): Promise<{
  prompt: Record<string, any>
  questionType: string
  contentHash: string
  points: number
  difficulty: string
  tags: string[]
}> {
  const prompt = buildQuestionBankPrompt(q)
  const questionType = String(q.questionType || '').toUpperCase()
  const contentHash = await computeQuestionContentHash(questionType, prompt)
  const points = normalizePoints(q.points, questionType)
  const difficulty = VALID_DIFFICULTIES.includes(String(prompt.difficulty || ''))
    ? prompt.difficulty
    : 'THONG_HIEU'
  const tags = Array.from(
    new Set(
      [homeworkTitle]
        .map((tag) => String(tag || '').trim().toLowerCase())
        .filter(Boolean)
    )
  ).slice(0, 20)
  return { prompt, questionType, contentHash, points, difficulty, tags }
}

function buildAnswerFields(q: SyncQuestionInput, questionType: string, prompt: Record<string, any>) {
  return {
    mc_answer: questionType === 'MULTIPLE_CHOICE' ? q.mcAnswer || prompt.mcAnswer || null : null,
    tf_answers: questionType === 'TRUE_FALSE' ? q.tfAnswers || prompt.tfAnswers || null : null,
    sa_answer: safeOutputAnswer(questionType, q, prompt),
    sa_tolerance:
      questionType === 'SHORT_ANSWER' ? Number(q.saTolerance ?? prompt.saTolerance ?? 0) || 0 : 0,
  }
}

/** Dựng một row question_bank hoàn chỉnh cho target Constant đã xác minh. */
export async function buildQuestionBankRow(
  q: SyncQuestionInput,
  target: ConstantTarget,
  dynamicLesson: DynamicLessonHierarchy,
  questionTypeId: string,
  homeworkTitle: string
): Promise<Record<string, any>> {
  const base = await buildRowBase(q, homeworkTitle)
  const gradeBlock = target.gradeBlock || ''
  const gradeSource = `${gradeBlock} ${target.className || ''}`

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
    question_type: base.questionType,
    difficulty: base.difficulty,
    prompt: base.prompt,
    ...buildAnswerFields(q, base.questionType, base.prompt),
    points: base.points,
    tags: base.tags,
    usage_count: 1,
    content_hash: base.contentHash,
  }
}

/**
 * Dựng row fallback động (không gắn bài Constant): qb_* phải NULL để không kích hoạt
 * trigger suy diễn phân cấp Constant. Chỉ gắn id động khi metadata đã được xác minh khớp
 * bài học động; nếu không, để trống thay vì gắn nhầm.
 */
export async function buildDynamicQuestionBankRow(
  q: SyncQuestionInput,
  context: {
    gradeBlock: string
    gradeLevel: number
    subject: 'TOAN' | 'HOA_HOC'
    ids?: DynamicFallbackIds | null
  },
  homeworkTitle: string
): Promise<Record<string, any>> {
  const base = await buildRowBase(q, homeworkTitle)
  const ids = context.ids || null
  return {
    subject: context.subject,
    grade_level: context.gradeLevel,
    grade_block: context.gradeBlock,
    qb_class_id: null,
    qb_chapter_id: null,
    qb_lesson_id: null,
    qb_question_type_id: null,
    source_dynamic_lesson_id: ids?.sourceDynamicLessonId || null,
    class_id: ids?.classId || null,
    chapter_id: ids?.chapterId || null,
    lesson_id: ids?.lessonId || null,
    question_type: base.questionType,
    difficulty: base.difficulty,
    prompt: base.prompt,
    ...buildAnswerFields(q, base.questionType, base.prompt),
    points: base.points,
    tags: base.tags,
    usage_count: 1,
    content_hash: base.contentHash,
  }
}

function isDuplicateError(error: { message?: string; code?: string } | null | undefined): boolean {
  if (!error) return false
  if (String(error.code || '') === '23505') return true
  return /duplicate key|unique constraint|uq_qb_constant_lesson_hash|uq_qb_dynamic_block_hash/i.test(
    String(error.message || '')
  )
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
    async loadExistingDynamicHashes(gradeBlock: string, hashes: string[]) {
      if (hashes.length === 0) return []
      const result = await client
        .from('question_bank')
        .select('grade_block, qb_lesson_id, content_hash')
        .eq('grade_block', gradeBlock)
        .is('qb_lesson_id', null)
        .in('content_hash', hashes)
      return unwrap(result, 'Không kiểm tra được câu hỏi động trùng trong Ngân hàng câu hỏi')
    },
    async insertRows(rows: Record<string, unknown>[]) {
      const result = await client.from('question_bank').insert(rows).select('id')
      return { error: result?.error || null }
    },
  }
}

/**
 * Đồng bộ danh sách câu hỏi sang Ngân hàng câu hỏi Constant.
 *
 * Từng câu tự quyết định taxonomy từ metadata của chính nó:
 * - Nếu Khối/Môn + Chương/Bài khớp DUY NHẤT Constant -> lưu vào Constant như hành vi cũ.
 * - Nếu không có taxonomy Constant tương ứng -> lưu row động (qb_* NULL) theo Khối/Môn
 *   đã xác minh; Chương/Bài/Dạng bài gốc vẫn được giữ trong prompt.metadata.
 * - Chỉ gắn class_id/chapter_id/lesson_id động khi metadata khớp đầy đủ bài học động.
 *
 * Tuyệt đối không fallback Khối 12/môn Toán khi thiếu metadata, không tự tạo Constant,
 * không đoán khi mơ hồ, không gán câu sang bài học khác. Mọi lỗi đều trả summary thay vì throw.
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
  const homeworkTitle = String(input.homeworkTitle || '')

  try {
    const dynamic = input.dynamicLesson || null
    const classes = ((await adapter.loadClasses()) || []).filter(Boolean)

    const chaptersCache = new Map<string, ConstantChapterRow[]>()
    const lessonsCache = new Map<string, ConstantLessonRow[]>()
    const questionTypesCache = new Map<string, ConstantQuestionTypeRow[]>()

    const loadChapters = async (classId: string): Promise<ConstantChapterRow[]> => {
      if (!chaptersCache.has(classId)) {
        chaptersCache.set(classId, (await adapter.loadChapters(classId)) || [])
      }
      return chaptersCache.get(classId) || []
    }
    const loadLessons = async (chapterId: string): Promise<ConstantLessonRow[]> => {
      if (!lessonsCache.has(chapterId)) {
        lessonsCache.set(chapterId, (await adapter.loadLessons(chapterId)) || [])
      }
      return lessonsCache.get(chapterId) || []
    }
    const loadQuestionTypes = async (lessonId: string): Promise<ConstantQuestionTypeRow[]> => {
      if (!questionTypesCache.has(lessonId)) {
        questionTypesCache.set(
          lessonId,
          (await adapter.loadQuestionTypes(lessonId)) || []
        )
      }
      return questionTypesCache.get(lessonId) || []
    }

    const cloneTarget = (target: ConstantTarget): AutoBankSyncSummary['target'] => ({
      classId: target.classId,
      chapterId: target.chapterId,
      lessonId: target.lessonId,
      gradeBlock: target.gradeBlock,
      className: target.className,
      chapterTitle: target.chapterTitle,
      lessonTitle: target.lessonTitle,
    })

    // Đích Constant của bài học động chỉ là "ngữ cảnh hợp lệ" cho câu không đủ metadata;
    // không còn là điều kiện bắt buộc cho toàn batch.
    let dynamicTarget: ConstantTarget | null = null
    let dynamicTargetError: string | null = null
    if (!dynamic) {
      dynamicTargetError = 'Không đọc được bài học động của bài tập'
    } else {
      const classResolution = resolveConstantClassForDynamic(dynamic, classes)
      if (!classResolution.success || !classResolution.targetClass) {
        dynamicTargetError = classResolution.error || 'Không xác định được Lớp Constant duy nhất'
      } else {
        const targetClass = classResolution.targetClass
        const chapters = await loadChapters(targetClass.id)
        if (chapters.length === 0) {
          dynamicTargetError = `Lớp Constant "${targetClass.name}" chưa có Chương nào để đối chiếu`
        } else {
          const chapterMatch = matchTitle(chapters, dynamic.chapters?.title)
          if (!chapterMatch.row) {
            dynamicTargetError = chapterMatch.ambiguous
              ? `Chương "${dynamic.chapters?.title || ''}" khớp nhiều Chương Constant trong lớp "${targetClass.name}"`
              : `Không có Chương Constant tương ứng với "${dynamic.chapters?.title || ''}" trong lớp "${targetClass.name}"`
          } else {
            const lessons = await loadLessons(chapterMatch.row.id)
            if (lessons.length === 0) {
              dynamicTargetError = `Chương Constant "${chapterMatch.row.title}" chưa có Bài học nào để đối chiếu`
            } else {
              const lessonMatch = matchTitle(lessons, dynamic.title)
              if (!lessonMatch.row) {
                dynamicTargetError = lessonMatch.ambiguous
                  ? `Bài "${dynamic.title || ''}" khớp nhiều Bài học Constant trong chương "${chapterMatch.row.title}"`
                  : `Không có Bài học Constant tương ứng với "${dynamic.title || ''}" trong chương "${chapterMatch.row.title}"`
              } else {
                dynamicTarget = {
                  classId: targetClass.id,
                  chapterId: chapterMatch.row.id,
                  lessonId: lessonMatch.row.id,
                  gradeBlock: targetClass.grade_block,
                  className: targetClass.name,
                  chapterTitle: chapterMatch.row.title,
                  lessonTitle: lessonMatch.row.title,
                }
              }
            }
          }
        }
      }
    }
    type PreparedRow = {
      questionNumber: number | null
      row: Record<string, any>
      dedupKey: string
      lessonId?: string
      gradeBlock?: string
    }
    const prepared: PreparedRow[] = []
    const seenKeys = new Set<string>()
    const usedTargets = new Map<string, ConstantTarget>()
    let usedDynamicTarget = false

    const pushReason = (questionNumber: number | null, reason: string) => {
      if (summary.reasons.length < 20) summary.reasons.push({ questionNumber, reason })
    }

    const markUnsynced = (questionNumber: number | null, reason: string) => {
      summary.unsyncedCount++
      pushReason(questionNumber, reason)
    }

    const markFailed = (questionNumber: number | null, reason: string) => {
      summary.failedCount++
      pushReason(questionNumber, reason)
    }

    // summary.target là đại diện duy nhất cho UI: chỉ trả về khi batch thực sự dùng
    // đúng một Constant target. Nhiều target (hoặc chỉ row động) -> null.
    const syncSummaryTarget = () => {
      const targets = Array.from(usedTargets.values())
      summary.target = !usedDynamicTarget && targets.length === 1 ? cloneTarget(targets[0]) : null
    }

    const enqueueRow = (item: PreparedRow) => {
      if (seenKeys.has(item.dedupKey)) {
        summary.skippedDuplicateCount++
        return
      }
      seenKeys.add(item.dedupKey)
      prepared.push(item)
    }

    const prepareConstantRow = async (
      question: SyncQuestionInput,
      target: ConstantTarget,
      questionNumber: number | null
    ): Promise<void> => {
      const tags = extractQuestionTaxonomyTags(question)
      const metadataConflict = resolveQuestionMetadataConflict(question, target, classes)
      if (metadataConflict) {
        markUnsynced(questionNumber, metadataConflict)
        return
      }

      const typeResolution = resolveQuestionTypeForBank(
        tags.questionTypeTag,
        target.lessonId,
        await loadQuestionTypes(target.lessonId)
      )
      if (!typeResolution.success || !typeResolution.type) {
        markUnsynced(
          questionNumber,
          typeResolution.error || 'Không xác định được Dạng bài Constant'
        )
        return
      }
      if (typeResolution.isFallback) summary.fallbackTypeCount++

      const row = await buildQuestionBankRow(
        question,
        target,
        (dynamic || {}) as DynamicLessonHierarchy,
        typeResolution.type.id,
        homeworkTitle
      )

      // Id động chỉ được gắn khi metadata tự chứng minh khớp đầy đủ bài học động.
      // Ngoại lệ hẹp: câu không có taxonomy tag nào và Constant target chính là bài
      // học động của bài tập -> giữ hành vi legacy (id động là nguồn gốc hợp lệ).
      const hasTaxonomyTags = !!(
        tags.classTag ||
        tags.gradeTag ||
        tags.subjectTag ||
        tags.chapterTag ||
        tags.lessonTag
      )
      const isHomeworkTarget = !!dynamicTarget && target.lessonId === dynamicTarget.lessonId
      let verifiedIds: DynamicFallbackIds | null = null
      if (hasTaxonomyTags) {
        const classification = classifyQuestionTaxonomy(tags)
        if (classification.success) {
          const dynamicMatch = resolveDynamicHierarchyForMetadata(tags, dynamic, classification)
          if (dynamicMatch.matched) verifiedIds = dynamicMatch.ids
        }
      } else if (isHomeworkTarget) {
        verifiedIds = {
          classId: row.class_id || null,
          chapterId: row.chapter_id || null,
          lessonId: row.lesson_id || null,
          sourceDynamicLessonId: row.source_dynamic_lesson_id || null,
        }
      }

      row.class_id = verifiedIds?.classId || null
      row.chapter_id = verifiedIds?.chapterId || null
      row.lesson_id = verifiedIds?.lessonId || null
      row.source_dynamic_lesson_id = verifiedIds?.sourceDynamicLessonId || null

      usedTargets.set(target.lessonId, target)
      syncSummaryTarget()

      const hash = String(row.content_hash || '')
      enqueueRow({
        questionNumber,
        row,
        dedupKey: `constant:${target.lessonId}|${hash}`,
        lessonId: target.lessonId,
      })
    }

    const prepareDynamicRow = async (
      question: SyncQuestionInput,
      classification: Extract<QuestionClassification, { success: true }>,
      dynamicMatch: { matched: boolean; ids: DynamicFallbackIds | null },
      questionNumber: number | null
    ): Promise<void> => {
      // Giữ đúng chuỗi khối của lớp động nếu cùng Khối/Môn: bộ lọc ngân hàng
      // dùng grade_block.eq (vd "Toán-11"), không phải khóa canonical "11-Toán".
      const dynamicGradeBlock = dynamic?.chapters?.classes?.grade_block?.trim() || ''
      const gradeBlock = canonicalGradeBlock(dynamicGradeBlock) ===
          canonicalGradeBlock(classification.gradeBlock)
        ? dynamicGradeBlock
        : classification.gradeBlock
      const row = await buildDynamicQuestionBankRow(
        question,
        {
          gradeBlock,
          gradeLevel: classification.grade,
          subject: classification.subject === 'Hóa' ? 'HOA_HOC' : 'TOAN',
          ids: dynamicMatch.matched ? dynamicMatch.ids : null,
        },
        homeworkTitle
      )
      const hash = String(row.content_hash || '')
      enqueueRow({
        questionNumber,
        row,
        dedupKey: `dynamic:${gradeBlock}|${hash}`,
        gradeBlock,
      })
      usedDynamicTarget = true
      syncSummaryTarget()
    }

    for (let index = 0; index < questions.length; index++) {
      const question = questions[index]
      const questionNumber =
        typeof question.questionNumber === 'number' ? question.questionNumber : index + 1
      try {
        const tags = extractQuestionTaxonomyTags(question)
        const classification = classifyQuestionTaxonomy(tags)

        if (!classification.success) {
          if (classification.kind === 'contradictory') {
            markUnsynced(questionNumber, classification.error)
            continue
          }

          // Metadata thiếu Khối/Môn: chỉ được dùng đích Constant đã resolve từ bài học động
          // và đã đối chiếu không xung đột. Không suy ra Khối 12.
          if (dynamicTarget) {
            const metadataConflict = resolveQuestionMetadataConflict(question, dynamicTarget, classes)
            if (metadataConflict) {
              markUnsynced(questionNumber, metadataConflict)
            } else {
              await prepareConstantRow(question, dynamicTarget, questionNumber)
            }
            continue
          }

          markUnsynced(
            questionNumber,
            dynamicTargetError
              ? `${classification.error}; ${dynamicTargetError}`
              : classification.error
          )
          continue
        }

        const classResolution = resolveConstantClassForMetadata(
          classification,
          tags.classTag || tags.gradeTag,
          classes
        )

        if (classResolution.status === 'resolved' && classResolution.targetClass) {
          const targetClass = classResolution.targetClass
          let target: ConstantTarget | null = null
          let resolutionError: string | null = null

          if (!tags.chapterTag) {
            // Không có metadata Chương: chỉ dùng bài học Constant của chính bài tập động
            // nếu cùng Lớp; không tự chọn Chương đầu tiên.
            if (dynamicTarget && dynamicTarget.classId === targetClass.id) {
              target = dynamicTarget
            } else {
              resolutionError = `Thiếu metadata [CHƯƠNG] để gắn câu vào Lớp Constant "${targetClass.name}"`
            }
          } else {
            const chapters = await loadChapters(targetClass.id)
            if (chapters.length === 0) {
              resolutionError = `Lớp Constant "${targetClass.name}" chưa có Chương nào`
            } else {
              const chapterMatch = matchTitle(chapters, tags.chapterTag)
              if (!chapterMatch.row) {
                resolutionError = chapterMatch.ambiguous
                  ? `Metadata Chương "${tags.chapterTag}" khớp nhiều Chương Constant trong lớp "${targetClass.name}"`
                  : `Không có Chương Constant tương ứng với "${tags.chapterTag}" trong lớp "${targetClass.name}"`
              } else if (!tags.lessonTag) {
                if (
                  dynamicTarget &&
                  dynamicTarget.classId === targetClass.id &&
                  dynamicTarget.chapterId === chapterMatch.row.id
                ) {
                  target = dynamicTarget
                } else {
                  resolutionError = `Thiếu metadata [BÀI HỌC] trong Chương Constant "${chapterMatch.row.title}"`
                }
              } else {
                const lessons = await loadLessons(chapterMatch.row.id)
                if (lessons.length === 0) {
                  resolutionError = `Chương Constant "${chapterMatch.row.title}" chưa có Bài học nào`
                } else {
                  const lessonMatch = matchTitle(lessons, tags.lessonTag)
                  if (!lessonMatch.row) {
                    resolutionError = lessonMatch.ambiguous
                      ? `Metadata Bài học "${tags.lessonTag}" khớp nhiều Bài học Constant trong chương "${chapterMatch.row.title}"`
                      : `Không có Bài học Constant tương ứng với "${tags.lessonTag}" trong chương "${chapterMatch.row.title}"`
                  } else {
                    target = {
                      classId: targetClass.id,
                      chapterId: chapterMatch.row.id,
                      lessonId: lessonMatch.row.id,
                      gradeBlock: targetClass.grade_block,
                      className: targetClass.name,
                      chapterTitle: chapterMatch.row.title,
                      lessonTitle: lessonMatch.row.title,
                    }
                  }
                }
              }
            }
          }

          if (target) {
            await prepareConstantRow(question, target, questionNumber)
            continue
          }

          // Constant thiếu cấp tương ứng nhưng metadata khớp đúng bài học động: lưu fallback
          // động, gắn id động đã xác minh (không gắn Constant dở dang, không gán bài khác).
          const dynamicMatch = resolveDynamicHierarchyForMetadata(tags, dynamic, classification)
          if (dynamicMatch.matched) {
            await prepareDynamicRow(question, classification, dynamicMatch, questionNumber)
            continue
          }

          markUnsynced(
            questionNumber,
            resolutionError || classResolution.error || 'Không xác định được phân cấp Constant'
          )
          continue
        }

        // Lớp Constant mơ hồ hoặc classTag xung đột Khối/Môn: fail closed, không đoán
        // rồi âm thầm lưu row động (sẽ che mất lỗi metadata/taxonomy).
        if (classResolution.status === 'ambiguous') {
          markUnsynced(
            questionNumber,
            classResolution.error ||
              `Nhiều Lớp Constant cùng Khối/Môn "${classification.gradeBlock}" và metadata Lớp không xác định duy nhất`
          )
          continue
        }

        // Không có Lớp Constant: fallback động theo Khối/Môn đã xác minh. Chỉ gắn id động
        // nếu metadata khớp đầy đủ cấp bậc bài học động.
        const dynamicMatch = resolveDynamicHierarchyForMetadata(tags, dynamic, classification)
        await prepareDynamicRow(question, classification, dynamicMatch, questionNumber)
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error)
        markFailed(
          questionNumber,
          `Không xử lý được câu hỏi do lỗi đọc phân cấp/Dạng bài Constant: ${message}`
        )
      }
    }

    if (prepared.length === 0) {
      return summary
    }

    // Kiểm tra trùng đúng phạm vi:
    // - Constant: (qb_lesson_id, content_hash) theo uq_qb_constant_lesson_hash.
    // - Động: (grade_block, content_hash) với qb_lesson_id IS NULL theo uq_qb_dynamic_block_hash.
    const existingKeys = new Set<string>()
    const CHUNK_SIZE = 100

    const constantGroups = new Map<string, PreparedRow[]>()
    const dynamicGroups = new Map<string, PreparedRow[]>()
    for (const item of prepared) {
      if (item.lessonId) {
        const group = constantGroups.get(item.lessonId) || []
        group.push(item)
        constantGroups.set(item.lessonId, group)
      } else if (item.gradeBlock) {
        const group = dynamicGroups.get(item.gradeBlock) || []
        group.push(item)
        dynamicGroups.set(item.gradeBlock, group)
      }
    }

    for (const [lessonId, items] of constantGroups) {
      const hashes = Array.from(new Set(items.map((item) => String(item.row.content_hash))))
      for (let offset = 0; offset < hashes.length; offset += CHUNK_SIZE) {
        const chunk = hashes.slice(offset, offset + CHUNK_SIZE)
        const existing = await adapter.loadExistingHashes(lessonId, chunk)
        for (const row of existing || []) {
          if (row.content_hash) {
            existingKeys.add(`constant:${row.qb_lesson_id || lessonId}|${row.content_hash}`)
          }
        }
      }
    }

    for (const [gradeBlock, items] of dynamicGroups) {
      const hashes = Array.from(new Set(items.map((item) => String(item.row.content_hash))))
      const alternateGradeBlock = alternateGradeBlockOrder(gradeBlock)
      for (let offset = 0; offset < hashes.length; offset += CHUNK_SIZE) {
        const chunk = hashes.slice(offset, offset + CHUNK_SIZE)
          for (const queriedGradeBlock of [gradeBlock, alternateGradeBlock]) {
          if (!queriedGradeBlock) continue
          const existing = await adapter.loadExistingDynamicHashes(queriedGradeBlock, chunk)
          for (const row of existing || []) {
            if (row.content_hash && row.qb_lesson_id == null) {
              // Key dedup luôn dùng Khối canonical của batch, kể cả khi row cũ lưu
              // thứ tự "Toán-11" (unique index DB vẫn có thể khác chuỗi).
              existingKeys.add(`dynamic:${gradeBlock}|${row.content_hash}`)
            }
          }
        }
      }
    }

    const rowsToInsert = prepared.filter((item) => {
      if (existingKeys.has(item.dedupKey)) {
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

    // Bulk có thể thất bại do race với request khác (unique 23505). Thử từng row để
    // phân loại chính xác: row trùng -> skipped, row lỗi thật -> failed + reason.
    // Không retry vô hạn; mỗi row chỉ thử đúng một lần sau bulk.
    for (const item of rowsToInsert) {
      const singleResult = await adapter.insertRows([item.row])
      if (!singleResult.error) {
        summary.createdCount++
      } else if (isDuplicateError(singleResult.error)) {
        summary.skippedDuplicateCount++
      } else {
        summary.failedCount++
        pushReason(
          item.questionNumber,
          `Lỗi ghi Ngân hàng câu hỏi: ${singleResult.error.message || 'Unknown error'}`
        )
      }
    }

    return summary
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    const attempted =
      summary.createdCount +
      summary.skippedDuplicateCount +
      summary.unsyncedCount +
      summary.failedCount
    const remaining = Math.max(0, summary.totalQuestions - attempted)
    if (remaining > 0) summary.failedCount += remaining
    if (summary.reasons.length < 20) {
      summary.reasons.push({
        questionNumber: null,
        reason: `Không đồng bộ được Ngân hàng câu hỏi: ${message}`,
      })
    }
    return summary
  }
}
