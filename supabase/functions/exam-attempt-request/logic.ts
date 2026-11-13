export type InlineKeyboard = Array<Array<{ text: string; callback_data: string }>>

const RPC_ERRORS: Record<string, { status: number; message: string }> = {
  NOT_AT_LIMIT: { status: 409, message: 'Bạn vẫn còn lượt làm bài, không cần yêu cầu thêm.' },
  REQUEST_PENDING: { status: 409, message: 'Bạn đã có một yêu cầu đang chờ duyệt.' },
  REQUEST_DAILY_LIMIT: { status: 429, message: 'Bạn đã gửi tối đa 3 yêu cầu cho bài thi này hôm nay.' },
  FORBIDDEN: { status: 403, message: 'Bạn không được giao bài thi này.' },
  INVALID_EXAM: { status: 404, message: 'Bài thi không tồn tại hoặc chưa mở.' },
}

export function mapRpcError(message: unknown): { code: string; status: number; message: string } | null {
  const text = String(message || '')
  for (const [code, value] of Object.entries(RPC_ERRORS)) {
    if (text.includes(code)) return { code, ...value }
  }
  return null
}

/** Kept local so this module stays runnable in Node without Deno or Supabase imports. */
export function escapeTelegramHtml(value: unknown): string {
  return String(value ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
}

function formatVietnamTime(value: string | Date): string {
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return '—'
  const parts = new Intl.DateTimeFormat('en-GB', {
    timeZone: 'Asia/Ho_Chi_Minh', hour: '2-digit', minute: '2-digit', day: '2-digit', month: '2-digit', year: 'numeric', hour12: false,
  }).formatToParts(date)
  const part = (type: string) => parts.find((item) => item.type === type)?.value || '—'
  return `${part('hour')}:${part('minute')} ${part('day')}/${part('month')}/${part('year')}`
}

export function buildAdminMessage(input: {
  studentName: unknown
  username: unknown
  className: unknown
  homeworkTitle: unknown
  attemptsUsed: unknown
  allowance: unknown
  requestedAt: string | Date
}): string {
  return `🙋 <b>Yêu cầu thêm lượt thi</b>\nHọc sinh: <b>${escapeTelegramHtml(input.studentName)}</b> (${escapeTelegramHtml(input.username)})\nLớp: ${escapeTelegramHtml(input.className)}\nBài thi: <b>${escapeTelegramHtml(input.homeworkTitle)}</b>\nĐã dùng: ${escapeTelegramHtml(input.attemptsUsed)}/${escapeTelegramHtml(input.allowance)} lượt\nGửi lúc: ${escapeTelegramHtml(formatVietnamTime(input.requestedAt))} giờ VN`
}

export function buildKeyboard(requestId: string): InlineKeyboard {
  const keyboard: InlineKeyboard = [[
    { text: '✅ Xác nhận', callback_data: `ar:ok:${requestId}` },
    { text: '❌ Từ chối', callback_data: `ar:no:${requestId}` },
  ]]
  for (const button of keyboard[0]) {
    if (new TextEncoder().encode(button.callback_data).byteLength > 64) {
      throw new Error('callback_data exceeds Telegram 64-byte limit')
    }
  }
  return keyboard
}

/** Start of the current Vietnam calendar day, expressed as an absolute Date. */
export function vnDayStart(now: Date): Date {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Ho_Chi_Minh', year: 'numeric', month: '2-digit', day: '2-digit',
  }).formatToParts(now)
  const part = (type: string) => Number(parts.find((item) => item.type === type)?.value)
  // Vietnam is UTC+07 and does not observe daylight saving time.
  return new Date(Date.UTC(part('year'), part('month') - 1, part('day'), -7, 0, 0, 0))
}

export function isUuid(value: unknown): value is string {
  return typeof value === 'string' && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value)
}
