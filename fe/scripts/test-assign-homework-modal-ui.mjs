/**
 * Test: Kiểm tra UI và coupling của modal "Gán bài tập sang lớp khác" (assign-homework-modal.js)
 * và theme CSS (theme-admin-modals.css).
 */
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

const jsSource = readFileSync(new URL('../src/js/components/assign-homework-modal.js', import.meta.url), 'utf8')
const cssSource = readFileSync(new URL('../src/css/theme-admin-modals.css', import.meta.url), 'utf8')

// 1. Không can thiệp style.backgroundColor bằng JS trong modal
assert.doesNotMatch(jsSource, /assignViolationsInput\.style\.backgroundColor/, 'Không gán style.backgroundColor inline cho ô vi phạm')
assert.doesNotMatch(jsSource, /assignAttemptsInput\.style\.backgroundColor/, 'Không gán style.backgroundColor inline cho ô lần làm')

// 2. Class hw-config-locked được toggle đúng cách
assert.match(jsSource, /assignViolationsInput\.classList\.toggle\('hw-config-locked',\s*!isExam\)/, 'Toggle class hw-config-locked cho violations')
assert.match(jsSource, /assignAttemptsInput\.classList\.toggle\('hw-config-locked',\s*isExam\)/, 'Toggle class hw-config-locked cho attempts')

// 3. Markup ban đầu có class hw-config-locked và placeholder/title hợp lý
assert.match(jsSource, /id="assign-custom-violations"[^>]*hw-config-locked/, 'Template violations có class hw-config-locked khi !isExam')
assert.match(jsSource, /id="assign-custom-attempts"[^>]*hw-config-locked/, 'Template attempts có class hw-config-locked khi isExam')
assert.doesNotMatch(jsSource, /id="assign-deadline-clear-btn"[^>]*onmouseover/, 'Nút clear deadline không còn inline onmouseover')
assert.doesNotMatch(jsSource, /id="assign-deadline-clear-btn"[^>]*onmouseout/, 'Nút clear deadline không còn inline onmouseout')

// 4. CSS có rule cho disabled inputs và hover clear-btn
assert.match(cssSource, /:is\(#modal-container, #qb-modal-container\) :is\(input, select, textarea\):disabled/, 'Có rule light cho disabled inputs')
assert.match(cssSource, /var\(--adm-modal-surface-strong\) !important/, 'Có rule dark cho disabled inputs')
assert.match(cssSource, /rgb\(241, 245, 249\)/, 'Có mapping phòng thủ rgb(241, 245, 249)')

console.log('Assign homework modal UI & CSS checks: ALL PASSED')
