# BÁO CÁO AUDIT HIỆU NĂNG API — SUPABASE EDGE FUNCTIONS

> **Loại tài liệu:** Audit read-only + kế hoạch tối ưu (chưa áp dụng thay đổi mã nguồn nào).
> **Phạm vi:** 18 Supabase Edge Functions trong `supabase/functions/*/index.ts`, shared module `supabase/shared/*`, 27 migration trong `supabase/migrations/`, và toàn bộ call-site FE trong `fe/src/js/api.js`, `fe/src/js/app.js`, `fe/src/js/views/*.js`.
> **Ngày thực hiện:** 21/09/2026 · **Trạng thái:** chờ review trước khi triển khai.
> **Ghi chú môi trường:** máy local không có `supabase` CLI và `deno` ⇒ mọi phép đo runtime (deploy, region pin, cold start) cần thực hiện ở phía bạn. Báo cáo kèm kế hoạch đo để tái lập.

## MỤC LỤC

| # | Nội dung |
|---|---|
| 0 | Tóm tắt điều hành |
| 1 | Phạm vi & phương pháp |
| 2 | Bảng audit tổng (18 function) |
| 3 | Nhóm A — N+1 Query / N+1 Write |
| 4 | Nhóm B — `await` tuần tự có thể chạy song song |
| 5 | Nhóm C — Side-effect chặn đường phản hồi (UX) |
| 6 | Nhóm D — Payload & tải DB (index, cột, phân trang) |
| 7 | Nhóm E — Luồng chưa hợp lý (login, hot path, FE route chain) |
| 8 | Nhóm F — Cold start & cấu hình triển khai |
| 9 | Thứ tự thực hiện: Giai đoạn 0 → 3 |
| 10 | Kế hoạch đo & nghiệm thu |
| 11 | Rủi ro, trade-off & câu hỏi cần xác nhận |
| 12 | Phụ lục A — Index còn thiếu (draft SQL) |
| 13 | Phụ lục B — Khung RPC đề xuất (draft SQL) |
| 14 | Phụ lục C — Danh sách `select('*')` cần thu gọn |
| 15 | Phụ lục D — Ước tính lợi ích & bảng ưu tiên |

---

## 0. TÓM TẮT ĐIỀU HÀNH

Hệ thống hiện chạy ở mức **0.245s + 0.16s × số round-trip nội bộ** cho mỗi lần gọi function. Nút thắt **không phải** CPU hay thuật toán, mà là **số lần chờ nối tiếp (sequential awaits)** giữa function và Supabase. Vì vậy mọi cải tiến đều quy về một trong hai việc: **(a) giảm số round-trip**, hoặc **(b) gom nhiều round-trip thành một** (RPC/transaction/`Promise.all`).

### 7 vấn đề nghiêm trọng nhất (theo mức độ ảnh hưởng)

| # | API | Hiện tại | Nguyên nhân gốc | Sửa đề xuất | Ước tính sau sửa |
|---|---|---|---|---|---|
| 1 | `submit-homework` POST | ~1.2s + **chờ tới 3.5s** | `await Promise.race([sendNotification(), timeout(3500)])` ở `index.ts:522-524`; gửi Telegram **tuần tự từng chat** ở `:512`; 3 hop ghi nối tiếp | `EdgeRuntime.waitUntil(...)` cho notification + `Promise.all` cho Telegram + gộp 3 ghi thành 1 RPC | ~0.45–0.6s (bỏ trần 3.5s) |
| 2 | `login` POST | **3–4 hop** (~0.9s) | `profiles` → `auth.admin.getUserById` → `signInWithPassword` → `student_classes` (nối tiếp, `index.ts:30,42,50,63`) dù email đã suy ra được từ username | `Promise.all` 3 nhánh + fallback 2 tầng cho user legacy | ~0.4–0.45s |
| 3 | `question-bank` `generate-exam` | **3 + 3×N hop** | `for (const item of distribution)` gọi `getScopeTargetIds` (2 hop) + query pool (1 hop) mỗi item (`index.ts:698-701`); scope **không memoize** dù cùng `gradeBlock` | Memoize scope + gộp mọi scope vào **1 query** (hoặc 1 RPC) | ~0.5–0.7s với ma trận 5 chương |
| 4 | `exam-log` POST (gọi mỗi lần rời tab) | **4–5 hop + 1 function invoke** | insert log → `homeworks` → `exam_sessions` → `count` violations → `functions.invoke('submit-homework')` (`index.ts:112`) | Gom 3 read vào `Promise.all`/RPC; invoke → `waitUntil`; trả `autoSubmitted` sau | ~0.5s |
| 5 | `exam-session` heartbeat/autosave (10–30s/lần/HS) | **2 hop** (select rồi update) | Kiểm tra `session_token` bằng 1 query riêng rồi mới update (`index.ts:147-165`, `178-198`) | 1 câu `update(...).eq('session_token', token).select('id')` — 0 row ⇒ token sai | 1 hop (~0.3s) |
| 6 | `homework-detail` GET (cửa vào phòng thi) | **3 hop**, trong đó 2 hop nối tiếp | Fetch homework (`:25`) **trước** rồi mới `requireAuth` (`:66`) | Chạy `Promise.all([requireAuth, fetchHomework])` | ~0.45s |
| 7 | FE route nặng (`#student-details`, `#classes-admin`, `#students`) | **3–4 request nối tiếp** (1–2.5s) | `app.js` router `await` tuần tự từng API trước khi render | `Promise.all` theo route + render skeleton trước | 1 wait (~0.4–0.8s) |

### Ước tính tổng lợi ích

- Đường đi học sinh (login → xem bài → thi → nộp): giảm **~55–75%** thời gian chờ cảm nhận.
- Trang quản trị (dashboard, question-bank, students, classes): giảm **~40–60%**.
- Nếu **không** được thêm migration (index/RPC): vẫn đạt khoảng **40–50%** lợi ích nhờ nhóm B/C/E (song song hoá, `waitUntil`, bỏ chặn ở FE).

---

## 1. PHẠM VI & PHƯƠNG PHÁP

### 1.1 Đã khảo sát

- **18 Edge Functions:** `login`, `refresh-token`, `reset-password`, `create-student`, `create-class`, `create-chapter`, `create-lesson`, `create-homework`, `question-bank`, `submit-homework`, `homework-detail`, `exam-session`, `exam-log`, `reopen-submission`, `dashboard`, `statistics`, `student-history`, `telegram-bot`.
- **Shared:** `auth-middleware.ts` (verify JWT nội bộ + `requireAuth`/`requireAdmin`), `supabase-client.ts`, `response-helper.ts`, `validators.ts`.
- **DB:** 27 file migration — index, RLS/policies, trigger `trg_sync_qb_grade_block`, function `is_admin()`.
- **FE:** `fe/src/js/api.js` (client + region pin), `fe/src/js/app.js` (router + prefetch), `fe/src/js/views/*.js` (18 view).
- **Tooling:** `supabase/scripts/bench-functions.sh`, `supabase/config.toml`.

### 1.2 Mô hình chi phí dùng để định lượng

```
TTFB ≈ 0.245s (gateway + khởi động isolate) + 0.16s × (số round-trip nội bộ)
```

| Yếu tố | Giá trị | Ghi chú |
|---|---|---|
| 1 round-trip chưa pin region | ~0.160s | isolate Seoul → DB Sydney (bench script đo được) |
| 1 round-trip sau khi pin `ap-southeast-2` | ~0.05–0.06s | cùng region |
| `requireAuth()` (đã sửa verify JWT nội bộ) | **1 hop** | `profiles` + `student_classes` chạy `Promise.all` (`auth-middleware.ts:245`) |
| `requireAuth()` (phiên bản cũ, gọi GoTrue) | 2 hop | đã khắc phục ở lần sửa local trước đó |

> **Hệ quả:** mọi round-trip còn lại đều là chi phí thật. Trong báo cáo này "hop" luôn nghĩa là **round-trip tới Supabase trong đường tới hạn của response**.

### 1.3 Hai câu hỏi treo từ phiên trước — đã tự trả lời

1. **`getSupabaseEnv()` trả `anonKey` từ đâu?** → `SUPABASE_ANON_KEY` do Supabase inject tự động cho mọi hosted function; endpoint JWKS là public nên header `apikey` chỉ mang tính best-effort. ⇒ **Không cần sửa.**
2. **Còn sót import `esm.sh`?** → `grep -rn 'esm.sh' supabase/` = **0 kết quả**, đã chuyển hết sang `npm:`. ⇒ **Không cần sửa.**

---

## 2. BẢNG AUDIT TỔNG (18 FUNCTION)

**Cách đọc:** `hop` = số round-trip nối tiếp trong đường tới hạn (đã tính `requireAuth` = 1 hop). `N` = số phần tử do client gửi lên (câu hỏi, lớp, item ma trận…). Cột **N+1** đánh dấu vòng lặp có `await` bên trong.

