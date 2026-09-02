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

    // 4. Fetch class_sessions and student_sessions to calculate total taught sessions & monthly breakdown according to unique (class_id, session_date) rule
    const { data: classSessionsData, error: csErr } = await serviceRoleClient
      .from('class_sessions')
      .select('class_id, session_date')

    if (csErr) return errorResponse(csErr.message, 500)

    const { data: classTuitions, error: ctErr } = await serviceRoleClient
      .from('classes')
      .select('id, tuition_fee')
    if (ctErr) return errorResponse(ctErr.message, 500)
    
    const { data: studentSessions, error: ssErr } = await serviceRoleClient
      .from('student_sessions')
      .select('class_id, session_date, is_paid')
    if (ssErr) return errorResponse(ssErr.message, 500)

    // Set of unique "class_id|session_date" strings across all classes
    const uniqueClassSessionsSet = new Set<string>()

    // Map month string (YYYY-MM) -> Set of "class_id|session_date"
    const monthlySessionsSetMap = new Map<string, Set<string>>()

    // Map month string (YYYY-MM) -> monthly aggregate
    const monthMap = new Map<string, { month: string; label: string; sessionCount: number; tuitionFee: number; paidTuitionFee: number; studentSessionCount: number }>()

    const getOrInitMonth = (monthKey: string) => {
      if (!monthMap.has(monthKey)) {
        const [year, m] = monthKey.split('-')
        const label = `Tháng ${m}/${year}`
        monthMap.set(monthKey, {
          month: monthKey,
          label,
          sessionCount: 0,
          tuitionFee: 0,
          paidTuitionFee: 0,
          studentSessionCount: 0
        })
      }
      return monthMap.get(monthKey)!
    }

    const addClassSessionDate = (classId: string, sessionDate: string) => {
      if (!classId || !sessionDate) return
      const key = `${classId}|${sessionDate}`
      uniqueClassSessionsSet.add(key)

      const monthKey = sessionDate.substring(0, 7)
      getOrInitMonth(monthKey)
      if (!monthlySessionsSetMap.has(monthKey)) {
        monthlySessionsSetMap.set(monthKey, new Set<string>())
      }
      monthlySessionsSetMap.get(monthKey)!.add(key)
    }

    if (classSessionsData) {
      classSessionsData.forEach(cs => {
        if (cs.class_id && cs.session_date) {
          addClassSessionDate(cs.class_id, cs.session_date)
        }
      })
    }

    if (studentSessions) {
      studentSessions.forEach(ss => {
        if (ss.class_id && ss.session_date) {
          addClassSessionDate(ss.class_id, ss.session_date)
        }
      })
    }

    const totalTaughtSessions = uniqueClassSessionsSet.size

    // Calculate tuition fees from student_sessions
    const tuitionMap = new Map((classTuitions || []).map(c => [c.id, Number(c.tuition_fee || 0)]))
    let totalTuitionFee = 0
    let totalPaidTuitionFee = 0

    if (studentSessions) {
      studentSessions.forEach(session => {
        const fee = tuitionMap.get(session.class_id) || 0
        totalTuitionFee += fee
        const isPaid = session.is_paid === true || session.is_paid === 'true' || session.is_paid === 1
        if (isPaid) {
          totalPaidTuitionFee += fee
        }

        if (session.session_date) {
          const monthKey = session.session_date.substring(0, 7)
          const item = getOrInitMonth(monthKey)
          item.tuitionFee += fee
          item.studentSessionCount++
          if (isPaid) {
            item.paidTuitionFee += fee
          }
        }
      })
    }

    // Set sessionCount for each month based on unique (class_id, session_date) per month
    monthMap.forEach((item, monthKey) => {
      const monthSessionsSet = monthlySessionsSetMap.get(monthKey)
      item.sessionCount = monthSessionsSet ? monthSessionsSet.size : 0
    })

    const totalUnpaidTuitionFee = totalTuitionFee - totalPaidTuitionFee

    // Sort monthly stats chronologically and compute unpaidTuitionFee per month
    const monthlyStats = Array.from(monthMap.values()).map(m => ({
      ...m,
      unpaidTuitionFee: m.tuitionFee - m.paidTuitionFee
    })).sort((a, b) => a.month.localeCompare(b.month))

    // 6. Total Submissions Count & Average Score Calculation
    const { data: submissions, count: subCount, error: subErr } = await serviceRoleClient
      .from('submissions')
      .select('id, total_score, submitted_at, homework_id, student_id')

    if (subErr) return errorResponse(subErr.message, 500)

    let averageScore = 0
    if (submissions && submissions.length > 0) {
      const bestScoreMap = new Map<string, number>()
      for (const s of submissions) {
        const key = `${s.student_id}_${s.homework_id}`
        const score = Number(s.total_score)
        const currentBest = bestScoreMap.get(key)
        if (currentBest === undefined || score > currentBest) {
          bestScoreMap.set(key, score)
        }
      }
      const bestScores = Array.from(bestScoreMap.values())
      const sum = bestScores.reduce((acc, curr) => acc + curr, 0)
      averageScore = Number((sum / bestScores.length).toFixed(2))
    }

    // 7. Recent Submissions List (Top 10)
    const { data: recentSubmissionsRaw, error: recErr } = await serviceRoleClient
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

    if (recErr) return errorResponse(recErr.message, 500)

    const recentSubmissions = recentSubmissionsRaw.map((sub) => {
      const hwObj = sub.homeworks as unknown as { title: string; deadline?: string }
      const isLate = sub.is_late || (hwObj?.deadline ? new Date(sub.submitted_at) > new Date(hwObj.deadline) : false)
      return {
        submissionId: sub.id,
        studentName: (sub.profiles as unknown as { full_name: string })?.full_name || 'Unknown',
        username: (sub.profiles as unknown as { username: string })?.username || 'Unknown',
        homeworkTitle: hwObj?.title || 'Unknown',
        score: sub.total_score,
        maxScore: sub.max_score,
        correctCount: sub.correct_count,
        wrongCount: sub.wrong_count,
        isLate,
        submittedAt: sub.submitted_at,
      }
    })

    return jsonResponse({
      overview: {
        totalStudents: studentCount || 0,
        totalClasses: classCount || 0,
        totalHomeworks: homeworkCount || 0,
        totalSubmissions: subCount || 0,
        totalTaughtSessions,
        totalTuitionFee,
        totalPaidTuitionFee,
        totalUnpaidTuitionFee,
        averageScore,
      },
      monthlyStats,
      recentSubmissions,
    })
  } catch (err: unknown) {
    const error = err as Error
    return errorResponse(error.message || 'Unauthorized / Error', 401)
  }
})
