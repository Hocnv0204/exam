import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { requireAuth } from '../../shared/auth-middleware.ts'
import { handleCors, jsonResponse, errorResponse } from '../../shared/response-helper.ts'
import { gradeQuestion } from '../../shared/grading-service.ts'

serve(async (req: Request) => {
  const corsRes = handleCors(req)
  if (corsRes) return corsRes

  try {
    if (req.method !== 'GET') {
      return errorResponse('Method not allowed', 405)
    }

    const { user, serviceRoleClient } = await requireAuth(req)
    const url = new URL(req.url)
    const queryStudentId = url.searchParams.get('studentId')
    const submissionId = url.searchParams.get('submissionId')
    const queryClassId = url.searchParams.get('classId')

    // ADMIN class-wide history list view
    if (user.role === 'ADMIN' && queryClassId) {
      const { data: classSubmissions, error: classSubErr } = await serviceRoleClient
        .from('submissions')
        .select(`
          id,
          homework_id,
          total_score,
          max_score,
          correct_count,
          wrong_count,
          submitted_at,
          duration_seconds_taken,
          homeworks (title, pass_score),
          profiles!inner (
            username,
            full_name,
            student_classes!inner (class_id)
          )
        `)
        .eq('profiles.student_classes.class_id', queryClassId)
        .order('submitted_at', { ascending: false })

      if (classSubErr) return errorResponse(classSubErr.message, 500)

      const formattedList = (classSubmissions || []).map((sub) => {
        const passScore = Number((sub.homeworks as unknown as { pass_score: number })?.pass_score || 5)
        const prof = (sub.profiles as unknown as { username: string; full_name: string })
        return {
          submissionId: sub.id,
          homeworkId: sub.homework_id,
          homeworkTitle: (sub.homeworks as unknown as { title: string })?.title || 'Unknown Homework',
          score: sub.total_score,
          maxScore: sub.max_score,
          passScore,
          isPassed: Number(sub.total_score) >= passScore,
          correctCount: sub.correct_count,
          wrongCount: sub.wrong_count,
          durationSecondsTaken: sub.duration_seconds_taken || 0,
          submittedAt: sub.submitted_at,
          studentName: prof?.full_name || prof?.username || 'Học sinh'
        }
      })

      return jsonResponse({
        classId: queryClassId,
        totalSubmissions: formattedList.length,
        history: formattedList,
      })
    }

    let targetStudentId = user.id

    if (user.role === 'ADMIN') {
      if (queryStudentId) {
        targetStudentId = queryStudentId
      }
    } else {
      // Student can only query own history
      if (queryStudentId && queryStudentId !== user.id) {
        return errorResponse('Forbidden: Students cannot access history of other students', 403)
      }
    }

    // Detail view for a specific submission
    if (submissionId) {
      const { data: submission, error: subErr } = await serviceRoleClient
        .from('submissions')
        .select(`
          id,
          homework_id,
          student_id,
          total_score,
          max_score,
          correct_count,
          wrong_count,
          submitted_at,
          duration_seconds_taken,
          homeworks (title, pdf_path, pass_score),
          profiles (username, full_name)
        `)
        .eq('id', submissionId)
        .single()

      if (subErr || !submission) return errorResponse('Submission not found', 404)

      // RLS Check for Student
      if (user.role === 'STUDENT' && submission.student_id !== user.id) {
        return errorResponse('Forbidden: Submission belongs to another student', 403)
      }

      // Generate Signed URL for PDF storage file
      const hwObj = submission.homeworks as unknown as { title: string; pdf_path: string; pass_score: number }
      let pdfUrl = hwObj?.pdf_path || ''
      if (pdfUrl && !pdfUrl.startsWith('http')) {
        const { data: signedUrlData, error: storageErr } = await serviceRoleClient.storage
          .from('pdf-files')
          .createSignedUrl(hwObj.pdf_path, 3600)
        if (!storageErr && signedUrlData) {
          pdfUrl = signedUrlData.signedUrl
        }
      }

      // Fetch submission answer details
      const { data: answers, error: ansErr } = await serviceRoleClient
        .from('submission_answers')
        .select(`
          id,
          question_id,
          given_answer,
          is_correct,
          score_earned,
          questions (
            question_number,
            question_type,
            prompt,
            points,
            question_answers (mc_answer, tf_answers, sa_answer, sa_tolerance)
          )
        `)
        .eq('submission_id', submissionId)

      if (ansErr) return errorResponse(ansErr.message, 500)

      const formattedAnswers = (answers || []).map((ans) => {
        const q = ans.questions as unknown as {
          question_number: number
          question_type: string
          prompt: string
          points: number
          question_answers: {
            mc_answer: string | null
            tf_answers: unknown
            sa_answer: string | null
            sa_tolerance: number | null
          } | null
        }

        const qaRaw = q?.question_answers
        const qa = Array.isArray(qaRaw) ? qaRaw[0] : qaRaw

        // Run grading to retrieve statementGrades and detailed feedback
        let statementGrades: unknown = null
        if (q && qa) {
          const gradeResult = gradeQuestion({
            questionId: ans.question_id,
            questionType: q.question_type as any,
            points: q.points || 1.0,
            mcAnswer: qa.mc_answer || null,
            tfAnswers: qa.tf_answers as any || null,
            saAnswer: qa.sa_answer || null,
            saTolerance: qa.sa_tolerance !== null && qa.sa_tolerance !== undefined ? Number(qa.sa_tolerance) : 0,
            givenAnswer: ans.given_answer as any,
          })
          statementGrades = gradeResult.statementGrades || null
        }

        // Extract correct answer summary (Only for ADMIN)
        let correctAnswerSummary: unknown = null
        if (user.role === 'ADMIN' && q) {
          if (q.question_type === 'MULTIPLE_CHOICE') {
            correctAnswerSummary = qa?.mc_answer || null
          } else if (q.question_type === 'TRUE_FALSE') {
            correctAnswerSummary = qa?.tf_answers || null
          } else if (q.question_type === 'SHORT_ANSWER') {
            correctAnswerSummary = qa?.sa_answer || null
          }
        }

        return {
          questionNumber: q?.question_number || 1,
          prompt: q?.prompt || '',
          questionType: q?.question_type,
          givenAnswer: ans.given_answer,
          isCorrect: ans.is_correct,
          scoreEarned: Number(ans.score_earned),
          pointsPossible: q?.points || 1.0,
          correctAnswerSummary,
          feedback: ans.is_correct ? 'Correct' : 'Incorrect',
          statementGrades,
        }
      })

      return jsonResponse({
        submission: {
          id: submission.id,
          homeworkTitle: (submission.homeworks as unknown as { title: string })?.title,
          studentName: (submission.profiles as unknown as { full_name: string })?.full_name,
          score: submission.total_score,
          maxScore: submission.max_score,
          passScore: (submission.homeworks as unknown as { pass_score: number })?.pass_score,
          correctCount: submission.correct_count,
          wrongCount: submission.wrong_count,
          durationSecondsTaken: submission.duration_seconds_taken || 0,
          submittedAt: submission.submitted_at,
          pdfUrl,
        },
        questionReview: formattedAnswers,
        answers: answers || [], // fallback for backward compatibility
      })
    }

    // List view of student's submissions
    const { data: submissions, error } = await serviceRoleClient
      .from('submissions')
      .select(`
        id,
        homework_id,
        total_score,
        max_score,
        correct_count,
        wrong_count,
        submitted_at,
        duration_seconds_taken,
        homeworks (
          title,
          pass_score,
          lessons (
            id,
            title,
            chapters (
              id,
              title,
              classes (
                id,
                name
              )
            )
          )
        )
      `)
      .eq('student_id', targetStudentId)
      .order('submitted_at', { ascending: false })

    if (error) return errorResponse(error.message, 500)

    const formattedList = submissions.map((sub) => {
      const homework = sub.homeworks as any
      const passScore = Number(homework?.pass_score || 5)
      const lesson = homework?.lessons
      const chapter = lesson?.chapters
      const cls = chapter?.classes

      return {
        submissionId: sub.id,
        homeworkId: sub.homework_id,
        homeworkTitle: homework?.title || 'Unknown Homework',
        score: sub.total_score,
        maxScore: sub.max_score,
        passScore,
        isPassed: Number(sub.total_score) >= passScore,
        correctCount: sub.correct_count,
        wrongCount: sub.wrong_count,
        durationSecondsTaken: sub.duration_seconds_taken || 0,
        submittedAt: sub.submitted_at,
        lessonId: lesson?.id || null,
        lessonTitle: lesson?.title || 'Unknown Lesson',
        chapterId: chapter?.id || null,
        chapterTitle: chapter?.title || 'Unknown Chapter',
        classId: cls?.id || null,
        className: cls?.name || 'Unknown Class'
      }
    })

    return jsonResponse({
      studentId: targetStudentId,
      totalSubmissions: formattedList.length,
      history: formattedList,
    })
  } catch (err: unknown) {
    const error = err as Error
    return errorResponse(error.message || 'Unauthorized / Error', 401)
  }
})
