// fe/scripts/test-mochi-responsive.mjs
// Static verification of Mochi student responsive layout rules (<=640px & <=900px)

import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const rootDir = path.resolve(__dirname, '..')

function readCss(file) {
  return fs.readFileSync(path.join(rootDir, 'src/css/mochi', file), 'utf8')
}

function extractMediaBlock(css, maxWidth) {
  const queryRegex = new RegExp(`@media[^{]*\\(max-width:\\s*${maxWidth}px\\)[^{]*\\{`, 'm')
  const match = css.match(queryRegex)
  if (!match) return ''
  const startIdx = css.indexOf(match[0])
  const openBrace = css.indexOf('{', startIdx)
  let depth = 1
  let idx = openBrace + 1
  while (depth > 0 && idx < css.length) {
    if (css[idx] === '{') depth++
    else if (css[idx] === '}') depth--
    idx++
  }
  return css.slice(openBrace + 1, idx - 1)
}

function splitTopLevelCommas(str) {
  const parts = []
  let depth = 0
  let cur = ''
  for (let i = 0; i < str.length; i++) {
    const ch = str[i]
    if (ch === '(' || ch === '[') depth++
    else if (ch === ')' || ch === ']') depth--
    else if (ch === ',' && depth === 0) {
      parts.push(cur.trim())
      cur = ''
      continue
    }
    cur += ch
  }
  if (cur.trim()) parts.push(cur.trim())
  return parts
}

function verifyMochiScoping(css, filename) {
  // Strip comments and keyframes
  let clean = css.replace(/\/\*[\s\S]*?\*\//g, '')
  clean = clean.replace(/@keyframes[\s\S]*?\}\s*\}/g, '')

  // Read media queries and regular rules
  const lines = clean.split('\n')
  for (const line of lines) {
    const trimmed = line.trim()
    if (!trimmed || trimmed.startsWith('/*') || trimmed.startsWith('*') || trimmed.startsWith('@') || trimmed.startsWith('}') || !trimmed.includes('{')) {
      continue
    }
    const selectorPart = trimmed.split('{')[0].trim()
    const selectors = splitTopLevelCommas(selectorPart)
    for (const sel of selectors) {
      if (!sel || sel.startsWith('@') || sel.startsWith(':root') || /^[0-9]+%/.test(sel) || sel === 'from' || sel === 'to') continue
      assert.ok(
        sel.startsWith('html[data-ui="mochi"]'),
        `[${filename}] Selector "${sel}" phải bắt đầu bằng html[data-ui="mochi"]`
      )
    }
  }
}

test('1. student-pages.css: không tràn màn hình và vùng bấm link >= 44px', () => {
  const css = readCss('student-pages.css')
  verifyMochiScoping(css, 'student-pages.css')

  // mc-latest-grid không ép min 420px làm vỡ màn hình hẹp
  assert.match(css, /\.mc-latest-grid\s*\{[^}]*grid-template-columns:\s*none/)
  assert.match(css, /\.mc-latest-grid\s*\{[^}]*max-width:\s*100%/)

  // Thẻ card trang chủ có box-sizing: border-box và giới hạn max-width
  assert.match(css, /\.m-student-page\s+\.m-card\s*\{[^}]*box-sizing:\s*border-box/)
  assert.match(css, /\.m-student-page\s+\.m-card\s*\{[^}]*max-width:\s*100%/)

  // Link trong m-section-heading và khối thành tích/bài tập có touch target >= 44px
  assert.match(css, /\.m-section-heading>a[^}]*min-height:\s*44px/)
  assert.match(css, /\.m-home-achieve-sub\s+a[^}]*min-height:\s*44px/)

  // Media query <= 640px cho m-home-grid
  const mobileCss = extractMediaBlock(css, 640)
  assert.ok(mobileCss.length > 0, 'Phải có block @media (max-width: 640px)')
  assert.match(mobileCss, /\.m-home-grid\s*\{[^}]*flex-direction:\s*column/)
})

test('2. homework-history.css: hero ôm sát nội dung (không trống ~250px) trên mobile', () => {
  const css = readCss('homework-history.css')
  verifyMochiScoping(css, 'homework-history.css')

  const mobileCss = extractMediaBlock(css, 640)
  assert.ok(mobileCss.length > 0, 'Phải có block @media (max-width: 640px)')

  // Hero copy trên mobile flex: 0 0 auto và min-height: auto, loại bỏ flex-basis: 360px làm phình hero
  assert.match(mobileCss, /\.m-hw-hero-copy\s*\{[^}]*flex:\s*0\s+0\s+auto/)
  assert.match(mobileCss, /\.m-hw-hero-copy\s*\{[^}]*min-height:\s*auto/)
  assert.match(mobileCss, /\.m-hw-hero\s*\{[^}]*min-height:\s*auto/)

  // Mascot ẩn hoàn toàn trên mobile không để lại chiều cao khung
  assert.match(mobileCss, /\.m-hw-hero-mascot\s*\{[^}]*display:\s*none/)
  assert.match(mobileCss, /\.m-hw-hero-mascot\s*\{[^}]*height:\s*0/)
})

test('3. homework-history.css: phân trang .pagination-page-size và .pagination-btn >= 44px', () => {
  const css = readCss('homework-history.css')

  // Phân trang học tập trong Mochi có min-height >= 44px cho touch target
  assert.match(css, /\.pagination-page-size\.form-input[^}]*min-height:\s*44px/)
  assert.match(css, /\.pagination-btn[^}]*min-height:\s*44px/)
  assert.match(css, /\.pagination-btn[^}]*min-width:\s*44px/)
})

