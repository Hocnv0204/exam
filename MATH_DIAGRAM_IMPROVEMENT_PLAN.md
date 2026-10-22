# Kế hoạch nâng cấp hình Toán THPT từ Markdown

Trạng thái: **P0–P3 đã implement trong `fe/src/js/utils/diagrams/`** (xem mục 0 bên dưới).
Quy chuẩn đi kèm: `MD_RULES_VE_HINH_TOAN_V2.md` (định dạng JSON `version: 2`, đã dùng được)
và `MD_QUY_CHUAN_VE_HINH.md` (định dạng cũ, đã sửa ví dụ sai + thêm mục chẩn đoán).

## 0. Trạng thái implement (cập nhật 2026-10)

### 0.1. Đã làm

| Mục | Trạng thái | Ghi chú |
|---|---|---|
| P0 — Tokenizer/parser theo context | ✅ | Khối hình giữ đúng nơi (đề / phương án / ý Đ–S / lời giải); hình lời giải không sang đề; phương án nhiều dòng; fence chưa đóng không nuốt câu sau + báo lỗi có số dòng; round-trip parse→format→parse giữ nguyên ý nghĩa |
| P0 — Chặn eval/new Function | ✅ | `diagrams/expression.js`: tokenizer + recursive-descent → AST, whitelist hàm, giới hạn độ dài/độ sâu/số nút |
| P0 — Adapter legacy + chẩn đoán | ✅ | `diagrams/legacy-adapter.js`; preset lạ ⇒ lỗi (không fallback im lặng); dựng điểm phụ legacy đúng cú pháp (`mid/centroid/ratio/proj`); `proj` legacy = chiếu vuông góc 2D + cảnh báo "không kiểm chứng được trong không gian" |
| P0 — BBT: neo chung, gián đoạn | ✅ | Mọi hàng dùng chung `anchorX[i]`; dấu ở giữa khoảng; đường đôi ở gián đoạn, không nối qua; phân biệt đạo hàm không tồn tại vs hàm không xác định |
| P1 — Schema V2 (bbt/graph/geo3d) | ✅ | `diagrams/schema.js`: từ chối khóa lạ, kiểm tra số lượng/đơn điệu/tính nhất quán toán học |
| P1 — Đồ thị: domain/breaks/lấy mẫu/equal scale | ✅ | Rút ràng buộc miền (căn, log, mẫu 0, tan) → điểm chia → kiểm tra midpoint; lấy mẫu thích ứng theo sai số màn hình; `scale:"equal"` giữ tỷ lệ; điểm thuộc đường cong tính y từ hàm |
| P1 — Test/gallery phát triển | ✅ | `fe/scripts/test-diagrams.mjs` (211 assertion) + `fe/diagram-gallery.html` (xem trước mọi fixture) |
| P2 — Hình 3D thật | ✅ | Toạ độ toán học 3D; `mid/centroid/ratio/projectLine/projectPlane`; kiểm tra vuông góc trong không gian; phát hiện thiếu/trùng/vòng phụ thuộc/suy biến; camera trực giao cố định + fit đều; cạnh solid/dashed thủ công |
| P3 — Preview diagnostics + chặn lưu | ✅ | Trang Tạo bài tập hiện "Chẩn đoán khối hình" theo từng câu; đề có lỗi khối hình **không cho lưu**; cảnh báo vẫn lưu được nhưng phải hiện ra |
| P3 — Fixture TN-1 | ✅ | Fixture lấy từ câu có **công thức xác định** (Q9, Q14, Q22, Q24, Q58, Q66) trong `fe/scripts/diagram-fixtures.mjs`, ghi rõ nguồn / mục đích / dữ liệu còn thiếu. **Không** sinh hình cho 12 câu đầu (thiếu dữ liệu) |

### 0.2. Chưa làm / giới hạn đã ghi rõ trong tài liệu

