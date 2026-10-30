import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { requireStudent } from '../../shared/auth-middleware.ts'
import { createServiceRoleClient } from '../../shared/supabase-client.ts'
import { handleCors, jsonResponse, errorResponse } from '../../shared/response-helper.ts'
import { submitHomeworkSchema } from '../../shared/validators.ts'
import { gradeQuestion, gradeExam, type QuestionGradeResult, type QuestionGradeInput } from '../../shared/grading-service.ts'
import type { TrueFalseStatementAnswer } from '../../types/database.types.ts'

serve(async (req: Request) => {
  const corsRes = handleCors(req)
  if (corsRes) return corsRes

  try {
    if (req.method !== 'POST') {
      return errorResponse('Method not allowed', 405)
    }

    const body = await req.json()
    const validation = submitHomeworkSchema.safeParse(body)
    if (!validation.success) {
      return errorResponse('Validation error', 400, validation.error.format())
    }

    const { homeworkId, durationSecondsTaken, sessionToken, guestName, guestPhone, disqualified } = validation.data
    let answers = validation.data.answers
    const serviceRoleClient = createServiceRoleClient()

    const authHeader = req.headers.get('Authorization')
    const hwPromise = serviceRoleClient
      .from('homeworks')
      .select(`
        id,
        title,
        max_score,
        pass_score,
        is_published,
        lesson_id,
        deadline,
        max_attempts,
        max_violations,
        pdf_path,
        type,
        show_solutions,
        duration_minutes,
        lessons (
          id,
          title,
          is_trial,
          chapter_id,
          chapters (
            class_id
          )
        )
      `)
      .eq('id', homeworkId)
      .single()

    const authPromise = authHeader ? requireStudent(req).catch((e: any) => ({ error: e })) : Promise.resolve(null)

    const [{ data: homework, error: homeworkError }, studentAuthResult] = await Promise.all([hwPromise, authPromise])

    if (homeworkError || !homework || !homework.is_published) {
      return errorResponse('Homework not found or not published', 404)
    }

    const isTrialHomework = (homework.lessons as any)?.is_trial === true
    let user: any = null
    if (studentAuthResult) {
      if ('error' in studentAuthResult && studentAuthResult.error) {
        if (!isTrialHomework) throw studentAuthResult.error
      } else if ('user' in studentAuthResult) {
        user = studentAuthResult.user
      }
    } else if (!isTrialHomework) {
      return errorResponse('Unauthorized: Missing token', 401)
    }

    const classIdOfHomework = (homework.lessons as unknown as { chapters: { class_id: string } })?.chapters?.class_id

    // Bài giao riêng: chỉ học sinh trong danh sách mới được nộp
    if (user && !isTrialHomework) {
      const { data: targets } = await serviceRoleClient
        .from('homework_targets')
        .select('student_id')
        .eq('homework_id', homeworkId)
      const targetIds = (targets || []).map((t: { student_id: string }) => t.student_id)
      if (targetIds.length > 0 && !targetIds.includes(user.id)) {
        return errorResponse('Forbidden: This homework was assigned to other students', 403)
      }
    }

    // Check session for EXAM (if student)
    let examSessionId = null
    let examSessionAttemptNo = 1
    let serverViolationCount = 0
    if (homework.type === 'EXAM' && user) {
      if (!sessionToken) {
        return errorResponse('sessionToken is required for EXAM', 400)
      }

      const { data: session, error: sessionError } = await serviceRoleClient
        .from('exam_sessions')
        .select('id, session_token, created_at, status, attempt_no, draft_answers, submission_fingerprint')
        .eq('homework_id', homeworkId)
        .eq('student_id', user.id)
        .eq('session_token', sessionToken)
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle()

      if (sessionError) return errorResponse('Failed to verify exam session', 500)
      if (!session) {
        return errorResponse('No exam session found', 404)
      }

      if (session.session_token !== sessionToken) {
        return jsonResponse({
          error: 'INVALID_TOKEN',
          message: 'Phiên làm bài không hợp lệ hoặc đã bị ghi đè.'
        }, 403)
      }

      examSessionId = session.id
      examSessionAttemptNo = Number((session as any).attempt_no) || 1
      const { count: countedViolations, error: violationError } = await serviceRoleClient.from('exam_logs')
        .select('*', { count: 'exact', head: true }).eq('session_id', session.id).eq('counted', true)
      if (violationError) return errorResponse('Failed to verify exam violations', 500)
      serverViolationCount = countedViolations || 0
      if ((countedViolations || 0) >= Math.max(1, homework.max_violations ?? 3)) {
        // Once disqualified, grade only the frozen server draft, not caller answers.
        answers = Array.isArray(session.draft_answers) ? session.draft_answers : []
      }
      // The homework due date affects late grading, never this attempt's timer.
      // The RPC remains authoritative for expiry and idempotent replay.
      const cutoff = new Date(session.created_at).getTime() + Number(homework.duration_minutes) * 60000
      if (!Number.isFinite(cutoff)) return errorResponse('Invalid exam duration', 500)
      if (session.status === 'ACTIVE' && Date.now() >= cutoff) {
        // After the timer, grade only the saved server draft. RPC enforces the
        // 90-second bound, including a concurrent submission/replay race.
        answers = Array.isArray(session.draft_answers) ? session.draft_answers : []
      }
    }

    // Check deadline (mark as late if past deadline instead of blocking)
    let isLate = false
    if (homework.deadline) {
      const deadlineDate = new Date(homework.deadline)
      const now = new Date()
      if (now > deadlineDate) {
        isLate = true
      }
    }

    // EXAM attempt quotas are enforced while starting the session in the database.
    // Keep legacy PRACTICE/trial submission checks unchanged.
    if (user && homework.max_attempts && homework.max_attempts > 0 && !isTrialHomework &&
      !(homework.type === 'EXAM' && examSessionId)) {
      const { count, error: countError } = await serviceRoleClient
        .from('submissions')
        .select('*', { count: 'exact', head: true })
        .eq('homework_id', homeworkId)
        .eq('student_id', user.id)
        .eq('status', 'SUBMITTED')

      if (countError) {
        return errorResponse('Failed to verify submission attempts limit', 500)
      }

      const allowance = homework.type === 'EXAM' && examSessionId
        ? homework.max_attempts + (examSessionAttemptNo - 1)
        : homework.max_attempts
      if (count !== null && count >= allowance) {
        return errorResponse('Bạn đã đạt giới hạn tối đa số lần làm bài tập này', 400)
      }
    }

    // Verify student is enrolled in class (unless trial homework)
    if (user && !isTrialHomework) {
      if (!user.classIds || user.classIds.length === 0) {
        return errorResponse('Student is not assigned to any class', 403)
      }
      if (classIdOfHomework && !user.classIds.includes(classIdOfHomework)) {
        return errorResponse('Forbidden: You are not enrolled in the class for this homework', 403)
      }
    }

    // 2. Fetch all questions for homework
    const { data: questions, error: qError } = await serviceRoleClient
      .from('questions')
      .select('id, question_number, question_type, prompt, points, content, options, statements, part_title')
      .eq('homework_id', homeworkId)
      .order('question_number', { ascending: true })

    if (qError || !questions || questions.length === 0) {
      return errorResponse('Homework contains no questions', 400)
    }

    // 3. Fetch Answer Keys using Service Role Client (Students cannot select question_answers via RLS!)
    const questionIds = questions.map((q) => q.id)
    const { data: answerKeys, error: keyError } = await serviceRoleClient
      .from('question_answers')
      .select('question_id, mc_answer, tf_answers, sa_answer, sa_tolerance, explanation')
      .in('question_id', questionIds)

    if (keyError || !answerKeys) {
      return errorResponse('Failed to load homework answer key', 500)
    }

    // Index answer keys by question_id
    const keyMap = new Map(answerKeys.map((k) => [k.question_id, k]))
    const answerMap = new Map(answers.map((a) => [a.questionId, a.givenAnswer]))

    // 4. Grade each question using the Universal Scoring Engine
    const gradeInputs: QuestionGradeInput[] = questions.map((q) => {
      const key = keyMap.get(q.id)
      const given = answerMap.get(q.id) || { type: q.question_type, value: null }
        const points = q.points !== undefined && q.points !== null && !isNaN(Number(q.points))
        ? Number(q.points)
        : (q.question_type === 'TRUE_FALSE' ? 1.0 : (q.question_type === 'SHORT_ANSWER' ? 0.5 : 0.25))

      return {
        questionId: q.id,
        questionType: q.question_type,
        points,
        mcAnswer: key?.mc_answer || null,
        tfAnswers: (key?.tf_answers as unknown as TrueFalseStatementAnswer) || null,
        saAnswer: key?.sa_answer !== null && key?.sa_answer !== undefined ? key.sa_answer : null,
        saTolerance: key?.sa_tolerance !== null && key?.sa_tolerance !== undefined ? Number(key.sa_tolerance) : 0,
        // @ts-ignore dynamic type check in gradeQuestion
        givenAnswer: given,
      }
    })

    const targetScale = homework.max_score || 10.0
    const examGrading = gradeExam(gradeInputs, { targetScale, roundingStep: 0.01 })
    const finalScore = examGrading.totalScore
    const correctCount = examGrading.correctCount
    const wrongCount = examGrading.wrongCount

    const questionReviews = []
    const submissionAnswersToInsert = []

    for (let i = 0; i < questions.length; i++) {
      const q = questions[i]
      const key = keyMap.get(q.id)
      const gradeResult = examGrading.questionResults[i]
      const given = answerMap.get(q.id) || { type: q.question_type, value: null }

      const shouldShowSolutions = homework.show_solutions !== false || (user && user.role === 'ADMIN')
      let reviewPrompt = q.prompt
      let reviewCorrectAnswerSummary = gradeResult.correctAnswerSummary
      let reviewFeedback = gradeResult.feedback

      if (!shouldShowSolutions) {
        reviewCorrectAnswerSummary = null
        if (typeof reviewPrompt === 'string' && reviewPrompt.startsWith('{')) {
          try {
            const pObj = JSON.parse(reviewPrompt)
            if (pObj.explanation) {
              pObj.explanation = ''
              reviewPrompt = JSON.stringify(pObj)
            }
          } catch {
            // keep as-is
          }
        }
        if (reviewFeedback && reviewFeedback.includes('Correct:')) {
          reviewFeedback = gradeResult.isCorrect ? 'Đúng' : 'Sai'
        }
      }

      const givenAnswerWithMeta = {
        ...given,
        statementGrades: gradeResult.statementGrades || null,
      }

      questionReviews.push({
        questionNumber: q.question_number,
        prompt: reviewPrompt,
        content: q.content,
        options: q.options,
        statements: q.statements,
        partTitle: q.part_title,
        explanation: shouldShowSolutions ? (key?.explanation || null) : null,
        questionType: q.question_type,
        givenAnswer: givenAnswerWithMeta,
        statementGrades: gradeResult.statementGrades || null,
        ...gradeResult,
        correctAnswerSummary: reviewCorrectAnswerSummary,
        feedback: reviewFeedback,
      })

      submissionAnswersToInsert.push({
        question_id: q.id,
        given_answer: givenAnswerWithMeta,
        is_correct: gradeResult.isCorrect,
         score_earned: gradeResult.scoreEarned,
         grading_status: q.question_type === 'ESSAY' ? 'PENDING' : 'AUTO_GRADED',
         teacher_feedback: null,
       })
    }

    // 5. Save Submission record
    // Only unauthenticated users or explicit guests without a user account are trial submissions
    const isTrialSubmission = !user
    const saveGuestName = isTrialSubmission ? (guestName || 'Học sinh trải nghiệm') : null
    const saveGuestPhone = isTrialSubmission ? (guestPhone || null) : null

    const atomic = !!examSessionId
    const atomicResult = atomic ? await serviceRoleClient.rpc('commit_exam_submission', {
      p_homework_id: homeworkId, p_student_id: user.id, p_token: sessionToken,
      p_answers: answers, p_rows: submissionAnswersToInsert,
      p_total: finalScore, p_correct: correctCount, p_wrong: wrongCount,
      p_duration: durationSecondsTaken || 0, p_disqualified: disqualified === true
    }) : null
    if (atomicResult?.error) {
      const msg = atomicResult.error.message || ''
      if (/EXAM_EXPIRED|SUBMISSION_CONFLICT|INVALID_SESSION|INVALID_ANSWERS|INVALID_DISQUALIFICATION|FORBIDDEN/.test(msg))
        return errorResponse(msg, /FORBIDDEN|INVALID_SESSION/.test(msg) ? 403 : 409)
      return errorResponse('Failed to record exam submission', 500)
    }
    const { data: submission, error: subError } = atomic
      ? { data: atomicResult?.data, error: null }
      : await serviceRoleClient
      .from('submissions')
      .insert({
        homework_id: homeworkId,
        student_id: user ? user.id : null,
        total_score: finalScore,
        max_score: homework.max_score,
        correct_count: correctCount,
        wrong_count: wrongCount,
        duration_seconds_taken: durationSecondsTaken || 0,
        is_late: isLate,
        is_trial: isTrialSubmission,
        guest_name: saveGuestName,
        guest_phone: saveGuestPhone,
        status: 'SUBMITTED',
        attempt_no: examSessionId ? examSessionAttemptNo : 1
      })
      .select('id, submitted_at')
      .single()

    if (subError || !submission) {
      return errorResponse(`Failed to record submission: ${subError?.message}`, 500)
    }
    if (atomic) isLate = submission.is_late === true
    const wasDisqualified = atomic ? submission.disqualified === true : disqualified === true

    // 6. Save Submission Answers
    const answersWithSubId = submissionAnswersToInsert.map((item) => ({
      submission_id: submission.id,
      ...item,
    }))

    const { error: subAnsError } = atomic ? { error: null } : await serviceRoleClient
      .from('submission_answers')
      .insert(answersWithSubId)

    if (subAnsError) {
      return errorResponse(`Failed to record submission answers: ${subAnsError.message}`, 500)
    }
    if (atomic && submission.already_submitted) {
      return jsonResponse({ submissionId: submission.id, alreadySubmitted: true,
        score: submission.total_score, message: 'Bài thi đã được ghi nhận nộp thành công.' })
    }

    // Generate Signed URL for PDF storage file
    let pdfUrl = homework.pdf_path
    if (pdfUrl && !pdfUrl.startsWith('http')) {
      const { data: signedUrlData, error: storageErr } = await serviceRoleClient.storage
        .from('pdf-files')
        .createSignedUrl(homework.pdf_path, 3600)
      if (!storageErr && signedUrlData) {
        pdfUrl = signedUrlData.signedUrl
      }
    }

    // 7. Send Telegram notification
    const sendNotification = async () => {
      try {
        // Only the persisted homework class may receive this submission (including trial).
        const classIdsToSearch: string[] = []
        if (classIdOfHomework) {
          classIdsToSearch.push(classIdOfHomework)
        } else if (homework.lesson_id) {
          const { data: lessonData, error: lessonError } = await serviceRoleClient
            .from('lessons')
            .select('chapter_id, chapters(class_id)')
            .eq('id', homework.lesson_id)
            .maybeSingle()
          if (lessonError) {
            console.warn('[submit-homework] Telegram notification: class_lookup_error')
            return
          }
          const resolvedCid = (lessonData?.chapters as any)?.class_id
          if (resolvedCid) classIdsToSearch.push(resolvedCid)
        }

        if (classIdsToSearch.length === 0) {
          console.warn('[submit-homework] Telegram notification: class_unresolved')
          return
        }

        // 2. Fetch all enabled telegram configs for these classes
        const { data: tgConfigs, error: configError } = await serviceRoleClient
          .from('telegram_configs')
          .select('class_id, chat_id, chat_title, is_enabled')
          .in('class_id', classIdsToSearch)
          .eq('is_enabled', true)

        if (configError) {
          console.warn('[submit-homework] Telegram notification: config_query_error')
          return
        }
        if (!tgConfigs || tgConfigs.length === 0) {
          console.warn('[submit-homework] Telegram notification: config_missing')
          return
        }

        // Deduplicate target chat IDs
        const targetChatIds = [...new Set(tgConfigs.map(c => c.chat_id).filter(Boolean))]
        if (targetChatIds.length === 0) {
          console.warn('[submit-homework] Telegram notification: config_missing_chat')
          return
        }

        // 3. Resolve student name and class name
        const effectiveClassId = classIdOfHomework || classIdsToSearch[0]
        const [studentProfileRes, classDataRes] = await Promise.all([
          user
            ? serviceRoleClient
                .from('profiles')
                .select('full_name')
                .eq('id', user.id)
                .maybeSingle()
            : Promise.resolve({ data: null, error: null }),
          effectiveClassId
            ? serviceRoleClient
                .from('classes')
                .select('name')
                .eq('id', effectiveClassId)
                .maybeSingle()
            : Promise.resolve({ data: null, error: null })
        ])

        let studentDisplayName = 'Học sinh'
        if (user) {
          studentDisplayName = studentProfileRes.data?.full_name || user.fullName || user.username || 'Học sinh'
        } else {
          studentDisplayName = guestName ? `${guestName} (Học thử)` : 'Học sinh trải nghiệm (Học thử)'
        }

        const className = classDataRes.data?.name || 'N/A'
        const submissionTime = new Date(submission.submitted_at).toLocaleString('vi-VN', {
          timeZone: 'Asia/Ho_Chi_Minh',
          day: '2-digit',
          month: '2-digit',
          year: 'numeric',
          hour: '2-digit',
          minute: '2-digit',
        })

        const isPassed = finalScore >= homework.pass_score
        const statusText = isPassed ? 'Đạt' : 'Không đạt'
        const correctAnswers = questionReviews.filter((q) => q.isCorrect).length
        const wrongAnswers = questionReviews.length - correctAnswers

        const durSecs = durationSecondsTaken || 0
        const durationFormatted = durSecs > 0 ? `${Math.floor(durSecs / 60)} phút ${durSecs % 60} giây` : 'Không xác định'

        const safeStudent = escapeHtmlForTelegram(studentDisplayName)
        const safeClass = escapeHtmlForTelegram(className)
        const safeTitle = escapeHtmlForTelegram(homework.title)
        const safePhone = escapeHtmlForTelegram(guestPhone || 'Chưa cung cấp')

        let message = ''
        if (isTrialSubmission) {
          message = `🌟 <b>THÔNG BÁO HỌC THỬ (TIỀM NĂNG)</b>\n` +
            `🎓 <b>Học sinh:</b> ${safeStudent}\n` +
            `📞 <b>SĐT:</b> ${safePhone}\n` +
            `🏫 <b>Lớp / Khóa:</b> ${safeClass}\n` +
            `📝 <b>Bài tập:</b> ${safeTitle}\n` +
            `⏱ <b>Thời gian nộp:</b> ${submissionTime}\n` +
            `📊 <b>Điểm số:</b> ${finalScore}/${homework.max_score} (${statusText})\n` +
            `✅ <b>Đúng/Sai:</b> ${correctAnswers}/${wrongAnswers}\n` +
            `⏳ <b>Thời gian làm bài:</b> ${durationFormatted}`
        } else if (wasDisqualified) {
          const maxV = homework.max_violations || 3
          const vioCount = atomic ? serverViolationCount : (validation.data.violationCount || maxV)
          message = `🚨 <b>THÔNG BÁO ĐÌNH CHỈ THI (VI PHẠM QUY CHẾ)</b>\n` +
            `🎓 <b>Học sinh:</b> ${safeStudent}\n` +
            `🏫 <b>Lớp:</b> ${safeClass}\n` +
            `📝 <b>Bài thi:</b> ${safeTitle}\n` +
            `⚠️ <b>Lý do:</b> Vi phạm quy chế thi (${vioCount}/${maxV} lần) - Hệ thống tự động thu bài\n` +
            `⏱ <b>Thời gian thu bài:</b> ${submissionTime}\n` +
            `📊 <b>Điểm số:</b> ${finalScore}/${homework.max_score} (${statusText})\n` +
            `✅ <b>Đúng/Sai:</b> ${correctAnswers}/${wrongAnswers}\n` +
            `⏳ <b>Thời gian làm bài:</b> ${durationFormatted}`
        } else if (homework.type === 'EXAM') {
          const lateLine = isLate ? `\n⚠️ <b>Trạng thái:</b> Nộp muộn` : ''
          message = `📑 <b>THÔNG BÁO NỘP BÀI THI CHÍNH THỨC</b>\n` +
            `🎓 <b>Học sinh:</b> ${safeStudent}\n` +
            `🏫 <b>Lớp:</b> ${safeClass}\n` +
            `📝 <b>Bài thi:</b> ${safeTitle}\n` +
            `⏱ <b>Thời gian nộp:</b> ${submissionTime}\n` +
            `📊 <b>Điểm số:</b> ${finalScore}/${homework.max_score} (${statusText})\n` +
            `✅ <b>Đúng/Sai:</b> ${correctAnswers}/${wrongAnswers}\n` +
            `⏳ <b>Thời gian làm bài:</b> ${durationFormatted}${lateLine}`
        } else {
          const lateLine = isLate ? `\n⚠️ <b>Trạng thái:</b> Nộp muộn` : ''
          message = `📣 <b>THÔNG BÁO NỘP BÀI TẬP</b>\n` +
            `🎓 <b>Học sinh:</b> ${safeStudent}\n` +
            `🏫 <b>Lớp:</b> ${safeClass}\n` +
            `📝 <b>Bài tập:</b> ${safeTitle}\n` +
            `⏱ <b>Thời gian nộp:</b> ${submissionTime}\n` +
            `📊 <b>Điểm số:</b> ${finalScore}/${homework.max_score} (${statusText})\n` +
            `✅ <b>Đúng/Sai:</b> ${correctAnswers}/${wrongAnswers}\n` +
            `⏳ <b>Thời gian làm bài:</b> ${durationFormatted}${lateLine}`
        }

        const results = await Promise.allSettled(targetChatIds.map((chatId) => sendTelegramNotification(chatId, message)))
        for (const result of results) {
          if (result.status === 'rejected') console.warn('[submit-homework] Telegram notification: send_network_error')
        }
      } catch {
        console.warn('[submit-homework] Telegram notification: unexpected_error')
      }
    }

    // Send notification in background without blocking response
    // @ts-ignore EdgeRuntime is available in Supabase Edge Functions
    try {
      if (typeof EdgeRuntime !== 'undefined' && typeof EdgeRuntime.waitUntil === 'function') {
        EdgeRuntime.waitUntil(sendNotification())
      } else {
        void sendNotification()
      }
    } catch {
      // Never turn an accepted submission into a retryable error due to notification scheduling.
      console.warn('[submit-homework] Telegram notification: scheduling_error')
    }

    // Ghi log thời gian làm bài (chạy nền, bỏ qua khách vãng lai không có user id)
    if (user?.id) {
      const submitLogTask = serviceRoleClient
        .from('user_activity_logs')
        .insert({
          user_id: user.id,
          action: 'HOMEWORK_SUBMIT',
          metadata: { homeworkId, homeworkTitle: homework.title },
          duration_seconds: Math.max(0, Math.floor(durationSecondsTaken || 0)),
        })
        .then(({ error }: { error: unknown }) => {
          if (error) console.warn('[submit-homework] activity log failed:', (error as Error)?.message)
        })
      // @ts-ignore EdgeRuntime is available in Supabase Edge Functions
      if (typeof EdgeRuntime !== 'undefined' && typeof EdgeRuntime.waitUntil === 'function') {
        EdgeRuntime.waitUntil(submitLogTask)
      } else {
        submitLogTask.catch(() => {})
      }
    }

    // 8. Return complete submission result
    // Xóa nháp server của bài này (đã nộp xong, chạy nền)
    if (user?.id) {
      const clearDraftTask = serviceRoleClient
        .from('homework_drafts')
        .delete()
        .eq('student_id', user.id)
        .eq('homework_id', homeworkId)
        .then(({ error }: { error: unknown }) => {
          if (error) console.warn('[submit-homework] clear draft failed:', (error as Error)?.message)
        })
      // @ts-ignore EdgeRuntime is available in Supabase Edge Functions
      if (typeof EdgeRuntime !== 'undefined' && typeof EdgeRuntime.waitUntil === 'function') {
        EdgeRuntime.waitUntil(clearDraftTask)
      } else {
        clearDraftTask.catch(() => {})
      }
    }
    return jsonResponse(
      {
        submissionId: submission.id,
        homeworkId,
        homeworkTitle: homework.title,
        submittedAt: submission.submitted_at,
        score: finalScore,
        rawEarned: examGrading.rawEarned,
        rawMax: examGrading.rawMax,
        isNormalized: examGrading.isNormalized,
        maxScore: homework.max_score,
        passScore: homework.pass_score,
        isPassed: finalScore >= homework.pass_score,
        isLate,
        correctCount,
        wrongCount,
        questionReview: questionReviews,
        pdfUrl,
        showSolutions: homework.show_solutions !== false,
      },
      200
    )
  } catch (err: unknown) {
    const error = err as Error
    const msg = error.message || ''
    console.error('[submit-homework] Error during execution:', msg)
    if (msg.includes('Unauthorized') || msg.includes('token') || msg.includes('Authorization')) {
      return errorResponse(msg || 'Unauthorized / Error', 401)
    }
    if (msg.includes('Forbidden')) {
      return errorResponse(msg || 'Forbidden', 403)
    }
    return errorResponse(msg || 'Internal Server Error', 500)
  }
})

function escapeHtmlForTelegram(str: string): string {
  if (!str) return ''
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
}

async function sendTelegramNotification(chatId: string, text: string): Promise<void> {
  const botToken = Deno.env.get('TELEGRAM_BOT_TOKEN')
  if (!botToken) {
    console.warn('[submit-homework] Telegram notification: token_missing')
    return
  }

  const resp = await fetch(`https://api.telegram.org/bot${botToken}/sendMessage`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      chat_id: chatId,
      text,
      parse_mode: 'HTML',
    }),
  })

  // Telegram can return HTTP 200 with ok:false; never log its raw body or request URL.
  let result: unknown
  try {
    result = await resp.json()
  } catch {
    console.warn('[submit-homework] Telegram notification: send_invalid_response', resp.status)
    return
  }
  const payload = result && typeof result === 'object' ? result as { ok?: unknown; error_code?: unknown } : null
  if (!resp.ok || payload?.ok !== true) {
    const errorCode = typeof payload?.error_code === 'number' && Number.isInteger(payload.error_code)
      ? payload.error_code : null
    console.warn('[submit-homework] Telegram notification: send_api_error', resp.status, errorCode)
  }
}
