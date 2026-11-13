import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import vm from 'node:vm'
import { transformSync } from '../../fe/node_modules/esbuild/lib/main.js'

const source = readFileSync(new URL('../functions/telegram-bot/index.ts', import.meta.url), 'utf8')
const code = transformSync(source.replace(/^import .*$/gm, ''), { loader: 'ts', format: 'cjs' }).code

const telegramSharedSource = readFileSync(new URL('../shared/telegram.ts', import.meta.url), 'utf8')
const telegramSharedCode = transformSync(telegramSharedSource, { loader: 'ts', format: 'cjs' }).code
const telegramSharedModule = { exports: {} }
vm.runInNewContext(telegramSharedCode, {
  exports: telegramSharedModule.exports,
  module: telegramSharedModule,
  Deno: { env: { get: () => '' } },
  fetch: () => {},
})
const { parseIdList } = telegramSharedModule.exports

const classId = '123e4567-e89b-42d3-a456-426614174000'

function harness({
  token = 'fake-token',
  username = 'OurBot',
  secret = '',
  adminUserIds = '',
  adminChatId = '-100',
  autoSecretHeader = false,
  rpcHandler = null,
  response = () => ({ ok: true, status: 200, json: async () => ({ ok: true }) }),
} = {}) {
  let handler
  let bodyReadCount = 0
  const sent = [], queries = [], logs = []
  const envMap = {
    TELEGRAM_BOT_TOKEN: token,
    TELEGRAM_BOT_USERNAME: username,
    TELEGRAM_WEBHOOK_SECRET: secret,
    TELEGRAM_ADMIN_USER_IDS: adminUserIds,
    TELEGRAM_ADMIN_CHAT_ID: adminChatId,
  }
  const db = {
    from(table) {
      const query = {
        select() { return query }, order() { return query }, limit() { return query }, eq(...args) { queries.push([table, 'eq', ...args]); return query },
        single() { return Promise.resolve({ data: { id: classId, name: 'Toán' }, error: null }) },
        maybeSingle() { return Promise.resolve({ data: { id: classId, name: 'Toán' }, error: null }) },
        upsert(value) { queries.push([table, 'upsert', value]); return Promise.resolve({ error: null }) },
        then(resolve, reject) { return Promise.resolve({ data: table === 'classes' ? [{ id: classId, name: 'Toán' }] : [], error: null }).then(resolve, reject) },
      }
      return query
    },
    rpc(name, params) {
      queries.push(['rpc', name, params])
      if (rpcHandler) return Promise.resolve(rpcHandler(name, params))
      return Promise.resolve({
        data: {
          success: true,
          alreadyDecided: false,
          requestId: params?.p_request_id,
          status: params?.p_approve ? 'APPROVED' : 'REJECTED',
          decidedAt: '2026-11-13T16:15:00.000Z',
        },
        error: null,
      })
    },
  }
  vm.runInNewContext(code, {
    serve: fn => { handler = fn },
    Deno: { env: { get: key => key in envMap ? envMap[key] : (key === 'TELEGRAM_BOT_TOKEN' ? token : (key === 'TELEGRAM_BOT_USERNAME' ? username : '')) } },
    console: { warn: (...args) => logs.push(args.join(' ')), error: (...args) => logs.push(args.join(' ')) },
    createServiceRoleClient: () => db, handleCors: () => null,
    jsonResponse: (data, status = 200) => ({ data, status }),
    errorResponse: (message, status) => ({ message, status }),
    parseIdList,
    TextEncoder,
    fetch: async (url, options) => {
      assert.ok(url.startsWith('https://api.telegram.org/botfake-token/') || !token)
      const call = { method: url.slice(url.lastIndexOf('/') + 1), body: JSON.parse(options.body) }
      sent.push(call)
      return response(call)
    },
  })
  const request = async (update, headers = {}) => {
    const baseHeaders = (autoSecretHeader && secret) ? { 'x-telegram-bot-api-secret-token': secret } : {}
    const finalHeaders = { ...baseHeaders, ...headers }
    const hMap = new Map(Object.entries(finalHeaders).map(([k, v]) => [k.toLowerCase(), v]))
    return handler({
      method: 'POST',
      headers: {
        get: k => hMap.get(k.toLowerCase()) ?? null,
      },
      json: async () => {
        bodyReadCount++
        return update
      },
    })
  }
  const message = (text, extra = {}) => request({ message: { chat: { id: -123, title: 'Nhóm' }, text, ...extra } })
  const getBodyReadCount = () => bodyReadCount
  return { request, message, getBodyReadCount, sent, queries, logs }
}

