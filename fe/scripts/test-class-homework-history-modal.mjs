import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

globalThis.window = {}
globalThis.localStorage = { getItem: () => null, setItem: () => {}, removeItem: () => {} }
const { renderClassHomeworkHistory, groupWrongQuestions } = await import('../src/js/views/class-homework-history-modal.js')
const payload = {
  history: [
    { studentId: 'a', studentName: '<img src=x onerror=alert(1)>', username: 'alpha', score: 7, maxScore: 10, wrongAnswers: [{ questionNumber: 2 }] },
    { studentId: 'a', studentName: 'Alpha', username: 'alpha', score: 8, maxScore: 10, wrongAnswers: [] },
  ],
  unsubmittedStudents: [{ studentId: 'b', fullName: '<script>bad</script>', username: 'beta' }],
  wrongQuestionsSummary: [{ questionNumber: 2, prompt: '{"text":"Câu hỏi <img onerror=1>"}', wrongCount: 1, unansweredCount: 0 }],
  submissionStats: { totalStudents: 2, deadline: null, averageScore: 7.5, passRate: 100 },
}
const submitted = renderClassHomeworkHistory(payload)
assert.match(submitted, /Tiến độ nộp bài: 1\/2 học sinh \(50%\)/)
assert.match(submitted, /Đã nộp \(2\)/) // 2 lần nộp, 1 học sinh
assert.match(submitted, /Chưa làm \(1\)/)
assert.match(submitted, /&lt;img src=x onerror=alert\(1\)&gt;/)
assert.doesNotMatch(submitted, /<img src=x/)
const missing = renderClassHomeworkHistory(payload, 'unsubmitted')
assert.match(missing, /&lt;script&gt;bad&lt;\/script&gt;/)
assert.doesNotMatch(missing, /<script>/)
const wrong = renderClassHomeworkHistory(payload, 'wrong')
assert.match(wrong, /Câu hỏi &lt;img onerror=1&gt;/)
assert.doesNotMatch(wrong, /\{&quot;text&quot;/)
assert.match(renderClassHomeworkHistory({ history: [], unsubmittedStudents: [], wrongQuestionsSummary: [] }), /Chưa có học sinh nộp bài/)
const view = readFileSync(new URL('../src/js/views/class-details.js', import.meta.url), 'utf8')
const modal = readFileSync(new URL('../src/js/views/class-homework-history-modal.js', import.meta.url), 'utf8')
const backend = readFileSync(new URL('../../supabase/functions/student-history/index.ts', import.meta.url), 'utf8')
assert.match(view, /btn-class-homework-results/)
assert.doesNotMatch(view, /href="#admin-history\?classId=\$\{currentClass\.id\}"/)
assert.match(modal, /homeworkId: homework\.id, includeDraft: 'true'/)
assert.match(modal, /controller\.abort\(\)/)
assert.match(modal, /classHomeworks\.some\(hw => hw\.id === homework\.id\)/)
assert.match(backend, /user\?\.role === 'ADMIN' && homeworkId && url\.searchParams\.get\('includeDraft'\) === 'true'/)
assert.match(backend, /classHomeworkQuery = classHomeworkQuery\.eq\('id', homeworkId\)/)
assert.match(backend, /rawSubmissions = rawSubmissions\.filter/)
console.log('Popup lịch sử theo bài: tabs / XSS / nộp lại / scope admin PASS')

const questions = [
  { questionId: 'mc', questionNumber: 1, questionType: 'MULTIPLE_CHOICE', prompt: {
    text: '**Phản ứng** $\\ce{Fe2O3 + 3CO -> 2Fe + 3CO2}$ với $x<y$. ![ảnh](https://example.org/stem.png)',
    imageUrl: 'https://example.org/diagram.png?a=1&b=2',
    metadata: { questionTypeTag: '  Phản ứng   oxi hóa ' },
    options: [{ id: 'A', text: '$\\ce{Fe}$' }, { id: 'B', text: '$\\frac{1}{2}$' }],
  }, correctAnswer: 'B', wrongCount: 2, unansweredCount: 1, totalFailed: 3, totalSubmittedAttempts: 5,
  students: [{ studentId: 's1', studentName: 'An', givenAnswer: 'A' }, { studentId: 's1', studentName: 'An', givenAnswer: 'A' }, { studentId: 's2', studentName: 'Bình', isUnanswered: true }] },
  { questionId: 'tf', questionNumber: 2, questionType: 'TRUE_FALSE', questionTypeTag: 'phản ứng oxi hóa', prompt: JSON.stringify({ text: 'Xét đúng sai', statements: [{ id: 'a', text: 'Nước là $\\ce{H2O}$' }, { id: 'b', text: 'Khẳng định hai' }] }), correctAnswer: 'a: Đ, b: S', wrongCount: 1, unansweredCount: 0, totalFailed: 1 },
  { questionId: 'sa', questionNumber: 3, questionType: 'SHORT_ANSWER', prompt: { text: 'Tính $x^2$', metadata: {} }, correctAnswer: '0', wrongCount: 0, unansweredCount: 1, totalFailed: 1 },
]
assert.deepEqual(groupWrongQuestions([...questions, questions[0]]), [
  { name: 'Phản ứng oxi hóa', questionCount: 2, failedAttempts: 4 },
  { name: 'Chưa phân loại', questionCount: 1, failedAttempts: 1 },
])
const analysis = renderClassHomeworkHistory({ history: Array(5).fill({}), wrongQuestionsSummary: questions }, 'wrong')
for (const content of ['<strong>Phản ứng</strong>', '$\\ce{Fe2O3', '$\\frac{1}{2}$', '$x&lt;y$', 'stem.png', 'diagram.png?a=1&amp;b=2', 'Các phương án', 'Các mệnh đề', 'Khẳng định hai', 'Đáp án đúng:', 'a: Đ, b: S', '2 lượt trả lời sai · 1 lượt bỏ trống', 'Tổng lượt đã nộp của bài: 5', '2 học sinh có lượt chưa đúng', 'Chưa phân loại']) assert.ok(analysis.includes(content), content)
const nested = renderClassHomeworkHistory({ wrongQuestionsSummary: [{ questionNumber: 9, prompt: JSON.stringify({ text: JSON.stringify({ text: 'Đề hai lớp $x^2$', options: [{ id: 'A', text: '1' }] }) }) }] }, 'wrong')
assert.match(nested, /Đề hai lớp \$x\^2\$/)
assert.match(nested, /Các phương án/)
assert.doesNotMatch(nested, /&quot;text&quot;/)
const malicious = renderClassHomeworkHistory({ wrongQuestionsSummary: [{ questionNumber: 4, prompt: {
  text: '$<img src=x onerror=alert(1)>$ ![bad](javascript:alert) <script>alert(1)</script>',
  imageUrl: 'javascript:alert(1)', options: [{ id: '\"><svg onload=alert(1)>', text: '$<script>alert(2)</script>$' }],
  metadata: { questionTypeTag: '<iframe srcdoc=x>' },
}, correctAnswer: '$<img src=x onerror=alert(3)>$', students: [{ studentName: '<script>name</script>', givenAnswer: '$<iframe src=javascript:x>$' }] }] }, 'wrong')
assert.doesNotMatch(malicious, /<(?:img|script|svg|iframe)\b/i)
assert.match(malicious, /&lt;img src=x onerror=alert\(1\)&gt;/)
assert.match(modal, /renderMath\(element\)/)
assert.match(modal, /shellFlex: true/)
assert.match(modal, /overflow:hidden/)
console.log('Full questions MC/TF/SA, chemistry/TeX/images, attempt semantics, normalized taxonomy and malicious fixtures PASS')

// DOM fixture exercises the real modal/API/tab lifecycle without student data.
const { api } = await import('../src/js/api.js')
const { openClassHomeworkHistoryModal } = await import('../src/js/views/class-homework-history-modal.js')
let root = null
let rootToken = ''
let mathCalls = 0
const events = new Map()
const nodes = new Map()
const makeRoot = () => ({
  innerHTML: '', retry: {},
  querySelector: () => root.retry,
  querySelectorAll: () => ['submitted', 'wrong', 'unsubmitted'].map(tab => ({ dataset: { tab }, set onclick(handler) { events.set(tab, handler) } })),
})
const container = { set innerHTML(html) {
  rootToken = html.match(/data-class-hw-history-token="([^"]+)"/)?.[1] || ''
  root = rootToken ? makeRoot() : null
} }
nodes.set('modal-container', container)
globalThis.document = {
  body: { classList: { add() {}, remove() {} } },
  getElementById(id) {
    if (!nodes.has(id)) nodes.set(id, { addEventListener(event, handler) { events.set(id, handler) } })
    return nodes.get(id)
  },
  querySelector(selector) { return selector.includes(rootToken) && rootToken ? root : null },
}
window.renderMathInElement = () => { mathCalls++ }
const flush = async () => { await Promise.resolve(); await Promise.resolve() }
const originalApi = api.getStudentHistory
const pending = []
api.getStudentHistory = (params, options) => new Promise((resolve, reject) => pending.push({ params, options, resolve, reject }))
openClassHomeworkHistoryModal('class-a', { id: 'hw-a', title: 'Bài A' })
assert.match(root.innerHTML, /Đang tải/)
assert.equal(pending[0].params.classId, 'class-a')
assert.equal(pending[0].params.homeworkId, 'hw-a')
pending[0].reject(new Error('<script>network</script>'))
await flush()
assert.match(root.innerHTML, /Không tải được lịch sử/)
assert.doesNotMatch(root.innerHTML, /<script>network/)
root.retry.onclick()
assert.equal(pending.length, 2)
pending[1].resolve({ ...payload, classHomeworks: [{ id: 'hw-a' }] })
await flush()
assert.match(root.innerHTML, /Tiến độ nộp bài/)
events.get('wrong')()
assert.match(root.innerHTML, /Phân tích theo Dạng bài/)
assert.ok(mathCalls >= 2)
events.get('unsubmitted')()
assert.match(root.innerHTML, /beta/)

openClassHomeworkHistoryModal('class-b', { id: 'hw-b', title: 'Bài B' })
const oldRequest = pending[2]
openClassHomeworkHistoryModal('class-c', { id: 'hw-c', title: 'Bài C' })
const currentRoot = root
oldRequest.resolve({ ...payload, classHomeworks: [{ id: 'hw-b' }] })
await flush()
assert.equal(root, currentRoot)
assert.match(root.innerHTML, /Đang tải/)
events.get('modal-close-btn')()
assert.equal(pending[3].options.signal.aborted, true)
pending[3].resolve({ ...payload, classHomeworks: [{ id: 'hw-c' }] })
await flush()
assert.equal(root, null)
api.getStudentHistory = originalApi
console.log('Real modal mocked API: loading/error/retry, tabs/math render, replaced modal stale response and close/abort PASS')