- Chưa tự kiểm chứng tiệm cận bằng phân tích giới hạn (khai báo tiệm cận là "chưa được kiểm chứng").
- Chưa tự tìm cực trị từ biểu thức (vẫn khai báo `points` bằng x).
- Chưa phân loại cạnh khuất tự động theo mặt che (visibility chỉ `manual`).
- Chưa có `intersect/section/cone/cylinder/sphere` cho hình 3D (đã ghi rõ trong rules V2).
- Chưa có preset V2 (người soạn phải khai báo toạ độ tường minh) — đúng theo tinh thần "không bịa dữ liệu".
- Chưa đổi file nguồn `TN-1.md` (không sinh bản chuyển đổi; 12 câu đầu vẫn thiếu dữ liệu gốc).

### 0.3. Kiểm thử

- `cd fe && npm run test` (gồm `test-zero-balance` và `test-diagrams`).
- `cd fe && npm run build` (build production).
- Ví dụ trong `MD_RULES_VE_HINH_TOAN_V2.md` được **tự trích xuất** và validate/render trong test để rules không lệch code.

## 1. Mục tiêu

Hình đúng dữ kiện toán học, đúng vị trí trong câu hỏi, ổn định giữa xem trước/làm bài/xem lời giải. “Có SVG” không đồng nghĩa “hình đúng”. Ưu tiên bảng biến thiên/xét dấu, đồ thị hàm số và hình học không gian THPT. Không mở rộng hóa học trong đợt này.

Phân biệt:
- Đồ thị hàm số: vị trí điểm phải tuân theo hệ tọa độ và biểu thức.
- BBT: sơ đồ thứ tự và chiều biến thiên, không yêu cầu khoảng cách ngang tỷ lệ với x; các hàng bắt buộc chung mốc.
- Hình không gian: quan hệ được tính trong 3D rồi chiếu ra 2D; phép chiếu không bảo toàn góc/độ dài nhìn thấy trên màn hình.

## 2. Kết quả đọc file mẫu và code

### File `TN-1.md`

Nguồn: `/home/hocnguyen/Documents/Đi dạy/Latex/Math/12/C1/L1/TN-1.md` (880 dòng).

- 68 câu trắc nghiệm; 12 placeholder `[Ảnh]` ở câu 1–12; không có khối `bbt`, `graph`, `geo3d`.
- Câu 1–6: chỉ biết một vài cực trị qua lời giải, không đủ tái dựng đầy đủ BBT gốc.
- Câu 7–8: biết dạng hàm và số cực trị, chưa biết hệ số; không được tự chọn đa thức rồi gọi là hình gốc.
- Câu 9: lời giải nêu dấu đạo hàm qua -1, 0, 1, đủ làm bảng dấu minh họa cho các thông tin được nêu, nhưng phải xác minh lại ảnh gốc trước khi thay đề chính thức.
- Câu 10–12: thiếu toàn bộ các dấu/mốc của bảng gốc; không tự điền các mốc còn thiếu.
- Câu 13–21: có công thức đạo hàm, phù hợp làm fixture bảng dấu (nghiệm đơn/kép/bội lẻ/chẵn).
- Câu 22 trở đi: nhiều công thức xác định dùng làm fixture đồ thị, ví dụ câu 22 `x^3-3*x+2`, câu 24 `(x^2+3)/(x+1)`, câu 58 `sqrt(4-x^2)`, câu 66 `sin(x)+cos(2*x)`.
- File không có câu hình học không gian; cần fixture riêng có tọa độ/giả thiết rõ ràng.
- Không sửa file nguồn hoặc tự bổ sung hình giả vào 12 câu đầu. Nếu chuyển đổi, xuất bản sao kèm báo cáo thiếu dữ liệu.

### Điểm vào code đã đọc

| File | Vai trò / vấn đề |
|---|---|
| `fe/src/js/utils/diagram-renderer.js` | Toàn bộ compiler SVG hiện tại, BBT/graph/geo3d/smiles |
| `fe/src/js/utils/exam-parser.js` | Parse câu, giữ khối hình, `renderMarkdown`, `renderMath`, serialize lại Markdown |
| `fe/src/js/views/create-hw.js` | Import MD, xem trước, sửa từng câu, serialize `prompt.text`, options và lời giải |
| `MD_QUY_CHUAN_VE_HINH.md` | Rules cũ có ví dụ sai/thiếu dữ liệu |
| `MD_QUY_CHUAN_SOAN_DE.md` | Rules tổng thể, có code fence lồng nhau chưa đúng độ dài |

