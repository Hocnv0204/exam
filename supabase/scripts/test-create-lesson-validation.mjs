import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

const validators = readFileSync(new URL('../shared/validators.ts', import.meta.url), 'utf8')
const createLesson = validators.match(/export const createLessonSchema[\s\S]*?\n\}\)/)?.[0] || ''
const updateLesson = validators.match(/export const updateLessonSchema[\s\S]*?\n\}\)/)?.[0] || ''

assert.match(createLesson, /content:\s*z\.string\(\)\.optional\(\)\.nullable\(\)/, 'create lesson phải nhận content=null khi mô tả để trống')
assert.match(updateLesson, /content:\s*z\.string\(\)\.optional\(\)\.nullable\(\)/, 'update lesson phải nhận content=null để xóa mô tả')

const fn = readFileSync(new URL('../functions/create-lesson/index.ts', import.meta.url), 'utf8')
assert.match(fn, /content:\s*content\s*\|\|\s*null/, 'create lesson phải lưu nội dung rỗng thành NULL')
assert.match(fn, /if \(content !== undefined\) updateData\.content = content/, 'update lesson phải giữ được giá trị NULL có chủ ý')

console.log('✓ create/update lesson chấp nhận content=null và giữ đúng ngữ nghĩa DB nullable')
