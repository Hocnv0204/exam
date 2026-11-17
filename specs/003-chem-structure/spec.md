# Spec 003 — Vẽ công thức cấu tạo Hóa học (khối `ctct` mới + sửa khối `smiles`)

**Trạng thái**: người dùng đã duyệt hướng (xem bản thử SVG) ngày 2026-11-17, yêu cầu triển khai và viết tài liệu hướng dẫn.

## Vấn đề

- Đề Hóa cần công thức cấu tạo như SGK: polime có ngoặc mắt xích và chỉ số *n* (PVC, PE, PS, PET, Kodel…), nhánh dọc, liên kết đôi/ba, vòng benzen/xiclohexan.
- Khối ```smiles hiện tại hay hiện **trống**: vẽ trễ bằng `setTimeout(0)` + `getElementById` (phần tử chưa có trong DOM thì bỏ qua), kích thước cố định 220×140, chỉ màu sáng, SmilesDrawer tải từ CDN, không vẽ được ngoặc polime, lỗi SMILES không được báo khi lưu.

## Yêu cầu chức năng

- **FR-1 Khối ```ctct (công thức cấu tạo thu gọn)** — giáo viên "vẽ bằng chữ" trên lưới ký tự:
  - Nhóm nguyên tử: chữ/số/ngoặc (`CH2`, `C6H5`, `COOH`, `(CH2)5`); số đứng sau chữ hoặc `)` thành chỉ số dưới.
  - Liên kết ngang `—`/`-` (đơn), `=` (đôi), `≡` (ba); dọc `|` (đơn), `‖`/`||` (đôi); chéo `/`, `\`.
  - Dòng đầu tuỳ chọn `polymer n` (hoặc `polymer: n`) → ngoặc mắt xích bao toàn hình, nét nối hai đầu xuyên ngoặc, chỉ số nghiêng ở góc dưới phải.
- **FR-2 Khối ```smiles (có vòng)** — dòng đầu là chuỗi SMILES; các dòng tuỳ chọn `khoá: giá trị`:
  - `*` đánh dấu 2 đầu mắt xích polime → tự vẽ ngoặc + chỉ số (mặc định `n`, đổi bằng `polymer: m`). Số dấu `*` khác 0 và 2 → lỗi.
  - `style: skeletal` (mặc định, công thức khung) | `condensed` (hiện C ngoài vòng dạng CH₃/CH₂/CH; mạch chính polime nằm ngang, nhóm thế dựng xuống — kiểu SGK).
  - Vòng thơm viết chữ thường (`c1ccccc1`) vẽ vòng tròn bên trong; viết Kekulé (`C1=CC=CC=C1`) vẽ nét đôi.
  - Dị tố tự thêm H ngầm định (OH/HO, NH₂/H₂N theo hướng liên kết); nguyên tử ngoặc vuông giữ số H và điện tích (`[NH3+]`).
  - Inline `[SMILES: ...]` giữ nguyên, dùng cùng trình vẽ (không tuỳ chọn).
- **FR-3 Hiển thị**: SVG sinh **đồng bộ** (không chờ DOM), nét/ chữ dùng `currentColor`, nền trong suốt → đúng ở Sáng/Tối, 4 màu Mochi, admin Pro, classic, bản in PDF; co giãn `max-width:100%`, không tràn ngang.
- **FR-4 Kiểm tra khi lưu**: `validateDiagramsInText` trả lỗi có mã + dòng cho ```ctct (MISSING_BOND, UNKNOWN_BOND, DANGLING_BOND, EMPTY…) và ```smiles/inline (SMILES_PARSE, POLYMER_STARS…). Đề có lỗi không cho lưu (cơ chế sẵn có).
- **FR-5 Tài liệu**: file hướng dẫn `docs/MD_QUY_CHUAN_VE_CTCT.md` (cú pháp, ví dụ SGK, lỗi thường gặp, bảng SMILES polime hay gặp); cập nhật §6/§8.4/§9 của `docs/MD_QUY_CHUAN_SOAN_DE.md`.

## Ngoài phạm vi

- Ký hiệu tái chế (PET/HDPE…) — là biểu tượng, chèn ảnh.
- Phương trình phản ứng, mũi tên cơ chế, hình 3D phân tử.
- Không đổi API/DB/Edge Function.

## Quyết định thay cho bước clarify (người dùng đã yêu cầu triển khai luôn)

1. Dùng SmilesDrawer 2.0.1 **chỉ để tính toạ độ 2D** (Parser + DrawerBase, thuần JS), đóng gói qua npm thay cho CDN; SVG do code dự án tự vẽ. Không dùng RDKit (6 MB).
2. Mặc định `style: skeletal` cho khớp ảnh Kodel/điol; ví dụ PS trong tài liệu dùng `style: condensed`.
3. Vòng thơm: vòng tròn trong (khớp ảnh PS/Kodel người dùng gửi).

## Tiêu chí chấp nhận

- 14 ca ctct + PS/điol/Kodel/PET/PVC (smiles) vẽ đúng như bản thử đã duyệt; 2 ca lỗi ctct báo đúng dòng/cột.
- `[SMILES: CC(=O)O]` và ```smiles cũ vẫn ra hình (có `data-smiles`, lớp `diagram-wrap`).
- `npm test` + `npm run build` xanh; trình duyệt headless: không còn hình trống, đúng ở Sáng/Tối, 360/1440px.
