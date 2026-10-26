import assert from 'node:assert/strict'
import { readFileSync, existsSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { parseExamMarkdown, formatQuestionToMarkdown } from '../src/js/utils/exam-parser.js'
import {
  resolveSingleQuestion,
  resolveBatchQuestionsTaxonomy,
  normalizeTaxonomyText,
  extractChapterOrLessonNumber
} from '../src/js/utils/qb-metadata-resolver.js'

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..')
const VIEW = readFileSync(join(ROOT, 'src/js/views/question-bank.js'), 'utf8')
const FN = readFileSync(join(ROOT, '..', 'supabase/functions/question-bank/index.ts'), 'utf8')
const FIXTURE = JSON.parse(readFileSync(join(ROOT, '..', 'supabase/seeds/qb-kntt-taxonomy.json'), 'utf8'))
const MIGRATION_PATH = join(ROOT, '..', 'supabase/migrations/20261026000000_qb_question_types.sql')
const SEED = readFileSync(join(ROOT, '..', 'supabase/scripts/seed-qb-kntt-taxonomy.mjs'), 'utf8')

console.log('=== Kiểm thử Oracle: Constant-Only Scope (Mục tiêu A) + Taxonomy Dạng bài (Mục tiêu B) ===')

// ---------- A1. Mirror: uniqueBlocks của modal chỉ lấy từ danh sách constant ----------
function computeUniqueBlocks(cachedGradeBlocksList) {
  return Array.from(new Set([...(cachedGradeBlocksList || [])])).filter(Boolean)
}
{
  const blocks = computeUniqueBlocks(['12-Toán', '11-Hóa'])
  assert.deepEqual(blocks, ['12-Toán', '11-Hóa'])
  assert.ok(!blocks.includes('12-Hóa-Động'), 'không có khối động')
  console.log('  ✓ uniqueBlocks chỉ gồm khối constant')
}

// ---------- A2. Mirror: reset khối stale (động) về khối constant hợp lệ ----------
function resetStaleBlock(gradeBlock, uniqueBlocks, filterBlock) {
  if (!gradeBlock || (gradeBlock !== 'ALL' && !uniqueBlocks.includes(gradeBlock))) {
    return (filterBlock && uniqueBlocks.includes(filterBlock)) ? filterBlock : (uniqueBlocks[0] || '')
  }
  return gradeBlock
}
{
  assert.equal(resetStaleBlock('12-Hóa-Động', ['12-Toán', '11-Hóa'], '11-Hóa'), '11-Hóa')
  assert.equal(resetStaleBlock('12-Hóa-Động', ['12-Toán', '11-Hóa'], ''), '12-Toán')
  assert.equal(resetStaleBlock('ALL', ['12-Toán'], ''), 'ALL')
  assert.equal(resetStaleBlock('11-Hóa', ['12-Toán', '11-Hóa'], ''), '11-Hóa')
  console.log('  ✓ khối stale (động) bị reset về khối constant, ALL và khối hợp lệ được giữ')
}

// ---------- A3. Mirror: "Chọn cả khối" chỉ chọn lớp constant ----------
function selectBlockClasses(curBlock, constClasses) {
  return (!curBlock || curBlock === 'ALL') ? constClasses
    : constClasses.filter(c => (c.grade_block || c.gradeBlock || '').trim() === curBlock.trim())
}
{
  const consts = [
    { id: 'cc1', grade_block: '12-Toán' },
    { id: 'cc2', grade_block: '11-Hóa' }
  ]
  const dyn = [{ id: 'dyn1', gradeBlock: '12-Toán' }]
  const picked = selectBlockClasses('12-Toán', consts)
  assert.deepEqual(picked.map(c => c.id), ['cc1'])
  assert.ok(!picked.some(c => dyn.some(d => d.id === c.id)), 'không lọt id lớp động')
  console.log('  ✓ Chọn cả khối chỉ lấy lớp constant của khối')
}

// ---------- A4. Mirror: mệnh đề pool constantOnly chỉ dùng cột qb_* ----------
function buildPoolClauses(scope) {
  const clauses = []
  const constantOnly = scope.constantOnly === true
  if (scope.lessonIds.length > 0) {
    clauses.push(`qb_lesson_id.in.(${scope.lessonIds.join(',')})`)
    if (!constantOnly) clauses.push(`lesson_id.in.(${scope.lessonIds.join(',')})`)
  }
  if (scope.chapterIds.length > 0) {
    clauses.push(`and(qb_chapter_id.in.(${scope.chapterIds.join(',')}),qb_lesson_id.is.null)`)
    if (!constantOnly) clauses.push(`and(chapter_id.in.(${scope.chapterIds.join(',')}),lesson_id.is.null)`)
  }
  if (scope.classIds.length > 0) {
    clauses.push(`and(qb_class_id.in.(${scope.classIds.join(',')}),qb_chapter_id.is.null,qb_lesson_id.is.null)`)
    if (!constantOnly) clauses.push(`and(class_id.in.(${scope.classIds.join(',')}),chapter_id.is.null,lesson_id.is.null)`)
  }
  return clauses
}
{
  const constant = buildPoolClauses({ constantOnly: true, lessonIds: ['l1'], chapterIds: ['ch1'], classIds: ['c1'] })
  const joined = constant.join(',')
  assert.ok(!/(^|[^_b])lesson_id\.in/.test(joined), 'constantOnly không có lesson_id.in')
  assert.ok(!/chapter_id\.in/.test(joined.replace('qb_chapter_id', '')), 'constantOnly không có chapter_id.in động')
  assert.ok(!/class_id\.in/.test(joined.replace('qb_class_id', '')), 'constantOnly không có class_id.in động')
  assert.ok(!/grade_block\.eq/.test(joined), 'constantOnly không có grade_block.eq')
  const legacy = buildPoolClauses({ constantOnly: false, lessonIds: ['l1'], chapterIds: [], classIds: [] })
  assert.ok(legacy.join(',').includes('lesson_id.in.(l1)'), 'legacy (không constantOnly) vẫn giữ nhánh động')
  console.log('  ✓ mệnh đề pool constantOnly chỉ qb_*, legacy không đổi')
}

// ---------- A5. Oracle: không lọt câu hỏi động dù trùng chuỗi khối ----------
function constantOnlyPoolFilter(rows) {
  // Câu hỏi constant = có liên kết qb_* (kể cả gắn ở cấp chương/lớp, qb_lesson_id NULL).
  return rows.filter(q => q.qb_class_id || q.qb_chapter_id || q.qb_lesson_id)
}
{
  const rows = [
    { id: 'q1', grade_block: '12-Toán', qb_lesson_id: 'l1' }, // constant, gắn bài
    { id: 'q2', grade_block: '12-Toán', qb_chapter_id: 'ch1', qb_lesson_id: null }, // constant, gắn chương
    { id: 'q3', grade_block: '12-Toán', class_id: 'dyn-c1' }, // động, trùng chuỗi khối
    { id: 'q4', grade_block: '12-Toán', lesson_id: 'dyn-l9' }, // động, trùng chuỗi khối
    { id: 'q5', grade_block: '12-Toán', qb_lesson_id: 'l2', lesson_id: 'dyn-l9' } // đã sync sang constant
  ]
  const kept = constantOnlyPoolFilter(rows).map(q => q.id)
  assert.deepEqual(kept, ['q1', 'q2', 'q5'])
  console.log('  ✓ pool constantOnly giữ câu gắn qb_* (kể cả gắn cấp chương, đã sync), loại câu thuần động')
}

// ---------- A6. Cả 3 loại câu hỏi vẫn được đếm trong availability ----------
{
  const rows = [
    { question_type: 'MULTIPLE_CHOICE' }, { question_type: 'TRUE_FALSE' },
    { question_type: 'SHORT_ANSWER' }, { question_type: 'MULTIPLE_CHOICE' }
  ]
  const mc = rows.filter(q => q.question_type === 'MULTIPLE_CHOICE').length
  const tf = rows.filter(q => q.question_type === 'TRUE_FALSE').length
  const sa = rows.filter(q => q.question_type === 'SHORT_ANSWER').length
  assert.deepEqual([mc, tf, sa], [2, 1, 1])
  console.log('  ✓ availability vẫn đếm đủ 3 loại câu hỏi')
}

// ---------- A7. Static contracts: FE modal tạo đề ----------
{
  const modalStart = VIEW.indexOf('openMatrixGeneratorModal')
  assert.ok(modalStart >= 0, 'tìm thấy openMatrixGeneratorModal')
  const modal = VIEW.slice(modalStart, modalStart + 200000)
  const uniqueLine = modal.match(/const uniqueBlocks = [^\n]+/)
  assert.ok(uniqueLine, 'tìm thấy dòng uniqueBlocks trong modal')
  assert.ok(!uniqueLine[0].includes('customBlocks'), 'uniqueBlocks không còn trộn customBlocks (khối động)')
  assert.ok(!modal.includes('const customBlocks'), 'không còn khai báo customBlocks trong modal')
  assert.ok(!modal.includes('const dynClasses'), 'cây scope không còn khai báo dynClasses')
  assert.ok(!modal.includes('...dynClasses'), 'cây scope không còn trộn dynClasses')
  assert.ok(modal.includes('constantOnly=true'), 'availability params có constantOnly=true')
  assert.ok(modal.includes('constantOnly: true'), 'scopePayload có constantOnly: true')
  assert.ok(modal.includes('constantTaxonomyState.classes'), 'Chọn cả khối/Mở rộng dùng lớp constant')
  assert.ok(modal.includes('chỉ danh mục Constant'), 'modal ghi rõ chỉ dùng danh mục Constant')
  console.log('  ✓ FE modal: khối/cây/select-block/expand/availability/scopePayload đều constant-only')
}

// ---------- A9. Bộ lọc danh sách câu hỏi theo Dạng bài Constant ----------
{
  assert.ok(VIEW.includes('qb-filter-question-type-id'), 'FE có selector lọc Dạng bài Constant')
  assert.ok(VIEW.includes('filterState.questionTypeId'), 'FE có state Dạng bài riêng với loại câu hỏi')
  assert.ok(VIEW.includes('qbQuestionTypeId'), 'FE truyền ID Dạng bài lên API')
  assert.ok(FN.includes("url.searchParams.get('qbQuestionTypeId')"), 'backend đọc filter Dạng bài')
  assert.ok(FN.includes("eq('qb_question_type_id', qbQuestionTypeId)"), 'backend lọc đúng cột qb_question_type_id')
  console.log('  ✓ bộ lọc Dạng bài Constant tách biệt với loại câu hỏi và lọc đúng backend')
}

// ---------- A8. Static contracts: backend constantOnly ----------
{
  assert.ok(FN.includes('constantOnly?: boolean'), 'ScopeTarget có constantOnly')
  assert.ok(FN.includes("parseScopeBool(input.scope?.constantOnly ?? input.constantOnly)"), 'normalizeScopeInput đọc constantOnly từ scope/body')
  assert.ok(FN.includes("constantOnly: url.searchParams.get('constantOnly')"), 'check-availability nhận param constantOnly')
  assert.ok(FN.includes('if (scope.constantOnly) itemScope.constantOnly = true'), 'generate-exam lan constantOnly xuống distribution')
  assert.ok(FN.includes('if (constantOnly)'), 'buildPoolQuery có nhánh constantOnly')
  assert.ok(FN.includes("if (constantOnly && presetOrBlock.length === 0) return { data: [], error: null }"), 'constantOnly không khối/id -> pool rỗng')
  console.log('  ✓ backend: normalize/buildPoolQuery/check-availability/distribution đều xử lý constantOnly')
}

// ---------- B1. Fixture: số lượng theo đúng mục lục KNTT đã đối chiếu ----------
{
  const expected = {
    '11-Toán': { chapters: 9, lessons: 33, types: 110 },
    '12-Toán': { chapters: 6, lessons: 19, types: 59 },
    '11-Hóa': { chapters: 6, lessons: 19, types: 58 },
    '12-Hóa': { chapters: 8, lessons: 22, types: 67 }
  }
  assert.equal(FIXTURE.blocks.length, 4)
  let totCh = 0, totLs = 0, totTy = 0
  for (const b of FIXTURE.blocks) {
    const ch = b.chapters.length
    const ls = b.chapters.reduce((s, c) => s + c.lessons.length, 0)
    const ty = b.chapters.reduce((s, c) => s + c.lessons.reduce((t, l) => t + l.types.length, 0), 0)
    assert.deepEqual({ chapters: ch, lessons: ls, types: ty }, expected[b.name], `số lượng khớp mục lục cho ${b.name}`)
    totCh += ch; totLs += ls; totTy += ty
  }
  assert.deepEqual([totCh, totLs, totTy], [29, 93, 294])
  console.log('  ✓ fixture: 4 khối, 29 chương, 93 bài, 294 dạng bài đúng mục lục KNTT')
}

// ---------- B2. Fixture: parent-child, unique trong phạm vi, không orphan, không nhãn chung ----------
{
  const norm = (s) => String(s).trim().toLowerCase().replace(/\s+/g, ' ')
    .replace(/(bài\s+\d+)\s*[:.]\s*/g, '$1. ')
  for (const b of FIXTURE.blocks) {
    const chNames = new Set()
    for (const c of b.chapters) {
      assert.ok(!chNames.has(norm(c.title)), `trùng chương trong ${b.name}: ${c.title}`)
      chNames.add(norm(c.title))
      assert.ok(!/ôn tập|bài tập cuối chương/i.test(c.title), `chương không chứa bài ôn tập: ${c.title}`)
      const lsNames = new Set()
      for (const l of c.lessons) {
        assert.ok(!lsNames.has(norm(l.title)), `trùng bài trong ${c.title}: ${l.title}`)
        lsNames.add(norm(l.title))
        assert.ok(/^Bài \d+\./.test(l.title), `bài giữ số SGK: ${l.title}`)
        assert.ok(!/ôn tập|bài tập cuối chương/i.test(l.title), `loại bài ôn tập khỏi seed: ${l.title}`)
        assert.ok(l.types.length >= 1, `mỗi bài có ít nhất 1 dạng bài: ${l.title}`)
        const tyNames = new Set()
        for (const t of l.types) {
          assert.ok(!tyNames.has(norm(t)), `trùng dạng bài trong ${l.title}: ${t}`)
          tyNames.add(norm(t))
          assert.notEqual(norm(t), 'bài tập tổng hợp', 'không dùng nhãn chung Bài tập tổng hợp')
        }
      }
    }
  }
  // Spot-check tên bài theo mục lục SGK (đã đối chiếu đa nguồn ngày 2026-10-26).
  const flat = FIXTURE.blocks.flatMap(b => b.chapters.flatMap(c => c.lessons.map(l => l.title)))
  assert.ok(flat.includes('Bài 16. Công thức tính góc trong không gian'), 'Toán 12 Bài 16 = góc (theo đa số mục lục)')
  assert.ok(flat.includes('Bài 6. Một số hợp chất của nitrogen với oxygen'), 'Hóa 11 Bài 6 đúng tên')
  assert.ok(flat.includes('Bài 29. Một số tính chất và ứng dụng của phức chất'), 'Hóa 12 Bài 29 đúng tên')
  console.log('  ✓ fixture: chuỗi cha-con đầy đủ, unique trong phạm vi, không orphan, không nhãn chung')
}

// ---------- B3. Mirror: seed idempotent (matching theo natural key + fallback số bài) ----------
function seedPlan(existing, fixture) {
  const norm2 = (s) => String(s).trim().toLowerCase().replace(/\s+/g, ' ')
    .replace(/(bài\s+\d+)\s*[:.]\s*/g, '$1. ')
    .replace(/(chương\s+[ivxlcdm0-9]+)\s*[:.]\s*/g, '$1. ')
  const leadingNum = (s) => {
    const m = String(s).trim().match(/^Bài\s+(\d+)/i)
    return m ? m[1] : null
  }
  const find = (list, title) => {
    const exact = list.find(r => norm2(r.name || r.title) === norm2(title))
    if (exact) return exact
    const num = leadingNum(title)
    if (num) {
      const byNum = list.filter(r => leadingNum(r.name || r.title) === num)
      if (byNum.length === 1) return byNum[0]
    }
    return null
  }
  // Fixture có tên chương/bài/dạng bài phân biệt toàn cục (kiểm chứng ở B2b) nên
  // mirror phẳng đủ để chứng minh tính idempotent của cơ chế matching.
  const plan = []
  for (const b of fixture.blocks) {
    if (!find(existing.gradeBlocks, b.name)) plan.push(`gb:${b.name}`)
    if (!find(existing.classes, b.class)) plan.push(`cl:${b.class}`)
    for (const c of b.chapters) {
      if (!find(existing.chapters, c.title)) plan.push(`ch:${c.title}`)
      for (const l of c.lessons) {
        if (!find(existing.lessons, l.title)) plan.push(`ls:${l.title}`)
        for (const t of l.types) {
          if (!find(existing.questionTypes, t)) plan.push(`ty:${t}`)
        }
      }
    }
  }
  return plan
}
{
  // B2b: tên chương/bài/dạng bài phân biệt toàn cục trong fixture.
  const allCh = FIXTURE.blocks.flatMap(b => b.chapters.map(c => c.title))
  const allLs = FIXTURE.blocks.flatMap(b => b.chapters.flatMap(c => c.lessons.map(l => l.title)))
  const allTy = FIXTURE.blocks.flatMap(b => b.chapters.flatMap(c => c.lessons.flatMap(l => l.types)))
  assert.equal(new Set(allCh).size, allCh.length, 'tên chương phân biệt toàn cục')
  assert.equal(new Set(allLs).size, allLs.length, 'tên bài phân biệt toàn cục')
  const empty = { gradeBlocks: [], classes: [], chapters: [], lessons: [], questionTypes: [] }
  const first = seedPlan(empty, FIXTURE)
  assert.equal(first.length, 4 + 4 + 29 + 93 + 294, 'lần đầu tạo đủ 424 item (4 khối + 4 lớp + 29 chương + 93 bài + 294 dạng bài)')
  // Giả lập DB sau lần seed 1: mọi item đã có.
  const afterFirst = {
    gradeBlocks: FIXTURE.blocks.map(b => ({ name: b.name })),
    classes: FIXTURE.blocks.map(b => ({ name: b.class })),
    chapters: FIXTURE.blocks.flatMap(b => b.chapters.map(c => ({ title: c.title }))),
    lessons: FIXTURE.blocks.flatMap(b => b.chapters.flatMap(c => c.lessons.map(l => ({ title: l.title })))),
    questionTypes: allTy.map(t => ({ name: t }))
  }
  assert.deepEqual(seedPlan(afterFirst, FIXTURE), [], 'chạy lại không tạo thêm gì (idempotent)')
  console.log('  ✓ seed matching idempotent: lần 1 đủ 424, lần 2 plan rỗng')
}

// ---------- B4. Static contracts: backend + UI cho cấp Dạng bài ----------
{
  assert.ok(FN.includes("from('qb_question_types')"), 'backend đọc qb_question_types ở constant-taxonomy GET')
  assert.ok(FN.includes('questionTypes: tyRes.data || []'), 'GET constant-taxonomy trả questionTypes')
  assert.ok(FN.includes("if (normType === 'questionType')"), 'backend xử lý create/update/delete questionType')
  assert.ok(FN.includes('qb_question_type_id'), 'backend có cột qb_question_type_id (delete-guard + whitelist)')
  assert.ok(VIEW.includes('questionTypes: []'), 'constantTaxonomyState có questionTypes')
  assert.ok(VIEW.includes('value="questionType">5. Dạng bài'), 'form CRUD có option Dạng bài cấp 5')
  assert.ok(VIEW.includes('taxo-form-lesson-id'), 'form Dạng bài có select bài học cha')
  assert.ok(VIEW.includes('data-type="questionType"'), 'cây có node Dạng bài (thêm/sửa/xóa)')
  assert.ok(VIEW.includes('Dạng bài'), 'cây hiển thị đếm Dạng bài')
  console.log('  ✓ backend + CRUD UI hỗ trợ cấp Dạng bài theo bài học')
}

// ---------- B5. Migration + seed script tồn tại, dry-run là mặc định ----------
{
  assert.ok(existsSync(MIGRATION_PATH), 'migration qb_question_types tồn tại')
  const mig = readFileSync(MIGRATION_PATH, 'utf8')
  assert.ok(mig.includes('CREATE TABLE IF NOT EXISTS public.qb_question_types'), 'migration tạo bảng qb_question_types')
  assert.ok(mig.includes('uq_qb_question_types_lesson_name'), 'migration có unique (lesson_id, name)')
  assert.ok(mig.includes('uq_qb_classes_grade_block_name'), 'migration có unique cho lớp')
  assert.ok(mig.includes('uq_qb_chapters_class_title'), 'migration có unique cho chương')
  assert.ok(mig.includes('uq_qb_lessons_chapter_title'), 'migration có unique cho bài')
  assert.ok(mig.includes('qb_question_type_id'), 'migration thêm cột qb_question_type_id')
  assert.ok(mig.includes('Admin insert qb_question_types'), 'migration có RLS ADMIN cho dạng bài')
  assert.ok(mig.includes("TG_TABLE_NAME = 'qb_question_types'"), 'migration mở rộng delete-guard cho dạng bài')
  assert.ok(SEED.includes("args.includes('--apply')"), 'seed chỉ ghi khi có --apply')
  assert.ok(!SEED.includes('QB_ADMIN_JWT=') || SEED.includes('process.env.QB_ADMIN_JWT'), 'seed không hardcode JWT')
  console.log('  ✓ migration + seed script đúng contract (dry-run mặc định, không token trong repo)')
}

// ========================================================
// Mục tiêu C: Phân loại Markdown theo Metadata cấp câu
// [LỚP], [MÔN], [CHƯƠNG], [BÀI HỌC], [DẠNG BÀI] và biến thể không dấu
// ========================================================
console.log('\n=== Kiểm thử Oracle: Phân loại Markdown theo Metadata cấp câu (Mục tiêu C) ===')

// Chuẩn bị Mock Taxonomy State từ FIXTURE (có kèm Dạng bài fallback "Khác" cho mỗi bài)
const mockTaxonomy = (() => {
  const classes = FIXTURE.blocks.map(b => ({
    id: `cl-${b.name}`,
    name: b.class,
    grade_block: b.name
  }))
  const chapters = []
  const lessons = []
  const questionTypes = []

  for (const b of FIXTURE.blocks) {
    const clId = `cl-${b.name}`
    for (let ci = 0; ci < b.chapters.length; ci++) {
      const c = b.chapters[ci]
      const chId = `ch-${b.name}-${c.title}`
      chapters.push({ id: chId, class_id: clId, title: c.title, order_index: ci + 1 })
      for (let li = 0; li < c.lessons.length; li++) {
        const l = c.lessons[li]
        const lsId = `ls-${b.name}-${l.title}`
        lessons.push({ id: lsId, chapter_id: chId, title: l.title, order_index: li + 1 })
        for (let ti = 0; ti < l.types.length; ti++) {
          const t = l.types[ti]
          questionTypes.push({ id: `ty-${lsId}-${t}`, lesson_id: lsId, name: t, order_index: ti + 1 })
        }
        // Thêm Dạng bài "Khác" cho mỗi bài học
        questionTypes.push({ id: `ty-${lsId}-khac`, lesson_id: lsId, name: 'Khác', order_index: 999 })
      }
    }
  }
  return { classes, chapters, lessons, questionTypes }
})()

// ---------- C1. Match Constant duy nhất (có dấu và biến thể không dấu) ----------
{
  const md = `
[Câu 1] [LỚP: 11] [MÔN: Toán] [CHƯƠNG: Chương I. Hàm số lượng giác và phương trình lượng giác] [BÀI HỌC: Bài 1. Giá trị lượng giác của góc lượng giác] [DẠNG BÀI: Tính giá trị lượng giác của một góc]
Cho $\\alpha = \\frac{\\pi}{3}$. Tính $\\sin \\alpha$.
*A. $\\frac{\\sqrt{3}}{2}$
B. $\\frac{1}{2}$
C. $1$
D. $0$
[Lời giải]
Ta có $\\sin \\frac{\\pi}{3} = \\frac{\\sqrt{3}}{2}$.

[Câu 2] [LOP: 11] [MON: Toan] [CHUONG: Chuong I] [BAI HOC: Bai 1] [DANG BAI: Tinh gia tri luong giac cua mot goc]
Tính giá trị của $\\cos 0$.
*A. $1$
B. $0$
C. $-1$
D. $\\frac{1}{2}$
[Lời giải]
Ta có $\\cos 0 = 1$.
`
  const { questions } = parseExamMarkdown(md)
  assert.equal(questions.length, 2, 'parse được 2 câu')

  // Kiểm tra metadata tags trích xuất từ parser
  assert.equal(questions[0].classTag, '11')
  assert.equal(questions[0].subjectTag, 'Toán')
  assert.ok(questions[0].chapterTag.includes('Hàm số lượng giác'))
  assert.ok(questions[0].lessonTag.includes('Giá trị lượng giác'))
  assert.equal(questions[0].questionTypeTag, 'Tính giá trị lượng giác của một góc')

  // Câu không dấu
  assert.equal(questions[1].classTag, '11')
  assert.equal(questions[1].subjectTag, 'Toan')
  assert.equal(questions[1].chapterTag, 'Chuong I')
  assert.equal(questions[1].lessonTag, 'Bai 1')
  assert.equal(questions[1].questionTypeTag, 'Tinh gia tri luong giac cua mot goc')

  // Phân giải taxonomy
  const summary = resolveBatchQuestionsTaxonomy(questions, mockTaxonomy)
  assert.equal(summary.errorCount, 0, 'không có lỗi phân giải')
  assert.equal(summary.resolvedCount, 2, 'phân giải thành công cả 2 câu')
  assert.equal(summary.fallbackCount, 0, 'khớp chính xác dạng bài, không cần fallback')

  // Kiểm tra target resolve của Câu 1
  assert.equal(questions[0].qbClassId, 'cl-11-Toán')
  assert.equal(questions[0].qbGradeBlock, '11-Toán')
  assert.ok(questions[0].qbChapterId.includes('Hàm số lượng giác'))
  assert.ok(questions[0].qbLessonId.includes('Bài 1'))
  assert.equal(questions[0].resolvedQuestionTypeName, 'Tính giá trị lượng giác của một góc')
  assert.equal(questions[0].isFallback, false)
  assert.equal(questions[0].metadataError, '')

  // Kiểm tra target resolve của Câu 2 (không dấu)
  assert.equal(questions[1].qbClassId, 'cl-11-Toán')
  assert.equal(questions[1].qbGradeBlock, '11-Toán')
  assert.ok(questions[1].qbLessonId.includes('Bài 1'))
  assert.equal(questions[1].resolvedQuestionTypeName, 'Tính giá trị lượng giác của một góc')
  assert.equal(questions[1].isFallback, false)
  assert.equal(questions[1].metadataError, '')

  console.log('  ✓ C1: Match Constant duy nhất thành công cho cả tag có dấu và không dấu')
}

// ---------- C2. Fallback vào Dạng bài "Khác" của chính bài học ----------
{
  const md = `
[Câu 1] [LỚP: 11] [MÔN: Toán] [CHƯƠNG: Chương I] [BÀI HỌC: Bài 1]
Câu hỏi chưa gắn Dạng bài cụ thể.
*A. Đúng
B. Sai

[Câu 2] [LỚP: 11] [MÔN: Toán] [CHƯƠNG: Chương I] [BÀI HỌC: Bài 1] [DẠNG BÀI: Dạng bài lạ không có trong SGK]
Câu hỏi có dạng bài chưa từng có trong taxonomy.
*A. Đúng
B. Sai
`
  const { questions } = parseExamMarkdown(md)
  assert.equal(questions.length, 2)

  const summary = resolveBatchQuestionsTaxonomy(questions, mockTaxonomy)
  assert.equal(summary.errorCount, 0, 'không có lỗi phân giải')
  assert.equal(summary.resolvedCount, 2, 'cả 2 câu đều resolve thành công')
  assert.equal(summary.fallbackCount, 2, 'cả 2 câu đều fallback vào "Khác"')

  // Câu 1: thiếu tag Dạng bài -> fallback vào Dạng bài "Khác" của Bài 1
  assert.equal(questions[0].qbGradeBlock, '11-Toán')
  assert.ok(questions[0].qbLessonId.includes('Bài 1'))
  assert.ok(questions[0].qbQuestionTypeId.endsWith('-khac'))
  assert.equal(questions[0].resolvedQuestionTypeName, 'Khác')
  assert.equal(questions[0].isFallback, true)

  // Câu 2: tag Dạng bài không match -> fallback vào Dạng bài "Khác" của Bài 1
  assert.equal(questions[1].qbGradeBlock, '11-Toán')
  assert.ok(questions[1].qbLessonId.includes('Bài 1'))
  assert.ok(questions[1].qbQuestionTypeId.endsWith('-khac'))
  assert.equal(questions[1].resolvedQuestionTypeName, 'Khác')
  assert.equal(questions[1].isFallback, true)

  console.log('  ✓ C2: Thiếu hoặc không match Dạng bài thì tự động fallback vào Dạng bài "Khác" của chính bài học')
}

// ---------- C3. Nhiều bài học trong cùng một file Markdown (độc lập từng câu) ----------
{
  const md = `
[Câu 1] [LỚP: 11] [MÔN: Toán] [CHƯƠNG: Chương I] [BÀI HỌC: Bài 1] [DẠNG BÀI: Tính giá trị lượng giác của một góc]
Câu của Bài 1 Toán 11.
*A. Đ

[Câu 2] [LỚP: 11] [MÔN: Toán] [CHƯƠNG: Chương I] [BÀI HỌC: Bài 2] [DẠNG BÀI: Công thức cộng]
Câu của Bài 2 Toán 11.
*A. Đ

[Câu 3] [LỚP: 12] [MÔN: Hóa] [CHƯƠNG: Chương I] [BÀI HỌC: Bài 1] [DẠNG BÀI: Khái niệm về ester và lipid]
Câu của Bài 1 Hóa 12 (khối khác, môn khác).
*A. Đ
`
  const { questions } = parseExamMarkdown(md)
  assert.equal(questions.length, 3)

  const summary = resolveBatchQuestionsTaxonomy(questions, mockTaxonomy)
  assert.equal(summary.errorCount, 0)
  assert.equal(summary.resolvedCount, 3)

  // Đảm bảo không dùng target chung của file: mỗi câu mang đích riêng biệt
  assert.equal(questions[0].qbGradeBlock, '11-Toán')
  assert.ok(questions[0].resolvedLessonTitle.includes('Bài 1'))

  assert.equal(questions[1].qbGradeBlock, '11-Toán')
  assert.ok(questions[1].resolvedLessonTitle.includes('Bài 2'))

  assert.equal(questions[2].qbGradeBlock, '12-Hóa')
  assert.ok(questions[2].qbClassId.includes('12-Hóa'))
  assert.ok(questions[2].resolvedLessonTitle.includes('Bài 1'))

  // 3 câu có 3 lesson_id hoàn toàn khác nhau
  const lessonIds = new Set(questions.map(q => q.qbLessonId))
  assert.equal(lessonIds.size, 3, 'mỗi câu tự resolve đúng bài học độc lập, không dùng target chung')

  console.log('  ✓ C3: File chứa nhiều bài học / môn / khối khác nhau: mỗi câu tự resolve đích riêng biệt')
}

// ---------- C4. Metadata thiếu / sai / trùng (Báo lỗi cụ thể, không đoán, không fallback) ----------
{
  // 4a. Thiếu Lớp
  const qMissingClass = { promptText: 'Test', chapterTag: 'Chương I', lessonTag: 'Bài 1' }
  const res1 = resolveSingleQuestion(qMissingClass, mockTaxonomy)
  assert.equal(res1.success, false)
  assert.ok(res1.error.includes('Thiếu metadata [LỚP]'), 'báo rõ thiếu lớp')
  assert.equal(res1.qbLessonId, null, 'không được gán lessonId')
  assert.equal(res1.qbQuestionTypeId, null, 'không được fallback vào Khác khi chưa resolve được cha')

  // 4b. Thiếu Môn (11 có cả Toán và Hóa -> mơ hồ)
  const qMissingSubject = { promptText: 'Test', classTag: '11', chapterTag: 'Chương I', lessonTag: 'Bài 1' }
  const res2 = resolveSingleQuestion(qMissingSubject, mockTaxonomy)
  assert.equal(res2.success, false)
  assert.ok(res2.error.includes('thiếu metadata [MÔN]'), 'báo rõ thiếu môn để phân biệt khối')

  // 4c. Sai Chương không tồn tại trong Lớp
  const qWrongChapter = { promptText: 'Test', classTag: '11-Toán', chapterTag: 'Chương 99 Không Tồn Tại', lessonTag: 'Bài 1' }
  const res3 = resolveSingleQuestion(qWrongChapter, mockTaxonomy)
  assert.equal(res3.success, false)
  assert.ok(res3.error.includes('Không tìm thấy Chương'), 'báo rõ không tìm thấy chương')
  assert.equal(res3.qbLessonId, null)

  // 4d. Sai Bài học không tồn tại trong Chương
  const qWrongLesson = { promptText: 'Test', classTag: '11-Toán', chapterTag: 'Chương I', lessonTag: 'Bài 99 Vô Lý' }
  const res4 = resolveSingleQuestion(qWrongLesson, mockTaxonomy)
  assert.equal(res4.success, false)
  assert.ok(res4.error.includes('Không tìm thấy Bài học'), 'báo rõ không tìm thấy bài học')
  assert.equal(res4.qbLessonId, null)

  // 4e. Thiếu Bài học
  const qMissingLesson = { promptText: 'Test', classTag: '11-Toán', chapterTag: 'Chương I' }
  const res5 = resolveSingleQuestion(qMissingLesson, mockTaxonomy)
  assert.equal(res5.success, false)
  assert.ok(res5.error.includes('Thiếu metadata [BÀI HỌC]'), 'báo rõ thiếu bài học')
  assert.equal(res5.qbLessonId, null)

  console.log('  ✓ C4: Metadata thiếu/sai/trùng báo lỗi cụ thể, tuyệt đối không đoán và không fallback sai cha')
}

// ---------- C5. Static contracts: Backend validation cho chuỗi type -> lesson -> chapter -> class ----------
{
  assert.ok(FN.includes('taxonomyTypesById'), 'backend tra cứu qb_question_types')
  assert.ok(FN.includes('taxonomyLessonsById'), 'backend tra cứu qb_lessons')
  assert.ok(FN.includes('taxonomyChaptersById'), 'backend tra cứu qb_chapters')
  assert.ok(FN.includes('taxonomyClassesById'), 'backend tra cứu qb_classes')
  assert.ok(FN.includes('type.lesson_id !== qbLessonId'), 'backend validate Dạng bài phải thuộc Bài học')
  assert.ok(FN.includes('lesson.chapter_id !== qbChapterId'), 'backend validate Bài học phải thuộc Chương')
  assert.ok(FN.includes('chapter.class_id !== qbClassId'), 'backend validate Chương phải thuộc Lớp')
  assert.ok(FN.includes('Lớp Constant không tồn tại'), 'backend chặn Lớp Constant không hợp lệ')
  console.log('  ✓ C5: Backend validate đầy đủ chuỗi cha-con type -> lesson -> chapter -> class với mã lỗi 400')
}

// ---------- C6. Migration fallback "Khác" & Bảo toàn định dạng LaTeX/ảnh/lời giải/batch source ----------
{
  const FALLBACK_MIG_PATH = join(ROOT, '..', 'supabase/migrations/20261026000001_qb_fallback_other_type.sql')
  assert.ok(existsSync(FALLBACK_MIG_PATH), 'migration fallback Khác tồn tại')
  const mig = readFileSync(FALLBACK_MIG_PATH, 'utf8')
  assert.ok(mig.includes('INSERT INTO public.qb_question_types'), 'migration chèn vào qb_question_types')
  assert.ok(mig.includes('WHERE NOT EXISTS'), 'migration idempotent an toàn không chèn trùng')
  assert.ok(mig.includes("'Khác'"), 'migration chèn dạng bài mang tên Khác')

  // Kiểm tra bảo toàn LaTeX, mhchem, hình ảnh, lời giải
  const sampleMd = `
[Câu 1] [LỚP: 11] [MÔN: Toán] [CHƯƠNG: Chương I] [BÀI HỌC: Bài 1]
Cho hàm số $f(x) = \\int_0^1 \\frac{x^2 + 1}{x + 1} dx$. Khí $\\ce{CO2}$.
[Ảnh]
*A. $\\frac{1}{2}$
B. $1$
[Lời giải]
Ta tính tích phân:
$$\\int_0^1 f(x) dx = \\frac{1}{2}$$
`
  const parsed = parseExamMarkdown(sampleMd)
  assert.equal(parsed.questions.length, 1)
  const q = parsed.questions[0]
  assert.ok(q.promptText.includes('f(x) = \\int_0^1'), 'giữ nguyên LaTeX inline trong đề bài')
  assert.ok(q.promptText.includes('\\ce{CO2}'), 'giữ nguyên mhchem')
  assert.equal(q.hasImagePlaceholder, true, 'nhận diện đúng placeholder [Ảnh]')
  assert.ok(q.explanation.includes('\\int_0^1 f(x) dx'), 'giữ nguyên LaTeX display trong lời giải')

  // Format ngược lại Markdown giữ nguyên các tag metadata
  const formatted = formatQuestionToMarkdown(q)
  assert.ok(formatted.includes('[LỚP: 11]'), 'format giữ tag Lớp')
  assert.ok(formatted.includes('[MÔN: Toán]'), 'format giữ tag Môn')
  assert.ok(formatted.includes('[CHƯƠNG: Chương I]'), 'format giữ tag Chương')
  assert.ok(formatted.includes('[BÀI HỌC: Bài 1]'), 'format giữ tag Bài học')
  assert.ok(formatted.includes('\\ce{CO2}'), 'format giữ mhchem')
  assert.ok(formatted.includes('[Ảnh]'), 'format giữ placeholder [Ảnh]')

  console.log('  ✓ C6: Migration fallback "Khác" idempotent, bảo toàn nguyên vẹn LaTeX/mhchem/ảnh/lời giải/source')
}

// ========================================================
// Mục tiêu D: Hồi quy metadata — trước header, sau option, multi-lesson,
// fallback từng bài, missing/ambiguous, backend "Khác" + dedup theo cặp
// ========================================================
console.log('\n=== Kiểm thử Oracle: Hồi quy metadata (Mục tiêu D) ===')

// ---------- D1. Metadata đứng riêng TRƯỚC [Câu N] không bị nuốt ----------
{
  // D1a: tag đứng riêng trước [Câu 1] -> thuộc Câu 1, không lọt vào đề bài
  const mdA = `
[LỚP: 11] [MÔN: Toán] [CHƯƠNG: Chương I] [BÀI HỌC: Bài 1]
[Câu 1]
Đề câu 1.
*A. 1
B. 2
`
  const rA = parseExamMarkdown(mdA)
  assert.equal(rA.questions.length, 1)
  assert.equal(rA.questions[0].classTag, '11')
  assert.equal(rA.questions[0].subjectTag, 'Toán')
  assert.equal(rA.questions[0].chapterTag, 'Chương I')
  assert.equal(rA.questions[0].lessonTag, 'Bài 1')
  assert.ok(!rA.questions[0].promptText.includes('[LỚP'), 'tag không lọt vào đề bài')

  // D1b: KHÔNG có metadata phạm vi file ngầm định — Câu 2 không kế thừa tag của Câu 1
  const mdB = `
[LỚP: 11] [MÔN: Toán] [CHƯƠNG: Chương I] [BÀI HỌC: Bài 1]
[Câu 1]
Đề câu 1.
*A. 1
B. 2

[Câu 2]
Đề câu 2 không có tag.
*A. 3
B. 4
`
  const rB = parseExamMarkdown(mdB)
  assert.equal(rB.questions.length, 2)
  assert.equal(rB.questions[0].classTag, '11')
  assert.equal(rB.questions[1].classTag, null, 'Câu 2 không kế thừa LỚP của Câu 1')
  assert.equal(rB.questions[1].subjectTag, null, 'Câu 2 không kế thừa MÔN của Câu 1')
  assert.equal(rB.questions[1].lessonTag, null, 'Câu 2 không kế thừa BÀI HỌC của Câu 1')

  // D1c: tag đứng riêng GIỮA 2 câu -> thuộc Câu 2, Câu 1 giữ nguyên tag của nó
  const mdC = `
[Câu 1] [LỚP: 11] [MÔN: Toán]
Đề câu 1.
*A. 1
B. 2
[LỚP: 12] [MÔN: Hóa] [CHƯƠNG: Chương 1] [BÀI HỌC: Bài 2]
[Câu 2]
Đề câu 2.
*A. 3
B. 4
`
  const rC = parseExamMarkdown(mdC)
  assert.equal(rC.questions[0].subjectTag, 'Toán', 'Câu 1 giữ MÔN của nó')
  assert.equal(rC.questions[1].classTag, '12', 'tag giữa 2 câu thuộc Câu 2')
  assert.equal(rC.questions[1].subjectTag, 'Hóa')
  assert.equal(rC.questions[1].lessonTag, 'Bài 2')

  // D1d: thẻ inline trên dòng header thắng pending khi trùng field, field còn lại giữ pending
  const mdD = `
[LỚP: 11] [MÔN: Toán]
[Câu 1] [LỚP: 12]
Đề câu 1.
*A. 1
B. 2
`
  const rD = parseExamMarkdown(mdD)
  assert.equal(rD.questions[0].classTag, '12', 'thẻ inline thắng pending')
  assert.equal(rD.questions[0].subjectTag, 'Toán', 'field không trùng giữ pending')

  // D1e: tag sau phương án của câu cuối (không còn câu kế tiếp) -> áp vào chính câu cuối, không ghi đè
  const mdE = `
[Câu 1] [LỚP: 11]
Đề câu 1.
*A. 1
B. 2
[MÔN: Toán]
`
  const rE = parseExamMarkdown(mdE)
  assert.equal(rE.questions[0].classTag, '11', 'tag cũ của câu cuối không bị ghi đè')
  assert.equal(rE.questions[0].subjectTag, 'Toán', 'tag cuối file không bị nuốt')

  console.log('  ✓ D1: Metadata đứng riêng trước [Câu N] giữ đúng câu, không nuốt, không lan cả file')
}

// ---------- D2. Metadata SAU option không bị nuốt vào option text ----------
{
  // D2a: tag sau option -> option sạch, tag chuyển cho câu kế tiếp
  const mdA = `
[Câu 1] [LỚP: 11] [MÔN: Toán]
Đề câu 1.
*A. 1
B. 2
[MÔN: Hóa]
[Câu 2]
Đề câu 2.
*A. 3
B. 4
`
  const rA = parseExamMarkdown(mdA)
  assert.equal(rA.questions[0].options[1].text, '2', 'option B không chứa tag metadata')
  assert.ok(!rA.questions[0].options[1].text.includes('[MÔN'), 'option không bị nhiễm tag')
  assert.equal(rA.questions[0].subjectTag, 'Toán', 'Câu 1 giữ MÔN của nó')
  assert.equal(rA.questions[1].subjectTag, 'Hóa', 'tag sau option chuyển cho Câu 2')

  // D2b: dòng nối phương án bắt đầu bằng '[' nhưng không phải thẻ -> vẫn là nội dung phương án
  const mdB = `
[Câu 1]
Đề.
*A. [1, 2]
tiếp [x, y]
B. 3
`
  const rB = parseExamMarkdown(mdB)
  assert.equal(rB.questions[0].options[0].text, '[1, 2]\ntiếp [x, y]', 'nội dung phương án dạng [x, y] được giữ nguyên')

  // D2c: tag đứng riêng trong vùng đề (trước phương án) vẫn thuộc câu hiện tại
  const mdC = `
[Câu 1]
[LỚP: 11] [MÔN: Toán]
Đề.
*A. 1
B. 2
`
  const rC = parseExamMarkdown(mdC)
  assert.equal(rC.questions[0].classTag, '11', 'tag vùng đề thuộc câu hiện tại')
  assert.equal(rC.questions[0].subjectTag, 'Toán')

  console.log('  ✓ D2: Metadata sau option được nhận trước khi append option, option text sạch')
}

// ---------- D3. Multi-lesson: fallback theo từng bài, cùng nội dung khác bài vẫn phân biệt ----------
{
  const taxD3 = {
    classes: [{ id: 'cl', name: 'Toán 11', grade_block: '11-Toán' }],
    chapters: [{ id: 'ch', class_id: 'cl', title: 'Chương I' }],
    lessons: [
      { id: 'lsA', chapter_id: 'ch', title: 'Bài 1' },
      { id: 'lsB', chapter_id: 'ch', title: 'Bài 2' }
    ],
    questionTypes: [
      { id: 'tyA1', lesson_id: 'lsA', name: 'Dạng A' },
      { id: 'tyA-khac', lesson_id: 'lsA', name: 'Khác' },
      { id: 'tyB1', lesson_id: 'lsB', name: 'Dạng B' },
      { id: 'tyB-khac', lesson_id: 'lsB', name: 'Khác' }
    ]
  }

  // Fallback mỗi bài dùng đúng "Khác" của bài đó, không lẫn nhau
  const qA = { classTag: '11-Toán', chapterTag: 'Chương I', lessonTag: 'Bài 1' }
  const qB = { classTag: '11-Toán', chapterTag: 'Chương I', lessonTag: 'Bài 2' }
  const qA2 = { classTag: '11-Toán', chapterTag: 'Chương I', lessonTag: 'Bài 1', questionTypeTag: 'Dạng không có' }
  const resA = resolveSingleQuestion(qA, taxD3)
  const resB = resolveSingleQuestion(qB, taxD3)
  const resA2 = resolveSingleQuestion(qA2, taxD3)
  assert.equal(resA.success, true)
  assert.equal(resA.qbQuestionTypeId, 'tyA-khac')
  assert.equal(resA.isFallback, true)
  assert.equal(resB.qbQuestionTypeId, 'tyB-khac')
  assert.notEqual(resA.qbQuestionTypeId, resB.qbQuestionTypeId, 'Khác của 2 bài là 2 id khác nhau')
  assert.equal(resA2.qbQuestionTypeId, 'tyA-khac', 'dạng sai ở Bài 1 fallback về Khác của Bài 1')

  // Cùng nội dung ở 2 bài: resolver cho 2 lesson khác nhau (dedup backend theo cặp sẽ không skip nhầm)
  const mdSame = `
[Câu 1] [LỚP: 11] [MÔN: Toán] [CHƯƠNG: Chương I] [BÀI HỌC: Bài 1]
Cùng một đề.
*A. 1
B. 2
[Câu 2] [LỚP: 11] [MÔN: Toán] [CHƯƠNG: Chương I] [BÀI HỌC: Bài 2]
Cùng một đề.
*A. 1
B. 2
`
  const parsed = parseExamMarkdown(mdSame)
  const summary = resolveBatchQuestionsTaxonomy(parsed.questions, taxD3)
  assert.equal(summary.errorCount, 0)
  assert.equal(parsed.questions[0].qbLessonId, 'lsA')
  assert.equal(parsed.questions[1].qbLessonId, 'lsB')
  assert.notEqual(parsed.questions[0].qbLessonId, parsed.questions[1].qbLessonId)

  console.log('  ✓ D3: Fallback "Khác" theo đúng bài; cùng nội dung khác bài vẫn phân biệt lesson')
}

// ---------- D4. Bài không có "Khác": thiếu/sai dạng bài thì BÁO LỖI rõ, không fallback lặng lẽ ----------
{
  const taxNoKhac = {
    classes: [{ id: 'cl', name: 'Toán 11', grade_block: '11-Toán' }],
    chapters: [{ id: 'ch', class_id: 'cl', title: 'Chương I' }],
    lessons: [{ id: 'ls', chapter_id: 'ch', title: 'Bài 1' }],
    questionTypes: [{ id: 't1', lesson_id: 'ls', name: 'Dạng A' }]
  }
  const r1 = resolveSingleQuestion({ classTag: '11-Toán', chapterTag: 'Chương I', lessonTag: 'Bài 1' }, taxNoKhac)
  assert.equal(r1.success, false)
  assert.ok(r1.error.includes('Khác'), 'thiếu dạng bài mà bài chưa có Khác thì báo rõ Khác')
  assert.equal(r1.qbQuestionTypeId, null)
  const r2 = resolveSingleQuestion({ classTag: '11-Toán', chapterTag: 'Chương I', lessonTag: 'Bài 1', questionTypeTag: 'Dạng lạ' }, taxNoKhac)
  assert.equal(r2.success, false)
  assert.ok(r2.error.includes('Khác'), 'dạng sai mà bài chưa có Khác thì báo rõ Khác')

  console.log('  ✓ D4: Bài chưa có "Khác" thì thiếu/sai dạng bài báo lỗi rõ ràng')
}

// ---------- D5. Missing / ambiguous metadata + normalize môn ----------
{
  const taxBase = {
    classes: [{ id: 'cl', name: 'Toán 11', grade_block: '11-Toán' }],
    chapters: [{ id: 'ch', class_id: 'cl', title: 'Chương I' }],
    lessons: [{ id: 'ls', chapter_id: 'ch', title: 'Bài 1' }],
    questionTypes: [
      { id: 't1', lesson_id: 'ls', name: 'Dạng A' },
      { id: 't2', lesson_id: 'ls', name: 'Khác' }
    ]
  }

  // D5a: thiếu [CHƯƠNG] báo rõ, không đoán
  const rMissingCh = resolveSingleQuestion({ classTag: '11-Toán', lessonTag: 'Bài 1' }, taxBase)
  assert.equal(rMissingCh.success, false)
  assert.ok(rMissingCh.error.includes('Thiếu metadata [CHƯƠNG]'), 'báo rõ thiếu chương')
  assert.equal(rMissingCh.qbLessonId, null)

  // D5b: classTag gộp "11 Toán" (không có [MÔN] riêng) vẫn resolve được môn
  const rCombined = resolveSingleQuestion({ classTag: '11 Toán', chapterTag: 'Chương I', lessonTag: 'Bài 1' }, taxBase)
  assert.equal(rCombined.success, true, 'classTag gộp lớp+môn phải resolve được')
  assert.equal(rCombined.qbClassId, 'cl')

  // D5c: subjectTag "Toán 11" (môn kèm số lớp) vẫn resolve được môn
  const rSubNum = resolveSingleQuestion({ classTag: '11', subjectTag: 'Toán 11', chapterTag: 'Chương I', lessonTag: 'Bài 1' }, taxBase)
  assert.equal(rSubNum.success, true, 'subjectTag kèm số lớp phải resolve được')
  assert.equal(rSubNum.qbClassId, 'cl')

  // D5d: vừa Toán vừa Hóa -> lỗi mơ hồ, không đoán một môn
  const rBoth = resolveSingleQuestion({ classTag: '11', subjectTag: 'Toán Hóa', chapterTag: 'Chương I', lessonTag: 'Bài 1' }, taxBase)
  assert.equal(rBoth.success, false)
  assert.ok(rBoth.error.includes('mơ hồ'), 'cả 2 môn thì báo mơ hồ')

  // D5e: dạng bài trùng sau chuẩn hóa -> lỗi mơ hồ, KHÔNG fallback lặng lẽ
  const taxAmbType = {
    ...taxBase,
    questionTypes: [
      { id: 't1', lesson_id: 'ls', name: 'Công thức cộng' },
      { id: 't2', lesson_id: 'ls', name: 'CÔNG THỨC CỘNG' },
      { id: 't3', lesson_id: 'ls', name: 'Khác' }
    ]
  }
  const rAmb = resolveSingleQuestion({ classTag: '11-Toán', chapterTag: 'Chương I', lessonTag: 'Bài 1', questionTypeTag: 'Công thức cộng' }, taxAmbType)
  assert.equal(rAmb.success, false)
  assert.ok(rAmb.error.includes('trùng') || rAmb.error.includes('mơ hồ'), 'dạng bài trùng phải báo trùng/mơ hồ')
  assert.equal(rAmb.isFallback, false, 'mơ hồ thì không fallback')
  assert.equal(rAmb.qbQuestionTypeId, null)
  const batchAmb = [{ classTag: '11-Toán', chapterTag: 'Chương I', lessonTag: 'Bài 1', questionTypeTag: 'cộng' }]
  const sumAmb = resolveBatchQuestionsTaxonomy(batchAmb, taxAmbType)
  assert.equal(sumAmb.errorCount, 1)
  assert.ok(batchAmb[0].questionTypeError.includes('trùng') || batchAmb[0].questionTypeError.includes('mơ hồ'))
  assert.equal(batchAmb[0].isFallback, false)

  // D5f: chương trùng theo số (2 chương cùng số La Mã) -> lỗi mơ hồ, không chọn bừa
  const taxAmbCh = {
    ...taxBase,
    chapters: [
      { id: 'c1', class_id: 'cl', title: 'Chương I. A' },
      { id: 'c2', class_id: 'cl', title: 'Chương I. B' }
    ]
  }
  const rAmbCh = resolveSingleQuestion({ classTag: '11-Toán', chapterTag: 'Chương I', lessonTag: 'Bài 1' }, taxAmbCh)
  assert.equal(rAmbCh.success, false)
  assert.ok(rAmbCh.error.includes('trùng') || rAmbCh.error.includes('mơ hồ'), 'chương trùng số phải báo trùng/mơ hồ')

  // D5g: bài trùng theo số trong cùng chương -> lỗi mơ hồ
  const taxAmbLs = {
    ...taxBase,
    lessons: [
      { id: 'l1', chapter_id: 'ch', title: 'Bài 1. A' },
      { id: 'l2', chapter_id: 'ch', title: 'Bài 1. B' }
    ]
  }
  const rAmbLs = resolveSingleQuestion({ classTag: '11-Toán', chapterTag: 'Chương I', lessonTag: 'Bài 1' }, taxAmbLs)
  assert.equal(rAmbLs.success, false)
  assert.ok(rAmbLs.error.includes('trùng') || rAmbLs.error.includes('mơ hồ'), 'bài trùng số phải báo trùng/mơ hồ')

  console.log('  ✓ D5: Thiếu metadata báo rõ từng tầng; mơ hồ báo trùng kèm lựa chọn; môn normalize theo từ')
}

// ---------- D6. Static contracts: backend "Khác" cho bài mới + dedup theo cặp + seed ensure ----------
{
  assert.ok(FN.includes('ensureOtherQuestionType'), 'backend có helper ensure Dạng bài Khác')
  assert.ok(FN.includes('Tạo bài học xong nhưng không tạo được Dạng bài "Khác"'), 'tạo bài mới rollback nếu thiếu Khác')
  assert.ok(FN.includes('otherType: otherRes.item'), 'tạo bài mới trả kèm otherType')
  assert.ok(FN.includes('dedupKeyForRow'), 'dedup import dùng key theo cặp')
  assert.ok(FN.includes('existingPairs'), 'dedup DB so theo cặp lesson/hash')
  assert.ok(FN.includes('uq_qb_constant_lesson_hash'), 'dedup khớp unique index lesson+hash')
  assert.ok(FN.includes('qb_lesson_id, grade_block, content_hash'), 'dedup query lấy đủ lesson/block/hash')
  assert.ok(SEED.includes('lessonsMissingOther'), 'seed có bước ensure Khác')
  assert.ok(SEED.includes('Khác còn thiếu'), 'seed dry-run báo advisory bài thiếu Khác')

  console.log('  ✓ D6: Backend tạo bài mới luôn có Khác; dedup theo cặp; seed ensure Khác idempotent')
}

console.log('\nTẤT CẢ ORACLE TEST PASS (A + B + C + D)')
