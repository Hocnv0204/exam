import test from 'node:test'
import assert from 'node:assert/strict'
import { register } from 'node:module'

// Intercept .css, .svg trong Node environment
register('data:text/javascript,' + encodeURIComponent(`
  import { readFileSync } from 'node:fs';
  import { fileURLToPath } from 'node:url';

  export async function load(url, context, nextLoad) {
    if (url.endsWith('.css')) {
      return { format: 'module', shortCircuit: true, source: '' };
    }
    if (url.endsWith('.svg')) {
      return { format: 'module', shortCircuit: true, source: 'export default "test-mascot.svg";' };
    }
    if (url.includes('exam-room.js') || url.includes('homework-solver.js') || url.includes('my-homeworks.js')) {
      const filePath = fileURLToPath(url);
      const code = readFileSync(filePath, 'utf8')
        .replace(/import\\.meta\\.env\\.VITE_SUPABASE_URL/g, '""');
      return { format: 'module', shortCircuit: true, source: code };
    }
    return nextLoad(url, context);
  }
`))

const saved = new Map()
const storage = {
  getItem: key => saved.get(key) ?? null,
  setItem: (key, value) => saved.set(key, String(value)),
  removeItem: key => saved.delete(key),
  clear: () => saved.clear()
}

globalThis.localStorage = storage
globalThis.sessionStorage = storage
globalThis.CustomEvent = class {
  constructor(type, options = {}) { this.type = type; this.detail = options.detail }
}

globalThis.document = {
  documentElement: { dataset: {}, style: {}, getAttribute: () => null },
  body: { classList: { add: () => {}, remove: () => {} }, appendChild: el => el },
  createElement: tag => ({ tagName: tag.toUpperCase(), id: '', innerHTML: '', style: {}, dataset: {}, classList: { add: () => {}, remove: () => {} }, appendChild: () => {}, addEventListener: () => {} }),
  addEventListener: () => {},
  dispatchEvent: () => {},
  querySelectorAll: () => [],
  getElementById: () => null,
  querySelector: () => null,
  visibilityState: 'visible'
}

globalThis.window = {
  location: { hash: '', search: '', reload: () => {} },
  addEventListener: () => {},
  removeEventListener: () => {},
  matchMedia: () => ({ matches: false }),
  confirmStartHomework: () => {}
}

const { state } = await import('../src/js/state.js')
const { api } = await import('../src/js/api.js')
const {
  isValidUuid,
  escapeHtml,
  formatNoticeTime,
  renderExamNoticeCard,
  mountStudentExamNotice
} = await import('../src/js/components/student-exam-notice.js')
const { shouldPollAttemptRequest } = await import('../src/js/views/exam-room.js')
const { hwCard } = await import('../src/js/views/my-homeworks.js')

function createMockContainer() {
  const container = {
    tagName: 'DIV',
    id: 'student-exam-notice',
    dataset: {},
    isConnected: true,
    _rawHtml: '',
    _cards: [],
    get innerHTML() {
      return this._rawHtml
    },
    set innerHTML(html) {
      this._rawHtml = String(html || '')
      parseCards(this, this._rawHtml)
    },
    querySelectorAll(selector) {
      if (selector === '.student-exam-notice-card') {
        return this._cards.filter(c => c.isConnected)
      }
      return []
    },
    querySelector(selector) {
      if (selector === '.student-exam-notice-card') {
        return this._cards.find(c => c.isConnected) || null
      }
      return null
    }
  }
  return container
}

