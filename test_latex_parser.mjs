import { extractBalancedArguments, parseLatexExam, parseAnswerKeyString } from './fe/src/js/utils/latex-parser.js'

console.log('=== TEST SUITE: LATEX PARSER ENGINE ===\n')

let testsPassed = 0
let testsFailed = 0

function assert(condition, message) {
  if (condition) {
    console.log(`✅ PASS: ${message}`)
    testsPassed++
  } else {
    console.error(`❌ FAIL: ${message}`)
    testsFailed++
  }
}

// -------------------------------------------------------------
// TEST 1: Balanced Brace Scanner with deeply nested braces
// -------------------------------------------------------------
console.log('--- TEST 1: Balanced Brace Scanner ---')
const testNestedStr = '{\\dfrac{1}{\\sqrt{x + \\frac{a}{b}}}}{\\ce{CuSO4 <=> Cu^{2+} + SO4^{2-}}}{C}{D}'
const nestedResult = extractBalancedArguments(testNestedStr, 0, 4)
assert(nestedResult.args.length === 4, 'Bóc tách đúng 4 đối số lồng nhau')
assert(nestedResult.args[0] === '\\dfrac{1}{\\sqrt{x + \\frac{a}{b}}}', 'Đối số 1 giữ nguyên công thức phân số/căn bậc hai lồng nhau')
assert(nestedResult.args[1] === '\\ce{CuSO4 <=> Cu^{2+} + SO4^{2-}}', 'Đối số 2 giữ nguyên công thức hóa học mhchem có ngoặc nhọn')
assert(nestedResult.args[2] === 'C', 'Đối số 3 là C')
assert(nestedResult.args[3] === 'D', 'Đối số 4 là D')

// -------------------------------------------------------------
// TEST 2: True/False with \choiceTF & \True
// -------------------------------------------------------------
console.log('\n--- TEST 2: True/False \\choiceTF & \\True ---')
const tfLatex = `
\\begin{document}
\\Cau Cho phản ứng hóa học. Xét tính đúng sai của các phát biểu:
\\choiceTF
{\\True Dung dịch làm đổi màu quỳ tím.}
{Chất X không tan trong nước.}
{\\True Khí thoát ra có mùi hắc.}
{Phản ứng trên là phản ứng tỏa nhiệt.}
\\end{document}
`
const tfParsed = parseLatexExam(tfLatex)
assert(tfParsed.questions.length === 1, 'Parse được 1 câu Đúng/Sai')
assert(tfParsed.questions[0].questionType === 'TRUE_FALSE', 'Loại câu hỏi là TRUE_FALSE')
assert(tfParsed.questions[0].statements.length === 4, 'Bóc tách đủ 4 mệnh đề')
assert(tfParsed.questions[0].tfAnswers.a === true, 'Mệnh đề a có \\True -> true')
assert(tfParsed.questions[0].tfAnswers.b === false, 'Mệnh đề b không có \\True -> false')
assert(tfParsed.questions[0].tfAnswers.c === true, 'Mệnh đề c có \\True -> true')
assert(tfParsed.questions[0].tfAnswers.d === false, 'Mệnh đề d không có \\True -> false')