test('4. exam-room.css & homework-solver: thanh trên 2 hàng gọn gàng, tiêu đề tối đa 2 dòng, chip rút gọn 1 dòng', () => {
  const css = readCss('exam-room.css')
  verifyMochiScoping(css, 'exam-room.css')

  // Chip text hỗ trợ rút gọn chữ trên điện thoại
  assert.match(css, /\.m-chip-short\s*\{[^}]*display:\s*none/)
  assert.match(css, /\.m-chip-full\s*\{[^}]*display:\s*inline/)

  const mobileCss = extractMediaBlock(css, 640)
  assert.ok(mobileCss.length > 0, 'Phải có block @media (max-width: 640px)')

  // Trên mobile, chip rút gọn hiện lên và chip dài ẩn đi
  assert.match(mobileCss, /\.m-chip-full\s*\{[^}]*display:\s*none/)
  assert.match(mobileCss, /\.m-chip-short\s*\{[^}]*display:\s*inline/)

  // Tiêu đề bài giải (.m-solver-title) và phòng thi (.exam-toolbar-heading h1) kẹp tối đa 2 dòng
  assert.match(mobileCss, /\.m-solver-title\s*\{[^}]*-webkit-line-clamp:\s*2/)
  assert.match(mobileCss, /\.exam-toolbar-heading\s+h1\s*\{[^}]*-webkit-line-clamp:\s*2/)

  // Chip và autosave giữ nguyên 1 dòng, không gãy chữ dọc
  assert.match(mobileCss, /#autosave-status\s*\{[^}]*white-space:\s*nowrap/)
  assert.match(mobileCss, /\.m-solver-chips\s*\{[^}]*white-space:\s*nowrap/)
  assert.match(mobileCss, /\.exam-toolbar-badges\s*\{[^}]*white-space:\s*nowrap/)

  // Kiểm tra file template JS giữ đúng ID và data-*
  const solverJs = fs.readFileSync(path.join(rootDir, 'src/js/views/homework-solver.js'), 'utf8')
  assert.match(solverJs, /id="autosave-status"/, 'Phải giữ nguyên id autosave-status')
  assert.match(solverJs, /class="[^"]*\bbtn-exit-solver\b[^"]*"/, 'Phải giữ class btn-exit-solver')
  assert.match(solverJs, /class="[^"]*\bbtn-manual-save-draft\b[^"]*"/, 'Phải giữ class btn-manual-save-draft')
  assert.match(solverJs, /id="exam-timer-display"/, 'Phải giữ id exam-timer-display')

  const examJs = fs.readFileSync(path.join(rootDir, 'src/js/views/exam-room.js'), 'utf8')
  assert.match(examJs, /id="exam-autosave-status"/, 'Phải giữ id exam-autosave-status')
  assert.match(examJs, /class="[^"]*\bexam-toolbar-back\b[^"]*"/, 'Phải giữ class exam-toolbar-back')
})

test('5. weekly-calendar.css: nút tuần không gãy chữ (nowrap) và link sự kiện >= 44px', () => {
  const css = readCss('weekly-calendar.css')
  verifyMochiScoping(css, 'weekly-calendar.css')

  // Link trong thẻ sự kiện có touch area >= 44px
  assert.match(css, /\.wc-event\s+a\s*\{[^}]*min-height:\s*44px/)

  const mobileCss = extractMediaBlock(css, 640)
  assert.ok(mobileCss.length > 0, 'Phải có block @media (max-width: 640px)')

  // Nút Tuần trước / Tuần sau không gãy chữ trên mobile
  assert.match(mobileCss, /#wc-prev[^}]*white-space:\s*nowrap/)
  assert.match(mobileCss, /#wc-next[^}]*white-space:\s*nowrap/)
})

test('6. achievements.css: chip "Đã học hôm nay" nowrap và chân thẻ XP xếp dọc gọn', () => {
  const css = readCss('achievements.css')
  verifyMochiScoping(css, 'achievements.css')

  // Link xem tất cả huy hiệu >= 44px
  assert.match(css, /\.m-home-achieve-sub\s+a\s*\{[^}]*min-height:\s*44px/)

  const mobileCss = extractMediaBlock(css, 640)
  assert.ok(mobileCss.length > 0, 'Phải có block @media (max-width: 640px)')

  // Chip "Đã học hôm nay" không bị gãy 2 dòng
  assert.match(mobileCss, /\.m-stat-card-header\s+\.m-chip\s*\{[^}]*white-space:\s*nowrap/)

  // Footer "Tổng tích luỹ" / "Còn ... XP lên cấp" xếp dọc gọn gàng
  assert.match(mobileCss, /\.m-stat-card-footer\s*\{[^}]*flex-direction:\s*column/)
})

test('7. attendance.css: hero không có min-height thừa trên mobile', () => {
  const css = readCss('attendance.css')
  verifyMochiScoping(css, 'attendance.css')

  const mobileCss = extractMediaBlock(css, 640)
  assert.ok(mobileCss.length > 0, 'Phải có block @media (max-width: 640px)')
  assert.match(mobileCss, /\.m-att-hero\s*\{[^}]*min-height:\s*auto/)
})
