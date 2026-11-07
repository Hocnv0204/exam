// Offline PostgreSQL/WASM test using PGlite
// Verifies Phase 3A: Indexes, Trial Submission Cleanup, QB Counts RPC, and Weak Topics RPC
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { pathToFileURL } from 'node:url'
import { weakRate } from '../functions/adaptive/logic.ts'

const pglitePath = process.env.PGLITE_MODULE || '/tmp/claude-1000/-home-hocnguyen-Documents-Projects-Personal-Projects-exam/64012297-bb89-45c7-95c8-34a7a7f008e7/scratchpad/pglite/node_modules/@electric-sql/pglite/dist/index.js'
const { PGlite } = await import(pathToFileURL(pglitePath).href)
const db = new PGlite()

const id = (prefix, n) => `00000000-0000-4000-${prefix.padStart(4, '0')}-${String(n).padStart(12, '0')}`

console.log('--- 1. Thiết lập schema cơ sở trong PGlite ---')
await db.exec(`
  create role anon; create role authenticated; create role service_role bypassrls;
  create table public.classes(id uuid primary key, name text, grade_block text);
  create table public.profiles(id uuid primary key, full_name text, username text, role text);
  create table public.chapters(id uuid primary key, class_id uuid references public.classes, title text);
  create table public.lessons(id uuid primary key, chapter_id uuid references public.chapters, title text, is_trial boolean default false);
  create table public.homeworks(id uuid primary key, lesson_id uuid references public.lessons, title text, is_published boolean default true, deadline timestamptz);
  create table public.questions(id uuid primary key, homework_id uuid references public.homeworks, question_number int, prompt jsonb);
  create table public.submissions(
    id uuid primary key,
    student_id uuid references public.profiles,
    homework_id uuid references public.homeworks,
    status text,
    is_trial boolean default false,
    guest_name text,
    guest_phone text,
    total_score numeric
  );
  create table public.submission_answers(
    id uuid primary key,
    submission_id uuid references public.submissions,
    question_id uuid references public.questions,
    is_correct boolean
  );
  create table public.student_sessions(
    id uuid primary key default gen_random_uuid(),
    student_id uuid references public.profiles,
    class_id uuid references public.classes,
    session_date date,
    is_paid boolean default false
  );
  create table public.qb_classes(id uuid primary key, name text, grade_block text);
  create table public.qb_chapters(id uuid primary key, class_id uuid references public.qb_classes, title text);
  create table public.qb_lessons(id uuid primary key, chapter_id uuid references public.qb_chapters, title text);
  create table public.qb_question_types(id uuid primary key, lesson_id uuid references public.qb_lessons, name text);
  create type public.qb_difficulty as enum ('NHAN_BIET', 'THONG_HIEU', 'VAN_DUNG', 'VAN_DUNG_CAO');
  create table public.question_bank(
    id uuid primary key default gen_random_uuid(),
    subject text not null default 'TOAN',
    grade_level int not null default 12,
    grade_block text,
    class_id uuid references public.classes,
    chapter_id uuid references public.chapters,
    lesson_id uuid references public.lessons,
    qb_class_id uuid references public.qb_classes,
    qb_chapter_id uuid references public.qb_chapters,
    qb_lesson_id uuid references public.qb_lessons,
    qb_question_type_id uuid references public.qb_question_types,
    question_type text not null,
    difficulty public.qb_difficulty not null,
    prompt jsonb not null default '{"text": "Sample"}'::jsonb,
    tags text[] default '{}',
    created_at timestamptz not null default now()
  );

  grant usage on schema public to anon, authenticated, service_role;
  grant all on all tables in schema public to service_role;
`)

console.log('--- 2. Migration 1: Index và Dọn trạng thái học thử ---')
const mig1 = readFileSync(new URL('../migrations/20261107000000_perf_indexes_and_trial_clean.sql', import.meta.url), 'utf8')

// Chèn dữ liệu kiểm thử dọn dẹp trước khi chạy migration
const student1 = id('1111', 1)
const hw1 = id('5555', 1)
const preSub = id('6666', 1)
await db.exec(`
  insert into public.profiles(id, full_name, username, role) values ('${student1}', 'Học sinh 1', 'hs1', 'STUDENT');
  insert into public.classes(id, name, grade_block) values ('${id('2222', 1)}', 'Lớp 12A', '12-Toán');
  insert into public.chapters(id, class_id, title) values ('${id('3333', 1)}', '${id('2222', 1)}', 'Chương 1');
  insert into public.lessons(id, chapter_id, title) values ('${id('4444', 1)}', '${id('3333', 1)}', 'Bài 1');
  insert into public.homeworks(id, lesson_id, title) values ('${hw1}', '${id('4444', 1)}', 'Bài tập 1');
  insert into public.submissions(id, student_id, homework_id, status, is_trial, guest_name, guest_phone)
  values ('${preSub}', '${student1}', '${hw1}', 'SUBMITTED', true, 'Khách cũ', '0901234567');
`)

