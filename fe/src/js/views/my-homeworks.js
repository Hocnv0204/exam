import { renderSidebar, bindSidebarEvents } from '../components/sidebar.js'
import { renderNavbar } from '../components/navbar.js'
import { showToast } from '../components/toast.js'
import { openModal } from '../components/modal.js'
import { state } from '../state.js'
import { api } from '../api.js'
import { escapeHtml } from '../utils/download-helper.js'

// Đảm bảo nút làm/làm lại bài luôn hoạt động kể cả khi vào thẳng trang này
if (!window.confirmStartHomework) {
  window.confirmStartHomework = (homeworkId, type = 'PRACTICE') => {
    if (type === 'EXAM') {
      sessionStorage.removeItem(`exam_active_${homeworkId}`)
      window.location.hash = `#exam-room?homeworkId=${homeworkId}`
      return
    }
    openModal(
      'Xác nhận làm bài tập',
      `<p style="font-size:15px; color:#475569; line-height:1.6; margin:0;">
        Bạn có chắc chắn muốn bắt đầu làm bài tập này?<br>
        Thời gian làm bài sẽ <strong>bắt đầu đếm ngược ngay lập tức</strong>!
       </p>`,
      () => {
        window.location.hash = `#homework-attempt?homeworkId=${homeworkId}`
        return true
      }
    )
  }
}

let filterStatus = 'all' // all | done | todo
let filterClassId = ''
let filterSearch = ''
let currentPage = 1
const PAGE_SIZE = 10
let totalItems = 0
let totalPages = 1

export function renderMyHomeworksView() {
  return `
    <div class="app-layout">
      ${renderSidebar('my-homeworks')}
      <div class="main-content">
        ${renderNavbar('Học tập / Bài tập của tôi')}
        <div class="content-body">
          <div class="page-header" style="margin-bottom:16px;">
            <div>
              <h1 class="page-title">Bài tập của tôi</h1>
              <p class="page-description">Tất cả bài tập và bài thi được giao theo lớp của bạn — gồm cả bài đã làm (điểm số, làm lại) và bài chưa làm.</p>
            </div>
          </div>

          <div id="myhw-stats" style="display:grid; grid-template-columns:repeat(auto-fit, minmax(180px, 1fr)); gap:12px; margin-bottom:16px;"></div>

          <div class="card" style="margin:0 0 16px 0; padding:14px 16px;">
            <div style="display:flex; gap:10px; flex-wrap:wrap; align-items:center;">
              <div style="display:flex; background:#f1f5f9; border-radius:10px; padding:3px; gap:4px;">
                <button type="button" class="myhw-status-btn" data-status="all" style="border:none; padding:6px 14px; font-size:13px; font-weight:700; border-radius:8px; cursor:pointer;">Tất cả</button>
                <button type="button" class="myhw-status-btn" data-status="todo" style="border:none; padding:6px 14px; font-size:13px; font-weight:700; border-radius:8px; cursor:pointer;">Chưa làm</button>
                <button type="button" class="myhw-status-btn" data-status="done" style="border:none; padding:6px 14px; font-size:13px; font-weight:700; border-radius:8px; cursor:pointer;">Đã làm</button>
              </div>
              <select id="myhw-class-filter" style="height:38px; border:1px solid #cbd5e1; border-radius:8px; padding:0 10px; font-size:13px; min-width:180px;">
                <option value="">Tất cả lớp</option>
              </select>
              <div style="position:relative; flex:1; min-width:200px;">
                <i class="fa-solid fa-magnifying-glass" style="position:absolute; left:12px; top:12px; color:#94a3b8; font-size:13px;"></i>
                <input id="myhw-search" type="text" placeholder="Tìm theo tên bài..." style="width:100%; height:38px; border:1px solid #cbd5e1; border-radius:8px; padding:0 12px 0 36px; font-size:13px;">
              </div>
            </div>
          </div>

          <div id="myhw-list" style="display:flex; flex-direction:column; gap:12px;">
            <div style="text-align:center; padding:48px; color:#94a3b8;">
              <i class="fa-solid fa-spinner fa-spin" style="font-size:26px; color:#0066cc;"></i>
              <div style="margin-top:8px; font-size:13px;">Đang tải bài tập...</div>
            </div>
          </div>

          <div id="myhw-pagination" style="display:flex; align-items:center; justify-content:space-between; margin-top:14px; flex-wrap:wrap; gap:10px;"></div>
        </div>
      </div>
    </div>
  `
}

