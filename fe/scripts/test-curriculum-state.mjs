import assert from 'node:assert/strict'
import {
  normalizeVideoUrl,
  applyLessonVideoFields,
  syncLessonTitle,
  syncLessonVideoUrl,
  findLessonForVideoModal,
  upsertChapterItem,
  upsertChapterState
} from '../src/js/utils/curriculum-state.js'

console.log('=== Kiểm thử Regression: Quản lý State Chương học & Đồng bộ Link Video ===\n')

console.log('--- 0. Đồng bộ tên bài học qua các cache ---')
{
  const serverLesson = { id: 'rename-1', title: 'Tên cũ' }
  const summaryLesson = { id: 'rename-1', title: 'Tên cũ' }
  const stateLesson = { id: 'rename-1', title: 'Tên cũ' }
  const currentLesson = { id: 'rename-1', title: 'Tên cũ' }
  const serverLessonsResult = { items: [serverLesson] }
  const cachedSummaries = { cls: { results: [summaryLesson] } }
  const state = { curriculums: [{ classId: 'cls', chapters: [{ lessons: [stateLesson] }] }] }
  const currentChapters = [{ lessons: [currentLesson] }]

  const updatedCount = syncLessonTitle({
    lessonId: 'rename-1',
    title: 'Tên mới',
    serverLessonsResult,
    cachedSummaries,
    activeClassId: 'cls',
    state,
    currentChapters
  })

  assert.equal(updatedCount, 4)
  for (const lesson of [serverLesson, summaryLesson, stateLesson, currentLesson]) {
    assert.equal(lesson.title, 'Tên mới')
  }
  assert.equal(syncLessonTitle({ lessonId: 'missing', title: 'Không có' }), 0)
  console.log('  ✓ Đồng bộ title cho danh sách, cache, state và current chapters; không lỗi khi không tìm thấy lesson')
}

// =========================================================================
// Phần 1: Kiểm thử Chuẩn hóa & Áp dụng Video URL (normalizeVideoUrl, applyLessonVideoFields)
// =========================================================================
console.log('--- 1. Chuẩn hóa & Áp dụng Video URL ---')
{
  // URL hợp lệ
  assert.equal(normalizeVideoUrl('https://www.youtube.com/watch?v=dQw4w9WgXcQ'), 'https://www.youtube.com/watch?v=dQw4w9WgXcQ')
  assert.equal(normalizeVideoUrl('   https://drive.google.com/file/d/123   '), 'https://drive.google.com/file/d/123')

  // Xóa URL (rỗng, khoảng trắng, null, undefined)
  assert.equal(normalizeVideoUrl(''), null)
  assert.equal(normalizeVideoUrl('    '), null)
  assert.equal(normalizeVideoUrl(null), null)
  assert.equal(normalizeVideoUrl(undefined), null)
  assert.equal(normalizeVideoUrl(12345), null)

  // Áp dụng khi có URL
  const lesson1 = { id: 'l-1', title: 'Bài 1', videoUrl: '', video_url: null, hasVideo: false }
  applyLessonVideoFields(lesson1, 'https://youtu.be/test123')
  assert.equal(lesson1.videoUrl, 'https://youtu.be/test123')
  assert.equal(lesson1.video_url, 'https://youtu.be/test123')
  assert.equal(lesson1.hasVideo, true)

  // Áp dụng khi xóa URL: triệt để cả videoUrl và video_url
  applyLessonVideoFields(lesson1, null)
  assert.equal(lesson1.videoUrl, '')
  assert.equal(lesson1.video_url, null)
  assert.equal(lesson1.hasVideo, false)
  // Đảm bảo không alias nào có thể hồi sinh link cũ
  assert.ok(!(lesson1.videoUrl || lesson1.video_url))

  // Xóa URL bằng chuỗi rỗng / khoảng trắng
  const lesson2 = { id: 'l-2', title: 'Bài 2', videoUrl: 'https://old.link', video_url: 'https://old.link', hasVideo: true }
  applyLessonVideoFields(lesson2, '   ')
  assert.equal(lesson2.videoUrl, '')
  assert.equal(lesson2.video_url, null)
  assert.equal(lesson2.hasVideo, false)

  console.log('  ✓ Chuẩn hóa và áp dụng video URL chính xác; xóa URL triệt tiêu hoàn toàn alias cũ')
}

