import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { register } from 'node:module'

// Intercept .css, .svg and mock import.meta.env during node test execution
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
    if (url.includes('create-hw.js')) {
      const filePath = fileURLToPath(url);
      const code = readFileSync(filePath, 'utf8')
        .replace(/import\\.meta\\.env\\.VITE_SUPABASE_URL/g, '""');
      return { format: 'module', shortCircuit: true, source: code };
    }
    return nextLoad(url, context);
  }
`))

function createFakeElement({ id = '', attrs = {}, classes = [], parent = null, rectTop = 0, scrollTop = 0, scrollHeight = 1000, clientHeight = 500, overflowY = 'visible' } = {}) {
  const classSet = new Set(classes)
  const el = {
    id,
    attrs,
    classSet,
    parent,
    parentElement: parent,
    style: { overflowY },
    scrollTop,
    scrollHeight,
    clientHeight,
    listeners: {},
    getAttribute: (key) => (Object.prototype.hasOwnProperty.call(el.attrs, key) ? el.attrs[key] : null),
    setAttribute: (key, value) => { attrs[key] = value },
    classList: {
      contains: (c) => classSet.has(c),
      add: (c) => classSet.add(c),
      remove: (c) => classSet.delete(c),
    },
    addEventListener: (type, handler) => { el.listeners[type] = handler },
    querySelectorAll: () => [],
    getBoundingClientRect: () => ({ top: rectTop, height: 40, bottom: rectTop + 40, left: 0, right: 800, width: 800 }),
    closest: (selector) => {
      let node = el
      while (node) {
        if (selector === '.interactive-creator-wrapper' && node.classList && node.classList.contains('interactive-creator-wrapper')) return node
        node = node.parent || null
      }
      return null
    },
    scrollTo: (options) => { el.scrollCalls.push(options) },
    scrollCalls: [],
  }
  return el
}

function extractMediaBlocks(css) {
  const blocks = []
  const mediaRe = /@media[^{]*\{/g
  let m
  while ((m = mediaRe.exec(css))) {
    const prelude = m[0].slice(0, -1).trim()
    let depth = 1
    let i = m.index + m[0].length
    while (depth > 0 && i < css.length) {
      if (css[i] === '{') depth++
      else if (css[i] === '}') depth--
      i++
    }
    const body = css.slice(m.index + m[0].length, i - 1)
    blocks.push({ prelude, body })
    mediaRe.lastIndex = i
  }
  return blocks
}

async function setupCreateHwDom({ withScrollableWrapper, targetQnum, missingTarget = false }) {
  const windowCalls = []
  const wrapper = createFakeElement({
    id: 'interactive-creator-wrapper',
    classes: ['interactive-creator-wrapper'],
    rectTop: 200,
    scrollTop: 0,
    scrollHeight: 3000,
    clientHeight: 600,
    overflowY: withScrollableWrapper ? 'auto' : 'visible',
  })
  const previewContainer = createFakeElement({
    id: 'interactive-preview-container',
    parent: wrapper,
    rectTop: 220,
    scrollHeight: 3000,
    clientHeight: 500,
    overflowY: 'visible',
  })
  const card = createFakeElement({
    id: 'interactive-q-card',
    attrs: { 'data-qnum': String(targetQnum) },
    parent: previewContainer,
    rectTop: 900,
    scrollHeight: 1200,
    clientHeight: 400,
  })

  const cells = [
    createFakeElement({
      id: 'hw-map-cell',
      classes: ['hw-map-cell'],
      attrs: { 'data-qnum': String(targetQnum) },
      rectTop: 150,
    }),
  ]

  const mapEl = createFakeElement({ id: 'hw-question-map', classes: ['card'] })
  mapEl.querySelectorAll = (sel) => (sel === '.hw-map-cell' ? cells : [])

  const documentMock = {
    documentElement: { dataset: {}, style: {}, id: 'html' },
    body: createFakeElement({ id: 'body' }),
    addEventListener: () => {},
    dispatchEvent: () => {},
    querySelector: (sel) => {
      if (typeof sel !== 'string' || !sel.includes('interactive-q-card')) return null
      if (missingTarget) return null
      const match = sel.match(/data-qnum="(\d+)"/)
      if (!match || String(match[1]) !== String(card.attrs['data-qnum'])) return null
      return card
    },
    querySelectorAll: (sel) => {
      if (sel === '.hw-map-cell') return cells
      if (sel === '.assign-student-cb:checked') return []
      return []
    },
    getElementById: (id) => (id === 'hw-question-map' ? mapEl : null),
  }

  const windowMock = {
    location: { hash: '#create-homework', search: '' },
    addEventListener: () => {},
    matchMedia: () => ({ matches: false }),
    pageYOffset: 0,
    scrollTo: (options) => { windowCalls.push(options) },
    innerWidth: 1280,
    getComputedStyle: (el) => ({ overflowY: (el && el.style && el.style.overflowY) || 'visible' }),
  }

  const storage = {
    getItem: () => null,
    setItem: () => {},
    removeItem: () => {},
    clear: () => {},
  }

  globalThis.document = documentMock
  globalThis.window = windowMock
  globalThis.localStorage = storage
  globalThis.sessionStorage = storage
  globalThis.CustomEvent = class { constructor(type, options = {}) { this.type = type; this.detail = options.detail } }

  const { state } = await import('../src/js/state.js')
  const { bindCreateHwEvents, resetCreateForm } = await import('../src/js/views/create-hw.js')

  state.token = 'admin-token'
  state.user = { id: 'admin-1', role: 'ADMIN', fullName: 'Thầy Hoàng', username: 'admin' }
  state.classes = [
    { id: 'class-1', name: 'Toán 12 Nâng cao', gradeBlock: '12-Toán', studentsCount: 24 }
  ]
  state.editHomeworkData = null
  resetCreateForm()

  bindCreateHwEvents()

  return { windowCalls, wrapper, card, cells, mapEl }
}

test('ADMIN: bấm ô sơ đồ câu hỏi phải cuộn đúng vùng nội dung (interactive-creator-wrapper) tới câu tương ứng với offset hợp lý', async () => {
  const { windowCalls, wrapper, card, cells } = await setupCreateHwDom({ withScrollableWrapper: true, targetQnum: 3 })
  wrapper.scrollCalls.length = 0
  windowCalls.length = 0

  cells[0].listeners.click({ preventDefault() {} })

  assert.equal(wrapper.scrollCalls.length, 1, 'phải cuộn vào đúng vùng nội dung (wrapper có overflow-y auto)')
  // Câu top=900 nằm trong wrapper top=200, scrollTop=0, offset cuộn = 16 -> top = 900 - 200 - 16 = 684
  assert.deepEqual(wrapper.scrollCalls[0], { top: 684, behavior: 'smooth' })
  assert.equal(windowCalls.length, 0, 'vùng nội dung wrapper đã cuộn -> KHÔN được cuộn window')
  assert.equal(card.style.outline, '2px solid #0066cc', 'thẻ câu tương ứng phải được highlight tạm thời')
})

test('ADMIN: nav câu hỏi không có câu tương ứng phải an toàn, không cuộn và không crash', async () => {
  const { windowCalls, wrapper, cells } = await setupCreateHwDom({ withScrollableWrapper: true, targetQnum: 99, missingTarget: true })
  wrapper.scrollCalls.length = 0
  windowCalls.length = 0

  cells[0].listeners.click({ preventDefault() {} })

  assert.equal(wrapper.scrollCalls.length, 0, 'nav thiếu target không được cuộn')
  assert.equal(windowCalls.length, 0, 'nav thiếu target không được cuộn window')
})

test('ADMIN: khi không có vùng cuộn nội dung thật (wrapper không scrollable) thì fallback cuộn window an toàn', async () => {
  const { windowCalls, wrapper, card, cells } = await setupCreateHwDom({ withScrollableWrapper: false, targetQnum: 3 })
  wrapper.scrollCalls.length = 0
  windowCalls.length = 0
  card.style.outline = ''

  cells[0].listeners.click({ preventDefault() {} })

  assert.equal(wrapper.scrollCalls.length, 0, 'wrapper không scrollable -> KHÔN cuộn trực tiếp wrapper')
  assert.equal(windowCalls.length, 1, 'fallback phải cuộn qua window khi không tìm thấy vùng cuộn nội dung')
  // Fallback: top = card.top(900) + window.pageYOffset(0) - offset(16) = 884
  assert.deepEqual(windowCalls[0], { top: 884, behavior: 'smooth' })
  assert.equal(card.style.outline, '2px solid #0066cc', 'fallback vẫn highlight câu tương ứng')
})

test('ADMIN: layout xếp chồng 1025–1200px phải cuộn theo trang thay vì bị khung desktop cắt', () => {
  const css = readFileSync(new URL('../src/css/admin-pro/pages/homework.css', import.meta.url), 'utf8')
  const mediaBlocks = extractMediaBlocks(css)
  const desktopFixBlocks = mediaBlocks.filter(b => b.prelude === '@media (min-width: 1025px) and (max-width: 1200px)')
  assert.ok(desktopFixBlocks.length >= 1, '@media (min-width: 1025px) and (max-width: 1200px) phải tồn tại')
  const fixBlock = desktopFixBlocks.find(b => b.body.includes('.ap-create-homework'))
  assert.ok(fixBlock, 'block media trên phải scope qua .ap-create-homework')

  assert.match(fixBlock.body, /\.content-body\s*\{\s*overflow:\s*visible\s*!important/, 'khung trang không được cắt nội dung')
  assert.match(fixBlock.body, /\.split-homework-layout\s*\{\s*height:\s*auto\s*!important/, 'grid xếp chồng không được cố định chiều cao')

  // Không được revert block responsive <=1200 hiện có của người dùng (vẫn giữ overflow visible).
  const max1200Block = mediaBlocks.find(b => b.prelude === '@media (max-width: 1200px)')
  assert.ok(max1200Block, '@media (max-width: 1200px) phải tồn tại')
  assert.match(max1200Block.body, /ap-create-homework[\s\S]*overflow:\s*visible/, 'giữ vùng câu hỏi overflow visible khi xếp chồng')
})

test('ADMIN: layout desktop >1200px phải giới hạn cột trái và cuộn danh sách câu bên trong', () => {
  const css = readFileSync(new URL('../src/css/admin-pro/pages/homework.css', import.meta.url), 'utf8')
  const desktop = extractMediaBlocks(css).find(b => b.prelude === '@media (min-width: 1201px)')
  assert.ok(desktop, 'cần rule riêng cho layout desktop hai cột')
  assert.match(desktop.body, /\.split-homework-layout\s*\{\s*align-items:\s*stretch\s*!important/, 'hai cột phải có chiều cao của grid')
  assert.match(desktop.body, /#create-hw-left-pane\s*\{[^}]*overflow:\s*hidden\s*!important/, 'cột trái không được tràn ra ngoài khung trang')
  assert.match(desktop.body, /#create-hw-left-pane \.interactive-creator-wrapper\s*\{[^}]*min-height:\s*0;[^}]*overflow-y:\s*auto\s*!important/, 'danh sách câu phải là vùng cuộn độc lập')
})

test('ADMIN: CSS #create-homework không được phá responsive stacked <=1024 cho phạm vi admin-pro create-homework', () => {
  const css = readFileSync(new URL('../src/css/theme-admin-editor.css', import.meta.url), 'utf8')
  const max1024Blocks = extractMediaBlocks(css).filter(b => b.prelude === '@media (max-width: 1024px)')
  assert.ok(max1024Blocks.length >= 1, '@media (max-width: 1024px) phải tồn tại')
  const stacked = max1024Blocks.find(b => b.body.includes('.split-homework-layout'))
  assert.ok(stacked, 'block max-width:1024 phải giữ nguyên rule stacked cho create-homework')
  assert.match(stacked.body, /\.split-homework-layout\s*\{[\s\S]*?height:\s*auto\s*!important/, 'block max-width:1024 stacked phải set height auto cho create-homework')
})
