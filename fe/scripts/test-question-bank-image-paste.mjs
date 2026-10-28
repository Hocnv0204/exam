import assert from 'node:assert/strict'
import { parseExamMarkdown } from '../src/js/utils/exam-parser.js'
import {
  splitQuestionSourceBlocks,
  findQuestionBlockIndexAtOffset,
  buildQuestionImageTag,
  insertImageTagIntoQuestionSource,
  insertImageTagIntoSource,
  removeImageTagsFromSource,
  isSupportedImageSource
} from '../src/js/utils/question-bank-image.js'

console.log('=== Kiểm thử dán ảnh Modal Ngân hàng câu hỏi > Nhập từ Markdown ===')

const IMG_A = 'data:image/webp;base64,AAAAQUJD'
const IMG_B = 'data:image/webp;base64,BBBBREVG'
const TAG_A = buildQuestionImageTag(IMG_A)
const TAG_B = buildQuestionImageTag(IMG_B)

const BASE_SOURCE = `# ĐỀ KIỂM TRA
Ghi chú chung trước danh sách câu.

[Câu 1] [TF]
Cho hình chóp có đáy là hình vuông.
[Ảnh]
Xét các khẳng định sau:
*a) Khẳng định đúng.
b) Khẳng định sai.

[Câu 2]
Tính giá trị biểu thức $A = 1 + 1$.
A. 1
*B. 2
C. 3
D. 4
[Lời giải]
$A = 2$.

[Câu 3]
Câu không có ảnh, đứng sau câu 2.
A. Sai
*B. Đúng
`

// ---------- 1. Chuẩn hóa thẻ ảnh đúng grammar parser ----------
{
  assert.equal(TAG_A, `[Ảnh: ${IMG_A}]`)
  assert.equal(buildQuestionImageTag('  https://cdn.example.com/a.png  '), '[Ảnh: https://cdn.example.com/a.png]')
  assert.equal(isSupportedImageSource(IMG_A), true)
  assert.equal(isSupportedImageSource('https://cdn.example.com/a.png'), true)
  assert.equal(isSupportedImageSource('blob:https://example.com/id'), true)
  assert.equal(isSupportedImageSource(''), false)
  assert.equal(isSupportedImageSource('data:text/html;base64,AAAA'), false)
  assert.equal(isSupportedImageSource('data:image/png,'), false)
  assert.equal(isSupportedImageSource('javascript:alert(1)'), false)
  assert.throws(() => buildQuestionImageTag(''), /không hợp lệ/i)
  assert.throws(() => buildQuestionImageTag('data:text/html,<b>x</b>'), /không hợp lệ/i)
  console.log('  ✓ buildQuestionImageTag chỉ nhận ảnh hợp lệ, đúng grammar [Ảnh: ...]')
}

// ---------- 2. Tách khối nguồn giống parser, bỏ preamble + image ref definition ----------
{
  const sourceWithRef = BASE_SOURCE + '\n[anh1]: ' + IMG_A + '\n'
  const split = splitQuestionSourceBlocks(sourceWithRef)
  assert.equal(split.blocks.length, 3)
  assert.ok(split.preamble.includes('ĐỀ KIỂM TRA'))
  assert.ok(!split.preamble.includes('[Câu 1]'))
  // Dòng định nghĩa ảnh không được tính là header câu mới
  assert.equal(split.blocks[2].end, sourceWithRef.length)
  assert.equal(split.blocks[0].start, sourceWithRef.indexOf('[Câu 1]'))
  assert.equal(split.blocks[1].start, sourceWithRef.indexOf('[Câu 2]'))
  console.log('  ✓ splitQuestionSourceBlocks nhận đúng 3 khối, preamble và ref ảnh không tạo câu ảo')
}

