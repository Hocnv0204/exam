import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { requireAuth } from '../../shared/auth-middleware.ts'
import { handleCors, jsonResponse, errorResponse } from '../../shared/response-helper.ts'

serve(async (req: Request) => {
  const corsRes = handleCors(req)
  if (corsRes) return corsRes

  try {
    const { user, serviceRoleClient } = await requireAuth(req)
    const url = new URL(req.url)

    // GET: Admin fetches logs (or student fetches their own logs)
    if (req.method === 'GET') {
      const homeworkId = url.searchParams.get('homeworkId')
      if (!homeworkId) {
        return errorResponse('homeworkId is required', 400)
      }

      let query = serviceRoleClient
        .from('exam_logs')
        .select(`
          id,
          action,
          created_at,
          student_id,
          profiles!inner(full_name, username)
        `)
        .eq('homework_id', homeworkId)
        .order('created_at', { ascending: false })

      if (user.role === 'STUDENT') {
        query = query.eq('student_id', user.id)
      } else if (user.role === 'ADMIN') {
        const studentId = url.searchParams.get('studentId')
        if (studentId) query = query.eq('student_id', studentId)
      } else {
        return errorResponse('Forbidden: Invalid role', 403)
      }

      const { data: logs, error } = await query
      if (error) return errorResponse(error.message, 500)

      return jsonResponse(logs)
    }

    // POST: Student submits an exam log (cheat attempt / warning)
    if (req.method === 'POST') {
      if (user.role !== 'STUDENT' && user.role !== 'ADMIN') {
        return errorResponse('Forbidden: Only students and administrators can submit exam logs', 403)
      }

      const body = await req.json()
      const { homeworkId, action } = body

      if (!homeworkId || !action) {
        return errorResponse('homeworkId and action are required', 400)
      }

      const { data, error } = await serviceRoleClient
        .from('exam_logs')
        .insert({
          homework_id: homeworkId,
          student_id: user.id,
          action: action
        })
        .select()
        .single()

      if (error) return errorResponse(error.message, 500)

      // 1. Fetch homework and session in parallel
      const hwPromise = serviceRoleClient
        .from('homeworks')
        .select('max_violations')
        .eq('id', homeworkId)
        .single()

      const sessionPromise = serviceRoleClient
        .from('exam_sessions')
        .select('id, session_token, draft_answers, status, created_at')
        .eq('homework_id', homeworkId)
        .eq('student_id', user.id)
        .eq('status', 'ACTIVE')
        .maybeSingle()

      const [{ data: hw }, { data: session }] = await Promise.all([hwPromise, sessionPromise])
      const maxV = hw?.max_violations ?? 3

      // 2. Count current violations for this specific exam session
      const penalizedActions = ['LEAVE_TAB', 'BLUR_TAB', 'LEAVE_EXAM', 'DEVTOOLS', 'FULLSCREEN_EXIT']
      let countQuery = serviceRoleClient
        .from('exam_logs')
        .select('*', { count: 'exact', head: true })
        .eq('homework_id', homeworkId)
        .eq('student_id', user.id)
        .in('action', penalizedActions)

      if (session?.created_at) {
        countQuery = countQuery.gte('created_at', session.created_at)
      }

      const { count } = await countQuery
      const currentViolations = count || 0

      if (penalizedActions.includes(action) && currentViolations >= maxV && session) {
        const authHeader = req.headers.get('Authorization')
        const draftAnswers = Array.isArray(session.draft_answers) ? session.draft_answers : []
        
        const autoSubmitTask = serviceRoleClient.functions.invoke('submit-homework', {
          body: {
            homeworkId,
            answers: draftAnswers,
            durationSecondsTaken: 0,
            sessionToken: session.session_token,
            disqualified: true,
            violationCount: currentViolations
          },
          headers: {
            Authorization: authHeader || ''
          }
        }).catch((invokeErr: any) => {
          console.error('[exam-log] Auto-submit invoke failed:', invokeErr?.message)
        })

        // @ts-ignore EdgeRuntime is available in Supabase Edge Functions
        if (typeof EdgeRuntime !== 'undefined' && typeof EdgeRuntime.waitUntil === 'function') {
          EdgeRuntime.waitUntil(autoSubmitTask)
        }

        return jsonResponse({
          success: true,
          log: data,
          autoSubmitted: true,
          currentViolations,
          maxViolations: maxV
        })
      }

      return jsonResponse({ success: true, log: data, autoSubmitted: false, currentViolations, maxViolations: maxV })
    }

    return errorResponse('Method not allowed', 405)
  } catch (err: unknown) {
    const error = err as Error
    return errorResponse(error.message || 'Unauthorized / Error', 401)
  }
})
