import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { requireAuth } from '../../shared/auth-middleware.ts'
import { handleCors, jsonResponse, errorResponse } from '../../shared/response-helper.ts'

const ACTIONS = ['LEAVE_TAB', 'BLUR_TAB', 'LEAVE_EXAM', 'DEVTOOLS', 'FULLSCREEN_EXIT', 'RETURN_TAB', 'COPY', 'PASTE',
  'EXAM_STARTED', 'EXAM_RESUMED', 'CONNECTION_RESTORED', 'AUTOSAVE_RECOVERED']
const INFORMATIONAL = new Set(['EXAM_STARTED', 'EXAM_RESUMED', 'CONNECTION_RESTORED', 'AUTOSAVE_RECOVERED'])
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

export function createExamLogHandler({ requireAuth, handleCors, jsonResponse, errorResponse, submitInvoker = (client: any, params: any) => client.functions.invoke('submit-homework', params) }: any) {
  return async (req: Request) => {
    const cors = handleCors(req)
    if (cors) return cors
    try {
      const { user, serviceRoleClient: db } = await requireAuth(req)
      const url = new URL(req.url)
      if (req.method !== 'GET' && req.method !== 'POST') return errorResponse('Method not allowed', 405)
      let body: any = {}
      if (req.method === 'POST') {
        if (user.role !== 'STUDENT') return errorResponse('Forbidden: Only students can submit exam logs', 403)
        try { body = await req.json() } catch { return errorResponse('Invalid JSON body', 400) }
        if (!body || typeof body !== 'object' || !UUID.test(body.homeworkId || '') || !ACTIONS.includes(body.action) ||
          typeof body.sessionToken !== 'string' || !body.sessionToken ||
          typeof body.eventId !== 'string' || !/^[A-Za-z0-9_-]{1,128}$/.test(body.eventId) ||
          (body.sessionId !== undefined && !UUID.test(body.sessionId))) {
          return errorResponse('Valid homeworkId, action, sessionToken and eventId are required', 400)
        }
      }
      const homeworkId = req.method === 'POST' ? body.homeworkId : url.searchParams.get('homeworkId')
      if (!homeworkId || !UUID.test(homeworkId)) return errorResponse('Valid homeworkId is required', 400)
      const { data: homework, error: hwError } = await db.from('homeworks')
        .select('id, type, is_published, max_violations, lessons(is_trial, chapters(class_id))')
        .eq('id', homeworkId).maybeSingle()
      if (hwError) return errorResponse('Failed to verify exam', 500)
      if (!homework || (req.method === 'POST' && !homework.is_published)) return errorResponse('Homework not found or not published', 404)
      if (req.method === 'POST' && homework.type !== 'EXAM') return errorResponse('Exam logs are only valid for EXAM assignments', 400)
      if (user.role !== 'ADMIN' && user.role !== 'STUDENT') return errorResponse('Forbidden: Invalid role', 403)
      if (user.role === 'STUDENT') {
        const isTrial = homework.lessons?.is_trial === true
        const classId = homework.lessons?.chapters?.class_id
        if (!isTrial) {
          if (!classId) return errorResponse('Failed to verify exam class', 500)
          // student_classes dùng khóa kép (student_id, class_id) — không có cột id;
          // PK đảm bảo tối đa 1 dòng nên maybeSingle an toàn, không cần lo trùng lặp.
          const { data: enrollment, error } = await db.from('student_classes').select('student_id, class_id, status')
            .eq('student_id', user.id).eq('class_id', classId).eq('status', 'ACTIVE').maybeSingle()
          if (error) return errorResponse('Failed to verify enrollment', 500)
          if (!enrollment) return errorResponse('Forbidden: You are not enrolled in the class for this exam', 403)
        }
        const { data: targets, error } = await db.from('homework_targets').select('student_id').eq('homework_id', homeworkId)
        if (error) return errorResponse('Failed to verify exam targets', 500)
        if (targets?.length && !targets.some((t: any) => t.student_id === user.id))
          return errorResponse('Forbidden: You are not assigned to this exam', 403)
      }
      if (req.method === 'GET') {
        const studentId = url.searchParams.get('studentId')
        if (studentId && !UUID.test(studentId)) return errorResponse('Invalid studentId', 400)
        if (user.role === 'STUDENT' && studentId && studentId !== user.id)
          return errorResponse('Forbidden: Students can only view their own exam logs', 403)
        const sessionId = url.searchParams.get('sessionId')
        if (sessionId && !UUID.test(sessionId)) return errorResponse('Invalid sessionId', 400)
        const attempt = url.searchParams.get('attemptNo')
        if (attempt !== null && (!/^[1-9]\d*$/.test(attempt) || Number(attempt) > 100000)) return errorResponse('Invalid attemptNo', 400)
        const page = url.searchParams.get('page') || '1'
        const limit = url.searchParams.get('limit') || '100'
        if (!/^[1-9]\d*$/.test(page) || !/^[1-9]\d*$/.test(limit) || Number(limit) > 100 || Number(page) > 10000)
          return errorResponse('Invalid page or limit', 400)
        let query = db.from('exam_logs').select('id,session_id,attempt_no,action,event_id,counted,reason,severity,server_timestamp,created_at,student_id,profiles!inner(full_name,username)')
          .eq('homework_id', homeworkId).order('server_timestamp', { ascending: false }).order('id', { ascending: false })
        if (user.role === 'STUDENT' || studentId) query = query.eq('student_id', user.role === 'STUDENT' ? user.id : studentId)
        if (sessionId) query = query.eq('session_id', sessionId)
        if (attempt) query = query.eq('attempt_no', Number(attempt))
        const offset = (Number(page) - 1) * Number(limit)
        const { data, error } = await query.range(offset, offset + Number(limit) - 1)
        if (error) return errorResponse('Failed to load exam logs', 500)
        return jsonResponse(data || [])
      }
      const maxV = Math.max(1, homework.max_violations ?? 3)
      const { data: rows, error: recordError } = await db.rpc('record_exam_event', {
        p_homework_id: homeworkId, p_student_id: user.id, p_session_token: body.sessionToken,
        p_event_id: body.eventId, p_action: body.action, p_max_violations: maxV, p_session_id: body.sessionId || null
      })
      if (recordError) {
        if (/INVALID_SESSION|EVENT_ID_CONFLICT/.test(recordError.message || '')) return errorResponse(recordError.message, 403)
        return errorResponse('Failed to record exam event', 500)
      }
      const recorded = rows?.[0]
      if (!recorded) return errorResponse('Failed to record exam event', 500)
      let autoSubmitted = false
      let autoSubmitPending = false
      let submissionId: string | null = null
      // Informational signals must not claim/trigger a submission. A counted event's
      // idempotent retry remains the path for reconciling an uncertain threshold.
      if (!INFORMATIONAL.has(body.action) && recorded.violation_count >= maxV) {
        const { data: claimed, error: claimError } = await db.rpc('claim_exam_auto_submit', {
          p_session_id: recorded.session_id, p_session_token: body.sessionToken, p_max_violations: maxV
        })
        if (claimError) return errorResponse('Failed to claim auto-submit', 500)
        if (claimed) {
          const { data: session, error } = await db.from('exam_sessions').select('draft_answers')
            .eq('id', recorded.session_id).eq('session_token', body.sessionToken).maybeSingle()
          if (!error && session) {
            try {
              const result = await submitInvoker(db, {
                body: { homeworkId, answers: Array.isArray(session.draft_answers) ? session.draft_answers : [],
                  durationSecondsTaken: 0, sessionToken: body.sessionToken, disqualified: true,
                  violationCount: recorded.violation_count },
                headers: { Authorization: req.headers.get('Authorization') || '' }
              })
              submissionId = result?.data?.submissionId
              if (!result?.error && typeof submissionId === 'string' && UUID.test(submissionId)) {
                const { error: confirmError } = await db.from('exam_sessions').update({ auto_submit_state: 'CONFIRMED', auto_submission_id: submissionId })
                  .eq('id', recorded.session_id).eq('auto_submit_state', 'PENDING')
                if (!confirmError) autoSubmitted = true
              } else {
                // 4xx validation errors are definitive; 5xx/timeouts may have committed a
                // submission, so they stay PENDING until reconciled by an operator.
                const httpStatus = result?.error?.context?.status
                const definiteFailure = (!result?.error && !!result?.data?.error) ||
                  (Number.isInteger(httpStatus) && httpStatus >= 400 && httpStatus < 500 && httpStatus !== 408 && httpStatus !== 429)
                if (definiteFailure) {
                await db.from('exam_sessions').update({ auto_submit_state: 'READY' })
                  .eq('id', recorded.session_id).eq('auto_submit_state', 'PENDING')
                }
              }
            } catch (error) { console.error('[exam-log] Submission outcome uncertain:', error) }
          }
        }
        if (!autoSubmitted) {
          const { data: state, error } = await db.from('exam_sessions').select('auto_submit_state, auto_submission_id')
            .eq('id', recorded.session_id).maybeSingle()
          autoSubmitPending = !error && state?.auto_submit_state === 'PENDING'
          if (!error && state?.auto_submit_state === 'CONFIRMED' && state.auto_submission_id) {
            submissionId = state.auto_submission_id
            autoSubmitted = true
          }
        }
      }
      return jsonResponse({ success: true, log: recorded.log_row, counted: recorded.log_row.counted,
        currentViolations: recorded.violation_count, maxViolations: maxV, autoSubmitted, autoSubmitPending,
        submissionId: autoSubmitted ? submissionId : null, idempotent: recorded.already_recorded })
    } catch (err: any) {
      const message = err?.message || 'Unauthorized / Error'
      return errorResponse(message, message.includes('Forbidden') ? 403 : 401)
    }
  }
}

serve(createExamLogHandler({ requireAuth, handleCors, jsonResponse, errorResponse }))
