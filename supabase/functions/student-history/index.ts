import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { handleCors, jsonResponse, errorResponse } from '../../shared/response-helper.ts'
import { requireAuth } from '../../shared/auth-middleware.ts'

serve(async (req: Request) => {
  const corsRes = handleCors(req)
  if (corsRes) return corsRes

  try {
    if (req.method !== 'GET') {
      return errorResponse('Method not allowed', 405)
    }

    const { user, serviceRoleClient } = await requireAuth(req)
    const url = new URL(req.url)
    const studentId = url.searchParams.get('studentId')
    const classId = url.searchParams.get('classId')
    const submissionId = url.searchParams.get('submissionId')

    // 1. Single Submission Details (for assignment review)
    if (submissionId) {
      const { data: sub, error: subErr } = await serviceRoleClient
        .from('submissions')
        .select(`
          id,
          homework_id,
          student_id,
          total_score,
          max_score,
          correct_count,
          wrong_count,
          duration_seconds_taken,
          is_late,
          submitted_at,
          profiles (id, username, full_name),
          homeworks (
            id,
            title,
            pass_score,
            max_score,
            pdf_path,
            deadline,
            lessons (
              id,
              title,
              chapters (
                id,
                title,
                class_id,
                classes (id, name)
              )
            )
          )
        `)
        .eq('id', submissionId)
        .single()

      if (subErr || !sub) {
        return errorResponse('Submission not found', 404)
      }

      // Security check: if student, must own the submission
      if (user.role === 'STUDENT' && sub.student_id !== user.id) {
        return errorResponse('Forbidden: You can only view your own submission', 403)
      }

      // Fetch submission answers with questions
      const { data: answers, error: ansErr } = await serviceRoleClient
        .from('submission_answers')
        .select(`
          id,
          question_id,
          given_answer,
          is_correct,
          score_earned,
          questions (
            id,
            question_number,
            question_type,
            prompt,
            points
          )
        `)
        .eq('submission_id', submissionId)

      if (ansErr) {
        return errorResponse(ansErr.message, 500)
      }

      // Generate signed URL for PDF if exists
      const hwObj = sub.homeworks as any
      let pdfUrl = hwObj?.pdf_path || ''
      if (pdfUrl && !pdfUrl.startsWith('http')) {
        const { data: signedUrlData } = await serviceRoleClient.storage
          .from('pdf-files')
          .createSignedUrl(pdfUrl, 3600)
        if (signedUrlData?.signedUrl) {
          pdfUrl = signedUrlData.signedUrl
        }
      }

      const passScore = Number(hwObj?.pass_score ?? 5)
      const score = Number(sub.total_score)
      const isPassed = score >= passScore

      const formattedAnswers = (answers || []).map((ans: any) => ({
        is_correct: ans.is_correct,
        score_earned: ans.score_earned,
        given_answer: ans.given_answer,
        questions: {
          question_number: ans.questions?.question_number,
          question_type: ans.questions?.question_type,
          prompt: ans.questions?.prompt,
          points: ans.questions?.points,
        },
      }))

      return jsonResponse({
        submissionId: sub.id,
        homeworkId: sub.homework_id,
        homeworkTitle: hwObj?.title || 'Bài tập',
        submittedAt: sub.submitted_at,
        score,
        maxScore: Number(sub.max_score || hwObj?.max_score || 10),
        passScore,
        isPassed,
        isLate: sub.is_late,
        correctCount: sub.correct_count,
        wrongCount: sub.wrong_count,
        pdfUrl,
        answers: formattedAnswers,
        submission: {
          id: sub.id,
          homeworkTitle: hwObj?.title || 'Bài tập',
          score,
          maxScore: Number(sub.max_score || hwObj?.max_score || 10),
          passScore,
          isPassed,
          correctCount: sub.correct_count,
          wrongCount: sub.wrong_count,
          submittedAt: sub.submitted_at,
          isLate: sub.is_late,
          pdfUrl,
        },
      })
    }

    // 2. Query Submissions List
    let query = serviceRoleClient
      .from('submissions')
      .select(`
        id,
        homework_id,
        student_id,
        total_score,
        max_score,
        correct_count,
        wrong_count,
        duration_seconds_taken,
        is_late,
        submitted_at,
        profiles!inner (id, username, full_name),
        homeworks!inner (
          id,
          title,
          max_score,
          pass_score,
          deadline,
          pdf_path,
          lessons!inner (
            id,
            title,
            chapters!inner (
              id,
              title,
              class_id,
              classes!inner (id, name)
            )
          )
        )
      `)
      .order('submitted_at', { ascending: false })

    // If target student is specified
    if (studentId) {
      if (user.role === 'STUDENT' && studentId !== user.id) {
        return errorResponse('Forbidden: You can only view your own history', 403)
      }
      query = query.eq('student_id', studentId)
    } else if (user.role === 'STUDENT') {
      // Default student to their own id
      query = query.eq('student_id', user.id)
    }

    // If target class is specified
    if (classId) {
      query = query.eq('homeworks.lessons.chapters.class_id', classId)
    }

    const { data: rawSubmissions, error: fetchErr } = await query

    if (fetchErr) {
      return errorResponse(fetchErr.message, 500)
    }

    const history = (rawSubmissions || []).map((sub: any) => {
      const hw = sub.homeworks || {}
      const lesson = hw.lessons || {}
      const chapter = lesson.chapters || {}
      const cls = chapter.classes || {}
      const profile = sub.profiles || {}

      const score = Number(sub.total_score)
      const passScore = Number(hw.pass_score ?? 5)
      const maxScore = Number(sub.max_score || hw.max_score || 10)
      const isPassed = score >= passScore
      const isLate = sub.is_late || (hw.deadline ? new Date(sub.submitted_at) > new Date(hw.deadline) : false)

      return {
        id: sub.id,
        submissionId: sub.id,
        homeworkId: sub.homework_id,
        homeworkTitle: hw.title || 'Bài tập',
        score,
        maxScore,
        passScore,
        isPassed,
        correctCount: sub.correct_count,
        wrongCount: sub.wrong_count,
        durationSecondsTaken: sub.duration_seconds_taken || 0,
        isLate,
        submittedAt: sub.submitted_at,
        lessonId: lesson.id,
        lessonTitle: lesson.title || '',
        chapterId: chapter.id,
        chapterTitle: chapter.title || '',
        classId: cls.id,
        className: cls.name || '',
        studentId: sub.student_id,
        studentName: profile.full_name || 'Học sinh',
        username: profile.username || '',
      }
    })

    return jsonResponse({
      studentId: studentId || (user.role === 'STUDENT' ? user.id : undefined),
      classId: classId || undefined,
      totalSubmissions: history.length,
      history,
    })
  } catch (err: unknown) {
    const error = err as Error
    return errorResponse(error.message || 'Unauthorized / Error', 401)
  }
})
