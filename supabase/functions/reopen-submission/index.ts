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
    const url = new URL(req.url)
    const action = url.searchParams.get('action') || 'reopen'

    // Cộng điểm vào bài làm (cá nhân hoặc cả lớp trong 1 bài).
    // Body: { homeworkId, studentId? | allInHomework?: true, classId?, bonus }
    // - bonus là MỨC cộng tuyệt đối (ghi đè lần cộng trước, không dồn), >= 0.
    // - total_score = min(điểm chấm gốc + bonus, max_score).
    if (action === 'set-bonus') {
      const { homeworkId, studentId, allInHomework, classId, bonus } = body
      const bonusVal = Number(bonus)
      if (!homeworkId || Number.isNaN(bonusVal) || bonusVal < 0) {
        return errorResponse('homeworkId and bonus (>= 0) are required', 400)
      }
      if (!studentId && !allInHomework) {
        return errorResponse('studentId or allInHomework=true is required', 400)
      }

      let targetStudentIds: string[] | null = null
      if (allInHomework) {
        let q = serviceRoleClient
          .from('submissions')
          .select('student_id')
          .eq('homework_id', homeworkId)
          .eq('status', 'SUBMITTED')
        if (classId) {
          const { data: enrolled } = await serviceRoleClient
            .from('student_classes')
            .select('student_id')
            .eq('class_id', classId)
          const ids = (enrolled || []).map((e: { student_id: string }) => e.student_id)
          if (ids.length === 0) return jsonResponse({ success: true, updated: 0 })
          q = q.in('student_id', ids)
        }
        const { data: rows, error: listErr } = await q
        if (listErr) return errorResponse(listErr.message, 500)
        targetStudentIds = [...new Set((rows || []).map((r: { student_id: string }) => r.student_id))].filter(Boolean)
        if (targetStudentIds.length === 0) return jsonResponse({ success: true, updated: 0 })
      }

      let subQuery = serviceRoleClient
        .from('submissions')
        .select('id, total_score, max_score, bonus_score')
        .eq('homework_id', homeworkId)
        .eq('status', 'SUBMITTED')
      if (allInHomework && targetStudentIds) {
        subQuery = subQuery.in('student_id', targetStudentIds)
      } else {
        subQuery = subQuery.eq('student_id', studentId)
      }
      const { data: subs, error: subErr } = await subQuery
      if (subErr) return errorResponse(subErr.message, 500)
      if (!subs || subs.length === 0) {
        return errorResponse('No submitted submission found to apply bonus', 404)
      }

      let updated = 0
      for (const s of subs as Array<{ id: string; total_score: number; max_score: number; bonus_score: number | null }>) {
        const base = Number(s.total_score || 0) - Number(s.bonus_score || 0)
        const maxScore = Number(s.max_score || 10)
        const newTotal = Math.min(maxScore, Math.round((base + bonusVal) * 100) / 100)
        const { error: upErr } = await serviceRoleClient
          .from('submissions')
          .update({ total_score: newTotal, bonus_score: bonusVal })
          .eq('id', s.id)
        if (!upErr) updated++
      }

      return jsonResponse({ success: true, updated, bonus: bonusVal })
    }

    const { homeworkId, studentId, resetTimer, resetAnswers } = body

    if (!homeworkId || !studentId) {
      return errorResponse('homeworkId and studentId are required', 400)
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