### Lỗi cụ thể cần xử lý

1. **BBT** (`renderBBT`): lấy số cột từ hàng đạo hàm, fallback chia đều khi thiếu mốc; điểm trái/phải gián đoạn không gắn cùng một mốc. `||` bị bỏ qua, nhưng mỗi giá trị tiếp theo vẫn được thêm mũi tên → nối qua gián đoạn. Cao độ chỉ có top/mid/bottom theo mũi tên kề → hai khoảng cùng tăng có thể bị vẽ ngang ở khoảng sau. Chưa kiểm tra dấu/mũi tên/giới hạn mâu thuẫn. Nhãn được chèn thẳng vào HTML.
2. **Graph**: `new Function` thực thi biểu thức từ MD; thay `^` bằng `**` khiến `-x^3` lỗi cú pháp JS. Chưa validate domain/range (số hữu hạn, min < max); parse sai JSON âm thầm dùng mặc định. 320 mẫu cố định + ngưỡng nhảy không bảo đảm tách nhánh tại cực. Điều kiện `abs(y) > spanY*8` sai với cửa sổ tung độ dịch xa gốc. Điểm gióng có thể không nằm trên đường cong. Tỷ lệ hai trục chưa có chế độ equal; trục/nhãn ngoài viewport chưa xử lý đầy đủ. Tiệm cận xiên có thể vẽ nhưng chưa kiểm chứng, thậm chí chấp nhận biểu thức phi tuyến làm đường thẳng qua hai đầu.
3. **Geo3d**: preset là tọa độ pixel 2D; `points.split(',')` phá `mid(A,B)`, `ratio(A,B,t)`… nên điểm phụ bị bỏ qua. `proj(P,A,B)` dùng cố định 0,42 trên AB, bỏ qua P. Không có kiểm tra vuông góc; preset không tồn tại tự biến thành chóp khác. `parseEdge` chỉ nhận tên một chữ cái và một dấu phẩy trên; cạnh/điểm sai bị bỏ qua. Các điểm preset “hình bình hành” không phải tất cả đều thỏa đẳng thức affine chính xác.
4. **Parser**: mọi code fence hình đều vào `promptLines`, kể cả nằm sau `[Lời giải]` hoặc trong phương án → có thể chuyển hình lời giải ra đề (lộ lời giải). Fence chưa đóng có thể nuốt câu kế tiếp. Hỗ trợ đáp án nhiều dòng chưa rõ ràng.
5. **Rules cũ**: ví dụ `y' | +,0,-,0` với 4 mốc thiếu dấu khoảng cuối; ví dụ `3 ~> +\infty` mâu thuẫn toán học. Hướng dẫn “chia đều giá trị y” và “hình chiếu gần đúng” không đạt chuẩn. Khi implement phải thay ví dụ sai, sửa fence lồng nhau bằng 4 backtick ở lớp ngoài.

## 3. Kiến trúc đề xuất

```text
MD → tokenizer câu/fence (kèm dòng và vị trí)
   → parser phiên bản (legacy hoặc JSON version:2)
   → schema validation → mô hình toán học → layout → SVG
   → mount + KaTeX → kiểm tra bố cục
```

