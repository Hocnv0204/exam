import test from 'node:test'
import assert from 'node:assert/strict'
import { parseExamMarkdown, MATH_TEMPLATE, CHEM_TEMPLATE } from '../src/js/utils/exam-parser.js'
import {
  normalizePrintQuestions,
  buildExamPrintBody,
  buildAnswerKeyHtml,
  buildExamPrintDocument,
  buildBankPrintQuestions,
  canExportExam,
  sanitizePrintTitle,
  paginateBlocks,
  buildScopedPrintCss
} from '../src/js/utils/exam-print.js'

// Oracle: đáp án lấy TRỰC TIẾP từ dữ liệu parser (không qua module in).
function expectedKeyFromParser(questions) {
  return questions.map(q => {
    if (q.questionType === 'MULTIPLE_CHOICE') return q.mcAnswer
    if (q.questionType === 'TRUE_FALSE') return q.options.map(o => (q.tfAnswers[o.id] ? 'Đ' : 'S')).join('')
    if (q.questionType === 'SHORT_ANSWER') return String(q.saAnswer)
    return '—'
  })
}

// Đọc bảng đáp án từ HTML theo thứ tự xuất hiện.
function readKeyTable(html) {
  const keyStart = html.indexOf('pq-answer-key')
  assert.ok(keyStart >= 0, 'phải có bảng đáp án')
  const rows = [...html.slice(keyStart).matchAll(/<tr data-q="(\d+)"><td>\d+<\/td><td>[^<]*<\/td><td class="pq-key-val">([^<]*)<\/td><\/tr>/g)]
  return rows.map(r => ({ q: Number(r[1]), val: r[2] }))
}

// Chuỗi đặc trưng trong lời giải của từng template.
const TEMPLATES = [
  { name: 'MATH', text: MATH_TEMPLATE, solutionMarkers: ['Dựa vào đồ thị hàm số', 'Ý c SAI', 'Kết hợp suy ra'] },
  { name: 'CHEM', text: CHEM_TEMPLATE, solutionMarkers: ['Phương trình phản ứng', 'Theo dãy điện hóa kim loại', 'Ý b SAI'] }
]

for (const tpl of TEMPLATES) {
  test(`${tpl.name}: đề trắng không lộ lời giải / đáp án đúng`, () => {
    const { questions } = parseExamMarkdown(tpl.text)
    assert.equal(questions.length, 8)
    const html = buildExamPrintBody(normalizePrintQuestions(questions), { mode: 'student' })
    for (const marker of tpl.solutionMarkers) assert.ok(!html.includes(marker), `không được chứa "${marker}"`)
    assert.doesNotMatch(html, /Lời giải|Đáp án:|pq-solution|pq-answer-key|pq-correct|BẢNG ĐÁP ÁN/)
    // Không có dấu * đánh dấu đáp án đúng ngay trước phương án / mệnh đề
    assert.doesNotMatch(html, /\*\s*[A-Da-d][.)]/)
    // Bảng Đúng/Sai trống: mọi ô cột Đúng/Sai ở thân bảng không có nội dung
    const tfCells = [...html.matchAll(/<td class="pq-tf-col">([^<]*)<\/td>/g)].map(m => m[1])
    assert.equal(tfCells.length, 2 * 4 * 2, '2 câu TF × 4 ý × 2 cột')
    assert.ok(tfCells.every(c => c === ''), 'ô Đúng/Sai phải để trống')
    // Câu trả lời ngắn có ô trống để làm
    assert.equal((html.match(/class="pq-blank"/g) || []).length, 2)
    // Mỗi câu vẫn hiển thị đề
    for (let n = 1; n <= 8; n++) assert.match(html, new RegExp(`Câu ${n}\\.`))
    // Giá trị đáp án SA không xuất hiện trong đề trắng
    for (const q of questions.filter(q => q.questionType === 'SHORT_ANSWER')) {
      assert.ok(!html.includes(`>${q.saAnswer}<`))
    }
  })

  test(`${tpl.name}: đề kèm đáp án có lời giải và bảng đáp án đúng thứ tự`, () => {
    const { questions } = parseExamMarkdown(tpl.text)
    const normalized = normalizePrintQuestions(questions)
    const html = buildExamPrintBody(normalized, { mode: 'answer' }) + buildAnswerKeyHtml(normalized)
    for (const marker of tpl.solutionMarkers) assert.ok(html.includes(marker), `phải chứa "${marker}"`)
    const table = readKeyTable(html)
    assert.deepEqual(table.map(r => r.q), questions.map(q => q.questionNumber))
    assert.deepEqual(table.map(r => r.val), expectedKeyFromParser(questions))
    // Bảng đáp án nằm sau toàn bộ câu hỏi
    assert.ok(html.lastIndexOf('<section class="pq"') < html.indexOf('pq-answer-key'))
  })
}

