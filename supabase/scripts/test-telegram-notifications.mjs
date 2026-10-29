import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import vm from 'node:vm'
import { transformSync } from '../../fe/node_modules/esbuild/lib/main.js'
import { homeworkNotificationEvent as event, formatHomeworkNotification, notifyHomeworkTelegram, scheduleHomeworkTelegram } from '../functions/create-homework/telegram-notify.ts'

const published = { id: 'hw', lesson_id: 'lesson-a', title: '<Toán & "Thi">', type: 'EXAM', is_published: true, deadline: '2026-10-29T00:00:00Z' }
assert.equal(event(null, published), 'published')
assert.equal(event(null, { ...published, is_published: false }), null)
assert.equal(event({ is_published: false, deadline: null }, published), 'published')
assert.equal(event(published, { ...published, title: 'edit' }), null)
assert.equal(event(published, { ...published, deadline: '2026-10-29T07:00:00+07:00' }), null)
assert.equal(event(published, { ...published, deadline: null }), 'deadline')
assert.equal(event({ ...published, deadline: null }, { ...published, deadline: '' }), null)
assert.equal(event(published, { ...published, is_published: false, deadline: null }), null)
const text = formatHomeworkNotification(published, '<Lớp A>', 'published', true)
assert.match(text, /&lt;Toán &amp; &quot;Thi&quot;&gt;/)
assert.match(text, /07:00/)
assert.match(text, /Giao cho một số học sinh/)
assert.doesNotMatch(text, /Giao cho lớp/)
assert.match(formatHomeworkNotification({ ...published, deadline: null }, 'A', 'deadline', false), /Không có hạn nộp/)
assert.ok(formatHomeworkNotification({ ...published, title: '"'.repeat(10000) }, '"'.repeat(10000), 'published', false).length <= 4096)

function database(seed = {}, fail = () => false) {
  const tables = structuredClone(seed)
  const calls = []
  let next = 0
  return { tables, calls, from(table) {
    let op = 'select', payload, one = false, cap = Infinity
    const filters = []
    const q = {
      select() { return q }, order() { return q },
      eq(k, v) { filters.push(r => r[k] === v); return q },
      is(k, v) { filters.push(r => (r[k] ?? null) === v); return q },
      in(k, v) { filters.push(r => v.includes(r[k])); return q },
      ilike(k, v) { filters.push(r => r[k].toLowerCase() === v.toLowerCase()); return q },
      limit(n) { cap = n; return q },
      single() { one = true; return q }, maybeSingle() { one = true; return q },
      insert(p) { op = 'insert'; payload = p; return q },
      update(p) { op = 'update'; payload = p; return q },
      upsert(p) { op = 'insert'; payload = p; return q },
      delete() { op = 'delete'; return q },
      then(resolve, reject) {
        calls.push({ table, op, payload })
        if (fail(table, op, payload)) return Promise.resolve({ error: { message: 'mock failure' }, data: null }).then(resolve, reject)
        const rows = tables[table] ||= []
        let matches = rows.filter(r => filters.every(f => f(r)))
        if (op === 'insert') {
          matches = (Array.isArray(payload) ? payload : [payload]).map(p => ({ id: `new-${++next}`, ...p }))
          rows.push(...matches)
        } else if (op === 'update') matches.forEach(r => Object.assign(r, payload))
        else if (op === 'delete') tables[table] = rows.filter(r => !matches.includes(r))
        const data = structuredClone(one ? matches[0] ?? null : matches.slice(0, cap))
        return Promise.resolve({ data, error: one && !data ? { code: 'PGRST116' } : null }).then(resolve, reject)
      },
    }
    return q
  }, async rpc() { return { error: null } } }
}