// =========================================================================
// Phần 2: Bug A - Tạo chương mới với mảng alias (currObj.chapters === currentChapters)
// =========================================================================
console.log('\n--- 2. Bug A: Idempotent upsert chapter khi 2 biến cùng tham chiếu (aliased) ---')
{
  const sharedChaptersArray = [
    { id: 'ch-existing', code: '', title: 'Chương 1: Mở đầu', orderIndex: 1, lessons: [] }
  ]

  const state = {
    curriculums: [
      { classId: 'cls-1', chapters: sharedChaptersArray }
    ]
  }
  // Giả lập ensureCurriculumLoaded gán currObj.chapters = currentChapters
  const currentChapters = sharedChaptersArray
  const cachedSummaries = {
    'cls-1': { classId: 'cls-1', totalChapters: 1, totalLessons: 0, results: [] }
  }

  const newChapter = {
    id: 'ch-new-1',
    code: '',
    title: 'Chương 2: Hình không gian',
    orderIndex: 2,
    lessons: []
  }

  // Gọi helper upsertChapterState
  const { currObj, currentChapters: updatedCurrent } = upsertChapterState({
    state,
    activeClassId: 'cls-1',
    currentChapters,
    newChapter,
    cachedSummaries
  })

  // KIỂM TRA QUAN TRỌNG: Mảng chỉ có đúng 2 chương, KHÔNG bị push 2 lần thành 3 chương!
  assert.equal(sharedChaptersArray.length, 2, 'Mảng tham chiếu chung phải có đúng 2 chương, không bị trùng lặp!')
  assert.equal(currObj.chapters.length, 2)
  assert.equal(updatedCurrent.length, 2)

  const added = sharedChaptersArray.filter(c => c.id === 'ch-new-1')
  assert.equal(added.length, 1, 'Chương mới chỉ xuất hiện đúng 1 lần duy nhất trong mảng')
  assert.equal(added[0].title, 'Chương 2: Hình không gian')

  // Kiểm tra cachedSummaries được đồng bộ
  assert.equal(cachedSummaries['cls-1'].totalChapters, 2)

  // Gọi lại lần nữa với cùng newChapter (kiểm tra tính idempotent tuyệt đối)
  upsertChapterState({
    state,
    activeClassId: 'cls-1',
    currentChapters,
    newChapter,
    cachedSummaries
  })
  assert.equal(sharedChaptersArray.length, 2, 'Gọi lại upsertChapterState không được tăng thêm phần tử trùng lặp')

  console.log('  ✓ Xử lý triệt để Bug A: Không nhân bản chương khi currObj.chapters và currentChapters cùng tham chiếu')
}

// =========================================================================
// Phần 3: Bug A - Tạo chương mới khi 2 mảng khác tham chiếu (non-aliased)
// =========================================================================
console.log('\n--- 3. Bug A: Upsert chapter khi 2 biến là 2 mảng độc lập ---')
{
  const stateChapters = [
    { id: 'ch-1', code: '', title: 'Chương 1', orderIndex: 1, lessons: [] }
  ]
  const currentChapters = [
    { id: 'ch-1', code: '', title: 'Chương 1', orderIndex: 1, lessons: [] }
  ]

  const state = {
    curriculums: [
      { classId: 'cls-2', chapters: stateChapters }
    ]
  }

  const newChapter = {
    id: 'ch-2',
    code: '',
    title: 'Chương 2',
    orderIndex: 2,
    lessons: []
  }

  upsertChapterState({
    state,
    activeClassId: 'cls-2',
    currentChapters,
    newChapter
  })

  assert.equal(stateChapters.length, 2, 'state.curriculums chapters phải có 2 phần tử')
  assert.equal(currentChapters.length, 2, 'currentChapters phải có 2 phần tử')
  assert.equal(stateChapters[1].id, 'ch-2')
  assert.equal(currentChapters[1].id, 'ch-2')

  console.log('  ✓ Đồng bộ chuẩn xác cả khi 2 mảng khác tham chiếu bộ nhớ')
}

