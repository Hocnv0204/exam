// Test trang HỌC THỬ giao diện Mochi (views/mochi/trial*.js) và helper dùng chung.
// Chạy: cd fe && node --test scripts/test-mochi-trial.mjs
import test from 'node:test'
import assert from 'node:assert/strict'
import { register } from 'node:module'
import { readFileSync } from 'node:fs'

// trial.js kéo theo nhiều module; chỉ cần bỏ qua CSS/SVG (Node không import trực tiếp được).
register('data:text/javascript,' + encodeURIComponent(`
  export async function load(url, context, nextLoad) {
    if (url.endsWith('.css') || url.endsWith('.svg')) return { format: 'module', shortCircuit: true, source: '' };
    return nextLoad(url, context);
  }
`))

// Cùng mock với test-mochi-roadmap.mjs: theme.js chạy ở cấp module trước khi import view.
const storage = new Map()
globalThis.localStorage = {
  getItem: key => storage.get(key) ?? null,
  setItem: (key, value) => storage.set(key, String(value)),
  removeItem: key => storage.delete(key)
}

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
  location: { hash: '#trial', search: '' },
  addEventListener() {},
  dispatchEvent() {},
  matchMedia: () => ({ matches: false, addEventListener() {} })
}

const { MOCHI_TRIAL_SCREENS, resolveMochiTrialScreen, renderMochiTrialView } =
  await import('../src/js/views/mochi/trial.js')
const { getEmbedUrl, formatDuration, computeTrialHistoryStats, theoryFileDisplayName } =
  await import('../src/js/utils/trial-helpers.js')

const lessonOne = {
  id: 'l1',
  title: 'Bài 1: Hàm số',
  content: 'Nội dung bài giảng',
  videoUrl: 'https://www.youtube.com/watch?v=dQw4w9WgXcQ',
  theoryFiles: ['1700_ten-file.pdf'],
  orderIndex: 1,
  homeworks: [{ id: 'h1', title: 'Bài tập 1', durationMinutes: 30, maxScore: 10 }]
}
const lessonTwo = {
  id: 'l2',
  title: 'Bài 2: Đạo hàm',
  videoUrl: '',
  theoryFiles: [],
  orderIndex: 2,
  homeworks: []
}
const classOne = { id: 'c1', name: 'Lớp Toán 12', totalHomeworks: 1, lessons: [lessonOne, lessonTwo] }
const classes = [classOne]

const historyList = [
  {
    submissionId: 's1',
    homeworkId: 'h1',
    homeworkTitle: 'Bài tập 1',
    lessonTitle: 'Bài 1: Hàm số',
    score: 8,
    maxScore: 10,
    isPassed: true,
    correctCount: 8,
    wrongCount: 2,
    durationSecondsTaken: 125,
    submittedAt: '2026-01-02T10:00:00Z',
    source: 'server'
  },
  {
    submissionId: 's2',
    homeworkId: 'h1',
    homeworkTitle: 'Bài tập 2',
    lessonTitle: '',
    score: 6,
    maxScore: 10,
    isPassed: false,
    correctCount: 6,
    wrongCount: 4,
    durationSecondsTaken: 45,
    submittedAt: '2026-01-01T10:00:00Z',
    source: 'local'
  }
]

function renderScreen(screen, extra = {}) {
  return renderMochiTrialView({
    screen,
    classes,
    selectedClass: classOne,
    classLessons: classOne.lessons,
    activeLesson: lessonOne,
    historyList,
    savedPhone: '0912345678',
    ...extra
  })
}

// 1. Chọn màn hình -----------------------------------------------------------

test('resolveMochiTrialScreen: history luôn thắng, kể cả đang loading hoặc revoked', () => {
  assert.equal(resolveMochiTrialScreen({ activeTab: 'history' }), 'history')
  assert.equal(resolveMochiTrialScreen({ activeTab: 'history', loading: true }), 'history')
  assert.equal(resolveMochiTrialScreen({ activeTab: 'history', revoked: true, loading: true }), 'history')
  assert.equal(
    resolveMochiTrialScreen({ activeTab: 'history', selectedClass: classOne, activeLesson: lessonOne }),
    'history'
  )
})

