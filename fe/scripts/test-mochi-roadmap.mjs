// Test trang lộ trình Mochi dùng chung cho 4 môn (Hóa 12, Toán 12, Hóa 11, Toán 11).
// Chạy: cd fe && node --test scripts/test-mochi-roadmap.mjs
import test from 'node:test'
import assert from 'node:assert/strict'
import { register } from 'node:module'
import { readFileSync } from 'node:fs'

// roadmap-page.js -> trial.js kéo theo nhiều module; chỉ cần bỏ qua CSS/SVG
// (Node không import trực tiếp được) là đủ cho phần logic được test ở đây.
register('data:text/javascript,' + encodeURIComponent(`
  export async function load(url, context, nextLoad) {
    if (url.endsWith('.css') || url.endsWith('.svg')) return { format: 'module', shortCircuit: true, source: '' };
    return nextLoad(url, context);
  }
`))

const storage = new Map()
globalThis.localStorage = {
  getItem: key => storage.get(key) ?? null,
  setItem: (key, value) => storage.set(key, String(value)),
  removeItem: key => storage.delete(key)
}

// theme.js chạy ở cấp module (applyTheme + đăng ký listener) nên document/window
// phải tồn tại trước khi import động các view.
globalThis.document = {
  head: null,
  documentElement: {
    dataset: {},
    style: {},
    classList: { add() {}, remove() {}, toggle() {} }
  },
  addEventListener() {},
  dispatchEvent() {},
  querySelector: () => null,
  querySelectorAll: () => [],
  getElementById: () => null
}
globalThis.window = {
  location: { hash: '#roadmap', search: '' },
  addEventListener() {},
  dispatchEvent() {},
  matchMedia: () => ({ matches: false, addEventListener() {} })
}

const { validateRoadmap, fromHoa12, fromHoa11 } = await import('../src/js/utils/roadmap-schema.js')
const { ROADMAP_SUBJECTS, ROADMAP_ROUTES, getRoadmapSubjectByRoute } = await import('../src/js/data/roadmaps/index.js')
const { ROADMAP_DATA } = await import('../src/js/components/roadmap.js')
const { ROADMAP_11_DATA } = await import('../src/js/components/roadmap-11.js')
const { renderMochiRoadmap, normalizeSearchText } = await import('../src/js/views/mochi/roadmap.js')
const { useMochiRoadmap } = await import('../src/js/views/roadmap-page.js')

const esc = value => String(value ?? '').replace(/[&<>"']/g, char => ({
  '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#039;'
})[char])

const countLessons = data => (data.chapters || []).reduce((n, c) => n + (c.lessons || []).length, 0)
const countForms = data => (data.chapters || []).reduce((n, c) => n + (c.lessons || []).reduce((m, l) => m + (l.forms || []).length, 0), 0)

const subject = id => ROADMAP_SUBJECTS.find(s => s.id === id)

// 1. Dữ liệu thật của cả 4 môn phải hợp lệ và route khớp danh mục.
test('validateRoadmap trả [] cho cả 4 môn và route khớp ROADMAP_ROUTES', () => {
  assert.equal(ROADMAP_SUBJECTS.length, 4)
  for (const s of ROADMAP_SUBJECTS) {
    assert.deepEqual(validateRoadmap(s.data), [], `${s.id} phải hợp lệ`)
  }

  const ids = ROADMAP_SUBJECTS.map(s => s.data.id)
  assert.deepEqual(ids, ['hoa-12', 'toan-12', 'hoa-11', 'toan-11'])
  assert.equal(new Set(ids).size, ids.length, 'id môn không được trùng')

  const routes = ROADMAP_SUBJECTS.map(s => s.route)
  assert.equal(new Set(routes).size, routes.length, 'route không được trùng')
  assert.deepEqual(
    [...routes].sort(),
    ROADMAP_ROUTES.filter(route => route !== 'roadmap-12').sort(),
    'route của 4 môn phải khớp ROADMAP_ROUTES (trừ alias roadmap-12)'
  )
})

// 2. Validator phải bắt được từng loại dữ liệu hỏng.
test('validateRoadmap bắt lỗi điểm đề, tier, tuần thiếu, id trùng và nguồn không https', () => {
  const clean = structuredClone(subject('hoa-12').data)
  assert.deepEqual(validateRoadmap(clean), [], 'bản clone sạch vẫn hợp lệ')

  const badPoints = structuredClone(clean)
  badPoints.exam.parts[0].points = Number(badPoints.exam.parts[0].points) + 1
  assert.ok(
    validateRoadmap(badPoints).some(e => /^exam\.parts: tổng điểm phải = 10/.test(e)),
    'phải báo tổng điểm exam ≠ 10'
  )

  const badTier = structuredClone(clean)
  badTier.chapters[0].lessons[0].forms[0].tier = 'boss'
  assert.ok(
    validateRoadmap(badTier).some(e => /forms\[0\]\.tier/.test(e)),
    'phải báo tier ngoài nen|nang|top'
  )

  const missingWeeks = structuredClone(clean)
  missingWeeks.weeks.pop()
  assert.ok(
    validateRoadmap(missingWeeks).some(e => /^weeks: cần đủ \d+ tuần/.test(e)),
    'phải báo thiếu tuần'
  )

  const dupLesson = structuredClone(clean)
  dupLesson.chapters[1].lessons[0].id = dupLesson.chapters[0].lessons[0].id
  assert.ok(
    validateRoadmap(dupLesson).some(e => /\.id: thiếu hoặc trùng/.test(e)),
    'phải báo id bài trùng'
  )

  const badSource = structuredClone(clean)
  badSource.meta.sources[0].url = 'http://example.com/khong-https'
  assert.ok(
    validateRoadmap(badSource).some(e => /^meta\.sources\[0\]/.test(e)),
    'phải báo source url không phải https'
  )
})

