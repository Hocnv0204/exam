/**
 * Unit test cho Edge Function `trial-management` (module Quản lý học thử).
 *
 * Chạy: node supabase/scripts/test-trial-management.mjs
 *
 * Không cần mạng, không deploy, không dùng dữ liệu thật. Test gồm 2 lớp
 * (theo pattern test-student-report-shares.mjs):
 * 1. Mô phỏng hành vi bằng in-memory store + hàm thuần mirror từ function
 *    (oracle viết tay: classify URL, validate UUID/action, semantics
 *    save/publish/revoke, filter + KPI của GET).
 * 2. Kiểm tra contract tĩnh trên source/config/migration để chặn drift bảo
 *    mật (auth ADMIN trước DB, allowlist URL, không lộ raw DB error,
 *    verify_jwt=true, revoke giữ video + idempotent, publish nguyên tử).
 */

import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'

const HERE = dirname(fileURLToPath(import.meta.url))
const ROOT = join(HERE, '..')
const FN_SRC = readFileSync(join(ROOT, 'functions', 'trial-management', 'index.ts'), 'utf8')
const CONFIG_SRC = readFileSync(join(ROOT, 'config.toml'), 'utf8')
const TRIAL_MIGRATION = readFileSync(join(ROOT, 'migrations', '20260801000020_add_trial_lessons.sql'), 'utf8')
const VIDEO_MIGRATION = readFileSync(join(ROOT, 'migrations', '20260801000010_lessons_video_theory.sql'), 'utf8')

let passed = 0
let failed = 0

function check(name, condition, extra = '') {
  if (condition) {
    passed++
    console.log(`  ✓ ${name}`)
  } else {
    failed++
    console.log(`  ✗ ${name}${extra ? ` -> ${extra}` : ''}`)
  }
}

function eq(name, actual, expected) {
  const ok = JSON.stringify(actual) === JSON.stringify(expected)
  check(name, ok, ok ? '' : `expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`)
}

/* -----------------------------------------------------------------------
 * 1. Hàm thuần mirror từ Edge Function trial-management
 * -------------------------------------------------------------------- */
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
const YOUTUBE_ID_RE = /^[A-Za-z0-9_-]{11}$/
const DRIVE_ID_RE = /^[A-Za-z0-9_-]+$/
const MAX_URL_LENGTH = 2048

function classifyVideoUrl(raw) {
  if (typeof raw !== 'string') return { kind: 'empty', videoId: null, canonicalUrl: null, embedUrl: null }
  const url = raw.trim()
  if (!url) return { kind: 'empty', videoId: null, canonicalUrl: null, embedUrl: null }
  if (url.length > MAX_URL_LENGTH) return { kind: 'unsupported', videoId: null, canonicalUrl: null, embedUrl: null }
  let parsed
  try {
    parsed = new URL(url)
  } catch {
    return { kind: 'unsupported', videoId: null, canonicalUrl: null, embedUrl: null }
  }
  if (parsed.protocol !== 'https:') return { kind: 'unsupported', videoId: null, canonicalUrl: null, embedUrl: null }
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
    return { kind: 'unsupported', videoId: null, canonicalUrl: null, embedUrl: null }
  }
  if (host === 'youtu.be') {
    const m = parsed.pathname.match(/^\/([A-Za-z0-9_-]{11})(?:\/|$)/)
    if (m) {
      return { kind: 'youtube', videoId: m[1], canonicalUrl: `https://www.youtube.com/watch?v=${m[1]}`, embedUrl: `https://www.youtube.com/embed/${m[1]}` }
    }
    return { kind: 'unsupported', videoId: null, canonicalUrl: null, embedUrl: null }
  }
  if (host === 'drive.google.com' || host === 'www.drive.google.com') {
    const m = parsed.pathname.match(/^\/file\/d\/([A-Za-z0-9_-]+)(?:\/|$)/)
    if (m && DRIVE_ID_RE.test(m[1])) {
      return { kind: 'drive', videoId: m[1], canonicalUrl: `https://drive.google.com/file/d/${m[1]}/view`, embedUrl: `https://drive.google.com/file/d/${m[1]}/preview` }
    }
    return { kind: 'unsupported', videoId: null, canonicalUrl: null, embedUrl: null }
  }
  return { kind: 'unsupported', videoId: null, canonicalUrl: null, embedUrl: null }
}

