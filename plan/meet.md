# KẾ HOẠCH TRIỂN KHAI TÍCH HỢP GOOGLE MEET & AUTO-RECORDING
*(Tài liệu chuẩn hóa dành cho AI Developer triển khai)*

Tài liệu này là blueprint chi tiết để một AI có thể đọc và trực tiếp code tích hợp Google Meet vào hệ thống.

---

## 1. Cấu trúc Database (Supabase Migrations)

**Tệp tin tham chiếu:** `supabase/migrations/20261006080443_create_meet_integration.sql` *(Đã được khởi tạo)*

**Nhiệm vụ của AI:**
Đảm bảo migration file có cấu trúc bảng chính xác như sau để phục vụ việc tự động điền link video vào lesson.

```sql
create table public.meeting_sessions (
  id            uuid primary key default gen_random_uuid(),
  lesson_id     uuid references public.lessons(id) on delete set null, -- Cực kỳ quan trọng: Liên kết với bài học
  space_name    text not null unique,          -- "spaces/xxxx" (khoá map Meet API)
  meeting_uri   text not null,                 -- Link tham gia Meet
  meeting_code  text,                          
  title         text,
  created_by    uuid references auth.users(id),
  created_at    timestamptz not null default now(),
  status        text not null default 'PENDING'
                check (status in ('PENDING','READY','NO_RECORDING','EXPIRED','ERROR')),
  last_synced_at timestamptz,
  last_error    text
);

create table public.meeting_recordings (
  id                uuid primary key default gen_random_uuid(),
  session_id        uuid not null references public.meeting_sessions(id) on delete cascade,
  recording_name    text not null unique,      -- "conferenceRecords/../recordings/.."
  conference_record text not null,
  state             text not null,             -- ENDED | FILE_GENERATED | ...
  start_time        timestamptz,
  end_time          timestamptz,
  drive_file_id     text,
  drive_url         text,                      -- exportUri (Link xem video)
  fetched_at        timestamptz not null default now()
);

-- Index phục vụ quét hàng loạt bằng cron job
create index meeting_sessions_status_idx on public.meeting_sessions (status, last_synced_at);
create index meeting_recordings_session_id_idx on public.meeting_recordings (session_id);

alter table public.meeting_sessions enable row level security;
alter table public.meeting_recordings enable row level security;

create policy "admin read sessions" on public.meeting_sessions for select using (public.is_admin());
create policy "admin read recordings" on public.meeting_recordings for select using (public.is_admin());
```

---

## 2. Phát triển Supabase Edge Functions

AI cần tạo 3 file TypeScript chính trong thư mục `supabase/functions/`.

### 2.1. Module gọi API của Google
**Đường dẫn:** `supabase/functions/_shared/google.ts`
**Nhiệm vụ:**
- Xin cấp lại `access_token` từ `refresh_token` qua endpoint `https://oauth2.googleapis.com/token`.
- Wrap các fetch calls (như `POST /v2/spaces` và `GET /v2/conferenceRecords`).
- **Chú ý:** Phải xử lý logic tự động gộp phân trang (Pagination) thông qua `pageToken` của Google Meet REST API.

### 2.2. Function: Tạo Link Meet (`meet-create`)
**Đường dẫn:** `supabase/functions/meet-create/index.ts`
**Method:** `POST`

**Thuật toán AI cần triển khai:**
1. Handle CORS config (Dùng `_shared/cors.ts`).
2. Xác thực JWT User, chặn request nếu role không phải Admin.
3. Parse body request để lấy `{ lesson_id, title }`.
4. Gọi `getAccessToken()` lấy token Google.
5. Gọi `POST https://meet.googleapis.com/v2/spaces` với body `{ "config": { "accessType": "TRUSTED" } }`.
6. Insert dữ liệu trả về (gồm `name` và `meetingUri`) vào bảng `meeting_sessions`. Chú ý gán `lesson_id = body.lesson_id`.
7. Trả về HTTP 200: `{ "success": true, "meeting_uri": "...", "session_id": "..." }`.

### 2.3. Function: Đồng bộ Bản Ghi Ngầm (`meet-sync`)
**Đường dẫn:** `supabase/functions/meet-sync/index.ts`
**Method:** `POST`

**Thuật toán AI cần triển khai:**
1. **Xác thực bảo mật:** Đọc header `x-cron-secret` xem có khớp với secret môi trường không.
2. Truy vấn ra tối đa **20 sessions** từ bảng `meeting_sessions` nơi `status = 'PENDING'`, ưu tiên quét các session có `last_synced_at` cũ nhất.
3. Lặp qua các sessions, dùng `space_name` lọc API: `GET /v2/conferenceRecords?filter=space.name="spaces/xxxx"`.
4. Với mỗi conference record, lấy danh sách `recordings`.
5. **Điều kiện chốt (Quan trọng):** Nếu recording có `state === 'FILE_GENERATED'` và object `driveDestination.file` không rỗng:
   - Dùng `supabase-js` (service_role) thực hiện UPSERT vào `meeting_recordings`.
   - Đổi `status` của session tương ứng thành `READY`.
   - **TỰ ĐỘNG GẮN BÀI HỌC:** Lấy giá trị `driveDestination.exportUri` và update vào cột `video_url` của bảng `lessons` dựa trên khóa `lesson_id`.
     ```typescript
     await supabase.from('lessons')
       .update({ video_url: recording.driveDestination.exportUri })
       .eq('id', session.lesson_id);
     ```