const bot = harness()
assert.equal((await bot.message('/start@OurBot')).status, 200)
assert.match(bot.sent.at(-1).body.text, /Chào mừng/)
assert.equal((await bot.message('/link@ourbot')).status, 200)
assert.equal(bot.sent.at(-1).body.reply_markup.inline_keyboard[0][0].callback_data, `link:${classId}`)
assert.equal((await bot.message('/baitap@OURBOT')).status, 200)
assert.equal(bot.sent.at(-1).body.reply_markup.inline_keyboard[0][0].callback_data, `report:${classId}`)
assert.equal((await bot.message('/chuabai@OurBot extra')).status, 200)
assert.match(bot.sent.at(-1).body.text, /chưa liên kết/)
assert.equal((await bot.message('/kiemtra@OurBot')).status, 200)
assert.match(bot.sent.at(-1).body.text, /KIỂM TRA/)
const count = bot.sent.length
await bot.message('/start@OtherBot')
await bot.message('/start@OurBotx')
await bot.message('/start@OurBotjunk')
await bot.message('/startaneous')
await bot.message('hello /start@OurBot')
await bot.message(undefined, { caption: '/start@OurBot' })
assert.equal(bot.sent.length, count, 'ignore other bots, substrings and captions')

await bot.message(`/link@OurBot ${classId}`)
assert.ok(bot.queries.some(q => q[0] === 'telegram_configs' && q[1] === 'upsert' && q[2].class_id === classId))
const writes = bot.queries.filter(q => q[1] === 'upsert').length
await bot.message(`/link@OurBot ${classId} injection`)
assert.equal(bot.queries.filter(q => q[1] === 'upsert').length, writes)
assert.match(bot.sent.at(-1).body.text, /không hợp lệ/)
await bot.request(null)
await bot.request({ message: {} })
await bot.request({ message: { chat: { id: 'not-a-number' }, text: '/start' } })
assert.equal(bot.sent.at(-1).body.text.includes('không hợp lệ'), true)

for (const status of [500, 429, 400, 403]) {
  const failed = harness({ response: () => ({ ok: false, status, json: async () => ({ ok: false, description: 'sensitive payload' }) }) })
  const result = await failed.message('/link@OurBot')
  assert.equal(result.status, status >= 500 || status === 429 ? 503 : 200)
  assert.match(failed.logs.join(' '), new RegExp(String(status)))
  assert.doesNotMatch(JSON.stringify(result) + failed.logs.join(' '), /sensitive|fake-token/)
}
const callbackFailure = harness({ response: call => ({ ok: call.method !== 'answerCallbackQuery', status: call.method === 'answerCallbackQuery' ? 503 : 200, json: async () => ({ ok: call.method !== 'answerCallbackQuery' }) }) })
assert.equal((await callbackFailure.request({ callback_query: { id: 'cb', data: `link:${classId}`, message: { chat: { id: -123 }, message_id: 1 } } })).status, 503)
const keyboardFailure = harness({ response: call => ({ ok: !call.body.reply_markup, status: call.body.reply_markup ? 500 : 200, json: async () => ({ ok: !call.body.reply_markup }) }) })
assert.equal((await keyboardFailure.message('/baitap')).status, 503)
const apiFailure = harness({ response: () => ({ ok: true, status: 200, json: async () => ({ ok: false, error_code: 403, description: 'private text' }) }) })
assert.equal((await apiFailure.message('/start')).status, 200)
assert.match(apiFailure.logs.join(' '), /403/)
assert.doesNotMatch(apiFailure.logs.join(' '), /private text/)
const networkFailure = harness({ response: () => { throw Error('fake-token and private text') } })
assert.equal((await networkFailure.message('/start')).status, 503)
assert.doesNotMatch(networkFailure.logs.join(' '), /fake-token|private text/)
// An explicit empty token simulates an unset secret; no URL containing a token is fetched.
const noToken = harness({ token: '' })
assert.equal((await noToken.message('/start')).status, 503)
assert.equal(noToken.sent.length, 0)

