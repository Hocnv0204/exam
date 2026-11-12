// Dữ liệu lộ trình Toán 12 (ôn thi cấp tốc 12 tuần lên 8+)
// Định dạng chuẩn theo utils/roadmap-schema.js

export const ROADMAP_MATH_12 = {
  id: 'toan-12',
  subject: 'Toán',
  grade: 12,
  kind: 'sprint',
  meta: {
    title: 'Toán 12: từ mất gốc lên 8+ trong 90 ngày',
    subtitle: 'Lộ trình 12 tuần bám sát sách Kết nối tri thức và cấu trúc đề thi tốt nghiệp THPT từ 2025. Phân hóa rõ 3 phần trắc nghiệm, đúng/sai, trả lời ngắn để tối ưu hóa điểm số.',
    badge: 'Bám sát cấu trúc đề thi tốt nghiệp THPT từ 2025',
    textbook: 'Toán 12 – Kết nối tri thức với cuộc sống (NXB Giáo dục Việt Nam)',
    durationWeeks: 12,
    hoursPerWeek: '8–10',
    targetScore: '8+',
    updated: '2026-11-12',
    tiers: {
      nen: 'Nền tảng',
      nang: 'Nâng cao',
      top: 'Chinh phục 8+'
    },
    sources: [
      {
        label: 'Quyết định 764/QĐ-BGDĐT: cấu trúc định dạng đề thi tốt nghiệp THPT từ 2025',
        url: 'https://luatvietnam.vn/giao-duc/quyet-dinh-764-qd-bgddt-2024-cau-truc-de-thi-ky-thi-tot-nghiep-thpt-tu-2025-302643-d1.html'
      },
      {
        label: 'Thông tư 32/2018/TT-BGDĐT: Ban hành Chương trình giáo dục phổ thông môn Toán',
        url: 'https://luatvietnam.vn/giao-duc/thong-tu-32-2018-tt-bgddt-ban-hanh-chuong-trinh-giao-duc-pho-thong-moi-169745-d1.html'
      },
      {
        label: 'Mục lục, bài học Toán 12 Kết nối tri thức – VietJack',
        url: 'https://vietjack.com/toan-12-kn/index.jsp'
      }
    ],
    disclaimer: 'Điểm mục tiêu là mức tham chiếu khi học đủ giờ và hoàn thành bài tập, không phải cam kết kết quả. Mức ưu tiên của từng chương là ước lượng của người biên soạn, hãy điều chỉnh theo năng lực cá nhân và ma trận đề thi thử.',
    entranceHomeworkId: null
  },
  scoreCurve: [
    { week: 0, score: 4.0, label: 'Xuất phát' },
    { week: 4, score: 6.0, label: 'Cuối tháng 1' },
    { week: 8, score: 7.2, label: 'Cuối tháng 2' },
    { week: 12, score: 8.0, label: 'Cuối tháng 3' }
  ],
  exam: {
    durationMin: 90,
    questions: 22,
    parts: [
      {
        id: 'I',
        name: 'Trắc nghiệm nhiều lựa chọn',
        questions: 12,
        detail: '12 câu × 0,25 điểm',
        points: 3.0
      },
      {
        id: 'II',
        name: 'Đúng / Sai',
        questions: 4,
        detail: '4 câu × 4 ý: 1 ý = 0,1 · 2 ý = 0,25 · 3 ý = 0,5 · 4 ý = 1,0',
        points: 4.0
      },
      {
        id: 'III',
        name: 'Trả lời ngắn',
        questions: 6,
        detail: '6 câu × 0,5 điểm',
        points: 3.0
      }
    ],
    target: [
      {
        id: 'I',
        points: 3.0,
        note: 'đúng 12/12 câu (tuyệt đối không để mất điểm ở phần nhận biết – thông hiểu)'
      },
      {
        id: 'II',
        points: 3.0,
        note: '2 câu đúng cả 4 ý (2,0 đ) + 2 câu đúng 3/4 ý (1,0 đ)'
      },
      {
        id: 'III',
        points: 2.0,
        note: 'đúng 4/6 câu trả lời ngắn (chọn lọc các câu thế mạnh Oxyz, thống kê, ứng dụng đạo hàm)'
      }
    ]
  },
  stages: [
    {
      id: 1,
      name: 'Lấy lại nền tảng & Ứng dụng đạo hàm',
      weeks: [1, 4],
      goal: '≈ 6,0 điểm',
      desc: 'Vá toàn bộ lỗ hổng lớp 10–11 (hàm số, đạo hàm, mũ – lôgarit, hình không gian), làm chủ Chương 1 (khảo sát hàm số, GTLN–GTNN, tiệm cận) và nhập môn Vectơ không gian.'
    },
    {
      id: 2,
      name: 'Tăng tốc Tích phân & Hình học tọa độ',
      weeks: [5, 8],
      goal: '≈ 7,2 điểm',
      desc: 'Chinh phục Thống kê ghép nhóm (chắc điểm Phần I & III), làm chủ Nguyên hàm – Tích phân và xây dựng nền tảng vững chắc cho Hình học không gian Oxyz (mặt phẳng, mặt cầu).'
    },
    {
      id: 3,
      name: 'Bứt phá 8+ & Thực chiến luyện đề',
      weeks: [9, 12],
      goal: '≥ 8,0 điểm',
      desc: 'Hoàn thiện Đường thẳng Oxyz và bài toán góc – khoảng cách; chinh phục Xác suất có điều kiện và công thức Bayes; tổng ôn bấm giờ 90 phút theo chuẩn 3 phần của đề thi.'
    }
  ],
  weeks: [
    { n: 1, stage: 1, theme: 'Sơ cứu nền tảng: Đạo hàm, Mũ – Lôgarit và Hình không gian 11', milestone: 'Kiểm tra đầu vào' },
    { n: 2, stage: 1, theme: 'Chương 1: Tính đơn điệu, cực trị và GTLN – GTNN của hàm số' },
    { n: 3, stage: 1, theme: 'Chương 1: Đường tiệm cận, đồ thị hàm số và bài toán tối ưu thực tiễn' },
    { n: 4, stage: 1, theme: 'Chương 2: Vectơ và hệ trục tọa độ trong không gian', milestone: 'Kiểm tra tháng 1 (Đạo hàm & Vectơ)' },
    { n: 5, stage: 2, theme: 'Chương 3: Số đặc trưng đo mức độ phân tán cho mẫu số liệu ghép nhóm' },
    { n: 6, stage: 2, theme: 'Chương 4: Định nghĩa, tính chất và các phương pháp tìm nguyên hàm' },
    { n: 7, stage: 2, theme: 'Chương 4: Tích phân và ứng dụng hình học tính diện tích, thể tích' },
    { n: 8, stage: 2, theme: 'Chương 5: Phương trình mặt phẳng và phương trình mặt cầu trong không gian', milestone: 'Kiểm tra giữa chặng (Chương 1 – 5)' },
    { n: 9, stage: 3, theme: 'Chương 5: Phương trình đường thẳng và công thức tính góc trong không gian' },
    { n: 10, stage: 3, theme: 'Chương 6: Xác suất có điều kiện và bài toán thực tế sơ cấp' },
    { n: 11, stage: 3, theme: 'Chương 6: Công thức xác suất toàn phần và công thức Bayes' },
    { n: 12, stage: 3, theme: 'Tổng ôn toàn diện: Luyện đề bấm giờ 90 phút và chiến thuật 3 phần', milestone: 'Thi thử 3 đề bấm giờ 90 phút' }
  ],
  chapters: [
    {
      id: 'c0',
      code: 'Nền tảng',
      title: 'Sơ cứu mất gốc: Lỗ hổng lớp 10–11 trọng tâm',
      group: 'Nền tảng',
      icon: '√x',
      summary: 'Bổ khuyết các chuyên đề lớp 10–11 bắt buộc phải dùng cho cấu trúc đề thi TN THPT mới: đạo hàm, mũ – lôgarit, góc – khoảng cách, xác suất cổ điển.',
      priority: 3,
      lessons: [
        {
          id: 't12-m1',
          no: null,
          tag: 'Nền tảng 1',
          title: 'Quy tắc tính đạo hàm và phương trình tiếp tuyến (lớp 11)',
          week: 1,
          hours: 2.5,
          keyPoints: [
            '(xⁿ)′ = n·xⁿ⁻¹; (√x)′ = 1/(2√x) (x > 0); (1/x)′ = −1/x² (x ≠ 0); đạo hàm hàm hợp [f(u)]′ = f′(u)·u′',
            '(u·v)′ = u′v + uv′, (u/v)′ = (u′v − uv′)/v²; đạo hàm lượng giác (sin x)′ = cos x, (cos x)′ = −sin x',
            'Tiếp tuyến tại M(x₀; f(x₀)): y = f′(x₀)(x − x₀) + f(x₀); hệ số góc tiếp tuyến là k = f′(x₀)'
          ],
          forms: [
            { name: 'Tính đạo hàm của đa thức, phân thức hữu tỉ và căn thức cơ bản', tier: 'nen', parts: ['I'] },
            { name: 'Tính đạo hàm của hàm số lượng giác và hàm hợp', tier: 'nen', parts: ['I'] },
            { name: 'Viết phương trình tiếp tuyến tại tiếp điểm M(x₀; y₀) hoặc biết hoành độ/tung độ', tier: 'nen', parts: ['I', 'II'] },
            { name: 'Viết phương trình tiếp tuyến biết hệ số góc k hoặc song song/vuông góc đường thẳng cho trước', tier: 'nang', parts: ['I', 'II'] },
            {
              name: 'Tìm điểm trên đồ thị sao cho tiếp tuyến thỏa mãn điều kiện khoảng cách hoặc diện tích tam giác',
              tier: 'top',
              parts: ['II', 'III'],
              tip: 'Chuyển về phương trình f\'(x₀) = k; nhớ kiểm tra loại trường hợp tiếp tuyến trùng với đường thẳng đề bài cho khi yêu cầu song song.'
            }
          ]
        },
        {
          id: 't12-m2',
          no: null,
          tag: 'Nền tảng 2',
          title: 'Hàm số mũ, lôgarit và phương trình, bất phương trình cơ bản',
          week: 1,
          hours: 2.5,
          keyPoints: [
            'Công thức lũy thừa: aᵐ·aⁿ = aᵐ⁺ⁿ, aᵐ/aⁿ = aᵐ⁻ⁿ, (aᵐ)ⁿ = aᵐⁿ; điều kiện a > 0 với số mũ thực',
            'Với a > 0, a ≠ 1, x > 0, y > 0: logₐ(xy) = logₐx + logₐy; logₐ(x/y) = logₐx − logₐy; logₐ(xᵅ) = α·logₐx. Đổi cơ số: log_b x = logₐx / logₐb (b > 0, b ≠ 1). aˣ = c (c > 0) ⇔ x = logₐc.',
            'Phương trình lôgarit cơ bản: logₐx = b ⇔ x = aᵇ (0 < a ≠ 1); với bất phương trình, chiều bất đẳng thức giữ nguyên khi a > 1 và đổi chiều khi 0 < a < 1'
          ],
          forms: [
            { name: 'Rút gọn biểu thức chứa lũy thừa và căn thức', tier: 'nen', parts: ['I'] },
            { name: 'Biến đổi, tính giá trị biểu thức lôgarit và biểu diễn lôgarit theo các tham số', tier: 'nen', parts: ['I'] },
            { name: 'Giải phương trình mũ và phương trình lôgarit cơ bản bằng phương pháp đưa về cùng cơ số', tier: 'nen', parts: ['I'] },
            { name: 'Giải phương trình, bất phương trình mũ – lôgarit bằng phương pháp đặt ẩn phụ', tier: 'nang', parts: ['I', 'II'] },
            {
              name: 'Tìm nghiệm nguyên hoặc số nghiệm của phương trình mũ – lôgarit chứa tham số',
              tier: 'top',
              parts: ['II', 'III'],
              tip: 'Luôn tìm điều kiện xác định của biểu thức lôgarit trước; dùng tính đơn điệu hàm số để cô lập tham số m.'
            }
          ]
        },
        {
          id: 't12-m3',
          no: null,
          tag: 'Nền tảng 3',
          title: 'Quan hệ vuông góc, góc và khoảng cách trong không gian',
          week: 1,
          hours: 2.5,
          keyPoints: [
            'Đường thẳng d ⊥ (P) khi d vuông góc 2 đường thẳng cắt nhau trong (P); d ⊥ (P) ⇒ d ⊥ mọi đường trong (P)',
            'Góc giữa đường thẳng d và mặt phẳng (P) là góc giữa d và hình chiếu d\' của nó trên (P); góc giữa 2 mặt phẳng xác định qua 2 đường cùng vuông góc với giao tuyến',
            'Khoảng cách từ điểm đến mặt phẳng: tính trực tiếp từ chân đường cao. Nếu đường thẳng AB cắt mặt phẳng (P) tại I thì d(A,(P)) / d(B,(P)) = IA / IB.'
          ],
          forms: [
            { name: 'Chứng minh đường thẳng vuông góc mặt phẳng, hai mặt phẳng vuông góc', tier: 'nen', parts: ['I', 'II'] },
            { name: 'Xác định và tính góc giữa đường thẳng và mặt phẳng trong khối đa diện cơ bản', tier: 'nen', parts: ['I', 'II'] },
            { name: 'Xác định và tính góc giữa hai mặt phẳng (góc nhị diện)', tier: 'nang', parts: ['I', 'II'] },
            { name: 'Tính khoảng cách từ một điểm đến mặt phẳng bằng phương pháp dời điểm về chân đường cao', tier: 'nang', parts: ['I', 'III'] },
            {
              name: 'Tính khoảng cách giữa hai đường thẳng chéo nhau bằng dựng mặt phẳng song song hoặc đoạn vuông góc chung',
              tier: 'top',
              parts: ['II', 'III'],
              tip: 'Dựng mặt phẳng chứa đường này và song song đường kia; sau đó chuyển khoảng cách về chân đường cao của khối chóp.'
            }
          ]
        },
        {
          id: 't12-m4',
          no: null,
          tag: 'Nền tảng 4',
          title: 'Lượng giác, cấp số cộng, cấp số nhân và giới hạn',
          week: 1,
          hours: 2.0,
          keyPoints: [
            'Công thức lượng giác cơ bản: sin²x + cos²x = 1; công thức nhân đôi sin 2x = 2 sin x cos x, cos 2x = 2 cos²x - 1',
            'Cấp số cộng: uₙ = u₁ + (n - 1)d, Sₙ = n(u₁ + uₙ)/2; Cấp số nhân: uₙ = u₁·qⁿ⁻¹, Sₙ = u₁(1 - qⁿ)/(1 - q) (q ≠ 1)',
            'Giới hạn dãy số lim (1/nᵏ) = 0 (k > 0); giới hạn hàm số dạng vô định 0/0 (khử nhân tử chung hoặc nhân liên hợp)'
          ],
          forms: [
            { name: 'Sử dụng công thức lượng giác cơ bản và giải phương trình lượng giác thường gặp', tier: 'nen', parts: ['I'] },
            { name: 'Xác định số hạng tổng quát, công sai và tổng n số hạng của cấp số cộng', tier: 'nen', parts: ['I'] },
            { name: 'Xác định công bội, số hạng tổng quát và tổng của cấp số nhân', tier: 'nen', parts: ['I'] },
            { name: 'Tính giới hạn hàm số dạng vô định 0/0 và ∞/∞', tier: 'nang', parts: ['I', 'II'] },
            {
              name: 'Bài toán thực tế ứng dụng cấp số cộng, cấp số nhân (lãi kép, bài toán chu kỳ tăng trưởng)',
              tier: 'top',
              parts: ['II', 'III'],
              tip: 'Quy về công thức tài chính lãi kép Sₙ = A·(1 + r)ⁿ hoặc tính tổng chi phí tích lũy theo cấp số cộng.'
            }
          ]
        },
        {
          id: 't12-m5',
          no: null,
          tag: 'Nền tảng 5',
          title: 'Quy tắc đếm, hoán vị, chỉnh hợp, tổ hợp và xác suất cổ điển',
          week: 1,
          hours: 2.5,
          keyPoints: [
            'Quy tắc cộng (phương án rời nhau) và quy tắc nhân (công đoạn liên tiếp); sơ đồ cây biểu diễn phép đếm',
            'Hoán vị Pₙ = n!; Chỉnh hợp Aₙᵏ = n!/(n - k)! (có thứ tự); Tổ hợp Cₙᵏ = n!/[k!(n - k)!] (chọn không phân biệt thứ tự)',
            'Xác suất cổ điển P(A) = n(A)/n(Ω); biến cố đối P(Ā) = 1 - P(A); công thức cộng xác suất P(A ∪ B) = P(A) + P(B) khi xung khắc'
          ],
          forms: [
            { name: 'Áp dụng quy tắc cộng và quy tắc nhân cho bài toán đếm sắp xếp đối tượng', tier: 'nen', parts: ['I'] },
            { name: 'Tính số hoán vị, chỉnh hợp, tổ hợp và giải phương trình chứa Aₙᵏ, Cₙᵏ', tier: 'nen', parts: ['I'] },
            { name: 'Tính xác suất của biến cố bằng phương pháp tổ hợp cổ điển (chọn đồ vật, chọn người, chia nhóm)', tier: 'nen', parts: ['I', 'II'] },
            { name: 'Tính xác suất bằng biến cố đối hoặc quy tắc cộng/nhân xác suất', tier: 'nang', parts: ['I', 'II'] },
            {
              name: 'Bài toán đếm và xác suất nâng cao có điều kiện ràng buộc vị trí, lập số tự nhiên',
              tier: 'top',
              parts: ['II', 'III'],
              tip: 'Xử lý trường hợp chữ số 0 đầu tiên; nhóm các phần tử buộc phải đứng cạnh nhau thành một khối phần tử duy nhất.'
            }
          ]
        }
      ]
    },
    {
      id: 'c1',
      code: 'Chương 1',
      title: 'Ứng dụng đạo hàm để khảo sát và vẽ đồ thị của hàm số',
      group: 'Giải tích',
      icon: "f'",
      summary: 'Trọng tâm lớn nhất của phần Giải tích, chiếm 5–6 câu trong đề thi với đầy đủ ở cả 3 phần: đơn điệu, cực trị, GTLN–GTNN, tiệm cận, đồ thị và tối ưu thực tế.',
      priority: 3,
      lessons: [
        {
          id: 't12-b1',
          no: 1,
          title: 'Tính đơn điệu và cực trị của hàm số',
          week: 2,
          hours: 3.5,
          keyPoints: [
            'Nếu f′(x) > 0 với mọi x ∈ K (K là khoảng) thì f đồng biến trên K; nếu f′(x) ≥ 0 và f′(x) = 0 chỉ tại hữu hạn điểm của K thì f vẫn đồng biến trên K.',
            'Điều kiện cực trị: f\'(x) đổi dấu khi qua x₀ thì x₀ là điểm cực trị; đổi dấu từ + sang - là cực đại, từ - sang + là cực tiểu',
            'Dấu hiệu đạo hàm cấp hai: f\'(x₀) = 0 và f\'\'(x₀) < 0 ⇒ x₀ là điểm cực đại; f\'(x₀) = 0 và f\'\'(x₀) > 0 ⇒ x₀ là điểm cực tiểu'
          ],
          forms: [
            { name: 'Tìm khoảng đồng biến, nghịch biến của hàm số từ bảng biến thiên hoặc công thức hàm số', tier: 'nen', parts: ['I'] },
            { name: 'Tìm điểm cực đại, điểm cực tiểu, giá trị cực trị của hàm số từ bảng biến thiên hoặc đồ thị f(x)', tier: 'nen', parts: ['I'] },
            { name: 'Xác định khoảng đơn điệu và cực trị dựa trên đồ thị của hàm số đạo hàm y = f\'(x)', tier: 'nang', parts: ['I', 'II'] },
            { name: 'Tìm tham số m để hàm số đơn điệu trên khoảng hoặc nửa khoảng cho trước', tier: 'nang', parts: ['II', 'III'] },
            {
              name: 'Biện luận cực trị hoặc đơn điệu của hàm hợp g(x) = f(u(x)) hoặc g(x) = f(x) + h(x)',
              tier: 'top',
              parts: ['II', 'III'],
              tip: 'Tính đạo hàm g\'(x) = u\'(x)·f\'(u(x)); lập bảng xét dấu theo nghiệm của u\'(x) và các điểm làm f\' triệt tiêu.'
            }
          ]
        },
        {
          id: 't12-b2',
          no: 2,
          title: 'Giá trị lớn nhất và giá trị nhỏ nhất của hàm số',
          week: 2,
          hours: 3.0,
          keyPoints: [
            'M = max f(x) trên D khi f(x) ≤ M với mọi x ∈ D và tồn tại x₀ ∈ D sao cho f(x₀) = M; tương tự cho min',
            'Tìm GTLN – GTNN trên đoạn [a; b]: tính f\'(x), tìm nghiệm xᵢ ∈ (a; b), tính f(a), f(b), f(xᵢ) rồi so sánh giá trị',
            'Tìm GTLN – GTNN trên khoảng (a; b): bắt buộc phải lập bảng biến thiên để kết luận giới hạn tại vô cực hoặc đầu mút'
          ],
          forms: [
            { name: 'Tìm giá trị lớn nhất, nhỏ nhất của hàm số trên một đoạn [a; b]', tier: 'nen', parts: ['I'] },
            { name: 'Đọc GTLN – GTNN của hàm số từ đồ thị hoặc bảng biến thiên trên tập xác định D', tier: 'nen', parts: ['I'] },
            { name: 'Tìm GTLN – GTNN của hàm số chứa căn thức hoặc lượng giác bằng phương pháp đặt ẩn phụ', tier: 'nang', parts: ['I', 'II'] },
            { name: 'Tìm tham số m để GTLN hoặc GTNN của hàm số thỏa mãn điều kiện đẳng thức/bất đẳng thức', tier: 'nang', parts: ['II', 'III'] },
            {
              name: 'Tìm GTLN – GTNN của biểu thức chứa dấu giá trị tuyệt đối g(x) = |f(x) + m|',
              tier: 'top',
              parts: ['II', 'III'],
              tip: 'Đặt u = f(x) ∈ [m; M]; chuyển về max/min của |u + m| trên đoạn rồi xét các trường hợp tương giao với trục hoành.'
            }
          ]
        },
        {
          id: 't12-b3',
          no: 3,
          title: 'Đường tiệm cận của đồ thị hàm số',
          week: 3,
          hours: 2.5,
          keyPoints: [
            'Tiệm cận ngang: y = y₀ nếu lim[x→+∞] f(x) = y₀ hoặc lim[x→-∞] f(x) = y₀',
            'Tiệm cận đứng: x = x₀ nếu ít nhất một trong các giới hạn một bên lim[x→x₀⁺] f(x) hoặc lim[x→x₀⁻] f(x) bằng +∞ hoặc -∞',
            'Tiệm cận xiên (SGK 2018): y = ax + b (a ≠ 0) nếu lim[x→+∞] [f(x) - (ax + b)] = 0; hàm phân thức bậc 2 trên bậc 1 chia đa thức ra thương ax + b'
          ],
          forms: [
            { name: 'Xác định phương trình tiệm cận đứng và tiệm cận ngang từ bảng biến thiên', tier: 'nen', parts: ['I'] },
            { name: 'Tìm tiệm cận đứng, tiệm cận ngang của hàm phân thức bậc nhất/bậc nhất y = (ax + b)/(cx + d)', tier: 'nen', parts: ['I'] },
            { name: 'Tìm phương trình đường tiệm cận xiên của đồ thị hàm phân thức hữu tỉ', tier: 'nen', parts: ['I', 'II'] },
            { name: 'Đếm tổng số đường tiệm cận (đứng, ngang, xiên) của đồ thị hàm phân thức chứa căn', tier: 'nang', parts: ['I', 'II'] },
            {
              name: 'Tìm tham số m để đồ thị hàm số có đúng số lượng đường tiệm cận cho trước',
              tier: 'top',
              parts: ['II', 'III'],
              tip: 'Chú ý điều kiện nghiệm của mẫu số không được trùng với nghiệm của tử số (tránh triệt tiêu nhân tử làm mất tiệm cận đứng).'
            }
          ]
        },
        {
          id: 't12-b4',
          no: 4,
          title: 'Khảo sát sự biến thiên và vẽ đồ thị của hàm số',
          week: 3,
          hours: 3.0,
          keyPoints: [
            'Sơ đồ khảo sát: Tập xác định → Chiều biến thiên, cực trị → Giới hạn, tiệm cận → Bảng biến thiên → Đồ thị và giao điểm với các trục tọa độ',
            'Các hàm số trọng tâm: hàm bậc ba y = ax³ + bx² + cx + d; phân thức bậc nhất y = (ax + b)/(cx + d); phân thức bậc hai/bậc nhất y = (ax² + bx + c)/(dx + e)',
            'Tâm đối xứng: đồ thị hàm bậc ba nhận điểm uốn I(x₀; y₀) với f\'\'(x₀) = 0 làm tâm đối xứng; hàm phân thức nhận giao điểm 2 tiệm cận làm tâm đối xứng'
          ],
          forms: [
            { name: 'Nhận diện đồ thị hàm số bậc ba, hàm phân thức bậc nhất và phân thức bậc hai/bậc nhất', tier: 'nen', parts: ['I'] },
            { name: 'Xác định dấu của các hệ số a, b, c, d từ hình dáng đồ thị hoặc bảng biến thiên', tier: 'nen', parts: ['I', 'II'] },
            { name: 'Biện luận số nghiệm của phương trình f(x) = m hoặc f(x) = g(m) dựa vào đồ thị', tier: 'nang', parts: ['I', 'II'] },
            { name: 'Khảo sát đồ thị hàm số có chứa dấu giá trị tuyệt đối y = |f(x)| hoặc y = f(|x|)', tier: 'nang', parts: ['I', 'II'] },
            {
              name: 'Tìm điều kiện tham số để đường thẳng cắt đồ thị hàm phân thức tại hai điểm phân biệt thỏa mãn hệ thức tọa độ',
              tier: 'top',
              parts: ['II', 'III'],
              tip: 'Lập phương trình hoành độ giao điểm; áp dụng định lý Viète và kiểm tra điều kiện nghiệm khác nghiệm của mẫu.'
            }
          ]
        },
        {
          id: 't12-b5',
          no: 5,
          title: 'Ứng dụng đạo hàm để giải quyết một số vấn đề liên quan đến thực tiễn',
          week: 3,
          hours: 3.0,
          keyPoints: [
            'Mô hình hóa bài toán tối ưu: đặt ẩn biến x kèm điều kiện thực tế → thiết lập hàm mục tiêu f(x) (chi phí, doanh thu, diện tích, thể tích)',
            'Tìm giá trị tối ưu: tính đạo hàm f\'(x), giải f\'(x) = 0 để tìm điểm tới hạn x* và lập bảng biến thiên khẳng định GTLN/GTNN',
            'Ứng dụng trong vật lý: vận tốc tức thời v(t) = s\'(t), gia tốc tức thời a(t) = v\'(t) = s\'\'(t); công suất tức thời P(t) = A\'(t)'
          ],
          forms: [
            { name: 'Bài toán chuyển động vật lý: tính vận tốc tức thời, gia tốc tức thời từ hàm quãng đường', tier: 'nen', parts: ['I', 'III'] },
            { name: 'Bài toán tối ưu hình học: tìm kích thước để diện tích lớn nhất hoặc chi phí rào chắn nhỏ nhất', tier: 'nen', parts: ['I', 'III'] },
            { name: 'Bài toán tối ưu thể tích khối hộp, hình trụ, hình nón để tiết kiệm nguyên vật liệu', tier: 'nang', parts: ['II', 'III'] },
            { name: 'Bài toán kinh tế: tối ưu hóa lợi nhuận, doanh thu và chi phí sản xuất trong doanh nghiệp', tier: 'nang', parts: ['II', 'III'] },
            {
              name: 'Bài toán thực tế đa biến số rút gọn về một biến: bài toán đường ống dẫn dầu, vị trí đặt trạm tiếp nhiên liệu',
              tier: 'top',
              parts: ['II', 'III'],
              tip: 'Dùng định lý Pythagore hoặc tam giác đồng dạng để rút một biến theo biến còn lại trước khi lập hàm f(x).'
            }
          ]
        }
      ]
    },
    {
      id: 'c2',
      code: 'Chương 2',
      title: 'Vectơ và hệ trục tọa độ trong không gian',
      group: 'Hình học',
      icon: 'xyz',
      summary: 'Cầu nối từ hình học không gian thuần túy sang đại số hóa bằng vectơ và hệ tọa độ Oxyz; mở đầu cho phương pháp giải toán hình học 12.',
      priority: 2,
      lessons: [
        {
          id: 't12-b6',
          no: 6,
          title: 'Vectơ trong không gian',
          week: 4,
          hours: 3.0,
          keyPoints: [
            'Quy tắc vectơ: quy tắc ba điểm AB→ + BC→ = AC→; quy tắc hình bình hành; quy tắc hình hộp: đường chéo AC\'→ = AB→ + AD→ + AA\'→',
            'Ba vectơ đồng phẳng khi và chỉ khi có biểu diễn c⃗ = m·a⃗ + n·b⃗ (với a⃗, b⃗ không cùng phương)',
            'Tích vô hướng của 2 vectơ: a⃗·b⃗ = |a⃗|·|b⃗|·cos(a⃗, b⃗); hai vectơ vuông góc a⃗ ⊥ b⃗ ⇔ a⃗·b⃗ = 0'
          ],
          forms: [
            { name: 'Biểu diễn một vectơ theo ba vectơ không đồng phẳng trong hình chóp hoặc hình hộp', tier: 'nen', parts: ['I'] },
            { name: 'Tính độ dài vectơ tổng hoặc hiệu trong khối đa diện cơ bản', tier: 'nen', parts: ['I'] },
            { name: 'Tính góc giữa hai vectơ và tích vô hướng trong không gian', tier: 'nen', parts: ['I', 'II'] },
            { name: 'Chứng minh hai đường thẳng vuông góc bằng phương pháp tích vô hướng', tier: 'nang', parts: ['I', 'II'] },
            {
              name: 'Bài toán cân bằng lực trong vật lý: tìm hợp lực của 3 lực không đồng phẳng tác dụng lên vật',
              tier: 'top',
              parts: ['II', 'III'],
              tip: 'Phân tích các lực theo 3 trục trực giao hoặc dùng điều kiện cân bằng tổng vectơ lực F₁→ + F₂→ + F₃→ = 0⃗.'
            }
          ]
        },
        {
          id: 't12-b7',
          no: 7,
          title: 'Hệ trục tọa độ trong không gian',
          week: 4,
          hours: 2.5,
          keyPoints: [
            'Hệ trục Oxyz gồm 3 trục Ox, Oy, Oz đôi một vuông góc; các vectơ đơn vị i⃗ = (1; 0; 0), j⃗ = (0; 1; 0), k⃗ = (0; 0; 1)',
            'Điểm M(x; y; z) ⇔ OM→ = x·i⃗ + y·j⃗ + z·k⃗; hình chiếu của M lên Oxy là (x; y; 0), lên Ox là (x; 0; 0)',
            'Tọa độ trung điểm I của AB: x_I = (x_A + x_B)/2; Tọa độ trọng tâm G tam giác: x_G = (x_A + x_B + x_C)/3'
          ],
          forms: [
            { name: 'Xác định tọa độ điểm và vectơ liên hệ với hệ trục Oxyz', tier: 'nen', parts: ['I'] },
            { name: 'Tìm tọa độ hình chiếu vuông góc và điểm đối xứng qua các trục, mặt phẳng tọa độ', tier: 'nen', parts: ['I'] },
            { name: 'Xác định tọa độ trung điểm đoạn thẳng, trọng tâm tam giác, trọng tâm tứ diện', tier: 'nen', parts: ['I'] },
            { name: 'Tìm tọa độ đỉnh thứ tư của hình bình hành hoặc hình hộp', tier: 'nang', parts: ['I', 'II'] },
            {
              name: 'Gắn hệ trục tọa độ Oxyz vào khối đa diện (hình lập phương, chóp đều) để giải bài toán hình học',
              tier: 'top',
              parts: ['II', 'III'],
              tip: 'Chọn gốc tọa độ O tại đỉnh có 3 cạnh đôi một vuông góc để phương trình các điểm đơn giản nhất.'
            }
          ]
        },
        {
          id: 't12-b8',
          no: 8,
          title: 'Biểu thức tọa độ của các phép toán vectơ',
          week: 4,
          hours: 3.0,
          keyPoints: [
            'Cho u⃗ = (x₁; y₁; z₁), v⃗ = (x₂; y₂; z₂): u⃗ ± v⃗ = (x₁ ± x₂; y₁ ± y₂; z₁ ± z₂), k·u⃗ = (k x₁; k y₁; k z₁)',
            'Tích vô hướng: u⃗·v⃗ = x₁x₂ + y₁y₂ + z₁z₂; Độ dài vectơ: |u⃗| = √(x₁² + y₁² + z₁²)',
            'Khoảng cách giữa hai điểm: AB = √[(x_B - x_A)² + (y_B - y_A)² + (z_B - z_A)²]; cos(u⃗, v⃗) = (u⃗·v⃗)/(|u⃗|·|v⃗|)'
          ],
          forms: [
            { name: 'Thực hiện các phép cộng, trừ vectơ và nhân vectơ với một số bằng tọa độ', tier: 'nen', parts: ['I'] },
            { name: 'Tính tích vô hướng của hai vectơ và độ dài của vectơ trong không gian', tier: 'nen', parts: ['I'] },
            { name: 'Tính khoảng cách giữa hai điểm và góc giữa hai vectơ khi biết tọa độ', tier: 'nen', parts: ['I', 'II'] },
            { name: 'Kiểm tra tính cùng phương của hai vectơ, ba điểm thẳng hàng', tier: 'nang', parts: ['I', 'II'] },
            {
              name: 'Tìm điểm M thỏa mãn đẳng thức vectơ hoặc biểu thức độ dài cực trị |MA→ + 2MB→| đạt min',
              tier: 'top',
              parts: ['II', 'III'],
              tip: 'Khi IA⃗ + 2IB⃗ = 0⃗ thì |MA⃗ + 2MB⃗| = 3MI; M tự do ⇒ min tại M = I; M thuộc đường/mặt phẳng ⇒ min tại hình chiếu của I lên đó.'
            }
          ]
        }
      ]
    },
    {
      id: 'c3',
      code: 'Chương 3',
      title: 'Các số đặc trưng đo mức độ phân tán cho mẫu số liệu ghép nhóm',
      group: 'Thống kê',
      icon: 's²',
      summary: 'Mảng kiến thức mới trong chương trình 2018, câu hỏi thường ngắn gọn, công thức rõ ràng, dễ đạt điểm tối đa ở Phần I và Phần III nếu nhớ chuẩn công thức.',
      priority: 2,
      lessons: [
        {
          id: 't12-b9',
          no: 9,
          title: 'Khoảng biến thiên và khoảng tứ phân vị',
          week: 5,
          hours: 3.0,
          keyPoints: [
            'Khoảng biến thiên của mẫu ghép nhóm: R = aₖ₊₁ - a₁ (đầu mút phải nhóm cuối trừ đầu mút trái nhóm đầu)',
            'Tứ phân vị Q₁: nhóm có tần số tích lũy đầu tiên ≥ n/4; công thức Q₁ = L + [(n/4 - CF)/(f_Q)]·h (L là đầu mút trái, CF là tần số tích lũy nhóm trước, h là độ dài nhóm)',
            'Khoảng tứ phân vị: Δ_Q = Q₃ - Q₁; giá trị ngoại lệ (outlier) là giá trị x < Q₁ - 1,5·Δ_Q hoặc x > Q₃ + 1,5·Δ_Q'
          ],
          forms: [
            { name: 'Đọc và xác định khoảng biến thiên của mẫu số liệu ghép nhóm', tier: 'nen', parts: ['I'] },
            { name: 'Xác định nhóm chứa tứ phân vị thứ nhất Q₁ và tứ phân vị thứ ba Q₃', tier: 'nen', parts: ['I'] },
            { name: 'Tính tứ phân vị Q₁, Q₃ và khoảng tứ phân vị Δ_Q của mẫu số liệu ghép nhóm', tier: 'nang', parts: ['I', 'III'] },
            { name: 'So sánh mức độ phân tán của hai mẫu số liệu thông qua khoảng biến thiên và khoảng tứ phân vị', tier: 'nang', parts: ['II'] },
            {
              name: 'Xác định các giá trị bất thường (ngoại lệ) của mẫu số liệu dựa trên khoảng tứ phân vị',
              tier: 'top',
              parts: ['II', 'III'],
              tip: 'Tính chính xác ranh giới Q₁ - 1,5·Δ_Q và Q₃ + 1,5·Δ_Q; đối chiếu với các khoảng giá trị của mẫu.'
            }
          ]
        },
        {
          id: 't12-b10',
          no: 10,
          title: 'Phương sai và độ lệch chuẩn',
          week: 5,
          hours: 3.0,
          keyPoints: [
            'Số trung bình: x̄ = (1/n) ∑ mᵢ·fᵢ (với mᵢ là giá trị đại diện của nhóm [aᵢ; aᵢ₊₁], mᵢ = (aᵢ + aᵢ₊₁)/2)',
            'Phương sai mẫu ghép nhóm: s² = (1/n) ∑ fᵢ·(mᵢ - x̄)² = (1/n) ∑ fᵢ·mᵢ² - (x̄)²; Độ lệch chuẩn s = √(s²)',
            'Ý nghĩa thực tiễn: phương sai và độ lệch chuẩn đo độ rủi ro, sự biến động hay tính ổn định của năng suất, điểm số, giá cổ phiếu'
          ],
          forms: [
            { name: 'Tính giá trị đại diện mᵢ và số trung bình x̄ của mẫu số liệu ghép nhóm', tier: 'nen', parts: ['I'] },
            { name: 'Tính phương sai s² và độ lệch chuẩn s của mẫu số liệu ghép nhóm bằng công thức hoặc máy tính cầm tay', tier: 'nen', parts: ['I', 'III'] },
            { name: 'Phân tích và so sánh mức độ rủi ro/độ ổn định giữa hai tập dữ liệu thống kê trong thực tế', tier: 'nang', parts: ['II'] },
            { name: 'Tìm tần số còn thiếu trong bảng ghép nhóm khi biết số trung bình hoặc phương sai', tier: 'nang', parts: ['II', 'III'] },
            {
              name: 'Bài toán tối ưu quyết định kinh doanh dựa trên độ lệch chuẩn kết hợp số trung bình',
              tier: 'top',
              parts: ['II', 'III'],
              tip: 'Khi hai mẫu số liệu cùng đơn vị đo và có số trung bình xấp xỉ nhau, mẫu nào có phương sai hoặc độ lệch chuẩn nhỏ hơn thì mức độ phân tán thấp hơn (ổn định hơn).'
            }
          ]
        }
      ]
    },
    {
      id: 'c4',
      code: 'Chương 4',
      title: 'Nguyên hàm và tích phân',
      group: 'Giải tích',
      icon: '∫',
      summary: 'Trọng tâm cốt lõi của Học kỳ 2, chiếm vị trí quan trọng ở cả 3 phần trong đề thi, đặc biệt là các bài toán tích phân thực tế và ứng dụng hình học.',
      priority: 3,
      lessons: [
        {
          id: 't12-b11',
          no: 11,
          title: 'Nguyên hàm',
          week: 6,
          hours: 3.5,
          keyPoints: [
            'F(x) là nguyên hàm của f(x) trên K ⇔ F\'(x) = f(x); Họ nguyên hàm ∫ f(x)dx = F(x) + C',
            'Bảng nguyên hàm: ∫ xᵃ dx = xᵃ⁺¹/(α + 1) + C (α ≠ -1), ∫ (1/x)dx = ln|x| + C, ∫ eˣ dx = eˣ + C, ∫ aˣ dx = aˣ/ln a + C, ∫ cos x dx = sin x + C, ∫ sin x dx = -cos x + C',
            'Phương pháp: đổi biến số ∫ f(u(x))·u\'(x)dx = ∫ f(u)du; nguyên hàm từng phần ∫ u dv = u·v - ∫ v du (ưu tiên u: Nhất lô, nhì đa, tam lượng, tứ mũ)'
          ],
          forms: [
            { name: 'Tìm họ nguyên hàm bằng cách sử dụng bảng nguyên hàm cơ bản và tính chất tuyến tính', tier: 'nen', parts: ['I'] },
            { name: 'Tìm nguyên hàm thỏa mãn điều kiện ban đầu F(x₀) = y₀', tier: 'nen', parts: ['I'] },
            { name: 'Tính nguyên hàm bằng phương pháp đổi biến số đơn giản t = u(x)', tier: 'nang', parts: ['I', 'II'] },
            { name: 'Tính nguyên hàm bằng phương pháp nguyên hàm từng phần', tier: 'nang', parts: ['I', 'II'] },
            {
              name: 'Tìm nguyên hàm F(x) thỏa mãn điều kiện ban đầu F(x₀) = c rồi tính F(a)',
              tier: 'nang',
              parts: ['I', 'III']
            }
          ]
        },
        {
          id: 't12-b12',
          no: 12,
          title: 'Tích phân',
          week: 6,
          hours: 3.5,
          keyPoints: [
            'Định nghĩa tích phân: ∫[a→b] f(x)dx = F(b) - F(a) = F(x)|[a→b]; Tích phân không phụ thuộc vào biến: ∫[a→b] f(x)dx = ∫[a→b] f(t)dt',
            'Tính chất: ∫[a→b] = ∫[a→c] + ∫[c→b]; nếu f(x) ≥ 0 trên [a; b] thì ∫[a→b] f(x)dx ≥ 0',
            'Đổi biến số trong tích phân: bắt buộc đổi cận x = a ⇒ u = u(a), x = b ⇒ u = u(b); Từng phần: ∫[a→b] u dv = (u·v)|[a→b] - ∫[a→b] v du'
          ],
          forms: [
            { name: 'Tính tích phân cơ bản bằng định nghĩa và công thức Newton-Leibniz', tier: 'nen', parts: ['I'] },
            { name: 'Sử dụng các tính chất chèn cận, cộng trừ tích phân để tính giá trị biểu thức', tier: 'nen', parts: ['I'] },
            { name: 'Tính tích phân bằng phương pháp đổi biến số (đặt căn thức, hàm lượng giác, hàm mũ)', tier: 'nang', parts: ['I', 'II'] },
            { name: 'Tính tích phân bằng phương pháp từng phần dạng đa thức nhân lượng giác, mũ, lôgarit', tier: 'nang', parts: ['I', 'II'] },
            {
              name: 'Tính tích phân hàm ẩn hoặc tích phân của hàm số chẵn/lẻ thỏa mãn f(x) + f(-x) = g(x)',
              tier: 'top',
              parts: ['II', 'III'],
              tip: 'Đổi biến t = -x hoặc t = a + b - x để thiết lập hệ thức liên hệ hai tích phân cùng cận.'
            }
          ]
        },
        {
          id: 't12-b13',
          no: 13,
          title: 'Ứng dụng hình học của tích phân',
          week: 7,
          hours: 3.5,
          keyPoints: [
            'Diện tích hình phẳng giới hạn bởi y = f(x), trục Ox và x = a, x = b: S = ∫[a→b] |f(x)|dx; giữa 2 đường: S = ∫[a→b] |f(x) - g(x)|dx',
            'Thể tích vật thể có diện tích thiết diện vuông góc trục Ox là S(x): V = ∫[a→b] S(x)dx',
            'Thể tích khối tròn xoay tạo thành khi quay hình phẳng y = f(x), Ox, x=a, x=b quanh trục Ox: V = π ∫[a→b] [f(x)]² dx',
            'Quãng đường chuyển động: S = ∫ₐᵇ |v(t)| dt (nếu v(t) ≥ 0 thì S = ∫ₐᵇ v(t) dt); ∫ v(t) dt là độ dời'
          ],
          forms: [
            { name: 'Viết công thức tính diện tích hình phẳng giới hạn bởi đồ thị và trục hoành', tier: 'nen', parts: ['I'] },
            { name: 'Tính diện tích hình phẳng giới hạn bởi hai đồ thị hàm số có hoành độ giao điểm cho trước', tier: 'nen', parts: ['I', 'II'] },
            { name: 'Tính thể tích khối tròn xoay sinh ra khi quay quanh trục hoành bằng công thức V = π ∫ f²(x)dx', tier: 'nang', parts: ['I', 'III'] },
            { name: 'Bài toán ứng dụng tích phân tính quãng đường: S = ∫ₐᵇ |v(t)| dt (nếu v(t) ≥ 0 thì S = ∫ₐᵇ v(t) dt); ∫ v(t) dt là độ dời', tier: 'nang', parts: ['I', 'III'] },
            {
              name: 'Tính diện tích hình phẳng hoặc thể tích bồn chứa thực tế bằng cách ghép các parabol/elip',
              tier: 'top',
              parts: ['II', 'III'],
              tip: 'Chọn hệ trục tọa độ thích hợp (gốc O tại tâm đối xứng); xác định phương trình parabol biên y = ax² + bx + c rồi bấm máy tích phân.'
            }
          ]
        }
      ]
    },
    {
      id: 'c5',
      code: 'Chương 5',
      title: 'Phương pháp tọa độ trong không gian',
      group: 'Hình học',
      icon: 'Oxyz',
      summary: 'Nội dung chiếm dung lượng lớn nhất trong phần hình học của đề thi TN THPT, xuất hiện đều ở Phần I, Đúng/Sai (Phần II) và câu tính toán thực tế (Phần III).',
      priority: 3,
      lessons: [
        {
          id: 't12-b14',
          no: 14,
          title: 'Phương trình mặt phẳng',
          week: 8,
          hours: 3.5,
          keyPoints: [
            'Vectơ pháp tuyến n⃗ = (A; B; C) ≠ 0⃗; mặt phẳng qua M(x₀; y₀; z₀) có pt: A(x - x₀) + B(y - y₀) + C(z - z₀) = 0 ⇔ Ax + By + Cz + D = 0',
            'Phương trình đoạn chắn qua A(a; 0; 0), B(0; b; 0), C(0; 0; c): x/a + y/b + z/c = 1 (a, b, c ≠ 0)',
            'Khoảng cách từ điểm M₀(x₀; y₀; z₀) đến mặt phẳng (P): Ax + By + Cz + D = 0 là d(M₀, (P)) = |Ax₀ + By₀ + Cz₀ + D| / √(A² + B² + C²)'
          ],
          forms: [
            { name: 'Xác định vectơ pháp tuyến và điểm thuộc mặt phẳng từ phương trình tổng quát', tier: 'nen', parts: ['I'] },
            { name: 'Lập phương trình mặt phẳng đi qua một điểm và có vectơ pháp tuyến cho trước hoặc song song với mặt phẳng khác', tier: 'nen', parts: ['I'] },
            { name: 'Lập phương trình mặt phẳng trung trực của đoạn thẳng hoặc mặt phẳng theo đoạn chắn', tier: 'nang', parts: ['I', 'II'] },
            { name: 'Tính khoảng cách từ một điểm đến mặt phẳng và bài toán liên quan đến khoảng cách', tier: 'nang', parts: ['I', 'III'] },
            {
              name: 'Lập phương trình mặt phẳng qua 3 điểm hoặc chứa hai vectơ chỉ phương (vectơ pháp tuyến n tính theo công thức trong SGK)',
              tier: 'top',
              parts: ['I', 'II'],
              tip: 'Xác định hai vectơ không cùng phương có giá song song hoặc nằm trong mặt phẳng, tính vectơ pháp tuyến n theo công thức tọa độ trong SGK.'
            }
          ]
        },
        {
          id: 't12-b15',
          no: 15,
          title: 'Phương trình đường thẳng trong không gian',
          week: 9,
          hours: 3.5,
          keyPoints: [
            'Vectơ chỉ phương u⃗ = (a; b; c) ≠ 0⃗; Phương trình tham số qua M₀(x₀; y₀; z₀): x = x₀ + at, y = y₀ + bt, z = z₀ + ct (t ∈ ℝ)',
            'Phương trình chính tắc (khi a, b, c ≠ 0): (x - x₀)/a = (y - y₀)/b = (z - z₀)/c',
            'Vị trí tương đối giữa hai đường thẳng (cắt nhau, song song, chéo nhau, trùng nhau) và giữa đường thẳng với mặt phẳng'
          ],
          forms: [
            { name: 'Tìm vectơ chỉ phương và điểm đi qua của đường thẳng từ phương trình tham số hoặc chính tắc', tier: 'nen', parts: ['I'] },
            { name: 'Viết phương trình tham số, chính tắc của đường thẳng đi qua một điểm và có vectơ chỉ phương u⃗', tier: 'nen', parts: ['I'] },
            { name: 'Viết phương trình đường thẳng đi qua hai điểm phân biệt A, B', tier: 'nen', parts: ['I'] },
            { name: 'Xét vị trí tương đối giữa hai đường thẳng hoặc giữa đường thẳng và mặt phẳng', tier: 'nang', parts: ['I', 'II'] },
            {
              name: 'Xét vị trí tương đối; tìm giao điểm hoặc tính góc giữa hai đường thẳng từ phương trình tham số',
              tier: 'top',
              parts: ['I', 'II'],
              tip: 'Giải hệ phương trình theo hai tham số t, t′ để xác định giao điểm; áp dụng công thức cos giữa hai vectơ chỉ phương để tính góc.'
            }
          ]
        },
        {
          id: 't12-b16',
          no: 16,
          title: 'Công thức tính góc trong không gian',
          week: 9,
          hours: 3.0,
          keyPoints: [
            'Góc giữa hai đường thẳng có VTCP u₁→, u₂→: cos φ = |u₁→·u₂→| / (|u₁→|·|u₂→|) (0° ≤ φ ≤ 90°)',
            'Góc giữa hai mặt phẳng có VTPT n₁→, n₂→: cos α = |n₁→·n₂→| / (|n₁→|·|n₂→|) (0° ≤ α ≤ 90°)',
            'Góc giữa đường thẳng (VTCP u⃗) và mặt phẳng (VTPT n⃗): sin θ = |u⃗·n⃗| / (|u⃗|·|n⃗|) (chú ý dùng sin thay vì cos)'
          ],
          forms: [
            { name: 'Tính góc giữa hai đường thẳng khi biết phương trình hoặc vectơ chỉ phương', tier: 'nen', parts: ['I'] },
            { name: 'Tính góc giữa hai mặt phẳng khi biết phương trình tổng quát', tier: 'nen', parts: ['I'] },
            { name: 'Tính góc giữa đường thẳng và mặt phẳng bằng công thức sin θ = |u⃗·n⃗|/(|u⃗|·|n⃗|)', tier: 'nang', parts: ['I', 'II'] },
            { name: 'Tìm tham số m để góc giữa đường thẳng và mặt phẳng hoặc góc giữa 2 mặt phẳng bằng số đo góc cho trước', tier: 'nang', parts: ['II', 'III'] },
            {
              name: 'Ứng dụng góc Oxyz trong bài toán thực tế: góc tạo bởi mái nhà, đường hầm giao thông, tia chiếu mặt trời',
              tier: 'top',
              parts: ['II', 'III'],
              tip: 'Chuyển mô tả hình học thực tế sang tọa độ vectơ; chú ý kiểm tra góc nhọn theo quy ước góc giữa hai mặt phẳng.'
            }
          ]
        },
        {
          id: 't12-b17',
          no: 17,
          title: 'Phương trình mặt cầu',
          week: 8,
          hours: 3.0,
          keyPoints: [
            'Mặt cầu tâm I(a; b; c) bán kính R có phương trình chính tắc: (x - a)² + (y - b)² + (z - c)² = R²',
            'Phương trình khai triển x² + y² + z² - 2ax - 2by - 2cz + d = 0 là mặt cầu ⇔ a² + b² + c² - d > 0; tâm I(a; b; c), R = √(a² + b² + c² - d)',
            'Vị trí tương đối: d(I, (P)) < R cắt theo đường tròn bán kính r = √(R² - d²); d(I, (P)) = R mặt phẳng tiếp xúc mặt cầu'
          ],
          forms: [
            { name: 'Tìm tâm I và bán kính R của mặt cầu từ phương trình chính tắc hoặc phương trình tổng quát', tier: 'nen', parts: ['I'] },
            { name: 'Lập phương trình mặt cầu biết tâm I và bán kính R, hoặc nhận đoạn AB làm đường kính', tier: 'nen', parts: ['I'] },
            { name: 'Lập phương trình mặt cầu đi qua 4 điểm không đồng phẳng (mặt cầu ngoại tiếp tứ diện)', tier: 'nang', parts: ['I', 'II'] },
            { name: 'Xét vị trí tương đối giữa mặt cầu và mặt phẳng/đường thẳng; tính bán kính đường tròn giao tuyến', tier: 'nang', parts: ['I', 'II', 'III'] },
            {
              name: 'Viết phương trình mặt phẳng tiếp xúc mặt cầu hoặc tìm điểm M trên mặt cầu có khoảng cách cực trị đến mặt phẳng',
              tier: 'top',
              parts: ['I', 'II'],
              tip: 'Tiếp điểm là hình chiếu của tâm I lên tiếp diện; điểm gần nhất/xa nhất là giao điểm của đường thẳng qua I vuông góc với mặt phẳng.'
            }
          ]
        }
      ]
    },
    {
      id: 'c6',
      code: 'Chương 6',
      title: 'Xác suất có điều kiện',
      group: 'Xác suất',
      icon: 'P|',
      summary: 'Nội dung hoàn toàn mới trong chương trình 2018 so với SGK cũ. Thường xuất hiện ở Phần II (Đúng/Sai) và Phần III (Trả lời ngắn về bài toán y tế, kinh doanh).',
      priority: 3,
      lessons: [
        {
          id: 't12-b18',
          no: 18,
          title: 'Xác suất có điều kiện',
          week: 10,
          hours: 3.5,
          keyPoints: [
            'Định nghĩa xác suất của biến cố A khi biết B đã xảy ra (P(B) > 0): P(A|B) = P(A ∩ B) / P(B)',
            'Công thức nhân xác suất: P(A ∩ B) = P(B)·P(A|B) = P(A)·P(B|A); nếu A và B độc lập thì P(A|B) = P(A) và P(A ∩ B) = P(A)·P(B)',
            'Biểu diễn bằng sơ đồ hình cây: nhánh 1 phân tách theo biến cố B và B̄, nhánh 2 phân tách theo biến cố A|B và A|B̄'
          ],
          forms: [
            { name: 'Tính xác suất có điều kiện P(A|B) từ bảng số liệu chéo hai chiều (bảng ngẫu nhiên)', tier: 'nen', parts: ['I'] },
            { name: 'Tính xác suất có điều kiện bằng công thức P(A|B) = n(A ∩ B)/n(B) trong không gian mẫu thu hẹp', tier: 'nen', parts: ['I'] },
            { name: 'Áp dụng công thức nhân xác suất P(A ∩ B) = P(B)·P(A|B) cho bài toán chọn liên tiếp không hoàn lại', tier: 'nang', parts: ['I', 'II'] },
            { name: 'Vẽ và sử dụng sơ đồ cây để tính xác suất của các chuỗi biến cố ngẫu nhiên', tier: 'nang', parts: ['II'] },
            {
              name: 'Giải quyết bài toán xác suất thực tiễn trong kiểm tra chất lượng sản phẩm công nghiệp hoặc thể thao',
              tier: 'top',
              parts: ['II', 'III'],
              tip: 'Phát biểu rõ biến cố điều kiện \'biết rằng...\' để xác định đúng không gian mẫu rút gọn trước khi tính toán.'
            }
          ]
        },
        {
          id: 't12-b19',
          no: 19,
          title: 'Công thức xác suất toàn phần và công thức Bayes',
          week: 11,
          hours: 4.0,
          keyPoints: [
            'Hệ biến cố đầy đủ {B₁, B₂, ..., Bₙ}: các biến cố đôi một xung khắc và B₁ ∪ B₂ ∪ ... ∪ Bₙ = Ω',
            'Công thức xác suất toàn phần (với P(Bᵢ) > 0): P(A) = ∑[i=1→n] P(Bᵢ)·P(A|Bᵢ); với hệ {B, B̄} (0 < P(B) < 1): P(A) = P(B)·P(A|B) + P(B̄)·P(A|B̄)',
            'Công thức Bayes (với P(A) > 0, P(Bₖ) > 0): P(Bₖ|A) = [P(Bₖ)·P(A|Bₖ)] / P(A) (dùng để cập nhật xác suất của nguyên nhân Bₖ sau khi biết biến cố A đã xảy ra)'
          ],
          forms: [
            { name: 'Nhận diện hệ biến cố đầy đủ và viết công thức xác suất toàn phần', tier: 'nen', parts: ['I'] },
            { name: 'Tính xác suất của biến cố A bằng công thức xác suất toàn phần với hai nhóm biến cố B và B̄', tier: 'nen', parts: ['I', 'II'] },
            { name: 'Tính xác suất hậu nghiệm bằng công thức Bayes trong bài toán chẩn đoán y khoa (xét nghiệm âm/dương tính)', tier: 'nang', parts: ['II', 'III'] },
            { name: 'Ứng dụng công thức Bayes trong sàng lọc rủi ro tín dụng hoặc lọc thư rác (spam filter)', tier: 'nang', parts: ['II', 'III'] },
            {
              name: 'Bài toán ra quyết định dựa trên xác suất Bayes với chi phí tổn thất cực tiểu',
              tier: 'top',
              parts: ['II', 'III'],
              tip: 'Lập bảng phân loại gồm Xác suất tiên nghiệm P(Bᵢ) → Xác suất có điều kiện P(A|Bᵢ) → Tích số → Chuẩn hóa ra P(Bᵢ|A).'
            }
          ]
        }
      ]
    },
    {
      id: 'c7',
      code: 'Tổng ôn',
      title: 'Chiến thuật phòng thi & Luyện đề thực chiến',
      group: 'Tổng ôn',
      icon: '10đ',
      summary: 'Rèn luyện kỹ năng phân bổ thời gian 90 phút cho 22 câu, xử lý bẫy ở Phần II Đúng/Sai và kỹ thuật tính toán chính xác để điền số Phần III.',
      priority: 3,
      lessons: [
        {
          id: 't12-r1',
          no: null,
          tag: 'Tổng ôn 1',
          title: 'Chiến thuật tối ưu điểm số Phần I (12 câu) và Phần II (4 câu Đúng/Sai)',
          week: 12,
          hours: 4.0,
          keyPoints: [
            'Phần I (12 câu - 3,0 đ): Tốc độ mục tiêu 15-20 phút; đọc kỹ đề bài, nhận diện nhanh các câu lý thuyết và bấm máy kiểm tra lại để đảm bảo đúng 12/12',
            'Phần II (4 câu Đúng/Sai - 4,0 đ): Phân phối 35–40 phút. Mỗi câu gồm 4 mệnh đề a, b, c, d dùng chung dữ kiện; đánh giá đúng/sai từng mệnh đề độc lập.',
            'Chiến thuật Phần II: Không bao giờ bỏ trống ý; nếu giải được 3 ý chắc chắn thì ý thứ 4 phải cân nhắc kỹ giả thiết hoặc phản chứng để giành trọn vẹn 1,0 điểm'
          ],
          forms: [
            { name: 'Rà soát toàn bộ bẫy lý thuyết và lỗi sai thường gặp trong 12 câu trắc nghiệm Phần I', tier: 'nen', parts: ['I'] },
            { name: 'Kỹ thuật phân tích liên hoàn 4 mệnh đề trong câu hỏi Đúng/Sai Phần II môn Toán', tier: 'nang', parts: ['II'] },
            { name: 'Chiến thuật cô lập mệnh đề khó: kiếm trọn 0,5 điểm (đúng 3 ý) khi gặp câu phân hóa Phần II', tier: 'nang', parts: ['II'] },
            { name: 'Luyện đề chuyên đề tốc độ: giải 12 câu Phần I + 4 câu Phần II trong 55 phút', tier: 'nang', parts: ['I', 'II'] },
            {
              name: 'Phân tích ma trận lỗi sai sau thi thử và cách khắc phục tâm lý phòng thi',
              tier: 'top',
              parts: ['I', 'II'],
              tip: 'Ghi nhật ký sai lầm: phân biệt rõ sai do quên công thức, sai do nhầm số hay sai do bẫy đọc đề.'
            }
          ]
        },
        {
          id: 't12-r2',
          no: null,
          tag: 'Tổng ôn 2',
          title: 'Kỹ thuật xử lý Phần III (6 câu Trả lời ngắn) và Thi thử 3 đề 90 phút',
          week: 12,
          hours: 5.0,
          keyPoints: [
            'Phần III (6 câu - 3,0 đ): Phân phối 25–30 phút; mỗi câu 0,5 điểm. Đáp án Phần III là một giá trị số; đọc đúng yêu cầu làm tròn trong câu hỏi.',
            'Thứ tự ưu tiên làm bài Phần III: Ưu tiên câu số đặc trưng thống kê, hình học Oxyz cơ bản, xác suất có điều kiện rồi mới đến bài toán tối ưu thực tế phức tạp',
            'Thi thử bấm giờ 90 phút nghiêm ngặt: Rèn luyện tâm lý không hoảng loạn khi gặp câu lạ, kiểm tra lại tô phiếu trắc nghiệm và điền số 5 phút cuối'
          ],
          forms: [
            { name: 'Kỹ thuật tính toán và quy chuẩn làm tròn số điền vào phiếu trả lời trắc nghiệm Phần III', tier: 'nen', parts: ['III'] },
            { name: 'Xử lý các câu hỏi Phần III dạng Thống kê số đặc trưng và Xác suất Bayes', tier: 'nang', parts: ['III'] },
            { name: 'Xử lý các câu hỏi Phần III dạng Hình học tọa độ Oxyz và Bài toán tối ưu đạo hàm', tier: 'nang', parts: ['III'] },
            {
              name: 'Thi thử đề số 1 và số 2 chuẩn cấu trúc 2025 bấm giờ 90 phút có chấm điểm chi tiết',
              tier: 'top',
              parts: ['I', 'II', 'III'],
              tip: 'Kiểm soát nhịp độ làm bài: phút thứ 20 xong Phần I, phút thứ 60 xong Phần II, phút thứ 85 xong Phần III, 5 phút soát lại.'
            },
            {
              name: 'Thi thử đề số 3 (đề bứt phá 8+) và hoàn thiện chiến thuật phân bổ thời gian tối ưu',
              tier: 'top',
              parts: ['I', 'II', 'III'],
              tip: 'Bình tĩnh kiểm tra lại các phép tính rút gọn; tuyệt đối không để mất điểm ở các câu trả lời ngắn mà mình đã làm đúng hướng.'
            }
          ]
        }
      ]
    }
  ]
}
