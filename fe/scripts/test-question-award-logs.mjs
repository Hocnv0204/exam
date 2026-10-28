import assert from 'node:assert/strict'
import {
  escapeAwardLogHtml,
  formatAwardDelta,
  formatAwardTime,
  describeAwardLog,
  summarizeAwardLogs,
  buildAwardLogEntriesHtml,
  buildAwardLogSectionHtml,
  buildAwardLogBadgeHtml
} from '../src/js/utils/question-award-logs.js'

console.log('=== Kiểm thử Helper Nhật ký Cộng điểm theo câu ===\n')

// --- Escape dữ liệu người dùng (tên admin, tiêu đề phần) ---
assert.equal(escapeAwardLogHtml('<img src=x onerror=alert(1)>'), '&lt;img src=x onerror=alert(1)&gt;')
assert.equal(escapeAwardLogHtml(`a"b'c&d`), 'a&quot;b&#39;c&amp;d')
assert.equal(escapeAwardLogHtml(null), '')

// --- Delta ---
assert.equal(formatAwardDelta(0.5), '+0.5đ')
assert.equal(formatAwardDelta('0.33'), '+0.33đ')
assert.equal(formatAwardDelta(1), '+1đ')
assert.equal(formatAwardDelta(0), null)
assert.equal(formatAwardDelta(-1), null)
assert.equal(formatAwardDelta('abc'), null)
assert.equal(formatAwardDelta(undefined), null)

// --- Thời gian ---
assert.equal(formatAwardTime(null), null)
assert.equal(formatAwardTime('not-a-date'), null)
assert.ok(formatAwardTime('2026-10-28T03:00:00.000Z'))

// --- Một dòng log ---
const log = {
  delta: 0.5,
  questionNumber: 2,
  partTitle: 'Phần 3',
  actorName: 'Nguyễn Văn A',
  createdAt: '2026-10-28T03:00:00.000Z'
}
const line = describeAwardLog(log)
assert.ok(line.startsWith('Cộng điểm câu 2: +0.5đ · Nguyễn Văn A'), line)
assert.ok(line.includes(formatAwardTime(log.createdAt)))
// Thiếu questionNumber -> fallback partTitle (đã escape)
const line2 = describeAwardLog({ delta: 0.25, partTitle: 'Phần <b>3</b>', actorName: 'Admin', createdAt: null })
assert.ok(line2.startsWith('Cộng điểm phần Phần &lt;b&gt;3&lt;/b&gt;: +0.25đ · Admin'), line2)
assert.ok(!line2.includes('<b>3</b>'), 'partTitle phải được escape')
// Không có delta hợp lệ -> null (không render)
assert.equal(describeAwardLog({ delta: 0 }), null)
assert.equal(describeAwardLog(null), null)
// Tên admin độc hại được escape
const evil = describeAwardLog({ delta: 1, questionNumber: 1, actorName: '<script>alert(1)</script>', createdAt: null })
assert.ok(!evil.includes('<script>'), evil)

// --- Tổng hợp ---
assert.equal(summarizeAwardLogs([]), null)
assert.equal(summarizeAwardLogs(undefined), null)
assert.equal(summarizeAwardLogs([{ delta: 0 }]), null)
const summary = summarizeAwardLogs([
  { delta: 0.5, createdAt: '2026-10-28T03:00:00.000Z' },
  { delta: 0.25, createdAt: '2026-10-28T05:00:00.000Z' },
  { delta: 'x', createdAt: '2026-10-28T06:00:00.000Z' } // dòng rác bị bỏ
])
assert.deepEqual(summary, { count: 2, totalDelta: 0.75, lastAt: '2026-10-28T05:00:00.000Z' })
// Làm tròn 2 chữ số tránh lỗi binary floating point
assert.equal(summarizeAwardLogs([{ delta: 0.1 }, { delta: 0.2 }]).totalDelta, 0.3)

// --- Entries / Section ---
assert.equal(buildAwardLogEntriesHtml([]), '')
assert.equal(buildAwardLogEntriesHtml(undefined), '')
const entries = buildAwardLogEntriesHtml([log])
assert.ok(entries.includes('Cộng điểm câu 2: +0.5đ'))
assert.equal(buildAwardLogSectionHtml([]), '')
assert.equal(buildAwardLogSectionHtml(undefined), '')
const section = buildAwardLogSectionHtml([log])
assert.ok(section.includes('Nhật ký cộng điểm theo câu'))
assert.ok(section.includes('Cộng điểm câu 2'))
assert.ok(section.includes('Nguyễn Văn A'))

// --- Badge danh sách ---
assert.equal(buildAwardLogBadgeHtml([]), '')
assert.equal(buildAwardLogBadgeHtml(undefined), '')
assert.equal(buildAwardLogBadgeHtml([{ delta: 0 }]), '')
// 1 lần cộng: hiện thẳng dòng mô tả, không có nút expand
const badgeSingle = buildAwardLogBadgeHtml([log], { targetId: 'sub-1' })
assert.ok(badgeSingle.includes('Cộng điểm câu 2: +0.5đ'))
assert.ok(!badgeSingle.includes('award-logs-toggle-btn'))
// Nhiều lần: badge tổng + nút expand trỏ đúng targetId (UUID hợp lệ)
const badgeMulti = buildAwardLogBadgeHtml([
  log,
  { delta: 0.25, questionNumber: 5, actorName: 'Admin', createdAt: '2026-10-28T05:00:00.000Z' }
], { targetId: '22222222-2222-4222-8222-222222222222' })
assert.ok(badgeMulti.includes('+0.75đ'), badgeMulti)
assert.ok(badgeMulti.includes('(2 lần)'), badgeMulti)
assert.ok(badgeMulti.includes('award-logs-toggle-btn'))
assert.ok(badgeMulti.includes('data-award-target="award-logs-22222222-2222-4222-8222-222222222222"'))
assert.ok(badgeMulti.includes('id="award-logs-22222222-2222-4222-8222-222222222222"'))
// targetId không phải UUID (không thể gán id tùy ý) -> fallback ngẫu nhiên, không rò nguyên gốc
const badgeBadTarget = buildAwardLogBadgeHtml([log, log], { targetId: '"><script>' })
assert.ok(!badgeBadTarget.includes('"><script>'), badgeBadTarget)
// Tên admin độc hại không lọt thẳng vào HTML
const badgeEvil = buildAwardLogBadgeHtml([
  { delta: 1, questionNumber: 1, actorName: '<img src=x>', createdAt: null }
])
assert.ok(!badgeEvil.includes('<img'), badgeEvil)

console.log('Question award log FE helpers passed')