function isValidUuid(raw) {
  return typeof raw === 'string' && UUID_RE.test(raw)
}

const ACTIONS = new Set(['save-video', 'publish', 'revoke'])

/** Mirror semantics PATCH trên in-memory lesson (không DB thật). */
function patchLesson(store, { lessonId, action, videoUrl }) {
  if (!isValidUuid(lessonId)) return { status: 400, error: 'lessonId must be a valid UUID' }
  if (!ACTIONS.has(action)) return { status: 400, error: 'action must be one of: save-video, publish, revoke' }
  const lesson = store.get(lessonId)
  if (!lesson) return { status: 404, error: 'Lesson not found' }

  if (action === 'revoke') {
    if (lesson.is_trial !== true) return { status: 200, lesson: { ...lesson }, alreadyRevoked: true }
    const next = { ...lesson, is_trial: false }
    store.set(lessonId, next)
    return { status: 200, lesson: { ...next }, alreadyRevoked: false }
  }

  if (action === 'save-video') {
    if (videoUrl === undefined || videoUrl === null || (typeof videoUrl === 'string' && videoUrl.trim() === '')) {
      const next = { ...lesson, video_url: null }
      store.set(lessonId, next)
      return { status: 200, lesson: { ...next } }
    }
    if (typeof videoUrl !== 'string') return { status: 400, error: 'videoUrl must be a string' }
    const classified = classifyVideoUrl(videoUrl)
    if (classified.kind !== 'youtube' && classified.kind !== 'drive') {
      return { status: 400, error: 'videoUrl is not a supported video URL (HTTPS YouTube or Google Drive only)' }
    }
    const next = { ...lesson, video_url: classified.canonicalUrl }
    store.set(lessonId, next)
    return { status: 200, lesson: { ...next } }
  }

  // publish
  let effective = null
  if (typeof videoUrl === 'string' && videoUrl.trim() !== '') {
    const classified = classifyVideoUrl(videoUrl)
    if (classified.kind !== 'youtube' && classified.kind !== 'drive') {
      return { status: 400, error: 'videoUrl is not a supported video URL (HTTPS YouTube or Google Drive only)' }
    }
    effective = classified
  } else if (videoUrl !== undefined && videoUrl !== null && videoUrl !== '') {
    return { status: 400, error: 'videoUrl must be a string' }
  } else {
    const stored = classifyVideoUrl(lesson.video_url)
    if (stored.kind !== 'youtube' && stored.kind !== 'drive') {
      return { status: 400, error: 'Publish requires a valid video URL' }
    }
    effective = stored
  }
  const alreadyPublished = lesson.is_trial === true
  const next = { ...lesson, video_url: effective.canonicalUrl, is_trial: true }
  store.set(lessonId, next)
  return { status: 200, lesson: { ...next }, alreadyPublished }
}

function toCatalogItem(row) {
  const video = classifyVideoUrl(row.video_url)
  return {
    id: row.id,
    title: row.title,
    chapterId: row.chapter_id,
    chapterTitle: row.chapter_title,
    classId: row.class_id,
    className: row.class_name,
    hasVideo: video.kind === 'youtube' || video.kind === 'drive',
    isTrial: row.is_trial === true,
  }
}

function computeKpis(items) {
  let publicCount = 0
  let draftWithVideoCount = 0
  let missingVideoCount = 0
  for (const item of items) {
    if (item.isTrial) publicCount += 1
    else if (item.hasVideo) draftWithVideoCount += 1
    else missingVideoCount += 1
  }
  return { total: items.length, publicCount, draftWithVideoCount, missingVideoCount }
}

