/**
 * Unit test cho tính năng chia sẻ công khai báo cáo tiến bộ:
 * - Edge Function `student-report-shares` (POST create / GET list / DELETE revoke)
 * - Nhánh public `student-history?scope=shared-report&shareToken=...`
 * - Migration `student_report_shares`
 *
 * Chạy: node supabase/scripts/test-student-report-shares.mjs
 *
 * Không cần mạng, không deploy, không dùng dữ liệu thật. Test gồm 2 lớp:
 * 1. Mô phỏng hành vi bằng in-memory store (mirror logic, oracle viết tay).
 * 2. Kiểm tra contract tĩnh trên source/migration/config để chặn drift bảo mật
 *    (raw token không lưu, list không trả hash, không hard-delete, RLS không policy).
 */

import { createHash, randomBytes, randomUUID, timingSafeEqual } from 'node:crypto'
import { readFileSync, readdirSync } from 'node:fs'

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

/* -----------------------------------------------------------------------
 * 1. Hàm thuần mirror từ Edge Function / student-history
 * -------------------------------------------------------------------- */
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
const SHARE_TOKEN_RE = /^([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})\.([A-Za-z0-9_-]{43})$/
const DEFAULT_EXPIRES_IN_DAYS = 30
const MIN_EXPIRES_IN_DAYS = 1
const MAX_EXPIRES_IN_DAYS = 90

function isValidUuid(raw) {
  return typeof raw === 'string' && UUID_RE.test(raw)
}

function isValidCalendarDate(raw) {
  if (typeof raw !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(raw)) return false
  const [y, m, d] = raw.split('-').map(Number)
  if (!Number.isInteger(y) || !Number.isInteger(m) || !Number.isInteger(d)) return false
  const dt = new Date(Date.UTC(y, m - 1, d))
  return dt.getUTCFullYear() === y && dt.getUTCMonth() === m - 1 && dt.getUTCDate() === d
}

function parseExpiresInDays(raw) {
  if (raw === undefined || raw === null || raw === '') return { ok: true, days: DEFAULT_EXPIRES_IN_DAYS }
  const days = typeof raw === 'number' ? raw : (typeof raw === 'string' ? Number(raw) : NaN)
  if (!Number.isInteger(days) || days < MIN_EXPIRES_IN_DAYS || days > MAX_EXPIRES_IN_DAYS) {
    return { ok: false, message: `expiresInDays must be an integer between ${MIN_EXPIRES_IN_DAYS} and ${MAX_EXPIRES_IN_DAYS}` }
  }
  return { ok: true, days }
}

function generateShareSecret() {
  return randomBytes(32).toString('base64url')
}

function sha256Hex(input) {
  return createHash('sha256').update(input, 'utf8').digest('hex')
}

function constantTimeEqualHex(a, b) {
  if (typeof a !== 'string' || typeof b !== 'string' || a.length !== b.length) return false
  return timingSafeEqual(Buffer.from(a, 'utf8'), Buffer.from(b, 'utf8'))
}

function periodDays(fromDate, toDate) {
  const fromMs = new Date(`${fromDate}T00:00:00.000Z`).getTime()
  const toMs = new Date(`${toDate}T00:00:00.000Z`).getTime()
  return Math.round((toMs - fromMs) / 86400000) + 1
}

function shareStatus(row, nowMs) {
  if (row.revoked_at) return 'revoked'
  const expiresMs = new Date(row.expires_at).getTime()
  if (!Number.isFinite(expiresMs) || expiresMs <= nowMs) return 'expired'
  return 'active'
}

function toShareSummary(row, nowMs) {
  return {
    shareId: row.id,
    studentId: row.student_id,
    classId: row.class_id,
    fromDate: row.from_date,
    toDate: row.to_date,
    createdBy: row.created_by,
    createdAt: row.created_at,
    expiresAt: row.expires_at,
    revokedAt: row.revoked_at || null,
    status: shareStatus(row, nowMs),
  }
}

/* -----------------------------------------------------------------------
 * 2. In-memory store + endpoint simulation
 * -------------------------------------------------------------------- */
function createStore() {
  return {
    rows: [],
    enrollments: new Set(),
    nextClockSkewMs: 0,
  }
}

function enrollmentKey(studentId, classId) {
  return `${studentId}:${classId}`
}

function createShare(store, actor, input, nowMs) {
  if (!actor || actor.role !== 'ADMIN') return { status: 403, error: 'Forbidden: Admin access required' }

  const { studentId, classId, fromDate, toDate } = input
  if (!isValidUuid(studentId)) return { status: 400, error: 'studentId must be a valid UUID' }
  if (!isValidUuid(classId)) return { status: 400, error: 'classId must be a valid UUID' }
  if (!isValidCalendarDate(fromDate) || !isValidCalendarDate(toDate)) {
    return { status: 400, error: 'fromDate/toDate must be valid calendar dates formatted as YYYY-MM-DD' }
  }
  if (fromDate > toDate) return { status: 400, error: 'fromDate must be earlier than or equal to toDate' }

  const expires = parseExpiresInDays(input.expiresInDays)
  if (!expires.ok) return { status: 400, error: expires.message }

  if (!store.enrollments.has(enrollmentKey(studentId, classId))) {
    return { status: 400, error: 'Student is not enrolled in this class' }
  }

  const shareId = randomUUID()
  const secret = generateShareSecret()
  const row = {
    id: shareId,
    token_secret_hash: sha256Hex(secret),
    student_id: studentId,
    class_id: classId,
    from_date: fromDate,
    to_date: toDate,
    created_by: actor.id,
    expires_at: new Date(nowMs + expires.days * 86400000).toISOString(),
    revoked_at: null,
    created_at: new Date(nowMs).toISOString(),
  }
  store.rows.push(row)

  return {
    status: 201,
    data: {
      shareId,
      shareToken: `${shareId}.${secret}`,
      studentId,
      classId,
      fromDate,
      toDate,
      createdAt: row.created_at,
      expiresAt: row.expires_at,
      createdBy: actor.id,
      status: 'active',
      period: { fromDate, toDate, days: periodDays(fromDate, toDate) },
    },
  }
}

