import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { requireAdmin, requireAuth } from '../../shared/auth-middleware.ts'
import { createServiceRoleClient } from '../../shared/supabase-client.ts'
import { handleCors, jsonResponse, errorResponse } from '../../shared/response-helper.ts'
import {
  createLessonSchema,
  updateLessonSchema,
  deleteLessonSchema,
} from '../../shared/validators.ts'

serve(async (req: Request) => {
  const corsRes = handleCors(req)
  if (corsRes) return corsRes

  try {
    const url = new URL(req.url)
    const action = url.searchParams.get('action')
    const isTrialQuery = url.searchParams.get('isTrial') === 'true'

    // Public GET: List trial lessons for prospective students without authentication
    if (req.method === 'GET' && isTrialQuery) {
      const serviceRoleClient = createServiceRoleClient()

      const { data: trialLessons, error } = await serviceRoleClient
        .from('lessons')
        .select(`
          id,
          chapter_id,
          title,
          order_index,
          content,
          video_url,
          theory_files,
          is_trial,
          created_at,
          chapters (
            id,
            title,
            class_id,
            classes (
              id,
              name
            )
          ),
          homeworks (
            id,
            title,
            pdf_path,
            duration_minutes,
            pass_score,
            max_score,
            is_published,
            type
          )
        `)
        .eq('is_trial', true)
        .order('order_index', { ascending: true })

      if (error) return errorResponse(error.message, 500)

      const formatted = (trialLessons || []).map((l: any) => {
        const ch = l.chapters
        const cls = ch?.classes
        const publishedHws = (l.homeworks || []).filter((h: any) => h.is_published !== false)
        return {
          id: l.id,
          title: l.title,
          orderIndex: l.order_index,
          content: l.content,
          videoUrl: l.video_url,
          theoryFiles: l.theory_files || [],
          isTrial: true,
          createdAt: l.created_at,
          chapterId: ch?.id || l.chapter_id,
          chapterTitle: ch?.title || '',
          classId: cls?.id || ch?.class_id || null,
          className: cls?.name || '',
          homeworks: publishedHws.map((h: any) => ({
            id: h.id,
            title: h.title,
            pdfPath: h.pdf_path,
            durationMinutes: h.duration_minutes,
            passScore: h.pass_score,
            maxScore: h.max_score,
            type: h.type,
          }))
        }
      })

      return jsonResponse(formatted)
    }

    const { user, serviceRoleClient } = await requireAuth(req)

    // GET: List or search lessons (class-wide search or chapterId filter)
    if (req.method === 'GET') {
      const classId = url.searchParams.get('classId')
      const chapterId = url.searchParams.get('chapterId')
      const lessonId = url.searchParams.get('lessonId')
      const q = (url.searchParams.get('q') || url.searchParams.get('query') || '').trim()

      // Case 0: Lấy chi tiết 1 bài học theo lessonId
      if (lessonId) {
        const { data: lesson, error: lErr } = await serviceRoleClient
          .from('lessons')
          .select('*')
          .eq('id', lessonId)
          .maybeSingle()
        if (lErr) return errorResponse(lErr.message, 500)
        if (!lesson) return errorResponse('Lesson not found', 404)
        return jsonResponse(lesson)
      }

      // Case 1: Tìm kiếm bài học toàn lớp hoặc lấy tổng quan curriculum (hỗ trợ filter chapterId tùy chọn)
      if (action === 'search' || (classId && !chapterId) || (classId && (url.searchParams.has('page') || url.searchParams.has('pageSize') || url.searchParams.has('q')))) {
        if (!classId) {
          return errorResponse('classId is required for class-wide lesson search', 400)
        }

        // Student RLS: Chỉ được tìm kiếm/xem bài học trong lớp đã đăng ký
        if (user.role === 'STUDENT' && (!user.classIds || !user.classIds.includes(classId))) {
          return errorResponse('Forbidden: You can only view lessons under your enrolled class', 403)
        }

        let chQuery = serviceRoleClient
          .from('chapters')
          .select(`
            id,
            title,
            order_index,
            created_at,
            lessons (
              id,
              chapter_id,
              title,
              order_index,
              content,
              video_url,
              theory_files,
              is_trial,
              created_at,
              homeworks (
                id,
                title,
                is_published,
                duration_minutes,
                pass_score,
                max_score,
                deadline,
                max_attempts,
                type,
                created_at
              )
            )
          `)
          .eq('class_id', classId)
          .order('order_index', { ascending: true })

        const { data: chapters, error: chErr } = await chQuery

        if (chErr) return errorResponse(chErr.message, 500)

        const normalize = (s: string) => {
          if (!s) return ''
          return String(s)
            .normalize('NFD')
            .replace(/[\u0300-\u036f]/g, '')
            .replace(/[đ]/g, 'd')
            .replace(/[Đ]/g, 'D')
            .toLowerCase()
            .trim()
        }

        const results: any[] = []
        let totalLessonsCount = 0

        for (const ch of (chapters || [])) {
          const sortedLessons = (ch.lessons || []).slice().sort((a: any, b: any) => (a.order_index || 0) - (b.order_index || 0))
          totalLessonsCount += sortedLessons.length

          // Nếu có filter chapterId, chỉ lấy bài học thuộc chương đó
          if (chapterId && chapterId !== 'all' && ch.id !== chapterId) {
            continue
          }

          for (const l of sortedLessons) {
            let hws = l.homeworks || []
            if (user.role === 'STUDENT') {
              hws = hws.filter((h: any) => h.is_published !== false)
            }

            results.push({
              id: l.id,
              chapterId: ch.id,
              chapterTitle: ch.title,
              chapterOrderIndex: ch.order_index,
              code: String(l.order_index || ''),
              title: l.title,
              orderIndex: l.order_index,
              content: l.content || '',
              isTrial: Boolean(l.is_trial),
              hasVideo: Boolean(l.video_url),
              videoUrl: l.video_url || '',
              theoryFiles: l.theory_files || [],
              theoryFilesCount: Array.isArray(l.theory_files) ? l.theory_files.length : 0,
              homeworksCount: hws.length,
              homeworks: hws.map((h: any) => ({
                id: h.id,
                title: h.title,
                lessonId: l.id,
                pdfPath: h.pdf_path,
                durationMinutes: h.duration_minutes,
                passScore: h.pass_score,
                maxScore: h.max_score,
                deadline: h.deadline,
                maxAttempts: h.max_attempts,
                type: h.type,
                isPublished: h.is_published,
                createdAt: h.created_at
              })),
              createdAt: l.created_at
            })
          }
        }

        let filtered = results

        // 1. Filter theo từ khóa tìm kiếm (title, content, code, chapterTitle)
        if (q) {
          const normQ = normalize(q)
          filtered = results.filter((item: any) => {
            const matchTitle = normalize(item.title).includes(normQ)
            const matchContent = normalize(item.content).includes(normQ)
            const matchCode = normalize(item.code).includes(normQ)
            const matchChapter = normalize(item.chapterTitle).includes(normQ)
            return matchTitle || matchContent || matchCode || matchChapter
          })
        }

        // 2. Filter theo metadata (isTrial, hasVideo, hasTheory, hasHomework)
        const isTrialFilter = url.searchParams.get('isTrial')
        if (isTrialFilter === 'true') {
          filtered = filtered.filter((item: any) => item.isTrial)
        } else if (isTrialFilter === 'false') {
          filtered = filtered.filter((item: any) => !item.isTrial)
        }

        const hasVideoFilter = url.searchParams.get('hasVideo')
        if (hasVideoFilter === 'true') {
          filtered = filtered.filter((item: any) => item.hasVideo)
        } else if (hasVideoFilter === 'false') {
          filtered = filtered.filter((item: any) => !item.hasVideo)
        }

        const hasTheoryFilter = url.searchParams.get('hasTheory')
        if (hasTheoryFilter === 'true') {
          filtered = filtered.filter((item: any) => item.theoryFilesCount > 0)
        } else if (hasTheoryFilter === 'false') {
          filtered = filtered.filter((item: any) => item.theoryFilesCount === 0)
        }

        const hasHomeworkFilter = url.searchParams.get('hasHomework')
        if (hasHomeworkFilter === 'true') {
          filtered = filtered.filter((item: any) => item.homeworksCount > 0)
        } else if (hasHomeworkFilter === 'false') {
          filtered = filtered.filter((item: any) => item.homeworksCount === 0)
        }

        // 3. Sắp xếp kết quả stable
        const sort = url.searchParams.get('sort') || 'order'
        filtered.sort((a: any, b: any) => {
          if (sort === 'title-asc') {
            const c = (a.title || '').localeCompare(b.title || '', 'vi')
            if (c !== 0) return c
            return (a.orderIndex ?? 0) - (b.orderIndex ?? 0) || String(a.id || '').localeCompare(String(b.id || ''))
          }
          if (sort === 'title-desc') {
            const c = (b.title || '').localeCompare(a.title || '', 'vi')
            if (c !== 0) return c
            return (a.orderIndex ?? 0) - (b.orderIndex ?? 0) || String(a.id || '').localeCompare(String(b.id || ''))
          }
          if (sort === 'newest') {
            const diff = new Date(b.createdAt || 0).getTime() - new Date(a.createdAt || 0).getTime()
            if (diff !== 0) return diff
            return (b.orderIndex ?? 0) - (a.orderIndex ?? 0) || String(a.id || '').localeCompare(String(b.id || ''))
          }
          if (sort === 'order-desc') {
            const chDiff = (b.chapterOrderIndex ?? 0) - (a.chapterOrderIndex ?? 0)
            if (chDiff !== 0) return chDiff
            const lDiff = (b.orderIndex ?? 0) - (a.orderIndex ?? 0)
            if (lDiff !== 0) return lDiff
            return String(a.id || '').localeCompare(String(b.id || ''))
          }
          // Mặc định 'order' / 'order-asc': Chapter order index ASC, sau đó Lesson order index ASC
          const chDiff = (a.chapterOrderIndex ?? 0) - (b.chapterOrderIndex ?? 0)
          if (chDiff !== 0) return chDiff
          const lDiff = (a.orderIndex ?? 0) - (b.orderIndex ?? 0)
          if (lDiff !== 0) return lDiff
          return String(a.id || '').localeCompare(String(b.id || ''))
        })

        // 4. Server-side Pagination & Envelope
        const total = filtered.length
        const pageParam = url.searchParams.get('page')
        const pageSizeParam = url.searchParams.get('pageSize')
        const isPaged = pageParam !== null || pageSizeParam !== null
        const page = Math.max(1, parseInt(pageParam || '1', 10) || 1)
        const pageSize = Math.min(100, Math.max(1, parseInt(pageSizeParam || '15', 10) || 15))

        const pagedItems = isPaged ? filtered.slice((page - 1) * pageSize, page * pageSize) : filtered

        return jsonResponse({
          items: pagedItems,
          total,
          page: isPaged ? page : 1,
          pageSize: isPaged ? pageSize : (total || 15),
          results: pagedItems, // backward-compatible cho legacy callers đọc .results
          totalLessons: totalLessonsCount, // backward-compatible
          totalChapters: (chapters || []).length,
          classId,
          query: q
        })
      }

      // Case 2: Danh sách bài học theo chapterId (flow hiện tại)
      // Student RLS: Can only view lessons of chapters belonging to their enrolled class
      if (user.role === 'STUDENT' && chapterId) {
        const { data: chapter, error: chErr } = await serviceRoleClient
          .from('chapters')
          .select('class_id')
          .eq('id', chapterId)
          .single()

        if (chErr || !chapter || !user.classIds.includes(chapter.class_id)) {
          return errorResponse('Forbidden: You can only view lessons under your enrolled class', 403)
        }
      }

      let query = serviceRoleClient.from('lessons').select('*').order('order_index', { ascending: true })

      if (chapterId) {
        query = query.eq('chapter_id', chapterId)
      }

      const { data: lessons, error } = await query
      if (error) return errorResponse(error.message, 500)

      const pageParam = url.searchParams.get('page')
      const pageSizeParam = url.searchParams.get('pageSize')
      const format = url.searchParams.get('format')
      if (pageParam !== null || pageSizeParam !== null || format === 'envelope') {
        const list = Array.isArray(lessons) ? lessons : []
        const page = Math.max(1, parseInt(pageParam || '1', 10) || 1)
        const pageSize = Math.min(100, Math.max(1, parseInt(pageSizeParam || '15', 10) || 15))
        const total = list.length
        const items = list.slice((page - 1) * pageSize, page * pageSize)
        return jsonResponse({
          items,
          total,
          page,
          pageSize,
          results: items
        })
      }

      return jsonResponse(lessons)
    }

    // Role Guard: Write Operations (POST, PUT, DELETE) are Admin-only
    if (user.role !== 'ADMIN') {
      return errorResponse('Forbidden: Only admins can manage lessons', 403)
    }

    // POST: Create Lesson
    if (req.method === 'POST' && (!action || action === 'create')) {
      const body = await req.json()
      const validation = createLessonSchema.safeParse(body)
      if (!validation.success) {
        return errorResponse('Validation error', 400, validation.error.format())
      }

      const { chapterId, title, orderIndex, content, videoUrl, theoryFiles, isTrial } = validation.data

      const { data: lesson, error } = await serviceRoleClient
        .from('lessons')
        .insert({
          chapter_id: chapterId,
          title,
          order_index: orderIndex,
          content: content || null,
          video_url: videoUrl || null,
          theory_files: theoryFiles || [],
          is_trial: isTrial || false,
        })
        .select()
        .single()

      if (error) return errorResponse(error.message, 500)
      return jsonResponse(lesson, 201)
    }

    // PUT / PATCH: Update Lesson
    if (req.method === 'PUT' || req.method === 'PATCH' || action === 'update') {
      const body = await req.json()
      const validation = updateLessonSchema.safeParse(body)
      if (!validation.success) {
        return errorResponse('Validation error', 400, validation.error.format())
      }

      const { lessonId, title, orderIndex, content, videoUrl, theoryFiles, isTrial } = validation.data
      const updateData: Record<string, unknown> = { updated_at: new Date().toISOString() }
      if (title) updateData.title = title
      if (orderIndex !== undefined) updateData.order_index = orderIndex
      if (content !== undefined) updateData.content = content
      if (videoUrl !== undefined) updateData.video_url = videoUrl
      if (theoryFiles !== undefined) updateData.theory_files = theoryFiles
      if (isTrial !== undefined) updateData.is_trial = isTrial

      const { data: updatedLesson, error } = await serviceRoleClient
        .from('lessons')
        .update(updateData)
        .eq('id', lessonId)
        .select()
        .single()

      if (error) return errorResponse(error.message, 500)
      return jsonResponse(updatedLesson)
    }

    // DELETE: Delete Lesson
    if (req.method === 'DELETE' || action === 'delete') {
      const body = await req.json().catch(() => ({}))
      const lessonIdQuery = url.searchParams.get('lessonId') || body.lessonId

      const validation = deleteLessonSchema.safeParse({ lessonId: lessonIdQuery })
      if (!validation.success) {
        return errorResponse('Validation error', 400, validation.error.format())
      }

      const { lessonId } = validation.data

      const { error } = await serviceRoleClient
        .from('lessons')
        .delete()
        .eq('id', lessonId)

      if (error) return errorResponse(error.message, 500)
      return jsonResponse({ message: 'Lesson deleted successfully', lessonId })
    }

    return errorResponse('Method not allowed', 405)
  } catch (err: unknown) {
    const error = err as Error
    return errorResponse(error.message || 'Unauthorized / Error', 401)
  }
})