test('resolveMochiTrialScreen: loading được ưu tiên trước revoked/lesson', () => {
  assert.equal(resolveMochiTrialScreen({ activeTab: 'lessons', loading: true }), 'loading')
  assert.equal(
    resolveMochiTrialScreen({ activeTab: 'lessons', loading: true, revoked: true, selectedClass: classOne, activeLesson: lessonOne }),
    'loading'
  )
  assert.equal(resolveMochiTrialScreen({ loading: true }), 'loading')
})

test('resolveMochiTrialScreen: revoked chỉ khi activeTab là lessons', () => {
  assert.equal(resolveMochiTrialScreen({ activeTab: 'lessons', revoked: true }), 'revoked')
  assert.equal(
    resolveMochiTrialScreen({ activeTab: 'lessons', revoked: true, selectedClass: classOne, activeLesson: lessonOne }),
    'revoked',
    'revoked phải thắng cả lesson'
  )
  assert.equal(resolveMochiTrialScreen({ activeTab: 'roadmap', revoked: true }), 'classes')
  assert.equal(
    resolveMochiTrialScreen({ activeTab: 'roadmap', revoked: true, selectedClass: classOne }),
    'class'
  )
})

test('resolveMochiTrialScreen: lesson khi có lớp + bài, class khi chỉ có lớp, còn lại classes', () => {
  assert.equal(
    resolveMochiTrialScreen({ activeTab: 'lessons', selectedClass: classOne, activeLesson: lessonOne }),
    'lesson'
  )
  assert.equal(resolveMochiTrialScreen({ activeTab: 'lessons', selectedClass: classOne }), 'class')
  assert.equal(resolveMochiTrialScreen({ activeTab: 'lessons' }), 'classes')
  assert.equal(resolveMochiTrialScreen({}), 'classes')
  assert.equal(resolveMochiTrialScreen({ activeTab: 'lessons', activeLesson: lessonOne }), 'classes')
})

// 2. Khung chung của renderMochiTrialView ------------------------------------

test('renderMochiTrialView: mọi screen có gốc .m-roadmap.m-trial, data-trial-screen và 2 tab', () => {
  assert.deepEqual(
    [...MOCHI_TRIAL_SCREENS].sort(),
    ['class', 'classes', 'history', 'lesson', 'loading', 'revoked']
  )

  for (const screen of MOCHI_TRIAL_SCREENS) {
    const html = renderScreen(screen)

    assert.match(
      html,
      /<div class="m-roadmap m-trial" data-roadmap-theme="[^"]+" data-trial-screen="[^"]+">/,
      `${screen}: thiếu gốc m-roadmap m-trial`
    )
    assert.ok(html.includes(`data-trial-screen="${screen}"`), `${screen}: data-trial-screen sai`)
    assert.ok(html.includes('id="btn-tab-trial-lessons"'), `${screen}: thiếu tab bài học thử`)
    assert.ok(html.includes('id="btn-tab-trial-history"'), `${screen}: thiếu tab lịch sử`)

    assert.match(
      html,
      /<a href="#trial\?tab=lessons"[^>]*aria-current="page"/,
      `${screen}: tab trên "Bài học thử" phải là tab đang xem`
    )

    if (screen === 'history') {
      assert.match(
        html,
        /id="btn-tab-trial-history"[^>]*aria-current="page"/,
        'history: tab lịch sử phải là tab đang xem'
      )
      assert.doesNotMatch(html, /id="btn-tab-trial-lessons"[^>]*aria-current="page"/)
    } else {
      assert.match(
        html,
        /id="btn-tab-trial-lessons"[^>]*aria-current="page"/,
        `${screen}: tab bài học thử phải active`
      )
      assert.doesNotMatch(html, /id="btn-tab-trial-history"[^>]*aria-current="page"/)
    }
  }
})

test('renderMochiTrialView: đếm lịch sử hiển thị khi historyList khác rỗng', () => {
  for (const screen of MOCHI_TRIAL_SCREENS) {
    const withHistory = renderScreen(screen)
    assert.ok(
      withHistory.includes('<span class="m-trial-subtab-count">2</span>'),
      `${screen}: phải hiện số 2 bài trong lịch sử`
    )
  }

  const empty = renderScreen('classes', { historyList: [] })
  assert.doesNotMatch(empty, /m-trial-subtab-count/, 'historyList rỗng không được hiện huy hiệu đếm')
})

