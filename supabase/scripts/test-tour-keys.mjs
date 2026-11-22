import assert from 'node:assert/strict'
import { TOUR_KEYS, isValidTourKey } from '../functions/login/tour-keys.ts'

console.log('Running test-tour-keys.mjs...')

// 1. Kiểm tra danh sách TOUR_KEYS
assert.equal(Array.isArray(TOUR_KEYS), true, 'TOUR_KEYS phải là mảng')
assert.equal(TOUR_KEYS.length, 10, 'Phải có đúng 10 tour keys')

// Kiểm tra tính duy nhất (không trùng lặp)
const uniqueKeys = new Set(TOUR_KEYS)
assert.equal(uniqueKeys.size, 10, 'Không được có key trùng lặp')

// 2. Kiểm tra 10 key hợp lệ
const expectedKeys = [
  'student-dashboard',
  'student-lesson',
  'student-myhw',
  'm2-welcome',
  'm2-classes',
  'm2-lesson',
  'm2-homeworks',
  'm2-attendance',
  'm2-history',
  'm2-achievements',
]

for (const key of expectedKeys) {
  assert.equal(TOUR_KEYS.includes(key), true, `TOUR_KEYS phải chứa ${key}`)
  assert.equal(isValidTourKey(key), true, `isValidTourKey("${key}") phải trả về true`)
}
console.log('✓ 10 hợp lệ được chấp nhận')

// 3. Kiểm tra key lạ/không thuộc whitelist bị từ chối
const invalidStringKeys = [
  '',
  '   ',
  'student',
  'dashboard',
  'm2',
  'm2-other',
  'm2-welcome-2',
  'random-tour-key',
  'm2-welcome ',
  ' m2-welcome',
]

for (const key of invalidStringKeys) {
  assert.equal(isValidTourKey(key), false, `isValidTourKey("${key}") phải trả về false`)
}
console.log('✓ Key chuỗi lạ/rỗng bị từ chối')

// 4. Kiểm tra non-string / null / undefined / object / array / boolean / number bị từ chối
const nonStringValues = [
  null,
  undefined,
  0,
  1,
  123,
  NaN,
  true,
  false,
  {},
  { key: 'm2-welcome' },
  [],
  ['m2-welcome'],
  Symbol('m2-welcome'),
  () => 'm2-welcome',
]

for (const val of nonStringValues) {
  assert.equal(isValidTourKey(val), false, `isValidTourKey(${String(val)}) phải trả về false`)
}
console.log('✓ Non-string values bị từ chối')

console.log('ALL TOUR-KEYS TESTS PASSED!')
