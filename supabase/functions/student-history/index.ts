import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { handleCors, jsonResponse, errorResponse } from '../../shared/response-helper.ts'
import { requireAuth } from '../../shared/auth-middleware.ts'
import { createServiceRoleClient } from '../../shared/supabase-client.ts'
import { QUESTION_AWARD_LOG_SELECT, mapQuestionAwardLogRow } from '../../shared/question-award-logs.ts'
import { resolveWrongQuestionType, isBlankWrongAnswer, loadAllAnalysisRows, loadChunkedWrongAnalysis, ANALYSIS_SUBMISSION_CHUNK_SIZE, uniqueWrongAttempts } from './wrong-analysis.ts'

/* ---------------------------------------------------------------------------
 * Public shared progress report (scope=shared-report)
 *
 * Token công khai có dạng `<shareId>.<secret>`:
 * - shareId là UUID của row student_report_shares.
 * - secret là 32 byte ngẫu nhiên (256-bit), base64url không padding (43 ký tự).
 * - DB chỉ lưu SHA-256(secret) dạng hex; raw token không bao giờ được lưu/log.
 *
 * Nhánh này là nhánh DUY NHẤT của student-history được phép không Authorization.
 * Mọi tham số studentId/classId/fromDate/toDate do client gửi đều bị bỏ qua:
 * học sinh/lớp/kỳ báo cáo lấy hoàn toàn từ row share trong DB.
 * ------------------------------------------------------------------------- */
const SHARE_TOKEN_RE = /^([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})\.([A-Za-z0-9_-]{43})$/

// Giới hạn số dòng nhật ký cộng điểm câu trả về cho danh sách admin (current page):
// đủ cho 100 submission/page × nhiều lần cộng, tránh payload phình bất thường.
const AWARD_LOGS_LIST_LIMIT = 500

type SharedReportShare = {
  id: string
  student_id: string
  class_id: string
  from_date: string
  to_date: string
  created_by: string
  expires_at: string
  revoked_at: string | null
  token_secret_hash: string
}

async function sha256Hex(input: string): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(input))
  return Array.from(new Uint8Array(digest))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('')
}

/** So sánh hash dạng hex theo thời gian hằng số (không dùng === cho secret). */
function constantTimeEqualHex(a: string, b: string): boolean {
  if (typeof a !== 'string' || typeof b !== 'string' || a.length !== b.length) return false
  let diff = 0
  for (let i = 0; i < a.length; i += 1) {
    diff |= a.charCodeAt(i) ^ b.charCodeAt(i)
  }
  return diff === 0
}

async function resolveSharedReport(
  client: any,
  rawToken: string
): Promise<{ ok: true; share: SharedReportShare } | { ok: false; status: number; message: string }> {
  const token = (rawToken || '').trim()
  if (!token) {
    return { ok: false, status: 400, message: 'Missing shareToken' }
  }

  // Parse chặt: đúng 1 dấu chấm, shareId UUID, secret đúng 43 ký tự base64url.
  const match = SHARE_TOKEN_RE.exec(token)
  if (!match) {
    return { ok: false, status: 400, message: 'Invalid share token format' }
  }

  const shareId = match[1].toLowerCase()
  const secret = match[2]

  const { data, error } = await client
    .from('student_report_shares')
    .select('id, student_id, class_id, from_date, to_date, created_by, expires_at, revoked_at, token_secret_hash')
    .eq('id', shareId)
    .maybeSingle()

  if (error) {
    // Fail closed + generic: ke ca khi loi la thieu bang (migration chua apply,
    // PostgREST báo thiếu bảng (schema cache)), public KHONG duoc biet trang thai setup hay ten relation.
    // Khac voi function admin (503 SETUP_REQUIRED), nhanh public co y khong phan biet.
    return { ok: false, status: 500, message: 'Failed to resolve report share' }
  }
  if (!data || !data.token_secret_hash) {
    return { ok: false, status: 404, message: 'Report link is invalid or no longer available' }
  }

  const providedHash = await sha256Hex(secret)
  if (!constantTimeEqualHex(providedHash, String(data.token_secret_hash))) {
    // Không phân biệt "share không tồn tại" và "secret sai" để tránh dò token.
    return { ok: false, status: 404, message: 'Report link is invalid or no longer available' }
  }

  if (data.revoked_at) {
    return { ok: false, status: 410, message: 'Report link has been revoked' }
  }
  const expiresMs = new Date(data.expires_at).getTime()
  if (!Number.isFinite(expiresMs) || expiresMs <= Date.now()) {
    return { ok: false, status: 410, message: 'Report link has expired' }
  }

  // Fail closed: ghi danh bị xóa sau khi tạo share thì link ngừng hoạt động.
  const { data: enrollment, error: enrollErr } = await client
    .from('student_classes')
    .select('student_id, class_id')
    .eq('student_id', data.student_id)
    .eq('class_id', data.class_id)
    .maybeSingle()
  if (enrollErr) {
    return { ok: false, status: 500, message: 'Failed to verify enrollment' }
  }
  if (!enrollment) {
    return { ok: false, status: 404, message: 'Report link is invalid or no longer available' }
  }

  return { ok: true, share: data as SharedReportShare }
}

