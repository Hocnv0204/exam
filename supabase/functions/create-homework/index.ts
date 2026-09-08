import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { requireAdmin, requireAuth } from '../../shared/auth-middleware.ts'
import { handleCors, jsonResponse, errorResponse } from '../../shared/response-helper.ts'
import { gradeQuestion } from '../../shared/grading-service.ts'
import {
  createHomeworkSchema,
  updateHomeworkSchema,
  deleteHomeworkSchema,
} from '../../shared/validators.ts'

serve(async (req: Request) => {
  const corsRes = handleCors(req)
  if (corsRes) return corsRes

  try {
    const { user, serviceRoleClient } = await requireAuth(req)
    const url = new URL(req.url)
    const action = url.searchParams.get('action')

    // GET: List all homeworks (authenticated users)
    if (req.method === 'GET') {
      const todoOnly = url.searchParams.get('todoOnly') === 'true'

      if (todoOnly && user.role === 'STUDENT') {
        if (!user.classIds || user.classIds.length === 0) {
          return jsonResponse([])
        }

        // Fetch all published homeworks for the student's classes
        const { data: homeworks, error: hwError } = await serviceRoleClient
          .from('homeworks')
          .select(`
            id,
            title,
            duration_minutes,
            deadline,
            max_attempts,
            type,
            created_at,
            lessons!inner (
              id,
              title,
              chapters!inner (
                id,
                title,
                class_id,
                classes!inner (
                  id,
                  name
                )
              )
            )
          `)
          .eq('is_published', true)
          .in('lessons.chapters.class_id', user.classIds)
          .order('created_at', { ascending: false })

        if (hwError) return errorResponse(hwError.message, 500)

        // Fetch student's submissions
        const { data: submissions, error: subError } = await serviceRoleClient
          .from('submissions')
          .select('homework_id')
          .eq('student_id', user.id)
          .eq('status', 'SUBMITTED')

        if (subError) return errorResponse(subError.message, 500)

        const submittedHwIds = new Set((submissions || []).map(s => s.homework_id))
        const todoHomeworks = (homeworks || []).filter(hw => !submittedHwIds.has(hw.id))

        const formatted = todoHomeworks.map(hw => {
          const classInfo = (hw.lessons as any)?.chapters?.classes
          return {
            id: hw.id,
            title: hw.title,
            durationMinutes: hw.duration_minutes,
            deadline: hw.deadline,
            maxAttempts: hw.max_attempts,
            type: hw.type,
            createdAt: hw.created_at,
            classId: classInfo?.id || null,
            className: classInfo?.name || 'Lớp học'
          }
        })

        return jsonResponse(formatted)
      }

      const classIdQuery = url.searchParams.get('classId')
      if (classIdQuery) {
        const { data: homeworks, error } = await serviceRoleClient
          .from('homeworks')
          .select(`
            id,
            lesson_id,
            title,
            pdf_path,
            duration_minutes,
            pass_score,
            max_score,
            is_published,
            created_at,
            deadline,
            max_attempts,
            type,
            lessons!inner (
              id,
              title,
              chapter_id,
              chapters!inner (
                id,
                title,
                class_id
              )
            )
          `)
          .eq('lessons.chapters.class_id', classIdQuery)
          .order('created_at', { ascending: false })

        if (error) return errorResponse(error.message, 500)

        const formatted = (homeworks || []).map((hw: any) => ({
          id: hw.id,
          lessonId: hw.lesson_id,
          title: hw.title,
          pdfPath: hw.pdf_path,
          durationMinutes: hw.duration_minutes,
          passScore: hw.pass_score,
          maxScore: hw.max_score,
          isPublished: hw.is_published,
          createdAt: hw.created_at,
          deadline: hw.deadline,
          maxAttempts: hw.max_attempts,
          type: hw.type,
          lessonTitle: hw.lessons?.title || '',
          chapterTitle: hw.lessons?.chapters?.title || ''
        }))

        return jsonResponse(formatted)
      }

      const lessonId = url.searchParams.get('lessonId')
      let query = serviceRoleClient
        .from('homeworks')
        .select(`
          id,
          lesson_id,
          title,
          pdf_path,
          duration_minutes,
          pass_score,
          max_score,
          is_published,
          created_at,
          deadline,
          max_attempts,
          type,
          max_violations,
          lessons (
            id,
            title,
            chapter_id,
            chapters (
              id,
              title,
              class_id,
              classes (
                id,
                name
              )
            )
          )
        `)
      if (lessonId) {
        query = query.eq('lesson_id', lessonId)
      }
      const { data: homeworks, error } = await query.order('created_at', { ascending: false })
      if (error) return errorResponse(error.message, 500)

      const formatted = (homeworks || []).map((hw: any) => {
        const lessonInfo = hw.lessons
        const chapterInfo = lessonInfo?.chapters
        const classInfo = chapterInfo?.classes

        return {
          id: hw.id,
          lessonId: hw.lesson_id,
          title: hw.title,
          pdfPath: hw.pdf_path,
          durationMinutes: hw.duration_minutes,
          passScore: hw.pass_score,
          maxScore: hw.max_score,
          isPublished: hw.is_published,
          createdAt: hw.created_at,
          deadline: hw.deadline,
          maxAttempts: hw.max_attempts,
          type: hw.type || 'PRACTICE',
          maxViolations: hw.max_violations,
          lessonTitle: lessonInfo?.title || '',
          chapterId: chapterInfo?.id || lessonInfo?.chapter_id || null,
          chapterTitle: chapterInfo?.title || '',
          classId: classInfo?.id || chapterInfo?.class_id || null,
          className: classInfo?.name || ''
        }
      })

      return jsonResponse(formatted)
    }

    // Role Guard: POST, PUT, PATCH, DELETE are Admin-only
    if (user.role !== 'ADMIN') {
      return errorResponse('Forbidden: Only admins can manage homeworks', 403)
    }

    // POST: Create Homework + Questions + Secure Answer Keys
    if (req.method === 'POST' && (!action || action === 'create')) {
      const body = await req.json()
      const validation = createHomeworkSchema.safeParse(body)
      if (!validation.success) {
        return errorResponse('Validation error', 400, validation.error.format())
      }

      const {
        lessonId,
        title,
        pdfPath,
        durationMinutes,
        passScore,
        maxScore,
        isPublished,
        questions,
        deadline,
        maxAttempts,
        type,
        maxViolations,
      } = validation.data

      // Automatically enforce max_attempts = 1 if it's an EXAM
      const finalMaxAttempts = type === 'EXAM' ? 1 : (maxAttempts || null);
      const finalMaxViolations = maxViolations || 3;

      // Create Homework Record
      const { data: homework, error: homeworkError } = await serviceRoleClient
        .from('homeworks')
        .insert({
          lesson_id: lessonId,
          title,
          pdf_path: pdfPath,
          duration_minutes: durationMinutes,
          pass_score: passScore,
          max_score: maxScore,
          is_published: isPublished,
          deadline: deadline || null,
          max_attempts: finalMaxAttempts,
          type: type || 'PRACTICE',
          max_violations: finalMaxViolations,
        })
        .select()
        .single()

      if (homeworkError || !homework) {
        return errorResponse(`Failed to create homework: ${homeworkError?.message}`, 500)
      }

      // 1. Bulk insert questions
      const questionsPayload = questions.map((q: any) => ({
        homework_id: homework.id,
        question_number: q.questionNumber,
        question_type: q.questionType,
        prompt: q.prompt,
        points: q.points,
      }))

      const { data: insertedQuestions, error: qError } = await serviceRoleClient
        .from('questions')
        .insert(questionsPayload)
        .select()

      if (qError || !insertedQuestions) {
        // Cleanup homework if question insert fails
        await serviceRoleClient.from('homeworks').delete().eq('id', homework.id)
        return errorResponse(`Failed to insert questions: ${qError?.message}`, 500)
      }

      // 2. Map question answers and bulk insert into question_answers
      const qMap = new Map(insertedQuestions.map((iq: any) => [iq.question_number, iq.id]))
      const answersPayload = questions.map((q: any) => {
        const qId = qMap.get(q.questionNumber)
        return {
          question_id: qId,
          mc_answer: q.questionType === 'MULTIPLE_CHOICE' ? q.mcAnswer || null : null,
          tf_answers: q.questionType === 'TRUE_FALSE' ? q.tfAnswers || null : null,
          sa_answer: q.questionType === 'SHORT_ANSWER' ? ((q.saAnswer === '' || q.saAnswer === null || q.saAnswer === undefined) ? null : String(q.saAnswer)) : null,
          sa_tolerance: q.questionType === 'SHORT_ANSWER' ? q.saTolerance ?? 0 : 0,
        }
      }).filter((a: any) => !!a.question_id)

      const { error: ansError } = await serviceRoleClient
        .from('question_answers')
        .insert(answersPayload)

      if (ansError) {
        await serviceRoleClient.from('homeworks').delete().eq('id', homework.id)
        return errorResponse(`Failed to insert answer keys: ${ansError.message}`, 500)
      }

      return jsonResponse(
        {
          homework,
          questionsCount: insertedQuestions.length,
          questions: insertedQuestions,
        },
        201
      )
    }

    // PUT / PATCH: Update Homework
    if (req.method === 'PUT' || req.method === 'PATCH' || action === 'update') {
      const body = await req.json()
      const validation = updateHomeworkSchema.safeParse(body)
      if (!validation.success) {
        return errorResponse('Validation error', 400, validation.error.format())
      }

      const { homeworkId, lessonId, title, pdfPath, durationMinutes, passScore, maxScore, isPublished, questions, deadline, maxAttempts, type, maxViolations } = validation.data
      const updateData: Record<string, unknown> = { updated_at: new Date().toISOString() }

      if (lessonId !== undefined) updateData.lesson_id = lessonId
      if (title !== undefined) updateData.title = title
      if (pdfPath !== undefined) updateData.pdf_path = pdfPath
      if (durationMinutes !== undefined) updateData.duration_minutes = durationMinutes
      if (passScore !== undefined) updateData.pass_score = passScore
      if (maxScore !== undefined) updateData.max_score = maxScore
      if (isPublished !== undefined) updateData.is_published = isPublished
      if (deadline !== undefined) updateData.deadline = deadline || null
      if (maxAttempts !== undefined) updateData.max_attempts = maxAttempts || null
      if (type !== undefined) updateData.type = type
      if (maxViolations !== undefined) updateData.max_violations = maxViolations || 3
      
      // Enforce max_attempts and max_violations if EXAM
      if (updateData.type === 'EXAM' || (type === undefined && (maxAttempts !== undefined || maxViolations !== undefined))) {
         if (updateData.type === 'EXAM') {
            updateData.max_attempts = 1;
            if (updateData.max_violations === undefined || updateData.max_violations === null) {
              updateData.max_violations = 3;
            }
         }
      }

      const { data: updatedHomework, error } = await serviceRoleClient
        .from('homeworks')
        .update(updateData)
        .eq('id', homeworkId)
        .select()
        .single()

      if (error) return errorResponse(error.message, 500)

      // Handle Questions and Answer Keys update in-place to preserve submission_answers
      if (questions) {
        // Fetch existing questions
        const { data: existingQuestions, error: fetchQErr } = await serviceRoleClient
          .from('questions')
          .select('id, question_number')
          .eq('homework_id', homeworkId)

        if (fetchQErr) {
          return errorResponse(`Failed to fetch existing questions: ${fetchQErr.message}`, 500)
        }

        const existingMap = new Map<number, string>()
        if (existingQuestions) {
          for (const eq of existingQuestions) {
            existingMap.set(eq.question_number, eq.id)
          }
        }

        // 1. Bulk insert new questions (if any)
        const toInsert = questions.filter((q: any) => !existingMap.has(q.questionNumber))
        if (toInsert.length > 0) {
          const { data: newQuestions, error: insertErr } = await serviceRoleClient
            .from('questions')
            .insert(toInsert.map((q: any) => ({
              homework_id: homeworkId,
              question_number: q.questionNumber,
              question_type: q.questionType,
              prompt: q.prompt,
              points: q.points,
            })))
            .select('id, question_number')

          if (insertErr || !newQuestions) {
            return errorResponse(`Failed to insert new questions: ${insertErr?.message}`, 500)
          }
          for (const nq of newQuestions) {
            existingMap.set(nq.question_number, nq.id)
          }
        }

        // 2. Parallel update existing questions
        const toUpdate = questions.filter((q: any) => existingMap.has(q.questionNumber))
        if (toUpdate.length > 0) {
          const updatePromises = toUpdate.map((q: any) => {
            const qId = existingMap.get(q.questionNumber)
            return serviceRoleClient
              .from('questions')
              .update({
                question_type: q.questionType,
                prompt: q.prompt,
                points: q.points,
              })
              .eq('id', qId)
          })
          const results = await Promise.all(updatePromises)
          const failed = results.find((r: any) => r.error)
          if (failed) {
            return errorResponse(`Failed to update questions: ${failed.error?.message}`, 500)
          }
        }

        // 3. Upsert all answer keys in a single bulk request (question_id has UNIQUE constraint)
        const answersPayload = questions.map((q: any) => {
          const qId = existingMap.get(q.questionNumber)
          return {
            question_id: qId,
            mc_answer: q.questionType === 'MULTIPLE_CHOICE' ? q.mcAnswer || null : null,
            tf_answers: q.questionType === 'TRUE_FALSE' ? q.tfAnswers || null : null,
            sa_answer: q.questionType === 'SHORT_ANSWER' ? ((q.saAnswer === '' || q.saAnswer === null || q.saAnswer === undefined) ? null : String(q.saAnswer)) : null,
            sa_tolerance: q.questionType === 'SHORT_ANSWER' ? q.saTolerance ?? 0 : 0,
          }
        }).filter((a: any) => !!a.question_id)

        if (answersPayload.length > 0) {
          const { error: ansUpsertErr } = await serviceRoleClient
            .from('question_answers')
            .upsert(answersPayload, { onConflict: 'question_id' })

          if (ansUpsertErr) {
            return errorResponse(`Failed to update answer keys: ${ansUpsertErr.message}`, 500)
          }
        }

        // 4. Delete any leftover questions that were removed in the updated payload
        const incomingQNums = new Set(questions.map((q: any) => q.questionNumber))
        const removedIds = (existingQuestions || [])
          .filter((eq: any) => !incomingQNums.has(eq.question_number))
          .map((eq: any) => eq.id)

        if (removedIds.length > 0) {
          const { error: delErr } = await serviceRoleClient
            .from('questions')
            .delete()
            .in('id', removedIds)

          if (delErr) {
            return errorResponse(`Failed to remove old questions: ${delErr.message}`, 500)
          }
        }

        // 5. Regrade existing student submissions in background if EdgeRuntime permits, or synchronously
        const regradeTask = regradeHomeworkSubmissions(serviceRoleClient, homeworkId).catch((err: any) => {
          console.error('[create-homework] Error during submissions regrading:', err)
        })

        // @ts-ignore
        if (typeof EdgeRuntime !== 'undefined' && typeof EdgeRuntime.waitUntil === 'function') {
          // @ts-ignore
          EdgeRuntime.waitUntil(regradeTask)
        } else {
          await regradeTask
        }
      }

      return jsonResponse({
        homework: updatedHomework,
        message: 'Homework updated successfully'
      })
    }

    // DELETE: Delete Homework
    if (req.method === 'DELETE' || action === 'delete') {
      const body = await req.json().catch(() => ({}))
      const homeworkIdQuery = url.searchParams.get('homeworkId') || body.homeworkId

      const validation = deleteHomeworkSchema.safeParse({ homeworkId: homeworkIdQuery })
      if (!validation.success) {
        return errorResponse('Validation error', 400, validation.error.format())
      }

      const { homeworkId } = validation.data

      const { error } = await serviceRoleClient
        .from('homeworks')
        .delete()
        .eq('id', homeworkId)

      if (error) return errorResponse(error.message, 500)
      return jsonResponse({ message: 'Homework deleted successfully', homeworkId })
    }

    return errorResponse('Method not allowed', 405)
  } catch (err: unknown) {
    const error = err as Error
    return errorResponse(error.message || 'Unauthorized / Error', 401)
  }
})

