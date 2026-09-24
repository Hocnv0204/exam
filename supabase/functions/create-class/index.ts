import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { requireAdmin, requireAuth } from '../../shared/auth-middleware.ts'
import { handleCors, jsonResponse, errorResponse } from '../../shared/response-helper.ts'
import {
  createClassSchema,
  updateClassSchema,
  deleteClassSchema,
  removeStudentFromClassSchema,
} from '../../shared/validators.ts'

serve(async (req: Request) => {
  const corsRes = handleCors(req)
  if (corsRes) return corsRes

  try {
    const { user, serviceRoleClient } = await requireAuth(req)
    const url = new URL(req.url)
    const action = url.searchParams.get('action')

    // GET: List all classes or get study sessions
    if (req.method === 'GET') {
      if (action === 'get-grade-blocks') {
        const includeStats = url.searchParams.get('includeStats') === 'true'

        if (!includeStats) {
          const { data: blocks, error } = await serviceRoleClient
            .from('grade_blocks')
            .select('*')
            .order('name', { ascending: true })

          if (error) return errorResponse(error.message, 500)
          return jsonResponse(blocks || [])
        }

        // When stats are requested (e.g. for Grade Blocks Management view)
        const [blocksRes, classesRes, qbRes] = await Promise.all([
          serviceRoleClient
            .from('grade_blocks')
            .select('*')
            .order('name', { ascending: true }),
          serviceRoleClient
            .from('classes')
            .select('id, name, grade_block'),
          serviceRoleClient
            .from('question_bank')
            .select('grade_block'),
        ])

        if (blocksRes.error) return errorResponse(blocksRes.error.message, 500)

        const blocks = blocksRes.data || []
        const classesData = classesRes.data || []
        const qbData = qbRes.data || []

        const qbCountMap: Record<string, number> = {}
        qbData.forEach((q: any) => {
          if (q.grade_block) {
            qbCountMap[q.grade_block] = (qbCountMap[q.grade_block] || 0) + 1
          }
        })

        const classMap: Record<string, { count: number; names: string[] }> = {}
        classesData.forEach((c: any) => {
          const gb = c.grade_block || '12-Toán'
          if (!classMap[gb]) classMap[gb] = { count: 0, names: [] }
          classMap[gb].count += 1
          if (c.name) classMap[gb].names.push(c.name)
        })

        const enriched = blocks.map((b: any) => ({
          ...b,
          classesCount: classMap[b.name]?.count || 0,
          classesList: classMap[b.name]?.names || [],
          questionsCount: qbCountMap[b.name] || 0,
        }))

        return jsonResponse(enriched)
      }

      if (action === 'get-sessions') {
        const classId = url.searchParams.get('classId')
        const month = url.searchParams.get('month') // format: YYYY-MM
        if (!classId) return errorResponse('Class ID is required', 400)
        
        if (user.role === 'STUDENT' && (!user.classIds || !user.classIds.includes(classId))) {
          return errorResponse('Forbidden: You are not enrolled in this class', 403)
        }
        
        let query = serviceRoleClient
          .from('class_sessions')
          .select('session_date')
          .eq('class_id', classId)
          
        if (month) {
          const startDate = `${month}-01`
          const [year, m] = month.split('-').map(Number)
          const endDate = `${year}-${String(m).padStart(2, '0')}-${String(new Date(year, m, 0).getDate()).padStart(2, '0')}`
          query = query.gte('session_date', startDate).lte('session_date', endDate)
        }
        
        const { data: sessions, error } = await query
        if (error) return errorResponse(error.message, 500)
        
        return jsonResponse((sessions || []).map(s => s.session_date))
      }

      if (action === 'get-student-sessions') {
        const studentId = url.searchParams.get('studentId')
        const classId = url.searchParams.get('classId')
        const month = url.searchParams.get('month') // format: YYYY-MM
        if (!studentId || !classId) return errorResponse('studentId and classId are required', 400)
        
        if (user.role === 'STUDENT' && user.id !== studentId) {
          return errorResponse('Forbidden: Cannot view other student sessions', 403)
        }
        
        let query = serviceRoleClient
          .from('student_sessions')
          .select('session_date, is_paid')
          .eq('student_id', studentId)
          .eq('class_id', classId)
          
        if (month) {
          const startDate = `${month}-01`
          const [year, m] = month.split('-').map(Number)
          const endDate = `${year}-${String(m).padStart(2, '0')}-${String(new Date(year, m, 0).getDate()).padStart(2, '0')}`
          query = query.gte('session_date', startDate).lte('session_date', endDate)
        }
        
        const { data: sessions, error } = await query
        if (error) return errorResponse(error.message, 500)
        
        const formatted = (sessions || []).map(s => ({
          sessionDate: s.session_date,
          isPaid: s.is_paid
        }))
        return jsonResponse(formatted)
      }

      if (action === 'get-telegram-config') {
        const classId = url.searchParams.get('classId')
        if (!classId) return errorResponse('Class ID is required', 400)
        
        const { data, error } = await serviceRoleClient
          .from('telegram_configs')
          .select('*')
          .eq('class_id', classId)
          .single()

        if (error && error.code !== 'PGRST116') {
          return errorResponse(error.message, 500)
        }

        return jsonResponse(data || null)
      }

      if (action === 'get-attendance') {
        const classId = url.searchParams.get('classId')
        const date = url.searchParams.get('date') // YYYY-MM-DD
        if (!classId || !date) return errorResponse('classId and date are required', 400)

        // Fetch class info
        const { data: classData, error: classErr } = await serviceRoleClient
          .from('classes')
          .select('id, name, tuition_fee, is_archived')
          .eq('id', classId)
          .single()

        if (classErr) return errorResponse(classErr.message, 500)

        // Fetch students enrolled in this class with their status, session and student_sessions for that date
        const [studentClassesRes, legacyStudentsRes, sessionRes, studentSessionsRes] = await Promise.all([
          serviceRoleClient
            .from('student_classes')
            .select('student_id, status, profiles:student_id(id, username, full_name, role)')
            .eq('class_id', classId),
          serviceRoleClient
            .from('profiles')
            .select('id, username, full_name, role')
            .eq('class_id', classId)
            .eq('role', 'STUDENT'),
          serviceRoleClient
            .from('attendance_sessions')
            .select('id, class_id, session_date, note, fee_per_session, created_at, updated_at')
            .eq('class_id', classId)
            .eq('session_date', date)
            .maybeSingle(),
          serviceRoleClient
            .from('student_sessions')
            .select('id, student_id, session_date, is_paid')
            .eq('class_id', classId)
            .eq('session_date', date)
        ])

        const studentMap = new Map<string, { id: string; username: string; fullName: string; status: string }>()
        
        for (const sc of (studentClassesRes.data || [])) {
          const prof = (sc as any).profiles
          if (prof && prof.role === 'STUDENT') {
            studentMap.set(prof.id, {
              id: prof.id,
              username: prof.username,
              fullName: prof.full_name || prof.username,
              status: sc.status || 'ACTIVE'
            })
          }
        }
        for (const ls of (legacyStudentsRes.data || [])) {
          if (!studentMap.has(ls.id)) {
            studentMap.set(ls.id, {
              id: ls.id,
              username: ls.username,
              fullName: ls.full_name || ls.username,
              status: 'ACTIVE'
            })
          }
        }

        const session = sessionRes.data || null
        let records: any[] = []
        if (session) {
          const { data: recData } = await serviceRoleClient
            .from('attendance_records')
            .select('id, session_id, student_id, is_present, fee_amount, payment_status, paid_at')
            .eq('session_id', session.id)
          records = recData || []
        }

        const recordMap = new Map<string, any>()
        records.forEach(r => recordMap.set(r.student_id, r))

        const studentSessionsMap = new Map<string, any>()
        ;(studentSessionsRes.data || []).forEach((ss: any) => studentSessionsMap.set(ss.student_id, ss))

        const tuitionFee = Number(classData.tuition_fee || 0)
        const feePerSession = session ? Number(session.fee_per_session || tuitionFee) : tuitionFee

        const students = Array.from(studentMap.values()).map(s => {
          const rec = recordMap.get(s.id)
          const sSess = studentSessionsMap.get(s.id)

          let isPresent = false
          let paymentStatus = 'none'
          let paidAt = null
          let feeAmount = feePerSession
          let recordId = rec ? rec.id : null

          if (rec) {
            isPresent = rec.is_present === true
            paymentStatus = rec.payment_status || 'none'
            paidAt = rec.paid_at || null
            feeAmount = Number(rec.fee_amount || feePerSession)
            if (sSess && sSess.is_paid && paymentStatus !== 'paid') {
              paymentStatus = 'paid'
            }
          } else if (sSess) {
            // Ticked from student calendar (#student-details)
            isPresent = true
            paymentStatus = sSess.is_paid ? 'paid' : 'unpaid'
            feeAmount = feePerSession
          }

          return {
            studentId: s.id,
            username: s.username,
            fullName: s.fullName,
            status: s.status, // ACTIVE / PAUSED
            isPresent,
            feeAmount,
            paymentStatus,
            paidAt,
            recordId
          }
        })

        return jsonResponse({
          session: session || ((studentSessionsRes.data || []).length > 0 ? {
            id: `session-${date}`,
            class_id: classId,
            session_date: date,
            note: null,
            fee_per_session: feePerSession,
            source: 'student_sessions'
          } : null),
          classInfo: {
            id: classData.id,
            name: classData.name,
            tuitionFee,
            isArchived: classData.is_archived || false
          },
          students
        })
      }

      if (action === 'get-attendance-history') {
        const classId = url.searchParams.get('classId')
        if (!classId) return errorResponse('classId is required', 400)

        // 1. Fetch Class, Students, Attendance Sessions, Student Sessions
        const [classRes, scRes, legacyRes, sessionsRes, studentSessionsRes] = await Promise.all([
          serviceRoleClient
            .from('classes')
            .select('id, name, tuition_fee')
            .eq('id', classId)
            .single(),
          serviceRoleClient
            .from('student_classes')
            .select('student_id, status, profiles:student_id(id, username, full_name, role)')
            .eq('class_id', classId),
          serviceRoleClient
            .from('profiles')
            .select('id, username, full_name, role')
            .eq('class_id', classId)
            .eq('role', 'STUDENT'),
          serviceRoleClient
            .from('attendance_sessions')
            .select(`
              id,
              class_id,
              session_date,
              note,
              fee_per_session,
              created_at,
              attendance_records (
                id,
                student_id,
                is_present,
                fee_amount,
                payment_status
              )
            `)
            .eq('class_id', classId)
            .order('session_date', { ascending: false }),
          serviceRoleClient
            .from('student_sessions')
            .select('id, student_id, session_date, is_paid')
            .eq('class_id', classId)
        ])

        const tuitionFee = Number(classRes.data?.tuition_fee || 0)

        const studentMap = new Map<string, any>()
        for (const sc of (scRes.data || [])) {
          const prof = (sc as any).profiles
          if (prof && prof.role === 'STUDENT') {
            studentMap.set(prof.id, {
              id: prof.id,
              username: prof.username,
              fullName: prof.full_name || prof.username,
              status: sc.status || 'ACTIVE'
            })
          }
        }
        for (const ls of (legacyRes.data || [])) {
          if (!studentMap.has(ls.id)) {
            studentMap.set(ls.id, {
              id: ls.id,
              username: ls.username,
              fullName: ls.full_name || ls.username,
              status: 'ACTIVE'
            })
          }
        }

        const totalEnrolledStudents = studentMap.size
        const attendanceSessionsData = sessionsRes.data || []
        const studentSessionsData = (studentSessionsRes.data || []).filter((ss: any) => studentMap.has(ss.student_id))

        // Collect all distinct dates from both attendance_sessions and student_sessions
        const dateMap = new Map<string, {
          sessionId: string | null,
          note: string | null,
          feePerSession: number,
          createdAt: string | null,
          studentRecords: Map<string, { isPresent: boolean, paymentStatus: string, feeAmount: number }>
        }>()

        // 1. Fill dates from attendance_sessions
        attendanceSessionsData.forEach((s: any) => {
          const fee = Number(s.fee_per_session || tuitionFee)
          const sRecMap = new Map<string, { isPresent: boolean, paymentStatus: string, feeAmount: number }>()

          const recs = (s.attendance_records || []).filter((r: any) => studentMap.has(r.student_id))
          recs.forEach((r: any) => {
            sRecMap.set(r.student_id, {
              isPresent: r.is_present === true,
              paymentStatus: r.payment_status || 'none',
              feeAmount: Number(r.fee_amount || fee)
            })
          })

          dateMap.set(s.session_date, {
            sessionId: s.id,
            note: s.note,
            feePerSession: fee,
            createdAt: s.created_at,
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
          if (!existing) {
            dateEntry.studentRecords.set(ss.student_id, {
              isPresent: true,
              paymentStatus: ss.is_paid ? 'paid' : 'unpaid',
              feeAmount: dateEntry.feePerSession
            })
          } else if (ss.is_paid && existing.paymentStatus !== 'paid') {
            existing.paymentStatus = 'paid'
          }
        })

        // Format dates into history array sorted descending by date
        const sortedDates = Array.from(dateMap.keys()).sort().reverse()
        const formatted = sortedDates.map(date => {
          const entry = dateMap.get(date)!
          const recList = Array.from(entry.studentRecords.values())
          const presentCount = recList.filter(r => r.isPresent).length
          const totalCount = totalEnrolledStudents > 0 ? totalEnrolledStudents : recList.length
          const absentCount = totalCount > presentCount ? (totalCount - presentCount) : 0
          const paidCount = recList.filter(r => r.isPresent && r.paymentStatus === 'paid').length
          const unpaidCount = recList.filter(r => r.isPresent && r.paymentStatus === 'unpaid').length
          const totalFee = recList.filter(r => r.isPresent && r.paymentStatus !== 'waived').reduce((sum, r) => sum + r.feeAmount, 0)
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

        return jsonResponse(formatted)
      }
      if (action === 'get-class-kpi-stats') {
        const classId = url.searchParams.get('classId')
        if (!classId) return errorResponse('classId is required', 400)

        // 1. Fetch Class, Students, Student Sessions, Attendance Sessions, Homeworks
        const [classRes, scRes, legacyRes, studentSessionsRes, sessionsRes, homeworksRes] = await Promise.all([
          serviceRoleClient
            .from('classes')
            .select('id, name, tuition_fee')
            .eq('id', classId)
            .single(),
          serviceRoleClient
            .from('student_classes')
            .select('student_id, status, profiles:student_id(role)')
            .eq('class_id', classId),
          serviceRoleClient
            .from('profiles')
            .select('id')
            .eq('class_id', classId)
            .eq('role', 'STUDENT'),
          serviceRoleClient
            .from('student_sessions')
            .select('id, student_id, session_date, is_paid')
            .eq('class_id', classId),
          serviceRoleClient
            .from('attendance_sessions')
            .select(`
              id,
              session_date,
              fee_per_session,
              note,
              attendance_records (
                id,
                student_id,
                is_present,
                fee_amount,
                payment_status
              )
            `)
            .eq('class_id', classId)
            .order('session_date', { ascending: false }),
          serviceRoleClient
            .from('homeworks')
            .select(`
              id,
              title,
              deadline,
              is_published,
              lessons!inner (
                chapters!inner (
                  class_id
                )
              )
            `)
            .eq('lessons.chapters.class_id', classId)
        ])

        const tuitionFee = Number(classRes.data?.tuition_fee || 0)

        // Parse student counts
        const studentMap = new Map<string, string>()
        for (const sc of (scRes.data || [])) {
          const prof = (sc as any).profiles
          if (prof && prof.role === 'STUDENT') {
            studentMap.set(sc.student_id, sc.status || 'ACTIVE')
          }
        }
        for (const ls of (legacyRes.data || [])) {
          if (!studentMap.has(ls.id)) {
            studentMap.set(ls.id, 'ACTIVE')
          }
        }

        let activeStudents = 0
        let pausedStudents = 0
        for (const st of studentMap.values()) {
          if (st === 'PAUSED') pausedStudents++
          else activeStudents++
        }
        const totalStudents = studentMap.size

        // Build unified student session map: studentId -> Map<sessionDate, { isPresent, isPaid, feeAmount }>
        const studentSessionsData = studentSessionsRes.data || []
        const attendanceSessionsData = sessionsRes.data || []

        const unifiedMap = new Map<string, Map<string, { isPresent: boolean; isPaid: boolean; feeAmount: number }>>()
        for (const sId of studentMap.keys()) {
          unifiedMap.set(sId, new Map())
        }

        // Add from student_sessions (configured via #student-details) - ONLY for students in this class
        studentSessionsData
          .filter((ss: any) => studentMap.has(ss.student_id))
          .forEach((ss: any) => {
            const sMap = unifiedMap.get(ss.student_id)
            if (sMap) {
              sMap.set(ss.session_date, {
                isPresent: true,
                isPaid: ss.is_paid === true,
                feeAmount: tuitionFee
              })
            }
          })

        // Merge from attendance_sessions & attendance_records - ONLY for students in this class
        attendanceSessionsData.forEach((as: any) => {
          const recs = as.attendance_records || []
          const fee = Number(as.fee_per_session || tuitionFee)
          recs
            .filter((r: any) => studentMap.has(r.student_id))
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

        // Parse 30-day attendance rate
        const now = new Date()
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
        const attendanceRate30Days = last30Total > 0 ? Math.round((last30Present / last30Total) * 1000) / 10 : 100

        // Parse uncollected tuition (strictly across enrolled students)
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

        // Parse latest session
        const allDates = new Set<string>()
        studentSessionsData
          .filter((ss: any) => studentMap.has(ss.student_id))
          .forEach((ss: any) => allDates.add(ss.session_date))
        attendanceSessionsData.forEach((as: any) => allDates.add(as.session_date))
        const sortedDates = Array.from(allDates).sort().reverse()
        const latestDate = sortedDates[0] || null

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
            note: attendanceSessionsData.find((as: any) => as.session_date === latestDate)?.note || null
          }
        }

        // Parse homework stats
        const classHomeworks = homeworksRes.data || []
        const nowIso = now.toISOString()
        const openHomeworks = classHomeworks.filter((h: any) => h.is_published && (!h.deadline || h.deadline >= nowIso))

        let pendingSubmissionsCount = 0
        if (openHomeworks.length > 0 && totalStudents > 0) {
          const openHwIds = openHomeworks.map((h: any) => h.id)
          const { data: subData } = await serviceRoleClient
            .from('submissions')
            .select('homework_id, student_id')
            .in('homework_id', openHwIds)
            .eq('status', 'SUBMITTED')

          const submittedSet = new Set((subData || []).map((s: any) => `${s.homework_id}|${s.student_id}`))
          openHomeworks.forEach((h: any) => {
            studentMap.forEach((_, sId) => {
              if (!submittedSet.has(`${h.id}|${sId}`)) {
                pendingSubmissionsCount++
              }
            })
          })
        }

        return jsonResponse({
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
            totalCount: classHomeworks.length,
            openCount: openHomeworks.length,
            pendingSubmissionsCount
          },
          latestSession: latestSessionInfo
        })
      }

      if (action === 'get-class-debt-summary') {
        const classId = url.searchParams.get('classId')
        if (!classId) return errorResponse('classId is required', 400)

        // 1. Get Class, Students, Student Sessions, Attendance Records
        const [classRes, scRes, legacyRes, studentSessionsRes, recordsRes] = await Promise.all([
          serviceRoleClient
            .from('classes')
            .select('id, name, tuition_fee')
            .eq('id', classId)
            .single(),
          serviceRoleClient
            .from('student_classes')
            .select('student_id, status, profiles:student_id(id, username, full_name, role)')
            .eq('class_id', classId),
          serviceRoleClient
            .from('profiles')
            .select('id, username, full_name, role')
            .eq('class_id', classId)
            .eq('role', 'STUDENT'),
          serviceRoleClient
            .from('student_sessions')
            .select('id, student_id, session_date, is_paid')
            .eq('class_id', classId),
          serviceRoleClient
            .from('attendance_records')
            .select(`
              id,
              student_id,
              is_present,
              fee_amount,
              payment_status,
              paid_at,
              attendance_sessions!inner(
                id,
                class_id,
                session_date,
                note
              )
            `)
            .eq('attendance_sessions.class_id', classId)
        ])

        const tuitionFee = Number(classRes.data?.tuition_fee || 0)

        const studentMap = new Map<string, any>()
        for (const sc of (scRes.data || [])) {
          const prof = (sc as any).profiles
          if (prof && prof.role === 'STUDENT') {
            studentMap.set(prof.id, {
              studentId: prof.id,
              username: prof.username,
              fullName: prof.full_name || prof.username,
              studentCode: `HS-${prof.username}`,
              status: sc.status || 'ACTIVE'
            })
          }
        }
        for (const ls of (legacyRes.data || [])) {
          if (!studentMap.has(ls.id)) {
            studentMap.set(ls.id, {
              studentId: ls.id,
              username: ls.username,
              fullName: ls.full_name || ls.username,
              studentCode: `HS-${ls.username}`,
              status: 'ACTIVE'
            })
          }
        }

        const studentSessionsData = studentSessionsRes.data || []
        const attendanceRecordsData = recordsRes.data || []

        // Total distinct class dates across the class
        const allClassDates = new Set<string>()
        studentSessionsData.forEach((ss: any) => allClassDates.add(ss.session_date))
        attendanceRecordsData.forEach((ar: any) => allClassDates.add((ar as any).attendance_sessions?.session_date))
        const totalClassSessionsCount = allClassDates.size

        const result = Array.from(studentMap.values()).map(s => {
          const sMap = new Map<string, any>()

          // 1. Load from student_sessions (where individual calendar dates are stored via #student-details)
          studentSessionsData
            .filter((ss: any) => ss.student_id === s.studentId)
            .forEach((ss: any) => {
              sMap.set(ss.session_date, {
                recordId: ss.id,
                sessionId: null,
                sessionDate: ss.session_date,
                sessionNote: null,
                isPresent: true,
                isPaid: ss.is_paid === true,
                feeAmount: tuitionFee,
                paymentStatus: ss.is_paid ? 'paid' : 'unpaid',
                paidAt: null,
                source: 'student_sessions'
              })
            })

          // 2. Merge from attendance_records
          attendanceRecordsData
            .filter((ar: any) => ar.student_id === s.studentId)
            .forEach((ar: any) => {
              const date = (ar as any).attendance_sessions?.session_date
              const existing = sMap.get(date)
              if (ar.is_present) {
                const isPaid = ar.payment_status === 'paid' || (existing?.isPaid ?? false)
                sMap.set(date, {
                  recordId: ar.id,
                  sessionId: (ar as any).attendance_sessions?.id,
                  sessionDate: date,
                  sessionNote: (ar as any).attendance_sessions?.note,
                  isPresent: true,
                  isPaid,
                  feeAmount: Number(ar.fee_amount || existing?.feeAmount || tuitionFee),
                  paymentStatus: isPaid ? 'paid' : (ar.payment_status === 'waived' ? 'waived' : 'unpaid'),
                  paidAt: ar.paid_at || existing?.paidAt || null,
                  source: 'attendance_records'
                })
              } else if (!existing) {
                sMap.set(date, {
                  recordId: ar.id,
                  sessionId: (ar as any).attendance_sessions?.id,
                  sessionDate: date,
                  sessionNote: (ar as any).attendance_sessions?.note,
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
          const attendedSessions = studentRecs.filter(r => r.isPresent).length
          const totalSessions = studentRecs.length
          const paidSessions = studentRecs.filter(r => r.isPresent && r.isPaid).length
          const unpaidSessions = studentRecs.filter(r => r.isPresent && !r.isPaid && r.paymentStatus !== 'waived').length
          const waivedSessions = studentRecs.filter(r => r.isPresent && r.paymentStatus === 'waived').length
          const unpaidDebt = studentRecs
            .filter(r => r.isPresent && !r.isPaid && r.paymentStatus !== 'waived')
            .reduce((sum, r) => sum + r.feeAmount, 0)

          const attendanceRate = totalClassSessionsCount > 0 ? Math.round((attendedSessions / totalClassSessionsCount) * 100) : 100

          const paidAmount = studentRecs
            .filter(r => r.isPresent && r.isPaid)
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

        return jsonResponse(result)
      }

      if (user.role === 'ADMIN') {
        const { data: classes, error } = await serviceRoleClient
          .from('classes')
          .select(`
            *,
            student_classes (
              student_id
            )
          `)
          .order('created_at', { ascending: false })

        if (error) return errorResponse(error.message, 500)
        
        const formatted = (classes || []).map(c => {
          const { student_classes, ...rest } = c
          return {
            ...rest,
            gradeBlock: c.grade_block || '12-Toán',
            tuitionFee: c.tuition_fee ? Number(c.tuition_fee) : 0,
            studentsCount: student_classes ? student_classes.length : 0
          }
        })
        return jsonResponse(formatted)
      } else {
        // STUDENT: Use user.classIds from requireAuth context
        const enrolledClassIds = user.classIds || []
        if (enrolledClassIds.length === 0) {
          return jsonResponse([])
        }

        const { data: studentClasses, error } = await serviceRoleClient
          .from('classes')
          .select(`
            *,
            student_classes (
              student_id
            )
          `)
          .in('id', enrolledClassIds)

        if (error) return jsonResponse([])
        
        const formatted = (studentClasses || []).map(c => {
          const { student_classes, ...rest } = c
          return {
            ...rest,
            gradeBlock: c.grade_block || '12-Toán',
            tuitionFee: c.tuition_fee ? Number(c.tuition_fee) : 0,
            studentsCount: student_classes ? student_classes.length : 0
          }
        })
        return jsonResponse(formatted)
      }
    }

    // Role Guard: Write Operations (POST, PUT, DELETE) are Admin-only
    if (user.role !== 'ADMIN') {
      return errorResponse('Forbidden: Only admins can manage classes', 403)
    }

    // POST: Create Class or Set Sessions
    if (req.method === 'POST') {
      if (action === 'set-sessions') {
        const body = await req.json()
        const { classId, sessionDates, month } = body // sessionDates: array of 'YYYY-MM-DD'
        if (!classId || !Array.isArray(sessionDates) || !month) {
          return errorResponse('classId, month and sessionDates are required', 400)
        }
        
        const startDate = `${month}-01`
        const [year, m] = month.split('-').map(Number)
        const endDate = `${year}-${String(m).padStart(2, '0')}-${String(new Date(year, m, 0).getDate()).padStart(2, '0')}`
        
        const { error: deleteError } = await serviceRoleClient
          .from('class_sessions')
          .delete()
          .eq('class_id', classId)
          .gte('session_date', startDate)
          .lte('session_date', endDate)
          
        if (deleteError) return errorResponse(deleteError.message, 500)
        
        if (sessionDates.length > 0) {
          const inserts = sessionDates.map(date => ({
            class_id: classId,
            session_date: date
          }))
          const { error: insertError } = await serviceRoleClient
            .from('class_sessions')
            .insert(inserts)
            
          if (insertError) return errorResponse(insertError.message, 500)
        }
        
        return jsonResponse({ message: 'Sessions updated successfully' })
      }

      if (action === 'set-student-sessions') {
        const body = await req.json()
        const { studentId, classId, sessionDates, month } = body
        if (!studentId || !classId || !Array.isArray(sessionDates) || !month) {
          return errorResponse('studentId, classId, month and sessionDates are required', 400)
        }
        
        const startDate = `${month}-01`
        const [year, m] = month.split('-').map(Number)
        const endDate = `${year}-${String(m).padStart(2, '0')}-${String(new Date(year, m, 0).getDate()).padStart(2, '0')}`
        
        const { error: deleteError } = await serviceRoleClient
          .from('student_sessions')
          .delete()
          .eq('student_id', studentId)
          .eq('class_id', classId)
          .gte('session_date', startDate)
          .lte('session_date', endDate)
          
        if (deleteError) return errorResponse(deleteError.message, 500)
        
        if (sessionDates.length > 0) {
          const inserts = sessionDates.map((s: any) => {
            if (typeof s === 'string') {
              return {
                student_id: studentId,
                class_id: classId,
                session_date: s,
                is_paid: false
              }
            }
            const isPaidVal = s.isPaid === true || s.isPaid === 'true' || s.is_paid === true || s.is_paid === 'true'
            return {
              student_id: studentId,
              class_id: classId,
              session_date: s.date,
              is_paid: isPaidVal
            }
          })
          const { error: insertError } = await serviceRoleClient
            .from('student_sessions')
            .insert(inserts)
            
          if (insertError) return errorResponse(insertError.message, 500)
        }
        
        return jsonResponse({ message: 'Student sessions updated successfully' })
      }

      if (action === 'save-attendance') {
        const body = await req.json()
        const { classId, sessionDate, note, records, sendTelegram } = body

        if (!classId || !sessionDate || !Array.isArray(records)) {
          return errorResponse('classId, sessionDate and records array are required', 400)
        }

        // 1. Try atomic PostgreSQL RPC first
        let sessionResult: any = null

        const { data: rpcData, error: rpcErr } = await serviceRoleClient.rpc('fn_save_attendance', {
          p_class_id: classId,
          p_session_date: sessionDate,
          p_note: note || null,
          p_records: records.map((r: any) => ({
            student_id: r.studentId,
            is_present: r.isPresent === true
          })),
          p_created_by: user.id
        })

        if (!rpcErr && rpcData?.success) {
          sessionResult = rpcData
        } else {
          // JS Fallback in case RPC is not yet created in remote DB
          const { data: cls } = await serviceRoleClient
            .from('classes')
            .select('tuition_fee')
            .eq('id', classId)
            .single()

          const tuitionFee = Number(cls?.tuition_fee || 0)

          // Upsert attendance_sessions
          const { data: existingSession } = await serviceRoleClient
            .from('attendance_sessions')
            .select('id, fee_per_session')
            .eq('class_id', classId)
            .eq('session_date', sessionDate)
            .maybeSingle()

          let sessionId = existingSession?.id
          let feePerSession = existingSession ? Number(existingSession.fee_per_session) : tuitionFee

          if (sessionId) {
            await serviceRoleClient
              .from('attendance_sessions')
              .update({ note: note || null, updated_at: new Date().toISOString() })
              .eq('id', sessionId)
          } else {
            const { data: newSess, error: sessErr } = await serviceRoleClient
              .from('attendance_sessions')
              .insert({
                class_id: classId,
                session_date: sessionDate,
                note: note || null,
                fee_per_session: feePerSession,
                created_by: user.id
              })
              .select('id')
              .single()

            if (sessErr) return errorResponse(sessErr.message, 500)
            sessionId = newSess.id
          }

          // Sync class_sessions
          await serviceRoleClient
            .from('class_sessions')
            .upsert({ class_id: classId, session_date: sessionDate }, { onConflict: 'class_id,session_date' })

          // Upsert records
          for (const r of records) {
            const isPresent = r.isPresent === true
            const studentId = r.studentId

            // Check existing record
            const { data: existingRec } = await serviceRoleClient
              .from('attendance_records')
              .select('payment_status, paid_at')
              .eq('session_id', sessionId)
              .eq('student_id', studentId)
              .maybeSingle()

            let status = 'none'
            let fee = 0
            let paidAt = null

            if (isPresent) {
              fee = feePerSession
              if (existingRec?.payment_status === 'paid') {
                status = 'paid'
                paidAt = existingRec.paid_at
              } else if (existingRec?.payment_status === 'waived') {
                status = 'waived'
              } else {
                status = 'unpaid'
              }

              // Sync student_sessions
              await serviceRoleClient
                .from('student_sessions')
                .upsert({
                  student_id: studentId,
                  class_id: classId,
                  session_date: sessionDate,
                  is_paid: status === 'paid'
                }, { onConflict: 'student_id,class_id,session_date' })
            } else {
              // Delete from student_sessions
              await serviceRoleClient
                .from('student_sessions')
                .delete()
                .eq('student_id', studentId)
                .eq('class_id', classId)
                .eq('session_date', sessionDate)
            }

            await serviceRoleClient
              .from('attendance_records')
              .upsert({
                session_id: sessionId,
                student_id: studentId,
                is_present: isPresent,
                fee_amount: fee,
                payment_status: status,
                paid_at: paidAt,
                updated_at: new Date().toISOString()
              }, { onConflict: 'session_id,student_id' })
          }

          sessionResult = {
            success: true,
            sessionId,
            sessionDate,
            feePerSession,
            presentCount: records.filter((r: any) => r.isPresent).length,
            absentCount: records.filter((r: any) => !r.isPresent).length
          }
        }

        // Send Telegram notification if enabled
        if (sendTelegram !== false) {
          const presentCount = records.filter((r: any) => r.isPresent).length
          const totalCount = records.length
          const absentIds = records.filter((r: any) => !r.isPresent).map((r: any) => r.studentId)
          
          let absentNames: string[] = []
          if (absentIds.length > 0) {
            const { data: absentProfiles } = await serviceRoleClient
              .from('profiles')
              .select('full_name, username')
              .in('id', absentIds)

            absentNames = (absentProfiles || []).map((p: any) => p.full_name || p.username)
          }

          sendTelegramAttendanceNotification(
            serviceRoleClient,
            classId,
            sessionDate,
            presentCount,
            totalCount,
            absentNames,
            note
          ).catch((e: any) => console.warn('[create-class] Telegram notification error:', e))
        }

        return jsonResponse(sessionResult)
      }

      if (action === 'mark-tuition-paid') {
        const body = await req.json()
        const { recordIds, status, classId, studentId, sessionDate } = body

        const newStatus = status || 'paid'
        const isPaid = newStatus === 'paid'
        const paidAt = isPaid ? new Date().toISOString() : null

        // 1. If specific student session by date
        if (classId && studentId && sessionDate) {
          await serviceRoleClient
            .from('student_sessions')
            .update({ is_paid: isPaid })
            .eq('student_id', studentId)
            .eq('class_id', classId)
            .eq('session_date', sessionDate)

          const { data: recs } = await serviceRoleClient
            .from('attendance_records')
            .select('id, attendance_sessions!inner(class_id, session_date)')
            .eq('attendance_sessions.class_id', classId)
            .eq('attendance_sessions.session_date', sessionDate)
            .eq('student_id', studentId)

          if (recs && recs.length > 0) {
            await serviceRoleClient
              .from('attendance_records')
              .update({
                payment_status: newStatus,
                paid_at: paidAt,
                updated_at: new Date().toISOString()
              })
              .in('id', recs.map((r: any) => r.id))
          }

          return jsonResponse({ success: true })
        }

        // 2. If entire class
        if (classId && !studentId && (!recordIds || recordIds.length === 0)) {
          await serviceRoleClient
            .from('student_sessions')
            .update({ is_paid: isPaid })
            .eq('class_id', classId)
            .eq('is_paid', !isPaid)

          const { data: recs } = await serviceRoleClient
            .from('attendance_records')
            .select('id, attendance_sessions!inner(class_id)')
            .eq('attendance_sessions.class_id', classId)
            .eq('payment_status', 'unpaid')

          if (recs && recs.length > 0) {
            await serviceRoleClient
              .from('attendance_records')
              .update({
                payment_status: newStatus,
                paid_at: paidAt,
                updated_at: new Date().toISOString()
              })
              .in('id', recs.map((r: any) => r.id))
          }

          return jsonResponse({ success: true })
        }

        // 3. If recordIds array
        if (Array.isArray(recordIds) && recordIds.length > 0) {
          const { error: updErr } = await serviceRoleClient
            .from('attendance_records')
            .update({
              payment_status: newStatus,
              paid_at: paidAt,
              updated_at: new Date().toISOString()
            })
            .in('id', recordIds)

          if (updErr) return errorResponse(updErr.message, 500)

          const { data: affectedRecords } = await serviceRoleClient
            .from('attendance_records')
            .select('student_id, attendance_sessions!inner(class_id, session_date)')
            .in('id', recordIds)

          for (const r of (affectedRecords || [])) {
            const sess = (r as any).attendance_sessions
            if (sess) {
              await serviceRoleClient
                .from('student_sessions')
                .update({ is_paid: isPaid })
                .eq('student_id', r.student_id)
                .eq('class_id', sess.class_id)
                .eq('session_date', sess.session_date)
            }
          }

          return jsonResponse({ success: true, updatedCount: recordIds.length })
        }

        return errorResponse('Invalid parameters for mark-tuition-paid', 400)
      }

      if (action === 'mark-student-tuition-paid') {
        const body = await req.json()
        const { classId, studentId } = body
        if (!classId || !studentId) return errorResponse('classId and studentId are required', 400)

        // 1. Always update all unpaid student_sessions for this student in this class
        await serviceRoleClient
          .from('student_sessions')
          .update({ is_paid: true })
          .eq('student_id', studentId)
          .eq('class_id', classId)
          .eq('is_paid', false)

        // 2. Also update attendance_records if any exist
        const { data: unpaidRecords } = await serviceRoleClient
          .from('attendance_records')
          .select('id, attendance_sessions!inner(class_id)')
          .eq('attendance_sessions.class_id', classId)
          .eq('student_id', studentId)
          .eq('is_present', true)
          .eq('payment_status', 'unpaid')

        const recIds = (unpaidRecords || []).map((r: any) => r.id)
        if (recIds.length > 0) {
          await serviceRoleClient
            .from('attendance_records')
            .update({
              payment_status: 'paid',
              paid_at: new Date().toISOString(),
              updated_at: new Date().toISOString()
            })
            .in('id', recIds)
        }

        return jsonResponse({ success: true, updatedCount: recIds.length })
      }

      if (action === 'update-student-class-status') {
        const body = await req.json()
        const { classId, studentId, status } = body
        if (!classId || !studentId || !['ACTIVE', 'PAUSED'].includes(status)) {
          return errorResponse('classId, studentId and valid status (ACTIVE/PAUSED) are required', 400)
        }

        const { error } = await serviceRoleClient
          .from('student_classes')
          .update({ status })
          .eq('class_id', classId)
          .eq('student_id', studentId)

        if (error) return errorResponse(error.message, 500)
        return jsonResponse({ success: true, status })
      }

      if (action === 'add-student-to-class') {
        const body = await req.json()
        const { classId, studentId } = body
        if (!classId || !studentId) return errorResponse('classId and studentId are required', 400)

        // Upsert into student_classes
        const { error: joinErr } = await serviceRoleClient
          .from('student_classes')
          .upsert({
            class_id: classId,
            student_id: studentId,
            status: 'ACTIVE'
          }, { onConflict: 'student_id,class_id' })

        if (joinErr) return errorResponse(joinErr.message, 500)

        // Also update profiles.class_id if currently null
        await serviceRoleClient
          .from('profiles')
          .update({ class_id: classId, updated_at: new Date().toISOString() })
          .eq('id', studentId)
          .is('class_id', null)

        return jsonResponse({ success: true, message: 'Student added to class successfully' })
      }

      if (action === 'archive-class') {
        const body = await req.json()
        const { classId, isArchived } = body
        if (!classId) return errorResponse('classId is required', 400)

        const { error } = await serviceRoleClient
          .from('classes')
          .update({
            is_archived: isArchived === true,
            updated_at: new Date().toISOString()
          })
          .eq('id', classId)

        if (error) return errorResponse(error.message, 500)
        return jsonResponse({ success: true, isArchived: isArchived === true })
      }

      if (action === 'remove-student' || action === 'remove-student-from-class') {
        const body = await req.json()
        const validation = removeStudentFromClassSchema.safeParse(body)
        if (!validation.success) {
          return errorResponse('Validation error', 400, validation.error.format())
        }

        const { classId, studentId } = validation.data

        // 1. Delete relationship from student_classes
        const { error: deleteJoinError } = await serviceRoleClient
          .from('student_classes')
          .delete()
          .eq('student_id', studentId)
          .eq('class_id', classId)

        if (deleteJoinError) {
          return errorResponse(deleteJoinError.message, 500)
        }

        // 2. Query remaining classes for this student
        const { data: remainingClasses } = await serviceRoleClient
          .from('student_classes')
          .select('class_id')
          .eq('student_id', studentId)

        const remainingClassId = remainingClasses && remainingClasses.length > 0
          ? remainingClasses[0].class_id
          : null

        // 3. Update profile's fallback class_id
        await serviceRoleClient
          .from('profiles')
          .update({
            class_id: remainingClassId,
            updated_at: new Date().toISOString()
          })
          .eq('id', studentId)

        return jsonResponse({
          message: 'Student removed from class successfully',
          studentId,
          classId,
          remainingClassIds: (remainingClasses || []).map((r: any) => r.class_id)
        })
      }

      if (action === 'create-grade-block') {
        const body = await req.json()
        const name = (body.name || '').trim()
        const description = (body.description || '').trim() || null

        if (!name) {
          return errorResponse('Tên khối không được để trống', 400)
        }

        const { data: created, error: createErr } = await serviceRoleClient
          .from('grade_blocks')
          .insert({ name, description })
          .select()
          .single()

        if (createErr) {
          if (createErr.code === '23505') {
            return errorResponse(`Khối "${name}" đã tồn tại trong hệ thống!`, 400)
          }
          return errorResponse(createErr.message, 500)
        }

        return jsonResponse(created, 201)
      }

      // Create Class
      if (!action || action === 'create') {
        const body = await req.json()
        const validation = createClassSchema.safeParse(body)
        if (!validation.success) {
          return errorResponse('Validation error', 400, validation.error.format())
        }

        const { name, description, tuitionFee, gradeBlock } = validation.data

        const { data: newClass, error } = await serviceRoleClient
          .from('classes')
          .insert({
            name,
            description: description || null,
            tuition_fee: tuitionFee || 0,
            grade_block: gradeBlock || '12-Toán',
          })
          .select()
          .single()

        if (error) return errorResponse(error.message, 500)
        return jsonResponse({
          ...newClass,
          gradeBlock: newClass.grade_block || '12-Toán',
          tuitionFee: newClass.tuition_fee ? Number(newClass.tuition_fee) : 0
        }, 201)
      }
    }

    // PUT / PATCH: Update Class, Grade Block, or Telegram Config
    if (req.method === 'PUT' || req.method === 'PATCH' || action === 'update' || action === 'update-telegram-config' || action === 'update-grade-block') {
      if (action === 'update-grade-block') {
        const body = await req.json()
        const id = body.id
        const name = (body.name || '').trim()
        const description = body.description !== undefined ? (body.description || '').trim() : undefined

        if (!id || !name) {
          return errorResponse('ID và tên khối là bắt buộc', 400)
        }

        const { data: oldBlock, error: getErr } = await serviceRoleClient
          .from('grade_blocks')
          .select('*')
          .eq('id', id)
          .single()

        if (getErr || !oldBlock) {
          return errorResponse('Khối học không tồn tại', 404)
        }

        const updateData: Record<string, unknown> = { updated_at: new Date().toISOString() }
        if (name) updateData.name = name
        if (description !== undefined) updateData.description = description || null

        const { data: updated, error: updateErr } = await serviceRoleClient
          .from('grade_blocks')
          .update(updateData)
          .eq('id', id)
          .select()
          .single()

        if (updateErr) {
          if (updateErr.code === '23505') {
            return errorResponse(`Tên khối "${name}" đã được sử dụng!`, 400)
          }
          return errorResponse(updateErr.message, 500)
        }

        // If name changed, cascade update to classes and question_bank!
        if (oldBlock.name !== name) {
          await serviceRoleClient
            .from('classes')
            .update({ grade_block: name })
            .eq('grade_block', oldBlock.name)

          await serviceRoleClient
            .from('question_bank')
            .update({ grade_block: name })
            .eq('grade_block', oldBlock.name)
        }

        return jsonResponse(updated)
      }
      if (action === 'update-telegram-config') {
        const body = await req.json()
        const { classId, chatId, chatTitle, isEnabled } = body
        if (!classId || !chatId) {
          return errorResponse('classId and chatId are required', 400)
        }

        const { data, error } = await serviceRoleClient
          .from('telegram_configs')
          .upsert(
            {
              class_id: classId,
              chat_id: chatId,
              chat_title: chatTitle || null,
              is_enabled: isEnabled ?? true,
            },
            { onConflict: 'class_id' }
          )
          .select()
          .single()

        if (error) return errorResponse(error.message, 500)
        return jsonResponse(data)
      }

      const body = await req.json()
      const validation = updateClassSchema.safeParse(body)
      if (!validation.success) {
        return errorResponse('Validation error', 400, validation.error.format())
      }

      const { classId, name, description, tuitionFee, gradeBlock } = validation.data
      const updateData: Record<string, unknown> = { updated_at: new Date().toISOString() }
      if (name) updateData.name = name
      if (description !== undefined) updateData.description = description
      if (tuitionFee !== undefined) updateData.tuition_fee = tuitionFee
      if (gradeBlock !== undefined) updateData.grade_block = gradeBlock

      const { data: updatedClass, error } = await serviceRoleClient
        .from('classes')
        .update(updateData)
        .eq('id', classId)
        .select()
        .single()

      if (error) return errorResponse(error.message, 500)
      return jsonResponse({
        ...updatedClass,
        gradeBlock: updatedClass.grade_block || '12-Toán',
        tuitionFee: updatedClass.tuition_fee ? Number(updatedClass.tuition_fee) : 0
      })
    }

    if (req.method === 'DELETE' || action === 'delete' || action === 'delete-telegram-config' || action === 'delete-grade-block' || action === 'remove-student' || action === 'remove-student-from-class') {
      if (action === 'remove-student' || action === 'remove-student-from-class') {
        const body = await req.json().catch(() => ({}))
        const classId = url.searchParams.get('classId') || body.classId
        const studentId = url.searchParams.get('studentId') || body.studentId

        const validation = removeStudentFromClassSchema.safeParse({ classId, studentId })
        if (!validation.success) {
          return errorResponse('Validation error', 400, validation.error.format())
        }

        // 1. Delete relationship from student_classes
        const { error: deleteJoinError } = await serviceRoleClient
          .from('student_classes')
          .delete()
          .eq('student_id', studentId)
          .eq('class_id', classId)

        if (deleteJoinError) {
          return errorResponse(deleteJoinError.message, 500)
        }

        // 2. Query remaining classes for this student
        const { data: remainingClasses } = await serviceRoleClient
          .from('student_classes')
          .select('class_id')
          .eq('student_id', studentId)

        const remainingClassId = remainingClasses && remainingClasses.length > 0
          ? remainingClasses[0].class_id
          : null

        // 3. Update profile's fallback class_id
        await serviceRoleClient
          .from('profiles')
          .update({
            class_id: remainingClassId,
            updated_at: new Date().toISOString()
          })
          .eq('id', studentId)

        return jsonResponse({
          message: 'Student removed from class successfully',
          studentId,
          classId,
          remainingClassIds: (remainingClasses || []).map((r: any) => r.class_id)
        })
      }

      if (action === 'delete-grade-block') {
        const blockId = url.searchParams.get('id')
        if (!blockId) return errorResponse('ID khối là bắt buộc', 400)

        const { data: targetBlock } = await serviceRoleClient
          .from('grade_blocks')
          .select('name')
          .eq('id', blockId)
          .single()

        if (targetBlock) {
          const { count } = await serviceRoleClient
            .from('classes')
            .select('id', { count: 'exact', head: true })
            .eq('grade_block', targetBlock.name)

          if (count && count > 0) {
            return errorResponse(`Không thể xóa khối "${targetBlock.name}" vì đang có ${count} lớp học thuộc khối này!`, 400)
          }
        }

        const { error: delErr } = await serviceRoleClient
          .from('grade_blocks')
          .delete()
          .eq('id', blockId)

        if (delErr) return errorResponse(delErr.message, 500)
        return jsonResponse({ message: 'Xóa khối thành công' })
      }

      if (action === 'delete-telegram-config') {
        const classId = url.searchParams.get('classId')
        if (!classId) return errorResponse('Class ID is required', 400)

        const { error } = await serviceRoleClient
          .from('telegram_configs')
          .delete()
          .eq('class_id', classId)

        if (error) return errorResponse(error.message, 500)
        return jsonResponse({ message: 'Telegram config deleted successfully' })
      }

      if (action === 'delete-attendance-session') {
        const sessionId = url.searchParams.get('sessionId')
        const classId = url.searchParams.get('classId')
        const sessionDate = url.searchParams.get('sessionDate')

        if (!sessionId && (!classId || !sessionDate)) {
          return errorResponse('sessionId or (classId and sessionDate) is required', 400)
        }

        let targetClassId = classId
        let targetDate = sessionDate

        if (sessionId && !sessionId.startsWith('session-')) {
          const { data: session } = await serviceRoleClient
            .from('attendance_sessions')
            .select('class_id, session_date')
            .eq('id', sessionId)
            .maybeSingle()

          if (session) {
            targetClassId = session.class_id
            targetDate = session.session_date
          }

          await serviceRoleClient
            .from('attendance_sessions')
            .delete()
            .eq('id', sessionId)
        }

        if (targetClassId && targetDate) {
          // Clean up class_sessions and student_sessions for that day
          await serviceRoleClient
            .from('class_sessions')
            .delete()
            .eq('class_id', targetClassId)
            .eq('session_date', targetDate)

          await serviceRoleClient
            .from('student_sessions')
            .delete()
            .eq('class_id', targetClassId)
            .eq('session_date', targetDate)

          await serviceRoleClient
            .from('attendance_sessions')
            .delete()
            .eq('class_id', targetClassId)
            .eq('session_date', targetDate)
        }

        return jsonResponse({ message: 'Attendance session deleted successfully' })
      }

      const body = await req.json().catch(() => ({}))
      const classIdQuery = url.searchParams.get('classId') || body.classId

      const validation = deleteClassSchema.safeParse({ classId: classIdQuery })
      if (!validation.success) {
        return errorResponse('Validation error', 400, validation.error.format())
      }

      const { classId } = validation.data

      const { error } = await serviceRoleClient
        .from('classes')
        .delete()
        .eq('id', classId)

      if (error) return errorResponse(error.message, 500)
      return jsonResponse({ message: 'Class deleted successfully', classId })
    }

    return errorResponse('Method not allowed', 405)
  } catch (err: unknown) {
    const error = err as Error
    return errorResponse(error.message || 'Unauthorized / Error', 401)
  }
})

async function sendTelegramAttendanceNotification(
  serviceRoleClient: any,
  classId: string,
  sessionDate: string,
  presentCount: number,
  totalCount: number,
  absentNames: string[],
  note?: string
) {
  try {
    const { data: config } = await serviceRoleClient
      .from('telegram_configs')
      .select('chat_id, is_enabled')
      .eq('class_id', classId)
      .maybeSingle()

    if (!config || !config.is_enabled || !config.chat_id) return

    const { data: cls } = await serviceRoleClient
      .from('classes')
      .select('name')
      .eq('id', classId)
      .maybeSingle()

    const className = cls?.name || 'Lớp học'
    const botToken = Deno.env.get('TELEGRAM_BOT_TOKEN')
    if (!botToken) return

    const [y, m, d] = sessionDate.split('-')
    const formattedDate = `${d}/${m}/${y}`
    const percent = totalCount > 0 ? Math.round((presentCount / totalCount) * 100) : 0

    let text = `📋 <b>THÔNG BÁO ĐIỂM DANH BUỔI HỌC</b>\n`
    text += `🏫 <b>Lớp:</b> ${escapeHtmlForTg(className)}\n`
    text += `📅 <b>Ngày học:</b> ${formattedDate}\n`
    text += `👥 <b>Sĩ số có mặt:</b> ${presentCount}/${totalCount} (${percent}%)\n`
    if (absentNames.length > 0) {
      text += `❌ <b>Vắng mặt (${absentNames.length}):</b> ${absentNames.map(escapeHtmlForTg).join(', ')}\n`
    }
    if (note && note.trim()) {
      text += `📝 <b>Ghi chú:</b> ${escapeHtmlForTg(note.trim())}\n`
    }

    await fetch(`https://api.telegram.org/bot${botToken}/sendMessage`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        chat_id: config.chat_id,
        text,
        parse_mode: 'HTML',
        disable_web_page_preview: true
      })
    })
  } catch (err) {
    console.warn('[create-class] Failed to send Telegram attendance notification:', err)
  }
}

function escapeHtmlForTg(str: string) {
  return String(str || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
}

