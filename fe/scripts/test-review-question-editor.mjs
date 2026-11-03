import assert from 'node:assert/strict'
import { reviewAnswerToMarkdown, buildReviewQuestionPayload, canEditReviewQuestion } from '../src/js/utils/review-question-editor.js'

let passed = 0
const test = (name, fn) => { fn(); passed++; console.log(`  ✓ ${name}`) }

const mcAns = {
  id: 'ans1',
  correct_answer: 'A',
  questions: {
    question_number: 3, question_type: 'MULTIPLE_CHOICE', part_title: null,
    prompt: JSON.stringify({
      isInteractive: true, text: 'Số liên kết của nitrogen trong amine là', imageUrl: 'https://img/x.png',
      options: [{ id: 'A', text: '3 và 1' }, { id: 'B', text: '2 và 3' }, { id: 'C', text: '1 và 3' }, { id: 'D', text: '2 và 2' }],
      explanation: 'Có 3 liên kết.', difficulty: 'VAN_DUNG',
      metadata: { classTag: '12', gradeTag: '12', subjectTag: 'Hóa', chapterTag: 'Chương 3', lessonTag: 'Bài 8', questionTypeTag: 'Khác' },
    }),
  },
}

test('markdown mở ra giống luồng tạo bài: đáp án đúng đánh *, giữ metadata và lời giải', () => {
  const md = reviewAnswerToMarkdown(mcAns)
  assert.match(md, /^\[Câu 3\] \[VAN_DUNG\] \[LỚP: 12\] \[MÔN: Hóa\] \[CHƯƠNG: Chương 3\] \[BÀI HỌC: Bài 8\] \[DẠNG BÀI: Khác\]/)
  assert.match(md, /^\*A\. 3 và 1$/m)
  assert.match(md, /^\[Ảnh\]$/m)
  assert.match(md, /\[Lời giải\]\nCó 3 liên kết\./)
})

test('đổi dấu * sang C: payload gửi mcAnswer mới, giữ prompt JSON/metadata/ảnh', () => {
  const md = reviewAnswerToMarkdown(mcAns).replace('*A. 3 và 1', 'A. 3 và 1').replace('C. 1 và 3', '*C. 1 và 3')
  const { question, error } = buildReviewQuestionPayload(md, mcAns)
  assert.equal(error, undefined)
  assert.equal(question.mcAnswer, 'C')
  assert.equal(question.questionType, 'MULTIPLE_CHOICE')
  const prompt = JSON.parse(question.prompt)
  assert.equal(prompt.isInteractive, true)
  assert.equal(prompt.imageUrl, 'https://img/x.png')
  assert.equal(prompt.metadata.subjectTag, 'Hóa')
  assert.deepEqual(prompt.options.map(o => o.id), ['A', 'B', 'C', 'D'])
  assert.equal(question.points, undefined, 'không cho đổi điểm')
})

test('xóa thẻ [Ảnh] thì bỏ ảnh; không đánh dấu đáp án đúng thì từ chối', () => {
  const noImg = buildReviewQuestionPayload(reviewAnswerToMarkdown(mcAns).replace('[Ảnh]\n', ''), mcAns)
  assert.equal(noImg.question.imageUrl, '')
  const noStar = buildReviewQuestionPayload(reviewAnswerToMarkdown(mcAns).replace('*A.', 'A.'), mcAns)
  assert.match(noStar.error, /đánh dấu \*/)
})

test('không được đổi loại câu hay gộp nhiều câu', () => {
  const asTf = buildReviewQuestionPayload('[Câu 3] [TF]\nMệnh đề\n*a) 1\nb) 2\nc) 3\nd) 4', mcAns)
  assert.match(asTf.error, /đổi loại câu/)
  const two = buildReviewQuestionPayload(`${reviewAnswerToMarkdown(mcAns)}\n\n${reviewAnswerToMarkdown(mcAns)}`, mcAns)
  assert.match(two.error, /đúng 1 câu/)
  assert.match(buildReviewQuestionPayload('   ', mcAns).error, /không được để trống/)
})

