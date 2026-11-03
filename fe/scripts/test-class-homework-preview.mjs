import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { renderHomeworkMarkdownPreview } from '../src/js/utils/homework-markdown-preview.js'

test('preview hiển thị đề Markdown và lựa chọn nhưng không hiển thị đáp án', () => {
  const html = renderHomeworkMarkdownPreview([{
    question_number: 2, question_type: 'MULTIPLE_CHOICE',
    prompt: JSON.stringify({ text: '**Tính tổng**', options: [{ id: 'A', text: '$1+1$' }, { id: 'B', text: '3' }], mcAnswer: 'A', explanation: 'Giải thích bí mật' }),
    answerKey: { mc_answer: 'A' }
  }])
  assert.match(html, /<strong>Tính tổng<\/strong>/)
  assert.match(html, /Câu 2/)
  assert.match(html, /1\+1/)
  assert.match(html, /<strong>B\.<\/strong>/)
  assert.doesNotMatch(html, /Giải thích bí mật|mcAnswer|answerKey/)
})

test('preview fallback câu cũ, trạng thái trống và dữ liệu không tin cậy', () => {
  assert.match(renderHomeworkMarkdownPreview([]), /chưa có nội dung Markdown/)
  const html = renderHomeworkMarkdownPreview([{ question_number: '<img src=x>', prompt: '{invalid', content: '**Dự phòng**', part_title: '<script>x</script>' }, { prompt: JSON.stringify({ text: 'Hình', imageUrl: 'javascript:alert(1)' }) }])
  assert.doesNotMatch(html, /<script>|<img src=x>|javascript:/)
  assert.match(html, /\{invalid/)
  assert.match(html, /Câu 2/)
})

test('nút tại danh sách gọi tải blob thay vì mở tab PDF, vẫn giữ điều kiện quyền', () => {
  const view = readFileSync(new URL('../src/js/views/class-details.js', import.meta.url), 'utf8')
  const helper = readFileSync(new URL('../src/js/utils/download-helper.js', import.meta.url), 'utf8')
  assert.match(view, /btn-class-homework-preview/)
  assert.match(view, /btn-class-homework-download/)
  assert.match(view, /canViewHomeworkPdf\(state\.user\?\.role, hw\)/)
  assert.match(view, /await downloadHomeworkPdf\(button\.dataset\.homeworkId\)/)
  const downloadBody = helper.slice(helper.indexOf('export async function downloadHomeworkPdf'), helper.indexOf('// Bind to window'))
  assert.doesNotMatch(downloadBody, /window\.open/)
  assert.match(downloadBody, /a\.download = downloadName/)
})

test('preview có màu chữ tương phản và chỉ một vùng cuộn, không cuộn trang nền', () => {
  const view = readFileSync(new URL('../src/js/views/class-details.js', import.meta.url), 'utf8')
  const css = readFileSync(new URL('../src/css/styles.css', import.meta.url), 'utf8')
  assert.match(view, /contentClass: 'class-homework-preview-modal'/)
  assert.doesNotMatch(view, /max-height:65vh;overflow:auto/)
  assert.match(css, /\.class-homework-preview-modal \.interactive-q-prompt\s*\{\s*color: inherit;/)
  assert.match(css, /\.class-homework-preview-modal > \.modal-body\s*\{[^}]*overflow-y: auto;/)
  assert.match(css, /html:has\(body\.modal-open #modal-container \.class-homework-preview-modal\)\s*\{\s*overflow: hidden;/)
  assert.match(css, /\.modal-backdrop:has\(\.class-homework-preview-modal\)\s*\{\s*overflow: hidden;/)
})

test('nhãn trục đồ thị nền trắng giữ màu tối trong modal navy', () => {
  const css = readFileSync(new URL('../src/css/styles.css', import.meta.url), 'utf8')
  const graph = readFileSync(new URL('../src/js/utils/diagrams/graph.js', import.meta.url), 'utf8')
  const svg = readFileSync(new URL('../src/js/utils/diagrams/svg.js', import.meta.url), 'utf8')
  assert.match(graph, /<svg width="\$\{WIDTH\}"[^`]*background:#fff/)
  assert.match(graph, /foreignLabel\(.*formatTick\(t\.v\)/)
  assert.match(svg, /<foreignObject /)
  assert.match(css, /\.class-homework-preview-modal \.diagram-wrap svg\[style\*="background:#fff"\] foreignObject div\s*\{\s*color: #0f172a;/)
  assert.match(css, /\.class-homework-preview-modal \.interactive-q-prompt\s*\{\s*color: inherit;/)
})