function applyFilters(items, { q = '', classId = '', chapterId = '', status = '', video = '' }) {
  const needle = q.trim().toLowerCase()
  return items.filter((item) => {
    if (classId && item.classId !== classId) return false
    if (chapterId && item.chapterId !== chapterId) return false
    if (status === 'public' && !item.isTrial) return false
    if (status === 'draft' && item.isTrial) return false
    if (video === 'with' && !item.hasVideo) return false
    if (video === 'without' && item.hasVideo) return false
    if (needle && !`${item.title} ${item.chapterTitle} ${item.className}`.toLowerCase().includes(needle)) return false
    return true
  })
}

console.log('=== Kiểm thử Edge Function trial-management (Quản lý học thử) ===\n')

console.log('-- Phân loại / chuẩn hoá URL video (allowlist) --')
eq('YouTube watch -> canonical', classifyVideoUrl('https://www.youtube.com/watch?v=dQw4w9WgXcQ').canonicalUrl, 'https://www.youtube.com/watch?v=dQw4w9WgXcQ')
eq('YouTube watch + tham số thừa -> canonical gọn', classifyVideoUrl('https://youtube.com/watch?v=dQw4w9WgXcQ&t=42s&list=PLx').canonicalUrl, 'https://www.youtube.com/watch?v=dQw4w9WgXcQ')
eq('youtu.be -> canonical watch', classifyVideoUrl('https://youtu.be/dQw4w9WgXcQ').canonicalUrl, 'https://www.youtube.com/watch?v=dQw4w9WgXcQ')
eq('YouTube embed -> canonical watch', classifyVideoUrl('https://www.youtube.com/embed/dQw4w9WgXcQ').canonicalUrl, 'https://www.youtube.com/watch?v=dQw4w9WgXcQ')
eq('YouTube shorts -> canonical watch', classifyVideoUrl('https://www.youtube.com/shorts/dQw4w9WgXcQ').canonicalUrl, 'https://www.youtube.com/watch?v=dQw4w9WgXcQ')
eq('YouTube live -> canonical watch', classifyVideoUrl('https://m.youtube.com/live/dQw4w9WgXcQ').canonicalUrl, 'https://www.youtube.com/watch?v=dQw4w9WgXcQ')
eq('YouTube embedUrl', classifyVideoUrl('https://youtu.be/dQw4w9WgXcQ').embedUrl, 'https://www.youtube.com/embed/dQw4w9WgXcQ')
eq('Drive file/d -> canonical view', classifyVideoUrl('https://drive.google.com/file/d/1AbC-_x9/view?usp=sharing').canonicalUrl, 'https://drive.google.com/file/d/1AbC-_x9/view')
eq('Drive preview -> canonical view', classifyVideoUrl('https://drive.google.com/file/d/1AbC-_x9/preview').canonicalUrl, 'https://drive.google.com/file/d/1AbC-_x9/view')
eq('Drive embedUrl = preview', classifyVideoUrl('https://drive.google.com/file/d/1AbC-_x9/view').embedUrl, 'https://drive.google.com/file/d/1AbC-_x9/preview')
check('http YouTube bị chặn', classifyVideoUrl('http://www.youtube.com/watch?v=dQw4w9WgXcQ').kind === 'unsupported')
check('ID YouTube 10 ký tự bị chặn', classifyVideoUrl('https://www.youtube.com/watch?v=dQw4w9WgXc').kind === 'unsupported')
check('ID YouTube 12 ký tự bị chặn', classifyVideoUrl('https://www.youtube.com/watch?v=dQw4w9WgXcQQ').kind === 'unsupported')
check('Thiếu v= bị chặn', classifyVideoUrl('https://www.youtube.com/watch?list=PLx').kind === 'unsupported')
check('Host giả youtube.com.evil.com bị chặn', classifyVideoUrl('https://youtube.com.evil.com/watch?v=dQw4w9WgXcQ').kind === 'unsupported')
check('Userinfo youtube.com@evil.com bị chặn', classifyVideoUrl('https://youtube.com@evil.com/watch?v=dQw4w9WgXcQ').kind === 'unsupported')
check('youtube-nocookie ngoài allowlist', classifyVideoUrl('https://www.youtube-nocookie.com/embed/dQw4w9WgXcQ').kind === 'unsupported')
check('Vimeo bị chặn', classifyVideoUrl('https://vimeo.com/123456789').kind === 'unsupported')
check('Drive folders (không phải file/d) bị chặn', classifyVideoUrl('https://drive.google.com/drive/folders/1AbC-_x9').kind === 'unsupported')
check('javascript: bị chặn', classifyVideoUrl('javascript:alert(1)').kind === 'unsupported')
check('Chuỗi rác bị chặn', classifyVideoUrl('not a url').kind === 'unsupported')
check('URL quá dài bị chặn', classifyVideoUrl(`https://www.youtube.com/watch?v=dQw4w9WgXcQ&x=${'a'.repeat(3000)}`).kind === 'unsupported')
check('Chuỗi rỗng -> empty', classifyVideoUrl('   ').kind === 'empty')
check('null -> empty', classifyVideoUrl(null).kind === 'empty')
check('Số -> empty (không crash)', classifyVideoUrl(123).kind === 'empty')

