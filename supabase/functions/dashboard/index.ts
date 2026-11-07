import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { requireAdmin } from '../../shared/auth-middleware.ts'
import { handleCors, jsonResponse, errorResponse } from '../../shared/response-helper.ts'
import { fetchAllRows, isFetchAllRowsError } from '../../shared/fetch-all-rows.ts'
import { calcDashboardSubmissions, mergeDashboard } from './dashboard-calc.ts'

serve(async (req: Request) => {
  const corsRes = handleCors(req)
  if (corsRes) return corsRes

  try {
    if (req.method !== 'GET') {
      return errorResponse('Method not allowed', 405)
    }

    const { serviceRoleClient } = await requireAdmin(req)

    // Chỉ dữ liệu bài nộp còn tính bằng JS; toàn bộ tổng hợp học phí/buổi học chạy trong RPC.
    const [
      financialRes,
      homeworkCountRes,
      submissions,
      submissionCountRes,
      recentSubmissionsRes
    ] = await Promise.all([
      serviceRoleClient.rpc('fn_get_dashboard_financial_stats'),
      serviceRoleClient.from('homeworks').select('*', { count: 'exact', head: true }),
      fetchAllRows(
        () => serviceRoleClient
          .from('submissions')
          .select('id, total_score, max_score, student_id, homework_id, is_late, submitted_at')
          .order('submitted_at', { ascending: false })
          .order('id', { ascending: false }),
        { limit: 2000 }
      ),
      serviceRoleClient.from('submissions').select('*', { count: 'exact', head: true }),
      serviceRoleClient
        .from('submissions')
        .select(`
          id,
          total_score,
          max_score,
          correct_count,
          wrong_count,
          is_late,
          submitted_at,
          profiles (username, full_name),
          homeworks (title, deadline)
        `)
        .order('submitted_at', { ascending: false })
        .limit(10)
    ])

    if (financialRes.error) return errorResponse(financialRes.error.message, 500)
    if (homeworkCountRes.error) return errorResponse(homeworkCountRes.error.message, 500)
    if (submissionCountRes.error) return errorResponse(submissionCountRes.error.message, 500)
    if (recentSubmissionsRes.error) return errorResponse(recentSubmissionsRes.error.message, 500)

    const financialStats = financialRes.data
    // PostgreSQL collation is not guaranteed to match JS localeCompare('vi').
    // Reapply the old tie-break over the already aggregated rows.
    financialStats.studentAttendanceStats = [...(financialStats.studentAttendanceStats || [])]
      .sort((a: any, b: any) => {
        if (b.total.unpaidTuitionFee !== a.total.unpaidTuitionFee) {
          return b.total.unpaidTuitionFee - a.total.unpaidTuitionFee
        }
        if (b.total.attendedSessions !== a.total.attendedSessions) {
          return b.total.attendedSessions - a.total.attendedSessions
        }
        return String(a.fullName || '').localeCompare(String(b.fullName || ''), 'vi')
      })

    const submissionStats = calcDashboardSubmissions({
      submissions,
      totalSubmissionsCount: submissionCountRes.count,
      recentSubmissionsRaw: recentSubmissionsRes.data || []
    })

    return jsonResponse(mergeDashboard(
      financialStats,
      submissionStats,
      homeworkCountRes.count || 0
    ))
  } catch (err: unknown) {
    const error = err as Error
    // Lỗi đọc DB/RPC là lỗi máy chủ — không trả 401 khiến FE đăng xuất người dùng.
    return errorResponse(error.message || 'Unauthorized / Error', isFetchAllRowsError(err) ? 500 : 401)
  }
})