async function regradeHomeworkSubmissions(serviceRoleClient: any, homeworkId: string) {
  // 1. Fetch all questions and answer keys for this homework
  const { data: questions, error: qErr } = await serviceRoleClient
    .from('questions')
    .select(`
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
    `)
    .eq('homework_id', homeworkId)
    .order('question_number', { ascending: true })

  if (qErr || !questions || questions.length === 0) return

  // 2. Fetch all submissions for this homework
  const { data: submissions, error: sErr } = await serviceRoleClient
    .from('submissions')
    .select('id')
    .eq('homework_id', homeworkId)

  if (sErr || !submissions || submissions.length === 0) return

  // Determine grading structure
  const totalQuestions = questions.length
  const mcCount = questions.filter((q: any) => q.question_type === 'MULTIPLE_CHOICE').length
  const tfCount = questions.filter((q: any) => q.question_type === 'TRUE_FALSE').length
  const saCount = questions.filter((q: any) => q.question_type === 'SHORT_ANSWER').length

  const isAllMC = mcCount === totalQuestions
  const isStructureB = mcCount === 12 && tfCount === 4 && saCount === 6
  const isStructureC = mcCount === 18 && tfCount === 4 && saCount === 6

  // Index questions by id
  const questionMap = new Map()
  for (const q of questions) {
    const qaRaw = q.question_answers
    const qa = Array.isArray(qaRaw) ? qaRaw[0] : qaRaw

    let customPoints = q.points || 1.0
    if (isAllMC) {
      customPoints = 10 / totalQuestions
    } else if (isStructureB) {
      if (q.question_type === 'MULTIPLE_CHOICE') customPoints = 0.25
      else if (q.question_type === 'TRUE_FALSE') customPoints = 1.0
      else if (q.question_type === 'SHORT_ANSWER') customPoints = 0.5
    } else if (isStructureC) {
      if (q.question_type === 'MULTIPLE_CHOICE') customPoints = 0.25
      else if (q.question_type === 'TRUE_FALSE') customPoints = 1.0
      else if (q.question_type === 'SHORT_ANSWER') customPoints = 0.25
    }

    questionMap.set(q.id, {
      questionId: q.id,
      questionType: q.question_type,
      points: customPoints,
      mcAnswer: qa?.mc_answer || null,
      tfAnswers: qa?.tf_answers || null,
      saAnswer: qa?.sa_answer !== null && qa?.sa_answer !== undefined ? qa.sa_answer : null,
      saTolerance: qa?.sa_tolerance !== null && qa?.sa_tolerance !== undefined ? Number(qa.sa_tolerance) : 0,
    })
  }

  // 3. Fetch ALL answers for all submissions of this homework in ONE single query!
  const subIds = submissions.map((s: any) => s.id)
  const { data: allSubAnswers, error: saErr } = await serviceRoleClient
    .from('submission_answers')
    .select('id, submission_id, question_id, given_answer')
    .in('submission_id', subIds)

  if (saErr || !allSubAnswers || allSubAnswers.length === 0) return

  // Group answers by submission_id
  const answersBySub = new Map<string, any[]>()
  for (const ans of allSubAnswers) {
    let list = answersBySub.get(ans.submission_id)
    if (!list) {
      list = []
      answersBySub.set(ans.submission_id, list)
    }
    list.push(ans)
  }

  const allUpdatedAnswers: any[] = []
  const submissionsToUpdate: any[] = []

  for (const sub of submissions) {
    const subAnswers = answersBySub.get(sub.id) || []
    let totalScore = 0
    let correctCount = 0
    let wrongCount = 0

    for (const ans of subAnswers) {
      const qInfo = questionMap.get(ans.question_id)
      if (!qInfo) continue

      const gradeResult = gradeQuestion({
        questionId: qInfo.questionId,
        questionType: qInfo.questionType,
        points: qInfo.points,
        mcAnswer: qInfo.mcAnswer,
        tfAnswers: qInfo.tfAnswers,
        saAnswer: qInfo.saAnswer,
        saTolerance: qInfo.saTolerance,
        givenAnswer: ans.given_answer,
      })

      if ((isStructureB || isStructureC) && qInfo.questionType === 'TRUE_FALSE') {
        const correctCountForTF = gradeResult.correctCount ?? 0
        let customScoreEarned = 0
        if (correctCountForTF === 1) customScoreEarned = 0.1
        else if (correctCountForTF === 2) customScoreEarned = 0.25
        else if (correctCountForTF === 3) customScoreEarned = 0.5
        else if (correctCountForTF === 4) customScoreEarned = 1.0

        gradeResult.scoreEarned = customScoreEarned
        gradeResult.isCorrect = correctCountForTF === 4
      }

      totalScore += gradeResult.scoreEarned
      correctCount += gradeResult.isCorrect ? 1 : 0
      wrongCount += gradeResult.isCorrect ? 0 : 1

      allUpdatedAnswers.push({
        id: ans.id,
        submission_id: ans.submission_id,
        question_id: ans.question_id,
        given_answer: ans.given_answer,
        is_correct: gradeResult.isCorrect,
        score_earned: gradeResult.scoreEarned,
      })
    }

    if (isAllMC && totalQuestions > 0) {
      totalScore = (correctCount / totalQuestions) * 10
    }

    const finalScore = Math.round(totalScore * 10) / 10

    submissionsToUpdate.push({
      id: sub.id,
      total_score: finalScore,
      correct_count: correctCount,
      wrong_count: wrongCount,
    })
  }

  // 4. Batch update submission_answers using upsert in chunks of 200
  if (allUpdatedAnswers.length > 0) {
    const chunkSize = 200
    for (let i = 0; i < allUpdatedAnswers.length; i += chunkSize) {
      const chunk = allUpdatedAnswers.slice(i, i + chunkSize)
      await serviceRoleClient
        .from('submission_answers')
        .upsert(chunk, { onConflict: 'id' })
    }
  }

  // 5. Parallel update submissions
  if (submissionsToUpdate.length > 0) {
    await Promise.all(
      submissionsToUpdate.map((sub: any) =>
        serviceRoleClient
          .from('submissions')
          .update({
            total_score: sub.total_score,
            correct_count: sub.correct_count,
            wrong_count: sub.wrong_count,
          })
          .eq('id', sub.id)
      )
    )
  }
}

