/**
 * Unit test cho helper FE của ô thống kê + popup "Học sinh có số dư 0 đ".
 *
 * Chạy:  node fe/scripts/test-zero-balance.mjs
 * (không cần trình duyệt / không cần API)
 */

import {
  ZERO_BALANCE_PAGE_SIZE,
  escapeHtml,
  parseZeroBalanceCount,
  computeZeroBalancePagination,
  needsZeroBalancePageReload,
  renderZeroBalanceSkeleton,
  renderZeroBalanceTable,
  renderZeroBalanceEmpty,
  renderZeroBalanceError,
  renderZeroBalancePaginationBar
} from '../src/js/utils/zero-balance.js'

let passed = 0
let failed = 0

function check(name, condition, extra = '') {
  if (condition) {
    passed++
    console.log(`  ✓ ${name}`)
  } else {
    failed++
    console.log(`  ✗ ${name}${extra ? ` -> ${extra}` : ''}`)
  }
}

function eq(name, actual, expected) {
  const ok = JSON.stringify(actual) === JSON.stringify(expected)
  check(name, ok, ok ? '' : `expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`)
}

const items = [
  { id: 'u1', username: 'an', fullName: 'Nguyễn Văn An', className: 'Lớp 1', balance: 0, isLocked: false },
  { id: 'u2', username: 'binh', fullName: "O'Brien <b>Bold</b>", className: 'Lớp "2"', balance: 0, isLocked: true },
]

console.log('\n== FE: escape HTML ==')
eq('escape escape dấu nháy kép', escapeHtml('"'), '&quot;')
eq('escape escape < >', escapeHtml('<b>'), '&lt;b&gt;')
eq('escape escape &', escapeHtml('a&b'), 'a&amp;b')
eq('escape escape nháy đơn', escapeHtml("'"), '&#039;')
eq('escape null -> chuỗi rỗng', escapeHtml(null), '')

console.log('\n== FE: parse count (không hiện số 0 giả) ==')
eq('count hợp lệ', parseZeroBalanceCount({ count: 12 }), 12)
eq('count = 0 hợp lệ', parseZeroBalanceCount({ count: 0 }), 0)
eq('count thiếu -> null', parseZeroBalanceCount({}), null)
eq('count null -> null', parseZeroBalanceCount({ count: null }), null)
eq('count chuỗi rỗng -> null', parseZeroBalanceCount({ count: '' }), null)
eq('count không phải số -> null', parseZeroBalanceCount({ count: 'abc' }), null)
eq('count âm -> null', parseZeroBalanceCount({ count: -1 }), null)
eq('payload rỗng -> null', parseZeroBalanceCount([]), null)
eq('payload null -> null', parseZeroBalanceCount(null), null)

console.log('\n== FE: phân trang ==')
{
  const p = computeZeroBalancePagination({ page: 1, pageSize: 20, total: 45 })
  eq('tổng số trang', p.totalPages, 3)
  eq('from trang 1', p.from, 1)
  eq('to trang 1', p.to, 20)
  eq('trang 1 không có nút trước', p.hasPrev, false)
  eq('trang 1 có nút sau', p.hasNext, true)

  const p2 = computeZeroBalancePagination({ page: 3, pageSize: 20, total: 45 })
  eq('from trang 3', p2.from, 41)
  eq('to trang 3', p2.to, 45)
  eq('trang cuối không có nút sau', p2.hasNext, false)
  eq('trang cuối có nút trước', p2.hasPrev, true)

  const p3 = computeZeroBalancePagination({ page: 99, pageSize: 20, total: 45 })
  eq('page vượt quá -> clamp', p3.currentPage, 3)

  const p4 = computeZeroBalancePagination({ page: 0, pageSize: 20, total: 45 })
  eq('page 0 -> clamp về 1', p4.currentPage, 1)

  const p5 = computeZeroBalancePagination({ page: 1, pageSize: 20, total: 0 })
  eq('rỗng -> 1 trang', p5.totalPages, 1)
  eq('rỗng -> from = 0', p5.from, 0)
  eq('rỗng -> to = 0', p5.to, 0)
  eq('pageSize mặc định', ZERO_BALANCE_PAGE_SIZE, 20)
}

