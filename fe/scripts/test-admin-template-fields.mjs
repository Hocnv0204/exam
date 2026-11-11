import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'

const [classDetails, assignmentReview, studentDetails, studentMgmt] = await Promise.all([
  readFile(new URL('../src/js/views/class-details.js', import.meta.url), 'utf8'),
  readFile(new URL('../src/js/views/assignment-review.js', import.meta.url), 'utf8'),
  readFile(new URL('../src/js/views/student-details.js', import.meta.url), 'utf8'),
  readFile(new URL('../src/js/views/student-mgmt.js', import.meta.url), 'utf8'),
])

assert.match(classDetails, /cachedKpiStats\.sessions\?\.totalHeld \?\? 0/)
assert.match(classDetails, /cachedKpiStats\.sessions\?\.monthHeld \?\? 0/)
assert.match(classDetails, /cachedKpiStats\.homeworks\?\.openCount \?\? 0/)
assert.match(classDetails, /cachedKpiStats\?\.uncollectedTuition\?\.totalAmount/)
assert.match(classDetails, /cachedKpiStats\?\.latestSession/)
assert.doesNotMatch(classDetails, /cachedKpiStats\.totalSessions/)
assert.doesNotMatch(classDetails, /cachedKpiStats\.monthSessions/)
assert.doesNotMatch(classDetails, /cachedKpiStats\.openHomeworks/)

assert.match(assignmentReview, /resultSubmission\.correctCount \?\? resultSubmission\.correct_count \?\? result\.correctCount \?\? result\.correct_count \?\? 0/)
assert.match(assignmentReview, /resultSubmission\.wrongCount \?\? resultSubmission\.wrong_count \?\? result\.wrongCount \?\? result\.wrong_count \?\? 0/)

const safeDateKeyFilters = studentDetails.match(/typeof date === 'string' && date\.startsWith\(/g) || []
assert.equal(safeDateKeyFilters.length, 2, 'Both session-date filters must guard missing date keys')

assert.match(studentMgmt, /function formatCreatedDate\(value\)/)
assert.equal((studentMgmt.match(/formatCreatedDate\(s\.createdAt\)/g) || []).length, 2, 'Classic and Pro rows must format createdAt')

console.log('Admin template field contract checks passed.')