// Chạy migration 1
await db.exec(mig1)
// Idempotency: chạy lại không lỗi
await db.exec(mig1)

// Xác minh dọn dữ liệu một lần
const cleanedPre = (await db.query(`select is_trial, guest_name, guest_phone from public.submissions where id = $1`, [preSub])).rows[0]
assert.equal(cleanedPre.is_trial, false, 'Dọn một lần: is_trial phải đổi thành false')
assert.equal(cleanedPre.guest_name, null, 'Dọn một lần: guest_name phải thành null')
assert.equal(cleanedPre.guest_phone, null, 'Dọn một lần: guest_phone phải thành null')
console.log('  ✓ One-time cleanup: submissions có student_id đã được dọn sạch is_trial và guest info')

// Xác minh trigger guard chặn phát sinh dữ liệu mới
const subNewFormal = id('6666', 2)
await db.query(`
  insert into public.submissions(id, student_id, homework_id, status, is_trial, guest_name, guest_phone)
  values ($1, $2, $3, 'SUBMITTED', true, 'Khách mới', '0912345678')
`, [subNewFormal, student1, hw1])
const formalRow = (await db.query(`select is_trial, guest_name, guest_phone from public.submissions where id = $1`, [subNewFormal])).rows[0]
assert.equal(formalRow.is_trial, false, 'Trigger guard: INSERT formal student với is_trial=true phải tự reset về false')
assert.equal(formalRow.guest_name, null, 'Trigger guard: guest_name phải tự reset về null')
assert.equal(formalRow.guest_phone, null, 'Trigger guard: guest_phone phải tự reset về null')

// UPDATE cố tình đặt is_trial=true cho formal student
await db.query(`update public.submissions set is_trial = true, guest_name = 'hack' where id = $1`, [subNewFormal])
const updatedFormal = (await db.query(`select is_trial, guest_name from public.submissions where id = $1`, [subNewFormal])).rows[0]
assert.equal(updatedFormal.is_trial, false, 'Trigger guard: UPDATE formal student với is_trial=true bị chặn')
assert.equal(updatedFormal.guest_name, null)

// INSERT guest thật (student_id = null)
const subGuest = id('6666', 3)
await db.query(`
  insert into public.submissions(id, student_id, homework_id, status, is_trial, guest_name, guest_phone)
  values ($1, null, $2, 'SUBMITTED', true, 'Học sinh trải nghiệm', '0999999999')
`, [subGuest, hw1])
const guestRow = (await db.query(`select is_trial, guest_name from public.submissions where id = $1`, [subGuest])).rows[0]
assert.equal(guestRow.is_trial, true, 'Trigger guard: guest thật (student_id null) được giữ is_trial=true')
assert.equal(guestRow.guest_name, 'Học sinh trải nghiệm')
console.log('  ✓ Trigger guard: tự động chuẩn hóa formal vs guest submission chính xác')

// Kiểm tra index tồn tại
const idxRows = (await db.query(`
  select indexname from pg_indexes where tablename in ('student_sessions', 'homeworks')
`)).rows.map(r => r.indexname)
assert.ok(idxRows.includes('idx_student_sessions_class_date'), 'index idx_student_sessions_class_date phải tồn tại')
assert.ok(idxRows.includes('idx_homeworks_published_deadline'), 'index idx_homeworks_published_deadline phải tồn tại')
console.log('  ✓ Performance indexes: idx_student_sessions_class_date và idx_homeworks_published_deadline tồn tại')

console.log('--- 3. Migration 2: RPC fn_qb_counts ---')
const mig2 = readFileSync(new URL('../migrations/20261107000001_rpc_qb_counts.sql', import.meta.url), 'utf8')
await db.exec(mig2)
await db.exec(mig2) // Idempotency check

// Lỗi production: dù extraDifficulty rỗng, PostgreSQL vẫn phân tích enum = text.
await assert.rejects(() => db.query(`select public.fn_qb_counts('{"mode":"stats"}'::jsonb)`),
  err => err.message.includes('operator does not exist: qb_difficulty = text'))
