import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import vm from 'node:vm'

const read = path => readFileSync(new URL(path, import.meta.url), 'utf8')
const homework = read('../src/js/views/homework-solver.js')
const exam = read('../src/js/views/exam-room.js')

function makeEngine(source, startMarker, endMarker, factory) {
  const timers = new Map()
  let nextTimer = 0
  const calls = []
  let active = 0
  let maxActive = 0
  let answer = 'đầu tiên'
  const saved = []
  const context = {
    setTimeout(fn) { const id = ++nextTimer; timers.set(id, fn); return id },
    clearTimeout(id) { timers.delete(id) },
  }
  vm.createContext(context)
  vm.runInContext(source.slice(source.indexOf(startMarker), source.indexOf(endMarker)), context)
  const engine = context[factory]({
    isEnabled: () => true, isLocked: () => false,
    snapshot: () => ({ value: answer }),
    save: snapshot => {
      active++
      maxActive = Math.max(maxActive, active)
      return new Promise((resolve, reject) => calls.push({
        value: snapshot.value,
        resolve: () => { active--; resolve() },
        reject: () => { active--; reject(new Error('mất mạng')) },
      }))
    },
    onSaved: snap => saved.push(snap.value),
    onError: () => {},
  })
  return {
    engine, calls, saved, timers,
    setAnswer(value) { answer = value; engine.schedule() },
    tick() { for (const [id, fn] of [...timers]) { timers.delete(id); fn() } },
    maxActive: () => maxActive,
  }
}

for (const [name, source, start, end, factory] of [
  ['bài tập', homework, '// === DRAFT_AUTOSAVE_ENGINE_START ===', '// === DRAFT_AUTOSAVE_ENGINE_END ===', 'createDraftAutosaveEngine'],
  ['bài thi', exam, '// === EXAM_AUTOSAVE_ENGINE_START ===', '// === EXAM_AUTOSAVE_ENGINE_END ===', 'createExamAutosaveEngine'],
]) {
  test(`${name}: thay đổi nhanh và mạng chậm vẫn lưu bản mới nhất, không gửi chồng`, async () => {
    const h = makeEngine(source, start, end, factory)
    h.setAnswer('câu 1')
    h.tick()
    assert.deepEqual(h.calls.map(c => c.value), ['câu 1'])
    h.setAnswer('câu 2')
    h.tick()
    assert.equal(h.calls.length, 1)
    h.calls[0].resolve()
    await new Promise(setImmediate)
    assert.deepEqual(h.calls.map(c => c.value), ['câu 1', 'câu 2'])
    h.calls[1].resolve()
    await h.engine.flush()
    h.setAnswer('câu 3')
    h.tick()
    assert.deepEqual(h.calls.map(c => c.value), ['câu 1', 'câu 2', 'câu 3'])
    h.calls[2].resolve()
    await h.engine.flush()
    assert.equal(h.maxActive(), 1)
    assert.equal(h.engine.isDirty(), false)
  })

  test(`${name}: lỗi mạng giữ bản mới nhất để thử lại; dừng sau nộp không phát request`, async () => {
    const h = makeEngine(source, start, end, factory)
    h.setAnswer('nháp')
    const flushing = h.engine.flush()
    h.calls[0].reject()
    await flushing
    assert.equal(h.engine.isDirty(), true)
    h.tick()
    assert.equal(h.calls.length, 2)
    h.calls[1].resolve()
    await h.engine.flush()
    assert.equal(h.engine.isDirty(), false)
    h.engine.dispose()
    h.setAnswer('đã nộp')
    h.tick()
    assert.equal(h.calls.length, 2)
  })

  test(`${name}: đang gửi mà nộp bài thì không gửi bản chờ cũ sau khi đóng engine`, async () => {
    const h = makeEngine(source, start, end, factory)
    h.setAnswer('đã gửi')
    h.tick()
    h.setAnswer('đang chờ')
    h.engine.dispose()
    h.calls[0].resolve()
    await new Promise(setImmediate)
    h.tick()
    assert.deepEqual(h.calls.map(c => c.value), ['đã gửi'])
  })
}

test('nháp tự luận được đếm và server giữ field essay để khôi phục', () => {
  const countFn = homework.slice(homework.indexOf('function countAnsweredFor('), homework.indexOf('function countAnswered()'))
  const context = vm.createContext({})
  vm.runInContext(countFn, context)
  assert.equal(context.countAnsweredFor({ mc: {}, tf: {}, sa: {}, essay: { 1: 'Giải thích' } }), 1)
  assert.equal(context.countAnsweredFor({ mc: {}, tf: {}, sa: {}, essay: { 1: '   ' } }), 0)
  const server = read('../../supabase/functions/homework-detail/index.ts')
  assert.match(server, /essay: body\.answers\.essay/)
  assert.match(server, /\.eq\('student_id', user\.id\)/)
})
