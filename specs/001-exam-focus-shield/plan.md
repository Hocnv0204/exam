# Plan 001 — Exam focus shield

## Kiến trúc

1. **Module mới `fe/src/js/utils/exam-focus-shield.js`** (logic thuần, test được bằng Node):
   - `createFocusShield({ target, shieldEl, isActive, isExempt, onChange })` trả về `{ attach(), detach(), isShielded() }`.
   - Lắng nghe `visibilitychange`, `blur`, `focus` trên `window`/`document` (inject được để test).
   - Che khi `isActive() && !isExempt()` và (hidden hoặc blur). Mở khi visible và có focus.
   - Khi che:
     - thêm class `exam-shielded` lên root phòng thi;
     - đặt `inert` + `aria-hidden="true"` cho vùng đề;
     - hiện `shieldEl` (`hidden=false`).
   - Khi mở thì làm ngược lại.
   - Idempotent: blur + hidden cùng lúc chỉ đổi trạng thái một lần.
2. **Component `fe/src/js/components/exam-focus-shield.js`**: `renderExamFocusShield()` trả markup banner.
   - Mascot Mochi khi `isMochiUI()`, icon khi classic.
   - Tiêu đề thân thiện: Mochi "Mochi đang đợi bạn quay lại nè!", classic "Bạn ơi, quay lại làm bài nhé!"; dòng phụ nhắc đề đang tạm ẩn và đồng hồ vẫn chạy.
   - `role="alert"`, mặc định `hidden`.
3. **CSS `fe/src/css/exam-focus-shield.css`** (import trong exam-room.js / homework-solver.js):
   - Overlay `position:fixed` dưới header, phủ vùng đề, nền đặc (không mờ trong suốt).
   - Hoạt hoạ: mascot nhún, vòng sáng nhịp; tắt khi `prefers-reduced-motion`.
   - Token theo `html[data-ui="mochi"][data-student-theme=…]` và fallback classic.
   - `@media print { .exam-room-layout .exam-content { display:none } }`.
4. **`exam-room.js`**:
   - Thay `recordViolation`/`handleVisibilityChange`/`handleBlur`/`handleFocus`/`handleUserReturnedFromAway` bằng focus shield.
   - Xoá:
     - bộ đếm, pill, side counter;
     - modal uncertain/pending/disqualification;
     - khôi phục `pendingLogKey` (chỉ `localStorage.removeItem` để dọn);
     - các `recordViolation` trong handler phím/copy/paste (giữ preventDefault + toast).
   - Giữ `recordSignal` cho tín hiệu thông tin.
   - Sửa nội dung popup hướng dẫn.
   - Áp dụng cho cả `renderMochi…` và `renderClassic…`.
5. **`homework-solver.js` nhánh EXAM:** cùng thay thế. Nhánh này hầu như không chạy tới nhưng không được còn đường tự thu bài do vi phạm.
6. **Form cấu hình:** ẩn ô vi phạm.
   - `homework-config-fields.js`: bỏ ô hiển thị, giữ `<input type="hidden" id="${prefix}-violations" value="${maxViolations}">` để getter và payload không đổi.
   - `create-hw.js`: bỏ ô ở classic và Pro, thêm input hidden cùng id `hw-max-violations`; sửa mô tả bước Pro.
   - `assign-homework-modal.js`: tương tự với id `assign-custom-violations`.
   - `bindHomeworkTypeCoupling`: bỏ qua input hidden (không lock/unlock).
7. **`homework-mgmt.js`** bỏ dòng "Tối đa N lần vi phạm". **`exam-proctoring.js`** bỏ "Ngưỡng cấu hình".

## Rủi ro và cách giảm

- **Rủi ro cao nhất — phá luồng thi.** Autosave, heartbeat, nộp bài, hết giờ, `pagehide` phải giữ nguyên.
  - Diff phải giới hạn trong phần vi phạm.
  - Áp dụng review chéo: Gemini implement, ChatGPT review chỉ đọc, Claude review cuối.
  - Chạy lại các test exam-room/autosave hiện có.
- **Blur giả trên mobile** (kéo thanh thông báo, bàn phím ảo): chấp nhận che tạm, tự mở khi focus lại. Đây là hành vi đúng theo Q2.
- **Dialog nội bộ gây blur:** không. `blur` của `window` chỉ bắn khi rời trang. Modal trong trang không làm window blur.
- **Client cũ còn cache:** ngoài phạm vi (xem spec).

## Kiểm thử

- `fe/scripts/test-exam-focus-shield.mjs` (đăng ký vào `npm test`), dùng EventTarget giả:
  - che/mở theo từng sự kiện;
  - không che trước khi bắt đầu hoặc sau khi nộp;
  - idempotent;
  - đặt và gỡ `inert`.
- Test tĩnh:
  - `exam-room.js` không còn `submitExamLog` với action vi phạm;
  - không còn chữ "vi phạm" trong UI học sinh;
  - các form vẫn có input hidden `*-violations`.
- Chạy toàn bộ `npm test`, `npm run build`.
- Trình duyệt headless (mock `functions/v1/*`):
  - mở phòng thi EXAM;
  - giả lập `visibilitychange`/`blur`, chụp ở 360/768/1440 với 4 theme + classic;
  - đếm request `exam-log` = chỉ tín hiệu thông tin.
- Không dùng tài khoản thật để bắt đầu thi.

## Không đổi

API, payload, DB, Edge Functions, nghiệp vụ tính điểm/nộp bài.
