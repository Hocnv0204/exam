/**
 * test-student-lesson-sort.mjs — Kiểm thử logic sắp xếp bài học học sinh (My Classes).
 *
 * Tiêu chí kiểm thử:
 * 1. Timestamp mới nhất -> cũ nhất (created_at / createdAt) giảm dần, không dùng order_index làm primary sort.
 * 2. Thiếu / invalid created_at đưa về cuối.
 * 3. Tie-break: order_index lớn hơn xếp trước (mới hơn / số thứ tự lớn hơn).
 * 4. Tie-break: id tăng dần (deterministic theo chuỗi).
 * 5. Giữ nguyên 100% thứ tự các chương học.
 * 6. Không mutate mảng / object đầu vào. Giữ nguyên mapping homeworks, videoUrl, theoryFiles, createdAt...
 * 7. Kiểm tra kết nối (wiring) trong fe/src/js/app.js và không vi phạm sửa fe/src/js/views/my-classes.js.
 */

import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, resolve } from 'node:path'

import {
  parseLessonTimestamp,
  parseOrderIndex,
  compareStudentLessons,
  sortStudentLessons,
  sortClassChaptersLessons,
  getClassLessonsNewestFirst
} from '../src/js/utils/student-lesson-sort.js'

const scriptsDir = dirname(fileURLToPath(import.meta.url))
const feRoot = resolve(scriptsDir, '..')

let passCount = 0
let failCount = 0

function assert(description, actual, expected) {
  const actualStr = JSON.stringify(actual)
  const expectedStr = JSON.stringify(expected)
  if (actualStr === expectedStr) {
    console.log(`  ✓ ${description}`)
    passCount++
  } else {
    console.error(`  ✗ FAIL: ${description}`)
    console.error(`     Nhận:  ${actualStr}`)
    console.error(`     Kỳ vọng: ${expectedStr}`)
    failCount++
  }
}

console.log('\n=== 1. Phân tích timestamp (parseLessonTimestamp) ===')
{
  assert('ISO string hợp lệ', parseLessonTimestamp('2026-10-25T14:30:00.000Z'), 1792938600000)
  assert('Date string dạng ngày YYYY-MM-DD', typeof parseLessonTimestamp('2026-05-15'), 'number')
  assert('Milliseconds number', parseLessonTimestamp(1792938600000), 1792938600000)
  assert('Date object', parseLessonTimestamp(new Date('2026-01-01T00:00:00Z')), 1767225600000)
  assert('Chuỗi rác / invalid date string -> null', parseLessonTimestamp('invalid-date-string'), null)
  assert('Chuỗi rỗng -> null', parseLessonTimestamp(''), null)
  assert('null -> null', parseLessonTimestamp(null), null)
  assert('undefined -> null', parseLessonTimestamp(undefined), null)
  assert('boolean false -> null', parseLessonTimestamp(false), null)
  assert('boolean true -> null', parseLessonTimestamp(true), null)
  assert('Object rỗng -> null', parseLessonTimestamp({}), null)
  assert('Array rỗng -> null', parseLessonTimestamp([]), null)
}

console.log('\n=== 2. Phân tích order_index (parseOrderIndex) ===')
{
  assert('Số dương', parseOrderIndex(5), 5)
  assert('Số 0', parseOrderIndex(0), 0)
  assert('Chuỗi số', parseOrderIndex('12'), 12)
  assert('Số âm', parseOrderIndex(-1), -1)
  assert('null -> -Infinity', parseOrderIndex(null), -Infinity)
  assert('undefined -> -Infinity', parseOrderIndex(undefined), -Infinity)
  assert('Chuỗi rỗng -> -Infinity', parseOrderIndex(''), -Infinity)
  assert('Chuỗi không phải số -> -Infinity', parseOrderIndex('abc'), -Infinity)
}

