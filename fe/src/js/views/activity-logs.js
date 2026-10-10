import { renderSidebar, bindSidebarEvents } from '../components/sidebar.js'
import { renderNavbar } from '../components/navbar.js'
import { showToast } from '../components/toast.js'
import { state } from '../state.js'
import { api } from '../api.js'
import { renderPaginationBar, bindPaginationEvents } from '../components/pagination.js'

let currentPage = 1
let pageSize = 20
let filterSearch = ''
let filterClassId = ''
let filterAction = ''
let filterFrom = ''
let filterTo = ''
let cachedTotal = 0

const ACTIVITY_LABELS = {
  LOGIN: 'Đăng nhập',
  LOGOUT: 'Đăng xuất',
  LESSON_VIEW: 'Mở bài học',
  VIDEO_WATCH: 'Xem video',
  HOMEWORK_START: 'Bắt đầu làm bài',
  HOMEWORK_SUBMIT: 'Nộp bài',
  EXAM_START: 'Vào phòng thi',
  EXAM_SUBMIT: 'Nộp bài thi'
}

function formatSecs(total) {
  const s = Number(total) || 0
  if (s < 60) return `${s}s`
  const m = Math.floor(s / 60)
  if (m < 60) return `${m}p${s % 60 ? `${s % 60}s` : ''}`
  return `${Math.floor(m / 60)}h${m % 60 ? `${m % 60}p` : ''}`
}

function logDetail(log) {
  const meta = log.metadata || {}
  return meta.homeworkTitle || meta.lessonTitle || meta.title || meta.lessonId || meta.homeworkId || ''
}

export function renderActivityLogsView() {
  return `
    <div class="app-layout">
      ${renderSidebar('activity-logs')}
      <div class="main-content">
        ${renderNavbar('Quản trị / Nhật ký hoạt động')}
        <div class="content-body">
          <div class="page-header">
            <div>
              <h1 class="page-title">Nhật ký hoạt động</h1>
              <p class="page-description">Từng bản ghi đăng nhập, xem video/bài học và làm bài của học sinh theo thời gian thực.</p>
            </div>
          </div>

          <div class="card">
            <div style="display:flex; gap:10px; flex-wrap:wrap; align-items:flex-end; margin-bottom:16px;">
              <div style="flex:1; min-width:200px;">
                <label style="font-size:12px; font-weight:600; color:#475569; display:block; margin-bottom:4px;">Tìm học sinh</label>
                <input type="text" id="activity-search-input" class="form-input" placeholder="Tên hoặc username..." value="${filterSearch}">
              </div>
              <div>
                <label style="font-size:12px; font-weight:600; color:#475569; display:block; margin-bottom:4px;">Lớp</label>
                <select id="activity-class-filter" class="form-input" style="width:auto;">
                  <option value="">Tất cả lớp</option>
                  ${(state.classes || []).map(c => `<option value="${c.id}" ${filterClassId === c.id ? 'selected' : ''}>${c.name}</option>`).join('')}
                </select>
              </div>
              <div>
                <label style="font-size:12px; font-weight:600; color:#475569; display:block; margin-bottom:4px;">Hành động</label>
                <select id="activity-action-filter" class="form-input" style="width:auto;">
                  <option value="">Tất cả</option>
                  ${Object.keys(ACTIVITY_LABELS).map(k => `<option value="${k}" ${filterAction === k ? 'selected' : ''}>${ACTIVITY_LABELS[k]}</option>`).join('')}
                </select>
              </div>
              <div>
                <label style="font-size:12px; font-weight:600; color:#475569; display:block; margin-bottom:4px;">Từ ngày</label>
                <input type="date" id="activity-from-date" class="form-input" value="${filterFrom}" style="width:auto;">
              </div>
              <div>
                <label style="font-size:12px; font-weight:600; color:#475569; display:block; margin-bottom:4px;">Đến ngày</label>
                <input type="date" id="activity-to-date" class="form-input" value="${filterTo}" style="width:auto;">
              </div>
              <button id="activity-apply-btn" class="btn-primary" style="width:auto; padding:10px 18px; cursor:pointer;">
                <i class="fa-solid fa-filter"></i> Lọc
              </button>
              <button id="activity-reset-btn" class="btn-secondary" style="width:auto; padding:10px 18px; cursor:pointer;" title="Xóa hết điều kiện lọc và tải lại">
                <i class="fa-solid fa-rotate-left"></i> Làm mới
              </button>
            </div>

            <div class="table-responsive">
              <table class="data-table">
                <thead>
                  <tr>
                    <th>Thời gian</th>
                    <th>Học sinh</th>
                    <th>Hành động</th>
                    <th>Chi tiết</th>
                    <th style="text-align:center;">Thời lượng</th>
                  </tr>
                </thead>
                <tbody id="activity-logs-tbody">
                  <tr><td colspan="5" style="text-align:center; padding:32px; color:#64748b;">
                    <i class="fa-solid fa-circle-notch fa-spin"></i> Đang tải nhật ký...
                  </td></tr>
                </tbody>
              </table>
            </div>

            <div id="activity-pagination-wrapper" style="margin-top:16px;"></div>
          </div>
        </div>
      </div>
    </div>
  `
}