// 3. Hook hợp đồng với bindTrialEvents --------------------------------------

test('hợp đồng màn classes: card chọn lớp + nút mở modal đăng ký', () => {
  const html = renderScreen('classes')

  const card = html.match(
    /<div class="m-trial-class-card select-trial-class-card"[^>]*data-id="c1"[^>]*role="button"[^>]*tabindex="0"[^>]*>/
  )
  assert.ok(card, 'card .select-trial-class-card[data-id] phải có role=button và tabindex=0')
  assert.match(card[0], /aria-label="Lớp Lớp Toán 12:/)

  assert.match(
    html,
    /class="m-trial-btn-register"\s+onclick="window\.showTrialRegistrationModal\(\)"/,
    'màn classes phải có CTA .m-trial-btn-register mở showTrialRegistrationModal'
  )
})

test('hợp đồng màn class: nút quay lại + danh sách .trial-lesson-item[data-id]', () => {
  const html = renderScreen('class')

  assert.ok(html.includes('id="back-to-trial-classes-btn"'), 'thiếu #back-to-trial-classes-btn')

  for (const lesson of classOne.lessons) {
    assert.match(
      html,
      new RegExp(`<div class="m-trial-lesson-card trial-lesson-item"[^>]*data-id="${lesson.id}"`),
      `thiếu .trial-lesson-item cho ${lesson.id}`
    )
  }
  assert.equal((html.match(/class="m-trial-lesson-card trial-lesson-item"/g) || []).length, classOne.lessons.length)
})

test('hợp đồng màn lesson: quay lại, tài liệu, iframe YouTube, bắt đầu làm bài, bài đang xem', () => {
  const html = renderScreen('lesson')

  assert.ok(html.includes('id="btn-back-to-trial-lessons"'), 'thiếu nút quay lại bài học')

  assert.match(
    html,
    /class="btn-preview-theory[^"]*"[^>]*data-file="1700_ten-file\.pdf"/,
    'thiếu .btn-preview-theory[data-file]'
  )
  assert.match(
    html,
    /class="btn-download-theory[^"]*"[^>]*data-file="1700_ten-file\.pdf"/,
    'thiếu .btn-download-theory[data-file]'
  )

  assert.match(
    html,
    /<iframe src="https:\/\/www\.youtube\.com\/embed\/dQw4w9WgXcQ"/,
    'video YouTube phải được nhúng qua /embed/'
  )
  assert.ok(
    html.includes(`onclick="window.confirmStartTrialHomework('h1')"`),
    'bài tập hợp lệ phải có nút confirmStartTrialHomework'
  )

  assert.match(
    html,
    /class="trial-lesson-item m-trial-other-item is-current" data-id="l1"[^>]*aria-current="page"/,
    'bài đang xem phải có aria-current=page'
  )
  assert.doesNotMatch(
    html,
    /class="trial-lesson-item m-trial-other-item is-current" data-id="l2"/,
    'bài khác không được đánh dấu đang xem'
  )
})

test('hợp đồng màn history: tra cứu SĐT, xóa lịch sử máy, xem lại và làm lại', () => {
  const html = renderScreen('history')

  assert.match(html, /<input type="tel" id="input-trial-phone-lookup"/, 'thiếu input SĐT type=tel')
  assert.ok(html.includes('id="btn-sync-phone-history"'), 'thiếu #btn-sync-phone-history')
  assert.ok(html.includes('id="btn-clear-local-history"'), 'có mục source local phải có nút xóa lịch sử máy')

  assert.match(html, /class="btn-view-trial-review[^"]*"[^>]*data-subid="s1"/, 'thiếu .btn-view-trial-review[data-subid]')
  assert.match(html, /class="btn-retake-trial[^"]*"[^>]*data-hwid="h1"/, 'thiếu .btn-retake-trial[data-hwid]')

  const serverOnly = renderScreen('history', { historyList: [historyList[0]] })
  assert.doesNotMatch(serverOnly, /id="btn-clear-local-history"/, 'không có mục local thì không hiện nút xóa')
})

test('hợp đồng màn revoked: có link về danh sách bài học thử', () => {
  const html = renderScreen('revoked')
  assert.ok(html.includes('href="#trial?tab=lessons"'), 'revoked phải có link #trial?tab=lessons')
  assert.ok(html.includes('đã được thu hồi'), 'revoked phải có thông điệp thu hồi')
})

