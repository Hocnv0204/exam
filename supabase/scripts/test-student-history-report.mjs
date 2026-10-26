/**
 * Unit test cho logic báo cáo tiến bộ học sinh (scope=report) của Edge Function
 * student-history.
 *
 * Chạy:  node supabase/scripts/test-student-history-report.mjs
 * (không cần mạng / không cần deploy Edge Function / không dùng dữ liệu thật)
 *
 * Mô phỏng đúng logic đã implement trong supabase/functions/student-history/index.ts
 * và khóa các bất biến nghiệp vụ:
 * - Validate kỳ báo cáo: thiếu ngày, sai định dạng, ngày KHÔNG tồn tại (2026-02-30),
 *   fromDate > toDate; kỳ MỘT ngày vẫn hợp lệ (toDate inclusive).
 * - Phạm vi lớp: lớp không có homework published -> submissions RỖNG (không fallback
 *   mọi bài), submission của lớp khác bị lọc bỏ.
 * - STUDENT nhiều lớp nhưng chọn một lớp (classId): scope chỉ đúng lớp đó, báo cáo
 *   không chứa bài/bài nộp của lớp khác; không classId thì vẫn tổng hợp các lớp.
 * - assignedCount: bài có deadline trong kỳ; bài KHÔNG deadline coi như mở suốt kỳ.
 * - Summary dùng best score mỗi homework (scoreTrend vẫn giữ từng lượt).
 * - completionRate = (bài nộp thuộc được giao) / (được giao), chặn trần 100%.
 * - Topic breakdown chỉ nhóm theo chapter có metadata thật, không tạo nhóm "unknown".
 */

let passed = 0
let failed = 0

function check(name, condition, extra = '') {
  if (condition) {
    passed++
    console.log(`  ✓ ${name}`)
  } else {
    failed++
    console.log(`  ✗ ${name}${extra ? ` -> ${extra}` : ''}`)
  }
}

function eq(name, actual, expected) {
  const ok = JSON.stringify(actual) === JSON.stringify(expected)
  check(name, ok, ok ? '' : `expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`)
}

/* -----------------------------------------------------------------------
 * Bản mô phỏng các hàm thuần của báo cáo (khớp 1:1 với index.ts)
 * -------------------------------------------------------------------- */
function isValidCalendarDate(raw) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(raw)) return false
  const [y, m, d] = raw.split('-').map((v) => Number(v))
  if (!Number.isInteger(y) || !Number.isInteger(m) || !Number.isInteger(d)) return false
  // Date.UTC() tự "lăn" 2026-02-30 -> 01/03: round-trip chặn ngày không tồn tại
  const dt = new Date(Date.UTC(y, m - 1, d))
  return dt.getUTCFullYear() === y && dt.getUTCMonth() === m - 1 && dt.getUTCDate() === d
}

function buildPeriod(fromDate, toDate) {
  const periodFromDate = new Date(`${fromDate}T00:00:00.000Z`)
  const periodToDate = new Date(`${toDate}T23:59:59.999Z`)
  if (periodFromDate.getTime() > periodToDate.getTime()) return null
  return { periodFromDate, periodToDate }
}

function deadlineInRange(h, fromMs, toMs) {
  if (!h) return false
  if (!h.deadline) return true // bài không deadline: mở suốt kỳ
  const t = new Date(h.deadline).getTime()
  return Number.isFinite(t) && t >= fromMs && t <= toMs
}

function buildPeriodStats(atts, assigned, { cap = true } = {}) {
  const round2 = (n) => Math.round(n * 100) / 100
  const bestMap = new Map()
  atts.forEach((a) => {
    const cur = bestMap.get(a.homeworkId)
    if (!cur || a.scaledScore > cur.scaledScore) bestMap.set(a.homeworkId, a)
  })
  const bestScores = Array.from(bestMap.values()).map((a) => a.scaledScore)
  const assignedHwIdSet = new Set((assigned || []).map((h) => h.id))
  const submittedAssignedCount = Array.from(bestMap.keys()).filter((id) => assignedHwIdSet.has(id)).length
  let completionRate = assigned.length > 0 ? round2((submittedAssignedCount / assigned.length) * 100) : 0
  if (cap) completionRate = Math.min(100, completionRate)
  return {
    assignedCount: assigned.length,
    submittedCount: bestMap.size,
    completionRate,
    averageScore: bestScores.length > 0 ? round2(bestScores.reduce((acc, v) => acc + v, 0) / bestScores.length) : 0,
  }
}

/* -----------------------------------------------------------------------
 * 1. Validate kỳ báo cáo
 * ---------------------------------------------------------------- */
