// fe/scripts/test-mochi-achievements.mjs
// Unit tests cho Mochi Gamification & Achievements (Task FE-B)

import test from 'node:test'
import assert from 'node:assert/strict'
import { register } from 'node:module'

// Bỏ qua import .css và .svg trong môi trường Node test
register('data:text/javascript,' + encodeURIComponent(`
  export async function load(url, context, nextLoad) {
    if (url.endsWith('.css')) {
      return { format: 'module', shortCircuit: true, source: '' }
    }
    if (url.endsWith('.svg')) {
      return { format: 'module', shortCircuit: true, source: 'export default "test-mascot.svg";' }
    }
    return nextLoad(url, context)
  }
`))

const storageMap = new Map()
const storageMock = {
  getItem: k => storageMap.get(k) ?? null,
  setItem: (k, v) => storageMap.set(k, String(v)),
  removeItem: k => storageMap.delete(k)
}

globalThis.localStorage = storageMock
globalThis.sessionStorage = storageMock
globalThis.CustomEvent = class {
  constructor(type, options = {}) { this.type = type; this.detail = options.detail }
}

const elementsMap = new Map()
globalThis.document = {
  documentElement: { dataset: {}, style: {} },
  addEventListener: () => {},
  dispatchEvent: () => {},
  querySelectorAll: (selector) => {
    if (selector === '[data-progress-slot]') {
      return elementsMap.get('[data-progress-slot]') || []
    }
    return []
  },
  getElementById: (id) => elementsMap.get(id) || null
}

globalThis.window = {
  location: { hash: '#achievements', search: '' },
  addEventListener: () => {},
  matchMedia: () => ({ matches: false })
}

const { state } = await import('../src/js/state.js')
const { api } = await import('../src/js/api.js')
const { renderMochiNavbar } = await import('../src/js/components/navbar.js')
const {
  renderAchievementsView,
  renderAchievementsContent,
  renderLeaderboardContent,
  bindAchievementsEvents
} = await import('../src/js/views/achievements.js')
const {
  fetchStudentAchievements,
  fetchClassLeaderboard,
  clearAchievementsCache,
  updateNavbarStreak,
  renderHomeAchievementsContent,
  mountHomeAchievementsWidget,
  escapeHtml
} = await import('../src/js/components/progress-widgets.js')

function useStudent() {
  state.token = 'test-student-token'
  state.user = {
    id: 'student-1',
    role: 'STUDENT',
    fullName: 'Nguyễn Minh Anh',
    username: 'minhanh',
    classIds: ['class-12a']
  }
  state.classes = [{ id: 'class-12a', name: 'Toán 12A' }]
  storageMap.set('eduportal-ui', 'mochi')
}

const sampleAchievementsData = {
  today: '2026-11-07',
  xp: { total: 1240, level: 7, levelXp: 40, nextLevelXp: 200, thisWeek: 85 },
  streak: { current: 4, best: 9, activeToday: true, lastActiveDate: '2026-11-07' },
  badges: [
    { id: 'first-step', title: 'Khởi đầu', description: 'Hoàn thành bài tập đầu tiên', icon: 'fa-seedling', earned: true, progress: 1, target: 1 },
    { id: 'hard-worker', title: 'Chăm chỉ', description: 'Hoàn thành 10 bài tập', icon: 'fa-book-open', earned: false, progress: 6, target: 10 }
  ],
  rules: [
    { label: 'Hoàn thành một bài tập', xp: '+10' },
    { label: 'Điểm tốt nhất (quy đổi thang 10)', xp: '+0 đến +10' },
    { label: 'Nộp lần đầu đúng hạn', xp: '+5' },
    { label: 'Có mặt một buổi học', xp: '+10' }
  ]
}

const sampleLeaderboardData = {
  classId: 'class-12a',
  className: 'Toán 12A',
  period: 'week',
  fromDate: '2026-11-02',
  toDate: '2026-11-08',
  entries: [
    { rank: 1, displayName: 'Nguyễn Minh Anh', initials: 'MA', xp: 85, isMe: true },
    { rank: 2, displayName: 'Bảo N.', initials: 'BN', xp: 60, isMe: false }
  ],
  me: { rank: 1, xp: 85 },
  totalStudents: 22
}

