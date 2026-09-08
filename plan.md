# Kế hoạch chi tiết: Chatbot Telegram thông báo nộp bài

Tài liệu này mô tả chi tiết các bước triển khai tính năng tích hợp bot Telegram để tự động gửi thông báo cho giáo viên/admin khi có học sinh nộp bài tập trên hệ thống Exam.

## 1. Mục tiêu
- Cung cấp tính năng liên kết các lớp học (Classes) trên hệ thống với các nhóm (Group) hoặc kênh (Channel) Telegram.
- Tự động gửi thông báo chi tiết vào nhóm/kênh tương ứng mỗi khi có học sinh nộp bài thành công.
- Không làm gián đoạn trải nghiệm và tốc độ nộp bài của học sinh (gửi thông báo một cách bất đồng bộ).

## 2. Thiết kế Cơ sở dữ liệu (Database Design)

### Bảng `public.telegram_configs`
Tạo một migration script mới (ví dụ: `20260801000015_create_telegram_configs.sql`):
- `id` (UUID, Primary Key)
- `class_id` (UUID, Unique, Foreign Key tới `public.classes`, On Delete Cascade)
- `chat_id` (TEXT, Not Null): ID của người dùng hoặc nhóm trên Telegram (ví dụ: `-100123456789`).
- `chat_title` (TEXT): Tên của nhóm/kênh để admin dễ nhận biết.
- `is_enabled` (BOOLEAN, Default True): Trạng thái bật/tắt thông báo tạm thời.
- `created_at`, `updated_at` (TIMESTAMPTZ, Default NOW()).

**Bảo mật (RLS):** 
- Cho phép `service_role` toàn quyền (bỏ qua RLS).
- Chỉ cho phép `ADMIN` xem, thêm, sửa, xóa cấu hình này.

## 3. Kiến trúc API và Telegram Webhook (Backend)

### 3.1. Edge Function Mới: `telegram-bot`
Function này sẽ đóng vai trò là webhook endpoint nhận các bản cập nhật từ Telegram.
- **Xử lý Command `/start`**: Gửi tin nhắn chào mừng và hướng dẫn cách liên kết.
- **Xử lý Command `/link <class_id>`**: 
  - Lấy `chat_id` và `chat_title` (từ đối tượng `chat` của Telegram).
  - Kết nối với Supabase, tìm lớp học theo `class_id`. Nếu tìm thấy, thực hiện Upsert vào bảng `telegram_configs`.
  - Phản hồi lại nhóm: "✅ Đã liên kết thành công với lớp: [Tên Lớp]".
- **Cấu hình Webhook**: Chạy API của Telegram `setWebhook` với URL trỏ đến Edge Function `telegram-bot`.

### 3.2. Cập nhật Edge Function: `submit-homework`
Thêm logic gửi thông báo sau khi lưu thành công dữ liệu bài làm vào database:
1. **Lấy cấu hình**: Truy vấn `telegram_configs` dựa vào `class_id` (có thể cần join với `lessons` -> `chapters` -> `classes` để lấy `class_id` hoặc lấy trực tiếp nếu đã query sẵn).
2. **Kiểm tra**: Nếu tồn tại cấu hình cho lớp này và `is_enabled == true`.
3. **Gửi tin nhắn (Fire-and-forget / Asynchronous)**:
   - Nội dung (MarkdownV2 hoặc HTML):
     ```html
     📣 <b>THÔNG BÁO NỘP BÀI</b>
     🎓 <b>Học sinh:</b> Nguyễn Văn A
     🏫 <b>Lớp:</b> Toán Thầy B
     📝 <b>Bài tập:</b> Kiểm tra 15 phút
     ⏱ <b>Thời gian nộp:</b> 11/08/2026 15:30
     📊 <b>Điểm số:</b> 8.5/10 (Đạt)
     ✅ <b>Đúng/Sai:</b> 17/3
     ```
   - Gửi request `POST` đến `https://api.telegram.org/bot<TOKEN>/sendMessage`.
   - Bọc trong khối `try-catch` hoặc Promise bất đồng bộ để tránh báo lỗi cho người dùng nếu Telegram API phản hồi chậm/lỗi.

## 4. Giao diện Quản lý (Frontend)

### Cập nhật chức năng Quản lý Lớp học (Class Management / Class Details)
File ảnh hưởng: `fe/src/js/views/class-details.js`
- Thêm một section/tab mới: **"Cấu hình Bot Telegram"**.
- Cung cấp thông tin trực quan:
  - Tên Bot: (Ví dụ: `@MyExamSystemBot`)
  - Lệnh liên kết dành riêng cho lớp này: `Mời bot vào nhóm và gõ lệnh: /link <class_id>` (Cung cấp nút Copy để sao chép nhanh lệnh).
- Hiển thị trạng thái hiện tại bằng cách query API bảng `telegram_configs`:
  - **Trạng thái**: Đã liên kết (Tên nhóm: `...`) / Chưa liên kết.
  - Tùy chọn **Tạm dừng thông báo** (Toggle `is_enabled`) hoặc **Hủy liên kết** (Xóa row trong `telegram_configs`).

## 5. Các bước triển khai (Implementation Steps)

1. **Bước 1 (DB)**: Viết và chạy file migration tạo bảng `telegram_configs` cùng với các policies cần thiết. Chạy lệnh generate type nếu cần.
2. **Bước 2 (Bot Setup)**: Tạo Bot qua `@BotFather` trên Telegram, lấy Token và thêm vào biến môi trường của Supabase (`TELEGRAM_BOT_TOKEN`).
3. **Bước 3 (Webhook Edge Function)**: Tạo folder `supabase/functions/telegram-bot`, viết code xử lý webhook, deploy lên Supabase và set webhook URL cho Bot Telegram.
4. **Bước 4 (Frontend UI)**: Thêm giao diện quản lý liên kết Telegram vào chi tiết lớp học (`class-details.js`), bao gồm UI và các lời gọi API.
5. **Bước 5 (Submit Logic)**: Tích hợp logic gửi thông báo vào cuối function `submit-homework/index.ts`.
6. **Bước 6 (Testing)**: Kiểm thử từ A-Z (Tạo lớp -> Lấy ID -> Link Telegram group -> Học sinh nộp bài -> Kiểm tra thông báo trên Telegram).

## 6. Biến môi trường cần thiết
- `TELEGRAM_BOT_TOKEN`: Cung cấp bởi BotFather.
- Các biến môi trường mặc định của Supabase để kết nối Database.

---
*Tài liệu này đóng vai trò như một blueprint. Khi bắt đầu code, chúng ta sẽ lần lượt thực thi các Bước trong mục 5.*