const enumFix = readFileSync(new URL('../migrations/20261107000003_fix_qb_counts_difficulty_enum.sql', import.meta.url), 'utf8')
await db.exec(enumFix)
await db.exec(enumFix) // Idempotency check
assert.equal((await db.query(`select public.fn_qb_counts('{"mode":"stats"}'::jsonb) as res`)).rows[0].res.total, 0)

// Quyền hạn: anon & authenticated không thể gọi RPC
for (const role of ['anon', 'authenticated']) {
  await db.exec(`set role ${role}`)
  await assert.rejects(
    () => db.query(`select public.fn_qb_counts('{}'::jsonb)`),
    err => err.code === '42501',
    `Role ${role} phải bị từ chối EXECUTE trên fn_qb_counts`
  )
  await db.exec('reset role')
}
console.log('  ✓ Quyền hạn: anon & authenticated bị từ chối EXECUTE trên fn_qb_counts')

// Tạo fixture ngân hàng câu hỏi phong phú
const classA = id('2222', 1) // 12-Toán
const classB = id('2222', 2) // 11-Hóa
await db.query(`insert into public.classes(id, name, grade_block) values ($1, 'Hóa 11', '11-Hóa')`, [classB])

const chA1 = id('3333', 1)
const chA2 = id('3333', 2)
const chB1 = id('3333', 3)
await db.query(`insert into public.chapters(id, class_id, title) values ($1, $2, 'Chương 2 Toán'), ($3, $4, 'Chương 1 Hóa')`, [chA2, classA, chB1, classB])

const lesA1 = id('4444', 1)
const lesA2 = id('4444', 2)
const lesB1 = id('4444', 3)
await db.query(`insert into public.lessons(id, chapter_id, title) values ($1, $2, 'Bài 2 Toán'), ($3, $4, 'Bài 1 Hóa')`, [lesA2, chA1, lesB1, chB1])

// Constant hierarchy
const qbClassA = id('7777', 1)
const qbChA1 = id('8888', 1)
const qbLesA1 = id('9999', 1)
const qbLesA2 = id('9999', 2)
const qbType1 = id('aaaa', 1)
const qbType2 = id('aaaa', 2)
await db.exec(`
  insert into public.qb_classes(id, name, grade_block) values ('${qbClassA}', 'Lớp Constant 12', '12-Toán');
  insert into public.qb_chapters(id, class_id, title) values ('${qbChA1}', '${qbClassA}', 'Chương Constant 1');
  insert into public.qb_lessons(id, chapter_id, title) values ('${qbLesA1}', '${qbChA1}', 'Bài Constant 1'), ('${qbLesA2}', '${qbChA1}', 'Bài Constant 2 (untyped)');
  insert into public.qb_question_types(id, lesson_id, name) values ('${qbType1}', '${qbLesA1}', 'Dạng 1'), ('${qbType2}', '${qbLesA1}', 'Dạng 2');
`)

