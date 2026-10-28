export function calculateQuestionAward(currentScore, questionPoints, totalScore, maxScore) {
  const round = value => Math.round((value + Number.EPSILON) * 100) / 100
  const current = round(Number(currentScore) || 0)
  const target = round(Number(questionPoints))
  const total = round(Number(totalScore) || 0)
  const max = Number(maxScore)
  if (![current, target, total].every(Number.isFinite) || target < 0) throw new Error('Invalid score values')
  const delta = round(Math.max(0, target - current))
  const newTotal = round(Math.min(Number.isFinite(max) ? max : total + delta, total + delta))
  return { target, delta, newTotal, appliedDelta: round(newTotal - total) }
}