console.log('\n-- Validate UUID / action --')
check('UUID hợp lệ', isValidUuid('123e4567-e89b-12d3-a456-426614174000'))
check('UUID thiếu gạch bị chặn', !isValidUuid('123e4567e89b12d3a456426614174000'))
check('UUID ký tự lạ bị chặn', !isValidUuid('123e4567-e89b-12d3-a456-42661417400g'))
check('UUID không phải chuỗi bị chặn', !isValidUuid(123))
check('Action lạ bị chặn', !ACTIONS.has('delete'))
check('Action rỗng bị chặn', !ACTIONS.has(''))

console.log('\n-- Semantics save-video / publish / revoke --')
const L1 = '11111111-1111-4111-8111-111111111111'
const L2 = '22222222-2222-4222-8222-222222222222'
const L3 = '33333333-3333-4333-8333-333333333333'
function freshStore() {
  return new Map([
    [L1, { id: L1, title: 'Bài nháp chưa video', video_url: null, is_trial: false }],
    [L2, { id: L2, title: 'Bài nháp có video', video_url: 'https://youtu.be/dQw4w9WgXcQ', is_trial: false }],
    [L3, { id: L3, title: 'Bài đang công khai', video_url: 'https://www.youtube.com/watch?v=dQw4w9WgXcQ', is_trial: true }],
  ])
}

let store = freshStore()
let r = patchLesson(store, { lessonId: 'not-a-uuid', action: 'revoke' })
eq('PATCH id sai -> 400', r.status, 400)
r = patchLesson(store, { lessonId: L1, action: 'explode' })
eq('PATCH action sai -> 400', r.status, 400)
r = patchLesson(store, { lessonId: '99999999-9999-4999-8999-999999999999', action: 'revoke' })
eq('PATCH lesson không tồn tại -> 404', r.status, 404)

r = patchLesson(store, { lessonId: L1, action: 'save-video', videoUrl: 'https://www.youtube.com/watch?v=dQw4w9WgXcQ&t=10s' })
eq('save-video: lưu canonical', r.lesson.video_url, 'https://www.youtube.com/watch?v=dQw4w9WgXcQ')
check('save-video: giữ is_trial=false', r.lesson.is_trial === false)
r = patchLesson(store, { lessonId: L3, action: 'save-video', videoUrl: 'https://drive.google.com/file/d/1AbC-_x9/view' })
check('save-video trên bài public: giữ is_trial=true', r.lesson.is_trial === true)
eq('save-video trên bài public: đổi URL', r.lesson.video_url, 'https://drive.google.com/file/d/1AbC-_x9/view')
r = patchLesson(store, { lessonId: L1, action: 'save-video', videoUrl: 'https://vimeo.com/123' })
eq('save-video URL không hỗ trợ -> 400', r.status, 400)
check('save-video lỗi: state không đổi', store.get(L1).video_url === 'https://www.youtube.com/watch?v=dQw4w9WgXcQ')
r = patchLesson(store, { lessonId: L1, action: 'save-video', videoUrl: '' })
check('save-video rỗng: xoá video về null', r.lesson.video_url === null)
check('save-video rỗng: vẫn giữ is_trial', r.lesson.is_trial === false)

