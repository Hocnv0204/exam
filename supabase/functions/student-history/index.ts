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
    const homeworkId = url.searchParams.get('homeworkId')

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
            type,
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

      // Fetch answer keys for questions
      const questionIds = (answers || []).map((a: any) => a.question_id)
      const { data: answerKeys } = await serviceRoleClient
        .from('question_answers')
        .select('question_id, mc_answer, tf_answers, sa_answer, sa_tolerance')
        .in('question_id', questionIds)

      const keyMap = new Map((answerKeys || []).map((k: any) => [k.question_id, k]))

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

      // Determine active grading structure
      const totalQuestions = (answers || []).length
      const mcCount = (answers || []).filter((a: any) => a.questions?.question_type === 'MULTIPLE_CHOICE').length
      const tfCount = (answers || []).filter((a: any) => a.questions?.question_type === 'TRUE_FALSE').length
      const saCount = (answers || []).filter((a: any) => a.questions?.question_type === 'SHORT_ANSWER').length

      const isAllMC = mcCount === totalQuestions && totalQuestions > 0
      const isStructureB = mcCount === 12 && tfCount === 4 && saCount === 6
      const isStructureC = mcCount === 18 && tfCount === 4 && saCount === 6

      let calculatedScore = Number(sub.total_score)
      if (isAllMC && totalQuestions > 0 && sub.correct_count !== undefined && sub.correct_count !== null) {
        calculatedScore = Math.round((Number(sub.correct_count) / totalQuestions) * 10 * 10) / 10
      }

      const passScore = Number(hwObj?.pass_score ?? 5)
      const score = calculatedScore
      const isPassed = score >= passScore

      const formattedAnswers = (answers || []).map((ans: any) => {
        const qType = ans.questions?.question_type
        const key = keyMap.get(ans.question_id)

        let points = 1.0
        if (isAllMC) {
          points = totalQuestions > 0 ? (10.0 / totalQuestions) : 1.0
        } else if (isStructureB) {
          if (qType === 'MULTIPLE_CHOICE') points = 0.25
          else if (qType === 'TRUE_FALSE') points = 1.0
          else if (qType === 'SHORT_ANSWER') points = 0.5
        } else if (isStructureC) {
          if (qType === 'MULTIPLE_CHOICE') points = 0.25
          else if (qType === 'TRUE_FALSE') points = 1.0
          else if (qType === 'SHORT_ANSWER') points = 0.25
        } else {
          points = ans.questions?.points !== undefined && ans.questions?.points !== null ? Number(ans.questions.points) : 1.0
        }

        let scoreEarned = ans.score_earned !== undefined && ans.score_earned !== null ? Number(ans.score_earned) : 0
        if (isAllMC) {
          scoreEarned = ans.is_correct ? points : 0
        }

        let correctAnswerSummary: any = null
        let statementGrades: any = undefined

        if (qType === 'MULTIPLE_CHOICE') {
          if (user.role === 'ADMIN') correctAnswerSummary = key?.mc_answer || null
        } else if (qType === 'TRUE_FALSE') {
          if (user.role === 'ADMIN') correctAnswerSummary = key?.tf_answers || null
          const studentVal = ans.given_answer?.value || {}
          const correctVal = (key?.tf_answers as any) || {}

          const correctA = correctVal.a !== undefined ? correctVal.a : correctVal.s1
          const correctB = correctVal.b !== undefined ? correctVal.b : correctVal.s2
          const correctC = correctVal.c !== undefined ? correctVal.c : correctVal.s3
          const correctD = correctVal.d !== undefined ? correctVal.d : correctVal.s4

          if (correctA !== undefined) {
            statementGrades = {
              a: studentVal.a !== undefined ? studentVal.a === correctA : false,
              b: studentVal.b !== undefined ? studentVal.b === correctB : false,
              c: studentVal.c !== undefined ? studentVal.c === correctC : false,
              d: studentVal.d !== undefined ? studentVal.d === correctD : false,
            }
          } else if (ans.is_correct || ans.score_earned === 1) {
            statementGrades = { a: true, b: true, c: true, d: true }
          }
        } else if (qType === 'SHORT_ANSWER') {
          if (user.role === 'ADMIN') {
            correctAnswerSummary = {
              answer: key?.sa_answer,
              tolerance: key?.sa_tolerance || 0,
            }
          }
        }

        return {
          questionId: ans.question_id,
          questionNumber: ans.questions?.question_number,
          questionType: qType,
          is_correct: ans.is_correct,
          isCorrect: ans.is_correct,
          score_earned: scoreEarned,
          scoreEarned: scoreEarned,
          pointsPossible: points,
          given_answer: ans.given_answer,
          givenAnswer: ans.given_answer,
          correct_answer: user.role === 'ADMIN' ? correctAnswerSummary : null,
          correctAnswerSummary: user.role === 'ADMIN' ? correctAnswerSummary : null,
          statementGrades,
          questions: {
            question_number: ans.questions?.question_number,
            question_type: ans.questions?.question_type,
            prompt: ans.questions?.prompt,
            points,
          },
        }
      })

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
        type: hwObj?.type || 'PRACTICE',
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
          type: hwObj?.type || 'PRACTICE',
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
          type,
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
      .eq('status', 'SUBMITTED')
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

    // If target homework is specified
    if (homeworkId) {
      query = query.eq('homework_id', homeworkId)
    }

    const { data: rawSubmissions, error: fetchErr } = await query

    if (fetchErr) {
      return errorResponse(fetchErr.message, 500)
    }

    const subIds = (rawSubmissions || []).map((s: any) => s.id)
    const wrongAnswersMap = new Map<string, any[]>()
    const wrongQuestionsSummaryMap = new Map<number, any>()

    if (user.role === 'ADMIN' && subIds.length > 0) {
      const { data: subAns } = await serviceRoleClient
        .from('submission_answers')
        .select(`
          submission_id,
          question_id,
          given_answer,
          is_correct,
          score_earned,
          questions!inner (
            id,
            question_number,
            question_type,
            prompt,
            points,
            question_answers (
              mc_answer,
              tf_answers,
              sa_answer,
              sa_tolerance
            )
          )
        `)
        .in('submission_id', subIds)
        .eq('is_correct', false)

      if (subAns) {
        const studentProfileMap = new Map(
          (rawSubmissions || []).map((s: any) => [s.id, { id: s.student_id, name: s.profiles?.full_name || 'Học sinh' }])
        )

        for (const sa of subAns) {
          const q = sa.questions
          if (!q) continue
          const qAnswersRaw = q.question_answers
          const qAnswers = Array.isArray(qAnswersRaw) ? qAnswersRaw[0] : qAnswersRaw
          const qNum = q.question_number
          const qType = q.question_type

          // Determine if question was completely unanswered / left blank
          let isUnanswered = false
          const gVal = sa.given_answer
          if (qType === 'MULTIPLE_CHOICE') {
            isUnanswered = !gVal?.value || String(gVal.value).trim() === ''
          } else if (qType === 'SHORT_ANSWER') {
            isUnanswered = gVal?.value === null || gVal?.value === undefined || String(gVal.value).trim() === ''
          } else if (qType === 'TRUE_FALSE') {
            const val = gVal?.value || {}
            isUnanswered = val.a === undefined && val.b === undefined && val.c === undefined && val.d === undefined
          }

          // Format given answer text
          let givenStr = ''
          if (isUnanswered) {
            givenStr = 'Bỏ trống (Chưa làm)'
          } else if (qType === 'TRUE_FALSE') {
            const val = gVal?.value || {}
            const renderVal = (v: any) => v === true ? 'Đ' : (v === false ? 'S' : '_')
            givenStr = `a: ${renderVal(val.a)}, b: ${renderVal(val.b)}, c: ${renderVal(val.c)}, d: ${renderVal(val.d)}`
          } else {
            givenStr = String(gVal.value)
          }

          // Format correct answer text
          let correctStr = ''
          if (qType === 'MULTIPLE_CHOICE') {
            correctStr = qAnswers?.mc_answer || ''
          } else if (qType === 'TRUE_FALSE') {
            const val = qAnswers?.tf_answers || {}
            const a = val.a !== undefined ? val.a : val.s1
            const b = val.b !== undefined ? val.b : val.s2
            const c = val.c !== undefined ? val.c : val.s3
            const d = val.d !== undefined ? val.d : val.s4
            if (a !== undefined || b !== undefined || c !== undefined || d !== undefined) {
              correctStr = `a: ${a ? 'Đ' : 'S'}, b: ${b ? 'Đ' : 'S'}, c: ${c ? 'Đ' : 'S'}, d: ${d ? 'Đ' : 'S'}`
            }
          } else if (qType === 'SHORT_ANSWER') {
            correctStr = qAnswers?.sa_answer !== null && qAnswers?.sa_answer !== undefined ? String(qAnswers.sa_answer) : ''
          }

          const wrongItem = {
            questionId: q.id,
            questionNumber: qNum,
            questionType: qType,
            prompt: q.prompt || '',
            givenAnswer: givenStr,
            correctAnswer: correctStr,
            isUnanswered,
            scoreEarned: sa.score_earned || 0
          }

          if (!wrongAnswersMap.has(sa.submission_id)) {
            wrongAnswersMap.set(sa.submission_id, [])
          }
          wrongAnswersMap.get(sa.submission_id)!.push(wrongItem)

          const studentInfo = studentProfileMap.get(sa.submission_id) || { id: '', name: 'Học sinh' }
          if (!wrongQuestionsSummaryMap.has(qNum)) {
            wrongQuestionsSummaryMap.set(qNum, {
              questionNumber: qNum,
              questionType: qType,
              prompt: q.prompt || '',
              correctAnswer: correctStr,
              totalFailed: 0,
              wrongCount: 0,
              unansweredCount: 0,
              students: []
            })
          }
          const summaryObj = wrongQuestionsSummaryMap.get(qNum)!
          summaryObj.totalFailed += 1
          if (isUnanswered) {
            summaryObj.unansweredCount += 1
          } else {
            summaryObj.wrongCount += 1
          }
          summaryObj.students.push({
            studentId: studentInfo.id,
            studentName: studentInfo.name,
            givenAnswer: givenStr,
            isUnanswered,
            scoreEarned: sa.score_earned || 0
          })
        }
      }
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

      const wrongAnswers = wrongAnswersMap.get(sub.id) || []
      wrongAnswers.sort((a: any, b: any) => a.questionNumber - b.questionNumber)

      return {
        id: sub.id,
        submissionId: sub.id,
        homeworkId: sub.homework_id,
        homeworkTitle: hw.title || 'Bài tập',
        score,
        maxScore,
        passScore,
        isPassed,
        type: hw.type || 'PRACTICE',
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
        wrongAnswers: user.role === 'ADMIN' ? wrongAnswers : undefined,
      }
    })

    const wrongQuestionsSummary = Array.from(wrongQuestionsSummaryMap.values())
      .sort((a: any, b: any) => a.questionNumber - b.questionNumber)

    return jsonResponse({
      studentId: studentId || (user.role === 'STUDENT' ? user.id : undefined),
      classId: classId || undefined,
      homeworkId: homeworkId || undefined,
      totalSubmissions: history.length,
      history,
      wrongQuestionsSummary: user.role === 'ADMIN' ? wrongQuestionsSummary : undefined,
    })
  } catch (err: unknown) {
    const error = err as Error
    return errorResponse(error.message || 'Unauthorized / Error', 401)
  }
})