console.log('\n=== 3. Sắp xếp mixed dates: mới nhất -> cũ nhất, không dùng order_index làm primary ===')
{
  const lessons = [
    { id: 'l1', title: 'Bài cũ nhất nhưng order_index lớn', createdAt: '2026-01-01T08:00:00Z', order_index: 99 },
    { id: 'l2', title: 'Bài mới nhất order_index nhỏ', createdAt: '2026-06-15T12:00:00Z', order_index: 1 },
    { id: 'l3', title: 'Bài ở giữa', createdAt: '2026-03-20T09:00:00Z', order_index: 50 }
  ]

  const sorted = sortStudentLessons(lessons)
  const ids = sorted.map(l => l.id)
  assert('Sắp xếp giảm dần theo timestamp (mới nhất l2 -> l3 -> l1)', ids, ['l2', 'l3', 'l1'])
  assert('order_index lớn không được ưu tiên hơn ngày mới hơn', ids[0], 'l2')
}

console.log('\n=== 4. Xử lý thiếu hoặc invalid created_at: đưa về cuối ===')
{
  const lessons = [
    { id: 'missing-date-1', title: 'Không có created_at', createdAt: null, order_index: 10 },
    { id: 'valid-date-old', title: 'Ngày cũ', createdAt: '2026-02-01T00:00:00Z', order_index: 1 },
    { id: 'invalid-date', title: 'Ngày rác', createdAt: 'sai-dinh-dang', order_index: 20 },
    { id: 'valid-date-new', title: 'Ngày mới', createdAt: '2026-08-01T00:00:00Z', order_index: 2 },
    { id: 'empty-date', title: 'Ngày chuỗi rỗng', createdAt: '', order_index: 5 }
  ]

  const sorted = sortStudentLessons(lessons)
  const ids = sorted.map(l => l.id)

  // 2 bài có ngày hợp lệ phải đứng đầu: valid-date-new -> valid-date-old
  assert('Bài có ngày hợp lệ đứng trước', ids.slice(0, 2), ['valid-date-new', 'valid-date-old'])

  // 3 bài thiếu/invalid date bị đưa về sau; trong đó tie-break bằng order_index (20 -> 10 -> 5)
  assert('Bài thiếu / invalid date đưa về cuối và tie-break theo order_index', ids.slice(2), [
    'invalid-date',
    'missing-date-1',
    'empty-date'
  ])
}

console.log('\n=== 5. Tie-break khi cùng timestamp hoặc cùng thiếu timestamp ===')
{
  // Cùng timestamp, khác order_index
  const sameDateMixedOrder = [
    { id: 'l-ord-2', createdAt: '2026-05-01T00:00:00Z', order_index: 2 },
    { id: 'l-ord-10', createdAt: '2026-05-01T00:00:00Z', order_index: 10 },
    { id: 'l-ord-5', createdAt: '2026-05-01T00:00:00Z', order_index: 5 }
  ]
  const sortedOrder = sortStudentLessons(sameDateMixedOrder)
  assert('Cùng timestamp: order_index lớn xếp trước', sortedOrder.map(l => l.id), ['l-ord-10', 'l-ord-5', 'l-ord-2'])

  // Cùng timestamp, cùng order_index: deterministic theo id tăng dần
  const sameDateSameOrder = [
    { id: 'l-gamma', createdAt: '2026-05-01T00:00:00Z', order_index: 1 },
    { id: 'l-alpha', createdAt: '2026-05-01T00:00:00Z', order_index: 1 },
    { id: 'l-beta', createdAt: '2026-05-01T00:00:00Z', order_index: 1 }
  ]
  const sortedIds = sortStudentLessons(sameDateSameOrder)
  assert('Cùng timestamp và order_index: deterministic theo id tăng dần', sortedIds.map(l => l.id), [
    'l-alpha',
    'l-beta',
    'l-gamma'
  ])

  // Cả hai cùng thiếu date và thiếu order_index: deterministic theo id
  const missingBoth = [
    { id: 'id-999', createdAt: null, order_index: null },
    { id: 'id-111', createdAt: undefined, order_index: undefined }
  ]
  const sortedMissing = sortStudentLessons(missingBoth)
  assert('Thiếu cả date và order_index: fallback deterministic id', sortedMissing.map(l => l.id), ['id-111', 'id-999'])

  // Hỗ trợ cả định dạng created_at (snake_case từ DB) và orderIndex (camelCase)
  const snakeCamelLessons = [
    { id: 'snake-1', created_at: '2026-07-01T00:00:00Z', orderIndex: 1 },
    { id: 'camel-2', createdAt: '2026-07-02T00:00:00Z', order_index: 1 }
  ]
  const sortedSnakeCamel = sortStudentLessons(snakeCamelLessons)
  assert('Tương thích createdAt lẫn created_at, orderIndex lẫn order_index', sortedSnakeCamel.map(l => l.id), [
    'camel-2',
    'snake-1'
  ])
}

