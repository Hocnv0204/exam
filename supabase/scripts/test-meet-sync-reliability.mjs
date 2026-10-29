/** Offline contract tests: execute the real handler with independent in-memory DB/Google fakes.
 * Run: node --test supabase/scripts/test-meet-sync-reliability.mjs
 * No network, credentials, real classes, or deployment. Node >= 22.13 required.
 */
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { stripTypeScriptTypes } from 'node:module'
import vm from 'node:vm'
import test from 'node:test'

const source = readFileSync(new URL('../functions/meet-sync/index.ts', import.meta.url), 'utf8')
// Replace imports only; all handler, sync, and error handling code is executed unchanged.
const executable = stripTypeScriptTypes(source.replace(/^import\s[\s\S]*?\sfrom\s+'[^']+'\s*$/gm, ''))
const video = 'https://drive.google.com/file/d/fixture/view'
const generated = {
  name: 'conferenceRecords/c1/recordings/r1', state: 'FILE_GENERATED',
  endTime: '2026-10-20T12:00:00Z', driveDestination: { file: 'files/fixture', exportUri: video },
}

function session(overrides = {}) {
  return {
    id: 's1', lesson_id: 'l1', space_name: 'spaces/fixture',
    created_at: new Date().toISOString(), status: 'PENDING', last_error: 'old failure',
    ...overrides,
  }
}

function fixture({ sessions = [session()], lessons = [{ id: 'l1', video_url: null }],
  records = [{ name: 'conferenceRecords/c1' }], recordings = [generated], failures = [],
} = {}) {
  const tables = { meeting_sessions: structuredClone(sessions), lessons: structuredClone(lessons), meeting_recordings: [] }
  const writes = []
  const logs = []
  let handler
  let adminChecks = 0
  let googleCalls = 0
  const db = {
    from(table) {
      assert.ok(table in tables, `Unexpected table: ${table}`)
      const query = { table, action: 'read', values: null, filters: [], single: false, max: Infinity, orders: [] }
      const builder = {
        select() { return builder },
        update(values) { query.action = 'update'; query.values = values; return builder },
        upsert(values, options) {
          assert.equal(options.onConflict, 'recording_name')
          query.action = 'upsert'; query.values = values; return builder
        },
        eq(key, value) { query.filters.push([key, value]); return builder },
        order(key, options) { query.orders.push([key, options]); return builder },
        limit(max) { query.max = max; return builder },
        maybeSingle() { query.single = true; return builder },
        then(resolve, reject) {
          return Promise.resolve().then(() => {
            if (query.action !== 'read') {
              writes.push(structuredClone(query))
              if (query.action === 'update') {
                assert.deepEqual(query.filters.map(([key]) => key), ['id'], 'Updates must target exactly one ID')
              }
            }
            const failure = failures.find((item) => item.remaining !== 0 && item.match(query))
            if (failure) {
              failure.remaining = (failure.remaining ?? 1) - 1
              if (failure.throws) throw new Error(failure.message)
              return { data: null, error: { message: failure.message } }
            }
            if (query.action === 'upsert') {
              const old = tables[table].find((row) => row.recording_name === query.values.recording_name)
              if (old) Object.assign(old, query.values)
              else tables[table].push(structuredClone(query.values))
              return { data: null, error: null }
            }
            let rows = tables[table].filter((row) => query.filters.every(([key, value]) => row[key] === value))
            // Stable sort using the query's primary and secondary ordering.
            for (const [key, options] of [...query.orders].reverse()) {
              rows = rows.toSorted((a, b) => {
                if (a[key] == null || b[key] == null) return a[key] == b[key] ? 0 : (a[key] == null ? -1 : 1)
                return String(a[key]).localeCompare(String(b[key])) * (options.ascending ? 1 : -1)
              })
            }
            rows = rows.slice(0, query.max)
            if (query.action === 'update') {
              // Business invariant: READY can only follow a saved lesson video.
              if (query.values.status === 'READY') {
                for (const row of rows) {
                  if (row.lesson_id) assert.equal(tables.lessons.find((l) => l.id === row.lesson_id)?.video_url, video)
                }
              }
              for (const row of rows) Object.assign(row, query.values)
            }
            return { data: structuredClone(query.single ? rows[0] ?? null : rows), error: null }
          }).then(resolve, reject)
        },
      }
      return builder
    },
  }
  const json = (data, status = 200) => new Response(JSON.stringify(data), { status })
  vm.runInNewContext(executable, {
    serve: (callback) => { handler = callback },
    createServiceRoleClient: () => db,
    requireAdmin: async (req) => {
      adminChecks++
      if (req.headers.get('authorization') !== 'Bearer fake-admin') throw new Error('not admin')
    },
    handleCors: () => null,
    jsonResponse: json,
    errorResponse: (message, status) => json({ error: message }, status),
    Deno: { env: { get: (key) => key === 'CRON_SECRET' ? 'fixture-secret' : undefined } },
    getAccessToken: async () => 'fake-token',
    listConferenceRecordsForSpace: async () => { googleCalls++; return records },
    listRecordings: async () => recordings,
    console: { error: (...args) => logs.push(args.join(' ')), warn: () => {} },
    Date, Response,
    fetch: () => { throw new Error('Network forbidden') },
  })
  return {
    tables, writes, logs,
    get adminChecks() { return adminChecks },
    get googleCalls() { return googleCalls },
    async request({ cron = false, authorized = true, body = { session_id: 's1' }, headers = {}, method = 'POST' } = {}) {
      const response = await handler(new Request('http://fixture/meet-sync', {
        method,
        headers: { ...(cron ? { 'x-cron-secret': 'fixture-secret' } : authorized ? { authorization: 'Bearer fake-admin' } : {}), ...headers },
        ...(method === 'POST' ? { body: JSON.stringify(body) } : {}),
      }))
      return { status: response.status, body: await response.json() }
    },
  }
}

const failWrite = (table, status, message = 'injected DB failure') => ({
  match: (query) => query.table === table && query.action !== 'read' && (!status || query.values.status === status),
  message,
})

test('lesson write failure stays PENDING with last_error; next cron retries successfully without duplicate recordings', async () => {
  const f = fixture({
    failures: [failWrite('lessons')],
    lessons: [{ id: 'l1', video_url: null }, { id: 'other', video_url: 'keep-me' }],
  })
  const failed = await f.request()
  assert.equal(failed.body.errors, 1)
  assert.equal(failed.body.ready, 0)
  assert.equal(f.tables.meeting_sessions[0].status, 'PENDING')
  assert.match(f.tables.meeting_sessions[0].last_error, /lessons video_url update failed/)
  assert.equal(f.tables.lessons[0].video_url, null)
  assert.equal(f.writes.some((q) => q.values.status === 'READY'), false)
  const retry = await f.request({ cron: true })
  assert.deepEqual(retry.body, { checked: 1, ready: 1, expired: 0, errors: 0 })
  assert.equal(f.tables.lessons[0].video_url, video)
  assert.equal(f.tables.meeting_sessions[0].status, 'READY')
  assert.equal(f.tables.meeting_sessions[0].last_error, null)
  assert.equal(f.tables.meeting_recordings.length, 1)
  assert.equal(f.tables.lessons[1].video_url, 'keep-me')
  assert.deepEqual((await f.request({ cron: true })).body, { checked: 0, ready: 0, expired: 0, errors: 0 })
})

test('READY write failure preserves saved video, remains retryable, then succeeds', async () => {
  const f = fixture({ failures: [failWrite('meeting_sessions', 'READY')] })
  assert.equal((await f.request({ cron: true })).body.errors, 1)
  assert.equal(f.tables.lessons[0].video_url, video)
  assert.equal(f.tables.meeting_sessions[0].status, 'PENDING')
  assert.match(f.tables.meeting_sessions[0].last_error, /meeting_sessions update failed/)
  assert.equal((await f.request({ cron: true })).body.ready, 1)
  assert.equal(f.tables.meeting_sessions[0].last_error, null)
})

test('recording upsert failure cannot publish a video or READY', async () => {
  const f = fixture({ failures: [failWrite('meeting_recordings')] })
  assert.equal((await f.request()).body.errors, 1)
  assert.equal(f.tables.lessons[0].video_url, null)
  assert.equal(f.tables.meeting_sessions[0].status, 'PENDING')
  assert.match(f.tables.meeting_sessions[0].last_error, /meeting_recordings upsert failed/)
})

test('missing lesson row is distinct from DB failure and never updates unrelated lesson', async () => {
  const f = fixture({ lessons: [{ id: 'other', video_url: 'keep-me' }] })
  const result = await f.request({ body: { session_id: 's1', lesson_id: 'other' } })
  assert.equal(result.body.errors, 1)
  assert.match(result.body.message, /Lesson not found during video_url update: l1/)
  assert.equal(f.tables.lessons[0].video_url, 'keep-me')
  assert.equal(f.tables.meeting_sessions[0].status, 'PENDING')
})

test('session without lesson can become READY after successful session write', async () => {
  const f = fixture({ sessions: [session({ lesson_id: null })] })
  assert.equal((await f.request()).body.ready, 1)
  assert.equal(f.tables.meeting_sessions[0].status, 'READY')
  assert.equal(f.writes.some((q) => q.table === 'lessons'), false)
})

for (const [name, options, outcome] of [
  ['no conference', { records: [] }, 'PENDING'],
  ['no recordings', { recordings: [] }, 'PENDING'],
  ['processing recording', { recordings: [{ name: 'r-processing', state: 'STARTED' }] }, 'PENDING'],
  ['expiry', { records: [], sessions: [session({ created_at: new Date(Date.now() - 8 * 86400000).toISOString() })] }, 'EXPIRED'],
]) {
  test(`${name}: successful write reports ${outcome} and clears stale error`, async () => {
    const f = fixture(options)
    const result = await f.request()
    assert.equal(result.body.outcome, outcome)
    assert.equal(result.body.errors, 0)
    assert.equal(f.tables.meeting_sessions[0].status, outcome)
    assert.equal(f.tables.meeting_sessions[0].last_error, null)
    assert.ok(f.tables.meeting_sessions[0].last_synced_at)
    assert.equal(f.tables.lessons[0].video_url, null)
  })
  test(`${name}: failed ${outcome} write reports error, not success, and stays PENDING`, async () => {
    const f = fixture({ ...options, failures: [failWrite('meeting_sessions', outcome)] })
    const result = await f.request()
    assert.equal(result.body.errors, 1)
    assert.equal(result.body.expired, 0)
    assert.equal(f.tables.meeting_sessions[0].status, 'PENDING')
    assert.match(f.tables.meeting_sessions[0].last_error, /meeting_sessions update failed/)
  })
}

test('cron continues after sync AND diagnostic write failures; counts each session only once', async () => {
  const f = fixture({
    sessions: [session(), session({ id: 's2', lesson_id: null })],
    failures: [failWrite('lessons'), { ...failWrite('meeting_sessions', 'PENDING', 'diagnostic unavailable'), throws: true }],
  })
  const result = await f.request({ cron: true })
  assert.deepEqual(result.body, { checked: 2, ready: 1, expired: 0, errors: 1 })
  assert.equal(f.tables.meeting_sessions[0].status, 'PENDING')
  assert.equal(f.tables.meeting_sessions[1].status, 'READY')
  assert.match(f.logs.join('\n'), /failed to persist sync error.*diagnostic unavailable/)
})

test('manual response exposes failure to persist last_error', async () => {
  const f = fixture({ failures: [failWrite('lessons'), failWrite('meeting_sessions', 'PENDING')] })
  const result = await f.request()
  assert.equal(result.body.errors, 1)
  assert.match(result.body.message, /failed to persist sync error/)
})

test('correct cron secret bypasses admin; wrong/empty secret cannot bypass admin', async () => {
  const f = fixture({ records: [] })
  assert.equal((await f.request({ cron: true })).status, 200)
  assert.equal(f.adminChecks, 0)
  for (const secret of ['', 'wrong']) {
    assert.equal((await f.request({ authorized: false, headers: { 'x-cron-secret': secret } })).status, 401)
  }
  assert.equal(f.adminChecks, 2)
  assert.equal(f.googleCalls, 1)
  assert.equal((await f.request({ headers: { 'x-cron-secret': 'wrong' } })).status, 200)
  assert.equal(f.adminChecks, 3)
})

test('manual lesson lookup selects latest session; missing session and invalid method do not call Google', async () => {
  const f = fixture({ sessions: [session({ id: 'old', created_at: '2020-01-01' }), session({ id: 'latest' })] })
  const result = await f.request({ body: { lesson_id: 'l1' } })
  assert.equal(result.body.session_id, 'latest')
  assert.equal(f.tables.meeting_sessions.find((s) => s.id === 'old').status, 'PENDING')
  assert.equal((await f.request({ body: { session_id: 'missing' } })).status, 404)
  assert.equal((await f.request({ method: 'GET' })).status, 405)
  assert.equal(f.googleCalls, 1)
})
