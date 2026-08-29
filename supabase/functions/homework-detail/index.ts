import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { requireAuth } from '../../shared/auth-middleware.ts'
import { handleCors, jsonResponse, errorResponse } from '../../shared/response-helper.ts'

serve(async (req: Request) => {
  const corsRes = handleCors(req)
  if (corsRes) return corsRes

  try {
    if (req.method !== 'GET') {
      return errorResponse('Method not allowed', 405)
    }

    const { user, serviceRoleClient } = await requireAuth(req)
    const url = new URL(req.url)
    const homeworkId = url.searchParams.get('homeworkId')

    if (!homeworkId) {
      return errorResponse('Missing required query parameter: homeworkId', 400)
    }

    // 1. Fetch Homework
    const { data: homework, error: hErr } = await serviceRoleClient
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
          title,
          chapter_id,
          chapters (
            title,
            class_id
          )
        )
      `)
      .eq('id', homeworkId)
      .single()

    if (hErr || !homework) {
      return errorResponse('Homework not found', 404)
    }

    const homeworkClassId = (
      homework.lessons as unknown as { chapters: { class_id: string } }
    )?.chapters?.class_id

    // 2. Authorization check for Student
    if (user.role === 'STUDENT') {
      if (!homework.is_published) {
        return errorResponse('Homework is not published', 403)
      }
      if (!user.classIds || !user.classIds.includes(homeworkClassId)) {
        return errorResponse('Forbidden: You do not have access to this class homework', 403)
      }
    }

    // 3. Count attempts for STUDENT
    let attemptsCount = 0
    if (user.role === 'STUDENT') {
      const { count, error: countErr } = await serviceRoleClient
        .from('submissions')
        .select('*', { count: 'exact', head: true })
        .eq('homework_id', homeworkId)
        .eq('student_id', user.id)
        .eq('status', 'SUBMITTED')

      if (!countErr && count !== null) {
        attemptsCount = count
      }
    }

    // 4. Generate Signed URL for PDF storage file
    let pdfUrl = homework.pdf_path
    if (!pdfUrl.startsWith('http')) {
      const { data: signedUrlData, error: storageErr } = await serviceRoleClient.storage
        .from('pdf-files')
        .createSignedUrl(homework.pdf_path, 3600) // 1 hour signed URL

      if (!storageErr && signedUrlData) {
        pdfUrl = signedUrlData.signedUrl
      }
    }

    // 5. Fetch Questions
    const { data: questions, error: qErr } = await serviceRoleClient
      .from('questions')
      .select('id, question_number, question_type, prompt, points')
      .eq('homework_id', homeworkId)
      .order('question_number', { ascending: true })

    if (qErr) {
      return errorResponse(qErr.message, 500)
    }

    // 6. Security Enforcer: Answer keys inclusion based on Role
    let questionsResult = questions

    if (user.role === 'ADMIN') {
      // Admins get question_answers
      const qIds = (questions || []).map((q) => q.id)
      const { data: answerKeys } = await serviceRoleClient
        .from('question_answers')
        .select('question_id, mc_answer, tf_answers, sa_answer, sa_tolerance')
        .in('question_id', qIds)

      const keyMap = new Map(answerKeys?.map((k) => [k.question_id, k]) || [])

      questionsResult = (questions || []).map((q) => ({
        ...q,
        answerKey: keyMap.get(q.id) || null,
      }))
    }
    // Note: For STUDENT role, answerKey is NEVER attached!

    return jsonResponse({
      homework: {
        id: homework.id,
        title: homework.title,
        pdfPath: homework.pdf_path,
        pdfUrl,
        durationMinutes: homework.duration_minutes,
        passScore: homework.pass_score,
        maxScore: homework.max_score,
        isPublished: homework.is_published,
        createdAt: homework.created_at,
        deadline: homework.deadline,
        maxAttempts: homework.max_attempts,
        type: homework.type || 'PRACTICE',
        maxViolations: homework.max_violations !== undefined ? homework.max_violations : 3,
        lessonTitle: (homework.lessons as unknown as { title: string })?.title,
        chapterTitle: (homework.lessons as unknown as { chapters: { title: string } })?.chapters?.title,
        lessonId: homework.lesson_id,
        chapterId: (homework.lessons as unknown as { chapter_id: string })?.chapter_id,
        classId: homeworkClassId,
      },
      questions: questionsResult,
      attemptsCount,
    })
  } catch (err: unknown) {
    const error = err as Error
    return errorResponse(error.message || 'Unauthorized / Error', 401)
  }
})
