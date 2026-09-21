// ==========================================================================
// ROADMAP HÓA 11 - KẾT NỐI TRI THỨC (35 TUẦN)
// Template đồng bộ với Lộ trình Hóa 12
// ==========================================================================

export const ROADMAP_11_DATA = {
  meta: {
    title: "Hóa 11: học chắc từng chương, không học lan man",
    subtitle: "Lộ trình 35 tuần chuẩn khung SGK Kết nối tri thức. Chia nhỏ kiến thức theo chu trình thực chiến: Đọc SGK → Xem bài giảng → Luyện trắc nghiệm trên web → Chốt dạng & Sổ lỗi sai → Tự kiểm tra sau 72h.",
    textbook: "Hóa học 11 – Kết nối tri thức với cuộc sống (NXB Giáo dục Việt Nam)",
    durationWeeks: 35,
    hoursRef: 70,
    chaptersCount: 6,
    lessonsCount: 25,
    targetScore: "8+",
    updated: "2026-09-21",
    tiers: {
      nen: "Nền tảng",
      nang: "Nâng cao",
      top: "Chinh phục 8+"
    },
    distribution: [
      { name: "Cân bằng hóa học", hours: 11, pct: 91.7, color: "#38bdf8", desc: "Hằng số Kc, pH và cân bằng dung dịch nước" },
      { name: "Nitrogen – Sulfur", hours: 10, pct: 83.3, color: "#60a5fa", desc: "Tính oxi hóa - khử, mưa acid và muối sulfate" },
      { name: "Đại cương hữu cơ", hours: 11, pct: 91.7, color: "#818cf8", desc: "Tách chất, phổ khối MS, CTPT và đồng phân" },
      { name: "Hydrocarbon", hours: 12, pct: 100, color: "#34d399", desc: "Alkane, alkene, alkyne và arene thơm" },
      { name: "Halogen – Ancol – Phenol", hours: 9, pct: 75, color: "#fbbf24", desc: "Quy tắc Zaitsev, tính chất ancol và phenol" },
      { name: "Carbonyl – Carboxylic acid", hours: 10, pct: 83.3, color: "#f472b6", desc: "Aldehyde, ketone, tráng bạc và ester hóa" }
    ],
    phases: [
      {
        id: 1,
        sem: 1,
        name: "Chặng 1: Học kỳ I · Nền tảng vô cơ & Khởi đầu hữu cơ",
        weeksStr: "Tuần 1 – 18 · 36 tiết",
        desc: "Khởi đầu từ cân bằng hóa học và dung dịch nước sang chuỗi biến đổi nitrogen – sulfur, sau đó đặt nền móng phương pháp tách chất, phổ MS và cấu tạo cho toàn bộ hóa hữu cơ.",
        grid: [
          { code: "Chương 1", title: "Cân bằng hóa học", detail: "11 tiết · Bài 1–3", icon: "K" },
          { code: "Chương 2", title: "Nitrogen – Sulfur", detail: "10 tiết · Bài 4–9", icon: "N/S" },
          { code: "Chương 3", title: "Đại cương hữu cơ", detail: "11 tiết · Bài 10–14", icon: "C" }
        ]
      },
      {
        id: 2,
        sem: 2,
        name: "Chặng 2: Học kỳ II · Chuỗi biến đổi & Nhóm chức hữu cơ",
        weeksStr: "Tuần 19 – 35 · 34 tiết",
        desc: "Chinh phục toàn bộ các nhóm chức trọng tâm: Hydrocarbon no/không no/thơm → Dẫn xuất halogen, alcohol, phenol → Hợp chất carbonyl và carboxylic acid. Làm bệ phóng vững vàng cho lớp 12.",
        grid: [
          { code: "Chương 4", title: "Hydrocarbon", detail: "12 tiết · Bài 15–18", icon: "HC" },
          { code: "Chương 5", title: "Halogen – Ancol – Phenol", detail: "9 tiết · Bài 19–22", icon: "OH" },
          { code: "Chương 6", title: "Carbonyl – Acid", detail: "10 tiết · Bài 23–25", icon: "COOH" }
        ]
      }
    ],
    methods: [
      { no: 1, title: "Đọc SGK & Thí nghiệm", desc: "Nắm chắc khái niệm, hiện tượng đổi màu, khí thoát ra hoặc kết tủa trước khi xem lời giải." },
      { no: 2, title: "Xem bài giảng cô đọng", desc: "Theo dõi bài giảng phân tích bản chất liên kết và cơ chế phản ứng trên hệ thống EduPortal." },
      { no: 3, title: "Luyện bài thực chiến", desc: "Làm bài tập trắc nghiệm có chấm điểm tự động bấm giờ, rèn phản xạ chống sai ngu." },
      { no: 4, title: "Chốt dạng & Sổ lỗi sai", desc: "Ghi nhớ mẹo nhận biết, công thức giải nhanh và đúc kết các bẫy đề thi hay gặp vào sổ tay." },
      { no: 5, title: "Ôn lại sau 72 giờ", desc: "Làm lại các câu đã làm sai để chuyển kiến thức vào trí nhớ dài hạn vững chắc." }
    ],
    resources: [
      { title: "THI247 · Mục lục & SGK Hóa 11 KNTT", tag: "SGK / Tra cứu", desc: "Mục lục đầy đủ 6 chương và 25 bài, dùng làm khung xương sống đối chiếu chuẩn.", url: "https://thi247.com/sach-giao-khoa-hoa-hoc-11-ket-noi-tri-thuc-voi-cuoc-song/" },
      { title: "SGKVN · Nội dung từng bài chi tiết", tag: "SGK / Nội dung", desc: "Hệ thống nội dung chi tiết theo mạch bài SGK Kết nối tri thức.", url: "https://sgkvn.com/lop-11-14/ket-noi-tri-thuc-voi-cuoc-song-3/hoa-hoc-1169.html" },
      { title: "HỌC247 · Lý thuyết & Giải bài tập KNTT", tag: "Bài tập", desc: "Hệ thống bài tập trắc nghiệm, tự luận SGK/SBT có lời giải chi tiết từng bước.", url: "https://hoc247.net/giai-bai-tap-hoa-hoc-11-ket-noi-tri-thuc-index.html" },
      { title: "Kenhhoctap · Lý thuyết tổng hợp", tag: "Lý thuyết", desc: "Tóm tắt lý thuyết trọng tâm và giáo án minh họa trực quan theo nhóm chương.", url: "https://kenhhoctap.edu.vn/muc-luc/ly-thuyet-hoa-hoc-11-ket-noi-tri-thuc" },
      { title: "Tuyensinh247 · Khóa học Thầy Tùng", tag: "Khóa học", desc: "Khóa bài giảng chuyên đề có video minh họa bám sát chương trình mới.", url: "https://tuyensinh247.com/s1-hoa-hoc-11-ket-noi-tri-thuc-voi-cuoc-song-thay-pham-thanh-tung-nam-2027-k4055.html" },
      { title: "Thầy Lâm 1E · Kênh YouTube", tag: "Video bài giảng", desc: "Video giảng chi tiết bài mới bám sát SGK (Cân bằng, Alkane, Alcohol...).", url: "https://www.youtube.com/watch?v=NT_FGqx22oE" },
      { title: "Thầy Tony Long · Kênh YouTube", tag: "Video bài giảng", desc: "Chuyên sâu về Nitrogen – Sulfur và phương pháp giải bài toán vô cơ trọng điểm.", url: "https://www.youtube.com/watch?v=XmZYj_iu4to" },
      { title: "Lời giải hay · Kênh YouTube", tag: "Video bài giảng", desc: "Hướng dẫn thực nghiệm và phân tích bài toán Carboxylic acid theo mốc thời gian.", url: "https://www.youtube.com/watch?v=yELnuYTXdeg" },
      { title: "VietJack · Bài giảng & Giáo án điện tử", tag: "Bổ trợ", desc: "Tài liệu bổ trợ, câu hỏi mở rộng và bài giảng slide sinh động.", url: "https://vietjack.com/hoa-hoc-11-kn/bai-20-alcohol.jsp" }
    ],
    sources: [
      { label: "Mục lục SGK Hóa học 11 – Kết nối tri thức (THI247)", url: "https://thi247.com/sach-giao-khoa-hoa-hoc-11-ket-noi-tri-thuc-voi-cuoc-song/" },
      { label: "Khung Kế hoạch dạy học Hóa 11 KNTT – Sở GD&ĐT Nam Định", url: "https://thpt-hoangvanthu.ninhbinh.edu.vn/wp-content/uploads/2026/04/5aa6db5b-2573-4b38-be87-afb72f30e9fd.pdf" },
      { label: "HỌC247 – Giải bài tập Hóa học 11 KNTT", url: "https://hoc247.net/giai-bai-tap-hoa-hoc-11-ket-noi-tri-thuc-index.html" }
    ],
    disclaimer: "Lộ trình tham chiếu khung phân phối chương trình môn Hóa học 11 Kết nối tri thức. Nội dung bài học và phân loại dạng bài được biên soạn nhằm tối ưu phương pháp tự học và luyện tập trên hệ thống EduPortal."
  },
  weeks: [
    { n: 1, s: 1, t: "Bài 1 · Khái niệm về cân bằng hóa học", d: "Phân biệt phản ứng một chiều và thuận nghịch, trạng thái cân bằng động, cách viết biểu thức hằng số cân bằng Kc.", tags: ["Bài 1", "Cân bằng động", "Kc"] },
    { n: 2, s: 1, t: "Bài 1 · Cân bằng và các yếu tố ảnh hưởng", d: "Luyện chuyển dịch cân bằng theo nhiệt độ, áp suất, nồng độ; chốt nguyên lý Le Chatelier (Tăng thu - Giảm tỏa).", tags: ["Bài 1", "Le Chatelier"], m: "Chốt sơ đồ tư duy Chương 1" },
    { n: 3, s: 1, t: "Bài 2 · Cân bằng trong dung dịch nước", d: "Ôn tập thuyết acid - base của Brønsted - Lowry, sự điện li và các đại lượng cơ bản trong dung dịch nước.", tags: ["Bài 2", "Điện li", "Acid–base"] },
    { n: 4, s: 1, t: "Bài 2 · pH, Ka, Kb, Kw và chỉ thị", d: "Tính pH và nồng độ ion [H+], [OH-]; phân biệt acid/base mạnh - yếu và mối liên hệ cân bằng qua Ka, Kb.", tags: ["Bài 2", "pH", "Ka/Kb"] },
    { n: 5, s: 1, t: "Bài 2 · Chuẩn độ acid – base và bài toán dung dịch", d: "Rèn luyện bài toán chuẩn độ acid - base bằng dung dịch chuẩn, xử lý bẫy pH khi pha loãng dung dịch.", tags: ["Bài 2", "Chuẩn độ"] },
    { n: 6, s: 1, t: "Bài 3 · Ôn tập Chương 1", d: "Tổng hợp toàn bộ hằng số Kc, chiều chuyển dịch cân bằng, thang pH và các bài toán dung dịch.", tags: ["Bài 3", "Ôn tập"], m: "Checkpoint 1 · Kiểm tra Chương 1" },
    { n: 7, s: 1, t: "Bài 4–5 · Đơn chất Nitrogen và Ammonia", d: "Nắm vững liên kết ba N≡N bền vững giải thích tính trơ ở nhiệt độ thường; cấu trúc chóp tam giác và tính base/tính khử của NH₃.", tags: ["Bài 4", "Bài 5", "NH₃"] },
    { n: 8, s: 1, t: "Bài 5 · Muối ammonium & Ứng dụng thực tế", d: "Tính chất hóa học của muối ammonium, phản ứng nhiệt phân đặc trưng, nhận biết ion NH₄⁺ bằng kiềm nóng.", tags: ["Bài 5", "NH₄⁺"] },
    { n: 9, s: 1, t: "Bài 6 · Hợp chất nitrogen với oxygen & Mưa acid", d: "Khí NO hóa nâu tạo NO₂; nguồn phát thải NOx, cơ chế hình thành mưa acid và ảnh hưởng môi trường sống.", tags: ["Bài 6", "NOx", "Mưa acid"] },
    { n: 10, s: 1, t: "Bài 7 · Sulfur và sulfur dioxide", d: "Các số oxi hóa của S từ -2 đến +6; tính chất hai mặt của SO₂ (vừa oxi hóa vừa khử), bài toán sục SO₂ vào dung dịch kiềm.", tags: ["Bài 7", "SO₂"] },
    { n: 11, s: 1, t: "Bài 8 · Sulfuric acid và muối sulfate", d: "So sánh H₂SO₄ loãng (acid mạnh) vs H₂SO₄ đặc (oxi hóa cực mạnh + háo nước); phản ứng nhận biết ion SO₄²⁻ bằng Ba²⁺.", tags: ["Bài 8", "H₂SO₄", "SO₄²⁻"] },
    { n: 12, s: 1, t: "Bài 9 · Ôn tập Chương 2", d: "Sơ đồ chu trình Nitrogen và Sulfur: N₂ → NH₃ → NO → NO₂ → HNO₃ và S → SO₂ → H₂SO₄; bảng nhận biết thuốc thử.", tags: ["Bài 9", "Ôn tập"], m: "Checkpoint 2 · Kiểm tra Chương 2" },
    { n: 13, s: 1, t: "Bài 10 · Hợp chất hữu cơ và hóa học hữu cơ", d: "Đặc điểm liên kết cộng hóa trị trong hợp chất hữu cơ; phân loại hydrocarbon và dẫn xuất; các nhóm chức cơ bản.", tags: ["Bài 10", "Nhóm chức"] },
    { n: 14, s: 1, t: "Bài 11 · Phương pháp tách biệt và tinh chế", d: "Chưng cất thường/phân đoạn, chiết lỏng - lỏng, kết tinh lại và sắc kí cột; kỹ năng đọc sơ đồ thí nghiệm thực hành.", tags: ["Bài 11", "Chiết", "Chưng cất"] },
    { n: 15, s: 1, t: "Bài 12 · Công thức phân tử hợp chất hữu cơ", d: "Thiết lập công thức đơn giản nhất (CTĐGN), khai thác tín hiệu pic ion phân tử [M+] trên phổ khối lượng MS để tìm CTPT.", tags: ["Bài 12", "CTPT", "MS"] },
    { n: 16, s: 1, t: "Bài 13 · Cấu tạo hóa học hợp chất hữu cơ", d: "Thuyết cấu tạo hóa học của Butlerov, hiện tượng đồng đẳng, đồng phân cấu tạo và đồng phân hình học cis - trans.", tags: ["Bài 13", "Đồng phân", "Cấu tạo"] },
    { n: 17, s: 1, t: "Bài 14 · Ôn tập Chương 3", d: "Kết nối chuỗi: % nguyên tố → CTĐGN → Phổ MS → CTPT → Đồng phân CTCT; tự làm bài kiểm tra tổng hợp hữu cơ.", tags: ["Bài 14", "Ôn tập"], m: "Checkpoint 3 · Chuẩn bị thi HKI" },
    { n: 18, s: 1, t: "Ôn tập học kỳ I và Đề kiểm tra tổng hợp", d: "Làm đề thi thử Học kỳ I 40 câu bấm giờ, đối chiếu bảng đáp án và phân tích lỗi sai chi tiết.", tags: ["HKI", "Tổng ôn"], m: "Thi học kỳ I · Chốt chặng 1" },
    { n: 19, s: 2, t: "Bài 15 · Alkane – Cấu tạo và tính chất", d: "Công thức chung CnH2n+2, danh pháp thay thế IUPAC, phản ứng thế halogen ưu tiên H ở carbon bậc cao, phản ứng cháy.", tags: ["Bài 15", "Alkane"] },
    { n: 20, s: 2, t: "Bài 15 · Alkane nâng cao và phản ứng Cracking", d: "Phản ứng cracking và reforming alkane trong công nghiệp dầu mỏ; bài toán định lượng đốt cháy n_H2O > n_CO2.", tags: ["Bài 15", "Đốt cháy", "Cracking"] },
    { n: 21, s: 2, t: "Bài 16 · Hydrocarbon không no (Alkene & Alkyne)", d: "Liên kết π kém bền; phản ứng cộng H₂, Br₂, HX tuân theo quy tắc Markovnikov; phản ứng thế ion kim loại của alk-1-yne.", tags: ["Bài 16", "Alkene", "Alkyne"] },
    { n: 22, s: 2, t: "Bài 16 · Bài tập Hydrocarbon không no", d: "Phản ứng trùng hợp alkene; phương pháp bảo toàn liên kết π; bài toán dẫn hỗn hợp khí qua bình chứa nước bromine.", tags: ["Bài 16", "Chuỗi phản ứng"] },
    { n: 23, s: 2, t: "Bài 17 · Arene (Hydrocarbon thơm)", d: "Vòng benzene bền vững; quy tắc thế vào nhân thơm của alkylbenzene (vị trí ortho/para); phân biệt benzene, toluene, styrene.", tags: ["Bài 17", "Benzene", "Arene"] },
    { n: 24, s: 2, t: "Bài 18 · Ôn tập Chương 4", d: "Bảng so sánh 3 nhóm hydrocarbon (no, không no, thơm); chuỗi phản ứng liên hoàn và bài toán hỗn hợp hydrocarbon.", tags: ["Bài 18", "Ôn tập"], m: "Checkpoint 4 · Kiểm tra Chương 4" },
    { n: 25, s: 2, t: "Bài 19 · Dẫn xuất halogen", d: "Phân loại dẫn xuất halogen; phản ứng thế nhóm halogen với dung dịch kiềm; phản ứng tách HX theo quy tắc Zaitsev.", tags: ["Bài 19", "Halogen"] },
    { n: 26, s: 2, t: "Bài 20 · Alcohol – Cấu tạo và tính chất cơ bản", d: "Nhóm -OH và liên kết hydrogen; phản ứng thế H với kim loại kiềm Na; phản ứng tách nước tạo ether (140°C) hoặc alkene (170°C).", tags: ["Bài 20", "Alcohol", "Ethanol"] },
    { n: 27, s: 2, t: "Bài 20 · Alcohol nâng cao & Polyalcohol", d: "Phản ứng oxi hóa không hoàn toàn bằng CuO; phản ứng tạo phức màu xanh lam đặc trưng của glycerol/ethylene glycol với Cu(OH)₂.", tags: ["Bài 20", "Alcohol", "Glycerol"] },
    { n: 28, s: 2, t: "Bài 21 · Phenol – Tính chất acid đặc trưng", d: "Ảnh hưởng qua lại giữa vòng thơm và nhóm -OH; tính acid yếu của phenol (tác dụng NaOH); phản ứng tạo kết tủa trắng với nước brom.", tags: ["Bài 21", "Phenol"] },
    { n: 29, s: 2, t: "Bài 22 · Ôn tập Chương 5", d: "Bảng nhận biết phân biệt: dẫn xuất halogen, ancol đơn chức, polyalcohol có OH kề nhau và phenol; giải bài toán định lượng.", tags: ["Bài 22", "Ôn tập"], m: "Checkpoint 5 · Kiểm tra Chương 5" },
    { n: 30, s: 2, t: "Bài 23 · Hợp chất carbonyl (Aldehyde & Ketone)", d: "Nhóm carbonyl C=O phân cực; danh pháp IUPAC; phản ứng khử bằng NaBH₄ hoặc LiAlH₄ tạo alcohol; phản ứng cộng HCN.", tags: ["Bài 23", "Aldehyde", "Ketone"] },
    { n: 31, s: 2, t: "Bài 23 · Phản ứng tráng bạc và Iodoform test", d: "Phản ứng tráng bạc với thuốc thử Tollens; phản ứng tạo kết tủa Cu₂O đỏ gạch; phản ứng iodoform tạo kết tủa vàng CHI₃.", tags: ["Bài 23", "Tollens", "Iodoform"] },
    { n: 32, s: 2, t: "Bài 24 · Carboxylic acid – Cấu tạo & Tính acid", d: "Nhóm carboxyl -COOH; tính acid mạnh hơn acid vô cơ yếu; phản ứng với kim loại, oxide base, base và muối carbonate.", tags: ["Bài 24", "Acid carboxylic"] },
    { n: 33, s: 2, t: "Bài 24 · Phản ứng Ester hóa & Ứng dụng", d: "Phản ứng ester hóa giữa carboxylic acid và alcohol (thuận nghịch, xúc tác H₂SO₄ đặc); tính hằng số cân bằng và hiệu suất ester hóa.", tags: ["Bài 24", "Ester hóa"] },
    { n: 34, s: 2, t: "Bài 25 · Ôn tập Chương 6", d: "Mạch liên kết: Alcohol ↔ Carbonyl ↔ Carboxylic acid ↔ Ester; bộ câu hỏi trắc nghiệm đúng/sai tổng hợp định lượng.", tags: ["Bài 25", "Ôn tập"], m: "Checkpoint 6 · Kiểm tra Chương 6" },
    { n: 35, s: 2, t: "Tổng ôn Hóa học 11 & Thi thử cuối năm", d: "Làm đề thi thử tổng hợp toàn bộ chương trình Hóa 11, đánh giá sự tiến bộ và chuẩn bị hành trang bứt phá cho Hóa học 12!", tags: ["Tổng ôn", "Đề tổng hợp"], m: "Tổng kết năm học · Sẵn sàng lên 12" }
  ],
  chapters: [
    {
      id: "c1",
      code: "Chương 1",
      title: "Cân bằng hóa học",
      group: "Vô cơ & Đại cương",
      symbol: "K",
      atomicNumber: 19,
      priority: 3,
      meta: "11 tiết · Bài 1–3",
      summary: "Cốt lõi hằng số cân bằng Kc, nguyên lý Le Chatelier, thang đo pH và cân bằng acid - base trong dung dịch nước. Đây là nền tảng tính toán cho toàn cấp 3.",
      lessons: [
        {
          id: "11-b1",
          no: 1,
          title: "Khái niệm về cân bằng hóa học",
          week: 1,
          hours: 4,
          sub: "4 tiết theo khung phân phối",
          keyPoints: [
            "Phân biệt phản ứng một chiều (→) và thuận nghịch (⇌); cân bằng hóa học là cân bằng động",
            "Biểu thức hằng số cân bằng Kc chỉ phụ thuộc nhiệt độ; chất rắn không xuất hiện trong biểu thức Kc",
            "Nguyên lý Le Chatelier: Khi thay đổi T, P, C, hệ tự chuyển dịch theo chiều làm giảm tác động đó (Mẹo: Tăng thu - Giảm tỏa)"
          ],
          forms: [
            { name: "Nhận diện phản ứng thuận nghịch và đặc điểm cân bằng động", tier: "nen", parts: ["I"], tip: "Cân bằng không dừng lại mà tốc độ thuận bằng tốc độ nghịch (vt = vn > 0)" },
            { name: "Viết biểu thức hằng số cân bằng Kc cho hệ đồng thể và dị thể", tier: "nen", parts: ["I"], tip: "Tuyệt đối không đưa nồng độ chất rắn nguyên chất (C, CaCO₃...) vào biểu thức Kc" },
            { name: "Dự đoán chiều chuyển dịch cân bằng theo nhiệt độ, áp suất, nồng độ", tier: "nang", parts: ["I", "II"], tip: "Tăng áp suất cân bằng chuyển dịch theo chiều giảm số mol khí; Tăng nhiệt độ chuyển dịch theo chiều thu nhiệt (ΔrHo > 0)" },
            { name: "Tính nồng độ các chất tại thời điểm cân bằng và hiệu suất phản ứng", tier: "top", parts: ["III"], tip: "Lập bảng 3 dòng: Ban đầu - Phản ứng - Cân bằng (I-C-E) để giải gọn gàng không bị nhầm" }
          ]
        },
        {
          id: "11-b2",
          no: 2,
          title: "Cân bằng trong dung dịch nước",
          week: 3,
          hours: 6,
          sub: "6 tiết theo khung phân phối",
          keyPoints: [
            "Thuyết acid - base của Brønsted - Lowry: Acid nhường H+, Base nhận H+",
            "Tích số ion của nước Kw = [H+][OH-] = 1,0×10⁻¹⁴ (ở 25 °C); thang pH = -log[H+]",
            "Hằng số phân li acid Ka, base Kb: Ka càng lớn thì tính acid càng mạnh",
            "Chuẩn độ acid - base bằng dung dịch chuẩn với chỉ thị phenolphthalein hoặc methyl da cam"
          ],
          forms: [
            { name: "Tính pH của dung dịch acid mạnh và base mạnh", tier: "nen", parts: ["I"], tip: "Acid mạnh: [H+] = C_acid × số H; Base mạnh: tính [OH-] → pOH → pH = 14 - pOH" },
            { name: "Tính nồng độ ion và pH của acid yếu, base yếu qua hằng số Ka, Kb", tier: "nang", parts: ["I", "III"], tip: "Dùng công thức gần đúng [H+] ≈ √(Ka × Co) khi độ điện li α < 0,05" },
            { name: "Bài toán pha loãng dung dịch và chuẩn độ acid - base", tier: "nang", parts: ["II", "III"], tip: "Bẫy đề thi: Pha loãng dung dịch acid vô hạn thì pH tiến dần về 7, không bao giờ vượt quá 7!" },
            { name: "Bài toán tổng hợp nhiều cân bằng và dung dịch đệm", tier: "top", parts: ["III"], tip: "Sử dụng định luật bảo toàn điện tích và bảo toàn nồng độ đầu để lập hệ phương trình" }
          ]
        },
        {
          id: "11-b3",
          no: 3,
          title: "Ôn tập chương 1",
          week: 6,
          hours: 1,
          sub: "1 tiết theo khung phân phối",
          keyPoints: [
            "Hệ thống hóa mối liên kết: Phản ứng thuận nghịch → Hằng số Kc → Nguyên lý chuyển dịch → Dung dịch nước & pH",
            "Bảng tổng kết thuốc thử chỉ thị màu: Quỳ tím, phenolphthalein và giấy đo pH"
          ],
          forms: [
            { name: "Trắc nghiệm lý thuyết tổng hợp Chương 1", tier: "nen", parts: ["I"], tip: "Làm đề luyện tập 20 câu trên EduPortal để củng cố các định nghĩa quan trọng" },
            { name: "Chuỗi câu hỏi đúng/sai đa mệnh đề về cân bằng & pH", tier: "nang", parts: ["II"], tip: "Đọc kĩ từng mệnh đề nhỏ: chú ý từ khóa 'tất cả', 'chỉ khi', 'luôn luôn'" },
            { name: "Đề mini test 30 phút chuẩn cấu trúc đề thi mới", tier: "top", parts: ["I", "II", "III"], tip: "Luyện bấm giờ trực tiếp trên website để rèn kỹ năng kiểm soát thời gian thi" }
          ]
        }
      ]
    },
    {
      id: "c2",
      code: "Chương 2",
      title: "Nitrogen – Sulfur",
      group: "Vô cơ phi kim",
      symbol: "N",
      atomicNumber: 7,
      priority: 3,
      meta: "10 tiết · Bài 4–9",
      summary: "Khám phá các hợp chất vô cơ quan trọng: Nitrogen, Ammonia, các oxide NOx, Sulfur, khí SO₂ và H₂SO₄ đặc nóng oxi hóa cực mạnh.",
      lessons: [
        {
          id: "11-b4",
          no: 4,
          title: "Nitrogen",
          week: 7,
          hours: 1,
          sub: "1 tiết",
          keyPoints: [
            "Cấu hình electron nguyên tử N (Z=7): 1s² 2s² 2p³; phân tử N₂ có liên kết ba N≡N với năng lượng liên kết rất lớn (945 kJ/mol)",
            "Ở nhiệt độ thường N₂ khá trơ về mặt hóa học; ở nhiệt độ cao hoặc có tia lửa điện mới phản ứng",
            "N₂ thể hiện tính oxi hóa (tác dụng H₂, kim loại mạnh) và tính khử (tác dụng O₂ ở 3000 °C)"
          ],
          forms: [
            { name: "Cấu tạo phân tử, liên kết ba và tính chất vật lí của Nitrogen", tier: "nen", parts: ["I"], tip: "Năng lượng liên kết ba rất lớn giải thích vì sao N₂ chiếm 78% khí quyển mà không tự cháy" },
            { name: "Phản ứng oxi hóa - khử của Nitrogen với kim loại (Li, Mg) và phi kim", tier: "nang", parts: ["I", "II"], tip: "Lưu ý phản ứng đặc biệt: N₂ tác dụng với Lithium (Li) ngay ở nhiệt độ thường tạo Li₃N" }
          ]
        },
        {
          id: "11-b5",
          no: 5,
          title: "Ammonia – Muối ammonium",
          week: 7,
          hours: 2,
          sub: "2 tiết",
          keyPoints: [
            "Phân tử NH₃ có cấu trúc hình chóp tam giác, còn 1 cặp electron tự do trên nguyên tử N → tính base yếu và khả năng tạo phức",
            "NH₃ tan cực tốt trong nước nhờ tạo liên kết hydrogen (1 lít nước hòa tan khoảng 800 lít NH₃)",
            "Tính khử mạnh của NH₃ do N có số oxi hóa -3 thấp nhất; tác dụng O₂, Cl₂, CuO",
            "Muối ammonium (NH₄⁺) đều dễ tan, kém bền nhiệt (bị nhiệt phân thành NH₃ hoặc các sản phẩm khác)"
          ],
          forms: [
            { name: "Tính base của NH₃ và phản ứng nhận biết ion NH₄⁺", tier: "nen", parts: ["I"], tip: "Nhận biết ion NH₄⁺: cho tác dụng NaOH nóng → sinh khí mùi khai làm quỳ tím ẩm hóa xanh" },
            { name: "Tính khử của NH₃ và phản ứng tạo phức chất với ion kim loại", tier: "nang", parts: ["I", "II"], tip: "Dung dịch NH₃ hòa tan kết tủa Cu(OH)₂ tạo dung dịch phức chất màu xanh lam thẫm" },
            { name: "Bài toán nhiệt phân muối ammonium và tính hiệu suất tổng hợp NH₃", tier: "top", parts: ["III"], tip: "Áp dụng định luật Dalton và tỉ khối khí để tính nhanh độ giảm thể tích phản ứng tổng hợp NH₃" }
          ]
        },
        {
          id: "11-b6",
          no: 6,
          title: "Hợp chất của nitrogen với oxygen & Mưa acid",
          week: 9,
          hours: 2,
          sub: "2 tiết",
          keyPoints: [
            "Khí NO không màu, dễ bị oxi hóa trong không khí ở điều kiện thường tạo khí NO₂ màu nâu đỏ",
            "Nguồn gốc phát thải NOx từ động cơ giao thông, nhà máy nhiệt điện và sấm sét",
            "Cơ chế hình thành mưa acid: NOx và SO₂ bị oxi hóa thành HNO₃ và H₂SO₄ hòa tan trong nước mưa (pH < 5,6)"
          ],
          forms: [
            { name: "Nhận biết khí NO, NO₂ và giải thích hiện tượng hóa nâu trong không khí", tier: "nen", parts: ["I"], tip: "2NO (không màu) + O₂ → 2NO₂ (nâu đỏ), phản ứng xảy ra ngay tức khắc ở nhiệt độ phòng" },
            { name: "Chuỗi chuyển hóa Nitrogen trong tự nhiên và công nghiệp sản xuất HNO₃", tier: "nang", parts: ["I", "II"], tip: "Sơ đồ 3 giai đoạn sản xuất HNO₃ từ NH₃: NH₃ → NO → NO₂ → HNO₃" },
            { name: "Bài toán tính toán nồng độ và pH của lượng nước mưa acid", tier: "top", parts: ["III"], tip: "Quy đổi các oxide NOx về số mol H+ sinh ra để tính toán chuẩn xác pH" }
          ]
        },
        {
          id: "11-b7",
          no: 7,
          title: "Sulfur và sulfur dioxide",
          week: 10,
          hours: 2,
          sub: "2 tiết",
          keyPoints: [
            "Đơn chất Sulfur có 2 dạng thù hình (S_alpha và S_beta); số oxi hóa trung gian 0 nên vừa có tính oxi hóa vừa có tính khử",
            "SO₂ là khí không màu, mùi hắc độc hại; là acidic oxide tan trong nước tạo H₂SO₃ (acid yếu)",
            "SO₂ vừa có tính khử (làm mất màu dung dịch Br₂, KMnO₄) vừa có tính oxi hóa (tác dụng với H₂S tạo S vàng)"
          ],
          forms: [
            { name: "Tính chất hóa học của đơn chất Sulfur và phản ứng với Hg", tier: "nen", parts: ["I"], tip: "Thủy ngân (Hg) độc rơi vãi được thu hồi an toàn bằng cách rắc bột lưu huỳnh ở nhiệt độ thường!" },
            { name: "Phản ứng chứng minh tính oxi hóa và tính khử của SO₂", tier: "nang", parts: ["I", "II"], tip: "Mất màu dung dịch bromine: SO₂ + Br₂ + 2H₂O → 2HBr + H₂SO₄ (chứng minh tính khử của SO₂)" },
            { name: "Bài toán sục khí SO₂ vào dung dịch kiềm (NaOH, Ca(OH)₂)", tier: "top", parts: ["III"], tip: "Lập tỉ lệ T = n_OH- / n_SO₂: T ≤ 1 tạo HSO₃⁻; 1 < T < 2 tạo 2 muối; T ≥ 2 tạo SO₃²⁻" }
          ]
        },
        {
          id: "11-b8",
          no: 8,
          title: "Sulfuric acid và muối sulfate",
          week: 11,
          hours: 2,
          sub: "2 tiết",
          keyPoints: [
            "H₂SO₄ loãng có đầy đủ tính chất chung của một acid mạnh",
            "H₂SO₄ đặc có tính oxi hóa rất mạnh (tác dụng hầu hết kim loại trừ Au, Pt tạo SO₂, S, H₂S) và tính háo nước cực mạnh",
            "Nguyên tắc pha loãng acid: Rót từ từ acid đặc vào nước và khuấy đều, tuyệt đối KHÔNG làm ngược lại",
            "Thuốc thử nhận biết ion sulfate SO₄²⁻: dung dịch muối Ba²⁺ tạo kết tủa trắng BaSO₄ không tan trong acid mạnh"
          ],
          forms: [
            { name: "Nhận biết muối sulfate bằng dung dịch chứa ion Ba²⁺", tier: "nen", parts: ["I"], tip: "BaSO₄ kết tủa trắng bền vững không tan cả trong HCl, HNO₃ loãng" },
            { name: "Phản ứng của H₂SO₄ đặc nóng với kim loại, phi kim (C, S, P)", tier: "nang", parts: ["I", "II"], tip: "Fe, Al, Cr bị thụ động hóa trong H₂SO₄ đặc nguội và HNO₃ đặc nguội" },
            { name: "Bảo toàn electron và bảo toàn nguyên tố S trong bài toán H₂SO₄ đặc", tier: "top", parts: ["III"], tip: "Công thức tính nhanh: n_H₂SO₄ phản ứng = 2n_SO₂ + 4n_S + 5n_H₂S + ... giúp giải bài trong 30 giây" }
          ]
        },
        {
          id: "11-b9",
          no: 9,
          title: "Ôn tập chương 2",
          week: 12,
          hours: 1,
          sub: "1 tiết",
          keyPoints: [
            "Sơ đồ chuỗi biến hóa của Nitrogen và Sulfur",
            "Bảng phân biệt các chất khí thường gặp: N₂, NH₃, NO, NO₂, SO₂, H₂S"
          ],
          forms: [
            { name: "Trắc nghiệm tổng hợp lý thuyết Nitrogen – Sulfur", tier: "nen", parts: ["I"], tip: "Thực hành ngay bộ đề 25 câu trên EduPortal để rà soát toàn bộ hiện tượng thí nghiệm" },
            { name: "Câu hỏi đúng/sai đa mệnh đề về tính chất hóa học và môi trường", tier: "nang", parts: ["II"], tip: "Chú ý phân biệt tác nhân gây mưa acid (SO₂, NOx) và tác nhân gây hiệu ứng nhà kính (CO₂, CH₄)" },
            { name: "Đề kiểm tra 45 phút tổng ôn Chương 2 có bấm giờ", tier: "top", parts: ["I", "II", "III"], tip: "Tự kiểm tra trên web để xem hệ thống phân tích báo cáo điểm mạnh/điểm yếu chi tiết" }
          ]
        }
      ]
    },
    {
      id: "c3",
      code: "Chương 3",
      title: "Đại cương về hóa học hữu cơ",
      group: "Nền tảng hữu cơ",
      symbol: "C",
      atomicNumber: 6,
      priority: 3,
      meta: "11 tiết · Bài 10–14",
      summary: "Xây dựng bệ phóng vững chắc cho toàn bộ hóa học hữu cơ: phân loại chất, phương pháp tách chiết, phổ khối lượng MS và cách suy luận đồng phân cấu tạo.",
      lessons: [
        {
          id: "11-b10",
          no: 10,
          title: "Hợp chất hữu cơ và hóa học hữu cơ",
          week: 13,
          hours: 3,
          sub: "3 tiết",
          keyPoints: [
            "Hợp chất hữu cơ là hợp chất của carbon (trừ CO, CO₂, muối carbonate, cyanide, carbide...)",
            "Đặc điểm liên kết: chủ yếu là liên kết cộng hóa trị; nhiệt độ nóng chảy và nhiệt độ sôi thấp hơn hợp chất vô cơ",
            "Phân loại: Hydrocarbon (chỉ chứa C, H) và Dẫn xuất của hydrocarbon (chứa thêm O, N, S, halogen...)",
            "Khái niệm nhóm chức: nguyên tử hoặc nhóm nguyên tử gây ra những tính chất hóa học đặc trưng"
          ],
          forms: [
            { name: "Phân loại hợp chất hữu cơ và dẫn xuất hydrocarbon", tier: "nen", parts: ["I"], tip: "Ghi nhớ các ngoại lệ không phải hữu cơ: CO, CO₂, H₂CO₃, muối cacbonat, Al₄C₃, CaC₂..." },
            { name: "Nhận diện các nhóm chức: -OH, -CHO, -COOH, -COO-, -NH₂", tier: "nang", parts: ["I", "II"], tip: "Mỗi nhóm chức quyết định một 'tính cách' phản ứng hóa học riêng biệt của phân tử" }
          ]
        },
        {
          id: "11-b11",
          no: 11,
          title: "Phương pháp tách biệt và tinh chế hợp chất hữu cơ",
          week: 14,
          hours: 2,
          sub: "2 tiết",
          keyPoints: [
            "Chưng cất: dựa vào sự khác nhau về nhiệt độ sôi giữa các chất trong hỗn hợp lỏng",
            "Chiết: dựa vào sự hòa tan khác nhau của các chất trong hai dung môi không trộn lẫn vào nhau (dùng phễu chiết)",
            "Kết tinh: dựa vào độ tan khác nhau của chất rắn trong dung môi thay đổi theo nhiệt độ",
            "Sắc kí cột: dựa vào sự hấp phụ và hòa tan khác nhau của các chất giữa pha tĩnh và pha động"
          ],
          forms: [
            { name: "Lựa chọn phương pháp tách biệt phù hợp theo tính chất vật lí", tier: "nen", parts: ["I"], tip: "Tách rượu khỏi nước: chưng cất; Tách dầu ăn nổi trên nước: chiết; Thu tinh thể đường: kết tinh" },
            { name: "Đọc sơ đồ thí nghiệm chưng cất thường và sử dụng phễu chiết", tier: "nang", parts: ["I", "II"], tip: "Lưu ý vị trí đặt nhiệt kế trong bình chưng cất: ngang nhánh ống dẫn hơi để đo đúng nhiệt độ sôi" }
          ]
        },
        {
          id: "11-b12",
          no: 12,
          title: "Công thức phân tử hợp chất hữu cơ",
          week: 15,
          hours: 3,
          sub: "3 tiết",
          keyPoints: [
            "Công thức đơn giản nhất (CTĐGN): biểu thị tỉ lệ số nguyên tử các nguyên tố nguyên tối giản",
            "Thiết lập CTĐGN: x : y : z : t = (%mC/12) : (%mH/1) : (%mO/16) : (%mN/14)",
            "Xác định khối lượng mol phân tử (M) dựa vào phổ khối lượng (MS): pic ion phân tử [M+] thường là pic có giá trị m/z lớn nhất"
          ],
          forms: [
            { name: "Tìm công thức đơn giản nhất từ kết quả phân tích nguyên tố", tier: "nen", parts: ["I"], tip: "Luôn kiểm tra %mO = 100% - (%mC + %mH + %mN) trước khi lập tỉ lệ" },
            { name: "Đọc phổ khối lượng (MS) để xác định phân tử khối chính xác", tier: "nang", parts: ["I", "II"], tip: "Dạng mới trong đề thi: nhìn pic ngoài cùng bên phải trên biểu đồ MS để lấy trực tiếp M" },
            { name: "Bài toán kết hợp số liệu đốt cháy định lượng và phổ MS", tier: "top", parts: ["III"], tip: "n_C = n_CO₂; n_H = 2n_H₂O; bảo toàn nguyên tố O để tìm n_O trong hợp chất" }
          ]
        },
        {
          id: "11-b13",
          no: 13,
          title: "Cấu tạo hóa học hợp chất hữu cơ",
          week: 16,
          hours: 2,
          sub: "2 tiết",
          keyPoints: [
            "Thuyết cấu tạo hóa học: Các nguyên tử liên kết theo đúng hóa trị (C hóa trị IV, H hóa trị I, O hóa trị II, N hóa trị III)",
            "Đồng phân cấu tạo: Cùng CTPT nhưng khác nhau về trật tự liên kết (mạch C, vị trí nhóm chức, loại nhóm chức)",
            "Đồng phân hình học: Điều kiện cần và đủ là có liên kết đôi C=C và mỗi carbon mang 2 nhóm thế khác nhau (a ≠ b và c ≠ d)"
          ],
          forms: [
            { name: "Biểu diễn công thức cấu tạo: dạng khai triển, thu gọn và khung phân tử", tier: "nen", parts: ["I"], tip: "Làm quen với công thức khung phân tử ziczac thường xuất hiện trong đề thi tốt nghiệp mới" },
            { name: "Đếm số lượng đồng phân cấu tạo và xác định đồng phân hình học cis - trans", tier: "nang", parts: ["I", "II"], tip: "Mẹo nhớ cis - trans: Nhóm thế lớn cùng phía là cis, khác phía qua trục liên kết đôi là trans" },
            { name: "Suy luận cấu tạo hóa học từ tính chất và tín hiệu phổ hồng ngoại IR", tier: "top", parts: ["I", "II"], tip: "Phổ IR: pic rộng 3200-3600 cm⁻¹ là nhóm -OH; pic nhọn 1700 cm⁻¹ là nhóm carbonyl C=O" }
          ]
        },
        {
          id: "11-b14",
          no: 14,
          title: "Ôn tập chương 3",
          week: 17,
          hours: 1,
          sub: "1 tiết",
          keyPoints: [
            "Sơ đồ tư duy xuyên suốt: Phân tích nguyên tố → CTĐGN → Phổ MS → CTPT → Đồng phân CTCT",
            "Tổng kết các bẫy đề thi về đồng đẳng và đồng phân"
          ],
          forms: [
            { name: "Trắc nghiệm tổng hợp đại cương hóa học hữu cơ", tier: "nen", parts: ["I"], tip: "Kiểm tra kỹ năng đọc phổ MS và IR trên hệ thống trắc nghiệm của EduPortal" },
            { name: "Đề tổng hợp tự luyện cuối Học kỳ I chuẩn bị thi chính thức", tier: "nang", parts: ["I", "II", "III"], tip: "Rèn luyện bài thi đầy đủ 3 phần để đạt điểm tối đa trong kỳ thi học kì trường" }
          ]
        }
      ]
    },
    {
      id: "c4",
      code: "Chương 4",
      title: "Hydrocarbon",
      group: "Hydrocarbon",
      symbol: "HC",
      atomicNumber: null,
      priority: 3,
      meta: "12 tiết · Bài 15–18",
      summary: "Khảo sát toàn diện họ hydrocarbon: Alkane no, Alkene & Alkyne không no (phản ứng cộng theo Markovnikov) và Arene nhân thơm đặc trưng.",
      lessons: [
        {
          id: "11-b15",
          no: 15,
          title: "Alkane (Hydrocarbon no)",
          week: 19,
          hours: 4,
          sub: "4 tiết",
          keyPoints: [
            "Công thức chung CnH2n+2 (n ≥ 1), mạch hở, chỉ chứa liên kết đơn C-C và C-H bền vững (liên kết sigma σ)",
            "Quy tắc gọi tên IUPAC: Số chỉ vị trí nhánh - Tên nhánh + Tên mạch chính + ane",
            "Phản ứng đặc trưng là thế halogen (Cl₂, Br₂ chiếu sáng), ưu tiên thế H ở carbon bậc cao hơn",
            "Phản ứng cracking bẻ gãy mạch carbon và phản ứng cháy tỏa nhiều nhiệt (n_H2O > n_CO2)"
          ],
          forms: [
            { name: "Gọi tên danh pháp IUPAC các đồng phân alkane mạch phân nhánh", tier: "nen", parts: ["I"], tip: "Chọn mạch chính dài nhất và có nhiều nhánh nhất; đánh số từ đầu gần nhánh hơn" },
            { name: "Dự đoán sản phẩm chính của phản ứng thế halogen tỉ lệ mol 1:1", tier: "nang", parts: ["I", "II"], tip: "Nguyên tắc thế: Carbon bậc càng cao, nguyên tử H càng linh động và ưu tiên bị thế (sản phẩm chính)" },
            { name: "Bài toán định lượng phản ứng đốt cháy alkane: n_alkane = n_H₂O - n_CO₂", tier: "nang", parts: ["III"], tip: "Tỉ lệ số C trung bình = n_CO₂ / n_hỗn_hợp giúp xác định nhanh công thức phân tử kế tiếp" },
            { name: "Bài toán cracking alkane và bảo toàn khối lượng", tier: "top", parts: ["III"], tip: "Khối lượng trước và sau cracking luôn bằng nhau; số mol tăng lên chính là số mol alkane đã cracking" }
          ]
        },
        {
          id: "11-b16",
          no: 16,
          title: "Hydrocarbon không no (Alkene & Alkyne)",
          week: 21,
          hours: 4,
          sub: "4 tiết",
          keyPoints: [
            "Alkene CnH2n (n ≥ 2) có 1 liên kết đôi C=C (1σ + 1π); Alkyne CnH2n-2 (n ≥ 2) có 1 liên kết ba C≡C (1σ + 2π)",
            "Liên kết π kém bền dễ tham gia phản ứng cộng (H₂, Br₂, HX, H₂O) làm mất màu nước bromine",
            "Quy tắc Markovnikov khi cộng tác nhân bất đối xứng HX vào alkene bất đối xứng: H ưu tiên cộng vào C mang nhiều H hơn",
            "Alk-1-yne có liên kết ba đầu mạch tác dụng với dung dịch AgNO₃/NH₃ tạo kết tủa vàng nhạt"
          ],
          forms: [
            { name: "Danh pháp thay thế IUPAC của alkene, alkyne và nhận diện đồng phân hình học", tier: "nen", parts: ["I"], tip: "Đánh số mạch chính từ đầu gần liên kết bội (đôi/ba) hơn, ưu tiên hơn nhánh" },
            { name: "Dự đoán sản phẩm chính/phụ theo quy tắc Markovnikov khi cộng HX", tier: "nang", parts: ["I", "II"], tip: "Câu thần chú: 'Giàu càng thêm giàu' - H cộng vào carbon có sẵn nhiều H hơn!" },
            { name: "Phản ứng nhận biết alkene, alkyne bằng nước Br₂, KMnO₄ và AgNO₃/NH₃", tier: "nang", parts: ["I", "II"], tip: "Alk-1-yne (như acetylene, propyne) tạo kết tủa vàng nhạt với AgNO₃/NH₃; alk-2-yne thì KHÔNG" },
            { name: "Bài toán bảo toàn liên kết π và hỗn hợp hydrocarbon qua bình nước bromine", tier: "top", parts: ["III"], tip: "Độ tăng khối lượng bình brom = khối lượng hydrocarbon không no bị giữ lại; n_π = n_Br₂ + n_H₂" }
          ]
        },
        {
          id: "11-b17",
          no: 17,
          title: "Arene (Hydrocarbon thơm)",
          week: 23,
          hours: 3,
          sub: "3 tiết",
          keyPoints: [
            "Cấu tạo vòng benzene đặc trưng với hệ liên hợp 6 electron π trải đều trên 6 nguyên tử carbon",
            "Tính chất thơm: Dễ thế, khó cộng và bền vững với chất oxi hóa thông thường",
            "Quy tắc thế vào nhân thơm của alkylbenzene (toluene): ưu tiên thế vào vị trí ortho (o-) và para (p-)",
            "Nhánh alkyl bị oxi hóa bởi dung dịch KMnO₄ đun nóng tạo muối benzoate (nhận biết toluene)"
          ],
          forms: [
            { name: "Cấu tạo phân tử, danh pháp của benzene, toluene, xylene và styrene", tier: "nen", parts: ["I"], tip: "Styrene có liên kết đôi C=C ở mạch nhánh nên vừa làm mất màu nước brom vừa có tính thơm" },
            { name: "Phản ứng thế halogen (Fe/t°) và phản ứng nitro hóa (H₂SO₄ đặc) của toluene", tier: "nang", parts: ["I", "II"], tip: "Nhóm alkyl (-CH₃) định hướng thế vào vị trí o- và p-; xúc tác ánh sáng thì thế vào nhánh CH₃" },
            { name: "Phân biệt benzene, toluene, styrene bằng thuốc thử dung dịch KMnO₄", tier: "top", parts: ["I", "II"], tip: "Benzene: không mất màu; Toluene: mất màu khi đun nóng; Styrene: mất màu ngay ở nhiệt độ phòng!" }
          ]
        },
        {
          id: "11-b18",
          no: 18,
          title: "Ôn tập chương 4",
          week: 24,
          hours: 1,
          sub: "1 tiết",
          keyPoints: [
            "Bảng ma trận so sánh toàn diện: Alkane (thế σ) vs Alkene/Alkyne (cộng π) vs Arene (thế nhân thơm)",
            "Sơ đồ chuyển hóa qua lại giữa các hidrocacbon trong công nghiệp hóa dầu"
          ],
          forms: [
            { name: "Trắc nghiệm tổng hợp so sánh cấu tạo và phản ứng của các hydrocarbon", tier: "nen", parts: ["I"], tip: "Luyện đề phân loại hydrocarbon trên EduPortal để tự động nhận dạng nhanh các phản ứng" },
            { name: "Chuỗi biến hóa hóa học liên hoàn từ alkane đến arene", tier: "nang", parts: ["I", "II"], tip: "Ví dụ: Methane → Acetylene → Benzene → Chlorobenzene / Nitrobenzene" },
            { name: "Đề mini test 30 câu trắc nghiệm đúng/sai và trả lời ngắn", tier: "top", parts: ["I", "II", "III"], tip: "Thử sức với các câu hỏi thực tế về chỉ số octane của xăng dầu và khí thiên nhiên" }
          ]
        }
      ]
    },
    {
      id: "c5",
      code: "Chương 5",
      title: "Dẫn xuất halogen – Alcohol – Phenol",
      group: "Hợp chất chứa oxy & Halogen",
      symbol: "OH",
      atomicNumber: null,
      priority: 3,
      meta: "9 tiết · Bài 19–22",
      summary: "Nhóm chức chứa liên kết phân cực: Dẫn xuất halogen (phản ứng thế/tách theo quy tắc Zaitsev), Alcohol (liên kết hydrogen, polyalcohol) và Phenol (tính acid yếu).",
      lessons: [
        {
          id: "11-b19",
          no: 19,
          title: "Dẫn xuất halogen",
          week: 25,
          hours: 2,
          sub: "2 tiết",
          keyPoints: [
            "Thay thế nguyên tử H trong phân tử hydrocarbon bằng nguyên tử halogen (F, Cl, Br, I)",
            "Liên kết C-X phân cực về phía halogen; phản ứng thế nhóm halogen bằng nhóm -OH (với dung dịch kiềm nóng)",
            "Phản ứng tách hydrogen halide (HX) trong môi trường kiềm rượu (KOH/ethanol, t°) tuân theo quy tắc Zaitsev: ưu tiên tách H ở carbon liền kề có bậc cao hơn"
          ],
          forms: [
            { name: "Danh pháp và xác định bậc của dẫn xuất halogen", tier: "nen", parts: ["I"], tip: "Bậc của dẫn xuất halogen bằng bậc của nguyên tử carbon liên kết trực tiếp với nguyên tử halogen" },
            { name: "Dự đoán sản phẩm chính của phản ứng tách HX theo quy tắc Zaitsev", tier: "nang", parts: ["I", "II"], tip: "Quy tắc Zaitsev: 'Nghèo càng nghèo hơn' - Tách H ở C kề có ít H hơn tạo alkene bền hơn!" },
            { name: "Chuỗi phản ứng tổng hợp từ hidrocacbon qua dẫn xuất halogen tạo alcohol", tier: "top", parts: ["II", "III"], tip: "Khâu trung gian quan trọng nhất để chuyển từ hydrocarbon sang các hợp chất có nhóm chức" }
          ]
        },
        {
          id: "11-b20",
          no: 20,
          title: "Alcohol (Ancol)",
          week: 26,
          hours: 4,
          sub: "4 tiết",
          keyPoints: [
            "Hợp chất hữu cơ có nhóm -OH liên kết trực tiếp với nguyên tử carbon no",
            "Liên kết hydrogen liên phân tử làm nhiệt độ sôi của alcohol cao hơn nhiều so với hydrocarbon có cùng phân tử khối",
            "Phản ứng thế H của nhóm -OH khi tác dụng với kim loại kiềm Na giải phóng H₂",
            "Phản ứng tách nước: ở 140 °C (H₂SO₄ đặc) tạo ether; ở 170 °C (H₂SO₄ đặc) tạo alkene theo quy tắc Zaitsev",
            "Oxi hóa không hoàn toàn bằng CuO (t°): Alcohol bậc 1 → Aldehyde; Alcohol bậc 2 → Ketone; Alcohol bậc 3 không phản ứng",
            "Polyalcohol có các nhóm -OH liền kề (Glycerol, Ethylene glycol) hòa tan Cu(OH)₂ tạo phức chất màu xanh lam thẫm"
          ],
          forms: [
            { name: "Danh pháp thay thế IUPAC, phân loại và xác định bậc alcohol", tier: "nen", parts: ["I"], tip: "Đánh số từ đầu gần nhóm -OH hơn; đuôi '-ol' kèm vị trí chỉ nhóm -OH" },
            { name: "Bài toán phản ứng của alcohol với kim loại kiềm Na giải phóng H₂", tier: "nang", parts: ["I", "III"], tip: "Số nhóm -OH = 2 × (n_H₂ / n_ancol); tăng giảm khối lượng m_muối = m_ancol + 22 × n_Na" },
            { name: "Phản ứng tách nước tạo ether (140 °C) và alkene (170 °C)", tier: "nang", parts: ["I", "II"], tip: "Hỗn hợp n alcohol tách nước ở 140 °C tạo tối đa n(n+1)/2 ether" },
            { name: "Phản ứng nhận biết polyalcohol bằng Cu(OH)₂ và bài toán oxi hóa qua CuO", tier: "top", parts: ["II", "III"], tip: "Độ tăng khối lượng chất rắn khi oxi hóa ancol bằng CuO: m_tăng = m_O phản ứng = 16 × n_ancol" }
          ]
        },
        {
          id: "11-b21",
          no: 21,
          title: "Phenol",
          week: 28,
          hours: 2,
          sub: "2 tiết",
          keyPoints: [
            "Phenol là hợp chất có nhóm -OH liên kết TRỰC TIẾP với nguyên tử carbon của vòng benzene",
            "Ảnh hưởng của vòng benzene lên nhóm -OH: liên kết O-H phân cực mạnh hơn alcohol → phenol có tính acid yếu (tác dụng NaOH, không đổi màu quỳ tím, yếu hơn H₂CO₃)",
            "Ảnh hưởng của nhóm -OH lên vòng thơm: hoạt hóa vị trí o- và p- → phản ứng thế với nước bromine tạo kết tủa trắng 2,4,6-tribromophenol ngay tức thì"
          ],
          forms: [
            { name: "Phân biệt cấu tạo phenol với alcohol thơm (benzyl alcohol)", tier: "nen", parts: ["I"], tip: "Benzyl alcohol C₆H₅CH₂OH có nhóm -OH gắn vào carbon no nên mang tính chất của alcohol, KHÔNG phản ứng NaOH" },
            { name: "Tính acid của phenol và phản ứng với dung dịch NaOH, sục khí CO₂", tier: "nang", parts: ["I", "II"], tip: "Sục CO₂ vào dung dịch sodium phenolate làm vẩn đục phenol: C₆H₅ONa + CO₂ + H₂O → C₆H₅OH + NaHCO₃" },
            { name: "Nhận biết phenol bằng nước bromine và bài toán hỗn hợp phenol + alcohol", tier: "top", parts: ["II", "III"], tip: "Phản ứng tạo kết tủa trắng tribromophenol rất nhạy, dùng nhận biết phenol định tính và định lượng" }
          ]
        },
        {
          id: "11-b22",
          no: 22,
          title: "Ôn tập chương 5",
          week: 29,
          hours: 1,
          sub: "1 tiết",
          keyPoints: [
            "Bảng thuốc thử nhận biết: Cu(OH)₂ (nhận polyalcohol có OH kề), Na (nhận nhóm -OH), NaOH (nhận phenol), Nước bromine (nhận phenol)",
            "So sánh tính acid: H₂CO₃ > Phenol > Nước > Alcohol"
          ],
          forms: [
            { name: "Trắc nghiệm nhận biết nhóm chức dẫn xuất halogen – alcohol – phenol", tier: "nen", parts: ["I"], tip: "Làm bài kiểm tra phân biệt nhóm chức trên EduPortal để tự tin không bị nhầm thuốc thử" },
            { name: "Chuỗi phản ứng tổng hợp hữu cơ liên hoàn giữa các nhóm chức", tier: "nang", parts: ["I", "II"], tip: "Alkene → Dẫn xuất halogen → Alcohol → Aldehyde / Alkene" },
            { name: "Bài toán định lượng hỗn hợp alcohol và phenol tác dụng với Na và NaOH", tier: "top", parts: ["III"], tip: "Chỉ có phenol tác dụng NaOH; cả hai đều tác dụng Na → Lập hệ phương trình 2 ẩn giải nhanh" }
          ]
        }
      ]
    },
    {
      id: "c6",
      code: "Chương 6",
      title: "Hợp chất carbonyl – Carboxylic acid",
      group: "Hợp chất Carbonyl & Acid",
      symbol: "COOH",
      atomicNumber: null,
      priority: 3,
      meta: "10 tiết · Bài 23–25",
      summary: "Khép lại chương trình Hóa 11 bằng các hợp chất có tính ứng dụng cao nhất: Aldehyde, Ketone, Carboxylic acid và phản ứng ester hóa quan trọng cho lớp 12.",
      lessons: [
        {
          id: "11-b23",
          no: 23,
          title: "Hợp chất carbonyl (Aldehyde & Ketone)",
          week: 30,
          hours: 4,
          sub: "4 tiết",
          keyPoints: [
            "Hợp chất chứa nhóm carbonyl >C=O: Aldehyde có nhóm -CH=O liên kết với H hoặc gốc hydrocarbon; Ketone có nhóm >C=O liên kết 2 gốc hydrocarbon",
            "Phản ứng cộng H₂ (khử bằng chất khử) tạo alcohol tương ứng (Aldehyde → Alcohol bậc 1; Ketone → Alcohol bậc 2)",
            "Phản ứng oxi hóa aldehyde: Với thuốc thử Tollens [Ag(NH₃)₂]OH tạo kết tủa gương bạc Ag sáng bóng; Với Cu(OH)₂ trong kiềm đun nóng tạo kết tủa Cu₂O đỏ gạch",
            "Phản ứng tạo iodoform (CHI₃ kết tủa vàng nhạt): đặc trưng cho các hợp chất có nhóm methyl carbonyl CH₃-C=O"
          ],
          forms: [
            { name: "Danh pháp IUPAC và tên thông thường của aldehyde, ketone", tier: "nen", parts: ["I"], tip: "Aldehyde: tên hydrocarbon + al (methanal = formaldehyde; ethanal = acetaldehyde); Ketone: đuôi -one" },
            { name: "Bài toán phản ứng tráng bạc của aldehyde đơn chức và formaldehyde", tier: "nang", parts: ["I", "III"], tip: "Aldehyde đơn chức RCHO → 2Ag; Riêng formaldehyde HCHO tráng bạc tạo 4Ag (tỉ lệ mol 1:4)!" },
            { name: "Phản ứng tạo iodoform nhận biết nhóm methyl carbonyl (CH₃-CO-)", tier: "nang", parts: ["I", "II"], tip: "Thuốc thử I₂/NaOH: acetaldehyde và các methyl ketone tạo kết tủa vàng CHI₃ có mùi sát trùng đặc trưng" },
            { name: "Bài toán hỗn hợp aldehyde tác dụng thuốc thử Tollens và Cu(OH)₂", tier: "top", parts: ["III"], tip: "Kết hợp định luật bảo toàn mol electron: n_Ag + 2n_Cu₂O = 2n_CHO phản ứng" }
          ]
        },
        {
          id: "11-b24",
          no: 24,
          title: "Carboxylic acid",
          week: 32,
          hours: 5,
          sub: "5 tiết",
          keyPoints: [
            "Chứa nhóm carboxyl -COOH liên kết với H hoặc gốc hydrocarbon; nhiệt độ sôi cao nhất trong các nhóm chức cùng C nhờ tạo liên kết hydrogen dạng dimer",
            "Có tính acid rõ rệt: làm quỳ tím hóa đỏ, tác dụng kim loại trước H, oxide base, base và giải phóng CO₂ từ muối carbonate",
            "Phản ứng ester hóa: Phản ứng giữa carboxylic acid và alcohol với xúc tác H₂SO₄ đặc đun nóng (phản ứng thuận nghịch)",
            "Ứng dụng thực tiễn: Acetic acid CH₃COOH làm giấm ăn (nồng độ 2–5%), nguyên liệu tổng hợp tơ sợi phẩm nhuộm"
          ],
          forms: [
            { name: "Danh pháp IUPAC, tên thông thường và tính chất vật lí của acid", tier: "nen", parts: ["I"], tip: "HCOOH: Formic acid (kiến cắn); CH₃COOH: Acetic acid; C₂H₅COOH: Propionic acid; C₃H₇COOH: Butyric acid" },
            { name: "Tính acid: phản ứng với kim loại, base, muối carbonate giải phóng CO₂", tier: "nang", parts: ["I", "III"], tip: "Acid carboxylic hòa tan CaCO₃ sủi bọt khí CO₂ mãnh liệt: 2RCOOH + CaCO₃ → (RCOO)₂Ca + CO₂↑ + H₂O" },
            { name: "Phản ứng ester hóa: tính hằng số cân bằng Kc và hiệu suất phản ứng", tier: "nang", parts: ["II", "III"], tip: "Nguyên tắc ester hóa: Nhóm -OH tách ra từ acid, nguyên tử H tách ra từ alcohol!" },
            { name: "Chuỗi biến hóa hữu cơ liên hoàn: Carbonyl ↔ Acid ↔ Ester", tier: "top", parts: ["II", "III"], tip: "Cầu nối trực tiếp dẫn vào chương mở đầu Hóa học 12 (Ester - Lipid)" }
          ]
        },
        {
          id: "11-b25",
          no: 25,
          title: "Ôn tập chương 6 & Tổng kết Hóa 11",
          week: 34,
          hours: 1,
          sub: "1 tiết",
          keyPoints: [
            "Bản đồ chuỗi chuyển hóa hữu cơ toàn diện: Alkane → Dẫn xuất halogen → Alcohol → Aldehyde → Carboxylic acid → Ester",
            "Tổng kết các phản ứng nhận biết đặc trưng và các dạng bài toán bấm giờ trên EduPortal"
          ],
          forms: [
            { name: "Bộ câu hỏi trắc nghiệm đúng/sai tổng ôn Chương 6", tier: "nen", parts: ["I", "II"], tip: "Làm bài trên web để nắm chắc các dạng câu hỏi đúng sai 4 mệnh đề theo chuẩn Bộ GD&ĐT" },
            { name: "Chuỗi chuyển hóa hữu cơ 6 bước liên hoàn", tier: "nang", parts: ["I", "II"], tip: "Luyện phản xạ viết phương trình hóa học và điều kiện xúc tác nhiệt độ" },
            { name: "Đề thi thử tổng hợp toàn bộ Hóa học 11 bấm giờ 50 phút", tier: "top", parts: ["I", "II", "III"], tip: "Khảo sát năng lực toàn diện, chuẩn bị tâm thế tự tin nhất để bước vào lớp 12 bứt phá 8+!" }
          ]
        }
      ]
    }
  ]
}