// ---------- 3. Dán ảnh vào câu 2 → parser gắn đúng câu 2, không lây câu 1/3 ----------
{
  const before = parseExamMarkdown(BASE_SOURCE).questions
  const result = insertImageTagIntoSource(BASE_SOURCE, 1, TAG_A)
  assert.ok(result)
  assert.equal(result.replaced, false)

  const source = result.source
  const after = parseExamMarkdown(source).questions
  assert.equal(after.length, 3)
  assert.equal(after[0].imageUrl, '')
  assert.equal(after[1].imageUrl, IMG_A)
  assert.equal(after[2].imageUrl, '')
  assert.equal(after[0].promptText, before[0].promptText)
  assert.equal(after[1].promptText, before[1].promptText)
  assert.equal(after[2].promptText, before[2].promptText)

  // Thẻ ảnh nằm trong khối câu 2, không nằm ở preamble hay câu khác
  const split = splitQuestionSourceBlocks(source)
  const block2 = source.slice(split.blocks[1].start, split.blocks[1].end)
  assert.ok(block2.includes(TAG_A))
  assert.equal(source.split(TAG_A).length - 1, 1)
  assert.ok(!source.slice(0, split.blocks[1].start).includes(TAG_A))
  assert.ok(!source.slice(split.blocks[1].end).includes(TAG_A))
  // Con trỏ sau khi chèn trỏ đúng vị trí thẻ ảnh trong nguồn batch
  assert.equal(source.slice(result.tagStart, result.tagEnd), TAG_A)
  console.log('  ✓ ảnh dán vào câu 2 chỉ gắn imageUrl cho câu 2, prompt các câu không đổi')
}

// ---------- 4. Dán lại / sửa nguồn rồi parse lại không nhân đôi ảnh ----------
{
  const first = insertImageTagIntoSource(BASE_SOURCE, 1, TAG_A).source
  const secondResult = insertImageTagIntoSource(first, 1, TAG_B)
  assert.equal(secondResult.replaced, true)

  const second = secondResult.source
  const questions = parseExamMarkdown(second).questions
  assert.equal(questions[1].imageUrl, IMG_B)
  assert.equal(second.split('[Ảnh:').length - 1, 1)
  assert.ok(!second.includes(IMG_A))

  const reparsedAgain = parseExamMarkdown(second).questions
  assert.deepEqual(
    reparsedAgain.map(q => ({ n: q.questionNumber, image: q.imageUrl, prompt: q.promptText })),
    questions.map(q => ({ n: q.questionNumber, image: q.imageUrl, prompt: q.promptText }))
  )
  console.log('  ✓ dán ảnh mới thay thế ảnh cũ tại chỗ; reparse lặp lại không nhân đôi')
}

// ---------- 5. Nguồn có [Ảnh] placeholder: thay placeholder → ảnh thật, không thêm dòng ----------
{
  const withPlaceholder = `[Câu 1]\nĐề bài.\n[Ảnh]\nA. 1\n*B. 2\n`
  const result = insertImageTagIntoSource(withPlaceholder, 0, TAG_A)
  assert.equal(result.replaced, true)
  assert.equal(result.source.split('[Ảnh').length - 1, 1)
  const q = parseExamMarkdown(result.source).questions[0]
  assert.equal(q.imageUrl, IMG_A)
  assert.equal(q.hasImagePlaceholder, true)
  assert.equal(q.promptText, 'Đề bài.')
  console.log('  ✓ thay thẻ [Ảnh] placeholder bằng dữ liệu ảnh, parser gắn đúng imageUrl')
}

// ---------- 5b. Câu Đúng/Sai có 4 ý: dán ảnh không làm mất/đổi đáp án các ý ----------
{
  const tfSource = `[Câu 1] [TF]\nCho hình chóp.\nXét các khẳng định:\n*a) Ý đúng.\nb) Ý sai.\nc) Ý sai.\n*d) Ý đúng.\n`
  const result = insertImageTagIntoSource(tfSource, 0, TAG_A)
  const q = parseExamMarkdown(result.source).questions[0]
  assert.equal(q.imageUrl, IMG_A)
  assert.equal(q.questionType, 'TRUE_FALSE')
  assert.equal(q.options.length, 4)
  assert.deepEqual(q.tfAnswers, { a: true, b: false, c: false, d: true })
  console.log('  ✓ ảnh dán vào câu Đúng/Sai giữ nguyên 4 ý và đáp án đúng/sai')
}

