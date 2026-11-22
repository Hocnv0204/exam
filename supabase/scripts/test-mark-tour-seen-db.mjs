// PostgreSQL/WASM (PGlite) test cho migration 20261122020000_mark_tour_seen.sql
// Không mạng, không cloud, không dữ liệu thật.
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { pathToFileURL } from 'node:url'

if (!process.env.PGLITE_MODULE) {
  throw new Error('Set PGLITE_MODULE to an external @electric-sql/pglite dist/index.js path.')
}

const { PGlite } = await import(pathToFileURL(process.env.PGLITE_MODULE).href)
const db = new PGlite()

console.log('Running test-mark-tour-seen-db.mjs...')

// 1. Tạo roles và schema tối thiểu
await db.exec(`
  CREATE ROLE anon;
  CREATE ROLE authenticated;
  CREATE ROLE service_role BYPASSRLS;

  CREATE TABLE public.profiles (
    id UUID PRIMARY KEY,
    role TEXT NOT NULL DEFAULT 'STUDENT',
    seen_tours TEXT[] NOT NULL DEFAULT '{}'
  );

  GRANT USAGE ON SCHEMA public TO anon, authenticated, service_role;
  GRANT ALL ON ALL TABLES IN SCHEMA public TO service_role;
  GRANT SELECT ON ALL TABLES IN SCHEMA public TO anon, authenticated;
`)

// 2. Chạy migration 2 lần để kiểm tra tính idempotent
const migrationSql = readFileSync(new URL('../migrations/20261122020000_mark_tour_seen.sql', import.meta.url), 'utf8')
await db.exec(migrationSql)
await db.exec(migrationSql)
console.log('✓ Migration executed idempotently (2 times)')

// Helper function để bắt lỗi
const expectError = async (fn, pattern) => {
  try {
    await fn()
    assert.fail('Expected error but none was thrown')
  } catch (err) {
    if (pattern) {
      assert.match(String(err.message), pattern)
    }
  }
}

// Helper gọi RPC bằng SQL
const callRpc = async (userId, key) => {
  const res = await db.query('SELECT public.fn_mark_tour_seen($1, $2) AS seen', [userId, key])
  return res.rows[0]?.seen
}

const getSeenInDb = async (userId) => {
  const res = await db.query('SELECT seen_tours FROM public.profiles WHERE id = $1', [userId])
  return res.rows[0]?.seen_tours
}

// 3. Oracle JS độc lập kiểm tra các tính chất
await db.exec('SET ROLE service_role')

const u1 = '00000000-0000-4000-8000-000000000001'
const u2 = '00000000-0000-4000-8000-000000000002'
const u3 = '00000000-0000-4000-8000-000000000003'
const nonExistentUser = '99999999-9999-4999-8999-999999999999'

await db.query(`INSERT INTO public.profiles (id, role, seen_tours) VALUES ($1, 'STUDENT', '{}')`, [u1])
await db.query(`INSERT INTO public.profiles (id, role, seen_tours) VALUES ($1, 'STUDENT', '{}')`, [u2])
await db.query(`INSERT INTO public.profiles (id, role, seen_tours) VALUES ($1, 'STUDENT', '{}')`, [u3])

// 3.a Thêm key mới -> có
const res1 = await callRpc(u1, 'm2-welcome')
assert.deepEqual(res1, ['m2-welcome'], 'Trả về mảng chứa key mới')
assert.deepEqual(await getSeenInDb(u1), ['m2-welcome'], 'DB được cập nhật với key mới')
console.log('✓ Thêm key mới → có trong mảng trả về và DB')

// 3.b Thêm lại key đã có -> không trùng, độ dài không đổi
const res1Again = await callRpc(u1, 'm2-welcome')
assert.deepEqual(res1Again, ['m2-welcome'], 'Thêm lại key cũ trả về mảng không đổi')
assert.deepEqual(await getSeenInDb(u1), ['m2-welcome'], 'DB không bị duplicate key')
console.log('✓ Thêm lại key cũ → không trùng lặp, độ dài không đổi')