| # | Function / API | Route / Action | Hop | N+1 | Vấn đề chính | Ưu tiên |
|---|---|---|---|---|---|---|
| 1 | `login` | `POST /login` | **3–4** | – | `profiles` → `getUserById` (GoTrue) → `signInWithPassword` (GoTrue) → `student_classes`, tất cả nối tiếp; log lộ prefix service key | **P0** |
| 2 | `refresh-token` | `POST /refresh-token` | 1 | – | Ổn (không có entry trong `config.toml` — xem §8.2) | P1 (config) |
| 3 | `reset-password` | `POST /reset-password` | 3 | – | `requireAdmin` → `profiles` → `auth.admin.updateUserById`; 2 hop cuối có thể song song | P2 |
| 4 | `create-student` | `GET ?classId=` | **3** | – | Đã tối ưu ✅ (2 query song song + join) | – |
| 5 | `create-student` | `GET` (theo role) | 2 | – | Ổn ✅ | – |
| 6 | `create-student` | `POST` (create) | **4** | – | `createUser` (GoTrue) → insert `profiles` → insert `student_classes`, có code rollback thủ công ⇒ nên là 1 RPC | P1 |
| 7 | `create-student` | `PUT/PATCH` (update) | 3–4 | – | password ‖ profile đã song song ✅; nhưng sync lớp = `delete` → `insert` (2 hop) | P1 |
| 8 | `create-student` | `DELETE` / `remove-from-class` | 2–3 | – | Ổn | P2 |
| 9 | `create-class` | `GET` (list) | 2 | – | Nested select ✅ | – |
| 10 | `create-class` | `GET includeStats=true` | 2 | ⚠ | 3 query song song ✅ nhưng kéo **toàn bộ** `question_bank(grade_block)` về JS để đếm | P2 |
| 11 | `create-class` | `set-sessions` | 3 | – | `delete` → `insert` (2 hop) ⇒ RPC | P2 |
| 12 | `create-class` | `set-student-sessions` | 3 | – | Như trên | P2 |
| 13 | `create-class` | `remove-student` | **4** | – | delete join → select remaining → update `profiles` | P2 |
| 14 | `create-class` | `update-grade-block` | **5** | – | update → cascade `classes` → cascade `question_bank` (3 hop ghi nối tiếp, không transaction) | P2 |
| 15 | `create-class` | `delete-grade-block` | 4 | – | 3 hop ghi nối tiếp | P2 |
| 16 | `create-chapter` | `GET ?includeLessons` | 2 | – | Ổn ✅ | – |
| 17 | `create-lesson` | `GET` / `?isTrial` | 1–2 | – | Ổn ✅ | – |
| 18 | `create-homework` | `GET ?classId` | 2–3 | – | Ổn | P2 |
| 19 | `create-homework` | `GET todoOnly` | 2 | – | 2 query song song ✅ | – |
| 20 | `create-homework` | `POST` | **6** | – | `homeworks` → `questions` → `question_answers` → fetch `lessons` (cho bank-sync) → insert `question_bank`, tất cả nối tiếp ⇒ 1 RPC | P1 |
| 21 | `create-homework` | `PUT/PATCH` | 5–6 | ⚠ | 1 query + `Promise.all` N update question (N request đồng thời) + upsert answers + delete | P1 |
| 22 | `create-homework` | regrade (nền) | – | ⚠ | upsert chunk 200 tuần tự + `Promise.all` update từng submission; đã `waitUntil` ✅ | P2 |
| 23 | `question-bank` | `GET` (list) | 2–4 | ⚠ | `getScopeTargetIds` = **2 hop cố định** cho mọi call site; `or()` với mảng `IN (…)` phình theo số lớp/chương | P1 |
| 24 | `question-bank` | `action=stats` | 3–4 | ⚠ | Kéo rows rồi đếm 6 nhóm bằng JS | P1 |
| 25 | `question-bank` | `action=check-availability` | 3–4 | ⚠ | Như trên, payload lớn, chỉ để trả về các con số đếm | P1 |
| 26 | `question-bank` | `action=import-from-homework` | **5** | ⚠ | dedupe bằng cách `select('prompt')` **toàn bảng** `question_bank` | P2 |
| 27 | `question-bank` | `action=generate-exam` | **3 + 3×N** | 🔴 | Vòng lặp `distribution`: mỗi item 2 hop scope + 1 hop pool; sau đó N hop update `usage_count` (`:897`) | **P0** |
| 28 | `question-bank` | `action=swap-question` | 3 | – | scope 2 hop + query; nên gộp | P2 |
| 29 | `question-bank` | `action=create-from-selected` | **4 + N** | 🔴 | hw → questions → answers → **N hop** update `usage_count` (`:1081`); kèm luôn `select('*')` | **P0** |
| 30 | `question-bank` | `PUT` / `DELETE` | 2–3 | – | Ổn | – |
| 31 | `submit-homework` | `POST` | **6–8 + trần 3.5s** | – | fetch hw → `requireStudent` (nối tiếp) → session → count attempts → questions → answers key → insert submission → insert answers → signed URL → **await Telegram** | **P0** |
| 32 | `homework-detail` | `GET` | 3 | – | Fetch homework (`:25`) rồi mới `requireAuth` (`:66`) ⇒ 2 hop nối tiếp; sau đó 3 query song song ✅ (`:116`) | **P0** |
| 33 | `exam-session` | `GET` | 2–3 | – | Ổn | P1 |
| 34 | `exam-session` | `init` | 2–4 | – | Có select + count + insert/update nối tiếp | P1 |
| 35 | `exam-session` | `heartbeat` | **2** | – | select → kiểm tra token trong JS → update (`:147-165`); gọi 10–30s/lần/HS | **P0** |
| 36 | `exam-session` | `autosave` | **2** | – | Như trên (`:178-198`) | **P0** |
| 37 | `exam-log` | `GET` | 2 | – | Ổn | – |
| 38 | `exam-log` | `POST` | **4–5 + invoke** | – | insert log → `homeworks` → `exam_sessions` → `count` → `functions.invoke('submit-homework')` (`:112`), gọi mỗi lần rời tab | **P0** |
| 39 | `reopen-submission` | `POST` | **5** | – | 4 thao tác ghi nối tiếp (không transaction) ⇒ 1 RPC | P2 |
| 40 | `dashboard` | `GET` | 2 | – | 8 query **song song ✅** nhưng kéo full bảng `submissions`/`class_sessions`/`student_sessions` về aggregate bằng JS | P1 |
| 41 | `statistics` | `GET ?homeworkId` | 2 | – | Ổn | – |
| 42 | `statistics` | `GET ?classId` | 2 | – | Ổn | – |
| 43 | `statistics` | `GET` (mặc định) | 2–3 | ⚠ | Embed `submissions` cho **mọi** homework, không limit/phân trang | P1 |
| 44 | `student-history` | `GET ?submissionId` | 2–3 | – | 2 query song song ✅ | – |
| 45 | `student-history` | `GET ?studentId` | 3–4 | – | 3 nhánh song song ✅; +1 hop khi admin xem wrong-analysis, +1 hop fetch enrolled nếu FE không prefetch | P1 |
| 46 | `telegram-bot` | `POST` (webhook) | – | – | Webhook Telegram, không nằm trên đường tới hạn của người dùng | – |

### 2.1 Tổng hợp theo mức ưu tiên

| Mức | Số API | Nhóm chủ đề |
|---|---|---|
| **P0** (7) | login, submit-homework POST, question-bank generate-exam, question-bank create-from-selected, exam-log POST, exam-session heartbeat/autosave, homework-detail GET | Đường đi học sinh + thao tác tần suất cao khi thi |
| **P1** (9) | create-homework POST/PUT, question-bank list/stats/check-availability, create-student POST/PUT, create-class set-sessions, dashboard, statistics mặc định, student-history, refresh-token config | Trang quản trị + chuỗi ghi nhiều bước |
| **P2** (12) | create-class cascade/delete/set-student-sessions/remove-student, reopen-submission, import-from-homework, regrade, reset-password, swap-question | Tối ưu dài hạn, ít ảnh hưởng UX trực tiếp |

---

## 3. NHÓM A — N+1 QUERY / N+1 WRITE

Đây là nhóm gây hại lớn nhất vì chi phí tăng **tuyến tính theo dữ liệu người dùng nhập**, và bị nhân lên khi nhiều người dùng cùng lúc.

### A1. `question-bank` `generate-exam` — vòng lặp phân bổ câu hỏi

**Vị trí:** `supabase/functions/question-bank/index.ts:698-701` (vòng lặp), `:897` (vòng lặp update `usage_count`), `:5` (`getScopeTargetIds`).

```ts
// HIỆN TẠI — mỗi item trong ma trận: 2 hop scope + 1 hop query pool
for (const item of distribution) {
  const itemBlock = item.gradeBlock || gradeBlock
  const { classIds: itClassIds, chapterIds: itChapterIds } = await getScopeTargetIds(serviceRoleClient, itemBlock) // 2 hop
  let itemQuery = serviceRoleClient.from('question_bank').select('*')                                              // + 1 hop
  ...
}
// sau vòng lặp:
for (const qId of pickedIds) {
  const curCount = (curQ?.usage_count || 0) + 1
  await serviceRoleClient.from('question_bank').update({ usage_count: curCount }).eq('id', qId)                     // N hop
}
```

**Tác động:** ma trận 5 chương ⇒ **15 hop (~2.4s)** riêng phần bốc câu hỏi, cộng N hop tăng `usage_count` ⇒ 20+ hop. Đề thi càng chi tiết, giáo viên chờ càng lâu.

**Hướng sửa theo 3 tầng (làm được độc lập, tầng 1 rủi ro gần bằng 0):**

1. **Memoize scope trong 1 request** (~5 dòng): `const scopeCache = new Map<string, {classIds, chapterIds}>()`; vì đa số item dùng cùng `gradeBlock`, 15 hop ⇒ 3 hop. Đây là **quick win nên làm ngay** kể cả khi chưa có migration.
2. **Gộp 1 query cho toàn bộ distribution:** thay N lần query bằng **1 query `.or()`** mở rộng cho mọi scope (`grade_block.eq.X`, `class_id.in.(…)`, `chapter_id.in.(…)`), lấy pool 1 lần rồi chia pool theo `chapter_id`/`lesson_id` trong JS ⇒ 3N hop → **1 hop**.
3. **`getScopeTargetIds` từ 2 hop xuống 1 hop** (áp dụng cho **cả 7 call site** ở `:134, :193, :222, :700, :748, :923`):
   ```ts
   // 1 hop: embed quan hệ classes -> chapters
   const { data } = await svc.from('classes').select('id, chapters(id)').eq('grade_block', gradeBlock)
   const classIds = (data ?? []).map(c => c.id)
   const chapterIds = (data ?? []).flatMap(c => (c.chapters ?? []).map(ch => ch.id))
   ```
   hoặc `rpc('fn_scope_targets', { p_grade_block })` trả về `{ class_ids, chapter_ids }` (Phụ lục B.9).

4. **Tăng `usage_count` bằng 1 lệnh:** `rpc('fn_bump_qb_usage', { p_ids })` với `update question_bank set usage_count = usage_count + 1 where id = any(p_ids)` ⇒ 1 hop, atomic, **sửa luôn bug lost-update** khi 2 giáo viên bốc đề đồng thời.

### A2. `question-bank` `create-from-selected`

**Vị trí:** `index.ts:1078-1081` (vòng lặp update), cùng chuỗi ghi 4 hop ở `:1131-1177`.

