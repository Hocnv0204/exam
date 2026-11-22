import test from 'node:test'
import assert from 'node:assert/strict'

// ---------------------------------------------------------------------------
// Giả lập môi trường DOM & Web APIs tối thiểu cho Node.js
// ---------------------------------------------------------------------------

const storageMap = new Map()
const sessionMap = new Map()

const mockLocalStorage = {
  getItem: (k) => storageMap.get(k) ?? null,
  setItem: (k, v) => storageMap.set(k, String(v)),
  removeItem: (k) => storageMap.delete(k),
  clear: () => storageMap.clear()
}

const mockSessionStorage = {
  getItem: (k) => sessionMap.get(k) ?? null,
  setItem: (k, v) => sessionMap.set(k, String(v)),
  removeItem: (k) => sessionMap.delete(k),
  clear: () => sessionMap.clear()
}

globalThis.localStorage = mockLocalStorage
globalThis.sessionStorage = mockSessionStorage

class MockDOMTokenList {
  constructor(el) {
    this._el = el
    this._set = new Set()
  }
  add(...names) {
    names.forEach(n => this._set.add(n))
    this._el.className = Array.from(this._set).join(' ')
  }
  remove(...names) {
    names.forEach(n => this._set.delete(n))
    this._el.className = Array.from(this._set).join(' ')
  }
  contains(name) {
    return this._set.has(name)
  }
}

class MockElement {
  constructor(tagName) {
    this.tagName = tagName.toUpperCase()
    this.nodeType = 1
    this._className = ''
    this.classList = new MockDOMTokenList(this)
    this.style = {}
    this._attrs = new Map()
    this.children = []
    this.parentNode = null
    this.parentElement = null
    this.isConnected = true
    this._innerHTML = ''
    this.textContent = ''
    this._listeners = new Map()
  }

  get className() {
    return this._className
  }
  set className(val) {
    this._className = String(val || '')
    this.classList._set = new Set(this._className.split(/\s+/).filter(Boolean))
  }

  get innerHTML() {
    return this._innerHTML
  }
  set innerHTML(val) {
    this._innerHTML = String(val || '')
    this._parseSimpleHTML(this._innerHTML)
  }

  _parseSimpleHTML(html) {
    this.children = []
    const tagRegex = /<([a-z0-9-]+)([^>]*)>(.*?)<\/\1>|<([a-z0-9-]+)([^>]*)\/>/gis
    let match
    while ((match = tagRegex.exec(html)) !== null) {
      const tagName = match[1] || match[4]
      const attrStr = match[2] || match[5] || ''
      const inner = match[3] || ''

      const child = new MockElement(tagName)
      // parse attributes
      const attrRegex = /([a-z0-9_:-]+)(?:=(?:"([^"]*)"|'([^']*)'|([^\s>]+)))?/gi
      let attrMatch
      while ((attrMatch = attrRegex.exec(attrStr)) !== null) {
        const attrName = attrMatch[1]
        const attrVal = attrMatch[2] ?? attrMatch[3] ?? attrMatch[4] ?? ''
        child.setAttribute(attrName, attrVal)
        if (attrName === 'class') child.className = attrVal
        if (attrName === 'id') child.id = attrVal
      }

      if (inner) {
        child.innerHTML = inner
      }
      this.appendChild(child)
    }
  }

  setAttribute(name, value) {
    this._attrs.set(name, String(value))
    if (name === 'class') this.className = value
    if (name === 'id') this.id = value
  }
  getAttribute(name) {
    return this._attrs.get(name) ?? null
  }
  hasAttribute(name) {
    return this._attrs.has(name)
  }
  removeAttribute(name) {
    this._attrs.delete(name)
  }

  appendChild(child) {
    if (child) {
      child.parentNode = this
      child.parentElement = this
      child.isConnected = this.isConnected
      this.children.push(child)
    }
    return child
  }

  append(...nodes) {
    for (const node of nodes) {
      if (typeof node === 'string') {
        const textNode = new MockElement('SPAN')
        textNode.textContent = node
        this.appendChild(textNode)
      } else if (node) {
        this.appendChild(node)
      }
    }
  }

