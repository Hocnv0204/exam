import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import {
  SHARE_EXPIRY_DEFAULT_DAYS,
  SHARE_EXPIRY_MAX_DAYS,
  SHARE_EXPIRY_MIN_DAYS,
  buildSharedReportUrl,
  formatShareDate,
  friendlyShareErrorMessage,
  isSharedReportServerError,
  isShareSetupError,
  formatShareDateTime,
  getShareTokenFromHash,
  isValidShareTokenFormat,
  normalizeExpiresInDays,
  redactQueryFromEndpoint,
  shareStatusBadgeClass,
  shareStatusLabel
} from '../src/js/utils/report-share.js'

console.log('=== Kiem thuat: Helpers Chia se Bao cao (student-report share) ===')

// 1. Hop thoi gian sua doi expiresInDays: 1..90, mac dinh 30.
assert.equal(SHARE_EXPIRY_DEFAULT_DAYS, 30)
assert.equal(SHARE_EXPIRY_MIN_DAYS, 1)
assert.equal(SHARE_EXPIRY_MAX_DAYS, 90)

assert.equal(normalizeExpiresInDays(undefined, 30), 30)
assert.equal(normalizeExpiresInDays(null, 30), 30)
assert.equal(normalizeExpiresInDays('', 30), 30)
assert.equal(normalizeExpiresInDays('30', 30), 30)
assert.equal(normalizeExpiresInDays(30, 30), 30)
assert.equal(normalizeExpiresInDays(1, 30), 1)
assert.equal(normalizeExpiresInDays(90, 30), 90)
assert.equal(normalizeExpiresInDays(0, 30), null, 'expiresInDays vuot MIN -> khong hop le')
assert.equal(normalizeExpiresInDays(91, 30), null, 'expiresInDays vuot MAX -> khong hop le')
assert.equal(normalizeExpiresInDays(45.5, 30), null, 'expiresInDays phai la so nguyen')

// 2. Token public phai dung dinh dang `<shareId>.<secret>` (UUID + secret 43 ky tu base64url, tru voi backend).
const validToken = '123e4567-e89b-12d3-a456-426614174000.AbCdEfGhIjKlMnOpQrStUvWxYz0123456789_-abcde'
assert.equal(isValidShareTokenFormat(validToken), true)
assert.equal(isValidShareTokenFormat('short-token'), false, 'token qua dai/khong dung do dai -> khong hop le')
assert.equal(isValidShareTokenFormat(''), false, 'token rong -> khong hop le')

// 3. Build URL public: origin/path + #shared-report?token=... (encode token, giu nguyen pathname da co).
const url = buildSharedReportUrl(validToken, { origin: 'https://eduportal.example.com', pathname: '/hoc/', search: '' })
assert.equal(url, 'https://eduportal.example.com/hoc/#shared-report?token=123e4567-e89b-12d3-a456-426614174000.AbCdEfGhIjKlMnOpQrStUvWxYz0123456789_-abcde')
const encodedUrl = buildSharedReportUrl('tok with/special+chars', { origin: 'http://localhost:3000', pathname: '/', search: '' })
assert.equal(encodedUrl, 'http://localhost:3000/#shared-report?token=tok%20with%2Fspecial%2Bchars')

// 4. Lay token tu hash route.
assert.equal(getShareTokenFromHash('#shared-report?token=abc.def'), 'abc.def')
assert.equal(getShareTokenFromHash('shared-report?token=abc.def'), 'abc.def', 'khong co # -> van parse duoc')
assert.equal(getShareTokenFromHash('#student-report?studentId=s1'), '', 'token missing -> rong')
assert.equal(getShareTokenFromHash('#'), '')

// 5. Nhan trang trang thai share.
assert.equal(shareStatusLabel('active'), 'Hoạt động')
assert.equal(shareStatusLabel('expired'), 'Hết hạn')
assert.equal(shareStatusLabel('revoked'), 'Đã thu hồi')
assert.equal(shareStatusLabel('unknown-status'), 'Không xác định')
assert.equal(shareStatusBadgeClass('active'), 'report-share-status--active')
assert.equal(shareStatusBadgeClass('expired'), 'report-share-status--expired')
assert.equal(shareStatusBadgeClass('revoked'), 'report-share-status--revoked')

// 6. Dinh dang ngay giam trong phien Viet.
assert.equal(formatShareDateTime('2026-10-24T10:00:00.000Z'), new Date('2026-10-24T10:00:00.000Z').toLocaleString('vi-VN'))
assert.equal(typeof formatShareDate('2026-10-24T10:00:00.000Z'), 'string')
assert.equal(formatShareDate(''), '')

