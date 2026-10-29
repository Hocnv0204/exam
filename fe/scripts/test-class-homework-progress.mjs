import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { getHomeworkDisplayStatus, formatHomeworkProgress } from '../src/js/utils/class-homework-progress.js'

const past = '2024-01-01T00:00:00Z'
const future = '2030-01-01T00:00:00Z'
const now = Date.parse('2026-01-01T00:00:00Z')
assert.equal(getHomeworkDisplayStatus({ isPublished: false, deadline: past }, now).label, 'Bản nháp')
assert.equal(getHomeworkDisplayStatus({ isPublished: true, deadline: past }, now).label, 'Quá hạn')
assert.equal(getHomeworkDisplayStatus({ isPublished: true, deadline: future }, now).label, 'Đang mở')
assert.equal(getHomeworkDisplayStatus({ isPublished: true }, now).label, 'Đang mở')
assert.equal(formatHomeworkProgress({ submittedCount: 1, assignedCount: 2 }), '1 / 2')
assert.equal(formatHomeworkProgress(null), '—')
const view = readFileSync(new URL('../src/js/views/class-details.js', import.meta.url), 'utf8')
assert.match(view, /<th>Đã nộp \/ Được giao<\/th>/)
assert.match(view, /api\.getHomeworks\('', classId, 'includeProgress=true'\)/)
assert.match(view, /currentViewingClassId !== classId/)
assert.match(view, /btn-retry-class-homeworks/)
console.log('Class homework FE status / progress / loading contract PASS')