  remove() {
    if (this.parentNode) {
      const idx = this.parentNode.children.indexOf(this)
      if (idx !== -1) {
        this.parentNode.children.splice(idx, 1)
      }
      this.parentNode = null
      this.parentElement = null
    }
    this.isConnected = false
  }

  getBoundingClientRect() {
    return {
      top: 100,
      left: 100,
      bottom: 150,
      right: 250,
      width: 150,
      height: 50
    }
  }

  getClientRects() {
    return [{ top: 100, left: 100, width: 150, height: 50 }]
  }

  scrollIntoView() {}
  focus() {
    if (globalThis.document) {
      globalThis.document.activeElement = this
    }
  }
  click() {
    if (typeof this.onclick === 'function') {
      this.onclick({ target: this, preventDefault: () => {} })
    }
    this.dispatchEvent({ type: 'click', target: this, preventDefault: () => {} })
  }

  addEventListener(type, listener) {
    if (!this._listeners.has(type)) {
      this._listeners.set(type, new Set())
    }
    this._listeners.get(type).add(listener)
  }
  removeEventListener(type, listener) {
    if (this._listeners.has(type)) {
      this._listeners.get(type).delete(listener)
    }
  }
  dispatchEvent(event) {
    const list = this._listeners.get(event.type)
    if (list) {
      for (const fn of list) {
        fn(event)
      }
    }
  }

  querySelector(selector) {
    const results = this.querySelectorAll(selector)
    return results[0] || null
  }

  querySelectorAll(selector) {
    const matched = []
    const walk = (node) => {
      for (const child of node.children) {
        if (matchesSelector(child, selector)) {
          matched.push(child)
        }
        walk(child)
      }
    }
    walk(this)
    return matched
  }
}

function matchesSelector(el, selector) {
  if (!selector) return false
  if (selector.includes(',')) {
    return selector.split(',').some(part => matchesSelector(el, part.trim()))
  }
  const s = selector.trim()

  // [data-tour="..."]
  const dataTourMatch = s.match(/^\[data-tour="([^"]+)"\]$/)
  if (dataTourMatch) {
    return el.getAttribute('data-tour') === dataTourMatch[1]
  }

  // #id
  if (s.startsWith('#')) {
    return el.id === s.slice(1)
  }

  // .class
  if (s.startsWith('.')) {
    return el.classList.contains(s.slice(1))
  }

  // tag name
  if (/^[a-z0-9-]+$/i.test(s)) {
    return el.tagName === s.toUpperCase()
  }

  // button:not([disabled])
  if (s.startsWith('button')) {
    return el.tagName === 'BUTTON'
  }

  return false
}

const windowListeners = new Map()

globalThis.window = {
  location: { hash: '#student-dashboard', search: '' },
  innerWidth: 1024,
  innerHeight: 768,
  getComputedStyle: (el) => {
    return el?.style || {}
  },
  matchMedia: (query) => {
    return { matches: false, media: query }
  },
  scrollBy: () => {},
  addEventListener: (type, fn) => {
    if (!windowListeners.has(type)) windowListeners.set(type, new Set())
    windowListeners.get(type).add(fn)
  },
  removeEventListener: (type, fn) => {
    if (windowListeners.has(type)) windowListeners.get(type).delete(fn)
  },
  dispatchEvent: (event) => {
    const list = windowListeners.get(event.type)
    if (list) {
      for (const fn of list) fn(event)
    }
  }
}

const mockBody = new MockElement('BODY')
const mockDocElement = new MockElement('HTML')
mockDocElement.appendChild(mockBody)

globalThis.document = {
  head: null, // Giữ null để không kích hoạt dynamic import CSS trong node
  body: mockBody,
  documentElement: mockDocElement,
  activeElement: null,
  createElement: (tagName) => new MockElement(tagName),
  getElementById: (id) => {
    const all = mockDocElement.querySelectorAll(`#${id}`)
    return all[0] || null
  },
  querySelector: (sel) => mockDocElement.querySelector(sel),
  querySelectorAll: (sel) => mockDocElement.querySelectorAll(sel),
  addEventListener: () => {},
  removeEventListener: () => {}
}

