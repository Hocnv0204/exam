const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

export class NotificationValidationError extends Error {
  code = 'VALIDATION'

  constructor(message: string) {
    super(message)
    this.name = 'NotificationValidationError'
  }
}

function parseBoundedInteger(value: string | null, fallback: number, field: string): number {
  if (value === null) return fallback
  if (!/^\d+$/.test(value)) throw new NotificationValidationError(`${field} không hợp lệ.`)
  const parsed = Number(value)
  if (!Number.isSafeInteger(parsed) || parsed < 1 || parsed > 50) {
    throw new NotificationValidationError(`${field} phải từ 1 đến 50.`)
  }
  return parsed
}

/** Pure query parser, kept free of Deno/Supabase imports for Node tests. */
export function parseListQuery(url: string | URL): { unreadOnly: boolean; limit: number } {
  const parsed = typeof url === 'string' ? new URL(url) : url
  const unread = parsed.searchParams.get('unread')
  if (unread !== null && unread !== '0' && unread !== '1') {
    throw new NotificationValidationError('unread phải là 0 hoặc 1.')
  }
  return {
    unreadOnly: unread === null ? true : unread === '1',
    limit: parseBoundedInteger(parsed.searchParams.get('limit'), 20, 'limit'),
  }
}

export function parseMarkBody(body: unknown): { all: true } | { ids: string[] } {
  if (!body || typeof body !== 'object' || Array.isArray(body)) {
    throw new NotificationValidationError('Dữ liệu đánh dấu đã đọc không hợp lệ.')
  }
  const input = body as { all?: unknown; ids?: unknown }
  if (input.all === true) return { all: true }
  if (!Array.isArray(input.ids) || input.ids.length === 0) {
    throw new NotificationValidationError('ids phải chứa từ 1 đến 50 mã thông báo.')
  }
  const ids = [...new Set(input.ids)]
  if (ids.length > 50) {
    throw new NotificationValidationError('ids phải chứa từ 1 đến 50 mã thông báo.')
  }
  if (ids.some((id) => typeof id !== 'string' || !UUID_RE.test(id))) {
    throw new NotificationValidationError('ids chứa mã thông báo không hợp lệ.')
  }
  return { ids }
}

export function mapNotificationRow(row: any) {
  return {
    id: row.id,
    title: row.title,
    content: row.content,
    type: row.type,
    relatedId: row.related_id ?? null,
    isRead: !!row.is_read,
    createdAt: row.created_at,
  }
}
