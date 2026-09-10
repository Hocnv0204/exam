/**
 * Exam Markdown Parser and Math Rendering Utility (KaTeX + mhchem)
 * Supports Vietnamese Ministry of Education (MOET 2025) Format:
 * - Part I: Multiple Choice ABCD (1 correct option with *)
 * - Part II: True / False (4 statements a, b, c, d with * for true)
 * - Part III: Short Answer (numeric fill-in with tolerance)
 */

export const MATH_TEMPLATE = `# TEMPLATE ĐỀ THI MÔN TOÁN HỌC (CHUẨN BỘ GD&ĐT)

=== PHẦN I: TRẮC NGHIỆM NHIỀU LỰA CHỌN (A, B, C, D) ===

[Câu 1]
Cho hàm số $y = f(x)$ liên tục trên $\\mathbb{R}$ và có đồ thị như hình vẽ bên dưới:
[Ảnh]
Điểm cực đại của đồ thị hàm số đã cho có tọa độ là:
A. $(1; -2)$
*B. $(-1; 2)$
C. $x = -1$
D. $y = 2$
[Lời giải]
Dựa vào đồ thị hàm số, điểm cực đại của đồ thị có tọa độ là $(-1; 2)$. Điểm cực đại của hàm số là $x = -1$, giá trị cực đại là $y = 2$.

[Câu 2]
Cho hàm số $y = \\frac{2x + 1}{x - 1}$. Tiệm cận ngang của đồ thị hàm số là đường thẳng:
A. $x = 1$
B. $y = 1$
*C. $y = 2$
D. $x = 2$
[Lời giải]
Ta có $\\lim_{x \\to \\pm \\infty} \\frac{2x + 1}{x - 1} = 2$, suy ra đường tiệm cận ngang của đồ thị hàm số là $y = 2$.

[Câu 3]
Cho hình lập phương $ABCD.A'B'C'D'$ có cạnh bằng $a$.
[Ảnh]
Góc giữa hai đường thẳng $A'B$ và $B'C$ bằng:
A. $30^\\circ$
*B. $60^\\circ$
C. $90^\\circ$
D. $45^\\circ$
[Lời giải]
Vì $A'B \\parallel D'C$ nên góc giữa $A'B$ và $B'C$ chính là góc giữa $D'C$ và $B'C$, tức là $\\widehat{BCD'}$. Tam giác $BD'C$ đều nên góc bằng $60^\\circ$.

[Câu 4]
Tập nghiệm của bất phương trình $\\log_2(x - 1) < 3$ là:
A. $(-\\infty; 9)$
*B. $(1; 9)$
C. $(1; 8)$
D. $(1; 10)$
[Lời giải]
Điều kiện: $x > 1$. Bất phương trình $\\Leftrightarrow x - 1 < 2^3 = 8 \\Leftrightarrow x < 9$. Kết hợp suy ra $x \\in (1; 9)$.


=== PHẦN II: TRẮC NGHIỆM ĐÚNG / SAI (4 Ý a, b, c, d) ===

[Câu 5] [TF]
Cho hình chóp $S.ABCD$ có đáy $ABCD$ là hình vuông cạnh $a$. Cạnh bên $SA \\perp (ABCD)$ và $SA = a\\sqrt{3}$.
[Ảnh]
Xét tính Đúng / Sai của các khẳng định sau:
*a) Đường thẳng $SA$ vuông góc với mặt phẳng $(ABCD)$.
*b) Góc giữa đường thẳng $SB$ và mặt phẳng $(ABCD)$ bằng $60^\\circ$.
c) Thể tích khối chóp $S.ABCD$ bằng $a^3\\sqrt{3}$.
*d) Khoảng cách từ điểm $A$ đến mặt phẳng $(SBD)$ bằng $\\frac{a\\sqrt{21}}{7}$.
[Lời giải]
- Ý a ĐÚNG: Do $SA \\perp (ABCD)$.
- Ý b ĐÚNG: Góc giữa $SB$ và $(ABCD)$ là $\\widehat{SBA}$. $\\tan \\widehat{SBA} = \\frac{SA}{AB} = \\sqrt{3} \\Rightarrow \\widehat{SBA} = 60^\\circ$.
- Ý c SAI: $V = \\frac{1}{3} S_{ABCD} \\cdot SA = \\frac{a^3\\sqrt{3}}{3}$.
- Ý d ĐÚNG: Khoảng cách từ $A$ đến $(SBD)$ bằng $\\frac{a\\sqrt{21}}{7}$.

[Câu 6] [TF]
Cho hàm số bậc ba $y = f(x) = ax^3 + bx^2 + cx + d$ có bảng biến thiên như sau:
[Ảnh]
Xét tính Đúng / Sai của các mệnh đề sau:
*a) Hàm số đồng biến trên khoảng $(-\\infty; 0)$ và $(2; +\\infty)$.
b) Giá trị cực tiểu của hàm số bằng $2$.
*c) Phương trình $f(x) - 1 = 0$ có đúng $3$ nghiệm thực phân biệt.
d) Hệ số $a < 0$.
[Lời giải]
- Ý a ĐÚNG: Đạo hàm $f'(x) > 0$ trên $(-\\infty; 0)$ và $(2; +\\infty)$.
- Ý b SAI: Giá trị cực tiểu là $y_{CT} = -2$ tại $x = 2$.
- Ý c ĐÚNG: Đường thẳng $y = 1$ cắt đồ thị tại 3 điểm phân biệt.
- Ý d SAI: Nhánh phải đi lên nên $a > 0$.


=== PHẦN III: TRẮC NGHIỆM TRẢ LỜI NGẮN (ĐIỀN SỐ) ===

[Câu 7] [SA]
Tính diện tích hình phẳng giới hạn bởi đồ thị hàm số $y = x^2 - 2x$, trục hoành $Ox$ và hai đường thẳng $x = 0$, $x = 3$. (Làm tròn đến chữ số thập phân thứ hai).
[Đáp án: 2.67]
[Dung sai: 0.05]
[Lời giải]
$S = \\int_0^3 |x^2 - 2x| dx = \\frac{8}{3} \\approx 2,67$.

[Câu 8] [SA]
Một con lắc đơn có chiều dài dây treo $l = 1\\text{ m}$ dao động tại nơi có gia tốc trọng trường $g = \\pi^2 \\approx 9,8\\text{ m/s}^2$. Tính chu kỳ dao động riêng của con lắc (theo giây).
[Đáp án: 2]
[Dung sai: 0.1]
[Lời giải]
$T = 2\\pi \\sqrt{\\frac{l}{g}} = 2\\pi \\sqrt{\\frac{1}{\\pi^2}} = 2\\text{ giây}$.
`

