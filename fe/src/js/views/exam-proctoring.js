import { renderSidebar, bindSidebarEvents } from '../components/sidebar.js'
import { renderNavbar } from '../components/navbar.js'
import { state } from '../state.js'
import { api } from '../api.js'
import { showToast } from '../components/toast.js'
import { openModal } from '../components/modal.js'

let proctoringInterval = null
let isAutoRefresh = true
let currentHomeworkId = null
let currentHomeworkData = null
let sessionsList = []
let logsList = []
let activeTab = 'sessions' // 'sessions' | 'logs'
let searchQuery = ''

function formatActionLabel(action) {
  switch (action) {
    case 'LEAVE_TAB':
      return `<span style="color:#dc2626; background:#fee2e2; border:1px solid #fecaca; padding:2px 8px; border-radius:6px; font-weight:700; font-size:11px; display:inline-flex; align-items:center; gap:4px;">
        <i class="fa-solid fa-arrow-up-right-from-square"></i> Rời tab thi
      </span>`
    case 'BLUR_TAB':
      return `<span style="color:#d97706; background:#fef3c7; border:1px solid #fde68a; padding:2px 8px; border-radius:6px; font-weight:700; font-size:11px; display:inline-flex; align-items:center; gap:4px;">
        <i class="fa-solid fa-window-restore"></i> Mất tiêu điểm cửa sổ
      </span>`
    case 'DEVTOOLS':
      return `<span style="color:#991b1b; background:#fee2e2; border:1px solid #f87171; padding:2px 8px; border-radius:6px; font-weight:800; font-size:11px; display:inline-flex; align-items:center; gap:4px;">
        <i class="fa-solid fa-code"></i> Mở DevTools (F12)
      </span>`
    case 'FULLSCREEN_EXIT':
      return `<span style="color:#b45309; background:#ffedd5; border:1px solid #fed7aa; padding:2px 8px; border-radius:6px; font-weight:700; font-size:11px; display:inline-flex; align-items:center; gap:4px;">
        <i class="fa-solid fa-compress"></i> Thoát toàn màn hình
      </span>`
    case 'COPY':
      return `<span style="color:#4f46e5; background:#e0e7ff; border:1px solid #c7d2fe; padding:2px 8px; border-radius:6px; font-weight:700; font-size:11px; display:inline-flex; align-items:center; gap:4px;">
        <i class="fa-solid fa-copy"></i> Thử sao chép (Copy)
      </span>`
    case 'PASTE':
      return `<span style="color:#4338ca; background:#e0e7ff; border:1px solid #c7d2fe; padding:2px 8px; border-radius:6px; font-weight:700; font-size:11px; display:inline-flex; align-items:center; gap:4px;">
        <i class="fa-solid fa-paste"></i> Dán nội dung (Paste)
      </span>`
    default:
      return `<span style="color:#64748b; background:#f1f5f9; padding:2px 8px; border-radius:6px; font-weight:600; font-size:11px;">${action}</span>`
  }
}

export function renderExamProctoringView() {
  const hashUrl = window.location.hash.replace('#', '')
  const [_, queryString] = hashUrl.split('?')
  const params = new URLSearchParams(queryString || '')
  currentHomeworkId = params.get('homeworkId')

  return `
    <div class="app-layout">
      ${renderSidebar('homework-mgmt')}
      <div class="main-content">
        ${renderNavbar()}
        <div class="content-container" style="max-width:1240px; margin:0 auto; padding:24px 20px;">
          <div id="proctoring-mount">
            <div style="text-align:center; padding:60px 0; color:#64748b;">
              <i class="fa-solid fa-spinner fa-spin" style="font-size:32px; color:#0284c7; margin-bottom:12px;"></i>
              <p style="font-size:15px; font-weight:600;">Đang kết nối trung tâm giám sát thi...</p>
            </div>
          </div>
        </div>
      </div>
    </div>
  `
}

async function fetchProctoringData(isSilent = false) {
  if (!currentHomeworkId) return
  try {
    const [hwData, sessions, logs] = await Promise.all([
      currentHomeworkData ? Promise.resolve(currentHomeworkData) : api.getHomeworkDetail(currentHomeworkId, { silent: isSilent }),
      api.getExamSessions(currentHomeworkId, { silent: isSilent }).catch(() => []),
      api.getExamLogs(currentHomeworkId, '', { silent: isSilent }).catch(() => [])
    ])

    currentHomeworkData = hwData
    sessionsList = sessions || []
    logsList = logs || []

    renderProctoringContent()
  } catch (err) {
    console.error('[ExamProctoring] Failed to fetch proctoring data:', err)
  }
}

