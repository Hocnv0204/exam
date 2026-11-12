// Định dạng chung cho các lộ trình học (Hóa 12, Hóa 11, Toán 12, Toán 11) để trang Mochi
// chỉ cần MỘT renderer. Dữ liệu Toán viết thẳng theo định dạng này; dữ liệu Hóa cũ giữ nguyên
// file gốc (renderer classic vẫn dùng) và được chuyển đổi qua fromHoa12 / fromHoa11.
//
// RoadmapData = {
//   id: 'hoa-12' | 'hoa-11' | 'toan-12' | 'toan-11',
//   subject: 'Hóa học' | 'Toán',
//   grade: 11 | 12,
//   kind: 'sprint'          // ôn thi cấp tốc (12 tuần, có đường cong điểm)
//       | 'school-year',    // theo năm học SGK (35 tuần)
//   meta: {
//     title, subtitle, badge,            // chuỗi hiển thị ở hero
//     textbook, durationWeeks, hoursPerWeek?, targetScore, updated (YYYY-MM-DD),
//     tiers: { nen, nang, top },         // nhãn 3 mức độ dạng bài
//     sources: [{ label, url }],         // nguồn tham khảo (url https)
//     disclaimer,
//     entranceHomeworkId: string | null  // null => CTA dẫn sang bài học thử + đăng ký
//   },
//   scoreCurve: [{ week, score, label }] | null,   // bắt buộc với kind 'sprint'
//   exam: {                                         // cấu trúc đề thi TN THPT (có thể null)
//     durationMin, questions,
//     parts: [{ id: 'I'|'II'|'III', name, questions, detail, points }],
//     target: [{ id, points, note }] | null
//   } | null,
//   stages: [{ id, name, weeks: [from, to], goal?, desc }],   // tháng (sprint) / chặng-học kỳ (school-year)
//   weeks:  [{ n, stage, theme, desc?, milestone?, tags? }],  // n liên tục từ 1..durationWeeks
//   chapters: [{
//     id, code, title, group?, icon (≤ 4 ký tự), summary, priority? (1..3),
//     lessons: [{
//       id, no (số bài SGK | null), tag? (khi no = null), title, week, hours,
//       keyPoints: [string],
//       forms: [{ name, tier: 'nen'|'nang'|'top', parts: ['I'|'II'|'III'], tip? }]
//     }]
//   }]
// }

export const ROADMAP_TIERS = ['nen', 'nang', 'top']
export const ROADMAP_PARTS = ['I', 'II', 'III']

const isStr = v => typeof v === 'string' && v.trim().length > 0
const isNum = v => typeof v === 'number' && Number.isFinite(v)

