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

    // 0. Determine homework type: EXAM reopens as a NEW attempt (keep history),
    // PRACTICE keeps legacy behavior (archive + reactivate session)
    const { data: hwRow } = await serviceRoleClient
      .from('homeworks')
      .select('id, type')
      .eq('id', homeworkId)
      .maybeSingle()
    const isExam = (hwRow as any)?.type === 'EXAM'

    if (isExam) {
      // 1. Archive any non-archived sessions (frees the single-ACTIVE partial unique index).
      // Old SUBMITTED submissions are KEPT untouched so exam history stays visible.
      await serviceRoleClient
        .from('exam_sessions')
        .update({ status: 'ARCHIVED' })
        .eq('homework_id', homeworkId)
        .eq('student_id', studentId)
        .neq('status', 'ARCHIVED')

      // 2. Next attempt number = max attempt_no seen so far + 1
      const [{ data: sessRows }, { data: subRows }] = await Promise.all([
        serviceRoleClient
          .from('exam_sessions')
          .select('attempt_no')
          .eq('homework_id', homeworkId)
          .eq('student_id', studentId),
        serviceRoleClient
          .from('submissions')
          .select('attempt_no')
          .eq('homework_id', homeworkId)
          .eq('student_id', studentId)
      ])
      const maxSeen = Math.max(
        0,
        ...((sessRows || []).map((r: any) => Number(r.attempt_no) || 0)),
        ...((subRows || []).map((r: any) => Number(r.attempt_no) || 0))
      )
      const nextAttempt = maxSeen + 1

      // 3. Carry over latest draft unless admin asked to clear answers
      let draftAnswers: any = {}
      if (!resetAnswers) {
        const { data: latestSess } = await serviceRoleClient
          .from('exam_sessions')
          .select('draft_answers')
          .eq('homework_id', homeworkId)
          .eq('student_id', studentId)
          .order('created_at', { ascending: false })
          .limit(1)
          .maybeSingle()
        draftAnswers = (latestSess as any)?.draft_answers || {}
      }

      // 4. Create the NEW active attempt (student entry resumes/takeovers it).
      // Timer always starts fresh for a new attempt.
      const { error: newSessErr } = await serviceRoleClient
        .from('exam_sessions')
        .insert({
          homework_id: homeworkId,
          student_id: studentId,
          session_token: crypto.randomUUID(),
          status: 'ACTIVE',
          attempt_no: nextAttempt,
          draft_answers: draftAnswers
        })
      if (newSessErr) return errorResponse('Failed to create new exam attempt', 500)

      // 5. Log the reopen action (old violation logs are KEPT for history;
      // new-attempt quota is time-scoped by the new session's created_at)
      await serviceRoleClient
        .from('exam_logs')
        .insert({
          homework_id: homeworkId,
          student_id: studentId,
          action: 'ADMIN_REOPENED'
        })

      return jsonResponse({ success: true, newAttempt: true, attemptNo: nextAttempt })
    }

    // 1. Soft delete/archive any active submissions for this student & homework
    const { data: submissions } = await serviceRoleClient
      .from('submissions')
      .update({ status: 'REOPENED_ARCHIVED' })
      .eq('homework_id', homeworkId)
      .eq('student_id', studentId)
      .neq('status', 'REOPENED_ARCHIVED')
      .select('id')
      
    // 2. Clear old violation logs so student gets fresh violation quota
    await serviceRoleClient
      .from('exam_logs')
      .delete()
      .eq('homework_id', homeworkId)
      .eq('student_id', studentId)

    // 3. Reactivate the exam_session
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

    // 4. Log the reopen action
    await serviceRoleClient
      .from('exam_logs')
      .insert({
        homework_id: homeworkId,
        student_id: studentId,
        action: 'ADMIN_REOPENED'
      })

    return jsonResponse({ success: true, submissionArchived: !!(submissions && submissions.length > 0) })
  } catch (err: unknown) {
    const error = err as Error
    return errorResponse(error.message || 'Unauthorized / Error', 401)
  }
})