test('1. Navbar tĩnh: KHÔNG chứa "streak" hay "XP" nhưng có slot [data-progress-slot]', () => {
  useStudent()
  const navHtml = renderMochiNavbar()

  assert.doesNotMatch(navHtml, /\bXP\b|streak/i, 'HTML navbar tĩnh không được chứa chữ streak hoặc XP')
  assert.match(navHtml, /data-progress-slot/, 'Navbar có slot dữ liệu tiến độ để điền sau')
  assert.match(navHtml, /hidden/, 'Slot mặc định phải ẩn trước khi có dữ liệu')
})

test('2. Render trang Thành tích với dữ liệu mẫu', () => {
  useStudent()
  const html = renderAchievementsContent({
    achievements: sampleAchievementsData,
    leaderboard: sampleLeaderboardData,
    selectedClassId: 'class-12a',
    period: 'week',
    classes: state.classes
  })

  // Kiểm tra Cấp độ và thanh tiến trình XP
  assert.match(html, /Cấp 7/, 'Hiển thị đúng Cấp 7')
  assert.match(html, /40[\s\S]*\/[\s\S]*200 XP/, 'Hiển thị 40 / 200 XP')
  assert.match(html, /role="progressbar"/, 'Có thanh tiến độ aria')
  assert.match(html, /aria-valuenow="40"/, 'Giá trị aria-valuenow = 40')
  assert.match(html, /aria-valuemax="200"/, 'Giá trị aria-valuemax = 200')
  assert.match(html, /\+85 XP tuần này/, 'Hiển thị XP tuần này')
  assert.match(html, /1\.240 XP/, 'Hiển thị tổng tích luỹ định dạng VN')

  // Kiểm tra Chuỗi ngày học
  assert.match(html, /4 ngày/, 'Hiển thị chuỗi hiện tại 4 ngày')
  assert.match(html, /Kỷ lục dài nhất:[\s\S]*9 ngày/, 'Hiển thị kỷ lục 9 ngày')
  assert.match(html, /Đã học hôm nay/, 'Hiển thị trạng thái activeToday')

  // Kiểm tra Huy hiệu earned vs locked
  assert.match(html, /Khởi đầu/, 'Có huy hiệu Khởi đầu')
  assert.match(html, /is-earned/, 'Huy hiệu Khởi đầu có class is-earned')
  assert.match(html, /Chăm chỉ/, 'Có huy hiệu Chăm chỉ')
  assert.match(html, /is-locked/, 'Huy hiệu Chăm chỉ có class is-locked')
  assert.match(html, /6[\s\S]*\/[\s\S]*10/, 'Huy hiệu locked hiển thị tiến độ 6/10')

  // Kiểm tra Quy tắc XP
  assert.match(html, /Hoàn thành một bài tập/, 'Có quy tắc hoàn thành bài tập')
  assert.match(html, /\+10 XP/, 'Hiển thị +10 XP')

  // Kiểm tra Bảng xếp hạng có isMe
  assert.match(html, /Nguyễn Minh Anh/, 'Hiển thị tên học sinh')
  assert.match(html, /class="m-leaderboard-me-badge">Bạn<\/span>/, 'Có nhãn Bạn cho isMe')
  assert.match(html, /is-me/, 'Dòng của học sinh có class is-me')
  assert.match(html, /Tên bạn cùng lớp được rút gọn/, 'Có ghi chú bảo vệ quyền riêng tư')
})

