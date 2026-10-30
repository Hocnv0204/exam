/**
 * test-student-intro-tour.mjs — Tour giới thiệu chỉ auto ở lần đăng nhập đầu tiên.
 *
 * Chạy: node fe/scripts/test-student-intro-tour.mjs
 * Không cần trình duyệt, không gọi API/DB thật.
 *
 * Kiểm tra:
 *  1. Eligibility: chỉ STUDENT + user.autoIntro === true (server cấp) mới auto.
 *  2. One-shot client: reload/mở tab mới trong cùng trình duyệt không mở lại.
 *  3. Timer auto: chỉ 1 timer, huỷ khi đổi route, bỏ qua view stale/guard rời DOM,
 *     không chồng lên tour đang mở, không claim khi chưa thực sự mở.
 *  4. Wiring: chỉ dashboard gọi auto; my-homeworks và lesson tour chỉ mở tay.
 *  5. Kịch bản: tài khoản cũ (seen_tours rỗng), login đầu, login sau, refresh,
 *     manual replay, route khác, mock student không auto.
 */

import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, resolve } from 'node:path'

import {
  isAutoIntroEligible,
  claimAutoIntro,
  scheduleAutoIntroTour,
  cancelScheduledIntro
} from '../src/js/utils/tour.js'

const scriptsDir = dirname(fileURLToPath(import.meta.url))
const feRoot = resolve(scriptsDir, '..')

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

const sleep = (ms) => new Promise(resolve => setTimeout(resolve, ms))

function createMemoryStore(initial = {}) {
  const map = new Map(Object.entries(initial))
  return {
    getItem: key => (map.has(key) ? map.get(key) : null),
    setItem: (key, value) => map.set(key, String(value)),
    removeItem: key => map.delete(key)
  }
}

function makeUser(overrides = {}) {
  return { id: 'student-1', role: 'STUDENT', autoIntro: true, seenTours: [], ...overrides }
}

function scheduledStartSpy() {
  let resolveFn
  const promise = new Promise(resolve => { resolveFn = resolve })
  const calls = []
  return {
    calls,
    promise,
    start: (steps, opts) => {
      calls.push({ steps, opts })
      resolveFn(calls.length)
    }
  }
}

// Fake browser tối thiểu cho scheduler + route change.
const hashListeners = {}
globalThis.window = {
  location: { hash: '#my-classes' },
  addEventListener: (type, fn) => { hashListeners[type] = fn }
}
globalThis.document = { getElementById: () => null }

function setHash(hash) {
  globalThis.window.location.hash = hash
}

function dispatchHashChange() {
  if (typeof hashListeners.hashchange === 'function') hashListeners.hashchange()
}

console.log('\n=== 1. Eligibility matrix ===')
{
  eq('STUDENT + autoIntro true', isAutoIntroEligible(makeUser()), true)
  eq('STUDENT + autoIntro false (login sau)', isAutoIntroEligible(makeUser({ autoIntro: false })), false)
  eq('STUDENT + thiếu autoIntro (mock/demo)', isAutoIntroEligible(makeUser({ autoIntro: undefined })), false)
  eq('STUDENT + autoIntro chuỗi "true" (không hợp lệ)', isAutoIntroEligible(makeUser({ autoIntro: 'true' })), false)
  eq('ADMIN + autoIntro true', isAutoIntroEligible(makeUser({ role: 'ADMIN' })), false)
  eq('TEACHER + autoIntro true', isAutoIntroEligible(makeUser({ role: 'TEACHER' })), false)
  eq('user null', isAutoIntroEligible(null), false)
}

