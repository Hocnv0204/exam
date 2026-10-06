import { renderSidebar, bindSidebarEvents } from '../components/sidebar.js'
import { renderNavbar } from '../components/navbar.js'
import { showToast } from '../components/toast.js'
import { state } from '../state.js'
import { api } from '../api.js'

const TX_LABELS = {
  topup: 'Nạp ví',
  auto_deduct: 'Trừ ví (điểm danh)',
  refund: 'Hoàn tiền',
  manual_collect: 'Thu tay',
  waive: 'Miễn'
}

let allTx = []
let filterClassId = ''
let filterType = ''
let filterSearch = ''

function escapeHtml(s) {
  return String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')
}

function fmt(n) {
  return Number(n || 0).toLocaleString('vi-VN')
}

function splitDateTime(iso) {
  const d = new Date(iso)
  if (isNaN(d.getTime())) return { date: iso || '', time: '' }
  return { date: d.toLocaleDateString('vi-VN'), time: d.toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit', second: '2-digit' }) }
}

export function renderTuitionLedgerView() {
  const hashUrl = window.location.hash.replace('#', '')
  const [, queryString] = hashUrl.split('?')
  const params = new URLSearchParams(queryString || '')
  const presetClass = params.get('classId') || ''
  if (presetClass && !filterClassId) filterClassId = presetClass

  return `
    <div class="app-layout">
      ${renderSidebar('tuition-ledger')}
      <div class="main-content">
        ${renderNavbar('Quản trị / Sổ giao dịch học phí')}
        <div class="content-body" style="padding:24px; display:flex; flex-direction:column; gap:20px;">
          <div style="display:grid; grid-template-columns:repeat(auto-fit, minmax(200px, 1fr)); gap:16px;" id="ledger-summary"></div>

          <div class="card" style="margin:0; padding:16px 20px; border-radius:14px;">
            <div style="display:flex; gap:10px; flex-wrap:wrap; align-items:center;">
              <select id="ledger-filter-class" style="height:38px; border:1px solid #cbd5e1; border-radius:8px; padding:0 10px; font-size:13px; min-width:200px;">
                <option value="">Tất cả lớp học</option>
                ${(state.classes || []).map(c => `<option value="${c.id}" ${c.id === filterClassId ? 'selected' : ''}>${escapeHtml(c.name)}</option>`).join('')}
              </select>
              <select id="ledger-filter-type" style="height:38px; border:1px solid #cbd5e1; border-radius:8px; padding:0 10px; font-size:13px;">
                <option value="">Tất cả loại</option>
                <option value="topup" ${filterType === 'topup' ? 'selected' : ''}>Nạp ví</option>
                <option value="auto_deduct" ${filterType === 'auto_deduct' ? 'selected' : ''}>Trừ ví (điểm danh)</option>
                <option value="manual_collect" ${filterType === 'manual_collect' ? 'selected' : ''}>Thu tay</option>
                <option value="refund" ${filterType === 'refund' ? 'selected' : ''}>Hoàn tiền</option>
                <option value="waive" ${filterType === 'waive' ? 'selected' : ''}>Miễn</option>
              </select>
              <div style="position:relative; flex:1; min-width:200px;">
                <i class="fa-solid fa-magnifying-glass" style="position:absolute; left:12px; top:12px; color:#94a3b8; font-size:13px;"></i>
                <input id="ledger-search" type="text" value="${escapeHtml(filterSearch)}" placeholder="Tìm theo tên học sinh, biên lai..." style="width:100%; height:38px; border:1px solid #cbd5e1; border-radius:8px; padding:0 12px 0 36px; font-size:13px;">
              </div>
              <button id="ledger-export-btn" class="btn-secondary" style="height:38px; padding:0 16px; font-size:13px; font-weight:600; border-radius:8px; cursor:pointer; display:inline-flex; align-items:center; gap:6px;">
                <i class="fa-solid fa-file-excel"></i> Xuất Excel
              </button>
            </div>
          </div>

          <div class="card" style="margin:0; padding:20px 24px; border-radius:14px;">
            <h2 style="font-size:16px; font-weight:700; margin:0 0 2px 0;"><i class="fa-solid fa-wallet" style="color:#16a34a;"></i> Lịch sử nạp tiền <span id="ledger-topup-count" style="color:#64748b; font-weight:600;"></span></h2>
            <div style="font-size:12px; color:#64748b; margin-bottom:12px;">Nạp vào ngày nào, giờ nào, số tiền bao nhiêu.</div>
            <div class="table-responsive" style="max-height:340px; overflow-y:auto;">
              <table class="data-table">
                <thead><tr><th>Ngày nạp</th><th>Giờ</th><th>Học sinh</th><th>Lớp</th><th style="text-align:right;">Số tiền nạp</th><th>Biên lai</th><th>Ghi chú</th><th></th></tr></thead>
                <tbody id="ledger-topup-tbody"><tr><td colspan="8" style="text-align:center; padding:24px; color:#94a3b8;">Đang tải...</td></tr></tbody>
              </table>
            </div>
          </div>

          <div class="card" style="margin:0; padding:20px 24px; border-radius:14px;">
            <h2 style="font-size:16px; font-weight:700; margin:0 0 2px 0;"><i class="fa-solid fa-money-bill-transfer" style="color:#b91c1c;"></i> Lịch sử trừ tiền <span id="ledger-deduct-count" style="color:#64748b; font-weight:600;"></span></h2>
            <div style="font-size:12px; color:#64748b; margin-bottom:12px;">Trừ ngày nào, giờ nào, ứng với lớp nào, số tiền trừ bao nhiêu.</div>
            <div class="table-responsive" style="max-height:420px; overflow-y:auto;">
              <table class="data-table">
                <thead><tr><th>Ngày</th><th>Giờ</th><th>Lớp</th><th>Học sinh</th><th>Loại</th><th style="text-align:right;">Số tiền</th><th>Biên lai</th><th>Ghi chú</th><th></th></tr></thead>
                <tbody id="ledger-deduct-tbody"><tr><td colspan="9" style="text-align:center; padding:24px; color:#94a3b8;">Đang tải...</td></tr></tbody>
              </table>
            </div>
          </div>
        </div>
      </div>
    </div>
  `
}

function txRow(t, showType) {
  const { date, time } = splitDateTime(t.createdAt)
  return `
    <tr data-tx-student="${escapeHtml(((t.studentName || '') + ' ' + (t.receiptNo || '')).toLowerCase())}" data-tx-type="${escapeHtml(t.type || '')}">
      <td style="white-space:nowrap; font-weight:600;">${date}</td>
      <td style="white-space:nowrap;">${time}</td>
      ${showType ? '' : `<td>${escapeHtml(t.className || '')}</td>`}
      <td style="font-weight:600;">${escapeHtml(t.studentName || t.username || '')}</td>
      ${showType ? `<td>${escapeHtml(t.className || '')}</td>` : ''}
      ${showType ? `<td><span class="badge" style="font-size:11px;">${TX_LABELS[t.type] || t.type}</span></td>` : ''}
      <td style="text-align:right; font-weight:800; color:${Number(t.amount) < 0 ? '#b91c1c' : '#15803d'};">${fmt(Math.abs(Number(t.amount)))} đ</td>
      <td style="font-family:monospace; font-size:12px;">${escapeHtml(t.receiptNo || '')}</td>
      <td style="font-size:12px; color:#64748b;">${escapeHtml(t.note || '')}</td>
      <td style="text-align:center;"><button class="btn-ledger-print btn-secondary" data-tx='${escapeHtml(JSON.stringify(t))}' style="padding:4px 10px; font-size:11px; border-radius:6px; cursor:pointer;">In BL</button></td>
    </tr>
  `
}

function applyFilters() {
  const q = filterSearch.toLowerCase().trim()
  const rows = { topup: 0, deduct: 0 }
  document.querySelectorAll('#ledger-topup-tbody tr[data-tx-student], #ledger-deduct-tbody tr[data-tx-student]').forEach(tr => {
    const inTopup = tr.closest('tbody').id === 'ledger-topup-tbody'
    const matchQ = !q || (tr.getAttribute('data-tx-student') || '').includes(q)
    const matchT = !filterType || tr.getAttribute('data-tx-type') === filterType
    const show = matchQ && matchT
    tr.style.display = show ? '' : 'none'
    if (show) rows[inTopup ? 'topup' : 'deduct'] += 1
  })
  const tc = document.getElementById('ledger-topup-count')
  const dc = document.getElementById('ledger-deduct-count')
  if (tc) tc.textContent = `(${rows.topup})`
  if (dc) dc.textContent = `(${rows.deduct})`
}

function renderTables() {
  // Topup table respect class filter only (type filter applies to deduct table when set globally? apply to both)
  const topups = allTx.filter(t => t.type === 'topup')
  const deducts = allTx.filter(t => t.type !== 'topup')
  const topBody = document.getElementById('ledger-topup-tbody')
  const dedBody = document.getElementById('ledger-deduct-tbody')
  if (topBody) topBody.innerHTML = topups.length === 0 ? '<tr><td colspan="8" style="text-align:center; padding:24px; color:#64748b;">Chưa có lượt nạp nào.</td></tr>' : topups.map(t => txRow(t, true)).join('')
  if (dedBody) dedBody.innerHTML = deducts.length === 0 ? '<tr><td colspan="9" style="text-align:center; padding:24px; color:#64748b;">Chưa có giao dịch trừ/thu nào.</td></tr>' : deducts.map(t => txRow(t, false)).join('')

  const sum = (arr) => arr.reduce((s, t) => s + Math.abs(Number(t.amount || 0)), 0)
  const summary = document.getElementById('ledger-summary')
  if (summary) {
    summary.innerHTML = `
      <div class="card" style="margin:0; padding:16px 18px; border-radius:14px; border:1px solid #bbf7d0; background:#f0fdf4;">
        <div style="font-size:12px; font-weight:700; color:#15803d;">TỔNG NẠP VÍ</div>
        <div style="font-size:22px; font-weight:800;">${fmt(sum(topups))} đ</div>
        <div style="font-size:12px; color:#64748b;">${topups.length} lượt</div>
      </div>
      <div class="card" style="margin:0; padding:16px 18px; border-radius:14px; border:1px solid #fecaca; background:#fef2f2;">
        <div style="font-size:12px; font-weight:700; color:#b91c1c;">TỔNG TRỪ VÍ</div>
        <div style="font-size:22px; font-weight:800;">${fmt(sum(deducts.filter(t => t.type === 'auto_deduct')))} đ</div>
        <div style="font-size:12px; color:#64748b;">Điểm danh tự trừ</div>
      </div>
      <div class="card" style="margin:0; padding:16px 18px; border-radius:14px; border:1px solid #bfdbfe; background:#eff6ff;">
        <div style="font-size:12px; font-weight:700; color:#0066cc;">TỔNG THU TAY</div>
        <div style="font-size:22px; font-weight:800;">${fmt(sum(deducts.filter(t => t.type === 'manual_collect')))} đ</div>
        <div style="font-size:12px; color:#64748b;">Thu nợ / đánh dấu đã đóng</div>
      </div>
      <div class="card" style="margin:0; padding:16px 18px; border-radius:14px; border:1px solid #fde68a; background:#fffbeb;">
        <div style="font-size:12px; font-weight:700; color:#b45309;">TỔNG MIỄN</div>
        <div style="font-size:22px; font-weight:800;">${fmt(sum(deducts.filter(t => t.type === 'waive')))} đ</div>
        <div style="font-size:12px; color:#64748b;">Các buổi được miễn</div>
      </div>
    `
  }
  document.querySelectorAll('.btn-ledger-print').forEach(btn => {
    btn.onclick = () => {
      try {
        const t = JSON.parse(btn.getAttribute('data-tx'))
        printLedgerReceipt(t)
      } catch (e) {
        showToast('Không mở được biên lai', 'error')
      }
    }
  })
  applyFilters()
}

function printLedgerReceipt(t) {
  const w = window.open('', '_blank', 'width=640,height=760')
  if (!w) {
    showToast('Trình duyệt chặn popup, hãy cho phép popup để in biên lai', 'error')
    return
  }
  w.document.write(`
    <html><head><title>Biên lai ${escapeHtml(t.receiptNo || '')}</title>
    <style>body{font-family:Arial,sans-serif;padding:32px;color:#111}h1{font-size:20px}.box{border:1px solid #333;border-radius:8px;padding:20px;margin-top:16px}table{width:100%;border-collapse:collapse;margin-top:12px}td{padding:8px;border-bottom:1px dotted #999;font-size:14px}.sign{display:flex;justify-content:space-between;margin-top:48px;font-size:13px}@media print{button{display:none}}</style>
    </head><body>
      <h1>BIÊN LAI HỌC PHÍ</h1>
      <div>Số biên lai: <strong>${escapeHtml(t.receiptNo || '')}</strong></div>
      <div class="box"><table>
        <tr><td>Lớp</td><td><strong>${escapeHtml(t.className || '')}</strong></td></tr>
        <tr><td>Học sinh</td><td><strong>${escapeHtml(t.studentName || '')}</strong></td></tr>
        <tr><td>Loại giao dịch</td><td>${escapeHtml(TX_LABELS[t.type] || t.type)}</td></tr>
        <tr><td>Số tiền</td><td><strong>${fmt(Math.abs(Number(t.amount)))} VND</strong></td></tr>
        <tr><td>Thời gian</td><td>${escapeHtml(new Date(t.createdAt).toLocaleString('vi-VN'))}</td></tr>
        <tr><td>Ghi chú</td><td>${escapeHtml(t.note || '')}</td></tr>
      </table></div>
      <div class="sign"><span>Người nộp</span><span>Người thu</span></div>
      <br><button onclick="window.print()">In biên lai</button>
    </body></html>
  `)
  w.document.close()
}

async function fetchLedger() {
  const params = filterClassId ? `classId=${filterClassId}&limit=200` : `limit=200`
  try {
    const res = await api.getTuitionTransactions(params)
    allTx = Array.isArray(res) ? res : []
  } catch (err) {
    showToast(`Lỗi tải sổ giao dịch: ${err.message}`, 'error')
    allTx = []
  }
  renderTables()
}

export function bindTuitionLedgerEvents() {
  bindSidebarEvents()
  if (state.classes.length === 0) {
    api.getClasses().then(res => {
      state.classes = res || []
      const sel = document.getElementById('ledger-filter-class')
      if (sel) {
        sel.innerHTML = '<option value="">Tất cả lớp học</option>' + (state.classes || []).map(c => `<option value="${c.id}" ${c.id === filterClassId ? 'selected' : ''}>${escapeHtml(c.name)}</option>`).join('')
      }
    }).catch(() => {})
  }

  document.getElementById('ledger-filter-class')?.addEventListener('change', async (e) => {
    filterClassId = e.target.value
    await fetchLedger()
  })
  document.getElementById('ledger-filter-type')?.addEventListener('change', (e) => {
    filterType = e.target.value
    applyFilters()
  })
  let timer
  document.getElementById('ledger-search')?.addEventListener('input', (e) => {
    clearTimeout(timer)
    timer = setTimeout(() => {
      filterSearch = e.target.value
      applyFilters()
    }, 250)
  })
  document.getElementById('ledger-export-btn')?.addEventListener('click', () => {
    const lines = ['SO GIAO DICH HOC PHI (TAT CA CAC LOP)', '']
    lines.push('Loai,Ngay,Gio,Lop,Hoc sinh,So tien (VND),So bien lai,Ghi chu')
    allTx.forEach(t => {
      const { date, time } = splitDateTime(t.createdAt)
      lines.push([TX_LABELS[t.type] || t.type, date, time, t.className || '', t.studentName || '', t.amount, t.receiptNo || '', (t.note || '').replace(/\r?\n/g, ' ')].map(v => `"${String(v ?? '').replace(/"/g, '""')}"`).join(','))
    })
    const blob = new Blob(['\ufeff' + lines.join('\n')], { type: 'text/csv;charset=utf-8;' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = 'so-giao-dich-hoc-phi.csv'
    document.body.appendChild(a)
    a.click()
    document.body.removeChild(a)
    setTimeout(() => URL.revokeObjectURL(url), 2000)
    showToast('Đã xuất sổ giao dịch', 'success')
  })

  fetchLedger()
}