serve(async (req: Request) => {
  const corsRes = handleCors(req)
  if (corsRes) return corsRes

  try {
    if (req.method !== 'GET') {
      return errorResponse('Method not allowed', 405)
    }

    const url = new URL(req.url)
    const studentId = url.searchParams.get('studentId')
    const classId = url.searchParams.get('classId')
    const submissionId = url.searchParams.get('submissionId')
    const homeworkId = url.searchParams.get('homeworkId')
    const scope = url.searchParams.get('scope') // 'CLASS' | 'TRIAL' | 'REPORT' | 'SHARED-REPORT'
    const normalizedScope = (scope || '').trim().toUpperCase()
    const isReportQuery = normalizedScope === 'REPORT'
    const isSharedReportQuery = normalizedScope === 'SHARED-REPORT'
    // Nhánh public không dùng chút nào tới trial/submission/query ids.
    const isTrialQuery = !isSharedReportQuery &&
      (scope === 'TRIAL' || url.searchParams.get('isTrial') === 'true' || classId === 'TRIAL')
    const guestPhone = url.searchParams.get('phone') || url.searchParams.get('guestPhone')

    const authHeader = req.headers.get('Authorization')
    let user: any = null
    let serviceRoleClient = createServiceRoleClient()
    let sharedReportContext: SharedReportShare | null = null
    let sharedStudentName = ''
    let sharedClassName = ''

    // Public shared report: xử lý TRƯỚC auth. Chỉ nhánh này được phép không Authorization.
    // Token/query không hợp lệ đều fail closed, không đọc dữ liệu báo cáo.
    if (isSharedReportQuery) {
      const resolved = await resolveSharedReport(serviceRoleClient, url.searchParams.get('shareToken') || '')
      if (resolved.ok === false) {
        return errorResponse(resolved.message, resolved.status)
      }
      sharedReportContext = resolved.share

      const [profileRes, classRes] = await Promise.all([
        serviceRoleClient
          .from('profiles')
          .select('full_name')
          .eq('id', resolved.share.student_id)
          .maybeSingle(),
        serviceRoleClient
          .from('classes')
          .select('name')
          .eq('id', resolved.share.class_id)
          .maybeSingle(),
      ])
      if (profileRes.error || classRes.error) {
        return errorResponse('Failed to load shared report metadata', 500)
      }
      if (!profileRes.data || !classRes.data) {
        // FK đã cascade khi xóa học sinh/lớp; đây là lớp phòng thủ cuối.
        return errorResponse('Report link is invalid or no longer available', 404)
      }
      sharedStudentName = String(profileRes.data.full_name || '').trim()
      sharedClassName = String(classRes.data.name || '').trim()
    }

    // Authenticated scopes giữ nguyên hành vi cũ. Public shared report bỏ qua hoàn toàn auth.
    if (!isSharedReportQuery) {
      if (authHeader) {
        try {
          const authRes = await requireAuth(req)
          user = authRes.user
          serviceRoleClient = authRes.serviceRoleClient
        } catch (e) {
          if (!isTrialQuery && !submissionId) {
            throw e
          }
        }
      } else if (!isTrialQuery && !submissionId) {
        return errorResponse('Unauthorized: Missing token', 401)
      }
    }

    if (user?.role === 'ADMIN') {
      // Auto-cleanup: ensure formal student submissions are never marked as trial
      serviceRoleClient
        .from('submissions')
        .update({ is_trial: false, guest_name: null, guest_phone: null })
        .not('student_id', 'is', null)
        .eq('is_trial', true)
        .then(() => {})
        .catch(() => {})
    }

    // 0.5 Progress Report (scope=report | shared-report)
    // Cả hai scope dùng CHUNG logic bên dưới để KPI không bị lệch.
    if (isReportQuery || isSharedReportQuery) {
      const shared = isSharedReportQuery ? sharedReportContext : null
      if (isSharedReportQuery && !shared) {
        return errorResponse('Report link is invalid or no longer available', 404)
      }

      // Public scope: ngày lấy từ row share, BỎ QUA fromDate/toDate client gửi.
      const fromDate = shared ? shared.from_date : url.searchParams.get('fromDate')
      const toDate = shared ? shared.to_date : url.searchParams.get('toDate')

      if (!fromDate || !toDate) {
        return errorResponse('Missing report period: fromDate and toDate are required (format: YYYY-MM-DD)', 400)
      }

      // Kiểm tra ngày theo lịch thật: Date.UTC() tự "lăn" 2026-02-30 -> 01/03,
      // nên phải so sánh round-trip để chặn ngày không tồn tại
      const isValidCalendarDate = (raw: string): boolean => {
        if (!/^\d{4}-\d{2}-\d{2}$/.test(raw)) return false
        const [y, m, d] = raw.split('-').map((v: string) => Number(v))
        if (!Number.isInteger(y) || !Number.isInteger(m) || !Number.isInteger(d)) return false
        const dt = new Date(Date.UTC(y, m - 1, d))
        return dt.getUTCFullYear() === y && dt.getUTCMonth() === m - 1 && dt.getUTCDate() === d
      }
      if (!isValidCalendarDate(fromDate) || !isValidCalendarDate(toDate)) {
        return errorResponse('Invalid report period: fromDate/toDate must be valid dates formatted as YYYY-MM-DD', 400)
      }

      const periodFromDate = new Date(`${fromDate}T00:00:00.000Z`)
      const periodToDate = new Date(`${toDate}T23:59:59.999Z`)
      if (periodFromDate.getTime() > periodToDate.getTime()) {
        return errorResponse('Invalid report period: fromDate must be earlier than or equal to toDate', 400)
      }

      const periodFromIso = periodFromDate.toISOString()
      const periodToIso = periodToDate.toISOString()

      // ----- Authorization & student scope for progress report -----
      let reportStudentId: string | null = null
      let reportClassId: string | null = null

      if (shared) {
        // Public share: student/class/period lấy từ DB share, không từ query client.
        reportStudentId = shared.student_id
        reportClassId = shared.class_id
      } else if (user?.role === 'STUDENT') {
        if (studentId && studentId !== user.id) {
          return errorResponse('Forbidden: You can only view your own progress report', 403)
        }
        reportStudentId = user.id
        const studentClassIds: string[] = user.classIds && user.classIds.length > 0 ? user.classIds : (user.classId ? [user.classId] : [])
        if (classId && classId !== 'TRIAL') {
          if (studentClassIds.length === 0 || !studentClassIds.includes(classId)) {
            return errorResponse('Forbidden: Student is not enrolled in this class', 403)
          }
          reportClassId = classId
        }
      } else if (user?.role === 'ADMIN') {
        if (!studentId) {
          return errorResponse('Bad request: studentId is required for scope=report', 400)
        }
        reportStudentId = studentId
        if (classId && classId !== 'TRIAL') {
          reportClassId = classId
          const { data: enrollment, error: enrollErr } = await serviceRoleClient
            .from('student_classes')
            .select('student_id, class_id')
            .eq('student_id', studentId)
            .eq('class_id', classId)
            .maybeSingle()
          if (enrollErr) {
            return errorResponse(enrollErr.message, 500)
          }
          if (!enrollment) {
            return errorResponse('Forbidden: Student is not enrolled in this class', 403)
          }
        }
      } else {
        return errorResponse('Forbidden: Progress report requires an authenticated student or admin account', 403)
      }

      // ----- Resolve homework scope via class chain (Class -> Chapter -> Lesson -> Homework) -----
      const reportClassIds: string[] = []
      if (reportStudentId) {
        if (user?.role === 'STUDENT') {
          // Học sinh đã chọn lớp: reportClassId đã qua kiểm tra ghi danh ở trên,
          // nên báo cáo chỉ đúng lớp đó, KHÔNG tổng hợp mọi lớp đang tham gia.
          if (reportClassId) {
            reportClassIds.push(reportClassId)
          } else {
            reportClassIds.push(...(user.classIds && user.classIds.length > 0 ? user.classIds : (user.classId ? [user.classId] : [])))
          }
        } else if (reportClassId) {
          reportClassIds.push(reportClassId)
        } else {
          const { data: studentClasses, error: scErr } = await serviceRoleClient
            .from('student_classes')
            .select('class_id')
            .eq('student_id', reportStudentId)
          if (scErr) {
            return errorResponse(scErr.message, 500)
          }
          ;((studentClasses as any) || []).forEach((c: any) => { if (c?.class_id) reportClassIds.push(c.class_id) })
        }
      }

      const buildReportHomeworkQuery = () => serviceRoleClient
        .from('homeworks')
        .select(`
          id, title, type, duration_minutes, max_score, pass_score, deadline, is_published,
          lessons!inner (id, title, is_trial, chapters!inner (id, title, class_id, classes (id, name)) )
        `)
        .eq('is_published', true)

      const reportHomeworks: any[] = []
      if (reportClassIds.length > 0) {
        // Truy vấn riêng từng lớp thay vì or() trên relation nhúng (tránh filter embedded của Supabase sai)
        const hwResults = await Promise.all(
          reportClassIds.map((cid: string) => buildReportHomeworkQuery().eq('lessons.chapters.class_id', cid))
        )
        for (const hwRes of hwResults) {
          const err = (hwRes as any).error
          if (err) {
            return errorResponse(err.message, 500)
          }
        }
        const seenHwIds = new Set<string>()
        hwResults.forEach((hwRes: any) => {
          (hwRes.data || []).forEach((h: any) => {
            if (!h?.id || seenHwIds.has(h.id)) return
            // Bỏ bài thuộc lesson học thử: report chỉ phản ánh bài thật của lớp
            if (h.lessons?.is_trial === true) return
            seenHwIds.add(h.id)
            reportHomeworks.push(h)
          })
        })
      }
      const reportHwIds: string[] = reportHomeworks.map((h: any) => h.id).filter(Boolean)

      // ----- Fetch submissions of the student within the reporting period (toDate inclusive) -----
      const reportSubmissionQuery = serviceRoleClient
        .from('submissions')
        .select(`
          id, homework_id, student_id, total_score, max_score, bonus_score, correct_count, wrong_count, duration_seconds_taken, is_late, is_trial, guest_name, guest_phone, submitted_at, attempt_no,
          homeworks (id, title, type, max_score, pass_score, deadline, pdf_path, lessons (id, title, is_trial, chapters (id, title, class_id, classes (id, name))) )
        `)
        .eq('status', 'SUBMITTED')
        .eq('student_id', reportStudentId as string)
        .gte('submitted_at', periodFromIso)
        .lte('submitted_at', periodToIso)

      const { data: periodSubmissions, error: periodSubsErr } = await reportSubmissionQuery.order('submitted_at', { ascending: true })
      if (periodSubsErr) {
        return errorResponse(periodSubsErr.message, 500)
      }
      const allPeriodSubs: any[] = periodSubmissions || []
      // Submission chỉ hợp lệ khi homework thuộc đúng phạm vi lớp truy vấn.
      // Lớp không có homework published/lesson thật -> rỗng tuyệt đối, KHÔNG fallback sang mọi bài
      const classHwIdSet = new Set<string>(reportHwIds)
      const periodAttemptRows: any[] = classHwIdSet.size > 0
        ? allPeriodSubs.filter((s: any) => classHwIdSet.has(s.homework_id))
        : []

      const toNum = (v: any, dflt: number = 0): number => {
        const n = Number(v)
        return Number.isFinite(n) ? n : dflt
      }
      const round2 = (n: number): number => Math.round(n * 100) / 100

      // ----- Build attempt records (each submission = one attempt; summary uses best score per homework) -----
      const attempts: any[] = periodAttemptRows.map((s: any) => {
        const hw = s.homeworks || {}
        const lesson = hw.lessons || {}
        const chapter = lesson.chapters || {}
        const cls = chapter.classes || {}
        const score = toNum(s.total_score)
        const maxScore = toNum(s.max_score || hw.max_score || 10)
        const scaledScore = maxScore > 0 ? Math.min(10, Math.max(0, (score / maxScore) * 10)) : 0
        const passScore = toNum(hw.pass_score ?? 5)
        const isLate = !!s.is_late || (!!hw.deadline && !!s.submitted_at && new Date(s.submitted_at).getTime() > new Date(hw.deadline).getTime())
        const submittedAtMs = s.submitted_at ? new Date(s.submitted_at).getTime() : NaN
        const dateKey = s.submitted_at ? String(s.submitted_at).substring(0, 10) : ''
        return {
          submissionId: s.id,
          homeworkId: s.homework_id,
          homeworkTitle: hw.title || 'Bài tập',
          homeworkType: hw.type || 'PRACTICE',
          maxScore,
          passScore,
          score,
          scaledScore,
          bonusScore: toNum(s.bonus_score),
          correctCount: s.correct_count,
          wrongCount: s.wrong_count,
          durationSecondsTaken: s.duration_seconds_taken || 0,
          isLate,
          isTrial: s.is_trial || false,
          submittedAt: s.submitted_at,
          submittedAtMs,
          dateKey,
          attemptNo: toNum(s.attempt_no, 1),
          isBest: false,
          lessonId: lesson.id || null,
          lessonTitle: lesson.title || null,
          chapterId: chapter.id || null,
          chapterTitle: chapter.title || null,
          classId: cls.id || null,
          className: cls.name || null,
        }
      }).sort((a: any, b: any) => (a.submittedAtMs || 0) - (b.submittedAtMs || 0) || (a.attemptNo || 0) - (b.attemptNo || 0))

      const bestByHomework = new Map<string, any>()
      attempts.forEach((a: any) => {
        const cur = bestByHomework.get(a.homeworkId)
        if (!cur || a.scaledScore > cur.scaledScore) {
          bestByHomework.set(a.homeworkId, a)
        }
      })
      bestByHomework.forEach((a: any) => {
        a.isBest = true
      })

      // Bài giao trong khoảng xác định theo deadline (ngày đến hạn thuộc kỳ).
      // Bài KHÔNG deadline coi như luôn mở: tính là bài giao của cả kỳ gốc và của cả hai nửa so sánh
      const deadlineInRange = (h: any, fromMs: number, toMs: number): boolean => {
        if (!h) return false
        if (!h.deadline) return true
        const t = new Date(h.deadline).getTime()
        return Number.isFinite(t) && t >= fromMs && t <= toMs
      }

      const assignedHomeworks = (reportHomeworks || []).filter((h: any) => deadlineInRange(h, periodFromDate.getTime(), periodToDate.getTime()))

      const buildPeriodStats = (atts: any[], assigned: any[]) => {
        const bestMap = new Map<string, any>()
        atts.forEach((a: any) => {
          const cur = bestMap.get(a.homeworkId)
          if (!cur || a.scaledScore > cur.scaledScore) {
            bestMap.set(a.homeworkId, a)
          }
        })
        const bestScores = Array.from(bestMap.values()).map((a: any) => a.scaledScore)
        const submittedHws = bestMap.size
        // completionRate chỉ đếm bài có submission thuộc phạm vi được giao của kỳ này
        const assignedHwIdSet = new Set<string>((assigned || []).map((h: any) => h.id))
        const submittedAssignedCount = Array.from(bestMap.keys()).filter((id: string) => assignedHwIdSet.has(id)).length
        const completionRate = assigned.length > 0 ? Math.min(100, round2((submittedAssignedCount / assigned.length) * 100)) : 0
        const onTimeCount = atts.filter((a: any) => !a.isLate).length
        const attemptCount = atts.length
        const averageScore = bestScores.length > 0 ? round2(bestScores.reduce((acc: number, v: number) => acc + v, 0) / bestScores.length) : 0
        const activeDaysSet = new Set<string>()
        atts.forEach((a: any) => { if (a.dateKey) activeDaysSet.add(a.dateKey) })
        return {
          assignedCount: assigned.length,
          submittedCount: submittedHws,
          completionRate,
          onTimeRate: attemptCount > 0 ? round2((onTimeCount / attemptCount) * 100) : 100,
          averageScore,
          highestScore: bestScores.length > 0 ? Math.max(...bestScores) : 0,
          lowestScore: bestScores.length > 0 ? Math.min(...bestScores) : 0,
          activeDays: activeDaysSet.size,
          attemptCount,
        }
      }

      const summaryStats = buildPeriodStats(attempts, assignedHomeworks)

      const periodMidMs = periodFromDate.getTime() + (periodToDate.getTime() - periodFromDate.getTime()) / 2
      // Guard: lượt nộp thiếu timestamp hợp lệ (không thể xảy ra với NOT NULL, nhưng chặn mọi trường hợp)
      const firstHalfAttempts = attempts.filter((a: any) => !Number.isFinite(a.submittedAtMs) || a.submittedAtMs <= periodMidMs)
      const secondHalfAttempts = attempts.filter((a: any) => Number.isFinite(a.submittedAtMs) && a.submittedAtMs > periodMidMs)
      const firstHalfAssigned = assignedHomeworks.filter((h: any) => deadlineInRange(h, periodFromDate.getTime(), periodMidMs))
      const secondHalfAssigned = assignedHomeworks.filter((h: any) => deadlineInRange(h, periodMidMs, periodToDate.getTime()))

      const firstHalfStats = buildPeriodStats(firstHalfAttempts, firstHalfAssigned)
      const secondHalfStats = buildPeriodStats(secondHalfAttempts, secondHalfAssigned)

      const averageScoreDelta = round2(secondHalfStats.averageScore - firstHalfStats.averageScore)
      const completionRateDelta = round2(secondHalfStats.completionRate - firstHalfStats.completionRate)
      const trend = averageScoreDelta > 0.005 ? 'IMPROVING' : (averageScoreDelta < -0.005 ? 'DECLINING' : 'STABLE')

      const scoreTrend = attempts.map((a: any) => ({
        submissionId: a.submissionId,
        homeworkId: a.homeworkId,
        homeworkTitle: a.homeworkTitle,
        homeworkType: a.homeworkType,
        attemptNo: a.attemptNo,
        score: a.score,
        maxScore: a.maxScore,
        scaledScore: a.scaledScore,
        passScore: a.passScore,
        isPassed: a.score >= a.passScore,
        isLate: a.isLate,
        isBest: a.isBest,
        submittedAt: a.submittedAt,
        date: a.dateKey,
      }))

      // ----- Topic breakdown: chỉ nhóm theo chapter có metadata thật từ join,
      // không tạo nhóm "unknown" ảo gây kết luận sai -----
      const topicGroups = new Map<string, any[]>()
      attempts.forEach((a: any) => {
        if (!a.chapterId) return
        const group = topicGroups.get(a.chapterId) || []
        group.push(a)
        topicGroups.set(a.chapterId, group)
      })
      const topicBreakdown = Array.from(topicGroups.entries()).map(([chapterKey, groupAttempts]: [string, any[]]) => {
        const bestMap = new Map<string, any>()
        groupAttempts.forEach((a: any) => {
          const cur = bestMap.get(a.homeworkId)
          if (!cur || a.scaledScore > cur.scaledScore) {
            bestMap.set(a.homeworkId, a)
          }
        })
        const topicScores = Array.from(bestMap.values()).map((a: any) => a.scaledScore)
        const topicAvg = topicScores.length > 0 ? round2(topicScores.reduce((acc: number, v: number) => acc + v, 0) / topicScores.length) : 0
        const firstAttempt = groupAttempts[0]
        const topicAssigned = assignedHomeworks.filter((h: any) => h.lessons?.chapters?.id === chapterKey)
        return {
          topicId: firstAttempt.chapterId,
          topicKey: chapterKey,
          topicTitle: firstAttempt.chapterTitle || 'Chương',
          chapterId: firstAttempt.chapterId,
          chapterTitle: firstAttempt.chapterTitle || null,
          lessonId: firstAttempt.lessonId,
          lessonTitle: firstAttempt.lessonTitle || null,
          assignedCount: topicAssigned.length,
          submittedCount: bestMap.size,
          completionRate: topicAssigned.length > 0 ? Math.min(100, round2((bestMap.size / topicAssigned.length) * 100)) : 0,
          averageScore: topicAvg,
          highestScore: topicScores.length > 0 ? Math.max(...topicScores) : 0,
          lowestScore: topicScores.length > 0 ? Math.min(...topicScores) : 0,
          attemptCount: groupAttempts.length,
        }
      }).sort((a: any, b: any) => String(a.topicTitle).localeCompare(String(b.topicTitle)))

      // ----- Report-friendly submissions list for the report page -----
      const reportSubmissions = attempts.map((a: any) => ({
        submissionId: a.submissionId,
        homeworkId: a.homeworkId,
        homeworkTitle: a.homeworkTitle,
        homeworkType: a.homeworkType,
        attemptNo: a.attemptNo,
        score: a.score,
        maxScore: a.maxScore,
        passScore: a.passScore,
        isPassed: a.score >= a.passScore,
        bonusScore: a.bonusScore,
        correctCount: a.correctCount,
        wrongCount: a.wrongCount,
        durationSecondsTaken: a.durationSecondsTaken,
        isLate: a.isLate,
        isTrial: a.isTrial,
        isBest: a.isBest,
        submittedAt: a.submittedAt,
        lessonId: a.lessonId,
        lessonTitle: a.lessonTitle,
        chapterId: a.chapterId,
        chapterTitle: a.chapterTitle,
        classId: a.classId,
        className: a.className,
        studentId: reportStudentId,
      }))

      const reportPeriod = {
        fromDate,
        toDate,
        from: periodFromIso,
        to: periodToIso,
        days: Math.round((periodToDate.getTime() - periodFromDate.getTime()) / 86400000) + 1,
      }
      const reportComparison = {
        firstHalf: firstHalfStats,
        secondHalf: secondHalfStats,
        averageScoreDelta,
        completionRateDelta,
        trend,
      }

      // Public payload: giữ đủ dữ liệu render + tên học sinh/lớp + hạn share,
      // nhưng bỏ toàn bộ id nội bộ (studentId/submissionId/homeworkId/classId/
      // lessonId/chapterId...) và không bao giờ trả token/hash/phone/username.
      if (shared) {
        const publicScoreTrend = scoreTrend.map((a: any) => ({
          homeworkTitle: a.homeworkTitle,
          homeworkType: a.homeworkType,
          attemptNo: a.attemptNo,
          score: a.score,
          maxScore: a.maxScore,
          scaledScore: a.scaledScore,
          passScore: a.passScore,
          isPassed: a.isPassed,
          isLate: a.isLate,
          isBest: a.isBest,
          submittedAt: a.submittedAt,
          date: a.date,
        }))
        const publicTopicBreakdown = topicBreakdown.map((t: any) => ({
          topicTitle: t.topicTitle,
          chapterTitle: t.chapterTitle,
          lessonTitle: t.lessonTitle,
          assignedCount: t.assignedCount,
          submittedCount: t.submittedCount,
          completionRate: t.completionRate,
          averageScore: t.averageScore,
          highestScore: t.highestScore,
          lowestScore: t.lowestScore,
          attemptCount: t.attemptCount,
        }))
        const publicSubmissions = reportSubmissions.map((s: any) => ({
          homeworkTitle: s.homeworkTitle,
          homeworkType: s.homeworkType,
          attemptNo: s.attemptNo,
          score: s.score,
          maxScore: s.maxScore,
          passScore: s.passScore,
          isPassed: s.isPassed,
          bonusScore: s.bonusScore,
          correctCount: s.correctCount,
          wrongCount: s.wrongCount,
          durationSecondsTaken: s.durationSecondsTaken,
          isLate: s.isLate,
          isTrial: s.isTrial,
          isBest: s.isBest,
          submittedAt: s.submittedAt,
          lessonTitle: s.lessonTitle,
          chapterTitle: s.chapterTitle,
          className: s.className,
        }))

        return jsonResponse({
          scope: 'SHARED_REPORT',
          shareId: shared.id,
          expiresAt: shared.expires_at,
          studentName: sharedStudentName || 'Học sinh',
          className: sharedClassName || 'Lớp học',
          period: {
            fromDate: reportPeriod.fromDate,
            toDate: reportPeriod.toDate,
            days: reportPeriod.days,
          },
          summary: summaryStats,
          comparison: reportComparison,
          scoreTrend: publicScoreTrend,
          topicBreakdown: publicTopicBreakdown,
          submissions: publicSubmissions,
        })
      }

      // Legacy authenticated report shape giữ nguyên (frontend hiện tại phụ thuộc).
      return jsonResponse({
        scope: 'REPORT',
        studentId: reportStudentId,
        classId: reportClassId,
        period: reportPeriod,
        summary: summaryStats,
        comparison: reportComparison,
        scoreTrend,
        topicBreakdown,
        submissions: reportSubmissions,
      })
    }

    // 1. Single Submission Details (for assignment review)
    if (submissionId) {
      const { data: sub, error: subErr } = await serviceRoleClient
        .from('submissions')
        .select(`
          id,
          homework_id,
          student_id,
          total_score,
          max_score,
          bonus_score,
          correct_count,
          wrong_count,
          duration_seconds_taken,
          is_late,
          is_trial,
          guest_name,
          guest_phone,
          submitted_at,
          profiles (id, username, full_name),
          homeworks (
            id,
            title,
            max_score,
            pass_score,
            pdf_path,
            type,
            show_solutions,
            lessons (
              id,
              title,
              is_trial,
              chapters (
                id,
                title,
                class_id,
                classes (id, name)
              )
            )
          )
        `)
        .eq('id', submissionId)
        .single()

      if (subErr || !sub) {
        return errorResponse('Submission not found', 404)
      }

      const isTrialSub = sub.is_trial === true || !sub.student_id || !!sub.guest_name || (sub.homeworks?.lessons?.is_trial === true)

      // If user is STUDENT and submission is not a trial submission, enforce student ownership
      if (user && user.role === 'STUDENT' && !isTrialSub && sub.student_id !== user.id) {
        return errorResponse('Forbidden: You cannot view another student submission', 403)
      }

      // If not trial submission and unauthenticated
      if (!user && !isTrialSub) {
        return errorResponse('Unauthorized: Login required to view this submission', 401)
      }

      // Fetch submission answers with questions and generate signed PDF URL in parallel.
      // Nhật ký cộng điểm câu: CHỈ admin nhận; fetch lỗi -> fail-soft (bỏ log, không làm hỏng xem bài).
      const hwObj = sub.homeworks
      const awardLogsPromise = (user?.role === 'ADMIN')
        ? serviceRoleClient
            .from('question_award_logs')
            .select(QUESTION_AWARD_LOG_SELECT)
            .eq('submission_id', submissionId)
            .order('created_at', { ascending: true })
        : Promise.resolve({ data: null, error: null })
      const [answersRes, signedUrlRes, awardLogsRes] = await Promise.all([
        serviceRoleClient
          .from('submission_answers')
          .select(`
            id,
            question_id,
            given_answer,
             is_correct,
             score_earned,
             teacher_feedback,
             grading_status,
            questions (
              id,
              question_number,
              question_type,
              prompt,
              points,
              content,
              options,
              statements,
              part_title,
              question_answers (
                mc_answer,
                tf_answers,
                sa_answer,
                sa_tolerance,
                explanation
              )
            )
          `)
          .eq('submission_id', submissionId),
        (hwObj?.pdf_path && !hwObj.pdf_path.startsWith('http'))
          ? serviceRoleClient.storage.from('pdf-files').createSignedUrl(hwObj.pdf_path, 3600)
          : Promise.resolve({ data: null, error: null }),
        awardLogsPromise
      ])

      if (answersRes.error) {
        return errorResponse(answersRes.error.message, 500)
      }

      // DTO log cộng điểm cho admin review; fetch lỗi -> undefined (payload cũ giữ nguyên).
      const questionAwardLogs = (user?.role === 'ADMIN' && !awardLogsRes?.error && Array.isArray(awardLogsRes?.data))
        ? awardLogsRes.data.map(mapQuestionAwardLogRow)
        : undefined

      const answers = answersRes.data || []
      let pdfUrl = hwObj?.pdf_path
      if (signedUrlRes.data?.signedUrl) {
        pdfUrl = signedUrlRes.data.signedUrl
      }

      // Determine active grading structure
      const totalQuestions = answers.length
      const mcCount = (answers || []).filter((a: any) => {
        const q = Array.isArray(a.questions) ? a.questions[0] : (a.questions || {})
        return (q.question_type || a.question_type) === 'MULTIPLE_CHOICE'
      }).length
      const tfCount = (answers || []).filter((a: any) => {
        const q = Array.isArray(a.questions) ? a.questions[0] : (a.questions || {})
        return (q.question_type || a.question_type) === 'TRUE_FALSE'
      }).length
      const saCount = (answers || []).filter((a: any) => {
        const q = Array.isArray(a.questions) ? a.questions[0] : (a.questions || {})
        return (q.question_type || a.question_type) === 'SHORT_ANSWER'
      }).length

      const score = Number(sub.total_score ?? 0)
      const passScore = Number(hwObj?.pass_score ?? 5)
      const isPassed = score >= passScore
      const shouldShowSolutions = hwObj?.show_solutions !== false || (user && user.role === 'ADMIN')

      const formattedAnswers = (answers || []).map((ans: any) => {
        const qObj = Array.isArray(ans.questions) ? ans.questions[0] : (ans.questions || {})
        const qType = qObj.question_type || ans.question_type
        const qNum = qObj.question_number !== undefined ? qObj.question_number : ans.question_number
        const qAnswers = Array.isArray(qObj.question_answers) ? qObj.question_answers[0] : (qObj.question_answers || {})
        const key = qAnswers

        const points = qObj.points !== undefined && qObj.points !== null
          ? Number(qObj.points)
          : (ans.points !== undefined && ans.points !== null ? Number(ans.points) : (qType === 'TRUE_FALSE' ? 1.0 : (qType === 'SHORT_ANSWER' ? 0.5 : 0.25)))

        const scoreEarned = ans.score_earned !== undefined && ans.score_earned !== null
          ? Number(ans.score_earned)
          : (ans.is_correct ? points : 0)

        let correctAnswerSummary: any = null
        let statementGrades: any = undefined

        if (qType === 'MULTIPLE_CHOICE') {
          if (shouldShowSolutions) correctAnswerSummary = key?.mc_answer || null
        } else if (qType === 'TRUE_FALSE') {
          if (shouldShowSolutions) correctAnswerSummary = key?.tf_answers || null

          // 1. Check if statementGrades was pre-calculated and stored in given_answer
          let stGrades = ans.given_answer?.statementGrades
          if (typeof stGrades === 'string') {
            try { stGrades = JSON.parse(stGrades) } catch {}
          }

          // 2. If not stored, compute dynamically from answer keys and student given answer
          if (!stGrades || (!stGrades.a && !stGrades.b && !stGrades.c && !stGrades.d && scoreEarned > 0)) {
            let correctVal = key?.tf_answers
            if (typeof correctVal === 'string') {
              try { correctVal = JSON.parse(correctVal) } catch {}
            }
            correctVal = (correctVal as any) || {}

            let studentVal = ans.given_answer?.value !== undefined ? ans.given_answer.value : ans.given_answer
            if (typeof studentVal === 'string') {
              try { studentVal = JSON.parse(studentVal) } catch {}
            }
            studentVal = (studentVal as any) || {}

            const getBool = (v: any) => {
              if (v === true || v === 'true' || v === 1 || v === '1') return true
              if (v === false || v === 'false' || v === 0 || v === '0') return false
              return undefined
            }

            const cA = getBool(correctVal.a !== undefined ? correctVal.a : correctVal.s1)
            const cB = getBool(correctVal.b !== undefined ? correctVal.b : correctVal.s2)
            const cC = getBool(correctVal.c !== undefined ? correctVal.c : correctVal.s3)
            const cD = getBool(correctVal.d !== undefined ? correctVal.d : correctVal.s4)

            const sA = getBool(studentVal.a !== undefined ? studentVal.a : studentVal.s1)
            const sB = getBool(studentVal.b !== undefined ? studentVal.b : studentVal.s2)
            const sC = getBool(studentVal.c !== undefined ? studentVal.c : studentVal.s3)
            const sD = getBool(studentVal.d !== undefined ? studentVal.d : studentVal.s4)

            if (cA !== undefined || cB !== undefined || cC !== undefined || cD !== undefined) {
              stGrades = {
                a: sA !== undefined && cA !== undefined ? sA === cA : false,
                b: sB !== undefined && cB !== undefined ? sB === cB : false,
                c: sC !== undefined && cC !== undefined ? sC === cC : false,
                d: sD !== undefined && cD !== undefined ? sD === cD : false,
              }
            }
          }

          if (stGrades) {
            statementGrades = stGrades
          } else if (ans.is_correct || scoreEarned >= points) {
            statementGrades = { a: true, b: true, c: true, d: true }
          }
        } else if (qType === 'SHORT_ANSWER') {
          if (shouldShowSolutions) {
            correctAnswerSummary = {
              answer: key?.sa_answer,
              tolerance: key?.sa_tolerance || 0,
            }
          }
        }

        const rawGiven = ans.given_answer
        let parsedGiven = rawGiven
        if (typeof rawGiven === 'string') {
          try {
            parsedGiven = JSON.parse(rawGiven)
          } catch {
            parsedGiven = rawGiven
          }
        }

        let prompt = qObj.prompt || ans.prompt
        const feedback = qType === 'ESSAY'
          ? (ans.grading_status === 'MANUALLY_GRADED' ? (ans.teacher_feedback || 'Đã chấm') : 'Chờ giáo viên chấm')
          : (ans.is_correct ? 'Đúng' : 'Sai')

        if (!shouldShowSolutions) {
          if (typeof prompt === 'string' && prompt.startsWith('{')) {
            try {
              const pObj = JSON.parse(prompt)
              if (pObj.explanation) {
                pObj.explanation = ''
                prompt = JSON.stringify(pObj)
              }
            } catch {
              // keep as-is
            }
          }
        }

        return {
          id: ans.id,
          questionId: ans.question_id,
          questionNumber: qNum,
          questionType: qType,
          content: qObj.content || ans.content,
          options: qObj.options || ans.options,
          statements: qObj.statements || ans.statements,
          partTitle: qObj.part_title || ans.part_title,
          prompt,
          explanation: shouldShowSolutions ? (key?.explanation || null) : null,
          is_correct: ans.is_correct,
          isCorrect: ans.is_correct,
          score_earned: scoreEarned,
          scoreEarned: scoreEarned,
          pointsPossible: points,
          points,
          given_answer: parsedGiven,
          givenAnswer: parsedGiven,
          correct_answer: shouldShowSolutions ? correctAnswerSummary : null,
          correctAnswer: shouldShowSolutions ? correctAnswerSummary : null,
          correctAnswerSummary: shouldShowSolutions ? correctAnswerSummary : null,
          statementGrades,
          feedback,
          teacherFeedback: ans.teacher_feedback || null,
          gradingStatus: ans.grading_status || (qType === 'ESSAY' ? 'PENDING' : 'AUTO_GRADED'),
          questions: {
            id: ans.question_id,
            question_number: qNum,
            question_type: qType,
            prompt,
            content: qObj.content || ans.content,
            options: qObj.options || ans.options,
            statements: qObj.statements || ans.statements,
            part_title: qObj.part_title || ans.part_title,
            explanation: shouldShowSolutions ? (key?.explanation || null) : null,
            points,
          },
          question: {
            id: ans.question_id,
            questionNumber: qNum,
            questionType: qType,
            prompt,
            points,
          },
        }
      })

      // Ensure answers are strictly sorted by questionNumber ascending
      formattedAnswers.sort((a: any, b: any) => (Number(a.questionNumber) || 0) - (Number(b.questionNumber) || 0))

      return jsonResponse({
        submissionId: sub.id,
        homeworkId: sub.homework_id,
        homeworkTitle: hwObj?.title || 'Bài tập',
        submittedAt: sub.submitted_at,
        score,
        bonusScore: Number(sub.bonus_score || 0),
        maxScore: Number(sub.max_score || hwObj?.max_score || 10),
        passScore,
        isPassed,
        isLate: sub.is_late,
        isTrial: isTrialSub,
        guestName: sub.guest_name || null,
        guestPhone: sub.guest_phone || null,
        type: hwObj?.type || 'PRACTICE',
        correctCount: sub.correct_count,
        wrongCount: sub.wrong_count,
        pdfUrl,
        showSolutions: hwObj?.show_solutions !== false,
        answers: formattedAnswers,
        // Nhật ký cộng điểm theo câu: chỉ thêm key khi admin (học sinh không thấy log).
        ...(questionAwardLogs ? { questionAwardLogs } : {}),
        submission: {
          id: sub.id,
          homeworkId: sub.homework_id,
          studentId: sub.student_id,
          homeworkTitle: hwObj?.title || 'Bài tập',
          score,
          bonus_score: Number(sub.bonus_score || 0),
          bonusScore: Number(sub.bonus_score || 0),
          maxScore: Number(sub.max_score || hwObj?.max_score || 10),
          passScore,
          isPassed,
          correctCount: sub.correct_count,
          wrongCount: sub.wrong_count,
          submittedAt: sub.submitted_at,
          isLate: sub.is_late,
          isTrial: isTrialSub,
          guestName: sub.guest_name || null,
          guestPhone: sub.guest_phone || null,
          type: hwObj?.type || 'PRACTICE',
          pdfUrl,
          showSolutions: hwObj?.show_solutions !== false,
        },
      })
    }

    // 2. Query Submissions List
    let classHomeworks: any[] = []
    let classHwIds: string[] = []
    let prefetchedEnrolledStudents: any[] | null = null
    const isClassHomeworkPopup = user?.role === 'ADMIN' && !!homeworkId && !!classId && classId !== 'TRIAL' && url.searchParams.get('includeDraft') === 'true'
    let popupEligibleStudentIds: Set<string> | null = null
    let pageInfo: { total: number; page: number; pageSize: number; totalPages: number } | null = null

    // Prepare Homeworks Query Promise
    const homeworksPromise = (async () => {
      if (isTrialQuery) {
        const { data: trialHws } = await serviceRoleClient
          .from('homeworks')
          .select(`
            id,
            title,
            type,
            duration_minutes,
            max_score,
            pass_score,
            deadline,
            lessons (
              id,
              title,
              is_trial,
              chapters (
                id,
                title,
                class_id,
                classes (id, name)
              )
            )
          `)
          .eq('is_published', true)

        return (trialHws || [])
          .filter((h: any) => h.lessons?.is_trial === true)
          .map((h: any) => ({
            id: h.id,
            title: h.title,
            type: h.type,
            durationMinutes: h.duration_minutes || 45,
            maxScore: h.max_score || 10,
            passScore: h.pass_score || 5,
            deadline: h.deadline,
            lessonTitle: h.lessons?.title || '',
            className: h.lessons?.chapters?.classes?.name || 'Chung'
          }))
      } else if (classId && classId !== 'TRIAL') {
        let classHomeworkQuery = serviceRoleClient
          .from('homeworks')
          .select(`
            id,
            title,
            type,
            duration_minutes,
            max_score,
            pass_score,
            deadline,
            lessons!inner (
              id,
              title,
              chapters!inner (
                id,
                title,
                class_id,
                classes (id, name)
              )
            )
          `)
          .eq('lessons.chapters.class_id', classId)
        // Popup quản trị có thể xem bài nháp của chính lớp này; tuyệt đối không mở
        // phạm vi bài nháp cho học sinh hoặc request không chỉ rõ một bài.
        if (user?.role === 'ADMIN' && homeworkId && url.searchParams.get('includeDraft') === 'true') {
          classHomeworkQuery = classHomeworkQuery.eq('id', homeworkId)
        } else {
          classHomeworkQuery = classHomeworkQuery.eq('is_published', true)
        }
        const { data: hws, error: hwErr } = await classHomeworkQuery.order('created_at', { ascending: false })

        if (!hwErr && hws) {
          return hws.map((h: any) => ({
            id: h.id,
            title: h.title,
            type: h.type,
            durationMinutes: h.duration_minutes || 45,
            maxScore: h.max_score || 10,
            passScore: h.pass_score || 5,
            deadline: h.deadline,
            lessonTitle: h.lessons?.title || '',
            className: h.lessons?.chapters?.classes?.name || ''
          }))
        }
      } else if (!classId && user?.role === 'ADMIN' && !isTrialQuery) {
        // Admin xem tất cả lớp: trả toàn bộ bài tập đã xuất bản cho dropdown lọc
        const { data: hws } = await serviceRoleClient
          .from('homeworks')
          .select(`
            id,
            title,
            type,
            lessons (
              id,
              title,
              chapters (
                id,
                title,
                class_id,
                classes (id, name)
              )
            )
          `)
          .eq('is_published', true)
          .order('created_at', { ascending: false })
          .limit(500)
        if (hws) {
          return hws.map((h: any) => ({
            id: h.id,
            title: h.title,
            type: h.type,
            lessonTitle: h.lessons?.title || '',
            className: h.lessons?.chapters?.classes?.name || ''
          }))
        }
      }
      return []
    })()

    // If homeworkId is provided, we can immediately start the submissions query in parallel!
    let rawSubmissions: any[] = []
    let fetchErr: any = null

    if (homeworkId || studentId || isTrialQuery) {
      const buildSubmissionsQuery = () => {
        let q = serviceRoleClient
          .from('submissions')
          .select(`
            id,
            homework_id,
            student_id,
            total_score,
            max_score,
            bonus_score,
            correct_count,
            wrong_count,
            duration_seconds_taken,
            is_late,
            is_trial,
            guest_name,
            guest_phone,
            submitted_at,
            profiles (id, username, full_name),
            homeworks (
              id,
              title,
              max_score,
              pass_score,
              deadline,
              pdf_path,
              type,
              lessons (
                id,
                title,
                is_trial,
                chapters (
                  id,
                  title,
                  class_id,
                  classes (id, name)
                )
              )
            )
          `)
          .eq('status', 'SUBMITTED')
          .order('submitted_at', { ascending: false })

        if (isTrialQuery || guestPhone) {
          q = q.or('student_id.is.null,guest_phone.not.is.null')
          if (guestPhone) {
            const p = guestPhone.trim()
            q = q.or(`guest_phone.ilike.%${p}%,guest_phone.eq.${p}`)
          }
          if (homeworkId) {
            q = q.eq('homework_id', homeworkId)
          }
        } else {
          q = q.not('student_id', 'is', null)
          if (studentId) {
            if (user?.role === 'STUDENT' && studentId !== user.id) {
              throw new Error('Forbidden: You can only view your own history')
            }
            q = q.eq('student_id', studentId)
          } else if (user?.role === 'STUDENT') {
            q = q.eq('student_id', user.id)
          }
          if (homeworkId) {
            q = q.eq('homework_id', homeworkId)
          }
        }
        return isClassHomeworkPopup ? q.order('id', { ascending: true }) : q
      }

      const enrolledPromise = (homeworkId && classId && classId !== 'TRIAL')
        ? serviceRoleClient
            .from('student_classes')
            .select(`
              student_id,
              profiles (id, username, full_name)
            `)
            .eq('class_id', classId)
        : Promise.resolve({ data: null, error: null })

      const [hwsResult, subResult, enrolledResult] = await Promise.all([
        homeworksPromise,
        isClassHomeworkPopup ? loadAllAnalysisRows(buildSubmissionsQuery) : buildSubmissionsQuery(),
        enrolledPromise
      ])

      classHomeworks = hwsResult
      classHwIds = classHomeworks.map((h: any) => h.id)
      rawSubmissions = subResult.data || []
      fetchErr = subResult.error
      prefetchedEnrolledStudents = enrolledResult.data || null

      if (isClassHomeworkPopup && classHwIds.includes(homeworkId!)) {
        if (enrolledResult.error) return errorResponse('Không đọc được danh sách học sinh trong lớp', 500)
        const { data: targets, error: targetError } = await serviceRoleClient
          .from('homework_targets').select('student_id').eq('homework_id', homeworkId)
        if (targetError) return errorResponse('Không đọc được danh sách học sinh được giao bài', 500)
        const enrolledIds = new Set((prefetchedEnrolledStudents || []).map((row: any) => row.student_id))
        popupEligibleStudentIds = (targets || []).length
          ? new Set((targets || []).map((row: any) => row.student_id).filter((id: string) => enrolledIds.has(id)))
          : enrolledIds
        rawSubmissions = rawSubmissions.filter((row: any) => popupEligibleStudentIds!.has(row.student_id))
      }

      if (classId && classId !== 'TRIAL') {
        if (homeworkId && !classHwIds.includes(homeworkId)) {
          // Homework does not belong to the requested class -> return empty submissions to prevent cross-class leakage
          rawSubmissions = []
        } else if (classHwIds.length === 0) {
          rawSubmissions = []
        }
      }
    } else {
      // Must wait for class homeworks to get classHwIds
      classHomeworks = await homeworksPromise
      classHwIds = classHomeworks.map((h: any) => h.id)

      if (classId && classId !== 'TRIAL' && classHwIds.length === 0) {
        return jsonResponse({
          classId,
          homeworkId: homeworkId || undefined,
          totalSubmissions: 0,
          total: 0,
          page: 1,
          pageSize: 20,
          totalPages: 1,
          history: [],
          classHomeworks: [],
          submissionStats: null,
          unsubmittedStudents: []
        })
      }

      // Phân trang + tìm kiếm ở server cho màn theo dõi nộp bài (bài nộp mới nhất trước)
      const page = Math.max(1, parseInt(url.searchParams.get('page') || '1', 10) || 1)
      const pageSize = Math.min(100, Math.max(1, parseInt(url.searchParams.get('pageSize') || '20', 10) || 20))
      const search = (url.searchParams.get('search') || '').trim()

      // Tìm kiếm theo tên/username học sinh hoặc tên bài tập:
      // resolve id trước rồi lọc OR trên cột chính (tránh join-filter phức tạp)
      let searchHwIds: string[] | null = null
      let searchStudentIds: string[] | null = null
      if (search) {
        const pattern = `%${search.replace(/[%_(),]/g, '')}%`
        const [hwMatch, stMatch] = await Promise.all([
          serviceRoleClient.from('homeworks').select('id').ilike('title', pattern).limit(500),
          serviceRoleClient.from('profiles').select('id').or(`full_name.ilike.${pattern},username.ilike.${pattern}`).eq('role', 'STUDENT').limit(500)
        ])
        searchHwIds = (hwMatch.data || []).map((h: any) => h.id)
        searchStudentIds = (stMatch.data || []).map((s: any) => s.id)
        if (searchHwIds.length === 0 && searchStudentIds.length === 0) {
          return jsonResponse({
            classId: classId || undefined,
            homeworkId: homeworkId || undefined,
            totalSubmissions: 0,
            total: 0,
            page,
            pageSize,
            totalPages: 1,
            history: [],
            classHomeworks,
            submissionStats: null,
            unsubmittedStudents: []
          })
        }
      }

      let q = serviceRoleClient
        .from('submissions')
        .select(`
          id,
          homework_id,
          student_id,
          total_score,
          max_score,
          bonus_score,
          correct_count,
          wrong_count,
          duration_seconds_taken,
          is_late,
          is_trial,
          guest_name,
          guest_phone,
          submitted_at,
          profiles (id, username, full_name),
          homeworks (
            id,
            title,
            max_score,
            pass_score,
            deadline,
            pdf_path,
            type,
            lessons (
              id,
              title,
              is_trial,
              chapters (
                id,
                title,
                class_id,
                classes (id, name)
              )
            )
          )
        `, { count: 'exact' })
        .eq('status', 'SUBMITTED')
        .order('submitted_at', { ascending: false })
        .not('student_id', 'is', null)

      if (user?.role === 'STUDENT') {
        q = q.eq('student_id', user.id)
      }
      if (classHwIds.length > 0) {
        q = q.in('homework_id', classHwIds)
      }
      if (search && searchHwIds !== null && searchStudentIds !== null) {
        const orParts: string[] = []
        if (searchHwIds.length > 0) orParts.push(`homework_id.in.(${searchHwIds.join(',')})`)
        if (searchStudentIds.length > 0) orParts.push(`student_id.in.(${searchStudentIds.join(',')})`)
        if (orParts.length > 0) {
          q = q.or(orParts.join(','))
        }
      }
      q = q.range((page - 1) * pageSize, page * pageSize - 1)

      const subResult = await q
      rawSubmissions = subResult.data || []
      fetchErr = subResult.error
      const totalCount: number = (subResult as any).count ?? rawSubmissions.length
      const totalPages: number = Math.max(1, Math.ceil(totalCount / pageSize))
      const safePage: number = Math.min(page, totalPages)
      pageInfo = { total: totalCount, page: safePage, pageSize, totalPages }
    }

    if (fetchErr) {
      return errorResponse(fetchErr.message, 500)
    }

    const subIds = (rawSubmissions || []).map((s: any) => s.id)
    const wrongAnswersMap = new Map<string, any[]>()
    const wrongQuestionsSummaryMap = new Map<string | number, any>()

    // Nhật ký cộng điểm theo câu cho danh sách bài nộp của admin (theo dõi nộp bài):
    // 1 query duy nhất cho đúng submissions của current page (không N+1), CHỈ admin,
    // học sinh không bao giờ nhận. Fetch lỗi -> fail-soft (danh sách không có cột log).
    let awardLogsBySubmission: Map<string, any[]> | null = null
    // Popup does not display award logs: avoid a large unused IN request.
    if (user?.role === 'ADMIN' && !isTrialQuery && subIds.length > 0 && (!isClassHomeworkPopup || subIds.length <= ANALYSIS_SUBMISSION_CHUNK_SIZE)) {
      const { data: awardRows, error: awardErr } = await serviceRoleClient
        .from('question_award_logs')
        .select(QUESTION_AWARD_LOG_SELECT)
        .in('submission_id', subIds)
        .order('created_at', { ascending: true })
        .limit(AWARD_LOGS_LIST_LIMIT)
      if (!awardErr && Array.isArray(awardRows)) {
        awardLogsBySubmission = new Map()
        for (const row of awardRows) {
          const dto = mapQuestionAwardLogRow(row)
          if (!dto.submissionId) continue
          const bucket = awardLogsBySubmission.get(dto.submissionId)
          if (bucket) bucket.push(dto)
          else awardLogsBySubmission.set(dto.submissionId, [dto])
        }
      }
    }

    const canSeeWrongAnalysis = (user?.role === 'ADMIN' || isTrialQuery) && subIds.length > 0

    if (canSeeWrongAnalysis) {
      const buildWrongAnswersQuery = (submissionIds = subIds) => serviceRoleClient
        .from('submission_answers')
        .select(`
          submission_id,
          question_id,
          given_answer,
          is_correct,
          score_earned,
          questions (
            id,
            question_number,
            question_type,
            prompt,
            ${isClassHomeworkPopup ? 'question_bank (id, qb_lesson_id, qb_question_types (id, lesson_id, name)),' : ''}
            question_answers (
              mc_answer,
              tf_answers,
              sa_answer
            )
          )
        `)
        .in('submission_id', submissionIds)
        .eq('is_correct', false)

      const { data: subAns, error: analysisError } = isClassHomeworkPopup
        ? await loadChunkedWrongAnalysis(subIds, ids => buildWrongAnswersQuery(ids).order('submission_id').order('question_id'))
        : await buildWrongAnswersQuery()
      // Popup must never display a failed query as “no wrong questions”.
      if (analysisError && isClassHomeworkPopup) return errorResponse('Không tải được phân tích câu sai. Vui lòng thử lại.', 500)
      if (subAns) {
        const studentProfileMap = new Map(
          (rawSubmissions || []).map((s: any) => [
            s.id,
            {
              id: s.student_id || s.id,
              name: s.guest_name || s.profiles?.full_name || (s.is_trial ? 'Học sinh trải nghiệm' : 'Học sinh'),
              submittedAt: s.submitted_at,
              phone: s.guest_phone || ''
            }
          ])
        )

        for (const sa of isClassHomeworkPopup ? uniqueWrongAttempts(subAns) : subAns) {
          const q = sa.questions
          if (!q) continue

          const qNum = q.question_number
          const qType = q.question_type
          if (qType === 'ESSAY') continue
          const qAns = q.question_answers?.[0] || q.question_answers || {}

          let correctAnsStr = 'N/A'
          if (qType === 'MULTIPLE_CHOICE') {
            correctAnsStr = qAns.mc_answer || 'N/A'
          } else if (qType === 'TRUE_FALSE') {
            let tfVal = qAns.tf_answers
            if (typeof tfVal === 'string' && tfVal.startsWith('{')) {
              try { tfVal = JSON.parse(tfVal) } catch {}
            }
            if (typeof tfVal === 'object' && tfVal !== null) {
              const getL = (v: any) => (v === true || v === 'true' || v === 1 || v === '1') ? 'Đ' : ((v === false || v === 'false' || v === 0 || v === '0') ? 'S' : '-')
              const a = getL(tfVal.a !== undefined ? tfVal.a : tfVal.s1)
              const b = getL(tfVal.b !== undefined ? tfVal.b : tfVal.s2)
              const c = getL(tfVal.c !== undefined ? tfVal.c : tfVal.s3)
              const d = getL(tfVal.d !== undefined ? tfVal.d : tfVal.s4)
              correctAnsStr = `a: ${a}, b: ${b}, c: ${c}, d: ${d}`
            } else {
              correctAnsStr = String(tfVal || 'N/A')
            }
          } else if (qType === 'SHORT_ANSWER') {
            correctAnsStr = String(qAns.sa_answer ?? 'N/A')
          }

          let givenStr = 'Bỏ trống (Chưa làm)'
          let isUnanswered = false
          if (sa.given_answer !== null && sa.given_answer !== undefined) {
            let val = sa.given_answer
            if (typeof val === 'string' && (val.startsWith('{') || val.startsWith('['))) {
              try { val = JSON.parse(val) } catch {}
            }
            if (typeof val === 'object' && val !== null) {
              if (val.value !== undefined) {
                val = val.value
              }
            }
            if (val === null || val === undefined || val === '' || val === 'null' || val === '{}') {
              givenStr = 'Bỏ trống (Chưa làm)'
              isUnanswered = true
            } else if (typeof val === 'object' && val !== null) {
              if (qType === 'TRUE_FALSE') {
                const getL = (v: any) => (v === true || v === 'true' || v === 1 || v === '1') ? 'Đ' : ((v === false || v === 'false' || v === 0 || v === '0') ? 'S' : '-')
                const a = getL(val.a !== undefined ? val.a : val.s1)
                const b = getL(val.b !== undefined ? val.b : val.s2)
                const c = getL(val.c !== undefined ? val.c : val.s3)
                const d = getL(val.d !== undefined ? val.d : val.s4)
                givenStr = `a: ${a}, b: ${b}, c: ${c}, d: ${d}`
              } else {
                givenStr = JSON.stringify(val)
              }
            } else {
              givenStr = String(val).trim()
            }
          } else {
            givenStr = 'Bỏ trống (Chưa làm)'
            isUnanswered = true
          }
          if (isClassHomeworkPopup) {
            isUnanswered = isBlankWrongAnswer(sa.given_answer)
            if (isUnanswered) givenStr = 'Bỏ trống (Chưa làm)'
          }

          const wrongItem = {
            questionNumber: qNum,
            questionType: qType,
            prompt: q.prompt || '',
            correctAnswer: correctAnsStr,
            givenAnswer: givenStr,
            isUnanswered,
            scoreEarned: sa.score_earned || 0,
          }

          if (!wrongAnswersMap.has(sa.submission_id)) {
            wrongAnswersMap.set(sa.submission_id, [])
          }
          wrongAnswersMap.get(sa.submission_id)!.push(wrongItem)

          const studentInfo = studentProfileMap.get(sa.submission_id) || { id: '', name: 'Học sinh', phone: '', submittedAt: null }
          const summaryKey = isClassHomeworkPopup ? q.id : qNum
          if (!wrongQuestionsSummaryMap.has(summaryKey)) {
            wrongQuestionsSummaryMap.set(summaryKey, {
              ...(isClassHomeworkPopup ? {
                questionId: q.id,
                questionTypeTag: resolveWrongQuestionType(q.prompt, q.question_bank),
                totalSubmittedAttempts: new Set(subIds).size,
              } : {}),
              questionNumber: qNum,
              questionType: qType,
              prompt: q.prompt || '',
              correctAnswer: correctAnsStr,
              totalFailed: 0,
              wrongCount: 0,
              unansweredCount: 0,
              students: []
            })
          }

          const summaryObj = wrongQuestionsSummaryMap.get(summaryKey)
          summaryObj.totalFailed += 1
          if (isUnanswered) {
            summaryObj.unansweredCount += 1
          } else {
            summaryObj.wrongCount += 1
          }
          summaryObj.students.push({
            ...(isClassHomeworkPopup ? { submissionId: sa.submission_id, submittedAt: studentInfo.submittedAt } : {}),
            studentId: studentInfo.id,
            studentName: studentInfo.name,
            phone: studentInfo.phone,
            givenAnswer: givenStr,
            isUnanswered,
            scoreEarned: sa.score_earned || 0
          })
        }
      }
    }

    const history = (rawSubmissions || []).map((sub: any) => {
      const hw = sub.homeworks || {}
      const lesson = hw.lessons || {}
      const chapter = lesson.chapters || {}
      const cls = chapter.classes || {}
      const profile = sub.profiles || {}

      const score = Number(sub.total_score)
      const passScore = Number(hw.pass_score ?? 5)
      const maxScore = Number(sub.max_score || hw.max_score || 10)
      const isPassed = score >= passScore
      const isLate = sub.is_late || (hw.deadline ? new Date(sub.submitted_at) > new Date(hw.deadline) : false)

      const wrongAnswers = wrongAnswersMap.get(sub.id) || []
      wrongAnswers.sort((a: any, b: any) => a.questionNumber - b.questionNumber)

      const studentName = sub.guest_name || profile.full_name || (sub.is_trial ? 'Học sinh trải nghiệm' : 'Học sinh')
      const username = profile.username || (sub.guest_phone ? sub.guest_phone : '')

      return {
        id: sub.id,
        submissionId: sub.id,
        homeworkId: sub.homework_id,
        homeworkTitle: hw.title || 'Bài tập',
        score,
        bonusScore: Number(sub.bonus_score || 0),
        maxScore,
        passScore,
        isPassed,
        type: hw.type || 'PRACTICE',
        correctCount: sub.correct_count,
        wrongCount: sub.wrong_count,
        durationSecondsTaken: sub.duration_seconds_taken || 0,
        isLate,
        isTrial: sub.is_trial || false,
        guestName: sub.guest_name || null,
        guestPhone: sub.guest_phone || null,
        submittedAt: sub.submitted_at,
        lessonId: lesson.id,
        lessonTitle: lesson.title || '',
        chapterId: chapter.id,
        chapterTitle: chapter.title || '',
        classId: cls.id || (isTrialQuery ? 'TRIAL' : ''),
        className: cls.name || (isTrialQuery ? 'Học thử' : 'Lớp học'),
        studentId: sub.student_id,
        studentName,
        username,
        wrongAnswers: (user?.role === 'ADMIN' || isTrialQuery) ? wrongAnswers : undefined,
        // Chỉ admin (đang xem danh sách) thấy log; map đã limit theo current page.
        ...(awardLogsBySubmission ? { questionAwardLogs: awardLogsBySubmission.get(sub.id) || [] } : {}),
      }
    })

    const wrongQuestionsSummary = Array.from(wrongQuestionsSummaryMap.values())
      .sort((a: any, b: any) => a.questionNumber - b.questionNumber)

    // Build Stats & Unsubmitted list
    let submissionStats: any = null
    let unsubmittedStudents: any[] = []

    if (isTrialQuery) {
      const totalSubmissions = history.length
      const totalScores = history.reduce((acc: number, s: any) => acc + (s.score || 0), 0)
      const avgScore = totalSubmissions > 0 ? Math.round((totalScores / totalSubmissions) * 10) / 10 : 0
      const passCount = history.filter((s: any) => s.isPassed).length
      const uniquePhones = new Set(history.map((s: any) => s.guestPhone).filter(Boolean))

      const targetHw = homeworkId ? classHomeworks.find(h => h.id === homeworkId) : null

      submissionStats = {
        totalStudents: uniquePhones.size || totalSubmissions,
        submittedCount: totalSubmissions,
        unsubmittedCount: 0,
        inProgressCount: 0,
        submissionRate: 100,
        averageScore: avgScore,
        passCount,
        passRate: totalSubmissions > 0 ? Math.round((passCount / totalSubmissions) * 100) : 0,
        leadsCount: uniquePhones.size,
        homeworkTitle: targetHw ? targetHw.title : (homeworkId ? (history[0]?.homeworkTitle || 'Bài tập học thử') : 'Tất cả bài tập học thử'),
        homeworkType: targetHw?.type || 'PRACTICE',
        durationMinutes: targetHw?.durationMinutes || 45,
        deadline: targetHw?.deadline || null,
        isOverdue: false
      }
    } else if (classId && classId !== 'TRIAL') {
      const targetHw = homeworkId ? classHomeworks.find((h: any) => h.id === homeworkId) : null

      if (homeworkId && targetHw) {
        // Use prefetched enrolled students if available, otherwise fetch
        let enrolledStudents = prefetchedEnrolledStudents
        if (!enrolledStudents) {
          const { data: esData } = await serviceRoleClient
            .from('student_classes')
            .select(`
              student_id,
              profiles (id, username, full_name)
            `)
            .eq('class_id', classId)
          enrolledStudents = esData || []
        }

        const submittedStudentIds = new Set(history.map((s: any) => s.studentId).filter(Boolean))
        const isHwOverdue = targetHw.deadline ? new Date() > new Date(targetHw.deadline) : false

        unsubmittedStudents = (enrolledStudents || [])
          .filter((es: any) => !popupEligibleStudentIds || popupEligibleStudentIds.has(es.student_id))
          .filter((es: any) => !submittedStudentIds.has(es.student_id))
          .map((es: any) => ({
            id: es.student_id,
            studentId: es.student_id,
            fullName: es.profiles?.full_name || 'Học sinh',
            studentName: es.profiles?.full_name || 'Học sinh',
            username: es.profiles?.username || '',
            status: 'NOT_STARTED',
            isOverdue: isHwOverdue,
            deadline: targetHw.deadline || null
          }))

        const totalClassStudents = popupEligibleStudentIds ? popupEligibleStudentIds.size : (enrolledStudents || []).length
        const submittedCount = popupEligibleStudentIds ? submittedStudentIds.size : history.length
        const avgScore = history.length > 0 ? Math.round((history.reduce((a: number, s: any) => a + (s.score || 0), 0) / history.length) * 10) / 10 : 0
        const passCount = history.filter((s: any) => s.isPassed).length

        submissionStats = {
          totalStudents: totalClassStudents,
          submittedCount,
          unsubmittedCount: unsubmittedStudents.length,
          inProgressCount: 0,
          submissionRate: totalClassStudents > 0 ? Math.round((submittedCount / totalClassStudents) * 100) : 0,
          averageScore: avgScore,
          passCount,
          passRate: history.length > 0 ? Math.round((passCount / history.length) * 100) : 0,
          isOverdue: isHwOverdue,
          deadline: targetHw.deadline || null,
          homeworkTitle: targetHw.title || history[0]?.homeworkTitle || 'Bài tập',
          homeworkType: targetHw.type || 'PRACTICE',
          durationMinutes: targetHw.durationMinutes || 45
        }
      }
    }

    return jsonResponse({
      studentId: studentId || (user?.role === 'STUDENT' ? user.id : undefined),
      classId: classId || (isTrialQuery ? 'TRIAL' : undefined),
      homeworkId: homeworkId || undefined,
      totalSubmissions: pageInfo ? pageInfo.total : history.length,
      total: pageInfo ? pageInfo.total : history.length,
      page: pageInfo ? pageInfo.page : 1,
      pageSize: pageInfo ? pageInfo.pageSize : history.length,
      totalPages: pageInfo ? pageInfo.totalPages : 1,
      history,
      wrongQuestionsSummary: (user?.role === 'ADMIN' || isTrialQuery) ? wrongQuestionsSummary : undefined,
      classHomeworks,
      submissionStats,
      unsubmittedStudents,
    })
  } catch (err: unknown) {
    const error = err as Error
    return errorResponse(error.message || 'Unauthorized / Error', 401)
  }
})
