/**
 * Pure business logic for progress report insights (scope=report | shared-report).
 * No Deno / npm imports to enable direct unit testing with Node.
 */

import {
  resolveWrongQuestionType,
  uniqueWrongAttempts,
  isBlankWrongAnswer,
} from './wrong-analysis.ts'

export type DifficultyLevel = 'NHAN_BIET' | 'THONG_HIEU' | 'VAN_DUNG' | 'VAN_DUNG_CAO'

export const VALID_DIFFICULTY_LEVELS: readonly DifficultyLevel[] = [
  'NHAN_BIET',
  'THONG_HIEU',
  'VAN_DUNG',
  'VAN_DUNG_CAO',
] as const

export interface PeriodSummary {
  averageScore: number
  completionRate: number
  onTimeRate: number
  submittedCount: number
}

export interface PreviousPeriod {
  fromDate: string
  toDate: string
  summary: PeriodSummary | null
}

export interface ClassAverage {
  averageScore: number | null
  studentCount: number
}

export interface WeeklyTrendItem {
  weekStart: string
  averageScore: number | null
  submissions: number
  classAverageScore: number | null
}

export interface LevelBreakdownItem {
  level: DifficultyLevel
  correct: number
  total: number
  rate: number | null
}

export interface CommonMistakeItem {
  questionType: string
  wrongCount: number
}

export interface ReportNotes {
  summary: string | null
  strengths: string | null
  improvements: string | null
  attitude: string | null
  goalText: string | null
  goalScore: number | null
  teacherSupport: string | null
  parentActions: string | null
  updatedAt: string | null
  isSaved: true
}

export interface PreviousGoal {
  goalScore: number | null
  goalText: string | null
  fromDate: string
  toDate: string
}

export const round2 = (n: number): number => Math.round(n * 100) / 100

/**
 * Validates calendar date formatted as YYYY-MM-DD.
 * Prevents invalid dates like 2026-02-30.
 */
export function isValidCalendarDate(raw: string): boolean {
  if (typeof raw !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(raw)) return false
  const [y, m, d] = raw.split('-').map(Number)
  if (!Number.isInteger(y) || !Number.isInteger(m) || !Number.isInteger(d)) return false
  const dt = new Date(Date.UTC(y, m - 1, d))
  return dt.getUTCFullYear() === y && dt.getUTCMonth() === m - 1 && dt.getUTCDate() === d
}

/**
 * Returns number of calendar days between fromDate and toDate (inclusive).
 */
export function getCalendarDays(fromDate: string, toDate: string): number {
  const [y1, m1, d1] = fromDate.split('-').map(Number)
  const [y2, m2, d2] = toDate.split('-').map(Number)
  const dt1 = Date.UTC(y1, m1 - 1, d1)
  const dt2 = Date.UTC(y2, m2 - 1, d2)
  return Math.round((dt2 - dt1) / 86400000) + 1
}

/**
 * Computes previous period of identical length:
 * toDate = fromDate - 1 day
 * fromDate = toDate - (currentDays - 1) days
 */
export function getPreviousPeriod(fromDate: string, toDate: string): { fromDate: string; toDate: string; days: number } {
  const days = getCalendarDays(fromDate, toDate)
  const [y, m, d] = fromDate.split('-').map(Number)
  const fromMs = Date.UTC(y, m - 1, d)
  const toMs = fromMs - 86400000
  const prevFromMs = toMs - (days - 1) * 86400000

  const toDateObj = new Date(toMs)
  const fromDateObj = new Date(prevFromMs)

  return {
    fromDate: fromDateObj.toISOString().substring(0, 10),
    toDate: toDateObj.toISOString().substring(0, 10),
    days,
  }
}

/**
 * Returns YYYY-MM-DD of Monday for a given calendar date (YYYY-MM-DD).
 */
export function getMondayOfWeek(dateStr: string): string {
  const [y, m, d] = dateStr.split('-').map(Number)
  const dt = new Date(Date.UTC(y, m - 1, d))
  const day = dt.getUTCDay() // 0 = Sun, 1 = Mon, ..., 6 = Sat
  const diffToMon = day === 0 ? -6 : 1 - day
  const mondayMs = dt.getTime() + diffToMon * 86400000
  return new Date(mondayMs).toISOString().substring(0, 10)
}

/**
 * Returns list of Monday dates (YYYY-MM-DD) for all weeks intersecting [fromDate, toDate] in chronological order.
 */
export function getIntersectingWeeks(fromDate: string, toDate: string): string[] {
  const startMon = getMondayOfWeek(fromDate)
  const endMon = getMondayOfWeek(toDate)
  const weeks: string[] = []

  let curMs = new Date(`${startMon}T00:00:00.000Z`).getTime()
  const endMs = new Date(`${endMon}T00:00:00.000Z`).getTime()

  while (curMs <= endMs) {
    weeks.push(new Date(curMs).toISOString().substring(0, 10))
    curMs += 7 * 86400000
  }
  return weeks
}

