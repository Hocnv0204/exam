/**
 * Edge Function quản lý link chia sẻ công khai báo cáo tiến bộ học sinh.
 *
 * Nguyên tắc bảo mật:
 * - CHỈ ADMIN (gia sư) gọi được function này; function tự requireAuth + kiểm tra role,
 *   đồng thời config verify_jwt = true để gateway không vô tình mở public.
 * - Raw token (`<shareId>.<secret>`, secret 256-bit) CHỈ trả về một lần ở POST create.
 *   DB chỉ lưu SHA-256(secret) trong token_secret_hash; GET/DELETE không bao giờ trả
 *   raw token hay hash.
 * - Thu hồi là soft revoke (revoked_at), idempotent; không hard-delete.
 * - Không tự retry thao tác create: lỗi insert trả 500 để client quyết định, tránh
 *   tạo nhiều link ngoài ý muốn.
 *
 * API contract:
 *   POST   /student-report-shares
 *     body: { studentId, classId, fromDate, toDate, expiresInDays? }
 *     201 -> { shareId, shareToken, expiresAt, createdAt, createdBy, studentId, classId,
 *              fromDate, toDate, status: 'active', period: { fromDate, toDate, days } }
 *     400 validation / 401 missing-invalid auth / 403 not admin / 500 db
 *
 *   GET    /student-report-shares?studentId=<uuid>[&classId=<uuid>]
 *     200 -> { studentId, classId|null, shares: [ShareSummary] }
 *     ShareSummary = { shareId, studentId, classId, fromDate, toDate, createdBy,
 *                      createdAt, expiresAt, revokedAt|null, status }
 *     status = 'active' | 'expired' | 'revoked'
 *
 *   DELETE /student-report-shares?shareId=<uuid>   (hoặc body { shareId })
 *     200 -> { shareId, revokedAt, status: 'revoked', alreadyRevoked }
 *     400 invalid id / 401 / 403 not admin / 404 not found
 *     409 nếu update 0 row nhưng DB vẫn chưa có revoked_at (trạng thái bất thường)
 *
 *   OPTIONS: CORS preflight.
 */

import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { requireAuth } from '../../shared/auth-middleware.ts'
import { handleCors, jsonResponse, errorResponse, corsHeaders } from '../../shared/response-helper.ts'

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
const DEFAULT_EXPIRES_IN_DAYS = 30
const MIN_EXPIRES_IN_DAYS = 1
const MAX_EXPIRES_IN_DAYS = 90
const SHARE_SECRET_BYTES = 32 // 256-bit entropy

// Lỗi thiếu bảng student_report_shares (migration chưa apply) phải trả 503 +
// code SETUP_REQUIRED, message ổn định, KHÔNG leak tên bảng/raw DB.
// Chỉ phân loại đúng lỗi này: PostgREST PGRST205 / PG 42P01 KÈM tên bảng share.
// Mọi lỗi khác giữ 500 generic để không phân loại nhầm lỗi khác thành lỗi setup.
const SHARE_SETUP_MESSAGE = 'Report sharing is not initialized yet. Please run the pending database migration.'
const SHARE_TABLE_NAME = 'student_report_shares'

function isMissingShareTableError(err: unknown): boolean {
  if (!err || typeof err !== 'object') return false
  const code = String((err as { code?: unknown }).code || '')
  const message = String((err as { message?: unknown }).message || '')
  const mentionsShareTable = message.includes(SHARE_TABLE_NAME)
  if (code === 'PGRST205' || code === '42P01') return mentionsShareTable
  return message.includes('schema cache') && mentionsShareTable
}

function setupRequiredResponse(): Response {
  return new Response(
    JSON.stringify({ success: false, error: SHARE_SETUP_MESSAGE, code: 'SETUP_REQUIRED' }),
    { status: 503, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
  )
}
const SHARE_HASH_RE = /^[0-9a-f]{64}$/

interface ShareRow {
  id: string
  student_id: string
  class_id: string
  from_date: string
  to_date: string
  created_by: string
  expires_at: string
  revoked_at: string | null
  created_at: string
}

function isValidUuid(raw: unknown): raw is string {
  return typeof raw === 'string' && UUID_RE.test(raw)
}

/** Ngày lịch thật theo UTC; Date.UTC tự "lăn" 2026-02-30 nên phải round-trip. */
function isValidCalendarDate(raw: unknown): raw is string {
  if (typeof raw !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(raw)) return false
  const [y, m, d] = raw.split('-').map((v: string) => Number(v))
  if (!Number.isInteger(y) || !Number.isInteger(m) || !Number.isInteger(d)) return false
  const dt = new Date(Date.UTC(y, m - 1, d))
  return dt.getUTCFullYear() === y && dt.getUTCMonth() === m - 1 && dt.getUTCDate() === d
}

function parseExpiresInDays(raw: unknown): { ok: true; days: number } | { ok: false; message: string } {
  if (raw === undefined || raw === null || raw === '') {
    return { ok: true, days: DEFAULT_EXPIRES_IN_DAYS }
  }
  const days = typeof raw === 'number' ? raw : (typeof raw === 'string' ? Number(raw) : NaN)
  if (!Number.isInteger(days) || days < MIN_EXPIRES_IN_DAYS || days > MAX_EXPIRES_IN_DAYS) {
    return {
      ok: false,
      message: `expiresInDays must be an integer between ${MIN_EXPIRES_IN_DAYS} and ${MAX_EXPIRES_IN_DAYS}`,
    }
  }
  return { ok: true, days }
}

function base64UrlEncode(bytes: Uint8Array): string {
  let binary = ''
  for (let i = 0; i < bytes.length; i += 1) binary += String.fromCharCode(bytes[i])
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/g, '')
}

