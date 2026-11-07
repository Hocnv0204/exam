/**
 * Pure calculation logic for admin dashboard (financial aggregates, attendance, score distribution).
 * Free of Deno-specific dependencies to allow Node.js execution in testing/oracles.
 */

export interface StudentLockInterval {
  student_id?: string
  start_date: string
  end_date: string | null
}

export interface RawDashboardStudent {
  id: string
  username: string
  full_name?: string | null
  class_id?: string | null
}

export interface RawDashboardClass {
  id: string
  name?: string | null
  tuition_fee?: number | null
  grade_block?: string | null
}

export interface RawDashboardStudentClass {
  student_id: string
  class_id: string
}

export interface RawDashboardClassSession {
  class_id: string
  session_date: string
}

export interface RawDashboardStudentSession {
  student_id: string
  class_id: string
  session_date: string
  is_paid: boolean | string | number
}

export interface RawDashboardSubmission {
  id: string
  total_score?: number | null
  max_score?: number | null
  student_id?: string
  homework_id?: string
  is_late?: boolean
  submitted_at?: string | null
}

export interface RawRecentSubmission {
  id: string
  total_score?: number | null
  max_score?: number | null
  correct_count?: number | null
  wrong_count?: number | null
  is_late?: boolean
  submitted_at: string
  profiles?: {
    username?: string
    full_name?: string
  } | null
  homeworks?: {
    title?: string
    deadline?: string | null
  } | null
}

export interface MonthlyFinancialStat {
  month: string
  label: string
  sessionCount: number
  submissionCount: number
  tuitionFee: number
  paidTuitionFee: number
  unpaidTuitionFee: number
  studentSessionCount: number
}