function parseCards(container, html) {
  const cards = []
  const cardRegex = /<div class="([^"]*student-exam-notice-card[^"]*)"\s+data-id="([^"]+)"\s+data-type="([^"]+)"([\s\S]*?)<\/div>\s*(?=<div class="[^"]*student-exam-notice-card|<div class="[^"]*student-exam-notice-more|<\/div>|$)/g
  let match
  while ((match = cardRegex.exec(html)) !== null) {
    const [_, cls, id, type, content] = match
    const card = {
      tagName: 'DIV',
      className: cls,
      dataset: { id, type },
      innerHTML: content,
      parentNode: container,
      isConnected: true,
      remove() {
        this.isConnected = false
      },
      querySelector(sel) {
        if (sel === '[data-action="enter"]') return this.enterBtn
        if (sel === '[data-action="ack"]') return this.ackBtn
        return null
      }
    }

    const enterMatch = content.match(/<button[^>]*data-action="enter"[^>]*data-id="([^"]+)"[^>]*data-related-id="([^"]+)"[^>]*>/)
    if (enterMatch) {
      card.enterBtn = {
        tagName: 'BUTTON',
        dataset: { action: 'enter', id: enterMatch[1], relatedId: enterMatch[2] },
        disabled: false,
        onclick: null
      }
    } else {
      card.enterBtn = null
    }

    const ackMatch = content.match(/<button[^>]*data-action="ack"[^>]*data-id="([^"]+)"[^>]*>/)
    if (ackMatch) {
      card.ackBtn = {
        tagName: 'BUTTON',
        dataset: { action: 'ack', id: ackMatch[1] },
        disabled: false,
        onclick: null
      }
    } else {
      card.ackBtn = null
    }

    cards.push(card)
  }
  container._cards = cards
}

// -----------------------------------------------------------------------------
// TESTS
// -----------------------------------------------------------------------------

test('isValidUuid xác thực đúng UUID v4/v1 và từ chối các chuỗi không hợp lệ', () => {
  assert.equal(isValidUuid('a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11'), true)
  assert.equal(isValidUuid('123e4567-e89b-12d3-a456-426614174000'), true)
  assert.equal(isValidUuid('99836a16-4775-49e9-90ab-9505cb052099'), true)

  // Không phải UUID
  assert.equal(isValidUuid('hw-1'), false)
  assert.equal(isValidUuid('not-a-uuid'), false)
  assert.equal(isValidUuid(''), false)
  assert.equal(isValidUuid('   '), false)
  assert.equal(isValidUuid(null), false)
  assert.equal(isValidUuid(undefined), false)
  assert.equal(isValidUuid(12345), false)
  assert.equal(isValidUuid({}), false)
})

test('escapeHtml escape an toàn ký tự đặc biệt XSS', () => {
  const xss = '<script>alert("xss")</script>&"\''
  const escaped = escapeHtml(xss)
  assert.equal(escaped, '&lt;script&gt;alert(&quot;xss&quot;)&lt;/script&gt;&amp;&quot;&#039;')
  assert.equal(escapeHtml(''), '')
  assert.equal(escapeHtml(null), '')
  assert.equal(escapeHtml(undefined), '')
})

test('formatNoticeTime hiển thị thời gian theo định dạng vi-VN', () => {
  const formatted = formatNoticeTime('2026-11-14T08:30:00Z')
  assert.ok(formatted.includes('14/11/2026') || formatted.includes('15:30'))
  assert.equal(formatNoticeTime(''), '')
  assert.equal(formatNoticeTime('invalid-date'), '')
  assert.equal(formatNoticeTime(null), '')
})

test('renderExamNoticeCard: thông báo APPROVED với relatedId là UUID hợp lệ có nút Vào thi ngay và Đã hiểu', () => {
  const item = {
    id: 'f81d4fae-7dec-11d0-a765-00a0c91e6bf6',
    title: 'Đã được cấp thêm lượt thi',
    content: 'Giáo viên đã cấp thêm 1 lượt cho bài thi "Kiểm tra 15 phút".',
    type: 'EXAM_ATTEMPT_APPROVED',
    relatedId: 'a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11',
    createdAt: '2026-11-14T08:30:00Z'
  }

  const html = renderExamNoticeCard(item, false)
  assert.match(html, /Đã được cấp thêm lượt thi/)
  assert.match(html, /Giáo viên đã cấp thêm 1 lượt cho bài thi &quot;Kiểm tra 15 phút&quot;\./)
  assert.match(html, /data-action="enter"/)
  assert.match(html, /Vào thi ngay/)
  assert.match(html, /data-action="ack"/)
  assert.match(html, /Đã hiểu/)
  assert.match(html, /min-height:\s*44px/)
})