- N hop update `usage_count` ⇒ dùng `fn_bump_qb_usage` (1 hop).
- Chuỗi `homeworks` → `questions` → `question_answers` ⇒ gộp thành **1 RPC** (`fn_create_homework_from_bank`, Phụ lục B.3).
- **Kết quả:** `4 + N` hop → **1 hop**.

### A3. Chuỗi ghi nối tiếp → 1 RPC (transaction)

Đây là **mẫu lặp lại nhiều nhất** trong codebase: mỗi API ghi 2–5 bảng nối tiếp, kèm code rollback thủ công (dễ sai, không atomic thật). Chuyển thành Postgres function vừa giảm hop vừa bảo đảm toàn vẹn dữ liệu.

| API | Hiện tại | Sau khi dùng RPC | Tiết kiệm |
|---|---|---|---|
| `create-homework` POST (`index.ts:251,300,325,337,425`) | 5 hop ghi/đọc nối tiếp | `fn_create_homework(jsonb, jsonb, bool)` | 4 hop (~0.64s) |
| `question-bank` create-from-selected / generate-exam | 4 + N | `fn_create_homework_from_bank(...)` + `fn_bump_qb_usage` | 3 + N hop |
| `submit-homework` POST | 3 hop ghi | `fn_submit_homework(...)` (insert submission + answers + update session) | 2 hop **và** atomic |
| `create-student` POST | `createUser` → profile → join (3) | `fn_create_student_profile(...)` (giữ `createUser` ở GoTrue) | 2 hop |
| `create-student` PUT | delete → insert join (2) | `fn_sync_student_classes(uuid, uuid[])` | 1 hop |
| `create-class` set-sessions / set-student-sessions | delete → insert (2) | `fn_set_class_sessions(...)` / `fn_set_student_sessions(...)` | 1 hop |
| `create-class` remove-student | delete → select → update (3) | `fn_remove_student_from_class(...)` | 2 hop |
| `create-class` update-grade-block | update → cascade ×2 (3) | `fn_rename_grade_block(...)` (có kiểm tra trùng) | 2 hop |
| `reopen-submission` POST | 4 thao tác ghi | `fn_reopen_submission(...)` | 3 hop |
| `exam-session` heartbeat/autosave | select → update (2) | `update(...).eq('session_token', token)` hoặc `fn_exam_heartbeat(...)` | 1 hop |

> ⚠️ **Hiện repo chưa có RPC nghiệp vụ nào** (chỉ có trigger function `is_admin()` và `trg_sync_qb_grade_block`). Cần 1 migration mới, ví dụ `supabase/migrations/20260801000028_perf_rpcs.sql`, dùng `security invoker` (client gọi bằng service-role nên không cần `security definer`) để không mở rộng bề mặt bảo mật.

### A4. `question-bank` `import-from-homework` — dedupe sai cách

**Vị trí:** `index.ts:472` (action) — kéo về toàn bộ cột `prompt` của `question_bank` rồi so trùng trong JS. Khi ngân hàng câu hỏi vài chục nghìn dòng, đây là payload lớn nhất hệ thống cho một thao tác **chỉ để biết câu nào đã tồn tại**.

**Sửa:** thêm cột băm + unique index, để DB chống trùng:
```sql
alter table public.question_bank add column if not exists prompt_hash text;  -- băm sha256(normalize(prompt))
create unique index if not exists idx_qb_prompt_hash on public.question_bank(prompt_hash) where prompt_hash is not null;
```
Sau đó dùng `upsert(rows, { onConflict: 'prompt_hash', ignoreDuplicates: true })` ⇒ **1 hop**, không tải dữ liệu về, chống trùng thật (kể cả khi 2 giáo viên import cùng lúc).

---

## 4. NHÓM B — `await` TUẦN TỰ CÓ THỂ CHẠY SONG SONG

Đây là nhóm **rẻ nhất để sửa** (chỉ đổi thứ tự thực thi, không đổi schema, không đổi API contract) nhưng lại đem lại phần lớn lợi ích tức thì.

| # | Vị trí | Hiện tại (nối tiếp) | Sửa | Tiết kiệm |
|---|---|---|---|---|
| B1 | `homework-detail/index.ts:25` → `:66` | Fetch `homeworks` trước, **sau đó** mới `requireAuth(req)` | `const [auth, hw] = await Promise.all([authHeader ? requireAuth(req) : null, hwQuery])`; giữ nguyên thứ tự kiểm tra 403/404 sau đó | 1 hop (~0.16s) trên API vào phòng thi |
| B2 | `submit-homework/index.ts` (fetch hw rồi `requireStudent`) | 2 hop nối tiếp | Như B1 — `requireStudent` không phụ thuộc kết quả homework | 1 hop |
| B3 | `login/index.ts:30 → 42 → 50 → 63` | 3–4 hop nối tiếp (xem §7.1 để có giải pháp đầy đủ) | `Promise.all([signInWithPassword(syntheticEmail), profilesQuery, studentClassesQuery])` | 2–3 hop (~0.32–0.48s) |
| B4 | `exam-log/index.ts:72 → 90` (+ insert log) | insert → `homeworks` → `exam_sessions` → `count` | Gom 3 read độc lập vào 1 lần `Promise.all` sau khi đã có `homework_id`/`student_id` từ body; hoặc 1 RPC `fn_log_exam_event(...)` trả `{ log, currentViolations, maxViolations }` | 1–2 hop |
| B5 | `question-bank/index.ts:923` (`swap-question`) | scope (2 hop) → query pool (1 hop) | Áp dụng A1.3 (scope 1 hop) + memoize | 1 hop |
| B6 | `student-history` (nhánh `?studentId`) | Khi FE không prefetch `enrolled`, thêm 1 hop fetch **sau** `Promise.all` | Luôn đưa `enrolledPromise` vào `Promise.all` — nó chỉ phụ thuộc `classId`, không phụ thuộc kết quả nào khác | 1 hop |
| B7 | `create-homework/index.ts:337` | Fetch `lessons` (để bank-sync) **sau** khi insert answers | Chạy song song với `homeworks.insert` vì chỉ cần `lessonId` từ body | 1 hop |
| B8 | `reset-password` | `profiles` → `auth.admin.updateUserById` | 2 việc độc lập ⇒ `Promise.all` (GoTrue vẫn phải gọi, không tránh được) | 1 hop |

**Ví dụ mẫu (B1)** — trước/sau:
```ts
// TRƯỚC
const { data: homework } = await svc.from('homeworks').select('*').eq('id', homeworkId).single()
if (!homework) return errorResponse('Homework not found', 404)
const authResult = await requireAuth(req)              // +1 hop nối tiếp

// SAU
const hwPromise = svc.from('homeworks').select('...cột cần...').eq('id', homeworkId).single()
const authPromise = authHeader ? requireAuth(req) : Promise.resolve(null)
const [{ data: homework }, authResult] = await Promise.all([hwPromise, authPromise])
if (!homework) return errorResponse('Homework not found', 404)
if (authResult && 'response' in authResult) return authResult.response
```

---

## 5. NHÓM C — SIDE-EFFECT CHẶN ĐƯỜNG PHẢN HỒI (UX)

Đây là nhóm tệ nhất về **cảm nhận người dùng**, dù số hop không lớn: người dùng phải chờ những việc **không liên quan tới câu trả lời họ cần**.

### C1. `submit-homework` POST — học sinh chờ tối đa 3.5s sau khi đã có điểm

**Vị trí:** `supabase/functions/submit-homework/index.ts:415-416` (gom chat_id), `:512` (gửi tuần tự), `:522-524` (chặn response).

```ts
// HIỆN TẠI
const targetChatIds = [...new Set(tgConfigs.map(c => c.chat_id).filter(Boolean))]
for (const chatId of targetChatIds) {           // gửi TUẦN TỰ từng chat
  await sendTelegram(chatId, ...)
}
...
await Promise.race([                             // 🚨 chặn response tới 3.5s
  sendNotification(...),
  new Promise((resolve) => setTimeout(resolve, 3500)),
])
return jsonResponse({ submissionId, score, ... })
```

**Sửa đề xuất:**
```ts
// SAU
const notifyTask = (async () => {
  await Promise.all(targetChatIds.map(chatId => sendTelegram(chatId, ...)))  // song song
})().catch(err => console.error('[submit-homework] notify failed:', err?.message))

// @ts-ignore EdgeRuntime có sẵn ở Supabase Edge Functions
EdgeRuntime.waitUntil(notifyTask)          // không chặn response

return jsonResponse({ submissionId, score, ... })
```

- **Lợi ích:** bỏ hoàn toàn trần 3.5s khỏi critical path, giảm 2–3 hop, và Telegram vẫn gửi.
- **Tiền lệ trong repo:** `create-homework/index.ts:600` đã dùng `EdgeRuntime.waitUntil` cho regrade ⇒ pattern đã được chấp nhận.
- **Trade-off đã chấp nhận:** notification có thể thất bại sau khi response đã trả; đã có `console.error` để truy vết.

### C2. `exam-log` POST — invoke function khác trong đường tới hạn

**Vị trí:** `supabase/functions/exam-log/index.ts:112` (`functions.invoke('submit-homework', ...)`), nhánh tự động thu bài khi vượt `max_violations`.

- **Hiện tại:** học sinh vi phạm ⇒ request `exam-log` phải chờ **thêm một lượt gọi function** (~0.5–1s, gồm cả cold start của `submit-homework`) trước khi FE biết kết quả.
- **Sửa:** set session sang `SUBMITTED` (hoặc đánh dấu cờ) ngay trong transaction, trả `autoSubmitted: true` cho FE, rồi `EdgeRuntime.waitUntil(serviceRoleClient.functions.invoke('submit-homework', ...))`. Nhánh `alreadySubmitted` đã tồn tại trong `submit-homework` nên thao tác này **idempotent**, không sợ chạy trùng.
- **Lợi ích:** API bị gọi nhiều nhất trong giờ thi trở về ~0.5s ổn định.

### C3. FE — overlay chặn toàn màn hình cho cả request GET

**Vị trí:** `fe/src/js/api.js:25-50` (bật overlay cho mọi request không `silent`), dùng cùng router ở `fe/src/js/app.js`.

