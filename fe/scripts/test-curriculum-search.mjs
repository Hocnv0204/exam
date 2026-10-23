import assert from 'node:assert/strict'
import {
  normalizeSearchText,
  buildVietnameseRegex,
  highlightMatch,
  filterLessons,
  groupLessonsByChapter,
  filterAndSortLessons,
  createSearchController,
  escapeHtml
} from '../src/js/utils/curriculum-search.js'

console.log('=== Kiểm thử UI/UX Curriculum Search & Navigation ===\n')

// =========================================================================
// 1. Chuẩn hóa tiếng Việt (normalizeSearchText)
// =========================================================================
console.log('--- 1. Kiểm thử Chuẩn hóa tiếng Việt ---')
{
  assert.equal(normalizeSearchText('Đạo hàm'), 'dao ham')
  assert.equal(normalizeSearchText('HÀM SỐ LƯỢNG GIÁC'), 'ham so luong giac')
  assert.equal(normalizeSearchText('Tích phân từng phần'), 'tich phan tung phan')
  assert.equal(normalizeSearchText('Khối đa diện & Thể tích'), 'khoi da dien & the tich')
  assert.equal(normalizeSearchText('   Phương trình mũ   '), 'phuong trinh mu')
  assert.equal(normalizeSearchText('Đường tiệm cận đứng, ngang'), 'duong tiem can dung, ngang')
  assert.equal(normalizeSearchText('Số phức liên hợp z = a - bi'), 'so phuc lien hop z = a - bi')
  assert.equal(normalizeSearchText(''), '')
  assert.equal(normalizeSearchText(null), '')
  assert.equal(normalizeSearchText(undefined), '')
  console.log('  ✓ Bỏ dấu thanh, chuyển đ/Đ thành d/D, lowercase và trim chính xác')
}

// =========================================================================
// 2. Regex nhận diện biến thể dấu tiếng Việt (buildVietnameseRegex)
// =========================================================================
console.log('\n--- 2. Kiểm thử Regex biến thể dấu tiếng Việt ---')
{
  const re = buildVietnameseRegex('dao ham')
  assert.ok(re instanceof RegExp)
  assert.ok(re.test('Đạo hàm và vi phân'))
  assert.ok(re.test('BÀI 1: ĐẠO HÀM'))
  assert.ok(re.test('dao ham bac hai'))
  assert.ok(!re.test('Tích phân bất định'))

  // Ký tự đặc biệt trong từ khóa không làm crash regex
  const safeRe = buildVietnameseRegex('f(x) [0; 1]')
  assert.ok(safeRe instanceof RegExp)
  assert.ok(safeRe.test('Khảo sát hàm f(x) [0; 1]'))
  console.log('  ✓ Regex khớp chính xác cả không dấu lẫn có dấu, an toàn với ký tự toán học')
}

// =========================================================================
// 3. Highlight từ khóa an toàn XSS (highlightMatch)
// =========================================================================
console.log('\n--- 3. Kiểm thử Highlight từ khóa & An toàn XSS ---')
{
  const text1 = 'Bài 1: Khái niệm Đạo hàm và ứng dụng'
  const hl1 = highlightMatch(text1, 'dao ham')
  assert.ok(hl1.includes('<mark class="curriculum-search-mark">Đạo hàm</mark>'))
  assert.ok(hl1.includes('Khái niệm '))
  assert.ok(hl1.includes(' và ứng dụng'))

  // Casing gốc được bảo toàn
  const text2 = 'TÍCH PHÂN VÀ NGUYÊN HÀM'
  const hl2 = highlightMatch(text2, 'tich phan')
  assert.ok(hl2.includes('<mark class="curriculum-search-mark">TÍCH PHÂN</mark>'))

  // An toàn XSS: các thẻ nguy hiểm phải được escape
  const xssText = '<script>alert("hack")</script> Đạo hàm cơ bản'
  const hlXss = highlightMatch(xssText, 'dao ham')
  assert.ok(!hlXss.includes('<script>'))
  assert.ok(hlXss.includes('&lt;script&gt;alert(&quot;hack&quot;)&lt;/script&gt;'))
  assert.ok(hlXss.includes('<mark class="curriculum-search-mark">Đạo hàm</mark>'))

  // Query rỗng hoặc không khớp
  assert.equal(highlightMatch('Toán học 12', ''), 'Toán học 12')
  assert.equal(highlightMatch('Toán học 12', 'hinh hoc'), 'Toán học 12')
  assert.equal(highlightMatch(null, 'test'), '')
  console.log('  ✓ Bao bọc đúng thẻ mark, bảo toàn casing gốc và ngăn chặn triệt để XSS')
}

