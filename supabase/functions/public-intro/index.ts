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
    const [classesRes, totalRes] = await Promise.all([
      serviceRoleClient.rpc('fn_public_class_intro'),
      serviceRoleClient.rpc('fn_public_active_student_total'),
    ])

    if (classesRes.error) {
      console.error('fn_public_class_intro rpc error:', classesRes.error)
      return errorResponse('Không tải được danh sách lớp', 500)
    }
    // Tổng học sinh lỗi thì vẫn trả danh sách lớp (dự phòng cộng dồn theo lớp trong mapIntroRows).
    if (totalRes.error) console.error('fn_public_active_student_total rpc error:', totalRes.error)

    const payload = mapIntroRows(classesRes.data || [], totalRes.error ? undefined : totalRes.data)
    return jsonResponse(payload, 200, {
      'Cache-Control': 'public, max-age=300',
    })
  } catch (err) {
    console.error('public-intro error:', err)
    return errorResponse('Không tải được danh sách lớp', 500)
  }
})