// --- TASK T005 Tests ---
// 1. Webhook secret validation
const secretBot = harness({ secret: 'super-secret-token' })

// Missing secret header -> 401, no body read, no db, no fetch
let resMissing = await secretBot.request({ message: { chat: { id: -123 }, text: '/start' } })
assert.equal(resMissing.status, 401)
assert.equal(secretBot.getBodyReadCount(), 0, 'body must NOT be read when secret is missing')
assert.equal(secretBot.queries.length, 0, 'DB must NOT be called when secret is missing')
assert.equal(secretBot.sent.length, 0, 'fetch must NOT be called when secret is missing')

// Wrong secret header -> 401, no body read, no db, no fetch
let resWrong = await secretBot.request(
  { message: { chat: { id: -123 }, text: '/start' } },
  { 'X-Telegram-Bot-Api-Secret-Token': 'wrong-secret' }
)
assert.equal(resWrong.status, 401)
assert.equal(secretBot.getBodyReadCount(), 0, 'body must NOT be read when secret is wrong')
assert.equal(secretBot.queries.length, 0, 'DB must NOT be called when secret is wrong')
assert.equal(secretBot.sent.length, 0, 'fetch must NOT be called when secret is wrong')

// Different length -> 401, no body read
let resDiffLen = await secretBot.request(
  { message: { chat: { id: -123 }, text: '/start' } },
  { 'X-Telegram-Bot-Api-Secret-Token': 'super-secret' }
)
assert.equal(resDiffLen.status, 401)
assert.equal(secretBot.getBodyReadCount(), 0)

// Correct secret header -> 200, processed
let resOk = await secretBot.request(
  { message: { chat: { id: -123 }, text: '/start' } },
  { 'X-Telegram-Bot-Api-Secret-Token': 'super-secret-token' }
)
assert.equal(resOk.status, 200)
assert.equal(secretBot.getBodyReadCount(), 1)
assert.equal(secretBot.sent.length, 1)

// Unset secret -> warn once (no secret value logged), processed normally
const noSecretBot = harness({ secret: '' })
let resNoSec1 = await noSecretBot.request({ message: { chat: { id: -123 }, text: '/start' } })
assert.equal(resNoSec1.status, 200)
let resNoSec2 = await noSecretBot.request({ message: { chat: { id: -123 }, text: '/start' } })
assert.equal(resNoSec2.status, 200)
const secretWarns = noSecretBot.logs.filter(l => l.includes('TELEGRAM_WEBHOOK_SECRET not set'))
assert.equal(secretWarns.length, 1, 'must warn once when webhook secret is unset')
assert.doesNotMatch(noSecretBot.logs.join(' '), /super-secret-token/)

// 2. Callback ar:ok:<uuid> / ar:no:<uuid>
const validRequestId = '550e8400-e29b-41d4-a716-446655440000'
const attemptSecret = 'ar-webhook-secret-token'
const attemptBot = harness({
  secret: attemptSecret,
  adminUserIds: '111, 222',
  adminChatId: '-100',
  autoSecretHeader: true,
})

// Callback data sai UUID -> answerCallbackQuery "Yêu cầu không hợp lệ"
await attemptBot.request({
  callback_query: {
    id: 'cb-invalid-uuid',
    data: 'ar:ok:not-a-uuid',
    from: { id: 111, first_name: 'Admin' },
    message: { chat: { id: -100 }, message_id: 5, text: 'Tin nhắn' },
  },
})
assert.equal(attemptBot.sent.at(-1).method, 'answerCallbackQuery')
assert.equal(attemptBot.sent.at(-1).body.text, 'Yêu cầu không hợp lệ')
assert.equal(attemptBot.queries.filter(q => q[0] === 'rpc').length, 0, 'RPC must NOT be called on invalid UUID')