- **Hiện tại:** route gọi 3–4 API nối tiếp ⇒ người dùng thấy spinner **che toàn bộ giao diện** suốt 1–2.5s, cảm giác như app treo.
- **Sửa (perceived performance, không cần đổi backend):**
  1. Render skeleton của view **ngay** (trước khi có dữ liệu);
  2. Chỉ dùng overlay cho mutation (`POST/PUT/PATCH/DELETE`); GET luôn `silent`;
  3. Cập nhật từng vùng khi dữ liệu về (`hydrate` sau).

---

## 6. NHÓM D — PAYLOAD & TẢI DB

Nhóm này **không** tăng số hop nên TTFB hiện tại vẫn ổn, nhưng khi dữ liệu lớn lên (đặc biệt `submissions`, `exam_logs`, `question_bank`) nó trở thành nút cổ chai thật: response JSON lớn ⇒ thời gian transfer + `JSON.parse` trong isolate tăng tuyến tính, RAM isolate tăng, và nguy cơ timeout/`WORKER_LIMIT` xuất hiện.

### D1. `dashboard` GET — aggregate ở JS thay vì DB

**Vị trí:** `supabase/functions/dashboard/index.ts:17-82` — 8 query chạy **song song ✅** nhưng kéo về toàn bộ:

| Query | Vấn đề |
|---|---|
| `profiles` (role STUDENT) | tải hết học sinh chỉ để đếm |
| `submissions` (kèm `submitted_at`) | tải **mọi** submission từ trước tới nay |
| `class_sessions` | tải hết phân công lớp–buổi |
| `student_sessions` | tải hết điểm danh |

- **Sửa ngắn hạn (rẻ, làm ngay được, không cần migration):** giới hạn cửa sổ thời gian — `.gte('submitted_at', cutoff)` với `cutoff = 240 ngày` (đúng bằng cửa sổ biểu đồ đang dùng), tương tự cho `class_sessions`/`student_sessions`. Không đổi kết quả hiển thị, giảm mạnh payload.
- **Sửa đúng bài (khuyến nghị):** 1 RPC `fn_dashboard_overview(p_months int default 6)` trả **đúng object cuối cùng** (`overview`, `scoreDistribution`, `monthlyStats`, `studentAttendanceStats`, `recentSubmissions`) ⇒ **1 hop**, DB aggregate bằng index, payload nhỏ và cố định (Phụ lục B.8).

### D2. `statistics` GET (nhánh mặc định)

**Vị trí:** `statistics/index.ts:205` — embed `submissions` cho **mọi** homework, không `limit`, không lọc thời gian.
- **Sửa:** bắt buộc/lọc theo `classId` hoặc `?limit`, kèm `range` cho bảng phân trang; trung hạn chuyển sang RPC aggregate `fn_homework_stats(p_class_id)`.

### D3. `question-bank` `stats=true` và `check-availability`

**Vị trí:** `index.ts:115-141` (`check-availability`), `:182-193` (`stats`), helper scope `:5`.
- **Hiện tại:** lấy rows (kèm JSONB `prompt`/`options`/`statements`) rồi `.filter().length` cho 6 nhóm và tự group by chương/bài trong JS.
- **Sửa:** 1 RPC `fn_qb_availability(...)` dùng `count(*) filter (where ...)` + `group by` ⇒ trả về đúng các con số, payload từ hàng trăm KB xuống vài trăm byte, **1 hop** (Phụ lục B.7).
- **Trung hạn:** cân nhắc vật lý hoá `question_bank` theo `grade_block` + view tổng hợp định kỳ.

### D4. `create-class` `get-grade-blocks?includeStats=true`

**Vị trí:** `create-class/index.ts:36-47` — kéo toàn bộ `question_bank(grade_block)` để đếm số câu mỗi khối.
- **Sửa:** `select('grade_block').limit(...)` + đếm bằng `{ count: 'exact', head: true }` per khối (vài request nhẹ, chạy `Promise.all`), hoặc 1 query `group by` qua RPC.

### D5. `select('*')` — 12 vị trí cần thu gọn

`select('*')` trên `question_bank` kéo theo `prompt`/`options`/`statements` (JSONB lớn) và `sa_answer`/`explanation` — không cần thiết ở bước **lọc/chọn**. Danh sách đầy đủ ở **Phụ lục C**. Đáng chú ý nhất:

| Vị trí | Vì sao đắt | Sửa |
|---|---|---|
| `question-bank:701` (pool của generate-exam) | Chỉ cần `id, question_type, chapter_id, lesson_id, usage_count` để bốc; prompt chỉ cần cho **các câu đã chọn** | 2 tầng: query “metadata” nhẹ → fetch chi tiết chỉ cho `pickedIds` (`in.(...)`) |
| `question-bank:995, 1177` | `select('*')` sau insert/`RETURNING` | Liệt kê cột FE thực dùng |
| `create-class:28, 39, 146, 419` | Kéo cả cột JSONB không dùng | Liệt kê cột |
| `create-lesson:112`, `exam-session:68` | Tương tự | Liệt kê cột |
| `question-bank:926, 1133` | Pool cho swap / create-from-selected | Như trên |

### D6. Index còn thiếu (đã đối chiếu 27 migration hiện có)

Migration hiện tại đã có khá nhiều index (`idx_qb_filter`, index theo `homework_id`, `question_answers(question_id)`…), nhưng **thiếu các case sau** — đây là những truy vấn nằm trong đường tới hạn P0/P1:

```sql
-- supabase/migrations/20260801000028_perf_indexes.sql
create index if not exists idx_qb_lesson_id      on public.question_bank(lesson_id);
create index if not exists idx_qb_chapter_id     on public.question_bank(chapter_id);
-- lưu ý: idx_qb_filter hiện đứng trước bởi subject/grade_level nên KHÔNG dùng được cho truy vấn chỉ lọc chapter/lesson
create index if not exists idx_questions_hw_num  on public.questions(homework_id, question_number);
create index if not exists idx_exam_logs_hw_stu_created on public.exam_logs(homework_id, student_id, created_at desc);
create index if not exists idx_profiles_role_stu on public.profiles(role) where role = 'STUDENT';
create index if not exists idx_homeworks_created on public.homeworks(created_at desc);
create index if not exists idx_submissions_hw_stu_submitted on public.submissions(homework_id, student_id, submitted_at desc);
```

| Index | Phục vụ API | Lý do |
|---|---|---|
| `idx_qb_lesson_id`, `idx_qb_chapter_id` | `question-bank` mọi action | Lọc theo scope `lesson_id`/`chapter_id` (A1) |
| `idx_questions_hw_num` | `homework-detail`, `submit-homework` | Map `question_number → id` khi chấm/nộp |
| `idx_exam_logs_hw_stu_created` | `exam-log` POST, `student-history` | Đếm vi phạm theo phiên; liệt kê log gần nhất |
| `idx_profiles_role_stu` (partial) | `dashboard`, `create-student` | `where role = 'STUDENT'` — partial index nhỏ, quét nhanh |
| `idx_homeworks_created` | `create-homework` GET, `statistics` | Danh sách gần đây, sắp xếp |
| `idx_submissions_hw_stu_submitted` | `submit-homework` (kiểm tra đã nộp), `student-history` | Idempotency + attempts |

### D7. Ghi chú về `or()` với danh sách `IN (…)`

Trong `question-bank` list/stats, câu `.or(...)` được dựng bằng cách nối chuỗi `class_id.in.(...),chapter_id.in.(...)`. Khi số lớp/chương lớn, **độ dài URL** và chi phí parse của PostgREST tăng (đã từng gặp `414 URI Too Long` ở các cấu hình tương tự). Với A1.3 (scope 1 hop + memoize) và D5 (thu gọn cột), rủi ro này giảm đáng kể; nếu vẫn dài, chuyển sang RPC nhận `uuid[]` trong body.

---

## 7. NHÓM E — LUỒNG CHƯA HỢP LÝ

Đây là nhóm **logic**, không phải cú pháp: có những việc hệ thống đang làm mà lẽ ra không cần làm, hoặc làm sai thứ tự.

### 7.1 `login` = 3–4 hop nối tiếp cho học sinh (nên là 1 hop-time)

**Vị trí:** `supabase/functions/login/index.ts:30` (profiles) → `:42` (`auth.admin.getUserById`) → `:50` (`signInWithPassword`) → `:63` (`student_classes`).

**Phát hiện quan trọng:** `create-student` đã dùng **email tổng hợp** `${username.toLowerCase()}@system.local` (`create-student/index.ts:165`) — nhưng `login` lại đi tra `profiles` → `auth.admin.getUserById` **chỉ để lấy lại đúng email theo công thức đó**. Hai round-trip này gần như vô ích với toàn bộ user tạo qua hệ thống.

**Đề xuất (giữ tương thích ngược, không phá user cũ):**

```ts
const syntheticEmail = `${username.toLowerCase()}@system.local`
const svc = createServiceRoleClient()
const anon = createAnonClient()

// 1 hop-time: 3 request độc lập chạy song song
const [signIn, profileRes, classesRes] = await Promise.all([
  anon.auth.signInWithPassword({ email: syntheticEmail, password }),
  svc.from('profiles').select('id, username, full_name, role, class_id').eq('username', username).maybeSingle(),
  svc.from('student_classes').select('class_id').eq('student_id', 'PLACEHOLDER'),   // xem ghi chú bên dưới
])

// Fallback 2 tầng — chỉ trả giá ở nhánh hiếm (admin/legacy user)
if (signIn.error || !signIn.data.session) {
  if (!profileRes.data) return errorResponse('Invalid username or password', 401)
  const { data: authUser } = await svc.auth.admin.getUserById(profileRes.data.id)   // +1 hop
  if (!authUser?.user?.email) return errorResponse('Authentication account mapping error', 500)
  const retry = await anon.auth.signInWithPassword({ email: authUser.user.email, password })  // +1 hop
  if (retry.error || !retry.data.session) return errorResponse('Invalid username or password', 401)
  sessionData = retry.data
}
```

