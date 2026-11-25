// Logic thuần cho student-report-notes: validate payload và sinh nháp nhận xét.
// Không import Deno hay thư viện ngoài.

export interface ValidatedNotesPayload {
  studentId: string
  classId: string
  fromDate: string
  toDate: string
  summary: string | null
  strengths: string | null
  improvements: string | null
  attitude: string | null
  goalText: string | null
  goalScore: number | null
  teacherSupport: string | null
  parentActions: string | null
}

export type ValidationResult =
  | { ok: true; value: ValidatedNotesPayload }
  | { ok: false; error: string }

export interface DraftNotes {
  summary: string
  strengths: string
  improvements: string
  attitude: string | null
  goalText: string
  goalScore: number | null
  teacherSupport: string
  parentActions: string
}

const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

export function isValidCalendarDate(raw: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(raw)) return false
  const [y, m, d] = raw.split('-').map(Number)
  if (!Number.isInteger(y) || !Number.isInteger(m) || !Number.isInteger(d)) return false
  const dt = new Date(Date.UTC(y, m - 1, d))
  return dt.getUTCFullYear() === y && dt.getUTCMonth() === m - 1 && dt.getUTCDate() === d
}

function cleanTextField(val: unknown, fieldName: string): { ok: true; val: string | null } | { ok: false; error: string } {
  if (val === undefined || val === null) return { ok: true, val: null }
  if (typeof val !== 'string') return { ok: false, error: `${fieldName} phải là chuỗi ký tự hoặc null` }
  const trimmed = val.trim()
  if (trimmed.length === 0) return { ok: true, val: null }
  if (trimmed.length > 1500) return { ok: false, error: `${fieldName} không được vượt quá 1500 ký tự` }
  return { ok: true, val: trimmed }
}

function cleanGoalScore(val: unknown): { ok: true; val: number | null } | { ok: false; error: string } {
  if (val === undefined || val === null || val === '') return { ok: true, val: null }
  let num: number
  if (typeof val === 'number') {
    num = val
  } else if (typeof val === 'string') {
    num = Number(val.replace(',', '.'))
  } else {
    return { ok: false, error: 'goalScore phải là số từ 0 đến 10' }
  }
  if (!Number.isFinite(num) || num < 0 || num > 10) {
    return { ok: false, error: 'goalScore phải là số từ 0 đến 10' }
  }
  return { ok: true, val: Math.round(num * 100) / 100 }
}

export function validateNotesPayload(body: unknown): ValidationResult {
  if (!body || typeof body !== 'object') {
    return { ok: false, error: 'Dữ liệu yêu cầu không hợp lệ' }
  }

  const b = body as Record<string, any>

  // 1. studentId & classId: UUID
  if (typeof b.studentId !== 'string' || !UUID_REGEX.test(b.studentId)) {
    return { ok: false, error: 'Mã học sinh (studentId) phải là UUID hợp lệ' }
  }
  if (typeof b.classId !== 'string' || !UUID_REGEX.test(b.classId)) {
    return { ok: false, error: 'Mã lớp (classId) phải là UUID hợp lệ' }
  }

  // 2. fromDate & toDate: YYYY-MM-DD và from <= to
  if (typeof b.fromDate !== 'string' || !isValidCalendarDate(b.fromDate)) {
    return { ok: false, error: 'Ngày bắt đầu (fromDate) phải có định dạng YYYY-MM-DD hợp lệ' }
  }
  if (typeof b.toDate !== 'string' || !isValidCalendarDate(b.toDate)) {
    return { ok: false, error: 'Ngày kết thúc (toDate) phải có định dạng YYYY-MM-DD hợp lệ' }
  }
  if (b.fromDate > b.toDate) {
    return { ok: false, error: 'Ngày bắt đầu (fromDate) phải nhỏ hơn hoặc bằng ngày kết thúc (toDate)' }
  }

  // 3. Text fields (<= 1500 chars, trim, '' -> null)
  const summaryRes = cleanTextField(b.summary, 'summary')
  if (!summaryRes.ok) return summaryRes

  const strengthsRes = cleanTextField(b.strengths, 'strengths')
  if (!strengthsRes.ok) return strengthsRes

  const improvementsRes = cleanTextField(b.improvements, 'improvements')
  if (!improvementsRes.ok) return improvementsRes

  const attitudeRes = cleanTextField(b.attitude, 'attitude')
  if (!attitudeRes.ok) return attitudeRes

  const goalTextRaw = b.goalText !== undefined ? b.goalText : b.goal_text
  const goalTextRes = cleanTextField(goalTextRaw, 'goalText')
  if (!goalTextRes.ok) return goalTextRes

  const teacherSupportRaw = b.teacherSupport !== undefined ? b.teacherSupport : b.teacher_support
  const teacherSupportRes = cleanTextField(teacherSupportRaw, 'teacherSupport')
  if (!teacherSupportRes.ok) return teacherSupportRes

  const parentActionsRaw = b.parentActions !== undefined ? b.parentActions : b.parent_actions
  const parentActionsRes = cleanTextField(parentActionsRaw, 'parentActions')
  if (!parentActionsRes.ok) return parentActionsRes

  // 4. goalScore: null | 0..10 làm tròn 2 chữ số
  const goalScoreRaw = b.goalScore !== undefined ? b.goalScore : b.goal_score
  const goalScoreRes = cleanGoalScore(goalScoreRaw)
  if (!goalScoreRes.ok) return goalScoreRes

  return {
    ok: true,
    value: {
      studentId: b.studentId,
      classId: b.classId,
      fromDate: b.fromDate,
      toDate: b.toDate,
      summary: summaryRes.val,
      strengths: strengthsRes.val,
      improvements: improvementsRes.val,
      attitude: attitudeRes.val,
      goalText: goalTextRes.val,
      goalScore: goalScoreRes.val,
      teacherSupport: teacherSupportRes.val,
      parentActions: parentActionsRes.val,
    },
  }
}