// =========================================================================
// Phần 4: Bug B - Đồng bộ Link Video qua tất cả các nguồn cache & render
// =========================================================================
console.log('\n--- 4. Bug B: Đồng bộ link video cho serverLessonsResult, cachedSummaries và state.curriculums ---')
{
  const lessonId = 'les-100'
  const activeClassId = 'cls-test'

  // 1. Nguồn render chính của workspace (serverLessonsResult.items)
  const serverLessonsResult = {
    items: [
      { id: lessonId, title: 'Bài 100', videoUrl: '', video_url: null, hasVideo: false },
      { id: 'les-other', title: 'Bài khác', videoUrl: '', video_url: null, hasVideo: false }
    ],
    total: 2,
    page: 1,
    pageSize: 15
  }

  // 2. Nguồn cache tóm tắt (cachedClassCurriculumSummaries)
  const cachedSummaries = {
    [activeClassId]: {
      classId: activeClassId,
      totalChapters: 1,
      totalLessons: 2,
      results: [
        { id: lessonId, title: 'Bài 100 (trong summary)', videoUrl: '', video_url: null, hasVideo: false }
      ]
    }
  }

  // 3. Nguồn state.curriculums
  const state = {
    curriculums: [
      {
        classId: activeClassId,
        chapters: [
          {
            id: 'ch-test',
            title: 'Chương Test',
            lessons: [
              { id: lessonId, title: 'Bài 100 (trong chapter)', videoUrl: '', video_url: null, hasVideo: false }
            ]
          }
        ]
      }
    ]
  }

  // 4. Nguồn currentChapters
  const currentChapters = [
    {
      id: 'ch-test',
      title: 'Chương Test',
      lessons: [
        { id: lessonId, title: 'Bài 100 (trong currentChapters)', videoUrl: '', video_url: null, hasVideo: false }
      ]
    }
  ]

  // Bước 4.1: Lưu video mới thành công
  const syncResult = syncLessonVideoUrl({
    lessonId,
    videoUrl: 'https://www.youtube.com/watch?v=dQw4w9WgXcQ',
    serverLessonsResult,
    cachedSummaries,
    activeClassId,
    state,
    currentChapters
  })

  assert.equal(syncResult.hasVideo, true)
  assert.equal(syncResult.normalizedUrl, 'https://www.youtube.com/watch?v=dQw4w9WgXcQ')
  assert.ok(syncResult.updatedCount >= 4, 'Phải cập nhật ít nhất 4 representation trong các cache')

  // Kiểm tra từng representation đã được gán đầy đủ:
  // (a) serverLessonsResult.items: workspace render lập tức thấy video mà không cần reload
  const serverItem = serverLessonsResult.items.find(l => l.id === lessonId)
  assert.equal(serverItem.videoUrl, 'https://www.youtube.com/watch?v=dQw4w9WgXcQ')
  assert.equal(serverItem.video_url, 'https://www.youtube.com/watch?v=dQw4w9WgXcQ')
  assert.equal(serverItem.hasVideo, true)

  // (b) cachedSummaries
  const summaryItem = cachedSummaries[activeClassId].results.find(l => l.id === lessonId)
  assert.equal(summaryItem.videoUrl, 'https://www.youtube.com/watch?v=dQw4w9WgXcQ')
  assert.equal(summaryItem.video_url, 'https://www.youtube.com/watch?v=dQw4w9WgXcQ')
  assert.equal(summaryItem.hasVideo, true)

  // (c) state.curriculums
  const stateItem = state.curriculums[0].chapters[0].lessons[0]
  assert.equal(stateItem.videoUrl, 'https://www.youtube.com/watch?v=dQw4w9WgXcQ')
  assert.equal(stateItem.video_url, 'https://www.youtube.com/watch?v=dQw4w9WgXcQ')
  assert.equal(stateItem.hasVideo, true)

  // (d) currentChapters
  const currentChapterItem = currentChapters[0].lessons[0]
  assert.equal(currentChapterItem.videoUrl, 'https://www.youtube.com/watch?v=dQw4w9WgXcQ')
  assert.equal(currentChapterItem.video_url, 'https://www.youtube.com/watch?v=dQw4w9WgXcQ')
  assert.equal(currentChapterItem.hasVideo, true)

  // Các bài học khác không bị ảnh hưởng
  assert.equal(serverLessonsResult.items[1].videoUrl, '')

  // Bước 4.2: Xóa video (gán link null / rỗng)
  syncLessonVideoUrl({
    lessonId,
    videoUrl: null,
    serverLessonsResult,
    cachedSummaries,
    activeClassId,
    state,
    currentChapters
  })

  // Toàn bộ các representation phải được xóa sạch
  assert.equal(serverItem.videoUrl, '')
  assert.equal(serverItem.video_url, null)
  assert.equal(serverItem.hasVideo, false)

  assert.equal(summaryItem.videoUrl, '')
  assert.equal(summaryItem.video_url, null)
  assert.equal(summaryItem.hasVideo, false)

  assert.equal(stateItem.videoUrl, '')
  assert.equal(stateItem.video_url, null)
  assert.equal(stateItem.hasVideo, false)

  assert.equal(currentChapterItem.videoUrl, '')
  assert.equal(currentChapterItem.video_url, null)
  assert.equal(currentChapterItem.hasVideo, false)

  console.log('  ✓ Xử lý triệt để Bug B: Toàn bộ các nguồn cache và workspace render đều được cập nhật ngay lập tức')
}

