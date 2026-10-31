/**
 * Test an toàn cho Auto-sync Ngân hàng câu hỏi Constant từ create-homework.
 *
 * Chạy: node supabase/scripts/test-auto-bank-sync.mjs
 *
 * Nguyên tắc:
 * - Không kết nối DB thật, không deploy, không migration, không gọi mạng.
 * - Oracle độc lập cho content_hash (mô tả lại spec fn_compute_qb_content_hash).
 * - Kiểm tra mapping duy nhất/mơ hồ/lệch khối, fallback "Khác", chống trùng theo bài,
 *   giữ đáp án Đúng/Sai + ảnh, và summary thất bại không báo thành công giả.
 */

import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'

import {
  buildDynamicQuestionBankRow,
  buildQuestionBankPrompt,
  buildQuestionBankRow,
  canonicalGradeBlock,
  classifyQuestionTaxonomy,
  computeQuestionContentHash,
  extractQuestionTaxonomyTags,
  resolveConstantLessonForDynamic,
  resolveDynamicHierarchyForMetadata,
  resolveQuestionMetadataConflict,
  resolveQuestionTypeForBank,
  syncHomeworkQuestionsToConstantBank,
} from '../functions/create-homework/auto-bank-sync.ts'

const HERE = dirname(fileURLToPath(import.meta.url))
const ROOT = join(HERE, '..')
const FN_SRC = readFileSync(join(ROOT, 'functions', 'create-homework', 'index.ts'), 'utf8')

let passed = 0
let failed = 0

async function test(name, fn) {
  try {
    const result = fn()
    if (result && typeof result.then === 'function') await result
    passed++
    console.log(`  ✓ ${name}`)
  } catch (error) {
    failed++
    console.error(`  ✗ ${name}:`, error.message)
  }
}

// Oracle độc lập theo spec public.fn_compute_qb_content_hash:
// question_type + ':::' + normalize(text) + ':::' + options/statements (id:text)
function independentHash(questionType, prompt) {
  const norm = (value) => String(value ?? '').trim().toLowerCase().replace(/\s+/g, ' ')
  let optionsStr = ''
  if (Array.isArray(prompt?.options)) {
    for (const item of prompt.options) optionsStr += `|${item?.id ?? ''}:${norm(item?.text)}`
  } else if (Array.isArray(prompt?.statements)) {
    for (const item of prompt.statements) optionsStr += `|${item?.id ?? ''}:${norm(item?.text)}`
  }
  const raw = `${String(questionType).toUpperCase()}:::${norm(prompt?.text)}:::${optionsStr}`
  return createHash('sha256').update(raw, 'utf8').digest('hex')
}

function makeTaxonomy(overrides = {}) {
  return {
    classes: [
      { id: 'c12', name: 'Toán 12 - Chuẩn', grade_block: '12-Toán' },
      { id: 'c11', name: 'Toán 11 - Chuẩn', grade_block: '11-Toán' },
      { id: 'c12hoa', name: 'Hóa 12 - Chuẩn', grade_block: '12-Hóa' },
    ],
    chapters: [
      { id: 'ch12', class_id: 'c12', title: 'Chương I: Ứng dụng đạo hàm' },
      { id: 'ch11', class_id: 'c11', title: 'Chương I: Hàm số lượng giác' },
    ],
    lessons: [
      { id: 'l12', chapter_id: 'ch12', title: 'Bài 1: Tính đơn điệu của hàm số' },
      { id: 'l11', chapter_id: 'ch11', title: 'Bài 1: Hàm số lượng giác' },
    ],
    questionTypes: [
      { id: 't12-monotonic', lesson_id: 'l12', name: 'Xét tính đơn điệu' },
      { id: 't12-other', lesson_id: 'l12', name: 'Khác' },
      { id: 't11-other', lesson_id: 'l11', name: 'Khác' },
    ],
    ...overrides,
  }
}

function dynamicLesson(overrides = {}) {
  return {
    id: 'dyn-lesson-12a1',
    chapter_id: 'dyn-chapter',
    title: 'Bài 1. Tính đơn điệu của hàm số',
    chapters: {
      id: 'dyn-chapter',
      title: 'Chương 1. Ứng dụng đạo hàm',
      class_id: 'dyn-class',
      classes: {
        id: 'dyn-class',
        name: '12A1',
        grade_block: '12 - Toán',
      },
    },
    ...overrides,
  }
}

function dynamicLesson11Math(overrides = {}) {
  return {
    id: 'dyn-lesson-11a1',
    chapter_id: 'dyn-chapter-11',
    title: 'Bài 1. Giá trị lượng giác của góc lượng giác',
    chapters: {
      id: 'dyn-chapter-11',
      title: 'Chương I. Hàm số lượng giác và phương trình lượng giác',
      class_id: 'dyn-class-11',
      classes: {
        id: 'dyn-class-11',
        name: '11A1',
        grade_block: 'Toán-11',
      },
    },
    ...overrides,
  }
}

function taxonomyWithoutMath11(overrides = {}) {
  return {
    classes: [
      { id: 'c12', name: 'Toán 12 - Chuẩn', grade_block: '12-Toán' },
      { id: 'c12hoa', name: 'Hóa 12 - Chuẩn', grade_block: '12-Hóa' },
    ],
    chapters: [
      { id: 'ch12', class_id: 'c12', title: 'Chương I: Ứng dụng đạo hàm' },
      { id: 'ch12hoa', class_id: 'c12hoa', title: 'Chương 1: Este - Lipit' },
    ],
    lessons: [
      { id: 'l12', chapter_id: 'ch12', title: 'Bài 1: Tính đơn điệu của hàm số' },
      { id: 'l12hoa', chapter_id: 'ch12hoa', title: 'Bài 1: Este' },
    ],
    questionTypes: [
      { id: 't12-monotonic', lesson_id: 'l12', name: 'Xét tính đơn điệu' },
      { id: 't12-other', lesson_id: 'l12', name: 'Khác' },
      { id: 't12hoa-other', lesson_id: 'l12hoa', name: 'Khác' },
    ],
    ...overrides,
  }
}

function question11MathExample(overrides = {}) {
  return mcQuestion({
    questionNumber: 1,
    prompt: JSON.stringify({
      isInteractive: true,
      text: 'Đổi 150° sang radian.',
      options: [
        { id: 'A', text: '5π/6' },
        { id: 'B', text: '2π/3' },
        { id: 'C', text: '3π/4' },
        { id: 'D', text: 'π' },
      ],
      explanation: '150° = 150π/180 = 5π/6.',
    }),
    options: [
      { id: 'A', text: '5π/6' },
      { id: 'B', text: '2π/3' },
      { id: 'C', text: '3π/4' },
      { id: 'D', text: 'π' },
    ],
    content: 'Đổi 150° sang radian.',
    explanation: '150° = 150π/180 = 5π/6.',
    mcAnswer: 'A',
    classTag: '11',
    gradeTag: '11',
    subjectTag: 'Toán',
    chapterTag: 'Chương I. Hàm số lượng giác và phương trình lượng giác',
    lessonTag: 'Bài 1. Giá trị lượng giác của góc lượng giác',
    questionTypeTag: 'Đổi đơn vị đo góc (độ – radian)',
    ...overrides,
  })
}

function constantTarget(overrides = {}) {
  return {
    classId: 'c12',
    chapterId: 'ch12',
    lessonId: 'l12',
    gradeBlock: '12-Toán',
    className: 'Toán 12 - Chuẩn',
    chapterTitle: 'Chương I: Ứng dụng đạo hàm',
    lessonTitle: 'Bài 1: Tính đơn điệu của hàm số',
    ...overrides,
  }
}