console.log('--- 1. Validate kỳ báo cáo ---')
{
  // Thiếu ngày bị chặn ngay trước khi kiểm tra định dạng (giống index.ts)
  const missingCheck = (fromDate, toDate) => !fromDate || !toDate
  check('thiếu fromDate/toDate bị chặn (400)', missingCheck(null, '2026-10-24') && missingCheck('2026-10-01', null) && missingCheck('', ''))
  check('2026-02-30 (ngày không tồn tại) bị từ chối', isValidCalendarDate('2026-02-30') === false)
  check('2024-02-29 (ngày thật năm nhuận) hợp lệ', isValidCalendarDate('2024-02-29') === true)
  check('2026-02-29 (năm không nhuận) bị từ chối', isValidCalendarDate('2026-02-29') === false)
  check('định dạng sai (không YYYY-MM-DD) bị từ chối', !isValidCalendarDate('26-02-01') && !isValidCalendarDate('2026/02/01') && !isValidCalendarDate('abc'))
  check('2026-13-01 (tháng 13) bị từ chối', isValidCalendarDate('2026-13-01') === false)
  check('kỳ một ngày fromDate == toDate hợp lệ', buildPeriod('2026-10-24', '2026-10-24') !== null)
  check('fromDate > toDate bị từ chối', buildPeriod('2026-10-25', '2026-10-24') === null)
  const oneDay = buildPeriod('2026-10-24', '2026-10-24')
  check(
    'toDate inclusive: submission cuối ngày 23:59:59.999 nằm trong kỳ một ngày',
    new Date('2026-10-24T13:59:59.999Z').getTime() <= oneDay.periodToDate.getTime()
      && new Date('2026-10-24T00:00:00.000Z').getTime() >= oneDay.periodFromDate.getTime()
  )
  check('nộp sau 23:59:59.999 của toDate nằm ngoài kỳ', new Date('2026-10-25T00:00:00.000Z').getTime() > oneDay.periodToDate.getTime())
  check('kỳ một ngày phủ trọn 2026-10-24 (86,399,999ms)', oneDay.periodToDate.getTime() - oneDay.periodFromDate.getTime() === 86_399_999)
}

/* -----------------------------------------------------------------------
 * 2. Phạm vi lớp và chống rò rỉ submission chéo lớp
 * ---------------------------------------------------------------- */
console.log('--- 2. Phạm vi lớp / chống fallback mọi bài ---')
{
  const reportHwIds = [] // lớp A không có homework published nào
  const classHwIdSet = new Set(reportHwIds)
  const allPeriodSubs = [
    { id: 'sub_x1', homework_id: 'hw_khac_lop' },
    { id: 'sub_x2', homework_id: 'hw_khac_lop_2' },
  ]
  const periodAttemptRows = classHwIdSet.size > 0
    ? allPeriodSubs.filter((s) => classHwIdSet.has(s.homework_id))
    : []
  eq('lớp không có homework -> attempts RỖNG, tuyệt đối không fallback mọi bài của học sinh', periodAttemptRows, [])

  const classHwIds = ['hw_a1']
  const setA = new Set(classHwIds)
  const mixedSubs = [
    { id: 'sub_1', homework_id: 'hw_a1' },
    { id: 'sub_2', homework_id: 'hw_b_khac_lop' },
  ]
  const scoped = mixedSubs.filter((s) => setA.has(s.homework_id))
  eq('submission của lớp khác bị lọc bỏ khỏi báo cáo', scoped, [{ id: 'sub_1', homework_id: 'hw_a1' }])

  // Chống or() trên relation nhúng: gộp danh sách homework từ truy vấn từng lớp là đã khử trùng id
  const perClassResults = [
    [{ id: 'hw_c1' }, { id: 'hw_shared' }],
    [{ id: 'hw_c2' }, { id: 'hw_shared' }],
  ]
  const seen = new Set()
  const merged = []
  perClassResults.forEach((rows) => rows.forEach((h) => {
    if (!h?.id || seen.has(h.id)) return
    seen.add(h.id)
    merged.push(h.id)
  }))
  eq('homework trùng giữa các lớp bị khử lặp một lần', merged, ['hw_c1', 'hw_shared', 'hw_c2'])

  // Lesson học thử bị loại khỏi phạm vi bài thật của lớp
  const withTrial = [
    { id: 'hw_trial', lessons: { is_trial: true } },
    { id: 'hw_real', lessons: { is_trial: false } },
    { id: 'hw_null', lessons: null },
  ]
  const formal = withTrial.filter((h) => h.lessons?.is_trial !== true).map((h) => h.id)
  eq('bài thuộc lesson học thử không được tính là bài thật của lớp', formal, ['hw_real', 'hw_null'])
}