// Callback data malformed
await attemptBot.request({
  callback_query: {
    id: 'cb-malformed',
    data: 'ar:invalid:' + validRequestId,
    from: { id: 111, first_name: 'Admin' },
    message: { chat: { id: -100 }, message_id: 5, text: 'Tin nhắn' },
  },
})
assert.equal(attemptBot.sent.at(-1).method, 'answerCallbackQuery')
assert.equal(attemptBot.sent.at(-1).body.text, 'Yêu cầu không hợp lệ')
assert.equal(attemptBot.queries.filter(q => q[0] === 'rpc').length, 0)

// 3. User không trong allow-list -> không gọi RPC, answerCallbackQuery từ chối, dừng
const beforeUnauthSent = attemptBot.sent.length
await attemptBot.request({
  callback_query: {
    id: 'cb-unauth',
    data: `ar:ok:${validRequestId}`,
    from: { id: 999, first_name: 'Stranger' },
    message: { chat: { id: -100 }, message_id: 6, text: 'Tin nhắn' },
  },
})
assert.equal(attemptBot.queries.filter(q => q[0] === 'rpc').length, 0, 'RPC must NOT be called for unauthorized user')
assert.equal(attemptBot.sent.at(-1).method, 'answerCallbackQuery')
assert.equal(attemptBot.sent.at(-1).body.callback_query_id, 'cb-unauth')
assert.equal(attemptBot.sent.at(-1).body.text, 'Bạn không có quyền duyệt yêu cầu này.')
assert.equal(attemptBot.sent.slice(beforeUnauthSent).some(c => c.method === 'editMessageText'), false, 'editMessageText must not be called')

// 4. User hợp lệ bấm ar:ok (duyệt) -> RPC gọi đúng tham số, editMessageText có reply_markup.inline_keyboard rỗng, text gốc được escape
const okMsgText = '🙋 Yêu cầu thêm lượt thi\nHọc sinh: <Bảo> & "An"\nLớp: 10A1\nBài thi: Toán & Lý'
await attemptBot.request({
  callback_query: {
    id: 'cb-approve',
    data: `ar:ok:${validRequestId}`,
    from: { id: 111, first_name: 'Thầy', last_name: 'Nam' },
    message: { chat: { id: -100 }, message_id: 7, text: okMsgText },
  },
})

// Check RPC call params
const rpcApproveCall = attemptBot.queries.find(q => q[0] === 'rpc' && q[1] === 'decide_exam_attempt_request')
assert.ok(rpcApproveCall, 'RPC decide_exam_attempt_request must be called')
assert.equal(rpcApproveCall[2].p_request_id, validRequestId)
assert.equal(rpcApproveCall[2].p_approve, true)
assert.equal(rpcApproveCall[2].p_decider_telegram_id, 111)
assert.equal(rpcApproveCall[2].p_decider_name, 'Thầy Nam')

// Check answerCallbackQuery
const ansApprove = attemptBot.sent.find(c => c.method === 'answerCallbackQuery' && c.body.callback_query_id === 'cb-approve')
assert.ok(ansApprove)
assert.equal(ansApprove.body.text, 'Đã cấp thêm 1 lượt thi.')

// Check editMessageText
const editApprove = attemptBot.sent.find(c => c.method === 'editMessageText' && c.body.message_id === 7)
assert.ok(editApprove)
assert.equal(editApprove.body.chat_id, '-100')
assert.deepEqual(editApprove.body.reply_markup, { inline_keyboard: [] }, 'editMessageText must have empty inline_keyboard')
// Base text must be escaped
assert.ok(editApprove.body.text.includes('&lt;Bảo&gt; &amp; "An"'), 'Original text must be HTML escaped')
assert.ok(editApprove.body.text.includes('Toán &amp; Lý'), 'Original text & must be escaped')
// Decision line appended with Vietnam time
assert.match(editApprove.body.text, /\n\n✅ Đã cấp thêm 1 lượt — Thầy Nam, \d{2}:\d{2} \d{2}\/\d{2}/)

// 5. User hợp lệ bấm ar:no (từ chối)
await attemptBot.request({
  callback_query: {
    id: 'cb-reject',
    data: `ar:no:${validRequestId}`,
    from: { id: 222, username: 'teacher_two' },
    message: { chat: { id: -100 }, message_id: 8, text: '🙋 Yêu cầu thêm lượt thi\nHọc sinh: Bé' },
  },
})

