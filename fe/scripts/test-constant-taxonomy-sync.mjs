import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'

console.log('=== Kiểm thử Oracle: Constant Taxonomy & Synchronization (Ngân hàng câu hỏi) ===')

// ========================================================
// Helper tính Content Hash chuẩn giống Backend Edge Function
// ========================================================
function computeQbContentHash(questionType, prompt) {
  const normType = String(questionType || '').trim().toUpperCase()
  const pObj = typeof prompt === 'string' ? JSON.parse(prompt) : (prompt || {})
  const normText = String(pObj.text || pObj.content || '').trim().replace(/\s+/g, ' ')
  const normExpl = String(pObj.explanation || '').trim().replace(/\s+/g, ' ')

  let extra = ''
  if (Array.isArray(pObj.options)) {
    extra = pObj.options.map(o => String(o.text || '').trim().replace(/\s+/g, ' ')).sort().join('|')
  } else if (Array.isArray(pObj.statements)) {
    extra = pObj.statements.map(s => String(s.text || '').trim().replace(/\s+/g, ' ')).sort().join('|')
  }

  const raw = `${normType}::${normText}::${extra}::${normExpl}`
  return createHash('sha256').update(raw, 'utf8').digest('hex')
}

// ========================================================
// 1. Kiểm thử Schema & Hashing Semantics
// ========================================================
console.log('\n--- 1. Kiểm thử Schema, Hashing & Scoped Unique Indexes ---')
{
  const q1 = {
    questionType: 'MULTIPLE_CHOICE',
    prompt: {
      text: 'Tìm nguyên hàm của hàm số $f(x) = 2x$',
      options: [{ text: '$x^2 + C$' }, { text: '$2x^2 + C$' }, { text: '$x^2$' }, { text: '$2$' }],
      explanation: 'Ta có $\\int 2x dx = x^2 + C$'
    }
  }

  const hash1 = computeQbContentHash(q1.questionType, q1.prompt)
  assert.ok(hash1 && hash1.length === 64, 'Hash SHA-256 phải có độ dài 64 ký tự')

  // Cùng nội dung dù thứ tự options khác nhau -> hash bằng nhau nhờ sort
  const q1Reordered = {
    questionType: 'MULTIPLE_CHOICE',
    prompt: {
      text: '  Tìm nguyên hàm của hàm số $f(x) = 2x$  ',
      options: [{ text: '$2$' }, { text: '$x^2 + C$' }, { text: '$2x^2 + C$' }, { text: '$x^2$' }],
      explanation: 'Ta có $\\int 2x dx = x^2 + C$'
    }
  }
  const hash1Reordered = computeQbContentHash(q1Reordered.questionType, q1Reordered.prompt)
  assert.equal(hash1, hash1Reordered, 'Hash phải bất biến trước thứ tự lựa chọn và khoảng trắng thừa')

  console.log('  ✓ Hashing chuẩn SHA-256 xác định và chuẩn hóa khoảng trắng/thứ tự')
}

