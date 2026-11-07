import test from 'node:test'
import assert from 'node:assert/strict'
import { register } from 'node:module'

// Intercept .css, .svg and mock import.meta.env during node test execution
register('data:text/javascript,' + encodeURIComponent(`
  import { readFileSync } from 'node:fs';
  import { fileURLToPath } from 'node:url';

  export async function load(url, context, nextLoad) {
    if (url.endsWith('.css')) {
      return { format: 'module', shortCircuit: true, source: '' };
    }
    if (url.endsWith('.svg')) {
      return { format: 'module', shortCircuit: true, source: 'export default "test-mascot.svg";' };
    }
    if (url.includes('exam-room.js') || url.includes('homework-solver.js')) {
      const filePath = fileURLToPath(url);
      const code = readFileSync(filePath, 'utf8')
        .replace(/import\\.meta\\.env\\.VITE_SUPABASE_URL/g, '""');
      return { format: 'module', shortCircuit: true, source: code };
    }
    return nextLoad(url, context);
  }
`))

const saved = new Map()
const storage = {
  getItem: key => saved.get(key) ?? null,
  setItem: (key, value) => saved.set(key, String(value)),
  removeItem: key => saved.delete(key),
  clear: () => saved.clear()
}

globalThis.localStorage = storage
globalThis.sessionStorage = storage
globalThis.CustomEvent = class {
  constructor(type, options = {}) { this.type = type; this.detail = options.detail }
}
globalThis.document = {
  documentElement: { dataset: {}, style: {} },
  addEventListener: () => {},
  dispatchEvent: () => {},
  querySelectorAll: () => [],
  getElementById: () => null
}
globalThis.window = {
  location: { hash: '#exam-room', search: '' },
  addEventListener: () => {},
  matchMedia: () => ({ matches: false })
}

const { state } = await import('../src/js/state.js')
const {
  renderExamRoomView,
  renderClassicExamRoomView
} = await import('../src/js/views/exam-room.js')
const {
  renderHomeworkSolverView,
  renderClassicHomeworkSolverView
} = await import('../src/js/views/homework-solver.js')
const { canViewHomeworkPdf } = await import('../src/js/utils/homework-pdf-policy.js')

function useStudent() {
  state.token = 'test-student-token'
  state.user = { id: 'student-1', role: 'STUDENT', fullName: 'Lê Minh Anh', username: 'minhanh' }
  state.classes = [{ id: 'class-1', name: 'Lớp 12A1' }]
}

function useAdmin() {
  state.token = 'test-admin-token'
  state.user = { id: 'admin-1', role: 'ADMIN', fullName: 'Quản trị viên', username: 'admin' }
}

function setMochi(enabled) {
  if (enabled) saved.set('eduportal-ui', 'mochi')
  else saved.set('eduportal-ui', 'classic') // Mochi là mặc định: phải chọn giao diện cũ tường minh
  window.location.search = ''
}

function extractIds(html) {
  const ids = new Set()
  for (const m of String(html).matchAll(/id="([^"]+)"/g)) {
    ids.add(m[1])
  }
  return ids
}

function createSampleExamData(type = 'EXAM', hasPdf = false, isInteractive = true) {
  return {
    homework: {
      id: 'hw-exam-101',
      title: 'Đề thi khảo sát Toán 12',
      type: type,
      homework_type: type,
      durationMinutes: 45,
      maxAttempts: 1,
      maxViolations: 3,
      pdfUrl: hasPdf ? 'https://example.com/test.pdf' : null,
      pdfPath: hasPdf ? (isInteractive ? 'INTERACTIVE' : 'test.pdf') : null
    },
    questions: [
      {
        id: 'q-1',
        questionNumber: 1,
        questionType: 'MULTIPLE_CHOICE',
        prompt: 'Nghiệm của phương trình $2^x = 4$ là:',
        options: [
          { id: 'A', text: '$x = 1$' },
          { id: 'B', text: '$x = 2$' },
          { id: 'C', text: '$x = 3$' },
          { id: 'D', text: '$x = 4$' }
        ],
        points: 1.0
      },
      {
        id: 'q-2',
        questionNumber: 2,
        questionType: 'TRUE_FALSE',
        prompt: 'Cho hàm số $y = x^3 - 3x$. Xét tính đúng sai:',
        options: [
          { id: 'a', text: 'Hàm số đồng biến trên $(1; +\\infty)$' },
          { id: 'b', text: 'Hàm số nghịch biến trên $(-1; 1)$' },
          { id: 'c', text: 'Hàm số có hai điểm cực trị' },
          { id: 'd', text: 'Giá trị cực đại bằng 0' }
        ],
        points: 1.0
      },
      {
        id: 'q-3',
        questionNumber: 3,
        questionType: 'SHORT_ANSWER',
        prompt: 'Tìm giá trị nhỏ nhất của $f(x) = x^2 - 4x + 5$ trên $[0; 3]$:',
        points: 0.5
      },
      {
        id: 'q-4',
        questionNumber: 4,
        questionType: 'ESSAY',
        prompt: 'Trình bày các bước giải phương trình vi phân cơ bản:',
        points: 2.0
      }
    ]
  }
}