const rpcRejectCall = attemptBot.queries.filter(q => q[0] === 'rpc' && q[1] === 'decide_exam_attempt_request').at(-1)
assert.equal(rpcRejectCall[2].p_approve, false)
assert.equal(rpcRejectCall[2].p_decider_name, 'teacher_two')

const ansReject = attemptBot.sent.find(c => c.method === 'answerCallbackQuery' && c.body.callback_query_id === 'cb-reject')
assert.ok(ansReject)
assert.equal(ansReject.body.text, 'Đã từ chối yêu cầu.')

const editReject = attemptBot.sent.find(c => c.method === 'editMessageText' && c.body.message_id === 8)
assert.ok(editReject)
assert.deepEqual(editReject.body.reply_markup, { inline_keyboard: [] }, 'editMessageText must have empty inline_keyboard')
assert.match(editReject.body.text, /\n\n❌ Đã từ chối — teacher_two, \d{2}:\d{2} \d{2}\/\d{2}/)

// 6. alreadyDecided: idempotent, không lỗi, vẫn bỏ nút
// Ca alreadyDecided APPROVED
const alreadyBotApproved = harness({
  secret: attemptSecret,
  adminUserIds: '111',
  adminChatId: '-100',
  autoSecretHeader: true,
  rpcHandler: () => ({
    data: {
      success: true,
      alreadyDecided: true,
      requestId: validRequestId,
      status: 'APPROVED',
      decidedByName: 'Thầy Cũ',
      decidedAt: '2026-11-13T10:00:00.000Z',
    },
    error: null,
  }),
})

const alreadyResApprove = await alreadyBotApproved.request({
  callback_query: {
    id: 'cb-already-1',
    data: `ar:ok:${validRequestId}`,
    from: { id: 111, first_name: 'Thầy Mới' },
    message: { chat: { id: -100 }, message_id: 9, text: '🙋 Yêu cầu thêm lượt thi' },
  },
})
assert.equal(alreadyResApprove.status, 200)
const ansAlreadyApprove = alreadyBotApproved.sent.find(c => c.method === 'answerCallbackQuery' && c.body.callback_query_id === 'cb-already-1')
assert.equal(ansAlreadyApprove.body.text, 'Yêu cầu đã được xử lý trước đó (đã cấp lượt).')
const editAlreadyApprove = alreadyBotApproved.sent.find(c => c.method === 'editMessageText' && c.body.message_id === 9)
assert.ok(editAlreadyApprove)
assert.deepEqual(editAlreadyApprove.body.reply_markup, { inline_keyboard: [] }, 'must still remove buttons on alreadyDecided')
assert.match(editAlreadyApprove.body.text, /✅ Đã cấp thêm 1 lượt — Thầy Cũ, 17:00 13\/11/)

// Ca alreadyDecided REJECTED
const alreadyBotRejected = harness({
  secret: attemptSecret,
  adminUserIds: '111',
  adminChatId: '-100',
  autoSecretHeader: true,
  rpcHandler: () => ({
    data: {
      success: true,
      alreadyDecided: true,
      requestId: validRequestId,
      status: 'REJECTED',
      decidedByName: 'Cô Cũ',
      decidedAt: '2026-11-13T10:00:00.000Z',
    },
    error: null,
  }),
})

const alreadyResReject = await alreadyBotRejected.request({
  callback_query: {
    id: 'cb-already-2',
    data: `ar:no:${validRequestId}`,
    from: { id: 111, first_name: 'Thầy Mới' },
    message: { chat: { id: -100 }, message_id: 10, text: '🙋 Yêu cầu thêm lượt thi' },
  },
})
assert.equal(alreadyResReject.status, 200)
const ansAlreadyReject = alreadyBotRejected.sent.find(c => c.method === 'answerCallbackQuery' && c.body.callback_query_id === 'cb-already-2')
assert.equal(ansAlreadyReject.body.text, 'Yêu cầu đã được xử lý trước đó (đã từ chối).')
const editAlreadyReject = alreadyBotRejected.sent.find(c => c.method === 'editMessageText' && c.body.message_id === 10)
assert.ok(editAlreadyReject)
assert.deepEqual(editAlreadyReject.body.reply_markup, { inline_keyboard: [] }, 'must still remove buttons on alreadyDecided')
assert.match(editAlreadyReject.body.text, /❌ Đã từ chối — Cô Cũ, 17:00 13\/11/)

