import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { createServiceRoleClient } from '../../shared/supabase-client.ts'
import { handleCors, jsonResponse, errorResponse } from '../../shared/response-helper.ts'

const BOT_TOKEN = Deno.env.get('TELEGRAM_BOT_TOKEN')
if (!BOT_TOKEN) {
  console.warn('[telegram-bot] TELEGRAM_BOT_TOKEN not set')
}

const TELEGRAM_API = `https://api.telegram.org/bot${BOT_TOKEN || ''}`

serve(async (req: Request) => {
  const corsRes = handleCors(req)
  if (corsRes) return corsRes

  try {
    if (req.method !== 'POST') {
      return errorResponse('Method not allowed', 405)
    }

    const body = await req.json()
    const serviceRoleClient = createServiceRoleClient()
    const message = body.message || body.edited_message
    const callback = body.callback_query

    // Nút bấm từ inline keyboard (chọn lớp khi /link, /baitap)
    if (callback) {
      try {
        await handleCallback(serviceRoleClient, callback)
      } catch (e) {
        const errMsg = (e as Error)?.message || 'Unknown error'
        console.error('[telegram-bot] callback failed:', errMsg)
        try {
          const cid = String(callback.message?.chat?.id || '')
          if (cid) await sendMessage(cid, `❌ Xử lý nút bấm thất bại: ${escapeTelegramHtml(errMsg.slice(0, 200))}`)
        } catch { /* bỏ qua lỗi gửi */ }
      }
      return jsonResponse({ ok: true })
    }

    if (!message) {
      return jsonResponse({ ok: true })
    }

    // Nhóm nâng cấp lên supergroup -> Telegram đổi chat_id.
    // Tự cập nhật liên kết cũ sang id mới để không mất link.
    const migrateTo = (message as { migrate_to_chat_id?: number }).migrate_to_chat_id
    if (migrateTo) {
      const oldChatId = String((message.chat as { id: number }).id)
      const newChatId = String(migrateTo)
      await serviceRoleClient
        .from('telegram_configs')
        .update({ chat_id: newChatId })
        .eq('chat_id', oldChatId)
      await sendMessage(newChatId, `🔄 Nhóm đã nâng cấp. Bot tự chuyển liên kết lớp sang nhóm mới, không cần /link lại.`)
      return jsonResponse({ ok: true })
    }

    const chat = message.chat
    const chatId = String(chat.id)
    const chatTitle = chat.title || chat.username || `Chat ${chatId}`
    const text = message.text || message.caption || ''
    const trimmed = text.trim()

    // /start
    if (trimmed === '/start') {
      await sendMessage(chatId, `Chào mừng bạn đến với Exam Telegram Bot!\n\nĐể liên kết nhóm/kênh với một lớp học, hãy gõ:\n/link — rồi bấm chọn lớp trong danh sách.\n\nSau khi liên kết, dùng lệnh:\n/chuabai - Thống kê lớp đã liên kết\n/baitap - Chọn lớp bất kỳ để thống kê\n/kiemtra - Kiểm tra nhóm này đang liên kết với lớp nào\n\nLưu ý: Bot cần được thêm vào nhóm/kênh với quyền gửi tin nhắn.`)
      return jsonResponse({ ok: true })
    }

    // /link — không tham số: hiện nút chọn lớp; có tham số: liên kết trực tiếp (giữ tương thích cũ)
    if (trimmed === '/link') {
      await handleLinkMenu(serviceRoleClient, chatId)
      return jsonResponse({ ok: true })
    }
    if (trimmed.startsWith('/link ')) {
      const classId = trimmed.slice(6).trim()
      if (!classId) {
        await sendMessage(chatId, 'Vui lòng cung cấp class_id. Ví dụ: /link 123e4567-e89b-12d3-a456-426614174000')
        return jsonResponse({ ok: true })
      }

      const { data: cls, error: classError } = await serviceRoleClient
        .from('classes')
        .select('id, name')
        .eq('id', classId)
        .single()

      if (classError || !cls) {
        await sendMessage(chatId, `❌ Không tìm thấy lớp học với class_id: ${classId}`)
        return jsonResponse({ ok: true })
      }

      const { error: upsertError } = await serviceRoleClient
        .from('telegram_configs')
        .upsert(
          {
            class_id: classId,
            chat_id: chatId,
            chat_title: chatTitle,
            is_enabled: true,
          },
          { onConflict: 'class_id' }
        )

      if (upsertError) {
        console.error('[telegram-bot] upsert telegram_configs failed:', upsertError.message)
        await sendMessage(chatId, `❌ Lỗi khi liên kết lớp học: ${upsertError.message}`)
        return jsonResponse({ ok: true })
      }

      await sendMessage(chatId, `✅ Đã liên kết thành công với lớp: ${cls.name}`)
      return jsonResponse({ ok: true })
    }
    // /chuabai — thống kê học sinh chưa nộp / nộp muộn bài quá hạn của lớp
    // đã liên kết với nhóm chat này (nhận lớp theo chat_id, không theo tham số
    // để tránh lộ dữ liệu lớp khác).
    if (trimmed === '/chuabai' || trimmed.startsWith('/chuabai ')) {
      await handleMissedReport(serviceRoleClient, chatId)
      return jsonResponse({ ok: true })
    }

    // /baitap — hiện danh sách lớp để chọn, bấm lớp nào thống kê lớp đó
    if (trimmed === '/baitap') {
      await handleReportMenu(serviceRoleClient, chatId)
      return jsonResponse({ ok: true })
    }

    // /kiemtra — tự chẩn đoán: nhóm này đang liên kết với lớp nào
    if (trimmed === '/kiemtra') {
      const { data: rows } = await serviceRoleClient
        .from('telegram_configs')
        .select('class_id, is_enabled, classes(name)')
        .eq('chat_id', chatId)
      if (!rows || rows.length === 0) {
        await sendMessage(chatId, `🔍 <b>KIỂM TRA LIÊN KẾT</b>\nChat ID nhóm này: <code>${escapeTelegramHtml(chatId)}</code>\nTrạng thái: ❌ chưa liên kết với lớp nào.\nHãy gõ /link rồi bấm chọn lớp.`)
      } else {
        const lines = (rows as Array<{ class_id: string; is_enabled: boolean; classes: { name: string } | null }>).map(
          (r) => `• ${escapeTelegramHtml(r.classes?.name || r.class_id)} — ${r.is_enabled ? '✅ đang bật' : '⏸ đang tắt'}`,
        )
        await sendMessage(chatId, `🔍 <b>KIỂM TRA LIÊN KẾT</b>\nChat ID nhóm này: <code>${escapeTelegramHtml(chatId)}</code>\n${lines.join('\n')}`)
      }
      return jsonResponse({ ok: true })
    }

    return jsonResponse({ ok: true })
  } catch (err: unknown) {
    const error = err as Error
    console.error('[telegram-bot] Error:', error.message)
    return errorResponse(error.message || 'Internal Server Error', 500)
  }
})

