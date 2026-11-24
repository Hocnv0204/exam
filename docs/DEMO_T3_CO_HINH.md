# ĐỀ KIỂM TRA GIỮA HỌC KỲ I - TOÁN 12 (MÃ ĐỀ: T3)

> **HƯỚNG DẪN DÀNH CHO GIÁO VIÊN:**
> 1. Đề thi gồm 3 phần chuẩn format:
>    - **Phần I: Trắc nghiệm ABCD** (Đánh dấu `*` trước phương án đúng, ví dụ: `*A.`, `*B.`)
>    - **Phần II: Trắc nghiệm Đúng / Sai** (Đánh dấu `*` trước các ý **ĐÚNG**, ví dụ: `*a)` là Đúng, `b)` là Sai)
>    - **Phần III: Trắc nghiệm Trả lời ngắn** (Ghi `[Đáp án: <số>]` và `[Dung sai: <số>]` nếu có)
>    - **Mức độ nhận thức (Độ khó)**: Đặt tag mã code ngay sau mã câu: `[NHAN_BIET]`, `[THONG_HIEU]`, `[VAN_DUNG]`, `[VAN_DUNG_CAO]`.
>      *Ví dụ:* `[Câu 1] [NHAN_BIET]`, `[Câu 5] [TF] [THONG_HIEU]`, `[Câu 7] [SA] [VAN_DUNG]`.
>    - **File kiểu S (Phiếu bài tập / Worksheet)**: Không cần đáp án (không đánh dấu `*`, không cần khối `[Lời giải]`).
> 2. **Công thức Toán học**: Inline kẹp giữa `$ ... $` hoặc `\( ... \)`; công thức xuống dòng riêng (display) đặt trong `$$ ... $$` hoặc `\[ ... \]` (ví dụ: `$y = f(x)$`, `$\int_0^1 x^2 dx$`, `$\frac{a\sqrt{3}}{2}$`). TUYỆT ĐỐI không viết công thức trần ra ngoài thẻ toán học.
> 3. **Hình ảnh (Đồ thị, Bảng biến thiên, Hình học không gian)**:
>    - Chỉ cần ghi chữ `[Ảnh]` ở nơi cần đặt hình.
>    - Sau khi bấm **"Phân tích & Xem trước"**, bạn chỉ cần dùng Snipping Tool (`Win + Shift + S`) chụp ảnh từ file Word rồi bấm **`Ctrl + V`** trực tiếp vào khung ảnh của câu đó!
> 4. **Lời giải chi tiết**: Bắt đầu bằng dòng `[Lời giải]` ở cuối mỗi câu (không bắt buộc nhưng khuyên dùng cho các đề thi thông thường; file kiểu S không cần).
> 5. **Quy chuẩn kỹ thuật bắt buộc để hệ thống render không lỗi** (rút từ `AI_LATEX_RULES.md`):
>    - **Ngoặc nhọn**: Mọi cặp ngoặc `{` `}` phải đóng/mở cân bằng. Nếu cần hiển thị ký tự ngoặc trong văn bản, phải escape thành `\{` hoặc `\}`.
>    - **Đánh dấu đáp án**: Trong file `.md` chỉ dùng dấu `*` đặt trước phương án / mệnh đề đúng (đã quy định ở mục 1). KHÔNG dùng comment `% Key: ...` (kiểu đánh dấu này và lệnh `\True` chỉ dành cho file `.tex`).
>    - **Hình vẽ & Bảng biến thiên**: Ghi thẻ giữ chỗ `[Ảnh]` tại nơi cần đặt hình (hệ thống cũng hiểu thẻ tùy biến `[HÌNH]` hoặc `[HÌNH: tên_ảnh.png]`; dùng `\includegraphics[width=...]{tên_ảnh.png}` nếu có ảnh ngoại tuyến). Hình vẽ TikZ phải đặt trong cặp `\begin{tikzpicture} ... \end{tikzpicture}`; bảng biến thiên / xét dấu chỉ dùng các lệnh cơ bản `\tkzTabInit` và `\tkzTabLine` (đặt bên trong `tikzpicture`).
>    - **Blacklist — KHÔNG nên sinh ra trong file `.md`**: `\newpage`, `\vspace{...}`, `\hspace{...}`, `\hfill`, `\par`, `\noindent`, `\stepcounter` và các macro trang trí riêng của bản in LaTeX như `\drawMinion`, `\minionQuestionIcon` (hệ thống web tự động xóa — vô tác dụng, dễ gây lỗi parse).
>      *Ghi nhớ:* Luôn tạo nội dung `.md` sạch — công thức đặt đúng thẻ toán học KaTeX, ngoặc nhọn cân bằng, thẻ hình ảnh đúng chuẩn (xem chi tiết đầy đủ tại `AI_LATEX_RULES.md`).
> 6. **Tự động biên dịch & Dọn dẹp**: Sau khi tạo xong file `.tex` (và `.md`), AI luôn tự động thực thi lệnh terminal biên dịch ra `.pdf` (`pdflatex ...; latexmk -c ...`) và dọn dẹp sạch toàn bộ file rác trung gian mà không cần hỏi lại. TUYỆT ĐỐI KHÔNG TẠO FILE JSON ĐÁP ÁN.

---

=== PHẦN I: TRẮC NGHIỆM NHIỀU LỰA CHỌN (A, B, C, D) ===