> 🔎 Ghi chú kỹ thuật: `student_classes` cần `profile.id` nên **không thể** song song tuyệt đối ở dạng hiện tại. Hai cách xử lý:
> - **Cách A (1 hop-time, khuyến nghị):** suy ra `student_id` từ JWT trả về của `signInWithPassword` (`session.user.id`) ⇒ query `student_classes` chạy song song được vì không cần chờ `profiles`.
> - **Cách B (giữ 2 hop-time):** chạy `signInWithPassword` song song với `profiles`, rồi query `student_classes` bằng `profile.id`.
>
> Và **bổ sung index/unique** để `profiles.eq('username')` không full scan:
> ```sql
> create unique index if not exists idx_profiles_username on public.profiles(lower(username));
> ```

**Ngoài ra, dọn dẹp ngay:**
- `login/index.ts:24-27`: 3 dòng `console.log` in `SUPABASE_URL` và **prefix của service role key** ⇒ nên xoá (log ồn + lộ thông tin nhạy cảm).
- Trung hạn: lưu cột `profiles.email` để bỏ hẳn fallback và phục vụ cả các luồng forgot-password.

### 7.2 `requireAuth` = 1 hop cho **mọi** request, kể cả API "bắn liên tục"

- Các API trong giờ thi bị gọi rất dày: `exam-session` heartbeat/autosave (10–30s/lần/HS), `exam-log` POST (mỗi lần rời tab / vi phạm). Mỗi lần tốn 1 hop chỉ để đọc lại `profiles` (+ `student_classes`).
- **Sửa gợi ý:** thêm `requireAuthLight()` **chỉ đọc `profiles`** và **chỉ các cột cần thiết** cho 2 endpoint trên (bỏ nhánh `student_classes`), vì chúng không dùng `classIds`.
- **Tuỳ chọn nâng cao:** cache in-isolate `Map<userId, { user, exp }>` TTL 30s. ⚠️ Chỉ bật cho API tần suất cao; **không** bật cho API phân quyền ghi vì role/class sẽ trễ tối đa TTL.

### 7.3 FE — router `await` tuần tự trước khi render

**Vị trí:** `fe/src/js/app.js` (hàm `router`/prefetch, `app.innerHTML = route.render()` sau khi đã `await` xong dữ liệu).

| Route | Call hiện tại (nối tiếp) | Số lần chờ | Sau tối ưu |
|---|---|---|---|
| `#students` | `getClasses` → `getStudents` → (khi lọc) `getStudents?classId` | **3** | `Promise.all([getClasses, getStudents])` = **1**; lọc bằng `state.students` trước, chỉ gọi server khi cần |
| `#classes-admin` | `getClasses` → `getStudents` → `getGradeBlocks` → `class-mgmt.js:642 getStudents()` (trùng lặp) | **3–4** | 1 `Promise.all`; `class-mgmt.js:642` dùng lại `state.students` |
| `#class-details` | `getClasses` → `getStudents` → `getTelegramConfig` | **3** | 1 `Promise.all([getClasses, getStudents, getTelegramConfig])` |
| `#student-details` | `getClasses` → `getStudents` → `getHomeworks` → `getStudentHistory` | **4** | 1 `Promise.all` 4 request + skeleton |
| `#admin-history` | `getClasses` → `loadAdminHistoryData` (`getStudentHistory`) | **2** | song song |
| `#my-classes` | `getClasses` + `getChapters` (đã song song ✅) → `getHomeworks(lessonId)` | **2** | gộp vào `Promise.all` khi đã biết `lessonId` |
| `#exam-room` / `#homework-attempt` | `getHomeworkDetail` → `initExamSession` | **2** | giữ (có phụ thuộc), nhưng tái sử dụng `state.currentHomework` nếu đã có (tiền lệ tốt ở `exam-proctoring.js:76`) |
| `#question-bank` | `getClasses` → `getQuestionBank` → **fan-out `getChapters(classId)` cho từng lớp** (`question-bank.js:464`) | **2 + N** | `Promise.all` + 1 request `getChapters('', true)` rồi lọc ở client (hoặc thêm `?all=true` phía server) ⇒ **1** |

**Hai cải tiến hạ tầng FE kèm theo:**
1. **`api.js`: in-flight dedupe + TTL cache cho GET** (30–60s), invalidate theo tiền tố endpoint khi có mutation ⇒ xoá các call trùng, back/forward tức thì.
2. **Render skeleton trước, hydrate sau** (xem C3) ⇒ giảm mạnh *perceived latency* dù cùng số hop.

### 7.4 `create-homework` PUT — `Promise.all` cho N update

**Vị trí:** `create-homework/index.ts:547` (`Promise.all(questions.map(q => ...update...))`).
- Latency chỉ 1 hop nhưng mở **N kết nối đồng thời**, dễ gây nghẽn pool khi giáo viên sửa đề 40 câu.
- **Sửa:** 1 `upsert(rows, { onConflict: 'id' })` (đã có tiền lệ với `question_answers`) hoặc 1 RPC `fn_replace_questions(homework_id, jsonb)` (transaction: xoá/thêm/sửa trong 1 lượt).

### 7.5 `create-homework` regrade chạy nền — chunk 200 tuần tự

**Vị trí:** `create-homework/index.ts:799` (chunk tuần tự), `:809` (`Promise.all` update từng submission).
- Đã chạy nền bằng `waitUntil` ✅ nên không ảnh hưởng UX; tối ưu khi rảnh: gộp thành 1 RPC `fn_regrade_homework(homework_id, jsonb)` chấm + cập nhật trong DB.

### 7.6 Quan sát nhỏ khác

- `statistics` nhánh `?homeworkId`/`?classId` đã song song ✅ — giữ nguyên.
- `create-student` GET `?classId` đã tối ưu (2 query song song) ✅ — **dùng làm mẫu chuẩn** cho các API còn lại.
- `exam-proctoring.js:76` có nhánh tái sử dụng `state.currentHomework` — **dùng làm mẫu chuẩn** cho FE.

---

## 8. NHÓM F — COLD START & CẤU HÌNH TRIỂN KHAI

### 8.1 `import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'` ở **cả 18 function**

- **Vấn đề:** mọi isolate mới (cold start) phải resolve remote module này; chậm hơn `Deno.serve` built-in và thêm một phụ thuộc mạng có thể fail.
- **Sửa:** đổi sang `Deno.serve(handler)` — **1 dòng/file**, rủi ro gần bằng 0:
  ```ts
  // TRƯỚC
  import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
  serve(async (req: Request) => { ... })
  // SAU (xoá import)
  Deno.serve(async (req: Request) => { ... })
  ```
- **Lợi ích:** giảm thời gian boot/isolate khởi tạo, đúng thứ cần sau khi pin region.

### 8.2 `supabase/config.toml` thiếu entry cho 4 function (⚠️ **rủi ro cao khi deploy**)

`config.toml` hiện khai báo `verify_jwt` cho một số function nhưng **không có** entry cho `refresh-token`, `exam-session`, `exam-log`, `reopen-submission`. Với Supabase CLI, function không khai báo sẽ mặc định `verify_jwt = true` ⇒ **deploy `refresh-token` bằng CLI sẽ làm hỏng luồng refresh token** (FE gọi endpoint này khi access token đã hết hạn nên không thể gửi kèm token hợp lệ).

**Cần thêm trước khi deploy:**
```toml
[functions.refresh-token]
verify_jwt = false

[functions.exam-session]
verify_jwt = true

[functions.exam-log]
verify_jwt = true

[functions.reopen-submission]
verify_jwt = true
```

> ⚠️ **Sửa lại kế hoạch deploy của phiên trước:** **không** dùng `--no-verify-jwt` cho mọi function. Hãy deploy theo `config.toml` (`supabase functions deploy <name>`) để mỗi endpoint giữ đúng mức bảo vệ đã thiết kế. Gateway verify JWT ES256 gần như không thêm latency vì chạy song song lúc boot.

### 8.3 Pin region ở FE

- `fe/src/js/api.js` đã gửi header `x-region` (biến `VITE_SUPABASE_FUNCTION_REGION`) ⇒ giảm 0.16s → ~0.05–0.06s/hop.
- **Trade-off:** mất cơ chế auto-failover của Supabase. Đã ghi nhận; nên ghi rõ trong `README.md`/`HUONG_DAN_SUPABASE.md` và luôn để biến env có thể override.
- **Kiểm tra:** response phải có header `x-sb-edge-region: ap-southeast-2`; nếu không thấy, request đang phục vụ từ region khác (kiểm tra biến env khi build FE).

---

## 9. THỨ TỰ THỰC HIỆN (GIAI ĐOẠN 0 → 3)

### Giai đoạn 0 — Dọn dẹp config & cold start (rủi ro thấp, ~0.5 ngày)

- [ ] 0.1 Thay `import serve` bằng `Deno.serve` ở 18 file `supabase/functions/*/index.ts`.
- [ ] 0.2 Bổ sung 4 entry còn thiếu trong `supabase/config.toml` (§8.2).
- [ ] 0.3 Xoá `console.log` lộ URL/prefix service key tại `login/index.ts:24-27`.
- [ ] 0.4 Migration index mới `20260801000028_perf_indexes.sql` (Phụ lục A).
- [ ] 0.5 Bổ sung `idx_profiles_username` (unique, `lower(username)`) — phục vụ `login` (§7.1).
- **Verify:** deploy + chạy lại `bench-functions.sh`; TTFB 4 endpoint lạnh không tăng; `refresh-token` vẫn hoạt động.

### Giai đoạn 1 — P0: đường đi học sinh (~1–1.5 ngày)

- [ ] 1.1 `submit-homework`: `EdgeRuntime.waitUntil(notifyTask)` + `Promise.all` cho Telegram + gộp ghi submission/answers/session thành 1 RPC (C1, A3).
- [ ] 1.2 `login`: song song hoá + fallback 2 tầng (§7.1).
- [ ] 1.3 `homework-detail`: `Promise.all([requireAuth, fetchHomework])` (B1).
- [ ] 1.4 `exam-log` POST: gom 3 read vào `Promise.all`/RPC; `functions.invoke` → `waitUntil`, trả `autoSubmitted` (C2, A3).
- [ ] 1.5 `exam-session` heartbeat/autosave: 2 hop → 1 (A3, §2 hàng 35–36).
- [ ] 1.6 FE: render skeleton trước + gom `Promise.all` cho 5 route nặng (§7.3) + tái sử dụng `state.currentHomework`.
- **Verify:** đo lại 6 API; kiểm tra thủ công luồng thi → nộp bài (điểm, Telegram đến trễ nhưng vẫn đến), luồng vi phạm tự thu bài.

