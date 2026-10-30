// Testable transport handler. All reads/writes are scoped here before service-role access.
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
const COLUMNS = 'id,submission_id,submission_answer_id,student_id,class_id,homework_title,question_number,part_title,message,status,response,version,created_at,updated_at,answered_at,closed_at'
const ADMIN_COLUMNS = `${COLUMNS},student:profiles!question_appeals_student_id_fkey(full_name,username),class:classes!question_appeals_class_id_fkey(name)`
const validId = value => typeof value === 'string' && UUID.test(value)
const validText = (value, max) => typeof value === 'string' && value.trim().length > 0 && value.trim().length <= max
const one = value => Array.isArray(value) ? value[0] : value

export function appealDto(row, admin = false) {
  const dto = {
    id: row.id, submissionId: row.submission_id, submissionAnswerId: row.submission_answer_id,
    homeworkTitle: row.homework_title, questionNumber: row.question_number, partTitle: row.part_title,
    message: row.message, status: row.status, response: row.response,
    version: row.version, createdAt: row.created_at, updatedAt: row.updated_at,
    answeredAt: row.answered_at, closedAt: row.closed_at,
  }
  if (admin) Object.assign(dto, {
    studentId: row.student_id, studentName: one(row.student)?.full_name || one(row.student)?.username || '',
    classId: row.class_id, className: one(row.class)?.name || '',
  })
  return dto
}