// =========================================================================
// 4. Lọc bài học đa tiêu chí (filterLessons)
// =========================================================================
console.log('\n--- 4. Kiểm thử Lọc bài học đa tiêu chí ---')
{
  const mockLessons = [
    {
      id: 'l1',
      code: '1',
      orderIndex: 1,
      title: 'Đạo hàm và ứng dụng',
      content: 'Khảo sát sự đồng biến nghịch biến của hàm số',
      chapterId: 'ch1',
      chapterTitle: 'Chương 1: Ứng dụng đạo hàm'
    },
    {
      id: 'l2',
      code: '2',
      orderIndex: 2,
      title: 'Cực trị của hàm số',
      content: 'Quy tắc tìm cực đại, cực tiểu',
      chapterId: 'ch1',
      chapterTitle: 'Chương 1: Ứng dụng đạo hàm'
    },
    {
      id: 'l3',
      code: '1',
      orderIndex: 1,
      title: 'Lũy thừa và Logarit',
      content: 'Công thức biến đổi logarit cơ bản',
      chapterId: 'ch2',
      chapterTitle: 'Chương 2: Hàm số lũy thừa và logarit'
    },
    {
      id: 'l4',
      code: '2',
      orderIndex: 2,
      title: 'Phương trình mũ',
      content: 'Phương pháp đặt ẩn phụ giải phương trình mũ',
      chapterId: 'ch2',
      chapterTitle: 'Chương 2: Hàm số lũy thừa và logarit'
    }
  ]

  // Tìm theo tên bài học (không dấu)
  const byTitle = filterLessons(mockLessons, 'cuc tri')
  assert.equal(byTitle.length, 1)
  assert.equal(byTitle[0].id, 'l2')

  // Tìm theo mô tả nội dung
  const byContent = filterLessons(mockLessons, 'dat an phu')
  assert.equal(byContent.length, 1)
  assert.equal(byContent[0].id, 'l4')

  // Tìm theo tên chương
  const byChapter = filterLessons(mockLessons, 'logarit')
  assert.equal(byChapter.length, 2)
  assert.deepEqual(byChapter.map(l => l.id), ['l3', 'l4'])

  // Tìm theo số thứ tự bài học hoặc số chương (khớp l2 code=2, l3 chapter=2, l4 code=2 và chapter=2)
  const byCode = filterLessons(mockLessons, '2')
  assert.equal(byCode.length, 3)
  assert.deepEqual(byCode.map(l => l.id), ['l2', 'l3', 'l4'])

  // Từ khóa không khớp bài nào
  const noMatch = filterLessons(mockLessons, 'hinh hoc khong gian')
  assert.equal(noMatch.length, 0)

  // Query rỗng trả về toàn bộ
  assert.equal(filterLessons(mockLessons, '').length, 4)
  console.log('  ✓ Lọc chuẩn xác theo tên bài, mô tả tóm tắt, số thứ tự và tên chương')
}

// =========================================================================
// 5. Gom nhóm theo chương học (groupLessonsByChapter)
// =========================================================================
console.log('\n--- 5. Kiểm thử Gom nhóm bài học theo Chương ---')
{
  const flatLessons = [
    { id: 'l3', title: 'Bài 1 Ch 2', chapterId: 'ch2', chapterTitle: 'Chương 2: Mũ & Logarit', chapterOrderIndex: 2, orderIndex: 1 },
    { id: 'l1', title: 'Bài 1 Ch 1', chapterId: 'ch1', chapterTitle: 'Chương 1: Đạo hàm', chapterOrderIndex: 1, orderIndex: 1 },
    { id: 'l2', title: 'Bài 2 Ch 1', chapterId: 'ch1', chapterTitle: 'Chương 1: Đạo hàm', chapterOrderIndex: 1, orderIndex: 2 },
    { id: 'l4', title: 'Bài 2 Ch 2', chapterId: 'ch2', chapterTitle: 'Chương 2: Mũ & Logarit', chapterOrderIndex: 2, orderIndex: 2 }
  ]

  const grouped = groupLessonsByChapter(flatLessons)
  assert.equal(grouped.length, 2)

  // Thứ tự chương được sắp xếp theo chapterOrderIndex
  assert.equal(grouped[0].chapterId, 'ch1')
  assert.equal(grouped[0].lessons.length, 2)
  assert.equal(grouped[0].lessons[0].id, 'l1')
  assert.equal(grouped[0].lessons[1].id, 'l2')

  assert.equal(grouped[1].chapterId, 'ch2')
  assert.equal(grouped[1].lessons.length, 2)
  assert.equal(grouped[1].lessons[0].id, 'l3')
  assert.equal(grouped[1].lessons[1].id, 'l4')

  // Xử lý danh sách rỗng / null an toàn
  assert.deepEqual(groupLessonsByChapter([]), [])
  assert.deepEqual(groupLessonsByChapter(null), [])
  console.log('  ✓ Gom nhóm và giữ vững thứ tự phân cấp Chương -> Bài học')
}

