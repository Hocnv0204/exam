# 006 — Tutorial học sinh trên giao diện Mochi

> Trạng thái: **ĐÃ DUYỆT & IMPLEMENT LOCAL (2026-11-22) — chờ cho phép deploy/push.**

## Vì sao làm lại (rà soát 2026-11-22, `opencode/deepseek-v4.1-flash-free` + Claude đối chiếu)
- Tour dashboard trên Mochi mất 2/5 bước: `[data-tour-nav]` chỉ có ở sidebar classic (`sidebar.js:216`), `startTour` lọc im lặng.
- Giao diện tour màu cứng `#0066cc`/trắng, không theo 4 chế độ màu; nút ~28px; không Esc/focus/aria; không `prefers-reduced-motion`.
- Đánh dấu "đã xem" ngay khi mở; cờ lần-đầu tiêu thụ lúc login nên đăng nhập qua link bài rồi đóng tab là mất tour;
  tour mở tay không tự dọn khi đổi route; admin mượn phiên bấm "Hướng dẫn" ghi `seen_tours` của học sinh.
- Nội dung thiếu: Tiếp tục, gợi ý ôn, bài làm dở, thành tích, đổi màu, điều hướng, điểm danh, lịch sử, bài học, phòng thi.

## Quyết định đã chốt với người dùng
- Phạm vi: **màn chào mừng + tour trang chủ**, và **tour ngắn cho từng trang chính** (tự mở lần đầu vào trang + nút "Hướng dẫn").
- **Học sinh cũ cũng xem lại 1 lần.**
- Kiểu: **spotlight + linh vật Mochi** (bong bóng lời thoại, 4 chế độ màu; điện thoại = thẻ trượt từ dưới lên).

## Thiết kế

### Trạng thái "đã xem"
- Key mới (v2): `m2-welcome` (chào mừng + trang chủ), `m2-classes`, `m2-lesson`, `m2-homeworks`, `m2-attendance`,
  `m2-history`, `m2-achievements`. Key v2 không có trong `seen_tours` của ai → mọi học sinh (mới và cũ) thấy đúng 1 lần.
  Không cần sửa dữ liệu hàng loạt; cờ `auto_intro_pending` không còn quyết định tour Mochi.
- Tự mở khi: role STUDENT, Mochi bật, **không** đang mượn phiên, key chưa có trong `state.user.seenTours` và chưa có cờ localStorage.
- Ghi "đã xem" khi **Hoàn thành hoặc Bỏ qua/Esc/đóng** (không ghi lúc mở). Lỗi API → vẫn giữ cờ localStorage để không lặp vô hạn.
- Đang mượn phiên (admin): tour vẫn mở tay được để xem thử, nhưng **không ghi** `seen_tours`.

### Backend (đổi hợp đồng nhỏ)
- Migration `20261122020000_mark_tour_seen.sql`: RPC `fn_mark_tour_seen(p_user_id uuid, p_key text) RETURNS text[]` — thêm key
  nguyên tử, không trùng (sửa lỗi đọc-sửa-ghi khi 2 tab); `SECURITY DEFINER`, `search_path=public`, chỉ `service_role`.
  Không đổi dữ liệu có sẵn.
- `login` PATCH `{ tourKey }`: whitelist thêm 7 key v2 (giữ 3 key cũ), dùng RPC trên, trả `{ seenTours }`; lỗi DB → 500 thật.

### Frontend
- Engine mới `fe/src/js/utils/mochi-tour.js` + CSS `fe/src/css/mochi/tour.css` (scope `html[data-ui="mochi"]`, token `--m-*`):
  - Màn chào mừng (bước 0, không spotlight): linh vật lớn, lời chào theo tên, 3 gạch đầu dòng "ở đây bạn làm được gì", nút "Bắt đầu tham quan" / "Để sau".
  - Bước spotlight: khoanh vùng phần tử **đang hiển thị** (bỏ qua bản ẩn, vd sidebar desktop trên mobile), bong bóng có linh vật,
    "Bước x/y" + chấm tiến độ, Bỏ qua / Quay lại / Tiếp (≥44px). ≤640px: thẻ trượt dưới đáy màn hình.
  - `role="dialog"`, `aria-modal`, `aria-labelledby`, focus vào bong bóng, Tab vòng trong bong bóng, Esc = Bỏ qua, ←/→ đổi bước,
    trả focus về chỗ cũ khi đóng; `prefers-reduced-motion` tắt hiệu ứng.
  - Tự dọn khi đổi route (mọi tour, kể cả mở tay); huỷ timer định vị cũ; bước thiếu phần tử → bỏ qua; không còn bước nào → toast "Trang này chưa có gì để hướng dẫn".