- Giữ fence `bbt`, `graph`, `geo3d`. V2 dùng JSON có `"version":2`; không tự hiểu V2 bằng parser key:value cũ. Chưa hỗ trợ phiên bản thì báo rõ.
- Legacy hợp lệ qua adapter thành cùng AST. Legacy thiếu dữ kiện trả diagnostic, không tự bịa default hoặc đổi hình. Không sửa dữ liệu đã lưu hàng loạt.
- Kết quả compiler nội bộ: `{ model, svg, diagnostics }`; diagnostic gồm `severity`, `code`, `question`, `field`, `line`, `message`. Facade `compileDiagramToSVG` giữ tương thích cho caller cũ.
- Tách module dự kiến trong `fe/src/js/utils/diagrams/`: `schema.js`, `expression.js`, `legacy-adapter.js`, `bbt.js`, `graph.js`, `geometry3d.js`, `svg.js`. Tránh chia quá nhỏ; math/validation độc lập DOM để test.
- Vẫn lưu code hình dạng text trong prompt/options/explanation hiện có; không cần migration chỉ để lưu SVG.
- SVG escape tất cả nhãn, không đưa raw HTML vào `foreignObject`; KaTeX `trust:false`. Không eval/new Function; parser AST chỉ cho phép toán tử, biến/hàm whitelist. Giới hạn độ dài, độ sâu AST và ngân sách sampling.

## 4. BBT chuẩn

- AST có `knots` (mốc), `signs` (dấu từng khoảng), `derivativeAt` (đạo hàm ở mốc), `values` (giá trị hoặc giới hạn trái/phải).
- N mốc → N-1 dấu khoảng; mọi hàng dùng cùng `anchorX[i]`. Dấu khoảng đặt giữa hai anchor, dấu 0/undefined ở đúng anchor.
- Phân biệt đạo hàm không tồn tại với hàm không tồn tại: ví dụ |x| tại 0 liên tục nhưng không khả vi, không phải tiệm cận.
- Đường đôi ở gián đoạn hàm; hai giới hạn gắn cùng mốc, lệch trái/phải. Không có arrow qua đường đôi.
- Chiều mũi tên suy từ `signs`, không khai báo thêm một nguồn sự thật trái ngược. Kiểm tra giá trị giới hạn theo dấu nếu so sánh được; tăng tới +∞ hợp lệ, giảm từ số hữu hạn tới +∞ không hợp lệ.
- Layout dùng ràng buộc độ cao theo từng khoảng, hỗ trợ các khoảng cùng chiều liên tiếp và các cực trị khác mức; không cố định mọi cực đại bằng cùng một mức khi dữ kiện cho biết khác nhau. Đủ khoảng trống cho phân số/nhãn dài.
- Bảng dấu không có hàng giá trị không được tự thêm hàng y hoặc suy ra giá trị hàm.

## 5. Đồ thị chính xác về số và hình

- Expression parser có thứ tự ưu tiên toán: `-x^2=-(x^2)`, lũy thừa kết hợp phải; hỗ trợ + - * / ^, ngoặc, x, pi, e, sin/cos/tan, sqrt/abs/ln/exp; `log` alias ln để tương thích legacy.
- Tách viewport và miền xác định/miền xét; phần ngoài đoạn đề bài không bị vẽ như thuộc miền xét. Đầu mút đóng/mở và lỗ thủng khai báo riêng.
- Sampling thích ứng theo sai số màn hình, bắt buộc chia tại breakpoints/biên miền/điểm đặc biệt. Với hàm phân thức, căn, log, tan: kiểm tra miền tại các điểm chia và midpoint, không nối qua vùng không hợp lệ.
- Không hứa tự tìm mọi cực của biểu thức bất kỳ. Cho phép khai báo `breaks` bắt buộc khi bộ phân tích không chứng minh được tính liên tục; giới hạn độ sâu/số mẫu, báo không đủ độ phân giải thay vì tô đường sai.
- Điểm thuộc đường cong dùng x và tính y từ hàm; nếu import cả x,y phải kiểm tra dung sai. Điểm tự do là loại riêng, không giả làm điểm thuộc đồ thị.
- Clip đường cong/đường gióng/tiệm cận đúng vùng vẽ; nhãn đặt trong vùng label margin. Không đặt O nếu gốc ngoài cửa sổ.
- Equal scale để đường tròn/nửa đường tròn không méo; free scale cho khảo sát nhưng ticks rõ ràng. Tiệm cận chỉ nhận x=c hoặc y=ax+b; kiểm chứng giải tích với nhóm hỗ trợ, còn lại gắn cảnh báo “khai báo chưa được kiểm chứng”, không suy bằng 2 điểm.
- Không tự hiện công thức/nhãn điểm cực trị khi câu hỏi yêu cầu học sinh suy ra. Metadata không được làm lộ đáp án trong hình.

