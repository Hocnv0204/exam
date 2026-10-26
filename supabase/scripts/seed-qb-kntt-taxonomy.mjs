// Seed taxonomy constant KNTT cho question-bank qua API CRUD có sẵn.
// CÁCH DÙNG (primary review trước khi apply):
//   node supabase/scripts/seed-qb-kntt-taxonomy.mjs                 # dry-run (mặc định): chỉ in plan, KHÔNG ghi
//   node supabase/scripts/seed-qb-kntt-taxonomy.mjs --apply          # ghi thật lên project SUPABASE_URL
//   SUPABASE_URL=https://xyz.supabase.co QB_ADMIN_JWT=<admin-jwt> node ... --apply
// Yêu cầu: SUPABASE_URL (env hoặc --base-url) + JWT của tài khoản ADMIN (env QB_ADMIN_JWT hoặc --jwt).
// JWT KHÔNG được đưa vào repo, không in ra log. Script không tự retry: gặp lỗi thì dừng ngay,
// chạy lại sẽ tiếp tục từ chỗ đã seed nhờ matching theo natural key (idempotent).
// Matching: theo tên chuẩn hóa (bỏ khoảng trắng thừa, thống nhất dấu ':'/'.' sau 'Bài N'/'Chương X');
// nếu không khớp tên thì fallback theo số bài/chương trong cùng cha. Item đã có sẵn KHÔNG bị đổi
// tên/order — chỉ tạo item còn thiếu. Order của item mới = max order_index hiện có trong cha + 1.

import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'

const args = process.argv.slice(2)
const APPLY = args.includes('--apply')
const getArg = (name) => {
  const i = args.indexOf(name)
  return i >= 0 && args[i + 1] ? args[i + 1] : null
}
const BASE = (getArg('--base-url') || process.env.SUPABASE_URL || '').replace(/\/$/, '')
const JWT = getArg('--jwt') || process.env.QB_ADMIN_JWT || ''
const FIXTURE = getArg('--fixture') || join(dirname(fileURLToPath(import.meta.url)), '..', 'seeds', 'qb-kntt-taxonomy.json')

if (!BASE || !JWT) {
  console.error('Thiếu SUPABASE_URL hoặc QB_ADMIN_JWT (env hoặc --base-url/--jwt). Dừng.')
  process.exit(2)
}

const norm = (s) => String(s || '').trim().toLowerCase()
  .replace(/\s+/g, ' ')
  .replace(/(bài\s+\d+)\s*[:.]\s*/g, '$1. ')
  .replace(/(chương\s+[ivxlcdm0-9]+)\s*[:.]\s*/g, '$1. ')
// Số bài/chương đầu tiêu đề, dùng làm fallback khi tên không khớp tuyệt đối.
const leadingNum = (s) => {
  const m = String(s || '').trim().match(/^Bài\s+(\d+)/i) || String(s || '').trim().match(/^Chương\s+([IVXLCDM0-9]+)/i)
  if (!m) return null
  const raw = m[1].toUpperCase()
  const roman = { I: 1, II: 2, III: 3, IV: 4, V: 5, VI: 6, VII: 7, VIII: 8, IX: 9, X: 10 }
  return roman[raw] ? String(roman[raw]) : raw
}

function findExisting(list, title) {
  const n = norm(title)
  const exact = list.find((r) => norm(r.name || r.title) === n)
  if (exact) return { row: exact, fuzzy: false }
  const num = leadingNum(title)
  if (num) {
    const byNum = list.filter((r) => leadingNum(r.name || r.title) === num)
    if (byNum.length === 1) return { row: byNum[0], fuzzy: true }
  }
  return { row: null, fuzzy: false }
}

async function api(path, { method = 'GET', body } = {}) {
  const res = await fetch(`${BASE}/functions/v1/question-bank${path}`, {
    method,
    headers: { Authorization: `Bearer ${JWT}`, 'Content-Type': 'application/json' },
    body: body ? JSON.stringify(body) : undefined
  })
  const text = await res.text()
  let json = null
  try { json = JSON.parse(text) } catch { /* non-json error body */ }
  if (!res.ok) throw new Error(`HTTP ${res.status} ${path}: ${text.slice(0, 300)}`)
  return json
}