// -------------------------------------------------------------
// TEST 3: Math Exam with 40 questions & Comments & tkz-tab
// -------------------------------------------------------------
console.log('\n--- TEST 3: Math Exam Sample (Dao_ham_1.tex) ---')
const sampleMathLatex = `
\\begin{document}
\\CustomHeader{BÀI TẬP TRẮC NGHIỆM TOÁN HỌC}{Chuyên đề: Công thức tính đạo hàm}
\\PartHeader{PHẦN I}{Thí sinh trả lời từ câu 1 đến câu 40.}

% Câu 1 - Key: A
\\Cau Cho hàm số $y = f(x)$ xác định trên $(a; b)$. Đạo hàm là:
\\choiceTwo{$f'(x_0) = \\lim_{\\Delta x \\to 0} \\dfrac{f(x_0 + \\Delta x) - f(x_0)}{\\Delta x}$}{$f'(x_0) = 0$}{$f'(x_0) = 1$}{$f'(x_0) = cx$}

% Câu 2 - Key: C
\\Cau Cho hàm số $f(x) = c$. Đạo hàm là:
\\choice{$f'(x) = c$.}{$f'(x) = 1$.}{$f'(x) = 0$.}{$f'(x) = cx$.}

% Câu 39 - Key: A
\\Cau Cho hàm số $y = f(x)$ có bảng xét dấu:
\\begin{center}
\\begin{tikzpicture}
  \\tkzTabInit[nocadre, lgt=1.5, espcl=2.2, deltacl=.5]
    {$x$ / 0.7, $f'(x)$ / 0.7}
    {$-\\infty$, $-1$, $2$, $+\\infty$}
  \\tkzTabLine{, +, z, -, z, +, }
\\end{tikzpicture}
\\end{center}
Khẳng định nào sau đây là đúng?
\\choiceTwo{$f'(x) < 0$ với mọi $x \\in (-1; 2)$}{$f'(x) > 0$}{$f'(x) < 0$}{$f'(x) > 0$}
\\end{document}
`
const mathParsed = parseLatexExam(sampleMathLatex)
assert(mathParsed.questions.length === 3, 'Parse được 3 câu hỏi mẫu Toán')
assert(mathParsed.title === 'BÀI TẬP TRẮC NGHIỆM TOÁN HỌC', 'Trích xuất đúng tiêu đề')
assert(mathParsed.questions[0].mcAnswer === 'A', 'Câu 1 tự động nhận diện đáp án A từ comment')
assert(mathParsed.questions[1].mcAnswer === 'C', 'Câu 2 tự động nhận diện đáp án C từ comment')
assert(mathParsed.questions[2].mcAnswer === 'A', 'Câu 39 tự động nhận diện đáp án A từ comment')
assert(mathParsed.questions[2].content.includes('tkz-sign-table'), 'Câu 39 chuyển đổi thành công tkz-tab sang bảng HTML tkz-sign-table')
assert(mathParsed.questions[2].content.includes('tkz-zero'), 'Bảng xét dấu có chứa ký hiệu zero phân cách (z)')

// -------------------------------------------------------------
// TEST 4: Chemistry Exam Sample with \ce, \begin{enumerate}, \choiceTwo
// -------------------------------------------------------------
console.log('\n--- TEST 4: Chemistry Exam Sample (S1.tex) ---')
const sampleChemLatex = `
\\begin{document}
\\CustomHeader{BÀI TẬP RÈN LUYỆN}{Chuyên đề: Phương trình điện li}
\\PartHeader{PHẦN I}{Phương trình điện li}

\\Cau Phương trình điện li nào dưới đây được viết đúng?
\\choiceTwo{\\ce{CuSO4 <=> Cu+ + SO4^2-}}{\\ce{H2CO3 <=> 2H+ + CO3^2-}}{\\ce{H2S -> 2H+ + S^2-}}{\\ce{NaOH <=> Na+ + OH-}}

\\Cau Phương trình ion: \\ce{Ca^2+ + CO3^2- -> CaCO3 v} là của phản ứng xảy ra giữa cặp chất nào sau đây?
\\begin{enumerate}[label=(\\arabic*)]
  \\item \\ce{CaCl2 + Na2CO3};
  \\item \\ce{Ca(OH)2 + CO2};
  \\item \\ce{Ca(HCO3)2 + NaOH};
  \\item \\ce{Ca(NO3)2 + (NH4)2CO3}.
\\end{enumerate}
\\choice{(1) và (2).}{(2) và (3).}{(1) và (4).}{(2) và (4).}
\\end{document}
`
const chemParsed = parseLatexExam(sampleChemLatex)
assert(chemParsed.questions.length === 2, 'Parse được 2 câu hỏi mẫu Hóa')
assert(chemParsed.questions[0].options[0].content.includes('\\ce{CuSO4 <=> Cu+ + SO4^2-}'), 'Giữ nguyên vẹn mã \\ce{...} trong options')
assert(chemParsed.questions[1].content.includes('<ol class="enumerate-list"'), 'Chuyển đổi \\begin{enumerate} thành danh sách <ol> chuẩn đẹp')