6. Update mốc thời gian `last_synced_at` thành hiện tại.
7. Xử lý timeout/quá hạn: Nếu sau 7 ngày không có conference record, đổi trạng thái session thành `EXPIRED`.

### 2.4. Chế độ thủ công: Đồng bộ ngay (không đợi cron)
Cùng endpoint `meet-sync`, nhưng request kèm JWT admin (thay vì `x-cron-secret`) + body `{ lesson_id }` (hoặc `{ session_id }`):
- Xác thực `requireAdmin`, chỉ quét đúng 1 session mới nhất của bài học.
- Không gửi Telegram (UI đã báo trực tiếp qua `outcome`: `READY` / `PENDING` / `EXPIRED` / `ERROR`).
- Logic quét 1 session dùng chung hàm `syncSingleSession` với luồng cron.

---

## 3. Cấu Hình Cron Job (Chỉ chạy khi lên Cloud)

**Mô tả:** AI cần hiểu rằng luồng polling sẽ diễn ra thông qua tính năng `pg_cron` gọi webhook của `pg_net` tới endpoint `meet-sync`. AI có thể hỗ trợ tạo SQL snippet để setup:

```sql
select vault.create_secret('<Mã ngẫu nhiên CRON_SECRET>', 'meet_cron_secret');

select cron.schedule(
  'meet-sync-job',
  '0 2 * * *', -- Lượt chính 2h00 (múi giờ DB, mặc định UTC)
  $$
  select net.http_post(
    url := 'https://<PROJECT_REF>.supabase.co/functions/v1/meet-sync',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'x-cron-secret', (select decrypted_secret from vault.decrypted_secrets where name = 'meet_cron_secret')
    )
  );
  $$
);
-- 2 lượt vét 2h20, 2h40 để thử lại nếu lượt trước lỗi:
select cron.schedule('meet-sync-retry-1', '20 2 * * *', $$ select net.http_post(url := 'https://<PROJECT_REF>.supabase.co/functions/v1/meet-sync', headers := jsonb_build_object('Content-Type', 'application/json', 'x-cron-secret', (select decrypted_secret from vault.decrypted_secrets where name = 'meet_cron_secret'))) $$);
select cron.schedule('meet-sync-retry-2', '40 2 * * *', $$ select net.http_post(url := 'https://<PROJECT_REF>.supabase.co/functions/v1/meet-sync', headers := jsonb_build_object('Content-Type', 'application/json', 'x-cron-secret', (select decrypted_secret from vault.decrypted_secrets where name = 'meet_cron_secret'))) $$);
```

---

## 4. Cập Nhật UI (Frontend Vanilla JS)

**Đường dẫn:** `fe/src/js/views/curriculum.js` (Khu vực render Master-Detail)

**Nhiệm vụ Front-End AI:**
1. **API Layer:** Thêm hàm `createMeetSession(lessonId, title)` vào API wrapper.
2. **UI Của Bài Học (`renderLessonDetail`):**
   - Query thêm trạng thái của session qua Supabase Client: `supabase.from('meeting_sessions').select('*').eq('lesson_id', lesson.id)`.
   - **Scenario 1 - Chưa có Meet:** Hiển thị một Action Button cực bắt mắt: `📹 Tạo buổi học Google Meet`. Bấm vào sẽ gọi `meet-create` và mở tab mới sang Meet.
   - **Scenario 2 - Đã tạo Meet, chờ Video:** Không hiển thị khung Plyr video (do video_url đang rỗng hoặc null). Hiển thị một Card Info chứa nút tham gia Meet (`meeting_uri`) và thẻ Badge: *"Đang đợi đồng bộ bản ghi từ Google Drive..."*
   - **Scenario 3 - Hoàn tất:** Dữ liệu video đã có ở `video_url` trong bài học (do job `meet-sync` đổ vào). Giao diện đổ player Plyr như luồng truyền thống. Có thể bổ sung nút lịch sử để xem gốc link Google Drive nếu cần.

---

## 5. Setup Keys (Yêu cầu con người tham gia)

*Phần này AI không thể code tự động được mà phải hướng dẫn người dùng chạy CLI:*
```bash
supabase secrets set GOOGLE_CLIENT_ID="<client_id>"
supabase secrets set GOOGLE_CLIENT_SECRET="<client_secret>"
supabase secrets set GOOGLE_REFRESH_TOKEN="<lấy_từ_oauth_playground>"
supabase secrets set CRON_SECRET="<chuỗi_bảo_vệ_webhook_tự_nghĩ>"
```

---
*Nếu một AI Developer nhận được file này, hãy bắt tay ngay vào tạo folder `supabase/functions/_shared` và `meet-create`.*