## 6. Hình học không gian

- Điểm là vector [x,y,z] theo đơn vị toán, tính dựng hình trước phép chiếu trực giao (orthographic). Tách camera, scale và offset nhãn khỏi tọa độ toán học.
- Preset V2 phải có định nghĩa tọa độ và tham số kích thước rõ ràng: hộp chữ nhật, lập phương, lăng trụ đứng, chóp có SA vuông đáy, chóp đều. Không dùng cùng một tên “hình hộp” để khẳng định lập phương.
- Primitive đầu tiên: midpoint, centroid, ratio (P=A+t(B-A)), projectLine, projectPlane. Giao tuyến/mặt cắt/hình nón/trụ/cầu để phase sau, không giả vờ đã hỗ trợ.
- `projectLine(P,A,B)`: H=A+dot(P-A,B-A)/dot(B-A,B-A)*(B-A); không clamp về đoạn. Từ chối A=B.
- `projectPlane(P,A,B,C)`: pháp tuyến cross(B-A,C-A); H=P-dot(P-A,n)/dot(n,n)*n. Từ chối ba điểm thẳng hàng.
- Dependency graph cho điểm dựng: phát hiện thiếu tên, trùng tên, cycle; tính theo thứ tự topo.
- Ký hiệu vuông tại V chỉ hợp lệ nếu dot(A-V,B-V)≈0 theo tolerance tương đối và các vector không suy biến. Sau đó vẽ dấu trong mặt phẳng góc rồi chiếu; không yêu cầu hình chiếu trông vuông 90°.
- Phase đầu cho khai báo visible/hidden thủ công, khóa camera để nét khuất không đổi khi quay. Phase sau dùng mặt của đa diện lồi để phân loại cạnh; cạnh bị che một phần cần tách đoạn, không suy visible chỉ từ tọa độ z.
- Cạnh dùng cặp ID `["A","B"]`, hỗ trợ A', A1…; không dùng regex đoán hai đỉnh. Điều chỉnh camera khi hai điểm chiếu trùng, không dịch riêng điểm toán để “vẽ đẹp”.

## 7. Tích hợp luồng đề

1. Tokenizer giữ nơi nhận nội dung: prompt / option:A / statement:a / explanation. Khi vào fence nhớ nơi hiện tại và trả lại sau fence.
2. Đóng fence thiếu: báo câu+dòng, không cho lưu bản nhập lỗi; vẫn cho giáo viên sửa bản nháp. Không đẩy hình lời giải ra đề.
3. Mỗi phương án nhiều dòng kết thúc ở phương án tiếp theo hoặc `[Lời giải]`/câu mới; phần prompt đặt trước phương án đầu tiên. Serialize cũng tuân quy ước này.
4. `renderMarkdown` gọi compiler dùng chung tại create-hw, homework-solver, exam-room, các màn xem kết quả/ngân hàng câu hỏi có dùng renderer (tìm tất cả caller trước sửa).
5. Preview hiển thị diagnostics; lỗi có cấu trúc không bị che bởi hộp lỗi chung. Không lưu đề mới có diagram error; warning cần hiển thị để giáo viên kiểm tra.
6. Render nhãn KaTeX sau mount, đo lại nhãn khi font sẵn sàng; snapshot layout phải chạy với font cố định. Cache AST theo type+version+code; SVG ID phải riêng mỗi instance (không tái dùng clipPath ID).

## 8. Thứ tự implement và đầu ra

### P0 — nền tảng + sửa lỗi dữ liệu
Tokenizer đúng context, chặn eval, validate legacy, sửa BBT anchor/gián đoạn, bỏ fallback preset im lặng, sửa parser điểm phụ, thông báo rõ proj legacy chưa đủ tọa độ để kiểm chứng. Thêm test regression trước sửa. Chưa quảng cáo legacy 2D là dựng hình chính xác.

