// Test bộ lọc khoảng hạn nộp của danh sách bài tập (create-homework?deadlineFrom&deadlineTo).
// Chạy: node supabase/scripts/test-deadline-range.mjs
import assert from 'node:assert/strict'
import { parseDeadlineRange } from '../functions/create-homework/deadline-range.ts'

// Không lọc
assert.deepEqual(parseDeadlineRange(null, null), { ok: true, from: null, to: null })
assert.deepEqual(parseDeadlineRange('', '  '), { ok: true, from: null, to: null })

// "Hôm nay" theo giờ Việt Nam (UTC+7) gửi dạng UTC; chuẩn hoá về ISO UTC
const today = parseDeadlineRange('2026-11-25T17:00:00.000Z', '2026-11-26T16:59:59.999Z')
assert.deepEqual(today, { ok: true, from: '2026-11-25T17:00:00.000Z', to: '2026-11-26T16:59:59.999Z' })
// Có offset +07:00 → quy đổi đúng
assert.deepEqual(parseDeadlineRange('2026-11-26T00:00:00+07:00', '2026-11-26T23:59:59+07:00'),
  { ok: true, from: '2026-11-25T17:00:00.000Z', to: '2026-11-26T16:59:59.000Z' })
// Chỉ một đầu
assert.equal(parseDeadlineRange('2026-11-26T00:00:00Z', null).to, null)

// Sai định dạng / thiếu múi giờ / ngày không tồn tại / ngược / quá dài
for (const [f, t] of [['2026-11-26', null], ['2026-11-26T00:00:00', null], ['hôm nay', null], ['2026-13-40T00:00:00Z', null],
  [null, "2026-11-26T00:00:00Z' OR 1=1"]]) {
  assert.equal(parseDeadlineRange(f, t).ok, false, `${f} / ${t} phải bị từ chối`)
}
assert.equal(parseDeadlineRange('2026-11-27T00:00:00Z', '2026-11-26T00:00:00Z').ok, false)
assert.equal(parseDeadlineRange('2025-01-01T00:00:00Z', '2026-11-26T00:00:00Z').ok, false)
assert.equal(parseDeadlineRange('2025-11-26T00:00:00Z', '2026-11-26T00:00:00Z').ok, true)

console.log('ALL DEADLINE-RANGE TESTS PASSED!')
