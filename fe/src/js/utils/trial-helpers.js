// Hàm thuần dùng chung cho trang học thử (bản cũ trial.js và bản Mochi views/mochi/trial-*.js).

/** Đổi link YouTube / Google Drive sang link nhúng; link khác giữ nguyên. */
export function getEmbedUrl(url) {
  if (!url) return null
  let match = url.match(/(?:youtube\.com\/(?:[^\/]+\/.+\/|(?:v|e(?:mbed)?)\/|.*[?&]v=)|youtu\.be\/)([^"&?\/ ]{11})/)
  if (match && match[1]) {
    return `https://www.youtube.com/embed/${match[1]}`
  }
  match = url.match(/drive\.google\.com\/file\/d\/([a-zA-Z0-9_-]+)/)
  if (match && match[1]) {
    return `https://drive.google.com/file/d/${match[1]}/preview`
  }
  return url
}

export function formatDuration(seconds = 0) {
  const mins = Math.floor(seconds / 60)
  const secs = seconds % 60
  if (mins === 0) return `${secs} giây`
  return `${mins} phút ${secs}s`
}

/** Số liệu tổng hợp của lịch sử làm bài học thử (giống bản cũ). */
export function computeTrialHistoryStats(historyList = []) {
  const totalDone = historyList.length
  const totalScores = historyList.reduce((acc, h) => acc + (Number(h.score) || 0), 0)
  const avgScore = totalDone > 0 ? (Math.round((totalScores / totalDone) * 10) / 10) : 0
  const highestScore = totalDone > 0 ? Math.max(...historyList.map(h => Number(h.score) || 0)) : 0
  const passCount = historyList.filter(h => h.isPassed).length
  const passRate = totalDone > 0 ? Math.round((passCount / totalDone) * 100) : 0
  return { totalDone, avgScore, highestScore, passCount, passRate }
}

/** Tên file hiển thị của tài liệu lý thuyết (giống logic cũ trong trial.js). */
export function theoryFileDisplayName(file = '') {
  const f = String(file || '')
  const rawName = f.startsWith('http') ? (f.split('/').pop() || f) : f
  return rawName.split('_').slice(1).join('_') || rawName
}