// ---------- 6. Xác định câu theo con trỏ batch textarea ----------
{
  const split = splitQuestionSourceBlocks(BASE_SOURCE)
  assert.equal(findQuestionBlockIndexAtOffset(split.blocks, 0), null, 'preamble không thuộc câu nào')
  assert.equal(findQuestionBlockIndexAtOffset(split.blocks, BASE_SOURCE.indexOf('Ghi chú')), null)
  assert.equal(findQuestionBlockIndexAtOffset(split.blocks, BASE_SOURCE.indexOf('Cho hình chóp')), 0)
  assert.equal(findQuestionBlockIndexAtOffset(split.blocks, BASE_SOURCE.indexOf('Tính giá trị')), 1)
  assert.equal(findQuestionBlockIndexAtOffset(split.blocks, split.blocks[1].start), 1)
  assert.equal(findQuestionBlockIndexAtOffset(split.blocks, BASE_SOURCE.length), 2, 'cuối file thuộc câu cuối')
  console.log('  ✓ con trỏ trong preamble bị từ chối; trong câu 1/2/3 map đúng chỉ số')
}

// ---------- 7. Xóa ảnh khỏi đúng câu ----------
{
  const withImage = insertImageTagIntoSource(BASE_SOURCE, 1, TAG_A).source
  const removed = removeImageTagsFromSource(withImage, 1)
  assert.ok(removed)
  assert.equal(removed.removed, true)
  const questions = parseExamMarkdown(removed.source).questions
  assert.equal(questions.length, 3)
  assert.equal(questions[0].imageUrl, '')
  assert.equal(questions[1].imageUrl, '')
  assert.equal(questions[2].imageUrl, '')
  assert.equal(questions[1].promptText, parseExamMarkdown(BASE_SOURCE).questions[1].promptText)
  assert.equal(removed.source.split('[Ảnh:').length - 1, 0)

  const again = removeImageTagsFromSource(removed.source, 1)
  assert.equal(again.removed, false)
  assert.equal(again.source, removed.source)
  console.log('  ✓ xóa ảnh chỉ tác động câu 2, nội dung câu giữ nguyên, xóa lần 2 an toàn')
}

// ---------- 8. Helper chèn trong 1 khối câu (dùng cho editor Mã nguồn) ----------
{
  const block = splitQuestionSourceBlocks(BASE_SOURCE).blocks[1]
  const blockSource = BASE_SOURCE.slice(block.start, block.end)
  const result = insertImageTagIntoQuestionSource(blockSource, TAG_A)
  assert.equal(result.source.slice(result.tagStart, result.tagEnd), TAG_A)
  const q = parseExamMarkdown(result.source).questions[0]
  assert.equal(q.imageUrl, IMG_A)
  assert.equal(q.promptText, 'Tính giá trị biểu thức $A = 1 + 1$.')
  console.log('  ✓ chèn trong editor Mã nguồn giữ đúng offset thẻ ảnh và prompt của câu')
}

// ---------- 9. Không xác định được câu → không ghi gì ----------
{
  assert.equal(insertImageTagIntoSource(BASE_SOURCE, 99, TAG_A), null)
  assert.equal(removeImageTagsFromSource(BASE_SOURCE, 99), null)
  assert.equal(findQuestionBlockIndexAtOffset([], 0), null)
  console.log('  ✓ chỉ số câu ngoài phạm vi trả null, UI có thể báo lỗi thay vì ghi nhầm')
}

console.log('\n✅ Tất cả kiểm thử dán ảnh Ngân hàng câu hỏi đã PASS')
