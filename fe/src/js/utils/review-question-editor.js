import { formatQuestionToMarkdown, parseExamMarkdown } from './exam-parser.js'

const EDITABLE_TYPES = ['MULTIPLE_CHOICE', 'TRUE_FALSE', 'SHORT_ANSWER']

export function canEditReviewQuestion(questionType) {
  return EDITABLE_TYPES.includes(String(questionType || '').toUpperCase())
}

function parseJson(value) {
  if (value && typeof value === 'object') return value
  if (typeof value !== 'string' || !value.trim().startsWith('{')) return {}
  try { return JSON.parse(value) } catch { return {} }
}

function normalizeKey(correct, type) {
  const key = typeof correct === 'string' && correct.trim().startsWith('{') ? parseJson(correct) : correct
  if (type === 'MULTIPLE_CHOICE') return { mcAnswer: typeof key === 'string' ? key : (key?.mc_answer || null) }
  if (type === 'TRUE_FALSE') {
    const tf = parseJson(key?.tf_answers || key)
    const toBool = v => v === true || v === 'true' || v === 1 || v === '1'
    const pick = (a, s) => toBool(tf[a] !== undefined ? tf[a] : tf[s])
    return { tfAnswers: { a: pick('a', 's1'), b: pick('b', 's2'), c: pick('c', 's3'), d: pick('d', 's4') } }
  }
  const answer = key && typeof key === 'object' ? (key.answer ?? key.sa_answer) : key
  const tolerance = key && typeof key === 'object' ? (key.tolerance ?? key.sa_tolerance ?? 0) : 0
  return { saAnswer: answer ?? '', saTolerance: Number(tolerance) || 0 }
}

/** Dựng markdown có thể sửa từ dữ liệu một câu trong trang Xem lại bài làm. */
export function reviewAnswerToMarkdown(ans) {
  const q = Array.isArray(ans.questions) ? ans.questions[0] : (ans.questions || {})
  const type = String(q.question_type || ans.questionType || 'MULTIPLE_CHOICE').toUpperCase()
  const promptObj = parseJson(q.prompt ?? ans.prompt)
  const meta = promptObj.metadata && typeof promptObj.metadata === 'object' ? promptObj.metadata : {}
  const listField = type === 'TRUE_FALSE'
    ? (promptObj.statements?.length ? promptObj.statements : (q.statements || promptObj.options || q.options || []))
    : (promptObj.options?.length ? promptObj.options : (q.options || []))
  return formatQuestionToMarkdown({
    questionNumber: q.question_number || ans.rawQuestionNumber || 1,
    questionType: type,
    difficulty: promptObj.difficulty,
    promptText: promptObj.text ?? q.content ?? (typeof q.prompt === 'string' && !q.prompt.startsWith('{') ? q.prompt : ''),
    imageUrl: promptObj.imageUrl || '',
    options: listField,
    explanation: ans.explanation || q.explanation || promptObj.explanation || '',
    classTag: meta.classTag, gradeTag: meta.gradeTag, subjectTag: meta.subjectTag,
    chapterTag: meta.chapterTag, lessonTag: meta.lessonTag, questionTypeTag: meta.questionTypeTag,
    ...normalizeKey(ans.correct_answer ?? ans.correctAnswerSummary, type),
  })
}

/**
 * Parse markdown đã sửa thành payload gửi backend. Trả { error } nếu không hợp lệ.
 * Loại câu bị khóa theo câu gốc; ảnh cũ chỉ giữ khi markdown còn thẻ [Ảnh].
 */
export function buildReviewQuestionPayload(markdown, ans) {
  const q = Array.isArray(ans.questions) ? ans.questions[0] : (ans.questions || {})
  const type = String(q.question_type || ans.questionType || 'MULTIPLE_CHOICE').toUpperCase()
  const text = String(markdown || '').trim()
  if (!text) return { error: 'Nội dung câu hỏi không được để trống' }
  const parsed = parseExamMarkdown(text, type)
  if (!parsed.questions || parsed.questions.length !== 1) {
    return { error: 'Chỉ được có đúng 1 câu hỏi theo định dạng [Câu ...]' }
  }
  const p = parsed.questions[0]
  if (p.questionType !== type) {
    return { error: 'Không được đổi loại câu hỏi (trắc nghiệm / Đúng-Sai / trả lời ngắn)' }
  }
  const old = parseJson(q.prompt ?? ans.prompt)
  const imageUrl = p.imageUrl || (/\[Ảnh|!\[/.test(text) ? (old.imageUrl || '') : '')
  const isTf = type === 'TRUE_FALSE'
  const isMc = type === 'MULTIPLE_CHOICE'
  const isSa = type === 'SHORT_ANSWER'
  const opts = p.options || []
  const filled = (ids) => ids.every(id => String(opts.find(o => String(o.id).toLowerCase() === id)?.text || '').trim())
  if (isMc && !filled(['a', 'b', 'c', 'd'])) return { error: 'Câu trắc nghiệm cần đủ nội dung 4 phương án A, B, C, D' }
  if (isTf && !filled(['a', 'b', 'c', 'd'])) return { error: 'Câu Đúng/Sai cần đủ nội dung 4 ý a), b), c), d)' }
  if (isMc && !text.split('\n').some(line => /^\s*\*\s*[A-D]\s*[.)]/i.test(line))) return { error: 'Hãy đánh dấu * trước phương án đúng' }
  if (isSa && !String(p.saAnswer ?? '').trim()) return { error: 'Câu trả lời ngắn cần có [Đáp án: ...]' }
  const metadata = {
    classTag: p.classTag || p.gradeTag || null, gradeTag: p.gradeTag || p.classTag || null,
    subjectTag: p.subjectTag || null, chapterTag: p.chapterTag || null,
    lessonTag: p.lessonTag || null, questionTypeTag: p.questionTypeTag || null,
  }
  const difficulty = p.difficulty || old.difficulty || 'THONG_HIEU'
  return {
    question: {
      questionType: type,
      prompt: JSON.stringify({
        isInteractive: true,
        text: p.promptText || '',
        imageUrl,
        partTitle: old.partTitle || q.part_title || '',
        options: isMc ? opts : [],
        statements: isTf ? opts : [],
        explanation: p.explanation || '',
        difficulty,
        metadata,
      }),
      content: p.promptText || '',
      options: isTf ? null : (isMc ? opts : null),
      statements: isTf ? opts : null,
      partTitle: old.partTitle || q.part_title || null,
      explanation: p.explanation || '',
      difficulty,
      imageUrl,
      mcAnswer: isMc ? p.mcAnswer : null,
      tfAnswers: isTf ? p.tfAnswers : null,
      saAnswer: isSa ? String(p.saAnswer ?? '').trim() : null,
      saTolerance: isSa ? Number(p.saTolerance) || 0 : 0,
      ...metadata,
    },
  }
}
