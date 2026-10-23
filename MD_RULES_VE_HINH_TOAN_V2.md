# Rules Markdown vẽ hình Toán THPT — V2

> **ĐÃ IMPLEMENT (2026-10).** Các khối JSON V2 dưới đây được renderer hiện tại nạp
> (module `fe/src/js/utils/diagrams/`), kiểm tra schema, và dựng SVG.
> Mọi ví dụ trong tài liệu này được **tự động trích xuất và chạy qua bộ kiểm thử thật**
> (`npm run test:diagrams` trong `fe/`) — nếu ví dụ lệch với code thì test sẽ đỏ.
>
> Định dạng cũ (key:value/pipe) vẫn dùng được, được chuyển qua adapter và **báo chẩn đoán
> rõ ràng** khi thiếu/sai dữ liệu; xem `MD_QUY_CHUAN_VE_HINH.md` (mục 6) để biết giới hạn.
>
> Nếu một khối có **lỗi** (JSON sai, dữ liệu mâu thuẫn, fence chưa đóng…) thì:
>  - hình vẽ hiện hộp báo lỗi có mã lỗi cụ thể (không phải hình sai);
>  - trang **Tạo bài tập** hiển thị mục *"Chẩn đoán khối hình"* theo từng câu;
>  - **không cho lưu** đề đang có lỗi khối hình. Cảnh báo thì vẫn lưu được nhưng phải hiện ra.

## 1. Luật dữ liệu và vị trí

1. File UTF-8, giữ `[Câu n]`, `*A.`, `[Lời giải]` theo quy chuẩn đề thi. Mỗi khối hình mở/đóng trên dòng riêng bằng 3 backtick, loại `bbt`, `graph` hoặc `geo3d`.
2. Nội dung V2 là JSON hợp lệ, trường `version: 2` bắt buộc. Không comment, không dấu phẩy cuối, không NaN/Infinity dạng số JSON. Từ chối khóa lạ để bắt lỗi đánh máy.
3. Số dùng dấu chấm thập phân. Giá trị toán có thể là chuỗi biểu thức an toàn ở các trường được cho phép; nhãn LaTeX là trường riêng, backslash trong JSON phải viết `\\`.
4. `[Ảnh]` chỉ là placeholder, không phải lệnh vẽ. Không có ảnh nguồn/công thức/tọa độ đầy đủ thì ghi nhận thiếu dữ liệu, không tự suy từ đáp án.
5. Không tự dựng đa thức để khớp số cực trị rồi gắn nhãn “hình gốc”. Hình minh họa tự chọn phải ghi rõ và không thay đề nguồn mà không được duyệt.
6. Trong đề: khối đặt trước phương án. Trong đáp án: đặt sau dòng `A.` tương ứng, trước `B.`. Trong lời giải: đặt sau `[Lời giải]`. V2 parser phải giữ đúng vị trí, không đưa hình lời giải sang đề.
7. Nội dung công thức tính không dùng LaTeX: viết `sqrt(2)`, `x^2`, `sin(x)`; chỉ nhãn mới dùng `\\sqrt{2}`. Nhãn không bọc thêm `$` vì renderer tự bọc.

## 2. Bảng biến thiên / bảng xét dấu

### 2.1. Ví dụ khớp bảng đã cung cấp

````md
```bbt
{
  "version": 2,
  "labels": {"x": "x", "derivative": "f'(x)", "value": "f(x)"},
  "knots": ["-inf", 0, 2, "+inf"],
  "signs": ["-", "+", "-"],
  "derivativeAt": [null, "zero", "zero", null],
  "values": ["+inf", 1, 4, "-inf"]
}
```
````

