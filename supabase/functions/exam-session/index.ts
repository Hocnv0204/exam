import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { requireStudent } from '../../shared/auth-middleware.ts'
import { handleCors, jsonResponse, errorResponse } from '../../shared/response-helper.ts'

serve(async (req: Request) => {
  const corsRes = handleCors(req)
  if (corsRes) return corsRes

  try {
    if (req.method !== 'POST') return errorResponse('Method not allowed', 405)

    const { user, serviceRoleClient } = await requireStudent(req)
    const body = await req.json()
    const { action, homeworkId, sessionToken } = body

    if (!homeworkId) return errorResponse('homeworkId is required', 400)

    if (action === 'init') {
      if (!sessionToken) return errorResponse('sessionToken is required', 400)
      
      // Check existing ACTIVE session
      const { data: existingSession } = await serviceRoleClient
        .from('exam_sessions')
        .select('*')
        .eq('homework_id', homeworkId)
        .eq('student_id', user.id)
        .eq('status', 'ACTIVE')
        .maybeSingle()

      if (existingSession) {
        // Check heartbeat
        const lastHeartbeat = new Date(existingSession.last_heartbeat_at).getTime()
        const now = Date.now()
        if (now - lastHeartbeat <= 90000) { // 90 seconds
          return jsonResponse({
            error: 'CONFLICT',
            message: 'Bài thi đang mở ở thiết bị/tab khác. Vui lòng đóng tab cũ hoặc chờ 90 giây để tiếp tục.'
          }, { status: 409 })
        } else {
          // Takeover: Update the session token
          const { error: updateErr } = await serviceRoleClient
            .from('exam_sessions')
            .update({ 
              session_token: sessionToken, 
              last_heartbeat_at: new Date().toISOString() 
            })
            .eq('id', existingSession.id)

          if (updateErr) return errorResponse('Takeover failed', 500)
          return jsonResponse({ success: true, takeover: true })
        }
      }

      // No active session exists, try to insert (will fail if race condition happens thanks to partial unique index)
      const { error: insertErr } = await serviceRoleClient
        .from('exam_sessions')
        .insert({
          homework_id: homeworkId,
          student_id: user.id,
          session_token: sessionToken,
          status: 'ACTIVE'
        })
      
      if (insertErr) {
        // Likely a race condition violation
        return jsonResponse({
          error: 'CONFLICT',
          message: 'Lỗi đồng bộ phiên. Vui lòng thử lại.'
        }, { status: 409 })
      }

      return jsonResponse({ success: true })
    }

    if (action === 'heartbeat') {
      if (!sessionToken) return errorResponse('sessionToken is required', 400)
      
      const { data: session } = await serviceRoleClient
        .from('exam_sessions')
        .select('id, session_token')
        .eq('homework_id', homeworkId)
        .eq('student_id', user.id)
        .eq('status', 'ACTIVE')
        .maybeSingle()

      if (!session) return errorResponse('No active session found', 404)
      if (session.session_token !== sessionToken) {
        return jsonResponse({
          error: 'INVALID_TOKEN',
          message: 'Phiên không hợp lệ hoặc đã bị ghi đè.'
        }, { status: 403 })
      }

      const { error } = await serviceRoleClient
        .from('exam_sessions')
        .update({ last_heartbeat_at: new Date().toISOString() })
        .eq('id', session.id)
      
      if (error) return errorResponse('Failed to update heartbeat', 500)

      return jsonResponse({ success: true })
    }

    if (action === 'autosave') {
      if (!sessionToken) return errorResponse('sessionToken is required', 400)
      const { draftAnswers } = body
      if (!draftAnswers) return errorResponse('draftAnswers is required', 400)

      const { data: session } = await serviceRoleClient
        .from('exam_sessions')
        .select('id, session_token')
        .eq('homework_id', homeworkId)
        .eq('student_id', user.id)
        .eq('status', 'ACTIVE')
        .maybeSingle()

      if (!session) return errorResponse('No active session found', 404)
      if (session.session_token !== sessionToken) {
        return jsonResponse({
          error: 'INVALID_TOKEN',
          message: 'Phiên không hợp lệ hoặc đã bị ghi đè.'
        }, { status: 403 })
      }

      const { error } = await serviceRoleClient
        .from('exam_sessions')
        .update({ 
          draft_answers: draftAnswers,
          last_heartbeat_at: new Date().toISOString() 
        })
        .eq('id', session.id)
      
      if (error) return errorResponse('Failed to autosave', 500)

      return jsonResponse({ success: true })
    }

    return errorResponse('Invalid action', 400)

  } catch (err: unknown) {
    const error = err as Error
    return errorResponse(error.message || 'Unauthorized / Error', 401)
  }
})
