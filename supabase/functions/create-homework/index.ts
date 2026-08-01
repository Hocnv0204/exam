import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { requireAdmin, requireAuth } from '../../shared/auth-middleware.ts'
import { handleCors, jsonResponse, errorResponse } from '../../shared/response-helper.ts'
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

      // Handle Questions and Answer Keys update
      if (questions) {
        // Delete all old questions (cascades to question_answers)
        const { error: delErr } = await serviceRoleClient
          .from('questions')
          .delete()
          .eq('homework_id', homeworkId)

        if (delErr) return errorResponse(`Failed to update questions: ${delErr.message}`, 500)

        // Insert new ones
        for (const q of questions) {
          const { data: questionData, error: qError } = await serviceRoleClient
            .from('questions')
            .insert({
              homework_id: homeworkId,
              question_number: q.questionNumber,
              question_type: q.questionType,
              prompt: q.prompt,
              points: q.points,
            })
            .select()
            .single()

          if (qError || !questionData) {
            return errorResponse(`Failed to insert question #${q.questionNumber} on update: ${qError?.message}`, 500)
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
            return errorResponse(`Failed to insert answer key for question #${q.questionNumber} on update: ${ansError.message}`, 500)
          }
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