[Câu 1] [NHAN_BIET]
Cho hàm số $y = f(x)$ có bảng biến thiên như sau:
```bbt
x  | -\infty, 0, 2, +\infty
y' | -, 0, +, 0, -
y  | -\infty -> 1 -> 4 -> +\infty
```
Khoảng đồng biến của hàm số $y = f(x)$ là
*A. $(0; 2)$.
B. $(0; +\infty)$.
C. $(-\infty; 2)$.
D. $(-\infty; +\infty)$.
[Lời giải]
Dựa vào bảng biến thiên, ta thấy trên khoảng $(0; 2)$ đạo hàm $f'(x) > 0$ và chiều mũi tên của $f(x)$ đi lên từ $1$ đến $4$. Do đó, hàm số đồng biến trên khoảng $(0; 2)$.

[Câu 2] [NHAN_BIET]
Cho hàm số $y = \frac{-x + 2009}{x - 1}$. Hàm số đã cho có bao nhiêu điểm cực trị?
A. $1$.
*B. $0$.
C. $2$.
D. $3$.
[Lời giải]
Tập xác định: $D = \mathbb{R} \setminus \{1\}$.
Đạo hàm: $y' = \frac{(-1)(-1) - 2009 \cdot 1}{(x - 1)^2} = \frac{-2008}{(x - 1)^2} < 0, \forall x \ne 1$.
Do đạo hàm không đổi dấu và không triệt tiêu trên từng khoảng xác định nên hàm số đã cho không có điểm cực trị nào.

[Câu 3] [THONG_HIEU]
Tìm giá trị nhỏ nhất của hàm số $y = \frac{x^3}{3} + 2x^2 - 5x + 1$ trên đoạn $[-1; 3]$.
A. $\frac{23}{3}$.
*B. $-\frac{5}{3}$.
C. $13$.
D. $\frac{5}{3}$.
[Lời giải]
Hàm số liên tục trên đoạn $[-1; 3]$.
Đạo hàm: $y' = x^2 + 4x - 5$.
Giải phương trình $y' = 0 \Leftrightarrow \left[\begin{aligned} &x = 1 \in [-1; 3] \\ &x = -5 \notin [-1; 3]. \end{aligned}\right.$
Ta tính các giá trị:
$y(-1) = \frac{(-1)^3}{3} + 2(-1)^2 - 5(-1) + 1 = \frac{23}{3}$.
$y(1) = \frac{1^3}{3} + 2(1)^2 - 5(1) + 1 = -\frac{5}{3}$.
$y(3) = \frac{3^3}{3} + 2(3)^2 - 5(3) + 1 = 13$.
Vậy giá trị nhỏ nhất của hàm số trên đoạn $[-1; 3]$ là $\min_{[-1; 3]} y = -\frac{5}{3}$ tại $x = 1$.

[Câu 4] [THONG_HIEU]
Cho hàm số $y = f(x)$ liên tục trên $[-3; 2]$ và có bảng biến thiên như sau. Gọi $M, m$ lần lượt là giá trị lớn nhất và giá trị nhỏ nhất của hàm số $y = f(x)$ trên đoạn $[-3; 2]$. Tính $M + m$.
```bbt
x  | -3, -1, 2
y' | +, 0, -
y  | -2 -> 3 ~> 1
```
A. $0$.
*B. $1$.
C. $3$.
D. $4$.
[Lời giải]
Quan sát bảng biến thiên của hàm số trên đoạn $[-3; 2]$:
- Điểm cao nhất của đồ thị trên đoạn này đạt tại $x = -1$ với $f(-1) = 3$. Do đó $M = \max_{[-3; 2]} f(x) = 3$.
- Điểm thấp nhất của đồ thị trên đoạn này đạt tại $x = -3$ với $f(-3) = -2$. Do đó $m = \min_{[-3; 2]} f(x) = -2$.
Suy ra $M + m = 3 + (-2) = 1$.

[Câu 5] [NHAN_BIET]
Cho hàm số $y = f(x)$ có đồ thị như hình vẽ bên dưới:
```graph
fn: (x + 1)/(x - 1)
domain: [-3, 4]
range: [-3, 4]
points: (0, -1), (3, 2)
asymptotes: x = 1, y = 1
```
Đồ thị hàm số đã cho có đường tiệm cận đứng là:
A. $x = 0$.
B. $y = 1$.
C. $x = -1$.
*D. $x = 1$.
[Lời giải]
Quan sát đồ thị hàm số, ta thấy khi $x \to 1^+$ thì $y \to +\infty$ và khi $x \to 1^-$ thì $y \to -\infty$. Do đó, đường thẳng $x = 1$ là đường tiệm cận đứng của đồ thị hàm số.

[Câu 6] [THONG_HIEU]
Tiệm cận xiên của đồ thị hàm số $y = \frac{x^2 - 2x}{x + 1}$ là
A. $y = x - 2$.
*B. $y = x - 3$.
C. $y = x + 1$.
D. $y = x - 1$.
[Lời giải]
Thực hiện phép chia đa thức tử cho mẫu:
$y = \frac{x^2 - 2x}{x + 1} = \frac{x(x + 1) - 3(x + 1) + 3}{x + 1} = x - 3 + \frac{3}{x + 1}$.
Vì $\lim_{x \to \pm\infty} \frac{3}{x + 1} = 0$ nên đường thẳng $y = x - 3$ là tiệm cận xiên của đồ thị hàm số đã cho.