/**
 * Converts timestamp to Vietnam dateKey (YYYY-MM-DD in UTC+7).
 */
export function toVnDateKey(submittedAt: string | Date | number | null | undefined): string {
  if (!submittedAt) return ''
  if (typeof submittedAt === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(submittedAt)) {
    return submittedAt
  }
  const d = typeof submittedAt === 'string' || typeof submittedAt === 'number' ? new Date(submittedAt) : submittedAt
  if (isNaN(d.getTime())) return ''
  const vnTime = new Date(d.getTime() + 7 * 3600 * 1000)
  return vnTime.toISOString().substring(0, 10)
}

/**
 * Calculates scaled score (0 to 10).
 */
export function calculateScaledScore(totalScore: unknown, maxScore: unknown): number {
  const score = Number(totalScore) || 0
  const max = Number(maxScore) || 10
  if (max <= 0) return 0
  return Math.min(10, Math.max(0, (score / max) * 10))
}

/**
 * Checks if a homework's deadline falls within [fromMs, toMs].
 * Homework without deadline is considered open to all periods.
 */
export function isDeadlineInRange(hw: any, fromMs: number, toMs: number): boolean {
  if (!hw) return false
  if (!hw.deadline) return true
  const t = new Date(hw.deadline).getTime()
  return Number.isFinite(t) && t >= fromMs && t <= toMs
}

/**
 * Builds period summary for previousPeriod.
 * If atts is empty, returns null.
 */
export function buildPeriodSummary(atts: any[], assignedHomeworks: any[]): PeriodSummary | null {
  if (!Array.isArray(atts) || atts.length === 0) return null

  const bestMap = new Map<string, number>()
  atts.forEach((a: any) => {
    const hwId = a.homeworkId || a.homework_id
    if (!hwId) return
    const score = a.scaledScore !== undefined ? Number(a.scaledScore) : calculateScaledScore(a.total_score ?? a.score, a.max_score)
    const cur = bestMap.get(hwId)
    if (cur === undefined || score > cur) {
      bestMap.set(hwId, score)
    }
  })

  if (bestMap.size === 0) return null

  const bestScores = Array.from(bestMap.values())
  const assigned = Array.isArray(assignedHomeworks) ? assignedHomeworks : []
  const assignedHwIdSet = new Set<string>(assigned.map((h: any) => h.id || h.homeworkId))
  const submittedAssignedCount = Array.from(bestMap.keys()).filter(id => assignedHwIdSet.has(id)).length
  const completionRate = assigned.length > 0 ? Math.min(100, round2((submittedAssignedCount / assigned.length) * 100)) : 0
  const onTimeCount = atts.filter((a: any) => !a.isLate && !a.is_late).length
  const attemptCount = atts.length
  const onTimeRate = attemptCount > 0 ? round2((onTimeCount / attemptCount) * 100) : 100
  const averageScore = bestScores.length > 0 ? round2(bestScores.reduce((acc, v) => acc + v, 0) / bestScores.length) : 0

  return {
    averageScore,
    completionRate,
    onTimeRate,
    submittedCount: bestMap.size,
  }
}

/**
 * Computes class average from raw submissions:
 * - Only ACTIVE students enrolled in the class.
 * - Only students with at least 1 submission in the period.
 * - Each student's average = average of best scaled scores per homework.
 * - Class average = average of student averages.
 */
export function computeClassAverage(
  activeStudentIds: Set<string> | string[] | null | undefined,
  classSubmissions: any[]
): ClassAverage {
  const activeSet = activeStudentIds instanceof Set ? activeStudentIds : new Set(activeStudentIds || [])
  if (activeSet.size === 0 || !Array.isArray(classSubmissions) || classSubmissions.length === 0) {
    return { averageScore: null, studentCount: 0 }
  }

  // Group by studentId -> Map<homeworkId, bestScaledScore>
  const studentMap = new Map<string, Map<string, number>>()

  classSubmissions.forEach((s: any) => {
    const studentId = s.studentId || s.student_id
    if (!studentId || !activeSet.has(studentId)) return
    const hwId = s.homeworkId || s.homework_id
    if (!hwId) return
    const score = s.scaledScore !== undefined ? Number(s.scaledScore) : calculateScaledScore(s.total_score ?? s.score, s.max_score)

    let hwMap = studentMap.get(studentId)
    if (!hwMap) {
      hwMap = new Map<string, number>()
      studentMap.set(studentId, hwMap)
    }
    const cur = hwMap.get(hwId)
    if (cur === undefined || score > cur) {
      hwMap.set(hwId, score)
    }
  })

  const studentCount = studentMap.size
  if (studentCount === 0) {
    return { averageScore: null, studentCount: 0 }
  }

  let totalStudentAverages = 0
  studentMap.forEach((hwMap) => {
    const scores = Array.from(hwMap.values())
    const avg = scores.reduce((acc, v) => acc + v, 0) / scores.length
    totalStudentAverages += avg
  })

  const averageScore = round2(totalStudentAverages / studentCount)
  return { averageScore, studentCount }
}

