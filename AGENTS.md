# Project instructions — Exam / EduPortal

## Vai trò điều phối và ủy quyền

- Theo yêu cầu người dùng, primary assistant đóng vai trò **orchestrator**: làm rõ phạm vi, chọn worker, giao việc, review diff và xác minh kết quả trước bàn giao.
- Được chủ động dùng subagent để implement các yêu cầu code tiếp theo trong repository này, không cần hỏi lại mỗi lần. Yêu cầu cụ thể mới của người dùng được ưu tiên.
- Worker nhận task phải tự hoàn thành phạm vi được giao; **không spawn thêm subagent**. Quy tắc điều phối này chỉ dành cho primary, không tạo chuỗi delegation đệ quy.
- Với câu hỏi/plan chỉ cần đọc vài file hoặc sửa tài liệu nhỏ, primary làm trực tiếp để tránh overhead. Với tác vụ code, mặc định một worker; chỉ tăng worker khi có các phần thực sự độc lập.
- Với task nhiều phase/subtask, primary được dùng đồng thời Gemini qua CLI `agy` và các model Free OpenCode. Chỉ chạy song song khi task không sửa trùng file; shared API/schema/renderer phải chạy tuần tự.
- Primary là orchestrator/reviewer cuối: chia phase, hợp nhất thay đổi, review diff, chạy full test/build và verify acceptance criteria. Không coi báo cáo worker là bằng chứng hoàn thành.

## Chọn model Free

- Trước khi giao việc qua OpenCode, tra catalog model hiện có qua công cụ models và dùng ID chính xác. Với model OpenCode/OpenAI, ưu tiên model phù hợp để tối ưu token/chi phí; không chọn model lớn hơn cần thiết.
- Người dùng cho phép dùng **thoải mái Gemini qua `agy` CLI**, kể cả model có phí; với `agy`, ưu tiên năng lực và độ phù hợp subtask thay vì giá. Không đưa API key vào project; dùng phiên đăng nhập CLI.
- Model Free của OpenCode vẫn được dùng linh hoạt cho task phụ, review, test, tra cứu hoặc fallback. Không coi Free là ràng buộc duy nhất nữa.
- Các lựa chọn dưới đây là **ưu tiên vận hành của dự án**, không phải khẳng định benchmark hoặc năng lực chính thức. Luôn điều chỉnh theo kết quả thực tế:
  - UI Vanilla JS, CRUD, modal, nối API nhỏ: ưu tiên MiniMax M3.1 Flash Free đã dùng thành công tại repo.
  - Logic toán/parser, truy vấn dữ liệu, lỗi nhiều bước: cân nhắc DeepSeek V4.1 Flash Free, với test có oracle độc lập và review kỹ của primary.
  - Tra cứu code hoặc sửa cơ học phạm vi nhỏ: cân nhắc MiMo V2.6 Flash Free; không cần worker nếu primary làm nhanh hơn.
  - Review độc lập task lớn/rủi ro cao: cân nhắc GLM 5.3 Flash Free hoặc model Free khác với worker implement; chỉ review, không sửa cùng file khi worker đang viết.
- Các tên/ID trên có thể thay đổi; khi không còn trong catalog chọn model Free khả dụng khác, không gọi ID đoán.
- Khi người dùng không chỉ định model cụ thể: task code lớn/kiến trúc/rủi ro cao → ưu tiên Gemini mạnh qua `agy`; task nhỏ/review/test → dùng model OpenCode phù hợp hoặc Free để tiết kiệm token. Catalog `active` không phản ánh quota còn lại; nếu model lỗi/quota thì chuyển lựa chọn kế tiếp.
- Tham khảo Free theo năng lực: `opencode/flint-40b-free`, `opencode/nemotron-3.5-super-vl-free`, `google/gemma-4-31b-it`, `opencode/deepseek-v4.1-flash-free`, `opencode/beam-free`, `opencode/glm-5.3-flash-free`, `opencode/mimo-v2.6-flash-free`, `opencode/big-pickle`, `groq/allam-2-7b`.
- Chọn mức reasoning vừa đủ nếu tool hỗ trợ; nâng mức hoặc đổi model khi có lỗi cụ thể. Không chạy nhiều model cùng làm một việc chỉ để so sánh.
- Gemini CLI hiện dùng lệnh `agy`; kiểm tra bằng `command -v agy` và `agy models`. Ưu tiên `gemini-3.8-flash-high` → `medium` → `low` qua `agy`, không cần ghi API key vào project. Dùng `--project` đúng workspace và `--mode accept-edits`; chỉ dùng `--dangerously-skip-permissions` khi task đã được giới hạn rõ và người dùng yêu cầu/cho phép.
- Khi một phase chạy qua `agy`, không giao cùng file cho OpenCode worker đồng thời. Sau mỗi phase phải review diff; sau khi hợp nhất các phase phải chạy lại full test/build.

