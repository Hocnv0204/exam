/**
 * Unit test cho logic thống kê "Học sinh có số dư 0 đ" (backend).
 *
 * Chạy:  node supabase/scripts/test-zero-balance.mjs
 * (không cần mạng / không cần deploy Edge Function)
 *
 * Kiểm tra:
 * - Điều kiện CHÍNH XÁC balance = 0 (loại số dư âm và NULL).
 * - Đếm exact 1 lần / học sinh (kể cả học sinh thuộc nhiều lớp).
 * - Phân trang server-side (range) không trùng / không bỏ sót.
 * - Lọc lớp: gộp student_classes + profiles.class_id (legacy), khử trùng id.
 * - Validate page / pageSize -> 400 khi tham số sai.
 * - Lỗi DB -> errorResponse (không trả count = 0).
 * - Tên lớp fallback cho dữ liệu legacy.
 */

import {
  parsePositiveIntParam,
  sanitizeSearchTerm,
  buildZeroBalanceSearchFilter,
  collectLegacyClassIds,
  mapZeroBalanceRows,
} from '../shared/zero-balance.ts'
import { handleZeroBalanceAction } from '../shared/zero-balance-action.ts'

let passed = 0
let failed = 0

function check(name, condition, extra = '') {
  if (condition) {
    passed++
    console.log(`  ✓ ${name}`)
  } else {
    failed++
    console.log(`  ✗ ${name}${extra ? ` -> ${extra}` : ''}`)
  }
}

function eq(name, actual, expected) {
  const ok = JSON.stringify(actual) === JSON.stringify(expected)
  check(name, ok, ok ? '' : `expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`)
}

/* -------------------------------------------------------------------------
 * Mock Supabase client (mini PostgREST)
 * ---------------------------------------------------------------------- */
function createMockClient({ profiles = [], studentClasses = [], classes = [], errors = {} } = {}) {
  const queries = []

  function runQuery(q) {
    if (errors[q.table]) {
      return { data: null, count: null, error: { message: errors[q.table] } }
    }

    let rows = []
    if (q.table === 'profiles') rows = profiles.map((r) => ({ ...r }))
    else if (q.table === 'student_classes') rows = studentClasses.map((r) => ({ ...r }))
    else if (q.table === 'classes') rows = classes.map((r) => ({ ...r }))

    for (const [col, val] of Object.entries(q.filters)) {
      if (col === 'role') rows = rows.filter((r) => r.role === val)
      else if (col === 'balance') rows = rows.filter((r) => r.balance === val) // chính xác, NULL bị loại
      else if (col === 'class_id') rows = rows.filter((r) => r.class_id === val)
      else if (col === 'id') rows = rows.filter((r) => r.id === val)
      else if (col === 'student_id') rows = rows.filter((r) => r.student_id === val)
    }

    if (q.inFilter) {
      const { col, vals } = q.inFilter
      rows = rows.filter((r) => vals.includes(r[col]))
    }

    if (q.orExpr) {
      // PostgREST: "col1.ilike.%x%,col2.ilike.%x%" => match ANY trong các điều kiện
      const terms = [...q.orExpr.matchAll(/(\w+)\.ilike\.%([^%]*)%/g)]
      if (terms.length > 0) {
        rows = rows.filter((r) =>
          terms.some(([, col, term]) => String(r[col] ?? '').toLowerCase().includes(term.toLowerCase()))
        )
      }
    }

    for (const o of q.orders) {
      rows.sort((a, b) => {
        const av = a[o.col] ?? ''
        const bv = b[o.col] ?? ''
        if (av === bv) return 0
        const cmp = av < bv ? -1 : 1
        return o.opts && o.opts.ascending === false ? -cmp : cmp
      })
    }

    const count = rows.length
    if (q.range) rows = rows.slice(q.range.from, q.range.to + 1)
    if (q.selectOpts && q.selectOpts.head) return { data: null, count, error: null }
    return { data: rows, count, error: null }
  }

  function build(table) {
    const q = {
      table,
      columns: null,
      selectOpts: null,
      filters: {},
      inFilter: null,
      orExpr: null,
      orders: [],
      range: null,
    }
    const builder = {
      select(columns, opts) { q.columns = columns; q.selectOpts = opts || null; return builder },
      eq(col, val) { q.filters[col] = val; return builder },
      in(col, vals) { q.inFilter = { col, vals }; return builder },
      or(expr) { q.orExpr = expr; return builder },
      order(col, opts) { q.orders.push({ col, opts }); return builder },
      range(from, to) { q.range = { from, to }; return builder },
      then(onFulfilled, onRejected) {
        queries.push(JSON.parse(JSON.stringify(q)))
        return Promise.resolve().then(() => runQuery(q)).then(onFulfilled, onRejected)
      },
    }
    return builder
  }

  return {
    queries,
    from: (table) => build(table),
  }
}

