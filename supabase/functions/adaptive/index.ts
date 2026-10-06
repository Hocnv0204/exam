import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { requireAuth } from '../../shared/auth-middleware.ts'
import { handleCors, jsonResponse, errorResponse } from '../../shared/response-helper.ts'

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
      return await classWeakOverview(serviceRoleClient, classId, minAnswered, limit)
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

// Tổng hợp cả lớp: xếp hạng chương theo tỉ lệ sai + top điểm yếu từng học sinh.
async function classWeakOverview(
  serviceRoleClient: any,
  classId: string,
  minAnswered: number,
  limit: number,
): Promise<Response> {
  // 1. Bài tập của lớp (qua lessons -> chapters -> class).
  const { data: hws, error: hwErr } = await serviceRoleClient
    .from('homeworks')
    .select('id, lessons!inner(chapters!inner(class_id))')
    .eq('lessons.chapters.class_id', classId)
  if (hwErr) return errorResponse(hwErr.message, 500)
  const homeworkIds = ((hws || []) as Array<{ id: string }>).map((h) => h.id)
  if (homeworkIds.length === 0) {
    return jsonResponse({ classId, chapters: [], students: [] })
  }

  // 2. Bài nộp của các bài đó + tên học sinh.
  const { data: subs, error: subErr } = await serviceRoleClient
    .from('submissions')
    .select('id, student_id, profiles!inner(id, full_name, username)')
    .in('homework_id', homeworkIds)
  if (subErr) return errorResponse(subErr.message, 500)
  const subList = (subs || []) as Array<{ id: string; student_id: string; profiles: { full_name: string; username: string } | null }>
  if (subList.length === 0) {
    return jsonResponse({ classId, chapters: [], students: [] })
  }
  const studentMap = new Map<string, string>()
  for (const s of subList) {
    if (!studentMap.has(s.student_id)) {
      studentMap.set(s.student_id, s.profiles?.full_name || s.profiles?.username || s.student_id)
    }
  }

  // 3. Đáp án từng câu kèm chương (giới hạn an toàn).
  const { data: answers, error: ansErr } = await serviceRoleClient
    .from('submission_answers')
    .select('is_correct, submission_id, questions!inner(homeworks!inner(lessons!inner(chapters!inner(id, title))))')
    .in('submission_id', subList.map((s) => s.id))
    .limit(10000)
  if (ansErr) return errorResponse(ansErr.message, 500)

  // 4. Gom theo chương (cả lớp) và theo (học sinh, chương).
  interface Agg { answered: number; wrong: number }
  const byChapter = new Map<string, { chapterId: string; chapterTitle: string } & Agg>()
  const byStudentChapter = new Map<string, { chapterId: string; chapterTitle: string } & Agg>()
  for (const a of (answers || []) as Array<{ is_correct: boolean; submission_id: string; questions: { homeworks: { lessons: { chapters: { id: string; title: string } | null } } } | null }>) {
    const ch = a.questions?.homeworks?.lessons?.chapters
    if (!ch?.id) continue
    const sub = subList.find((s) => s.id === a.submission_id)
    if (!sub) continue
    let c = byChapter.get(ch.id)
    if (!c) {
      c = { chapterId: ch.id, chapterTitle: ch.title || 'Chương', answered: 0, wrong: 0 }
      byChapter.set(ch.id, c)
    }
    c.answered++
    if (!a.is_correct) c.wrong++
    const key = `${sub.student_id}::${ch.id}`
    let sc = byStudentChapter.get(key)
    if (!sc) {
      sc = { chapterId: ch.id, chapterTitle: ch.title || 'Chương', answered: 0, wrong: 0 }
      byStudentChapter.set(key, sc)
    }
    sc.answered++
    if (!a.is_correct) sc.wrong++
  }

  const rate = (answered: number, wrong: number) =>
    answered > 0 ? Math.round((wrong / answered) * 1000) / 10 : 0

  const chapters = [...byChapter.values()]
    .map((c) => ({ ...c, wrongRate: rate(c.answered, c.wrong) }))
    .filter((c) => c.answered >= minAnswered)
    .sort((a, b) => b.wrongRate - a.wrongRate || b.wrong - a.wrong)
    .slice(0, limit)

  const perStudent = new Map<string, Array<{ chapterId: string; chapterTitle: string; answered: number; wrong: number; wrongRate: number }>>()
  for (const [key, v] of byStudentChapter) {
    const sep = key.indexOf('::')
    const sidKey = key.slice(0, sep)
    if (v.answered < minAnswered) continue
    if (!perStudent.has(sidKey)) perStudent.set(sidKey, [])
    perStudent.get(sidKey)!.push({ ...v, wrongRate: rate(v.answered, v.wrong) })
  }
  const students = [...perStudent.entries()].map(([sidKey, topics]) => {
    const sorted = topics.sort((a, b) => b.wrongRate - a.wrongRate).slice(0, 3)
    const answered = topics.reduce((s, t) => s + t.answered, 0)
    const wrong = topics.reduce((s, t) => s + t.wrong, 0)
    return {
      studentId: sidKey,
      name: studentMap.get(sidKey) || sidKey,
      answered,
      wrong,
      wrongRate: rate(answered, wrong),
      top: sorted,
    }
  }).sort((a, b) => b.wrongRate - a.wrongRate)

  return jsonResponse({ classId, chapters, students })
}