console.log('\n=== 6. Thứ tự toàn trang theo bài mới nhất trong chương ===')
{
  const chapters = [
    {
      id: 'ch-1',
      title: 'Chương 1: Hàm số',
      orderIndex: 1,
      lessons: [
        { id: 'ch1-l1', title: 'Bài 1.1', createdAt: '2026-01-10T00:00:00Z', order_index: 1 },
        { id: 'ch1-l2', title: 'Bài 1.2 (mới hơn)', createdAt: '2026-04-10T00:00:00Z', order_index: 2 }
      ]
    },
    {
      id: 'ch-2',
      title: 'Chương 2: Tọa độ không gian',
      orderIndex: 2,
      lessons: [
        { id: 'ch2-l1', title: 'Bài 2.1', createdAt: '2026-02-15T00:00:00Z', order_index: 1 },
        { id: 'ch2-l2', title: 'Bài 2.2 (siêu mới)', createdAt: '2026-09-01T00:00:00Z', order_index: 2 }
      ]
    },
    {
      id: 'ch-3',
      title: 'Chương 3: Xác suất',
      orderIndex: 3,
      lessons: [
        { id: 'ch3-l1', title: 'Bài 3.1', createdAt: '2026-03-01T00:00:00Z', order_index: 1 }
      ]
    }
  ]

  const transformed = sortClassChaptersLessons(chapters)

  assert('Chương có bài mới nhất (9/1) lên trước', transformed.map(c => c.id), ['ch-2', 'ch-1', 'ch-3'])
  assert('Bài học chương 2 được sắp xếp mới trước', transformed[0].lessons.map(l => l.id), ['ch2-l2', 'ch2-l1'])
  assert('Bài học chương 1 được sắp xếp mới trước', transformed[1].lessons.map(l => l.id), ['ch1-l2', 'ch1-l1'])
  assert('Bài học chương 3 giữ nguyên', transformed[2].lessons.map(l => l.id), ['ch3-l1'])

  const tiedAndMissing = sortClassChaptersLessons([
    { id: 'tie-a', orderIndex: 1, lessons: [{ id: 'a', createdAt: '2026-05-01' }] },
    { id: 'tie-b', orderIndex: 2, lessons: [{ id: 'b', createdAt: '2026-05-01' }] },
    { id: 'missing', lessons: [{ id: 'm', createdAt: null }] }
  ])
  assert('Chương cùng ngày giữ thứ tự gốc; chương thiếu ngày xuống cuối', tiedAndMissing.map(c => c.id), ['tie-a', 'tie-b', 'missing'])
}

