# QUY CHUẨN VẼ HÌNH BẰNG CODE TRONG FILE .MD (định dạng cũ — legacy)

> Gõ khối code ngay trong đề, web tự biên dịch ra hình SVG sắc nét.
> Quy tắc chung:
>
> - Mở khối bằng dòng `\`\`\`bbt` (hoặc `graph` / `geo3d` / `smiles`), đóng bằng dòng ` ``` `.
> - Khối phải **đứng riêng trong phần đề** của câu hỏi (không lẫn vào đáp án/lời giải).
> - Nội dung trong khối được giữ nguyên từng ký tự — không gõ thêm thẻ `[Câu]`, `*A.`, `[Ảnh]` bên trong.
>
> **Định dạng này vẫn dùng được** nhưng là định dạng *cũ*. Định dạng mới (JSON `version: 2`) nằm ở
> `MD_RULES_VE_HINH_TOAN_V2.md` và cho hình **chính xác hơn** (đặc biệt là hình không gian).
> Mọi khối legacy đều được kiểm tra và **báo chẩn đoán** khi dữ liệu thiếu/sai (mục 6).

---

## 1. Bảng biến thiên `bbt`

Khối gồm 3 dòng, theo thứ tự `x` → `y'` (hoặc `f'(x)`) → `y` (hoặc `f(x)`):

````md
```bbt
x  | -\infty, 0, 2, +\infty
y' | +, 0, -, 0, +
y  | -\infty -> 3 ~> 1 -> +\infty
```
````

**Luật từng dòng:**

| Dòng | Cách gõ |
|---|---|
| `x` | Các mốc cách nhau bằng dấu phẩy `,` (dùng `-\infty`, `+\infty` cho vô cực) |
| `y'` | Xen kẽ **dấu khoảng** và **giá trị tại mốc**: `dấu, giá trị, dấu, giá trị, …, dấu` |
| `y` | Các giá trị cách nhau bằng **dấu cách**; `->` (hoặc `\nearrow`) mũi tên lên, `~>` (hoặc `\searrow`) mũi tên xuống; `||` là chỗ gián đoạn |

**Quy tắc xen kẽ của dòng `y'` (quan trọng):**

Với N mốc, dòng `y'` cần **N-1 dấu khoảng** và **N-1 giá trị tại mốc**, xen kẽ bắt đầu bằng dấu khoảng:

```
dấu(khoảng 1), giá trị tại mốc 2, dấu(khoảng 2), giá trị tại mốc 3, …, dấu(khoảng N-1)
```

- Dấu khoảng: `+`, `-`, `0` (hàm hằng trên khoảng), `none` (ngoài miền xác định).
- Giá trị tại mốc: `0` (đạo hàm bằng 0), `+`/`-` (đạo hàm khác 0, dấu đó), `||` (hàm **không xác định** tại mốc → vẽ đường đôi).
- **Thiếu dấu khoảng** ⇒ khoảng đó được **để trống** (không tự điền) kèm cảnh báo cho giáo viên.

**Luật đặt giá trị dòng `y`:**

- Giá trị tương ứng **theo thứ tự các mốc**; `||` tách một mốc thành hai giới hạn (trái/phải).
- Chiều mũi tên do `->` / `~>` khai báo; nếu mũi tên lệch với dấu ở dòng `y'` sẽ có **cảnh báo**.
- Dữ liệu phải **nhất quán toán học**: hàm giảm không thể đi từ số hữu hạn xuống `+\infty`
  (và tăng không thể đi từ số hữu hạn xuống `-\infty`).

**Ví dụ có gián đoạn** (hàm `y = 1/x`):

````md
```bbt
x  | -\infty, 0, +\infty
y' | -, ||, -
y  | 0 ~> -\infty || +\infty ~> 0
```
````

- Đường đôi vẽ tại mốc gián đoạn; **không nối mũi tên qua** chỗ gián đoạn.
- `||` ở dòng `y'` = hàm không xác định tại mốc. `||` ở dòng `y` = tách hai giới hạn trái/phải.

> ⚠️ `||` **không** được dùng để biểu diễn "đạo hàm không tồn tại" chung chung:
> hàm liên tục nhưng không khả vi (ví dụ `|x|` tại `x = 0`) vẫn phải vẽ đường liền.

---

