import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { requireAuth } from '../../shared/auth-middleware.ts'
import { handleCors, jsonResponse, errorResponse } from '../../shared/response-helper.ts'

serve(async (req: Request) => {
  const corsRes = handleCors(req)
  if (corsRes) return corsRes

  try {
    const { user, serviceRoleClient: db } = await requireAuth(req)
    if (req.method === 'GET') {
      if (user.role !== 'ADMIN') return errorResponse('Forbidden: Only admins can view exam sessions', 403)
      const url = new URL(req.url)
      const homeworkId = url.searchParams.get('homeworkId')
      if (!homeworkId) return errorResponse('homeworkId is required', 400)
      const page = url.searchParams.get('page') || '1'
      const limit = url.searchParams.get('limit') || '100'
      if (!/^[1-9]\d*$/.test(page) || !/^[1-9]\d*$/.test(limit) || Number(limit) > 100 || Number(page) > 10000)
        return errorResponse('Invalid page or limit', 400)
      const offset = (Number(page) - 1) * Number(limit)
      const { data: sessions, error } = await db.from('exam_sessions')
        .select('id,student_id,attempt_no,status,created_at,last_heartbeat_at')
        .eq('homework_id', homeworkId).order('created_at', { ascending: false })
        .range(offset, offset + Number(limit) - 1)
      if (error) return errorResponse(error.message, 500)
      const ids = [...new Set((sessions || []).map(s => s.student_id))]
      const profiles: Record<string, any> = {}
      if (ids.length) {
        const { data, error: profileError } = await db.from('profiles').select('id,full_name,username').in('id', ids)
        if (profileError) return errorResponse('Failed to load student profiles', 500)
        for (const profile of data || []) profiles[profile.id] = profile
      }
      return jsonResponse((sessions || []).map(s => ({
        ...s, profiles: profiles[s.student_id] || { full_name: 'Học sinh', username: 'student' }
      })))
    }

    if (req.method !== 'POST') return errorResponse('Method not allowed', 405)
    if (user.role !== 'STUDENT') return errorResponse('Forbidden: Only students can manage exam sessions', 403)
    const { action, homeworkId, sessionToken, draftAnswers } = await req.json()
    if (!homeworkId || typeof sessionToken !== 'string' || !sessionToken || sessionToken.length > 255)
      return errorResponse('homeworkId and sessionToken are required', 400)
    if (action === 'init') {
      const { data, error } = await db.rpc('init_exam_attempt', {
        p_homework_id: homeworkId, p_student_id: user.id, p_token: sessionToken
      })
      if (error) {
        const msg = error.message || ''
        if (/FORBIDDEN/.test(msg)) return errorResponse('Forbidden: Exam is not assigned to this student', 403)
        if (/INVALID_EXAM/.test(msg)) return errorResponse('Published exam not found', 404)
        if (/EXAM_EXPIRED|ATTEMPT_LIMIT|INVALID_TOKEN/.test(msg)) return errorResponse(msg, 400)
        return errorResponse('Failed to start exam session', 500)
      }
      return jsonResponse(data)
    }
    if (action === 'heartbeat' || action === 'autosave') {
      if (action === 'autosave' && !Array.isArray(draftAnswers))
        return errorResponse('draftAnswers must be an array', 400)
      const { data, error } = await db.rpc('update_exam_attempt', {
        p_homework_id: homeworkId, p_student_id: user.id, p_token: sessionToken,
        p_draft: action === 'autosave' ? draftAnswers : null
      })
      if (error) return errorResponse('Failed to update exam session', 500)
      if (!data) return jsonResponse({ error: 'INVALID_TOKEN', message: 'Phiên không hợp lệ hoặc đã hết giờ.' }, 403)
      return jsonResponse({ success: true })
    }
    return errorResponse('Invalid action', 400)
  } catch (err: unknown) {
    const msg = (err as Error).message || 'Unauthorized / Error'
    return errorResponse(msg, msg.includes('Forbidden') ? 403 : 401)
  }
})
