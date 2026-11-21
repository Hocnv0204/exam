import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { handleCors, jsonResponse, errorResponse } from '../../shared/response-helper.ts'
import { createServiceRoleClient } from '../../shared/supabase-client.ts'
import { mapIntroRows } from './logic.ts'

serve(async (req: Request) => {
  const corsRes = handleCors(req)
  if (corsRes) return corsRes

  // Chỉ chấp nhận GET, method khác trả 405
  if (req.method !== 'GET') {
    return errorResponse('Method Not Allowed', 405)
  }

  try {
    const serviceRoleClient = createServiceRoleClient()
    const { data, error } = await serviceRoleClient.rpc('fn_public_class_intro')

    if (error) {
      console.error('fn_public_class_intro rpc error:', error)
      return errorResponse('Không tải được danh sách lớp', 500)
    }

    const payload = mapIntroRows(data || [])
    return jsonResponse(payload, 200, {
      'Cache-Control': 'public, max-age=300',
    })
  } catch (err) {
    console.error('public-intro error:', err)
    return errorResponse('Không tải được danh sách lớp', 500)
  }
})
