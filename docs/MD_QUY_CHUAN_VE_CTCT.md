# HƯỚNG DẪN VẼ CÔNG THỨC CẤU TẠO HÓA HỌC TRONG ĐỀ THI

> **Áp dụng cho hệ thống tạo bài tập / đề thi từ file Markdown (`.md`)**.  
> Tài liệu này hướng dẫn thầy/cô cách soạn công thức cấu tạo hóa học (hợp chất hữu cơ mạch hở, phân nhánh, vòng benzen, xiclohexan, mắt xích polime...) trực tiếp bằng ký tự văn bản, hệ thống sẽ tự động biên dịch thành hình vẽ SVG sắc nét, tương thích hoàn hảo mọi chế độ (giao diện Sáng/Tối, điện thoại di động và bản in PDF).

---

## 1. Chọn công cụ nào? (Bảng quyết định nhanh)

Hệ thống hỗ trợ 4 cách biểu diễn nội dung Hóa học. Thầy/cô chọn công cụ theo bảng quyết định dưới đây:

| Nhu cầu biểu diễn | Công cụ khuyên dùng | Cú pháp mẫu | Ưu điểm & Lưu ý |
|---|---|---|---|
| **Công thức phân tử, ion, phương trình phản ứng trên cùng dòng chữ** | `\ce{...}` (trong cặp dấu `$`) | `$\ce{CH3COOH + C2H5OH <=>[H2SO4, t^o] CH3COOC2H5 + H2O}$` | Viết ngay trong dòng văn bản đề hoặc phương án; tự động thụt chỉ số dưới/trên; **không** vẽ được nhánh dọc hay vòng. |
| **Công thức cấu tạo thu gọn mạch hở, phân nhánh, polime không vòng** | Khối ` ```ctct ` | ````ctct<br>polymer n<br>CH2 — CH<br>      \|<br>      Cl<br>```` | "Vẽ bằng chữ" trực quan trên lưới ký tự; hỗ trợ liên kết nhánh dọc `\|`, `‖`, liên kết chéo `/`, `\`, ngoặc polime; **không** vẽ được vòng khép kín. |
| **Hợp chất có vòng thơm, xicloankan, polime phức tạp, công thức khung** | Khối ` ```smiles ` hoặc inline `[SMILES: ...]` | ````smiles<br>*CC(c1ccccc1)*<br>style: condensed<br>```` | Dùng chuỗi mã hóa SMILES chuẩn quốc tế; tự động tính tọa độ 2D; vẽ vòng tròn nội tiếp cho vòng benzen; hỗ trợ công thức khung (`skeletal`) hoặc bán thu gọn (`condensed`). |
| **Sơ đồ thí nghiệm, biểu tượng tái chế polime, hình lập thể 3D** | Chèn ảnh `[Ảnh: ...]` | `[Ảnh: he_thong_chung_cat.png]` | Dành cho các hình vẽ minh họa thực tế ngoài phạm vi tự động vẽ cấu trúc phân tử 2D. |

> [!TIP]
> **Quy tắc bỏ túi:**
> - Viết phương trình, CTPT: dùng `\ce{...}`.
> - Hợp chất mạch hở, nhánh chữ T, este, polime thông thường (PE, PP, PVC, cao su...): dùng khối ` ```ctct `.
> - Có vòng benzen, xicloankan, PET, Kodel, hoặc thích viết công thức khung thu gọn: dùng khối ` ```smiles `.
> - Sơ đồ lắp ráp dụng cụ thí nghiệm, hình vẽ bình cầu, nhãn tái chế: chụp ảnh và dùng `[Ảnh: ...]`.

---

## 2. Khối `ctct` — Công thức cấu tạo thu gọn trên lưới ký tự

Khối `ctct` cho phép thầy/cô "vẽ bằng chữ" tương tự như khi gõ trên bảng phấn hoặc trong Word, nhưng hệ thống sẽ biến các ký tự văn bản thành nét vẽ SVG chuẩn mực với các liên kết đều đặn và chỉ số dưới tự động.

### 2.1. Quy tắc lưới ký tự (Bắt buộc dùng dấu cách)