## Hợp đồng giao việc

Mỗi prompt worker phải có:
1. Mục tiêu và acceptance criteria rõ, vị trí UI và ngữ nghĩa dữ liệu.
2. File/luồng đầu vào nên đọc, phạm vi sở hữu file; điểm không được sửa.
3. Hành vi loading/error/empty, quyền truy cập và edge case liên quan task thực tế.
4. Các checks bắt buộc, yêu cầu build, không deploy, không chạm dữ liệu thật khi test nghiệp vụ tiền/bài thi.
5. Báo cáo: file thay đổi, checks thực sự đã chạy, kết quả, hạn chế còn lại.

- Truyền context chọn lọc và đường dẫn tài liệu, không chép toàn bộ hội thoại.
- Tái sử dụng session worker để sửa lỗi review cùng task.
- Tối đa 2 worker implement đồng thời theo mặc định, chỉ khi không sửa trùng file. Shared API/modal/state cần một owner hoặc chạy tuần tự.
- Background task độc lập; không poll/sleep/đọc tiến độ. Chờ notification của harness, làm việc không chồng lấn hoặc trả trạng thái đang chạy.
- Không thông báo task hoàn thành chỉ vì đã khởi chạy worker.

## Review và kiểm chứng

- Primary kiểm tra diff liên quan, quyền truy cập, đồng bộ state, stale async response, duplicate submit, tương thích caller cũ và tính đúng dữ liệu.
- Không coi báo cáo worker là chứng cứ tuyệt đối. Đối chiếu code và kết quả check; chỉ chạy lại/bổ sung tests khi cần xác minh lỗi/rủi ro chưa được bao phủ.
- Lỗi review cụ thể gửi lại worker với reproduction và tiêu chí sửa. Nếu worker thất bại lặp lại, thu hẹp task hoặc đổi model Free thay vì vòng lặp vô hạn.
- Không thêm tests chỉ mirror implementation. Với tiền, auth, parser/toán: dùng assertions về bất biến/đầu ra nghiệp vụ. Với UI nhỏ: kiểm tra tương tác, build và luồng liên quan.
- Không dùng tài khoản thật để nạp tiền, nộp bài hoặc bắt đầu bài thi khi kiểm thử. Dùng mock/test fixture; báo rõ giới hạn kiểm chứng.

## Quy ước codebase

- UI và trao đổi bằng tiếng Việt; giữ pattern Vanilla JS, template string, wrapper `fe/src/js/api.js`, Edge Functions `jsonResponse/errorResponse`.
- FE không query PostgREST trực tiếp. Giữ kiểm tra quyền ở backend, không chỉ dựa vào UI.
- Mọi thay đổi FE phải chạy `npm run build` trong `fe/`; `dist` là bản được serve. Không sửa thủ công bundle.
- Tôn trọng thay đổi có sẵn của người dùng, không reset/overwrite unrelated work. Dùng patch để sửa file.
- Nút inline dùng `.btn-primary` cần kiểm tra `width:auto` vì global style có thể đặt width 100%.
- Modal hiện dùng một container chung: không mở modal lồng làm mất callback/state; phải có luồng quay lại rõ ràng.
- Nạp tiền dùng nghiệp vụ/API nạp hiện có; không thay bằng set số dư. Không tự retry thao tác ghi tiền khi chưa biết request trước thành công hay chưa.
- Không tự deploy, push git hoặc chạy migration cloud. Báo rõ function/migration cần người dùng triển khai nếu có.
- Không ghi token/mật khẩu vào tài liệu hoặc báo cáo. Không thay cấu hình OpenCode toàn máy chỉ để áp dụng rules repo này.

## Bàn giao

- Trả lời ngắn: chức năng đã làm, checks/build thực tế, bước triển khai nếu cần.
- Phân biệt rõ implement xong, đã build, đã kiểm thử trình duyệt, đã deploy; không dùng thay thế lẫn nhau.
- Đây là quy tắc dự án được OpenCode đọc từ AGENTS.md, không phải cơ chế scheduler/plugin hay bảo đảm mọi worker luôn miễn phí trong tương lai; catalog phải được kiểm tra khi chọn model.
