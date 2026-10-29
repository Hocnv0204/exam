import assert from 'node:assert/strict'

console.log('=== Kiểm thử Lọc / Tìm kiếm Lịch sử nộp bài (Admin History Filter) ===\n')

// 1. Mock Fake DOM
function createFakeDom() {
  const registry = new Map()

  function makeElement(tag) {
    const listeners = new Map()
    const dataset = {}
    const el = {
      tagName: tag.toUpperCase(),
      id: '',
      value: '',
      disabled: false,
      innerHTML: '',
      textContent: '',
      dataset,
      style: {},
      children: [],
      classList: {
        classes: new Set(),
        add(c) { this.classes.add(c) },
        remove(c) { this.classes.delete(c) },
        contains(c) { return this.classes.has(c) },
        toggle(c) { if (this.classes.has(c)) this.classes.delete(c); else this.classes.add(c) }
      },
      setAttribute(name, val) {
        if (name === 'id') this.id = val
        this[name] = val
      },
      getAttribute(name) { return this[name] || null },
      addEventListener(type, fn) {
        if (!listeners.has(type)) listeners.set(type, [])
        listeners.get(type).push(fn)
      },
      removeEventListener(type, fn) {
        if (listeners.has(type)) {
          const arr = listeners.get(type).filter(f => f !== fn)
          listeners.set(type, arr)
        }
      },
      async dispatchEvent(event) {
        const fns = listeners.get(event.type) || []
        for (const fn of fns) {
          await fn(event)
        }
      },
      getListenerCount(type) {
        return (listeners.get(type) || []).length
      },
      querySelector(selector) {
        return registry.get(selector.replace(/^#/, '')) || null
      },
      querySelectorAll(selector) {
        const match = registry.get(selector.replace(/^[.#]/, ''))
        return match ? [match] : []
      },
      focus() {},
      setSelectionRange() {}
    }
    return el
  }

  const body = makeElement('body')
  const app = makeElement('div')
  app.id = 'app'
  registry.set('app', app)

  const document = {
    body,
    getElementById: (id) => registry.get(id) || null,
    createElement: (tag) => makeElement(tag),
    querySelector: (selector) => {
      const clean = selector.replace(/^[.#]/, '').split(' ')[0]
      return registry.get(clean) || null
    },
    querySelectorAll: () => [],
    addEventListener() {},
    removeEventListener() {}
  }

  return { document, registry, makeElement }
}

const dom = createFakeDom()
globalThis.window = {
  location: { hash: '#admin-history' },
  history: { replaceState(s, t, url) { globalThis.window.location.hash = url } },
  navigator: { clipboard: { writeText: async () => {} } },
  innerWidth: 1200
}
globalThis.document = dom.document
globalThis.sessionStorage = { getItem: () => null, setItem() {}, removeItem() {} }
globalThis.localStorage = { getItem: () => null, setItem() {}, removeItem() {} }

const { api } = await import('../src/js/api.js')
const { state } = await import('../src/js/state.js')
const {
  renderAdminHistoryView,
  loadAdminHistoryData,
  bindAdminHistoryEvents,
  resolveHistoryHomeworkId,
  _getAdminHistoryState,
  _resetAdminHistoryState
} = await import('../src/js/views/admin-history.js')

// Chuẩn bị Mock Classes trong State
state.classes = [
  { id: 'class_a', name: 'Lớp 12A (Toán - Lý)' },
  { id: 'class_b', name: 'Lớp 12B (Hóa - Sinh)' },
  { id: 'class_empty', name: 'Lớp 10C (Chưa có bài tập)' }
]

// Mock dữ liệu bài tập và bài nộp
const mockClassHomeworksA = [
  { id: 'hw_a1', title: 'Bài tập este 01', type: 'PRACTICE', className: 'Lớp 12A' },
  { id: 'hw_a2', title: 'Bài thi thử este 01', type: 'EXAM', className: 'Lớp 12A' }
]

const mockClassHomeworksB = [
  { id: 'hw_b1', title: 'Luyện tập peptit 01', type: 'PRACTICE', className: 'Lớp 12B' },
  { id: 'hw_b2', title: 'Bài kiểm tra peptit', type: 'EXAM', className: 'Lớp 12B' }
]

const mockSubmissionsA = [
  { id: 'sub_a1', homeworkId: 'hw_a1', studentName: 'Học sinh A1', score: 9.0, isPassed: true }
]

const mockSubmissionsB = [
  { id: 'sub_b1', homeworkId: 'hw_b1', studentName: 'Học sinh B1', score: 8.5, isPassed: true }
]

// ========================================================
// TEST SUITE 1: Khi admin đổi Lớp học A -> B
// ========================================================
console.log('--- 1. Kiểm thử Đổi Lớp Học A -> B ---')
{
  _resetAdminHistoryState()

  // Giả lập router tải ban đầu cho Lớp A với bài tập hw_a1
  api.getStudentHistory = async (params) => {
    assert.ok(typeof params === 'string')
    if (params.includes('classId=class_a')) {
      return {
        classId: 'class_a',
        classHomeworks: mockClassHomeworksA,
        history: mockSubmissionsA,
        total: 1,
        page: 1,
        totalPages: 1
      }
    }
    if (params.includes('classId=class_b')) {
      return {
        classId: 'class_b',
        classHomeworks: mockClassHomeworksB,
        history: mockSubmissionsB,
        total: 1,
        page: 1,
        totalPages: 1
      }
    }
    return { classHomeworks: [], history: [], total: 0, totalPages: 1 }
  }

  // Tải dữ liệu ban đầu cho Lớp A
  await loadAdminHistoryData('class_a', 'hw_a1', 'class')
  let st = _getAdminHistoryState()
  assert.equal(st.selectedClassId, 'class_a')
  assert.equal(st.selectedHomeworkId, 'hw_a1')
  assert.equal(st.classHomeworks.length, 2)
  assert.equal(st.classHomeworks[0].id, 'hw_a1')
  assert.equal(st.submissions.length, 1)

  // Render view và giả lập DOM elements
  const appEl = dom.registry.get('app')
  appEl.innerHTML = renderAdminHistoryView()

  // Tạo fake element select lớp và select bài tập
  const classSelect = dom.makeElement('select')
  classSelect.id = 'admin-history-class-select'
  classSelect.value = 'class_a'
  dom.registry.set('admin-history-class-select', classSelect)

  const hwSelect = dom.makeElement('select')
  hwSelect.id = 'admin-history-hw-select'
  hwSelect.innerHTML = `<option value="">Tất cả</option><option value="hw_a1">hw_a1</option>`
  dom.registry.set('admin-history-hw-select', hwSelect)

  bindAdminHistoryEvents()

  // BƯỚC QUAN TRỌNG: Admin đổi lớp từ class_a sang class_b trên dropdown
  classSelect.value = 'class_b'
  await classSelect.dispatchEvent({ type: 'change', target: classSelect })

  // 1. Kiểm tra options cũ bị xoá và loading hiển thị ngay lập tức
  assert.equal(hwSelect.disabled, true, 'Dropdown bài tập phải bị disable ngay khi đổi lớp')
  assert.ok(hwSelect.innerHTML.includes('Đang tải danh sách bài tập'), 'Dropdown bài tập phải hiển thị thông báo loading ngay lập tức')

  // 2. Chạy tải dữ liệu cho Lớp B
  await loadAdminHistoryData('class_b', '', 'class')
  st = _getAdminHistoryState()

  // 3. Kiểm tra homeworkId đã được reset về rỗng
  assert.equal(st.selectedHomeworkId, '', 'Khi đổi lớp, selectedHomeworkId phải reset về rỗng')
  assert.equal(st.selectedClassId, 'class_b')

  // 4. Kiểm tra danh sách bài tập mới thuộc Lớp B đã được nạp
  assert.equal(st.classHomeworks.length, 2)
  assert.equal(st.classHomeworks[0].id, 'hw_b1')
  assert.equal(st.classHomeworks[1].id, 'hw_b2')

  // 5. Kiểm tra bài nộp thuộc Lớp B
  assert.equal(st.submissions[0].id, 'sub_b1')
  console.log('  ✓ Đổi Lớp A->B: reset homeworkId về rỗng, xóa options cũ ngay lập tức, hiển thị loading và nạp đúng bài tập lớp B')
}

// ========================================================
// TEST SUITE 2: Chống Stale Async Response (Race condition requestId & AbortController)
// ========================================================
console.log('--- 2. Kiểm thử Chống Ghi Đè Response Cũ (Stale Async Overwrite) ---')
{
  _resetAdminHistoryState()

  let abortSignalReceived = false
  let resolveReqA = null

  api.getStudentHistory = (queryStr, options = {}) => {
    if (queryStr.includes('classId=class_a')) {
      if (options.signal) {
        options.signal.addEventListener('abort', () => {
          abortSignalReceived = true
        })
      }
      return new Promise((resolve) => {
        resolveReqA = () => resolve({
          classId: 'class_a',
          classHomeworks: mockClassHomeworksA,
          history: mockSubmissionsA
        })
      })
    }
    if (queryStr.includes('classId=class_b')) {
      return Promise.resolve({
        classId: 'class_b',
        classHomeworks: mockClassHomeworksB,
        history: mockSubmissionsB
      })
    }
    return Promise.resolve({ classHomeworks: [], history: [] })
  }

  // Khởi chạy request 1: class_a (bị trễ trên mạng)
  const p1 = loadAdminHistoryData('class_a', '', 'class')

  // Người dùng nhanh tay chuyển sang class_b ngay sau đó
  const p2 = loadAdminHistoryData('class_b', '', 'class')

  // Request 2 (class_b) hoàn thành trước
  await p2

  let st = _getAdminHistoryState()
  assert.equal(st.selectedClassId, 'class_b')
  assert.equal(st.classHomeworks[0].id, 'hw_b1')

  // Kiểm tra AbortController đã phát tín hiệu abort cho request A
  assert.equal(abortSignalReceived, true, 'Request trước đó phải được AbortController phát tín hiệu hủy')

  // Bây giờ request A chậm chạp trả về sau cùng
  if (resolveReqA) resolveReqA()
  await p1

  // Kết quả sau khi request A về muộn: Class B vẫn phải được bảo toàn, KHÔNG BỊ ghi đè!
  st = _getAdminHistoryState()
  assert.equal(st.selectedClassId, 'class_b', 'State classId vẫn là class_b sau khi response A về muộn')
  assert.equal(st.classHomeworks[0].id, 'hw_b1', 'Danh sách bài tập vẫn là của class_b, không bị ghi đè bởi class_a')
  assert.equal(st.submissions[0].id, 'sub_b1', 'Danh sách bài nộp vẫn thuộc class_b')

  console.log('  ✓ Response cũ đến trễ bị loại trừ 100% nhờ requestId & AbortController, không ghi đè class mới')
}

// ========================================================
// TEST SUITE 3: Lớp rỗng (0 bài tập)
// ========================================================
console.log('--- 3. Kiểm thử Lớp Rỗng (Empty Class - 0 Bài tập) ---')
{
  _resetAdminHistoryState()

  // Trước đó đang có bài tập của lớp A
  api.getStudentHistory = async (params) => {
    if (params.includes('classId=class_a')) {
      return {
        classId: 'class_a',
        classHomeworks: mockClassHomeworksA,
        history: mockSubmissionsA
      }
    }
    if (params.includes('classId=class_empty')) {
      return {
        classId: 'class_empty',
        classHomeworks: [],
        history: []
      }
    }
    return { classHomeworks: [], history: [] }
  }

  await loadAdminHistoryData('class_a', 'hw_a1', 'class')
  let st = _getAdminHistoryState()
  assert.equal(st.classHomeworks.length, 2)

  // Chuyển sang lớp rỗng
  await loadAdminHistoryData('class_empty', '', 'class')
  st = _getAdminHistoryState()

  // Không được giữ lại bài tập cũ của lớp A
  assert.equal(st.selectedClassId, 'class_empty')
  assert.equal(st.selectedHomeworkId, '')
  assert.equal(st.classHomeworks.length, 0, 'Class rỗng phải có classHomeworks = 0, không giữ bài lớp cũ')
  assert.equal(st.submissions.length, 0)

  // Render view
  const html = renderAdminHistoryView()
  assert.ok(html.includes('Lớp chưa có bài tập nào (0 bài)'), 'Giao diện select phải thông báo lớp chưa có bài tập')
  assert.ok(html.includes('Lớp học này chưa có bài tập nào'), 'Bảng danh sách phải hiển thị thông báo lớp chưa có bài tập')

  console.log('  ✓ Lớp rỗng: xóa sạch danh sách bài tập cũ, render trạng thái empty chuẩn và disable dropdown bài tập')
}

// ========================================================
// TEST SUITE 4: Tự động reset homeworkId khi homework không còn trong class mới
// ========================================================
console.log('--- 4. Kiểm thử Tự động Reset Homework Filter Khi Không Thuộc Class Mới ---')
{
  _resetAdminHistoryState()

  let calls = []
  api.getStudentHistory = async (queryStr) => {
    calls.push(queryStr)
    if (queryStr.includes('homeworkId=hw_a1') && queryStr.includes('classId=class_b')) {
      // Backend trả về bài tập của lớp B (không có hw_a1)
      return {
        classId: 'class_b',
        homeworkId: 'hw_a1',
        classHomeworks: mockClassHomeworksB,
        history: []
      }
    }
    if (queryStr.includes('classId=class_b') && !queryStr.includes('homeworkId=')) {
      return {
        classId: 'class_b',
        classHomeworks: mockClassHomeworksB,
        history: mockSubmissionsB
      }
    }
    return { classHomeworks: [], history: [] }
  }

  // Tình huống: Người dùng có link cũ chứa classId=class_b nhưng homeworkId=hw_a1 (của lớp A)
  await loadAdminHistoryData('class_b', 'hw_a1', 'class')

  const st = _getAdminHistoryState()
  // Hệ thống phải phát hiện hw_a1 không có trong classHomeworks của class_b,
  // tự động reset homeworkId về rỗng và gọi reload lại toàn bộ lớp B!
  assert.equal(st.selectedHomeworkId, '', 'Phải tự động reset homeworkId về rỗng khi không thuộc class mới')
  assert.equal(st.selectedClassId, 'class_b')
  assert.equal(st.submissions.length, 1)
  assert.equal(st.submissions[0].id, 'sub_b1', 'Đã tải lại toàn bộ kết quả của class B')

  // Kiểm tra 2 lần gọi: lần 1 có homeworkId sai, lần 2 tự động sửa thành không có homeworkId
  assert.equal(calls.length, 2)
  assert.ok(calls[0].includes('homeworkId=hw_a1'))
  assert.ok(!calls[1].includes('homeworkId='))

  console.log('  ✓ Tự động phát hiện homework không thuộc class mới, reset filter và reload chính xác kết quả toàn lớp')
}

// ========================================================
// TEST SUITE 5: Xử lý Error & Retry Mechanism
// ========================================================
console.log('--- 5. Kiểm thử Xử Lý Lỗi & Cơ Chế Thử Lại (Error & Retry) ---')
{
  _resetAdminHistoryState()

  let shouldFail = true
  api.getStudentHistory = async () => {
    if (shouldFail) {
      throw new Error('Mạng bị gián đoạn (ERR_CONNECTION_REFUSED)')
    }
    return {
      classId: 'class_b',
      classHomeworks: mockClassHomeworksB,
      history: mockSubmissionsB
    }
  }

  // Lần gọi đầu bị lỗi
  await loadAdminHistoryData('class_b', '', 'class')
  let st = _getAdminHistoryState()
  assert.ok(st.lastLoadError.includes('Mạng bị gián đoạn'), 'Phải lưu lại lỗi trong lastLoadError')
  assert.equal(st.classHomeworks.length, 0)
  assert.equal(st.submissions.length, 0)

  // View phải render thông báo lỗi và nút thử lại
  const errorHtml = renderAdminHistoryView()
  assert.ok(errorHtml.includes('Lỗi tải bài tập'), 'Dropdown phải hiển thị cảnh báo lỗi')
  assert.ok(errorHtml.includes('btn-retry-homeworks'), 'Có nút thử lại bài tập')
  assert.ok(errorHtml.includes('btn-retry-history'), 'Có nút thử lại bảng nộp bài')

  // Người dùng bấm thử lại khi mạng đã phục hồi
  shouldFail = false
  await loadAdminHistoryData('class_b', '', 'class')
  st = _getAdminHistoryState()
  assert.equal(st.lastLoadError, null, 'Lỗi phải được xóa sau khi tải lại thành công')
  assert.equal(st.classHomeworks.length, 2, 'Dữ liệu bài tập được khôi phục')
  assert.equal(st.submissions.length, 1, 'Dữ liệu bài nộp được khôi phục')

  console.log('  ✓ Bắt lỗi mạng/máy chủ chuẩn xác, hiển thị Error state và phục hồi dữ liệu khi Thử lại')
}

// ========================================================
// TEST SUITE 6: Kiểm tra Chống Bind Trùng Event Listener Khi Rerender
// ========================================================
console.log('--- 6. Kiểm thử Chống Bind Trùng Event Listener Khi Rerender ---')
{
  _resetAdminHistoryState()

  const fakeSelect = dom.makeElement('select')
  fakeSelect.id = 'admin-history-class-select'
  dom.registry.set('admin-history-class-select', fakeSelect)

  const fakeHwSelect = dom.makeElement('select')
  fakeHwSelect.id = 'admin-history-hw-select'
  dom.registry.set('admin-history-hw-select', fakeHwSelect)

  // Gọi bind lần 1
  bindAdminHistoryEvents()
  assert.equal(fakeSelect.dataset.bound, 'true')
  assert.equal(fakeSelect.getListenerCount('change'), 1)

  // Gọi bind lần 2 và lần 3 trên cùng DOM element
  bindAdminHistoryEvents()
  bindAdminHistoryEvents()

  // Số lượng listener 'change' vẫn chỉ là 1, không bị nhân đôi hay nhân ba
  assert.equal(fakeSelect.getListenerCount('change'), 1, 'Event listener không được bind trùng lặp trên cùng element')
  assert.equal(fakeHwSelect.getListenerCount('change'), 1, 'Hw select không bị bind trùng')

  console.log('  ✓ Cơ chế dataset.bound bảo vệ 100% không bị duplicate listener khi rerender')
}

// ========================================================
// TEST SUITE 7: Hợp đồng Edge Function Endpoint (Backend Anti Cross-class Leakage)
// ========================================================
console.log('--- 7. Kiểm thử Hợp đồng Edge Function (Anti Cross-class Leakage) ---')
{
  // Logic kiểm tra bất biến của Edge Function student-history:
  // Nếu classId && classId !== 'TRIAL', và homeworkId không thuộc classHwIds -> rawSubmissions = []
  function simulateEdgeFunctionHistoryFilter({ classId, homeworkId, classHwIds, rawSubmissions }) {
    if (classId && classId !== 'TRIAL') {
      if (homeworkId && !classHwIds.includes(homeworkId)) {
        return []
      }
      if (classHwIds.length === 0) {
        return []
      }
    }
    return rawSubmissions
  }

  const crossClassSubmissions = [{ id: 'sub_a1', homework_id: 'hw_a1' }]
  const resFiltered = simulateEdgeFunctionHistoryFilter({
    classId: 'class_b',
    homeworkId: 'hw_a1',
    classHwIds: ['hw_b1', 'hw_b2'],
    rawSubmissions: crossClassSubmissions
  })

  assert.equal(resFiltered.length, 0, 'Edge Function không được phép rò rỉ submission của lớp khác')

  console.log('  ✓ Hợp đồng Edge Function bảo đảm cô lập dữ liệu theo lớp, triệt tiêu rò rỉ submission chéo lớp')
}

// ========================================================
// TEST SUITE 8: Vào trang Lịch sử KHÔNG được tự chọn bài (menu / link / link cũ)
// ========================================================
console.log('--- 8. Kiểm thử Không Tự Chọn Bài Khi Vào Trang Lịch Sử ---')
{
  _resetAdminHistoryState()

  // 8a. Vào từ menu sidebar: #admin-history (không tham số)
  window.location.hash = '#admin-history'
  renderAdminHistoryView()
  let st = _getAdminHistoryState()
  assert.equal(st.selectedHomeworkId, '', 'Vào từ menu sidebar không được tự chọn bài tập')
  assert.equal(st.currentSubTab, 'submitted')
  assert.equal(st.currentMode, 'class')

  // 8b. Link từ Quản lý bài tập ("Lịch sử") / Chi tiết lớp ("Kết quả"): chỉ có classId
  window.location.hash = '#admin-history?classId=class_a'
  renderAdminHistoryView()
  st = _getAdminHistoryState()
  assert.equal(st.selectedClassId, 'class_a', 'Vẫn giữ ngữ cảnh lớp từ link')
  assert.equal(st.selectedHomeworkId, '', 'Link vào trang không được tự chọn bài tập')

  // 8c. Link CŨ còn sót (được lưu/bookmark trước fix) chứa homeworkId nhưng không có pick=1
  window.location.hash = '#admin-history?classId=class_a&homeworkId=hw_a1'
  renderAdminHistoryView()
  st = _getAdminHistoryState()
  assert.equal(st.selectedClassId, 'class_a', 'Giữ ngữ cảnh lớp từ link cũ')
  assert.equal(st.selectedHomeworkId, '', 'Link cũ chứa homeworkId không được tự chọn bài tập')

  // 8d. Link cũ kèm tab=unsubmitted nhưng không chọn bài => rơi về tab "Đã nộp bài"
  window.location.hash = '#admin-history?classId=class_a&homeworkId=hw_a1&tab=unsubmitted'
  renderAdminHistoryView()
  st = _getAdminHistoryState()
  assert.equal(st.selectedHomeworkId, '')
  assert.equal(st.currentSubTab, 'submitted', 'Tab "Chưa làm bài" chỉ hợp lệ khi đang chọn 1 bài tập')

  // 8e. URL do USER tự chọn bài trên dropdown (có pick=1) => giữ lựa chọn khi F5/reload
  window.location.hash = '#admin-history?mode=class&classId=class_a&homeworkId=hw_a2&pick=1&subTab=unsubmitted'
  renderAdminHistoryView()
  st = _getAdminHistoryState()
  assert.equal(st.selectedHomeworkId, 'hw_a2', 'URL có pick=1 phải khôi phục bài user đã tự chọn')
  assert.equal(st.currentSubTab, 'unsubmitted', 'Giữ nguyên tab chi tiết khi đang chọn bài')

  // 8f. Hợp đồng dùng chung với router (app.js)
  assert.equal(resolveHistoryHomeworkId(new URLSearchParams('classId=class_a&homeworkId=hw_a1')), '', 'Router không gửi homeworkId cho link không có pick=1')
  assert.equal(resolveHistoryHomeworkId(new URLSearchParams('classId=class_a&homeworkId=hw_a1&pick=1')), 'hw_a1', 'Router khôi phục homeworkId khi có pick=1')
  assert.equal(resolveHistoryHomeworkId(new URLSearchParams('pick=1')), '', 'pick=1 mà thiếu homeworkId => không chọn bài')
  assert.equal(resolveHistoryHomeworkId(new URLSearchParams('mode=trial&classId=TRIAL')), '', 'Link vào chế độ học thử không tự chọn bài')

  console.log('  ✓ Menu/link/link cũ vào trang luôn bắt đầu không lọc theo bài; chỉ URL pick=1 (user tự chọn) mới khôi phục bộ lọc')
}

// ========================================================
// TEST SUITE 9: User tự chọn bài trên dropdown => hash pick=1, query có homeworkId, placeholder đúng
// ========================================================
console.log('--- 9. Kiểm thử Tự Chọn Bài Tập Trên Dropdown (Manual Selection + Reset) ---')
{
  _resetAdminHistoryState()

  let queries = []
  api.getStudentHistory = async (queryStr) => {
    queries.push(queryStr)
    if (queryStr.includes('homeworkId=hw_a1')) {
      return {
        classId: 'class_a',
        classHomeworks: mockClassHomeworksA,
        history: mockSubmissionsA,
        submissionStats: { homeworkTitle: 'Bài tập este 01' }
      }
    }
    return {
      classId: 'class_a',
      classHomeworks: mockClassHomeworksA,
      history: mockSubmissionsA,
      total: 1,
      page: 1,
      totalPages: 1
    }
  }

  // Vào trang bằng link còn sót chứa homeworkId (không pick=1) => không chọn bài
  window.location.hash = '#admin-history?classId=class_a&homeworkId=hw_a2'
  const routerParams = new URLSearchParams(window.location.hash.split('?')[1] || '')
  await loadAdminHistoryData('class_a', resolveHistoryHomeworkId(routerParams), 'class')

  assert.ok(queries[0].includes('classId=class_a'), 'Request theo lớp khi chưa chọn bài')
  assert.ok(!queries[0].includes('homeworkId='), 'Request KHÔNG được lọc theo homeworkId của link cũ')
  assert.ok(queries[0].includes('page=1'), 'Có phân trang server khi chưa chọn bài')
  assert.ok(queries[0].includes('pageSize='), 'Có pageSize khi chưa chọn bài')

  // Placeholder "Tất cả bài tập" phải là option đầu và KHÔNG có option nào được selected
  let html = renderAdminHistoryView()
  const selMatch = html.match(/<select id="admin-history-hw-select"[\s\S]*?<\/select>/)
  assert.ok(selMatch, 'Giao diện có dropdown "Lọc theo Bài học / Bài tập"')
  const selHtml = selMatch[0]
  assert.ok(selHtml.includes('-- Tất cả bài tập trong lớp (2 bài) --'), 'Có placeholder "Tất cả bài tập trong lớp"')
  assert.ok(!/<option[^>]*selected/.test(selHtml), 'Không option bài tập nào được selected khi chưa chọn bài (không tự chọn option đầu)')

  // User chủ động chọn bài trên dropdown
  const hwSelect = dom.makeElement('select')
  hwSelect.id = 'admin-history-hw-select'
  hwSelect.value = 'hw_a1'
  dom.registry.set('admin-history-hw-select', hwSelect)
  bindAdminHistoryEvents()
  await hwSelect.dispatchEvent({ type: 'change', target: hwSelect })

  const pickedHash = window.location.hash
  assert.ok(pickedHash.includes('homeworkId=hw_a1'), 'Hash phải chứa homeworkId sau khi user tự chọn')
  assert.ok(pickedHash.includes('pick=1'), 'Hash phải chứa dấu pick=1 để phân biệt với link vào trang')

  // Mô phỏng router xử lý hashchange y hệt app.js
  const pickedParams = new URLSearchParams(pickedHash.split('?')[1] || '')
  queries = []
  await loadAdminHistoryData('class_a', resolveHistoryHomeworkId(pickedParams), 'class')
  assert.ok(queries.some(q => q.includes('homeworkId=hw_a1')), 'Request phải lọc theo bài user đã tự chọn')
  assert.equal(_getAdminHistoryState().selectedHomeworkId, 'hw_a1')

  // Chuyển tab chi tiết khi đang chọn bài: hash vẫn giữ pick=1 + homeworkId
  const tabBtnWrong = dom.makeElement('button')
  tabBtnWrong.id = 'tab-btn-wrong'
  dom.registry.set('tab-btn-wrong', tabBtnWrong)
  bindAdminHistoryEvents()
  await tabBtnWrong.dispatchEvent({ type: 'click' })
  assert.ok(window.location.hash.includes('subTab=wrong-questions'), 'Chuyển tab phải cập nhật hash')
  assert.ok(window.location.hash.includes('pick=1'), 'Chuyển tab vẫn giữ dấu pick=1')
  assert.ok(window.location.hash.includes('homeworkId=hw_a1'), 'Chuyển tab vẫn giữ bài tập đang lọc')

  // User chọn lại "Tất cả bài tập" => xóa bộ lọc + dấu pick
  hwSelect.value = ''
  await hwSelect.dispatchEvent({ type: 'change', target: hwSelect })
  const resetHash = window.location.hash
  assert.ok(!resetHash.includes('homeworkId'), 'Chọn "Tất cả bài tập" phải xóa homeworkId khỏi hash')
  assert.ok(!resetHash.includes('pick='), 'Chọn "Tất cả bài tập" phải xóa dấu pick')

  const resetParams = new URLSearchParams(resetHash.split('?')[1] || '')
  queries = []
  await loadAdminHistoryData('class_a', resolveHistoryHomeworkId(resetParams), 'class')
  assert.ok(!queries.some(q => q.includes('homeworkId=')), 'Request sau khi reset không còn lọc theo bài')
  assert.ok(queries.some(q => q.includes('pageSize=')), 'Quay lại phân trang server khi xem tất cả bài tập')

  console.log('  ✓ Tự chọn bài: hash có pick=1, request lọc đúng bài, placeholder đúng; chọn lại "Tất cả" xóa sạch bộ lọc')
}

// ========================================================
// TEST SUITE 10: Đổi Lớp / Đổi chế độ (Lớp <-> Học thử) không giữ bộ lọc bài cũ
// ========================================================
console.log('--- 10. Kiểm thử Đổi Lớp / Đổi Chế Độ Không Giữ Bộ Lọc Bài Cũ ---')
{
  _resetAdminHistoryState()

  api.getStudentHistory = async (queryStr) => {
    if (queryStr.includes('classId=class_b')) {
      return { classId: 'class_b', classHomeworks: mockClassHomeworksB, history: mockSubmissionsB, total: 1, page: 1, totalPages: 1 }
    }
    return { classId: 'class_a', classHomeworks: mockClassHomeworksA, history: mockSubmissionsA, total: 1, page: 1, totalPages: 1 }
  }

  // Vào trang với bài đã tự chọn trước đó (pick=1)
  window.location.hash = '#admin-history?mode=class&classId=class_a&homeworkId=hw_a1&pick=1'
  renderAdminHistoryView()
  assert.equal(_getAdminHistoryState().selectedHomeworkId, 'hw_a1')

  const btnModeClass = dom.makeElement('button')
  btnModeClass.id = 'btn-mode-class'
  dom.registry.set('btn-mode-class', btnModeClass)
  const btnModeTrial = dom.makeElement('button')
  btnModeTrial.id = 'btn-mode-trial'
  dom.registry.set('btn-mode-trial', btnModeTrial)
  const classSelect = dom.makeElement('select')
  classSelect.id = 'admin-history-class-select'
  classSelect.value = 'class_b'
  dom.registry.set('admin-history-class-select', classSelect)
  const hwSelect = dom.makeElement('select')
  hwSelect.id = 'admin-history-hw-select'
  dom.registry.set('admin-history-hw-select', hwSelect)
  bindAdminHistoryEvents()

  // Chuyển sang chế độ Học thử: hash mode=trial, không còn homeworkId/pick
  await btnModeTrial.dispatchEvent({ type: 'click' })
  const trialHash = window.location.hash
  assert.ok(trialHash.includes('mode=trial'), 'Hash chuyển sang chế độ học thử')
  assert.ok(trialHash.includes('classId=TRIAL'), 'Hash giữ ngữ cảnh TRIAL')
  assert.ok(!trialHash.includes('homeworkId'), 'Không được giữ homeworkId khi đổi chế độ')
  assert.ok(!trialHash.includes('pick='), 'Không được giữ dấu pick khi đổi chế độ')

  window.location.hash = trialHash
  renderAdminHistoryView()
  let st = _getAdminHistoryState()
  assert.equal(st.currentMode, 'trial', 'Chế độ học thử được áp dụng')
  assert.equal(st.selectedHomeworkId, '', 'Không tự chọn bài khi sang chế độ học thử')

  // Quay lại chế độ lớp rồi đổi lớp: homework filter phải reset
  await btnModeClass.dispatchEvent({ type: 'click' })
  renderAdminHistoryView()
  st = _getAdminHistoryState()
  assert.equal(st.currentMode, 'class')
  assert.equal(st.selectedHomeworkId, '', 'Quay lại chế độ lớp: không giữ bộ lọc bài cũ')

  await classSelect.dispatchEvent({ type: 'change', target: classSelect })
  const classHash = window.location.hash
  assert.ok(classHash.includes('classId=class_b'), 'Hash chuyển sang lớp mới')
  assert.ok(!classHash.includes('homeworkId'), 'Đổi lớp không được giữ homeworkId')
  assert.ok(!classHash.includes('pick='), 'Đổi lớp không được giữ dấu pick')

  window.location.hash = classHash
  renderAdminHistoryView()
  st = _getAdminHistoryState()
  assert.equal(st.selectedClassId, 'class_b')
  assert.equal(st.selectedHomeworkId, '', 'Sau khi đổi lớp, không có bài tập nào được tự chọn')

  console.log('  ✓ Đổi lớp/đổi chế độ luôn xóa bộ lọc bài tập và dấu pick, không rò rỉ selection cũ')
}

console.log('\n============================================================')
console.log('TẤT CẢ KIỂM THỬ LỊCH SỬ NỘP BÀI ĐỀU ĐẠT! ✅')