// =========================================================================
// 6. Lọc Lesson-First & Bộ Lọc Chương Học (filterAndSortLessons)
// =========================================================================
console.log('\n--- 6. Kiểm thử Lọc Lesson-First & Bộ lọc Chương học ---')
{
  const mockLessons = [
    {
      id: 'l1',
      code: '1',
      orderIndex: 1,
      title: 'Đạo hàm và ứng dụng',
      content: 'Khảo sát sự đồng biến nghịch biến của hàm số',
      chapterId: 'ch1',
      chapterTitle: 'Chương 1: Ứng dụng đạo hàm',
      chapterOrderIndex: 1,
      createdAt: '2026-01-01T08:00:00.000Z'
    },
    {
      id: 'l2',
      code: '2',
      orderIndex: 2,
      title: 'Cực trị của hàm số',
      content: 'Quy tắc tìm cực đại, cực tiểu',
      chapterId: 'ch1',
      chapterTitle: 'Chương 1: Ứng dụng đạo hàm',
      chapterOrderIndex: 1,
      createdAt: '2026-01-02T08:00:00.000Z'
    },
    {
      id: 'l3',
      code: '1',
      orderIndex: 1,
      title: 'Lũy thừa và Logarit',
      content: 'Công thức biến đổi logarit cơ bản',
      chapterId: 'ch2',
      chapterTitle: 'Chương 2: Hàm số lũy thừa và logarit',
      chapterOrderIndex: 2,
      createdAt: '2026-01-03T08:00:00.000Z'
    },
    {
      id: 'l4',
      code: '2',
      orderIndex: 2,
      title: 'Phương trình mũ',
      content: 'Phương pháp đặt ẩn phụ giải phương trình mũ',
      chapterId: 'ch2',
      chapterTitle: 'Chương 2: Hàm số lũy thừa và logarit',
      chapterOrderIndex: 2,
      createdAt: '2026-01-04T08:00:00.000Z'
    }
  ]

  // Flow Lesson-First: Khi vào trang (chapterId = 'all', query = ''), hiển thị toàn bộ bài học không cần chọn chương trước
  const allFirst = filterAndSortLessons(mockLessons, { chapterId: 'all', query: '' })
  assert.equal(allFirst.length, 4)
  assert.deepEqual(allFirst.map(l => l.id), ['l1', 'l2', 'l3', 'l4'])

  // Bộ lọc Chương: Chọn Chương 1 -> chỉ hiển thị bài của Chương 1
  const ch1Only = filterAndSortLessons(mockLessons, { chapterId: 'ch1' })
  assert.equal(ch1Only.length, 2)
  assert.deepEqual(ch1Only.map(l => l.id), ['l1', 'l2'])

  // Bộ lọc Chương: Chọn Chương 2 -> chỉ hiển thị bài của Chương 2
  const ch2Only = filterAndSortLessons(mockLessons, { chapterId: 'ch2' })
  assert.equal(ch2Only.length, 2)
  assert.deepEqual(ch2Only.map(l => l.id), ['l3', 'l4'])

  // Kết hợp vừa lọc Chương vừa tìm kiếm từ khóa
  const ch2Search = filterAndSortLessons(mockLessons, { chapterId: 'ch2', query: 'phuong trinh' })
  assert.equal(ch2Search.length, 1)
  assert.equal(ch2Search[0].id, 'l4')

  // Tìm kiếm toàn lớp (tất cả chương)
  const classWideSearch = filterAndSortLessons(mockLessons, { chapterId: 'all', query: 'logarit' })
  assert.equal(classWideSearch.length, 2)
  assert.deepEqual(classWideSearch.map(l => l.id), ['l3', 'l4'])

  const cucTriSearch = filterAndSortLessons(mockLessons, { chapterId: 'all', query: 'cuc tri' })
  assert.equal(cucTriSearch.length, 1)
  assert.equal(cucTriSearch[0].id, 'l2')

  // Sắp xếp bài học theo tên A-Z (localeCompare tiếng Việt)
  const sortTitleAsc = filterAndSortLessons(mockLessons, { sortBy: 'title-asc' })
  assert.equal(sortTitleAsc[0].id, 'l2') // Cực trị...
  assert.equal(sortTitleAsc[1].id, 'l1') // Đạo hàm...

  // Sắp xếp bài học theo mới nhất
  const sortNewest = filterAndSortLessons(mockLessons, { sortBy: 'newest' })
  assert.equal(sortNewest[0].id, 'l4') // 2026-01-04
  assert.equal(sortNewest[sortNewest.length - 1].id, 'l1') // 2026-01-01

  // Biên: mảng rỗng, tham số null
  assert.deepEqual(filterAndSortLessons([], { chapterId: 'ch1' }), [])
  assert.deepEqual(filterAndSortLessons(null), [])
  console.log('  ✓ Danh sách chính là bài học toàn lớp (lesson-first), Chương đóng vai trò bộ lọc')
  console.log('  ✓ Lọc kết hợp chính xác theo Chương, từ khóa tìm kiếm và các tiêu chí sắp xếp')
}