function paintStatusButtons() {
  document.querySelectorAll('.myhw-status-btn').forEach(b => {
    const active = b.getAttribute('data-status') === filterStatus
    b.style.background = active ? '#0066cc' : 'transparent'
    b.style.color = active ? '#ffffff' : '#475569'
  })
}

function renderStats(stats) {
  const el = document.getElementById('myhw-stats')
  if (!el) return
  const card = (label, value, sub, color, bg) => `
    <div class="card" style="margin:0; padding:14px 16px; border-radius:12px; background:${bg}; border:1px solid #e2e8f0;">
      <div style="font-size:11px; font-weight:700; color:${color}; text-transform:uppercase;">${label}</div>
      <div style="font-size:22px; font-weight:800; color:#0f172a;">${value}</div>
      <div style="font-size:12px; color:#64748b;">${sub}</div>
    </div>
  `
  el.innerHTML =
    card('Tổng bài được giao', stats.total ?? 0, 'Mọi lớp của bạn', '#0066cc', '#eff6ff') +
    card('Chưa làm', stats.todo ?? 0, 'Cần hoàn thành', '#b45309', '#fffbeb') +
    card('Đã làm', stats.done ?? 0, 'Có điểm số', '#15803d', '#f0fdf4') +
    card('Điểm trung bình', stats.avgScore ?? '—', 'Các bài đã làm', '#7c3aed', '#faf5ff')
}

