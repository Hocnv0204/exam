# 005 — Trang giới thiệu gia sư (trang chủ công khai)

> Trạng thái: **ĐÃ DUYỆT (2026-11-22) — đã implement local, chờ review chéo backend + cho phép push/deploy.**

## Mục tiêu
Khi khách truy cập `https://exam-oex4.vercel.app/` (không hash, chưa đăng nhập), trang đầu tiên là
**Giới thiệu gia sư** (route `#gioi-thieu`) thay vì Lộ trình. Gồm 4 khối:

1. **Hồ sơ gia sư** (nội dung tĩnh theo CV người dùng gửi): Nguyễn Văn Học — Gia sư Toán, Hóa học.
   - Học vấn: Công nghệ phần mềm, Học viện Công nghệ Bưu chính Viễn thông (2022–2027), xếp loại Giỏi, CPA 3.3/4.0;
     học bổng Giỏi kỳ 20232, 20252; điểm thi THPT 2022: Toán 9.2, Hóa 9.75, Lý 9.5; Giải nhì HSG cấp huyện Toán lớp 9.
   - Kinh nghiệm: Trợ giảng Hóa online (01/2023–nay, khóa Hóa online của Cô Thân Thị Liên);
     Trợ giảng Toán online (khóa Toán online của Cô Ngọc Huyền LB); Gia sư dạy kèm (10/2022–nay)
     với thành tích học sinh theo khóa 2005, 2006, 2007, 2008 và cấp THCS.
   - Liên hệ công khai: **chỉ SĐT 0349097659 (nút Gọi + Zalo) và email nguyenhh1102@gmail.com**.
     Không hiện ngày sinh, giới tính, địa chỉ.
   - Ảnh đại diện: avatar tròn chữ "NH" (có thể thay bằng ảnh sau).
2. **Lớp đang mở** — **động từ DB**: tên lớp, khối/môn, lịch học trong tuần (thứ + giờ), số học sinh đang
   theo học (ACTIVE), sĩ số tối đa / còn chỗ (nếu admin đặt), số buổi đã học. Chỉ lớp admin bật
   "Hiện trên trang giới thiệu" và chưa lưu trữ. Không bao giờ trả tên/ID học sinh.
3. **Quyền lợi khi học**: bài tập online chấm tự động + lời giải; phòng thi có giám sát & đếm giờ;
   báo cáo tiến độ chia sẻ phụ huynh qua link; điểm danh & chuyên cần; lịch học tuần; lộ trình Toán/Hóa 11–12;
   học thử miễn phí; khiếu nại câu hỏi; thành tích/huy hiệu; lịch sử làm bài; thông báo Telegram cho lớp.
4. **CTA**: Học thử miễn phí (`#trial?tab=lessons`), Xem lộ trình (`#roadmap`), Đăng nhập (`#login`), Gọi/Zalo.

## Định tuyến
- Route mới `gioi-thieu` (public, thêm `guestRoutes`). `resolveActiveRouteHash()` khi chưa đăng nhập:
  `'roadmap'` → `'gioi-thieu'`. Người đã đăng nhập giữ trang mặc định (admin/student dashboard), vẫn mở được `#gioi-thieu`.
- Thêm tab/link "Giới thiệu" ở thanh đầu trang lộ trình/học thử Mochi.
- Trang mới chỉ có bản Mochi; `?ui=classic` vẫn hiện trang này (không có trang cũ để giữ), các trang classic khác không đổi.

## Hợp đồng API & DB (mới, không đổi trường cũ)

### Migration `20261122000000_public_class_intro.sql`
`classes` thêm:
- `public_listed BOOLEAN NOT NULL DEFAULT FALSE`
- `public_schedule JSONB NOT NULL DEFAULT '[]'` — mảng `{ day: 1..7 (1=Thứ 2 … 6=Thứ 7, 7=Chủ nhật), start: 'HH:MM', end: 'HH:MM' }`, CHECK là mảng.
- `max_students INT NULL CHECK (max_students > 0)`

