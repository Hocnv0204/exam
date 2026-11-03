import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

const backend = readFileSync(new URL('../functions/question-bank/index.ts', import.meta.url), 'utf8')
const frontend = readFileSync(new URL('../../fe/src/js/views/question-bank.js', import.meta.url), 'utf8')

// Schema lưu đề trong prompt JSONB, trường text là nội dung câu hỏi.
assert.match(backend, /text:\s*fallbackData\.promptText\s*\|\|\s*fallbackData\.content/)
assert.match(backend, /query\s*=\s*query\.ilike\('prompt->>text',\s*`%\$\{search\.trim\(\)\}%`\)/)
assert.doesNotMatch(backend, /query\.ilike\('prompt',/)
assert.match(frontend, /paramsObj\.set\('search', filterState\.search\)/)
assert.match(frontend, /Tìm kiếm theo nội dung đề bài/)

console.log('question-bank search: JSONB text field and FE contract passed')
