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

    // GET: List all classes or get study sessions
    if (req.method === 'GET') {
      if (action === 'get-sessions') {
        const classId = url.searchParams.get('classId')
        const month = url.searchParams.get('month') // format: YYYY-MM
        if (!classId) return errorResponse('Class ID is required', 400)
        
        if (user.role === 'STUDENT' && (!user.classIds || !user.classIds.includes(classId))) {
          return errorResponse('Forbidden: You are not enrolled in this class', 403)
        }
        
        let query = serviceRoleClient
          .from('class_sessions')
          .select('session_date')
          .eq('class_id', classId)
          
        if (month) {
          const startDate = `${month}-01`
          const [year, m] = month.split('-').map(Number)
          const endDate = `${year}-${String(m).padStart(2, '0')}-${String(new Date(year, m, 0).getDate()).padStart(2, '0')}`
          query = query.gte('session_date', startDate).lte('session_date', endDate)
        }
        
        const { data: sessions, error } = await query
        if (error) return errorResponse(error.message, 500)
        
        return jsonResponse((sessions || []).map(s => s.session_date))
      }

      if (action === 'get-student-sessions') {
        const studentId = url.searchParams.get('studentId')
        const classId = url.searchParams.get('classId')
        const month = url.searchParams.get('month') // format: YYYY-MM
        if (!studentId || !classId) return errorResponse('studentId and classId are required', 400)
        
        if (user.role === 'STUDENT' && user.id !== studentId) {
          return errorResponse('Forbidden: Cannot view other student sessions', 403)
        }
        
        let query = serviceRoleClient
          .from('student_sessions')
          .select('session_date, is_paid')
          .eq('student_id', studentId)
          .eq('class_id', classId)
          
        if (month) {
          const startDate = `${month}-01`
          const [year, m] = month.split('-').map(Number)
          const endDate = `${year}-${String(m).padStart(2, '0')}-${String(new Date(year, m, 0).getDate()).padStart(2, '0')}`
          query = query.gte('session_date', startDate).lte('session_date', endDate)
        }
        
        const { data: sessions, error } = await query
        if (error) return errorResponse(error.message, 500)
        
        const formatted = (sessions || []).map(s => ({
          sessionDate: s.session_date,
          isPaid: s.is_paid
        }))
        return jsonResponse(formatted)
      }

      if (user.role === 'ADMIN') {
        const { data: classes, error } = await serviceRoleClient
          .from('classes')
          .select(`
            *,
            student_classes (
              student_id
            )
          `)
          .order('created_at', { ascending: false })

        if (error) return errorResponse(error.message, 500)
        
        const formatted = (classes || []).map(c => {
          const { student_classes, ...rest } = c
          return {
            ...rest,
            tuitionFee: c.tuition_fee ? Number(c.tuition_fee) : 0,
            studentsCount: student_classes ? student_classes.length : 0
          }
        })
        return jsonResponse(formatted)
      } else {
        // STUDENT
        if (!user.classIds || user.classIds.length === 0) {
          return jsonResponse([])
        }
        const { data: studentClasses, error } = await serviceRoleClient
          .from('classes')
          .select(`
            *,
            student_classes (
              student_id
            )
          `)
          .in('id', user.classIds)

        if (error) return jsonResponse([])
        
        const formatted = (studentClasses || []).map(c => {
          const { student_classes, ...rest } = c
          return {
            ...rest,
            tuitionFee: c.tuition_fee ? Number(c.tuition_fee) : 0,
            studentsCount: student_classes ? student_classes.length : 0
          }
        })
        return jsonResponse(formatted)
      }
    }

    // Role Guard: Write Operations (POST, PUT, DELETE) are Admin-only
    if (user.role !== 'ADMIN') {
      return errorResponse('Forbidden: Only admins can manage classes', 403)
    }

    // POST: Create Class or Set Sessions
    if (req.method === 'POST') {
      if (action === 'set-sessions') {
        const body = await req.json()
        const { classId, sessionDates, month } = body // sessionDates: array of 'YYYY-MM-DD'
        if (!classId || !Array.isArray(sessionDates) || !month) {
          return errorResponse('classId, month and sessionDates are required', 400)
        }
        
        const startDate = `${month}-01`
        const [year, m] = month.split('-').map(Number)
        const endDate = `${year}-${String(m).padStart(2, '0')}-${String(new Date(year, m, 0).getDate()).padStart(2, '0')}`
        
        const { error: deleteError } = await serviceRoleClient
          .from('class_sessions')
          .delete()
          .eq('class_id', classId)
          .gte('session_date', startDate)
          .lte('session_date', endDate)
          
        if (deleteError) return errorResponse(deleteError.message, 500)
        
        if (sessionDates.length > 0) {
          const inserts = sessionDates.map(date => ({
            class_id: classId,
            session_date: date
          }))
          const { error: insertError } = await serviceRoleClient
            .from('class_sessions')
            .insert(inserts)
            
          if (insertError) return errorResponse(insertError.message, 500)
        }
        
        return jsonResponse({ message: 'Sessions updated successfully' })
      }

      if (action === 'set-student-sessions') {
        const body = await req.json()
        const { studentId, classId, sessionDates, month } = body
        if (!studentId || !classId || !Array.isArray(sessionDates) || !month) {
          return errorResponse('studentId, classId, month and sessionDates are required', 400)
        }
        
        const startDate = `${month}-01`
        const [year, m] = month.split('-').map(Number)
        const endDate = `${year}-${String(m).padStart(2, '0')}-${String(new Date(year, m, 0).getDate()).padStart(2, '0')}`
        
        const { error: deleteError } = await serviceRoleClient
          .from('student_sessions')
          .delete()
          .eq('student_id', studentId)
          .eq('class_id', classId)
          .gte('session_date', startDate)
          .lte('session_date', endDate)
          
        if (deleteError) return errorResponse(deleteError.message, 500)
        
        if (sessionDates.length > 0) {
          const inserts = sessionDates.map((s: any) => {
            if (typeof s === 'string') {
              return {
                student_id: studentId,
                class_id: classId,
                session_date: s,
                is_paid: false
              }
            }
            return {
              student_id: studentId,
              class_id: classId,
              session_date: s.date,
              is_paid: s.isPaid || false
            }
          })
          const { error: insertError } = await serviceRoleClient
            .from('student_sessions')
            .insert(inserts)
            
          if (insertError) return errorResponse(insertError.message, 500)
        }
        
        return jsonResponse({ message: 'Student sessions updated successfully' })
      }

      // Create Class
      if (!action || action === 'create') {
        const body = await req.json()
        const validation = createClassSchema.safeParse(body)
        if (!validation.success) {
          return errorResponse('Validation error', 400, validation.error.format())
        }

        const { name, description, tuitionFee } = validation.data

        const { data: newClass, error } = await serviceRoleClient
          .from('classes')
          .insert({
            name,
            description: description || null,
            tuition_fee: tuitionFee || 0,
          })
          .select()
          .single()

        if (error) return errorResponse(error.message, 500)
        return jsonResponse({
          ...newClass,
          tuitionFee: newClass.tuition_fee ? Number(newClass.tuition_fee) : 0
        }, 201)
      }
    }

    // PUT / PATCH: Update Class
    if (req.method === 'PUT' || req.method === 'PATCH' || action === 'update') {
      const body = await req.json()
      const validation = updateClassSchema.safeParse(body)
      if (!validation.success) {
        return errorResponse('Validation error', 400, validation.error.format())
      }

      const { classId, name, description, tuitionFee } = validation.data
      const updateData: Record<string, unknown> = { updated_at: new Date().toISOString() }
      if (name) updateData.name = name
      if (description !== undefined) updateData.description = description
      if (tuitionFee !== undefined) updateData.tuition_fee = tuitionFee

      const { data: updatedClass, error } = await serviceRoleClient
        .from('classes')
        .update(updateData)
        .eq('id', classId)
        .select()
        .single()

      if (error) return errorResponse(error.message, 500)
      return jsonResponse({
        ...updatedClass,
        tuitionFee: updatedClass.tuition_fee ? Number(updatedClass.tuition_fee) : 0
      })
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