test('3. Bảng xếp hạng khi học sinh ngoài top 10: hiển thị dòng tách riêng vị trí của bạn', () => {
  useStudent()
  const outOfTop10Lb = {
    classId: 'class-12a',
    className: 'Toán 12A',
    period: 'week',
    entries: [
      { rank: 1, displayName: 'Học sinh A', initials: 'HA', xp: 120, isMe: false },
      { rank: 2, displayName: 'Học sinh B', initials: 'HB', xp: 110, isMe: false }
    ],
    me: { rank: 14, xp: 25 },
    totalStudents: 25
  }

  const html = renderLeaderboardContent({
    leaderboard: outOfTop10Lb,
    classInfo: { name: 'Toán 12A' },
    period: 'week'
  })

  assert.match(html, /Vị trí của bạn: <strong>Hạng 14<\/strong>/, 'Hiển thị dòng tách riêng thứ hạng ngoài top 10')
  assert.match(html, /25 XP/, 'Hiển thị đúng XP của học sinh')
})

test('4. Chống XSS: chuỗi displayName và dữ liệu từ API được escape HTML an toàn', () => {
  const xssData = {
    classId: 'class-1',
    className: '<script>alert("xss")</script>',
    period: 'week',
    entries: [
      { rank: 1, displayName: '<img src=x onerror="hack()">Nguyễn <Minh>', initials: '<M', xp: 50, isMe: false }
    ],
    me: { rank: 1, xp: 50 },
    totalStudents: 10
  }

  const html = renderLeaderboardContent({
    leaderboard: xssData,
    classInfo: { name: xssData.className }
  })

  assert.doesNotMatch(html, /<script>/i, 'Không được render thẻ script thật')
  assert.doesNotMatch(html, /<img src=x/i, 'Không được render thẻ img inject')
  assert.match(html, /&lt;img src=x/, 'Thẻ html độc hại đã được escape')
  assert.match(html, /&lt;Minh&gt;/, 'Dấu ngoặc nhọn tên được escape')
})

test('5. Cache trong progress-widgets: 2 lần gọi trong thời gian cache chỉ gọi API 1 lần', async () => {
  useStudent()
  clearAchievementsCache()

  let apiCallCount = 0
  const originalGetStudentAchievements = api.getStudentAchievements
  api.getStudentAchievements = async () => {
    apiCallCount++
    return sampleAchievementsData
  }

  try {
    const res1 = await fetchStudentAchievements()
    const res2 = await fetchStudentAchievements()

    assert.equal(apiCallCount, 1, 'Chỉ gọi API 1 lần nhờ cache 60s')
    assert.equal(res1.xp.level, 7)
    assert.equal(res2.xp.level, 7)

    // Khi force: true -> gọi lại API
    await fetchStudentAchievements({ force: true })
    assert.equal(apiCallCount, 2, 'Khi force=true phải gọi lại API')
  } finally {
    api.getStudentAchievements = originalGetStudentAchievements
    clearAchievementsCache()
  }
})

test('6. Widget trang chủ: render đúng dữ liệu và khi chưa có huy hiệu nào hiển thị huy hiệu gần đạt nhất', () => {
  const dataWithoutEarnedBadges = {
    ...sampleAchievementsData,
    badges: [
      { id: 'b1', title: 'Bền bỉ', description: 'Hoàn thành 30 bài', icon: 'fa-person-running', earned: false, progress: 15, target: 30 },
      { id: 'b2', title: 'Điểm tuyệt đối', description: 'Đạt điểm 10', icon: 'fa-star', earned: false, progress: 0, target: 1 }
    ]
  }

  const html = renderHomeAchievementsContent({
    achievements: dataWithoutEarnedBadges,
    leaderboard: sampleLeaderboardData,
    classInfo: { name: 'Toán 12A' }
  })

  assert.match(html, /Cấp 7/, 'Widget có Cấp 7')
  assert.match(html, /4 ngày/, 'Widget có chuỗi 4 ngày')
  assert.match(html, /Gần hoàn thành/, 'Hiển thị huy hiệu gần hoàn thành nhất')
  assert.match(html, /Bền bỉ/, 'Huy hiệu 15/30 (50%) được chọn vì gần đạt hơn 0/1')
  assert.match(html, /15[\s\S]*\/[\s\S]*30/, 'Tiến độ 15/30 hiển thị')
  assert.match(html, /Xếp hạng tuần/, 'Widget có mini bảng xếp hạng')
})