// -------------------------------------------------------------
// TEST 5: Error Diagnostics for malformed LaTeX
// -------------------------------------------------------------
console.log('\n--- TEST 5: Error Diagnostics for Malformed LaTeX ---')
const malformedLatex = `
\\begin{document}
\\Cau Câu hỏi này bị lỗi thiếu ngoặc đóng ở đáp án cuối:
\\choice{Đáp án A}{Đáp án B}{Đáp án C}{Đáp án D thiếu ngoặc
\\Cau Câu hỏi tiếp theo vẫn bình thường
\\choice{A}{B}{C}{D}
\\end{document}
`
const malformedParsed = parseLatexExam(malformedLatex)
assert(malformedParsed.errors.length > 0, 'Phát hiện được lỗi cú pháp')
assert(malformedParsed.errors[0].questionNumber === 1, 'Báo đúng số thứ tự câu bị lỗi (Câu 1)')
assert(malformedParsed.questions.length >= 1, 'Không làm crash toàn bộ, câu sau vẫn tiếp tục được parse')

// -------------------------------------------------------------
// TEST 6: Quick Answer Key String Parser
// -------------------------------------------------------------
console.log('\n--- TEST 6: Quick Answer Key String Parser ---')
const keyMap1 = parseAnswerKeyString('1A 2B 3C 4D 5A 6B')
assert(keyMap1[1] === 'A' && keyMap1[2] === 'B' && keyMap1[3] === 'C' && keyMap1[4] === 'D' && keyMap1[5] === 'A' && keyMap1[6] === 'B', 'Parse chuỗi "1A 2B 3C..." chuẩn xác')

const keyMap2 = parseAnswerKeyString('ABCDABCD')
assert(keyMap2[1] === 'A' && keyMap2[2] === 'B' && keyMap2[3] === 'C' && keyMap2[4] === 'D', 'Parse chuỗi ký tự liên tiếp "ABCD..." chuẩn xác')

