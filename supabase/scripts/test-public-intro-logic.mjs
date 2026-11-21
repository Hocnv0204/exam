import assert from 'node:assert/strict'
import {
  isValidScheduleItem,
  normalizeSchedule,
  validatePublicIntroInput,
  mapIntroRows,
} from '../functions/public-intro/logic.ts'

console.log('Running test-public-intro-logic.mjs...')

const validClassId = '11111111-2222-4333-8444-555555555555'

// =========================================================================
// 1. normalizeSchedule & isValidScheduleItem
// =========================================================================
{
  // isValidScheduleItem
  assert.equal(isValidScheduleItem({ day: 1, start: '08:00', end: '09:30' }), true)
  assert.equal(isValidScheduleItem({ day: 7, start: '22:00', end: '23:59' }), true)
  assert.equal(isValidScheduleItem({ day: 0, start: '08:00', end: '09:30' }), false, 'day 0 invalid')
  assert.equal(isValidScheduleItem({ day: 8, start: '08:00', end: '09:30' }), false, 'day 8 invalid')
  assert.equal(isValidScheduleItem({ day: 1.5, start: '08:00', end: '09:30' }), false, 'day float invalid')
  assert.equal(isValidScheduleItem({ day: 2, start: '24:00', end: '25:00' }), false, '24:00 invalid')
  assert.equal(isValidScheduleItem({ day: 2, start: '08:60', end: '09:00' }), false, 'minute 60 invalid')
  assert.equal(isValidScheduleItem({ day: 2, start: '8:00', end: '09:00' }), false, 'single digit hour invalid')
  assert.equal(isValidScheduleItem({ day: 2, start: '10:00', end: '10:00' }), false, 'start == end invalid')
  assert.equal(isValidScheduleItem({ day: 2, start: '11:00', end: '10:00' }), false, 'start > end invalid')
  assert.equal(isValidScheduleItem(null), false)
  assert.equal(isValidScheduleItem('invalid'), false)

  // normalizeSchedule: lọc phần tử sai và sắp xếp theo day rồi start
  const mixed = [
    { day: 5, start: '19:00', end: '20:30' },
    { day: 2, start: '18:00', end: '19:30' },
    { day: 2, start: '08:00', end: '09:30' },
    { day: 0, start: '08:00', end: '09:00' }, // invalid day
    { day: 3, start: '10:00', end: '09:00' }, // start > end
    { day: 6, start: '24:00', end: '25:00' }, // invalid hour
    null,
    'junk',
  ]

  const normalized = normalizeSchedule(mixed)
  assert.equal(normalized.length, 3)
  assert.deepEqual(normalized, [
    { day: 2, start: '08:00', end: '09:30' },
    { day: 2, start: '18:00', end: '19:30' },
    { day: 5, start: '19:00', end: '20:30' },
  ])

  // non-array input
  assert.deepEqual(normalizeSchedule(null), [])
  assert.deepEqual(normalizeSchedule(undefined), [])
  assert.deepEqual(normalizeSchedule('{}'), [])
}
console.log('✓ normalizeSchedule & isValidScheduleItem passed')