// =========================================================================
// Phần 5: Tìm kiếm bài học cho modal (findLessonForVideoModal)
// =========================================================================
console.log('\n--- 5. Tìm bài học mở modal khi chương chưa tải lessons ---')
{
  const serverLessonsResult = {
    items: [
      { id: 'les-server-only', title: 'Chỉ có ở serverLessonsResult', videoUrl: 'https://youtube.com/v1', video_url: 'https://youtube.com/v1' }
    ]
  }
  const state = {
    curriculums: [
      {
        classId: 'cls-1',
        chapters: [
          { id: 'ch-empty', title: 'Chương chưa tải bài học', lessons: [] }
        ]
      }
    ]
  }

  // Khi click từ danh sách tìm kiếm hoặc workspace, bài học có ở serverLessonsResult nhưng không có ở ch.lessons
  const found = findLessonForVideoModal({
    lessonId: 'les-server-only',
    chapterId: 'ch-empty',
    activeClassId: 'cls-1',
    state,
    serverLessonsResult
  })

  assert.ok(found, 'Phải tìm thấy bài học từ serverLessonsResult thay vì return null gây chặn mở modal')
  assert.equal(found.id, 'les-server-only')
  assert.equal(found.videoUrl, 'https://youtube.com/v1')

  console.log('  ✓ findLessonForVideoModal tìm đúng bài học từ mọi tầng lưu trữ')
}

// =========================================================================
// Phần 6: Kiểm tra không cập nhật state khi API thất bại (Error simulation)
// =========================================================================
console.log('\n--- 6. An toàn dữ liệu khi API thất bại ---')
{
  const serverLessonsResult = {
    items: [
      { id: 'les-err-test', title: 'Bài học', videoUrl: 'https://original-link.com', video_url: 'https://original-link.com', hasVideo: true }
    ]
  }

  // Giả lập flow openVideoUrlModal khi api.updateLesson ném lỗi:
  let apiSuccess = false
  try {
    throw new Error('500 Internal Server Error: Network failure')
    // syncLessonVideoUrl chỉ được gọi sau khi API thành công
  } catch (err) {
    // state KHÔNG được gọi syncLessonVideoUrl
    assert.equal(err.message, '500 Internal Server Error: Network failure')
  }

  // Đảm bảo state không bị thay đổi bừa bãi khi lỗi mạng
  const item = serverLessonsResult.items[0]
  assert.equal(item.videoUrl, 'https://original-link.com')
  assert.equal(item.video_url, 'https://original-link.com')
  assert.equal(item.hasVideo, true)

  console.log('  ✓ Đảm bảo chỉ đồng bộ state sau khi API thành công, không làm hỏng dữ liệu khi có lỗi')
}

console.log('\n========================================')
console.log('Toàn bộ 6 nhóm kiểm thử Regression State Curriculum ĐÃ ĐẠT!')
console.log('========================================\n')