- `knots`: ít nhất hai mốc, tăng nghiêm ngặt; ±inf chỉ ở hai đầu. Mốc hữu hạn là số hoặc biểu thức hằng an toàn, ví dụ `"sqrt(2)"`.
- N mốc có đúng N-1 `signs`: `+`, `-`, `0` (đoạn hằng), `none` (khoảng ngoài miền xác định).
- `derivativeAt`: N phần tử, `zero`, `nonzero`, `undefined` hoặc null (không khai báo); tại vô cực luôn null. `nonzero` không tự vẽ số 0.
- `values`: bỏ toàn bộ để tạo bảng dấu; nếu có phải đúng N phần tử. Giá trị hữu hạn là số/biểu thức hằng; vô cực dùng chuỗi `-inf`, `+inf`.
- Mũi tên do dấu khoảng quyết định, không nhập `->/~>` trong V2. Dữ liệu mâu thuẫn bị từ chối, không ép vô cực xuống dưới để khớp mũi tên.
- Tại mốc hàm liên tục nhưng đạo hàm undefined, giá trị vẫn là một số; không tự vẽ đường đôi.

### 2.2. Gián đoạn

````md
```bbt
{
  "version": 2,
  "knots": ["-inf", 1, "+inf"],
  "signs": ["-", "-"],
  "derivativeAt": [null, "undefined", null],
  "values": [0, {"left": "-inf", "right": "+inf", "at": null}, 0]
}
```
````

Ví dụ này mô tả `1/(x-1)`. Object `{left,right,at}` là giá trị giới hạn hai phía và giá trị thực tại mốc; null ở `at` là không xác định. Không nối mũi tên từ left sang right. Không dùng một ký hiệu `||` để đồng nhất mọi trường hợp không khả vi với tiệm cận.

### 2.3. Bảng dấu minh họa theo lời giải câu 9 TN-1

````md
```bbt
{
  "version": 2,
  "knots": ["-inf", -1, 0, 1, "+inf"],
  "signs": ["+", "-", "-", "+"],
  "derivativeAt": [null, "zero", "zero", "zero", null]
}
```
````

Đây là minh họa dựa lời giải, không khẳng định đã khôi phục ảnh gốc. Dấu không đổi qua 0 nên không được vẽ cực trị tại 0.

## 3. Đồ thị hàm số

### 3.1. Ví dụ công thức xác định — TN-1 câu 22

````md
```graph
{
  "version": 2,
  "viewport": {"x": [-3, 3], "y": [-2, 6]},
  "scale": "free",
  "curves": [
    {"id": "f", "expr": "x^3-3*x+2", "domain": [{"from": -3, "to": 3, "closed": [true, true]}], "breaks": []}
  ],
  "points": [
    {"curve": "f", "x": -1, "label": "", "guides": true},
    {"curve": "f", "x": 1, "label": "", "guides": true}
  ],
  "asymptotes": []
}
```
````

`domain` là miền xét được yêu cầu, viewport là cửa sổ nhìn; không coi viewport tự chứng minh miền xác định. Ví dụ trên chỉ vẽ đoạn [-3,3] để khảo sát.

### 3.2. Schema và quy tắc

| Trường | Quy tắc |
|---|---|
| `viewport.x`, `.y` | Hai số hữu hạn min < max, bắt buộc |
| `scale` | `free` hoặc `equal`; equal giữ cùng pixel/đơn vị cho hai trục, dùng letterbox nếu cần, không đổi bounds |
| `curves` | Mảng không rỗng, ID duy nhất; biểu thức theo x |
| `domain` | Mỗi curve bắt buộc có mảng các khoảng from/to, closed=[trái,phải]; đầu vô cực dùng chuỗi ±inf, luôn mở |
| `breaks` | Các x bị loại trong miền, không nối qua; lỗ thủng muốn thấy phải thêm marker open |
| `points` | `{curve,x,label,guides}`: renderer tính y; hoặc điểm tự do `{x,y,label,guides,marker}` không có curve |
| `marker` | `filled` mặc định hoặc `open`; điểm tự do dùng mô tả lỗ thủng, không được gắn nhãn là điểm thuộc đường cong |
| `asymptotes` | `{axis:"x",value:1}` hoặc `{axis:"y",expr:"x+1"}`; biểu thức y chỉ hằng/affine |