- **Căn cột bằng DẤU CÁCH (Space), TUYỆT ĐỐI KHÔNG DÙNG PHÍM TAB:**
  Phím Tab hiển thị độ rộng khác nhau trên từng máy tính hoặc phần mềm gõ văn bản, dễ làm lệch cột liên kết dọc. Dùng dấu cách sẽ đảm bảo vị trí tuyệt đối chính xác.
- **Ký tự liên kết dọc `|` (hoặc `‖`):** Phải đặt ở **đúng vị trí cột** của nguyên tử hoặc nhóm nguyên tử cần gắn ở dòng trên và dòng dưới (thường gióng thẳng hàng với nguyên tử C mang nhánh).
- **Ký tự liên kết chéo `/` và `\`:** Đặt ở cột liền kề giữa hai dòng để nối các nhóm nguyên tử theo góc nghiêng (ví dụ nhánh chữ V).

### 2.2. Nhóm nguyên tử & tự động chuyển chỉ số dưới

- Thầy/cô chỉ cần gõ chữ và số bình thường: `CH3`, `CH2`, `CH`, `C`, `COOH`, `CHO`, `OH`, `NH2`, `C6H5`, `(CH2)5`...
- Hệ thống **tự động biến mọi chữ số** đứng liền sau chữ cái hoặc sau dấu ngoặc đơn `)` thành **chỉ số dưới (subscript)**:
  - `CH2` ➜ $\text{CH}_2$
  - `C2H5` ➜ $\text{C}_2\text{H}_5$
  - `(CH2)5` ➜ $(\text{CH}_2)_5$
- Nhóm chức ở hai đầu có thể đảo ngược cho đúng hóa trị: `H2N` hoặc `NH2`, `HO` hoặc `OH`.

### 2.3. Các ký hiệu liên kết hỗ trợ

| Loại liên kết | Ký hiệu gõ | Ý nghĩa & Cách hiển thị |
|---|---|---|
| **Liên kết đơn ngang** | `—` (gạch dài em-dash), `–` (en-dash) hoặc `-` (dấu trừ) | Nét đơn nằm ngang nối 2 nhóm cùng dòng |
| **Liên kết đôi ngang** | `=` | Hai nét song song nằm ngang |
| **Liên kết ba ngang** | `≡` (hoặc phím tắt tương đương) | Ba nét song song nằm ngang |
| **Liên kết đơn dọc** | `\|` (dấu gạch đứng) | Nét đơn nối nhóm dòng trên với nhóm dòng dưới |
| **Liên kết đôi dọc** | `‖` (dấu hai gạch đứng) hoặc `\|\|` | Hai nét đứng song song (dùng cho nhóm `C=O` dựng đứng) |
| **Liên kết chéo** | `/` và `\` | Nét chéo đơn (dùng cho nhánh chữ V như isobutilen) |

### 2.4. Khai báo mắt xích polime (`polymer n`)

- Nếu công thức là mắt xích của một polime, thêm dòng khai báo `polymer n` (hoặc `polymer: n`, chấp nhận các chữ cái như `m`, `n`) ở **dòng đầu tiên** của khối.
- Hệ thống sẽ tự động:
  1. Vẽ cặp dấu ngoặc đơn uốn cong `( ... )` bao quanh toàn bộ chiều cao phân tử.
  2. Kéo dài hai đầu liên kết của mạch chính xuyên thẳng qua hai bên ngoặc.
  3. Đặt chỉ số *n* in nghiêng ở góc dưới bên phải dấu ngoặc.

### 2.5. Giới hạn của khối `ctct`

- Khối `ctct` chỉ phục vụ công thức mạch hở hoặc nhánh thu gọn (như `-C6H5`).
- **Không hỗ trợ vẽ vòng khép kín** (như vòng lục giác, ngũ giác có cạnh khép kín). Khi cần vẽ vòng hở/thơm đầy đủ, thầy/cô chuyển sang dùng khối `smiles`.

---

### 2.6. Tuyển tập 14 ví dụ chuẩn từ đề thi thực tế

Dưới đây là 14 ca mẫu chuẩn SGK, thầy/cô có thể sao chép và chỉnh sửa theo nhu cầu:

#### 1. Poli(vinyl clorua) — PVC
Nhánh `Cl` liên kết dọc dưới nhóm `CH`:
````md
```ctct
polymer n
CH2 — CH
      |
      Cl