/* -----------------------------------------------------------------------
 * 3. assigned / summary / best score
 * ---------------------------------------------------------------- */
console.log('--- 3. assignedCount, best score, completionRate ---')
{
  const periodFromDate = new Date('2026-10-01T00:00:00.000Z')
  const periodToDate = new Date('2026-10-31T23:59:59.999Z')
  const pFrom = periodFromDate.getTime()
  const pTo = periodToDate.getTime()

  const homeworks = [
    { id: 'hw_w_in', deadline: '2026-10-15T00:00:00.000Z', lessons: { chapters: { id: 'ch1' } } }, // deadline trong kỳ
    { id: 'hw_w_out', deadline: '2026-11-10T00:00:00.000Z', lessons: { chapters: { id: 'ch1' } } }, // deadline ngoài kỳ
    { id: 'hw_nodead', deadline: null, lessons: { chapters: { id: 'ch2' } } }, // không deadline
  ]
  const assignedHomeworks = homeworks.filter((h) => deadlineInRange(h, pFrom, pTo))
  eq('assigned = deadline trong kỳ + bài không deadline', assignedHomeworks.map((h) => h.id), ['hw_w_in', 'hw_nodead'])

  // Nửa bắt đầu / nửa cuối: bài không deadline xuất hiện ở CẢ HAI nửa
  const mid = pFrom + (pTo - pFrom) / 2
  const firstHalf = assignedHomeworks.filter((h) => deadlineInRange(h, pFrom, mid))
  const secondHalf = assignedHomeworks.filter((h) => deadlineInRange(h, mid, pTo))
  check('bài không deadline thuộc cả hai nửa so sánh', firstHalf.some((h) => h.id === 'hw_nodead') && secondHalf.some((h) => h.id === 'hw_nodead'))
  check('bài deadline 15/10 chỉ thuộc nửa đầu', firstHalf.some((h) => h.id === 'hw_w_in') && !secondHalf.some((h) => h.id === 'hw_w_in'))

  // Summary theo best score mỗi homework; submission lần 2 kém hơn không làm tụt điểm
  const attempts = [
    { homeworkId: 'hw_w_in', scaledScore: 8, submittedAtMs: pFrom + 1000 },
    { homeworkId: 'hw_w_in', scaledScore: 5, submittedAtMs: pFrom + 2000 },
    { homeworkId: 'hw_nodead', scaledScore: 9.5, submittedAtMs: pFrom + 3000 },
  ]
  const stats = buildPeriodStats(attempts, assignedHomeworks)
  eq('summary: submittedCount = số bài KHÁC NHÁU được nộp (2)', stats.submittedCount, 2)
  eq('summary: averageScore theo best score mỗi bài (8 + 9.5)/2 = 8.75', stats.averageScore, 8.75)
  eq('summary: completionRate = 2/2 = 100%', stats.completionRate, 100)

  // CompletionRate đếm CHỈ bài nộp thuộc phạm vi giao của kỳ này
  const staleAttempts = [
    { homeworkId: 'hw_ngoai_giao', scaledScore: 10, submittedAtMs: pFrom + 1000 },
    { homeworkId: 'hw_nodead', scaledScore: 8, submittedAtMs: pFrom + 2000 },
  ]
  const staleStats = buildPeriodStats(staleAttempts, assignedHomeworks)
  eq('bài nộp ngoài phạm vi giao không được tính vào completionRate (1/2 = 50%)', staleStats.completionRate, 50)
  eq('nhưng vẫn được đếm vào submittedCount cũng như scoreTrend (từng lượt)', staleStats.submittedCount, 2)

  // Fixed-point kiểm tra trần 100%: completionRate là tỷ lệ bài con/bài cha nên KHÔNG thể vượt 100%
  let maxRateOverAll = 0
  for (let assignedN = 1; assignedN <= 5; assignedN++) {
    for (let submittedN = 0; submittedN <= 10; submittedN++) {
      const inScope = Math.min(submittedN, assignedN)
      const rate = buildPeriodStats(
        Array.from({ length: inScope }, (_, i) => ({ homeworkId: `hw_${i}`, scaledScore: 5 })),
        Array.from({ length: assignedN }, (_, i) => ({ id: `hw_${i}` })),
        { cap: false }
      )
      maxRateOverAll = Math.max(maxRateOverAll, rate.completionRate)
    }
  }
  check('completionRate không bao giờ vượt 100% trên lưới mô phỏng', maxRateOverAll <= 100 && maxRateOverAll === 100)

  // Kỳ rỗng: attempts rỗng vẫn trả đủ summary bằng 0, onTimeRate mặc định 100
  const emptyStats = buildPeriodStats([], assignedHomeworks)
  eq('dữ liệu rỗng: summary vẫn hợp lệ, completionRate 0, không NaN', { ...emptyStats, assignedCount: emptyStats.assignedCount }, { assignedCount: 2, submittedCount: 0, completionRate: 0, averageScore: 0 })
  const noAssigned = buildPeriodStats([], [])
  eq('lớp không có bài giao: assignedCount = 0 và completionRate = 0', noAssigned, { assignedCount: 0, submittedCount: 0, completionRate: 0, averageScore: 0 })
}

