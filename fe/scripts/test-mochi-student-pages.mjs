import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, resolve } from 'node:path'

const saved = new Map()
const storage = {
  getItem: key => saved.get(key) ?? null,
  setItem: (key, value) => saved.set(key, String(value)),
  removeItem: key => saved.delete(key)
}

globalThis.localStorage = storage
globalThis.sessionStorage = storage
globalThis.CustomEvent = class {
  constructor(type, options = {}) { this.type = type; this.detail = options.detail }
}
globalThis.document = {
  documentElement: { dataset: {}, style: {} },
  addEventListener: () => {},
  dispatchEvent: () => {},
  querySelector: () => null,
  querySelectorAll: () => [],
  getElementById: () => null
}
globalThis.window = {
  location: { hash: '#student-dashboard', search: '' },
  addEventListener: () => {},
  matchMedia: () => ({ matches: false }),
  open: () => {}
}

const { state } = await import('../src/js/state.js')
const { renderMyClassesView, renderClassicMyClassesView } = await import('../src/js/views/my-classes.js')
const { renderMochiLessonMap } = await import('../src/js/views/mochi/lesson-map.js')
const { renderMochiLessonDetail } = await import('../src/js/views/mochi/lesson-detail.js')
const { sortMochiLessons, sortMochiChapters } = await import('../src/js/views/mochi/lesson-order.js')

const scriptDir = dirname(fileURLToPath(import.meta.url))
const cssPath = resolve(scriptDir, '../src/css/mochi/student-pages.css')
const studentPagesCss = readFileSync(cssPath, 'utf-8')

function setMochi(enabled) {
  if (enabled) saved.set('eduportal-ui', 'mochi')
  else saved.set('eduportal-ui', 'classic') // Mochi là mặc định: phải chọn giao diện cũ tường minh
  window.location.search = ''
}

function fixture() {
  state.user = { id: 'student-1', role: 'STUDENT', fullName: 'Nguyễn Minh Anh', classIds: ['class-1'] }
  state.token = 'token'
  state.classes = [{ id: 'class-1', name: 'Toán 12', studentsCount: 20, progress: 0 }]
  state.classChapters = [{
    id: 'chapter-1', title: 'Hàm số', orderIndex: 1, lessons: [{
      id: 'lesson-1', title: 'Cực trị hàm số', videoUrl: 'https://drive.google.com/file/d/drive123/view',
      content: '<p>Lý thuyết cực trị.</p>', theoryFiles: ['lesson_theory.pdf'], homeworks: [
        { id: 'practice-1', title: 'Luyện tập cực trị', type: 'PRACTICE', durationMinutes: 30 },
        { id: 'exam-1', title: 'Kiểm tra cực trị', type: 'EXAM', durationMinutes: 15, pdfPath: 'exam.pdf' }
      ]
    }]
  }]
  state.activeLessonHomeworks = []
}

function multiLessonFixture() {
  state.user = { id: 'student-1', role: 'STUDENT', fullName: 'Nguyễn Minh Anh', classIds: ['class-1'] }
  state.token = 'token'
  state.classes = [{ id: 'class-1', name: 'Toán 12', studentsCount: 20, progress: 0 }]
  // Dữ liệu đầu vào giả lập sortClassChaptersLessons (mới nhất trước):
  // Chương 2 có bài mới hơn Chương 1 -> Chương 2 xếp trước.
  // Trong Chương 2: Bài 3 mới hơn Bài 2 -> Bài 3 xếp trước Bài 2.
  state.classChapters = [
    {
      id: 'chapter-2',
      title: 'Mũ và Logarit',
      orderIndex: 2,
      createdAt: '2026-02-01T00:00:00Z',
      lessons: [
        {
          id: 'lesson-3',
          title: 'Bài 3. Bất phương trình mũ',
          orderIndex: 3,
          createdAt: '2026-03-01T00:00:00Z',
          homeworks: []
        },
        {
          id: 'lesson-2',
          title: 'Bài 2. Hàm số mũ',
          orderIndex: 2,
          createdAt: '2026-02-15T00:00:00Z',
          homeworks: []
        }
      ]
    },
    {
      id: 'chapter-1',
      title: 'Khảo sát hàm số',
      orderIndex: 1,
      createdAt: '2026-01-01T00:00:00Z',
      lessons: [
        {
          id: 'lesson-1',
          title: 'Bài 1. Đơn điệu hàm số',
          orderIndex: 1,
          createdAt: '2026-01-10T00:00:00Z',
          homeworks: []
        }
      ]
    }
  ]
  state.activeLessonHomeworks = []
}

