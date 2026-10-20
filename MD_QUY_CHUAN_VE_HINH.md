# QUY CHUẨN VẼ HÌNH BẰNG CODE TRONG FILE .MD

> Gõ khối code ngay trong đề, web tự biên dịch ra hình SVG sắc nét.
> Quy tắc chung:
>
> - Mở khối bằng dòng `\`\`\`bbt` (hoặc `graph` / `geo3d` / `smiles`), đóng bằng dòng ` ``` `.
> - Khối phải **đứng riêng trong phần đề** của câu hỏi (không lẫn vào đáp án/lời giải).
> - Nội dung trong khối được giữ nguyên từng ký tự — không gõ thêm thẻ `[Câu]`, `*A.`, `[Ảnh]` bên trong.

---

## 1. Bảng biến thiên `bbt`

Khối gồm 3 dòng, theo thứ tự `x` → `y'` (hoặc `f'(x)`) → `y` (hoặc `f(x)`):

````md
```bbt
x  | -\infty, -1, 2, +\infty
y' | +, 0, -, 0
y  | -\infty -> 3 ~> +\infty
```
````

**Luật từng dòng:**

| Dòng | Cách gõ |
|---|---|
| `x` | Các mốc cách nhau bằng dấu phẩy `,` (dùng `-\infty`, `+\infty` cho vô cực) |
| `y'` | Mỗi ô cách nhau bằng `,` — `+` / `-` / `0`; `||` = tiệm cận đứng, điểm không xác định (vẽ nét đôi) |
| `y` | Các giá trị cách nhau bằng **dấu cách**; `->` (hoặc `\nearrow`) mũi tên lên, `~>` (hoặc `\searrow`) mũi tên xuống |

**Luật đặt giá trị dòng `y`:**
- Các giá trị tự chia đều theo chiều rộng bảng.
- Cao độ (đỉnh/đáy) do **mũi tên kề quyết định**: đi lên (`->`) thì đỉnh nằm trên, đi xuống (`~>`) thì đáy nằm dưới.
- Vô cực chỉ dùng để ngắt khi giá trị không kề mũi tên nào.

Ví dụ có tiệm cận đứng:

````md
```bbt
x  | -\infty, 0, 2, +\infty
y' | -, ||, -, 0, +
y  | +\infty ~> -\infty || -\infty ~> 0 -> +\infty
```
````

---

## 2. Đồ thị hàm số `graph`

Mỗi dòng 1 thuộc tính dạng `tên: giá_trị`:

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
| `domain` | `[xMin, xMax]` khung trục hoành |
| `range` | `[yMin, yMax]` khung trục tung |
| `points` | `(x0, y0)` cách nhau `,` — chấm điểm đặc biệt, tự vẽ gióng nét đứt xuống 2 trục |
| `asymptotes` | `x = 1, y = 2` — tiệm cận đứng/ngang (vẽ nét đứt); để trống nếu không có |

---

## 3. Hình không gian `geo3d`

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

**Điểm phụ (`points`, cách nhau `,`):**

| Cú pháp | Ý nghĩa | Ví dụ |
|---|---|---|
| `M = mid(A, B)` | Trung điểm $AB$ | `M = mid(S, C)` |
| `G = centroid(A, B, C)` | Trọng tâm tam giác | `G = centroid(S, B, C)` |
| `N = ratio(A, B, 0.35)` | Điểm chia đoạn $AB$ tỉ lệ $0.35$ | `N = ratio(S, D, 0.35)` |
| `H = proj(A, S, B)` | Hình chiếu (lấy gần đúng trên đoạn) | `H = proj(A, S, B)` |

**Các dòng còn lại:**

| Dòng | Cách gõ |
|---|---|
| `solid` | Các cạnh nét liền, cách nhau `,` — vd: `SB, SC, BC` (cạnh viết 2 đỉnh liền nhau: `SB`, `A'B'`) |
| `dashed` | Các cạnh nét đứt, cách nhau `,` |
| `right_angle` | Ký hiệu góc vuông `(Đỉnh, Góc, Điểm)` cách nhau `,` — vd: `(S,A,D)` nghĩa là góc $\widehat{SAD} = 90^\circ$ |

---

## 4. Hóa học

**Phương trình / công thức trong đề:** dùng `\ce{...}` kẹp trong `$...$`:

```md
Phản ứng: $\ce{CH3COOH + C2H5OH <=>[H2SO4 đặc, t^o] CH3COOC2H5 + H2O}$
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
- [ ] Dòng `y'` đủ ô (kể cả `||`), dòng `y` có mũi tên nối các giá trị liên tiếp.
- [ ] `domain`/`range` viết dạng `[a, b]` hợp lệ; `points` dạng `(x, y)`.
- [ ] `preset` đúng tên trong bảng; cạnh `solid`/`dashed` viết 2 đỉnh liền (`SB`, không cách).
- [ ] Công thức `\ce{...}` nằm trong `$...$`; SMILES không chứa dấu cách.