function renderRows(items) {
  const tbody = document.getElementById('activity-logs-tbody')
  if (!tbody) return
  if (!items || items.length === 0) {
    tbody.innerHTML = `<tr><td colspan="5" style="text-align:center; padding:32px; color:#94a3b8;">Không có bản ghi nào khớp bộ lọc.</td></tr>`
    return
  }
  tbody.innerHTML = items.map(l => `
    <tr>
      <td style="white-space:nowrap;">${new Date(l.createdAt).toLocaleString('vi-VN')}</td>
      <td>
        <div style="font-weight:700; color:#0f172a;">${l.userName}</div>
        ${l.username ? `<div style="font-size:11px; color:#64748b;">${l.username}</div>` : ''}
      </td>
      <td><span class="badge badge-paid">${ACTIVITY_LABELS[l.action] || l.action}</span></td>
      <td style="font-size:12px; color:#475569;">${logDetail(l)}</td>
      <td style="text-align:center; font-weight:600;">${l.durationSeconds ? formatSecs(l.durationSeconds) : '—'}</td>
    </tr>
  `).join('')
}

async function loadLogs() {
  const tbody = document.getElementById('activity-logs-tbody')
  try {
    const params = { page: currentPage, limit: pageSize }
    if (filterSearch) params.search = filterSearch
    if (filterClassId) params.classId = filterClassId
    if (filterAction) params.filterAction = filterAction
    if (filterFrom) params.from = `${filterFrom}T00:00:00+07:00`
    if (filterTo) params.to = `${filterTo}T23:59:59+07:00`
    const res = await api.getUserActivity(params)
    cachedTotal = res?.total || 0
    renderRows(res?.items || [])

    const wrapper = document.getElementById('activity-pagination-wrapper')
    if (wrapper) {
      wrapper.innerHTML = renderPaginationBar({
        currentPage,
        totalItems: cachedTotal,
        pageSize,
        containerId: 'activity-pagination-container',
        pageSizeOptions: [10, 20, 50, 100]
      })
      bindPaginationEvents({
        containerId: 'activity-pagination-container',
        onPageChange: (p) => { currentPage = p; loadLogs() },
        onPageSizeChange: (s) => { pageSize = s; currentPage = 1; loadLogs() }
      })
    }
  } catch (err) {
    console.error('[activity-logs] load failed:', err)
    if (tbody) {
      tbody.innerHTML = `<tr><td colspan="5" style="text-align:center; padding:32px; color:#ef4444;">Tải thất bại: ${err.message}</td></tr>`
    }
    showToast(`Tải nhật ký thất bại: ${err.message}`, 'error')
  }
}

export function bindActivityLogsEvents() {
  bindSidebarEvents()

  const applyFilters = () => {
    filterSearch = document.getElementById('activity-search-input')?.value.trim() || ''
    filterClassId = document.getElementById('activity-class-filter')?.value || ''
    filterAction = document.getElementById('activity-action-filter')?.value || ''
    const fromVal = document.getElementById('activity-from-date')?.value || ''
    const toVal = document.getElementById('activity-to-date')?.value || ''
    if (fromVal && toVal && fromVal > toVal) {
      showToast('Từ ngày không được sau Đến ngày!', 'error')
      return
    }
    filterFrom = fromVal
    filterTo = toVal
    currentPage = 1
    loadLogs()
  }

  document.getElementById('activity-apply-btn')?.addEventListener('click', applyFilters)

  // Enter ở ô tìm kiếm / ngày thì lọc luôn (không tự gọi khi đang gõ)
  ;['activity-search-input', 'activity-from-date', 'activity-to-date'].forEach(id => {
    document.getElementById(id)?.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') {
        e.preventDefault()
        applyFilters()
      }
    })
  })

  // Chọn dropdown Lớp / Hành động thì gọi API ngay, không cần bấm Lọc
  document.getElementById('activity-class-filter')?.addEventListener('change', (e) => {
    filterClassId = e.target.value || ''
    currentPage = 1
    loadLogs()
  })
  document.getElementById('activity-action-filter')?.addEventListener('change', (e) => {
    filterAction = e.target.value || ''
    currentPage = 1
    loadLogs()
  })

  document.getElementById('activity-reset-btn')?.addEventListener('click', () => {
    filterSearch = ''
    filterClassId = ''
    filterAction = ''
    filterFrom = ''
    filterTo = ''
    currentPage = 1
    const s = document.getElementById('activity-search-input')
    const c = document.getElementById('activity-class-filter')
    const a = document.getElementById('activity-action-filter')
    const f = document.getElementById('activity-from-date')
    const t = document.getElementById('activity-to-date')
    if (s) s.value = ''
    if (c) c.value = ''
    if (a) a.value = ''
    if (f) f.value = ''
    if (t) t.value = ''
    loadLogs()
  })

  loadLogs()
}