test('cờ tắt giữ nguyên output classic cho cả ba màn', () => {
  fixture()
  setMochi(false)
  for (const hash of [
    '#student-dashboard',
    '#my-classes?classId=class-1',
    '#my-classes?classId=class-1&lessonId=lesson-1'
  ]) {
    window.location.hash = hash
    assert.equal(renderMyClassesView(), renderClassicMyClassesView(), hash)
  }
})

test('Mochi bật có đúng các khối chính và không có tính năng chưa bật', () => {
  fixture()
  setMochi(true)

  window.location.hash = '#student-dashboard'
  const home = renderMyClassesView()
  assert.match(home, /Chào Anh!/)
  assert.match(home, /Bài tập cần làm/)
  assert.match(home, /Mochi gợi ý ôn lại/)
  assert.match(home, /id="m-home-continue"/)

  window.location.hash = '#my-classes?classId=class-1'
  const map = renderMyClassesView()
  assert.match(map, /Lộ trình bài học/)
  assert.match(map, /Cực trị hàm số/)
  assert.match(map, /m-chapter-tab/)

  window.location.hash = '#my-classes?classId=class-1&lessonId=lesson-1'
  const detail = renderMyClassesView()
  assert.match(detail, /Video/)
  assert.match(detail, /Lý thuyết/)
  assert.match(detail, /Mở trong Google Drive/)
  assert.match(detail, /Bài tập của bài/)
  assert.match(detail, /Xem video[\s\S]*Đọc lý thuyết[\s\S]*Làm bài tập/)

  const all = home + map + detail
  assert.match(home, /student-home-achievements|m-home-achievements/i)
  assert.doesNotMatch(map + detail, /streak|\bXP\b|Huy hiệu|Bảng xếp hạng/i)
  assert.doesNotMatch(all, /Meet|mục lục/i)
  assert.doesNotMatch(detail, /Ghi chú/)
})

test('dữ liệu rỗng render trạng thái hướng dẫn, không lỗi', () => {
  fixture()
  setMochi(true)
  state.classes = []
  state.classChapters = []
  state.activeLessonHomeworks = []

  window.location.hash = '#student-dashboard'
  assert.doesNotThrow(() => renderMyClassesView())
  window.location.hash = '#my-classes?classId=missing'
  const emptyMap = renderMyClassesView()
  assert.match(emptyMap, /Chưa có nội dung bài học/)
})

test('học sinh không thấy link PDF của bài EXAM', () => {
  fixture()
  setMochi(true)
  window.location.hash = '#my-classes?classId=class-1&lessonId=lesson-1'
  const detail = renderMyClassesView()
  assert.equal((detail.match(/Tải PDF/g) || []).length, 1, 'chỉ bài PRACTICE có nút PDF')
  const examStart = detail.indexOf('Kiểm tra cực trị')
  const examEnd = detail.indexOf('</article>', examStart)
  assert.ok(examStart >= 0 && examEnd > examStart)
  assert.doesNotMatch(detail.slice(examStart, examEnd), /Tải PDF/)
})

test('giao diện cũ giữ nguyên 100% thứ tự cũ khi dữ liệu vào mới nhất trước', () => {
  multiLessonFixture()
  setMochi(false)

  window.location.hash = '#my-classes?classId=class-1'
  const classicMap = renderMyClassesView()
  assert.equal(classicMap, renderClassicMyClassesView())

  // Giao diện classic hiển thị chương mới nhất trước (Chương 2 Mũ và Logarit trước Chương 1 Khảo sát hàm số)
  const ch2Pos = classicMap.indexOf('Mũ và Logarit')
  const ch1Pos = classicMap.indexOf('Khảo sát hàm số')
  assert.ok(ch2Pos >= 0 && ch1Pos >= 0)
  assert.ok(ch2Pos < ch1Pos, 'Classic giữ nguyên thứ tự chương mới nhất trước')

  // Trong Chương 2 classic: Bài 3 trước Bài 2
  const l3Pos = classicMap.indexOf('Bài 3. Bất phương trình mũ')
  const l2Pos = classicMap.indexOf('Bài 2. Hàm số mũ')
  assert.ok(l3Pos >= 0 && l2Pos >= 0)
  assert.ok(l3Pos < l2Pos, 'Classic giữ nguyên thứ tự bài mới nhất trước')

  // state.classChapters không bị thay đổi
  assert.equal(state.classChapters[0].id, 'chapter-2')
  assert.equal(state.classChapters[0].lessons[0].id, 'lesson-3')
})