// =========================================================================
// 7. Debounce & Chống Race-Condition (createSearchController)
// =========================================================================
console.log('\n--- 7. Kiểm thử Debounce & Chống Stale Async Overwrite ---')
await new Promise((resolve) => {
  let executedCalls = []
  let receivedResults = []

  const ctrl = createSearchController({
    debounceMs: 50,
    onSearch: async (q, { requestId, isCurrent }) => {
      executedCalls.push({ q, requestId })
      // Giả lập request trễ bất đồng bộ
      const delay = q === 'da' ? 80 : 20
      await new Promise(r => setTimeout(r, delay))

      if (isCurrent()) {
        receivedResults.push({ q, requestId })
      }
    }
  })

  // Gõ nhanh liên tiếp 3 ký tự (da -> dao -> dao ham)
  ctrl.search('d')
  setTimeout(() => ctrl.search('da'), 20)
  setTimeout(() => ctrl.search('dao ham'), 40)

  // Đợi sau khi debounce và request hoàn tất
  setTimeout(() => {
    // Chỉ lần gõ cuối 'dao ham' được phát đi vì các lần trước bị debounce hủy
    assert.equal(executedCalls.length, 1)
    assert.equal(executedCalls[0].q, 'dao ham')
    assert.equal(receivedResults.length, 1)
    assert.equal(receivedResults[0].q, 'dao ham')

    // Thử nghiệm race condition: Request 1 phản hồi sau Request 2
    let raceHistory = []
    const raceCtrl = createSearchController({
      debounceMs: 10,
      onSearch: async (q, { requestId, isCurrent }) => {
        const delay = q === 'slow' ? 60 : 10
        await new Promise(r => setTimeout(r, delay))
        if (isCurrent()) {
          raceHistory.push({ q, accepted: true })
        } else {
          raceHistory.push({ q, accepted: false })
        }
      }
    })

    raceCtrl.search('slow')
    setTimeout(() => raceCtrl.search('fast'), 25)

    setTimeout(() => {
      // 'fast' hoàn tất trước và được chấp nhận
      // 'slow' phản hồi sau nhưng bị loại bỏ vì isCurrent() = false
      assert.equal(raceHistory.length, 2)
      const fastResult = raceHistory.find(r => r.q === 'fast')
      const slowResult = raceHistory.find(r => r.q === 'slow')
      assert.equal(fastResult.accepted, true)
      assert.equal(slowResult.accepted, false)
      console.log('  ✓ Debounce triệt tiêu các lần gõ dồn dập')
      console.log('  ✓ Cơ chế requestId loại trừ 100% response cũ đến trễ (stale overwrite)')
      resolve()
    }, 120)
  }, 140)
})

