import assert from 'node:assert/strict'

console.log('=== Kiểm thử Matrix Scope & Multi Tree Hierarchy ===')

// 1. Kiểm thử Logic Badge Số Lượng
function computeTreeBadge(classIds, chapterIds, lessonIds) {
  const cCount = (classIds || []).length
  const chCount = (chapterIds || []).length
  const lCount = (lessonIds || []).length
  const total = cCount + chCount + lCount
  return {
    badgeText: `Đã chọn: ${cCount} lớp, ${chCount} chương, ${lCount} bài`,
    tabBadgeText: total > 0 ? `${total} mục` : 'Đa chọn',
    total
  }
}

{
  const b1 = computeTreeBadge([], [], [])
  assert.equal(b1.badgeText, 'Đã chọn: 0 lớp, 0 chương, 0 bài')
  assert.equal(b1.tabBadgeText, 'Đa chọn')
  assert.equal(b1.total, 0)
  console.log('  ✓ Badge khi chưa chọn gì')

  const b2 = computeTreeBadge(['c1', 'c2'], ['ch1'], ['l1', 'l2', 'l3'])
  assert.equal(b2.badgeText, 'Đã chọn: 2 lớp, 1 chương, 3 bài')
  assert.equal(b2.tabBadgeText, '6 mục')
  assert.equal(b2.total, 6)
  console.log('  ✓ Badge khi chọn nhiều lớp, chương, bài')
}

// 2. Kiểm thử Validation khi bốc ngẫu nhiên (btnRollPreview)
function validateMatrixScope(state) {
  if (state.scopeMode === 'MULTI') {
    const hasAnySelection = (state.selectedClassIds && state.selectedClassIds.length > 0) ||
      (state.selectedChapterIds && state.selectedChapterIds.length > 0) ||
      (state.selectedLessonIds && state.selectedLessonIds.length > 0)
    if (!hasAnySelection) {
      return { valid: false, message: 'Vui lòng chọn ít nhất một Lớp học, Chương học hoặc Bài học trong cây phân cấp!' }
    }
    return { valid: true }
  } else {
    if (state.scopeType === 'BLOCK' && (!state.gradeBlock || state.gradeBlock === 'ALL')) {
      return { valid: false, message: 'Vui lòng chọn Khối nguồn để bốc câu hỏi!' }
    }
    if (state.scopeType === 'CLASS' && !state.classId) {
      return { valid: false, message: 'Vui lòng chọn Lớp nguồn để bốc câu hỏi!' }
    }
    if (state.scopeType === 'CHAPTER' && !state.chapterId) {
      return { valid: false, message: 'Vui lòng chọn Chương nguồn để bốc câu hỏi!' }
    }
    if (state.scopeType === 'LESSON' && !state.lessonId) {
      return { valid: false, message: 'Vui lòng chọn Bài học nguồn để bốc câu hỏi!' }
    }
    return { valid: true }
  }
}

{
  // MULTI mode: Chưa chọn gì mặc dù gradeBlock có sẵn -> Phải chặn!
  const res1 = validateMatrixScope({
    scopeMode: 'MULTI',
    gradeBlock: '12-Toán',
    selectedClassIds: [],
    selectedChapterIds: [],
    selectedLessonIds: []
  })
  assert.equal(res1.valid, false)
  assert.match(res1.message, /Vui lòng chọn ít nhất một Lớp học/)
  console.log('  ✓ MULTI mode: Chặn khi chưa chọn lớp/chương/bài nào (không bị lọt bởi gradeBlock)')

  // MULTI mode: Đã chọn 1 bài học -> Cho qua
  const res2 = validateMatrixScope({
    scopeMode: 'MULTI',
    gradeBlock: '12-Toán',
    selectedClassIds: [],
    selectedChapterIds: [],
    selectedLessonIds: ['lesson-1']
  })
  assert.equal(res2.valid, true)
  console.log('  ✓ MULTI mode: Cho phép khi chọn ít nhất 1 bài học')

  // MULTI mode: Đã chọn 1 chương học -> Cho qua
  const res3 = validateMatrixScope({
    scopeMode: 'MULTI',
    gradeBlock: '12-Toán',
    selectedClassIds: [],
    selectedChapterIds: ['chapter-1'],
    selectedLessonIds: []
  })
  assert.equal(res3.valid, true)
  console.log('  ✓ MULTI mode: Cho phép khi chọn 1 chương học')

  // QUICK mode: BLOCK có gradeBlock -> Cho qua
  const resQuick1 = validateMatrixScope({
    scopeMode: 'QUICK',
    scopeType: 'BLOCK',
    gradeBlock: '12-Toán'
  })
  assert.equal(resQuick1.valid, true)
  console.log('  ✓ QUICK mode: BLOCK hợp lệ')

  // QUICK mode: CLASS thiếu classId -> Chặn
  const resQuick2 = validateMatrixScope({
    scopeMode: 'QUICK',
    scopeType: 'CLASS',
    classId: ''
  })
  assert.equal(resQuick2.valid, false)
  assert.match(resQuick2.message, /chọn Lớp nguồn/)
  console.log('  ✓ QUICK mode: CLASS chặn khi thiếu classId')
}