// 3. Chuyển đổi Hóa phải giữ nguyên số chương/bài/dạng so với dữ liệu gốc.
test('fromHoa12/fromHoa11 khớp số chương, bài, dạng của dữ liệu gốc', () => {
  const hoa12 = fromHoa12(structuredClone(ROADMAP_DATA))
  assert.equal(hoa12.chapters.length, ROADMAP_DATA.chapters.length)
  assert.equal(countLessons(hoa12), countLessons(ROADMAP_DATA))
  assert.equal(countForms(hoa12), countForms(ROADMAP_DATA))
  assert.equal(hoa12.stages.length, ROADMAP_DATA.months.length)
  assert.equal(hoa12.weeks.length, ROADMAP_DATA.weeks.length)

  const hoa11 = fromHoa11(structuredClone(ROADMAP_11_DATA))
  assert.equal(hoa11.chapters.length, ROADMAP_11_DATA.chapters.length)
  assert.equal(countLessons(hoa11), countLessons(ROADMAP_11_DATA))
  assert.equal(countForms(hoa11), countForms(ROADMAP_11_DATA))
  assert.equal(hoa11.stages.length, ROADMAP_11_DATA.meta.phases.length)
  assert.equal(hoa11.weeks.length, ROADMAP_11_DATA.weeks.length)
  assert.deepEqual(validateRoadmap(hoa11), [], 'Hóa 11 chuyển đổi vẫn hợp lệ')
})

// 4. Tra cứu môn theo route, gồm alias cũ và fallback.
test('getRoadmapSubjectByRoute ánh xạ đúng route và fallback về hoa-12', () => {
  assert.equal(getRoadmapSubjectByRoute('roadmap').id, 'hoa-12')
  assert.equal(getRoadmapSubjectByRoute('roadmap-12').id, 'hoa-12')
  assert.equal(getRoadmapSubjectByRoute('roadmap-11').id, 'hoa-11')
  assert.equal(getRoadmapSubjectByRoute('roadmap-math-12').id, 'toan-12')
  assert.equal(getRoadmapSubjectByRoute('roadmap-math-11').id, 'toan-11')
  assert.equal(getRoadmapSubjectByRoute('khong-ton-tai').id, 'hoa-12')
})