export const CHEM_TEMPLATE = `# TEMPLATE ĐỀ THI MÔN HÓA HỌC (CHUẨN BỘ GD&ĐT)

=== PHẦN I: TRẮC NGHIỆM NHIỀU LỰA CHỌN (A, B, C, D) ===

[Câu 1]
Cho luồng khí $\\ce{CO}$ dư đi qua ống sứ nung nóng chứa $16\\text{ g}$ bột $\\ce{Fe2O3}$. Sau khi phản ứng xảy ra hoàn toàn, thu được chất rắn $X$ và khí $Y$. Dẫn toàn bộ khí $Y$ vào dung dịch $\\ce{Ca(OH)2}$ dư thu được $m\\text{ g}$ kết tủa trắng. Giá trị của $m$ là:
A. $10\\text{ g}$
B. $20\\text{ g}$
*C. $30\\text{ g}$
D. $40\\text{ g}$
[Lời giải]
Phương trình phản ứng:
$$\\ce{Fe2O3 + 3CO ->[t^o] 2Fe + 3CO2 ^}$$
$$\\ce{CO2 + Ca(OH)2 -> CaCO3 v + H2O}$$
$n_{\\ce{Fe2O3}} = 0,1\\text{ mol} \\Rightarrow n_{\\ce{CO2}} = 0,3\\text{ mol} \\Rightarrow m_{\\ce{CaCO3}} = 0,3 \\times 100 = 30\\text{ g}$.

[Câu 2]
Kim loại nào sau đây có tính khử mạnh nhất trong dãy hoạt động hóa học?
A. $\\ce{Fe}$
B. $\\ce{Cu}$
*C. $\\ce{Al}$
D. $\\ce{Ag}$
[Lời giải]
Theo dãy điện hóa kim loại: $\\ce{Al > Fe > Cu > Ag}$. Kim loại $\\ce{Al}$ có tính khử mạnh nhất trong các kim loại trên.

[Câu 3]
Cho dung dịch chứa các ion: $\\ce{Na+}$, $\\ce{Ba^{2+}}$, $\\ce{Cl-}$, $\\ce{NO3-}$. Dung dịch nào sau đây khi cho vào có thể tạo kết tủa trắng?
A. $\\ce{HCl}$
*B. $\\ce{H2SO4}$
C. $\\ce{NaOH}$
D. $\\ce{KNO3}$
[Lời giải]
Phản ứng tạo kết tủa: $\\ce{Ba^{2+} + SO4^{2-} -> BaSO4 v}$ (kết tủa trắng không tan trong axit).

[Câu 4]
Chất nào sau đây thuộc loại este no, đơn chức, mạch hở?
*A. $\\ce{CH3COOC2H5}$
B. $\\ce{CH2=CHCOOCH3}$
C. $\\ce{HCOOCH=CH2}$
D. $\\ce{CH3COOCH2C6H5}$
[Lời giải]
$\\ce{CH3COOC2H5}$ có CTPT là $\\ce{C4H8O2}$, phù hợp công thức $\\ce{C_nH_{2n}O2}$ ($n \\ge 2$).


=== PHẦN II: TRẮC NGHIỆM ĐÚNG / SAI (4 Ý a, b, c, d) ===

[Câu 5] [TF]
Tiến hành thí nghiệm điều chế và thu khí chlorine ($\\ce{Cl2}$) trong phòng thí nghiệm theo sơ đồ hình vẽ:
[Ảnh]
Biết bình (1) chứa dung dịch $\\ce{NaCl}$ bão hòa, bình (2) chứa dung dịch $\\ce{H2SO4}$ đặc.
*a) Khí $\\ce{Cl2}$ thu được trong bình tam giác được làm khô bằng dung dịch $\\ce{H2SO4}$ đặc ở bình (2).
b) Bình (1) có tác dụng giữ lại khí $\\ce{Cl2}$ và cho khí $\\ce{HCl}$ đi qua.
*c) Miếng bông tẩm dung dịch $\\ce{NaOH}$ ở miệng bình thu khí có tác dụng ngăn cản khí $\\ce{Cl2}$ độc hại thoát ra môi trường.
d) Có thể thay thế $\\ce{MnO2}$ bằng $\\ce{KMnO4}$ nhưng bắt buộc phải đun nóng bình cầu.
[Lời giải]
- Ý a ĐÚNG: $\\ce{H2SO4}$ đặc dùng để làm khô các khí ẩm như $\\ce{Cl2}$.
- Ý b SAI: Bình $\\ce{NaCl}$ bão hòa dùng để giữ lại hơi $\\ce{HCl}$, khí $\\ce{Cl2}$ ít tan trong $\\ce{NaCl}$ bão hòa nên đi qua.
- Ý c ĐÚNG: $\\ce{Cl2 + 2NaOH -> NaCl + NaClO + H2O}$ giữ khí clo độc hại.
- Ý d SAI: $\\ce{KMnO4}$ phản ứng với $\\ce{HCl}$ đặc ngay ở nhiệt độ thường không cần đun nóng.

[Câu 6] [TF]
Thực hiện phản ứng tổng hợp amoniac trong công nghiệp:
$$\\ce{N2 (k) + 3H2 (k) <=>[xt, t^o, p] 2NH3 (k)} \\quad \\Delta_r H^\\circ_{298} = -92\\text{ kJ}$$
Xét tính Đúng / Sai của các biện pháp sau nhằm làm chuyển dịch cân bằng theo chiều thuận:
*a) Tăng áp suất chung của hệ phản ứng.
b) Tăng nhiệt độ của hệ phản ứng lên cao.
*c) Liên tục hóa lỏng và tách $\\ce{NH3}$ ra khỏi hỗn hợp phản ứng.
*d) Sử dụng chất xúc tác bột sắt ($\\ce{Fe}$) nhằm làm tăng tốc độ đạt tới trạng thái cân bằng.
[Lời giải]
- Ý a ĐÚNG: Tăng áp suất cân bằng chuyển dịch theo chiều giảm số mol khí (chiều thuận).
- Ý b SAI: Phản ứng tỏa nhiệt, tăng nhiệt độ làm chuyển dịch theo chiều nghịch.
- Ý c ĐÚNG: Giảm nồng độ sản phẩm làm chuyển dịch theo chiều thuận.
- Ý d ĐÚNG: Xúc tác bột sắt làm phản ứng nhanh đạt cân bằng hơn.


=== PHẦN III: TRẮC NGHIỆM TRẢ LỜI NGẮN (ĐIỀN SỐ) ===

[Câu 7] [SA]
Đốt cháy hoàn toàn $4,4\\text{ g}$ một alkane thể khí ở điều kiện thường, thu được $6,72\\text{ lít}$ khí $\\ce{CO2}$ (đktc). Tính khối lượng nước $\\ce{H2O}$ (theo gam) tạo thành sau phản ứng.
[Đáp án: 7.2]
[Dung sai: 0.1]
[Lời giải]
$n_{\\ce{CO2}} = 0,3\\text{ mol} \\Rightarrow m_{\\text{C}} = 3,6\\text{ g}$.
$m_{\\text{H}} = 4,4 - 3,6 = 0,8\\text{ g} \\Rightarrow n_{\\ce{H2O}} = 0,4\\text{ mol} \\Rightarrow m_{\\ce{H2O}} = 0,4 \\times 18 = 7,2\\text{ g}$.

[Câu 8] [SA]
Tiến hành chuẩn độ $20\\text{ mL}$ dung dịch $\\ce{HCl}$ chưa biết nồng độ bằng dung dịch chuẩn $\\ce{NaOH}\\ 0,1\\text{ M}$. Thể tích $\\ce{NaOH}$ tiêu tốn trung bình là $25\\text{ mL}$. Tính nồng độ mol của dung dịch $\\ce{HCl}$ ban đầu.
[Đáp án: 0.125]
[Dung sai: 0.01]
[Lời giải]
$n_{\\ce{HCl}} = n_{\\ce{NaOH}} = 0,025 \\times 0,1 = 0,0025\\text{ mol} \\Rightarrow C_{\\text{M (HCl)}} = \\frac{0,0025}{0,02} = 0,125\\text{ M}$.
`

