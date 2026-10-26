/**
 * Helpers thuong vung cho viec tao / quan ly / mo link chia se bao cao tieng bo
 * (student-report-shares -> public route #shared-report?token=...).
 *
 * MODULE NAY CHI CHUA LOGIC UI: toan bo function day du co the chay duoc trong
 * Node (unit test) khong dung DOM/window/localStorage de dam bien.
 */

export const SHARE_EXPIRY_MIN_DAYS = 1
export const SHARE_EXPIRY_MAX_DAYS = 90
export const SHARE_EXPIRY_DEFAULT_DAYS = 30

/**
 * Bo query string khi log endpoint (console.warn/log) de raw shareToken
 * (`...?scope=shared-report&shareToken=<uuid>.<secret>`) KHONG BAO GIO roi vao log.
 * Chi giu lai path; du an toan: moi ky tu sau '?' bi bo (co nhieu '?' van chot tu dau).
 */
export function redactQueryFromEndpoint(endpoint) {
  return String(endpoint ?? '').split('?')[0]
}

const SHARE_TOKEN_RE = /^([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})\.([A-Za-z0-9_-]{43})$/

/** Validate token dang duoc gui public: `<shareId>.<secret>` (secret 43 ky tu base64url). */
export function isValidShareTokenFormat(token) {
  if (typeof token !== 'string') return false
  const match = SHARE_TOKEN_RE.exec(token.trim())
  return Boolean(match)
}

/**
 * Hop so expiresInDays cho viec tao share: 1..90 (mặc dinh 30).
 * Tra ve so hop le, hoac null khi gia tri khong hop le.
 */
export function normalizeExpiresInDays(raw, dflt = SHARE_EXPIRY_DEFAULT_DAYS) {
  if (raw === undefined || raw === null || raw === '') {
    return SHARE_EXPIRY_DEFAULT_DAYS
  }
  const n = Number(raw)
  if (!Number.isFinite(n) || !Number.isInteger(n)) return null
  if (n < SHARE_EXPIRY_MIN_DAYS || n > SHARE_EXPIRY_MAX_DAYS) return null
  return n
}

/**
 * Dat URL public cua mot report share.
 * @param {string} token Raw share token (duoc encode lai cho query param).
 * @param {{origin?: string, pathname?: string, search?: string}} [base] Base URL (mac dinh window.location).
 */
export function buildSharedReportUrl(token, base) {
  const origin = base?.origin ?? (typeof window !== 'undefined' ? window.location.origin : '')
  const pathname = base?.pathname ?? (typeof window !== 'undefined' ? window.location.pathname : '/')
  const search = base?.search ?? (typeof window !== 'undefined' ? window.location.search : '')
  const encoded = encodeURIComponent(String(token ?? ''))
  return `${origin}${pathname}${search}#shared-report?token=${encoded}`
}

/** Lay raw token tu hash route, vd #shared-report?token=xxx */
export function getShareTokenFromHash(hash) {
  const raw = hash ?? (typeof window !== 'undefined' ? window.location.hash : '')
  const h = String(raw || '').replace(/^#/, '')
  const qIndex = h.indexOf('?')
  const qs = qIndex >= 0 ? h.slice(qIndex + 1) : ''
  const token = new URLSearchParams(qs).get('token') || ''
  return String(token || '').trim()
}

export function shareStatusLabel(status) {
  switch (status) {
    case 'active':
      return 'Hoạt động'
    case 'expired':
      return 'Hết hạn'
    case 'revoked':
      return 'Đã thu hồi'
    default:
      return 'Không xác định'
  }
}

export function shareStatusBadgeClass(status) {
  switch (status) {
    case 'active':
      return 'report-share-status--active'
    case 'expired':
      return 'report-share-status--expired'
    case 'revoked':
      return 'report-share-status--revoked'
    default:
      return 'report-share-status--unknown'
  }
}

export const SHARE_SETUP_ERROR_CODE = 'SETUP_REQUIRED'
export const SHARE_SETUP_MESSAGE_VI = 'Tính năng chia sẻ báo cáo chưa được khởi tạo. Cần chạy migration cơ sở dữ liệu trước khi tạo hoặc xem link chia sẻ.'

/**
 * Nhan dien loi thieu bang share, SIET (review truoc deploy):
 * - Chi nhan code SETUP_REQUIRED tu function moi, hoac message raw legacy
 *   (PostgREST schema cache) NHUNG phai nhac dung bang student_report_shares.
 * - Status 503 DON DOC = false: moi outage 503 (DB down, gateway loi...) khong
 *   duoc bao nham la thieu migration. Tuong tu, raw message cua bang khac
 *   hoac chi noi 'schema cache' chung chung cung = false.
 */
export function isShareSetupError(err) {
  if (!err || typeof err !== 'object') return false
  if (err.code === SHARE_SETUP_ERROR_CODE) return true
  const msg = String(err.message || '')
  return msg.includes('student_report_shares') &&
    (msg.includes('schema cache') || msg.includes('Could not find the table'))
}

/**
 * Map loi share sang thong bao hien thi: setup -> tieng Viet hanh dong duoc,
 * con lai giu nguyen message (caller cu khong doi).
 */
export function friendlyShareErrorMessage(err, fallback) {
  if (isShareSetupError(err)) return SHARE_SETUP_MESSAGE_VI
  const msg = String(err?.message || '').trim()
  return msg || fallback || 'Đã có lỗi xảy ra. Vui lòng thử lại sau.'
}

/**
 * Loi 500 ky thuat cua public report -> thong bao chung, khong lo chi tiet backend.
 * Chi dung cho trang public (khong auth): 404/410 (link sai/het han/thu hoi) giu nguyen
 * vi chung da la thong bao chung, khong leak.
 */
export function isSharedReportServerError(err) {
  if (!err || typeof err !== 'object') return false
  if (typeof err.status === 'number' && err.status >= 500) return true
  const msg = String(err.message || '')
  return msg.startsWith('Failed to resolve report share') ||
    msg.startsWith('Failed to load shared report metadata') ||
    msg.startsWith('Failed to verify enrollment')
}

export function formatShareDateTime(iso) {
  if (!iso) return ''
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return String(iso)
  return d.toLocaleString('vi-VN')
}

export function formatShareDate(iso) {
  if (!iso) return ''
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return String(iso)
  return d.toLocaleDateString('vi-VN')
}
