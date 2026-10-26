/**
 * Unit test cho module "Quản lý học thử" (ADMIN) phía FE.
 *
 * Chạy: node scripts/test-trial-management.mjs (từ thư mục fe/)
 * Hoặc: npm run test:trial-management
 *
 * Gồm 2 lớp:
 * 1. Test TRỰC TIẾP helpers thuần fe/src/js/utils/trial-management.js
 *    (import thật, không mirror): phân loại/chuẩn hoá URL, build link,
 *    no-copy draft, deep-link revoked, KPI/filter, write guard.
 * 2. Kiểm tra contract tĩnh trên source (route/sidebar/admin guard,
 *    không query PostgREST trực tiếp, preview an toàn, clipboard fallback,
 *    curriculum đã bỏ checkbox trực tiếp).
 */

import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'
import {
  classifyVideoUrl,
  normalizeVideoUrl,
  isValidVideoUrl,
  getSafeEmbedUrl,
  isValidUuid,
  buildTrialLessonLink,
  canCopyTrialLink,
  hasSupportedVideo,
  resolveTrialLessonDeepLink,
  computeTrialKpis,
  filterTrialCatalog,
  createWriteGuard,
  formatTrialUpdatedAt,
} from '../src/js/utils/trial-management.js'

const HERE = dirname(fileURLToPath(import.meta.url))
const SRC = join(HERE, '..', 'src', 'js')
const read = (rel) => readFileSync(join(SRC, rel), 'utf8')

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
  let ok = false
  try {
    assert.deepEqual(actual, expected)
    ok = true
  } catch (e) {
    ok = false
  }
  check(name, ok, ok ? '' : `expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`)
}

console.log('=== Kiểm thử FE module Quản lý học thử (helpers + contract) ===\n')

console.log('-- classify / normalize / embed an toàn --')
eq('YouTube watch -> canonical', normalizeVideoUrl('https://www.youtube.com/watch?v=dQw4w9WgXcQ'), 'https://www.youtube.com/watch?v=dQw4w9WgXcQ')
eq('youtu.be -> canonical', normalizeVideoUrl('https://youtu.be/dQw4w9WgXcQ'), 'https://www.youtube.com/watch?v=dQw4w9WgXcQ')
eq('Drive file/d -> canonical view', normalizeVideoUrl('https://drive.google.com/file/d/1AbC-_x9/preview'), 'https://drive.google.com/file/d/1AbC-_x9/view')
eq('YouTube embed an toàn', getSafeEmbedUrl('https://www.youtube.com/watch?v=dQw4w9WgXcQ'), 'https://www.youtube.com/embed/dQw4w9WgXcQ')
eq('Drive embed an toàn = preview', getSafeEmbedUrl('https://drive.google.com/file/d/1AbC-_x9/view'), 'https://drive.google.com/file/d/1AbC-_x9/preview')
check('http bị chặn', !isValidVideoUrl('http://www.youtube.com/watch?v=dQw4w9WgXcQ'))
check('Vimeo bị chặn', !isValidVideoUrl('https://vimeo.com/123456789'))
check('Host giả bị chặn', !isValidVideoUrl('https://youtube.com.evil.com/watch?v=dQw4w9WgXcQ'))
check('Userinfo trick bị chặn', !isValidVideoUrl('https://youtube.com@evil.com/watch?v=dQw4w9WgXcQ'))
check('URL rác -> embed null (không iframe thô)', getSafeEmbedUrl('https://evil.com/video.mp4') === null)
check('URL rỗng -> embed null', getSafeEmbedUrl('') === null)
check('normalize URL không hỗ trợ -> null', normalizeVideoUrl('https://vimeo.com/123') === null)
check('ID YouTube sai độ dài bị chặn', !isValidVideoUrl('https://www.youtube.com/watch?v=short'))
check('Drive folders bị chặn', !isValidVideoUrl('https://drive.google.com/drive/folders/1AbC-_x9'))

console.log('\n-- UUID --')
check('UUID hợp lệ', isValidUuid('123e4567-e89b-12d3-a456-426614174000'))
check('UUID sai bị chặn', !isValidUuid('xyz'))

console.log('\n-- build link học thử công khai --')
eq('Link chuẩn origin+path+hash', buildTrialLessonLink('https://example.com', '/app/', '123e4567-e89b-12d3-a456-426614174000'), 'https://example.com/app/#trial?tab=lessons&lessonId=123e4567-e89b-12d3-a456-426614174000')
eq('Link encode ký tự đặc biệt trong id', buildTrialLessonLink('https://example.com', '/', 'a b&c=d'), 'https://example.com/#trial?tab=lessons&lessonId=a%20b%26c%3Dd')
check('Link không chứa token', !buildTrialLessonLink('https://example.com', '/', 'abc').includes('token'))

