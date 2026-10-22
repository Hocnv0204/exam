/**
 * Edge action handler cho tính năng "Học sinh có số dư 0 đ".
 *
 * GET create-student?action=zero-balance-count[&classId=&search=]
 *   -> { count: 12 }
 * GET create-student?action=zero-balance-list[&classId=&search=&page=1&pageSize=20]
 *   -> { items: [...], total: 12, page: 1, pageSize: 20 }
 *
 * Chỉ ADMIN gọi được (requireAdmin chạy trước khi vào handler).
 * File này dùng Web API `Response` (không phụ thuộc Deno runtime) để test được
 * bằng Node: xem supabase/scripts/test-zero-balance.mjs.
 */

import { jsonResponse, errorResponse } from './response-helper.ts'
import {
  ZERO_BALANCE_DEFAULT_PAGE_SIZE,
  ZERO_BALANCE_MAX_PAGE_SIZE,
  parsePositiveIntParam,
  sanitizeSearchTerm,
  buildZeroBalanceSearchFilter,
  collectLegacyClassIds,
  mapZeroBalanceRows,
} from './zero-balance.ts'

/**
 * Client tối thiểu cho các truy vấn Supabase (service role).
 * Dùng interface cấu trúc để không phụ thuộc type sinh tự động của DB.
 */
export type ZeroBalanceQueryClient = {
  from: (table: string) => any
}

/**
 * Lấy danh sách id học sinh thuộc lớp.
 * Gộp 2 nguồn dữ liệu:
 * - `student_classes`: học sinh gắn vào lớp (có thể thuộc nhiều lớp).
 * - `profiles.class_id`: dữ liệu legacy (học sinh chỉ có 1 lớp cũ).
 * Khử trùng id trước khi lọc để mỗi học sinh chỉ xuất hiện 1 lần.
 */
export async function resolveStudentIdsInClass(client: ZeroBalanceQueryClient, classId: string) {
  // 2 truy vấn độc lập -> chạy SONG SONG để tiết kiệm 1 round-trip
  const [joinsRes, legacyRes] = await Promise.all([
    client
      .from('student_classes')
      .select('student_id')
      .eq('class_id', classId),
    client
      .from('profiles')
      .select('id')
      .eq('class_id', classId)
      .eq('role', 'STUDENT'),
  ])

  if (joinsRes.error) return { ids: null as string[] | null, error: joinsRes.error.message as string }
  if (legacyRes.error) return { ids: null as string[] | null, error: legacyRes.error.message as string }

  const idSet = new Set<string>()
  for (const j of joinsRes.data || []) idSet.add(j.student_id)
  for (const p of legacyRes.data || []) idSet.add(p.id)

  return { ids: Array.from(idSet), error: null as string | null }
}

/**
 * Xử lý 2 action thống kê học sinh có số dư bằng 0.
 * Điều kiện chính xác: role = 'STUDENT' AND balance = 0.
 */
export async function handleZeroBalanceAction(
  client: ZeroBalanceQueryClient,
  url: URL,
  action: string
): Promise<Response> {
  const classId = url.searchParams.get('classId') || url.searchParams.get('class_id') || ''
  const search = (url.searchParams.get('search') || url.searchParams.get('q') || '').trim()
  const cleanSearch = sanitizeSearchTerm(search)
  const searchFilter = buildZeroBalanceSearchFilter(cleanSearch)

  // Validate tham số phân trang TRƯỚC khi lọc lớp.
  // Mọi request list đều phải bị từ chối (400) khi page/pageSize không hợp lệ,
  // kể cả khi lớp không có học sinh (nhánh return sớm bên dưới) - nếu validate
  // sau thì nhánh return sớm sẽ bỏ qua validation và trả page/pageSize rác.
  let page = 1
  let pageSize = ZERO_BALANCE_DEFAULT_PAGE_SIZE
  if (action !== 'zero-balance-count') {
    const parsedPage = parsePositiveIntParam(url.searchParams.get('page'), 1)
    if (parsedPage === null) {
      return errorResponse('Invalid "page" parameter: must be an integer >= 1', 400)
    }

    const parsedPageSize = parsePositiveIntParam(url.searchParams.get('pageSize'), ZERO_BALANCE_DEFAULT_PAGE_SIZE)
    if (parsedPageSize === null || parsedPageSize > ZERO_BALANCE_MAX_PAGE_SIZE) {
      return errorResponse(
        `Invalid "pageSize" parameter: must be an integer between 1 and ${ZERO_BALANCE_MAX_PAGE_SIZE}`,
        400
      )
    }

    page = parsedPage
    pageSize = parsedPageSize
  }

  // Lọc lớp (nếu có): gộp student_classes + profiles.class_id, khử trùng id
  let studentIdsInClass: string[] | null = null
  if (classId) {
    const { ids, error } = await resolveStudentIdsInClass(client, classId)
    if (error) return errorResponse(error, 500)
    studentIdsInClass = ids

    // Lớp không có học sinh nào -> trả đúng contract của action, không trả mảng trần
    // (page/pageSize đã được validate ở trên => dùng lại giá trị đã kiểm tra)
    if (ids && ids.length === 0) {
      if (action === 'zero-balance-count') return jsonResponse({ count: 0 })
      return jsonResponse({ items: [], total: 0, page, pageSize })
    }
  }

  if (action === 'zero-balance-count') {
    // Đếm bằng count exact + head (không tải toàn bộ danh sách chỉ để đếm)
    let countQuery = client
      .from('profiles')
      .select('id', { count: 'exact', head: true })
      .eq('role', 'STUDENT')
      .eq('balance', 0)

    if (studentIdsInClass) countQuery = countQuery.in('id', studentIdsInClass)
    if (searchFilter) countQuery = countQuery.or(searchFilter)

    const { count, error } = await countQuery
    if (error) return errorResponse(error.message, 500)

    return jsonResponse({ count: count ?? 0 })
  }

  // ----- zero-balance-list ----- (page/pageSize đã validate ở trên)
  const from = (page - 1) * pageSize
  const to = from + pageSize - 1

  let listQuery = client
    .from('profiles')
    .select(
      `
        id,
        username,
        full_name,
        role,
        class_id,
        balance,
        is_locked,
        student_classes (
          class_id,
          classes (name)
        )
      `,
      { count: 'exact' }
    )
    .eq('role', 'STUDENT')
    .eq('balance', 0)
    // Sắp xếp ổn định để phân trang không trùng / bỏ sót khi dữ liệu đứng yên
    .order('full_name', { ascending: true })
    .order('id', { ascending: true })
    .range(from, to)

  if (studentIdsInClass) listQuery = listQuery.in('id', studentIdsInClass)
  if (searchFilter) listQuery = listQuery.or(searchFilter)

  const { data, count, error } = await listQuery
  if (error) return errorResponse(error.message, 500)

  const rows = (data || []) as any[]

  // Tên lớp fallback cho dữ liệu legacy (profiles.class_id chưa có trong student_classes)
  const legacyClassIds = collectLegacyClassIds(rows)
  const legacyClassNames: Record<string, string> = {}
  if (legacyClassIds.length > 0) {
    const { data: classRows, error: classError } = await client
      .from('classes')
      .select('id, name')
      .in('id', legacyClassIds)
    if (classError) return errorResponse(classError.message, 500)
    for (const c of classRows || []) {
      if (c?.id && c?.name) legacyClassNames[c.id] = c.name
    }
  }

  const items = mapZeroBalanceRows(rows, legacyClassNames)

  return jsonResponse({
    items,
    total: count ?? items.length,
    page,
    pageSize,
  })
}
