import assert from 'node:assert/strict'
import { processImportRows } from '../functions/question-bank/import-update.ts'

function database(initial) {
  const rows = structuredClone(initial)
  const matches = (row, filters) => filters.every(([op, k, v]) =>
    op === 'in' ? v.includes(row[k] ?? null) : (row[k] ?? null) === v)
  return { rows, from() {
    let filters = [], operation = 'select', value
    const query = {
      select() { return this },
      eq(k, v) { filters.push(['eq', k, v]); return this },
      is(k, v) { filters.push(['eq', k, v]); return this },
      in(k, v) { filters.push(['in', k, v]); return this },
      update(v) { operation = 'update'; value = v; return this },
      insert(v) { operation = 'insert'; value = structuredClone(v); return this },
      async maybeSingle() {
        if (operation === 'insert') {
          const row = { ...value, id: `new-${rows.length}` }
          rows.push(row)
          return { data: { id: row.id }, error: null }
        }
        const row = rows.find(r => matches(r, filters))
        if (row && operation === 'update') Object.assign(row, structuredClone(value))
        return { data: row ? structuredClone(row) : null, error: null }
      },
      async single() { return this.maybeSingle() },
      // Bulk select/insert: `await query` trả mảng như PostgREST.
      then(resolve, reject) {
        try {
          if (operation === 'insert') {
            const list = (Array.isArray(value) ? value : [value]).map((v, i) => ({ ...v, id: `new-${rows.length + i}` }))
            rows.push(...list)
            return resolve({ data: list.map(r => ({ id: r.id })), error: null })
          }
          return resolve({ data: rows.filter(r => matches(r, filters)).map(r => structuredClone(r)), error: null })
        } catch (error) { return reject(error) }
      }
    }
    return query
  } }
}
const question = (lesson, block = '12-Toán', text = 'same') => ({
  qb_lesson_id: lesson, grade_block: block, question_type: 'MULTIPLE_CHOICE',
  prompt: { text, options: [{ id: 'A' }, { id: 'B' }], explanation: 'new' },
  mc_answer: 'B', tf_answers: null, sa_answer: null, sa_tolerance: 0
})
const hash = async (_type, prompt) => prompt.text
const existing = { ...question('lesson-1'), id: 'original', content_hash: 'same', mc_answer: 'A', usage_count: 9, points: 2, difficulty: 'VAN_DUNG', prompt: { text: 'same', options: [{ id: 'A' }, { id: 'B' }], explanation: 'old', extra: 42 } }
const run = (db, rows, mode = 'UPDATE') => processImportRows(rows, rows.map((_, i) => ({ questionNumber: i + 1 })), mode, db, hash)
{
  const db = database([existing]); const result = await run(db, [question('lesson-1')])
  assert.equal(result.updatedCount, 1); assert.equal(result.importedCount, 0)
  assert.equal(db.rows.length, 1); assert.equal(db.rows[0].mc_answer, 'B'); assert.equal(db.rows[0].prompt.explanation, 'new')
  assert.deepEqual([db.rows[0].id, db.rows[0].usage_count, db.rows[0].points, db.rows[0].difficulty, db.rows[0].prompt.extra], ['original', 9, 2, 'VAN_DUNG', 42])
}
{
  const db = database([existing]); const result = await run(db, [question('lesson-1')], 'SKIP')
  assert.equal(result.skippedCount, 1); assert.deepEqual(db.rows[0], existing)
}
{
  const otherBlock = { ...question(null, '11-Toán'), id: 'block', content_hash: 'same', mc_answer: 'A' }
  const db = database([existing, otherBlock]); const result = await run(db, [question('lesson-2'), question(null, '12-Toán'), question('lesson-1', '12-Toán', 'new')])
  assert.equal(result.importedCount, 3); assert.equal(result.updatedCount, 0)
  assert.deepEqual(db.rows.slice(0, 2), [existing, otherBlock])
}
{
  const db = database([existing]); const invalid = question('lesson-1'); invalid.mc_answer = 'D'
  const result = await run(db, [invalid]); assert.equal(result.failedRows.length, 1); assert.deepEqual(db.rows[0], existing)
}
{
  const db = database([]); const result = await run(db, [question('lesson-1'), question('lesson-1')])
  assert.equal(result.importedCount, 1); assert.equal(result.skippedCount, 1); assert.equal(db.rows.length, 1)
}
{
  const db = database([])
  const tf = { ...question('tf'), question_type: 'TRUE_FALSE', tf_answers: { a: true, b: false, c: false } }
  const sa = { ...question('sa'), question_type: 'SHORT_ANSWER', sa_answer: '3', sa_tolerance: -1 }
  const result = await run(db, [tf, sa, question('ok', '12-Toán', 'valid')])
  assert.equal(result.failedRows.length, 2); assert.equal(result.importedCount, 1); assert.equal(db.rows.length, 1)
}
console.log('question-bank import update tests passed')

// --- Bổ sung sau review: hành vi với dữ liệu thật ---
{
  // Nhiều bản ghi cũ cùng (bài học, hash): cập nhật tất cả, không báo lỗi.
  const twin = { ...existing, id: 'twin', mc_answer: 'A' }
  const db = database([existing, twin])
  const result = await run(db, [question('lesson-1')])
  assert.equal(result.failedRows.length, 0)
  assert.equal(result.updatedCount, 1)
  assert.deepEqual(db.rows.map(r => r.mc_answer), ['B', 'B'])
}
{
  // Markdown không có [Lời giải]: giữ nguyên lời giải cũ, chỉ đổi đáp án.
  const row = question('lesson-1')
  row.prompt = { ...row.prompt, explanation: '' }
  const db = database([existing])
  await run(db, [row])
  assert.equal(db.rows[0].prompt.explanation, 'old')
  assert.equal(db.rows[0].mc_answer, 'B')
}
{
  // Thiếu đáp án đúng (parser không đoán nữa) -> báo lỗi rõ, không ghi gì.
  const row = question('lesson-1')
  row.mc_answer = null
  const db = database([existing])
  const result = await run(db, [row])
  assert.equal(result.updatedCount, 0)
  assert.match(result.failedRows[0].reason, /Thiếu đáp án đúng/)
  assert.deepEqual(db.rows[0], existing)
}
{
  // Câu mới được ghi theo lô: nhiều câu chỉ cần 1 lệnh insert.
  const db = database([])
  let inserts = 0
  const spy = { rows: db.rows, from(t) { const q = db.from(t); const origInsert = q.insert.bind(q); q.insert = v => { inserts++; return origInsert(v) }; return q } }
  const rows = [question('lesson-1', '12-Toán', 'a'), question('lesson-1', '12-Toán', 'b'), question('lesson-1', '12-Toán', 'c')]
  const result = await run(spy, rows)
  assert.equal(result.importedCount, 3)
  assert.equal(inserts, 1, 'phải insert theo lô, không phải từng câu')
}
console.log('bổ sung review: passed')