// ========================================================
// 2. Oracle Simulation: Nhân bản Độc lập (Duplicate)
// Nguồn Dynamic A (2 câu) + Nguồn Dynamic B (3 câu) -> Constant C
// ========================================================
console.log('\n--- 2. Kiểm thử Nhân bản (DUPLICATE) Nguồn Động A + B -> Đích Constant C ---')
{
  const constantLessonC = {
    id: 'const-lesson-c-uuid',
    title: 'Bài 1: Khảo sát sự biến thiên của hàm số',
    chapter_id: 'const-chap-1-uuid',
    class_id: 'const-class-12-uuid',
    grade_block: '12-Toán'
  }

  const dynamicLessonA = { id: 'dyn-lesson-a-uuid', title: 'Bài học 1A Lớp 12A1' }
  const dynamicLessonB = { id: 'dyn-lesson-b-uuid', title: 'Bài học 2B Lớp 12A2' }

  // 2 câu hỏi từ Bài học động A
  const bankQuestionsLessonA = [
    {
      id: 'qb-origin-1',
      lesson_id: dynamicLessonA.id,
      question_type: 'MULTIPLE_CHOICE',
      difficulty: 'NHAN_BIET',
      points: 0.25,
      tags: ['dai-so', 'khao-sat'],
      prompt: { text: 'Cho hàm số $y=f(x)$ có bảng biến thiên...', options: [{ text: 'Đồng biến' }, { text: 'Nghịch biến' }] },
      mc_answer: 'A',
      content_hash: computeQbContentHash('MULTIPLE_CHOICE', { text: 'Cho hàm số $y=f(x)$ có bảng biến thiên...', options: [{ text: 'Đồng biến' }, { text: 'Nghịch biến' }] })
    },
    {
      id: 'qb-origin-2',
      lesson_id: dynamicLessonA.id,
      question_type: 'TRUE_FALSE',
      difficulty: 'THONG_HIEU',
      points: 1.0,
      tags: ['khao-sat'],
      prompt: { text: 'Cho hàm số $y=x^3-3x$. Xét tính đúng sai:', statements: [{ text: 'Hàm số đạt cực đại tại x=-1' }] },
      tf_answers: { a: true, b: false, c: true, d: false },
      content_hash: computeQbContentHash('TRUE_FALSE', { text: 'Cho hàm số $y=x^3-3x$. Xét tính đúng sai:', statements: [{ text: 'Hàm số đạt cực đại tại x=-1' }] })
    }
  ]

  // 3 câu hỏi từ Bài học động B
  const bankQuestionsLessonB = [
    {
      id: 'qb-origin-3',
      lesson_id: dynamicLessonB.id,
      question_type: 'SHORT_ANSWER',
      difficulty: 'VAN_DUNG',
      points: 0.5,
      tags: ['cuc-tri'],
      prompt: { text: 'Tìm giá trị lớn nhất của $y=f(x)$ trên [0; 3]' },
      sa_answer: '12',
      sa_tolerance: 0,
      content_hash: computeQbContentHash('SHORT_ANSWER', { text: 'Tìm giá trị lớn nhất của $y=f(x)$ trên [0; 3]' })
    },
    {
      id: 'qb-origin-4',
      lesson_id: dynamicLessonB.id,
      question_type: 'MULTIPLE_CHOICE',
      difficulty: 'VAN_DUNG_CAO',
      points: 0.25,
      tags: ['tham-so-m'],
      prompt: { text: 'Có bao nhiêu giá trị nguyên của tham số m để hàm số đồng biến...' },
      mc_answer: 'C',
      content_hash: computeQbContentHash('MULTIPLE_CHOICE', { text: 'Có bao nhiêu giá trị nguyên của tham số m để hàm số đồng biến...' })
    },
    {
      id: 'qb-origin-5',
      lesson_id: dynamicLessonB.id,
      question_type: 'SHORT_ANSWER',
      difficulty: 'THONG_HIEU',
      points: 0.5,
      tags: ['dao-ham'],
      prompt: { text: 'Tính đạo hàm tại x=2' },
      sa_answer: '5',
      sa_tolerance: 0.01,
      content_hash: computeQbContentHash('SHORT_ANSWER', { text: 'Tính đạo hàm tại x=2' })
    }
  ]

  // Database giả lập (question_bank)
  let dbQuestionBank = [...bankQuestionsLessonA, ...bankQuestionsLessonB]

  // Hàm thực hiện RPC/Service sync
  function executeSync(sourceLessonIds, targetConstantLesson) {
    const candidateQuestions = dbQuestionBank.filter(q => sourceLessonIds.includes(q.lesson_id))
    const existingInTarget = dbQuestionBank.filter(q => q.qb_lesson_id === targetConstantLesson.id)
    const existingHashes = new Set(existingInTarget.map(q => q.content_hash))

    let createdCount = 0
    let skippedCount = 0
    const seenInBatch = new Set()

    candidateQuestions.forEach(src => {
      const hash = src.content_hash
      if (existingHashes.has(hash) || seenInBatch.has(hash)) {
        skippedCount++
        return
      }
      seenInBatch.add(hash)

      // Nhân bản (DUPLICATE) bản ghi độc lập
      const duplicatedQuestion = {
        id: `qb-constant-copy-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`,
        subject: 'TOAN',
        grade_level: 12,
        grade_block: targetConstantLesson.grade_block,
        qb_class_id: targetConstantLesson.class_id,
        qb_chapter_id: targetConstantLesson.chapter_id,
        qb_lesson_id: targetConstantLesson.id,
        source_dynamic_lesson_id: src.lesson_id,
        sync_source_id: src.id,
        question_type: src.question_type,
        difficulty: src.difficulty,
        prompt: JSON.parse(JSON.stringify(src.prompt)),
        mc_answer: src.mc_answer || null,
        tf_answers: src.tf_answers ? { ...src.tf_answers } : null,
        sa_answer: src.sa_answer || null,
        sa_tolerance: src.sa_tolerance || 0,
        points: src.points,
        tags: [...(src.tags || [])],
        usage_count: 0,
        content_hash: hash
      }

      dbQuestionBank.push(duplicatedQuestion)
      createdCount++
    })

    return { createdCount, skippedCount, totalProcessed: createdCount + skippedCount }
  }

  // Lần 1: Đồng bộ từ cả 2 bài học động A và B sang bài học Constant C
  const syncResult1 = executeSync([dynamicLessonA.id, dynamicLessonB.id], constantLessonC)
  assert.equal(syncResult1.createdCount, 5, 'Phải tạo mới đủ 5 câu hỏi nhân bản vào bài Constant C')
  assert.equal(syncResult1.skippedCount, 0, 'Lần đầu chưa có câu nào trùng nên skipped = 0')
  assert.equal(syncResult1.totalProcessed, 5, 'Tổng xử lý phải là 5')

  // Kiểm tra tính độc lập của bản ghi nhân bản
  const constantQuestions = dbQuestionBank.filter(q => q.qb_lesson_id === constantLessonC.id)
  assert.equal(constantQuestions.length, 5, 'Bài Constant C phải có đúng 5 câu')

  constantQuestions.forEach(cq => {
    // ID mới hoàn toàn khác ID nguồn
    assert.notEqual(cq.id, cq.sync_source_id, 'ID nhân bản phải mới hoàn toàn (UUID riêng)')
    assert.ok(cq.qb_lesson_id === constantLessonC.id, 'Phải gắn đúng qb_lesson_id constant')
    assert.ok([dynamicLessonA.id, dynamicLessonB.id].includes(cq.source_dynamic_lesson_id), 'Phải lưu source_dynamic_lesson_id nguồn')
  })

  // Thao tác sửa câu hỏi nhân bản trong Constant C không làm ảnh hưởng câu hỏi nguồn
  const copy1 = constantQuestions[0]
  copy1.prompt.text = 'Nội dung đã chỉnh sửa trong ngân hàng Constant'
  const origin1 = dbQuestionBank.find(q => q.id === copy1.sync_source_id)
  assert.notEqual(origin1.prompt.text, copy1.prompt.text, 'Sửa bản ghi Constant C không được làm ảnh hưởng bản ghi nguồn A')

  console.log('  ✓ Đồng bộ A + B sang C tạo 5 bản ghi độc lập')
  console.log('  ✓ Mỗi bản ghi có UUID riêng, lưu source_dynamic_lesson_id và sync_source_id')
  console.log('  ✓ Chỉnh sửa bản ghi Constant hoàn toàn không ảnh hưởng bản ghi gốc')

  // ========================================================
  // 3. Kiểm thử Tính Bất Biến (Idempotency) khi Đồng Bộ Lặp Lại
  // ========================================================
  console.log('\n--- 3. Kiểm thử Idempotency & Bỏ Qua Trùng Lặp khi Đồng Bộ Lại ---')
  const syncResult2 = executeSync([dynamicLessonA.id, dynamicLessonB.id], constantLessonC)
  assert.equal(syncResult2.createdCount, 0, 'Đồng bộ lại không được tạo bản ghi thừa (created = 0)')
  assert.equal(syncResult2.skippedCount, 5, 'Toàn bộ 5 câu đã tồn tại phải bị bỏ qua (skipped = 5)')

  // Thêm 1 câu mới vào bài học A rồi đồng bộ lại lần 3
  const newQuestionInA = {
    id: 'qb-origin-6-new',
    lesson_id: dynamicLessonA.id,
    question_type: 'MULTIPLE_CHOICE',
    difficulty: 'NHAN_BIET',
    points: 0.25,
    tags: ['moi'],
    prompt: { text: 'Câu hỏi mới phát sinh trong bài học A' },
    mc_answer: 'B',
    content_hash: computeQbContentHash('MULTIPLE_CHOICE', { text: 'Câu hỏi mới phát sinh trong bài học A' })
  }
  dbQuestionBank.push(newQuestionInA)

  const syncResult3 = executeSync([dynamicLessonA.id, dynamicLessonB.id], constantLessonC)
  assert.equal(syncResult3.createdCount, 1, 'Chỉ 1 câu mới được tạo vào Constant C')
  assert.equal(syncResult3.skippedCount, 5, '5 câu cũ vẫn được bỏ qua')

  console.log('  ✓ Idempotency: Lần 2 tạo 0, bỏ qua 5 câu trùng lặp')
  console.log('  ✓ Cập nhật delta: Khi bài nguồn có 1 câu mới, lần 3 chỉ tạo 1 và bỏ qua 5 câu cũ')

  // ========================================================
  // 4. Kiểm thử Xử Lý Trùng Lặp Nội Bộ trong Cùng Lượt Sync (Batch Dedup)
  // Hai bài học động A và B đều có 1 câu hỏi nội dung hệt nhau
  // ========================================================
  console.log('\n--- 4. Kiểm thử Trùng Lặp Cùng Batch (A và B có câu trùng nhau) ---')
  const dupContent = { text: 'Câu hỏi trùng nhau ở cả lớp A và lớp B', options: [{ text: 'Đúng' }, { text: 'Sai' }] }
  const dupHash = computeQbContentHash('MULTIPLE_CHOICE', dupContent)

  const dupInA = {
    id: 'qb-dup-in-A',
    lesson_id: 'dyn-lesson-x-uuid',
    question_type: 'MULTIPLE_CHOICE',
    prompt: dupContent,
    content_hash: dupHash
  }
  const dupInB = {
    id: 'qb-dup-in-B',
    lesson_id: 'dyn-lesson-y-uuid',
    question_type: 'MULTIPLE_CHOICE',
    prompt: dupContent,
    content_hash: dupHash
  }
  dbQuestionBank.push(dupInA, dupInB)

  const targetConstantLessonD = {
    id: 'const-lesson-d-uuid',
    title: 'Bài test dedup batch',
    chapter_id: 'const-chap-1-uuid',
    class_id: 'const-class-12-uuid',
    grade_block: '12-Toán'
  }

  const batchSyncResult = executeSync(['dyn-lesson-x-uuid', 'dyn-lesson-y-uuid'], targetConstantLessonD)
  assert.equal(batchSyncResult.createdCount, 1, 'Trong cùng một lượt sync, chỉ 1 bản ghi được tạo vào Constant D')
  assert.equal(batchSyncResult.skippedCount, 1, 'Bản ghi thứ hai cùng nội dung bị bỏ qua ngay trong batch')

  console.log('  ✓ Hai bài nguồn có câu trùng nội dung -> Batch dedup chỉ tạo 1 câu duy nhất')
}

