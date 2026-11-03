import { gradeQuestion, type QuestionGradeInput } from '../../shared/grading-service.ts'

export type EditedQuestionKey = {
  mcAnswer: string | null
  tfAnswers: Record<string, boolean> | null
  saAnswer: string | number | null
  saTolerance: number | null
}

export type RegradeAnswerRow = {
  id: string
  submission_id: string
  given_answer: any
  score_earned: number | null
  is_correct: boolean | null
  /** Câu đã được admin cộng điểm thủ công: giữ nguyên, không chấm lại. */
  locked?: boolean
}

export type RegradeSubmissionRow = {
  id: string
  total_score: number | null
  max_score: number | null
  correct_count: number | null
  wrong_count: number | null
  bonus_score?: number | null
}

const round2 = (value: number) => Math.round((value + Number.EPSILON) * 100) / 100

/**
 * Chấm lại DUY NHẤT một câu sau khi sửa đáp án và điều chỉnh tổng điểm theo chênh lệch.
 * Không chấm lại cả bài nên không đè điểm tự luận, điểm thưởng hay các câu khác; câu đã
 * được cộng điểm thủ công (locked) được giữ nguyên.
 */
export function planQuestionRegrade(input: {
  questionId: string
  questionType: QuestionGradeInput['questionType']
  points: number
  key: EditedQuestionKey
  answers: RegradeAnswerRow[]
  submissions: RegradeSubmissionRow[]
  /** targetScale / tổng điểm thô của đề (1 nếu đề đã đúng thang). Điểm thô -> điểm bài. */
  scoreScale?: number
}) {
  const scale = Number.isFinite(input.scoreScale) && (input.scoreScale as number) > 0 ? (input.scoreScale as number) : 1
  const submissionsById = new Map(input.submissions.map((s) => [s.id, s]))
  const answerUpdates: Array<{
    id: string
    is_correct: boolean
    score_earned: number
    given_answer: any
  }> = []
  const deltas = new Map<string, { score: number; correct: number }>()
  let skippedLocked = 0

  for (const answer of input.answers) {
    if (!submissionsById.has(answer.submission_id)) continue
    if (answer.locked || (!answer.is_correct && Number(answer.score_earned) >= input.points - 1e-9 && input.points > 0)) {
      // Có log cộng điểm, hoặc đã được cộng đủ điểm nhưng không có log (tổng đã chạm trần).
      skippedLocked++
      continue
    }
    const given = answer.given_answer && typeof answer.given_answer === 'object'
      ? answer.given_answer
      : { type: input.questionType, value: null }
    const graded = gradeQuestion({
      questionId: input.questionId,
      questionType: input.questionType,
      points: input.points,
      mcAnswer: input.key.mcAnswer,
      tfAnswers: input.key.tfAnswers as any,
      saAnswer: input.key.saAnswer,
      saTolerance: input.key.saTolerance,
      givenAnswer: given,
    } as QuestionGradeInput)

    const oldScore = round2(Number(answer.score_earned) || 0)
    const newScore = round2(graded.scoreEarned)
    const nextGiven = input.questionType === 'TRUE_FALSE' && graded.statementGrades
      ? { ...given, statementGrades: graded.statementGrades }
      : given
    const changed = oldScore !== newScore || !!answer.is_correct !== graded.isCorrect ||
      JSON.stringify(nextGiven) !== JSON.stringify(given)
    if (!changed) continue

    answerUpdates.push({
      id: answer.id,
      is_correct: graded.isCorrect,
      score_earned: newScore,
      given_answer: nextGiven,
    })
    const current = deltas.get(answer.submission_id) || { score: 0, correct: 0 }
    current.score = round2(current.score + (newScore - oldScore))
    current.correct += (graded.isCorrect ? 1 : 0) - (answer.is_correct ? 1 : 0)
    deltas.set(answer.submission_id, current)
  }

  const submissionUpdates: Array<{
    id: string
    total_score: number
    correct_count: number
    wrong_count: number
  }> = []
  for (const [submissionId, delta] of deltas) {
    const sub = submissionsById.get(submissionId)!
    const max = Number(sub.max_score)
    const total = round2(Number(sub.total_score) || 0)
    const bonus = round2(Number(sub.bonus_score) || 0)
    // Cùng quy ước set-bonus: điểm gốc = tổng - thưởng; chỉ điểm gốc đổi theo chênh lệch,
    // thưởng được cộng lại sau rồi mới chặn trần (không để trần nuốt điểm thưởng).
    const base = round2(total - bonus + delta.score * scale)
    const unclamped = round2(base + bonus)
    const next = Math.max(0, Number.isFinite(max) ? Math.min(max, unclamped) : unclamped)
    submissionUpdates.push({
      id: submissionId,
      total_score: next,
      correct_count: Math.max(0, (Number(sub.correct_count) || 0) + delta.correct),
      wrong_count: Math.max(0, (Number(sub.wrong_count) || 0) - delta.correct),
    })
  }

  return { answerUpdates, submissionUpdates, skippedLocked }
}

export function validateEditedKey(
  questionType: string,
  key: { mcAnswer?: unknown; tfAnswers?: unknown; saAnswer?: unknown }
): string | null {
  if (questionType === 'MULTIPLE_CHOICE') {
    return ['A', 'B', 'C', 'D'].includes(String(key.mcAnswer)) ? null : 'Câu trắc nghiệm phải có đáp án đúng A, B, C hoặc D'
  }
  if (questionType === 'TRUE_FALSE') {
    const tf = key.tfAnswers as Record<string, unknown> | null | undefined
    return tf && ['a', 'b', 'c', 'd'].every((k) => typeof tf[k] === 'boolean')
      ? null
      : 'Câu Đúng/Sai phải có đáp án a, b, c, d'
  }
  if (questionType === 'SHORT_ANSWER') {
    return String(key.saAnswer ?? '').trim() ? null : 'Câu trả lời ngắn phải có đáp án'
  }
  return 'Chỉ hỗ trợ sửa đáp án câu trắc nghiệm, Đúng/Sai và trả lời ngắn'
}