// -------------------------------------------------------------
// TEST 7: Advanced TikZ, TrueFalseBox, ShortAnswerBox, Graphics (P1.tex)
// -------------------------------------------------------------
console.log('\n--- TEST 7: P1.tex Format (TikZ, TrueFalseBox, ShortAnswerBox, \\includegraphics) ---')
const p1LatexSample = `
\\begin{document}
\\CustomHeader{ĐỀ KIỂM TRA MÔN TOÁN 11}{Chuyên đề: Góc lượng giác và Giá trị lượng giác của góc lượng giác}
\\PartHeader{PHẦN I}{Thí sinh trả lời từ câu 1 đến câu 12.}

% Câu 1 - Key: A
\\Cau Cho góc hình học $uOv$ có số đo $50^\\circ$ (hình vẽ). Xác định số đo của các góc lượng giác $(Ou; Ov)$.
\\begin{center}
\\begin{tikzpicture}[>=stealth, scale=0.85]
  \\coordinate (O) at (0,0);
  \\coordinate (u) at (3.5,0);
  \\coordinate (v) at (50:3);
  \\draw[->, line width=1.2pt, MinionBlue] (O) -- (u) node[below=2pt, text=MinionDark] {$\\mathbf{u}$};
  \\draw[->, line width=1.2pt, MinionBlue] (O) -- (v) node[above left, text=MinionDark] {$\\mathbf{v}$};
  \\draw[line width=1pt, MinionRed] (1.2,0) arc (0:50:1.2);
  \\node at (25:1.7) {$50^\\circ$};
  \\node[below left] at (O) {$\\mathbf{O}$};
\\end{tikzpicture}
\\end{center}
\\choiceTwo{$\\text{sđ}\\,(Ou; Ov) = 50^\\circ + k360^\\circ$.}{B}{C}{D}

% Câu 7 - Key: D
\\Cau Trên đường tròn lượng giác, số đo của các góc lượng giác có tia đầu $OA$, tia cuối $OB$ là
\\begin{center}
\\begin{tikzpicture}[>=stealth, scale=1.3]
  \\draw[->] (-1.5,0) -- (1.8,0) node[below]{$x$};
  \\draw[->] (0,-1.5) -- (0,1.8) node[left]{$y$};
  \\draw[line width=0.8pt, MinionBlue] (0,0) circle (1);
  \\fill (1,0) circle (1.2pt) node[below=3pt, right=1pt, font=\\footnotesize]{$A(1;0)$};
  \\fill (-1,0) circle (1.2pt) node[below=3pt, left=1pt, font=\\footnotesize]{$A'(-1;0)$};
  \\fill (0,1) circle (1.2pt) node[above left, font=\\footnotesize]{$B(0;1)$};
  \\fill (0,-1) circle (1.2pt) node[below left, font=\\footnotesize]{$B'(0;-1)$};
  \\node[below right, font=\\footnotesize] at (0,0) {$O$};
\\end{tikzpicture}
\\end{center}
\\choiceTwo{A}{B}{C}{D}

\\PartHeader{PHẦN II}{Câu trắc nghiệm đúng sai.}

% Câu 1 (Phần II) - Key: a-S, b-Đ, c-S, d-Đ
\\begin{TrueFalseBox}{Cho hình vẽ sau:
\\begin{center}
\\begin{tikzpicture}[>=stealth, scale=1.35]
  \\draw[->] (-1.5,0) -- (1.6,0) node[below]{$x$};
  \\draw[->] (0,-1.5) -- (0,1.6) node[left]{$y$};
  \\draw[line width=0.8pt, MinionBlue] (0,0) circle (1);
  \\fill[MinionGreen!30, opacity=0.7] (0,0) -- (0:0.4) arc (0:60:0.4) -- cycle;
  \\draw[line width=0.6pt] (0:0.4) arc (0:60:0.4);
  \\node[font=\\footnotesize] at (30:0.65) {$\\dfrac{\\pi}{3}$};
  \\coordinate (M) at (60:1);
  \\coordinate (N) at (240:1);
  \\draw[line width=1pt, MinionRed] (N) -- (M);
  \\fill (1,0) circle (1.2pt) node[above right, font=\\footnotesize]{$A$};
  \\node[below right, font=\\footnotesize] at (0,0) {$O$};
\\end{tikzpicture}
\\end{center}
Khi đó:}
  \\tfStatement{a) Số đo góc lượng giác $(OM, OA)$ là $\\text{sđ}(OM, OA) = \\dfrac{\\pi}{3} + k2\\pi$.}
  \\tfStatement{b) $\\text{sđ}(ON, OA) = \\text{sđ}(ON, OM) - \\text{sđ}(OA, OM)$.}
  \\tfStatement{c) Độ dài cung tròn $AM$ lớn là: $l_{\\overset{\\frown}{AM}} = \\dfrac{2\\pi}{3}$.}
  \\tfStatement{d) Hai điểm $M, N$ biểu diễn các cung có số đo là: $x = \\dfrac{\\pi}{3} + k\\pi$.}
\\end{TrueFalseBox}

\\PartHeader{PHẦN III}{Câu trắc nghiệm trả lời ngắn.}

% Câu 1 (Phần III) - Key: 3.1
\\ShortAnswerBox{Cho $\\cos x = \\dfrac{1}{3}$. Tính giá trị biểu thức $P = 3\\sin^2 x + 4\\cos^2 x$.}

% Câu 5 (Phần III) - Key: 753
\\Cau Một bánh xe đạp quay được 25 vòng trong 10 giây.
\\begin{center}
  \\includegraphics[width=5.5cm]{bicycle.png}
\\end{center}
Tính độ dài quãng đường mà người đi xe thực hiện được trong 2,35 phút.
\\hfill
\\begin{tikzpicture}[baseline=(box.base)]
  \\node[draw, fill=yellow] (box) {\\small Đáp số: \\hspace{1cm}};
\\end{tikzpicture}
\\par\\vspace{8pt}

\\end{document}
`

