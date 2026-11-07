import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

let importId = 0

async function loadTheme(storedStudentTheme, prefersDark) {
  const saved = new Map()
  if (storedStudentTheme !== undefined) saved.set('eduportal-student-theme', storedStudentTheme)
  const listeners = new Map()
  const root = { dataset: {}, style: {} }
  const pickerButtons = []

  globalThis.localStorage = {
    getItem: key => saved.get(key) ?? null,
    setItem: (key, value) => saved.set(key, String(value)),
    removeItem: key => saved.delete(key)
  }
  globalThis.CustomEvent = class {
    constructor(type, options = {}) { this.type = type; this.detail = options.detail }
  }
  globalThis.document = {
    documentElement: root,
    addEventListener: (type, handler) => listeners.set(`document:${type}`, handler),
    dispatchEvent: event => listeners.get(`document:${event.type}`)?.(event),
    querySelectorAll: selector => selector === '[data-student-theme-option]' ? pickerButtons : []
  }
  globalThis.window = {
    location: { hash: '', search: '' },
    matchMedia: () => ({ matches: prefersDark }),
    addEventListener: (type, handler) => listeners.set(`window:${type}`, handler)
  }

  const theme = await import(`../src/js/theme.js?mochi-test=${++importId}`)
  return { theme, saved, listeners, root, pickerButtons }
}

test('migrate student themes and use system preference for unknown values', async () => {
  const pastel = await loadTheme('pastel', false)
  assert.equal(pastel.theme.getStudentTheme(), 'sakura')
  assert.equal(pastel.saved.get('eduportal-student-theme'), 'sakura')

  const dark = await loadTheme('dark', false)
  assert.equal(dark.theme.getStudentTheme(), 'dark')
  assert.equal(dark.saved.get('eduportal-student-theme'), 'dark')

  const unknownDark = await loadTheme('sepia', true)
  assert.equal(unknownDark.theme.getStudentTheme(), 'dark')
  assert.equal(unknownDark.saved.get('eduportal-student-theme'), 'dark')

  // Chưa từng chọn: giữ navy tối như giao diện cũ, KHÔNG theo prefers-color-scheme
  // (nếu theo OS sáng, giao diện cũ sẽ rơi về palette sáng cũ khi Mochi tắt).
  const missingOsLight = await loadTheme(undefined, false)
  assert.equal(missingOsLight.theme.getStudentTheme(), 'dark')
  assert.equal(missingOsLight.saved.get('eduportal-student-theme'), 'dark')
})

test('giao diện cũ chỉ có navy/hồng: light & mint hiển thị như navy, nút gạt chuyển sang Sakura', async () => {
  for (const stored of ['light', 'mint', 'dark']) {
    const f = await loadTheme(stored, false)
    assert.equal(f.theme.getClassicStudentTheme(), 'dark', stored + ' phải hiển thị navy ở giao diện cũ')
    f.theme.toggleStudentTheme()
    assert.equal(f.theme.getStudentTheme(), 'sakura', stored + ' bấm nút gạt phải sang Sakura')
  }
  const s = await loadTheme('sakura', false)
  assert.equal(s.theme.getClassicStudentTheme(), 'sakura')
  s.theme.toggleStudentTheme()
  assert.equal(s.theme.getStudentTheme(), 'dark')
})

test('selecting a student theme updates storage, document and accessible buttons', async () => {
  const fixture = await loadTheme('dark', false)
  let changes = 0
  fixture.listeners.set('document:eduportal:themechange', () => { changes += 1 })
  for (const value of fixture.theme.STUDENT_THEMES) {
    const attrs = {}
    fixture.pickerButtons.push({
      dataset: { studentThemeOption: value },
      setAttribute: (name, next) => { attrs[name] = next },
      attrs
    })
  }

  assert.equal(fixture.theme.setStudentTheme('mint'), 'mint')
  assert.equal(fixture.saved.get('eduportal-student-theme'), 'mint')
  assert.equal(fixture.root.dataset.studentTheme, 'mint')
  assert.equal(changes, 1)
  assert.deepEqual(fixture.pickerButtons.map(button => button.attrs['aria-pressed']), ['false', 'false', 'false', 'true'])
})

test('Mochi flag defaults off, query parameters persist or disable it', async () => {
  const saved = new Map()
  const root = { dataset: {} }
  globalThis.localStorage = {
    getItem: key => saved.get(key) ?? null,
    setItem: (key, value) => saved.set(key, String(value)),
    removeItem: key => saved.delete(key)
  }
  globalThis.window = { location: { search: '' } }
  globalThis.document = { documentElement: root }
  const flag = await import(`../src/js/ui-flag.js?mochi-test=${++importId}`)

  // Mochi là MẶC ĐỊNH: chưa có lựa chọn nào thì bật.
  assert.equal(flag.isMochiUI(), true)
  assert.equal(root.dataset.ui, undefined)

  window.location.search = '?ui=mochi'
  assert.equal(flag.isMochiUI(), true)
  assert.equal(saved.get('eduportal-ui'), 'mochi')

  root.dataset.ui = 'mochi'
  root.dataset.studentTheme = 'mint'
  assert.equal(flag.syncMochiUI(false), false, 'admin/public route never receives data-ui')
  delete root.dataset.studentTheme
  assert.equal(root.dataset.ui, undefined)
  assert.equal(root.dataset.studentTheme, undefined, 'admin/public route has no student theme attribute')

  // ?ui=classic tắt Mochi và GHI NHỚ lựa chọn (không có tham số vẫn là giao diện cũ).
  window.location.search = '?ui=classic'
  assert.equal(flag.isMochiUI(), false)
  assert.equal(saved.get('eduportal-ui'), 'classic')
  window.location.search = ''
  assert.equal(flag.isMochiUI(), false, 'lựa chọn giao diện cũ được giữ khi mở lại không có tham số')
  window.location.search = '?ui=mochi'
  assert.equal(flag.isMochiUI(), true, '?ui=mochi bật lại Mochi')
})

test('all four palettes expose the same complete token set', () => {
  const css = readFileSync(new URL('../src/css/mochi/tokens.css', import.meta.url), 'utf8')
  const themes = ['light', 'dark', 'sakura', 'mint']
  const sets = themes.map(theme => {
    const block = css.match(new RegExp(`html\\[data-student-theme="${theme}"\\]\\s*\\{([^}]*)\\}`))
    assert.ok(block, `missing ${theme} token block`)
    return new Set([...block[1].matchAll(/(--m-[\w-]+)\s*:/g)].map(match => match[1]))
  })
  const expected = [...sets[0]].sort()
  assert.equal(expected.length, 16, 'palette should contain all 16 prototype colour tokens')
  for (let index = 1; index < sets.length; index += 1) {
    assert.deepEqual([...sets[index]].sort(), expected, `${themes[index]} token set differs`)
  }
})
