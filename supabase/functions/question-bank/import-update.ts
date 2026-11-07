/**
 * Xử lý nhập Markdown vào Ngân hàng câu hỏi.
 * Tách riêng khỏi index.ts để test được bằng adapter giả, không cần DB thật.
 */
// Nhập Markdown: tạo mới câu chưa có, và (chỉ khi mode = 'UPDATE') ghi đè ĐÁP ÁN
// + LỜI GIẢI của câu đã có. content_hash KHÔNG gồm đáp án, nên câu sửa đáp án vẫn
// trùng hash — đó là lý do phải có chế độ cập nhật thay vì chỉ bỏ qua.
// Phạm vi đối chiếu: (qb_lesson_id, hash) theo uq_qb_constant_lesson_hash, hoặc
// (grade_block, hash) với qb_lesson_id NULL theo uq_qb_dynamic_block_hash.
export const processImportRows = async (rows: any[], sourceQuestions: any[], mode: string, client: any, hashContent: any) => {
  const result: { importedCount: number, updatedCount: number, skippedCount: number, skippedRows: any[], failedRows: any[] } =
    { importedCount: 0, updatedCount: 0, skippedCount: 0, skippedRows: [], failedRows: [] }
  const dedupKey = (lessonId: any, gradeBlock: any, hash: any) =>
    lessonId ? `lesson:${lessonId}|${hash}` : `block:${gradeBlock || ''}|${hash}`
  const numberOf = (index: number) => (sourceQuestions?.[index]?.questionNumber) || index + 1
  const fail = (index: number, reason: string) => result.failedRows.push({ questionNumber: numberOf(index), reason })
  const skip = (index: number, reason: string) => {
    result.skippedCount++
    result.skippedRows.push({ questionNumber: numberOf(index), reason })
  }

  // Đáp án phải hợp lệ trước khi ghi: không biến đáp án thiếu thành A/false ngầm.
  const keyProblem = (row: any): string => {
    if (row.question_type === 'MULTIPLE_CHOICE') {
      const answer = typeof row.mc_answer === 'string' ? row.mc_answer.trim().toUpperCase() : ''
      const options = Array.isArray(row.prompt?.options) ? row.prompt.options : []
      if (!/^[A-D]$/.test(answer)) return 'Thiếu đáp án đúng: hãy đánh dấu * trước phương án đúng (A-D).'
      if (!options.some((o: any) => String(o?.id || o?.key || '').trim().toUpperCase() === answer)) {
        return `Đáp án "${answer}" không có trong các phương án của câu.`
      }
      row.mc_answer = answer
      return ''
    }
    if (row.question_type === 'TRUE_FALSE') {
      const tf = row.tf_answers
      if (!tf || typeof tf !== 'object' || !['a', 'b', 'c', 'd'].every(k => typeof tf[k] === 'boolean')) {
        return 'Thiếu đáp án Đúng/Sai đủ 4 ý a, b, c, d.'
      }
      return ''
    }
    if (row.question_type === 'SHORT_ANSWER') {
      if (row.sa_answer === null || row.sa_answer === undefined || !String(row.sa_answer).trim()) {
        return 'Thiếu [Đáp án: ...] cho câu trả lời ngắn.'
      }
      const tolerance = Number(row.sa_tolerance)
      if (!Number.isFinite(tolerance) || tolerance < 0) return 'Dung sai phải là số không âm.'
      row.sa_tolerance = tolerance
      return ''
    }
    return ''
  }

  // 1. Hash + loại trùng ngay trong file + kiểm tra đáp án.
  const candidates: Array<{ row: any, index: number, key: string }> = []
  const seenInFile = new Set<string>()
  const hashes: string[] = []
  for (let index = 0; index < rows.length; index++) {
    const row = rows[index]
    try {
      row.content_hash = await hashContent(row.question_type, row.prompt)
    } catch (error: any) {
      fail(index, `Không tính được mã nội dung: ${error?.message || String(error)}`)
      continue
    }
    const key = dedupKey(row.qb_lesson_id, row.grade_block, row.content_hash)
    if (seenInFile.has(key)) { skip(index, 'Trùng nội dung với câu trước đó trong file nhập (cùng bài học/khối).'); continue }
    const problem = keyProblem(row)
    if (problem) { fail(index, problem); continue }
    seenInFile.add(key)
    candidates.push({ row, index, key })
    if (!hashes.includes(row.content_hash)) hashes.push(row.content_hash)
  }
  if (candidates.length === 0) return result

  // 2. Tra cứu theo lô (không mỗi câu một query) để biết câu nào đã có.
  const existingByKey = new Map<string, any[]>()
  // Mỗi hash SHA-256 dài 64 ký tự: 500 hash tạo URL PostgREST hàng chục KB,
  // có thể bị proxy từ chối/đứt HTTP/2 trước khi DB nhận được request.
  const CHUNK = 40
  const lessonIds = Array.from(new Set(candidates.map(c => c.row.qb_lesson_id).filter(Boolean)))
  const blocks = Array.from(new Set(candidates.map(c => c.row.grade_block).filter(Boolean)))
  for (let i = 0; i < hashes.length; i += CHUNK) {
    const chunk = hashes.slice(i, i + CHUNK)
    let query = client.from('question_bank').select('id, qb_lesson_id, grade_block, content_hash, prompt')
    if (lessonIds.length > 0 && !candidates.some(c => !c.row.qb_lesson_id)) {
      query = lessonIds.length === 1 ? query.eq('qb_lesson_id', lessonIds[0]) : query.in('qb_lesson_id', lessonIds)
    } else if (lessonIds.length === 0 && blocks.length === 1) {
      query = query.eq('grade_block', blocks[0])
    } else if (lessonIds.length === 0 && blocks.length > 1) {
      query = query.in('grade_block', blocks)
    }
    const { data: matched, error } = await query.in('content_hash', chunk)
    if (error) throw error
    for (const found of matched || []) {
      if (!found?.content_hash) continue
      const key = dedupKey(found.qb_lesson_id, found.grade_block, found.content_hash)
      const list = existingByKey.get(key) || []
      list.push(found)
      existingByKey.set(key, list)
    }
  }

  // 3. Câu đã có: bỏ qua, hoặc cập nhật đáp án + lời giải (giữ nguyên phần còn lại).
  const toInsert: Array<{ row: any, index: number }> = []
  for (const candidate of candidates) {
    const existingRows = existingByKey.get(candidate.key) || []
    if (existingRows.length === 0) { toInsert.push(candidate); continue }
    if (mode !== 'UPDATE') { skip(candidate.index, 'Câu hỏi đã có trong Ngân hàng (cùng bài học/khối và nội dung); chế độ Bỏ qua trùng.'); continue }

    const row = candidate.row
    let updatedAny = false
    let failure = ''
    for (const existing of existingRows) {
      const basePrompt = existing.prompt && typeof existing.prompt === 'object' && !Array.isArray(existing.prompt)
        ? existing.prompt
        : null
      if (!basePrompt) { failure = 'Dữ liệu đề bài hiện có không đọc được, không cập nhật để tránh làm hỏng câu.'; break }
      // Markdown không có [Lời giải] thì GIỮ lời giải cũ, không xoá trắng.
      const nextExplanation = String(row.prompt?.explanation || '').trim()
      const patch: any = {
        prompt: nextExplanation ? { ...basePrompt, explanation: row.prompt.explanation } : basePrompt,
      }
      if (row.question_type === 'MULTIPLE_CHOICE') patch.mc_answer = row.mc_answer
      else if (row.question_type === 'TRUE_FALSE') patch.tf_answers = row.tf_answers
      else if (row.question_type === 'SHORT_ANSWER') { patch.sa_answer = row.sa_answer; patch.sa_tolerance = row.sa_tolerance }
      const { data, error } = await client.from('question_bank').update(patch)
        .eq('id', existing.id).eq('content_hash', row.content_hash).select('id').maybeSingle()
      if (error) { failure = error.message || String(error); break }
      if (!data) { failure = 'Câu hỏi đã thay đổi hoặc không còn tồn tại.'; break }
      updatedAny = true
    }
    if (failure) fail(candidate.index, failure)
    else if (updatedAny) result.updatedCount++
  }

  // 4. Câu mới: ghi theo lô, lỗi trùng do race -> tính là bỏ qua.
  if (toInsert.length > 0) {
    const { data: inserted, error } = await client.from('question_bank')
      .insert(toInsert.map(item => item.row)).select('id')
    if (!error) {
      result.importedCount += Array.isArray(inserted) ? inserted.length : toInsert.length
    } else {
      for (const item of toInsert) {
        const { data, error: rowError } = await client.from('question_bank').insert(item.row).select('id').maybeSingle()
        if (!rowError && data) { result.importedCount++; continue }
        const message = rowError?.message || 'Không xác nhận được câu hỏi đã tạo.'
        if (rowError?.code === '23505' || /duplicate key|unique constraint/i.test(message)) skip(item.index, 'Câu hỏi đã được thêm bởi thao tác khác trong lúc nhập (trùng ràng buộc dữ liệu).')
        else fail(item.index, message)
      }
    }
  }

  return result
}