test('dữ liệu API: prompt JSON lồng + answerKey được chuẩn hoá đúng', () => {
  const inner = JSON.stringify({ text: 'Tính $1+1$', options: [{ id: 'A', text: '1' }, { id: 'B', text: '2' }], explanation: 'Vì một cộng một bằng hai' })
  const apiQuestions = [
    {
      question_number: 1, question_type: 'MULTIPLE_CHOICE', part_title: 'Phần I: Trắc nghiệm',
      prompt: JSON.stringify({ text: inner }), content: null, options: null, statements: null, points: 0.25,
      answerKey: { mc_answer: 'B', tf_answers: null, sa_answer: null, sa_tolerance: 0, explanation: 'Lời giải từ khoá' }
    },
    {
      question_number: 2, question_type: 'TRUE_FALSE', part_title: 'Phần II: Đúng / Sai',
      prompt: { text: 'Xét các ý', imageUrl: 'javascript:alert(1)' },
      statements: [{ id: 'a', text: 'Ý một' }, { id: 'b', text: 'Ý hai' }, { id: 'c', text: 'Ý ba' }, { id: 'd', text: 'Ý bốn' }],
      answerKey: { mc_answer: null, tf_answers: { a: true, b: false, c: true, d: false }, sa_answer: null, explanation: '' }
    },
    {
      question_number: 3, question_type: 'SHORT_ANSWER',
      prompt: JSON.stringify({ text: 'Tính diện tích' }),
      answerKey: { sa_answer: 2.5, sa_tolerance: 0.1, explanation: null }
    }
  ]
  const n = normalizePrintQuestions(apiQuestions)
  assert.equal(n[0].promptText, 'Tính $1+1$')
  assert.deepEqual(n[0].options, [{ id: 'A', text: '1' }, { id: 'B', text: '2' }])
  assert.equal(n[0].answer.mc, 'B')
  assert.equal(n[0].partTitle, 'Phần I: Trắc nghiệm')
  assert.equal(n[0].explanation, 'Lời giải từ khoá')
  assert.equal(n[1].type, 'TRUE_FALSE')
  assert.deepEqual(n[1].statements.map(s => s.id), ['a', 'b', 'c', 'd'])
  assert.deepEqual(n[1].answer.tf, { a: true, b: false, c: true, d: false })
  assert.equal(n[2].answer.sa, '2.5')

  const answerHtml = buildExamPrintBody(n, { mode: 'answer' }) + buildAnswerKeyHtml(n)
  assert.deepEqual(readKeyTable(answerHtml).map(r => r.val), ['B', 'ĐSĐS', '2.5'])
  assert.doesNotMatch(answerHtml, /javascript:/)

  const studentHtml = buildExamPrintBody(n, { mode: 'student' })
  assert.doesNotMatch(studentHtml, /Lời giải từ khoá|Vì một cộng một bằng hai/)
  assert.match(studentHtml, /Phần I: Trắc nghiệm/)
})

test('answerKey null (hoặc thiếu) → bảng đáp án ghi "—", không crash', () => {
  const n = normalizePrintQuestions([
    { question_number: 1, question_type: 'MULTIPLE_CHOICE', prompt: JSON.stringify({ text: 'Câu A', options: ['x', 'y'] }), answerKey: null },
    { question_number: 2, question_type: 'TRUE_FALSE', prompt: JSON.stringify({ text: 'Câu B', options: [{ id: 'a', text: 'p' }] }), answerKey: null },
    { question_number: 3, question_type: 'SHORT_ANSWER', prompt: 'Câu C thuần văn bản' }
  ])
  const html = buildExamPrintBody(n, { mode: 'answer' }) + buildAnswerKeyHtml(n)
  assert.deepEqual(readKeyTable(html).map(r => r.val), ['—', '—', '—'])
  assert.match(html, /Câu C thuần văn bản/)
})

