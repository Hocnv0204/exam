# Implementation Plan: Yêu cầu thêm lượt thi qua bot Telegram

**Branch**: `main` | **Date**: 2026-11-13 | **Spec**: [spec.md](spec.md)

## Summary

Học sinh hết lượt EXAM thấy popup (Đóng / Yêu cầu thêm lượt thi). Yêu cầu lưu ở bảng mới, bot Telegram hiện có gửi tin vào chat riêng của admin kèm nút Xác nhận / Từ chối. Xác nhận = cấp 1 lượt chờ dùng: `init_exam_attempt` tính hạn mức hiệu lực = `max_attempts` + số yêu cầu APPROVED; đồng hồ chỉ chạy khi học sinh bấm Bắt đầu (không gọi luồng "Khôi phục bài thi").

## Technical Context

- Frontend: Vanilla JS + Vite (`fe/`), test `node --test fe/scripts/*.mjs`.
- Backend: Supabase Edge Functions (Deno), Postgres RPC `SECURITY DEFINER`, test PGlite + oracle JS (`supabase/scripts/test-*-db.mjs`), test bot qua esbuild+vm (`supabase/scripts/test-telegram-bot.mjs`).
- Secret mới: `TELEGRAM_ADMIN_CHAT_ID` (≥1 chat id, phân tách dấu phẩy), `TELEGRAM_ADMIN_USER_IDS` (id được bấm duyệt), `TELEGRAM_WEBHOOK_SECRET` (khớp `secret_token` khi `setWebhook`). Bot token giữ `TELEGRAM_BOT_TOKEN`.

## Thiết kế

### 1. DB — migration `20261113000000_exam_attempt_requests.sql`

- Bảng `exam_attempt_requests`:
  - `id uuid pk default gen_random_uuid()`
  - `homework_id` → homeworks (cascade), `student_id` → profiles (cascade)
  - `status text check in ('PENDING','APPROVED','REJECTED')`
  - `requested_at timestamptz default now()`, `decided_at`
  - `decided_by_telegram_id bigint`, `decided_by_name text`
  - `telegram_chat_id text`, `telegram_message_id bigint`
- Partial unique index `(homework_id, student_id) WHERE status='PENDING'`, index `(homework_id, student_id, requested_at)`.
- RLS bật; `REVOKE ALL` khỏi public/anon/authenticated; `GRANT` cho service_role.
- RPC (`SECURITY DEFINER`, `SET search_path = public`, chỉ `service_role` EXECUTE):
  - `exam_attempt_allowance(hw, student) → int`: `max_attempts` + count(APPROVED). Trả 0 = không giới hạn.
  - `request_exam_attempt(hw, student) → jsonb`:
    - Lấy advisory lock cùng khoá với `init_exam_attempt`.
    - Kiểm tra lần lượt, lỗi nào trả về mã nấy:
      1. Học sinh có quyền thi bài này (`FORBIDDEN`) — dùng cùng logic với `init_exam_attempt`.
      2. Bài là EXAM đã xuất bản (`INVALID_EXAM`).
      3. Không có phiên ACTIVE và đang thực sự hết lượt (`NOT_AT_LIMIT`).
      4. Chưa có yêu cầu PENDING (`REQUEST_PENDING`).
      5. Chưa đủ 3 yêu cầu trong ngày giờ VN (`REQUEST_DAILY_LIMIT`).
    - Nếu qua hết: INSERT và trả về request.
  - `decide_exam_attempt_request(id, approve bool, decider_id bigint, decider_name text) → jsonb`:
    - `UPDATE … WHERE id AND status='PENDING' RETURNING`.
    - Nếu không có dòng nào được cập nhật, trả trạng thái hiện tại kèm `alreadyDecided:true` (idempotent).
  - `set_exam_attempt_request_message(id, chat_id, message_id)`: lưu id tin nhắn để bot sửa sau.
- Sửa `init_exam_attempt`: điều kiện `ATTEMPT_LIMIT` dùng `exam_attempt_allowance` thay `h.max_attempts`. Phần còn lại giữ nguyên.

### 2. Edge functions

- `supabase/shared/response-helper.ts`:
  - `errorResponse` thêm tham số tuỳ chọn `code`, trả trong body `{ code }`.
  - Không đổi các lời gọi cũ.
