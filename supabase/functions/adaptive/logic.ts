// Lõi tổng hợp điểm yếu cả lớp — dùng chung cho adaptive (weak-topics)
// và question-bank (generate-practice). Ném Error khi lỗi DB.

export interface ChapterWeak {
  chapterId: string
  chapterTitle: string
  answered: number
  wrong: number
  wrongRate: number
}

export interface StudentWeak {
  studentId: string
  name: string
  answered: number
  wrong: number
  wrongRate: number
  top: ChapterWeak[]
}

export interface ClassWeakOverview {
  classId: string
  chapters: ChapterWeak[]
  students: StudentWeak[]
}

export function weakRate(answered: number, wrong: number): number {
  return answered > 0 ? Math.round((wrong / answered) * 1000) / 10 : 0
}

// Phân bổ Largest Remainder: chia total theo trọng số (dùng cho số câu/chương).
export function allocateLargestRemainder(
  total: number,
  weights: Record<string, number>,
): Record<string, number> {
  const keys = Object.keys(weights).filter((k) => (Number(weights[k]) || 0) > 0)
  const result: Record<string, number> = {}
  if (keys.length === 0 || total <= 0) return result
  const sum = keys.reduce((s, k) => s + Number(weights[k]), 0)
  let assigned = 0
  const remainders: Array<{ key: string; rem: number }> = []
  for (const k of keys) {
    const exact = (total * Number(weights[k])) / sum
    const f = Math.floor(exact)
    result[k] = f
    assigned += f
    remainders.push({ key: k, rem: exact - f })
  }
  remainders.sort((a, b) => b.rem - a.rem)
  let left = total - assigned
  let i = 0
  while (left > 0 && i < remainders.length) {
    result[remainders[i].key]++
    left--
    i++
  }
  return result
}

export async function computeClassWeakOverview(
  serviceRoleClient: any,
  classId: string,
  minAnswered: number,
  limit: number,
): Promise<ClassWeakOverview> {
  const { data, error } = await serviceRoleClient.rpc('fn_weak_topics', {
    p_class_id: classId,
    p_student_id: null,
    p_min_answered: minAnswered,
    p_limit: limit,
  })
  if (error) throw new Error(error.message)
  return (data || { classId, chapters: [], students: [] }) as ClassWeakOverview
}
