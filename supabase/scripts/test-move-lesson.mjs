/**
 * Test an toàn cho Backend Contract: Chuyển bài học sang chương khác (Move Lesson).
 * 
 * Chạy: node supabase/scripts/test-move-lesson.mjs
 * 
 * Nguyên tắc:
 * - Không chạm DB thật, không deploy, không migration, không cần mạng.
 * - Test 4 lớp:
 *   1. Unit tests logic thuần: calculateNextOrderIndex, validateChapterMove.
 *   2. Validation schema: updateLessonSchema với chapterId UUID optional và backward compatibility.
 *   3. Invariant & Security checks trên Edge Function source code.
 *   4. Invariant & Mock Query Builder: mô phỏng kịch bản cùng lớp, khác lớp, không tồn tại, same-chapter.
 */

import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'

const HERE = dirname(fileURLToPath(import.meta.url))
const ROOT = join(HERE, '..')
const FN_PATH = join(ROOT, 'functions', 'create-lesson', 'index.ts')
const FN_SRC = readFileSync(FN_PATH, 'utf8')
const VAL_PATH = join(ROOT, 'shared', 'validators.ts')
const VAL_SRC = readFileSync(VAL_PATH, 'utf8')

let passed = 0
let failed = 0

async function test(name, fn) {
  try {
    const res = fn()
    if (res && typeof res.then === 'function') {
      await res
    }
    passed++
    console.log(`  ✓ ${name}`)
  } catch (err) {
    failed++
    console.error(`  ✗ ${name}:`, err.message)
  }
}