function url(query) {
  return new URL(`https://example.supabase.co/functions/v1/create-student?${query}`)
}

async function body(res) {
  return JSON.parse(await res.text())
}

/* -------------------------------------------------------------------------
 * Fixture: 8 học sinh với balance khác nhau
 * ---------------------------------------------------------------------- */
const fixtures = {
  profiles: [
    { id: 'u1', username: 'an', full_name: 'An', role: 'STUDENT', class_id: 'c1', balance: 0, is_locked: false, student_classes: [{ class_id: 'c1', classes: { name: 'Lớp 1' } }] },
    { id: 'u2', username: 'binh', full_name: 'Bình', role: 'STUDENT', class_id: 'c1', balance: 0, is_locked: false, student_classes: [{ class_id: 'c1', classes: { name: 'Lớp 1' } }, { class_id: 'c2', classes: { name: 'Lớp 2' } }] },
    { id: 'u3', username: 'chi', full_name: 'Chi', role: 'STUDENT', class_id: 'c2', balance: 0, is_locked: true, student_classes: [{ class_id: 'c2', classes: { name: 'Lớp 2' } }] },
    { id: 'u4', username: 'dung', full_name: 'Dũng', role: 'STUDENT', class_id: null, balance: 0, is_locked: false, student_classes: [] },
    { id: 'u5', username: 'em', full_name: 'Em', role: 'STUDENT', class_id: 'c1', balance: 100000, is_locked: false, student_classes: [] },
    { id: 'u6', username: 'fox', full_name: 'Fox', role: 'STUDENT', class_id: 'c1', balance: -5000, is_locked: false, student_classes: [] },
    { id: 'u7', username: 'ghi', full_name: 'Ghi', role: 'STUDENT', class_id: 'c1', balance: null, is_locked: false, student_classes: [] },
    { id: 'u8', username: 'hai', full_name: 'Hải', role: 'ADMIN', class_id: null, balance: 0, is_locked: false, student_classes: [] },
  ],
  studentClasses: [
    { student_id: 'u1', class_id: 'c1' },
    { student_id: 'u2', class_id: 'c1' },
    { student_id: 'u2', class_id: 'c2' },
    { student_id: 'u3', class_id: 'c2' },
    { student_id: 'u5', class_id: 'c1' },
  ],
  classes: [
    { id: 'c1', name: 'Lớp 1' },
    { id: 'c2', name: 'Lớp 2' },
  ],
}

console.log('\n== Backend: đếm học sinh có số dư 0 đ ==')

// 1. Count chỉ tính balance === 0
{
  const client = createMockClient(fixtures)
  const res = await handleZeroBalanceAction(client, url('action=zero-balance-count'), 'zero-balance-count')
  const json = await body(res)
  eq('HTTP 200', res.status, 200)
  eq('count = 4 (chỉ balance 0, loại âm/NULL/ADMIN)', json.data.count, 4)

  const countQuery = client.queries.find((q) => q.table === 'profiles' && q.selectOpts?.head)
  check('dùng count exact + head (không tải danh sách)', !!countQuery && countQuery.selectOpts.count === 'exact' && countQuery.selectOpts.head === true)
  check('filter role = STUDENT', countQuery?.filters.role === 'STUDENT')
  check('filter balance = 0 (chính xác)', countQuery?.filters.balance === 0)
}

