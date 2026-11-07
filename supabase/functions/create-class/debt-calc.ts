/**
 * Pure business calculation logic for class debt summary, KPI stats, and attendance history.
 * Free of Deno-specific dependencies to allow Node.js execution in testing/oracles.
 */

export interface StudentInfo {
  id: string
  username: string
  fullName?: string | null
  status?: string | null
  balance?: number | null
}

export interface StudentLockInterval {
  student_id?: string
  start_date: string
  end_date: string | null
}

export interface RawStudentSession {
  id?: string
  student_id: string
  class_id?: string
  session_date: string
  is_paid: boolean | string | number
}

export interface RawAttendanceSession {
  id: string
  class_id?: string
  session_date: string
  fee_per_session?: number | null
  note?: string | null
  created_at?: string | null
  records?: RawAttendanceRecord[]
  attendance_records?: RawAttendanceRecord[]
}

export interface RawAttendanceRecord {
  id?: string
  session_id?: string
  student_id: string
  is_present: boolean
  fee_amount?: number | null
  payment_status?: string | null
  paid_at?: string | null
  attendance_sessions?: {
    id?: string
    session_date?: string
    note?: string | null
  }
}

export interface RawHomework {
  id: string
  title?: string
  deadline?: string | null
  is_published?: boolean
}

