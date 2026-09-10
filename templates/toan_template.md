# TEMPLATE ĐỀ THI MÔN TOÁN HỌC (CHUẨN BỘ GD&ĐT)

> **HƯỚNG DẪN DÀNH CHO GIÁO VIÊN:**
> 1. Đề thi gồm 3 phần chuẩn format:
>    - **Phần I: Trắc nghiệm ABCD** (Đánh dấu `*` trước phương án đúng, ví dụ: `*A.`, `*B.`)
>    - **Phần II: Trắc nghiệm Đúng / Sai** (Đánh dấu `*` trước các ý **ĐÚNG**, ví dụ: `*a)` là Đúng, `b)` là Sai)
>    - **Phần III: Trắc nghiệm Trả lời ngắn** (Ghi `[Đáp án: <số>]` và `[Dung sai: <số>]` nếu có)
> 2. **Công thức Toán học**: Kẹp giữa hai dấu `$ ... $` (ví dụ: `$y = f(x)$`, `$\int_0^1 x^2 dx$`, `$\frac{a\sqrt{3}}{2}$`).
> 3. **Hình ảnh (Đồ thị, Bảng biến thiên, Hình học không gian)**:
>    - Chỉ cần ghi chữ `[Ảnh]` ở nơi cần đặt hình.
>    - Sau khi bấm **"Phân tích & Xem trước"**, bạn chỉ cần dùng Snipping Tool (`Win + Shift + S`) chụp ảnh từ file Word rồi bấm **`Ctrl + V`** trực tiếp vào khung ảnh của câu đó!
> 4. **Lời giải chi tiết**: Bắt đầu bằng dòng `[Lời giải]` ở cuối mỗi câu (không bắt buộc nhưng khuyên dùng).

---

=== PHẦN I: TRẮC NGHIỆM NHIỀU LỰA CHỌN (A, B, C, D) ===

[Câu 1]
Cho hàm số $y = f(x)$ liên tục trên $\mathbb{R}$ và có đồ thị như hình vẽ bên dưới:
[Ảnh]
Điểm cực đại của đồ thị hàm số đã cho có tọa độ là:
A. $(1; -2)$
*B. $(-1; 2)$
C. $x = -1$
D. $y = 2$
[Lời giải]
Dựa vào đồ thị hàm số, điểm uốn cực đại của đồ thị có tọa độ là $(-1; 2)$. Điểm cực đại của hàm số là $x = -1$, giá trị cực đại là $y = 2$.

[Câu 2]
Cho hàm số $y = \frac{2x + 1}{x - 1}$. Tiệm cận ngang của đồ thị hàm số là đường thẳng:
A. $x = 1$
B. $y = 1$
*C. $y = 2$
D. $x = 2$
[Lời giải]
Ta có $\lim_{x \to \pm \infty} \frac{2x + 1}{x - 1} = 2$, suy ra đường tiệm cận ngang của đồ thị hàm số là $y = 2$.

