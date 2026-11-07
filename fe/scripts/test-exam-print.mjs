import test from 'node:test'
import assert from 'node:assert/strict'
import { parseExamMarkdown, MATH_TEMPLATE, CHEM_TEMPLATE } from '../src/js/utils/exam-parser.js'
import {
  normalizePrintQuestions,
  buildExamPrintBody,
  buildAnswerKeyHtml,
  buildExamPrintDocument,
  canExportExam,
  sanitizePrintTitle
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
