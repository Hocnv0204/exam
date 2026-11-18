// Toast kết quả đồng bộ Ngân hàng câu hỏi: không báo "thành công" khi câu chưa gắn được Bài Constant.
import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { autoBankSyncToastMessage } from '../src/js/utils/bank-sync-toast.js'

const base = { enabled: true, createdCount: 0, unattachedCount: 0, skippedDuplicateCount: 0, unsyncedCount: 0, failedCount: 0, reasons: [], target: null }

test('tắt / không có summary -> không toast', () => {
  assert.equal(autoBankSyncToastMessage(null), null)
  assert.equal(autoBankSyncToastMessage({ enabled: false }), null)
})

test('gắn đủ -> success, tên bài không bị escape thành &quot;', () => {
  const m = autoBankSyncToastMessage({ ...base, createdCount: 40, target: { lessonTitle: 'Bài 7. "Hệ trục" tọa độ' } })
  assert.equal(m.type, 'success')
  assert.equal(m.text, 'Ngân hàng câu hỏi: đã gắn 40 câu vào bài "Bài 7. "Hệ trục" tọa độ".')
  assert.ok(!m.text.includes('&quot;'))
})

test('chỉ trùng -> info', () => {
  assert.deepEqual(autoBankSyncToastMessage({ ...base, skippedDuplicateCount: 3 }),
    { type: 'info', text: 'Ngân hàng câu hỏi: không có câu mới, bỏ qua 3 câu đã có.' })
})

test('bug thật: 40 câu "đã lưu" nhưng không câu nào gắn Bài -> warning, nêu hệ quả + lý do', () => {
  const m = autoBankSyncToastMessage({ ...base, createdCount: 40, unattachedCount: 40,
    reasons: [{ questionNumber: 1, reason: 'Câu 1: đã lưu nhưng chưa gắn Bài Constant — Không có Chương Constant tương ứng với "Chương II. Vectơ…"' },
              { questionNumber: 2, reason: 'Câu 2: …' }] })
  assert.equal(m.type, 'warning')
  assert.match(m.text, /^Ngân hàng câu hỏi: đã gắn 0 câu vào đúng bài, 40 câu đã lưu nhưng CHƯA gắn được bài \(sẽ không hiện khi lọc theo Chương\/Bài\)\./)
  assert.match(m.text, /Lý do: Câu 1: đã lưu nhưng chưa gắn Bài Constant — Không có Chương Constant/)
  assert.match(m.text, /và 1 lý do khác/)
  assert.ok(!/đã đồng bộ 40/.test(m.text))
})

test('trộn gắn được / chưa gắn / chưa đồng bộ / trùng', () => {
  const m = autoBankSyncToastMessage({ ...base, createdCount: 5, unattachedCount: 2, unsyncedCount: 1, failedCount: 1, skippedDuplicateCount: 3,
    reasons: [{ reason: 'Câu 4: thiếu [MÔN]' }] })
  assert.equal(m.type, 'warning')
  assert.equal(m.text, 'Ngân hàng câu hỏi: đã gắn 3 câu vào đúng bài, 2 câu đã lưu nhưng CHƯA gắn được bài (sẽ không hiện khi lọc theo Chương/Bài), 2 câu CHƯA đồng bộ, bỏ qua 3 câu đã có. Lý do: Câu 4: thiếu [MÔN]')
})

test('backend cũ chưa có unattachedCount -> giữ hành vi cũ (success)', () => {
  const { unattachedCount, ...old } = base
  assert.equal(autoBankSyncToastMessage({ ...old, createdCount: 2 }).type, 'success')
})

test('create-hw dùng util này; cảnh báo hiện lâu hơn; toast hỗ trợ duration', () => {
  const view = readFileSync(new URL('../src/js/views/create-hw.js', import.meta.url), 'utf8')
  assert.match(view, /import \{ autoBankSyncToastMessage \} from '\.\.\/utils\/bank-sync-toast\.js'/)
  assert.match(view, /msg\.type === 'warning' \? \{ duration: 12000 \}/)
  const toast = readFileSync(new URL('../src/js/components/toast.js', import.meta.url), 'utf8')
  assert.match(toast, /export function showToast\(message, type = 'info', options = \{\}\)/)
})