console.log('\n=== 2. One-shot claim + refresh / tab mới ===')
{
  const sessionStore = createMemoryStore()
  const localStore = createMemoryStore()

  const firstLogin = makeUser({ id: 'u-first' })
  eq('login đầu tiên: claim được', claimAutoIntro(firstLogin, { stores: [sessionStore, localStore] }), true)
  eq('cùng phiên: claim lần 2 bị chặn', claimAutoIntro(firstLogin, { stores: [sessionStore, localStore] }), false)

  const refreshSameBrowser = makeUser({ id: 'u-reload' })
  localStore.setItem('edu_auto_intro_consumed_u-reload', '1')
  eq('refresh/tab mới còn localStorage marker: không auto lại', claimAutoIntro(refreshSameBrowser, { stores: [createMemoryStore(), localStore] }), false)

  const newDevice = makeUser({ id: 'u-device-b' })
  eq('thiết bị khác nhưng server trả autoIntro false: không auto', claimAutoIntro({ ...newDevice, autoIntro: false }, { stores: [createMemoryStore(), createMemoryStore()] }), false)

  const oldAccountEmptySeen = makeUser({ id: 'u-old', autoIntro: false, seenTours: [] })
  eq('tài khoản cũ prior-login nhưng seen_tours rỗng: không auto', claimAutoIntro(oldAccountEmptySeen, { stores: [createMemoryStore(), createMemoryStore()] }), false)

  const mockStudent = { id: 's1', role: 'STUDENT', username: 'student' }
  eq('mock student (không có autoIntro): không auto', claimAutoIntro(mockStudent, { stores: [createMemoryStore()] }), false)

  const admin = makeUser({ id: 'u-admin', role: 'ADMIN' })
  eq('admin: không auto', claimAutoIntro(admin, { stores: [createMemoryStore()] }), false)
}

console.log('\n=== 3. Scheduler: một timer, đúng một lần mở ===')
{
  setHash('#my-classes')
  cancelScheduledIntro()
  const spy = scheduledStartSpy()
  const ok = scheduleAutoIntroTour([{ selector: '#tour-latest-hw' }], {
    user: makeUser({ id: 'u-schedule-1' }),
    key: 'student-dashboard',
    hash: '#my-classes',
    delay: 10,
    start: spy.start,
    stores: [createMemoryStore()]
  })
  eq('schedule trả true', ok, true)
  await Promise.race([spy.promise, sleep(120)])
  eq('start được gọi đúng 1 lần', spy.calls.length, 1)
  eq('start nhận key student-dashboard', spy.calls[0]?.opts?.key, 'student-dashboard')
  await sleep(40)
  eq('không mở lặp sau khi timer chạy', spy.calls.length, 1)
}

console.log('\n=== 4. Duplicate bind trước khi timer chạy: chỉ mở 1 lần ===')
{
  setHash('#my-classes')
  cancelScheduledIntro()
  const spy = scheduledStartSpy()
  const opts = {
    user: makeUser({ id: 'u-schedule-2' }),
    hash: '#my-classes',
    delay: 20,
    start: spy.start,
    stores: [createMemoryStore()]
  }
  scheduleAutoIntroTour([], opts)
  scheduleAutoIntroTour([], opts)
  await Promise.race([spy.promise, sleep(120)])
  eq('2 lần bind chỉ mở 1 tour', spy.calls.length, 1)
}

console.log('\n=== 5. Đổi route trước khi timer chạy: huỷ, không claim ===')
{
  const store = createMemoryStore()
  setHash('#my-classes')
  cancelScheduledIntro()
  const spy = scheduledStartSpy()
  scheduleAutoIntroTour([], {
    user: makeUser({ id: 'u-schedule-route' }),
    hash: '#my-classes',
    delay: 40,
    start: spy.start,
    stores: [store]
  })
  setHash('#my-homeworks')
  dispatchHashChange()
  await sleep(100)
  eq('không mở tour sau khi đổi route', spy.calls.length, 0)
  eq('không tiêu thụ marker khi timer bị huỷ', store.getItem('edu_auto_intro_consumed_u-schedule-route'), null)
}

console.log('\n=== 6. Stale async / guard đã rời DOM ===')
{
  setHash('#my-classes')
  cancelScheduledIntro()
  const validSpy = scheduledStartSpy()
  scheduleAutoIntroTour([], {
    user: makeUser({ id: 'u-schedule-valid' }),
    hash: '#my-classes',
    delay: 30,
    start: validSpy.start,
    stores: [createMemoryStore()]
  })

  const staleSpy = scheduledStartSpy()
  const staleScheduled = scheduleAutoIntroTour([], {
    user: makeUser({ id: 'u-schedule-stale' }),
    hash: '#my-classes',
    delay: 5,
    guard: { isConnected: false },
    start: staleSpy.start,
    stores: [createMemoryStore()]
  })
  eq('schedule stale trả false', staleScheduled, false)
  await Promise.race([validSpy.promise, sleep(120)])
  eq('timer hợp lệ không bị stale async huỷ', validSpy.calls.length, 1)
  eq('stale view không mở tour', staleSpy.calls.length, 0)
}

