# TỔNG HỢP CÁC CHỨC NĂNG HỆ THỐNG QUẢN LÝ HỌC TẬP & THI TRỰC TUYẾN (EXAM SYSTEM)

> **Ngày cập nhật:** Tháng 9/2026  
> **Kiến trúc:** Frontend SPA (Vanilla JS, Vite, CSS Modules) + Backend Serverless (Supabase, PostgreSQL 15+, Deno TypeScript Edge Functions, Supabase Storage).

---

## MỤC LỤC

1. [Kiến trúc & Công nghệ Tổng quan](#1-kiến-trúc--công-nghệ-tổng-quan)
2. [Phân hệ Quản trị viên & Giáo viên (ADMIN)](#2-phân-hệ-quản-trị-viên--giáo-viên-admin)
   - [2.1. Trung tâm Báo cáo & Thống kê (Dashboard & Analytics)](#21-trung-tâm-báo-cáo--thống-kê-dashboard--analytics)
   - [2.2. Quản lý Lớp học, Điểm danh & Học phí](#22-quản-lý-lớp-học-điểm-danh--học-phí)
   - [2.3. Tích hợp Bot Telegram Thông Báo Tự Động](#23-tích-hợp-bot-telegram-thông-báo-tự-động)
   - [2.4. Quản lý Khung Đào tạo (Chương trình học)](#24-quản-lý-khung-đào-tạo-chương-trình-học)
   - [2.5. Tạo & Chỉnh sửa Đề bài tập / Đề thi](#25-tạo--chỉnh-sửa-đề-bài-tập--đề-thi)
   - [2.6. Quản lý Kho Bài tập & Đề thi](#26-quản-lý-kho-bài-tập--đề-thi)
   - [2.7. Quản lý Tài khoản Học sinh](#27-quản-lý-tài-khoản-học-sinh)
   - [2.8. Giám sát & Quản lý Lịch sử Nộp bài](#28-giám-sát--quản-lý-lịch-sử-nộp-bài)
3. [Phân hệ Học sinh Chính thức (STUDENT)](#3-phân-hệ-học-sinh-chính-thức-student)
   - [3.1. Xác thực & Quản lý Phiên làm việc](#31-xác-thực--quản-lý-phiên-làm-việc)
   - [3.2. Cổng thông tin Học sinh ("Lớp học của tôi")](#32-cổng-thông-tin-học-sinh-lớp-học-của-tôi)
   - [3.3. Xem Bài giảng & Tài liệu Lý thuyết](#33-xem-bài-giảng--tài-liệu-lý-thuyết)
   - [3.4. Phòng Thi Trực tuyến & Giải Bài tập (Exam & Practice Room)](#34-phòng-thi-trực-tuyến--giải-bài-tập-exam--practice-room)
   - [3.5. Cơ chế Giám sát Chống gian lận (Anti-Cheating Engine)](#35-cơ-chế-giám-sát-chống-gian-lận-anti-cheating-engine)
   - [3.6. Xem lại Bài làm & Kết quả Chi tiết (Assignment Review)](#36-xem-lại-bài-làm--kết-quả-chi-tiết-assignment-review)
   - [3.7. Lịch sử Học tập Cá nhân](#37-lịch-sử-học-tập-cá-nhân)
4. [Phân hệ Học thử & Trải nghiệm (GUEST / TRIAL Mode)](#4-phân-hệ-học-thử--trải-nghiệm-guest--trial-mode)
5. [Động cơ Chấm điểm Tự động (Grading Engine)](#5-động-cơ-chấm-điểm-tự-động-grading-engine)
6. [Hạ tầng Kỹ thuật & Cơ chế Bảo mật (Security & Architecture)](#6-hạ-tầng-kỹ-thuật--cơ-chế-bảo-mật-security--architecture)
7. [Danh mục API & Supabase Edge Functions](#7-danh-mục-api--supabase-edge-functions)

---

## 1. Kiến trúc & Công nghệ Tổng quan

Hệ thống được thiết kế theo mô hình kiến trúc hiện đại, phân tách độc lập giữa giao diện người dùng (Frontend SPA) và dịch vụ xử lý đám mây (Cloud Backend):

- **Giao diện (Frontend)**:
  - Công nghệ: Vanilla JavaScript ES Modules, HTML5, CSS3, Vite bundler.
  - Thiết kế: Hiện đại, giao diện thẻ (Card-based), responsive đa thiết bị (Desktop / Mobile / Tablet), hỗ trợ Split View (chia đôi màn hình PDF và phiếu trả lời).
  - Thư viện tích hợp: Trình đọc PDF nhúng (PDF.js / Canvas-based), biểu tượng FontAwesome 6, hệ thống thông báo Toast, hộp thoại Modal động.
- **Dịch vụ dữ liệu & Serverless (Backend)**:
  - Nền tảng: **Supabase** (PostgreSQL 15+, Supabase Auth, Supabase Storage, Deno Edge Functions).
  - Ngôn ngữ: TypeScript, SQL.
  - Phân quyền dữ liệu cấp dòng (**Row Level Security - RLS**) đảm bảo tính cô lập và bảo mật cao nhất.
- **Mô hình Phân quyền (RBAC - Role-Based Access Control)**:
  - **ADMIN**: Quản trị viên, giáo viên toàn quyền quản lý lớp học, học sinh, đề thi, chấm thi, tài chính học phí, thống kê và cấu hình bot.
  - **STUDENT**: Học sinh được cấp tài khoản, học theo lộ trình các lớp được phân bổ, làm bài luyện tập, tham gia phòng thi chính thức, xem điểm và lịch sử học tập.
  - **GUEST**: Người dùng vãng lai, phụ huynh hoặc học sinh chưa có tài khoản trải nghiệm các bài học thử và thi thử.

---

## 2. Phân hệ Quản trị viên & Giáo viên (ADMIN)

### 2.1. Trung tâm Báo cáo & Thống kê (Dashboard & Analytics)
- **Chỉ số học tập tổng quan (Academic Metrics)**:
  - Tổng số học sinh trong hệ thống.
  - Tổng số lớp học đang hoạt động.
  - Tổng số đề bài tập / đề thi đã phát hành.
  - Tổng số lượt nộp bài của toàn bộ học sinh.
  - Điểm trung bình toàn hệ thống (phân loại nhãn: *Xuất sắc*, *Khá*, *Đạt chuẩn*, *Cần cải thiện*).
  - Tỷ lệ hoàn thành đạt yêu cầu (`passRate %`).
  - Tỷ lệ nộp bài đúng hạn (`onTimeRate %`).
- **Chỉ số tài chính & Quản lý Học phí (Financial Analytics)**:
  - Tổng doanh thu học phí dự kiến thu (`totalTuitionFee`).
  - Số tiền học phí đã thu thực tế (`paidTuitionFee`).
  - Số tiền học phí còn nợ/chưa thu (`unpaidTuitionFee`).
  - Tỷ lệ thu hồi học phí (`collectionRate %`).
  - Biểu đồ và dữ liệu theo dõi doanh thu học phí theo từng tháng.
- **Phân tích Phổ điểm (Score Distribution)**:
  - Thống kê tỷ lệ học sinh đạt các mức điểm: Xuất sắc (≥ 8.0), Giỏi (≥ 6.5), Khá (≥ 5.0), Trung bình, và Yếu (< 5.0).
- **Phân tích Thời gian nộp bài**:
  - Tỷ lệ nộp đúng hạn vs nộp muộn sau Deadline (`is_late`).
- **Bảng hoạt động nộp bài gần nhất (Recent Submissions Feed)**:
  - Danh sách bài nộp mới nhất theo thời gian thực (Tên học sinh, Lớp, Tên bài, Điểm số, Thời gian nộp).
  - Shortcut xem nhanh kết quả chi tiết từng bài làm.

### 2.2. Quản lý Lớp học, Điểm danh & Học phí
- **Quản lý danh mục lớp học**:
  - Tạo mới lớp học, cập nhật tên và mô tả lớp học, xóa lớp học.
  - Cấu hình đơn giá học phí quy định theo buổi học (`tuitionFee VND/buổi`).
  - Hiển thị sĩ số và tiến độ học tập trung bình của từng lớp.
- **Hỗ trợ 1 học sinh tham gia nhiều lớp**:
  - Quản lý phân lớp linh hoạt qua bảng `student_classes`.
- **Lịch học lớp & Điểm danh buổi học (Class Sessions & Attendance)**:
  - Thiết lập danh sách ngày học trong từng tháng cho cả lớp (`class_sessions`).
  - Điểm danh và ghi nhận số buổi tham gia thực tế của từng học sinh (`student_sessions`).
- **Theo dõi Học phí từng học sinh**:
  - Tự động tính toán tổng học phí phải nộp dựa trên số buổi tham gia thực tế × đơn giá buổi.
  - Quản lý trạng thái thanh toán học phí theo tháng (Đã thanh toán / Chưa thanh toán `is_paid`).
  - Giao diện chọn tháng và tích chọn ngày học trực quan theo lịch.

### 2.3. Tích hợp Bot Telegram Thông Báo Tự Động
- **Cấu hình liên kết lớp học với Nhóm/Kênh Telegram**:
  - Mỗi lớp học có thể liên kết với một nhóm hoặc kênh Telegram riêng (`telegram_configs`).
  - Tích hợp Webhook Bot Telegram nhận diện lệnh:
    - `/start`: Hướng dẫn sử dụng và lấy cú pháp liên kết.
    - `/link <class_id>`: Tự động ghi nhận `chat_id`, tên nhóm và kích hoạt liên kết cho lớp.
- **Thông báo nộp bài tức thì (Real-time Submission Notification)**:
  - Ngay khi học sinh hoàn thành nộp bài, hệ thống gửi thông báo tự động (bất đồng bộ) vào nhóm Telegram:
    - 🎓 Tên học sinh (hoặc tên khách học thử)
    - 🏫 Tên lớp học
    - 📝 Tên bài tập / bài thi
    - ⏱ Thời gian nộp bài
    - 📊 Điểm số đạt được / Điểm tối đa (Kèm trạng thái Đạt / Không đạt)
    - ✅ Số câu đúng / Số câu sai
- **Quản lý trạng thái thông báo**:
  - Nút sao chép nhanh lệnh `/link <class_id>`.
  - Bật / Tắt tạm thời thông báo hoặc Hủy liên kết Telegram ngay trên giao diện web.

### 2.4. Quản lý Khung Đào tạo (Chương trình học)
- **Cấu trúc phân cấp 3 tầng chuẩn mực**:
  $$\text{Lớp học (Class)} \longrightarrow \text{Chương học (Chapter)} \longrightarrow \text{Bài học (Lesson)}$$
- **Quản lý Chương học (Chapters)**:
  - Thêm, sửa tên chương học, xóa chương học.
  - Sắp xếp thứ tự chương học theo `order_index`.
- **Quản lý Bài học (Lessons)**:
  - Thêm, sửa, xóa bài học trong từng chương.
  - Gắn liên kết **Video bài giảng**: Hỗ trợ nhúng video YouTube, video Google Drive Preview, hoặc link video trực tiếp.
  - Upload **Tài liệu Lý thuyết dạng PDF**: Lưu trữ trên Supabase Storage, xem trước trực tiếp trên giao diện bằng PDF Viewer nhúng.
  - Đánh dấu **Bài học thử (`is_trial = true`)**: Cho phép người dùng bên ngoài học thử mà không cần đăng nhập.
  - Xem danh sách bài tập được gắn vào bài học, điều hướng nhanh đến trang tạo bài tập.

### 2.5. Tạo & Chỉnh sửa Đề bài tập / Đề thi
- **Giao diện soạn thảo hiện đại (Split View)**:
  - Màn hình chia đôi: Một bên là khung xem trước đề thi PDF trực quan (hỗ trợ kéo thả upload file), một bên là bảng cấu hình và ma trận đáp án.
- **Cấu hình thông số đề thi**:
  - Tiêu đề bài tập.
  - Phân loại theo Lớp -> Chương -> Bài học.
  - Phân loại chế độ: **Luyện tập (`PRACTICE`)** hoặc **Phòng thi chính thức (`EXAM`)**.
  - Thời gian làm bài (`durationMinutes` - tính theo phút).
  - Hạn nộp bài (`deadline` - ngày giờ hết hạn).
  - Số lần làm bài tối đa (`maxAttempts` - đặt bằng 0 nếu không giới hạn).
  - Số lần vi phạm tối đa cho phép trong phòng thi (`maxViolations` - áp dụng cho bài thi `EXAM`).
  - Điểm đạt (`passScore`) và Điểm tối đa (`maxScore`).
- **Ma trận Đáp án đa năng hỗ trợ 3 dạng câu hỏi chuẩn Bộ Giáo Dục**:
  1. **Trắc nghiệm 4 lựa chọn (`MULTIPLE_CHOICE`)**:
     - Lựa chọn A, B, C, D trực quan.
     - Tùy chỉnh số lượng câu linh hoạt.
  2. **Trắc nghiệm Đúng / Sai 4 ý (`TRUE_FALSE`)**:
     - Mỗi câu gồm 4 phát biểu độc lập (a, b, c, d / s1, s2, s3, s4).
     - Cho phép chọn Đúng / Sai cho từng phát biểu riêng biệt.
  3. **Trả lời ngắn / Điền số (`SHORT_ANSWER`)**:
     - Nhập số đáp án dự kiến (hỗ trợ số nguyên, số thập phân âm/dương).
     - Cấu hình dung sai cho phép (`saTolerance`) cho các bài toán xấp xỉ / đo lường.
- **Bảo mật tuyệt đối bộ đáp án (`question_answers`)**:
  - Đáp án chuẩn được lưu riêng biệt và bảo vệ bằng RLS nghiêm ngặt, học sinh hoàn toàn không thể xem được đáp án qua bất kỳ công cụ soi mã hay Network Tab nào.
- **Chế độ Chỉnh sửa (Edit Mode)**:
  - Cho phép tải lại toàn bộ nội dung đề, file PDF cũ và ma trận đáp án hiện tại để cập nhật mà không làm hỏng dữ liệu.

### 2.6. Quản lý Kho Bài tập & Đề thi
- Thống kê nhanh: Tổng số bài, số bài luyện tập, số bài thi chính thức, số lớp đang áp dụng.
- Tìm kiếm bài tập theo tiêu đề đề thi.
- Bộ lọc kết hợp: Theo Lớp học, Theo Chương, Theo Bài học, Theo Thể loại (`PRACTICE` / `EXAM`).
- Sắp xếp linh hoạt (Mới nhất, Cũ nhất, Tên A-Z).
- Phân trang hiển thị.
- Các thao tác nhanh: Xem chi tiết, Chỉnh sửa đề & đáp án, Xem thống kê nộp bài, Xóa bài tập.

### 2.7. Quản lý Tài khoản Học sinh
- Danh sách học sinh phân trang, hỗ trợ tìm kiếm theo Họ tên, Mã học sinh, Tên đăng nhập (`username`).
- Bộ lọc học sinh theo từng lớp học.
- **Tạo học sinh mới**:
  - Nhập họ và tên, mã học sinh, username, mật khẩu khởi tạo.
  - Phân bổ học sinh vào một hoặc nhiều lớp học thông qua danh sách checkbox trực quan.
- **Chỉnh sửa thông tin học sinh**: Cập nhật họ tên, điều chỉnh danh sách lớp học được gán.
- **Đặt lại mật khẩu (Reset Password)**: Cho phép giáo viên cấp mật khẩu mới trực tiếp khi học sinh quên mật khẩu.
- **Xóa tài khoản học sinh**: Xóa an toàn dữ liệu học sinh khỏi hệ thống.

### 2.8. Giám sát & Quản lý Lịch sử Nộp bài
- Bộ lọc bài nộp theo Lớp học và theo từng Bài tập cụ thể.
- **Hệ thống điều hướng 2 Tab tiện dụng**:
  - **Tab 1: "Đã nộp bài" (`Submitted`)**:
    - Danh sách học sinh đã hoàn thành bài làm.
    - Điểm số đạt được, số câu đúng/sai, thời gian làm bài thực tế (phút/giây).
    - Cảnh báo trạng thái: Nộp đúng hạn hay Nộp trễ (`is_late`).
    - Số lần vi phạm quy chế thi được ghi nhận trong phiên làm bài.
    - Nút xem lại bài làm chi tiết của từng học sinh.
  - **Tab 2: "Chưa nộp bài" (`Unsubmitted`)**:
    - Liệt kê toàn bộ học sinh trong lớp chưa hoàn thành bài tập.
    - Phân loại rõ: *Chưa bắt đầu làm* (`NOT_STARTED`) hoặc *Đang làm dở* (`IN_PROGRESS`).
    - Tính năng **Xuất danh sách chưa nộp ra file CSV** để gửi báo cáo hoặc đôn đốc học sinh.
- **Thống kê Câu sai nhiều nhất (Wrong Questions Summary)**:
  - Tự động thống kê các câu hỏi có tỷ lệ học sinh làm sai cao nhất trong bài tập, giúp giáo viên nhận diện phần kiến thức học sinh còn yếu để giảng lại.
- **Tính năng Mở lại bài thi (`Reopen Submission`)**:
  - Xử lý các tình huống học sinh gặp sự cố mạng, mất điện hoặc được phép thi lại:
    - Chuyển bài nộp cũ về trạng thái lưu trữ (`REOPENED_ARCHIVED`).
    - Tùy chọn đặt lại thời gian làm bài (Reset Timer).
    - Tùy chọn xóa nháp câu trả lời cũ (Reset Draft Answers).
    - Tẩy trắng nhật ký vi phạm cũ để học sinh thi lại công bằng.

---

## 3. Phân hệ Học sinh Chính thức (STUDENT)

### 3.1. Xác thực & Quản lý Phiên làm việc
- Đăng nhập bảo mật bằng `username` và `password` được nhà trường cấp.
- Cơ chế **Tự động làm mới phiên ngầm (Silent Token Refresh)**:
  - Khi Access Token hết hạn, hệ thống tự động sử dụng Refresh Token để lấy Access Token mới thông qua Edge Function `refresh-token`.
  - Học sinh không bị ngắt quãng phiên làm bài hay bị văng ra trang đăng nhập giữa chừng.

### 3.2. Cổng thông tin Học sinh ("Lớp học của tôi")
- Hiển thị danh sách các lớp học mà học sinh đang theo học.
- Thanh tiến độ phần trăm hoàn thành môn học (`progress %`).
- **Khu vực "Bài tập cần làm" (To-Do List)**:
  - Liệt kê các bài tập được giao chưa làm hoặc chưa đạt.
  - Hiển thị rõ Hạn nộp (Deadline), số lần làm còn lại, cảnh báo đỏ nếu bài tập đã quá hạn.

### 3.3. Xem Bài giảng & Tài liệu Lý thuyết
- Học sinh chọn bài học trong từng chương:
  - **Trình phát Video bài giảng**: Hỗ trợ phóng to toàn màn hình, xem trực tiếp video bài giảng của thầy cô.
  - **Trình đọc Tài liệu Lý thuyết**: Tích hợp công cụ xem tài liệu PDF trực tiếp, có nút mở trong tab mới hoặc tải về máy.

### 3.4. Phòng Thi Trực tuyến & Giải Bài tập (Exam & Practice Room)
- **Hộp thoại xác nhận bắt đầu**: Cảnh báo đồng hồ đếm ngược sẽ bắt đầu chạy ngay khi xác nhận.
- **Giao diện Split View tiện lợi**:
  - Bên trái: Đề bài dạng PDF sắc nét với đầy đủ thanh công cụ (thu phóng zoom in/out, chuyển trang, lật trang).
  - Bên phải: Phiếu điền đáp án được chia theo từng phần rõ ràng.
- **Bảng điều hướng câu hỏi (Quick-jump Palette)**:
  - Đánh số thứ tự tất cả các câu hỏi.
  - Tô màu trực quan câu hỏi đã làm và câu hỏi chưa làm, nhấp chuột để cuộn nhanh đến câu tương ứng.
- **Đồng hồ đếm ngược thời gian thực (Countdown Timer)**:
  - Hiển thị số phút và giây còn lại.
  - Cảnh báo Toast màu vàng khi còn 5 phút cuối.
  - Tự động khóa phiếu và thu bài khi hết giờ.
- **Cơ chế Tự động Lưu nháp (Autosave & Recovery)**:
  - Tự động lưu đáp án sau mỗi thao tác chọn câu trả lời vào `localStorage`.
  - Định kỳ đồng bộ câu trả lời nháp lên cơ sở dữ liệu đám mây qua Edge Function `exam-session`.
  - Hiển thị nhãn trạng thái *"Đã lưu nháp"* kèm mốc thời gian.
  - Khôi phục nguyên vẹn trạng thái bài làm nếu vô tình tải lại trang (F5).
- **Kiểm soát Lượt làm bài (`maxAttempts`)**:
  - Hiển thị số lần đã làm / số lần tối đa.
  - Khóa truy cập nếu đã dùng hết số lượt làm bài cho phép.
- **Cơ chế Nộp bài Trễ (Late Submission Grace)**:
  - Nếu học sinh nộp sau Deadline, hệ thống vẫn chấp nhận bài nộp nhưng tự động gắn cờ `is_late = true` để giáo viên xem xét, tránh việc học sinh mất trắng điểm do trễ vài giây.

### 3.5. Cơ chế Giám sát Chống gian lận (Anti-Cheating Engine)
*(Được kích hoạt tự động đối với các bài kiểm tra / bài thi có chế độ `EXAM`)*

1. **Khóa duy nhất một phiên làm bài (Single Active Session Lock)**:
   - Sử dụng bảng `exam_sessions` với cơ chế Session Token và nhịp tim (`heartbeat` 90 giây).
   - Ngăn chặn triệt để hành vi đăng nhập tài khoản trên 2 máy tính hoặc 2 tab trình duyệt cùng lúc để làm hộ bài thi.
2. **Phát hiện chuyển Tab hoặc thu nhỏ trình duyệt**:
   - Bắt sự kiện `visibilitychange`: Tự động ghi lại hành động rời tab (`LEAVE_TAB`) và quay lại tab (`RETURN_TAB`).
3. **Phát hiện mất tiêu điểm màn hình (Window Blur)**:
   - Bắt sự kiện `window.blur`: Ghi nhận ngay khi học sinh chuyển sang ứng dụng khác (mở Zalo, Messenger, tài liệu bên ngoài...).
4. **Chặn thao tác Sao chép & Dán (Copy/Paste Blocking)**:
   - Vô hiệu hóa phím tắt `Ctrl+C`, `Ctrl+V` và chuột phải trên nội dung đề bài và phiếu điền câu hỏi.
5. **Cảnh báo thoát trang (`beforeunload`)**:
   - Hiển thị thông báo xác nhận nếu học sinh vô tình bấm nút thoát trình duyệt hoặc tải lại trang.
6. **Bộ đếm Vi phạm & Tự động Xử lý**:
   - Hiển thị hộp thoại cảnh báo gian lận màu đỏ mỗi khi học sinh quay lại màn hình thi, kèm số lần vi phạm thực tế: `X / maxViolations lần`.
   - Lưu trữ toàn bộ nhật ký vi phạm vào bảng `exam_logs` phục vụ đối chất của giáo viên.

### 3.6. Xem lại Bài làm & Kết quả Chi tiết (Assignment Review)
- Chấm điểm ngay lập tức trên Server và trả kết quả tự động.
- **Bảng điểm tổng quát**:
  - Điểm đạt được / Thang điểm tối đa (làm tròn chuẩn xác 1 chữ số thập phân).
  - Trạng thái: **ĐẠT** (màu xanh lá) hoặc **KHÔNG ĐẠT** (màu đỏ).
  - Số câu đúng / Số câu sai.
  - Thời gian hoàn thành bài thi (phút, giây).
  - Nhãn ghi nhận nộp đúng hạn hay nộp trễ.
- **Đối chiếu chi tiết từng câu**:
  - Hiển thị câu trả lời của học sinh bên cạnh đáp án chính xác của hệ thống.
  - Đối với câu hỏi Đúng/Sai: Liệt kê chi tiết từng ý a, b, c, d (ý nào đúng, ý nào sai và mức điểm nhận được).
  - Đối với câu hỏi Điền số: Hiển thị giá trị học sinh đã nhập, đáp án số chuẩn và dung sai chấp nhận.
- **Báo cáo Nhật ký Vi phạm**:
  - Nếu là bài thi `EXAM`, hiển thị tổng số lần rời khỏi màn hình thi để học sinh tự nhận thức.

### 3.7. Lịch sử Học tập Cá nhân
- Bảng lịch sử toàn bộ các bài tập và bài thi đã làm trong quá khứ.
- Thống kê cá nhân: Điểm trung bình môn, tổng số bài đã nộp, số bài nộp trễ hạn.
- Tìm kiếm theo tên bài tập, lọc theo Lớp, Chương, Bài học.
- Nút xem lại chi tiết bài làm của từng lần nộp trước đó.

---

## 4. Phân hệ Học thử & Trải nghiệm (GUEST / TRIAL Mode)

Nhằm mục đích tiếp cận học sinh mới và cho phép phụ huynh/học sinh trải nghiệm chất lượng bài giảng, hệ thống cung cấp cổng Học thử không cần tài khoản:

- **Truy cập công khai**: Điều hướng qua đường dẫn `#trial` mà không bị Route Guard chặn đăng nhập.
- **Danh mục bài học thử nghiệm**:
  - Hệ thống tự động lọc các bài học có gắn cờ `is_trial = true` trên toàn hệ thống.
  - Nhóm bài học theo từng lớp học để học sinh dễ lựa chọn.
- **Trải nghiệm Đầy đủ Nội dung**:
  - Xem video bài giảng mẫu chất lượng cao.
  - Đọc tài liệu lý thuyết bài học dạng PDF bằng PDF Viewer tích hợp.
  - Làm bài tập trắc nghiệm & tự luận trải nghiệm với đầy đủ tính năng bấm giờ và split view.
- **Cơ chế Thu thập Thông tin Học viên (Guest Lead Capture)**:
  - Khi học sinh bấm nộp bài thử, hệ thống mở hộp thoại yêu cầu nhập **Họ và tên học sinh** và **Số điện thoại phụ huynh/học sinh**.
  - Lưu kết quả nộp bài vào bảng `submissions` với cờ `is_trial = true`, `guest_name`, `guest_phone`, và `student_id = NULL`.
- **Trả kết quả tức thì**: Khách học thử vẫn được chấm điểm tự động và xem lại toàn bộ bài giải chi tiết như học sinh chính thức.
- **Dữ liệu chuyển đổi cho trung tâm**: Giáo viên và quản trị viên có thể xem danh sách bài nộp của khách trải nghiệm để tư vấn tuyển sinh.

---

## 5. Động cơ Chấm điểm Tự động (Grading Engine)

Được xây dựng trong file mã nguồn độc lập `supabase/shared/grading-service.ts` và được thực thi an toàn phía máy chủ (Edge Functions):

### 5.1. Quy tắc chấm câu Trắc nghiệm nhiều lựa chọn (`MULTIPLE_CHOICE`)
- So sánh chuỗi không phân biệt hoa thường và khoảng trắng (`A`, `B`, `C`, `D`).
- Trả về 100% điểm số của câu nếu khớp, 0 điểm nếu chọn sai hoặc bỏ trống.

### 5.2. Quy tắc chấm câu Trắc nghiệm Đúng / Sai 4 ý (`TRUE_FALSE`)
Mô phỏng chính xác cấu trúc đề thi tốt nghiệp THPT Quốc Gia mới của Bộ Giáo dục & Đào tạo:
- Chấm độc lập từng ý trong 4 phát biểu (a, b, c, d).
- Tính điểm lũy tiến phi tuyến tính:
  - Đúng **1 ý**: Đạt **0.1 điểm**
  - Đúng **2 ý**: Đạt **0.25 điểm**
  - Đúng **3 ý**: Đạt **0.5 điểm**
  - Đúng cả **4 ý**: Đạt **1.0 điểm** trọn vẹn
- Trả về chi tiết trạng thái đúng/sai của từng ý (`statementGrades: { a, b, c, d }`).

### 5.3. Quy tắc chấm câu Trả lời ngắn / Tự luận số (`SHORT_ANSWER`)
- Phân tích số học giá trị học sinh nhập vào (`parseFloat`).
- So sánh với đáp số chuẩn của giáo viên (`sa_answer`) theo công thức dung sai:
  $$| \text{Giá trị học sinh} - \text{Đáp số chuẩn} | \le \text{Dung sai (tolerance)}$$
- Chấp nhận linh hoạt các cách định dạng số thập phân phổ biến (dấu chấm `.`).

### 5.4. Hỗ trợ các Cấu trúc Đề thi Tiêu chuẩn
- **Cấu trúc thuần Trắc nghiệm**: Tất cả các câu là trắc nghiệm, điểm mỗi câu $= \frac{10}{\text{Tổng số câu}}$.
- **Cấu trúc B (Đề chuẩn 22 câu Bộ GD&ĐT)**:
  - 12 câu trắc nghiệm nhiều lựa chọn ($12 \times 0.25 = 3.0$ điểm)
  - 4 câu đúng/sai ($4 \times 1.0 = 4.0$ điểm)
  - 6 câu trả lời ngắn ($6 \times 0.5 = 3.0$ điểm)
  - **Tổng điểm: 10.0 điểm**
- **Cấu trúc C (Đề 28 câu)**:
  - 18 câu trắc nghiệm ($18 \times 0.25 = 4.5$ điểm)
  - 4 câu đúng/sai ($4 \times 1.0 = 4.0$ điểm)
  - 6 câu trả lời ngắn ($6 \times 0.25 = 1.5$ điểm)
  - **Tổng điểm: 10.0 điểm**
- Điểm tổng kết cuối cùng được làm tròn chuẩn xác đến **1 chữ số thập phân** (nguyên tắc làm tròn 0.05).

---

## 6. Hạ tầng Kỹ thuật & Cơ chế Bảo mật (Security & Architecture)

### 6.1. Bảo mật Dữ liệu cấp Hàng (Row Level Security - RLS)
- **Bảng `question_answers` (Bảo mật tuyệt đối)**:
  - Cấm hoàn toàn mọi quyền truy cập SELECT, INSERT, UPDATE, DELETE từ người dùng có role `authenticated` (Học sinh).
  - Chỉ có `service_role` (Edge Functions) và `ADMIN` mới có quyền đọc và ghi dữ liệu này.
- **Cô lập Dữ liệu theo Lớp học (Class Isolation)**:
  - Học sinh chỉ có thể truy vấn các chương (`chapters`), bài học (`lessons`), bài tập (`homeworks`) thuộc lớp học mà học sinh đó được ghi danh.
- **Bảo mật Bài nộp (`submissions` & `submission_answers`)**:
  - Học sinh chỉ có thể xem lịch sử bài nộp của chính mình (`student_id = auth.uid()`).
  - Quản trị viên (`ADMIN`) có quyền xem toàn bộ bài nộp của tất cả học sinh.

### 6.2. Bảo mật Lưu trữ Tệp tin (Storage Policies)
- Bucket lưu trữ: `pdf-files` (chỉ cho phép định dạng PDF, kích thước tối đa 50MB).
- Chỉ cho phép Admin upload file đề thi và tài liệu lý thuyết.
- Đường dẫn file gốc không được công khai: Khi học sinh mở bài làm, Edge Function sinh **Signed URL** có thời hạn sử dụng 1 giờ để truy cập tài liệu an toàn.

### 6.3. Khả năng Chịu lỗi & Trải nghiệm Mượt mà (Resilience & UX)
- Trạng thái tải dữ liệu mượt mà (Loading Spinner Overlay) đồng bộ cho tất cả các lời gọi API.
- Bộ nhớ đệm Client (In-memory & LocalStorage Cache) giúp giảm thiểu số lượng request trùng lặp khi điều hướng giữa các trang.
- Cơ chế giải nén phân trang (`unwrapPaginated`) chuẩn hóa dữ liệu trả về giữa các phiên bản API cũ và mới.

---

## 7. Danh mục API & Supabase Edge Functions

Tất cả các API đều phản hồi theo định dạng JSON chuẩn:
```json
{
  "success": true,
  "data": { ... }
}
```

| Tên Edge Function | Phương thức (Method) | Quyền hạn (Auth Role) | Chức năng chính |
|---|---|---|---|
| `login` | `POST` | Public | Đăng nhập tài khoản bằng `username` và `password`. Trả về JWT Access Token, Refresh Token và Profile người dùng. |
| `refresh-token` | `POST` | Public | Cấp mới Access Token bằng Refresh Token mà không cần đăng nhập lại. |
| `create-class` | `GET`, `POST`, `PUT`, `DELETE` | `ADMIN` / `STUDENT` | Quản lý lớp học; lấy danh sách lớp; quản lý lịch học `class_sessions`; quản lý điểm danh và học phí `student_sessions`; quản lý cấu hình bot Telegram. |
| `create-chapter` | `GET`, `POST`, `PUT`, `DELETE` | `ADMIN` / `STUDENT` | Quản lý chương học trong từng lớp học; hỗ trợ lấy kèm bài học (`includeLessons=true`). |
| `create-lesson` | `GET`, `POST`, `PUT`, `DELETE` | `ADMIN` / `STUDENT` / Public | Quản lý bài học, video bài giảng, tài liệu lý thuyết PDF; hỗ trợ lấy danh sách bài học thử công khai (`isTrial=true`). |
| `create-homework` | `GET`, `POST`, `PUT`, `DELETE` | `ADMIN` / `STUDENT` | Tạo mới, cập nhật, xóa bài tập/đề thi; cấu hình câu hỏi và lưu đáp án bảo mật; lấy danh sách bài tập cần làm (`todoOnly=true`). |
| `homework-detail` | `GET` | `STUDENT` / `ADMIN` / Public | Lấy thông tin chi tiết đề bài, sinh Signed URL cho đề thi PDF, danh sách câu hỏi (đã lọc sạch đáp án đối với học sinh). |
| `submit-homework` | `POST` | `STUDENT` / Public (Guest) | Nộp bài làm, chấm điểm tự động trên server, lưu bài nộp, cập nhật phiên thi, gửi thông báo tự động qua Bot Telegram, trả về kết quả chi tiết. |
| `create-student` | `GET`, `POST`, `PUT`, `DELETE` | `ADMIN` | Quản lý tài khoản học sinh; phân lớp học (1 hoặc nhiều lớp); xóa học sinh. |
| `reset-password` | `POST` | `ADMIN` | Đặt lại mật khẩu tài khoản học sinh. |
| `exam-session` | `POST` | `STUDENT` | Quản lý phiên làm bài thi: Khởi tạo phiên (`init`), duy trì nhịp tim (`heartbeat`), tự động lưu câu trả lời nháp lên đám mây (`autosave`). |
| `exam-log` | `GET`, `POST` | `STUDENT` / `ADMIN` | Ghi nhận hành vi nghi vấn gian lận (chuyển tab, mất focus, copy/paste) và truy vấn nhật ký giám sát phòng thi. |
| `reopen-submission` | `POST` | `ADMIN` | Cho phép học sinh làm lại bài thi (lưu trữ bài cũ, reset timer, reset câu trả lời nháp, xóa log vi phạm cũ). |
| `dashboard` | `GET` | `ADMIN` | Tổng hợp toàn bộ số liệu thống kê học tập, tài chính học phí, phổ điểm, tiến độ nộp bài và các bài nộp gần nhất. |
| `statistics` | `GET` | `ADMIN` | Phân tích thống kê chuyên sâu theo từng đề thi, từng học sinh hoặc từng lớp học. |
| `student-history` | `GET` | `STUDENT` / `ADMIN` | Xem danh sách lịch sử nộp bài và chi tiết điểm số từng bài của học sinh. |
| `telegram-bot` | `POST` | Public (Webhook) | Webhook tiếp nhận thông điệp và lệnh điều khiển từ Telegram (`/start`, `/link`). |

---

*Tài liệu được tạo tự động dựa trên phân tích toàn bộ mã nguồn Frontend, Backend Edge Functions và Database Migrations của dự án.*