- Hằng x/from/to/điểm có thể là số hoặc chuỗi biểu thức hằng như `pi/2`, `sqrt(2)`, trừ viewport chỉ dùng số để schema đơn giản.
- Viết phép nhân tường minh: `2*x`, không `2x`; sin/cos/tan dùng radian, `sin(x)^2`, không `sin^2 x`. `ln` là log tự nhiên; `log` alias ln; log cơ số a viết `ln(x)/ln(a)`.
- `-x^2` nghĩa `-(x^2)`; `(-x)^2` khác; `x^2^3` nghĩa `x^(2^3)`.
- Chỉ phép toán/hàm whitelist, không JS, không truy cập thuộc tính, không assignment, không callback.
- Khai báo miền đúng: sqrt(u) cần u>=0, ln(u) cần u>0, mẫu khác 0. Không rút gọn mất lỗ thủng: `(x^2-1)/(x-1)` vẫn loại x=1.
- `asymptotes` không thay thế `breaks`/domain. Với `1/(x-1)`, chia miền thành (-∞,1) và (1,+∞) hoặc khai báo break tại 1.
- Không nhập tọa độ điểm cực trị bằng phỏng đoán; dùng x đã tính để máy tính y. Không gắn chữ “cực đại/cực tiểu” vào hình đề nếu làm lộ đáp án.
- Với `sqrt(4-x^2)` (TN-1 câu 58): domain [-2,2] đóng, viewport x=[-3,3], y=[-1,3], scale=equal.
- Không tự chứng nhận mọi tiệm cận khai báo là đúng; nếu engine chưa kiểm chứng được phải trả diagnostic cho giáo viên.

#### 3.3. Cách engine tìm miền và lấy mẫu (đã kiểm chứng bằng test)

- Engine rút ra các **ràng buộc miền** từ biểu thức: mẫu số ≠ 0, `sqrt(u)` cần u ≥ 0, `ln(u)`/`log(u)` cần u > 0,
  `tan(u)` cần `cos(u) ≠ 0`, `u^v` với v không nguyên cần u ≥ 0.
- Tìm nghiệm của từng ràng buộc trong cửa sổ (quét + bisection) → các **điểm chia bắt buộc**,
  cộng với `breaks` khai báo. Trên mỗi đoạn giữa hai điểm chia, định nghĩa hàm là hằng số nên engine
  kiểm tra tại **midpoint**; đoạn nào không xác định thì không vẽ.
- Lấy mẫu **thích ứng theo sai số màn hình** (sai số ≤ 0,4 px giữa đường thẳng nối 2 điểm và cung),
  tự chia đôi khi đoạn cong; có trần số điểm/số lần chia để không treo trình duyệt.
- Hết miền ⇒ **không nối** giữa hai nhánh; đường cong bị cắt ở cực, lỗ thủng, biên căn, điểm 0 của log.
- Lỗ thủng: để thấy rõ phải thêm điểm tự do `{"x":1,"y":2,"marker":"open"}` (xem ví dụ dưới).

#### 3.4. Ví dụ: lỗ thủng + điểm rỗng

````md
```graph
{
  "version": 2,
  "viewport": {"x": [-3, 3], "y": [-4, 6]},
  "scale": "free",
  "curves": [
    {"id": "f", "expr": "(x^2-1)/(x-1)", "domain": [{"from": -3, "to": 3, "closed": [true, true]}], "breaks": [1]}
  ],
  "points": [{"x": 1, "y": 2, "label": "", "guides": false, "marker": "open"}],
  "asymptotes": []
}
```
````


## 4. Hình học không gian

V2 bản đầu dùng tọa độ 3D tường minh. Preset cũ chưa được coi là tọa độ toán học; adapter phải ghi rõ legacy schematic. Chỉ bổ sung preset V2 khi có bảng định nghĩa tọa độ/kích thước đã test.

### 4.3. Hệ trục tọa độ Oxyz

Khối `axes3d` vẽ ba trục trực giao theo camera orthographic:

````md
```axes3d
{
  "version": 2,
  "ranges": {"x": [-4,4], "y": [-4,4], "z": [0,4]},
  "step": 1,
  "camera": {
    "projection": "orthographic",
    "eye": [7,-10,7], "target": [0,0,1], "up": [0,0,1]
  },
  "labels": {"x":"x", "y":"y", "z":"z", "origin":"O"}
}
```
````

`ranges` là khoảng số của từng trục; `step` hiện dùng để mô tả dữ liệu (renderer vẽ trục và nhãn, chưa vẽ toàn bộ vạch chia).

### 4.4. Mặt cầu `sphere3d`

Renderer vẽ mặt cầu dạng wireframe chiếu trực giao, gồm kinh tuyến và vĩ tuyến:

````md
```sphere3d
{
  "version": 2,
  "center": [0,0,0],
  "radius": 3,
  "sectionPlane": {"normal": [0,0,1], "offset": -1, "label": "(P)"},
  "axes": false,
  "camera": {
    "projection": "orthographic",
    "eye": [7,-10,7], "target": [0,0,0], "up": [0,0,1]
  }
}
```
````

Đây là hình cầu toán học với tâm/bán kính thật theo kiểu hình THPT: đường bao ngoài nét liền, phần giao tuyến phía sau nét đứt, mặt phẳng cắt có chân chiếu `H`, bán kính `HA` và tâm cầu `I`. `radius` phải dương; `sectionPlane.normal` là pháp tuyến mặt phẳng và `offset` là hằng số trong phương trình `normal·X = offset`. `wireframe` chỉ còn là tùy chọn tương thích, không dùng để vẽ lưới dày mặc định.

### 4.1. Chóp S.ABCD có đáy hình vuông, SA vuông đáy

````md
```geo3d
{
  "version": 2,
  "points": {"A": [0,0,0], "B": [3,0,0], "C": [3,3,0], "D": [0,3,0], "S": [0,0,4]},
  "constructions": [
    {"id": "M", "op": "mid", "args": ["S","C"]},
    {"id": "H", "op": "projectLine", "args": ["A","S","B"]}
  ],
  "edges": [
    {"ends": ["S","A"], "style": "solid"},
    {"ends": ["S","B"], "style": "solid"},
    {"ends": ["S","C"], "style": "solid"},
    {"ends": ["S","D"], "style": "dashed"},
    {"ends": ["A","B"], "style": "solid"},
    {"ends": ["B","C"], "style": "solid"},
    {"ends": ["C","D"], "style": "dashed"},
    {"ends": ["D","A"], "style": "dashed"},
    {"ends": ["A","H"], "style": "solid"}
  ],
  "rightAngles": [["S","A","B"],["A","H","B"]],
  "camera": {"projection": "orthographic", "eye": [7,-10,7], "target": [1.5,1.5,2], "up": [0,0,1]},
  "visibility": "manual",
  "labels": {"M": {"offset": [8,-8]}, "H": {"offset": [-12,8]}}
}
```
````

H tính từ dữ kiện này phải bằng (1.92,0,1.44); AH vuông SB. Tọa độ này là oracle cho kiểm thử, không dùng tỷ lệ đặt hình “cho đẹp”. Cạnh khuất thủ công phải kiểm tra trực quan với camera cố định trước khi dùng đề chính thức.

### 4.2. Hợp đồng dựng hình

- Point ID là tên duy nhất, dùng chuỗi, ví dụ `A`, `A'`, `A1`; cạnh luôn là cặp ID, không ghép thành `AA1`.
- `points`: ba tọa độ hữu hạn hoặc biểu thức hằng an toàn; thống nhất đơn vị. Không nhập tọa độ pixel.
- `constructions`:
  - `mid`, args=[A,B].
  - `centroid`, args=[A,B,C].
  - `ratio`, args=[A,B,t], nghĩa A+t(B-A); t=1/3 không đồng nghĩa AM/MB=1/3 (trường hợp sau t=1/4).
  - `projectLine`, args=[P,A,B], chiếu lên đường thẳng AB, không ép nằm trên đoạn AB.
  - `projectPlane`, args=[P,A,B,C], chiếu lên mặt phẳng ABC.
