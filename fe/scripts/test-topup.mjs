/**
 * test-topup.mjs — Kiểm thử luồng nạp tiền dùng chung (modal nạp tiền + nghiệp vụ).
 *
 * Chạy:  node fe/scripts/test-topup.mjs
 * Không cần trình duyệt, không cần API thật, KHÔNG ghi tiền thật.
 *
 * Có 2 lớp kiểm thử:
 *  1. Nghiệp vụ thuần (utils/topup.js): validate số tiền, số dư sau nạp,
 *     thông báo thành công/thất bại, chống gửi trùng.
 *  2. Luồng modal (components/topup-modal.js + components/modal.js) với DOM giả:
 *     validate -> gọi API nạp -> đóng modal, lỗi -> giữ modal + thử lại,
 *     double-click -> chỉ 1 request, huỷ -> quay lại danh sách.
 */

import {
  parseTopupAmount,
  resolveTopupBalance,
  buildTopupSuccessMessage,
  describeTopupError,
  formatVnd,
  createTopupSubmitter
} from '../src/js/utils/topup.js'

let passed = 0
let failed = 0

function check(name, condition, extra = '') {
  if (condition) {
    passed++
    console.log(`  ✓ ${name}`)
  } else {
    failed++
    console.log(`  ✗ ${name}${extra ? ` -> ${extra}` : ''}`)
  }
}

function eq(name, actual, expected) {
  const ok = JSON.stringify(actual) === JSON.stringify(expected)
  check(name, ok, ok ? '' : `expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`)
}

console.log('\n== FE: parse số tiền nạp ==')
eq('số tiền có dấu phân cách nghìn', parseTopupAmount('500,000'), 500000)
eq('số tiền không dấu phân cách', parseTopupAmount('500000'), 500000)
eq('khoảng trắng thừa', parseTopupAmount('  1000  '), 1000)
eq('rỗng -> null', parseTopupAmount(''), null)
eq('null -> null', parseTopupAmount(null), null)
eq('undefined -> null', parseTopupAmount(undefined), null)
eq('0 -> null (phải > 0)', parseTopupAmount('0'), null)
eq('số âm -> null', parseTopupAmount('-5000'), null)
eq('chữ -> null', parseTopupAmount('abc'), null)
// Giữ đúng nghiệp vụ cũ: bỏ hết dấu phẩy rồi parse (ô nhập chỉ cho phép số)
eq('nhiều dấu phẩy -> bỏ hết dấu phẩy', parseTopupAmount('500,000,000'), 500000000)

console.log('\n== FE: số dư sau khi nạp ==')
eq('lấy số dư BE trả về (đã gạch nợ học phí)', resolveTopupBalance({ balance: 250000 }, 0, 500000), 250000)
eq('BE không trả số dư -> cộng vào số dư hiện tại', resolveTopupBalance({}, 100000, 500000), 600000)
eq('BE trả balance null -> fallback', resolveTopupBalance({ balance: null }, 0, 100000), 100000)
eq('BE trả balance rỗng -> fallback', resolveTopupBalance({ balance: '' }, 0, 100000), 100000)
eq('số dư hiện tại rác -> dùng 0', resolveTopupBalance({}, 'x', 100000), 100000)

console.log('\n== FE: thông báo ==')
{
  const msg = buildTopupSuccessMessage({ amount: 500000, balance: 250000, result: { paid_sessions_count: 0 } })
  check('thông báo có số tiền nạp', msg.includes('500.000'), msg)
  check('thông báo có số dư mới', msg.includes('250.000'), msg)

  const msg2 = buildTopupSuccessMessage({
    amount: 500000,
    balance: 250000,
    result: { paid_sessions_count: 2, total_deducted: 250000 }
  })
  check('có thông báo gạch nợ học phí', msg2.includes('2 buổi học'), msg2)
  check('thông báo gạch nợ có số tiền trừ', msg2.includes('250.000'), msg2)

  eq('lỗi null -> thông báo mặc định', describeTopupError(null), 'Không xác định được lỗi khi nạp tiền.')
  eq('lỗi có message', describeTopupError(new Error('Timeout')), 'Timeout')
  eq('format tiền', formatVnd(500000), '500.000')
}

