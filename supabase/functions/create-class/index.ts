import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { requireAdmin, requireAuth } from '../../shared/auth-middleware.ts'
import { handleCors, jsonResponse, errorResponse } from '../../shared/response-helper.ts'
import {
  createClassSchema,
  updateClassSchema,
  deleteClassSchema,
} from '../../shared/validators.ts'

serve(async (req: Request) => {
  const corsRes = handleCors(req)
  if (corsRes) return corsRes

  try {
    const { user, serviceRoleClient } = await requireAuth(req)
    const url = new URL(req.url)
    const action = url.searchParams.get('action')

    // GET: List all classes (Admin gets all, Student gets only their enrolled class)
    if (req.method === 'GET') {
      if (user.role === 'ADMIN') {
        const { data: classes, error } = await serviceRoleClient
          .from('classes')
          .select('*')
          .order('created_at', { ascending: false })

        if (error) return errorResponse(error.message, 500)
        return jsonResponse(classes)
      } else {
        // STUDENT
        if (!user.classId) {
          return jsonResponse([])
        }
        const { data: studentClass, error } = await serviceRoleClient
          .from('classes')
          .select('*')
          .eq('id', user.classId)
          .single()

        if (error) return jsonResponse([])
        return jsonResponse([studentClass])
      }
    }

    // Role Guard: Write Operations (POST, PUT, DELETE) are Admin-only
    if (user.role !== 'ADMIN') {
      return errorResponse('Forbidden: Only admins can manage classes', 403)
    }

    // POST: Create Class
    if (req.method === 'POST' && (!action || action === 'create')) {
      const body = await req.json()
      const validation = createClassSchema.safeParse(body)
      if (!validation.success) {
        return errorResponse('Validation error', 400, validation.error.format())
      }

      const { name, description } = validation.data

      const { data: newClass, error } = await serviceRoleClient
        .from('classes')
        .insert({
          name,
          description: description || null,
        })
        .select()
        .single()

      if (error) return errorResponse(error.message, 500)
      return jsonResponse(newClass, 201)
    }

    // PUT / PATCH: Update Class
    if (req.method === 'PUT' || req.method === 'PATCH' || action === 'update') {
      const body = await req.json()
      const validation = updateClassSchema.safeParse(body)
      if (!validation.success) {
        return errorResponse('Validation error', 400, validation.error.format())
      }

      const { classId, name, description } = validation.data
      const updateData: Record<string, unknown> = { updated_at: new Date().toISOString() }
      if (name) updateData.name = name
      if (description !== undefined) updateData.description = description

      const { data: updatedClass, error } = await serviceRoleClient
        .from('classes')
        .update(updateData)
        .eq('id', classId)
        .select()
        .single()

      if (error) return errorResponse(error.message, 500)
      return jsonResponse(updatedClass)
    }

    // DELETE: Delete Class
    if (req.method === 'DELETE' || action === 'delete') {
      const body = await req.json().catch(() => ({}))
      const classIdQuery = url.searchParams.get('classId') || body.classId

      const validation = deleteClassSchema.safeParse({ classId: classIdQuery })
      if (!validation.success) {
        return errorResponse('Validation error', 400, validation.error.format())
      }

      const { classId } = validation.data

      const { error } = await serviceRoleClient
        .from('classes')
        .delete()
        .eq('id', classId)

      if (error) return errorResponse(error.message, 500)
      return jsonResponse({ message: 'Class deleted successfully', classId })
    }

    return errorResponse('Method not allowed', 405)
  } catch (err: unknown) {
    const error = err as Error
    return errorResponse(error.message || 'Unauthorized / Error', 401)
  }
})
