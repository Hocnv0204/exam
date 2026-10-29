/**
 * Curriculum State Management Helpers
 * Đảm bảo tính idempotent và đồng bộ nhất quán giữa các nguồn dữ liệu cache:
 * - Upsert chương học không bị trùng lặp khi mảng bị alias (cùng tham chiếu)
 * - Đồng bộ videoUrl, video_url và hasVideo cho toàn bộ các đối tượng cache/render
 * - Xóa link video triệt để (null), không để alias cũ hồi sinh URL
 */

/**
 * Chuẩn hóa URL video: trim khoảng trắng, trả về string hợp lệ hoặc null.
 * @param {string|null|undefined} videoUrl
 * @returns {string|null}
 */
export function normalizeVideoUrl(videoUrl) {
  if (typeof videoUrl !== 'string') return null
  const trimmed = videoUrl.trim()
  return trimmed.length > 0 ? trimmed : null
}

/**
 * Gán các trường liên quan đến video vào một object bài học.
 * Đảm bảo khi xóa (null / rỗng) thì cả videoUrl lẫn video_url đều bị xóa,
 * hasVideo chuyển thành false, không để alias nào khôi phục URL cũ.
 *
 * @param {Object} lesson
 * @param {string|null|undefined} rawVideoUrl
 * @returns {Object} lesson đã được cập nhật
 */
export function applyLessonVideoFields(lesson, rawVideoUrl) {
  if (!lesson || typeof lesson !== 'object') return lesson
  const normalized = normalizeVideoUrl(rawVideoUrl)
  lesson.videoUrl = normalized || ''
  lesson.video_url = normalized
  lesson.hasVideo = Boolean(normalized)
  return lesson
}

/** Sync a renamed lesson across all currently rendered and cached curriculum data. */
export function syncLessonTitle({
  lessonId,
  title,
  serverLessonsResult,
  cachedSummaries,
  activeClassId,
  state,
  currentChapters
} = {}) {
  if (!lessonId || typeof title !== 'string') return 0

  let updatedCount = 0
  const update = (lesson) => {
    if (!lesson || lesson.id !== lessonId) return
    lesson.title = title
    updatedCount++
  }

  for (const lesson of (serverLessonsResult?.items || [])) update(lesson)

  const summaries = activeClassId && cachedSummaries?.[activeClassId]
    ? [cachedSummaries[activeClassId]]
    : Object.values(cachedSummaries || {})
  for (const summary of summaries) {
    for (const lesson of (summary?.results || [])) update(lesson)
  }

  const chapterGroups = [
    ...(Array.isArray(currentChapters) ? currentChapters : []),
    ...((state?.curriculums || []).flatMap(curriculum => curriculum?.chapters || []))
  ]
  for (const chapter of chapterGroups) {
    for (const lesson of (chapter?.lessons || [])) update(lesson)
  }

  return updatedCount
}

/**
 * Đồng bộ videoUrl (và các alias video_url, hasVideo) cho mọi representation
 * của lessonId trong các tầng cache và state hiện tại:
 * 1. serverLessonsResult.items (nguồn render trực tiếp của workspace và list)
 * 2. cachedClassCurriculumSummaries (kết quả cache tóm tắt theo lớp)
 * 3. state.curriculums (cây chương - bài học lưu trong state toàn cục)
 * 4. currentChapters (mảng chương cục bộ của view curriculum)
 *
 * Chỉ gọi hàm này sau khi API update thành công.
 *
 * @param {Object} params
 * @param {string} params.lessonId
 * @param {string|null|undefined} params.videoUrl
 * @param {Object} [params.serverLessonsResult]
 * @param {Object} [params.cachedSummaries]
 * @param {string} [params.activeClassId]
 * @param {Object} [params.state]
 * @param {Array} [params.currentChapters]
 * @returns {{ updatedCount: number, normalizedUrl: string|null, hasVideo: boolean }}
 */
export function syncLessonVideoUrl({
  lessonId,
  videoUrl,
  serverLessonsResult,
  cachedSummaries,
  activeClassId,
  state,
  currentChapters
} = {}) {
  if (!lessonId) {
    return {
      updatedCount: 0,
      normalizedUrl: null,
      hasVideo: false
    }
  }

  const normalized = normalizeVideoUrl(videoUrl)
  const hasVideo = Boolean(normalized)
  let updatedCount = 0

  // 1. Đồng bộ serverLessonsResult.items
  if (serverLessonsResult && Array.isArray(serverLessonsResult.items)) {
    for (const item of serverLessonsResult.items) {
      if (item && item.id === lessonId) {
        applyLessonVideoFields(item, videoUrl)
        updatedCount++
      }
    }
  }

  // 2. Đồng bộ cachedSummaries (cachedClassCurriculumSummaries)
  if (cachedSummaries && typeof cachedSummaries === 'object') {
    const summariesToCheck = activeClassId && cachedSummaries[activeClassId]
      ? [cachedSummaries[activeClassId]]
      : Object.values(cachedSummaries)

    for (const summary of summariesToCheck) {
      if (summary && Array.isArray(summary.results)) {
        for (const item of summary.results) {
          if (item && item.id === lessonId) {
            applyLessonVideoFields(item, videoUrl)
            updatedCount++
          }
        }
      }
    }
  }

  // 3. Đồng bộ state.curriculums
  if (state && Array.isArray(state.curriculums)) {
    for (const curr of state.curriculums) {
      if (curr && Array.isArray(curr.chapters)) {
        for (const ch of curr.chapters) {
          if (ch && Array.isArray(ch.lessons)) {
            for (const l of ch.lessons) {
              if (l && l.id === lessonId) {
                applyLessonVideoFields(l, videoUrl)
                updatedCount++
              }
            }
          }
        }
      }
    }
  }

  // 4. Đồng bộ currentChapters
  if (Array.isArray(currentChapters)) {
    for (const ch of currentChapters) {
      if (ch && Array.isArray(ch.lessons)) {
        for (const l of ch.lessons) {
          if (l && l.id === lessonId) {
            applyLessonVideoFields(l, videoUrl)
            updatedCount++
          }
        }
      }
    }
  }

  return {
    updatedCount,
    normalizedUrl: normalized,
    hasVideo
  }
}