// Tạo 20 câu hỏi đa dạng
const fixtureQuestions = [
  // 1-4: Dynamic questions in Class A, Ch A1, Les A1
  { subject: 'TOAN', grade_level: 12, grade_block: '12-Toán', class_id: classA, chapter_id: chA1, lesson_id: lesA1, question_type: 'MULTIPLE_CHOICE', difficulty: 'NHAN_BIET', prompt: { text: 'Tìm đạo hàm hàm số y=x^2' }, tags: ['daoham'] },
  { subject: 'TOAN', grade_level: 12, grade_block: '12-Toán', class_id: classA, chapter_id: chA1, lesson_id: lesA1, question_type: 'MULTIPLE_CHOICE', difficulty: 'THONG_HIEU', prompt: { text: 'Tính tích phân cơ bản' }, tags: ['tichphan'] },
  { subject: 'TOAN', grade_level: 12, grade_block: '12-Toán', class_id: classA, chapter_id: chA1, lesson_id: lesA1, question_type: 'TRUE_FALSE', difficulty: 'VAN_DUNG', prompt: { text: 'Xét tính đúng sai mệnh đề đạo hàm' }, tags: ['daoham', 'menhde'] },
  { subject: 'TOAN', grade_level: 12, grade_block: '12-Toán', class_id: classA, chapter_id: chA1, lesson_id: lesA1, question_type: 'SHORT_ANSWER', difficulty: 'VAN_DUNG_CAO', prompt: { text: 'Giá trị lớn nhất của hàm số' }, tags: ['maxmin'] },

  // 5-7: Dynamic questions in Class A, Ch A2 (no lesson_id)
  { subject: 'TOAN', grade_level: 12, grade_block: '12-Toán', class_id: classA, chapter_id: chA2, lesson_id: null, question_type: 'MULTIPLE_CHOICE', difficulty: 'NHAN_BIET', prompt: { text: 'Khái niệm khối đa diện' }, tags: ['hinhhoc'] },
  { subject: 'TOAN', grade_level: 12, grade_block: '12-Toán', class_id: classA, chapter_id: chA2, lesson_id: null, question_type: 'TRUE_FALSE', difficulty: 'THONG_HIEU', prompt: { text: 'Thể tích lăng trụ' }, tags: ['thetich'] },
  { subject: 'TOAN', grade_level: 12, grade_block: '12-Toán', class_id: classA, chapter_id: chA2, lesson_id: null, question_type: 'SHORT_ANSWER', difficulty: 'THONG_HIEU', prompt: { text: 'Số mặt phẳng đối xứng' }, tags: ['hinhhoc'] },

  // 8-10: Constant questions in qbClassA, qbChA1 with question types
  { subject: 'TOAN', grade_level: 12, grade_block: '12-Toán', qb_class_id: qbClassA, qb_chapter_id: qbChA1, qb_lesson_id: qbLesA1, qb_question_type_id: qbType1, question_type: 'MULTIPLE_CHOICE', difficulty: 'NHAN_BIET', prompt: { text: 'Dạng 1 bài tập đơn giản' }, tags: ['constant'] },
  { subject: 'TOAN', grade_level: 12, grade_block: '12-Toán', qb_class_id: qbClassA, qb_chapter_id: qbChA1, qb_lesson_id: qbLesA1, qb_question_type_id: qbType2, question_type: 'MULTIPLE_CHOICE', difficulty: 'VAN_DUNG', prompt: { text: 'Dạng 2 bài tập nâng cao' }, tags: ['constant'] },
  { subject: 'TOAN', grade_level: 12, grade_block: '12-Toán', qb_class_id: qbClassA, qb_chapter_id: qbChA1, qb_lesson_id: qbLesA2, qb_question_type_id: null, question_type: 'TRUE_FALSE', difficulty: 'THONG_HIEU', prompt: { text: 'Bài không có dạng bài' }, tags: ['untyped'] },

  // 11-13: Dynamic questions in Class B (Hóa 11)
  { subject: 'HOA_HOC', grade_level: 11, grade_block: '11-Hóa', class_id: classB, chapter_id: chB1, lesson_id: lesB1, question_type: 'MULTIPLE_CHOICE', difficulty: 'NHAN_BIET', prompt: { text: 'Công thức este no đơn chức' }, tags: ['este'] },
  { subject: 'HOA_HOC', grade_level: 11, grade_block: '11-Hóa', class_id: classB, chapter_id: chB1, lesson_id: lesB1, question_type: 'TRUE_FALSE', difficulty: 'THONG_HIEU', prompt: { text: 'Tính chất hóa học của ancol' }, tags: ['ancol'] },
  { subject: 'HOA_HOC', grade_level: 11, grade_block: '11-Hóa', class_id: classB, chapter_id: chB1, lesson_id: lesB1, question_type: 'SHORT_ANSWER', difficulty: 'VAN_DUNG', prompt: { text: 'Khối lượng kết tủa sau phản ứng' }, tags: ['toanhoa'] },

  // 14-15: Unassigned questions (no class/chapter)
  { subject: 'TOAN', grade_level: 12, grade_block: null, class_id: null, chapter_id: null, lesson_id: null, question_type: 'MULTIPLE_CHOICE', difficulty: 'NHAN_BIET', prompt: { text: 'Câu hỏi chưa phân lớp 1' }, tags: ['unassigned'] },
  { subject: 'TOAN', grade_level: 12, grade_block: null, class_id: null, chapter_id: null, lesson_id: null, question_type: 'SHORT_ANSWER', difficulty: 'THONG_HIEU', prompt: { text: 'Câu hỏi chưa phân lớp 2' }, tags: ['unassigned'] }
]

for (const q of fixtureQuestions) {
  await db.query(`
    insert into public.question_bank(
      subject, grade_level, grade_block, class_id, chapter_id, lesson_id,
      qb_class_id, qb_chapter_id, qb_lesson_id, qb_question_type_id,
      question_type, difficulty, prompt, tags
    ) values ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14)
  `, [
    q.subject, q.grade_level, q.grade_block, q.class_id || null, q.chapter_id || null, q.lesson_id || null,
    q.qb_class_id || null, q.qb_chapter_id || null, q.qb_lesson_id || null, q.qb_question_type_id || null,
    q.question_type, q.difficulty, JSON.stringify(q.prompt), q.tags
  ])
}
console.log(`  ✓ Đã nạp ${fixtureQuestions.length} câu hỏi fixture vào question_bank`)