[Câu 7] [NHAN_BIET]
Đồ thị hàm số $y = \frac{2x - 1}{x + 1}$ có tâm đối xứng là
A. $(1; 2)$.
*B. $(-1; 2)$.
C. $(2; -1)$.
D. $(2; 1)$.
[Lời giải]
Đồ thị hàm số nhất biến $y = \frac{ax + b}{cx + d}$ có tâm đối xứng là giao điểm của đường tiệm cận đứng và đường tiệm cận ngang.
- Tiệm cận đứng: $x = -1$.
- Tiệm cận ngang: $y = 2$.
Do đó, tâm đối xứng của đồ thị hàm số là điểm $I(-1; 2)$.

[Câu 8] [THONG_HIEU]
Đồ thị ở hình bên là của một trong bốn hàm số sau. Hỏi đó là hàm số nào trong các hàm số sau?
```graph
fn: (x^2 - x - 1)/(x - 2)
domain: [-3, 6]
range: [-4, 6]
points: (0, 0.5), (1, 1), (3, 5)
asymptotes: x = 2
```
*A. $y = \frac{x^2 - x - 1}{x - 2}$.
B. $y = \frac{x^2 + x - 1}{x - 2}$.
C. $y = \frac{x + 1}{x - 2}$.
D. $y = -x^3 + 3x + 1$.
[Lời giải]
Quan sát đồ thị:
- Đồ thị có đường tiệm cận đứng là $x = 2$ và đường tiệm cận xiên đi qua điểm $(0; 1)$ và $(-1; 0)$, suy ra phương trình tiệm cận xiên là $y = x + 1$.
- Đồ thị cắt trục tung tại điểm có tung độ dương: $y(0) = \frac{1}{2} > 0$.
- Đồ thị có điểm cực đại là $(1; 1)$.
Xét hàm số ở phương án A: $y = \frac{x^2 - x - 1}{x - 2} = x + 1 + \frac{1}{x - 2}$.
+ Tiệm cận đứng: $x = 2$.
+ Tiệm cận xiên: $y = x + 1$.
+ Khi $x = 0 \Rightarrow y = \frac{-1}{-2} = \frac{1}{2}$ (thoả mãn).
+ $y' = 1 - \frac{1}{(x - 2)^2} = \frac{(x - 1)(x - 3)}{(x - 2)^2} = 0 \Leftrightarrow \left[\begin{aligned} &x = 1 \Rightarrow y = 1 \\ &x = 3 \Rightarrow y = 5. \end{aligned}\right.$
Điểm cực đại là $(1; 1)$ hoàn toàn trùng khớp với đồ thị.

[Câu 9] [THONG_HIEU]
Cho hàm số $y = \frac{-x + 2}{x - 1}$, đồ thị của hàm số đã cho là đồ thị nào sau đây?
[Ảnh]
A. Hình A.
B. Hình B.
C. Hình C.
*D. Hình D.
[Lời giải]
Xét hàm số $y = \frac{-x + 2}{x - 1}$:
- Đồ thị có tiệm cận đứng là $x = 1$.
- Tiệm cận ngang là $y = \frac{-1}{1} = -1$.
- Giao điểm với trục hoành: $y = 0 \Leftrightarrow -x + 2 = 0 \Leftrightarrow x = 2 \Rightarrow (2; 0)$.
- Giao điểm với trục tung: $x = 0 \Rightarrow y = \frac{2}{-1} = -2 \Rightarrow (0; -2)$.
- Đạo hàm: $y' = \frac{(-1)(-1) - 2 \cdot 1}{(x - 1)^2} = \frac{-1}{(x - 1)^2} < 0, \forall x \ne 1$ (hàm số nghịch biến trên từng khoảng xác định).
Đối chiếu với 4 đồ thị đã cho, chỉ có đồ thị ở Hình D thoả mãn đầy đủ các đặc trưng trên.

[Câu 10] [NHAN_BIET]
Cho hình lập phương $ABCD.A'B'C'D'$. Khi đó, vectơ bằng vectơ $\vec{AB}$ là vectơ nào dưới đây?
```geo3d
preset: hinh_hop
solid: AB, BC, CD, DA, A'B', B'C', C'D', D'A'
dashed: AA', BB', CC', DD', AC'
```
*A. $\vec{D'C'}$.
B. $\vec{BA}$.
C. $\vec{CD}$.
D. $\vec{B'A'}$.
[Lời giải]
Trong hình lập phương $ABCD.A'B'C'D'$, mặt phẳng đáy trên và đáy dưới là các hình vuông bằng nhau.
Vectơ $\vec{AB}$ cùng hướng và cùng độ dài với các vectơ $\vec{DC}$, $\vec{A'B'}$, $\vec{D'C'}$.
Do đó $\vec{AB} = \vec{D'C'}$.

[Câu 11] [NHAN_BIET]
Cho hình lập phương $ABCD.A'B'C'D'$. Mệnh đề nào sau đây sai?
```geo3d
preset: hinh_hop
solid: AB, BC, CD, DA, A'B', B'C', C'D', D'A'
dashed: AA', BB', CC', DD'
```
A. $\vec{AB} + \vec{AD} + \vec{AA'} = \vec{AC'}$.
B. $\vec{AC} = \vec{AB} + \vec{AD}$.
C. $|\vec{AB}| = |\vec{CD}|$.
*D. $\vec{AB} = \vec{CD}$.
[Lời giải]
Vì tứ giác $ABCD$ là hình vuông nên hai cạnh $AB$ và $CD$ song song và bằng nhau, nhưng hai vectơ $\vec{AB}$ và $\vec{CD}$ là hai vectơ ngược hướng nhau: $\vec{AB} = -\vec{CD}$ hay $\vec{AB} = \vec{DC}$.
Do đó khẳng định $\vec{AB} = \vec{CD}$ là sai.