test('renderExamNoticeCard: relatedId không phải UUID → KHÔNG có nút Vào thi ngay, chỉ có Đã hiểu', () => {
  const item = {
    id: 'f81d4fae-7dec-11d0-a765-00a0c91e6bf6',
    title: 'Đã được cấp thêm lượt thi',
    content: 'Bài thi không xác định.',
    type: 'EXAM_ATTEMPT_APPROVED',
    relatedId: 'hw-invalid-id',
    createdAt: '2026-11-14T08:30:00Z'
  }

  const html = renderExamNoticeCard(item, false)
  assert.match(html, /Đã được cấp thêm lượt thi/)
  assert.doesNotMatch(html, /data-action="enter"/, 'relatedId không phải UUID thì không có nút Vào thi ngay')
  assert.doesNotMatch(html, /Vào thi ngay/)
  assert.match(html, /data-action="ack"/)
  assert.match(html, /Đã hiểu/)
})

test('renderExamNoticeCard: thông báo REJECTED → KHÔNG có nút Vào thi ngay, chỉ có Đã hiểu', () => {
  const item = {
    id: 'f81d4fae-7dec-11d0-a765-00a0c91e6bf7',
    title: 'Yêu cầu thêm lượt thi bị từ chối',
    content: 'Giáo viên đã từ chối yêu cầu của bạn.',
    type: 'EXAM_ATTEMPT_REJECTED',
    relatedId: 'a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11',
    createdAt: '2026-11-14T08:35:00Z'
  }

  const html = renderExamNoticeCard(item, false)
  assert.match(html, /Yêu cầu thêm lượt thi bị từ chối/)
  assert.match(html, /Giáo viên đã từ chối yêu cầu của bạn\./)
  assert.doesNotMatch(html, /data-action="enter"/)
  assert.doesNotMatch(html, /Vào thi ngay/)
  assert.match(html, /data-action="ack"/)
  assert.match(html, /Đã hiểu/)
})

test('renderExamNoticeCard: escape an toàn dữ liệu đầu vào chống XSS', () => {
  const xssItem = {
    id: 'f81d4fae-7dec-11d0-a765-00a0c91e6bf8',
    title: '<script>alert("title-xss")</script>',
    content: '<img src=x onerror=alert(1)> & malicious string',
    type: 'EXAM_ATTEMPT_APPROVED',
    relatedId: 'a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11',
    createdAt: '2026-11-14T08:30:00Z'
  }

  const html = renderExamNoticeCard(xssItem, false)
  assert.doesNotMatch(html, /<script>/)
  assert.doesNotMatch(html, /<img src=x/)
  assert.match(html, /&lt;script&gt;/)
  assert.match(html, /&lt;img src=x onerror=alert\(1\)&gt;/)
})

test('mountStudentExamNotice: render banner, bấm Vào thi ngay đánh dấu đã đọc và chuyển route', async () => {
  const container = createMockContainer()
  const hwUuid = 'a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11'
  const notifId = '11111111-2222-3333-4444-555555555555'

  let markCalledWith = null
  api.getStudentNotifications = async ({ unreadOnly, limit }) => {
    assert.equal(unreadOnly, true)
    return {
      items: [
        {
          id: notifId,
          title: 'Đã được cấp thêm lượt thi',
          content: 'Thầy đã cấp thêm 1 lượt.',
          type: 'EXAM_ATTEMPT_APPROVED',
          relatedId: hwUuid,
          createdAt: '2026-11-14T09:00:00Z'
        }
      ]
    }
  }
  api.markNotificationsRead = async (ids) => {
    markCalledWith = ids
    return { updated: 1 }
  }

  await mountStudentExamNotice(container)

  assert.match(container.innerHTML, /student-exam-notice-banner/)
  assert.match(container.innerHTML, /role="status"/)
  assert.match(container.innerHTML, /aria-live="polite"/)
  assert.match(container.innerHTML, /Vào thi ngay/)

  const card = container.querySelector('.student-exam-notice-card')
  assert.ok(card)
  const enterBtn = card.querySelector('[data-action="enter"]')
  assert.ok(enterBtn)

  // Bấm nút Vào thi ngay
  window.location.hash = ''
  await enterBtn.onclick()

  assert.deepEqual(markCalledWith, [notifId])
  assert.equal(window.location.hash, `#exam-room?homeworkId=${hwUuid}`)
})