// ---------------------------------------------------------------------------
// Import module sau khi globals đã được định nghĩa
// ---------------------------------------------------------------------------

const { state } = await import('../src/js/state.js')
const {
  isVisible,
  shouldAutoStart,
  closeReasonMarksSeen,
  markTourSeen,
  startMochiTour,
  endMochiTour,
  autoStartMochiTour,
  cancelScheduledTour,
  isTourActive,
  chooseSheetPlacement,
  isFixedElement,
  getHeaderBottom
} = await import('../src/js/utils/mochi-tour.js')

// ---------------------------------------------------------------------------
// Helper dọn dẹp state giữa các bài test
// ---------------------------------------------------------------------------

function resetEnv() {
  storageMap.clear()
  sessionMap.clear()
  mockBody.children = []
  globalThis.window.location.hash = '#student-dashboard'
  globalThis.window.location.search = ''
  globalThis.window.innerWidth = 1024
  globalThis.window.innerHeight = 768

  state.token = 'test-token'
  state.user = {
    id: 'student-1',
    role: 'STUDENT',
    fullName: 'Lê Hoàng',
    seenTours: []
  }

  cancelScheduledTour()
  endMochiTour()
}

// ---------------------------------------------------------------------------
// Unit tests
// ---------------------------------------------------------------------------

test('isVisible kiểm tra đúng getClientRects và computed visibility/display', () => {
  assert.equal(isVisible(null), false)
  assert.equal(isVisible({}), false)

  const el = new MockElement('div')
  assert.equal(isVisible(el), true)

  // getClientRects rỗng
  el.getClientRects = () => []
  assert.equal(isVisible(el), false)

  // visibility: hidden
  el.getClientRects = () => [{ top: 0, left: 0, width: 10, height: 10 }]
  el.style.visibility = 'hidden'
  assert.equal(isVisible(el), false)

  // display: none
  el.style.visibility = 'visible'
  el.style.display = 'none'
  assert.equal(isVisible(el), false)

  // hiển thị bình thường
  el.style.display = 'block'
  assert.equal(isVisible(el), true)
})

test('closeReasonMarksSeen chỉ chấp nhận "done" và "skip"', () => {
  assert.equal(closeReasonMarksSeen('done'), true)
  assert.equal(closeReasonMarksSeen('skip'), true)
  assert.equal(closeReasonMarksSeen('replaced'), false)
  assert.equal(closeReasonMarksSeen('route'), false)
  assert.equal(closeReasonMarksSeen('end'), false)
  assert.equal(closeReasonMarksSeen('close'), false)
  assert.equal(closeReasonMarksSeen(''), false)
})

test('shouldAutoStart: điều kiện hợp lệ và các trường hợp bị chặn', () => {
  resetEnv()

  // 1. Học sinh bình thường, giao diện Mochi mặc định, chưa xem tour
  assert.equal(shouldAutoStart('m2-welcome'), true)

  // 2. Không phải học sinh (ADMIN, TEACHER)
  assert.equal(shouldAutoStart('m2-welcome', { role: 'ADMIN', seenTours: [] }), false)
  assert.equal(shouldAutoStart('m2-welcome', { role: 'TEACHER', seenTours: [] }), false)
  assert.equal(shouldAutoStart('m2-welcome', null), false)

  // 3. Đã có trong seenTours của tài khoản
  assert.equal(shouldAutoStart('m2-welcome', { role: 'STUDENT', seenTours: ['m2-welcome'] }), false)

  // 4. Đã có trong localStorage
  storageMap.set('edu_mtour_seen_m2-welcome', '1')
  assert.equal(shouldAutoStart('m2-welcome'), false)
  storageMap.delete('edu_mtour_seen_m2-welcome')

  // 5. Đang opt-out giao diện cũ (?ui=classic)
  storageMap.set('eduportal-ui', 'classic')
  assert.equal(shouldAutoStart('m2-welcome'), false)
  storageMap.delete('eduportal-ui')

  // 6. Đang mượn phiên (admin impersonating)
  sessionMap.set('edu_admin_backup', JSON.stringify({
    user: { id: 'admin-99', role: 'ADMIN' }
  }))
  assert.equal(shouldAutoStart('m2-welcome'), false)
  sessionMap.delete('edu_admin_backup')

  // 7. Key rỗng
  assert.equal(shouldAutoStart(''), false)
  assert.equal(shouldAutoStart(null), false)
})

