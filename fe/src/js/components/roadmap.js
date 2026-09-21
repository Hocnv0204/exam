export const ENTRANCE_TEST_HOMEWORK_ID = '23740245-929f-47d4-aeab-8e63dce4cbbe'

export const ROADMAP_DATA = {
  meta: {
    title: "Hóa 12: từ mất gốc lên 8+ trong 90 ngày",
    subtitle: "Lộ trình 12 tuần bám sát sách Kết nối tri thức. Mỗi tuần một mục tiêu rõ ràng, mỗi bài chia sẵn thành các dạng bài từ nền tảng đến vận dụng cao.",
    textbook: "Hóa học 12 – Kết nối tri thức với cuộc sống (NXB Giáo dục Việt Nam)",
    durationWeeks: 12,
    hoursPerWeek: "8–10",
    targetScore: "8+",
    updated: "2026-09-21",
    tiers: {
      nen: "Nền tảng",
      nang: "Nâng cao",
      top: "Chinh phục 8+"
    },
    scoreCurve: [
      { week: 0, score: 3.5, label: "Xuất phát" },
      { week: 4, score: 5.5, label: "Cuối tháng 1" },
      { week: 8, score: 7.0, label: "Cuối tháng 2" },
      { week: 12, score: 8.0, label: "Cuối tháng 3" }
    ],
    exam: {
      durationMin: 50,
      questions: 28,
      nationalAverage2026: 6.28,
      parts: [
        { id: "I", name: "Trắc nghiệm nhiều lựa chọn", questions: 18, detail: "18 câu × 0,25 điểm", points: 4.5 },
        { id: "II", name: "Đúng / Sai", questions: 4, detail: "4 câu × 4 ý: 1 ý = 0,1 · 2 ý = 0,25 · 3 ý = 0,5 · 4 ý = 1,0", points: 4.0 },
        { id: "III", name: "Trả lời ngắn", questions: 6, detail: "6 câu × 0,25 điểm", points: 1.5 }
      ],
      target: [
        { id: "I", points: 4.0, note: "đúng 16/18 câu" },
        { id: "II", points: 3.0, note: "2 câu đúng cả 4 ý + 2 câu đúng 3/4 ý" },
        { id: "III", points: 1.0, note: "đúng 4/6 câu" }
      ]
    },
    sources: [
      { label: "Mục lục SGK Hóa học 12 – Kết nối tri thức (THI247)", url: "https://thi247.com/sach-giao-khoa-hoa-hoc-12-ket-noi-tri-thuc-voi-cuoc-song/" },
      { label: "Quyết định 764/QĐ-BGDĐT: cấu trúc đề thi tốt nghiệp THPT từ 2025", url: "https://luatvietnam.vn/giao-duc/quyet-dinh-764-qd-bgddt-2024-cau-truc-de-thi-ky-thi-tot-nghiep-thpt-tu-2025-302643-d1.html" },
      { label: "Điểm trung bình môn Hóa kỳ thi tốt nghiệp THPT 2026 (VOV)", url: "https://vov.vn/xa-hoi/ky-thi-tot-nghiep-thpt-mon-hoa-hoc-dat-trung-binh-628-diem-mua-diem-o-moc-75-post1311198.vov" }
    ],
    disclaimer: "Điểm mục tiêu là mức tham chiếu khi học đủ giờ và hoàn thành bài tập, không phải cam kết kết quả. Mức ưu tiên của từng chương là ước lượng của người biên soạn, hãy điều chỉnh theo ma trận đề của trường và của bạn."
  },
  months: [
    { id: 1, name: "Lấy lại nền tảng", weeks: [1, 4], goal: "≈ 5,5 điểm", desc: "Vá lỗ hổng tính toán và hữu cơ cơ bản, học xong Ester – Lipid, Carbohydrate và bắt đầu Amine." },
    { id: 2, name: "Tăng tốc", weeks: [5, 8], goal: "≈ 7,0 điểm", desc: "Hoàn thành hợp chất chứa nitrogen và polymer, học pin điện – điện phân, bước vào phần kim loại." },
    { id: 3, name: "Bứt phá 8+", weeks: [9, 12], goal: "≥ 8,0 điểm", desc: "Hoàn thành kim loại, nhóm IA – IIA, phức chất. Tuần 12 dành cho tổng ôn và luyện đề bấm giờ." }
  ],
  weeks: [
    { n: 1, month: 1, theme: "Sơ cứu nền tảng", milestone: "Kiểm tra đầu vào" },
    { n: 2, month: 1, theme: "Ester – Lipid" },
    { n: 3, month: 1, theme: "Carbohydrate" },
    { n: 4, month: 1, theme: "Amine và amino acid", milestone: "Kiểm tra tháng 1" },
    { n: 5, month: 2, theme: "Protein, enzyme và polymer" },
    { n: 6, month: 2, theme: "Vật liệu polymer và pin điện" },
    { n: 7, month: 2, theme: "Điện phân và tinh thể kim loại" },
    { n: 8, month: 2, theme: "Tính chất và cách tách kim loại", milestone: "Kiểm tra giữa chặng (Chương 1 – 5)" },
    { n: 9, month: 3, theme: "Hợp kim, ăn mòn, ôn Chương 6" },
    { n: 10, month: 3, theme: "Kim loại nhóm IA – IIA" },
    { n: 11, month: 3, theme: "Kim loại chuyển tiếp và phức chất" },
    { n: 12, month: 3, theme: "Tổng ôn và luyện đề", milestone: "Thi thử 3 đề bấm giờ" }
  ],
  chapters: [
    {
      id: "c0", kind: "foundation", code: "Nền tảng", title: "Sơ cứu mất gốc", group: "Nền tảng", symbol: "mol", atomicNumber: null, priority: null,
      summary: "Vá các lỗ hổng tính toán, phương trình và hữu cơ cơ bản để học được các chương sau.",
      lessons: [
        {
          id: "m1", no: null, tag: "Nền tảng 1", title: "Mol, nồng độ và hiệu suất", week: 1, hours: 3,
          keyPoints: ["n = m/M = V/24,79 (khí ở 25 °C, 1 bar)", "C% và CM: đổi qua lại bằng khối lượng riêng", "Hiệu suất H% = lượng thực tế / lượng lí thuyết × 100%"],
          forms: [
            { name: "Đổi qua lại giữa m, n, V và số hạt", tier: "nen", parts: ["I", "III"] },
            { name: "Nồng độ mol, nồng độ phần trăm, pha loãng", tier: "nen", parts: ["I", "III"] },
            { name: "Tính theo phương trình: chất dư, chất hết", tier: "nen", parts: ["III"] },
            { name: "Hiệu suất và bài toán nhiều giai đoạn", tier: "nang", parts: ["III"] }
          ]
        },
        {
          id: "m2", no: null, tag: "Nền tảng 2", title: "Phản ứng hóa học và oxi hóa – khử", week: 1, hours: 2,
          keyPoints: ["Cân bằng phương trình bằng đại số và bằng electron", "Số oxi hóa, chất khử, chất oxi hóa", "Phản ứng trao đổi ion: điều kiện xảy ra và phương trình ion thu gọn"],
          forms: [
            { name: "Cân bằng phương trình hóa học", tier: "nen", parts: ["I"] },
            { name: "Xác định số oxi hóa, chất khử, chất oxi hóa", tier: "nen", parts: ["I"] },
            { name: "Viết phương trình ion thu gọn", tier: "nang", parts: ["I", "II"] },
            { name: "Bảo toàn electron cho bài toán đơn giản", tier: "nang", parts: ["III"] }
          ]
        },
        {
          id: "m3", no: null, tag: "Nền tảng 3", title: "Hữu cơ nhập môn: nhóm chức, danh pháp, đồng phân", week: 1, hours: 3,
          keyPoints: ["Đồng đẳng, đồng phân, nhóm chức", "Danh pháp thay thế và tên thông thường", "Đốt cháy: lập công thức phân tử từ số liệu CO₂, H₂O"],
          forms: [
            { name: "Viết công thức cấu tạo và đếm đồng phân", tier: "nen", parts: ["I"] },
            { name: "Gọi tên và đọc tên hợp chất hữu cơ", tier: "nen", parts: ["I"] },
            { name: "Lập công thức phân tử từ % khối lượng hoặc số liệu đốt cháy", tier: "nang", parts: ["III"] },
            { name: "Nhận biết nhóm chức qua tính chất đặc trưng", tier: "nang", parts: ["I", "II"] }
          ]
        },
        {
          id: "m4", no: null, tag: "Nền tảng 4", title: "Kĩ năng giải nhanh: bảo toàn và tăng giảm khối lượng", week: 1, hours: 2,
          keyPoints: ["Bảo toàn khối lượng và bảo toàn nguyên tố", "Tăng – giảm khối lượng", "Dùng máy tính: giải hệ phương trình, SOLVE, TABLE"],
          forms: [
            { name: "Bảo toàn khối lượng", tier: "nen", parts: ["III"] },
            { name: "Bảo toàn nguyên tố (C, H, O, N)", tier: "nang", parts: ["III"] },
            { name: "Tăng giảm khối lượng", tier: "nang", parts: ["III"] },
            { name: "Giải hệ 2 – 3 ẩn bằng máy tính", tier: "nang", parts: ["III"] }
          ]
        }
      ]
    },
    {
      id: "c1", kind: "book", code: "Chương 1", title: "Ester – Lipid", group: "Hữu cơ", symbol: "O", atomicNumber: 8, priority: 3,
      summary: "Ester, chất béo, xà phòng: chương mở đầu dễ lấy điểm nếu nắm chắc phản ứng thủy phân.",
      lessons: [
        {
          id: "b1", no: 1, title: "Ester – Lipid", week: 2, hours: 4,
          keyPoints: ["Ester RCOOR′: nhận diện, đọc tên (gốc acid + gốc alkyl)", "Thủy phân: môi trường acid thuận nghịch, môi trường base một chiều (xà phòng hóa)", "Chất béo là triester của glycerol với acid béo; hydrogen hóa chuyển dầu lỏng thành mỡ rắn"],
          forms: [
            { name: "Nhận biết ester, viết công thức cấu tạo và đồng phân", tier: "nen", parts: ["I"] },
            { name: "Tên ester và các acid béo thường gặp (palmitic, stearic, oleic, linoleic)", tier: "nen", parts: ["I"] },
            { name: "Thủy phân ester: xác định sản phẩm và điều kiện", tier: "nen", parts: ["I", "II"] },
            { name: "Xà phòng hóa ester đơn chức: tìm công thức phân tử, khối lượng muối", tier: "nang", parts: ["I", "III"] },
            { name: "Đốt cháy ester và chất béo bằng n(CO₂) và n(H₂O)", tier: "nang", parts: ["III"] },
            { name: "Đúng/Sai theo tình huống: dầu mỡ, hương liệu, ôi hóa", tier: "nang", parts: ["II"] },
            { name: "Ester của phenol, ester đa chức, hỗn hợp ester", tier: "top", parts: ["III"], tip: "Ester của phenol tiêu tốn 2 NaOH và tạo thêm H₂O." }
          ]
        },
        {
          id: "b2", no: 2, title: "Xà phòng và chất giặt rửa", week: 2, hours: 2,
          keyPoints: ["Xà phòng là muối Na/K của acid béo, sản xuất bằng cách xà phòng hóa chất béo", "Cơ chế giặt rửa: đầu ưa nước, đuôi kị nước", "Chất giặt rửa tổng hợp dùng được trong nước cứng"],
          forms: [
            { name: "Thành phần và cơ chế tẩy rửa", tier: "nen", parts: ["I", "II"] },
            { name: "So sánh xà phòng và chất giặt rửa tổng hợp", tier: "nen", parts: ["I", "II"] },
            { name: "Xà phòng trong nước cứng", tier: "nang", parts: ["I", "II"] },
            { name: "Tính khối lượng xà phòng, glycerol từ chất béo (có hiệu suất)", tier: "nang", parts: ["III"] }
          ]
        },
        {
          id: "b3", no: 3, title: "Ôn tập chương 1", week: 2, hours: 2,
          keyPoints: ["Sơ đồ ester ⇄ acid + alcohol", "Chất béo có k liên kết π (kể cả 3 C=O): n(CO₂) − n(H₂O) = (k − 1)·n", "Thuộc khối lượng mol 4 acid béo phổ biến"],
          forms: [
            { name: "Sơ đồ chuyển hóa ester ↔ acid ↔ alcohol", tier: "nang", parts: ["I"] },
            { name: "Xác định công thức chất béo từ số liệu đốt cháy hoặc xà phòng hóa", tier: "top", parts: ["III"] },
            { name: "Hỗn hợp chất béo và acid béo tự do", tier: "top", parts: ["III"] },
            { name: "Đề kiểm tra chương (Phần I, II, III)", tier: "nang", parts: ["I", "II", "III"] }
          ]
        }
      ]
    },
    {
      id: "c2", kind: "book", code: "Chương 2", title: "Carbohydrate", group: "Hữu cơ", symbol: "C", atomicNumber: 6, priority: 2,
      summary: "Glucose, saccharose, tinh bột, cellulose: học theo bảng so sánh và bài toán hiệu suất.",
      lessons: [
        {
          id: "b4", no: 4, title: "Giới thiệu về carbohydrate. Glucose và fructose", week: 3, hours: 3,
          keyPoints: ["Phân loại: monosaccharide, disaccharide, polysaccharide", "Glucose có dạng mạch hở (nhóm –CHO, 5 nhóm –OH) và dạng vòng", "Nhận biết: Cu(OH)₂ (xanh lam), AgNO₃/NH₃, nước Br₂ (fructose không làm mất màu)"],
          forms: [
            { name: "Cấu tạo và phân loại carbohydrate", tier: "nen", parts: ["I"] },
            { name: "Tính chất của glucose, fructose và cách phân biệt", tier: "nen", parts: ["I", "II"] },
            { name: "Phản ứng tráng bạc: n(Ag) = 2·n(glucose)", tier: "nang", parts: ["III"] },
            { name: "Lên men glucose thành ethanol và CO₂ (có hiệu suất)", tier: "nang", parts: ["III"] },
            { name: "Đúng/Sai: đường huyết, mật ong, dịch truyền", tier: "nang", parts: ["II"] },
            { name: "Hấp thụ CO₂ từ lên men vào Ca(OH)₂: khối lượng kết tủa", tier: "top", parts: ["III"], tip: "CO₂ dư sẽ hòa tan một phần kết tủa." }
          ]
        },
        {
          id: "b5", no: 5, title: "Saccharose và maltose", week: 3, hours: 2,
          keyPoints: ["Saccharose gồm glucose và fructose, không còn nhóm –CHO tự do nên không tráng bạc", "Maltose gồm 2 đơn vị glucose, có tính khử", "Thủy phân (H⁺, t°): saccharose → glucose + fructose; maltose → 2 glucose"],
          forms: [
            { name: "So sánh saccharose và maltose (cấu tạo, tính khử)", tier: "nen", parts: ["I", "II"] },
            { name: "Sản xuất đường mía và ứng dụng đời sống", tier: "nen", parts: ["II"] },
            { name: "Thủy phân disaccharide rồi tráng bạc sản phẩm", tier: "nang", parts: ["III"] },
            { name: "Hỗn hợp saccharose và maltose: thủy phân có hiệu suất", tier: "top", parts: ["III"] }
          ]
        },
        {
          id: "b6", no: 6, title: "Tinh bột và cellulose", week: 3, hours: 3,
          keyPoints: ["Tinh bột (amylose, amylopectin) gồm các mắt xích α-glucose; hồ tinh bột hóa xanh tím với iodine", "Cellulose gồm các mắt xích β-glucose, không tan trong nước, không tráng bạc", "Cellulose + HNO₃ đặc (xúc tác H₂SO₄ đặc) → cellulose trinitrate; thủy phân → glucose"],
          forms: [
            { name: "Cấu trúc và tính chất của tinh bột, cellulose", tier: "nen", parts: ["I", "II"] },
            { name: "Quang hợp, tơ, giấy, thuốc nổ: Đúng/Sai ứng dụng", tier: "nen", parts: ["II"] },
            { name: "Thủy phân tinh bột, cellulose: khối lượng glucose, hiệu suất", tier: "nang", parts: ["III"] },
            { name: "Điều chế cellulose trinitrate: khối lượng HNO₃", tier: "nang", parts: ["III"] },
            { name: "Sản xuất ethanol từ tinh bột hoặc cellulose qua nhiều giai đoạn", tier: "top", parts: ["III"] }
          ]
        },
        {
          id: "b7", no: 7, title: "Ôn tập chương 2", week: 3, hours: 2,
          keyPoints: ["Bảng so sánh 6 chất theo 4 phản ứng: Cu(OH)₂, tráng bạc, thủy phân, iodine", "Chuỗi chuyển hóa: tinh bột → glucose → ethanol", "Ghi chú hiệu suất của từng giai đoạn"],
          forms: [
            { name: "Sơ đồ chuyển hóa tinh bột → glucose → ethanol", tier: "nang", parts: ["I"] },
            { name: "Nhận biết các dung dịch carbohydrate bằng thuốc thử", tier: "nang", parts: ["I", "II"] },
            { name: "Bài toán tổng hợp nhiều giai đoạn, hiệu suất khác nhau", tier: "top", parts: ["III"] },
            { name: "Đề kiểm tra chương (Phần I, II, III)", tier: "nang", parts: ["I", "II", "III"] }
          ]
        }
      ]
    },
    {
      id: "c3", kind: "book", code: "Chương 3", title: "Hợp chất chứa nitrogen", group: "Hữu cơ", symbol: "N", atomicNumber: 7, priority: 3,
      summary: "Amine, amino acid, peptide, protein: chương có nhiều câu Phần II và bài toán vận dụng.",
      lessons: [
        {
          id: "b8", no: 8, title: "Amine", week: 4, hours: 4,
          keyPoints: ["Bậc của amine; danh pháp: methylamine, ethylamine, aniline…", "Tính base: alkylamine mạnh hơn NH₃, mạnh hơn aniline", "Aniline + nước Br₂ → kết tủa trắng 2,4,6-tribromoaniline"],
          forms: [
            { name: "Bậc amine, đồng phân, danh pháp", tier: "nen", parts: ["I"] },
            { name: "So sánh và sắp xếp lực base", tier: "nang", parts: ["I", "II"] },
            { name: "Aniline + Br₂ và các phản ứng nhận biết", tier: "nang", parts: ["I", "II"] },
            { name: "Amine + HCl: khối lượng muối bằng bảo toàn khối lượng", tier: "nang", parts: ["III"] },
            { name: "Đốt cháy amine, tìm công thức phân tử", tier: "nang", parts: ["III"], tip: "Amine no, đơn chức, mạch hở: n(H₂O) − n(CO₂) = 1,5·n(amine)." },
            { name: "Muối ammonium hữu cơ (CH₃NH₃NO₃…) tác dụng NaOH", tier: "top", parts: ["III"] }
          ]
        },
        {
          id: "b9", no: 9, title: "Amino acid và peptide", week: 4, hours: 4,
          keyPoints: ["Amino acid có –NH₂ và –COOH, tồn tại dạng ion lưỡng cực, có tính lưỡng tính", "Peptide chứa liên kết –CO–NH–; đọc bằng kí hiệu Gly, Ala, Val…", "Từ tripeptide trở lên có phản ứng màu biuret với Cu(OH)₂"],
          forms: [
            { name: "Kí hiệu và danh pháp amino acid, peptide", tier: "nen", parts: ["I"] },
            { name: "Tính lưỡng tính và ảnh hưởng của pH đến dạng tồn tại", tier: "nang", parts: ["I", "II"] },
            { name: "Amino acid + HCl hoặc NaOH: tăng giảm khối lượng", tier: "nang", parts: ["III"] },
            { name: "Đếm đồng phân peptide (Gly–Ala khác Ala–Gly)", tier: "nang", parts: ["I", "III"] },
            { name: "Thủy phân peptide trong acid hoặc base: số mol, khối lượng muối", tier: "top", parts: ["III"] },
            { name: "Đốt cháy peptide, quy đổi về amino acid", tier: "top", parts: ["III"] }
          ]
        },
        {
          id: "b10", no: 10, title: "Protein và enzyme", week: 5, hours: 3,
          keyPoints: ["Protein là polypeptide phân tử khối lớn, có nhiều bậc cấu trúc", "Đông tụ khi đun nóng, gặp acid, base, muối kim loại nặng; có phản ứng biuret", "Enzyme là xúc tác sinh học, có tính đặc hiệu, hoạt động tốt ở nhiệt độ và pH thích hợp"],
          forms: [
            { name: "Tính chất và nhận biết protein (biuret, đông tụ)", tier: "nen", parts: ["I", "II"] },
            { name: "Enzyme: đặc điểm, ảnh hưởng của nhiệt độ và pH", tier: "nang", parts: ["II"] },
            { name: "Đúng/Sai tình huống: nấu ăn, sữa chua, chất tẩy có enzyme", tier: "nang", parts: ["II"] },
            { name: "Thủy phân protein thành amino acid: tính khối lượng", tier: "nang", parts: ["III"] }
          ]
        },
        {
          id: "b11", no: 11, title: "Ôn tập chương 3", week: 5, hours: 3,
          keyPoints: ["Bảng so sánh amine, amino acid, peptide, protein", "Nhận biết bằng quỳ tím, Cu(OH)₂, nước Br₂, HNO₃", "Bài toán hỗn hợp: đặt ẩn theo nhóm chức"],
          forms: [
            { name: "Sắp xếp tính chất và nhận biết hợp chất chứa nitrogen", tier: "nang", parts: ["I", "II"] },
            { name: "Hỗn hợp amine, amino acid, muối ammonium tác dụng HCl hoặc NaOH", tier: "top", parts: ["III"] },
            { name: "Hỗn hợp peptide: quy đổi và bảo toàn", tier: "top", parts: ["III"] },
            { name: "Đề kiểm tra chương (Phần I, II, III)", tier: "nang", parts: ["I", "II", "III"] }
          ]
        }
      ]
    },
    {
      id: "c4", kind: "book", code: "Chương 4", title: "Polymer", group: "Hữu cơ", symbol: "Cl", atomicNumber: 17, priority: 2,
      summary: "Polymer và vật liệu: học thuộc có hệ thống, làm nhanh phần tính hệ số mắt xích.",
      lessons: [
        {
          id: "b12", no: 12, title: "Đại cương về polymer", week: 5, hours: 3,
          keyPoints: ["Polymer, monomer, mắt xích, hệ số polymer hóa n", "Phân loại theo nguồn gốc và cấu trúc mạch", "Trùng hợp (không tách phân tử nhỏ) và trùng ngưng (tách H₂O, HCl…)"],
          forms: [
            { name: "Nhận biết monomer, mắt xích, polymer", tier: "nen", parts: ["I"] },
            { name: "Phân biệt trùng hợp và trùng ngưng, điều kiện của monomer", tier: "nen", parts: ["I", "II"] },
            { name: "Viết phương trình tổng hợp PE, PVC, PS, PMMA, nylon", tier: "nang", parts: ["I"] },
            { name: "Tính hệ số polymer hóa, khối lượng mol polymer", tier: "nang", parts: ["III"] },
            { name: "Điều chế polymer có hiệu suất qua nhiều giai đoạn", tier: "nang", parts: ["III"] }
          ]
        },
        {
          id: "b13", no: 13, title: "Vật liệu polymer", week: 6, hours: 4,
          keyPoints: ["Chất dẻo, vật liệu composite: PE, PVC, PS, PMMA, PPF", "Cao su: thiên nhiên, buna, buna-S, buna-N; lưu hóa bằng lưu huỳnh", "Tơ: tự nhiên, bán tổng hợp (visco, acetate), tổng hợp (nylon-6,6, capron, nitron); keo dán"],
          forms: [
            { name: "Nhận biết loại vật liệu và polymer thành phần", tier: "nen", parts: ["I"] },
            { name: "Phản ứng điều chế cao su buna, buna-S, buna-N, nylon-6,6", tier: "nang", parts: ["I", "II"] },
            { name: "Phân biệt tơ bằng phản ứng đốt và tính chất", tier: "nang", parts: ["II"] },
            { name: "Polymer và môi trường: tái chế, phân hủy sinh học", tier: "nang", parts: ["II"] },
            { name: "Cao su lưu hóa và buna-S + Br₂: tỉ lệ mắt xích", tier: "top", parts: ["III"] }
          ]
        },
        {
          id: "b14", no: 14, title: "Ôn tập chương 4", week: 6, hours: 2,
          keyPoints: ["Bảng polymer cần thuộc: tên, monomer, loại phản ứng, ứng dụng", "Sơ đồ điều chế từ nguyên liệu ban đầu"],
          forms: [
            { name: "Ghép cặp monomer, polymer và ứng dụng", tier: "nen", parts: ["I"] },
            { name: "Chuỗi điều chế polymer từ CH₄, ethanol…", tier: "nang", parts: ["III"] },
            { name: "Đề kiểm tra chương (Phần I, II, III)", tier: "nang", parts: ["I", "II", "III"] }
          ]
        }
      ]
    },
    {
      id: "c5", kind: "book", code: "Chương 5", title: "Pin điện và điện phân", group: "Điện hóa", symbol: "Zn", atomicNumber: 30, priority: 3,
      summary: "Pin Galvani và điện phân: chương nhiều câu vận dụng, cần quy trình giải cố định.",
      lessons: [
        {
          id: "b15", no: 15, title: "Thế điện cực và nguồn điện hóa học", week: 6, hours: 4,
          keyPoints: ["Cặp oxi hóa – khử, thế điện cực chuẩn E°, dãy điện hóa", "Pin Galvani: anode (−) xảy ra oxi hóa, cathode (+) xảy ra khử; E°pin = E°cathode − E°anode", "Nguồn điện hóa học thông dụng: pin, acquy"],
          forms: [
            { name: "Xác định cực âm, cực dương, chiều electron và dòng ion", tier: "nen", parts: ["I", "II"] },
            { name: "Tính E°pin từ bảng thế điện cực chuẩn", tier: "nen", parts: ["I", "III"] },
            { name: "Dự đoán chiều phản ứng oxi hóa – khử (quy tắc α)", tier: "nang", parts: ["I", "II"] },
            { name: "Acquy chì, pin lithium-ion: phản ứng và ứng dụng", tier: "nang", parts: ["II"] },
            { name: "Pin Zn–Cu hoạt động: khối lượng điện cực, nồng độ ion thay đổi", tier: "top", parts: ["III"] }
          ]
        },
        {
          id: "b16", no: 16, title: "Điện phân", week: 7, hours: 5,
          keyPoints: ["Điện phân nóng chảy và điện phân dung dịch; điện cực trơ và điện cực tan", "Thứ tự nhận electron ở cathode, nhường electron ở anode; vai trò của nước", "Định luật Faraday: m = A·I·t / (n·F), F ≈ 96 485 C/mol"],
          forms: [
            { name: "Viết quá trình xảy ra ở mỗi điện cực", tier: "nen", parts: ["I", "II"] },
            { name: "Thứ tự điện phân trong dung dịch nhiều ion", tier: "nang", parts: ["I", "III"] },
            { name: "Tính khối lượng, thể tích khí, thời gian bằng Faraday", tier: "nang", parts: ["III"] },
            { name: "Điện phân NaCl (có/không màng ngăn), điều chế Al, tinh luyện Cu, mạ điện", tier: "nang", parts: ["II"] },
            { name: "Điện phân hỗn hợp muối: dung dịch sau điện phân phản ứng tiếp với Fe, Al, NaOH", tier: "top", parts: ["III"] },
            { name: "Đọc đồ thị điện phân: m – t, V – t, pH – t", tier: "top", parts: ["II", "III"] }
          ]
        },
        {
          id: "b17", no: 17, title: "Ôn tập chương 5", week: 7, hours: 3,
          keyPoints: ["Cách đọc nhanh bảng thế điện cực chuẩn", "So sánh pin Galvani (tự phát) và bình điện phân (cưỡng bức)", "Quy trình 5 bước cho mọi bài điện phân"],
          forms: [
            { name: "Đọc bảng thế điện cực và suy luận (Phần II)", tier: "nang", parts: ["II"] },
            { name: "Kết hợp pin và điện phân trong cùng một bài", tier: "top", parts: ["III"] },
            { name: "Đề kiểm tra chương (Phần I, II, III)", tier: "nang", parts: ["I", "II", "III"] }
          ]
        }
      ]
    },
    {
      id: "c6", kind: "book", code: "Chương 6", title: "Đại cương về kim loại", group: "Kim loại", symbol: "Fe", atomicNumber: 26, priority: 3,
      summary: "Tính chất, điều chế và ăn mòn kim loại: nền tảng cho toàn bộ phần vô cơ.",
      lessons: [
        {
          id: "b18", no: 18, title: "Cấu tạo và liên kết trong tinh thể kim loại", week: 7, hours: 2,
          keyPoints: ["Vị trí và cấu hình electron lớp ngoài cùng của kim loại", "Liên kết kim loại: ion dương và electron tự do", "Kiểu mạng tinh thể: lập phương tâm khối, lập phương tâm diện, lục phương"],
          forms: [
            { name: "Cấu hình electron và vị trí trong bảng tuần hoàn", tier: "nen", parts: ["I"] },
            { name: "Liên kết kim loại giải thích tính chất vật lí", tier: "nen", parts: ["I", "II"] },
            { name: "Nhận diện kiểu mạng tinh thể", tier: "nen", parts: ["I"] },
            { name: "Tính số nguyên tử mỗi ô mạng, khối lượng riêng (mở rộng)", tier: "top", parts: ["III"], tip: "Mở rộng ngoài trọng tâm sách giáo khoa, học sau khi xong các dạng khác." }
          ]
        },
        {
          id: "b19", no: 19, title: "Tính chất vật lí và tính chất hóa học của kim loại", week: 8, hours: 5,
          keyPoints: ["Tính chất vật lí chung: dẻo, dẫn điện, dẫn nhiệt, ánh kim", "Dãy hoạt động hóa học và phản ứng với phi kim, acid, nước, dung dịch muối", "Bảo toàn electron là công cụ chính với HNO₃ và H₂SO₄ đặc"],
          forms: [
            { name: "Tính chất vật lí và mối liên hệ với cấu tạo", tier: "nen", parts: ["I"] },
            { name: "Kim loại + phi kim (O₂, Cl₂, S)", tier: "nen", parts: ["I", "III"] },
            { name: "Kim loại + HCl, H₂SO₄ loãng: thể tích H₂, khối lượng muối", tier: "nang", parts: ["III"] },
            { name: "Kim loại + HNO₃, H₂SO₄ đặc: bảo toàn electron", tier: "nang", parts: ["III"] },
            { name: "Kim loại + dung dịch muối: tăng giảm khối lượng thanh kim loại", tier: "nang", parts: ["III"] },
            { name: "Hỗn hợp kim loại + hỗn hợp muối: thứ tự phản ứng, biện luận", tier: "top", parts: ["III"] },
            { name: "Fe + HNO₃ hoặc hỗn hợp H⁺ và NO₃⁻ bằng phương trình ion", tier: "top", parts: ["III"] }
          ]
        },
        {
          id: "b20", no: 20, title: "Kim loại trong tự nhiên và phương pháp tách kim loại", week: 8, hours: 3,
          keyPoints: ["Quặng thông dụng và thành phần chính", "Chọn phương pháp theo độ hoạt động: nhiệt luyện, thủy luyện, điện phân", "Luyện gang, thép; sản xuất nhôm bằng điện phân Al₂O₃ nóng chảy"],
          forms: [
            { name: "Chọn phương pháp tách phù hợp với từng kim loại", tier: "nen", parts: ["I"] },
            { name: "Quặng và thành phần chính", tier: "nen", parts: ["I"] },
            { name: "Tái chế kim loại và bảo vệ môi trường", tier: "nen", parts: ["II"] },
            { name: "Sản xuất nhôm: Al₂O₃ nóng chảy, cryolite", tier: "nang", parts: ["I", "II"] },
            { name: "Nhiệt luyện: khử oxide bằng CO, H₂, C (độ giảm khối lượng chất rắn)", tier: "nang", parts: ["III"] },
            { name: "Sản xuất gang, thép: hiệu suất, hàm lượng carbon", tier: "nang", parts: ["III"] }
          ]
        },
        {
          id: "b21", no: 21, title: "Hợp kim", week: 9, hours: 2,
          keyPoints: ["Hợp kim gồm kim loại nền và các kim loại hoặc phi kim khác", "Thường cứng, bền, chống ăn mòn tốt hơn kim loại nguyên chất", "Hợp kim thông dụng: gang, thép, inox, đồng thau, duralumin"],
          forms: [
            { name: "Nhận diện thành phần và ứng dụng của hợp kim", tier: "nen", parts: ["I", "II"] },
            { name: "So sánh hợp kim với kim loại nguyên chất", tier: "nen", parts: ["I"] },
            { name: "Tính phần trăm khối lượng trong hợp kim từ phản ứng với acid hoặc kiềm", tier: "nang", parts: ["III"] }
          ]
        },
        {
          id: "b22", no: 22, title: "Sự ăn mòn kim loại", week: 9, hours: 3,
          keyPoints: ["Ăn mòn hóa học không sinh dòng điện; ăn mòn điện hóa cần đủ 3 điều kiện", "Trong pin ăn mòn, kim loại mạnh hơn là anode và bị oxi hóa", "Bảo vệ: phủ bề mặt, dùng kim loại hi sinh, bảo vệ điện hóa"],
          forms: [
            { name: "Phân biệt ăn mòn hóa học và ăn mòn điện hóa", tier: "nen", parts: ["I"] },
            { name: "Gỉ sét, mạ kẽm, sơn, hợp kim chống gỉ trong thực tiễn", tier: "nen", parts: ["II"] },
            { name: "Xác định điện cực và quá trình trong ăn mòn điện hóa (Fe–Cu, Fe–Zn)", tier: "nang", parts: ["I", "II"] },
            { name: "Đếm thí nghiệm xảy ra ăn mòn điện hóa", tier: "nang", parts: ["I"] },
            { name: "Chọn kim loại hi sinh để bảo vệ tàu, đường ống", tier: "nang", parts: ["II"] }
          ]
        },
        {
          id: "b23", no: 23, title: "Ôn tập chương 6", week: 9, hours: 3,
          keyPoints: ["Sơ đồ tổng hợp: tính chất, điều chế, ăn mòn", "Đọc bảng kết quả thí nghiệm và rút ra kết luận"],
          forms: [
            { name: "Bài toán kim loại tổng hợp (acid, muối, nhiệt luyện)", tier: "top", parts: ["III"] },
            { name: "Đọc bảng thí nghiệm và rút kết luận (Phần II)", tier: "top", parts: ["II"] },
            { name: "Đề kiểm tra chương (Phần I, II, III)", tier: "nang", parts: ["I", "II", "III"] }
          ]
        }
      ]
    },
    {
      id: "c7", kind: "book", code: "Chương 7", title: "Nguyên tố nhóm IA và nhóm IIA", group: "Kim loại", symbol: "Na", atomicNumber: 11, priority: 3,
      summary: "Kim loại kiềm, kiềm thổ, nước cứng: nhiều bài CO₂ – kiềm và muối carbonate.",
      lessons: [
        {
          id: "b24", no: 24, title: "Nguyên tố nhóm IA", week: 10, hours: 3,
          keyPoints: ["Cấu hình ns¹, tính khử mạnh, nhường 1 electron", "Na, K + nước → hydroxide + H₂; điều chế bằng điện phân nóng chảy", "NaOH, NaCl, Na₂CO₃, NaHCO₃: tính chất và ứng dụng"],
          forms: [
            { name: "Đặc điểm cấu tạo và xu hướng tính chất trong nhóm", tier: "nen", parts: ["I"] },
            { name: "Ứng dụng của NaHCO₃, Na₂CO₃, NaCl", tier: "nen", parts: ["II"] },
            { name: "Kim loại kiềm + nước, + dung dịch muối", tier: "nang", parts: ["I", "III"] },
            { name: "Hỗn hợp kim loại kiềm, kiềm thổ + H₂O: thể tích H₂, pH", tier: "nang", parts: ["III"] },
            { name: "Điện phân NaCl, sản xuất xút và nước Javel", tier: "nang", parts: ["II"] },
            { name: "Muối carbonate, hydrogencarbonate: nhỏ từ từ acid, thứ tự phản ứng", tier: "top", parts: ["III"] }
          ]
        },
        {
          id: "b25", no: 25, title: "Nguyên tố nhóm IIA", week: 10, hours: 4,
          keyPoints: ["Be, Mg, Ca, Sr, Ba: nhường 2 electron, tính khử tăng dần trong nhóm", "Hợp chất của Ca: CaO, Ca(OH)₂, CaCO₃, CaSO₄ (thạch cao) và ứng dụng", "Nước cứng: tạm thời, vĩnh cửu, toàn phần và cách làm mềm"],
          forms: [
            { name: "Tính chất kim loại kiềm thổ, xu hướng trong nhóm", tier: "nen", parts: ["I"] },
            { name: "Ứng dụng thạch cao, vôi; thạch nhũ và hang động", tier: "nen", parts: ["II"] },
            { name: "Nước cứng: nhận biết, tác hại, làm mềm", tier: "nang", parts: ["I", "II"] },
            { name: "CO₂ + dung dịch Ca(OH)₂, Ba(OH)₂: biện luận sản phẩm", tier: "nang", parts: ["III"] },
            { name: "Đọc đồ thị CO₂ – Ba(OH)₂ và tính toán", tier: "top", parts: ["III"] },
            { name: "Tính lượng hóa chất làm mềm nước cứng", tier: "top", parts: ["III"] }
          ]
        },
        {
          id: "b26", no: 26, title: "Ôn tập chương 7", week: 10, hours: 2,
          keyPoints: ["Bảng nhận biết các chất nhóm IA, IIA", "Quy đổi hỗn hợp về kim loại và O"],
          forms: [
            { name: "Nhận biết các chất nhóm IA, IIA", tier: "nang", parts: ["I", "II"] },
            { name: "Hỗn hợp kim loại kiềm, kiềm thổ, oxide + H₂O: quy đổi về kim loại và O", tier: "top", parts: ["III"] },
            { name: "Đề kiểm tra chương (Phần I, II, III)", tier: "nang", parts: ["I", "II", "III"] }
          ]
        }
      ]
    },
    {
      id: "c8", kind: "book", code: "Chương 8", title: "Sơ lược về dãy kim loại chuyển tiếp thứ nhất và phức chất", group: "Kim loại", symbol: "Cu", atomicNumber: 29, priority: 2,
      summary: "Fe, Cu, Cr, Mn và phức chất: ít bài nhưng có câu lí thuyết mới, cần học gọn và chắc.",
      lessons: [
        {
          id: "b27", no: 27, title: "Đại cương về kim loại chuyển tiếp dãy thứ nhất", week: 11, hours: 3,
          keyPoints: ["Vị trí (Sc → Zn), cấu hình electron 3dˣ4sʸ", "Nhiều số oxi hóa, hợp chất thường có màu, có hoạt tính xúc tác", "Fe, Cu, Cr, Mn: số oxi hóa đặc trưng và hợp chất quan trọng"],
          forms: [
            { name: "Cấu hình electron nguyên tử và ion (Fe²⁺, Fe³⁺, Cu²⁺…)", tier: "nen", parts: ["I"] },
            { name: "Số oxi hóa đặc trưng và màu của ion, hợp chất", tier: "nen", parts: ["I", "II"] },
            { name: "Tính chất Fe, Cu và hợp chất Fe²⁺, Fe³⁺, Cu²⁺", tier: "nang", parts: ["I", "II"] },
            { name: "Chuẩn độ Fe²⁺ bằng KMnO₄: tính nồng độ", tier: "top", parts: ["III"], tip: "n(Fe²⁺) = 5·n(MnO₄⁻) trong môi trường acid." }
          ]
        },
        {
          id: "b28", no: 28, title: "Sơ lược về phức chất", week: 11, hours: 2,
          keyPoints: ["Cấu tạo: nguyên tử hoặc ion trung tâm, phối tử, cầu nội và cầu ngoại", "Liên kết cho – nhận, số phối trí", "Ví dụ: [Cu(NH₃)₄]²⁺, [Ag(NH₃)₂]⁺, [Fe(CN)₆]³⁻, [Cu(H₂O)₆]²⁺"],
          forms: [
            { name: "Xác định nguyên tử trung tâm, phối tử, số phối trí", tier: "nen", parts: ["I"] },
            { name: "Tính điện tích ion phức, số oxi hóa nguyên tử trung tâm", tier: "nen", parts: ["I", "III"] },
            { name: "Viết công thức và đọc tên phức chất đơn giản", tier: "nang", parts: ["I"] }
          ]
        },
        {
          id: "b29", no: 29, title: "Một số tính chất và ứng dụng của phức chất", week: 11, hours: 2,
          keyPoints: ["Phản ứng tạo phức: Cu(OH)₂ tan trong NH₃ dư", "Phức chất có màu đặc trưng, dùng để nhận biết ion", "Ứng dụng: y học (cisplatin), sinh học (hemoglobin, chlorophyll), mạ, xúc tác"],
          forms: [
            { name: "Ứng dụng của phức chất trong y học, sinh học, công nghiệp", tier: "nen", parts: ["II"] },
            { name: "Hiện tượng khi tạo phức (đổi màu, kết tủa tan)", tier: "nang", parts: ["I", "II"] },
            { name: "Nhận biết ion kim loại bằng phản ứng tạo phức", tier: "nang", parts: ["I", "II"] },
            { name: "Đọc số liệu thí nghiệm về phức chất (Phần II)", tier: "top", parts: ["II"] }
          ]
        },
        {
          id: "b30", no: 30, title: "Ôn tập chương 8", week: 11, hours: 2,
          keyPoints: ["Hệ thống hóa Fe, Cu, Cr, Mn", "Bảng phức chất và màu thường gặp"],
          forms: [
            { name: "Hệ thống hóa Fe, Cu, Cr, Mn và phức chất", tier: "nang", parts: ["I"] },
            { name: "Bài toán Fe, Cu và hợp chất (oxide sắt, muối sắt)", tier: "top", parts: ["III"] },
            { name: "Đề kiểm tra chương (Phần I, II, III)", tier: "nang", parts: ["I", "II", "III"] }
          ]
        }
      ]
    },
    {
      id: "rev", kind: "review", code: "Nước rút", title: "Tổng ôn và luyện đề 8+", group: "Tổng ôn", symbol: "8+", atomicNumber: null, priority: null,
      summary: "Hệ thống hóa, luyện đề bấm giờ và sổ lỗi sai để chốt mốc 8+.",
      lessons: [
        {
          id: "r1", no: null, tag: "Tổng ôn 1", title: "Hệ thống hóa hữu cơ (Chương 1 – 4)", week: 12, hours: 3,
          keyPoints: ["Bản đồ chuyển hóa: ester, carbohydrate, amine, amino acid, polymer", "Bảng phản ứng đặc trưng và thuốc thử", "Lỗi hay gặp: điều kiện phản ứng, hệ số, đơn vị"],
          forms: [
            { name: "Chuỗi phản ứng và sơ đồ điều chế xuyên chương", tier: "nang", parts: ["I"] },
            { name: "Nhận biết, phân biệt xuyên chương", tier: "nang", parts: ["I", "II"] },
            { name: "Bài toán hỗn hợp hữu cơ: quy đổi và bảo toàn", tier: "top", parts: ["III"] }
          ]
        },
        {
          id: "r2", no: null, tag: "Tổng ôn 2", title: "Hệ thống hóa vô cơ (Chương 5 – 8)", week: 12, hours: 3,
          keyPoints: ["Điện hóa, kim loại, điện phân trong cùng một bài", "CO₂ – kiềm, muối carbonate, đồ thị", "Câu lí thuyết Đúng/Sai về nước cứng, phức chất, kim loại chuyển tiếp"],
          forms: [
            { name: "Câu Đúng/Sai lí thuyết: nước cứng, phức chất, kim loại chuyển tiếp", tier: "nang", parts: ["II"] },
            { name: "Điện hóa, kim loại, điện phân trong một bài", tier: "top", parts: ["III"] },
            { name: "CO₂ – kiềm, muối carbonate, đồ thị", tier: "top", parts: ["III"] }
          ]
        },
        {
          id: "r3", no: null, tag: "Luyện đề", title: "Luyện đề tổng hợp theo cấu trúc mới", week: 12, hours: 4,
          keyPoints: ["Cấu trúc đề: 28 câu, 50 phút", "Giải đề bấm giờ rồi phân tích lỗi sai", "Chia câu thành nhóm chắc chắn làm, nên làm nhanh, để lại cuối"],
          forms: [
            { name: "Phần I: 18 câu trong 15 phút", tier: "nang", parts: ["I"] },
            { name: "Phần II: đọc dữ kiện và xét từng ý", tier: "top", parts: ["II"] },
            { name: "Phần III: tính nhanh, làm tròn, điền đáp án", tier: "top", parts: ["III"] },
            { name: "Đề thi thử nguyên bộ 50 phút (3 đề)", tier: "top", parts: ["I", "II", "III"] }
          ]
        },
        {
          id: "r4", no: null, tag: "Chiến thuật", title: "Chiến thuật 8+ và tổng kết lỗi sai", week: 12, hours: 2,
          keyPoints: ["Gợi ý phân bổ 50 phút: Phần I 15, Phần II 18, Phần III 12, soát bài 5", "Sổ lỗi sai: mỗi lỗi ghi nguyên nhân và cách sửa", "Danh sách công thức cần nhớ trước ngày thi"],
          forms: [
            { name: "Chọn câu làm trước và quản lý thời gian", tier: "nang", parts: ["I", "II", "III"] },
            { name: "Sổ lỗi sai và danh sách công thức cần nhớ", tier: "nang", parts: ["I", "III"] }
          ]
        }
      ]
    }
  ]
}

