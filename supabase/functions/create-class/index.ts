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
      if (action === 'get-grade-blocks') {
        const includeStats = url.searchParams.get('includeStats') === 'true'

        if (!includeStats) {
          const { data: blocks, error } = await serviceRoleClient
            .from('grade_blocks')
            .select('*')
            .order('name', { ascending: true })

          if (error) return errorResponse(error.message, 500)
          return jsonResponse(blocks || [])
        }

        // When stats are requested (e.g. for Grade Blocks Management view)
        const [blocksRes, classesRes, qbRes] = await Promise.all([
          serviceRoleClient
            .from('grade_blocks')
            .select('*')
            .order('name', { ascending: true }),
          serviceRoleClient
            .from('classes')
            .select('id, name, grade_block'),
          serviceRoleClient
            .from('question_bank')
            .select('grade_block'),
        ])

        if (blocksRes.error) return errorResponse(blocksRes.error.message, 500)

        const blocks = blocksRes.data || []
        const classesData = classesRes.data || []
        const qbData = qbRes.data || []

        const qbCountMap: Record<string, number> = {}
        qbData.forEach((q: any) => {
          if (q.grade_block) {
            qbCountMap[q.grade_block] = (qbCountMap[q.grade_block] || 0) + 1
          }
        })

        const classMap: Record<string, { count: number; names: string[] }> = {}
        classesData.forEach((c: any) => {
          const gb = c.grade_block || '12-Toán'
          if (!classMap[gb]) classMap[gb] = { count: 0, names: [] }
          classMap[gb].count += 1
          if (c.name) classMap[gb].names.push(c.name)
        })

        const enriched = blocks.map((b: any) => ({
          ...b,
          classesCount: classMap[b.name]?.count || 0,
          classesList: classMap[b.name]?.names || [],
          questionsCount: qbCountMap[b.name] || 0,
        }))

        return jsonResponse(enriched)
      }

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

      if (action === 'get-telegram-config') {
        const classId = url.searchParams.get('classId')
        if (!classId) return errorResponse('Class ID is required', 400)
        
        const { data, error } = await serviceRoleClient
          .from('telegram_configs')
          .select('*')
          .eq('class_id', classId)
          .single()

        if (error && error.code !== 'PGRST116') {
          return errorResponse(error.message, 500)
        }

        return jsonResponse(data || null)
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
            gradeBlock: c.grade_block || '12-Toán',
            tuitionFee: c.tuition_fee ? Number(c.tuition_fee) : 0,
            studentsCount: student_classes ? student_classes.length : 0
          }
        })
        return jsonResponse(formatted)
      } else {
        // STUDENT: Use user.classIds from requireAuth context
        const enrolledClassIds = user.classIds || []
        if (enrolledClassIds.length === 0) {
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
          .in('id', enrolledClassIds)

        if (error) return jsonResponse([])
        
        const formatted = (studentClasses || []).map(c => {
          const { student_classes, ...rest } = c
          return {
            ...rest,
            gradeBlock: c.grade_block || '12-Toán',
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
            const isPaidVal = s.isPaid === true || s.isPaid === 'true' || s.is_paid === true || s.is_paid === 'true'
            return {
              student_id: studentId,
              class_id: classId,
              session_date: s.date,
              is_paid: isPaidVal
            }
          })
          const { error: insertError } = await serviceRoleClient
            .from('student_sessions')
            .insert(inserts)
            
          if (insertError) return errorResponse(insertError.message, 500)
        }
        
        return jsonResponse({ message: 'Student sessions updated successfully' })
      }



      if (action === 'create-grade-block') {
        const body = await req.json()
        const name = (body.name || '').trim()
        const description = (body.description || '').trim() || null

        if (!name) {
          return errorResponse('Tên khối không được để trống', 400)
        }

        const { data: created, error: createErr } = await serviceRoleClient
          .from('grade_blocks')
          .insert({ name, description })
          .select()
          .single()

        if (createErr) {
          if (createErr.code === '23505') {
            return errorResponse(`Khối "${name}" đã tồn tại trong hệ thống!`, 400)
          }
          return errorResponse(createErr.message, 500)
        }

        return jsonResponse(created, 201)
      }

      // Create Class
      if (!action || action === 'create') {
        const body = await req.json()
        const validation = createClassSchema.safeParse(body)
        if (!validation.success) {
          return errorResponse('Validation error', 400, validation.error.format())
        }

        const { name, description, tuitionFee, gradeBlock } = validation.data

        const { data: newClass, error } = await serviceRoleClient
          .from('classes')
          .insert({
            name,
            description: description || null,
            tuition_fee: tuitionFee || 0,
            grade_block: gradeBlock || '12-Toán',
          })
          .select()
          .single()

        if (error) return errorResponse(error.message, 500)
        return jsonResponse({
          ...newClass,
          gradeBlock: newClass.grade_block || '12-Toán',
          tuitionFee: newClass.tuition_fee ? Number(newClass.tuition_fee) : 0
        }, 201)
      }
    }

    // PUT / PATCH: Update Class, Grade Block, or Telegram Config
    if (req.method === 'PUT' || req.method === 'PATCH' || action === 'update' || action === 'update-telegram-config' || action === 'update-grade-block') {
      if (action === 'update-grade-block') {
        const body = await req.json()
        const id = body.id
        const name = (body.name || '').trim()
        const description = body.description !== undefined ? (body.description || '').trim() : undefined

        if (!id || !name) {
          return errorResponse('ID và tên khối là bắt buộc', 400)
        }

        const { data: oldBlock, error: getErr } = await serviceRoleClient
          .from('grade_blocks')
          .select('*')
          .eq('id', id)
          .single()

        if (getErr || !oldBlock) {
          return errorResponse('Khối học không tồn tại', 404)
        }

        const updateData: Record<string, unknown> = { updated_at: new Date().toISOString() }
        if (name) updateData.name = name
        if (description !== undefined) updateData.description = description || null

        const { data: updated, error: updateErr } = await serviceRoleClient
          .from('grade_blocks')
          .update(updateData)
          .eq('id', id)
          .select()
          .single()

        if (updateErr) {
          if (updateErr.code === '23505') {
            return errorResponse(`Tên khối "${name}" đã được sử dụng!`, 400)
          }
          return errorResponse(updateErr.message, 500)
        }

        // If name changed, cascade update to classes and question_bank!
        if (oldBlock.name !== name) {
          await serviceRoleClient
            .from('classes')
            .update({ grade_block: name })
            .eq('grade_block', oldBlock.name)

          await serviceRoleClient
            .from('question_bank')
            .update({ grade_block: name })
            .eq('grade_block', oldBlock.name)
        }

        return jsonResponse(updated)
      }
      if (action === 'update-telegram-config') {
        const body = await req.json()
        const { classId, chatId, chatTitle, isEnabled } = body
        if (!classId || !chatId) {
          return errorResponse('classId and chatId are required', 400)
        }

        const { data, error } = await serviceRoleClient
          .from('telegram_configs')
          .upsert(
            {
              class_id: classId,
              chat_id: chatId,
              chat_title: chatTitle || null,
              is_enabled: isEnabled ?? true,
            },
            { onConflict: 'class_id' }
          )
          .select()
          .single()

        if (error) return errorResponse(error.message, 500)
        return jsonResponse(data)
      }

      const body = await req.json()
      const validation = updateClassSchema.safeParse(body)
      if (!validation.success) {
        return errorResponse('Validation error', 400, validation.error.format())
      }

      const { classId, name, description, tuitionFee, gradeBlock } = validation.data
      const updateData: Record<string, unknown> = { updated_at: new Date().toISOString() }
      if (name) updateData.name = name
      if (description !== undefined) updateData.description = description
      if (tuitionFee !== undefined) updateData.tuition_fee = tuitionFee
      if (gradeBlock !== undefined) updateData.grade_block = gradeBlock

      const { data: updatedClass, error } = await serviceRoleClient
        .from('classes')
        .update(updateData)
        .eq('id', classId)
        .select()
        .single()

      if (error) return errorResponse(error.message, 500)
      return jsonResponse({
        ...updatedClass,
        gradeBlock: updatedClass.grade_block || '12-Toán',
        tuitionFee: updatedClass.tuition_fee ? Number(updatedClass.tuition_fee) : 0
      })
    }

    // DELETE: Delete Class, Telegram Config, or Grade Block
    if (req.method === 'DELETE' || action === 'delete' || action === 'delete-telegram-config' || action === 'delete-grade-block') {
      if (action === 'delete-grade-block') {
        const blockId = url.searchParams.get('id')
        if (!blockId) return errorResponse('ID khối là bắt buộc', 400)

        const { data: targetBlock } = await serviceRoleClient
          .from('grade_blocks')
          .select('name')
          .eq('id', blockId)
          .single()

        if (targetBlock) {
          const { count } = await serviceRoleClient
            .from('classes')
            .select('id', { count: 'exact', head: true })
            .eq('grade_block', targetBlock.name)

          if (count && count > 0) {
            return errorResponse(`Không thể xóa khối "${targetBlock.name}" vì đang có ${count} lớp học thuộc khối này!`, 400)
          }
        }

        const { error: delErr } = await serviceRoleClient
          .from('grade_blocks')
          .delete()
          .eq('id', blockId)

        if (delErr) return errorResponse(delErr.message, 500)
        return jsonResponse({ message: 'Xóa khối thành công' })
      }

      if (action === 'delete-telegram-config') {
        const classId = url.searchParams.get('classId')
        if (!classId) return errorResponse('Class ID is required', 400)

        const { error } = await serviceRoleClient
          .from('telegram_configs')
          .delete()
          .eq('class_id', classId)

        if (error) return errorResponse(error.message, 500)
        return jsonResponse({ message: 'Telegram config deleted successfully' })
      }

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