[Câu 12] [THONG_HIEU]
Cho hình chóp $S.ABCD$ có đáy $ABCD$ là hình bình hành. Đặt $\vec{SA} = \vec{a}$; $\vec{SB} = \vec{b}$; $\vec{SC} = \vec{c}$; $\vec{SD} = \vec{d}$. Khẳng định nào sau đây đúng?
```geo3d
preset: chop_tu_giac
points: O = mid(A, C)
solid: SB, SC, SD, BC, CD
dashed: SA, AB, AD, AC, BD
```
A. $\vec{a} + \vec{b} + \vec{c} + \vec{d} = \vec{0}$.
B. $\vec{a} + \vec{b} = \vec{c} + \vec{d}$.
C. $\vec{a} + \vec{d} = \vec{b} + \vec{c}$.
*D. $\vec{a} + \vec{c} = \vec{d} + \vec{b}$.
[Lời giải]
Gọi $O$ là tâm hình bình hành $ABCD$, khi đó $O$ đồng thời là trung điểm của $AC$ và $BD$.
Theo tính chất trung điểm của đoạn thẳng trong không gian:
$\vec{SA} + \vec{SC} = 2\vec{SO}$
$\vec{SB} + \vec{SD} = 2\vec{SO}$
Suy ra $\vec{SA} + \vec{SC} = \vec{SB} + \vec{SD} \Leftrightarrow \vec{a} + \vec{c} = \vec{b} + \vec{d}$ (hay $\vec{a} + \vec{c} = \vec{d} + \vec{b}$).

---

=== PHẦN II: TRẮC NGHIỆM ĐÚNG / SAI (4 Ý a, b, c, d) ===

[Câu 1] [TF] [THONG_HIEU]
Một chất điểm chuyển động theo quy luật $s(t) = t^3 - 3t^2 + 9t + 36$ với $t\text{ (s)}$ là khoảng thời gian tính từ lúc chất điểm bắt đầu chuyển động và $s\text{ (m)}$ là quãng đường vật đi được trong khoảng thời gian đó.
*a) Quãng đường vật đi được ở giây thứ $4$ là $88\text{ (m)}$.
*b) Vận tốc của vật tại giây thứ $t$ là $v(t) = 3t^2 - 6t + 9$.
c) Vận tốc của vật nhận giá trị âm trong $2$ giây đầu tiên.
*d) Trong khoảng thời gian $10\text{ (s)}$ đầu tiên, vận tốc của vật nhỏ nhất là $6\text{ (m/s)}$.
[Lời giải]
a) Quãng đường vật đi được sau $4$ giây: $s(4) = 4^3 - 3 \cdot 4^2 + 9 \cdot 4 + 36 = 64 - 48 + 36 + 36 = 88\text{ (m)}$. Ý a) ĐÚNG.
b) Vận tốc tức thời của chuyển động: $v(t) = s'(t) = 3t^2 - 6t + 9$. Ý b) ĐÚNG.
c) Xét tam thức bậc hai $v(t) = 3t^2 - 6t + 9 = 3(t - 1)^2 + 6 \ge 6 > 0, \forall t \ge 0$. Do đó vận tốc luôn dương, không thể nhận giá trị âm. Ý c) SAI.
d) Ta có $v(t) = 3(t - 1)^2 + 6 \ge 6$. Dấu bằng xảy ra khi $t = 1\text{ (s)} \in [0; 10]$. Vậy trong $10\text{ (s)}$ đầu tiên, vận tốc nhỏ nhất của vật là $6\text{ (m/s)}$. Ý d) ĐÚNG.

[Câu 2] [TF] [THONG_HIEU]
Cho hàm số $y = x^3 + x^2 - 5x + 8$.
a) Giá trị của hàm số tại $x = \frac{1}{2}$ là $\frac{11}{2}$.
*b) Đạo hàm của hàm số là $y' = 3x^2 + 2x - 5$.
c) Hàm số nghịch biến trên khoảng $(1; 5)$.
*d) Điểm cực tiểu của hàm số là $x = 1$.
[Lời giải]
a) Ta có $y\left(\frac{1}{2}\right) = \left(\frac{1}{2}\right)^3 + \left(\frac{1}{2}\right)^2 - 5 \cdot \frac{1}{2} + 8 = \frac{1}{8} + \frac{1}{4} - \frac{5}{2} + 8 = \frac{47}{8} \ne \frac{11}{2}$. Ý a) SAI.
b) Đạo hàm $y' = (x^3 + x^2 - 5x + 8)' = 3x^2 + 2x - 5$. Ý b) ĐÚNG.
c) Giải phương trình đạo hàm: $y' = 0 \Leftrightarrow (x - 1)(3x + 5) = 0 \Leftrightarrow \left[\begin{aligned} &x = 1 \\ &x = -\frac{5}{3}. \end{aligned}\right.$
Dấu của $y'$: $y' > 0$ trên $(-\infty; -5/3)$ và $(1; +\infty)$; $y' < 0$ trên $(-5/3; 1)$.
Do khoảng $(1; 5) \subset (1; +\infty)$ nên $y' > 0$ trên $(1; 5)$, suy ra hàm số đồng biến trên khoảng $(1; 5)$. Ý c) SAI.
d) Qua điểm $x = 1$, đạo hàm $y'$ đổi dấu từ âm sang dương, do đó $x = 1$ là điểm cực tiểu của hàm số. Ý d) ĐÚNG.