test('canExportExam theo chính sách PDF', () => {
  assert.equal(canExportExam('STUDENT', { type: 'EXAM' }, 'student'), false)
  assert.equal(canExportExam('STUDENT', { type: 'PRACTICE' }, 'answer'), false)
  assert.equal(canExportExam('ADMIN', { type: 'EXAM' }, 'answer'), true)
  assert.equal(canExportExam('TEACHER', { type: 'PRACTICE' }, 'student'), true)
  assert.equal(canExportExam('ADMIN', { type: 'PRACTICE' }, 'bogus'), false)
})

test('tài liệu in: tiêu đề làm sạch thành tên file, có KaTeX CSS và trang A4', () => {
  assert.equal(sanitizePrintTitle('  Đề: Toán/12 <HK1>  '), 'Đề Toán 12 HK1')
  assert.equal(sanitizePrintTitle(''), 'De_bai')
  const doc = buildExamPrintDocument({ title: 'Đề <b>x</b>', meta: { durationMinutes: 90 }, bodyHtml: '<p>a</p>', mode: 'student' })
  assert.match(doc, /<title>Đề b x b<\/title>/)
  assert.match(doc, /katex@0\.16\.9\/dist\/katex\.min\.css/)
  assert.match(doc, /@page \{ size: A4; margin: 15mm; \}/)
  assert.match(doc, /90 phút/)
  assert.match(doc, /Họ và tên/)
  assert.doesNotMatch(doc, /<b>x<\/b>/)
  assert.doesNotMatch(doc, /<script/i)
})

test('shape question_bank: đáp án trực tiếp trên dòng (mc_answer, tf_answers JSON string, sa_answer, explanation trong prompt/root)', () => {
  const bankRows = [
    {
      id: 'qb-1',
      question_type: 'MULTIPLE_CHOICE',
      prompt: JSON.stringify({
        text: 'Nghiệm của phương trình $2x = 4$',
        options: [{ id: 'A', text: '$1$' }, { id: 'B', text: '$2$' }, { id: 'C', text: '$3$' }, { id: 'D', text: '$4$' }],
        explanation: 'Ta có $x = 4/2 = 2$'
      }),
      mc_answer: 'b',
      tf_answers: null,
      sa_answer: null
    },
    {
      id: 'qb-2',
      question_type: 'TRUE_FALSE',
      prompt: JSON.stringify({
        text: 'Cho hàm số $y = f(x)$',
        statements: [{ id: 'a', text: 'Hàm số đồng biến trên R' }, { id: 'b', text: 'Hàm số có cực trị' }],
        explanation: 'Khảo sát sự biến thiên suy ra'
      }),
      mc_answer: null,
      tf_answers: JSON.stringify({ a: true, b: false }),
      sa_answer: null
    },
    {
      id: 'qb-3',
      question_type: 'SHORT_ANSWER',
      prompt: JSON.stringify({
        text: 'Tính giá trị biểu thức $A$',
        explanation: 'Thay số vào ta được'
      }),
      mc_answer: null,
      tf_answers: null,
      sa_answer: 10.5
    },
    {
      id: 'qb-4',
      question_type: 'MULTIPLE_CHOICE',
      prompt: JSON.stringify({
        text: 'Câu có explanation ở root',
        options: [{ id: 'A', text: 'Đúng' }, { id: 'B', text: 'Sai' }]
      }),
      explanation: 'Lời giải ở root dòng ngân hàng',
      mc_answer: 'A'
    }
  ]

  const normalized = normalizePrintQuestions(bankRows)
  assert.equal(normalized[0].answer.mc, 'B')
  assert.equal(normalized[0].explanation, 'Ta có $x = 4/2 = 2$')
  assert.deepEqual(normalized[1].answer.tf, { a: true, b: false })
  assert.equal(normalized[1].explanation, 'Khảo sát sự biến thiên suy ra')
  assert.equal(normalized[2].answer.sa, '10.5')
  assert.equal(normalized[2].explanation, 'Thay số vào ta được')
  assert.equal(normalized[3].answer.mc, 'A')
  assert.equal(normalized[3].explanation, 'Lời giải ở root dòng ngân hàng')

  // Mode student: không lộ đáp án hoặc lời giải
  const studentHtml = buildExamPrintBody(normalized, { mode: 'student' })
  assert.doesNotMatch(studentHtml, /Ta có \$x = 4\/2 = 2\$|Khảo sát sự biến thiên|Thay số vào|Lời giải ở root/)
  assert.doesNotMatch(studentHtml, /pq-solution|pq-answer-key|BẢNG ĐÁP ÁN/)
  const tfCells = [...studentHtml.matchAll(/<td class="pq-tf-col">([^<]*)<\/td>/g)].map(m => m[1])
  assert.ok(tfCells.every(c => c === ''), 'ô Đúng/Sai của học sinh phải để trống')

  // Mode answer: hiển thị lời giải và bảng đáp án đúng
  const answerHtml = buildExamPrintBody(normalized, { mode: 'answer' }) + buildAnswerKeyHtml(normalized)
  assert.match(answerHtml, /Ta có \$x = 4\/2 = 2\$/)
  assert.match(answerHtml, /Khảo sát sự biến thiên/)
  assert.match(answerHtml, /Thay số vào/)
  assert.match(answerHtml, /Lời giải ở root/)
  const table = readKeyTable(answerHtml)
  assert.deepEqual(table.map(r => r.val), ['B', 'ĐS', '10.5', 'A'])
})

