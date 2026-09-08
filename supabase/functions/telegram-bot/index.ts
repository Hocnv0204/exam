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
    const message = body.message || body.edited_message
    if (!message) {
      return jsonResponse({ ok: true })
    }

    const chat = message.chat
    const chatId = String(chat.id)
    const chatTitle = chat.title || chat.username || `Chat ${chatId}`
    const text = message.text || message.caption || ''
    const trimmed = text.trim()

    const serviceRoleClient = createServiceRoleClient()

    // /start
    if (trimmed === '/start') {
      await sendMessage(chatId, `Chào mừng bạn đến với Exam Telegram Bot!\n\nĐể liên kết nhóm/kênh với một lớp học, hãy sử dụng lệnh:\n/link <class_id>\n\nVí dụ: /link 123e4567-e89b-12d3-a456-426614174000\n\nLưu ý: Bot cần được thêm vào nhóm/kênh với quyền gửi tin nhắn.`)
      return jsonResponse({ ok: true })
    }

    // /link <class_id>
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