console.log('\n== FE: chống gửi trùng (submitter) ==')
{
  let calls = 0
  let release
  const gate = new Promise(resolve => { release = resolve })
  const pendingStates = []
  const submitter = createTopupSubmitter({
    requestTopup: async () => {
      calls++
      await gate
      return { balance: 100000 }
    },
    onPendingChange: (p) => pendingStates.push(p)
  })

  const first = submitter.submit({ studentId: 's1', amount: 100000 })
  const second = await submitter.submit({ studentId: 's1', amount: 100000 })

  eq('lần gọi thứ 2 bị bỏ qua (double-click)', second.skipped, true)
  eq('chỉ 1 request được gửi', calls, 1)
  eq('đang xử lý thì pending = true', submitter.pending, true)

  release()
  const firstOutcome = await first
  eq('lần gọi đầu thành công', firstOutcome.ok, true)
  eq('sau khi xong thì pending = false', submitter.pending, false)
  eq('đã bật/tắt pending đúng 1 lần', pendingStates, [true, false])
}

console.log('\n== FE: lỗi -> thử lại (submitter) ==')
{
  let calls = 0
  const errors = []
  const successes = []
  const submitter = createTopupSubmitter({
    requestTopup: async () => {
      calls++
      if (calls === 1) throw new Error('Mạng lỗi')
      return { balance: 70000 }
    },
    onError: (err) => errors.push(err.message),
    onSuccess: (result) => successes.push(result.balance)
  })

  const failed = await submitter.submit({ studentId: 's1', amount: 50000 })
  eq('lần đầu lỗi', failed.ok, false)
  eq('lỗi được báo ra', errors, ['Mạng lỗi'])
  eq('chưa có kết quả thành công', successes, [])
  eq('sau lỗi vẫn thử lại được (pending = false)', submitter.pending, false)

  const retried = await submitter.submit({ studentId: 's1', amount: 50000 })
  eq('lần thử lại thành công', retried.ok, true)
  eq('kết quả thành công được báo', successes, [70000])
  eq('tổng cộng 2 request (không tự retry thêm)', calls, 2)
}

// ---------------------------------------------------------------------------
// Lớp 2: luồng modal thật (components/topup-modal.js) với DOM giả
// ---------------------------------------------------------------------------

/**
 * DOM giả tối giản cho modal.js + topup-modal.js.
 * Không phải HTML parser đầy đủ: chỉ cần đăng ký các phần tử theo `id="..."`,
 * hỗ trợ style/classList/listener/innerHTML.
 */
function createFakeDom() {
  const registry = new Map()

  const makeElement = (tagName = 'div') => {
    const el = {
      tagName: String(tagName).toUpperCase(),
      id: '',
      isConnected: true,
      style: {},
      value: '',
      disabled: false,
      textContent: '',
      classList: { add() {}, remove() {}, contains() { return false } },
      _listeners: {},
      _ownedIds: [],
      _innerHTML: '',
      children: [],
      get innerHTML() { return this._innerHTML },
      set innerHTML(html) {
        this._innerHTML = String(html ?? '')
        for (const id of this._ownedIds) {
          const old = registry.get(id)
          if (old?.__owner === this) {
            // Bị thay/tháo => không còn thuộc DOM
            old.isConnected = false
            registry.delete(id)
          }
        }
        this._ownedIds = []
        const re = /id="([^"]+)"/g
        let m
        while ((m = re.exec(this._innerHTML)) !== null) {
          const id = m[1]
          const child = makeElement('div')
          child.id = id
          child.__owner = this
          child.isConnected = true
          registry.set(id, child)
          this._ownedIds.push(id)
        }
      },
      addEventListener(type, handler) {
        (this._listeners[type] = this._listeners[type] || []).push(handler)
      },
      removeEventListener() {},
      dispatchEvent(event) {
        for (const h of this._listeners[event?.type] || []) h(event)
        return true
      },
      click() {
        for (const h of this._listeners['click'] || []) h({ type: 'click', target: this })
      },
      async clickAndWait() {
        for (const h of this._listeners['click'] || []) await h({ type: 'click', target: this })
      },
      querySelector(selector) {
        if (selector === 'span') {
          if (!this._span) this._span = makeElement('span')
          return this._span
        }
        return null
      },
      appendChild(child) { this.children.push(child); return child },
      getAttribute(name) { return name === 'id' ? this.id : null },
      hasAttribute(name) { return name === 'id' ? Boolean(this.id) : false },
      closest() { return null }
    }
    return el
  }

  const body = makeElement('body')
  const container = makeElement('div')
  container.id = 'modal-container'
  registry.set('modal-container', container)

  const document = {
    body,
    getElementById: (id) => registry.get(id) || null,
    createElement: (tag) => makeElement(tag),
    addEventListener() {},
    removeEventListener() {}
  }

  return { document, registry, container }
}

const dom = createFakeDom()
globalThis.window = globalThis
globalThis.document = dom.document
globalThis.localStorage = { getItem: () => null, setItem() {}, removeItem() {} }

