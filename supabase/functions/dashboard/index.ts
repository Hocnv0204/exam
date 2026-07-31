import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { requireAdmin } from '../../shared/auth-middleware.ts'
import { handleCors, jsonResponse, errorResponse } from '../../shared/response-helper.ts'

serve(async (req: Request) => {
  const corsRes = handleCors(req)
  if (corsRes) return corsRes

  try {
    if (req.method !== 'GET') {
      return errorResponse('Method not allowed', 405)
    }

    const { serviceRoleClient } = await requireAdmin(req)

    // 1. Total Students Count
    const { count: studentCount, error: sErr } = await serviceRoleClient
      .from('profiles')
      .select('*', { count: 'exact', head: true })
      .eq('role', 'STUDENT')

    if (sErr) return errorResponse(sErr.message, 500)

    // 2. Total Classes Count
    const { count: classCount, error: cErr } = await serviceRoleClient
      .from('classes')
      .select('*', { count: 'exact', head: true })

    if (cErr) return errorResponse(cErr.message, 500)

    // 3. Total Homeworks Count
    const { count: homeworkCount, error: hErr } = await serviceRoleClient
      .from('homeworks')
      .select('*', { count: 'exact', head: true })

    if (hErr) return errorResponse(hErr.message, 500)

    // 4. Total Submissions Count & Average Score Calculation
    const { data: submissions, count: subCount, error: subErr } = await serviceRoleClient
      .from('submissions')
      .select('id, total_score, submitted_at, homework_id, student_id')

    if (subErr) return errorResponse(subErr.message, 500)

    let averageScore = 0
    if (submissions && submissions.length > 0) {
      const sum = submissions.reduce((acc, curr) => acc + Number(curr.total_score), 0)
      averageScore = Number((sum / submissions.length).toFixed(2))
    }

    // 5. Recent Submissions List (Top 10)
    const { data: recentSubmissionsRaw, error: recErr } = await serviceRoleClient
      .from('submissions')
      .select(`
        id,
        total_score,
        max_score,
        submitted_at,
        profiles (username, full_name),
        homeworks (title)
      `)
      .order('submitted_at', { ascending: false })
      .limit(10)

    if (recErr) return errorResponse(recErr.message, 500)

    const recentSubmissions = recentSubmissionsRaw.map((sub) => ({
      submissionId: sub.id,
      studentName: (sub.profiles as unknown as { full_name: string })?.full_name || 'Unknown',
      username: (sub.profiles as unknown as { username: string })?.username || 'Unknown',
      homeworkTitle: (sub.homeworks as unknown as { title: string })?.title || 'Unknown',
      score: sub.total_score,
      maxScore: sub.max_score,
      submittedAt: sub.submitted_at,
    }))

    return jsonResponse({
      overview: {
        totalStudents: studentCount || 0,
        totalClasses: classCount || 0,
        totalHomeworks: homeworkCount || 0,
        totalSubmissions: subCount || 0,
        averageScore,
      },
      recentSubmissions,
    })
  } catch (err: unknown) {
    const error = err as Error
    return errorResponse(error.message || 'Unauthorized / Error', 401)
  }
})