test('markTourSeen ghi localStorage và chỉ gọi API/cập nhật state khi KHÔNG mượn phiên', () => {
  resetEnv()

  let apiCalledWith = null
  const mockApi = {
    completeOnboarding: (key) => {
      apiCalledWith = key
      return Promise.resolve({ success: true })
    }
  }

  // Trường hợp 1: Học sinh thật
  const user = { id: 'student-1', role: 'STUDENT', seenTours: [] }
  markTourSeen('m2-welcome', {
    isImpersonatingFn: () => false,
    apiObj: mockApi,
    userState: user
  })

  assert.equal(storageMap.get('edu_mtour_seen_m2-welcome'), '1')
  assert.deepEqual(user.seenTours, ['m2-welcome'])
  assert.equal(apiCalledWith, 'm2-welcome')

  // Trường hợp 2: Đang mượn phiên (Admin) → không gọi API, không sửa user.seenTours
  apiCalledWith = null
  const impersonatedUser = { id: 'student-2', role: 'STUDENT', seenTours: ['m2-old'] }
  markTourSeen('m2-classes', {
    isImpersonatingFn: () => true,
    apiObj: mockApi,
    userState: impersonatedUser
  })

  assert.equal(storageMap.get('edu_mtour_seen_m2-classes'), '1')
  assert.deepEqual(impersonatedUser.seenTours, ['m2-old'], 'seenTours không được thêm key khi mượn phiên')
  assert.equal(apiCalledWith, null, 'API không được gọi khi mượn phiên')
})

test('startMochiTour: trả false khi không có phần tử hiển thị và không có welcome', () => {
  resetEnv()

  let toastMsg = null
  // mock toast container
  const toastContainer = new MockElement('div')
  toastContainer.id = 'toast-container'
  mockDocElement.appendChild(toastContainer)

  const tourWithoutWelcome = {
    key: 'm2-classes',
    steps: [{ target: 'non-existing-target', title: 'A', text: 'B' }]
  }

  const started = startMochiTour(tourWithoutWelcome, { auto: false })
  assert.equal(started, false)
  assert.equal(isTourActive(), false)
  assert.equal(mockBody.querySelector('.m-tour'), null)
})

