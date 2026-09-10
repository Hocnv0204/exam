import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { handleCors, jsonResponse, errorResponse } from '../../shared/response-helper.ts'
import { requireAuth } from '../../shared/auth-middleware.ts'
import { createServiceRoleClient } from '../../shared/supabase-client.ts'

serve(async (req: Request) => {
  const corsRes = handleCors(req)
  if (corsRes) return corsRes

  try {
    if (req.method !== 'GET') {
      return errorResponse('Method not allowed', 405)
    }

    const url = new URL(req.url)
    const studentId = url.searchParams.get('studentId')
    const classId = url.searchParams.get('classId')
    const submissionId = url.searchParams.get('submissionId')
    const homeworkId = url.searchParams.get('homeworkId')
    const scope = url.searchParams.get('scope') // 'CLASS' | 'TRIAL'
    const isTrialQuery = scope === 'TRIAL' || url.searchParams.get('isTrial') === 'true' || classId === 'TRIAL'
    const guestPhone = url.searchParams.get('phone') || url.searchParams.get('guestPhone')

    const authHeader = req.headers.get('Authorization')
    let user: any = null
    let serviceRoleClient = createServiceRoleClient()

    if (authHeader) {
      try {
        const authRes = await requireAuth(req)
        user = authRes.user
        serviceRoleClient = authRes.serviceRoleClient
      } catch (e) {
        if (!isTrialQuery && !submissionId) {
          throw e
        }
      }
    } else if (!isTrialQuery && !submissionId) {
      return errorResponse('Unauthorized: Missing token', 401)
    }

    if (user?.role === 'ADMIN') {
      // Auto-cleanup: ensure formal student submissions are never marked as trial
      serviceRoleClient
        .from('submissions')
        .update({ is_trial: false, guest_name: null, guest_phone: null })
        .not('student_id', 'is', null)
        .eq('is_trial', true)
        .then(() => {})
        .catch(() => {})
    }

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
          is_trial,
          guest_name,
          guest_phone,
          submitted_at,
          profiles (id, username, full_name),
          homeworks (
            id,
            title,
            max_score,
            pass_score,
            pdf_path,
            type,
            lessons (
              id,
              title,
              is_trial,
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

      const isTrialSub = sub.is_trial === true || !sub.student_id || !!sub.guest_name || (sub.homeworks?.lessons?.is_trial === true)

      // If user is STUDENT and submission is not a trial submission, enforce student ownership
      if (user && user.role === 'STUDENT' && !isTrialSub && sub.student_id !== user.id) {
        return errorResponse('Forbidden: You cannot view another student submission', 403)
      }

      // If not trial submission and unauthenticated
      if (!user && !isTrialSub) {
        return errorResponse('Unauthorized: Login required to view this submission', 401)
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
          feedback,
          questions (
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
        .eq('submission_id', submissionId)

      if (ansErr) {
        return errorResponse(ansErr.message, 500)
      }

      // Sort answers by question_number
      answers?.sort((a: any, b: any) => {
        const numA = a.questions?.question_number || 0
        const numB = b.questions?.question_number || 0
        return numA - numB
      })

      const hwObj = sub.homeworks
      let pdfUrl = hwObj?.pdf_path
      if (pdfUrl && !pdfUrl.startsWith('http')) {
        const { data: signedUrlData } = await serviceRoleClient.storage
          .from('pdf-files')
          .createSignedUrl(hwObj.pdf_path, 3600)
        if (signedUrlData) {
          pdfUrl = signedUrlData.signedUrl
        }
      }

      const score = Number(sub.total_score)
      const passScore = Number(hwObj?.pass_score ?? 5)
      const isPassed = score >= passScore

      const formattedAnswers = (answers || []).map((ans: any) => {
        const qAnswers = ans.questions?.question_answers?.[0] || ans.questions?.question_answers || {}
        let correctAnswer: any = null
        if (ans.questions?.question_type === 'MULTIPLE_CHOICE') {
          correctAnswer = qAnswers.mc_answer
        } else if (ans.questions?.question_type === 'TRUE_FALSE') {
          correctAnswer = qAnswers.tf_answers
        } else if (ans.questions?.question_type === 'SHORT_ANSWER') {
          correctAnswer = qAnswers.sa_answer
        }

        const rawGiven = ans.given_answer
        let parsedGiven = rawGiven
        if (typeof rawGiven === 'string') {
          try {
            parsedGiven = JSON.parse(rawGiven)
          } catch {
            parsedGiven = rawGiven
          }
        }

        const points = Number(ans.questions?.points || 1)

        return {
          id: ans.id,
          questionId: ans.question_id,
          questionNumber: ans.questions?.question_number,
          questionType: ans.questions?.question_type,
          prompt: ans.questions?.prompt,
          points,
          givenAnswer: parsedGiven,
          correctAnswer,
          isCorrect: ans.is_correct,
          scoreEarned: Number(ans.score_earned || 0),
          feedback: ans.feedback,
          question: {
            id: ans.question_id,
            questionNumber: ans.questions?.question_number,
            questionType: ans.questions?.question_type,
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
        isTrial: isTrialSub,
        guestName: sub.guest_name || null,
        guestPhone: sub.guest_phone || null,
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
          isTrial: isTrialSub,
          guestName: sub.guest_name || null,
          guestPhone: sub.guest_phone || null,
          type: hwObj?.type || 'PRACTICE',
          pdfUrl,
        },
      })
    }

    // 2. Query Submissions List
    let classHomeworks: any[] = []
    let classHwIds: string[] = []

    if (isTrialQuery) {
      // Trial query: fetch all trial homeworks
      const { data: trialHws } = await serviceRoleClient
        .from('homeworks')
        .select(`
          id,
          title,
          type,
          duration_minutes,
          max_score,
          pass_score,
          deadline,
          lessons (
            id,
            title,
            is_trial,
            chapters (
              id,
              title,
              class_id,
              classes (id, name)
            )
          )
        `)
        .eq('is_published', true)

      classHomeworks = (trialHws || [])
        .filter((h: any) => h.lessons?.is_trial === true)
        .map((h: any) => ({
          id: h.id,
          title: h.title,
          type: h.type,
          durationMinutes: h.duration_minutes || 45,
          maxScore: h.max_score || 10,
          passScore: h.pass_score || 5,
          deadline: h.deadline,
          lessonTitle: h.lessons?.title || '',
          className: h.lessons?.chapters?.classes?.name || 'Chung'
        }))
    } else if (classId && classId !== 'TRIAL') {
      // Class query: fetch all homeworks belonging to this class
      const { data: hws, error: hwErr } = await serviceRoleClient
        .from('homeworks')
        .select(`
          id,
          title,
          type,
          duration_minutes,
          max_score,
          pass_score,
          deadline,
          lessons!inner (
            id,
            title,
            chapters!inner (
              id,
              title,
              class_id,
              classes (id, name)
            )
          )
        `)
        .eq('lessons.chapters.class_id', classId)
        .eq('is_published', true)
        .order('created_at', { ascending: false })

      if (!hwErr && hws) {
        classHomeworks = hws.map((h: any) => ({
          id: h.id,
          title: h.title,
          type: h.type,
          durationMinutes: h.duration_minutes || 45,
          maxScore: h.max_score || 10,
          passScore: h.pass_score || 5,
          deadline: h.deadline,
          lessonTitle: h.lessons?.title || '',
          className: h.lessons?.chapters?.classes?.name || ''
        }))
        classHwIds = hws.map((h: any) => h.id)
      }
    }

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
        is_trial,
        guest_name,
        guest_phone,
        submitted_at,
        profiles (id, username, full_name),
        homeworks (
          id,
          title,
          max_score,
          pass_score,
          deadline,
          pdf_path,
          type,
          lessons (
            id,
            title,
            is_trial,
            chapters (
              id,
              title,
              class_id,
              classes (id, name)
            )
          )
        )
      `)
      .eq('status', 'SUBMITTED')
      .order('submitted_at', { ascending: false })

    if (isTrialQuery || guestPhone) {
      // STRICT FILTER FOR TRIAL STUDENTS:
      // Only include actual trial/guest submissions (student_id is null or guest_phone is not null)
      query = query.or('student_id.is.null,guest_phone.not.is.null')
      if (guestPhone) {
        const p = guestPhone.trim()
        query = query.or(`guest_phone.ilike.%${p}%,guest_phone.eq.${p}`)
      }
      if (homeworkId) {
        query = query.eq('homework_id', homeworkId)
      }
    } else {
      // STRICT FILTER FOR CLASS STUDENTS:
      // Must have student_id (enrolled formal student)
      query = query.not('student_id', 'is', null)

      // If target student is specified
      if (studentId) {
        if (user?.role === 'STUDENT' && studentId !== user.id) {
          return errorResponse('Forbidden: You can only view your own history', 403)
        }
        query = query.eq('student_id', studentId)
      } else if (user?.role === 'STUDENT') {
        query = query.eq('student_id', user.id)
      }

      // If target class is specified
      if (classId && classId !== 'TRIAL') {
        if (classHwIds.length === 0) {
          // Class has no homeworks -> return early empty
          return jsonResponse({
            classId,
            homeworkId: homeworkId || undefined,
            totalSubmissions: 0,
            history: [],
            classHomeworks: [],
            submissionStats: null,
            unsubmittedStudents: []
          })
        }

        if (homeworkId) {
          query = query.eq('homework_id', homeworkId)
        } else {
          query = query.in('homework_id', classHwIds)
        }
      } else if (homeworkId) {
        query = query.eq('homework_id', homeworkId)
      }
    }

    const { data: rawSubmissions, error: fetchErr } = await query

    if (fetchErr) {
      return errorResponse(fetchErr.message, 500)
    }

    const subIds = (rawSubmissions || []).map((s: any) => s.id)
    const wrongAnswersMap = new Map<string, any[]>()
    const wrongQuestionsSummaryMap = new Map<number, any>()

    const canSeeWrongAnalysis = (user?.role === 'ADMIN' || isTrialQuery) && subIds.length > 0

    if (canSeeWrongAnalysis) {
      const { data: subAns } = await serviceRoleClient
        .from('submission_answers')
        .select(`
          submission_id,
          question_id,
          given_answer,
          is_correct,
          score_earned,
          questions (
            id,
            question_number,
            question_type,
            prompt,
            question_answers (
              mc_answer,
              tf_answers,
              sa_answer
            )
          )
        `)
        .in('submission_id', subIds)
        .eq('is_correct', false)

      if (subAns) {
        const studentProfileMap = new Map(
          (rawSubmissions || []).map((s: any) => [
            s.id,
            {
              id: s.student_id || s.id,
              name: s.guest_name || s.profiles?.full_name || (s.is_trial ? 'Học sinh trải nghiệm' : 'Học sinh'),
              phone: s.guest_phone || ''
            }
          ])
        )

        for (const sa of subAns) {
          const q = sa.questions
          if (!q) continue

          const qNum = q.question_number
          const qType = q.question_type
          const qAns = q.question_answers?.[0] || q.question_answers || {}

          let correctAnsStr = 'N/A'
          if (qType === 'MULTIPLE_CHOICE') {
            correctAnsStr = qAns.mc_answer || 'N/A'
          } else if (qType === 'TRUE_FALSE') {
            correctAnsStr = typeof qAns.tf_answers === 'object' ? JSON.stringify(qAns.tf_answers) : String(qAns.tf_answers || 'N/A')
          } else if (qType === 'SHORT_ANSWER') {
            correctAnsStr = String(qAns.sa_answer ?? 'N/A')
          }

          let givenStr = 'Chưa làm'
          let isUnanswered = false
          if (sa.given_answer !== null && sa.given_answer !== undefined) {
            if (typeof sa.given_answer === 'object') {
              if (sa.given_answer.value !== undefined && sa.given_answer.value !== null && sa.given_answer.value !== '') {
                givenStr = String(sa.given_answer.value)
              } else {
                givenStr = JSON.stringify(sa.given_answer)
              }
            } else {
              givenStr = String(sa.given_answer).trim()
            }
            if (!givenStr || givenStr === 'null' || givenStr === '""' || givenStr === '{}') {
              givenStr = 'Bỏ trống (Chưa làm)'
              isUnanswered = true
            }
          } else {
            givenStr = 'Bỏ trống (Chưa làm)'
            isUnanswered = true
          }

          const wrongItem = {
            questionNumber: qNum,
            questionType: qType,
            prompt: q.prompt || '',
            correctAnswer: correctAnsStr,
            givenAnswer: givenStr,
            isUnanswered,
            scoreEarned: sa.score_earned || 0,
          }

          if (!wrongAnswersMap.has(sa.submission_id)) {
            wrongAnswersMap.set(sa.submission_id, [])
          }
          wrongAnswersMap.get(sa.submission_id)!.push(wrongItem)

          const studentInfo = studentProfileMap.get(sa.submission_id) || { id: '', name: 'Học sinh', phone: '' }
          if (!wrongQuestionsSummaryMap.has(qNum)) {
            wrongQuestionsSummaryMap.set(qNum, {
              questionNumber: qNum,
              questionType: qType,
              prompt: q.prompt || '',
              correctAnswer: correctAnsStr,
              totalFailed: 0,
              wrongCount: 0,
              unansweredCount: 0,
              students: []
            })
          }

          const summaryObj = wrongQuestionsSummaryMap.get(qNum)
          summaryObj.totalFailed += 1
          if (isUnanswered) {
            summaryObj.unansweredCount += 1
          } else {
            summaryObj.wrongCount += 1
          }
          summaryObj.students.push({
            studentId: studentInfo.id,
            studentName: studentInfo.name,
            phone: studentInfo.phone,
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

      const studentName = sub.guest_name || profile.full_name || (sub.is_trial ? 'Học sinh trải nghiệm' : 'Học sinh')
      const username = profile.username || (sub.guest_phone ? sub.guest_phone : '')

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
        isTrial: sub.is_trial || false,
        guestName: sub.guest_name || null,
        guestPhone: sub.guest_phone || null,
        submittedAt: sub.submitted_at,
        lessonId: lesson.id,
        lessonTitle: lesson.title || '',
        chapterId: chapter.id,
        chapterTitle: chapter.title || '',
        classId: cls.id || (isTrialQuery ? 'TRIAL' : ''),
        className: cls.name || (isTrialQuery ? 'Học thử' : 'Lớp học'),
        studentId: sub.student_id,
        studentName,
        username,
        wrongAnswers: (user?.role === 'ADMIN' || isTrialQuery) ? wrongAnswers : undefined,
      }
    })

    const wrongQuestionsSummary = Array.from(wrongQuestionsSummaryMap.values())
      .sort((a: any, b: any) => a.questionNumber - b.questionNumber)

    // Build Stats & Unsubmitted list
    let submissionStats: any = null
    let unsubmittedStudents: any[] = []

    if (isTrialQuery) {
      const totalSubmissions = history.length
      const totalScores = history.reduce((acc: number, s: any) => acc + (s.score || 0), 0)
      const avgScore = totalSubmissions > 0 ? Math.round((totalScores / totalSubmissions) * 10) / 10 : 0
      const passCount = history.filter((s: any) => s.isPassed).length
      const uniquePhones = new Set(history.map((s: any) => s.guestPhone).filter(Boolean))

      const targetHw = homeworkId ? classHomeworks.find(h => h.id === homeworkId) : null

      submissionStats = {
        totalStudents: uniquePhones.size || totalSubmissions,
        submittedCount: totalSubmissions,
        unsubmittedCount: 0,
        inProgressCount: 0,
        submissionRate: 100,
        averageScore: avgScore,
        passCount,
        passRate: totalSubmissions > 0 ? Math.round((passCount / totalSubmissions) * 100) : 0,
        leadsCount: uniquePhones.size,
        homeworkTitle: targetHw ? targetHw.title : (homeworkId ? (history[0]?.homeworkTitle || 'Bài tập học thử') : 'Tất cả bài tập học thử'),
        homeworkType: targetHw?.type || 'PRACTICE',
        durationMinutes: targetHw?.durationMinutes || 45,
        deadline: targetHw?.deadline || null,
        isOverdue: false
      }
    } else if (classId && classId !== 'TRIAL') {
      const targetHw = homeworkId ? classHomeworks.find((h: any) => h.id === homeworkId) : null

      if (homeworkId && targetHw) {
        // Fetch all enrolled students in this class
        const { data: enrolledStudents } = await serviceRoleClient
          .from('student_classes')
          .select(`
            student_id,
            profiles (id, username, full_name)
          `)
          .eq('class_id', classId)

        const submittedStudentIds = new Set(history.map((s: any) => s.studentId).filter(Boolean))
        const isHwOverdue = targetHw.deadline ? new Date() > new Date(targetHw.deadline) : false

        unsubmittedStudents = (enrolledStudents || [])
          .filter((es: any) => !submittedStudentIds.has(es.student_id))
          .map((es: any) => ({
            id: es.student_id,
            studentId: es.student_id,
            fullName: es.profiles?.full_name || 'Học sinh',
            studentName: es.profiles?.full_name || 'Học sinh',
            username: es.profiles?.username || '',
            status: 'NOT_STARTED',
            isOverdue: isHwOverdue,
            deadline: targetHw.deadline || null
          }))

        const totalClassStudents = (enrolledStudents || []).length
        const submittedCount = history.length
        const avgScore = submittedCount > 0 ? Math.round((history.reduce((a: number, s: any) => a + (s.score || 0), 0) / submittedCount) * 10) / 10 : 0
        const passCount = history.filter((s: any) => s.isPassed).length

        submissionStats = {
          totalStudents: totalClassStudents,
          submittedCount,
          unsubmittedCount: unsubmittedStudents.length,
          inProgressCount: 0,
          submissionRate: totalClassStudents > 0 ? Math.round((submittedCount / totalClassStudents) * 100) : 0,
          averageScore: avgScore,
          passCount,
          passRate: submittedCount > 0 ? Math.round((passCount / submittedCount) * 100) : 0,
          isOverdue: isHwOverdue,
          deadline: targetHw.deadline || null,
          homeworkTitle: targetHw.title || history[0]?.homeworkTitle || 'Bài tập',
          homeworkType: targetHw.type || 'PRACTICE',
          durationMinutes: targetHw.durationMinutes || 45
        }
      }
    }

    return jsonResponse({
      studentId: studentId || (user?.role === 'STUDENT' ? user.id : undefined),
      classId: classId || (isTrialQuery ? 'TRIAL' : undefined),
      homeworkId: homeworkId || undefined,
      totalSubmissions: history.length,
      history,
      wrongQuestionsSummary: (user?.role === 'ADMIN' || isTrialQuery) ? wrongQuestionsSummary : undefined,
      classHomeworks,
      submissionStats,
      unsubmittedStudents,
    })
  } catch (err: unknown) {
    const error = err as Error
    return errorResponse(error.message || 'Unauthorized / Error', 401)
  }
})