console.log('\n=== 7. Tính bất biến (Immutability) và bảo toàn mapping payload ===')
{
  const originalHw = {
    id: 'hw-1',
    title: 'Bài tập 1',
    durationMinutes: 45,
    passScore: 5,
    maxScore: 10,
    deadline: '2026-11-01',
    maxAttempts: 3,
    type: 'PRACTICE'
  }
  const originalLesson = {
    id: 'lesson-orig',
    code: '1',
    title: 'Bài gốc',
    videoUrl: 'https://youtu.be/test',
    theoryFiles: [{ name: 'file.pdf', url: '/files/file.pdf' }],
    createdAt: '2026-04-01T00:00:00Z',
    order_index: 1,
    content: '<p>Nội dung</p>',
    homeworks: [originalHw]
  }

  const rawChapters = [
    {
      id: 'ch-immut',
      title: 'Chương bất biến',
      orderIndex: 1,
      lessons: [originalLesson]
    }
  ]

  // Đóng băng mảng để phát hiện bất kỳ hành vi mutate nào
  Object.freeze(rawChapters)
  Object.freeze(rawChapters[0])
  Object.freeze(rawChapters[0].lessons)
  Object.freeze(originalLesson)
  Object.freeze(originalLesson.homeworks)
  Object.freeze(originalHw)

  let result
  let didThrow = false
  try {
    result = sortClassChaptersLessons(rawChapters)
  } catch (err) {
    didThrow = true
    console.error('Lỗi mutation khi chạy sortClassChaptersLessons:', err)
  }

  assert('Không throw lỗi khi đầu vào bị Object.freeze', didThrow, false)
  assert('Trả về mảng chương mới', result !== rawChapters, true)
  assert('Trả về mảng bài học mới', result[0].lessons !== rawChapters[0].lessons, true)

  const resLesson = result[0].lessons[0]
  assert('Bảo toàn videoUrl', resLesson.videoUrl, 'https://youtu.be/test')
  assert('Bảo toàn theoryFiles', resLesson.theoryFiles.length, 1)
  assert('Bảo toàn homeworks mapping', resLesson.homeworks[0].id, 'hw-1')
  assert('Bảo toàn content', resLesson.content, '<p>Nội dung</p>')
  assert('Bảo toàn createdAt', resLesson.createdAt, '2026-04-01T00:00:00Z')
}

console.log('\n=== 8. Kiểm tra kết nối (Wiring) trong app.js & tính khả dụng của helper ===')
{
  const appJsContent = readFileSync(resolve(feRoot, 'src/js/app.js'), 'utf-8')
  assert(
    'app.js có import sortClassChaptersLessons',
    appJsContent.includes("import { sortClassChaptersLessons } from './utils/student-lesson-sort.js'"),
    true
  )
  assert(
    'app.js gọi sortClassChaptersLessons trước khi gán state.classChapters',
    appJsContent.includes('state.classChapters = sortClassChaptersLessons(mappedChapters)'),
    true
  )
  assert(
    'getClassLessonsNewestFirst là hàm export sẵn sàng cho UI',
    typeof getClassLessonsNewestFirst,
    'function'
  )
}

console.log('\n=== 9. getClassLessonsNewestFirst: Mixed chapters toàn cục (mới nhất -> cũ nhất) ===')
{
  const mixedChapters = [
    {
      id: 'ch-calc',
      title: 'Chương 1: Giải tích 12',
      orderIndex: 1,
      lessons: [
        { id: 'calc-l1', title: 'Bài 1: Đơn điệu', createdAt: '2026-02-01T10:00:00Z', order_index: 1 },
        { id: 'calc-l2', title: 'Bài 2: Cực trị (mới)', createdAt: '2026-06-01T10:00:00Z', order_index: 2 }
      ]
    },
    {
      id: 'ch-geom',
      title: 'Chương 2: Tọa độ không gian',
      orderIndex: 2,
      lessons: [
        { id: 'geom-l1', title: 'Bài 1: Hệ trục Oxyz', createdAt: '2026-04-01T10:00:00Z', order_index: 1 },
        { id: 'geom-l2', title: 'Bài 2: Phương trình mặt phẳng (siêu mới)', createdAt: '2026-08-01T10:00:00Z', order_index: 2 }
      ]
    },
    {
      id: 'ch-prob',
      title: 'Chương 3: Xác suất',
      orderIndex: 3,
      lessons: [
        { id: 'prob-l1', title: 'Bài 1: Biến cố', createdAt: '2026-05-15T10:00:00Z', order_index: 1 },
        { id: 'prob-l2', title: 'Bài 2: Xác suất có điều kiện (rất cũ)', createdAt: '2026-01-15T10:00:00Z', order_index: 2 }
      ]
    }
  ]

  const flatList = getClassLessonsNewestFirst(mixedChapters)
  const ids = flatList.map(l => l.id)

  assert('Trả về danh sách phẳng gồm toàn bộ bài học (6 bài)', flatList.length, 6)
  assert('Thứ tự toàn cục chuẩn: 08-01 -> 06-01 -> 05-15 -> 04-01 -> 02-01 -> 01-15', ids, [
    'geom-l2',
    'calc-l2',
    'prob-l1',
    'geom-l1',
    'calc-l1',
    'prob-l2'
  ])
  assert('Bài mới nhất toàn lớp đứng đầu (geom-l2)', ids[0], 'geom-l2')
  assert('Bài cũ nhất toàn lớp đứng cuối (prob-l2)', ids[ids.length - 1], 'prob-l2')
}

