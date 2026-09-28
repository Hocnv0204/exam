# 📋 KẾ HOẠCH HỢP NHẤT CẢI TIẾN NGÂN HÀNG ĐỀ THI (QUESTION BANK)

> **Căn cứ:** Tài liệu mô tả kiến trúc `question_bank`, kết quả đối chiếu mã nguồn thực tế và đóng góp hiệu chỉnh quy trình (v2.0 - 28/09/2026).

---

## 🔍 PHẦN I: BÁO CÁO XÁC MINH MÃ NGUỒN HIỆN TẠI (BƯỚC 0)

| STT | Hạng mục kỹ thuật | Kết quả đối chiếu mã nguồn thực tế | Quyết định kỹ thuật |
| :---: | :--- | :--- | :--- |
| **1** | **Xử lý Scope & Câu mồ côi** | `question-bank/index.ts:799-804` dùng `.or(grade_block.eq..., class_id.in...)`. Câu có `class_id/chapter_id IS NULL` nhưng có `grade_block` vẫn vào pool `BLOCK`. | Mỗi cấp chỉ lọc theo cột của chính nó. Tách bộ lọc chưa phân loại thành 3 trạng thái: Chưa có lớp, Chưa có chương, Chưa có bài (Phase 1). |
| **2** | **Luồng chốt đề thi** | FE ([`question-bank.js:2017`](file:///home/hocnguyen/Documents/Projects/exam/fe/src/js/views/question-bank.js#L2017)) **đã dùng `create-from-selected` và truyền đúng `questionBankIds`**. Tuy nhiên BE `generate-exam` vẫn còn nhánh bốc lại nếu `previewOnly=false`. | **Không tạo endpoint mới**. Nâng cấp `create-from-selected` và gỡ bỏ hoàn toàn nhánh bốc lại trong `generate-exam` (Phase 0). |
| **3** | **Kiểm tra trùng khi Import** | [`index.ts:594-608`](file:///home/hocnguyen/Documents/Projects/exam/supabase/functions/question-bank/index.ts#L594-L608): Kéo toàn bộ cột `prompt` của cả bảng vào RAM và so sánh 100 ký tự đầu (`slice(0, 100)`). Rất tốn RAM và dễ loại nhầm câu khác nhau có cùng mở đầu. | **Vá nhanh ngay Phase 0**: Lọc theo `grade_block`, so sánh chuỗi chuẩn hóa đầy đủ. Chuyển sang `content_hash` SHA-256 ở Phase 2. |
| **4** | **Lưu trữ & Parse `prompt`** | Cột `prompt` là kiểu `TEXT`. Cả FE ([`question-bank.js:653`](file:///home/hocnguyen/Documents/Projects/exam/fe/src/js/views/question-bank.js#L653)) và BE ([`index.ts:85`](file:///home/hocnguyen/Documents/Projects/exam/supabase/functions/question-bank/index.ts#L85)) đang phải chạy vòng lặp `while (unwrapCount < 3)` để gỡ stringified JSON lồng nhau. | Chuyển sang kiểu **`JSONB`** native; thống nhất module chuẩn hóa dữ liệu (Phase 2). |
| **5** | **Phân quyền & Bảo mật** | Edge Function chặn bằng `requireAuth` + `user.role === 'ADMIN'`. RLS trên bảng `question_bank` chỉ cho phép `service_role` và `is_admin()`. Học sinh không thể đọc ngân hàng. | Bảo mật đạt yêu cầu. Duy trì cơ chế hiện tại. |
| **6** | **Chỉ số `usage_count` & Vòng đời** | `usage_count` tăng ngay khi gọi `create-from-selected`. Chưa từng có cơ chế hoàn tác (unbump). Bảng `questions` chưa lưu `question_bank_id` nên đề cũ không truy vết ngược được. | Đề cũ mang `question_bank_id = NULL`, mặc định đã xuất bản và không hỗ trợ unbump. Đề mới lưu `question_bank_id` và hỗ trợ unbump (Phase 4). |
| **7** | **Chấm điểm Đúng/Sai & TL Ngắn** | - Câu Đúng/Sai: [`grading-service.ts:3-9`](file:///home/hocnguyen/Documents/Projects/exam/supabase/shared/grading-service.ts#L3-L9) đã đạt chuẩn BGD 2025 (0.1, 0.25, 0.5, 1.0).<br>- Câu TL Ngắn: `normalizeShortAnswer()` chỉ mới đổi dấu `,` thành `.`, **chưa xử lý phân số (7/2) và dấu trừ Unicode (`−`, `–`)**. | Đạt chuẩn Đúng/Sai 2025. Cần bổ sung xử lý phân số & dấu trừ Unicode cho `normalizeShortAnswer()` (Phase 2). |

---

## 📅 PHẦN II: LỘ TRÌNH VÀ CHI TIẾT TỪNG PHASE

```mermaid
gantt
    title Lộ trình Triển khai Cải tiến Ngân hàng Đề thi (v2.0)
    dateFormat  YYYY-MM-DD
    section Phase 0: Hotfix
    Fix Comparator, Bỏ bốc lại, Vá Import-HW :p0, 2026-09-29, 1d
    section Phase 1: Scope & Tag độ khó
    Scope Resolution mới & Checkbox Đa lớp/Bài :p1_1, after p0, 2d
    Parser Thẻ Độ khó & Công cụ gán hàng loạt  :p1_2, after p1_1, 1d
    section Phase 2: Toàn vẹn dữ liệu
    Backfill Grade_block, Hash đề+đáp án      :p2_1, after p1_2, 2d
    Migration ENUM, CHECK, JSONB & Fix TL Ngắn :p2_2, after p2_1, 1d
    section Phase 3: Ma trận độ khó
    Ma trận 4 mức nhận thức & Thuật toán Balanced :p3, after p2_2, 3d
    section Phase 4 & 5: Đổi câu & Lịch sử
    Vòng đời đề (is_published), question_bank_id :p4, after p3, 2d
    Bảng question_usage_log & Trọng số thời gian  :p5, after p4, 2d
    section Phase 6 & 7: Hoán vị & Hiệu năng
    Mã đề hoán vị, GIN Tags & 2-step Query fetch :p6, after p5, 3d
```

---

### Phase 0: Hotfix Thuật toán, Chặn bốc lại & Vá Import-HW (Ưu tiên: CAO - Thời gian: 1 ngày)

#### 0.1 Sửa comparator của `pickRandomWeighted`
- **Vấn đề:** Gọi `Math.random()` trực tiếp trong comparator của `.sort()` vi phạm hợp đồng toán học của `Array.prototype.sort`, khiến phân phối ngẫu nhiên bị méo mó.
- **Giải pháp:** Tính trước `sortKey` 1 lần cho mỗi câu trước khi sắp xếp:
  ```typescript
  const NOISE = 0.8 // Giữ phân tầng cứng: câu usage=0 luôn ưu tiên hơn usage=1
  const pickRandomWeighted = (pool: any[], count: number) => {
    if (count <= 0) return []
    return pool
      .map(q => ({ q, sortKey: (q.usage_count || 0) + Math.random() * NOISE }))
      .sort((a, b) => a.sortKey - b.sortKey)
      .slice(0, count)
      .map(x => x.q)
  }
  ```

#### 0.2 Nâng cấp `create-from-selected` & Chặn nhánh bốc lại trong `generate-exam`
- **Nguyên tắc:** Giao diện FE đã dùng `create-from-selected` để truyền danh sách `questionBankIds` đã duyệt ở Preview $\rightarrow$ **Không thêm endpoint `finalize-exam` mới**.
- **Nâng cấp `create-from-selected`**:
  - Xác thực số lượng câu theo từng dạng (MC, TF, SA) khớp với yêu cầu đề thi.
  - Bảo toàn tuyệt đối thứ tự mảng `questionBankIds` do FE gửi lên.
  - Kiểm tra các câu hỏi thuộc đúng quyền hạn quản trị.
- **Trong `generate-exam`**:
  - Gỡ bỏ hoàn toàn nhánh bốc lại khi `previewOnly: false`. Nếu client gửi `previewOnly: false`, trả lỗi `400 Bad Request` yêu cầu sử dụng luồng `create-from-selected`.

#### 0.3 `swap-question` ghi nhớ các câu đã loại
- Modal phía FE duy trì mảng `rejectedIds` trong suốt phiên làm việc.
- Gửi `excludeIds = [...câu đang hiển thị trên đề, ...rejectedIds]`.
- Khi kho hết ứng viên thay thế thỏa mãn điều kiện, trả mã lỗi rõ ràng `NO_MORE_CANDIDATES` để hiển thị thông báo thay vì bốc lại câu cũ.

#### 0.4 Vá khẩn cấp hiệu năng `import-from-homework`
- Không chờ đến Phase 2. Vá ngay lỗi kéo toàn bộ bảng `question_bank` vào RAM:
  - Chỉ `SELECT id, prompt` có lọc theo `grade_block` của các bài tập đích.
  - Chuẩn hóa toàn bộ chuỗi văn bản (bỏ khoảng trắng thừa, lowercase) thay vì cắt ngắn `slice(0, 100)`.

---

### Phase 1: Scope Resolution thế hệ mới, Parser Thẻ Độ khó & Công cụ Gán hàng loạt (Ưu tiên: CAO - Thời gian: 3 ngày)

#### 1.1 Hợp đồng API Scope mới
```jsonc
POST question-bank?action=generate-exam
{
  "previewOnly": true,
  "scope": {
    "gradeBlock": "11-Hóa",               // Bắt buộc
    "classIds":   ["uuid-1", "uuid-2"],   // Tùy chọn (rỗng = mọi lớp trong khối)
    "chapterIds": ["uuid-ch1"],           // Tùy chọn
    "lessonIds":  ["uuid-l1", "uuid-l2"]  // Tùy chọn
  },
  "matrix": { "MULTIPLE_CHOICE": 12, "TRUE_FALSE": 4, "SHORT_ANSWER": 6 }
}
```
*Tương thích ngược: Adapter ở đầu Edge Function tự chuyển đổi request dạng phẳng cũ `{ scopeType, classId... }` sang object `scope`.*

#### 1.2 Hàm `buildPoolQuery(scope, type)` & Xử lý câu mồ côi nhất quán
- **Nguyên tắc phân tầng độc lập**: Mỗi cấp chỉ lọc theo đúng cột của chính nó:
  - Scope Bài học: lọc theo `lesson_id = ANY(lessonIds)`.
  - Scope Chương: lọc theo `chapter_id = ANY(chapterIds)` (câu có `chapter_id` nhưng `lesson_id IS NULL` vẫn hợp lệ).
  - Scope Lớp học: lọc theo `class_id = ANY(classIds)` (câu có `class_id` nhưng `chapter_id IS NULL` vẫn hợp lệ).
  - Scope Khối: lọc theo `grade_block = gradeBlock` (câu chưa phân lớp/chương/bài vẫn vào pool khối).

#### 1.3 Giao diện Modal Ma trận đa lựa chọn
- Cấu trúc cây chọn lọc: Khối $\rightarrow$ Danh sách Lớp (Checkboxes) $\rightarrow$ Danh sách Chương $\rightarrow$ Danh sách Bài (Checkboxes).
- **Live Availability Badge**: Hiển thị số lượng câu khả dụng (TN / ĐS / TLN) theo thời gian thực bên cạnh từng mục.
- Cảnh báo sớm đổi màu đỏ các mục không đủ số lượng câu yêu cầu trước khi bấm bốc đề.

#### 1.4 Bộ lọc "Chưa phân loại" đa trạng thái
Phân tách rõ 3 trạng thái câu hỏi chưa hoàn thiện danh mục:
1. Chưa gán lớp: `class_id IS NULL`
2. Chưa gán chương: `chapter_id IS NULL`
3. Chưa gán bài: `lesson_id IS NULL`

#### 1.5 Bóc tách thẻ Mức độ nhận thức từ Markdown (`exam-parser.js`)
- Mở rộng Regex nhận diện các thẻ độ khó trên tiêu đề câu hỏi:
  - `[NHAN_BIET]` hoặc `[NB]` $\rightarrow$ `NHAN_BIET` (Nhận biết)
  - `[THONG_HIEU]` hoặc `[TH]` $\rightarrow$ `THONG_HIEU` (Thông hiểu)
  - `[VAN_DUNG]` hoặc `[VD]` $\rightarrow$ `VAN_DUNG` (Vận dụng)
  - `[VAN_DUNG_CAO]` hoặc `[VDC]` $\rightarrow$ `VAN_DUNG_CAO` (Vận dụng cao)
- Hỗ trợ linh hoạt thứ tự thẻ ở cả 3 dạng:
  - Trắc nghiệm: `[Câu 1] [NHAN_BIET]`
  - Đúng / Sai: `[Câu 5] [TF] [THONG_HIEU]` hoặc `[Câu 5] [THONG_HIEU] [TF]`
  - Trả lời ngắn: `[Câu 7] [SA] [VAN_DUNG]` hoặc `[Câu 7] [VAN_DUNG] [SA]`

#### 1.6 Công cụ Gán độ khó hàng loạt (Bulk Difficulty Assignment)
- **Mục tiêu tiền đề cho Phase 3:** Kho câu hỏi hiện có hầu hết mang mặc định `THONG_HIEU`.
- **Giao diện:** Trong trang Ngân hàng câu hỏi, cho phép lọc theo Chương/Bài $\rightarrow$ Tick chọn nhiều câu $\rightarrow$ Chọn nút "Gán độ khó hàng loạt" $\rightarrow$ Cập nhật tức thì vào Database.

---

### Phase 2: Toàn vẹn dữ liệu, Hash chống trùng & Chuẩn hóa JSONB (Ưu tiên: CAO - Thời gian: 2 ngày)

#### 2.1 Thứ tự Migration an toàn tuyệt đối
Để tránh lỗi vỡ Unique Index và lỗi dữ liệu vi phạm ENUM/CHECK, tuân thủ đúng 7 bước:
1. **Bước 1:** Chạy script unwrap sạch toàn bộ các chuỗi JSON lồng nhau trong cột `prompt`.
2. **Bước 2 (Backfill grade_block):** Đồng bộ `grade_block` từ bảng `classes` sang các dòng có `class_id` nhưng `grade_block IS NULL`. *(Vì PostgreSQL coi các giá trị NULL là khác nhau, index unique sẽ vô tác dụng nếu grade_block là NULL)*.
3. **Bước 3 (Tìm & Sửa dữ liệu vi phạm):** Chạy truy vấn quét các giá trị `difficulty` nằm ngoài 4 mức chuẩn và các dòng có đáp án lệch dạng.
4. **Bước 4 (Tính toán `content_hash`):**
   - **Quy tắc băm:** Chỉ băm nội dung văn bản đề bài + các phương án lựa chọn/mệnh đề.
   - **Tuyệt đối không băm toàn bộ JSON:** Bỏ qua URL hình ảnh và thẻ `[Lời giải]` để tránh tạo hash khác nhau cho cùng một câu hỏi.
5. **Bước 5 (Xử lý trùng lặp):** Quét các cặp trùng `(grade_block, content_hash)`, xuất báo cáo cho quản trị viên duyệt gộp/xóa trước khi đánh index.
6. **Bước 6 (Tạo Constraint & Index):**
   ```sql
   CREATE TYPE qb_difficulty AS ENUM ('NHAN_BIET', 'THONG_HIEU', 'VAN_DUNG', 'VAN_DUNG_CAO');
   ALTER TABLE public.question_bank
     ALTER COLUMN difficulty DROP DEFAULT,
     ALTER COLUMN difficulty TYPE qb_difficulty USING difficulty::qb_difficulty,
     ALTER COLUMN difficulty SET DEFAULT 'THONG_HIEU';

   ALTER TABLE public.question_bank ADD CONSTRAINT chk_qb_answer_by_type CHECK (
     (question_type = 'MULTIPLE_CHOICE' AND mc_answer IN ('A','B','C','D') AND tf_answers IS NULL AND sa_answer IS NULL)
     OR (question_type = 'TRUE_FALSE' AND tf_answers IS NOT NULL AND mc_answer IS NULL AND sa_answer IS NULL)
     OR (question_type = 'SHORT_ANSWER' AND sa_answer IS NOT NULL AND mc_answer IS NULL AND tf_answers IS NULL)
   );

   CREATE UNIQUE INDEX uq_qb_block_hash ON public.question_bank (grade_block, content_hash) WHERE content_hash IS NOT NULL;
   ```
7. **Bước 7 (Chuyển sang `JSONB` native):**
   `ALTER TABLE public.question_bank ALTER COLUMN prompt TYPE JSONB USING prompt::jsonb;`
   Xóa bỏ vĩnh viễn các đoạn code `while (unwrapCount < 3)`.

#### 2.2 Nâng cấp `normalizeShortAnswer` trong `grading-service.ts`
- Hỗ trợ đổi dấu phẩy `,` thành `.`.
- Hỗ trợ phân số dạng chuỗi `a/b` (ví dụ: `7/2` $\rightarrow$ `3.5`).
- Hỗ trợ các ký tự dấu trừ Unicode: `−` (`\u2212`), `–` (`\u2013`), `—` (`\u2014`).

#### 2.3 Bảo vệ danh mục chống mồ côi dữ liệu
- Thay thế hoặc kiểm soát `ON DELETE SET NULL`: Viết trigger hoặc rule chặn xóa Lớp/Chương/Bài khi vẫn còn câu hỏi ngân hàng đang trỏ tới. Khuyến khích giáo viên dùng tính năng ẩn/lưu trữ danh mục thay vì xóa cứng.
- Trigger tự động đồng bộ `grade_block` từ `classes` sang `question_bank` khi thêm/sửa câu hỏi có `class_id`.

---

### Phase 3: Ma trận độ khó & Thuật toán Cân bằng (Balanced & SourceMix) (Ưu tiên: CAO - Thời gian: 3 ngày)

#### 3.1 Ma trận độ khó (`byDifficulty`)
- Cấu hình chi tiết:
  ```jsonc
  "matrix": {
    "MULTIPLE_CHOICE": {
      "total": 12,
      "byDifficulty": { "NHAN_BIET": 5, "THONG_HIEU": 4, "VAN_DUNG": 2, "VAN_DUNG_CAO": 1 }
    }
  }
  ```
- Bốc theo từng ô (Dạng câu $\times$ Mức độ). Trong từng ô áp dụng `pickRandomWeighted`.
- Hỗ trợ tham số `shortage`:
  - `'error'` (mặc định): Báo lỗi chi tiết ô nào bị thiếu câu.
  - `'borrow'`: Tự động bù từ mức độ thấp hơn liền kề (ví dụ thiếu Vận dụng cao thì bù bằng Vận dụng) và hiển thị cảnh báo rõ ràng trên màn hình Preview.

#### 3.2 Thuật toán phân bổ đều `balanced`
- Tự động chia đều chỉ tiêu số câu cho $k$ nhóm bài học/chương được chọn ($N / k$).
- Cơ chế "Quỹ bù" (Compensation Pool): Nếu một bài bị thiếu câu, phần thiếu được chuyển tự động sang các bài còn dư câu hỏi.

#### 3.3 Trộn tỷ lệ nguồn `sourceMix` giữa các lớp
- Cho phép ra đề kết hợp: `sourceMix: { "<classId_CoBan>": 0.7, "<classId_NangCao>": 0.3 }`.
- Làm tròn số lượng theo phương pháp phần dư lớn nhất (Largest Remainder Method).

---

### Phase 4: Quản lý Vòng đời đề thi & Đổi câu thông minh (Ưu tiên: TRUNG BÌNH - Thời gian: 2 ngày)

#### 4.1 Tái sử dụng trạng thái hiện có & Truy vết câu hỏi
- **Bổ sung cột truy vết:** Thêm `question_bank_id UUID REFERENCES question_bank(id) ON DELETE SET NULL` vào bảng `questions`.
- **Đề cũ (tạo trước migration):** Mang giá trị `question_bank_id = NULL`, mặc định được coi là đã xuất bản và không hỗ trợ unbump.
- **Tái dùng cột `homeworks.is_published`**:
  - `is_published = false` (Đề nháp): Đổi/xóa câu tự do, **chưa tăng `usage_count`**.
  - `is_published = true` (Xuất bản): Mới chạy RPC `fn_bump_qb_usage`. Nếu đổi câu khi đề đã xuất bản, gọi đồng thời `fn_unbump_qb_usage` cho câu cũ và `fn_bump_qb_usage` cho câu mới.
  - **Khóa đề (`LOCKED`):** Kiểm tra `SELECT COUNT(*) FROM submissions WHERE homework_id = $1`. Nếu đã có học sinh nộp bài ($> 0$), chặn hoàn toàn thao tác đổi câu để bảo toàn điểm số.

#### 4.2 Đổi câu có ràng buộc (Smart Swap)
- Hỗ trợ tham số: `sameChapter: true`, `sameDifficulty: true`.
- Trả về danh sách 3 ứng viên phù hợp nhất để giáo viên chủ động chọn câu thay thế.

---

### Phase 5: Lịch sử sử dụng theo lớp & Trọng số thời gian (Ưu tiên: TRUNG BÌNH - Thời gian: 2 ngày)

#### 5.1 Bảng lịch sử `question_usage_log`
```sql
CREATE TABLE public.question_usage_log (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  question_id UUID NOT NULL REFERENCES question_bank(id) ON DELETE CASCADE,
  class_id UUID REFERENCES classes(id) ON DELETE SET NULL,
  homework_id UUID REFERENCES homeworks(id) ON DELETE SET NULL,
  used_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX idx_qul_question ON public.question_usage_log (question_id, used_at DESC);
CREATE INDEX idx_qul_class ON public.question_usage_log (class_id, used_at DESC);
```

#### 5.2 Công thức tính điểm ưu tiên đa nhân tố
$$\text{score}(q) = W_{\text{class}} \cdot \text{uses}_{\text{class}}(q, c, N) + W_{\text{global}} \cdot \text{usage\_count}(q) + W_{\text{time}} \cdot \text{recency\_penalty}(q) + \text{random} \cdot \text{NOISE}$$
- Câu vừa ra tuần trước cho Lớp 12A1 sẽ bị điểm phạt cao khi tạo đề cho 12A1, nhưng Lớp 12A2 (chưa thi) vẫn được ưu tiên bốc bình thường.

---

### Phase 6 & Phase 7: Hoán vị mã đề, GIN Tags & Tối ưu hiệu năng (Thời gian: 3 ngày)

#### 6.1 Hoán vị mã đề (101, 102...)
- Đảo thứ tự câu trong từng phần và đảo phương án A/B/C/D.
- Lưu `seed` và bản đồ ánh xạ đáp án (`option_maps`) theo từng mã đề để chấm thi chuẩn xác.
- Cờ `no_shuffle_options` trên câu hỏi để không đảo các câu có đáp án "Cả A và B đúng".

#### 6.2 Lọc theo Tags chuyên đề
- Tạo GIN Index: `CREATE INDEX idx_qb_tags ON public.question_bank USING GIN (tags);`.

#### 6.3 Tối ưu truy vấn 2 bước (2-step query)
- Bước 1: Chỉ lấy metadata nhẹ (`id`, `usage_count`, `difficulty`, `chapter_id`) để bốc câu.
- Bước 2: Chỉ tải `prompt` (nội dung, hình ảnh) cho các câu đã trúng tuyển. Giảm 90% băng thông mạng.
