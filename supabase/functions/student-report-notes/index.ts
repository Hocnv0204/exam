import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { requireAuth } from '../../shared/auth-middleware.ts'
import { handleCors, jsonResponse, errorResponse } from '../../shared/response-helper.ts'
import { validateNotesPayload, buildDraftNotes, isValidCalendarDate } from './logic.ts'

const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

export function mapRowToCamelCase(row: any) {
  if (!row) return null
  return {
    id: row.id,
    studentId: row.student_id,
    classId: row.class_id,
    fromDate: row.from_date,
    toDate: row.to_date,
    summary: row.summary,
    strengths: row.strengths,
    improvements: row.improvements,
    attitude: row.attitude,
    goalText: row.goal_text,
    goalScore: row.goal_score !== null && row.goal_score !== undefined ? Number(row.goal_score) : null,
    teacherSupport: row.teacher_support,
    parentActions: row.parent_actions,
    updatedBy: row.updated_by,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  }
}

serve(async (req: Request) => {
  const corsRes = handleCors(req)
  if (corsRes) return corsRes

  // Chỉ chấp nhận GET và PUT
  if (req.method !== 'GET' && req.method !== 'PUT') {
    return errorResponse('Method Not Allowed', 405)
  }

  try {
    let authContext
    try {
      authContext = await requireAuth(req)
    } catch (authErr) {
      const msg = authErr instanceof Error ? authErr.message : String(authErr)
      const isForbidden = msg.toLowerCase().includes('forbidden')
      return errorResponse(msg, isForbidden ? 403 : 401)
    }

    const { user, serviceRoleClient } = authContext

    // Chỉ ADMIN mới được xem và cập nhật nhận xét giáo viên
    if (user.role !== 'ADMIN') {
      return errorResponse('Forbidden: Admin access required', 403)
    }

    // 1. GET: Lấy nhận xét đã lưu và bản nháp tự sinh
    if (req.method === 'GET') {
      const url = new URL(req.url)
      const studentId = url.searchParams.get('studentId')
      const classId = url.searchParams.get('classId')
      const fromDate = url.searchParams.get('fromDate')
      const toDate = url.searchParams.get('toDate')

      if (!studentId || !classId || !fromDate || !toDate) {
        return errorResponse('Thiếu thông số truy vấn (studentId, classId, fromDate, toDate)', 400)
      }

      if (!UUID_REGEX.test(studentId) || !UUID_REGEX.test(classId)) {
        return errorResponse('studentId hoặc classId không phải UUID hợp lệ', 400)
      }

      if (!isValidCalendarDate(fromDate) || !isValidCalendarDate(toDate)) {
        return errorResponse('fromDate hoặc toDate không đúng định dạng YYYY-MM-DD', 400)
      }

      if (fromDate > toDate) {
        return errorResponse('fromDate phải nhỏ hơn hoặc bằng toDate', 400)
      }

      // Truy vấn bản nhận xét đã lưu trong DB
      const { data: savedRow, error: savedErr } = await serviceRoleClient
        .from('student_report_notes')
        .select('*')
        .eq('student_id', studentId)
        .eq('class_id', classId)
        .eq('from_date', fromDate)
        .eq('to_date', toDate)
        .maybeSingle()

      if (savedErr) {
        console.error('[student-report-notes] select saved error:', savedErr)
        return errorResponse('Không tải được nhận xét báo cáo', 500)
      }

      // Gọi nội bộ student-history để lấy dữ liệu báo cáo sinh bản nháp
      let draft = null
      try {
        // @ts-ignore Deno env
        const supabaseUrl = (typeof Deno !== 'undefined' ? Deno.env.get('SUPABASE_URL') : '') || ''
        if (supabaseUrl) {
          const historyUrl = `${supabaseUrl}/functions/v1/student-history?scope=report&studentId=${encodeURIComponent(studentId)}&classId=${encodeURIComponent(classId)}&fromDate=${encodeURIComponent(fromDate)}&toDate=${encodeURIComponent(toDate)}`
          const historyRes = await fetch(historyUrl, {
            headers: {
              'Authorization': req.headers.get('Authorization') || '',
            },
          })
          if (historyRes.ok) {
            const historyJson = await historyRes.json()
            const reportData = historyJson?.data || historyJson
            draft = buildDraftNotes(reportData)
          } else {
            console.warn('[student-report-notes] student-history fetch status:', historyRes.status)
          }
        }
      } catch (fetchErr) {
        console.warn('[student-report-notes] fetch student-history error:', fetchErr)
      }

      return jsonResponse({
        saved: savedRow ? mapRowToCamelCase(savedRow) : null,
        draft,
      }, 200)
    }

    // 2. PUT: Validate payload, kiểm tra ghi danh lớp, upsert nhận xét
    if (req.method === 'PUT') {
      let body: unknown
      try {
        body = await req.json()
      } catch (_e) {
        return errorResponse('Dữ liệu yêu cầu không phải JSON hợp lệ', 400)
      }

      const validation = validateNotesPayload(body)
      if (!validation.ok) {
        return errorResponse(validation.error, 400)
      }
      const { value } = validation

      // Kiểm tra học sinh có ghi danh trong lớp (bảng student_classes, bất kỳ status)
      const { data: enrollment, error: enrollErr } = await serviceRoleClient
        .from('student_classes')
        .select('student_id')
        .eq('student_id', value.studentId)
        .eq('class_id', value.classId)
        .maybeSingle()

      if (enrollErr) {
        console.error('[student-report-notes] check student_classes error:', enrollErr)
        return errorResponse('Không thể kiểm tra thông tin ghi danh lớp học', 500)
      }

      if (!enrollment) {
        return errorResponse('Học sinh không ghi danh trong lớp học này', 400)
      }

      // Upsert vào bảng public.student_report_notes
      const now = new Date().toISOString()
      const { data: upsertedRow, error: upsertErr } = await serviceRoleClient
        .from('student_report_notes')
        .upsert(
          {
            student_id: value.studentId,
            class_id: value.classId,
            from_date: value.fromDate,
            to_date: value.toDate,
            summary: value.summary,
            strengths: value.strengths,
            improvements: value.improvements,
            attitude: value.attitude,
            goal_text: value.goalText,
            goal_score: value.goalScore,
            teacher_support: value.teacherSupport,
            parent_actions: value.parentActions,
            updated_by: user.id,
            updated_at: now,
          },
          { onConflict: 'student_id,class_id,from_date,to_date' }
        )
        .select('*')
        .single()

      if (upsertErr) {
        console.error('[student-report-notes] upsert error:', upsertErr)
        return errorResponse('Không thể lưu nhận xét báo cáo', 500)
      }

      return jsonResponse(mapRowToCamelCase(upsertedRow), 200)
    }

    return errorResponse('Method Not Allowed', 405)
  } catch (err) {
    console.error('[student-report-notes] internal error:', err)
    return errorResponse('Đã xảy ra lỗi máy chủ nội bộ', 500)
  }
})
