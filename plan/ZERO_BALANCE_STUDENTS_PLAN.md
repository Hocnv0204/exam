# Kế hoạch: Thống kê học sinh có số dư bằng 0

## 1. Mục tiêu và phạm vi

Thêm ô **“Học sinh có số dư 0 đ”** trên **Dashboard quản trị**, trong khu vực thẻ thống kê tổng quan. Bấm vào ô mở popup danh sách để giáo viên chủ động nhắc đóng học phí.

- Đây là thống kê từ `profiles.balance`, không thêm cột dữ liệu mới vào DB.
- Điều kiện chính xác: `role = 'STUDENT' AND balance = 0`. Không dùng `balance <= 0`, không tính số dư âm hoặc NULL.
- Mặc định tính tất cả học sinh, kể cả tài khoản bị khóa; hiển thị trạng thái trong popup để giáo viên nhận biết. Không tự suy diễn khóa tài khoản là đã nghỉ học.
- Ô thống kê đếm toàn hệ thống theo số dư hiện tại; ghi chú “Số dư hiện tại · Tất cả học sinh”. Không chịu ảnh hưởng của bộ lọc tháng/lớp/trạng thái/từ khóa của bảng điểm danh và học phí trên dashboard.
- Popup ban đầu hiển thị toàn bộ học sinh có số dư 0 đ, có phân trang; không thêm bộ lọc riêng ở bản đầu. API có thể nhận lớp/từ khóa như mô tả bên dưới nhưng dashboard không truyền các bộ lọc của bảng khác vào.
- Đếm mỗi học sinh một lần dù thuộc nhiều lớp; không phụ thuộc trang bảng học sinh đang xem.
- Không thêm gửi Telegram/tin nhắn tự động trong đợt này.
- Chỉ đặt ô tại Dashboard quản trị; không thêm ô vào Quản lý học sinh hoặc tab học phí từng lớp.

## 2. Những điểm đã xác minh trong code

| File | Vai trò |
|---|---|
| `fe/src/js/views/admin-dashboard.js` | Trang đích, `renderAdminDashboardView`, khu vực thống kê tổng quan; có `studentFilterState` riêng cho bảng điểm danh/học phí, không dùng state này cho ô số dư |
| `fe/src/js/views/student-mgmt.js` | Trang học sinh, `renderStudentMgmtView`, `bindStudentMgmtEvents`, bộ lọc `searchQuery`/`selectedClass`, `refreshTable`, hook `window._refreshStudentMgmtTable` |
| `fe/src/js/api.js` | Wrapper `getStudents`, `updateStudent` và các API học sinh |
| `fe/src/js/components/modal.js` | `openModal(title, bodyHTML, onConfirm)` và `closeModal`; chỉ có một modal dùng chung |
| `supabase/functions/create-student/index.ts` | GET danh sách, `requireAdmin`, lọc lớp qua cả `student_classes` và `profiles.class_id`; POST nạp tiền, PUT/PATCH sửa số dư |
| `fe/src/js/views/class-details.js` | Có luồng sửa số dư và hook refresh liên quan; cần giữ tương thích khi quay lại trang học sinh |

Lưu ý: API danh sách hiện trả mảng, chưa phân trang server, map `balance: s.balance || 0`. Vì vậy không lấy `state.students.filter(...)` làm nguồn thống kê chính: có thể thiếu dữ liệu vì giới hạn trả về của DB và không phân biệt NULL với 0.

## 3. Backend: mở rộng Edge Function hiện có

Trong `create-student/index.ts`, xử lý action mới trong nhánh GET, trước luồng trả danh sách cũ. Giữ `requireAdmin` và các helper response hiện có.

### API đề xuất

```text
GET create-student?action=zero-balance-count&classId=...&search=...
→ { count: 12 }

GET create-student?action=zero-balance-list&classId=...&search=...&page=1&pageSize=20
→ {
    items: [{ id, username, fullName, classId, classIds, className, balance, isLocked, status }],
    total: 12,
    page: 1,
    pageSize: 20
  }
```

Triển khai:

1. Dùng chung logic lọc lớp/tìm kiếm hiện tại cho hai action; lớp gồm cả liên kết nhiều lớp và `class_id` cũ. Khử trùng ID trước khi lọc.
2. Thêm `.eq('balance', 0)` vào query `profiles`. Đếm bằng `count: 'exact'`, `head: true`; không tải toàn bộ danh sách chỉ để đếm.
3. Danh sách dùng count exact và `.range(...)`; sắp xếp `full_name` rồi `id` để thứ tự phân trang ổn định.
4. Validate `page` là số nguyên >= 1; `pageSize` là số nguyên từ 1 đến 100, mặc định 20. Tham số không hợp lệ trả 400.
5. Lớp không có học sinh trả count 0 hoặc `{ items: [], total: 0, page, pageSize }` đúng contract action, không trả mảng trần.
6. Map thông tin lớp theo pattern hiện có, xử lý tên lớp fallback cho dữ liệu legacy nếu có; không tự đặt mã học sinh giả. `username` là mã đăng nhập hiển thị nếu không có mã riêng thực tế.
7. Lỗi DB trả `errorResponse`; không biến lỗi thành số 0.
8. Không đổi response của GET danh sách cũ và các action ghi số dư.

Không cần migration cho tính năng này. Nếu dữ liệu lớn, đo query trước khi quyết định thêm index; không tạo index chỉ vì dự đoán.

## 4. Frontend

### API wrapper

Thêm `api.getZeroBalanceCount(filters, options)` và `api.getZeroBalanceStudents(params, options)` theo cách gọi Edge Function trong `api.js`. Dùng URLSearchParams để encode tham số. FE không query PostgREST trực tiếp.