export function formatViNumber(n: number | null | undefined, decimals = 1): string {
  if (n === null || n === undefined || !Number.isFinite(Number(n))) return '0'
  const val = Number(n)
  const factor = Math.pow(10, decimals)
  const rounded = Math.round(val * factor) / factor
  return String(rounded).replace('.', ',')
}

/**
 * Sinh bản nháp nhận xét tiếng Việt thân thiện từ object báo cáo.
 * Nêu TIẾN BỘ / ĐIỂM MẠNH TRƯỚC, CẦN CẢI THIỆN SAU.
 * Tránh thuật ngữ kỹ thuật trần trụi.
 * Số định dạng kiểu Việt (7,5).
 */
export function buildDraftNotes(report: any): DraftNotes {
  const summaryObj = report?.summary || {}
  const submittedCount = Number(summaryObj.submittedCount) || 0
  const assignedCount = Number(summaryObj.assignedCount) || 0
  const hasScore = summaryObj.averageScore !== null &&
    summaryObj.averageScore !== undefined &&
    Number.isFinite(Number(summaryObj.averageScore))
  const averageScore = hasScore ? Number(summaryObj.averageScore) : null
  const completionRate = summaryObj.completionRate !== null && summaryObj.completionRate !== undefined && Number.isFinite(Number(summaryObj.completionRate))
    ? Number(summaryObj.completionRate)
    : 0
  const onTimeRate = summaryObj.onTimeRate !== null && summaryObj.onTimeRate !== undefined && Number.isFinite(Number(summaryObj.onTimeRate))
    ? Number(summaryObj.onTimeRate)
    : 100

  // 1. Mục tiêu đo được: goalScore = min(10, làm tròn 0,5 lên của (averageScore + 0,5)) nếu có điểm
  let goalScore: number | null = null
  let goalText = ''
  if (submittedCount > 0 && averageScore !== null) {
    const rawTarget = averageScore + 0.5
    const ceil05 = Math.ceil(rawTarget / 0.5) * 0.5
    goalScore = Math.min(10, Math.round(ceil05 * 10) / 10)
    goalText = `Đạt điểm trung bình từ ${formatViNumber(goalScore)} trở lên và hoàn thành tối thiểu 90% bài tập được giao trong kỳ tới.`
  } else {
    goalScore = null
    goalText = 'Hoàn thành đầy đủ các bài tập được giao và duy trì chuyên cần trong kỳ tới.'
  }

  // 2. Thái độ: giáo viên tự nhập nên để null
  const attitude: string | null = null

  // Trích xuất chuyên đề, chuyên cần, mức độ tư duy, lỗi hay sai
  const topicList: any[] = Array.isArray(report?.topicBreakdown) ? report.topicBreakdown : []
  const goodTopics: string[] = topicList
    .filter(t => t?.topicTitle && Number(t.averageScore) >= 6.5)
    .map(t => String(t.topicTitle).trim())
  const weakTopics: string[] = topicList
    .filter(t => t?.topicTitle && Number(t.averageScore) < 6.5)
    .map(t => String(t.topicTitle).trim())

  const commonMistakesList: any[] = Array.isArray(report?.commonMistakes) ? report.commonMistakes : []
  const mistakeNames: string[] = commonMistakesList
    .map(m => m?.questionType ? String(m.questionType).trim() : null)
    .filter((v): v is string => Boolean(v))
    .slice(0, 3)

  const attSummary = report?.attendance?.summary

  // 3. Tóm tắt (summary): 2–3 câu
  let summary = ''
  if (submittedCount === 0) {
    summary = 'Trong kỳ báo cáo này, học sinh chưa có lượt nộp bài tập nào để ghi nhận kết quả. Giáo viên sẽ phối hợp cùng gia đình để đôn đốc con bắt đầu nộp bài và theo sát lộ trình học tập.'
  } else {
    // Câu 1: Tiến bộ / Điểm trung bình
    let sentence1 = ''
    const prevAvg = report?.previousPeriod?.summary?.averageScore != null && Number.isFinite(Number(report.previousPeriod.summary.averageScore))
      ? Number(report.previousPeriod.summary.averageScore)
      : null

    if (prevAvg !== null && averageScore !== null) {
      const diff = Math.round((averageScore - prevAvg) * 100) / 100
      if (diff > 0.25) {
        sentence1 = `Trong kỳ học này, con có tiến bộ rõ rệt với điểm trung bình đạt ${formatViNumber(averageScore)}/10, tăng ${formatViNumber(diff)} điểm so với kỳ trước.`
      } else if (diff < -0.25) {
        sentence1 = `Trong kỳ học này, con đạt điểm trung bình ${formatViNumber(averageScore)}/10, có phần giảm nhẹ so với kỳ trước (${formatViNumber(prevAvg)}).`
      } else {
        sentence1 = `Trong kỳ học này, con duy trì kết quả ổn định với điểm trung bình đạt ${formatViNumber(averageScore)}/10.`
      }
    } else if (averageScore !== null) {
      sentence1 = `Trong kỳ học này, con đạt điểm trung bình ${formatViNumber(averageScore)}/10 với tỉ lệ hoàn thành bài tập đạt ${formatViNumber(completionRate, 0)}%.`
    } else {
      sentence1 = `Trong kỳ học này, con đã tham gia các bài học và hoàn thành các bài tập được giao.`
    }

    // Câu 2: Chuyên cần / Ý thức
    let sentence2 = ''
    if (attSummary && Number.isFinite(Number(attSummary.attendanceRate))) {
      const present = attSummary.present ?? 0
      const sessions = attSummary.classSessions ?? present
      sentence2 = `Về chuyên cần, con tham gia ${present}/${sessions} buổi học (tỉ lệ ${formatViNumber(attSummary.attendanceRate, 0)}%) và giữ thái độ học tập nghiêm túc.`
    } else if (onTimeRate >= 80) {
      sentence2 = `Con có ý thức tự giác tốt, tỉ lệ nộp bài đúng hạn đạt ${formatViNumber(onTimeRate, 0)}%.`
    } else {
      sentence2 = `Con có cố gắng trong việc hoàn thành bài tập và lắng nghe hướng dẫn của thầy cô.`
    }

    // Câu 3: Điểm cần cải thiện
    let sentence3 = ''
    if (weakTopics.length > 0) {
      sentence3 = `Con cần chú ý ôn tập thêm ở phần kiến thức còn lúng túng (${weakTopics.slice(0, 2).join(', ')}) để tự tin đạt kết quả cao hơn.`
    } else if (onTimeRate < 75) {
      sentence3 = `Con cần sắp xếp thời gian làm bài sớm hơn, tránh để sát hạn nộp bài.`
    } else {
      sentence3 = `Con cần tiếp tục rèn luyện thêm các bài toán mở rộng để nâng cao kỹ năng tư duy phản xạ.`
    }

    summary = `${sentence1} ${sentence2} ${sentence3}`
  }

  // 4. Điểm mạnh (strengths): Tiến bộ trước, điểm mạnh trước
  const strengthBullets: string[] = []
  if (submittedCount === 0) {
    strengthBullets.push('- Học sinh có thái độ hòa nhã, sẵn sàng tiếp thu hướng dẫn của thầy cô.')
    strengthBullets.push('- Có tinh thần phối hợp với giáo viên để bắt đầu kế hoạch học tập mới.')
  } else {
    if (goodTopics.length > 0) {
      strengthBullets.push(`- Nắm chắc kiến thức và làm tốt bài tập ở các chuyên đề: ${goodTopics.slice(0, 3).join(', ')}.`)
    } else {
      strengthBullets.push('- Nắm được các kiến thức trọng tâm cơ bản trong chương trình học.')
    }

    // Phân tích mức độ tư duy (không dùng thuật ngữ trần trụi)
    strengthBullets.push('- Giải quyết nhanh và chính xác các câu hỏi nhận biết và thông hiểu cơ bản.')

    if (onTimeRate >= 80) {
      strengthBullets.push(`- Tinh thần tự giác làm bài tốt, tỉ lệ nộp đúng hạn đạt ${formatViNumber(onTimeRate, 0)}%.`)
    }
    if (attSummary && Number(attSummary.attendanceRate) >= 80) {
      strengthBullets.push('- Đi học chuyên cần, tập trung lắng nghe bài giảng và tích cực tương tác.')
    }

    if (strengthBullets.length < 2) {
      strengthBullets.push('- Có ý thức nỗ lực và tiến bộ từng ngày qua các buổi học.')
    }
  }
  const strengths = strengthBullets.join('\n')

  // 5. Cần cải thiện (improvements): Cần cải thiện sau, tránh "yếu vận dụng"
  const improvementBullets: string[] = []
  if (submittedCount === 0) {
    improvementBullets.push('- Cần chủ động làm và nộp bài tập đầy đủ theo đúng hạn để thầy cô theo dõi.')
    improvementBullets.push('- Cần liên hệ với thầy cô ngay khi gặp vướng mắc ở các bài tập đầu kỳ.')
  } else {
    if (weakTopics.length > 0) {
      improvementBullets.push(`- Cần ôn tập kỹ lại lý thuyết và làm thêm bài tập ở các chương: ${weakTopics.slice(0, 3).join(', ')}.`)
    }

    // Luôn dùng diễn đạt thân thiện thay vì "yếu vận dụng"
    improvementBullets.push('- Làm được bài cơ bản, còn lúng túng ở bài vận dụng và vận dụng nâng cao, cần rèn thêm khả năng phân tích đề.')

    if (mistakeNames.length > 0) {
      improvementBullets.push(`- Cần chú ý cẩn thận, tránh lỗi sai ở các dạng câu: ${mistakeNames.join(', ')}.`)
    }

    if (completionRate < 80) {
      improvementBullets.push(`- Cần hoàn thành đầy đủ các bài tập được giao (kỳ này đạt ${formatViNumber(completionRate, 0)}%).`)
    } else if (onTimeRate < 80) {
      improvementBullets.push('- Cần phân bổ thời gian hợp lý, hạn chế nộp bài sát hạn chót.')
    }

    if (improvementBullets.length < 2) {
      improvementBullets.push('- Cần rèn thói quen kiểm tra lại các bước tính toán trước khi bấm nộp bài.')
    }
  }
  const improvements = improvementBullets.join('\n')

  // 6. Giáo viên hỗ trợ (teacherSupport): gợi ý theo chương < 6,5 và dạng bài hay sai
  const supportBullets: string[] = []
  if (submittedCount === 0) {
    supportBullets.push('- Hướng dẫn trực tiếp phương pháp học và giải đáp chi tiết các bài tập đầu tiên.')
    supportBullets.push('- Định kỳ kiểm tra tiến độ nộp bài và nhắc nhở con vào đầu mỗi tuần.')
  } else {
    if (weakTopics.length > 0) {
      supportBullets.push(`- Dành 15 phút đầu giờ củng cố lại kiến thức các chương con còn lúng túng: ${weakTopics.slice(0, 2).join(', ')}.`)
    } else {
      supportBullets.push('- Giao thêm các bài tập mở rộng và nâng cao để phát huy tối đa năng lực của con.')
    }

    if (mistakeNames.length > 0) {
      supportBullets.push(`- Hướng dẫn chi tiết phương pháp giải và các bẫy thường gặp cho dạng bài: ${mistakeNames.join(', ')}.`)
    } else {
      supportBullets.push('- Hướng dẫn phương pháp tối ưu hóa thời gian và chiến thuật làm bài kiểm tra.')
    }

    supportBullets.push('- Định kỳ kiểm tra vở ghi và giải đáp ngay các câu hỏi con còn băn khoăn.')
  }
  const teacherSupport = supportBullets.join('\n')

  // 7. Phụ huynh có thể làm gì (parentActions): 2 gợi ý cụ thể
  const parentBullets: string[] = []
  if (onTimeRate < 80 || completionRate < 80) {
    parentBullets.push('- Nhắc con làm bài trước hạn, kiểm tra 2 lần mỗi tuần.')
  } else {
    parentBullets.push('- Khích lệ con duy trì thói quen làm bài tập sớm và giữ vững phong độ học tập.')
  }

  if (attSummary && Number(attSummary.attendanceRate) < 85) {
    parentBullets.push('- Động viên con tham gia đầy đủ các buổi học và báo trước cho thầy cô nếu có việc bận đột xuất.')
  } else {
    parentBullets.push('- Khuyến khích con mạnh dạn trao đổi lại với thầy cô ngay khi gặp bài tập chưa hiểu.')
  }
  const parentActions = parentBullets.join('\n')

  return {
    summary,
    strengths,
    improvements,
    attitude,
    goalText,
    goalScore,
    teacherSupport,
    parentActions,
  }
}
