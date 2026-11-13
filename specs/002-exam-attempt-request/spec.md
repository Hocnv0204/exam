# Feature Specification: Yêu cầu thêm lượt thi qua bot Telegram

**Feature Branch**: `main` (dự án làm trực tiếp trên main; không tạo nhánh)

**Created**: 2026-11-13

**Status**: Clarified (2026-11-13)

**Input**: "Khi hết lượt thi thì phải thông báo bằng popup. Popup gồm 2 button Đóng và Yêu cầu thêm lượt thi. Khi user click yêu cầu, bot Telegram gửi thông báo về và có action Xác nhận, Từ chối cho admin; nếu admin xác nhận thì bot call API mở lại bài thi cho học sinh đó."

## Quyết định đã chốt (2026-11-13)

- Duyệt = **cấp 1 lượt chờ dùng**: đồng hồ chỉ bắt đầu khi học sinh bấm "Bắt đầu làm bài", không tạo phiên lúc admin duyệt.
- Chỉ áp dụng cho bài **EXAM**. PRACTICE giữ thông báo hiện tại.
- Chống spam: mỗi (bài, học sinh) **tối đa 1 yêu cầu đang chờ** và **tối đa 3 yêu cầu/ngày** (theo giờ Việt Nam).
- Dùng **bot Telegram hiện có** (`TELEGRAM_BOT_TOKEN`, function `telegram-bot`), không tạo bot mới.

## User Scenarios & Testing

### User Story 1 - Học sinh hết lượt thấy popup rõ ràng và gửi yêu cầu (Priority: P1)

Học sinh mở bài thi đã dùng hết lượt (từ trang lớp, hoặc bấm "Bắt đầu làm bài" và máy chủ báo hết lượt). Hệ thống hiện popup "Bạn đã hết lượt làm bài" với 2 nút **Đóng** và **Yêu cầu thêm lượt thi**. Bấm yêu cầu → gửi lên máy chủ → popup báo "Đã gửi yêu cầu, chờ giáo viên duyệt".

**Independent Test**: dữ liệu giả lập học sinh hết lượt; bấm yêu cầu → 1 bản ghi yêu cầu PENDING + 1 tin nhắn bot (mock) chứa nút Xác nhận/Từ chối.

**Acceptance Scenarios**:

1. **Given** học sinh đã nộp đủ `max_attempts` lần bài EXAM, **When** mở `#exam-room`, **Then** thấy popup hết lượt (không còn trang "Đạt giới hạn lượt thi" chỉ có nút quay lại, không có chữ `ATTEMPT_LIMIT`).
2. **Given** popup hết lượt, **When** bấm "Yêu cầu thêm lượt thi", **Then** nút bị khoá trong lúc gửi, thành công thì popup chuyển sang trạng thái "Đang chờ duyệt".
3. **Given** đã có yêu cầu đang chờ, **When** mở lại bài thi, **Then** popup hiện "Đang chờ duyệt" và không cho gửi thêm.
4. **Given** đã gửi 3 yêu cầu trong ngày cho bài này, **When** bấm yêu cầu, **Then** máy chủ từ chối với thông báo tiếng Việt "Bạn đã gửi tối đa 3 yêu cầu hôm nay".
5. **Given** học sinh chưa hết lượt / không được giao bài / bài không phải EXAM đã xuất bản, **When** gọi API yêu cầu, **Then** máy chủ từ chối (không tin client).

### User Story 2 - Admin duyệt/từ chối trên Telegram (Priority: P1)

Bot gửi tin nhắn: tên học sinh, lớp, tên bài, số lượt đã dùng, thời điểm yêu cầu, kèm nút **Xác nhận** / **Từ chối**. Admin bấm → bot cập nhật yêu cầu, sửa tin nhắn thành "Đã xác nhận bởi …"/"Đã từ chối bởi …" và bỏ nút.

**Acceptance Scenarios**:

1. **Given** yêu cầu PENDING, **When** admin hợp lệ bấm Xác nhận, **Then** yêu cầu → APPROVED, học sinh có thêm đúng 1 lượt chờ dùng, tin nhắn bị sửa và mất nút.
2. **Given** yêu cầu PENDING, **When** admin bấm Từ chối, **Then** yêu cầu → REJECTED, không cấp lượt.
3. **Given** yêu cầu đã APPROVED/REJECTED, **When** bấm lại (bấm đúp, Telegram gửi lại update), **Then** không cấp thêm lượt lần 2; bot trả lời "Yêu cầu đã được xử lý".
4. **Given** người bấm không nằm trong danh sách admin được phép, **When** bấm nút, **Then** bị từ chối, yêu cầu không đổi.
5. **Given** request tới webhook không có `X-Telegram-Bot-Api-Secret-Token` đúng, **Then** bị từ chối (401) và không xử lý.

### User Story 3 - Học sinh dùng lượt được cấp (Priority: P1)

**Acceptance Scenarios**:

1. **Given** yêu cầu APPROVED, **When** học sinh mở bài thi, **Then** thấy popup quy chế bình thường (không còn popup hết lượt) và bắt đầu thi được; đồng hồ tính từ lúc bấm "Bắt đầu làm bài".
2. **Given** học sinh đã dùng lượt được cấp và nộp bài, **Then** hết lượt trở lại (cấp 1 lượt = đúng 1 lần thi thêm).
3. **Given** yêu cầu REJECTED, **When** mở bài thi, **Then** popup hết lượt hiện "Yêu cầu gần nhất bị từ chối" và cho gửi yêu cầu mới nếu chưa quá 3 lần/ngày.

### Edge Cases

- Học sinh gửi yêu cầu rồi admin dùng nút "Khôi phục bài thi" trên web: yêu cầu PENDING vẫn còn; duyệt sau đó vẫn chỉ cấp đúng 1 lượt.
- Bot gửi tin thất bại (Telegram lỗi): yêu cầu vẫn được lưu PENDING; học sinh thấy "Đã gửi yêu cầu" — admin có thể không nhận được → [ghi log, cân nhắc gửi lại ở bước plan].
- Bài bị xoá / huỷ xuất bản / học sinh rời lớp trong lúc chờ: duyệt bị từ chối an toàn với thông báo cho admin.
- Hai admin bấm cùng lúc: chỉ một lần chuyển trạng thái thành công.
- `callback_data` ≤ 64 byte: chỉ chứa id ngắn của yêu cầu.
- Tên học sinh/bài có ký tự HTML: escape trong tin nhắn bot.

## Requirements

### Functional Requirements

- **FR-001**: Máy chủ trả mã lỗi máy đọc được (`code: 'ATTEMPT_LIMIT'`) khi hết lượt; client không hiện mã thô.
- **FR-002**: Popup hết lượt (exam-room, cả lúc mở trang và lúc bấm Bắt đầu) có nút "Đóng" và "Yêu cầu thêm lượt thi", hiển thị trạng thái yêu cầu gần nhất (chưa có / đang chờ / bị từ chối / đã duyệt).
- **FR-003**: API học sinh `request-attempt` (tên cụ thể ở plan): kiểm quyền ở backend (STUDENT, được giao bài, EXAM đã xuất bản, đang thực sự hết lượt), áp giới hạn 1 PENDING + 3/ngày, lưu yêu cầu rồi nhờ bot gửi tin.
- **FR-004**: Bảng yêu cầu mới (trạng thái PENDING → APPROVED | REJECTED, người duyệt, thời điểm, telegram message id); partial unique index 1 PENDING/(bài, học sinh); RLS bật, chỉ service_role.
- **FR-005**: Cấp lượt chờ dùng: `init_exam_attempt` tính hạn mức = `max_attempts` + số yêu cầu APPROVED của (bài, học sinh); đồng hồ chỉ bắt đầu khi tạo phiên. Client (`homework-detail`) trả hạn mức hiệu lực để trang không chặn sai.
- **FR-006**: Bot `telegram-bot`: xác thực `X-Telegram-Bot-Api-Secret-Token`; callback mới (vd `ar:ok:<id>` / `ar:no:<id>`); chỉ admin trong danh sách cho phép; chuyển trạng thái nguyên tử (`WHERE status='PENDING'`), idempotent; `answerCallbackQuery` + sửa tin nhắn bỏ nút.
- **FR-007**: Mọi thao tác ghi log kiểm toán (ai duyệt, Telegram user id).
- **FR-008**: `?ui=classic` hiển thị popup tương đương (không Mochi) — không để học sinh classic thấy mã thô.

