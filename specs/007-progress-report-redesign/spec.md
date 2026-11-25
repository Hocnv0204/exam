# 007 — Thiết kế lại báo cáo tiến độ học sinh

> Trạng thái: **ĐÃ DUYỆT & IMPLEMENT LOCAL (2026-11-25) — chờ cho phép deploy/push.**

## Mục tiêu
Phụ huynh đọc 1–2 phút phải biết: con đang ở mức nào, tiến hay lùi, yếu ở đâu, cần làm gì.
Một mẫu cố định qua các tháng, in được 1–2 trang A4, in đen trắng vẫn đọc được (màu luôn kèm chữ/ký hiệu).

## Quyết định đã chốt với người dùng (2026-11-25)
- Báo cáo **giữ theo từng lớp** (1 lớp = 1 môn), như hiện tại. Link chia sẻ cũ vẫn mở được.
- Nhận xét: **hệ thống tự viết nháp từ số liệu, giáo viên (admin) sửa rồi lưu** cho từng học sinh + lớp + kỳ.
- Chuyên cần: **dùng số liệu hiện có** (Có mặt / Vắng / Không tính, tỉ lệ so với TB lớp). Không thêm đi muộn / có phép.
- **Không có** phần phản hồi của phụ huynh.

## Quyết định Claude đề xuất (cần người dùng duyệt cùng plan)
- Xếp mức theo điểm TB kỳ (thang 10): **≥ 8 Tốt · ≥ 6,5 Khá · ≥ 5 Cần cố gắng · < 5 Cần hỗ trợ ngay**; có biểu tượng + chữ.
- Xu hướng: so với **kỳ liền trước cùng độ dài** (vd 01–25/11 so với 07–31/10): ↑ tăng (> +0,25), → giữ (±0,25), ↓ giảm (< −0,25).
  Không có dữ liệu kỳ trước → "Chưa có kỳ trước để so sánh".
- Trung bình lớp: điểm TB các bạn trong lớp cùng kỳ, **chỉ để tham chiếu, không xếp hạng, không tên bạn khác**.
- Chuyên đề (chương): **✓ Đã vững ≥ 8 · ~ Tạm ổn 6,5–8 · ✗ Chưa đạt < 6,5** (xanh / vàng / đỏ + ký hiệu).
- Mức độ tư duy: tỉ lệ làm đúng theo Nhận biết / Thông hiểu / Vận dụng / Vận dụng cao — chỉ tính câu có gắn ngân hàng câu hỏi
  (`questions.question_bank_id → question_bank.difficulty`); ghi rõ số câu được tính. Câu chữ thân thiện
  (vd "Làm tốt câu cơ bản, còn lúng túng ở bài vận dụng").
- Lỗi thường gặp: **các dạng bài hay sai nhất** (tối đa 5) từ phân tích câu sai sẵn có; giáo viên bổ sung lỗi cụ thể vào nhận xét.
- ~~Giáo viên phụ trách + liên hệ~~ — **bỏ theo yêu cầu người dùng (2026-11-25)**: đầu báo cáo không in tên/SĐT/email giáo viên.
- Áp dụng cho: **admin Mochi Pro, link chia sẻ phụ huynh, học sinh Mochi**. `?ui=classic` giữ nguyên báo cáo cũ 100%.

## Bố cục (thứ tự, A4)
1. **Đầu trang**: Học sinh · Lớp · Kỳ báo cáo.
2. **Tóm tắt (khung nổi bật)**: Điểm TB kỳ (to), mức xếp loại, xu hướng so kỳ trước (↑/→/↓ + chênh lệch), TB lớp tham chiếu,
   2–3 câu nhận xét tổng quát (tiến bộ trước, cần cải thiện sau).
3. **Chuyên cần & bài tập** (bảng ngắn): buổi có mặt / tổng buổi, vắng, tỉ lệ chuyên cần (so TB lớp);
   bài được giao, đã làm, tỉ lệ hoàn thành, nộp đúng hạn; thái độ học tập (giáo viên nhập: tập trung, phát biểu).
4. **Kết quả học tập**: biểu đồ đường điểm TB **theo tuần** (kèm đường TB lớp nếu có); bảng các bài kiểm tra/bài thi trong kỳ
   (ngày, tên bài, chương, điểm, đạt/chưa); điểm TB so kỳ trước và so mục tiêu kỳ trước (nếu đã đặt).
5. **Mức độ nắm kiến thức**: bảng chuyên đề ✓/~/✗; thanh mức độ tư duy; dạng bài hay sai.
6. **Nhận xét & kế hoạch** (gạch đầu dòng): Điểm mạnh · Cần cải thiện · Mục tiêu kỳ tới (đo được, vd "Đạt TB từ 7,0") ·
   Giáo viên sẽ hỗ trợ · Phụ huynh có thể làm gì.
- Nút **In / Lưu PDF** (CSS `@media print` A4, ẩn điều hướng/nút; khối không bị cắt giữa trang).

## Hợp đồng API & DB

### Migration `20261125100000_student_report_notes.sql`
Bảng `student_report_notes`: `id uuid pk`, `student_id uuid → profiles`, `class_id uuid → classes`, `from_date date`, `to_date date`,
`summary text`, `strengths text`, `improvements text`, `attitude text`, `goal_text text`, `goal_score numeric(4,2) null (0–10)`,
`teacher_support text`, `parent_actions text`, `updated_by uuid`, `created_at`, `updated_at`; UNIQUE(student_id, class_id, from_date, to_date);
giới hạn độ dài mỗi trường (≤ 1500 ký tự). RLS bật, không policy cho anon/authenticated (chỉ đọc/ghi qua Edge Function service role).