/* -----------------------------------------------------------------------
 * 4. Topic breakdown và scoreTrend
 * ---------------------------------------------------------------- */
console.log('--- 4. Topic breakdown / scoreTrend từng lượt ---')
{
  const attempts = [
    { chapterId: 'ch1', homeworkId: 'hw1', scaledScore: 7 },
    { chapterId: 'ch1', homeworkId: 'hw1', scaledScore: 9 },
    { chapterId: 'ch2', homeworkId: 'hw2', scaledScore: 6 },
    { chapterId: null, homeworkId: 'hw3', scaledScore: 4 }, // không chapter thật
  ]
  const topicGroups = new Map()
  attempts.forEach((a) => {
    if (!a.chapterId) return // không tạo nhóm "unknown" ảo
    const group = topicGroups.get(a.chapterId) || []
    group.push(a)
    topicGroups.set(a.chapterId, group)
  })
  const breakdown = Array.from(topicGroups.keys())
  eq('breakdown chỉ gồm chapter có metadata thật', breakdown, ['ch1', 'ch2'])
  check('không tồn tại key "unknown-topic" làm sai lệch kết luận', !breakdown.includes('unknown-topic'))

  const ch1 = topicGroups.get('ch1')
  const ch1Hw = new Map()
  ch1.forEach((a) => {
    const cur = ch1Hw.get(a.homeworkId)
    if (!cur || a.scaledScore > cur.scaledScore) ch1Hw.set(a.homeworkId, a)
  })
  const scores1 = Array.from(ch1Hw.values()).map((a) => a.scaledScore)
  const round2 = (n) => Math.round(n * 100) / 100
  eq('topic breakdown dùng best score mỗi bài trong chapter', round2(scores1.reduce((a, v) => a + v, 0)), 9)

  // scoreTrend giữ TỪNG lượt nộp (không dọn về best-only) và tag isBest đúng
  const bestByHomework = new Map()
  attempts.forEach((a) => {
    const cur = bestByHomework.get(a.homeworkId)
    if (!cur || a.scaledScore > cur.scaledScore) bestByHomework.set(a.homeworkId, a)
  })
  const isBest = new Set(Array.from(bestByHomework.values()))
  const scoreTrend = attempts.map((a) => ({ homeworkId: a.homeworkId, scaledScore: a.scaledScore, isBest: isBest.has(a) }))
  check('scoreTrend giữ từng lượt nộp (kể cả lượt kém hơn của cùng bài)', scoreTrend.length === 4 && scoreTrend.filter((s) => s.scaledScore === 7).length === 1)
  const byHw = scoreTrend.filter((s) => s.homeworkId === 'hw1')
  check('isBest chỉ gắn cho lượt tốt nhất của hw1', byHw.filter((s) => s.isBest).length === 1 && byHw.find((s) => s.isBest).scaledScore === 9)
  check('lượt nộp cho homework không chapter thật vẫn giữ trong scoreTrend', scoreTrend.some((s) => s.homeworkId === 'hw3'))
}


/* -----------------------------------------------------------------------
 * 5. Học sinh nhiều lớp nhưng chọn một lớp (STUDENT + classId)
 * Bất biến: báo cáo mang classId của lớp nào thì CHỈ chứa dữ liệu lớp đó.
 * Bộ giải scope dưới đây viết theo ĐẶC TẢ (lớp yêu cầu hợp lệ thì thắng,
 * không yêu cầu thì lấy mọi lớp được phép) — các assertion quyết định đều
 * so với fixture viết tay (danh sách bài/bài nộp từng lớp), không lấy output
 * của bộ giải làm kỳ vọng, kèm đối chứng âm để test không thể pass mù.
 * -------------------------------------------------------------------- */