// 7. REQUEST_NOT_FOUND -> answerCallbackQuery "Không tìm thấy yêu cầu.", không editMessageText
const notFoundBot = harness({
  secret: attemptSecret,
  adminUserIds: '111',
  adminChatId: '-100',
  autoSecretHeader: true,
  rpcHandler: () => ({ data: null, error: { message: 'REQUEST_NOT_FOUND' } }),
})

await notFoundBot.request({
  callback_query: {
    id: 'cb-not-found',
    data: `ar:ok:${validRequestId}`,
    from: { id: 111, first_name: 'Thầy Nam' },
    message: { chat: { id: -100 }, message_id: 11, text: 'Yêu cầu' },
  },
})
assert.equal(notFoundBot.sent.at(-1).method, 'answerCallbackQuery')
assert.equal(notFoundBot.sent.at(-1).body.text, 'Không tìm thấy yêu cầu.')
assert.equal(notFoundBot.sent.some(c => c.method === 'editMessageText'), false)

// --- TASK T005b Tests ---

// 1. Env secret trống -> ar: bị từ chối, không gọi RPC; /start vẫn chạy khi env trống
const emptySecretBot = harness({
  secret: '',
  adminUserIds: '111',
  adminChatId: '-100',
})
// /start vẫn chạy khi env secret trống
const startNoSec = await emptySecretBot.request({ message: { chat: { id: -123 }, text: '/start' } })
assert.equal(startNoSec.status, 200)
assert.match(emptySecretBot.sent.at(-1).body.text, /Chào mừng/)

// Callback ar: bị từ chối với thông báo chưa cấu hình bảo mật, không gọi RPC
const arNoSec = await emptySecretBot.request({
  callback_query: {
    id: 'cb-empty-secret',
    data: `ar:ok:${validRequestId}`,
    from: { id: 111, first_name: 'Admin' },
    message: { chat: { id: -100 }, message_id: 201, text: 'Tin nhắn' },
  },
})
assert.equal(arNoSec.status, 200)
assert.equal(emptySecretBot.sent.at(-1).method, 'answerCallbackQuery')
assert.equal(emptySecretBot.sent.at(-1).body.callback_query_id, 'cb-empty-secret')
assert.equal(emptySecretBot.sent.at(-1).body.text, 'Chức năng duyệt chưa được cấu hình bảo mật.')
assert.equal(emptySecretBot.queries.filter(q => q[0] === 'rpc').length, 0, 'RPC must NOT be called when secret env is empty')
assert.equal(emptySecretBot.sent.some(c => c.method === 'editMessageText'), false, 'editMessageText must NOT be called when secret env is empty')

// 2. Chat không thuộc TELEGRAM_ADMIN_CHAT_ID -> không RPC, answerCallbackQuery báo lỗi
const unauthChatBot = harness({
  secret: attemptSecret,
  adminUserIds: '111',
  adminChatId: '-100, -200',
  autoSecretHeader: true,
})
const unauthChatRes = await unauthChatBot.request({
  callback_query: {
    id: 'cb-unauth-chat',
    data: `ar:ok:${validRequestId}`,
    from: { id: 111, first_name: 'Admin' },
    message: { chat: { id: -999 }, message_id: 202, text: 'Tin nhắn' },
  },
})
assert.equal(unauthChatRes.status, 200)
assert.equal(unauthChatBot.sent.at(-1).method, 'answerCallbackQuery')
assert.equal(unauthChatBot.sent.at(-1).body.callback_query_id, 'cb-unauth-chat')
assert.equal(unauthChatBot.sent.at(-1).body.text, 'Nút duyệt không thuộc chat quản trị.')
assert.equal(unauthChatBot.queries.filter(q => q[0] === 'rpc').length, 0, 'RPC must NOT be called for unauthorized chat')
assert.equal(unauthChatBot.sent.some(c => c.method === 'editMessageText'), false)