async function getTaxonomy() {
  const res = await api('?action=constant-taxonomy')
  return {
    gradeBlocks: res.gradeBlocks || [],
    classes: res.classes || [],
    chapters: res.chapters || [],
    lessons: res.lessons || [],
    questionTypes: res.questionTypes || []
  }
}

const fixture = JSON.parse(readFileSync(FIXTURE, 'utf8'))
const tax = await getTaxonomy()

// Cảnh báo: các lớp đã có trong khối nhưng không nằm trong fixture (primary xem xét trước khi apply).
for (const block of fixture.blocks) {
  const blockGrade = block.targetGradeBlock || block.name
  const gb = tax.gradeBlocks.find((r) => norm(r.name) === norm(blockGrade))
  if (!gb) continue
  const existing = tax.classes.filter((c) => (gb.id && c.grade_block_id === gb.id) || norm(c.grade_block) === norm(blockGrade))
  const extra = existing.filter((c) => norm(c.name) !== norm(block.class))
  if (extra.length) console.log(`[CẢNH BÁO] Khối ${blockGrade} đã có lớp ngoài fixture (sẽ KHÔNG bị sửa/xóa): ${extra.map((c) => c.name).join(', ')}`)
}

const plan = [] // { type, data, parentDesc }
const resolved = new Map() // fixture path -> created/existing row id

function nextOrder(rows) {
  let max = 0
  for (const r of rows) if (Number.isFinite(r.order_index)) max = Math.max(max, r.order_index)
  return max + 1
}

// Tính plan theo từng cấp. Mỗi cấp dùng dữ liệu taxonomy + các id đã resolve ở cấp trước.
// Vì plan chỉ chứa item còn thiếu, và apply chạy tuần tự theo cấp rồi GET lại sau mỗi cấp,
// nên id cha luôn có khi tới cấp con.
function computeLevelPlan() {
  const p = []
  for (const block of fixture.blocks) {
    const blockGrade = block.targetGradeBlock || block.name
    const gb = findExisting(tax.gradeBlocks, blockGrade).row
    const gbId = gb ? gb.id : resolved.get(`gb:${blockGrade}`)
    if (!gb && !p.some((x) => x.key === `gb:${blockGrade}`)) {
      p.push({ key: `gb:${blockGrade}`, type: 'gradeBlock', data: { name: blockGrade, orderIndex: nextOrder(tax.gradeBlocks) }, desc: `Khối ${blockGrade}` })
    }
    const gbIdForClass = gbId || `NEW:gb:${blockGrade}`
    const classRows = tax.classes.filter((c) => (gb && gb.id && c.grade_block_id === gb.id) || norm(c.grade_block) === norm(blockGrade))
    const cl = findExisting(classRows, block.class).row
    if (!cl && !p.some((x) => x.key === `cl:${blockGrade}/${block.class}`)) {
      p.push({ key: `cl:${blockGrade}/${block.class}`, type: 'class', data: { gradeBlock: blockGrade, gradeBlockId: gbId || null, name: block.class, orderIndex: nextOrder(classRows) }, desc: `Lớp ${block.class} <- Khối ${blockGrade}`, needsParent: gbId ? null : `gb:${blockGrade}` })
    }
    const clId = cl ? cl.id : resolved.get(`cl:${blockGrade}/${block.class}`)
    for (const chapter of block.chapters) {
      const chRows = tax.chapters.filter((c) => (cl && c.class_id === cl.id))
      const ch = findExisting(chRows, chapter.title).row
      if (!ch && !p.some((x) => x.key === `ch:${blockGrade}/${chapter.title}`)) {
        p.push({ key: `ch:${blockGrade}/${chapter.title}`, type: 'chapter', data: { classId: clId || null, title: chapter.title, orderIndex: nextOrder(chRows) }, desc: `Chương ${chapter.title} <- Lớp ${block.class}`, needsParent: clId ? null : `cl:${blockGrade}/${block.class}` })
      }
      const chId = ch ? ch.id : resolved.get(`ch:${blockGrade}/${chapter.title}`)
      for (const lesson of chapter.lessons) {
        const lsRows = tax.lessons.filter((l) => (ch && l.chapter_id === ch.id))
        const ls = findExisting(lsRows, lesson.title).row
        if (!ls && !p.some((x) => x.key === `ls:${blockGrade}/${lesson.title}`)) {
          p.push({ key: `ls:${blockGrade}/${lesson.title}`, type: 'lesson', data: { chapterId: chId || null, title: lesson.title, orderIndex: nextOrder(lsRows) }, desc: `Bài ${lesson.title} <- ${chapter.title}`, needsParent: chId ? null : `ch:${blockGrade}/${chapter.title}` })
        }
        const lsId = ls ? ls.id : resolved.get(`ls:${blockGrade}/${lesson.title}`)
        for (const typeName of lesson.types) {
          const tyRows = tax.questionTypes.filter((t) => (ls && t.lesson_id === ls.id))
          const ty = findExisting(tyRows, typeName).row
          if (!ty && !p.some((x) => x.key === `ty:${blockGrade}/${lesson.title}/${typeName}`)) {
            p.push({ key: `ty:${blockGrade}/${lesson.title}/${typeName}`, type: 'questionType', data: { lessonId: lsId || null, name: typeName, orderIndex: nextOrder(tyRows) }, desc: `Dạng bài ${typeName} <- ${lesson.title}`, needsParent: lsId ? null : `ls:${blockGrade}/${lesson.title}` })
          }
        }
      }
    }
  }
  return p
}