test('mountStudentExamNotice: bấm Đã hiểu đánh dấu đã đọc và ẩn/xoá thẻ', async () => {
  const container = createMockContainer()
  const notifId = '22222222-3333-4444-5555-666666666666'

  let markCalledWith = null
  api.getStudentNotifications = async () => ({
    items: [
      {
        id: notifId,
        title: 'Yêu cầu thêm lượt thi bị từ chối',
        content: 'Yêu cầu đã bị từ chối.',
        type: 'EXAM_ATTEMPT_REJECTED',
        relatedId: 'a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11',
        createdAt: '2026-11-14T09:00:00Z'
      }
    ]
  })
  api.markNotificationsRead = async (ids) => {
    markCalledWith = ids
    return { updated: 1 }
  }

  await mountStudentExamNotice(container)

  const card = container.querySelector('.student-exam-notice-card')
  assert.ok(card)
  const ackBtn = card.querySelector('[data-action="ack"]')
  assert.ok(ackBtn)

  // Bấm Đã hiểu
  await ackBtn.onclick()

  assert.deepEqual(markCalledWith, [notifId])
  assert.equal(card.isConnected, false, 'Thẻ phải được xoá khỏi DOM')
  assert.equal(container.innerHTML, '', 'Khi hết thẻ thì container phải được làm sạch')
})

test('mountStudentExamNotice: tối đa 3 thẻ, phần dư gộp "và N thông báo khác"', async () => {
  const container = createMockContainer()

  api.getStudentNotifications = async () => ({
    items: [1, 2, 3, 4, 5].map(i => ({
      id: `00000000-0000-0000-0000-00000000000${i}`,
      title: `Thông báo ${i}`,
      content: `Nội dung ${i}`,
      type: 'EXAM_ATTEMPT_APPROVED',
      relatedId: 'a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11',
      createdAt: '2026-11-14T09:00:00Z'
    }))
  })

  await mountStudentExamNotice(container)

  const cards = container.querySelectorAll('.student-exam-notice-card')
  assert.equal(cards.length, 3, 'Chỉ hiển thị tối đa 3 thẻ')
  assert.match(container.innerHTML, /và 2 thông báo khác/)
})

test('mountStudentExamNotice: lỗi API hoặc rỗng → không hiển thị gì (không crash)', async () => {
  const container = createMockContainer()

  // 1. Lỗi API
  api.getStudentNotifications = async () => {
    throw new Error('Network error 500')
  }
  await mountStudentExamNotice(container)
  assert.equal(container.innerHTML, '', 'Lỗi mạng không làm hỏng trang và không render gì')

  // 2. Danh sách rỗng
  api.getStudentNotifications = async () => ({ items: [] })
  await mountStudentExamNotice(container)
  assert.equal(container.innerHTML, '', 'Danh sách rỗng không render gì')

  // 3. Thông báo loại khác (không phải EXAM_ATTEMPT_*)
  api.getStudentNotifications = async () => ({
    items: [
      { id: '1', title: 'Học phí', content: 'Đóng tiền', type: 'TUITION_REMINDER' }
    ]
  })
  await mountStudentExamNotice(container)
  assert.equal(container.innerHTML, '', 'Loại khác bị lọc bỏ')
})

