/**
 * Edge Function: student-progress
 * Endpoints:
 * - GET ?scope=attendance&classId=UUID[&fromDate=YYYY-MM-DD][&toDate=YYYY-MM-DD]
 * - GET ?scope=achievements
 * - GET ?scope=leaderboard&classId=UUID[&period=week|month]
 */
import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { requireAuth } from '../../shared/auth-middleware.ts'
import { handleCors, jsonResponse, errorResponse } from '../../shared/response-helper.ts'
import {
  getVnDateString,
  parseAttendanceQuery,
  parseLeaderboardQuery,
  processLeaderboardData,
} from './logic.ts'

serve(async (req: Request) => {
  const cors = handleCors(req)
  if (cors) return cors

  if (req.method !== 'GET') {
    return errorResponse('Method not allowed', 405)
  }

  let auth: Awaited<ReturnType<typeof requireAuth>>
  try {
    auth = await requireAuth(req)
  } catch {
    return errorResponse('Unauthorized', 401)
  }

  const { user, serviceRoleClient: client } = auth
  if (user.role !== 'STUDENT') {
    return errorResponse('Chỉ học sinh dùng được chức năng này.', 403)
  }

  const url = new URL(req.url)
  const scope = url.searchParams.get('scope')
  if (!scope || !['attendance', 'achievements', 'leaderboard'].includes(scope)) {
    return errorResponse('scope không hợp lệ.', 400)
  }

  const todayVn = getVnDateString()

  try {
    if (scope === 'attendance') {
      const parsed = parseAttendanceQuery(url.searchParams, user.classIds || [], todayVn)
      if (!parsed.ok) {
        return errorResponse(parsed.error, parsed.status)
      }

      const { classId, fromDate, toDate } = parsed.params
      const { data, error } = await client.rpc('fn_student_attendance', {
        p_student_id: user.id,
        p_class_id: classId,
        p_from: fromDate,
        p_to: toDate,
      })

      if (error) {
        console.error('[student-progress] attendance rpc error:', error.message)
        return errorResponse('Không tải được thông tin điểm danh. Vui lòng thử lại sau.', 500)
      }

      const res = jsonResponse(data)
      res.headers.set('Cache-Control', 'no-store')
      return res
    }

    if (scope === 'achievements') {
      const { data, error } = await client.rpc('fn_student_achievements', {
        p_student_id: user.id,
        p_today: todayVn,
      })

      if (error) {
        console.error('[student-progress] achievements rpc error:', error.message)
        return errorResponse('Không tải được thông tin thành tích. Vui lòng thử lại sau.', 500)
      }

      const res = jsonResponse(data)
      res.headers.set('Cache-Control', 'no-store')
      return res
    }

    if (scope === 'leaderboard') {
      const parsed = parseLeaderboardQuery(url.searchParams, user.classIds || [], todayVn)
      if (!parsed.ok) {
        return errorResponse(parsed.error, parsed.status)
      }

      const { classId, period, fromDate, toDate } = parsed.params
      const { data, error } = await client.rpc('fn_class_leaderboard', {
        p_class_id: classId,
        p_from: fromDate,
        p_to: toDate,
      })

      if (error) {
        console.error('[student-progress] leaderboard rpc error:', error.message)
        return errorResponse('Không tải được bảng xếp hạng. Vui lòng thử lại sau.', 500)
      }

      const result = processLeaderboardData(
        data,
        user.id,
        user.fullName,
        period,
        fromDate,
        toDate
      )
      const res = jsonResponse(result)
      res.headers.set('Cache-Control', 'no-store')
      return res
    }

    return errorResponse('scope không hợp lệ.', 400)
  } catch (err) {
    console.error('[student-progress] unexpected error:', (err as Error).message)
    return errorResponse('Không tải được thông tin tiến độ học tập. Vui lòng thử lại sau.', 500)
  }
})