function esc(str) {
  if (str === null || str === undefined) return ''
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;')
}

function norm(str) {
  return String(str || '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/đ/g, 'd')
}

function lv(tier, label) {
  const cls = tier === 'nen' ? 'nen' : (tier === 'nang' ? 'nang' : 'top')
  return `<span class="h12r__lv h12r__lv--${cls}">${esc(label)}</span>`
}

const PART_TITLE = {
  I: "Phần I · Trắc nghiệm nhiều lựa chọn",
  II: "Phần II · Đúng / Sai",
  III: "Phần III · Trả lời ngắn"
}

export function renderRoadmap11() {
  const M = ROADMAP_11_DATA.meta
  const chapters = ROADMAP_11_DATA.chapters
  const lessons = []
  chapters.forEach(c => c.lessons.forEach(l => lessons.push(l)))
  const totalForms = lessons.reduce((n, l) => n + l.forms.length, 0)
  const tierCount = { nen: 0, nang: 0, top: 0 }
  lessons.forEach(l => l.forms.forEach(f => { tierCount[f.tier]++ }))

  function tagOf(l) { return 'Bài ' + l.no }
  function hoursOfWeek(n) { return lessons.filter(l => l.week === n).reduce((s, l) => s + l.hours, 0) || 2 }

  // 1. HERO SECTION
  const heroHtml = `
    <header class="h12r__hero">
      <div class="h12r__wrap h12r__hero-grid">
        <div>
          <div class="h12r__badge" style="background:#f3e8ff; color:#7e22ce; border-color:#d8b4fe;">
            <i class="fa-solid fa-compass"></i> Bám sát khung chuẩn SGK Hóa học 11 Kết nối tri thức
          </div>
          <h1 class="h12r__h1">${esc(M.title)}</h1>
          <p class="h12r__lead">${esc(M.subtitle)}</p>
          <div class="h12r__cta">
            <button type="button" class="h12r__btn h12r__btn--pri" data-scroll="h11r-timeline" style="background:#1e293b; border-color:#1e293b;">
              <i class="fa-solid fa-timeline"></i> Khám phá lộ trình 35 tuần
            </button>
            <button type="button" class="h12r__btn h12r__btn--ghost" data-scroll="h11r-chapters">
              <i class="fa-solid fa-layer-group"></i> 6 chương & 25 bài học
            </button>
            <button type="button" class="h12r__btn h12r__btn--ghost" id="btn-hero-goto-trial-lessons">
              <i class="fa-solid fa-wand-magic-sparkles" style="color:#16a34a;"></i> Luyện bài học thử
            </button>
          </div>
          <div class="h12r__stats">
            <div class="h12r__stat"><b>${M.durationWeeks}</b><span>tuần học</span></div>
            <div class="h12r__stat"><b>${M.hoursRef}</b><span>tiết tham chiếu</span></div>
            <div class="h12r__stat"><b>${M.chaptersCount}</b><span>chương SGK</span></div>
            <div class="h12r__stat"><b>${totalForms}+</b><span>dạng câu hỏi</span></div>
          </div>
        </div>

        <!-- Right Side: Phân bổ thời lượng theo chương Card -->
        <div class="card" style="padding:24px; border-radius:20px; background:#ffffff; border:1px solid #dbeafe; box-shadow:0 10px 25px -5px rgba(2,132,199,0.08);">
          <div style="display:flex; justify-content:space-between; align-items:flex-start; margin-bottom:12px;">
            <div>
              <h3 style="font-size:16px; font-weight:800; color:#0f172a; margin:0 0 4px 0;">Phân bổ thời lượng theo chương trình</h3>
              <p style="font-size:13px; color:#64748b; margin:0;">Khung Kết nối tri thức (63 tiết nội dung + 7 tiết kiểm tra/đánh giá định kỳ).</p>
            </div>
            <span style="font-size:11px; font-weight:800; background:#eff6ff; color:#0284c7; padding:3px 8px; border-radius:12px; border:1px solid #bfdbfe; white-space:nowrap;">
              Chuẩn SGK
            </span>
          </div>

          <div style="display:grid; gap:12px; margin-top:16px;">
            ${M.distribution.map(d => `
              <div>
                <div style="display:flex; justify-content:space-between; font-size:13px; font-weight:700; margin-bottom:4px; color:#1e293b;">
                  <span>${esc(d.name)}</span>
                  <span style="color:#0284c7; font-weight:800;">${d.hours} tiết</span>
                </div>
                <div style="height:9px; background:#f1f5f9; border-radius:6px; overflow:hidden;">
                  <div style="height:100%; width:${d.pct}%; background:${d.color}; border-radius:6px; transition:width 0.6s ease;"></div>
                </div>
                <div style="font-size:11px; color:#64748b; margin-top:2px;">${esc(d.desc)}</div>
              </div>
            `).join('')}
          </div>
          <div style="margin-top:16px; padding-top:12px; border-top:1px dashed #e2e8f0; font-size:12px; color:#64748b; display:flex; align-items:center; gap:6px;">
            <i class="fa-solid fa-circle-info" style="color:#0284c7;"></i>
            <span>Giáo viên có thể chủ động điều chỉnh thứ tự bài giảng theo kế hoạch nhà trường.</span>
          </div>
        </div>
      </div>
    </header>
  `

  // 2. PHASES & 5-STEP METHOD SECTION
  const phasesHtml = `
    <section class="h12r__sec h12r__sec--white" id="h11r-overview">
      <div class="h12r__wrap">
        <div class="h12r__badge" style="background:#dbeafe; color:#1d4ed8; border-color:#93c5fd;">
          <i class="fa-solid fa-map"></i> Bản đồ học tập 2 chặng
        </div>
        <h2 class="h12r__h2">Chia môn Hóa 11 thành 2 chặng lớn</h2>
        <p class="h12r__intro">
          Thay vì học từng bài rời rạc, hãy nhìn môn học theo mạch phát triển xuyên suốt: Cân bằng & Dung dịch → Nitrogen/Sulfur → Nền tảng hữu cơ → Hydrocarbon → Dẫn xuất → Carbonyl và Acid.
        </p>

        <div style="display:grid; grid-template-columns:repeat(auto-fit, minmax(320px, 1fr)); gap:20px; margin-top:28px;">
          ${M.phases.map(p => `
            <div class="card" style="padding:22px; border-radius:16px; border:1px solid #cbd5e1; background:#ffffff;">
              <div style="display:flex; justify-content:space-between; align-items:flex-start; margin-bottom:10px;">
                <h3 style="font-size:16px; font-weight:800; color:#0f172a; margin:0;">${esc(p.name)}</h3>
                <span style="font-size:11px; font-weight:700; background:#e0f2fe; color:#0369a1; padding:3px 10px; border-radius:12px; white-space:nowrap;">
                  ${esc(p.weeksStr)}
                </span>
              </div>
              <p style="font-size:13px; color:#475569; line-height:1.5; margin:0 0 16px 0;">${esc(p.desc)}</p>
              <div style="display:grid; grid-template-columns:repeat(3, 1fr); gap:8px;">
                ${p.grid.map(g => `
                  <div style="background:#f8fafc; border:1px solid #e2e8f0; border-radius:10px; padding:10px 8px; text-align:center;">
                    <div style="width:28px; height:28px; border-radius:6px; background:#eff6ff; color:#0284c7; font-weight:800; font-size:11px; display:inline-flex; align-items:center; justify-content:center; margin-bottom:4px;">
                      ${esc(g.icon)}
                    </div>
                    <div style="font-weight:700; font-size:12px; color:#0f172a; white-space:nowrap; overflow:hidden; text-overflow:ellipsis;">${esc(g.title)}</div>
                    <div style="font-size:11px; color:#64748b; margin-top:2px;">${esc(g.detail.split('·')[0])}</div>
                  </div>
                `).join('')}
              </div>
            </div>
          `).join('')}
        </div>

        <!-- 5 Step Formula -->
        <div style="margin-top:48px;">
          <h3 style="font-size:20px; font-weight:800; color:#0f172a; margin:0 0 8px 0; text-align:center;">
            <i class="fa-solid fa-graduation-cap" style="color:#0284c7;"></i> Công thức 5 bước học chắc kiến thức trên EduPortal
          </h3>
          <p style="font-size:14px; color:#64748b; text-align:center; max-width:64ch; margin:0 auto 28px auto;">
            Quy trình khép kín giúp học sinh chuyển hóa kiến thức từ lý thuyết SGK thành phản xạ làm bài trắc nghiệm nhanh và chuẩn xác.
          </p>

          <div style="display:grid; grid-template-columns:repeat(auto-fit, minmax(200px, 1fr)); gap:14px;">
            ${M.methods.map((m, idx) => `
              <div class="card" style="padding:18px; border-radius:14px; border:1px solid #e2e8f0; background:#ffffff; position:relative;">
                <div style="width:32px; height:32px; border-radius:50%; background:#0f172a; color:#ffffff; font-weight:800; font-size:14px; display:flex; align-items:center; justify-content:center; margin-bottom:12px;">
                  ${m.no}
                </div>
                <h4 style="font-size:14px; font-weight:700; color:#0f172a; margin:0 0 6px 0;">${esc(m.title)}</h4>
                <p style="font-size:12.5px; color:#475569; line-height:1.5; margin:0;">${esc(m.desc)}</p>
              </div>
            `).join('')}
          </div>
        </div>

      </div>
    </section>
  `

  // 3. CURATED RESOURCES SECTION
  const resourcesHtml = `
    <section class="h12r__sec" id="h11r-resources" style="padding-top:40px; padding-bottom:40px;">
      <div class="h12r__wrap">
        <div class="h12r__badge" style="background:#dcfce7; color:#15803d; border-color:#86efac;">
          <i class="fa-solid fa-book-bookmark"></i> Kho học liệu tham khảo chất lượng
        </div>
        <h2 class="h12r__h2">Nguồn SGK, lý thuyết, bài giảng & bài tập trực tuyến</h2>
        <p class="h12r__intro">
          Các nguồn dưới đây đã được chọn lọc và kiểm duyệt nội dung theo chương trình SGK mới để bạn tra cứu và bổ trợ kịp thời.
        </p>

        <div style="display:grid; grid-template-columns:repeat(auto-fit, minmax(320px, 1fr)); gap:16px; margin-top:24px;">
          ${M.resources.map(r => `
            <div class="card" style="padding:18px; border-radius:14px; border:1px solid #e2e8f0; background:#ffffff; display:flex; flex-direction:column; justify-content:space-between;">
              <div>
                <div style="display:flex; justify-content:space-between; align-items:flex-start; gap:10px; margin-bottom:8px;">
                  <h4 style="font-size:14px; font-weight:700; color:#0f172a; margin:0;">${esc(r.title)}</h4>
                  <span style="font-size:11px; font-weight:700; background:#eff6ff; color:#0284c7; padding:2px 8px; border-radius:10px; white-space:nowrap;">
                    ${esc(r.tag)}
                  </span>
                </div>
                <p style="font-size:13px; color:#64748b; line-height:1.5; margin:0 0 14px 0;">${esc(r.desc)}</p>
              </div>
              <div>
                <a href="${esc(r.url)}" target="_blank" rel="noopener noreferrer" style="font-size:12px; font-weight:700; color:#0284c7; text-decoration:none; display:inline-flex; align-items:center; gap:6px; background:#f0f9ff; padding:6px 12px; border-radius:6px; border:1px solid #bae6fd;">
                  <i class="fa-solid fa-arrow-up-right-from-square"></i> Mở học liệu tham khảo
                </a>
              </div>
            </div>
          `).join('')}
        </div>
      </div>
    </section>
  `

  // 4. TIMELINE 35 WEEKS SECTION
  const weeksHtml = ROADMAP_11_DATA.weeks.map(w => {
    const isSem1 = w.s === 1
    const tagsHtml = w.tags.map((t, idx) => `
      <span class="h12r__chip" style="cursor:default; ${idx === 0 ? 'background:#e0f2fe; color:#0369a1; border-color:#bae6fd;' : ''}">${esc(t)}</span>
    `).join('')

    return `
      <li class="h12r__week h11r__week-item" data-sem="${w.s}" data-week="${w.n}" data-text="${esc(norm(w.t + ' ' + w.d + ' ' + w.tags.join(' ')))}">
        <span class="h12r__wn" aria-hidden="true" style="${isSem1 ? 'background:#0f172a;' : 'background:#0284c7;'}">${w.n}</span>
        <div>
          <div style="display:flex; justify-content:space-between; align-items:flex-start; gap:12px; flex-wrap:wrap;">
            <p class="h12r__wt" style="margin:0;">
              <span class="sr">Tuần </span>${esc(w.t)}
              <small>≈ ${hoursOfWeek(w.n)} tiết học · Học kỳ ${w.s === 1 ? 'I' : 'II'}</small>
            </p>
            ${w.m ? `
              <span class="h12r__ms" style="margin:0; background:#fef3c7; color:#92400e; border:1px solid #fde68a; padding:3px 8px; border-radius:6px; font-size:11px; font-weight:800;">
                <i class="fa-solid fa-flag-checkered"></i> ${esc(w.m)}
              </span>
            ` : ''}
          </div>
          <p style="font-size:13px; color:#475569; margin:6px 0 10px 0; line-height:1.5;">${esc(w.d)}</p>
          <div class="h12r__chips">${tagsHtml}</div>
        </div>
      </li>
    `
  }).join('')

  const timelineHtml = `
    <section class="h12r__sec h12r__sec--white" id="h11r-timeline">
      <div class="h12r__wrap">
        <div class="h12r__badge" style="background:#eff6ff; color:#0284c7; border-color:#bfdbfe;">
          <i class="fa-solid fa-calendar-days"></i> Kế hoạch chi tiết 35 tuần
        </div>
        <h2 class="h12r__h2">35 tuần: từ Cân bằng hóa học đến Carboxylic acid</h2>
        <p class="h12r__intro">
          Mỗi tuần giữ đúng 2 nhịp: <b>học kiến thức mới</b> và <b>luyện đề/ôn tập</b>. Sử dụng bộ lọc theo học kỳ hoặc nhập từ khóa để tìm nhanh bài học bạn cần.
        </p>

        <!-- Timeline Search & Filter Bar -->
        <div style="background:#f8fafc; border:1px solid #e2e8f0; border-radius:14px; padding:16px; margin-top:24px; margin-bottom:24px; display:flex; flex-wrap:wrap; gap:12px; align-items:center; justify-content:space-between;">
          <div style="flex:1 1 280px; position:relative;">
            <i class="fa-solid fa-magnifying-glass" style="position:absolute; left:14px; top:12px; color:#94a3b8;"></i>
            <input type="search" id="h11r-week-q" class="h12r__search" placeholder="Tìm tuần: pH, ammonia, alkane, alcohol, carbonyl..." style="width:100%; padding-left:38px; border-radius:10px;" autocomplete="off">
          </div>
          <div style="display:flex; gap:6px; flex-wrap:wrap;">
            <button type="button" class="btn-secondary h11r-sem-btn" data-sem="all" style="padding:8px 14px; font-size:13px; font-weight:700; border-radius:8px; background:#0f172a; color:#ffffff; border-color:#0f172a;">Tất cả 35 tuần</button>
            <button type="button" class="btn-secondary h11r-sem-btn" data-sem="1" style="padding:8px 14px; font-size:13px; font-weight:600; border-radius:8px;">Học kỳ I (Tuần 1–18)</button>
            <button type="button" class="btn-secondary h11r-sem-btn" data-sem="2" style="padding:8px 14px; font-size:13px; font-weight:600; border-radius:8px;">Học kỳ II (Tuần 19–35)</button>
          </div>
        </div>

        <ol class="h12r__weeks" id="h11r-weeks-list" style="display:grid; gap:14px;">${weeksHtml}</ol>
        <div id="h11r-weeks-empty" class="h12r__empty" hidden>
          <b>Không tìm thấy tuần học phù hợp.</b> Thử tìm với từ khóa khác hoặc nhấn "Tất cả 35 tuần".
        </div>
      </div>
    </section>
  `

  // 5. CHAPTERS & LESSONS & FORMS SECTION
  const chsHtml = chapters.map((c, ci) => {
    const nForms = c.lessons.reduce((n, l) => n + l.forms.length, 0)
    const wk = c.lessons.map(l => l.week)
    const w0 = Math.min.apply(null, wk)
    const w1 = Math.max.apply(null, wk)

    let prio = `
      <div class="h12r__prio" title="Mức trọng tâm trong đề thi" aria-label="Mức trọng tâm ${c.priority} trên 3">
        <span style="margin-right:6px">Trọng tâm</span>
        <i></i><i></i><i></i>
      </div>
    `

    const lsHtml = c.lessons.map(l => {
      const kp = l.keyPoints.map(k => `<li>${esc(k)}</li>`).join('')
      const forms = l.forms.map(f => {
        const text = norm(f.name + ' ' + (f.tip || ''))
        const parts = (f.parts || []).map(p => `<span class="h12r__pt" title="${esc(PART_TITLE[p] || '')}">${p}</span>`).join('')
        return `
          <li class="h12r__form" data-tier="${f.tier}" data-text="${esc(text)}">
            ${lv(f.tier, M.tiers[f.tier])}
            <span class="h12r__fname">${esc(f.name)}</span>
            <span class="h12r__parts-list">${parts}</span>
            ${f.tip ? `<span class="h12r__tip"><i class="fa-solid fa-lightbulb" style="color:#eab308; margin-right:4px;"></i>${esc(f.tip)}</span>` : ''}
          </li>
        `
      }).join('')

      return `
        <div class="h12r__ls" id="h11r-l-${l.id}" data-lesson="${l.id}" data-text="${esc(norm(tagOf(l) + ' ' + l.title))}">
          <label class="h12r__chk">
            <input type="checkbox" data-done="${l.id}">
            <span class="sr">Đánh dấu đã học: ${esc(tagOf(l) + ' ' + l.title)}</span>
          </label>
          <details ${l.no === 1 && ci === 0 ? 'open' : ''}>
            <summary>
              <span class="h12r__tag">${esc(tagOf(l))}</span>
              <span class="h12r__ttl">
                ${esc(l.title)}
                <small>Tuần ${l.week} · ${l.hours} tiết · ${l.forms.length} dạng bài thi</small>
              </span>
              <span class="h12r__chev" aria-hidden="true"></span>
            </summary>
            <div class="h12r__body">
              <div style="font-size:12px; font-weight:800; text-transform:uppercase; color:#0284c7; letter-spacing:0.5px; margin-bottom:8px;">
                <i class="fa-solid fa-book-open"></i> Lý thuyết cốt lõi & Cần nắm:
              </div>
              <ul class="h12r__kp">${kp}</ul>
              <div style="font-size:12px; font-weight:800; text-transform:uppercase; color:#0f172a; letter-spacing:0.5px; margin:16px 0 8px 0;">
                <i class="fa-solid fa-list-check"></i> Các dạng bài thi & Mẹo thực chiến:
              </div>
              <ul class="h12r__forms">${forms}</ul>
            </div>
          </details>
        </div>
      `
    }).join('')

    return `
      <section class="h12r__ch" data-chapter="${c.id}">
        <header class="h12r__chhead">
          <div class="h12r__tile" data-g="base" aria-hidden="true" style="background:#eff6ff; color:#0284c7; border:2px solid #0284c7;">
            ${c.atomicNumber ? `<i>${c.atomicNumber}</i>` : ''}
            <b>${esc(c.symbol)}</b>
          </div>
          <div>
            <p class="h12r__chcode">${esc(c.code)} · ${esc(c.group)} · Tuần ${w0 === w1 ? w0 : w0 + ' – ' + w1}</p>
            <h3>${esc(c.title)}</h3>
            <p class="h12r__chsum">${esc(c.summary)}</p>
          </div>
          <div class="h12r__chmeta">
            <b>${c.lessons.length} bài</b> · ${nForms} dạng bài
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
          <label class="sr" for="h11r-q">Tìm dạng bài</label>
          <input id="h11r-q" class="h12r__search" type="search" placeholder="Tìm dạng bài: Kc, Le Chatelier, pH, ammonia, alkane, ancol, tráng bạc..." autocomplete="off">
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
          <span>${lv('nen', 'Nền tảng')} <strong>Nền tảng</strong>: Khái niệm, nhận biết cơ bản</span>
          <span>${lv('nang', 'Nâng cao')} <strong>Nâng cao</strong>: Vận dụng công thức & chuỗi phản ứng</span>
          <span>${lv('top', 'Chinh phục 8+')} <strong>Chinh phục 8+</strong>: Bài toán tổng hợp định lượng</span>
          <span><b class="h12r__pt">I</b> <b class="h12r__pt">II</b> <b class="h12r__pt">III</b> tương ứng Phần I, II, III trong đề</span>
        </div>
        <p class="h12r__count" id="h11r-count" aria-live="polite"></p>
      </div>
    </div>
  `

  const chapterSec = `
    <section class="h12r__sec" id="h11r-chapters" style="padding-bottom:0">
      <div class="h12r__wrap">
        <h2 class="h12r__h2">Chi tiết 6 chương · 25 bài · 80+ dạng câu hỏi</h2>
        <p class="h12r__intro">
          Mỗi bài học được chia nhỏ thành các điểm kiến thức cần nắm và các dạng câu hỏi có kèm mẹo thực chiến. Đánh dấu ô vuông bên trái khi bạn học xong một bài để hệ thống ghi nhớ tiến độ của bạn.
        </p>
        <div class="h12r__progress">
          <span id="h11r-ptxt">0/25 bài hoàn thành</span>
          <div class="h12r__meter" role="progressbar" aria-valuemin="0" aria-valuemax="${lessons.length}" id="h11r-pbar"><i></i></div>
          <button type="button" class="h12r__linkbtn" data-reset="1">Xóa tiến độ</button>
        </div>
      </div>
      ${tools}
      <div class="h12r__wrap">
        <div class="h12r__chs" id="h11r-chs">${chsHtml}</div>
        <div class="h12r__empty" id="h11r-empty" hidden>
          <b>Không tìm thấy dạng bài phù hợp.</b><br>
          Thử tìm với từ khóa ngắn hơn hoặc chọn «Tất cả» ở bộ lọc mức độ.
        </div>
      </div>
      <div style="height:40px"></div>
    </section>
  `

  // 6. FOOTER CTA SECTION (1 button đăng ký mở modal Zalo Admin)
  const foot = `
    <footer class="h12r__foot" style="background:#0f172a;">
      <div class="h12r__wrap">
        <h2 class="h12r__h2">Bứt phá điểm số môn Hóa 11 ngay hôm nay!</h2>
        <p style="margin-top:10px; max-width:64ch; color:#cbd5e1;">
          Hệ thống bài giảng chi tiết, ngân hàng đề thi trắc nghiệm bấm giờ chấm điểm tự động và báo cáo điểm yếu sẽ đồng hành cùng bạn chinh phục điểm 8+ môn Hóa 11.
        </p>
        <div class="h12r__cta">
          <button type="button" class="h12r__btn h12r__btn--light" id="btn-h11r-foot-trial">
            <i class="fa-solid fa-wand-magic-sparkles" style="color:#16a34a;"></i> Luyện bài học thử miễn phí
          </button>
          <button type="button" class="h12r__btn h12r__btn--ghost" id="btn-h11r-foot-register" style="color:#ffffff; border-color:#ffffff; cursor:pointer;">
            <i class="fa-solid fa-user-plus"></i> Đăng ký học chính thức
          </button>
        </div>
        <ul class="h12r__srcs">
          ${M.sources.map(s => `<li><a href="${esc(s.url)}" target="_blank" rel="noopener">📄 ${esc(s.label)}</a></li>`).join('')}
        </ul>
        <small>${esc(M.disclaimer)}</small>
      </div>
    </footer>
  `

  return `<div class="h12r h11r" id="hoa11-roadmap">${heroHtml}${phasesHtml}${resourcesHtml}${timelineHtml}${chapterSec}${foot}</div>`
}

export function bindRoadmap11Events(root, options = {}) {
  const opts = Object.assign({
    storageKey: 'h11r:done:v1'
  }, options)

  const chapters = ROADMAP_11_DATA.chapters
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

  // Checkboxes progress
  const chks = root.querySelectorAll('.h12r__chk input')
  const pbar = root.querySelector('#h11r-pbar')
  const ptxt = root.querySelector('#h11r-ptxt')

  function updateProgress() {
    chks.forEach(chk => {
      const id = chk.dataset.done
      chk.checked = done.has(id)
      const row = chk.closest('.h12r__ls')
      if (row) {
        row.classList.toggle('done', chk.checked)
      }
    })
    const n = done.size
    const total = lessons.length
    const pct = total ? Math.round((n / total) * 100) : 0
    if (pbar) {
      pbar.setAttribute('aria-valuenow', n)
      const fill = pbar.querySelector('i')
      if (fill) fill.style.width = pct + '%'
    }
    if (ptxt) {
      ptxt.textContent = `${n}/${total} bài hoàn thành (${pct}%)`
    }
  }

  chks.forEach(chk => {
    chk.addEventListener('change', () => {
      const id = chk.dataset.done
      if (chk.checked) {
        done.add(id)
      } else {
        done.delete(id)
      }
      save()
      updateProgress()
    })
  })

  root.querySelector('[data-reset="1"]')?.addEventListener('click', () => {
    if (done.size === 0) return
    if (confirm('Bạn có chắc chắn muốn xóa toàn bộ tiến độ bài học Hóa 11 đã đánh dấu?')) {
      done.clear()
      save()
      updateProgress()
    }
  })

  // Timeline Search & Semester filter
  const weekQ = root.querySelector('#h11r-week-q')
  const semBtns = root.querySelectorAll('.h11r-sem-btn')
  const weekItems = root.querySelectorAll('.h11r__week-item')
  const weeksEmpty = root.querySelector('#h11r-weeks-empty')
  let currentSem = 'all'

  function filterWeeks() {
    const term = norm(weekQ?.value || '')
    let shown = 0

    weekItems.forEach(item => {
      const sem = item.dataset.sem
      const text = item.dataset.text || ''
      const matchSem = currentSem === 'all' || sem === currentSem
      const matchTerm = !term || text.includes(term)

      if (matchSem && matchTerm) {
        item.style.display = ''
        shown++
      } else {
        item.style.display = 'none'
      }
    })

    if (weeksEmpty) {
      weeksEmpty.hidden = shown > 0
    }
  }

  weekQ?.addEventListener('input', filterWeeks)

  semBtns.forEach(btn => {
    btn.addEventListener('click', () => {
      currentSem = btn.dataset.sem
      semBtns.forEach(b => {
        const isCurrent = b === btn
        b.style.background = isCurrent ? '#0f172a' : ''
        b.style.color = isCurrent ? '#ffffff' : ''
        b.style.borderColor = isCurrent ? '#0f172a' : ''
      })
      filterWeeks()
    })
  })

  // Chapter forms Search & Tier Filter
  const state = { tier: 'all' }
  const q = root.querySelector('#h11r-q')
  const formEls = root.querySelectorAll('.h12r__form')
  const lessonEls = root.querySelectorAll('.h12r__ls')
  const chapterEls = root.querySelectorAll('.h12r__ch')
  const countEl = root.querySelector('#h11r-count')
  const emptyEl = root.querySelector('#h11r-empty')

  function applyFormFilters() {
    const term = norm(q?.value || '')
    const tier = state.tier
    let matchCount = 0

    formEls.forEach(f => {
      const matchTier = tier === 'all' || f.dataset.tier === tier
      const matchText = !term || (f.dataset.text || '').includes(term)
      const ok = matchTier && matchText
      f.hidden = !ok
      if (ok) matchCount++
    })

    lessonEls.forEach(l => {
      const forms = l.querySelectorAll('.h12r__form')
      let anyForm = false
      forms.forEach(f => { if (!f.hidden) anyForm = true })
      const text = l.dataset.text || ''
      const matchSelf = term && text.includes(term)
      const showLesson = anyForm || (matchSelf && tier === 'all')
      l.hidden = !showLesson

      if (term && showLesson) {
        const det = l.querySelector('details')
        if (det) det.open = true
      }
    })

    chapterEls.forEach(c => {
      const lessonsInCh = c.querySelectorAll('.h12r__ls')
      let anyLesson = false
      lessonsInCh.forEach(l => { if (!l.hidden) anyLesson = true })
      c.hidden = !anyLesson
    })

    if (countEl) {
      if (!term && tier === 'all') {
        countEl.textContent = ''
      } else {
        countEl.textContent = `Tìm thấy ${matchCount} dạng bài phù hợp`
      }
    }
    if (emptyEl) {
      emptyEl.hidden = matchCount > 0
    }
  }

  q?.addEventListener('input', applyFormFilters)

  root.querySelectorAll('[data-tier-btn]').forEach(b => {
    b.addEventListener('click', () => {
      state.tier = b.dataset.tierBtn
      root.querySelectorAll('[data-tier-btn]').forEach(o => {
        o.setAttribute('aria-pressed', o === b ? 'true' : 'false')
      })
      applyFormFilters()
    })
  })

  root.querySelector('[data-open-all="1"]')?.addEventListener('click', () => {
    lessonEls.forEach(l => {
      if (!l.hidden) {
        const d = l.querySelector('details')
        if (d) d.open = true
      }
    })
  })

  root.querySelector('[data-open-all="0"]')?.addEventListener('click', () => {
    lessonEls.forEach(l => {
      const d = l.querySelector('details')
      if (d) d.open = false
    })
  })

  // Smooth scroll
  root.querySelectorAll('[data-scroll]').forEach(btn => {
    btn.addEventListener('click', e => {
      const targetId = btn.getAttribute('data-scroll')
      const targetEl = root.querySelector('#' + targetId)
      if (targetEl) {
        e.preventDefault()
        targetEl.scrollIntoView({ behavior: 'smooth', block: 'start' })
      }
    })
  })

  // Hero & Footer trial lessons link
  root.querySelector('#btn-hero-goto-trial-lessons')?.addEventListener('click', () => {
    window.location.hash = '#trial?tab=lessons'
  })
  root.querySelector('#btn-h11r-foot-trial')?.addEventListener('click', () => {
    window.location.hash = '#trial?tab=lessons'
  })

  // Footer registration button (opens trial registration modal)
  root.querySelector('#btn-h11r-foot-register')?.addEventListener('click', () => {
    if (typeof window.showTrialRegistrationModal === 'function') {
      window.showTrialRegistrationModal()
    }
  })

  updateProgress()
}
