import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { requireAdmin } from '../../shared/auth-middleware.ts'
import { handleCors, jsonResponse, errorResponse } from '../../shared/response-helper.ts'
import { resetPasswordSchema } from '../../shared/validators.ts'

serve(async (req: Request) => {
  const corsRes = handleCors(req)
  if (corsRes) return corsRes

  try {
    if (req.method !== 'POST') {
      return errorResponse('Method not allowed', 405)
    }

    const { serviceRoleClient } = await requireAdmin(req)
    const body = await req.json()
    const validation = resetPasswordSchema.safeParse(body)
    if (!validation.success) {
      return errorResponse('Validation error', 400, validation.error.format())
    }

    const { studentId, newPassword } = validation.data

    // Verify student exists
    const { data: student, error: studentError } = await serviceRoleClient
      .from('profiles')
      .select('id, username, role')
      .eq('id', studentId)
      .eq('role', 'STUDENT')
      .single()

    if (studentError || !student) {
      return errorResponse('Student not found', 404)
    }

    // Reset password via Supabase Admin Auth API
    const { error: updateAuthError } = await serviceRoleClient.auth.admin.updateUserById(studentId, {
      password: newPassword,
    })

    if (updateAuthError) {
      return errorResponse(`Password reset failed: ${updateAuthError.message}`, 500)
    }

    return jsonResponse({
      message: 'Student password reset successfully',
      studentId: student.id,
      username: student.username,
    })
  } catch (err: unknown) {
    const error = err as Error
    return errorResponse(error.message || 'Unauthorized / Error', 401)
  }
})
