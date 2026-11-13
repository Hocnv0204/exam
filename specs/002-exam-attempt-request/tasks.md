# Tasks: Yêu cầu thêm lượt thi qua bot Telegram

**Input**: [spec.md](spec.md), [plan.md](plan.md). Đánh dấu `[x]` chỉ sau khi Claude review & verify.

Thứ tự ưu tiên provider theo CLAUDE.md; task rủi ro cao (SQL/RPC, auth, webhook) có review chéo bởi provider còn lại.

## Phase 1 — Nền tảng (tuần tự)

- [x] T001 [Claude] Migration `supabase/migrations/20261113000000_exam_attempt_requests.sql`: bảng, index, RLS/REVOKE/GRANT, RPC `exam_attempt_allowance`, `request_exam_attempt`, `decide_exam_attempt_request`, `set_exam_attempt_request_message`; sửa `init_exam_attempt` dùng allowance.
- [x] T002 [Claude] Test PGlite + oracle `supabase/scripts/test-exam-attempt-request-db.mjs` (các ca ở plan §4).
- [x] T003 [Claude] `supabase/shared/response-helper.ts` thêm `code` tuỳ chọn; `exam-session` trả `code`; `supabase/shared/telegram.ts` helper dùng chung; `api.js` 2 wrapper mới; `config.toml` khai báo function mới.

## Phase 2 — Song song (sau Phase 1)

- [x] T004 [ChatGPT gpt-5.6-terra] Function `supabase/functions/exam-attempt-request/{index.ts,logic.ts}` + `supabase/scripts/test-exam-attempt-request.mjs`; `homework-detail` trả `effectiveMaxAttempts`, `attemptRequest`.
- [x] T005 [Gemini gemini-3.8-flash-high] `supabase/functions/telegram-bot/index.ts`: secret header, callback `ar:ok|ar:no`, allow-list admin, sửa tin nhắn; mở rộng `supabase/scripts/test-telegram-bot.mjs`.
- [x] T006 [Gemini gemini-3.8-flash-high] FE `fe/src/js/views/exam-room.js` popup hết lượt 4 trạng thái + trang render-time dùng `effectiveMaxAttempts`; `fe/scripts/test-exam-attempt-request.mjs` (đăng ký vào `npm test` bởi Claude).

## Phase 3 — Review chéo & kiểm chứng

- [x] T007 [Gemini, chỉ đọc] Review T004 (auth, chống spam, escape, lỗi Telegram).
- [x] T008 [ChatGPT, chỉ đọc] Review T005 (secret, allow-list, idempotent, callback_data).
- [x] T009 [Claude] Review toàn bộ diff; chạy `npm test`, `npm run build`, test PGlite + bot; esbuild cú pháp TS; trình duyệt headless (mock) popup ở 4 trạng thái, 1280px + 390px, Mochi Sáng (chưa kiểm 3 màu Mochi còn lại và classic).

## Phase 4 — Triển khai (mỗi bước cần người dùng xác nhận)

- [x] T010 `supabase db push` migration.
- [x] T011 Deploy functions: `exam-session`, `homework-detail`, `exam-attempt-request`, `telegram-bot`.
- [ ] T012 Đặt secret `TELEGRAM_ADMIN_CHAT_ID`, `TELEGRAM_ADMIN_USER_IDS`, `TELEGRAM_WEBHOOK_SECRET`; `setWebhook` kèm `secret_token` (người dùng cung cấp chat id/user id).
- [x] T013 Push FE (`main`) sau khi backend đã lên.
- [ ] T014 Thử end-to-end với tài khoản thử nghiệm (không dùng tài khoản thật để thi).

## Ghi chú review (2026-11-13)

- T007 (Gemini) & T008 (ChatGPT) review chéo → đã sửa: GET trạng thái kiểm quyền qua RPC `get_exam_attempt_request_status`; duyệt kiểm lại điều kiện (tự REJECTED `notEligible`); timeout 10s khi gọi Telegram; nút duyệt chỉ chạy khi có `TELEGRAM_WEBHOOK_SECRET`, đúng admin user + admin chat; lỗi RPC không gây webhook 5xx; bỏ nút bằng `inline_keyboard: []`.
- Giới hạn đã biết: nhiều chat admin → chỉ tin nhắn ở chat được bấm bị gỡ nút (các chat khác bấm sẽ nhận "đã xử lý").

## Triển khai (2026-11-13)

- T010: `db push --remote` 20261113000000_exam_attempt_requests.sql ✔
- T011: deploy exam-session, homework-detail, exam-attempt-request, telegram-bot ✔ (smoke: không đăng nhập → 401; bot OPTIONS 200)
- T012: CHƯA — cần token bot (chỉ có trên server) và Telegram user id của admin. Chưa đặt `TELEGRAM_WEBHOOK_SECRET` nên bot cũ vẫn chạy; nút duyệt báo "chưa cấu hình bảo mật"; yêu cầu vẫn được lưu (notified:false) cho tới khi đặt `TELEGRAM_ADMIN_CHAT_ID`.
- T013: push FE ✔
