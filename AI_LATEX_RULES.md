# Hướng dẫn tạo mã LaTeX cho Hệ thống Đề thi (Toán & Hóa học)

Tài liệu này định nghĩa các quy tắc (rules) chặt chẽ khi sinh mã LaTeX cho hệ thống render đề thi. Hệ thống sử dụng một trình parser tự xây dựng bằng Vanilla JS kết hợp với KaTeX (hỗ trợ `mhchem`) và TikZ. Do đó, AI cần tuân thủ nghiêm ngặt các cú pháp dưới đây để tránh lỗi parse và render.

---

## 1. Quy định chung về định dạng Toán & Hóa học

- **Toán học:** Tất cả công thức toán học phải được bọc trong môi trường toán học:
  - Inline math: `$...$` hoặc `\(...\)`
  - Display math: `$$...$$` hoặc `\[...\]`
- **Hóa học (`mhchem`):** 
  - Sử dụng lệnh `\ce{...}` để viết phương trình, công thức hóa học.
  - **Quy tắc bọc:** 
    - Lệnh `\ce{...}` có thể đứng độc lập trong văn bản (ví dụ: `Cho chất \ce{CuSO4} vào nước...`), hệ thống sẽ tự động xử lý.
    - Nếu `\ce{...}` đã được đặt bên trong môi trường toán học (ví dụ: `$$ \underset{\text{đỏ}}{\ce{NO2}} \rightleftharpoons \ce{N2O4} $$`), **không** bọc thêm `$` ngay sát `\ce` nữa.
- **Ngoặc nhọn:** Parser bóc tách đối số dựa trên thuật toán Balanced Brace. Mọi cặp ngoặc nhọn `{` và `}` phải được đóng/mở cân bằng. Nếu có ký tự `{` hoặc `}` trong văn bản hiển thị, phải escape bằng `\{` hoặc `\}`.

---

## 2. Cấu trúc các dạng Câu hỏi

Hệ thống nhận diện bắt đầu một câu hỏi thông qua từ khóa `\Cau`, `Câu X:` hoặc các khối lệnh như `\begin{TrueFalseBox}`, `\ShortAnswerBox`.

### 2.1. Trắc nghiệm 4 lựa chọn (Multiple Choice)
Sử dụng các macro `\choice`, `\choiceTwo`, `\choiceFour`.
- **Yêu cầu:** Bắt buộc phải cung cấp đủ 4 đối số được bọc trong ngoặc nhọn.
- **Đánh dấu đáp án:** Thêm lệnh `\True` ở ngay đầu nội dung của đáp án đúng.
- **Ví dụ:**
```latex
\Cau Hỏi về thủ đô của Việt Nam?
\choice
{\True Hà Nội}
{Hồ Chí Minh}
{Đà Nẵng}
{Hải Phòng}
```
*(Nếu không dùng `\True`, có thể dùng comment đáp án ở cuối câu: `% Key: A`)*

### 2.2. Trắc nghiệm Đúng / Sai (True / False)
Mỗi câu hỏi có chính xác 4 mệnh đề cần xác định Đúng/Sai.
- **Cách 1 (Dùng `\choiceTF`):** Tương tự trắc nghiệm 4 lựa chọn, truyền 4 đối số. Dùng `\True` cho mệnh đề ĐÚNG.
```latex
\Cau Đánh giá các mệnh đề sau:
\choiceTF
{\True Mệnh đề A đúng}
{Mệnh đề B sai}
{Mệnh đề C sai}
{\True Mệnh đề D đúng}
```
- **Cách 2 (Dùng môi trường `TrueFalseBox`):**
```latex
\begin{TrueFalseBox}{Nội dung phần dẫn chung của câu hỏi...}
  \tfStatement{\True Mệnh đề 1 đúng}
  \tfStatement{Mệnh đề 2 sai}
  \tfStatement{Mệnh đề 3 sai}
  \tfStatement{\True Mệnh đề 4 đúng}
\end{TrueFalseBox}
```
*(Hoặc dùng comment ghi chú đáp án: `% Key: DSSD`)*

### 2.3. Câu hỏi Trả lời ngắn (Short Answer)
Cung cấp một ô điền đáp án bằng `\shortans` hoặc `\ShortAnswerBox`.
- **Cách 1:** `\Cau Tính giá trị biểu thức. \shortans{12.5}`
- **Cách 2:** `\ShortAnswerBox{Tính giá trị biểu thức.} % Key: 12.5`
- Ghi chú: Đáp án đúng được lấy từ tham số của `\shortans` hoặc từ comment `% Key: <đáp án>`.

---

## 3. Khai báo Đáp án (Answer Keys) qua Comment
Nếu không dùng lệnh `\True` hoặc tham số trực tiếp, hệ thống hỗ trợ quét đáp án qua các comment (dòng bắt đầu bằng `%`).
- **Trắc nghiệm:** `% Câu 1 - Key: A` hoặc `% Key: A`
- **Đúng / Sai:** `% Key: a-S, b-Đ, c-S, d-Đ` hoặc `% Key: SDSD`
- **Trả lời ngắn:** `% Key: 42` hoặc `% Key: -1.5`

---

## 4. Hình vẽ, Đồ thị và Bảng xét dấu

Hệ thống hỗ trợ parse và render trực tiếp HTML/SVG cho một số thành phần đặc thù:

- **Bảng biến thiên / Xét dấu (tkz-tab):**
  - Giới hạn sử dụng lệnh `\tkzTabInit` và `\tkzTabLine` cơ bản. 
  - Phải đặt trong môi trường `\begin{tikzpicture} ... \end{tikzpicture}`.
  - Ví dụ: 
    ```latex
    \begin{tikzpicture}
    \tkzTabInit{$x$ / 1 , $y'$ / 1}{$-\infty$, $0$, $+\infty$}
    \tkzTabLine{, -, z, +, }
    \end{tikzpicture}
    ```
- **Đồ thị / Hình học (TikZ):** Dùng `\begin{tikzpicture} ... \end{tikzpicture}`. Hệ thống sẽ tự compile sang SVG.
- **Hình ảnh ngoại tuyến:** 
  - Dùng `\includegraphics[width=...]{ten_anh.png}` 
  - Hoặc dùng thẻ giữ chỗ tùy biến: `[HÌNH]` hoặc `[HÌNH: ten_anh.png]`

---

## 5. Những lệnh cần TRÁNH (Blacklist)

Trình parser sẽ tự động xóa (dọn dẹp) các lệnh phục vụ dàn trang in ấn để đảm bảo hiển thị Web tốt nhất. Không nên lạm dụng sinh ra các lệnh này vì chúng vô tác dụng:
- Các lệnh khoảng trắng / xuống trang: `\newpage`, `\vspace{...}`, `\hspace{...}`, `\hfill`, `\par`, `\noindent`.
- Lệnh đếm tự động: `\stepcounter`.
- Các macro trang trí không phổ biến (ví dụ: `\drawMinion`, `\minionQuestionIcon`).

**Tóm tắt quan trọng cho AI:** Luôn trả về mã LaTeX sạch (clean LaTeX), đặt biến toán học vào đúng thẻ KaTeX, dùng đúng số lượng tham số cho `\choice` (4 cái) và chắc chắn ngoặc nhọn `{ }` được đóng mở hợp lệ!
