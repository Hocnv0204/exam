import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { transformSync } from '../../fe/node_modules/esbuild/lib/main.js'

const source = readFileSync(new URL('../functions/student-notifications/logic.ts', import.meta.url), 'utf8')
const code = transformSync(source, { loader: 'ts', format: 'cjs', target: 'es2022' }).code
const module = { exports: {} }
new Function('module', 'exports', 'require', code)(module, module.exports, () => { throw new Error('No imports expected') })
const { parseListQuery, parseMarkBody, mapNotificationRow } = module.exports

const first = '123e4567-e89b-42d3-a456-426614174000'
const second = '223e4567-e89b-42d3-a456-426614174000'
assert.deepEqual(parseListQuery('https://mock/student-notifications'), { unreadOnly: true, limit: 20 })
assert.deepEqual(parseListQuery('https://mock/student-notifications?unread=0&limit=50'), { unreadOnly: false, limit: 50 })
assert.deepEqual(parseListQuery('https://mock/student-notifications?unread=1&limit=1'), { unreadOnly: true, limit: 1 })
for (const query of ['?unread=', '?unread=true', '?unread=2', '?limit=', '?limit=0', '?limit=51', '?limit=1.5', '?limit=-1']) {
  assert.throws(() => parseListQuery(`https://mock/student-notifications${query}`), /./, query)
}

assert.deepEqual(parseMarkBody({ all: true }), { all: true })
assert.deepEqual(parseMarkBody({ ids: [first, second, first] }), { ids: [first, second] })
assert.deepEqual(parseMarkBody({ ids: Array.from({ length: 51 }, () => first) }), { ids: [first] })
for (const body of [{}, { all: false }, { ids: [] }, { ids: ['not-a-uuid'] }, { ids: Array.from({ length: 51 }, (_, i) => `${String(i).padStart(8, '0')}-e89b-42d3-a456-426614174000`) }]) {
  assert.throws(() => parseMarkBody(body), /./)
}
assert.deepEqual(mapNotificationRow({
  id: first, title: 'Tiêu đề', content: 'Nội dung', type: 'EXAM_ATTEMPT_APPROVED', related_id: second, is_read: false, created_at: '2026-11-14T00:00:00.000Z',
}), {
  id: first, title: 'Tiêu đề', content: 'Nội dung', type: 'EXAM_ATTEMPT_APPROVED', relatedId: second, isRead: false, createdAt: '2026-11-14T00:00:00.000Z',
})

console.log('Student notifications logic PASS: list bounds, mark validation/deduplication, row mapping')