// 2. List + phân trang
{
  const client = createMockClient(fixtures)
  const res = await handleZeroBalanceAction(client, url('action=zero-balance-list&page=1&pageSize=2'), 'zero-balance-list')
  const json = await body(res)
  eq('HTTP 200', res.status, 200)
  eq('items = 2', json.data.items.length, 2)
  eq('total = 4', json.data.total, 4)
  eq('page = 1', json.data.page, 1)
  eq('pageSize = 2', json.data.pageSize, 2)
  eq('sắp xếp theo full_name', json.data.items.map((i) => i.fullName), ['An', 'Bình'])

  const listQuery = client.queries.find((q) => q.table === 'profiles' && q.range)
  eq('range đúng trang 1 (0..1)', listQuery.range, { from: 0, to: 1 })
  check('order full_name', listQuery.orders.some((o) => o.col === 'full_name'))
  check('order id (ổn định)', listQuery.orders.some((o) => o.col === 'id'))
}

// 3. Các trang không trùng / không bỏ sót
{
  const client = createMockClient(fixtures)
  const seen = []
  for (const page of [1, 2, 3]) {
    const res = await handleZeroBalanceAction(client, url(`action=zero-balance-list&page=${page}&pageSize=2`), 'zero-balance-list')
    const json = await body(res)
    seen.push(...json.data.items.map((i) => i.id))
  }
  eq('4 học sinh, không trùng id giữa các trang', seen, ['u1', 'u2', 'u3', 'u4'])
  eq('không bỏ sót học sinh', new Set(seen).size, 4)
}

// 4. Học sinh nhiều lớp chỉ xuất hiện 1 lần + tên lớp gộp
{
  const client = createMockClient(fixtures)
  const res = await handleZeroBalanceAction(client, url('action=zero-balance-list'), 'zero-balance-list')
  const json = await body(res)
  const binh = json.data.items.find((i) => i.username === 'binh')
  eq('học sinh 2 lớp chỉ 1 dòng', json.data.items.filter((i) => i.username === 'binh').length, 1)
  eq('classIds gom đủ', binh.classIds, ['c1', 'c2'])
  eq('className gom tên lớp', binh.className, 'Lớp 1, Lớp 2')
  eq('trạng thái tạm khóa', json.data.items.find((i) => i.username === 'chi').status, 'Tạm khóa')
  eq('số dư = 0', json.data.items.find((i) => i.username === 'chi').balance, 0)
}

// 5. Lọc lớp: gộp student_classes + legacy profiles.class_id, khử trùng
{
  const client = createMockClient(fixtures)
  const res = await handleZeroBalanceAction(client, url('action=zero-balance-count&classId=c1'), 'zero-balance-count')
  const json = await body(res)
  // c1: u1 (join), u2 (join), u5 (join, balance>0), u4 (legacy class_id? u4 class_id=null) => chỉ u1,u2
  eq('lọc lớp chỉ tính học sinh balance 0 của lớp', json.data.count, 2)

  const inFilter = client.queries.find((q) => q.inFilter)?.inFilter
  // c1 = student_classes {u1,u2,u5} + legacy profiles.class_id {u1,u2,u5,u6,u7} -> khử trùng
  eq('danh sách id lớp đã khử trùng', inFilter.vals, ['u1', 'u2', 'u5', 'u6', 'u7'])
}

// 6. Lớp không có học sinh -> đúng contract action
{
  const client = createMockClient(fixtures)
  const countRes = await handleZeroBalanceAction(client, url('action=zero-balance-count&classId=cX'), 'zero-balance-count')
  const countJson = await body(countRes)
  eq('count lớp rỗng = 0', countJson.data, { count: 0 })

  const listRes = await handleZeroBalanceAction(client, url('action=zero-balance-list&classId=cX&page=3&pageSize=10'), 'zero-balance-list')
  const listJson = await body(listRes)
  eq('list lớp rỗng trả contract', listJson.data, { items: [], total: 0, page: 3, pageSize: 10 })
}