// Hàm Oracle JS tính toán kết quả mong đợi trên mảng fixture
function computeExpectedCounts(matchingQuestions) {
  const all = matchingQuestions
  const mc = all.filter(q => q.question_type === 'MULTIPLE_CHOICE').length
  const tf = all.filter(q => q.question_type === 'TRUE_FALSE').length
  const sa = all.filter(q => q.question_type === 'SHORT_ANSWER').length

  const byChapter = {}
  const byLesson = {}
  all.forEach(q => {
    const chId = q.qb_chapter_id || q.chapter_id
    const lsId = q.qb_lesson_id || q.lesson_id
    if (chId) {
      if (!byChapter[chId]) byChapter[chId] = { total: 0, mc: 0, tf: 0, sa: 0 }
      byChapter[chId].total++
      if (q.question_type === 'MULTIPLE_CHOICE') byChapter[chId].mc++
      if (q.question_type === 'TRUE_FALSE') byChapter[chId].tf++
      if (q.question_type === 'SHORT_ANSWER') byChapter[chId].sa++
    }
    if (lsId) {
      if (!byLesson[lsId]) byLesson[lsId] = { total: 0, mc: 0, tf: 0, sa: 0 }
      byLesson[lsId].total++
      if (q.question_type === 'MULTIPLE_CHOICE') byLesson[lsId].mc++
      if (q.question_type === 'TRUE_FALSE') byLesson[lsId].tf++
      if (q.question_type === 'SHORT_ANSWER') byLesson[lsId].sa++
    }
  })

  const diffCounts = {
    NHAN_BIET: all.filter(q => q.difficulty === 'NHAN_BIET').length,
    THONG_HIEU: all.filter(q => q.difficulty === 'THONG_HIEU').length,
    VAN_DUNG: all.filter(q => q.difficulty === 'VAN_DUNG').length,
    VAN_DUNG_CAO: all.filter(q => q.difficulty === 'VAN_DUNG_CAO').length
  }

  const byTypeAndDifficulty = {
    MULTIPLE_CHOICE: {
      NHAN_BIET: all.filter(q => q.question_type === 'MULTIPLE_CHOICE' && q.difficulty === 'NHAN_BIET').length,
      THONG_HIEU: all.filter(q => q.question_type === 'MULTIPLE_CHOICE' && q.difficulty === 'THONG_HIEU').length,
      VAN_DUNG: all.filter(q => q.question_type === 'MULTIPLE_CHOICE' && q.difficulty === 'VAN_DUNG').length,
      VAN_DUNG_CAO: all.filter(q => q.question_type === 'MULTIPLE_CHOICE' && q.difficulty === 'VAN_DUNG_CAO').length
    },
    TRUE_FALSE: {
      NHAN_BIET: all.filter(q => q.question_type === 'TRUE_FALSE' && q.difficulty === 'NHAN_BIET').length,
      THONG_HIEU: all.filter(q => q.question_type === 'TRUE_FALSE' && q.difficulty === 'THONG_HIEU').length,
      VAN_DUNG: all.filter(q => q.question_type === 'TRUE_FALSE' && q.difficulty === 'VAN_DUNG').length,
      VAN_DUNG_CAO: all.filter(q => q.question_type === 'TRUE_FALSE' && q.difficulty === 'VAN_DUNG_CAO').length
    },
    SHORT_ANSWER: {
      NHAN_BIET: all.filter(q => q.question_type === 'SHORT_ANSWER' && q.difficulty === 'NHAN_BIET').length,
      THONG_HIEU: all.filter(q => q.question_type === 'SHORT_ANSWER' && q.difficulty === 'THONG_HIEU').length,
      VAN_DUNG: all.filter(q => q.question_type === 'SHORT_ANSWER' && q.difficulty === 'VAN_DUNG').length,
      VAN_DUNG_CAO: all.filter(q => q.question_type === 'SHORT_ANSWER' && q.difficulty === 'VAN_DUNG_CAO').length
    }
  }

  return {
    total: all.length,
    mc,
    tf,
    sa,
    byDifficulty: diffCounts,
    diffCounts,
    byTypeAndDifficulty,
    byChapter,
    byLesson
  }
}