/**
 * Tìm kiếm bài học cho modal Video URL từ tất cả các nguồn cache khả dụng.
 * Tránh trường hợp chương chưa lazy-load lessons làm modal không mở được.
 *
 * @param {Object} params
 * @returns {Object|null}
 */
export function findLessonForVideoModal({
  lessonId,
  chapterId,
  activeClassId,
  state,
  currentChapters,
  serverLessonsResult,
  cachedSummaries
} = {}) {
  if (!lessonId) return null

  // 1. Tìm trong serverLessonsResult.items (nguồn chính xác nhất theo API search)
  if (serverLessonsResult && Array.isArray(serverLessonsResult.items)) {
    const found = serverLessonsResult.items.find(l => l && l.id === lessonId)
    if (found) return found
  }

  // 2. Tìm trong currentChapters / state.curriculums
  const currObj = state?.curriculums?.find(c => c && c.classId === activeClassId)
  const chaptersPool = [
    ...(Array.isArray(currentChapters) ? currentChapters : []),
    ...(Array.isArray(currObj?.chapters) ? currObj.chapters : [])
  ]

  if (chapterId && chapterId !== 'undefined' && chapterId !== 'null') {
    const targetCh = chaptersPool.find(c => c && c.id === chapterId)
    const found = targetCh?.lessons?.find(l => l && l.id === lessonId)
    if (found) return found
  }

  for (const ch of chaptersPool) {
    const found = ch?.lessons?.find(l => l && l.id === lessonId)
    if (found) return found
  }

  // 3. Tìm trong cachedSummaries
  if (cachedSummaries && activeClassId && cachedSummaries[activeClassId]?.results) {
    const found = cachedSummaries[activeClassId].results.find(l => l && l.id === lessonId)
    if (found) return found
  }

  return null
}

/**
 * Upsert chương vào mảng chapters theo id (idempotent).
 * Nếu đã có chapter mang id đó -> cập nhật in-place.
 * Nếu chưa có -> push vào mảng.
 *
 * @param {Array} chaptersList
 * @param {Object} newChapter
 * @returns {Array}
 */
export function upsertChapterItem(chaptersList, newChapter) {
  if (!Array.isArray(chaptersList) || !newChapter || !newChapter.id) {
    return chaptersList || []
  }
  const existingIdx = chaptersList.findIndex(ch => ch && ch.id === newChapter.id)
  if (existingIdx !== -1) {
    chaptersList[existingIdx] = {
      ...chaptersList[existingIdx],
      ...newChapter
    }
  } else {
    chaptersList.push(newChapter)
  }
  return chaptersList
}

/**
 * Cập nhật state chương mới một cách idempotent.
 * Xử lý chính xác cả khi currObj.chapters và currentChapters cùng tham chiếu (aliased)
 * lẫn khi là hai mảng khác nhau. Đồng thời cập nhật tổng số chương trong cachedSummaries.
 *
 * @param {Object} params
 * @param {Object} params.state
 * @param {string} params.activeClassId
 * @param {Array} [params.currentChapters]
 * @param {Object} params.newChapter
 * @param {Object} [params.cachedSummaries]
 * @returns {{ currObj: Object|null, currentChapters: Array }}
 */
export function upsertChapterState({
  state,
  activeClassId,
  currentChapters,
  newChapter,
  cachedSummaries
} = {}) {
  if (!newChapter || !newChapter.id) {
    return { currObj: null, currentChapters: currentChapters || [] }
  }

  let currObj = null
  if (state && Array.isArray(state.curriculums)) {
    currObj = state.curriculums.find(c => c && c.classId === activeClassId)
    if (!currObj) {
      currObj = { classId: activeClassId, chapters: [] }
      state.curriculums.push(currObj)
    }
    if (!Array.isArray(currObj.chapters)) {
      currObj.chapters = []
    }
    upsertChapterItem(currObj.chapters, newChapter)
  }

  if (Array.isArray(currentChapters)) {
    // Nếu currentChapters và currObj.chapters cùng tham chiếu,
    // newChapter đã được thêm ở bước trên; upsertChapterItem sẽ cập nhật in-place
    // mà KHÔNG push thêm lần thứ 2.
    // Nếu khác tham chiếu, newChapter sẽ được push vào currentChapters.
    upsertChapterItem(currentChapters, newChapter)
  }

  if (cachedSummaries && activeClassId && cachedSummaries[activeClassId]) {
    const totalCount = (currObj?.chapters || currentChapters || []).length
    cachedSummaries[activeClassId].totalChapters = totalCount
  }

  return { currObj, currentChapters }
}