### Giai đoạn 2 — P1: giáo viên/admin (~1.5 ngày)

- [ ] 2.1 `question-bank`: memoize scope + gộp distribution vào 1 query + `fn_bump_qb_usage` (A1, A2) ⇒ `generate-exam` từ `3+3N` xuống ~2–3 hop.
- [ ] 2.2 RPC hoá `create-homework` POST, `create-student` POST/PUT, `create-class` set-sessions (A3).
- [ ] 2.3 `dashboard`: giới hạn cửa sổ thời gian trước → sau đó RPC `fn_dashboard_overview` (D1).
- [ ] 2.4 `statistics`: thêm `limit`/lọc thời gian cho nhánh mặc định (D2).
- [ ] 2.5 `question-bank` `stats`/`check-availability` → RPC đếm (D3).
- [ ] 2.6 FE: dedupe/TTL cache trong `api.js`, gỡ call trùng `class-mgmt.js:642`, thay fan-out `getChapters` (`question-bank.js:464`) (§7.3).
- **Verify:** `npm run build` bên FE; đo lại các route `#dashboard`, `#question-bank`, `#students`, `#classes-admin`.

### Giai đoạn 3 — P2 (khi có thời gian)

- [ ] 3.1 `import-from-homework`: `prompt_hash` + unique index + `upsert(ignoreDuplicates)` (A4).
- [ ] 3.2 `reopen-submission`, `create-class` cascade (`update-grade-block`, `delete-grade-block`, `remove-student`) → RPC (A3).
- [ ] 3.3 `requireAuthLight` + cache in-isolate TTL 30s cho API tần suất cao (§7.2).
- [ ] 3.4 RPC regrade; `create-homework` PUT → `upsert` bulk (§7.4, §7.5).
- [ ] 3.5 Rà `select('*')` còn lại (Phụ lục C).

---

## 10. KẾ HOẠCH ĐO & NGHIỆM THU

### 10.1 Mở rộng `supabase/scripts/bench-functions.sh`

Bench script hiện chỉ đo vài endpoint. Cần bổ sung:

1. **Đo toàn bộ 18 function** theo fixture cố định (`CLASS_ID`, `LESSON_ID`, `HOMEWORK_ID`, `STUDENT_ID`, `SUBMISSION_ID`, tham số `question-bank`), in bảng `endpoint | hop kỳ vọng | TTFB trước | TTFB sau | Δ`.
2. **Case đặc thù cho N+1:** gọi `action=generate-exam` với `distribution` **5 item** (đo trực tiếp hệ số 3N).
3. **Case hot path khi thi:** `exam-log` POST, `exam-session` `heartbeat`/`autosave` (P0 hiện chưa có trong bench).
4. **Case FE-route:** script gộp nhiều request theo từng route (`#student-details`, `#classes-admin`, `#students`) để thấy lợi ích của `Promise.all` (đo theo *tổng thời gian*, không phải từng request).
5. **Đo cold start:** gọi lần lượt 18 endpoint sau khi để nguội (không gọi trong ~10 phút) và báo cáo TTFB lần đầu vs lần hai (để thấy tác động của §8.1).

### 10.2 Kiểm tra bắt buộc

- [ ] Mỗi endpoint trả header `x-sb-edge-region: ap-southeast-2` (xác nhận pin region có hiệu lực).
- [ ] Smoke test auth (sau khi có verify JWT nội bộ): token hợp lệ / token bị sửa chữ ký / `kid` lạ ⇒ fallback GoTrue / HS256 legacy / token hết hạn ⇒ 401.
- [ ] `refresh-token` gọi được khi access token đã hết hạn (chốt lại §8.2).
- [ ] So sánh kết quả nghiệp vụ trước/sau khi thay RPC: điểm chấm, số câu bốc, số dư attempts, trạng thái session — phải **giống hệt** trên cùng bộ fixture.
- [ ] Kiểm tra không tăng số dòng đã ghi khi chạy lại (idempotency) cho `submit-homework` và `exam-log`.

### 10.3 Bảng kỳ vọng (mô hình 0.16s/hop khi chưa pin; ~0.055s/hop sau pin)

| API / Route | Trước | Sau (dự kiến) | Ghi chú |
|---|---|---|---|
| `login` POST (STUDENT) | ~0.90s (4 hop) | ~0.40–0.45s | 1 hop-time, fallback chỉ ở nhánh hiếm |
| `submit-homework` POST | ~1.2s + tới 3.5s | ~0.45–0.60s | `waitUntil` + 1 RPC |
| `homework-detail` GET | ~0.73s (3 hop) | ~0.45s | song song 2 hop đầu |
| `exam-log` POST | ~0.9–1.5s | ~0.5s | gom read + `waitUntil` |
| `exam-session` heartbeat/autosave | ~0.57s (2 hop) | ~0.30s | 1 hop |
| `question-bank` generate-exam (5 chương) | ~2.4–3.5s | ~0.5–0.7s | memoize + gộp pool + bump 1 hop |
| `question-bank` create-from-selected | ~1.0s + N | ~0.5s | 1 RPC |
| `create-homework` POST | ~1.2s (6 hop) | ~0.5s | 1 RPC |
| `dashboard` GET | ~0.5s (payload lớn) | ~0.4s + payload nhỏ | cửa sổ thời gian → RPC |
| FE route `#student-details` | ~2.0–2.4s (4 call) | ~0.6–0.8s | 1 wait + skeleton |
| FE route `#classes-admin` | ~1.5–1.8s (3–4 call) | ~0.6s | 1 wait, bỏ call trùng |
| FE route `#question-bank` (8 lớp) | 2 + 8 call `getChapters` | ~0.7s | 1 request `getChapters('', true)` |

---

## 11. RỦI RO, TRADE-OFF & CÂU HỎI CẦN XÁC NHẬN

### 11.1 Rủi ro / trade-off

| # | Rủi ro | Mức | Giảm thiểu |
|---|---|---|---|
| 1 | RPC thay chuỗi ghi làm đổi hình dạng lỗi trả về | Trung bình | Map lỗi rõ ràng (`raise exception` với mã riêng → HTTP code như cũ); dùng `security invoker` |
| 2 | `waitUntil` cho Telegram ⇒ thông báo có thể thất bại **sau** khi đã trả response | Thấp | Đã log `console.error`; chấp nhận vì notification không chặn kết quả học tập |
| 3 | Cache GET ở FE (TTL) ⇒ dữ liệu có thể cũ ≤ TTL | Trung bình | Invalidate theo tiền tố endpoint khi mutation + nút "Tải lại" |
| 4 | Cache profile in-isolate ⇒ role/classIds trễ ≤ 30s | Trung bình | Chỉ bật cho API tần suất cao, không bật cho API ghi/phân quyền |
| 5 | Pin region ⇒ mất auto-failover | Thấp | Cho phép override bằng env; ghi rõ trong docs |
| 6 | Migration RPC/index cần `supabase db push` — có thể lệch thứ tự với deploy function | Trung bình | Chạy migration **trước** deploy function; mỗi bước có checklist verify |
| 7 | Thu gọn `select('*')` ⇒ sót cột FE đang dùng | Trung bình | Grep các field FE đọc trước khi sửa; chạy smoke test từng view |

### 11.2 Ba câu hỏi cần bạn xác nhận trước khi thực thi

1. **Có cho phép thêm migration (RPC + index, chạy `supabase db push`) không?** Nếu không, hiệu quả giảm khoảng một nửa vì toàn bộ nhóm A3 mất.
2. **Ưu tiên giai đoạn nào trước:** P0 đường đi học sinh (`login`/`submit-homework`/thi) hay P1 trang quản trị (`dashboard`/`question-bank`/`students`)?
3. **Có chấp nhận cache không?** (a) cache profile 30s trong isolate cho API tần suất cao; (b) cache GET phía FE có TTL + invalidate khi mutation.

---

## 12. PHỤ LỤC A — INDEX CÒN THIẾU (DRAFT SQL)

> **Không đặt file này trực tiếp vào `supabase/migrations/` khi chưa được duyệt.** Đây là draft để review.

```sql
-- supabase/migrations/20260801000028_perf_indexes.sql
-- Mục tiêu: phục vụ các truy vấn trong đường tới hạn P0/P1 (đã đối chiếu 27 migration hiện có)

-- (1) question-bank: lọc theo scope lesson/chapter
--     idx_qb_filter hiện đứng trước bởi subject/grade_level nên không dùng được
create index if not exists idx_qb_lesson_id  on public.question_bank(lesson_id);
create index if not exists idx_qb_chapter_id on public.question_bank(chapter_id);

-- (2) Chấm bài / nộp bài: map question_number -> id
create index if not exists idx_questions_hw_num on public.questions(homework_id, question_number);

-- (3) exam_logs: đếm vi phạm theo phiên + liệt kê log gần nhất
create index if not exists idx_exam_logs_hw_stu_created
  on public.exam_logs(homework_id, student_id, created_at desc);

-- (4) dashboard: đếm học sinh theo role (partial index nhỏ)
create index if not exists idx_profiles_role_stu on public.profiles(role) where role = 'STUDENT';

-- (5) login + tra cứu username không phân biệt hoa thường
create unique index if not exists idx_profiles_username on public.profiles(lower(username));

-- (6) Danh sách homework gần đây (create-homework GET, statistics)
create index if not exists idx_homeworks_created on public.homeworks(created_at desc);

-- (7) submit-homework (kiểm tra đã nộp) + student-history
create index if not exists idx_submissions_hw_stu_submitted
  on public.submissions(homework_id, student_id, submitted_at desc);

-- (8) [Giai đoạn 3] chống trùng khi import-from-homework
-- alter table public.question_bank add column if not exists prompt_hash text;
-- create unique index if not exists idx_qb_prompt_hash
--   on public.question_bank(prompt_hash) where prompt_hash is not null;
```

