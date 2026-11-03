import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import vm from 'node:vm'

const src = readFileSync(new URL('../src/js/views/trial-management.js', import.meta.url), 'utf8')
const actions = src.slice(src.indexOf('async function copyLink('), src.indexOf('export function renderTrialManagementView()'))

function harness({ videoUrl = 'https://youtu.be/dQw4w9WgXcQ', writeText = async () => {} } = {}) {
  let finishPublish
  const published = []
  const toasts = []
  let loads = 0
  const context = {
    pendingLessons: new Set(), loadGen: 3,
    window: { location: { hash: '#trial-management', origin: 'https://example.test', pathname: '/' } },
    navigator: { clipboard: { writeText } },
    document: {},
    showToast: (...args) => toasts.push(args),
    openModal() {}, escapeHtml: value => value,
    hasSupportedVideo: lesson => !!lesson.videoUrl,
    buildTrialLessonLink: () => 'https://example.test/#trial?lessonId=123',
    api: { publishTrialLesson: (id, url) => { published.push({ id, url }); return new Promise(resolve => { finishPublish = resolve }) } },
    loadCatalog: async () => { loads++ },
  }
  vm.createContext(context)
  vm.runInContext(`${actions}\nthis.controls = { copyLink, handleCopyLink, publishFromToggle }`, context)
  return { context, published, toasts, get loads() { return loads }, finish: () => finishPublish?.(), lesson: { id: 'lesson-1', videoUrl } }
}

test('copy link video là URL video, không phải link trang học thử', async () => {
  const copied = []
  const h = harness({ writeText: async value => copied.push(value) })
  await h.context.controls.copyLink(h.lesson.videoUrl, 'video')
  await h.context.controls.handleCopyLink(h.lesson)
  assert.deepEqual(copied, [h.lesson.videoUrl, 'https://example.test/#trial?lessonId=123'])
})

test('checkbox chỉ bật khi server xác nhận, không gửi ghi trùng', async () => {
  const h = harness()
  const checkbox = { checked: true, disabled: false, isConnected: true }
  const first = h.context.controls.publishFromToggle(h.lesson, checkbox)
  assert.equal(checkbox.checked, false)
  assert.equal(checkbox.disabled, true)
  await h.context.controls.publishFromToggle(h.lesson, checkbox)
  assert.equal(h.published.length, 1)
  assert.equal(h.published[0].url, undefined, 'publish dùng video đã lưu ở backend')
  h.finish()
  await first
  assert.equal(h.loads, 1)
  assert.equal(checkbox.disabled, false)
})

test('không bật học thử khi chưa có video; không tải lại trang cũ sau chuyển route', async () => {
  const h = harness({ videoUrl: null })
  const checkbox = { checked: true, disabled: false, isConnected: true }
  await h.context.controls.publishFromToggle(h.lesson, checkbox)
  assert.equal(checkbox.checked, false)
  assert.equal(h.published.length, 0)
  h.lesson.videoUrl = 'https://youtu.be/dQw4w9WgXcQ'
  const pending = h.context.controls.publishFromToggle(h.lesson, checkbox)
  h.context.window.location.hash = '#curriculum'
  h.finish()
  await pending
  assert.equal(h.loads, 0)
})

test('giao diện thay nút sửa bằng copy video và checkbox theo isTrial', () => {
  assert.match(src, /data-action="copy-video"/)
  assert.match(src, /class="trial-lesson-toggle"/)
  assert.match(src, /\$\{isPublic \? 'checked' : ''\}/)
  assert.match(src, /openRevokeModal\(lesson\)/)
  assert.doesNotMatch(src, /data-action="edit"/)
})