// 7. REDACT query khi log endpoint: raw shareToken trong query KHONG BAO GIO roi vao log.
const tokenLike = '123e4567-e89b-12d3-a456-426614174000' + '.' + 'S'.repeat(43)
assert.equal(
  redactQueryFromEndpoint(`student-history?scope=shared-report&shareToken=${tokenLike}`),
  'student-history',
  'log endpoint phai mat toan bo query (chua shareToken)'
)
assert.equal(redactQueryFromEndpoint('student-report-shares'), 'student-report-shares', 'path khong co query -> giu nguyen')
assert.equal(redactQueryFromEndpoint('student-history?scope=report&shareToken=a?b'), 'student-history', 'nhieu dau ? -> van chot phan truoc dau tien')
assert.equal(redactQueryFromEndpoint(''), '')
assert.equal(redactQueryFromEndpoint(undefined), '')

// 8. API wrapper public: KHONG gui Authorization nao (kể ca anon bearer) theo contract verify_jwt=false
//    + moi log api.js KHONG chua endpoint raw (token trong query).
const apiSrc = readFileSync(new URL('../src/js/api.js', import.meta.url), 'utf8')

// 8.1 Public data GET dung option rot Authorization: isPublic + omitAuthorization.
assert.ok(
  /getSharedReport[\s\S]{0,400}?isPublic:\s*true,\s*omitAuthorization:\s*true/.test(apiSrc),
  'getSharedReport phai di ca isPublic: true va omitAuthorization: true'
)
assert.ok(apiSrc.includes('delete fetchOptions.omitAuthorization'), 'option noi bo omitAuthorization phai bi loai truoc fetch')
assert.ok(
  apiSrc.includes('state.token && !isPublicEndpoint && !omitAuthorization'),
  'Authorization user token phai duoc bo qua khi omitAuthorization'
)
assert.ok(
  apiSrc.includes('!omitAuthorization && import.meta.env.VITE_SUPABASE_ANON_KEY'),
  'Anon bearer cung phai bi bo qua khi omitAuthorization (KHONG gui Authorization nao)'
)

// 8.2 Chi mot wrapper public dung omitAuthorization (khong lan sang endpoint public khac).
const omitUserCount = [...apiSrc.matchAll(/omitAuthorization:\s*true/g)].length
assert.equal(omitUserCount, 1, 'chi getSharedReport duoc phep dat omitAuthorization: true')

// 8.3 Moi console.* trong api.js KHONG noi chuoi endpoint raw (query co the chua shareToken).
const rawEndpointLog = [...apiSrc.matchAll(/console\.(log|warn|error)\([^)]*\$\{endpoint\}/g)]
assert.equal(rawEndpointLog.length, 0, 'khai bao console trong api.js khong duoc log endpoint gom query')
assert.ok(
  apiSrc.includes('${redactQueryFromEndpoint(endpoint)}'),
  'log loi request phai redact query (chi du path) de khong leak shareToken'
)

// 9. View student-report.js: cac hop dong UI sau.
const viewSrc = readFileSync(new URL('../src/js/views/student-report.js', import.meta.url), 'utf8')

// 9.1 QR: gan src sau khi generate + xoa src khi reset/error (khong giu QR/token luot cu).
assert.ok(viewSrc.includes('qrImg.src = dataUrl'), 'QR phai duoc gan vao img.src (khong chi hien button)')
assert.ok(
  (viewSrc.match(/qrImg\.removeAttribute\('src'\)/g) || []).length >= 1,
  'reset/error QR phai removeAttribute("src") de khong giu QR cu'
)

// 9.2 Panel ADMIN load danh sách ngay sau render (khong kẹt "Đang tải danh sách...").
assert.ok(viewSrc.includes('void loadShareList().catch(() => {})'), 'renderReport ADMIN phai goi loadShareList ban dau')

// 9.3 Race lifecycle: POST create/QR/GET list phai co guard shareLifecycle.
assert.ok((viewSrc.match(/shareLifecycle !== lifecycle/g) || []).length >= 4, 'stale lifecycle guard phai co trong create + QR + list')
assert.ok(viewSrc.includes('renderShareQr(shareUrl, lifecycle)'), 'QR phai nhan lifecycle snapshot tu create')
assert.ok(viewSrc.includes('shareListChain = Promise.resolve()'), 'lifecycle doi phai reset chain GET list')