async function sendMessage(chatId: string, text: string): Promise<void> {
  if (!BOT_TOKEN) {
    console.warn('[telegram-bot] Missing bot token, skip sendMessage')
    return
  }

  const resp = await fetch(`${TELEGRAM_API}/sendMessage`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      chat_id: chatId,
      text,
      parse_mode: 'HTML',
    }),
  })

  if (!resp.ok) {
    const errText = await resp.text().catch(() => '')
    console.error('[telegram-bot] sendMessage failed:', resp.status, errText)
  }
}

// /link (không tham số): hiện danh sách lớp dạng nút bấm để giáo viên chọn,
// khỏi cần nhập class_id dài.
async function handleLinkMenu(
  svc: ReturnType<typeof createServiceRoleClient>,
  chatId: string,
): Promise<void> {
  const { data: classes, error } = await svc
    .from('classes')
    .select('id, name')
    .order('name', { ascending: true })
    .limit(60)
  if (error) {
    await sendMessage(chatId, `❌ Lỗi tải danh sách lớp: ${escapeTelegramHtml(error.message)}`)
    return
  }
  if (!classes || classes.length === 0) {
    await sendMessage(chatId, `⚠️ Hệ thống chưa có lớp học nào. Hãy tạo lớp trên web trước.`)
    return
  }
  const keyboard = (classes as Array<{ id: string; name: string }>).map((c) => ([
    { text: `🏫 ${c.name}`, callback_data: `link:${c.id}` },
  ]))
  await sendMessageWithKeyboard(
    chatId,
    `🔗 <b>Chọn lớp để liên kết với nhóm này:</b>\nBấm vào tên lớp bên dưới. Sau khi liên kết, gõ /chuabai để xem thống kê nộp bài.`,
    keyboard,
  )
}

