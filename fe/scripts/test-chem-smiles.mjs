// Khối ```smiles: vẽ SVG đồng bộ (không DOM), ngoặc polime, vòng thơm, nhãn dị tố, báo lỗi khi lưu đề.
import test from 'node:test'
import assert from 'node:assert/strict'
import { renderSmiles, parseSmilesBlock } from '../src/js/utils/diagrams/chem-smiles.js'
import { compileDiagramToSVG, validateDiagramsInText } from '../src/js/utils/diagram-renderer.js'
import { renderMarkdown } from '../src/js/utils/exam-parser.js'

const count = (svg, re) => (svg.match(re) || []).length
const texts = svg => [...svg.matchAll(/<text[^>]*>(.*?)<\/text>/g)].map(m => m[1].replace(/<[^>]+>/g, ''))

test('tách SMILES và tuỳ chọn', () => {
  const r = parseSmilesBlock('\n*CC(c1ccccc1)*\nstyle: condensed\npolymer: m\n')
  assert.equal(r.smiles, '*CC(c1ccccc1)*')
  assert.equal(r.smilesLine, 2)
  assert.deepEqual(r.options, { style: 'condensed', polymer: 'm' })
})

test('PS thu gọn: CH, CH2, vòng benzen có vòng tròn, 2 ngoặc + n', () => {
  const r = renderSmiles('*CC(c1ccccc1)*\nstyle: condensed')
  assert.ok(r.ok, JSON.stringify(r.diagnostics))
  const t = texts(r.svg)
  assert.ok(t.includes('CH') && t.includes('CH2'), t.join(','))
  assert.equal(count(r.svg, /<circle/g), 1)
  assert.equal(count(r.svg, /<path/g), 2)
  assert.ok(t.includes('n'))
  assert.ok(r.svg.includes('data-smiles="*CC(c1ccccc1)*"'))
})

test('ngoặc polime mở về hai phía (PMMA)', () => {
  const r = renderSmiles('*CC(C)(C(=O)OC)*\nstyle: condensed')
  assert.ok(r.ok)
  const ds = [...r.svg.matchAll(/<path fill="none" d="M ([\d.-]+) [\d.-]+ Q ([\d.-]+)/g)].map(m => Number(m[2]) - Number(m[1]))
  assert.equal(ds.length, 2)
  assert.ok(ds.some(d => d < 0) && ds.some(d => d > 0), 'một ngoặc trái, một ngoặc phải')
})

test('công thức khung: điol có HO và OH, không nhãn C', () => {
  const r = renderSmiles('OCC1CCC(CO)CC1')
  assert.ok(r.ok)
  const t = texts(r.svg)
  assert.deepEqual(t.slice().sort(), ['HO', 'OH'])
  assert.equal(count(r.svg, /<circle/g), 0)
})

test('Kodel: 2 vòng (1 thơm), 2 ngoặc, chỉ số n', () => {
  const r = renderSmiles('*C(=O)c1ccc(cc1)C(=O)OCC1CCC(CC1)CO*')
  assert.ok(r.ok)
  assert.equal(count(r.svg, /<circle/g), 1)
  assert.equal(count(r.svg, /<path/g), 2)
})

test('Kekulé vẽ nét đôi, không vòng tròn', () => {
  const r = renderSmiles('C1=CC=CC=C1')
  assert.ok(r.ok)
  assert.equal(count(r.svg, /<circle/g), 0)
  assert.equal(count(r.svg, /<line/g), 9)
})

test('liên kết ba và phân tử nhỏ hiện đủ nhãn C', () => {
  const r = renderSmiles('C#C')
  assert.equal(count(r.svg, /<line/g), 3)
  assert.deepEqual(texts(r.svg), ['CH', 'CH'])
})

test('nguyên tử ngoặc vuông giữ số H và điện tích', () => {
  const r = renderSmiles('C[NH3+]')
  assert.ok(texts(r.svg).some(x => x.includes('N') && x.includes('H3') && x.includes('+')))
})

test('chỉ số dưới quay về đúng dòng gốc', () => {
  const r = renderSmiles('*CC*\nstyle: condensed')
  const spans = [...r.svg.matchAll(/dy="(-?\d+)"/g)].map(m => Number(m[1]))
  assert.equal(spans.reduce((a, b) => a + b, 0) % 4, 0)
  assert.ok(r.svg.includes('dy="4"'))
})

test('lỗi: SMILES sai, số dấu *, tuỳ chọn sai — có mã và dòng', () => {
  const bad = renderSmiles('CC(', { line: 10 })
  assert.equal(bad.ok, false)
  assert.equal(bad.svg, '')
  assert.equal(bad.diagnostics[0].code, 'SMILES_PARSE')
  assert.equal(bad.diagnostics[0].line, 11)
  assert.equal(renderSmiles('*CC').diagnostics[0].code, 'POLYMER_STARS')
  assert.equal(renderSmiles('CC\npolymer: n').diagnostics[0].code, 'POLYMER_STARS')
  const st = renderSmiles('CC\nstyle: abc', { line: 3 })
  assert.equal(st.diagnostics[0].code, 'BAD_OPTION')
  assert.equal(st.diagnostics[0].line, 5)
  assert.equal(renderSmiles('').diagnostics[0].code, 'EMPTY')
  const warn = renderSmiles('CC\nmau: do')
  assert.ok(warn.ok)
  assert.equal(warn.diagnostics[0].code, 'UNKNOWN_OPTION')
})

test('escape: SMILES lạ không lọt ký tự thô vào SVG', () => {
  const r = renderSmiles('CC"<x>')
  assert.ok(!r.svg.includes('<x>'))
})

test('renderer: khối và inline đều ra SVG đồng bộ, theo currentColor', () => {
  const block = compileDiagramToSVG('smiles', 'CC(=O)O')
  assert.ok(block.includes('data-smiles="CC(=O)O"') && block.includes('diagram-wrap') && block.includes('<line'))
  assert.ok(block.includes('stroke="currentColor"'))
  assert.ok(!/setTimeout|getElementById/.test(block))
  const html = renderMarkdown('Axit [SMILES: CC(=O)O] là axit yếu.\n\n```smiles\n*CC(Cl)*\nstyle: condensed\n```')
  assert.ok(html.includes('chem-inline'))
  assert.equal(count(html, /<svg/g), 2)
  const err = compileDiagramToSVG('smiles', 'C1CC')
  assert.ok(err.includes('SMILES_PARSE'))
})

test('kiểm tra khi lưu đề: lỗi smiles/ctct chặn lưu kèm số dòng', () => {
  const ok = validateDiagramsInText('Câu 1\n```smiles\nOc1ccccc1\n```\n```ctct\nCH3 — CH2 — OH\n```')
  assert.equal(ok.hasError, false, JSON.stringify(ok.errors))
  const bad = validateDiagramsInText('Câu 1\n```smiles\nCC(\n```\n[SMILES: *CC]\n```ctct\nCH3   CH2 — OH\n```')
  const codes = bad.errors.map(e => `${e.code}@${e.line}`)
  assert.ok(codes.includes('SMILES_PARSE@3'), codes.join(','))
  assert.ok(codes.some(c => c.startsWith('POLYMER_STARS')), codes.join(','))
  assert.ok(codes.includes('MISSING_BOND@7'), codes.join(','))
})