/** Trả về danh sách lỗi (rỗng = hợp lệ). Dùng trong test và khi phát triển. */
export function validateRoadmap(data) {
  const errors = []
  const err = (path, msg) => errors.push(`${path}: ${msg}`)
  if (!data || typeof data !== 'object') return ['root: không phải object']

  if (!/^(hoa|toan)-(11|12)$/.test(data.id || '')) err('id', 'phải là hoa-11|hoa-12|toan-11|toan-12')
  if (!isStr(data.subject)) err('subject', 'thiếu')
  if (![11, 12].includes(data.grade)) err('grade', 'phải là 11 hoặc 12')
  if (!['sprint', 'school-year'].includes(data.kind)) err('kind', 'phải là sprint|school-year')

  const m = data.meta || {}
  for (const k of ['title', 'subtitle', 'badge', 'textbook', 'targetScore', 'disclaimer']) if (!isStr(m[k])) err(`meta.${k}`, 'thiếu')
  if (!isNum(m.durationWeeks) || m.durationWeeks < 1) err('meta.durationWeeks', 'phải là số > 0')
  if (!/^\d{4}-\d{2}-\d{2}$/.test(m.updated || '')) err('meta.updated', 'định dạng YYYY-MM-DD')
  for (const t of ROADMAP_TIERS) if (!isStr(m.tiers?.[t])) err(`meta.tiers.${t}`, 'thiếu')
  if (!Array.isArray(m.sources) || m.sources.length === 0) err('meta.sources', 'cần ít nhất 1 nguồn')
  else m.sources.forEach((s, i) => { if (!isStr(s?.label) || !/^https:\/\//.test(s?.url || '')) err(`meta.sources[${i}]`, 'cần label và url https') })
  if (!(m.entranceHomeworkId === null || isStr(m.entranceHomeworkId))) err('meta.entranceHomeworkId', 'string hoặc null')

  if (data.kind === 'sprint') {
    if (!Array.isArray(data.scoreCurve) || data.scoreCurve.length < 2) err('scoreCurve', 'sprint cần ít nhất 2 điểm')
  }
  if (data.scoreCurve) {
    data.scoreCurve.forEach((p, i) => {
      if (!isNum(p?.week) || !isNum(p?.score) || p.score < 0 || p.score > 10 || !isStr(p?.label)) err(`scoreCurve[${i}]`, 'cần week, score (0..10), label')
    })
  }

  if (data.exam) {
    const e = data.exam
    if (!isNum(e.durationMin) || !isNum(e.questions)) err('exam', 'cần durationMin, questions')
    if (!Array.isArray(e.parts) || e.parts.length === 0) err('exam.parts', 'thiếu')
    else {
      const total = e.parts.reduce((s, p) => s + (Number(p?.points) || 0), 0)
      if (Math.abs(total - 10) > 0.001) err('exam.parts', `tổng điểm phải = 10 (đang ${total})`)
      const qs = e.parts.reduce((s, p) => s + (Number(p?.questions) || 0), 0)
      if (qs !== e.questions) err('exam.parts', `tổng số câu ${qs} ≠ exam.questions ${e.questions}`)
      e.parts.forEach((p, i) => { if (!ROADMAP_PARTS.includes(p?.id) || !isStr(p?.name) || !isStr(p?.detail)) err(`exam.parts[${i}]`, 'cần id I|II|III, name, detail') })
    }
  }

  const stageIds = new Set()
  if (!Array.isArray(data.stages) || data.stages.length === 0) err('stages', 'thiếu')
  else data.stages.forEach((s, i) => {
    stageIds.add(s?.id)
    if (s?.id == null || !isStr(s?.name) || !isStr(s?.desc)) err(`stages[${i}]`, 'cần id, name, desc')
    if (!Array.isArray(s?.weeks) || s.weeks.length !== 2 || !(s.weeks[0] <= s.weeks[1])) err(`stages[${i}].weeks`, 'cần [from, to]')
  })

  if (!Array.isArray(data.weeks)) err('weeks', 'thiếu')
  else {
    if (data.weeks.length !== m.durationWeeks) err('weeks', `cần đủ ${m.durationWeeks} tuần (đang ${data.weeks.length})`)
    data.weeks.forEach((w, i) => {
      if (w?.n !== i + 1) err(`weeks[${i}].n`, `phải là ${i + 1}`)
      if (!stageIds.has(w?.stage)) err(`weeks[${i}].stage`, 'không khớp stages[].id')
      if (!isStr(w?.theme)) err(`weeks[${i}].theme`, 'thiếu')
    })
  }

  const ids = new Set()
  if (!Array.isArray(data.chapters) || data.chapters.length === 0) err('chapters', 'thiếu')
  else data.chapters.forEach((c, ci) => {
    const cp = `chapters[${ci}]`
    if (!isStr(c?.id) || ids.has(c.id)) err(`${cp}.id`, 'thiếu hoặc trùng')
    ids.add(c?.id)
    for (const k of ['code', 'title', 'summary', 'icon']) if (!isStr(c?.[k])) err(`${cp}.${k}`, 'thiếu')
    if (c?.priority != null && ![1, 2, 3].includes(c.priority)) err(`${cp}.priority`, '1..3 hoặc null')
    if (!Array.isArray(c?.lessons) || c.lessons.length === 0) { err(`${cp}.lessons`, 'thiếu'); return }
    c.lessons.forEach((l, li) => {
      const lp = `${cp}.lessons[${li}]`
      if (!isStr(l?.id) || ids.has(l.id)) err(`${lp}.id`, 'thiếu hoặc trùng')
      ids.add(l?.id)
      if (!isStr(l?.title)) err(`${lp}.title`, 'thiếu')
      if (l?.no == null && !isStr(l?.tag)) err(`${lp}`, 'no = null thì cần tag')
      if (!isNum(l?.week) || l.week < 1 || l.week > m.durationWeeks) err(`${lp}.week`, `1..${m.durationWeeks}`)
      if (!isNum(l?.hours) || l.hours <= 0) err(`${lp}.hours`, 'số > 0')
      if (!Array.isArray(l?.keyPoints) || l.keyPoints.length === 0 || !l.keyPoints.every(isStr)) err(`${lp}.keyPoints`, 'cần ít nhất 1 ý')
      if (!Array.isArray(l?.forms) || l.forms.length === 0) { err(`${lp}.forms`, 'cần ít nhất 1 dạng'); return }
      l.forms.forEach((f, fi) => {
        const fp = `${lp}.forms[${fi}]`
        if (!isStr(f?.name)) err(`${fp}.name`, 'thiếu')
        if (!ROADMAP_TIERS.includes(f?.tier)) err(`${fp}.tier`, 'nen|nang|top')
        if (!Array.isArray(f?.parts) || f.parts.length === 0 || !f.parts.every(p => ROADMAP_PARTS.includes(p))) err(`${fp}.parts`, 'mảng con của I|II|III')
      })
    })
  })
  return errors
}

/** Tổng hợp số liệu dùng cho hero/thống kê. */
export function roadmapStats(data) {
  const lessons = (data?.chapters || []).flatMap(c => c.lessons || [])
  const forms = lessons.flatMap(l => l.forms || [])
  const tiers = { nen: 0, nang: 0, top: 0 }
  forms.forEach(f => { if (f.tier in tiers) tiers[f.tier]++ })
  return {
    chapters: (data?.chapters || []).length,
    lessons: lessons.length,
    forms: forms.length,
    hours: lessons.reduce((s, l) => s + (Number(l.hours) || 0), 0),
    tiers
  }
}

const clone = v => JSON.parse(JSON.stringify(v))

function pickChapter(c, fallbackIcon) {
  return {
    id: c.id,
    code: c.code,
    title: c.title,
    group: c.group || '',
    icon: String(c.symbol || fallbackIcon || c.code || '').slice(0, 4),
    summary: c.summary || '',
    priority: [1, 2, 3].includes(c.priority) ? c.priority : null,
    lessons: (c.lessons || []).map(l => ({
      id: l.id,
      no: l.no ?? null,
      ...(l.no == null ? { tag: l.tag || l.title } : {}),
      title: l.title,
      week: l.week,
      hours: l.hours,
      keyPoints: clone(l.keyPoints || []),
      forms: (l.forms || []).map(f => ({ name: f.name, tier: f.tier, parts: clone(f.parts || []), ...(f.tip ? { tip: f.tip } : {}) }))
    }))
  }
}

/** Chuyển ROADMAP_DATA (components/roadmap.js) sang định dạng chung. */
export function fromHoa12(src, { entranceHomeworkId = null } = {}) {
  const M = src.meta
  return {
    id: 'hoa-12',
    subject: 'Hóa học',
    grade: 12,
    kind: 'sprint',
    meta: {
      title: M.title,
      subtitle: M.subtitle,
      badge: 'Bám sát cấu trúc đề thi tốt nghiệp THPT từ 2025',
      textbook: M.textbook,
      durationWeeks: M.durationWeeks,
      hoursPerWeek: M.hoursPerWeek,
      targetScore: M.targetScore,
      updated: M.updated,
      tiers: clone(M.tiers),
      sources: clone(M.sources || []),
      disclaimer: M.disclaimer,
      entranceHomeworkId
    },
    scoreCurve: clone(M.scoreCurve || []),
    exam: M.exam ? {
      durationMin: M.exam.durationMin,
      questions: M.exam.questions,
      parts: clone(M.exam.parts),
      target: clone(M.exam.target || null)
    } : null,
    stages: src.months.map(mo => ({ id: mo.id, name: mo.name, weeks: clone(mo.weeks), goal: mo.goal, desc: mo.desc })),
    weeks: src.weeks.map(w => ({ n: w.n, stage: w.month, theme: w.theme, ...(w.milestone ? { milestone: w.milestone } : {}) })),
    chapters: src.chapters.map(c => pickChapter(c))
  }
}

function parseWeekRange(str) {
  const m = String(str || '').match(/(\d+)\s*[–-]\s*(\d+)/)
  return m ? [Number(m[1]), Number(m[2])] : null
}

/** Chuyển ROADMAP_11_DATA (components/roadmap-11.js) sang định dạng chung. */
export function fromHoa11(src, { exam = null } = {}) {
  const M = src.meta
  const phases = (M.phases || []).map(p => ({ id: p.id, name: p.name, weeks: parseWeekRange(p.weeksStr), desc: p.desc, sem: p.sem }))
  const stageOf = n => (phases.find(p => p.weeks && n >= p.weeks[0] && n <= p.weeks[1]) || phases[phases.length - 1])?.id
  return {
    id: 'hoa-11',
    subject: 'Hóa học',
    grade: 11,
    kind: 'school-year',
    meta: {
      title: M.title,
      subtitle: M.subtitle,
      badge: 'Chuẩn khung SGK Kết nối tri thức',
      textbook: M.textbook,
      durationWeeks: M.durationWeeks,
      hoursPerWeek: M.hoursRef ? `≈ ${Math.round(M.hoursRef / M.durationWeeks * 10) / 10}` : undefined,
      targetScore: M.targetScore,
      updated: M.updated,
      tiers: clone(M.tiers),
      sources: clone(M.sources || []),
      disclaimer: M.disclaimer,
      entranceHomeworkId: null
    },
    scoreCurve: null,
    exam: exam ? clone(exam) : null,
    stages: phases.map(p => ({ id: p.id, name: p.name, weeks: p.weeks, desc: p.desc })),
    weeks: src.weeks.map(w => ({
      n: w.n,
      stage: stageOf(w.n),
      theme: w.t,
      ...(w.d ? { desc: w.d } : {}),
      ...(Array.isArray(w.tags) && w.tags.length ? { tags: clone(w.tags) } : {})
    })),
    chapters: src.chapters.map(c => pickChapter(c))
  }
}
