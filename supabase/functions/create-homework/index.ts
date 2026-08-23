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
          lessonTitle: hw.lessons?.title || '',
          chapterTitle: hw.lessons?.chapters?.title || ''
        }))

        return jsonResponse(formatted)
      }

      const lessonId = url.searchParams.get('lessonId')
      let query = serviceRoleClient.from('homeworks').select('*')
      if (lessonId) {
        query = query.eq('lesson_id', lessonId)
      }
      const { data: homeworks, error } = await query.order('created_at', { ascending: false })
      if (error) return errorResponse(error.message, 500)
      return jsonResponse(homeworks)
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
      } = validation.data

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
          max_attempts: maxAttempts || null,
        })
        .select()
        .single()

      if (homeworkError || !homework) {
        return errorResponse(`Failed to create homework: ${homeworkError?.message}`, 500)
      }

      const insertedQuestions = []

      // Insert Questions & Answer Keys transactionally / iteratively
      for (const q of questions) {
        const { data: questionData, error: qError } = await serviceRoleClient
          .from('questions')
          .insert({
            homework_id: homework.id,
            question_number: q.questionNumber,
            question_type: q.questionType,
            prompt: q.prompt,
            points: q.points,
          })
          .select()
          .single()

        if (qError || !questionData) {
          // Cleanup homework if question insert fails
          await serviceRoleClient.from('homeworks').delete().eq('id', homework.id)
          return errorResponse(`Failed to insert question #${q.questionNumber}: ${qError?.message}`, 500)
        }

        // Insert Secure Answer Key in question_answers
        const { error: ansError } = await serviceRoleClient.from('question_answers').insert({
          question_id: questionData.id,
          mc_answer: q.questionType === 'MULTIPLE_CHOICE' ? q.mcAnswer || null : null,
          tf_answers: q.questionType === 'TRUE_FALSE' ? q.tfAnswers || null : null,
          sa_answer: q.questionType === 'SHORT_ANSWER' ? ((q.saAnswer === '' || q.saAnswer === null || q.saAnswer === undefined) ? null : String(q.saAnswer)) : null,
          sa_tolerance: q.questionType === 'SHORT_ANSWER' ? q.saTolerance ?? 0 : 0,
        })

        if (ansError) {
          await serviceRoleClient.from('homeworks').delete().eq('id', homework.id)
          return errorResponse(`Failed to insert answer key for question #${q.questionNumber}: ${ansError.message}`, 500)
        }

        insertedQuestions.push(questionData)
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

      const { homeworkId, lessonId, title, pdfPath, durationMinutes, passScore, maxScore, isPublished, questions, deadline, maxAttempts } = validation.data
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

        for (const q of questions) {
          let questionId = existingMap.get(q.questionNumber)

          if (questionId) {
            // Update existing question
            const { error: updateQErr } = await serviceRoleClient
              .from('questions')
              .update({
                question_type: q.questionType,
                prompt: q.prompt,
                points: q.points,
              })
              .eq('id', questionId)

            if (updateQErr) {
              return errorResponse(`Failed to update question #${q.questionNumber}: ${updateQErr.message}`, 500)
            }

            existingMap.delete(q.questionNumber)
          } else {
            // Insert new question
            const { data: newQ, error: insertQErr } = await serviceRoleClient
              .from('questions')
              .insert({
                homework_id: homeworkId,
                question_number: q.questionNumber,
                question_type: q.questionType,
                prompt: q.prompt,
                points: q.points,
              })
              .select('id')
              .single()

            if (insertQErr || !newQ) {
              return errorResponse(`Failed to insert question #${q.questionNumber}: ${insertQErr?.message}`, 500)
            }
            questionId = newQ.id
          }

          // Update or Insert Secure Answer Key in question_answers
          const { data: existingAns } = await serviceRoleClient
            .from('question_answers')
            .select('id')
            .eq('question_id', questionId)
            .maybeSingle()

          const ansPayload = {
            question_id: questionId,
            mc_answer: q.questionType === 'MULTIPLE_CHOICE' ? q.mcAnswer || null : null,
            tf_answers: q.questionType === 'TRUE_FALSE' ? q.tfAnswers || null : null,
            sa_answer: q.questionType === 'SHORT_ANSWER' ? ((q.saAnswer === '' || q.saAnswer === null || q.saAnswer === undefined) ? null : String(q.saAnswer)) : null,
            sa_tolerance: q.questionType === 'SHORT_ANSWER' ? q.saTolerance ?? 0 : 0,
          }

          if (existingAns) {
            const { error: updateAnsErr } = await serviceRoleClient
              .from('question_answers')
              .update(ansPayload)
              .eq('question_id', questionId)

            if (updateAnsErr) {
              return errorResponse(`Failed to update answer key for question #${q.questionNumber}: ${updateAnsErr.message}`, 500)
            }
          } else {
            const { error: insertAnsErr } = await serviceRoleClient
              .from('question_answers')
              .insert(ansPayload)

            if (insertAnsErr) {
              return errorResponse(`Failed to insert answer key for question #${q.questionNumber}: ${insertAnsErr.message}`, 500)
            }
          }
        }

        // Delete any leftover questions that were removed in the updated payload
        if (existingMap.size > 0) {
          const removedIds = Array.from(existingMap.values())
          const { error: delErr } = await serviceRoleClient
            .from('questions')
            .delete()
            .in('id', removedIds)

          if (delErr) {
            return errorResponse(`Failed to remove old questions: ${delErr.message}`, 500)
          }
        }

        // Regrade all existing student submissions for this homework
        await regradeHomeworkSubmissions(serviceRoleClient, homeworkId)
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

  // 3. Regrade each submission
  for (const sub of submissions) {
    const { data: subAnswers, error: saErr } = await serviceRoleClient
      .from('submission_answers')
      .select('id, question_id, given_answer')
      .eq('submission_id', sub.id)

    if (saErr || !subAnswers) continue

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

      await serviceRoleClient
        .from('submission_answers')
        .update({
          is_correct: gradeResult.isCorrect,
          score_earned: gradeResult.scoreEarned,
        })
        .eq('id', ans.id)
    }

    if (isAllMC && totalQuestions > 0) {
      totalScore = (correctCount / totalQuestions) * 10
    }

    const finalScore = Math.round(totalScore * 10) / 10

    await serviceRoleClient
      .from('submissions')
      .update({
        total_score: finalScore,
        correct_count: correctCount,
        wrong_count: wrongCount,
      })
      .eq('id', sub.id)
  }
}