function renderProctoringContent() {
  const mount = document.getElementById('proctoring-mount')
  if (!mount) return

  const hw = currentHomeworkData?.homework || {}
  const now = Date.now()
  const maxViolations = hw.maxViolations || hw.max_violations || 3

  // Aggregate logs per student
  const studentViolationsMap = {}
  logsList.forEach(log => {
    const sid = log.student_id
    if (!studentViolationsMap[sid]) {
      studentViolationsMap[sid] = { total: 0, logs: [] }
    }
    studentViolationsMap[sid].logs.push(log)
    if (['LEAVE_TAB', 'BLUR_TAB', 'DEVTOOLS', 'FULLSCREEN_EXIT'].includes(log.action)) {
      studentViolationsMap[sid].total++
    }
  })

  // Counters
  let activeCount = 0
  let disconnectedCount = 0
  let submittedCount = 0
  let flaggedCount = 0

  sessionsList.forEach(s => {
    if (s.status === 'SUBMITTED') {
      submittedCount++
    } else if (s.status === 'ACTIVE') {
      const lastHb = new Date(s.last_heartbeat_at).getTime()
      if (now - lastHb <= 90000) {
        activeCount++
      } else {
        disconnectedCount++
      }
    }
    const studentVio = studentViolationsMap[s.student_id]?.total || 0
    if (studentVio >= maxViolations) {
      flaggedCount++
    }
  })

  // Filtered lists
  const filteredSessions = sessionsList.filter(s => {
    if (!searchQuery) return true
    const q = searchQuery.toLowerCase()
    const name = s.profiles?.full_name?.toLowerCase() || ''
    const username = s.profiles?.username?.toLowerCase() || ''
    return name.includes(q) || username.includes(q)
  })

  const filteredLogs = logsList.filter(l => {
    if (!searchQuery) return true
    const q = searchQuery.toLowerCase()
    const name = l.profiles?.full_name?.toLowerCase() || ''
    const username = l.profiles?.username?.toLowerCase() || ''
    return name.includes(q) || username.includes(q) || l.action.toLowerCase().includes(q)
  })

  mount.innerHTML = `
    <!-- Top Header -->
    <div style="display:flex; justify-content:space-between; align-items:center; flex-wrap:wrap; gap:16px; margin-bottom:20px; padding-bottom:16px; border-bottom:1px solid #e2e8f0;">
      <div>
        <div style="display:flex; align-items:center; gap:10px; margin-bottom:6px;">
          <a href="#homework-mgmt" class="btn-secondary" style="padding:6px 12px; font-size:12px; border-radius:8px; display:inline-flex; align-items:center; gap:6px; text-decoration:none; color:#475569;">
            <i class="fa-solid fa-arrow-left"></i> Quay lại
          </a>
          <span style="background:#fee2e2; color:#b91c1c; border:1px solid #fecaca; font-size:11px; font-weight:800; padding:3px 10px; border-radius:20px; display:inline-flex; align-items:center; gap:6px; letter-spacing:0.5px;">
            <span style="display:inline-block; width:8px; height:8px; border-radius:50%; background:#ef4444; animation: pulse 1.5s infinite;"></span>
            LIVE PROCTORING
          </span>
        </div>
        <h1 style="font-size:22px; font-weight:800; color:#0f172a; margin:0 0 4px 0;">
          ${hw.title || 'Giám Sát Phòng Thi'}
        </h1>
        <div style="font-size:13px; color:#64748b; display:flex; gap:16px; flex-wrap:wrap;">
          <span><i class="fa-regular fa-clock" style="color:#0284c7;"></i> Thời lượng: <strong>${hw.durationMinutes || hw.duration_minutes || 45} phút</strong></span>
          <span><i class="fa-solid fa-triangle-exclamation" style="color:#d97706;"></i> Giới hạn vi phạm: <strong>${maxViolations} lần</strong></span>
          <span><i class="fa-solid fa-calendar-check" style="color:#10b981;"></i> Trạng thái: <strong>${hw.is_published ? 'Đang mở đề' : 'Chưa công bố'}</strong></span>
        </div>
      </div>

      <!-- Live Controls -->
      <div style="display:flex; align-items:center; gap:12px;">
        <label style="display:inline-flex; align-items:center; gap:8px; cursor:pointer; font-size:13px; font-weight:600; color:#334155; background:#f8fafc; padding:8px 14px; border-radius:10px; border:1px solid #cbd5e1; user-select:none;">
          <input type="checkbox" id="proctor-auto-refresh" ${isAutoRefresh ? 'checked' : ''} style="cursor:pointer; accent-color:#0284c7; width:16px; height:16px;">
          <span>Tự động cập nhật (5s)</span>
        </label>
        <button id="proctor-refresh-now" class="btn-secondary" style="padding:8px 14px; font-size:13px; border-radius:10px; display:inline-flex; align-items:center; gap:6px; cursor:pointer;">
          <i class="fa-solid fa-rotate-right"></i> Làm mới
        </button>
      </div>
    </div>

    <!-- Quick Stats Cards -->
    <div style="display:grid; grid-template-columns: repeat(auto-fit, minmax(200px, 1fr)); gap:16px; margin-bottom:24px;">
      <div style="background:#ffffff; border:1px solid #bbf7d0; border-radius:14px; padding:18px; box-shadow:0 2px 8px rgba(0,0,0,0.03); display:flex; align-items:center; gap:14px;">
        <div style="width:46px; height:46px; border-radius:12px; background:#ecfdf5; color:#10b981; display:flex; align-items:center; justify-content:center; font-size:20px;">
          <i class="fa-solid fa-user-graduate"></i>
        </div>
        <div>
          <div style="font-size:24px; font-weight:800; color:#065f46;">${activeCount}</div>
          <div style="font-size:12px; font-weight:600; color:#047857;">Đang làm bài (Online)</div>
        </div>
      </div>

      <div style="background:#ffffff; border:1px solid #bfdbfe; border-radius:14px; padding:18px; box-shadow:0 2px 8px rgba(0,0,0,0.03); display:flex; align-items:center; gap:14px;">
        <div style="width:46px; height:46px; border-radius:12px; background:#eff6ff; color:#2563eb; display:flex; align-items:center; justify-content:center; font-size:20px;">
          <i class="fa-solid fa-circle-check"></i>
        </div>
        <div>
          <div style="font-size:24px; font-weight:800; color:#1e40af;">${submittedCount}</div>
          <div style="font-size:12px; font-weight:600; color:#1d4ed8;">Đã hoàn thành & nộp bài</div>
        </div>
      </div>

      <div style="background:#ffffff; border:1px solid #fed7aa; border-radius:14px; padding:18px; box-shadow:0 2px 8px rgba(0,0,0,0.03); display:flex; align-items:center; gap:14px;">
        <div style="width:46px; height:46px; border-radius:12px; background:#fff7ed; color:#ea580c; display:flex; align-items:center; justify-content:center; font-size:20px;">
          <i class="fa-solid fa-triangle-exclamation"></i>
        </div>
        <div>
          <div style="font-size:24px; font-weight:800; color:#9a3412;">${logsList.length}</div>
          <div style="font-size:12px; font-weight:600; color:#c2410c;">Lượt cảnh báo ghi nhận</div>
        </div>
      </div>

      <div style="background:#ffffff; border:1px solid #fecaca; border-radius:14px; padding:18px; box-shadow:0 2px 8px rgba(0,0,0,0.03); display:flex; align-items:center; gap:14px;">
        <div style="width:46px; height:46px; border-radius:12px; background:#fef2f2; color:#ef4444; display:flex; align-items:center; justify-content:center; font-size:20px;">
          <i class="fa-solid fa-ban"></i>
        </div>
        <div>
          <div style="font-size:24px; font-weight:800; color:#991b1b;">${flaggedCount}</div>
          <div style="font-size:12px; font-weight:600; color:#b91c1c;">Vượt ngưỡng vi phạm</div>
        </div>
      </div>
    </div>

    <!-- Main Navigation Tabs & Search -->
    <div style="background:#ffffff; border-radius:16px; border:1px solid #e2e8f0; box-shadow:0 2px 12px rgba(0,0,0,0.04); overflow:hidden;">
      <div style="display:flex; justify-content:space-between; align-items:center; flex-wrap:wrap; gap:12px; padding:14px 20px; border-bottom:1px solid #e2e8f0; background:#f8fafc;">
        <div style="display:flex; gap:8px;">
          <button id="tab-btn-sessions" class="btn-tab ${activeTab === 'sessions' ? 'active' : ''}" style="padding:8px 16px; font-size:13px; font-weight:700; border-radius:8px; border:1px solid ${activeTab === 'sessions' ? '#0284c7' : '#cbd5e1'}; background:${activeTab === 'sessions' ? '#0284c7' : '#ffffff'}; color:${activeTab === 'sessions' ? '#ffffff' : '#475569'}; cursor:pointer; display:inline-flex; align-items:center; gap:6px;">
            <i class="fa-solid fa-users"></i> Danh sách thí sinh (${sessionsList.length})
          </button>
          <button id="tab-btn-logs" class="btn-tab ${activeTab === 'logs' ? 'active' : ''}" style="padding:8px 16px; font-size:13px; font-weight:700; border-radius:8px; border:1px solid ${activeTab === 'logs' ? '#0284c7' : '#cbd5e1'}; background:${activeTab === 'logs' ? '#0284c7' : '#ffffff'}; color:${activeTab === 'logs' ? '#ffffff' : '#475569'}; cursor:pointer; display:inline-flex; align-items:center; gap:6px;">
            <i class="fa-solid fa-shield-halved"></i> Nhật ký gian lận trực tiếp (${logsList.length})
          </button>
        </div>

        <div style="position:relative; width:260px;">
          <i class="fa-solid fa-magnifying-glass" style="position:absolute; left:12px; top:50%; transform:translateY(-50%); color:#94a3b8; font-size:13px;"></i>
          <input type="text" id="proctor-search" placeholder="Tìm kiếm học sinh..." value="${searchQuery}" style="width:100%; padding:8px 12px 8px 34px; border:1px solid #cbd5e1; border-radius:8px; font-size:13px; outline:none; box-sizing:border-box;">
        </div>
      </div>

      <!-- Tab Content 1: Sessions List -->
      ${activeTab === 'sessions' ? `
        <div style="overflow-x:auto;">
          <table style="width:100%; border-collapse:collapse; font-size:13px; text-align:left;">
            <thead>
              <tr style="background:#f1f5f9; color:#475569; font-weight:700; border-bottom:1px solid #e2e8f0;">
                <th style="padding:12px 16px; width:50px;">STT</th>
                <th style="padding:12px 16px;">Thí sinh</th>
                <th style="padding:12px 16px;">Trạng thái phiên</th>
                <th style="padding:12px 16px;">Tín hiệu Online (Heartbeat)</th>
                <th style="padding:12px 16px; text-align:center;">Số vi phạm</th>
                <th style="padding:12px 16px; text-align:right;">Thao tác</th>
              </tr>
            </thead>
            <tbody>
              ${filteredSessions.length === 0 ? `
                <tr>
                  <td colspan="6" style="text-align:center; padding:40px; color:#94a3b8;">
                    <i class="fa-solid fa-folder-open" style="font-size:28px; margin-bottom:8px; display:block;"></i>
                    Chưa có thí sinh nào vào phòng thi này.
                  </td>
                </tr>
              ` : filteredSessions.map((s, idx) => {
                const sid = s.student_id
                const vData = studentViolationsMap[sid] || { total: 0, logs: [] }
                const vioCount = vData.total
                const isOver = vioCount >= maxViolations

                // Heartbeat status
                const lastHb = new Date(s.last_heartbeat_at).getTime()
                const hbSecondsAgo = Math.floor((now - lastHb) / 1000)
                let hbBadge = ''
                if (s.status === 'SUBMITTED') {
                  hbBadge = `<span style="color:#2563eb; background:#eff6ff; border:1px solid #bfdbfe; padding:3px 8px; border-radius:6px; font-weight:600; font-size:11px;">
                    <i class="fa-solid fa-check"></i> Đã nộp bài
                  </span>`
                } else if (hbSecondsAgo <= 90) {
                  hbBadge = `<span style="color:#059669; background:#ecfdf5; border:1px solid #a7f3d0; padding:3px 8px; border-radius:6px; font-weight:600; font-size:11px; display:inline-flex; align-items:center; gap:5px;">
                    <span style="display:inline-block; width:6px; height:6px; border-radius:50%; background:#10b981;"></span> Online (${hbSecondsAgo}s trước)
                  </span>`
                } else {
                  hbBadge = `<span style="color:#d97706; background:#fef3c7; border:1px solid #fde68a; padding:3px 8px; border-radius:6px; font-weight:600; font-size:11px; display:inline-flex; align-items:center; gap:5px;">
                    <i class="fa-solid fa-triangle-exclamation"></i> Mất tín hiệu (${Math.floor(hbSecondsAgo / 60)} phút trước)
                  </span>`
                }

                // Violation badge
                let vioBadge = `<span style="color:#059669; font-weight:700; font-size:13px;">0</span>`
                if (vioCount > 0 && !isOver) {
                  vioBadge = `<span style="color:#d97706; background:#fef3c7; border:1px solid #fde68a; padding:2px 8px; border-radius:12px; font-weight:700; font-size:11px;">
                    ${vioCount} / ${maxViolations}
                  </span>`
                } else if (isOver) {
                  vioBadge = `<span style="color:#dc2626; background:#fee2e2; border:1px solid #fca5a5; padding:2px 8px; border-radius:12px; font-weight:800; font-size:11px; animation: pulse 1.5s infinite;">
                    <i class="fa-solid fa-triangle-exclamation"></i> ${vioCount} (Đã khóa)
                  </span>`
                }

                return `
                  <tr style="border-bottom:1px solid #f1f5f9; background:${isOver ? '#fef2f2' : '#ffffff'};">
                    <td style="padding:14px 16px; color:#64748b; font-weight:600;">${idx + 1}</td>
                    <td style="padding:14px 16px;">
                      <div style="font-weight:700; color:#0f172a;">${s.profiles?.full_name || 'Học sinh'}</div>
                      <div style="font-size:11px; color:#64748b;">@${s.profiles?.username || sid.substring(0, 8)}</div>
                    </td>
                    <td style="padding:14px 16px;">
                      <span style="font-weight:700; font-size:12px; color:${s.status === 'ACTIVE' ? '#0284c7' : '#059669'};">
                        ${s.status === 'ACTIVE' ? 'ĐANG LÀM BÀI' : (s.status === 'SUBMITTED' ? 'ĐÃ NỘP BÀI' : s.status)}
                      </span>
                    </td>
                    <td style="padding:14px 16px;">${hbBadge}</td>
                    <td style="padding:14px 16px; text-align:center;">${vioBadge}</td>
                    <td style="padding:14px 16px; text-align:right;">
                      <button class="btn-secondary view-student-logs-btn" data-student-id="${sid}" data-student-name="${s.profiles?.full_name || 'Học sinh'}" style="padding:5px 12px; font-size:12px; border-radius:6px; cursor:pointer;">
                        <i class="fa-solid fa-list-check"></i> Xem vi phạm
                      </button>
                    </td>
                  </tr>
                `
              }).join('')}
            </tbody>
          </table>
        </div>
      ` : `
        <!-- Tab Content 2: Real-time Live Logs Stream -->
        <div style="overflow-x:auto;">
          <table style="width:100%; border-collapse:collapse; font-size:13px; text-align:left;">
            <thead>
              <tr style="background:#f1f5f9; color:#475569; font-weight:700; border-bottom:1px solid #e2e8f0;">
                <th style="padding:12px 16px; width:160px;">Thời gian</th>
                <th style="padding:12px 16px;">Thí sinh</th>
                <th style="padding:12px 16px;">Hành vi ghi nhận</th>
              </tr>
            </thead>
            <tbody>
              ${filteredLogs.length === 0 ? `
                <tr>
                  <td colspan="3" style="text-align:center; padding:40px; color:#94a3b8;">
                    <i class="fa-solid fa-shield-check" style="font-size:28px; margin-bottom:8px; display:block; color:#10b981;"></i>
                    Chưa phát hiện hành vi vi phạm nào trong phòng thi này.
                  </td>
                </tr>
              ` : filteredLogs.map(l => {
                const timeStr = new Date(l.created_at).toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit', second: '2-digit' })
                const dateStr = new Date(l.created_at).toLocaleDateString('vi-VN')
                return `
                  <tr style="border-bottom:1px solid #f1f5f9;">
                    <td style="padding:12px 16px; color:#64748b; font-size:12px; font-weight:600;">
                      ${timeStr} <span style="font-size:10px; color:#94a3b8;">(${dateStr})</span>
                    </td>
                    <td style="padding:12px 16px;">
                      <span style="font-weight:700; color:#0f172a;">${l.profiles?.full_name || 'Học sinh'}</span>
                      <span style="font-size:11px; color:#64748b; margin-left:4px;">(@${l.profiles?.username || ''})</span>
                    </td>
                    <td style="padding:12px 16px;">${formatActionLabel(l.action)}</td>
                  </tr>
                `
              }).join('')}
            </tbody>
          </table>
        </div>
      `}
    </div>
  `

  bindProctoringDynamicEvents()
}