> **Lưu ý vận hành:** `create index` (không `concurrently`) sẽ khoá ghi bảng trong lúc build. Với bảng lớn (`question_bank`, `exam_logs`, `submissions`), cân nhắc `create index concurrently` (chạy ngoài transaction, không dùng trong file migration có nhiều statement) hoặc chạy vào khung giờ ít sử dụng.

---

## 13. PHỤ LỤC B — KHUNG RPC ĐỀ XUẤT (DRAFT SQL)

> **Chưa xác nhận tên cột/bảng chi tiết 100%** — đây là khung để review; khi thực thi sẽ đối chiếu lại với schema trong `supabase/migrations/*` trước khi viết bản cuối.
> **Nguyên tắc chung:** dùng `security invoker` (chỉ service-role gọi), `returns jsonb` để giữ nguyên hình dạng response hiện tại, và **gộp toàn bộ chuỗi ghi trong 1 transaction** để bỏ code rollback thủ công.

### B.1 `fn_bump_qb_usage` — tăng `usage_count` không N+1

```sql
create or replace function public.fn_bump_qb_usage(p_ids uuid[])
returns integer
language sql
security invoker
as $$
  update public.question_bank
     set usage_count = coalesce(usage_count, 0) + 1
   where id = any(p_ids)
  returning 1;
$$;
```
Thay thế 2 vòng lặp: `question-bank/index.ts:897` (generate-exam) và `:1081` (create-from-selected).
**Lợi ích phụ:** atomic ⇒ hết bug lost-update khi 2 giáo viên bốc đề đồng thời.

### B.2 `fn_submit_homework` — gộp 3 ghi thành 1 transaction

```sql
create or replace function public.fn_submit_homework(
  p_homework_id uuid,
  p_student_id  uuid,
  p_class_id    uuid,
  p_session_id  uuid,
  p_score       numeric,
  p_raw_score   numeric,
  p_answers     jsonb     -- [{question_id, student_answer, is_correct, points_awarded}]
) returns jsonb
language plpgsql
security invoker
as $$
declare v_submission_id uuid; v_submitted_at timestamptz := now();
begin
  insert into public.submissions (homework_id, student_id, class_id, score, raw_score, submitted_at)
  values (p_homework_id, p_student_id, p_class_id, p_score, p_raw_score, v_submitted_at)
  returning id into v_submission_id;

  insert into public.submission_answers (submission_id, question_id, student_answer, is_correct, points_awarded)
  select v_submission_id, (a->>'question_id')::uuid, a->>'student_answer',
         coalesce((a->>'is_correct')::boolean, false), coalesce((a->>'points_awarded')::numeric, 0)
    from jsonb_array_elements(p_answers) a;

  update public.exam_sessions
     set status = 'SUBMITTED', submitted_at = v_submitted_at
   where id = p_session_id;

  return jsonb_build_object('submissionId', v_submission_id, 'submittedAt', v_submitted_at);
end $$;
```

### B.3 `fn_create_homework_from_bank` — dùng cho `create-homework` POST va `question-bank` create-from-selected / generate-exam

```sql
create or replace function public.fn_create_homework_from_bank(
  p_homework jsonb,      -- payload homeworks (không cần id)
  p_questions jsonb,     -- [{question_number, question_type, prompt, content, options, statements, part_title, points}]
  p_answers  jsonb,      -- [{question_number, mc_answer, tf_answers, sa_answer, sa_tolerance, explanation}]
  p_bank_ids uuid[],     -- nếu tạo từ ngân hàng: tăng usage_count luôn trong cùng transaction
  p_sync_bank boolean default false
) returns jsonb
language plpgsql
security invoker
as $$
declare v_hw_id uuid; v_questions jsonb;
begin
  insert into public.homeworks (lesson_id, title, pdf_path, duration_minutes, pass_score, max_score,
                                is_published, deadline, max_attempts, type, max_violations, show_solutions)
  select (p_homework->>'lesson_id')::uuid, p_homework->>'title', p_homework->>'pdf_path',
         (p_homework->>'duration_minutes')::int, (p_homework->>'pass_score')::numeric,
         (p_homework->>'max_score')::numeric, coalesce((p_homework->>'is_published')::boolean, false),
         nullif(p_homework->>'deadline','')::timestamptz, (p_homework->>'max_attempts')::int,
         coalesce(p_homework->>'type','PRACTICE'), coalesce((p_homework->>'max_violations')::int, 3),
         coalesce((p_homework->>'show_solutions')::boolean, true)
  returning id into v_hw_id;

  with ins as (
    insert into public.questions (homework_id, question_number, question_type, prompt, content,
                                  options, statements, part_title, points)
    select v_hw_id, (q->>'question_number')::int, q->>'question_type', q->>'prompt', q->>'content',
           q->'options', q->'statements', q->>'part_title', (q->>'points')::numeric
      from jsonb_array_elements(p_questions) q
    returning id, question_number
  )
  select jsonb_agg(jsonb_build_object('id', id, 'question_number', question_number)) into v_questions from ins;

  insert into public.question_answers (question_id, mc_answer, tf_answers, sa_answer, sa_tolerance, explanation)
  select (v->>'id')::uuid, a->>'mc_answer', a->'tf_answers', a->>'sa_answer',
         coalesce((a->>'sa_tolerance')::numeric, 0), a->>'explanation'
    from jsonb_array_elements(v_questions) v
    join jsonb_array_elements(p_answers) a
      on (a->>'question_number')::int = (v->>'question_number')::int;

  if p_bank_ids is not null and array_length(p_bank_ids, 1) > 0 then
    update public.question_bank set usage_count = coalesce(usage_count,0) + 1 where id = any(p_bank_ids);
  end if;

  -- p_sync_bank: chèn bản sao vào question_bank (tương đương khối try/catch hiện tại ở create-homework:337-429)

  return jsonb_build_object('homeworkId', v_hw_id, 'questions', v_questions);
end $$;
```

### B.4 `fn_create_student_profile` + `fn_sync_student_classes`

```sql
-- Gọi SAU khi auth.admin.createUser() thành công (GoTrue không thể nằm trong transaction của Postgres)
create or replace function public.fn_create_student_profile(
  p_student_id uuid, p_username text, p_full_name text, p_class_ids uuid[]
) returns jsonb
language plpgsql security invoker as $$
declare v_profile jsonb;
begin
  insert into public.profiles (id, username, full_name, role, class_id)
  values (p_student_id, p_username, p_full_name, 'STUDENT', p_class_ids[1])
  returning to_jsonb(profiles.*) into v_profile;

  insert into public.student_classes (student_id, class_id)
  select p_student_id, cid from unnest(p_class_ids) cid
  on conflict do nothing;

  return v_profile;
end $$;

create or replace function public.fn_sync_student_classes(p_student_id uuid, p_class_ids uuid[])
returns void language sql security invoker as $$
  delete from public.student_classes where student_id = p_student_id;
  insert into public.student_classes (student_id, class_id)
  select p_student_id, cid from unnest(p_class_ids) cid on conflict do nothing;
$$;
```

### B.5 `fn_exam_heartbeat` — heartbeat/autosave trong 1 hop

> Cách đơn giản nhất **không cần RPC**: gộp kiểm tra token vào chính câu update.

```ts
// exam-session/index.ts (thay khối :147-168)
const { data: updated, error } = await serviceRoleClient
  .from('exam_sessions')
  .update({ last_heartbeat_at: new Date().toISOString() })
  .eq('homework_id', homeworkId)
  .eq('student_id', user.id)
  .eq('session_token', sessionToken)      // token sai ⇒ 0 row, không cần query kiểm tra riêng
  .select('id')
  .maybeSingle()

if (error) return errorResponse('Failed to update heartbeat', 500)
if (!updated) return errorResponse('Invalid session token', 403)
```

### B.6 `fn_set_class_sessions`, `fn_set_student_sessions`, `fn_remove_student_from_class`, `fn_rename_grade_block`

```sql
create or replace function public.fn_set_class_sessions(p_class_id uuid, p_session_nos int[])
returns void language sql security invoker as $$
  delete from public.class_sessions where class_id = p_class_id;
  insert into public.class_sessions (class_id, session_no)
  select p_class_id, s from unnest(p_session_nos) s on conflict do nothing;
$$;

create or replace function public.fn_remove_student_from_class(p_student_id uuid, p_class_id uuid)
returns jsonb language plpgsql security invoker as $$
declare v_remaining uuid[];
begin
  delete from public.student_classes where student_id = p_student_id and class_id = p_class_id;
  select array_agg(class_id) into v_remaining from public.student_classes where student_id = p_student_id;
  update public.profiles
     set class_id = coalesce(v_remaining[1], null), updated_at = now()
   where id = p_student_id and role = 'STUDENT';
  return jsonb_build_object('remainingClassIds', coalesce(v_remaining, '{}'::uuid[]));
end $$;

create or replace function public.fn_rename_grade_block(p_old text, p_new text, p_class_id uuid)
returns jsonb language plpgsql security invoker as $$
begin
  if exists (select 1 from public.grade_blocks where name = p_new) then
    raise exception 'GRADE_BLOCK_EXISTS' using errcode = '23505';
  end if;
  update public.grade_blocks set name = p_new where name = p_old;
  update public.classes set grade_block = p_new where grade_block = p_old and (p_class_id is null or id = p_class_id);
  update public.question_bank set grade_block = p_new where grade_block = p_old;   -- trigger trg_sync_qb_grade_block có thể làm phần này
  return jsonb_build_object('renamed', true);
end $$;
```

### B.7 `fn_qb_availability` — thay `stats` / `check-availability`