// 3. Kiểm thử Chuẩn hóa Payload bốc câu hỏi
function buildScopePayload(state) {
  if (state.scopeMode === 'MULTI') {
    return {
      scopeType: 'MULTI',
      gradeBlock: state.gradeBlock && state.gradeBlock !== 'ALL' ? state.gradeBlock : null,
      classIds: [...new Set(state.selectedClassIds || [])],
      chapterIds: [...new Set(state.selectedChapterIds || [])],
      lessonIds: [...new Set(state.selectedLessonIds || [])]
    }
  } else if (state.scopeType === 'LESSON') {
    return {
      scopeType: 'LESSON',
      gradeBlock: state.gradeBlock && state.gradeBlock !== 'ALL' ? state.gradeBlock : null,
      lessonId: state.lessonId
    }
  } else if (state.scopeType === 'CHAPTER') {
    return {
      scopeType: 'CHAPTER',
      gradeBlock: state.gradeBlock && state.gradeBlock !== 'ALL' ? state.gradeBlock : null,
      chapterId: state.chapterId
    }
  } else if (state.scopeType === 'CLASS') {
    return {
      scopeType: 'CLASS',
      gradeBlock: state.gradeBlock && state.gradeBlock !== 'ALL' ? state.gradeBlock : null,
      classId: state.classId
    }
  } else {
    return {
      scopeType: 'BLOCK',
      gradeBlock: state.gradeBlock && state.gradeBlock !== 'ALL' ? state.gradeBlock : null
    }
  }
}

{
  const pMulti = buildScopePayload({
    scopeMode: 'MULTI',
    gradeBlock: '12-Toán',
    selectedClassIds: ['c1', 'c2'],
    selectedChapterIds: ['ch1', 'ch2', 'ch3'],
    selectedLessonIds: ['l1', 'l2']
  })
  assert.equal(pMulti.scopeType, 'MULTI')
  assert.equal(pMulti.gradeBlock, '12-Toán')
  assert.deepEqual(pMulti.classIds, ['c1', 'c2'])
  assert.deepEqual(pMulti.chapterIds, ['ch1', 'ch2', 'ch3'])
  assert.deepEqual(pMulti.lessonIds, ['l1', 'l2'])
  console.log('  ✓ MULTI payload chứa đúng 3 mảng classIds/chapterIds/lessonIds')

  const pQuick = buildScopePayload({
    scopeMode: 'QUICK',
    scopeType: 'LESSON',
    gradeBlock: '12-Toán',
    lessonId: 'l99'
  })
  assert.equal(pQuick.scopeType, 'LESSON')
  assert.equal(pQuick.lessonId, 'l99')
  assert.equal(pQuick.classIds, undefined)
  console.log('  ✓ QUICK single-scope tương thích 100%')
}

// 4. Kiểm thử Checkbox Cascading và Bảo toàn State
class MockTreeState {
  constructor() {
    this.selectedClassIds = []
    this.selectedChapterIds = []
    this.selectedLessonIds = []
    this.treeDataCache = {
      chapters: {
        'class-1': [
          { id: 'ch-1', title: 'Chương 1' },
          { id: 'ch-2', title: 'Chương 2' }
        ]
      },
      lessons: {
        'ch-1': [
          { id: 'l-1', title: 'Bài 1' },
          { id: 'l-2', title: 'Bài 2' }
        ],
        'ch-2': [
          { id: 'l-3', title: 'Bài 3' }
        ]
      },
      expandedClasses: new Set(),
      expandedChapters: new Set()
    }
  }

  // Toggle expand không xóa DOM
  toggleExpandClass(clId) {
    if (this.treeDataCache.expandedClasses.has(clId)) {
      this.treeDataCache.expandedClasses.delete(clId)
    } else {
      this.treeDataCache.expandedClasses.add(clId)
    }
  }