/**
 * Triggers KaTeX math and chemistry rendering on a DOM container
 */
export function renderMath(container) {
  if (!container) return

  const executeRender = () => {
    if (typeof window.renderMathInElement === 'function') {
      try {
        window.renderMathInElement(container, {
          delimiters: [
            { left: '$$', right: '$$', display: true },
            { left: '$', right: '$', display: false },
            { left: '\\(', right: '\\)', display: false },
            { left: '\\[', right: '\\]', display: true }
          ],
          throwOnError: false,
          errorColor: '#dc2626',
          strict: false
        })
      } catch (err) {
        console.warn('[renderMath] Error rendering KaTeX:', err)
      }
    }
  }

  if (typeof window.renderMathInElement === 'function') {
    executeRender()
  } else {
    // Retry shortly if KaTeX script deferral hasn't executed yet
    setTimeout(executeRender, 200)
    setTimeout(executeRender, 600)
  }
}

/**
 * Compresses an image File or Blob to an optimized WebP/JPEG data URL
 * Max dimensions: 900x900, quality: 0.82
 */
export function compressImage(fileOrBlob, maxWidth = 900, quality = 0.82) {
  return new Promise((resolve, reject) => {
    if (!fileOrBlob || !fileOrBlob.type.startsWith('image/')) {
      return reject(new Error('Tệp không phải là hình ảnh hợp lệ!'))
    }

    const reader = new FileReader()
    reader.onload = (e) => {
      const img = new Image()
      img.onload = () => {
        let width = img.width
        let height = img.height

        if (width > maxWidth || height > maxWidth) {
          if (width > height) {
            height = Math.round((height * maxWidth) / width)
            width = maxWidth
          } else {
            width = Math.round((width * maxWidth) / height)
            height = maxWidth
          }
        }

        const canvas = document.createElement('canvas')
        canvas.width = width
        canvas.height = height
        const ctx = canvas.getContext('2d')
        ctx.fillStyle = '#ffffff'
        ctx.fillRect(0, 0, width, height)
        ctx.drawImage(img, 0, 0, width, height)

        let dataUrl = ''
        try {
          dataUrl = canvas.toDataURL('image/webp', quality)
          if (!dataUrl.startsWith('data:image/webp')) {
            dataUrl = canvas.toDataURL('image/jpeg', quality)
          }
        } catch (err) {
          dataUrl = canvas.toDataURL('image/jpeg', quality)
        }
        resolve(dataUrl)
      }
      img.onerror = () => reject(new Error('Không thể tải dữ liệu ảnh'))
      img.src = e.target.result
    }
    reader.onerror = () => reject(new Error('Lỗi đọc file hình ảnh'))
    reader.readAsDataURL(fileOrBlob)
  })
}