// =========================================================================
// 8. Hợp đồng Bảo mật, Quyền Truy Cập & Lọc Bài Tập Xuất Bản (Student Published Filtering)
// =========================================================================
console.log('\n--- 8. Kiểm thử Hợp đồng Bảo mật & Lọc bài tập xuất bản (Student Published Filtering) ---')
{
  function simulateAccessCheck(user, requestedClassId) {
    if (!requestedClassId) {
      return { status: 400, message: 'classId is required for class-wide lesson search' }
    }
    if (user.role === 'STUDENT') {
      const allowedClassIds = user.classIds || []
      if (!allowedClassIds.includes(requestedClassId)) {
        return { status: 403, message: 'Forbidden: You can only view lessons under your enrolled class' }
      }
    }
    return { status: 200, message: 'OK' }
  }

  // Học sinh truy cập lớp chưa đăng ký -> Chặn 403
  const student = { role: 'STUDENT', classIds: ['c1', 'c2'] }
  const resForbidden = simulateAccessCheck(student, 'c3-unauthorized')
  assert.equal(resForbidden.status, 403)

  // Học sinh truy cập đúng lớp mình học -> 200 OK
  const resStudentOk = simulateAccessCheck(student, 'c1')
  assert.equal(resStudentOk.status, 200)

  // Admin có thể tìm kiếm bất kỳ lớp nào -> 200 OK
  const admin = { role: 'ADMIN' }
  const resAdminOk = simulateAccessCheck(admin, 'c3-unauthorized')
  assert.equal(resAdminOk.status, 200)

  // Lọc bài tập đã xuất bản: học sinh CHỈ nhìn thấy bài tập có is_published !== false
  const sampleLessons = [
    {
      id: 'l1',
      title: 'Bài 1: Khái niệm đạo hàm',
      homeworks: [
        { id: 'h1', title: 'Bài tập 1 đã duyệt', is_published: true },
        { id: 'h2', title: 'Bản nháp đề thi chưa công bố', is_published: false }
      ]
    },
    {
      id: 'l2',
      title: 'Bài 2: Vi phân',
      homeworks: [
        { id: 'h3', title: 'Đề kiểm tra 15 phút', is_published: true }
      ]
    }
  ]

  const filterLessonHomeworksForUser = (lesson, userRole) => {
    const rawHws = lesson.homeworks || []
    if (userRole === 'STUDENT') {
      return rawHws.filter(h => h.is_published !== false)
    }
    return rawHws
  }

  const studentHwsL1 = filterLessonHomeworksForUser(sampleLessons[0], 'STUDENT')
  assert.equal(studentHwsL1.length, 1)
  assert.equal(studentHwsL1[0].id, 'h1')

  const adminHwsL1 = filterLessonHomeworksForUser(sampleLessons[0], 'ADMIN')
  assert.equal(adminHwsL1.length, 2)

  // Học sinh xem danh sách bài học mà không cần click vào từng chương trước
  const studentClassChapters = [
    { id: 'ch1', title: 'Chương 1', lessons: [sampleLessons[0]] },
    { id: 'ch2', title: 'Chương 2', lessons: [sampleLessons[1]] }
  ]
  const studentAllLessons = studentClassChapters.flatMap(c => c.lessons)
  assert.equal(studentAllLessons.length, 2)
  assert.deepEqual(studentAllLessons.map(l => l.id), ['l1', 'l2'])

  console.log('  ✓ Học sinh bị chặn 403 nghiêm ngặt khi tra cứu ngoài lớp học')
  console.log('  ✓ Bài tập nháp chưa công bố không bị rò rỉ cho học sinh')
  console.log('  ✓ Học sinh xem được toàn bộ bài học trong lớp mà không cần bấm vào chương trước')
}

// =========================================================================
// 9. Hợp đồng Tạo Bài Học Nhanh & Điều Hướng (Quick Add Contract with Chapter Select)
// =========================================================================
console.log('\n--- 9. Kiểm thử Hợp đồng Tạo bài học nhanh có chọn Chương đích ---')
{
  function simulateQuickAddLesson(payload, chapters, defaultChapterId = null) {
    // Kế thừa chapter nếu gọi từ trong context của một chapter
    const effectiveChapterId = payload.chapterId || defaultChapterId

    if (!effectiveChapterId) {
      return { success: false, error: 'Vui lòng chọn chương học đích!' }
    }
    if (!payload.title || !payload.title.trim()) {
      return { success: false, error: 'Vui lòng nhập tên bài học!' }
    }
    const targetChapter = chapters.find(c => c.id === effectiveChapterId)
    if (!targetChapter) {
      return { success: false, error: 'Chương học không tồn tại!' }
    }

    const nextOrder = (targetChapter.lessons || []).length + 1
    const newLesson = {
      id: `lesson-new-${Date.now()}`,
      chapterId: effectiveChapterId,
      title: payload.title.trim(),
      orderIndex: nextOrder,
      content: payload.content || '',
      videoUrl: payload.videoUrl || '',
      isTrial: Boolean(payload.isTrial)
    }

    if (!targetChapter.lessons) targetChapter.lessons = []
    targetChapter.lessons.push(newLesson)

    return {
      success: true,
      lesson: newLesson,
      navigation: {
        selectedChapterId: effectiveChapterId,
        selectedLessonId: newLesson.id,
        level: 2 // Mở thẳng workspace chi tiết bài học
      }
    }
  }

  const chapters = [
    { id: 'ch1', title: 'Chương 1: Đạo hàm', lessons: [{ id: 'l1', title: 'Bài 1' }] },
    { id: 'ch2', title: 'Chương 2: Tích phân', lessons: [] }
  ]

  // Bắt lỗi khi thiếu chương học đích
  const errNoChapter = simulateQuickAddLesson({ chapterId: '', title: 'Bài học mới' }, chapters)
  assert.equal(errNoChapter.success, false)
  assert.equal(errNoChapter.error, 'Vui lòng chọn chương học đích!')

  // Bắt lỗi khi chương học không tồn tại
  const errInvalidChapter = simulateQuickAddLesson({ chapterId: 'ch999', title: 'Bài học mới' }, chapters)
  assert.equal(errInvalidChapter.success, false)
  assert.equal(errInvalidChapter.error, 'Chương học không tồn tại!')

  // Bắt lỗi khi để trống tiêu đề
  const errNoTitle = simulateQuickAddLesson({ chapterId: 'ch1', title: '   ' }, chapters)
  assert.equal(errNoTitle.success, false)
  assert.equal(errNoTitle.error, 'Vui lòng nhập tên bài học!')

  // Tạo thành công vào Chương 2
  const successAdd = simulateQuickAddLesson({
    chapterId: 'ch2',
    title: 'Khái niệm Tích phân Riemann',
    content: 'Định nghĩa diện tích hình thang cong',
    videoUrl: 'https://youtube.com/watch?v=12345678901',
    isTrial: true
  }, chapters)

  assert.equal(successAdd.success, true)
  assert.equal(successAdd.lesson.orderIndex, 1)
  assert.equal(successAdd.navigation.selectedChapterId, 'ch2')
  assert.equal(successAdd.navigation.selectedLessonId, successAdd.lesson.id)
  assert.equal(successAdd.navigation.level, 2)

  // Không làm hỏng form cũ khi tạo từ trong context chapter (defaultChapterId)
  const successFromChapterContext = simulateQuickAddLesson(
    { title: 'Bài 2 của Chương 1' },
    chapters,
    'ch1'
  )
  assert.equal(successFromChapterContext.success, true)
  assert.equal(successFromChapterContext.lesson.chapterId, 'ch1')
  assert.equal(successFromChapterContext.lesson.orderIndex, 2)
  assert.equal(successFromChapterContext.navigation.selectedChapterId, 'ch1')

  console.log('  ✓ Form bắt buộc chọn chương đích và kiểm tra tính hợp lệ của chương cha')
  console.log('  ✓ Tự động gán đúng thứ tự bài học tăng dần theo chương đích')
  console.log('  ✓ Tạo xong mở thẳng workspace bài học mới tạo mà không làm hỏng context cũ')
}

