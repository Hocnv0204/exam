// Sinh fe/src/css/admin-pro/light-overrides.css từ các rule .admin-dark của theme cũ.
// Theme cũ viết cứng màu cho NỀN TỐI (chữ pastel, nền navy). Mochi Pro dùng lại bộ ánh xạ đó ở cả
// chế độ Sáng, nên ở Sáng các màu này phải trỏ về token Pro tương ứng (theo sắc độ). Chạy lại script
// khi sửa theme-admin*.css (chỉ ánh xạ chữ pastel).: `node scripts/gen-admin-pro-light.mjs`.
import { readFileSync, writeFileSync } from 'node:fs'
const files = ['theme-admin.css', 'theme-admin-pages.css', 'theme-admin-analytics.css', 'theme-admin-modals.css', 'theme-admin-editor.css', 'theme-workspaces.css']
const SCOPE = 'html[data-admin-ui="pro"]:not([data-theme="dark"])'

function parseColor(raw) {
  raw = raw.trim().toLowerCase()
  let m = raw.match(/^#([0-9a-f]{3,8})$/)
  if (m) { let h = m[1]; if (h.length <= 4) h = [...h].map(c => c + c).join(''); return { r: parseInt(h.slice(0, 2), 16), g: parseInt(h.slice(2, 4), 16), b: parseInt(h.slice(4, 6), 16), a: h.length === 8 ? parseInt(h.slice(6, 8), 16) / 255 : 1 } }
  m = raw.match(/^rgba?\(([^)]*)\)$/)
  if (m) { const p = m[1].split(/[,\s/]+/).filter(Boolean).map(Number); return { r: p[0], g: p[1], b: p[2], a: p.length > 3 ? p[3] : 1 } }
  return null
}
function hsl({ r, g, b }) {
  r /= 255; g /= 255; b /= 255
  const max = Math.max(r, g, b), min = Math.min(r, g, b), l = (max + min) / 2, d = max - min
  let h = 0, s = 0
  if (d) { s = d / (1 - Math.abs(2 * l - 1)); h = max === r ? ((g - b) / d) % 6 : max === g ? (b - r) / d + 2 : (r - g) / d + 4; h = (h * 60 + 360) % 360 }
  return { h, s, l }
}
function family(c) {
  const { h, s, l } = hsl(c)
  // Xám theo chroma thực (max-min), không theo saturation HSL: màu rất sáng như #e2e8f0 có s cao
  // nhưng thực chất là xám nhạt — phân loại nhầm sẽ đổi chữ của nó sang màu nhấn.
  const chroma = (Math.max(c.r, c.g, c.b) - Math.min(c.r, c.g, c.b)) / 255
  if (s < 0.18 || chroma < 0.12) return l > 0.6 ? 'light-gray' : 'dark-gray'
  if (h >= 345 || h < 15) return 'red'
  if (h < 50) return 'orange'
  if (h < 70) return 'orange'
  if (h < 170) return 'green'
  if (h < 245) return 'blue'
  if (h < 290) return 'purple'
  return 'red'
}
const STRONG = { red: '--ap-accent2', orange: '--ap-warn', green: '--ap-ok', blue: '--ap-blue', purple: '--ap-accent' }
const SOFT = { red: '--ap-accent2-soft', orange: '--ap-warn-soft', green: '--ap-ok-soft', blue: '--ap-blue-soft', purple: '--ap-accent-soft' }
function mapValue(prop, c, ruleHasSolidBg) {
  const fam = family(c), { l } = hsl(c)
  if (prop === 'color') {
    if (fam === 'light-gray') return ruleHasSolidBg ? 'var(--ap-accent-ink)' : (l > 0.85 ? 'var(--ap-ink)' : 'var(--ap-muted)')
    if (fam === 'dark-gray') return l < 0.3 ? 'var(--ap-ink)' : 'var(--ap-muted)'
    return ruleHasSolidBg ? 'var(--ap-accent-ink)' : `var(${STRONG[fam]})`
  }
  if (prop === 'border-color') {
    if (fam.endsWith('gray')) return 'var(--ap-line)'
    return `var(${STRONG[fam]})`
  }
  // background
  if (fam === 'dark-gray') return 'var(--ap-surface2)'
  if (fam === 'light-gray') return l > 0.97 ? 'var(--ap-surface)' : 'var(--ap-surface2)'
  if (c.a < 0.6) return `var(${SOFT[fam]})`
  return l < 0.35 ? 'var(--ap-surface2)' : `var(${STRONG[fam]})`
}
// Tách danh sách selector theo dấu phẩy cấp ngoài (bỏ qua dấu phẩy trong [..], (..) và chuỗi).
function splitSelectors(sel) {
  const parts = []; let depth = 0, quote = '', cur = ''
  for (const ch of sel) {
    if (quote) { cur += ch; if (ch === quote) quote = ''; continue }
    if (ch === '"' || ch === "'") { quote = ch; cur += ch; continue }
    if (ch === '[' || ch === '(') depth++
    if (ch === ']' || ch === ')') depth--
    if (ch === ',' && depth === 0) { parts.push(cur); cur = ''; continue }
    cur += ch
  }
  if (cur.trim()) parts.push(cur)
  return parts
}
const out = [`/* TỰ SINH bởi scripts/gen-admin-pro-light.mjs — không sửa tay. Chỉ áp cho Mochi Pro chế độ Sáng. */`]
let count = 0
for (const f of files) {
  const css = readFileSync(new URL(`../src/css/${f}`, import.meta.url), 'utf8').replace(/\/\*[\s\S]*?\*\//g, '')
  // Bỏ qua rule nằm trong @media/@supports để không áp nhầm ngữ cảnh; bộ ánh xạ chính ở cấp gốc.
  const top = css.replace(/@(media|supports)[^{]*\{(?:[^{}]*\{[^{}]*\})*[^{}]*\}/g, '')
  for (const m of top.matchAll(/([^{}]+)\{([^{}]*)\}/g)) {
    const sel = m[1].trim(); const body = m[2]
    if (!sel.includes('admin-dark') || sel.startsWith('@')) continue
    const decls = [...body.matchAll(/(?:^|;)\s*(color|background|background-color|border-color)\s*:\s*([^;]+)/g)]
    const solidBg = decls.some(([, p, v]) => p !== 'color' && !v.includes('var(') && (() => { const c = parseColor(v.match(/#[0-9a-fA-F]{3,8}\b|rgba?\([^)]*\)/)?.[0] || ''); return c && c.a >= 0.6 && !family(c).endsWith('gray') && hsl(c).l < 0.6 })())
    const mapped = []
    for (const [, prop, val] of decls) {
      if (val.includes('var(') || /gradient|url\(/.test(val)) continue
      const hex = val.match(/#[0-9a-fA-F]{3,8}\b|rgba?\([^)]*\)/)?.[0]
      const c = hex && parseColor(hex); if (!c) continue
      const p = prop === 'background-color' ? 'background' : prop
      // Chỉ sửa CHỮ màu pastel (sinh ra cho nền tối) → token đậm cùng sắc độ. Nền, viền, chữ trắng/xám
      // đã được tokens/components xử lý; map chúng làm hỏng tab/nút đang chọn (chữ trắng trên nền accent).
      if (p !== 'color' || family(c).endsWith('gray') || hsl(c).l <= 0.55) continue
      mapped.push(`${p === 'background' ? 'background' : p}: ${mapValue(p, c, solidBg)} !important`)
    }
    if (!mapped.length) continue
    const scoped = splitSelectors(sel).map(s => `${SCOPE} ${s.trim()}`).join(',\n')
    out.push(`${scoped} {\n  ${mapped.join(';\n  ')};\n}`); count++
  }
}
writeFileSync(new URL('../src/css/admin-pro/light-overrides.css', import.meta.url), out.join('\n') + '\n')
console.log('rules:', count)