test('7. Lỗi API không làm vỡ trang chủ: hiển thị khối nhỏ kèm nút Thử lại', async () => {
  useStudent()
  clearAchievementsCache()

  const fakeContainer = { innerHTML: '' }
  elementsMap.set('student-home-achievements', fakeContainer)

  const originalGetAchievements = api.getStudentAchievements
  api.getStudentAchievements = async () => {
    throw new Error('Network error simulate')
  }

  try {
    await mountHomeAchievementsWidget({ containerId: 'student-home-achievements' })
    assert.match(fakeContainer.innerHTML, /Chưa tải được thành tích/, 'Hiển thị thông báo lỗi thân thiện')
    assert.match(fakeContainer.innerHTML, /btn-retry-home-achievements/, 'Có nút thử lại')
  } finally {
    api.getStudentAchievements = originalGetAchievements
    elementsMap.clear()
    clearAchievementsCache()
  }
})

test('8. Navbar streak chip: cập nhật khi streak > 0 và ẩn khi streak = 0', () => {
  const fakeSlot = {
    hidden: true,
    removeAttribute: () => { fakeSlot.hidden = false },
    setAttribute: () => { fakeSlot.hidden = true },
    innerHTML: ''
  }
  elementsMap.set('[data-progress-slot]', [fakeSlot])

  // Khi current = 4
  updateNavbarStreak({ streak: { current: 4 } })
  assert.equal(fakeSlot.hidden, false, 'Slot được unhide khi current > 0')
  assert.match(fakeSlot.innerHTML, /4 ngày/, 'Hiển thị số ngày')
  assert.match(fakeSlot.innerHTML, /fa-fire/, 'Có icon ngọn lửa')

  // Khi current = 0
  updateNavbarStreak({ streak: { current: 0 } })
  assert.equal(fakeSlot.hidden, true, 'Slot bị ẩn khi current = 0')
  assert.equal(fakeSlot.innerHTML, '', 'Nội dung rỗng khi ẩn')

  elementsMap.clear()
})

test('9. Vào thẳng #achievements khi state.classes rỗng: nạp api.getClasses và hiển thị bảng xếp hạng của lớp', async () => {
  useStudent()
  state.classes = [] // giả lập vào thẳng khi chưa qua trang chủ
  clearAchievementsCache()

  const fakeContainer = {
    id: 'achievements-content',
    innerHTML: ''
  }
  elementsMap.set('achievements-content', fakeContainer)

  let getClassesCalled = false
  const originalGetClasses = api.getClasses
  const originalGetAchievements = api.getStudentAchievements
  const originalGetLeaderboard = api.getClassLeaderboard

  api.getClasses = async () => {
    getClassesCalled = true
    return [{ id: 'class-12a', name: 'Toán 12A' }]
  }
  api.getStudentAchievements = async () => sampleAchievementsData
  api.getClassLeaderboard = async () => sampleLeaderboardData

  try {
    await bindAchievementsEvents()

    assert.equal(getClassesCalled, true, 'Phải gọi api.getClasses khi state.classes rỗng')
    assert.equal(state.classes.length, 1, 'state.classes phải được cập nhật từ API')
    assert.equal(state.classes[0].name, 'Toán 12A')
    assert.doesNotMatch(fakeContainer.innerHTML, /Bạn chưa tham gia lớp học nào/, 'Không được kết luận chưa có lớp khi chưa nạp')
    assert.match(fakeContainer.innerHTML, /Toán 12A/, 'Hiển thị đúng tên lớp sau khi nạp')
    assert.match(fakeContainer.innerHTML, /Nguyễn Minh Anh/, 'Hiển thị bảng xếp hạng của lớp')
  } finally {
    api.getClasses = originalGetClasses
    api.getStudentAchievements = originalGetAchievements
    api.getClassLeaderboard = originalGetLeaderboard
    elementsMap.clear()
    clearAchievementsCache()
  }
})