test('cờ Mochi tắt: output exam-room và homework-solver giữ nguyên 100% snapshot classic', () => {
  useStudent()
  setMochi(false)

  state.currentHomework = createSampleExamData('EXAM', true)

  const classicExam = renderClassicExamRoomView()
  const currentExam = renderExamRoomView()
  assert.equal(currentExam, classicExam, 'renderExamRoomView phải trùng khớp 100% renderClassicExamRoomView khi cờ tắt')

  const classicSolver = renderClassicHomeworkSolverView()
  const currentSolver = renderHomeworkSolverView()
  assert.equal(currentSolver, classicSolver, 'renderHomeworkSolverView phải trùng khớp 100% renderClassicHomeworkSolverView khi cờ tắt')
})

test('cờ Mochi bật nhưng role ADMIN: giữ nguyên output classic, không hiển thị Mochi view', () => {
  useAdmin()
  setMochi(true)

  state.currentHomework = createSampleExamData('EXAM', true)

  const classicExam = renderClassicExamRoomView()
  const currentExam = renderExamRoomView()
  assert.equal(currentExam, classicExam, 'ADMIN xem exam-room phải giữ nguyên giao diện classic')

  const classicSolver = renderClassicHomeworkSolverView()
  const currentSolver = renderHomeworkSolverView()
  assert.equal(currentSolver, classicSolver, 'ADMIN xem homework-solver phải giữ nguyên giao diện classic')
})

test('cờ Mochi bật + STUDENT: exam-room có đầy đủ layout Mochi và class hook', () => {
  useStudent()
  setMochi(true)

  state.currentHomework = createSampleExamData('EXAM', true)

  const mochiExam = renderExamRoomView()
  assert.match(mochiExam, /m-exam-room/, 'phải có class hook m-exam-room')
  assert.match(mochiExam, /m-card/, 'thẻ câu hỏi phải có class m-card')
  assert.match(mochiExam, /m-chip/, 'phải có chip m-chip')
  assert.match(mochiExam, /m-option/, 'các đáp án trắc nghiệm phải có m-option')
  assert.match(mochiExam, /m-mascot/, 'phải có linh vật mascot cổ vũ')
  assert.match(mochiExam, /Đề thi khảo sát Toán 12/, 'phải hiển thị đúng tiêu đề bài thi thật')
})

test('cờ Mochi bật + STUDENT: homework-solver interactive mode có layout Mochi và class hook', () => {
  useStudent()
  setMochi(true)

  state.currentHomework = createSampleExamData('PRACTICE', true, true)

  const mochiSolver = renderHomeworkSolverView()
  assert.match(mochiSolver, /m-solver-layout/, 'phải có class hook m-solver-layout')
  assert.match(mochiSolver, /m-card/, 'thẻ câu hỏi phải có class m-card')
  assert.match(mochiSolver, /m-option/, 'các đáp án trắc nghiệm phải có m-option')
  assert.match(mochiSolver, /m-mascot/, 'phải có linh vật mascot cổ vũ')
  assert.match(mochiSolver, /Đề thi khảo sát Toán 12/, 'phải hiển thị đúng tiêu đề bài tập thật')
})