const GROUPS = { 'Nền tảng': 'base', 'Hữu cơ': 'org', 'Điện hóa': 'ele', 'Kim loại': 'met', 'Tổng ôn': 'rev' }
const PART_TITLE = { I: 'Phần I: trắc nghiệm nhiều lựa chọn', II: 'Phần II: Đúng/Sai', III: 'Phần III: trả lời ngắn' }
const LEVEL = { nen: 1, nang: 2, top: 3 }

function esc(s) {
  return String(s || '').replace(/[&<>"']/g, function (c) {
    return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]
  })
}

function fmt(n) {
  return String(n).replace('.', ',')
}

function norm(s) {
  return String(s || '').normalize('NFKD').replace(/[\u0300-\u036f]/g, '').replace(/đ/g, 'd').replace(/Đ/g, 'D').toLowerCase()
}

function lv(tier, label) {
  const n = LEVEL[tier] || 1
  let bars = ''
  for (let i = 1; i <= 3; i++) {
    bars += `<i${i > n ? ' class="off"' : ''}></i>`
  }
  return `<span class="h12r__lv h12r__lv--${tier}" role="img" aria-label="${esc(label)}">${bars}</span>`
}

export function curveSVG(points, months, W, animate = true) {
  const H = Math.max(230, Math.min(380, Math.round(W * 0.62)))
  const m = { l: 30, r: 24, t: 24, b: 54 }
  const narrow = W < 420
  const iw = W - m.l - m.r
  const ih = H - m.t - m.b
  const maxW = Math.max.apply(null, points.map(p => p.week))
  
  function x(w) { return m.l + (iw * w) / maxW }
  function y(s) { return m.t + ih * (1 - s / 10) }
  
  let out = `<svg class="h12r__svg${animate ? '' : ' h12r__svg--static'}" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}" role="img" aria-label="${esc('Điểm mục tiêu tăng từ khoảng ' + fmt(points[0].score) + ' lên ' + fmt(points[points.length - 1].score) + ' sau ' + maxW + ' tuần')}">`

  // Month backgrounds
  months.forEach((mo, i) => {
    const x0 = x(mo.weeks[0] - 1)
    const x1 = x(mo.weeks[1])
    out += `<rect x="${x0}" y="${m.t}" width="${x1 - x0}" height="${ih}" fill="${i % 2 ? '#EEF3F8' : '#F8FAFC'}"/>`
    out += `<text x="${(x0 + x1) / 2}" y="${m.t + ih - 8}" text-anchor="middle" font-weight="600">Tháng ${mo.id}</text>`
  })

  // Goal 8+ zone
  out += `<rect x="${m.l}" y="${y(10)}" width="${iw}" height="${y(8) - y(10)}" fill="#FCE4ED" opacity=".85"/>`
  
  // Horizontal grid lines
  for (let g = 0; g <= 10; g += 2) {
    out += `<line x1="${m.l}" x2="${W - m.r}" y1="${y(g)}" y2="${y(g)}" stroke="#D5DEE7" stroke-width="1"/>`
    out += `<text x="${m.l - 6}" y="${y(g) + 4}" text-anchor="end">${g}</text>`
  }

  // 8.0 dashed target line
  out += `<line x1="${m.l}" x2="${W - m.r}" y1="${y(8)}" y2="${y(8)}" stroke="#C8235F" stroke-width="2" stroke-dasharray="6 5"/>`
  out += `<text class="goal" x="${m.l + 8}" y="${y(9) + 5}">Vùng 8+</text>`

  // Bezier path for growth curve
  const pts = points.map(p => [x(p.week), y(p.score)])
  let d = 'M' + pts[0][0] + ',' + pts[0][1]
  for (let i = 0; i < pts.length - 1; i++) {
    const p0 = pts[i - 1] || pts[i]
    const p1 = pts[i]
    const p2 = pts[i + 1]
    const p3 = pts[i + 2] || p2
    d += ' C' + (p1[0] + (p2[0] - p0[0]) / 6) + ',' + (p1[1] + (p2[1] - p0[1]) / 6) + ' ' +
      (p2[0] - (p3[0] - p1[0]) / 6) + ',' + (p2[1] - (p3[1] - p1[1]) / 6) + ' ' + p2[0] + ',' + p2[1]
  }
  out += `<path class="h12r__curve" pathLength="1" d="${d}"/>`

  // Data dots and milestone labels
  points.forEach((p, i) => {
    const last = i === points.length - 1
    const first = i === 0
    const cx = pts[i][0]
    const cy = pts[i][1]
    const anchor = first ? 'start' : (last ? 'end' : 'middle')
    const tx = first ? cx - 4 : (last ? cx + 4 : cx)
    const label = narrow ? p.label.replace('Cuối tháng ', 'Cuối T') : p.label
    out += `<circle class="h12r__dot${last ? ' h12r__dot--goal' : ''}" cx="${cx}" cy="${cy}" r="7" style="animation-delay:${0.5 + i * 0.35}s"/>`
    out += `<text class="${last ? 'goal' : 'strong'}" x="${tx}" y="${cy - 14}" text-anchor="${anchor}">${p.score >= 8 ? '8+' : '≈ ' + fmt(p.score)}</text>`
    out += `<text x="${tx}" y="${H - 28}" text-anchor="${anchor}">Tuần ${p.week}</text>`
    out += `<text x="${tx}" y="${H - 10}" text-anchor="${anchor}" style="font-weight:600;fill:#0F2438">${esc(label)}</text>`
  })

  return out + '</svg>'
}

