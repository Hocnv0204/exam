export function getHomeworkDisplayStatus(homework, now = Date.now()) {
  if (!homework.isPublished) return { label: 'Bản nháp', badge: 'badge-absent' }
  const deadline = homework.deadline ? Date.parse(homework.deadline) : NaN
  if (Number.isFinite(deadline) && deadline < now) return { label: 'Quá hạn', badge: 'badge-absent' }
  return { label: 'Đang mở', badge: 'badge-paid' }
}

export function formatHomeworkProgress(progress) {
  if (!progress || !Number.isInteger(progress.submittedCount) || !Number.isInteger(progress.assignedCount)) return '—'
  return `${progress.submittedCount} / ${progress.assignedCount}`
}
