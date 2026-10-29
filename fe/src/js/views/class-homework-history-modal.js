import { api } from '../api.js'
import { openModal } from '../components/modal.js'
import { renderMarkdown, renderMath } from '../utils/exam-parser.js'

const escapeHtml = value => String(value ?? '')
  .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
  .replace(/"/g, '&quot;').replace(/'/g, '&#39;')

const dateText = value => {
  const date = value ? new Date(value) : null
  return date && !Number.isNaN(date.getTime()) ? date.toLocaleString('vi-VN') : '—'
}

const numberText = value => Number.isFinite(Number(value)) ? Number(value).toLocaleString('vi-VN') : '0'

function parsePrompt(prompt) {
  let parsed = prompt && typeof prompt === 'object' ? prompt : null
  if (!parsed && typeof prompt === 'string') {
    try { parsed = JSON.parse(prompt) } catch { /* Plain text. */ }
    if (!parsed || typeof parsed !== 'object') parsed = { text: prompt }
  }
  if (!parsed || Array.isArray(parsed)) return {}
  // Đề cũ đôi khi stringify JSON hai lần trong prompt.text; không hiện cả khối JSON cho giáo viên.
  for (let depth = 0; depth < 2 && typeof parsed.text === 'string' && parsed.text.trim().startsWith('{'); depth++) {
    try {
      const inner = JSON.parse(parsed.text)
      if (!inner || typeof inner !== 'object' || Array.isArray(inner) || typeof inner.text !== 'string') break
      parsed = { ...parsed, ...inner, metadata: inner.metadata || parsed.metadata }
    } catch { break }
  }
  return parsed
}

function safeImageUrl(value) {
  const url = String(value ?? '').trim()
  if (/^data:image\/(?:png|jpeg|gif|webp);base64,[a-z0-9+/=\s]+$/i.test(url)) return url
  try {
    const parsed = new URL(url)
    return ['https:', 'http:'].includes(parsed.protocol) && !/[<>"'\u0000-\u0020]/.test(url) ? url : ''
  } catch { return '' }
}

// renderMarkdown restores math verbatim; never insert its result without this
// small output allowlist. No event/style attributes, raw HTML or SVG survive.
function safeMarkdown(value) {
  const html = renderMarkdown(typeof value === 'string' ? value : String(value ?? ''))
    .replace(/\$\$[\s\S]*?\$\$|\\\[[\s\S]*?\\\]|\$(?!\s)[^$\n]+(?<!\s)\$|\\\([\s\S]*?\\\)/g, escapeHtml)
  const tags = new Set(['div', 'span', 'p', 'br', 'strong', 'em', 'code', 'h2', 'h3', 'h4', 'ul', 'ol', 'li', 'blockquote', 'table', 'thead', 'tbody', 'tr', 'th', 'td'])
  return (html.match(/<[^>]*>|[^<]+|</g) || []).map(token => {
    if (!token.startsWith('<')) return token
    const match = token.match(/^<(\/?)([a-z][a-z0-9]*)(?:\s[^<>]*)?\s*\/?>$/i)
    if (!match) return escapeHtml(token)
    const [, closing, rawTag] = match
    const tag = rawTag.toLowerCase()
    if (tags.has(tag)) return `<${closing}${tag}>`
    if (tag === 'img' && !closing) {
      const raw = token.match(/\ssrc="([^"]*)"/i)?.[1] || ''
      const url = safeImageUrl(raw.replace(/&amp;/g, '&').replace(/&quot;/g, '"').replace(/&#39;/g, "'"))
      return url ? `<img src="${escapeHtml(url)}" alt="Hình câu hỏi" loading="lazy">` : ''
    }
    return ''
  }).join('')
}

function typeName(question) {
  const tag = question.questionTypeTag || parsePrompt(question.prompt).metadata?.questionTypeTag
  return typeof tag === 'string' && tag.trim() ? tag.normalize('NFC').trim().replace(/\s+/g, ' ') : 'Chưa phân loại'
}

export function groupWrongQuestions(questions) {
  const groups = new Map()
  const seen = new Set()
  questions.forEach(q => {
    const identity = q.questionId || `number:${q.questionNumber}`
    if (seen.has(identity)) return
    seen.add(identity)
    const name = typeName(q)
    const key = name.toLocaleLowerCase('vi-VN')
    if (!groups.has(key)) groups.set(key, { name, questionCount: 0, failedAttempts: 0 })
    const group = groups.get(key)
    group.questionCount++
    group.failedAttempts += Number(q.totalFailed ?? (Number(q.wrongCount || 0) + Number(q.unansweredCount || 0))) || 0
  })
  return [...groups.values()]
}

function renderWrongQuestion(q, totalAttempts) {
  const prompt = parsePrompt(q.prompt)
  const options = Array.isArray(prompt.options) && prompt.options.length ? prompt.options : Array.isArray(prompt.statements) ? prompt.statements : []
  const tf = q.questionType === 'TRUE_FALSE'
  const image = safeImageUrl(prompt.imageUrl || prompt.image)
  const students = Array.isArray(q.students) ? q.students : []
  const distinct = new Set(students.map(s => s.studentId).filter(Boolean)).size
  return `<article class="class-hw-wrong-card">
    <div style="display:flex;justify-content:space-between;gap:12px;flex-wrap:wrap;"><strong style="color:#b91c1c;">Câu ${numberText(q.questionNumber)}</strong><span style="color:#475569;">Dạng bài: ${escapeHtml(typeName(q))}</span></div>
    <div class="class-hw-question-content">${safeMarkdown(prompt.text || prompt.prompt || prompt.content || 'Chưa có nội dung câu hỏi.')}</div>
    ${image ? `<img src="${escapeHtml(image)}" alt="Hình minh họa câu ${numberText(q.questionNumber)}" loading="lazy">` : ''}
    ${options.length ? `<div><strong>${tf ? 'Các mệnh đề' : 'Các phương án'}</strong>${options.map((opt, index) => {
      const id = typeof opt === 'object' && opt ? opt.id || opt.key : null
      const text = typeof opt === 'object' && opt ? opt.text || opt.content || '' : opt
      return `<div class="class-hw-option"><strong>${escapeHtml(id || String.fromCharCode((tf ? 97 : 65) + index))}.</strong><div>${safeMarkdown(text)}</div></div>`
    }).join('')}</div>` : ''}
    <div class="class-hw-correct"><strong>Đáp án đúng:</strong> ${q.correctAnswer && q.correctAnswer !== 'N/A' ? safeMarkdown(q.correctAnswer) : 'Chưa có dữ liệu đáp án'}${tf ? '<div style="font-size:12px;">Đ = Đúng · S = Sai · − = chưa có đáp án</div>' : ''}</div>
    <div style="color:#b91c1c;font-size:14px;margin-top:12px;"><strong>${numberText(q.wrongCount)} lượt trả lời sai · ${numberText(q.unansweredCount)} lượt bỏ trống</strong></div>
    <div style="font-size:13px;color:#64748b;margin-top:6px;">Tổng lượt chưa đúng: ${numberText(q.totalFailed ?? (Number(q.wrongCount || 0) + Number(q.unansweredCount || 0)))}${distinct ? ` · ${distinct} học sinh có lượt chưa đúng` : ''}. Tổng lượt đã nộp của bài: ${numberText(q.totalSubmittedAttempts ?? totalAttempts)}.</div>
    ${students.length ? `<details style="margin-top:12px;"><summary style="cursor:pointer;color:#0369a1;">Xem câu trả lời của các lượt chưa đúng (${students.length})</summary><div>${students.map(s => `<div class="class-hw-option"><div><strong>${escapeHtml(s.studentName || 'Học sinh')}</strong>${s.submittedAt ? `<div style="font-size:12px;color:#64748b;">Nộp: ${dateText(s.submittedAt)}</div>` : ''}</div><div>${s.isUnanswered ? 'Bỏ trống' : safeMarkdown(s.givenAnswer ?? 'Chưa có dữ liệu')}</div></div>`).join('')}</div></details>` : ''}
    ${prompt.explanation ? `<details style="margin-top:12px;"><summary style="cursor:pointer;">Lời giải</summary><div class="class-hw-question-content">${safeMarkdown(prompt.explanation)}</div></details>` : ''}
  </article>`
}

/** Dữ liệu hiển thị chỉ lấy từ API đã giới hạn theo lớp + đúng bài tập. */
export function renderClassHomeworkHistory(data, tab = 'submitted') {
  const history = Array.isArray(data?.history) ? data.history : []
  const missing = Array.isArray(data?.unsubmittedStudents) ? data.unsubmittedStudents : []
  const wrong = Array.isArray(data?.wrongQuestionsSummary) ? data.wrongQuestionsSummary : []
  const stats = data?.submissionStats || {}
  const enrolled = Number(stats.totalStudents) || 0
  const submitted = new Set(history.map(s => s.studentId).filter(Boolean)).size
  const rate = enrolled ? Math.min(100, Math.round(submitted / enrolled * 100)) : 0

  return `
    <style>
      .class-hw-wrong-card{min-width:0;padding:20px;border:1px solid #e2e8f0;border-radius:14px;background:white;line-height:1.65;overflow-wrap:anywhere}
      .class-hw-wrong-card img{display:block;max-width:100%;height:auto;max-height:420px;object-fit:contain;margin:12px auto}
      .class-hw-question-content{margin:14px 0;color:#1e293b}
      .class-hw-option{display:flex;gap:10px;flex-wrap:wrap;padding:10px 12px;background:#f8fafc;border-radius:8px;margin-top:8px}
      .class-hw-option>div{flex:1;min-width:0}
      .class-hw-correct{margin-top:16px;padding:12px;background:#f0fdf4;border-radius:8px;color:#166534}
      .class-hw-wrong-card .katex-display{max-width:100%;overflow-x:auto;overflow-y:hidden}
      .class-hw-wrong-card table{display:block;max-width:100%;overflow-x:auto}
      @media(max-width:600px){.class-hw-wrong-card{padding:14px}}
    </style>
    <div style="background:#f8fafc;border:1px solid #e2e8f0;border-radius:12px;padding:16px;margin-bottom:16px;">
      <div style="display:flex;justify-content:space-between;gap:12px;flex-wrap:wrap;margin-bottom:12px;">
        <strong style="color:#0f172a;">Tiến độ nộp bài: ${submitted}/${enrolled} học sinh (${rate}%)</strong>
        <span style="color:#64748b;font-size:13px;">Hạn nộp: ${dateText(stats.deadline)}</span>
      </div>
      <div style="height:8px;background:#e2e8f0;border-radius:4px;overflow:hidden;margin-bottom:12px;"><div style="height:100%;width:${rate}%;background:#10b981;"></div></div>
      <div style="display:flex;gap:18px;flex-wrap:wrap;font-size:13px;color:#475569;">
        <span>Đã nộp: <strong>${submitted}</strong></span>
        <span>Chưa làm: <strong>${missing.length}</strong></span>
        <span>Điểm TB: <strong>${numberText(stats.averageScore)}</strong></span>
        <span>Đạt: <strong>${numberText(stats.passRate)}%</strong></span>
      </div>
    </div>
    <div style="display:flex;flex-wrap:wrap;gap:8px;margin-bottom:16px;border-bottom:1px solid #e2e8f0;padding-bottom:12px;">
      ${[
        ['submitted', `Đã nộp (${history.length})`],
        ['wrong', `Phân tích câu sai (${wrong.length})`],
        ['unsubmitted', `Chưa làm (${missing.length})`],
      ].map(([key, label]) => `<button type="button" class="btn-secondary class-hw-history-tab" data-tab="${key}" style="width:auto;padding:8px 12px;${tab === key ? 'background:#eff6ff;color:#0066cc;border-color:#0066cc;' : ''}">${label}</button>`).join('')}
    </div>
    ${tab === 'submitted' ? `
      <div class="table-responsive"><table class="data-table">
        <thead><tr><th>Học sinh</th><th>Ngày nộp</th><th>Điểm số</th><th>Câu sai</th><th>Thời gian làm</th></tr></thead>
        <tbody>${history.length ? history.map(sub => `<tr>
          <td><strong>${escapeHtml(sub.studentName)}</strong><div style="font-size:11px;color:#64748b;">${sub.username ? `@${escapeHtml(sub.username)}` : ''}</div></td>
          <td>${dateText(sub.submittedAt)}${sub.isLate || sub.is_late ? '<div style="color:#b45309;">Nộp muộn</div>' : ''}</td>
          <td><strong style="color:${sub.isPassed === false ? '#dc2626' : '#16a34a'};">${numberText(sub.score)} / ${numberText(sub.maxScore ?? 10)}</strong></td>
          <td>${(sub.wrongAnswers || []).length}</td>
          <td>${Math.floor((Number(sub.durationSecondsTaken) || 0) / 60)} phút</td>
        </tr>`).join('') : '<tr><td colspan="5" style="text-align:center;padding:32px;color:#64748b;">Chưa có học sinh nộp bài.</td></tr>'}</tbody>
      </table></div>
    ` : tab === 'unsubmitted' ? `
      <div class="table-responsive"><table class="data-table">
        <thead><tr><th>Học sinh</th><th>Tên đăng nhập</th><th>Trạng thái</th></tr></thead>
        <tbody>${missing.length ? missing.map(st => `<tr><td><strong>${escapeHtml(st.fullName || st.studentName)}</strong></td><td>${escapeHtml(st.username)}</td><td style="color:#c2410c;">${stats.isOverdue ? 'Quá hạn' : 'Chưa làm'}</td></tr>`).join('') : '<tr><td colspan="3" style="text-align:center;padding:32px;color:#16a34a;">Không có học sinh chưa làm bài.</td></tr>'}</tbody>
      </table></div>
    ` : `
      <p style="font-size:13px;color:#475569;line-height:1.6;">Thống kê theo lượt nộp, không phải số học sinh: một học sinh nộp nhiều lần được tính nhiều lượt. “1 lượt trả lời sai · 0 lượt bỏ trống” nghĩa là có 1 lượt đã trả lời nhưng chưa đúng, không có lượt bỏ trống. Các câu trả lời bên dưới chỉ gồm lượt chưa đúng (sai hoặc bỏ trống); không suy ra số lượt đúng từ dữ liệu này.</p>
      ${wrong.length ? `<section style="margin-bottom:20px;"><h4>Phân tích theo Dạng bài</h4><p style="font-size:13px;color:#64748b;">Số câu là số câu riêng biệt có lượt chưa đúng; lượt chưa đúng tính một lần cho mỗi cặp câu hỏi / lượt nộp, gồm cả bỏ trống. Không có metadata: Chưa phân loại.</p><div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(min(100%,240px),1fr));gap:12px;">${groupWrongQuestions(wrong).map(g => `<div style="padding:14px;background:#eff6ff;border-radius:10px;min-width:0;overflow-wrap:anywhere;"><strong>${escapeHtml(g.name)}</strong><div>${g.questionCount} câu có lỗi · ${g.failedAttempts} lượt chưa đúng</div></div>`).join('')}</div></section><div style="display:grid;grid-template-columns:minmax(0,1fr);gap:18px;">${wrong.map(q => renderWrongQuestion(q, history.length)).join('')}</div>` : '<div style="text-align:center;padding:32px;color:#16a34a;">Chưa ghi nhận câu sai nào.</div>'}
    `}
  `
}

export function openClassHomeworkHistoryModal(classId, homework) {
  if (!classId || !homework?.id) return
  const controller = new AbortController()
  const token = `${Date.now()}-${Math.random()}`
  let closed = false
  let result = null
  let tab = 'submitted'
  const root = () => document.querySelector(`[data-class-hw-history-token="${token}"]`)

  const render = () => {
    const element = root()
    if (!element || !result || closed) return
    element.innerHTML = renderClassHomeworkHistory(result, tab)
    renderMath(element)
    element.querySelectorAll('.class-hw-history-tab').forEach(button => {
      button.onclick = () => { tab = button.dataset.tab; render() }
    })
  }

  const load = async () => {
    const element = root()
    if (element) element.innerHTML = '<div style="padding:36px;text-align:center;color:#64748b;">Đang tải lịch sử và theo dõi nộp bài...</div>'
    try {
      const data = await api.getStudentHistory({ scope: 'CLASS', classId, homeworkId: homework.id, includeDraft: 'true' }, { signal: controller.signal, silent: true })
      if (closed || controller.signal.aborted || !root()) return
      // Backend cũng kiểm tra bài thuộc lớp; giữ guard FE để tránh hiển thị nhầm khi API thay đổi.
      if (!Array.isArray(data?.classHomeworks) || !data.classHomeworks.some(hw => hw.id === homework.id)) {
        throw new Error('Không tìm thấy bài tập trong lớp này.')
      }
      result = data
      render()
    } catch (error) {
      const element = root()
      if (closed || controller.signal.aborted || !element) return
      element.innerHTML = `<div style="text-align:center;padding:28px;color:#b91c1c;">Không tải được lịch sử: ${escapeHtml(error.message)}<br><button type="button" class="btn-secondary class-hw-history-retry" style="width:auto;margin-top:12px;">Thử lại</button></div>`
      element.querySelector('.class-hw-history-retry').onclick = load
    }
  }

  openModal(`Lịch sử & Theo dõi nộp bài — ${escapeHtml(homework.title)}`,
    `<div data-class-hw-history-token="${token}"></div>`, null, {
      cancelLabel: 'Đóng',
      shellFlex: true,
      contentStyle: 'max-width:1120px;width:min(1120px,96vw);max-height:min(90dvh,calc(100dvh - 40px));display:flex;flex-direction:column;overflow:hidden;',
      bodyStyle: 'flex:1 1 auto;min-height:0;overflow-y:auto;overscroll-behavior:contain;',
      onClose: () => { closed = true; controller.abort() },
    })
  load()
}