## 2. Đồ thị hàm số `graph`

Mỗi dòng 1 thuộc tính dạng `tên: giá trị`:

````md
```graph
fn: x^3 - 3*x + 1
domain: [-2.2, 2.2]
range: [-2.5, 3.8]
points: (-1, 3), (1, -1), (0, 1)
asymptotes:
```
````

| Thuộc tính | Cách gõ |
|---|---|
| `fn` | Biểu thức theo `x`. `^` là mũ; hàm có sẵn `sin cos tan sqrt abs log exp`; nhiều hàm cách nhau `;` (vd: `x^2; 2*x + 1`) |
| `domain` | `[xMin, xMax]` — **cửa sổ nhìn theo trục x** (đồng thời là miền vẽ của định dạng cũ) |
| `range` | `[yMin, yMax]` — cửa sổ nhìn theo trục y |
| `points` | `(x0, y0)` cách nhau `,` — chấm điểm, tự vẽ gióng nét đứt xuống 2 trục |
| `asymptotes` | `x = 1, y = 2` — tiệm cận đứng/ngang (vẽ nét đứt); để trống nếu không có |

**Quy tắc biểu thức (giống định dạng V2):**

- `-x^2` nghĩa `-(x^2)`; `x^2^3` nghĩa `x^(2^3)`; `2^-1` = `1/2`.
- Phép nhân phải viết tường minh (`2*x`, không `2x`); `log` là log tự nhiên (alias `ln`).
- Chỉ phép toán/hàm whitelist; không JS, không truy cập thuộc tính, không gán biến.
- Miền xác định được suy ra từ biểu thức (căn, log, mẫu 0, tan) và **đường cong không nối qua vùng không hợp lệ**.

**Giới hạn của định dạng cũ:** không khai báo được `breaks` (điểm chia) hay miền xét riêng,
không chọn được tỷ lệ trục bằng nhau (`scale: equal`) → hình bán kính có thể bị méo.
Khi cần độ chính xác này, dùng JSON `version: 2`.

---

## 3. Hình không gian `geo3d` (hình sơ đồ 2D)

> ⚠️ **Định dạng cũ vẽ HÌNH SƠ ĐỒ 2D** với toạ độ pixel, **không phải dựng hình 3D đúng**.
> Vì vậy không thể kiểm chứng vuông góc/song song trong không gian, và mọi khối legacy
> sẽ kèm nhãn thông tin nhắc nhở. Muốn hình 3D đúng (toạ độ toán học + chiếu trực giao) → dùng JSON `version: 2`.

Dùng **preset có sẵn** + khai báo cạnh nét liền/đứt:

````md
```geo3d
preset: chop_tu_giac_sa_vuong
points: M = mid(S, C), H = proj(A, S, B)
solid: SB, SC, SD, BC, CD, BM
dashed: SA, AB, AD, AC, BD, AH, AM
right_angle: (S,A,D), (S,A,B), (A,H,B)
```
````

**Preset (tên viết thường, gạch dưới):**

| Tên preset | Hình |
|---|---|
| `chop_tam_giac` | Chóp tam giác $S.ABC$ tổng quát |
| `chop_tam_giac_sa_vuong` | Chóp $S.ABC$, $SA \perp (ABC)$ |
| `chop_tu_giac` | Chóp tứ giác $S.ABCD$ |
| `chop_tu_giac_sa_vuong` | Chóp $S.ABCD$, $SA \perp (ABCD)$ |
| `chop_tu_giac_deu` | Chóp tứ giác đều (có tâm $O$) |
| `lang_tru_tam_giac` | Lăng trụ đứng $ABC.A'B'C'$ |
| `hinh_hop` | Hình hộp / lập phương $ABCD.A'B'C'D'$ |

> Tên preset **không có** ⇒ báo lỗi rõ ràng, **không** tự đổi sang hình khác.

**Điểm phụ (`points`, cách nhau `,`):**

| Cú pháp | Ý nghĩa | Ví dụ |
|---|---|---|
| `M = mid(A, B)` | Trung điểm $AB$ | `M = mid(S, C)` |
| `G = centroid(A, B, C)` | Trọng tâm tam giác | `G = centroid(S, B, C)` |
| `N = ratio(A, B, 0.35)` | Điểm chia đoạn $AB$ tỉ lệ $0.35$ | `N = ratio(S, D, 0.35)` |
| `H = proj(A, S, B)` | Hình chiếu vuông góc của $A$ lên **đường thẳng** $SB$ (trong mặt phẳng hình sơ đồ) | `H = proj(A, S, B)` |