function listShares(store, actor, { studentId, classId }, nowMs) {
  if (!actor || actor.role !== 'ADMIN') return { status: 403, error: 'Forbidden: Admin access required' }
  if (!isValidUuid(studentId)) return { status: 400, error: 'studentId must be a valid UUID' }
  if (classId && !isValidUuid(classId)) return { status: 400, error: 'classId must be a valid UUID' }

  const shares = store.rows
    .filter((row) => row.student_id === studentId && (!classId || row.class_id === classId))
    .sort((a, b) => String(b.created_at).localeCompare(String(a.created_at)))
    .map((row) => toShareSummary(row, nowMs))

  return { status: 200, data: { studentId, classId: classId || null, shares } }
}

function revokeShare(store, actor, shareId, nowMs) {
  if (!actor || actor.role !== 'ADMIN') return { status: 403, error: 'Forbidden: Admin access required' }
  if (!isValidUuid(shareId)) return { status: 400, error: 'shareId must be a valid UUID' }

  const nowIso = new Date(nowMs).toISOString()

  // Atomic conditional update: UPDATE ... WHERE id = ? AND revoked_at IS NULL RETURNING revoked_at.
  // Chỉ request match được row null mới thắng race.
  const mutableRow = store.rows.find((r) => r.id === shareId && r.revoked_at === null)
  if (mutableRow && !store.forceUpdateZeroRows) {
    mutableRow.revoked_at = nowIso
    return {
      status: 200,
      data: { shareId, revokedAt: nowIso, status: 'revoked', alreadyRevoked: false },
    }
  }

  // Update 0 row: đọc lại trạng thái thực tế (không dùng snapshot trước update).
  const current = store.rows.find((r) => r.id === shareId)
  if (!current) return { status: 404, error: 'Report share not found' }
  if (!current.revoked_at) {
    return { status: 409, error: 'Report share revoke state is inconsistent, please retry' }
  }
  return {
    status: 200,
    data: { shareId, revokedAt: current.revoked_at, status: 'revoked', alreadyRevoked: true },
  }
}

/**
 * Mô phỏng hành vi CŨ (trước fix) để chứng minh test bắt được lỗi:
 * cả 2 request đọc snapshot revoked_at=null, request 2 update 0 row nhưng vẫn
 * trả alreadyRevoked=false. Hàm này phải FAIL assertion idempotent bên dưới.
 */
function legacyConcurrentRevoke(store, shareId) {
  const row = store.rows.find((r) => r.id === shareId)
  const snapshot1 = row.revoked_at
  const snapshot2 = row.revoked_at // request 2 đọc trước khi request 1 ghi
  const t1 = '2026-10-24T10:00:00.000Z'
  const t2 = '2026-10-24T10:00:00.001Z'

  if (!row.revoked_at) row.revoked_at = t1
  const first = { alreadyRevoked: !!snapshot1, revokedAt: row.revoked_at }

  if (!row.revoked_at) row.revoked_at = t2
  const second = { alreadyRevoked: !!snapshot2, revokedAt: row.revoked_at }

  return [first, second]
}

function resolveSharedReport(store, rawToken, nowMs) {
  const token = (rawToken || '').trim()
  if (!token) return { status: 400, error: 'Missing shareToken' }

  const match = SHARE_TOKEN_RE.exec(token)
  if (!match) return { status: 400, error: 'Invalid share token format' }

  const shareId = match[1].toLowerCase()
  const secret = match[2]
  const row = store.rows.find((r) => r.id === shareId)
  if (!row || !row.token_secret_hash) {
    return { status: 404, error: 'Report link is invalid or no longer available' }
  }

  const providedHash = sha256Hex(secret)
  if (!constantTimeEqualHex(providedHash, row.token_secret_hash)) {
    return { status: 404, error: 'Report link is invalid or no longer available' }
  }
  if (row.revoked_at) return { status: 410, error: 'Report link has been revoked' }

  const expiresMs = new Date(row.expires_at).getTime()
  if (!Number.isFinite(expiresMs) || expiresMs <= nowMs) {
    return { status: 410, error: 'Report link has expired' }
  }
  if (!store.enrollments.has(enrollmentKey(row.student_id, row.class_id))) {
    return { status: 404, error: 'Report link is invalid or no longer available' }
  }

  return { status: 200, share: row }
}

/**
 * Mô phỏng report scope: dữ liệu lấy từ share row, BỎ QUA query ids/ngày client gửi.
 * Trả về ids nội bộ để test oracle và payload public đã lọc.
 */
function buildSharedReport(store, share, clientQuery = {}) {
  // Query client không được dùng cho bất kỳ trường nào dưới đây.
  void clientQuery

  const classHomeworks = store.homeworks.filter((h) => h.classId === share.class_id)
  const hwIds = new Set(classHomeworks.map((h) => h.id))
  const fromMs = new Date(`${share.from_date}T00:00:00.000Z`).getTime()
  const toMs = new Date(`${share.to_date}T23:59:59.999Z`).getTime()

  const submissions = store.submissions.filter((s) => {
    if (!hwIds.has(s.homework_id)) return false
    const t = new Date(s.submitted_at).getTime()
    return Number.isFinite(t) && t >= fromMs && t <= toMs
  })

  return {
    internal: {
      studentId: share.student_id,
      classId: share.class_id,
      fromDate: share.from_date,
      toDate: share.to_date,
      submissionIds: submissions.map((s) => s.id),
    },
    public: {
      scope: 'SHARED_REPORT',
      shareId: share.id,
      expiresAt: share.expires_at,
      studentName: store.studentName,
      className: store.className,
      period: { fromDate: share.from_date, toDate: share.to_date, days: periodDays(share.from_date, share.to_date) },
      summary: { attemptCount: submissions.length },
      submissionIds: undefined,
    },
  }
}

function buildAuthenticatedReport(actor, query) {
  if (query.scope !== 'REPORT') return { status: 400 }
  if (!actor) return { status: 401, error: 'Unauthorized: Missing token' }
  if (actor.role === 'STUDENT' && query.studentId && query.studentId !== actor.id) {
    return { status: 403, error: 'Forbidden: You can only view your own progress report' }
  }
  return {
    status: 200,
    data: {
      scope: 'REPORT',
      studentId: query.studentId || actor.id,
      classId: query.classId || null,
      period: { fromDate: query.fromDate, toDate: query.toDate },
    },
  }
}