export interface RawSubmission {
  homework_id: string
  student_id: string
  status?: string
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

export function buildIntervalsByStudentMap(
  intervals: readonly StudentLockInterval[]
): Map<string, StudentLockInterval[]> {
  const map = new Map<string, StudentLockInterval[]>()
  for (const it of intervals || []) {
    if (!it?.student_id) continue
    let list = map.get(it.student_id)
    if (!list) {
      list = []
      map.set(it.student_id, list)
    }
    list.push(it)
  }
  return map
}

/**
 * 1. Calculate Class Debt Summary (Oracle for action: get-class-debt-summary)
 */
export function calcClassDebtSummary(params: {
  classId: string
  tuitionFee: number
  students: StudentInfo[]
  lockIntervals: StudentLockInterval[]
  studentSessions: RawStudentSession[]
  attendanceRecords: RawAttendanceRecord[]
}) {
  const { tuitionFee, students, lockIntervals, studentSessions, attendanceRecords } = params

  const studentMap = new Map<string, any>()
  for (const s of students) {
    if (!studentMap.has(s.id)) {
      studentMap.set(s.id, {
        studentId: s.id,
        username: s.username,
        fullName: s.fullName || s.username,
        studentCode: `HS-${s.username}`,
        status: s.status || 'ACTIVE',
        balance: s.balance || 0
      })
    }
  }

  const intervalsByStudent = buildIntervalsByStudentMap(lockIntervals)
  const eligible = (studentId: string, date: string) =>
    !isStudentLockedOn(studentId, date, intervalsByStudent.get(studentId) || [])

  const studentSessionsData = studentSessions.filter((s) => eligible(s.student_id, s.session_date))
  const attendanceRecordsData = attendanceRecords.filter((r) => {
    const d = r.attendance_sessions?.session_date || (r as any).session_date
    return d ? eligible(r.student_id, d) : false
  })

  const sessionsByStudent = new Map<string, any[]>()
  for (const ss of studentSessionsData) {
    let list = sessionsByStudent.get(ss.student_id)
    if (!list) {
      list = []
      sessionsByStudent.set(ss.student_id, list)
    }
    list.push(ss)
  }

  const recordsByStudent = new Map<string, any[]>()
  for (const ar of attendanceRecordsData) {
    let list = recordsByStudent.get(ar.student_id)
    if (!list) {
      list = []
      recordsByStudent.set(ar.student_id, list)
    }
    list.push(ar)
  }

  return Array.from(studentMap.values()).map((s) => {
    const sMap = new Map<string, any>()

    // 1. Load from student_sessions
    const studentSessions = sessionsByStudent.get(s.studentId) || []
    studentSessions.forEach((ss: any) => {
      sMap.set(ss.session_date, {
        recordId: ss.id,
        sessionId: null,
        sessionDate: ss.session_date,
        sessionNote: null,
        isPresent: true,
        isPaid: ss.is_paid === true || ss.is_paid === 'true' || ss.is_paid === 1,
        feeAmount: tuitionFee,
        paymentStatus: (ss.is_paid === true || ss.is_paid === 'true' || ss.is_paid === 1) ? 'paid' : 'unpaid',
        paidAt: null,
        source: 'student_sessions'
      })
    })

    // 2. Merge from attendance_records
    const studentRecsFromAr = recordsByStudent.get(s.studentId) || []
    studentRecsFromAr.forEach((ar: any) => {
      const date = ar.attendance_sessions?.session_date || ar.session_date
      const existing = sMap.get(date)
      if (ar.is_present) {
        const isPaid = ar.payment_status === 'paid' || (existing?.isPaid ?? false)
        sMap.set(date, {
          recordId: ar.id,
          sessionId: ar.attendance_sessions?.id || ar.session_id,
          sessionDate: date,
          sessionNote: ar.attendance_sessions?.note || ar.session_note || null,
          isPresent: true,
          isPaid,
          feeAmount: Number(ar.fee_amount || existing?.feeAmount || tuitionFee),
          paymentStatus: isPaid ? 'paid' : ar.payment_status === 'waived' ? 'waived' : 'unpaid',
          paidAt: ar.paid_at || existing?.paidAt || null,
          source: 'attendance_records'
        })
      } else if (!existing) {
        sMap.set(date, {
          recordId: ar.id,
          sessionId: ar.attendance_sessions?.id || ar.session_id,
          sessionDate: date,
          sessionNote: ar.attendance_sessions?.note || ar.session_note || null,
          isPresent: false,
          isPaid: false,
          feeAmount: 0,
          paymentStatus: 'none',
          paidAt: null,
          source: 'attendance_records'
        })
      }
    })

    const studentRecs = Array.from(sMap.values())
    const attendedSessions = studentRecs.filter((r) => r.isPresent).length
    const totalSessions = studentRecs.length
    const paidSessions = studentRecs.filter((r) => r.isPresent && r.isPaid).length
    const unpaidSessions = studentRecs.filter((r) => r.isPresent && !r.isPaid && r.paymentStatus !== 'waived').length
    const waivedSessions = studentRecs.filter((r) => r.isPresent && r.paymentStatus === 'waived').length
    const unpaidDebt = studentRecs
      .filter((r) => r.isPresent && !r.isPaid && r.paymentStatus !== 'waived')
      .reduce((sum, r) => sum + r.feeAmount, 0)

    const attendanceRate = totalSessions > 0 ? Math.round((attendedSessions / totalSessions) * 100) : 100
    const paidAmount = studentRecs
      .filter((r) => r.isPresent && r.isPaid)
      .reduce((sum, r) => sum + r.feeAmount, 0)

    return {
      ...s,
      attendedSessions,
      totalSessions,
      paidSessions,
      unpaidSessions,
      waivedSessions,
      paidAmount,
      unpaidDebt,
      attendanceRate,
      isFullyPaid: unpaidDebt === 0,
      sessions: studentRecs.sort((a, b) => b.sessionDate.localeCompare(a.sessionDate))
    }
  })
}

/**
 * 2. Calculate Attendance History (Oracle for action: get-attendance-history)
 */
export function calcAttendanceHistory(params: {
  classId: string
  tuitionFee: number
  students: StudentInfo[]
  lockIntervals: StudentLockInterval[]
  attendanceSessions: RawAttendanceSession[]
  studentSessions: RawStudentSession[]
  monthParam?: string | null
  page?: number
  pageSize?: number
  hasPaging?: boolean
}) {
  const {
    classId,
    tuitionFee,
    students,
    lockIntervals,
    attendanceSessions,
    studentSessions,
    monthParam,
    page = 1,
    pageSize = 10,
    hasPaging = false
  } = params

  const studentMap = new Map<string, any>()
  for (const s of students) {
    if (!studentMap.has(s.id)) {
      studentMap.set(s.id, {
        id: s.id,
        username: s.username,
        fullName: s.fullName || s.username,
        status: s.status || 'ACTIVE'
      })
    }
  }

  const totalEnrolledStudents = studentMap.size
  const intervalsByStudent = buildIntervalsByStudentMap(lockIntervals)
  const eligible = (studentId: string, date: string) =>
    !isStudentLockedOn(studentId, date, intervalsByStudent.get(studentId) || [])

  const attendanceSessionsData = attendanceSessions
  const studentSessionsData = studentSessions.filter(
    (ss) => studentMap.has(ss.student_id) && eligible(ss.student_id, ss.session_date)
  )

  const dateMap = new Map<
    string,
    {
      sessionId: string | null
      note: string | null
      feePerSession: number
      createdAt: string | null
      studentRecords: Map<string, { isPresent: boolean; paymentStatus: string; feeAmount: number }>
    }
  >()

  // 1. Fill dates from attendance_sessions
  attendanceSessionsData.forEach((s: any) => {
    const fee = Number(s.fee_per_session || tuitionFee)
    const sRecMap = new Map<string, { isPresent: boolean; paymentStatus: string; feeAmount: number }>()

    const rawRecs = s.attendance_records || s.records || []
    const recs = rawRecs.filter(
      (r: any) => studentMap.has(r.student_id) && eligible(r.student_id, s.session_date)
    )
    recs.forEach((r: any) => {
      sRecMap.set(r.student_id, {
        isPresent: r.is_present === true,
        paymentStatus: r.payment_status || 'none',
        feeAmount: Number(r.fee_amount || fee)
      })
    })

    dateMap.set(s.session_date, {
      sessionId: s.id,
      note: s.note || null,
      feePerSession: fee,
      createdAt: s.created_at || null,
      studentRecords: sRecMap
    })
  })

  // 2. Merge/Add dates from student_sessions
  studentSessionsData.forEach((ss: any) => {
    let dateEntry = dateMap.get(ss.session_date)
    if (!dateEntry) {
      dateEntry = {
        sessionId: null,
        note: null,
        feePerSession: tuitionFee,
        createdAt: null,
        studentRecords: new Map()
      }
      dateMap.set(ss.session_date, dateEntry)
    }

    const existing = dateEntry.studentRecords.get(ss.student_id)
    const isPaid = ss.is_paid === true || ss.is_paid === 'true' || ss.is_paid === 1
    if (!existing) {
      dateEntry.studentRecords.set(ss.student_id, {
        isPresent: true,
        paymentStatus: isPaid ? 'paid' : 'unpaid',
        feeAmount: dateEntry.feePerSession
      })
    } else if (isPaid && existing.paymentStatus !== 'paid') {
      existing.paymentStatus = 'paid'
    }
  })

  const sortedDates = Array.from(dateMap.keys()).sort().reverse()
  const months = [...new Set(sortedDates.map((d) => d.substring(0, 7)))].filter(Boolean)
  const scopedDates = monthParam ? sortedDates.filter((d) => d.startsWith(monthParam)) : sortedDates

  const formatted = scopedDates.map((date) => {
    const entry = dateMap.get(date)!
    const recList = Array.from(entry.studentRecords.values())
    const presentCount = recList.filter((r) => r.isPresent).length
    const activeOnDate = [...studentMap.keys()].filter((id) => eligible(id, date)).length
    const totalCount = totalEnrolledStudents > 0 ? activeOnDate : recList.length
    const absentCount = totalCount > presentCount ? totalCount - presentCount : 0
    const paidCount = recList.filter((r) => r.isPresent && r.paymentStatus === 'paid').length
    const unpaidCount = recList.filter((r) => r.isPresent && r.paymentStatus === 'unpaid').length
    const totalFee = recList
      .filter((r) => r.isPresent && r.paymentStatus !== 'waived')
      .reduce((sum, r) => sum + r.feeAmount, 0)
    const attendanceRate = totalCount > 0 ? Math.round((presentCount / totalCount) * 100) : 0

    return {
      id: entry.sessionId || `session-${date}`,
      classId,
      sessionDate: date,
      note: entry.note,
      feePerSession: entry.feePerSession,
      createdAt: entry.createdAt,
      presentCount,
      absentCount,
      totalCount,
      paidCount,
      unpaidCount,
      totalFee,
      attendanceRate
    }
  })

  if (!hasPaging) {
    return formatted
  }
  const total = formatted.length
  const totalPages = Math.max(1, Math.ceil(total / pageSize))
  const safePage = Math.min(page, totalPages)
  return {
    items: formatted.slice((safePage - 1) * pageSize, safePage * pageSize),
    total,
    page: safePage,
    pageSize,
    totalPages,
    months
  }
}

/**
 * 3. Calculate Class KPI Stats (Oracle for action: get-class-kpi-stats)
 */
export function calcClassKpiStats(params: {
  classId: string
  tuitionFee: number
  students: StudentInfo[]
  lockIntervals: StudentLockInterval[]
  attendanceSessions: RawAttendanceSession[]
  studentSessions: RawStudentSession[]
  homeworks: RawHomework[]
  submissions: RawSubmission[]
  now?: Date | string
}) {
  const {
    classId: _classId,
    tuitionFee,
    students,
    lockIntervals,
    attendanceSessions,
    studentSessions,
    homeworks,
    submissions,
    now: nowInput = new Date()
  } = params

  const now = typeof nowInput === 'string' ? new Date(nowInput) : nowInput
  const nowIso = now.toISOString()

  const studentMap = new Map<string, string>()
  for (const s of students) {
    if (!studentMap.has(s.id)) {
      studentMap.set(s.id, s.status || 'ACTIVE')
    }
  }

  let activeStudents = 0
  let pausedStudents = 0
  for (const st of studentMap.values()) {
    if (st === 'PAUSED') pausedStudents++
    else activeStudents++
  }
  const totalStudents = studentMap.size

  const openHomeworks = homeworks.filter(
    (h: any) => h.is_published && (!h.deadline || h.deadline >= nowIso)
  )

  const intervalsByStudent = buildIntervalsByStudentMap(lockIntervals)
  const eligible = (studentId: string, date: string) =>
    !isStudentLockedOn(studentId, date, intervalsByStudent.get(studentId) || [])

  const unifiedMap = new Map<string, Map<string, { isPresent: boolean; isPaid: boolean; feeAmount: number }>>()
  for (const sId of studentMap.keys()) {
    unifiedMap.set(sId, new Map())
  }

  // Add from student_sessions
  studentSessions
    .filter((ss) => studentMap.has(ss.student_id) && eligible(ss.student_id, ss.session_date))
    .forEach((ss) => {
      const sMap = unifiedMap.get(ss.student_id)
      if (sMap) {
        const isPaid = ss.is_paid === true || ss.is_paid === 'true' || ss.is_paid === 1
        sMap.set(ss.session_date, {
          isPresent: true,
          isPaid,
          feeAmount: tuitionFee
        })
      }
    })

  // Merge from attendance_sessions
  attendanceSessions.forEach((as: any) => {
    const recs = as.attendance_records || as.records || []
    const fee = Number(as.fee_per_session || tuitionFee)
    recs
      .filter((r: any) => studentMap.has(r.student_id) && eligible(r.student_id, as.session_date))
      .forEach((r: any) => {
        const sMap = unifiedMap.get(r.student_id)
        if (sMap) {
          const existing = sMap.get(as.session_date)
          if (r.is_present) {
            const isPaid = r.payment_status === 'paid' || (existing?.isPaid ?? false)
            const isWaived = r.payment_status === 'waived'
            sMap.set(as.session_date, {
              isPresent: true,
              isPaid: isPaid || isWaived,
              feeAmount: isWaived ? 0 : Number(r.fee_amount || existing?.feeAmount || fee)
            })
          } else if (!existing) {
            sMap.set(as.session_date, {
              isPresent: false,
              isPaid: false,
              feeAmount: 0
            })
          }
        }
      })
  })

  // 30-day attendance rate
  const thirtyDaysAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000)
  const thirtyDaysAgoStr = thirtyDaysAgo.toISOString().split('T')[0]