test('bản đồ bài học Mochi: chương và bài học xếp theo thứ tự học TĂNG DẦN', () => {
  multiLessonFixture()
  setMochi(true)

  window.location.hash = '#my-classes?classId=class-1'
  const map = renderMyClassesView()

  // 1. Tab chương xếp theo thứ tự chương tăng dần: Chương 1 trước Chương 2
  const tabCh1 = map.indexOf('data-chapter-id="chapter-1"')
  const tabCh2 = map.indexOf('data-chapter-id="chapter-2"')
  assert.ok(tabCh1 >= 0 && tabCh2 >= 0, 'Có cả 2 tab chương')
  assert.ok(tabCh1 < tabCh2, 'Tab Chương 1 phải đứng trước tab Chương 2')

  // 2. Chương mặc định là Chương 1 (orderIndex nhỏ nhất)
  assert.match(map, /<h1>Khảo sát hàm số<\/h1>/)
  assert.match(map, /Bài 1\. Đơn điệu hàm số/)

  // 3. Render Chương 2 trực tiếp: bài học phải xếp theo thứ tự TĂNG DẦN (Bài 2 trước Bài 3)
  const mapCh2 = renderMochiLessonMap({
    classes: state.classes,
    classChapters: state.classChapters,
    classId: 'class-1'
  })
  // Với renderMochiLessonMap khi truyền remembered/selected là chapter-2:
  const sortedCh = sortMochiChapters(state.classChapters)
  const ch2 = sortedCh.find(c => c.id === 'chapter-2')
  assert.equal(ch2.lessons[0].id, 'lesson-2', 'Bài 2 phải đứng trước Bài 3')
  assert.equal(ch2.lessons[1].id, 'lesson-3', 'Bài 3 phải đứng sau Bài 2')

  // Số thứ tự nút tròn = 1, 2 theo thứ tự tăng dần
  const ch2Html = renderMochiLessonMap({
    classes: state.classes,
    classChapters: [ch2],
    classId: 'class-1'
  })
  const posL2 = ch2Html.indexOf('Bài 2. Hàm số mũ')
  const posL3 = ch2Html.indexOf('Bài 3. Bất phương trình mũ')
  assert.ok(posL2 >= 0 && posL3 >= 0)
  assert.ok(posL2 < posL3, 'Bài 2 phải hiển thị trước Bài 3 trên lộ trình')
  assert.match(ch2Html, /<span>1<\/span>[\s\S]*Bài 2\. Hàm số mũ[\s\S]*<span>2<\/span>[\s\S]*Bài 3\. Bất phương trình mũ/)
})

test('chi tiết bài học Mochi: "Bài trước" / "Bài sau" theo thứ tự học TĂNG DẦN', () => {
  multiLessonFixture()
  setMochi(true)

  // 1. Xem Bài 2 (bài đầu tiên của Chương 2 theo thứ tự tăng dần):
  // "Bài trước" không có hoặc placeholder, "Bài sau" trỏ tới Bài 3
  window.location.hash = '#my-classes?classId=class-1&lessonId=lesson-2'
  const detailL2 = renderMyClassesView()

  // Nút "Bài sau" trỏ tới Bài 3
  assert.match(detailL2, /href="#my-classes\?classId=class-1&lessonId=lesson-3"[^>]*>Bài 3\. Bất phương trình mũ →<\/a>/)
  // Tuyệt đối không có nút "Bài trước" trỏ tới Bài 3 (lỗi cũ Bài 2 trỏ Bài 3 làm bài trước)
  assert.doesNotMatch(detailL2, /href="#my-classes\?classId=class-1&lessonId=lesson-3"[^>]*>←/)

  // 2. Xem Bài 3 (bài thứ 2 của Chương 2 theo thứ tự tăng dần):
  // "Bài trước" trỏ tới Bài 2, "Bài sau" không có
  window.location.hash = '#my-classes?classId=class-1&lessonId=lesson-3'
  const detailL3 = renderMyClassesView()

  // Nút "Bài trước" trỏ tới Bài 2
  assert.match(detailL3, /href="#my-classes\?classId=class-1&lessonId=lesson-2"[^>]*>← Bài 2\. Hàm số mũ<\/a>/)
  // Không có nút "Bài sau"
  assert.doesNotMatch(detailL3, /→<\/a>/)
})

