// Focused, offline tests. No real auth, databases, exams, or Meet visits.
// Run: node --test scripts/test-weekly-calendar.mjs (in fe/).
import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { transform } from 'esbuild'
import vm from 'node:vm'
import * as calendar from '../src/js/utils/weekly-calendar.js'

const source = path => readFileSync(new URL(path, import.meta.url), 'utf8')
const A = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'
const B = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb'
const C = 'cccccccc-cccc-4ccc-8ccc-cccccccccccc'
const MISSING = 'dddddddd-dddd-4ddd-8ddd-dddddddddddd'
const S = 'student-self'
const weekStart = '2026-10-26'
const self = { id: S, role: 'STUDENT', classIds: [A, B], classId: C }
const admin = { id: 'admin-fixture', role: 'ADMIN', classIds: [] }
const classes = [{ id: A, name: 'Lớp A' }, { id: B, name: 'Lớp B' }, { id: C, name: 'Lớp C' }]
const lesson = (id, classId) => ({ id, title: `Bài ${id}`, chapters: { class_id: classId } })
const hw = (id, classId, deadline, is_published = true) => ({
  id, title: `Bài tập ${id}`, deadline, is_published, lessons: lesson(`l-${classId}`, classId),
  pdf_path: 'must-not-leak', pass_score: 99,
})
const fixtures = () => ({
  classes,
  homeworks: [
    hw('common', A, '2026-10-25T17:00:00Z'), // Monday exactly in Vietnam
    hw('self', A, '2026-10-29T10:00:00Z'),
    hw('other', A, '2026-10-29T10:00:00Z'),
    hw('second-class', B, '2026-11-01T16:59:59.999Z'), // Sunday last millisecond
    hw('cross-class', C, '2026-10-28T08:00:00Z'),
    hw('draft', A, '2026-10-27T08:00:00Z', false),
    hw('before', A, '2026-10-25T16:59:59.999Z'),
    hw('after', A, '2026-11-01T17:00:00Z'), // next Monday, excluded
  ],
  homework_targets: [
    { homework_id: 'self', student_id: S },
    { homework_id: 'other', student_id: 'someone-else' },
    { homework_id: 'cross-class', student_id: S },
    { homework_id: 'draft', student_id: S },
  ],
  class_sessions: [
    { id: 'sa', class_id: A, session_date: '2026-10-26', fee_per_session: 999, note: 'private' },
    { id: 'sb', class_id: B, session_date: '2026-11-01' },
    { id: 'sc', class_id: C, session_date: '2026-10-28' },
    { id: 'past', class_id: A, session_date: '2026-10-25' },
    { id: 'future', class_id: A, session_date: '2026-11-02' },
  ],
  meeting_sessions: [
    { id: 'ma', lesson_id: 'la', meeting_uri: 'https://meet.google.com/aaa-bbbb-ccc?authuser=0', created_at: '2026-10-27T04:00:00Z', lessons: lesson('la', A) },
    { id: 'ma-old', lesson_id: 'la', meeting_uri: 'https://meet.google.com/ddd-eeee-fff', created_at: '2026-10-20T04:00:00Z', lessons: lesson('la', A) },
    { id: 'mb', lesson_id: 'lb', meeting_uri: 'javascript:alert(1)', created_at: '2020-01-01T00:00:00Z', lessons: lesson('lb', B) },
    { id: 'mc', lesson_id: 'lc', meeting_uri: 'https://meet.google.com/xxx-yyyy-zzz', created_at: '2026-10-29T04:00:00Z', lessons: lesson('lc', C) },
    { id: 'orphan', lesson_id: null, meeting_uri: 'https://meet.google.com/xxx-yyyy-zzz', created_at: '2026-10-29T04:00:00Z', lessons: null },
  ],
})

// Execute the actual TS handler with mocked requireAuth and a filter-aware DB.
// Every request uses the production handler, not a mirrored authorization function.
const backendSource = source('../../supabase/functions/weekly-calendar/index.ts')
const backendCode = (await transform(backendSource.replace(/^import .+\n/gm, ''), {
  loader: 'ts', format: 'iife', target: 'es2022',
})).code

