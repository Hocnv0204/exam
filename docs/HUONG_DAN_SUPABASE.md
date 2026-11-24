# HƯỚNG DẪN CHẠY LOCAL VÀ QUY TRÌNH DEPLOY SUPABASE

> **Tài liệu dự án:** Hệ thống Quản lý và Tổ chức Thi / Bài tập Trực tuyến (**Online Homework Management System**)  
> **Công nghệ Backend:** Supabase (PostgreSQL 15+, Supabase Auth, Storage, Deno Edge Functions)  
> **Công nghệ Frontend:** Vanilla JS + Vite (`fe/`)

---

## MỤC LỤC

1. [Kiến Trúc & Thành Phần Supabase Trong Dự Án](#1-kiến-trúc--thành-phần-supabase-trong-dự-án)
2. [Phần I: Hướng Dẫn Chạy Supabase Ở Local](#phần-i-hướng-dẫn-chạy-supabase-ở-local)
   - [1.1. Yêu cầu môi trường (Prerequisites)](#11-yêu-cầu-môi-trường-prerequisites)
   - [1.2. Khởi động cụm Supabase Local](#12-khởi-động-cụm-supabase-local)
   - [1.3. Đồng bộ Database Migrations & Seed Data](#13-đồng-bộ-database-migrations--seed-data)
   - [1.4. Chạy & Debug Edge Functions ở Local](#14-chạy--debug-edge-functions-ở-local)
   - [1.5. Khởi chạy Frontend kết nối Local](#15-khởi-chạy-frontend-kết-nối-local)
   - [1.6. Quy trình tạo mới Migration khi phát triển tính năng](#16-quy-trình-tạo-mới-migration-khi-phát-triển-tính-năng)
3. [Phần II: Quy Trình Deploy Lên Supabase Cloud](#phần-ii-quy-trình-deploy-lên-supabase-cloud)
   - [2.1. Chuẩn bị dự án trên Supabase Cloud](#21-chuẩn-bị-dự-án-trên-supabase-cloud)
   - [2.2. Đăng nhập CLI và liên kết dự án (Link Project)](#22-đăng-nhập-cli-và-liên-kết-dự-án-link-project)
   - [2.3. Đẩy Database Migrations & Storage Policies](#23-đẩy-database-migrations--storage-policies)
   - [2.4. Cấu hình Secrets (Biến môi trường) trên Cloud](#24-cấu-hình-secrets-biến-môi-trường-trên-cloud)
   - [2.5. Deploy các Supabase Edge Functions](#25-deploy-các-supabase-edge-functions)
   - [2.5.1. Hiệu năng Edge Functions (BẮT BUỘC pin region)](#251-hiệu-năng-edge-functions-bắt-buộc-pin-region)
   - [2.6. Khởi tạo tài khoản Administrator trên Cloud](#26-khởi-tạo-tài-khoản-administrator-trên-cloud)
   - [2.7. Cấu hình Telegram Webhook](#27-cấu-hình-telegram-webhook)
   - [2.8. Build & Deploy Frontend](#28-build--deploy-frontend)
4. [Phần III: Xử Lý Sự Cố Thường Gặp (Troubleshooting)](#phần-iii-xử-lý-sự-cố-thường-gặp-troubleshooting)
5. [Phần IV: Bảng Tra Cứu Nhanh Lệnh CLI (Cheat Sheet)](#phần-iv-bảng-tra-cứu-nhanh-lệnh-cli-cheat-sheet)

---

## 1. Kiến Trúc & Thành Phần Supabase Trong Dự Án

Hệ thống backend của dự án sử dụng toàn diện các dịch vụ của Supabase:

- **Database (PostgreSQL 15+)**: Chứa 28 migration files quản lý toàn bộ cấu trúc bảng (`classes`, `chapters`, `lessons`, `homeworks`, `questions`, `question_answers`, `submissions`, `question_bank`, `grade_blocks`,...), chỉ mục hiệu năng (indexes) và chính sách bảo mật cấp hàng (RLS Policies).
- **Supabase Auth**: Quản lý tài khoản đăng nhập (Admin & Học sinh). Học sinh dùng username tổng hợp qua `auth.users` và metadata hồ sơ lưu tại `public.profiles`.
- **Supabase Storage**: Bucket `pdf-files` dùng lưu trữ đề bài/tài liệu PDF, bảo vệ truy cập qua Storage RLS policies và cấp Signed URLs.
- **Edge Functions (Deno TypeScript)**: Gồm **18 micro-functions** xử lý đăng nhập, chấm điểm, nộp bài, giám sát phòng thi, webhook Telegram bot, thống kê dashboard:
  - `login`, `refresh-token`, `reset-password`
  - `create-student`, `create-class`, `create-chapter`, `create-lesson`, `create-homework`
  - `homework-detail`, `submit-homework`, `reopen-submission`, `student-history`
  - `dashboard`, `statistics`, `question-bank`
  - `exam-session`, `exam-log`, `telegram-bot`

---

## PHẦN I: HƯỚNG DẪN CHẠY SUPABASE Ở LOCAL

### 1.1. Yêu cầu môi trường (Prerequisites)

Trước khi bắt đầu, máy tính của bạn cần cài đặt:

1. **Docker Desktop** (hoặc Docker Engine trên Linux):
   - Đảm bảo Docker đang chạy:
     ```bash
     docker ps
     ```
2. **Node.js** (Khuyến nghị phiên bản 18.x hoặc 20.x trở lên):
   - Kiểm tra: `node -v` và `npm -v`
3. **Supabase CLI**:
   - **Cài qua npm (Phổ biến & đơn giản nhất):**
     ```bash
     npm install -g supabase
     ```
   - **Hoặc qua Homebrew (macOS / Linux):**
     ```bash
     brew install supabase/tap/supabase
     ```
   - **Hoặc qua Scoop (Windows):**
     ```powershell
     scoop bucket add supabase https://github.com/supabase/scoop-bucket.git
     scoop install supabase
     ```
   - Kiểm tra cài đặt thành công:
     ```bash
     supabase -v
     ```

---

### 1.2. Khởi động cụm Supabase Local

Mở Terminal và điều hướng về thư mục gốc của dự án:

```bash
cd /home/hocnguyen/Documents/Projects/exam
```

Khởi động các dịch vụ Supabase qua Docker:

```bash
supabase start
```

> **Lưu ý:** Lần đầu tiên chạy, Supabase sẽ tải các Docker images (PostgreSQL, GoTrue Auth, Storage, Kong Gateway, Studio UI,...), quá trình này có thể mất vài phút tùy tốc độ mạng.

Khi khởi động thành công, màn hình sẽ hiển thị thông số kết nối tương tự như sau:

| Dịch vụ | Địa chỉ kết nối / Thông số | Mục đích sử dụng |
|---|---|---|
| **Studio UI** | `http://127.0.0.1:54323` | Giao diện quản trị database, bảng, dữ liệu, auth, logs |
| **API Gateway** | `http://127.0.0.1:54321` | Base URL cho client & Edge Functions |
| **PostgreSQL DB** | `postgresql://postgres:postgres@127.0.0.1:54322/postgres` | Kết nối trực tiếp qua DBeaver, DataGrip, psql |
| **Inbucket (Email)** | `http://127.0.0.1:54324` | Giao diện xem email xác thực/reset pass giả lập |
| **anon key** | `eyJhbGciOi...` | Public key cho Frontend |
| **service_role key** | `eyJhbGciOi...` | Secret key có full quyền (dùng nội bộ / Edge Functions) |

Để xem lại các thông số này bất kỳ lúc nào, gõ:
```bash
supabase status
```

---

### 1.3. Đồng bộ Database Migrations & Seed Data

Chạy lệnh reset để áp dụng tuần tự toàn bộ **28 migrations** (từ `20260801000000` đến `20260801000027`) và khởi tạo dữ liệu mẫu:

```bash
supabase db reset
```

Lệnh trên sẽ:
1. Xóa sạch dữ liệu cũ trong container PostgreSQL local.
2. Thực thi tất cả các tệp trong thư mục `supabase/migrations/`.
3. Tự động tạo bucket `pdf-files` và thiết lập quyền truy cập RLS.
4. Tạo tài khoản quản trị mặc định:
   - **Tài khoản**: `admin`
   - **Mật khẩu**: `admin123` (hoặc `admin`)
   - **Email định danh**: `admin@system.local`

*(Tùy chọn)* Nếu cần cập nhật lại mật khẩu admin thông qua Supabase Admin API chuẩn:
```bash
node setup_admin.mjs
```

---

### 1.4. Chạy & Debug Edge Functions ở Local

Các Edge Functions trong `supabase/functions/` chạy trên nền Deno runtime.

#### Bước 1: Tạo file biến môi trường local
Tạo tệp `supabase/.env.local` nếu chưa có (chứa các secret tùy chọn như bot Telegram):
```env
TELEGRAM_BOT_TOKEN=your_test_telegram_bot_token_if_needed
```

#### Bước 2: Chạy toàn bộ Edge Functions
```bash
supabase functions serve --env-file ./supabase/.env.local --no-verify-jwt
```

> **Giải thích tham số:**
> - `--env-file ./supabase/.env.local`: Nạp các biến môi trường tùy chỉnh vào Deno runtime.
> - `--no-verify-jwt`: Giúp Deno không chặn kiểm tra JWT ở tầng gateway (các hàm nghiệp vụ trong dự án đã có middleware tự giải mã JWT từ header Authorization).
> - Tính năng **Hot-Reload**: Khi bạn chỉnh sửa bất kỳ file `.ts` nào trong `supabase/functions/`, server sẽ tự động cập nhật ngay lập tức mà không cần khởi động lại.

#### Bước 3: Serve riêng 1 function cụ thể (nếu cần debug chuyên sâu)
```bash
supabase functions serve submit-homework --env-file ./supabase/.env.local --no-verify-jwt
```

Endpoint cục bộ của hàm sẽ là:  
`http://127.0.0.1:54321/functions/v1/<tên-hàm>` (ví dụ: `http://127.0.0.1:54321/functions/v1/login`)

---

### 1.5. Khởi chạy Frontend kết nối Local

1. Mở tệp cấu hình `fe/.env` và trỏ URL về máy chủ local:
   ```env
   VITE_SUPABASE_URL=http://127.0.0.1:54321
   ```

2. Cài đặt dependencies và chạy Frontend:
   ```bash
   cd fe
   npm install
   npm run dev
   ```

3. Truy cập giao diện ứng dụng tại: `http://localhost:5173`
   - Đăng nhập với tài khoản: `admin` / `admin123`

---

### 1.6. Quy trình tạo mới Migration khi phát triển tính năng

Khi bạn muốn thay đổi cấu trúc bảng, thêm cột, hoặc thêm index mới:

#### Cách 1: Tạo file migration rỗng và viết SQL thủ công
```bash
supabase migration new ten_migration_moi
```
Lệnh sẽ tạo tệp tại `supabase/migrations/<timestamp>_ten_migration_moi.sql`. Bạn mở tệp này và viết các câu lệnh DDL cần thiết.

#### Cách 2: Chỉnh sửa trực quan trên Supabase Studio (`http://localhost:54323`) rồi export diff
1. Mở Studio UI -> Table Editor -> Thêm bảng hoặc cột trực tiếp bằng giao diện.
2. Quay lại terminal và chạy:
   ```bash
   supabase db diff -f ten_thay_doi_moi
   ```
   CLI sẽ tự động tạo file migration chứa các lệnh diff tương ứng.

Kiểm tra tính toàn vẹn của migrations:
```bash
supabase db reset
```

---

## PHẦN II: QUY TRÌNH DEPLOY LÊN SUPABASE CLOUD

### 2.1. Chuẩn bị dự án trên Supabase Cloud

1. Truy cập [https://supabase.com/dashboard](https://supabase.com/dashboard) và đăng nhập.
2. Bấm **"New Project"**, chọn Organization, đặt tên dự án (ví dụ: `exam-system`), thiết lập **Database Password** an toàn và chọn Region gần nhất (ví dụ: `Singapore - ap-southeast-1`).
3. Sau khi dự án khởi tạo xong, vào **Project Settings**:
   - **General:** Lấy **Reference ID** (dạng chuỗi ký tự, ví dụ: `fpeqddxhhsngntybyson`).
   - **API:** Lưu lại:
     - `Project URL`: `https://<PROJECT_REF>.supabase.co`
     - `anon / public key`
     - `service_role key` (bí mật, không public ra ngoài frontend)

---

### 2.2. Đăng nhập CLI và liên kết dự án (Link Project)

1. Đăng nhập tài khoản Supabase trên máy tính của bạn:
   ```bash
   supabase login
   ```
   *(Trình duyệt sẽ mở để xác thực hoặc yêu cầu bạn paste Personal Access Token từ tài khoản Supabase)*

2. Liên kết mã nguồn local với Cloud Project:
   ```bash
   supabase link --project-ref <PROJECT_REF>
   ```
   *(Nhập Database Password đã tạo ở bước 2.1 khi được hỏi)*

---

### 2.3. Đẩy Database Migrations & Storage Policies

1. **Đẩy toàn bộ schema và migrations lên Cloud:**
   ```bash
   supabase db push
   ```
   Lệnh này sẽ so sánh lịch sử migration trên Cloud và chạy tiếp các migrations mới nhất (từ `000000` đến `000027`).

2. **Kiểm tra trạng thái migration trên Cloud:**
   ```bash
   supabase migration list
   ```

3. **Thiết lập quyền truy cập cho Storage (Storage Policies):**
   Chạy file SQL thiết lập Storage Bucket `pdf-files`:
   ```bash
   supabase db execute --file ./supabase/storage/storage-policies.sql
   ```

---

### 2.4. Cấu hình Secrets (Biến môi trường) trên Cloud

Các Edge Functions sử dụng `TELEGRAM_BOT_TOKEN` để gửi thông báo cần được cấu hình bí mật trên Cloud:

```bash
supabase secrets set TELEGRAM_BOT_TOKEN="123456789:ABCdefGhIjkLmNoPqRsTuVwXyZ"
```

Kiểm tra danh sách secrets đang hoạt động trên dự án:
```bash
supabase secrets list
```

> **Ghi chú:** Các biến `SUPABASE_URL`, `SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY`, `SUPABASE_DB_URL` được Supabase tự động inject sẵn vào runtime của Edge Functions trên Cloud, bạn **không cần** tự set thủ công.

---

### 2.5. Deploy các Supabase Edge Functions

Dự án có 18 Edge Functions. Bạn có thể deploy từng hàm hoặc deploy tất cả cùng một lúc.

#### Cách 1: Script tự động deploy TOÀN BỘ 18 Edge Functions

- **Trên Linux / macOS (Bash):**
  ```bash
  for dir in supabase/functions/*/; do
    fn_name=$(basename "$dir")
    echo "🚀 Đang deploy function: $fn_name..."
    supabase functions deploy "$fn_name" --no-verify-jwt
  done
  ```

- **Trên Windows (PowerShell):**
  ```powershell
  Get-ChildItem -Directory -Path .\supabase\functions | ForEach-Object {
    Write-Host "🚀 Đang deploy function: $($_.Name)..."
    supabase functions deploy $_.Name --no-verify-jwt
  }
  ```

#### Cách 2: Deploy từng function thủ công (khi cần cập nhật nhanh 1 tính năng)

```bash
# Nhóm Auth & User
supabase functions deploy login --no-verify-jwt
supabase functions deploy refresh-token --no-verify-jwt
supabase functions deploy reset-password --no-verify-jwt
supabase functions deploy create-student --no-verify-jwt

# Nhóm Quản lý Lớp & Nội dung học
supabase functions deploy create-class --no-verify-jwt
supabase functions deploy create-chapter --no-verify-jwt
supabase functions deploy create-lesson --no-verify-jwt
supabase functions deploy create-homework --no-verify-jwt
supabase functions deploy question-bank --no-verify-jwt

# Nhóm Học sinh Làm bài & Chấm điểm
supabase functions deploy homework-detail --no-verify-jwt
supabase functions deploy submit-homework --no-verify-jwt
supabase functions deploy reopen-submission --no-verify-jwt
supabase functions deploy student-history --no-verify-jwt

# Nhóm Thi & Phòng thi
supabase functions deploy exam-session --no-verify-jwt
supabase functions deploy exam-log --no-verify-jwt

# Nhóm Báo cáo & Tiện ích
supabase functions deploy dashboard --no-verify-jwt
supabase functions deploy statistics --no-verify-jwt
supabase functions deploy telegram-bot --no-verify-jwt
```

> **Tại sao dùng cờ `--no-verify-jwt`?**  
> Trong `supabase/config.toml`, các hàm đã được cấu hình chi tiết. Khi deploy với `--no-verify-jwt`, request từ client sẽ đi thẳng vào Edge Function code. Tại đây, file `supabase/shared/auth-middleware.ts` của dự án sẽ **tự verify chữ ký JWT cục bộ bằng WebCrypto + JWKS** (`/auth/v1/.well-known/jwks.json`, cache theo isolate - xem mục 2.5.1), kiểm tra quyền `ADMIN` hoặc `STUDENT`, giúp xử lý lỗi và trả về JSON chuẩn xác (`{ success: false, error: ... }`) thay vì bị gateway chặn lỗi thô 401.
>
> Nhờ verify cục bộ, việc xác thực **không còn tốn round-trip tới GoTrue** (~160ms/request) và vẫn an toàn kể cả khi deploy bằng `--no-verify-jwt`.

---

### 2.5.1. Hiệu năng Edge Functions (BẮT BUỘC pin region)

#### Nguyên nhân API chậm ~1s (đã đo thực tế)

Số đo TTFB bằng `curl` (máy ở VN, request đã warm, median 5 mẫu):

| Endpoint | Số round-trip nội bộ | TTFB |
| --- | --- | --- |
| `login` (lỗi validate - 0 truy vấn DB) | 0 | 0.245s |
| `create-class` (GET) | 3 | 0.726s |
| `create-student` (GET - không lọc) | 3 | 0.748s |
| `create-student?classId=<lớp rỗng>` | 4 | 0.890s |
| `create-student?classId=<lớp có HS>` | 5 | 1.038s |

Công thức gần như **tuyến tính**:

```
TTFB ≈ 0.245s (gateway + khởi động isolate) + 0.16s × số_round_trip_đến_DB/Auth
```

Tức là **mỗi lời gọi Supabase trong function tốn ~160ms**, không phải vì truy vấn chậm
(các bảng chỉ vài chục dòng) mà vì:

- Edge Function mặc định chạy ở region **gần người dùng** (truy cập từ VN → `ap-northeast-2`/Seoul).
  Kiểm tra bằng header response `x-sb-edge-region`.
- Database + Auth (GoTrue) của project lại nằm ở **`ap-southeast-2` (Sydney)**.
- ⇒ Mỗi round-trip là một chuyến xuyên region ~160ms. Hàm càng nhiều `await` tuần tự càng chậm.

Đo A/B cùng một request, chỉ khác region (median 5 mẫu):

| Region chạy function | `create-student?classId=...` |
| --- | --- |
| Seoul (`ap-northeast-2`, mặc định) | **1.092s** |
| Sydney (`ap-southeast-2`, cùng region DB) | **0.541s** |

Ngoài ra **cold start rất đắt**: lần gọi đầu tiên ở một region mới đo được 3.8s (us-west-2),
24s (eu-west-1). Vì region được chọn theo vị trí người dùng, người dùng rải rác sẽ liên tục
gặp cold start ⇒ pin về 1 region vừa giảm latency vừa tăng tỉ lệ cache/isolate warm.

#### Việc cần làm

1. **Frontend pin region**: `fe/src/js/api.js` đã tự gửi header `x-region` cho mọi request
   (hằng `FUNCTION_REGION`, mặc định `ap-southeast-2`, override bằng biến môi trường
   `VITE_SUPABASE_FUNCTION_REGION` trong `fe/.env`).
   Nếu không thể thêm header (webhook, CORS khắt khe), dùng query param
   `?forceFunctionRegion=ap-southeast-2`.
   > Lưu ý: khi chỉ định region, request sẽ **không** được tự động chuyển vùng khi region đó
   > gặp sự cố (theo tài liệu Supabase).
2. **Verify lại sau deploy**: `curl -sD - -o /dev/null ".../functions/v1/create-student?classId=..." -H "authorization: Bearer $TOKEN"` rồi xem header
   `x-sb-edge-region` phải là `ap-southeast-2`.
3. **Giữ số round-trip trong function ở mức tối thiểu** (đây là quy tắc quan trọng nhất khi viết code):
   - Xác thực JWT bằng `requireAuth()` **không** còn gọi GoTrue (verify chữ ký cục bộ với JWKS cache).
   - Các truy vấn **độc lập** phải chạy bằng `Promise.all`, không `await` tuần tự.
   - Không thêm các truy vấn "kiểm tra tồn tại" trước khi ghi; hãy map lỗi của DB về HTTP status tương ứng.
4. **Cache CORS preflight**: `shared/response-helper.ts` đã thêm `Access-Control-Max-Age: 86400`
   để browser không phải preflight lại mỗi request (tối ưu ~100-300ms/lần gọi từ trình duyệt).
5. **Cold start**: dùng specifier `npm:` (`npm:@supabase/supabase-js@...`) thay cho `https://esm.sh/...`.
   Module của esm.sh phải tải thêm 7 file con từ CDN mỗi lần khởi động isolate; `npm:` được runtime
   bundle sẵn.

> **Cách kiểm tra nhanh số round-trip của một function**: mỗi `await supabase...` (PostgREST/GoTrue)
> = 1 round-trip ≈ 160ms khi function KHÁC region DB, ≈ 50-60ms khi cùng region.

---

### 2.6. Khởi tạo tài khoản Administrator trên Cloud

Khi deploy lên Cloud lần đầu, bảng `auth.users` chưa có tài khoản admin. Bạn có 2 cách để tạo:

#### Cách 1: Sử dụng SQL Editor trên Supabase Dashboard (Khuyến nghị)
1. Truy cập [Dashboard Supabase Cloud](https://supabase.com/dashboard) -> Chọn dự án -> **SQL Editor**.
2. Thực thi đoạn mã sau (thay đổi mật khẩu `Admin@2026!#` theo ý muốn):

```sql
DO $$
DECLARE
    v_admin_id UUID := '00000000-0000-0000-0000-000000000001'::UUID;
    v_email TEXT := 'admin@system.local';
    v_username TEXT := 'admin';
    v_password TEXT := 'Admin@2026!#'; -- Đổi mật khẩu mạnh của bạn ở đây
BEGIN
    -- Tạo auth user
    INSERT INTO auth.users (
        instance_id, id, aud, role, email, encrypted_password,
        email_confirmed_at, raw_app_meta_data, raw_user_meta_data,
        created_at, updated_at
    )
    VALUES (
        '00000000-0000-0000-0000-000000000000',
        v_admin_id,
        'authenticated',
        'authenticated',
        v_email,
        crypt(v_password, gen_salt('bf')),
        NOW(),
        '{"provider": "email", "providers": ["email"]}',
        '{"username": "admin", "role": "ADMIN"}',
        NOW(),
        NOW()
    )
    ON CONFLICT (id) DO UPDATE SET
        encrypted_password = crypt(v_password, gen_salt('bf'));

    -- Tạo identity
    INSERT INTO auth.identities (
        id, user_id, provider_id, identity_data, provider,
        last_sign_in_at, created_at, updated_at
    )
    VALUES (
        v_admin_id,
        v_admin_id,
        v_email,
        format('{"sub":"%s","email":"%s"}', v_admin_id, v_email)::jsonb,
        'email',
        NOW(), NOW(), NOW()
    )
    ON CONFLICT (id) DO NOTHING;

    -- Gán role ADMIN trong public.profiles
    INSERT INTO public.profiles (
        id, username, full_name, role, class_id
    )
    VALUES (
        v_admin_id, v_username, 'System Administrator', 'ADMIN', NULL
    )
    ON CONFLICT (id) DO UPDATE SET
        role = 'ADMIN',
        username = EXCLUDED.username;
END $$;
```

#### Cách 2: Sử dụng file `setup_admin.mjs`
Sửa tạm 2 biến trong `setup_admin.mjs`:
```javascript
const SUPABASE_URL = 'https://<PROJECT_REF>.supabase.co';
const SERVICE_ROLE_KEY = '<SERVICE_ROLE_KEY_TREN_CLOUD>';
```
Chạy lệnh: `node setup_admin.mjs` rồi hoàn tác lại key.

---

### 2.7. Cấu hình Telegram Webhook

Nếu hệ thống sử dụng Bot Telegram để nhận thông báo nộp bài và liên kết lớp học:

Đăng ký webhook trỏ về Cloud Edge Function bằng cách gọi URL sau trên trình duyệt hoặc qua `curl`:

```bash
curl -X POST "https://api.telegram.org/bot<TELEGRAM_BOT_TOKEN>/setWebhook" \
  -d "url=https://<PROJECT_REF>.supabase.co/functions/v1/telegram-bot"
```

Nếu trả về `{"ok":true,"result":true,"description":"Webhook was set"}` là thành công.

---

### 2.8. Build & Deploy Frontend

1. Cấu hình file `fe/.env` trỏ vào Cloud URL:
   ```env
   VITE_SUPABASE_URL=https://<PROJECT_REF>.supabase.co
   ```

2. Build ứng dụng sản xuất (Production Build):
   ```bash
   cd fe
   npm run build
   ```
   Toàn bộ mã nguồn tĩnh tối ưu sẽ nằm trong thư mục `fe/dist/`.

3. **Deploy lên các nền tảng Hosting miễn phí/phổ biến:**
   - **Vercel / Netlify / Cloudflare Pages:**
     - Root Directory: `fe`
     - Build Command: `npm run build`
     - Output Directory: `dist`
     - Environment Variable: `VITE_SUPABASE_URL=https://<PROJECT_REF>.supabase.co`

---

## PHẦN III: XỬ LÝ SỰ CỐ THƯỜNG GẶP (TROUBLESHOOTING)

### 1. Lỗi Docker không chạy khi gõ `supabase start`
- **Thông báo:** `Cannot connect to the Docker daemon at unix:///var/run/docker.sock...`
- **Khắc phục:** Mở ứng dụng Docker Desktop hoặc trên Linux chạy lệnh:
  ```bash
  sudo systemctl start docker
  ```

### 2. Lỗi xung đột cổng (Port already in use)
- **Thông báo:** `port 54321 or 54322 is already allocated`
- **Nguyên nhân:** Đang có dịch vụ PostgreSQL cục bộ hoặc một phiên bản Docker khác chiếm cổng.
- **Khắc phục:**
  - Kiểm tra tiến trình chiếm cổng: `sudo lsof -i :54321` hoặc `sudo lsof -i :54322`.
  - Hoặc chỉnh sửa cổng trong file `supabase/config.toml` nếu cần thiết.

### 3. Lỗi "Remote database has drift / schema out of sync" khi deploy
- **Nguyên nhân:** Có ai đó đã sửa schema trực tiếp trên Supabase Cloud UI mà chưa lưu thành file migration ở local.
- **Khắc phục:**
  - Kéo schema hiện tại trên Cloud về local:
    ```bash
    supabase db pull
    ```
  - Kiểm tra lại các file migration và chạy `supabase db push`.

### 4. Lỗi 401 Unauthorized khi gọi Edge Functions
- Kiểm tra xem function đó có yêu cầu xác thực JWT không.
- Nếu gọi hàm yêu cầu quyền Admin/Học sinh: Đảm bảo header có:
  `Authorization: Bearer <ACCESS_TOKEN>`
- Nếu function là public (như `login` hoặc `telegram-bot`): Kiểm tra xem khi deploy đã có cờ `--no-verify-jwt` chưa. Nếu chưa, hãy deploy lại với `--no-verify-jwt`.

### 5. Sao lưu (Backup) và Khôi phục (Restore) Database Cloud
- **Sao lưu toàn bộ dữ liệu & schema từ Cloud:**
  ```bash
  supabase db dump -f backup_data.sql --data-only
  supabase db dump -f backup_schema.sql
  ```
- **Khôi phục vào Database local để debug:**
  ```bash
  psql -h 127.0.0.1 -p 54322 -U postgres -d postgres -f backup_schema.sql
  ```

---

## PHẦN IV: BẢNG TRA CỨU NHANH LỆNH CLI (CHEAT SHEET)

| Thao tác | Câu lệnh |
|---|---|
| **Bật Supabase Local** | `supabase start` |
| **Tắt Supabase Local** | `supabase stop` |
| **Xóa sạch và tắt Supabase Local** | `supabase stop --no-backup` |
| **Xem cổng và API keys local** | `supabase status` |
| **Reset DB & chạy lại 28 migrations** | `supabase db reset` |
| **Chạy toàn bộ Edge Functions local** | `supabase functions serve --no-verify-jwt` |
| **Chạy 1 Edge Function local kèm env** | `supabase functions serve <tên-hàm> --env-file ./supabase/.env.local --no-verify-jwt` |
| **Tạo file migration mới** | `supabase migration new <tên_migration>` |
| **So sánh và tạo migration từ DB local** | `supabase db diff -f <tên_migration>` |
| **Đăng nhập Supabase CLI** | `supabase login` |
| **Liên kết với dự án Cloud** | `supabase link --project-ref <PROJECT_REF>` |
| **Đẩy migrations lên Cloud** | `supabase db push` |
| **Cấu hình Secret biến môi trường Cloud** | `supabase secrets set KEY="value"` |
| **Xem danh sách Secrets trên Cloud** | `supabase secrets list` |
| **Deploy 1 function lên Cloud** | `supabase functions deploy <tên-hàm> --no-verify-jwt` |
| **Kiểm tra logs của function trên Cloud** | `supabase functions logs <tên-hàm>` |