console.log('\n-- Copy link theo trạng thái --')
check('Bài public: được copy', canCopyTrialLink({ isTrial: true }) === true)
check('Bài nháp: KHÔNG được copy', canCopyTrialLink({ isTrial: false }) === false)
check('Bài thiếu isTrial: KHÔNG được copy', canCopyTrialLink({}) === false)
check('Lesson null: KHÔNG được copy', canCopyTrialLink(null) === false)

console.log('\n-- Deep-link revoked state --')
eq('Không có lessonId -> none', resolveTrialLessonDeepLink({ lessonId: null, lessons: [], loaded: true }).status, 'none')
eq('Chưa tải xong -> loading (không flash revoked)', resolveTrialLessonDeepLink({ lessonId: 'x', lessons: [], loaded: false }).status, 'loading')
eq('Đã tải xong + tìm thấy -> found', resolveTrialLessonDeepLink({ lessonId: 'l1', lessons: [{ id: 'l1' }], loaded: true }).status, 'found')
eq('Đã tải xong + không thấy -> revoked', resolveTrialLessonDeepLink({ lessonId: 'nope', lessons: [{ id: 'l1' }], loaded: true }).status, 'revoked')
eq('Đã tải xong + catalog rỗng -> revoked', resolveTrialLessonDeepLink({ lessonId: 'nope', lessons: [], loaded: true }).status, 'revoked')
check('found trả đúng lesson', resolveTrialLessonDeepLink({ lessonId: 'l1', lessons: [{ id: 'l1', title: 'T' }], loaded: true }).lesson.title === 'T')

console.log('\n-- KPI + filter catalog --')
const catalog = [
  { id: 'a', title: 'Este cơ bản', chapterId: 'ch1', chapterTitle: 'Chương 1', classId: 'c12', className: 'Hóa 12', videoUrl: 'https://youtu.be/dQw4w9WgXcQ', isTrial: true },
  { id: 'b', title: 'Este nâng cao', chapterId: 'ch1', chapterTitle: 'Chương 1', classId: 'c12', className: 'Hóa 12', videoUrl: 'https://drive.google.com/file/d/1AbC-_x9/view', isTrial: false },
  { id: 'c', title: 'Ancol', chapterId: 'ch2', chapterTitle: 'Chương 2', classId: 'c12', className: 'Hóa 12', videoUrl: null, isTrial: false },
  { id: 'd', title: 'Ankan', chapterId: 'ch3', chapterTitle: 'Chương 3', classId: 'c11', className: 'Hóa 11', videoUrl: null, isTrial: true },
  { id: 'e', title: 'Anken', chapterId: 'ch3', chapterTitle: 'Chương 3', classId: 'c11', className: 'Hóa 11', videoUrl: 'https://www.youtube.com/watch?v=dQw4w9WgXcQ', isTrial: false },
]
const kpis = computeTrialKpis(catalog)
eq('KPI publicCount', kpis.publicCount, 2)
eq('KPI draftWithVideoCount', kpis.draftWithVideoCount, 2)
eq('KPI missingVideoCount', kpis.missingVideoCount, 1)
check('KPI cộng lại = total', kpis.publicCount + kpis.draftWithVideoCount + kpis.missingVideoCount === kpis.total)
check('hasSupportedVideo: public thiếu video vẫn false', hasSupportedVideo(catalog[3]) === false)
check('hasSupportedVideo tôn trọng hasVideo=true từ server', hasSupportedVideo({ hasVideo: true }) === true)
eq('Filter q', filterTrialCatalog(catalog, { q: 'este' }).map((x) => x.id), ['a', 'b'])
eq('Filter classId', filterTrialCatalog(catalog, { classId: 'c11' }).map((x) => x.id), ['d', 'e'])
eq('Filter chapterId', filterTrialCatalog(catalog, { chapterId: 'ch1' }).map((x) => x.id), ['a', 'b'])
eq('Filter status=draft', filterTrialCatalog(catalog, { status: 'draft' }).map((x) => x.id), ['b', 'c', 'e'])
eq('Filter video=without', filterTrialCatalog(catalog, { video: 'without' }).map((x) => x.id), ['c', 'd'])
eq('Filter rỗng trả toàn bộ', filterTrialCatalog(catalog, {}).length, 5)
eq('Filter catalog null -> []', filterTrialCatalog(null, {}), [])

console.log('\n-- Write guard (stale / duplicate) --')
const guard = createWriteGuard()
const t1 = guard.begin()
const t2 = guard.begin()
check('Token cũ thành stale sau begin mới', guard.isCurrent(t1) === false)
check('Token mới nhất là current', guard.isCurrent(t2) === true)
guard.reset()
check('Reset làm token trước đó stale', guard.isCurrent(t2) === false)
const t3 = guard.begin()
check('Begin sau reset lại current', guard.isCurrent(t3) === true)