test('dữ liệu có answerKey: vẫn ưu tiên answerKey trước mc_answer / tf_answers / sa_answer / explanation của dòng', () => {
  const hybrid = [
    {
      question_number: 1,
      question_type: 'MULTIPLE_CHOICE',
      prompt: JSON.stringify({ text: 'Câu MC', options: [{ id: 'A', text: '1' }, { id: 'B', text: '2' }], explanation: 'Prompt exp' }),
      mc_answer: 'A',
      explanation: 'Root exp',
      answerKey: { mc_answer: 'B', explanation: 'Key exp' }
    },
    {
      question_number: 2,
      question_type: 'TRUE_FALSE',
      prompt: JSON.stringify({ text: 'Câu TF', statements: [{ id: 'a', text: '1' }] }),
      tf_answers: { a: false },
      answerKey: { tf_answers: { a: true }, explanation: 'Key TF exp' }
    },
    {
      question_number: 3,
      question_type: 'SHORT_ANSWER',
      prompt: 'Câu SA',
      sa_answer: 99,
      answerKey: { sa_answer: 100 }
    }
  ]
  const n = normalizePrintQuestions(hybrid)
  assert.equal(n[0].answer.mc, 'B')
  assert.equal(n[0].explanation, 'Key exp')
  assert.deepEqual(n[1].answer.tf, { a: true })
  assert.equal(n[1].explanation, 'Key TF exp')
  assert.equal(n[2].answer.sa, '100')
})

test('buildBankPrintQuestions: đánh số lại 1..n theo thứ tự hiển thị và không mutate input', () => {
  const originalRows = [
    { id: 'q1', question_type: 'MULTIPLE_CHOICE', question_number: 42, questionNumber: 42, prompt: 'Câu 1' },
    { id: 'q2', question_type: 'TRUE_FALSE', question_number: 99, prompt: 'Câu 2' },
    { id: 'q3', question_type: 'SHORT_ANSWER', prompt: 'Câu 3' }
  ]
  const snapshot = JSON.parse(JSON.stringify(originalRows))

  const printQuestions = buildBankPrintQuestions(originalRows)

  // Verify non-mutation
  assert.deepEqual(originalRows, snapshot, 'dữ liệu gốc không bị thay đổi')
  assert.notEqual(printQuestions, originalRows, 'trả về mảng mới')
  assert.notEqual(printQuestions[0], originalRows[0], 'phần tử là object mới')

  // Verify numbering 1..n
  assert.equal(printQuestions[0].question_number, 1)
  assert.equal(printQuestions[1].question_number, 2)
  assert.equal(printQuestions[2].question_number, 3)

  // Verify normalization produces 1..n
  const normalized = normalizePrintQuestions(printQuestions)
  assert.deepEqual(normalized.map(q => q.number), [1, 2, 3])

  // Edge cases
  assert.deepEqual(buildBankPrintQuestions(null), [])
  assert.deepEqual(buildBankPrintQuestions(undefined), [])
  assert.deepEqual(buildBankPrintQuestions([]), [])
  assert.deepEqual(buildBankPrintQuestions([null, { id: 'x' }, undefined]), [{ id: 'x', question_number: 1, questionNumber: 1 }])
})

