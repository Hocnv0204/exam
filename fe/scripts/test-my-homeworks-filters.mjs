import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

const read = path => readFileSync(new URL(path, import.meta.url), 'utf8')
const view = read('../src/js/views/my-homeworks.js')
const backend = read('../../supabase/functions/create-homework/index.ts')
const ownHistory = backend.slice(backend.indexOf("if (action === 'my-homeworks'"), backend.indexOf("if (todoOnly && user.role === 'STUDENT')"))

test('lọc chương và bài học ở server trước phân trang; không bỏ giới hạn lớp của học sinh', () => {
  assert.match(ownHistory, /\.in\('lessons\.chapters\.class_id', user\.classIds\)/)
  assert.match(ownHistory, /if \(classFilter\) hwQuery = hwQuery\.eq\('lessons\.chapters\.class_id', classFilter\)/)
  assert.match(ownHistory, /if \(chapterFilter\) hwQuery = hwQuery\.eq\('lessons\.chapter_id', chapterFilter\)/)
  assert.match(ownHistory, /if \(lessonFilter\) hwQuery = hwQuery\.eq\('lesson_id', lessonFilter\)/)
  assert.ok(ownHistory.indexOf("hwQuery.eq('lesson_id', lessonFilter)") < ownHistory.indexOf('const [hwRes, subRes]'))
  assert.ok(ownHistory.indexOf('const scoped =') < ownHistory.indexOf('ordered.slice('))
})

test('giao diện chọn lớp rồi chương rồi bài học; gửi đầy đủ điều kiện và reset phân trang', () => {
  assert.match(view, /id="myhw-chapter-filter"[^>]*disabled/)
  assert.match(view, /id="myhw-lesson-filter"[^>]*disabled/)
  assert.match(view, /api\.getChapters\(classId\)/)
  assert.match(view, /api\.getLessons\(chapterId\)/)
  assert.match(view, /if \(filterChapterId\) sp\.set\('chapterId', filterChapterId\)/)
  assert.match(view, /if \(filterLessonId\) sp\.set\('lessonId', filterLessonId\)/)
  assert.match(view, /filterClassId = e\.target\.value\s+filterChapterId = ''\s+filterLessonId = ''\s+currentPage = 1/)
  assert.match(view, /filterChapterId = e\.target\.value\s+filterLessonId = ''\s+currentPage = 1/)
  assert.match(view, /filterLessonId = e\.target\.value\s+currentPage = 1/)
  assert.match(view, /requestId !== chapterRequestId \|\| !select\.isConnected/)
  assert.match(view, /requestId !== lessonRequestId \|\| !select\.isConnected/)
  assert.match(view, /requestId !== listRequestId \|\| !listEl\.isConnected/)
})
