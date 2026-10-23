import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { requireAdmin, requireAuth } from '../../shared/auth-middleware.ts'
import { handleCors, jsonResponse, errorResponse } from '../../shared/response-helper.ts'
import { createServiceRoleClient } from '../../shared/supabase-client.ts'
import {
  createChapterSchema,
  updateChapterSchema,
  deleteChapterSchema,
} from '../../shared/validators.ts'

serve(async (req: Request) => {
  const corsRes = handleCors(req)
  if (corsRes) return corsRes

  try {
    const url = new URL(req.url)
    const action = url.searchParams.get('action')

    // GET: List chapters (filter by classId if provided, support server pagination/filter/sort)
    if (req.method === 'GET') {
      const classId = url.searchParams.get('classId')
      const includeLessons = url.searchParams.get('includeLessons') === 'true'
      const pageParam = url.searchParams.get('page')
      const pageSizeParam = url.searchParams.get('pageSize')
      const sort = url.searchParams.get('sort') || 'order'
      const q = (url.searchParams.get('q') || url.searchParams.get('query') || '').trim()
      const format = url.searchParams.get('format') // 'array' | 'envelope'
      const isPagedRequest = pageParam !== null || pageSizeParam !== null || format === 'envelope'

      // Chạy song song xác thực JWT/Profile và truy vấn cơ sở dữ liệu
      const serviceRoleClient = createServiceRoleClient()

      let dbQuery = serviceRoleClient
        .from('chapters')
        .select(includeLessons ? '*, lessons(*, homeworks(*))' : '*')
        .order('order_index', { ascending: true })

      if (classId) {
        dbQuery = dbQuery.eq('class_id', classId)
      }

      const [authResult, chaptersResult] = await Promise.all([
        requireAuth(req),
        dbQuery
      ])

      const { user } = authResult
      const { data: chapters, error } = chaptersResult
      if (error) return errorResponse(error.message, 500)

      // Student RLS: Can only view chapters of their enrolled class
      if (user.role === 'STUDENT' && (!classId || !user.classIds.includes(classId))) {
        return errorResponse('Forbidden: You can only view chapters of your enrolled class', 403)
      }

      if (includeLessons && Array.isArray(chapters)) {
        chapters.forEach((ch: any) => {
          if (Array.isArray(ch.lessons)) {
            ch.lessons.sort((a: any, b: any) => (a.order_index || 0) - (b.order_index || 0))
            ch.lessons.forEach((l: any) => {
              if (Array.isArray(l.homeworks)) {
                if (user.role === 'STUDENT') {
                  l.homeworks = l.homeworks.filter((h: any) => h.is_published !== false)
                }
                l.homeworks.sort((a: any, b: any) => new Date(b.created_at || 0).getTime() - new Date(a.created_at || 0).getTime())
              }
            })
          }
        })
      }

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

      let list: any[] = Array.isArray(chapters) ? chapters.slice() : []

      // Filter by keyword q
      if (q) {
        const normQ = normalize(q)
        list = list.filter((ch: any) => normalize(ch.title).includes(normQ))
      }

      // Sort stable
      list.sort((a: any, b: any) => {
        if (sort === 'title-asc') {
          const c = (a.title || '').localeCompare(b.title || '', 'vi')
          if (c !== 0) return c
          return (a.order_index ?? 0) - (b.order_index ?? 0) || String(a.id || '').localeCompare(String(b.id || ''))
        }
        if (sort === 'title-desc') {
          const c = (b.title || '').localeCompare(a.title || '', 'vi')
          if (c !== 0) return c
          return (a.order_index ?? 0) - (b.order_index ?? 0) || String(a.id || '').localeCompare(String(b.id || ''))
        }
        if (sort === 'newest') {
          const diff = new Date(b.created_at || 0).getTime() - new Date(a.created_at || 0).getTime()
          if (diff !== 0) return diff
          return (b.order_index ?? 0) - (a.order_index ?? 0) || String(a.id || '').localeCompare(String(b.id || ''))
        }
        if (sort === 'order-desc') {
          const diff = (b.order_index ?? 0) - (a.order_index ?? 0)
          if (diff !== 0) return diff
          return String(a.id || '').localeCompare(String(b.id || ''))
        }
        // Default 'order' / 'order-asc'
        const diff = (a.order_index ?? 0) - (b.order_index ?? 0)
        if (diff !== 0) return diff
        return String(a.id || '').localeCompare(String(b.id || ''))
      })

      // Pagination & Envelope handling
      const total = list.length
      if (isPagedRequest) {
        const page = Math.max(1, parseInt(pageParam || '1', 10) || 1)
        const pageSize = Math.min(100, Math.max(1, parseInt(pageSizeParam || '15', 10) || 15))
        const from = (page - 1) * pageSize
        const items = list.slice(from, from + pageSize)
        return jsonResponse({
          items,
          total,
          page,
          pageSize
        })
      }

      return jsonResponse(list)
    }

    const { user, serviceRoleClient } = await requireAuth(req)

    // Role Guard: Write Operations (POST, PUT, DELETE) are Admin-only
    if (user.role !== 'ADMIN') {
      return errorResponse('Forbidden: Only admins can manage chapters', 403)
    }

    // POST: Create Chapter
    if (req.method === 'POST' && (!action || action === 'create')) {
      const body = await req.json()
      const validation = createChapterSchema.safeParse(body)
      if (!validation.success) {
        return errorResponse('Validation error', 400, validation.error.format())
      }

      const { classId, title, orderIndex } = validation.data

      const { data: chapter, error } = await serviceRoleClient
        .from('chapters')
        .insert({
          class_id: classId,
          title,
          order_index: orderIndex,
        })
        .select()
        .single()

      if (error) return errorResponse(error.message, 500)
      return jsonResponse(chapter, 201)
    }

    // PUT / PATCH: Update Chapter
    if (req.method === 'PUT' || req.method === 'PATCH' || action === 'update') {
      const body = await req.json()
      const validation = updateChapterSchema.safeParse(body)
      if (!validation.success) {
        return errorResponse('Validation error', 400, validation.error.format())
      }

      const { chapterId, title, orderIndex } = validation.data
      const updateData: Record<string, unknown> = { updated_at: new Date().toISOString() }
      if (title) updateData.title = title
      if (orderIndex !== undefined) updateData.order_index = orderIndex

      const { data: updatedChapter, error } = await serviceRoleClient
        .from('chapters')
        .update(updateData)
        .eq('id', chapterId)
        .select()
        .single()

      if (error) return errorResponse(error.message, 500)
      return jsonResponse(updatedChapter)
    }

    // DELETE: Delete Chapter
    if (req.method === 'DELETE' || action === 'delete') {
      const body = await req.json().catch(() => ({}))
      const chapterIdQuery = url.searchParams.get('chapterId') || body.chapterId

      const validation = deleteChapterSchema.safeParse({ chapterId: chapterIdQuery })
      if (!validation.success) {
        return errorResponse('Validation error', 400, validation.error.format())
      }

      const { chapterId } = validation.data

      const { error } = await serviceRoleClient
        .from('chapters')
        .delete()
        .eq('id', chapterId)

      if (error) return errorResponse(error.message, 500)
      return jsonResponse({ message: 'Chapter deleted successfully', chapterId })
    }

    return errorResponse('Method not allowed', 405)
  } catch (err: unknown) {
    const error = err as Error
    return errorResponse(error.message || 'Unauthorized / Error', 401)
  }
})