const { openTopupModal, TOPUP_AMOUNT_ID, TOPUP_ERROR_ID, TOPUP_STATUS_ID, TOPUP_FORM_ID } =
  await import('../src/js/components/topup-modal.js')
const { openModal, closeModal } = await import('../src/js/components/modal.js')
const { state } = await import('../src/js/state.js')
const { api } = await import('../src/js/api.js')

// Chặn gọi mạng thật: danh sách học sinh trả về từ "fake server"
api.getStudents = async () => [
  { id: 'stu-1', fullName: 'Nguyễn Văn An', username: 'an', balance: 0 }
]

console.log('\n== FE: modal nạp tiền (DOM giả) ==')

function resetDom() {
  dom.registry.clear()
  const container = dom.document.createElement('div')
  container.id = 'modal-container'
  dom.registry.set('modal-container', container)
}

{
  resetDom()
  const calls = []
  const closeReasons = []
  let shouldFail = false

  openTopupModal({
    student: { id: 'stu-1', fullName: 'Nguyễn Văn An', balance: 0 },
    title: 'Nạp nhanh',
    requestTopup: async (studentId, amount) => {
      calls.push({ studentId, amount })
      if (shouldFail) throw new Error('Không kết nối được máy chủ')
      return { balance: 250000, paid_sessions_count: 1, total_deducted: 250000 }
    },
    onClose: (reason) => closeReasons.push(reason)
  })

  check('modal nạp tiền đã mở', Boolean(dom.document.getElementById(TOPUP_FORM_ID)))
  check('có ô nhập số tiền', Boolean(dom.document.getElementById(TOPUP_AMOUNT_ID)))
  check('có ô hiển thị lỗi', Boolean(dom.document.getElementById(TOPUP_ERROR_ID)))

  // --- Số tiền không hợp lệ -> giữ modal, không gọi API ---
  const confirmBtn = dom.document.getElementById('modal-confirm-btn')
  const amountInput = dom.document.getElementById(TOPUP_AMOUNT_ID)
  const errorEl = dom.document.getElementById(TOPUP_ERROR_ID)

  amountInput.value = 'abc'
  await confirmBtn.clickAndWait()
  eq('số tiền lỗi -> không gọi API', calls.length, 0)
  check('số tiền lỗi -> hiện lỗi trong modal', errorEl.textContent.includes('không hợp lệ'), errorEl.textContent)
  check('số tiền lỗi -> modal vẫn mở', Boolean(dom.document.getElementById(TOPUP_FORM_ID)))
  eq('số tiền lỗi -> chưa đóng modal', closeReasons, [])
  eq('số tiền lỗi -> nút xác nhận được mở lại', confirmBtn.disabled, false)

  // --- API lỗi -> giữ modal + cho thử lại ---
  shouldFail = true
  amountInput.value = '500,000'
  await confirmBtn.clickAndWait()
  eq('API lỗi -> có gọi API', calls.length, 1)
  eq('API lỗi -> truyền đúng số tiền', calls[0].amount, 500000)
  check('API lỗi -> hiện lỗi trong modal', errorEl.textContent.includes('Không kết nối được máy chủ'), errorEl.textContent)
  check('API lỗi -> modal vẫn mở để thử lại', Boolean(dom.document.getElementById(TOPUP_FORM_ID)))
  eq('API lỗi -> chưa đóng modal', closeReasons, [])
  eq('API lỗi -> nút xác nhận được mở lại', confirmBtn.disabled, false)

  // --- Thử lại -> thành công ---
  shouldFail = false
  await confirmBtn.clickAndWait()
  eq('thử lại -> gọi API lần 2', calls.length, 2)
  eq('thành công -> modal đóng', Boolean(dom.document.getElementById(TOPUP_FORM_ID)), false)
  eq('thành công -> onClose("confirm")', closeReasons, ['confirm'])

  // Số dư được cập nhật trong state (không gán tay số dư)
  const studentInState = { id: 'stu-1', fullName: 'Nguyễn Văn An', balance: 0 }
  state.students = [studentInState]
  resetDom()
  openTopupModal({
    student: studentInState,
    requestTopup: async () => ({ balance: 750000 }),
    onClose: () => {}
  })
  const confirmBtn2 = dom.document.getElementById('modal-confirm-btn')
  dom.document.getElementById(TOPUP_AMOUNT_ID).value = '1000000'
  await confirmBtn2.clickAndWait()
  eq('số dư trong state được cập nhật theo kết quả BE', state.students[0].balance, 750000)
  eq('danh sách học sinh được tải lại từ API', state.students[0].username, 'an')
}

