# Spec 001 — Màn che khi rời màn hình bài thi (thay cho đếm vi phạm)

Trạng thái: Đã clarify (2026-11-10) · Chờ duyệt plan/tasks

## Bối cảnh

Phòng thi (`#exam-room`, bài `type = EXAM`) hiện đếm vi phạm: chuyển tab, mất focus, phím DevTools, copy/paste.
Mỗi sự kiện được gửi lên Edge Function `exam-log`. Khi số vi phạm đạt `max_violations` (mặc định 3), máy chủ tự thu bài
(đình chỉ). Học sinh thấy bộ đếm "Vi phạm x/3" và popup cảnh báo mỗi lần quay lại.

Yêu cầu mới: bỏ việc kiểm tra vi phạm. Thay vào đó, khi làm bài thi học sinh bắt buộc phải tập trung vào màn hình.
Nếu chuyển tab hoặc cửa sổ mất focus, một banner hoạt hoạ sẽ che toàn bộ câu hỏi và đáp án để học sinh không xem được.

## Quyết định đã chốt (clarify)

| # | Câu hỏi | Quyết định |
|---|---|---|
| Q1 | Phạm vi | Chỉ bài thi `EXAM`. Bài luyện tập không đổi. |
| Q2 | Mở màn che | Tự mở ngay khi tab hoặc cửa sổ có focus trở lại. |
| Q3 | Log rời màn | Bỏ hẳn: client không gửi sự kiện rời màn/vi phạm lên `exam-log`. |
| Q4 | Ô "Giới hạn vi phạm" | Ẩn khỏi các form. Cột DB `max_violations` giữ nguyên, không migration. |

## User stories

1. **Học sinh đang thi rời màn hình.** Khi `document.hidden` hoặc cửa sổ `blur`, toàn bộ nội dung đề (câu hỏi, phương án,
   ô trả lời, bảng điều hướng câu) bị che ngay bằng banner hoạt hoạ (mascot + "Hãy quay lại màn hình thi").
   Đồng hồ vẫn chạy.
2. **Học sinh quay lại.** Khi `visibilitychange` (visible) hoặc `focus`, màn che biến mất ngay, không có popup và không bị trừ điểm.
3. **Không còn bị đình chỉ.** Không còn bộ đếm vi phạm, popup "Cảnh báo vi phạm", "Đình chỉ bài thi" hay tự thu bài do vi phạm.
4. **Admin tạo/sửa/giao bài thi.** Không còn thấy ô "Giới hạn vi phạm". Payload gửi đi vẫn có `maxViolations` (mặc định 3)
   để không đổi hợp đồng API.

## Yêu cầu chức năng

- **FR-1:** Màn che chỉ hoạt động khi bài thi đã bắt đầu (`examStarted`) và chưa nộp/khoá.
- **FR-2:** Màn che là lớp phủ đặc, toàn màn hình.
  - Banner hiển thị đồng hồ còn lại, cập nhật mỗi giây, nên học sinh vẫn thấy giờ.
  - Khi đang che, nội dung bên dưới không thể xem hay tương tác: `visibility:hidden`/`inert` cho vùng đề, không chỉ phủ lớp mờ.
  - Không in được nội dung đề (`@media print` ẩn đề khi đang thi).
- **FR-3:** Trigger che: `visibilitychange` → hidden; `window.blur`.
  - Ngoại lệ: focus chuyển vào iframe nội bộ (giữ logic cũ `activeElement.tagName === 'IFRAME'`).
  - Ngoại lệ: đang mở dialog/modal của chính ứng dụng (vd. xác nhận nộp bài).
- **FR-4:** Trigger mở: `visibilitychange` → visible và `document.hasFocus()`; hoặc `window.focus`.
- **FR-5:** Banner có hoạt hoạ nhẹ, tôn trọng `prefers-reduced-motion`.
  - Hỗ trợ cả giao diện Mochi (theme học sinh light/dark/sakura/mint) và classic (`?ui=classic`).
  - Có `role="alert"`/`aria-live`, chữ tiếng Việt.