console.log('\n=== 10. getClassLessonsNewestFirst: Xử lý thiếu hoặc invalid created_at toàn cục ===')
{
  const chaptersWithBadDates = [
    {
      id: 'ch-a',
      title: 'Chương A',
      orderIndex: 1,
      lessons: [
        { id: 'a-valid-1', title: 'Bài A hợp lệ', createdAt: '2026-07-01T00:00:00Z', order_index: 1 },
        { id: 'a-invalid', title: 'Bài A ngày rác', createdAt: 'invalid-iso-date', order_index: 10 },
        { id: 'a-null', title: 'Bài A null date', createdAt: null, order_index: 30 }
      ]
    },
    {
      id: 'ch-b',
      title: 'Chương B',
      orderIndex: 2,
      lessons: [
        { id: 'b-valid-2', title: 'Bài B hợp lệ cũ hơn', createdAt: '2026-03-01T00:00:00Z', order_index: 1 },
        { id: 'b-undefined', title: 'Bài B undefined date', createdAt: undefined, order_index: 20 },
        { id: 'b-empty', title: 'Bài B ngày rỗng', createdAt: '', order_index: 5 }
      ]
    }
  ]

  const flatList = getClassLessonsNewestFirst(chaptersWithBadDates)
  const ids = flatList.map(l => l.id)

  // 2 bài có ngày hợp lệ xếp trước theo thứ tự mới -> cũ
  assert('Các bài có ngày hợp lệ đứng trước toàn cục', ids.slice(0, 2), ['a-valid-1', 'b-valid-2'])

  // 4 bài thiếu / sai ngày bị dồn về cuối, tie-break theo order_index giảm dần: 30 -> 20 -> 10 -> 5
  assert('Các bài thiếu hoặc invalid date xuống cuối và tie-break theo order_index giảm dần', ids.slice(2), [
    'a-null',
    'b-undefined',
    'a-invalid',
    'b-empty'
  ])
}

console.log('\n=== 11. getClassLessonsNewestFirst: Deterministic tie-break và snake_case/camelCase ===')
{
  // Cùng timestamp, khác orderIndex / order_index qua các chương khác nhau
  const sameDateMixedOrderChapters = [
    {
      id: 'ch-x',
      lessons: [
        { id: 'l-x-2', createdAt: '2026-05-01T00:00:00Z', orderIndex: 2 }
      ]
    },
    {
      id: 'ch-y',
      lessons: [
        { id: 'l-y-10', createdAt: '2026-05-01T00:00:00Z', order_index: 10 }
      ]
    },
    {
      id: 'ch-z',
      lessons: [
        { id: 'l-z-5', createdAt: '2026-05-01T00:00:00Z', orderIndex: 5 }
      ]
    }
  ]
  const sortedOrder = getClassLessonsNewestFirst(sameDateMixedOrderChapters)
  assert('Cùng timestamp: tie-break order_index giảm dần (10 -> 5 -> 2)', sortedOrder.map(l => l.id), [
    'l-y-10',
    'l-z-5',
    'l-x-2'
  ])

  // Cùng timestamp và cùng order_index: deterministic theo id tăng dần (chuỗi localeCompare)
  const sameDateSameOrderChapters = [
    {
      id: 'ch-1',
      lessons: [{ id: 'lesson-omega', createdAt: '2026-05-01T00:00:00Z', order_index: 1 }]
    },
    {
      id: 'ch-2',
      lessons: [{ id: 'lesson-alpha', createdAt: '2026-05-01T00:00:00Z', order_index: 1 }]
    },
    {
      id: 'ch-3',
      lessons: [{ id: 'lesson-delta', createdAt: '2026-05-01T00:00:00Z', order_index: 1 }]
    }
  ]
  const sortedSameOrder = getClassLessonsNewestFirst(sameDateSameOrderChapters)
  assert('Cùng timestamp và order_index: tie-break deterministic theo id tăng dần', sortedSameOrder.map(l => l.id), [
    'lesson-alpha',
    'lesson-delta',
    'lesson-omega'
  ])

  // Cùng thiếu date và cùng thiếu order_index: fallback deterministic id
  const missingBothChapters = [
    {
      id: 'ch-m1',
      lessons: [{ id: 'id-zzz', createdAt: null, order_index: null }]
    },
    {
      id: 'ch-m2',
      lessons: [{ id: 'id-aaa', createdAt: undefined, order_index: undefined }]
    }
  ]
  const sortedMissing = getClassLessonsNewestFirst(missingBothChapters)
  assert('Thiếu cả date và order_index: fallback deterministic id', sortedMissing.map(l => l.id), [
    'id-aaa',
    'id-zzz'
  ])

  // Tương thích snake_case (created_at, order_index) lẫn camelCase (createdAt, orderIndex)
  const snakeCamelChapters = [
    {
      id: 'ch-sc',
      lessons: [
        { id: 'sc-snake', created_at: '2026-09-01T00:00:00Z', order_index: 3 },
        { id: 'sc-camel', createdAt: '2026-09-02T00:00:00Z', orderIndex: 1 }
      ]
    }
  ]
  const sortedSnakeCamel = getClassLessonsNewestFirst(snakeCamelChapters)
  assert('Tương thích cả created_at/createdAt và order_index/orderIndex', sortedSnakeCamel.map(l => l.id), [
    'sc-camel',
    'sc-snake'
  ])
}

