import { renderMarkdown } from './exam-parser.js'

const escapeHtml = value => String(value ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#039;')

function parsePrompt(raw, fallback) {
  let data = {}
  if (raw && typeof raw === 'object') data = raw
  else if (typeof raw === 'string') {
    try {
      const parsed = JSON.parse(raw)
      data = parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? parsed : { text: raw }
    } catch { data = { text: raw } }
  }
  // Some older questions store the payload twice as serialized JSON.
  for (let i = 0; i < 3 && typeof data.text === 'string' && data.text.trim().startsWith('{'); i++) {
    try {
      const inner = JSON.parse(data.text)
      if (!inner || typeof inner !== 'object' || Array.isArray(inner) || !('text' in inner || 'options' in inner || 'statements' in inner)) break
      data = { ...data, ...inner }
    } catch { break }
  }
  return { ...data, text: typeof data.text === 'string' && data.text ? data.text : (fallback || '') }
}

const safeImage = url => typeof url === 'string' && /^(https?:\/\/|data:image\/(?:png|jpeg|gif|webp);base64,)/i.test(url) ? escapeHtml(url) : ''

export function renderHomeworkMarkdownPreview(questions) {
  if (!Array.isArray(questions) || !questions.length) return '<p>Đề bài này chưa có nội dung Markdown để xem trước.</p>'
  return questions.map((q, index) => {
    const prompt = parsePrompt(q.prompt, q.content)
    const type = q.question_type || q.questionType
    const options = type === 'TRUE_FALSE'
      ? (Array.isArray(q.statements) && q.statements.length ? q.statements : (Array.isArray(prompt.statements) && prompt.statements.length ? prompt.statements : prompt.options))
      : (Array.isArray(prompt.options) && prompt.options.length ? prompt.options : q.options)
    const image = safeImage(prompt.imageUrl)
    const content = renderMarkdown(prompt.text)
    return `<article style="padding:16px 0;border-bottom:1px solid #e2e8f0;">
      <strong>Câu ${escapeHtml(q.question_number || index + 1)}</strong>
      ${q.part_title || prompt.partTitle ? `<div style="font-size:12px;color:#64748b;">${escapeHtml(q.part_title || prompt.partTitle)}</div>` : ''}
      <div class="interactive-q-prompt">${content || '<em>Chưa có nội dung câu hỏi.</em>'}</div>
      ${image ? `<img src="${image}" alt="Hình minh họa câu hỏi" style="max-width:100%;max-height:420px;object-fit:contain;display:block;margin:10px 0;">` : ''}
      ${Array.isArray(options) && options.length ? `<div style="display:grid;gap:8px;margin-top:10px;">${options.map((opt, i) => {
        const text = typeof opt === 'string' ? opt : (opt?.text || '')
        const label = typeof opt === 'object' && opt !== null ? (opt.id || opt.key || String.fromCharCode(65 + i)) : String.fromCharCode(65 + i)
        return `<div style="padding:8px 12px;border:1px solid #e2e8f0;border-radius:8px;"><strong>${escapeHtml(label)}.</strong> ${renderMarkdown(text)}</div>`
      }).join('')}</div>` : ''}
    </article>`
  }).join('')
}
