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
  // 1. Bài tập của lớp (qua lessons -> chapters -> class).
  const { data: hws, error: hwErr } = await serviceRoleClient
    .from('homeworks')
    .select('id, lessons!inner(chapters!inner(class_id))')
    .eq('lessons.chapters.class_id', classId)
  if (hwErr) throw new Error(hwErr.message)
  const homeworkIds = ((hws || []) as Array<{ id: string }>).map((h) => h.id)
  if (homeworkIds.length === 0) {
    return { classId, chapters: [], students: [] }
  }

  // 2. Bài nộp của các bài đó + tên học sinh.
  const { data: subs, error: subErr } = await serviceRoleClient
    .from('submissions')
    .select('id, student_id, profiles!inner(id, full_name, username)')
    .in('homework_id', homeworkIds)
  if (subErr) throw new Error(subErr.message)
  const subList = (subs || []) as Array<{ id: string; student_id: string; profiles: { full_name: string; username: string } | null }>
  if (subList.length === 0) {
    return { classId, chapters: [], students: [] }
  }
  const studentMap = new Map<string, string>()
  const subToStudent = new Map<string, string>()
  for (const s of subList) {
    subToStudent.set(s.id, s.student_id)
    if (!studentMap.has(s.student_id)) {
      studentMap.set(s.student_id, s.profiles?.full_name || s.profiles?.username || s.student_id)
    }
  }

  // 3. Đáp án từng câu kèm chương (giới hạn an toàn).
  const { data: answers, error: ansErr } = await serviceRoleClient
    .from('submission_answers')
    .select('is_correct, submission_id, questions!inner(homeworks!inner(lessons!inner(chapters!inner(id, title))))')
    .in('submission_id', subList.map((s) => s.id))
    .limit(10000)
  if (ansErr) throw new Error(ansErr.message)

  // 4. Gom theo chương (cả lớp) và theo (học sinh, chương).
  interface Agg { answered: number; wrong: number }
  const byChapter = new Map<string, { chapterId: string; chapterTitle: string } & Agg>()
  const byStudentChapter = new Map<string, { chapterId: string; chapterTitle: string } & Agg>()
  for (const a of (answers || []) as Array<{ is_correct: boolean; submission_id: string; questions: { homeworks: { lessons: { chapters: { id: string; title: string } | null } } } | null }>) {
    const ch = a.questions?.homeworks?.lessons?.chapters
    if (!ch?.id) continue
    const sidKey = subToStudent.get(a.submission_id)
    if (!sidKey) continue
    let c = byChapter.get(ch.id)
    if (!c) {
      c = { chapterId: ch.id, chapterTitle: ch.title || 'Chương', answered: 0, wrong: 0 }
      byChapter.set(ch.id, c)
    }
    c.answered++
    if (!a.is_correct) c.wrong++
    const key = `${sidKey}::${ch.id}`
    let sc = byStudentChapter.get(key)
    if (!sc) {
      sc = { chapterId: ch.id, chapterTitle: ch.title || 'Chương', answered: 0, wrong: 0 }
      byStudentChapter.set(key, sc)
    }
    sc.answered++
    if (!a.is_correct) sc.wrong++
  }

  const chapters: ChapterWeak[] = [...byChapter.values()]
    .map((c) => ({ ...c, wrongRate: weakRate(c.answered, c.wrong) }))
    .filter((c) => c.answered >= minAnswered)
    .sort((a, b) => b.wrongRate - a.wrongRate || b.wrong - a.wrong)
    .slice(0, limit)

  const perStudent = new Map<string, ChapterWeak[]>()
  for (const [key, v] of byStudentChapter) {
    const sidKey = key.slice(0, key.indexOf('::'))
    if (v.answered < minAnswered) continue
    if (!perStudent.has(sidKey)) perStudent.set(sidKey, [])
    perStudent.get(sidKey)!.push({ ...v, wrongRate: weakRate(v.answered, v.wrong) })
  }
  const students: StudentWeak[] = [...perStudent.entries()].map(([sidKey, topics]) => {
    const sorted = topics.sort((a, b) => b.wrongRate - a.wrongRate).slice(0, 3)
    const answered = topics.reduce((s, t) => s + t.answered, 0)
    const wrong = topics.reduce((s, t) => s + t.wrong, 0)
    return {
      studentId: sidKey,
      name: studentMap.get(sidKey) || sidKey,
      answered,
      wrong,
      wrongRate: weakRate(answered, wrong),
      top: sorted,
    }
  }).sort((a, b) => b.wrongRate - a.wrongRate)

  return { classId, chapters, students }
}
