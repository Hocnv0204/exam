import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { requireAuth } from '../../shared/auth-middleware.ts'
import { handleCors, jsonResponse, errorResponse } from '../../shared/response-helper.ts'

// Quản trị người dùng: ghi nhật ký hoạt động + khóa/mở khóa tài khoản.
//
// POST /user-activity                    (STUDENT: chỉ ghi cho chính mình)
//   { action, metadata?, durationSeconds? }
//   action ∈ LOGIN | LOGOUT | LESSON_VIEW | VIDEO_WATCH |
//            HOMEWORK_START | HOMEWORK_SUBMIT | EXAM_START | EXAM_SUBMIT
// POST /user-activity?action=set-lock    (ADMIN)
//   { userId, locked } — khóa: profiles.is_locked=true + học sinh chuyển Tạm nghỉ;
//                        mở: ngược lại.
// GET /user-activity?userId=&action?=&from?=&to?=&limit?   (ADMIN)
//   Thống kê + nhật ký của 1 người dùng.
const ALLOWED_ACTIONS = [
  'LOGIN', 'LOGOUT',
  'LESSON_VIEW', 'VIDEO_WATCH',
  'HOMEWORK_START', 'HOMEWORK_SUBMIT',
  'EXAM_START', 'EXAM_SUBMIT',
]

serve(async (req: Request) => {
  const corsRes = handleCors(req)
  if (corsRes) return corsRes

  try {
    const { user, serviceRoleClient } = await requireAuth(req)
    const url = new URL(req.url)
    const action = url.searchParams.get('action')

    // ---- Khóa / mở khóa tài khoản (ADMIN) ----
    if (req.method === 'POST' && action === 'set-lock') {
      if (user.role !== 'ADMIN') {
        return errorResponse('Forbidden: Only admins can lock accounts', 403)
      }
      const body = await req.json().catch(() => ({}))
      const userId: string | undefined = body.userId || body.user_id
      const locked: boolean | undefined = body.locked
      if (!userId || typeof locked !== 'boolean') {
        return errorResponse('Missing userId or locked (boolean)', 400)
      }

      const { error: lockErr } = await serviceRoleClient
        .from('profiles')
        .update({ is_locked: locked, updated_at: new Date().toISOString() })
        .eq('id', userId)
      if (lockErr) return errorResponse(lockErr.message, 500)

      // Đồng bộ trạng thái học: khóa -> Tạm nghỉ, mở -> Đang học.
      // Lưu ý: mở khóa sẽ đưa mọi lớp về Đang học (kể cả lớp bị tạm nghỉ
      // thủ công trước đó) — admin kiểm tra lại nếu cần.
      const { error: stErr } = await serviceRoleClient
        .from('student_classes')
        .update({ status: locked ? 'PAUSED' : 'ACTIVE' })
        .eq('student_id', userId)
      if (stErr) return errorResponse(stErr.message, 500)

      return jsonResponse({ userId, locked })
    }

    // ---- Ghi 1 sự kiện hoạt động ----
    if (req.method === 'POST' && (!action || action === 'log')) {
      const body = await req.json().catch(() => ({}))
      const act: string | undefined = body.action
      if (!act || !ALLOWED_ACTIONS.includes(act)) {
        return errorResponse(`Invalid action (allowed: ${ALLOWED_ACTIONS.join(', ')})`, 400)
      }
      const targetId: string | undefined = body.userId || body.user_id
      const targetUserId = user.role === 'ADMIN' && targetId ? targetId : user.id

      const { error: insErr } = await serviceRoleClient
        .from('user_activity_logs')
        .insert({
          user_id: targetUserId,
          action: act,
          metadata: body.metadata && typeof body.metadata === 'object' ? body.metadata : {},
          duration_seconds: typeof body.durationSeconds === 'number'
            ? Math.max(0, Math.floor(body.durationSeconds))
            : null,
        })
      if (insErr) return errorResponse(insErr.message, 500)
      return jsonResponse({ logged: true })
    }

    // ---- Thống kê + nhật ký 1 người dùng (ADMIN) ----
    // Có userId: chi tiết 1 người. Không userId: liệt kê toàn hệ thống
    // có phân trang + lọc (trang Nhật ký hoạt động).
    if (req.method === 'GET') {
      if (user.role !== 'ADMIN') {
        return errorResponse('Forbidden: Only admins can view activity logs', 403)
      }
      const userId = url.searchParams.get('userId') || url.searchParams.get('user_id')
      if (!userId) {
        return await listActivityLogs(serviceRoleClient, url)
      }
      const filterAction = url.searchParams.get('filterAction') || ''
      const from = url.searchParams.get('from') || ''
      const to = url.searchParams.get('to') || ''
      const limit = Math.min(200, Math.max(1, parseInt(url.searchParams.get('limit') || '50', 10)))

      let query = serviceRoleClient
        .from('user_activity_logs')
        .select('id, action, metadata, duration_seconds, created_at')
        .eq('user_id', userId)
        .order('created_at', { ascending: false })
      if (filterAction && ALLOWED_ACTIONS.includes(filterAction)) {
        query = query.eq('action', filterAction)
      }
      if (from) query = query.gte('created_at', from)
      if (to) query = query.lte('created_at', to)

      // Đếm theo action để thống kê (không giới hạn limit).
      let countQuery = serviceRoleClient
        .from('user_activity_logs')
        .select('action, duration_seconds')
        .eq('user_id', userId)
      if (from) countQuery = countQuery.gte('created_at', from)
      if (to) countQuery = countQuery.lte('created_at', to)
      const [{ data: logs, error: logErr }, { data: allRows, error: countErr }] = await Promise.all([
        query.range(0, limit - 1),
        countQuery.limit(5000),
      ])
      if (logErr) return errorResponse(logErr.message, 500)
      if (countErr) return errorResponse(countErr.message, 500)

      const byAction: Record<string, number> = {}
      let videoSeconds = 0
      let homeworkSeconds = 0
      let loginCount = 0
      for (const r of (allRows || []) as Array<{ action: string; duration_seconds: number | null }>) {
        byAction[r.action] = (byAction[r.action] || 0) + 1
        if (r.action === 'VIDEO_WATCH' && r.duration_seconds) videoSeconds += r.duration_seconds
        if ((r.action === 'HOMEWORK_SUBMIT' || r.action === 'HOMEWORK_START') && r.duration_seconds) {
          homeworkSeconds += r.duration_seconds
        }
        if (r.action === 'LOGIN') loginCount++
      }

      const { data: profile } = await serviceRoleClient
        .from('profiles')
        .select('id, username, full_name, role, is_locked')
        .eq('id', userId)
        .maybeSingle()

      return jsonResponse({
        user: profile || null,
        stats: {
          byAction,
          loginCount,
          videoSeconds,
          homeworkSeconds,
          lastActive: (logs || [])[0]?.created_at || null,
        },
        logs: logs || [],
      })
    }

    return errorResponse('Method not allowed', 405)
  } catch (err: unknown) {
    const error = err as Error
    return errorResponse(error.message || 'Unauthorized', 401)
  }
})

