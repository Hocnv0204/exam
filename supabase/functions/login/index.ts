import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { createServiceRoleClient, createAnonClient } from '../../shared/supabase-client.ts'
import { handleCors, jsonResponse, errorResponse } from '../../shared/response-helper.ts'
import { loginSchema } from '../../shared/validators.ts'

serve(async (req: Request) => {
  const corsRes = handleCors(req)
  if (corsRes) return corsRes

  try {
    if (req.method !== 'POST') {
      return errorResponse('Method not allowed', 405)
    }

    const body = await req.json()
    const validation = loginSchema.safeParse(body)
    if (!validation.success) {
      return errorResponse('Validation error', 400, validation.error.format())
    }

    const { username, password } = validation.data
    const serviceRoleClient = createServiceRoleClient()


    const syntheticEmail = `${username.toLowerCase()}@system.local`
    const anonClient = createAnonClient()

    // 1. Parallel: Try signIn with synthetic email + fetch profile
    const profilePromise = serviceRoleClient
      .from('profiles')
      .select('id, username, full_name, role, class_id, is_locked')
      .eq('username', username)
      .maybeSingle()

    const signInPromise = anonClient.auth.signInWithPassword({
      email: syntheticEmail,
      password: password,
    })

    const [profileRes, signInRes] = await Promise.all([profilePromise, signInPromise])

    const profile = profileRes.data
    if (!profile) {
      return errorResponse('Invalid username or password', 401)
    }

    // Tài khoản bị tạm khóa: chặn đăng nhập ngay, không kiểm tra mật khẩu tiếp
    if ((profile as { is_locked?: boolean }).is_locked) {
      return errorResponse('Tài khoản của bạn đã bị tạm khóa. Vui lòng liên hệ giáo viên!', 403)
    }

    let sessionData = signInRes.data

    // Fallback: If sign-in with synthetic email failed (legacy or custom email)
    if (signInRes.error || !sessionData?.session) {
      const { data: authUser, error: getUserError } = await serviceRoleClient.auth.admin.getUserById(profile.id)
      if (getUserError || !authUser?.user?.email) {
        return errorResponse('Invalid username or password', 401)
      }
      const retrySignIn = await anonClient.auth.signInWithPassword({
        email: authUser.user.email,
        password: password,
      })
      if (retrySignIn.error || !retrySignIn.data?.session) {
        return errorResponse('Invalid username or password', 401)
      }
      sessionData = retrySignIn.data
    }

    // Get all classIds for students
    let classIds: string[] = []
    if (profile.role === 'STUDENT') {
      const { data: stClasses } = await serviceRoleClient
        .from('student_classes')
        .select('class_id')
        .eq('student_id', profile.id)
      classIds = stClasses?.map((c) => c.class_id) || []
    }

    // Ghi log đăng nhập (chạy nền, không chặn response)
    const loginLogTask = serviceRoleClient
      .from('user_activity_logs')
      .insert({ user_id: profile.id, action: 'LOGIN', metadata: {} })
      .then(({ error }: { error: unknown }) => {
        if (error) console.warn('[login] activity log failed:', (error as Error)?.message)
      })
    // @ts-ignore EdgeRuntime is available in Supabase Edge Functions
    if (typeof EdgeRuntime !== 'undefined' && typeof EdgeRuntime.waitUntil === 'function') {
      EdgeRuntime.waitUntil(loginLogTask)
    } else {
      loginLogTask.catch(() => {})
    }

    return jsonResponse({
      accessToken: sessionData.session.access_token,
      refreshToken: sessionData.session.refresh_token,
      expiresIn: sessionData.session.expires_in,
      user: {
        id: profile.id,
        username: profile.username,
        fullName: profile.full_name,
        role: profile.role,
        classId: profile.class_id || (classIds[0] || null),
        classIds,
      },
    })
  } catch (err: unknown) {
    const error = err as Error
    return errorResponse(error.message || 'Internal Server Error', 500)
  }
})