test('cờ Mochi bật + STUDENT: homework-solver PDF mode có layout Mochi split view', () => {
  useStudent()
  setMochi(true)

  state.currentHomework = createSampleExamData('PRACTICE', true, false)

  const mochiPdfSolver = renderHomeworkSolverView()
  assert.match(mochiPdfSolver, /m-solver-layout/, 'phải có class hook m-solver-layout')
  assert.match(mochiPdfSolver, /split-homework-layout/, 'phải có layout split')
  assert.match(mochiPdfSolver, /pdf-iframe-wrapper/, 'phải có khung hiển thị PDF')
  assert.match(mochiPdfSolver, /autosave-status/, 'phải có trạng thái autosave')
  assert.match(mochiPdfSolver, /PHIẾU ĐIỀN ĐÁP ÁN/, 'phải có phiếu điền đáp án')
})

test('bảo toàn tập ID: không có ID nào bị mất hoặc đổi tên giữa classic và Mochi', () => {
  useStudent()
  state.currentHomework = createSampleExamData('EXAM', true)

  // Exam Room
  setMochi(false)
  const classicExamIds = extractIds(renderClassicExamRoomView())
  setMochi(true)
  const mochiExamIds = extractIds(renderExamRoomView())

  for (const id of classicExamIds) {
    assert.ok(
      mochiExamIds.has(id),
      `ID "${id}" có trong classic exam-room nhưng bị thiếu trong Mochi exam-room`
    )
  }

  // Homework Solver (so sánh các ID thuộc solver, bỏ qua sidebar do sidebar.js quản lý riêng)
  setMochi(false)
  const classicSolverIds = [...extractIds(renderClassicHomeworkSolverView())].filter(id => !id.startsWith('sidebar-'))
  setMochi(true)
  const mochiSolverIds = extractIds(renderHomeworkSolverView())

  for (const id of classicSolverIds) {
    assert.ok(
      mochiSolverIds.has(id),
      `ID "${id}" có trong classic homework-solver nhưng bị thiếu trong Mochi homework-solver`
    )
  }
})

test('chính sách PDF: học sinh tuyệt đối không thấy nút tải PDF đối với bài EXAM', () => {
  useStudent()
  setMochi(true)

  // Bài EXAM (Interactive)
  state.currentHomework = createSampleExamData('EXAM', true, true)
  assert.equal(canViewHomeworkPdf(state.user.role, state.currentHomework.homework), false)
  const solverExamHtml = renderHomeworkSolverView()
  assert.doesNotMatch(solverExamHtml, /btn-download-solver-pdf/, 'học sinh không được có nút tải đề PDF trong bài thi EXAM interactive')

  // Bài EXAM (PDF mode)
  state.currentHomework = createSampleExamData('EXAM', true, false)
  const solverPdfExamHtml = renderHomeworkSolverView()
  assert.doesNotMatch(solverPdfExamHtml, /btn-download-pdf-mode/, 'học sinh không được có nút tải PDF trong bài thi EXAM PDF mode')

  // Bài PRACTICE (Interactive)
  state.currentHomework = createSampleExamData('PRACTICE', true, true)
  assert.equal(canViewHomeworkPdf(state.user.role, state.currentHomework.homework), true)
  const solverPracticeHtml = renderHomeworkSolverView()
  assert.match(solverPracticeHtml, /btn-download-solver-pdf/, 'bài tập PRACTICE cho phép tải đề PDF')

  // Bài PRACTICE (PDF mode)
  state.currentHomework = createSampleExamData('PRACTICE', true, false)
  const solverPracticePdfHtml = renderHomeworkSolverView()
  assert.match(solverPracticePdfHtml, /btn-download-pdf-mode/, 'bài tập PRACTICE PDF mode cho phép tải đề PDF')
})

test('dữ liệu rỗng / lỗi / quá lượt: render an toàn có hướng dẫn và mascot, không crash', () => {
  useStudent()
  setMochi(true)

  // 1. Dữ liệu rỗng
  state.currentHomework = null
  assert.doesNotThrow(() => renderExamRoomView())
  assert.doesNotThrow(() => renderHomeworkSolverView())
  assert.match(renderExamRoomView(), /Đang chuẩn bị đề thi/)
  assert.match(renderHomeworkSolverView(), /Không tìm thấy bài tập/)

  // 2. Quá số lượt làm bài
  state.currentHomework = {
    homework: { id: 'hw-exceeded', title: 'Bài thi thử nghiệm', maxAttempts: 1 },
    attemptsCount: 2,
    questions: []
  }
  const exceededExam = renderExamRoomView()
  const exceededSolver = renderHomeworkSolverView()
  assert.match(exceededExam, /Đạt Giới Hạn Lượt Thi/)
  assert.match(exceededSolver, /Đạt giới hạn số lần làm bài/)
  assert.match(exceededExam, /m-mascot/)
  assert.match(exceededSolver, /m-mascot/)
})

