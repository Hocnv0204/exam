/**
 * regrade-preserve.ts — Kết hợp kết quả chấm lại toàn bài (gradeExam) với các điểm
 * phải GIỮ NGUYÊN khi sửa cấu trúc đề:
 *  1. Câu đã được admin cộng điểm thủ công (có question_award_logs theo answer_id,
 *     hoặc câu sai nhưng đã được cộng đủ điểm câu — tổng chạm trần nên không có log).
 *  2. Câu tự luận (ESSAY): chấm tay, gradeQuestion không chấm được → giữ điểm cũ.
 *  3. bonus_score của bài nộp: tổng = điểm gốc chấm lại + thưởng, chặn trần max_score
 *     (cùng quy ước với set-bonus và planQuestionRegrade).
 *
 * Module thuần (chỉ type annotation erasable) để node test import trực tiếp.
 */

export interface PreserveQuestionInput {
  questionId: string
  questionType: string
  points: number
}

export interface PreserveGradeResult {
  isCorrect: boolean
  scoreEarned: number
}

export interface PreserveOldAnswer {
  id: string
  is_correct?: boolean | null
  score_earned?: number | string | null
}

const round2 = (n: number) => Math.round((Number(n) || 0) * 100) / 100

/** Câu trả lời cũ có phải điểm cần giữ nguyên (cộng tay / tự luận) không. */
export function isPreservedAnswer(
  question: PreserveQuestionInput,
  oldAnswer: PreserveOldAnswer | undefined,
  awardedAnswerIds: Set<string>
): boolean {
  if (!oldAnswer) return false
  if (question.questionType === 'ESSAY') return true
  if (awardedAnswerIds.has(oldAnswer.id)) return true
  const points = Number(question.points) || 0
  return !oldAnswer.is_correct && points > 0 && Number(oldAnswer.score_earned) >= points - 1e-9
}

/**
 * @returns điểm/đếm mới của bài nộp + danh sách index câu được chấm lại (cần ghi answer).
 * Chuẩn hoá thang điểm và làm tròn giống hệt gradeExam (shared/grading-service.ts).
 */
export function combineRegrade(input: {
  questions: PreserveQuestionInput[]
  results: PreserveGradeResult[]
  oldAnswers: Array<PreserveOldAnswer | undefined>
  awardedAnswerIds: Set<string>
  targetScale: number
  roundingStep?: number
  bonusScore?: number | string | null
  maxScore?: number | string | null
}) {
  const targetScale = Number(input.targetScale) || 10
  const roundingStep = input.roundingStep ?? 0.01
  let rawEarned = 0
  let rawMax = 0
  let correctCount = 0
  let wrongCount = 0
  const regradedIndexes: number[] = []

  input.questions.forEach((q, i) => {
    const old = input.oldAnswers[i]
    const preserved = isPreservedAnswer(q, old, input.awardedAnswerIds)
    const isCorrect = preserved ? !!old!.is_correct : !!input.results[i]?.isCorrect
    const score = preserved ? (Number(old!.score_earned) || 0) : (Number(input.results[i]?.scoreEarned) || 0)
    if (!preserved) regradedIndexes.push(i)
    rawEarned += score
    rawMax += Number(q.points) || 0
    if (isCorrect) correctCount += 1
    else if (q.questionType !== 'ESSAY') wrongCount += 1
  })

  let normalized = rawEarned
  if (rawMax <= 0) normalized = 0
  else if (Math.abs(rawMax - targetScale) >= 1e-6) normalized = (rawEarned / rawMax) * targetScale
  let base = normalized
  if (roundingStep > 0) base = Math.round(normalized / roundingStep) * roundingStep
  base = Math.min(targetScale, Math.max(0, Number(base.toFixed(2))))

  const bonus = round2(Number(input.bonusScore) || 0)
  const maxRaw = Number(input.maxScore)
  const max = Number.isFinite(maxRaw) && maxRaw > 0 ? maxRaw : targetScale
  const totalScore = Math.max(0, Math.min(max, round2(base + bonus)))

  return { totalScore, baseScore: base, correctCount, wrongCount, regradedIndexes }
}
