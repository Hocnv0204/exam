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
            show_solutions,
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

      // Fetch submission answers with questions and generate signed PDF URL in parallel
      const hwObj = sub.homeworks
      const [answersRes, signedUrlRes] = await Promise.all([
        serviceRoleClient
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
              points,
              content,
              options,
              statements,
              part_title,
              question_answers (
                mc_answer,
                tf_answers,
                sa_answer,
                sa_tolerance,
                explanation
              )
            )
          `)
          .eq('submission_id', submissionId),
        (hwObj?.pdf_path && !hwObj.pdf_path.startsWith('http'))
          ? serviceRoleClient.storage.from('pdf-files').createSignedUrl(hwObj.pdf_path, 3600)
          : Promise.resolve({ data: null, error: null })
      ])

      if (answersRes.error) {
        return errorResponse(answersRes.error.message, 500)
      }

      const answers = answersRes.data || []
      let pdfUrl = hwObj?.pdf_path
      if (signedUrlRes.data?.signedUrl) {
        pdfUrl = signedUrlRes.data.signedUrl
      }

      // Determine active grading structure
      const totalQuestions = answers.length
      const mcCount = (answers || []).filter((a: any) => {
        const q = Array.isArray(a.questions) ? a.questions[0] : (a.questions || {})
        return (q.question_type || a.question_type) === 'MULTIPLE_CHOICE'
      }).length
      const tfCount = (answers || []).filter((a: any) => {
        const q = Array.isArray(a.questions) ? a.questions[0] : (a.questions || {})
        return (q.question_type || a.question_type) === 'TRUE_FALSE'
      }).length
      const saCount = (answers || []).filter((a: any) => {
        const q = Array.isArray(a.questions) ? a.questions[0] : (a.questions || {})
        return (q.question_type || a.question_type) === 'SHORT_ANSWER'
      }).length

      const score = Number(sub.total_score ?? 0)
      const passScore = Number(hwObj?.pass_score ?? 5)
      const isPassed = score >= passScore
      const shouldShowSolutions = hwObj?.show_solutions !== false || (user && user.role === 'ADMIN')

      const formattedAnswers = (answers || []).map((ans: any) => {
        const qObj = Array.isArray(ans.questions) ? ans.questions[0] : (ans.questions || {})
        const qType = qObj.question_type || ans.question_type
        const qNum = qObj.question_number !== undefined ? qObj.question_number : ans.question_number
        const qAnswers = Array.isArray(qObj.question_answers) ? qObj.question_answers[0] : (qObj.question_answers || {})
        const key = qAnswers

        const points = qObj.points !== undefined && qObj.points !== null
          ? Number(qObj.points)
          : (ans.points !== undefined && ans.points !== null ? Number(ans.points) : (qType === 'TRUE_FALSE' ? 1.0 : (qType === 'SHORT_ANSWER' ? 0.5 : 0.25)))

        const scoreEarned = ans.score_earned !== undefined && ans.score_earned !== null
          ? Number(ans.score_earned)
          : (ans.is_correct ? points : 0)

        let correctAnswerSummary: any = null
        let statementGrades: any = undefined

        if (qType === 'MULTIPLE_CHOICE') {
          if (shouldShowSolutions) correctAnswerSummary = key?.mc_answer || null
        } else if (qType === 'TRUE_FALSE') {
          if (shouldShowSolutions) correctAnswerSummary = key?.tf_answers || null

          // 1. Check if statementGrades was pre-calculated and stored in given_answer
          let stGrades = ans.given_answer?.statementGrades
          if (typeof stGrades === 'string') {
            try { stGrades = JSON.parse(stGrades) } catch {}
          }

          // 2. If not stored, compute dynamically from answer keys and student given answer
          if (!stGrades || (!stGrades.a && !stGrades.b && !stGrades.c && !stGrades.d && scoreEarned > 0)) {
            let correctVal = key?.tf_answers
            if (typeof correctVal === 'string') {
              try { correctVal = JSON.parse(correctVal) } catch {}
            }
            correctVal = (correctVal as any) || {}

            let studentVal = ans.given_answer?.value !== undefined ? ans.given_answer.value : ans.given_answer
            if (typeof studentVal === 'string') {
              try { studentVal = JSON.parse(studentVal) } catch {}
            }
            studentVal = (studentVal as any) || {}

            const getBool = (v: any) => {
              if (v === true || v === 'true' || v === 1 || v === '1') return true
              if (v === false || v === 'false' || v === 0 || v === '0') return false
              return undefined
            }

            const cA = getBool(correctVal.a !== undefined ? correctVal.a : correctVal.s1)
            const cB = getBool(correctVal.b !== undefined ? correctVal.b : correctVal.s2)
            const cC = getBool(correctVal.c !== undefined ? correctVal.c : correctVal.s3)
            const cD = getBool(correctVal.d !== undefined ? correctVal.d : correctVal.s4)

            const sA = getBool(studentVal.a !== undefined ? studentVal.a : studentVal.s1)
            const sB = getBool(studentVal.b !== undefined ? studentVal.b : studentVal.s2)
            const sC = getBool(studentVal.c !== undefined ? studentVal.c : studentVal.s3)
            const sD = getBool(studentVal.d !== undefined ? studentVal.d : studentVal.s4)

            if (cA !== undefined || cB !== undefined || cC !== undefined || cD !== undefined) {
              stGrades = {
                a: sA !== undefined && cA !== undefined ? sA === cA : false,
                b: sB !== undefined && cB !== undefined ? sB === cB : false,
                c: sC !== undefined && cC !== undefined ? sC === cC : false,
                d: sD !== undefined && cD !== undefined ? sD === cD : false,
              }
            }
          }

          if (stGrades) {
            statementGrades = stGrades
          } else if (ans.is_correct || scoreEarned >= points) {
            statementGrades = { a: true, b: true, c: true, d: true }
          }
        } else if (qType === 'SHORT_ANSWER') {
          if (shouldShowSolutions) {
            correctAnswerSummary = {
              answer: key?.sa_answer,
              tolerance: key?.sa_tolerance || 0,
            }
          }
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

        let prompt = qObj.prompt || ans.prompt
        const feedback = ans.is_correct ? 'Đúng' : 'Sai'

        if (!shouldShowSolutions) {
          if (typeof prompt === 'string' && prompt.startsWith('{')) {
            try {
              const pObj = JSON.parse(prompt)
              if (pObj.explanation) {
                pObj.explanation = ''
                prompt = JSON.stringify(pObj)
              }
            } catch {
              // keep as-is
            }
          }
        }

        return {
          id: ans.id,
          questionId: ans.question_id,
          questionNumber: qNum,
          questionType: qType,
          content: qObj.content || ans.content,
          options: qObj.options || ans.options,
          statements: qObj.statements || ans.statements,
          partTitle: qObj.part_title || ans.part_title,
          prompt,
          explanation: shouldShowSolutions ? (key?.explanation || null) : null,
          is_correct: ans.is_correct,
          isCorrect: ans.is_correct,
          score_earned: scoreEarned,
          scoreEarned: scoreEarned,
          pointsPossible: points,
          points,
          given_answer: parsedGiven,
          givenAnswer: parsedGiven,
          correct_answer: shouldShowSolutions ? correctAnswerSummary : null,
          correctAnswer: shouldShowSolutions ? correctAnswerSummary : null,
          correctAnswerSummary: shouldShowSolutions ? correctAnswerSummary : null,
          statementGrades,
          feedback,
          questions: {
            id: ans.question_id,
            question_number: qNum,
            question_type: qType,
            prompt,
            content: qObj.content || ans.content,
            options: qObj.options || ans.options,
            statements: qObj.statements || ans.statements,
            part_title: qObj.part_title || ans.part_title,
            explanation: shouldShowSolutions ? (key?.explanation || null) : null,
            points,
          },
          question: {
            id: ans.question_id,
            questionNumber: qNum,
            questionType: qType,
            prompt,
            points,
          },
        }
      })

      // Ensure answers are strictly sorted by questionNumber ascending
      formattedAnswers.sort((a: any, b: any) => (Number(a.questionNumber) || 0) - (Number(b.questionNumber) || 0))

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
        showSolutions: hwObj?.show_solutions !== false,
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
          showSolutions: hwObj?.show_solutions !== false,
        },
      })
    }

    // 2. Query Submissions List
    let classHomeworks: any[] = []
    let classHwIds: string[] = []
    let prefetchedEnrolledStudents: any[] | null = null

    // Prepare Homeworks Query Promise
    const homeworksPromise = (async () => {
      if (isTrialQuery) {
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

        return (trialHws || [])
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
          return hws.map((h: any) => ({
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
        }
      }
      return []
    })()

    // If homeworkId is provided, we can immediately start the submissions query in parallel!
    let rawSubmissions: any[] = []
    let fetchErr: any = null

    if (homeworkId || studentId || isTrialQuery) {
      const buildSubmissionsQuery = () => {
        let q = serviceRoleClient
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
          q = q.or('student_id.is.null,guest_phone.not.is.null')
          if (guestPhone) {
            const p = guestPhone.trim()
            q = q.or(`guest_phone.ilike.%${p}%,guest_phone.eq.${p}`)
          }
          if (homeworkId) {
            q = q.eq('homework_id', homeworkId)
          }
        } else {
          q = q.not('student_id', 'is', null)
          if (studentId) {
            if (user?.role === 'STUDENT' && studentId !== user.id) {
              throw new Error('Forbidden: You can only view your own history')
            }
            q = q.eq('student_id', studentId)
          } else if (user?.role === 'STUDENT') {
            q = q.eq('student_id', user.id)
          }
          if (homeworkId) {
            q = q.eq('homework_id', homeworkId)
          }
        }
        return q
      }

      const enrolledPromise = (homeworkId && classId && classId !== 'TRIAL')
        ? serviceRoleClient
            .from('student_classes')
            .select(`
              student_id,
              profiles (id, username, full_name)
            `)
            .eq('class_id', classId)
        : Promise.resolve({ data: null, error: null })

      const [hwsResult, subResult, enrolledResult] = await Promise.all([
        homeworksPromise,
        buildSubmissionsQuery(),
        enrolledPromise
      ])

      classHomeworks = hwsResult
      classHwIds = classHomeworks.map((h: any) => h.id)
      rawSubmissions = subResult.data || []
      fetchErr = subResult.error
      prefetchedEnrolledStudents = enrolledResult.data || null
    } else {
      // Must wait for class homeworks to get classHwIds
      classHomeworks = await homeworksPromise
      classHwIds = classHomeworks.map((h: any) => h.id)

      if (classId && classId !== 'TRIAL' && classHwIds.length === 0) {
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

      let q = serviceRoleClient
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
        .not('student_id', 'is', null)

      if (user?.role === 'STUDENT') {
        q = q.eq('student_id', user.id)
      }
      if (classHwIds.length > 0) {
        q = q.in('homework_id', classHwIds)
      }

      const subResult = await q
      rawSubmissions = subResult.data || []
      fetchErr = subResult.error
    }

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
            let tfVal = qAns.tf_answers
            if (typeof tfVal === 'string' && tfVal.startsWith('{')) {
              try { tfVal = JSON.parse(tfVal) } catch {}
            }
            if (typeof tfVal === 'object' && tfVal !== null) {
              const getL = (v: any) => (v === true || v === 'true' || v === 1 || v === '1') ? 'Đ' : ((v === false || v === 'false' || v === 0 || v === '0') ? 'S' : '-')
              const a = getL(tfVal.a !== undefined ? tfVal.a : tfVal.s1)
              const b = getL(tfVal.b !== undefined ? tfVal.b : tfVal.s2)
              const c = getL(tfVal.c !== undefined ? tfVal.c : tfVal.s3)
              const d = getL(tfVal.d !== undefined ? tfVal.d : tfVal.s4)
              correctAnsStr = `a: ${a}, b: ${b}, c: ${c}, d: ${d}`
            } else {
              correctAnsStr = String(tfVal || 'N/A')
            }
          } else if (qType === 'SHORT_ANSWER') {
            correctAnsStr = String(qAns.sa_answer ?? 'N/A')
          }

          let givenStr = 'Bỏ trống (Chưa làm)'
          let isUnanswered = false
          if (sa.given_answer !== null && sa.given_answer !== undefined) {
            let val = sa.given_answer
            if (typeof val === 'string' && (val.startsWith('{') || val.startsWith('['))) {
              try { val = JSON.parse(val) } catch {}
            }
            if (typeof val === 'object' && val !== null) {
              if (val.value !== undefined) {
                val = val.value
              }
            }
            if (val === null || val === undefined || val === '' || val === 'null' || val === '{}') {
              givenStr = 'Bỏ trống (Chưa làm)'
              isUnanswered = true
            } else if (typeof val === 'object' && val !== null) {
              if (qType === 'TRUE_FALSE') {
                const getL = (v: any) => (v === true || v === 'true' || v === 1 || v === '1') ? 'Đ' : ((v === false || v === 'false' || v === 0 || v === '0') ? 'S' : '-')
                const a = getL(val.a !== undefined ? val.a : val.s1)
                const b = getL(val.b !== undefined ? val.b : val.s2)
                const c = getL(val.c !== undefined ? val.c : val.s3)
                const d = getL(val.d !== undefined ? val.d : val.s4)
                givenStr = `a: ${a}, b: ${b}, c: ${c}, d: ${d}`
              } else {
                givenStr = JSON.stringify(val)
              }
            } else {
              givenStr = String(val).trim()
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
        // Use prefetched enrolled students if available, otherwise fetch
        let enrolledStudents = prefetchedEnrolledStudents
        if (!enrolledStudents) {
          const { data: esData } = await serviceRoleClient
            .from('student_classes')
            .select(`
              student_id,
              profiles (id, username, full_name)
            `)
            .eq('class_id', classId)
          enrolledStudents = esData || []
        }

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