- Không trùng ID, không tham chiếu thiếu, không vòng phụ thuộc, không dựng trên đoạn/mặt suy biến.
- `rightAngles`: [A,V,B], V là đỉnh; engine kiểm tra vuông trong không gian. Không yêu cầu góc chiếu trên màn hình đo được 90°.
- `camera.eye != target`; up không song song hướng nhìn. Orthographic dùng basis trực chuẩn rồi fit đều vào viewport, không scale x/y riêng.
- `visibility: manual`: solid/dashed do người soạn chỉ định, camera cố định; không có tương tác quay ở giai đoạn này. Không tự gọi một nét là “khuất chính xác” khi chưa kiểm tra mặt che.
- `labels.offset` chỉ dịch nhãn bằng pixel, không dịch điểm/đỉnh.
- Hình bình hành phải thỏa A+C=B+D; hình vuông cần thêm cạnh bằng nhau và vuông góc; lập phương phải kiểm tra ba cạnh kề bằng nhau và đôi một vuông góc. Hình chiếu nhìn giống không đủ để kết luận.

## 5. Prompt rules dành cho AI soạn đề

> Trước khi tạo hình, liệt kê dữ kiện từ đề/ảnh nguồn. Không suy ra dữ kiện còn thiếu từ đáp án được đánh dấu. Chọn BBT cho dấu/chiều biến thiên, graph khi có biểu thức đủ xác định, geo3d khi có tọa độ hoặc giả thiết dựng được mô hình 3D. Xuất JSON version 2 trong đúng code fence. Kiểm tra domain, cực trị, giới hạn, các quan hệ vuông góc/song song theo mô hình. Nếu thiếu dữ kiện, báo rõ câu nào thiếu gì và không thay hình gốc bằng hình tự chọn. Cú pháp V2 **đã được website hỗ trợ**. Nên xem trước hình ở trang *Gallery khối hình Toán* (`fe/diagram-gallery.html`, chạy `npm run dev` trong `fe/`) và đọc phần chẩn đoán trước khi đưa vào đề.

## 6. Checklist nghiệm thu rules

- JSON và schema hợp lệ; field không hỗ trợ có lỗi rõ, không âm thầm bỏ qua.
- Dữ liệu đủ và nhất quán; có nguồn để xác minh hình.
- BBT chung cột, dấu đúng số lượng, không nối qua gián đoạn.
- Đồ thị không nối qua cực/lỗ thủng, điểm nằm đúng hàm, scale phù hợp.
- Hình 3D tính đúng trước chiếu, nét khuất và nhãn được xem lại.
- Hình giữ nguyên vị trí khi nhập → sửa → lưu → mở lại; hình trong lời giải không xuất hiện ở đề.
- Rules và ví dụ được chạy qua parser/schema thực tế trong bộ test trước khi phát hành.

## 7. Tính năng đã hỗ trợ & giới hạn thực tế (theo code hiện tại)

### 7.1. Đã hỗ trợ, đã kiểm thử