console.log('\n=== 7. Đang có tour mở: không chồng overlay, không claim vô ích ===')
{
  setHash('#my-classes')
  cancelScheduledIntro()
  const store = createMemoryStore()
  const spy = scheduledStartSpy()
  globalThis.document.getElementById = (id) => (id === 'newbie-tour-overlay' ? {} : null)

  scheduleAutoIntroTour([], {
    user: makeUser({ id: 'u-overlay' }),
    hash: '#my-classes',
    delay: 10,
    start: spy.start,
    stores: [store]
  })
  await sleep(80)
  eq('không mở chồng tour đang có', spy.calls.length, 0)
  eq('không claim khi bị chặn bởi overlay', store.getItem('edu_auto_intro_consumed_u-overlay'), null)

  globalThis.document.getElementById = () => null
  cancelScheduledIntro()
  const retrySpy = scheduledStartSpy()
  scheduleAutoIntroTour([], {
    user: makeUser({ id: 'u-overlay' }),
    hash: '#my-classes',
    delay: 10,
    start: retrySpy.start,
    stores: [store]
  })
  await Promise.race([retrySpy.promise, sleep(120)])
  eq('sau khi overlay đóng, lần hẹn sau mở được', retrySpy.calls.length, 1)
}

console.log('\n=== 8. Kịch bản login/refresh/manual qua wiring ===')
{
  const myClasses = readFileSync(resolve(feRoot, 'src/js/views/my-classes.js'), 'utf-8')
  const myHomeworks = readFileSync(resolve(feRoot, 'src/js/views/my-homeworks.js'), 'utf-8')
  const dashboardFnStart = myClasses.indexOf('async function maybeStartDashboardTour')
  const dashboardFn = dashboardFnStart >= 0 ? myClasses.slice(dashboardFnStart) : ''

  check(
    'dashboard auto dùng scheduleAutoIntroTour + user.autoIntro',
    dashboardFn.includes('scheduleAutoIntroTour(dashboardTourSteps(), {') &&
      dashboardFn.includes('user: state.user')
  )
  check(
    'dashboard capture hash + guard trước await import',
    dashboardFn.includes('const boundHash = window.location.hash') &&
      dashboardFn.includes("const guard = document.getElementById('tour-latest-hw')") &&
      dashboardFn.indexOf('const boundHash = window.location.hash') < dashboardFn.indexOf("await import('../utils/tour.js')")
  )
  check('dashboard KHÔNG còn auto dựa trên seen_tours', !myClasses.includes("hasSeenTour('student-dashboard')"))
  check(
    'manual dashboard replay luôn bind, không điều kiện seen_tours',
    myClasses.includes("document.getElementById('btn-replay-tour')?.addEventListener('click', () => startTour(dashboardTourSteps()))")
  )
  check('lesson tour KHÔNG auto', !myClasses.includes("hasSeenTour('student-lesson')") && !myClasses.includes('setTimeout(() => startTour(lessonTourSteps()'))
  check(
    'lesson manual replay vẫn còn',
    myClasses.includes("document.getElementById('btn-replay-lesson-tour')?.addEventListener('click', () => startTour(lessonTourSteps()))")
  )
  check('my-homeworks KHÔNG auto', !myHomeworks.includes('autoStartMyhwTour') && !myHomeworks.includes("hasSeenTour('student-myhw')"))
  check(
    'my-homeworks manual replay vẫn còn',
    myHomeworks.includes("document.getElementById('btn-replay-myhw-tour')?.addEventListener('click', () => startTour(myhwTourSteps()))")
  )
}

console.log('\n========================================')
console.log(`Kết quả: ${passed} passed, ${failed} failed`)
console.log('========================================\n')

if (failed > 0) process.exit(1)
