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
  buildQuestionBankPrompt,
  buildQuestionBankRow,
  canonicalGradeBlock,
  computeQuestionContentHash,
  resolveConstantLessonForDynamic,
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
  const insertError = options.insertError || null
  const adapter = {
    insertedRows: [],
    calls: { classes: 0, chapters: 0, lessons: 0, types: 0, existing: 0, insert: 0 },
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
    async insertRows(rows) {
      adapter.calls.insert++
      if (insertError) return { error: insertError }
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