console.log('\n-- Định dạng thời gian --')
check('ISO hợp lệ -> chuỗi vi-VN', formatTrialUpdatedAt('2026-10-26T08:00:00.000Z').length > 0)
check('ISO rác -> chuỗi rỗng', formatTrialUpdatedAt('not-a-date') === '')
check('null -> chuỗi rỗng', formatTrialUpdatedAt(null) === '')

console.log('\n-- Contract tĩnh FE --')
const appSrc = read('app.js')
const sidebarSrc = read('components/sidebar.js')
const apiSrc = read('api.js')
const viewSrc = read('views/trial-management.js')
const trialSrc = read('views/trial.js')
const curriculumSrc = read('views/curriculum.js')
const stylesSrc = readFileSync(join(HERE, '..', 'src', 'css', 'styles.css'), 'utf8')

check('app.js: route trial-management đăng ký', /'trial-management':\s*\{\s*render:\s*renderTrialManagementView/.test(appSrc))
check('app.js: import view trial-management', /views\/trial-management\.js/.test(appSrc))
check('app.js: trial-management trong adminOnlyRoutes', /adminOnlyRoutes = \[[^\]]*'trial-management'[^\]]*\]/.test(appSrc))
check('sidebar.js: có mục Quản lý học thử', /Quản lý học thử/.test(sidebarSrc))
check('sidebar.js: mục nằm trong khối ADMIN (sau "Quản trị viên", trước "Dành cho học sinh")', (() => {
  const adminIdx = sidebarSrc.indexOf('Quản trị viên')
  const itemIdx = sidebarSrc.indexOf('Quản lý học thử')
  const studentIdx = sidebarSrc.indexOf('Dành cho học sinh')
  return adminIdx !== -1 && itemIdx > adminIdx && itemIdx < studentIdx
})())
check('sidebar.js: mục active theo trial-management', /currentRoute === 'trial-management'/.test(sidebarSrc))
check('api.js: đủ 4 method trial-management', /getTrialCatalog/.test(apiSrc) && /saveTrialVideo/.test(apiSrc) && /publishTrialLesson/.test(apiSrc) && /revokeTrialLesson/.test(apiSrc))
check('api.js: gọi qua function trial-management (không PostgREST)', /request\('trial-management'/.test(apiSrc))
check('view: dùng api trial-management', /api\.getTrialCatalog/.test(viewSrc) && /api\.saveTrialVideo/.test(viewSrc) && /api\.publishTrialLesson/.test(viewSrc) && /api\.revokeTrialLesson/.test(viewSrc))
check('view: KHÔNG query PostgREST trực tiếp (supabase-js / .from(\'table\') / createClient)', !/supabase-js/.test(viewSrc) && !/\.from\('[^']+'\)/.test(viewSrc) && !/createClient/.test(viewSrc))
check('view: preview dùng getSafeEmbedUrl (không iframe URL thô)', /getSafeEmbedUrl/.test(viewSrc) && !/src="\$\{escapeHtml\(lesson\.videoUrl\)\}"/.test(viewSrc))
check('view: có fallback clipboard (execCommand)', /execCommand\('copy'\)/.test(viewSrc))
check('view: có modal sao chép thủ công khi clipboard bị chặn', /Sao chép link học thử/.test(viewSrc) && /Trình duyệt đã chặn sao chép tự động/.test(viewSrc))
check('view: revoke confirm nói rõ link mất hiệu lực + giữ video', /mất hiệu lực ngay/.test(viewSrc) && /vẫn được giữ nội bộ/.test(viewSrc))
check('view: có trạng thái loading/error/empty', /Đang tải danh sách bài học/.test(viewSrc) && /Không tải được danh sách/.test(viewSrc) && /Chưa có bài học nào/.test(viewSrc))
check('view: có nút thử lại khi lỗi', /btn-trial-retry/.test(viewSrc))
check('view: có guard chống stale (loadGen / modalGuard)', /loadGen/.test(viewSrc) && /modalGuard/.test(viewSrc))
check('view: không tự retry write (không setTimeout retry sau lỗi ghi)', !/setTimeout\(\(\) => handleSave/.test(viewSrc))
check('trial.js: dùng deep-link helper + trạng thái thu hồi', /resolveTrialLessonDeepLink/.test(trialSrc) && /đã được thu hồi hoặc không còn khả dụng/.test(trialSrc))
check('curriculum.js: đã bỏ checkbox trực tiếp', !/lesson-trial-toggle/.test(curriculumSrc))
check('curriculum.js: có link sang module mới', /#trial-management\?lessonId=/.test(curriculumSrc))
check('styles.css: có highlight cho bài từ deep link', /\.trial-row-highlight/.test(stylesSrc))

console.log(`\n=== Kết quả: ${passed} passed, ${failed} failed ===`)
if (failed > 0) process.exitCode = 1
