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

    // Debug: log env vars to diagnose connection issue
    const supabaseUrl = Deno.env.get('SUPABASE_URL') || 'MISSING'
    const svcKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') || 'MISSING'
    console.log('[login] SUPABASE_URL:', supabaseUrl, '| SERVICE_KEY prefix:', svcKey.substring(0, 20))

    // Find profile by username to retrieve user's auth record/id
    const { data: profile, error: profileError } = await serviceRoleClient
      .from('profiles')
      .select('id, username, full_name, role, class_id')
      .eq('username', username)
      .maybeSingle()

    if (profileError || !profile) {
      console.error('[login] Profile lookup failed:', profileError?.message, 'profile:', profile)
      return errorResponse('Invalid username or password', 401)
    }

    // Lookup user email in auth.users via admin API
    const { data: authUser, error: getUserError } = await serviceRoleClient.auth.admin.getUserById(profile.id)
    if (getUserError || !authUser.user || !authUser.user.email) {
      console.error('[login] getUserById failed:', getUserError?.message)
      return errorResponse('Authentication account mapping error', 500)
    }

    // Authenticate password using email mapping (must use anon client, not service role)
    const anonClient = createAnonClient()
    const { data: sessionData, error: signInError } = await anonClient.auth.signInWithPassword({
      email: authUser.user.email,
      password: password,
    })

    if (signInError || !sessionData.session) {
      console.error('[login] signInWithPassword failed:', signInError?.message)
      return errorResponse('Invalid username or password', 401)
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
        classId: profile.class_id,
      },
    })
  } catch (err: unknown) {
    const error = err as Error
    return errorResponse(error.message || 'Internal Server Error', 500)
  }
})