### P1 — schema V2 + BBT + graph
Implement schema tài liệu đi kèm; expression AST, sampler, bounds/endpoint, layout nhãn và BBT. Thêm trang/gallery test phát triển; sửa rules cũ sau khi tính năng đạt kiểm thử. Không bật V2 mặc định trước khi roundtrip đạt.

### P2 — hình 3D thực
Vector math, constructions, orthographic camera, cạnh thủ công, kiểm tra vuông góc; fixture hộp/chóp/lăng trụ. Preset phải sinh cùng AST với tọa độ khai báo, không là renderer riêng.

### P3 — chuyển đổi mẫu và trải nghiệm
Công cụ preview diagnostics, fixture TN-1, nhập/lưu/mở lại ở giáo viên và học sinh. Bản TN-1 chuyển đổi chỉ thêm hình ở nơi đủ dữ kiện, các câu 1–12 giữ báo cáo cần nguồn. Không thay đổi đáp án khi chuyển hình.

## 9. Kiểm thử nghiệm thu

| Nhóm | Case bắt buộc |
|---|---|
| BBT | Mẫu ảnh x=-∞,0,2,+∞: dấu -,0,+,0,-; y=+∞ xuống 1 lên 4 xuống -∞; ba hàng thẳng cột |
| BBT | Nghiệm kép đạo hàm không đổi dấu; hai khoảng liên tiếp cùng tăng; hàm liên tục nhưng đạo hàm undefined; gián đoạn hai giới hạn; bảng chỉ xét dấu; từ chối thiếu dấu |
| Graph | `-x^3+3*x-4`; `1/(x-1)` với cực không nằm trên mẫu đều; lỗ thủng `(x^2-1)/(x-1)` tại 1; căn miền hữu hạn; ln và tan |
| Graph | TN-1 câu 22 cực trị (-1,4),(1,0); câu 58 nửa đường tròn bán kính 2 equal scale; cửa sổ y quanh 1000; gốc ngoài viewport |
| 3D | Trung điểm, trọng tâm, ratio, H thuộc đường và PH vuông đường, hình chiếu mặt phẳng, dependency cycle, plane suy biến, góc vuông khai báo sai |
| Parser | Hình trong A/B/C/D, đúng-sai, lời giải không chuyển sang prompt; nhiều hình; fence lỗi; parse→format→parse giữ nguyên ý nghĩa |
| Safety | Biểu thức truy cập window/globalThis, assignment/property/statement bị từ chối; nhãn HTML không thực thi; NaN/Infinity không lọt vào thuộc tính SVG |
| UI | Preview/làm bài/kết quả cùng hình; font KaTeX; màn hình nhỏ; nhãn phân số/dấu prime không bị cắt; 68 câu không khóa giao diện |

- Unit tests dùng giá trị/quan hệ toán độc lập làm oracle, không chỉ assert có `<svg>`.
- Visual tests so với ảnh chuẩn được giáo viên xác nhận; assertion hình học kiểm tra anchor và nhánh đường cong, tránh snapshot pixel đơn thuần.
- Test mẫu doc được tự trích xuất, validate và render trong CI để rules không lệch code.
- Chạy build `npm run build` trong `fe/` sau implementation. Đợt này chỉ tài liệu nên không cần rebuild/deploy.

## 10. Điều kiện bàn giao

- Không tự điền dữ kiện còn thiếu; không tự đổi toán học để hết lỗi render.
- Báo rõ tính năng và schema đã hỗ trợ; docs V2 chỉ chuyển trạng thái “sử dụng được” sau khi tests đạt.
- Mẫu từ TN-1 được ghi nguồn, mục đích (hình gốc / minh họa mới), dữ kiện còn thiếu; giáo viên có thể truy lại.
- Ưu tiên tính đúng và chẩn đoán rõ trước mở rộng loại hình hoặc trang trí.
