import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { requireAuth } from '../../shared/auth-middleware.ts'
import { handleCors, jsonResponse, errorResponse } from '../../shared/response-helper.ts'

serve(async (req: Request) => {
  const corsRes = handleCors(req)
  if (corsRes) return corsRes

  try {
    const { user, serviceRoleClient } = await requireAuth(req)

    // GET: Admin fetches sessions for a homework
    if (req.method === 'GET') {
      if (user.role !== 'ADMIN') {
        return errorResponse('Forbidden: Only admins can view exam sessions', 403)
      }
      const url = new URL(req.url)
      const homeworkId = url.searchParams.get('homeworkId')
      if (!homeworkId) return errorResponse('homeworkId is required', 400)

      const { data: sessions, error } = await serviceRoleClient
        .from('exam_sessions')
        .select(`
          id,
          student_id,
          status,
          created_at,
          last_heartbeat_at
        `)
        .eq('homework_id', homeworkId)
        .order('created_at', { ascending: false })

      if (error) return errorResponse(error.message, 500)

      const studentIds = [...new Set((sessions || []).map(s => s.student_id))]
      let profilesMap: Record<string, any> = {}
      if (studentIds.length > 0) {
        const { data: profiles } = await serviceRoleClient
          .from('profiles')
          .select('id, full_name, username')
          .in('id', studentIds)
        if (profiles) {
          profilesMap = profiles.reduce((acc, p) => ({ ...acc, [p.id]: p }), {})
        }
      }

      const sessionsWithProfiles = (sessions || []).map(s => ({
        ...s,
        profiles: profilesMap[s.student_id] || { full_name: 'Học sinh', username: 'student' }
      }))

      return jsonResponse(sessionsWithProfiles)
    }

    if (req.method !== 'POST') return errorResponse('Method not allowed', 405)

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
        const getViolationsCount = async (createdAt: string) => {
          const { count } = await serviceRoleClient
            .from('exam_logs')
            .select('*', { count: 'exact', head: true })
            .eq('homework_id', homeworkId)
            .eq('student_id', user.id)
            .gte('created_at', createdAt)
            .in('action', ['LEAVE_TAB', 'BLUR_TAB', 'LEAVE_EXAM', 'DEVTOOLS', 'FULLSCREEN_EXIT'])
          return count || 0
        }

        // If student reloads (F5) or reconnects with the same session token, resume immediately
        if (existingSession.session_token === sessionToken) {
          await serviceRoleClient
            .from('exam_sessions')
            .update({ last_heartbeat_at: new Date().toISOString() })
            .eq('id', existingSession.id)

          const currentViolations = await getViolationsCount(existingSession.created_at)

          return jsonResponse({
            success: true,
            resumed: true,
            currentViolations,
            draftAnswers: existingSession.draft_answers || null
          })
        }

        // Seamless Takeover: Update session token to new token and restore existing drafts
        const { error: updateErr } = await serviceRoleClient
          .from('exam_sessions')
          .update({ 
            session_token: sessionToken, 
            last_heartbeat_at: new Date().toISOString() 
          })
          .eq('id', existingSession.id)

        if (updateErr) return errorResponse('Takeover failed', 500)
        const currentViolations = await getViolationsCount(existingSession.created_at)

        return jsonResponse({
          success: true,
          takeover: true,
          currentViolations,
          draftAnswers: existingSession.draft_answers || null
        })
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
        }, 409)
      }

      return jsonResponse({ success: true })
    }

    if (action === 'heartbeat') {
      if (!sessionToken) return errorResponse('sessionToken is required', 400)
      
      const { data: updated, error } = await serviceRoleClient
        .from('exam_sessions')
        .update({ last_heartbeat_at: new Date().toISOString() })
        .eq('homework_id', homeworkId)
        .eq('student_id', user.id)
        .eq('status', 'ACTIVE')
        .eq('session_token', sessionToken)
        .select('id')
        .maybeSingle()
      
      if (error) return errorResponse('Failed to update heartbeat', 500)
      if (!updated) {
        return jsonResponse({
          error: 'INVALID_TOKEN',
          message: 'Phiên không hợp lệ hoặc đã bị ghi đè.'
        }, 403)
      }

      return jsonResponse({ success: true })
    }

    if (action === 'autosave') {
      if (!sessionToken) return errorResponse('sessionToken is required', 400)
      const { draftAnswers } = body
      if (!draftAnswers) return errorResponse('draftAnswers is required', 400)

      const { data: updated, error } = await serviceRoleClient
        .from('exam_sessions')
        .update({ 
          draft_answers: draftAnswers,
          last_heartbeat_at: new Date().toISOString() 
        })
        .eq('homework_id', homeworkId)
        .eq('student_id', user.id)
        .eq('status', 'ACTIVE')
        .eq('session_token', sessionToken)
        .select('id')
        .maybeSingle()
      
      if (error) return errorResponse('Failed to autosave', 500)
      if (!updated) {
        return jsonResponse({
          error: 'INVALID_TOKEN',
          message: 'Phiên không hợp lệ hoặc đã bị ghi đè.'
        }, 403)
      }

      return jsonResponse({ success: true })
    }

    return errorResponse('Invalid action', 400)

  } catch (err: unknown) {
    const error = err as Error
    const msg = error.message || 'Unauthorized / Error'
    const status = msg.includes('Forbidden') ? 403 : 401
    return errorResponse(msg, status)
  }
})
