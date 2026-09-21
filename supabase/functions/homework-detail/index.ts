import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { requireAuth } from '../../shared/auth-middleware.ts'
import { createServiceRoleClient } from '../../shared/supabase-client.ts'
import { handleCors, jsonResponse, errorResponse } from '../../shared/response-helper.ts'

serve(async (req: Request) => {
  const corsRes = handleCors(req)
  if (corsRes) return corsRes

  try {
    if (req.method !== 'GET') {
      return errorResponse('Method not allowed', 405)
    }

    const url = new URL(req.url)
    const homeworkId = url.searchParams.get('homeworkId')

    if (!homeworkId) {
      return errorResponse('Missing required query parameter: homeworkId', 400)
    }

    const serviceRoleClient = createServiceRoleClient()

    const authHeader = req.headers.get('Authorization')
    const hwPromise = serviceRoleClient
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
        show_solutions,
        lessons (
          id,
          title,
          is_trial,
          chapter_id,
          chapters (
            title,
            class_id
          )
        )
      `)
      .eq('id', homeworkId)
      .single()

    const authPromise = authHeader ? requireAuth(req).catch((e: any) => ({ error: e })) : Promise.resolve(null)

    const [{ data: homework, error: hErr }, authResult] = await Promise.all([hwPromise, authPromise])

    if (hErr || !homework) {
      return errorResponse('Homework not found', 404)
    }

    const isTrialLesson = (homework.lessons as any)?.is_trial === true
    let user: any = null
    if (authResult) {
      if ('error' in authResult && authResult.error) {
        if (!isTrialLesson) throw authResult.error
      } else if ('user' in authResult) {
        user = authResult.user
      }
    } else if (!isTrialLesson) {
      return errorResponse('Unauthorized: Missing token', 401)
    }

    const homeworkClassId = (
      homework.lessons as unknown as { chapters: { class_id: string } }
    )?.chapters?.class_id

    // 2. Authorization check for Student (skipped if trial lesson)
    if (user && user.role === 'STUDENT' && !isTrialLesson) {
      if (!homework.is_published) {
        return errorResponse('Homework is not published', 403)
      }
      if (!user.classIds || !user.classIds.includes(homeworkClassId)) {
        return errorResponse('Forbidden: You do not have access to this class homework', 403)
      }
    }

    // 3. Concurrently fetch: Attempts Count, Signed PDF URL, and Questions
    const attemptsPromise = (user && user.role === 'STUDENT')
      ? serviceRoleClient
          .from('submissions')
          .select('*', { count: 'exact', head: true })
          .eq('homework_id', homeworkId)
          .eq('student_id', user.id)
          .eq('status', 'SUBMITTED')
      : Promise.resolve({ count: 0, error: null })

    const pdfPromise = (homework.pdf_path && !homework.pdf_path.startsWith('http'))
      ? serviceRoleClient.storage
          .from('pdf-files')
          .createSignedUrl(homework.pdf_path, 3600)
      : Promise.resolve({ data: null, error: null })

    const isAdmin = user && user.role === 'ADMIN'
    const questionsSelect = isAdmin
      ? 'id, question_number, question_type, prompt, content, options, statements, part_title, points, question_answers (question_id, mc_answer, tf_answers, sa_answer, sa_tolerance, explanation)'
      : 'id, question_number, question_type, prompt, content, options, statements, part_title, points'

    const questionsPromise = serviceRoleClient
      .from('questions')
      .select(questionsSelect)
      .eq('homework_id', homeworkId)
      .order('question_number', { ascending: true })

    const [attemptsRes, pdfRes, questionsRes] = await Promise.all([
      attemptsPromise,
      pdfPromise,
      questionsPromise,
    ])

    let attemptsCount = attemptsRes.count ?? 0

    let pdfUrl = homework.pdf_path || ''
    if (pdfRes.data?.signedUrl) {
      pdfUrl = pdfRes.data.signedUrl
    }

    if (questionsRes.error) {
      return errorResponse(questionsRes.error.message, 500)
    }

    let questionsResult = (questionsRes.data || []).map((q: any) => {
      if (isAdmin) {
        const qa = Array.isArray(q.question_answers) ? q.question_answers[0] : q.question_answers
        const { question_answers, ...rest } = q
        return {
          ...rest,
          answerKey: qa || null,
        }
      }
      return q
    })

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
        showSolutions: homework.show_solutions !== false,
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
