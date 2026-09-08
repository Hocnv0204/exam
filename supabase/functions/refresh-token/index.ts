import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.38.4'
import { handleCors, jsonResponse, errorResponse } from '../../shared/response-helper.ts'

serve(async (req: Request) => {
  const corsRes = handleCors(req)
  if (corsRes) return corsRes

  try {
    if (req.method !== 'POST') {
      return errorResponse('Method not allowed', 405)
    }

    const { refreshToken } = await req.json()
    if (!refreshToken) {
      return errorResponse('Refresh token is required', 400)
    }

    const supabaseUrl = Deno.env.get('SUPABASE_URL') || ''
    const supabaseAnonKey = Deno.env.get('SUPABASE_ANON_KEY') || ''
    
    const anonClient = createClient(supabaseUrl, supabaseAnonKey, {
      auth: { persistSession: false }
    })

    const { data, error } = await anonClient.auth.refreshSession({
      refresh_token: refreshToken
    })

    if (error || !data.session) {
      console.error('[refresh-token] refreshSession failed:', error?.message)
      return errorResponse(error?.message || 'Invalid or expired refresh token', 401)
    }

    return jsonResponse({
      accessToken: data.session.access_token,
      refreshToken: data.session.refresh_token,
      expiresIn: data.session.expires_in
    })
  } catch (err: unknown) {
    const error = err as Error
    return errorResponse(error.message || 'Internal Server Error', 500)
  }
})