// 3. RPC lỗi lạ khác REQUEST_NOT_FOUND -> 200 + answerCallbackQuery "Không thể xử lý yêu cầu lúc này, vui lòng thử lại.", không throw 5xx
const rpcErrBot = harness({
  secret: attemptSecret,
  adminUserIds: '111',
  adminChatId: '-100',
  autoSecretHeader: true,
  rpcHandler: () => ({ data: null, error: { message: 'CONNECTION_TIMEOUT' } }),
})
const rpcErrRes = await rpcErrBot.request({
  callback_query: {
    id: 'cb-rpc-err',
    data: `ar:ok:${validRequestId}`,
    from: { id: 111, first_name: 'Admin' },
    message: { chat: { id: -100 }, message_id: 203, text: 'Tin nhắn' },
  },
})
assert.equal(rpcErrRes.status, 200, 'RPC error must return 200 to Telegram webhook')
assert.equal(rpcErrBot.sent.at(-1).method, 'answerCallbackQuery')
assert.equal(rpcErrBot.sent.at(-1).body.callback_query_id, 'cb-rpc-err')
assert.equal(rpcErrBot.sent.at(-1).body.text, 'Không thể xử lý yêu cầu lúc này, vui lòng thử lại.')
assert.equal(rpcErrBot.sent.some(c => c.method === 'editMessageText'), false)

// RPC trả kết quả success: false -> xử lý tương tự (200 + answerCallbackQuery, không throw)
const rpcUnsuccessBot = harness({
  secret: attemptSecret,
  adminUserIds: '111',
  adminChatId: '-100',
  autoSecretHeader: true,
  rpcHandler: () => ({ data: { success: false }, error: null }),
})
const rpcUnsuccessRes = await rpcUnsuccessBot.request({
  callback_query: {
    id: 'cb-rpc-unsuccess',
    data: `ar:ok:${validRequestId}`,
    from: { id: 111, first_name: 'Admin' },
    message: { chat: { id: -100 }, message_id: 204, text: 'Tin nhắn' },
  },
})
assert.equal(rpcUnsuccessRes.status, 200)
assert.equal(rpcUnsuccessBot.sent.at(-1).method, 'answerCallbackQuery')
assert.equal(rpcUnsuccessBot.sent.at(-1).body.callback_query_id, 'cb-rpc-unsuccess')
assert.equal(rpcUnsuccessBot.sent.at(-1).body.text, 'Không thể xử lý yêu cầu lúc này, vui lòng thử lại.')
assert.equal(rpcUnsuccessBot.sent.some(c => c.method === 'editMessageText'), false)

// 4. notEligible=true -> answerCallbackQuery + editMessageText dòng ⚠️
const notEligibleBot = harness({
  secret: attemptSecret,
  adminUserIds: '111',
  adminChatId: '-100',
  autoSecretHeader: true,
  rpcHandler: () => ({
    data: {
      success: true,
      alreadyDecided: false,
      notEligible: true,
      requestId: validRequestId,
      status: 'REJECTED',
      decidedAt: '2026-11-13T16:15:00.000Z',
    },
    error: null,
  }),
})
const notEligibleRes = await notEligibleBot.request({
  callback_query: {
    id: 'cb-not-eligible',
    data: `ar:ok:${validRequestId}`,
    from: { id: 111, first_name: 'Thầy', last_name: 'Nam' },
    message: { chat: { id: -100 }, message_id: 205, text: '🙋 Yêu cầu thêm lượt thi\nHọc sinh: Nam' },
  },
})
assert.equal(notEligibleRes.status, 200)
const ansNotEligible = notEligibleBot.sent.find(c => c.method === 'answerCallbackQuery' && c.body.callback_query_id === 'cb-not-eligible')
assert.ok(ansNotEligible)
assert.equal(
  ansNotEligible.body.text,
  'Không thể cấp lượt: bài thi đã đóng hoặc học sinh không còn được giao bài. Yêu cầu đã được đóng.',
)

const editNotEligible = notEligibleBot.sent.find(c => c.method === 'editMessageText' && c.body.message_id === 205)
assert.ok(editNotEligible)
assert.deepEqual(editNotEligible.body.reply_markup, { inline_keyboard: [] }, 'editMessageText must have empty inline_keyboard')
assert.match(
  editNotEligible.body.text,
  /\n\n⚠️ Không thể cấp lượt \(bài đã đóng hoặc học sinh không còn được giao bài\) — Thầy Nam, \d{2}:\d{2} \d{2}\/\d{2}/,
)

