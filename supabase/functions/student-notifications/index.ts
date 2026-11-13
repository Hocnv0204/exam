import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { requireAuth } from '../../shared/auth-middleware.ts'
import { handleCors, jsonResponse, errorResponse } from '../../shared/response-helper.ts'
import { NotificationValidationError, mapNotificationRow, parseListQuery, parseMarkBody } from './logic.ts'

serve(async (req: Request) => {
  const corsRes = handleCors(req)
  if (corsRes) return corsRes

  try {
    const { user, serviceRoleClient: db } = await requireAuth(req)
    if (user.role !== 'STUDENT') return errorResponse('Chỉ học sinh mới có thể xem thông báo.', 403, null, 'FORBIDDEN')

    if (req.method === 'GET') return await listNotifications(req, user, db)
    if (req.method === 'POST') return await markRead(req, user, db)
    return errorResponse('Method not allowed', 405)
  } catch (err: unknown) {
    if (err instanceof NotificationValidationError) return errorResponse(err.message, 400, null, 'VALIDATION')
    const message = (err as Error).message || ''
    if (/Missing Authorization|Unauthorized|User profile|Account locked/.test(message)) {
      return errorResponse('Không thể xác thực người dùng.', 401)
    }
    console.error('[student-notifications] unexpected error:', (err as Error).name)
    return errorResponse('Không tải được thông báo', 500)
  }
})

async function listNotifications(req: Request, user: any, db: any): Promise<Response> {
  const { unreadOnly, limit } = parseListQuery(new URL(req.url))
  let query = db
    .from('notifications')
    .select('id, title, content, type, related_id, is_read, created_at')
    .eq('user_id', user.id)
    .order('created_at', { ascending: false })
    .limit(limit)
  if (unreadOnly) query = query.eq('is_read', false)
  const { data, error } = await query
  if (error) {
    console.error('[student-notifications] list failed:', error.name || 'DatabaseError')
    return errorResponse('Không tải được thông báo', 500)
  }
  return jsonResponse({ items: (data || []).map(mapNotificationRow) })
}

async function markRead(req: Request, user: any, db: any): Promise<Response> {
  const body = await req.json().catch(() => {
    throw new NotificationValidationError('Dữ liệu đánh dấu đã đọc không hợp lệ.')
  })
  const command = parseMarkBody(body)
  let query = db.from('notifications').update({ is_read: true }).eq('user_id', user.id).eq('is_read', false)
  if ('ids' in command) query = query.in('id', command.ids)
  const { data, error } = await query.select('id')
  if (error) {
    console.error('[student-notifications] mark read failed:', error.name || 'DatabaseError')
    return errorResponse('Không tải được thông báo', 500)
  }
  return jsonResponse({ updated: (data || []).length })
}
