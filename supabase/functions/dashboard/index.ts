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

    // Execute all independent aggregate and list queries in parallel via Promise.all
    const [
      studentsRes,
      classesRes,
      studentClassesRes,
      homeworkCountRes,
      classSessionsRes,
      studentSessionsRes,
      submissionsRes,
      submissionCountRes,
      recentSubmissionsRes
    ] = await Promise.all([
      // 1. All Students List
      serviceRoleClient
        .from('profiles')
        .select('id, username, full_name, class_id')
        .eq('role', 'STUDENT')
        .order('full_name', { ascending: true }),

      // 2. All Classes
      serviceRoleClient
        .from('classes')
        .select('id, name, tuition_fee, grade_block')
        .order('name', { ascending: true }),

      // 3. Student-Classes Mapping (many-to-many)
      serviceRoleClient
        .from('student_classes')
        .select('student_id, class_id'),

      // 4. Total Homeworks Count
      serviceRoleClient
        .from('homeworks')
        .select('*', { count: 'exact', head: true }),

      // 5. Class study sessions
      serviceRoleClient
        .from('class_sessions')
        .select('class_id, session_date'),

      // 6. Student attendance sessions
      serviceRoleClient
        .from('student_sessions')
        .select('student_id, class_id, session_date, is_paid'),

      // 7. Submissions for score calculation, monthly trends & timing (bounded to latest 2,000 for sub-second aggregation)
      serviceRoleClient
        .from('submissions')
        .select('id, total_score, max_score, student_id, homework_id, is_late, submitted_at')
        .order('submitted_at', { ascending: false })
        .limit(2000),

      // 8. Total Submissions Count (exact count across all historical records)
      serviceRoleClient
        .from('submissions')
        .select('*', { count: 'exact', head: true }),

      // 9. Recent Submissions List (Top 10)
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

    if (studentsRes.error) return errorResponse(studentsRes.error.message, 500)
    if (classesRes.error) return errorResponse(classesRes.error.message, 500)
    if (studentClassesRes.error) return errorResponse(studentClassesRes.error.message, 500)
    if (homeworkCountRes.error) return errorResponse(homeworkCountRes.error.message, 500)
    if (classSessionsRes.error) return errorResponse(classSessionsRes.error.message, 500)
    if (studentSessionsRes.error) return errorResponse(studentSessionsRes.error.message, 500)
    if (submissionsRes.error) return errorResponse(submissionsRes.error.message, 500)
    if (submissionCountRes.error) return errorResponse(submissionCountRes.error.message, 500)
    if (recentSubmissionsRes.error) return errorResponse(recentSubmissionsRes.error.message, 500)

    const studentsData = studentsRes.data || []
    const classesData = classesRes.data || []
    const studentClassesData = studentClassesRes.data || []
    const homeworkCount = homeworkCountRes.count || 0
    const classSessionsData = classSessionsRes.data || []
    const studentSessionsData = studentSessionsRes.data || []
    const submissions = submissionsRes.data || []
    const totalSubmissions = submissionCountRes.count !== null && submissionCountRes.count !== undefined ? submissionCountRes.count : submissions.length
    const recentSubmissionsRaw = recentSubmissionsRes.data || []

    const studentCount = studentsData.length
    const classCount = classesData.length
    const subCount = totalSubmissions
    const subSampleCount = submissions.length

    // Build Class Map and Tuition Map
    const classMap = new Map<string, { id: string; name: string; tuitionFee: number; gradeBlock: string }>()
    classesData.forEach(c => {
      classMap.set(c.id, {
        id: c.id,
        name: c.name || 'Chưa đặt tên',
        tuitionFee: Number(c.tuition_fee || 0),
        gradeBlock: c.grade_block || ''
      })
    })

    // Map student_classes
    const studentClassIdsMap = new Map<string, Set<string>>()
    studentClassesData.forEach(sc => {
      if (!studentClassIdsMap.has(sc.student_id)) {
        studentClassIdsMap.set(sc.student_id, new Set<string>())
      }
      studentClassIdsMap.get(sc.student_id)!.add(sc.class_id)
    })

    // Initialize Student Attendance & Tuition Map
    interface StudentStats {
      studentId: string
      username: string
      fullName: string
      classIds: string[]
      classNames: string[]
      className: string
      monthly: Record<string, {
        month: string
        label: string
        attendedSessions: number
        paidSessions: number
        unpaidSessions: number
        tuitionFee: number
        paidTuitionFee: number
        unpaidTuitionFee: number
        isFullyPaid: boolean
      }>
      total: {
        attendedSessions: number
        paidSessions: number
        unpaidSessions: number
        tuitionFee: number
        paidTuitionFee: number
        unpaidTuitionFee: number
        isFullyPaid: boolean
      }
    }

    const studentStatsMap = new Map<string, StudentStats>()
    studentsData.forEach(s => {
      const classIdSet = studentClassIdsMap.get(s.id) || new Set<string>()
      if (s.class_id && !classIdSet.has(s.class_id)) {
        classIdSet.add(s.class_id)
      }
      const classIds = Array.from(classIdSet)
      const classNames = classIds.map(cid => classMap.get(cid)?.name || '').filter(Boolean)

      studentStatsMap.set(s.id, {
        studentId: s.id,
        username: s.username,
        fullName: s.full_name || s.username,
        classIds,
        classNames,
        className: classNames.join(', ') || 'Chưa vào lớp',
        monthly: {},
        total: {
          attendedSessions: 0,
          paidSessions: 0,
          unpaidSessions: 0,
          tuitionFee: 0,
          paidTuitionFee: 0,
          unpaidTuitionFee: 0,
          isFullyPaid: true
        }
      })
    })

    // Monthly aggregates setup
    const uniqueClassSessionsSet = new Set<string>()
    const monthlySessionsSetMap = new Map<string, Set<string>>()
    const monthMap = new Map<string, {
      month: string
      label: string
      sessionCount: number
      submissionCount: number
      tuitionFee: number
      paidTuitionFee: number
      unpaidTuitionFee: number
      studentSessionCount: number
    }>()

    const getOrInitMonth = (monthKey: string) => {
      if (!monthMap.has(monthKey)) {
        const [year, m] = monthKey.split('-')
        const label = `Tháng ${m}/${year}`
        monthMap.set(monthKey, {
          month: monthKey,
          label,
          sessionCount: 0,
          submissionCount: 0,
          tuitionFee: 0,
          paidTuitionFee: 0,
          unpaidTuitionFee: 0,
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

    classSessionsData.forEach(cs => {
      if (cs.class_id && cs.session_date) {
        addClassSessionDate(cs.class_id, cs.session_date)
      }
    })

    studentSessionsData.forEach(ss => {
      if (ss.class_id && ss.session_date) {
        addClassSessionDate(ss.class_id, ss.session_date)
      }
    })

    const totalTaughtSessions = uniqueClassSessionsSet.size

    // Process student sessions for financial & individual attendance stats
    let totalTuitionFee = 0
    let totalPaidTuitionFee = 0

    studentSessionsData.forEach(session => {
      const fee = classMap.get(session.class_id)?.tuitionFee || 0
      totalTuitionFee += fee
      const isPaid = session.is_paid === true || session.is_paid === 'true' || session.is_paid === 1
      if (isPaid) {
        totalPaidTuitionFee += fee
      }

      const monthKey = session.session_date ? session.session_date.substring(0, 7) : null
      if (monthKey) {
        const item = getOrInitMonth(monthKey)
        item.tuitionFee += fee
        item.studentSessionCount++
        if (isPaid) {
          item.paidTuitionFee += fee
        }
      }

      // Process per-student individual stats
      if (session.student_id) {
        let studentObj = studentStatsMap.get(session.student_id)
        if (!studentObj) {
          // In case student is not in profiles list
          studentObj = {
            studentId: session.student_id,
            username: 'student',
            fullName: 'Học sinh',
            classIds: [session.class_id],
            classNames: [classMap.get(session.class_id)?.name || ''],
            className: classMap.get(session.class_id)?.name || '',
            monthly: {},
            total: {
              attendedSessions: 0,
              paidSessions: 0,
              unpaidSessions: 0,
              tuitionFee: 0,
              paidTuitionFee: 0,
              unpaidTuitionFee: 0,
              isFullyPaid: true
            }
          }
          studentStatsMap.set(session.student_id, studentObj)
        }

        // Increment student total
        studentObj.total.attendedSessions++
        studentObj.total.tuitionFee += fee
        if (isPaid) {
          studentObj.total.paidSessions++
          studentObj.total.paidTuitionFee += fee
        } else {
          studentObj.total.unpaidSessions++
          studentObj.total.unpaidTuitionFee += fee
        }
        studentObj.total.isFullyPaid = studentObj.total.unpaidSessions === 0

        // Increment student monthly
        if (monthKey) {
          if (!studentObj.monthly[monthKey]) {
            const [year, m] = monthKey.split('-')
            studentObj.monthly[monthKey] = {
              month: monthKey,
              label: `Tháng ${m}/${year}`,
              attendedSessions: 0,
              paidSessions: 0,
              unpaidSessions: 0,
              tuitionFee: 0,
              paidTuitionFee: 0,
              unpaidTuitionFee: 0,
              isFullyPaid: true
            }
          }
          const mObj = studentObj.monthly[monthKey]
          mObj.attendedSessions++
          mObj.tuitionFee += fee
          if (isPaid) {
            mObj.paidSessions++
            mObj.paidTuitionFee += fee
          } else {
            mObj.unpaidSessions++
            mObj.unpaidTuitionFee += fee
          }
          mObj.isFullyPaid = mObj.unpaidSessions === 0
        }
      }
    })

    // Process submissions for monthly submission count, timing and score distribution
    const scoreDistribution = {
      excellent: 0, // 9 - 10
      good: 0,      // 8 - 8.9
      fair: 0,      // 6.5 - 7.9
      average: 0,   // 5 - 6.4
      poor: 0       // < 5
    }

    let onTimeCount = 0
    let lateCount = 0

    // Compute student average scores across homeworks
    const studentScoresMap = new Map<string, Map<string, number>>() // student_id -> homework_id -> best_scaled_score
    submissions.forEach(s => {
      // Monthly submission count
      if (s.submitted_at) {
        const monthKey = s.submitted_at.substring(0, 7)
        const item = getOrInitMonth(monthKey)
        item.submissionCount++
      }

      // Submission Timing
      if (s.is_late) {
        lateCount++
      } else {
        onTimeCount++
      }

      // Best Score per homework per student (scale of 10)
      if (s.student_id && s.homework_id) {
        const rawScore = Number(s.total_score || 0)
        const maxScore = Number(s.max_score || 10) || 10
        const scaledScore = Math.min(10, Math.max(0, (rawScore / maxScore) * 10))

        if (!studentScoresMap.has(s.student_id)) {
          studentScoresMap.set(s.student_id, new Map<string, number>())
        }
        const hwMap = studentScoresMap.get(s.student_id)!
        const currentBest = hwMap.get(s.homework_id)
        if (currentBest === undefined || scaledScore > currentBest) {
          hwMap.set(s.homework_id, scaledScore)
        }
      }
    })

    // Calculate score distribution across students
    let totalStudentAveragesSum = 0
    let gradedStudentsCount = 0
    let passedCount = 0

    studentScoresMap.forEach((hwMap) => {
      const scores = Array.from(hwMap.values())
      if (scores.length > 0) {
        const avg = scores.reduce((sum, val) => sum + val, 0) / scores.length
        totalStudentAveragesSum += avg
        gradedStudentsCount++

        if (avg >= 5.0) passedCount++

        if (avg >= 9.0) {
          scoreDistribution.excellent++
        } else if (avg >= 8.0) {
          scoreDistribution.good++
        } else if (avg >= 6.5) {
          scoreDistribution.fair++
        } else if (avg >= 5.0) {
          scoreDistribution.average++
        } else {
          scoreDistribution.poor++
        }
      }
    })

    // If no students have submissions yet, fallback to single submission scores
    if (gradedStudentsCount === 0 && submissions.length > 0) {
      submissions.forEach(s => {
        const rawScore = Number(s.total_score || 0)
        const maxScore = Number(s.max_score || 10) || 10
        const scaled = (rawScore / maxScore) * 10
        if (scaled >= 5.0) passedCount++
        if (scaled >= 9.0) scoreDistribution.excellent++
        else if (scaled >= 8.0) scoreDistribution.good++
        else if (scaled >= 6.5) scoreDistribution.fair++
        else if (scaled >= 5.0) scoreDistribution.average++
        else scoreDistribution.poor++
      })
    }

    const averageScore = gradedStudentsCount > 0
      ? Number((totalStudentAveragesSum / gradedStudentsCount).toFixed(2))
      : (submissions.length > 0
          ? Number((submissions.reduce((a, b) => a + Number(b.total_score || 0), 0) / submissions.length).toFixed(2))
          : 0)

    const passRate = gradedStudentsCount > 0
      ? Math.round((passedCount / gradedStudentsCount) * 100)
      : (submissions.length > 0 ? Math.round((passedCount / submissions.length) * 100) : 0)

    const onTimeRate = subSampleCount > 0 ? Math.round((onTimeCount / subSampleCount) * 100) : 100

    // Set sessionCount and unpaidTuitionFee for each month
    monthMap.forEach((item, monthKey) => {
      const monthSessionsSet = monthlySessionsSetMap.get(monthKey)
      item.sessionCount = monthSessionsSet ? monthSessionsSet.size : 0
      item.unpaidTuitionFee = item.tuitionFee - item.paidTuitionFee
    })

    const totalUnpaidTuitionFee = totalTuitionFee - totalPaidTuitionFee
    const collectionRate = totalTuitionFee > 0 ? Math.round((totalPaidTuitionFee / totalTuitionFee) * 100) : 0

    // Sort monthly stats chronologically
    const monthlyStats = Array.from(monthMap.values()).sort((a, b) => a.month.localeCompare(b.month))

    // Format student attendance stats as array sorted by outstanding debt and attendance
    const studentAttendanceStats = Array.from(studentStatsMap.values()).sort((a, b) => {
      if (b.total.unpaidTuitionFee !== a.total.unpaidTuitionFee) {
        return b.total.unpaidTuitionFee - a.total.unpaidTuitionFee
      }
      return b.total.attendedSessions - a.total.attendedSessions
    })

    const recentSubmissions = recentSubmissionsRaw.map((sub: any) => {
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
        totalStudents: studentCount,
        totalClasses: classCount,
        totalHomeworks: homeworkCount,
        totalSubmissions: subCount,
        totalTaughtSessions,
        totalTuitionFee,
        totalPaidTuitionFee,
        totalUnpaidTuitionFee,
        collectionRate,
        averageScore,
        passRate,
        onTimeRate,
      },
      scoreDistribution,
      submissionTiming: {
        total: subCount,
        onTime: onTimeCount,
        late: lateCount,
        onTimeRate,
      },
      monthlyStats,
      studentAttendanceStats,
      recentSubmissions,
    })
  } catch (err: unknown) {
    const error = err as Error
    return errorResponse(error.message || 'Unauthorized / Error', 401)
  }
})