[Câu 3] [TF] [THONG_HIEU]
Cho hàm số $y = \frac{x^2 - 2x}{x - 1}$.
a) Đồ thị hàm số không có tiệm cận đứng.
*b) Đồ thị hàm số có $1$ tiệm cận xiên là: $y = x - 1$.
c) Tâm đối xứng của đồ thị hàm số là: $I(0; 1)$.
*d) Đồ thị hàm số là hình vẽ đã cho:
```graph
fn: (x^2 - 2*x)/(x - 1)
domain: [-3, 5]
range: [-3, 5]
points: (0, 0), (2, 0)
asymptotes: x = 1
```
[Lời giải]
a) Ta có $\lim_{x \to 1^+} \frac{x^2 - 2x}{x - 1} = -\infty$ và $\lim_{x \to 1^-} \frac{x^2 - 2x}{x - 1} = +\infty$ nên đường thẳng $x = 1$ là tiệm cận đứng của đồ thị hàm số. Khẳng định đồ thị không có tiệm cận đứng là SAI. Ý a) SAI.
b) Biến đổi $y = \frac{x^2 - 2x}{x - 1} = x - 1 - \frac{1}{x - 1}$. Vì $\lim_{x \to \pm\infty} \left(-\frac{1}{x - 1}\right) = 0$ nên đường thẳng $y = x - 1$ là tiệm cận xiên của đồ thị. Ý b) ĐÚNG.
c) Giao điểm của tiệm cận đứng $x = 1$ và tiệm cận xiên $y = x - 1$ là $I(1; 0)$, đây là tâm đối xứng của đồ thị hàm số. Khẳng định $I(0; 1)$ là SAI. Ý c) SAI.
d) Đồ thị hàm số đi qua gốc tọa độ $(0; 0)$ và điểm $(2; 0)$, nhận đường thẳng $x = 1$ làm tiệm cận đứng và $y = x - 1$ làm tiệm cận xiên. Hình vẽ trong đề hoàn toàn chính xác. Ý d) ĐÚNG.