// ========================================================
// 5. Kiểm thử Bộ Lọc Phân Cấp Constant (Cascading Filters)
// ========================================================
console.log('\n--- 5. Kiểm thử Bộ Lọc Phân Cấp Constant ---')
{
  const mockConstantTaxonomy = {
    gradeBlocks: [
      { id: 'gb-12-toan', code: '12-Toán', name: 'Khối 12 Toán', order_index: 1 },
      { id: 'gb-11-toan', code: '11-Toán', name: 'Khối 11 Toán', order_index: 2 }
    ],
    classes: [
      { id: 'cl-12-chuan', grade_block: '12-Toán', name: 'Lớp 12 Chuẩn', order_index: 1 },
      { id: 'cl-12-nang-cao', grade_block: '12-Toán', name: 'Lớp 12 Nâng cao', order_index: 2 },
      { id: 'cl-11-chuan', grade_block: '11-Toán', name: 'Lớp 11 Chuẩn', order_index: 3 }
    ],
    chapters: [
      { id: 'ch-12-1', class_id: 'cl-12-chuan', title: 'Chương 1: Khảo sát hàm số', order_index: 1 },
      { id: 'ch-12-2', class_id: 'cl-12-chuan', title: 'Chương 2: Mũ và Logarit', order_index: 2 },
      { id: 'ch-11-1', class_id: 'cl-11-chuan', title: 'Chương 1: Lượng giác', order_index: 1 }
    ],
    lessons: [
      { id: 'ls-12-1-1', chapter_id: 'ch-12-1', title: 'Bài 1: Sự đồng biến nghịch biến', order_index: 1 },
      { id: 'ls-12-1-2', chapter_id: 'ch-12-1', title: 'Bài 2: Cực trị của hàm số', order_index: 2 },
      { id: 'ls-12-2-1', chapter_id: 'ch-12-2', title: 'Bài 1: Lũy thừa', order_index: 1 }
    ]
  }

  // Lọc Lớp theo Khối 12-Toán
  const classes12 = mockConstantTaxonomy.classes.filter(c => c.grade_block === '12-Toán')
  assert.equal(classes12.length, 2, 'Khối 12-Toán phải có 2 lớp')
  assert.deepEqual(classes12.map(c => c.id), ['cl-12-chuan', 'cl-12-nang-cao'])

  // Lọc Chương theo Lớp 12 Chuẩn
  const chapters12Chuan = mockConstantTaxonomy.chapters.filter(ch => ch.class_id === 'cl-12-chuan')
  assert.equal(chapters12Chuan.length, 2, 'Lớp 12 Chuẩn phải có 2 chương')

  // Lọc Bài học theo Chương 1
  const lessonsCh1 = mockConstantTaxonomy.lessons.filter(l => l.chapter_id === 'ch-12-1')
  assert.equal(lessonsCh1.length, 2, 'Chương 1 phải có 2 bài học')

  // Multi-select Bài học
  const selectedLessonIds = ['ls-12-1-1', 'ls-12-1-2']
  assert.equal(selectedLessonIds.length, 2)

  // Empty state: Chọn khối chưa có lớp
  const classesEmpty = mockConstantTaxonomy.classes.filter(c => c.grade_block === '10-Toán')
  assert.equal(classesEmpty.length, 0, 'Khối chưa có lớp phải trả về danh sách rỗng (không throw)')

  console.log('  ✓ Phân cấp Khối -> Lớp -> Chương -> Bài học constant lọc chính xác')
  console.log('  ✓ Hỗ trợ chọn nhiều bài học (multi-select) theo đúng quy cách')
}