### Key Entities

- **Exam attempt request**: homework, student, status, requested_at, decided_at, decided_by (Telegram user id + tên), telegram chat/message id, note.

### Đích gửi tin & quyền duyệt (đã chốt)

Gửi vào **chat riêng của admin với bot hiện có**: secret `TELEGRAM_ADMIN_CHAT_ID` (một hoặc nhiều chat id, phân tách dấu phẩy) và `TELEGRAM_ADMIN_USER_IDS` (id Telegram được bấm duyệt). Không gửi vào nhóm lớp.

## Success Criteria

- **SC-001**: 0 trường hợp hiện chữ `ATTEMPT_LIMIT` thô cho học sinh.
- **SC-002**: Bấm Xác nhận nhiều lần / Telegram gửi lại update vẫn chỉ cấp đúng 1 lượt (test PGlite + test bot).
- **SC-003**: Học sinh được duyệt bắt đầu thi được với đủ `duration_minutes` tính từ lúc bấm Bắt đầu.
- **SC-004**: Webhook từ chối mọi update không có secret đúng.

## Ngoài phạm vi

- PRACTICE; giao diện web cho admin duyệt (chỉ Telegram); thông báo đẩy cho học sinh (học sinh thấy trạng thái khi mở lại bài).

## Điểm dừng xin xác nhận (theo CLAUDE.md)

- Sau clarify (điểm trên) → plan + tasks → xác nhận trước implement.
- Migration DB, đổi RPC `init_exam_attempt`, API mới, đổi webhook: xác nhận trước khi chạy lên cloud.
- Đặt `setWebhook` kèm `secret_token` và các secret mới: bạn thực hiện hoặc cho phép tôi chạy.

## Bổ sung 2026-11-14 — Báo kết quả cho học sinh (đã chốt: A + B + C)

- **A. Popup tự cập nhật**: popup hết lượt ở trạng thái PENDING tự gọi lại trạng thái mỗi 15 giây khi tab đang hiển thị; APPROVED → chuyển ngay sang "Giáo viên đã cấp thêm lượt thi — Vào thi" + toast; REJECTED → hiện trạng thái từ chối. Dừng khi đóng popup / rời trang.
- **B. Thông báo trong ứng dụng**: `decide_exam_attempt_request` ghi 1 dòng vào `notifications` (cùng transaction) khi quyết định lần đầu: `EXAM_ATTEMPT_APPROVED` / `EXAM_ATTEMPT_REJECTED`, `related_id = homework_id`. Function mới `student-notifications` (STUDENT): GET thông báo chưa đọc của chính mình; POST đánh dấu đã đọc (theo id hoặc tất cả). Trang chủ học sinh / trang lớp hiện banner (Mochi + classic) "Bài thi X đã được mở thêm 1 lượt — Vào thi ngay" / "Yêu cầu … bị từ chối"; bấm "Vào thi" hoặc "Đã hiểu" → đánh dấu đã đọc.
- **C. Nhãn trên thẻ bài thi**: `my-homeworks` trả `extraAttemptGranted` cho bài EXAM khi học sinh có lượt được cấp chưa dùng (allowance > số lần đã nộp và có yêu cầu APPROVED); thẻ bài hiện nhãn "Được cấp thêm lượt" và nút "Vào thi".
- Ngoài phạm vi: Telegram cho học sinh (chưa có liên kết tài khoản).
