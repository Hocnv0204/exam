import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { requireAdmin } from '../../shared/auth-middleware.ts'
import { createAnonClient } from '../../shared/supabase-client.ts'
import { handleCors, jsonResponse, errorResponse } from '../../shared/response-helper.ts'

serve(async (req: Request) => {
  const corsRes = handleCors(req)
  if (corsRes) return corsRes

  try {
    if (req.method !== 'POST') {
      return errorResponse('Method not allowed', 405)
    }

    // Chỉ ADMIN được mượn phiên học sinh để kiểm thử
    const { user: adminUser, serviceRoleClient } = await requireAdmin(req)
    const body = await req.json()
    const { studentId } = body || {}
    if (!studentId) {
      return errorResponse('studentId is required', 400)
    }

    // 1. Verify target là học sinh đang hoạt động
    const { data: profile, error: profileErr } = await serviceRoleClient
      .from('profiles')
      .select('id, username, full_name, role, class_id, is_locked, seen_tours')
      .eq('id', studentId)
      .maybeSingle()
    if (profileErr || !profile) {
      return errorResponse('Student not found', 404)
    }
    if (profile.role !== 'STUDENT') {
      return errorResponse('Chỉ được mượn phiên của tài khoản học sinh', 400)
    }
    if ((profile as { is_locked?: boolean }).is_locked) {
      return errorResponse('Tài khoản học sinh đang bị tạm khóa', 403)
    }

    // 2. Lấy email auth của học sinh (fallback synthetic email như login)
    let authEmail: string | null = null
    try {
      const { data: authUser } = await serviceRoleClient.auth.admin.getUserById(profile.id)
      authEmail = authUser?.user?.email || null
    } catch (_) {
      authEmail = null
    }
    if (!authEmail) {
      authEmail = `${String(profile.username).toLowerCase()}@system.local`
    }

    // 3. Tạo magiclink + verify để cấp session JWT thật của học sinh
    const { data: linkData, error: linkErr } = await serviceRoleClient.auth.admin.generateLink({
      type: 'magiclink',
      email: authEmail,
    })
    const tokenHash = (linkData as any)?.properties?.hashed_token
    if (linkErr || !tokenHash) {
      return errorResponse('Không thể tạo phiên học sinh', 500)
    }
    const anonClient = createAnonClient()
    const { data: verifyData, error: verifyErr } = await anonClient.auth.verifyOtp({
      type: 'magiclink',
      token_hash: tokenHash,
    })
    if (verifyErr || !verifyData?.session) {
      return errorResponse('Không thể xác thực phiên học sinh', 500)
    }

    // 4. Lấy danh sách lớp của học sinh (giống login)
    const { data: stClasses } = await serviceRoleClient
      .from('student_classes')
      .select('class_id')
      .eq('student_id', profile.id)
    const classIds: string[] = stClasses?.map((c) => c.class_id) || []

    // 5. Ghi log audit: ai đã mượn phiên của ai
    serviceRoleClient
      .from('user_activity_logs')
      .insert({
        user_id: adminUser.id,
        action: 'ADMIN_IMPERSONATE',
        metadata: { studentId: profile.id, username: profile.username },
      })
      .then(({ error }: { error: unknown }) => {
        if (error) console.warn('[impersonate] activity log failed:', (error as Error)?.message)
      })
      .catch(() => {})
    // @ts-ignore EdgeRuntime is available in Supabase Edge Functions
    if (typeof EdgeRuntime !== 'undefined' && typeof EdgeRuntime.waitUntil === 'function') {
      // @ts-ignore
      EdgeRuntime.waitUntil(Promise.resolve())
    }

    return jsonResponse({
      accessToken: verifyData.session.access_token,
      refreshToken: verifyData.session.refresh_token,
      expiresIn: verifyData.session.expires_in,
      user: {
        id: profile.id,
        username: profile.username,
        fullName: profile.full_name,
        role: profile.role,
        classId: profile.class_id || (classIds[0] || null),
        classIds,
        seenTours: Array.isArray((profile as any).seen_tours) ? (profile as any).seen_tours : [],
      },
    })
  } catch (err: unknown) {
    const error = err as Error
    const msg = error.message || 'Internal Server Error'
    if (msg.includes('Forbidden') || msg.includes('Admin access')) {
      return errorResponse(msg, 403)
    }
    return errorResponse(msg, 500)
  }
})