### `GET student-history?scope=report|shared-report` — bổ sung, không đổi trường cũ
- `previousPeriod: { fromDate, toDate, summary: {averageScore, completionRate, onTimeRate, submittedCount} | null }`
- `classAverage: { averageScore, studentCount } | null` (không tên, không id học sinh khác)
- `weeklyTrend: [{ weekStart, averageScore, classAverageScore|null, submissions }]`
- `levelBreakdown: [{ level: NHAN_BIET|THONG_HIEU|VAN_DUNG|VAN_DUNG_CAO, correct, total, rate }]`
- `commonMistakes: [{ questionType, wrongCount }]` (≤ 5)
- `notes: { ...các trường nhận xét, updatedAt, isSaved: true } | null` — scope report trả bản đã lưu; shared-report trả bản đã lưu,
  **không có thì null** (phụ huynh chỉ thấy nhận xét giáo viên đã duyệt; phần tóm tắt tự động vẫn hiện từ số liệu).
- `goalPrevious: { goalScore, goalText } | null` — mục tiêu đã đặt ở kỳ liền trước (để so "đạt/chưa đạt mục tiêu").

### Edge Function mới `student-report-notes` (ADMIN)
- `GET ?studentId&classId&fromDate&toDate` → bản đã lưu hoặc `null` + `draft` (nhận xét tự sinh từ số liệu, logic thuần `logic.ts`).
- `PUT { studentId, classId, fromDate, toDate, ...fields }` → upsert, kiểm học sinh thuộc lớp; trả bản đã lưu.
- Mỗi lần gọi kiểm ADMIN ở backend; validate độ dài/kiểu.

### `api.js`
`getStudentReportNotes(params)`, `saveStudentReportNotes(payload)`.

## Giao diện admin nhập nhận xét
Trong báo cáo (admin Pro): nút **"Soạn nhận xét"** mở bảng bên cạnh/khối sửa tại chỗ, điền sẵn bản nháp tự sinh (hoặc bản đã lưu),
các ô: Tóm tắt, Điểm mạnh, Cần cải thiện, Thái độ, Mục tiêu (chữ + điểm số), GV hỗ trợ, Phụ huynh có thể làm gì; nút "Dùng lại nháp tự động",
"Lưu". Chống double submit, báo lỗi tại chỗ, cảnh báo khi rời trang chưa lưu. Link chia sẻ hiện bản đã lưu mới nhất (không cần tạo link mới).

## Tasks
- [x] T1 (Backend — Gemini high) Migration + RPC/ truy vấn kỳ trước, TB lớp, tuần, mức độ tư duy, lỗi thường gặp trong `student-history`
      (logic thuần tách file, test Node + PGlite cho migration); không đổi trường cũ; shared-report không lộ id/tên học sinh khác.
- [x] T2 (Backend — Gemini medium) Function `student-report-notes` + `logic.ts` (validate + sinh nháp nhận xét tiếng Việt: tiến bộ trước,
      cần cải thiện sau, tránh thuật ngữ) + test.
- [x] T3 (FE — Gemini high) Renderer mới `fe/src/js/views/report/progress-report.js` + CSS `fe/src/css/report/progress-report.css`
      (dùng chung cho Pro/shared/Mochi qua token theme; print A4) + test render (escape, mức xếp loại, ký hiệu màu, trạng thái trống/lỗi).
- [x] T4 (FE — Claude) Nối vào `student-report.js` (3 đường Pro/shared/Mochi; classic giữ nguyên), `api.js`, khối "Soạn nhận xét" cho admin.
- [x] T5 Review chéo T1/T2 (model free), `npm test`, build, chụp headless (admin 1440/768/360 Sáng/Tối; shared 412/1024; Mochi 4 màu; bản in A4).
- [ ] T6 Commit + push; `db push` + deploy `student-history`, `student-report-notes` (chờ người dùng cho phép; backend trước FE).

## Ghi chú kiểm thử (2026-11-25)
- Headless (Brave + CDP, mock API): admin Pro 1440/768/360 Sáng/Tối, link phụ huynh 1024/412 Sáng/Tối, học sinh Mochi 1440/768/360 Sáng/Tối —
  đủ mục, ký hiệu ✓ ~ ✗ ↑, biểu đồ SVG, không tràn ngang, không "NaN/undefined", escape đúng, không lỗi JS.
- Bản in (printToPDF A4): Pro / phụ huynh / Mochi đều 2 trang, không in sidebar/header/toast/nút.
- Vòng sửa của Claude: khoảng trống đầu báo cáo ở ≤768px (flex-basis thành chiều cao), biểu đồ nhỏ trên điện thoại,
  % dấu chấm, CSS in (ngắt trang, khung Pro/Mochi, lớp phủ loading), tối cho link phụ huynh.
- Soạn nhận xét: mở modal, chặn điểm mục tiêu ngoài 0–10, lưu cập nhật tại chỗ, giữ bộ lọc ngày + khung chia sẻ.
- `?ui=classic`: admin và link phụ huynh vẫn báo cáo cũ.
- Review chéo model free (`deepseek-v4.1-flash-free`) treo không ra output > 10 phút → dừng; Claude tự review quyền/rò rỉ dữ liệu.