test('startMochiTour: mở thành công màn chào mừng (bước 0) và điều hướng sang bước spotlight', () => {
  resetEnv()

  // Tạo phần tử đích trong DOM
  const targetEl = new MockElement('div')
  targetEl.setAttribute('data-tour', 'step-1-target')
  mockBody.appendChild(targetEl)

  let closedReason = null
  const tour = {
    key: 'm2-welcome',
    welcome: {
      title: 'Chào bạn <Lê Hoàng>!',
      lines: ['Làm bài tập mỗi ngày', 'Xem lộ trình học', 'Tích luỹ XP đổi quà'],
      startLabel: 'Bắt đầu ngay',
      laterLabel: 'Để sau'
    },
    steps: [
      { target: 'step-1-target', title: 'Thanh điều hướng', text: 'Menu chính của bạn' }
    ]
  }

  const started = startMochiTour(tour, {
    onClose: (reason) => { closedReason = reason }
  })

  assert.equal(started, true)
  assert.equal(isTourActive(), true)

  const tourRoot = mockBody.querySelector('.m-tour')
  assert.ok(tourRoot, 'DOM gốc .m-tour được gắn vào body')

  const welcomeEl = tourRoot.querySelector('.m-tour-welcome')
  assert.ok(welcomeEl, 'Thẻ chào mừng hiển thị')
  assert.equal(welcomeEl.style.display, 'block')
  assert.match(welcomeEl.innerHTML, /&lt;Lê Hoàng&gt;/, 'escape dữ liệu động')
  assert.match(welcomeEl.innerHTML, /Bắt đầu ngay/)

  // Nhấn nút "Bắt đầu ngay" -> chuyển sang bước spotlight đầu tiên
  const btnStart = welcomeEl.querySelector('.m-tour-welcome-start')
  btnStart.click()

  assert.equal(welcomeEl.style.display, 'none')
  const bubbleEl = tourRoot.querySelector('.m-tour-bubble')
  assert.equal(bubbleEl.style.display, 'block')
  assert.match(bubbleEl.innerHTML, /Thanh điều hướng/)
  assert.match(bubbleEl.innerHTML, /Bước 1\/1/)
  assert.match(bubbleEl.innerHTML, /Hoàn thành/, 'bước cuối cùng hiện nút Hoàn thành')

  // Nhấn nút "Hoàn thành" -> đóng tour với reason 'done' và đánh dấu đã xem
  const btnFinish = bubbleEl.querySelector('.m-tour-btn--next')
  btnFinish.click()

  assert.equal(isTourActive(), false)
  assert.equal(closedReason, 'done')
  assert.equal(storageMap.get('edu_mtour_seen_m2-welcome'), '1', 'đã ghi nhận đã xem vào localStorage')
  assert.equal(mockBody.querySelector('.m-tour'), null, 'DOM dọn dẹp sạch sẽ')
})

test('startMochiTour: nút "Để sau" hoặc bấm backdrop đóng tour với reason "skip" và đánh dấu đã xem', () => {
  resetEnv()

  let closedReason = null
  const tour = {
    key: 'm2-welcome-skip',
    welcome: {
      title: 'Chào mừng',
      lines: ['Nội dung 1'],
      laterLabel: 'Để sau'
    },
    steps: []
  }

  startMochiTour(tour, {
    onClose: (reason) => { closedReason = reason }
  })

  const tourRoot = mockBody.querySelector('.m-tour')
  const btnLater = tourRoot.querySelector('.m-tour-welcome-later')
  btnLater.click()

  assert.equal(closedReason, 'skip')
  assert.equal(storageMap.get('edu_mtour_seen_m2-welcome-skip'), '1')
  assert.equal(isTourActive(), false)
})

test('endMochiTour và đổi route đóng tour KHÔNG đánh dấu đã xem', () => {
  resetEnv()

  const targetEl = new MockElement('div')
  targetEl.setAttribute('data-tour', 'sample-target')
  mockBody.appendChild(targetEl)

  const tour = {
    key: 'm2-classes',
    steps: [{ target: 'sample-target', title: 'Lớp học', text: 'Chi tiết lớp' }]
  }

  // 1. endMochiTour()
  startMochiTour(tour)
  assert.equal(isTourActive(), true)
  endMochiTour()
  assert.equal(isTourActive(), false)
  assert.equal(globalThis.localStorage.getItem('edu_mtour_seen_m2-classes'), null, 'endMochiTour không đánh dấu đã xem')

  // 2. Hashchange (đổi route)
  startMochiTour(tour)
  assert.equal(isTourActive(), true)
  globalThis.window.dispatchEvent({ type: 'hashchange' })
  assert.equal(isTourActive(), false)
  assert.equal(globalThis.localStorage.getItem('edu_mtour_seen_m2-classes'), null, 'đổi route không đánh dấu đã xem')
})

