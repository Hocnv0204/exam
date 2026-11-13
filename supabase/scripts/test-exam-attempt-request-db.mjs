// PostgreSQL/WASM (PGlite) test cho migration 20261113000000_exam_attempt_requests.sql.
// Không mạng, không cloud, không dữ liệu thật. Cài @electric-sql/pglite NGOÀI repo rồi đặt
// PGLITE_MODULE=<…>/@electric-sql/pglite/dist/index.js.
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { pathToFileURL } from 'node:url'

if (!process.env.PGLITE_MODULE) throw new Error('Set PGLITE_MODULE to an external @electric-sql/pglite dist/index.js path.')
const { PGlite } = await import(pathToFileURL(process.env.PGLITE_MODULE).href)
const db = new PGlite()
const id = n => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`
const [student, other, outsider, admin, classId, chapter, lesson, hw, hwUnlimited, hwPractice, hwTargeted] = Array.from({ length: 11 }, (_, n) => id(n + 1))

await db.exec(`
  create role anon; create role authenticated; create role service_role bypassrls;
  create table public.profiles(id uuid primary key, role text);
  create table public.classes(id uuid primary key);
  create table public.chapters(id uuid primary key, class_id uuid references public.classes);
  create table public.lessons(id uuid primary key, chapter_id uuid references public.chapters);
  create table public.homeworks(id uuid primary key, lesson_id uuid references public.lessons, type text, is_published boolean,
    max_attempts int, duration_minutes int, title text);
  create table public.student_classes(student_id uuid, class_id uuid, status text);
  create table public.homework_targets(homework_id uuid, student_id uuid);
  create table public.submissions(id uuid primary key default gen_random_uuid(), homework_id uuid, student_id uuid, status text);
  create table public.exam_sessions(id uuid primary key default gen_random_uuid(), homework_id uuid, student_id uuid, session_token text,
    status text, attempt_no int, created_at timestamptz default clock_timestamp(), last_heartbeat_at timestamptz, draft_answers jsonb default '[]');
  create table public.exam_logs(id uuid primary key default gen_random_uuid(), session_id uuid, counted boolean);
  grant usage on schema public to anon, authenticated, service_role;
  grant all on all tables in schema public to service_role;
  insert into public.profiles values ('${student}','STUDENT'),('${other}','STUDENT'),('${outsider}','STUDENT'),('${admin}','ADMIN');
  insert into public.classes values ('${classId}');
  insert into public.chapters values ('${chapter}','${classId}');
  insert into public.lessons values ('${lesson}','${chapter}');
  insert into public.homeworks values
    ('${hw}','${lesson}','EXAM',true,1,45,'Đề thi'),
    ('${hwUnlimited}','${lesson}','EXAM',true,null,45,'Không giới hạn'),
    ('${hwPractice}','${lesson}','PRACTICE',true,1,45,'Luyện tập'),
    ('${hwTargeted}','${lesson}','EXAM',true,1,45,'Giao riêng');
  insert into public.student_classes values ('${student}','${classId}','ACTIVE'),('${other}','${classId}','ACTIVE');
  insert into public.homework_targets values ('${hwTargeted}','${other}');