// =========================================================================
// 2. validatePublicIntroInput
// =========================================================================
{
  // 2.a Hợp lệ cơ bản
  const ok1 = validatePublicIntroInput({
    classId: validClassId,
    publicListed: true,
    schedule: [
      { day: 4, start: '19:00', end: '20:30' },
      { day: 2, start: '18:00', end: '19:30' },
    ],
    maxStudents: 30,
  })
  assert.equal(ok1.ok, true)
  if (ok1.ok) {
    assert.equal(ok1.value.classId, validClassId)
    assert.equal(ok1.value.publicListed, true)
    assert.equal(ok1.value.maxStudents, 30)
    // Sắp xếp tự động theo day rồi start
    assert.deepEqual(ok1.value.schedule, [
      { day: 2, start: '18:00', end: '19:30' },
      { day: 4, start: '19:00', end: '20:30' },
    ])
  }

  // 2.b maxStudents = null / undefined
  const ok2 = validatePublicIntroInput({
    classId: validClassId,
    publicListed: false,
    schedule: [],
    maxStudents: null,
  })
  assert.equal(ok2.ok, true)
  if (ok2.ok) assert.equal(ok2.value.maxStudents, null)

  const ok3 = validatePublicIntroInput({
    classId: validClassId,
    publicListed: false,
    schedule: [],
  })
  assert.equal(ok3.ok, true)
  if (ok3.ok) assert.equal(ok3.value.maxStudents, null)

  // 2.c maxStudents biên 1 và 500
  const okMin = validatePublicIntroInput({ classId: validClassId, publicListed: true, schedule: [], maxStudents: 1 })
  assert.equal(okMin.ok, true)
  if (okMin.ok) assert.equal(okMin.value.maxStudents, 1)

  const okMax = validatePublicIntroInput({ classId: validClassId, publicListed: true, schedule: [], maxStudents: 500 })
  assert.equal(okMax.ok, true)
  if (okMax.ok) assert.equal(okMax.value.maxStudents, 500)

  // 2.d Schedule đúng 7 phần tử (tối đa cho phép)
  const ok7 = validatePublicIntroInput({
    classId: validClassId,
    publicListed: true,
    schedule: [
      { day: 1, start: '08:00', end: '09:00' },
      { day: 2, start: '08:00', end: '09:00' },
      { day: 3, start: '08:00', end: '09:00' },
      { day: 4, start: '08:00', end: '09:00' },
      { day: 5, start: '08:00', end: '09:00' },
      { day: 6, start: '08:00', end: '09:00' },
      { day: 7, start: '08:00', end: '09:00' },
    ],
    maxStudents: 50,
  })
  assert.equal(ok7.ok, true)
  if (ok7.ok) assert.equal(ok7.value.schedule.length, 7)

  // 2.e Lỗi classId không phải UUID
  const errId = validatePublicIntroInput({ classId: 'not-a-uuid', publicListed: true, schedule: [] })
  assert.equal(errId.ok, false)
  if (!errId.ok) assert.match(errId.error, /classId/i)

  // 2.f Lỗi publicListed không phải boolean
  const errListed = validatePublicIntroInput({ classId: validClassId, publicListed: 'true', schedule: [] })
  assert.equal(errListed.ok, false)
  if (!errListed.ok) assert.match(errListed.error, /publicListed/i)

  // 2.g Lỗi schedule không phải mảng
  const errSchedNotArr = validatePublicIntroInput({ classId: validClassId, publicListed: true, schedule: 'not-array' })
  assert.equal(errSchedNotArr.ok, false)
  if (!errSchedNotArr.ok) assert.match(errSchedNotArr.error, /schedule/i)

  // 2.h Lỗi schedule vượt quá 7 khung giờ
  const errSchedOver = validatePublicIntroInput({
    classId: validClassId,
    publicListed: true,
    schedule: [
      { day: 1, start: '08:00', end: '09:00' },
      { day: 2, start: '08:00', end: '09:00' },
      { day: 3, start: '08:00', end: '09:00' },
      { day: 4, start: '08:00', end: '09:00' },
      { day: 5, start: '08:00', end: '09:00' },
      { day: 6, start: '08:00', end: '09:00' },
      { day: 7, start: '08:00', end: '09:00' },
      { day: 7, start: '10:00', end: '11:00' }, // 8th item
    ],
  })
  assert.equal(errSchedOver.ok, false)
  if (!errSchedOver.ok) assert.match(errSchedOver.error, /7 khung giờ/i)

  // 2.i Lỗi phần tử schedule sai (không lọc im lặng mà báo lỗi)
  // day = 0
  const errDay0 = validatePublicIntroInput({ classId: validClassId, publicListed: true, schedule: [{ day: 0, start: '08:00', end: '09:00' }] })
  assert.equal(errDay0.ok, false)
  if (!errDay0.ok) assert.match(errDay0.error, /day|thứ/i)

  // day = 8
  const errDay8 = validatePublicIntroInput({ classId: validClassId, publicListed: true, schedule: [{ day: 8, start: '08:00', end: '09:00' }] })
  assert.equal(errDay8.ok, false)
  if (!errDay8.ok) assert.match(errDay8.error, /day|thứ/i)

  // giờ bắt đầu sai định dạng (24:00)
  const errTime24 = validatePublicIntroInput({ classId: validClassId, publicListed: true, schedule: [{ day: 2, start: '24:00', end: '25:00' }] })
  assert.equal(errTime24.ok, false)
  if (!errTime24.ok) assert.match(errTime24.error, /bắt đầu/i)

  // start == end
  const errSameTime = validatePublicIntroInput({ classId: validClassId, publicListed: true, schedule: [{ day: 2, start: '10:00', end: '10:00' }] })
  assert.equal(errSameTime.ok, false)
  if (!errSameTime.ok) assert.match(errSameTime.error, /trước/i)

  // start > end
  const errReverseTime = validatePublicIntroInput({ classId: validClassId, publicListed: true, schedule: [{ day: 2, start: '11:00', end: '10:00' }] })
  assert.equal(errReverseTime.ok, false)
  if (!errReverseTime.ok) assert.match(errReverseTime.error, /trước/i)

  // trùng (day, start)
  const errDup = validatePublicIntroInput({
    classId: validClassId,
    publicListed: true,
    schedule: [
      { day: 3, start: '08:00', end: '09:30' },
      { day: 3, start: '08:00', end: '10:00' },
    ],
  })
  assert.equal(errDup.ok, false)
  if (!errDup.ok) assert.match(errDup.error, /trùng/i)

  // 2.j Lỗi maxStudents ngoài khoảng 1..500
  // maxStudents = 0
  const errMax0 = validatePublicIntroInput({ classId: validClassId, publicListed: true, schedule: [], maxStudents: 0 })
  assert.equal(errMax0.ok, false)
  if (!errMax0.ok) assert.match(errMax0.error, /maxStudents|sĩ số/i)

  // maxStudents = 501
  const errMax501 = validatePublicIntroInput({ classId: validClassId, publicListed: true, schedule: [], maxStudents: 501 })
  assert.equal(errMax501.ok, false)
  if (!errMax501.ok) assert.match(errMax501.error, /maxStudents|sĩ số/i)

  // maxStudents = -5
  const errMaxNeg = validatePublicIntroInput({ classId: validClassId, publicListed: true, schedule: [], maxStudents: -5 })
  assert.equal(errMaxNeg.ok, false)
  if (!errMaxNeg.ok) assert.match(errMaxNeg.error, /maxStudents|sĩ số/i)

  // maxStudents = 20.5 (số thực)
  const errMaxFloat = validatePublicIntroInput({ classId: validClassId, publicListed: true, schedule: [], maxStudents: 20.5 })
  assert.equal(errMaxFloat.ok, false)
  if (!errMaxFloat.ok) assert.match(errMaxFloat.error, /maxStudents|sĩ số/i)
}
console.log('✓ validatePublicIntroInput invariants passed')