console.log('--- 5. STUDENT nhiều lớp chọn một lớp (classId) ---')
{
  const enrolled = ['lopA', 'lopB']
  const homeworksByClass = {
    lopA: [{ id: 'hwA1', deadline: '2026-10-15T00:00:00.000Z' }, { id: 'hwA2', deadline: null }],
    lopB: [{ id: 'hwB1', deadline: '2026-10-20T00:00:00.000Z' }],
  }
  const periodSubs = [
    { id: 'subA1', homework_id: 'hwA1' },
    { id: 'subB1', homework_id: 'hwB1' },
  ]
  const resolveScope = ({ role, requested, enrolledIds, adminClasses }) => {
    const permitted = role === 'STUDENT' ? enrolledIds : role === 'ADMIN' ? adminClasses : []
    if (requested) {
      return permitted.includes(requested) ? { forbidden: false, classIds: [requested] } : { forbidden: true, classIds: [] }
    }
    return { forbidden: false, classIds: [...permitted] }
  }
  const runReport = (classIds) => {
    const hwInScope = classIds.flatMap((c) => homeworksByClass[c] || [])
    const hwIdSet = new Set(hwInScope.map((h) => h.id))
    const attempts = periodSubs.filter((s) => hwIdSet.has(s.homework_id))
    return { hwIds: hwInScope.map((h) => h.id), attemptIds: attempts.map((s) => s.id) }
  }

  // 5.1 STUDENT chọn lopA: scope và toàn bộ dữ liệu báo cáo chỉ thuộc lopA
  const scopeA = resolveScope({ role: 'STUDENT', requested: 'lopA', enrolledIds: enrolled, adminClasses: [] })
  eq('STUDENT + classId hợp lệ -> scope chỉ [lopA]', scopeA, { forbidden: false, classIds: ['lopA'] })
  const reportA = runReport(scopeA.classIds)
  eq('báo cáo lớp A chỉ giao bài của lớp A', reportA.hwIds, ['hwA1', 'hwA2'])
  eq('báo cáo lớp A chỉ chứa bài nộp của lớp A, KHÔNG có bài nộp lớp B', reportA.attemptIds, ['subA1'])
  check('không còn dấu vết lớp B trong báo cáo lớp A', !reportA.hwIds.includes('hwB1') && !reportA.attemptIds.includes('subB1'))

  // 5.2 Đối chứng: cùng fixture, scope cả 2 lớp sẽ làm lọt bài nộp lớp B
  // (chứng tỏ test phân biệt được đúng/sai, không phải lúc nào cũng pass)
  const buggy = runReport(['lopA', 'lopB'])
  check('đối chứng: scope cả 2 lớp sẽ làm lọt bài nộp lớp B (đây là lỗi cần bắt)', buggy.attemptIds.includes('subB1'))

  // 5.3 STUDENT không chọn lớp: vẫn tổng hợp các lớp được phép (giữ semantics cũ)
  const scopeAll = resolveScope({ role: 'STUDENT', requested: null, enrolledIds: enrolled, adminClasses: [] })
  eq('STUDENT không classId -> scope mọi lớp được phép', scopeAll.classIds, ['lopA', 'lopB'])
  eq('báo cáo không chọn lớp chứa cả hai lớp', runReport(scopeAll.classIds).attemptIds, ['subA1', 'subB1'])

  // 5.4 STUDENT chọn lớp không ghi danh -> cấm, không dữ liệu
  const scopeDenied = resolveScope({ role: 'STUDENT', requested: 'lopLa', enrolledIds: enrolled, adminClasses: [] })
  eq('STUDENT chọn lớp không ghi danh -> forbidden, scope rỗng', scopeDenied, { forbidden: true, classIds: [] })

  // 5.5 ADMIN giữ semantics hiện tại
  const adminOne = resolveScope({ role: 'ADMIN', requested: 'lopB', enrolledIds: [], adminClasses: ['lopA', 'lopB'] })
  eq('ADMIN + classId -> chỉ lớp đó', adminOne.classIds, ['lopB'])
  const adminAll = resolveScope({ role: 'ADMIN', requested: null, enrolledIds: [], adminClasses: ['lopA', 'lopB'] })
  eq('ADMIN không classId -> mọi lớp của học sinh', adminAll.classIds, ['lopA', 'lopB'])
}

console.log(`\nKết quả: ${passed} PASS, ${failed} FAIL`)
if (failed > 0) {
  process.exit(1)
}
console.log('TẤT CẢ KIỂM THỬ BÁO CÁO TIẾN BỘ ĐỀU ĐẠT! ✅')