/* -----------------------------------------------------------------------
 * Fixtures
 * -------------------------------------------------------------------- */
const ADMIN_1 = { id: '11111111-1111-4111-8111-111111111111', role: 'ADMIN' }
const ADMIN_2 = { id: '22222222-2222-4222-8222-222222222222', role: 'ADMIN' }
const STUDENT_1 = { id: '33333333-3333-4333-8333-333333333333', role: 'STUDENT' }
const STUDENT_2 = { id: '44444444-4444-4444-8444-444444444444', role: 'STUDENT' }
const CLASS_A = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'
const CLASS_B = 'bbbbbbbb-bbbb-4bbb-9bbb-bbbbbbbbbbbb'
const CLASS_EMPTY = 'cccccccc-cccc-4ccc-8ccc-cccccccccccc'

function seedStore() {
  const store = createStore()
  store.enrollments.add(enrollmentKey(STUDENT_1.id, CLASS_A))
  store.enrollments.add(enrollmentKey(STUDENT_2.id, CLASS_B))
  store.enrollments.add(enrollmentKey(STUDENT_1.id, CLASS_EMPTY))

  store.homeworks = [
    { id: 'hw_a1', classId: CLASS_A },
    { id: 'hw_a2', classId: CLASS_A },
    { id: 'hw_b1', classId: CLASS_B },
  ]
  store.submissions = [
    { id: 'sub_a1', homework_id: 'hw_a1', submitted_at: '2026-10-15T08:00:00.000Z' },
    { id: 'sub_a2_last_ms', homework_id: 'hw_a2', submitted_at: '2026-10-31T23:59:59.999Z' },
    { id: 'sub_a_next_day', homework_id: 'hw_a2', submitted_at: '2026-11-01T00:00:00.000Z' },
    { id: 'sub_b1', homework_id: 'hw_b1', submitted_at: '2026-10-20T08:00:00.000Z' },
  ]
  store.studentName = 'Nguyễn Văn A'
  store.className = 'Lớp 10A'
  return store
}

const NOW = Date.parse('2026-10-24T09:00:00.000Z')
const PERIOD = { fromDate: '2026-10-01', toDate: '2026-10-31' }

/* -----------------------------------------------------------------------
 * 3. Token & storage invariants
 * -------------------------------------------------------------------- */
console.log('--- 1. Token & lưu trữ ---')
{
  const store = seedStore()
  const created = createShare(store, ADMIN_1, { studentId: STUDENT_1.id, classId: CLASS_A, ...PERIOD }, NOW)
  eq('ADMIN tạo share thành công (201)', created.status, 201)

  const token = created.data.shareToken
  const [shareId, secret] = token.split('.')
  check('token đúng format <uuid>.<secret>', SHARE_TOKEN_RE.test(token))
  check('shareId trả về khớp phần đầu token', shareId === created.data.shareId)
  eq('secret dài 43 ký tự base64url = 256-bit', secret.length, 43)
  check('secret chỉ gồm base64url', /^[A-Za-z0-9_-]{43}$/.test(secret))

  const row = store.rows[0]
  check('DB chỉ lưu hash hex 64 ký tự', /^[0-9a-f]{64}$/.test(row.token_secret_hash))
  check('hash đúng là SHA-256 của secret', row.token_secret_hash === sha256Hex(secret))
  check('row KHÔNG chứa raw secret', !JSON.stringify(row).includes(secret))
  check('row KHÔNG chứa raw token', !JSON.stringify(row).includes(token))
  check('không có cột share_token/raw_token trong row', !('share_token' in row) && !('token' in row))
  check('hash không trùng secret', row.token_secret_hash !== secret)

  // Hai share cùng kỳ cho cùng học sinh/lớp phải có secret khác nhau (entropy thật).
  const created2 = createShare(store, ADMIN_1, { studentId: STUDENT_1.id, classId: CLASS_A, ...PERIOD }, NOW)
  check('hai lần tạo có secret khác nhau', created.data.shareToken !== created2.data.shareToken)
  check('hai lần tạo có hash khác nhau', store.rows[0].token_secret_hash !== store.rows[1].token_secret_hash)
}

/* -----------------------------------------------------------------------
 * 4. Create validation + raw token chỉ trả một lần
 * -------------------------------------------------------------------- */
console.log('--- 2. Create validation & one-time token ---')
{
  const store = seedStore()

  eq('thiếu/sai studentId -> 400', createShare(store, ADMIN_1, { classId: CLASS_A, ...PERIOD }, NOW).status, 400)
  eq('sai classId -> 400', createShare(store, ADMIN_1, { studentId: STUDENT_1.id, ...PERIOD }, NOW).status, 400)
  eq('ngày không tồn tại 2026-02-30 -> 400', createShare(store, ADMIN_1, {
    studentId: STUDENT_1.id, classId: CLASS_A, fromDate: '2026-02-30', toDate: '2026-03-01',
  }, NOW).status, 400)
  eq('fromDate > toDate -> 400', createShare(store, ADMIN_1, {
    studentId: STUDENT_1.id, classId: CLASS_A, fromDate: '2026-10-31', toDate: '2026-10-01',
  }, NOW).status, 400)
  eq('học sinh không ghi danh lớp -> 400', createShare(store, ADMIN_1, {
    studentId: STUDENT_1.id, classId: CLASS_B, ...PERIOD,
  }, NOW).status, 400)
  eq('STUDENT không được tạo share -> 403', createShare(store, STUDENT_1, {
    studentId: STUDENT_1.id, classId: CLASS_A, ...PERIOD,
  }, NOW).status, 403)

  eq('mặc định expiresInDays = 30 ngày', parseExpiresInDays(undefined), { ok: true, days: 30 })
  eq('expiresInDays = 1 hợp lệ', parseExpiresInDays(1), { ok: true, days: 1 })
  eq('expiresInDays = 90 hợp lệ', parseExpiresInDays('90'), { ok: true, days: 90 })
  check('expiresInDays = 0 bị chặn', parseExpiresInDays(0).ok === false)
  check('expiresInDays = 91 bị chặn', parseExpiresInDays(91).ok === false)
  check('expiresInDays = 1.5 bị chặn', parseExpiresInDays(1.5).ok === false)
  check('expiresInDays = "abc" bị chặn', parseExpiresInDays('abc').ok === false)

  const created = createShare(store, ADMIN_1, { studentId: STUDENT_1.id, classId: CLASS_A, ...PERIOD }, NOW)
  const expiresMs = new Date(created.data.expiresAt).getTime()
  eq('expiresAt mặc định = now + 30 ngày', expiresMs - NOW, 30 * 86400000)
  eq('period.days inclusive 01/10..31/10 = 31', created.data.period.days, 31)
  eq('create trả status active', created.data.status, 'active')

  const listed = listShares(store, ADMIN_1, { studentId: STUDENT_1.id, classId: CLASS_A }, NOW)
  check('create response có shareToken (đúng một lần)', typeof created.data.shareToken === 'string' && created.data.shareToken.includes('.'))
  check('list response KHÔNG có shareToken/raw token', !JSON.stringify(listed.data).includes(created.data.shareToken))
  check('list response KHÔNG có token_secret_hash', !JSON.stringify(listed.data).includes('token_secret_hash'))
  check('list response KHÔNG có secret', !JSON.stringify(listed.data).includes(created.data.shareToken.split('.')[1]))
  eq('list trả đúng share vừa tạo', listed.data.shares.map((s) => s.shareId), [created.data.shareId])
}