store = freshStore()
r = patchLesson(store, { lessonId: L1, action: 'publish' })
eq('publish thiếu video -> 400', r.status, 400)
check('publish bị chặn: state không đổi', store.get(L1).is_trial === false && store.get(L1).video_url === null)
r = patchLesson(store, { lessonId: L2, action: 'publish' })
check('publish dùng video đã lưu: is_trial=true', r.lesson.is_trial === true)
eq('publish dùng video đã lưu: canonical', r.lesson.video_url, 'https://www.youtube.com/watch?v=dQw4w9WgXcQ')
r = patchLesson(store, { lessonId: L1, action: 'publish', videoUrl: 'https://youtu.be/dQw4w9WgXcQ' })
check('publish + URL mới: is_trial=true và URL canonical cùng lúc (nguyên tử)', r.lesson.is_trial === true && r.lesson.video_url === 'https://www.youtube.com/watch?v=dQw4w9WgXcQ')
r = patchLesson(store, { lessonId: L1, action: 'publish', videoUrl: 'https://vimeo.com/123' })
eq('publish URL không hỗ trợ -> 400', r.status, 400)

store = freshStore()
r = patchLesson(store, { lessonId: L3, action: 'revoke' })
check('revoke: is_trial=false', r.lesson.is_trial === false)
eq('revoke: GIỮ NGUYÊN video_url', r.lesson.video_url, 'https://www.youtube.com/watch?v=dQw4w9WgXcQ')
check('revoke lần đầu: alreadyRevoked=false', r.alreadyRevoked === false)
r = patchLesson(store, { lessonId: L3, action: 'revoke' })
check('revoke lặp: success + alreadyRevoked=true', r.status === 200 && r.alreadyRevoked === true)
check('revoke lặp: video vẫn giữ', r.lesson.video_url === 'https://www.youtube.com/watch?v=dQw4w9WgXcQ')
r = patchLesson(store, { lessonId: L1, action: 'revoke' })
check('revoke bài chưa public: success idempotent', r.status === 200 && r.alreadyRevoked === true)

console.log('\n-- GET catalog: filter + KPI --')
const catalog = [
  { id: 'a', title: 'Este cơ bản', chapter_id: 'ch1', chapter_title: 'Chương 1', class_id: 'c12', class_name: 'Hóa 12', video_url: 'https://youtu.be/dQw4w9WgXcQ', is_trial: true },
  { id: 'b', title: 'Este nâng cao', chapter_id: 'ch1', chapter_title: 'Chương 1', class_id: 'c12', class_name: 'Hóa 12', video_url: 'https://drive.google.com/file/d/1AbC-_x9/view', is_trial: false },
  { id: 'c', title: 'Ancol', chapter_id: 'ch2', chapter_title: 'Chương 2', class_id: 'c12', class_name: 'Hóa 12', video_url: null, is_trial: false },
  { id: 'd', title: 'Ankan', chapter_id: 'ch3', chapter_title: 'Chương 3', class_id: 'c11', class_name: 'Hóa 11', video_url: null, is_trial: true },
  { id: 'e', title: 'Anken', chapter_id: 'ch3', chapter_title: 'Chương 3', class_id: 'c11', class_name: 'Hóa 11', video_url: 'https://www.youtube.com/watch?v=dQw4w9WgXcQ', is_trial: false },
].map(toCatalogItem)
const kpis = computeKpis(catalog)
eq('KPI: publicCount', kpis.publicCount, 2)
eq('KPI: draftWithVideoCount', kpis.draftWithVideoCount, 2)
eq('KPI: missingVideoCount (chỉ nháp thiếu video)', kpis.missingVideoCount, 1)
check('KPI: 3 nhóm cộng lại = total', kpis.publicCount + kpis.draftWithVideoCount + kpis.missingVideoCount === kpis.total)
check('KPI: bài public thiếu video KHÔNG nằm ở missingVideoCount', !catalog.find((x) => x.id === 'd') || kpis.missingVideoCount === 1)
eq('Filter q (không phân biệt hoa thường)', applyFilters(catalog, { q: 'ESTE' }).map((x) => x.id), ['a', 'b'])
eq('Filter classId', applyFilters(catalog, { classId: 'c11' }).map((x) => x.id), ['d', 'e'])
eq('Filter chapterId', applyFilters(catalog, { chapterId: 'ch1' }).map((x) => x.id), ['a', 'b'])
eq('Filter status=public', applyFilters(catalog, { status: 'public' }).map((x) => x.id), ['a', 'd'])
eq('Filter status=draft', applyFilters(catalog, { status: 'draft' }).map((x) => x.id), ['b', 'c', 'e'])
eq('Filter video=with', applyFilters(catalog, { video: 'with' }).map((x) => x.id), ['a', 'b', 'e'])
eq('Filter video=without', applyFilters(catalog, { video: 'without' }).map((x) => x.id), ['c', 'd'])
eq('Filter kết hợp class+status', applyFilters(catalog, { classId: 'c12', status: 'draft' }).map((x) => x.id), ['b', 'c'])
eq('Filter rỗng trả toàn bộ', applyFilters(catalog, {}).length, 5)