// 5. Regex gỡ dòng quyết định cũ mở rộng cho cả dòng ⚠️ (không lặp dòng quyết định khi chỉnh sửa lại)
const redecideBot = harness({
  secret: attemptSecret,
  adminUserIds: '111',
  adminChatId: '-100',
  autoSecretHeader: true,
  rpcHandler: () => ({
    data: {
      success: true,
      alreadyDecided: false,
      notEligible: false,
      requestId: validRequestId,
      status: 'APPROVED',
      decidedAt: '2026-11-13T16:15:00.000Z',
    },
    error: null,
  }),
})
await redecideBot.request({
  callback_query: {
    id: 'cb-redecide-warn',
    data: `ar:ok:${validRequestId}`,
    from: { id: 111, first_name: 'Thầy', last_name: 'Nam' },
    message: {
      chat: { id: -100 },
      message_id: 206,
      text: '🙋 Yêu cầu thêm lượt thi\nHọc sinh: Nam\n\n⚠️ Không thể cấp lượt (bài đã đóng hoặc học sinh không còn được giao bài) — Thầy Cũ, 10:00 13/11',
    },
  },
})
const editRedecideWarn = redecideBot.sent.find(c => c.method === 'editMessageText' && c.body.message_id === 206)
assert.ok(editRedecideWarn)
assert.doesNotMatch(editRedecideWarn.body.text, /⚠️/)
assert.match(editRedecideWarn.body.text, /✅ Đã cấp thêm 1 lượt — Thầy Nam, \d{2}:\d{2} \d{2}\/\d{2}/)
assert.ok(editRedecideWarn.body.text.startsWith('🙋 Yêu cầu thêm lượt thi\nHọc sinh: Nam\n\n✅'))
assert.deepEqual(editRedecideWarn.body.reply_markup, { inline_keyboard: [] }, 'editMessageText must have empty inline_keyboard')

// 6. Header secret khác hoa/thường vẫn nhận
for (const headerName of [
  'X-Telegram-Bot-Api-Secret-Token',
  'x-telegram-bot-api-secret-token',
  'X-TELEGRAM-BOT-API-SECRET-TOKEN',
  'X-TeLeGrAm-BoT-aPi-SeCrEt-ToKeN',
]) {
  const resCase = await secretBot.request(
    { message: { chat: { id: -123 }, text: '/start' } },
    { [headerName]: 'super-secret-token' },
  )
  assert.equal(resCase.status, 200, `header ${headerName} must be accepted`)
}

// 7. Mỗi nhánh callback ar: gọi answerCallbackQuery đúng 1 lần
const allBots = [
  attemptBot,
  emptySecretBot,
  unauthChatBot,
  rpcErrBot,
  rpcUnsuccessBot,
  notEligibleBot,
  redecideBot,
  alreadyBotApproved,
  alreadyBotRejected,
  notFoundBot,
]
const allCallbackIds = [
  'cb-invalid-uuid',
  'cb-malformed',
  'cb-unauth',
  'cb-approve',
  'cb-reject',
  'cb-already-1',
  'cb-already-2',
  'cb-not-found',
  'cb-empty-secret',
  'cb-unauth-chat',
  'cb-rpc-err',
  'cb-rpc-unsuccess',
  'cb-not-eligible',
  'cb-redecide-warn',
]
for (const qid of allCallbackIds) {
  let count = 0
  for (const b of allBots) {
    count += b.sent.filter(c => c.method === 'answerCallbackQuery' && c.body?.callback_query_id === qid).length
  }
  assert.equal(count, 1, `Callback query ${qid} must be answered exactly once (got ${count})`)
}

// 8. Đảm bảo không lộ token hay tên người trong logs
for (const b of [secretBot, noSecretBot, ...allBots]) {
  assert.doesNotMatch(b.logs.join(' '), /super-secret-token|ar-webhook-secret-token|fake-token/)
  assert.doesNotMatch(b.logs.join(' '), /Thầy Nam|Cô Cũ|teacher_two|Thầy Cũ/)
}

console.log('Telegram bot PASS: webhook secret, attempt request decisions (approve/reject/alreadyDecided/allow-list), link/report compatibility')