function mcQuestion(overrides = {}) {
  return {
    questionNumber: 1,
    questionType: 'MULTIPLE_CHOICE',
    prompt: JSON.stringify({
      isInteractive: true,
      text: 'Cho hàm số y = x^3 - 3x. Hàm số đồng biến trên khoảng nào?',
      imageUrl: 'https://cdn.example.com/mc.png',
      options: [
        { id: 'A', text: '(-∞; -1)' },
        { id: 'B', text: '(-1; 1)' },
        { id: 'C', text: '(1; +∞)' },
        { id: 'D', text: 'ℝ' },
      ],
      explanation: 'Tính đạo hàm và xét dấu.',
    }),
    content: 'Cho hàm số y = x^3 - 3x. Hàm số đồng biến trên khoảng nào?',
    options: [
      { id: 'A', text: '(-∞; -1)' },
      { id: 'B', text: '(-1; 1)' },
      { id: 'C', text: '(1; +∞)' },
      { id: 'D', text: 'ℝ' },
    ],
    explanation: 'Tính đạo hàm và xét dấu.',
    difficulty: 'VAN_DUNG',
    points: 0.25,
    mcAnswer: 'A',
    imageUrl: 'https://cdn.example.com/mc.png',
    questionTypeTag: 'Xét tính đơn điệu',
    source: 'MARKDOWN_INTERACTIVE',
    ...overrides,
  }
}

function tfQuestion(overrides = {}) {
  return {
    questionNumber: 2,
    questionType: 'TRUE_FALSE',
    prompt: JSON.stringify({
      isInteractive: true,
      text: 'Cho hàm số y = x^3 - 3x. Xét tính đúng sai của các mệnh đề:',
      imageUrl: 'https://cdn.example.com/tf.png',
      statements: [
        { id: 'a', text: 'Hàm số đạt cực đại tại x = -1' },
        { id: 'b', text: 'Hàm số đạt cực tiểu tại x = 1' },
        { id: 'c', text: 'Hàm số nghịch biến trên (-1; 1)' },
        { id: 'd', text: 'Hàm số có giá trị nhỏ nhất bằng 0' },
      ],
      explanation: 'Dùng bảng biến thiên.',
    }),
    statements: [
      { id: 'a', text: 'Hàm số đạt cực đại tại x = -1' },
      { id: 'b', text: 'Hàm số đạt cực tiểu tại x = 1' },
      { id: 'c', text: 'Hàm số nghịch biến trên (-1; 1)' },
      { id: 'd', text: 'Hàm số có giá trị nhỏ nhất bằng 0' },
    ],
    explanation: 'Dùng bảng biến thiên.',
    difficulty: 'THONG_HIEU',
    points: 1,
    tfAnswers: { a: true, b: true, c: true, d: false },
    imageUrl: 'https://cdn.example.com/tf.png',
    source: 'MARKDOWN_INTERACTIVE',
    ...overrides,
  }
}

function makeAdapter(taxonomy, options = {}) {
  const existing = options.existing || []
  const dynamicExisting = options.dynamicExisting || []
  const insertError = options.insertError || null
  const bulkErrorOnce = options.bulkErrorOnce || null
  const raceDuplicateHashes = new Set(options.raceDuplicateHashes || [])
  let insertAttempt = 0
  const adapter = {
    insertedRows: [],
    calls: { classes: 0, chapters: 0, lessons: 0, types: 0, existing: 0, dynamicExisting: 0, insert: 0 },
    async loadClasses() {
      adapter.calls.classes++
      return taxonomy.classes
    },
    async loadChapters(classId) {
      adapter.calls.chapters++
      return taxonomy.chapters.filter((row) => row.class_id === classId)
    },
    async loadLessons(chapterId) {
      adapter.calls.lessons++
      return taxonomy.lessons.filter((row) => row.chapter_id === chapterId)
    },
    async loadQuestionTypes(lessonId) {
      adapter.calls.types++
      return taxonomy.questionTypes.filter((row) => row.lesson_id === lessonId)
    },
    async loadExistingHashes(lessonId, hashes) {
      adapter.calls.existing++
      return existing.filter(
        (row) => row.qb_lesson_id === lessonId && hashes.includes(row.content_hash)
      )
    },
    async loadExistingDynamicHashes(gradeBlock, hashes) {
      adapter.calls.dynamicExisting++
      return dynamicExisting.filter(
        (row) =>
          row.grade_block === gradeBlock &&
          row.qb_lesson_id == null &&
          hashes.includes(row.content_hash)
      )
    },
    async insertRows(rows) {
      adapter.calls.insert++
      insertAttempt++
      if (insertError) return { error: insertError }
      if (insertAttempt === 1 && bulkErrorOnce) return { error: bulkErrorOnce }
      if (rows.some((row) => raceDuplicateHashes.has(row.content_hash))) {
        return {
          error: {
            code: '23505',
            message: 'duplicate key value violates unique constraint "uq_qb_dynamic_block_hash"',
          },
        }
      }
      adapter.insertedRows.push(...rows)
      return { error: null }
    },
  }
  return adapter
}