```sql
create or replace function public.fn_qb_availability(
  p_grade_block text, p_class_ids uuid[], p_chapter_ids uuid[], p_lesson_id uuid default null
) returns jsonb language sql security invoker as $$
  with scoped as (
    select question_type, difficulty, chapter_id, lesson_id, grade_block
      from public.question_bank
     where (p_grade_block is null or grade_block = p_grade_block)
       and (p_class_ids is null   or class_id   = any(p_class_ids))
       and (p_chapter_ids is null or chapter_id = any(p_chapter_ids))
       and (p_lesson_id is null   or lesson_id  = p_lesson_id)
  )
  select jsonb_build_object(
    'total', (select count(*) from scoped),
    'multipleChoice', (select count(*) from scoped where question_type = 'MULTIPLE_CHOICE'),
    'trueFalse',      (select count(*) from scoped where question_type = 'TRUE_FALSE'),
    'shortAnswer',    (select count(*) from scoped where question_type = 'SHORT_ANSWER'),
    'byChapter', (select coalesce(jsonb_object_agg(chapter_id, c), '{}'::jsonb)
                    from (select chapter_id, count(*) c from scoped group by chapter_id) t),
    'byLesson',  (select coalesce(jsonb_object_agg(lesson_id, c), '{}'::jsonb)
                    from (select lesson_id, count(*) c from scoped group by lesson_id) t),
    'byDifficulty', (select coalesce(jsonb_object_agg(difficulty, c), '{}'::jsonb)
                    from (select difficulty, count(*) c from scoped group by difficulty) t)
  );
$$;
```

### B.8 `fn_dashboard_overview` — thay 8 query + aggregate JS

```sql
create or replace function public.fn_dashboard_overview(p_months int default 6)
returns jsonb language sql security invoker as $$
  with cutoff as (select now() - (p_months || ' months')::interval as ts),
  subs as (
    select s.* from public.submissions s, cutoff c where s.submitted_at >= c.ts
  ),
  overview as (
    select jsonb_build_object(
      'totalStudents',  (select count(*) from public.profiles where role = 'STUDENT'),
      'totalSubmissions', (select count(*) from subs),
      'avgScore', (select round(coalesce(avg(score),0), 2) from subs)
    ) as v
  ),
  monthly as (
    select coalesce(jsonb_agg(jsonb_build_object('month', m, 'count', c) order by m), '[]'::jsonb) v
      from (select to_char(submitted_at, 'YYYY-MM') m, count(*) c from subs group by 1) t
  ),
  dist as (
    select coalesce(jsonb_agg(jsonb_build_object('bucket', b, 'count', c) order by b), '[]'::jsonb) v
      from (select width_bucket(score, 0, 10, 10) b, count(*) c from subs group by 1) t
  )
  select jsonb_build_object(
    'overview', (select v from overview),
    'monthlyStats', (select v from monthly),
    'scoreDistribution', (select v from dist)
  );
$$;
```

### B.9 `fn_scope_targets` — 1 hop thay cho 2 hop của `getScopeTargetIds`

```sql
create or replace function public.fn_scope_targets(p_grade_block text)
returns jsonb language sql security invoker as $$
  select jsonb_build_object(
    'classIds',   coalesce(jsonb_agg(distinct c.id), '[]'::jsonb),
    'chapterIds', coalesce(jsonb_agg(distinct ch.id) filter (where ch.id is not null), '[]'::jsonb)
  )
  from public.classes c
  left join public.chapters ch on ch.class_id = c.id
  where c.grade_block = p_grade_block;
$$;
```
> Nếu **không** muốn thêm RPC, có thể thay bằng 1 truy vấn embedding: `svc.from('classes').select('id, chapters(id)').eq('grade_block', gb)` — cùng hiệu quả 1 hop, không cần migration.

---

## 14. PHỤ LỤC C — DANH SÁCH `select('*')` CẦN THU GỌN

| # | Vị trí | Ngữ cảnh | Cột thực sự cần | Ưu tiên |
|---|---|---|---|---|
| 1 | `question-bank/index.ts:701` | Pool bốc câu cho generate-exam | `id, question_type, chapter_id, lesson_id, usage_count` (prompt chỉ cần cho `pickedIds`) | **P0** |
| 2 | `question-bank/index.ts:749` | Pool cho create-from-selected | như trên | **P0** |
| 3 | `question-bank/index.ts:926` | Pool cho swap-question | như trên | P1 |
| 4 | `question-bank/index.ts:995` | Trả về sau khi insert/tạo | Cột FE dùng trong `question-bank.js` | P1 |
| 5 | `question-bank/index.ts:1133` | Query chi tiết câu hỏi | Cột theo nhu cầu view | P1 |
| 6 | `question-bank/index.ts:1177` | Trả về sau update | Cột FE dùng | P1 |
| 7 | `create-class/index.ts:28` | Danh sách lớp | `id, name, grade_block, created_at` | P1 |
| 8 | `create-class/index.ts:39` | Đếm/ngân hàng theo khối | chỉ `grade_block` | P1 |
| 9 | `create-class/index.ts:146` | Chi tiết lớp | Cột dùng ở `class-details.js` | P2 |
| 10 | `create-class/index.ts:419` | Kiểm tra tồn tại | `id` | P2 |
| 11 | `create-lesson/index.ts:112` | Danh sách bài học | `id, title, order_index, …` theo view | P2 |
| 12 | `exam-session/index.ts:68` | Kiểm tra session | `id, session_token, status, started_at` | P1 |

**Quy trình an toàn:** trước khi sửa mỗi dòng, `grep` field mà view tương ứng đọc (ví dụ `question-bank.js` dùng `q.prompt`/`q.options`) để chắc chắn không cắt nhầm; sau đó chạy smoke test view đó.

---

## 15. PHỤ LỤC D — ƯU TIÊN & ƯỚC TÍNH LỢI ÍCH

### D.1 Bảng ưu tiên theo ROI (lợi ích ÷ công sức)

| Thứ tự | Hạng mục | Công sức | Lợi ích | Rủi ro | Nên làm ngay? |
|---|---|---|---|---|---|
| 1 | `submit-homework` bỏ chặn 3.5s + `Promise.all` Telegram (C1) | Rất thấp | Rất cao | Thấp | ✅ |
| 2 | Gom `Promise.all` cho 5 route FE nặng (§7.3) + skeleton (C3) | Thấp | Rất cao | Thấp | ✅ |
| 3 | `homework-detail` song song hoá (`requireAuth` ‖ fetch) (B1) | Rất thấp | Cao | Rất thấp | ✅ |
| 4 | `login` song song hoá + fallback (§7.1) | Thấp | Rất cao | Thấp | ✅ |
| 5 | `exam-session` heartbeat/autosave 2 hop → 1 (B5/§8) | Rất thấp | Cao (giờ thi) | Rất thấp | ✅ |
| 6 | `question-bank` memoize scope (A1.1) | Rất thấp | Cao | Rất thấp | ✅ |
| 7 | `config.toml` + `Deno.serve` + xoá log (§8.1, §8.2) | Thấp | Trung bình (ổn định) | Thấp | ✅ |
| 8 | `exam-log` gom read + `waitUntil` invoke (B4, C2) | Thấp | Cao | Thấp | ✅ |
| 9 | Migration index (Phụ lục A) | Thấp | Trung bình | Thấp | ✅ |
| 10 | RPC gộp chuỗi ghi (A3) | Trung bình | Cao | Trung bình | Ưu tiên sau khi 1–9 xong |
| 11 | `question-bank` gộp pool + `fn_bump_qb_usage` (A1.2, A2) | Trung bình | Cao | Trung bình | Sau khi 1–9 xong |
| 12 | `dashboard`/`statistics`/`stats` → RPC aggregate (D1–D3) | Trung bình | Trung bình | Trung bình | Sau |
| 13 | FE dedupe/TTL cache (§7.3) | Trung bình | Trung bình | Trung bình | Sau |
| 14 | `requireAuthLight` + cache profile (§7.2) | Trung bình | Trung bình | Trung bình | Sau |
| 15 | `prompt_hash`, regrade RPC, cascade RPC (A4, §7.5) | Trung bình | Thấp–TB | Thấp | Khi rảnh |

### D.2 Ba điều **không** nên làm

1. **Không** chuyển FE sang gọi PostgREST trực tiếp cho các trang nặng: RLS/policy hiện đã bật cho nhiều bảng, nhưng quy tắc nghiệp vụ (chấm điểm, chống trùng, phân quyền lớp) nằm trong function — chuyển sẽ phải viết lại policy rất rộng và mở thêm bề mặt lộ dữ liệu (đặc biệt `sa_answer`, `explanation`).
2. **Không** deploy đồng loạt bằng `--no-verify-jwt` (đã nêu ở §8.2).
3. **Không** tăng `compute`/memory của function trước khi hết nhóm B/C — tiền không mua được round-trip.

### D.3 Điều kiện tiên quyết trước khi bắt đầu Giai đoạn 1

- [ ] Xác nhận 12 file đang `modified`/untracked (auth-middleware, supabase-client, response-helper, validators, create-student, refresh-token, FE `api.js`/`app.js`/`student-mgmt.js`, `.env.example`, `HUONG_DAN_SUPABASE.md`, `supabase/scripts/`) được commit trước, để diff của đợt tối ưu này sạch và dễ review.
- [ ] Chốt 3 câu hỏi ở §11.2.
- [ ] Có bộ fixture test (1 lớp + 3 học sinh + 1 bài tập + 1 đề thi) để chạy bench và so sánh trước/sau.

---

## PHỤ LỤC CUỐI — NGUỒN THAM CHIẾU TRONG REPO

| Nội dung | Đường dẫn |
|---|---|
| Functions | `supabase/functions/<name>/index.ts` (18 file) |
| Auth/verify JWT | `supabase/shared/auth-middleware.ts` |
| Client Supabase | `supabase/shared/supabase-client.ts` |
| CORS/response | `supabase/shared/response-helper.ts` |
| Validate input | `supabase/shared/validators.ts` |
| Migration index | `supabase/migrations/20260801000027_optimize_performance_indexes.sql` |
| Migration RLS | `supabase/migrations/20260801000013_enable_rls_policies.sql` |
| Bench script | `supabase/scripts/bench-functions.sh` |
| Cấu hình function | `supabase/config.toml` |
| FE API client | `fe/src/js/api.js` |
| FE router/prefetch | `fe/src/js/app.js` |
| FE views | `fe/src/js/views/*.js` (18 file) |

---

*Tài liệu được tạo trong chế độ read-only; chưa có dòng mã nguồn nào bị thay đổi. Mọi số liệu `hop`/`TTFB` là ước lượng theo mô hình §1.2 và cần được xác nhận lại bằng `bench-functions.sh` sau khi deploy.*