  let last30Present = 0
  let last30Total = 0
  unifiedMap.forEach((sMap) => {
    sMap.forEach((sess, dateStr) => {
      if (dateStr >= thirtyDaysAgoStr) {
        last30Total++
        if (sess.isPresent) last30Present++
      }
    })
  })
  const attendanceRate30Days =
    last30Total > 0 ? Math.round((last30Present / last30Total) * 1000) / 10 : 100

  // Uncollected tuition
  let totalUnpaidAmount = 0
  const owingStudentSet = new Set<string>()
  unifiedMap.forEach((sMap, sId) => {
    let studentDebt = 0
    sMap.forEach((sess) => {
      if (sess.isPresent && !sess.isPaid) {
        studentDebt += sess.feeAmount
      }
    })
    if (studentDebt > 0) {
      totalUnpaidAmount += studentDebt
      owingStudentSet.add(sId)
    }
  })

  // Dates and session stats
  const allDates = new Set<string>()
  studentSessions
    .filter((ss) => studentMap.has(ss.student_id) && eligible(ss.student_id, ss.session_date))
    .forEach((ss) => allDates.add(ss.session_date))
  attendanceSessions.forEach((as) => allDates.add(as.session_date))
  const sortedDates = Array.from(allDates).sort().reverse()
  const latestDate = sortedDates[0] || null

