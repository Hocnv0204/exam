/**
 * Helper cho tính năng "Học sinh có số dư 0 đ".
 *
 * Điều kiện CHÍNH XÁC: `role = 'STUDENT' AND balance = 0`
 * - Không dùng `balance <= 0` (số dư âm không được tính).
 * - NULL không được ép thành 0 (query `.eq('balance', 0)` đã loại NULL).
 * - Mỗi học sinh chỉ được đếm 1 lần dù thuộc nhiều lớp.
 *
 * File này chỉ chứa logic THUẦN (không phụ thuộc Deno/Supabase runtime) để
 * unit-test được bằng Node (xem supabase/scripts/test-zero-balance.mjs).
 */

export const ZERO_BALANCE_DEFAULT_PAGE_SIZE = 20
export const ZERO_BALANCE_MAX_PAGE_SIZE = 100

export interface ZeroBalanceClassJoin {
  class_id: string | null
  classes: { name: string } | null
}

export interface ZeroBalanceProfileRow {
  id: string
  username: string
  full_name: string | null
  class_id: string | null
  balance: number | null
  is_locked?: boolean | null
  student_classes?: ZeroBalanceClassJoin[] | null
}

export interface ZeroBalanceItem {
  id: string
  username: string
  fullName: string
  classId: string | null
  classIds: string[]
  className: string
  balance: number
  isLocked: boolean
  status: string
}

/**
 * Parse số nguyên >= 1 từ query string.
 * - `null`/rỗng => dùng `fallback`.
 * - Giá trị không hợp lệ (không phải số nguyên dương) => `null` (BE trả 400).
 */
export function parsePositiveIntParam(raw: string | null | undefined, fallback: number): number | null {
  if (raw === null || raw === undefined) return fallback
  const trimmed = String(raw).trim()
  if (trimmed === '') return fallback
  if (!/^\d+$/.test(trimmed)) return null
  const value = Number(trimmed)
  if (!Number.isInteger(value) || value < 1) return null
  return value
}

/**
 * Làm sạch từ khoá tìm kiếm trước khi đưa vào filter `or(...)` của PostgREST
 * (ký tự `,` `(` `)` sẽ phá vỡ cú pháp filter).
 */
export function sanitizeSearchTerm(search: string | null | undefined): string {
  return String(search || '').replace(/[,()]/g, '').trim()
}

/** Tạo biểu thức filter tìm kiếm theo tên / mã đăng nhập (null nếu không có từ khoá). */
export function buildZeroBalanceSearchFilter(cleanSearch: string): string | null {
  if (!cleanSearch) return null
  return `full_name.ilike.%${cleanSearch}%,username.ilike.%${cleanSearch}%`
}

/**
 * Lấy danh sách `class_id` legacy (dữ liệu cũ chỉ có `profiles.class_id`,
 * chưa có bản ghi trong `student_classes`) của các học sinh trong `rows`.
 */
export function collectLegacyClassIds(rows: ZeroBalanceProfileRow[]): string[] {
  const ids: string[] = []
  for (const row of rows || []) {
    if (!row || !row.class_id) continue
    const joins = Array.isArray(row.student_classes) ? row.student_classes : []
    const hasJoin = joins.some((join) => join && join.class_id === row.class_id)
    if (!hasJoin && !ids.includes(row.class_id)) ids.push(row.class_id)
  }
  return ids
}

/**
 * Map dòng `profiles` sang payload trả về cho FE.
 * - Gom nhiều lớp của 1 học sinh thành `classIds` / `className`.
 * - Bổ sung tên lớp legacy từ `legacyClassNames` nếu học sinh chỉ có `profiles.class_id`.
 * - Khử trùng id (phòng trường hợp join bị lặp).
 */
export function mapZeroBalanceRows(
  rows: ZeroBalanceProfileRow[],
  legacyClassNames: Record<string, string> = {}
): ZeroBalanceItem[] {
  const items: ZeroBalanceItem[] = []
  const seen = new Set<string>()

  for (const row of rows || []) {
    if (!row || !row.id || seen.has(row.id)) continue
    seen.add(row.id)

    const joins = Array.isArray(row.student_classes) ? row.student_classes : []
    const classIds: string[] = []
    const classNames: string[] = []

    for (const join of joins) {
      if (join?.class_id && !classIds.includes(join.class_id)) classIds.push(join.class_id)
      const name = join?.classes?.name
      if (name && !classNames.includes(name)) classNames.push(name)
    }

    // Dữ liệu legacy: profiles.class_id chưa có trong student_classes
    const legacyName = row.class_id ? legacyClassNames[row.class_id] : undefined
    if (row.class_id && legacyName) {
      if (!classIds.includes(row.class_id)) classIds.push(row.class_id)
      if (!classNames.includes(legacyName)) classNames.push(legacyName)
    }

    const rawBalance = row.balance === null || row.balance === undefined ? 0 : Number(row.balance)

    items.push({
      id: row.id,
      username: row.username,
      fullName: row.full_name || '',
      classId: classIds[0] || row.class_id || null,
      classIds,
      className: classNames.join(', ') || 'Chưa phân lớp',
      balance: Number.isFinite(rawBalance) ? rawBalance : 0,
      isLocked: Boolean(row.is_locked),
      status: row.is_locked ? 'Tạm khóa' : 'Hoạt động',
    })
  }

  return items
}
