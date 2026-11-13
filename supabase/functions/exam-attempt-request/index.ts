import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { requireAuth } from '../../shared/auth-middleware.ts'
import { handleCors, jsonResponse, errorResponse } from '../../shared/response-helper.ts'
import { parseIdList, sendMessageWithKeyboard } from '../../shared/telegram.ts'
import { buildAdminMessage, buildKeyboard, isUuid, mapRpcError } from './logic.ts'

serve(async (req: Request) => {
  const corsRes = handleCors(req)
  if (corsRes) return corsRes

  try {
    const { user, serviceRoleClient: db } = await requireAuth(req)
    if (user.role !== 'STUDENT') return errorResponse('Chỉ học sinh mới có thể gửi yêu cầu thêm lượt thi.', 403, null, 'FORBIDDEN')

    if (req.method === 'POST') return await createRequest(req, user, db)
    if (req.method === 'GET') return await getRequest(req, user, db)
    return errorResponse('Method not allowed', 405)
  } catch (err: unknown) {
    const message = (err as Error).message || ''
    if (/Missing Authorization|Unauthorized|User profile|Account locked/.test(message)) {
      return errorResponse('Không thể xác thực người dùng.', 401)
    }
    console.error('[exam-attempt-request] unexpected error:', (err as Error).name)
    return errorResponse('Không gửi được yêu cầu', 500)
  }
})

async function createRequest(req: Request, user: any, db: any): Promise<Response> {
  const body = await req.json().catch(() => ({}))
  const homeworkId = body?.homeworkId
  if (!isUuid(homeworkId)) return errorResponse('homeworkId không hợp lệ.', 400, null, 'VALIDATION')

  const { data, error } = await db.rpc('request_exam_attempt', {
    p_homework_id: homeworkId,
    p_student_id: user.id,
  })
  if (error) {
    const mapped = mapRpcError(error.message)
    if (mapped) return errorResponse(mapped.message, mapped.status, null, mapped.code)
    console.error('[exam-attempt-request] request RPC failed:', error.name || 'DatabaseError')
    return errorResponse('Không gửi được yêu cầu', 500)
  }

  const request = data || {}
  const requestId = request.requestId
  let notified = false
  try {
    const chats = parseIdList(Deno.env.get('TELEGRAM_ADMIN_CHAT_ID'))
    const token = Deno.env.get('TELEGRAM_BOT_TOKEN')
    if (!chats.length || !token || !isUuid(requestId)) throw new Error('Telegram configuration unavailable')

    const [profileResult, homeworkResult] = await Promise.all([
      db.from('profiles').select('full_name,username').eq('id', user.id).maybeSingle(),
      db.from('homeworks').select('title,lessons(chapters(classes(name)))').eq('id', homeworkId).maybeSingle(),
    ])
    const profile = profileResult.data || {}
    const homework = homeworkResult.data || {}
    const first = (v: any) => (Array.isArray(v) ? v[0] : v) || {}
    const lesson = first(homework.lessons)
    const chapter = first(lesson.chapters)
    const classInfo = first(chapter.classes)
    const message = buildAdminMessage({
      studentName: profile.full_name || '—', username: profile.username || '—', className: classInfo.name || '—',
      homeworkTitle: homework.title || '—', attemptsUsed: request.attemptsUsed, allowance: request.allowance,
      requestedAt: request.requestedAt,
    })
    const keyboard = buildKeyboard(requestId)
    for (const chatId of chats) {
      try {
        const sent = await sendMessageWithKeyboard(chatId, message, keyboard)
        if (!notified) {
          notified = true
          const { error: saveError } = await db.rpc('set_exam_attempt_request_message', {
            p_request_id: requestId, p_chat_id: chatId, p_message_id: sent.message_id,
          })
          if (saveError) console.error('[exam-attempt-request] message reference save failed:', saveError.name || 'DatabaseError')
        }
      } catch (err) {
        console.error('[exam-attempt-request] Telegram delivery failed:', (err as Error).name)
      }
    }
  } catch (err) {
    console.error('[exam-attempt-request] Telegram notification unavailable:', (err as Error).name)
  }

  return jsonResponse({
    requestId, status: 'PENDING', requestedAt: request.requestedAt,
    remainingToday: Number(request.remainingToday) || 0, notified,
  })
}

async function getRequest(req: Request, user: any, db: any): Promise<Response> {
  const homeworkId = new URL(req.url).searchParams.get('homeworkId')
  if (!isUuid(homeworkId)) return errorResponse('homeworkId không hợp lệ.', 400, null, 'VALIDATION')

  // RPC kiểm quyền như lúc bắt đầu thi: không dò được bài của lớp khác / bài chưa mở.
  const { data, error } = await db.rpc('get_exam_attempt_request_status', { p_homework_id: homeworkId, p_student_id: user.id })
  if (error) {
    const mapped = mapRpcError(error.message)
    if (mapped) return errorResponse(mapped.message, mapped.status, null, mapped.code)
    console.error('[exam-attempt-request] status lookup failed:', error.name || 'DatabaseError')
    return errorResponse('Không thể lấy thông tin yêu cầu thêm lượt thi.', 500)
  }
  return jsonResponse({
    latest: data?.latest || null,
    remainingToday: Math.max(0, Number(data?.remainingToday) || 0),
    allowance: Number(data?.allowance) || 0,
    attemptsUsed: Number(data?.attemptsUsed) || 0,
  })
}
