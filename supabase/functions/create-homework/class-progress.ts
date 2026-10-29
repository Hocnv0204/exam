/** Tiến độ nộp bài theo học sinh đang thuộc lớp và thực sự được giao bài. */
export function countClassHomeworkProgress(
  homeworks: Array<{ id: string; assignedStudentIds?: string[] }>,
  enrollment: Array<{ student_id: string }>,
  submissions: Array<{ homework_id: string; student_id: string | null }>
): Map<string, { submittedCount: number; assignedCount: number }> {
  const enrolled = new Set(enrollment.map(row => row.student_id).filter(Boolean))
  const submitted = new Map<string, Set<string>>()
  for (const row of submissions) {
    if (!row.student_id || !enrolled.has(row.student_id)) continue
    if (!submitted.has(row.homework_id)) submitted.set(row.homework_id, new Set())
    submitted.get(row.homework_id)!.add(row.student_id)
  }
  return new Map(homeworks.map(hw => {
    const targets = hw.assignedStudentIds || []
    const eligible = targets.length ? new Set(targets.filter(id => enrolled.has(id))) : enrolled
    const done = [...(submitted.get(hw.id) || [])].filter(id => eligible.has(id)).length
    return [hw.id, { submittedCount: done, assignedCount: eligible.size }]
  }))
}

/** Supabase REST mặc định giới hạn 1000 dòng; đọc từng trang để không báo thiếu người nộp. */
async function readAll(query: any, label: string): Promise<any[]> {
  const rows: any[] = []
  const size = 500
  for (let offset = 0; ; offset += size) {
    const { data, error } = await query.range(offset, offset + size - 1)
    if (error) throw new Error(`${label}: ${error.message}`)
    rows.push(...(data || []))
    if (!data || data.length < size) break
  }
  return rows
}

export async function loadClassHomeworkProgress(client: any, classId: string, homeworkIds: string[]) {
  const enrollment = await readAll(
    client.from('student_classes').select('student_id').eq('class_id', classId).order('student_id'),
    'Không đọc được học sinh của lớp'
  )
  const targets: Array<{ homework_id: string; student_id: string }> = []
  const submissions: Array<{ homework_id: string; student_id: string | null }> = []
  // Chia nhỏ IN để giới hạn độ dài URL truy vấn và lấy đủ dữ liệu mọi bài.
  for (let i = 0; i < homeworkIds.length; i += 50) {
    const ids = homeworkIds.slice(i, i + 50)
    const [assigned, submitted] = await Promise.all([
      readAll(client.from('homework_targets').select('homework_id, student_id')
        .in('homework_id', ids).order('homework_id').order('student_id'), 'Không đọc được danh sách giao bài'),
      readAll(client.from('submissions').select('id, homework_id, student_id')
        .in('homework_id', ids).eq('status', 'SUBMITTED').not('student_id', 'is', null)
        .order('id'), 'Không đọc được lượt nộp bài'),
    ])
    targets.push(...assigned)
    submissions.push(...submitted)
  }
  const byHomework = new Map<string, string[]>()
  for (const row of targets) {
    if (!byHomework.has(row.homework_id)) byHomework.set(row.homework_id, [])
    byHomework.get(row.homework_id)!.push(row.student_id)
  }
  return countClassHomeworkProgress(
    homeworkIds.map(id => ({ id, assignedStudentIds: byHomework.get(id) || [] })),
    enrollment,
    submissions
  )
}