**Các dòng còn lại:**

| Dòng | Cách gõ |
|---|---|
| `solid` | Các cạnh nét liền, cách nhau `,` — vd: `SB, SC, BC` (tên đỉnh viết liền: `SB`, `A'B'`, `A1B1`) |
| `dashed` | Các cạnh nét đứt, cách nhau `,` |
| `right_angle` | Ký hiệu góc vuông `(Đỉnh, Góc, Điểm)` cách nhau `,` — vd: `(S,A,D)` nghĩa là góc $\widehat{SAD} = 90^\circ$ |

> Tên cạnh được **đối chiếu với danh sách điểm đã biết** (nên hỗ trợ `A'`, `A1`, `B2`…);
> cạnh không khớp được thì bỏ qua kèm cảnh báo.

---

## 4. Hóa học

**Phương trình / công thức trong đề:** dùng `\ce{...}` kẹp trong `$...$`:

```md
Phản ứng: $\ce{CH3COOH + C2H5OH <=>[H2SO4 đặp, t^o] CH3COOC2H5 + H2O}$
Chất $\ce{CH3COOC2H5}$ có tên là gì?
```

**Cấu tạo phân tử 2D (khung phân tử):** khối `smiles` chứa chuỗi SMILES,
hoặc thẻ inline `[SMILES: ...]`:

````md
```smiles
CC(=O)O
```
````

```md
Chất [SMILES: c1cccccO] có tên là gì?
```

SMILES thường dùng: axit axetic `CC(=O)O` · benzen `c1ccccc1` ·
phenol `c1cccccO` · etanol `CCO` · etyl axetat `CCOC(=O)C`.

---

## 5. Checklist khối hình trước khi nhập file

- [ ] Mở `\`\`\`bbt` (đúng tên loại) và đóng `\`\`\`` đủ.
- [ ] Dòng `y'` **đủ số dấu khoảng** (N-1 dấu cho N mốc, xen kẽ với giá trị tại mốc).
- [ ] Dòng `y` có mũi tên nhất quán với dấu ở dòng `y'` và nhất quán toán học.
- [ ] `domain`/`range` viết dạng `[a, b]` hợp lệ; `points` dạng `(x, y)`.
- [ ] `preset` đúng tên trong bảng; cạnh `solid`/`dashed` viết 2 đỉnh liền (`SB`, `A'B'`).
- [ ] Công thức `\ce{...}` nằm trong `$...$`; SMILES không chứa dấu cách.

## 6. Chẩn đoán khối hình (legacy)

Khi nạp đề, hệ thống kiểm tra mọi khối hình và báo theo mã lỗi cụ thể:

| Mã | Mức | Ý nghĩa |
|---|---|---|
| `LEGACY_BBT_MISSING_SIGN` | cảnh báo | Dòng `y'` thiếu dấu của một khoảng ⇒ khoảng đó để trống |
| `LEGACY_BBT_ARROW_SIGN_CONFLICT` | cảnh báo | Mũi tên dòng `y` lệch dấu dòng `y'` |
| `LEGACY_BBT_EXTRA_VALUES` | cảnh báo | Dòng `y` nhiều giá trị hơn số mốc |
| `LEGACY_BBT_BREAK_MISSING_VALUES` | cảnh báo | Mốc đánh dấu `||` ở dòng `y'` nhưng dòng `y` không có `||` |
| `LEGACY_GEO3D_UNKNOWN_PRESET` | **lỗi** | Tên preset không tồn tại (không fallback im lặng) |
| `LEGACY_GEO3D_PROJ_2D` / `LEGACY_GEO3D_RIGHT_ANGLE_2D` / `LEGACY_GEO3D_SCHEMATIC` | thông tin | Khối geo3d legacy chỉ là hình sơ đồ 2D, không kiểm chứng được trong không gian |

Trang **Tạo bài tập** hiển thị các chẩn đoán này ở mục *"Chẩn đoán khối hình"* theo từng câu;
đề có **lỗi** khối hình thì **không cho lưu**.