- **FR-6:** Bỏ toàn bộ việc gửi `LEAVE_TAB`, `BLUR_TAB`, `RETURN_TAB`, `DEVTOOLS`, `COPY`, `PASTE`, `FULLSCREEN_EXIT` lên `exam-log`.
  - Bỏ hàng đợi khôi phục vi phạm chưa xác nhận (`exam_pending_log_*`) và dọn key cũ còn sót.
  - Bỏ modal "Chưa xác nhận nhật ký", "Đang xác minh bài thi", "Đình chỉ bài thi".
  - Bỏ bộ đếm/pill vi phạm.
- **FR-7:** Giữ chặn phím tắt DevTools/copy/cut/paste như hiện tại (preventDefault + toast). Chỉ không ghi log và không đếm.
- **FR-8:** Giữ nguyên, không đổi:
  - Tín hiệu thông tin `EXAM_STARTED`/`EXAM_RESUMED`/`CONNECTION_RESTORED`/`AUTOSAVE_RECOVERED`.
  - Heartbeat, autosave.
  - Phiên bị thay thế.
  - Tự nộp khi hết giờ.
  - Tự nộp khi đóng trang (`pagehide`).
- **FR-9:** Popup hướng dẫn trước khi thi đổi nội dung: thay "vi phạm quá N lần sẽ bị thu bài" bằng
  "Nếu rời màn hình, đề thi sẽ bị che cho tới khi bạn quay lại; đồng hồ vẫn chạy".
- **FR-10:** Ẩn ô "Giới hạn vi phạm" và text liên quan ở:
  - `homework-config-fields.js` (dùng trong ngân hàng câu hỏi / ma trận / tạo từ câu đã chọn);
  - `create-hw.js` (classic + Pro), `assign-homework-modal.js`;
  - dòng "Tối đa N lần vi phạm" ở `homework-mgmt.js`;
  - "Ngưỡng cấu hình: N lần" ở `exam-proctoring.js`.
  - Payload vẫn gửi `maxViolations` (giá trị cũ khi sửa, 3 khi tạo mới).
- **FR-11:** Nhánh EXAM cũ trong `homework-solver.js` (bài EXAM luôn được chuyển sang `#exam-room` ở `app.js`) được
  áp dụng cùng hành vi (che, không đếm) để không còn đường nào tự thu bài do vi phạm.

## Ngoài phạm vi

- **Không sửa backend, không deploy:** Edge Function `exam-log` vẫn nhận và đếm nếu có client cũ gửi.
  - Client mới không gửi nên không còn tự thu bài.
  - Client đang mở bản cũ (chưa tải lại) vẫn có thể bị đếm cho tới khi tải lại trang.
  - Nếu muốn chặn tuyệt đối ở server, làm spec riêng (sửa `exam-log`, cần deploy function).
- **Lịch sử cũ:** nhật ký vi phạm cũ trong trang Giám sát và màn xem bài của admin vẫn hiển thị như dữ liệu lịch sử, chỉ đọc.
- Không bắt buộc toàn màn hình (fullscreen).

## Tiêu chí chấp nhận

- **AC-1:** Đang thi, chuyển tab/thu nhỏ cửa sổ/bấm sang app khác → đề bị che. Quay lại → hết che ngay. Không có request `exam-log` nào cho các sự kiện này (kiểm bằng mock fetch).
- **AC-2:** Lặp lại 10 lần rời/quay lại → không bị khoá, không bị nộp bài, không popup cảnh báo.
- **AC-3:** Khi đang che, vùng đề có `inert` và không nhìn thấy trong ảnh chụp; đồng hồ trên banner vẫn chạy.
- **AC-4:** Bài luyện tập (PRACTICE) không bị che khi rời màn.
- **AC-5:** Form tạo/sửa/giao bài không còn chữ "vi phạm". Payload tạo bài vẫn có `maxViolations`.
- **AC-6:** `?ui=classic`: banner hoạt động. Phần HTML không liên quan tới vi phạm giữ nguyên.
- **AC-7:** `npm test` và `npm run build` pass. Có test mới cho logic che/mở (node, không cần trình duyệt thật).