// /baitap: hiện danh sách lớp để chọn, bấm lớp nào thống kê lớp đó.
async function handleReportMenu(
  svc: ReturnType<typeof createServiceRoleClient>,
  chatId: string,
): Promise<void> {
  const { data: classes, error } = await svc
    .from('classes')
    .select('id, name')
    .order('name', { ascending: true })
    .limit(60)
  if (error) {
    await sendMessage(chatId, `❌ Lỗi tải danh sách lớp: ${escapeTelegramHtml(error.message)}`)
    return
  }
  if (!classes || classes.length === 0) {
    await sendMessage(chatId, `⚠️ Hệ thống chưa có lớp học nào. Hãy tạo lớp trên web trước.`)
    return
  }
  const keyboard = (classes as Array<{ id: string; name: string }>).map((c) => ([
    { text: `📊 ${c.name}`, callback_data: `report:${c.id}` },
  ]))
  await sendMessageWithKeyboard(
    chatId,
    `📊 <b>Chọn lớp để xem thống kê bài quá hạn:</b>\nBấm vào tên lớp, bot sẽ liệt kê bài quá hạn + học sinh chưa nộp / nộp muộn.`,
    keyboard,
  )
}

async function sendMessageWithKeyboard(
  chatId: string,
  text: string,
  keyboard: Array<Array<{ text: string; callback_data: string }>>,
): Promise<void> {
  if (!BOT_TOKEN) return
  await fetch(`${TELEGRAM_API}/sendMessage`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      chat_id: chatId,
      text,
      parse_mode: 'HTML',
      reply_markup: { inline_keyboard: keyboard },
    }),
  }).catch((e) => console.error('[telegram-bot] send keyboard failed:', (e as Error)?.message))
}

// Xử lý khi giáo viên bấm nút chọn lớp (link: liên kết nhóm, report: thống kê).
async function handleCallback(
  svc: ReturnType<typeof createServiceRoleClient>,
  callback: { id: string; data?: string; message?: { message_id: number; chat: { id: number } }; from?: { first_name?: string } },
): Promise<void> {
  const chatId = String(callback.message?.chat?.id || '')
  const messageId = callback.message?.message_id
  const data = callback.data || ''
  if (!chatId || (!data.startsWith('link:') && !data.startsWith('report:'))) return

  const classId = data.slice(data.indexOf(':') + 1)
  const { data: cls } = await svc
    .from('classes')
    .select('id, name')
    .eq('id', classId)
    .maybeSingle()
  if (!cls) {
    await answerCallback(callback.id, '❌ Lớp không còn tồn tại')
    return
  }
  const className = (cls as { name: string }).name

  // report:<class_id> — chạy thống kê bài quá hạn của lớp đó, gửi vào chat hiện tại
  if (data.startsWith('report:')) {
    await answerCallback(callback.id, `📊 Đang thống kê ${className}...`)
    try {
      await sendMissedReportForClass(svc, chatId, classId, className)
    } catch (e) {
      const errMsg = (e as Error)?.message || 'Unknown error'
      console.error('[telegram-bot] report failed:', errMsg)
      await sendMessage(chatId, `❌ Thống kê lớp ${escapeTelegramHtml(className)} thất bại: ${escapeTelegramHtml(errMsg.slice(0, 200))}`)
    }
    return
  }

  // link:<class_id> — liên kết nhóm với lớp
  const byName = (callback.from?.first_name) || 'Giáo viên'
  const chatTitle = `Chat ${chatId}`
  const { error: upsertError } = await svc
    .from('telegram_configs')
    .upsert({ class_id: classId, chat_id: chatId, chat_title: chatTitle, is_enabled: true }, { onConflict: 'class_id' })

  if (upsertError) {
    await answerCallback(callback.id, '❌ Lỗi liên kết, thử lại sau')
    return
  }
  await answerCallback(callback.id, `✅ Đã liên kết ${(cls as { name: string }).name}`)
  if (messageId) {
    await editBotMessage(
      chatId,
      messageId,
      `✅ <b>Đã liên kết nhóm này với lớp: ${escapeTelegramHtml((cls as { name: string }).name)}</b>\n👤 Người thực hiện: ${escapeTelegramHtml(byName)}\n\nGõ /chuabai để xem thống kê nộp bài.`,
    )
  } else {
    await sendMessage(chatId, `✅ Đã liên kết thành công với lớp: ${escapeTelegramHtml((cls as { name: string }).name)}`)
  }
}