/* -----------------------------------------------------------------------
 * 5. Public resolve: token giả/tampered/revoked/expired/enrollment
 * -------------------------------------------------------------------- */
console.log('--- 3. Public token security ---')
{
  const store = seedStore()
  const created = createShare(store, ADMIN_1, { studentId: STUDENT_1.id, classId: CLASS_A, ...PERIOD }, NOW)
  const token = created.data.shareToken

  eq('token hợp lệ mở được', resolveSharedReport(store, token, NOW).status, 200)
  eq('token có khoảng trắng đầu/cuối vẫn parse đúng', resolveSharedReport(store, `  ${token}  `, NOW).status, 200)

  eq('thiếu token -> 400', resolveSharedReport(store, '', NOW).status, 400)
  eq('token không có dấu chấm -> 400', resolveSharedReport(store, created.data.shareId, NOW).status, 400)
  eq('secret sai độ dài -> 400', resolveSharedReport(store, `${created.data.shareId}.abc`, NOW).status, 400)
  eq('token có 2 dấu chấm -> 400', resolveSharedReport(store, `${token}.x`, NOW).status, 400)
  eq('shareId không tồn tại -> 404', resolveSharedReport(store, `${randomUUID()}.${'A'.repeat(43)}`, NOW).status, 404)

  const [id, secret] = token.split('.')
  const tamperedSecret = (secret[0] === 'A' ? 'B' : 'A') + secret.slice(1)
  eq('secret bị sửa 1 ký tự -> 404', resolveSharedReport(store, `${id}.${tamperedSecret}`, NOW).status, 404)

  const another = createShare(store, ADMIN_1, { studentId: STUDENT_1.id, classId: CLASS_A, ...PERIOD }, NOW)
  eq('token của share khác (id share này + secret share kia) -> 404', resolveSharedReport(
    store,
    `${created.data.shareId}.${another.data.shareToken.split('.')[1]}`,
    NOW
  ).status, 404)

  // Revoked: thu hồi rồi mở lại phải fail closed.
  const revoked = revokeShare(store, ADMIN_1, created.data.shareId, NOW + 1000)
  eq('revoke trả 200', revoked.status, 200)
  eq('revokedAt được set', typeof revoked.data.revokedAt, 'string')
  eq('token đã thu hồi -> 410', resolveSharedReport(store, token, NOW + 2000).status, 410)
  const revokedAgain = revokeShare(store, ADMIN_1, created.data.shareId, NOW + 3000)
  eq('revoke lần 2 vẫn 200 (idempotent)', revokedAgain.status, 200)
  eq('revoke lần 2 giữ nguyên revokedAt', revokedAgain.data.revokedAt, revoked.data.revokedAt)
  eq('revoke lần 2 báo alreadyRevoked', revokedAgain.data.alreadyRevoked, true)

  // Expired: đúng thời điểm expires_at cũng coi là hết hạn (fail closed).
  const store2 = seedStore()
  const shortLived = createShare(store2, ADMIN_1, {
    studentId: STUDENT_1.id, classId: CLASS_A, ...PERIOD, expiresInDays: 1,
  }, NOW)
  const expiresMs = new Date(shortLived.data.expiresAt).getTime()
  eq('trước hạn 1ms mở được', resolveSharedReport(store2, shortLived.data.shareToken, expiresMs - 1).status, 200)
  eq('đúng thời điểm hết hạn -> 410', resolveSharedReport(store2, shortLived.data.shareToken, expiresMs).status, 410)
  eq('sau hạn -> 410', resolveSharedReport(store2, shortLived.data.shareToken, expiresMs + 1).status, 410)
  eq('list báo status expired', listShares(store2, ADMIN_1, { studentId: STUDENT_1.id }, expiresMs).data.shares[0].status, 'expired')

  // Enrollment bị xóa sau khi tạo share: fail closed.
  const store3 = seedStore()
  const enrolled = createShare(store3, ADMIN_1, { studentId: STUDENT_1.id, classId: CLASS_A, ...PERIOD }, NOW)
  store3.enrollments.delete(enrollmentKey(STUDENT_1.id, CLASS_A))
  eq('ghi danh bị xóa sau khi tạo share -> 404 (fail closed)', resolveSharedReport(store3, enrolled.data.shareToken, NOW).status, 404)
}

/* -----------------------------------------------------------------------
 * 6. Query IDs không override share + report vẫn lọc lớp + ngày inclusive
 * -------------------------------------------------------------------- */
