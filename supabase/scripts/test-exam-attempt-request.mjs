import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { transformSync } from '../../fe/node_modules/esbuild/lib/main.js'

const source = readFileSync(new URL('../functions/exam-attempt-request/logic.ts', import.meta.url), 'utf8')
const code = transformSync(source, { loader: 'ts', format: 'cjs', target: 'es2022' }).code
const module = { exports: {} }
new Function('module', 'exports', 'require', code)(module, module.exports, () => { throw new Error('No imports expected') })
const { mapRpcError, buildAdminMessage, buildKeyboard, vnDayStart, isUuid } = module.exports

const expected = {
  NOT_AT_LIMIT: [409, 'Bạn vẫn còn lượt làm bài, không cần yêu cầu thêm.'],
  REQUEST_PENDING: [409, 'Bạn đã có một yêu cầu đang chờ duyệt.'],
  REQUEST_DAILY_LIMIT: [429, 'Bạn đã gửi tối đa 3 yêu cầu cho bài thi này hôm nay.'],
  FORBIDDEN: [403, 'Bạn không được giao bài thi này.'],
  INVALID_EXAM: [404, 'Bài thi không tồn tại hoặc chưa mở.'],
}
for (const [code, [status, message]] of Object.entries(expected)) {
  assert.deepEqual(mapRpcError(`RPC exception: ${code}`), { code, status, message })
}
assert.equal(mapRpcError('something else'), null)

const message = buildAdminMessage({
  studentName: '<b>x</b>&', username: '<user>&', className: 'Lớp <A>&', homeworkTitle: '<Thi>&',
  attemptsUsed: 2, allowance: 3, requestedAt: '2026-11-13T00:00:00.000Z',
})
assert.match(message, /&lt;b&gt;x&lt;\/b&gt;&amp;/)
assert.match(message, /07:00 13\/11\/2026 giờ VN/)

const id = '123e4567-e89b-42d3-a456-426614174000'
const keyboard = buildKeyboard(id)
for (const button of keyboard.flat()) assert.ok(Buffer.byteLength(button.callback_data) <= 64)
assert.throws(() => buildKeyboard('x'.repeat(60)), /64-byte/)

assert.equal(vnDayStart(new Date('2026-11-12T16:59:59.000Z')).toISOString(), '2026-11-11T17:00:00.000Z')
assert.equal(vnDayStart(new Date('2026-11-12T17:00:00.000Z')).toISOString(), '2026-11-12T17:00:00.000Z')
assert.equal(isUuid(id), true)
assert.equal(isUuid('not-a-uuid'), false)
assert.equal(isUuid(42), false)

console.log('Exam attempt request logic PASS: RPC mapping, Telegram escaping/keyboard, Vietnam day boundary, UUID validation')
