import { parseCtct, renderCtct } from '../src/js/utils/diagrams/chem-ctct.js'

let passed = 0
let failed = 0
function check(name, condition, detail = '') {
  if (condition) {
    passed++
    console.log(`  ✓ ${name}`)
  } else {
    failed++
    console.error(`  ✗ ${name}${detail ? `: ${detail}` : ''}`)
  }
}

const cases = [
  ['PVC', `polymer n
CH2 — CH
      |
      Cl`],
  ['PE', `polymer n
CH2 — CH2`],
  ['PP', `polymer n
CH2 — CH
      |
      CH3`],
  ['PS', `polymer n
CH2 — CH
      |
      C6H5`],
  ['Cao su buna', `polymer n
CH2 — CH = CH — CH2`],
  ['Nilon-6', `polymer n
NH — (CH2)5 — CO`],
  ['Etyl axetat', `       O
       ‖
CH3 — C — O — C2H5`],
  ['Glyxin', `H2N — CH2 — COOH`],
  ['Alanin', `CH3 — CH — COOH
      |
      NH2`],
  ['2-metylbutan', `      CH3
      |
CH3 — CH — CH2 — CH3`],
  ['2,2-đimetylpropan', `      CH3
      |
CH3 — C — CH3
      |
      CH3`],
  ['Anđehit axetic', `CH3 — CH = O`],
  ['Axetilen', `HC ≡ CH`],
  ['Isobutilen', `         CH3
         /
CH2 = C
         \\
          CH3`]
]

console.log('=== CTCT ===')
for (const [name, source] of cases) {
  const result = renderCtct(source)
  check(`${name} vẽ thành công`, result.ok && result.diagnostics.length === 0 && result.svg.includes('<svg'), JSON.stringify(result.diagnostics))
}

const pvc = renderCtct(cases[0][1])
check('PVC có ≥ 3 nét liên kết, 2 ngoặc và chỉ số n', (pvc.svg.match(/<line /g) || []).length >= 3 && (pvc.svg.match(/<path /g) || []).length === 2 && />n<\/text>/.test(pvc.svg))
const nylon = renderCtct(cases[5][1])
check('chỉ số dưới dùng dy="4"', /<tspan[^>]*dy="4"/.test(nylon.svg))
const doubleBond = renderCtct('CH2 = CH2')
check('liên kết đôi có 2 đường song song', doubleBond.ok && (doubleBond.svg.match(/<line /g) || []).length === 2)
const tripleBond = renderCtct('HC ≡ CH')
check('liên kết ba có 3 đường song song', tripleBond.ok && (tripleBond.svg.match(/<line /g) || []).length === 3)
check('SVG có thuộc tính giao diện/an toàn yêu cầu', pvc.svg.includes('class="chem-svg"') && pvc.svg.includes('data-ctct=') && pvc.svg.includes('stroke="currentColor"') && pvc.svg.includes('fill="currentColor"') && pvc.svg.includes('style="max-width:100%;height:auto;overflow:visible"'))

const colonPolymer = renderCtct('polymer: m\nCH2 — CH2')
const spacePolymer = renderCtct('polymer m\nCH2 — CH2')
check('polymer: n và polymer n đều hợp lệ', colonPolymer.ok && spacePolymer.ok && />m<\/text>/.test(colonPolymer.svg))

const dangling = renderCtct(`CH3 — CH
      |`, { line: 20 })
check('DANGLING_BOND có dòng theo fence', !dangling.ok && dangling.svg === '' && dangling.diagnostics.some(d => d.code === 'DANGLING_BOND' && d.line === 22 && d.field === null && d.severity === 'error'))
const missing = renderCtct('CH3   CH2 — OH')
check('MISSING_BOND có dòng đúng', !missing.ok && missing.diagnostics.some(d => d.code === 'MISSING_BOND' && d.line === 1))
const unknown = renderCtct('CH3 < CH2')
check('UNKNOWN_CHAR chặn vẽ và không lọt ký tự thô vào SVG', !unknown.ok && unknown.svg === '' && unknown.diagnostics.some(d => d.code === 'UNKNOWN_CHAR' && d.line === 1) && !unknown.svg.includes('<'))
check('parseCtct vẫn trả mô hình nguyên tử/liên kết', parseCtct('CH3 — CH2').atoms.length === 2 && parseCtct('CH3 — CH2').bonds.length === 1)

console.log(`\n${passed} passed, ${failed} failed`)
if (failed) process.exitCode = 1