// Chạy và so sánh các tổ hợp bộ lọc
async function verifyRpcVsOracle(testName, filters, expectedQuestions) {
  await db.exec('set role service_role')
  const res = (await db.query(`select public.fn_qb_counts($1::jsonb) as res`, [JSON.stringify(filters)])).rows[0].res
  await db.exec('reset role')

  const expected = computeExpectedCounts(expectedQuestions)
  assert.equal(res.total, expected.total, `${testName}: total mismatch (${res.total} vs ${expected.total})`)
  assert.equal(res.mc, expected.mc, `${testName}: mc mismatch`)
  assert.equal(res.tf, expected.tf, `${testName}: tf mismatch`)
  assert.equal(res.sa, expected.sa, `${testName}: sa mismatch`)
  assert.deepEqual(res.byDifficulty, expected.byDifficulty, `${testName}: byDifficulty mismatch`)
  assert.deepEqual(res.diffCounts, expected.diffCounts, `${testName}: diffCounts mismatch`)
  assert.deepEqual(res.byTypeAndDifficulty, expected.byTypeAndDifficulty, `${testName}: byTypeAndDifficulty mismatch`)
  assert.deepEqual(res.byChapter, expected.byChapter, `${testName}: byChapter mismatch`)
  assert.deepEqual(res.byLesson, expected.byLesson, `${testName}: byLesson mismatch`)
  console.log(`  ✓ ${testName} (total=${res.total}, mc=${res.mc}, tf=${res.tf}, sa=${res.sa})`)
}

// Test case 1: Pool LESSON scope (lesA1)
await verifyRpcVsOracle(
  'Pool: LESSON scope lesA1 (dynamic)',
  { mode: 'pool', scopeType: 'LESSON', lessonIds: [lesA1] },
  fixtureQuestions.filter(q => q.lesson_id === lesA1 || q.qb_lesson_id === lesA1)
)

// Test case 2: Pool CHAPTER scope (chA2)
await verifyRpcVsOracle(
  'Pool: CHAPTER scope chA2 (dynamic)',
  { mode: 'pool', scopeType: 'CHAPTER', chapterIds: [chA2] },
  fixtureQuestions.filter(q => q.chapter_id === chA2 || q.qb_chapter_id === chA2)
)

// Test case 3: Pool CLASS scope (classB - 11 Hóa)
await verifyRpcVsOracle(
  'Pool: CLASS scope classB (Hóa 11)',
  { mode: 'pool', scopeType: 'CLASS', classIds: [classB] },
  fixtureQuestions.filter(q => q.class_id === classB || q.qb_class_id === classB)
)

// Test case 4: Pool BLOCK scope 12-Toán (cả dynamic + constant)
await verifyRpcVsOracle(
  'Pool: BLOCK scope 12-Toán (constantOnly=false)',
  { mode: 'pool', scopeType: 'BLOCK', gradeBlock: '12-Toán', constantOnly: false },
  fixtureQuestions.filter(q => q.grade_block === '12-Toán' || q.class_id === classA || q.qb_class_id === qbClassA)
)

// Test case 5: Pool BLOCK scope 12-Toán (constantOnly=true)
await verifyRpcVsOracle(
  'Pool: BLOCK scope 12-Toán (constantOnly=true)',
  { mode: 'pool', scopeType: 'BLOCK', gradeBlock: '12-Toán', constantOnly: true },
  fixtureQuestions.filter(q => q.qb_class_id === qbClassA)
)

// Test case 6: Pool with typeIds (qbType1 + untyped qbLesA2)
await verifyRpcVsOracle(
  'Pool: typeIds [qbType1] + untypedLessonIds [qbLesA2]',
  { mode: 'pool', typeIds: [qbType1], untypedLessonIds: [qbLesA2] },
  fixtureQuestions.filter(q => q.qb_question_type_id === qbType1 || q.qb_lesson_id === qbLesA2)
)

// Test case 7: Pool with tags (['daoham'])
await verifyRpcVsOracle(
  'Pool: tags filter [daoham]',
  { mode: 'pool', tags: ['daoham'] },
  fixtureQuestions.filter(q => q.tags.includes('daoham'))
)

// Test case 8: Stats mode by subject & grade
await verifyRpcVsOracle(
  'Stats: subject HOA_HOC, grade_level 11',
  { mode: 'stats', subject: 'HOA_HOC', gradeLevel: 11 },
  fixtureQuestions.filter(q => q.subject === 'HOA_HOC' && q.grade_level === 11)
)

// Test case 9: Stats mode unassigned 'no_class'
await verifyRpcVsOracle(
  'Stats: unassigned no_class',
  { mode: 'stats', unassigned: 'no_class' },
  fixtureQuestions.filter(q => !q.class_id && !q.qb_class_id)
)