[Câu 4] [TF] [THONG_HIEU]
Cho hình hộp chữ nhật $ABCD.A'B'C'D'$ có $AB = a, AD = 2a, AA' = 3a$.
a) $\vec{AB} = \vec{C'D'}$.
*b) $\vec{BC} + \vec{DA'} = \vec{BB'}$.
*c) $|\vec{AB} + \vec{BC} + \vec{DA'}| = a\sqrt{10}$.
d) $\vec{AC} \cdot \vec{BD'} = 10a^2$.
[Lời giải]
a) Trong hình hộp chữ nhật, $\vec{AB} = \vec{DC} = -\vec{CD} = -\vec{C'D'}$. Do đó hai vectơ $\vec{AB}$ và $\vec{C'D'}$ đối nhau chứ không bằng nhau. Ý a) SAI.
b) Vì $ABCD$ và $ADD'A'$ là các hình bình hành nên $\vec{BC} = \vec{AD}$.
Do đó $\vec{BC} + \vec{DA'} = \vec{AD} + \vec{DA'} = \vec{AA'} = \vec{BB'}$. Ý b) ĐÚNG.
c) Ta có $\vec{AB} + \vec{BC} + \vec{DA'} = \vec{AC} + \vec{CB'} = \vec{AB'}$.
Xét tam giác vuông $ABB'$ tại $B$: $AB' = \sqrt{AB^2 + BB'^2} = \sqrt{a^2 + (3a)^2} = a\sqrt{10}$.
Vậy $|\vec{AB} + \vec{BC} + \vec{DA'}| = a\sqrt{10}$. Ý c) ĐÚNG.
d) Ta phân tích các vectơ theo ba vectơ đôi một vuông góc $\vec{AB}, \vec{AD}, \vec{AA'}$:
$\vec{AC} = \vec{AB} + \vec{AD}$
$\vec{BD'} = \vec{BA} + \vec{AD} + \vec{DD'} = -\vec{AB} + \vec{AD} + \vec{AA'}$
Tích vô hướng:
$\vec{AC} \cdot \vec{BD'} = (\vec{AB} + \vec{AD})(-\vec{AB} + \vec{AD} + \vec{AA'}) = -|\vec{AB}|^2 + |\vec{AD}|^2 + 0 = -a^2 + (2a)^2 = 3a^2 \ne 10a^2$. Ý d) SAI.

---

=== PHẦN III: TRẮC NGHIỆM TRẢ LỜI NGẮN (ĐIỀN SỐ) ===

[Câu 1] [SA] [THONG_HIEU]
Cho hàm số $y = f(x)$ xác định, liên tục trên $\mathbb{R}$ và có đồ thị như hình vẽ bên dưới:
```graph
fn: 1.5*sin(3.1416*x/2)
domain: [-2.4, 2.4]
range: [-1.8, 1.8]
points: (1, 1.5), (-1, -1.5)
asymptotes:
```
Gọi $M$ và $m$ lần lượt là giá trị lớn nhất và giá trị nhỏ nhất của hàm số $g(x) = f(x) + 2026$ trên đoạn $[-2; 2]$. Giá trị $M - m$ bằng bao nhiêu?
[Đáp án: 3]
[Lời giải]
Dựa vào đồ thị hàm số trên đoạn $[-2; 2]$:
- Điểm cao nhất của đồ thị có tọa độ $(1; 1{,}5)$, do đó $\max_{[-2; 2]} f(x) = 1{,}5$.
- Điểm thấp nhất của đồ thị có tọa độ $(-1; -1{,}5)$, do đó $\min_{[-2; 2]} f(x) = -1{,}5$.
Vì $g(x) = f(x) + 2026$ nên:
$M = \max_{[-2; 2]} g(x) = 1{,}5 + 2026$
$m = \min_{[-2; 2]} g(x) = -1{,}5 + 2026$
Suy ra:
$M - m = (1{,}5 + 2026) - (-1{,}5 + 2026) = 1{,}5 - (-1{,}5) = 3$.

[Câu 2] [SA] [VAN_DUNG]
Cho hàm số $y = f(x)$. Biết rằng hàm số $y = f'(x)$ có đồ thị như hình vẽ sau:
```graph
fn: (x + 6)*(x + 1)*(x - 2)/40
domain: [-9, 5]
range: [-6, 6]
points: (-6, 0), (-1, 0), (2, 0)
asymptotes:
```
Hàm số $y = f(3 - x^2)$ có mấy khoảng đồng biến?
[Đáp án: 4]
[Lời giải]
Đặt $g(x) = f(3 - x^2)$.
Đạo hàm: $g'(x) = -2x \cdot f'(3 - x^2)$.
Dựa vào đồ thị $y = f'(x)$:
- $f'(u) > 0 \Leftrightarrow u \in (-6; -1) \cup (2; +\infty)$
- $f'(u) < 0 \Leftrightarrow u \in (-\infty; -6) \cup (-1; 2)$
Hàm số $g(x)$ đồng biến khi $g'(x) > 0$. Ta xét hai trường hợp:
- Trường hợp 1: $x > 0 \Rightarrow -2x < 0$, khi đó:
$g'(x) > 0 \Leftrightarrow f'(3 - x^2) < 0 \Leftrightarrow \left[\begin{aligned} &3 - x^2 < -6 \\ &-1 < 3 - x^2 < 2 \end{aligned}\right. \Leftrightarrow \left[\begin{aligned} &x^2 > 9 \\ &1 < x^2 < 4 \end{aligned}\right. \xrightarrow{x > 0} \left[\begin{aligned} &x > 3 \\ &1 < x < 2. \end{aligned}\right.$
Ta được 2 khoảng đồng biến: $(1; 2)$ và $(3; +\infty)$.
- Trường hợp 2: $x < 0 \Rightarrow -2x > 0$, khi đó:
$g'(x) > 0 \Leftrightarrow f'(3 - x^2) > 0 \Leftrightarrow \left[\begin{aligned} &-6 < 3 - x^2 < -1 \\ &3 - x^2 > 2 \end{aligned}\right. \Leftrightarrow \left[\begin{aligned} &4 < x^2 < 9 \\ &x^2 < 1 \end{aligned}\right. \xrightarrow{x < 0} \left[\begin{aligned} &-3 < x < -2 \\ &-1 < x < 0. \end{aligned}\right.$
Ta được 2 khoảng đồng biến: $(-3; -2)$ và $(-1; 0)$.
Kết hợp lại, hàm số $y = f(3 - x^2)$ có tất cả $4$ khoảng đồng biến: $(-3; -2)$, $(-1; 0)$, $(1; 2)$, $(3; +\infty)$.

[Câu 3] [SA] [VAN_DUNG]
Cho hàm số $y = f(x)$ có đạo hàm $f'(x) = (x - 1)^2(x^2 - 2x)$ với mọi $x \in \mathbb{R}$. Gọi $S$ là tập hợp các giá trị nguyên dương của tham số $m$ để hàm số $y = f(x^2 - 8x + m)$ có $5$ điểm cực trị. Tổng các phần tử của $S$ là bao nhiêu?
[Đáp án: 120]
[Lời giải]
Ta có $f'(x) = x(x - 1)^2(x - 2)$.
Đạo hàm $f'(x)$ đổi dấu khi qua các nghiệm bội lẻ là $x = 0$ và $x = 2$ (không đổi dấu qua nghiệm bội chẵn $x = 1$).
Xét hàm số $g(x) = f(x^2 - 8x + m)$.
Đạo hàm:
$g'(x) = (2x - 8) f'(x^2 - 8x + m) = 2(x - 4)(x^2 - 8x + m)(x^2 - 8x + m - 1)^2(x^2 - 8x + m - 2)$.
Nhân tử $(x^2 - 8x + m - 1)^2 \ge 0$ không làm đổi dấu của $g'(x)$.
Nghiệm $x = 4$ là một nghiệm đơn của $g'(x)$.
Để hàm số $g(x)$ có đúng $5$ điểm cực trị thì phương trình $(x^2 - 8x + m)(x^2 - 8x + m - 2) = 0$ phải có $4$ nghiệm phân biệt khác $4$, tức là hệ sau có $4$ nghiệm phân biệt khác $4$:
$\left\{\begin{aligned} &x^2 - 8x + m = 0 \quad (1) \\ &x^2 - 8x + m = 2 \quad (2) \end{aligned}\right. \Leftrightarrow \left\{\begin{aligned} &(x - 4)^2 = 16 - m \\ &(x - 4)^2 = 18 - m. \end{aligned}\right.$
Điều kiện để mỗi phương trình có hai nghiệm phân biệt khác $4$ và không trùng nhau:
$\left\{\begin{aligned} &16 - m > 0 \\ &18 - m > 0 \end{aligned}\right. \Leftrightarrow m < 16$.
Vì $m$ là tham số nguyên dương nên $m \in \{1; 2; 3; \dots; 15\}$.
Tập hợp $S = \{1; 2; 3; \dots; 15\}$.
Tổng các phần tử của $S$ là:
$\sum_{m=1}^{15} m = \frac{15 \cdot 16}{2} = 120$.

[Câu 4] [SA] [VAN_DUNG]
Giả sử doanh số (tính bằng số sản phẩm) của một sản phẩm mới (trong vòng một số năm nhất định) tuân theo quy luật logistic được mô hình hoá bằng hàm số $f(t) = \frac{5000}{1 + 5e^{-t}}, t \ge 0$, trong đó thời gian $t$ được tính bằng năm, kể từ khi phát hành sản phẩm mới. Khi đó, đạo hàm $f'(t)$ sẽ biểu thị tốc độ bán hàng. Hỏi sau khi phát hành bao nhiêu năm thì tốc độ bán hàng là lớn nhất? (kết quả làm tròn tới hàng phần trăm)
[Đáp án: 1.61]
[Dung sai: 0.01]
[Lời giải]
Đạo hàm biểu thị tốc độ bán hàng:
$f'(t) = 5000 \cdot \frac{-(1 + 5e^{-t})'}{(1 + 5e^{-t})^2} = 5000 \cdot \frac{5e^{-t}}{(1 + 5e^{-t})^2} = \frac{25000 e^{-t}}{(1 + 5e^{-t})^2}$.
Biến đổi biểu thức:
$f'(t) = \frac{25000}{\frac{(1 + 5e^{-t})^2}{e^{-t}}} = \frac{25000}{(e^{t/2} + 5e^{-t/2})^2}$.
Áp dụng bất đẳng thức Cauchy cho hai số dương $e^{t/2}$ và $5e^{-t/2}$:
$e^{t/2} + 5e^{-t/2} \ge 2\sqrt{e^{t/2} \cdot 5e^{-t/2}} = 2\sqrt{5}$.
Suy ra $(e^{t/2} + 5e^{-t/2})^2 \ge 20 \Rightarrow f'(t) \le \frac{25000}{20} = 1250$.
Dấu bằng xảy ra khi và chỉ khi:
$e^{t/2} = 5e^{-t/2} \Leftrightarrow e^t = 5 \Leftrightarrow t = \ln 5 \approx 1{,}6094\dots \approx 1{,}61\text{ (năm)}$.
Vậy sau khoảng $1{,}61$ năm kể từ khi phát hành sản phẩm thì tốc độ bán hàng là lớn nhất.

[Câu 5] [SA] [VAN_DUNG_CAO]
Cho hàm số $y = \frac{x - 3}{x + \sqrt{mx^2 + 4}}$ với $m$ là tham số. Có bao nhiêu giá trị nguyên $m$ để đồ thị hàm số có đúng một tiệm cận ngang?
[Đáp án: 2]
[Lời giải]
Điều kiện để đồ thị hàm số có tiệm cận ngang là tập xác định của nó phải không bị chặn về bên phải (chứa khoảng $(a; +\infty)$) hoặc không bị chặn về bên trái (chứa khoảng $(-\infty; b)$).
- Nếu $m < 0$, điều kiện $mx^2 + 4 \ge 0 \Leftrightarrow x^2 \le -\frac{4}{m} \Leftrightarrow -\frac{2}{\sqrt{-m}} \le x \le \frac{2}{\sqrt{-m}}$. Tập xác định là một đoạn bị chặn, do đó hàm số không có tiệm cận ngang.
- Do đó ta xét $m \ge 0$. Khi đó $mx^2 + 4 \ge 4 > 0, \forall x \in \mathbb{R}$.
+ Trường hợp 1: $m = 0$.
Hàm số trở thành $y = \frac{x - 3}{x + 2}$.
Tập xác định $D = \mathbb{R} \setminus \{-2\}$.
Ta có $\lim_{x \to +\infty} y = \lim_{x \to -\infty} y = 1$, do đó đồ thị có duy nhất một tiệm cận ngang là đường thẳng $y = 1$. Vậy $m = 0$ thoả mãn.
+ Trường hợp 2: $m > 0$.
* Khi $x \to +\infty$:
$\lim_{x \to +\infty} y = \lim_{x \to +\infty} \frac{x(1 - \frac{3}{x})}{x(1 + \sqrt{m + \frac{4}{x^2}})} = \frac{1}{1 + \sqrt{m}}$.
Đường thẳng $y = \frac{1}{1 + \sqrt{m}}$ luôn là một tiệm cận ngang của đồ thị hàm số khi $x \to +\infty$.
* Khi $x \to -\infty$:
$y = \frac{x - 3}{x + \sqrt{mx^2 + 4}} = \frac{x(1 - \frac{3}{x})}{x - x\sqrt{m + \frac{4}{x^2}}} = \frac{1 - \frac{3}{x}}{1 - \sqrt{m + \frac{4}{x^2}}}$.
- Nếu $1 - \sqrt{m} \ne 0 \Leftrightarrow m \ne 1$:
Khi đó $\lim_{x \to -\infty} y = \frac{1}{1 - \sqrt{m}}$.
Để đồ thị có đúng một tiệm cận ngang thì hai tiệm cận ngang phải trùng nhau:
$\frac{1}{1 + \sqrt{m}} = \frac{1}{1 - \sqrt{m}} \Leftrightarrow 1 + \sqrt{m} = 1 - \sqrt{m} \Leftrightarrow \sqrt{m} = 0 \Leftrightarrow m = 0$ (loại vì $m > 0$).
Do đó với $m > 0, m \ne 1$ thì đồ thị luôn có 2 tiệm cận ngang phân biệt.
- Nếu $m = 1$:
Khi $x \to -\infty$, ta nhân lượng liên hợp ở mẫu:
$y = \frac{x - 3}{x + \sqrt{x^2 + 4}} = \frac{(x - 3)(x - \sqrt{x^2 + 4})}{x^2 - (x^2 + 4)} = \frac{(x - 3)(x - \sqrt{x^2 + 4})}{-4}$.
Vì $\lim_{x \to -\infty} (x - 3) = -\infty$ và $\lim_{x \to -\infty} (x - \sqrt{x^2 + 4}) = -\infty$, nên tử số tiến về $+\infty$, mẫu số là $-4$, suy ra:
$\lim_{x \to -\infty} y = -\infty$.
Do đó khi $x \to -\infty$, đồ thị không có tiệm cận ngang.
Vậy với $m = 1$, đồ thị có duy nhất một tiệm cận ngang là $y = \frac{1}{1 + \sqrt{1}} = \frac{1}{2}$ (khi $x \to +\infty$). Do đó $m = 1$ thoả mãn.
Tổng kết: Có 2 giá trị nguyên của $m$ thoả mãn là $m = 0$ và $m = 1$.

[Câu 6] [SA] [VAN_DUNG]
Một chiếc đèn tròn có khối lượng $m = 3{,}2\text{ kg}$ được treo song song với mặt phẳng nằm ngang bởi bốn sợi dây không dãn xuất phát từ điểm $S$ trên trần nhà và lần lượt buộc vào bốn điểm $A, B, C, D$ trên đèn tròn sao cho $S.ABCD$ là hình chóp tứ giác đều có góc $\widehat{ASC} = 60^\circ$ (tham khảo hình vẽ bên dưới). Biết trọng lượng của chiếc đèn được tính theo công thức $P = m \cdot g$ (tính theo đơn vị $\text{N}$). Trong đó $g$ là gia tốc trọng trường có độ lớn $9{,}8\text{ m/s}^2$. Tìm độ lớn của lực căng cho mỗi sợi dây xích (làm tròn kết quả đến hàng phần trăm).
```geo3d
preset: chop_tu_giac_deu
points: O = mid(A, C)
solid: SB, SC, SD, BC, CD
dashed: SA, AB, AD, AC, BD, SO
```
[Đáp án: 9.05]
[Dung sai: 0.01]
[Lời giải]
Trọng lượng của chiếc đèn tròn là:
$P = m \cdot g = 3{,}2 \cdot 9{,}8 = 31{,}36\text{ (N)}$.
Gọi $\vec{T}_A, \vec{T}_B, \vec{T}_C, \vec{T}_D$ lần lượt là lực căng của 4 sợi dây xích tác dụng lên đèn tròn tại các điểm $A, B, C, D$.
Khi chiếc đèn ở trạng thái cân bằng tĩnh, ta có:
$\vec{T}_A + \vec{T}_B + \vec{T}_C + \vec{T}_D + \vec{P} = \vec{0} \Rightarrow \vec{T}_A + \vec{T}_B + \vec{T}_C + \vec{T}_D = -\vec{P}$.
Do $S.ABCD$ là hình chóp tứ giác đều nên các sợi dây có chiều dài bằng nhau: $SA = SB = SC = SD$, từ đó độ lớn lực căng của các sợi dây là bằng nhau:
$|\vec{T}_A| = |\vec{T}_B| = |\vec{T}_C| = |\vec{T}_D| = T$.
Gọi $O$ là tâm của đáy $ABCD$, suy ra $SO \perp (ABCD)$ và $SO$ nằm trên phương thẳng đứng.
Tam giác $SAC$ cân tại $S$ (do $SA = SC$) có góc $\widehat{ASC} = 60^\circ$ nên tam giác $SAC$ là tam giác đều.
Do đó góc giữa mỗi sợi dây và phương thẳng đứng $SO$ là:
$\alpha = \widehat{ASO} = \frac{1}{2}\widehat{ASC} = 30^\circ$.
Chiếu hệ thức cân bằng véc-tơ lên phương thẳng đứng $SO$ (hướng lên trên):
$T_A \cos\alpha + T_B \cos\alpha + T_C \cos\alpha + T_D \cos\alpha = P$
$\Leftrightarrow 4 \cdot T \cdot \cos 30^\circ = P \Leftrightarrow 4 \cdot T \cdot \frac{\sqrt{3}}{2} = 31{,}36 \Leftrightarrow 2\sqrt{3} T = 31{,}36$
$\Rightarrow T = \frac{31{,}36}{2\sqrt{3}} \approx 9{,}05285\dots \approx 9{,}05\text{ (N)}$.
Vậy độ lớn của lực căng cho mỗi sợi dây xích xấp xỉ $9{,}05\text{ N}$.