/**
 * Computes weekly trend for the student, including class average per week.
 */
export function computeWeeklyTrend(params: {
  fromDate: string
  toDate: string
  studentAttempts: any[]
  classAttempts?: any[]
  activeStudentIds?: Set<string> | string[]
  classWeeklyStatsMap?: Map<string, number | null>
}): WeeklyTrendItem[] {
  const { fromDate, toDate, studentAttempts, classAttempts, activeStudentIds, classWeeklyStatsMap } = params
  const weeks = getIntersectingWeeks(fromDate, toDate)

  // Pre-group student attempts by weekStart
  const studentByWeek = new Map<string, any[]>()
  ;(studentAttempts || []).forEach((a: any) => {
    const dateKey = a.dateKey || toVnDateKey(a.submittedAt || a.submitted_at)
    if (!dateKey) return
    const weekStart = getMondayOfWeek(dateKey)
    let list = studentByWeek.get(weekStart)
    if (!list) {
      list = []
      studentByWeek.set(weekStart, list)
    }
    list.push(a)
  })

  // Pre-calculate class weekly average if not provided via classWeeklyStatsMap
  const computedClassWeeklyMap = new Map<string, number | null>()
  if (classWeeklyStatsMap) {
    classWeeklyStatsMap.forEach((v, k) => computedClassWeeklyMap.set(k, v))
  } else if (Array.isArray(classAttempts) && classAttempts.length > 0 && activeStudentIds) {
    const activeSet = activeStudentIds instanceof Set ? activeStudentIds : new Set(activeStudentIds)
    // Group class submissions by weekStart -> studentId -> Map<homeworkId, bestScore>
    const classWeekMap = new Map<string, Map<string, Map<string, number>>>()

    classAttempts.forEach((s: any) => {
      const studentId = s.studentId || s.student_id
      if (!studentId || !activeSet.has(studentId)) return
      const dateKey = toVnDateKey(s.submittedAt || s.submitted_at)
      if (!dateKey) return
      const weekStart = getMondayOfWeek(dateKey)
      const hwId = s.homeworkId || s.homework_id
      if (!hwId) return
      const score = s.scaledScore !== undefined ? Number(s.scaledScore) : calculateScaledScore(s.total_score ?? s.score, s.max_score)

      let weekStudents = classWeekMap.get(weekStart)
      if (!weekStudents) {
        weekStudents = new Map<string, Map<string, number>>()
        classWeekMap.set(weekStart, weekStudents)
      }
      let studentHws = weekStudents.get(studentId)
      if (!studentHws) {
        studentHws = new Map<string, number>()
        weekStudents.set(studentId, studentHws)
      }
      const cur = studentHws.get(hwId)
      if (cur === undefined || score > cur) {
        studentHws.set(hwId, score)
      }
    })

    classWeekMap.forEach((weekStudents, weekStart) => {
      const studentCount = weekStudents.size
      if (studentCount === 0) {
        computedClassWeeklyMap.set(weekStart, null)
      } else {
        let sumAverages = 0
        weekStudents.forEach((studentHws) => {
          const scores = Array.from(studentHws.values())
          sumAverages += scores.reduce((acc, v) => acc + v, 0) / scores.length
        })
        computedClassWeeklyMap.set(weekStart, round2(sumAverages / studentCount))
      }
    })
  }

  return weeks.map((weekStart) => {
    const attemptsInWeek = studentByWeek.get(weekStart) || []
    let studentAvg: number | null = null

    if (attemptsInWeek.length > 0) {
      const bestMap = new Map<string, number>()
      attemptsInWeek.forEach((a: any) => {
        const hwId = a.homeworkId || a.homework_id
        if (!hwId) return
        const score = a.scaledScore !== undefined ? Number(a.scaledScore) : calculateScaledScore(a.total_score ?? a.score, a.max_score)
        const cur = bestMap.get(hwId)
        if (cur === undefined || score > cur) {
          bestMap.set(hwId, score)
        }
      })
      if (bestMap.size > 0) {
        const scores = Array.from(bestMap.values())
        studentAvg = round2(scores.reduce((acc, v) => acc + v, 0) / scores.length)
      }
    }

    const classAverageScore = computedClassWeeklyMap.has(weekStart)
      ? computedClassWeeklyMap.get(weekStart)!
      : null

    return {
      weekStart,
      averageScore: studentAvg,
      submissions: attemptsInWeek.length,
      classAverageScore,
    }
  })
}