// 4. Escape dữ liệu động -----------------------------------------------------

test('escape tên lớp, tiêu đề bài và tên file; id bài tập không hợp lệ không có nút bắt đầu', () => {
  const evilLesson = {
    id: 'l-evil',
    title: '"><script>alert(1)</script>',
    videoUrl: '',
    theoryFiles: ['"><b>'],
    homeworks: [{ id: "h1');alert(1);//", title: 'Bài tập xấu' }]
  }
  const evilClass = { id: 'c-evil', name: '<img src=x onerror=1>', lessons: [evilLesson] }

  const lessonHtml = renderScreen('lesson', {
    selectedClass: evilClass,
    classLessons: [evilLesson],
    activeLesson: evilLesson
  })

  assert.doesNotMatch(lessonHtml, /<img src=x/, 'không được render thô thẻ img')
  assert.doesNotMatch(lessonHtml, /<script>/, 'không được render thô thẻ script')
  assert.doesNotMatch(lessonHtml, /<b>/, 'không được render thô thẻ b')
  assert.ok(lessonHtml.includes('&lt;img src=x onerror=1&gt;'), 'tên lớp phải được escape')
  assert.ok(lessonHtml.includes('&lt;script&gt;'), 'tiêu đề bài phải được escape')
  assert.ok(lessonHtml.includes('&quot;&gt;&lt;b&gt;'), 'tên file phải được escape trong data-file')

  assert.ok(
    !lessonHtml.includes('confirmStartTrialHomework('),
    'id bài tập chứa ký tự nguy hiểm không được tạo nút confirmStartTrialHomework'
  )
  assert.ok(lessonHtml.includes('Bài tập này hiện chưa thể mở'), 'bài tập không hợp lệ phải có ghi chú thay nút')

  const classesHtml = renderScreen('classes', {
    classes: [evilClass],
    selectedClass: null,
    classLessons: [],
    activeLesson: null
  })
  assert.doesNotMatch(classesHtml, /<img src=x/, 'card lớp không được render thô thẻ img')
  assert.ok(classesHtml.includes('&lt;img src=x onerror=1&gt;'), 'tên lớp trên card phải được escape')
})

// 5. Trạng thái rỗng ---------------------------------------------------------