// 6b. REGRESSION: lớp rỗng + tham số phân trang sai -> vẫn phải trả 400
// (validation phải chạy TRƯỚC nhánh return sớm của lớp không có học sinh)
{
  const client = createMockClient(fixtures)
  const badParams = [
    'page=0', 'page=-1', 'page=abc', 'page=1.5', 'page=0.5',
    'pageSize=0', 'pageSize=101', 'pageSize=1000', 'pageSize=abc', 'pageSize=-5'
  ]

  for (const bad of badParams) {
    const res = await handleZeroBalanceAction(client, url(`action=zero-balance-list&classId=cX&${bad}`), 'zero-balance-list')
    const json = await body(res)
    check(`lớp rỗng + ${bad} -> HTTP 400`, res.status === 400, `got ${res.status}`)
    check(`lớp rỗng + ${bad} -> success=false`, json.success === false)
  }

  // Tham số hợp lệ vẫn trả contract đúng
  const okRes = await handleZeroBalanceAction(client, url('action=zero-balance-list&classId=cX&page=3&pageSize=10'), 'zero-balance-list')
  const okJson = await body(okRes)
  eq('lớp rỗng + page/pageSize hợp lệ -> HTTP 200', okRes.status, 200)
  eq('lớp rỗng -> contract giữ nguyên page/pageSize', okJson.data, { items: [], total: 0, page: 3, pageSize: 10 })

  // Biên: pageSize = 100 vẫn hợp lệ
  const maxRes = await handleZeroBalanceAction(client, url('action=zero-balance-list&classId=cX&pageSize=100'), 'zero-balance-list')
  const maxJson = await body(maxRes)
  eq('lớp rỗng + pageSize=100 -> HTTP 200', maxRes.status, 200)
  eq('lớp rỗng + pageSize=100 giữ giá trị', maxJson.data.pageSize, 100)

  // Không gọi DB khi tham số sai (validate short-circuit trước truy vấn lớp)
  const noQueryClient = createMockClient(fixtures)
  const noQueryRes = await handleZeroBalanceAction(noQueryClient, url('action=zero-balance-list&classId=cX&page=0'), 'zero-balance-list')
  eq('lớp rỗng + page=0 -> HTTP 400', noQueryRes.status, 400)
  eq('không truy vấn DB khi tham số sai', noQueryClient.queries.length, 0)

  // action count vẫn bỏ qua tham số phân trang (không phải list)
  const countRes = await handleZeroBalanceAction(client, url('action=zero-balance-count&classId=cX&page=0&pageSize=999'), 'zero-balance-count')
  const countJson = await body(countRes)
  eq('count lớp rỗng bỏ qua page/pageSize', countJson.data, { count: 0 })
}

// 7. Validate page / pageSize
{
  const client = createMockClient(fixtures)
  for (const bad of ['page=0', 'page=-1', 'page=abc', 'page=1.5', 'pageSize=0', 'pageSize=101', 'pageSize=abc']) {
    const res = await handleZeroBalanceAction(client, url(`action=zero-balance-list&${bad}`), 'zero-balance-list')
    const json = await body(res)
    check(`${bad} -> HTTP 400`, res.status === 400, `got ${res.status}`)
    check(`${bad} -> success=false`, json.success === false)
  }

  const okRes = await handleZeroBalanceAction(client, url('action=zero-balance-list&pageSize=100'), 'zero-balance-list')
  const okJson = await body(okRes)
  eq('pageSize=100 hợp lệ', okJson.data.pageSize, 100)

  const defaultRes = await handleZeroBalanceAction(client, url('action=zero-balance-list'), 'zero-balance-list')
  const defaultJson = await body(defaultRes)
  eq('pageSize mặc định = 20', defaultJson.data.pageSize, 20)
  eq('page mặc định = 1', defaultJson.data.page, 1)
}