function backend(user = self, overrides = {}) {
  const tables = { ...fixtures(), ...overrides.tables }
  const calls = []
  const get = (row, path) => path.split('.').reduce((value, key) => value?.[key], row)
  const db = {
    from(table) {
      const call = { table, filters: [], sorts: [], selection: '', limit: null }
      calls.push(call)
      const chain = {
        select(selection) { call.selection = selection; return chain },
        eq(key, value) { call.filters.push(['eq', key, value]); return chain },
        in(key, value) { call.filters.push(['in', key, value]); return chain },
        gte(key, value) { call.filters.push(['gte', key, value]); return chain },
        lt(key, value) { call.filters.push(['lt', key, value]); return chain },
        order(key, options = {}) { call.sorts.push([key, options.ascending !== false]); return chain },
        limit(value) { call.limit = value; return chain },
        then(resolve, reject) {
          try {
            if (overrides.errorTable === table ||
                (overrides.targetError && call.selection.includes('homework_targets!inner'))) {
              return Promise.resolve({ data: null, error: { message: 'raw DB secret', code: '42P01' } }).then(resolve, reject)
            }
            let rows = [...(tables[table] || [])]
            if (call.selection.includes('lessons!inner')) rows = rows.filter(row => row.lessons?.chapters)
            if (call.selection.includes('homework_targets!inner')) {
              rows = rows.filter(row => tables.homework_targets.some(target => target.homework_id === row.id))
            }
            for (const [op, key, expected] of call.filters) {
              rows = rows.filter(row => {
                const actual = get(row, key)
                const a = key === 'deadline' ? Date.parse(actual) : actual
                const b = key === 'deadline' ? Date.parse(expected) : expected
                return op === 'eq' ? actual === expected : op === 'in' ? expected.includes(actual) :
                  op === 'gte' ? a >= b : a < b
              })
            }
            for (const [key, ascending] of [...call.sorts].reverse()) {
              rows.sort((a, b) => String(get(a, key)).localeCompare(String(get(b, key))) * (ascending ? 1 : -1))
            }
            rows = rows.slice(0, call.limit)
            if (table === 'classes') rows = rows.map(({ id, name }) => ({ id, name }))
            return Promise.resolve({ data: rows, error: null }).then(resolve, reject)
          } catch (error) { return Promise.reject(error).then(resolve, reject) }
        },
      }
      return chain
    },
  }
  let handler
  vm.runInNewContext(backendCode, {
    Request, Response, URL, Date, Intl, console,
    serve: callback => { handler = callback },
    requireAuth: async req => {
      if (!user || !req.headers.get('Authorization')) throw new Error('bad auth')
      return { user, serviceRoleClient: db }
    },
    handleCors: req => req.method === 'OPTIONS' ? new Response('ok') : null,
    jsonResponse: data => new Response(JSON.stringify({ success: true, data }), { headers: { 'Content-Type': 'application/json' } }),
    errorResponse: (error, status) => new Response(JSON.stringify({ success: false, error }), { status }),
  })
  return {
    calls,
    async request(query = `weekStart=${weekStart}`, options = {}) {
      const response = await handler(new Request(`https://fixture.invalid/weekly-calendar?${query}`, {
        headers: { Authorization: 'Bearer fixture-only' }, ...options,
      }))
      const result = await response.json()
      return { response, ...result }
    },
  }
}

test('backend authenticates first; denies unsupported roles and writes', async () => {
  const missing = backend(null)
  assert.equal((await missing.request()).response.status, 401)
  assert.equal(missing.calls.length, 0)
  const invalidRole = backend({ ...self, role: 'TEACHER' })
  assert.equal((await invalidRole.request()).response.status, 403)
  assert.equal(invalidRole.calls.length, 0)
  const writes = backend()
  assert.equal((await writes.request('', { method: 'POST' })).response.status, 405)
  assert.equal(writes.calls.length, 0)
})

