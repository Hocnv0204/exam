import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { requireAdmin } from '../../shared/auth-middleware.ts'
import { handleCors, jsonResponse, errorResponse } from '../../shared/response-helper.ts'

serve(async (req: Request) => {
  const corsRes = handleCors(req)
  if (corsRes) return corsRes

  try {
    if (req.method !== 'POST') return errorResponse('Method not allowed', 405)

    const { user, serviceRoleClient } = await requireAdmin(req)
    const body = await req.json()
    const { homeworkId, studentId, resetTimer, resetAnswers } = body

    if (!homeworkId || !studentId) {
      return errorResponse('homeworkId and studentId are required', 400)
    }

    // 1. Soft delete the submission
    const { data: submission, error: subErr } = await serviceRoleClient
      .from('submissions')
      .update({ status: 'REOPENED_ARCHIVED' })
      .eq('homework_id', homeworkId)
      .eq('student_id', studentId)
      .eq('status', 'SUBMITTED')
      .select('id')
      .maybeSingle()
      
    // Even if no submission found (e.g. crashed before submit), we can still reopen the session

    // 2. Reactivate the exam_session
    const { data: session } = await serviceRoleClient
      .from('exam_sessions')
      .select('id, draft_answers, created_at')
      .eq('homework_id', homeworkId)
      .eq('student_id', studentId)
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle()

    if (session) {
      const updates: any = {
        status: 'ACTIVE',
        // Force last_heartbeat_at to be old so the student's next `init` can takeover
        last_heartbeat_at: new Date(Date.now() - 100000).toISOString()
      }

      if (resetAnswers) {
        updates.draft_answers = {}
      }
      if (resetTimer) {
        updates.created_at = new Date().toISOString()
      }

      const { error: sessionErr } = await serviceRoleClient
        .from('exam_sessions')
        .update(updates)
        .eq('id', session.id)

      if (sessionErr) return errorResponse('Failed to reactivate session', 500)
    }

    // 3. Log the reopen action
    await serviceRoleClient
      .from('exam_logs')
      .insert({
        homework_id: homeworkId,
        student_id: studentId,
        action: 'ADMIN_REOPENED'
      })

    return jsonResponse({ success: true, submissionArchived: !!submission })
  } catch (err: unknown) {
    const error = err as Error
    return errorResponse(error.message || 'Unauthorized / Error', 401)
  }
})