const p1Parsed = parseLatexExam(p1LatexSample)
assert(p1Parsed.questions.length === 5, 'Parse đủ 5 câu hỏi từ P1.tex mẫu')

// Câu 1
assert(p1Parsed.questions[0].mcAnswer === 'A', 'P1 Câu 1 nhận diện đúng đáp án A')
assert(p1Parsed.questions[0].content.includes('<svg') && p1Parsed.questions[0].content.includes('class="tikz-rendered-svg"'), 'P1 Câu 1 chuyển đổi TikZ góc 50 độ sang SVG vector')
assert(!p1Parsed.questions[0].content.includes('[Đồ thị/Bảng xét dấu TikZ]'), 'P1 Câu 1 không còn hiển thị fallback text lỗi')

// Câu 2 (Câu 7 trong đề)
assert(p1Parsed.questions[1].mcAnswer === 'D', 'P1 Câu 7 nhận diện đúng đáp án D')
assert(p1Parsed.questions[1].content.includes('<svg') && p1Parsed.questions[1].content.includes('circle'), 'P1 Câu 7 chuyển đổi TikZ đường tròn lượng giác sang SVG vector')

// Câu 3 (Phần II Câu 1)
assert(p1Parsed.questions[2].questionType === 'TRUE_FALSE', 'Phần II Câu 1 là TRUE_FALSE')
assert(p1Parsed.questions[2].statements.length === 4, 'Phần II Câu 1 bóc tách đủ 4 mệnh đề a, b, c, d')
assert(p1Parsed.questions[2].tfAnswers.a === false, 'Phần II Câu 1 ý a là Sai (a-S)')
assert(p1Parsed.questions[2].tfAnswers.b === true, 'Phần II Câu 1 ý b là Đúng (b-Đ)')
assert(p1Parsed.questions[2].tfAnswers.c === false, 'Phần II Câu 1 ý c là Sai (c-S)')
assert(p1Parsed.questions[2].tfAnswers.d === true, 'Phần II Câu 1 ý d là Đúng (d-Đ)')
assert(p1Parsed.questions[2].content.includes('<svg') && p1Parsed.questions[2].content.includes('class="tikz-rendered-svg"'), 'Phần II Câu 1 chuyển đổi TikZ hình học sang SVG')

// Câu 4 (Phần III Câu 1)
assert(p1Parsed.questions[3].questionType === 'SHORT_ANSWER', 'Phần III Câu 1 là SHORT_ANSWER')
assert(p1Parsed.questions[3].saAnswer === '3.1', 'Phần III Câu 1 nhận diện đáp án ngắn 3.1 từ comment')

// Câu 5 (Phần III Câu 5)
assert(p1Parsed.questions[4].questionType === 'SHORT_ANSWER', 'Phần III Câu 5 là SHORT_ANSWER')
assert(p1Parsed.questions[4].saAnswer === '753', 'Phần III Câu 5 nhận diện đáp án ngắn 753 từ comment')
assert(p1Parsed.questions[4].content.includes('data-img-name="bicycle.png"'), 'Phần III Câu 5 chuyển \\includegraphics thành container ảnh')
assert(!p1Parsed.questions[4].content.includes('box.base') && !p1Parsed.questions[4].content.includes('Đáp số'), 'Phần III Câu 5 đã xóa khung TikZ Đáp số in ấn')

console.log(`\n========================================`)
console.log(`KẾT QUẢ: ${testsPassed} passed, ${testsFailed} failed.`)
if (testsFailed === 0) {
  console.log('🎉 TẤT CẢ TEST CASES ĐỀU VƯỢT QUA XUẤT SẮC!')
} else {
  process.exit(1)
}