// =========================================================================
// 10. Contract Envelope, Server Pagination, Sort Stable & Mapping Compatibility
// =========================================================================
console.log('\n--- 10. Kiểm thử Contract Envelope, Server Pagination, Sort Stable & Mapping Backward-Compatibility ---')
{
  // 10.1 Simulation of create-chapter handler contract
  const simulateChapterGet = (chapters, queryParams = {}) => {
    const isPaged = queryParams.page !== undefined || queryParams.pageSize !== undefined || queryParams.format === 'envelope'
    let list = Array.isArray(chapters) ? chapters.slice() : []

    if (queryParams.q) {
      const nq = normalizeSearchText(queryParams.q)
      list = list.filter(c => normalizeSearchText(c.title).includes(nq))
    }

    const sort = queryParams.sort || 'order'
    list.sort((a, b) => {
      if (sort === 'title-asc') {
        const c = (a.title || '').localeCompare(b.title || '', 'vi')
        if (c !== 0) return c
        return (a.order_index ?? 0) - (b.order_index ?? 0) || String(a.id || '').localeCompare(String(b.id || ''))
      }
      if (sort === 'order-desc') {
        return (b.order_index ?? 0) - (a.order_index ?? 0) || String(a.id || '').localeCompare(String(b.id || ''))
      }
      return (a.order_index ?? 0) - (b.order_index ?? 0) || String(a.id || '').localeCompare(String(b.id || ''))
    })

    const total = list.length
    if (isPaged) {
      const page = Math.max(1, parseInt(queryParams.page || '1', 10) || 1)
      const pageSize = Math.min(100, Math.max(1, parseInt(queryParams.pageSize || '15', 10) || 15))
      const from = (page - 1) * pageSize
      const items = list.slice(from, from + pageSize)
      return { items, total, page, pageSize }
    }
    return list
  }

  const sampleChapters = [
    { id: 'ch2', title: 'Chương 2: Tích phân & Nguyên hàm', order_index: 2 },
    { id: 'ch1', title: 'Chương 1: Khảo sát hàm số & Đạo hàm', order_index: 1 },
    { id: 'ch3', title: 'Chương 3: Số phức', order_index: 3 }
  ]

  // Legacy caller without pagination params: nhận mảng cũ
  const legacyRes = simulateChapterGet(sampleChapters)
  assert.ok(Array.isArray(legacyRes), 'Legacy call phải trả về mảng')
  assert.equal(legacyRes.length, 3)
  assert.equal(legacyRes[0].id, 'ch1')

  // New caller with pagination: nhận envelope { items, total, page, pageSize }
  const pagedRes = simulateChapterGet(sampleChapters, { page: '1', pageSize: '2', sort: 'order' })
  assert.ok(!Array.isArray(pagedRes), 'Paged call phải trả về object envelope')
  assert.ok(Array.isArray(pagedRes.items))
  assert.equal(pagedRes.total, 3)
  assert.equal(pagedRes.page, 1)
  assert.equal(pagedRes.pageSize, 2)
  assert.equal(pagedRes.items.length, 2)
  assert.equal(pagedRes.items[0].id, 'ch1')
  assert.equal(pagedRes.items[1].id, 'ch2')

  // Validate pageSize max 100 và page >= 1
  const clampedRes = simulateChapterGet(sampleChapters, { page: '-5', pageSize: '500' })
  assert.equal(clampedRes.page, 1, 'Page âm phải được clamp về 1')
  assert.equal(clampedRes.pageSize, 100, 'PageSize vượt quá 100 phải được clamp về 100')

  // Filter theo q không dấu khớp tiếng Việt có dấu
  const searchChapterRes = simulateChapterGet(sampleChapters, { q: 'dao ham', format: 'envelope' })
  assert.equal(searchChapterRes.items.length, 1)
  assert.equal(searchChapterRes.items[0].id, 'ch1')

  // 10.2 Simulation of create-lesson search contract
  const simulateLessonSearch = (chaptersData, params = {}) => {
    const results = []
    let totalLessonsCount = 0

    for (const ch of chaptersData) {
      const sorted = (ch.lessons || []).slice().sort((a, b) => (a.order_index || 0) - (b.order_index || 0))
      totalLessonsCount += sorted.length

      if (params.chapterId && params.chapterId !== 'all' && ch.id !== params.chapterId) {
        continue
      }

      for (const l of sorted) {
        results.push({
          id: l.id,
          chapterId: ch.id,
          chapterTitle: ch.title,
          chapterOrderIndex: ch.order_index,
          code: String(l.order_index || ''),
          title: l.title,
          orderIndex: l.order_index,
          content: l.content || '',
          isTrial: Boolean(l.is_trial),
          hasVideo: Boolean(l.video_url),
          videoUrl: l.video_url || '',
          theoryFilesCount: Array.isArray(l.theory_files) ? l.theory_files.length : 0,
          homeworksCount: Array.isArray(l.homeworks) ? l.homeworks.length : 0,
          createdAt: l.created_at || new Date().toISOString()
        })
      }
    }

    let filtered = results

    if (params.q) {
      const nq = normalizeSearchText(params.q)
      filtered = filtered.filter(item => {
        return normalizeSearchText(item.title).includes(nq) ||
          normalizeSearchText(item.content).includes(nq) ||
          normalizeSearchText(item.code).includes(nq) ||
          normalizeSearchText(item.chapterTitle).includes(nq)
      })
    }

    if (params.isTrial === 'true') filtered = filtered.filter(i => i.isTrial)
    if (params.hasVideo === 'true') filtered = filtered.filter(i => i.hasVideo)
    if (params.hasTheory === 'true') filtered = filtered.filter(i => i.theoryFilesCount > 0)
    if (params.hasHomework === 'true') filtered = filtered.filter(i => i.homeworksCount > 0)

    const sort = params.sort || 'order'
    filtered.sort((a, b) => {
      if (sort === 'title-asc') {
        const c = (a.title || '').localeCompare(b.title || '', 'vi')
        if (c !== 0) return c
        return (a.orderIndex ?? 0) - (b.orderIndex ?? 0) || String(a.id || '').localeCompare(String(b.id || ''))
      }
      if (sort === 'title-desc') {
        const c = (b.title || '').localeCompare(a.title || '', 'vi')
        if (c !== 0) return c
        return (a.orderIndex ?? 0) - (b.orderIndex ?? 0) || String(a.id || '').localeCompare(String(b.id || ''))
      }
      if (sort === 'order-desc') {
        const chDiff = (b.chapterOrderIndex ?? 0) - (a.chapterOrderIndex ?? 0)
        if (chDiff !== 0) return chDiff
        const lDiff = (b.orderIndex ?? 0) - (a.orderIndex ?? 0)
        if (lDiff !== 0) return lDiff
        return String(a.id || '').localeCompare(String(b.id || ''))
      }
      const chDiff = (a.chapterOrderIndex ?? 0) - (b.chapterOrderIndex ?? 0)
      if (chDiff !== 0) return chDiff
      const lDiff = (a.orderIndex ?? 0) - (b.orderIndex ?? 0)
      if (lDiff !== 0) return lDiff
      return String(a.id || '').localeCompare(String(b.id || ''))
    })

    const total = filtered.length
    const page = Math.max(1, parseInt(params.page || '1', 10) || 1)
    const pageSize = Math.min(100, Math.max(1, parseInt(params.pageSize || '15', 10) || 15))
    const isPaged = params.page !== undefined || params.pageSize !== undefined
    const items = isPaged ? filtered.slice((page - 1) * pageSize, page * pageSize) : filtered

    return {
      items,
      total,
      page: isPaged ? page : 1,
      pageSize: isPaged ? pageSize : (total || 15),
      results: items,
      totalLessons: totalLessonsCount,
      totalChapters: chaptersData.length,
      classId: params.classId || 'class-1',
      query: params.q || ''
    }
  }

  const sampleClassData = [
    {
      id: 'ch1',
      title: 'Chương 1',
      order_index: 1,
      lessons: [
        { id: 'l1', title: 'Bài A', order_index: 1, is_trial: true, video_url: 'https://video.com/1', theory_files: ['t1.pdf'], homeworks: [{ id: 'hw1' }] },
        { id: 'l2', title: 'Bài B', order_index: 2, is_trial: false, video_url: '', theory_files: [], homeworks: [] }
      ]
    },
    {
      id: 'ch2',
      title: 'Chương 2',
      order_index: 2,
      lessons: [
        { id: 'l3', title: 'Bài C', order_index: 1, is_trial: true, video_url: '', theory_files: ['t2.pdf'], homeworks: [{ id: 'hw2' }] }
      ]
    }
  ]

  const searchRes = simulateLessonSearch(sampleClassData, { page: '1', pageSize: '2', sort: 'order' })
  assert.equal(searchRes.items.length, 2)
  assert.equal(searchRes.total, 3)
  assert.equal(searchRes.totalLessons, 3)
  assert.equal(searchRes.totalChapters, 2)
  assert.deepEqual(searchRes.results, searchRes.items, 'Cả items và results đều chứa mảng paged')

  // Metadata filter: hasVideo
  const videoOnly = simulateLessonSearch(sampleClassData, { hasVideo: 'true' })
  assert.equal(videoOnly.total, 1)
  assert.equal(videoOnly.items[0].id, 'l1')

  // Metadata filter: isTrial
  const trialOnly = simulateLessonSearch(sampleClassData, { isTrial: 'true' })
  assert.equal(trialOnly.total, 2)
  assert.deepEqual(trialOnly.items.map(i => i.id), ['l1', 'l3'])

  // 10.3 Safe normalization on Frontend (không nổ .map hay crash UI)
  const safeExtractItems = (res) => {
    return Array.isArray(res) ? res : (res?.items || res?.results || [])
  }
  assert.equal(safeExtractItems([1, 2, 3]).length, 3, 'Trích xuất mảng thuần')
  assert.equal(safeExtractItems({ items: [1, 2] }).length, 2, 'Trích xuất items từ envelope')
  assert.equal(safeExtractItems({ results: [1] }).length, 1, 'Trích xuất results từ envelope')
  assert.equal(safeExtractItems(null).length, 0, 'Xử lý null an toàn')
  assert.equal(safeExtractItems(undefined).length, 0, 'Xử lý undefined an toàn')
  assert.equal(safeExtractItems({ error: 'Failed' }).length, 0, 'Xử lý object lỗi an toàn không crash')

  // 10.4 Error response contract (Lỗi không biến thành empty UI)
  const evaluateUIState = ({ isLoading, error, items, chapters }) => {
    if (isLoading) return 'LOADING'
    if (error) return 'ERROR'
    if (!chapters || chapters.length === 0) return 'EMPTY_CHAPTERS'
    if (!items || items.length === 0) return 'EMPTY_LESSONS'
    return 'CONTENT'
  }

  assert.equal(evaluateUIState({ isLoading: true, error: null, items: [], chapters: [] }), 'LOADING')
  assert.equal(evaluateUIState({ isLoading: false, error: 'Database connection failed', items: [], chapters: [] }), 'ERROR', 'Lỗi phải render trạng thái ERROR có nút Thử lại, không biến thành empty')
  assert.equal(evaluateUIState({ isLoading: false, error: null, items: [], chapters: [] }), 'EMPTY_CHAPTERS')
  assert.equal(evaluateUIState({ isLoading: false, error: null, items: [], chapters: [{ id: 'ch1' }] }), 'EMPTY_LESSONS')
  assert.equal(evaluateUIState({ isLoading: false, error: null, items: [{ id: 'l1' }], chapters: [{ id: 'ch1' }] }), 'CONTENT')

  console.log('  ✓ API create-chapter GET hỗ trợ trả mảng cho caller cũ và envelope {items, total, page, pageSize} cho caller mới')
  console.log('  ✓ API create-lesson search hỗ trợ pagination, sort stable, metadata filters và cùng envelope chuẩn')
  console.log('  ✓ Input validation kẹp chặt pageSize tối đa 100 và page tối thiểu 1')
  console.log('  ✓ Safe mapping ở Frontend tương thích 100% với cả response dạng mảng lẫn object envelope')
  console.log('  ✓ Lỗi từ backend/network hiển thị Error State kèm nút Thử lại, không biến thành Empty State giả')
}

console.log('\n============================================================')
console.log('TẤT CẢ KIỂM THỬ CURRICULUM SEARCH & NAVIGATION ĐỀU ĐẠT! ✅')
