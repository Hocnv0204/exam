import assert from 'node:assert/strict'
import {
  formatStudentName,
  isValidCalendarDate,
  addDays,
  getDateDiffDays,
  getVnWeekRange,
  getVnMonthRange,
  parseAttendanceQuery,
  parseLeaderboardQuery,
  processLeaderboardData,
} from '../functions/student-progress/logic.ts'

console.log('Running test-student-progress-logic.mjs...')

// 1. formatStudentName
{
  const r1 = formatStudentName('Nguyễn Minh Anh')
  assert.equal(r1.displayName, 'Minh Anh N.')
  assert.equal(r1.initials, 'MA')

  const r2 = formatStudentName('Trần Văn Ba')
  assert.equal(r2.displayName, 'Văn Ba T.')
  assert.equal(r2.initials, 'VB')

  const r3 = formatStudentName('Lê Nam')
  assert.equal(r3.displayName, 'Nam L.')
  assert.equal(r3.initials, 'NA')

  const r4 = formatStudentName('Thắng')
  assert.equal(r4.displayName, 'Thắng')
  assert.equal(r4.initials, 'TH')

  const r5 = formatStudentName('')
  assert.equal(r5.displayName, 'Học sinh')
  assert.equal(r5.initials, 'HS')

  const r6 = formatStudentName(null)
  assert.equal(r6.displayName, 'Học sinh')
  assert.equal(r6.initials, 'HS')
}
console.log('✓ formatStudentName passed')

// 2. Date utilities
{
  assert.equal(isValidCalendarDate('2026-11-07'), true)
  assert.equal(isValidCalendarDate('2026-02-28'), true)
  assert.equal(isValidCalendarDate('2026-02-29'), false) // 2026 is not a leap year
  assert.equal(isValidCalendarDate('2026-11-31'), false) // Nov has 30 days
  assert.equal(isValidCalendarDate('invalid-date'), false)

  assert.equal(addDays('2026-11-07', -29), '2026-10-09')
  assert.equal(addDays('2026-10-09', 29), '2026-11-07')
  assert.equal(getDateDiffDays('2026-10-09', '2026-11-07'), 29)

  const week = getVnWeekRange('2026-11-07') // Saturday
  assert.equal(week.fromDate, '2026-11-02') // Monday
  assert.equal(week.toDate, '2026-11-08')   // Sunday

  const month = getVnMonthRange('2026-11-07')
  assert.equal(month.fromDate, '2026-11-01')
  assert.equal(month.toDate, '2026-11-30')
}
console.log('✓ Date utilities passed')

// 3. parseAttendanceQuery
{
  const classId = '11111111-1111-1111-1111-111111111111'
  const userClassIds = [classId]
  const today = '2026-11-07'

  // Success default
  const r1 = parseAttendanceQuery(new URLSearchParams({ classId }), userClassIds, today)
  assert.equal(r1.ok, true)
  if (r1.ok) {
    assert.equal(r1.params.classId, classId)
    assert.equal(r1.params.fromDate, '2026-10-09')
    assert.equal(r1.params.toDate, '2026-11-07')
  }

  // Not enrolled
  const r2 = parseAttendanceQuery(new URLSearchParams({ classId: '22222222-2222-2222-2222-222222222222' }), userClassIds, today)
  assert.equal(r2.ok, false)
  if (!r2.ok) assert.equal(r2.status, 403)

  // fromDate > toDate
  const r3 = parseAttendanceQuery(new URLSearchParams({ classId, fromDate: '2026-11-10', toDate: '2026-11-05' }), userClassIds, today)
  assert.equal(r3.ok, false)
  if (!r3.ok) assert.equal(r3.status, 400)

  // range > 366
  const r4 = parseAttendanceQuery(new URLSearchParams({ classId, fromDate: '2024-01-01', toDate: '2026-11-07' }), userClassIds, today)
  assert.equal(r4.ok, false)
  if (!r4.ok) assert.equal(r4.status, 400)
}
console.log('✓ parseAttendanceQuery passed')

// 4. parseLeaderboardQuery
{
  const classId = '11111111-1111-1111-1111-111111111111'
  const userClassIds = [classId]
  const today = '2026-11-07'

  const r1 = parseLeaderboardQuery(new URLSearchParams({ classId }), userClassIds, today)
  assert.equal(r1.ok, true)
  if (r1.ok) {
    assert.equal(r1.params.period, 'week')
    assert.equal(r1.params.fromDate, '2026-11-02')
    assert.equal(r1.params.toDate, '2026-11-08')
  }

  const r2 = parseLeaderboardQuery(new URLSearchParams({ classId, period: 'month' }), userClassIds, today)
  assert.equal(r2.ok, true)
  if (r2.ok) {
    assert.equal(r2.params.period, 'month')
    assert.equal(r2.params.fromDate, '2026-11-01')
    assert.equal(r2.params.toDate, '2026-11-30')
  }

  const r3 = parseLeaderboardQuery(new URLSearchParams({ classId, period: 'year' }), userClassIds, today)
  assert.equal(r3.ok, false)
  if (!r3.ok) assert.equal(r3.status, 400)
}
console.log('✓ parseLeaderboardQuery passed')

// 5. processLeaderboardData
{
  const currentUserId = '00000000-0000-0000-0000-000000000001'
  const rpcData = {
    classId: 'c1',
    className: 'Toán 12',
    totalStudents: 15,
    students: [
      { studentId: 'other-1', fullName: 'Nguyễn Minh Anh', xp: 100, rank: 1 },
      { studentId: 'other-2', fullName: 'Trần Văn Ba', xp: 80, rank: 2 },
      { studentId: currentUserId, fullName: 'Lê Minh Me', xp: 50, rank: 3 },
    ]
  }

  const res = processLeaderboardData(rpcData, currentUserId, 'Lê Minh Me', 'week', '2026-11-02', '2026-11-08')
  assert.equal(res.classId, 'c1')
  assert.equal(res.className, 'Toán 12')
  assert.equal(res.totalStudents, 15)
  assert.deepStrictEqual(res.me, { rank: 3, xp: 50 })
  assert.equal(res.entries.length, 3)

  // Other student anonymized
  assert.equal(res.entries[0].displayName, 'Minh Anh N.')
  assert.equal(res.entries[0].initials, 'MA')
  assert.equal(res.entries[0].isMe, false)

  // Current student has full name
  assert.equal(res.entries[2].displayName, 'Lê Minh Me')
  assert.equal(res.entries[2].isMe, true)

  // Verify studentId is NOT in final entry
  assert.equal('studentId' in res.entries[0], false)
}
console.log('✓ processLeaderboardData passed')