async function run() {
  console.log('\n--- 1. Canonical hóa Khối/Chương/Bài ---')
  await test('Khối "12 - Toán", "Toán 12", "12-Toán" cùng canonical', () => {
    assert.equal(canonicalGradeBlock('12 - Toán'), canonicalGradeBlock('Toán 12'))
    assert.equal(canonicalGradeBlock('12-Toán'), '12-toan')
    assert.equal(canonicalGradeBlock('Khối 11 - Hóa'), '11-hoa')
  })

  console.log('\n--- 2. Mapping động -> Constant duy nhất / mơ hồ / lệch khối ---')
  await test('Map đúng Lớp -> Chương -> Bài khi tên chỉ khác số La Mã/dấu câu', () => {
    const result = resolveConstantLessonForDynamic(dynamicLesson(), makeTaxonomy())
    assert.equal(result.success, true)
    assert.equal(result.target.classId, 'c12')
    assert.equal(result.target.chapterId, 'ch12')
    assert.equal(result.target.lessonId, 'l12')
  })

  await test('Nhiều Lớp cùng khối -> báo mơ hồ, không đoán', () => {
    const taxonomy = makeTaxonomy({
      classes: [
        { id: 'c12a', name: 'Toán 12 - Cơ bản', grade_block: '12-Toán' },
        { id: 'c12b', name: 'Toán 12 - Nâng cao', grade_block: '12-Toán' },
      ],
      chapters: [{ id: 'ch12', class_id: 'c12a', title: 'Chương I: Ứng dụng đạo hàm' }],
      lessons: [{ id: 'l12', chapter_id: 'ch12', title: 'Bài 1: Tính đơn điệu của hàm số' }],
    })
    const result = resolveConstantLessonForDynamic(dynamicLesson(), taxonomy)
    assert.equal(result.success, false)
    assert.match(result.error, /Nhiều Lớp Constant/)
  })

  await test('Không vượt khối: bài 11 không map sang Lớp 12', () => {
    const result = resolveConstantLessonForDynamic(
      dynamicLesson({
        chapters: {
          id: 'dyn-chapter',
          title: 'Chương 1. Ứng dụng đạo hàm',
          class_id: 'dyn-class',
          classes: { id: 'dyn-class', name: '11A1', grade_block: '11-Toán' },
        },
      }),
      makeTaxonomy({ classes: [{ id: 'c12', name: 'Toán 12', grade_block: '12-Toán' }] })
    )
    assert.equal(result.success, false)
    assert.match(result.error, /Không có Lớp Constant/)
  })

  await test('Nhiều Chương cùng canonical -> báo mơ hồ', () => {
    const taxonomy = makeTaxonomy({
      chapters: [
        { id: 'ch12a', class_id: 'c12', title: 'Chương I: Ứng dụng đạo hàm' },
        { id: 'ch12b', class_id: 'c12', title: 'Chương 1. Ứng dụng đạo hàm' },
      ],
      lessons: [{ id: 'l12', chapter_id: 'ch12a', title: 'Bài 1: Tính đơn điệu của hàm số' }],
    })
    const result = resolveConstantLessonForDynamic(dynamicLesson(), taxonomy)
    assert.equal(result.success, false)
    assert.match(result.error, /khớp nhiều Chương Constant/)
  })

  await test('Thiếu Bài tương ứng -> unsynced, không tự tạo taxonomy', () => {
    const taxonomy = makeTaxonomy({
      lessons: [{ id: 'l12-other', chapter_id: 'ch12', title: 'Bài 2: Cực trị của hàm số' }],
    })
    const result = resolveConstantLessonForDynamic(dynamicLesson(), taxonomy)
    assert.equal(result.success, false)
    assert.match(result.error, /Không có Bài học Constant/)
  })

  await test('Không ghép nhầm bài cùng nội dung nhưng khác số hoặc chỉ trùng một phần tên', () => {
    for (const wrongTitle of [
      'Bài 2: Tính đơn điệu của hàm số',
      'Bài 1: Ứng dụng tính đơn điệu của hàm số',
    ]) {
      const taxonomy = makeTaxonomy({
        lessons: [{ id: 'wrong', chapter_id: 'ch12', title: wrongTitle }],
      })
      const result = resolveConstantLessonForDynamic(dynamicLesson(), taxonomy)
      assert.equal(result.success, false, wrongTitle)
    }
    const wrongChapter = makeTaxonomy({
      chapters: [{ id: 'wrong', class_id: 'c12', title: 'Chương II: Ứng dụng đạo hàm' }],
    })
    assert.equal(resolveConstantLessonForDynamic(dynamicLesson(), wrongChapter).success, false)
    const target = constantTarget()
    assert.match(
      resolveQuestionMetadataConflict(mcQuestion({ lessonTag: 'Bài 2: Tính đơn điệu của hàm số' }), target),
      /Bài học/
    )
  })

  console.log('\n--- 3. Dạng bài: khớp duy nhất -> dùng; còn lại -> "Khác" ---')
  const types = makeTaxonomy().questionTypes
  await test('Tag khớp duy nhất chọn đúng Dạng bài', () => {
    const result = resolveQuestionTypeForBank('Xét tính đơn điệu', 'l12', types)
    assert.equal(result.success, true)
    assert.equal(result.type.id, 't12-monotonic')
    assert.equal(result.isFallback, false)

    const substring = resolveQuestionTypeForBank('đơn điệu', 'l12', types)
    assert.equal(substring.success, true)
    assert.equal(substring.type.id, 't12-monotonic')
    assert.equal(substring.isFallback, false)
  })

  await test('Tag lạ -> fallback "Khác" của đúng bài', () => {
    const unknown = resolveQuestionTypeForBank('Dạng không tồn tại', 'l12', types)
    assert.equal(unknown.success, true)
    assert.equal(unknown.type.id, 't12-other')
    assert.equal(unknown.isFallback, true)
  })

  await test('Nhiều "Khác" trùng chuẩn hóa -> unsynced, không chọn bản đầu tiên', () => {
    const duplicateOthers = [
      ...types,
      { id: 't12-other-2', lesson_id: 'l12', name: 'khác' },
    ]
    const unknown = resolveQuestionTypeForBank('Dạng không tồn tại', 'l12', duplicateOthers)
    assert.equal(unknown.success, false)
    assert.equal(unknown.type, null)
    assert.match(unknown.error, /nhiều Dạng bài "Khác"|Dạng bài "Khác" trùng chuẩn hóa/)

    const directlyKhac = resolveQuestionTypeForBank('Khác', 'l12', duplicateOthers)
    assert.equal(directlyKhac.success, false)
    assert.equal(directlyKhac.type, null)

    // Tag khớp duy nhất vẫn dùng được dù "Khác" bị trùng; không over-fail.
    const uniqueTag = resolveQuestionTypeForBank('Xét tính đơn điệu', 'l12', duplicateOthers)
    assert.equal(uniqueTag.success, true)
    assert.equal(uniqueTag.type.id, 't12-monotonic')
    assert.equal(uniqueTag.isFallback, false)
  })

  await test('Bài không có "Khác" -> unsynced, không tạo Dạng bài', () => {
    const result = resolveQuestionTypeForBank('Bất kỳ', 'l12', [
      { id: 't12-monotonic', lesson_id: 'l12', name: 'Xét tính đơn điệu' },
    ])
    assert.equal(result.success, false)
    assert.match(result.error, /chưa có Dạng bài "Khác"/)
  })

  console.log('\n--- 4. Content hash & chống trùng theo Bài Constant ---')
  await test('Hash bất biến trước khoảng trắng/hoa thường, khác khi nội dung khác', async () => {
    const base = { text: '  Cho   hàm số  ', options: [{ id: 'A', text: ' Đáp án A ' }] }
    const hashA = await computeQuestionContentHash('MULTIPLE_CHOICE', base)
    const hashB = independentHash('MULTIPLE_CHOICE', base)
    const hashWhitespace = await computeQuestionContentHash('MULTIPLE_CHOICE', {
      text: 'cho hàm số',
      options: [{ id: 'A', text: 'đáp án a' }],
    })
    assert.equal(hashA, hashB)
    assert.equal(hashA, hashWhitespace)
    const hashOther = await computeQuestionContentHash('TRUE_FALSE', base)
    assert.notEqual(hashA, hashOther)
  })

  await test('TRUE_FALSE không ghi options; hash theo 4 mệnh đề, không chỉ stem', async () => {
    const base = tfQuestion()
    const promptA = buildQuestionBankPrompt(base)
    const promptB = buildQuestionBankPrompt(
      tfQuestion({
        statements: [
          { id: 'a', text: 'Mệnh đề A khác' },
          { id: 'b', text: 'Mệnh đề B khác' },
          { id: 'c', text: 'Mệnh đề C khác' },
          { id: 'd', text: 'Mệnh đề D khác' },
        ],
      })
    )

    // Không có key options (kể cả mảng rỗng) để DB ưu tiên statements.
    assert.equal(Object.prototype.hasOwnProperty.call(promptA, 'options'), false)
    assert.equal(Object.prototype.hasOwnProperty.call(promptB, 'options'), false)
    assert.equal(promptA.statements.length, 4)

    const hashA = await computeQuestionContentHash('TRUE_FALSE', promptA)
    const hashB = await computeQuestionContentHash('TRUE_FALSE', promptB)
    assert.equal(hashA, independentHash('TRUE_FALSE', promptA))
    // Cùng stem nhưng mệnh đề khác -> hash phải khác.
    assert.equal(promptA.text, promptB.text)
    assert.notEqual(hashA, hashB)
  })

  await test('TRUE_FALSE legacy options: [] trong prompt cũ bị loại bỏ khi build lại', async () => {
    const legacy = tfQuestion({
      prompt: JSON.stringify({
        isInteractive: true,
        text: 'Cho hàm số y = x^3 - 3x. Xét tính đúng sai của các mệnh đề:',
        options: [],
        statements: [{ id: 'a', text: 'Mệnh đề A' }],
      }),
      statements: [{ id: 'a', text: 'Mệnh đề A' }],
    })
    const prompt = buildQuestionBankPrompt(legacy)
    assert.equal(Object.prototype.hasOwnProperty.call(prompt, 'options'), false)
    const hash = await computeQuestionContentHash('TRUE_FALSE', prompt)
    assert.equal(hash, independentHash('TRUE_FALSE', prompt))
    const stemOnly = await computeQuestionContentHash('TRUE_FALSE', {
      text: prompt.text,
      options: [],
    })
    assert.notEqual(hash, stemOnly)
  })

  await test('Câu trùng trong cùng Bài bị bỏ qua; cùng hash ở Bài khác vẫn được lưu', async () => {
    const taxonomy = makeTaxonomy()
    const duplicate = mcQuestion()
    const duplicatePrompt = buildQuestionBankPrompt(duplicate)
    const duplicateHash = independentHash('MULTIPLE_CHOICE', duplicatePrompt)
    const differentLessonHash = independentHash('MULTIPLE_CHOICE', buildQuestionBankPrompt(mcQuestion({
      prompt: JSON.stringify({ text: 'Câu khác ở bài khác', options: [{ id: 'A', text: 'X' }] }),
      options: [{ id: 'A', text: 'X' }],
    })))

    const adapter = makeAdapter(taxonomy, {
      existing: [
        { qb_lesson_id: 'l12', content_hash: duplicateHash },
        { qb_lesson_id: 'l11', content_hash: differentLessonHash },
      ],
    })
    const summary = await syncHomeworkQuestionsToConstantBank(adapter, {
      questions: [duplicate],
      dynamicLesson: dynamicLesson(),
      homeworkTitle: 'Kiểm tra chương 1',
    })
    assert.equal(summary.enabled, true)
    assert.equal(summary.createdCount, 0)
    assert.equal(summary.skippedDuplicateCount, 1)
    assert.equal(adapter.insertedRows.length, 0)
  })

  await test('Trùng lặp trong cùng batch chỉ ghi 1 câu', async () => {
    const adapter = makeAdapter(makeTaxonomy())
    const first = mcQuestion({ questionNumber: 1 })
    const second = mcQuestion({ questionNumber: 2 })
    const summary = await syncHomeworkQuestionsToConstantBank(adapter, {
      questions: [first, second],
      dynamicLesson: dynamicLesson(),
      homeworkTitle: 'Batch',
    })
    assert.equal(summary.createdCount, 1)
    assert.equal(summary.skippedDuplicateCount, 1)
    assert.equal(adapter.insertedRows.length, 1)
  })

  console.log('\n--- 5. Giữ metadata/ảnh/Đúng-Sai/đáp án/điểm ---')
  await test('Row giữ prompt true/false, ảnh, lời giải, đáp án, độ khó, điểm', async () => {
    const target = {
      classId: 'c12',
      chapterId: 'ch12',
      lessonId: 'l12',
      gradeBlock: '12-Toán',
      className: 'Toán 12 - Chuẩn',
      chapterTitle: 'Chương I: Ứng dụng đạo hàm',
      lessonTitle: 'Bài 1: Tính đơn điệu của hàm số',
    }
    const row = await buildQuestionBankRow(
      tfQuestion(),
      target,
      dynamicLesson(),
      't12-other',
      'Kiểm tra chương 1'
    )
    assert.equal(row.qb_lesson_id, 'l12')
    assert.equal(row.qb_question_type_id, 't12-other')
    assert.equal(row.question_type, 'TRUE_FALSE')
    assert.equal(row.difficulty, 'THONG_HIEU')
    assert.equal(row.points, 1)
    assert.deepEqual(row.tf_answers, { a: true, b: true, c: true, d: false })
    assert.equal(row.prompt.imageUrl, 'https://cdn.example.com/tf.png')
    assert.equal(row.prompt.statements.length, 4)
    assert.equal(Object.prototype.hasOwnProperty.call(row.prompt, 'options'), false)
    assert.equal(row.prompt.explanation, 'Dùng bảng biến thiên.')
    assert.equal(row.prompt.metadata.questionTypeTag, null)
    assert.equal(row.subject, 'TOAN')
    assert.equal(row.grade_level, 12)
  })

  await test('Prompt giữ metadata Dạng bài và ảnh của câu trắc nghiệm', () => {
    const prompt = buildQuestionBankPrompt(mcQuestion())
    assert.equal(prompt.imageUrl, 'https://cdn.example.com/mc.png')
    assert.equal(prompt.options.length, 4)
    assert.equal(prompt.metadata.questionTypeTag, 'Xét tính đơn điệu')
    assert.equal(prompt.difficulty, 'VAN_DUNG')
  })

  console.log('\n--- 5b. Guard metadata cấp câu với đích Constant ---')
  await test('Tag khớp canonical (kể cả chỉ số Chương/Bài) -> cho phép', () => {
    const target = constantTarget()
    const fullTags = mcQuestion({
      classTag: '12-Toán',
      gradeTag: 'Toán 12',
      subjectTag: 'Toán',
      chapterTag: 'Chương 1. Ứng dụng đạo hàm',
      lessonTag: 'Bài 1. Tính đơn điệu của hàm số',
    })
    assert.equal(resolveQuestionMetadataConflict(fullTags, target), null)

    const numberOnlyTags = mcQuestion({
      classTag: '12',
      chapterTag: 'Chương I',
      lessonTag: 'Bài 1',
    })
    assert.equal(resolveQuestionMetadataConflict(numberOnlyTags, target), null)

    // Không có tag nào -> không chặn.
    assert.equal(
      resolveQuestionMetadataConflict(
        mcQuestion({
          classTag: undefined,
          gradeTag: undefined,
          subjectTag: undefined,
          chapterTag: undefined,
          lessonTag: undefined,
        }),
        target
      ),
      null
    )
  })

  await test('Tag lệch Bài/Chương/Khối/Môn -> lý do tiếng Việt, không lọt', () => {
    const target = constantTarget()
    assert.match(
      resolveQuestionMetadataConflict(mcQuestion({ lessonTag: 'Bài 2: Cực trị của hàm số' }), target),
      /Bài học/
    )
    assert.match(
      resolveQuestionMetadataConflict(mcQuestion({ chapterTag: 'Chương 2: Hàm số mũ và lôgarit' }), target),
      /Chương/
    )
    assert.match(
      resolveQuestionMetadataConflict(mcQuestion({ gradeTag: '11' }), target),
      /Khối/
    )
    assert.match(
      resolveQuestionMetadataConflict(mcQuestion({ classTag: '11-Hóa', gradeTag: undefined }), target),
      /Khối\/Lớp/
    )
    assert.match(
      resolveQuestionMetadataConflict(mcQuestion({ subjectTag: 'Hóa' }), target),
      /Môn/
    )

    // Cùng khối/môn nhưng tag trỏ đúng tên một Lớp Constant khác -> xung đột.
    const classes = [
      ...makeTaxonomy().classes,
      { id: 'c12adv', name: 'Toán 12 - Nâng cao', grade_block: '12-Toán' },
    ]
    assert.match(
      resolveQuestionMetadataConflict(
        mcQuestion({ classTag: 'Toán 12 - Nâng cao', gradeTag: undefined }),
        target,
        classes
      ),
      /Lớp Constant/
    )

    // Tag nằm trong prompt.metadata (dữ liệu Markdown cũ) cũng phải được guard.
    assert.match(
      resolveQuestionMetadataConflict(
        mcQuestion({
          lessonTag: undefined,
          prompt: JSON.stringify({
            text: 'Câu có metadata lồng',
            options: [{ id: 'A', text: 'A' }],
            metadata: { lessonTag: 'Bài 2: Cực trị của hàm số' },
          }),
        }),
        target
      ),
      /Bài học/
    )

    // "Chương 1" được phép, nhưng "Chương 10" không được khớp nhầm bằng substring.
    assert.equal(
      resolveQuestionMetadataConflict(mcQuestion({ chapterTag: 'Chương 1' }), target),
      null
    )
    assert.match(
      resolveQuestionMetadataConflict(mcQuestion({ chapterTag: 'Chương 10' }), target),
      /Chương/
    )
  })

  await test('Batch 4 câu: chỉ câu metadata hợp lệ được ghi, câu lệch không lây', async () => {
    const adapter = makeAdapter(makeTaxonomy())
    const makePrompt = (text) =>
      JSON.stringify({ text, options: [{ id: 'A', text: 'Đáp án A' }] })
    const valid = mcQuestion({
      questionNumber: 1,
      prompt: makePrompt('Câu hợp lệ'),
      options: [{ id: 'A', text: 'Đáp án A' }],
      lessonTag: 'Bài 1',
      chapterTag: 'Chương 1',
    })
    const wrongLesson = mcQuestion({
      questionNumber: 2,
      prompt: makePrompt('Câu lệch bài'),
      options: [{ id: 'A', text: 'Đáp án A' }],
      lessonTag: 'Bài 2: Cực trị của hàm số',
    })
    const wrongChapter = mcQuestion({
      questionNumber: 3,
      prompt: makePrompt('Câu lệch chương'),
      options: [{ id: 'A', text: 'Đáp án A' }],
      chapterTag: 'Chương 2: Hàm số mũ và lôgarit',
    })
    const wrongGrade = mcQuestion({
      questionNumber: 4,
      prompt: makePrompt('Câu lệch khối'),
      options: [{ id: 'A', text: 'Đáp án A' }],
      gradeTag: '11',
      classTag: undefined,
    })

    const summary = await syncHomeworkQuestionsToConstantBank(adapter, {
      questions: [valid, wrongLesson, wrongChapter, wrongGrade],
      dynamicLesson: dynamicLesson(),
      homeworkTitle: 'Guard metadata',
    })

    assert.equal(summary.totalQuestions, 4)
    assert.equal(summary.createdCount, 1)
    assert.equal(summary.unsyncedCount, 3)
    assert.equal(summary.skippedDuplicateCount, 0)
    assert.equal(adapter.insertedRows.length, 1)
    assert.equal(adapter.insertedRows[0].prompt.text, 'Câu hợp lệ')
    assert.deepEqual(
      summary.reasons.map((r) => r.questionNumber).sort(),
      [2, 3, 4]
    )
    assert.match(summary.reasons[0].reason, /Bài học/)
    assert.match(summary.reasons[1].reason, /Chương/)
    assert.match(summary.reasons[2].reason, /Khối/)
  })

  await test('Câu trùng nội dung nhưng một tag lệch -> unsynced, không tính nhầm duplicate', async () => {
    const adapter = makeAdapter(makeTaxonomy())
    const valid = mcQuestion({ questionNumber: 1, lessonTag: 'Bài 1' })
    const conflicted = mcQuestion({
      questionNumber: 2,
      lessonTag: 'Bài 2: Cực trị của hàm số',
    })

    const summary = await syncHomeworkQuestionsToConstantBank(adapter, {
      questions: [valid, conflicted],
      dynamicLesson: dynamicLesson(),
      homeworkTitle: 'Trùng nội dung',
    })

    assert.equal(summary.createdCount, 1)
    assert.equal(summary.unsyncedCount, 1)
    assert.equal(summary.skippedDuplicateCount, 0)
    assert.equal(adapter.insertedRows.length, 1)
    assert.equal(summary.reasons[0].questionNumber, 2)
    assert.match(summary.reasons[0].reason, /Bài học/)
  })

  console.log('\n--- 5c. Fallback động khi thiếu Constant (metadata từng câu là nguồn taxonomy) ---')
  await test('Ví dụ Toán-11 không có Constant: lưu row động đúng Khối/Môn + raw metadata', async () => {
    const question = question11MathExample()
    const adapter = makeAdapter(taxonomyWithoutMath11())
    const summary = await syncHomeworkQuestionsToConstantBank(adapter, {
      questions: [question],
      dynamicLesson: dynamicLesson11Math(),
      homeworkTitle: 'Lượng giác 11',
    })

    assert.equal(summary.totalQuestions, 1)
    assert.equal(summary.createdCount, 1)
    assert.equal(summary.unsyncedCount, 0)
    assert.equal(summary.failedCount, 0)
    assert.equal(summary.target, null)
    assert.equal(adapter.insertedRows.length, 1)
    assert.ok(adapter.calls.dynamicExisting > 0, 'phải kiểm tra hash động theo grade_block')

    const row = adapter.insertedRows[0]
    assert.equal(row.grade_block, 'Toán-11', 'giữ đúng grade_block của lớp động để bộ lọc ngân hàng tìm thấy')
    assert.equal(row.grade_level, 11)
    assert.equal(row.subject, 'TOAN')
    assert.equal(row.qb_class_id, null)
    assert.equal(row.qb_chapter_id, null)
    assert.equal(row.qb_lesson_id, null)
    assert.equal(row.qb_question_type_id, null)
    // Metadata khớp đầy đủ bài học động -> được gắn id động đã xác minh.
    assert.equal(row.class_id, 'dyn-class-11')
    assert.equal(row.chapter_id, 'dyn-chapter-11')
    assert.equal(row.lesson_id, 'dyn-lesson-11a1')
    assert.equal(row.source_dynamic_lesson_id, 'dyn-lesson-11a1')

    assert.equal(row.prompt.metadata.classTag, '11')
    assert.equal(row.prompt.metadata.gradeTag, '11')
    assert.equal(row.prompt.metadata.subjectTag, 'Toán')
    assert.equal(
      row.prompt.metadata.chapterTag,
      'Chương I. Hàm số lượng giác và phương trình lượng giác'
    )
    assert.equal(
      row.prompt.metadata.lessonTag,
      'Bài 1. Giá trị lượng giác của góc lượng giác'
    )
    assert.equal(row.prompt.metadata.questionTypeTag, 'Đổi đơn vị đo góc (độ – radian)')
    assert.equal(row.content_hash, independentHash('MULTIPLE_CHOICE', row.prompt))
  })

  await test('[LỚP: 11] với hai Lớp Constant cùng khối: lưu theo metadata, không chọn lớp ngẫu nhiên', async () => {
    const taxonomy = makeTaxonomy({
      classes: [
        { id: 'c11a', name: '11', grade_block: '11-Toán' },
        { id: 'c11b', name: '11', grade_block: '11-Toán' },
      ],
    })
    const adapter = makeAdapter(taxonomy)
    const summary = await syncHomeworkQuestionsToConstantBank(adapter, {
      questions: [question11MathExample()],
      dynamicLesson: dynamicLesson11Math(),
      homeworkTitle: 'Mơ hồ',
    })
    assert.equal(summary.createdCount, 1)
    assert.equal(summary.unsyncedCount, 0)
    assert.equal(summary.target, null)
    assert.equal(adapter.insertedRows.length, 1)
    assert.equal(adapter.insertedRows[0].grade_block, 'Toán-11')
    assert.equal(adapter.insertedRows[0].qb_class_id, null)
    assert.equal(adapter.insertedRows[0].qb_lesson_id, null)
    assert.equal(adapter.insertedRows[0].prompt.metadata.classTag, '11')
  })

  await test('Tên lớp Constant cụ thể bị trùng: không đoán và không ghi nhánh động', async () => {
    const adapter = makeAdapter(makeTaxonomy({
      classes: [
        { id: 'c11a', name: '11A', grade_block: '11-Toán' },
        { id: 'c11b', name: '11A', grade_block: '11-Toán' },
      ],
    }))
    const summary = await syncHomeworkQuestionsToConstantBank(adapter, {
      questions: [question11MathExample({ classTag: '11A' })],
      dynamicLesson: dynamicLesson11Math(),
    })
    assert.equal(summary.createdCount, 0)
    assert.equal(summary.unsyncedCount, 1)
    assert.match(summary.reasons[0].reason, /khớp nhiều Lớp Constant/)
    assert.equal(adapter.insertedRows.length, 0)
  })

  await test('questionTypeTag nằm trong prompt.metadata vẫn được dùng (không fallback "Khác")', async () => {
    const question = mcQuestion({
      questionNumber: 1,
      prompt: JSON.stringify({
        text: 'Câu có Dạng bài lồng trong metadata',
        options: [{ id: 'A', text: 'Đáp án A' }],
        metadata: { questionTypeTag: 'Xét tính đơn điệu' },
      }),
      options: [{ id: 'A', text: 'Đáp án A' }],
      questionTypeTag: undefined,
    })
    const adapter = makeAdapter(makeTaxonomy())
    const summary = await syncHomeworkQuestionsToConstantBank(adapter, {
      questions: [question],
      dynamicLesson: dynamicLesson(),
      homeworkTitle: 'Metadata lồng',
    })

    assert.equal(summary.createdCount, 1)
    assert.equal(summary.fallbackTypeCount, 0)
    assert.equal(adapter.insertedRows[0].qb_question_type_id, 't12-monotonic')
    assert.equal(adapter.insertedRows[0].prompt.metadata.questionTypeTag, 'Xét tính đơn điệu')
  })

  await test('Batch trộn Lớp/Môn/Chương/Bài: mỗi câu resolve độc lập, không lây đích', async () => {
    const makePrompt = (text) =>
      JSON.stringify({ text, options: [{ id: 'A', text: 'Đáp án A' }] })
    const makeQ = (questionNumber, text, overrides) =>
      mcQuestion({
        questionNumber,
        prompt: makePrompt(text),
        content: text,
        options: [{ id: 'A', text: 'Đáp án A' }],
        ...overrides,
      })

    const q11Dynamic = question11MathExample({ questionNumber: 1 })
    const q12Toan = makeQ(2, 'Câu Toán 12 Constant', {
      classTag: '12',
      gradeTag: '12',
      subjectTag: 'Toán',
      chapterTag: 'Chương I: Ứng dụng đạo hàm',
      lessonTag: 'Bài 1: Tính đơn điệu của hàm số',
      questionTypeTag: 'Xét tính đơn điệu',
    })
    const q12Hoa = makeQ(3, 'Câu Hóa 12 Constant', {
      classTag: '12',
      gradeTag: '12',
      subjectTag: 'Hóa',
      chapterTag: 'Chương 1: Este - Lipit',
      lessonTag: 'Bài 1: Este',
      questionTypeTag: 'Khác',
    })
    const q11OtherLesson = makeQ(4, 'Câu 11 Toán khác bài động', {
      classTag: 'Toán-11',
      gradeTag: '11',
      subjectTag: 'Toán',
      chapterTag: 'Chương II. Tổ hợp và xác suất',
      lessonTag: 'Bài 1. Quy tắc cộng và quy tắc nhân',
      questionTypeTag: 'Quy tắc đếm',
    })

    const adapter = makeAdapter(taxonomyWithoutMath11())
    const summary = await syncHomeworkQuestionsToConstantBank(adapter, {
      questions: [q11Dynamic, q12Toan, q12Hoa, q11OtherLesson],
      dynamicLesson: dynamicLesson11Math(),
      homeworkTitle: 'Batch trộn',
    })

    assert.equal(summary.createdCount, 4)
    assert.equal(summary.unsyncedCount, 0)
    assert.equal(summary.failedCount, 0)
    assert.equal(adapter.insertedRows.length, 4)

    const byText = new Map(adapter.insertedRows.map((row) => [row.prompt.text, row]))
    assert.equal(byText.get('Đổi 150° sang radian.').grade_block, 'Toán-11')
    assert.equal(byText.get('Đổi 150° sang radian.').qb_lesson_id, null)
    assert.equal(byText.get('Đổi 150° sang radian.').lesson_id, 'dyn-lesson-11a1')

    assert.equal(byText.get('Câu Toán 12 Constant').grade_block, '12-Toán')
    assert.equal(byText.get('Câu Toán 12 Constant').qb_lesson_id, 'l12')
    assert.equal(byText.get('Câu Toán 12 Constant').qb_question_type_id, 't12-monotonic')
    // Không gắn id động 11-Toán của bài tập vào câu Constant 12-Toán.
    assert.equal(byText.get('Câu Toán 12 Constant').class_id, null)
    assert.equal(byText.get('Câu Toán 12 Constant').lesson_id, null)

    assert.equal(byText.get('Câu Hóa 12 Constant').grade_block, '12-Hóa')
    assert.equal(byText.get('Câu Hóa 12 Constant').qb_lesson_id, 'l12hoa')
    assert.equal(byText.get('Câu Hóa 12 Constant').qb_question_type_id, 't12hoa-other')
    assert.equal(byText.get('Câu Hóa 12 Constant').class_id, null)
    assert.equal(byText.get('Câu Hóa 12 Constant').lesson_id, null)

    // Metadata 11-Toán hợp lệ nhưng không khớp bài học động: lưu động, KHÔNG gắn id động.
    const other = byText.get('Câu 11 Toán khác bài động')
    assert.equal(other.grade_block, 'Toán-11')
    assert.equal(other.qb_lesson_id, null)
    assert.equal(other.class_id, null)
    assert.equal(other.chapter_id, null)
    assert.equal(other.lesson_id, null)
    assert.equal(other.source_dynamic_lesson_id, null)
    assert.equal(other.prompt.metadata.chapterTag, 'Chương II. Tổ hợp và xác suất')
  })

  await test('Thiếu Lớp hoặc Môn -> unsynced, không fallback Khối 12', async () => {
    const makePrompt = (text) => JSON.stringify({ text, options: [{ id: 'A', text: 'A' }] })
    const onlyGrade = mcQuestion({
      questionNumber: 1,
      prompt: makePrompt('Chỉ có lớp 11'),
      options: [{ id: 'A', text: 'A' }],
      classTag: undefined,
      gradeTag: '11',
      subjectTag: undefined,
      chapterTag: 'Chương I. Hàm số lượng giác',
      lessonTag: 'Bài 1. Giá trị lượng giác của góc lượng giác',
    })
    const onlySubject = mcQuestion({
      questionNumber: 2,
      prompt: makePrompt('Chỉ có môn Toán'),
      options: [{ id: 'A', text: 'A' }],
      classTag: undefined,
      gradeTag: undefined,
      subjectTag: 'Toán',
      chapterTag: 'Chương I. Hàm số lượng giác',
      lessonTag: 'Bài 1. Giá trị lượng giác của góc lượng giác',
    })
    const noIdentity = mcQuestion({
      questionNumber: 3,
      prompt: makePrompt('Không có Lớp/Môn'),
      options: [{ id: 'A', text: 'A' }],
      classTag: undefined,
      gradeTag: undefined,
      subjectTag: undefined,
      chapterTag: 'Chương I. Hàm số lượng giác',
      lessonTag: 'Bài 1. Giá trị lượng giác của góc lượng giác',
    })

    const adapter = makeAdapter(taxonomyWithoutMath11())
    const summary = await syncHomeworkQuestionsToConstantBank(adapter, {
      questions: [onlyGrade, onlySubject, noIdentity],
      dynamicLesson: dynamicLesson11Math(),
      homeworkTitle: 'Thiếu metadata',
    })

    assert.equal(summary.createdCount, 0)
    assert.equal(summary.unsyncedCount, 3)
    assert.equal(summary.failedCount, 0)
    assert.equal(adapter.insertedRows.length, 0)
    assert.match(summary.reasons[0].reason, /thiếu metadata \[MÔN\]/i)
    assert.match(summary.reasons[1].reason, /thiếu metadata \[LỚP\]/i)
    assert.match(summary.reasons[2].reason, /thiếu metadata \[LỚP\] và \[MÔN\]/i)
    for (const reason of summary.reasons) {
      assert.doesNotMatch(reason.reason, /12-Toán|grade 12|lớp 12/i)
    }
  })

  await test('Metadata mâu thuẫn Lớp/Môn -> unsynced, không ghi DB', async () => {
    const makePrompt = (text) => JSON.stringify({ text, options: [{ id: 'A', text: 'A' }] })
    const gradeConflict = mcQuestion({
      questionNumber: 1,
      prompt: makePrompt('Lớp mâu thuẫn'),
      options: [{ id: 'A', text: 'A' }],
      classTag: '11',
      gradeTag: '12',
      subjectTag: 'Toán',
    })
    const subjectConflict = mcQuestion({
      questionNumber: 2,
      prompt: makePrompt('Môn mâu thuẫn'),
      options: [{ id: 'A', text: 'A' }],
      classTag: '11-Toán',
      gradeTag: '11',
      subjectTag: 'Hóa',
    })
    const ambiguousSubject = mcQuestion({
      questionNumber: 3,
      prompt: makePrompt('Môn mơ hồ'),
      options: [{ id: 'A', text: 'A' }],
      classTag: undefined,
      gradeTag: '11',
      subjectTag: 'Toán và Hóa',
    })

    const adapter = makeAdapter(taxonomyWithoutMath11())
    const summary = await syncHomeworkQuestionsToConstantBank(adapter, {
      questions: [gradeConflict, subjectConflict, ambiguousSubject],
      dynamicLesson: dynamicLesson11Math(),
      homeworkTitle: 'Mâu thuẫn metadata',
    })

    assert.equal(summary.createdCount, 0)
    assert.equal(summary.unsyncedCount, 3)
    assert.equal(adapter.insertedRows.length, 0)
    assert.match(summary.reasons[0].reason, /Lớp\/Khối mâu thuẫn/)
    assert.match(summary.reasons[1].reason, /Môn mâu thuẫn/)
    assert.match(summary.reasons[2].reason, /vừa có Toán vừa có Hóa/)
  })

  await test('Chỉ gắn id động khi metadata khớp canonical Khối/Môn + đúng Chương/Bài', () => {
    const tags = extractQuestionTaxonomyTags(question11MathExample())
    const classification = classifyQuestionTaxonomy(tags)
    assert.equal(classification.success, true)
    assert.equal(classification.gradeBlock, '11-Toán')
    assert.equal(canonicalGradeBlock('Toán-11'), canonicalGradeBlock(classification.gradeBlock))

    const matched = resolveDynamicHierarchyForMetadata(tags, dynamicLesson11Math(), classification)
    assert.equal(matched.matched, true)
    assert.equal(matched.ids.classId, 'dyn-class-11')
    assert.equal(matched.ids.lessonId, 'dyn-lesson-11a1')

    // Bài học động 12-Toán không được gắn cho câu metadata 11-Toán.
    const wrongBlock = resolveDynamicHierarchyForMetadata(tags, dynamicLesson(), classification)
    assert.equal(wrongBlock.matched, false)
    assert.equal(wrongBlock.ids, null)

    const wrongLessonTags = extractQuestionTaxonomyTags(
      question11MathExample({ lessonTag: 'Bài 2. Công thức lượng giác' })
    )
    const wrongLesson = resolveDynamicHierarchyForMetadata(
      wrongLessonTags,
      dynamicLesson11Math(),
      classifyQuestionTaxonomy(wrongLessonTags)
    )
    assert.equal(wrongLesson.matched, false)
    assert.equal(wrongLesson.ids, null)
  })

  await test('Dedup động theo (grade_block, content_hash) + qb_lesson_id NULL; khác khối không chặn', async () => {
    const question = question11MathExample()
    const prompt = buildQuestionBankPrompt(question)
    const hash = independentHash('MULTIPLE_CHOICE', prompt)

    const skippedAdapter = makeAdapter(taxonomyWithoutMath11(), {
      dynamicExisting: [{ grade_block: '11-Toán', qb_lesson_id: null, content_hash: hash }],
    })
    const skipped = await syncHomeworkQuestionsToConstantBank(skippedAdapter, {
      questions: [question],
      dynamicLesson: dynamicLesson11Math(),
      homeworkTitle: 'Dedup động',
    })
    assert.equal(skipped.createdCount, 0)
    assert.equal(skipped.skippedDuplicateCount, 1)
    assert.equal(skippedAdapter.insertedRows.length, 0)

    // Dữ liệu cũ có thể lưu Khối theo thứ tự "Toán-11": vẫn phải dedup với canonical.
    const legacyOrderAdapter = makeAdapter(taxonomyWithoutMath11(), {
      dynamicExisting: [{ grade_block: 'Toán-11', qb_lesson_id: null, content_hash: hash }],
    })
    const legacyOrder = await syncHomeworkQuestionsToConstantBank(legacyOrderAdapter, {
      questions: [question],
      dynamicLesson: dynamicLesson11Math(),
      homeworkTitle: 'Dedup thứ tự khối cũ',
    })
    assert.equal(legacyOrder.createdCount, 0)
    assert.equal(legacyOrder.skippedDuplicateCount, 1)
    assert.equal(legacyOrderAdapter.insertedRows.length, 0)

    const otherBlockAdapter = makeAdapter(taxonomyWithoutMath11(), {
      dynamicExisting: [{ grade_block: '12-Toán', qb_lesson_id: null, content_hash: hash }],
    })
    const otherBlock = await syncHomeworkQuestionsToConstantBank(otherBlockAdapter, {
      questions: [question],
      dynamicLesson: dynamicLesson11Math(),
      homeworkTitle: 'Dedup khác khối',
    })
    assert.equal(otherBlock.createdCount, 1)
    assert.equal(otherBlock.skippedDuplicateCount, 0)
    assert.equal(otherBlockAdapter.insertedRows.length, 1)
  })

  await test('Trùng trong batch động chỉ ghi 1; race duplicate -> skipped, không báo tạo giả', async () => {
    const first = question11MathExample({ questionNumber: 1 })
    const second = question11MathExample({ questionNumber: 2 })

    const batchAdapter = makeAdapter(taxonomyWithoutMath11())
    const batch = await syncHomeworkQuestionsToConstantBank(batchAdapter, {
      questions: [first, second],
      dynamicLesson: dynamicLesson11Math(),
      homeworkTitle: 'Batch động',
    })
    assert.equal(batch.createdCount, 1)
    assert.equal(batch.skippedDuplicateCount, 1)
    assert.equal(batchAdapter.insertedRows.length, 1)

    const prompt = buildQuestionBankPrompt(first)
    const hash = independentHash('MULTIPLE_CHOICE', prompt)
    const raceAdapter = makeAdapter(taxonomyWithoutMath11(), {
      raceDuplicateHashes: [hash],
    })
    const race = await syncHomeworkQuestionsToConstantBank(raceAdapter, {
      questions: [first],
      dynamicLesson: dynamicLesson11Math(),
      homeworkTitle: 'Race động',
    })
    assert.equal(race.createdCount, 0)
    assert.equal(race.skippedDuplicateCount, 1)
    assert.equal(race.failedCount, 0)
    assert.equal(raceAdapter.insertedRows.length, 0)
  })

  await test('Lỗi DB khi ghi row động -> failed chính xác, không false success', async () => {
    const adapter = makeAdapter(taxonomyWithoutMath11(), {
      insertError: { message: 'connection reset by peer', code: '08006' },
    })
    const summary = await syncHomeworkQuestionsToConstantBank(adapter, {
      questions: [question11MathExample()],
      dynamicLesson: dynamicLesson11Math(),
      homeworkTitle: 'Lỗi động',
    })
    assert.equal(summary.createdCount, 0)
    assert.equal(summary.skippedDuplicateCount, 0)
    assert.equal(summary.failedCount, 1)
    assert.match(summary.reasons[0].reason, /Lỗi ghi Ngân hàng câu hỏi/)
  })

  await test('Summary batch trộn: created/skipped/unsynced/failed độc lập từng câu', async () => {
    const dynamicQuestion = question11MathExample({ questionNumber: 1 })
    const duplicateDynamic = question11MathExample({ questionNumber: 2 })
    const contradiction = question11MathExample({
      questionNumber: 3,
      prompt: JSON.stringify({ text: 'Câu mâu thuẫn', options: [{ id: 'A', text: 'A' }] }),
      content: 'Câu mâu thuẫn',
      options: [{ id: 'A', text: 'A' }],
      classTag: '11',
      gradeTag: '12',
    })
    const constantQuestion = mcQuestion({
      questionNumber: 4,
      prompt: JSON.stringify({ text: 'Câu Constant đã có', options: [{ id: 'A', text: 'A' }] }),
      options: [{ id: 'A', text: 'A' }],
      classTag: '12',
      gradeTag: '12',
      subjectTag: 'Toán',
      chapterTag: 'Chương I: Ứng dụng đạo hàm',
      lessonTag: 'Bài 1: Tính đơn điệu của hàm số',
      questionTypeTag: 'Xét tính đơn điệu',
    })
    const constantHash = independentHash(
      'MULTIPLE_CHOICE',
      buildQuestionBankPrompt(constantQuestion)
    )

    const adapter = makeAdapter(taxonomyWithoutMath11(), {
      existing: [{ qb_lesson_id: 'l12', content_hash: constantHash }],
    })
    const summary = await syncHomeworkQuestionsToConstantBank(adapter, {
      questions: [dynamicQuestion, duplicateDynamic, contradiction, constantQuestion],
      dynamicLesson: dynamicLesson11Math(),
      homeworkTitle: 'Summary trộn',
    })

    assert.equal(summary.totalQuestions, 4)
    assert.equal(summary.createdCount, 1)
    assert.equal(summary.skippedDuplicateCount, 2)
    assert.equal(summary.unsyncedCount, 1)
    assert.equal(summary.failedCount, 0)
    assert.equal(adapter.insertedRows.length, 1)
    assert.equal(adapter.insertedRows[0].grade_block, 'Toán-11')
    assert.equal(summary.target, null, 'batch trộn Constant/động không được báo một Bài Constant duy nhất')
  })

  console.log('\n--- 6. Source flag & summary lỗi (không báo thành công giả) ---')
  await test('Nhiều "Khác" trong bài -> sync unsynced, không ghi DB', async () => {
    const taxonomy = makeTaxonomy({
      questionTypes: [
        { id: 't12-other', lesson_id: 'l12', name: 'Khác' },
        { id: 't12-other-2', lesson_id: 'l12', name: 'khác' },
      ],
    })
    const adapter = makeAdapter(taxonomy)
    const summary = await syncHomeworkQuestionsToConstantBank(adapter, {
      questions: [
        mcQuestion({ questionTypeTag: undefined }),
        tfQuestion({ questionTypeTag: undefined }),
      ],
      dynamicLesson: dynamicLesson(),
      homeworkTitle: 'Khác mơ hồ',
    })
    assert.equal(summary.unsyncedCount, 2)
    assert.equal(summary.createdCount, 0)
    assert.equal(adapter.insertedRows.length, 0)
    assert.match(summary.reasons[0].reason, /Dạng bài "Khác" trùng chuẩn hóa/)
  })

  await test('PDF manual / caller cũ không có source -> không đồng bộ', async () => {
    const adapter = makeAdapter(makeTaxonomy())
    const summary = await syncHomeworkQuestionsToConstantBank(adapter, {
      questions: [mcQuestion({ source: undefined })],
      dynamicLesson: dynamicLesson(),
      homeworkTitle: 'PDF',
    })
    assert.equal(summary.enabled, false)
    assert.equal(summary.createdCount, 0)
    assert.equal(adapter.calls.classes, 0)
  })

  await test('Không map được Constant -> tất cả unsynced kèm lý do, không ghi DB', async () => {
    const adapter = makeAdapter(makeTaxonomy({
      classes: [{ id: 'c12hoa', name: 'Hóa 12', grade_block: '12-Hóa' }],
    }))
    const summary = await syncHomeworkQuestionsToConstantBank(adapter, {
      questions: [mcQuestion(), tfQuestion()],
      dynamicLesson: dynamicLesson(),
      homeworkTitle: 'Lệch khối',
    })
    assert.equal(summary.createdCount, 0)
    assert.equal(summary.unsyncedCount, 2)
    assert.match(summary.reasons[0].reason, /Không có Lớp Constant/)
    assert.equal(adapter.insertedRows.length, 0)
  })

  await test('Lỗi ghi DB -> failed summary, giữ reasons, không throw', async () => {
    const adapter = makeAdapter(makeTaxonomy(), {
      insertError: { message: 'permission denied for table question_bank', code: '42501' },
    })
    const summary = await syncHomeworkQuestionsToConstantBank(adapter, {
      questions: [mcQuestion(), tfQuestion()],
      dynamicLesson: dynamicLesson(),
      homeworkTitle: 'Lỗi ghi',
    })
    assert.equal(summary.createdCount, 0)
    assert.equal(summary.failedCount, 2)
    assert.equal(summary.unsyncedCount, 0)
    assert.match(summary.reasons[0].reason, /Lỗi ghi Ngân hàng câu hỏi/)
    assert.equal(summary.target.lessonId, 'l12')
  })

  await test('Không tin qbQuestionTypeId do FE gửi: không tag thì dùng "Khác"', async () => {
    const adapter = makeAdapter(makeTaxonomy())
    const summary = await syncHomeworkQuestionsToConstantBank(adapter, {
      questions: [mcQuestion({ questionTypeTag: undefined, qbQuestionTypeId: 'tampered-type-id' })],
      dynamicLesson: dynamicLesson(),
      homeworkTitle: 'Tampered',
    })
    assert.equal(summary.createdCount, 1)
    assert.equal(summary.fallbackTypeCount, 1)
    assert.equal(adapter.insertedRows[0].qb_question_type_id, 't12-other')
  })

  console.log('\n--- 7. Invariant backend: await sync, không fire-and-forget ---')
  await test('Query hash động đúng phạm vi grade_block + qb_lesson_id IS NULL', () => {
    const source = readFileSync(
      join(ROOT, 'functions', 'create-homework', 'auto-bank-sync.ts'),
      'utf8'
    )
    assert.match(
      source,
      /\.eq\('grade_block', gradeBlock\)\s*\.is\('qb_lesson_id', null\)\s*\.in\('content_hash', hashes\)/
    )
    assert.match(source, /uq_qb_dynamic_block_hash/)
    // Không tự tạo taxonomy Constant trong luồng sync.
    assert.doesNotMatch(source, /from\('qb_(classes|chapters|lessons|question_types)'\)\.insert/)
  })

  await test('POST create-homework await sync và trả autoBankSync', () => {
    assert.match(FN_SRC, /await syncHomeworkQuestionsToConstantBank/)
    assert.doesNotMatch(FN_SRC, /EdgeRuntime\.waitUntil\(syncQbTask\)/)
    assert.match(FN_SRC, /autoBankSync,/)
    assert.doesNotMatch(FN_SRC, /subject: 'TOAN'[\s\S]{0,80}grade_level: 12/)
  })

  await test('POST chỉ đồng bộ khi có câu source MARKDOWN_INTERACTIVE', () => {
    assert.match(
      FN_SRC,
      /const interactiveQuestions = questions\.filter\(\(q: any\) => q\.source === 'MARKDOWN_INTERACTIVE'\)/
    )
    assert.match(FN_SRC, /if \(interactiveQuestions\.length > 0\) \{/)
    // Không còn try/catch sync vô điều kiện ngay sau khi khai báo autoBankSync.
    assert.doesNotMatch(FN_SRC, /let autoBankSync: any = null\s*\n\s*try \{/)
    // Summary lỗi chỉ đếm câu interactive, không gộp PDF/manual trong batch hỗn hợp.
    assert.match(FN_SRC, /failedCount: interactiveQuestions\.length/)
  })

  await test('Update flow cũng sync idempotent và trả autoBankSync', () => {
    assert.match(FN_SRC, /source === 'MARKDOWN_INTERACTIVE'/)
    assert.match(FN_SRC, /autoBankSync,\n\s*message: 'Homework updated successfully'/)
  })

  console.log(`\nKết quả: ${passed} passed, ${failed} failed`)
  if (failed > 0) process.exitCode = 1
}

run()