function hwCard(hw) {
  const isExam = (hw.type || 'PRACTICE') === 'EXAM'
  const deadlineDate = hw.deadline && !isNaN(new Date(hw.deadline).getTime()) ? new Date(hw.deadline) : null
  const overdue = deadlineDate ? (new Date() > deadlineDate) : false
  const typeBadge = isExam
    ? `<span style="font-size:11px; font-weight:700; padding:2px 8px; border-radius:6px; background:#fef2f2; color:#dc2626; border:1px solid #fecaca;">BÀI THI</span>`
    : `<span style="font-size:11px; font-weight:700; padding:2px 8px; border-radius:6px; background:#eff6ff; color:#0284c7; border:1px solid #bfdbfe;">LUYỆN TẬP</span>`

  let statusBlock = ''
  let actions = ''
  if (hw.done) {
    const score = Number(hw.score ?? 0)
    const max = Number(hw.maxScore ?? 10)
    const passed = hw.isPassed !== false
    statusBlock = `
      <div style="display:flex; align-items:center; gap:8px; flex-wrap:wrap;">
        <span style="font-size:15px; font-weight:800; color:${passed ? '#15803d' : '#b91c1c'}; background:${passed ? '#f0fdf4' : '#fef2f2'}; border:1px solid ${passed ? '#bbf7d0' : '#fecaca'}; padding:4px 12px; border-radius:8px;">
          ${score}/${max} điểm
        </span>
        <span style="font-size:11px; font-weight:700; padding:2px 8px; border-radius:6px; background:${passed ? '#dcfce7' : '#fee2e2'}; color:${passed ? '#15803d' : '#b91c1c'};">
          ${passed ? 'ĐẠT' : 'CHƯA ĐẠT'}
        </span>
        ${hw.isLate ? `<span style="font-size:11px; font-weight:700; padding:2px 8px; border-radius:6px; background:#fffbeb; color:#b45309; border:1px solid #fde68a;">Nộp muộn</span>` : ''}
      </div>
      <div style="font-size:12px; color:#64748b; margin-top:4px;">Nộp lúc: ${hw.submittedAt ? new Date(hw.submittedAt).toLocaleString('vi-VN') : '—'}</div>
    `
    actions = `
      <a href="#assignment-review?submissionId=${hw.submissionId}" class="btn-secondary" style="padding:8px 14px; font-size:13px; font-weight:600; border-radius:8px; text-decoration:none; display:inline-flex; align-items:center; gap:6px;">
        <i class="fa-solid fa-eye"></i> Xem kết quả
      </a>
      <button type="button" class="btn-primary" onclick="window.confirmStartHomework('${hw.id}','${hw.type || 'PRACTICE'}')" style="padding:8px 16px; font-size:13px; font-weight:700; border-radius:8px; cursor:pointer; display:inline-flex; align-items:center; gap:6px; width:auto;">
        <i class="fa-solid fa-rotate-right"></i> Làm lại
      </button>
    `
  } else {
    statusBlock = deadlineDate ? `
      <div style="font-size:13px; font-weight:600; color:${overdue ? '#b91c1c' : '#475569'}; display:flex; align-items:center; gap:6px;">
        <i class="fa-regular fa-clock"></i> Hạn chót: ${deadlineDate.toLocaleString('vi-VN')}
        ${overdue ? `<span style="font-size:11px; font-weight:700; padding:2px 8px; border-radius:6px; background:#fef2f2; color:#b91c1c; border:1px solid #fecaca;">Quá hạn (vẫn nộp được)</span>` : ''}
      </div>
    ` : `<div style="font-size:12px; color:#94a3b8;">Không giới hạn thời gian nộp</div>`
    actions = `
      <button type="button" class="btn-primary" onclick="window.confirmStartHomework('${hw.id}','${hw.type || 'PRACTICE'}')" style="padding:8px 18px; font-size:13px; font-weight:700; border-radius:8px; cursor:pointer; display:inline-flex; align-items:center; gap:6px; width:auto; background:${overdue ? '#d97706' : ''}; border-color:${overdue ? '#d97706' : ''};">
        <i class="fa-solid fa-pen-to-square"></i> ${isExam ? 'Vào phòng thi' : 'Làm bài'}
      </button>
    `
  }

  return `
    <div class="card myhw-card" data-status="${hw.done ? 'done' : 'todo'}" data-class="${hw.classId || ''}" data-title="${escapeHtml((hw.title || '').toLowerCase())}" style="margin:0; padding:16px 18px; border-radius:14px;">
      <div style="display:flex; justify-content:space-between; gap:14px; flex-wrap:wrap;">
        <div style="flex:1; min-width:240px;">
          <div style="display:flex; align-items:center; gap:8px; flex-wrap:wrap; margin-bottom:6px;">
            ${typeBadge}
            <span style="font-size:12px; color:#64748b; font-weight:600;"><i class="fa-solid fa-users" style="font-size:11px;"></i> ${escapeHtml(hw.className || 'Lớp học')}</span>
          </div>
          <div style="font-size:15px; font-weight:700; color:#0f172a; margin-bottom:6px;">${escapeHtml(hw.title || 'Bài tập')}</div>
          <div style="font-size:12px; color:#64748b; margin-bottom:8px;"><i class="fa-regular fa-hourglass"></i> ${hw.durationMinutes || 45} phút</div>
          ${statusBlock}
        </div>
        <div style="display:flex; align-items:center; gap:8px; flex-wrap:wrap; align-content:center;">
          ${actions}
        </div>
      </div>
    </div>
  `
}