function bindProctoringDynamicEvents() {
  const autoRefreshCb = document.getElementById('proctor-auto-refresh')
  if (autoRefreshCb) {
    autoRefreshCb.onchange = (e) => {
      isAutoRefresh = e.target.checked
      setupAutoRefresh()
    }
  }

  const refreshBtn = document.getElementById('proctor-refresh-now')
  if (refreshBtn) {
    refreshBtn.onclick = () => {
      fetchProctoringData()
      showToast('Đã làm mới dữ liệu phòng thi!', 'info')
    }
  }

  const searchInput = document.getElementById('proctor-search')
  if (searchInput) {
    searchInput.oninput = (e) => {
      searchQuery = e.target.value
      renderProctoringContent()
      const newSearch = document.getElementById('proctor-search')
      if (newSearch) {
        newSearch.focus()
        newSearch.setSelectionRange(newSearch.value.length, newSearch.value.length)
      }
    }
  }

  const tabSessions = document.getElementById('tab-btn-sessions')
  if (tabSessions) {
    tabSessions.onclick = () => {
      activeTab = 'sessions'
      renderProctoringContent()
    }
  }

  const tabLogs = document.getElementById('tab-btn-logs')
  if (tabLogs) {
    tabLogs.onclick = () => {
      activeTab = 'logs'
      renderProctoringContent()
    }
  }

  // Student details modal
  document.querySelectorAll('.view-student-logs-btn').forEach(btn => {
    btn.onclick = () => {
      const sid = btn.getAttribute('data-student-id')
      const sname = btn.getAttribute('data-student-name')
      const studentLogs = logsList.filter(l => l.student_id === sid)

      const modalContent = `
        <div style="font-size:13px; color:#334155;">
          <p style="margin-bottom:16px;">Chi tiết các vi phạm được ghi nhận tự động của thí sinh <strong>${sname}</strong>:</p>
          ${studentLogs.length === 0 ? `
            <div style="text-align:center; padding:24px; color:#059669; background:#ecfdf5; border-radius:10px; border:1px solid #a7f3d0;">
              <i class="fa-solid fa-circle-check" style="font-size:24px; margin-bottom:6px;"></i>
              <div>Không có vi phạm nào! Thí sinh làm bài hoàn toàn trung thực.</div>
            </div>
          ` : `
            <div style="display:flex; flex-direction:column; gap:8px; max-height:360px; overflow-y:auto; padding-right:4px;">
              ${studentLogs.map((l, i) => `
                <div style="display:flex; justify-content:space-between; align-items:center; background:#f8fafc; border:1px solid #e2e8f0; padding:10px 14px; border-radius:8px;">
                  <div style="display:flex; align-items:center; gap:8px;">
                    <span style="font-weight:700; color:#64748b;">#${i + 1}</span>
                    ${formatActionLabel(l.action)}
                  </div>
                  <div style="font-size:11px; color:#64748b; font-weight:600;">
                    ${new Date(l.created_at).toLocaleTimeString('vi-VN')}
                  </div>
                </div>
              `).join('')}
            </div>
          `}
        </div>
      `

      openModal(`NHẬT KÝ VI PHẠM - ${sname}`, modalContent, () => true)
      const confirmBtn = document.getElementById('modal-confirm-btn')
      const cancelBtn = document.getElementById('modal-cancel-btn')
      if (confirmBtn) confirmBtn.style.display = 'none'
      if (cancelBtn) cancelBtn.textContent = 'Đóng'
    }
  })
}

function setupAutoRefresh() {
  if (proctoringInterval) clearInterval(proctoringInterval)
  if (isAutoRefresh) {
    proctoringInterval = setInterval(() => {
      if (window.location.hash.includes('exam-proctoring')) {
        fetchProctoringData(true)
      } else {
        clearInterval(proctoringInterval)
      }
    }, 5000)
  }
}

export function bindExamProctoringEvents() {
  bindSidebarEvents()
  fetchProctoringData()
  setupAutoRefresh()

  const handleHashChange = () => {
    if (proctoringInterval) clearInterval(proctoringInterval)
    window.removeEventListener('hashchange', handleHashChange)
  }
  window.addEventListener('hashchange', handleHashChange)
}