console.log('--- 4. Query ids/ngày không override share ---')
{
  const store = seedStore()
  const created = createShare(store, ADMIN_1, { studentId: STUDENT_1.id, classId: CLASS_A, ...PERIOD }, NOW)
  const resolved = resolveSharedReport(store, created.data.shareToken, NOW)
  const row = resolved.share

  const maliciousQuery = {
    studentId: STUDENT_2.id,
    classId: CLASS_B,
    fromDate: '2020-01-01',
    toDate: '2030-12-31',
  }
  const report = buildSharedReport(store, row, maliciousQuery)

  eq('studentId lấy từ DB share, không từ query', report.internal.studentId, STUDENT_1.id)
  eq('classId lấy từ DB share, không từ query', report.internal.classId, CLASS_A)
  eq('fromDate lấy từ DB share, không từ query', report.internal.fromDate, PERIOD.fromDate)
  eq('toDate lấy từ DB share, không từ query', report.internal.toDate, PERIOD.toDate)

  eq('chỉ nộp bài của lớp A, bỏ hẳn lớp B', report.internal.submissionIds, ['sub_a1', 'sub_a2_last_ms'])
  check('submission lớp B không xuất hiện', !report.internal.submissionIds.includes('sub_b1'))
  check('submission sau toDate (01/11) không xuất hiện', !report.internal.submissionIds.includes('sub_a_next_day'))
  check('submission đúng 23:59:59.999 của toDate vẫn tính (inclusive)', report.internal.submissionIds.includes('sub_a2_last_ms'))

  eq('public payload studentName là tên thật từ DB', report.public.studentName, 'Nguyễn Văn A')
  eq('public payload className là tên lớp thật từ DB', report.public.className, 'Lớp 10A')
  const publicJson = JSON.stringify(report.public)
  check('public payload không chứa raw token', !publicJson.includes(created.data.shareToken))
  check('public payload không chứa secret/hash', !publicJson.includes('token_secret_hash'))
  check('public payload không chứa số điện thoại/username', !/phone|username/i.test(publicJson))
  eq('public payload có shareId & expiresAt để hiển thị hạn', {
    shareId: report.public.shareId,
    expiresAt: report.public.expiresAt,
  }, { shareId: created.data.shareId, expiresAt: created.data.expiresAt })

  // Lớp không có homework: báo cáo rỗng nhưng KHÔNG fallback sang bài của lớp khác.
  const emptyShare = createShare(store, ADMIN_1, { studentId: STUDENT_1.id, classId: CLASS_EMPTY, ...PERIOD }, NOW)
  const emptyReport = buildSharedReport(store, resolveSharedReport(store, emptyShare.data.shareToken, NOW).share, maliciousQuery)
  eq('lớp không có homework -> submissions rỗng (không fallback)', emptyReport.internal.submissionIds, [])
  eq('vẫn giữ đúng classId của share lớp rỗng', emptyReport.internal.classId, CLASS_EMPTY)
}

/* -----------------------------------------------------------------------
 * 7. Permission create/list/revoke
 * -------------------------------------------------------------------- */
console.log('--- 5. Permission creator/admin ---')
{
  const store = seedStore()
  const created = createShare(store, ADMIN_1, { studentId: STUDENT_1.id, classId: CLASS_A, ...PERIOD }, NOW)
  eq('created_by lưu đúng người tạo', store.rows[0].created_by, ADMIN_1.id)

  eq('STUDENT không được list -> 403', listShares(store, STUDENT_1, { studentId: STUDENT_1.id }, NOW).status, 403)
  eq('STUDENT không được revoke -> 403', revokeShare(store, STUDENT_1, created.data.shareId, NOW).status, 403)
  eq('revoke share không tồn tại -> 404', revokeShare(store, ADMIN_1, randomUUID(), NOW).status, 404)
  eq('revoke shareId sai format -> 400', revokeShare(store, ADMIN_1, 'not-a-uuid', NOW).status, 400)

  // Repository semantics: ADMIN hiện là gia sư duy nhất -> ADMIN khác vẫn thu hồi được.
  const byOtherAdmin = revokeShare(store, ADMIN_2, created.data.shareId, NOW + 1000)
  eq('ADMIN khác được thu hồi share (rule gia sư duy nhất)', byOtherAdmin.status, 200)
  eq('list sau revoke báo status revoked', listShares(store, ADMIN_1, { studentId: STUDENT_1.id }, NOW + 2000).data.shares[0].status, 'revoked')
  eq('row vẫn tồn tại (soft revoke, không hard-delete)', store.rows.length, 1)
}

/* -----------------------------------------------------------------------
 * 5b. DELETE revoke concurrency: atomic null -> timestamp
 * ---------------------------------------------------------------- */
console.log('--- 5b. Revoke race / update 0 row ---')
{
  // Hai request đồng thời: chỉ request thắng race trả alreadyRevoked=false,
  // request sau trả true và cùng revokedAt thực tế.
  const store = seedStore()
  const created = createShare(store, ADMIN_1, { studentId: STUDENT_1.id, classId: CLASS_A, ...PERIOD }, NOW)
  const shareId = created.data.shareId

  const first = revokeShare(store, ADMIN_1, shareId, NOW + 1000)
  const second = revokeShare(store, ADMIN_2, shareId, NOW + 2000)
  eq('request thắng race trả alreadyRevoked=false', first.data.alreadyRevoked, false)
  eq('request thua race (update 0 row) trả alreadyRevoked=true', second.data.alreadyRevoked, true)
  eq('hai request trả cùng revokedAt thực tế', second.data.revokedAt, first.data.revokedAt)
  eq('revokedAt là timestamp của request thắng, không bị request sau ghi đè', first.data.revokedAt, new Date(NOW + 1000).toISOString())
  eq('DB chỉ có một timestamp revoke', store.rows.filter((r) => r.revoked_at === first.data.revokedAt).length, 1)

  // Đối chứng: mô phỏng code cũ (stale snapshot) sẽ trả 2 lần alreadyRevoked=false.
  // Assertion này chứng minh test phân biệt được bug và fix.
  const legacyStore = seedStore()
  const legacyShare = createShare(legacyStore, ADMIN_1, { studentId: STUDENT_1.id, classId: CLASS_A, ...PERIOD }, NOW)
  const legacy = legacyConcurrentRevoke(legacyStore, legacyShare.data.shareId)
  eq('đối chứng code cũ: cả hai request đều báo alreadyRevoked=false (đây là bug cần bắt)', legacy.map((r) => r.alreadyRevoked), [false, false])
  check('fix atomic không còn hành vi hai lần false', !(first.data.alreadyRevoked === false && second.data.alreadyRevoked === false))

  // Update 0 row + row biến mất (cascade) -> 404, không báo revoked thành công.
  const missingStore = seedStore()
  const missing = createShare(missingStore, ADMIN_1, { studentId: STUDENT_1.id, classId: CLASS_A, ...PERIOD }, NOW)
  missingStore.rows = []
  eq('update 0 row và row không còn -> 404', revokeShare(missingStore, ADMIN_1, missing.data.shareId, NOW).status, 404)

  // Update 0 row nhưng row vẫn null (trạng thái bất thường) -> 409, tuyệt đối không
  // tuyên bố revoked khi DB chưa có timestamp.
  const inconsistentStore = seedStore()
  const inconsistent = createShare(inconsistentStore, ADMIN_1, { studentId: STUDENT_1.id, classId: CLASS_A, ...PERIOD }, NOW)
  inconsistentStore.forceUpdateZeroRows = true
  eq('update 0 row nhưng revoked_at vẫn null -> 409', revokeShare(inconsistentStore, ADMIN_1, inconsistent.data.shareId, NOW).status, 409)
  eq('không ghi timestamp giả khi inconsistent', inconsistentStore.rows[0].revoked_at, null)
}