console.log('\n== FE: double-click không tạo 2 lần nạp ==')
{
  resetDom()
  const calls = []
  let release
  const gate = new Promise(resolve => { release = resolve })

  openTopupModal({
    student: { id: 'stu-2', fullName: 'Trần Thị B', balance: 0 },
    requestTopup: async (studentId, amount) => {
      calls.push({ studentId, amount })
      await gate
      return { balance: 100000 }
    },
    onClose: () => {}
  })

  const confirmBtn = dom.document.getElementById('modal-confirm-btn')
  dom.document.getElementById(TOPUP_AMOUNT_ID).value = '200000'

  const p1 = confirmBtn.clickAndWait()
  const p2 = confirmBtn.clickAndWait()
  eq('double-click -> chỉ 1 request nạp tiền', calls.length, 1)

  await p2
  release()
  await p1
  eq('sau khi xong vẫn chỉ có 1 request', calls.length, 1)
}

console.log('\n== FE: huỷ modal nạp -> quay lại danh sách (1 modal, không lồng modal) ==')
{
  resetDom()
  const closeReasons = []

  // Mô phỏng popup danh sách (modal 1)
  openModal('Học sinh có số dư 0 đ', '<div id="zero-balance-modal-content">danh sach</div>', null, {
    cancelLabel: 'Đóng'
  })
  const listCancelBtn = dom.document.getElementById('modal-cancel-btn')
  check('popup danh sách đã mở', Boolean(dom.document.getElementById('zero-balance-modal-content')))

  // Mở modal nạp (modal 2) -> thay thế modal 1 trong cùng container
  openTopupModal({
    student: { id: 'stu-3', fullName: 'Lê Văn C', balance: 0 },
    requestTopup: async () => ({ balance: 100000 }),
    onClose: (reason) => {
      closeReasons.push(reason)
      // Mô phỏng hành vi dashboard: quay lại popup danh sách sau khi modal nạp đóng
      openModal('Học sinh có số dư 0 đ', '<div id="zero-balance-modal-content">danh sach</div>', null, {
        cancelLabel: 'Đóng'
      })
    }
  })

  check('modal nạp thay thế popup danh sách', Boolean(dom.document.getElementById(TOPUP_FORM_ID)))
  check('nội dung danh sách cũ đã bị thay', !dom.document.getElementById('zero-balance-modal-content'))

  // Huỷ modal nạp -> phải quay lại danh sách
  const topupCancelBtn = dom.document.getElementById('modal-cancel-btn')
  await topupCancelBtn.clickAndWait()
  eq('huỷ -> onClose("cancel")', closeReasons, ['cancel'])
  check('huỷ -> đã quay lại popup danh sách', Boolean(dom.document.getElementById('zero-balance-modal-content')))
  check('huỷ -> modal nạp đã đóng', !dom.document.getElementById(TOPUP_FORM_ID))

  // Đóng modal danh sách cũ (đã bị thay) KHÔNG được xoá modal đang active
  listCancelBtn.click()
  check('đóng modal cũ không xoá modal đang mở', Boolean(dom.document.getElementById('zero-balance-modal-content')))
}

