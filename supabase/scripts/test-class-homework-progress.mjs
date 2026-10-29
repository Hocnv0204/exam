import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { countClassHomeworkProgress, loadClassHomeworkProgress } from '../functions/create-homework/class-progress.ts'

const hws = [
  { id: 'public', assignedStudentIds: [] },
  { id: 'targeted', assignedStudentIds: ['a', 'outsider'] },
  { id: 'empty', assignedStudentIds: [] },
]
const enrollment = [{ student_id: 'a' }, { student_id: 'b' }]
const submissions = [
  { homework_id: 'public', student_id: 'a' },
  { homework_id: 'public', student_id: 'a' }, // nộp lại: chỉ 1 học sinh
  { homework_id: 'public', student_id: 'outsider' },
  { homework_id: 'targeted', student_id: 'b' }, // trong lớp nhưng không được giao
  { homework_id: 'targeted', student_id: 'a' },
  { homework_id: 'targeted', student_id: null },
  { homework_id: 'other-class-homework', student_id: 'a' },
]
const counts = countClassHomeworkProgress(hws, enrollment, submissions)
assert.deepEqual(counts.get('public'), { submittedCount: 1, assignedCount: 2 })
assert.deepEqual(counts.get('targeted'), { submittedCount: 1, assignedCount: 1 })
assert.deepEqual(counts.get('empty'), { submittedCount: 0, assignedCount: 2 })

// Mock PostgREST: nhiều hơn 1000 dòng, nộp lặp nhiều lần, chỉ SUBMITTED được tính.
const tables = {
  student_classes: Array.from({ length: 1101 }, (_, i) => ({ class_id: 'class-a', student_id: `student-${i}` })),
  homework_targets: [{ homework_id: 'hw', student_id: 'student-0' }],
  submissions: [
    ...Array.from({ length: 1100 }, (_, i) => ({ id: `sub-${String(i).padStart(5, '0')}`, homework_id: 'hw', student_id: 'student-0', status: 'SUBMITTED' })),
    { id: 'old', homework_id: 'public-hw', student_id: 'student-1', status: 'ARCHIVED' },
    { id: 'valid', homework_id: 'public-hw', student_id: 'student-0', status: 'SUBMITTED' },
  ],
}
function mockClient(failTable = '') {
  return {
    from(table) {
      const conditions = []
      const orders = []
      const query = {
        select() { return query },
        eq(field, value) { conditions.push(row => row[field] === value); return query },
        not(field, op, value) { assert.equal(op, 'is'); conditions.push(row => row[field] !== value); return query },
        in(field, values) { conditions.push(row => values.includes(row[field])); return query },
        order(field) { orders.push(field); return query },
        async range(start, end) {
          if (table === failTable) return { data: null, error: { message: 'DB unavailable' } }
          const rows = tables[table].filter(row => conditions.every(test => test(row)))
          rows.sort((a, b) => {
            for (const field of orders) {
              const compare = String(a[field]).localeCompare(String(b[field]))
              if (compare) return compare
            }
            return 0
          })
          return { data: rows.slice(start, end + 1), error: null }
        },
      }
      return query
    },
  }
}
const paged = await loadClassHomeworkProgress(mockClient(), 'class-a', ['hw', 'public-hw'])
assert.deepEqual(paged.get('hw'), {
  submittedCount: 1, assignedCount: 1,
})
assert.deepEqual(paged.get('public-hw'), { submittedCount: 1, assignedCount: 1101 })
await assert.rejects(loadClassHomeworkProgress(mockClient('submissions'), 'class-a', ['hw']), /DB unavailable/)
const backend = readFileSync(new URL('../functions/create-homework/index.ts', import.meta.url), 'utf8')
assert.match(backend, /includeProgress && \(!classId \|\| user\.role !== 'ADMIN'\)/)
assert.match(backend, /if \(includeProgress\) \{[\s\S]*?loadClassHomeworkProgress/)
console.log('Class homework progress: unique / targets / enrolled / pagination / error / admin PASS')
