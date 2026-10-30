import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import vm from 'node:vm'
import { transformSync } from '../../fe/node_modules/esbuild/lib/main.js'

const source = readFileSync(new URL('../functions/telegram-bot/index.ts', import.meta.url), 'utf8')
const code = transformSync(source.replace(/^import .*$/gm, ''), { loader: 'ts', format: 'cjs' }).code
const classId = '123e4567-e89b-42d3-a456-426614174000'

function harness({ token = 'fake-token', username = 'OurBot', response = () => ({ ok: true, status: 200, json: async () => ({ ok: true }) }) } = {}) {
  let handler
  const sent = [], queries = [], logs = []
  const db = { from(table) {
    const query = {
      select() { return query }, order() { return query }, limit() { return query }, eq(...args) { queries.push([table, 'eq', ...args]); return query },
      single() { return Promise.resolve({ data: { id: classId, name: 'Toán' }, error: null }) },
      maybeSingle() { return Promise.resolve({ data: { id: classId, name: 'Toán' }, error: null }) },
      upsert(value) { queries.push([table, 'upsert', value]); return Promise.resolve({ error: null }) },
      then(resolve, reject) { return Promise.resolve({ data: table === 'classes' ? [{ id: classId, name: 'Toán' }] : [], error: null }).then(resolve, reject) },
    }
    return query
  } }
  vm.runInNewContext(code, {
    serve: fn => { handler = fn },
    Deno: { env: { get: key => key === 'TELEGRAM_BOT_TOKEN' ? token : username } },
    console: { warn: (...args) => logs.push(args.join(' ')), error: (...args) => logs.push(args.join(' ')) },
    createServiceRoleClient: () => db, handleCors: () => null,
    jsonResponse: (data, status = 200) => ({ data, status }),
    errorResponse: (message, status) => ({ message, status }),
    fetch: async (url, options) => {
      assert.ok(url.startsWith('https://api.telegram.org/botfake-token/') || !token)
      const call = { method: url.slice(url.lastIndexOf('/') + 1), body: JSON.parse(options.body) }
      sent.push(call)
      return response(call)
    },
  })
  const request = async update => handler({ method: 'POST', json: async () => update })
  const message = (text, extra = {}) => request({ message: { chat: { id: -123, title: 'Nhóm' }, text, ...extra } })
  return { request, message, sent, queries, logs }
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
console.log('Telegram bot PASS: group commands, link args, unrelated bots/captions, malformed updates, keyboard/callback failures, missing token (mock only)')