/** Secret 256-bit ngẫu nhiên, dạng base64url không padding (43 ký tự). */
function generateShareSecret(): string {
  const bytes = new Uint8Array(SHARE_SECRET_BYTES)
  crypto.getRandomValues(bytes)
  return base64UrlEncode(bytes)
}

async function sha256Hex(input: string): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(input))
  return Array.from(new Uint8Array(digest))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('')
}

function periodDays(fromDate: string, toDate: string): number {
  const fromMs = new Date(`${fromDate}T00:00:00.000Z`).getTime()
  const toMs = new Date(`${toDate}T00:00:00.000Z`).getTime()
  return Math.round((toMs - fromMs) / 86400000) + 1
}

function shareStatus(row: { revoked_at: string | null; expires_at: string }, nowMs: number): 'active' | 'expired' | 'revoked' {
  if (row.revoked_at) return 'revoked'
  const expiresMs = new Date(row.expires_at).getTime()
  if (!Number.isFinite(expiresMs) || expiresMs <= nowMs) return 'expired'
  return 'active'
}

/** Shape trả cho GET: tuyệt đối không chứa raw token hoặc token_secret_hash. */
function toShareSummary(row: ShareRow, nowMs: number) {
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

/** Lấy shareId từ query string hoặc body DELETE (body có thể không tồn tại). */
async function readShareIdFromRequest(req: Request, url: URL): Promise<unknown> {
  const fromQuery = url.searchParams.get('shareId')
  if (fromQuery) return fromQuery
  const body = await req.json().catch(() => null) as Record<string, unknown> | null
  return body && typeof body === 'object' ? body.shareId : null
}

serve(async (req: Request) => {
  const corsRes = handleCors(req)
  if (corsRes) return corsRes

  try {
    if (req.method !== 'POST' && req.method !== 'GET' && req.method !== 'DELETE') {
      return errorResponse('Method not allowed', 405)
    }

    // Xác thực nội bộ: không bao giờ cho phép quản lý share khi chưa đăng nhập.
    let authenticatedUser: { id: string; role: string }
    let serviceRoleClient: any
    try {
      const auth = await requireAuth(req)
      authenticatedUser = auth.user
      serviceRoleClient = auth.serviceRoleClient
    } catch (authErr) {
      const message = authErr instanceof Error ? authErr.message : 'Unauthorized'
      return errorResponse(message || 'Unauthorized', 401)
    }

    if (authenticatedUser.role !== 'ADMIN') {
      return errorResponse('Forbidden: Admin access required', 403)
    }

    const url = new URL(req.url)

    // ---------------------------------------------------------------- POST: create
    if (req.method === 'POST') {
      const body = await req.json().catch(() => null) as Record<string, unknown> | null
      if (!body || typeof body !== 'object') {
        return errorResponse('Invalid JSON body', 400)
      }

      const { studentId, classId, fromDate, toDate } = body

      if (!isValidUuid(studentId)) {
        return errorResponse('studentId must be a valid UUID', 400)
      }
      if (!isValidUuid(classId)) {
        return errorResponse('classId must be a valid UUID', 400)
      }
      if (!isValidCalendarDate(fromDate) || !isValidCalendarDate(toDate)) {
        return errorResponse('fromDate/toDate must be valid calendar dates formatted as YYYY-MM-DD', 400)
      }
      if (fromDate > toDate) {
        return errorResponse('fromDate must be earlier than or equal to toDate', 400)
      }

      const expires = parseExpiresInDays(body.expiresInDays)
      if (expires.ok === false) {
        return errorResponse(expires.message, 400)
      }

      // Xác minh cặp học sinh/lớp thực sự tồn tại trong student_classes.
      const { data: enrollment, error: enrollErr } = await serviceRoleClient
        .from('student_classes')
        .select('student_id, class_id')
        .eq('student_id', studentId)
        .eq('class_id', classId)
        .maybeSingle()
      if (enrollErr) {
        return isMissingShareTableError(enrollErr)
          ? setupRequiredResponse()
          : errorResponse('Failed to verify enrollment', 500)
      }
      if (!enrollment) {
        return errorResponse('Student is not enrolled in this class', 400)
      }

      const shareId = crypto.randomUUID()
      const secret = generateShareSecret()
      const tokenSecretHash = await sha256Hex(secret)
      if (!SHARE_HASH_RE.test(tokenSecretHash)) {
        return errorResponse('Failed to generate share token', 500)
      }

      const nowMs = Date.now()
      const createdAt = new Date(nowMs).toISOString()
      const expiresAt = new Date(nowMs + expires.days * 86400000).toISOString()

      const { error: insertErr } = await serviceRoleClient
        .from('student_report_shares')
        .insert({
          id: shareId,
          token_secret_hash: tokenSecretHash,
          student_id: studentId,
          class_id: classId,
          from_date: fromDate,
          to_date: toDate,
          created_by: authenticatedUser.id,
          expires_at: expiresAt,
          created_at: createdAt,
        })
      if (insertErr) {
        // Không retry: tránh tạo nhiều link ngoài ý muốn khi client thử lại mù.
        return isMissingShareTableError(insertErr)
          ? setupRequiredResponse()
          : errorResponse('Failed to create report share', 500)
      }

      // Raw token chỉ xuất hiện đúng một lần ở response này. Không log.
      return jsonResponse({
        shareId,
        shareToken: `${shareId}.${secret}`,
        studentId,
        classId,
        fromDate,
        toDate,
        createdAt,
        expiresAt,
        createdBy: authenticatedUser.id,
        status: 'active',
        period: { fromDate, toDate, days: periodDays(fromDate, toDate) },
      }, 201)
    }

    // ---------------------------------------------------------------- GET: list
    if (req.method === 'GET') {
      const studentId = url.searchParams.get('studentId')
      const classId = url.searchParams.get('classId')

      if (!isValidUuid(studentId)) {
        return errorResponse('studentId must be a valid UUID', 400)
      }
      if (classId && !isValidUuid(classId)) {
        return errorResponse('classId must be a valid UUID', 400)
      }

      let query = serviceRoleClient
        .from('student_report_shares')
        .select('id, student_id, class_id, from_date, to_date, created_by, expires_at, revoked_at, created_at')
        .eq('student_id', studentId)
      if (classId) {
        query = query.eq('class_id', classId)
      }

      const { data, error } = await query.order('created_at', { ascending: false })
      if (error) {
        return isMissingShareTableError(error)
          ? setupRequiredResponse()
          : errorResponse('Failed to load report shares', 500)
      }

      const nowMs = Date.now()
      return jsonResponse({
        studentId,
        classId: classId || null,
        shares: ((data || []) as ShareRow[]).map((row) => toShareSummary(row, nowMs)),
      })
    }

    // ---------------------------------------------------------------- DELETE: revoke (soft)
    const shareId = await readShareIdFromRequest(req, url)
    if (!isValidUuid(shareId)) {
      return errorResponse('shareId must be a valid UUID', 400)
    }

    // Quy tắc repo: ADMIN hiện là gia sư duy nhất, nên mọi ADMIN được thu hồi share
    // (kể cả share do ADMIN khác tạo) để không kẹt link khi đổi người phụ trách.
    // created_by vẫn được lưu trong DB để audit. Non-admin đã bị chặn ở trên.
    //
    // Atomic revoke: UPDATE ... WHERE id = ? AND revoked_at IS NULL RETURNING revoked_at.
    // Chỉ request thực sự chuyển null -> timestamp mới trả alreadyRevoked=false.
    // Request đến sau / thua race update 0 row -> đọc lại revoked_at thực tế và trả true.
    const nowIso = new Date().toISOString()
    const { data: revokedRow, error: revokeErr } = await serviceRoleClient
      .from('student_report_shares')
      .update({ revoked_at: nowIso })
      .eq('id', shareId)
      .is('revoked_at', null)
      .select('revoked_at')
      .maybeSingle()
    if (revokeErr) {
      return isMissingShareTableError(revokeErr)
        ? setupRequiredResponse()
        : errorResponse('Failed to revoke report share', 500)
    }

    if (revokedRow) {
      // Request này thắng race và thực sự ghi timestamp.
      return jsonResponse({
        shareId,
        revokedAt: revokedRow.revoked_at || nowIso,
        status: 'revoked',
        alreadyRevoked: false,
      })
    }

    // Update 0 row: share đã bị request khác thu hồi trước, hoặc không tồn tại.
    // Đọc lại trạng thái thực tế, không dùng snapshot cũ.
    const { data: current, error: currentErr } = await serviceRoleClient
      .from('student_report_shares')
      .select('revoked_at')
      .eq('id', shareId)
      .maybeSingle()
    if (currentErr) {
      return isMissingShareTableError(currentErr)
        ? setupRequiredResponse()
        : errorResponse('Failed to read report share', 500)
    }
    if (!current) {
      return errorResponse('Report share not found', 404)
    }
    if (!current.revoked_at) {
      // Không xảy ra với service role + điều kiện is(null), nhưng tuyệt đối không
      // báo revoked khi DB chưa thực sự có timestamp.
      return errorResponse('Report share revoke state is inconsistent, please retry', 409)
    }

    return jsonResponse({
      shareId,
      revokedAt: current.revoked_at,
      status: 'revoked',
      alreadyRevoked: true,
    })
  } catch (err: unknown) {
    // Không lộ raw message ở catch-all: lỗi thiếu bảng -> 503 setup, còn lại 500 chung.
    return isMissingShareTableError(err)
      ? setupRequiredResponse()
      : errorResponse('Internal server error', 500)
  }
})