console.log('\n=== 12. getClassLessonsNewestFirst: Bổ sung chapter metadata (chapterId, chapterTitle, chapterOrderIndex) ===')
{
  const chaptersWithMeta = [
    {
      id: 'chapter-101',
      title: 'Chương I: Hàm số',
      orderIndex: 1,
      lessons: [
        { id: 'les-1', title: 'Bài 1.1', createdAt: '2026-01-01T00:00:00Z' }
      ]
    },
    {
      id: 'chapter-202',
      title: 'Chương II: Mũ và Logarit',
      order_index: 2,
      lessons: [
        { id: 'les-2', title: 'Bài 2.1', createdAt: '2026-02-01T00:00:00Z' }
      ]
    },
    {
      id: 'chapter-303',
      // Không có title, không có orderIndex
      lessons: [
        { id: 'les-3', title: 'Bài 3.1', createdAt: '2026-03-01T00:00:00Z' }
      ]
    }
  ]

  const flatMeta = getClassLessonsNewestFirst(chaptersWithMeta)

  const itemLes2 = flatMeta.find(l => l.id === 'les-2')
  const itemLes1 = flatMeta.find(l => l.id === 'les-1')
  const itemLes3 = flatMeta.find(l => l.id === 'les-3')

  assert('Bổ sung chapterId đúng', itemLes1.chapterId, 'chapter-101')
  assert('Bổ sung chapterTitle đúng (từ title)', itemLes1.chapterTitle, 'Chương I: Hàm số')
  assert('Bổ sung chapterOrderIndex từ orderIndex', itemLes1.chapterOrderIndex, 1)

  assert('Bổ sung chapterId cho chương 2', itemLes2.chapterId, 'chapter-202')
  assert('Bổ sung chapterTitle cho chương 2', itemLes2.chapterTitle, 'Chương II: Mũ và Logarit')
  assert('Bổ sung chapterOrderIndex từ snake_case order_index', itemLes2.chapterOrderIndex, 2)

  assert('Fallback an toàn khi thiếu title -> chuỗi rỗng', itemLes3.chapterTitle, '')
  assert('Fallback an toàn khi thiếu orderIndex/order_index -> null', itemLes3.chapterOrderIndex, null)
}