- Nội dung `fe/src/js/data/student-tours.js` (selector dùng thuộc tính `data-tour="…"` thêm vào markup Mochi, không dùng id dễ đổi):

| Tour | Trang | Bước |
|---|---|---|
| `m2-welcome` | Trang chủ | Chào mừng → Tiếp tục → Bài cần làm → Bài đang làm dở → Gợi ý ôn lại → Tiến độ → Điểm gần đây → Thành tích → Đổi chế độ màu → Thanh điều hướng (sidebar desktop / tab bar điện thoại, có mục "Thêm") → Nút "Hướng dẫn" xem lại |
| `m2-classes` | Lớp của tôi | Chọn lớp → Tab Theo chương / Bài mới cập nhật → Bản đồ bài học (trạng thái bài) |
| `m2-lesson` | Bài học | 3 bước học (video → tài liệu → bài tập) → Tài liệu Xem/Tải → Bài tập của bài → Bài trước/sau |
| `m2-homeworks` | Bài tập | Lọc/tìm/sắp xếp → Thẻ bài (hạn nộp, trạng thái) → Làm bài / Xem kết quả / Làm lại → Bài thi: phòng thi giám sát (toàn màn hình, không rời tab, tự nộp khi hết giờ) |
| `m2-attendance` | Điểm danh | Tỉ lệ chuyên cần → Danh sách buổi có mặt/vắng |
| `m2-history` | Lịch sử làm bài | Danh sách lượt nộp → Xem lại bài làm & lời giải → Báo cáo tiến độ |
| `m2-achievements` | Thành tích | XP & cấp → Chuỗi ngày học → Huy hiệu |

  Câu chữ cuối cùng do Claude duyệt; giọng thân thiện, xưng "Mochi" – "bạn".
- **Không** tự mở tour trong phòng thi / trang làm bài (tránh ăn giờ thi); hướng dẫn phòng thi nằm trong tour Bài tập.
- `?ui=classic`: giữ nguyên tour cũ (`tour.js`, 3 tour classic) 100%.

## Tasks
- [x] T1 (Backend — Gemini `gemini-3.8-flash-medium`) Migration RPC + `login` PATCH + test PGlite `supabase/scripts/test-mark-tour-seen-db.mjs` + test logic whitelist.
- [x] T2 (FE engine — Gemini `gemini-3.8-flash-high`) `mochi-tour.js` + `tour.css` + `fe/scripts/test-mochi-tour.mjs` (thứ tự bước, bỏ bước ẩn, ghi seen khi đóng không khi mở, không ghi khi mượn phiên, Esc/phím, dọn khi đổi route).
- [x] T3 (FE nội dung — Claude) `student-tours.js`, thuộc tính `data-tour` trên view Mochi (`student-home.js`, `sidebar.js`/tab bar, `my-classes.js` phần Mochi, `mochi/lesson-detail.js`, `my-homeworks.js`, `attendance.js`, `learning-history.js`, `achievements.js`), nút "Hướng dẫn" từng trang, gắn tự mở. Chạy sau T2 (dùng API engine).
- [x] T4 Review chéo T1 (model free khác), `npm test`, `npm run build`, chụp headless 360/412/768/1024/1440 × 4 chế độ màu từng tour (mock API), soát ảnh bằng `opencode/nemotron-3.5-super-vl-free`.
- [ ] T5 Commit + push (chờ người dùng cho phép).
- [ ] T6 `db push` + deploy `login` (chờ người dùng cho phép). Lưu ý: deploy backend **trước** push FE, nếu không PATCH key v2 bị 400 (tour vẫn chạy nhờ localStorage nhưng không đồng bộ thiết bị).

## Ghi chú kiểm thử (2026-11-22)
- Headless (Brave + CDP, mock API): 7 tour × 360/412/768/1024/1440 × Sáng/Tối/Sakura/Bạc hà (ma trận rút gọn) — tự mở đúng,
  bong bóng trong khung nhìn, nút ≥44px, focus trong hộp thoại, không tràn ngang, không lỗi JS, PATCH `tourKey` đúng 1 lần/tour khi đóng.
- Vòng sửa: ≤640px thẻ đáy che phần tử cố định/cuối trang → thẻ tự lên mép trên. Còn chồng lấn có chủ đích với khối cao hơn màn hình.
- Classic (`?ui=classic`): không có tour Mochi, nút Hướng dẫn mở tour cũ, không có `data-tour` trong DOM.
- Review chéo backend (`opencode/deepseek-v4.1-flash-free`): không vấn đề chặn. Test "song song" trên PGlite thực chất tuần tự;
  chống trùng key dựa vào khoá dòng UPDATE của Postgres (READ COMMITTED), chưa có test đồng thời thật.