[Câu 3]
Cho hình lập phương $ABCD.A'B'C'D'$ có cạnh bằng $a$.
[Ảnh]
Góc giữa hai đường thẳng $A'B$ và $B'C$ bằng:
A. $30^\circ$
*B. $60^\circ$
C. $90^\circ$
D. $45^\circ$
[Lời giải]
Vì $A'B \parallel D'C$ nên góc giữa $A'B$ và $B'C$ chính là góc giữa $D'C$ và $B'C$, tức là $\widehat{BCD'}$.
Tam giác $B D' C$ có ba cạnh $B D' = B C = C D' = a\sqrt{2}$ nên là tam giác đều, do đó góc bằng $60^\circ$.

[Câu 4]
Tập nghiệm của bất phương trình $\log_2(x - 1) < 3$ là:
A. $(-\infty; 9)$
*B. $(1; 9)$
C. $(1; 8)$
D. $(1; 10)$
[Lời giải]
Điều kiện xác định: $x - 1 > 0 \Leftrightarrow x > 1$.
Ta có $\log_2(x - 1) < 3 \Leftrightarrow x - 1 < 2^3 = 8 \Leftrightarrow x < 9$.
Kết hợp điều kiện suy ra $x \in (1; 9)$.


=== PHẦN II: TRẮC NGHIỆM ĐÚNG / SAI (4 Ý a, b, c, d) ===

[Câu 5] [TF]
Cho hình chóp $S.ABCD$ có đáy $ABCD$ là hình vuông cạnh $a$. Cạnh bên $SA \perp (ABCD)$ và $SA = a\sqrt{3}$.
[Ảnh]
Xét tính Đúng / Sai của các khẳng định sau:
*a) Đường thẳng $SA$ vuông góc với mặt phẳng $(ABCD)$.
*b) Góc giữa đường thẳng $SB$ và mặt phẳng $(ABCD)$ bằng $60^\circ$.
c) Thể tích khối chóp $S.ABCD$ bằng $a^3\sqrt{3}$.
*d) Khoảng cách từ điểm $A$ đến mặt phẳng $(SBD)$ bằng $\frac{a\sqrt{21}}{7}$.
[Lời giải]
- Ý a ĐÚNG: Giả thiết bài toán cho $SA \perp (ABCD)$.
- Ý b ĐÚNG: Vì $SA \perp (ABCD)$ nên hình chiếu của $SB$ lên $(ABCD)$ là $AB$. Do đó góc giữa $SB$ và $(ABCD)$ là $\widehat{SBA}$. $\tan \widehat{SBA} = \frac{SA}{AB} = \frac{a\sqrt{3}}{a} = \sqrt{3} \Rightarrow \widehat{SBA} = 60^\circ$.
- Ý c SAI: Thể tích khối chóp là $V = \frac{1}{3} S_{ABCD} \cdot SA = \frac{1}{3} a^2 \cdot a\sqrt{3} = \frac{a^3\sqrt{3}}{3}$.
- Ý d ĐÚNG: Kẻ $AH \perp BD$ tại tâm $O$, kẻ $AK \perp SO \Rightarrow d(A, (SBD)) = AK = \frac{SA \cdot AO}{\sqrt{SA^2 + AO^2}} = \frac{a\sqrt{21}}{7}$.

[Câu 6] [TF]
Cho hàm số bậc ba $y = f(x) = ax^3 + bx^2 + cx + d$ có bảng biến thiên như sau:
[Ảnh]
Xét tính Đúng / Sai của các mệnh đề sau:
*a) Hàm số đồng biến trên khoảng $(-\infty; 0)$ và $(2; +\infty)$.
b) Giá trị cực tiểu của hàm số bằng $2$.
*c) Phương trình $f(x) - 1 = 0$ có đúng $3$ nghiệm thực phân biệt.
d) Hệ số $a < 0$.
[Lời giải]
- Ý a ĐÚNG: Dựa vào bảng biến thiên, đạo hàm $f'(x) > 0$ trên các khoảng $(-\infty; 0)$ và $(2; +\infty)$.
- Ý b SAI: Giá trị cực tiểu là $y_{CT} = -2$ tại $x = 2$.
- Ý c ĐÚNG: Đường thẳng $y = 1$ cắt đồ thị tại 3 điểm phân biệt nằm giữa $-2$ và $2$.
- Ý d SAI: Nhánh vô cực bên phải đi lên ($x \to +\infty \Rightarrow y \to +\infty$) nên hệ số $a > 0$.


=== PHẦN III: TRẮC NGHIỆM TRẢ LỜI NGẮN (ĐIỀN SỐ) ===

[Câu 7] [SA]
Tính diện tích hình phẳng giới hạn bởi đồ thị hàm số $y = x^2 - 2x$, trục hoành $Ox$ và hai đường thẳng $x = 0$, $x = 3$. (Làm tròn đến chữ số thập phân thứ hai).
[Đáp án: 2.67]
[Dung sai: 0.05]
[Lời giải]
Diện tích $S = \int_0^3 |x^2 - 2x| dx = \int_0^2 (2x - x^2) dx + \int_2^3 (x^2 - 2x) dx = \frac{4}{3} + \frac{4}{3} = \frac{8}{3} \approx 2,67$.

[Câu 8] [SA]
Một con lắc đơn có chiều dài dây treo $l = 1\text{ m}$ dao động tại nơi có gia tốc trọng trường $g = \pi^2 \approx 9,8\text{ m/s}^2$. Tính chu kỳ dao động riêng của con lắc (theo giây).
[Đáp án: 2]
[Dung sai: 0.1]
[Lời giải]
Chu kỳ dao động của con lắc đơn: $T = 2\pi \sqrt{\frac{l}{g}} = 2\pi \sqrt{\frac{1}{\pi^2}} = 2\text{ giây}$.
