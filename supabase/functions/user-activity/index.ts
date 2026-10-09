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
    if (req.method === 'GET') {
      if (user.role !== 'ADMIN') {
        return errorResponse('Forbidden: Only admins can view activity logs', 403)
      }
      const userId = url.searchParams.get('userId') || url.searchParams.get('user_id')
      if (!userId) return errorResponse('Missing userId', 400)
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