```
````

#### 2. Polietilen — PE
Mắt xích đơn giản mạch thẳng:
````md
```ctct
polymer n
CH2 — CH2
```
````

#### 3. Polipropilen — PP
Nhánh metyl `-CH3` liên kết dọc phía dưới:
````md
```ctct
polymer n
CH2 — CH
      |
      CH3
```
````

#### 4. Polistiren — PS (nhóm C6H5 thu gọn)
Vòng benzen biểu diễn thu gọn thành nhóm phenyl `C6H5`:
````md
```ctct
polymer n
CH2 — CH
      |
      C6H5
```
````

#### 5. Cao su buna (Polibutadien)
Mạch polime chứa liên kết đôi ở giữa:
````md
```ctct
polymer n
CH2 — CH = CH — CH2
```
````

#### 6. Nilon-6 (tơ capron)
Chỉ số 5 nằm trong ngoặc `(CH2)5`:
````md
```ctct
polymer n
NH — (CH2)5 — CO
```
````

#### 7. Etyl axetat (Este có C=O dựng đứng)
Nhóm `C=O` dựng đứng sử dụng ký tự liên kết đôi dọc `‖`:
````md
```ctct
       O
       ‖
CH3 — C — O — C2H5
```
````

#### 8. Glyxin (Amino axit đơn giản)
Mạch hở nằm ngang:
````md
```ctct
H2N — CH2 — COOH
```
````

#### 9. Alanin
Nhóm amino `-NH2` gắn dọc ở vị trí cacbon alpha:
````md
```ctct
CH3 — CH — COOH
      |
      NH2
```
````

#### 10. 2-metylbutan
Nhánh metyl `-CH3` hướng lên phía trên:
````md
```ctct
      CH3
      |
CH3 — CH — CH2 — CH3
```
````

#### 11. 2,2-đimetylpropan (Neopentan)
Nhánh metyl cả ở phía trên và phía dưới nguyên tử C trung tâm:
````md
```ctct
      CH3
      |
CH3 — C — CH3
      |
      CH3
```
````

#### 12. Anđehit axetic (Axetanđehit)
Liên kết đôi với oxi trên cùng hàng ngang:
````md
```ctct
CH3 — CH = O
```
````

#### 13. Axetilen
Liên kết ba giữa hai nguyên tử cacbon:
````md
```ctct
HC ≡ CH
```
````

#### 14. Isobutilen
Liên kết chéo `/` và `\` tạo nhánh chữ V:
````md
```ctct
         CH3
        /
CH2 = C
        \
         CH3