| Nhóm | Đã làm | Kiểm thử |
|---|---|---|
| Biểu thức | Bộ phân tích riêng (AST), **không eval / new Function**; đúng thứ tự ưu tiên (`-x^2`, `x^2^3`, `2^-1`); whitelist hàm; chặn truy cập global/gán/thuộc tính/nhân ẩn | `test-diagrams.mjs` mục 1 |
| BBT V2 | N mốc → N-1 khoảng; **mọi hàng dùng chung một lưới neo**; dấu ở giữa khoảng, giá trị ở đúng mốc; mũi tên suy từ dấu; đường đôi ở gián đoạn và **không nối qua**; phân biệt “đạo hàm không tồn tại” với “hàm không xác định”; bảng chỉ xét dấu không tự thêm hàng y; từ chối dữ liệu mâu thuẫn | mục 2 |
| Đồ thị V2 | Tách viewport / domain / breaks; lấy mẫu thích ứng theo sai số màn hình; tự tìm biên miền (căn, log, mẫu 0, tan) và **không nối qua vùng không hợp lệ**; `scale: equal` giữ tỷ lệ (không méo nửa đường tròn); điểm thuộc đường cong tính y từ hàm; điểm tự do tách riêng; tick trục; không vẽ “O” khi gốc ngoài khung | mục 3 |
| Hình 3D V2 | Toạ độ 3D tường minh; `mid / centroid / ratio / projectLine / projectPlane`; `faces` + `visibility:auto`; tự phân loại mặt/cạnh theo camera, depth-test đường phụ và tách run visible/hidden; vẫn hỗ trợ `manual`; kiểm tra vuông góc, mặt phẳng, mặt lồi, thiếu tên/trùng tên/vòng phụ thuộc; camera **trực giao** cố định, fit đều | mục 4 |
| Parser | Khối hình giữ đúng nơi (đề / phương án / ý đúng–sai / lời giải); hình lời giải **không** chuyển sang đề; phương án nhiều dòng; fence chưa đóng **không nuốt câu sau** và báo lỗi có số dòng; parse → format → parse giữ nguyên ý nghĩa | mục 5 |
| An toàn | Escape mọi nhãn trước khi chèn vào SVG; KaTeX `trust:false`; không có `eval`/`new Function` trong mã khối hình | mục 5 |
| Chẩn đoán | Mỗi lỗi/cảnh báo có mã + vị trí + thông điệp; trang Tạo bài tập hiện “Chẩn đoán khối hình” theo từng câu; **chặn lưu** khi còn lỗi | mục 5 + UI |

### 7.2. Giới hạn cần biết (không tự nhận là đã làm)

- **Tiệm cận ngang** chỉ nhận biểu thức hằng hoặc affine (`y = ax + b`); hiện engine **chưa tự kiểm chứng** tiệm cận
  bằng phân tích giới hạn, nên khai báo tiệm cận là **chưa được kiểm chứng** (giáo viên tự kiểm).
- **Không tự tìm cực trị**: điểm cực trị phải khai báo bằng `points` (x) — engine tính y, không suy ra cực trị từ biểu thức.
- **Lỗ thủng**: đường cong bị đứt ở lỗ thủng nhưng khoảng hở rất nhỏ; muốn thấy rõ phải thêm điểm tự do `marker:"open"`.
- **Hình 3D**: `visibility:auto` chỉ áp dụng cho đa diện lồi có `faces` phẳng, lồi và camera trực giao hợp lệ; vật thể lõm/mặt cắt phức tạp chưa tự phân loại.
  Đường phụ được sample để tách đoạn khuất; tolerance và các trường hợp đồng phẳng sát biên vẫn cần kiểm tra bằng mắt.
  Ký hiệu góc vuông được dựng đúng trong không gian rồi chiếu, nên **trên màn hình không nhất thiết nhìn vuông góc 90°** (đúng như thực tế).
- **Preset cũ (legacy `geo3d`)** chỉ là hình sơ đồ 2D toạ độ pixel, **không phải dựng hình 3D đúng**; engine gắn nhãn thông tin
  cho mỗi khối legacy để không ai nhầm là hình 3D đã kiểm chứng. Muốn hình 3D đúng phải dùng JSON V2.
- **BBT legacy** dùng mũi tên khai báo ở dòng `y`; nếu mũi tên và dấu ở dòng `y'` lệch nhau sẽ có cảnh báo.
  Bảng legacy thiếu dấu khoảng sẽ **để trống khoảng đó** (không tự điền), kèm cảnh báo.
- **Tiến trình renderer**: nhãn vẽ bằng KaTeX sau khi gắn SVG; nếu font KaTeX tải chậm thì nhãn hiện sau vài trăm ms.
