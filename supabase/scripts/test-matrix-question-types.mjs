/**
 * Kiểm thử phạm vi "Dạng bài Constant" (qb_question_types) cho modal Tạo đề theo Ma trận.
 *
 * Chạy: node supabase/scripts/test-matrix-question-types.mjs
 * (Node >= 22.6 có thể cần --experimental-strip-types khi import helper .ts)
 *
 * Nguyên tắc:
 * - Không chạm DB thật, không deploy, không migration, không cần mạng.
 * - Oracle độc lập: helper sinh mệnh đề PostgREST, test tự đánh giá mệnh đề trên
 *   fixture câu hỏi để chứng minh chỉ lấy đúng Dạng bài được chọn và đúng phạm vi.
 * - Kèm static contract cho phần nối dây FE/BE và migration.
 */
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import {
  MAX_SCOPE_TYPE_IDS,
  normalizeTypeIdList,
  splitLessonIdsByTypePresence,
  buildTypePoolClauses
} from '../functions/question-bank/type-scope.ts'

console.log('=== Kiểm thử phạm vi Dạng bài Constant (qb_question_types) ===')

// ============================================================
// Oracle độc lập: đọc mệnh đề PostgREST do helper sinh ra và tự đánh giá
// trên một "bảng" câu hỏi fixture. Không mirror công thức của helper.
// ============================================================
function splitTopLevel(text) {
  const parts = []
  let depth = 0
  let start = 0
  for (let i = 0; i < text.length; i++) {
    const ch = text[i]
    if (ch === '(') depth++
    else if (ch === ')') depth--
    else if (ch === ',' && depth === 0) {
      parts.push(text.slice(start, i))
      start = i + 1
    }
  }
  parts.push(text.slice(start))
  return parts.map(s => s.trim()).filter(Boolean)
}

function fieldValue(row, field) {
  // Fixture dùng đúng tên cột PostgREST (qb_*). Cột lạ phải fail rõ ràng,
  // không được âm thầm trả false để che lỗi sinh mệnh đề.
  if (!(field in row)) return { known: false, value: undefined }
  return { known: true, value: row[field] }
}

function evalClause(row, rawClause) {
  const clause = String(rawClause).trim()

  if (clause.startsWith('and(') && clause.endsWith(')')) {
    return splitTopLevel(clause.slice(4, -1)).every(part => evalClause(row, part))
  }
  if (clause.startsWith('or(') && clause.endsWith(')')) {
    return splitTopLevel(clause.slice(3, -1)).some(part => evalClause(row, part))
  }

  let m = clause.match(/^([a-zA-Z_][\w]*)\.in\.\((.*)\)$/)
  if (m) {
    const [, field, list] = m
    const { known, value } = fieldValue(row, field)
    assert.ok(known, `Mệnh đề dùng cột không có trong fixture: ${field}`)
    return splitTopLevel(list).includes(String(value))
  }

  m = clause.match(/^([a-zA-Z_][\w]*)\.is\.null$/)
  if (m) {
    const { known, value } = fieldValue(row, m[1])
    assert.ok(known, `Mệnh đề dùng cột không có trong fixture: ${m[1]}`)
    return value === null || value === undefined
  }

  m = clause.match(/^([a-zA-Z_][\w]*)\.eq\.(.*)$/)
  if (m) {
    const { known, value } = fieldValue(row, m[1])
    assert.ok(known, `Mệnh đề dùng cột không có trong fixture: ${m[1]}`)
    return String(value) === m[2]
  }

  throw new Error(`Không hiểu mệnh đề PostgREST: ${clause}`)
}

function selectRows(rows, clauses) {
  if (clauses.length === 0) return rows.slice()
  return rows.filter(row => clauses.some(clause => evalClause(row, clause)))
}

