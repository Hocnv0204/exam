/**
 * Helpers thuần cho module "Quản lý học thử" (ADMIN).
 *
 * Module này KHÔNG import bất kỳ module nào khác và không chạm DOM/window/
 * localStorage, để:
 * - view trial-management.js dùng chung,
 * - trial.js dùng chung logic deep-link,
 * - test Node (fe/scripts/test-trial-management.mjs) import trực tiếp.
 *
 * QUAN TRỌNG: classifyVideoUrl/normalizeVideoUrl MIRROR ĐÚNG logic server
 * (supabase/functions/trial-management/index.ts). Server mới là nguồn chân
 * lý; FE chỉ validate sớm cho UX. Mọi thay đổi allowlist phải sửa cả 2 nơi
 * và chạy cả 2 bộ test.
 *
 * Allowlist video: HTTPS, host chính xác youtube.com / www.youtube.com /
 * m.youtube.com / youtu.be / drive.google.com / www.drive.google.com.
 * - YouTube: watch?v=<11 ký tự>, /embed/, /shorts/, /live/, /v/, youtu.be/<id>
 *   -> canonical https://www.youtube.com/watch?v=<id>
 * - Drive: /file/d/<id> -> canonical https://drive.google.com/file/d/<id>/view
 * - Preview an toàn CHỈ dùng embedUrl do classifier trả ra (YouTube embed /
 *   Drive preview). Không bao giờ iframe URL thô do người dùng nhập.
 */

const YOUTUBE_ID_RE = /^[A-Za-z0-9_-]{11}$/
const DRIVE_ID_RE = /^[A-Za-z0-9_-]+$/
const MAX_URL_LENGTH = 2048
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

export const EMPTY_VIDEO = Object.freeze({ kind: 'empty', videoId: null, canonicalUrl: null, embedUrl: null })
export const UNSUPPORTED_VIDEO = Object.freeze({ kind: 'unsupported', videoId: null, canonicalUrl: null, embedUrl: null })

export function classifyVideoUrl(raw) {
  if (typeof raw !== 'string') return EMPTY_VIDEO
  const url = raw.trim()
  if (!url) return EMPTY_VIDEO
  if (url.length > MAX_URL_LENGTH) return UNSUPPORTED_VIDEO
  let parsed
  try {
    parsed = new URL(url)
  } catch {
    return UNSUPPORTED_VIDEO
  }
  if (parsed.protocol !== 'https:') return UNSUPPORTED_VIDEO
  const host = parsed.hostname.toLowerCase()

  if (host === 'youtube.com' || host === 'www.youtube.com' || host === 'm.youtube.com') {
    const v = parsed.searchParams.get('v')
    if (v && YOUTUBE_ID_RE.test(v)) {
      return { kind: 'youtube', videoId: v, canonicalUrl: `https://www.youtube.com/watch?v=${v}`, embedUrl: `https://www.youtube.com/embed/${v}` }
    }
    const m = parsed.pathname.match(/^\/(?:embed|shorts|live|v)\/([A-Za-z0-9_-]{11})(?:\/|$)/)
    if (m) {
      return { kind: 'youtube', videoId: m[1], canonicalUrl: `https://www.youtube.com/watch?v=${m[1]}`, embedUrl: `https://www.youtube.com/embed/${m[1]}` }
    }
    return UNSUPPORTED_VIDEO
  }

  if (host === 'youtu.be') {
    const m = parsed.pathname.match(/^\/([A-Za-z0-9_-]{11})(?:\/|$)/)
    if (m) {
      return { kind: 'youtube', videoId: m[1], canonicalUrl: `https://www.youtube.com/watch?v=${m[1]}`, embedUrl: `https://www.youtube.com/embed/${m[1]}` }
    }
    return UNSUPPORTED_VIDEO
  }

  if (host === 'drive.google.com' || host === 'www.drive.google.com') {
    const m = parsed.pathname.match(/^\/file\/d\/([A-Za-z0-9_-]+)(?:\/|$)/)
    if (m && DRIVE_ID_RE.test(m[1])) {
      return { kind: 'drive', videoId: m[1], canonicalUrl: `https://drive.google.com/file/d/${m[1]}/view`, embedUrl: `https://drive.google.com/file/d/${m[1]}/preview` }
    }
    return UNSUPPORTED_VIDEO
  }

  return UNSUPPORTED_VIDEO
}

/** Canonical URL để lưu, hoặc null khi rỗng/không hỗ trợ. */
export function normalizeVideoUrl(raw) {
  const classified = classifyVideoUrl(raw)
  return classified.kind === 'youtube' || classified.kind === 'drive' ? classified.canonicalUrl : null
}

export function isValidVideoUrl(raw) {
  const kind = classifyVideoUrl(raw).kind
  return kind === 'youtube' || kind === 'drive'
}

/**
 * URL embed an toàn cho iframe, hoặc null. Không bao giờ trả URL thô:
 * URL không thuộc YouTube/Drive -> null (view hiện cảnh báo, không iframe).
 */
export function getSafeEmbedUrl(raw) {
  const classified = classifyVideoUrl(raw)
  return classified.kind === 'youtube' || classified.kind === 'drive' ? classified.embedUrl : null
}

export function isValidUuid(raw) {
  return typeof raw === 'string' && UUID_RE.test(raw)
}