// 8. Lỗi DB -> error, không phải count 0
{
  const client = createMockClient({ ...fixtures, errors: { profiles: 'DB exploded' } })
  const res = await handleZeroBalanceAction(client, url('action=zero-balance-count'), 'zero-balance-count')
  const json = await body(res)
  check('lỗi DB -> HTTP 500', res.status === 500, `got ${res.status}`)
  check('lỗi DB -> success=false', json.success === false)
  check('lỗi DB -> không trả count 0', !JSON.stringify(json.data || {}).includes('"count":0'))
}

// 9. Tên lớp fallback cho dữ liệu legacy (chỉ có profiles.class_id)
{
  const client = createMockClient({
    profiles: [
      { id: 'u9', username: 'hung', full_name: 'Hùng', role: 'STUDENT', class_id: 'c2', balance: 0, is_locked: false, student_classes: [] },
    ],
    studentClasses: [],
    classes: [{ id: 'c2', name: 'Lớp Legacy' }],
  })
  const res = await handleZeroBalanceAction(client, url('action=zero-balance-list'), 'zero-balance-list')
  const json = await body(res)
  eq('legacy className được fallback', json.data.items[0].className, 'Lớp Legacy')
  eq('legacy classIds có class_id', json.data.items[0].classIds, ['c2'])
}

// 10. Tìm kiếm: dùng filter or() + làm sạch ký tự đặc biệt
{
  const client = createMockClient(fixtures)
  const res = await handleZeroBalanceAction(client, url('action=zero-balance-list&search=Binh'), 'zero-balance-list')
  const json = await body(res)
  eq('tìm kiếm theo tên', json.data.items.map((i) => i.username), ['binh'])

  const dirty = await handleZeroBalanceAction(client, url('action=zero-balance-list&search=An,(x)'), 'zero-balance-list')
  const dirtyJson = await body(dirty)
  const orFilter = client.queries.filter((q) => q.orExpr).pop().orExpr
  check('từ khoá được làm sạch', !orFilter.includes(',(') && !orFilter.includes(')'), orFilter)
  check('tìm kiếm vẫn chạy', dirtyJson.success === true)
}

console.log('\n== Backend: helper thuần ==')
eq('parsePositiveIntParam(null) -> fallback', parsePositiveIntParam(null, 20), 20)
eq('parsePositiveIntParam("5") -> 5', parsePositiveIntParam('5', 20), 5)
eq('parsePositiveIntParam("0") -> null', parsePositiveIntParam('0', 20), null)
eq('parsePositiveIntParam("abc") -> null', parsePositiveIntParam('abc', 20), null)
eq('parsePositiveIntParam("-3") -> null', parsePositiveIntParam('-3', 20), null)
eq('parsePositiveIntParam("1.5") -> null', parsePositiveIntParam('1.5', 20), null)
eq('sanitizeSearchTerm bỏ ký tự PostgREST', sanitizeSearchTerm(' An, (x) '), 'An x')
eq('buildZeroBalanceSearchFilter null khi rỗng', buildZeroBalanceSearchFilter(''), null)
check('buildZeroBalanceSearchFilter có 2 field', buildZeroBalanceSearchFilter('an').includes('full_name.ilike') && buildZeroBalanceSearchFilter('an').includes('username.ilike'))
eq('collectLegacyClassIds tìm class_id chưa có join', collectLegacyClassIds(fixtures.profiles), ['c1'])
eq('mapZeroBalanceRows khử trùng id', mapZeroBalanceRows([fixtures.profiles[0], fixtures.profiles[0]]).length, 1)
eq('mapZeroBalanceRows map field', mapZeroBalanceRows([fixtures.profiles[2]])[0].status, 'Tạm khóa')

console.log(`\nKết quả backend: ${passed} pass, ${failed} fail\n`)
if (failed > 0) process.exit(1)
