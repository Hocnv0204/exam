export const TOUR_KEYS = [
  'student-dashboard',
  'student-lesson',
  'student-myhw',
  'm2-welcome',
  'm2-classes',
  'm2-lesson',
  'm2-homeworks',
  'm2-attendance',
  'm2-history',
  'm2-achievements',
] as const

export type TourKey = (typeof TOUR_KEYS)[number]

export function isValidTourKey(key: unknown): key is TourKey {
  return typeof key === 'string' && (TOUR_KEYS as readonly string[]).includes(key)
}
