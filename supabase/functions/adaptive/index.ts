import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { requireAuth } from '../../shared/auth-middleware.ts'
import { handleCors, jsonResponse, errorResponse } from '../../shared/response-helper.ts'
import { computeClassWeakOverview } from './logic.ts'

// Học thích ứng: phát hiện chương yếu từ lịch sử chấm.
// GET /adaptive?action=weak-topics&studentId?=&classId?=&minAnswered?=&limit?
// - STUDENT: chỉ được xem của chính mình (param studentId bị bỏ qua).
// - ADMIN + studentId: xem 1 học sinh.
// - ADMIN + classId (không studentId): tổng hợp cả lớp (xếp hạng chương +
//   top điểm yếu từng học sinh) — phục vụ tab chương trình & đề luyện bù.
serve(async (req: Request) => {
  const corsRes = handleCors(req)
  if (corsRes) return corsRes

  try {
    if (req.method !== 'GET') {
      return errorResponse('Method not allowed', 405)
    }

    const { user, serviceRoleClient } = await requireAuth(req)
    const url = new URL(req.url)
    const action = url.searchParams.get('action') || 'weak-topics'

    if (action !== 'weak-topics') {
      return errorResponse(`Unknown action: ${action}`, 400)
    }

    const requestedStudentId = url.searchParams.get('studentId') || url.searchParams.get('student_id')
    const classId = url.searchParams.get('classId') || url.searchParams.get('class_id')
    const minAnswered = Math.max(1, parseInt(url.searchParams.get('minAnswered') || '3', 10))
    const limit = Math.min(20, Math.max(1, parseInt(url.searchParams.get('limit') || '10', 10)))

    // Phân quyền: học sinh chỉ xem được của mình.
    let studentId: string | null = null
    if (user.role === 'ADMIN') {
      studentId = requestedStudentId || null
      if (!studentId && !classId) {
        return errorResponse('Missing studentId or classId', 400)
      }
    } else if (user.role === 'STUDENT') {
      studentId = user.id
    } else {
      return errorResponse('Forbidden', 403)
    }

    // Chế độ tổng hợp cả lớp (ADMIN, có classId, không studentId).
    if (!studentId && classId) {
      try {
        const overview = await computeClassWeakOverview(serviceRoleClient, classId, minAnswered, limit)
        return jsonResponse(overview)
      } catch (e) {
        return errorResponse((e as Error).message, 500)
      }
    }

    const sid = studentId as string
    const { data: studentWeak, error: rpcErr } = await serviceRoleClient.rpc('fn_weak_topics', {
      p_class_id: classId || null,
      p_student_id: sid,
      p_min_answered: minAnswered,
      p_limit: limit,
    })
    if (rpcErr) return errorResponse(rpcErr.message, 500)

    return jsonResponse(studentWeak || { studentId: sid, topics: [], totalAnswered: 0, totalWrong: 0 })
  } catch (err: unknown) {
    const error = err as Error
    return errorResponse(error.message || 'Unauthorized', 401)
  }
})