### Ô thống kê

- Đặt trong nhóm thẻ thống kê tổng quan của Dashboard quản trị, nhãn “Học sinh có số dư 0 đ”, icon ví, số lượng lớn, ghi chú “Số dư hiện tại · Tất cả học sinh”. Điều chỉnh grid responsive để thêm thẻ không làm vỡ bố cục.
- Dùng button để hỗ trợ click/Enter/Space, style phù hợp trang hiện tại; override `width:auto` nếu dùng `.btn-primary`.
- Trong lúc tải hiện skeleton hoặc dấu `…`, không tạm hiện 0.
- Khi lỗi hiện “Không tải được” và nút thử lại.
- Khi count = 0 vẫn mở được popup với thông báo danh sách rỗng.

### Popup

- Dùng `openModal`, tiêu đề “Học sinh có số dư 0 đ (N)”. Nút cuối modal đổi thành “Đóng” ở riêng popup này, không đổi toàn bộ modal dùng chung.
- Các cột: STT, Họ tên, Mã đăng nhập, Lớp học, Số dư, Trạng thái.
- Số dư luôn hiển thị `0 đ`. Tên/lớp/username phải escape HTML trước khi chèn template.
- Có skeleton khi tải, empty state “Không có học sinh nào có số dư 0 đ”, error state và thử lại.
- Phân trang riêng trong popup, mặc định 20 học sinh/trang; bảng cuộn ngang trên mobile, nội dung cuộn dọc khi dài.
- Fetch danh sách mới mỗi lần mở; dùng `total` trả về để đồng bộ lại ô đếm nếu có thay đổi giữa hai request.
- Không thêm nút nạp tiền mở modal lồng nhau ở bản đầu vì `openModal` hiện thay thế modal đang mở.

### Đồng bộ và chống dữ liệu cũ

1. Load count riêng qua API khi bind Dashboard quản trị; không cần gộp vào API dashboard hiện có hoặc chờ các biểu đồ tải xong.
2. Không gọi count khi đổi bộ lọc tháng/lớp/trạng thái/tìm kiếm hoặc chuyển trang của bảng điểm danh/học phí. Các bộ lọc này không thay đổi số dư ví hiện tại.
3. Sau tạo/xóa học sinh, nạp/sửa số dư thành công, invalidate cache thống kê nếu có. Nếu dashboard đang được mount thì refresh count; nếu không thì tải mới khi quay lại. Không gắn fetch vào mọi lần `refreshTable` ở trang học sinh.
4. Mỗi lần quay lại dashboard từ Quản lý học sinh/Chi tiết lớp, lấy count mới; không chỉ dùng dữ liệu `state.dashboard` cũ.
5. Dùng request ID hoặc AbortController: response cũ không ghi đè request mới, kể cả khi chuyển trang trong popup.
6. Khi đóng popup/chuyển route, bỏ qua response đến muộn, không cập nhật modal khác. Bind sự kiện theo lifecycle dashboard, tránh nhân đôi listener sau các lần render.
7. Nếu đang ở chế độ demo có sẵn của ứng dụng, có thể tính từ dữ liệu demo, kiểm tra số hữu hạn và không ép NULL/chuỗi rỗng thành 0. Không fallback dữ liệu demo khi API thật bị lỗi.

## 5. Kiểm tra bắt buộc

- Dữ liệu gồm balance `0`, số dương, số âm, NULL: chỉ nhóm 0 được tính.
- Học sinh nhiều lớp chỉ xuất hiện một lần; lọc lớp kiểm tra cả dữ liệu liên kết và legacy.
- Có hơn một trang kết quả: count là tổng đầy đủ, các trang popup không trùng/bỏ sót khi dữ liệu đứng yên.
- Thay đổi các bộ lọc tháng/lớp/trạng thái/từ khóa trên dashboard không làm đổi ô số dư hoặc phạm vi popup. Nếu API nhận bộ lọc lớp/từ khóa, kiểm tra riêng hai action áp dụng cùng điều kiện.
- Nạp tiền từ 0 sang dương: số đếm giảm; sửa từ dương về 0: số đếm tăng sau request thành công.
- Count = 0, lỗi mạng, đóng popup khi đang tải đều xử lý đúng; không hiện số 0 giả khi lỗi.
- Tên chứa dấu nháy hoặc HTML được hiển thị như văn bản.
- Học sinh không có quyền gọi hai action mới (giữ kiểm tra admin).
- Kiểm tra desktop/mobile và thao tác bàn phím.
- Chạy `npm run build` trong `fe/` và xác nhận build thành công vì `dist` là bản phục vụ thực tế.

Ưu tiên test có ý nghĩa cho điều kiện số dư, count/phân trang, lọc lớp và quyền truy cập; kiểm tra UI thủ công cho popup/loading.

## 6. Bàn giao và triển khai

- Files chính dự kiến sửa: `admin-dashboard.js`, `api.js`, `create-student/index.ts`; chỉ sửa modal/CSS dùng chung nếu thực sự cần. Chỉ sửa `student-mgmt.js` hoặc luồng ghi tiền khác nếu cần invalidate cache; không đặt UI mới tại đó.
- Bàn giao danh sách file đổi, kết quả kiểm tra và build.
- Backend cần deploy lại Edge Function `create-student`; không cần `db push` cho phương án này.
- Không tự deploy khi chưa có yêu cầu/thông tin xác thực từ người dùng.
- Hoàn tất khi ô đếm trên Dashboard quản trị và popup phản ánh cùng tập học sinh toàn hệ thống có số dư đúng bằng 0, cập nhật sau thao tác tiền/khi quay lại dashboard, không phụ thuộc bộ lọc hoặc phân trang bảng điểm danh/học phí.