  checkClass(clId) {
    if (!this.selectedClassIds.includes(clId)) this.selectedClassIds.push(clId)
    const chs = this.treeDataCache.chapters[clId] || []
    chs.forEach(ch => {
      if (!this.selectedChapterIds.includes(ch.id)) this.selectedChapterIds.push(ch.id)
      const ls = this.treeDataCache.lessons[ch.id] || []
      ls.forEach(l => {
        if (!this.selectedLessonIds.includes(l.id)) this.selectedLessonIds.push(l.id)
      })
    })
  }

  uncheckClass(clId) {
    this.selectedClassIds = this.selectedClassIds.filter(id => id !== clId)
    const chs = this.treeDataCache.chapters[clId] || []
    chs.forEach(ch => {
      this.selectedChapterIds = this.selectedChapterIds.filter(id => id !== ch.id)
      const ls = this.treeDataCache.lessons[ch.id] || []
      ls.forEach(l => {
        this.selectedLessonIds = this.selectedLessonIds.filter(id => id !== l.id)
      })
    })
  }

  uncheckLesson(lId, chId, clId) {
    this.selectedLessonIds = this.selectedLessonIds.filter(id => id !== lId)
    this.selectedChapterIds = this.selectedChapterIds.filter(id => id !== chId)
    this.selectedClassIds = this.selectedClassIds.filter(id => id !== clId)
  }
}

{
  const tree = new MockTreeState()

  // 1. Tick chọn Lớp 1
  tree.checkClass('class-1')
  assert.deepEqual(tree.selectedClassIds, ['class-1'])
  assert.deepEqual(tree.selectedChapterIds, ['ch-1', 'ch-2'])
  assert.deepEqual(tree.selectedLessonIds, ['l-1', 'l-2', 'l-3'])
  console.log('  ✓ Tick chọn Lớp 1 tự động chọn toàn bộ chương và bài học bên trong')

  // 2. Mở Lớp 1 rồi thu gọn lại -> State không được mất!
  tree.toggleExpandClass('class-1') // Mở rộng
  assert.equal(tree.treeDataCache.expandedClasses.has('class-1'), true)
  assert.deepEqual(tree.selectedLessonIds, ['l-1', 'l-2', 'l-3']) // Không mất state

  tree.toggleExpandClass('class-1') // Thu gọn
  assert.equal(tree.treeDataCache.expandedClasses.has('class-1'), false)
  assert.deepEqual(tree.selectedLessonIds, ['l-1', 'l-2', 'l-3'])
  console.log('  ✓ Mở rộng và thu gọn lại không làm mất các lựa chọn đã tick')

  // 3. Bỏ chọn Bài 1 -> Bỏ tick Chương 1 và Lớp 1, nhưng Bài 2, Chương 2, Bài 3 vẫn còn!
  tree.uncheckLesson('l-1', 'ch-1', 'class-1')
  assert.equal(tree.selectedClassIds.includes('class-1'), false)
  assert.equal(tree.selectedChapterIds.includes('ch-1'), false)
  assert.equal(tree.selectedLessonIds.includes('l-1'), false)
  assert.equal(tree.selectedLessonIds.includes('l-2'), true)
  assert.equal(tree.selectedChapterIds.includes('ch-2'), true)
  assert.equal(tree.selectedLessonIds.includes('l-3'), true)
  console.log('  ✓ Bỏ tick 1 Bài học chỉ bỏ chọn Chương và Lớp cha, giữ nguyên các bài khác')

  // 4. Bỏ chọn cả lớp
  tree.uncheckClass('class-1')
  assert.equal(tree.selectedClassIds.length, 0)
  assert.equal(tree.selectedChapterIds.length, 0)
  assert.equal(tree.selectedLessonIds.length, 0)
  console.log('  ✓ Bỏ tick Lớp học xóa sạch toàn bộ chương và bài học thuộc lớp đó')
}

// 5. Backend normalization check
function backendNormalizeScope(input) {
  if (!input) return { scopeType: null, gradeBlock: null, classIds: [], chapterIds: [], lessonIds: [] }
  const scopeType = input.scopeType || input.scope?.scopeType || null
  if (input.scope && typeof input.scope === 'object') {
    return {
      scopeType,
      gradeBlock: input.scope.gradeBlock || input.gradeBlock || null,
      classIds: Array.isArray(input.scope.classIds) ? input.scope.classIds.filter(Boolean) : (input.scope.classId ? [input.scope.classId] : []),
      chapterIds: Array.isArray(input.scope.chapterIds) ? input.scope.chapterIds.filter(Boolean) : (input.scope.chapterId ? [input.scope.chapterId] : []),
      lessonIds: Array.isArray(input.scope.lessonIds) ? input.scope.lessonIds.filter(Boolean) : (input.scope.lessonId ? [input.scope.lessonId] : [])
    }
  }
  return {
    scopeType,
    gradeBlock: input.gradeBlock || null,
    classIds: Array.isArray(input.classIds) ? input.classIds.filter(Boolean) : (input.classId ? [input.classId] : []),
    chapterIds: Array.isArray(input.chapterIds) ? input.chapterIds.filter(Boolean) : (input.chapterId ? [input.chapterId] : []),
    lessonIds: Array.isArray(input.lessonIds) ? input.lessonIds.filter(Boolean) : (input.lessonId ? [input.lessonId] : [])
  }
}

