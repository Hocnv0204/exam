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
globalThis.CustomEvent = class { constructor(type, o = {}) { this.type = type; this.detail = o.detail } }
globalThis.document = {
  head: null,
  documentElement: { dataset: {}, style: {} },
  addEventListener: () => {},
  dispatchEvent: () => {},
  querySelector: () => null,
  querySelectorAll: () => [],
  getElementById: () => null
}

const {
  formatScheduleSlot,
  renderIntroClassCards
} = await import('../src/js/views/mochi/tutor-intro.js')
const { TUTOR_PROFILE } = await import('../src/js/data/tutor-profile.js')

test('formatScheduleSlot định dạng thứ trong tuần và Chủ nhật', () => {
  assert.equal(formatScheduleSlot({ day: 1, start: '19:30', end: '21:00' }), 'Thứ 2 · 19:30–21:00')
  assert.equal(formatScheduleSlot({ day: 6, start: '08:00', end: '09:30' }), 'Thứ 7 · 08:00–09:30')
  assert.equal(formatScheduleSlot({ day: 7, start: '14:00', end: '16:00' }), 'Chủ nhật · 14:00–16:00')
})

test('renderIntroClassCards escape dữ liệu API và hiển thị tổng quan', () => {
  const html = renderIntroClassCards({
    totals: { classes: 1, activeStudents: 4 },
    classes: [{
      name: '<script>alert(1)</script>',
      gradeBlock: 'Hóa 12',
      description: '<img src=x onerror=alert(1)>',
      schedule: [{ day: 1, start: '19:30', end: '21:00' }],
      activeStudents: 4,
      sessionsHeld: 3
    }]
  })

  assert.doesNotMatch(html, /<script>/)
  assert.doesNotMatch(html, /<img src=/)
  assert.match(html, /&lt;script&gt;alert\(1\)&lt;\/script&gt;/)
  assert.match(html, /Thứ 2 · 19:30–21:00/)
  assert.match(html, /<strong>1<\/strong> lớp đang mở/)
  assert.match(html, /Đã học 3 buổi/)
})

test('renderIntroClassCards tính chỗ còn lại và trạng thái đủ sĩ số', () => {
  const seatsLeft = renderIntroClassCards({ classes: [{ name: 'Lớp A', activeStudents: 6, maxStudents: 10 }] })
  assert.match(seatsLeft, /Còn 4 chỗ/)
  assert.match(seatsLeft, /Sĩ số 6\/10/)

  const full = renderIntroClassCards({ classes: [{ name: 'Lớp B', activeStudents: 12, maxStudents: 10 }] })
  assert.match(full, /Đã đủ sĩ số/)
  assert.doesNotMatch(full, /Còn -/)
})

test('renderIntroClassCards dùng lời nhắc liên hệ khi lịch rỗng', () => {
  const html = renderIntroClassCards({ classes: [{ name: 'Lớp chưa xếp lịch', schedule: [] }] })
  assert.match(html, /Lịch học: liên hệ/)
})

test('hồ sơ công khai không chứa thông tin cá nhân bị loại trừ', () => {
  const profileText = JSON.stringify(TUTOR_PROFILE)
  assert.doesNotMatch(profileText, /11\/02\/2004/)
  assert.doesNotMatch(profileText, /Đại Mỗ/)
  assert.doesNotMatch(profileText, /Nam Từ Liêm/)
})