test('paginateBlocks: xử lý các trường hợp biên và đầu vào rỗng/không hợp lệ', () => {
  assert.deepEqual(paginateBlocks([], 100), [])
  assert.deepEqual(paginateBlocks(null, 100), [])
  assert.deepEqual(paginateBlocks(undefined, 100), [])
  assert.deepEqual(paginateBlocks([50], 0), [])
  assert.deepEqual(paginateBlocks([50], -10), [])
  assert.deepEqual(paginateBlocks([0, -10, null, 'abc', 0], 100), [])
})

test('paginateBlocks: khối vừa trang không bị cắt, xếp vừa lên trang hoặc sang trang mới', () => {
  // 3 khối: 40, 50, 60 trên pageHeight = 100
  // Trang 1: 40 + 50 = 90 <= 100
  // Trang 2: 60 (không nhét vừa 10 còn lại, nhưng vừa trang 100 -> không bị cắt)
  const pages = paginateBlocks([40, 50, 60], 100)
  assert.equal(pages.length, 2)
  assert.deepEqual(pages[0], [
    { blockIndex: 0, offsetY: 0, height: 40 },
    { blockIndex: 1, offsetY: 0, height: 50 }
  ])
  assert.deepEqual(pages[1], [
    { blockIndex: 2, offsetY: 0, height: 60 }
  ])
})

test('paginateBlocks: khối cao hơn một trang được cắt thành các đoạn liên tiếp <= pageHeight', () => {
  // Khối 250px trên pageHeight = 100
  // Cắt thành: đoạn 1 (100px), đoạn 2 (100px), đoạn 3 (50px)
  const pages = paginateBlocks([250], 100)
  assert.equal(pages.length, 3)
  assert.deepEqual(pages[0], [{ blockIndex: 0, offsetY: 0, height: 100 }])
  assert.deepEqual(pages[1], [{ blockIndex: 0, offsetY: 100, height: 100 }])
  assert.deepEqual(pages[2], [{ blockIndex: 0, offsetY: 200, height: 50 }])

  // Khối 150px đi sau khối 30px trên pageHeight = 100
  // Trang 1: khối 0 (30px) + khối 1 đoạn 1 (70px để lấp đầy trang 1)
  // Trang 2: khối 1 đoạn 2 (80px)
  const pages2 = paginateBlocks([30, 150], 100)
  assert.equal(pages2.length, 2)
  assert.deepEqual(pages2[0], [
    { blockIndex: 0, offsetY: 0, height: 30 },
    { blockIndex: 1, offsetY: 0, height: 70 }
  ])
  assert.deepEqual(pages2[1], [
    { blockIndex: 1, offsetY: 70, height: 80 }
  ])
})

