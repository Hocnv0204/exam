import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { requireAdmin, requireAuth } from '../../shared/auth-middleware.ts'
import { handleCors, jsonResponse, errorResponse } from '../../shared/response-helper.ts'
import { gradeQuestion, gradeExam, type QuestionGradeInput } from '../../shared/grading-service.ts'
import {
  createHomeworkSchema,
  updateHomeworkSchema,
  deleteHomeworkSchema,
} from '../../shared/validators.ts'
import {
  createSupabaseQuestionBankSyncAdapter,
  syncHomeworkQuestionsToConstantBank,
} from './auto-bank-sync.ts'
import { loadClassHomeworkProgress } from './class-progress.ts'
import { scheduleHomeworkTelegram } from './telegram-notify.ts'

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

      // Trang "Bài tập của tôi": gộp bài được giao + lần nộp mới nhất, phân trang + lọc ở server
      // ?action=my-homeworks&status=all|done|todo&classId=&type=&search=&page=&pageSize=
      if (action === 'my-homeworks' && user.role === 'STUDENT') {
        if (!user.classIds || user.classIds.length === 0) {
          return jsonResponse({ items: [], total: 0, page: 1, pageSize: 10, totalPages: 1, stats: { total: 0, done: 0, todo: 0, avgScore: null } })
        }
        const statusFilter = url.searchParams.get('status') || 'all'
        const classFilter = url.searchParams.get('classId') || ''
        const typeFilter = url.searchParams.get('type') || ''
        const search = (url.searchParams.get('search') || '').trim()
        const page = Math.max(1, parseInt(url.searchParams.get('page') || '1', 10) || 1)
        const pageSize = Math.min(50, Math.max(1, parseInt(url.searchParams.get('pageSize') || '10', 10) || 10))
        if (!['all', 'done', 'todo'].includes(statusFilter)) return errorResponse('status phải là all|done|todo', 400)

        let hwQuery = serviceRoleClient
          .from('homeworks')
          .select(`
            id,
            title,
            duration_minutes,
            deadline,
            max_attempts,
            type,
            pdf_path,
            created_at,
            pass_score,
            max_score,
            homework_targets (student_id),
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
        if (classFilter) hwQuery = hwQuery.eq('lessons.chapters.class_id', classFilter)
        if (typeFilter) hwQuery = hwQuery.eq('type', typeFilter)
        if (search) hwQuery = hwQuery.ilike('title', `%${search}%`)

        const [hwRes, subRes] = await Promise.all([
          hwQuery,
          serviceRoleClient
            .from('submissions')
            .select('id, homework_id, total_score, max_score, is_late, submitted_at')
            .eq('student_id', user.id)
            .eq('status', 'SUBMITTED')
            .order('submitted_at', { ascending: false })
        ])
        if (hwRes.error) return errorResponse(hwRes.error.message, 500)
        if (subRes.error) return errorResponse(subRes.error.message, 500)

        const latestByHw = new Map<string, any>()
        for (const s of (subRes.data || [])) {
          if (!latestByHw.has(s.homework_id)) latestByHw.set(s.homework_id, s)
        }

        const merged = (hwRes.data || [])
          // Bài giao riêng: chỉ hiện khi mình nằm trong danh sách target
          .filter((hw: any) => {
            const targets = (hw.homework_targets || []) as Array<{ student_id: string }>
            return targets.length === 0 || targets.some((t) => t.student_id === user.id)
          })
          .map((hw: any) => {
          const classInfo = (hw.lessons as any)?.chapters?.classes
          const sub = latestByHw.get(hw.id) || null
          const score = sub ? Number(sub.total_score) : null
          return {
            id: hw.id,
            title: hw.title,
            durationMinutes: hw.duration_minutes,
            deadline: hw.deadline,
            maxAttempts: hw.max_attempts,
            type: hw.type || 'PRACTICE',
            // Học sinh tuyệt đối không thấy PDF của BÀI THI ngay từ danh sách.
            pdfPath: hw.type === 'EXAM' ? '' : hw.pdf_path,
            createdAt: hw.created_at,
            classId: classInfo?.id || null,
            className: classInfo?.name || 'Lớp học',
            done: !!sub,
            score,
            maxScore: sub ? Number(sub.max_score || hw.max_score || 10) : Number(hw.max_score || 10),
            isPassed: sub ? score >= Number(hw.pass_score ?? 5) : null,
            isLate: sub ? !!sub.is_late : false,
            submittedAt: sub ? sub.submitted_at : null,
            submissionId: sub ? sub.id : null
          }
        })

        const scoped = statusFilter === 'all' ? merged : merged.filter((m: any) => statusFilter === 'done' ? m.done : !m.done)
        // Chưa làm xếp hạn gần trước; đã làm xếp mới nộp trước
        const todos = scoped.filter((m: any) => !m.done).sort((a: any, b: any) => {
          const da = a.deadline ? new Date(a.deadline).getTime() : Infinity
          const db = b.deadline ? new Date(b.deadline).getTime() : Infinity
          return da - db
        })
        const dones = scoped.filter((m: any) => m.done).sort((a: any, b: any) =>
          new Date(b.submittedAt).getTime() - new Date(a.submittedAt).getTime())
        const ordered = statusFilter === 'done' ? dones : (statusFilter === 'todo' ? todos : [...todos, ...dones])

        const doneScores = merged.filter((m: any) => m.done && m.score !== null).map((m: any) => m.score)
        const total = ordered.length
        const totalPages = Math.max(1, Math.ceil(total / pageSize))
        const safePage = Math.min(page, totalPages)
        return jsonResponse({
          items: ordered.slice((safePage - 1) * pageSize, safePage * pageSize),
          total,
          page: safePage,
          pageSize,
          totalPages,
          stats: {
            total: merged.length,
            done: merged.filter((m: any) => m.done).length,
            todo: merged.filter((m: any) => !m.done).length,
            avgScore: doneScores.length > 0 ? Math.round((doneScores.reduce((s: number, v: number) => s + v, 0) / doneScores.length) * 100) / 100 : null
          }
        })
      }

      if (todoOnly && user.role === 'STUDENT') {
        if (!user.classIds || user.classIds.length === 0) {
          return jsonResponse([])
        }

        // Fetch all published homeworks and student submissions in parallel
        const [hwRes, subRes] = await Promise.all([
          serviceRoleClient
            .from('homeworks')
            .select(`
              id,
              title,
              duration_minutes,
              deadline,
              max_attempts,
              type,
              pdf_path,
              created_at,
              homework_targets (student_id),
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
            .order('created_at', { ascending: false }),
          serviceRoleClient
            .from('submissions')
            .select('homework_id')
            .eq('student_id', user.id)
            .eq('status', 'SUBMITTED')
        ])

        if (hwRes.error) return errorResponse(hwRes.error.message, 500)
        if (subRes.error) return errorResponse(subRes.error.message, 500)

        // Bài giao riêng: chỉ hiện khi mình nằm trong danh sách target
        const homeworks = (hwRes.data || []).filter((hw: any) => {
          const targets = (hw.homework_targets || []) as Array<{ student_id: string }>
          return targets.length === 0 || targets.some((t) => t.student_id === user.id)
        })
        const submissions = subRes.data || []

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
            // Học sinh tuyệt đối không thấy PDF của BÀI THI ngay từ danh sách việc cần làm.
            pdfPath: hw.type === 'EXAM' ? '' : hw.pdf_path,
            createdAt: hw.created_at,
            classId: classInfo?.id || null,
            className: classInfo?.name || 'Lớp học'
          }
        })

        return jsonResponse(formatted)
      }

      // Parameters for Querying, Filtering & Pagination
      const classId = url.searchParams.get('classId')
      const includeProgress = url.searchParams.get('includeProgress') === 'true'
      if (includeProgress && (!classId || user.role !== 'ADMIN')) {
        return errorResponse('Chỉ quản trị viên được xem tiến độ nộp bài theo lớp', 403)
      }
      const chapterId = url.searchParams.get('chapterId')
      const lessonId = url.searchParams.get('lessonId')
      const type = url.searchParams.get('type')
      const search = url.searchParams.get('search')
      const sortBy = url.searchParams.get('sortBy') || 'newest'
      const pageParam = url.searchParams.get('page')
      const pageSizeParam = url.searchParams.get('pageSize') || url.searchParams.get('limit')
      const isPaginated = url.searchParams.get('paginate') === 'true' || !!pageParam || !!pageSizeParam
      const includeStats = url.searchParams.get('includeStats') === 'true' || isPaginated

      const page = Math.max(1, parseInt(pageParam || '1', 10))
      const pageSize = Math.max(1, Math.min(100, parseInt(pageSizeParam || '10', 10)))

      const needsInnerLesson = !!classId || !!chapterId
      const selectClause = `
        id,
        lesson_id,
        source_homework_id,
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
        homework_targets (student_id),
        lessons${needsInnerLesson ? '!inner' : ''} (
          id,
          title,
          chapter_id,
          chapters${classId ? '!inner' : ''} (
            id,
            title,
            class_id,
            classes (
              id,
              name
            )
          )
        )
      `

      let query = serviceRoleClient
        .from('homeworks')
        .select(selectClause, { count: 'exact' })

      if (lessonId) {
        query = query.eq('lesson_id', lessonId)
      } else if (chapterId) {
        query = query.eq('lessons.chapter_id', chapterId)
      } else if (classId) {
        query = query.eq('lessons.chapters.class_id', classId)
      }

      if (type) {
        query = query.eq('type', type)
      }

      if (search && search.trim()) {
        const cleanSearch = search.trim()
        query = query.ilike('title', `%${cleanSearch}%`)
      }

      // Sort
      switch (sortBy) {
        case 'oldest':
          query = query.order('created_at', { ascending: true })
          break
        case 'title-asc':
          query = query.order('title', { ascending: true })
          break
        case 'title-desc':
          query = query.order('title', { ascending: false })
          break
        case 'duration-desc':
          query = query.order('duration_minutes', { ascending: false })
          break
        case 'duration-asc':
          query = query.order('duration_minutes', { ascending: true })
          break
        case 'newest':
        default:
          query = query.order('created_at', { ascending: false })
          break
      }

      if (isPaginated) {
        const from = (page - 1) * pageSize
        const to = from + pageSize - 1
        query = query.range(from, to)
      }

      // Stats promise executed concurrently
      let statsPromise: Promise<{ total: number; practiceCount: number; examCount: number; classesCount: number } | null> = Promise.resolve(null)
      if (includeStats) {
        statsPromise = (async () => {
          try {
            const { data: allHws } = await serviceRoleClient
              .from('homeworks')
              .select('id, type, lessons(chapters(class_id))')

            const list = allHws || []
            const total = list.length
            const practiceCount = list.filter((h: any) => (h.type || 'PRACTICE') === 'PRACTICE').length
            const examCount = list.filter((h: any) => h.type === 'EXAM').length
            const classIdSet = new Set<string>()
            list.forEach((h: any) => {
              const cId = h.lessons?.chapters?.class_id
              if (cId) classIdSet.add(cId)
            })
            return {
              total,
              practiceCount,
              examCount,
              classesCount: classIdSet.size
            }
          } catch (_) {
            return null
          }
        })()
      }

      const [{ data: homeworks, count, error }, stats] = await Promise.all([
        query,
        statsPromise
      ])

      if (error) return errorResponse(error.message, 500)

      let classProgress: Map<string, { submittedCount: number; assignedCount: number }> | null = null
      if (includeProgress) {
        try {
          classProgress = await loadClassHomeworkProgress(serviceRoleClient, classId!, (homeworks || []).map((hw: any) => hw.id))
        } catch (progressError) {
          return errorResponse(progressError instanceof Error ? progressError.message : 'Không tải được tiến độ nộp bài', 500)
        }
      }

      const formatted = (homeworks || []).map((hw: any) => {
        const lessonInfo = hw.lessons
        const chapterInfo = lessonInfo?.chapters
        const classInfo = chapterInfo?.classes
        const targetIds = ((hw.homework_targets || []) as Array<{ student_id: string }>).map((t) => t.student_id)

        return {
          id: hw.id,
          lessonId: hw.lesson_id,
          sourceHomeworkId: hw.source_homework_id || null,
          title: hw.title,
          pdfPath: hw.pdf_path,
          durationMinutes: hw.duration_minutes !== undefined ? hw.duration_minutes : 45,
          passScore: hw.pass_score !== undefined ? hw.pass_score : 5.0,
          maxScore: hw.max_score !== undefined ? hw.max_score : 10.0,
          isPublished: hw.is_published,
          createdAt: hw.created_at,
          deadline: hw.deadline,
          maxAttempts: hw.max_attempts,
          type: hw.type || 'PRACTICE',
          maxViolations: hw.max_violations,
          showSolutions: hw.show_solutions !== false,
          lessonTitle: lessonInfo?.title || '',
          chapterId: chapterInfo?.id || lessonInfo?.chapter_id || null,
          chapterTitle: chapterInfo?.title || '',
          classId: classInfo?.id || chapterInfo?.class_id || null,
          className: classInfo?.name || '',
          assignedStudentIds: targetIds,
          targetCount: targetIds.length,
          ...(classProgress ? { progress: classProgress.get(hw.id) || { submittedCount: 0, assignedCount: 0 } } : {})
        }
      })

      if (!isPaginated) {
        return jsonResponse(formatted)
      }

      const total = count !== null && count !== undefined ? count : formatted.length
      const totalPages = Math.max(1, Math.ceil(total / pageSize))

      return jsonResponse({
        items: formatted,
        total,
        page,
        pageSize,
        totalPages,
        stats: stats || {
          total,
          practiceCount: formatted.filter((h: any) => h.type === 'PRACTICE').length,
          examCount: formatted.filter((h: any) => h.type === 'EXAM').length,
          classesCount: 0
        }
      })
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
        showSolutions,
        assignedStudentIds,
      } = validation.data

      // Automatically enforce max_attempts = 1 if it's an EXAM
      const finalMaxAttempts = type === 'EXAM' ? 1 : (maxAttempts || null);
      const finalMaxViolations = maxViolations || 3;

      // Kick off lesson metadata fetch in parallel with homework creation
      const lessonPromise = serviceRoleClient
        .from('lessons')
        .select('id, title, chapter_id, chapters(id, title, class_id, classes(id, name, grade_block))')
        .eq('id', lessonId)
        .single()

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
          show_solutions: showSolutions !== false,
        })
        .select()
        .single()

      if (homeworkError || !homework) {
        return errorResponse(`Failed to create homework: ${homeworkError?.message}`, 500)
      }

      // Giao riêng cho từng học sinh (không chọn = bài chung cả lớp)
      const targetIds = (assignedStudentIds || []).filter(Boolean)
      if (targetIds.length > 0) {
        const { error: targetErr } = await serviceRoleClient
          .from('homework_targets')
          .insert(targetIds.map((sid: string) => ({ homework_id: homework.id, student_id: sid })))
        if (targetErr) {
          await serviceRoleClient.from('homeworks').delete().eq('id', homework.id)
          return errorResponse(`Failed to assign students: ${targetErr.message}`, 500)
        }
      }

      // 1. Bulk insert questions
      // Sanitize question numbers: ensure no duplicate question_number exists (enforces uq_homework_question_num)
      const seenQNums = new Set<number>()
      let hasDuplicateOrInvalidQNums = false
      for (const q of questions) {
        const num = Number(q.questionNumber)
        if (!Number.isInteger(num) || num < 1 || seenQNums.has(num)) {
          hasDuplicateOrInvalidQNums = true
          break
        }
        seenQNums.add(num)
      }

      if (hasDuplicateOrInvalidQNums) {
        questions.forEach((q: any, idx: number) => {
          q.questionNumber = idx + 1
        })
      }

      const parsedPrompts = questions.map((q: any) => {
        let p: any = null
        if (typeof q.prompt === 'object' && q.prompt !== null) p = q.prompt
        else if (typeof q.prompt === 'string') {
          try { p = JSON.parse(q.prompt) } catch (_) {}
        }
        return p || {}
      })

      const questionsPayload = questions.map((q: any, idx: number) => {
        const p = parsedPrompts[idx] || {}
        const isTf = q.questionType === 'TRUE_FALSE'
        const diff = q.difficulty || p.difficulty || 'THONG_HIEU'

        let promptToSave = typeof q.prompt === 'string' ? q.prompt : JSON.stringify(q.prompt || {})
        try {
          const parsed = JSON.parse(promptToSave)
          if (!parsed.difficulty) {
            parsed.difficulty = diff
            promptToSave = JSON.stringify(parsed)
          }
        } catch (_) {}

        return {
          homework_id: homework.id,
          question_number: q.questionNumber || (idx + 1),
          question_type: q.questionType,
          prompt: promptToSave,
          content: q.content || p.text || (typeof q.prompt === 'string' && !q.prompt.startsWith('{') ? q.prompt : null),
          options: q.options || (isTf ? null : (p.options || null)),
          statements: q.statements || (isTf ? (p.statements || p.options || null) : null),
          part_title: q.partTitle || p.partTitle || null,
          points: q.points,
        }
      })

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
      const answersPayload = questions.map((q: any, idx: number) => {
        const qId = qMap.get(q.questionNumber) || insertedQuestions[idx]?.id
        const p = parsedPrompts[idx] || {}
        return {
          question_id: qId,
          mc_answer: q.questionType === 'MULTIPLE_CHOICE' ? (q.mcAnswer || p.mcAnswer || null) : null,
          tf_answers: q.questionType === 'TRUE_FALSE' ? (q.tfAnswers || p.tfAnswers || null) : null,
          sa_answer: q.questionType === 'SHORT_ANSWER' ? ((q.saAnswer === '' || q.saAnswer === null || q.saAnswer === undefined) ? (p.saAnswer !== undefined ? String(p.saAnswer) : null) : String(q.saAnswer)) : null,
          sa_tolerance: q.questionType === 'SHORT_ANSWER' ? (q.saTolerance ?? (p.saTolerance ?? 0)) : 0,
          explanation: q.explanation || p.explanation || null,
        }
      }).filter((a: any) => !!a.question_id)

      const { error: ansError } = await serviceRoleClient
        .from('question_answers')
        .insert(answersPayload)

      if (ansError) {
        await serviceRoleClient.from('homeworks').delete().eq('id', homework.id)
        return errorResponse(`Failed to insert answer keys: ${ansError.message}`, 500)
      }

      // Đồng bộ câu hỏi Markdown interactive sang Ngân hàng câu hỏi Constant.
      // Await để trả summary thật (created/skipped/unsynced), không fire-and-forget và
      // không làm hỏng kết quả lưu bài tập nếu đồng bộ thất bại.
      // CHỈ chạy cho Markdown interactive; PDF/manual caller cũ không gửi source phải
      // nhận autoBankSync = null, kể cả khi lookup bài học động lỗi.
      let autoBankSync: any = null
      const interactiveQuestions = questions.filter((q: any) => q.source === 'MARKDOWN_INTERACTIVE')
      if (interactiveQuestions.length > 0) {
        try {
          const { data: lessonData } = await lessonPromise
          const syncAdapter = createSupabaseQuestionBankSyncAdapter(serviceRoleClient)
          autoBankSync = await syncHomeworkQuestionsToConstantBank(syncAdapter, {
            questions,
            dynamicLesson: lessonData as any,
            homeworkTitle: title,
          })
        } catch (syncErr) {
          autoBankSync = {
            enabled: true,
            source: 'MARKDOWN_INTERACTIVE',
            totalQuestions: interactiveQuestions.length,
            createdCount: 0,
            skippedDuplicateCount: 0,
            unsyncedCount: 0,
            failedCount: interactiveQuestions.length,
            fallbackTypeCount: 0,
            reasons: [{
              questionNumber: null,
              reason: `Không đồng bộ được Ngân hàng câu hỏi: ${syncErr instanceof Error ? syncErr.message : String(syncErr)}`,
            }],
            target: null,
          }
        }
      }

      scheduleHomeworkTelegram(serviceRoleClient, homework)
      return jsonResponse(
        {
          homework,
          autoBankSync,
          questionsCount: insertedQuestions.length,
          questions: insertedQuestions,
        },
        201
      )
    }

    // POST: Assign/Clone homework to other classes
    if (req.method === 'POST' && action === 'assign-to-class') {
      const body = await req.json()
      const {
        sourceHomeworkId,
        targetClassIds,
        targetLessonId,
        smartMapping = true,
        customSettings = {}
      } = body

      if (!sourceHomeworkId) {
        return errorResponse('Missing required sourceHomeworkId', 400)
      }
      if (!targetClassIds || !Array.isArray(targetClassIds) || targetClassIds.length === 0) {
        return errorResponse('Missing or empty targetClassIds', 400)
      }

      // 1. Fetch Source Homework + Questions + Answer Keys + Source Chapter/Lesson info
      const [hwRes, qRes] = await Promise.all([
        serviceRoleClient
          .from('homeworks')
          .select(`
            *,
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
                  name,
                  grade_block
                )
              )
            )
          `)
          .eq('id', sourceHomeworkId)
          .single(),
        serviceRoleClient
          .from('questions')
          .select(`
            *,
            question_answers (*)
          `)
          .eq('homework_id', sourceHomeworkId)
          .order('question_number', { ascending: true })
      ])

      if (hwRes.error || !hwRes.data) {
        return errorResponse(`Source homework not found: ${hwRes.error?.message}`, 404)
      }
      if (qRes.error) return errorResponse('Failed to load source questions', 500)

      const sourceHw = hwRes.data
      const sourceQuestions = qRes.data || []
      const sourceLesson = sourceHw.lessons
      const sourceChapter = sourceLesson?.chapters
      const sourceChapterTitle = sourceChapter?.title || 'Chương 1'
      const sourceLessonTitle = sourceLesson?.title || 'Bài 1'

      const createdHomeworks = []
      const errors = []

      // 2. Xử lý từng lớp đích. Các lớp độc lập nhau nên chạy song song có giới hạn;
      // trong một lớp, chapter -> lesson -> homework -> questions -> answers vẫn phải tuần tự.
      const needsLessonResolution = !targetLessonId || targetClassIds.length > 1
      const chapterByClass = new Map<string, { id: string; title: string }>()
      if (needsLessonResolution) {
        // Gom lookup chapter của tất cả lớp đích vào 1 query thay vì 1 query/lớp
        const { data: prefetchedChapters } = await serviceRoleClient
          .from('chapters')
          .select('id, title, class_id')
          .in('class_id', targetClassIds)
          .ilike('title', sourceChapterTitle.trim())
        for (const ch of prefetchedChapters || []) {
          if (!chapterByClass.has(ch.class_id)) chapterByClass.set(ch.class_id, { id: ch.id, title: ch.title })
        }
      }

      const processTargetClass = async (targetClassId: string) => {
          let resolvedLessonId = targetLessonId

          // If targetLessonId is not provided or multiple target classes, resolve lesson for this class
          if (!resolvedLessonId || targetClassIds.length > 1) {
            // Chapter đã được lookup sẵn cho toàn bộ lớp đích
            const prefetchedChapter = chapterByClass.get(targetClassId)

            let chapterId: string
            if (prefetchedChapter) {
              chapterId = prefetchedChapter.id
            } else {
              // Create new chapter in target class
              const { data: newCh, error: chErr } = await serviceRoleClient
                .from('chapters')
                .insert({
                  class_id: targetClassId,
                  title: sourceChapterTitle,
                  order_index: 0
                })
                .select()
                .single()

              if (chErr || !newCh) {
                throw new Error(`Failed to create chapter in class ${targetClassId}: ${chErr?.message}`)
              }
              chapterId = newCh.id
            }

            // Check if there is already a lesson with the same title in that chapter
            const { data: existingLessons } = await serviceRoleClient
              .from('lessons')
              .select('id, title')
              .eq('chapter_id', chapterId)
              .ilike('title', sourceLessonTitle.trim())
              .limit(1)

            if (existingLessons && existingLessons.length > 0) {
              resolvedLessonId = existingLessons[0].id
            } else {
              // Create new lesson
              const { data: newLes, error: lesErr } = await serviceRoleClient
                .from('lessons')
                .insert({
                  chapter_id: chapterId,
                  title: sourceLessonTitle,
                  order_index: 0
                })
                .select()
                .single()

              if (lesErr || !newLes) {
                throw new Error(`Failed to create lesson in class ${targetClassId}: ${lesErr?.message}`)
              }
              resolvedLessonId = newLes.id
            }
          }

          // 3. Create Homework in Target Class
          const newTitle = customSettings.title || sourceHw.title
          const newDeadline = customSettings.deadline !== undefined ? customSettings.deadline : sourceHw.deadline
          const newDuration = customSettings.durationMinutes !== undefined ? customSettings.durationMinutes : sourceHw.duration_minutes
          const newMaxAttempts = customSettings.maxAttempts !== undefined ? customSettings.maxAttempts : sourceHw.max_attempts
          const newMaxViolations = customSettings.maxViolations !== undefined ? customSettings.maxViolations : sourceHw.max_violations
          const newIsPublished = customSettings.isPublished !== undefined ? customSettings.isPublished : sourceHw.is_published
          const newShowSolutions = customSettings.showSolutions !== undefined ? customSettings.showSolutions : sourceHw.show_solutions

          const { data: newHw, error: newHwErr } = await serviceRoleClient
            .from('homeworks')
            .insert({
              lesson_id: resolvedLessonId,
              source_homework_id: sourceHomeworkId,
              title: newTitle,
              pdf_path: sourceHw.pdf_path,
              duration_minutes: newDuration,
              pass_score: sourceHw.pass_score,
              max_score: sourceHw.max_score,
              is_published: newIsPublished,
              deadline: newDeadline,
              max_attempts: newMaxAttempts,
              type: sourceHw.type || 'PRACTICE',
              max_violations: newMaxViolations,
              show_solutions: newShowSolutions
            })
            .select()
            .single()

          if (newHwErr || !newHw) {
            throw new Error(`Failed to create cloned homework in class ${targetClassId}: ${newHwErr?.message}`)
          }

          // 4. Bulk Insert Questions for new Homework
          if (sourceQuestions.length > 0) {
            const questionsPayload = sourceQuestions.map((q: any) => ({
              homework_id: newHw.id,
              question_number: q.question_number,
              question_type: q.question_type,
              prompt: q.prompt,
              content: q.content,
              options: q.options,
              statements: q.statements,
              part_title: q.part_title,
              points: q.points,
              question_bank_id: q.question_bank_id || null
            }))

            const { data: insertedQuestions, error: insQErr } = await serviceRoleClient
              .from('questions')
              .insert(questionsPayload)
              .select()

            if (insQErr || !insertedQuestions) {
              // Rollback created homework
              await serviceRoleClient.from('homeworks').delete().eq('id', newHw.id)
              throw new Error(`Failed to copy questions to class ${targetClassId}: ${insQErr?.message}`)
            }

            // 5. Bulk Insert Question Answers
            const qMap = new Map(insertedQuestions.map((iq: any) => [iq.question_number, iq.id]))
            const answersPayload: any[] = []

            for (const sq of sourceQuestions) {
              const newQId = qMap.get(sq.question_number)
              const sqAnswers = Array.isArray(sq.question_answers) ? sq.question_answers[0] : sq.question_answers
              if (newQId && sqAnswers) {
                answersPayload.push({
                  question_id: newQId,
                  mc_answer: sqAnswers.mc_answer,
                  tf_answers: sqAnswers.tf_answers,
                  sa_answer: sqAnswers.sa_answer,
                  sa_tolerance: sqAnswers.sa_tolerance,
                  explanation: sqAnswers.explanation
                })
              }
            }

            if (answersPayload.length > 0) {
              const { error: insAnsErr } = await serviceRoleClient
                .from('question_answers')
                .insert(answersPayload)

              if (insAnsErr) {
                await serviceRoleClient.from('homeworks').delete().eq('id', newHw.id)
                throw new Error(`Failed to copy answer keys to class ${targetClassId}`)
              }
            }

            // 6. Bump Question Bank Usage Log if questions are linked to question_bank
            const qbIds = sourceQuestions.map((q: any) => q.question_bank_id).filter(Boolean)
            if (qbIds.length > 0) {
              try {
                await serviceRoleClient.rpc('fn_bump_qb_usage_with_log', {
                  p_question_ids: qbIds,
                  p_class_id: targetClassId,
                  p_homework_id: newHw.id
                })
              } catch (logErr) {
                console.warn(`[assign-to-class] Failed to log question bank usage:`, logErr)
              }
            }
          }

          scheduleHomeworkTelegram(serviceRoleClient, newHw)
          return {
            classId: targetClassId,
            homeworkId: newHw.id,
            lessonId: resolvedLessonId,
            title: newHw.title
          }
      }

      const ASSIGN_CLASS_CONCURRENCY = 3
      for (let i = 0; i < targetClassIds.length; i += ASSIGN_CLASS_CONCURRENCY) {
        const chunk = targetClassIds.slice(i, i + ASSIGN_CLASS_CONCURRENCY)
        const chunkResults = await Promise.all(chunk.map(async (targetClassId) => {
          try {
            const created = await processTargetClass(targetClassId)
            return { created, error: null }
          } catch (clsErr: any) {
            return { created: null, error: { classId: targetClassId, error: clsErr.message || 'Unknown error' } }
          }
        }))
        for (const result of chunkResults) {
          if (result.created) createdHomeworks.push(result.created)
          else if (result.error) errors.push(result.error)
        }
      }

      if (createdHomeworks.length === 0 && errors.length > 0) {
        return errorResponse(`Failed to assign homework: ${errors[0].error}`, 500, { errors })
      }

      return jsonResponse({
        success: true,
        message: `Đã gán bài tập thành công cho ${createdHomeworks.length} lớp`,
        createdHomeworks,
        errors: errors.length > 0 ? errors : undefined
      })
    }

    // PUT / PATCH: Update Homework
    if (req.method === 'PUT' || req.method === 'PATCH' || action === 'update') {
      const body = await req.json()
      const validation = updateHomeworkSchema.safeParse(body)
      if (!validation.success) {
        return errorResponse('Validation error', 400, validation.error.format())
      }

      const { homeworkId, lessonId, title, pdfPath, durationMinutes, passScore, maxScore, isPublished, questions, deadline, maxAttempts, type, maxViolations, showSolutions, assignedStudentIds } = validation.data
      const { data: previousHomework, error: previousError } = await serviceRoleClient
        .from('homeworks').select('is_published, deadline, updated_at').eq('id', homeworkId).single()
      if (previousError || !previousHomework) return errorResponse('Homework not found', 404)
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
      if (showSolutions !== undefined) updateData.show_solutions = showSolutions
      
      // Enforce max_attempts and max_violations if EXAM
      if (updateData.type === 'EXAM' || (type === undefined && (maxAttempts !== undefined || maxViolations !== undefined))) {
         if (updateData.type === 'EXAM') {
            updateData.max_attempts = 1;
            if (updateData.max_violations === undefined || updateData.max_violations === null) {
              updateData.max_violations = 3;
            }
         }
      }

      // Optimistic guard: concurrent retries must not both announce the same transition.
      let updateQuery = serviceRoleClient
        .from('homeworks')
        .update(updateData)
        .eq('id', homeworkId)
        .eq('is_published', previousHomework.is_published)
      updateQuery = previousHomework.deadline == null
        ? updateQuery.is('deadline', null)
        : updateQuery.eq('deadline', previousHomework.deadline)
      updateQuery = previousHomework.updated_at == null
        ? updateQuery.is('updated_at', null)
        : updateQuery.eq('updated_at', previousHomework.updated_at)
      const { data: updatedHomework, error } = await updateQuery
        .select()
        .single()

      if (error || !updatedHomework) {
        const conflict = error?.code === 'PGRST116'
        return errorResponse(conflict ? 'Bài tập đã thay đổi, vui lòng tải lại' : (error?.message || 'Failed to update homework'), conflict ? 409 : 500)
      }

      // Handle Questions and Answer Keys update in-place to preserve submission_answers
      if (questions) {
        // Sanitize incoming question numbers if duplicates exist
        const seenUpdateQNums = new Set<number>()
        let hasDuplicateUpdateQNums = false
        for (const q of questions) {
          const num = Number(q.questionNumber)
          if (!Number.isInteger(num) || num < 1 || seenUpdateQNums.has(num)) {
            hasDuplicateUpdateQNums = true
            break
          }
          seenUpdateQNums.add(num)
        }
        if (hasDuplicateUpdateQNums) {
          questions.forEach((q: any, idx: number) => {
            q.questionNumber = idx + 1
          })
        }

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
              prompt: q.prompt || '',
              content: q.content || null,
              options: q.options || null,
              statements: q.statements || null,
              part_title: q.partTitle || null,
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
          const updatePayload = toUpdate.map((q: any) => ({
            id: existingMap.get(q.questionNumber),
            homework_id: homeworkId,
            question_number: q.questionNumber,
            question_type: q.questionType,
            prompt: q.prompt || '',
            content: q.content || null,
            options: q.options || null,
            statements: q.statements || null,
            part_title: q.partTitle || null,
            points: q.points,
          }))

          const { error: updateErr } = await serviceRoleClient
            .from('questions')
            .upsert(updatePayload, { onConflict: 'id' })

          if (updateErr) {
            return errorResponse(`Failed to update questions: ${updateErr.message}`, 500)
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
            explanation: q.explanation || null,
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

      // Đồng bộ câu hỏi interactive sang Ngân hàng câu hỏi Constant (idempotent theo content_hash).
      // Chỉ chạy khi caller gửi source Markdown interactive; không tạo bản trùng khi sửa bài.
      let autoBankSync: any = null
      const interactiveQuestions = (questions || []).filter(
        (q: any) => q.source === 'MARKDOWN_INTERACTIVE'
      )
      if (interactiveQuestions.length > 0) {
        try {
          const syncLessonId = (updatedHomework as any)?.lesson_id || lessonId
          const { data: syncLessonData } = await serviceRoleClient
            .from('lessons')
            .select('id, title, chapter_id, chapters(id, title, class_id, classes(id, name, grade_block))')
            .eq('id', syncLessonId)
            .single()
          const syncAdapter = createSupabaseQuestionBankSyncAdapter(serviceRoleClient)
          autoBankSync = await syncHomeworkQuestionsToConstantBank(syncAdapter, {
            questions: questions as any,
            dynamicLesson: syncLessonData as any,
            homeworkTitle: title || (updatedHomework as any)?.title || '',
          })
        } catch (syncErr) {
          autoBankSync = {
            enabled: true,
            source: 'MARKDOWN_INTERACTIVE',
            totalQuestions: interactiveQuestions.length,
            createdCount: 0,
            skippedDuplicateCount: 0,
            unsyncedCount: 0,
            failedCount: interactiveQuestions.length,
            fallbackTypeCount: 0,
            reasons: [{
              questionNumber: null,
              reason: `Không đồng bộ được Ngân hàng câu hỏi: ${syncErr instanceof Error ? syncErr.message : String(syncErr)}`,
            }],
            target: null,
          }
        }
      }

      // Đồng bộ danh sách giao riêng (có truyền = ghi đè; không truyền = giữ nguyên)
      if (assignedStudentIds !== undefined) {
        const { error: delTargetErr } = await serviceRoleClient
          .from('homework_targets')
          .delete()
          .eq('homework_id', homeworkId)
        if (delTargetErr) return errorResponse(delTargetErr.message, 500)
        const targetIds = (assignedStudentIds || []).filter(Boolean)
        if (targetIds.length > 0) {
          const { error: insTargetErr } = await serviceRoleClient
            .from('homework_targets')
            .insert(targetIds.map((sid: string) => ({ homework_id: homeworkId, student_id: sid })))
          if (insTargetErr) return errorResponse(insTargetErr.message, 500)
        }
      }

      scheduleHomeworkTelegram(serviceRoleClient, updatedHomework, previousHomework)
      return jsonResponse({
        homework: updatedHomework,
        autoBankSync,
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
  // 1. Fetch homework max_score
  const { data: homework } = await serviceRoleClient
    .from('homeworks')
    .select('id, max_score')
    .eq('id', homeworkId)
    .single()

  const targetScale = homework?.max_score || 10.0

  // 2. Fetch all questions and answer keys for this homework
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

  // 3. Fetch all submissions for this homework
  const { data: submissions, error: sErr } = await serviceRoleClient
    .from('submissions')
    .select('id')
    .eq('homework_id', homeworkId)

  if (sErr || !submissions || submissions.length === 0) return

  // Index questions by id
  const questionMap = new Map()
  for (const q of questions) {
    const qaRaw = q.question_answers
    const qa = Array.isArray(qaRaw) ? qaRaw[0] : qaRaw
    const points = q.points !== undefined && q.points !== null && !isNaN(Number(q.points))
      ? Number(q.points)
      : (q.question_type === 'TRUE_FALSE' ? 1.0 : (q.question_type === 'SHORT_ANSWER' ? 0.5 : 0.25))

    questionMap.set(q.id, {
      questionId: q.id,
      questionType: q.question_type,
      points,
      mcAnswer: qa?.mc_answer || null,
      tfAnswers: qa?.tf_answers || null,
      saAnswer: qa?.sa_answer !== null && qa?.sa_answer !== undefined ? qa.sa_answer : null,
      saTolerance: qa?.sa_tolerance !== null && qa?.sa_tolerance !== undefined ? Number(qa.sa_tolerance) : 0,
    })
  }

  // 4. Fetch ALL answers for all submissions of this homework in ONE single query!
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
    const gradeInputs: QuestionGradeInput[] = []

    for (const q of questions) {
      const qInfo = questionMap.get(q.id)
      const studentAns = subAnswers.find((a: any) => a.question_id === q.id)
      if (qInfo) {
        gradeInputs.push({
          ...qInfo,
          givenAnswer: studentAns?.given_answer || { type: qInfo.questionType, value: null }
        })
      }
    }

    const examGrading = gradeExam(gradeInputs, { targetScale, roundingStep: 0.01 })

    for (let i = 0; i < gradeInputs.length; i++) {
      const gInput = gradeInputs[i]
      const gRes = examGrading.questionResults[i]
      const studentAns = subAnswers.find((a: any) => a.question_id === gInput.questionId)
      if (studentAns) {
        allUpdatedAnswers.push({
          id: studentAns.id,
          submission_id: sub.id,
          question_id: gInput.questionId,
          given_answer: studentAns.given_answer,
          is_correct: gRes.isCorrect,
          score_earned: gRes.scoreEarned,
        })
      }
    }

    submissionsToUpdate.push({
      id: sub.id,
      total_score: examGrading.totalScore,
      correct_count: examGrading.correctCount,
      wrong_count: examGrading.wrongCount,
    })
  }

  // 5. Batch update submission_answers using upsert in chunks of 200
  if (allUpdatedAnswers.length > 0) {
    const chunkSize = 200
    for (let i = 0; i < allUpdatedAnswers.length; i += chunkSize) {
      const chunk = allUpdatedAnswers.slice(i, i + chunkSize)
      await serviceRoleClient
        .from('submission_answers')
        .upsert(chunk, { onConflict: 'id' })
    }
  }

  // 6. Parallel update submissions
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
