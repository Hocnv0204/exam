import assert from 'node:assert'

// Set up mock DOM
const elements = {}

function createElement(tag) {
  const el = {
    tag,
    innerHTML: '',
    children: [],
    attributes: {},
    listeners: {},
    setAttribute(k, v) { this.attributes[k] = v },
    getAttribute(k) { return this.attributes[k] },
    hasAttribute(k) { return k in this.attributes },
    addEventListener(evt, fn) {
      if (!this.listeners[evt]) this.listeners[evt] = []
      this.listeners[evt].push(fn)
    },
    dispatchEvent(evt) {
      const fns = this.listeners[evt.type] || []
      fns.forEach(fn => fn(evt))
    },
    querySelectorAll(selector) {
      if (selector === '.pagination-btn') {
        return this.paginationBtns || []
      }
      return []
    },
    querySelector(selector) {
      if (selector === '.pagination-page-size') {
        return this.pageSizeEl || null
      }
      return null
    }
  }
  return el
}

globalThis.window = {
  location: { hash: '#students' },
  innerWidth: 1200,
  addEventListener: () => {}
}
globalThis.document = {
  documentElement: { dataset: {}, style: {} },
  getElementById: (id) => elements[id] || null,
  querySelectorAll: () => [],
  addEventListener: () => {}
}
globalThis.localStorage = {
  getItem: () => null,
  setItem: () => {},
  removeItem: () => {}
}

const { renderStudentMgmtView, bindStudentMgmtEvents } = await import('../src/js/views/student-mgmt.js')
const { state } = await import('../src/js/state.js')

console.log('--- Test 1: renderStudentMgmtView resilience ---')
state.classes = undefined
state.students = undefined
let html = renderStudentMgmtView()
assert(html.includes('Quản lý học sinh'), 'Must render title even if classes and students are undefined')

state.classes = null
state.students = { items: [{ id: 's1', fullName: 'Nguyen Van A', username: 'nva', balance: 0 }] }
html = renderStudentMgmtView()
assert(html.includes('Nguyen Van A'), 'Must render student row even if state.students is an object with items')

console.log('--- Test 2: Pagination rebinding on page switch ---')
state.classes = [{ id: 'c1', name: 'Lop 12A' }]
state.students = Array.from({ length: 30 }, (_, i) => ({
  id: `s${i + 1}`,
  fullName: `Hoc Sinh ${i + 1}`,
  username: `hs${i + 1}`,
  balance: 100000,
  className: 'Lop 12A'
}))

// Mock elements needed by bindStudentMgmtEvents
const pagWrapper = createElement('div')
pagWrapper.id = 'student-pagination-wrapper'
elements['student-pagination-wrapper'] = pagWrapper

const tbody = createElement('tbody')
tbody.id = 'students-table-body'
elements['students-table-body'] = tbody

const pagContainer = createElement('div')
pagContainer.id = 'student-pagination-container'
elements['student-pagination-container'] = pagContainer

const page2Btn = createElement('button')
page2Btn.setAttribute('data-page', '2')
pagContainer.paginationBtns = [page2Btn]

bindStudentMgmtEvents()

assert(page2Btn.listeners['click'] && page2Btn.listeners['click'].length > 0, 'Page 2 button must have click listener attached')
console.log('Initial page 2 button listener attached: OK')

// Click page 2
page2Btn.dispatchEvent({ type: 'click', preventDefault: () => {} })

// After page change, paginationWrapper.innerHTML was updated with page 2 active.
assert(pagWrapper.innerHTML.includes('data-page="2"'), 'Pagination wrapper must render updated active page')
console.log('Pagination wrapper updated: OK')

console.log('All student management pagination tests passed successfully!')