/* -----------------------------------------------------------------------
 * 8. Legacy authenticated report không bị nới lỏng
 * -------------------------------------------------------------------- */
console.log('--- 6. Legacy scope=report vẫn yêu cầu auth ---')
{
  eq('scope=REPORT không Authorization -> 401', buildAuthenticatedReport(null, { scope: 'REPORT', fromDate: '2026-10-01', toDate: '2026-10-31' }).status, 401)
  eq('STUDENT xem báo cáo người khác -> 403', buildAuthenticatedReport(STUDENT_1, {
    scope: 'REPORT', studentId: STUDENT_2.id, fromDate: '2026-10-01', toDate: '2026-10-31',
  }).status, 403)
  const legacy = buildAuthenticatedReport(ADMIN_1, {
    scope: 'REPORT', studentId: STUDENT_1.id, classId: CLASS_A, fromDate: '2026-10-01', toDate: '2026-10-31',
  })
  eq('ADMIN report hợp lệ -> 200', legacy.status, 200)
  eq('legacy response giữ scope REPORT/studentId/classId', {
    scope: legacy.data.scope,
    studentId: legacy.data.studentId,
    classId: legacy.data.classId,
  }, { scope: 'REPORT', studentId: STUDENT_1.id, classId: CLASS_A })
  eq('public scope không bị nhầm thành legacy', buildSharedReport(seedStore(), { id: 'x' }, {}).public.scope, 'SHARED_REPORT')
}

/* -----------------------------------------------------------------------
 * 9. Contract tĩnh trên source/migration/config
 * -------------------------------------------------------------------- */
