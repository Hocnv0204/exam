import { test, beforeEach } from 'node:test'
import assert from 'node:assert/strict'

const store = new Map()
globalThis.localStorage = { getItem: k => store.get(k) ?? null, setItem: (k, v) => store.set(k, String(v)), removeItem: k => store.delete(k) }
globalThis.sessionStorage = { removeItem() {} }
globalThis.window = { location: { hash: '' } }
globalThis.document = { createElement: () => ({ classList: { add() {}, remove() {} }, getBoundingClientRect() {} }), body: { appendChild() {} } }
const { setSession, logout } = await import('../src/js/state.js')
const { api } = await import('../src/js/api.js')
let calls = 0
globalThis.fetch = async url => {
  calls++
  const endpoint = String(url).split('/functions/v1/')[1]
  return { ok: true, status: 200, json: async () => endpoint.startsWith('create-class') ? [{ id: `class-${calls}` }] : { ok: true } }
}
beforeEach(() => { calls = 0; setSession({ id: 'cache-user', role: 'ADMIN' }, 'token') })

test('getClasses dùng chung promise và cache trong TTL', async () => {
  const [a, b] = await Promise.all([api.getClasses('grade=12'), api.getClasses('grade=12')])
  assert.deepEqual(a, b)
  assert.equal(calls, 1)
  await api.getClasses('grade=12')
  assert.equal(calls, 1)
})
test('force và mutation lớp làm cache phải tải lại', async () => {
  await api.getClasses()
  await api.getClasses('', { force: true })
  assert.equal(calls, 2)
  await api.createClass({ name: 'Lớp mới' })
  await api.getClasses()
  assert.equal(calls, 4)
})
test('đổi phiên và logout không dùng lại cache phiên cũ', async () => {
  await api.getClasses()
  setSession({ id: 'other-user', role: 'ADMIN' }, 'token-2')
  await api.getClasses()
  assert.equal(calls, 2)
  logout()
  setSession({ id: 'cache-user', role: 'ADMIN' }, 'token-3')
  await api.getClasses()
  assert.equal(calls, 3)
})
