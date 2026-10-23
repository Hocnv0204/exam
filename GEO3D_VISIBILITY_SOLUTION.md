# Solution: nét liền/nét đứt cho hình học không gian

Trạng thái: **P0 + P1 đã implement** trong `schema.js`, `geometry3d.js`, `compiler.js` và bộ test. P2 (mặt cắt/vật thể lõm/preset tự động) chưa triển khai.

## 1. Kết luận audit

Quy ước của đề là đúng:

- **Nét liền:** đoạn nhìn thấy ở phía trước hoặc nằm trên mặt đang nhìn thấy.
- **Nét đứt:** đoạn bị mặt kín che phía sau hoặc đường phụ nằm bên trong khối mà mắt không nhìn thấy.
- Cùng một vật thể có thể đổi nét liền/nét đứt khi đổi camera.

Renderer hiện tại chưa thể tự đảm bảo quy ước này. `geometry3d.js` chỉ chiếu điểm 3D thành điểm 2D rồi vẽ mỗi cạnh thành một `<line>` theo `style` nhập trong Markdown. Nó chưa có mặt (`faces`), kiểm tra độ sâu hoặc cắt cạnh theo đoạn bị che.

### Fixture đã xác minh

- `GEO3D_PYRAMID` với camera `[7,-10,7]`: style hiện tại đúng.
- `GEO3D_BOX` với camera `[8,-9,7]`: có 4 style sai:
  - `CD`, `DA`: phải **dashed**.
  - `CC'`, `D'A'`: phải **solid**.

Không được dùng kết luận của chóp để suy style theo tên đỉnh cho mọi hình. Phải tính theo camera và mặt.

### Cảnh báo với các khối đang có trong đề mẫu

Các khối `geo3d` legacy/sơ đồ thủ công trong đề mẫu cần kiểm tra lại theo **một camera cố định** trước khi dùng chính thức. Một số mẫu đáng ngờ:

- Lập phương: không thể mặc định toàn bộ cạnh đứng là dashed; cạnh đứng ở mặt trước phải solid.
- Chóp đều: `SA`, `AB`, `AD`, `SO` không mặc định là dashed; phải xét mặt đối diện camera và đoạn `SO` là đường phụ bên trong.
- Hình chóp có đáy bình hành: `SA`, `AB`, `AD` có thể là cạnh phía trước tùy camera; không được copy style từ một preset khác.

Đây là cảnh báo visibility, không tự sửa hình gốc khi chưa xác nhận camera/ảnh nguồn.

## 2. Thiết kế API V2 mở rộng

Giữ tương thích:

- `visibility: "manual"`: giữ nguyên hành vi hiện tại, bắt buộc mỗi edge có `style`.
- `visibility: "auto"`: bắt buộc khai báo `faces`; renderer tự quyết định nét.
- Không có `visibility` nhưng có style: mặc định `manual` để không phá đề cũ.

### 2.1. Chóp tự phân loại

````md
```geo3d
{
  "version": 2,
  "points": {
    "A": [0,0,0], "B": [3,0,0], "C": [3,3,0],
    "D": [0,3,0], "S": [0,0,4]
  },
  "faces": [
    {"id":"SAB", "vertices":["S","A","B"]},
    {"id":"SBC", "vertices":["S","B","C"]},
    {"id":"SCD", "vertices":["S","C","D"]},
    {"id":"SDA", "vertices":["S","D","A"]},
    {"id":"ABCD", "vertices":["A","B","C","D"]}
  ],
  "edges": [
    {"ends":["S","A"]}, {"ends":["S","B"]},
    {"ends":["S","C"]}, {"ends":["S","D"]},
    {"ends":["A","B"]}, {"ends":["B","C"]},
    {"ends":["C","D"]}, {"ends":["D","A"]}
  ],
  "camera": {
    "projection":"orthographic",
    "eye":[7,-10,7], "target":[1.5,1.5,2], "up":[0,0,1]
  },
  "visibility":"auto"
}
```
````

Trong `auto`, `style` không bắt buộc với cạnh biên. Nếu có `style` thủ công thì giữ như override và phát diagnostic `GEO3D_V2_EDGE_OVERRIDE` mức info.

### 2.2. Đường phụ

Đường phụ phải khai báo rõ vì nó không phải cạnh của khối:

````md
```geo3d
{
  "version": 2,
  "points": {"A":[0,0,0], "B":[3,0,0], "C":[3,3,0], "D":[0,3,0], "S":[0,0,4]},
  "constructions": [
    {"id":"O", "op":"mid", "args":["A","C"]},
    {"id":"H", "op":"projectLine", "args":["A","S","B"]}
  ],
  "faces": [
    {"id":"SAB", "vertices":["S","A","B"]},
    {"id":"SBC", "vertices":["S","B","C"]},
    {"id":"SCD", "vertices":["S","C","D"]},
    {"id":"SDA", "vertices":["S","D","A"]},
    {"id":"ABCD", "vertices":["A","B","C","D"]}
  ],
  "edges": [
    {"ends":["S","A"]}, {"ends":["S","B"]}, {"ends":["S","C"]},
    {"ends":["S","D"]}, {"ends":["A","B"]}, {"ends":["B","C"]},
    {"ends":["C","D"]}, {"ends":["D","A"]},
    {"ends":["A","H"], "kind":"auxiliary"},
    {"ends":["A","C"], "kind":"auxiliary"}
  ],
  "camera":{"projection":"orthographic","eye":[7,-10,7],"target":[1.5,1.5,2],"up":[0,0,1]},
  "visibility":"auto"
}
```
````

- Cạnh biên của khối được phân loại từ các mặt.
- Đường phụ được sample theo tham số `t∈[0,1]` và test độ sâu với các mặt chắn.
- Nếu trạng thái đổi giữa hidden/visible thì tách thành nhiều `<line>`, không đánh dấu cả cạnh dashed.

## 3. Thuật toán renderer

### 3.1. Validate trước khi vẽ

1. Kiểm tra `faces` có từ 3 đỉnh trở lên, ID duy nhất, đỉnh tồn tại.
2. Kiểm tra mặt phẳng: mọi đỉnh của face đồng phẳng trong tolerance `1e-6`.
3. Kiểm tra polygon lồi; mặt lõm phải tách thành nhiều face.
4. Kiểm tra các face tạo thành khối kín nếu `visibility:auto`.
5. Kiểm tra camera `eye != target`, `up` không song song hướng nhìn.
6. Không cho `NaN`, `Infinity`, điểm trùng hoặc mặt suy biến lọt vào SVG.

Diagnostic bắt buộc:

- `GEO3D_V2_AUTO_NEEDS_FACES`
- `GEO3D_V2_NON_PLANAR_FACE`
- `GEO3D_V2_NON_CONVEX_FACE`
- `GEO3D_V2_BAD_FACE`
- `GEO3D_V2_BAD_EDGE`
- `GEO3D_V2_EDGE_OVERRIDE`

### 3.2. Cạnh biên của khối lồi

Với mỗi face, tính pháp tuyến theo thứ tự đỉnh và hướng về ngoài khối. Xác định mặt hướng về camera bằng tích vô hướng giữa pháp tuyến và vector tới camera.

- Cạnh có ít nhất một mặt kề hướng về camera: **solid**.
- Cạnh chỉ kề các mặt quay lưng với camera: **dashed**.
- Cạnh silhouette giữa mặt trước và mặt sau: **solid**.
- Face gần song song camera phải xử lý epsilon, không dùng làm mặt chắn nếu là edge-on.

Đây là quy tắc cho đa diện lồi. Với mặt cắt, vật thể lõm hoặc mặt tự giao nhau, phải báo chưa hỗ trợ thay vì đoán.

### 3.3. Đường phụ và đoạn bị che

Với mỗi điểm sample `P(t)` trên đường phụ:

1. Chiếu `P(t)` lên mặt phẳng màn hình.
2. Bắn tia từ camera qua điểm chiếu.
3. Tìm giao điểm đầu tiên của tia với các face chắn.
4. So sánh độ sâu của `P(t)` với giao điểm gần nhất.
5. Ghi trạng thái `visible` hoặc `hidden`.

Gom các sample liên tiếp cùng trạng thái thành run; tại biên trạng thái dùng binary search để tìm breakpoint. Render:

- run visible: nét liền;
- run hidden: nét đứt;
- không nối một path liền qua breakpoint.

Đoạn nằm trên chính mặt đang xét không bị mặt đó tự che; dùng epsilon cho coplanar.

## 4. Rules Markdown chính thức

### Bắt buộc

1. Chọn camera trước khi quyết định nét.
2. `visibility:auto` bắt buộc có `faces`.
3. Cạnh khối dùng cặp ID `ends:["A","B"]`; không dùng chuỗi ghép mơ hồ.
4. Đường phụ phải có `kind:"auxiliary"`.
5. Không tự suy faces từ tên đỉnh nếu dữ liệu không đủ.
6. Không đánh dấu toàn bộ cạnh dashed nếu chỉ một phần bị che.
7. Nét đứt chỉ dùng cho phần thực sự khuất hoặc đường nội bộ không nhìn thấy.
8. Camera đổi thì phải render/kiểm tra lại nét.
9. Label chỉ dịch bằng `labels.offset`; không thay đổi tọa độ điểm để làm hình đẹp.
10. Không dùng hình chiếu 2D để kết luận vuông góc/độ dài; kiểm tra trong 3D trước.

