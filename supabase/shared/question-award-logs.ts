/**
 * question_award_logs — Query shape + DTO mapper dùng chung cho Edge Function
 * reopen-submission (ghi log khi cộng điểm câu) và student-history (đọc log
 * cho admin review).
 *
 * Cả hai function phải dùng chung SELECT và mapper để payload nhất quán
 * (assignment review và danh sách bài nộp render cùng một dạng log).
 *
 * Module này không import gì (chỉ type annotation erasable) để node test
 * import trực tiếp được (Node >= 22 type stripping).
 */

/** Cột cần đọc để render nhật ký cộng điểm (snapshot câu + actor tại thời điểm cộng). */
export const QUESTION_AWARD_LOG_SELECT =
  'id, submission_id, answer_id, question_id, actor_name, question_number, part_title, question_points, score_before, score_after, applied_delta, total_score_after, created_at'

export interface QuestionAwardLogDto {
  id: string
  submissionId: string
  answerId: string | null
  questionId: string | null
  questionNumber: number | null
  partTitle: string | null
  questionPoints: number | null
  scoreBefore: number
  scoreAfter: number
  /** Điểm THẬT SỰ được cộng vào bài (đã cap max_score); luôn > 0 với dòng log hợp lệ. */
  delta: number
  totalScoreAfter: number | null
  actorName: string
  createdAt: string | null
}

const toNum = (value: unknown, dflt: number | null = null): number | null => {
  // PostgREST trả numeric dạng number, nhưng cột nullable có thể là null:
  // Number(null) === 0 nên phải loại trừ tường minh trước khi parse.
  if (value === null || value === undefined || value === '') return dflt
  const n = Number(value)
  return Number.isFinite(n) ? n : dflt
}

/** Map row PostgREST (snake_case) -> DTO camelCase an toàn cho FE. Dòng thiếu id bỏ qua ở caller. */
export function mapQuestionAwardLogRow(row: any): QuestionAwardLogDto {
  return {
    id: String(row?.id ?? ''),
    submissionId: String(row?.submission_id ?? ''),
    answerId: row?.answer_id ? String(row.answer_id) : null,
    questionId: row?.question_id ? String(row.question_id) : null,
    questionNumber: toNum(row?.question_number),
    partTitle: row?.part_title ? String(row.part_title) : null,
    questionPoints: toNum(row?.question_points),
    scoreBefore: toNum(row?.score_before, 0) as number,
    scoreAfter: toNum(row?.score_after, 0) as number,
    delta: toNum(row?.applied_delta, 0) as number,
    totalScoreAfter: toNum(row?.total_score_after),
    actorName: String(row?.actor_name || ''),
    createdAt: row?.created_at ? String(row.created_at) : null,
  }
}