test('trạng thái rỗng: không có lớp, không có lịch sử, bài không video', () => {
  const emptyClasses = renderScreen('classes', {
    classes: [],
    selectedClass: null,
    classLessons: [],
    activeLesson: null
  })
  assert.ok(emptyClasses.includes('m-trial-empty-card'), 'classes rỗng phải có trạng thái rỗng')
  assert.ok(emptyClasses.includes('Hiện tại chưa có lớp học thử nào'), 'classes rỗng phải có thông điệp')
  assert.match(emptyClasses, /m-trial-empty-card" role="status"/)

  const emptyHistory = renderScreen('history', { historyList: [] })
  assert.ok(emptyHistory.includes('href="#trial?tab=lessons"'), 'history rỗng phải có link về danh sách học thử')
  assert.ok(emptyHistory.includes('Bạn chưa làm bài tập thử nào'), 'history rỗng phải có thông điệp')
  assert.doesNotMatch(emptyHistory, /id="btn-clear-local-history"/)

  const emptyClass = renderScreen('class', { classLessons: [] })
  assert.ok(emptyClass.includes('Lớp này chưa có bài học thử nào.'), 'lớp rỗng phải có thông điệp')

  const noVideo = renderScreen('lesson', {
    activeLesson: { ...lessonOne, videoUrl: '' }
  })
  assert.doesNotMatch(noVideo, /<iframe/, 'bài không video không được có iframe')
  assert.ok(noVideo.includes('Bài học này chưa có video bài giảng.'), 'bài không video phải có thông điệp')
})

// 6. trial-helpers -----------------------------------------------------------

test('getEmbedUrl: YouTube watch/youtu.be, Google Drive và link khác', () => {
  assert.equal(
    getEmbedUrl('https://www.youtube.com/watch?v=dQw4w9WgXcQ'),
    'https://www.youtube.com/embed/dQw4w9WgXcQ'
  )
  assert.equal(getEmbedUrl('https://youtu.be/dQw4w9WgXcQ?t=10'), 'https://www.youtube.com/embed/dQw4w9WgXcQ')
  assert.equal(
    getEmbedUrl('https://drive.google.com/file/d/abc_123-XYZ/view?usp=sharing'),
    'https://drive.google.com/file/d/abc_123-XYZ/preview'
  )
  assert.equal(getEmbedUrl('https://example.com/video.mp4'), 'https://example.com/video.mp4')
  assert.equal(getEmbedUrl(''), null)
  assert.equal(getEmbedUrl(null), null)
})

test('formatDuration: giây và phút giây', () => {
  assert.equal(formatDuration(45), '45 giây')
  assert.equal(formatDuration(125), '2 phút 5s')
  assert.equal(formatDuration(60), '1 phút 0s')
  assert.equal(formatDuration(0), '0 giây')
})

test('computeTrialHistoryStats: điểm trung bình làm tròn 1 chữ số, tỷ lệ đạt theo %', () => {
  const stats = computeTrialHistoryStats([
    { score: 7, isPassed: true },
    { score: 8, isPassed: true },
    { score: 8, isPassed: false }
  ])
  assert.equal(stats.totalDone, 3)
  assert.equal(stats.avgScore, 7.7, '23/3 = 7.666… phải làm tròn 7.7')
  assert.equal(stats.highestScore, 8)
  assert.equal(stats.passCount, 2)
  assert.equal(stats.passRate, 67, '2/3 phải là 67%')

  assert.deepEqual(computeTrialHistoryStats([]), {
    totalDone: 0,
    avgScore: 0,
    highestScore: 0,
    passCount: 0,
    passRate: 0
  })
})

test('theoryFileDisplayName: bỏ tiền tố số thứ tự và lấy phần cuối của URL', () => {
  assert.equal(theoryFileDisplayName('1700_ten-file.pdf'), 'ten-file.pdf')
  assert.equal(theoryFileDisplayName('https://example.com/files/1700_ten-file.pdf'), 'ten-file.pdf')
  assert.equal(theoryFileDisplayName('https://example.com/files/ten-file.pdf'), 'ten-file.pdf')
  assert.equal(theoryFileDisplayName('ten-file.pdf'), 'ten-file.pdf')
})

// 7. CSS ---------------------------------------------------------------------

const cssFiles = ['trial-shell.css', 'trial-browse.css', 'trial-detail.css']

function readCss(name) {
  return readFileSync(new URL(`../src/css/mochi/${name}`, import.meta.url), 'utf8')
}

function collectCssSelectors(css) {
  const source = css.replace(/\/\*[\s\S]*?\*\//g, '')
  const selectors = []
  const stack = []
  let prelude = ''

  for (const ch of source) {
    if (ch === '{') {
      const head = prelude.trim()
      prelude = ''
      const inKeyframes = stack.some(ctx => ctx.keyframes)
      if (head.startsWith('@')) {
        stack.push({ atRule: true, keyframes: /keyframes/i.test(head) })
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

  return selectors
}

test('CSS học thử: mọi selector ngoài @keyframes đều scope dưới .m-roadmap.m-trial', () => {
  for (const file of cssFiles) {
    const selectors = collectCssSelectors(readCss(file))
    assert.ok(selectors.length > 0, `${file}: phải tìm thấy selector`)

    for (const group of selectors) {
      for (const selector of group.split(',').map(value => value.trim()).filter(Boolean)) {
        assert.match(
          selector,
          /^\.m-roadmap\.m-trial/,
          `${file}: selector chưa scope .m-roadmap.m-trial: ${selector}`
        )
      }
    }
  }
})

test('CSS học thử: không có mã màu hex/rgb/hsl và không khai báo token', () => {
  for (const file of cssFiles) {
    const css = readCss(file).replace(/\/\*[\s\S]*?\*\//g, '')

    assert.doesNotMatch(css, /#[0-9a-fA-F]{3,8}\b/, `${file}: không được có mã màu hex`)
    assert.doesNotMatch(css, /\b(?:rgba?|hsla?)\(/, `${file}: không được có mã màu rgb/hsl`)
    assert.doesNotMatch(css, /:root\s*\{/, `${file}: không được có khối token :root`)
  }
})
