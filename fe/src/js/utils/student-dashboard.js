// Counts come from the authenticated my-homeworks endpoint (all classes, unfiltered).
export function summarizeStudentProgress(stats) {
  const total = Number(stats?.total)
  const done = Number(stats?.done)
  const todo = Number(stats?.todo)
  if (![total, done, todo].every(n => Number.isInteger(n) && n >= 0) || done + todo !== total) {
    throw new Error('Thống kê bài tập không hợp lệ.')
  }
  return { total, done, todo, completion: total ? Math.round(done * 100 / total) : null }
}

export function studentBalanceIsZero(value) {
  return value !== null && value !== undefined && String(value).trim() !== '' && Number.isFinite(Number(value)) && Number(value) === 0
}

export function recentScores(history, limit = 10) {
  if (!Array.isArray(history)) return []
  // Chọn lượt nộp trước khi quy đổi điểm: bài chưa chấm vẫn thuộc 10 lượt gần nhất.
  return [...history].sort((a, b) => (Date.parse(b?.submittedAt) || 0) - (Date.parse(a?.submittedAt) || 0))
    .slice(0, limit).reverse().map(item => {
      const raw = item?.score === null || item?.score === undefined || item?.score === '' ? NaN : Number(item.score)
      const max = item?.maxScore === null || item?.maxScore === undefined || item?.maxScore === '' ? NaN : Number(item.maxScore)
      const value = Number.isFinite(raw) && Number.isFinite(max) && max > 0 ? raw / max * 10 : null
      return {
        score: value === null ? null : Math.round(value * 10) / 10,
        title: item?.homeworkTitle || 'Bài tập', date: item?.submittedAt || ''
      }
    })
}
