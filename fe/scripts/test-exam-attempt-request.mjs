import test from 'node:test'
import assert from 'node:assert/strict'
import { register } from 'node:module'

// Intercept .css, .svg và mock import.meta.env trong Node environment
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
    if (url.includes('exam-room.js') || url.includes('homework-solver.js')) {
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

let modalContainer = null
let openedModalInfo = null

globalThis.document = {
  documentElement: { dataset: {}, style: {} },
  body: {
    classList: { add: () => {}, remove: () => {} },
    appendChild: (el) => {
      if (el.id === 'modal-container') modalContainer = el
      return el
    }
  },
  createElement: (tag) => {
    const el = {
      tagName: tag.toUpperCase(),
      id: '',
      innerHTML: '',
      style: {},
      dataset: {},
      classList: { add: () => {}, remove: () => {} },
      appendChild: () => {},
      addEventListener: () => {}
    }
    return el
  },
  addEventListener: () => {},
  dispatchEvent: () => {},
  querySelectorAll: () => [],
  getElementById: (id) => {
    if (id === 'modal-container') return modalContainer
    return null
  },
  querySelector: () => null
}

globalThis.window = {
  location: { hash: '#exam-room', search: '', reload: () => {} },
  addEventListener: () => {},
  matchMedia: () => ({ matches: false })
}

const { state } = await import('../src/js/state.js')
const {
  renderExamRoomView,
  renderClassicExamRoomView,
  renderMochiExamRoomView,
  renderAttemptRequestState,
  attemptRequestErrorMessage,
  isExamAttemptExceeded,
  formatAttemptTime,
  showAttemptLimitModal,
  bindExamRoomEvents
} = await import('../src/js/views/exam-room.js')

function useStudent() {
  state.token = 'test-student-token'
  state.user = { id: 'student-1', role: 'STUDENT', fullName: 'Lê Minh Anh', username: 'minhanh' }
  state.classes = [{ id: 'class-1', name: 'Lớp 12A1' }]
}

function setMochi(enabled) {
  if (enabled) saved.set('eduportal-ui', 'mochi')
  else saved.set('eduportal-ui', 'classic')
  window.location.search = ''
}

test('attemptRequestErrorMessage map mã lỗi sang tiếng Việt và tuyệt đối không trả mã thô', () => {
  const codes = ['NOT_AT_LIMIT', 'REQUEST_PENDING', 'REQUEST_DAILY_LIMIT', 'FORBIDDEN', 'INVALID_EXAM']

  assert.equal(
    attemptRequestErrorMessage('NOT_AT_LIMIT'),
    'Bạn vẫn còn lượt làm bài, hãy tải lại trang.'
  )
  assert.equal(
    attemptRequestErrorMessage('REQUEST_DAILY_LIMIT'),
    'Bạn đã gửi tối đa 3 yêu cầu hôm nay.'
  )

  for (const code of codes) {
    const msgFromString = attemptRequestErrorMessage(code)
    assert.doesNotMatch(msgFromString, new RegExp(code), `Mã ${code} không được xuất hiện trong thông báo`)
    assert.ok(msgFromString.length > 5, `Thông báo lỗi cho ${code} phải có nội dung tiếng Việt`)

    const msgFromError = attemptRequestErrorMessage(new Error(code))
    assert.doesNotMatch(msgFromError, new RegExp(code), `Error(${code}) không được trả mã thô`)
  }

  // Lỗi lạ / không xác định
  assert.equal(attemptRequestErrorMessage('INTERNAL_SERVER_ERROR'), 'Không gửi được yêu cầu, vui lòng thử lại.')
  assert.equal(attemptRequestErrorMessage(new Error('HTTP 500')), 'Không gửi được yêu cầu, vui lòng thử lại.')
  assert.equal(attemptRequestErrorMessage(null), 'Không gửi được yêu cầu, vui lòng thử lại.')
})

test('formatAttemptTime định dạng đúng HH:mm dd/MM theo múi giờ Việt Nam', () => {
  // 2026-11-13T09:30:00Z UTC -> 16:30 13/11 giờ VN (UTC+7)
  const formatted = formatAttemptTime('2026-11-13T09:30:00.000Z')
  assert.equal(formatted, '16:30 13/11')

  assert.equal(formatAttemptTime(''), '')
  assert.equal(formatAttemptTime('invalid-date'), '')
  assert.equal(formatAttemptTime(null), '')
})

test('renderAttemptRequestState trạng thái null / chưa gửi: hiển thị mô tả + nút Yêu cầu (không bị khóa)', () => {
  const htmlNull = renderAttemptRequestState(null)
  assert.match(htmlNull, /Nếu cần làm lại, hãy gửi yêu cầu để được giáo viên cấp thêm lượt thi/)
  assert.match(htmlNull, /Yêu cầu thêm lượt thi/)
  assert.match(htmlNull, /id="btn-request-attempt"/)
  assert.doesNotMatch(htmlNull, /disabled/)
  assert.doesNotMatch(htmlNull, /aria-disabled="true"/)

  const htmlEmpty = renderAttemptRequestState({ latest: null })
  assert.match(htmlEmpty, /Yêu cầu thêm lượt thi/)
  assert.doesNotMatch(htmlEmpty, /disabled/)
})

test('renderAttemptRequestState trạng thái PENDING: hiển thị đang chờ duyệt + thời gian + khóa/ẩn nút', () => {
  const htmlPending = renderAttemptRequestState({
    status: 'PENDING',
    requestedAt: '2026-11-13T09:30:00.000Z',
    notified: true
  })

  assert.match(htmlPending, /Đã gửi yêu cầu lúc 16:30 13\/11/)
  assert.match(htmlPending, /Đang chờ giáo viên duyệt/)
  // Nút yêu cầu bị khóa/ẩn
  assert.match(htmlPending, /disabled/)
  assert.match(htmlPending, /aria-disabled="true"/)
  assert.match(htmlPending, /display:\s*none/)
  // notified = true nên không có cảnh báo hệ thống thông báo
  assert.doesNotMatch(htmlPending, /Hệ thống chưa gửi được thông báo/)
})

test('renderAttemptRequestState trạng thái PENDING với notified === false: thêm ghi chú thông báo', () => {
  const htmlNotifiedFalse = renderAttemptRequestState({
    status: 'PENDING',
    requestedAt: '2026-11-13T09:30:00.000Z',
    notified: false
  })

  assert.match(htmlNotifiedFalse, /Đang chờ giáo viên duyệt/)
  assert.match(htmlNotifiedFalse, /Hệ thống chưa gửi được thông báo, giáo viên sẽ thấy yêu cầu khi kiểm tra/)
})

test('renderAttemptRequestState trạng thái REJECTED (còn lượt gửi): hiển thị bị từ chối + số lần còn lại + nút mở', () => {
  const htmlRejectedRem2 = renderAttemptRequestState({
    status: 'REJECTED',
    remainingToday: 2
  })

  assert.match(htmlRejectedRem2, /Yêu cầu gần nhất đã bị từ chối/)
  assert.match(htmlRejectedRem2, /Còn 2 lần gửi hôm nay/)
  assert.match(htmlRejectedRem2, /Yêu cầu thêm lượt thi/)
  // Nút mở để gửi tiếp
  assert.doesNotMatch(htmlRejectedRem2, /disabled/)
  assert.doesNotMatch(htmlRejectedRem2, /aria-disabled="true"/)
})

test('renderAttemptRequestState trạng thái REJECTED (hết lượt gửi 0/3): hiển thị tối đa 3 lần + nút bị khóa', () => {
  const htmlRejectedRem0 = renderAttemptRequestState({
    status: 'REJECTED',
    remainingToday: 0
  })

  assert.match(htmlRejectedRem0, /Yêu cầu gần nhất đã bị từ chối/)
  assert.match(htmlRejectedRem0, /Bạn đã gửi tối đa 3 yêu cầu hôm nay/)
  // Nút bị khóa
  assert.match(htmlRejectedRem0, /disabled/)
  assert.match(htmlRejectedRem0, /aria-disabled="true"/)
})

test('renderAttemptRequestState trạng thái APPROVED: hiển thị đã cấp + nút Vào thi', () => {
  const htmlApproved = renderAttemptRequestState({
    status: 'APPROVED',
    decidedAt: '2026-11-13T10:00:00.000Z'
  })

  assert.match(htmlApproved, /Giáo viên đã cấp thêm lượt thi/)
  assert.match(htmlApproved, /Vào thi/)
  assert.doesNotMatch(htmlApproved, /disabled/)
})

test('renderAttemptRequestState trạng thái loading: hiển thị Đang kiểm tra yêu cầu… + nút bị khóa', () => {
  const htmlLoading = renderAttemptRequestState({ loading: true })
  assert.match(htmlLoading, /Đang kiểm tra yêu cầu…/)
  assert.match(htmlLoading, /disabled/)
  assert.match(htmlLoading, /aria-busy="true"/)
})

test('renderAttemptRequestState escape an toàn dữ liệu động, ngăn chặn XSS', () => {
  const xssError = '<script>alert("xss")</script>'
  const xssTitle = '<img src=x onerror=alert(1)>'
  const html = renderAttemptRequestState(
    { status: 'PENDING', requestedAt: '2026-11-13T09:30:00.000Z' },
    { error: xssError, hwTitle: xssTitle }
  )

  assert.doesNotMatch(html, /<script>/, 'Không được render thẻ script thô')
  assert.doesNotMatch(html, /<img src=x/, 'Không được render thẻ img XSS thô')
  assert.match(html, /&lt;script&gt;/, 'Phải escape <script> thành &lt;script&gt;')
})

test('effectiveMaxAttempts ưu tiên hơn công thức cũ ở trang render-time (classic và Mochi)', () => {
  useStudent()

  // 1. effectiveMaxAttempts = 0: Không giới hạn lượt thi, dù attemptsCount cao vẫn không bị chặn
  setMochi(false)
  state.currentHomework = {
    homework: { id: 'hw-1', title: 'Bài kiểm tra Toán', maxAttempts: 1 },
    attemptsCount: 5,
    effectiveMaxAttempts: 0,
    questions: []
  }
  assert.equal(isExamAttemptExceeded(state.currentHomework), false)
  const classicUnlimited = renderClassicExamRoomView()
  assert.doesNotMatch(classicUnlimited, /Đạt Giới Hạn Lượt Thi/, 'effectiveMaxAttempts=0 thì không hiển thị hết lượt')

  setMochi(true)
  const mochiUnlimited = renderExamRoomView()
  assert.doesNotMatch(mochiUnlimited, /Đạt Giới Hạn Lượt Thi/, 'Mochi: effectiveMaxAttempts=0 thì không hiển thị hết lượt')

  // 2. effectiveMaxAttempts = 3, attemptsCount = 2: Chưa hết lượt
  state.currentHomework.effectiveMaxAttempts = 3
  state.currentHomework.attemptsCount = 2
  assert.equal(isExamAttemptExceeded(state.currentHomework), false)
  setMochi(false)
  assert.doesNotMatch(renderClassicExamRoomView(), /Đạt Giới Hạn Lượt Thi/)
  setMochi(true)
  assert.doesNotMatch(renderExamRoomView(), /Đạt Giới Hạn Lượt Thi/)

  // 3. effectiveMaxAttempts = 3, attemptsCount = 3: Đã hết lượt -> Hiện Đạt Giới Hạn Lượt Thi
  state.currentHomework.attemptsCount = 3
  assert.equal(isExamAttemptExceeded(state.currentHomework), true)
  setMochi(false)
  const classicExceeded = renderClassicExamRoomView()
  assert.match(classicExceeded, /Đạt Giới Hạn Lượt Thi/)
  assert.match(classicExceeded, /Quay lại danh sách lớp học/)
  setMochi(true)
  const mochiExceeded = renderExamRoomView()
  assert.match(mochiExceeded, /Đạt Giới Hạn Lượt Thi/)
  assert.match(mochiExceeded, /Quay lại danh sách lớp học/)

  // 4. Không có trường effectiveMaxAttempts: giữ nguyên công thức cũ maxAttempts + (activeAttemptNo - 1)
  delete state.currentHomework.effectiveMaxAttempts
  state.currentHomework.attemptsCount = 2
  state.currentHomework.activeAttemptNo = 1
  state.currentHomework.homework.maxAttempts = 1
  assert.equal(isExamAttemptExceeded(state.currentHomework), true)
  assert.match(renderClassicExamRoomView(), /Đạt Giới Hạn Lượt Thi/)

  // Khi activeAttemptNo = 2 (admin khôi phục bài thi): allowance = 1 + 1 = 2 -> attemptsCount=1 chưa vượt
  state.currentHomework.attemptsCount = 1
  state.currentHomework.activeAttemptNo = 2
  assert.equal(isExamAttemptExceeded(state.currentHomework), false)
  assert.doesNotMatch(renderClassicExamRoomView(), /Đạt Giới Hạn Lượt Thi/)
})


test('effectiveMaxAttempts đọc được cả trong data.homework (vị trí backend trả về)', async () => {
  const mod = await import('../src/js/views/exam-room.js')
  const nested = { homework: { id: 'h', maxAttempts: 1, effectiveMaxAttempts: 2 }, attemptsCount: 1, activeAttemptNo: 0 }
  assert.equal(mod.effectiveMaxAttemptsOf(nested), 2)
  assert.equal(mod.isExamAttemptExceeded(nested), false, 'được cấp thêm lượt → chưa hết')
  assert.equal(mod.isExamAttemptExceeded({ ...nested, attemptsCount: 2 }), true)
  assert.equal(mod.isExamAttemptExceeded({ homework: { id: 'h', maxAttempts: null, effectiveMaxAttempts: null }, attemptsCount: 5 }), true, 'null → công thức cũ (maxAttempts||1)')
})