export function examHTML(ex) {
  const totalTarget = ex.target.reduce((s, t) => s + t.points, 0)
  function seg(id, pts) {
    return `<div class="h12r__seg h12r__seg--${id}" style="flex:0 0 ${pts * 10}%"><span class="h12r__seg-id">Phần ${id}</span><span>${fmt(pts)}</span></div>`
  }
  const maxBar = ex.parts.map(p => seg(p.id, p.points)).join('')
  const goalBar = ex.target.map(t => seg(t.id, t.points)).join('')
  const cards = ex.parts.map(p => {
    const t = ex.target.find(x => x.id === p.id)
    return `<article class="h12r__part h12r__part--${p.id}">
      <h3>Phần ${p.id}: ${esc(p.name)}</h3>
      <p>${esc(p.detail)} (tối đa ${fmt(p.points)} điểm)</p>
      ${t ? `<p class="g">Để đạt ${fmt(totalTarget)}: ${esc(t.note)} = ${fmt(t.points)} điểm</p>` : ''}
    </article>`
  }).join('')

  return `
    <div class="h12r__bars">
      <div class="h12r__barrow">
        <div class="h12r__barlabel">Điểm tối đa<small>${ex.questions} câu · ${ex.durationMin} phút</small></div>
        <div class="h12r__bar" role="img" aria-label="Điểm tối đa: Phần I 4,5, Phần II 4,0, Phần III 1,5">${maxBar}</div>
      </div>
      <div class="h12r__barrow">
        <div class="h12r__barlabel">Đủ để đạt ${fmt(totalTarget)}<small>không cần làm đúng hết</small></div>
        <div>
          <div class="h12r__bar" role="img" aria-label="Điểm mục tiêu ${fmt(totalTarget)}">${goalBar}</div>
          <div class="h12r__ruler">
            <span class="h12r__mk h12r__mk--avg" style="left:${ex.nationalAverage2026 * 10}%">${fmt(ex.nationalAverage2026)} · điểm trung bình toàn quốc 2026</span>
            <span class="h12r__mk h12r__mk--goal" style="left:${totalTarget * 10}%">${fmt(totalTarget)} · mục tiêu của lộ trình</span>
          </div>
        </div>
      </div>
    </div>
    <div class="h12r__parts3">${cards}</div>
  `
}