test('paginateBlocks: oracle kiểm tra toàn diện các bất biến với dữ liệu ngẫu nhiên', () => {
  const checkInvariants = (blockHeights, pageHeight) => {
    const pages = paginateBlocks(blockHeights, pageHeight)
    const validHeights = (blockHeights || [])
      .map(h => Number(h))
      .filter(h => Number.isFinite(h) && h > 0)

    if (validHeights.length === 0 || pageHeight <= 0 || !Number.isFinite(pageHeight)) {
      assert.equal(pages.length, 0, 'input rỗng/không hợp lệ phải trả về []')
      return
    }

    // 1. Không trang nào rỗng
    for (const page of pages) {
      assert.ok(page.length > 0, 'không được tạo trang rỗng')
      // 2. Tổng chiều cao mỗi trang <= pageHeight
      const pageTotal = page.reduce((sum, seg) => sum + seg.height, 0)
      assert.ok(pageTotal <= pageHeight + 1e-4, `tổng chiều cao trang (${pageTotal}) phải <= pageHeight (${pageHeight})`)
    }

    // 3. Với mỗi khối ban đầu: tổng chiều cao các đoạn = chiều cao khối
    const segmentsByBlock = new Map()
    let lastBlockIndex = -1

    for (const page of pages) {
      for (const seg of page) {
        assert.ok(seg.height > 0, 'chiều cao đoạn phải > 0')
        assert.ok(seg.height <= pageHeight + 1e-4, 'chiều cao đoạn phải <= pageHeight')
        // Thứ tự các khối giữ nguyên (không đảo lộn thứ tự)
        assert.ok(seg.blockIndex >= lastBlockIndex, 'thứ tự các khối phải giữ nguyên')
        lastBlockIndex = seg.blockIndex

        if (!segmentsByBlock.has(seg.blockIndex)) {
          segmentsByBlock.set(seg.blockIndex, [])
        }
        segmentsByBlock.get(seg.blockIndex).push(seg)
      }
    }

    for (let i = 0; i < blockHeights.length; i++) {
      const origH = Number(blockHeights[i])
      if (!Number.isFinite(origH) || origH <= 0) {
        assert.ok(!segmentsByBlock.has(i), `khối ${i} có chiều cao <= 0 phải bị bỏ qua`)
        continue
      }

      const segs = segmentsByBlock.get(i)
      assert.ok(segs && segs.length > 0, `khối ${i} phải có ít nhất 1 đoạn`)

      // Kiểm tra tính liên tục của offsetY
      let runningOffset = 0
      for (let k = 0; k < segs.length; k++) {
        assert.ok(Math.abs(segs[k].offsetY - runningOffset) < 1e-4, `offsetY của đoạn ${k} khối ${i} không khớp`)
        runningOffset += segs[k].height
      }

      // Tổng chiều cao các đoạn = chiều cao khối
      assert.ok(Math.abs(runningOffset - origH) < 1e-4, `tổng chiều cao các đoạn (${runningOffset}) phải = chiều cao khối (${origH})`)

      // Khối vừa trang thì không bị tách
      if (origH <= pageHeight) {
        assert.equal(segs.length, 1, `khối ${i} vừa trang (${origH} <= ${pageHeight}) không được bị tách`)
      }
    }
  }

  // Chạy qua các kịch bản cố định
  checkInvariants([10, 20, 30, 40, 50], 100)
  checkInvariants([100, 100, 100], 100)
  checkInvariants([99, 2, 99, 2], 100)
  checkInvariants([350, 40, 280, 10], 150)
  checkInvariants([0, 15, -5, 0, 80, 0], 50)

  // Chạy 50 ca ngẫu nhiên
  let seed = 12345
  const rand = () => {
    seed = (seed * 16807) % 2147483647
    return (seed - 1) / 2147483646
  }

  for (let t = 0; t < 50; t++) {
    const pageHeight = Math.floor(rand() * 400) + 100
    const count = Math.floor(rand() * 20) + 1
    const heights = []
    for (let c = 0; c < count; c++) {
      heights.push(Math.floor(rand() * 800) + 1)
    }
    checkInvariants(heights, pageHeight)
  }
})

test('buildScopedPrintCss: áp dụng tiền tố scope và không rò rỉ rule body/toàn cục', () => {
  const scoped = buildScopedPrintCss('exam-pdf-render-host')
  assert.ok(scoped.includes('.exam-pdf-render-host {'))
  assert.ok(scoped.includes('.exam-pdf-render-host .ep-header'))
  assert.ok(scoped.includes('.exam-pdf-render-host .pq'))
  assert.ok(!scoped.includes('@page'))
  assert.doesNotMatch(scoped, /(?:^|\n)\s*body\s*\{/)
  assert.doesNotMatch(scoped, /(?:^|\n)\s*\*\s*\{/)
})