test('10. Vào thẳng #achievements khi state.classes rỗng và api.getClasses lỗi: hiển thị thông báo lỗi và nút Thử lại', async () => {
  useStudent()
  state.classes = []
  clearAchievementsCache()

  const fakeContainer = {
    id: 'achievements-content',
    innerHTML: ''
  }
  elementsMap.set('achievements-content', fakeContainer)

  const originalGetClasses = api.getClasses
  api.getClasses = async () => {
    throw new Error('Lỗi máy chủ khi tải danh sách lớp')
  }

  try {
    await bindAchievementsEvents()

    assert.match(fakeContainer.innerHTML, /Không tải được danh sách lớp/, 'Hiển thị thông báo không tải được danh sách lớp')
    assert.match(fakeContainer.innerHTML, /Lỗi máy chủ khi tải danh sách lớp/, 'Hiển thị đúng thông báo lỗi từ API')
    assert.match(fakeContainer.innerHTML, /btn-retry-achievements/, 'Có nút thử lại')
  } finally {
    api.getClasses = originalGetClasses
    elementsMap.clear()
    clearAchievementsCache()
  }
})

test('11. Căn nội dung lưới huy hiệu và thẻ quy tắc XP', () => {
  useStudent()
  const html = renderAchievementsContent({
    achievements: sampleAchievementsData,
    leaderboard: sampleLeaderboardData,
    selectedClassId: 'class-12a',
    period: 'week',
    classes: state.classes
  })

  // Huy hiệu: căn icon và tiêu đề liền kề nhau qua .m-badge-content
  assert.match(html, /class="m-badge-content"/, 'Có wrapper .m-badge-content cho tiêu đề và mô tả')
  assert.match(html, /class="m-badge-progress-wrap"/, 'Thẻ chưa đạt có phần tiến độ ở cuối')

  // Quy tắc XP: có label và chip xp riêng biệt
  assert.match(html, /class="m-rule-label">Điểm tốt nhất \(quy đổi thang 10\)<\/span>/, 'Quy tắc XP có .m-rule-label')
  assert.match(html, /class="m-rule-xp">\+0 đến \+10 XP<\/span>/, 'Quy tắc XP có .m-rule-xp')
})

test('12. Widget trang chủ: tiêu đề xếp hạng tuần stacked, chip tên lớp 1 dòng có title, chip streak nowrap', () => {
  useStudent()
  const html = renderHomeAchievementsContent({
    achievements: sampleAchievementsData,
    leaderboard: sampleLeaderboardData,
    classInfo: { name: 'Toán 12A Cơ bản & Nâng cao' }
  })

  // Ô Xếp hạng tuần
  assert.match(html, /m-home-achieve-card-header--stacked/, 'Header ô xếp hạng tuần có class stacked')
  assert.match(html, /class="m-chip m-home-class-chip" title="Toán 12A Cơ bản &amp; Nâng cao"/, 'Chip tên lớp có class m-home-class-chip và title')
  assert.match(html, /class="m-home-leaderboard-name" title="Nguyễn Minh Anh"/, 'Tên học sinh có class m-home-leaderboard-name và title')
  assert.match(html, /class="m-home-leaderboard-xp"/, 'Điểm XP có class m-home-leaderboard-xp')

  // Ô Chuỗi ngày học
  assert.match(html, /class="m-home-streak-status-wrap"/, 'Chip trạng thái streak được bọc trong wrap dưới số ngày')
  assert.match(html, /m-nowrap/, 'Chip trạng thái streak có class m-nowrap')

  // Navbar streak chip có span unit để ẩn trên mobile
  const fakeSlot = {
    hidden: true,
    removeAttribute: () => { fakeSlot.hidden = false },
    setAttribute: () => { fakeSlot.hidden = true },
    innerHTML: ''
  }
  elementsMap.set('[data-progress-slot]', [fakeSlot])
  updateNavbarStreak({ streak: { current: 4 } })
  assert.match(fakeSlot.innerHTML, /class="m-streak-count">4<\/span>/, 'Chip có m-streak-count')
  assert.match(fakeSlot.innerHTML, /class="m-streak-unit"/, 'Chip có m-streak-unit để ẩn trên <=640px')
  assert.match(fakeSlot.innerHTML, /aria-label="Chuỗi học tập: 4 ngày"/, 'aria-label vẫn đầy đủ thông tin')
  elementsMap.clear()
})