test('Mở tour mới tự động thay thế tour cũ mà không đánh dấu tour cũ', () => {
  resetEnv()

  const targetEl1 = new MockElement('div')
  targetEl1.setAttribute('data-tour', 'target-1')
  mockBody.appendChild(targetEl1)

  const targetEl2 = new MockElement('div')
  targetEl2.setAttribute('data-tour', 'target-2')
  mockBody.appendChild(targetEl2)

  const tour1 = {
    key: 'tour-1',
    steps: [{ target: 'target-1', title: 'T1', text: 'Text 1' }]
  }
  const tour2 = {
    key: 'tour-2',
    steps: [{ target: 'target-2', title: 'T2', text: 'Text 2' }]
  }

  startMochiTour(tour1)
  assert.equal(isTourActive(), true)

  // Mở tour 2 đè lên tour 1
  startMochiTour(tour2)
  assert.equal(isTourActive(), true)
  assert.equal(globalThis.localStorage.getItem('edu_mtour_seen_tour-1'), null, 'tour cũ bị thay thế không được đánh dấu')

  endMochiTour()
})

test('autoStartMochiTour hẹn giờ và chống stale khi hash thay đổi hoặc guard bị tháo', async () => {
  resetEnv()

  const targetEl = new MockElement('div')
  targetEl.setAttribute('data-tour', 'target-auto')
  mockBody.appendChild(targetEl)

  const tour = {
    key: 'm2-auto',
    steps: [{ target: 'target-auto', title: 'Auto', text: 'Test' }]
  }

  // Trường hợp 1: Đổi hash trong khi timer đang chạy
  globalThis.window.location.hash = '#student-dashboard'
  autoStartMochiTour(tour, { delay: 30 })

  // Đổi hash ngay lập tức
  globalThis.window.location.hash = '#attendance'
  await new Promise(r => setTimeout(r, 50))
  assert.equal(isTourActive(), false, 'không mở tour vì hash đã thay đổi')

  // Trường hợp 2: Guard element bị disconnected
  globalThis.window.location.hash = '#student-dashboard'
  const guard = new MockElement('div')
  guard.isConnected = false

  autoStartMochiTour(tour, { delay: 30, guard })
  await new Promise(r => setTimeout(r, 50))
  assert.equal(isTourActive(), false, 'không mở tour vì guard đã disconnected')

  // Trường hợp 3: Điều kiện thỏa mãn → tour tự mở
  guard.isConnected = true
  autoStartMochiTour(tour, { delay: 30, guard })
  await new Promise(r => setTimeout(r, 50))
  assert.equal(isTourActive(), true, 'tour tự động mở sau delay khi đủ điều kiện')
  endMochiTour()
})

test('Tương tác bàn phím: Esc kích hoạt Bỏ qua, ArrowRight sang bước kế tiếp', () => {
  resetEnv()

  const elA = new MockElement('div')
  elA.setAttribute('data-tour', 'key-a')
  const elB = new MockElement('div')
  elB.setAttribute('data-tour', 'key-b')
  mockBody.appendChild(elA)
  mockBody.appendChild(elB)

  let closedReason = null
  const tour = {
    key: 'm2-keys',
    steps: [
      { target: 'key-a', title: 'Bước A', text: 'A' },
      { target: 'key-b', title: 'Bước B', text: 'B' }
    ]
  }

  startMochiTour(tour, { onClose: r => { closedReason = r } })
  const tourRoot = mockBody.querySelector('.m-tour')
  const bubbleEl = tourRoot.querySelector('.m-tour-bubble')

  assert.match(bubbleEl.innerHTML, /Bước 1\/2/)

  // Nhấn ArrowRight -> chuyển sang bước 2
  globalThis.window.dispatchEvent({
    type: 'keydown',
    key: 'ArrowRight',
    preventDefault: () => {}
  })

  assert.match(bubbleEl.innerHTML, /Bước 2\/2/)

  // Nhấn Esc -> Bỏ qua
  globalThis.window.dispatchEvent({
    type: 'keydown',
    key: 'Escape',
    preventDefault: () => {}
  })

  assert.equal(isTourActive(), false)
  assert.equal(closedReason, 'skip')
  assert.equal(storageMap.get('edu_mtour_seen_m2-keys'), '1')
})

