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
    // 1. Lấy các submission của học sinh (lọc theo lớp nếu có classId).
    let subQuery = serviceRoleClient.from('submissions').select('id')
    if (classId) {
      subQuery = serviceRoleClient
        .from('submissions')
        .select('id, homeworks!inner(id, lessons!inner(chapters!inner(class_id)))')
        .eq('homeworks.lessons.chapters.class_id', classId)
    }
    const { data: subs, error: subErr } = await subQuery.eq('student_id', sid)
    if (subErr) return errorResponse(subErr.message, 500)
    const submissionIds = (subs || []).map((s: { id: string }) => s.id)
    if (submissionIds.length === 0) {
      return jsonResponse({ studentId, topics: [], totalAnswered: 0, totalWrong: 0 })
    }

    // 2. Lấy đáp án từng câu kèm chương (giới hạn an toàn 5000 dòng).
    const { data: answers, error: ansErr } = await serviceRoleClient
      .from('submission_answers')
      .select('is_correct, questions!inner(homeworks!inner(lessons!inner(chapters!inner(id, title, class_id))))')
      .in('submission_id', submissionIds)
      .limit(5000)
    if (ansErr) return errorResponse(ansErr.message, 500)

    // 3. Gom theo chương: đã làm / sai / tỉ lệ sai.
    const byChapter = new Map<string, { chapterId: string; chapterTitle: string; classId: string | null; answered: number; wrong: number }>()
    for (const a of (answers || []) as Array<{ is_correct: boolean; questions: { homeworks: { lessons: { chapters: { id: string; title: string; class_id: string } | null } } } | null }>) {
      const ch = a.questions?.homeworks?.lessons?.chapters
      if (!ch?.id) continue
      if (classId && ch.class_id !== classId) continue
      let entry = byChapter.get(ch.id)
      if (!entry) {
        entry = { chapterId: ch.id, chapterTitle: ch.title || 'Chương', classId: ch.class_id || null, answered: 0, wrong: 0 }
        byChapter.set(ch.id, entry)
      }
      entry.answered++
      if (!a.is_correct) entry.wrong++
    }

    let totalAnswered = 0
    let totalWrong = 0
    const topics = [...byChapter.values()]
      .map((t) => {
        totalAnswered += t.answered
        totalWrong += t.wrong
        return { ...t, wrongRate: t.answered > 0 ? Math.round((t.wrong / t.answered) * 1000) / 10 : 0 }
      })
      .filter((t) => t.answered >= minAnswered)
      .sort((a, b) => b.wrongRate - a.wrongRate || b.wrong - a.wrong)
      .slice(0, limit)

    return jsonResponse({ studentId: sid, topics, totalAnswered, totalWrong })
  } catch (err: unknown) {
    const error = err as Error
    return errorResponse(error.message || 'Unauthorized', 401)
  }
})