const routingSeed = {
  lessons: [{ id: 'lesson-a', chapters: { class_id: 'a', classes: { name: 'A' } } }],
  telegram_configs: [
    { class_id: 'a', chat_id: '-1', is_enabled: true },
    { class_id: 'a', chat_id: '-1', is_enabled: true },
    { class_id: 'a', chat_id: '-disabled', is_enabled: false },
    { class_id: 'b', chat_id: '-private-b', is_enabled: true },
  ],
  homework_targets: [{ homework_id: 'hw', student_id: 'private-student' }],
}
const sent = []
const fetcher = async (_url, options) => { sent.push(JSON.parse(options.body)); return { ok: true } }
await notifyHomeworkTelegram(database(routingSeed), published, 'published', { token: 'fake-token', fetcher })
assert.equal(sent.length, 1)
assert.equal(sent[0].chat_id, '-1')
assert.equal(sent[0].parse_mode, 'HTML')
assert.doesNotMatch(sent[0].text, /private-student|private-b|pdf|https:/)
assert.match(sent[0].text, /một số học sinh/)
for (const seed of [{}, { ...routingSeed, telegram_configs: [] }]) {
  await notifyHomeworkTelegram(database(seed), published, 'published', { token: 'fake-token', fetcher })
}
const noToken = database(routingSeed)
await notifyHomeworkTelegram(noToken, published, 'published', { fetcher })
assert.equal(noToken.calls.length, 0)
await notifyHomeworkTelegram(database(routingSeed), { ...published, is_published: false }, 'published', { token: 'fake-token', fetcher })
assert.equal(sent.length, 1)
const warnings = []
const oldWarn = console.warn
console.warn = (...args) => warnings.push(args.join(' '))
try {
  await notifyHomeworkTelegram(database(routingSeed), published, 'deadline', { token: 'secret', fetcher: async () => ({ ok: false, status: 403 }) })
  await notifyHomeworkTelegram(database(routingSeed), published, 'deadline', { token: 'secret', fetcher: async () => { throw Error('https://botsecret') } })
  await notifyHomeworkTelegram(database(routingSeed, t => t === 'lessons'), published, 'deadline', { token: 'secret', fetcher })
} finally { console.warn = oldWarn }
assert.equal(warnings.length, 3)
assert.match(warnings[0], /403/)
assert.doesNotMatch(warnings.join(' '), /secret/)

// The production scheduler registers work, never awaits delivery, and skips unsupported runtimes.
const priorDeno = globalThis.Deno, priorRuntime = globalThis.EdgeRuntime
const tasks = []
try {
  globalThis.Deno = { env: { get: () => 'fake-token' } }
  globalThis.EdgeRuntime = { waitUntil: p => tasks.push(p) }
  scheduleHomeworkTelegram(database({}), published)
  scheduleHomeworkTelegram(database({}), published, published)
  assert.equal(tasks.length, 1)
  await Promise.all(tasks)
  delete globalThis.EdgeRuntime
  scheduleHomeworkTelegram(database({}), published)
} finally {
  if (priorDeno === undefined) delete globalThis.Deno; else globalThis.Deno = priorDeno
  if (priorRuntime === undefined) delete globalThis.EdgeRuntime; else globalThis.EdgeRuntime = priorRuntime
}