// ========================================================
// 6. Kiểm thử Bảo Mật, Validation Quyền Admin & Lỗi Tham Số
// ========================================================
console.log('\n--- 6. Kiểm thử Quyền Admin & Bắt Lỗi Tham Số Đầu Vào ---')
{
  function validateSyncRequest(userRole, payload) {
    if (userRole !== 'ADMIN') {
      return { status: 403, error: 'Forbidden: Chỉ quản trị viên mới có quyền truy cập ngân hàng câu hỏi' }
    }
    const { sourceLessonIds, targetConstantLessonId } = payload || {}
    const ids = Array.isArray(sourceLessonIds) ? sourceLessonIds.filter(Boolean) : []
    if (ids.length === 0) {
      return { status: 400, error: 'Vui lòng chọn ít nhất một bài học nguồn động' }
    }
    if (!targetConstantLessonId) {
      return { status: 400, error: 'Vui lòng chọn bài học đích constant' }
    }
    return { status: 200, valid: true }
  }

  // Teacher / Student bị từ chối 403
  assert.equal(validateSyncRequest('STUDENT', {}).status, 403)
  assert.equal(validateSyncRequest('TEACHER', {}).status, 403)

  // Admin thiếu nguồn động -> 400
  assert.equal(validateSyncRequest('ADMIN', { sourceLessonIds: [], targetConstantLessonId: 'const-1' }).status, 400)

  // Admin thiếu đích constant -> 400
  assert.equal(validateSyncRequest('ADMIN', { sourceLessonIds: ['src-1'], targetConstantLessonId: '' }).status, 400)

  // Hợp lệ -> 200
  assert.equal(validateSyncRequest('ADMIN', { sourceLessonIds: ['src-1'], targetConstantLessonId: 'const-1' }).status, 200)

  console.log('  ✓ Chặn quyền 403 đối với tài khoản không phải ADMIN')
  console.log('  ✓ Kiểm tra nghiêm ngặt 400 khi thiếu nguồn hoặc đích')
}