test('Đúng/Sai và trả lời ngắn round-trip theo khóa hiện tại', () => {
  const tf = {
    correct_answer: { a: true, b: false, c: true, d: false },
    questions: { question_number: 1, question_type: 'TRUE_FALSE', prompt: JSON.stringify({ isInteractive: true, text: 'Xét', statements: [
      { id: 'a', text: 'A1' }, { id: 'b', text: 'B1' }, { id: 'c', text: 'C1' }, { id: 'd', text: 'D1' }] }) },
  }
  const tfMd = reviewAnswerToMarkdown(tf)
  assert.match(tfMd, /^\*a\) A1$/m)
  assert.match(tfMd, /^b\) B1$/m)
  const tfPayload = buildReviewQuestionPayload(tfMd.replace('b) B1', '*b) B1'), tf).question
  assert.deepEqual(tfPayload.tfAnswers, { a: true, b: true, c: true, d: false })
  assert.equal(tfPayload.options, null)
  assert.equal(tfPayload.statements.length, 4)

  const sa = { correct_answer: { answer: '2.5', tolerance: 0.1 }, questions: { question_number: 2, question_type: 'SHORT_ANSWER', prompt: JSON.stringify({ isInteractive: true, text: 'Tính' }) } }
  const saMd = reviewAnswerToMarkdown(sa)
  assert.match(saMd, /\[Đáp án: 2\.5\]/)
  assert.match(saMd, /\[Dung sai: 0\.1\]/)
  const saPayload = buildReviewQuestionPayload(saMd.replace('2.5', '3.5'), sa).question
  assert.equal(saPayload.saAnswer, '3.5')
  assert.equal(saPayload.saTolerance, 0.1)
})

test('tự luận không có nút sửa', () => {
  assert.equal(canEditReviewQuestion('ESSAY'), false)
  assert.equal(canEditReviewQuestion('MULTIPLE_CHOICE'), true)
})

test('khóa Đúng/Sai dạng chuỗi/số không bị đổi thành Sai khi mở và lưu lại', () => {
  const tf = {
    correct_answer: { a: 'true', b: false, c: 1, d: '0' },
    questions: { question_number: 1, question_type: 'TRUE_FALSE', prompt: JSON.stringify({ isInteractive: true, text: 'Xét', statements: [
      { id: 'a', text: 'A1' }, { id: 'b', text: 'B1' }, { id: 'c', text: 'C1' }, { id: 'd', text: 'D1' }] }) },
  }
  assert.deepEqual(buildReviewQuestionPayload(reviewAnswerToMarkdown(tf), tf).question.tfAnswers, { a: true, b: false, c: true, d: false })
})

test('thay ảnh bằng URL mới được giữ; thiếu phương án/ý bị từ chối', () => {
  const md = reviewAnswerToMarkdown(mcAns).replace('[Ảnh]', '[Ảnh: https://example.com/new.png]')
  assert.equal(buildReviewQuestionPayload(md, mcAns).question.imageUrl, 'https://example.com/new.png')
  const mdLess = reviewAnswerToMarkdown(mcAns).replace(/^B\. .*\n/m, '').replace(/^D\. .*\n?/m, '')
  assert.match(buildReviewQuestionPayload(mdLess, mcAns).error, /4 phương án/)
  const tf = { correct_answer: { a: true, b: true, c: true, d: true }, questions: { question_number: 1, question_type: 'TRUE_FALSE', prompt: JSON.stringify({ isInteractive: true, text: 'Xét', statements: [{ id: 'a', text: 'A1' }] }) } }
  assert.match(buildReviewQuestionPayload('[Câu 1] [TF]\nXét\n*a) A1', tf).error, /4 ý/)
})

console.log(`\nKết quả: ${passed} passed`)