// Test case 10: Stats mode text search 'đạo hàm'
await verifyRpcVsOracle(
  'Stats: search "đạo hàm"',
  { mode: 'stats', search: 'đạo hàm' },
  fixtureQuestions.filter(q => q.prompt.text.toLowerCase().includes('đạo hàm'))
)

// Optional enum-vs-text filter must work when present and when unrecognized.
await verifyRpcVsOracle(
  'Pool: extraDifficulty VAN_DUNG',
  { mode: 'pool', extraDifficulty: 'VAN_DUNG' },
  fixtureQuestions.filter(q => q.difficulty === 'VAN_DUNG')
)
await verifyRpcVsOracle(
  'Stats: extraDifficulty lạ trả rỗng',
  { mode: 'stats', extraDifficulty: 'KHONG_HOP_LE' },
  []
)

console.log('--- 4. Migration 3: RPC fn_weak_topics (adaptive) ---')
const mig3 = readFileSync(new URL('../migrations/20261107000002_rpc_weak_topics.sql', import.meta.url), 'utf8')
await db.exec(mig3)
await db.exec(mig3) // Idempotency check

// Quyền hạn: anon & authenticated không thể gọi RPC
for (const role of ['anon', 'authenticated']) {
  await db.exec(`set role ${role}`)
  await assert.rejects(
    () => db.query(`select public.fn_weak_topics(p_student_id := $1)`, [student1]),
    err => err.code === '42501',
    `Role ${role} phải bị từ chối EXECUTE trên fn_weak_topics`
  )
  await db.exec('reset role')
}
console.log('  ✓ Quyền hạn: anon & authenticated bị từ chối EXECUTE trên fn_weak_topics')

// Tạo fixture cho adaptive
const student2 = id('1111', 2)
const student3 = id('1111', 3)
await db.query(`
  insert into public.profiles(id, full_name, username, role)
  values ('${student2}', 'Trần Thị B', 'student2', 'STUDENT'),
         ('${student3}', 'Lê Văn C', 'student3', 'STUDENT')
`)

// Lesson 1 (normal) vs Lesson 2 (trial lesson)
await db.query(`update public.lessons set is_trial = true where id = '${lesA2}'`)
const hwTrial = id('5555', 2)
await db.query(`insert into public.homeworks(id, lesson_id, title) values ('${hwTrial}', '${lesA2}', 'Bài tập học thử')`)

// Questions in hw1 (normal)
const q1 = id('bbbb', 1)
const q2 = id('bbbb', 2)
const q3 = id('bbbb', 3)
const q4 = id('bbbb', 4)
await db.query(`
  insert into public.questions(id, homework_id, question_number)
  values ('${q1}', '${hw1}', 1), ('${q2}', '${hw1}', 2), ('${q3}', '${hw1}', 3), ('${q4}', '${hw1}', 4)
`)
// Question in hwTrial (trial lesson)
const qTrial = id('bbbb', 5)
await db.query(`insert into public.questions(id, homework_id, question_number) values ('${qTrial}', '${hwTrial}', 1)`)

// Submissions:
// subValid1: student1, hw1, SUBMITTED, is_trial=false -> 4 answers (1 đúng, 3 sai)
const subValid1 = id('6666', 10)
// subValid2: student2, hw1, SUBMITTED, is_trial=false -> 4 answers (3 đúng, 1 sai)
const subValid2 = id('6666', 11)
// subInProgress: student1, hw1, IN_PROGRESS -> VẪN tính (giữ đúng logic JS cũ, không lọc status)
const subInProgress = id('6666', 12)
// subTrial: khách (student_id null) -> không thuộc học sinh nào nên không được tính
const subTrial = id('6666', 13)
// subTrialLesson: student1, hwTrial (bài học thử, cùng chương chA1) -> VẪN tính như logic cũ
const subTrialLesson = id('6666', 14)

await db.query(`
  insert into public.submissions(id, student_id, homework_id, status, is_trial) values
    ('${subValid1}', '${student1}', '${hw1}', 'SUBMITTED', false),
    ('${subValid2}', '${student2}', '${hw1}', 'SUBMITTED', false),
    ('${subInProgress}', '${student1}', '${hw1}', 'IN_PROGRESS', false),
    ('${subTrial}', null, '${hw1}', 'SUBMITTED', true),
    ('${subTrialLesson}', '${student1}', '${hwTrial}', 'SUBMITTED', false)
`)

