# 004 — Điểm danh trong báo cáo tiến độ học sinh

## Mục tiêu
Báo cáo tiến độ (`#student-report`, link chia sẻ `#shared-report`) hiển thị trong kỳ báo cáo:
lớp đã học những buổi nào, học sinh có mặt buổi nào, vắng buổi nào. Dữ liệu cùng nguồn với
tab Điểm danh của học sinh (RPC `fn_student_attendance`).

## Quyết định đã chốt với người dùng (2026-11-18)
- Link chia sẻ công khai cho phụ huynh **có** hiện mục Điểm danh (bỏ `sessionId` nội bộ).
- Báo cáo không chọn lớp (không có `classId`) → **ẩn** mục (điểm danh tính theo từng lớp).

## Hợp đồng API (bổ sung, không đổi trường cũ)
`GET student-history?scope=report|shared-report` thêm `attendance`:
- `null` khi báo cáo không có lớp cụ thể.
- `{ error }` khi RPC lỗi — phần còn lại của báo cáo vẫn trả bình thường.
- `{ summary: { classSessions, countedSessions, present, absent, notCounted, attendanceRate, classAverageRate },
    sessions: [{ sessionId?, date, note, status: PRESENT|ABSENT|NOT_COUNTED, classPresent, classTotal, classRate }] }`
  (`sessionId` chỉ có ở scope `report`).

Quyền: dùng lại kiểm tra hiện có của scope report (ADMIN kiểm ghi danh học sinh–lớp; STUDENT chỉ lớp của mình;
public lấy student/class/kỳ từ bản ghi share). Không có migration DB.

## Giao diện
Mục "Điểm danh trong kỳ" sau phần so sánh nửa kỳ, trước "Phân tích theo chương", ở cả classic, Mochi Pro (admin)
và Mochi (học sinh): 4 thẻ (Lớp đã học / Có mặt / Vắng / Chuyên cần so với TB lớp), ghi chú số buổi không tính,
danh sách từng buổi (thứ + ngày, ghi chú buổi, sĩ số có mặt của lớp, nhãn trạng thái; buổi vắng tô đỏ).

## Tasks
- [x] T1 Backend `supabase/functions/student-history/report-attendance.ts` + gắn vào response REPORT/SHARED_REPORT.
- [x] T2 Test backend `supabase/scripts/test-report-attendance.mjs`.
- [x] T3 FE `fe/src/js/utils/report-attendance.js` + gắn vào 3 renderer trong `student-report.js`, CSS trong `styles.css`.
- [x] T4 Test FE `fe/scripts/test-report-attendance.mjs` (đăng ký trong `npm test`).
- [x] T5 Kiểm thử trình duyệt headless (mock API): admin 1440/768/360 Sáng/Tối, link chia sẻ 412/1024, classic 1024,
      học sinh Mochi 412 Tối — không tràn ngang, không lỗi JS.
- [ ] T6 Deploy function `student-history` (chờ người dùng cho phép).
