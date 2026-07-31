import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { requireAdmin, requireAuth } from '../../shared/auth-middleware.ts'
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
    const { user, serviceRoleClient } = await requireAuth(req)
    const url = new URL(req.url)
    const action = url.searchParams.get('action')

    // GET: List lessons (filter by chapterId if provided)
    if (req.method === 'GET') {
      const chapterId = url.searchParams.get('chapterId')
      
      // Student RLS: Can only view lessons of chapters belonging to their enrolled class
      if (user.role === 'STUDENT' && chapterId) {
        const { data: chapter, error: chErr } = await serviceRoleClient
          .from('chapters')
          .select('class_id')
          .eq('id', chapterId)
          .single()

        if (chErr || !chapter || chapter.class_id !== user.classId) {
          return errorResponse('Forbidden: You can only view lessons under your enrolled class', 403)
        }
      }

      let query = serviceRoleClient.from('lessons').select('*').order('order_index', { ascending: true })

      if (chapterId) {
        query = query.eq('chapter_id', chapterId)
      }

      const { data: lessons, error } = await query
      if (error) return errorResponse(error.message, 500)
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

      const { chapterId, title, orderIndex, content } = validation.data

      const { data: lesson, error } = await serviceRoleClient
        .from('lessons')
        .insert({
          chapter_id: chapterId,
          title,
          order_index: orderIndex,
          content: content || null,
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

      const { lessonId, title, orderIndex, content } = validation.data
      const updateData: Record<string, unknown> = { updated_at: new Date().toISOString() }
      if (title) updateData.title = title
      if (orderIndex !== undefined) updateData.order_index = orderIndex
      if (content !== undefined) updateData.content = content

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
