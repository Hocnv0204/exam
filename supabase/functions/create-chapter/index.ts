import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { requireAdmin, requireAuth } from '../../shared/auth-middleware.ts'
import { handleCors, jsonResponse, errorResponse } from '../../shared/response-helper.ts'
import {
  createChapterSchema,
  updateChapterSchema,
  deleteChapterSchema,
} from '../../shared/validators.ts'

serve(async (req: Request) => {
  const corsRes = handleCors(req)
  if (corsRes) return corsRes

  try {
    const { user, serviceRoleClient } = await requireAuth(req)
    const url = new URL(req.url)
    const action = url.searchParams.get('action')

    // GET: List chapters (filter by classId if provided)
    if (req.method === 'GET') {
      const classId = url.searchParams.get('classId')
      const includeLessons = url.searchParams.get('includeLessons') === 'true'
      
      // Student RLS: Can only view chapters of their enrolled class
      if (user.role === 'STUDENT' && (!classId || !user.classIds.includes(classId))) {
        return errorResponse('Forbidden: You can only view chapters of your enrolled class', 403)
      }

      let query = serviceRoleClient
        .from('chapters')
        .select(includeLessons ? '*, lessons(*)' : '*')
        .order('order_index', { ascending: true })

      if (classId) {
        query = query.eq('class_id', classId)
      }

      const { data: chapters, error } = await query
      if (error) return errorResponse(error.message, 500)

      if (includeLessons && Array.isArray(chapters)) {
        chapters.forEach((ch: any) => {
          if (Array.isArray(ch.lessons)) {
            ch.lessons.sort((a: any, b: any) => (a.order_index || 0) - (b.order_index || 0))
          }
        })
      }

      return jsonResponse(chapters)
    }

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