RPC `fn_public_class_intro()` — `SECURITY DEFINER`, `SET search_path = public`, REVOKE PUBLIC/anon/authenticated,
GRANT service_role. Trả `classId, name, gradeBlock, description, schedule, maxStudents, activeStudents
(COUNT student_classes status='ACTIVE'), sessionsHeld (COUNT attendance_sessions)` cho lớp `public_listed AND NOT is_archived`.

### Edge Function mới `public-intro` (`verify_jwt = false`)
`GET public-intro` → `{ classes: [...], totals: { classes, activeStudents } }`, header `Cache-Control: public, max-age=300`.
Chỉ GET; method khác 405. Không đọc Authorization.

### `create-class` action mới `update-public-intro` (ADMIN)
`PATCH { action:'update-public-intro', classId, publicListed, schedule, maxStudents|null }` → validate (zod, logic.ts thuần):
tối đa 7 khung, `day` 1..7, giờ `HH:MM`, `start < end`, `maxStudents` 1..500 hoặc null. GET danh sách/chi tiết lớp bổ sung
`publicListed, publicSchedule, maxStudents`.

### `api.js`
- `getPublicIntro()` → `request('public-intro', { isPublic: true, omitAuthorization: true, silent: true })`
- `updateClassPublicIntro({ classId, publicListed, schedule, maxStudents })`

## Giao diện admin
Tab **Cài đặt** của chi tiết lớp (`class-details.js`): thẻ mới "Trang giới thiệu" — công tắc hiện lớp,
danh sách khung giờ (chọn thứ + giờ bắt đầu/kết thúc, thêm/xóa), sĩ số tối đa; nút Lưu riêng (chống double submit).
Chỉ giao diện Mochi Pro; `?ui=classic` giữ nguyên 100% (admin classic chuyển sang Pro để chỉnh).

## Trạng thái giao diện trang giới thiệu
- Loading: skeleton 3 thẻ lớp. Lỗi API: thông báo nhẹ "Chưa tải được lịch lớp" + nút Thử lại; hồ sơ/quyền lợi vẫn hiện.
- Trống: "Hiện chưa có lớp mở công khai — liên hệ để được xếp lớp".
- Responsive 360–1440, 4 chế độ màu Mochi, nút ≥44px, escape mọi dữ liệu từ DB.

## Tasks
- [x] T1 (Backend) Migration + RPC; test PGlite `supabase/scripts/test-public-class-intro-db.mjs` (oracle JS: chỉ lớp listed & chưa lưu trữ, đếm ACTIVE, không lộ học sinh, quyền EXECUTE).
- [x] T2 (Backend) Function `public-intro` + `logic.ts`; action `update-public-intro` + trường GET trong `create-class`; `config.toml`; test Node `supabase/scripts/test-public-intro-logic.mjs`.
- [x] T3 (FE, Claude sở hữu file dùng chung) `api.js` wrapper; `app.js` route + guest default; link "Giới thiệu" trên header lộ trình Mochi.
- [x] T4 (FE) View `fe/src/js/views/mochi/tutor-intro.js`, dữ liệu `fe/src/js/data/tutor-profile.js`, CSS `fe/src/css/mochi/tutor-intro.css`; test `fe/scripts/test-tutor-intro.mjs`.
- [x] T5 (FE) Thẻ "Trang giới thiệu" trong tab Cài đặt `class-details.js` (+ CSS admin-pro).
- [ ] T6 Review chéo (T1/T2 backend), `npm test`, `npm run build`, chụp headless 360/412/768/1024/1440 × 4 chế độ màu (mock API).
- [ ] T7 Commit + push `main` (FE) — chờ người dùng cho phép.
- [ ] T8 `supabase db push` + deploy `public-intro`, `create-class` — chờ người dùng cho phép.
  Lưu ý: FE push trước khi deploy backend → mục "Lớp đang mở" hiện trạng thái lỗi/Thử lại cho tới khi deploy.

Phân công thực tế: T1+T2 Gemini `gemini-3.8-flash-high`; review chéo chỉ đọc `opencode/deepseek-v4.1-flash-free`;
T4 `github-copilot/gpt-5.6-sol` (terra không khả dụng) + Claude chỉnh topbar dùng chung; T5 `github-copilot/gpt-5.6-sol`;
T3, sửa test, review cuối, chụp headless: Claude. (ChatGPT ngừng dùng từ 2026-11-22.)