```
````

---

## 3. Khối `smiles` — Công thức có vòng, công thức khung và polime

Khối `smiles` sử dụng hệ thống biểu diễn hóa học SMILES (Simplified Molecular Input Line Entry System) kết hợp công cụ bố trí đồ họa tự động, rất thích hợp cho hợp chất vòng thơm, dị vòng, công thức khung phân tử.

### 3.1. Cấu trúc khối `smiles`

- **Dòng đầu tiên:** Chuỗi ký tự SMILES (bắt buộc, không chứa khoảng trắng).
- **Các dòng tiếp theo:** Các tùy chọn bổ sung theo cú pháp `tên_tuỳ_chọn: giá trị`.

Ví dụ:
````md
```smiles
*CC(c1ccccc1)*
style: condensed
polymer: n
```
````

### 3.2. Đánh dấu mắt xích polime bằng hai dấu sao `*`

- Khi biểu diễn polime trong khối `smiles`, thầy/cô đặt **đúng 2 dấu sao `*`** ở hai nguyên tử đầu và cuối của mạch mắt xích monome.
- Hệ thống sẽ:
  - Tự động xoay trục phân tử sao cho mạch chính nối giữa hai dấu `*` nằm ngang.
  - Vẽ cặp dấu ngoặc đơn polime bao quanh phân tử.
  - Đặt chỉ số *n* (hoặc ký tự chỉ định qua dòng `polymer: m`) ở góc dưới bên phải.

### 3.3. Tùy chọn kiểu hiển thị `style:`

| Giá trị | Ý nghĩa | Ứng dụng |
|---|---|---|
| `style: skeletal` *(mặc định)* | **Công thức khung:** Ẩn các nguyên tử C và H gắn với C, chỉ vẽ các đường gấp khúc của khung cacbon và hiện rõ dị tố (O, N, Cl...). | Khuyên dùng cho các phân tử hữu cơ lớn, este phức tạp, Kodel, PET, 1,4-đi(hiđroxymetyl)xiclohexan. |
| `style: condensed` | **Công thức bán thu gọn:** Hiện rõ các nhóm `CH3`, `CH2`, `CH` ngoài vòng; mạch chính polime nằm ngang, nhóm thế quay xuống dưới. | Khuyên dùng cho Polistiren (PS), PVC, PP theo đúng kiểu trình bày của SGK Hóa học Việt Nam. |

### 3.4. Vòng thơm và liên kết đôi/ba

- **Chữ thường biểu diễn vòng thơm (`c` thay vì `C`):**
  - Gõ `c1ccccc1` (chuỗi vòng thơm gồm 6 chữ `c` thường) ➜ Hệ thống tự động vẽ **vòng tròn nội tiếp** bên trong lục giác theo chuẩn SGK mới.
- **Chữ hoa Kekulé:**
  - Gõ `C1=CC=CC=C1` ➜ Hệ thống vẽ 3 liên kết đôi xen kẽ nét đôi bên trong.

### 3.5. Dị tố và nguyên tử trong ngoặc vuông

- **Tự động điền nguyên tử H ngầm định:** Các dị tố như oxi `O`, nitơ `N`, clo `Cl`... khi gõ đơn lẻ sẽ được tự động bù đủ số nguyên tử H theo hóa trị (ví dụ tự hiện thành `OH` hoặc `HO`, `NH2` hoặc `H2N` tùy theo hướng liên kết).
- **Nguyên tử trong ngoặc vuông `[...]`:** Dùng khi muốn chỉ định chính xác số lượng nguyên tử H hoặc điện tích của ion:
  - `[NH3+]`: Nhóm amoni mang điện tích dương (ví dụ muối amoni clorua).
  - `[O-]`: Anion caboxylat mang điện tích âm.

### 3.6. Cú pháp Inline trong dòng văn bản

Thầy/cô có thể chèn trực tiếp công thức SMILES vào ngay giữa câu hỏi hoặc các phương án trắc nghiệm bằng thẻ:
```md
Chất [SMILES: c1ccccc1O] phản ứng được với dung dịch nào sau đây?
A. [SMILES: CCO]
B. [SMILES: CC(=O)O]
```
Thẻ inline sẽ vẽ hình thu nhỏ gọn gàng, trong suốt, cùng dòng chữ.

---

### 3.7. Ví dụ mẫu khối `smiles`

#### 1. Polistiren (PS) có vòng benzen (`style: condensed`)
Mạch chính nằm ngang, nhóm phenyl `c1ccccc1` vẽ vòng tròn xoay xuống dưới:
````md
```smiles
*CC(c1ccccc1)*
style: condensed
```
````

#### 2. 1,4-đi(hiđroxymetyl)xiclohexan
Vòng xiclohexan no 6 cạnh với 2 nhóm `-CH2OH`:
````md
```smiles
OCC1CCC(CO)CC1
```
````

#### 3. Tơ Kodel
Polime chứa cả vòng xiclohexan và vòng benzen:
````md
```smiles
*C(=O)c1ccc(cc1)C(=O)OCC1CCC(CC1)CO*
```
````

#### 4. Poli(etylen terephtalat) — PET
Tơ lapsan / chai nhựa PET:
````md
```smiles
*C(=O)c1ccc(cc1)C(=O)OCCO*
```
````

#### 5. Phenol
Vòng benzen gắn nhóm `-OH`:
````md
```smiles
Oc1ccccc1
```
````

#### 6. Axit benzoic
Vòng benzen gắn nhóm cacboxyl `-COOH`:
````md
```smiles
O=C(O)c1ccccc1
```
````

#### 7. Anilin
Vòng benzen gắn nhóm amino `-NH2`:
````md
```smiles
Nc1ccccc1
```
````

#### 8. Glucozơ mạch vòng (Ghi chú về hiển thị lập thể)
````md
```smiles
OCC1OC(O)C(O)C(O)C1O
```
````
> [!NOTE]
> **Giới hạn hiển thị lập thể của monosaccarit:**  
> Hệ thống hiện tại hiển thị công thức SMILES dưới dạng **hình phẳng 2D**. Trình vẽ chưa hỗ trợ hiển thị cấu hình lập thể không gian (như dạng ghế/thuyền hoặc công thức phối cảnh Haworth có các cạnh đậm/nhạt để phân biệt vị trí nhóm `-OH` alpha và beta của glucozơ/fructozơ).  
> Đối với các câu hỏi lý thuyết yêu cầu học sinh nhận biết chính xác đồng phân $\alpha$-glucozơ hay $\beta$-glucozơ trong SGK, thầy/cô nên sử dụng hình chụp chất lượng cao và chèn bằng `[Ảnh: ...]`.

---

## 4. Bảng tra cứu chuỗi SMILES các Polime thường gặp trong chương trình THPT

Dưới đây là bảng tra cứu chuỗi SMILES chuẩn xác về mặt cấu tạo hóa học cho các polime phổ biến trong chương trình Hóa học 12:

| Tên polime | Monome cấu thành | Chuỗi mắt xích SMILES chuẩn | Kiểu hiển thị gợi ý | Ghi chú hóa học |
|---|---|---|---|---|
| **PE** (Polietilen) | Etilen $\text{CH}_2=\text{CH}_2$ | `*CC*` | `style: condensed` | Mắt xích $-\text{CH}_2-\text{CH}_2-$ |
| **PP** (Polipropilen) | Propen $\text{CH}_2=\text{CH}-\text{CH}_3$ | `*CC(C)*` | `style: condensed` | Mắt xích $-\text{CH}_2-\text{CH}(\text{CH}_3)-$ |
| **PVC** (Poli(vinyl clorua)) | Vinyl clorua $\text{CH}_2=\text{CH}-\text{Cl}$ | `*CC(Cl)*` | `style: condensed` | Mắt xích $-\text{CH}_2-\text{CH}(\text{Cl})-$ |
| **PS** (Polistiren) | Stiren $\text{CH}_2=\text{CH}-\text{C}_6\text{H}_5$ | `*CC(c1ccccc1)*` | `style: condensed` | Vòng thơm viết chữ `c` thường tạo vòng tròn |
| **PMMA** (Poli(metyl metacrylat)) | Metyl metacrylat | `*CC(C)(C(=O)OC)*` | `style: condensed` | Thủy tinh hữu cơ plexiglas |
| **PAN / Tơ olon / nitron** | Acrilonitrin $\text{CH}_2=\text{CH}-\text{CN}$ | `*CC(C#N)*` | `style: condensed` | Liên kết ba cacbon-nitơ `C#N` |
| **Cao su buna** (Polibutadien) | Buta-1,3-đien | `*CC=CC*` | `style: condensed` | Mắt xích $-\text{CH}_2-\text{CH}=\text{CH}-\text{CH}_2-$ |
| **Cao su isopren** | Isopren | `*CC(C)=CC*` | `style: condensed` | Mắt xích có nhánh metyl ở nối đôi |
| **Nilon-6** (Tơ capron) | Axit $\varepsilon$-aminocaproic / Caprolactam | `*NCCCCCC(=O)*` | `style: skeletal` hoặc `condensed` | Đủ 6 nguyên tử C: 1 nhóm $-\text{NH}-$, 5 nhóm $-\text{CH}_2-$, 1 nhóm $-\text{CO}-$ |
| **Nilon-6,6** | Hexametylenđiamin + Axit ađipic | `*NCCCCCCNC(=O)CCCC(=O)*` | `style: skeletal` | Mắt xích gồm 6C amin và 6C ađipic (4 nhóm $\text{CH}_2$ kẹp giữa 2 nhóm $\text{C=O}$) |
| **PET** (Poli(etylen terephtalat)) | Axit terephtalic + Etylen glicol | `*C(=O)c1ccc(cc1)C(=O)OCCO*` | `style: skeletal` | Tơ lapsan, nhựa làm chai nước uống |
| **Tơ Kodel** | Axit terephtalic + 1,4-đi(hiđroxymetyl)xiclohexan | `*C(=O)c1ccc(cc1)C(=O)OCC1CCC(CC1)CO*` | `style: skeletal` | Polime chứa đồng thời vòng thơm và vòng no |
| **Teflon** (PTFE) | Tetrafloetilen $\text{CF}_2=\text{CF}_2$ | `*C(F)(F)C(F)(F)*` | `style: skeletal` hoặc `condensed` | Polime chống dính |
| **Poli(vinyl axetat)** (PVAc / PVA) | Vinyl axetat $\text{CH}_3\text{COOCH}=\text{CH}_2$ | `*CC(OC(C)=O)*` | `style: condensed` | Polime dùng làm keo dán, sơn |
| **Poli(vinyl ancol)** (PVAL / PVA) | Thủy phân từ PVAc | `*CC(O)*` | `style: condensed` | Mắt xích $-\text{CH}_2-\text{CH}(\text{OH})-$ |

> [!IMPORTANT]
> **Lưu ý về số nguyên tử cacbon của Nilon-6,6:**  
> Axit ađipic có công thức là $\text{HOOC}-(\text{CH}_2)_4-\text{COOH}$ (tổng cộng 6 nguyên tử C). Do đó, phần ađipoyl trong chuỗi SMILES phải là `C(=O)CCCC(=O)` (chứa đúng **4 chữ C** ở giữa hai nhóm carbonyl `C(=O)`). Thầy/cô tránh gõ nhầm thành 5 chữ C (axit pimelic 7 cacbon).

---

## 5. Bảng mã lỗi chẩn đoán khi lưu đề và cách khắc phục

Hệ thống có bộ phân tích cú pháp tự động (`validateDiagramsInText`). Khi thầy/cô bấm **Lưu bài tập** hoặc tải file `.md`, nếu có khối công thức bị sai cú pháp, hệ thống sẽ hiện thông báo lỗi kèm **mã lỗi** và **vị trí dòng cụ thể**. Đề thi có chứa lỗi khối hình sẽ **không cho phép lưu** nhằm tránh hiển thị sai lệch cho học sinh.

### 5.1. Các lỗi trong khối `ctct`

#### 1. `MISSING_BOND` (Thiếu liên kết giữa 2 nhóm đứng cạnh nhau)
- **Nguyên nhân:** Hai nhóm nguyên tử đứng cạnh nhau trên cùng một dòng nhưng không có ký hiệu liên kết ngăn cách.
- **Ví dụ Sai ❌:**
  ````md
  ```ctct
  CH3   CH2 — OH
  ```
  ````
- **Sửa thành Đúng ✅:**
  ````md
  ```ctct
  CH3 — CH2 — OH
  ```
  ````

---

#### 2. `UNKNOWN_BOND` (Ký hiệu liên kết không hợp lệ)
- **Nguyên nhân:** Dùng ký tự lạ làm liên kết ngang (như dấu ngã `~`, dấu sao `*`, dấu chấm `.`, dấu hai chấm `:` thay vì gạch nối).
- **Ví dụ Sai ❌:**
  ````md
  ```ctct
  CH3 ~ CH2 — OH
  ```
  ````
- **Sửa thành Đúng ✅:**
  ````md
  ```ctct
  CH3 — CH2 — OH
  ```
  ````

---

#### 3. `DANGLING_BOND` (Liên kết dọc hoặc liên kết chéo bị lơ lửng)
- **Nguyên nhân:** Ký tự liên kết dọc `|`, `‖` hoặc liên kết chéo `/`, `\` đặt lệch cột, không tìm thấy nhóm nguyên tử tương ứng ở dòng trên hoặc dòng dưới.
- **Ví dụ Sai ❌ (dấu `|` lệch sang cột của dấu gạch `—`, phía trên không có nhóm nguyên tử nào):**
  ````md
  ```ctct
  CH3 — CH — CH3
           |
           CH3
  ```
  ````
- **Sửa thành Đúng ✅ (canh đúng cột dưới nguyên tử C):**
  ````md
  ```ctct
  CH3 — CH — CH3
        |
        CH3
  ```
  ````

---

#### 4. `UNKNOWN_CHAR` (Ký tự lạ trong khối)
- **Nguyên nhân:** Vô tình gõ các ký tự lạ hoặc biểu tượng không thuộc bảng chữ cái, chữ số, dấu ngoặc hay ký hiệu liên kết quy định.
- **Ví dụ Sai ❌:**
  ````md
  ```ctct
  CH3 — CH2 @ OH
  ```
  ````
- **Sửa thành Đúng ✅:**
  ````md
  ```ctct
  CH3 — CH2 — OH
  ```
  ````

---

#### 5. `EMPTY` (Khối rỗng)
- **Nguyên nhân:** Mở khối ` ```ctct ` nhưng bên trong không có nội dung hoặc chỉ có dòng trắng.
- **Ví dụ Sai ❌:**
  ````md
  ```ctct

  ```
  ````
- **Sửa thành Đúng ✅:**
  ````md
  ```ctct
  CH3 — CH3
  ```
  ````

---

### 5.2. Các lỗi trong khối `smiles`

#### 1. `SMILES_PARSE` (Sai cú pháp chuỗi SMILES)
- **Nguyên nhân:** Chuỗi SMILES không đúng quy tắc hóa học: mở ngoặc không đóng `(`, mở số chỉ vòng mà quên đóng số vòng, hoặc ký hiệu nguyên tố sai.
- **Ví dụ Sai ❌ (thiếu đóng ngoặc đơn):**
  ````md
  ```smiles
  CC(=O
  ```
  ````
- **Sửa thành Đúng ✅:**
  ````md
  ```smiles
  CC(=O)O
  ```
  ````

---

#### 2. `POLYMER_STARS` (Sai số lượng dấu sao mắt xích polime)
- **Nguyên nhân:** Khối `smiles` chỉ chấp nhận: **0 dấu `*`** (chất thường) hoặc **đúng 2 dấu `*`** (hai đầu mắt xích polime). Nếu chỉ có 1 dấu `*` hoặc có 3 dấu `*` trở lên sẽ báo lỗi.
- **Ví dụ Sai ❌ (chỉ gõ 1 dấu sao):**
  ````md
  ```smiles
  *CC(Cl)
  ```
  ````
- **Sửa thành Đúng ✅ (đủ 2 dấu sao ở 2 đầu liên kết):**
  ````md
  ```smiles
  *CC(Cl)*
  ```
  ````

---

## 6. Checklist kiểm tra công thức trước khi nạp đề

Trước khi nhấn nút **Nhập file .md** hoặc bấm **Lưu bài tập**, thầy/cô nên rà soát nhanh danh sách kiểm tra sau:

- [ ] **Mở/đóng khối đủ:** Mở bằng ` ```ctct ` hoặc ` ```smiles ` và đóng bằng đúng 3 dấu backtick ` ``` `.
- [ ] **Khối `ctct`:**
  - [ ] Tuyệt đối **không dùng phím Tab** để thụt đầu dòng; chỉ dùng phím **Space (dấu cách)**.
  - [ ] Ký tự liên kết dọc `|` hoặc `‖` gióng thẳng hàng với nguyên tử C mang nhánh.
  - [ ] Nhóm nguyên tử viết liền (như `CH3`, `COOH`); hai nhóm cạnh nhau trên cùng một dòng phải có ký hiệu liên kết (`—`, `-`, `=`, `≡`).
  - [ ] Nếu là mắt xích polime, dòng đầu tiên phải ghi đúng `polymer n` hoặc `polymer: n`.
- [ ] **Khối `smiles`:**
  - [ ] Chuỗi SMILES nằm ở **dòng đầu tiên**, không chứa dấu cách ở giữa.
  - [ ] Nếu là polime: có **đúng 2 dấu sao `*`** ở hai đầu mắt xích.
  - [ ] Vòng benzen dùng chữ thường `c1ccccc1` để hiển thị vòng tròn nội tiếp theo SGK mới.
  - [ ] Đóng mở ngoặc `(...)` và các chữ số chỉ vòng ghép cặp chính xác.
- [ ] **Sau khi nạp đề:**
  - [ ] Xem trước khung hiển thị câu hỏi: hình vẽ rõ nét, không bị báo khung viền đỏ.
  - [ ] Kiểm tra mục **"Chẩn đoán khối hình"**: bảo đảm không có thông báo mã lỗi nào trước khi tiến hành lưu đề.
