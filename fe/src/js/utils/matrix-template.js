// Local-only, allowlisted matrix configuration. No assignment/question data.
export const MATRIX_TEMPLATE_LIMITS = { count: 20, bytes: 65536, storageBytes: 524288, questions: 500, paths: 500 }
const parts = ['mc', 'tf', 'sa']
const diffs = ['nb', 'th', 'vd', 'vdc']
const fail = message => { throw new Error(message) }
const object = value => value && typeof value === 'object' && !Array.isArray(value)
const id = value => typeof value === 'string' && /^[A-Za-z0-9_-]{1,128}$/.test(value)
const size = value => new TextEncoder().encode(value).length
const count = value => Number.isInteger(value) && value >= 0 && value <= MATRIX_TEMPLATE_LIMITS.questions

export function sanitizeMatrixTemplate(value) {
  if (!object(value) || value.version !== 1) fail('Phiên bản mẫu không được hỗ trợ.')
  if (typeof value.name !== 'string' || !value.name.trim() || value.name.trim().length > 80 || /[\u0000-\u001f]/.test(value.name)) fail('Tên mẫu phải có 1–80 ký tự.')
  const s = value.scope
  if (!object(s) || typeof s.gradeBlock !== 'string' || !s.gradeBlock.trim() || s.gradeBlock.length > 100 || s.scopeType !== 'MULTI') fail('Phạm vi mẫu không hợp lệ.')
  const scope = { scopeType: 'MULTI', gradeBlock: s.gradeBlock }
  for (const key of ['classIds', 'chapterIds', 'lessonIds', 'typeIds']) {
    if (!Array.isArray(s[key]) || s[key].length > 500 || !s[key].every(id)) fail('ID danh mục không hợp lệ.')
    scope[key] = [...new Set(s[key])]
  }
  if (!Array.isArray(s.paths) || !s.paths.length || s.paths.length > MATRIX_TEMPLATE_LIMITS.paths) fail('Mẫu phải có phạm vi nguồn cụ thể (tối đa 500 mục).')
  scope.paths = s.paths.map(p => {
    if (!object(p) || !id(p.classId) || !id(p.chapterId) || !id(p.lessonId) || (p.typeId !== null && !id(p.typeId))) fail('Đường dẫn danh mục không hợp lệ.')
    if (p.typeId ? !scope.typeIds.includes(p.typeId) : !scope.lessonIds.includes(p.lessonId)) fail('Đường dẫn không thuộc phạm vi đã chọn.')
    return { classId: p.classId, chapterId: p.chapterId, lessonId: p.lessonId, typeId: p.typeId }
  })
  if (scope.typeIds.some(t => !scope.paths.some(p => p.typeId === t))) fail('Thiếu đường dẫn Dạng bài.')
  for (const [key, field] of [['classIds', 'classId'], ['chapterIds', 'chapterId'], ['lessonIds', 'lessonId']]) {
    if (scope[key].some(value => !scope.paths.some(p => p[field] === value))) fail('Thiếu đường dẫn cho phạm vi đã chọn.')
  }
  if (!object(value.options) || !['advanced', 'borrow', 'balanced'].every(k => typeof value.options[k] === 'boolean')) fail('Tùy chọn mẫu không hợp lệ.')
  const options = Object.fromEntries(['advanced', 'borrow', 'balanced'].map(k => [k, value.options[k]]))
  const matrix = {}
  for (const part of parts) {
    const m = value.matrix?.[part]
    if (!object(m) || !count(m.total) || !object(m.distribution) || !diffs.every(d => count(m.distribution[d]))) fail('Số câu phải là số nguyên từ 0 đến 500.')
    const distribution = Object.fromEntries(diffs.map(d => [d, m.distribution[d]]))
    if (options.advanced && Object.values(distribution).reduce((a, b) => a + b, 0) !== m.total) fail('Phân bổ mức độ phải khớp tổng số câu.')
    matrix[part] = { total: m.total, distribution }
  }
  const total = parts.reduce((n, p) => n + matrix[p].total, 0)
  if (total < 1 || total > 500) fail('Tổng số câu phải từ 1 đến 500.')
  const result = { version: 1, name: value.name.trim(), scope, matrix, options }
  if (size(JSON.stringify(result)) > MATRIX_TEMPLATE_LIMITS.bytes) fail('Mẫu vượt giới hạn 64 KB.')
  return result
}

export function parseMatrixTemplate(text) {
  if (typeof text !== 'string' || size(text) > MATRIX_TEMPLATE_LIMITS.bytes) fail('Tệp JSON vượt giới hạn 64 KB.')
  let value
  try { value = JSON.parse(text) } catch { fail('JSON không hợp lệ.') }
  return sanitizeMatrixTemplate(value)
}