let levelPlan = computeLevelPlan()
const byType = (t) => levelPlan.filter((x) => x.type === t).length
console.log(`Chế độ: ${APPLY ? 'APPLY (ghi thật)' : 'DRY-RUN (không ghi)'}`)
console.log(`Plan: ${levelPlan.length} item cần tạo — Khối ${byType('gradeBlock')}, Lớp ${byType('class')}, Chương ${byType('chapter')}, Bài ${byType('lesson')}, Dạng bài ${byType('questionType')}`)

if (!APPLY) {
  for (const item of levelPlan) console.log(`  + [${item.type}] ${item.desc}`)
  console.log('Chạy thêm --apply để ghi. Kiểm tra lại plan trước khi apply.')
  process.exit(0)
}

// APPLY: chạy theo cấp (khối -> lớp -> chương -> bài -> dạng bài), sau mỗi cấp GET lại để lấy id cha.
const LEVEL_ORDER = ['gradeBlock', 'class', 'chapter', 'lesson', 'questionType']
let created = 0
for (const level of LEVEL_ORDER) {
  const items = levelPlan.filter((x) => x.type === level)
  for (const item of items) {
    // Resolve parent id từ taxonomy mới nhất (GET lại sau mỗi cấp, và từ resolved của cấp hiện tại).
    const data = { ...item.data }
    if (item.needsParent) {
      // Parent vừa tạo trong cấp trước: tìm lại qua GET mới nhất (tax đã refresh).
      const fresh = await getTaxonomy()
      Object.assign(tax, fresh)
      levelPlan = computeLevelPlan()
      // Tìm lại item này trong plan mới (parent giờ đã có id).
      const again = levelPlan.find((x) => x.key === item.key)
      if (!again || again.data[Object.keys(again.data).find((k) => /Id$/.test(k))] == null) {
        // Parent vẫn chưa resolve được: bỏ qua item này, báo lỗi rõ ràng thay vì ghi sai cha.
        console.error(`BỎ QUA ${item.desc}: không resolve được id cha.`)
        continue
      }
      Object.assign(data, again.data)
    }
    try {
      const res = await api('?action=create-constant-taxonomy', { method: 'POST', body: { type: item.type, data } })
      created++
      console.log(`  OK [${item.type}] ${item.desc} -> ${JSON.stringify(res?.item?.id || res?.id || 'created')}`)
    } catch (e) {
      console.error(`LỖI tại ${item.desc}: ${e.message}`)
      console.error('Dừng ngay, không retry. Chạy lại script sẽ tiếp tục từ item chưa tạo.')
      process.exit(1)
    }
  }
  // Refresh taxonomy sau mỗi cấp để cấp sau resolve được id cha.
  Object.assign(tax, await getTaxonomy())
  levelPlan = computeLevelPlan()
}
console.log(`Xong: đã tạo ${created} item. Chạy lại (dry-run) để xác nhận plan rỗng = idempotent.`)