### Quy tắc các loại đoạn

| Đoạn | Trạng thái |
|---|---|
| Cạnh biên trên mặt nhìn thấy | Solid |
| Cạnh nằm sau hai mặt khuất | Dashed |
| Cạnh silhouette | Solid |
| Đường chéo mặt nhìn thấy | Solid |
| Đường chéo mặt khuất | Dashed |
| Đường xuyên bên trong khối | Dashed ở phần bị che |
| Đường cao nằm trên mặt nhìn thấy | Solid |
| Đường cao xuyên vào lòng khối | Tách đoạn; phần trong dashed |
| Mặt cắt | Khai báo face/đoạn riêng, không tự coi là cạnh ngoài |

## 5. Rules TeX/TikZ

TikZ thường không tự hidden-line removal cho hình 3D. Vì vậy có hai chế độ:

### Chế độ thủ công — TikZ/tikz-3dplot

- Khai báo hệ tọa độ chiếu cố định trước.
- Vẽ mặt/cạnh nhìn thấy bằng nét liền.
- Vẽ phần khuất bằng `dashed`.
- Nếu một cạnh bị che một phần, chia thành hai đoạn tại điểm giao mặt.
- Không dùng `dashed` cho mọi đường chéo chỉ vì nó là đường chéo; phải xét vị trí trong hình.
- Với điểm/đường phụ trong lòng khối, dùng dashed nếu camera không nhìn thấy.
- Góc vuông phải tính trong tọa độ 3D; ký hiệu trên giấy có thể không trông đúng 90° sau chiếu.

Ví dụ:

```tex
\begin{tikzpicture}[x={(0.9cm,-0.15cm)},y={(0.43cm,0.33cm)},z={(0cm,1cm)}]
  % Cạnh nhìn thấy
  \draw[thick] (S)--(A)--(B)--(C)--(S);
  % Cạnh khuất phía sau
  \draw[dashed] (S)--(D)--(A);
  \draw[dashed] (D)--(C);
  % Đường phụ trong khối
  \draw[dashed] (A)--(H);
\end{tikzpicture}
```

Không tuyên bố đoạn pseudocode trên tự động tính visibility.

### Chế độ tự động — Asymptote/engine 3D

Nếu cần tự loại nét khuất, dùng engine có mô hình mặt và depth buffer như Asymptote hoặc renderer riêng của ứng dụng. TikZ thuần chỉ nên nhận các đoạn đã được phân loại.

## 6. Test bắt buộc trước khi sửa code

1. Chóp Q1: camera `[7,-10,7]`, tự tái tạo đúng `SA,SB,SC,AB,BC` solid và `SD,CD,DA` dashed.
2. Hộp chữ nhật: phát hiện 4 lỗi fixture cũ `CD,DA,CC',D'A'`.
3. Cạnh nằm đúng trên biên face không bị đánh dấu hidden do sai epsilon.
4. Đường phụ xuyên khối có ít nhất một run dashed.
5. Đường phụ đổi trạng thái giữa đoạn phải bị split.
6. Đổi camera làm visibility thay đổi theo hình học, không hard-code theo tên đỉnh.
7. Manual mode cho output SVG byte-identical.
8. Face không phẳng/lõm/thiếu đỉnh bị từ chối.
9. Không có NaN/Infinity trong SVG.
10. Parse → format → parse giữ nguyên faces, camera, visibility, kind và style override.

11. Regression rules: bảng biến thiên có dấu `-` sau cực đại phải kết thúc bằng giới hạn giảm tương ứng; ví dụ `+∞ ~> 1 -> 4 ~> -∞`, không phải `+∞` ở cuối.

## 7. Phạm vi triển khai đề xuất

### P0

- Sửa rules và fixture hộp sai.
- Bổ sung schema `faces`, `visibility:auto`, `kind:auxiliary`.
- Giữ manual mode nguyên vẹn.
- Validate lỗi rõ ràng.

### P1

- Tự phân loại cạnh biên đa diện lồi.
- Depth test đường phụ.
- Split partial visibility.
- Bổ sung test oracle và gallery.

### P2

- Mặt cắt, vật thể lõm, tự động phân loại cạnh khuất phức tạp.
- Preset Toán 11: chóp, lăng trụ, hộp, lập phương, tứ diện.
- Hỗ trợ xuất tương đương sang TikZ/Asymptote.

Không triển khai P1/P2 bằng cách đoán từ tên đỉnh hoặc tọa độ pixel.
