/**
 * student-lesson-sort.js
 *
 * Tiêu chí sắp xếp danh sách bài học học sinh (My Classes):
 * 1. Timestamp mới nhất -> cũ nhất (created_at / createdAt) giảm dần. Không dùng order_index làm primary sort.
 * 2. Thiếu hoặc invalid created_at được đưa về cuối danh sách.
 * 3. Tie-break: order_index lớn hơn xếp trước (mới hơn / số thứ tự lớn hơn).
 * 4. Danh sách chương được xếp theo ngày tạo của bài học mới nhất trong chương.
 * 5. Tie-break deterministic theo id tăng dần (chuỗi).
 *
 * Không mutate mảng hoặc object đầu vào.
 */

/**
 * Phân tích timestamp từ giá trị ngày tạo (ISO string, số, Date).
 * Trả về milliseconds (number) hợp lệ hoặc null nếu thiếu / không hợp lệ.
 */
export function parseLessonTimestamp(val) {
  if (val === null || val === undefined || val === '') return null
  if (typeof val === 'boolean') return null
  if (typeof val === 'object' && !(val instanceof Date)) return null
  const d = new Date(val)
  const time = d.getTime()
  return Number.isFinite(time) ? time : null
}

/**
 * Phân tích order_index / orderIndex thành số.
 * Nếu thiếu hoặc không hợp lệ, trả về -Infinity để bài có số thứ tự đứng trước.
 */
export function parseOrderIndex(val) {
  if (val === null || val === undefined || val === '') return -Infinity
  const num = Number(val)
  return Number.isFinite(num) ? num : -Infinity
}

/**
 * Hàm so sánh hai bài học theo quy tắc:
 * 1. Timestamp giảm dần (mới nhất trước). Thiếu / invalid date xuống cuối.
 * 2. Tie-break: order_index lớn hơn trước.
 * 3. Tie-break: id tăng dần (deterministic).
 */
export function compareStudentLessons(a, b) {
  const timeA = parseLessonTimestamp(a?.createdAt ?? a?.created_at)
  const timeB = parseLessonTimestamp(b?.createdAt ?? b?.created_at)

  const hasTimeA = timeA !== null
  const hasTimeB = timeB !== null

  // 1. Primary sort: timestamp giảm dần (mới nhất -> cũ nhất)
  if (hasTimeA && hasTimeB) {
    if (timeB !== timeA) {
      return timeB - timeA
    }
  } else if (hasTimeA && !hasTimeB) {
    return -1 // A có ngày hợp lệ, B không có -> A đứng trước
  } else if (!hasTimeA && hasTimeB) {
    return 1  // B có ngày hợp lệ, A không có -> B đứng trước
  }

  // 2. Tie-break: order_index lớn hơn xếp trước
  const orderA = parseOrderIndex(a?.orderIndex ?? a?.order_index)
  const orderB = parseOrderIndex(b?.orderIndex ?? b?.order_index)
  if (orderB !== orderA) {
    return orderB > orderA ? 1 : -1
  }

  // 3. Tie-break: deterministic theo id tăng dần
  const idA = String(a?.id ?? '')
  const idB = String(b?.id ?? '')
  return idA.localeCompare(idB)
}

/**
 * Trả về mảng bài học mới đã được sắp xếp, không mutate mảng gốc.
 */
export function sortStudentLessons(lessons) {
  if (!Array.isArray(lessons)) return []
  return [...lessons].sort(compareStudentLessons)
}

/**
 * Sắp xếp bài học trong từng chương mới nhất -> cũ nhất, đồng thời đưa
 * chương có bài học mới nhất lên trước để thứ tự toàn trang cũng mới -> cũ.
 * Chương không có ngày tạo hợp lệ nằm cuối; các chương đồng hạng giữ thứ tự gốc.
 */
export function sortClassChaptersLessons(chapters) {
  if (!Array.isArray(chapters)) return []
  return chapters
    .map((chapter, originalIndex) => {
      const lessons = sortStudentLessons(chapter?.lessons || [])
      const latestLessonTimestamp = lessons
        .map(lesson => parseLessonTimestamp(lesson?.createdAt ?? lesson?.created_at))
        .find(timestamp => timestamp !== null) ?? null

      return {
        chapter: { ...chapter, lessons },
        originalIndex,
        latestLessonTimestamp
      }
    })
    .sort((a, b) => {
      if (a.latestLessonTimestamp !== null && b.latestLessonTimestamp !== null) {
        if (a.latestLessonTimestamp !== b.latestLessonTimestamp) {
          return b.latestLessonTimestamp - a.latestLessonTimestamp
        }
      } else if (a.latestLessonTimestamp !== null) {
        return -1
      } else if (b.latestLessonTimestamp !== null) {
        return 1
      }
      return a.originalIndex - b.originalIndex
    })
    .map(entry => entry.chapter)
}

/**
 * Trả về danh sách phẳng toàn bộ bài học trong tất cả các chương của lớp,
 * sắp xếp theo:
 * 1. created_at / createdAt mới nhất -> cũ nhất (giảm dần).
 * 2. Thiếu hoặc invalid date đưa về cuối danh sách.
 * 3. Tie-break: order_index / orderIndex lớn hơn trước (giảm dần).
 * 4. Tie-break: id tăng dần (deterministic theo chuỗi).
 *
 * Mỗi bài học trong kết quả là object mới, giữ nguyên toàn bộ trường dữ liệu gốc
 * và bổ sung các trường:
 * - chapterId: id chương chứa bài học
 * - chapterTitle: tiêu đề chương (hoặc chuỗi rỗng nếu thiếu)
 * - chapterOrderIndex: số thứ tự chương (orderIndex / order_index hoặc null nếu thiếu)
 *
 * Không làm thay đổi (mutate) mảng hay object đầu vào.
 */
export function getClassLessonsNewestFirst(chapters) {
  if (!Array.isArray(chapters)) return []

  const flatLessons = []
  for (const chapter of chapters) {
    if (!chapter || !Array.isArray(chapter.lessons)) continue

    const chapterId = chapter.id ?? null
    const chapterTitle = chapter.title ?? ''
    const chapterOrderIndex = chapter.orderIndex ?? chapter.order_index ?? null

    for (const lesson of chapter.lessons) {
      if (!lesson || typeof lesson !== 'object') continue

      flatLessons.push({
        ...lesson,
        chapterId,
        chapterTitle,
        chapterOrderIndex
      })
    }
  }

  return flatLessons.sort(compareStudentLessons)
}
