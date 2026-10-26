# QUY CHUẨN SOẠN FILE .MD NẠP ĐỀ THI

> Áp dụng cho nút **Nhập file .md** trong trang Tạo bài tập.
> File `.md` (UTF-8) soạn đúng quy chuẩn dưới đây sẽ tự tách thành câu hỏi,
> đáp án, lời giải và hình vẽ — xem trước ngay, không cần dán ảnh thủ công.

---

## 1. Khung đề (3 phần chuẩn Bộ GD&ĐT)

```md
=== PHẦN I: TRẮC NGHIỆM NHIỀU LỰA CHỌN (A, B, C, D) ===
... các câu trắc nghiệm ...

=== PHẦN II: TRẮC NGHIỆM ĐÚNG / SAI (4 Ý a, b, c, d) ===
... các câu đúng/sai ...

=== PHẦN III: TRẮC NGHIỆM TRẢ LỜI NGẮN (ĐIỀN SỐ) ===
... các câu điền số ...
```

- Phần nào không có thì **bỏ cả dòng tiêu đề** phần đó.
- Đánh số câu **liên tục từ đầu đến cuối file** (`[Câu 1]` → `[Câu N]`), không đánh lại từ 1 ở mỗi phần (hệ thống vẫn tự sửa nếu trùng, nhưng nên đánh đúng).

## 2. Mở đầu 1 câu

```
[Câu <số>] [mức độ] [loại] [DẠNG BÀI: Tên dạng bài Constant]
```

| Thành phần | Giá trị cho phép |
|---|---|
| Số câu | `[Câu 1]`, `[Câu 2]`, ... (hoặc `[Bài 1]`) |
| Mức độ | `[NB]` Nhận biết · `[TH]` Thông hiểu · `[VD]` Vận dụng · `[VDC]` Vận dụng cao |
| Loại (không bắt buộc) | `[TF]` Đúng/Sai · `[SA]` Trả lời ngắn · `[MC]` Trắc nghiệm (mặc định theo phần đang đứng) |
| Dạng bài (không bắt buộc) | `[DẠNG BÀI: <tên đúng trong Bài học Constant>]` |

Ví dụ: `[Câu 4] [TF] [VD]`

Ví dụ có gắn phân dạng: `[Câu 1] [NHAN_BIET] [DẠNG BÀI: Xét tính đơn điệu bằng đạo hàm]`

### 2a. Gắn Dạng bài Constant khi nhập vào Ngân hàng câu hỏi

- Tag phải đặt ngay sau `[Câu N]`/`[Bài N]`, trên cùng dòng với các tag loại câu và mức độ.
- Tên trong tag phải **trùng với tên Dạng bài thuộc Bài học Constant đang chọn**. Không dùng tên Bài học hoặc tên loại câu hỏi (`MC`, `TF`, `SA`).
- Có thể viết các biến thể tương đương: `[DẠNG BÀI: ...]`, `[DANG BAI: ...]`, `[QB_TYPE: ...]`.
- Không cần ghi UUID; hệ thống tự tìm đúng `qb_question_type_id` theo tên trong Bài học đã chọn.
- Nếu không có tag, câu hỏi vẫn được nhập như trước nhưng `Dạng bài` để trống.
- Nếu tag sai tên, sai Bài học hoặc có nhiều kết quả trùng tên, hệ thống phải báo lỗi và không lưu câu đó để tránh phân loại nhầm.

Ví dụ Toán 12:

```md
[Câu 1] [NHAN_BIET] [DẠNG BÀI: Xét tính đơn điệu bằng đạo hàm]
Cho hàm số $y=f(x)$ ...
A. ...
*B. ...
C. ...
D. ...
```

## 3. Thân câu hỏi

- **Công thức Toán**: kẹp trong `$...$` (inline) hoặc `$$...$$` (khối).
- **Công thức Hóa**: dùng `\ce{...}`, ví dụ `$\ce{CH3COOH + C2H5OH -> CH3COOC2H5 + H2O}$`.
- **Xuống dòng** trong đề: xuống dòng thật (Enter).
- **Không** dùng dòng bắt đầu bằng `A.`, `*A.`, `[Lời giải]`, `[Ảnh...]` cho nội dung đề thường (hệ thống sẽ hiểu nhầm thành đáp án).
- **Phần đề phải nằm TRƯỚC phương án đầu tiên.** Sau khi phương án đầu tiên bắt đầu, mọi dòng thuộc
  phương án đó cho tới phương án kế tiếp / `[Lời giải]` / câu hỏi mới.

## 4. Đáp án

**Trắc nghiệm (4 phương án, mỗi dòng 1 phương án):**
```md
A. Nội dung phương án A
*B. Nội dung phương án đúng (dấu * ở đầu)
C. Nội dung phương án C
D. Nội dung phương án D
```

