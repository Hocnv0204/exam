// Helper Telegram Bot API dùng chung cho các Edge Function (không log token / nội dung tin nhắn).
const TOKEN_ENV = 'TELEGRAM_BOT_TOKEN'

export class TelegramDeliveryError extends Error {
  constructor(public method: string, public status: number, public retryable: boolean) {
    super(`Telegram ${method} failed (${status || 'network'})`)
    this.name = 'TelegramDeliveryError'
  }
}

type TelegramResult<T> = { ok?: boolean; error_code?: number; result?: T }

/** Gọi Telegram Bot API; trả `result`. Lỗi → TelegramDeliveryError (retryable trừ 400/401/403/404). */
export async function telegramCall<T = unknown>(method: string, payload: Record<string, unknown>, token = Deno.env.get(TOKEN_ENV) || ''): Promise<T> {
  if (!token) throw new TelegramDeliveryError(method, 0, false)
  let response: Response
  try {
    response = await fetch(`https://api.telegram.org/bot${token}/${method}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
      // Không để học sinh chờ tới timeout runtime khi Telegram chậm (yêu cầu đã lưu ở DB).
      signal: AbortSignal.timeout(10_000),
    })
  } catch {
    throw new TelegramDeliveryError(method, 0, true)
  }
  let body: TelegramResult<T> | null = null
  try { body = await response.json() } catch { /* malformed */ }
  if (!response.ok || body?.ok !== true) {
    const status = response.status >= 400 ? response.status : body?.error_code || 0
    throw new TelegramDeliveryError(method, status, ![400, 401, 403, 404].includes(status))
  }
  return body.result as T
}

export type InlineKeyboard = Array<Array<{ text: string; callback_data: string }>>

export async function sendMessageWithKeyboard(chatId: string, text: string, keyboard: InlineKeyboard): Promise<{ message_id: number }> {
  return await telegramCall<{ message_id: number }>('sendMessage', {
    chat_id: chatId, text, parse_mode: 'HTML', disable_web_page_preview: true, reply_markup: { inline_keyboard: keyboard },
  })
}

export function escapeTelegramHtml(value: unknown): string {
  return String(value ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
}

/** "123, -456" → ['123','-456'] (chỉ id số, bỏ rỗng/trùng). */
export function parseIdList(raw: string | undefined | null): string[] {
  return [...new Set(String(raw || '').split(/[\s,]+/).map(s => s.trim()).filter(s => /^-?\d{1,20}$/.test(s)))]
}