- `exam-session`: các lỗi `ATTEMPT_LIMIT|EXAM_EXPIRED|INVALID_TOKEN` trả kèm `code`.
- `supabase/shared/telegram.ts` (mới): `telegramRequest`, `sendMessageWithKeyboard`, `escapeTelegramHtml`, `parseIdList`. Không log token hay nội dung tin nhắn.
- Function mới `exam-attempt-request` (`verify_jwt = true`, `requireAuth`, chỉ STUDENT). Phần xử lý thuần tách ra `logic.ts` để test được.
  - `POST {homeworkId}`:
    1. Gọi RPC `request_exam_attempt`; mã lỗi → HTTP 4xx kèm `code` và message tiếng Việt.
    2. Lấy tên học sinh, lớp, bài.
    3. Gửi tin tới từng `TELEGRAM_ADMIN_CHAT_ID`, kèm nút `ar:ok:<id>` / `ar:no:<id>` (≤ 64 byte).
    4. Lưu message id.
    5. Nếu gửi Telegram lỗi: yêu cầu vẫn được lưu, response có `notified:false`.
  - `GET ?homeworkId=`: trả yêu cầu gần nhất `{status, requestedAt, decidedAt}`, số yêu cầu còn lại hôm nay, và `allowance`.
- `homework-detail`: trả thêm `effectiveMaxAttempts` (= allowance) và `attemptRequest` (yêu cầu gần nhất) cho bài EXAM, để client không chặn sai.
- `telegram-bot`:
  - Nếu có `TELEGRAM_WEBHOOK_SECRET`, bắt buộc header `X-Telegram-Bot-Api-Secret-Token` khớp; so sánh constant-time; sai thì trả 401.
  - Callback `ar:ok:` / `ar:no:`: nếu `from.id` không thuộc `TELEGRAM_ADMIN_USER_IDS` thì `answerCallbackQuery("Bạn không có quyền duyệt")`.
  - Gọi `decide_exam_attempt_request`, rồi sửa tin nhắn thành "✅ Đã cấp thêm 1 lượt bởi …" hoặc "❌ Đã từ chối bởi …" và bỏ nút.
  - Nếu `alreadyDecided`, chỉ trả lời "Yêu cầu đã được xử lý trước đó".
- `supabase/config.toml`: thêm `[functions.exam-attempt-request] verify_jwt = true`.

### 3. Frontend

- `api.js` (Claude):
  - `requestExamAttempt(homeworkId)`, `getExamAttemptRequest(homeworkId)`.
  - `request()` giữ `err.code` (đã có sẵn).
- `exam-room.js`:
  - `showAttemptLimitModal` có 2 nút Đóng / Yêu cầu thêm lượt thi.
  - Popup hiển thị trạng thái yêu cầu: chưa có, đang chờ, bị từ chối (và số lần còn được gửi hôm nay), đã duyệt (nút "Bắt đầu làm bài" để tải lại phòng thi).
  - Nút gửi bị khoá trong lúc gửi; mã lỗi được dịch sang tiếng Việt.
  - Trang "Đạt giới hạn lượt thi" lúc render (classic + Mochi) dùng `effectiveMaxAttempts`, và tự mở popup thay vì chỉ có nút quay lại.
  - Popup dùng `openModal`, nên Mochi và classic đều hiển thị được, và không còn mã lỗi thô.

### 4. Tests

- PGlite `supabase/scripts/test-exam-attempt-request-db.mjs`, đối chiếu với oracle JS:
  - quyền, 1 PENDING, 3/ngày (biên giờ VN), `NOT_AT_LIMIT`;
  - duyệt 2 lần chỉ cấp 1 lượt; từ chối;
  - `init_exam_attempt` cho thi đúng 1 lần sau khi duyệt, rồi lại `ATTEMPT_LIMIT`;
  - phiên ACTIVE vẫn được ưu tiên tiếp tục.
- `supabase/scripts/test-exam-attempt-request.mjs` (logic.ts):
  - map lỗi;
  - nội dung tin nhắn được escape;
  - `callback_data` ≤ 64 byte;
  - Telegram lỗi vẫn trả `notified:false`.
- Mở rộng `supabase/scripts/test-telegram-bot.mjs`:
  - secret header sai trả 401;
  - người bấm không phải admin bị từ chối;
  - duyệt idempotent;
  - tin nhắn được sửa và bỏ nút;
  - không lộ token.
- `fe/scripts/test-exam-attempt-request.mjs`:
  - popup ở cả 4 trạng thái;
  - escape dữ liệu;
  - khoá nút khi gửi;
  - không hiện mã thô.

## Rủi ro & cách giảm

- Đổi `init_exam_attempt` (luồng thi): chỉ đổi biểu thức hạn mức; có test PGlite cho các trường hợp cũ (resume, takeover, ATTEMPT_LIMIT) và mới.
- Webhook công khai (`verify_jwt=false`): secret token và allow-list admin; bấm lại nhiều lần vẫn an toàn nhờ `WHERE status='PENDING'`.
- Telegram retry khi trả 5xx: các xử lý callback đều idempotent.
- Deploy theo thứ tự: migration → functions (`exam-session`, `homework-detail`, `exam-attempt-request`, `telegram-bot`) → đặt secret → `setWebhook` kèm `secret_token` → FE. Mỗi bước cloud cần bạn xác nhận.
