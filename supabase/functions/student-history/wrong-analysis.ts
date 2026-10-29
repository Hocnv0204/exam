/** Không suy Dạng bài từ question_type (MC/TF/SA là định dạng trả lời). */
export function resolveWrongQuestionType(prompt: any, bank: any = null): string | null {
  if (typeof prompt === 'string') {
    try { prompt = JSON.parse(prompt) } catch { prompt = null }
  }
  const tag = prompt?.metadata?.questionTypeTag
  if (typeof tag === 'string' && tag.trim()) return tag.normalize('NFC').trim().replace(/\s+/g, ' ')
  bank = Array.isArray(bank) ? bank[0] : bank
  const type = Array.isArray(bank?.qb_question_types) ? bank.qb_question_types[0] : bank?.qb_question_types
  // FK alone is insufficient: Constant type must belong to the bank row's lesson.
  if (!bank?.id || !bank.qb_lesson_id || type?.lesson_id !== bank.qb_lesson_id) return null
  return typeof type.name === 'string' && type.name.trim() ? type.name.normalize('NFC').trim().replace(/\s+/g, ' ') : null
}

export function isBlankWrongAnswer(raw: any): boolean {
  let value = raw
  if (typeof value === 'string') {
    value = value.trim()
    try { value = JSON.parse(value) } catch { /* Plain MC/short answer. */ }
  }
  if (value && typeof value === 'object' && 'value' in value) return isBlankWrongAnswer(value.value)
  if (value === null || value === undefined || value === '') return true
  if (typeof value === 'object') return Object.values(value).every(isBlankWrongAnswer)
  return false // false and zero are real answers, not blanks.
}

/** Supabase's default row cap must not silently undercount a homework. */
export async function loadAllAnalysisRows(buildQuery: () => any) {
  const rows: any[] = []
  const size = 500
  for (let offset = 0; ; offset += size) {
    const result = await buildQuery().range(offset, offset + size - 1)
    if (result.error) return { data: null, error: result.error }
    const page = result.data || []
    rows.push(...page)
    if (page.length < size) return { data: rows, error: null }
  }
}

export const ANALYSIS_SUBMISSION_CHUNK_SIZE = 100

/** Bound IN URLs as well as result pages; never expose a partial aggregate. */
export async function loadChunkedWrongAnalysis(submissionIds: string[], buildQuery: (ids: string[]) => any) {
  const rows: any[] = []
  const ids = [...new Set(submissionIds)]
  for (let offset = 0; offset < ids.length; offset += ANALYSIS_SUBMISSION_CHUNK_SIZE) {
    const chunk = ids.slice(offset, offset + ANALYSIS_SUBMISSION_CHUNK_SIZE)
    const result = await loadAllAnalysisRows(() => buildQuery(chunk))
    if (result.error) return { data: null, error: result.error }
    rows.push(...result.data!)
  }
  return { data: rows, error: null }
}

export function uniqueWrongAttempts(rows: any[]) {
  const seen = new Set<string>()
  return rows.filter(row => {
    const key = `${row.submission_id}:${row.question_id}`
    if (seen.has(key)) return false
    seen.add(key)
    return true
  })
}