test('các tính năng chưa bật trong MOCHI_FEATURES không xuất hiện', () => {
  useStudent()
  setMochi(true)
  state.currentHomework = createSampleExamData('EXAM', false)

  const examHtml = renderExamRoomView()
  const solverHtml = renderHomeworkSolverView()

  // Không có streak, xp, badges, leaderboard giả
  assert.doesNotMatch(examHtml, /data-mochi-feature="xp"/)
  assert.doesNotMatch(examHtml, /data-mochi-feature="streak"/)
  assert.doesNotMatch(examHtml, /data-mochi-feature="leaderboard"/)
  assert.doesNotMatch(solverHtml, /data-mochi-feature="xp"/)
  assert.doesNotMatch(solverHtml, /data-mochi-feature="streak"/)
  assert.doesNotMatch(solverHtml, /data-mochi-feature="leaderboard"/)
})

// Hồi quy: bản Mochi phải giữ ĐỦ mọi class chức năng, thuộc tính data-*/name và id mà
// JS bind dùng để đọc/ghi đáp án, theo đúng số lượng như bản cổ điển. (Lỗi từng gặp:
// nút trắc nghiệm PDF dùng data-opt thay vì data-option → đáp án không được ghi nhận.)
test('bản Mochi giữ đủ class chức năng, data-*/name và id như bản cổ điển (4 kịch bản)', () => {
  const FUNCTIONAL = ['btn-exit-solver', 'btn-flag-question', 'btn-manual-save-draft', 'exam-nav-btn', 'exam-option-card', 'tf-toggle-btn', 'tf-statement-row', 'student-mc-btn', 'student-tf-btn', 'student-interactive-essay-input', 'student-interactive-sa-input', 'student-sa-input', 'exam-container', 'exam-room-layout', 'exam-toolbar-back', 'pdf-iframe-wrapper', 'exam-questions-scroll', 'interactive-solver-body', 'exam-room-body', 'exam-sidebar-palette']
  const countClass = (html, c) => (html.match(new RegExp('class="[^"]*\\b' + c + '\\b[^"]*"', 'g')) || []).length
  const attrs = (html) => {
    const m = new Map()
    for (const x of html.matchAll(/\s(data-[a-z0-9-]+|name)="([^"]*)"/g)) {
      if (x[1] === 'data-tour-nav') continue // thuộc menu bên cổ điển (tour), khung Mochi có menu riêng
      const k = x[1] + (x[1] === 'name' ? '=' + x[2] : '')
      m.set(k, (m.get(k) || 0) + 1)
    }
    return m
  }
  useStudent()
  const scenarios = [
    ['exam-interactive', '#exam-room', 'EXAM', false, true],
    ['solver-interactive', '#homework-attempt', 'PRACTICE', false, true],
    ['solver-pdf', '#homework-attempt', 'PRACTICE', true, false],
    ['exam-pdf', '#exam-room', 'EXAM', true, false]
  ]
  for (const [label, hash, type, hasPdf, interactive] of scenarios) {
    window.location.hash = hash + '?homeworkId=hw-1'
    state.currentHomework = createSampleExamData(type, hasPdf, interactive)
    const [classicFn, mochiFn] = hash === '#exam-room'
      ? [renderClassicExamRoomView, renderExamRoomView]
      : [renderClassicHomeworkSolverView, renderHomeworkSolverView]
    setMochi(false); const classic = classicFn()
    setMochi(true); const mochi = mochiFn()
    for (const c of FUNCTIONAL) {
      assert.equal(countClass(mochi, c), countClass(classic, c), `[${label}] số phần tử .${c} phải giống bản cổ điển`)
    }
    const ca = attrs(classic), ma = attrs(mochi)
    for (const [k, v] of ca) assert.equal(ma.get(k) || 0, v, `[${label}] thuộc tính ${k} phải giống bản cổ điển`)
    const ids = h => new Set([...h.matchAll(/\sid="([^"]+)"/g)].map(m => m[1]))
    const mi = ids(mochi)
    for (const id of ids(classic)) if (!id.startsWith('sidebar-')) assert.ok(mi.has(id), `[${label}] thiếu id #${id}`)
  }
  setMochi(false)
})