console.log('\n== FE: race - request cũ KHÔNG được sửa modal mới ==')
{
  resetDom()
  const calls = []
  const closeReasons = []
  let resolveA
  let resolveB
  const deferredA = new Promise(resolve => { resolveA = resolve })
  const deferredB = new Promise(resolve => { resolveB = resolve })

  state.students = [
    { id: 'stu-A', fullName: 'Học sinh A', username: 'a', balance: 0 },
    { id: 'stu-B', fullName: 'Học sinh B', username: 'b', balance: 0 }
  ]

  // 1) Mở modal nạp cho học sinh A -> request treo (deferred)
  openTopupModal({
    student: state.students[0],
    syncStudentList: false,
    requestTopup: async (studentId, amount) => {
      calls.push({ studentId, amount })
      if (studentId === 'stu-A') return await deferredA
      return await deferredB
    },
    onClose: (reason) => closeReasons.push(reason)
  })
  dom.document.getElementById(TOPUP_AMOUNT_ID).value = '100000'
  const confirmA = dom.document.getElementById('modal-confirm-btn')
  const pendingA = confirmA.clickAndWait()
  eq('A: đã gửi 1 request', calls.length, 1)
  eq('A: nút xác nhận bị khoá khi đang nạp', confirmA.disabled, true)

  // 2) Đóng modal A bằng code (dọn khi đổi route) rồi mở modal nạp cho học sinh B
  closeModal()
  check('A: modal đã đóng bằng code', !dom.document.getElementById(TOPUP_FORM_ID))
  eq('A: onClose("close") khi đóng bằng code', closeReasons, ['close'])

  openTopupModal({
    student: state.students[1],
    syncStudentList: false,
    requestTopup: async (studentId, amount) => {
      calls.push({ studentId, amount })
      if (studentId === 'stu-A') return await deferredA
      return await deferredB
    },
    onClose: (reason) => closeReasons.push(reason)
  })
  const errorB = dom.document.getElementById(TOPUP_ERROR_ID)
  const statusB = dom.document.getElementById(TOPUP_STATUS_ID)
  const confirmB = dom.document.getElementById('modal-confirm-btn')
  dom.document.getElementById(TOPUP_AMOUNT_ID).value = '200000'
  const pendingB = confirmB.clickAndWait()
  eq('B: đã gửi 1 request', calls.length, 2)
  eq('B: nút xác nhận bị khoá khi đang nạp', confirmB.disabled, true)

  // 3) Response của A về muộn (modal A đã bị thay) => KHÔNG đụng vào modal B
  resolveA({ balance: 555000, paid_sessions_count: 0 })
  await pendingA
  await new Promise(resolve => setTimeout(resolve, 0))

  eq('A: nạp thành công vẫn cập nhật số dư nghiệp vụ', state.students[0].balance, 555000)
  eq('B: nút xác nhận VẪN khoá (A không mở khoá nút của B)', confirmB.disabled, true)
  eq('B: không bị ghi đè lỗi của A', errorB.textContent, '')
  eq('B: trạng thái của B không bị A ghi đè', statusB.querySelector('span').textContent, 'Đang nạp tiền, vui lòng chờ...')
  eq('B: số tiền trong ô nhập của B không bị đổi', dom.document.getElementById(TOPUP_AMOUNT_ID).value, '200000')
  eq('A: onClose chỉ có lần đóng bằng code', closeReasons, ['close'])

  // 4) B hoàn tất -> đóng modal B
  resolveB({ balance: 300000 })
  await pendingB
  await new Promise(resolve => setTimeout(resolve, 0))
  check('B: modal đóng sau khi nạp xong', !dom.document.getElementById(TOPUP_FORM_ID))
  eq('B: số dư nghiệp vụ được cập nhật', state.students[1].balance, 300000)
}

console.log('\n== FE: chặn huỷ modal khi đang nạp (tránh nạp trùng) ==')
{
  resetDom()
  const calls = []
  const closeReasons = []
  let release
  const gate = new Promise(resolve => { release = resolve })

  openTopupModal({
    student: { id: 'stu-C', fullName: 'Học sinh C', balance: 0 },
    syncStudentList: false,
    requestTopup: async (studentId, amount) => {
      calls.push({ studentId, amount })
      await gate
      return { balance: 100000 }
    },
    onClose: (reason) => closeReasons.push(reason)
  })
  dom.document.getElementById(TOPUP_AMOUNT_ID).value = '100000'
  const confirmC = dom.document.getElementById('modal-confirm-btn')
  const pendingC = confirmC.clickAndWait()
  eq('C: đã gửi 1 request', calls.length, 1)

  // Người dùng bấm "Huỷ" khi request đang chạy => KHÔNG được đóng modal
  const cancelBtn = dom.document.getElementById('modal-cancel-btn')
  await cancelBtn.clickAndWait()
  check('đang nạp -> modal KHÔNG bị đóng khi bấm Huỷ', Boolean(dom.document.getElementById(TOPUP_FORM_ID)))
  eq('đang nạp -> onCancel chưa được gọi', closeReasons, [])
  eq('đang nạp -> vẫn chỉ 1 request', calls.length, 1)

  // Mở lại modal nạp cho CÙNG học sinh khi request trước chưa xong => bị chặn
  const reopened = openTopupModal({
    student: { id: 'stu-C', fullName: 'Học sinh C', balance: 0 },
    requestTopup: async () => ({ balance: 100000 }),
    onClose: () => {}
  })
  eq('mở lại nạp cho cùng học sinh đang nạp -> bị chặn', reopened, null)
  eq('mở lại -> không gửi thêm request', calls.length, 1)

  // Request xong -> modal đóng bình thường
  release()
  await pendingC
  await new Promise(resolve => setTimeout(resolve, 0))
  check('nạp xong -> modal đóng', !dom.document.getElementById(TOPUP_FORM_ID))
  eq('nạp xong -> onClose("confirm")', closeReasons, ['confirm'])
}

console.log(`\nKết quả topup: ${passed} pass, ${failed} fail\n`)
if (failed > 0) process.exit(1)