export interface StudentAttendanceStat {
  studentId: string
  username: string
  fullName: string
  classIds: string[]
  classNames: string[]
  className: string
  monthly: Record<
    string,
    {
      month: string
      label: string
      attendedSessions: number
      paidSessions: number
      unpaidSessions: number
      tuitionFee: number
      paidTuitionFee: number
      unpaidTuitionFee: number
      isFullyPaid: boolean
    }
  >
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

/** Check if student is locked on session date (inclusive start_date, exclusive end_date). */
export function isStudentLockedOn(
  studentId: string,
  sessionDate: string,
  intervals: readonly StudentLockInterval[]
): boolean {
  if (!studentId || !sessionDate) return false
  return (intervals || []).some((interval) => {
    if (interval.student_id && interval.student_id !== studentId) return false
    if (!interval.start_date) return false
    if (sessionDate < interval.start_date) return false
    return interval.end_date === null || interval.end_date === undefined
      ? true
      : sessionDate < interval.end_date
  })
}

/**
 * Pure calculation for Dashboard financial and attendance aggregates (Oracle for fn_get_dashboard_financial_stats).
 */
export function calcDashboardFinancial(params: {
  students: RawDashboardStudent[]
  classes: RawDashboardClass[]
  studentClasses: RawDashboardStudentClass[]
  classSessions: RawDashboardClassSession[]
  studentSessions: RawDashboardStudentSession[]
  lockIntervals: StudentLockInterval[]
}) {
  const { students, classes, studentClasses, classSessions, studentSessions, lockIntervals } = params

  const sortedStudents = [...students].sort((a, b) =>
    String(a.full_name || '').localeCompare(String(b.full_name || ''), 'vi')
  )
  const sortedClasses = [...classes].sort((a, b) =>
    String(a.name || '').localeCompare(String(b.name || ''), 'vi')
  )

  const intervalsByStudent = new Map<string, StudentLockInterval[]>()
  for (const it of lockIntervals || []) {
    if (!it?.student_id) continue
    let list = intervalsByStudent.get(it.student_id)
    if (!list) {
      list = []
      intervalsByStudent.set(it.student_id, list)
    }
    list.push(it)
  }

  const eligible = (studentId: string, date: string) =>
    !isStudentLockedOn(studentId, date, intervalsByStudent.get(studentId) || [])

  const studentSessionsData = studentSessions.filter((ss) => eligible(ss.student_id, ss.session_date))

  const classMap = new Map<string, { id: string; name: string; tuitionFee: number; gradeBlock: string }>()
  sortedClasses.forEach((c) => {
    classMap.set(c.id, {
      id: c.id,
      name: c.name || 'Chưa đặt tên',
      tuitionFee: Number(c.tuition_fee || 0),
      gradeBlock: c.grade_block || ''
    })
  })

  const studentClassIdsMap = new Map<string, Set<string>>()
  studentClasses.forEach((sc) => {
    if (!studentClassIdsMap.has(sc.student_id)) {
      studentClassIdsMap.set(sc.student_id, new Set<string>())
    }
    studentClassIdsMap.get(sc.student_id)!.add(sc.class_id)
  })

  const studentStatsMap = new Map<string, StudentAttendanceStat>()
  sortedStudents.forEach((s) => {
    const classIdSet = studentClassIdsMap.get(s.id) || new Set<string>()
    if (s.class_id && !classIdSet.has(s.class_id)) {
      classIdSet.add(s.class_id)
    }
    const classIds = Array.from(classIdSet)
    const classNames = classIds.map((cid) => classMap.get(cid)?.name || '').filter(Boolean)

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

  const uniqueClassSessionsSet = new Set<string>()
  const monthlySessionsSetMap = new Map<string, Set<string>>()
  const monthMap = new Map<string, MonthlyFinancialStat>()

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

  classSessions.forEach((cs) => {
    if (cs.class_id && cs.session_date) {
      addClassSessionDate(cs.class_id, cs.session_date)
    }
  })

  studentSessionsData.forEach((ss) => {
    if (ss.class_id && ss.session_date) {
      addClassSessionDate(ss.class_id, ss.session_date)
    }
  })

  const totalTaughtSessions = uniqueClassSessionsSet.size

  let totalTuitionFee = 0
  let totalPaidTuitionFee = 0

  studentSessionsData.forEach((session) => {
    const fee = classMap.get(session.class_id)?.tuitionFee || 0
    totalTuitionFee += fee
    const isPaid =
      session.is_paid === true || session.is_paid === 'true' || session.is_paid === 1
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

    if (session.student_id) {
      let studentObj = studentStatsMap.get(session.student_id)
      if (!studentObj) {
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

  monthMap.forEach((item, monthKey) => {
    const monthSessionsSet = monthlySessionsSetMap.get(monthKey)
    item.sessionCount = monthSessionsSet ? monthSessionsSet.size : 0
    item.unpaidTuitionFee = item.tuitionFee - item.paidTuitionFee
  })

  const totalUnpaidTuitionFee = totalTuitionFee - totalPaidTuitionFee
  const collectionRate =
    totalTuitionFee > 0 ? Math.round((totalPaidTuitionFee / totalTuitionFee) * 100) : 0

  const monthlyStats = Array.from(monthMap.values()).sort((a, b) => a.month.localeCompare(b.month))

  const studentAttendanceStats = Array.from(studentStatsMap.values()).sort((a, b) => {
    if (b.total.unpaidTuitionFee !== a.total.unpaidTuitionFee) {
      return b.total.unpaidTuitionFee - a.total.unpaidTuitionFee
    }
    return b.total.attendedSessions - a.total.attendedSessions
  })

  return {
    totalStudents: sortedStudents.length,
    totalClasses: sortedClasses.length,
    totalTaughtSessions,
    totalTuitionFee,
    totalPaidTuitionFee,
    totalUnpaidTuitionFee,
    collectionRate,
    monthlyStats,
    studentAttendanceStats
  }
}

/**
 * Pure calculation for submission metrics (score distribution, timing, average scores).
 */
export function calcDashboardSubmissions(params: {
  submissions: RawDashboardSubmission[]
  totalSubmissionsCount?: number | null
  recentSubmissionsRaw: RawRecentSubmission[]
}) {
  const { submissions, totalSubmissionsCount, recentSubmissionsRaw } = params

  const totalSubmissions =
    totalSubmissionsCount !== null && totalSubmissionsCount !== undefined
      ? totalSubmissionsCount
      : submissions.length

  const scoreDistribution = {
    excellent: 0, // 9 - 10
    good: 0, // 8 - 8.9
    fair: 0, // 6.5 - 7.9
    average: 0, // 5 - 6.4
    poor: 0 // < 5
  }

  let onTimeCount = 0
  let lateCount = 0

  const studentScoresMap = new Map<string, Map<string, number>>()
  const submissionCountByMonth = new Map<string, number>()

  submissions.forEach((s) => {
    if (s.submitted_at) {
      const monthKey = s.submitted_at.substring(0, 7)
      submissionCountByMonth.set(monthKey, (submissionCountByMonth.get(monthKey) || 0) + 1)
    }

    if (s.is_late) {
      lateCount++
    } else {
      onTimeCount++
    }

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

      if (avg >= 9.0) scoreDistribution.excellent++
      else if (avg >= 8.0) scoreDistribution.good++
      else if (avg >= 6.5) scoreDistribution.fair++
      else if (avg >= 5.0) scoreDistribution.average++
      else scoreDistribution.poor++
    }
  })

  if (gradedStudentsCount === 0 && submissions.length > 0) {
    submissions.forEach((s) => {
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

  const averageScore =
    gradedStudentsCount > 0
      ? Number((totalStudentAveragesSum / gradedStudentsCount).toFixed(2))
      : submissions.length > 0
      ? Number(
          (
            submissions.reduce((a, b) => a + Number(b.total_score || 0), 0) / submissions.length
          ).toFixed(2)
        )
      : 0

  const passRate =
    gradedStudentsCount > 0
      ? Math.round((passedCount / gradedStudentsCount) * 100)
      : submissions.length > 0
      ? Math.round((passedCount / submissions.length) * 100)
      : 0

  const subSampleCount = submissions.length
  const onTimeRate = subSampleCount > 0 ? Math.round((onTimeCount / subSampleCount) * 100) : 100

  const recentSubmissions = recentSubmissionsRaw.map((sub: any) => {
    const hwObj = sub.homeworks as unknown as { title: string; deadline?: string }
    const isLate =
      sub.is_late ||
      (hwObj?.deadline ? new Date(sub.submitted_at) > new Date(hwObj.deadline) : false)
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
      submittedAt: sub.submitted_at
    }
  })

  return {
    totalSubmissions,
    scoreDistribution,
    submissionTiming: {
      total: totalSubmissions,
      onTime: onTimeCount,
      late: lateCount,
      onTimeRate
    },
    averageScore,
    passRate,
    onTimeRate,
    recentSubmissions,
    submissionCountByMonth
  }
}

/**
 * Merge financial stats with submission metrics for complete dashboard payload.
 */
export function mergeDashboard(
  financial: ReturnType<typeof calcDashboardFinancial>,
  submissions: ReturnType<typeof calcDashboardSubmissions>,
  homeworkCount: number
) {
  // Logic gốc khởi tạo thêm tháng khi tháng đó chỉ có bài nộp, dù chưa có buổi học.
  const monthMap = new Map(financial.monthlyStats.map((item) => [item.month, { ...item }]))
  submissions.submissionCountByMonth.forEach((submissionCount, month) => {
    const existing = monthMap.get(month)
    if (existing) {
      existing.submissionCount = submissionCount
      return
    }
    const [year, m] = month.split('-')
    monthMap.set(month, {
      month,
      label: `Tháng ${m}/${year}`,
      sessionCount: 0,
      submissionCount,
      tuitionFee: 0,
      paidTuitionFee: 0,
      unpaidTuitionFee: 0,
      studentSessionCount: 0
    })
  })
  const monthlyStats = Array.from(monthMap.values()).sort((a, b) => a.month.localeCompare(b.month))

  return {
    overview: {
      totalStudents: financial.totalStudents,
      totalClasses: financial.totalClasses,
      totalHomeworks: homeworkCount,
      totalSubmissions: submissions.totalSubmissions,
      totalTaughtSessions: financial.totalTaughtSessions,
      totalTuitionFee: financial.totalTuitionFee,
      totalPaidTuitionFee: financial.totalPaidTuitionFee,
      totalUnpaidTuitionFee: financial.totalUnpaidTuitionFee,
      collectionRate: financial.collectionRate,
      averageScore: submissions.averageScore,
      passRate: submissions.passRate,
      onTimeRate: submissions.onTimeRate
    },
    scoreDistribution: submissions.scoreDistribution,
    submissionTiming: submissions.submissionTiming,
    monthlyStats,
    studentAttendanceStats: financial.studentAttendanceStats,
    recentSubmissions: submissions.recentSubmissions
  }
}