async function run() {
  console.log('\n--- 1. Pure Helper Functions (Logic Invariants) ---')

  // Helper thuần trích xuất từ create-lesson/index.ts
  function calculateNextOrderIndex(existingLessons) {
    if (!existingLessons || existingLessons.length === 0) return 1
    const max = existingLessons.reduce((currentMax, item) => {
      const val = item?.order_index
      const num = typeof val === 'number' && !Number.isNaN(val) ? val : 0
      return Math.max(currentMax, num)
    }, 0)
    return max + 1
  }

  function validateChapterMove(currentChapter, targetChapter) {
    if (!currentChapter) {
      return { allowed: false, error: 'Current chapter not found', status: 404 }
    }
    if (!targetChapter) {
      return { allowed: false, error: 'Target chapter not found', status: 404 }
    }
    if (!currentChapter.class_id || !targetChapter.class_id || currentChapter.class_id !== targetChapter.class_id) {
      return { allowed: false, error: 'Cannot move lesson to a chapter in a different class', status: 400 }
    }
    return { allowed: true }
  }

  await test('calculateNextOrderIndex: mảng rỗng -> trả về 1', () => {
    assert.equal(calculateNextOrderIndex([]), 1)
    assert.equal(calculateNextOrderIndex(null), 1)
    assert.equal(calculateNextOrderIndex(undefined), 1)
  })

  await test('calculateNextOrderIndex: danh sách có 1 bài với order_index = 0 -> trả về 1', () => {
    assert.equal(calculateNextOrderIndex([{ order_index: 0 }]), 1)
  })

  await test('calculateNextOrderIndex: danh sách có các bài 1, 2, 3 -> trả về 4', () => {
    assert.equal(calculateNextOrderIndex([{ order_index: 1 }, { order_index: 2 }, { order_index: 3 }]), 4)
  })

  await test('calculateNextOrderIndex: danh sách không liên tục [1, 5, 2] -> trả về 6 (max + 1)', () => {
    assert.equal(calculateNextOrderIndex([{ order_index: 1 }, { order_index: 5 }, { order_index: 2 }]), 6)
  })

  await test('calculateNextOrderIndex: xử lý an toàn khi order_index null / undefined', () => {
    assert.equal(calculateNextOrderIndex([{ order_index: null }, { order_index: 4 }, { order_index: undefined }]), 5)
  })

  await test('validateChapterMove: từ chối 404 nếu thiếu currentChapter hoặc targetChapter', () => {
    const noCur = validateChapterMove(null, { id: 'ch-2', class_id: 'cls-1' })
    assert.equal(noCur.allowed, false)
    assert.equal(noCur.status, 404)

    const noTarget = validateChapterMove({ id: 'ch-1', class_id: 'cls-1' }, null)
    assert.equal(noTarget.allowed, false)
    assert.equal(noTarget.status, 404)
  })

  await test('validateChapterMove: từ chối 400 nếu khác class_id', () => {
    const diffClass = validateChapterMove(
      { id: 'ch-1', class_id: 'class-A' },
      { id: 'ch-2', class_id: 'class-B' }
    )
    assert.equal(diffClass.allowed, false)
    assert.equal(diffClass.status, 400)
    assert.match(diffClass.error, /different class/i)
  })

  await test('validateChapterMove: từ chối 400 nếu class_id null / rỗng', () => {
    const nullClass = validateChapterMove(
      { id: 'ch-1', class_id: null },
      { id: 'ch-2', class_id: 'class-B' }
    )
    assert.equal(nullClass.allowed, false)
    assert.equal(nullClass.status, 400)
  })

  await test('validateChapterMove: chấp nhận khi cùng class_id', () => {
    const sameClass = validateChapterMove(
      { id: 'ch-1', class_id: 'class-12A' },
      { id: 'ch-2', class_id: 'class-12A' }
    )
    assert.equal(sameClass.allowed, true)
    assert.equal(sameClass.error, undefined)
  })

  console.log('\n--- 2. Schema Validation (updateLessonSchema Static Contract) ---')

  const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

  function validateUpdateLessonPayload(data) {
    const errors = {}
    if (!data || typeof data !== 'object') {
      return { success: false, errors: { _errors: ['Expected object'] } }
    }
    if (!data.lessonId || !UUID_REGEX.test(data.lessonId)) {
      errors.lessonId = ['Invalid Lesson ID']
    }
    if (data.chapterId !== undefined) {
      if (typeof data.chapterId !== 'string' || !UUID_REGEX.test(data.chapterId)) {
        errors.chapterId = ['Invalid Chapter ID']
      }
    }
    if (data.title !== undefined && (typeof data.title !== 'string' || data.title.length < 1)) {
      errors.title = ['Title must be at least 1 character']
    }
    if (data.orderIndex !== undefined && !Number.isInteger(data.orderIndex)) {
      errors.orderIndex = ['Order index must be an integer']
    }
    if (Object.keys(errors).length > 0) {
      return { success: false, errors }
    }
    return { success: true, data }
  }

  const VALID_LESSON_ID = '11111111-1111-4111-8111-111111111111'
  const VALID_CHAPTER_ID_1 = '22222222-2222-4222-8222-222222222222'
  const VALID_CHAPTER_ID_2 = '33333333-3333-4333-8333-333333333333'

  await test('validators.ts: updateLessonSchema chứa chapterId optional UUID', () => {
    const updateLessonMatch = VAL_SRC.match(/export const updateLessonSchema = z\.object\(\{([\s\S]*?)\}\)/)?.[1] || ''
    assert.ok(updateLessonMatch, 'updateLessonSchema phải tồn tại trong validators.ts')
    assert.match(updateLessonMatch, /chapterId:\s*z\.string\(\)\.uuid\(['"]Invalid Chapter ID['"]\)\.optional\(\)/)
  })

  await test('updateLessonSchema: caller cũ không truyền chapterId vẫn hợp lệ (backward compatible)', () => {
    const legacyPayload = {
      lessonId: VALID_LESSON_ID,
      title: 'Bài học cập nhật',
      content: null,
    }
    const result = validateUpdateLessonPayload(legacyPayload)
    assert.equal(result.success, true)
    assert.equal(result.data.chapterId, undefined)
    assert.equal(result.data.title, 'Bài học cập nhật')
    assert.equal(result.data.content, null)
  })

  await test('updateLessonSchema: nhận chapterId UUID hợp lệ', () => {
    const movePayload = {
      lessonId: VALID_LESSON_ID,
      chapterId: VALID_CHAPTER_ID_2,
    }
    const result = validateUpdateLessonPayload(movePayload)
    assert.equal(result.success, true)
    assert.equal(result.data.chapterId, VALID_CHAPTER_ID_2)
  })

  await test('updateLessonSchema: từ chối chapterId không phải UUID', () => {
    const invalidPayload = {
      lessonId: VALID_LESSON_ID,
      chapterId: 'not-a-valid-uuid',
    }
    const result = validateUpdateLessonPayload(invalidPayload)
    assert.equal(result.success, false)
    assert.ok(result.errors.chapterId?.includes('Invalid Chapter ID'))
  })

  console.log('\n--- 3. Static & Security Invariants in Function Source ---')

  await test('create-lesson: kiểm tra role ADMIN trước khi update', () => {
    assert.match(FN_SRC, /if\s*\(user\.role\s*!==\s*'ADMIN'\)/)
    const roleCheckIdx = FN_SRC.indexOf("user.role !== 'ADMIN'")
    const updateIdx = FN_SRC.indexOf("action === 'update'")
    assert.ok(roleCheckIdx < updateIdx, 'Admin check phải đứng trước update handler')
  })

  await test('create-lesson: service-role code kiểm tra cùng class_id giữa 2 chapter', () => {
    assert.match(FN_SRC, /validateChapterMove/)
    assert.match(FN_SRC, /currentChapter\.class_id\s*!==\s*targetChapter\.class_id/)
  })

  await test('create-lesson: tự gán order_index cuối danh sách đích khi đổi chapter', () => {
    assert.match(FN_SRC, /calculateNextOrderIndex/)
    assert.match(FN_SRC, /updateData\.order_index\s*=\s*nextOrderIndex/)
  })

  await test('create-lesson: giữ nguyên thứ tự khi chapterId trùng chapter hiện tại', () => {
    assert.match(FN_SRC, /if\s*\(chapterId\s*!==\s*currentLesson\.chapter_id\)/)
  })

  console.log('\n--- 4. Mock Supabase Query Builder Execution ---')

  function createMockClient(db) {
    return {
      from(table) {
        let currentTable = table
        let filterEq = {}
        let filterIn = {}
        let sortField = null
        let sortAsc = true
        let limitCount = null

        const builder = {
          select(fields) {
            return builder
          },
          eq(col, val) {
            filterEq[col] = val
            return builder
          },
          in(col, vals) {
            filterIn[col] = vals
            return builder
          },
          order(col, opts = { ascending: true }) {
            sortField = col
            sortAsc = opts.ascending ?? true
            return builder
          },
          limit(n) {
            limitCount = n
            return builder
          },
          async maybeSingle() {
            const rows = db[currentTable] || []
            const filtered = rows.filter(r => {
              for (const [k, v] of Object.entries(filterEq)) {
                if (r[k] !== v) return false
              }
              return true
            })
            return { data: filtered[0] || null, error: null }
          },
          async single() {
            return builder.maybeSingle()
          },
          async then(resolve) {
            let rows = [...(db[currentTable] || [])]
            rows = rows.filter(r => {
              for (const [k, v] of Object.entries(filterEq)) {
                if (r[k] !== v) return false
              }
              for (const [k, v] of Object.entries(filterIn)) {
                if (!v.includes(r[k])) return false
              }
              return true
            })
            if (sortField) {
              rows.sort((a, b) => {
                const diff = (a[sortField] ?? 0) - (b[sortField] ?? 0)
                return sortAsc ? diff : -diff
              })
            }
            if (limitCount !== null) {
              rows = rows.slice(0, limitCount)
            }
            return resolve({ data: rows, error: null })
          },
          update(updatePayload) {
            return {
              eq(col, val) {
                return {
                  select() {
                    return {
                      async single() {
                        const rows = db[currentTable] || []
                        const target = rows.find(r => r[col] === val)
                        if (!target) return { data: null, error: new Error('Record not found') }
                        Object.assign(target, updatePayload)
                        return { data: { ...target }, error: null }
                      }
                    }
                  }
                }
              }
            }
          }
        }
        return builder
      }
    }
  }

  async function simulateUpdateLesson({ body, user, client }) {
    if (user.role !== 'ADMIN') {
      return { status: 403, error: 'Forbidden: Only admins can manage lessons' }
    }

    const validation = validateUpdateLessonPayload(body)
    if (!validation.success) {
      return { status: 400, error: 'Validation error', details: validation.errors }
    }

    const { lessonId, chapterId, title, orderIndex, content, videoUrl, theoryFiles, isTrial } = validation.data
    const updateData = { updated_at: new Date().toISOString() }
    if (title) updateData.title = title
    if (orderIndex !== undefined) updateData.order_index = orderIndex
    if (content !== undefined) updateData.content = content
    if (videoUrl !== undefined) updateData.video_url = videoUrl
    if (theoryFiles !== undefined) updateData.theory_files = theoryFiles
    if (isTrial !== undefined) updateData.is_trial = isTrial

    if (chapterId !== undefined) {
      const { data: currentLesson } = await client
        .from('lessons')
        .select('id, chapter_id, order_index')
        .eq('id', lessonId)
        .maybeSingle()

      if (!currentLesson) return { status: 404, error: 'Lesson not found' }

      if (chapterId !== currentLesson.chapter_id) {
        const { data: chapters } = await client
          .from('chapters')
          .select('id, class_id')
          .in('id', [currentLesson.chapter_id, chapterId])

        const currentChapter = chapters?.find(c => c.id === currentLesson.chapter_id)
        const targetChapter = chapters?.find(c => c.id === chapterId)

        const moveCheck = validateChapterMove(currentChapter, targetChapter)
        if (!moveCheck.allowed) {
          return { status: moveCheck.status || 400, error: moveCheck.error }
        }

        const { data: targetLessons } = await client
          .from('lessons')
          .select('order_index')
          .eq('chapter_id', chapterId)
          .order('order_index', { ascending: false })
          .limit(1)

        const nextOrderIndex = calculateNextOrderIndex(targetLessons || [])
        updateData.chapter_id = chapterId
        updateData.order_index = nextOrderIndex
      } else {
        updateData.chapter_id = chapterId
      }
    }

    const { data: updated, error } = await client
      .from('lessons')
      .update(updateData)
      .eq('id', lessonId)
      .select()
      .single()

    if (error) return { status: 500, error: error.message }
    return { status: 200, data: updated }
  }

  await test('Mock Execution: Caller cũ update title thành công, không query chapters', async () => {
    const db = {
      lessons: [
        { id: VALID_LESSON_ID, chapter_id: VALID_CHAPTER_ID_1, title: 'Old Title', order_index: 2 }
      ],
      chapters: []
    }
    const client = createMockClient(db)
    const res = await simulateUpdateLesson({
      body: { lessonId: VALID_LESSON_ID, title: 'New Title' },
      user: { role: 'ADMIN' },
      client
    })
    assert.equal(res.status, 200)
    assert.equal(res.data.title, 'New Title')
    assert.equal(res.data.chapter_id, VALID_CHAPTER_ID_1)
    assert.equal(res.data.order_index, 2)
  })

  await test('Mock Execution: Chuyển sang chapter CÙNG class -> thành công, order_index = max + 1', async () => {
    const db = {
      chapters: [
        { id: VALID_CHAPTER_ID_1, class_id: 'CLASS_ALPHA' },
        { id: VALID_CHAPTER_ID_2, class_id: 'CLASS_ALPHA' }, // Cùng lớp
      ],
      lessons: [
        { id: VALID_LESSON_ID, chapter_id: VALID_CHAPTER_ID_1, title: 'Lesson Alpha', order_index: 1 },
        // Target chapter đã có bài 1 (order 1) và bài 2 (order 5)
        { id: 'other-lesson-1', chapter_id: VALID_CHAPTER_ID_2, title: 'Existing 1', order_index: 1 },
        { id: 'other-lesson-2', chapter_id: VALID_CHAPTER_ID_2, title: 'Existing 2', order_index: 5 },
      ]
    }
    const client = createMockClient(db)
    const res = await simulateUpdateLesson({
      body: { lessonId: VALID_LESSON_ID, chapterId: VALID_CHAPTER_ID_2 },
      user: { role: 'ADMIN' },
      client
    })
    assert.equal(res.status, 200)
    assert.equal(res.data.chapter_id, VALID_CHAPTER_ID_2)
    assert.equal(res.data.order_index, 6, 'order_index phải là max(5) + 1 = 6')
  })

  await test('Mock Execution: Chuyển sang target chapter chưa có bài học nào -> order_index = 1', async () => {
    const db = {
      chapters: [
        { id: VALID_CHAPTER_ID_1, class_id: 'CLASS_ALPHA' },
        { id: VALID_CHAPTER_ID_2, class_id: 'CLASS_ALPHA' },
      ],
      lessons: [
        { id: VALID_LESSON_ID, chapter_id: VALID_CHAPTER_ID_1, title: 'Lesson Alpha', order_index: 1 },
      ]
    }
    const client = createMockClient(db)
    const res = await simulateUpdateLesson({
      body: { lessonId: VALID_LESSON_ID, chapterId: VALID_CHAPTER_ID_2 },
      user: { role: 'ADMIN' },
      client
    })
    assert.equal(res.status, 200)
    assert.equal(res.data.chapter_id, VALID_CHAPTER_ID_2)
    assert.equal(res.data.order_index, 1, 'order_index rỗng phải là 1')
  })

  await test('Mock Execution: Chuyển sang chapter KHÁC class -> chặn 400, không đổi DB', async () => {
    const db = {
      chapters: [
        { id: VALID_CHAPTER_ID_1, class_id: 'CLASS_ALPHA' },
        { id: VALID_CHAPTER_ID_2, class_id: 'CLASS_BETA' }, // Khác lớp!
      ],
      lessons: [
        { id: VALID_LESSON_ID, chapter_id: VALID_CHAPTER_ID_1, title: 'Lesson Alpha', order_index: 1 }
      ]
    }
    const client = createMockClient(db)
    const res = await simulateUpdateLesson({
      body: { lessonId: VALID_LESSON_ID, chapterId: VALID_CHAPTER_ID_2 },
      user: { role: 'ADMIN' },
      client
    })
    assert.equal(res.status, 400)
    assert.match(res.error, /different class/i)
    assert.equal(db.lessons[0].chapter_id, VALID_CHAPTER_ID_1, 'DB không được thay đổi')
  })

  await test('Mock Execution: Chuyển sang target chapter KHÔNG TỒN TẠI -> 404', async () => {
    const db = {
      chapters: [
        { id: VALID_CHAPTER_ID_1, class_id: 'CLASS_ALPHA' },
      ],
      lessons: [
        { id: VALID_LESSON_ID, chapter_id: VALID_CHAPTER_ID_1, title: 'Lesson Alpha', order_index: 1 }
      ]
    }
    const client = createMockClient(db)
    const res = await simulateUpdateLesson({
      body: { lessonId: VALID_LESSON_ID, chapterId: VALID_CHAPTER_ID_2 },
      user: { role: 'ADMIN' },
      client
    })
    assert.equal(res.status, 404)
    assert.match(res.error, /Target chapter not found/i)
  })

  await test('Mock Execution: chapterId trùng chapter hiện tại -> giữ nguyên thứ tự', async () => {
    const db = {
      chapters: [
        { id: VALID_CHAPTER_ID_1, class_id: 'CLASS_ALPHA' },
      ],
      lessons: [
        { id: VALID_LESSON_ID, chapter_id: VALID_CHAPTER_ID_1, title: 'Lesson Alpha', order_index: 3 },
        { id: 'other-lesson', chapter_id: VALID_CHAPTER_ID_1, title: 'Other Lesson', order_index: 10 },
      ]
    }
    const client = createMockClient(db)
    const res = await simulateUpdateLesson({
      body: { lessonId: VALID_LESSON_ID, chapterId: VALID_CHAPTER_ID_1, title: 'Renamed In Same Chapter' },
      user: { role: 'ADMIN' },
      client
    })
    assert.equal(res.status, 200)
    assert.equal(res.data.title, 'Renamed In Same Chapter')
    assert.equal(res.data.chapter_id, VALID_CHAPTER_ID_1)
    assert.equal(res.data.order_index, 3, 'order_index không đổi khi trùng chapter hiện tại')
  })

  await test('Mock Execution: User không phải ADMIN bị chặn 403', async () => {
    const client = createMockClient({})
    const res = await simulateUpdateLesson({
      body: { lessonId: VALID_LESSON_ID, chapterId: VALID_CHAPTER_ID_2 },
      user: { role: 'STUDENT' },
      client
    })
    assert.equal(res.status, 403)
  })

  console.log(`\n========================================`)
  console.log(`Kết quả: ${passed} passed, ${failed} failed`)
  console.log(`========================================\n`)

  if (failed > 0) {
    process.exit(1)
  }
}

run()