**Phương án nhiều dòng (được phép):**
```md
A. Nội dung dòng 1 của phương án A
   Nội dung dòng 2 của phương án A
B. Nội dung phương án B
```

**Đúng/Sai (4 ý a–d, `*` = ý ĐÚNG):**
```md
*a) Nội dung ý a đúng
*b) Nội dung ý b đúng
c) Nội dung ý c sai (không có *)
*d) Nội dung ý d đúng
```

**Trả lời ngắn:**
```md
[Đáp án: 2.67]
[Dung sai: 0.05]
```
- `[Dung sai: ...]` không bắt buộc (mặc định 0 = khớp tuyệt đối).

## 5. Lời giải (không bắt buộc, đặt cuối mỗi câu)

```md
[Lời giải]
Nội dung lời giải, có thể nhiều dòng, dùng $...$ và \ce{...} bình thường.
```

## 5b. Vị trí khối hình (quan trọng)

- **Trong đề**: đặt khối hình **trước phương án đầu tiên**.
- **Trong phương án**: đặt ngay **sau dòng `A.`** tương ứng (trước `B.`) — hình sẽ nằm đúng trong phương án đó.
- **Trong lời giải**: đặt **sau dòng `[Lời giải]`**; hình lời giải **không** bị chuyển lên đề.
- Khối hình phải **đóng bằng dấu ` ``` `**; thiếu dấu đóng sẽ báo lỗi theo số dòng
  (và không làm nuốt câu hỏi kế tiếp).

## 6. Hình ảnh (3 cách, ưu tiên từ trên xuống)

> ⚠️ **Lỗi thường gặp:** gõ chữ `[Ảnh]` trần (không có link/base64/code) thì web **không vẽ được gì** —
> đó chỉ là ô trống "Chèn hình ảnh cho Câu N" để bạn dán ảnh chụp màn hình bằng `Ctrl + V`.
> Muốn hình hiện tự động thì phải dùng 1 trong 3 cách dưới đây.

**Cách 1 — Gõ code vẽ hình trực tiếp (khuyên dùng, nét nhất):**
````md
```bbt
x  | -\infty, 0, 2, +\infty
y' | -, 0, +, 0, -
y  | +\infty ~> -1 -> 3 ~> -\infty
```
````
- Loại khối: `bbt` (bảng biến thiên/xét dấu), `graph` (đồ thị hàm số),
  `geo3d` (hình không gian theo preset), `smiles` (cấu tạo phân tử Hóa).
- Chi tiết từng loại xem mục 8 bên dưới.

**Cách 2 — Ảnh Base64 gom cuối file (file .md duy nhất, không kèm ảnh rời):**
```md
Cho đồ thị như hình dưới đây, hàm số nghịch biến trên khoảng nào?
[Ảnh: img_cau_6]
*A. $(0; 1)$
...

