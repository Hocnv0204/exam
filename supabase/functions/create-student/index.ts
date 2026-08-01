import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { requireAdmin } from '../../shared/auth-middleware.ts'
import { handleCors, jsonResponse, errorResponse } from '../../shared/response-helper.ts'
import {
  createStudentSchema,
  updateStudentSchema,
  deleteStudentSchema,
} from '../../shared/validators.ts'

serve(async (req: Request) => {
  const corsRes = handleCors(req)
  if (corsRes) return corsRes

  try {
    const { serviceRoleClient } = await requireAdmin(req)
    const url = new URL(req.url)
    const action = url.searchParams.get('action')

    // GET: List all students
    if (req.method === 'GET') {
      const { data: students, error } = await serviceRoleClient
        .from('profiles')
        .select(`
          id,
          username,
          full_name,
          role,
          class_id,
          created_at,
          student_classes (
            class_id,
            classes (name)
          )
        `)
        .eq('role', 'STUDENT')
        .order('created_at', { ascending: false })

      if (error) return errorResponse(error.message, 500)

      // Map profiles to match FE format
      const formattedStudents = (students || []).map((s) => {
        const studentClasses = (s.student_classes || []) as unknown as Array<{ class_id: string; classes: { name: string } }>
        const classIds = studentClasses.map((sc) => sc.class_id)
        const classNames = studentClasses.map((sc) => sc.classes?.name).filter(Boolean)
        
        return {
          id: s.id,
          username: s.username,
          fullName: s.full_name,
          className: classNames.join(', ') || 'Chưa phân lớp',
          classId: classIds[0] || null,
          classIds,
          status: 'Hoạt động',
          createdAt: new Date(s.created_at).toLocaleDateString('vi-VN')
        }
      })

      return jsonResponse(formattedStudents)
    }

    // POST: Create student
    if (req.method === 'POST' && (!action || action === 'create')) {
      const body = await req.json()
      const validation = createStudentSchema.safeParse(body)
      if (!validation.success) {
        return errorResponse('Validation error', 400, validation.error.format())
      }

      const { username, password, fullName, classId, classIds } = validation.data
      const targetClassIds = classIds && classIds.length > 0 ? classIds : (classId ? [classId] : [])

      // Check if username taken
      const { data: existingProfile } = await serviceRoleClient
        .from('profiles')
        .select('id')
        .eq('username', username)
        .maybeSingle()

      if (existingProfile) {
        return errorResponse('Username already exists', 409)
      }

      const syntheticEmail = `${username.toLowerCase()}@system.local`

      // Create Supabase Auth User
      const { data: authUser, error: createAuthError } = await serviceRoleClient.auth.admin.createUser({
        email: syntheticEmail,
        password: password,
        email_confirm: true,
        user_metadata: { username, role: 'STUDENT' },
      })

      if (createAuthError || !authUser.user) {
        return errorResponse(`Auth user creation failed: ${createAuthError?.message}`, 400)
      }

      const studentId = authUser.user.id

      // Create Profile
      const { data: profile, error: profileError } = await serviceRoleClient
        .from('profiles')
        .insert({
          id: studentId,
          username,
          full_name: fullName,
          role: 'STUDENT',
          class_id: targetClassIds[0] || null,
        })
        .select('id, username, full_name, role, class_id, created_at')
        .single()

      if (profileError) {
        // Rollback Auth user creation if profile insert fails
        await serviceRoleClient.auth.admin.deleteUser(studentId)
        return errorResponse(`Profile creation failed: ${profileError.message}`, 500)
      }

      // Link student classes
      if (targetClassIds.length > 0) {
        const joinInserts = targetClassIds.map((cid) => ({
          student_id: studentId,
          class_id: cid
        }))
        const { error: joinError } = await serviceRoleClient
          .from('student_classes')
          .insert(joinInserts)
        
        if (joinError) {
          console.error('[create-student] Failed to insert student_classes:', joinError.message)
        }
      }

      return jsonResponse(profile, 201)
    }

    // PUT / PATCH: Update student
    if (req.method === 'PUT' || req.method === 'PATCH' || action === 'update') {
      const body = await req.json()
      const validation = updateStudentSchema.safeParse(body)
      if (!validation.success) {
        return errorResponse('Validation error', 400, validation.error.format())
      }

      const { studentId, fullName, classId, classIds, password } = validation.data

      // Update password if provided
      if (password) {
        const { error: passError } = await serviceRoleClient.auth.admin.updateUserById(studentId, {
          password: password
        })
        if (passError) {
          return errorResponse(`Failed to update password: ${passError.message}`, 400)
        }
      }

      const updatePayload: Record<string, unknown> = {
        updated_at: new Date().toISOString(),
      }
      if (fullName) updatePayload.full_name = fullName
      
      const targetClassIds = classIds && classIds.length > 0 ? classIds : (classId ? [classId] : null)
      if (targetClassIds && targetClassIds.length > 0) {
        updatePayload.class_id = targetClassIds[0]
      }

      const { data: updatedProfile, error: updateError } = await serviceRoleClient
        .from('profiles')
        .update(updatePayload)
        .eq('id', studentId)
        .eq('role', 'STUDENT')
        .select('id, username, full_name, role, class_id, updated_at')
        .single()

      if (updateError || !updatedProfile) {
        return errorResponse('Student not found or update failed', 404)
      }

      // Update student classes
      if (targetClassIds) {
        await serviceRoleClient
          .from('student_classes')
          .delete()
          .eq('student_id', studentId)

        if (targetClassIds.length > 0) {
          const joinInserts = targetClassIds.map((cid) => ({
            student_id: studentId,
            class_id: cid
          }))
          const { error: joinError } = await serviceRoleClient
            .from('student_classes')
            .insert(joinInserts)
          if (joinError) {
            return errorResponse(`Failed to associate classes: ${joinError.message}`, 500)
          }
        }
      }

      return jsonResponse(updatedProfile)
    }

    // DELETE: Delete student
    if (req.method === 'DELETE' || action === 'delete') {
      const body = await req.json().catch(() => ({}))
      const queryStudentId = url.searchParams.get('studentId') || body.studentId

      const validation = deleteStudentSchema.safeParse({ studentId: queryStudentId })
      if (!validation.success) {
        return errorResponse('Validation error', 400, validation.error.format())
      }

      const { studentId } = validation.data

      // Delete auth user (cascades profile deletion)
      const { error: deleteError } = await serviceRoleClient.auth.admin.deleteUser(studentId)
      if (deleteError) {
        return errorResponse(`Failed to delete student: ${deleteError.message}`, 400)
      }

      return jsonResponse({ message: 'Student deleted successfully', studentId })
    }

    return errorResponse('Method not allowed', 405)
  } catch (err: unknown) {
    const error = err as Error
    return errorResponse(error.message || 'Unauthorized / Error', 401)
  }
})