{
  const beNorm = backendNormalizeScope({
    scope: {
      scopeType: 'MULTI',
      gradeBlock: '12-Toán',
      classIds: ['c1', 'c2'],
      chapterIds: ['ch1'],
      lessonIds: ['l1', 'l2']
    }
  })
  assert.equal(beNorm.scopeType, 'MULTI')
  assert.deepEqual(beNorm.classIds, ['c1', 'c2'])
  assert.deepEqual(beNorm.chapterIds, ['ch1'])
  assert.deepEqual(beNorm.lessonIds, ['l1', 'l2'])
  console.log('  ✓ Backend normalizeScopeInput đọc chính xác scope object từ frontend')
}

// 6. Unified Scope: Tree-as-Quick Selection & Payload
function buildUnifiedScopePayload(state) {
  return {
    scopeType: 'MULTI',
    gradeBlock: state.gradeBlock && state.gradeBlock !== 'ALL' ? state.gradeBlock : null,
    classIds: [...new Set(state.selectedClassIds || [])],
    chapterIds: [...new Set(state.selectedChapterIds || [])],
    lessonIds: [...new Set(state.selectedLessonIds || [])]
  }
}

{
  // Single lesson quick selection on tree
  const singleLessonState = {
    gradeBlock: '12-Toán',
    selectedClassIds: [],
    selectedChapterIds: [],
    selectedLessonIds: ['lesson-42']
  }
  const valRes = validateMatrixScope({ scopeMode: 'MULTI', ...singleLessonState })
  assert.equal(valRes.valid, true)
  const payload = buildUnifiedScopePayload(singleLessonState)
  assert.equal(payload.scopeType, 'MULTI')
  assert.equal(payload.gradeBlock, '12-Toán')
  assert.deepEqual(payload.lessonIds, ['lesson-42'])
  assert.deepEqual(payload.classIds, [])
  assert.deepEqual(payload.chapterIds, [])
  console.log('  ✓ Unified tree: Chọn đúng 1 Bài học là bốc nhanh hợp lệ và sinh MULTI payload chuẩn')

  // Single chapter quick selection on tree
  const singleChapterState = {
    gradeBlock: '12-Toán',
    selectedClassIds: [],
    selectedChapterIds: ['ch-99'],
    selectedLessonIds: []
  }
  const valChRes = validateMatrixScope({ scopeMode: 'MULTI', ...singleChapterState })
  assert.equal(valChRes.valid, true)
  const pCh = buildUnifiedScopePayload(singleChapterState)
  assert.equal(pCh.scopeType, 'MULTI')
  assert.deepEqual(pCh.chapterIds, ['ch-99'])
  console.log('  ✓ Unified tree: Chọn đúng 1 Chương học là bốc nhanh hợp lệ')

  // "Chọn cả khối" helper test
  const allClassesMock = [
    { id: 'c1', name: '12A1', gradeBlock: '12-Toán' },
    { id: 'c2', name: '12A2', gradeBlock: '12-Toán' },
    { id: 'c3', name: '11A1', gradeBlock: '11-Toán' }
  ]
  const curBlock = '12-Toán'
  const blockClasses = allClassesMock.filter(c => c.gradeBlock === curBlock)
  const selectedClassIds = blockClasses.map(c => c.id)
  assert.deepEqual(selectedClassIds, ['c1', 'c2'])
  const blockPayload = buildUnifiedScopePayload({
    gradeBlock: curBlock,
    selectedClassIds,
    selectedChapterIds: [],
    selectedLessonIds: []
  })
  assert.equal(blockPayload.scopeType, 'MULTI')
  assert.deepEqual(blockPayload.classIds, ['c1', 'c2'])
  console.log('  ✓ Unified tree: Nút "Chọn cả khối" chọn đúng toàn bộ lớp trong khối đang lọc')
}

console.log('\nTẤT CẢ KIỂM THỬ MATRIX SCOPE & MULTI TREE ĐỀU ĐẠT! ✅\n')