`)
await db.exec(readFileSync(new URL('../migrations/20261113000000_exam_attempt_requests.sql', import.meta.url), 'utf8'))
await db.exec('set role service_role')

const errCode = async (fn) => { try { await fn(); return 'OK' } catch (e) { return (String(e.message).match(/[A-Z_]{5,}/) || [e.message])[0] } }
const q = (sql, params) => db.query(sql, params)
const init = (h, s, token) => q('select public.init_exam_attempt($1,$2,$3) as r', [h, s, token]).then(x => x.rows[0].r)
const request = (h, s) => q('select public.request_exam_attempt($1,$2) as r', [h, s]).then(x => x.rows[0].r)
const decide = (rid, ok, by = 555, name = 'Cô Lan') => q('select public.decide_exam_attempt_request($1,$2,$3,$4) as r', [rid, ok, by, name]).then(x => x.rows[0].r)
const submit = async (h, s) => {
  await q(`update public.exam_sessions set status='SUBMITTED' where homework_id=$1 and student_id=$2 and status='ACTIVE'`, [h, s])
  await q(`insert into public.submissions(homework_id,student_id,status) values ($1,$2,'SUBMITTED')`, [h, s])
}
const allowance = (h, s) => q('select public.exam_attempt_allowance($1,$2) as a', [h, s]).then(x => x.rows[0].a)

// 1. Chưa thi: không được xin thêm lượt
assert.equal(await errCode(() => request(hw, student)), 'NOT_AT_LIMIT')
// 2. Thi lần 1, nộp → hết lượt
const s1 = await init(hw, student, 'tok-1')
assert.ok(s1.sessionId)
// Đang có phiên ACTIVE → không cần xin
assert.equal(await errCode(() => request(hw, student)), 'NOT_AT_LIMIT')
await submit(hw, student)
assert.equal(await errCode(() => init(hw, student, 'tok-2')), 'ATTEMPT_LIMIT')
// 3. Quyền & loại bài
assert.equal(await errCode(() => request(hw, admin)), 'FORBIDDEN')
assert.equal(await errCode(() => request(hw, outsider)), 'FORBIDDEN')
assert.equal(await errCode(() => request(hwPractice, student)), 'INVALID_EXAM')
assert.equal(await errCode(() => request(hwTargeted, student)), 'FORBIDDEN')
assert.equal(await errCode(() => request(hwUnlimited, student)), 'NOT_AT_LIMIT')
assert.equal(await allowance(hwUnlimited, student), 0)
// 4. Gửi yêu cầu → PENDING; gửi lại khi đang chờ bị chặn
const r1 = await request(hw, student)
assert.equal(r1.status, 'PENDING'); assert.equal(r1.remainingToday, 2); assert.equal(r1.allowance, 1)
assert.equal(await errCode(() => request(hw, student)), 'REQUEST_PENDING')
// Chưa duyệt → vẫn hết lượt
assert.equal(await errCode(() => init(hw, student, 'tok-2')), 'ATTEMPT_LIMIT')
// 5. Từ chối → không cấp lượt; bấm lại idempotent
const d1 = await decide(r1.requestId, false)
assert.equal(d1.status, 'REJECTED'); assert.equal(d1.alreadyDecided, false)
const d1b = await decide(r1.requestId, true)
assert.equal(d1b.status, 'REJECTED', 'quyết định đã chốt không bị lật'); assert.equal(d1b.alreadyDecided, true)
assert.equal(await allowance(hw, student), 1)
assert.equal(await errCode(() => init(hw, student, 'tok-2')), 'ATTEMPT_LIMIT')
// 6. Gửi lại → duyệt → đúng 1 lượt, kể cả bấm duyệt nhiều lần
const r2 = await request(hw, student)
assert.equal(r2.remainingToday, 1)
const d2 = await decide(r2.requestId, true)
assert.equal(d2.status, 'APPROVED')
for (let i = 0; i < 3; i++) assert.equal((await decide(r2.requestId, true)).alreadyDecided, true)
assert.equal(await allowance(hw, student), 2)
// Duyệt KHÔNG tạo phiên thi (đồng hồ chưa chạy)
assert.equal((await q(`select count(*)::int c from public.exam_sessions where homework_id=$1 and student_id=$2 and status='ACTIVE'`, [hw, student])).rows[0].c, 0)
// 7. Dùng lượt được cấp: phiên mới bắt đầu lúc init; resume/takeover vẫn hoạt động
const before = Date.now()
const s2 = await init(hw, student, 'tok-2')
assert.ok(Date.parse(s2.createdAt) >= before - 5000, 'đồng hồ tính từ lúc bắt đầu')
const s2resume = await init(hw, student, 'tok-2')
assert.equal(s2resume.resumed, true); assert.equal(s2resume.sessionId, s2.sessionId)
const s2take = await init(hw, student, 'tok-3')
assert.equal(s2take.takeover, true)
await submit(hw, student)
assert.equal(await errCode(() => init(hw, student, 'tok-4')), 'ATTEMPT_LIMIT', 'cấp 1 lượt = đúng 1 lần thi thêm')
// 8. Giới hạn 3 yêu cầu/ngày (đã có 2 hôm nay)
const r3 = await request(hw, student)
assert.equal(r3.remainingToday, 0)
await decide(r3.requestId, false)
assert.equal(await errCode(() => request(hw, student)), 'REQUEST_DAILY_LIMIT')
// Yêu cầu từ hôm qua (giờ VN) không tính vào hôm nay
await q(`update public.exam_attempt_requests set requested_at = requested_at - interval '1 day' where student_id=$1`, [student])
const r4 = await request(hw, student)
assert.equal(r4.status, 'PENDING')
// 9. Unique PENDING ở mức DB (chống race ngoài RPC)
await assert.rejects(q(`insert into public.exam_attempt_requests(homework_id,student_id) values ($1,$2)`, [hw, student]), e => e.code === '23505')
// 10. Ràng buộc nhất quán quyết định
await assert.rejects(q(`update public.exam_attempt_requests set status='APPROVED' where id=$1`, [r4.requestId]), e => e.code === '23514')
assert.equal(await errCode(() => decide(id(999), true)), 'REQUEST_NOT_FOUND')
// 11. Lưu message id chỉ lần đầu
assert.equal((await q('select public.set_exam_attempt_request_message($1,$2,$3) as ok', [r4.requestId, '12345', 77])).rows[0].ok, true)
assert.equal((await q('select public.set_exam_attempt_request_message($1,$2,$3) as ok', [r4.requestId, '999', 88])).rows[0].ok, false)

// 11b. Duyệt kiểm lại điều kiện: học sinh rời lớp / bài bị ẩn → tự từ chối (notEligible), không kẹt PENDING
await q(`update public.exam_attempt_requests set requested_at = requested_at - interval '2 day' where student_id=$1`, [student])
await decide(r4.requestId, false)
const r5 = await request(hw, student)
await q(`update public.student_classes set status='PAUSED' where student_id=$1`, [student])
const d5 = await decide(r5.requestId, true)
assert.equal(d5.status, 'REJECTED'); assert.equal(d5.notEligible, true)
assert.equal(await allowance(hw, student), 2, 'không cấp lượt khi không còn hợp lệ')
await q(`update public.student_classes set status='ACTIVE' where student_id=$1`, [student])
const r6 = await request(hw, student)
await q(`update public.homeworks set is_published=false where id=$1`, [hw])
const d6 = await decide(r6.requestId, true)
assert.equal(d6.status, 'REJECTED'); assert.equal(d6.notEligible, true)
await q(`update public.homeworks set is_published=true where id=$1`, [hw])
// Từ chối thì không cần kiểm điều kiện; hợp lệ thì notEligible=false
const r7 = await request(hw, student)
const d7 = await decide(r7.requestId, true)
assert.equal(d7.status, 'APPROVED'); assert.equal(d7.notEligible, false)
await q(`update public.exam_attempt_requests set requested_at = requested_at - interval '2 day' where student_id=$1`, [student])

// 11c. Trạng thái: chỉ khi có quyền; không dò được bài lớp khác / bài ẩn; allowance không NULL
const status = (h, s) => q('select public.get_exam_attempt_request_status($1,$2) as r', [h, s]).then(x => x.rows[0].r)
const st = await status(hw, student)
assert.equal(st.latest.status, 'APPROVED'); assert.equal(typeof st.remainingToday, 'number'); assert.equal(st.allowance, 3)
assert.equal(await errCode(() => status(hw, outsider)), 'FORBIDDEN')
assert.equal(await errCode(() => status(hwTargeted, student)), 'FORBIDDEN')
assert.equal(await errCode(() => status(hwPractice, student)), 'INVALID_EXAM')
assert.equal((await status(hwTargeted, other)).latest, null)
assert.equal(await allowance(id(4242), student), 0, 'bài không tồn tại → 0, không NULL')
assert.equal(d7.decidedByName, 'Cô Lan', 'nhánh quyết định lần đầu có decidedByName')

// 12. Oracle JS độc lập: chuỗi thao tác ngẫu nhiên cho học sinh "other" trên bài giao riêng
const model = { submitted: 0, active: false, approved: 0, pending: null, today: 0, base: 1 }
const oracle = {
  allowance: () => model.base + model.approved,
  init() { if (model.active) return 'OK'; if (model.submitted >= this.allowance()) return 'ATTEMPT_LIMIT'; model.active = true; return 'OK' },
  submit() { if (!model.active) return 'SKIP'; model.active = false; model.submitted++; return 'OK' },
  request() {
    if (model.active || model.submitted < this.allowance()) return 'NOT_AT_LIMIT'
    if (model.pending) return 'REQUEST_PENDING'
    if (model.today >= 3) return 'REQUEST_DAILY_LIMIT'
    model.pending = 'P'; model.today++; return 'OK'
  },
  decide(ok) { if (!model.pending) return 'SKIP'; model.pending = null; if (ok) model.approved++; return 'OK' },
  newDay() { model.today = 0; return 'OK' }
}
let seed = 20261113
const rand = () => (seed = (seed * 1103515245 + 12345) % 2147483648) / 2147483648
let lastReq = null; let tokenNo = 0
for (let step = 0; step < 250; step++) {
  const op = ['init', 'submit', 'request', 'approve', 'reject', 'newDay'][Math.floor(rand() * 6)]
  let expected, actual
  if (op === 'init') { expected = oracle.init(); actual = await errCode(() => init(hwTargeted, other, `o-${++tokenNo}`)) }
  else if (op === 'submit') { expected = oracle.submit(); if (expected === 'OK') await submit(hwTargeted, other); actual = expected }
  else if (op === 'request') { expected = oracle.request(); actual = await errCode(async () => { lastReq = (await request(hwTargeted, other)).requestId }) }
  else if (op === 'approve' || op === 'reject') {
    expected = oracle.decide(op === 'approve')
    actual = expected === 'SKIP' ? 'SKIP' : await errCode(async () => { const d = await decide(lastReq, op === 'approve'); if (d.alreadyDecided) throw new Error('DOUBLE_DECIDE') })
  } else { expected = oracle.newDay(); await q(`update public.exam_attempt_requests set requested_at = requested_at - interval '1 day' where student_id=$1`, [other]); actual = 'OK' }
  assert.equal(actual, expected, `bước ${step} (${op}): DB=${actual} oracle=${expected}`)
  assert.equal(await allowance(hwTargeted, other), oracle.allowance(), `allowance lệch ở bước ${step}`)
}

// 13. Quyền: anon/authenticated không đọc bảng, không gọi RPC; RLS chặn kể cả khi lỡ grant
await db.exec('reset role')
for (const role of ['anon', 'authenticated']) {
  await db.exec(`set role ${role}`)
  await assert.rejects(q('select * from public.exam_attempt_requests'), e => e.code === '42501')
  await assert.rejects(q('select public.request_exam_attempt($1,$2)', [hw, student]), e => e.code === '42501')
  await assert.rejects(q('select public.decide_exam_attempt_request($1,true,1,$2)', [r4.requestId, 'x']), e => e.code === '42501')
  await assert.rejects(q('select public.init_exam_attempt($1,$2,$3)', [hw, student, 't']), e => e.code === '42501')
  await assert.rejects(q('select public.get_exam_attempt_request_status($1,$2)', [hw, student]), e => e.code === '42501')
  await db.exec('reset role')
}
await db.exec('grant select on public.exam_attempt_requests to authenticated; set role authenticated')
assert.equal((await q('select count(*)::int c from public.exam_attempt_requests')).rows[0].c, 0, 'RLS không có policy → không thấy dòng nào')
await db.exec('reset role')

console.log('Exam attempt requests: PostgreSQL/WASM DDL, quyền & loại bài, 1 PENDING, 3/ngày (giờ VN), từ chối/duyệt idempotent, cấp đúng 1 lượt chờ dùng, đồng hồ tính khi bắt đầu, resume/takeover, oracle 250 bước, RLS/EXECUTE PASS.')