test('student enrollment + homework_targets, not user-provided studentId or profile.classId, govern scope', async () => {
  const instance = backend()
  const { data, response } = await instance.request(`weekStart=${weekStart}&studentId=someone-else&role=ADMIN`)
  assert.equal(response.status, 200)
  assert.equal(response.headers.get('Cache-Control'), 'no-store')
  assert.deepEqual(data.classes.map(item => item.id).sort(), [A, B])
  assert.deepEqual(data.events.map(event => event.id).sort(), [
    'deadline-common', 'deadline-self', 'deadline-second-class', 'session-sa', 'session-sb',
  ].sort())
  assert.equal(data.events.find(event => event.id === 'deadline-common').date, '2026-10-26')
  assert.equal(data.events.find(event => event.id === 'deadline-second-class').date, '2026-11-01')
  const raw = JSON.stringify(data)
  assert.ok(instance.calls.filter(call => call.table === 'meeting_sessions').every(call => !call.selection.includes('meeting_uri')))
  for (const forbidden of ['someone-else', S, 'fee_per_session', 'private', 'pdf_path', 'pass_score', 'cross-class', 'xxx-yyyy-zzz']) {
    assert.equal(raw.includes(forbidden), false, forbidden)
  }
  assert.equal(data.weekEnd, '2026-11-02')
  assert.ok(instance.calls.every(call => call.limit > 0 && call.limit <= 501))
  for (const call of instance.calls.filter(call => ['meeting_sessions', 'class_sessions'].includes(call.table) || call.selection.includes('lessons!inner'))) {
    assert.ok(call.filters.some(([op, key, ids]) => op === 'in' && key.endsWith('class_id') && ids.every(id => [A, B].includes(id))))
  }
})

test('student cross-class filters fail before queries; zero enrollment never falls back to legacy classId', async () => {
  const forbidden = backend()
  assert.equal((await forbidden.request(`weekStart=${weekStart}&classId=${C}`)).response.status, 403)
  assert.equal(forbidden.calls.length, 0)
  const empty = backend({ ...self, classIds: [], classId: C })
  const { data } = await empty.request()
  assert.deepEqual(data.classes, [])
  assert.deepEqual(data.events, [])
  assert.deepEqual(data.meetings, [])
  assert.equal(empty.calls.length, 0)
})

test('one-class filters narrow data, while admins may see existing one/all classes', async () => {
  const own = await backend().request(`weekStart=${weekStart}&classId=${A}`)
  assert.ok(own.data.events.every(event => event.classId === A))
  assert.ok(own.data.meetings.every(event => event.classId === A))
  const all = await backend(admin).request()
  assert.equal(all.data.classes.length, 3)
  assert.ok(all.data.events.some(event => event.id === 'deadline-cross-class'))
  assert.ok(all.data.events.some(event => event.id === 'deadline-other'))
  const other = await backend(admin).request(`weekStart=${weekStart}&classId=${C}`)
  assert.ok(other.data.events.length > 0)
  assert.ok(other.data.events.every(event => event.classId === C))
  assert.equal((await backend(admin).request(`weekStart=${weekStart}&classId=${MISSING}`)).response.status, 404)
})

test('seven Vietnam days are half-open, strict, independent of extra range parameters', async () => {
  for (const invalid of ['2026-02-30', '2026-10-27', '2026-2-02', '1999-12-27', 'not-a-date']) {
    assert.equal((await backend().request(`weekStart=${invalid}`)).response.status, 400, invalid)
  }
  assert.equal((await backend().request(`weekStart=${weekStart}&classId=not-uuid`)).response.status, 400)
  const instance = backend()
  const { data } = await instance.request(`weekStart=${weekStart}&end=2099-01-01&days=9999`)
  assert.ok(data.events.every(event => event.date >= weekStart && event.date < '2026-11-02'))
  const query = instance.calls.find(call => call.table === 'homeworks' && call.selection.includes('lessons!inner'))
  assert.ok(query.filters.some(([op, key, value]) => op === 'gte' && key === 'deadline' && value === '2026-10-26T00:00:00+07:00'))
  assert.ok(query.filters.some(([op, key, value]) => op === 'lt' && key === 'deadline' && value === '2026-11-02T00:00:00+07:00'))
  assert.ok(query.filters.some(([op, key, value]) => op === 'eq' && key === 'is_published' && value === true))
})

test('Meet has no fabricated date/session mapping; student retains existing lesson-only access', async () => {
  const { data } = await backend().request()
  assert.deepEqual(data.meetings.map(item => item.lessonId).sort(), ['la', 'lb'])
  assert.ok(data.events.every(event => event.kind !== 'meeting'))
  for (const item of data.meetings) {
    for (const forbidden of ['date', 'at', 'sessionDate', 'created_at', 'meeting_uri', 'url']) assert.equal(forbidden in item, false)
  }
  assert.equal(JSON.stringify(data).includes('meet.google.com'), false)
  const own = await backend(admin).request(`weekStart=${weekStart}&classId=${A}`)
  assert.deepEqual(own.data.meetings.map(item => item.url), ['https://meet.google.com/aaa-bbbb-ccc'])
  const unsafe = await backend(admin).request(`weekStart=${weekStart}&classId=${B}`)
  assert.equal(unsafe.data.meetings[0].url, null)
  assert.ok(unsafe.data.meetings.every(item => !('date' in item)))
})