export function renderRoadmap(options = {}) {
  const M = ROADMAP_DATA.meta
  const chapters = ROADMAP_DATA.chapters
  const lessons = []
  chapters.forEach(c => c.lessons.forEach(l => lessons.push(l)))
  const book = chapters.filter(c => c.kind === 'book')
  const bookLessons = book.reduce((n, c) => n + c.lessons.length, 0)
  const totalForms = lessons.reduce((n, l) => n + l.forms.length, 0)
  const tierCount = { nen: 0, nang: 0, top: 0 }
  lessons.forEach(l => l.forms.forEach(f => { tierCount[f.tier]++ }))

  function tagOf(l) { return l.no ? 'Bài ' + l.no : l.tag }
  function hoursOfWeek(n) { return lessons.filter(l => l.week === n).reduce((s, l) => s + l.hours, 0) }

  // Hero Section
  const hero = `
    <header class="h12r__hero">
      <div class="h12r__wrap h12r__hero-grid">
        <div>
          <div class="h12r__badge">
            <i class="fa-solid fa-graduation-cap"></i> Bám sát cấu trúc đề thi tốt nghiệp THPT mới 2025 - 2026
          </div>
          <h1 class="h12r__h1">${esc(M.title)}</h1>
          <p class="h12r__lead">${esc(M.subtitle)}</p>
          <div class="h12r__cta">
            <button type="button" class="h12r__btn h12r__btn--pri" id="btn-hero-start-entrance">
              <i class="fa-solid fa-play"></i> Làm bài kiểm tra đầu vào (Miễn phí)
            </button>
            <button type="button" class="h12r__btn h12r__btn--ghost" data-scroll="h12r-timeline">
              <i class="fa-solid fa-timeline"></i> Xem lộ trình 12 tuần
            </button>
            <button type="button" class="h12r__btn h12r__btn--ghost" id="btn-hero-goto-lessons">
              <i class="fa-solid fa-wand-magic-sparkles"></i> Luyện bài học thử
            </button>
          </div>
          <div class="h12r__stats">
            <div class="h12r__stat"><b>${M.durationWeeks}</b><span>tuần học</span></div>
            <div class="h12r__stat"><b>${book.length}</b><span>chương SGK</span></div>
            <div class="h12r__stat"><b>${bookLessons}</b><span>bài trọng tâm</span></div>
            <div class="h12r__stat"><b>${totalForms}+</b><span>dạng bài</span></div>
          </div>
        </div>
        <figure class="h12r__chart">
          <div class="h12r__plot" id="h12r-plot"></div>
          <figcaption>
            <strong>Đường cong tiến bộ:</strong> Điểm tham chiếu sau mỗi tháng khi học khoảng ${esc(M.hoursPerWeek)} giờ/tuần và hoàn thành bài tập.
          </figcaption>
        </figure>
      </div>
    </header>
  `

  // Exam Breakdown Section
  const exam = `
    <section class="h12r__sec h12r__sec--white" id="h12r-exam">
      <div class="h12r__wrap">
        <h2 class="h12r__h2">Muốn đạt 8,0, bạn cần làm đúng những phần nào?</h2>
        <p class="h12r__intro">
          Đề thi tốt nghiệp môn Hóa theo cấu trúc mới có 3 phần. Lộ trình này được bóc tách và phân loại dạng bài theo đúng 3 phần, giúp bạn biết mình đang rèn luyện cho câu hỏi nào.
        </p>
        ${examHTML(M.exam)}
      </div>
    </section>
  `

  // Timeline 12 Weeks Section
  const monthsHtml = ROADMAP_DATA.months.map(mo => {
    const weeksHtml = ROADMAP_DATA.weeks.filter(w => w.month === mo.id).map(w => {
      const chips = lessons.filter(l => l.week === w.n).map(l => {
        return `<button type="button" class="h12r__chip" data-goto="${l.id}" title="${esc(l.title)}">${esc(tagOf(l))}</button>`
      }).join('')
      
      const isWeek1 = w.n === 1
      const milestoneContent = w.milestone ? `
        <p class="h12r__ms">
          <span>Mốc: <strong>${esc(w.milestone)}</strong></span>
          ${isWeek1 ? `<button type="button" class="h12r__ms-btn" id="btn-week1-entrance"><i class="fa-solid fa-play"></i> Làm ngay ➔</button>` : ''}
        </p>
      ` : ''

      return `
        <li class="h12r__week">
          <span class="h12r__wn" aria-hidden="true">${w.n}</span>
          <div>
            <p class="h12r__wt"><span class="sr">Tuần </span>${esc(w.theme)}<small>≈ ${hoursOfWeek(w.n)} giờ</small></p>
            ${milestoneContent}
            <div class="h12r__chips">${chips}</div>
          </div>
        </li>
      `
    }).join('')

    return `
      <article class="h12r__month h12r__month--${mo.id}">
        <h3><small>Tháng ${mo.id} · Tuần ${mo.weeks[0]} – ${mo.weeks[1]}</small>${esc(mo.name)}</h3>
        <span class="h12r__goalpill">${esc(mo.goal)}</span>
        <p class="d">${esc(mo.desc)}</p>
        <ol class="h12r__weeks">${weeksHtml}</ol>
      </article>
    `
  }).join('')

  const timeline = `
    <section class="h12r__sec" id="h12r-timeline">
      <div class="h12r__wrap">
        <h2 class="h12r__h2">12 tuần, mỗi tuần một mục tiêu rõ ràng</h2>
        <p class="h12r__intro">
          Nhấp vào tên một bài học bất kỳ để nhảy nhanh đến danh sách dạng bài và lý thuyết cốt lõi của bài đó.
        </p>
        <div class="h12r__months">${monthsHtml}</div>
      </div>
    </section>
  `

  // Chapters & Lessons & Forms Section
  const chsHtml = chapters.map(c => {
    const nForms = c.lessons.reduce((n, l) => n + l.forms.length, 0)
    const wk = c.lessons.map(l => l.week)
    const w0 = Math.min.apply(null, wk)
    const w1 = Math.max.apply(null, wk)
    const unit = c.kind === 'book' ? 'bài' : 'buổi'
    let prio = ''
    if (c.priority) {
      prio = `<div class="h12r__prio" title="Mức trọng tâm trong đề thi" aria-label="Mức trọng tâm ${c.priority} trên 3"><span style="margin-right:6px">Trọng tâm</span>`
      for (let i = 1; i <= 3; i++) {
        prio += `<i${i > c.priority ? ' class="off"' : ''}></i>`
      }
      prio += `</div>`
    }

    const lsHtml = c.lessons.map(l => {
      const kp = l.keyPoints.map(k => `<li>${esc(k)}</li>`).join('')
      const forms = l.forms.map(f => {
        const text = norm(f.name + ' ' + (f.tip || ''))
        const parts = f.parts.map(p => `<span class="h12r__pt" title="${esc(PART_TITLE[p])}">${p}</span>`).join('')
        return `
          <li class="h12r__form" data-tier="${f.tier}" data-text="${esc(text)}">
            ${lv(f.tier, M.tiers[f.tier])}
            <span class="h12r__fname">${esc(f.name)}</span>
            <span class="h12r__parts-list">${parts}</span>
            ${f.tip ? `<span class="h12r__tip">${esc(f.tip)}</span>` : ''}
          </li>
        `
      }).join('')

      return `
        <div class="h12r__ls" id="h12r-l-${l.id}" data-lesson="${l.id}" data-text="${esc(norm(tagOf(l) + ' ' + l.title))}">
          <label class="h12r__chk">
            <input type="checkbox" data-done="${l.id}">
            <span class="sr">Đánh dấu đã học: ${esc(tagOf(l) + ' ' + l.title)}</span>
          </label>
          <details>
            <summary>
              <span class="h12r__tag">${esc(tagOf(l))}</span>
              <span class="h12r__ttl">
                ${esc(l.title)}
                <small>Tuần ${l.week} · ${l.hours} giờ · ${l.forms.length} dạng bài</small>
              </span>
              <span class="h12r__chev" aria-hidden="true"></span>
            </summary>
            <div class="h12r__body">
              <ul class="h12r__kp">${kp}</ul>
              <ul class="h12r__forms">${forms}</ul>
            </div>
          </details>
        </div>
      `
    }).join('')

    return `
      <section class="h12r__ch" data-chapter="${c.id}">
        <header class="h12r__chhead">
          <div class="h12r__tile" data-g="${GROUPS[c.group] || 'base'}" aria-hidden="true">
            ${c.atomicNumber ? `<i>${c.atomicNumber}</i>` : ''}
            <b>${esc(c.symbol)}</b>
          </div>
          <div>
            <p class="h12r__chcode">${esc(c.code)} · ${esc(c.group)} · Tuần ${w0 === w1 ? w0 : w0 + ' – ' + w1}</p>
            <h3>${esc(c.title)}</h3>
            <p class="h12r__chsum">${esc(c.summary)}</p>
          </div>
          <div class="h12r__chmeta">
            <b>${c.lessons.length} ${unit}</b> · ${nForms} dạng bài
            ${prio}
          </div>
        </header>
        <div class="h12r__lessons">${lsHtml}</div>
      </section>
    `
  }).join('')

  const tierBtns = [['all', 'Tất cả', totalForms]].concat(
    ['nen', 'nang', 'top'].map(t => [t, M.tiers[t], tierCount[t]])
  )

  const tools = `
    <div class="h12r__tools">
      <div class="h12r__wrap">
        <div class="h12r__toolrow">
          <label class="sr" for="h12r-q">Tìm dạng bài</label>
          <input id="h12r-q" class="h12r__search" type="search" placeholder="Tìm dạng bài, ví dụ: este, amine, điện phân, Faraday, peptide..." autocomplete="off">
          <div class="h12r__seg-group" role="group" aria-label="Lọc theo mức độ">
            ${tierBtns.map(b => `
              <button type="button" class="h12r__segbtn" data-tier-btn="${b[0]}" aria-pressed="${b[0] === 'all'}">
                ${b[0] === 'all' ? '' : lv(b[0], b[1])} ${esc(b[1])} <em>${b[2]}</em>
              </button>
            `).join('')}
          </div>
          <button type="button" class="h12r__linkbtn" data-open-all="1">Mở tất cả</button>
          <button type="button" class="h12r__linkbtn" data-open-all="0">Thu gọn</button>
        </div>
        <div class="h12r__legend">
          <span>${lv('nen', 'Nền tảng')} <strong>Nền tảng</strong>: cần chắc để có 5 – 6 điểm</span>
          <span>${lv('nang', 'Nâng cao')} <strong>Nâng cao</strong>: bứt phá lên 7+</span>
          <span>${lv('top', 'Chinh phục 8+')} <strong>Chinh phục 8+</strong>: vận dụng cao</span>
          <span><b class="h12r__pt">I</b> <b class="h12r__pt">II</b> <b class="h12r__pt">III</b> xuất hiện ở Phần I, II, III của đề</span>
        </div>
        <p class="h12r__count" id="h12r-count" aria-live="polite"></p>
      </div>
    </div>
  `

  const chapterSec = `
    <section class="h12r__sec" id="h12r-chapters" style="padding-bottom:0">
      <div class="h12r__wrap">
        <h2 class="h12r__h2">Từng chương, từng bài, từng dạng bài thi</h2>
        <p class="h12r__intro">
          Mỗi bài học liệt kê đầy đủ kiến thức cốt lõi và các dạng câu hỏi được xếp từ cơ bản đến nâng cao. Đánh dấu ô bên trái khi bạn học xong một bài để lưu lại tiến độ.
        </p>
        <div class="h12r__progress">
          <span id="h12r-ptxt"></span>
          <div class="h12r__meter" role="progressbar" aria-valuemin="0" aria-valuemax="${lessons.length}" id="h12r-pbar"><i></i></div>
          <button type="button" class="h12r__linkbtn" data-reset="1">Xóa tiến độ</button>
        </div>
      </div>
      ${tools}
      <div class="h12r__wrap">
        <div class="h12r__chs" id="h12r-chs">${chsHtml}</div>
        <div class="h12r__empty" id="h12r-empty" hidden>
          <b>Không tìm thấy dạng bài phù hợp.</b><br>
          Thử tìm với từ khóa ngắn hơn hoặc chọn «Tất cả» ở bộ lọc mức độ.
        </div>
      </div>
      <div style="height:40px"></div>
    </section>
  `

  // Footer CTA Section
  const foot = `
    <footer class="h12r__foot">
      <div class="h12r__wrap">
        <h2 class="h12r__h2">Bắt đầu hành trình từ Tuần 1 ngay hôm nay!</h2>
        <p style="margin-top:10px; max-width:60ch">
          Bài kiểm tra đầu vào 20 câu sẽ đánh giá chính xác năng lực xuất phát của bạn. Từ đó, lộ trình sẽ dẫn dắt bạn qua từng chương học, từng dạng bài cho tới các đề thi thử bấm giờ ở tuần 12.
        </p>
        <div class="h12r__cta">
          <button type="button" class="h12r__btn h12r__btn--light" id="btn-foot-start-entrance">
            <i class="fa-solid fa-play"></i> Bắt đầu bài kiểm tra đầu vào ngay
          </button>
          <a class="h12r__btn h12r__btn--ghost" href="#login" style="color:#ffffff; border-color:#ffffff;">
            <i class="fa-solid fa-user-plus"></i> Đăng ký tài khoản chính thức
          </a>
        </div>
        <ul class="h12r__srcs">
          ${M.sources.map(s => `<li><a href="${esc(s.url)}" target="_blank" rel="noopener">📄 ${esc(s.label)}</a></li>`).join('')}
        </ul>
        <small>${esc(M.disclaimer)}</small>
      </div>
    </footer>
  `

  return `<div class="h12r" id="hoa12-roadmap">${hero}${exam}${timeline}${chapterSec}${foot}</div>`
}

