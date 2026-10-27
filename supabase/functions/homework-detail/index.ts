import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { requireAuth } from '../../shared/auth-middleware.ts'
import { createServiceRoleClient } from '../../shared/supabase-client.ts'
import { handleCors, jsonResponse, errorResponse } from '../../shared/response-helper.ts'

serve(async (req: Request) => {
  const corsRes = handleCors(req)
  if (corsRes) return corsRes

  try {
    const url = new URL(req.url)
    const action = url.searchParams.get('action')

    // ---- Nháp bài làm (STUDENT đã đăng nhập, không áp dụng khách vãng lai) ----
    if (action === 'save-draft' || action === 'my-drafts' || action === 'get-draft' || action === 'delete-draft') {
      return await handleDraftAction(req, action)
    }

    if (req.method !== 'GET') {
      return errorResponse('Method not allowed', 405)
    }

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

    // 2b. Bài giao riêng: chỉ học sinh trong danh sách mới được xem/làm
    let assignedIds: string[] = []
    if (!isTrialLesson) {
      const { data: targets } = await serviceRoleClient
        .from('homework_targets')
        .select('student_id')
        .eq('homework_id', homeworkId)
      assignedIds = (targets || []).map((t: { student_id: string }) => t.student_id)
      if (user && user.role === 'STUDENT' && assignedIds.length > 0 && !assignedIds.includes(user.id)) {
        return errorResponse('Forbidden: This homework was assigned to other students', 403)
      }
    }

    // 3. Concurrently fetch: Attempts Count, Active Attempt, Signed PDF URL, and Questions
    const attemptsPromise = (user && user.role === 'STUDENT')
      ? serviceRoleClient
          .from('submissions')
          .select('*', { count: 'exact', head: true })
          .eq('homework_id', homeworkId)
          .eq('student_id', user.id)
          .eq('status', 'SUBMITTED')
      : Promise.resolve({ count: 0, error: null })

    // Lượt thi đang mở do admin cấp thêm (reopen tạo session ACTIVE mới, attempt_no tăng dần).
    // FE dùng để cho vào phòng thi dù attemptsCount đã chạm maxAttempts.
    const activeAttemptPromise = (user && user.role === 'STUDENT')
      ? serviceRoleClient
          .from('exam_sessions')
          .select('attempt_no')
          .eq('homework_id', homeworkId)
          .eq('student_id', user.id)
          .eq('status', 'ACTIVE')
          .order('attempt_no', { ascending: false })
          .limit(1)
          .maybeSingle()
          .then(
            (r: any) => ({ attemptNo: Number(r?.data?.attempt_no) || 0 }),
            () => ({ attemptNo: 0 })
          )
      : Promise.resolve({ attemptNo: 0 })

    // Học sinh tuyệt đối không thấy PDF của BÀI THI (EXAM): không cấp signed URL,
    // không trả pdfPath — chặn cả nút tải lẫn nút xem PDF trong phòng thi.
    // Đề thi vẫn hiển thị qua câu hỏi trắc nghiệm; giáo viên/admin không ảnh hưởng.
    const hidePdfForStudentExam = user?.role === 'STUDENT' && (homework.type || 'PRACTICE') === 'EXAM'

    const pdfPromise = (!hidePdfForStudentExam && homework.pdf_path && !homework.pdf_path.startsWith('http'))
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

    const [attemptsRes, activeAttemptRes, pdfRes, questionsRes] = await Promise.all([
      attemptsPromise,
      activeAttemptPromise,
      pdfPromise,
      questionsPromise,
    ])

    let attemptsCount = attemptsRes.count ?? 0
    const activeAttemptNo = (activeAttemptRes as any)?.attemptNo || 0

    let pdfUrl = homework.pdf_path || ''
    if (pdfRes.data?.signedUrl) {
      pdfUrl = pdfRes.data.signedUrl
    }
    if (hidePdfForStudentExam) pdfUrl = ''

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
        pdfPath: hidePdfForStudentExam ? '' : homework.pdf_path,
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
        assignedStudentIds: assignedIds,
      },
      questions: questionsResult,
      attemptsCount,
      activeAttemptNo,
    })
  } catch (err: unknown) {
    const error = err as Error
    return errorResponse(error.message || 'Unauthorized / Error', 401)
  }
})

