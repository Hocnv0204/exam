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
  assert.deepEqual(result.skippedRows.map(r => r.questionNumber), [1])
  assert.match(result.skippedRows[0].reason, /đã có trong Ngân hàng/)
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
  assert.deepEqual(result.skippedRows.map(r => r.questionNumber), [2])
  assert.match(result.skippedRows[0].reason, /trong file nhập/)
}
{
  const invalid = question('lesson-1'); invalid.mc_answer = null
  const db = database([]); const result = await run(db, [invalid, question('lesson-1')])
  assert.deepEqual(result.failedRows.map(r => r.questionNumber), [1])
  assert.equal(result.importedCount, 1)
  assert.equal(result.skippedCount, 0, 'câu lỗi không được chặn câu hợp lệ trùng nội dung phía sau')
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

{
  // Lô nhập lớn phải chia truy vấn lookup; câu trùng ở lô cuối vẫn được nhận diện.
  const rows = Array.from({ length: 222 }, (_, i) => question(i % 2 ? 'lesson-2' : 'lesson-1', '11-Hóa', `hash-${String(i).padStart(64, '0')}`))
  const duplicate = { ...rows[221], id: 'already-there', content_hash: rows[221].prompt.text }
  const db = database([duplicate])
  const lookupSizes = []
  const spy = { rows: db.rows, from(t) {
    const q = db.from(t)
    const origIn = q.in.bind(q)
    q.in = (column, values) => {
      if (column === 'content_hash') lookupSizes.push(values.length)
      return origIn(column, values)
    }
    return q
  } }
  const result = await run(spy, rows, 'SKIP')
  assert.equal(result.importedCount, 221)
  assert.equal(result.skippedCount, 1)
  assert.deepEqual(result.skippedRows.map(r => r.questionNumber), [222])
  assert.equal(db.rows.length, 222)
  assert.ok(lookupSizes.length > 1, 'phải chia tra cứu thành nhiều request')
  assert.ok(lookupSizes.every(size => size <= 40), 'mỗi URL chỉ chứa tối đa 40 hash')
}
{
  // Lookup thất bại phải dừng trước khi insert, không được hiểu nhầm là chưa có câu.
  const db = database([])
  const spy = { rows: db.rows, from(t) {
    const q = db.from(t)
    const origIn = q.in.bind(q)
    q.in = (column, values) => {
      if (column === 'content_hash') q.then = resolve => resolve({ data: null, error: { message: 'lookup failed' } })
      return origIn(column, values)
    }
    return q
  } }
  await assert.rejects(run(spy, [question('lesson-1')]), error => error?.message === 'lookup failed')
  assert.equal(db.rows.length, 0)
}
console.log('question-bank import lookup batching tests passed')

{
  // Kịch bản báo cáo 207 tạo mới, 14 bỏ qua, lỗi thiếu đáp án ở câu 201.
  const rows = Array.from({ length: 222 }, (_, i) => question('lesson-1', '11-Hóa', `câu-${i + 1}`))
  rows[200].mc_answer = null
  for (let i = 0; i < 7; i++) rows[208 + i] = question('lesson-1', '11-Hóa', `câu-${i + 1}`)
  const existingRows = rows.slice(201, 208).map((row, i) => ({ ...row, id: `existing-${i}`, content_hash: row.prompt.text }))
  const db = database(existingRows)
  const result = await run(db, rows, 'SKIP')
  assert.equal(result.importedCount, 207)
  assert.equal(result.skippedCount, 14)
  assert.equal(result.skippedRows.length, result.skippedCount)
  assert.deepEqual(result.skippedRows.map(row => row.questionNumber).sort((a, b) => a - b), Array.from({ length: 14 }, (_, i) => i + 202))
  assert.ok(result.skippedRows.filter(row => row.questionNumber <= 208).every(row => /đã có trong Ngân hàng/.test(row.reason)))
  assert.ok(result.skippedRows.filter(row => row.questionNumber >= 209).every(row => /trong file nhập/.test(row.reason)))
  assert.deepEqual(result.failedRows.map(row => row.questionNumber), [201])
  assert.match(result.failedRows[0].reason, /Thiếu đáp án đúng/)
}