console.log('\n-- Contract tĩnh: function source / config / migration --')
check('Source dùng requireAuth', /requireAuth\(req\)/.test(FN_SRC))
check('Source kiểm tra role ADMIN -> 403', /role !== 'ADMIN'/.test(FN_SRC) && /Forbidden: Admin access required/.test(FN_SRC))
check('Auth + role check ĐỨNG TRƯỚC truy vấn DB đầu tiên', (() => {
  const authIdx = FN_SRC.indexOf("role !== 'ADMIN'")
  const dbIdx = FN_SRC.indexOf(".from('lessons')")
  return authIdx !== -1 && dbIdx !== -1 && authIdx < dbIdx
})())
check('Source có đủ 3 action PATCH', /'save-video'/.test(FN_SRC) && /'publish'/.test(FN_SRC) && /'revoke'/.test(FN_SRC))
check('Source validate UUID lessonId', /lessonId must be a valid UUID/.test(FN_SRC))
check('Source chặn publish thiếu video', /Publish requires a valid video URL/.test(FN_SRC))
check('Source chặn URL không hỗ trợ', /videoUrl is not a supported video URL/.test(FN_SRC))
check('Source có 404 lesson', /Lesson not found/.test(FN_SRC))
check('Source có 405 method', /Method not allowed/.test(FN_SRC))
check('Source revoke chỉ set is_trial=false (không đụng video_url)', /\.update\(\{ is_trial: false \}\)/.test(FN_SRC))
check('Source publish 1 update gồm cả URL + is_trial', /\.update\(\{ video_url:.*is_trial: true \}\)/.test(FN_SRC))
check('Source KHÔNG lộ raw DB error (không errorResponse(error.message / err.message)', !/errorResponse\(\s*(error|err)\.message/.test(FN_SRC))
check('Source có catch-all 500 chung', /Internal server error/.test(FN_SRC))
check('Source có message lỗi DB chung (không tên bảng/cột)', /Failed to load trial catalog/.test(FN_SRC) && /Failed to revoke trial lesson/.test(FN_SRC))
check('Source xử lý CORS preflight', /handleCors\(req\)/.test(FN_SRC))
check('config.toml: function trial-management verify_jwt=true', /\[functions\.trial-management\]\s*\nverify_jwt = true/.test(CONFIG_SRC))
check('Migration trial lessons có is_trial', /is_trial/.test(TRIAL_MIGRATION))
check('Migration video có video_url', /video_url/.test(VIDEO_MIGRATION))
check('Migration video có theory_files', /theory_files/.test(VIDEO_MIGRATION))

console.log(`\n=== Kết quả: ${passed} passed, ${failed} failed ===`)
if (failed > 0) process.exitCode = 1