export function createQuestionAppealsHandler({ requireAuth, handleCors, jsonResponse, errorResponse }) {
  return async req => {
    const cors = handleCors(req)
    if (cors) return cors
    if (!['GET', 'POST', 'PATCH'].includes(req.method)) return errorResponse('Phương thức không được hỗ trợ.', 405)
    let auth
    try { auth = await requireAuth(req) } catch (error) {
      const message = String(error?.message || '')
      if (message.includes('Account locked')) return errorResponse('Tài khoản đã bị khóa.', 403)
      return errorResponse('Vui lòng đăng nhập lại.', 401)
    }
    const { user, serviceRoleClient: db } = auth
    const admin = user.role === 'ADMIN'
    if (!admin && user.role !== 'STUDENT') return errorResponse('Không có quyền truy cập.', 403)
    const dbError = error => {
      if (error?.code === '23505') return errorResponse('Bạn đã gửi yêu cầu cho câu này. Hãy tải lại để xem.', 409)
      if (error?.code === '23514' || error?.code === '23503') return errorResponse('Bài nộp hoặc yêu cầu đã thay đổi. Hãy tải lại.', 409)
      return errorResponse('Không thể xử lý yêu cầu lúc này. Vui lòng thử tải lại.', 500)
    }
    try {
      const url = new URL(req.url)
      // Never disclose whether another student's submission exists.
      const ownSubmission = async id => db.from('submissions').select('id')
        .eq('id', id).eq('student_id', user.id).eq('status', 'SUBMITTED').eq('is_trial', false).maybeSingle()
      if (req.method === 'GET') {
        const submissionId = url.searchParams.get('submissionId')
        const studentId = url.searchParams.get('studentId')
        const classId = url.searchParams.get('classId')
        const status = url.searchParams.get('status')
        for (const value of [submissionId, studentId, classId]) {
          if (value !== null && !validId(value)) return errorResponse('Mã lọc không hợp lệ.', 400)
        }
        if (status !== null && !['OPEN', 'ANSWERED', 'CLOSED'].includes(status)) return errorResponse('Trạng thái không hợp lệ.', 400)
        if (!admin) {
          if (!validId(submissionId)) return errorResponse('Cần mã bài nộp.', 400)
          if (studentId || classId) return errorResponse('Không có quyền dùng bộ lọc này.', 403)
          const { data, error } = await ownSubmission(submissionId)
          if (error) return dbError(error)
          if (!data) return errorResponse('Không tìm thấy bài đã nộp.', 404)
        }
        const page = Number(url.searchParams.get('page') || 1)
        const pageSize = Number(url.searchParams.get('pageSize') || 20)
        if (!Number.isInteger(page) || page < 1 || page > 10000 || !Number.isInteger(pageSize) || pageSize < 1 || pageSize > 100) {
          return errorResponse('Phân trang không hợp lệ.', 400)
        }
        let query = db.from('question_appeals').select(admin ? ADMIN_COLUMNS : COLUMNS, { count: 'exact' })
        if (!admin) query = query.eq('student_id', user.id)
        if (submissionId) query = query.eq('submission_id', submissionId)
        if (admin && studentId) query = query.eq('student_id', studentId)
        if (admin && classId) query = query.eq('class_id', classId)
        if (status) query = query.eq('status', status)
        const { data, error, count } = await query.order('created_at', { ascending: false }).order('id', { ascending: false })
          .range((page - 1) * pageSize, page * pageSize - 1)
        if (error) return dbError(error)
        return jsonResponse({ items: (data || []).map(row => appealDto(row, admin)), page, pageSize, total: count || 0 })
      }
      // Bound request before JSON parse (messages never need a large request body).
      const raw = await req.text()
      if (raw.length > 12000) return errorResponse('Nội dung quá dài.', 413)
      let body
      try { body = JSON.parse(raw) } catch { return errorResponse('Dữ liệu không hợp lệ.', 400) }
      if (!body || typeof body !== 'object' || Array.isArray(body)) return errorResponse('Dữ liệu không hợp lệ.', 400)
      const action = body.action || url.searchParams.get('action') || (req.method === 'POST' ? 'create' : 'reply')
      if (action === 'create') {
        if (req.method !== 'POST') return errorResponse('Dùng POST để gửi câu hỏi.', 405)
        if (user.role !== 'STUDENT') return errorResponse('Chỉ học sinh được gửi câu hỏi.', 403)
        const { submissionId, submissionAnswerId, message } = body
        if (!validId(submissionId) || !validId(submissionAnswerId) || !validText(message, 1000)) {
          return errorResponse('Chọn câu đã nộp và nhập nội dung từ 1–1000 ký tự.', 400)
        }
        const { data: submission, error: subError } = await ownSubmission(submissionId)
        if (subError) return dbError(subError)
        if (!submission) return errorResponse('Không tìm thấy bài đã nộp.', 404)
        const { data: answer, error: answerError } = await db.from('submission_answers').select('id')
          .eq('id', submissionAnswerId).eq('submission_id', submissionId).maybeSingle()
        if (answerError) return dbError(answerError)
        if (!answer) return errorResponse('Không tìm thấy câu trong bài nộp.', 404)
        // UNIQUE constraint handles both duplicate clicks and concurrent clients.
        const { data, error } = await db.from('question_appeals').insert({
          submission_id: submissionId, submission_answer_id: submissionAnswerId, student_id: user.id, message: message.trim(),
        }).select(COLUMNS).single()
        if (error || !data) return dbError(error)
        return jsonResponse(appealDto(data), 201)
      }
      if (!['reply', 'close'].includes(action)) return errorResponse('Thao tác không hợp lệ.', 400)
      if (!admin) return errorResponse('Chỉ quản trị viên được phản hồi hoặc đóng yêu cầu.', 403)
      const { appealId, version, response } = body
      if (!validId(appealId) || !Number.isInteger(version) || version < 1 || version > 2147483646) {
        return errorResponse('Mã yêu cầu hoặc phiên bản không hợp lệ.', 400)
      }
      if (action === 'reply' && !validText(response, 2000)) return errorResponse('Phản hồi cần từ 1–2000 ký tự.', 400)
      const patch = action === 'reply'
        ? { status: 'ANSWERED', response: response.trim(), replied_by: user.id }
        : { status: 'CLOSED', closed_by: user.id }
      const { data, error } = await db.from('question_appeals').update(patch).eq('id', appealId)
        .eq('version', version).eq('status', action === 'reply' ? 'OPEN' : 'ANSWERED')
        .select(ADMIN_COLUMNS).maybeSingle()
      if (error) return dbError(error)
      if (!data) return errorResponse('Yêu cầu đã thay đổi hoặc không còn khả dụng. Hãy tải lại.', 409)
      return jsonResponse(appealDto(data, true))
    } catch {
      return errorResponse('Không thể xử lý yêu cầu lúc này. Vui lòng thử tải lại.', 500)
    }
  }
}