// 3.c Key khác giữ thứ tự cũ + nối cuối
const res1Next = await callRpc(u1, 'm2-classes')
assert.deepEqual(res1Next, ['m2-welcome', 'm2-classes'], 'Key mới được nối vào cuối mảng')
assert.deepEqual(await getSeenInDb(u1), ['m2-welcome', 'm2-classes'], 'DB giữ đúng thứ tự cũ và nối cuối')

const res1Third = await callRpc(u1, 'm2-lesson')
assert.deepEqual(res1Third, ['m2-welcome', 'm2-classes', 'm2-lesson'], 'Key thứ 3 nối cuối')
assert.deepEqual(await getSeenInDb(u1), ['m2-welcome', 'm2-classes', 'm2-lesson'])
console.log('✓ Key khác giữ đúng thứ tự cũ + nối cuối')

// 3.d 2 lời gọi song song (Promise.all) cùng key → chỉ 1 lần
const [pRes1, pRes2] = await Promise.all([
  callRpc(u2, 'm2-homeworks'),
  callRpc(u2, 'm2-homeworks'),
])
assert.deepEqual(pRes1, ['m2-homeworks'])
assert.deepEqual(pRes2, ['m2-homeworks'])
const seenU2 = await getSeenInDb(u2)
assert.deepEqual(seenU2, ['m2-homeworks'], 'Gọi đồng thời cùng key chỉ ghi đúng 1 lần')
console.log('✓ 2 lời gọi song song cùng key → chỉ 1 lần (không duplicate)')

// 3.e 2 lời gọi song song khác key trên u3 → cả 2 key đều có (không nuốt key nhau)
await Promise.all([
  callRpc(u3, 'm2-attendance'),
  callRpc(u3, 'm2-history'),
])
const seenU3 = await getSeenInDb(u3)
assert.equal(seenU3.length, 2, 'Cả 2 key đều được ghi')
assert.equal(seenU3.includes('m2-attendance'), true)
assert.equal(seenU3.includes('m2-history'), true)
console.log('✓ 2 lời gọi song song khác key → cả 2 key đều được ghi nhận')

// 3.f User không tồn tại → NULL
const nonExistentRes = await callRpc(nonExistentUser, 'm2-welcome')
assert.equal(nonExistentRes, null, 'User không tồn tại phải trả về NULL')
console.log('✓ User không tồn tại → trả về NULL')

// 3.g Key rỗng hoặc null → lỗi (RAISE EXCEPTION)
await expectError(
  () => callRpc(u1, ''),
  /p_key cannot be null or empty/
)
await expectError(
  () => callRpc(u1, '   '),
  /p_key cannot be null or empty/
)
await expectError(
  () => callRpc(u1, null),
  /p_key cannot be null or empty/
)
console.log('✓ Key rỗng/trắng/null → báo lỗi ngoại lệ')

// 3.h Phân quyền: anon / authenticated bị từ chối (permission denied)
await db.exec('SET ROLE anon')
await expectError(
  () => callRpc(u1, 'm2-achievements'),
  /permission denied/i
)
console.log('✓ anon bị từ chối với permission denied')

await db.exec('SET ROLE authenticated')
await expectError(
  () => callRpc(u1, 'm2-achievements'),
  /permission denied/i
)
console.log('✓ authenticated bị từ chối với permission denied')

// 3.i service_role được gọi thành công
await db.exec('SET ROLE service_role')
const sRoleRes = await callRpc(u1, 'm2-achievements')
assert.deepEqual(sRoleRes, ['m2-welcome', 'm2-classes', 'm2-lesson', 'm2-achievements'])
console.log('✓ service_role được cấp quyền gọi hàm thành công')

console.log('ALL DB TESTS PASSED!')