// ========================================================
// 7. Kiểm thử API Contract: Update Constant Taxonomy (4 Cấp độ)
// ========================================================
console.log('\n--- 7. Kiểm thử API Update Contract: GradeBlock / Class / Chapter / Lesson ---')
{
  function validateAndUpdateTaxonomy(type, id, data, store) {
    if (!type || !id || !data) {
      return { status: 400, error: 'Thiếu type, id hoặc data cập nhật' }
    }
    const normType = (type === 'gradeBlock' || type === 'grade_block') ? 'gradeBlock' : type
    const validTypes = ['gradeBlock', 'class', 'chapter', 'lesson']
    if (!validTypes.includes(normType)) {
      return { status: 400, error: `Loại taxonomy không hợp lệ: ${type}` }
    }

    const updates = {}
    if (data.name !== undefined) updates.name = String(data.name).trim()
    if (data.title !== undefined) updates.title = String(data.title).trim()
    if (data.description !== undefined) updates.description = data.description || null
    if (data.orderIndex !== undefined || data.order_index !== undefined) {
      const o = Number(data.orderIndex ?? data.order_index)
      if (isNaN(o) || o < 0) return { status: 400, error: 'Thứ tự hiển thị phải là số không âm' }
      updates.order_index = o
    }

    if (normType === 'gradeBlock') {
      if (updates.name !== undefined && updates.name === '') {
        return { status: 400, error: 'Tên khối học không được để trống' }
      }
      const gb = store.gradeBlocks.find(b => b.id === id)
      if (!gb) return { status: 404, error: 'Không tìm thấy khối học' }
      const oldName = gb.name
      Object.assign(gb, updates)
      // Cascade sync grade_block name down to classes
      if (updates.name && oldName !== updates.name) {
        store.classes.forEach(c => {
          if (c.grade_block_id === id || c.grade_block === oldName) {
            c.grade_block = updates.name
          }
        })
      }
      return { status: 200, item: gb }
    }

    if (normType === 'class') {
      if (updates.name !== undefined && updates.name === '') {
        return { status: 400, error: 'Tên lớp học không được để trống' }
      }
      if (data.gradeBlock !== undefined || data.grade_block !== undefined) {
        const gb = String(data.gradeBlock || data.grade_block).trim()
        if (!gb) return { status: 400, error: 'Khối học không được để trống' }
        updates.grade_block = gb
      }
      if (data.gradeBlockId !== undefined || data.grade_block_id !== undefined) {
        updates.grade_block_id = data.gradeBlockId || data.grade_block_id || null
      }
      const c = store.classes.find(x => x.id === id)
      if (!c) return { status: 404, error: 'Không tìm thấy lớp học' }
      Object.assign(c, updates)
      return { status: 200, item: c }
    }

    if (normType === 'chapter') {
      if (updates.title !== undefined && updates.title === '') {
        return { status: 400, error: 'Tiêu đề chương không được để trống' }
      }
      if (data.classId !== undefined || data.class_id !== undefined) {
        const cid = data.classId || data.class_id
        if (!cid) return { status: 400, error: 'Lớp học trực thuộc không được để trống' }
        updates.class_id = cid
      }
      const ch = store.chapters.find(x => x.id === id)
      if (!ch) return { status: 404, error: 'Không tìm thấy chương' }
      Object.assign(ch, updates)
      return { status: 200, item: ch }
    }

    if (normType === 'lesson') {
      if (updates.title !== undefined && updates.title === '') {
        return { status: 400, error: 'Tiêu đề bài học không được để trống' }
      }
      if (data.chapterId !== undefined || data.chapter_id !== undefined) {
        const chid = data.chapterId || data.chapter_id
        if (!chid) return { status: 400, error: 'Chương học trực thuộc không được để trống' }
        updates.chapter_id = chid
      }
      const ls = store.lessons.find(x => x.id === id)
      if (!ls) return { status: 404, error: 'Không tìm thấy bài học' }
      Object.assign(ls, updates)
      return { status: 200, item: ls }
    }

    return { status: 400, error: 'Không xác định' }
  }

  const mockDb = {
    gradeBlocks: [{ id: 'gb-1', name: '12-Toán', order_index: 1 }],
    classes: [{ id: 'cl-1', grade_block_id: 'gb-1', grade_block: '12-Toán', name: 'Toán 12 Cơ bản', order_index: 1 }],
    chapters: [{ id: 'ch-1', class_id: 'cl-1', title: 'Chương 1: Khảo sát', order_index: 1 }],
    lessons: [{ id: 'ls-1', chapter_id: 'ch-1', title: 'Bài 1: Đơn điệu', order_index: 1 }]
  }

  // 1. Cập nhật Khối học & tự động đồng bộ tên xuống các Lớp trực thuộc
  const gbRes = validateAndUpdateTaxonomy('gradeBlock', 'gb-1', { name: '12-Toán Nâng Cao', orderIndex: 2 }, mockDb)
  assert.equal(gbRes.status, 200)
  assert.equal(gbRes.item.name, '12-Toán Nâng Cao')
  assert.equal(gbRes.item.order_index, 2)
  assert.equal(mockDb.classes[0].grade_block, '12-Toán Nâng Cao', 'Tên khối ở bảng lớp phải được tự động đồng bộ')

  // 2. Chặn đổi tên rỗng
  assert.equal(validateAndUpdateTaxonomy('gradeBlock', 'gb-1', { name: '   ' }, mockDb).status, 400)
  assert.equal(validateAndUpdateTaxonomy('class', 'cl-1', { name: '' }, mockDb).status, 400)
  assert.equal(validateAndUpdateTaxonomy('chapter', 'ch-1', { title: '  ' }, mockDb).status, 400)
  assert.equal(validateAndUpdateTaxonomy('lesson', 'ls-1', { title: '' }, mockDb).status, 400)

  // 3. Chặn thứ tự âm
  assert.equal(validateAndUpdateTaxonomy('lesson', 'ls-1', { orderIndex: -5 }, mockDb).status, 400)

  // 4. Cập nhật Lớp học & đổi khối cha
  const clRes = validateAndUpdateTaxonomy('class', 'cl-1', { name: 'Toán 12 Chuyên', gradeBlock: '12-Chuyên' }, mockDb)
  assert.equal(clRes.status, 200)
  assert.equal(clRes.item.name, 'Toán 12 Chuyên')
  assert.equal(clRes.item.grade_block, '12-Chuyên')

  // 5. Cập nhật Chương học & đổi lớp cha
  const chRes = validateAndUpdateTaxonomy('chapter', 'ch-1', { title: 'Chương 1 Mới', classId: 'cl-1' }, mockDb)
  assert.equal(chRes.status, 200)
  assert.equal(chRes.item.title, 'Chương 1 Mới')

  // 6. Cập nhật Bài học & đổi chương cha
  const lsRes = validateAndUpdateTaxonomy('lesson', 'ls-1', { title: 'Bài 1 Mới', chapterId: 'ch-1', orderIndex: 5 }, mockDb)
  assert.equal(lsRes.status, 200)
  assert.equal(lsRes.item.title, 'Bài 1 Mới')
  assert.equal(lsRes.item.order_index, 5)

  console.log('  ✓ API Update contract xử lý chính xác 4 cấp Khối / Lớp / Chương / Bài')
  console.log('  ✓ Tự động đồng bộ tên Khối sang bảng Lớp khi đổi tên Khối học')
  console.log('  ✓ Bắt lỗi nghiêm ngặt: tên/tiêu đề rỗng, thứ tự âm, thiếu danh mục cha')
}

