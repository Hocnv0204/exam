import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { requireAdmin, requireAuth } from '../../shared/auth-middleware.ts'
import { createServiceRoleClient } from '../../shared/supabase-client.ts'
import { handleCors, jsonResponse, errorResponse } from '../_shared/cors.ts'
import { getAccessToken, meetApiFetch } from '../_shared/google.ts'

interface SpaceResponse {
  name?: string // "spaces/xxxx" (khóa map Meet API)
  meetingUri?: string
  meetingCode?: string
  config?: unknown
}

serve(async (req: Request) => {
  const corsRes = handleCors(req)
  if (corsRes) return corsRes

  try {
    // GET ?lessonId=... : trả về session mới nhất + recordings của bài học.
    // Frontend dùng để render 3 scenarios (chưa có / chờ video / hoàn tất).
    if (req.method === 'GET') {
      const { user } = await requireAuth(req)
      if (user.role !== 'ADMIN') {
        return errorResponse('Forbidden: Only admins can view meeting sessions', 403)
      }
      const lessonId = new URL(req.url).searchParams.get('lessonId') || new URL(req.url).searchParams.get('lesson_id')
      if (!lessonId) return errorResponse('Missing lessonId query param', 400)

      const svc = createServiceRoleClient()
      const { data: session, error: sessErr } = await svc
        .from('meeting_sessions')
        .select('*')
        .eq('lesson_id', lessonId)
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle()
      if (sessErr) return errorResponse(sessErr.message, 500)
      if (!session) return jsonResponse({ session: null, recordings: [] })

      const { data: recordings } = await svc
        .from('meeting_recordings')
        .select('*')
        .eq('session_id', (session as { id: string }).id)
        .order('end_time', { ascending: false })
      return jsonResponse({ session, recordings: recordings || [] })
    }

    if (req.method !== 'POST') {
      return errorResponse('Method not allowed', 405)
    }

    // 1-2. Xác thực JWT, chặn request nếu role không phải Admin.
    const { user, serviceRoleClient } = await requireAdmin(req)

    // 3. Parse body { lesson_id, title } (chấp nhận cả camelCase từ FE).
    const body = await req.json().catch(() => ({}))
    const lessonId: string | undefined = body.lesson_id || body.lessonId
    const title: string | undefined = body.title
    if (!lessonId) return errorResponse('Missing lesson_id', 400)

    // Idempotent: bài học đã có session PENDING/READY thì trả về luôn,
    // tránh tạo nhiều Space rác trên Google.
    const { data: existing } = await serviceRoleClient
      .from('meeting_sessions')
      .select('*')
      .eq('lesson_id', lessonId)
      .in('status', ['PENDING', 'READY'])
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle()
    if (existing) {
      return jsonResponse({
        meeting_uri: (existing as { meeting_uri: string }).meeting_uri,
        meetingUri: (existing as { meeting_uri: string }).meeting_uri,
        session_id: (existing as { id: string }).id,
        sessionId: (existing as { id: string }).id,
        reused: true,
      })
    }

    // Đảm bảo lesson tồn tại để lấy title fallback.
    const { data: lesson } = await serviceRoleClient
      .from('lessons')
      .select('id, title')
      .eq('id', lessonId)
      .maybeSingle()
    if (!lesson) return errorResponse('Lesson not found', 404)

    // 4. Lấy token Google.
    let accessToken: string
    try {
      accessToken = await getAccessToken()
    } catch (e) {
      return errorResponse(`Google auth failed: ${(e as Error).message}`, 502)
    }

    // 5. Tạo Space: POST https://meet.googleapis.com/v2/spaces
    let space: SpaceResponse
    try {
      space = (await meetApiFetch('/v2/spaces', accessToken, {
        method: 'POST',
        body: JSON.stringify({ config: { accessType: 'TRUSTED' } }),
      })) as SpaceResponse
    } catch (e) {
      return errorResponse(`Create Meet space failed: ${(e as Error).message}`, 502)
    }
    if (!space?.name || !space?.meetingUri) {
      return errorResponse(`Create Meet space returned invalid payload: ${JSON.stringify(space)}`, 502)
    }

    // 6. Insert vào meeting_sessions (gán lesson_id).
    const { data: session, error: insertErr } = await serviceRoleClient
      .from('meeting_sessions')
      .insert({
        lesson_id: lessonId,
        space_name: space.name,
        meeting_uri: space.meetingUri,
        meeting_code: space.meetingCode || null,
        title: title || (lesson as { title: string }).title || null,
        created_by: user.id,
        status: 'PENDING',
      })
      .select()
      .single()
    if (insertErr) return errorResponse(insertErr.message, 500)

    // 7. Trả về link cho FE mở tab mới sang Meet.
    const row = session as { id: string; meeting_uri: string }
    return jsonResponse({
      meeting_uri: row.meeting_uri,
      meetingUri: row.meeting_uri,
      session_id: row.id,
      sessionId: row.id,
    })
  } catch (err: unknown) {
    const error = err as Error
    const status = /forbidden|admin/i.test(error.message) ? 403 : 401
    return errorResponse(error.message || 'Unauthorized', status)
  }
})
