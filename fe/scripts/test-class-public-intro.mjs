import test from 'node:test'
import assert from 'node:assert/strict'

const storage = new Map()
globalThis.localStorage = {
  getItem: key => storage.get(key) ?? null,
  setItem: (key, value) => storage.set(key, String(value)),
  removeItem: key => storage.delete(key)
}
globalThis.sessionStorage = globalThis.localStorage
globalThis.window = globalThis
globalThis.addEventListener = () => {}
globalThis.removeEventListener = () => {}
globalThis.CustomEvent = class { constructor(type, options = {}) { this.type = type; this.detail = options.detail } }
globalThis.document = {
  head: null,
  documentElement: { dataset: {}, style: {} },
  addEventListener: () => {},
  dispatchEvent: () => {},
  querySelector: () => null,
  querySelectorAll: () => [],
  getElementById: () => null
}

const { renderClassPublicIntroCard, validatePublicIntroDraft } = await import('../src/js/views/class-public-intro.js')

const validDraft = (overrides = {}) => ({
  publicListed: true,
  schedule: [{ day: 1, start: '19:00', end: '20:30' }],
  maxStudentsRaw: '12',
  ...overrides
})

test('validatePublicIntroDraft chuẩn hóa dữ liệu hợp lệ và sĩ số rỗng thành null', () => {
  assert.deepEqual(validatePublicIntroDraft(validDraft({ maxStudentsRaw: '' })), {
    ok: true,
    value: {
      publicListed: true,
      schedule: [{ day: 1, start: '19:00', end: '20:30' }],
      maxStudents: null
    }
  })
})

test('validatePublicIntroDraft từ chối giờ sai và giờ bắt đầu không trước giờ kết thúc', () => {
  assert.equal(validatePublicIntroDraft(validDraft({ schedule: [{ day: 1, start: '24:00', end: '25:00' }] })).ok, false)
  assert.equal(validatePublicIntroDraft(validDraft({ schedule: [{ day: 1, start: '20:00', end: '20:00' }] })).ok, false)
  assert.equal(validatePublicIntroDraft(validDraft({ schedule: [{ day: 1, start: '21:00', end: '20:00' }] })).ok, false)
})

test('validatePublicIntroDraft từ chối thứ ngoài 1..7', () => {
  assert.equal(validatePublicIntroDraft(validDraft({ schedule: [{ day: 0, start: '08:00', end: '09:00' }] })).ok, false)
  assert.equal(validatePublicIntroDraft(validDraft({ schedule: [{ day: 8, start: '08:00', end: '09:00' }] })).ok, false)
})

test('validatePublicIntroDraft từ chối khung giờ trùng day/start và quá 7 khung', () => {
  const duplicate = [
    { day: 2, start: '08:00', end: '09:00' },
    { day: 2, start: '08:00', end: '10:00' }
  ]
  assert.equal(validatePublicIntroDraft(validDraft({ schedule: duplicate })).ok, false)

  const eightSlots = Array.from({ length: 8 }, (_, index) => ({ day: (index % 7) + 1, start: '08:00', end: '09:00' }))
  assert.equal(validatePublicIntroDraft(validDraft({ schedule: eightSlots })).ok, false)
})

test('validatePublicIntroDraft giới hạn sĩ số trong 1..500', () => {
  assert.equal(validatePublicIntroDraft(validDraft({ maxStudentsRaw: '0' })).ok, false)
  assert.equal(validatePublicIntroDraft(validDraft({ maxStudentsRaw: '501' })).ok, false)
  assert.equal(validatePublicIntroDraft(validDraft({ maxStudentsRaw: '500' })).ok, true)
})

test('renderClassPublicIntroCard escape dữ liệu động', () => {
  const html = renderClassPublicIntroCard({
    publicListed: true,
    publicSchedule: [{ day: 1, start: '"><script>alert(1)</script>', end: '"><img src=x onerror=alert(1)>' }],
    maxStudents: '"><svg onload=alert(1)>'
  })

  assert.doesNotMatch(html, /<script>/)
  assert.doesNotMatch(html, /<img src=/)
  assert.doesNotMatch(html, /<svg onload=/)
  assert.match(html, /&lt;script&gt;alert\(1\)&lt;\/script&gt;/)
  assert.match(html, /&lt;svg onload=alert\(1\)&gt;/)
})