function renderPager() {
  const pager = document.getElementById('myhw-pagination')
  if (!pager) return
  if (totalItems === 0) {
    pager.innerHTML = ''
    return
  }
  const from = (currentPage - 1) * PAGE_SIZE + 1
  const to = Math.min(currentPage * PAGE_SIZE, totalItems)
  let nums = ''
  const startP = Math.max(1, Math.min(currentPage - 2, totalPages - 4))
  const endP = Math.min(totalPages, startP + 4)
  for (let p = startP; p <= endP; p++) {
    nums += `<button data-myhw-page="${p}" style="min-width:32px; height:32px; border-radius:8px; border:1px solid ${p === currentPage ? '#0066cc' : '#cbd5e1'}; background:${p === currentPage ? '#0066cc' : '#ffffff'}; color:${p === currentPage ? '#ffffff' : '#334155'}; font-weight:700; font-size:13px; cursor:pointer;">${p}</button>`
  }
  pager.innerHTML = `
    <div style="font-size:13px; color:#64748b;">Hiển thị ${from}–${to} / ${totalItems} bài</div>
    ${totalPages <= 1 ? '' : `
    <div style="display:flex; align-items:center; gap:6px;">
      <button data-myhw-page="prev" ${currentPage <= 1 ? 'disabled' : ''} style="height:32px; padding:0 12px; border-radius:8px; border:1px solid #cbd5e1; background:#ffffff; font-size:13px; font-weight:600; cursor:pointer; opacity:${currentPage <= 1 ? '0.4' : '1'};">‹ Trước</button>
      ${nums}
      <button data-myhw-page="next" ${currentPage >= totalPages ? 'disabled' : ''} style="height:32px; padding:0 12px; border-radius:8px; border:1px solid #cbd5e1; background:#ffffff; font-size:13px; font-weight:600; cursor:pointer; opacity:${currentPage >= totalPages ? '0.4' : '1'};">Sau ›</button>
    </div>`}
  `
  pager.querySelectorAll('[data-myhw-page]').forEach(btn => {
    btn.onclick = () => {
      const v = btn.getAttribute('data-myhw-page')
      if (v === 'prev') currentPage--
      else if (v === 'next') currentPage++
      else currentPage = parseInt(v, 10) || 1
      fetchMyHomeworks()
    }
  })
}

async function fetchMyHomeworks() {
  const listEl = document.getElementById('myhw-list')
  if (listEl) {
    listEl.innerHTML = `
      <div style="text-align:center; padding:48px; color:#94a3b8;">
        <i class="fa-solid fa-spinner fa-spin" style="font-size:26px; color:#0066cc;"></i>
        <div style="margin-top:8px; font-size:13px;">Đang tải bài tập...</div>
      </div>
    `
  }
  try {
    const sp = new URLSearchParams({ status: filterStatus, page: String(currentPage), pageSize: String(PAGE_SIZE) })
    if (filterClassId) sp.set('classId', filterClassId)
    if (filterSearch.trim()) sp.set('search', filterSearch.trim())
    const res = await api.getMyHomeworks(`&${sp.toString()}`)
    const items = res?.items || []
    totalItems = res?.total ?? items.length
    totalPages = res?.totalPages ?? 1
    currentPage = res?.page ?? currentPage
    renderStats(res?.stats || { total: 0, done: 0, todo: 0, avgScore: null })
    if (listEl) {
      listEl.innerHTML = items.length === 0
        ? `<div class="card" style="margin:0; padding:40px; text-align:center; color:#64748b;">Không có bài nào khớp bộ lọc.</div>`
        : items.map(hwCard).join('')
    }
    renderPager()
  } catch (err) {
    if (listEl) {
      listEl.innerHTML = `<div class="card" style="margin:0; padding:32px; text-align:center; color:#b91c1c;">Lỗi tải bài tập: ${escapeHtml(err.message)}</div>`
    }
    showToast(`Lỗi tải bài tập: ${err.message}`, 'error')
  }
}

export async function bindMyHomeworksEvents() {
  bindSidebarEvents()
  paintStatusButtons()

  // Lớp filter lấy từ lớp đã đăng ký của học sinh
  try {
    if (!state.classes || state.classes.length === 0) {
      state.classes = await api.getClasses().catch(() => [])
    }
  } catch (_) {}
  const classSel = document.getElementById('myhw-class-filter')
  if (classSel) {
    classSel.innerHTML = '<option value="">Tất cả lớp</option>' +
      (state.classes || []).map(c => `<option value="${c.id}">${escapeHtml(c.name)}</option>`).join('')
  }

  await fetchMyHomeworks()

  document.querySelectorAll('.myhw-status-btn').forEach(b => {
    b.addEventListener('click', () => {
      filterStatus = b.getAttribute('data-status')
      currentPage = 1
      paintStatusButtons()
      fetchMyHomeworks()
    })
  })
  document.getElementById('myhw-class-filter')?.addEventListener('change', (e) => {
    filterClassId = e.target.value
    currentPage = 1
    fetchMyHomeworks()
  })
  let timer
  document.getElementById('myhw-search')?.addEventListener('input', (e) => {
    clearTimeout(timer)
    timer = setTimeout(() => {
      filterSearch = e.target.value
      currentPage = 1
      fetchMyHomeworks()
    }, 350)
  })
}