// 9.4 Log/UI khong in token/link: khong co console.* noi chuoi token/link/shareToken.
const viewLogs = [...viewSrc.matchAll(/console\.(log|warn|error)\([^\n]*/g)]
assert.equal(
  viewLogs.filter((m) => /shareToken|shareUrl|currentShareToken|token\s*\$\{/.test(m[0])).length,
  0,
  'log trong view khong duoc chua token/link'
)
assert.ok(!/console\.[a-z]+\([^)]*\$\{share/.test(viewSrc), 'khong log bien share... trong view')

// 9.5 Text (sau sua typo): khong con "phu dao".
assert.ok(!viewSrc.includes('phụ đạo'), 'typo "phụ đạo" phai duoc sua')
assert.ok(viewSrc.includes('phụ huynh xem báo cáo'), ' noi dung chinh la phu huynh')

// 9.6 Bieu do: moi luot nop deu phai co cot; best chi la cach nhan manh mau sac.
assert.ok(viewSrc.includes('const barData = [...scores]'), 'cot phai lay diem cua tat ca luot nop')
assert.ok(
  !/const barData\s*=\s*trend\.map\([^\n]*isBest[^\n]*:\s*null/.test(viewSrc),
  'luot thuong khong duoc bien thanh cot null'
)
assert.ok(viewSrc.includes("borderWidth: trend.map(a => a.isBest ? 2 : 1)"), 'cot best phai van duoc nhan manh')

console.log('  ✓ Hop thoi gian chia se (1-90 ngay, mac dinh 30)')
console.log('  ✓ Dinh dang token public')
console.log('  ✓ Build URL public #shared-report?token=...')
console.log('  ✓ Parse token tu hash')
console.log('  ✓ Nhan trang thai share')
console.log('  ✓ Dinh dang ngay thoi gian')
console.log('  ✓ Redact query khi log endpoint (khong leak shareToken)')
console.log('  ✓ Public wrapper rot Authorization hoan toan (omitAuthorization)')
console.log('  ✓ QR: gan img.src + reset an toan, lifecycle guard cho create/QR/list')
console.log('  ✓ Bieu do co cot cho moi luot nop, best duoc nhan manh rieng')

// 10. Loi thieu bang share -> FE map than thien (khong raw, khong toast trung).
assert.equal(isShareSetupError({ code: 'SETUP_REQUIRED', status: 503 }), true)
assert.equal(isShareSetupError({ code: 'SETUP_REQUIRED' }), true)
assert.equal(isShareSetupError({ status: 503 }), false, '503 don doc khong phai loi setup (outage khac)')
assert.equal(isShareSetupError({ status: 503, message: 'Service temporarily unavailable' }), false, '503 + message chung khong phai loi setup')
assert.equal(isShareSetupError({ message: "Could not find the table 'public.student_report_shares' in the schema cache" }), true)
assert.equal(isShareSetupError({ message: "Could not find the table 'public.student_classes' in the schema cache" }), false, 'raw message cua bang khac khong phai loi setup')
assert.equal(isShareSetupError({ message: 'schema cache reload failed' }), false, 'schema cache chung chung khong nhac bang share thi khong phai loi setup')
assert.equal(isShareSetupError({ message: 'Failed to create report share' }), false)
assert.equal(isShareSetupError({ code: 'PGRST23505', message: 'duplicate key' }), false)
assert.equal(isShareSetupError(null), false)
assert.equal(friendlyShareErrorMessage({ code: 'SETUP_REQUIRED' }), 'Tính năng chia sẻ báo cáo chưa được khởi tạo. Cần chạy migration cơ sở dữ liệu trước khi tạo hoặc xem link chia sẻ.')
assert.equal(friendlyShareErrorMessage({ message: 'Failed to create report share' }), 'Failed to create report share')
assert.equal(friendlyShareErrorMessage({}, 'Không tải được danh sách link chia sẻ.'), 'Không tải được danh sách link chia sẻ.')
assert.equal(isSharedReportServerError({ status: 500, message: 'Failed to resolve report share' }), true)
assert.equal(isSharedReportServerError({ status: 404, message: 'Report link is invalid or no longer available' }), false)
assert.equal(isSharedReportServerError({ status: 410, message: 'Report link has expired' }), false)

console.log('  ✓ Map loi thieu bang share -> thong bao tieng Viet (SETUP_REQUIRED / schema cache legacy)')
console.log('\n✅ Kiem thuat Chia se Bao cao PASSED')