// 5. Render đủ khung trang cho cả 4 môn.
test('renderMochiRoadmap render đúng khung, theme, tiêu đề, số bài và tab active', () => {
  for (const s of ROADMAP_SUBJECTS) {
    const html = renderMochiRoadmap(s)

    assert.match(html, /class="m-roadmap"/, `${s.id}: thiếu .m-roadmap`)
    const theme = html.match(/data-roadmap-theme="([^"]+)"/)?.[1]
    assert.ok(['light', 'dark', 'sakura', 'mint'].includes(theme), `${s.id}: theme không hợp lệ (${theme})`)
    assert.ok(
      html.includes(`id="m-rm-title">${esc(s.data.meta.title)}</h1>`),
      `${s.id}: h1 phải chứa meta.title đã escape`
    )

    const expectedLessons = countLessons(s.data)
    const renderedLessons = (html.match(/data-lesson-id="/g) || []).length
    assert.equal(renderedLessons, expectedLessons, `${s.id}: số bài render phải bằng dữ liệu`)

    assert.ok(
      new RegExp(`<a href="#${s.route}"[^>]*aria-current="page"`).test(html),
      `${s.id}: tab đang xem phải có aria-current="page"`
    )
    assert.ok(html.includes('href="#trial?tab=lessons"'), `${s.id}: thiếu link bài học thử`)
    assert.ok(html.includes('href="#login"'), `${s.id}: thiếu link đăng nhập`)
  }
})

// 6. CTA khác nhau theo entranceHomeworkId.
test('CTA: Hóa 12 có nút kiểm tra đầu vào, Toán 12 có nút đăng ký và không có nút đầu vào', () => {
  const hoa = renderMochiRoadmap(subject('hoa-12'))
  assert.match(hoa, /data-m-rm-entrance/, 'Hóa 12 phải có nút kiểm tra đầu vào')
  assert.match(hoa, /id="m-rm-entrance"/, 'Hóa 12 phải có id m-rm-entrance')

  const toan = subject('toan-12')
  assert.equal(toan.data.meta.entranceHomeworkId, null, 'Toán 12 không có bài kiểm tra đầu vào')
  const toanHtml = renderMochiRoadmap(toan)
  assert.doesNotMatch(toanHtml, /data-m-rm-entrance/, 'Toán 12 không được có nút đầu vào')
  assert.doesNotMatch(toanHtml, /id="m-rm-entrance"/, 'Toán 12 không được có id nút đầu vào')
  assert.match(toanHtml, /data-m-rm-register/, 'Toán 12 phải có nút đăng ký')
})

// 7. Không được render thô dữ liệu động.
test('escape meta.title và tên dạng bài trong HTML render', () => {
  const fake = structuredClone(subject('toan-12'))
  fake.data.meta.title = '<img src=x onerror=alert(1)>'
  fake.data.chapters[0].lessons[0].forms[0].name = '"><script>alert(1)</script>'

  const html = renderMochiRoadmap(fake)
  assert.ok(html.includes('&lt;img src=x onerror=alert(1)&gt;'), 'title phải được escape')
  assert.doesNotMatch(html, /<img src=x/, 'không được có thẻ img thô')
  assert.doesNotMatch(html, /<script>/, 'không được có thẻ script thô')
  assert.ok(html.includes('&lt;script&gt;'), 'tên dạng bài phải được escape')
})

// 8. Chuẩn hoá tìm kiếm tiếng Việt.
test('normalizeSearchText bỏ dấu tiếng Việt và hạ chữ', () => {
  assert.equal(normalizeSearchText('Điện phân'), 'dien phan')
  assert.equal(normalizeSearchText('Tích Phân'), 'tich phan')
})

// 9. Cờ giao diện quyết định dùng Mochi hay bản classic.
test('useMochiRoadmap tôn trọng ?ui=classic và các route chỉ có bản Mochi', () => {
  localStorage.setItem('eduportal-ui', 'classic')
  assert.equal(useMochiRoadmap('roadmap'), false, 'classic: Hóa 12 dùng bản cũ')
  assert.equal(useMochiRoadmap('roadmap-11'), false, 'classic: Hóa 11 dùng bản cũ')
  assert.equal(useMochiRoadmap('roadmap-math-12'), true, 'Toán 12 chỉ có bản Mochi')

  localStorage.removeItem('eduportal-ui')
  assert.equal(useMochiRoadmap('roadmap'), true, 'mặc định là Mochi')
})

// 10. CSS phải scope dưới .m-roadmap, bỏ qua @keyframes/@media wrapper.
test('CSS roadmap chỉ dùng selector bắt đầu bằng .m-roadmap', () => {
  const css = readFileSync(new URL('../src/css/mochi/roadmap.css', import.meta.url), 'utf8')
    .replace(/\/\*[\s\S]*?\*\//g, '')

  const selectors = []
  const stack = []
  let prelude = ''
  for (const ch of css) {
    if (ch === '{') {
      const head = prelude.trim()
      prelude = ''
      const inKeyframes = stack.some(ctx => ctx.keyframes)
      if (head.startsWith('@')) {
        stack.push({ atRule: true, keyframes: /keyframes/.test(head) })
      } else {
        if (head && !inKeyframes) selectors.push(head)
        stack.push({ atRule: false, keyframes: false })
      }
    } else if (ch === '}') {
      stack.pop()
      prelude = ''
    } else if (ch === ';') {
      prelude = ''
    } else {
      prelude += ch
    }
  }

  assert.ok(selectors.length > 0, 'phải tìm thấy selector trong CSS')
  for (const group of selectors) {
    for (const selector of group.split(',').map(value => value.trim()).filter(Boolean)) {
      assert.match(selector, /^\.m-roadmap/, `Selector chưa scope .m-roadmap: ${selector}`)
    }
  }
})

test('resolveTrialRoadmapRoute: #trial không tab / tab lộ trình → route lộ trình; bài học thử giữ nguyên', async () => {
  const { resolveTrialRoadmapRoute } = await import('../src/js/views/roadmap-page.js')
  assert.equal(resolveTrialRoadmapRoute('#trial'), 'roadmap')
  assert.equal(resolveTrialRoadmapRoute('#trial?tab=roadmap'), 'roadmap')
  assert.equal(resolveTrialRoadmapRoute('#trial?tab=roadmap-12'), 'roadmap')
  assert.equal(resolveTrialRoadmapRoute('#trial?tab=roadmap-11'), 'roadmap-11')
  assert.equal(resolveTrialRoadmapRoute('#trial?tab=lessons'), null)
  assert.equal(resolveTrialRoadmapRoute('#trial?tab=history'), null)
  assert.equal(resolveTrialRoadmapRoute('#trial?classId=c1'), null)
  assert.equal(resolveTrialRoadmapRoute('#trial?lessonId=l1'), null)
  assert.equal(resolveTrialRoadmapRoute('#roadmap'), null)
})