// Liệt kê log toàn hệ thống (trang Nhật ký hoạt động của admin).
// Filters: filterAction, from, to (ISO), classId, search (tên/username).
// Pagination: page (1-based), limit (max 100).
async function listActivityLogs(
  serviceRoleClient: any,
  url: URL,
): Promise<Response> {
  const filterAction = url.searchParams.get('filterAction') || ''
  const from = url.searchParams.get('from') || ''
  const to = url.searchParams.get('to') || ''
  const classId = url.searchParams.get('classId') || url.searchParams.get('class_id') || ''
  const search = (url.searchParams.get('search') || '').trim().replace(/[,()]/g, '')
  const page = Math.max(1, parseInt(url.searchParams.get('page') || '1', 10))
  const limit = Math.min(100, Math.max(10, parseInt(url.searchParams.get('limit') || '20', 10)))

  // Giới hạn tập user theo lớp / từ khóa tìm kiếm.
  let userIds: string[] | null = null
  if (classId) {
    const { data: joins, error: joinErr } = await serviceRoleClient
      .from('student_classes')
      .select('student_id')
      .eq('class_id', classId)
    if (joinErr) return errorResponse(joinErr.message, 500)
    userIds = (joins || []).map((j: { student_id: string }) => j.student_id)
    if (userIds.length === 0) {
      return jsonResponse({ items: [], page, limit, total: 0, totalPages: 0 })
    }
  }
  if (search) {
    let profQuery = serviceRoleClient
      .from('profiles')
      .select('id')
      .or(`full_name.ilike.%${search}%,username.ilike.%${search}%`)
      .limit(500)
    const { data: profs, error: profErr } = await profQuery
    if (profErr) return errorResponse(profErr.message, 500)
    const found = (profs || []).map((p: { id: string }) => p.id)
    userIds = userIds ? userIds.filter((id) => found.includes(id)) : found
    if (userIds.length === 0) {
      return jsonResponse({ items: [], page, limit, total: 0, totalPages: 0 })
    }
  }

  let query = serviceRoleClient
    .from('user_activity_logs')
    .select('id, user_id, action, metadata, duration_seconds, created_at, profiles!inner(id, full_name, username)', { count: 'exact' })
    .order('created_at', { ascending: false })
  if (userIds) query = query.in('user_id', userIds)
  if (filterAction && ALLOWED_ACTIONS.includes(filterAction)) {
    query = query.eq('action', filterAction)
  }
  if (from) query = query.gte('created_at', from)
  if (to) query = query.lte('created_at', to)

  const fromIdx = (page - 1) * limit
  const { data: rows, error: qErr, count } = await query.range(fromIdx, fromIdx + limit - 1)
  if (qErr) return errorResponse(qErr.message, 500)

  const total = count ?? 0
  const items = (rows || []).map((r: {
    id: string; user_id: string; action: string; metadata: Record<string, unknown>;
    duration_seconds: number | null; created_at: string;
    profiles: { full_name: string; username: string } | null;
  }) => ({
    id: r.id,
    userId: r.user_id,
    userName: r.profiles?.full_name || r.profiles?.username || r.user_id,
    username: r.profiles?.username || '',
    action: r.action,
    metadata: r.metadata || {},
    durationSeconds: r.duration_seconds,
    createdAt: r.created_at,
  }))

  return jsonResponse({
    items,
    page,
    limit,
    total,
    totalPages: Math.max(1, Math.ceil(total / limit)),
  })
}