console.log('\n=== 13. getClassLessonsNewestFirst: Tính bất biến (Immutability) và bảo toàn payload gốc ===')
{
  const rawHw = {
    id: 'hw-flat-1',
    title: 'Bài tập trắc nghiệm',
    durationMinutes: 60,
    deadline: '2026-12-01'
  }
  const rawLesson = {
    id: 'lesson-freeze',
    code: 'B-01',
    title: 'Bài học kiểm tra freeze',
    videoUrl: 'https://cdn.example.com/video.mp4',
    theoryFiles: [{ name: 'tai-lieu.pdf', url: '/files/tai-lieu.pdf' }],
    content: '<article>Nội dung chi tiết</article>',
    createdAt: '2026-04-10T00:00:00Z',
    order_index: 4,
    homeworks: [rawHw]
  }
  const rawChapters = [
    {
      id: 'ch-freeze',
      title: 'Chương đóng băng',
      orderIndex: 5,
      lessons: [rawLesson]
    }
  ]

  // Đóng băng toàn diện dữ liệu đầu vào
  Object.freeze(rawChapters)
  Object.freeze(rawChapters[0])
  Object.freeze(rawChapters[0].lessons)
  Object.freeze(rawLesson)
  Object.freeze(rawLesson.homeworks)
  Object.freeze(rawLesson.theoryFiles)
  Object.freeze(rawHw)

  let flatResult
  let throwError = null
  try {
    flatResult = getClassLessonsNewestFirst(rawChapters)
  } catch (err) {
    throwError = err
  }

  assert('Không throw lỗi khi input bị Object.freeze', throwError, null)
  assert('Trả về mảng phẳng mới', flatResult !== rawChapters, true)
  assert('Không mutate object bài học gốc (rawLesson không có chapterId)', rawLesson.chapterId, undefined)
  assert('Bài học trả về là object mới', flatResult[0] !== rawLesson, true)

  const processed = flatResult[0]
  assert('Bảo toàn videoUrl', processed.videoUrl, 'https://cdn.example.com/video.mp4')
  assert('Bảo toàn code', processed.code, 'B-01')
  assert('Bảo toàn theoryFiles', processed.theoryFiles.length, 1)
  assert('Bảo toàn content', processed.content, '<article>Nội dung chi tiết</article>')
  assert('Bảo toàn homeworks mapping', processed.homeworks[0].id, 'hw-flat-1')
  assert('Bảo toàn createdAt', processed.createdAt, '2026-04-10T00:00:00Z')
  assert('Bảo toàn order_index', processed.order_index, 4)
  assert('Được gắn chapterId', processed.chapterId, 'ch-freeze')
  assert('Được gắn chapterTitle', processed.chapterTitle, 'Chương đóng băng')
  assert('Được gắn chapterOrderIndex', processed.chapterOrderIndex, 5)
}

console.log('\n=== 14. getClassLessonsNewestFirst: Xử lý an toàn các input biên và rỗng ===')
{
  assert('Input null -> []', getClassLessonsNewestFirst(null), [])
  assert('Input undefined -> []', getClassLessonsNewestFirst(undefined), [])
  assert('Input mảng rỗng -> []', getClassLessonsNewestFirst([]), [])
  assert('Input chuỗi -> []', getClassLessonsNewestFirst('chuoi-khong-hop-le'), [])
  assert('Input số -> []', getClassLessonsNewestFirst(12345), [])
  assert('Input object không phải array -> []', getClassLessonsNewestFirst({}), [])
  assert(
    'Chương không có lessons hoặc lessons rỗng -> []',
    getClassLessonsNewestFirst([
      { id: 'ch-empty-1' },
      { id: 'ch-empty-2', lessons: [] },
      null,
      undefined
    ]),
    []
  )
  assert(
    'Bỏ qua an toàn các bài học null / undefined / rác trong lessons',
    getClassLessonsNewestFirst([
      {
        id: 'ch-mixed-garbage',
        title: 'Chương có phần tử rác',
        lessons: [
          null,
          undefined,
          'chuoi-rac',
          123,
          { id: 'valid-les', title: 'Bài hợp lệ', createdAt: '2026-05-01T00:00:00Z' }
        ]
      }
    ]).map(l => l.id),
    ['valid-les']
  )
}

console.log(`\n========================================`)
console.log(`Kết quả: ${passCount} passed, ${failCount} failed`)
console.log(`========================================\n`)

if (failCount > 0) {
  process.exit(1)
}
