#!/usr/bin/env node
/**
 * Test hồi quy: bảng Markdown `.md-table` trong popup tối
 * "Tạo đề kiểm tra / bài tập theo Ma trận" (#qb-modal-container) và các modal tối khác.
 *
 * KHÔNG so chuỗi source. Test parse toàn bộ CSS theo đúng thứ tự nạp của
 * index.html (kể cả @import nội bộ), mô phỏng khớp selector + cascade thật
 * (specificity, importance, source order, inline style, var(), :has/:is/:not/
 * :nth-child/:hover, @media) trên fixture DOM đúng cấu trúc popup, rồi kiểm tra
 * GIÁ TRỊ màu đã tính và độ tương phản WCAG của từng lớp (table/th/td/sọc chẵn/hover).
 *
 * Fixture phủ 4 kịch bản:
 *   1. Dark  — admin-dark + #qb-modal-container  (popup ma trận)
 *   2. Dark  — admin-dark + #modal-container     (modal chung của modal.js)
 *   3. Light — không có class tối + #modal-container (modal công khai/sinh viên)
 *   4. Light island — admin-dark nhưng data-route="create-homework" (bị cổng loại trừ)
 *
 * Chạy:  cd fe && node scripts/test-matrix-modal-table.mjs
 */

import { readFileSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import postcss from 'postcss'

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')

/* ========================================================================== *
 * 1. Nạp CSS theo đúng thứ tự index.html
 * ========================================================================== */

function cssFilesInLoadOrder() {
  const html = readFileSync(path.join(ROOT, 'index.html'), 'utf8')
  const files = []
  const re = /<link\b[^>]*rel="stylesheet"[^>]*>/g
  let m
  while ((m = re.exec(html))) {
    const tag = m[0]
    const href = /href="([^"]+)"/.exec(tag)?.[1]
    if (!href) continue
    if (/^https?:/i.test(href)) continue // CDN (FontAwesome/KaTeX) — không ảnh hưởng md-table
    files.push(href.replace(/^\//, ''))
  }
  if (!files.includes('src/css/styles.css')) {
    throw new Error('index.html không còn link styles.css — test cần cập nhật')
  }
  return files
}

/* ========================================================================== *
 * 2. Selector parser (subset CSS đang dùng trong repo)
 * ========================================================================== */

/** Tách chuỗi theo `sep` ở độ sâu 0 (ngoặc (), [], và quote đều được tôn trọng). */
function splitTop(str, sep) {
  const out = []
  let depth = 0
  let quote = null
  let buf = ''
  for (let i = 0; i < str.length; i++) {
    const ch = str[i]
    if (quote) {
      buf += ch
      if (ch === quote && str[i - 1] !== '\\') quote = null
      continue
    }
    if (ch === '"' || ch === "'") { quote = ch; buf += ch; continue }
    if (ch === '(' || ch === '[') depth++
    else if (ch === ')' || ch === ']') depth--
    if (ch === sep && depth === 0) { out.push(buf); buf = '' } else buf += ch
  }
  out.push(buf)
  return out
}

/** Tách chuỗi theo chuỗi `sep` (vd 'and') ở độ sâu 0, có ranh giới chữ. */
function splitTopStr(str, sep) {
  const out = []
  let depth = 0
  let quote = null
  let buf = ''
  let i = 0
  while (i < str.length) {
    const ch = str[i]
    if (quote) {
      buf += ch
      if (ch === quote && str[i - 1] !== '\\') quote = null
      i++
      continue
    }
    if (ch === '"' || ch === "'") { quote = ch; buf += ch; i++; continue }
    if (ch === '(' || ch === '[') depth++
    else if (ch === ')' || ch === ']') depth--
    if (depth === 0 && str.startsWith(sep, i)) {
      const before = str[i - 1] ?? ''
      const after = str[i + sep.length] ?? ''
      if (!/[\w-]/.test(before) && !/[\w-]/.test(after)) {
        out.push(buf)
        buf = ''
        i += sep.length
        continue
      }
    }
    buf += ch
    i++
  }
  out.push(buf)
  return out
}

function parseSimple(src, start) {
  let i = start
  const n = src.length
  const ch = src[i]

  if (ch === '*') return { simple: { type: 'universal' }, next: i + 1 }

  if (ch === '#' || ch === '.') {
    let j = i + 1
    while (j < n && !/[\s>+~,()#\[.:]/.test(src[j])) j++
    const name = src.slice(i + 1, j)
    if (!name) throw new Error(`selector thiếu tên sau '${ch}' tại ${src.slice(start, start + 20)}`)
    return { simple: { type: ch === '#' ? 'id' : 'class', name }, next: j }
  }

  if (ch === '[') {
    let j = i + 1
    let quote = null
    while (j < n) {
      const c = src[j]
      if (quote) { if (c === quote && src[j - 1] !== '\\') quote = null }
      else if (c === '"' || c === "'") quote = c
      else if (c === ']') break
      j++
    }
    if (j >= n) throw new Error(`thiếu ']' trong attribute selector: ${src.slice(start)}`)
    const content = src.slice(i + 1, j).trim()
    const m = /^([\w-]+)(?:(~=|\|=|\^=|\$=|\*=|=)\s*(?:"([^"]*)"|'([^']*)'|([^\s\]]+)))?$/.exec(content)
    if (!m) throw new Error(`attribute selector không hỗ trợ: [${content}]`)
    const value = m[3] ?? m[4] ?? m[5] ?? null
    return {
      simple: { type: 'attr', name: m[1], op: m[2] || null, value: value === null ? null : value },
      next: j + 1,
    }
  }

  if (ch === ':') {
    let j = i + 1
    const isElement = src[j] === ':'
    if (isElement) j++
    let k = j
    while (k < n && /[\w-]/.test(src[k])) k++
    const name = src.slice(j, k).toLowerCase()
    if (!name) throw new Error(`selector thiếu tên pseudo tại: ${src.slice(start, start + 20)}`)
    let args = null
    let next = k
    if (src[k] === '(') {
      let depth = 0
      let q = null
      let p = k
      for (; p < n; p++) {
        const c = src[p]
        if (q) { if (c === q && src[p - 1] !== '\\') q = null; continue }
        if (c === '"' || c === "'") { q = c; continue }
        if (c === '(') depth++
        else if (c === ')') { depth--; if (depth === 0) break }
      }
      if (depth !== 0) throw new Error(`thiếu ')' trong :${name}(...)`)
      args = src.slice(k + 1, p)
      k = p
      next = k + 1 // qua dấu ')'
    }
    return { simple: { type: isElement ? 'pseudo-element' : 'pseudo', name, args }, next }
  }

  if (/[a-zA-Z_]/.test(ch)) {
    let j = i
    while (j < n && /[\w-]/.test(src[j])) j++
    return { simple: { type: 'tag', name: src.slice(i, j).toLowerCase() }, next: j }
  }

  throw new Error(`ký tự selector không hỗ trợ '${ch}' trong: ${src.slice(start, start + 30)}`)
}

/** Parse một selector phức (compound nối bằng combinator). */
function parseComplex(src) {
  const nodes = []
  let i = 0
  const n = src.length
  let pendingComb = null
  while (i < n) {
    let sawWs = false
    while (i < n && /\s/.test(src[i])) { sawWs = true; i++ }
    if (i < n && (src[i] === '>' || src[i] === '+' || src[i] === '~')) {
      pendingComb = src[i]
      i++
      while (i < n && /\s/.test(src[i])) i++
    } else if (sawWs) {
      pendingComb = ' '
    }
    if (i >= n) break
    const compound = []
    while (i < n && !/[\s>+~]/.test(src[i])) {
      const r = parseSimple(src, i)
      compound.push(r.simple)
      i = r.next
    }
    if (!compound.length) throw new Error(`compound rỗng trong: ${src}`)
    nodes.push({ comb: nodes.length === 0 ? pendingComb : (pendingComb || ' '), compound })
    pendingComb = null
  }
  if (!nodes.length) throw new Error(`selector rỗng: '${src}'`)
  return nodes
}

function parseSelectorList(str) {
  let cached = selectorListCache.get(str)
  if (cached) return cached
  const parts = splitTop(str, ',').map(s => s.trim()).filter(Boolean)
  const parsed = parts.map(parseComplex)
  selectorListCache.set(str, parsed)
  return parsed
}
const selectorListCache = new Map()

/* ---- Specificity (a,b,c) theo spec CSS ---- */

function specOfNodes(nodes) {
  const acc = [0, 0, 0]
  for (const node of nodes) for (const s of node.compound) {
    const t = specOfSimple(s)
    acc[0] += t[0]; acc[1] += t[1]; acc[2] += t[2]
  }
  return acc
}

function specOfSimple(s) {
  switch (s.type) {
    case 'id': return [1, 0, 0]
    case 'class':
    case 'attr': return [0, 1, 0]
    case 'tag': return [0, 0, 1]
    case 'universal': return [0, 0, 0]
    case 'pseudo-element': return [0, 0, 1]
    case 'pseudo': {
      if (s.name === 'where') return [0, 0, 0]
      if (s.name === 'is' || s.name === 'not' || s.name === 'has') {
        const max = [0, 0, 0]
        for (const arg of parseSelectorList(s.args || '')) {
          const t = specOfNodes(arg)
          if (t[0] > max[0] || (t[0] === max[0] && t[1] > max[1]) || (t[0] === max[0] && t[1] === max[1] && t[2] > max[2])) {
            max[0] = t[0]; max[1] = t[1]; max[2] = t[2]
          }
        }
        return max
      }
      return [0, 1, 0] // pseudo-class thường (hover, nth-child, ...)
    }
    default: return [0, 0, 0]
  }
}

function cmpSpec(a, b) {
  for (let i = 0; i < 3; i++) if (a[i] !== b[i]) return a[i] - b[i]
  return 0
}

/* ========================================================================== *
 * 3. Khớp selector trên fixture DOM
 * ========================================================================== */

function ancestors(el) {
  const out = []
  let cur = el.parent
  while (cur) { out.push(cur); cur = cur.parent }
  return out
}
function isDescendant(el, maybeAncestor) {
  return ancestors(el).includes(maybeAncestor)
}
function prevSibling(el) {
  if (!el.parent) return null
  const sibs = el.parent.children
  const idx = sibs.indexOf(el)
  return idx > 0 ? sibs[idx - 1] : null
}
function prevSiblings(el) {
  if (!el.parent) return []
  const sibs = el.parent.children
  return sibs.slice(0, sibs.indexOf(el))
}

function nthIndex(el) { return el.nth }

function nthMatch(arg, index) {
  const a = arg.trim().toLowerCase().replace(/\s+/g, '').split('of')[0]
  if (a === 'even') return index % 2 === 0
  if (a === 'odd') return index % 2 === 1
  const m = /^([+-]?\d*)n([+-]\d+)?$/.exec(a)
  if (m) {
    const step = m[1] === '' || m[1] === '+' ? 1 : m[1] === '-' ? -1 : parseInt(m[1], 10)
    const off = m[2] ? parseInt(m[2], 10) : 0
    if (step === 0) return index === off
    const k = (index - off) / step
    return Number.isInteger(k) && k >= 0
  }
  const num = parseInt(a, 10)
  return Number.isFinite(num) && index === num
}

const STATE_PSEUDO_FALSE = new Set([
  'focus', 'focus-visible', 'focus-within', 'active', 'visited', 'link', 'any-link',
  'target', 'checked', 'unchecked', 'disabled', 'enabled', 'required', 'optional',
  'read-only', 'read-write', 'valid', 'invalid', 'in-range', 'out-of-range',
  'indeterminate', 'default', 'placeholder-shown', 'fullscreen', 'picture-in-picture',
  'playing', 'paused', 'autofill', 'open', 'past', 'future', 'current', 'user-invalid',
  'user-valid', 'dir', 'lang', 'scope', 'host', 'host-context', 'defined',
])

function matchSimple(s, el) {
  switch (s.type) {
    case 'universal': return true
    case 'tag': return el.tag === s.name
    case 'id': return el.id === s.name
    case 'class': return el.classes.has(s.name)
    case 'attr': {
      let actual
      if (s.name === 'style') actual = el.attrs.style
      else if (s.name === 'class') actual = [...el.classes].join(' ')
      else if (s.name === 'id') actual = el.id
      else actual = el.attrs[s.name]
      if (actual == null) return false
      if (!s.op) return true
      const v = String(actual)
      const expect = s.value ?? ''
      switch (s.op) {
        case '=': return v === expect
        case '~=': return v.split(/\s+/).includes(expect)
        case '|=': return v === expect || v.startsWith(expect + '-')
        case '^=': return expect !== '' && v.startsWith(expect)
        case '$=': return expect !== '' && v.endsWith(expect)
        case '*=': return expect !== '' && v.includes(expect)
        default: return false
      }
    }
    case 'pseudo-element': return false
    case 'pseudo': {
      switch (s.name) {
        case 'hover': return !!el.hover
        case 'root': return el.tag === 'html'
        case 'empty': return el.children.length === 0 && !el.text
        case 'first-child': return el.nth === 1
        case 'last-child': return !!el.parent && el.nth === el.parent.children.length
        case 'only-child': return !!el.parent && el.parent.children.length === 1
        case 'nth-child': return nthMatch(s.args || '', nthIndex(el))
        case 'nth-of-type': {
          if (!el.parent) return false
          const same = el.parent.children.filter(c => c.tag === el.tag)
          return nthMatch(s.args || '', same.indexOf(el) + 1)
        }
        case 'first-of-type':
        case 'last-of-type': {
          if (!el.parent) return false
          const same = el.parent.children.filter(c => c.tag === el.tag)
          return s.name === 'first-of-type' ? same[0] === el : same[same.length - 1] === el
        }
        case 'is':
        case 'where':
          return parseSelectorList(s.args || '').some(c => matchComplex(c, el))
        case 'not':
          return !parseSelectorList(s.args || '').some(c => matchComplex(c, el))
        case 'has': {
          const rels = parseSelectorList(s.args || '')
          return rels.some(rel => {
            const lead = rel[0]?.comb ?? null
            let candidates
            if (lead === '>') candidates = el.children
            else if (lead === '+' || lead === '~') {
              const sibs = el.parent ? el.parent.children : []
              candidates = sibs.slice(sibs.indexOf(el) + 1)
            } else candidates = allDescendants(el)
            return candidates.some(c => matchComplex(rel, c, el))
          })
        }
        case 'defined': return !el.tag.includes('-')
        default:
          if (STATE_PSEUDO_FALSE.has(s.name)) return false
          return false // pseudo lạ → coi như không khớp (có cảnh báo ở parser)
      }
    }
    default: return false
  }
}

function allDescendants(el) {
  const out = []
  const walk = node => { for (const c of node.children) { out.push(c); walk(c) } }
  walk(el)
  return out
}

function matchCompound(compound, el) {
  return compound.every(s => matchSimple(s, el))
}

/** scope = element mà :has(...) đang evaluate (selector tương đối). */
function matchComplex(nodes, el, scope = null) {
  const walk = (idx, subject) => {
    if (!subject) return false
    if (!matchCompound(nodes[idx].compound, subject)) return false
    if (idx === 0) {
      const lead = nodes[0].comb
      if (lead == null || scope == null) return true
      if (lead === ' ') return isDescendant(subject, scope)
      if (lead === '>') return subject.parent === scope
      if (lead === '+') return prevSibling(subject) === scope
      if (lead === '~') return prevSiblings(subject).includes(scope)
      return true
    }
    const comb = nodes[idx].comb
    if (comb === '>') return subject.parent ? walk(idx - 1, subject.parent) : false
    if (comb === '+') return walk(idx - 1, prevSibling(subject))
    if (comb === '~') return prevSiblings(subject).some(s => walk(idx - 1, s))
    return ancestors(subject).some(a => walk(idx - 1, a)) // descendant
  }
  return walk(nodes.length - 1, el)
}

/* ========================================================================== *
 * 4. Đọc rules từ CSS (postcss) + media evaluation
 * ========================================================================== */

const VIEWPORT = { width: 1280, pointer: 'fine', hover: 'hover', colorScheme: 'light', reducedMotion: false }

const rules = []
const warnings = []
let orderCounter = 0

function evalMediaCondition(params) {
  const alternatives = splitTop(params, ',').map(s => s.trim()).filter(Boolean)
  const results = alternatives.map(cond => evalSingleCondition(cond))
  if (results.every(r => r === false)) return results.includes(null) ? null : false
  if (results.includes(true)) return true
  return null // có điều kiện không xác định và chưa chắc true/false
}

function evalSingleCondition(cond) {
  let c = cond.trim()
  let negate = false
  if (/^not\s+/i.test(c)) { negate = true; c = c.replace(/^not\s+/i, '') }
  if (/^(all|screen)$/i.test(c)) return !negate
  if (/^(print|speech)$/i.test(c)) return negate
  const tokens = splitTopStr(c, 'and').map(s => s.trim()).filter(Boolean)
  let unknown = false
  let allTrue = true
  for (const tok of tokens) {
    const inner = /^\(([^)]*)\)$/.exec(tok)
    if (!inner) { unknown = true; continue }
    const r = evalFeature(inner[1])
    if (r === null) unknown = true
    else if (r === false) allTrue = false
  }
  if (unknown) return null
  const v = allTrue
  return negate ? !v : v
}

function evalFeature(feature) {
  const idx = feature.indexOf(':')
  if (idx === -1) return null
  const key = feature.slice(0, idx).trim().toLowerCase()
  const value = feature.slice(idx + 1).trim().toLowerCase()
  const px = v => parseFloat(v)
  switch (key) {
    case 'min-width': return VIEWPORT.width >= px(value)
    case 'max-width': return VIEWPORT.width <= px(value)
    case 'width': return VIEWPORT.width === px(value)
    case 'min-height': return 800 >= px(value)
    case 'max-height': return 800 <= px(value)
    case 'pointer': return value === VIEWPORT.pointer || value === 'any'
    case 'hover': return value === VIEWPORT.hover
    case 'prefers-color-scheme': return value === VIEWPORT.colorScheme
    case 'prefers-reduced-motion': return (value === 'reduce') === VIEWPORT.reducedMotion
    case 'orientation': return value === 'landscape'
    case 'display-mode': return value === 'browser'
    default: return null
  }
}

function normalizeDecl(prop, value) {
  const p = prop.toLowerCase()
  const v = String(value).trim()
  if (p === 'background') {
    if (/(^|[\s,('"])url\(|gradient\(|image-set\(/.test(v)) return [['background-image', v]]
    const token = extractColorToken(v)
    if (token) return [['background-color', token]]
    if (/\b(?:none|initial|inherit|unset)\b/.test(v)) {
      const kw = /\b(?:none|initial|inherit|unset)\b/.exec(v)[0]
      return [['background-color', kw === 'inherit' ? 'inherit' : 'rgba(0, 0, 0, 0)']]
    }
    return [['background-color', v]]
  }
  if (p === 'background-color') return [['background-color', v]]
  if (prop.startsWith('--')) return [[prop, v]]
  return [[p, v]]
}

function extractColorToken(value) {
  const tokens = splitTop(value, ' ').map(s => s.trim()).filter(Boolean)
  for (const t of tokens) {
    if (t.startsWith('var(')) return t
    if (parseColor(t)) return t
  }
  return null
}

function expandSelectors(sel, parentSels) {
  const parts = splitTop(sel, ',').map(s => s.trim()).filter(Boolean)
  if (!parentSels.length) return parts
  const out = []
  for (const p of parts) {
    for (const par of parentSels) {
      out.push(p.includes('&') ? p.replaceAll('&', par) : `${par} ${p}`)
    }
  }
  return out
}

function targetish(selector) {
  return /md-table|modal-content|table-responsive/.test(selector) ||
    /(^|[\s>+~.#])t[dh]([\s.:#[]|$)/.test(selector) || /\btable\b/.test(selector)
}

function emitRule(selectorText, ruleNode, media, file) {
  let complexes
  let specs
  try {
    complexes = parseSelectorList(selectorText)
    specs = complexes.map(specOfNodes)
  } catch (err) {
    const msg = `Không parse được selector (${file}): ${selectorText} — ${err.message}`
    if (targetish(selectorText)) throw new Error(msg)
    warnings.push(msg)
    return
  }
  const decls = []
  for (const d of ruleNode.nodes || []) {
    if (d.type !== 'decl') continue
    for (const [prop, value] of normalizeDecl(d.prop, d.value)) {
      decls.push({ prop, value, important: !!d.important })
    }
  }
  if (!decls.length) return
  rules.push({
    selector: selectorText,
    complexes,
    specs,
    decls,
    media, // true | false | null (không có @media)
    order: orderCounter++,
    file,
  })
}

/** Block bị bỏ qua (@media không xác định, @container, ...) không được chứa
 *  rule nào có thể tác động tới nền/chữ của bảng trong modal. */
function assertNoTargetInSkipped(nodes, reason) {
  for (const node of nodes) {
    if (node.type === 'rule') {
      const relevant = (node.nodes || []).some(d =>
        d.type === 'decl' && ['background', 'background-color', 'color'].includes(d.prop.toLowerCase()))
      if (relevant && targetish(node.selector)) {
        throw new Error(`Block bị bỏ qua (${reason}) chứa rule màu liên quan: ${node.selector}`)
      }
      assertNoTargetInSkipped(node.nodes || [], reason)
    } else if (node.type === 'atrule') {
      assertNoTargetInSkipped(node.nodes || [], reason)
    }
  }
}

const importedFiles = new Set()

function walkCss(nodes, ctx) {
  for (const node of nodes) {
    if (node.type === 'comment') continue
    if (node.type === 'decl') continue
    if (node.type === 'rule') {
      const sels = expandSelectors(node.selector, ctx.parentSels)
      for (const sel of sels) emitRule(sel, node, ctx.media, ctx.file)
      walkCss(node.nodes || [], { ...ctx, parentSels: sels })
      continue
    }
    if (node.type === 'atrule') {
      const name = node.name.toLowerCase()
      if (name === 'import') {
        if (ctx.parentSels.length || ctx.media !== null) continue
        const url = (/url\(\s*['"]?([^'")]+)['"]?\s*\)|^['"]([^'"]+)['"]/.exec(node.params) || [])[1] ||
          (/^['"]([^'"]+)['"]/.exec(node.params) || [])[1]
        if (!url || /^https?:/i.test(url)) continue
        loadCssFile(path.resolve(path.dirname(ctx.path), url), ctx.file)
        continue
      }
      if (name === 'media') {
        const res = evalMediaCondition(node.params)
        if (res === null) {
          warnings.push(`@media không xác định (bỏ qua): ${node.params}`)
          assertNoTargetInSkipped(node.nodes || [], `@media ${node.params}`)
        }
        const effective = ctx.media === false ? false : (res === null ? false : res)
        walkCss(node.nodes || [], { ...ctx, media: effective })
        continue
      }
      if (['container', 'supports', 'layer', 'scope'].includes(name)) {
        warnings.push(`Bỏ qua @${name} (${ctx.file}): ${node.params}`)
        assertNoTargetInSkipped(node.nodes || [], `@${name} ${node.params}`)
        continue
      }
      continue // keyframes / font-face / page / property / ...
    }
  }
}

function loadCssFile(absPath, importedBy) {
  const rel = path.relative(ROOT, absPath)
  if (importedFiles.has(rel)) return
  importedFiles.add(rel)
  let root
  try {
    root = postcss.parse(readFileSync(absPath, 'utf8'), { from: absPath })
  } catch (err) {
    throw new Error(`postcss parse lỗi ${rel}: ${err.message}`)
  }
  walkCss(root.nodes, { parentSels: [], media: null, file: rel, path: absPath })
}

function loadAllCss() {
  for (const rel of cssFilesInLoadOrder()) loadCssFile(path.join(ROOT, rel), null)
}

/* ========================================================================== *
 * 5. Cascade: winner cho từng property + var() + màu
 * ========================================================================== */

function parseInlineStyle(style) {
  if (!style) return []
  const out = []
  for (const part of splitTop(style, ';')) {
    const i = part.indexOf(':')
    if (i === -1) continue
    const prop = part.slice(0, i).trim()
    const value = part.slice(i + 1).trim()
    if (!prop || !value) continue
    for (const [p, v] of normalizeDecl(prop, value)) out.push({ prop: p, value: v, important: false })
  }
  return out
}

/** Trả về declaration thắng cho el/prop (hoặc null). */
function winner(el, prop) {
  let best = null
  const consider = cand => {
    if (!best) { best = cand; return }
    if (cand.important !== best.important) { if (cand.important) best = cand; return }
    if (cand.inline !== best.inline) { if (cand.inline) best = cand; return }
    const c = cmpSpec(cand.spec, best.spec)
    if (c !== 0) { if (c > 0) best = cand; return }
    if (cand.order > best.order) best = cand
  }
  for (const r of rules) {
    if (r.media === false) continue
    let spec = null
    for (let i = 0; i < r.complexes.length; i++) {
      if (matchComplex(r.complexes[i], el)) { spec = r.specs[i]; break }
    }
    if (!spec) continue
    for (const d of r.decls) {
      if (d.prop !== prop) continue
      consider({ value: d.value, important: d.important, inline: false, spec, order: r.order, file: r.file, selector: r.selector })
    }
  }
  for (const d of parseInlineStyle(el.attrs.style)) {
    if (d.prop === prop) {
      consider({ value: d.value, important: d.important, inline: true, spec: [1, 0, 0], order: -1, file: '(inline style)', selector: '(inline)' })
    }
  }
  return best
}

function computedCustom(el, name) {
  let cur = el
  while (cur) {
    const w = winner(cur, name)
    if (w) return w.value
    cur = cur.parent
  }
  return null
}

function replaceVarsOnce(str, el) {
  let out = ''
  let i = 0
  while (i < str.length) {
    const idx = str.indexOf('var(', i)
    if (idx === -1) { out += str.slice(i); break }
    out += str.slice(i, idx)
    let depth = 0
    let j = idx + 3
    for (; j < str.length; j++) {
      if (str[j] === '(') depth++
      else if (str[j] === ')') { depth--; if (depth === 0) break }
    }
    const inner = str.slice(idx + 4, j)
    const parts = splitTop(inner, ',')
    const name = parts[0].trim()
    const fallback = parts.length > 1 ? parts.slice(1).join(',') : null
    let resolved = name.startsWith('--') ? computedCustom(el, name) : null
    if (resolved == null || resolved === '') {
      out += fallback != null ? fallback : ''
    } else {
      out += resolved
    }
    i = j + 1
  }
  return out
}

function resolveVars(value, el) {
  let v = String(value)
  for (let k = 0; k < 8 && v.includes('var('); k++) v = replaceVarsOnce(v, el)
  return v.trim()
}

function computedColorValue(el) {
  const w = winner(el, 'color')
  if (w) return resolveVars(w.value, el)
  if (el.parent) return computedColorValue(el.parent)
  return '#000000'
}

function computedBgValue(el) {
  const w = winner(el, 'background-color')
  if (!w) return 'rgba(0, 0, 0, 0)'
  const v = resolveVars(w.value, el)
  if (v === 'inherit') return el.parent ? computedBgValue(el.parent) : 'rgba(0, 0, 0, 0)'
  return v
}

/* ========================================================================== *
 * 6. Màu & tương phản WCAG
 * ========================================================================== */

const NAMED = {
  transparent: [0, 0, 0, 0], white: [255, 255, 255, 1], black: [0, 0, 0, 1],
  red: [255, 0, 0, 1], blue: [0, 0, 255, 1], green: [0, 128, 0, 1],
  gray: [128, 128, 128, 1], grey: [128, 128, 128, 1], silver: [192, 192, 192, 1],
  teal: [0, 128, 128, 1], olive: [128, 128, 0, 1], navy: [0, 0, 128, 1],
  lime: [0, 255, 0, 1], aqua: [0, 255, 255, 1], cyan: [0, 255, 255, 1],
  fuchsia: [255, 0, 255, 1], magenta: [255, 0, 255, 1], maroon: [128, 0, 0, 1],
  purple: [128, 0, 128, 1], orange: [255, 165, 0, 1], yellow: [255, 255, 0, 1],
  brown: [165, 42, 42, 1], pink: [255, 192, 203, 1], gold: [255, 215, 0, 1],
}

function parseColor(input) {
  if (input == null) return null
  const s = String(input).trim().toLowerCase()
  if (!s) return null
  if (NAMED[s]) { const [r, g, b, a] = NAMED[s]; return { r, g, b, a } }
  if (s[0] === '#') {
    const hex = s.slice(1)
    if (/^[0-9a-f]{3,4}$/.test(hex)) {
      const [r, g, b, a] = [...hex].map(c => parseInt(c + c, 16))
      return { r, g, b, a: hex.length === 4 ? a / 255 : 1 }
    }
    if (/^[0-9a-f]{6}([0-9a-f]{2})?$/.test(hex)) {
      const r = parseInt(hex.slice(0, 2), 16)
      const g = parseInt(hex.slice(2, 4), 16)
      const b = parseInt(hex.slice(4, 6), 16)
      const a = hex.length === 8 ? parseInt(hex.slice(6, 8), 16) / 255 : 1
      return { r, g, b, a }
    }
    return null
  }
  let m = /^rgba?\(([^)]*)\)$/.exec(s)
  if (m) {
    const parts = m[1].split(/[\s,/]+/).filter(Boolean)
    if (parts.length < 3) return null
    const num = p => p.endsWith('%') ? (parseFloat(p) / 100) * 255 : parseFloat(p)
    const alpha = parts[3] != null ? (parts[3].endsWith('%') ? parseFloat(parts[3]) / 100 : parseFloat(parts[3])) : 1
    return { r: num(parts[0]), g: num(parts[1]), b: num(parts[2]), a: alpha }
  }
  m = /^hsla?\(([^)]*)\)$/.exec(s)
  if (m) {
    const parts = m[1].split(/[\s,/]+/).filter(Boolean)
    if (parts.length < 3) return null
    const h = parseFloat(parts[0]) / 360
    const sat = parseFloat(parts[1]) / 100
    const lig = parseFloat(parts[2]) / 100
    const alpha = parts[3] != null ? (parts[3].endsWith('%') ? parseFloat(parts[3]) / 100 : parseFloat(parts[3])) : 1
    const hue2rgb = (p, q, t) => {
      if (t < 0) t += 1
      if (t > 1) t -= 1
      if (t < 1 / 6) return p + (q - p) * 6 * t
      if (t < 1 / 2) return q
      if (t < 2 / 3) return p + (q - p) * (2 / 3 - t) * 6
      return p
    }
    if (sat === 0) { const v = lig * 255; return { r: v, g: v, b: v, a: alpha } }
    const q = lig < 0.5 ? lig * (1 + sat) : lig + sat - lig * sat
    const p = 2 * lig - q
    return {
      r: hue2rgb(p, q, h + 1 / 3) * 255,
      g: hue2rgb(p, q, h) * 255,
      b: hue2rgb(p, q, h - 1 / 3) * 255,
      a: alpha,
    }
  }
  return null
}

function blendOver(top, bottom) {
  const a = top.a + bottom.a * (1 - top.a)
  if (a <= 0) return { r: 0, g: 0, b: 0, a: 0 }
  return {
    r: (top.r * top.a + bottom.r * bottom.a * (1 - top.a)) / a,
    g: (top.g * top.a + bottom.g * bottom.a * (1 - top.a)) / a,
    b: (top.b * top.a + bottom.b * bottom.a * (1 - top.a)) / a,
    a,
  }
}

/** Nền hiệu dụng (composite các lớp nền từ element lên root, nền mặc định trắng). */
function effectiveBg(el) {
  const layers = []
  let cur = el
  while (cur) { layers.push(computedBgValue(cur)); cur = cur.parent }
  let acc = { r: 255, g: 255, b: 255, a: 1 }
  for (let i = layers.length - 1; i >= 0; i--) {
    const c = parseColor(layers[i])
    if (!c) continue
    acc = blendOver(c, acc)
  }
  return acc
}

function luminance({ r, g, b }) {
  const f = c => { c /= 255; return c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4) }
  return 0.2126 * f(r) + 0.7152 * f(g) + 0.0722 * f(b)
}

function contrastRatio(c1, c2) {
  const l1 = luminance(c1)
  const l2 = luminance(c2)
  const [hi, lo] = l1 > l2 ? [l1, l2] : [l2, l1]
  return (hi + 0.05) / (lo + 0.05)
}

function hexOf(c) {
  const h = v => Math.round(v).toString(16).padStart(2, '0')
  return `#${h(c.r)}${h(c.g)}${h(c.b)}`
}

/* ========================================================================== *
 * 7. Fixture DOM (đúng cấu trúc popup render thật)
 * ========================================================================== */

function el(tag, opts = {}, children = []) {
  const classes = (opts.class || '').split(/\s+/).filter(Boolean)
  const node = {
    tag: tag.toLowerCase(),
    id: opts.id || null,
    classes: new Set(classes),
    attrs: opts.attrs || {},
    children,
    parent: null,
    nth: 0,
    hover: !!opts.hover,
    text: opts.text || '',
  }
  children.forEach((c, i) => { c.parent = node; c.nth = i + 1 })
  return node
}

/**
 * Fixture: .app-layout[.admin-dark] > view > (#modal-container | #qb-modal-container)
 * > .modal-backdrop > .modal-content > header + body > table.md-table
 * (th/td có inline style text-align như exam-parser emit).
 */
function buildFixture({ dark, route, containerId }) {
  const cell = txt => el('td', { attrs: { style: 'text-align:left;' }, text: txt })
  const head = txt => el('th', { attrs: { style: 'text-align:left;' }, text: txt })

  const thead = el('thead', {}, [el('tr', {}, [head('Câu hỏi'), head('Đáp án')])])
  const rowOdd = el('tr', {}, [cell('Câu 1'), cell('A')])
  const rowEven = el('tr', {}, [cell('Câu 2'), cell('B')])
  const rowHoverOdd = el('tr', { hover: true }, [cell('Câu 3'), cell('C')])
  const rowHoverEven = el('tr', { hover: true }, [cell('Câu 4'), cell('D')])
  const tbody = el('tbody', {}, [rowOdd, rowEven, rowHoverOdd, rowHoverEven])
  const table = el('table', { class: 'md-table' }, [thead, tbody])
  const wrap = el('div', { class: 'table-responsive' }, [table])

  const modalContent = el('div', {
    class: 'modal-content',
    attrs: { style: 'width:100%; max-width:1040px; max-height:92vh; background:#ffffff; border-radius:16px; display:flex; flex-direction:column; overflow:hidden;' },
  }, [
    el('div', {
      class: 'matrix-gen-header',
      attrs: { style: 'padding:18px 24px; border-bottom:1px solid #e2e8f0; background:#f8fafc;' },
    }),
    el('div', { class: 'matrix-gen-body', attrs: { style: 'padding:20px 24px; overflow-y:auto; flex:1;' } }, [wrap]),
  ])
  const backdrop = el('div', {
    class: 'modal-backdrop',
    attrs: { style: 'position:fixed; inset:0; background:rgba(15,23,42,0.6); z-index:9999;' },
  }, [modalContent])
  const container = el('div', { id: containerId }, [backdrop])

  const layoutClasses = dark ? 'app-layout admin-dark' : 'app-layout'
  const layoutAttrs = route ? { 'data-route': route } : {}
  const layout = el('div', { class: layoutClasses, attrs: layoutAttrs },
    containerId === 'qb-modal-container' ? [container] : [])

  // #modal-container nằm ở document.body (ngoài .app-layout) — theo modal.js.
  const bodyChildren = containerId === 'qb-modal-container' ? [layout] : [layout, container]
  const body = el('body', {}, bodyChildren)
  const root = el('html', {}, [body])

  const tdOf = row => row.children[0]
  return {
    root,
    modalContent,
    table,
    th: thead.children[0].children[0],
    tdOdd: tdOf(rowOdd),
    tdEven: tdOf(rowEven),
    tdHoverOdd: tdOf(rowHoverOdd),
    tdHoverEven: tdOf(rowHoverEven),
  }
}

/* ========================================================================== *
 * 8. Assertions
 * ========================================================================== */

let passes = 0
const failures = []

function check(label, actual, expected) {
  if (actual === expected) { passes++; return }
  failures.push(`${label}\n      dự kiến: ${expected}\n      thực tế: ${actual}`)
}

function checkOk(label, cond, detail = '') {
  if (cond) { passes++; return }
  failures.push(`${label}${detail ? `\n      ${detail}` : ''}`)
}

function bgOf(node) { return computedBgValue(node) }
function bgHex(node) {
  const v = parseColor(computedBgValue(node))
  if (!v) return `unparsed(${computedBgValue(node)})`
  if (v.a === 0) return 'transparent'
  return hexOf(v)
}
function colorHex(node) {
  const v = parseColor(computedColorValue(node))
  return v ? hexOf(v) : `unparsed(${computedColorValue(node)})`
}

function checkContrast(label, textNode, bgNode) {
  const text = parseColor(computedColorValue(textNode))
  const bg = effectiveBg(bgNode)
  if (!text) { checkOk(label, false, `không parse được màu chữ: ${computedColorValue(textNode)}`); return }
  const effText = text.a < 1 ? blendOver(text, bg) : text
  const ratio = contrastRatio(effText, bg)
  checkOk(label, ratio >= 4.5, `tỷ lệ contrast ${ratio.toFixed(2)}:1 (< 4.5:1), chữ ${hexOf(effText)} trên nền ${hexOf(bg)}`)
}

function checkWinnerFile(label, node, prop, expectedFile, expectImportant = false) {
  const w = winner(node, prop)
  if (!w) { checkOk(label, false, `không có declaration nào thắng cho ${prop}`); return }
  checkOk(label, w.file === expectedFile && w.important === expectImportant,
    `nguồn thắng: ${w.file}${w.important ? ' !important' : ''} (kỳ vọng ${expectedFile}${expectImportant ? ' !important' : ''}), selector: ${w.selector}`)
}

/* ========================================================================== *
 * 9. Chạy test
 * ========================================================================== */

loadAllCss()

// --- Kịch bản 1: popup ma trận tối (#qb-modal-container, admin-dark) ---
const darkQb = buildFixture({ dark: true, route: 'question-bank', containerId: 'qb-modal-container' })

check('dark/qb: nền .modal-content = surface (inline battery)',
  bgHex(darkQb.modalContent), '#1f2937')

check('dark/qb: nền table.md-table = surface (chữ sáng không đè lên nền trắng)',
  bgHex(darkQb.table), '#1f2937')
checkWinnerFile('dark/qb: rule nền table đến từ theme-admin-modals.css, không !important',
  darkQb.table, 'background-color', 'src/css/theme-admin-modals.css')

check('dark/qb: nền th = surface-strong', bgHex(darkQb.th), '#182335')
check('dark/qb: chữ th = text-muted', colorHex(darkQb.th), '#cbd5e1')

check('dark/qb: nền td (dòng lẻ) = surface', bgHex(darkQb.tdOdd), '#1f2937')
check('dark/qb: chữ td = #e2e8f0', colorHex(darkQb.tdOdd), '#e2e8f0')
checkWinnerFile('dark/qb: rule nền td đến từ theme-admin-modals.css, không !important',
  darkQb.tdOdd, 'background-color', 'src/css/theme-admin-modals.css')

check('dark/qb: nền td (dòng chẵn) = surface-strong (đè #f8fafc của styles.css)',
  bgHex(darkQb.tdEven), '#182335')
checkWinnerFile('dark/qb: rule nền td chẵn đến từ theme-admin-modals.css, không !important',
  darkQb.tdEven, 'background-color', 'src/css/theme-admin-modals.css')

check('dark/qb: nền td hover (dòng lẻ) = surface-soft', bgHex(darkQb.tdHoverOdd), '#243244')
check('dark/qb: nền td hover (dòng chẵn) = surface-soft (hover thắng sọc chẵn)',
  bgHex(darkQb.tdHoverEven), '#243244')
checkWinnerFile('dark/qb: rule nền td hover đến từ theme-admin-modals.css, không !important',
  darkQb.tdHoverOdd, 'background-color', 'src/css/theme-admin-modals.css')

checkContrast('dark/qb: contrast chữ th ≥ 4.5:1', darkQb.th, darkQb.th)
checkContrast('dark/qb: contrast chữ td (dòng lẻ) ≥ 4.5:1', darkQb.tdOdd, darkQb.tdOdd)
checkContrast('dark/qb: contrast chữ td (dòng chẵn) ≥ 4.5:1', darkQb.tdEven, darkQb.tdEven)
checkContrast('dark/qb: contrast chữ td (hover) ≥ 4.5:1', darkQb.tdHoverOdd, darkQb.tdHoverOdd)

// --- Kịch bản 2: modal chung tối (#modal-container, admin-dark) ---
const darkCommon = buildFixture({ dark: true, route: 'finance', containerId: 'modal-container' })
check('dark/common: nền table.md-table = surface', bgHex(darkCommon.table), '#1f2937')
check('dark/common: nền td (dòng lẻ) = surface', bgHex(darkCommon.tdOdd), '#1f2937')
check('dark/common: nền td (dòng chẵn) = surface-strong', bgHex(darkCommon.tdEven), '#182335')
check('dark/common: nền td hover = surface-soft', bgHex(darkCommon.tdHoverOdd), '#243244')

// --- Kịch bản 3: light — modal công khai/sinh viên, không class tối ---
const light = buildFixture({ dark: false, route: null, containerId: 'modal-container' })
check('light: nền .modal-content giữ #ffffff (inline, không bị map tối)', bgHex(light.modalContent), '#ffffff')
check('light: nền table.md-table giữ #ffffff', bgHex(light.table), '#ffffff')
checkWinnerFile('light: rule nền table là .md-table của styles.css', light.table, 'background-color', 'src/css/styles.css')
check('light: nền th giữ #f8fafc', bgHex(light.th), '#f8fafc')
check('light: chữ th giữ #1e293b', colorHex(light.th), '#1e293b')
check('light: nền td (dòng lẻ) trong suốt (không có rule nền)', bgHex(light.tdOdd), 'transparent')
check('light: chữ td giữ #334155', colorHex(light.tdOdd), '#334155')
check('light: nền td (dòng chẵn) giữ #f8fafc', bgHex(light.tdEven), '#f8fafc')
check('light: nền td hover giữ #f1f5f9', bgHex(light.tdHoverOdd), '#f1f5f9')
check('light: nền td hover (dòng chẵn) giữ #f1f5f9', bgHex(light.tdHoverEven), '#f1f5f9')

// --- Kịch bản 4: admin-dark nhưng data-route="create-homework" (light island) ---
const island = buildFixture({ dark: true, route: 'create-homework', containerId: 'modal-container' })
check('create-homework: cổng loại trừ → nền table giữ #ffffff', bgHex(island.table), '#ffffff')
check('create-homework: nền td (dòng lẻ) trong suốt', bgHex(island.tdOdd), 'transparent')
check('create-homework: nền td (dòng chẵn) giữ #f8fafc', bgHex(island.tdEven), '#f8fafc')
check('create-homework: nền td hover giữ #f1f5f9', bgHex(island.tdHoverOdd), '#f1f5f9')
check('create-homework: chữ td giữ #334155', colorHex(island.tdOdd), '#334155')

/* ---- Báo cáo ---- */
if (warnings.length) {
  console.log(`\nCảnh báo (${warnings.length}):`)
  for (const w of [...new Set(warnings)]) console.log(`  - ${w}`)
}

console.log(`\nRules đã nạp: ${rules.length} | File CSS: ${importedFiles.size}`)
console.log(`Checks: ${passes + failures.length} | PASS: ${passes} | FAIL: ${failures.length}`)

if (failures.length) {
  console.log('\nKẾT QUẢ: FAIL')
  for (const f of failures) console.log(`  ✗ ${f}`)
  process.exit(1)
}
console.log('\nKẾT QUẢ: PASS')