// Run the real handler with auth/schema/database/notification boundaries mocked (no network).
const source = readFileSync(new URL('../functions/create-homework/index.ts', import.meta.url), 'utf8')
const compiled = transformSync(source.replace(/^import[\s\S]*?from ['"][^'"]+['"]\s*$/gm, ''), { loader: 'ts', format: 'cjs' }).code
async function request(db, body, action = 'create', method = 'POST') {
  let handler
  const notices = []
  const schema = { safeParse: data => ({ success: true, data }) }
  vm.runInNewContext(compiled, {
    serve: fn => { handler = fn }, URL, console, Date,
    requireAuth: async () => ({ user: { role: 'ADMIN' }, serviceRoleClient: db }),
    handleCors: () => null, jsonResponse: (data, status = 200) => ({ data, status }),
    errorResponse: (message, status) => ({ message, status }),
    createHomeworkSchema: schema, updateHomeworkSchema: schema,
    scheduleHomeworkTelegram: (_db, hw, prev = null) => { const kind = event(prev, hw); if (kind) notices.push({ id: hw.id, lesson_id: hw.lesson_id, kind }) },
  })
  const response = await handler({ method, url: `https://mock/create-homework?action=${action}`, json: async () => body })
  return { response, notices }
}
for (const isPublished of [true, false]) {
  const result = await request(database({}), { lessonId: 'lesson-a', title: 'New', questions: [], isPublished })
  assert.equal(result.response.status, 201)
  assert.equal(result.notices.length, isPublished ? 1 : 0)
}
for (const failedTable of ['homeworks', 'homework_targets', 'questions', 'question_answers']) {
  const result = await request(database({}, (t, op) => t === failedTable && op === 'insert'), { lessonId: 'lesson-a', title: 'New', questions: [], isPublished: true, assignedStudentIds: ['s'] })
  assert.equal(result.response.status, 500, failedTable)
  assert.equal(result.notices.length, 0, failedTable)
}
for (const [before, patch, expected] of [
  [false, { isPublished: true, deadline: null }, 'published'],
  [true, { deadline: null }, 'deadline'],
  [true, { deadline: '2026-10-29T07:00:00+07:00' }, null],
  [true, { title: 'Rename' }, null],
  [false, { deadline: null }, null],
  [true, { isPublished: false, deadline: null }, null],
]) {
  const db = database({ homeworks: [{ ...published, is_published: before, updated_at: 'old' }] })
  const result = await request(db, { homeworkId: 'hw', ...patch }, 'update', 'PATCH')
  assert.equal(result.response.status, 200)
  assert.equal(result.notices[0]?.kind ?? null, expected)
  const retry = await request(db, { homeworkId: 'hw', ...patch }, 'update', 'PATCH')
  assert.equal(retry.notices.length, 0, 'same-value retries do not notify')
}
for (const failedTable of ['homeworks', 'homework_targets', 'questions', 'question_answers']) {
  const db = database({ homeworks: [{ ...published, is_published: false }] }, (t, op) => t === failedTable && op !== 'select')
  const result = await request(db, { homeworkId: 'hw', isPublished: true, assignedStudentIds: ['s'], questions: [{ questionNumber: 1 }] }, 'update', 'PATCH')
  assert.equal(result.response.status, 500)
  assert.equal(result.notices.length, 0)
}
let concurrentDb
concurrentDb = database({ homeworks: [{ ...published, is_published: false, updated_at: 'same-millisecond' }] }, (t, op) => {
  if (t === 'homeworks' && op === 'update') concurrentDb.tables.homeworks[0].is_published = true
  return false
})
const raced = await request(concurrentDb, { homeworkId: 'hw', isPublished: true }, 'update', 'PATCH')
assert.equal(raced.response.status, 409)
assert.equal(raced.notices.length, 0, 'concurrent publisher already won')
const cloneSeed = {
  homeworks: [{ ...published, lessons: { title: 'Lesson', chapters: { title: 'Chapter' } } }],
  questions: [{ id: 'q', homework_id: 'hw', question_number: 1, question_answers: { mc_answer: 'A' } }],
  chapters: [{ id: 'ch-a', class_id: 'a', title: 'Chapter' }, { id: 'ch-b', class_id: 'b', title: 'Chapter' }],
  lessons: [{ id: 'lesson-a', chapter_id: 'ch-a', title: 'Lesson' }, { id: 'lesson-b', chapter_id: 'ch-b', title: 'Lesson' }],
}
let answers = 0
const cloned = await request(database(cloneSeed, (t, op) => t === 'question_answers' && op === 'insert' && ++answers === 2), { sourceHomeworkId: 'hw', targetClassIds: ['a', 'b'] }, 'assign-to-class')
assert.equal(cloned.response.status, 200)
assert.equal(cloned.response.data.createdHomeworks.length, 1)
assert.equal(cloned.response.data.errors.length, 1)
assert.equal(cloned.notices.length, 1)
assert.equal(cloned.notices[0].lesson_id, 'lesson-a')
const draftClone = await request(database(cloneSeed), { sourceHomeworkId: 'hw', targetClassIds: ['a'], targetLessonId: 'lesson-b', customSettings: { isPublished: false } }, 'assign-to-class')
assert.equal(draftClone.notices.length, 0)
const persistedLessonClone = await request(database(cloneSeed), { sourceHomeworkId: 'hw', targetClassIds: ['a'], targetLessonId: 'lesson-b' }, 'assign-to-class')
assert.equal(persistedLessonClone.notices.length, 1)
assert.equal(persistedLessonClone.notices[0].lesson_id, 'lesson-b', 'route by persisted lesson, never the claimed target class')

// Execute the actual submission-routing code through the config lookup. A student in B
// must never cause homework A to search B, even when A has no Telegram configuration.
const submissionSource = readFileSync(new URL('../functions/submit-homework/index.ts', import.meta.url), 'utf8')
const routing = submissionSource.slice(submissionSource.indexOf('const classIdsToSearch:'), submissionSource.indexOf('if (!tgConfigs || tgConfigs.length === 0) return'))
const routingCode = transformSync(`async function route(serviceRoleClient, classIdOfHomework, homework, user) { ${routing}; return tgConfigs }`, { loader: 'ts' }).code
for (const [knownClass, homework, enrolled] of [
  ['a', {}, { classId: 'b', classIds: ['a', 'b'] }],
  [null, { lesson_id: 'lesson-a' }, { classIds: ['b'] }],
  ['a', {}, null], // guest trial keeps its persisted class route
  [null, {}, { classIds: ['b'] }],
]) {
  const db = database({ ...routingSeed, telegram_configs: [{ class_id: 'b', chat_id: 'private', is_enabled: true }] })
  const context = vm.createContext({})
  vm.runInContext(routingCode, context)
  const result = await context.route(db, knownClass, homework, enrolled)
  assert.ok(!result || result.length === 0, 'no fallback into other enrolled groups')
}
console.log('Telegram notifications PASS: event matrix, HTML/time/bounds, class isolation, dedupe, fail-soft, waitUntil, create/update/retry/write failures, partial clone, submission/trial scoping (all mocked)')