const uuid = n => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`

const ID = {
  cls1: uuid(1),
  ch1: uuid(2),
  ch2: uuid(3),
  l1: uuid(4),
  l2: uuid(5),
  l3: uuid(6),
  cls2: uuid(7),
  ch3: uuid(8),
  l4: uuid(9),
  l5: uuid(10),
  t1: uuid(11),
  t2: uuid(12),
  t3: uuid(13),
  t4: uuid(14),
  t5: uuid(15)
}

// Câu hỏi fixture: cột động để null nhằm chứng minh nhánh Dạng bài chỉ dùng qb_*.
const row = ({ id, typeId = null, lessonId, chapterId, classId }) => ({
  id,
  question_type: 'MULTIPLE_CHOICE',
  difficulty: 'NHAN_BIET',
  class_id: null,
  chapter_id: null,
  lesson_id: null,
  qb_class_id: classId,
  qb_chapter_id: chapterId,
  qb_lesson_id: lessonId,
  qb_question_type_id: typeId
})

const ROWS = [
  // Lớp 1 / Chương 1 / Bài 1: hai Dạng bài t1, t2 + 1 câu chưa gắn Dạng bài
  row({ id: 'q-t1', typeId: ID.t1, lessonId: ID.l1, chapterId: ID.ch1, classId: ID.cls1 }),
  row({ id: 'q-t2', typeId: ID.t2, lessonId: ID.l1, chapterId: ID.ch1, classId: ID.cls1 }),
  row({ id: 'q-l1-untyped', lessonId: ID.l1, chapterId: ID.ch1, classId: ID.cls1 }),
  // Lớp 1 / Chương 1 / Bài 2: t3, t4
  row({ id: 'q-t3', typeId: ID.t3, lessonId: ID.l2, chapterId: ID.ch1, classId: ID.cls1 }),
  row({ id: 'q-t4', typeId: ID.t4, lessonId: ID.l2, chapterId: ID.ch1, classId: ID.cls1 }),
  // Lớp 1 / Chương 2 / Bài 3: Bài KHÔNG có Dạng bài
  row({ id: 'q-l3', lessonId: ID.l3, chapterId: ID.ch2, classId: ID.cls1 }),
  // Lớp 2 / Chương 3 / Bài 4: t5 + Bài 5 không có Dạng bài
  row({ id: 'q-t5', typeId: ID.t5, lessonId: ID.l4, chapterId: ID.ch3, classId: ID.cls2 }),
  row({ id: 'q-l5', lessonId: ID.l5, chapterId: ID.ch3, classId: ID.cls2 })
]

const idsOf = rows => rows.map(r => r.id).sort()

// ------------------------------------------------------------
// 1. Chọn 1 Dạng bài trong Bài có nhiều Dạng bài: chỉ lấy đúng type đó,
//    không OR lọt sibling cùng Bài dù client gửi kèm Lớp/Chương/Bài cha.
// ------------------------------------------------------------
{
  const clauses = buildTypePoolClauses({
    typeIds: [ID.t1],
    lessonIds: [ID.l1, ID.l3], // L1 được chọn một phần (chỉ t1) nhưng vẫn gửi kèm
    chapterIds: [ID.ch1, ID.ch2],
    classIds: [ID.cls1],
    untypedLessonIds: [ID.l3]
  })
  const picked = selectRows(ROWS, clauses)
  assert.deepEqual(idsOf(picked), ['q-l3', 'q-t1'])
  assert.ok(!picked.some(q => q.id === 'q-t2'), 'không được lọt sibling t2 cùng Bài')
  assert.ok(!picked.some(q => q.id === 'q-l1-untyped'), 'không được lọt câu chưa gắn Dạng bài trong Bài có Dạng bài')
  console.log('  ✓ Chọn 1 Dạng bài: chỉ lấy type đó + Bài không có Dạng bài, không lọt sibling')
}

// ------------------------------------------------------------
// 2. Chọn nhiều Dạng bài ở nhiều Bài: hợp đúng các type, không kéo sibling.
// ------------------------------------------------------------
{
  const clauses = buildTypePoolClauses({
    typeIds: [ID.t1, ID.t3],
    lessonIds: [ID.l1, ID.l2],
    chapterIds: [ID.ch1],
    classIds: [ID.cls1]
  })
  assert.deepEqual(idsOf(selectRows(ROWS, clauses)), ['q-t1', 'q-t3'])
  console.log('  ✓ Chọn nhiều Dạng bài: chỉ hợp các type được chọn, t2/t4 bị loại')
}

// ------------------------------------------------------------
// 3. Chọn cả Lớp (mọi Dạng bài + Bài không có Dạng bài): kết quả đúng phạm vi
//    Lớp đó, không lọt câu của Lớp khác trong cùng Khối. Câu chưa gắn Dạng bài
//    trong Bài ĐÃ có Dạng bài không thuộc lá nào nên không được chọn — đúng
//    nghĩa "chọn các Dạng bài", khác với Bài không có Dạng bài (chọn nguyên Bài).
// ------------------------------------------------------------
{
  const clauses = buildTypePoolClauses({
    typeIds: [ID.t1, ID.t2, ID.t3, ID.t4],
    lessonIds: [ID.l1, ID.l2, ID.l3],
    chapterIds: [ID.ch1, ID.ch2],
    classIds: [ID.cls1],
    untypedLessonIds: [ID.l3]
  })
  assert.deepEqual(
    idsOf(selectRows(ROWS, clauses)),
    ['q-l3', 'q-t1', 'q-t2', 'q-t3', 'q-t4']
  )
  assert.ok(!selectRows(ROWS, clauses).some(q => q.qb_class_id === ID.cls2), 'không lọt Lớp khác')
  console.log('  ✓ Chọn cả Lớp: đúng phạm vi Lớp, không lọt câu Lớp khác cùng Khối')
}

// ------------------------------------------------------------
// 4. Item phân bổ (restrictToScope): typeIds phải bị thu hẹp theo Lớp/Chương/Bài
//    của item, kể cả khi typeIds tổng chứa Dạng bài của Lớp khác.
// ------------------------------------------------------------
{
  const clauses = buildTypePoolClauses({
    typeIds: [ID.t1, ID.t5],
    lessonIds: [ID.l1],
    chapterIds: [ID.ch1],
    classIds: [ID.cls1],
    restrictToScope: true
  })
  assert.deepEqual(idsOf(selectRows(ROWS, clauses)), ['q-t1'])
  console.log('  ✓ Item phân bổ: t5 của Lớp khác bị thu hẹp khỏi item Lớp 1')
}

{
  const clauses = buildTypePoolClauses({
    typeIds: [ID.t1, ID.t3],
    chapterIds: [ID.ch1],
    restrictToScope: true
  })
  assert.deepEqual(idsOf(selectRows(ROWS, clauses)), ['q-t1', 'q-t3'])
  console.log('  ✓ Item phân bổ theo Chương: giữ đúng Dạng bài được chọn trong Chương, không lọt sibling')
}

// ------------------------------------------------------------
// 5. Tương thích ngược: không có typeIds -> không sinh mệnh đề mới.
// ------------------------------------------------------------
{
  assert.deepEqual(buildTypePoolClauses({ typeIds: [] }), [])
  assert.deepEqual(buildTypePoolClauses({ typeIds: undefined }), [])
  console.log('  ✓ Không chọn Dạng bài: helper trả rỗng, giữ hành vi cũ')
}

// ------------------------------------------------------------
// 6. Dedupe typeIds và chỉ dùng cột qb_*.
// ------------------------------------------------------------
{
  const clauses = buildTypePoolClauses({ typeIds: [ID.t1, ID.t1, ID.t2] })
  assert.equal(clauses.length, 1)
  assert.equal(clauses[0], `qb_question_type_id.in.(${ID.t1},${ID.t2})`)
  assert.ok(!/\.in\.\(.*lesson_id/.test(clauses[0]), 'không trộn cột động')
  console.log('  ✓ Dedupe Dạng bài và chỉ dùng cột qb_question_type_id')
}

// ------------------------------------------------------------
// 7. Tách Bài có Dạng bài / không có Dạng bài.
// ------------------------------------------------------------
{
  const split = splitLessonIdsByTypePresence(
    [ID.l1, ID.l2, ID.l3, ID.l3],
    [ID.l1, ID.l2, ID.l2]
  )
  assert.deepEqual(split.typedLessonIds, [ID.l1, ID.l2])
  assert.deepEqual(split.untypedLessonIds, [ID.l3])
  assert.ok(!split.untypedLessonIds.includes(ID.l1), 'Bài có Dạng bài không được coi là chọn nguyên bài')

  const none = splitLessonIdsByTypePresence([ID.l3], [])
  assert.deepEqual(none.typedLessonIds, [])
  assert.deepEqual(none.untypedLessonIds, [ID.l3])
  console.log('  ✓ Tách typed/untyped: Bài có Dạng bài không bị OR nguyên bài')
}

// ------------------------------------------------------------
// 8. Chuẩn hóa typeIds: UUID, dedupe, chữ hoa, giới hạn, ID sai.
// ------------------------------------------------------------
{
  assert.deepEqual(normalizeTypeIdList(undefined), { ids: [], invalid: [], tooMany: false })
  assert.deepEqual(normalizeTypeIdList(''), { ids: [], invalid: [], tooMany: false })

  const fromString = normalizeTypeIdList(` ${ID.t1.toUpperCase()} , ${ID.t1} , not-a-uuid `)
  assert.deepEqual(fromString.ids, [ID.t1])
  assert.deepEqual(fromString.invalid, ['not-a-uuid'])
  assert.equal(fromString.tooMany, false)

  const fromArray = normalizeTypeIdList([ID.t2, null, '', '  ', ID.t2])
  assert.deepEqual(fromArray.ids, [ID.t2])
  assert.deepEqual(fromArray.invalid, [])

  assert.equal(MAX_SCOPE_TYPE_IDS, 1000)
  const many = Array.from({ length: MAX_SCOPE_TYPE_IDS + 1 }, (_, i) => uuid(1000 + i))
  const limited = normalizeTypeIdList(many)
  assert.equal(limited.tooMany, true)
  assert.equal(limited.ids.length, MAX_SCOPE_TYPE_IDS)
  console.log('  ✓ Chuẩn hóa typeIds: UUID, dedupe, chữ hoa, giới hạn 1000, báo ID sai')
}

// ============================================================
// Static contracts: nối dây FE/BE (không thay thế kiểm thử trình duyệt).
// ============================================================
const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..')
const FE_VIEW = readFileSync(join(ROOT, '../fe/src/js/views/question-bank.js'), 'utf8')
const BE_INDEX = readFileSync(join(ROOT, 'functions/question-bank/index.ts'), 'utf8')
const MIGRATION = readFileSync(join(ROOT, 'migrations/20261026000000_qb_question_types.sql'), 'utf8')

// FE: availability và preview/final phải cùng gửi typeIds.
assert.match(FE_VIEW, /selectedTypeIds\.join\(','\)/, 'availability phải gửi typeIds')
assert.match(FE_VIEW, /typeIds:\s*\[\.\.\.new Set\(generatorState\.selectedTypeIds \|\| \[\]\)\]/, 'scope payload phải có typeIds')
// FE: đổi Khối phải reset Dạng bài đã chọn.
{
  const start = FE_VIEW.indexOf("scopeGradeBlockSel?.addEventListener('change'")
  assert.ok(start > 0, 'không tìm thấy handler đổi Khối')
  const handler = FE_VIEW.slice(start, start + 900)
  assert.match(handler, /generatorState\.selectedTypeIds = \[\]/, 'đổi Khối phải reset Dạng bài')
  assert.match(handler, /expandedLessons\.clear\(\)/, 'đổi Khối phải reset trạng thái mở rộng Bài')
}
// FE: tri-state thật theo leaf, và bỏ 1 Dạng bài chỉ xóa đúng type đó.
assert.match(FE_VIEW, /chk\.indeterminate = state === 'partial'/, 'Bài phải có indeterminate khi chọn một phần')
assert.match(FE_VIEW, /selectedTypeIds = generatorState\.selectedTypeIds\.filter\(id => id !== typeId\)/, 'bỏ Dạng bài chỉ xóa đúng type')
assert.match(FE_VIEW, /function recomputeParentSelections\(\)/, 'phải suy diễn lại cha từ leaf')
assert.match(FE_VIEW, /function hasScopeSelection\(\)/, 'phải coi Dạng bài là một lựa chọn phạm vi')

// BE: helper thuần được dùng, validate ở cả availability/generate/swap.
assert.match(BE_INDEX, /from '\.\/type-scope\.ts'/, 'backend phải dùng helper type-scope')
assert.match(BE_INDEX, /from\('qb_question_types'\)/, 'backend phải kiểm tra Dạng bài tồn tại')
assert.match(BE_INDEX, /grade_block/, 'backend phải kiểm tra Khối')
assert.ok(
  (BE_INDEX.match(/validateAndResolveTypeScope\(serviceRoleClient, scope\)/g) || []).length >= 3,
  'availability, generate-exam và swap-question đều phải validate Dạng bài'
)
assert.match(BE_INDEX, /qb_question_type_id\.in\.|buildTypePoolClauses\(/, 'pool phải khóa theo qb_question_type_id')
assert.match(BE_INDEX, /qb_question_type_id'/, 'availability phải select cột qb_question_type_id')

// Migration: cột phân loại phải tồn tại để câu hỏi gắn được Dạng bài.
assert.match(MIGRATION, /ADD COLUMN IF NOT EXISTS qb_question_type_id UUID/)
assert.match(MIGRATION, /REFERENCES public\.qb_question_types\(id\)/)

console.log('\n========================================')
console.log('Kết quả: toàn bộ kiểm thử Dạng bài Constant ĐÃ ĐẠT!')
console.log('========================================')