// ---- Nháp bài làm luyện tập (lưu server để tiếp tục trên mọi thiết bị) ----
async function handleDraftAction(req: Request, action: string): Promise<Response> {
  const serviceRoleClient = createServiceRoleClient()
  let user: { id: string; role: string }
  try {
    const auth = await requireAuth(req)
    user = auth.user
  } catch {
    return errorResponse('Unauthorized', 401)
  }
  if (user.role !== 'STUDENT') {
    return errorResponse('Forbidden: Only students can manage drafts', 403)
  }

  const url = new URL(req.url)

  // Danh sách nháp của tôi (kèm tên bài + lớp để hiển thị "Đang làm dở")
  if (req.method === 'GET' && action === 'my-drafts') {
    const { data, error } = await serviceRoleClient
      .from('homework_drafts')
      .select(`
        homework_id, answers, time_left_seconds, answered_count, updated_at,
        homeworks!inner (
          id, title, type, deadline, duration_minutes,
          lessons (title, chapters (title, class_id, classes (id, name)))
        )
      `)
      .eq('student_id', user.id)
      .order('updated_at', { ascending: false })
      .limit(20)
    if (error) return errorResponse(error.message, 500)
    const items = (data || []).map((d: any) => {
      const hw = d.homeworks || {}
      const lesson = hw.lessons || {}
      const ch = lesson.chapters || {}
      return {
        homeworkId: d.homework_id,
        title: hw.title || 'Bài tập',
        type: hw.type || 'PRACTICE',
        deadline: hw.deadline || null,
        durationMinutes: hw.duration_minutes || 45,
        lessonTitle: lesson.title || '',
        chapterTitle: ch.title || '',
        classId: ch.class_id || ch.classes?.id || null,
        className: ch.classes?.name || '',
        answeredCount: d.answered_count || 0,
        timeLeftSeconds: d.time_left_seconds,
        updatedAt: d.updated_at,
      }
    })
    return jsonResponse(items)
  }

  // Lấy 1 nháp để khôi phục khi mở bài
  if (req.method === 'GET' && action === 'get-draft') {
    const homeworkId = url.searchParams.get('homeworkId')
    if (!homeworkId) return errorResponse('Missing homeworkId', 400)
    const { data, error } = await serviceRoleClient
      .from('homework_drafts')
      .select('answers, time_left_seconds, answered_count, updated_at')
      .eq('student_id', user.id)
      .eq('homework_id', homeworkId)
      .maybeSingle()
    if (error) return errorResponse(error.message, 500)
    return jsonResponse(data || null)
  }

  // Lưu nháp (upsert theo cặp student + homework)
  if (req.method === 'POST' && action === 'save-draft') {
    const body = await req.json().catch(() => ({}))
    const homeworkId: string | undefined = body.homeworkId || body.homework_id
    if (!homeworkId) return errorResponse('Missing homeworkId', 400)
    const answers = body.answers && typeof body.answers === 'object'
      ? { mc: body.answers.mc || {}, tf: body.answers.tf || {}, sa: body.answers.sa || {} }
      : { mc: {}, tf: {}, sa: {} }

    // Chỉ cho nháp bài đã xuất bản (rẻ: 1 hop select id)
    const { data: hw } = await serviceRoleClient
      .from('homeworks')
      .select('id')
      .eq('id', homeworkId)
      .eq('is_published', true)
      .maybeSingle()
    if (!hw) return errorResponse('Homework not found or not published', 404)

    const { error: upErr } = await serviceRoleClient
      .from('homework_drafts')
      .upsert({
        student_id: user.id,
        homework_id: homeworkId,
        answers,
        time_left_seconds: typeof body.timeLeft === 'number' ? Math.max(0, Math.floor(body.timeLeft)) : null,
        answered_count: typeof body.answeredCount === 'number' ? Math.max(0, Math.floor(body.answeredCount)) : 0,
        updated_at: new Date().toISOString(),
      }, { onConflict: 'student_id,homework_id' })
    if (upErr) return errorResponse(upErr.message, 500)
    return jsonResponse({ saved: true })
  }

  // Xóa nháp (khi nộp xong hoặc học sinh tự xóa)
  if ((req.method === 'DELETE' || req.method === 'POST') && action === 'delete-draft') {
    const body = req.method === 'POST' ? await req.json().catch(() => ({})) : {}
    const homeworkId = url.searchParams.get('homeworkId') || body.homeworkId || body.homework_id
    if (!homeworkId) return errorResponse('Missing homeworkId', 400)
    const { error: delErr } = await serviceRoleClient
      .from('homework_drafts')
      .delete()
      .eq('student_id', user.id)
      .eq('homework_id', homeworkId)
    if (delErr) return errorResponse(delErr.message, 500)
    return jsonResponse({ deleted: true })
  }

  return errorResponse('Method not allowed', 405)
}