test('shouldPollAttemptRequest hàm thuần kiểm tra điều kiện polling chuẩn xác', () => {
  // PENDING và visible -> poll
  assert.equal(shouldPollAttemptRequest({ status: 'PENDING' }, 'visible'), true)

  // Tab bị ẩn -> không poll
  assert.equal(shouldPollAttemptRequest({ status: 'PENDING' }, 'hidden'), false)
  assert.equal(shouldPollAttemptRequest({ status: 'PENDING' }, 'prerender'), false)

  // Trạng thái đã APPROVED / REJECTED -> không poll
  assert.equal(shouldPollAttemptRequest({ status: 'APPROVED' }, 'visible'), false)
  assert.equal(shouldPollAttemptRequest({ status: 'REJECTED' }, 'visible'), false)

  // Chưa có yêu cầu hoặc rỗng -> không poll
  assert.equal(shouldPollAttemptRequest(null, 'visible'), false)
  assert.equal(shouldPollAttemptRequest({}, 'visible'), false)
  assert.equal(shouldPollAttemptRequest({ status: null }, 'visible'), false)
})

test('views/my-homeworks.js: item.extraAttemptGranted === true hiển thị nhãn Được cấp thêm lượt và nút Vào thi', () => {
  saved.set('eduportal-ui', 'classic')

  // 1. Bài EXAM đã nộp và được cấp thêm lượt
  const examGranted = {
    id: 'hw-exam-1',
    type: 'EXAM',
    title: 'Đề thi giữa kỳ 1',
    done: true,
    score: 8,
    maxScore: 10,
    extraAttemptGranted: true
  }

  const htmlGranted = hwCard(examGranted)
  assert.match(htmlGranted, /Được cấp thêm lượt/, 'Classic: phải hiện chip "Được cấp thêm lượt"')
  assert.match(htmlGranted, />\s*Vào thi\s*<\/button>/, 'Classic: nút hành động phải là "Vào thi"')
  assert.doesNotMatch(htmlGranted, /Làm lại/, 'Không còn nút "Làm lại"')

  // 2. Bài EXAM đã nộp nhưng KHÔNG được cấp thêm lượt (hoặc undefined)
  const examNotGranted = {
    id: 'hw-exam-2',
    type: 'EXAM',
    title: 'Đề thi học kỳ 1',
    done: true,
    score: 7,
    maxScore: 10,
    extraAttemptGranted: false
  }

  const htmlNotGranted = hwCard(examNotGranted)
  assert.doesNotMatch(htmlNotGranted, /Được cấp thêm lượt/)
  assert.match(htmlNotGranted, /Làm lại/)
  assert.doesNotMatch(htmlNotGranted, />\s*Vào thi\s*<\/button>/)

  // 3. Bài PRACTICE có extraAttemptGranted: true -> KHÔNG đổi gì (chỉ áp dụng EXAM)
  const practiceItem = {
    id: 'hw-prac-1',
    type: 'PRACTICE',
    title: 'Luyện tập phương trình',
    done: true,
    score: 10,
    maxScore: 10,
    extraAttemptGranted: true
  }

  const htmlPractice = hwCard(practiceItem)
  assert.doesNotMatch(htmlPractice, /Được cấp thêm lượt/, 'PRACTICE không hiện nhãn Được cấp thêm lượt')
  assert.match(htmlPractice, /Làm lại/)

  // 4. Kiểm tra trên giao diện Mochi
  saved.set('eduportal-ui', 'mochi')
  state.token = 'student-token'
  state.user = { id: 's1', role: 'STUDENT' }

  const mochiGranted = hwCard(examGranted)
  assert.match(mochiGranted, /Được cấp thêm lượt/, 'Mochi: phải hiện chip "Được cấp thêm lượt"')
  assert.match(mochiGranted, />\s*Vào thi\s*<\/button>/, 'Mochi: nút hành động phải là "Vào thi"')

  const mochiNotGranted = hwCard(examNotGranted)
  assert.doesNotMatch(mochiNotGranted, /Được cấp thêm lượt/)
  assert.match(mochiNotGranted, /Làm lại/)
})