test('optional missing Meet and empty sessions are honest; target failures fail closed', async () => {
  const result = await backend(self, { errorTable: 'meeting_sessions', tables: { class_sessions: [] } }).request()
  assert.equal(result.response.status, 200)
  assert.equal(result.data.meetingsAvailable, false)
  assert.deepEqual(result.data.meetings, [])
  assert.ok(result.data.warnings.length > 0)
  assert.ok(result.data.events.every(event => event.kind === 'deadline'))
  const targeted = await backend(self, { targetError: true }).request()
  assert.equal(targeted.response.status, 500)
  assert.equal(JSON.stringify(targeted).includes('raw DB secret'), false)
  const failed = await backend(self, { errorTable: 'class_sessions' }).request()
  assert.equal(failed.response.status, 500)
})

test('row overflow is not silently presented as a complete/empty calendar', async () => {
  const homeworks = Array.from({ length: 501 }, (_, index) => hw(`overflow-${index}`, A, '2026-10-28T08:00:00Z'))
  const result = await backend(self, { tables: { homeworks } }).request()
  assert.equal(result.response.status, 413)
  assert.equal(result.data, undefined)
})

test('Vietnam date helpers and week arithmetic do not inherit host DST', () => {
  const previous = process.env.TZ
  try {
    for (const zone of ['UTC', 'America/New_York', 'Europe/Berlin', 'Pacific/Auckland']) {
      process.env.TZ = zone
      assert.equal(calendar.calendarLocalDay('2026-10-25T17:00:00Z'), '2026-10-26')
      assert.equal(calendar.calendarLocalDay('2026-11-01T16:59:59Z'), '2026-11-01')
      assert.equal(calendar.calendarTime('2026-11-01T17:00:00Z'), '00:00')
      assert.equal(calendar.calendarWeekStart('2026-11-01'), '2026-10-26')
      assert.equal(calendar.addCalendarDays('2026-10-26', 7), '2026-11-02')
      assert.equal(calendar.addCalendarDays('2026-03-02', 7), '2026-03-09')
    }
  } finally {
    if (previous === undefined) delete process.env.TZ
    else process.env.TZ = previous
  }
  assert.equal(calendar.isCalendarDay('2026-02-30'), false)
  assert.equal(calendar.calendarInstant('2026-11-01T20:30:00'), null)
  assert.equal(calendar.calendarInstant('2026-11-01'), null)
  assert.equal(calendar.calendarInstant('2026-02-30T20:00:00Z'), null)
})

test('ICS exports only dated kinds, correct UTC/all-day bounds, escaping/folding, no Meet metadata', () => {
  const events = [
    { id: 'hw\r\nBAD:injection', kind: 'deadline', at: '2026-11-01T00:30:00+07:00',
      title: '<b>Bài</b> \\ ,;\r\nBEGIN:VEVENT\r\n' + 'Tiếng Việt '.repeat(40), className: 'Lớp A', url: 'https://meet.google.com/aaa-bbbb-ccc' },
    { id: 'sunday', kind: 'class-session', allDay: true, date: '2026-11-01', title: 'Ngày học', className: 'Lớp A' },
    { id: 'meet', kind: 'meeting', at: '2026-10-29T08:00:00Z', url: 'https://meet.google.com/aaa-bbbb-ccc' },
    { id: 'naive', kind: 'deadline', at: '2026-11-01T20:00:00' },
    { id: 'bad', kind: 'class-session', allDay: true, date: '2026-02-30' },
  ]
  const ics = calendar.buildWeeklyCalendarIcs(events, new Date('2026-10-29T00:00:00Z'))
  const unfolded = ics.replace(/\r\n /g, '')
  assert.equal((ics.match(/^BEGIN:VEVENT\r$/gm) || []).length, 2)
  assert.ok(unfolded.includes('DTSTART:20261031T173000Z\r\n'))
  assert.ok(unfolded.includes('DTSTART;VALUE=DATE:20261101\r\nDTEND;VALUE=DATE:20261102\r\n'))
  assert.ok(unfolded.includes('Bài \\\\ \\,\\;\\nBEGIN:VEVENT\\n'))
  assert.equal(ics.includes('meet.google.com'), false)
  assert.equal(ics.includes('<b>'), false)
  assert.equal(/^BAD:/m.test(ics), false)
  assert.ok(ics.endsWith('END:VCALENDAR\r\n'))
  assert.ok(ics.split('\r\n').every(line => Buffer.byteLength(line) <= 75))
})

