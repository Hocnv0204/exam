// Bộ lọc khoảng hạn nộp cho danh sách bài tập (thuần, test được bằng Node).
// deadlineFrom / deadlineTo: chuỗi ISO 8601 có múi giờ (vd 2026-11-25T17:00:00.000Z). Thiếu cả hai → không lọc.

export type DeadlineRange =
  | { ok: true; from: string | null; to: string | null }
  | { ok: false; error: string }

const ISO_WITH_ZONE = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(:\d{2}(\.\d{1,6})?)?(Z|[+-]\d{2}:\d{2})$/

function normalize(raw: string | null): { ok: true; value: string | null } | { ok: false } {
  if (raw === null || raw === undefined || raw.trim() === '') return { ok: true, value: null }
  const text = raw.trim()
  if (!ISO_WITH_ZONE.test(text)) return { ok: false }
  const ms = Date.parse(text)
  if (!Number.isFinite(ms)) return { ok: false }
  return { ok: true, value: new Date(ms).toISOString() }
}

export function parseDeadlineRange(fromRaw: string | null, toRaw: string | null): DeadlineRange {
  const from = normalize(fromRaw)
  const to = normalize(toRaw)
  if (!from.ok || !to.ok) {
    return { ok: false, error: 'deadlineFrom/deadlineTo phải là thời điểm ISO 8601 có múi giờ' }
  }
  if (from.value && to.value && Date.parse(from.value) > Date.parse(to.value)) {
    return { ok: false, error: 'deadlineFrom phải nhỏ hơn hoặc bằng deadlineTo' }
  }
  // Giới hạn khoảng ≤ 366 ngày để tránh truy vấn vô nghĩa; bộ lọc "hôm nay" chỉ ~1 ngày.
  if (from.value && to.value && Date.parse(to.value) - Date.parse(from.value) > 366 * 86400000) {
    return { ok: false, error: 'Khoảng hạn nộp tối đa 366 ngày' }
  }
  return { ok: true, from: from.value, to: to.value }
}
