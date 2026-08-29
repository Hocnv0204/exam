import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { requireAuth } from '../../shared/auth-middleware.ts'
import { handleCors, jsonResponse, errorResponse } from '../../shared/response-helper.ts'

serve(async (req: Request) => {
  const corsRes = handleCors(req)
  if (corsRes) return corsRes

  try {
    const { user, serviceRoleClient } = await requireAuth(req)
    const url = new URL(req.url)

    // GET: Admin fetches logs for a homework
    if (req.method === 'GET') {
      if (user.role !== 'ADMIN') {
        return errorResponse('Forbidden: Only admins can view exam logs', 403)
      }

      const homeworkId = url.searchParams.get('homeworkId')
      if (!homeworkId) {
        return errorResponse('homeworkId is required', 400)
      }

      const { data: logs, error } = await serviceRoleClient
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

      if (error) return errorResponse(error.message, 500)

      return jsonResponse(logs)
    }

    // POST: Student submits an exam log (cheat attempt / warning)
    if (req.method === 'POST') {
      if (user.role !== 'STUDENT') {
        return errorResponse('Forbidden: Only students can submit exam logs', 403)
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

      // Only check violations for specific penalized actions
      const penalizedActions = ['LEAVE_TAB', 'BLUR_TAB', 'LEAVE_EXAM']
      if (penalizedActions.includes(action)) {
        // Get max_violations from homework
        const { data: hw } = await serviceRoleClient
          .from('homeworks')
          .select('max_violations')
          .eq('id', homeworkId)
          .single()
        
        const maxV = hw?.max_violations ?? 3

        // Count current violations
        const { count, error: countErr } = await serviceRoleClient
          .from('exam_logs')
          .select('*', { count: 'exact', head: true })
          .eq('homework_id', homeworkId)
          .eq('student_id', user.id)
          .in('action', penalizedActions)

        if (!countErr && count !== null && count >= maxV) {
          // Trigger server-side auto-submit
          const { data: session } = await serviceRoleClient
            .from('exam_sessions')
            .select('session_token, draft_answers, status')
            .eq('homework_id', homeworkId)
            .eq('student_id', user.id)
            .eq('status', 'ACTIVE')
            .maybeSingle()
            
          if (session) {
            const authHeader = req.headers.get('Authorization')
            const draftAnswers = Array.isArray(session.draft_answers) ? session.draft_answers : []
            
            // Invoke submit-homework
            const { error: invokeErr } = await serviceRoleClient.functions.invoke('submit-homework', {
              body: {
                homeworkId,
                answers: draftAnswers,
                durationSecondsTaken: 0,
                sessionToken: session.session_token
              },
              headers: {
                Authorization: authHeader || ''
              }
            })

            if (!invokeErr) {
              return jsonResponse({ success: true, log: data, autoSubmitted: true })
            }
          }
        }
      }

      return jsonResponse({ success: true, log: data, autoSubmitted: false })
    }

    return errorResponse('Method not allowed', 405)
  } catch (err: unknown) {
    const error = err as Error
    return errorResponse(error.message || 'Unauthorized / Error', 401)
  }
})