test('chooseSheetPlacement: quyết định vị trí sheet "top" hoặc "bottom" chính xác', () => {
  // 1. Phần tử ở giữa → bottom
  const r1 = chooseSheetPlacement({
    targetTop: 200,
    targetBottom: 350,
    viewportH: 860,
    sheetH: 250,
    headerBottom: 72,
    pad: 8
  })
  assert.equal(r1, 'bottom', 'phần tử ở giữa màn hình dùng sheet ở đáy')

  // 2. Phần tử ở đáy (619–782, vh 860, sheet 250) → top
  const r2 = chooseSheetPlacement({
    targetTop: 619,
    targetBottom: 782,
    viewportH: 860,
    sheetH: 250,
    headerBottom: 72,
    pad: 8
  })
  assert.equal(r2, 'top', 'phần tử ở đáy (619–782) giao với vùng sheet đáy chuyển sheet lên top')

  // 3. Tab bar fixed 774–868 → top
  const r3 = chooseSheetPlacement({
    targetTop: 774,
    targetBottom: 868,
    viewportH: 860,
    sheetH: 250,
    headerBottom: 72,
    pad: 8
  })
  assert.equal(r3, 'top', 'tab bar cố định ở đáy (774–868) chuyển sheet lên top')

  // 4. Phần tử cao hơn vùng trống → bottom
  const r4 = chooseSheetPlacement({
    targetTop: 80,
    targetBottom: 720,
    viewportH: 860,
    sheetH: 250,
    headerBottom: 72,
    pad: 8
  })
  assert.equal(r4, 'bottom', 'phần tử cao hơn vùng trống giữ sheet ở đáy')
})

test('isFixedElement: kiểm tra chính xác phần tử position:fixed và tổ tiên fixed', () => {
  assert.equal(isFixedElement(null), false)

  const parent = new MockElement('nav')
  const child = new MockElement('a')
  parent.appendChild(child)

  // Không có fixed
  assert.equal(isFixedElement(child), false)

  // Chính phần tử có position: fixed
  child.style.position = 'fixed'
  assert.equal(isFixedElement(child), true)

  // Tổ tiên có position: fixed
  child.style.position = 'static'
  parent.style.position = 'fixed'
  assert.equal(isFixedElement(child), true)
})

test('getHeaderBottom: đo header cố định hoặc dùng fallback 72px', () => {
  // Không có header trong DOM -> fallback 72
  assert.equal(getHeaderBottom(), 72)

  const header = new MockElement('header')
  header.className = 'm-shell-topbar'
  header.style.position = 'fixed'
  header.getBoundingClientRect = () => ({ top: 0, bottom: 68, height: 68, width: 360 })
  mockDocElement.appendChild(header)

  assert.equal(getHeaderBottom(), 68)
  header.remove()
})

test('Tour mobile (<=640px): tự động gắn class m-tour-bubble--top khi phần tử ở đáy', () => {
  resetEnv()
  globalThis.window.innerWidth = 360
  globalThis.window.innerHeight = 860

  const bottomTarget = new MockElement('nav')
  bottomTarget.className = 'm-tabbar'
  bottomTarget.setAttribute('data-tour', 'tabbar')
  bottomTarget.style.position = 'fixed'
  bottomTarget.getBoundingClientRect = () => ({
    top: 774,
    bottom: 868,
    left: 0,
    right: 360,
    width: 360,
    height: 94
  })
  mockBody.appendChild(bottomTarget)

  const tour = {
    key: 'm2-mobile-tabbar',
    steps: [
      { target: 'tabbar', title: 'Thanh điều hướng', text: 'Menu chính' }
    ]
  }

  startMochiTour(tour)
  const tourRoot = mockBody.querySelector('.m-tour')
  const bubbleEl = tourRoot.querySelector('.m-tour-bubble')

  assert.ok(bubbleEl.classList.contains('m-tour-bubble--top'), 'bubbleEl có class m-tour-bubble--top khi phần tử fixed ở đáy')

  endMochiTour()
})