console.log('\n== FE: render bảng ==')
{
  const html = renderZeroBalanceTable(items, { page: 1, pageSize: 20 })
  check('STT bắt đầu từ 1', html.includes('>1</td>'))
  check('tên chứa HTML được escape', html.includes('&lt;b&gt;Bold&lt;/b&gt;'))
  check('tên chứa nháy đơn được escape', html.includes('O&#039;Brien'))
  check('lớp chứa nháy kép được escape', html.includes('Lớp &quot;2&quot;'))
  check('không còn thẻ HTML thô từ dữ liệu', !html.includes('<b>Bold</b>'))
  check('chỉ 4 cột: STT / Họ tên / Lớp học / Nạp nhanh',
    html.includes('STT') && html.includes('Họ tên') && html.includes('Lớp học') && html.includes('Nạp nhanh'))
  check('không còn cột Mã đăng nhập', !html.includes('Mã đăng nhập'))
  check('không còn cột Số dư', !html.includes('>Số dư<'))
  check('không còn cột Trạng thái', !html.includes('>Trạng thái<'))
  check('không hiện mã đăng nhập của học sinh', !html.includes('>an</td>'))
  check('không hiện trạng thái tạm khóa', !html.includes('Tạm khóa'))
  check('không hiện trạng thái hoạt động', !html.includes('Hoạt động'))

  // Nút nạp nhanh: đúng 1 nút / học sinh, đúng id, tên được escape
  const topupButtons = html.match(/data-zb-topup=/g) || []
  eq('mỗi học sinh có đúng 1 nút nạp nhanh', topupButtons.length, items.length)
  check('nút nạp nhanh mang id học sinh', html.includes('data-zb-topup="u1"') && html.includes('data-zb-topup="u2"'))
  check('nút nạp nhanh mang tên đã escape', html.includes('data-zb-name="O&#039;Brien &lt;b&gt;Bold&lt;/b&gt;"'))
  check('nút nạp nhanh không rò rỉ id vào attribute khác', !html.includes('data-zb-topup="u1" data-zb-name="<'))

  const page2 = renderZeroBalanceTable(items, { page: 2, pageSize: 20 })
  check('STT tiếp tục ở trang 2 (21)', page2.includes('>21</td>'))

  const emptyTable = renderZeroBalanceTable([], { page: 1, pageSize: 20 })
  check('bảng rỗng không sinh dòng dữ liệu', !emptyTable.includes('>1</td>'))
}

console.log('\n== FE: trạng thái rỗng / lỗi / skeleton ==')
{
  check('empty state có message', renderZeroBalanceEmpty().includes('Không có học sinh nào có số dư 0 đ'))
  check('error state có nút thử lại', renderZeroBalanceError('Timeout').includes('data-zb-retry'))
  check('error state hiện message (escaped)', renderZeroBalanceError('<b>lỗi</b>').includes('&lt;b&gt;lỗi&lt;/b&gt;'))
  check('skeleton có bảng', renderZeroBalanceSkeleton().includes('<table'))
  check('skeleton có ô đang tải', renderZeroBalanceSkeleton().includes('Đang tải danh sách học sinh'))
  // Skeleton phải khớp số cột với bảng (4 cột) để không nhảy layout khi tải xong
  const skeleton = renderZeroBalanceSkeleton()
  eq('skeleton có đúng 4 cột', (skeleton.match(/<th /g) || []).length, 4)
  eq('skeleton: mỗi dòng có đúng 4 ô', (skeleton.match(/<td/g) || []).length, 20)
}

console.log('\n== FE: kẹp trang khi trang cuối bị trống (sau khi nạp tiền) ==')
{
  check('trang cuối còn dữ liệu -> không cần tải lại',
    needsZeroBalancePageReload({ requestedPage: 3, total: 45, itemCount: 5 }) === false)
  check('trang vượt quá trang cuối và rỗng -> cần tải lại trang hợp lệ',
    needsZeroBalancePageReload({ requestedPage: 3, total: 25, itemCount: 0 }) === true)
  check('trang 1 rỗng nhưng còn học sinh -> hiện trạng thái rỗng, không tải lại',
    needsZeroBalancePageReload({ requestedPage: 1, total: 25, itemCount: 0 }) === false)
  check('không còn học sinh nào -> không tải lại',
    needsZeroBalancePageReload({ requestedPage: 1, total: 0, itemCount: 0 }) === false)
  // Trang cuối bị rút ngắn: học sinh cuối cùng vừa nạp tiền => rời khỏi danh sách
  const p = computeZeroBalancePagination({ page: 3, total: 25 })
  eq('trang hợp lệ sau khi kẹp = trang cuối', p.currentPage, 2)
}

console.log('\n== FE: thanh phân trang trong popup ==')
{
  const bar = renderZeroBalancePaginationBar(computeZeroBalancePagination({ page: 1, pageSize: 20, total: 45 }))
  check('có nút trang trước bị disable', bar.includes('data-zb-page="0"') && bar.includes('disabled'))
  check('có nút trang sau', bar.includes('data-zb-page="2"'))
  check('hiện tổng số', bar.includes('45'))
  check('hiện trang hiện tại', bar.includes('Trang 1 / 3'))

  const lastBar = renderZeroBalancePaginationBar(computeZeroBalancePagination({ page: 3, pageSize: 20, total: 45 }))
  check('nút trang sau bị disable ở trang cuối', lastBar.includes('data-zb-page="4"') && lastBar.includes('disabled'))

  const emptyBar = renderZeroBalancePaginationBar(computeZeroBalancePagination({ page: 1, pageSize: 20, total: 0 }))
  eq('total = 0 -> không hiện thanh phân trang', emptyBar, '')
}

console.log(`\nKết quả FE: ${passed} pass, ${failed} fail\n`)
if (failed > 0) process.exit(1)