  const todayStr = now.toISOString().split('T')[0]
  const monthPrefix = todayStr.slice(0, 7)
  const monthHeld = sortedDates.filter((d) => d.slice(0, 7) === monthPrefix && d <= todayStr).length

  let latestSessionInfo = null
  if (latestDate) {
    let presentCount = 0
    let totalCount = 0
    unifiedMap.forEach((sMap) => {
      const sess = sMap.get(latestDate)
      if (sess) {
        totalCount++
        if (sess.isPresent) presentCount++
      }
    })
    if (totalCount === 0) totalCount = activeStudents
    latestSessionInfo = {
      sessionDate: latestDate,
      presentCount,
      totalCount,
      note: attendanceSessions.find((as) => as.session_date === latestDate)?.note || null
    }
  }

  // Homework pending count
  let pendingSubmissionsCount = 0
  if (openHomeworks.length > 0 && totalStudents > 0) {
    const submittedSet = new Set(
      (submissions || [])
        .filter((s) => s.status === 'SUBMITTED')
        .map((s) => `${s.homework_id}|${s.student_id}`)
    )
    openHomeworks.forEach((h: any) => {
      studentMap.forEach((_, sId) => {
        const sIntervals = intervalsByStudent.get(sId)
        if (sIntervals && sIntervals.some((i) => i.end_date == null)) return
        if (!submittedSet.has(`${h.id}|${sId}`)) {
          pendingSubmissionsCount++
        }
      })
    })
  }

  return {
    totalStudents: {
      total: totalStudents,
      active: activeStudents,
      paused: pausedStudents
    },
    attendanceRate30Days,
    uncollectedTuition: {
      totalAmount: totalUnpaidAmount,
      owingStudentsCount: owingStudentSet.size
    },
    homeworks: {
      totalCount: homeworks.length,
      openCount: openHomeworks.length,
      pendingSubmissionsCount
    },
    sessions: {
      totalHeld: sortedDates.length,
      monthHeld,
      month: monthPrefix
    },
    latestSession: latestSessionInfo
  }
}