test('FE rejects cross-class, out-of-week, naive time, duplicated and undated events', () => {
  const event = { id: 'a', kind: 'deadline', classId: A, date: weekStart, at: '2026-10-25T17:00:00Z' }
  const result = calendar.calendarDatedEvents([
    event, event, { ...event, id: 'cross', classId: C }, { ...event, id: 'wrong-day', date: '2026-10-27' },
    { ...event, id: 'outside', at: '2026-11-01T17:00:00Z', date: '2026-11-02' },
    { ...event, id: 'naive', at: '2026-10-26T20:00:00' },
    { ...event, id: 'meeting', kind: 'meeting' },
    { id: 'session', kind: 'class-session', classId: A, date: weekStart, allDay: true },
  ], weekStart, [{ id: A }])
  assert.deepEqual(result.map(item => item.id), ['session', 'a'])
  for (const raw of ['javascript:alert(1)', 'http://meet.google.com/aaa-bbbb-ccc',
    'https://meet.google.com.evil.invalid/aaa-bbbb-ccc', 'https://evil@meet.google.com/aaa-bbbb-ccc',
    'https://meet.google.com:444/aaa-bbbb-ccc', 'https://meet.google.com/landing']) assert.equal(calendar.safeCalendarMeetUrl(raw), null)
  assert.equal(calendar.safeCalendarMeetUrl('https://meet.google.com/aaa-bbbb-ccc?secret=x'), 'https://meet.google.com/aaa-bbbb-ccc')
  assert.ok(calendar.calendarLessonLink({ classId: A, lessonId: 'lesson?&' }, 'STUDENT').startsWith('#my-classes?'))
  assert.equal(calendar.calendarLessonLink({ classId: A }, 'STUDENT').includes('exam-room'), false)
})

function deferred() {
  let resolve, reject
  const promise = new Promise((yes, no) => { resolve = yes; reject = no })
  return { promise, resolve, reject }
}
const settle = () => new Promise(resolve => setImmediate(resolve))

test('loader ignores stale successes/errors, aborts old reads, and rejects inactive routes', async () => {
  const writes = [], errors = []
  let active = true, firstSignal
  const loader = calendar.createCalendarLoader({ isActive: () => active, onLoading() {},
    onData: data => writes.push(data), onError: error => errors.push(error.message) })
  const first = deferred(), second = deferred()
  const old = loader.load(signal => { firstSignal = signal; return first.promise })
  const current = loader.load(() => second.promise)
  assert.equal(firstSignal.aborted, true)
  second.resolve('new')
  await current
  first.reject(new Error('stale error'))
  await old
  assert.deepEqual(writes, ['new'])
  assert.deepEqual(errors, [])
  const last = deferred()
  const pending = loader.load(() => last.promise)
  active = false
  last.resolve('left-route')
  await pending
  assert.deepEqual(writes, ['new'])
  active = true
  const canceled = deferred()
  const awaiting = loader.load(() => canceled.promise)
  loader.cancel()
  canceled.resolve('canceled')
  await awaiting
  assert.deepEqual(writes, ['new'])
})