<!-- cuối file -->
[img_cau_6]: data:image/png;base64,iVBORw0KGgoAAAANSUhEUg...
```

**Cách 3 — Link ảnh trực tiếp:**
```md
[Ảnh: https://example.com/hinh1.png]
```

> Lưu ý: dòng `[Ảnh...]` phải **đứng 1 mình trên 1 dòng**, ngay trong phần đề của câu đó.

## 7. File mẫu hoàn chỉnh

> Lớp ngoài dùng **4 backtick** để lồng khối hình (3 backtick) bên trong.

````md
# ĐỀ LUYỆN TẬP CHƯƠNG 1

=== PHẦN I: TRẮC NGHIỆM NHIỀU LỰA CHỌN (A, B, C, D) ===

[Câu 1] [NB]
Cho hàm số $y = f(x)$ có bảng biến thiên:
```bbt
x  | -\infty, 0, 2, +\infty
y' | -, 0, +, 0, -
y  | +\infty ~> -1 -> 3 ~> -\infty
```
Hàm số đồng biến trên khoảng nào?
A. $(-\infty; 1)$
*B. $(0; 2)$
C. $(1; 3)$
D. $(2; +\infty)$
[Lời giải]
Trên $(0; 2)$ có $f'(x) > 0$ nên đồng biến.

=== PHẦN II: TRẮC NGHIỆM ĐÚNG / SAI (4 Ý a, b, c, d) ===

[Câu 2] [TF] [TH]
Cho $\ce{NaCl}$ là muối ăn. Xét tính đúng sai:
*a) $\ce{NaCl}$ tan tốt trong nước.
b) $\ce{NaCl}$ là chất khí ở điều kiện thường.
[Lời giải]
Muối ăn tan tốt, ở thể rắn.

=== PHẦN III: TRẮC NGHIỆM TRẢ LỜI NGẮN (ĐIỀN SỐ) ===

[Câu 3] [SA] [VD]
Tính $1 + 2 + 3$.
[Đáp án: 6]
[Lời giải]
Tổng bằng $6$.
````

## 8. Cú pháp vẽ hình chi tiết

> Toàn bộ chi tiết + giới hạn + mã chẩn đoán: `MD_QUY_CHUAN_VE_HINH.md` (định dạng cũ) và
> `MD_RULES_VE_HINH_TOAN_V2.md` (định dạng JSON `version: 2`, khuyên dùng cho hình không gian).

### 8.1. Bảng biến thiên `bbt` (3 dòng `x` / `y'` / `y`)

````md
```bbt
x  | -\infty, 0, 2, +\infty
y' | +, 0, -, 0, +
y  | -\infty -> 3 ~> 1 -> +\infty
```
````

- Ô cách nhau bằng dấu phẩy `,`.
- Dòng `y'`: xen kẽ **dấu khoảng** và **giá trị tại mốc** (`0` = đạo hàm bằng 0, `||` = hàm không xác định tại mốc).
- Dòng `y`: `->` (hoặc `\nearrow`) mũi tên lên, `~>` (hoặc `\searrow`) mũi tên xuống, `||` = gián đoạn.

### 8.2. Đồ thị hàm số `graph`

````md
```graph
fn: x^3 - 3*x + 1
domain: [-2.2, 2.2]
range: [-2.5, 3.8]
points: (-1, 3), (1, -1), (0, 1)
asymptotes:
```
````

- `fn`: biểu thức theo `x` (`^` là mũ, `sin/cos/tan/sqrt/abs/log/exp` có sẵn, nhiều hàm cách nhau `;`).
- `domain`/`range`: `[xMin, xMax]` / `[yMin, yMax]`.
- `points`: chấm điểm đặc biệt + gióng nét đứt xuống 2 trục.
- `asymptotes`: ví dụ `x = 1, y = 2` (để trống nếu không có).

### 8.3. Hình không gian `geo3d` (preset + điểm phụ) — hình sơ đồ 2D

````md
```geo3d
preset: chop_tu_giac_sa_vuong
points: M = mid(S, C), H = proj(A, S, B)
solid: SB, SC, SD, BC, CD, BM
dashed: SA, AB, AD, AC, BD, AH, AM
right_angle: (S,A,D), (S,A,B), (A,H,B)
```
````

- Preset có sẵn: `chop_tam_giac`, `chop_tam_giac_sa_vuong`, `chop_tu_giac`,
  `chop_tu_giac_sa_vuong`, `chop_tu_giac_deu`, `lang_tru_tam_giac`, `hinh_hop`.
- Điểm phụ: `mid(A,B)` trung điểm · `centroid(A,B,C)` trọng tâm ·
  `ratio(A,B,0.35)` chia đoạn · `proj(A,S,B)` hình chiếu.
- `solid` nét liền, `dashed` nét đứt, `right_angle` ký hiệu góc vuông `(Đỉnh, Góc, Điểm)`.
- ⚠️ Đây là **hình sơ đồ 2D**, không kiểm chứng được vuông góc trong không gian.
  Cần hình 3D đúng (toạ độ toán học + chiếu trực giao) → dùng JSON `version: 2`.


### 8.4. Cấu tạo phân tử `smiles`

````md
```smiles
CC(=O)O
```
````
hoặc inline: `[SMILES: c1cccccO]`
- Viết chuỗi SMILES của phân tử (axit axetic: `CC(=O)O`, benzen: `c1ccccc1`).

## 9. Checklist trước khi bấm nhập file

- [ ] File lưu dạng UTF-8, đuôi `.md`.
- [ ] Đủ 3 phần (hoặc bỏ phần không dùng), câu đánh số liên tục.
- [ ] Mỗi câu trắc nghiệm có đúng 1 dấu `*`; mỗi ý Đúng/Sai có/không `*` rõ ràng.
- [ ] Câu điền số có `[Đáp án: ...]`.
- [ ] Khối ` ```bbt/graph/geo3d/smiles ` mở và đóng đủ dấu \`\`\`.
- [ ] Dòng `[Ảnh: ...]` đứng riêng 1 dòng; định nghĩa `[id]: ...` nằm cuối file.
- [ ] Phần đề nằm trước phương án đầu tiên; hình trong lời giải nằm sau `[Lời giải]`.
- [ ] Nếu phân loại Dạng bài: tên trong `[DẠNG BÀI: ...]` phải đúng tuyệt đối theo Bài học Constant đã chọn.
- [ ] Sau khi nhập: kiểm tra thẻ xem trước (số câu, đáp án tô sáng, hình vẽ) và mục
      **"Chẩn đoán khối hình"** (lỗi / cảnh báo) rồi mới bấm Lưu.
      Đề có **lỗi** khối hình sẽ **không cho lưu**.