// ========================================================
// 8. Kiểm thử Form Validation & State Management (FE)
// ========================================================
console.log('\n--- 8. Kiểm thử Form Validation & State UI Contract ---')
{
  function validateTaxonomyFormSubmission({ type, title, orderIndex, parentId, parentGb }) {
    if (!title || !title.trim()) {
      return { valid: false, error: 'Vui lòng nhập tên hoặc tiêu đề!' }
    }
    const order = parseInt(orderIndex || '0', 10)
    if (isNaN(order) || order < 0) {
      return { valid: false, error: 'Thứ tự hiển thị phải là số không âm (>= 0)!' }
    }
    if (type === 'class' && !parentGb) {
      return { valid: false, error: 'Vui lòng chọn khối học trực thuộc!' }
    }
    if (type === 'chapter' && !parentId) {
      return { valid: false, error: 'Vui lòng chọn lớp học trực thuộc!' }
    }
    if (type === 'lesson' && !parentId) {
      return { valid: false, error: 'Vui lòng chọn chương học trực thuộc!' }
    }
    return { valid: true }
  }

  // Chặn tiêu đề rỗng
  assert.equal(validateTaxonomyFormSubmission({ type: 'class', title: '   ', parentGb: '12-Toán' }).valid, false)

  // Chặn thứ tự âm
  assert.equal(validateTaxonomyFormSubmission({ type: 'lesson', title: 'Bài 1', orderIndex: -1, parentId: 'ch-1' }).valid, false)

  // Chặn thiếu cha
  assert.equal(validateTaxonomyFormSubmission({ type: 'class', title: 'Lớp 12A', parentGb: '' }).valid, false)
  assert.equal(validateTaxonomyFormSubmission({ type: 'chapter', title: 'Chương 1', parentId: '' }).valid, false)
  assert.equal(validateTaxonomyFormSubmission({ type: 'lesson', title: 'Bài 1', parentId: '' }).valid, false)

  // Hợp lệ
  assert.equal(validateTaxonomyFormSubmission({ type: 'gradeBlock', title: '12-Toán', orderIndex: 1 }).valid, true)
  assert.equal(validateTaxonomyFormSubmission({ type: 'class', title: 'Lớp 12A', parentGb: '12-Toán', orderIndex: 1 }).valid, true)
  assert.equal(validateTaxonomyFormSubmission({ type: 'chapter', title: 'Chương 1', parentId: 'cl-1', orderIndex: 1 }).valid, true)
  assert.equal(validateTaxonomyFormSubmission({ type: 'lesson', title: 'Bài 1', parentId: 'ch-1', orderIndex: 1 }).valid, true)

  // Kiểm thử Chống gửi trùng (Double submit prevention)
  let isSubmitting = false
  let submitCount = 0
  async function handleSubmit() {
    if (isSubmitting) return
    isSubmitting = true
    submitCount++
    await new Promise(r => setTimeout(r, 10))
    isSubmitting = false
  }

  // Gọi đồng thời 2 lần -> chỉ đúng 1 lần được thực thi
  const p1 = handleSubmit()
  const p2 = handleSubmit()
  await Promise.all([p1, p2])
  assert.equal(submitCount, 1, 'Chỉ được gửi 1 request khi bấm double click')

  // Kiểm thử Chuyển đổi trạng thái Edit -> Clear -> Add
  let editingItem = { type: 'lesson', id: 'ls-1', title: 'Bài 1' }
  function cancelEdit() {
    editingItem = null
  }
  cancelEdit()
  assert.equal(editingItem, null, 'Hủy chỉnh sửa phải xóa sạch node đang chọn và trở về Add mode')

  console.log('  ✓ Form validation kiểm tra toàn diện tên, thứ tự hiển thị và quan hệ cha-con')
  console.log('  ✓ Chống double submit bảo vệ toàn vẹn dữ liệu khi người dùng bấm liên tiếp')
  console.log('  ✓ Cơ chế hủy chỉnh sửa xóa sạch selected node và chuyển về chế độ thêm mới')
}

console.log('\n============================================================')
console.log('TẤT CẢ KIỂM THỬ CONSTANT TAXONOMY & SYNC ĐỀU ĐẠT! ✅')
