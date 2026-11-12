// Lộ trình Toán 11 – SGK Kết nối tri thức với cuộc sống (35 tuần).
// Dữ liệu tuân theo định dạng dùng chung trong utils/roadmap-schema.js.

export const ROADMAP_MATH_11 = {
  "id": "toan-11",
  "subject": "Toán",
  "grade": 11,
  "kind": "school-year",
  "meta": {
    "title": "Toán 11: học chắc từng chương, không học lan man",
    "subtitle": "Lộ trình 35 tuần bám SGK Kết nối tri thức, học từng bài theo chu trình: hiểu khái niệm → luyện dạng → ghi lỗi sai → tự kiểm tra sau 72 giờ.",
    "badge": "Chuẩn khung SGK Kết nối tri thức",
    "textbook": "Toán 11 – Kết nối tri thức với cuộc sống (NXB Giáo dục Việt Nam)",
    "durationWeeks": 35,
    "hoursPerWeek": "≈ 3",
    "targetScore": "8+",
    "updated": "2026-11-12",
    "tiers": {
      "nen": "Nền tảng",
      "nang": "Nâng cao",
      "top": "Chinh phục 8+"
    },
    "sources": [
      {
        "label": "Mục lục, bài học Toán 11 Kết nối tri thức – VietJack",
        "url": "https://vietjack.com/toan-11-kn/index.jsp"
      },
      {
        "label": "Tài liệu và đề kiểm tra Toán 11 – THI247",
        "url": "https://thi247.com/de-thi-toan-11/"
      }
    ],
    "disclaimer": "Lộ trình mang tính tham chiếu theo SGK Toán 11 Kết nối tri thức; hãy điều chỉnh tiến độ, số tiết và nội dung kiểm tra theo phân phối chương trình của trường.",
    "entranceHomeworkId": null
  },
  "scoreCurve": null,
  "exam": null,
  "stages": [
    {
      "id": "hk1a",
      "name": "HK I · Đại số mở đầu",
      "weeks": [
        1,
        9
      ],
      "desc": "Xây nền lượng giác, dãy số và xử lí số liệu ghép nhóm; kiểm tra giữa kỳ để chốt lỗ hổng."
    },
    {
      "id": "hk1b",
      "name": "HK I · Hình học và giới hạn",
      "weeks": [
        10,
        18
      ],
      "desc": "Làm chủ quan hệ song song trong không gian, giới hạn và hàm số liên tục trước kỳ thi học kỳ I."
    },
    {
      "id": "hk2a",
      "name": "HK II · Mũ, lôgarit và vuông góc",
      "weeks": [
        19,
        27
      ],
      "desc": "Kết nối biến đổi mũ–lôgarit với hình học không gian vuông góc, ưu tiên hình vẽ và điều kiện xác định."
    },
    {
      "id": "hk2b",
      "name": "HK II · Xác suất và đạo hàm",
      "weeks": [
        28,
        35
      ],
      "desc": "Hoàn thiện quy tắc xác suất, đạo hàm và tổng ôn cuối năm theo ba phần I/II/III."
    }
  ],
  "weeks": [
    {
      "n": 1,
      "stage": "hk1a",
      "theme": "Bài 1 · Giá trị lượng giác của góc lượng giác",
      "desc": "Thiết lập góc lượng giác, đường tròn lượng giác và dấu của các giá trị lượng giác.",
      "tags": [
        "Bài 1",
        "Lượng giác",
        "Đường tròn"
      ]
    },
    {
      "n": 2,
      "stage": "hk1a",
      "theme": "Bài 2 · Công thức lượng giác",
      "desc": "Biến đổi bằng công thức cộng, nhân đôi và hạ bậc có kiểm soát điều kiện.",
      "tags": [
        "Bài 2",
        "Công thức",
        "Biến đổi"
      ]
    },
    {
      "n": 3,
      "stage": "hk1a",
      "theme": "Bài 3 · Hàm số lượng giác",
      "desc": "Đọc tập xác định, chu kì, tính chẵn lẻ và đồ thị bốn hàm số lượng giác.",
      "tags": [
        "Bài 3",
        "Đồ thị",
        "Chu kì"
      ]
    },
    {
      "n": 4,
      "stage": "hk1a",
      "theme": "Bài 4 · Phương trình lượng giác cơ bản",
      "desc": "Giải và biểu diễn nghiệm tổng quát của các phương trình sin, cos, tan, cot.",
      "tags": [
        "Bài 4",
        "Phương trình",
        "Nghiệm"
      ]
    },
    {
      "n": 5,
      "stage": "hk1a",
      "theme": "Chương I · Luyện tập lượng giác",
      "desc": "Tổng hợp công thức, đồ thị và phương trình; phân loại lỗi chu kì và nghiệm thiếu.",
      "tags": [
        "Ôn chương I",
        "Lượng giác",
        "Sổ lỗi"
      ]
    },
    {
      "n": 6,
      "stage": "hk1a",
      "theme": "Bài 5 · Dãy số",
      "desc": "Nhận biết dãy số bằng công thức tổng quát, truy hồi và tính đơn điệu.",
      "tags": [
        "Bài 5",
        "Dãy số",
        "uₙ"
      ]
    },
    {
      "n": 7,
      "stage": "hk1a",
      "theme": "Bài 6 · Cấp số cộng",
      "desc": "Khai thác công sai, số hạng tổng quát và tổng n số hạng đầu.",
      "tags": [
        "Bài 6",
        "CSC",
        "Sₙ"
      ]
    },
    {
      "n": 8,
      "stage": "hk1a",
      "theme": "Bài 7 · Cấp số nhân",
      "desc": "Giải bài toán công bội, tổng cấp số nhân và mô hình tăng trưởng.",
      "tags": [
        "Bài 7",
        "CSN",
        "q"
      ]
    },
    {
      "n": 9,
      "stage": "hk1a",
      "theme": "Ôn tập giữa kỳ I",
      "desc": "Củng cố lượng giác và dãy số bằng đề ba phần, ưu tiên câu điều kiện và công thức.",
      "tags": [
        "Giữa kỳ I",
        "Tổng ôn",
        "I/II/III"
      ],
      "milestone": "Kiểm tra giữa kỳ I"
    },
    {
      "n": 10,
      "stage": "hk1b",
      "theme": "Bài 8 · Mẫu số liệu ghép nhóm",
      "desc": "Lập bảng tần số, tần số tương đối và xác định lớp ghép nhóm.",
      "tags": [
        "Bài 8",
        "Thống kê",
        "Tần số"
      ]
    },
    {
      "n": 11,
      "stage": "hk1b",
      "theme": "Bài 9 · Các số đặc trưng đo xu thế trung tâm",
      "desc": "Tính số trung bình, trung vị, mốt cho mẫu số liệu ghép nhóm.",
      "tags": [
        "Bài 9",
        "x̄",
        "Trung vị"
      ]
    },
    {
      "n": 12,
      "stage": "hk1b",
      "theme": "Bài 10 · Đường thẳng và mặt phẳng trong không gian",
      "desc": "Đọc các quan hệ thuộc, giao nhau và giao tuyến qua hình biểu diễn.",
      "tags": [
        "Bài 10",
        "Không gian",
        "Điểm–đường–mặt"
      ]
    },
    {
      "n": 13,
      "stage": "hk1b",
      "theme": "Bài 11 · Hai đường thẳng song song",
      "desc": "Chứng minh và nhận biết hai đường thẳng song song trong không gian.",
      "tags": [
        "Bài 11",
        "Song song",
        "∥"
      ]
    },
    {
      "n": 14,
      "stage": "hk1b",
      "theme": "Bài 12 · Đường thẳng và mặt phẳng song song",
      "desc": "Vận dụng dấu hiệu đường thẳng song song với mặt phẳng và hệ quả.",
      "tags": [
        "Bài 12",
        "d ∥ (P)",
        "Hình học"
      ]
    },
    {
      "n": 15,
      "stage": "hk1b",
      "theme": "Bài 13 · Hai mặt phẳng song song",
      "desc": "Chứng minh, tìm giao tuyến và thiết diện với hai mặt phẳng song song.",
      "tags": [
        "Bài 13",
        "(P) ∥ (Q)",
        "Thiết diện"
      ]
    },
    {
      "n": 16,
      "stage": "hk1b",
      "theme": "Bài 14 · Phép chiếu song song",
      "desc": "Dùng phép chiếu song song để bảo toàn tính song song và tỉ số đơn giản.",
      "tags": [
        "Bài 14",
        "Phép chiếu",
        "Tỉ số"
      ]
    },
    {
      "n": 17,
      "stage": "hk1b",
      "theme": "Bài 15–16 · Giới hạn dãy số và hàm số",
      "desc": "Tính giới hạn bằng quy tắc, kẹp và nhận diện dạng vô định cơ bản.",
      "tags": [
        "Bài 15",
        "Bài 16",
        "lim"
      ]
    },
    {
      "n": 18,
      "stage": "hk1b",
      "theme": "Bài 17 · Hàm số liên tục và tổng ôn HK I",
      "desc": "Xét tính liên tục, làm đề tổng hợp và chốt kiến thức học kỳ I.",
      "tags": [
        "Bài 17",
        "Liên tục",
        "HK I"
      ],
      "milestone": "Kiểm tra cuối kỳ I"
    },
    {
      "n": 19,
      "stage": "hk2a",
      "theme": "Bài 18 · Lũy thừa với số mũ thực",
      "desc": "Củng cố căn thức, lũy thừa hữu tỉ và các quy tắc lũy thừa số mũ thực.",
      "tags": [
        "Bài 18",
        "Lũy thừa",
        "aˣ"
      ]
    },
    {
      "n": 20,
      "stage": "hk2a",
      "theme": "Bài 19 · Lôgarit",
      "desc": "Nắm định nghĩa, điều kiện và các công thức biến đổi lôgarit.",
      "tags": [
        "Bài 19",
        "log",
        "Điều kiện"
      ]
    },
    {
      "n": 21,
      "stage": "hk2a",
      "theme": "Bài 20 · Hàm số mũ và hàm số lôgarit",
      "desc": "Khảo sát tính đơn điệu, đồ thị và sự tương ứng giữa hai hàm ngược.",
      "tags": [
        "Bài 20",
        "Hàm số",
        "Đồ thị"
      ]
    },
    {
      "n": 22,
      "stage": "hk2a",
      "theme": "Bài 21 · Phương trình, bất phương trình mũ và lôgarit",
      "desc": "Đặt điều kiện, đưa về cùng cơ số hoặc dùng tính đơn điệu để giải.",
      "tags": [
        "Bài 21",
        "PT–BPT",
        "Mũ–log"
      ]
    },
    {
      "n": 23,
      "stage": "hk2a",
      "theme": "Bài 22 · Hai đường thẳng vuông góc",
      "desc": "Đọc góc giữa hai đường thẳng và chứng minh vuông góc trong không gian.",
      "tags": [
        "Bài 22",
        "Vuông góc",
        "⊥"
      ]
    },
    {
      "n": 24,
      "stage": "hk2a",
      "theme": "Bài 23 · Đường thẳng vuông góc với mặt phẳng",
      "desc": "Dùng dấu hiệu vuông góc với hai đường cắt nhau trong mặt phẳng.",
      "tags": [
        "Bài 23",
        "d ⊥ (P)",
        "Dấu hiệu"
      ]
    },
    {
      "n": 25,
      "stage": "hk2a",
      "theme": "Bài 24 · Phép chiếu vuông góc và góc",
      "desc": "Xác định hình chiếu, góc giữa đường thẳng với mặt phẳng.",
      "tags": [
        "Bài 24",
        "Hình chiếu",
        "Góc"
      ]
    },
    {
      "n": 26,
      "stage": "hk2a",
      "theme": "Bài 25 · Hai mặt phẳng vuông góc",
      "desc": "Chứng minh hai mặt phẳng vuông góc và khai thác giao tuyến.",
      "tags": [
        "Bài 25",
        "(P) ⊥ (Q)",
        "Hình học"
      ]
    },
    {
      "n": 27,
      "stage": "hk2a",
      "theme": "Bài 26–27 · Khoảng cách và thể tích",
      "desc": "Tính khoảng cách trong khối chóp, lăng trụ và thể tích qua diện tích đáy, chiều cao.",
      "tags": [
        "Bài 26",
        "Bài 27",
        "V"
      ],
      "milestone": "Kiểm tra giữa kỳ II"
    },
    {
      "n": 28,
      "stage": "hk2b",
      "theme": "Bài 28 · Biến cố hợp, giao, độc lập",
      "desc": "Mô tả biến cố bằng tập hợp, xác định hợp, giao, đối và độc lập.",
      "tags": [
        "Bài 28",
        "Biến cố",
        "A ∩ B"
      ]
    },
    {
      "n": 29,
      "stage": "hk2b",
      "theme": "Bài 29 · Công thức cộng xác suất",
      "desc": "Tính xác suất hợp biến cố, chú ý phần giao bị đếm hai lần.",
      "tags": [
        "Bài 29",
        "Xác suất",
        "P(A ∪ B)"
      ]
    },
    {
      "n": 30,
      "stage": "hk2b",
      "theme": "Bài 30 · Công thức nhân xác suất",
      "desc": "Vận dụng công thức nhân cho hai biến cố độc lập và kiểm tra giả thiết.",
      "tags": [
        "Bài 30",
        "Xác suất",
        "P(A)P(B)"
      ]
    },
    {
      "n": 31,
      "stage": "hk2b",
      "theme": "Bài 31 · Định nghĩa và ý nghĩa của đạo hàm",
      "desc": "Hiểu đạo hàm tại một điểm qua giới hạn và ý nghĩa tiếp tuyến, vận tốc.",
      "tags": [
        "Bài 31",
        "Đạo hàm",
        "f′"
      ]
    },
    {
      "n": 32,
      "stage": "hk2b",
      "theme": "Bài 32 · Các quy tắc tính đạo hàm",
      "desc": "Tính đạo hàm bằng quy tắc tổng, tích, thương và hàm hợp đơn giản.",
      "tags": [
        "Bài 32",
        "Quy tắc",
        "f′(x)"
      ]
    },
    {
      "n": 33,
      "stage": "hk2b",
      "theme": "Bài 33 · Đạo hàm cấp hai",
      "desc": "Tính đạo hàm cấp hai và liên hệ với chuyển động, độ cong trực quan.",
      "tags": [
        "Bài 33",
        "f″",
        "Chuyển động"
      ]
    },
    {
      "n": 34,
      "stage": "hk2b",
      "theme": "Tổng ôn chương VIII–IX",
      "desc": "Luyện xác suất và đạo hàm theo từng phần đề; đối chiếu sổ lỗi sai.",
      "tags": [
        "Tổng ôn",
        "Xác suất",
        "Đạo hàm"
      ]
    },
    {
      "n": 35,
      "stage": "hk2b",
      "theme": "Tổng kết Toán 11",
      "desc": "Làm đề cuối năm ba phần, hệ thống hóa công thức và chuẩn bị kiến thức lớp 12.",
      "tags": [
        "Cuối năm",
        "Đề tổng hợp",
        "Lớp 12"
      ],
      "milestone": "Kiểm tra cuối kỳ II"
    }
  ],
  "chapters": [
    {
      "id": "c1",
      "code": "Chương 1",
      "title": "Hàm số lượng giác và phương trình lượng giác",
      "group": "Đại số – Giải tích",
      "icon": "sin",
      "priority": 3,
      "summary": "Nền tảng về góc lượng giác, công thức biến đổi, đồ thị và nghiệm tổng quát của phương trình lượng giác.",
      "lessons": [
        {
          "id": "t11-b1",
          "no": 1,
          "title": "Giá trị lượng giác của góc lượng giác",
          "week": 1,
          "hours": 3,
          "keyPoints": [
            "Góc lượng giác có số đo α + k·360° hoặc α + k·2π.",
            "Trên đường tròn lượng giác: cos α là hoành độ, sin α là tung độ.",
            "tan α = sin α/cos α, cot α = cos α/sin α khi biểu thức xác định."
          ],
          "forms": [
            {
              "name": "Đổi số đo góc từ độ sang radian và ngược lại",
              "tier": "nen",
              "parts": [
                "I",
                "III"
              ]
            },
            {
              "name": "Xác định sin α, cos α, tan α, cot α trên đường tròn lượng giác",
              "tier": "nen",
              "parts": [
                "I",
                "II"
              ]
            },
            {
              "name": "Rút gọn giá trị lượng giác của các góc liên quan đặc biệt",
              "tier": "nen",
              "parts": [
                "I"
              ]
            },
            {
              "name": "Tìm góc lượng giác khi biết dấu và một giá trị lượng giác",
              "tier": "nang",
              "parts": [
                "I",
                "II"
              ]
            },
            {
              "name": "Tính giá trị lượng giác khi biết một giá trị và góc phần tư",
              "tier": "nang",
              "parts": [
                "I",
                "II",
                "III"
              ]
            }
          ]
        },
        {
          "id": "t11-b2",
          "no": 2,
          "title": "Công thức lượng giác",
          "week": 2,
          "hours": 3,
          "keyPoints": [
            "sin(a ± b) = sin a cos b ± cos a sin b.",
            "cos(a ± b) = cos a cos b ∓ sin a sin b.",
            "Công thức nhân đôi suy từ công thức cộng với a = b."
          ],
          "forms": [
            {
              "name": "Áp dụng công thức cộng, hiệu để tính giá trị lượng giác",
              "tier": "nen",
              "parts": [
                "I",
                "III"
              ]
            },
            {
              "name": "Biến đổi biểu thức bằng công thức nhân đôi và hạ bậc",
              "tier": "nen",
              "parts": [
                "I",
                "II"
              ]
            },
            {
              "name": "Chứng minh đẳng thức lượng giác có điều kiện xác định",
              "tier": "nang",
              "parts": [
                "II"
              ]
            },
            {
              "name": "Chứng minh và tìm điều kiện để biểu thức lượng giác xác định",
              "tier": "nang",
              "parts": [
                "I",
                "II"
              ]
            },
            {
              "name": "Rút gọn biểu thức và tìm giá trị lớn nhất, nhỏ nhất lượng giác",
              "tier": "top",
              "parts": [
                "II",
                "III"
              ],
              "tip": "Đưa biểu thức về hàm theo một cung lượng giác duy nhất hoặc đặt ẩn phụ t = sin x ± cos x (|t| ≤ √2) để khảo sát miền giá trị."
            }
          ]
        },
        {
          "id": "t11-b3",
          "no": 3,
          "title": "Hàm số lượng giác",
          "week": 3,
          "hours": 3,
          "keyPoints": [
            "sin x, cos x có chu kì 2π; tan x, cot x có chu kì π.",
            "sin x và tan x là hàm lẻ; cos x và cot x là hàm chẵn.",
            "Tập xác định của tan x loại x = π/2 + kπ; của cot x loại x = kπ."
          ],
          "forms": [
            {
              "name": "Nhận diện đồ thị y = sin x, cos x, tan x, cot x",
              "tier": "nen",
              "parts": [
                "I"
              ]
            },
            {
              "name": "Xét tính chẵn lẻ và sự biến thiên trên một chu kì",
              "tier": "nen",
              "parts": [
                "I",
                "II"
              ]
            },
            {
              "name": "Tìm tập xác định, tập giá trị và chu kì của hàm lượng giác",
              "tier": "nang",
              "parts": [
                "I",
                "II"
              ]
            },
            {
              "name": "Đọc đồ thị để giải phương trình và bất phương trình lượng giác",
              "tier": "nang",
              "parts": [
                "I",
                "II",
                "III"
              ]
            },
            {
              "name": "Tìm tham số để hàm số lượng giác có chu kì hoặc tập xác định cho trước",
              "tier": "top",
              "parts": [
                "II",
                "III"
              ],
              "tip": "Đặt ẩn phụ t = sin x hoặc cos x đưa mẫu thức về tam thức bậc hai theo t trên đoạn [−1; 1], sau đó dùng điều kiện tam thức vô nghiệm để hàm xác định trên ℝ."
            }
          ]
        },
        {
          "id": "t11-b4",
          "no": 4,
          "title": "Phương trình lượng giác cơ bản",
          "week": 4,
          "hours": 3,
          "keyPoints": [
            "sin x = sin α ⇔ x = α + k·2π hoặc x = π − α + k·2π (k ∈ ℤ).",
            "cos x = cos α ⇔ x = ±α + k·2π; tan x = tan α ⇔ x = α + k·π (k ∈ ℤ).",
            "cot x = cot α ⇔ x = α + k·π, với các biểu thức tan, cot phải có điều kiện xác định."
          ],
          "forms": [
            {
              "name": "Giải sin x = a, cos x = a với a là giá trị đặc biệt",
              "tier": "nen",
              "parts": [
                "I"
              ]
            },
            {
              "name": "Giải tan x = a, cot x = a và kiểm tra điều kiện xác định",
              "tier": "nen",
              "parts": [
                "I",
                "II"
              ]
            },
            {
              "name": "Tìm nghiệm thuộc khoảng, đoạn cho trước và đếm số nghiệm",
              "tier": "nang",
              "parts": [
                "I",
                "II",
                "III"
              ],
              "tip": "Liệt kê các họ nghiệm chứa số nguyên k, sau đó giải bất phương trình kép α ≤ x(k) ≤ β để đếm chính xác số giá trị k hợp lệ."
            },
            {
              "name": "Đưa phương trình về dạng cơ bản bằng công thức lượng giác",
              "tier": "nang",
              "parts": [
                "I",
                "II"
              ]
            },
            {
              "name": "Bài toán mô hình dao động điều hòa hoặc vòng quay",
              "tier": "top",
              "parts": [
                "II",
                "III"
              ],
              "tip": "Đồng nhất các hệ số trong hàm số h(t) = A·cos(ωt + φ) + B với biên độ và chu kì thực tế trước khi giải phương trình tìm thời điểm t ≥ 0 sớm nhất."
            }
          ]
        }
      ]
    },
    {
      "id": "c2",
      "code": "Chương 2",
      "title": "Dãy số. Cấp số cộng và cấp số nhân",
      "group": "Đại số – Giải tích",
      "icon": "uₙ",
      "priority": 3,
      "summary": "Mô tả quy luật dãy số, nhận diện cấp số cộng và cấp số nhân, tính số hạng và tổng hữu hạn.",
      "lessons": [
        {
          "id": "t11-b5",
          "no": 5,
          "title": "Dãy số",
          "week": 6,
          "hours": 3,
          "keyPoints": [
            "Dãy số là hàm số xác định trên tập số nguyên dương.",
            "Dãy có thể cho bằng công thức uₙ hoặc hệ thức truy hồi.",
            "So sánh uₙ₊₁ và uₙ để xét tăng, giảm hoặc bị chặn."
          ],
          "forms": [
            {
              "name": "Viết số hạng uₙ từ công thức tổng quát",
              "tier": "nen",
              "parts": [
                "I",
                "III"
              ]
            },
            {
              "name": "Xét tính tăng giảm của dãy qua uₙ₊₁ − uₙ",
              "tier": "nen",
              "parts": [
                "I",
                "II"
              ]
            },
            {
              "name": "Lập và khai thác dãy số cho bởi hệ thức truy hồi",
              "tier": "nang",
              "parts": [
                "I",
                "II"
              ]
            },
            {
              "name": "Tìm số hạng của dãy thỏa bất đẳng thức hoặc điều kiện chỉ số",
              "tier": "nang",
              "parts": [
                "I",
                "II",
                "III"
              ]
            },
            {
              "name": "Tìm giới hạn trên, dưới và số hạng thỏa điều kiện",
              "tier": "top",
              "parts": [
                "II",
                "III"
              ],
              "tip": "Biến đổi công thức uₙ về dạng hằng số cộng phân thức bậc thấp hơn hoặc áp dụng bất đẳng thức AM-GM để chứng minh dãy số bị chặn."
            }
          ]
        },
        {
          "id": "t11-b6",
          "no": 6,
          "title": "Cấp số cộng",
          "week": 7,
          "hours": 3,
          "keyPoints": [
            "CSC thỏa uₙ₊₁ = uₙ + d với d là công sai.",
            "uₙ = u₁ + (n − 1)d.",
            "Sₙ = n(u₁ + uₙ)/2."
          ],
          "forms": [
            {
              "name": "Nhận biết cấp số cộng và xác định công sai d",
              "tier": "nen",
              "parts": [
                "I"
              ]
            },
            {
              "name": "Tính tổng Sₙ của cấp số cộng hữu hạn",
              "tier": "nen",
              "parts": [
                "I",
                "III"
              ]
            },
            {
              "name": "Tìm uₙ, số hạng đầu hoặc công sai của cấp số cộng",
              "tier": "nang",
              "parts": [
                "I",
                "II",
                "III"
              ]
            },
            {
              "name": "Bài toán xếp hàng, gửi tiết kiệm tăng đều theo cấp số cộng",
              "tier": "top",
              "parts": [
                "II",
                "III"
              ],
              "tip": "Mô hình hóa số lượng từng bước thành cấp số cộng với số hạng đầu u₁ và công sai d; áp dụng công thức tổng Sₙ = n/2·(2u₁ + (n−1)d) để giải tìm số bước n."
            }
          ]
        },
        {
          "id": "t11-b7",
          "no": 7,
          "title": "Cấp số nhân",
          "week": 8,
          "hours": 3,
          "keyPoints": [
            "CSN thỏa uₙ₊₁ = q·uₙ với q là công bội.",
            "uₙ = u₁qⁿ⁻¹.",
            "Sₙ = u₁(qⁿ − 1)/(q − 1) khi q ≠ 1."
          ],
          "forms": [
            {
              "name": "Nhận biết cấp số nhân và xác định công bội q",
              "tier": "nen",
              "parts": [
                "I"
              ]
            },
            {
              "name": "Tìm uₙ và Sₙ của cấp số nhân",
              "tier": "nen",
              "parts": [
                "I",
                "III"
              ]
            },
            {
              "name": "Xác định tham số để ba số lập thành cấp số nhân",
              "tier": "nang",
              "parts": [
                "I",
                "II",
                "III"
              ]
            },
            {
              "name": "Bài toán tăng trưởng, suy giảm theo cấp số nhân",
              "tier": "top",
              "parts": [
                "II",
                "III"
              ],
              "tip": "Xác định công bội q = 1 + r khi tăng trưởng hoặc q = 1 − r khi suy giảm; lấy logarit hai vế để tìm số chu kì thời gian n nguyên dương."
            }
          ]
        }
      ]
    },
    {
      "id": "c3",
      "code": "Chương 3",
      "title": "Các số đặc trưng đo xu thế trung tâm của mẫu số liệu ghép nhóm",
      "group": "Thống kê – Xác suất",
      "icon": "x̄",
      "priority": 2,
      "summary": "Tổ chức dữ liệu ghép nhóm và ước lượng số trung bình, trung vị, mốt từ bảng tần số.",
      "lessons": [
        {
          "id": "t11-b8",
          "no": 8,
          "title": "Mẫu số liệu ghép nhóm",
          "week": 10,
          "hours": 3,
          "keyPoints": [
            "Mẫu số liệu ghép nhóm được chia thành các lớp có khoảng lớp xác định.",
            "Tần số là số giá trị thuộc một lớp; tần số tương đối bằng tần số chia cỡ mẫu.",
            "Giá trị đại diện của lớp là trung điểm của khoảng lớp."
          ],
          "forms": [
            {
              "name": "Lập bảng tần số và tần số tương đối cho mẫu ghép nhóm",
              "tier": "nen",
              "parts": [
                "I",
                "II"
              ]
            },
            {
              "name": "Xác định khoảng biến thiên, độ dài lớp và giá trị đại diện",
              "tier": "nen",
              "parts": [
                "I"
              ]
            },
            {
              "name": "Đọc biểu đồ tần số, tần suất của số liệu ghép nhóm",
              "tier": "nen",
              "parts": [
                "I",
                "II"
              ]
            },
            {
              "name": "Chọn cách ghép nhóm phù hợp từ số liệu thực tế",
              "tier": "nang",
              "parts": [
                "I",
                "II"
              ]
            }
          ]
        },
        {
          "id": "t11-b9",
          "no": 9,
          "title": "Các số đặc trưng đo xu thế trung tâm",
          "week": 11,
          "hours": 3,
          "keyPoints": [
            "Số trung bình ghép nhóm dùng giá trị đại diện và tần số.",
            "Lớp chứa trung vị được xác định qua tần số tích lũy.",
            "Mốt ghép nhóm được ước lượng từ lớp có tần số lớn nhất."
          ],
          "forms": [
            {
              "name": "Tính số trung bình cộng x̄ của mẫu số liệu ghép nhóm",
              "tier": "nen",
              "parts": [
                "I",
                "III"
              ]
            },
            {
              "name": "Xác định lớp chứa trung vị qua tần số tích lũy",
              "tier": "nen",
              "parts": [
                "I",
                "II"
              ]
            },
            {
              "name": "So sánh xu thế trung tâm của hai mẫu số liệu",
              "tier": "nang",
              "parts": [
                "I",
                "II"
              ]
            },
            {
              "name": "Ước lượng trung vị và mốt của mẫu ghép nhóm",
              "tier": "top",
              "parts": [
                "II",
                "III"
              ],
              "tip": "Tìm lớp [u_m; u_{m+1}) chứa trung vị bằng tần số tích lũy cf_m ≥ n/2 trước khi thay vào công thức nội suy M_e = u_m + (n/2 − cf_{m−1})/n_m · (u_{m+1} − u_m)."
            }
          ]
        }
      ]
    },
    {
      "id": "c4",
      "code": "Chương 4",
      "title": "Quan hệ song song trong không gian",
      "group": "Hình học không gian",
      "icon": "∥",
      "priority": 3,
      "summary": "Xây dựng tư duy hình học không gian qua các quan hệ thuộc, giao nhau, song song và phép chiếu song song.",
      "lessons": [
        {
          "id": "t11-b10",
          "no": 10,
          "title": "Đường thẳng và mặt phẳng trong không gian",
          "week": 12,
          "hours": 3,
          "keyPoints": [
            "Qua ba điểm không thẳng hàng xác định một mặt phẳng.",
            "Hai mặt phẳng phân biệt hoặc song song, hoặc cắt nhau theo một đường thẳng.",
            "Giao tuyến là đường thẳng chung của hai mặt phẳng cắt nhau."
          ],
          "forms": [
            {
              "name": "Xác định giao tuyến của hai mặt phẳng bằng hai điểm chung",
              "tier": "nen",
              "parts": [
                "I",
                "II"
              ]
            },
            {
              "name": "Xét quan hệ thuộc, cắt nhau giữa điểm, đường thẳng và mặt phẳng",
              "tier": "nen",
              "parts": [
                "I"
              ]
            },
            {
              "name": "Tìm giao điểm của đường thẳng với mặt phẳng",
              "tier": "nang",
              "parts": [
                "I",
                "II"
              ]
            },
            {
              "name": "Dựng thiết diện của hình chóp qua các điểm cho trước",
              "tier": "top",
              "parts": [
                "II",
                "III"
              ],
              "tip": "Kéo dài các cặp đường thẳng đồng phẳng để tìm thêm giao điểm mới trên các cạnh chưa cắt, giúp mở rộng mặt phẳng và khép kín thiết diện."
            }
          ]
        },
        {
          "id": "t11-b11",
          "no": 11,
          "title": "Hai đường thẳng song song",
          "week": 13,
          "hours": 3,
          "keyPoints": [
            "Hai đường thẳng đồng phẳng không có điểm chung thì song song.",
            "Nếu hai đường thẳng cùng song song với đường thẳng thứ ba thì chúng song song nhau.",
            "Đường thẳng song song với một trong hai đường thẳng song song thì đồng phẳng với đường còn lại."
          ],
          "forms": [
            {
              "name": "Dùng định lí Thales để tính tỉ số đoạn thẳng",
              "tier": "nen",
              "parts": [
                "I",
                "III"
              ]
            },
            {
              "name": "Xác định vị trí tương đối của hai đường thẳng",
              "tier": "nen",
              "parts": [
                "I"
              ]
            },
            {
              "name": "Tìm giao tuyến song song trong hình chóp",
              "tier": "nang",
              "parts": [
                "I",
                "II"
              ]
            },
            {
              "name": "Chứng minh hai đường thẳng song song trong không gian",
              "tier": "top",
              "parts": [
                "II"
              ],
              "tip": "Tìm một mặt phẳng thứ ba cắt hai mặt phẳng lần lượt chứa hai đường thẳng để chuyển bài toán về tính chất giao tuyến song song."
            }
          ]
        },
        {
          "id": "t11-b12",
          "no": 12,
          "title": "Đường thẳng và mặt phẳng song song",
          "week": 14,
          "hours": 3,
          "keyPoints": [
            "d song song (P) khi d không nằm trong (P) và không có điểm chung với (P).",
            "Nếu d song song với một đường thẳng a nằm trong (P), thì d song song (P).",
            "Mặt phẳng qua d và cắt (P) tạo giao tuyến song song d."
          ],
          "forms": [
            {
              "name": "Chứng minh đường thẳng song song với mặt phẳng",
              "tier": "nen",
              "parts": [
                "I",
                "II"
              ]
            },
            {
              "name": "Tìm giao tuyến của mặt phẳng chứa đường thẳng song song",
              "tier": "nang",
              "parts": [
                "I",
                "II"
              ]
            },
            {
              "name": "Tính tỉ số đoạn thẳng bằng định lí ba mặt phẳng",
              "tier": "top",
              "parts": [
                "II",
                "III"
              ],
              "tip": "Khai thác định lí giao tuyến của ba mặt phẳng cắt nhau từng đôi một để thiết lập tỉ số đồng dạng hoặc định lí Menelaus trên các mặt của hình chóp."
            },
            {
              "name": "Dựng thiết diện qua đường thẳng song song với mặt phẳng",
              "tier": "top",
              "parts": [
                "II",
                "III"
              ],
              "tip": "Kẻ các đoạn giao tuyến song song với đường thẳng đã cho trên từng mặt của hình đa diện để tạo các cạnh của thiết diện."
            }
          ]
        },
        {
          "id": "t11-b13",
          "no": 13,
          "title": "Hai mặt phẳng song song",
          "week": 15,
          "hours": 3,
          "keyPoints": [
            "Hai mặt phẳng không có điểm chung thì song song.",
            "Nếu hai đường thẳng cắt nhau của (P) lần lượt song song với hai đường thẳng cắt nhau của (Q), thì (P) ∥ (Q).",
            "Hai mặt phẳng song song cắt mặt phẳng thứ ba theo các giao tuyến song song."
          ],
          "forms": [
            {
              "name": "Chứng minh hai mặt phẳng song song",
              "tier": "nen",
              "parts": [
                "I",
                "II"
              ]
            },
            {
              "name": "Tìm giao tuyến song song khi hai mặt phẳng bị cắt",
              "tier": "nen",
              "parts": [
                "I",
                "II"
              ]
            },
            {
              "name": "Tính độ dài đoạn thẳng giữa hai mặt phẳng song song",
              "tier": "nang",
              "parts": [
                "I",
                "II",
                "III"
              ]
            },
            {
              "name": "Dựng thiết diện trong hình chóp có mặt phẳng song song đáy",
              "tier": "top",
              "parts": [
                "II",
                "III"
              ],
              "tip": "Thiết diện song song với mặt phẳng đáy là một đa giác đồng dạng với đa giác đáy, với tỉ số đồng dạng bằng tỉ số khoảng cách từ đỉnh chóp."
            }
          ]
        },
        {
          "id": "t11-b14",
          "no": 14,
          "title": "Phép chiếu song song",
          "week": 16,
          "hours": 3,
          "keyPoints": [
            "Phép chiếu song song biến điểm thành điểm theo phương chiếu cố định.",
            "Phép chiếu song song bảo toàn tính thẳng hàng và tính song song.",
            "Tỉ số các đoạn thẳng cùng nằm trên một đường thẳng được bảo toàn."
          ],
          "forms": [
            {
              "name": "Xác định hình chiếu song song của điểm và đường thẳng",
              "tier": "nen",
              "parts": [
                "I",
                "II"
              ]
            },
            {
              "name": "Nhận diện hình chiếu của tam giác và tứ giác trong không gian",
              "tier": "nen",
              "parts": [
                "I"
              ]
            },
            {
              "name": "Tính tỉ số đoạn thẳng qua hình chiếu song song",
              "tier": "nang",
              "parts": [
                "I",
                "II",
                "III"
              ]
            },
            {
              "name": "Dùng phép chiếu song song bảo toàn tính song song",
              "tier": "top",
              "parts": [
                "II"
              ],
              "tip": "Phép chiếu song song bảo toàn tính thẳng hàng, thứ tự điểm và tỉ số độ dài các đoạn thẳng cùng phương nhưng không bảo toàn độ lớn của góc."
            }
          ]
        }
      ]
    },
    {
      "id": "c5",
      "code": "Chương 5",
      "title": "Giới hạn. Hàm số liên tục",
      "group": "Đại số – Giải tích",
      "icon": "lim",
      "priority": 3,
      "summary": "Làm chủ ngôn ngữ giới hạn của dãy và hàm số, từ đó nhận biết tính liên tục trên tập xác định.",
      "lessons": [
        {
          "id": "t11-b15",
          "no": 15,
          "title": "Giới hạn của dãy số",
          "week": 17,
          "hours": 3,
          "keyPoints": [
            "lim uₙ = L khi uₙ tiến gần L khi n tăng vô hạn.",
            "Có thể dùng quy tắc giới hạn, dãy không đổi hoặc định lí kẹp.",
            "Dãy hình học qⁿ có giới hạn 0 khi |q| < 1."
          ],
          "forms": [
            {
              "name": "Tính giới hạn dãy hằng, dãy hình học và dãy phân thức",
              "tier": "nen",
              "parts": [
                "I",
                "III"
              ]
            },
            {
              "name": "Khử dạng ∞/∞ bằng cách chia cho lũy thừa bậc cao nhất",
              "tier": "nang",
              "parts": [
                "I",
                "II",
                "III"
              ]
            },
            {
              "name": "Dùng định lí kẹp để tìm giới hạn dãy số",
              "tier": "nang",
              "parts": [
                "I",
                "II"
              ]
            },
            {
              "name": "Tìm tham số để dãy số có giới hạn cho trước",
              "tier": "top",
              "parts": [
                "II",
                "III"
              ],
              "tip": "Với dạng vô định ∞ − ∞ chứa căn bậc hai, nhân lượng liên hợp rồi cân bằng bậc của tử và mẫu để triệt tiêu số hạng bậc cao nhất."
            }
          ]
        },
        {
          "id": "t11-b16",
          "no": 16,
          "title": "Giới hạn của hàm số",
          "week": 17,
          "hours": 3,
          "keyPoints": [
            "Giới hạn của hàm số mô tả xu thế của f(x) khi x tiến tới một giá trị.",
            "Quy tắc đại số áp dụng khi các giới hạn thành phần hữu hạn.",
            "Khử dạng 0/0 bằng phân tích nhân tử hoặc nhân liên hợp phù hợp."
          ],
          "forms": [
            {
              "name": "Tính giới hạn hàm đa thức và phân thức tại một điểm",
              "tier": "nen",
              "parts": [
                "I",
                "III"
              ]
            },
            {
              "name": "Xét giới hạn một bên và giới hạn vô cực của hàm số",
              "tier": "nen",
              "parts": [
                "I",
                "II"
              ]
            },
            {
              "name": "Khử dạng 0/0 bằng phân tích nhân tử",
              "tier": "nang",
              "parts": [
                "I",
                "II",
                "III"
              ]
            },
            {
              "name": "Tính giới hạn chứa căn thức bằng nhân liên hợp",
              "tier": "top",
              "parts": [
                "II",
                "III"
              ],
              "tip": "Nhân cả tử và mẫu với lượng liên hợp phù hợp để khử căn gây ra dạng vô định 0/0, làm xuất hiện nhân tử chung (x − x₀) rồi rút gọn."
            }
          ]
        },
        {
          "id": "t11-b17",
          "no": 17,
          "title": "Hàm số liên tục",
          "week": 18,
          "hours": 3,
          "keyPoints": [
            "f liên tục tại x₀ khi lim f(x) = f(x₀).",
            "Đa thức liên tục trên ℝ; phân thức liên tục tại nơi mẫu khác 0.",
            "Hàm liên tục trên đoạn nhận mọi giá trị trung gian giữa hai giá trị đầu mút."
          ],
          "forms": [
            {
              "name": "Xét tính liên tục của đa thức và hàm phân thức",
              "tier": "nen",
              "parts": [
                "I"
              ]
            },
            {
              "name": "Nhận diện điểm gián đoạn qua đồ thị và biểu thức",
              "tier": "nen",
              "parts": [
                "I",
                "II"
              ]
            },
            {
              "name": "Tìm tham số để hàm số từng đoạn liên tục tại điểm ghép",
              "tier": "nang",
              "parts": [
                "I",
                "II",
                "III"
              ]
            },
            {
              "name": "Áp dụng định lí giá trị trung gian để chứng minh có nghiệm",
              "tier": "top",
              "parts": [
                "II"
              ],
              "tip": "Khẳng định f(x) liên tục trên đoạn [a; b] và tính tích f(a)·f(b) < 0 để kết luận phương trình có ít nhất một nghiệm trong khoảng (a; b)."
            }
          ]
        }
      ]
    },
    {
      "id": "c6",
      "code": "Chương 6",
      "title": "Hàm số mũ và hàm số lôgarit",
      "group": "Đại số – Giải tích",
      "icon": "log",
      "priority": 3,
      "summary": "Biến đổi lũy thừa–lôgarit, khảo sát hàm số và giải phương trình, bất phương trình mũ lôgarit.",
      "lessons": [
        {
          "id": "t11-b18",
          "no": 18,
          "title": "Lũy thừa với số mũ thực",
          "week": 19,
          "hours": 3,
          "keyPoints": [
            "aˣ xác định với a > 0 cho mọi số mũ thực x.",
            "aˣ·aʸ = aˣ⁺ʸ và (aˣ)ʸ = aˣʸ.",
            "Nếu 0 < a < 1 thì aˣ là hàm giảm; nếu a > 1 thì là hàm tăng."
          ],
          "forms": [
            {
              "name": "Rút gọn biểu thức lũy thừa với số mũ hữu tỉ",
              "tier": "nen",
              "parts": [
                "I",
                "II"
              ]
            },
            {
              "name": "So sánh các lũy thừa cùng cơ số dương",
              "tier": "nen",
              "parts": [
                "I"
              ]
            },
            {
              "name": "Giải phương trình chứa căn bằng cách đổi sang số mũ",
              "tier": "nang",
              "parts": [
                "I",
                "II",
                "III"
              ]
            },
            {
              "name": "Bài toán lãi kép dùng công thức A = P(1 + r)ⁿ",
              "tier": "top",
              "parts": [
                "II",
                "III"
              ],
              "tip": "Xác định rõ số kì hạn n và lãi suất r trên một kì hạn tương ứng (tháng, quý, năm) trước khi áp dụng công thức A = P(1 + r)ⁿ."
            }
          ]
        },
        {
          "id": "t11-b19",
          "no": 19,
          "title": "Lôgarit",
          "week": 20,
          "hours": 3,
          "keyPoints": [
            "logₐb xác định khi a > 0, a ≠ 1, b > 0.",
            "logₐ(MN) = logₐM + logₐN và logₐ(Mⁿ) = nlogₐM.",
            "Đổi cơ số: logₐb = logcb/logca."
          ],
          "forms": [
            {
              "name": "Tìm điều kiện xác định của biểu thức lôgarit",
              "tier": "nen",
              "parts": [
                "I",
                "II"
              ]
            },
            {
              "name": "Tính và biến đổi logarit bằng công thức tích, thương, lũy thừa",
              "tier": "nen",
              "parts": [
                "I",
                "III"
              ]
            },
            {
              "name": "Đổi cơ số và so sánh các giá trị lôgarit",
              "tier": "nang",
              "parts": [
                "I",
                "II",
                "III"
              ]
            },
            {
              "name": "Rút gọn biểu thức lôgarit có tham số",
              "tier": "top",
              "parts": [
                "II",
                "III"
              ],
              "tip": "Chuyển đổi tất cả các số hạng logarit về một cơ số nguyên tố trung gian bằng công thức log_a b = log_c b / log_c a trước khi thế biểu thức tham số."
            }
          ]
        },
        {
          "id": "t11-b20",
          "no": 20,
          "title": "Hàm số mũ và hàm số lôgarit",
          "week": 21,
          "hours": 3,
          "keyPoints": [
            "y = aˣ có miền xác định ℝ và giá trị dương.",
            "y = logₐx có miền xác định x > 0 và là hàm ngược của y = aˣ.",
            "Tính đơn điệu phụ thuộc a > 1 hoặc 0 < a < 1."
          ],
          "forms": [
            {
              "name": "Khảo sát tập xác định, tập giá trị của hàm mũ và logarit",
              "tier": "nen",
              "parts": [
                "I"
              ]
            },
            {
              "name": "Xét tính đơn điệu theo điều kiện cơ số a",
              "tier": "nen",
              "parts": [
                "I",
                "II"
              ]
            },
            {
              "name": "Nhận diện và phác họa đồ thị hàm mũ, logarit",
              "tier": "nen",
              "parts": [
                "I",
                "II"
              ]
            },
            {
              "name": "Tìm giao điểm đồ thị và giải bài toán đọc đồ thị",
              "tier": "top",
              "parts": [
                "II",
                "III"
              ],
              "tip": "Kẻ đường thẳng x = 1 cắt đồ thị các hàm mũ để so sánh trực tiếp cơ số qua tung độ giao điểm y = a."
            }
          ]
        },
        {
          "id": "t11-b21",
          "no": 21,
          "title": "Phương trình, bất phương trình mũ và lôgarit",
          "week": 22,
          "hours": 3,
          "keyPoints": [
            "Có thể đưa hai vế về cùng cơ số để giải phương trình mũ.",
            "Tính đơn điệu của hàm mũ hoặc logarit giúp so sánh số mũ, số bị log.",
            "Bất phương trình lôgarit luôn kèm điều kiện số bị log dương."
          ],
          "forms": [
            {
              "name": "Giải phương trình mũ bằng đưa về cùng cơ số",
              "tier": "nen",
              "parts": [
                "I"
              ]
            },
            {
              "name": "Giải bất phương trình mũ theo tính đơn điệu của cơ số",
              "tier": "nen",
              "parts": [
                "I",
                "II"
              ]
            },
            {
              "name": "Giải phương trình lôgarit kèm điều kiện xác định",
              "tier": "nang",
              "parts": [
                "I",
                "II",
                "III"
              ]
            },
            {
              "name": "Giải bất phương trình lôgarit và loại nghiệm ngoại lai",
              "tier": "nang",
              "parts": [
                "I",
                "II",
                "III"
              ]
            },
            {
              "name": "Bài toán lãi suất, tăng trưởng và thời gian đạt ngưỡng",
              "tier": "top",
              "parts": [
                "II",
                "III"
              ],
              "tip": "Lấy logarit hai vế phương trình mũ để tìm thời gian n; làm tròn lên số nguyên tiếp theo khi đề bài yêu cầu số chu kì tối thiểu để vượt ngưỡng."
            }
          ]
        }
      ]
    },
    {
      "id": "c7",
      "code": "Chương 7",
      "title": "Quan hệ vuông góc trong không gian",
      "group": "Hình học không gian",
      "icon": "⊥",
      "priority": 3,
      "summary": "Chứng minh vuông góc, xác định hình chiếu, góc, khoảng cách và thể tích trong các hình không gian cơ bản.",
      "lessons": [
        {
          "id": "t11-b22",
          "no": 22,
          "title": "Hai đường thẳng vuông góc",
          "week": 23,
          "hours": 3,
          "keyPoints": [
            "Góc giữa hai đường thẳng là góc giữa hai đường thẳng cắt nhau lần lượt song song với chúng.",
            "Hai đường thẳng vuông góc khi góc giữa chúng bằng 90°.",
            "Quan hệ vuông góc được bảo toàn qua các đường thẳng song song tương ứng."
          ],
          "forms": [
            {
              "name": "Chứng minh hai đường thẳng vuông góc trong hình chóp",
              "tier": "nen",
              "parts": [
                "I",
                "II"
              ]
            },
            {
              "name": "Tính góc giữa hai đường thẳng chéo nhau",
              "tier": "nang",
              "parts": [
                "I",
                "II",
                "III"
              ]
            },
            {
              "name": "Dựng đường thẳng song song để xác định góc giữa hai đường",
              "tier": "nang",
              "parts": [
                "I",
                "II"
              ]
            },
            {
              "name": "Khai thác tam giác vuông trong thiết diện để tính độ dài",
              "tier": "top",
              "parts": [
                "II",
                "III"
              ],
              "tip": "Áp dụng định lí Pythagore và hệ thức lượng trong các mặt phẳng thiết diện vuông góc để tính các cạnh trung gian của hình đa diện."
            }
          ]
        },
        {
          "id": "t11-b23",
          "no": 23,
          "title": "Đường thẳng vuông góc với mặt phẳng",
          "week": 24,
          "hours": 3,
          "keyPoints": [
            "d ⊥ (P) khi d vuông góc với mọi đường thẳng trong (P) đi qua chân đường vuông góc.",
            "Chỉ cần d vuông góc với hai đường thẳng cắt nhau nằm trong (P) để kết luận d ⊥ (P).",
            "Nếu d ⊥ (P) thì d vuông góc với mọi đường thẳng thuộc (P)."
          ],
          "forms": [
            {
              "name": "Xác định chân đường vuông góc từ một điểm đến mặt phẳng",
              "tier": "nen",
              "parts": [
                "I"
              ]
            },
            {
              "name": "Suy ra các quan hệ vuông góc từ d ⊥ (P)",
              "tier": "nen",
              "parts": [
                "I",
                "II"
              ]
            },
            {
              "name": "Chứng minh đường thẳng vuông góc với mặt phẳng",
              "tier": "nang",
              "parts": [
                "I",
                "II"
              ]
            },
            {
              "name": "Bài toán hình chóp có cạnh bên vuông góc với đáy",
              "tier": "top",
              "parts": [
                "II",
                "III"
              ],
              "tip": "Khai thác tính chất cạnh bên vuông góc đáy để nhận diện các mặt bên chứa cạnh đó là các tam giác vuông tại chân đường cao."
            }
          ]
        },
        {
          "id": "t11-b24",
          "no": 24,
          "title": "Phép chiếu vuông góc. Góc giữa đường thẳng và mặt phẳng",
          "week": 25,
          "hours": 3,
          "keyPoints": [
            "Hình chiếu vuông góc của điểm lên mặt phẳng là chân đường vuông góc.",
            "Góc giữa d và (P) là góc giữa d với hình chiếu của d trên (P).",
            "Nếu d ⊥ (P), góc giữa d và (P) bằng 90°."
          ],
          "forms": [
            {
              "name": "Dựng hình chiếu vuông góc của điểm và đường thẳng",
              "tier": "nen",
              "parts": [
                "I",
                "II"
              ]
            },
            {
              "name": "Bài toán góc nghiêng của mái nhà, dốc hoặc đường bay",
              "tier": "nen",
              "parts": [
                "I",
                "III"
              ]
            },
            {
              "name": "Tính độ dài hình chiếu của đoạn thẳng lên mặt phẳng",
              "tier": "nang",
              "parts": [
                "I",
                "II",
                "III"
              ]
            },
            {
              "name": "Tính góc giữa đường thẳng và mặt phẳng",
              "tier": "top",
              "parts": [
                "II",
                "III"
              ],
              "tip": "Xác định giao điểm của đường thẳng với mặt phẳng và hình chiếu của một điểm còn lại; góc cần tìm luôn nằm trong tam giác vuông tạo bởi đỉnh, hình chiếu và giao điểm."
            }
          ]
        },
        {
          "id": "t11-b25",
          "no": 25,
          "title": "Hai mặt phẳng vuông góc",
          "week": 26,
          "hours": 3,
          "keyPoints": [
            "(P) ⊥ (Q) khi một mặt phẳng chứa đường thẳng vuông góc với mặt phẳng kia.",
            "Góc giữa hai mặt phẳng được đo bằng góc giữa hai đường thẳng cùng vuông góc với giao tuyến.",
            "Nếu (P) ⊥ (Q), đường trong (P) vuông góc giao tuyến thì vuông góc (Q)."
          ],
          "forms": [
            {
              "name": "Chứng minh hai mặt phẳng vuông góc",
              "tier": "nen",
              "parts": [
                "I",
                "II"
              ]
            },
            {
              "name": "Suy ra đường thẳng vuông góc với mặt phẳng từ hai mặt phẳng vuông góc",
              "tier": "nen",
              "parts": [
                "I",
                "II"
              ]
            },
            {
              "name": "Xác định góc giữa hai mặt phẳng qua mặt phẳng vuông góc giao tuyến",
              "tier": "nang",
              "parts": [
                "I",
                "II"
              ]
            },
            {
              "name": "Tính góc nhị diện trong hình chóp và lăng trụ",
              "tier": "top",
              "parts": [
                "II",
                "III"
              ],
              "tip": "Từ chân đường cao kẻ đường vuông góc đến giao tuyến chung, nối đỉnh chóp với điểm đó để xác định góc phẳng nhị diện trong tam giác vuông."
            }
          ]
        },
        {
          "id": "t11-b26",
          "no": 26,
          "title": "Khoảng cách",
          "week": 27,
          "hours": 3,
          "keyPoints": [
            "Khoảng cách từ điểm đến mặt phẳng là độ dài đoạn vuông góc.",
            "Khoảng cách giữa đường thẳng song song và mặt phẳng bằng khoảng cách từ một điểm của đường đến mặt phẳng.",
            "Khoảng cách giữa hai mặt phẳng song song là khoảng cách từ một điểm của mặt phẳng này đến mặt phẳng kia."
          ],
          "forms": [
            {
              "name": "Khoảng cách giữa đường thẳng và mặt phẳng song song",
              "tier": "nen",
              "parts": [
                "I",
                "II"
              ]
            },
            {
              "name": "Khoảng cách giữa hai mặt phẳng song song",
              "tier": "nen",
              "parts": [
                "I",
                "III"
              ]
            },
            {
              "name": "Khoảng cách từ điểm đến mặt phẳng trong hình chóp đều",
              "tier": "nang",
              "parts": [
                "I",
                "II",
                "III"
              ]
            },
            {
              "name": "Khoảng cách giữa hai đường thẳng chéo nhau vuông góc",
              "tier": "top",
              "parts": [
                "II",
                "III"
              ],
              "tip": "Dựng mặt phẳng chứa đường thẳng này và vuông góc với đường thẳng kia; khoảng cách cần tìm chính là đoạn vuông góc từ giao điểm đến đường thẳng còn lại."
            },
            {
              "name": "Đổi điểm bằng tỉ số khoảng cách trong hình chóp",
              "tier": "top",
              "parts": [
                "II",
                "III"
              ],
              "tip": "Chuyển khoảng cách từ điểm M bất kì về chân đường cao H qua tỉ số giao điểm d(M, (P))/d(H, (P)) = MI/HI với I = MH ∩ (P)."
            }
          ]
        },
        {
          "id": "t11-b27",
          "no": 27,
          "title": "Thể tích",
          "week": 27,
          "hours": 3,
          "keyPoints": [
            "Thể tích lăng trụ V = B·h.",
            "Thể tích khối chóp V = B·h/3.",
            "Các khối có cùng đáy và cùng chiều cao có thể tích bằng nhau."
          ],
          "forms": [
            {
              "name": "Tính thể tích lăng trụ từ diện tích đáy và chiều cao",
              "tier": "nen",
              "parts": [
                "I",
                "III"
              ]
            },
            {
              "name": "Tính thể tích khối chóp từ đáy và đường cao",
              "tier": "nen",
              "parts": [
                "I",
                "III"
              ]
            },
            {
              "name": "Tính thể tích khối chóp cụt bằng hiệu hai khối chóp",
              "tier": "nang",
              "parts": [
                "I",
                "II",
                "III"
              ]
            },
            {
              "name": "So sánh thể tích hai khối qua tỉ số đáy và chiều cao",
              "tier": "top",
              "parts": [
                "II",
                "III"
              ],
              "tip": "Sử dụng tỉ số diện tích đáy khi chung đường cao hoặc tỉ số đường cao khi chung đáy; lưu ý công thức Simson chỉ áp dụng cho khối chóp tam giác."
            }
          ]
        }
      ]
    },
    {
      "id": "c8",
      "code": "Chương 8",
      "title": "Các quy tắc tính xác suất",
      "group": "Thống kê – Xác suất",
      "icon": "P",
      "priority": 2,
      "summary": "Dùng ngôn ngữ biến cố để đếm và tính xác suất hợp, giao, biến cố đối và hai biến cố độc lập.",
      "lessons": [
        {
          "id": "t11-b28",
          "no": 28,
          "title": "Biến cố hợp, biến cố giao, biến cố độc lập",
          "week": 28,
          "hours": 3,
          "keyPoints": [
            "A ∪ B là biến cố “A hoặc B”; A ∩ B là biến cố “A và B”.",
            "Biến cố đối của A kí hiệu Ā và P(Ā) = 1 − P(A).",
            "A, B độc lập khi P(A ∩ B) = P(A)P(B)."
          ],
          "forms": [
            {
              "name": "Liệt kê không gian mẫu và biến cố trong phép thử",
              "tier": "nen",
              "parts": [
                "I"
              ]
            },
            {
              "name": "Phân biệt biến cố xung khắc và biến cố độc lập",
              "tier": "nen",
              "parts": [
                "I",
                "II"
              ]
            },
            {
              "name": "Biểu diễn biến cố hợp, giao, đối bằng sơ đồ Venn",
              "tier": "nang",
              "parts": [
                "I",
                "II"
              ]
            },
            {
              "name": "Kiểm tra hai biến cố độc lập bằng P(A ∩ B) = P(A)P(B)",
              "tier": "nang",
              "parts": [
                "I",
                "II",
                "III"
              ]
            }
          ]
        },
        {
          "id": "t11-b29",
          "no": 29,
          "title": "Công thức cộng xác suất",
          "week": 29,
          "hours": 3,
          "keyPoints": [
            "P(A ∪ B) = P(A) + P(B) − P(A ∩ B).",
            "Nếu A và B xung khắc thì P(A ∩ B) = 0.",
            "Công thức cộng loại bỏ phần giao bị tính lặp hai lần."
          ],
          "forms": [
            {
              "name": "Tính P(A ∪ B) bằng công thức cộng xác suất",
              "tier": "nen",
              "parts": [
                "I",
                "III"
              ]
            },
            {
              "name": "Đúng/sai về hợp, giao và các công thức xác suất",
              "tier": "nen",
              "parts": [
                "I",
                "II"
              ]
            },
            {
              "name": "Tính xác suất biến cố đối để giải nhanh",
              "tier": "nang",
              "parts": [
                "I",
                "II",
                "III"
              ]
            },
            {
              "name": "Bài toán rút thẻ có hai điều kiện giao nhau",
              "tier": "top",
              "parts": [
                "II",
                "III"
              ],
              "tip": "Áp dụng công thức cộng P(A ∪ B) = P(A) + P(B) − P(A ∩ B); cần xác định chính xác số phần tử thuộc tập giao để tránh trừ thiếu hoặc trừ thừa."
            }
          ]
        },
        {
          "id": "t11-b30",
          "no": 30,
          "title": "Công thức nhân xác suất cho hai biến cố độc lập",
          "week": 30,
          "hours": 3,
          "keyPoints": [
            "Với A, B độc lập: P(A ∩ B) = P(A)P(B).",
            "Tính độc lập khác với tính xung khắc; biến cố có xác suất dương không thể vừa độc lập vừa xung khắc.",
            "Có thể kiểm tra độc lập bằng P(A ∩ B) hoặc xác suất có điều kiện khi xác định được."
          ],
          "forms": [
            {
              "name": "Tính xác suất giao của hai biến cố độc lập",
              "tier": "nen",
              "parts": [
                "I",
                "III"
              ]
            },
            {
              "name": "Kiểm tra điều kiện độc lập từ bảng số liệu xác suất",
              "tier": "nen",
              "parts": [
                "I",
                "II"
              ]
            },
            {
              "name": "Bài toán thực hiện hai phép thử độc lập liên tiếp",
              "tier": "nang",
              "parts": [
                "I",
                "II",
                "III"
              ]
            },
            {
              "name": "Tính xác suất “ít nhất một lần” bằng biến cố đối",
              "tier": "top",
              "parts": [
                "II",
                "III"
              ],
              "tip": "Với dãy n phép thử độc lập cùng xác suất thành công p, xác suất có ít nhất một lần thành công là 1 − (1 − p)ⁿ; từ đó giải bất phương trình tìm số lần thử n."
            }
          ]
        }
      ]
    },
    {
      "id": "c9",
      "code": "Chương 9",
      "title": "Đạo hàm",
      "group": "Đại số – Giải tích",
      "icon": "f′",
      "priority": 3,
      "summary": "Hiểu đạo hàm qua giới hạn và ý nghĩa thực tiễn, tính đạo hàm theo quy tắc và mở rộng đến đạo hàm cấp hai.",
      "lessons": [
        {
          "id": "t11-b31",
          "no": 31,
          "title": "Định nghĩa và ý nghĩa của đạo hàm",
          "week": 31,
          "hours": 3,
          "keyPoints": [
            "f′(x₀) = lim₍ₓ→ₓ₀₎ [f(x) − f(x₀)]/(x − x₀) nếu giới hạn tồn tại.",
            "Hệ số góc tiếp tuyến tại M(x₀, f(x₀)) bằng f′(x₀).",
            "Trong chuyển động, vận tốc tức thời là đạo hàm của quãng đường theo thời gian."
          ],
          "forms": [
            {
              "name": "Tính đạo hàm tại một điểm theo định nghĩa giới hạn",
              "tier": "nen",
              "parts": [
                "I",
                "II"
              ]
            },
            {
              "name": "Tính vận tốc tức thời từ phương trình quãng đường",
              "tier": "nen",
              "parts": [
                "I",
                "III"
              ]
            },
            {
              "name": "Viết phương trình tiếp tuyến khi biết điểm tiếp xúc",
              "tier": "nang",
              "parts": [
                "I",
                "II",
                "III"
              ]
            },
            {
              "name": "Xét khả vi của hàm số từng đoạn tại điểm ghép",
              "tier": "top",
              "parts": [
                "II",
                "III"
              ],
              "tip": "Hàm số chỉ khả vi tại điểm ghép x₀ khi nó liên tục tại x₀ và có đạo hàm bên trái bằng đạo hàm bên phải: f′(x₀⁻) = f′(x₀⁺)."
            }
          ]
        },
        {
          "id": "t11-b32",
          "no": 32,
          "title": "Các quy tắc tính đạo hàm",
          "week": 32,
          "hours": 3,
          "keyPoints": [
            "(u + v)′ = u′ + v′, (uv)′ = u′v + uv′.",
            "(u/v)′ = (u′v − uv′)/v² với v ≠ 0.",
            "(xⁿ)′ = n·xⁿ⁻¹ và đạo hàm hàm hợp dùng quy tắc dây chuyền."
          ],
          "forms": [
            {
              "name": "Tính đạo hàm đa thức và hàm số sơ cấp",
              "tier": "nen",
              "parts": [
                "I"
              ]
            },
            {
              "name": "Tính đạo hàm của tích, thương hai hàm số",
              "tier": "nen",
              "parts": [
                "I",
                "II",
                "III"
              ]
            },
            {
              "name": "Tính đạo hàm hàm hợp có căn, mũ hoặc lượng giác",
              "tier": "nang",
              "parts": [
                "I",
                "II",
                "III"
              ]
            },
            {
              "name": "Viết phương trình tiếp tuyến bằng hệ số góc f′(x₀)",
              "tier": "nang",
              "parts": [
                "I",
                "II",
                "III"
              ]
            },
            {
              "name": "Tìm tham số từ điều kiện tiếp tuyến song song hoặc vuông góc",
              "tier": "top",
              "parts": [
                "II",
                "III"
              ],
              "tip": "Giải phương trình f′(x₀) = k để tìm hoành độ tiếp điểm; luôn viết phương trình tiếp tuyến hoàn chỉnh để loại trừ trường hợp trùng với đường thẳng cho trước."
            }
          ]
        },
        {
          "id": "t11-b33",
          "no": 33,
          "title": "Đạo hàm cấp hai",
          "week": 33,
          "hours": 3,
          "keyPoints": [
            "Đạo hàm cấp hai f″ là đạo hàm của f′.",
            "Trong chuyển động, gia tốc là đạo hàm của vận tốc theo thời gian.",
            "Tính f″ bằng cách rút gọn f′ hợp lí rồi lấy đạo hàm lần nữa."
          ],
          "forms": [
            {
              "name": "Tính đạo hàm cấp hai của hàm đa thức và hàm hợp",
              "tier": "nen",
              "parts": [
                "I",
                "III"
              ]
            },
            {
              "name": "Tính vận tốc và gia tốc trong bài toán chuyển động",
              "tier": "nen",
              "parts": [
                "I",
                "III"
              ]
            },
            {
              "name": "Tìm thời điểm vật đổi chiều từ v(t) = 0",
              "tier": "nang",
              "parts": [
                "I",
                "II",
                "III"
              ]
            },
            {
              "name": "Phân biệt ý nghĩa f′, f″ qua bảng số liệu chuyển động",
              "tier": "top",
              "parts": [
                "II",
                "III"
              ],
              "tip": "Chuyển động nhanh dần khi gia tốc a(t) và vận tốc v(t) cùng dấu (a·v > 0), chậm dần khi trái dấu (a·v < 0); đổi chiều khi vận tốc đổi dấu qua 0."
            }
          ]
        }
      ]
    }
  ]
}