/**
 * Generates an empty level breakdown with all 4 levels initialized to total: 0, rate: null.
 */
export function getEmptyLevelBreakdown(): LevelBreakdownItem[] {
  return VALID_DIFFICULTY_LEVELS.map((level) => ({
    level,
    correct: 0,
    total: 0,
    rate: null,
  }))
}

/**
 * Computes question difficulty breakdown across the 4 levels:
 * - Only answers from best attempts of each homework.
 * - Only questions with questions.question_bank_id -> question_bank.difficulty.
 * - Level with 0 questions -> total: 0, rate: null.
 */
export function computeLevelBreakdown(
  bestAnswers: any[],
  questionsMap: Map<string, any>
): LevelBreakdownItem[] {
  const counts: Record<DifficultyLevel, { correct: number; total: number }> = {
    NHAN_BIET: { correct: 0, total: 0 },
    THONG_HIEU: { correct: 0, total: 0 },
    VAN_DUNG: { correct: 0, total: 0 },
    VAN_DUNG_CAO: { correct: 0, total: 0 },
  }

  const seenAnswers = new Set<string>()

  ;(bestAnswers || []).forEach((sa: any) => {
    const key = `${sa.submission_id}:${sa.question_id}`
    if (seenAnswers.has(key)) return
    seenAnswers.add(key)

    const q = sa.questions || questionsMap.get(sa.question_id)
    if (!q) return

    // Must have question_bank_id and question_bank difficulty
    const bank = Array.isArray(q.question_bank) ? q.question_bank[0] : q.question_bank
    const difficultyRaw = bank?.difficulty || (q.question_bank_id && typeof q.difficulty === 'string' ? q.difficulty : null)
    if (!difficultyRaw || !(difficultyRaw in counts)) return

    const diff = difficultyRaw as DifficultyLevel
    counts[diff].total += 1
    if (sa.is_correct === true) {
      counts[diff].correct += 1
    }
  })

  return VALID_DIFFICULTY_LEVELS.map((level) => {
    const { correct, total } = counts[level]
    return {
      level,
      correct,
      total,
      rate: total > 0 ? round2((correct / total) * 100) : null,
    }
  })
}

/**
 * Computes common mistakes (top 5 questionType tags with highest wrongCount):
 * - Reuses resolveWrongQuestionType & uniqueWrongAttempts.
 * - Only best attempts.
 * - Returns at most 5 items sorted descending by wrongCount.
 */
export function computeCommonMistakes(
  bestAnswers: any[],
  questionsMap: Map<string, any>
): CommonMistakeItem[] {
  if (!Array.isArray(bestAnswers) || bestAnswers.length === 0) return []

  const uniqueRows = uniqueWrongAttempts(bestAnswers)
  const tagCounts = new Map<string, number>()

  for (const sa of uniqueRows) {
    if (sa.is_correct === true) continue

    const q = sa.questions || questionsMap.get(sa.question_id)
    if (!q || q.question_type === 'ESSAY') continue

    const tag = resolveWrongQuestionType(q.prompt, q.question_bank)
    if (tag) {
      tagCounts.set(tag, (tagCounts.get(tag) || 0) + 1)
    }
  }

  const list: CommonMistakeItem[] = Array.from(tagCounts.entries()).map(([questionType, wrongCount]) => ({
    questionType,
    wrongCount,
  }))

  list.sort((a, b) => b.wrongCount - a.wrongCount || a.questionType.localeCompare(b.questionType))

  return list.slice(0, 5)
}

/**
 * Maps raw student_report_notes row to ReportNotes object.
 */
export function mapReportNotes(raw: any): ReportNotes | null {
  if (!raw || typeof raw !== 'object') return null
  return {
    summary: raw.summary ?? null,
    strengths: raw.strengths ?? null,
    improvements: raw.improvements ?? null,
    attitude: raw.attitude ?? null,
    goalText: raw.goal_text ?? null,
    goalScore: raw.goal_score != null ? Number(raw.goal_score) : null,
    teacherSupport: raw.teacher_support ?? null,
    parentActions: raw.parent_actions ?? null,
    updatedAt: raw.updated_at ?? null,
    isSaved: true,
  }
}

/**
 * Maps raw student_report_notes row to PreviousGoal object.
 */
export function mapPreviousGoal(raw: any): PreviousGoal | null {
  if (!raw || typeof raw !== 'object') return null
  return {
    goalScore: raw.goal_score != null ? Number(raw.goal_score) : null,
    goalText: raw.goal_text ?? null,
    fromDate: raw.from_date,
    toDate: raw.to_date,
  }
}
