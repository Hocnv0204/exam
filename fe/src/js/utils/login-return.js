// Only student homework routes may be resumed after authentication.
export function getLoginReturnTarget(loginHash, role) {
  if (role === 'ADMIN') return '#admin-dashboard'
  const fallback = '#my-classes'
  if (role !== 'STUDENT') return fallback
  const query = loginHash.includes('?') ? loginHash.slice(loginHash.indexOf('?') + 1) : ''
  const next = new URLSearchParams(query).get('next') || ''
  const match = next.match(/^#(homework-attempt|exam-room)\?([^#]*)$/)
  if (!match) return fallback
  const params = new URLSearchParams(match[2])
  const id = params.get('homeworkId')
  if (!id || !/^[a-zA-Z0-9_-]+$/.test(id)) return fallback
  return `#${match[1]}?${params.toString()}`
}
