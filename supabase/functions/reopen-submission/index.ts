import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { requireAdmin } from '../../shared/auth-middleware.ts'
import { handleCors, jsonResponse, errorResponse } from '../../shared/response-helper.ts'
import { calculateQuestionAward } from './award-calculation.js'
import { QUESTION_AWARD_LOG_SELECT, mapQuestionAwardLogRow } from '../../shared/question-award-logs.ts'

serve(async (req: Request) => {
  const corsRes = handleCors(req)
  if (corsRes) return corsRes

  try {
    if (req.method !== 'POST') return errorResponse('Method not allowed', 405)

    const { user, serviceRoleClient } = await requireAdmin(req)
    const body = await req.json()
    const url = new URL(req.url)
    const action = url.searchParams.get('action') || 'reopen'

    if (action === 'award-question') {
      const { submissionId, answerId } = body || {}
      const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i
      if (typeof submissionId !== 'string' || !uuid.test(submissionId) || typeof answerId !== 'string' || !uuid.test(answerId)) {
        return errorResponse('Valid submissionId and answerId are required', 400)
      }
      const { data: submission, error: subErr } = await serviceRoleClient.from('submissions')
        .select('id, status, is_trial, total_score, max_score').eq('id', submissionId).maybeSingle()
      if (subErr) return errorResponse(subErr.message, 500)
      if (!submission || submission.status !== 'SUBMITTED' || submission.is_trial) return errorResponse('Submitted non-trial submission not found', 404)
      const { data: answer, error: answerErr } = await serviceRoleClient.from('submission_answers')
        .select('id, submission_id, question_id, score_earned, questions(id, question_number, part_title, points)').eq('id', answerId).eq('submission_id', submissionId).maybeSingle()
      if (answerErr) return errorResponse(answerErr.message, 500)
      if (!answer) return errorResponse('Answer does not belong to submission', 404)
      const q = Array.isArray(answer.questions) ? answer.questions[0] : answer.questions
      const points = Number(q?.points)
      if (!Number.isFinite(points) || points < 0) return errorResponse('Invalid question points', 500)
      const calculation = calculateQuestionAward(answer.score_earned, points, submission.total_score, submission.max_score)
      // Idempotent: câu đã đủ điểm -> không ghi gì, không tạo event log.
      if (!calculation.delta) return jsonResponse({ success: true, delta: 0, scoreEarned: calculation.target, totalScore: calculation.newTotal })
      const { error: writeAnswerErr } = await serviceRoleClient.from('submission_answers').update({ score_earned: calculation.target }).eq('id', answerId).eq('submission_id', submissionId)
      if (writeAnswerErr) return errorResponse(writeAnswerErr.message, 500)
      const { error: writeSubErr } = await serviceRoleClient.from('submissions').update({ total_score: calculation.newTotal }).eq('id', submissionId).eq('status', 'SUBMITTED')
      if (writeSubErr) {
        await serviceRoleClient.from('submission_answers').update({ score_earned: answer.score_earned }).eq('id', answerId).eq('submission_id', submissionId)
        return errorResponse(writeSubErr.message, 500)
      }
      // Ghi nhật ký cộng điểm câu (audit bền vững). Chỉ ghi khi điểm THẬT SỰ được
      // cộng vào tổng bài (appliedDelta > 0); tổng đã chạm max_score thì câu được
      // chấm đầy đủ nhưng không có event log (không ghi event cho lần cộng rỗng).
      if (calculation.appliedDelta > 0) {
        const scoreBefore = Math.round(((Number(answer.score_earned) || 0) + Number.EPSILON) * 100) / 100
        const { data: logRow, error: logErr } = await serviceRoleClient.from('question_award_logs')
          .insert({
            submission_id: submissionId,
            answer_id: answerId,
            question_id: answer.question_id || q?.id || null,
            actor_id: user.id,
            actor_name: (user.fullName || user.username || 'Admin').trim() || 'Admin',
            question_number: Number.isInteger(q?.question_number) ? q.question_number : null,
            part_title: q?.part_title || null,
            question_points: points,
            score_before: scoreBefore,
            score_after: calculation.target,
            applied_delta: calculation.appliedDelta,
            total_score_after: calculation.newTotal
          })
          .select(QUESTION_AWARD_LOG_SELECT)
          .maybeSingle()
        if (logErr || !logRow) {
          // Log ghi không được -> KHÔNG để tồn tại điểm không có audit:
          // rollback best effort cả submission và answer rồi báo lỗi cho admin.
          await serviceRoleClient.from('submissions').update({ total_score: calculation.newTotal - calculation.appliedDelta }).eq('id', submissionId).eq('status', 'SUBMITTED')
          await serviceRoleClient.from('submission_answers').update({ score_earned: answer.score_earned }).eq('id', answerId).eq('submission_id', submissionId)
          return errorResponse(`Không thể ghi nhật ký cộng điểm: ${logErr?.message || 'award log row missing'}`, 500)
        }
        // Trả event vừa tạo để FE cập nhật UI ngay, không bắt buộc reload.
        return jsonResponse({ success: true, delta: calculation.appliedDelta, scoreEarned: calculation.target, totalScore: calculation.newTotal, awardLog: mapQuestionAwardLogRow(logRow) })
      }
      return jsonResponse({ success: true, delta: 0, scoreEarned: calculation.target, totalScore: calculation.newTotal })
    }

    // Giáo viên chấm một câu tự luận. Điểm luôn bị chặn trong [0, points] và
    // tổng bài được tính lại từ toàn bộ câu để không phụ thuộc thứ tự chấm.
    if (action === 'grade-essay') {
      const { submissionId, answerId, score, feedback } = body || {}
      const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i
      const scoreValue = Number(score)
      if (!uuid.test(String(submissionId || '')) || !uuid.test(String(answerId || '')) || !Number.isFinite(scoreValue) || scoreValue < 0) {
        return errorResponse('Valid submissionId, answerId and non-negative score are required', 400)
      }
      if (feedback !== undefined && feedback !== null && typeof feedback !== 'string') {
        return errorResponse('feedback must be text', 400)
      }
      const { data: answer, error: answerErr } = await serviceRoleClient.from('submission_answers')
        .select('id, submission_id, question_id, questions(id, question_type, points)')
        .eq('id', answerId).eq('submission_id', submissionId).maybeSingle()
      if (answerErr) return errorResponse(answerErr.message, 500)
      const q = Array.isArray(answer?.questions) ? answer.questions[0] : answer?.questions
      if (!answer || !q || q.question_type !== 'ESSAY') return errorResponse('Essay answer not found', 404)
      const points = Number(q.points)
      if (!Number.isFinite(points) || scoreValue > points) return errorResponse(`Score must be between 0 and ${points}`, 400)
      const roundedScore = Math.round(scoreValue * 100) / 100
      const { data: submission, error: subErr } = await serviceRoleClient.from('submissions')
        .select('id, max_score, status').eq('id', submissionId).maybeSingle()
      if (subErr) return errorResponse(subErr.message, 500)
      if (!submission || submission.status !== 'SUBMITTED') return errorResponse('Submitted submission not found', 404)
      const { error: writeErr } = await serviceRoleClient.from('submission_answers').update({
        score_earned: roundedScore,
        is_correct: roundedScore >= points,
        grading_status: 'MANUALLY_GRADED',
        teacher_feedback: feedback === undefined ? null : (feedback || null),
      }).eq('id', answerId).eq('submission_id', submissionId)
      if (writeErr) return errorResponse(writeErr.message, 500)

      const { data: allAnswers, error: allErr } = await serviceRoleClient.from('submission_answers')
        .select('score_earned, questions(points)').eq('submission_id', submissionId)
      if (allErr) return errorResponse(allErr.message, 500)
      const rawMax = (allAnswers || []).reduce((sum: number, a: any) => sum + Number(a.questions?.points || 0), 0)
      const rawEarned = (allAnswers || []).reduce((sum: number, a: any) => sum + Number(a.score_earned || 0), 0)
      const maxScore = Number(submission.max_score || 10)
      const totalScore = rawMax > 0 ? Math.round(Math.min(maxScore, rawEarned / rawMax * maxScore) * 100) / 100 : 0
      const { error: totalErr } = await serviceRoleClient.from('submissions').update({ total_score: totalScore }).eq('id', submissionId)
      if (totalErr) return errorResponse(totalErr.message, 500)
      return jsonResponse({ success: true, scoreEarned: roundedScore, totalScore, feedback: feedback || null, gradingStatus: 'MANUALLY_GRADED' })
    }

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
      const bonusChunkSize = 20
      for (let i = 0; i < subs.length; i += bonusChunkSize) {
        const chunk = subs.slice(i, i + bonusChunkSize)
        const results = await Promise.all(chunk.map((s) => {
          const base = Number(s.total_score || 0) - Number(s.bonus_score || 0)
          const maxScore = Number(s.max_score || 10)
          const newTotal = Math.min(maxScore, Math.round((base + bonusVal) * 100) / 100)
          return serviceRoleClient
            .from('submissions')
            .update({ total_score: newTotal, bonus_score: bonusVal })
            .eq('id', s.id)
        }))
        for (const r of results) {
          if (!r.error) updated++
        }
      }

      return jsonResponse({ success: true, updated, bonus: bonusVal })
    }

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