async function answerCallback(callbackQueryId: string, text: string): Promise<void> {
  if (!BOT_TOKEN) return
  await fetch(`${TELEGRAM_API}/answerCallbackQuery`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ callback_query_id: callbackQueryId, text }),
  }).catch(() => {})
}

async function editBotMessage(chatId: string, messageId: number, text: string): Promise<void> {
  if (!BOT_TOKEN) return
  await fetch(`${TELEGRAM_API}/editMessageText`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ chat_id: chatId, message_id: messageId, text, parse_mode: 'HTML' }),
  }).catch((e) => console.error('[telegram-bot] edit message failed:', (e as Error)?.message))
}

function escapeTelegramHtml(str: string): string {
  return String(str || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
}

function formatDeadline(iso: string): string {
  const d = new Date(iso)
  const p = (n: number) => String(n).padStart(2, '0')
  return `${p(d.getDate())}/${p(d.getMonth() + 1)}/${d.getFullYear()} ${p(d.getHours())}:${p(d.getMinutes())}`
}

// /chuabai: thống kê bài quá hạn + học sinh chưa nộp / nộp muộn.
async function handleMissedReport(
  svc: ReturnType<typeof createServiceRoleClient>,
  chatId: string,
): Promise<void> {
  // 1. Nhận lớp theo nhóm chat đã /link (chỉ chat đã liên kết mới xem được).
  // Lấy dạng danh sách thay vì single để chịu được nhóm dính nhiều bản ghi.
  const { data: cfgs } = await svc
    .from('telegram_configs')
    .select('class_id, classes(id, name)')
    .eq('chat_id', chatId)
    .eq('is_enabled', true)
  const cfg = ((cfgs || []) as Array<{ class_id: string; classes: { name: string } | null }>)[0] || null
  const classId = cfg?.class_id || null
  const className = cfg?.classes?.name || ''
  if (!classId) {
    await sendMessage(chatId, `⚠️ Nhóm này chưa liên kết với lớp học nào.\nHãy gõ /link rồi bấm chọn lớp, sau đó gọi lại /chuabai.\n(Mẹo: gõ /baitap để chọn lớp cần xem mà không cần liên kết.)`)
    return
  }

  await sendMissedReportForClass(svc, chatId, classId, className)
}

// Lõi thống kê: bài quá hạn của 1 lớp + ai chưa nộp / nộp muộn. Dùng chung
// cho /chuabai (lớp theo nhóm đã link) và /baitap (lớp do bấm chọn).
async function sendMissedReportForClass(
  svc: ReturnType<typeof createServiceRoleClient>,
  chatId: string,
  classId: string,
  className: string,
): Promise<void> {
  // 1. Bài đã xuất bản, có hạn trong vòng 7 ngày trước/sau hôm nay, hạn gần nhất trước.
  const now = new Date()
  const fromIso = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000).toISOString()
  const toIso = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000).toISOString()
  const { data: hws, error: hwErr } = await svc
    .from('homeworks')
    .select('id, title, deadline, type, max_score, lessons!inner(chapters!inner(class_id))')
    .eq('lessons.chapters.class_id', classId)
    .eq('is_published', true)
    .not('deadline', 'is', null)
    .gte('deadline', fromIso)
    .lte('deadline', toIso)
    .order('deadline', { ascending: true })
  if (hwErr) {
    await sendMessage(chatId, `❌ Lỗi tải danh sách bài tập: ${escapeTelegramHtml(hwErr.message)}`)
    return
  }
  const overdue = (hws || []) as Array<{ id: string; title: string; deadline: string; type: string; max_score: number }>
  if (overdue.length === 0) {
    await sendMessage(chatId, `📊 <b>BÁO CÁO NỘP BÀI — ${escapeTelegramHtml(className)}</b>\n✅ Không có bài tập nào có hạn trong 7 ngày gần đây.`)
    return
  }

  // 3. Học sinh đang học của lớp (bỏ qua Tạm nghỉ).
  const { data: scRows } = await svc
    .from('student_classes')
    .select('student_id, status, profiles!inner(id, full_name, username, role)')
    .eq('class_id', classId)
  const students: Array<{ id: string; name: string }> = []
  for (const row of (scRows || []) as Array<{ student_id: string; status: string | null; profiles: { id: string; full_name: string; username: string; role: string } | null }>) {
    const prof = row.profiles
    if (!prof || prof.role !== 'STUDENT') continue
    if ((row.status || 'ACTIVE') === 'PAUSED') continue
    if (students.some((s) => s.id === prof.id)) continue
    students.push({ id: prof.id, name: prof.full_name || prof.username })
  }

  // 4. Bài đã nộp (1 hop cho toàn bộ bài quá hạn).
  const hwIds = overdue.map((h) => h.id)
  const { data: subs } = await svc
    .from('submissions')
    .select('homework_id, student_id, is_late, submitted_at, total_score')
    .in('homework_id', hwIds)
    .eq('status', 'SUBMITTED')
  const subByHw = new Map<string, Array<{ student_id: string; is_late: boolean; submitted_at: string; total_score: number }>>()
  for (const s of (subs || []) as Array<{ homework_id: string; student_id: string; is_late: boolean; submitted_at: string; total_score: number }>) {
    if (!subByHw.has(s.homework_id)) subByHw.set(s.homework_id, [])
    subByHw.get(s.homework_id)!.push(s)
  }

  // 5. Dựng báo cáo theo từng bài, chia nhỏ tin nhắn (giới hạn Telegram 4096 ký tự).
  const timeStr = new Date().toLocaleString('vi-VN', { timeZone: 'Asia/Ho_Chi_Minh' })
  const header = `📊 <b>BÁO CÁO NỘP BÀI — ${escapeTelegramHtml(className)}</b>\n⏰ <b>Tính đến:</b> ${escapeTelegramHtml(timeStr)}\n📌 <b>Bài có hạn trong 7 ngày qua/tới:</b> ${overdue.length} | <b>Sĩ số:</b> ${students.length}`
  const chunks: string[] = []
  let current = header
  let fullyDone = 0

  overdue.forEach((hw, idx) => {
    const list = subByHw.get(hw.id) || []
    const submittedIds = new Set(list.map((s) => s.student_id))
    const missing = students.filter((st) => !submittedIds.has(st.id))
    const late = list.filter((s) => {
      if (s.is_late) return true
      return s.submitted_at && hw.deadline ? new Date(s.submitted_at) > new Date(hw.deadline) : false
    })
    const lateNames = new Set(late.map((s) => s.student_id))
    if (missing.length === 0 && lateNames.size === 0) fullyDone++

    const fmtScore = (v: number) => (v === null || v === undefined ? '?' : String(Math.round(Number(v) * 100) / 100))
    const maxScore = hw.max_score ?? 10
    const studentName = (id: string) => students.find((st) => st.id === id)?.name || id
    const studentScore = (id: string) => {
      const s = list.find((x) => x.student_id === id)
      return s ? fmtScore(s.total_score) : '?'
    }
    const typeIcon = hw.type === 'EXAM' ? '📝' : '📄'
    let block = `\n\n${typeIcon} <b>${idx + 1}. ${escapeTelegramHtml(hw.title)}</b>\n   ⏳ Hạn: ${escapeTelegramHtml(formatDeadline(hw.deadline))}`
    if (missing.length === 0 && lateNames.size === 0) {
      const scored = students.map((st) => `${st.name} (${studentScore(st.id)}/${maxScore})`)
      block += `\n   ✅ 100% nộp đúng hạn (${students.length}/${students.length})\n   🏆 Điểm: ${escapeTelegramHtml(scored.join(', '))}`
    } else {
      const doneCount = students.length - missing.length
      block += `\n   📥 Đã nộp: ${doneCount}/${students.length}`
      const onTime = students.filter((st) => submittedIds.has(st.id) && !lateNames.has(st.id))
      if (onTime.length > 0) {
        block += `\n   ✅ Đúng hạn (${onTime.length}): ${escapeTelegramHtml(onTime.map((st) => `${st.name} (${studentScore(st.id)}/${maxScore})`).join(', '))}`
      }
      if (missing.length > 0) {
        block += `\n   ❌ Chưa nộp (${missing.length}): ${escapeTelegramHtml(missing.map((s) => s.name).join(', '))}`
      }
      if (lateNames.size > 0) {
        const names = students.filter((st) => lateNames.has(st.id)).map((st) => `${st.name} (${studentScore(st.id)}/${maxScore})`)
        block += `\n   ⚠️ Nộp muộn (${lateNames.size}): ${escapeTelegramHtml(names.join(', '))}`
      }
    }
    if ((current + block).length > 3500) {
      chunks.push(current)
      current = block.trimStart()
    } else {
      current += block
    }
  })

  current += `\n\n✅ <b>Hoàn thành 100%:</b> ${fullyDone}/${overdue.length} bài`
  chunks.push(current)

  for (const part of chunks) {
    await sendMessage(chatId, part)
  }
}