/**
 * Link học thử công khai: origin + path HIỆN TẠI + #trial?tab=lessons&lessonId=<id>.
 * Không token, không dịch vụ ngoài. lessonId luôn encodeURIComponent.
 */
export function buildTrialLessonLink(origin, pathname, lessonId) {
  const safeOrigin = typeof origin === 'string' ? origin.replace(/\/+$/, '') : ''
  const safePath = typeof pathname === 'string' && pathname ? pathname : '/'
  return `${safeOrigin}${safePath}#trial?tab=lessons&lessonId=${encodeURIComponent(String(lessonId))}`
}

/** Chỉ bài đang công khai mới được sao chép link. Bài nháp: không có nút copy. */
export function canCopyTrialLink(lesson) {
  return Boolean(lesson && lesson.isTrial === true)
}

/**
 * Quyết định trạng thái deep link #trial?tab=lessons&lessonId=<id>.
 * - Không có lessonId -> 'none' (render danh sách bình thường).
 * - Chưa tải xong (loaded=false) -> 'loading' (hiện spinner, KHÔNG flash
 *   trạng thái thu hồi trong lúc dữ liệu chưa về).
 * - Đã tải xong + tìm thấy -> 'found' (+ lesson).
 * - Đã tải xong + không thấy -> 'revoked' (bài đã thu hồi / id sai / không
 *   còn khả dụng: hiện trạng thái rõ ràng, KHÔNG âm thầm về danh sách).
 */
export function resolveTrialLessonDeepLink({ lessonId, lessons, loaded }) {
  if (!lessonId) return { status: 'none', lesson: null }
  if (!loaded) return { status: 'loading', lesson: null }
  const list = Array.isArray(lessons) ? lessons : []
  const lesson = list.find((l) => l && l.id === lessonId) || null
  if (lesson) return { status: 'found', lesson }
  return { status: 'revoked', lesson: null }
}

/** Bài có video hợp lệ (YouTube/Drive) hay không, theo videoUrl đã lưu. */
export function hasSupportedVideo(lesson) {
  if (!lesson) return false
  if (lesson.hasVideo === true) return true
  if (lesson.hasVideo === false) return false
  return isValidVideoUrl(lesson.videoUrl)
}

/**
 * KPI module (3 nhóm RỜI NHAU, cộng lại = total):
 * - publicCount: đang công khai (isTrial=true).
 * - draftWithVideoCount: có video nhưng chưa công khai.
 * - missingVideoCount: chưa công khai VÀ chưa có video ("thiếu video").
 * Bài đang công khai nhưng thiếu video (tồn tại từ luồng bật tay cũ) vẫn
 * đếm ở publicCount; view gắn cảnh báo riêng trên dòng đó.
 */
export function computeTrialKpis(lessons) {
  const list = Array.isArray(lessons) ? lessons : []
  let publicCount = 0
  let draftWithVideoCount = 0
  let missingVideoCount = 0
  for (const lesson of list) {
    if (lesson && lesson.isTrial === true) {
      publicCount += 1
    } else if (hasSupportedVideo(lesson)) {
      draftWithVideoCount += 1
    } else {
      missingVideoCount += 1
    }
  }
  return { total: list.length, publicCount, draftWithVideoCount, missingVideoCount }
}

/**
 * Lọc catalog phía client (UI lọc tức thì trên toàn bộ catalog).
 * filters: { q, classId, chapterId, status: 'all'|'public'|'draft',
 *            video: 'all'|'with'|'without' }.
 */
export function filterTrialCatalog(lessons, filters = {}) {
  const list = Array.isArray(lessons) ? lessons : []
  const q = typeof filters.q === 'string' ? filters.q.trim().toLowerCase() : ''
  const classId = filters.classId || ''
  const chapterId = filters.chapterId || ''
  const status = filters.status || 'all'
  const video = filters.video || 'all'

  return list.filter((lesson) => {
    if (!lesson) return false
    if (classId && lesson.classId !== classId) return false
    if (chapterId && lesson.chapterId !== chapterId) return false
    if (status === 'public' && lesson.isTrial !== true) return false
    if (status === 'draft' && lesson.isTrial === true) return false
    if (video === 'with' && !hasSupportedVideo(lesson)) return false
    if (video === 'without' && hasSupportedVideo(lesson)) return false
    if (q) {
      const haystack = `${lesson.title || ''} ${lesson.chapterTitle || ''} ${lesson.className || ''}`.toLowerCase()
      if (!haystack.includes(q)) return false
    }
    return true
  })
}

/**
 * Guard chống stale response / duplicate submit ở mức phù hợp:
 * - begin() cấp token mới cho một lượt mở modal / một lần submit; mọi
 *   response mang token cũ đều bị coi là stale và phải bỏ qua.
 * - isCurrent(token) kiểm tra trước khi áp dụng kết quả async.
 * View dùng 1 guard cho modal video (mở lại modal = token mới, response cũ
 * không được đóng modal mới / ghi đè state mới) và khóa nút trong lúc
 * pending để chống duplicate submit.
 */
export function createWriteGuard() {
  let current = 0
  return {
    begin() {
      current += 1
      return current
    },
    isCurrent(token) {
      return token === current
    },
    reset() {
      current += 1
    },
  }
}

/** Định dạng thời gian cập nhật (vi-VN), chuỗi rỗng khi không parse được. */
export function formatTrialUpdatedAt(iso) {
  if (!iso) return ''
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return ''
  return d.toLocaleString('vi-VN')
}