/**
 * Parse an entire Exam Markdown document into structured questions
 */
export function parseExamMarkdown(rawText) {
  if (!rawText || typeof rawText !== 'string') {
    return { questions: [], error: 'Nội dung đề thi trống!' }
  }

  const lines = rawText.split(/\r?\n/)
  const questions = []

  let currentSectionType = 'MULTIPLE_CHOICE'
  let currentQ = null
  let currentMode = 'PROMPT' // 'PROMPT' | 'EXPLANATION'

  const flushCurrentQuestion = () => {
    if (!currentQ) return

    // Clean up prompt text: trim leading/trailing newlines
    currentQ.promptText = currentQ.promptLines.join('\n').trim()
    currentQ.explanation = currentQ.explanationLines.join('\n').trim()

    // Clean up options
    if (currentQ.questionType === 'MULTIPLE_CHOICE') {
      if (currentQ.options.length === 0) {
        // Provide standard ABCD options if none extracted
        currentQ.options = [
          { id: 'A', text: '' },
          { id: 'B', text: '' },
          { id: 'C', text: '' },
          { id: 'D', text: '' }
        ]
      }
      if (!currentQ.mcAnswer && currentQ.options.length > 0) {
        currentQ.mcAnswer = currentQ.options[0].id
      }
    } else if (currentQ.questionType === 'TRUE_FALSE') {
      if (currentQ.options.length === 0) {
        currentQ.options = [
          { id: 'a', text: '' },
          { id: 'b', text: '' },
          { id: 'c', text: '' },
          { id: 'd', text: '' }
        ]
      }
      // Ensure all a, b, c, d keys exist
      ['a', 'b', 'c', 'd'].forEach(k => {
        if (currentQ.tfAnswers[k] === undefined) {
          currentQ.tfAnswers[k] = false
        }
      })
    } else if (currentQ.questionType === 'SHORT_ANSWER') {
      currentQ.saAnswer = currentQ.saAnswer !== undefined ? String(currentQ.saAnswer).trim() : ''
    }

    questions.push(currentQ)
    currentQ = null
  }

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]
    const trimmed = line.trim()

    // Check Section Headers
    if (/^===\s*PHẦN\s*I\b/i.test(trimmed) || /^#+\s*PHẦN\s*I\b/i.test(trimmed)) {
      flushCurrentQuestion()
      currentSectionType = 'MULTIPLE_CHOICE'
      continue
    }
    if (/^===\s*PHẦN\s*II\b/i.test(trimmed) || /^#+\s*PHẦN\s*II\b/i.test(trimmed)) {
      flushCurrentQuestion()
      currentSectionType = 'TRUE_FALSE'
      continue
    }
    if (/^===\s*PHẦN\s*III\b/i.test(trimmed) || /^#+\s*PHẦN\s*III\b/i.test(trimmed)) {
      flushCurrentQuestion()
      currentSectionType = 'SHORT_ANSWER'
      continue
    }

    // Check Question Start: [Câu 1], [Câu 1] [TF], Câu 1:, Câu 1.
    const qMatch = trimmed.match(/^\[?(?:Câu|Bài)\s*(\d+)\]?(?:\s*\[(TF|SA|MC|ĐS|TLN)\])?[:.]?/i)
    if (qMatch && !trimmed.startsWith('[Lời giải') && !trimmed.startsWith('[Đáp án')) {
      flushCurrentQuestion()

      const qNum = parseInt(qMatch[1], 10)
      const typeTag = (qMatch[2] || '').toUpperCase()

      let qType = currentSectionType
      if (typeTag === 'TF' || typeTag === 'ĐS') qType = 'TRUE_FALSE'
      else if (typeTag === 'SA' || typeTag === 'TLN') qType = 'SHORT_ANSWER'
      else if (typeTag === 'MC') qType = 'MULTIPLE_CHOICE'

      currentQ = {
        questionNumber: qNum,
        questionType: qType,
        promptLines: [],
        options: [],
        mcAnswer: null,
        tfAnswers: {},
        saAnswer: '',
        saTolerance: 0,
        explanationLines: [],
        hasImagePlaceholder: false,
        imageUrl: '',
        points: qType === 'TRUE_FALSE' ? 1.0 : (qType === 'SHORT_ANSWER' ? 0.5 : 0.25)
      }
      currentMode = 'PROMPT'
      continue
    }

    if (!currentQ) continue

    // Check Explanation tag [Lời giải] or [Hướng dẫn giải]
    if (/^\[(?:Lời giải|Hướng dẫn giải|Giải chi tiết)\]/i.test(trimmed) || /^(?:Lời giải|Hướng dẫn giải):/i.test(trimmed)) {
      currentMode = 'EXPLANATION'
      continue
    }

    // Check Image placeholder [Ảnh] or [Hình ảnh]
    if (/^\[(?:Ảnh|Hình ảnh|Hình vẽ|Sơ đồ)\]/i.test(trimmed) || trimmed === '[Ảnh]') {
      currentQ.hasImagePlaceholder = true
      continue
    }

    // If currently reading explanation lines
    if (currentMode === 'EXPLANATION') {
      currentQ.explanationLines.push(line)
      continue
    }

    // In PROMPT mode: Check for Short Answer tags
    if (currentQ.questionType === 'SHORT_ANSWER') {
      const ansMatch = trimmed.match(/^\[(?:Đáp án|ĐA|KQ)[:\s]*([^\]]+)\]/i)
      if (ansMatch) {
        currentQ.saAnswer = ansMatch[1].trim()
        continue
      }
      const tolMatch = trimmed.match(/^\[(?:Dung sai)[:\s]*([^\]]+)\]/i)
      if (tolMatch) {
        currentQ.saTolerance = parseFloat(tolMatch[1].trim()) || 0
        continue
      }
    }

    // In PROMPT mode: Check for Multiple Choice options (A, B, C, D)
    if (currentQ.questionType === 'MULTIPLE_CHOICE') {
      const mcOptMatch = trimmed.match(/^(\*)?\s*([A-D])\s*[.:)]\s*(.*)$/i)
      if (mcOptMatch) {
        const isCorrect = !!mcOptMatch[1]
        const optId = mcOptMatch[2].toUpperCase()
        const optText = mcOptMatch[3].trim()

        currentQ.options.push({ id: optId, text: optText })
        if (isCorrect) {
          currentQ.mcAnswer = optId
        }
        continue
      }
    }

    // In PROMPT mode: Check for True / False statement options (a, b, c, d)
    if (currentQ.questionType === 'TRUE_FALSE') {
      const tfOptMatch = trimmed.match(/^(\*)?\s*([a-d])\s*[.:)]\s*(.*)$/i)
      if (tfOptMatch) {
        const isTrue = !!tfOptMatch[1]
        const subId = tfOptMatch[2].toLowerCase()
        const optText = tfOptMatch[3].trim()

        currentQ.options.push({ id: subId, text: optText })
        currentQ.tfAnswers[subId] = isTrue
        continue
      }
    }

    // Default: append to prompt lines
    currentQ.promptLines.push(line)
  }

  flushCurrentQuestion()

  // Ensure 1-based sequential renumbering if necessary
  questions.forEach((q, idx) => {
    if (!q.questionNumber || isNaN(q.questionNumber)) {
      q.questionNumber = idx + 1
    }
  })

  return { questions }
}
