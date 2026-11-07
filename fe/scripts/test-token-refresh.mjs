// Kiểm thử refresh token single-flight trong api.js (không gọi mạng thật: fetch được mock).
import { test, beforeEach } from 'node:test'
import assert from 'node:assert/strict'

// --- Môi trường trình duyệt tối thiểu cho state.js / api.js ---
const store = new Map()
globalThis.localStorage = {
  getItem: k => (store.has(k) ? store.get(k) : null),
  setItem: (k, v) => store.set(k, String(v)),
  removeItem: k => store.delete(k)
}
globalThis.sessionStorage = { removeItem() {} }
globalThis.window = { location: { hash: '' } }
const fakeEl = () => ({ className: '', innerHTML: '', classList: { add() {}, remove() {} }, getBoundingClientRect() {} })
globalThis.document = { createElement: fakeEl, body: { appendChild() {} } }

const { state, setSession } = await import('../src/js/state.js')
const { api } = await import('../src/js/api.js')

let calls
let validToken
let refreshDelayMs
let refreshShouldFail

const json = (status, body) => ({ status, ok: status >= 200 && status < 300, json: async () => body })
const delay = ms => new Promise(r => setTimeout(r, ms))

globalThis.fetch = async (url, opts = {}) => {
  const endpoint = String(url).split('/functions/v1/')[1]
  if (endpoint === 'refresh-token') {
    calls.refresh.push(JSON.parse(opts.body).refreshToken)
    await delay(refreshDelayMs)
    if (refreshShouldFail) return json(401, { success: false, error: 'invalid' })
    validToken = `access-${calls.refresh.length + 1}`
    return json(200, { success: true, data: { accessToken: validToken, refreshToken: `refresh-${calls.refresh.length + 1}` } })
  }
  const auth = opts.headers?.Authorization
  calls.requests.push({ endpoint, auth })
  await delay(5)
  if (auth !== `Bearer ${validToken}`) return json(401, { success: false, error: 'expired' })
  return json(200, { success: true, data: [{ id: endpoint }] })
}

beforeEach(() => {
  store.clear()
  calls = { refresh: [], requests: [] }
  validToken = 'access-new-not-issued-yet'
  refreshDelayMs = 30
  refreshShouldFail = false
  setSession({ id: 'u1', role: 'ADMIN' }, 'access-1', 'refresh-1')
  state.classes = [{ id: 'cached-class' }]
  window.location.hash = '#admin-dashboard'
})

test('nhiều request cùng nhận 401 → chỉ refresh 1 lần, mọi request thành công, không logout', async () => {
  const results = await Promise.all([api.getClasses(), api.getClasses('a=1'), api.getClasses('b=2')])
  assert.equal(results.length, 3)
  assert.equal(calls.refresh.length, 1, 'chỉ một lần gọi refresh-token')
  assert.equal(calls.refresh[0], 'refresh-1')
  assert.equal(state.token, validToken)
  assert.equal(state.refreshToken, 'refresh-2')
  assert.notEqual(window.location.hash, '#login', 'không bị đăng xuất')
  const retried = calls.requests.filter(r => r.auth === `Bearer ${validToken}`)
  assert.equal(retried.length, 3, 'mỗi request gửi lại đúng 1 lần với token mới')
})

test('request 401 sau khi request khác đã refresh xong → dùng token mới, không refresh lần 2', async () => {
  refreshDelayMs = 1
  await api.getClasses()
  assert.equal(calls.refresh.length, 1)
  // Mô phỏng request cũ còn mang token cũ: đặt lại token cũ trong lúc gửi rồi khôi phục.
  const fresh = state.token
  const originalFetch = globalThis.fetch
  let first = true
  globalThis.fetch = async (url, opts) => {
    if (first && !String(url).endsWith('refresh-token')) {
      first = false
      state.token = fresh // token đã mới trên state, nhưng request này mang token cũ
      return json(401, { success: false })
    }
    return originalFetch(url, opts)
  }
  try {
    state.token = 'access-1'
    const p = api.getClasses('late=1')
    state.token = fresh
    await p
  } finally {
    globalThis.fetch = originalFetch
  }
  assert.equal(calls.refresh.length, 1, 'không refresh lại bằng refresh token đã xoay vòng')
  assert.notEqual(window.location.hash, '#login')
})

test('refresh thất bại → mọi request nhận lỗi phiên hết hạn và đăng xuất', async () => {
  refreshShouldFail = true
  const settled = await Promise.allSettled([api.getClasses(), api.getClasses('x=1')])
  assert.ok(settled.every(s => s.status === 'rejected'))
  assert.equal(calls.refresh.length, 1, 'không gọi refresh lặp lại')
  assert.equal(window.location.hash, '#login')
  assert.equal(state.token, null)
})

test('refresh thành công không xoá cache lớp (chỉ cập nhật token)', async () => {
  await api.getClasses()
  assert.deepEqual(state.classes, [{ id: 'cached-class' }])
  assert.equal(localStorage.getItem('edu_token'), validToken)
  assert.equal(localStorage.getItem('edu_refresh_token'), 'refresh-2')
})
