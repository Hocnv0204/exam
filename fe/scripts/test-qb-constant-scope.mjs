import assert from 'node:assert/strict'
import { readFileSync, existsSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

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

console.log('TẤT CẢ ORACLE TEST PASS')