console.log('--- 7. Contract source/migration/config ---')
{
  const migrationPath = new URL('../migrations/20261024000000_student_report_shares.sql', import.meta.url)
  const shareFnPath = new URL('../functions/student-report-shares/index.ts', import.meta.url)
  const historyPath = new URL('../functions/student-history/index.ts', import.meta.url)
  const configPath = new URL('../config.toml', import.meta.url)

  const migration = readFileSync(migrationPath, 'utf8')
  const shareFn = readFileSync(shareFnPath, 'utf8')
  const history = readFileSync(historyPath, 'utf8')
  const config = readFileSync(configPath, 'utf8')

  check('migration có bảng student_report_shares', /create table if not exists public\.student_report_shares/i.test(migration))
  check('migration chỉ có token_secret_hash, không có cột raw token', /token_secret_hash/.test(migration) && !/^\s*(share_)?token\s+(text|varchar)/im.test(migration))
  check('token_secret_hash check đúng SHA-256 hex 64', /token_secret_hash\s*~\s*'\^\[0-9a-f\]\{64\}\$'/.test(migration))
  check('migration có FK student/class/created_by', (migration.match(/references public\.(profiles|classes)\(id\)/g) || []).length === 3)
  check('migration có check from_date <= to_date', /from_date\s*<=\s*to_date/.test(migration))
  check('migration bật RLS', /enable row level security/i.test(migration))
  check('migration KHÔNG tạo policy public', !/create policy/i.test(migration))
  check('migration revoke anon/authenticated và grant service_role', /revoke all on table public\.student_report_shares from anon, authenticated/i.test(migration) && /grant all on table public\.student_report_shares to service_role/i.test(migration))
  check('migration có index unique cho token hash', /unique index[\s\S]{0,120}token_secret_hash/i.test(migration))

  check('function quản lý tự requireAuth', /requireAuth\(req\)/.test(shareFn))
  check('function quản lý chặn role != ADMIN (403)', /role !== 'ADMIN'/.test(shareFn) && /Forbidden: Admin access required'?, 403/.test(shareFn))
  check('GET list select KHÔNG có token_secret_hash', !/select\('id, student_id, class_id, from_date, to_date, created_by, expires_at, revoked_at, created_at'[\s\S]{0,80}token_secret_hash/.test(shareFn))
  check('create trả shareToken đúng một lần', /shareToken: `\$\{shareId\}\.\$\{secret\}`/.test(shareFn))
  check('create trả status 201', /\}, 201\)/.test(shareFn))
  check('function không log token', !/console\.(log|info|debug|warn|error)\([^\n]*shareToken/i.test(shareFn))
  check('revoke là update revoked_at (soft)', /update\(\{ revoked_at: nowIso \}\)/.test(shareFn))
  check('revoke atomic: update ... is(revoked_at,null) ... select(revoked_at) ... maybeSingle', /\.update\(\{ revoked_at: nowIso \}\)[\s\S]{0,160}\.is\('revoked_at', null\)[\s\S]{0,180}\.select\('revoked_at'\)[\s\S]{0,100}\.maybeSingle\(\)/.test(shareFn))
  check('không còn snapshot alreadyRevoked từ read trước update', !/const alreadyRevoked = \!\!revokedAt/.test(shareFn) && !/select\('id, created_by, expires_at, revoked_at'\)/.test(shareFn))
  check('request thắng race trả alreadyRevoked:false', /revokedRow[\s\S]{0,500}alreadyRevoked: false/.test(shareFn))
  check('request thua race trả alreadyRevoked:true với revokedAt đọc lại', /alreadyRevoked: true/.test(shareFn) && /revokedAt: current\.revoked_at/.test(shareFn))
  check('update 0 row + không tồn tại -> 404', /if \(!current\) \{[\s\S]{0,120}Report share not found[\s\S]{0,40}404/.test(shareFn))
  check('update 0 row + vẫn null -> 409 (không báo revoked giả)', /if \(!current\.revoked_at\) \{[\s\S]{0,220}revoke state is inconsistent[\s\S]{0,40}409/.test(shareFn))
  check('function không hard-delete share', !/\.delete\(\)/.test(shareFn))
  check('create không tự retry insert', !/for\s*\([^)]*\)\s*\{[\s\S]{0,200}insert\([\s\S]{0,200}retry/i.test(shareFn))

  check('student-history resolve share TRƯỚC auth', history.indexOf('resolveSharedReport(serviceRoleClient') > -1 && history.indexOf('resolveSharedReport(serviceRoleClient') < history.indexOf('if (authHeader)'))
  check('public scope bỏ qua auth nhưng chỉ nhánh shared', /if \(!isSharedReportQuery\) \{[\s\S]{0,500}if \(authHeader\)/.test(history))
  check('fromDate public lấy từ DB share', /const fromDate = shared \? shared\.from_date : url\.searchParams\.get\('fromDate'\)/.test(history))
  check('toDate public lấy từ DB share', /const toDate = shared \? shared\.to_date : url\.searchParams\.get\('toDate'\)/.test(history))
  check('reportStudentId/classId public lấy từ DB share', /reportStudentId = shared\.student_id/.test(history) && /reportClassId = shared\.class_id/.test(history))
  check('hash so sánh constant-time', /constantTimeEqualHex\(providedHash/.test(history))
  check('token parse chặt bằng regex 43 ký tự base64url', /\[A-Za-z0-9_-\]\{43\}/.test(history))
  check('public branch chặn enrollment bị xóa', /Failed to verify enrollment[\s\S]{0,300}Report link is invalid or no longer available/.test(history))
  check('public response có metadata tên học sinh/lớp/hạn', /studentName: sharedStudentName/.test(history) && /className: sharedClassName/.test(history) && /expiresAt: shared\.expires_at/.test(history))

  const publicStart = history.indexOf("scope: 'SHARED_REPORT'")
  const publicEnd = history.indexOf("scope: 'REPORT'", publicStart)
  const publicBlock = publicStart > -1 && publicEnd > publicStart ? history.slice(publicStart, publicEnd) : ''
  check('public payload không chứa token/hash', publicBlock.length > 0 && !/token|hash/i.test(publicBlock))
  check('public payload không trả id nội bộ', publicBlock.length > 0 && !/submissionId|homeworkId|studentId|classId|lessonId|chapterId/.test(publicBlock))

  check('config bật verify_jwt cho student-report-shares', /\[functions\.student-report-shares\]\s*\nverify_jwt\s*=\s*true/.test(config))
  check('config vẫn giữ student-history public (verify_jwt=false)', /\[functions\.student-history\]\s*\nverify_jwt\s*=\s*false/.test(config))
}


/* -----------------------------------------------------------------------
 * 8. Thiếu bảng share (migration chưa apply) -> 503 SETUP_REQUIRED (admin),
 *    public fail closed generic, FE map thân thiện, migration discover.
 *    Section này bắt đúng bug production: functions deploy trước migration
 *    (local có 20261024000000, remote trống) khiến PostgREST trả PGRST205.
 * -------------------------------------------------------------------- */
{
  console.log('--- 8. Thiếu bảng share (SETUP_REQUIRED / fail closed / FE map) ---')

  // Bảng quyết định phân loại (mirror quy tắc trong student-report-shares/index.ts).
  function classifyShareDbError(err) {
    const code = String(err?.code || '')
    const message = String(err?.message || '')
    const mentionsShareTable = message.includes('student_report_shares')
    if ((code === 'PGRST205' || code === '42P01') && mentionsShareTable) {
      return { status: 503, code: 'SETUP_REQUIRED' }
    }
    if (message.includes('schema cache') && mentionsShareTable) {
      return { status: 503, code: 'SETUP_REQUIRED' }
    }
    return { status: 500, code: null }
  }
  const SHARE_SETUP_MESSAGE = 'Report sharing is not initialized yet. Please run the pending database migration.'

  const pgrst205 = { code: 'PGRST205', message: "Could not find the table 'public.student_report_shares' in the schema cache" }
  eq('PGRST205 thiếu bảng share (bug production) -> 503 SETUP_REQUIRED', classifyShareDbError(pgrst205), { status: 503, code: 'SETUP_REQUIRED' })
  eq('42P01 thiếu bảng share -> 503 SETUP_REQUIRED', classifyShareDbError({ code: '42P01', message: 'relation "public.student_report_shares" does not exist' }), { status: 503, code: 'SETUP_REQUIRED' })
  eq('schema cache không kèm code nhưng nhắc bảng share -> 503', classifyShareDbError({ message: "Could not find the table 'public.student_report_shares' in the schema cache" }), { status: 503, code: 'SETUP_REQUIRED' })
  eq('PGRST205 của bảng KHÁC -> 500 generic (không phân loại nhầm)', classifyShareDbError({ code: 'PGRST205', message: "Could not find the table 'public.student_classes' in the schema cache" }), { status: 500, code: null })
  eq('unique violation 23505 -> 500 generic', classifyShareDbError({ code: '23505', message: 'duplicate key value violates unique constraint' }), { status: 500, code: null })
  eq('lỗi không code -> 500 generic', classifyShareDbError({ message: 'connection failed' }), { status: 500, code: null })
  eq('lỗi null -> 500 generic', classifyShareDbError(null), { status: 500, code: null })

  const body503 = JSON.stringify({ success: false, error: SHARE_SETUP_MESSAGE, code: 'SETUP_REQUIRED' })
  check('body 503 không chứa tên bảng/raw DB/PGRST', !/student_report_shares|schema cache|PGRST205|42P01/.test(body503))

  // Static checks trên source thật.
  const shareFn8 = readFileSync(new URL('../functions/student-report-shares/index.ts', import.meta.url), 'utf8')
  const history8 = readFileSync(new URL('../functions/student-history/index.ts', import.meta.url), 'utf8')
  const migration8 = readFileSync(new URL('../migrations/20261024000000_student_report_shares.sql', import.meta.url), 'utf8')
  const initialSchema = readFileSync(new URL('../migrations/20260801000000_initial_schema.sql', import.meta.url), 'utf8')
  const feHelper = readFileSync(new URL('../../fe/src/js/utils/report-share.js', import.meta.url), 'utf8')
  const feView = readFileSync(new URL('../../fe/src/js/views/student-report.js', import.meta.url), 'utf8')
  const feApi = readFileSync(new URL('../../fe/src/js/api.js', import.meta.url), 'utf8')

  check('shares fn có code SETUP_REQUIRED + status 503', /SETUP_REQUIRED/.test(shareFn8) && /status: 503/.test(shareFn8))
  check('shares fn có hàm phân loại lỗi thiếu bảng', /isMissingShareTableError/.test(shareFn8) && /schema cache/.test(shareFn8))
  check('shares fn KHÔNG trả raw error.message/enrollErr.message', !/errorResponse\(error\.message/.test(shareFn8) && !/errorResponse\(enrollErr\.message/.test(shareFn8))
  check('shares fn GET lỗi -> message chung (không raw)', /Failed to load report shares/.test(shareFn8))
  check('shares fn catch-all -> 500 chung (không raw)', /Internal server error/.test(shareFn8))
  check('shares fn auth vẫn trước mọi query bảng share', shareFn8.indexOf('requireAuth(req)') > -1 && shareFn8.indexOf('requireAuth(req)') < shareFn8.indexOf("from('student_report_shares')"))

  check('history public vẫn fail closed generic (không SETUP code, không PGRST)', /Failed to resolve report share/.test(history8) && !/PGRST205/.test(history8) && !/code: 'SETUP_REQUIRED'/.test(history8))

  const migDir = new URL('../migrations/', import.meta.url)
  const migFiles = readdirSync(migDir).filter((f) => /^\d{14}_.*\.sql$/.test(f)).sort()
  check('migration share discover được theo quy ước tên CLI (14 số + _ + tên)', migFiles.includes('20261024000000_student_report_shares.sql'))
  check('migration share là migration mới nhất (deploy sau cùng)', migFiles[migFiles.length - 1] === '20261024000000_student_report_shares.sql')
  check('migration share FK trỏ tới bảng thật trong initial schema', /references public\.profiles\(id\)/.test(migration8) && /references public\.classes\(id\)/.test(migration8) && /CREATE TABLE IF NOT EXISTS public\.profiles/.test(initialSchema) && /CREATE TABLE IF NOT EXISTS public\.classes/.test(initialSchema))

  check('FE helper có isShareSetupError + message tiếng Việt', /isShareSetupError/.test(feHelper) && /chưa được khởi tạo/.test(feHelper) && /SETUP_REQUIRED/.test(feHelper))
  check('FE view dùng friendlyShareErrorMessage ở create/list/revoke', (feView.match(/friendlyShareErrorMessage\(err/g) || []).length >= 3)
  check('FE view public map lỗi 500 về thông báo chung', /isSharedReportServerError/.test(feView))
  check('FE api giữ status/code trên Error (caller cũ chỉ đọc message)', /errWithMeta\.status = response\.status/.test(feApi) && /errWithMeta\.code/.test(feApi))
}


/* -----------------------------------------------------------------------
 * 9. Review trước deploy: FE không nhận 503 đơn độc; verify script không
 *    in ĐẠT khi cloud chưa kiểm chứng (static; hành vi chạy thật nằm ở
 *    test-verify-student-report-shares.mjs).
 * -------------------------------------------------------------------- */
{
  console.log('--- 9. Siết rule setup + verdict verify (review) ---')

  const feHelper9 = readFileSync(new URL('../../fe/src/js/utils/report-share.js', import.meta.url), 'utf8')
  const verifySrc = readFileSync(new URL('./verify-student-report-shares.mjs', import.meta.url), 'utf8')

  check('FE helper chỉ nhận code SETUP_REQUIRED (không nhận 503 đơn độc)', /err\.code === SHARE_SETUP_ERROR_CODE/.test(feHelper9) && !/err\.status === 503/.test(feHelper9))
  check('FE helper raw legacy phải nhắc đúng bảng share', /msg\.includes\('student_report_shares'\)/.test(feHelper9))

  check('verify script coi 42501/permission denied là bảng TỒN TẠI (PASS)', /42501/.test(verifySrc) && /permission denied/.test(verifySrc))
  check('verify script coi PGRST205 là FAIL', /PGRST205/.test(verifySrc))
  check('verify script có trạng thái INCONCLUSIVE chặn verdict cloud', /INCONCLUSIVE/.test(verifySrc) && /schemaOutcome !== 'PASS'/.test(verifySrc))
  check('verify script phân biệt ĐẠT CLOUD / ĐẠT LOCAL / CHƯA XÁC NHẬN CLOUD', /ĐẠT CLOUD/.test(verifySrc) && /ĐẠT LOCAL/.test(verifySrc) && /CHƯA XÁC NHẬN CLOUD/.test(verifySrc))
  check('verify script không còn in ĐẠT chung chung kiểu cũ', !/ĐẠT: có thể tạo link/.test(verifySrc))
  check('verify script không POST/DELETE (chỉ GET read-only)', !/method: 'POST'/.test(verifySrc) && !/method: 'DELETE'/.test(verifySrc))
  check('verify script ghi rõ fn 401 chỉ là INFO, không chứng minh bảng', /INFO/.test(verifySrc) && /KHÔNG chứng minh bảng tồn tại/.test(verifySrc))
}

console.log(`\nKết quả: ${passed} PASS, ${failed} FAIL`)
if (failed > 0) process.exit(1)
console.log('TẤT CẢ KIỂM THỬ CHIA SẺ BÁO CÁO ĐỀU ĐẠT! ✅')
