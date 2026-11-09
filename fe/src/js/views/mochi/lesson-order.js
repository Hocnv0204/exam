import { parseLessonTimestamp, parseOrderIndex } from '../../utils/student-lesson-sort.js'

/**
 * So sánh 2 bài học theo thứ tự học TĂNG DẦN (Mochi):
 * 1. createdAt / created_at tăng dần (ngày tạo cũ nhất đến gần nhất).
 * 2. Bài có createdAt hợp lệ đứng trước bài thiếu createdAt.
 * 3. Tie-break: orderIndex / order_index tăng dần (số nhỏ trước, số lớn sau).
 * 4. Tie-break: id tăng dần (deterministic theo chuỗi).
 */
export function compareMochiLessons(a, b) {
  // 1. Ưu tiên ngày tạo cũ nhất đến gần nhất (createdAt / created_at tăng dần)
  const timeA = parseLessonTimestamp(a?.createdAt ?? a?.created_at)
  const timeB = parseLessonTimestamp(b?.createdAt ?? b?.created_at)
  const hasTimeA = timeA !== null
  const hasTimeB = timeB !== null

  if (hasTimeA && hasTimeB) {
    if (timeA !== timeB) {
      return timeA - timeB
    }
  } else if (hasTimeA && !hasTimeB) {
    return -1
  } else if (!hasTimeA && hasTimeB) {
    return 1
  }

  // 2. Tie-break: khi thiếu ngày tạo hoặc ngày tạo bằng nhau -> so theo orderIndex tăng dần
  const rawOrderA = parseOrderIndex(a?.orderIndex ?? a?.order_index)
  const rawOrderB = parseOrderIndex(b?.orderIndex ?? b?.order_index)
  const hasOrderA = rawOrderA !== -Infinity
  const hasOrderB = rawOrderB !== -Infinity

  if (hasOrderA && hasOrderB) {
    if (rawOrderA !== rawOrderB) {
      return rawOrderA - rawOrderB
    }
  } else if (hasOrderA && !hasOrderB) {
    return -1
  } else if (!hasOrderA && hasOrderB) {
    return 1
  }

  const idA = String(a?.id ?? '')
  const idB = String(b?.id ?? '')
  return idA.localeCompare(idB)
}

/**
 * Trả về mảng bài học mới được sắp xếp tăng dần, không mutate mảng gốc.
 */
export function sortMochiLessons(lessons) {
  if (!Array.isArray(lessons)) return []
  return [...lessons].sort(compareMochiLessons)
}

/**
 * So sánh 2 chương theo thứ tự TĂNG DẦN (Mochi):
 * 1. orderIndex / order_index tăng dần.
 * 2. Thiếu orderIndex -> theo createdAt / created_at tăng dần.
 * 3. Nếu cả 2 đều thiếu orderIndex: so sánh theo orderIndex / timestamp của bài học sớm nhất trong chương.
 * 4. Tie-break: id tăng dần.
 */
export function compareMochiChapters(a, b) {
  const rawOrderA = parseOrderIndex(a?.orderIndex ?? a?.order_index)
  const rawOrderB = parseOrderIndex(b?.orderIndex ?? b?.order_index)
  const hasOrderA = rawOrderA !== -Infinity
  const hasOrderB = rawOrderB !== -Infinity

  if (hasOrderA && hasOrderB) {
    if (rawOrderA !== rawOrderB) {
      return rawOrderA - rawOrderB
    }
  } else if (hasOrderA && !hasOrderB) {
    return -1
  } else if (!hasOrderA && hasOrderB) {
    return 1
  }

  const timeA = parseLessonTimestamp(a?.createdAt ?? a?.created_at)
  const timeB = parseLessonTimestamp(b?.createdAt ?? b?.created_at)
  const hasTimeA = timeA !== null
  const hasTimeB = timeB !== null

  if (hasTimeA && hasTimeB) {
    if (timeA !== timeB) {
      return timeA - timeB
    }
  } else if (hasTimeA && !hasTimeB) {
    return -1
  } else if (!hasTimeA && hasTimeB) {
    return 1
  }

  // Fallback: so theo bài học sớm nhất của từng chương (theo ngày tạo cũ nhất)
  const earliestA = Array.isArray(a?.lessons) && a.lessons.length ? a.lessons[0] : null
  const earliestB = Array.isArray(b?.lessons) && b.lessons.length ? b.lessons[0] : null
  if (earliestA && earliestB) {
    const lessonTimeA = parseLessonTimestamp(earliestA.createdAt ?? earliestA.created_at)
    const lessonTimeB = parseLessonTimestamp(earliestB.createdAt ?? earliestB.created_at)
    if (lessonTimeA !== null && lessonTimeB !== null && lessonTimeA !== lessonTimeB) {
      return lessonTimeA - lessonTimeB
    }
    const lessonOrderA = parseOrderIndex(earliestA.orderIndex ?? earliestA.order_index)
    const lessonOrderB = parseOrderIndex(earliestB.orderIndex ?? earliestB.order_index)
    if (lessonOrderA !== -Infinity && lessonOrderB !== -Infinity && lessonOrderA !== lessonOrderB) {
      return lessonOrderA - lessonOrderB
    }
  }

  const idA = String(a?.id ?? '')
  const idB = String(b?.id ?? '')
  return idA.localeCompare(idB)
}

/**
 * Trả về danh sách chương sắp xếp tăng dần, đồng thời sắp xếp bài học trong từng chương
 * tăng dần theo thứ tự học. Không mutate mảng hoặc object gốc.
 */
export function sortMochiChapters(chapters) {
  if (!Array.isArray(chapters)) return []
  return chapters
    .map(ch => ({
      ...ch,
      lessons: sortMochiLessons(ch?.lessons || [])
    }))
    .sort(compareMochiChapters)
}