export function bindRoadmapEvents(root, options = {}) {
  const opts = Object.assign({
    storageKey: 'h12r:done:v1',
    entranceHomeworkId: ENTRANCE_TEST_HOMEWORK_ID
  }, options)

  const chapters = ROADMAP_DATA.chapters
  const lessons = []
  chapters.forEach(c => c.lessons.forEach(l => lessons.push(l)))

  let done = new Set()
  try {
    done = new Set(JSON.parse(localStorage.getItem(opts.storageKey) || '[]'))
  } catch (e) {
    done = new Set()
  }

  function save() {
    try {
      localStorage.setItem(opts.storageKey, JSON.stringify(Array.from(done)))
    } catch (e) {}
  }

  const state = { tier: 'all' }
  const q = root.querySelector('#h12r-q')
  const reduce = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches

  function updateProgress() {
    const n = done.size
    const ptxt = root.querySelector('#h12r-ptxt')
    if (ptxt) ptxt.textContent = `Đã hoàn thành ${n}/${lessons.length} bài và buổi`
    const bar = root.querySelector('#h12r-pbar')
    if (bar) {
      bar.setAttribute('aria-valuenow', n)
      if (bar.firstChild) bar.firstChild.style.width = (100 * n / lessons.length) + '%'
    }
    root.querySelectorAll('[data-goto]').forEach(b => {
      b.classList.toggle('is-done', done.has(b.dataset.goto))
    })
    root.querySelectorAll('[data-lesson]').forEach(el => {
      const d = done.has(el.dataset.lesson)
      el.classList.toggle('is-done', d)
      const chk = el.querySelector('input')
      if (chk) chk.checked = d
    })
  }

  function applyFilter() {
    const term = norm(q ? q.value.trim() : '')
    const tier = state.tier
    let shown = 0
    let any = false

    root.querySelectorAll('[data-chapter]').forEach(ch => {
      let chVisible = false
      ch.querySelectorAll('[data-lesson]').forEach(ls => {
        const titleHit = term && ls.dataset.text.indexOf(term) > -1
        let lsVisible = false
        ls.querySelectorAll('.h12r__form').forEach(f => {
          const ok = (tier === 'all' || f.dataset.tier === tier) && (!term || titleHit || f.dataset.text.indexOf(term) > -1)
          f.hidden = !ok
          if (ok) {
            lsVisible = true
            shown++
          }
        })
        ls.hidden = !lsVisible
        if (lsVisible) {
          chVisible = true
          if (term || tier !== 'all') {
            const d = ls.querySelector('details')
            if (d) d.open = true
          }
        }
      })
      ch.hidden = !chVisible
      if (chVisible) any = true
    })

    const emptyEl = root.querySelector('#h12r-empty')
    if (emptyEl) emptyEl.hidden = any
    const countEl = root.querySelector('#h12r-count')
    if (countEl) countEl.textContent = (term || tier !== 'all') ? `${shown} dạng bài phù hợp` : ''
  }

  function setTierButtons() {
    root.querySelectorAll('[data-tier-btn]').forEach(b => {
      b.setAttribute('aria-pressed', String(b.dataset.tierBtn === state.tier))
    })
  }

  function goto(id) {
    const el = root.querySelector('#h12r-l-' + id)
    if (!el) return
    state.tier = 'all'
    if (q) q.value = ''
    setTierButtons()
    applyFilter()
    const d = el.querySelector('details')
    if (d) d.open = true
    el.scrollIntoView({ behavior: reduce ? 'auto' : 'smooth', block: 'center' })
    const s = el.querySelector('summary')
    if (s) s.focus({ preventScroll: true })
  }

  function startEntranceTest() {
    if (typeof window.confirmStartTrialHomework === 'function') {
      window.confirmStartTrialHomework(opts.entranceHomeworkId)
    } else {
      window.location.hash = `#homework-attempt?homeworkId=${opts.entranceHomeworkId}&trial=true`
    }
  }

  // Quick Action Buttons
  root.querySelector('#btn-hero-start-entrance')?.addEventListener('click', startEntranceTest)
  root.querySelector('#btn-foot-start-entrance')?.addEventListener('click', startEntranceTest)
  root.querySelector('#btn-week1-entrance')?.addEventListener('click', startEntranceTest)
  root.querySelector('#btn-hero-goto-lessons')?.addEventListener('click', () => {
    window.location.hash = '#trial?tab=lessons'
  })

  // Event Delegation for clicks
  root.addEventListener('click', e => {
    const t = e.target
    const chip = t.closest('[data-goto]')
    if (chip) {
      goto(chip.dataset.goto)
      return
    }

    const sc = t.closest('[data-scroll]')
    if (sc) {
      const el = root.querySelector('#' + sc.dataset.scroll)
      if (el) el.scrollIntoView({ behavior: reduce ? 'auto' : 'smooth' })
      return
    }

    const tb = t.closest('[data-tier-btn]')
    if (tb) {
      state.tier = tb.dataset.tierBtn
      setTierButtons()
      applyFilter()
      return
    }

    const oa = t.closest('[data-open-all]')
    if (oa) {
      const open = oa.dataset.openAll === '1'
      root.querySelectorAll('.h12r__ls:not([hidden]) details').forEach(d => { d.open = open })
      return
    }

    if (t.closest('[data-reset]')) {
      if (done.size === 0 || window.confirm('Xóa toàn bộ tiến độ đã đánh dấu?')) {
        done.clear()
        save()
        updateProgress()
      }
    }
  })

  // Checkbox change for progress
  root.addEventListener('change', e => {
    const cb = e.target.closest && e.target.closest('[data-done]')
    if (!cb) return
    if (cb.checked) {
      done.add(cb.dataset.done)
    } else {
      done.delete(cb.dataset.done)
    }
    save()
    updateProgress()
  })

  // Search input filter
  if (q) {
    q.addEventListener('input', applyFilter)
  }

  // Render SVG Chart with ResizeObserver
  const plot = root.querySelector('#h12r-plot')
  let lastW = 0
  function drawChart(animate = false) {
    if (!plot) return
    const w = Math.round(plot.clientWidth) || 520
    if (w === lastW) return
    lastW = w
    plot.innerHTML = curveSVG(ROADMAP_DATA.meta.scoreCurve, ROADMAP_DATA.months, w, animate)
  }

  drawChart(true)
  if (window.ResizeObserver && plot) {
    const ro = new window.ResizeObserver(() => { drawChart(false) })
    ro.observe(plot)
  } else {
    window.addEventListener('resize', () => { drawChart(false) })
  }

  updateProgress()
  applyFilter()
}
