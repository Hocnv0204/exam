/**
 * Helper đọc toàn bộ dữ liệu từ Supabase PostgREST, tránh bị cắt âm thầm ở giới hạn 1000 dòng.
 *
 * YÊU CẦU:
 * Query builder BẮT BUỘC phải có order ổn định (cột unique, ví dụ .order('id'))
 * để phân trang range(offset, offset + pageSize - 1) không bị sót hoặc trùng lặp dữ liệu.
 */

/** Lỗi đọc dữ liệu (DB) — caller phải trả 500, KHÔNG được coi là lỗi xác thực 401. */
export class FetchAllRowsError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'FetchAllRowsError'
  }
}

/** true nếu lỗi đến từ fetchAllRows (lỗi DB), dùng trong catch tổng để chọn mã 500. */
export function isFetchAllRowsError(err: unknown): boolean {
  return (err as { name?: string } | null)?.name === 'FetchAllRowsError'
}

export interface FetchAllRowsOptions {
  /** Số lượng dòng trên mỗi trang yêu cầu PostgREST trả về (mặc định: 1000). */
  pageSize?: number
  /** Ngưỡng an toàn tối đa số dòng được phép nạp vào bộ nhớ (mặc định: 200000). Ném lỗi nếu vượt quá. */
  maxRows?: number
  /** Giới hạn tối đa số dòng muốn lấy (ví dụ 2000 dòng mới nhất). Dừng ngay khi đạt đủ. */
  limit?: number
}

/**
 * Lặp qua các trang bằng .range(offset, offset + pageSize - 1) cho tới khi trang trả về < pageSize.
 */
export async function fetchAllRows<T = any>(
  buildQuery: () => any,
  options: FetchAllRowsOptions = {}
): Promise<T[]> {
  const pageSize = options.pageSize !== undefined && options.pageSize > 0 ? options.pageSize : 1000
  const maxRows = options.maxRows !== undefined ? options.maxRows : 200000
  const limit = options.limit !== undefined && options.limit > 0 ? options.limit : undefined

  const rows: T[] = []

  for (let offset = 0; ; ) {
    const toFetch = limit !== undefined ? Math.min(pageSize, limit - rows.length) : pageSize
    if (toFetch <= 0) break

    const { data, error } = await buildQuery().range(offset, offset + toFetch - 1)
    if (error) {
      const msg = error.message || (typeof error === 'string' ? error : JSON.stringify(error))
      throw new FetchAllRowsError(`fetchAllRows query failed: ${msg}`)
    }

    const page = (data || []) as T[]
    rows.push(...page)

    if (rows.length > maxRows) {
      throw new FetchAllRowsError(`fetchAllRows exceeded maxRows limit of ${maxRows} (fetched ${rows.length})`)
    }

    if (page.length < toFetch || (limit !== undefined && rows.length >= limit)) {
      break
    }

    offset += page.length
  }

  return rows
}

/**
 * Chia danh sách ids thành từng chunk (để không làm URL dài quá giới hạn header HTTP),
 * sau đó đọc toàn bộ dòng của từng chunk bằng fetchAllRows và gộp lại.
 */
export async function fetchAllRowsInChunks<T = any, ID = any>(
  ids: ID[],
  chunkSize: number,
  buildQueryForChunk: (chunk: ID[]) => any,
  options?: FetchAllRowsOptions
): Promise<T[]> {
  if (!ids || ids.length === 0) return []
  const uniqueIds = Array.from(new Set(ids))
  const actualChunkSize = chunkSize > 0 ? chunkSize : 200
  const allRows: T[] = []
  const maxRows = options?.maxRows ?? 200000

  for (let i = 0; i < uniqueIds.length; i += actualChunkSize) {
    const chunk = uniqueIds.slice(i, i + actualChunkSize)
    const chunkOptions: FetchAllRowsOptions = {
      ...options,
      maxRows: maxRows - allRows.length,
      limit: options?.limit !== undefined ? Math.max(0, options.limit - allRows.length) : undefined,
    }

    if (chunkOptions.limit !== undefined && chunkOptions.limit <= 0) {
      break
    }

    const chunkRows = await fetchAllRows<T>(
      () => buildQueryForChunk(chunk),
      chunkOptions
    )
    allRows.push(...chunkRows)

    if (allRows.length > maxRows) {
      throw new FetchAllRowsError(`fetchAllRowsInChunks exceeded maxRows limit of ${maxRows} (fetched ${allRows.length})`)
    }

    if (options?.limit !== undefined && allRows.length >= options.limit) {
      break
    }
  }

  return allRows
}