// =========================================================================
// 3. mapIntroRows
// =========================================================================
{
  const rows = [
    {
      class_id: 'c1',
      name: 'Toán 12 Cơ Bản',
      grade_block: '12-Toán',
      description: 'Lớp ôn thi',
      schedule: [{ day: 2, start: '18:00', end: '19:30' }],
      max_students: 30,
      active_students: 12,
      sessions_held: 5,
    },
    {
      class_id: 'c2',
      name: 'Hóa 11',
      grade_block: '11-Hóa',
      description: null,
      schedule: null, // schedule null -> normalized []
      max_students: null, // maxStudents null -> seatsLeft null
      active_students: 8,
      sessions_held: 0,
    },
    {
      class_id: 'c3',
      name: 'Lớp Đầy Sĩ Số',
      grade_block: '10-Toán',
      description: 'Đã quá sĩ số',
      schedule: [],
      max_students: 10,
      active_students: 15, // active > maxStudents -> seatsLeft = 0 (không âm!)
      sessions_held: 10,
    },
  ]

  const res = mapIntroRows(rows)

  assert.equal(res.totals.classes, 3)
  assert.equal(res.totals.activeStudents, 12 + 8 + 15) // 35

  const c1 = res.classes[0]
  assert.equal(c1.classId, 'c1')
  assert.equal(c1.name, 'Toán 12 Cơ Bản')
  assert.equal(c1.gradeBlock, '12-Toán')
  assert.equal(c1.description, 'Lớp ôn thi')
  assert.deepEqual(c1.schedule, [{ day: 2, start: '18:00', end: '19:30' }])
  assert.equal(c1.maxStudents, 30)
  assert.equal(c1.activeStudents, 12)
  assert.equal(c1.sessionsHeld, 5)
  assert.equal(c1.seatsLeft, 18, '30 - 12 = 18')

  const c2 = res.classes[1]
  assert.equal(c2.maxStudents, null)
  assert.equal(c2.seatsLeft, null, 'Khi maxStudents null thì seatsLeft phải là null')
  assert.deepEqual(c2.schedule, [])

  const c3 = res.classes[2]
  assert.equal(c3.maxStudents, 10)
  assert.equal(c3.activeStudents, 15)
  assert.equal(c3.seatsLeft, 0, 'seatsLeft không được âm khi activeStudents > maxStudents')

  // Rỗng
  const emptyRes = mapIntroRows([])
  assert.equal(emptyRes.totals.classes, 0)
  assert.equal(emptyRes.totals.activeStudents, 0)
  assert.deepEqual(emptyRes.classes, [])
}
console.log('✓ mapIntroRows invariants passed')

console.log('ALL LOGIC TESTS PASSED!')