test('sắp xếp bài học Mochi: ưu tiên theo ngày tạo cũ nhất đến gần nhất (createdAt tăng dần)', () => {
  const lessons = [
    { id: 'l-new', title: 'Bài tạo mới nhưng order nhỏ', orderIndex: 1, createdAt: '2026-05-01T00:00:00Z' },
    { id: 'l-old', title: 'Bài tạo cũ nhưng order lớn', orderIndex: 10, createdAt: '2026-02-01T00:00:00Z' },
    { id: 'l-mid', title: 'Bài tạo giữa', orderIndex: 2, createdAt: '2026-03-01T00:00:00Z' },
    { id: 'l-same-1', title: 'Bài cùng ngày order 1', orderIndex: 1, createdAt: '2026-06-01T00:00:00Z' },
    { id: 'l-same-2', title: 'Bài cùng ngày order 2', orderIndex: 2, createdAt: '2026-06-01T00:00:00Z' },
    { id: 'l-no-date', title: 'Bài không có ngày', orderIndex: 0 }
  ]
  const sorted = sortMochiLessons(lessons)
  assert.equal(sorted[0].id, 'l-old', 'Bài cũ nhất (2026-02-01) phải đứng đầu tiên dù orderIndex lớn hơn')
  assert.equal(sorted[1].id, 'l-mid', 'Bài giữa (2026-03-01) đứng thứ hai')
  assert.equal(sorted[2].id, 'l-new', 'Bài mới (2026-05-01) đứng thứ ba')
  assert.equal(sorted[3].id, 'l-same-1', 'Cùng ngày (2026-06-01): order 1 xếp trước order 2')
  assert.equal(sorted[4].id, 'l-same-2', 'Cùng ngày (2026-06-01): order 2 xếp sau order 1')
  assert.equal(sorted[5].id, 'l-no-date', 'Bài thiếu ngày tạo xếp cuối cùng')
})

test('thiếu orderIndex: tự động xếp theo createdAt tăng dần (ngày tạo cũ học trước)', () => {
  const lessonsWithoutOrder = [
    { id: 'lx', title: 'Bài X mới hơn', createdAt: '2026-05-01T00:00:00Z' },
    { id: 'ly', title: 'Bài Y cũ hơn', createdAt: '2026-03-01T00:00:00Z' }
  ]
  const sorted = sortMochiLessons(lessonsWithoutOrder)
  assert.equal(sorted[0].id, 'ly', 'Bài Y cũ hơn học trước')
  assert.equal(sorted[1].id, 'lx', 'Bài X mới hơn học sau')

  const chaptersWithoutOrder = [
    { id: 'cx', title: 'Chương mới hơn', createdAt: '2026-04-01T00:00:00Z', lessons: [] },
    { id: 'cy', title: 'Chương cũ hơn', createdAt: '2026-01-01T00:00:00Z', lessons: [] }
  ]
  const sortedCh = sortMochiChapters(chaptersWithoutOrder)
  assert.equal(sortedCh[0].id, 'cy', 'Chương cũ hơn đứng trước')
  assert.equal(sortedCh[1].id, 'cx', 'Chương mới hơn đứng sau')
})

test('CSS student-pages.css: responsive header, tiêu đề không ellipsis, 3 ô bước xếp 1 cột <=640px', () => {
  // 1. Mọi rule phải scope html[data-ui="mochi"]
  const rawRules = studentPagesCss.split('}').filter(r => r.trim() && !r.includes('@media') && !r.includes('@keyframes'))
  for (const rule of rawRules) {
    const selector = rule.split('{')[0].trim()
    if (selector && !selector.startsWith('@')) {
      assert.match(selector, /html\[data-ui="mochi"\]/, `Selector "${selector}" phải scope html[data-ui="mochi"]`)
    }
  }

  // 2. Tiêu đề không bị cắt bằng ellipsis, cho phép xuống dòng
  assert.match(studentPagesCss, /white-space:\s*normal\s*!important/)
  assert.match(studentPagesCss, /overflow-wrap:\s*anywhere/)
  assert.match(studentPagesCss, /text-overflow:\s*clip\s*!important/)

  // 3. Tại <=640px: header xếp dọc, 3 ô bước xếp 1 cột
  const media640Match = studentPagesCss.match(/@media\s*\([^)]*640px[^)]*\)\s*\{([\s\S]*?)(?:@media|$)/)
  assert.ok(media640Match, 'Phải có block @media (max-width:640px)')
  const media640Css = media640Match[1]

  // .m-detail-header / .m-detail-title-row xếp dọc (flex-direction: column)
  assert.match(media640Css, /\.m-detail-header[\s\S]*?flex-direction:\s*column/)
  assert.match(media640Css, /\.m-detail-title-row[\s\S]*?flex-direction:\s*column/)

  // 3 ô bước xếp 1 cột (grid-template-columns: 1fr)
  assert.match(media640Css, /\.m-lesson-steps[\s\S]*?grid-template-columns:\s*1fr/)

  // Pager bài học hỗ trợ mobile
  assert.match(media640Css, /\.m-lesson-pager[\s\S]*?flex-direction:\s*column/)

  // 4. Tại <=900px (834px): có rules responsive
  const media900Match = studentPagesCss.match(/@media\s*\([^)]*900px[^)]*\)\s*\{([\s\S]*?)\}/)
  assert.ok(media900Match, 'Phải có block @media (max-width:900px)')
})