export function matrixScopePaths(scope, tree) {
  const paths = []
  for (const lesson of tree.lessons || []) {
    const chapter = (tree.chapters || []).find(c => c.id === lesson.chapter_id)
    const types = (tree.questionTypes || []).filter(t => t.lesson_id === lesson.id)
    if (!chapter) continue
    for (const type of types.filter(t => scope.typeIds.includes(t.id))) paths.push({ classId: chapter.class_id, chapterId: chapter.id, lessonId: lesson.id, typeId: type.id })
    if (!types.length && scope.lessonIds.includes(lesson.id)) paths.push({ classId: chapter.class_id, chapterId: chapter.id, lessonId: lesson.id, typeId: null })
  }
  return paths
}

export function reconcileMatrixTemplate(value, tree) {
  const template = sanitizeMatrixTemplate(value)
  const s = template.scope
  const classes = tree.classes || []
  if (s.gradeBlock !== 'ALL' && !classes.some(c => (c.grade_block || c.gradeBlock) === s.gradeBlock)) fail('Khối học của mẫu không còn khả dụng.')
  const validClass = classId => classes.some(c => c.id === classId && (s.gradeBlock === 'ALL' || (c.grade_block || c.gradeBlock) === s.gradeBlock))
  for (const classId of s.classIds) if (!validClass(classId)) fail(`Lớp bị thiếu hoặc ngoài phạm vi: ${classId}`)
  for (const chapterId of s.chapterIds) if (!(tree.chapters || []).some(c => c.id === chapterId && validClass(c.class_id))) fail(`Chương bị thiếu hoặc ngoài phạm vi: ${chapterId}`)
  for (const lessonId of s.lessonIds) if (!(tree.lessons || []).some(l => l.id === lessonId && (tree.chapters || []).some(c => c.id === l.chapter_id && validClass(c.class_id)))) fail(`Bài bị thiếu hoặc ngoài phạm vi: ${lessonId}`)
  for (const p of s.paths) {
    const chapter = (tree.chapters || []).find(c => c.id === p.chapterId)
    const lesson = (tree.lessons || []).find(l => l.id === p.lessonId)
    const types = (tree.questionTypes || []).filter(t => t.lesson_id === p.lessonId)
    if (!validClass(p.classId) || chapter?.class_id !== p.classId || lesson?.chapter_id !== p.chapterId || (p.typeId ? !types.some(t => t.id === p.typeId) : types.length > 0)) fail(`Danh mục đã đổi, bị thiếu hoặc ngoài phạm vi: ${p.typeId || p.lessonId}. Mẫu chưa được áp dụng.`)
  }
  // Parent checkboxes are derived anew, never expand a saved parent to new leaves.
  return template
}

export function matrixTemplateStore(storage, adminId) {
  if (!id(adminId)) fail('Không xác định được tài khoản admin.')
  const key = `edu:matrix-templates:v1:${adminId}`
  const read = () => {
    let raw
    try { raw = storage.getItem(key) } catch { fail('Không thể đọc bộ nhớ trình duyệt.') }
    if (!raw) return []
    if (size(raw) > MATRIX_TEMPLATE_LIMITS.storageBytes) fail('Kho mẫu vượt giới hạn dung lượng.')
    let data
    try { data = JSON.parse(raw) } catch { fail('Kho mẫu bị lỗi JSON; không ghi đè dữ liệu.') }
    if (!Array.isArray(data) || data.length > MATRIX_TEMPLATE_LIMITS.count) fail('Kho mẫu không hợp lệ.')
    return data.map(sanitizeMatrixTemplate)
  }
  const write = data => {
    const raw = JSON.stringify(data)
    if (size(raw) > MATRIX_TEMPLATE_LIMITS.storageBytes) fail('Kho mẫu vượt giới hạn 512 KB.')
    try { storage.setItem(key, raw) } catch { fail('Không lưu được mẫu: bộ nhớ bị chặn hoặc đã đầy.') }
  }
  return {
    read,
    save(value) {
      const template = sanitizeMatrixTemplate(value)
      const data = read()
      if (data.some(t => t.name.toLocaleLowerCase('vi') === template.name.toLocaleLowerCase('vi'))) fail('Tên mẫu đã tồn tại. Hãy chọn tên khác hoặc xóa mẫu cũ.')
      if (data.length >= MATRIX_TEMPLATE_LIMITS.count) fail('Chỉ được lưu tối đa 20 mẫu.')
      write([...data, template])
    },
    remove(name) { write(read().filter(t => t.name !== name)) }
  }
}