// Submission answers
// student1: 4 câu hw1: q1(Đ), q2(S), q3(S), q4(S) -> answered=4, wrong=3 -> wrongRate=75.0%
await db.query(`
  insert into public.submission_answers(id, submission_id, question_id, is_correct) values
    ('${id('cccc', 1)}', '${subValid1}', '${q1}', true),
    ('${id('cccc', 2)}', '${subValid1}', '${q2}', false),
    ('${id('cccc', 3)}', '${subValid1}', '${q3}', false),
    ('${id('cccc', 4)}', '${subValid1}', '${q4}', false)
`)

// student2: 4 câu hw1: q1(Đ), q2(Đ), q3(Đ), q4(S) -> answered=4, wrong=1 -> wrongRate=25.0%
await db.query(`
  insert into public.submission_answers(id, submission_id, question_id, is_correct) values
    ('${id('cccc', 5)}', '${subValid2}', '${q1}', true),
    ('${id('cccc', 6)}', '${subValid2}', '${q2}', true),
    ('${id('cccc', 7)}', '${subValid2}', '${q3}', true),
    ('${id('cccc', 8)}', '${subValid2}', '${q4}', false)
`)

// Các câu trả lời của bài không hợp lệ (IN_PROGRESS, trial, trial lesson)
await db.query(`
  insert into public.submission_answers(id, submission_id, question_id, is_correct) values
    ('${id('cccc', 9)}', '${subInProgress}', '${q1}', false),
    ('${id('cccc', 10)}', '${subTrial}', '${q1}', false),
    ('${id('cccc', 11)}', '${subTrialLesson}', '${qTrial}', false)
`)

await db.exec('set role service_role')

// Kiểm thử Single Student Mode
const studentRes = (await db.query(`
  select public.fn_weak_topics(p_student_id := $1, p_class_id := $2, p_min_answered := 3, p_limit := 10) as res
`, [student1, classA])).rows[0].res

assert.equal(studentRes.studentId, student1)
// Logic cũ (adaptive/index.ts HEAD): mọi submission của HS trong lớp, không lọc status/is_trial.
// subValid1 (1 đúng, 3 sai) + subInProgress (q1 sai) + subTrialLesson (qTrial sai) = 6 làm, 5 sai.
assert.equal(studentRes.totalAnswered, 6, 'totalAnswered của student1 phải đúng 6 như logic cũ')
assert.equal(studentRes.totalWrong, 5, 'totalWrong của student1 phải đúng 5 như logic cũ')
assert.equal(studentRes.topics.length, 1, 'Số chương yếu của student1')
assert.equal(studentRes.topics[0].chapterId, chA1)
assert.equal(studentRes.topics[0].answered, 6)
assert.equal(studentRes.topics[0].wrong, 5)
assert.equal(studentRes.topics[0].wrongRate, weakRate(6, 5)) // 83.3
console.log('  ✓ Single Student Mode: khớp logic cũ (answered=6, wrong=5, wrongRate=83.3%), không lọc status/trial như HEAD')

// Kiểm thử Class Overview Mode
const classRes = (await db.query(`
  select public.fn_weak_topics(p_class_id := $1, p_student_id := null, p_min_answered := 3, p_limit := 10) as res
`, [classA])).rows[0].res

assert.equal(classRes.classId, classA)
// Tổng hợp cả lớp chA1 (logic cũ: mọi submission có hồ sơ HS của bài trong lớp):
// student1 (6 làm, 5 sai) + student2 (4 làm, 1 sai) = 10 làm, 6 sai -> 60.0%; khách (student_id null) bị loại.
assert.equal(classRes.chapters.length, 1)
assert.equal(classRes.chapters[0].chapterId, chA1)
assert.equal(classRes.chapters[0].answered, 10)
assert.equal(classRes.chapters[0].wrong, 6)
assert.equal(classRes.chapters[0].wrongRate, weakRate(10, 6)) // 60.0

// Danh sách học sinh: student1 (75.0%) đứng trước student2 (25.0%)
assert.equal(classRes.students.length, 2)
assert.equal(classRes.students[0].studentId, student1)
assert.equal(classRes.students[0].wrongRate, weakRate(6, 5))
assert.equal(classRes.students[0].top[0].chapterId, chA1)
assert.equal(classRes.students[1].studentId, student2)
assert.equal(classRes.students[1].wrongRate, 25.0)
assert.equal(classRes.students[1].top[0].chapterId, chA1)
console.log('  ✓ Class Overview Mode: gom cả lớp (chA1 60%), xếp hạng học sinh (student1 83.3% > student2 25%) khớp logic cũ')

await db.exec('reset role')

console.log('\n========================================')
console.log('TẤT CẢ KIỂM THỬ PGLITE PHASE 3A ĐÃ ĐẠT! ✅')
console.log('========================================')