// Tiny interaction harness: runs the REAL view bindings with DOM/API stubs.
const viewSource = source('../src/js/views/weekly-calendar.js')
function viewHarness(role = 'STUDENT', initialWeek = weekStart) {
  const elements = new Map()
  function element() {
    return { innerHTML: '', textContent: '', value: '', disabled: false, attrs: {}, events: {}, children: [],
      setAttribute(key, value) { this.attrs[key] = value },
      addEventListener(name, callback) { this.events[name] = callback },
      appendChild(child) { this.children.push(child) },
      insertAdjacentHTML(_where, content) { this.innerHTML += content },
      click() { this.clicked = true; this.events.click?.() }, remove() {},
    }
  }
  const root = { isConnected: true, querySelector(selector) {
    if (!elements.has(selector)) elements.set(selector, element())
    return elements.get(selector)
  } }
  const document = { getElementById: id => id === 'weekly-calendar-root' ? root : null,
    createElement: () => element(), body: element() }
  const state = { token: 'fixture-only', user: { ...self, role } }
  const window = { location: { hash: `#weekly-calendar?weekStart=${initialWeek}` },
    history: { replaceState(_state, _title, hash) { window.location.hash = hash } } }
  const requests = [], blobs = []
  const dependencies = { ...calendar, state, document, window, Blob,
    URL: { createObjectURL(blob) { blobs.push(blob); return 'blob:fixture' }, revokeObjectURL() {} },
    setTimeout: callback => callback(),
    renderSidebar: () => '<aside>fixture</aside>', bindSidebarEvents() {}, renderNavbar: () => '<header>fixture</header>',
    escapeHtml: value => String(value ?? '').replace(/[&<>"']/g, char => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#039;' })[char]),
    api: { getWeeklyCalendar(params, options) {
      const pending = deferred()
      requests.push({ ...pending, params, signal: options.signal })
      return pending.promise
    } },
  }
  const stripped = viewSource.replace(/^import[\s\S]*?from ['"][^'"]+['"]\n/gm, '').replace(/^export /gm, '')
  const view = new Function(...Object.keys(dependencies), `${stripped}\nreturn { renderWeeklyCalendarView, bindWeeklyCalendarEvents }`)(...Object.values(dependencies))
  return { ...view, root, state, window, document, requests, blobs, get: id => root.querySelector(`#${id}`) }
}
const payload = (week, extra = {}) => ({ timeZone: calendar.CALENDAR_TIME_ZONE, weekStart: week,
  classes: classes.slice(0, 2), events: [], meetings: [], meetingsAvailable: true, warnings: [], ...extra })

test('view prev/next/class interactions handle loading, stale reads, error/retry and honest empty', async () => {
  const view = viewHarness()
  const html = view.renderWeeklyCalendarView()
  assert.ok(html.includes('aria-live="polite"'))
  assert.ok(html.includes('@media(max-width:1000px)'))
  assert.ok(html.includes('grid-template-columns:1fr'))
  assert.ok(html.includes('<label for="wc-class">'))
  view.bindWeeklyCalendarEvents()
  assert.equal(view.get('wc-export').disabled, true)
  assert.ok(view.get('wc-status').textContent.includes('Đang tải'))
  view.get('wc-next').click()
  assert.equal(view.requests[0].signal.aborted, true)
  assert.equal(view.requests[1].params.weekStart, '2026-11-02')
  view.requests[1].resolve(payload('2026-11-02'))
  await settle()
  assert.ok(view.get('wc-content').innerHTML.includes('Không có ngày học hoặc deadline'))
  const painted = view.get('wc-content').innerHTML
  view.requests[0].resolve(payload(weekStart, { events: [{ id: 'stale' }] }))
  await settle()
  assert.equal(view.get('wc-content').innerHTML, painted)
  view.get('wc-prev').click()
  assert.equal(view.requests[2].params.weekStart, weekStart)
  view.get('wc-class').events.change({ target: { value: A } })
  assert.equal(view.requests[3].params.classId, A)
  view.requests[3].reject(new Error('fixture network error'))
  await settle()
  assert.ok(view.get('wc-status').textContent.includes('fixture network error'))
  assert.equal(view.get('wc-export').disabled, true)
  view.get('wc-retry').click()
  assert.equal(view.requests[4].params.classId, A)
  view.requests[4].resolve(payload(weekStart))
  view.requests[2].resolve(payload(weekStart))
  await settle()
  assert.ok(view.get('wc-meet-content').innerHTML.includes('Chưa có liên kết Meet'))
  assert.ok(view.get('wc-content').innerHTML.includes('không có nghĩa là lớp nghỉ học'))
})

test('view sanitizes content, omits foreign Meet links, exports only loaded dated events without navigation', async () => {
  const view = viewHarness('ADMIN')
  view.bindWeeklyCalendarEvents()
  view.requests[0].resolve(payload(weekStart, {
    events: [{ id: 'hw', kind: 'deadline', title: '<img onerror="bad()">',
      at: '2026-10-26T08:00:00Z', date: weekStart, classId: A, className: 'Lớp A', lessonId: 'la' }],
    meetings: [
      { lessonId: 'la', classId: A, lessonTitle: 'Meet A', url: 'https://meet.google.com/aaa-bbbb-ccc' },
      { lessonId: 'lc', classId: C, lessonTitle: 'secret', url: 'https://meet.google.com/xxx-yyyy-zzz' },
    ],
  }))
  await settle()
  assert.ok(view.get('wc-content').innerHTML.includes('&lt;img'))
  assert.equal(view.get('wc-content').innerHTML.includes('<img'), false)
  assert.equal(view.get('wc-content').innerHTML.includes('meet.google.com'), false)
  assert.ok(view.get('wc-meet-content').innerHTML.includes('aaa-bbbb-ccc'))
  assert.equal(view.get('wc-meet-content').innerHTML.includes('xxx-yyyy-zzz'), false)
  assert.equal(view.get('wc-export').disabled, false)
  const hashBefore = view.window.location.hash
  view.get('wc-export').click()
  assert.equal(view.requests.length, 1)
  assert.equal(view.window.location.hash, hashBefore)
  assert.equal(view.document.body.children[0].href, 'blob:fixture')
  assert.equal(view.document.body.children[0].download, 'eduportal-2026-10-26.ics')
  assert.equal((await view.blobs[0].text()).includes('meet.google.com'), false)
})

test('late responses after account/route switch cannot display data or enable export', async () => {
  const view = viewHarness()
  view.bindWeeklyCalendarEvents()
  view.state.user = { ...view.state.user, id: 'new-account' }
  view.requests[0].resolve(payload(weekStart, { meetings: [{ lessonId: 'la', classId: A }] }))
  await settle()
  assert.equal(view.get('wc-meet-content').innerHTML, '')
  assert.equal(view.get('wc-export').disabled, true)
  const leaving = viewHarness()
  leaving.bindWeeklyCalendarEvents()
  leaving.root.isConnected = false
  leaving.requests[0].reject(new Error('should never paint'))
  await settle()
  assert.equal(leaving.get('wc-status').textContent.includes('should never paint'), false)
})

test('cross-year weeks display both years and stay exactly seven local days', async () => {
  const result = await backend().request('weekStart=2026-12-28')
  assert.equal(result.data.weekStart, '2026-12-28')
  assert.equal(result.data.weekEnd, '2027-01-04')
  const view = viewHarness('STUDENT', '2026-12-28')
  view.bindWeeklyCalendarEvents()
  assert.ok(view.get('wc-range').textContent.includes('2026'))
  assert.ok(view.get('wc-range').textContent.includes('2027'))
  view.requests[0].resolve(payload('2026-12-28'))
  await settle()
  assert.equal((view.get('wc-content').innerHTML.match(/class="wc-day"/g) || []).length, 7)
  const defaultWeek = await backend().request('')
  assert.equal(new Date(`${defaultWeek.data.weekStart}T00:00:00Z`).getUTCDay(), 1)
  assert.equal(Date.parse(defaultWeek.data.weekEnd) - Date.parse(defaultWeek.data.weekStart), 7 * 86400000)
})

test('wiring is wrapper-only, authorized, and does not introduce editing/exam/Meet side effects', () => {
  const apiSource = source('../src/js/api.js')
  const app = source('../src/js/app.js')
  const sidebar = source('../src/js/components/sidebar.js')
  const config = source('../../supabase/config.toml')
  assert.ok(app.includes("'weekly-calendar': { render: renderWeeklyCalendarView, bind: bindWeeklyCalendarEvents }"))
  assert.equal((sidebar.match(/href="#weekly-calendar"/g) || []).length, 2)
  assert.ok(apiSource.includes('request(`weekly-calendar?'))
  assert.ok(config.includes('[functions.weekly-calendar]\nverify_jwt = true'))
  assert.equal(/\.from\(['"]|createClient|exam-room|homework-attempt|window\.open|setClassSessions/.test(viewSource), false)
  assert.equal(/\.from\('(profiles|student_sessions|tuition_transactions)'\)/.test(backendSource), false)
})
